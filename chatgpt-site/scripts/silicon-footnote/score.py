"""Write a quiet original instrumental bed and picture-synchronous Foley in stereo."""
import math
import wave
import subprocess
from pathlib import Path
import numpy as np

SR=24000
BEAT=60/98
BAR=BEAT*4
CHORDS=[(50,57,60,64),(46,53,57,60),(53,60,64,67),(48,55,59,62),
        (50,57,60,65),(43,55,58,62),(46,53,57,64),(48,55,62,67)]
MELODY=[(1,2),(2.75,3),(3.5,1)]
def hz(note):return 440*2**((note-69)/12)

def score(path,timing,beats,pack=None):
    frames=round(sum(timing)*SR)
    starts=np.r_[0,np.cumsum(timing)[:-1]]
    events=[]
    for i,(moment,b) in enumerate(zip(starts,beats)):
        if i==0 or b['kind'] in ('chart','quote','document') and (i<2 or b['kind']!=beats[i-1]['kind']):
            events.append((moment+.15,'paper' if b['kind'] in ('quote','document') else 'key'))
        if b['kind'] in ('chart','terrain'):
            events.append((moment+.08,'sweep'))
            if b['kind']=='chart':
                reveal=max(.8,min(timing[i]*.48,3)) if b['chart'].get('layout')=='profile' else 1.05
                reveal=b.get('revealAt',reveal)
                if .12<reveal<timing[i]-.2:events.append((moment+reveal,'settle'))
        if b.get('insert'):events.append((moment+timing[i]*b['insert']['at'],'air'))
    rooms={}
    ambience=[]
    for i,b in enumerate(beats):
        if not pack or b['kind']!='footage' or b.get('originalSpeech') or b.get('trimFlashes'):continue
        clip=pack['clips'][b['clip']]
        offset=b.get('clipStart',0)
        if not clip.get('ambientSound') or not any(w['start']<=offset and offset+timing[i]<=w['end'] for w in clip.get('ambientRanges',[])):continue
        idx=b['clip']
        if idx not in rooms:
            pcm=subprocess.check_output(['ffmpeg','-v','error','-i',path.parent/f'clip-{idx}.mp4','-vn','-af','highpass=f=56,lowpass=f=6600','-ar',str(SR),'-ac','1','-f','f32le','-'])
            rooms[idx]=np.frombuffer(pcm,dtype='<f4')
        room=rooms[idx][round(offset*SR):round((offset+timing[i])*SR)]
        if len(room):
            rms=np.sqrt(np.mean(room**2))
            ambience.append((starts[i],room*min(1.6,.030/max(.001,rms))))
    interviews=[(starts[i],starts[i]+timing[i]) for i,b in enumerate(beats) if b.get('originalSpeech')]
    rng=np.random.default_rng(711)
    with wave.open(str(path),'wb') as w:
        w.setparams((2,2,SR,0,'NONE','not compressed'))
        tail=np.zeros((SR*3,2))
        for bar in range(math.ceil(frames/(BAR*SR))):
            start=round(bar*BAR*SR);n=min(frames-start,round((bar+1)*BAR*SR)-start)
            if n<=0:break
            raw=np.zeros((n+SR*3,2));raw[:len(tail)]+=tail
            position=start/frames
            movement=0 if position<.24 else 1 if position<.44 else 2 if position<.73 else 3
            chord=CHORDS[((bar//(3 if movement in (0,3) else 2))+[0,3,5,0][movement])%len(CHORDS)]
            def add(at,dur,signal,pan):
                j=round(at*SR);count=min(round(dur*SR),len(raw)-j)
                if count<=0:return
                t=np.arange(count)/SR
                v=signal(t)
                raw[j:j+count]+=v[:,None]*np.array([math.sqrt(1-pan),math.sqrt(pan)])
            # Sparse felt-key voicings; let notes overlap the next bar.
            notes=MELODY if bar%4==1 else [(0,1),(2.5,2)] if bar%4==3 else [(0,0),(1.75,2)]
            if movement==0:notes=[(0,0),(.75,1),(2.5,2)] if bar%2==0 else [(1.5,1)]
            if movement==2:notes=[(2,1)] if bar%4==0 else []
            if movement==3:notes=[(0,2),(2,3)] if bar%3==0 else []
            for j,(beat,degree) in enumerate(notes):
                f=hz(chord[degree]+(12 if bar%8 in (3,6) and j==1 else 0))
                def key(t,f=f):
                    attack=1-np.exp(-t/.015)
                    return .046*attack*np.exp(-t/1.03)*(np.sin(2*np.pi*f*t)+.31*np.exp(-t/.28)*np.sin(2*np.pi*f*2.001*t)+.12*np.sin(2*np.pi*f*3.007*t))
                add(beat*BEAT,2.8,key,.35+.25*j)
            for j,note in enumerate((chord[0]-12,chord[1],chord[2])):
                f=hz(note)
                def pad(t,f=f):
                    return .010*np.sin(np.pi*np.minimum(1,t/(BAR+.65)))**1.5*(np.sin(2*np.pi*f*t)+.39*np.sin(2*np.pi*(f+.44)*t))
                add(0,BAR+.65,pad,.26+.2*j)
            if movement in (0,1) and bar%8<6:
                for pos in (0,2):
                    add(pos*BEAT,.12,lambda t:.033*np.exp(-t/.036)*np.sin(2*np.pi*(48*t+.26*(1-np.exp(-t/.014)))),.5)
            for moment,kind in events:
                sec=moment-start/SR
                if not 0<=sec<n/SR:continue
                if kind=='sweep':
                    def sweep(t):
                        env=np.sin(np.pi*t/.29)**1.5
                        return .085*env*(np.sin(2*np.pi*(150*t+630*t*t))+.16*np.sin(2*np.pi*1520*t))
                    add(sec,.29,sweep,.58)
                elif kind=='settle':
                    add(sec,.24,lambda t:.082*(1-np.exp(-t/.003))*np.exp(-t/.047)*(np.sin(2*np.pi*760*t)+.37*np.sin(2*np.pi*1140*t)),.45)
                elif kind=='key':
                    add(sec,.30,lambda t:.060*(1-np.exp(-t/.003))*np.exp(-t/.050)*(np.sin(2*np.pi*590*t)+.45*np.sin(2*np.pi*890*t)),.58)
                else:
                    def rustle(t):
                        noise=np.convolve(rng.normal(size=len(t)+12),np.ones(13)/13,'valid')
                        envelope=np.sin(np.pi*t/.28)**2
                        return .09*noise*envelope
                    add(sec,.28,rustle,.38)
            tail=raw[n:].copy()
            clock=(start+np.arange(n))/SR
            fade=np.minimum(1,np.maximum(0,(frames/SR-clock)/1.9))*np.minimum(1,clock/.22)
            music=raw[:n].copy()
            for onset,end in interviews:
                if clock[-1]<onset-.4 or clock[0]>end+.4:continue
                distance=np.maximum(onset-clock,clock-end)
                music*= (.12+.88*np.clip(distance/.4,0,1))[:,None]
            for onset,room in ambience:
                offset=round(onset*SR);a=max(start,offset);b=min(start+n,offset+len(room))
                if a>=b:continue
                idx=np.arange(a-offset,b-offset)
                envelope=np.minimum(1,np.minimum(idx,len(room)-idx)/(.19*SR))
                music[a-start:b-start]+=room[idx,None]*envelope[:,None]
            w.writeframes((np.clip(music*fade[:,None],-1,1)*32767).astype('<i2').tobytes())
