"""Select unused source seconds within editorially interchangeable camera coverage."""
import subprocess
import numpy as np


def reserve_footage(beats, lengths, clips, durations):
    occupied = {}
    for shot, seconds in zip(beats, lengths, strict=True):
        if shot['kind'] != 'footage' or shot.get('comparison'):
            continue
        index = shot['clip']
        if 'clipStart' in shot:
            start = shot['clipStart']
            if shot.get('originalSpeech') and start + seconds > durations[index] + .08:
                raise ValueError('Interview picture falls outside its matched audio')
            occupied.setdefault(index, []).append((start, start + seconds))

    for shot, seconds in zip(beats, lengths, strict=True):
        if shot['kind'] != 'footage' or shot.get('comparison') or 'clipStart' in shot:
            continue
        index = shot['clip']
        duration = durations[index]
        ranges = clips[index].get('coverage') or [{'start': 0, 'end': duration}]
        selected = occupied.setdefault(index, [])
        options = []
        for window in ranges:
            first, last = window['start'], min(window['end'], duration) - seconds
            if last < first - .04:
                continue
            last = max(last, first)
            # Interval overlap is piecewise linear. Its minimum occurs at an
            # endpoint or where an edge of this shot meets an existing cut.
            points = {first, last}
            for start, end in selected:
                points.update(max(first, min(last, point)) for point in (start-seconds, start, end-seconds, end))
            for t in points:
                overlap = sum(max(0, min(t+seconds, end)-max(t, start)) for start, end in selected)
                options.append((round(overlap, 5), t))
        if not options:
            raise ValueError(f'Clip {index} needs a continuous {seconds:.1f}s source range')
        _, start = min(options)
        shot['clipStart'] = round(start, 5)
        selected.append((start, start + seconds))


def place_footage(root, beats, lengths, clips):
    indices = {s['clip'] for s in beats if s['kind']=='footage' and not s.get('comparison')}
    durations = {}
    for index in indices:
        durations[index] = float(subprocess.check_output([
            'ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',
            root/f'clip-{index}.mp4']))
    reserve_footage(beats, lengths, clips, durations)

def choose_title_position(media, start):
    """Place text in a quiet corner of the actual camera frame."""
    pixels=subprocess.check_output(['ffmpeg','-v','error','-ss',str(start+.16),'-i',media,
        '-frames:v','1','-vf','scale=128:72','-pix_fmt','gray','-f','rawvideo','-'])
    if len(pixels)!=128*72:return 'upper-left'
    luminance=np.frombuffer(pixels,dtype=np.uint8).reshape(72,128).astype(float)
    edges=np.abs(np.gradient(luminance,axis=1))+np.abs(np.gradient(luminance,axis=0))
    corners={'upper-left':(0,0),'upper-right':(0,54),'lower-left':(45,0),'lower-right':(45,54)}
    def activity(position):
        y,x=corners[position]
        patch=luminance[y:y+27,x:x+74]
        return edges[y:y+27,x:x+74].mean()+.09*patch.std()+.015*patch.mean()
    return min(corners,key=activity)
