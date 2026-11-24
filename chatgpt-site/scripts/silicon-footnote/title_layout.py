"""Keep added titles clear of text that is already printed in archival footage."""
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

from film import W, H, lower
from footage import choose_title_position


def source_text_regions(root, shots):
    swift = shutil.which('swift') if sys.platform == 'darwin' else None
    if not swift or not shots:
        return {}
    with tempfile.TemporaryDirectory() as folder:
        paths, owners = [], []
        for index, beat, duration in shots:
            hold = min(duration, 4.7 if beat.get('originalSpeech') else 4.0)
            for moment in (hold * .15, hold * .58, hold * .88):
                frame = Path(folder) / f'{len(paths)}.jpg'
                subprocess.run(['ffmpeg', '-v', 'error', '-ss', str(beat['clipStart'] + moment),
                                '-i', root / f"clip-{beat['clip']}.mp4", '-frames:v', '1',
                                '-vf', 'scale=960:540:force_original_aspect_ratio=increase,crop=960:540',
                                '-y', frame], check=True)
                if frame.exists():
                    paths.append(str(frame))
                    owners.append(index)
        result = subprocess.run([swift, Path(__file__).with_name('title-text.swift')],
                                input=json.dumps(paths), capture_output=True, text=True)
        if result.returncode:
            print('Source text recognition unavailable. Using image contrast for placement.', file=sys.stderr)
            return {}
        regions = {}
        for index, boxes in zip(owners, json.loads(result.stdout), strict=True):
            regions.setdefault(index, []).extend((x*W, y*H, r*W, b*H) for x, y, r, b in boxes)
        return regions


def avoid_source_text(beat, credit, boxes):
    if not boxes:
        return
    if beat.get('originalSpeech'):
        # All positions stay below the speaker and share its horizontal center.
        key, candidates = 'tagLift', [0, 48, 90]
    else:
        key = 'titlePosition'
        candidates = list(dict.fromkeys([beat[key], 'upper-left', 'upper-right', 'lower-left', 'lower-right']))
    best, least = candidates[0], float('inf')
    for candidate in candidates:
        region = lower({**beat, key: candidate}, credit).getchannel('R').getbbox()
        if region is None:
            return
        x, y, right, bottom = region
        # Reserve the short vertical entrance as well as the finished lettering.
        overlap = sum(max(0, min(right+4, r)-max(x-4, l)) * max(0, min(bottom+16, b)-max(y-16, t))
                      for l, t, r, b in boxes)
        if overlap < least:
            best, least = candidate, overlap
        if not overlap:
            break
    if least and not beat.get('originalSpeech'):
        beat['clean'] = True
    else:
        beat[key] = best


def place_titles(root, beats, lengths, clips):
    shots = [(i, beat, duration) for i, (beat, duration) in enumerate(zip(beats, lengths, strict=True))
             if beat['kind'] == 'footage' and not beat.get('comparison') and not beat.get('closing')
             and not beat.get('clean') and beat.get('introduceSpeaker', True)]
    regions = source_text_regions(root, shots)
    for index, beat, _ in shots:
        if not beat.get('originalSpeech') and not beat.get('titlePosition'):
            beat['titlePosition'] = choose_title_position(root/f"clip-{beat['clip']}.mp4", beat['clipStart'])
        avoid_source_text(beat, clips[beat['clip']]['credit'], regions.get(index, []))
