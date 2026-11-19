"""Information density of the narration, measured on the rendered timeline.

Long videos lose viewers in flat stretches: one shot held too long, a
minute without a question or a turn, sentences that talk about the video
instead of the story ("let's start with...", "keep that in mind"). The
targets come from the 2026-11-19 long-form review, where the rewritten
cold open (kept) and the original body (rejected) were measured:

    new cold open    scene median 5.9 s, 4.3 questions/min, 173 wpm
    original body    scene median 7.4 s (max 15.6 s), 0.9 questions/min, 157 wpm

Every check is a warning, never an error: the numbers guide the script,
they do not replace judgement.
"""

from __future__ import annotations

import re
import statistics
from typing import Any

MAX_SCENE_SECONDS = {"reel": 6.0, "longform": 9.0}  # one narrated shot longer than this drags
FLAT_WINDOW = {"reel": 20.0, "longform": 40.0}  # seconds without a question or a turn
MIN_WPM = 160
MAX_SENTENCE_WORDS = 20

TURN = re.compile(r"\?|\b(but|yet|instead|except|until|meanwhile|turns out|the catch|the problem|"
                  r"the strange part|the twist|which means|so why|so how|only)\b", re.I)
META = re.compile(r"\b(let'?s (start|begin|look|talk|dive|take)|let us|keep (that|this) (number )?in (your )?mind|"
                  r"keep that number in your head|in this (video|chapter)|in the next (chapter|section)|"
                  r"as (we|I) (said|mentioned)|before we (get|go)|stay tuned|we'?ll get to)\b", re.I)
QUOTED = re.compile(r"\"[^\"]*\"|“[^”]*”")
SENTENCE = re.compile(r"(?<=[.!?])\s+")


def analyse(scenes: list[dict[str, Any]], fmt: str) -> tuple[dict[str, Any], list[str]]:
    """``scenes``: dicts with ``index``, ``start``, ``duration``, ``narration``. Returns (metrics, warnings)."""
    narrated = [s for s in scenes if s["narration"].strip()]
    if not narrated:
        return {}, []
    warnings: list[str] = []
    max_scene = MAX_SCENE_SECONDS.get(fmt, 9.0)
    window = FLAT_WINDOW.get(fmt, 40.0)

    long_scenes = [s for s in narrated if s["duration"] > max_scene]
    for s in long_scenes:
        warnings.append(f"density: scene {s['index']} holds one shot for {s['duration']:.1f}s "
                        f"(> {max_scene:.0f}s); split the line over two visuals")

    # flat stretches: windows of narration with no question and no turn word
    marks = [s["start"] for s in narrated if TURN.search(QUOTED.sub("", s["narration"]))]
    t0 = narrated[0]["start"]
    t_end = narrated[-1]["start"] + narrated[-1]["duration"]
    flats = []
    prev = t0
    for t in marks + [t_end]:
        if t - prev > window:
            flats.append((prev, t))
        prev = max(prev, t)
    for a, b in flats:
        warnings.append(f"density: {b - a:.0f}s without a question or a turn ({a:.0f}-{b:.0f}s); "
                        "add a contradiction, a stake or the next open question")

    text = " ".join(s["narration"] for s in narrated)
    bare = QUOTED.sub("", text)
    meta = sorted({m.group(0) for m in META.finditer(bare)})
    if meta:
        warnings.append("density: sentences about the video instead of the story: "
                        + ", ".join(repr(m) for m in meta) + "; cut them")
    sentences = [t for t in SENTENCE.split(bare) if t.strip()]
    long_sent = [t for t in sentences if len(t.split()) > MAX_SENTENCE_WORDS]
    for t in long_sent[:5]:
        warnings.append(f"density: {len(t.split())}-word sentence: {t[:60]!r}...; split it")

    speech = sum(s["duration"] for s in narrated)
    words = len(text.split())
    wpm = 60 * words / speech if speech else 0.0
    if fmt == "longform" and wpm and wpm < MIN_WPM:
        warnings.append(f"density: {wpm:.0f} words per minute of narrated time (< {MIN_WPM}); "
                        "too many pauses or held shots")
    questions = QUOTED.sub("", text).count("?")
    metrics = {
        "scene_seconds_median": round(statistics.median(s["duration"] for s in narrated), 2),
        "scene_seconds_max": round(max(s["duration"] for s in narrated), 2),
        "scenes_over_limit": len(long_scenes),
        "questions_per_minute": round(60 * questions / speech, 2) if speech else None,
        "turns": len(marks),
        "flat_stretches": [[round(a, 1), round(b, 1)] for a, b in flats],
        "words_per_minute": round(wpm, 1),
        "meta_phrases": meta,
        "sentences_over_20_words": len(long_sent),
        "targets": {"scene_seconds_max": max_scene, "flat_window_seconds": window,
                    "words_per_minute_min": MIN_WPM if fmt == "longform" else None,
                    "sentence_words_max": MAX_SENTENCE_WORDS},
    }
    return metrics, warnings
