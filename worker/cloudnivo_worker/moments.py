"""Find and rank clip-worthy moments from a word-timed transcript.

Pure Python (no model calls) so it is unit-testable. LLM ranking lives in llm.py
and only re-orders/annotates the candidates produced here.
"""

from __future__ import annotations

from dataclasses import dataclass, field

HOOK_WORDS = {
    "secret", "never", "always", "mistake", "truth", "why", "how", "nobody", "everyone",
    "crazy", "insane", "wrong", "best", "worst", "biggest", "first", "last", "stop",
    "money", "free", "actually", "really", "imagine", "listen", "wait", "seriously",
}


@dataclass
class Word:
    start: float
    end: float
    text: str


@dataclass
class Segment:
    start: float
    end: float
    text: str
    words: list[Word] = field(default_factory=list)


@dataclass
class Candidate:
    start: float
    end: float
    text: str
    words: list[Word]
    score: float = 0.0
    title: str = ""
    hook: str = ""
    reason: str = ""
    tone: str = ""

    @property
    def duration(self) -> float:
        return self.end - self.start


def heuristic_score(text: str, duration: float, n_words: int) -> float:
    """0-100. Rewards dense speech, questions/exclamations, and strong hook words early."""
    if duration <= 0:
        return 0.0
    wps = n_words / duration
    density = max(0.0, min(1.0, (wps - 1.2) / 2.0))           # ~1.2-3.2 words/sec
    lower = text.lower()
    first = " ".join(lower.split()[:20])
    hooks = sum(1 for w in HOOK_WORDS if w in first.split())
    punct = min(3, text.count("?") + text.count("!"))
    length_fit = 1.0 - min(1.0, abs(duration - 40) / 40)      # sweet spot ~40s
    raw = 0.40 * density + 0.25 * min(1.0, hooks / 2) + 0.15 * (punct / 3) + 0.20 * length_fit
    return round(35 + raw * 60, 1)


def build_candidates(
    segments: list[Segment], min_len: float = 20.0, max_len: float = 60.0
) -> list[Candidate]:
    """Windows that start and end on segment (sentence) boundaries."""
    out: list[Candidate] = []
    n = len(segments)
    for i in range(n):
        words: list[Word] = []
        texts: list[str] = []
        for j in range(i, n):
            seg = segments[j]
            words.extend(seg.words)
            texts.append(seg.text.strip())
            dur = seg.end - segments[i].start
            if dur > max_len:
                break
            if dur >= min_len:
                text = " ".join(texts)
                c = Candidate(segments[i].start, seg.end, text, list(words))
                c.score = heuristic_score(text, dur, len(words))
                out.append(c)
    return out


def pick_non_overlapping(cands: list[Candidate], k: int, gap: float = 2.0) -> list[Candidate]:
    chosen: list[Candidate] = []
    for c in sorted(cands, key=lambda c: c.score, reverse=True):
        if all(c.end + gap <= o.start or c.start >= o.end + gap for o in chosen):
            chosen.append(c)
        if len(chosen) >= k:
            break
    return sorted(chosen, key=lambda c: c.start)


def fallback_title(text: str, limit: int = 70) -> str:
    first = text.strip().split(". ")[0].strip()
    return (first[: limit - 1] + "…") if len(first) > limit else first
