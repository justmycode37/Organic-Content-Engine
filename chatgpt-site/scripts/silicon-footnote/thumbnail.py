"""Composite legible thumbnail lettering onto separately generated artwork."""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

W, H = 3840, 2160
MAX_BYTES = 2 * 1024 * 1024
ACCENTS = {'white': '#fff9ed', 'yellow': '#ffdc48', 'cyan': '#55edff', 'pink': '#ff95c4'}


def condensed_font(size):
    paths = (
        '/System/Library/Fonts/Supplemental/Impact.ttf',
        '/System/Library/Fonts/Supplemental/Arial Narrow Bold.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    )
    return ImageFont.truetype(next(path for path in paths if Path(path).is_file()), size)


def lettering(words, width):
    splits = [(words,)]
    splits.extend((' '.join(words.split()[:i]), ' '.join(words.split()[i:]))
                  for i in range(1, len(words.split())))
    for size in range(430, 179, -10):
        face = condensed_font(size)
        candidates = [lines for lines in splits if all(face.getlength(line) <= width for line in lines)]
        if candidates:
            lines = max(candidates, key=lambda lines: min(face.getlength(line) for line in lines))
            return face, lines
    raise ValueError('Shorten the thumbnail copy')


def text_shadow(image, side, box_width):
    # A gradual scrim protects type over bright scenes and leaves the hero intact.
    strip = Image.new('L', (W, 1))
    strip.putdata([int(175 * max(0, 1 - x / (box_width + 530)) ** 1.25) for x in range(W)])
    if side == 'right':
        strip = strip.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    image.paste((9, 6, 9), (0, 0, W, H), strip.resize((W, H)))


def render(source, target, spec):
    with Image.open(source) as artwork:
        artwork = ImageOps.exif_transpose(artwork).convert('RGB')
        if artwork.width < 640 or artwork.width / artwork.height < 1.4:
            raise ValueError('Thumbnail artwork needs a wide composition and at least 640px width')
        image = ImageOps.fit(artwork, (W, H), method=Image.Resampling.LANCZOS)
    side = spec['side']
    width, margin = 1520, 175
    face, lines = lettering(spec['line'].upper(), width)
    text_shadow(image, side, width)
    draw = ImageDraw.Draw(image)
    line_height = round(face.size * .98)
    x = margin if side == 'left' else W - margin - width
    y = (H - line_height * len(lines)) // 2
    for index, line in enumerate(lines):
        color = ACCENTS[spec['accent']] if index == len(lines)-1 else ACCENTS['white']
        draw.text((x + 12, y + 23), line, font=face, anchor='lt', fill='#110909', stroke_width=16)
        draw.text((x, y), line, font=face, anchor='lt', fill=color, stroke_width=7, stroke_fill='#161011')
        y += line_height
    pending = target.with_suffix('.partial.jpg')
    try:
        for quality in (90, 84, 76, 65, 52):
            image.save(pending, format='JPEG', quality=quality, optimize=True)
            if pending.stat().st_size <= MAX_BYTES:
                pending.replace(target)
                return
        raise ValueError('Thumbnail exceeds the upload size limit')
    finally:
        pending.unlink(missing_ok=True)


if __name__ == '__main__':
    render(Path(sys.argv[1]), Path(sys.argv[2]), json.loads(sys.argv[3]))
