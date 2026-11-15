"""Render pipeline: spec -> narration -> timeline -> scene pages -> frames -> MP4.

Steps
  1. validate the spec
  2. synthesize narration per scene (cached) and derive scene durations
  3. prepare media (download, normalize images, explode videos to frames)
  4. write one HTML page per scene (template + theme + runtime + config)
  5. capture frame ranges in parallel worker processes -> H.264 segments
  6. concatenate segments (stream copy), mix voice + ducked music,
     two-pass loudnorm to -14 LUFS, mux with +faststart
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

from . import capture
from .captions import Chunk, chunk_words, to_srt
from .env import TEMPLATES_DIR, THEMES_DIR, StudioError, chromium_or_raise, default_workers, find_ffmpeg, log
from .ffmpeg import measure_loudness, run_ffmpeg
from .media import PreparedMedia, prepare as prepare_media
from .spec import MAX_DURATION, MIN_DURATION, Scene, Spec, load_spec
from .templates import load_template
from .tts import Narration, Word, synthesize

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


def plan(spec: Spec, preview: bool, warnings: list[str], build_dir: Path) -> list[PlannedScene]:
    fps = 15 if preview else spec.fps
    t0 = time.monotonic()
    log(f"narration: {len(spec.scenes)} scenes via {spec.voice['provider']} ({spec.voice.get('voice')})")
    with ThreadPoolExecutor(max_workers=3) as pool:
        futs = [pool.submit(synthesize, s.narration, spec.voice, warnings) for s in spec.scenes]
        narrations = [f.result() for f in futs]
    cached = sum(1 for n in narrations if n.cached)
    log(f"narration ready in {time.monotonic() - t0:.1f}s ({cached}/{len(narrations)} from cache)")

    planned: list[PlannedScene] = []
    start = 0.0
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
    if total > MAX_DURATION:
        raise StudioError(f"reel would be {total:.1f}s; the limit is {MAX_DURATION:.0f}s. Shorten narration.")
    if total < MIN_DURATION:
        warnings.append(f"reel is {total:.1f}s; Instagram QA expects at least {MIN_DURATION:.0f}s")

    for ps in planned:
        if ps.scene.media is not None:
            ps.media = prepare_media(ps.scene.media, ps.duration, fps, preview)

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
               "fps": fps, "index": s.index, "title": spec.title}
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
            content=content, brand=spec.brand, source=s.source, caption_position=spec.captions["position"],
        )
        ps.html = build_dir / f"scene_{s.index:02d}_{s.template}.html"
        ps.html.write_text(html, encoding="utf-8")
    return planned


def cover_scene(planned: list[PlannedScene]) -> tuple[PlannedScene, float]:
    ps = next((p for p in planned if p.scene.cover), planned[0])
    if ps.scene.cover_time is not None:
        t = ps.scene.cover_time
    elif ps.scene.template == "hook":
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


def _run_tasks(tasks: list[capture.Task], workers: int, chromium: str | None) -> list[dict]:
    results: list[dict] = []
    workers = max(1, min(workers, len(tasks)))
    log(f"capturing {sum(t.count for t in tasks)} frames in {len(tasks)} tasks on {workers} workers")
    ctx = mp.get_context("spawn")
    with ProcessPoolExecutor(max_workers=workers, mp_context=ctx, initializer=capture.worker_init,
                             initargs=(chromium,)) as pool:
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
                warnings: list[str]) -> bool:
    """Mix narration (placed at scene starts) and optional ducked music. Returns has_audio."""
    inputs: list[str] = []
    filters: list[str] = []
    labels: list[str] = []
    for ps in planned:
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
    if music is not None:
        if music.get("is_url"):
            from .media import download
            mpath, _ = download(music["path"])
        else:
            mpath = Path(music["path"])
        inputs += ["-stream_loop", "-1", "-i", str(mpath)]
    if n_voice == 0 and music is None:
        return False
    T = f"{total:.3f}"
    if n_voice:
        voice_mix = "".join(labels) + (f"amix=inputs={n_voice}:normalize=0:dropout_transition=0," if n_voice > 1 else "anull,")
        filters.append(f"{voice_mix}highpass=f=70,acompressor=threshold=-20dB:ratio=2.5:attack=5:release=90:makeup=1.5,"
                       f"apad=whole_dur={T},atrim=0:{T}[voice]")
    if music is not None:
        mi = n_voice
        vol = float(music.get("volume", 0.12))
        filters.append(f"[{mi}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=0:{T},"
                       f"volume={vol:.3f},afade=t=in:d=0.4,afade=t=out:st={max(0.0, total - 1.5):.3f}:d=1.5[mus]")
        if n_voice:
            filters.append("[voice]asplit=2[vmain][vkey]")
            filters.append("[mus][vkey]sidechaincompress=threshold=0.02:ratio=8:attack=25:release=450:makeup=1[duck]")
            filters.append("[vmain][duck]amix=inputs=2:normalize=0:dropout_transition=0[mix]")
        else:
            filters.append("[mus]anull[mix]")
    else:
        filters.append("[voice]anull[mix]")
    run_ffmpeg([*inputs, "-filter_complex", ";".join(filters), "-map", "[mix]", "-t", T,
                "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", str(out_wav)], "audio mix")
    return True


def contact_sheet(video: Path, out: Path, planned: list[PlannedScene], n: int = 12, cols: int = 4) -> None:
    """Tile ``n`` evenly spaced frames with timestamps (for vision QA)."""
    from PIL import Image, ImageDraw, ImageFont

    total = sum(p.duration for p in planned)
    rows = math.ceil(n / cols)
    tw, th = 360, 640
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


# ---------------------------------------------------------------------- main


def outputs_for(out: Path) -> dict[str, Path]:
    stem = out.with_suffix("")
    return {
        "video": out,
        "cover": Path(f"{stem}.cover.jpg"),
        "contact": Path(f"{stem}.contact.jpg"),
        "srt": Path(f"{stem}.captions.srt"),
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

    planned = plan(spec, preview, warnings, build)
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
    results = _run_tasks(order, workers or default_workers(), chromium)
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
    has_audio = build_audio(planned, spec.music, total, mix, warnings)
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
    contact_sheet(out, paths["contact"], planned)
    global_chunks = []
    for ps in planned:
        for c in ps.chunks:
            global_chunks.append(Chunk(c.words, c.start + ps.start, min(c.end, ps.duration) + ps.start))
    paths["srt"].write_text(to_srt(global_chunks), encoding="utf-8")

    loud = measure_loudness(out) if has_audio else {}
    elapsed = time.monotonic() - t_start
    report = {
        "ok": True,
        "title": spec.title,
        "spec": str(spec.path),
        "preview": preview,
        "duration": round(total, 3),
        "fps": fps,
        "resolution": [540, 960] if preview else [1080, 1920],
        "frames": total_frames,
        "voice": {"provider": planned[0].narration.provider if planned else None,
                  "voice": next((p.narration.voice for p in planned if p.narration.voice), None)},
        "loudness": {"integrated_lufs": loud.get("input_i"), "true_peak_dbtp": loud.get("input_tp"),
                     "lra": loud.get("input_lra"), "target_lufs": TARGET_LUFS} if loud else None,
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
    planned = plan(spec, preview, warnings, build)
    ps = planned[scene_index]
    tt = ps.duration * 0.6 if t is None else max(0.0, min(t, ps.duration - 1 / ps.fps))
    png = build / "still.png"
    capture.worker_init(chromium_or_raise())
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
