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
        boxw=min(1130,max(face(53,'title').getlength(person),face(34).getlength(role))+68)
        center=W*beat.get('speakerX',.5)
        x=round(max(48,min(W-48-boxw,center-boxw/2)))
        d.rounded_rectangle((x,505,x+boxw,649),radius=12,fill=(18,20,22,223))
        typeblock(d,x+26,524,person,boxw-52,53,WHITE,'title',1)
        typeblock(d,x+27,590,role,boxw-52,34,WHITE,'sans',1)
        return im
    card=beat.get('creditCard') or {}
    label=card.get('title','Sources & footage') if beat.get('closing') else (name.get('name') or beat['title'])
    details=card.get('text',readable_credit(credit)) if beat.get('closing') else '  ·  '.join(v for v in (name.get('date'),name.get('role')) if v)
    anchor=beat.get('titlePosition','upper-left')
    bottom=anchor.startswith('lower')
    right=anchor.endswith('right')
    gradient=np.maximum(0,1-np.arange(H)/350)**1.55
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

def atlas(d,states,box,progress):
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
        im=camera(photo(self.root/f'image-{idx}.png'),(W,H),q,self.i%2==1)
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
        typeblock(d,70,675,'Illustration · hypothetical customers' if c.get('illustrative') else publisher(self.source),1100,20,'#d4d6db',lines=1)
        return im

    def plot(self,t):
        b=self.b;spec=b['chart'];values=spec['values'];labels=b['labels']
        im=Image.new('RGB',(W,H),'#17191a');d=ImageDraw.Draw(im)
        typeblock(d,72,66,self.head,1135,66,WHITE,'bold',2)
        typeblock(d,75,185,spec['unit'],1100,30,'#d9dddb',lines=1)
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
                typeblock(d,x,y+65,format(val,',.5g'),510,102,PALETTE[i],'bold',1)
                k=ease((t-i*.28)/.82)
                d.rectangle((x,y+183,x+round(480*val/max(values)*k),y+194),fill=PALETTE[i])
            typeblock(d,72,612,publisher(self.source),1120,19,'#c7cfcb',lines=1)
            return im
        y=246;gap=min(104,340/len(values));x=385
        d.line((x,y-7,x,y+len(values)*gap-10),fill='#afc1b7',width=2)
        for i,(label,val) in enumerate(zip(labels,values)):
            at=b['barCues'][i] if b.get('barCues') else .1*i
            yy=int(y+i*gap);k=ease((t-at)/.73)
            extent=round(595*val/max(values)*k)
            typeblock(d,75,yy+5,label,295,41,WHITE,'sans',2)
            d.rounded_rectangle((x,yy+5,x+595,yy+37),radius=4,fill='#292c30')
            if extent>1:
                d.rounded_rectangle((x,yy+4,x+extent,yy+38),radius=min(4,extent//2),fill=PALETTE[i])
                if k<1:d.line((x+extent,yy+4,x+extent,yy+38),fill=WHITE,width=3)
            if k>.72:typeblock(d,x+extent+13,yy+2,format(val,',.5g'),167,46,WHITE,'bold',1)
        typeblock(d,73,542,self.caption,1124,29,WHITE,lines=2)
        typeblock(d,73,617,publisher(self.source),1120,19,'#c7cfcb',lines=1)
        return im
    def map(self,t):
        im=Image.new('RGB',(W,H),'#191c1e');d=ImageDraw.Draw(im)
        typeblock(d,64,46,self.head,1148,62,WHITE,'bold',2)
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
            drawing=self.profile(t,length) if self.b['chart'].get('layout')=='profile' else self.plot(t)
            return camera(drawing,(W,H),q,self.i%2==0,amount=.024)
        if self.kind in ('document','quote'):
            phrase=self.b.get('quote','')
            suffix='-'+hashlib.sha256(phrase.encode()).hexdigest()[:10] if self.kind=='quote' and phrase and '/status/' not in self.source['url'] else ''
            return citation_frame(self.root/f"press-{self.b['source']}{suffix}.png",t,length,self.i)
        if self.kind=='terrain' and self.states:return camera(self.map(t),(W,H),q,self.i%2==0,amount=.045)
        raise ValueError('Select verified footage, a photograph, a publisher capture, a chart or a geographic map for '+self.head)
