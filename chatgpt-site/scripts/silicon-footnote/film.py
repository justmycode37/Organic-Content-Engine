"""Picture direction for the long-form news edit, in a 1280 × 720 camera space."""
import hashlib
import json
import math
import re
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

from motion import ease, wrap
from citation import frame as citation_frame


W,H,FPS=1280,720,24
IVORY='#fff6e4'
GOLD='#f9ee49'
BLACK='#182b30'
WHITE='#ffffff'
PALETTE=['#00dcff','#ff287c','#eaff38','#ae77ff']
DIRECTORY=Path(__file__).resolve().parent
STATES=json.loads((DIRECTORY/'us-states.json').read_text())['states']

@lru_cache(128)
def face(size,style='sans'):
    names={'sans':('GillSans.ttc','DejaVuSans.ttf'),'bold':('DIN Alternate Bold.ttf','DejaVuSans-Bold.ttf'),
           'serif':('Georgia.ttf','DejaVuSerif.ttf'),'italic':('Georgia Italic.ttf','DejaVuSerif-Italic.ttf'),
           'narrow':('DIN Condensed Bold.ttf','DejaVuSansCondensed-Bold.ttf'),
           'scientific':('Arial Unicode.ttf','DejaVuSans.ttf'),'title':('Arial Bold.ttf','DejaVuSans-Bold.ttf')}
    mac,linux=names[style]
    paths=[Path('/System/Library/Fonts/Supplemental')/mac,Path('/usr/share/fonts/truetype/dejavu')/linux]
    return ImageFont.truetype(str(next(p for p in paths if p.exists())),size)

def typeblock(draw,x,y,text,width,size,color=IVORY,style='sans',lines=3,leading=1.12):
    if not text:return y
    if any(c in '₀₁₂₃₄₅₆₇₈₉·×' for c in text) and style!='title':
        style='scientific'
    for pts in range(size,13,-1):
        f=face(pts,style);rows=wrap(text,f,width)
        if len(rows)<=lines and max(f.getlength(line) for line in rows)<=width:break
    for row in rows:
        draw.text((round(x),round(y)),row,font=f,fill=color,anchor='lt')
        y+=round(pts*leading)
    return y

def publisher(source):
    host=urlsplit(source['url']).hostname.removeprefix('www.')
    common={'hsph.harvard.edu':'Harvard T.H. Chan School of Public Health','raw.githubusercontent.com':'Research team  /  public data','github.com':'GitHub','epa.gov':'U.S. Environmental Protection Agency','eia.gov':'U.S. Energy Information Administration · Hourly Electric Grid Monitor','x.com':'X','pbs.org':'PBS NewsHour','cbsnews.com':'CBS News'}
    if '/ai-emerald/' in source['url']:return 'Phoenix field trial  /  Colangelo and colleagues  /  published data'
    return common.get(host,host)

@lru_cache(16)
def photo(path):
    with Image.open(path) as original:
        im=ImageOps.exif_transpose(original).convert('RGB')
        im.thumbnail((2400,1800),Image.Resampling.LANCZOS)
        return im

def camera(source,size,q,reverse=False,anchor=(.5,.5),amount=.09):
    # Fractional source coordinates avoid the one-pixel staircase of integer crop boxes.
    w,h=size
    zoom=1.01+amount*(1-q if reverse else q)
    step=min(source.width/w,source.height/h)/zoom
    x=(source.width-step*w)*anchor[0];y=(source.height-step*h)*anchor[1]
    return source.transform(size,Image.Transform.AFFINE,(step,0,x,0,step,y),Image.Resampling.BILINEAR)

@lru_cache(4)
def shade(w,h):
    alpha=(np.linspace(0,1,h)**1.85*229).astype('uint8')
    layer=Image.new('RGBA',(w,h),(12,16,21))
    layer.putalpha(Image.fromarray(np.tile(alpha[:,None],(1,w))))
    return layer

def readable_credit(s):
    return re.sub(r'\s*[·|]\s*https?://.*','',s).replace(' from Minneapolis, Minnesota, United States','')

def source_imprint(im,credit):
    d=ImageDraw.Draw(im)
    typeblock(d,58,675,readable_credit(credit),1160,17,'#f4f0e9',lines=1)

def lower(beat,credit):
    im=Image.new('RGBA',(W,H),(0,0,0,0))
    d=ImageDraw.Draw(im)
    name=beat.get('nameplate') or {}
    if beat.get('clean'):return im
    if beat.get('originalSpeech'):
        if not beat.get('introduceSpeaker',True):return im
        person=name.get('name') or beat['title']
        role=name.get('role','')
        date=name.get('date','')
        boxw=min(1130,max(face(53,'title').getlength(person),face(34).getlength(role),face(24).getlength(date))+68)
        center=W*beat.get('speakerX',.5)
        x=round(max(48,min(W-48-boxw,center-boxw/2)))
        lift=beat.get('tagLift',0)
        d.rounded_rectangle((x,505-lift,x+boxw,(677 if date else 649)-lift),radius=12,fill=(18,20,22,223))
        typeblock(d,x+26,524-lift,person,boxw-52,53,WHITE,'title',1)
        typeblock(d,x+27,590-lift,role,boxw-52,34,WHITE,'sans',1)
        if date:typeblock(d,x+27,639-lift,date,boxw-52,24,'#e3e5e8',lines=1)
        return im
    card=beat.get('creditCard') or {}
    label=card.get('title','Sources & footage') if beat.get('closing') else (name.get('name') or beat['title'])
    details=card.get('text',readable_credit(credit)) if beat.get('closing') else '  ·  '.join(v for v in (name.get('date'),name.get('role')) if v)
    anchor=beat.get('titlePosition','upper-left')
    bottom=anchor.startswith('lower')
    right=anchor.endswith('right')
    gradient=np.maximum(0,1-np.arange(H)/350)**1.55
    if beat.get('closing'):
        gradient=.75+.25*gradient
    if bottom:gradient=gradient[::-1]
    im.putalpha(Image.fromarray(np.broadcast_to(np.uint8(224*gradient[:,None]),(H,W)).copy()))
    lines=wrap(label,face(66,'title'),1160)
    y=(H-49-68*min(2,len(lines))-(47 if details else 0)) if bottom else 45
    for text,size,style in [(label,66,'title'),(details,31,'sans')]:
        if not text:continue
        rows=wrap(text,face(size,style),1160)
        width=1160 if len(rows)>1 else min(1160,round(face(size,style).getlength(text))+2)
        x=W-55-width if right else 55
        y=typeblock(d,x,y,text,width,size,WHITE,style,2,1.02)+11
    return im

def atlas(d,states,box,progress,places=None):
    x,y,w,h=box
    for name,paths in STATES.items():
        fill='#565b5a' if name not in states else PALETTE[states.index(name)%4]
        for ring in paths:
            pts=[(x+(lon+125)/59*w,y+(50-lat)/26*h) for lon,lat in ring]
            d.polygon(pts,fill=fill,outline='#242828',width=1)
    # Use the largest landmass as each label's anchor.
    for i,name in enumerate(states):
        ring=max(STATES[name],key=len)
        lon=(max(p[0] for p in ring)+min(p[0] for p in ring))/2
        lat=(max(p[1] for p in ring)+min(p[1] for p in ring))/2
        if places:lon,lat=places[i]['lon'],places[i]['lat']
        cx=x+(lon+125)/59*w;cy=y+(50-lat)/26*h
        r=5+4*ease(progress*2-i*.4)
        d.ellipse((cx-r,cy-r,cx+r,cy+r),fill=IVORY,outline=BLACK,width=2)

class Sequence:
    def __init__(self,root,beat,material,index):
        self.root,self.b,self.pack,self.i=root,beat,material,index
        self.a=beat['art'];self.kind=beat['kind'];self.source=material['sources'][beat['source']]
        self.states=[name for name in STATES if re.search(r'\b'+name+r'\b',' '.join([self.a['headline'],*beat['labels'],beat['narration']]))]
        self.head=self.a['headline']
        self.caption=self.a['caption']
    def image(self,idx,q,title=None):
        spec=self.pack['images'][idx]
        source=photo(self.root/f'image-{idx}.png')
        if spec.get('panorama') and source.width/source.height>4:
            # Keep the entire scientific plate visible above its moving detail.
            im=Image.new('RGB',(W,H),'#151618')
            draw=ImageDraw.Draw(im)
            typeblock(draw,60,42,title or self.head,1160,48,WHITE,'title',1)
            width=1160
            overview_w=min(width,round(115*source.width/source.height))
            overview_h=max(1,round(overview_w*source.height/source.width))
            overview_x=(W-overview_w)//2
            im.paste(source.resize((overview_w,overview_h),Image.Resampling.LANCZOS),(overview_x,120))
            detail_h=330
            span=source.height*width/detail_h
            start=(source.width-span)*q
            detail=source.resize((width,detail_h),Image.Resampling.BICUBIC,
                                 box=(start,0,min(source.width,start+span),source.height))
            im.paste(detail,(60,268))
            left=overview_x+start*overview_w/source.width
            right=overview_x+(start+span)*overview_w/source.width
            draw.rectangle((left,118,right,122+overview_h),outline=PALETTE[0],width=3)
            source_imprint(im,spec['credit'])
            return im
        if spec.get('figure'):
            # Preserve axes, uncertainty bars and legends throughout the camera move.
            im=Image.new('RGB',(W,H),'#151618')
            draw=ImageDraw.Draw(im)
            typeblock(draw,60,42,title or self.head,1160,48,WHITE,'title',1)
            available=(1156,489)
            scale=min(available[0]/source.width,available[1]/source.height)
            zoom=.95+.05*(1-q if self.i%2 else q)
            width,height=(max(1,round(v*scale*zoom)) for v in source.size)
            pos=((W-width)//2,115+(available[1]-height)//2)
            im.paste(source.resize((width,height),Image.Resampling.LANCZOS),pos)
            source_imprint(im,spec['credit'])
            return im
        im=camera(source,(W,H),q,self.i%2==1)
        im.paste(shade(W,H),(0,0),shade(W,H))
        d=ImageDraw.Draw(im)
        typeblock(d,56,515,title or self.head,1130,57,WHITE,'bold',2)
        source_imprint(im,spec['credit'])
        return im
    def split(self,q):
        im=Image.new('RGB',(W,H))
        for i,side in enumerate(self.b['comparison']):
            size=(W//2,H);x=i*size[0]
            image=camera(photo(self.root/f"image-{side['image']}.png"),size,q,bool(i),amount=.115)
            image.paste(shade(*size),(0,0),shade(*size))
            im.paste(image,(x,0))
            d=ImageDraw.Draw(im)
            d.rectangle((x+42,490,x+82,496),fill=PALETTE[i])
            typeblock(d,x+42,516,side['label'],540,51,WHITE,'bold',1)
            typeblock(d,x+43,588,side.get('detail',''),530,29,WHITE,'sans',1)
            typeblock(d,x+42,675,readable_credit(self.pack['images'][side['image']]['credit']),558,15,WHITE,lines=1)
        return im
    def rank_change(self,t):
        chart=self.b['chart']
        rows=chart['rows']
        n=len(rows)
        ranks=list(range(1,n+1))
        if not 2<=n<=6 or any(sorted(row[key] for row in rows)!=ranks for key in ('start','end')):
            raise ValueError('Rank chart needs two complete, untied rankings of two to six entries')
        im=Image.new('RGB',(W,H),'#101217')
        draw=ImageDraw.Draw(im)
        typeblock(draw,68,48,self.head,1144,60,WHITE,'title',1)
        typeblock(draw,72,157,chart['fromLabel'],320,32,WHITE,'bold',1)
        typeblock(draw,877,157,chart['toLabel'],339,32,WHITE,'bold',1)
        progress=ease((t-self.b.get('revealAt',.65))/1.1)
        for row in rows:
            left,right=354,844
            y0=239+(row['start']-1)*325/(n-1)
            y1=239+(row['end']-1)*325/(n-1)
            color=row.get('color','#b7bac0')
            x=left+(right-left)*progress
            y=y0+(y1-y0)*progress
            draw.text((70,y0),str(row['start'])+'   '+row['label'],font=face(33,'title'),fill=color,anchor='lm')
            draw.line((left,y0,x,y),fill=color,width=5)
            draw.ellipse((x-8,y-8,x+8,y+8),fill=color)
            if progress>=.98:
                draw.text((877,y1),str(row['end'])+'   '+row['label'],font=face(33,'title'),fill=color,anchor='lm')
        typeblock(draw,70,630,self.caption,1150,25,'#eceef1',lines=1)
        return im

    def pipeline(self,t,length=None):
        """Follow one item through a chain of steps; each step lights on its spoken cue."""
        chart=self.b['chart'];steps=chart['steps'];n=len(steps)
        if not 2<=n<=6:raise ValueError('A pipeline needs two to six steps')
        # Without spoken cues, pace the steps across most of the shot so each detail can be read.
        span=max(.7*(n-1),.72*(length or 0)-.15)
        cues=self.b.get('barCues') or [.15+span*i/(n-1) for i in range(n)]
        if len(cues)!=n:raise ValueError('Give one spoken cue per pipeline step')
        im=Image.new('RGB',(W,H),'#101217');draw=ImageDraw.Draw(im)
        typeblock(draw,68,48,self.head,1144,58,WHITE,'title',1)
        left,right,y=150,1130,282
        xs=[left+(right-left)*i/(n-1) for i in range(n)]
        reached=sum(1 for c in cues if t>=c)
        draw.line((xs[0],y,xs[-1],y),fill='#3a3e47',width=6)
        if reached:
            # The marker travels from the previous step to the newly spoken one.
            k=ease((t-cues[reached-1])/.55)
            head=xs[reached-1] if reached==1 else xs[reached-2]+(xs[reached-1]-xs[reached-2])*k
            draw.line((xs[0],y,head,y),fill=PALETTE[0],width=6)
            draw.ellipse((head-11,y-11,head+11,y+11),fill=WHITE)
        for i,(x,step) in enumerate(zip(xs,steps)):
            lit=i<reached;current=i==reached-1
            r=26 if current else 20
            draw.ellipse((x-r,y-r,x+r,y+r),fill=PALETTE[0] if lit else '#101217',outline=PALETTE[0] if lit else '#6b707a',width=4)
            draw.text((x,y),str(i+1),font=face(24,'title'),fill='#101217' if lit else '#9aa0a8',anchor='mm')
            words=step['label'].split();lines=[step['label']]
            if len(words)>1 and draw.textlength(step['label'],font=face(28,'bold'))>(right-left)/(n-1)-24:
                half=max(range(1,len(words)),key=lambda k:-abs(len(' '.join(words[:k]))-len(' '.join(words[k:]))))
                lines=[' '.join(words[:half]),' '.join(words[half:])]
            for row,line in enumerate(lines):
                draw.text((x,y+44+row*34),line,font=face(28,'bold'),fill=WHITE if lit else '#7d838c',anchor='ma')
        if reached:
            typeblock(draw,70,450,steps[reached-1].get('detail',''),1140,44,WHITE,'sans',2)
        typeblock(draw,70,632,self.caption,1140,25,'#eceef1',lines=1)
        typeblock(draw,70,672,'Illustrative sequence  /  '+publisher(self.source) if chart.get('illustrative') else publisher(self.source),1140,19,'#c7cbd1',lines=1)
        return im

    def profile(self,t,length):
        c=self.b['chart'];im=Image.new('RGB',(W,H),'#101217');d=ImageDraw.Draw(im)
        typeblock(d,67,44,self.head,1143,60,WHITE,'title',2)
        typeblock(d,70,166,c['unit'],1138,32,'#e8ebef',lines=1)
        x0,x1,y0,y1=143,1176,252,539
        lo,hi=c['domain']
        for i in range(5):
            v=lo+(hi-lo)*i/4;y=y1-(y1-y0)*i/4
            d.line((x0,y,x1,y),fill='#424550',width=1)
            d.text((x0-15,y),format(v,'.4g'),font=face(24),anchor='rm',fill='#cbd0d8')
        for i,label in enumerate(c['axis']):
            fraction=c['axisIndices'][i]/(len(c['series'][0]['values'])-1) if c.get('axisIndices') else i/(len(c['axis'])-1)
            x=x0+(x1-x0)*fraction
            d.text((x,y1+16),label,font=face(25),anchor='mt',fill='#eeeff3')
        last=len(c['series'][0]['values'])-1
        cues=self.b.get('traceCues',[])
        if cues:
            positions=[(0,0),*[(at,k/last) for at,k in cues]]
            finish=max(positions[-1][0]+.35,length-.7)
            positions.append((finish,c.get('until',1)))
            stop=float(np.interp(t,*zip(*positions)))
        else:stop=c.get('until',1)*ease(min(1,t/max(.8,min(length*.52,4.5))))
        # The band grows only as measured samples are exposed.
        if span:=c.get('eventWindow'):
            left=x0+(x1-x0)*span[0]/last
            right=x0+(x1-x0)*min(stop,span[1]/last)
            if right>left:
                d.rectangle((left,y0,right,y1),fill='#26313a')
                d.line((left,y0,left,y1),fill='#78939c',width=2)
                d.line((left,y0,right,y0),fill=PALETTE[2],width=3)
        for i,series in enumerate(c['series']):
            color=PALETTE[i];data=series['values'];end=(len(data)-1)*stop
            points=[]
            for k in range(math.floor(end)+1):
                x=x0+(x1-x0)*k/(len(data)-1);y=y1-(y1-y0)*(data[k]-lo)/(hi-lo)
                if points and c.get('steps'):points.append((x,points[-1][1]))
                points.append((x,y))
            k=int(end)
            if k<len(data)-1 and end>k:
                val=data[k] if c.get('steps') else data[k]+(end-k)*(data[k+1]-data[k])
                points.append((x0+(x1-x0)*stop,y1-(y1-y0)*(val-lo)/(hi-lo)))
            if len(points)>1:
                if len(c['series'])==1:
                    ink=tuple(int(color[j:j+2],16) for j in (1,3,5))
                    ImageDraw.Draw(im,'RGBA').polygon([(points[0][0],y1),*points,(points[-1][0],y1)],fill=(*ink,39))
                d.line(points,fill=color,width=7,joint='curve')
            # Track the head of the measured line, including before the pinned value is revealed.
            if end<last:
                x,y=points[-1]
                d.line((x,y0,x,y1),fill='#626a76',width=1)
                d.ellipse((x-8,y-8,x+8,y+8),fill=WHITE,outline=color,width=4)
            if 'markerIndex' in c:
                marker=c['markerIndex']
                if end>=marker and t>=self.b.get('revealAt',0):
                    x=x0+(x1-x0)*marker/(len(data)-1);y=y1-(y1-y0)*(data[marker]-lo)/(hi-lo)
                    d.line((x,y+10,x,y1),fill='#818596',width=2)
                    arrival=next((at for at,index in cues if index==marker),self.b.get('revealAt',0))
                    phase=t-arrival
                    if 0<=phase<.75:
                        radius=12+22*phase/.75
                        ImageDraw.Draw(im,'RGBA').ellipse((x-radius,y-radius,x+radius,y+radius),outline=(255,255,255,round(190*(1-phase/.75))),width=3)
                    d.ellipse((x-10,y-10,x+10,y+10),fill=WHITE,outline=color,width=4)
                    label=f'{data[marker]:.2f} {c.get("markerUnit","")}'.strip()
                    where='rm' if x>x1-150 else 'lm'
                    d.text((x+(-15 if where=='rm' else 15),y-17),label,font=face(25,'title'),fill=WHITE,stroke_width=2,stroke_fill='#101217',anchor=where)
            else:
                x,y=points[-1];d.ellipse((x-6,y-6,x+6,y+6),fill=WHITE,outline=color,width=3)
            d.line((70+i*395,218,108+i*395,218),fill=color,width=6)
            typeblock(d,119+i*395,205,series['label'],350,26,WHITE,lines=1)
        if t>=self.b.get('revealAt',0):typeblock(d,70,606,self.caption,1140,30,WHITE,'bold',2)
        typeblock(d,70,675,'Illustrative model' if c.get('illustrative') else publisher(self.source),1100,20,'#d4d6db',lines=1)
        return im

    def plot(self,t):
        b=self.b;spec=b['chart'];values=spec['values'];labels=b['labels']
        im=Image.new('RGB',(W,H),'#17191a');d=ImageDraw.Draw(im)
        typeblock(d,72,66,self.head,1135,66,WHITE,'bold',2)
        if not spec.get('contextTrace'):typeblock(d,75,185,spec['unit'],1100,30,'#d9dddb',lines=1)
        if trace:=spec.get('contextTrace'):
            values2=trace['values'];lo,hi=trace['domain']
            typeblock(d,70,232,trace['label'],580,34,WHITE,'title',1)
            typeblock(d,700,232,spec['unit'],500,30,WHITE,'title',1)
            points=[]
            for i,v in enumerate(values2):
                points.append((82+i*515/(len(values2)-1),520-(v-lo)*204/(hi-lo)))
            d.line((82,316,82,520,597,520),fill='#8f969e',width=2)
            for y,v in [(316,hi),(520,lo)]:d.text((79,y),format(v,'g'),anchor='rm',font=face(19),fill=WHITE)
            count=1+int(ease(t/1.8)*(len(points)-1))
            if count>1:d.line(points[:count],fill=PALETTE[2],width=5)
            for i,(name,value) in enumerate(zip(labels,values)):
                y=313+i*110;left=700
                typeblock(d,left,y,name,284,36,WHITE,'title',1)
                d.text((1187,y),f'{value:g}%',anchor='rt',font=face(42,'title'),fill=WHITE)
                d.rectangle((left,y+56,1186,y+74),fill='#3c4149')
                d.rectangle((left,y+56,left+486*value/100*ease((t-i*.2)/.65),y+74),fill=PALETTE[i])
            typeblock(d,72,580,self.caption,1140,33,WHITE,'bold',2)
            typeblock(d,72,675,publisher(self.source),1110,21,'#d4d6db',lines=1)
            return im
        if spec.get('layout')=='calculation':
            typeblock(d,74,280,b['labels'][spec['active']],1120,51,WHITE,'title',1)
            # The cut arrives on the spoken result, so the answer is readable immediately.
            typeblock(d,73,371,spec['answer'],1130,85,PALETTE[spec['active']],'title',1)
            bar=ease(t/.65)
            d.rectangle((76,509,76+int(550*bar),515),fill=PALETTE[spec['active']])
            typeblock(d,73,630,publisher(self.source),1120,21,'#d4d6db',lines=1)
            return im
        if spec.get('layout') in ('paired','fixed') and len(values)==2:
            fixed=spec['layout']=='fixed'
            if fixed:typeblock(d,74,232,spec.get('constant',''),1120,38,GOLD,'bold',1)
            for i,(label,val) in enumerate(zip(labels,values)):
                x=74+610*i;y=328 if fixed else 277
                typeblock(d,x,y,label,500,45,WHITE,'bold',1)
                pct=spec['unit'].lstrip().startswith('%')
                typeblock(d,x,y+65,format(val,',.5g')+('%' if pct else ''),510,102,PALETTE[i],'bold',1)
                k=ease((t-i*.28)/.82)
                d.rectangle((x,y+183,x+round(480*val/(100 if pct else max(values))*k),y+194),fill=PALETTE[i])
            if self.caption:typeblock(d,72,560,self.caption,1120,30,WHITE,lines=2)
            typeblock(d,72,640,publisher(self.source),1120,19,'#c7cfcb',lines=1)
            return im
        y=246;gap=min(104,340/len(values));x=385
        d.line((x,y-7,x,y+len(values)*gap-10),fill='#afc1b7',width=2)
        for i,(label,val) in enumerate(zip(labels,values)):
            at=b['barCues'][i] if b.get('barCues') else .1*i
            yy=int(y+i*gap);k=ease((t-at)/.73)
            extent=round(595*val/(100 if spec.get('floors') or spec['unit'].lstrip().startswith('%') else max(values))*k)
            typeblock(d,75,yy+5,label,295,41,WHITE,'sans',2)
            d.rounded_rectangle((x,yy+5,x+595,yy+37),radius=4,fill='#292c30')
            if extent>1:
                d.rounded_rectangle((x,yy+4,x+extent,yy+38),radius=min(4,extent//2),fill=PALETTE[i])
                if k<1:d.line((x+extent,yy+4,x+extent,yy+38),fill=WHITE,width=3)
            if spec.get('floors') and t>=at:
                floor=spec['floors'][i]
                marker=x+round(595*floor/100)
                d.line((marker,yy,marker,yy+43),fill=WHITE,width=3)
                d.text((x,yy+46),f'Minimum {floor:g}%   /   measured {val:g}%',font=face(30,'title'),fill=WHITE,anchor='lt')
            if k>.72:typeblock(d,x+extent+13,yy+2,format(val,',.5g'),167,46,WHITE,'bold',1)
        typeblock(d,73,542,self.caption,1124,29,WHITE,lines=2)
        typeblock(d,73,617,publisher(self.source),1120,19,'#c7cfcb',lines=1)
        return im
    def track_map(self,t):
        c=self.b['chart']
        left,top,width,height=70,182,1140,390
        west,south,east,north=c['bounds']
        cosine=math.cos(math.radians((north+south)/2))
        scale=min(width/((east-west)*cosine),height/(north-south))
        def project(lon,lat):
            return (width/2+(lon-(east+west)/2)*cosine*scale,
                    height/2-(lat-(south+north)/2)*scale)
        if not hasattr(self,'map_base'):
            base=Image.new('RGB',(width,height),'#161a1d')
            brush=ImageDraw.Draw(base)
            for ring in c['land']:
                brush.polygon([project(*point) for point in ring],fill='#3e4448',outline='#959d9f',width=2)
            for place in c['places']:
                x,y=project(*place['point'])
                brush.text((x,y),place['label'],font=face(25,'title'),fill='#f3f4f4',anchor='mm')
            self.map_base=base
        board=self.map_base.copy()
        brush=ImageDraw.Draw(board)
        image=Image.new('RGB',(W,H),'#101215')
        draw=ImageDraw.Draw(image)
        typeblock(draw,68,47,self.head,1144,62,WHITE,'title',1)
        for i,route in enumerate(c['routes']):
            at=self.b.get('revealAt',1.8) if i else 0
            if t<at:continue
            pts=[project(*point) for point in route['points']]
            limit=(len(pts)-1)*ease((t-at)/1.15)
            full=int(limit)
            visible=pts[:full+1]
            if full<len(pts)-1:
                x,y=pts[full];nx,ny=pts[full+1]
                visible.append((x+(nx-x)*(limit-full),y+(ny-y)*(limit-full)))
            color=PALETTE[i]
            if len(visible)>1:brush.line(visible,fill=color,width=5,joint='curve')
            x,y=visible[-1];brush.ellipse((x-6,y-6,x+6,y+6),fill=WHITE,outline=color,width=3)
            xx=72+552*i;draw.line((xx,145,xx+43,145),fill=color,width=6)
            typeblock(draw,xx+55,130,route['label'],480,30,WHITE,lines=1)
        image.paste(board,(left,top))
        typeblock(draw,70,594,self.caption,1135,33,WHITE,lines=2)
        typeblock(draw,70,674,publisher(self.source),1135,19,'#d5d7da',lines=1)
        return image

    def subset(self,t):
        chart=self.b['chart']
        image=Image.new('RGB',(W,H),'#101114')
        draw=ImageDraw.Draw(image)
        typeblock(draw,70,54,self.head,1138,62,WHITE,'title',2)
        typeblock(draw,70,192,format(chart['total'],','),520,88,WHITE,'title',1)
        typeblock(draw,72,297,chart['totalLabel'],520,34,WHITE,lines=2)
        left,right,top,bottom=73,1207,407,468
        draw.rectangle((left,top,right,bottom),fill='#535660')
        reveal=self.b.get('revealAt',1.2)
        if t>=reveal:
            fraction=chart['count']/chart['total']
            travel=ease((t-reveal)/.72)
            width=round((right-left)*fraction*travel)
            if width:
                draw.rectangle((left,top,left+width,bottom),fill=PALETTE[0])
            typeblock(draw,688,192+round(12*(1-travel)),format(chart['count'],','),510,88,PALETTE[0],'title',1)
            typeblock(draw,690,297,chart['countLabel'],512,34,WHITE,lines=2)
            if travel>.95:
                typeblock(draw,72,490,f"{fraction:.1%} of the sample",1120,34,WHITE,lines=1)
        typeblock(draw,72,586,self.caption,1120,31,WHITE,lines=2)
        typeblock(draw,72,666,publisher(self.source),1120,20,'#d4d6db',lines=1)
        return image

    def response_window(self,t):
        chart=self.b['chart']
        image=Image.new('RGB',(W,H),'#101217')
        draw=ImageDraw.Draw(image)
        typeblock(draw,68,45,self.head,1140,64,WHITE,'title',2)
        typeblock(draw,70,164,chart['unit'],1120,32,'#e3e4e7',lines=1)
        bounds=(130,231,452,553)
        draw.ellipse(bounds,outline='#383c45',width=13)
        reveal=self.b.get('revealAt',1.2)
        sweep=ease(t/max(.15,reveal))
        draw.arc(bounds,-90,-90+359*sweep,fill=PALETTE[0],width=14)
        draw.text((291,384),f"{chart['seconds']:g} s",font=face(80,'title'),fill=WHITE,anchor='mm')
        draw.text((291,454),'RESPONSE WINDOW',font=face(20,'title'),fill=WHITE,anchor='mm')
        if t>=reveal:
            offset=round(12*(1-ease((t-reveal)/.35)))
            typeblock(draw,567,291+offset,f"{chart['reduction']:g}% less",600,97,PALETTE[1],'title',1)
            typeblock(draw,570,413,'cluster power',565,48,WHITE,'title',1)
        typeblock(draw,70,594,self.caption,1134,32,WHITE,lines=2)
        typeblock(draw,70,671,publisher(self.source),1135,20,'#d4d6db',lines=1)
        return image

    def map(self,t):
        im=Image.new('RGB',(W,H),'#191c1e');d=ImageDraw.Draw(im)
        typeblock(d,64,46,self.head,1148,62,WHITE,'bold',2)
        if route:=self.b.get('route'):
            origin,destination=route
            atlas(d,route,(64,182,823,330),t,self.b.get('routePlaces'))
            anchors=[]
            places=self.b.get('routePlaces')
            for row,state in enumerate(route):
                ring=max(STATES[state],key=len)
                lon=(max(v[0] for v in ring)+min(v[0] for v in ring))/2
                lat=(max(v[1] for v in ring)+min(v[1] for v in ring))/2
                if places:
                    lon,lat=places[row]['lon'],places[row]['lat']
                anchors.append((64+(lon+125)/59*823,182+(50-lat)/26*330))
            (ax,ay),(bx,by)=anchors
            count=round(50*ease(t/1.45))
            points=[(ax+(bx-ax)*i/50,ay+(by-ay)*i/50-32*math.sin(math.pi*i/50)) for i in range(count+1)]
            if count:
                d.line(points,fill=GOLD,width=5)
                x,y=points[-1];d.ellipse((x-6,y-6,x+6,y+6),fill=WHITE)
            for row,(label,state) in enumerate([('FROM',origin),('TO',destination)]):
                d.text((883,220+row*111),label,font=face(25,'title'),fill=PALETTE[row])
                typeblock(d,881,255+row*111,places[row]['name'] if places else state,330,49,WHITE,'title',1)
                if places:typeblock(d,883,309+row*111,state,326,24,'#dbdee2',lines=1)
            typeblock(d,70,548,self.caption,1100,36,WHITE,'bold',2)
            typeblock(d,70,654,'Boundaries: U.S. Census Bureau   /   '+publisher(self.source),1120,20,'#d1d4d3',lines=1)
            return im
        atlas(d,self.states[:4],(194,178,886,352),t)
        typeblock(d,70,520,'   /   '.join(self.states[:4]),1120,38,WHITE,'bold',1)
        typeblock(d,70,572,self.caption,1100,27,'#d1d4d3',lines=2)
        typeblock(d,70,625,'Boundaries: U.S. Census Bureau',1100,18,'#b9bfbd',lines=1)
        return im
    def frame(self,t,length):
        q=min(1,t/max(length-1/FPS,.01))
        if self.b.get('comparison'):return self.split(q)
        if self.kind=='image':return self.image(self.b['image'],q)
        if self.kind=='chart':
            layout=self.b['chart'].get('layout')
            if layout=='profile':drawing=self.profile(t,length)
            elif layout=='response-window':drawing=self.response_window(t)
            elif layout=='subset':drawing=self.subset(t)
            elif layout=='rank-change':return self.rank_change(t)
            elif layout=='pipeline':return self.pipeline(t,length)
            elif layout=='track-map':return self.track_map(t)
            else:drawing=self.plot(t)
            return camera(drawing,(W,H),q,self.i%2==0,amount=.024)
        if self.kind in ('document','quote'):
            phrase=self.b.get('quote','')
            suffix='-'+hashlib.sha256(phrase.encode()).hexdigest()[:10] if self.kind=='quote' and phrase and '/status/' not in self.source['url'] else ''
            return citation_frame(self.root/f"press-{self.b['source']}{suffix}.png",t,length,self.i)
        if self.kind=='terrain' and self.states:return camera(self.map(t),(W,H),q,self.i%2==0,amount=.045)
        raise ValueError('Select verified footage, a photograph, a publisher capture, a chart or a geographic map for '+self.head)
