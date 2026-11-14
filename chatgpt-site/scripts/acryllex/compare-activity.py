"""Measure colored halftone activity without confusing red scenes with empty frames.

python3 scripts/acryllex/compare-activity.py reference.mov recreation.mp4 out.json \
  --crop 1164:670:42:684 --window human:150 --window calculator:430

Windows start at absolute output frame numbers after fps conversion. Measurements
include object motion and compression; they are diagnostics, not fidelity scores.
Requires ffmpeg, ffprobe, numpy and scipy (as does compare.py).
"""
import argparse
import json
import subprocess
from pathlib import Path

import numpy as np
from scipy.ndimage import gaussian_filter


def dimensions(path, crop=None):
    data = json.loads(subprocess.check_output([
        'ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
        'stream=width,height', '-of', 'json', str(path)]))['streams'][0]
    if crop:
        w, h, x, y = [int(v) for v in crop.split(':')]
        if min(w, h) < 1 or min(x, y) < 0 or x + w > data['width'] or y + h > data['height']:
            raise ValueError('Crop must be width:height:x:y inside the reference')
        return w, h
    return data['width'], data['height']


def decode_window(path, size, start, count, fps, crop=None, signal='chroma'):
    filters = ([f'crop={crop}'] if crop else []) + [f'fps={fps}:start_time=0',
        f"select='between(n,{start},{start + count - 1})'"]
    process = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', str(path), '-vf',
        ','.join(filters), '-frames:v', str(count), '-fps_mode', 'passthrough',
        '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
    width, height = size
    samples = []
    try:
        for _ in range(count):
            raw = process.stdout.read(width * height * 3)
            if not raw:
                break
            if len(raw) != width * height * 3:
                raise RuntimeError('Incomplete RGB frame')
            samples.append(prepare(np.frombuffer(raw, np.uint8).reshape(height, width, 3), signal))
        if process.wait() != 0:
            raise RuntimeError('ffmpeg decoding failed')
    finally:
        process.stdout.close()
        if process.poll() is None:
            process.terminate()
            process.wait()
    return samples


def prepare(rgb, signal='chroma'):
    rgb = rgb.astype(np.float32)
    # Max-minus-min measures blue and red equally and excludes white captions.
    chroma = np.clip((rgb.max(-1) - (rgb.min(-1) if signal == 'chroma' else 0)) / 190, 0, 1)
    return chroma > .35, gaussian_filter(chroma, 3)


def measure(samples, delta, pitch=3.72):
    pixels, cells, drift, counts = [], [], [], []
    for (a, ad), (b, bd) in zip(samples, samples[delta:]):
        mask = (ad > .08) & (ad < .85) & (bd > .08) & (bd < .85) & (abs(bd - ad) < .025)
        if mask.sum() < 100:
            continue
        y = np.arange(pitch / 2, a.shape[0], pitch).astype(int)
        x = np.arange(pitch / 2, a.shape[1], pitch).astype(int)
        selected = np.ix_(y, x)
        cm = mask[selected]
        if not cm.any():
            continue
        changed = a != b
        pixels.append(float(changed[mask].mean()))
        cells.append(float(changed[selected][cm].mean()))
        drift.append(float(abs(bd - ad)[mask].mean()))
        counts.append(int(mask.sum()))
    mean = lambda values: float(np.mean(values)) if values else None
    return dict(deltaFrames=delta, pairs=len(pixels), pixelTurnover=mean(pixels),
                cellTurnover=mean(cells), coarseDrift=mean(drift), stablePixels=mean(counts))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('reference'); parser.add_argument('recreation'); parser.add_argument('output')
    parser.add_argument('--crop')
    parser.add_argument('--fps', type=float, default=60)
    parser.add_argument('--pitch', type=float, default=3.72)
    parser.add_argument('--frames', type=int, default=21)
    parser.add_argument('--signal', choices=['chroma', 'intensity'], default='chroma',
                        help='Use intensity for white/gray ink; white captions then count too')
    parser.add_argument('--window', action='append', required=True, help='name:absolute-start-frame')
    args = parser.parse_args()
    if not 1 <= args.fps <= 120 or not 1 <= args.pitch <= 24 or args.frames < 9:
        parser.error('Use fps 1..120, pitch 1..24 and at least 9 frames')
    size = dimensions(args.reference, args.crop)
    if dimensions(args.recreation) != size:
        parser.error('Reference crop and recreation must have equal native dimensions')
    windows = []
    for value in args.window:
        try:
            name, start = value.rsplit(':', 1); start = int(start)
            if not name or start < 0:
                raise ValueError()
        except ValueError:
            parser.error('Window must be name:nonnegative-frame-number')
        windows.append((name, start))
    rows = []
    for label, path, crop in [('reference', args.reference, args.crop), ('recreation', args.recreation, None)]:
        for name, start in windows:
            samples = decode_window(path, size, start, args.frames, args.fps, crop, args.signal)
            for delta in [1, 2, 4, 8]:
                rows.append(dict(source=label, scene=name, startFrame=start,
                    missingFrames=args.frames - len(samples), **measure(samples, delta, args.pitch)))
    output = dict(metric='halftone-activity-v1', signal=args.signal, fps=args.fps, pitch=args.pitch,
        dimensions=size, rows=rows,
        limitation='Includes geometry, compression and grid phase. Cell sampling can alias. '
                   'No valid colored interior produces null, not zero. Not an accuracy percentage.')
    Path(args.output).write_text(json.dumps(output, indent=2, allow_nan=False) + '\n')
    print(json.dumps(dict(output=args.output, rows=len(rows), missingFrames=max(r['missingFrames'] for r in rows))))


if __name__ == '__main__':
    main()
