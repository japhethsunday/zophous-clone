"""Caption styles, aspect crops, transcript round-trip, and a real FFmpeg re-render."""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

from cloudnivo_worker import media, pipeline
from cloudnivo_worker.moments import Segment, Word


def words(n=12, start=1.0, step=0.4):
    return [Word(start + i * step, start + i * step + 0.3, f" word{i}") for i in range(n)]


def test_every_style_and_aspect_writes_valid_ass(tmp_path):
    for style in media.CAPTION_STYLES:
        for aspect, (w, h) in media.ASPECTS.items():
            dest = tmp_path / f"{style}-{aspect.replace(':', 'x')}.ass"
            media.write_ass(words(), 1.0, str(dest), style=style, aspect=aspect, watermark=True, duration=5)
            text = dest.read_text()
            assert f"PlayResX: {w}" in text and f"PlayResY: {h}" in text
            dialogue = [ln for ln in text.splitlines() if ln.startswith("Dialogue: 0")]
            if style == "none":
                assert dialogue == []
            else:
                assert dialogue, style


def test_bold_highlights_the_spoken_word_and_clean_does_not(tmp_path):
    b, c = tmp_path / "b.ass", tmp_path / "c.ass"
    media.write_ass(words(3), 1.0, str(b), style="bold")
    media.write_ass(words(3), 1.0, str(c), style="clean")
    assert "\\c&H003FD2FF&" in b.read_text()  # #FFD23F in ASS BGR order
    assert "\\c&H" not in c.read_text()
    assert "WORD0" in b.read_text() and "word0" in c.read_text()


def test_crop_filter_per_aspect():
    assert media.crop_filter(1920, 1080, 0.5, "9:16").endswith("scale=1080:1920,setsar=1")
    assert media.crop_filter(1920, 1080, 0.5, "1:1").startswith("crop=1080:1080:420:0")
    # left edge clamps to 0, right edge clamps to width - crop
    assert ":0:0," in media.crop_filter(1920, 1080, 0.0, "9:16")
    assert media.crop_filter(1920, 1080, 1.0, "9:16").startswith("crop=606:1080:1314:0")
    # a vertical source into a wide frame is padded, not cropped
    assert "pad=1920:1080" in media.crop_filter(1080, 1920, 0.5, "16:9")


def test_caption_groups_skip_blank_words():
    ws = [Word(0, 0.1, " "), Word(0.1, 0.2, " hi"), Word(0.2, 0.3, "")]
    assert [[w.text for w in g] for g in media.caption_groups(ws, 3)] == [[" hi"]]


def test_transcript_round_trip(tmp_path):
    segs = [Segment(0, 1, "hi there", [Word(0.0, 0.4, " hi"), Word(0.5, 0.9, " there")])]
    p = tmp_path / "t.json"
    pipeline.save_transcript(segs, str(p))
    assert json.loads(p.read_text())["version"] == 1
    assert [(w.start, w.text) for w in pipeline.load_words(str(p))] == [(0.0, " hi"), (0.5, " there")]


@pytest.mark.skipif(not shutil.which("ffmpeg"), reason="ffmpeg not installed")
def test_render_edit_end_to_end(tmp_path):
    src = tmp_path / "src.mp4"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=25:duration=12",
                    "-f", "lavfi", "-i", "sine=duration=12", "-shortest", "-c:v", "libx264", "-preset", "ultrafast",
                    "-c:a", "aac", str(src)], check=True)
    tr = tmp_path / "tr.json"
    pipeline.save_transcript([Segment(2, 6, "", words(8, 2.0, 0.5))], str(tr))
    uploaded = {}
    stages = []
    job = {"id": "job-1", "user_id": "u1", "input": {
        "source_path": "s", "transcript_path": "t", "clip_id": "abcdef123456", "start_seconds": 2.0, "end_seconds": 7.5,
        "caption_style": "boxed", "aspect": "1:1", "crop_x": 0.3, "watermark": False, "origin_job": "j0"}}
    out = pipeline.render_edit(
        job,
        download=lambda _p, dest: shutil.copy(src, dest),
        try_download=lambda _p, dest: bool(shutil.copy(tr, dest)),
        upload=lambda f, path, _m: uploaded.__setitem__(path, Path(f).read_bytes()),
        progress=lambda pct, st: stages.append((pct, st)),
    )
    assert out["clip_path"].startswith("u1/j0/clip-abcdef12-") and out["clip_path"] in uploaded
    assert out["aspect"] == "1:1" and out["caption_style"] == "boxed" and out["crop_x"] == 0.3
    clip = tmp_path / "out.mp4"
    clip.write_bytes(uploaded[out["clip_path"]])
    info = media.probe(str(clip))
    assert (info["width"], info["height"]) == (1080, 1080)
    assert 5.0 <= info["duration"] <= 6.0
    assert [s for _, s in stages][-1] == "saving"


def test_render_edit_rejects_tiny_range():
    job = {"id": "j", "user_id": "u", "input": {"source_path": "s", "clip_id": "c", "start_seconds": 5, "end_seconds": 5.5}}
    with pytest.raises(ValueError, match="clip_too_short"):
        pipeline.render_edit(job, lambda *_: None, lambda *_: False, lambda *_: None, lambda *_: None)
