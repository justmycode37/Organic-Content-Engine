"""Speech-timed, burned-in captions with a matching selectable transcript."""
import bisect
import json
import re
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

FPS=24
WIDTH=1280
HEIGHT=108
def stamp(s):
    millis=round(1000*max(0,s));sec,ms=divmod(millis,1000);m,s=divmod(sec,60);h,m=divmod(m,60)
    return f'{h:02d}:{m:02d}:{s:02d}.{ms:03d}'

def caption_cues(plan,durations,alignment):
    clock=0;result=[]
    for b,seconds,a in zip(plan['beats'],durations,alignment,strict=True):
        if b['narration'].strip()!=a['text']:raise ValueError('Captions do not match the narrated passage')
        words=list(re.finditer(r'\S+',a['text']));group=[]
        for j,w in enumerate(words):
            group.append(w)
            next_word=words[j+1] if j+1<len(words) else None
            phrase=a['text'][group[0].start():w.end()]
            start=a['starts'][group[0].start()]
            end=a['starts'][next_word.start()] if next_word else seconds
            if next_word and len(phrase)+len(next_word[0])<63 and end-start<3.4 and (not re.search(r'[.!?][”"]?$',w[0]) or end-start<.75):continue
            result.append((clock+start,clock+end,phrase));group=[]
        clock+=seconds
        sound=b.get('actuality')
        if sound:
            if not sound.get('captions'):raise ValueError('Original speech needs timed source captions')
            for c in sound['captions']:
                start=max(sound['start'],c['start']);end=min(sound['end'],c['end'])
                if end>start:result.append((clock+start-sound['start'],clock+end-sound['start'],c['text']))
            clock+=sound['end']-sound['start']
    return result

def render_captions(root,plan,timing):
    alignment=json.loads((root/'alignment.json').read_text())
    cues=caption_cues(plan,timing,alignment)
    (root/'captions.vtt').write_text('WEBVTT\n\n'+'\n\n'.join(f'{stamp(s)} --> {stamp(e)}\n{txt}' for s,e,txt in cues)+'\n')
    paths=['/System/Library/Fonts/Supplemental/Arial.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']
    f=ImageFont.truetype(next(p for p in paths if Path(p).exists()),34)
    empty=Image.new('RGBA',(WIDTH,HEIGHT)).tobytes();cursor=0
    cmd=['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','rgba','-s',f'{WIDTH}x{HEIGHT}','-r',str(FPS),'-i','-','-c:v','qtrle','-pix_fmt','argb',root/'captions.mov']
    with subprocess.Popen(cmd,stdin=subprocess.PIPE) as proc:
        for s,e,txt in cues:
            start,end=round(s*FPS),round(e*FPS)
            for _ in range(cursor,start):proc.stdin.write(empty)
            im=Image.new('RGBA',(WIDTH,HEIGHT));d=ImageDraw.Draw(im);lines=['']
            for word in txt.split():
                test=(lines[-1]+' '+word).strip()
                if lines[-1] and f.getlength(test)>1020:lines.append(word)
                else:lines[-1]=test
            y=HEIGHT-len(lines)*46-5
            for line in lines:
                w=f.getlength(line);x=(WIDTH-w)/2
                d.rectangle((x-11,y-4,x+w+11,y+40),fill=(0,0,0,179));d.text((x,y+2),line,font=f,fill=(255,255,255,255),anchor='lt');y+=46
            pixels=im.tobytes()
            for _ in range(max(start,cursor),end):proc.stdin.write(pixels)
            cursor=max(cursor,end)
        proc.stdin.close()
        if proc.wait():raise RuntimeError('Caption overlay encoder failed')
