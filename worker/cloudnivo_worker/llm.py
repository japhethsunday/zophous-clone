"""Optional ranking with a local open model through Ollama (no paid API).

If Ollama is unreachable or answers badly, the heuristic ranking is kept.
"""

from __future__ import annotations

import json
import logging
import os

import requests

from .moments import Candidate

log = logging.getLogger(__name__)

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://ollama:11434").rstrip("/")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5:3b")

PROMPT = """You pick the best short-form video clips (TikTok, Reels, Shorts) from a long video transcript.
For each numbered candidate, judge how well it would hold attention on its own: a strong opening line,
a clear payoff, emotion or surprise, and no missing context.
Reply with JSON only, shaped exactly like:
{"clips":[{"id":<number>,"score":<integer 1-100>,"title":"<max 70 chars>","hook":"<2-4 word hook type>","tone":"<2-3 words>","reason":"<one short sentence>"}]}
Include every candidate once.

Candidates:
"""


def rank_with_llm(cands: list[Candidate], timeout: int = 240) -> list[Candidate]:
    if not cands:
        return cands
    lines = [f"[{i}] ({c.duration:.0f}s) {c.text[:700]}" for i, c in enumerate(cands)]
    try:
        r = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": OLLAMA_MODEL,
                "prompt": PROMPT + "\n".join(lines),
                "format": "json",
                "stream": False,
                "options": {"temperature": 0.2, "num_ctx": 8192},
            },
            timeout=timeout,
        )
        r.raise_for_status()
        data = json.loads(r.json().get("response", "{}"))
    except Exception as e:  # network, model missing, bad JSON
        log.warning("ollama ranking skipped: %s", e)
        return cands

    for item in data.get("clips", []):
        try:
            c = cands[int(item["id"])]
        except (KeyError, ValueError, IndexError, TypeError):
            continue
        llm_score = max(1, min(100, int(item.get("score", 0) or 0)))
        # Blend: the model judges meaning, the heuristic keeps pacing honest.
        c.score = round(0.7 * llm_score + 0.3 * c.score, 1)
        c.title = str(item.get("title", ""))[:80]
        c.hook = str(item.get("hook", ""))[:40]
        c.tone = str(item.get("tone", ""))[:40]
        c.reason = str(item.get("reason", ""))[:200]
    return cands
