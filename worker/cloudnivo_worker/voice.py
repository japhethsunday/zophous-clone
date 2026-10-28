"""Voiceover: text -> speech with Kokoro-82M (runs on the worker CPU, no GPU quota).

Long text is split into sentence chunks, spoken one by one and joined with short
pauses, then encoded to MP3 with FFmpeg.
"""
from __future__ import annotations

import re
import subprocess
import wave

import numpy as np

from .story import _tts

# First letter of a Kokoro voice id is its language.
LANGS = {"a": "en-us", "b": "en-gb", "e": "es", "f": "fr-fr", "h": "hi", "i": "it", "p": "pt-br"}
MAX_CHUNK = 380  # characters; keeps each Kokoro call under its token limit
PAUSE_S = 0.18


def _chunks(text: str) -> list[str]:
    text = re.sub(r"[ \t]+", " ", text.strip())
    parts: list[str] = []
    for para in [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]:
        buf = ""
        for sent in re.split(r"(?<=[.!?…])\s+", para.replace("\n", " ")):
            while len(sent) > MAX_CHUNK:  # very long sentence: cut at a comma or space
                cut = max(sent.rfind(",", 0, MAX_CHUNK), sent.rfind(" ", 0, MAX_CHUNK))
                cut = cut if cut > 50 else MAX_CHUNK
                if buf:
                    parts.append(buf)
                    buf = ""
                parts.append(sent[:cut + 1].strip())
                sent = sent[cut + 1:].strip()
            if len(buf) + len(sent) + 1 > MAX_CHUNK and buf:
                parts.append(buf)
                buf = sent
            else:
                buf = f"{buf} {sent}".strip()
        if buf:
            parts.append(buf + "\n")  # paragraph end gets a longer pause
    return [p for p in parts if p.strip()]


def make_voice(text: str, voice: str, speed: float, dest_dir: str, progress=None) -> tuple[str, float]:
    """Return (mp3 path, seconds)."""
    lang = LANGS.get(voice[:1], "en-us")
    chunks = _chunks(text)
    if not chunks:
        raise ValueError("empty_text")
    audio: list[np.ndarray] = []
    rate = 24000
    for i, chunk in enumerate(chunks):
        samples, rate = _tts().create(chunk.strip(), voice=voice, speed=float(speed), lang=lang)
        audio.append(np.asarray(samples, dtype=np.float32))
        pause = PAUSE_S * (2.5 if chunk.endswith("\n") else 1)
        audio.append(np.zeros(int(rate * pause), dtype=np.float32))
        if progress:
            progress(10 + int(80 * (i + 1) / len(chunks)))
    pcm = (np.clip(np.concatenate(audio), -1, 1) * 32767).astype("<i2")
    wav_path, mp3_path = f"{dest_dir}/voice.wav", f"{dest_dir}/voice.mp3"
    with wave.open(wav_path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm.tobytes())
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav_path, "-codec:a", "libmp3lame", "-b:a", "128k", mp3_path],
                   check=True)
    return mp3_path, len(pcm) / rate
