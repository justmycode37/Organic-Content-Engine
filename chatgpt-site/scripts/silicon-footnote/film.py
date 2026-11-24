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
GOLD='#f0c37c'
BLACK='#182b30'
WHITE='#ffffff'
PALETTE=['#66c4ac','#e99a69','#e0ded7','#999eaa']
DIRECTORY=Path(__file__).resolve().parent
STATES=json.loads((DIRECTORY/'us-states.json').read_text())['states']

@lru_cache(128)
def face(size,style='sans'):
    names={'sans':('GillSans.ttc','DejaVuSans.ttf'),'bold':('DIN Alternate Bold.ttf','DejaVuSans-Bold.ttf'),
           'serif':('Georgia.ttf','DejaVuSerif.ttf'),'italic':('Georgia Italic.ttf','DejaVuSerif-Italic.ttf'),
           'narrow':('DIN Condensed Bold.ttf','DejaVuSansCondensed-Bold.ttf'),
           'scientific':('Arial Unicode.ttf','DejaVuSans.ttf')}
    mac,linux=names[style]
    paths=[Path('/System/Library/Fonts/Supplemental')/mac,Path('/usr/share/fonts/truetype/dejavu')/linux]
    return ImageFont.truetype(str(next(p for p in paths if p.exists())),size)

def typeblock(draw,x,y,text,width,size,color=IVORY,style='sans',lines=3,leading=1.12):
    if not text:return y
    if any(c in '₀₁₂₃₄₅₆₇₈₉' for c in text):
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
    common={'hsph.harvard.edu':'Harvard T.H. Chan School of Public Health','raw.githubusercontent.com':'Research team  /  public data','github.com':'GitHub','epa.gov':'U.S. Environmental Protection Agency','x.com':'X','pbs.org':'PBS NewsHour','cbsnews.com':'CBS News'}
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
    if beat.get('closing'):
        d.rounded_rectangle((55,427,832,632),8,fill=(7,9,10,205))
        typeblock(d,81,451,'Sources & footage',720,48,WHITE,'bold',1)
        typeblock(d,83,522,readable_credit(credit),706,29,WHITE,lines=2)
        return im
    name=beat.get('nameplate') or {}
    line=name.get('name') or beat['title']
    if not beat.get('clean'):
        f=face(42,'bold');size=min(1040,round(f.getlength(line))+38)
        d.rounded_rectangle((39,38,39+size,100),7,fill=(0,0,0,152))
        typeblock(d,56,50,line,1020,42,WHITE,'bold',1)
        details='  ·  '.join(x for x in (name.get('date'),name.get('role')) if x)
        if details:
            size=min(1000,round(face(25).getlength(details))+32)
            d.rounded_rectangle((40,104,40+size,147),5,fill=(0,0,0,155))
            typeblock(d,55,111,details,970,25,WHITE,lines=1)
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
    def plot(self,t):
        b=self.b;spec=b['chart'];values=spec['values'];labels=b['labels']
        im=Image.new('RGB',(W,H),'#17191a');d=ImageDraw.Draw(im)
        typeblock(d,72,66,self.head,1135,66,WHITE,'bold',2)
        typeblock(d,75,185,spec['unit'],1100,30,'#d9dddb',lines=1)
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
            yy=int(y+i*gap);k=ease((t-.1*i)/.73)
            extent=round(595*val/max(values)*k)
            typeblock(d,75,yy+5,label,295,41,WHITE,'sans',2)
            if extent:d.rectangle((x,yy+3,x+extent,yy+39),fill=PALETTE[i])
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
        if self.kind=='chart':return self.plot(t)
        if self.kind in ('document','quote'):
            phrase=self.b.get('quote','')
            suffix='-'+hashlib.sha256(phrase.encode()).hexdigest()[:10] if self.kind=='quote' and phrase and '/status/' not in self.source['url'] else ''
            return citation_frame(self.root/f"press-{self.b['source']}{suffix}.png",t,length,self.i)
        if self.kind=='terrain' and self.states:return self.map(t)
        raise ValueError('Select verified footage, a photograph, a publisher capture, a chart or a geographic map for '+self.head)
