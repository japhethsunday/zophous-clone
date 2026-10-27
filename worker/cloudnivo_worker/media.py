"""FFmpeg + OpenCV helpers: probe, audio extract, face-aware 9:16 crop, captions, render."""

from __future__ import annotations

import json
import shutil
import statistics
import subprocess
from pathlib import Path

from .moments import Word

FFMPEG = shutil.which("ffmpeg") or "ffmpeg"
FFPROBE = shutil.which("ffprobe") or "ffprobe"


def run(cmd: list[str]) -> None:
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"{Path(cmd[0]).name} failed: {p.stderr[-800:]}")


def probe(path: str) -> dict:
    out = subprocess.run(
        [FFPROBE, "-v", "error", "-print_format", "json", "-show_streams", "-show_format", path],
        capture_output=True, text=True, check=True,
    ).stdout
    info = json.loads(out)
    v = next((s for s in info["streams"] if s.get("codec_type") == "video"), None)
    if not v:
        raise ValueError("no video stream")
    return {
        "duration": float(info["format"].get("duration", 0)),
        "width": int(v["width"]),
        "height": int(v["height"]),
        "has_audio": any(s.get("codec_type") == "audio" for s in info["streams"]),
    }


def extract_audio(src: str, dest: str, start: float, end: float) -> None:
    run([FFMPEG, "-y", "-ss", f"{start:.2f}", "-to", f"{end:.2f}", "-i", src,
         "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", dest])


def face_center_x(src: str, start: float, end: float, width: int, samples: int = 12) -> float:
    """Median horizontal face position (0-1) across the clip; 0.5 when no face is found.

    Never raises: a broken or missing OpenCV falls back to a centered crop.
    """
    try:
        return _face_center_x(src, start, end, samples)
    except Exception:  # noqa: BLE001
        return 0.5


def _face_center_x(src: str, start: float, end: float, samples: int) -> float:
    import cv2  # opencv-python-headless

    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    cap = cv2.VideoCapture(src)
    xs: list[float] = []
    try:
        for i in range(samples):
            t = start + (end - start) * (i + 0.5) / samples
            cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
            ok, frame = cap.read()
            if not ok:
                continue
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            scale = 480 / max(1, gray.shape[1])
            small = cv2.resize(gray, None, fx=scale, fy=scale) if scale < 1 else gray
            faces = cascade.detectMultiScale(small, scaleFactor=1.1, minNeighbors=5, minSize=(24, 24))
            if len(faces):
                x, y, w, h = max(faces, key=lambda f: f[2] * f[3])  # biggest face = speaker
                xs.append((x + w / 2) / small.shape[1])
    finally:
        cap.release()
    return statistics.median(xs) if xs else 0.5


def crop_filter(width: int, height: int, center_x: float) -> str:
    """Static 9:16 crop around center_x, then scale to 1080x1920."""
    target_w = int(height * 9 / 16) // 2 * 2
    if target_w >= width:  # already narrow: pad instead of crop
        return "scale=1080:-2,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black"
    x = int(center_x * width - target_w / 2)
    x = max(0, min(width - target_w, x)) // 2 * 2
    return f"crop={target_w}:{height}:{x}:0,scale=1080:1920"


def _ass_time(t: float) -> str:
    t = max(0.0, t)
    h = int(t // 3600)
    m = int(t % 3600 // 60)
    s = t % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def _escape(text: str) -> str:
    return text.replace("\\", "").replace("{", "(").replace("}", ")").replace("\n", " ")


def write_ass(
    words: list[Word], clip_start: float, dest: str, per_line: int = 3,
    watermark: bool = False, duration: float = 0.0,
) -> None:
    """Bold centered captions, a few words at a time, with the spoken word highlighted.

    The free-plan watermark is drawn here too (libass), so rendering needs no drawtext/fontconfig.
    """
    head = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,DejaVu Sans,78,&H00FFFFFF,&H00FFFFFF,&H00101010,&H64000000,1,0,0,0,100,100,0,0,1,6,2,2,80,80,520,1
Style: Wm,DejaVu Sans,40,&H60FFFFFF,&H60FFFFFF,&H90000000,&H00000000,1,0,0,0,100,100,2,0,1,2,0,9,40,40,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = []
    for i in range(0, len(words), per_line):
        group = words[i : i + per_line]
        for k, w in enumerate(group):
            parts = []
            for j, g in enumerate(group):
                txt = _escape(g.text.strip().upper())
                parts.append("{\\c&H00F5D04A&}" + txt + "{\\c&H00FFFFFF&}" if j == k else txt)
            start = w.start - clip_start
            end = (group[k + 1].start if k + 1 < len(group) else w.end) - clip_start
            lines.append(f"Dialogue: 0,{_ass_time(start)},{_ass_time(max(end, start + 0.05))},Cap,,0,0,0,,{' '.join(parts)}")
    if watermark and duration > 0:
        lines.append(f"Dialogue: 1,{_ass_time(0)},{_ass_time(duration)},Wm,,0,0,0,,CLOUDNIVO")
    Path(dest).write_text(head + "\n".join(lines) + "\n", encoding="utf-8")


def render_clip(src: str, dest: str, start: float, end: float, vf_crop: str, ass_path: str | None) -> None:
    filters = [vf_crop]
    if ass_path:
        safe = ass_path.replace("\\", "/").replace(":", "\\:")
        filters.append(f"subtitles='{safe}'")
    run([FFMPEG, "-y", "-ss", f"{start:.2f}", "-to", f"{end:.2f}", "-i", src,
         "-vf", ",".join(filters), "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
         "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", dest])


def thumbnail(clip_path: str, dest: str) -> None:
    run([FFMPEG, "-y", "-ss", "1.0", "-i", clip_path, "-frames:v", "1", "-vf", "scale=540:-2", "-q:v", "4", dest])
