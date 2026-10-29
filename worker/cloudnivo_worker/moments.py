"""Find and rank clip-worthy moments from a word-timed transcript.

Pure Python (no model calls) so it is unit-testable. LLM ranking lives in llm.py
and only re-orders/annotates the candidates produced here.

FORMATS mirrors VIRAL_PRESETS in src/suite-data.ts one-for-one: each trending
clip preset on the Suite page has a scoring profile here, so "Use" on a preset
and per-format scoring in the pipeline speak the same language. A job can pin
one format via input["format"] (the preset id); otherwise every candidate is
scored under every profile and keeps its best fit.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional

HOOK_WORDS = {
    "secret", "never", "always", "mistake", "truth", "why", "how", "nobody", "everyone",
    "crazy", "insane", "wrong", "best", "worst", "biggest", "first", "last", "stop",
    "money", "free", "actually", "really", "imagine", "listen", "wait", "seriously",
}

QUESTION_RE = re.compile(r"\?")
EXCLAIM_RE = re.compile(r"!|\b\d+%|\bbillion\b|\bmillion\b")
NUMBERED_RE = re.compile(r"\b(?:top|number|first|second|third|#)\b[\s\w]{0,12}?\b(one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\b", re.I)
QUOTE_RE = re.compile(r'"[^"]{15,}"|\u201c[^\u201d]{15,}\u201d')
ANSWER_RE = re.compile(r"\b(because|so that|the reason|answer is|it means|here'?s how)\b", re.I)
TENSION_RE = re.compile(r"\b(but|until|then|suddenly|however|turned out|ended up|twist)\b", re.I)
PAYOFF_RE = re.compile(r"\b(so|in the end|finally|lesson|takeaway|that'?s why|the point)\b", re.I)
ACTION_RE = re.compile(r"\b(go|goes|hit|hits|run|runs|jump|crash|win|wins|score|scores|chase|boom|watch this|look at this)\b", re.I)


@dataclass(frozen=True)
class ClipFormat:
    """A trending format with its own scoring profile."""
    id: str
    label: str
    min_len: float
    max_len: float
    sweet: float           # preferred duration (length_fit peaks here)
    density_w: float       # weight on words-per-second speech density
    hook_w: float          # weight on HOOK_WORDS appearing early
    punct_w: float         # weight on questions/exclamations
    length_w: float        # weight on fitting the duration window
    pattern: Optional[re.Pattern] = None   # extra format-specific signal
    pattern_w: float = 0.0


FORMATS: dict[str, ClipFormat] = {p.id: p for p in [
    # podcast-punchline: short, punchy, hook-dense
    ClipFormat("podcast-punchline", "Hook-first clip", 15, 45, 25, 0.38, 0.32, 0.12, 0.18),
    # hot-take-monologue: mid-length opinion, strong opening hook
    ClipFormat("hot-take-monologue", "Talking head", 20, 60, 40, 0.30, 0.34, 0.10, 0.26),
    # story-arc-clip: longer arc; tension/payoff language is the signal
    ClipFormat("story-arc-clip", "Narrative", 25, 75, 50, 0.24, 0.18, 0.08, 0.20, TENSION_RE, 0.30),
    # listicle-cuts: numbered segments
    ClipFormat("listicle-cuts", "Listicle", 15, 50, 30, 0.28, 0.16, 0.08, 0.18, NUMBERED_RE, 0.36),
    # qa-split: must contain a question mark
    ClipFormat("qa-split", "Interview", 20, 60, 35, 0.26, 0.18, 0.10, 0.16, QUESTION_RE, 0.30),
    # b-roll-highlight: fast speech, minimal caption reliance, short
    ClipFormat("b-roll-highlight", "Montage", 10, 35, 20, 0.44, 0.10, 0.06, 0.10, ACTION_RE, 0.30),
    # quote-card-clip: quotable phrasing / explicit quotes
    ClipFormat("quote-card-clip", "Quote", 10, 40, 22, 0.28, 0.22, 0.10, 0.10, QUOTE_RE, 0.30),
    # countdown-teaser: ends on suspense — questions & exclamations late
    ClipFormat("countdown-teaser", "Teaser", 15, 45, 28, 0.30, 0.24, 0.16, 0.10, EXCLAIM_RE, 0.20),
]}


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
    format_id: str = ""     # which trending format fits this moment best

    @property
    def duration(self) -> float:
        return self.end - self.start


def _density_words(text: str, duration: float, n_words: int) -> float:
    if duration <= 0:
        return 0.0
    wps = n_words / duration
    return max(0.0, min(1.0, (wps - 1.2) / 2.0))


def format_score(fmt: ClipFormat, text: str, duration: float, n_words: int) -> float:
    """0-100 score of a segment under one trending-format profile."""
    if duration <= 0:
        return 0.0
    density = _density_words(text, duration, n_words)
    lower = text.lower()
    first = " ".join(lower.split()[:20])
    hooks = sum(1 for w in HOOK_WORDS if w in first.split())
    punct = min(3, text.count("?") + text.count("!"))
    length_fit = 1.0 - min(1.0, abs(duration - fmt.sweet) / max(1.0, fmt.sweet))
    raw = (
        fmt.density_w * density
        + fmt.hook_w * min(1.0, hooks / 2)
        + fmt.punct_w * (punct / 3)
        + fmt.length_w * length_fit
    )
    if fmt.pattern is not None and fmt.pattern_w > 0:
        hit = min(2, len(fmt.pattern.findall(text)))
        raw += fmt.pattern_w * min(1.0, hit / 2)
    total_w = fmt.density_w + fmt.hook_w + fmt.punct_w + fmt.length_w + fmt.pattern_w
    return round(35 + 60 * (raw / max(total_w, 0.01)), 1)


def heuristic_score(text: str, duration: float, n_words: int) -> float:
    """0-100 legacy overall score: dense speech, punctuation, early hooks, ~40s."""
    if duration <= 0:
        return 0.0
    density = _density_words(text, duration, n_words)
    lower = text.lower()
    first = " ".join(lower.split()[:20])
    hooks = sum(1 for w in HOOK_WORDS if w in first.split())
    punct = min(3, text.count("?") + text.count("!"))
    length_fit = 1.0 - min(1.0, abs(duration - 40) / 40)      # sweet spot ~40s
    raw = 0.40 * density + 0.25 * min(1.0, hooks / 2) + 0.15 * (punct / 3) + 0.20 * length_fit
    return round(35 + raw * 60, 1)


def best_format(text: str, duration: float, n_words: int) -> tuple[str, float]:
    """Highest-scoring trending format for a segment: (format_id, score)."""
    best_id, best_s = "", -1.0
    for fid, fmt in FORMATS.items():
        s = format_score(fmt, text, duration, n_words)
        if s > best_s:
            best_id, best_s = fid, s
    return best_id, best_s


def build_candidates(
    segments: list[Segment],
    min_len: float = 20.0,
    max_len: float = 60.0,
    fmt: Optional[ClipFormat] = None,
) -> list[Candidate]:
    """Windows that start and end on segment (sentence) boundaries.

    Pass a ClipFormat (e.g. FORMATS["listicle-cuts"]) to score every window
    under that trending profile and honour its duration range; leave it None
    for the legacy all-purpose heuristic plus a best-fit format tag.
    """
    lo = fmt.min_len if fmt else min_len
    hi = fmt.max_len if fmt else max_len
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
            if dur > hi:
                break
            if dur >= lo:
                text = " ".join(texts)
                c = Candidate(segments[i].start, seg.end, text, list(words))
                if fmt:
                    c.score = format_score(fmt, text, dur, len(words))
                    c.format_id = fmt.id
                else:
                    c.score = heuristic_score(text, dur, len(words))
                    c.format_id, _ = best_format(text, dur, len(words))
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

