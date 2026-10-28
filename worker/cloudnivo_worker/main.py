"""Worker loop: claim a clipping job, run it, save results, settle or release minutes."""

from __future__ import annotations

import logging
import os
import signal
import socket
import time
from datetime import datetime, timedelta, timezone

from .health import STATE, serve_in_background
from .pipeline import process
from .supa import Supa

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("cloudnivo-worker")

WORKER_ID = os.environ.get("WORKER_ID") or socket.gethostname()
IDLE_SLEEP = float(os.environ.get("IDLE_SLEEP", "5"))
# Which job kinds this worker takes. The PC worker does both; Modal only clips.
WORKER_KINDS = [k.strip() for k in os.environ.get("WORKER_KINDS", "clipping,generation").split(",") if k.strip()]
MAX_ATTEMPTS = int(os.environ.get("MAX_ATTEMPTS", "5"))
PERMANENT = {"video_too_short", "no_audio_track", "no_speech_found", "no video stream"}

_stop = False


def _handle_stop(*_):
    global _stop
    _stop = True
    log.info("stopping after the current job")


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def run_generation_job(db: Supa, job: dict) -> None:
    """Free image/video generation (open models on Hugging Face ZeroGPU)."""
    import tempfile

    from .generate import QuotaError, make_image, make_video

    jid, gid, uid = job["id"], job.get("ref_id"), job["user_id"]
    inp = job["input"]
    log.info("generation job %s claimed (%s, attempt %s)", jid, inp.get("model"), job.get("attempts"))
    db.update("generations", f"id=eq.{gid}", {"status": "processing"})
    db.update("jobs", f"id=eq.{jid}", {"progress": 10, "output": {"stage": "generating"}})
    extra: dict = {}
    try:
        with tempfile.TemporaryDirectory(prefix="cn-gen-") as tmp:
            if inp.get("model") == "story-free":
                from .story import make_story

                def progress(pct: int, stage: str) -> None:
                    db.update("jobs", f"id=eq.{jid}", {"progress": pct, "output": {"stage": stage}})

                path, thumb, info = make_story(inp, tmp, progress)
                name, mime = "story.mp4", "video/mp4"
                db.upload("outputs", f"{uid}/{jid}/story.jpg", thumb, "image/jpeg")
                extra = {"meta": {"description": info["title"], "scenes": info["scenes"], "seconds": info["seconds"]}}
            elif inp.get("kind") == "image":
                path = make_image(inp["prompt"], inp.get("aspect", "9:16"), tmp)
                name, mime = "image" + os.path.splitext(path)[1], "image/webp" if path.endswith(".webp") else "image/png"
            else:
                db.update("jobs", f"id=eq.{jid}", {"progress": 30, "output": {"stage": "animating"}})
                path, _still = make_video(inp["prompt"], inp.get("aspect", "9:16"), inp.get("durationSeconds") or 3.5, tmp)
                name, mime = "video.mp4", "video/mp4"
            key = f"{uid}/{jid}/{name}"
            db.upload("outputs", key, path, mime)
            db.insert("assets", {"user_id": uid, "bucket": "outputs", "path": key, "mime": mime,
                                 "bytes": os.path.getsize(path), "origin_job_id": jid}, upsert_on="bucket,path")
    except Exception as e:  # noqa: BLE001
        msg = str(e)[:500]
        quota = isinstance(e, QuotaError)
        retry = int(job.get("attempts", 1)) < MAX_ATTEMPTS
        log.exception("generation job %s failed (%s)", jid, "will retry" if retry else "final")
        if retry:
            wait = 20 if quota else 2  # minutes; free GPU quota refills over time
            db.update("jobs", f"id=eq.{jid}", {
                "status": "queued", "error": msg,
                "next_poll_at": (datetime.now(timezone.utc) + timedelta(minutes=wait)).isoformat(),
            })
            retry_at = (datetime.now(timezone.utc) + timedelta(minutes=wait)).isoformat()
            db.update("generations", f"id=eq.{gid}", {
                "status": "queued",
                "meta": {"wait": "gpu_quota" if quota else "retry", "retry_at": retry_at, "attempt": int(job.get("attempts", 1))},
            })
            return
        db.update("jobs", f"id=eq.{jid}", {"status": "failed", "error": msg, "completed_at": now()})
        db.update("generations", f"id=eq.{gid}", {"status": "failed", "error": msg, "completed_at": now()})
        db.rpc("credit_release", {"p_job": jid})
        return

    db.update("jobs", f"id=eq.{jid}", {"status": "succeeded", "progress": 100, "completed_at": now(),
                                       "output": {"stage": "done", "path": key}})
    db.update("generations", f"id=eq.{gid}", {"status": "ready", "result_path": key, "completed_at": now(), **extra})
    db.rpc("credit_settle", {"p_job": jid, "p_actual": job.get("cost_quoted", 0)})
    log.info("generation job %s done", jid)


def run_job(db: Supa, job: dict) -> None:
    if job.get("kind") == "generation":
        run_generation_job(db, job)
        return
    jid, vid = job["id"], job.get("ref_id")
    log.info("job %s claimed (attempt %s)", jid, job.get("attempts"))

    def progress(pct: int, stage: str) -> None:
        db.update("jobs", f"id=eq.{jid}", {"progress": pct, "output": {"stage": stage}})
        if vid:
            db.update("videos", f"id=eq.{vid}", {"progress": pct, "status": "analyzing"})

    try:
        clips = process(
            job,
            download=lambda path, dest: db.download("sources", path, dest),
            upload=lambda file, path, mime: db.upload("outputs", path, file, mime),
            progress=progress,
        )
    except Exception as e:  # noqa: BLE001 - every failure must be recorded
        msg = str(e)[:500]
        retry = msg not in PERMANENT and int(job.get("attempts", 1)) < MAX_ATTEMPTS
        log.exception("job %s failed (%s)", jid, "will retry" if retry else "final")
        if retry:
            db.update("jobs", f"id=eq.{jid}", {
                "status": "queued", "error": msg,
                "next_poll_at": (datetime.now(timezone.utc) + timedelta(minutes=2)).isoformat(),
            })
            return
        db.update("jobs", f"id=eq.{jid}", {"status": "failed", "error": msg, "completed_at": now()})
        if vid:
            db.update("videos", f"id=eq.{vid}", {"status": "failed", "error": msg})
        db.rpc("clip_minutes_release", {"p_job": jid})
        return

    rows = []
    for c in clips:
        rows.append({
            "video_id": vid, "user_id": job["user_id"], "job_id": jid,
            "title": c["title"], "hook": c["hook"], "tone": c["tone"],
            "why_it_performed": c["why_it_performed"], "score": c["score"],
            "start_seconds": c["start_seconds"], "end_seconds": c["end_seconds"],
            "caption_style": "bold", "watermarked": c["watermarked"],
            "clip_path": c["clip_path"], "thumb_path": c["thumb_path"], "transcript": c["transcript"],
        })
    if rows:
        db.insert("clips", rows)
        db.insert("assets", [
            {"user_id": job["user_id"], "bucket": "outputs", "path": c["clip_path"], "mime": "video/mp4",
             "bytes": c["bytes"], "origin_job_id": jid}
            for c in clips
        ], upsert_on="bucket,path")

    db.update("jobs", f"id=eq.{jid}", {
        "status": "succeeded", "progress": 100, "completed_at": now(),
        "output": {"stage": "done", "clips": len(rows)},
    })
    if vid:
        db.update("videos", f"id=eq.{vid}", {"status": "ready", "progress": 100})
    db.rpc("clip_minutes_settle", {"p_job": jid})
    log.info("job %s done: %d clips", jid, len(rows))


def drain(max_seconds: float = 3300) -> int:
    """Process queued jobs until the queue is empty or time runs out. Used by serverless hosts (Modal)."""
    db = Supa()
    deadline = time.monotonic() + max_seconds
    done = 0
    while time.monotonic() < deadline:
        jobs = db.rpc("claim_job", {"p_worker": WORKER_ID, "p_kinds": WORKER_KINDS}) or []
        if not jobs:
            break
        try:
            run_job(db, jobs[0])
        except Exception:  # noqa: BLE001
            log.exception("job bookkeeping failed; it will be re-queued after 30 minutes")
        done += 1
    return done


def main() -> None:
    signal.signal(signal.SIGTERM, _handle_stop)
    signal.signal(signal.SIGINT, _handle_stop)
    db = Supa()
    if os.environ.get("PORT"):
        serve_in_background(int(os.environ["PORT"]))
    log.info("worker %s started", WORKER_ID)
    while not _stop:
        try:
            jobs = db.rpc("claim_job", {"p_worker": WORKER_ID, "p_kinds": WORKER_KINDS}) or []
        except Exception:  # noqa: BLE001
            log.exception("claim failed; retrying")
            time.sleep(IDLE_SLEEP * 3)
            continue
        if not jobs:
            time.sleep(IDLE_SLEEP)
            continue
        STATE["busy"] = True
        try:
            run_job(db, jobs[0])
            STATE["jobs_done"] += 1
        except Exception:  # noqa: BLE001 - e.g. Supabase briefly unreachable while saving
            STATE["jobs_failed"] += 1
            log.exception("job bookkeeping failed; it will be re-queued after 30 minutes")
        finally:
            STATE["busy"] = False
            STATE["last_job_at"] = now()


if __name__ == "__main__":
    main()
