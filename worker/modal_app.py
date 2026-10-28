"""Run the Cloudnivo worker on Modal (serverless; pay only while working). Handles every job kind:
clipping, clip re-renders and generation (images, short videos, story videos).

- `poll` runs every minute on a tiny 1/8-CPU container: it only checks whether any clipping
  job is queued (any kind). That keeps idle cost to a few cents a month.
- When work is waiting, `poll` starts `drain` (4 CPUs, 8 GB), which processes jobs until the
  queue is empty and then exits.

Deploy (from worker/):   modal deploy modal_app.py
Secrets (Modal dashboard or `modal secret create`, never in git):
  cloudnivo-supabase: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
  cloudnivo-ai (optional): CF_ACCOUNT_ID, CF_API_TOKEN (Cloudflare Workers AI), HF_TOKEN (ZeroGPU quota)
"""

import modal

WHISPER_MODEL = "small"
KINDS = ("clipping", "clip_render", "generation")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "fonts-dejavu-core", "libgl1", "libglib2.0-0")
    .pip_install_from_requirements("requirements.txt")
    .pip_install_from_requirements("requirements-extra.txt")
    .env({"WHISPER_MODEL": WHISPER_MODEL, "OLLAMA_URL": "http://127.0.0.1:1", "WORKER_ID": "modal",
          "WORKER_KINDS": ",".join(KINDS), "KOKORO_DIR": "/models/kokoro"})
    # Bake the speech model into the image so each run starts fast.
    .run_commands(f"python -c \"from faster_whisper import WhisperModel; WhisperModel('{WHISPER_MODEL}', device='cpu', compute_type='int8')\"")
    # Kokoro voiceover for story videos (Apache-2.0 weights).
    .run_commands("mkdir -p /models/kokoro && cd /models/kokoro && python -c \"import urllib.request as u; "
                  "b='https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/'; "
                  "[u.urlretrieve(b+f, f) for f in ('kokoro-v1.0.int8.onnx', 'voices-v1.0.bin')]\"")
    .add_local_python_source("cloudnivo_worker")
)

app = modal.App("cloudnivo-worker", image=image)
secrets = [modal.Secret.from_name("cloudnivo-supabase"), modal.Secret.from_name("cloudnivo-ai", required_keys=[])]


@app.function(secrets=secrets, cpu=4.0, memory=8192, timeout=60 * 60, max_containers=2)
def drain() -> int:
    from cloudnivo_worker.main import drain as run

    return run(max_seconds=55 * 60)


@app.function(secrets=secrets, cpu=0.125, memory=256, timeout=60, schedule=modal.Period(minutes=1))
def poll() -> int:
    """Cheap check; start the heavy worker only when there is something to do."""
    from datetime import datetime, timezone

    from cloudnivo_worker.supa import Supa

    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    rows = Supa(timeout=15).select(
        "jobs",
        f"select=id&kind=in.({','.join(KINDS)})&status=eq.queued"
        f"&provider=in.(cloudnivo-worker,hf-zerogpu)&or=(next_poll_at.is.null,next_poll_at.lte.{now})&limit=2",
    )
    for _ in rows[:2]:  # at most 2 workers in parallel (max_containers)
        drain.spawn()
    return len(rows)
