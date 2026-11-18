"""Output formats: canvas, duration limits and QA targets per format.

``reel`` is the 9:16 Instagram/Shorts format the studio started with.
``longform`` is a 16:9 YouTube video (several minutes, chapters, thumbnail).
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Format:
    name: str
    width: int
    height: int
    min_duration: float  # seconds; below this the render warns and QA fails
    max_duration: float  # seconds; render refuses above this
    max_scenes: int
    contact_tile: tuple[int, int]  # contact sheet thumbnail size
    contact_frames: int
    first_template: str | None  # template the first scene should use (warning only)

    @property
    def preview_size(self) -> tuple[int, int]:
        return self.width // 2, self.height // 2

    @property
    def long_side(self) -> int:
        return max(self.width, self.height)


FORMATS: dict[str, Format] = {
    "reel": Format("reel", 1080, 1920, 15.0, 90.0, 40, (360, 640), 12, "hook"),
    "longform": Format("longform", 1920, 1080, 120.0, 1800.0, 240, (480, 270), 24, "lf-open"),
}

DEFAULT_FORMAT = "reel"


def get_format(name: str) -> Format:
    return FORMATS[name]


def format_for_size(width: int, height: int) -> Format | None:
    return next((f for f in FORMATS.values() if (f.width, f.height) == (width, height)), None)
