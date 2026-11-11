"""Rebuild PATCH NOTES' pixel font, wordmarks, illustration and PNG exports.

Run: python3 docs/brands/patch-notes/assets/build_assets.py
Requires Pillow and fontTools. Font and artwork use the same original pixel grid.
"""

import base64
import math
from pathlib import Path
import re
from xml.sax.saxutils import escape

from PIL import Image, ImageDraw
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont


OUT = Path(__file__).resolve().parent
GLYPHS = {
    "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    "C": ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
    "H": ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
    "N": ["10001", "11001", "11001", "10101", "10011", "10011", "10001"],
    "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
    "B": ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
    "D": ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
    "F": ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
    "G": ["01111", "10000", "10000", "10111", "10001", "10001", "01110"],
    "I": ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
    "J": ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
    "K": ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
    "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    "M": ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
    "Q": ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
    "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    "U": ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
    "V": ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
    "W": ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
    "X": ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
    "Y": ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
    "Z": ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
    "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
    "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
    "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
    "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
    "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
    "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
    "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
    "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
    ".": ["00000", "00000", "00000", "00000", "00000", "00100", "00100"],
    ",": ["00000", "00000", "00000", "00000", "00100", "00100", "01000"],
    ":": ["00000", "00100", "00100", "00000", "00100", "00100", "00000"],
    ";": ["00000", "00100", "00100", "00000", "00100", "00100", "01000"],
    "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
    "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
    "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
    '"': ["01010", "01010", "00000", "00000", "00000", "00000", "00000"],
    "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
    "_": ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
    "/": ["00001", "00001", "00010", "00100", "01000", "10000", "10000"],
    "\\": ["10000", "10000", "01000", "00100", "00010", "00001", "00001"],
    "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
    "=": ["00000", "00000", "11111", "00000", "11111", "00000", "00000"],
    "<": ["00010", "00100", "01000", "10000", "01000", "00100", "00010"],
    ">": ["01000", "00100", "00010", "00001", "00010", "00100", "01000"],
    "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
    ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
    "[": ["01110", "01000", "01000", "01000", "01000", "01000", "01110"],
    "]": ["01110", "00010", "00010", "00010", "00010", "00010", "01110"],
    "{": ["00010", "00100", "00100", "01000", "00100", "00100", "00010"],
    "}": ["01000", "00100", "00100", "00010", "00100", "00100", "01000"],
    "#": ["01010", "11111", "01010", "01010", "11111", "01010", "00000"],
    "$": ["00100", "01111", "10100", "01110", "00101", "11110", "00100"],
    "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
    "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
    "*": ["00000", "10101", "01110", "11111", "01110", "10101", "00000"],
    "@": ["01110", "10001", "10111", "10101", "10111", "10000", "01110"],
    "^": ["00100", "01010", "10001", "00000", "00000", "00000", "00000"],
    "`": ["01000", "00100", "00000", "00000", "00000", "00000", "00000"],
    "|": ["00100", "00100", "00100", "00100", "00100", "00100", "00100"],
    "~": ["00000", "00000", "01001", "10110", "00000", "00000", "00000"],
    "→": ["00000", "00100", "00010", "11111", "00010", "00100", "00000"],
    "←": ["00000", "00100", "01000", "11111", "01000", "00100", "00000"],
    "×": ["00000", "10001", "01010", "00100", "01010", "10001", "00000"],
    "•": ["00000", "00000", "00100", "01110", "00100", "00000", "00000"],
    "…": ["00000", "00000", "00000", "00000", "00000", "00000", "10101"],
}


def build_font():
    glyph_names = {character: f"uni{ord(character):04X}" for character in GLYPHS}
    order = [".notdef", "space", *glyph_names.values()]
    builder = FontBuilder(1000, isTTF=True)
    builder.setupGlyphOrder(order)
    glyphs, metrics = {}, {}
    for name in order:
        pen = TTGlyphPen(None)
        if name == ".notdef":
            rows = ["11111", "10001", "10001", "10001", "10001", "10001", "11111"]
        else:
            character = next((c for c, glyph in glyph_names.items() if glyph == name), None)
            rows = GLYPHS.get(character, [])
        for y, row in enumerate(rows):
            for x, filled in enumerate(row):
                if filled == "1":
                    left, bottom = x * 100, (6 - y) * 100
                    pen.moveTo((left, bottom))
                    pen.lineTo((left, bottom + 100))
                    pen.lineTo((left + 100, bottom + 100))
                    pen.lineTo((left + 100, bottom))
                    pen.closePath()
        glyphs[name] = pen.glyph()
        metrics[name] = (300 if name == "space" else 600, 0)
    cmap = {ord(character): glyph for character, glyph in glyph_names.items()}
    cmap.update({ord(c.lower()): glyph_names[c] for c in GLYPHS if c.isascii() and c.isalpha()})
    cmap.update({32: "space", 160: "space"})
    for alias, original in {"‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-"}.items():
        cmap[ord(alias)] = glyph_names[original]
    builder.setupCharacterMap(cmap)
    builder.setupGlyf(glyphs)
    builder.setupHorizontalMetrics(metrics)
    builder.setupHorizontalHeader(ascent=800, descent=-200)
    builder.setupNameTable({"familyName": "Patch Notes Pixel", "styleName": "Regular", "uniqueFontIdentifier": "PatchNotesPixel-Regular-1.1", "fullName": "Patch Notes Pixel Regular", "psName": "PatchNotesPixel-Regular", "version": "Version 1.100"})
    builder.setupOS2(sTypoAscender=800, sTypoDescender=-200, usWinAscent=800, usWinDescent=200, sxHeight=700, sCapHeight=700)
    builder.setupPost()
    builder.setupMaxp()
    builder.save(OUT / "patch-notes-pixel.ttf")
    web_font = TTFont(OUT / "patch-notes-pixel.ttf")
    web_font.flavor = "woff"
    web_font.save(OUT / "patch-notes-pixel.woff")


def pixel_orbit():
    bayer = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
    rectangles = []
    for row, y in enumerate(range(216, 846, 18)):
        for column, x in enumerate(range(288, 918, 18)):
            nx, ny = (x + 9 - 600) / 310, (y + 9 - 520) / 310
            distance = nx * nx + ny * ny
            if distance > 1:
                continue
            nz = math.sqrt(1 - distance)
            light = max(0.035, min(1, 0.12 - nx * 0.48 - ny * 0.52 + nz * 0.57))
            if light > (bayer[row % 4][column % 4] + 0.5) / 16:
                rectangles.append(f'<rect x="{x}" y="{y}" width="18" height="18"/>')
    rings = set()
    for angle in (-30, 25):
        rotation = math.radians(angle)
        for step in range(720):
            theta = step * math.pi / 360
            ex, ey = 450 * math.cos(theta), 135 * math.sin(theta)
            x = round((580 + ex * math.cos(rotation) - ey * math.sin(rotation)) / 12) * 12
            y = round((520 + ex * math.sin(rotation) + ey * math.cos(rotation)) / 12) * 12
            rings.add((x, y))
    ring_rectangles = "".join(f'<rect x="{x}" y="{y}" width="6" height="6"/>' for x, y in sorted(rings))
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1107" role="img" aria-label="Original black-and-white dithered pixel planet" shape-rendering="crispEdges"><rect width="1080" height="1107" fill="#000"/><g fill="#fff">' + "".join(rectangles) + '</g><g fill="#fff" opacity=".6">' + ring_rectangles + '</g></svg>'


def embed_preview(illustration):
    path = OUT.parent / "design-blueprint.html"
    html = path.read_text(encoding="utf-8")
    data = base64.b64encode((OUT / "patch-notes-pixel.woff").read_bytes()).decode("ascii")
    html, font_count = re.subn(r"/\* PIXEL_FONT_START \*/.*?/\* PIXEL_FONT_END \*/", "/* PIXEL_FONT_START */\n    @font-face { font-family:'Patch Notes Pixel'; src:url(data:font/woff;base64," + data + ") format('woff'); font-weight:400; font-style:normal; font-display:block; }\n    /* PIXEL_FONT_END */", html, flags=re.S)
    art = illustration.replace('<svg ', '<svg class="art" ', 1)
    html, art_count = re.subn(r"<!-- PIXEL_ART_START -->.*?<!-- PIXEL_ART_END -->", "<!-- PIXEL_ART_START -->" + art + "<!-- PIXEL_ART_END -->", html, flags=re.S)
    assert font_count == 1 and art_count == 1, "Preview embed markers are missing"
    path.write_text(html, encoding="utf-8")


def word(text, origin_x=0, origin_y=0):
    cells = []
    x = origin_x
    for character in text:
        if character == " ":
            # The previous glyph already advanced by one blank cell.
            x += 2
            continue
        for y, row in enumerate(GLYPHS[character]):
            for column, filled in enumerate(row):
                if filled == "1":
                    cells.append((x + column, origin_y + y))
        x += 6
    return cells, x - origin_x - 1


def svg(cells, width, height, label, padding=7, background=None):
    total_w, total_h = width + 2 * padding, height + 2 * padding
    rectangles = "".join(
        f'<rect x="{x + padding}" y="{y + padding}" width="1" height="1"/>'
        for x, y in cells
    )
    backdrop = (
        f'<rect width="{total_w}" height="{total_h}" fill="#000000"/>'
        if background else ""
    )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {total_w} {total_h}" '
        f'role="img" aria-label="{escape(label)}" shape-rendering="crispEdges">'
        f'<title>{escape(label)}</title>{backdrop}'
        f'<g fill="#FFFFFF">{rectangles}</g></svg>\n'
    )


def png(cells, width, height, path, scale=15, padding=7, background=None):
    image = Image.new(
        "RGBA", ((width + padding * 2) * scale, (height + padding * 2) * scale),
        (0, 0, 0, 255) if background else (0, 0, 0, 0),
    )
    draw = ImageDraw.Draw(image)
    for x, y in cells:
        left, top = (x + padding) * scale, (y + padding) * scale
        draw.rectangle((left, top, left + scale - 1, top + scale - 1), fill="white")
    image.save(path)


def main():
    build_font()
    illustration = pixel_orbit()
    (OUT / "patch-notes-pixel-orbit.svg").write_text(illustration + "\n", encoding="utf-8")
    embed_preview(illustration)
    cells, width = word("PATCH NOTES")
    assert width == 61
    (OUT / "patch-notes-wordmark-white.svg").write_text(
        svg(cells, width, 7, "PATCH NOTES — white pixel wordmark"), encoding="utf-8"
    )
    png(cells, width, 7, OUT / "patch-notes-wordmark-white.png")
    png(cells, width, 7, OUT / "patch-notes-wordmark-on-black.png", background=True)

    first, stacked_width = word("PATCH")
    second, _ = word("NOTES", origin_y=10)
    (OUT / "patch-notes-wordmark-stacked-white.svg").write_text(
        svg(first + second, stacked_width, 17, "PATCH NOTES — stacked white pixel wordmark"),
        encoding="utf-8",
    )
    monogram, monogram_width = word("PN")
    (OUT / "patch-notes-monogram-white.svg").write_text(
        svg(monogram, monogram_width, 7, "PN — white pixel monogram"), encoding="utf-8"
    )
    avatar = Image.new("RGB", (1080, 1080), "black")
    draw = ImageDraw.Draw(avatar)
    scale = 40
    left, top = (1080 - monogram_width * scale) // 2, (1080 - 7 * scale) // 2
    for x, y in monogram:
        x0, y0 = left + x * scale, top + y * scale
        draw.rectangle((x0, y0, x0 + scale - 1, y0 + scale - 1), fill="white")
    avatar.save(OUT / "patch-notes-avatar.png")
    print("Built the pixel font (TTF + WOFF), pixel illustration, 3 SVG marks, 2 wordmark PNGs and avatar; embedded font and illustration into the preview.")


if __name__ == "__main__":
    main()
