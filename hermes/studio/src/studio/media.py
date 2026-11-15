"""Media preparation: download URLs, normalize images, explode videos to frames.

Videos are not played by the browser. They are trimmed/scaled with ffmpeg into
a JPEG frame sequence at the render fps, and the scene runtime swaps the frame
for each captured video frame. That keeps capture deterministic and independent
of the browser's codec support (Playwright's Linux Chromium has no H.264).
"""

from __future__ import annotations

import hashlib
import mimetypes
import shutil
from dataclasses import dataclass
from pathlib import Path

from .env import CACHE_DIR, StudioError, log
from .ffmpeg import ffprobe_json, run_ffmpeg
from .spec import Media, _media_kind

MAX_IMAGE_SIDE = 2400
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"


@dataclass
class PreparedMedia:
    kind: str  # image | video
    path: Path  # image file, or frame directory for videos
    frame_count: int = 0
    fps: int = 0
    fit: str = "cover"
    position: str = "center"

    def to_page(self) -> dict:
        d = {"kind": self.kind, "url": self.path.as_uri(), "fit": self.fit, "position": self.position}
        if self.kind == "video":
            d.update(frameCount=self.frame_count, fps=self.fps)
        return d


def _h(*parts: object) -> str:
    return hashlib.sha256("|".join(map(str, parts)).encode()).hexdigest()[:24]


def download(url: str) -> tuple[Path, str | None]:
    """Download ``url`` into cache/downloads (cached by URL). Returns (path, kind)."""
    import httpx

    dl = CACHE_DIR / "downloads"
    dl.mkdir(parents=True, exist_ok=True)
    key = _h(url)
    existing = sorted(dl.glob(f"{key}.*"))
    existing = [p for p in existing if not p.name.endswith(".part")]
    if existing:
        return existing[0], _media_kind(existing[0].name)
    log(f"downloading {url}")
    try:
        with httpx.stream("GET", url, follow_redirects=True, timeout=60,
                          headers={"User-Agent": USER_AGENT}) as r:
            if r.status_code >= 400:
                raise StudioError(f"download failed: HTTP {r.status_code} for {url}")
            ctype = r.headers.get("content-type", "").split(";")[0].strip().lower()
            ext = Path(url.split("?", 1)[0]).suffix.lower()
            if not _media_kind("x" + ext):
                ext = mimetypes.guess_extension(ctype) or ""
                ext = {".jpe": ".jpg"}.get(ext, ext)
            if not _media_kind("x" + ext):
                raise StudioError(f"{url} is not an image/video (content-type {ctype!r})")
            tmp = dl / f"{key}{ext}.part"
            with open(tmp, "wb") as f:
                for chunk in r.iter_bytes(1 << 16):
                    f.write(chunk)
    except StudioError:
        raise
    except Exception as e:
        raise StudioError(f"download failed for {url}: {e}") from e
    final = dl / f"{key}{ext}"
    tmp.replace(final)
    return final, _media_kind(final.name)


def _prepare_image(src: Path) -> Path:
    from PIL import Image, ImageOps

    out_dir = CACHE_DIR / "media"
    out_dir.mkdir(parents=True, exist_ok=True)
    st = src.stat()
    key = _h(src, st.st_size, st.st_mtime_ns, MAX_IMAGE_SIDE)
    try:
        with Image.open(src) as im:
            im = ImageOps.exif_transpose(im)
            has_alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
            out = out_dir / f"{key}.{'png' if has_alpha else 'jpg'}"
            if out.is_file():
                return out
            im = im.convert("RGBA" if has_alpha else "RGB")
            im.thumbnail((MAX_IMAGE_SIDE, MAX_IMAGE_SIDE), Image.LANCZOS)
            im.save(out, quality=92) if not has_alpha else im.save(out)
            return out
    except StudioError:
        raise
    except Exception as e:
        raise StudioError(f"cannot read image {src}: {e}") from e


def _prepare_video(src: Path, start: float, duration: float, fps: int, max_side: int) -> tuple[Path, int]:
    st = src.stat()
    key = _h(src, st.st_size, st.st_mtime_ns, round(start, 3), round(duration, 3), fps, max_side)
    out_dir = CACHE_DIR / "media" / f"v_{key}"
    done = out_dir / ".done"
    if done.is_file():
        return out_dir, int(done.read_text())
    info = ffprobe_json(src)
    if not any(s.get("codec_type") == "video" for s in info.get("streams", [])):
        raise StudioError(f"{src} has no video stream")
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True)
    vf = (f"fps={fps},scale='if(gt(iw,ih),{max_side},-2)':'if(gt(iw,ih),-2,{max_side})':flags=lanczos,"
          f"format=yuvj420p")
    run_ffmpeg(["-ss", f"{start:.3f}", "-t", f"{duration + 0.2:.3f}", "-i", str(src), "-an", "-vf", vf,
                "-q:v", "3", "-start_number", "0", str(out_dir / "f_%05d.jpg")], f"extract frames from {src.name}")
    count = len(list(out_dir.glob("f_*.jpg")))
    if count == 0:
        raise StudioError(f"no frames extracted from {src} (start={start}s beyond the clip end?)")
    done.write_text(str(count))
    return out_dir, count


def prepare(media: Media, duration: float, fps: int, preview: bool) -> PreparedMedia:
    if media.is_url:
        path, kind = download(media.src)
        kind = media.kind or kind
    else:
        path, kind = Path(media.src), media.kind
    if kind is None:
        raise StudioError(f"cannot tell whether {media.src} is an image or a video; set media.kind")
    if kind == "image":
        return PreparedMedia("image", _prepare_image(path), fit=media.fit, position=media.position)
    frames, count = _prepare_video(path, media.start, duration, fps, 1080 if preview else 1920)
    return PreparedMedia("video", frames, frame_count=count, fps=fps, fit=media.fit, position=media.position)
