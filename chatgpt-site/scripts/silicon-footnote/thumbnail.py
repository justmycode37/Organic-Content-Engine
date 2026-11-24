"""Compose original YouTube covers from a script and independently sourced stills."""
import io
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageOps, ImageStat

from motion import font, wrap

SCALE = 3
W, H = 1280, 720
PAPER = '#f4f0e7'
MAX_BYTES = 2 * 1024 * 1024


def xy(x, y):
    return x * SCALE, y * SCALE


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
    concept = plan.get('thumbnails') or {}
    still = concept.get('still')
    shots = [s for beat in plan['beats'] for s in (beat, *beat.get('cutaways', []))
             if s.get('kind') == 'footage' and not s.get('originalSpeech')]
    if not shots:
        shots = [{'clip': 0}]

    def camera_frame(shot):
        index = shot.get('clip', 0)
        clip = pack['clips'][index]
        windows = clip.get('coverage') or []
        at = shot.get('clipStart', windows[0]['start'] if windows else 0) + .35
        raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-ss', str(at),
            '-i', str(root / f'clip-{index}.mp4'), '-frames:v', '1',
            '-f', 'image2pipe', '-c:v', 'png', '-'])
        return Image.open(io.BytesIO(raw)).convert('RGB'), {'label': clip['credit'], 'url': clip['url']}

    variants = [('subject', concept.get('subjectLine') or plan['title']),
                ('evidence', concept.get('evidenceLine') or opening['title'])]
    entries = []
    for variant, line in variants:
        source = None
        if variant == 'subject' and isinstance(still, int) and 0 <= still < len(pack.get('images', [])):
            try:
                with Image.open(root / f'image-{still}.png') as original:
                    source = ImageOps.exif_transpose(original).convert('RGB')
                asset = pack['images'][still]
                credit = {'label': asset['credit'], 'url': asset['page']}
            except (OSError, Image.DecompressionBombError):
                pass
        if source is None:
            source, credit = camera_frame(shots[0 if variant == 'subject' else len(shots)//2])
        image = ImageOps.fit(source, xy(W, H), method=Image.Resampling.LANCZOS)
        edges = image.resize((96, 54)).convert('L').filter(ImageFilter.FIND_EDGES)
        left = ImageStat.Stat(edges.crop((2, 2, 42, 52))).mean[0]
        right = ImageStat.Stat(edges.crop((54, 2, 94, 52))).mean[0]
        dark = Image.new('L', (W, 1))
        dark.putdata([round(215 * max(0, min(1, (970-x)/670))) for x in range(W)])
        if right < left:
            dark = ImageOps.mirror(dark)
        image.paste((8, 10, 13), (0, 0, *image.size), dark.resize(image.size))
        headline(ImageDraw.Draw(image), 660 if right < left else 56, 223, line, 566, PAPER)
        write_jpeg(image, root / f'thumbnail-{variant}.jpg')
        entries.append({'id': variant, 'line': line, 'credit': credit})
    return entries


if __name__ == '__main__':
    print(json.dumps(render(Path(sys.argv[1]).resolve())))
