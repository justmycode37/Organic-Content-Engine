"""Caption chunking (2-4 words per chunk) and SRT export."""

from __future__ import annotations

from dataclasses import dataclass

from .tts import Word

MAX_CHARS = 22  # per chunk; keeps a chunk on one or two lines at caption size
GAP_BREAK = 0.45  # a pause longer than this starts a new chunk


@dataclass
class Chunk:
    words: list[Word]
    start: float
    end: float

    @property
    def text(self) -> str:
        return " ".join(w.text for w in self.words)

    def to_json(self) -> dict:
        return {"start": round(self.start, 3), "end": round(self.end, 3), "words": [w.to_json() for w in self.words]}


def chunk_words(words: list[Word], max_words: int = 3, scene_end: float | None = None) -> list[Chunk]:
    """Group words into short caption chunks.

    Breaks after sentence/clause punctuation, on long pauses, at ``max_words``
    and when the chunk would exceed ``MAX_CHARS``. A chunk is shown from its
    first word until the next chunk starts (or briefly after its last word).
    """
    groups: list[list[Word]] = []
    cur: list[Word] = []
    for i, w in enumerate(words):
        if cur:
            chars = sum(len(x.text) + 1 for x in cur) + len(w.text)
            gap = w.start - cur[-1].end
            if len(cur) >= max_words or chars > MAX_CHARS or gap > GAP_BREAK:
                groups.append(cur)
                cur = []
        cur.append(w)
        if w.text[-1:] in ".!?;:" or (w.text[-1:] == "," and len(cur) >= 2):
            groups.append(cur)
            cur = []
    if cur:
        groups.append(cur)
    # avoid dangling single words when the previous chunk has room
    merged: list[list[Word]] = []
    for g in groups:
        if (merged and len(g) == 1 and len(merged[-1]) < max_words
                and merged[-1][-1].text[-1:] not in ".!?;:,"
                and sum(len(x.text) + 1 for x in merged[-1]) + len(g[0].text) <= MAX_CHARS):
            merged[-1] = merged[-1] + g
        else:
            merged.append(g)
    chunks: list[Chunk] = []
    for i, g in enumerate(merged):
        start = g[0].start
        tail = g[-1].end + 0.6
        if i + 1 < len(merged):
            end = min(merged[i + 1][0].start, max(tail, g[-1].end))
            end = merged[i + 1][0].start if merged[i + 1][0].start - g[-1].end < 0.8 else end
        else:
            end = tail if scene_end is None else min(max(tail, g[-1].end), scene_end)
        chunks.append(Chunk(g, start, max(end, start + 0.2)))
    return chunks


def _ts(t: float) -> str:
    ms = int(round(max(t, 0) * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def to_srt(chunks: list[Chunk]) -> str:
    lines = []
    for i, c in enumerate(chunks, 1):
        lines += [str(i), f"{_ts(c.start)} --> {_ts(c.end)}", c.text, ""]
    return "\n".join(lines)
