"""Edit picture on speech cues and insert attributed original sound at native speed."""
import json
import subprocess
import re
import wave

def speech_loudness(pcm,sr):
    meter=subprocess.run(['ffmpeg','-hide_banner','-nostats','-f','s16le','-ar',str(sr),'-ac','1','-i','pipe:0','-af','ebur128','-f','null','-'],input=pcm,stderr=subprocess.PIPE,check=True)
    matches=re.findall(rb'I:\s+(-?[\d.]+) LUFS',meter.stderr)
    return float(matches[-1]) if matches else -70

def match_interview(pcm,nearby,sr):
    # Match the actual surrounding native take, then retain headroom for the handheld microphone.
    source,target=speech_loudness(pcm,sr),speech_loudness(nearby,sr)
    gain=max(-10,min(10,target-source)) if min(source,target)>-55 else 0
    filt=f'volume={gain:.3f}dB,alimiter=limit=0.89:level=0:latency=1,afade=t=in:d=0.008,afade=t=out:st={max(0,len(pcm)/(sr*2)-.012):.6f}:d=0.012'
    return subprocess.check_output(['ffmpeg','-v','error','-f','s16le','-ar',str(sr),'-ac','1','-i','pipe:0','-af',filt,'-f','s16le','-'],input=pcm)

def assemble(root,plan,durations,pack):
    beats,times=[],[]
    original_voice=root/'voice.wav'
    if not any(b.get('cutaways') or b.get('actuality') or b.get('insert') or b.get('readingHold') or any((b.get('chart') or {}).get(k) for k in ('revealCue','checkpoints','valueCues')) for b in plan['beats']):
        return plan,durations,original_voice
    aligned=json.loads((root/'alignment.json').read_text()) if (root/'alignment.json').exists() else []
    have_sound=any(b.get('actuality') or b.get('readingHold') for b in plan['beats'])
    positions=[]
    for i,(b,duration) in enumerate(zip(plan['beats'],durations,strict=True)):
        base={k:v for k,v in b.items() if k not in ('cutaways','actuality','insert','readingHold')}
        shots=[(0,base)]
        cutaways=list(b.get('cutaways',[]))
        if b.get('insert') and not cutaways:cutaways.append({**b['insert'],'kind':'image'})
        for cut in cutaways:
            t=cut['at']*duration
            if cut.get('cue') and i<len(aligned):
                pos=aligned[i]['text'].lower().find(cut['cue'].lower())
                if pos>=0:t=aligned[i]['starts'][pos]
            if .35<t<duration-.35:
                shot={**base,**cut,'art':{**base['art'],'headline':cut['title'],**cut.get('art',{})}}
                shot.pop('comparison',None)
                if cut.get('kind')!='chart':shot.pop('chart',None)
                if 'process' not in cut:shot.pop('process',None)
                if 'quote' not in cut:shot['quote']=''
                if 'frame' not in cut:shot.pop('frame',None)
                if cut['kind']=='footage' and 'clipStart' not in cut:
                    shot.pop('clipStart',None)
                if cut['kind']=='footage' and 'nameplate' not in cut:
                    shot['nameplate']={'name':cut['title'],'date':'','role':''}
                shots.append((t,shot))
        shots.sort(key=lambda x:x[0])
        if plan.get('style')=='reported-footage':
            # Nearby word cues can otherwise turn the end of a paragraph into a flash cut.
            retained=[shots[0]]
            for t,shot in shots[1:]:
                if len(retained)>1 and duration-t>=1.8:
                    prev,previous_shot=retained[-1]
                    advance=prev+1.8-t
                    if 0<advance<=.5 and t-1.8-retained[-2][0]>=1.8:
                        # Lead the previous cue by a few frames to keep the new
                        # exhibit on the spoken fact it explains.
                        retained[-1]=(t-1.8,previous_shot)
                if t-retained[-1][0]>=1.8-1e-6 and duration-t>=1.8:
                    retained.append((t,shot))
            shots=retained
        for j,(start,shot) in enumerate(shots):
            length=(shots[j+1][0] if j+1<len(shots) else duration)-start
            if shot.get('kind')=='chart' and (cue:=(shot.get('chart') or {}).get('revealCue')):
                a=aligned[i] if i<len(aligned) else {}
                pos=a.get('text','').lower().find(cue.lower())
                if pos<0:raise ValueError(f'Missing chart reveal cue: {cue}')
                shot={**shot,'revealAt':max(0,a['starts'][pos]-start)}
            if shot['kind']=='chart' and (checkpoints:=(shot.get('chart') or {}).get('checkpoints')):
                a=aligned[i]
                points=[]
                for checkpoint in checkpoints:
                    pos=a['text'].casefold().find(checkpoint['cue'].casefold())
                    if pos<0:raise ValueError('Missing trace cue: '+checkpoint['cue'])
                    at=a['starts'][pos]-start
                    if not 0<at<length or (points and at<=points[-1][0]):raise ValueError('Trace cue falls outside its shot or out of order')
                    points.append((at,checkpoint['index']))
                shot={**shot,'traceCues':points}
            if shot['kind']=='chart' and (words:=(shot.get('chart') or {}).get('valueCues')):
                a=aligned[i]
                cues=[]
                for word in words:
                    pos=a['text'].lower().find(word.lower())
                    if pos<0:raise ValueError('Missing bar cue: '+word)
                    at=a['starts'][pos]-start
                    if not 0<=at<length or (cues and at<=cues[-1]):raise ValueError('Bar cues must fall within the shot, in order')
                    cues.append(at)
                shot={**shot,'barCues':cues}
            if length>=1/24:beats.append(shot);times.append(length)
        hold=b.get('readingHold',0)
        if not 0<=hold<=4:raise ValueError('Reading hold must be between zero and four seconds')
        if hold:
            if duration<1/24:raise ValueError('Reading hold needs a visible shot')
            times[-1]+=hold
        a=b.get('actuality')
        if a:
            length=a['end']-a['start']
            if not 0<=a.get('tagStart',0)<length:raise ValueError('Speaker tag begins outside the interview')
            beats.append({**base,'kind':'footage','comparison':None,'clip':a['clip'],'clipStart':a['start'],'source':a['source'],'originalSpeech':True,'tagStart':a.get('tagStart',0),'speakerX':a.get('speakerX',.5),'clean':a.get('nativeNameplate',False),'frame':a.get('frame'),'narration':'','nameplate':{k:a[k] for k in ('name','date','role')}})
            times.append(length)
        positions.append((duration,hold,a))
    voice=original_voice
    if have_sound:
        voice=root/'broadcast.wav'
        with wave.open(str(original_voice)) as src,wave.open(str(voice),'wb') as dest:
            dest.setparams(src.getparams());sr=src.getframerate();elapsed=0
            for duration,hold,a in positions:
                elapsed+=duration;count=min(src.getnframes(),round(elapsed*sr))-src.tell()
                narration=src.readframes(count)
                dest.writeframes(narration)
                if hold:dest.writeframes(bytes(round(hold*sr)*src.getnchannels()*src.getsampwidth()))
                if a:
                    n=round((a['end']-a['start'])*sr)
                    pcm=subprocess.check_output(['ffmpeg','-v','error','-ss',str(a['start']),'-i',root/f"clip-{a['clip']}.mp4",'-t',str(a['end']-a['start']),'-vn','-af','highpass=f=65','-ar',str(sr),'-ac','1','-f','s16le','-'])
                    if abs(len(pcm)//2-n)>.08*sr:raise ValueError('Original-sound selection exceeds available media')
                    pcm=match_interview(pcm,narration[-sr*2*8:],sr)
                    dest.writeframes(pcm[:n*2].ljust(n*2,b'\0'))
    edited={**plan,'beats':beats}
    return edited,times,voice
