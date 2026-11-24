"""Render cuts against each measured Titan take, then stream-copy the picture edit."""
import hashlib
import os
import re
import json
from concurrent.futures import ThreadPoolExecutor
from film import Sequence,lower
from score import score
from credits import write_credits,closing_cards
from timeline import assemble
from footage import place_footage, choose_title_position
from captions import render_captions
from PIL import Image
import subprocess
import sys
from pathlib import Path
from motion import W,H,FPS,Scene,lower_third

def run(args):
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*map(str,args)],check=True)

def compact_mux(root,mix,timing):
    # Release consumed silent clips while assembling the film. The shot list and
    # narration stay available to reproduce any clips needed after an interruption.
    files=[]
    for line in (root/'picture.list').read_text().splitlines():
        name=re.fullmatch(r"file '(edit-[0-9]+-[0-9a-f]{12}\.mp4)'",line)
        if not name:raise ValueError('Invalid generated shot filename')
        files.append(root/name[1])
    if len(files)!=len(timing):raise ValueError('Picture list does not match shot timing')
    target=root/'episode.partial.mp4'
    command=['ffmpeg','-v','error','-y','-stats_period','0.1','-progress','pipe:1','-f','concat','-safe','1',
             '-i',root/'picture.list','-i',mix,'-map','0:v:0','-map','1:a:0','-c','copy','-movflags','+faststart',target]
    with subprocess.Popen(command,stdout=subprocess.PIPE,text=True) as proc:
        index,elapsed=0,0
        for line in proc.stdout:
            key,_,value=line.strip().partition('=')
            if key!='out_time_us' or not value.isdigit():continue
            muxed=int(value)/1_000_000
            while index<len(files) and elapsed+timing[index]+3<muxed:
                elapsed+=timing[index]
                files[index].unlink(missing_ok=True)
                index+=1
        if proc.wait():raise RuntimeError('Unable to mux compact camera edit')
    target.replace(root/'episode.mp4')
    for path in files[index:]:path.unlink(missing_ok=True)

def render(root):
    plan=json.loads((root/'episode.json').read_text())
    pack=json.loads((root/'sources.json').read_text())
    timing=json.loads((root/'timing.json').read_text())
    captioned=bool(plan.get('captions',False))
    full_hd=plan.get('style')=='reported-footage' and not captioned
    if captioned:render_captions(root,plan,timing)
    plan,timing,voice=assemble(root,plan,timing,pack)
    cards=closing_cards(plan,pack) if plan.get('style')=='reported-footage' else []
    tail=4.5*len(cards) if plan.get('style')=='reported-footage' else 0
    if tail:
        last_index=next(i for i in reversed(range(len(plan['beats']))) if plan['beats'][i]['kind']=='footage' and not plan['beats'][i].get('originalSpeech'))
        last=plan['beats'][last_index]
        for i,card in enumerate(cards):
            plan['beats'].append({**last,'closing':True,'creditCard':card,'titlePosition':'upper-left','originalSpeech':False,'clean':False,'clipStart':last.get('clipStart',0)+timing[last_index]+4.5*i})
            timing.append(4.5)
    if plan.get('style')=='reported-footage':
        place_footage(root,plan['beats'],timing,pack['clips'])
        speakers=set()
        for b in plan['beats']:
            if b['kind']=='footage' and not b.get('originalSpeech') and not b.get('clean') and not b.get('titlePosition'):
                b['titlePosition']=choose_title_position(root/f"clip-{b['clip']}.mp4",b.get('clipStart',0))
            if b.get('originalSpeech'):
                identity=tuple(b['nameplate'].get(k,'').strip().casefold() for k in ('name','date'))
                b['introduceSpeaker']=identity not in speakers
                speakers.add(identity)
    (root/'picture-edit.json').write_text(json.dumps({'plan':plan,'seconds':timing},indent=2))
    write_credits(root,plan,pack)
    modern=all(beat.get('art') for beat in plan['beats'])
    compact=modern and not captioned and os.environ.get('NEWS_COMPACT_RENDER')=='1'
    if modern:
        audio=f'[1:a]apad=pad_dur={tail},loudnorm=I=-19:TP=-2:LRA=12,aresample=48000,pan=stereo|c0=c0|c1=c0[v];[2:a]volume=1.23[m];[v][m]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.89:level=0:latency=1[a]'
    if compact:
        # Render the mix before producing picture media, when PCM scratch has the most headroom.
        score(root/'score.wav',timing,plan['beats'],pack)
        mix=root/'mix.m4a'
        run(['-i',voice,'-i',root/'score.wav','-filter_complex',audio.replace('[1:a]','[0:a]').replace('[2:a]','[1:a]'),'-map','[a]','-c:a','aac','-b:a','160k',mix])
        (root/'score.wav').unlink()
        if voice!=root/'voice.wav':voice.unlink()
    cuts,clock,jobs=[],0,[]
    code=hashlib.sha256()
    for name in ['render.py','film.py','citation.py','motion.py','us-states.json']:
        code.update(Path(__file__).with_name(name).read_bytes())
    for i,(beat,length) in enumerate(zip(plan['beats'],timing,strict=True)):
        start=round(clock*FPS)
        clock+=length
        frames=round(clock*FPS)-start
        signature=code.copy()
        signature.update(json.dumps([beat,pack,frames,i,modern],sort_keys=True).encode())
        for view in [beat,beat.get('insert') or {},*(beat.get('comparison') or [])]:
            media=(root/f"image-{view['image']}.png" if view.get('image') is not None else None)
            if view is beat and beat['kind']=='footage':media=root/f"clip-{beat['clip']}.mp4"
            if view is beat and beat['kind'] in ('document','quote') and modern:
                phrase=beat.get('quote','') if beat['kind']=='quote' and '/status/' not in pack['sources'][beat['source']]['url'] else ''
                suffix='-'+hashlib.sha256(phrase.encode()).hexdigest()[:10] if phrase else ''
                media=root/f"press-{beat['source']}{suffix}.png"
                meta=media.with_suffix('.png.json')
                if meta.exists():signature.update(meta.read_bytes())
            if media and media.exists():signature.update(str(media.stat().st_mtime_ns).encode())
        path=root/f'edit-{i}-{signature.hexdigest()[:12]}.mp4'
        cuts.append(f"file '{path.name}'")
        if not path.exists():jobs.append((i,beat,length,frames,path))
    def shot(job):
        i,beat,length,frames,path=job
        target=path.with_suffix('.partial.mp4')
        codec=(['-s','1920x1080'] if full_hd else [])+['-frames:v',frames,'-an','-c:v','libx264','-threads','2','-preset','veryfast','-crf','20','-pix_fmt','yuv420p',target]
        if beat['kind']=='footage' and not beat.get('comparison'):
            clip=pack['clips'][beat['clip']]
            overlay=root/f'field-{i}.png'
            (lower(beat,clip['credit']) if modern else lower_third(beat,clip['credit'])).save(overlay)
            media=root/f"clip-{beat['clip']}.mp4"
            duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',media]))
            offset=round(min(beat.get('clipStart',(i*7.31)%max(1,duration-length)),max(0,duration-length)),3)
            width,height=(1920,1080) if full_hd else (W,H)
            select=''
            if beat.get('trimFlashes'):
                windows='+'.join(f'between(t,{a:.6f},{b:.6f})' for a,b in beat['trimFlashes'])
                select=f",select='not({windows})',setpts=N/({FPS}*TB)"
            graph=f'[0:v]fps={FPS}{select},scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height},setsar=1[v]'
            layer=['-framerate',str(FPS),'-loop','1','-i',overlay]
            if modern:
                hold=length if beat.get('closing') else min(length,4.7 if beat.get('originalSpeech') else 4.0)
                exit_start=max(.12,hold-.32)
                graph+=f";[1:v]scale={width}:{height},format=rgba,fade=t=in:st=0:d=0.28:alpha=1,fade=t=out:st={exit_start}:d=0.30:alpha=1[tag]"
                distance=16 if beat.get('originalSpeech') or beat.get('titlePosition','').startswith('lower') else -12
                graph+=f";[v][tag]overlay=x=0:y='{distance}*pow(max(0,1-t/0.32),2)':shortest=1"
            else:
                graph+=';[v][1:v]overlay'
            run(['-stream_loop','-1','-ss',offset,'-protocol_whitelist','file','-format_whitelist','mov','-i',media,*layer,'-filter_complex',graph,*codec])
        else:
            scene=Sequence(root,beat,pack,i) if modern else Scene(beat,pack['sources'][beat['source']],i,len(timing))
            if not modern and beat['kind']=='image':
                scene.figure=Image.open(root/f"image-{beat['image']}.png").convert('RGB')
                scene.credit=pack['images'][beat['image']]['credit']
            args=['ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-',*map(str,codec)]
            with subprocess.Popen(args,stdin=subprocess.PIPE) as proc:
                for n in range(frames):proc.stdin.write(scene.frame(n/FPS,length).tobytes())
                proc.stdin.close()
                if proc.wait():raise RuntimeError('Picture encoder failed')
        target.replace(path)
        print(f'Cut {i+1}/{len(timing)}',flush=True)
    with ThreadPoolExecutor(max_workers=3) as pool:
        list(pool.map(shot,jobs))
    (root/'picture.list').write_text('\n'.join(cuts))
    if compact:
        compact_mux(root,mix,timing)
        return
    args=['-f','concat','-safe','1','-i',root/'picture.list','-i',voice]
    if modern:
        score(root/'score.wav',timing,plan['beats'],pack)
        args+=['-i',root/'score.wav']
        if captioned:
            args+=['-i',root/'captions.mov','-i',root/'captions.vtt','-filter_complex',
                   audio+';[0:v][3:v]overlay=0:H-h-24:eof_action=pass,scale=1920:1080:flags=lanczos[vout]','-map','[vout]','-map','[a]','-map','4:s',
                   '-c:v','libx264','-threads','4','-preset','veryfast','-crf','18','-c:s','mov_text','-metadata:s:s:0','language=eng','-disposition:s:0','0']
        else:args+=['-filter_complex',audio,'-map','0:v:0','-map','[a]','-c:v','copy']
    else:args+=['-map','0:v:0','-map','1:a:0','-c:v','copy']
    run([*args,'-c:a','aac','-b:a','160k','-movflags','+faststart',root/'episode.partial.mp4'])
    (root/'episode.partial.mp4').replace(root/'episode.mp4')

if __name__=='__main__':
    render(Path(sys.argv[1]).resolve())
