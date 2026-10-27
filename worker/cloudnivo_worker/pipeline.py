"""One clipping job, end to end: source -> transcript -> moments -> rendered 9:16 clips."""

from __future__ import annotations

import logging
import os
import tempfile
from pathlib import Path
from typing import Callable

from . import media
from .llm import rank_with_llm
from .moments import Candidate, Segment, Word, build_candidates, fallback_title, pick_non_overlapping

log = logging.getLogger(__name__)

WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "small")
_whisper = None


def _model():
    global _whisper
    if _whisper is None:
        from faster_whisper import WhisperModel

        _whisper = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
    return _whisper


def transcribe(wav: str, offset: float) -> list[Segment]:
    segs, _info = _model().transcribe(wav, word_timestamps=True, vad_filter=True, beam_size=1)
    out: list[Segment] = []
    for s in segs:
        words = [Word(w.start + offset, w.end + offset, w.word) for w in (s.words or [])]
        out.append(Segment(s.start + offset, s.end + offset, s.text, words))
    return out


def process(
    job: dict,
    download: Callable[[str, str], None],
    upload: Callable[[str, str, str], None],
    progress: Callable[[int, str], None],
) -> list[dict]:
    """Returns clip records (paths relative to the outputs bucket). Raises on failure."""
    inp = job["input"]
    user_id, job_id = job["user_id"], job["id"]
    max_clips = int(inp.get("max_clips", 6))
    watermark = bool(inp.get("watermark", True))

    with tempfile.TemporaryDirectory(prefix="cn-") as tmp:
        src = str(Path(tmp) / "source")
        progress(5, "downloading")
        download(inp["source_path"], src)

        info = media.probe(src)
        start = max(0.0, float(inp.get("start_seconds", 0)))
        end = min(info["duration"], float(inp.get("end_seconds", info["duration"])))
        if end - start < 20:
            raise ValueError("video_too_short")
        if not info["has_audio"]:
            raise ValueError("no_audio_track")

        progress(12, "transcribing")
        wav = str(Path(tmp) / "audio.wav")
        media.extract_audio(src, wav, start, end)
        segments = transcribe(wav, offset=start)
        if not segments:
            raise ValueError("no_speech_found")

        progress(45, "finding moments")
        cands = build_candidates(segments)
        if not cands:  # very short source: use it whole
            words = [w for s in segments for w in s.words]
            cands = [Candidate(segments[0].start, segments[-1].end, " ".join(s.text for s in segments), words)]
        # Let the model judge the strongest ~24 heuristic candidates.
        shortlist = sorted(cands, key=lambda c: c.score, reverse=True)[:24]
        rank_with_llm(shortlist)
        chosen = pick_non_overlapping(shortlist, max_clips)

        results: list[dict] = []
        for i, c in enumerate(chosen):
            progress(55 + int(40 * i / max(1, len(chosen))), f"rendering clip {i + 1} of {len(chosen)}")
            cx = media.face_center_x(src, c.start, c.end, info["width"])
            vf = media.crop_filter(info["width"], info["height"], cx)
            ass = str(Path(tmp) / f"c{i}.ass")
            media.write_ass(c.words, c.start, ass, watermark=watermark, duration=c.duration)
            out_mp4 = str(Path(tmp) / f"clip-{i + 1}.mp4")
            out_jpg = str(Path(tmp) / f"clip-{i + 1}.jpg")
            media.render_clip(src, out_mp4, c.start, c.end, vf, ass)
            media.thumbnail(out_mp4, out_jpg)

            base = f"{user_id}/{job_id}/clip-{i + 1}"
            upload(out_mp4, base + ".mp4", "video/mp4")
            upload(out_jpg, base + ".jpg", "image/jpeg")
            results.append({
                "clip_path": base + ".mp4",
                "thumb_path": base + ".jpg",
                "bytes": os.path.getsize(out_mp4),
                "start_seconds": int(round(c.start)),
                "end_seconds": int(round(c.end)),
                "score": int(round(c.score)),
                "title": c.title or fallback_title(c.text),
                "hook": c.hook or None,
                "tone": c.tone or None,
                "why_it_performed": c.reason or None,
                "transcript": c.text[:4000],
                "watermarked": watermark,
            })
        progress(97, "saving")
        return results
