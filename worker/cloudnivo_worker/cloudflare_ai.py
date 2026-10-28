"""Cloudflare Workers AI (free tier: 10,000 Neurons/day) for transcription, ranking and images.

Turned on by two worker secrets: CF_ACCOUNT_ID and CF_API_TOKEN (a token with "Workers AI: Read"
permission). Without them, or when a call fails or the daily allowance runs out, callers fall back
to the local models, so a Cloudflare outage never fails a job.

Approximate free capacity per day: ~210 minutes of Whisper Large V3 Turbo audio (46.6 Neurons/min).
"""

from __future__ import annotations

import base64
import json
import logging
import os
import re
import subprocess
import tempfile
from pathlib import Path

import requests

log = logging.getLogger(__name__)

ACCOUNT = os.environ.get("CF_ACCOUNT_ID", "").strip()
TOKEN = os.environ.get("CF_API_TOKEN", "").strip()
WHISPER_MODEL = os.environ.get("CF_WHISPER_MODEL", "@cf/openai/whisper-large-v3-turbo")
TEXT_MODEL = os.environ.get("CF_TEXT_MODEL", "@cf/google/gemma-4-26b-a4b-it")
IMAGE_MODELS = {
    "flux-schnell-cf": "@cf/black-forest-labs/flux-1-schnell",
    "lucid-origin-cf": "@cf/leonardo/lucid-origin",
}
CHUNK_SECONDS = 300  # 5-minute MP3 chunks keep each request small
TIMEOUT = 180


class CloudflareError(RuntimeError):
    pass


def enabled() -> bool:
    return bool(ACCOUNT and TOKEN)


def _run(model: str, payload: dict) -> dict:
    url = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/ai/run/{model}"
    r = requests.post(url, json=payload, headers={"Authorization": f"Bearer {TOKEN}"}, timeout=TIMEOUT)
    try:
        body = r.json()
    except ValueError:
        raise CloudflareError(f"http_{r.status_code}") from None
    if r.status_code != 200 or not body.get("success", False):
        errs = body.get("errors") or [{}]
        raise CloudflareError(f"http_{r.status_code}: {errs[0].get('message', 'unknown')}"[:300])
    return body.get("result") or {}


# ---------- transcription ----------

def _chunks(wav: str, tmp: str, duration: float) -> list[tuple[float, str]]:
    out = []
    t = 0.0
    i = 0
    while t < duration:
        dest = str(Path(tmp) / f"c{i}.mp3")
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-ss", f"{t:.2f}", "-t", str(CHUNK_SECONDS), "-i", wav,
                        "-ac", "1", "-ar", "16000", "-b:a", "48k", dest], check=True)
        out.append((t, dest))
        t += CHUNK_SECONDS
        i += 1
    return out


def transcribe(wav: str, duration: float, offset: float):
    """Word-timed transcript as pipeline Segments. Raises CloudflareError on any failure."""
    from .moments import Segment, Word

    segments: list[Segment] = []
    with tempfile.TemporaryDirectory(prefix="cf-") as tmp:
        for start, path in _chunks(wav, tmp, duration):
            audio = base64.b64encode(Path(path).read_bytes()).decode()
            res = _run(WHISPER_MODEL, {"audio": audio, "vad_filter": True, "condition_on_previous_text": False})
            base = offset + start
            for s in res.get("segments") or []:
                words = [Word(base + float(w["start"]), base + float(w["end"]), " " + str(w["word"]).strip())
                         for w in s.get("words") or [] if str(w.get("word", "")).strip()]
                if not words:
                    continue
                segments.append(Segment(base + float(s["start"]), base + float(s["end"]), str(s.get("text", "")).strip(), words))
    if not segments:
        raise CloudflareError("no_segments")
    return segments


# ---------- text (ranking) ----------

def chat_json(prompt: str) -> dict:
    """One prompt in, a JSON object out (the model is asked for JSON; fences are stripped)."""
    res = _run(TEXT_MODEL, {
        "messages": [
            {"role": "system", "content": "You reply with a single JSON object and nothing else."},
            {"role": "user", "content": prompt},
        ],
        "max_tokens": 4096,
        "temperature": 0.2,
    })
    text = res.get("response")
    if text is None and res.get("choices"):
        text = res["choices"][0].get("message", {}).get("content")
    if isinstance(text, dict):
        return text
    text = str(text or "")
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        raise CloudflareError("no_json")
    return json.loads(m.group(0))


# ---------- images ----------

def make_image(model_key: str, prompt: str, aspect: str, dest_dir: str) -> str:
    model = IMAGE_MODELS[model_key]
    sizes = {"9:16": (768, 1344), "16:9": (1344, 768), "1:1": (1024, 1024)}
    w, h = sizes.get(aspect, sizes["9:16"])
    payload: dict = {"prompt": prompt[:2048], "steps": 4}
    if model_key == "lucid-origin-cf":
        payload = {"prompt": prompt[:2048], "width": w, "height": h, "steps": 20}
    res = _run(model, payload)
    b64 = res.get("image")
    if not b64:
        raise CloudflareError("no_image")
    out = str(Path(dest_dir) / "image.jpg")
    Path(out).write_bytes(base64.b64decode(b64))
    if model_key == "flux-schnell-cf" and aspect != "1:1":
        # FLUX schnell on Workers AI returns a square image: crop to the requested shape.
        cropped = str(Path(dest_dir) / "image-crop.jpg")
        vf = "crop=ih*9/16:ih" if aspect == "9:16" else "crop=iw:iw*9/16"
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", out, "-vf", vf, "-q:v", "2", cropped], check=True)
        out = cropped
    return out
