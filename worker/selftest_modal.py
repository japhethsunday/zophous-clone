"""End-to-end self-test on Modal (not deployed; run on demand).

Makes a ~90 s spoken test video with espeak-ng (free TTS), uploads it like a user upload
for a TEST account, queues a clipping job exactly as clips-create does, then waits for the
deployed worker to finish and prints the result.

  modal run selftest_modal.py --user-id <test user uuid>
"""

import json
import subprocess
import time
import uuid

import modal

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "espeak-ng")
    .pip_install("requests==2.32.3")
    .add_local_python_source("cloudnivo_worker")
)
app = modal.App("cloudnivo-selftest", image=image)

SCRIPT = (
    "Nobody tells you the real secret about growing a channel. Here is the truth. "
    "Most creators quit in the first ninety days, and it is not because their videos are bad. "
    "It is because they never test their hooks. Why does that matter so much? "
    "Because the first three seconds decide everything. Listen carefully. "
    "If your opening line does not create a question in the viewer's mind, they scroll away. "
    "So here is what I do every single time. I write five different hooks for the same video. "
    "Then I pick the one that sounds the most surprising out loud. "
    "The biggest mistake I see is starting with a long introduction. Stop doing that. "
    "Start with the payoff, then explain how you got there. "
    "Imagine you could double your watch time with one change. That change is the hook. "
    "Now let me tell you about the second thing that actually works. Consistency beats talent. "
    "Post every day for thirty days and you will learn more than a year of planning. "
    "That is the whole system. Hooks first, payoff early, and show up every day."
)


@app.function(secrets=[modal.Secret.from_name("cloudnivo-supabase")], timeout=60 * 30)
def run(user_id: str) -> dict:
    from cloudnivo_worker.supa import Supa

    db = Supa()
    subprocess.run(["espeak-ng", "-s", "150", "-w", "/tmp/s.wav", SCRIPT], check=True)
    subprocess.run([
        "ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=30",
        "-i", "/tmp/s.wav", "-shortest", "-c:v", "libx264", "-preset", "veryfast", "-c:a", "aac", "/tmp/src.mp4",
    ], check=True)
    dur = float(subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", "/tmp/src.mp4"],
        capture_output=True, text=True, check=True).stdout)

    path = f"{user_id}/selftest-{uuid.uuid4().hex[:8]}.mp4"
    db.upload("sources", path, "/tmp/src.mp4", "video/mp4")
    asset = db.insert("assets", {"user_id": user_id, "bucket": "sources", "path": path, "mime": "video/mp4"})[0]

    minutes = max(1, int(-(-dur // 60)))
    job = db.insert("jobs", {
        "user_id": user_id, "kind": "clipping", "status": "queued", "provider": "cloudnivo-worker",
        "ref_table": "videos",
        "input": {"source_path": path, "title": "Self-test video", "start_seconds": 0, "end_seconds": dur,
                  "watermark": True, "max_clips": 6},
    })[0]
    held = db.rpc("clip_minutes_hold", {"p_user": user_id, "p_job": job["id"], "p_minutes": minutes})
    video = db.insert("videos", {
        "user_id": user_id, "title": "Self-test video", "source_type": "upload", "source_path": path,
        "mode": "clips", "status": "queued", "duration_seconds": round(dur), "job_id": job["id"],
    })[0]
    db.update("jobs", f"id=eq.{job['id']}", {"ref_id": video["id"]})

    started = time.time()
    while time.time() - started < 25 * 60:
        j = db.select("jobs", f"id=eq.{job['id']}&select=status,progress,error,output,attempts")[0]
        if j["status"] in ("succeeded", "failed"):
            break
        time.sleep(10)
    clips = db.select("clips", f"job_id=eq.{job['id']}&select=title,score,start_seconds,end_seconds,clip_path,watermarked,why_it_performed")
    return {"source_seconds": round(dur, 1), "minutes_held": minutes, "hold_ok": held, "job": j,
            "video_id": video["id"], "asset_id": asset["id"], "elapsed_s": round(time.time() - started), "clips": clips}


@app.local_entrypoint()
def main(user_id: str):
    print(json.dumps(run.remote(user_id), indent=2))
