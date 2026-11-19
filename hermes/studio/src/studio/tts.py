"""Text-to-speech with word timings.

Providers:
  edge        free Microsoft Edge neural voices via ``edge-tts`` (WordBoundary events)
  elevenlabs  ElevenLabs ``/v1/text-to-speech/{voice_id}/with-timestamps``
              (needs $ELEVENLABS_API_KEY, falls back to edge with a warning)
  none        no audio; word timings are estimated from the text

Results are cached in cache/tts/<sha256>.{mp3,json}. Word timings are mapped
back onto the original narration tokens so captions keep punctuation and
casing ("$2.5B," not "2.5 billion").
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import os
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .env import CACHE_DIR, StudioError, log
from .ffmpeg import probe_duration

CACHE_VERSION = 3  # 3: default speed, neutral style, seeded takes, PCM output
EDGE_FALLBACK_VOICE = "en-US-AndrewMultilingualNeural"

RECOMMENDED_VOICES = [
    {"provider": "edge", "voice": "en-US-AndrewMultilingualNeural", "gender": "male", "style": "warm, confident news read (default)"},
    {"provider": "edge", "voice": "en-US-BrianMultilingualNeural", "gender": "male", "style": "casual, approachable explainer"},
    {"provider": "edge", "voice": "en-US-AvaMultilingualNeural", "gender": "female", "style": "bright, expressive, engaging"},
    {"provider": "edge", "voice": "en-US-EmmaMultilingualNeural", "gender": "female", "style": "clear, friendly, neutral"},
    {"provider": "edge", "voice": "en-US-ChristopherNeural", "gender": "male", "style": "authoritative anchor"},
    {"provider": "edge", "voice": "en-US-AriaNeural", "gender": "female", "style": "crisp newsreader"},
    {"provider": "edge", "voice": "en-GB-RyanNeural", "gender": "male", "style": "British, measured"},
    {"provider": "edge", "voice": "en-GB-SoniaNeural", "gender": "female", "style": "British, polished"},
    {"provider": "edge", "voice": "en-AU-WilliamMultilingualNeural", "gender": "male", "style": "Australian, relaxed"},
    {"provider": "elevenlabs", "voice": "JBFqnCBsd6RMkjVDRZzb", "name": "George", "gender": "male", "style": "warm British narrator"},
    {"provider": "elevenlabs", "voice": "nPczCjzI2devNBz1zQrb", "name": "Brian", "gender": "male", "style": "deep, resonant US narrator"},
    {"provider": "elevenlabs", "voice": "TX3LPaxmHKxFdv7VOQHJ", "name": "Liam", "gender": "male", "style": "energetic young US"},
    {"provider": "elevenlabs", "voice": "EXAVITQu4vr4xnVDxPEm", "name": "Sarah", "gender": "female", "style": "confident, soft US"},
    {"provider": "elevenlabs", "voice": "XrExE9yKIg1WjnnlVkGX", "name": "Matilda", "gender": "female", "style": "friendly, upbeat US"},
]
RATE_NOTE = ("voice.rate (edge only): '+0%'..'+20%'; '+10%' is the default. ElevenLabs keeps its default speed; "
             "voice.speed (0.7..1.2) overrides it but is discouraged.")


@dataclass
class Word:
    text: str
    start: float  # seconds from the start of the scene's narration audio
    end: float

    def to_json(self) -> dict[str, Any]:
        return {"text": self.text, "start": round(self.start, 3), "end": round(self.end, 3)}


@dataclass
class Narration:
    audio: Path | None  # None for provider "none" or empty narration
    duration: float  # audio length in seconds (0 if no audio)
    words: list[Word]
    provider: str
    voice: str
    cached: bool = False


# ---------------------------------------------------------------- alignment


def _norm(s: str) -> str:
    return re.sub(r"[^0-9a-z]+", "", s.lower())


def align_tokens(text: str, spoken: list[tuple[str, float, float]]) -> list[Word]:
    """Map provider word timings onto whitespace tokens of ``text``.

    ``spoken`` items are (word_as_in_text, start, end). Each spoken word is
    located in ``text`` from a moving cursor; tokens overlapping a located span
    take its times. Tokens without a match are interpolated between neighbours.
    """
    tokens = [(m.group(0), m.start(), m.end()) for m in re.finditer(r"\S+", text)]
    if not tokens:
        return []
    starts: list[float | None] = [None] * len(tokens)
    ends: list[float | None] = [None] * len(tokens)
    lower = text.lower()
    cursor = 0
    for word, st, en in spoken:
        w = word.strip().lower()
        if not w:
            continue
        pos = lower.find(w, cursor)
        if pos < 0 or pos - cursor > 80:  # not found nearby; try normalized match per token
            nw = _norm(w)
            pos = -1
            for (tok, a, b) in tokens:
                if a >= cursor and nw and nw in _norm(tok):
                    pos, w = a, tok.lower()
                    break
            if pos < 0:
                continue
        span = (pos, pos + len(w))
        cursor = span[1]
        for i, (_, a, b) in enumerate(tokens):
            if a < span[1] and b > span[0]:
                starts[i] = st if starts[i] is None else min(starts[i], st)
                ends[i] = en if ends[i] is None else max(ends[i], en)
    # interpolate gaps
    known = [i for i, s in enumerate(starts) if s is not None]
    if not known:
        return []
    out: list[Word] = []
    for i, (tok, _, _) in enumerate(tokens):
        if starts[i] is None:
            prev = max((k for k in known if k < i), default=None)
            nxt = min((k for k in known if k > i), default=None)
            if prev is None:
                s = e = starts[nxt]  # type: ignore[index]
            elif nxt is None:
                s = e = ends[prev]  # type: ignore[index]
            else:
                a, b = ends[prev], starts[nxt]
                frac = (i - prev) / (nxt - prev)
                s = e = a + (b - a) * frac  # type: ignore[operator]
            starts[i], ends[i] = s, e
        out.append(Word(tok, float(starts[i]), float(ends[i])))  # type: ignore[arg-type]
    # monotonic, non-overlapping starts
    for i in range(1, len(out)):
        if out[i].start < out[i - 1].start:
            out[i].start = out[i - 1].start
        if out[i].end < out[i].start:
            out[i].end = out[i].start
    return out


def estimate_words(text: str, wps: float = 2.8, offset: float = 0.0) -> list[Word]:
    """Evenly estimated timings weighted by token length (provider 'none')."""
    tokens = text.split()
    if not tokens:
        return []
    weights = [max(2, len(_norm(t))) + (3 if t[-1:] in ".,!?;:" else 0) for t in tokens]
    total = len(tokens) / wps
    scale = total / sum(weights)
    t = offset
    out = []
    for tok, w in zip(tokens, weights):
        d = w * scale
        out.append(Word(tok, t, t + d * 0.85))
        t += d
    return out


# ---------------------------------------------------------------- providers


def _cache_key(provider: str, voice: dict[str, Any], text: str, take: int | None = None,
               context: tuple[str, str] | None = None) -> str:
    fields: dict[str, Any] = {"v": CACHE_VERSION, "p": provider, "voice": voice.get("voice"),
                              "rate": voice.get("rate"), "pitch": voice.get("pitch"),
                              "model": voice.get("model"), "speed": voice.get("speed"), "take": take,
                              "settings": ELEVEN_SETTINGS if provider == "elevenlabs" else None,
                              "text": text}
    if context:  # only when set, so keys of unchunked narration stay stable
        fields["context"] = list(context)
    payload = json.dumps(fields, sort_keys=True)
    return hashlib.sha256(payload.encode()).hexdigest()[:32]


async def _edge(text: str, voice: dict[str, Any], out: Path) -> list[tuple[str, float, float]]:
    import edge_tts

    # The Edge endpoint sometimes answers "No audio was received" for valid
    # requests, and for some text/rate combinations it does so every time.
    # Walk through inaudible variants (same voice): retry as-is, drop the final
    # period, nudge the rate by 1-2%, and finally use sentence boundaries
    # (word timings are then estimated by the caller).
    rate = voice.get("rate", "+0%")
    pct = int(rate[:-1]) if re.fullmatch(r"[+-]\d+%", rate) else 0
    bare = re.sub(r"[.]+$", "", text.rstrip())
    variants = [(text, rate, "WordBoundary")] * 3 + [(bare, rate, "WordBoundary")] * 2
    for d in (1, -1, 2, -2):
        variants.append((text, f"{pct + d:+d}%", "WordBoundary"))
        variants.append((bare, f"{pct + d:+d}%", "WordBoundary"))
    variants += [(text, rate, "SentenceBoundary")] * 2
    last_err: Exception | None = None
    for attempt, (txt, rt, boundary) in enumerate(variants):
        spoken: list[tuple[str, float, float]] = []
        try:
            comm = edge_tts.Communicate(txt, voice.get("voice") or EDGE_FALLBACK_VOICE, rate=rt,
                                        pitch=voice.get("pitch", "+0Hz"), boundary=boundary)
            tmp = out.with_suffix(".part")
            with open(tmp, "wb") as f:
                async for chunk in comm.stream():
                    if chunk["type"] == "audio":
                        f.write(chunk["data"])
                    elif chunk["type"] == "WordBoundary":
                        st = chunk["offset"] / 1e7
                        spoken.append((chunk["text"], st, st + chunk["duration"] / 1e7))
            if tmp.stat().st_size == 0:
                raise StudioError("edge-tts returned no audio")
            tmp.replace(out)
            if attempt:
                log(f"edge-tts succeeded on attempt {attempt + 1} (rate {rt}, {boundary})")
            return spoken
        except Exception as e:
            last_err = e
            await asyncio.sleep(min(2.0, 0.3 * (attempt + 1)))
    attempts = len(variants)
    raise StudioError(f"edge-tts failed for voice {voice.get('voice')!r} after {attempts} attempts: {last_err} "
                      "(check the voice name with `studio voices` and network access)")


ELEVEN_SETTINGS = {"stability": 0.5, "similarity_boost": 0.75, "style": 0.0, "use_speaker_boost": True}
ELEVEN_FORMATS = ("pcm_44100", "mp3_44100_192", "mp3_44100_128")  # best first; pcm needs a paid tier
_REFUSED_FORMATS: set[str] = set()  # formats this account refused (asked once per process)


def _write_pcm_wav(raw: bytes, out: Path, rate: int = 44100) -> None:
    import wave

    with wave.open(str(out), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(raw)


def _elevenlabs(text: str, voice: dict[str, Any], out: Path, seed: int | None = None,
                context: tuple[str, str] | None = None) -> tuple[list[tuple[str, float, float]], Path]:
    """Synthesize ``text``; returns (word timings, audio file). ``out`` is the file stem.

    Speed is left at ElevenLabs' default unless ``voice.speed`` is set: a global
    speed-up makes a voice sound rushed, and the video may simply run longer.
    """
    import httpx

    key = os.environ["ELEVENLABS_API_KEY"]
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice['voice']}/with-timestamps"
    settings = dict(ELEVEN_SETTINGS)
    if isinstance(voice.get("speed"), (int, float)):
        settings["speed"] = float(voice["speed"])
    body: dict[str, Any] = {"text": text, "model_id": voice.get("model", "eleven_multilingual_v2"),
                            "voice_settings": settings}
    if seed is not None:
        body["seed"] = seed
    if context:  # neighbouring text keeps intonation continuous across chunk boundaries
        if context[0]:
            body["previous_text"] = context[0]
        if context[1]:
            body["next_text"] = context[1]
    last: Exception | None = None
    formats = [f for f in ELEVEN_FORMATS if f not in _REFUSED_FORMATS] or [ELEVEN_FORMATS[-1]]
    attempt = 0
    while formats and attempt < 4:
        fmt = formats[0]
        try:
            r = httpx.post(url, params={"output_format": fmt}, json=body,
                           headers={"xi-api-key": key, "accept": "application/json"}, timeout=180)
            if r.status_code in (400, 403, 422) and len(formats) > 1:
                log(f"ElevenLabs refused output_format {fmt} (HTTP {r.status_code}); trying {formats[1]}")
                _REFUSED_FORMATS.add(formats.pop(0))  # e.g. PCM is not available on this plan
                continue
            if r.status_code in (401, 403, 404, 422):
                raise StudioError(f"ElevenLabs HTTP {r.status_code}: {r.text[:300]}")
            r.raise_for_status()
            data = r.json()
            raw = base64.b64decode(data["audio_base64"])
            if fmt.startswith("pcm_"):
                audio = out.with_suffix(".wav")
                _write_pcm_wav(raw, audio, int(fmt.split("_")[1]))
            else:
                audio = out.with_suffix(".mp3")
                audio.write_bytes(raw)
            al = data.get("alignment") or data.get("normalized_alignment") or {}
            chars = al.get("characters", [])
            cs = al.get("character_start_times_seconds", [])
            ce = al.get("character_end_times_seconds", [])
            words: list[tuple[str, float, float]] = []
            cur, st, en = "", 0.0, 0.0
            for ch, a, b in zip(chars, cs, ce):
                if ch.isspace():
                    if cur:
                        words.append((cur, st, en))
                    cur = ""
                    continue
                if not cur:
                    st = a
                cur += ch
                en = b
            if cur:
                words.append((cur, st, en))
            return words, audio
        except StudioError:
            raise
        except Exception as e:
            last = e
            attempt += 1
            time.sleep(2 * attempt)
    raise StudioError(f"ElevenLabs request failed: {last}")


def take_seed(text: str, take: int) -> int:
    """Deterministic per-take seed: a re-render reproduces a take, a new take sounds different."""
    return int(hashlib.sha256(f"{take}:{text}".encode()).hexdigest()[:8], 16)


def synthesize(text: str, voice: dict[str, Any], warnings: list[str], take: int | None = None,
               context: tuple[str, str] | None = None) -> Narration:
    """Synthesize narration (blocking; edge runs its own event loop).

    ``take`` (elevenlabs only) selects a seeded take; takes are cached separately.
    ``context`` (elevenlabs only) is the (previous, next) text around a chunk of a longer narration.
    """
    provider = voice.get("provider", "edge")
    if not text.strip():
        return Narration(None, 0.0, [], provider, voice.get("voice", ""))
    if provider == "none":
        return Narration(None, 0.0, estimate_words(text), "none", "")
    if provider == "elevenlabs" and not os.environ.get("ELEVENLABS_API_KEY"):
        msg = "ELEVENLABS_API_KEY not set; falling back to edge voice " + EDGE_FALLBACK_VOICE
        if msg not in warnings:
            warnings.append(msg)
            log("WARNING: " + msg)
        voice = {**voice, "provider": "edge", "voice": EDGE_FALLBACK_VOICE}
        provider = "edge"

    tts_dir = CACHE_DIR / "tts"
    tts_dir.mkdir(parents=True, exist_ok=True)
    key = _cache_key(provider, voice, text, take, context if provider == "elevenlabs" else None)
    audio = tts_dir / f"{key}.mp3"
    meta = tts_dir / f"{key}.json"
    if meta.is_file():
        m = json.loads(meta.read_text())
        cached_audio = Path(m.get("audio") or audio)
        if cached_audio.is_file():
            return Narration(cached_audio, m["duration"], [Word(**w) for w in m["words"]], provider, voice["voice"],
                             cached=True)

    if provider == "edge":
        # Edge outages are usually short. Keep the same voice (a voice change
        # mid-Reel sounds broken) and back off before giving up.
        for wait in (20, 60, 0):
            try:
                spoken = asyncio.run(_edge(text, voice, audio))
                break
            except StudioError:
                if not wait:
                    raise
                log(f"edge-tts unavailable, retrying the scene in {wait}s")
                time.sleep(wait)
    else:
        spoken, audio = _elevenlabs(text, voice, tts_dir / key, take_seed(text, take) if take else None,
                                    context)
    duration = probe_duration(audio)
    words = align_tokens(text, spoken)
    if not words:
        warnings.append(f"no word timings returned for: {text[:40]!r}; captions estimated")
        words = estimate_words(text, wps=len(text.split()) / max(duration, 0.5))
    meta.write_text(json.dumps({"duration": duration, "words": [w.to_json() for w in words], "audio": str(audio),
                                "provider": provider, "voice": voice["voice"], "text": text}, indent=1))
    return Narration(audio, duration, words, provider, voice["voice"])
