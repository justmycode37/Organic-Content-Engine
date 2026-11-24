"""Select unused source seconds within editorially interchangeable camera coverage."""
import re
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
            coverage = clips[index].get('coverage')
            if coverage and not shot.get('originalSpeech') and not any(
                window['start'] <= start and start + seconds <= min(window['end'], durations[index]) + .04
                for window in coverage
            ):
                # Word timing can lengthen an explicit B-roll selection past a clean window.
                del shot['clipStart']
                continue
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


def source_flashes(media):
    """Identify near-black transitions in archive footage at the edit frame rate."""
    result=subprocess.run([
        'ffmpeg','-hide_banner','-nostats','-i',media,'-map','0:v:0','-an',
        '-vf','fps=24,scale=96:54,blackdetect=d=0.001:pix_th=0.095:pic_th=0.96',
        '-f','null','-'],capture_output=True,text=True,check=True)
    matches=re.findall(r'black_start:([\d.]+) black_end:([\d.]+) black_duration:([\d.]+)',result.stderr)
    return [(float(start),float(end)) for start,end,duration in matches if 0<float(duration)<=1.5]


def trim_flashes(intervals, offset, length):
    """Express source flashes in the shot's clock, including its replacement frames."""
    trim=[]
    end_time=length
    for start,end in intervals:
        first=max(0,start-offset-1/24)
        last=end-offset+1/24
        if last<=0 or first>=end_time:
            continue
        trim.append((first,last))
        end_time+=last-first
    return trim


def place_footage(root, beats, lengths, clips):
    indices = {s['clip'] for s in beats if s['kind']=='footage' and not s.get('comparison')}
    durations = {}
    for index in indices:
        durations[index] = float(subprocess.check_output([
            'ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',
            root/f'clip-{index}.mp4']))
    reserve_footage(beats, lengths, clips, durations)
    broll_indices={s['clip'] for s in beats if s['kind']=='footage' and not s.get('originalSpeech') and not s.get('comparison')}
    intervals={i:source_flashes(root/f'clip-{i}.mp4') for i in broll_indices}
    for shot,seconds in zip(beats,lengths,strict=True):
        if shot['kind']!='footage' or shot.get('originalSpeech') or shot.get('comparison'):continue
        index=shot['clip']
        offset=min(shot['clipStart'],max(0,durations[index]-seconds))
        selected=trim_flashes(intervals[index],offset,seconds)
        if selected:shot['trimFlashes']=selected

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
