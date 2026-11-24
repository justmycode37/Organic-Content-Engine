"""Edit picture on speech cues and insert attributed original sound at native speed."""
import json
import subprocess
import wave

def assemble(root,plan,durations,pack):
    beats,times=[],[]
    original_voice=root/'voice.wav'
    if not any(b.get('cutaways') or b.get('actuality') or b.get('insert') for b in plan['beats']):
        return plan,durations,original_voice
    aligned=json.loads((root/'alignment.json').read_text()) if (root/'alignment.json').exists() else []
    have_sound=any(b.get('actuality') for b in plan['beats'])
    positions=[]
    for i,(b,duration) in enumerate(zip(plan['beats'],durations,strict=True)):
        base={k:v for k,v in b.items() if k not in ('cutaways','actuality','insert')}
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
                if 'process' not in cut:shot.pop('process',None)
                if 'quote' not in cut:shot['quote']=''
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
            if length>=1/24:beats.append(shot);times.append(length)
        a=b.get('actuality')
        if a:
            length=a['end']-a['start']
            beats.append({**base,'kind':'footage','comparison':None,'clip':a['clip'],'clipStart':a['start'],'source':a['source'],'originalSpeech':True,'speakerX':a.get('speakerX',.5),'clean':False,'narration':'','nameplate':{k:a[k] for k in ('name','date','role')}})
            times.append(length)
        positions.append((duration,a))
    voice=original_voice
    if have_sound:
        voice=root/'broadcast.wav'
        with wave.open(str(original_voice)) as src,wave.open(str(voice),'wb') as dest:
            dest.setparams(src.getparams());sr=src.getframerate();elapsed=0
            for duration,a in positions:
                elapsed+=duration;count=min(src.getnframes(),round(elapsed*sr))-src.tell()
                dest.writeframes(src.readframes(count))
                if a:
                    n=round((a['end']-a['start'])*sr)
                    pcm=subprocess.check_output(['ffmpeg','-v','error','-ss',str(a['start']),'-i',root/f"clip-{a['clip']}.mp4",'-t',str(a['end']-a['start']),'-vn','-af','highpass=f=65,loudnorm=I=-19:TP=-2:LRA=10','-ar',str(sr),'-ac','1','-f','s16le','-'])
                    if abs(len(pcm)//2-n)>.08*sr:raise ValueError('Original-sound selection exceeds available media')
                    dest.writeframes(pcm[:n*2].ljust(n*2,b'\0'))
    edited={**plan,'beats':beats}
    return edited,times,voice
