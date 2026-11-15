"""Generate a placeholder "data center aisle" image for the example spec.

Usage: python make_placeholder.py OUT.jpg [WIDTH HEIGHT]

Deterministic (fixed seed), no network. Two rows of server racks in one-point
perspective with LED dots and soft bokeh: reads as a real photo at a glance
and keeps the example reproducible.
"""

import random
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter


def main() -> None:
    out = sys.argv[1]
    w = int(sys.argv[2]) if len(sys.argv) > 2 else 1440
    h = int(sys.argv[3]) if len(sys.argv) > 3 else 2560
    rnd = random.Random(7)
    img = Image.new("RGB", (w, h), (8, 9, 12))
    d = ImageDraw.Draw(img)

    # floor/ceiling gradient
    for y in range(h):
        k = abs(y - h * 0.48) / (h * 0.52)
        c = int(10 + 26 * (1 - k) ** 2)
        d.line([(0, y), (w, y)], fill=(c, c + 1, c + 4))

    vx, vy = w * 0.5, h * 0.47  # vanishing point
    layer = Image.new("RGB", (w, h), (0, 0, 0))
    ld = ImageDraw.Draw(layer)
    for side in (-1, 1):
        # rack faces as perspective strips
        for i in range(26):
            z0, z1 = 1.0 / (1 + i * 0.32), 1.0 / (1 + (i + 0.92) * 0.32)
            x0 = vx + side * (w * 0.62) * z0
            x1 = vx + side * (w * 0.62) * z1
            top0, bot0 = vy - h * 0.55 * z0, vy + h * 0.5 * z0
            top1, bot1 = vy - h * 0.55 * z1, vy + h * 0.5 * z1
            shade = int(18 + 10 * z0)
            d.polygon([(x0, top0), (x1, top1), (x1, bot1), (x0, bot0)], fill=(shade, shade + 1, shade + 3))
            # LED rows
            rows = 34
            for r in range(rows):
                fy = (r + 0.5) / rows
                for j in range(3):
                    fx = 0.2 + 0.3 * j
                    if rnd.random() < 0.55:
                        continue
                    x = x0 + (x1 - x0) * fx
                    y0 = top0 + (bot0 - top0) * fy
                    y1 = top1 + (bot1 - top1) * fy
                    y = y0 + (y1 - y0) * fx
                    s = max(1.5, 7 * z0)
                    col = rnd.choice([(255, 110, 50), (255, 150, 80), (220, 230, 255), (120, 170, 255)])
                    ld.ellipse([x - s, y - s * 0.6, x + s, y + s * 0.6], fill=col)
    glow = layer.filter(ImageFilter.GaussianBlur(14))
    img = ImageChops.add(img, glow)
    img = ImageChops.add(img, layer.filter(ImageFilter.GaussianBlur(1.2)))

    # bokeh in the foreground
    bok = Image.new("RGB", (w, h), (0, 0, 0))
    bd = ImageDraw.Draw(bok)
    for _ in range(28):
        x, y = rnd.uniform(0, w), rnd.uniform(h * 0.1, h * 0.9)
        r = rnd.uniform(30, 110)
        col = rnd.choice([(90, 40, 15), (40, 50, 80), (70, 70, 75)])
        bd.ellipse([x - r, y - r, x + r, y + r], fill=col)
    img = ImageChops.add(img, bok.filter(ImageFilter.GaussianBlur(26)))

    # vignette
    vig = Image.new("L", (w, h), 0)
    vd = ImageDraw.Draw(vig)
    for i in range(60):
        k = i / 60
        vd.ellipse([-w * 0.3 + k * w * 0.25, -h * 0.2 + k * h * 0.15, w * 1.3 - k * w * 0.25, h * 1.2 - k * h * 0.15], fill=int(255 * k))
    vig = vig.filter(ImageFilter.GaussianBlur(80))
    img = Image.composite(img, Image.new("RGB", (w, h), (0, 0, 0)), vig)
    img.save(out, quality=90)


if __name__ == "__main__":
    main()
