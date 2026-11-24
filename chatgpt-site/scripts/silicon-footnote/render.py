"""Render cuts against each measured Titan take, then stream-copy the picture edit."""
import json
from PIL import Image
import subprocess
import sys
from pathlib import Path
from motion import W,H,FPS,Scene,lower_third

def run(args):
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*map(str,args)],check=True)

def render(root):
    plan=json.loads((root/'episode.json').read_text())
    pack=json.loads((root/'sources.json').read_text())
    timing=json.loads((root/'timing.json').read_text())
    cuts,clock=[],0
    for i,(beat,length) in enumerate(zip(plan['beats'],timing,strict=True)):
        # Round absolute boundaries to keep a long edit within one frame of speech.
        start=round(clock*FPS)
        clock+=length
        frames=round(clock*FPS)-start
        # The earlier graphic cache includes a persistent channel wordmark.
        name='shot' if beat['kind']=='footage' else 'editorial-v2'
        path=root/f'{name}-{i}.mp4'
        target=root/f'shot-{i}.partial.mp4'
        cuts.append(f"file '{path.name}'")
        if path.exists():
            continue
        codec=['-frames:v',frames,'-an','-c:v','libx264','-threads','3','-preset','veryfast','-crf','22','-pix_fmt','yuv420p',target]
        if beat['kind']=='footage':
            clip=pack['clips'][beat['clip']]
            overlay=root/'overlay.png'
            lower_third(beat,clip['credit']).save(overlay)
            media=root/f"clip-{beat['clip']}.mp4"
            duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',media]))
            offset=round((i*7.31)%max(1,duration-length),3) if duration>length else 0
            graph=f'[0:v]fps={FPS},scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2,setsar=1[v];[v][1:v]overlay=x=0:y=48*(1-min(t/0.5\\,1))'
            run(['-stream_loop','-1','-ss',offset,'-protocol_whitelist','file','-format_whitelist','mov','-i',media,'-i',overlay,'-filter_complex',graph,*codec])
        else:
            scene=Scene(beat,pack['sources'][beat['source']],i,len(timing))
            if beat['kind']=='image':
                scene.figure=Image.open(root/f"image-{beat['image']}.png").convert('RGB')
                scene.credit=pack['images'][beat['image']]['credit']
            args=['ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-',*map(str,codec)]
            with subprocess.Popen(args,stdin=subprocess.PIPE) as proc:
                for n in range(frames):
                    proc.stdin.write(scene.frame(n/FPS,length).tobytes())
                proc.stdin.close()
                if proc.wait():
                    raise RuntimeError('Picture encoder failed')
        target.replace(path)
        print(f'Cut {i+1}/{len(timing)}',flush=True)
    (root/'picture.list').write_text('\n'.join(cuts))
    run(['-f','concat','-safe','1','-i',root/'picture.list','-i',root/'voice.wav','-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','160k','-movflags','+faststart',root/'episode.partial.mp4'])
    (root/'episode.partial.mp4').replace(root/'episode.mp4')

if __name__=='__main__':
    render(Path(sys.argv[1]).resolve())
