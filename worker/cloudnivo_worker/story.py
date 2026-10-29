"""Free "story video": topic -> script (Ollama) -> voiceover (Kokoro) -> scene images (FLUX)
-> captioned, gently animated video (FFmpeg). Every model is open source.

Kokoro-82M via kokoro-onnx (MIT code, Apache-2.0 weights), int8 model ~114 MB, runs on CPU.
"""

from __future__ import annotations

import json
import logging
import os
import re
import wave
from pathlib import Path
from typing import Callable

import requests

from . import media
from .generate import QuotaError, make_image
from .moments import Word

# Aurora-style colour pairs for scenes rendered without the free GPU.
_PALETTES = [("0x5b3df5", "0x22a6d8"), ("0x0e1020", "0x5b3df5"), ("0x7c4dff", "0x0891b2"), ("0x3f22c9", "0xd9468f")]


def gradient_still(dest: str, w: int, h: int, idx: int) -> None:
    a, b = _PALETTES[idx % len(_PALETTES)]
    media.run([media.FFMPEG, "-y", "-f", "lavfi", "-i",
               f"gradients=s={w}x{h}:c0={a}:c1={b}:x0=0:y0=0:x1={w}:y1={h}:nb_colors=2:d=1",
               "-frames:v", "1", dest])

log = logging.getLogger(__name__)

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://ollama:11434").rstrip("/")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5:1.5b")
KOKORO_DIR = Path(os.environ.get("KOKORO_DIR", "/app/models/kokoro"))
VOICES = {"warm": "af_heart", "calm": "af_bella", "deep": "am_michael", "bright": "af_nicole", "british": "bf_emma"}
SIZES = {"9:16": (1080, 1920), "16:9": (1920, 1080), "1:1": (1080, 1080)}

SCRIPT_PROMPT = """Write a short narrated video script about: "{topic}".
Tone: {tone}. Total narration about {seconds} seconds (~{words} words).
Split it into {n} scenes. The first scene must open with a strong hook.
Reply with JSON only:
{{"title":"<max 70 chars>","scenes":[{{"narration":"<1-3 sentences spoken aloud>","visual":"<one detailed image prompt, no text in image>"}}]}}"""


def write_script(topic: str, tone: str, seconds: int) -> dict:
    n = max(3, min(10, round(seconds / 10)))
    prompt = SCRIPT_PROMPT.format(topic=topic, tone=tone, seconds=seconds, words=int(seconds * 2.4), n=n)
    from . import omniroute
    data = None
    if omniroute.enabled():
        try:
            data = omniroute.chat_json(prompt, temperature=0.8)
        except Exception:  # noqa: BLE001
            data = None
    if data is None:
        data = _ollama_script(prompt)
    return _clean_script(data, topic)


def _ollama_script(prompt: str) -> dict:
    r = requests.post(
        f"{OLLAMA_URL}/api/generate",
        json={"model": OLLAMA_MODEL, "prompt": prompt, "format": "json", "stream": False,
              "options": {"temperature": 0.7, "num_ctx": 4096}},
        timeout=600,
    )
    r.raise_for_status()
    return json.loads(r.json().get("response", "{}"))


def _clean_script(data: dict, topic: str) -> dict:
    scenes = [s for s in data.get("scenes", []) if str(s.get("narration", "")).strip()]
    if not scenes:
        raise ValueError("script_generation_failed")
    for s in scenes:
        s["narration"] = re.sub(r"\s+", " ", str(s["narration"])).strip()[:600]
        s["visual"] = str(s.get("visual") or s["narration"])[:400]
    return {"title": str(data.get("title") or topic)[:80], "scenes": scenes[:10]}


_kokoro = None


def _tts():
    global _kokoro
    if _kokoro is None:
        from kokoro_onnx import Kokoro

        _kokoro = Kokoro(str(KOKORO_DIR / "kokoro-v1.0.int8.onnx"), str(KOKORO_DIR / "voices-v1.0.bin"))
    return _kokoro


def speak(text: str, voice: str, dest: str) -> float:
    """Write a WAV and return its duration in seconds."""
    import numpy as np

    samples, rate = _tts().create(text, voice=VOICES.get(voice, voice), speed=1.0, lang="en-us")
    pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2").tobytes()
    with wave.open(dest, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)
    return len(samples) / rate


def _words_over(text: str, start: float, dur: float) -> list[Word]:
    """Spread words across the scene, weighted by length (close enough for captions)."""
    toks = text.split()
    total = sum(len(t) + 1 for t in toks) or 1
    out, t = [], start
    for tok in toks:
        d = dur * (len(tok) + 1) / total
        out.append(Word(t, t + d, tok))
        t += d
    return out


def make_story(inp: dict, tmp: str, progress: Callable[[int, str], None]) -> tuple[str, str, dict]:
    """Returns (video_path, thumbnail_path, info)."""
    topic = inp["prompt"]
    aspect = inp.get("aspect", "9:16")
    seconds = int(max(20, min(120, float(inp.get("durationSeconds") or 45))))
    voice = inp.get("voice", "warm")
    W, H = SIZES.get(aspect, SIZES["9:16"])

    progress(10, "writing script")
    script = write_script(topic, inp.get("tone", "engaging, clear"), seconds)

    clips, words, t = [], [], 0.0
    n = len(script["scenes"])
    for i, sc in enumerate(script["scenes"]):
        progress(20 + int(55 * i / n), f"scene {i + 1} of {n}")
        wav = str(Path(tmp) / f"s{i}.wav")
        dur = speak(sc["narration"], voice, wav)
        try:
            img = make_image(sc["visual"] + ", cinematic, high detail", aspect, tmp)
            img_fixed = str(Path(tmp) / f"s{i}{Path(img).suffix}")
            os.replace(img, img_fixed)
        except QuotaError:
            # Free GPU quota used up for today: use a CPU-made brand gradient so the story still finishes.
            img_fixed = str(Path(tmp) / f"s{i}.png")
            gradient_still(img_fixed, W, H, i)
        seg = str(Path(tmp) / f"s{i}.mp4")
        frames = max(1, int(dur * 30))
        # Slow Ken Burns zoom so stills feel alive.
        zoom = (f"scale={W * 2}:{H * 2},zoompan=z='min(zoom+0.0006,1.12)':x='iw/2-(iw/zoom/2)':"
                f"y='ih/2-(ih/zoom/2)':d={frames}:s={W}x{H}:fps=30")
        media.run([media.FFMPEG, "-y", "-loop", "1", "-i", img_fixed, "-i", wav, "-vf", zoom,
                   "-t", f"{dur:.2f}", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
                   "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", seg])
        clips.append(seg)
        words.extend(_words_over(sc["narration"], t, dur))
        t += dur

    progress(80, "rendering")
    lst = Path(tmp) / "list.txt"
    lst.write_text("".join(f"file '{Path(c).name}'\n" for c in clips), encoding="utf-8")
    joined = str(Path(tmp) / "joined.mp4")
    media.run([media.FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", joined])
    ass = str(Path(tmp) / "captions.ass")
    media.write_ass(words, 0.0, ass, watermark=bool(inp.get("watermark")), duration=t)
    out = str(Path(tmp) / "story.mp4")
    media.render_clip(joined, out, 0.0, t, "null", ass)
    thumb = str(Path(tmp) / "story.jpg")
    media.thumbnail(out, thumb)
    return out, thumb, {"title": script["title"], "scenes": n, "seconds": round(t, 1)}
