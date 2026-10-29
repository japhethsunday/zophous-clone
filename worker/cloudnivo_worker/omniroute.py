"""OmniRoute: the AI gateway running on this PC (OpenAI-compatible API).

Gives the worker strong text models (scripts, clip ranking) and extra image
models. Set OMNIROUTE_URL and OMNIROUTE_API_KEY in worker/.env. When OmniRoute
is off or a call fails, callers fall back to Cloudflare, Hugging Face or Ollama.
"""
from __future__ import annotations

import base64
import json
import logging
import os
import re
from pathlib import Path

import requests

log = logging.getLogger(__name__)

URL = os.environ.get("OMNIROUTE_URL", "http://host.docker.internal:20128/v1").rstrip("/")
KEY = os.environ.get("OMNIROUTE_API_KEY", "").strip()
# Tried in order. Antigravity models report $0 cost in OmniRoute.
TEXT_MODELS = [m.strip() for m in os.environ.get(
    "OMNIROUTE_TEXT_MODELS", "agy/gemini-2.5-flash,agy/gemini-2.5-flash-lite,agy/gemini-3.1-flash-lite").split(",") if m.strip()]

IMAGE_MODELS = {
    "gemini-image-or": "antigravity/gemini-3.1-flash-image",
}
SIZES = {"9:16": "768x1344", "16:9": "1344x768", "1:1": "1024x1024"}


def enabled() -> bool:
    return bool(KEY)


def _headers() -> dict:
    return {"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}


def _parse_json(text: str) -> dict:
    text = text.strip()
    m = re.search(r"\{.*\}", text, re.S)  # models sometimes wrap JSON in prose or fences
    return json.loads(m.group(0) if m else text)


def chat_json(prompt: str, temperature: float = 0.4, timeout: int = 90) -> dict:
    """Ask for a JSON object. Tries each text model until one answers with valid JSON."""
    last: Exception | None = None
    for model in TEXT_MODELS:
        try:
            r = requests.post(f"{URL}/chat/completions", headers=_headers(), timeout=timeout, json={
                "model": model,
                "stream": False,
                "temperature": temperature,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": "Reply with one valid JSON object only. No markdown."},
                    {"role": "user", "content": prompt},
                ],
            })
            r.raise_for_status()
            content = r.json()["choices"][0]["message"]["content"]
            data = _parse_json(content)
            log.info("omniroute text via %s", model)
            return data
        except Exception as e:  # noqa: BLE001
            last = e
            log.warning("omniroute %s failed: %s", model, str(e)[:200])
    raise RuntimeError(f"omniroute_text_failed: {last}")


def make_image(model_key: str, prompt: str, aspect: str, dest_dir: str, timeout: int = 180) -> str:
    model = IMAGE_MODELS[model_key]
    body = {"model": model, "prompt": prompt, "n": 1, "size": SIZES.get(aspect, SIZES["9:16"]),
            "aspect_ratio": aspect}
    r = requests.post(f"{URL}/images/generations", headers=_headers(), json=body, timeout=timeout)
    if not r.ok:
        raise RuntimeError(f"omniroute_image_{r.status_code}: {r.text[:200]}")
    item = r.json()["data"][0]
    if item.get("b64_json"):
        raw = base64.b64decode(item["b64_json"])
    else:
        raw = requests.get(item["url"], timeout=120).content
    ext = ".png" if raw[:4] == b"\x89PNG" else ".jpg"
    out = str(Path(dest_dir) / f"image{ext}")
    Path(out).write_bytes(raw)
    return out
