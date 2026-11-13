"""Absolute, content-masked video comparison. Requires numpy, scipy, Pillow and ffmpeg.

python3 scripts/acryllex/compare.py reference.mov recreation.mp4 output.json
  --crop 1164:670:42:684 --fps 10 --spec spec.json --sheet sheet.png
An identical input scores 1; no ceiling adjustment or temporal alignment is applied.
"""
import argparse
import json
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter

WIDTH, HEIGHT = 582, 335


def compare(a, b):
    a = gaussian_filter(a.astype(np.float32) / 255, (3.5, 3.5, 0))
    b = gaussian_filter(b.astype(np.float32) / 255, (3.5, 3.5, 0))
    la, lb = a.max(-1), b.max(-1)
    ma, mb = gaussian_filter(la, 5), gaussian_filter(lb, 5)
    ca, cb = ma > .04, mb > .04
    union, inter = ca | cb, ca & cb
    if not union.any():
        # Small/faint content still counts; only two black pictures are identical.
        error = float(np.abs(a - b).mean())
        value = max(0., 1. - error * 255)
        return dict(score=value, structure=value, iou=value, colour=value)
    iou = float(inter.sum() / union.sum())
    va = np.maximum(0, gaussian_filter(la * la, 5) - ma * ma)
    vb = np.maximum(0, gaussian_filter(lb * lb, 5) - mb * mb)
    cv = gaussian_filter(la * lb, 5) - ma * mb
    st = ((2 * ma * mb + .0001) * (2 * cv + .0009)) / ((ma * ma + mb * mb + .0001) * (va + vb + .0009))
    structure = max(0., float(st[union].mean()))
    colour = 0.
    if inter.any():
        ha = a[inter] / np.maximum(la[inter, None], .001)
        hb = b[inter] / np.maximum(lb[inter, None], .001)
        colour = float(np.clip(1 - np.abs(ha - hb).mean() * 2, 0, 1))
    return dict(score=.45 * structure + .35 * iou + .2 * colour,
                structure=structure, iou=iou, colour=colour)


def decoder(path, fps, crop=None):
    filters = ([f'crop={crop}'] if crop else []) + [f'fps={fps}:start_time=0', f'scale={WIDTH}:{HEIGHT}:flags=area']
    return subprocess.Popen(['ffmpeg', '-v', 'error', '-i', str(path), '-vf', ','.join(filters),
                             '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)


def frame(process):
    size = WIDTH * HEIGHT * 3
    data = process.stdout.read(size)
    if not data:
        return None
    if len(data) != size:
        raise RuntimeError('Incomplete decoded frame')
    return np.frombuffer(data, np.uint8).reshape(HEIGHT, WIDTH, 3)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('reference'); parser.add_argument('recreation'); parser.add_argument('output')
    parser.add_argument('--crop'); parser.add_argument('--fps', type=float, default=10)
    parser.add_argument('--spec'); parser.add_argument('--sheet')
    args = parser.parse_args()
    # These guards also detect accidental background-only score inflation.
    test = np.zeros((HEIGHT, WIDTH, 3), np.uint8); test[80:200, 200:350, 0] = 200
    assert abs(compare(test, test)['score'] - 1) < 1e-6
    assert compare(test, np.zeros_like(test))['score'] < .01
    procs = [decoder(args.reference, args.fps, args.crop), decoder(args.recreation, args.fps)]
    rows, tiles, missing = [], [], 0
    try:
        i = 0
        while True:
            a, b = [frame(p) for p in procs]
            if a is None and b is None:
                break
            if a is None or b is None:
                missing += 1
                a = np.zeros_like(b) if a is None else a
                b = np.zeros_like(a) if b is None else b
            result = compare(a, b)
            rows.append(dict(t=round(i / args.fps, 6), **result))
            if args.sheet and i % max(1, round(args.fps)) == 0:
                tile = Image.new('RGB', (WIDTH * 2, HEIGHT + 22), '#222222')
                tile.paste(Image.fromarray(a), (0, 22)); tile.paste(Image.fromarray(b), (WIDTH, 22))
                ImageDraw.Draw(tile).text((5, 4), f'{i / args.fps:.2f}s  reference | recreation  {result["score"]:.3f}', fill='white')
                tiles.append(tile)
            i += 1
    finally:
        for p in procs:
            p.stdout.close()
            if p.wait() != 0:
                raise RuntimeError('ffmpeg decoding failed')
    if not rows:
        raise RuntimeError('No decoded frames')
    shots = []
    if args.spec:
        start = 0.
        for index, scene in enumerate(json.loads(Path(args.spec).read_text())['scenes']):
            end = start + scene['duration']
            selected = [r for r in rows if start <= r['t'] < end]
            shots.append(dict(index=index, shot=scene['say'], start=start, end=end,
                              score=float(np.mean([r['score'] for r in selected])) if selected else dict(index=index, score=0)))
            start = end
    output = dict(metric='content-masked-v1', identity=1, target=.99, fps=args.fps,
                  total=float(np.mean([r['score'] for r in rows])), missingFrames=missing,
                  shots=shots, frames=rows)
    Path(args.output).write_text(json.dumps(output, indent=2) + '\n')
    print(json.dumps({k: v for k, v in output.items() if k != 'frames'}, indent=2))
    if tiles:
        # Several modest-size sheets keep frame detail inspectable.
        for first in range(0, len(tiles), 6):
            group = tiles[first:first + 6]
            sheet = Image.new('RGB', (WIDTH * 2, (HEIGHT + 22) * len(group)))
            for j, tile in enumerate(group): sheet.paste(tile, (0, (HEIGHT + 22) * j))
            path = Path(args.sheet)
            sheet.save(path.with_name(f'{path.stem}-{first // 6 + 1}{path.suffix}'))


if __name__ == '__main__':
    main()
