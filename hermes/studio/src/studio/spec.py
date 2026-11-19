"""Reel spec loading and validation.

The spec is a JSON document (see README.md). ``load_spec`` returns a normalized
``Spec`` plus errors and warnings; it never raises for spec problems so the CLI
can report all of them at once.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .env import THEMES_DIR, StudioError
from .formats import DEFAULT_FORMAT, FORMATS, get_format
from .templates import check_props, load_template

MAX_DURATION = FORMATS["reel"].max_duration  # reel limits; see formats.py for others
MIN_DURATION = FORMATS["reel"].min_duration
WORDS_PER_SECOND = 2.8  # rough speaking rate used for estimates before TTS

VOICE_PROVIDERS = ("edge", "elevenlabs", "none")
CAPTION_STYLES = ("karaoke", "pop", "plain")
CAPTION_POSITIONS = ("lower", "middle")
TEXT_MODES = ("minimal", "full")
VOICE_MODES = ("continuous", "scene")  # one take for the whole video | one take per scene
VOICE_PAUSES = ("tight", "natural")  # shorten long pauses (default) | keep the take as spoken
MEDIA_EXT_IMAGE = (".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".avif")
MEDIA_EXT_VIDEO = (".mp4", ".mov", ".m4v", ".webm", ".mkv")

DEFAULT_VOICE = {"provider": "edge", "voice": "en-US-AndrewMultilingualNeural", "rate": "+10%", "pitch": "+0Hz"}
DEFAULT_BRAND = {"wordmark": "FRONTIER FEED", "handle": "", "bug": True}

TOP_KEYS = {"title", "voice", "theme", "music", "captions", "scenes", "brand", "fps", "lead", "description", "text", "format"}
SCENE_KEYS = {"template", "narration", "props", "media", "min_duration", "cover", "cover_time", "source", "hold", "lead", "id", "notes", "chapter"}


@dataclass
class Media:
    src: str  # local absolute path or http(s) URL
    is_url: bool
    start: float = 0.0  # video in-point (seconds)
    fit: str = "cover"  # cover | contain
    position: str = "center"  # CSS object-position
    kind: str | None = None  # image | video, decided by extension or download


@dataclass
class Scene:
    index: int
    template: str
    narration: str
    props: dict[str, Any]
    media: Media | None
    min_duration: float
    cover: bool
    cover_time: float | None
    source: str | None
    lead: float
    hold: float
    chapter: str | None = None  # longform: a chapter starts at this scene


@dataclass
class Spec:
    path: Path
    base_dir: Path
    title: str
    voice: dict[str, Any]
    theme: str
    music: dict[str, Any] | None
    captions: dict[str, Any]
    brand: dict[str, Any]
    scenes: list[Scene] = field(default_factory=list)
    fps: int = 30
    text: str = "minimal"
    format: str = DEFAULT_FORMAT

    def estimated_duration(self) -> float:
        total = 0.0
        for s in self.scenes:
            words = len(s.narration.split())
            est = s.lead + words / WORDS_PER_SECOND + s.hold if words else 0.0
            total += max(est, s.min_duration)
        return round(total, 2)


def _is_url(s: str) -> bool:
    return bool(re.match(r"^https?://", s, re.I))


def _media_kind(src: str) -> str | None:
    path = src.split("?", 1)[0].lower()
    if path.endswith(MEDIA_EXT_IMAGE):
        return "image"
    if path.endswith(MEDIA_EXT_VIDEO):
        return "video"
    return None


def _resolve_path(base: Path, p: str) -> Path:
    q = Path(p).expanduser()
    return q if q.is_absolute() else (base / q).resolve()


def load_spec(path: str | Path, check_files: bool = True) -> tuple[Spec | None, list[str], list[str]]:
    """Parse and validate a spec file. Returns (spec_or_None, errors, warnings)."""
    errors: list[str] = []
    warnings: list[str] = []
    path = Path(path).expanduser().resolve()
    if not path.is_file():
        return None, [f"spec file not found: {path}"], []
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        return None, [f"invalid JSON in {path.name}: line {e.lineno} col {e.colno}: {e.msg}"], []
    if not isinstance(raw, dict):
        return None, ["spec root must be a JSON object"], []
    base = path.parent

    for k in raw:
        if k not in TOP_KEYS:
            warnings.append(f"unknown top-level key {k!r} (ignored)")

    title = raw.get("title")
    if not isinstance(title, str) or not title.strip():
        errors.append("title: required non-empty string")
        title = ""

    # voice
    voice = dict(DEFAULT_VOICE)
    v = raw.get("voice", {})
    if not isinstance(v, dict):
        errors.append("voice: must be an object")
    else:
        voice.update({k: val for k, val in v.items() if val is not None})
        if voice["provider"] not in VOICE_PROVIDERS:
            errors.append(f"voice.provider: must be one of {list(VOICE_PROVIDERS)}")
        if voice["provider"] == "elevenlabs" and "voice" not in v:
            errors.append("voice.voice: required for elevenlabs (an ElevenLabs voice_id)")
        for key in ("rate", "pitch"):
            if not isinstance(voice.get(key), str):
                errors.append(f"voice.{key}: must be a string like '+10%'")
        if isinstance(voice.get("rate"), str) and not re.fullmatch(r"[+-]\d{1,3}%", voice["rate"]):
            errors.append(f"voice.rate: must look like '+10%' or '-5%', got {voice['rate']!r}")
        if isinstance(voice.get("pitch"), str) and not re.fullmatch(r"[+-]\d{1,3}Hz", voice["pitch"]):
            errors.append(f"voice.pitch: must look like '+0Hz' or '-2Hz', got {voice['pitch']!r}")
        is_eleven = voice["provider"] == "elevenlabs"
        voice.setdefault("mode", "continuous" if is_eleven else "scene")
        voice.setdefault("pauses", "tight")
        voice.setdefault("takes", 3)
        if voice["mode"] not in VOICE_MODES:
            errors.append(f"voice.mode: must be one of {list(VOICE_MODES)}")
        elif voice["mode"] == "continuous" and not is_eleven:
            errors.append("voice.mode 'continuous' needs provider 'elevenlabs' (edge returns no reliable "
                          "word timings across sentences); use 'scene'")
        if voice["pauses"] not in VOICE_PAUSES:
            errors.append(f"voice.pauses: must be one of {list(VOICE_PAUSES)}")
        if not isinstance(voice["takes"], int) or not 1 <= voice["takes"] <= 3:
            errors.append("voice.takes: integer 1..3")
        if "speed" in voice and not (isinstance(voice["speed"], (int, float)) and 0.7 <= voice["speed"] <= 1.2):
            errors.append("voice.speed: number 0.7..1.2 (omit it to keep the provider's default speed)")
        if is_eleven and v.get("rate") not in (None, "+0%"):
            warnings.append("voice.rate is ignored for elevenlabs: narration keeps ElevenLabs' default speed "
                            "(set voice.speed only if a voice is genuinely too slow)")

    # theme
    theme = raw.get("theme", "default")
    if not isinstance(theme, str) or not (THEMES_DIR / f"{theme}.css").is_file():
        avail = sorted(p.stem for p in THEMES_DIR.glob("*.css"))
        errors.append(f"theme: {theme!r} not found in themes/ (available: {avail})")
        theme = "default"

    # music
    music = raw.get("music")
    if music is not None:
        if not isinstance(music, dict) or not isinstance(music.get("path"), str):
            errors.append("music: must be an object with a 'path' string")
            music = None
        else:
            music = {"volume": 0.12, **music}
            if not isinstance(music["volume"], (int, float)) or not 0 <= music["volume"] <= 1:
                errors.append("music.volume: must be a number between 0 and 1")
            if _is_url(music["path"]):
                music["is_url"] = True
            else:
                music["is_url"] = False
                mp = _resolve_path(base, music["path"])
                music["path"] = str(mp)
                if check_files and not mp.is_file():
                    errors.append(f"music.path: file not found: {mp}")

    # captions
    captions = {"enabled": True, "style": "karaoke", "max_words": 3, "position": "lower", "uppercase": False}
    c = raw.get("captions", {})
    if not isinstance(c, dict):
        errors.append("captions: must be an object")
    else:
        captions.update(c)
        if captions["style"] not in CAPTION_STYLES:
            errors.append(f"captions.style: must be one of {list(CAPTION_STYLES)}")
        if captions["position"] not in CAPTION_POSITIONS:
            errors.append(f"captions.position: must be one of {list(CAPTION_POSITIONS)}")
        if not isinstance(captions["max_words"], int) or not 2 <= captions["max_words"] <= 4:
            errors.append("captions.max_words: must be an integer 2..4")

    brand = dict(DEFAULT_BRAND)
    if isinstance(raw.get("brand"), dict):
        brand.update(raw["brand"])

    fps = raw.get("fps", 30)
    if fps not in (24, 25, 30, 60):
        errors.append("fps: must be 24, 25, 30 or 60 (Instagram target is 30)")
        fps = 30
    default_lead = raw.get("lead", 0.12)
    fmt_name = raw.get("format", DEFAULT_FORMAT)
    if fmt_name not in FORMATS:
        errors.append(f"format: must be one of {list(FORMATS)}")
        fmt_name = DEFAULT_FORMAT
    fmt = get_format(fmt_name)
    text = raw.get("text", "minimal")
    if text not in TEXT_MODES:
        errors.append(f"text: must be one of {list(TEXT_MODES)}")
        text = "minimal"

    spec = Spec(path=path, base_dir=base, title=title, voice=voice, theme=theme, music=music,
                captions=captions, brand=brand, fps=fps, text=text, format=fmt_name)

    scenes_raw = raw.get("scenes")
    if not isinstance(scenes_raw, list) or not scenes_raw:
        errors.append("scenes: required non-empty array")
        scenes_raw = []
    if len(scenes_raw) > fmt.max_scenes:
        errors.append(f"scenes: at most {fmt.max_scenes} scenes for format {fmt_name!r}")

    for i, s in enumerate(scenes_raw):
        where = f"scenes[{i}]"
        if not isinstance(s, dict):
            errors.append(f"{where}: must be an object")
            continue
        for k in s:
            if k not in SCENE_KEYS:
                warnings.append(f"{where}: unknown key {k!r} (ignored)")
        tname = s.get("template")
        if not isinstance(tname, str):
            errors.append(f"{where}.template: required string")
            continue
        try:
            tpl = load_template(tname)
        except StudioError as e:
            errors.append(f"{where}.template: {e}")
            continue
        if fmt_name not in tpl.formats:
            errors.append(f"{where}.template: {tname!r} is not available for format {fmt_name!r} "
                          f"(formats: {list(tpl.formats)})")
        props = s.get("props", {}) or {}
        if not isinstance(props, dict):
            errors.append(f"{where}.props: must be an object")
            props = {}
        perr, pwarn, props = check_props(tpl, props, where)
        errors += perr
        warnings += pwarn

        narration = s.get("narration", "")
        if not isinstance(narration, str):
            errors.append(f"{where}.narration: must be a string")
            narration = ""
        narration = " ".join(narration.split())

        min_d = s.get("min_duration", 1.5)
        if not isinstance(min_d, (int, float)) or isinstance(min_d, bool) or not 0.3 <= min_d <= 30:
            errors.append(f"{where}.min_duration: number between 0.3 and 30")
            min_d = 1.5
        if not narration and "min_duration" not in s:
            warnings.append(f"{where}: no narration; scene lasts min_duration ({min_d}s)")

        media = None
        m = s.get("media")
        if m is not None:
            if isinstance(m, str):
                m = {"src": m}
            if not isinstance(m, dict) or not isinstance(m.get("src"), str) or not m["src"].strip():
                errors.append(f"{where}.media: must be a path/URL string or an object with 'src'")
            else:
                src = m["src"].strip()
                is_url = _is_url(src)
                if not is_url:
                    p = _resolve_path(base, src)
                    src = str(p)
                    if check_files and not p.is_file():
                        errors.append(f"{where}.media: file not found: {p}")
                kind = m.get("kind") or _media_kind(src)
                if kind not in (None, "image", "video"):
                    errors.append(f"{where}.media.kind: must be 'image' or 'video'")
                if not is_url and kind is None:
                    errors.append(f"{where}.media: unsupported file type {Path(src).suffix!r} "
                                  f"(images: {MEDIA_EXT_IMAGE}, videos: {MEDIA_EXT_VIDEO})")
                fit = m.get("fit", "cover")
                if fit not in ("cover", "contain"):
                    errors.append(f"{where}.media.fit: 'cover' or 'contain'")
                start = m.get("start", 0)
                if not isinstance(start, (int, float)) or start < 0:
                    errors.append(f"{where}.media.start: non-negative number (seconds)")
                    start = 0
                media = Media(src=src, is_url=is_url, start=float(start), fit=fit,
                              position=str(m.get("position", "center")), kind=kind)
        if tpl.media == "required" and media is None:
            errors.append(f"{where}.media: template {tname!r} requires media")
        if tpl.media == "none" and media is not None:
            warnings.append(f"{where}.media: template {tname!r} does not display media (ignored)")

        source = s.get("source")
        if source is not None and not isinstance(source, str):
            errors.append(f"{where}.source: must be a string")
            source = None
        cover_time = s.get("cover_time")
        if cover_time is not None and not isinstance(cover_time, (int, float)):
            errors.append(f"{where}.cover_time: must be a number (seconds into the scene)")
            cover_time = None

        chapter = s.get("chapter")
        if chapter is not None and (not isinstance(chapter, str) or not chapter.strip() or len(chapter) > 60):
            errors.append(f"{where}.chapter: non-empty string of at most 60 characters")
            chapter = None

        spec.scenes.append(Scene(
            index=i, template=tname, narration=narration, props=props, media=media,
            min_duration=float(min_d), cover=bool(s.get("cover", False)), cover_time=cover_time,
            source=source or None, lead=float(s.get("lead", default_lead)), hold=float(s.get("hold", 0.35)),
            chapter=chapter.strip() if chapter else None,
        ))

    if sum(1 for s in spec.scenes if s.cover) > 1:
        warnings.append("more than one scene has cover=true; the first one is used")
    if spec.scenes and fmt.first_template and spec.scenes[0].template != fmt.first_template:
        warnings.append(f"first scene is not a {fmt.first_template!r}; open with the strongest moment on frame 1")
    if fmt_name == "longform" and spec.scenes:
        chapters = [s for s in spec.scenes if s.chapter]
        if chapters and spec.scenes[0].chapter is None:
            errors.append("scenes[0].chapter: YouTube chapters must start at 00:00; give the first scene a chapter")
        if chapters and len(chapters) < 3:
            warnings.append("fewer than 3 chapters; YouTube only shows chapters with at least 3")

    if spec.scenes and not errors:
        est = spec.estimated_duration()
        if est > fmt.max_duration:
            errors.append(f"estimated duration {est:.1f}s exceeds {fmt.max_duration:.0f}s; shorten the narration")
        elif est > fmt.max_duration - 8:
            warnings.append(f"estimated duration {est:.1f}s is close to the {fmt.max_duration:.0f}s limit")
        elif est < fmt.min_duration:
            warnings.append(f"estimated duration {est:.1f}s is below {fmt.min_duration:.0f}s")

    return spec, errors, warnings
