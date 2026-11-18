"""Technical QA of a finished video (ffprobe + ffmpeg analysis filters).

The format (reel 1080x1920 or longform 1920x1080) is detected from the
resolution unless given explicitly.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from .env import StudioError
from .ffmpeg import ffprobe_json, run_ffmpeg
from .formats import FORMATS, format_for_size

LUFS_TARGET = -14.0
LUFS_TOLERANCE = 1.5
MAX_SILENCE = 1.5  # seconds of continuous silence allowed
MAX_BLACK = 0.5  # seconds of continuous black allowed


def qa(path: str | Path, fmt_name: str | None = None) -> dict[str, Any]:
    path = Path(path).expanduser().resolve()
    if not path.is_file():
        raise StudioError(f"file not found: {path}")
    info = ffprobe_json(path)
    checks: list[dict[str, Any]] = []

    def check(name: str, ok: bool, value: Any, expected: Any, severity: str = "error") -> None:
        checks.append({"check": name, "ok": bool(ok), "value": value, "expected": expected,
                       "severity": "ok" if ok else severity})

    v = next((s for s in info["streams"] if s.get("codec_type") == "video"), None)
    a = next((s for s in info["streams"] if s.get("codec_type") == "audio"), None)
    fmt = info.get("format", {})
    duration = float(fmt.get("duration", 0))
    target = FORMATS[fmt_name] if fmt_name else (format_for_size(v.get("width", 0), v.get("height", 0)) if v else None)
    target = target or FORMATS["reel"]

    check("container", "mp4" in fmt.get("format_name", ""), fmt.get("format_name"), "mp4")
    if v is None:
        check("video_stream", False, None, "present")
    else:
        check("resolution", (v.get("width"), v.get("height")) == (target.width, target.height),
              f"{v.get('width')}x{v.get('height')}", f"{target.width}x{target.height} ({target.name})")
        num, den = (v.get("avg_frame_rate") or "0/1").split("/")
        fps = float(num) / float(den or 1) if float(den or 1) else 0.0
        if target.name == "reel":
            check("fps", abs(fps - 30) < 0.05, round(fps, 3), 30)
        else:
            check("fps", any(abs(fps - f) < 0.05 for f in (24, 25, 30, 60)), round(fps, 3), "24/25/30/60")
        check("video_codec", v.get("codec_name") == "h264", v.get("codec_name"), "h264")
        check("h264_profile", v.get("profile") in ("High", "Main"), v.get("profile"), "High", severity="warning")
        check("pix_fmt", v.get("pix_fmt") == "yuv420p", v.get("pix_fmt"), "yuv420p")
    if a is None:
        check("audio_stream", False, None, "present")
    else:
        check("audio_codec", a.get("codec_name") == "aac", a.get("codec_name"), "aac")
        check("audio_rate", int(a.get("sample_rate", 0)) == 48000, int(a.get("sample_rate", 0)), 48000, severity="warning")
    check("duration", target.min_duration <= duration <= target.max_duration, round(duration, 2),
          f"{target.min_duration:.0f}..{target.max_duration:.0f} s ({target.name})")

    # faststart: moov before mdat
    with open(path, "rb") as f:
        head = f.read(1 << 16)
    moov, mdat = head.find(b"moov"), head.find(b"mdat")
    check("faststart", moov != -1 and (mdat == -1 or moov < mdat), "moov first" if moov != -1 else "moov late", "moov before mdat", severity="warning")

    loud: dict[str, float] = {}
    silences: list[dict[str, float]] = []
    blacks: list[dict[str, float]] = []
    filters_v = "blackdetect=d=0.2:pic_th=0.985:pix_th=0.04"
    args = ["-i", str(path)]
    if a is not None:
        args += ["-filter_complex",
                 f"[0:a]ebur128=peak=true,silencedetect=n=-45dB:d={MAX_SILENCE}[ao];[0:v]{filters_v}[vo]",
                 "-map", "[ao]", "-map", "[vo]"]
    else:
        args += ["-vf", filters_v, "-an"]
    err = run_ffmpeg([*args, "-f", "null", "-"], "QA analysis")

    m = re.findall(r"I:\s+(-?[\d.]+|-inf) LUFS", err)
    if m:
        loud["integrated_lufs"] = float(m[-1]) if m[-1] != "-inf" else -99.0
    m = re.findall(r"LRA:\s+(-?[\d.]+) LU", err)
    if m:
        loud["lra"] = float(m[-1])
    m = re.findall(r"Peak:\s+(-?[\d.]+|-inf) dBFS", err)
    if m:
        loud["true_peak_dbtp"] = float(m[-1]) if m[-1] != "-inf" else -99.0
    for st, du in re.findall(r"silence_end: (-?[\d.]+) \| silence_duration: ([\d.]+)", err):
        silences.append({"end": float(st), "duration": float(du)})
    for st, en, du in re.findall(r"black_start:([\d.]+) black_end:([\d.]+) black_duration:([\d.]+)", err):
        blacks.append({"start": float(st), "end": float(en), "duration": float(du)})

    if a is not None:
        il = loud.get("integrated_lufs")
        check("loudness", il is not None and abs(il - LUFS_TARGET) <= LUFS_TOLERANCE, il, f"{LUFS_TARGET} ±{LUFS_TOLERANCE} LUFS")
        tp = loud.get("true_peak_dbtp")
        check("true_peak", tp is not None and tp <= -0.5, tp, "<= -0.5 dBTP", severity="warning")
        check("silence", not silences, silences, f"no silence > {MAX_SILENCE}s", severity="warning")
    long_black = [b for b in blacks if b["duration"] > MAX_BLACK]
    check("black_frames", not long_black, blacks, f"no black segment > {MAX_BLACK}s")
    first_black = any(b["start"] < 0.05 for b in blacks)
    check("first_frame_not_black", not first_black, not first_black, True)

    errors = [c for c in checks if c["severity"] == "error"]
    warnings = [c for c in checks if c["severity"] == "warning"]
    return {
        "ok": not errors,
        "file": str(path),
        "format": target.name,
        "duration": round(duration, 3),
        "size_mb": round(path.stat().st_size / 1e6, 2),
        "loudness": loud,
        "errors": [f"{c['check']}: got {c['value']!r}, expected {c['expected']}" for c in errors],
        "warnings": [f"{c['check']}: got {c['value']!r}, expected {c['expected']}" for c in warnings],
        "checks": checks,
    }
