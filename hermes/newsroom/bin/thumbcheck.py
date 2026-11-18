#!/usr/bin/env python3
"""Thumbnail legibility check for a Reel cover.

Instagram shows covers as tiny tiles: ~130 px wide in the Reels tab (9:16) and
~130 px wide, 3:4 centre-cropped, in the profile grid. Headline typography
usually survives that; the photo subject often does not. This script writes a
sheet with the cover at both tile sizes plus nearest-neighbour enlargements so
the vision tool (or a human) can judge: "can you name the subject at tile size?"

Usage:
  python3 bin/thumbcheck.py runs/<run>/reel.cover.jpg [-o runs/<run>/reel.thumbcheck.jpg]

Exit code 0 always; the judgement is visual. Then look at the output with the
vision tool and ask: (1) is the subject nameable without the text, (2) is the
headline readable, (3) would a wider/more recognisable shot do better.
"""
import argparse
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:  # pragma: no cover
    sys.exit("Pillow missing: run with ../studio/.venv/bin/python or pip install pillow")

TILE_W = 130          # Reels-tab tile width on a ~390 pt phone
REEL_TILE = (TILE_W, round(TILE_W * 16 / 9))   # 9:16
GRID_TILE = (TILE_W, round(TILE_W * 4 / 3))    # 3:4 profile grid


def grid_crop(img: Image.Image) -> Image.Image:
    w, h = img.size
    ch = int(w * 4 / 3)
    top = (h - ch) // 2
    return img.crop((0, top, w, top + ch))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cover")
    ap.add_argument("-o", "--out", help="output sheet path (default: <cover>.thumbcheck.jpg)")
    args = ap.parse_args()

    src_path = Path(args.cover)
    out = Path(args.out) if args.out else src_path.with_suffix(".thumbcheck.jpg")
    src = Image.open(src_path).convert("RGB")

    R = Image.Resampling
    reel_tile = src.resize(REEL_TILE, R.LANCZOS)
    grid_tile = grid_crop(src).resize(GRID_TILE, R.LANCZOS)
    big_reel = reel_tile.resize((REEL_TILE[0] * 3, REEL_TILE[1] * 3), R.NEAREST)
    big_grid = grid_tile.resize((GRID_TILE[0] * 3, GRID_TILE[1] * 3), R.NEAREST)

    ref_h = big_reel.size[1]
    ref = src.resize((round(ref_h * src.size[0] / src.size[1]), ref_h), R.LANCZOS)

    pad = 24
    width = ref.size[0] + pad + TILE_W + pad + big_reel.size[0] + pad + big_grid.size[0] + 4 * pad
    height = ref_h + 2 * pad + 28
    sheet = Image.new("RGB", (width, height), (255, 255, 255))
    d = ImageDraw.Draw(sheet)

    x = pad
    sheet.paste(ref, (x, pad + 28)); d.text((x, pad), "cover", fill=(0, 0, 0)); x += ref.size[0] + pad
    sheet.paste(reel_tile, (x, pad + 28)); d.text((x, pad), "reels tile", fill=(0, 0, 0))
    sheet.paste(grid_tile, (x, pad + 28 + REEL_TILE[1] + pad)); x += TILE_W + pad
    sheet.paste(big_reel, (x, pad + 28)); d.text((x, pad), "reels tile x3 (pixels as seen)", fill=(0, 0, 0)); x += big_reel.size[0] + pad
    sheet.paste(big_grid, (x, pad + 28)); d.text((x, pad), "profile grid 3:4 x3", fill=(0, 0, 0))

    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out, quality=90)
    print(out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
