"""Paths, binary discovery and logging.

Every path is resolved relative to the studio folder (the parent of ``src/``),
so the studio can be moved or deployed to another machine unchanged.

Binary resolution order:
  ffmpeg/ffprobe: $STUDIO_FFMPEG / $STUDIO_FFPROBE -> ../tools/ffmpeg-*/ -> PATH
  chromium:       $STUDIO_CHROMIUM -> ../tools/chromium-*/ -> Playwright's cache
"""

from __future__ import annotations

import glob
import os
import platform
import shutil
import sys
import time
from pathlib import Path

STUDIO_DIR = Path(__file__).resolve().parents[2]
TOOLS_DIR = STUDIO_DIR.parent / "tools"
TEMPLATES_DIR = STUDIO_DIR / "templates"
THEMES_DIR = STUDIO_DIR / "themes"
ASSETS_DIR = STUDIO_DIR / "assets"
FONTS_DIR = ASSETS_DIR / "fonts"
CACHE_DIR = Path(os.environ.get("STUDIO_CACHE_DIR") or STUDIO_DIR / "cache")

_T0 = time.monotonic()


class StudioError(Exception):
    """An expected, user-facing error (bad spec, missing binary, ...)."""


def log(msg: str) -> None:
    """Log a line to stderr (stdout is reserved for machine-readable JSON)."""
    sys.stderr.write(f"[studio {time.monotonic() - _T0:6.1f}s] {msg}\n")
    sys.stderr.flush()


def _sorted_glob(pattern: str) -> list[str]:
    # newest version last -> pick reversed so the highest version wins
    return sorted(glob.glob(pattern), reverse=True)


def _executable(path: str | os.PathLike | None) -> str | None:
    if path and os.path.isfile(path) and os.access(path, os.X_OK):
        return str(path)
    return None


def find_ffmpeg() -> str:
    return _find_ff("ffmpeg", "STUDIO_FFMPEG")


def find_ffprobe() -> str:
    return _find_ff("ffprobe", "STUDIO_FFPROBE")


def _find_ff(name: str, env: str) -> str:
    cand = os.environ.get(env)
    if cand:
        if _executable(cand):
            return cand
        raise StudioError(f"${env} points to a missing or non-executable file: {cand}")
    for d in _sorted_glob(str(TOOLS_DIR / "ffmpeg-*")):
        exe = _executable(os.path.join(d, name)) or _executable(os.path.join(d, "bin", name))
        if exe:
            return exe
    exe = shutil.which(name)
    if exe:
        return exe
    if name == "ffprobe":  # ffprobe next to an ffmpeg that is on PATH
        ff = shutil.which("ffmpeg")
        if ff and _executable(os.path.join(os.path.dirname(ff), "ffprobe")):
            return os.path.join(os.path.dirname(ff), "ffprobe")
    raise StudioError(f"{name} not found: set ${env}, add it to PATH, or install it under {TOOLS_DIR}/ffmpeg-*/")


def _chromium_in(root: str) -> str | None:
    """Find the Chromium executable inside a Playwright-style browser folder."""
    system = platform.system()
    patterns: list[str]
    if system == "Darwin":
        patterns = [
            "chrome-mac*/*.app/Contents/MacOS/*",
            "chrome-mac*/Chromium.app/Contents/MacOS/Chromium",
        ]
    elif system == "Windows":
        patterns = ["chrome-win*/chrome.exe"]
    else:
        patterns = ["chrome-linux*/chrome", "chrome-linux*/headless_shell", "chrome-headless-shell-linux*/chrome-headless-shell"]
    for pat in patterns:
        for p in sorted(glob.glob(os.path.join(root, pat))):
            if _executable(p):
                return p
    return None


def find_chromium() -> str | None:
    """Return a Chromium executable path, or None to let Playwright use its default."""
    cand = os.environ.get("STUDIO_CHROMIUM")
    if cand:
        if _executable(cand):
            return cand
        raise StudioError(f"$STUDIO_CHROMIUM points to a missing or non-executable file: {cand}")
    for d in _sorted_glob(str(TOOLS_DIR / "chromium-*")):
        exe = _chromium_in(d)
        if exe:
            return exe
    # Playwright's own cache (installed via `playwright install chromium`)
    pw_root = os.environ.get("PLAYWRIGHT_BROWSERS_PATH")
    roots = [pw_root] if pw_root and pw_root != "0" else []
    home = Path.home()
    roots += [str(home / "Library/Caches/ms-playwright"), str(home / ".cache/ms-playwright")]
    for root in roots:
        for d in _sorted_glob(os.path.join(root, "chromium-*")):
            exe = _chromium_in(d)
            if exe:
                return exe
    return None


def chromium_or_raise() -> str | None:
    exe = find_chromium()
    if exe is None:
        log("no Chromium found in STUDIO_CHROMIUM/tools/Playwright cache; trying Playwright default")
    return exe


def default_workers() -> int:
    env = os.environ.get("STUDIO_WORKERS")
    if env and env.isdigit() and int(env) > 0:
        return int(env)
    cpus = os.cpu_count() or 2
    return max(1, min(8, cpus // 2))
