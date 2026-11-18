"""Deterministic frame capture with Playwright/Chromium.

Each worker process owns one headless Chromium. A task renders a frame range
of one scene page: the page is loaded once, ``studio.init()`` pauses all
animations, then for every frame ``studio.seek(t)`` sets the animation clock,
swaps video frames and updates captions, and the frame is captured over CDP
and piped as PNG into an ffmpeg (image2pipe) process that encodes an H.264
segment. Segments of all scenes are later concatenated without re-encoding.
"""

from __future__ import annotations

import atexit
import base64
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

WIDTH, HEIGHT = 1080, 1920  # default (reel) canvas; worker_init takes the format size

CHROMIUM_ARGS = [
    "--allow-file-access-from-files",
    "--force-color-profile=srgb",
    "--font-render-hinting=none",
    "--hide-scrollbars",
    "--mute-audio",
    "--disable-lcd-text",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
]

_state: dict[str, Any] = {}


@dataclass
class Task:
    scene: int
    html: str  # scene page path
    first: int  # first frame (scene-local index)
    count: int  # number of frames
    fps: int
    scale: float  # 1.0 full, 0.5 preview
    out: str  # segment .mp4 path ("" for a still)
    ffmpeg: str
    encoder: list[str]
    still_time: float | None = None  # render a single PNG at this time instead
    still_out: str = ""
    hide_captions: bool = False


def worker_init(chromium: str | None, width: int = WIDTH, height: int = HEIGHT) -> None:
    from playwright.sync_api import sync_playwright

    pw = sync_playwright().start()
    browser = pw.chromium.launch(executable_path=chromium, args=CHROMIUM_ARGS, headless=True)
    context = browser.new_context(viewport={"width": width, "height": height}, device_scale_factor=1)
    page = context.new_page()
    cdp = context.new_cdp_session(page)
    _state.update(pw=pw, browser=browser, page=page, cdp=cdp, console=[], size=(width, height))
    page.on("console", lambda m: _state["console"].append(f"{m.type}: {m.text}") if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: _state["console"].append(f"pageerror: {e}"))
    atexit.register(worker_close)


def worker_close() -> None:
    try:
        if "browser" in _state:
            _state["browser"].close()
        if "pw" in _state:
            _state["pw"].stop()
    except Exception:
        pass
    _state.clear()


def _load(task: Task) -> dict:
    page = _state["page"]
    _state["console"] = []
    page.goto(Path(task.html).as_uri(), wait_until="load", timeout=60_000)
    info = page.evaluate("cfg => window.studio.init(cfg)", {"hideCaptions": task.hide_captions})
    if not isinstance(info, dict) or not info.get("ok"):
        raise RuntimeError(f"scene {task.scene}: studio.init failed: {info}")
    return info


def _capture(scale: float) -> bytes:
    params: dict[str, Any] = {"format": "png", "optimizeForSpeed": True}
    if scale != 1.0:
        width, height = _state.get("size", (WIDTH, HEIGHT))
        params["clip"] = {"x": 0, "y": 0, "width": width, "height": height, "scale": scale}
    data = _state["cdp"].send("Page.captureScreenshot", params)["data"]
    return base64.b64decode(data)


def run_task(task: Task) -> dict:
    """Render one task inside a worker. Returns timing and diagnostics."""
    t0 = time.monotonic()
    page = _state["page"]
    info = _load(task)
    warnings = list(info.get("warnings", []))

    if task.still_time is not None:
        page.evaluate("t => window.studio.seek(t)", task.still_time)
        Path(task.still_out).write_bytes(_capture(task.scale))
        return {"scene": task.scene, "still": task.still_out, "seconds": time.monotonic() - t0,
                "warnings": warnings, "console": _state["console"][:20]}

    cmd = [task.ffmpeg, "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
           "-f", "image2pipe", "-c:v", "png", "-framerate", str(task.fps), "-i", "-",
           *task.encoder, "-frames:v", str(task.count), task.out]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        for i in range(task.count):
            t = (task.first + i) / task.fps
            page.evaluate("t => window.studio.seek(t)", t)
            proc.stdin.write(_capture(task.scale))  # type: ignore[union-attr]
        proc.stdin.close()  # type: ignore[union-attr]
        err = proc.stderr.read().decode(errors="replace")  # type: ignore[union-attr]
        if proc.wait() != 0:
            raise RuntimeError(f"ffmpeg segment encode failed: {err[-800:]}")
    except BrokenPipeError:
        err = proc.stderr.read().decode(errors="replace")  # type: ignore[union-attr]
        proc.wait()
        raise RuntimeError(f"ffmpeg segment encode died: {err[-800:]}")
    finally:
        if proc.poll() is None:
            proc.kill()
    return {"scene": task.scene, "first": task.first, "count": task.count, "segment": task.out,
            "seconds": time.monotonic() - t0, "warnings": warnings, "console": _state["console"][:20]}


def run_task_safe(task: Task) -> dict:
    try:
        return run_task(task)
    except Exception as e:  # report back to the parent instead of crashing the pool
        return {"scene": task.scene, "error": f"{type(e).__name__}: {e}", "console": _state.get("console", [])[:20]}
