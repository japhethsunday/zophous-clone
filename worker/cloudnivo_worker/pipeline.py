"""One clipping job, end to end: source -> transcript -> moments -> rendered 9:16 clips."""

from __future__ import annotations

import json
import logging
import os
import time
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


def transcribe(wav: str, offset: float, duration: float | None = None) -> list[Segment]:
    """Cloudflare Whisper when configured (fast, free tier), else local faster-whisper."""
    from . import cloudflare_ai

    if cloudflare_ai.enabled() and duration:
        try:
            segs_cf = cloudflare_ai.transcribe(wav, duration, offset)
            log.info("transcribed with Cloudflare Workers AI (%d segments)", len(segs_cf))
            return segs_cf
        except Exception as e:  # noqa: BLE001 - quota, network, bad response
            log.warning("Cloudflare transcription failed, using local Whisper: %s", e)
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
        segments = transcribe(wav, offset=start, duration=end - start)
        if not segments:
            raise ValueError("no_speech_found")

        # Keep every word with its timing so the editor can trim on word boundaries and
        # preview captions, and re-renders never need to transcribe again.
        tr_local = str(Path(tmp) / "transcript.json")
        save_transcript(segments, tr_local)
        upload(tr_local, f"{user_id}/{job_id}/transcript.json", "application/json")

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
            media.write_ass(c.words, c.start, ass, watermark=watermark, duration=c.duration, style="bold")
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
                "crop_x": round(cx, 4),
                "watermarked": watermark,
            })
        progress(97, "saving")
        return results


def save_transcript(segments: list[Segment], dest: str) -> None:
    words = [{"start": round(w.start, 3), "end": round(w.end, 3), "text": w.text} for s in segments for w in s.words]
    Path(dest).write_text(json.dumps({"version": 1, "words": words}), encoding="utf-8")


def load_words(path: str) -> list[Word]:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return [Word(float(w["start"]), float(w["end"]), str(w["text"])) for w in data.get("words", [])]


def render_edit(
    job: dict,
    download: Callable[[str, str], None],
    try_download: Callable[[str, str], bool],
    upload: Callable[[str, str, str], None],
    progress: Callable[[int, str], None],
) -> dict:
    """Re-render one clip with the user's edits (trim, captions, framing). Returns the new paths."""
    inp = job["input"]
    start, end = float(inp["start_seconds"]), float(inp["end_seconds"])
    if end - start < 1:
        raise ValueError("clip_too_short")
    style = str(inp.get("caption_style") or "bold")
    aspect = str(inp.get("aspect") or "9:16")
    if aspect not in media.ASPECTS:
        raise ValueError("bad_aspect")

    with tempfile.TemporaryDirectory(prefix="cn-r-") as tmp:
        src = str(Path(tmp) / "source")
        progress(10, "downloading")
        download(inp["source_path"], src)
        info = media.probe(src)
        end = min(end, info["duration"])
        if end - start < 1:
            raise ValueError("clip_too_short")

        words: list[Word] = []
        if style != "none":
            tr = str(Path(tmp) / "transcript.json")
            if inp.get("transcript_path") and try_download(inp["transcript_path"], tr):
                words = [w for w in load_words(tr) if w.end > start and w.start < end]
            elif info["has_audio"]:
                progress(25, "transcribing")
                wav = str(Path(tmp) / "audio.wav")
                media.extract_audio(src, wav, start, end)
                words = [w for s in transcribe(wav, offset=start, duration=end - start) for w in s.words]

        progress(45, "framing")
        cx = inp.get("crop_x")
        cx = float(cx) if cx is not None else media.face_center_x(src, start, end, info["width"])
        vf = media.crop_filter(info["width"], info["height"], max(0.0, min(1.0, cx)), aspect)
        ass = str(Path(tmp) / "c.ass")
        media.write_ass(words, start, ass, watermark=bool(inp.get("watermark", True)), duration=end - start,
                        style=style, aspect=aspect)
        progress(60, "rendering")
        out_mp4 = str(Path(tmp) / "clip.mp4")
        out_jpg = str(Path(tmp) / "clip.jpg")
        media.render_clip(src, out_mp4, start, end, vf, ass)
        media.thumbnail(out_mp4, out_jpg)

        # A new name per render: browsers and CDNs never show a stale cached file.
        base = f"{job['user_id']}/{inp.get('origin_job') or job['id']}/clip-{str(inp['clip_id'])[:8]}-{int(time.time())}"
        progress(90, "saving")
        upload(out_mp4, base + ".mp4", "video/mp4")
        upload(out_jpg, base + ".jpg", "image/jpeg")
        return {
            "clip_path": base + ".mp4", "thumb_path": base + ".jpg", "bytes": os.path.getsize(out_mp4),
            "start_seconds": int(round(start)), "end_seconds": int(round(end)),
            "caption_style": style, "aspect": aspect, "crop_x": round(cx, 4),
            "transcript": " ".join(w.text.strip() for w in words)[:4000] or None,
        }
