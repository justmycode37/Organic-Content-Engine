"""Render pipeline: spec -> narration -> timeline -> scene pages -> frames -> MP4.

Steps
  1. validate the spec
  2. synthesize narration (cached) and derive scene durations: ElevenLabs
     speaks the whole video as one take that is cut into scenes at its pauses
     (voicetrack.py); other providers speak each scene separately
  3. prepare media (download, normalize images, explode videos to frames)
  4. write one HTML page per scene (template + theme + runtime + config)
  5. capture frame ranges in parallel worker processes -> H.264 segments
  6. concatenate segments (stream copy), mix voice + ducked music, measure
     voice-over-music clarity per word, two-pass loudnorm to -14 LUFS, mux
     with +faststart
  7. write cover, contact sheet, SRT and report
"""

from __future__ import annotations

import json
import math
import multiprocessing as mp
import re
import shutil
import time
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, Undefined
from markupsafe import Markup, escape

from . import capture, density
from .captions import Chunk, chunk_words, to_srt
from .env import TEMPLATES_DIR, THEMES_DIR, StudioError, chromium_or_raise, default_workers, find_ffmpeg, log
from .ffmpeg import measure_loudness, run_ffmpeg
from .media import PreparedMedia, prepare as prepare_media
from .formats import Format, get_format
from .spec import Scene, Spec, load_spec
from .templates import load_template
from .tts import Narration, Word, synthesize
from . import voicetrack
from .voicetrack import VoiceTrack

CHUNK_FRAMES = 90  # frames per capture task (balances work across workers)
TARGET_LUFS = -14.0
TARGET_TP = -1.5


class SpecInvalid(StudioError):
    def __init__(self, errors: list[str], warnings: list[str]):
        super().__init__("spec is invalid:\n  - " + "\n  - ".join(errors))
        self.errors = errors
        self.warnings = warnings


@dataclass
class PlannedScene:
    scene: Scene
    narration: Narration
    start: float  # seconds in the reel
    frames: int
    fps: int
    words: list[Word] = field(default_factory=list)  # scene-local timings
    chunks: list[Chunk] = field(default_factory=list)  # scene-local
    media: PreparedMedia | None = None
    html: Path | None = None

    @property
    def duration(self) -> float:
        return self.frames / self.fps


# ----------------------------------------------------------------- jinja env


def _hl(text: Any, words: Any) -> Markup:
    """Escape ``text`` and wrap the given word(s)/phrase(s) in <span class="hl">."""
    out = str(escape(text))
    if not words:
        return Markup(out)
    if isinstance(words, str):
        words = [words]
    for w in sorted({str(x) for x in words if x}, key=len, reverse=True):
        pat = re.compile(r"(?<![\w>])(" + re.escape(str(escape(w))) + r")(?![\w<])", re.I)
        out = pat.sub(r'<span class="hl">\1</span>', out)
    return Markup(out)


def _number(v: Any) -> float | None:
    if v is None:
        return None
    m = re.search(r"-?\d[\d,]*(?:\.\d+)?", str(v))
    return float(m.group(0).replace(",", "")) if m else None


def _jinja() -> Environment:
    env = Environment(loader=FileSystemLoader(str(TEMPLATES_DIR)), autoescape=True, undefined=Undefined,
                      trim_blocks=True, lstrip_blocks=True)
    env.filters["hl"] = _hl
    env.filters["number"] = _number
    return env


def _script_json(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False).replace("</", "<\\/")


# ------------------------------------------------------------------ planning


def _load_valid(spec_path: str | Path) -> tuple[Spec, list[str]]:
    spec, errors, warnings = load_spec(spec_path)
    if errors or spec is None:
        raise SpecInvalid(errors, warnings)
    return spec, warnings


def _continuous(spec: Spec, warnings: list[str]) -> bool:
    import os

    if spec.voice.get("mode") != "continuous" or spec.voice.get("provider") != "elevenlabs":
        return False
    if not os.environ.get("ELEVENLABS_API_KEY"):
        return False  # synthesize() falls back to edge per scene and warns
    return any(s.narration.strip() for s in spec.scenes)


def plan(spec: Spec, preview: bool, warnings: list[str], build_dir: Path) \
        -> tuple[list[PlannedScene], VoiceTrack | None]:
    fps = 15 if preview else spec.fps
    t0 = time.monotonic()
    planned: list[PlannedScene] = []
    track: VoiceTrack | None = None
    start = 0.0
    if _continuous(spec, warnings):
        log(f"narration: one take for {len(spec.scenes)} scenes via elevenlabs ({spec.voice.get('voice')}), "
            f"pauses {spec.voice.get('pauses', 'natural')}")
        timings, track = voicetrack.build(spec.scenes, spec.voice, fps, warnings)
        log(f"narration ready in {time.monotonic() - t0:.1f}s")
        for s, tm in zip(spec.scenes, timings):
            speech = (tm.words[-1].end - tm.words[0].start) if tm.words else 0.0
            n = Narration(None, speech, tm.words, "elevenlabs", spec.voice["voice"], cached=track.take.cached)
            ps = PlannedScene(scene=s, narration=n, start=start, frames=tm.frames, fps=fps, words=tm.words)
            ps.chunks = chunk_words(tm.words, spec.captions["max_words"], scene_end=ps.duration)
            planned.append(ps)
            start += ps.duration
    else:
        log(f"narration: {len(spec.scenes)} scenes via {spec.voice['provider']} ({spec.voice.get('voice')})")
        with ThreadPoolExecutor(max_workers=3) as pool:
            futs = [pool.submit(synthesize, s.narration, spec.voice, warnings) for s in spec.scenes]
            narrations = [f.result() for f in futs]
        cached = sum(1 for n in narrations if n.cached)
        log(f"narration ready in {time.monotonic() - t0:.1f}s ({cached}/{len(narrations)} from cache)")
        for s, n in zip(spec.scenes, narrations):
            speech_end = n.words[-1].end if n.words else n.duration
            if n.audio is not None:
                speech_end = max(speech_end, min(n.duration, speech_end + 0.05))
            dur = max(s.min_duration, (s.lead + speech_end + s.hold) if (n.words or n.audio) else 0.0)
            frames = max(1, math.ceil(dur * fps - 1e-6))
            words = [Word(w.text, w.start + s.lead, w.end + s.lead) for w in n.words]
            ps = PlannedScene(scene=s, narration=n, start=start, frames=frames, fps=fps, words=words)
            ps.chunks = chunk_words(words, spec.captions["max_words"], scene_end=ps.duration)
            planned.append(ps)
            start += ps.duration
    total = start
    fmt = get_format(spec.format)
    if total > fmt.max_duration:
        raise StudioError(f"video would be {total:.1f}s; the {fmt.name} limit is {fmt.max_duration:.0f}s. "
                          "Shorten narration.")
    if total < fmt.min_duration:
        warnings.append(f"video is {total:.1f}s; {fmt.name} QA expects at least {fmt.min_duration:.0f}s")

    long_side = fmt.long_side * 9 // 16 if preview else fmt.long_side  # 1080 / 1920 like before
    for ps in planned:
        if ps.scene.media is not None:
            ps.media = prepare_media(ps.scene.media, ps.duration, fps, preview, long_side)

    env = _jinja()
    base = env.get_template("_base.html")
    theme_css = (THEMES_DIR / f"{spec.theme}.css").as_uri()
    build_dir = build_dir.resolve()
    build_dir.mkdir(parents=True, exist_ok=True)
    for ps in planned:
        s = ps.scene
        tpl = load_template(s.template)
        props = dict(s.props)
        ctx = {"p": props, "brand": spec.brand, "has_media": ps.media is not None, "duration": ps.duration,
               "fps": fps, "index": s.index, "title": spec.title, "text_mode": spec.text, "format": spec.format}
        try:
            content = env.from_string(tpl.source).render(**ctx)
        except Exception as e:
            raise StudioError(f"scenes[{s.index}] template {s.template!r} failed to render: {e}") from e
        config = {
            "index": s.index, "template": s.template, "duration": ps.duration, "fps": fps, "props": props,
            "words": [w.to_json() for w in ps.words],
            "captions": {"enabled": bool(spec.captions["enabled"]), "style": spec.captions["style"],
                         "uppercase": bool(spec.captions.get("uppercase")), "chunks": [c.to_json() for c in ps.chunks]},
            "media": ps.media.to_page() if ps.media else None,
            "brand": spec.brand,
        }
        html = base.render(
            title=spec.title, index=s.index, template=s.template, has_media=ps.media is not None,
            theme_css=theme_css, base_css=(TEMPLATES_DIR / "_base.css").as_uri(),
            runtime_js=(TEMPLATES_DIR / "_runtime.js").as_uri(), config=_script_json(config),
            content=content, brand=spec.brand, source=s.source, caption_position=spec.captions["position"], text_mode=spec.text,
            format=spec.format, canvas_w=fmt.width, canvas_h=fmt.height,
        )
        ps.html = build_dir / f"scene_{s.index:02d}_{s.template}.html"
        ps.html.write_text(html, encoding="utf-8")
    return planned, track


def cover_scene(planned: list[PlannedScene]) -> tuple[PlannedScene, float]:
    ps = next((p for p in planned if p.scene.cover), planned[0])
    if ps.scene.cover_time is not None:
        t = ps.scene.cover_time
    elif ps.scene.template in ("hook", "lf-open"):
        t = 0.9
    else:
        t = 1.4
    return ps, max(0.0, min(t, ps.duration - 1 / ps.fps))


# ------------------------------------------------------------------- encoding


def encoder_args(fps: int, preview: bool) -> list[str]:
    return [
        "-vf", "scale=out_color_matrix=bt709:out_range=tv:flags=bicubic,format=yuv420p",
        "-c:v", "libx264", "-preset", "veryfast" if preview else "medium", "-crf", "24" if preview else "17",
        "-profile:v", "high", "-level:v", "4.1", "-pix_fmt", "yuv420p",
        "-r", str(fps), "-g", str(fps * 2), "-bf", "2",
        "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
        "-threads", "4", "-an",
    ]


def _run_tasks(tasks: list[capture.Task], workers: int, chromium: str | None, fmt: Format) -> list[dict]:
    results: list[dict] = []
    workers = max(1, min(workers, len(tasks)))
    log(f"capturing {sum(t.count for t in tasks)} frames in {len(tasks)} tasks on {workers} workers")
    ctx = mp.get_context("spawn")
    with ProcessPoolExecutor(max_workers=workers, mp_context=ctx, initializer=capture.worker_init,
                             initargs=(chromium, fmt.width, fmt.height)) as pool:
        futs = {pool.submit(capture.run_task_safe, t): t for t in tasks}
        for f in as_completed(futs):
            r = f.result()
            if "error" in r:
                for other in futs:
                    other.cancel()
                raise StudioError(f"scene {r['scene']} capture failed: {r['error']}"
                                  + (f"\n  page console: {r['console']}" if r.get("console") else ""))
            results.append(r)
    return results


def build_audio(planned: list[PlannedScene], music: dict | None, total: float, out_wav: Path,
                warnings: list[str], track: VoiceTrack | None = None) -> dict[str, Any] | None:
    """Mix narration and optional ducked music into ``out_wav``.

    Narration is either one take placed piece by piece (``track``) or one file
    per scene placed at the scene start. Returns None without audio, else
    ``{"clarity": ...}`` (voice-over-music level per spoken word).
    """
    inputs: list[str] = []
    filters: list[str] = []
    labels: list[str] = []
    if track is not None and track.pieces:
        inputs += ["-i", str(track.take.audio)]
        n = len(track.pieces)
        filters.append("[0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,"
                       + (f"asplit={n}" + "".join(f"[t{k}]" for k in range(n)) if n > 1 else "anull[t0]"))
        for k, pc in enumerate(track.pieces):
            d = pc.src_end - pc.src_start
            fd = min(0.008, d / 4)
            filters.append(f"[t{k}]atrim={pc.src_start:.4f}:{pc.src_end:.4f},asetpts=PTS-STARTPTS,"
                           f"afade=t=in:d={fd:.4f},afade=t=out:st={max(0.0, d - fd):.4f}:d={fd:.4f},"
                           f"adelay={int(round(pc.out_start * 1000))}:all=1[p{k}]")
            labels.append(f"[p{k}]")
    for ps in ([] if track is not None else planned):
        if ps.narration.audio is None:
            continue
        k = len(inputs) // 2
        inputs += ["-i", str(ps.narration.audio)]
        delay = int(round((ps.start + ps.scene.lead) * 1000))
        # trim each narration to its scene so a long tail never bleeds into the next scene's voice
        keep = max(0.1, ps.duration - ps.scene.lead + 0.05)
        filters.append(f"[{k}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,"
                       f"atrim=0:{keep:.3f},afade=t=out:st={max(0.0, keep - 0.04):.3f}:d=0.04,"
                       f"adelay={delay}:all=1[n{k}]")
        labels.append(f"[n{k}]")
    n_voice = len(labels)
    music_index = inputs.count("-i")
    if music is not None:
        if music.get("is_url"):
            from .media import download
            mpath, _ = download(music["path"])
        else:
            mpath = Path(music["path"])
        inputs += ["-stream_loop", "-1", "-i", str(mpath)]
    if n_voice == 0 and music is None:
        return None
    T = f"{total:.3f}"
    if n_voice:
        voice_mix = "".join(labels) + (f"amix=inputs={n_voice}:normalize=0:dropout_transition=0," if n_voice > 1 else "anull,")
        filters.append(f"{voice_mix}highpass=f=70,acompressor=threshold=-20dB:ratio=2.5:attack=5:release=90:makeup=1.5,"
                       f"apad=whole_dur={T},atrim=0:{T}[voice]")
    if music is not None:
        mi = music_index
        vol = float(music.get("volume", 0.12))
        filters.append(f"[{mi}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=0:{T},"
                       f"volume={vol:.3f},afade=t=in:d=0.4,afade=t=out:st={max(0.0, total - 1.5):.3f}:d=1.5[mus]")
        if n_voice:
            filters.append("[voice]asplit=3[vmain][vkey][vstem]")
            filters.append("[mus][vkey]sidechaincompress=threshold=0.02:ratio=8:attack=25:release=450:makeup=1,"
                           "asplit=2[duck][mstem]")
            filters.append("[vmain][duck]amix=inputs=2:normalize=0:dropout_transition=0[mix]")
        else:
            filters.append("[mus]anull[mix]")
    else:
        filters.append("[voice]anull[mix]")
    pcm = ["-t", T, "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le"]
    stems = music is not None and n_voice > 0
    vstem, mstem = out_wav.with_name("stem_voice.wav"), out_wav.with_name("stem_music.wav")
    run_ffmpeg([*inputs, "-filter_complex", ";".join(filters), "-map", "[mix]", *pcm, str(out_wav),
                *(["-map", "[vstem]", *pcm, str(vstem), "-map", "[mstem]", *pcm, str(mstem)] if stems else [])],
               "audio mix")
    words = [(ps.start + w.start, ps.start + w.end) for ps in planned for w in ps.words]
    return {"clarity": clarity(vstem, mstem, words, warnings) if stems else None}


CLARITY_TARGET = {"overall": 16.0, "worst": 10.0}  # dB voice over music, per spoken word


def _rms_windows(path: Path, spans: list[tuple[float, float]]) -> list[float]:
    import array
    import wave

    with wave.open(str(path), "rb") as w:
        rate, ch = w.getframerate(), w.getnchannels()
        data = array.array("h", w.readframes(w.getnframes()))
    out = []
    for a, b in spans:
        i0, i1 = int(a * rate) * ch, int(b * rate) * ch
        seg = data[i0:i1:ch * 4]  # every 4th frame of the left channel is plenty for an RMS
        out.append(math.sqrt(sum(x * x for x in seg) / len(seg)) if seg else 0.0)
    return out


def clarity(voice_wav: Path, music_wav: Path, words: list[tuple[float, float]], warnings: list[str]) -> dict:
    """Narration level minus (ducked) music level over each spoken word, in dB."""
    spans = [(a, b) for a, b in words if b - a > 0.05]
    if not spans:
        return {}
    v, m = _rms_windows(voice_wav, spans), _rms_windows(music_wav, spans)
    db = lambda x, y: 20 * math.log10(max(x, 1e-6) / max(y, 1e-6))  # noqa: E731
    per = [db(a, b) for a, b in zip(v, m)]
    overall = db(math.sqrt(sum(x * x for x in v) / len(v)), math.sqrt(sum(x * x for x in m) / len(m)))
    res = {"overall_db": round(min(overall, 99.0), 1), "worst_db": round(min(min(per), 99.0), 1),
           "target": CLARITY_TARGET}
    if res["overall_db"] < CLARITY_TARGET["overall"] or res["worst_db"] < CLARITY_TARGET["worst"]:
        warnings.append(f"music competes with the voice: {res['overall_db']} dB overall / {res['worst_db']} dB "
                        f"worst word (target >= {CLARITY_TARGET['overall']:.0f} / {CLARITY_TARGET['worst']:.0f}); "
                        "lower music.volume")
    return res


def contact_sheet(video: Path, out: Path, planned: list[PlannedScene], fmt: Format, cols: int = 4) -> None:
    """Tile ``n`` evenly spaced frames with timestamps (for vision QA)."""
    from PIL import Image, ImageDraw, ImageFont

    total = sum(p.duration for p in planned)
    n = fmt.contact_frames
    rows = math.ceil(n / cols)
    tw, th = fmt.contact_tile
    sheet = Image.new("RGB", (cols * tw + (cols + 1) * 8, rows * (th + 44) + (rows + 1) * 8), (24, 24, 26))
    draw = ImageDraw.Draw(sheet)
    font = None
    from .env import FONTS_DIR
    for cand in (FONTS_DIR / "JetBrainsMono-Variable.ttf",):
        try:
            font = ImageFont.truetype(str(cand), 22)
        except Exception:
            pass
    font = font or ImageFont.load_default()
    tmp = out.with_suffix(".frames")
    tmp.mkdir(exist_ok=True)
    try:
        for i in range(n):
            t = (i + 0.5) * total / n
            fp = tmp / f"{i:02d}.png"
            run_ffmpeg(["-ss", f"{t:.3f}", "-i", str(video), "-frames:v", "1", "-vf", f"scale={tw}:{th}", str(fp)],
                       "contact frame")
            scene = next((p for p in planned if p.start <= t < p.start + p.duration), planned[-1])
            x = 8 + (i % cols) * (tw + 8)
            y = 8 + (i // cols) * (th + 44 + 8)
            with Image.open(fp) as im:
                sheet.paste(im.convert("RGB"), (x, y))
            draw.text((x + 4, y + th + 8), f"{t:5.2f}s  #{scene.scene.index} {scene.scene.template}",
                      fill=(220, 220, 220), font=font)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    sheet.save(out, quality=88)


def _stamp(t: float) -> str:
    """YouTube chapter timestamp: M:SS below an hour, H:MM:SS above."""
    s = int(t)
    h, m, sec = s // 3600, (s % 3600) // 60, s % 60
    return f"{h}:{m:02d}:{sec:02d}" if h else f"{m}:{sec:02d}"


# ---------------------------------------------------------------------- main


def outputs_for(out: Path) -> dict[str, Path]:
    stem = out.with_suffix("")
    return {
        "video": out,
        "cover": Path(f"{stem}.cover.jpg"),
        "contact": Path(f"{stem}.contact.jpg"),
        "srt": Path(f"{stem}.captions.srt"),
        "chapters": Path(f"{stem}.chapters.txt"),
        "report": Path(f"{stem}.report.json"),
    }


def render(spec_path: str | Path, out: str | Path, preview: bool = False, workers: int | None = None,
           keep_build: bool = False) -> dict[str, Any]:
    t_start = time.monotonic()
    out = Path(out).expanduser().resolve()
    if out.suffix.lower() != ".mp4":
        raise StudioError(f"output must end with .mp4: {out}")
    out.parent.mkdir(parents=True, exist_ok=True)
    spec, warnings = _load_valid(spec_path)
    for w in warnings:
        log("WARNING: " + w)
    paths = outputs_for(out)
    build = Path(f"{out.with_suffix('')}.build")
    if build.exists():
        shutil.rmtree(build)
    build.mkdir(parents=True)
    ffmpeg = find_ffmpeg()
    chromium = chromium_or_raise()

    planned, track = plan(spec, preview, warnings, build)
    fps = planned[0].fps
    total_frames = sum(p.frames for p in planned)
    total = total_frames / fps
    log(f"timeline: {len(planned)} scenes, {total:.2f}s, {total_frames} frames @ {fps}fps")

    # capture tasks: split scenes into frame ranges, biggest first
    tasks: list[capture.Task] = []
    enc = encoder_args(fps, preview)
    scale = 0.5 if preview else 1.0
    for ps in planned:
        for first in range(0, ps.frames, CHUNK_FRAMES):
            count = min(CHUNK_FRAMES, ps.frames - first)
            seg = build / f"seg_{ps.scene.index:02d}_{first:05d}.mp4"
            tasks.append(capture.Task(scene=ps.scene.index, html=str(ps.html), first=first, count=count, fps=fps,
                                      scale=scale, out=str(seg), ffmpeg=ffmpeg, encoder=enc))
    cps, ct = cover_scene(planned)
    cover_png = build / "cover.png"
    tasks.append(capture.Task(scene=cps.scene.index, html=str(cps.html), first=0, count=0, fps=fps, scale=1.0,
                              out="", ffmpeg=ffmpeg, encoder=[], still_time=ct, still_out=str(cover_png),
                              hide_captions=True))
    order = sorted(tasks, key=lambda t: -t.count)
    t_cap = time.monotonic()
    fmt = get_format(spec.format)
    results = _run_tasks(order, workers or default_workers(), chromium, fmt)
    capture_s = time.monotonic() - t_cap
    log(f"capture done in {capture_s:.1f}s")
    scene_secs: dict[int, float] = {}
    for r in results:
        scene_secs[r["scene"]] = scene_secs.get(r["scene"], 0.0) + r["seconds"]
        for w in r.get("warnings", []):
            msg = f"scenes[{r['scene']}]: {w}"
            if msg not in warnings:
                warnings.append(msg)
                log("WARNING: " + msg)
        for c in r.get("console", []):
            msg = f"scenes[{r['scene']}] console {c}"
            if msg not in warnings:
                warnings.append(msg)
                log("WARNING: " + msg)

    # concat video segments
    segs = sorted((Path(t.out) for t in tasks if t.out), key=lambda p: p.name)
    concat_list = build / "segments.txt"
    concat_list.write_text("".join("file '" + str(p).replace("'", "'\\''") + "'\n" for p in segs))
    video_only = build / "video.mp4"
    run_ffmpeg(["-f", "concat", "-safe", "0", "-i", str(concat_list), "-c", "copy", str(video_only)], "concat segments")

    # audio
    mix = build / "mix.wav"
    audio_info = build_audio(planned, spec.music, total, mix, warnings, track)
    has_audio = audio_info is not None
    tmp_out = out.with_name(out.stem + ".part.mp4")
    mux = ["-i", str(video_only)]
    if has_audio:
        meas = measure_loudness(mix)
        if meas.get("input_i", -99) > -60:
            ln = (f"loudnorm=I={TARGET_LUFS}:TP={TARGET_TP}:LRA=11:measured_I={meas['input_i']}:"
                  f"measured_TP={meas['input_tp']}:measured_LRA={meas['input_lra']}:"
                  f"measured_thresh={meas['input_thresh']}:offset={meas['target_offset']}:linear=true,aresample=48000")
        else:
            ln = "anull"
            warnings.append("audio is (nearly) silent; loudness normalization skipped")
        mux += ["-i", str(mix), "-map", "0:v", "-map", "1:a", "-af", ln]
    else:
        warnings.append("no audio (voice provider 'none' and no music); adding a silent AAC track")
        mux += ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-map", "0:v", "-map", "1:a"]
    mux += ["-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
            "-t", f"{total:.3f}", "-movflags", "+faststart",
            "-metadata", f"title={spec.title}", str(tmp_out)]
    run_ffmpeg(mux, "mux")
    tmp_out.replace(out)

    # side outputs
    from PIL import Image
    with Image.open(cover_png) as im:
        im.convert("RGB").save(paths["cover"], quality=92)
    contact_sheet(out, paths["contact"], planned, fmt)
    chapters = [{"time": round(p.start, 3), "stamp": _stamp(p.start), "title": p.scene.chapter}
                for p in planned if p.scene.chapter]
    if chapters:
        paths["chapters"].write_text("".join(f"{c['stamp']} {c['title']}\n" for c in chapters), encoding="utf-8")
    else:
        paths.pop("chapters")
    global_chunks = []
    for ps in planned:
        for c in ps.chunks:
            global_chunks.append(Chunk(c.words, c.start + ps.start, min(c.end, ps.duration) + ps.start))
    paths["srt"].write_text(to_srt(global_chunks), encoding="utf-8")

    loud = measure_loudness(out) if has_audio else {}
    dens, dens_warn = density.analyse(
        [{"index": p.scene.index, "start": p.start, "duration": p.duration, "narration": p.scene.narration}
         for p in planned], fmt.name)
    for w in dens_warn:
        log("WARNING: " + w)
    warnings += dens_warn
    elapsed = time.monotonic() - t_start
    report = {
        "ok": True,
        "title": spec.title,
        "spec": str(spec.path),
        "preview": preview,
        "duration": round(total, 3),
        "fps": fps,
        "format": fmt.name,
        "resolution": list(fmt.preview_size) if preview else [fmt.width, fmt.height],
        "chapters": chapters,
        "frames": total_frames,
        "voice": {"provider": planned[0].narration.provider if planned else None,
                  "voice": next((p.narration.voice for p in planned if p.narration.voice), None),
                  **(track.report if track else {"mode": "scene"}),
                  "clarity": (audio_info or {}).get("clarity")},
        "loudness": {"integrated_lufs": loud.get("input_i"), "true_peak_dbtp": loud.get("input_tp"),
                     "lra": loud.get("input_lra"), "target_lufs": TARGET_LUFS} if loud else None,
        "density": dens,
        "cover": {"scene": cps.scene.index, "time": round(ct, 3)},
        "scenes": [
            {"index": p.scene.index, "template": p.scene.template, "start": round(p.start, 3),
             "duration": round(p.duration, 3), "frames": p.frames,
             "narration_seconds": round(p.narration.duration, 3), "words": len(p.words),
             "caption_chunks": len(p.chunks), "media": p.media.kind if p.media else None,
             "render_seconds": round(scene_secs.get(p.scene.index, 0.0), 2),
             "narration": p.scene.narration}
            for p in planned
        ],
        "render_seconds": round(elapsed, 1),
        "capture_seconds": round(capture_s, 1),
        "outputs": {k: str(v) for k, v in paths.items()},
        "warnings": warnings,
    }
    paths["report"].write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    if not keep_build:
        shutil.rmtree(build, ignore_errors=True)
    else:
        report["build_dir"] = str(build)
    log(f"done: {out.name} ({total:.1f}s video) in {elapsed:.1f}s")
    return report


def still(spec_path: str | Path, scene_index: int, t: float | None, out: str | Path, preview: bool = False,
          hide_captions: bool = False) -> dict[str, Any]:
    """Render one PNG/JPG frame of one scene (fast check while designing)."""
    out = Path(out).expanduser().resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    spec, warnings = _load_valid(spec_path)
    if not 0 <= scene_index < len(spec.scenes):
        raise StudioError(f"--scene must be 0..{len(spec.scenes) - 1}")
    build = out.parent / f".{out.stem}.still-build"
    planned, _ = plan(spec, preview, warnings, build)
    ps = planned[scene_index]
    tt = ps.duration * 0.6 if t is None else max(0.0, min(t, ps.duration - 1 / ps.fps))
    png = build / "still.png"
    fmt = get_format(spec.format)
    capture.worker_init(chromium_or_raise(), fmt.width, fmt.height)
    try:
        r = capture.run_task(capture.Task(scene=scene_index, html=str(ps.html), first=0, count=0, fps=ps.fps,
                                          scale=1.0, out="", ffmpeg="", encoder=[], still_time=tt,
                                          still_out=str(png), hide_captions=hide_captions))
    finally:
        capture.worker_close()
    from PIL import Image
    with Image.open(png) as im:
        if out.suffix.lower() in (".jpg", ".jpeg"):
            im.convert("RGB").save(out, quality=92)
        else:
            im.save(out)
    shutil.rmtree(build, ignore_errors=True)
    warnings += r.get("warnings", []) + [f"console {c}" for c in r.get("console", [])]
    return {"ok": True, "still": str(out), "scene": scene_index, "template": ps.scene.template, "time": round(tt, 3),
            "scene_duration": round(ps.duration, 3), "warnings": warnings}
