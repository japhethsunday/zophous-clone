"""Run the Cloudnivo clipping worker on Modal (serverless; pay only while working).

- `poll` runs every minute on a tiny 1/8-CPU container: it only checks whether any clipping
  job is queued. That keeps idle cost to a few cents a month.
- When work is waiting, `poll` starts `drain` (4 CPUs, 8 GB), which processes jobs until the
  queue is empty and then exits.

Deploy (from worker/):   modal deploy modal_app.py
Secret `cloudnivo-supabase` (created in the Modal dashboard, never in git):
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
"""

import modal

WHISPER_MODEL = "small"

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "fonts-dejavu-core", "libgl1", "libglib2.0-0")
    .pip_install_from_requirements("requirements.txt")
    .pip_install_from_requirements("requirements-extra.txt")
    .env({"WHISPER_MODEL": WHISPER_MODEL, "OLLAMA_URL": "http://127.0.0.1:1", "WORKER_ID": "modal", "WORKER_KINDS": "clipping,clip_render"})
    # Bake the speech model into the image so each run starts fast.
    .run_commands(f"python -c \"from faster_whisper import WhisperModel; WhisperModel('{WHISPER_MODEL}', device='cpu', compute_type='int8')\"")
    .add_local_python_source("cloudnivo_worker")
)

app = modal.App("cloudnivo-worker", image=image)
secret = modal.Secret.from_name("cloudnivo-supabase")


@app.function(secrets=[secret], cpu=4.0, memory=8192, timeout=60 * 60, max_containers=2)
def drain() -> int:
    from cloudnivo_worker.main import drain as run

    return run(max_seconds=55 * 60)


@app.function(secrets=[secret], cpu=0.125, memory=256, timeout=60, schedule=modal.Period(minutes=1))
def poll() -> int:
    """Cheap check; start the heavy worker only when there is something to do."""
    from cloudnivo_worker.supa import Supa

    rows = Supa(timeout=15).select(
        "jobs",
        "select=id&kind=eq.clipping&status=eq.queued&next_poll_at=lte.now()&limit=2",
    )
    for _ in rows[:2]:  # at most 2 workers in parallel (max_containers)
        drain.spawn()
    return len(rows)
