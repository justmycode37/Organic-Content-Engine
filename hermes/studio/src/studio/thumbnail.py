"""YouTube thumbnails (1280x720 JPG): a background image plus 2-5 huge words.

Thumbnails decide click-through, so the production skill renders several
variants (different images, words, sides) and compares them at small size.
Background images can be press shots, frames from the video, or images made
with the image generation tool.
"""

from __future__ import annotations

import shutil
import tempfile
from pathlib import Path
from typing import Any

from .env import THEMES_DIR, StudioError, chromium_or_raise
from .render import _jinja

WIDTH, HEIGHT = 1280, 720
MAX_BYTES = 2 * 1024 * 1024  # YouTube's thumbnail limit


def thumbnail(out: str | Path, text: str, image: str | None = None, highlight: str | None = None,
              tag: str | None = None, side: str = "left", position: str = "center", theme: str = "default",
              mark: bool = True) -> dict[str, Any]:
    out = Path(out).expanduser().resolve()
    if out.suffix.lower() not in (".jpg", ".jpeg"):
        raise StudioError("thumbnail output must be a .jpg")
    words = len(text.split())
    if not 1 <= words <= 6:
        raise StudioError(f"thumbnail text should be 1-6 words, got {words}")
    if side not in ("left", "right"):
        raise StudioError("side must be 'left' or 'right'")
    img_uri = None
    if image:
        ip = Path(image).expanduser().resolve()
        if not ip.is_file():
            raise StudioError(f"image not found: {ip}")
        img_uri = ip.as_uri()
    theme_css = THEMES_DIR / f"{theme}.css"
    if not theme_css.is_file():
        raise StudioError(f"theme not found: {theme}")

    html = _jinja().get_template("_thumbnail.html").render(
        theme_css=theme_css.as_uri(), image=img_uri, text=text, highlight=highlight, tag=tag,
        side=side, position=position, mark=mark)
    tmp = Path(tempfile.mkdtemp(prefix="studio-thumb-"))
    try:
        page_path = tmp / "thumb.html"
        page_path.write_text(html, encoding="utf-8")
        png = tmp / "thumb.png"
        from playwright.sync_api import sync_playwright

        with sync_playwright() as pw:
            browser = pw.chromium.launch(executable_path=chromium_or_raise(), headless=True,
                                         args=["--allow-file-access-from-files", "--force-color-profile=srgb"])
            page = browser.new_page(viewport={"width": WIDTH, "height": HEIGHT}, device_scale_factor=1)
            page.goto(page_path.as_uri(), wait_until="load")
            page.evaluate("document.fonts.ready")
            fit = page.evaluate("window.FIT")
            page.screenshot(path=str(png))
            browser.close()
        from PIL import Image

        out.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(png) as im:
            rgb = im.convert("RGB")
            for q in (92, 86, 80, 72):
                rgb.save(out, quality=q, optimize=True)
                if out.stat().st_size <= MAX_BYTES:
                    break
            small = out.with_name(out.stem + ".small.jpg")
            rgb.resize((320, 180), Image.LANCZOS).save(small, quality=88)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    warnings = []
    if fit is not None and fit < 90:
        warnings.append(f"headline only fits at {fit}px; use fewer or shorter words")
    return {"ok": True, "thumbnail": str(out), "small_preview": str(small), "font_px": fit,
            "bytes": out.stat().st_size, "warnings": warnings}
