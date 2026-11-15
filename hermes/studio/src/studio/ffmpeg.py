"""Thin wrappers around ffmpeg/ffprobe."""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path
from typing import Any, Sequence

from .env import StudioError, find_ffmpeg, find_ffprobe


def run_ffmpeg(args: Sequence[str], what: str, capture: bool = False) -> str:
    """Run ffmpeg with ``args`` (without the binary). Returns stderr text."""
    cmd = [find_ffmpeg(), "-hide_banner", "-nostdin", "-y", *map(str, args)]
    proc = subprocess.run(cmd, stdout=subprocess.PIPE if capture else subprocess.DEVNULL,
                          stderr=subprocess.PIPE, text=True)
    if proc.returncode != 0:
        tail = "\n".join(proc.stderr.strip().splitlines()[-12:])
        raise StudioError(f"ffmpeg failed ({what}):\n{tail}")
    return proc.stderr


def ffprobe_json(path: str | Path) -> dict[str, Any]:
    cmd = [find_ffprobe(), "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise StudioError(f"ffprobe failed on {path}: {proc.stderr.strip()[:300]}")
    return json.loads(proc.stdout)


def probe_duration(path: str | Path) -> float:
    info = ffprobe_json(path)
    dur = info.get("format", {}).get("duration")
    if dur is None:
        for s in info.get("streams", []):
            if s.get("duration"):
                dur = s["duration"]
                break
    if dur is None:
        raise StudioError(f"cannot determine duration of {path}")
    return float(dur)


def measure_loudness(path: str | Path, extra_filters: str = "") -> dict[str, float]:
    """EBU R128 measurement via the loudnorm filter (first pass)."""
    af = (extra_filters + "," if extra_filters else "") + "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json"
    err = run_ffmpeg(["-i", str(path), "-af", af, "-vn", "-f", "null", "-"], "loudness measurement")
    m = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", err, re.S)
    if not m:
        raise StudioError("could not parse loudnorm output")
    d = json.loads(m.group(0))
    return {k: float(v) for k, v in d.items() if k != "normalization_type" and _is_float(v)}


def _is_float(v: Any) -> bool:
    try:
        float(v)
        return True
    except (TypeError, ValueError):
        return False
