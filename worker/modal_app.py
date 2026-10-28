"""Run the Cloudnivo clipping worker on Modal (serverless; pay only while working).

- `drain` runs every minute: it claims queued clipping jobs and processes them, then exits.
  An idle check takes a few seconds, so idle cost stays tiny.
- `kick` is a web endpoint the app can call to start processing right away (no 1-minute wait).

Deploy (from worker/):   modal deploy modal_app.py
Secret (once, in your own terminal, never in git):
  modal secret create cloudnivo-supabase SUPABASE_URL=https://gapzawavgmsnfuekqudo.supabase.co SUPABASE_SERVICE_ROLE_KEY=<key>
"""

import modal

WHISPER_MODEL = "small"

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "fonts-dejavu-core", "libgl1", "libglib2.0-0")
    .pip_install_from_requirements("requirements.txt")
    .env({"WHISPER_MODEL": WHISPER_MODEL, "OLLAMA_URL": "http://127.0.0.1:1", "WORKER_ID": "modal"})
    # Bake the speech model into the image so each run starts fast.
    .run_commands(f"python -c \"from faster_whisper import WhisperModel; WhisperModel('{WHISPER_MODEL}', device='cpu', compute_type='int8')\"")
    .add_local_python_source("cloudnivo_worker")
)

app = modal.App("cloudnivo-worker", image=image)
secret = modal.Secret.from_name("cloudnivo-supabase")


@app.function(
    secrets=[secret],
    cpu=4.0,
    memory=8192,
    timeout=60 * 60,
    max_containers=2,
    schedule=modal.Period(minutes=1),
)
def drain() -> int:
    from cloudnivo_worker.main import drain as run

    return run(max_seconds=55 * 60)


@app.function(secrets=[secret], cpu=0.25, memory=256)
@modal.fastapi_endpoint(method="POST")
def kick() -> dict:
    """Start a drain now. Safe to call often: extra runs find no job and exit."""
    drain.spawn()
    return {"ok": True}
