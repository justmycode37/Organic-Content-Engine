"""Compose original YouTube covers from a script and independently sourced stills."""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

from motion import font, wrap

SCALE = 3
W, H = 1280, 720
AMBER = '#ffcc70'
INK = '#10151a'
PAPER = '#f4f0e7'
MAX_BYTES = 2 * 1024 * 1024


def xy(x, y):
    return x * SCALE, y * SCALE


def rect(draw, box, **style):
    draw.rectangle(tuple(value * SCALE for value in box), **style)


def label(draw, x, y, words, size, color, *, mono=False):
    draw.text(xy(x, y), words, font=font(size * SCALE, mono=mono, bold=True),
              fill=color, anchor='lt')


def headline(draw, x, y, words, width, color):
    for size in range(102, 25, -2):
        face = font(size * SCALE, bold=True)
        lines = wrap(words, face, width * SCALE)
        if len(lines) <= 3 and all(face.getlength(line) <= width * SCALE for line in lines):
            for index, line in enumerate(lines):
                label(draw, x, y + index * (size + 9), line, size, color)
            return
    raise ValueError('Cover line is too long to render')


def document(draw, x, y, width, height, source_title):
    rect(draw, (x + 20, y + 20, x + width + 20, y + height + 20), fill='#6d5030')
    rect(draw, (x, y, x + width, y + height), fill=PAPER)
    label(draw, x + 35, y + 32, 'SOURCE', 23, INK, mono=True)
    face = font(44 * SCALE, bold=True)
    limit = (width - 70) * SCALE
    lines = wrap(source_title, face, limit)
    for index, line in enumerate(lines[:3]):
        if index == 2 and len(lines) > 3:
            line += '…'
        if face.getlength(line) > limit:
            line = line.rstrip('…')
            while face.getlength(line + '…') > limit:
                line = line[:-1]
            line += '…'
        label(draw, x + 35, y + 89 + 52 * index, line, 44, INK)
    rect(draw, (x + 35, y + height - 103, x + width - 42, y + height - 65), fill=AMBER)


def subject_illustration(draw, motif):
    rect(draw, (558, 0, W, H), fill='#292621')
    # A single large symbol stays legible at feed size.
    points = {
        'power': [(932, 130), (745, 393), (882, 393), (849, 589),
                  (1058, 311), (920, 311), (932, 130)],
        'document': [(752, 149), (981, 149), (1063, 231), (1063, 571),
                     (752, 571), (752, 149)],
    }
    if motif in points:
        draw.line([xy(x, y) for x, y in points[motif]], fill=AMBER,
                  width=17 * SCALE, joint='curve')
    if motif == 'document':
        draw.line([xy(981, 149), xy(981, 231), xy(1063, 231)],
                  fill=AMBER, width=17 * SCALE)
        for y in (300, 373, 446):
            rect(draw, (811, y, 999, y + 18), fill=PAPER)
    elif motif == 'chip':
        rect(draw, (757, 200, 1057, 500), fill=AMBER)
        rect(draw, (810, 253, 1004, 447), outline=INK, width=14 * SCALE)
        for offset in range(0, 241, 60):
            rect(draw, (775 + offset, 149, 798 + offset, 200), fill=PAPER)
            rect(draw, (775 + offset, 500, 798 + offset, 551), fill=PAPER)
            rect(draw, (706, 218 + offset, 757, 241 + offset), fill=PAPER)
            rect(draw, (1057, 218 + offset, 1108, 241 + offset), fill=PAPER)
    elif motif == 'workflow':
        path = [xy(702, 488), xy(854, 488), xy(854, 355),
                xy(961, 355), xy(961, 222), xy(1105, 222)]
        draw.line(path, fill=AMBER, width=16 * SCALE, joint='curve')
        for x, y in ((702, 488), (904, 355), (1105, 222)):
            draw.ellipse((*xy(x - 33, y - 33), *xy(x + 33, y + 33)), fill=PAPER)


def write_jpeg(image, path):
    temporary = path.with_suffix('.partial.jpg')
    try:
        for quality in (91, 84, 75, 64, 52):
            image.save(temporary, format='JPEG', quality=quality, optimize=True)
            if temporary.stat().st_size <= MAX_BYTES:
                temporary.replace(path)
                return
        raise ValueError('Cover exceeds the upload size limit')
    finally:
        temporary.unlink(missing_ok=True)


def render(root):
    plan = json.loads((root / 'episode.json').read_text())
    pack = json.loads((root / 'sources.json').read_text())
    opening = plan['beats'][0]
    source = pack['sources'][opening['source']]
    concept = plan.get('thumbnails') or {}
    subject = concept.get('subjectLine') or plan['title']
    evidence = concept.get('evidenceLine') or opening['title'] or plan['title']
    still = concept.get('still')
    images = pack.get('images', [])
    asset = images[still] if isinstance(still, int) and 0 <= still < len(images) else None
    credit = None

    # Cover A gives the title a single concrete subject.
    image = Image.new('RGB', xy(W, H), INK)
    if asset:
        try:
            with Image.open(root / f'image-{still}.png') as original:
                photo = ImageOps.fit(ImageOps.exif_transpose(original).convert('RGB'),
                                     xy(724, H), method=Image.Resampling.LANCZOS)
                image.paste(photo, xy(556, 0))
            credit = {'label': asset['credit'], 'url': asset['page']}
        except (OSError, Image.DecompressionBombError):
            pass
    draw = ImageDraw.Draw(image)
    if not credit:
        subject_illustration(draw, concept.get('motif', 'document'))
    rect(draw, (0, 0, 557, H), fill=INK)
    label(draw, 65, 73, 'SILICON FOOTNOTE', 22, AMBER, mono=True)
    headline(draw, 65, 240, subject, 444, PAPER)
    write_jpeg(image, root / 'thumbnail-subject.jpg')

    # Cover B uses typography and the opening source as its visual evidence.
    image = Image.new('RGB', xy(W, H), PAPER)
    draw = ImageDraw.Draw(image)
    rect(draw, (747, 0, W, H), fill=INK)
    rect(draw, (747, 0, 754, H), fill=AMBER)
    label(draw, 73, 73, 'SILICON FOOTNOTE', 22, INK, mono=True)
    headline(draw, 73, 230, evidence, 610, INK)
    document(draw, 785, 153, 434, 371, source['title'])
    write_jpeg(image, root / 'thumbnail-evidence.jpg')

    return [
        {'id': 'subject', 'line': subject, **({'credit': credit} if credit else {})},
        {'id': 'evidence', 'line': evidence},
    ]


if __name__ == '__main__':
    print(json.dumps(render(Path(sys.argv[1]).resolve())))
