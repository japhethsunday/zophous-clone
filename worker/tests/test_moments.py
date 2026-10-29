from cloudnivo_worker.moments import (
    Candidate,
    Segment,
    Word,
    build_candidates,
    fallback_title,
    heuristic_score,
    pick_non_overlapping,
)
from cloudnivo_worker.media import crop_filter


def seg(start, end, text):
    words = text.split()
    step = (end - start) / max(1, len(words))
    return Segment(start, end, text, [Word(start + i * step, start + (i + 1) * step, w) for i, w in enumerate(words)])


def test_candidates_respect_length_bounds():
    segs = [seg(i * 10, i * 10 + 10, "this is a sentence with some words in it") for i in range(12)]
    cands = build_candidates(segs, min_len=20, max_len=60)
    assert cands
    assert all(20 <= c.duration <= 60 for c in cands)


def test_heuristic_prefers_dense_hooky_speech():
    slow = heuristic_score("so um yeah", 40, 20)
    hooky = heuristic_score("Nobody tells you the secret. Why? Because it's wrong!", 40, 110)
    assert hooky > slow


def test_pick_non_overlapping():
    cs = [Candidate(0, 30, "a", [], score=90), Candidate(10, 40, "b", [], score=80), Candidate(45, 80, "c", [], score=70)]
    picked = pick_non_overlapping(cs, 3)
    assert [c.text for c in picked] == ["a", "c"]


def test_fallback_title_truncates():
    assert len(fallback_title("x" * 200)) <= 70


def test_crop_filter_bounds():
    f = crop_filter(1920, 1080, 0.99)
    w, h, x, _ = f.split(",")[0].removeprefix("crop=").split(":")
    assert int(x) + int(w) <= 1920 and int(h) == 1080
    assert crop_filter(720, 1280, 0.5).startswith("scale=")  # already vertical: pad, don't crop


def test_caption_groups_fit_the_frame():
    from cloudnivo_worker.media import caption_groups

    words = [Word(i, i + 1, w) for i, w in enumerate("brain! their intelligence is unmatched in the ocean".split())]
    groups = caption_groups(words)
    assert all(sum(len(w.text) + 1 for w in g) - 1 <= 16 or len(g) == 1 for g in groups)
    assert [w.text for g in groups for w in g] == [w.text for w in words]


# ---------------- per-format scoring (mirrors src/suite-data.ts presets) ----------------

def test_formats_mirror_suite_presets():
    from cloudnivo_worker.moments import FORMATS

    assert set(FORMATS) == {
        "podcast-punchline", "hot-take-monologue", "story-arc-clip", "listicle-cuts",
        "qa-split", "b-roll-highlight", "quote-card-clip", "countdown-teaser",
    }


def test_format_score_rewards_its_own_signal():
    from cloudnivo_worker.moments import FORMATS, format_score

    qa = FORMATS["qa-split"]
    plain = "people keep doing this thing every single day and nobody talks about it at all really"
    with_q = "Why does nobody talk about this? Because the answer will surprise you."
    n = len(with_q.split())
    assert format_score(qa, with_q, 35, n * 35 // 28) > format_score(qa, plain, 35, len(plain.split()))


def test_pinned_format_honours_its_window():
    from cloudnivo_worker.moments import FORMATS, build_candidates

    segs = [seg(i * 10, i * 10 + 10, "this is a sentence with some words in it") for i in range(12)]
    cands = build_candidates(segs, fmt=FORMATS["b-roll-highlight"])  # 10-35s window
    assert cands
    assert all(10 <= c.duration <= 35 for c in cands)
    assert all(c.format_id == "b-roll-highlight" for c in cands)


def test_best_format_tags_candidates_without_pin():
    from cloudnivo_worker.moments import build_candidates

    segs = [seg(i * 15, i * 15 + 15, "Top five mistakes? Number one will shock you badly.") for i in range(6)]
    cands = build_candidates(segs)
    assert cands
    assert all(c.format_id for c in cands)
