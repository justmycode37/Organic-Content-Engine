"""Continuous narration: one take for the whole video, cut into scenes at its pauses.

Synthesizing every scene separately restarts the intonation at each cut and
leaves provider silence on both sides of it. Here the narration of all scenes
is spoken as one connected take; scene boundaries are placed in the middle of
the natural pause between the last word of one scene and the first word of the
next, so the voice never stops for a cut.

Takes are checked on their word timings (not by listening):

- a sentence end (``.``, ``!``, ``?``) needs a pause of at least
  ``MIN_SENTENCE_PAUSE`` - otherwise the thought boundary is swallowed;
- a pause longer than ``MAX_INTERNAL_PAUSE`` inside a clause is a stumble.

Up to ``voice.takes`` seeded takes are generated; the first take without
problems wins, otherwise the one with the fewest problems (newest on a tie).

Long narration (long-form videos) is spoken in chunks of about ``CHUNK_CHARS``
characters, split at scene boundaries. Each chunk is requested with the text
before and after it as context, so the intonation carries across the joins;
takes are chosen per chunk and the chosen chunks are joined into one track.

``voice.pauses`` decides what happens to the silence of the chosen take:

- ``natural`` keeps the take exactly as spoken;
- ``tight`` trims leading/trailing silence and shortens long pauses
  (sentence ends to ``TIGHT_SENTENCE_PAUSE``, commas and dashes to
  ``TIGHT_CLAUSE_PAUSE``) by cutting out the middle of the silence.
"""

from __future__ import annotations

import hashlib
import math
import re
from dataclasses import dataclass, field
from typing import Any

from .env import CACHE_DIR, log
from .ffmpeg import probe_duration, run_ffmpeg
from .spec import Scene
from .tts import Narration, Word, synthesize

SENTENCE_END = re.compile(r"[.!?…][\"'”’)\]]*$")
CLAUSE_END = re.compile(r"[,;:—–][\"'”’)\]]*$|^[—–-]$")
MIN_SENTENCE_PAUSE = 0.18
MAX_INTERNAL_PAUSE = 0.60
TIGHT_SENTENCE_PAUSE = 0.30
TIGHT_CLAUSE_PAUSE = 0.18
TIGHT_EDGE = 0.04  # silence kept before the first / after the last word in 'tight'
UNVOICED_DEFAULT = 1.5
CHUNK_CHARS = 2400  # longer narration is synthesized in chunks split at scene boundaries
CONTEXT_CHARS = 600  # neighbouring text sent with each chunk


@dataclass
class Piece:
    """A slice of the take placed on the video timeline."""

    src_start: float
    src_end: float
    out_start: float

    def to_json(self) -> dict[str, float]:
        return {"src_start": round(self.src_start, 3), "src_end": round(self.src_end, 3),
                "out_start": round(self.out_start, 3)}


@dataclass
class SceneTiming:
    frames: int
    words: list[Word]  # scene-local


@dataclass
class VoiceTrack:
    take: Narration
    pieces: list[Piece]
    report: dict[str, Any] = field(default_factory=dict)


# ------------------------------------------------------------------- pacing


def pacing(words: list[Word]) -> dict[str, Any]:
    """Descriptive pacing metrics and problems of a take (from word timings)."""
    gaps = [max(0.0, words[i + 1].start - words[i].end) for i in range(len(words) - 1)]
    problems: list[str] = []
    sentence_pauses: list[float] = []
    for i, g in enumerate(gaps):
        tok = words[i].text
        if SENTENCE_END.search(tok):
            sentence_pauses.append(g)
            if g + 0.015 < MIN_SENTENCE_PAUSE:
                problems.append(f"swallowed sentence end after {tok!r} (word {i + 1}): {g:.2f}s pause")
        elif not CLAUSE_END.search(tok) and g > MAX_INTERNAL_PAUSE:
            problems.append(f"stumble inside a clause after {tok!r} (word {i + 1}): {g:.2f}s pause")
    span = words[-1].end - words[0].start if words else 0.0
    return {
        "words": len(words),
        "speech_seconds": round(span, 2),
        "wpm": round(60 * len(words) / span, 1) if span > 0 else None,
        "pause_seconds": round(sum(gaps), 2),
        "sentence_pause_mean": round(sum(sentence_pauses) / len(sentence_pauses), 2) if sentence_pauses else None,
        "sentence_pause_max": round(max(sentence_pauses), 2) if sentence_pauses else None,
        "problems": problems,
    }


def best_take(text: str, voice: dict[str, Any], warnings: list[str],
              context: tuple[str, str] | None = None, label: str = "narration") -> tuple[Narration, dict[str, Any]]:
    """Generate up to ``voice.takes`` seeded takes; return the best and the take log."""
    max_takes = int(voice.get("takes", 3))
    takes: list[dict[str, Any]] = []
    chosen: tuple[Narration, dict[str, Any]] | None = None
    for take in range(1, max_takes + 1):
        n = synthesize(text, voice, warnings, take=take, context=context)
        m = pacing(n.words)
        rec = {"take": take, "cached": n.cached, "duration": round(n.duration, 2), **m}
        takes.append(rec)
        log(f"{label} take {take}: {n.duration:.1f}s, {len(m['problems'])} pacing problem(s)"
            + (" (cache)" if n.cached else ""))
        if chosen is None or len(m["problems"]) <= len(chosen[1]["problems"]):
            chosen = (n, rec)
        if not m["problems"]:
            break
    assert chosen is not None
    n, rec = chosen
    for p in rec["problems"]:
        msg = f"{label} take {rec['take']}: {p}"
        if msg not in warnings:
            warnings.append(msg)
    return n, {"takes": takes, "chosen_take": rec["take"],
               "selection": "first take without pacing problems" if not rec["problems"]
               else "fewest pacing problems, newest on a tie"}


def _chunks(tokens: list[list[str]]) -> list[list[str]]:
    """Group the scene token lists into chunks of about CHUNK_CHARS, split at scene boundaries."""
    out: list[list[str]] = [[]]
    size = 0
    for toks in tokens:
        n = sum(len(t) + 1 for t in toks)
        if out[-1] and size + n > CHUNK_CHARS:
            out.append([])
            size = 0
        out[-1].extend(toks)
        size += n
    return [c for c in out if c]


def narrate(tokens: list[list[str]], voice: dict[str, Any], warnings: list[str]) -> tuple[Narration, dict[str, Any]]:
    """The whole narration as one track: a single take, or chosen chunk takes joined in order."""
    chunks = _chunks(tokens)
    if len(chunks) == 1:
        return best_take(" ".join(chunks[0]), voice, warnings)
    texts = [" ".join(c) for c in chunks]
    log(f"narration: {sum(map(len, texts))} chars in {len(texts)} chunks")
    parts: list[tuple[Narration, dict[str, Any]]] = []
    for i, t in enumerate(texts):
        prev = " ".join(texts[:i])[-CONTEXT_CHARS:]
        nxt = " ".join(texts[i + 1:])[:CONTEXT_CHARS]
        parts.append(best_take(t, voice, warnings, context=(prev, nxt), label=f"chunk {i + 1}/{len(texts)}"))

    key = hashlib.sha256("|".join(str(n.audio) for n, _ in parts).encode()).hexdigest()[:32]
    joined = CACHE_DIR / "tts" / f"joined_{key}.wav"
    if not joined.is_file():
        args: list[str] = []
        for n, _ in parts:
            args += ["-i", str(n.audio)]
        streams = "".join(f"[{i}:a]aresample=44100,aformat=sample_fmts=s16:channel_layouts=mono[a{i}];"
                          for i in range(len(parts)))
        concat = "".join(f"[a{i}]" for i in range(len(parts))) + f"concat=n={len(parts)}:v=0:a=1[out]"
        tmp = joined.with_suffix(".part.wav")
        run_ffmpeg([*args, "-filter_complex", streams + concat, "-map", "[out]", "-c:a", "pcm_s16le", str(tmp)],
                   "join narration chunks")
        tmp.rename(joined)
    words: list[Word] = []
    offset = 0.0
    for n, _ in parts:
        words += [Word(w.text, w.start + offset, w.end + offset) for w in n.words]
        offset += n.duration
    take = Narration(joined, probe_duration(joined), words, parts[0][0].provider, parts[0][0].voice,
                     cached=all(n.cached for n, _ in parts))
    log_ = {"chunks": [{"chars": len(t), **rec} for t, (_, rec) in zip(texts, parts)],
            "chosen_take": [rec["chosen_take"] for _, rec in parts],
            "selection": "per chunk: first take without pacing problems, else fewest (newest on a tie)"}
    return take, log_


# ----------------------------------------------------------------- timeline


def _kept_intervals(words: list[Word], duration: float, mode: str) -> list[tuple[float, float]]:
    """Intervals of the take (source seconds) that stay in the video."""
    if mode != "tight":
        return [(0.0, duration)]
    start = max(0.0, words[0].start - TIGHT_EDGE)
    end = min(duration, words[-1].end + 0.25)
    cuts: list[tuple[float, float]] = []
    for i in range(len(words) - 1):
        a, b = words[i], words[i + 1]
        gap = b.start - a.end
        if SENTENCE_END.search(a.text):
            target = TIGHT_SENTENCE_PAUSE
        elif CLAUSE_END.search(a.text):
            target = TIGHT_CLAUSE_PAUSE
        else:
            continue  # pauses inside a clause are left alone (pacing() flags stumbles)
        if gap > target + 0.02:
            cuts.append((a.end + target / 2, b.start - target / 2))
    out: list[tuple[float, float]] = []
    cur = start
    for c0, c1 in cuts:
        if c0 > cur:
            out.append((cur, c0))
        cur = max(cur, c1)
    if end > cur:
        out.append((cur, end))
    return out


def _mapper(kept: list[tuple[float, float]]):
    """Source time -> compacted voice time (times inside a cut map to the cut point)."""
    offsets: list[tuple[float, float, float]] = []  # (src0, src1, voice0)
    acc = 0.0
    for a, b in kept:
        offsets.append((a, b, acc))
        acc += b - a

    def f(t: float) -> float:
        for a, b, v in offsets:
            if t < a:
                return v
            if t <= b:
                return v + (t - a)
        return acc

    return f, acc, offsets


def build(scenes: list[Scene], voice: dict[str, Any], fps: int, warnings: list[str]) \
        -> tuple[list[SceneTiming], VoiceTrack]:
    """Synthesize the whole narration as one take and lay the scenes out on it."""
    tokens = [s.narration.split() for s in scenes]
    take, take_log = narrate(tokens, voice, warnings)
    words = take.words
    if len(words) != sum(len(t) for t in tokens):
        raise RuntimeError("narration alignment lost words; cannot split the take into scenes")

    mode = voice.get("pauses", "natural")
    kept = _kept_intervals(words, take.duration, mode)
    vt, voice_len, offsets = _mapper(kept)

    # word ranges per scene in the joined take
    ranges: list[tuple[int, int] | None] = []
    i = 0
    for toks in tokens:
        ranges.append((i, i + len(toks)) if toks else None)
        i += len(toks)
    voiced = [k for k, r in enumerate(ranges) if r]
    first_v, last_v = voiced[0], voiced[-1]

    # scene ranges in compacted voice time: cut in the middle of the pause between scenes
    vranges: dict[int, tuple[float, float]] = {}
    for n, k in enumerate(voiced):
        a, b = ranges[k]  # type: ignore[misc]
        if k == first_v:
            v0 = -scenes[k].lead
        else:
            prev_end = words[ranges[voiced[n - 1]][1] - 1].end  # type: ignore[index]
            v0 = (vt(prev_end) + vt(words[a].start)) / 2
        if k == last_v:
            v1 = voice_len + scenes[k].hold
        else:
            nxt = ranges[voiced[n + 1]][0]  # type: ignore[index]
            v1 = (vt(words[b - 1].end) + vt(words[nxt].start)) / 2
        vranges[k] = (v0, v1)

    timings: list[SceneTiming] = []
    shifts: dict[int, float] = {}
    t_out = 0.0
    for k, s in enumerate(scenes):
        if k in vranges:
            v0, v1 = vranges[k]
            dur = max(v1 - v0, s.min_duration)
            shift = t_out - v0  # voice time + shift = video time
            shifts[k] = shift
            a, b = ranges[k]  # type: ignore[misc]
            local = [Word(w.text, vt(w.start) + shift - t_out, vt(w.end) + shift - t_out) for w in words[a:b]]
        else:
            dur = s.min_duration or UNVOICED_DEFAULT
            local = []
        frames = max(1, math.ceil(dur * fps - 1e-6))
        timings.append(SceneTiming(frames, local))
        t_out += frames / fps

    # place the kept audio: split every kept interval at the scene cuts
    pieces: list[Piece] = []
    for k in voiced:
        v0, v1 = vranges[k]
        for a, b, v in offsets:
            lo, hi = max(v, v0), min(v + (b - a), v1)
            if hi - lo > 1e-4:
                pieces.append(Piece(a + (lo - v), a + (hi - v), lo + shifts[k]))

    removed = take.duration - voice_len
    report = {"mode": "continuous", "pauses": mode, **take_log,
              "take_seconds": round(take.duration, 2), "removed_silence_seconds": round(removed, 2),
              "pieces": len(pieces)}
    if mode == "tight":
        log(f"tight pauses: removed {removed:.2f}s of silence in {max(0, len(kept) - 1)} cuts")
    return timings, VoiceTrack(take, pieces, report)
