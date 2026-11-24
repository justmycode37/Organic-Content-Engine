"""Camera and focus pulls on real publisher captures. Rects are measured in the page."""
import json
import math
import numpy as np
from functools import lru_cache
from PIL import Image,ImageDraw,ImageFilter,ImageEnhance,ImageOps

W,H=1280,720

def ease(x):
    x=max(0,min(1,x))
    return x*x*(3-2*x)

@lru_cache(12)
def plates(path):
    source=Image.open(path).convert('RGB')
    meta=json.loads(path.with_suffix('.png.json').read_text())
    rect=meta['rect'];view=meta['viewport']
    # Fit the whole page or embedded post on the establishing frame.
    dark='x.com/' in meta['url'] or 'twitter.com/' in meta['url']
    base=Image.new('RGB',(W,H),'#0a0a0a' if dark else '#202121')
    fit=min(W/source.width,H/source.height)
    size=tuple(max(1,round(x*fit)) for x in source.size)
    left,top=(W-size[0])/2,(H-size[1])/2
    base.paste(source.resize(size,Image.Resampling.LANCZOS),(round(left),round(top)))
    sx,sy=size[0]/view['width'],size[1]/view['height']
    x=left+sx*rect['x'];y=top+sy*rect['y'];w=sx*rect['width'];h=sy*rect['height']
    x=max(0,min(W-1,x));y=max(0,min(H-1,y));w=max(2,min(W-x,w));h=max(2,min(H-y,h))
    mask=Image.new('L',(W,H));d=ImageDraw.Draw(mask)
    d.rounded_rectangle((x-10,y-8,x+w+10,y+h+8),8,fill=255)
    obscured=ImageEnhance.Brightness(base.filter(ImageFilter.GaussianBlur(4))).enhance(.25)
    spot=Image.composite(base,obscured,mask.filter(ImageFilter.GaussianBlur(5)))
    return base,spot,(x,y,w,h)

def frame(path,t,length,variant):
    wide,spot,(x,y,w,h)=plates(path)
    # Establish publisher/author, mark the evidence, then move close enough to read.
    move=ease((t-min(.86,length*.12))/max(.9,min(2.3,length*.38)))
    z=1+min(.59,max(.18,W/(w+145)-1))*move
    z+=.008*min(1,t/max(.1,length))
    left=max(0,min(W-W/z,(x+w/2-W/(2*z))*move))
    top=max(0,min(H-H/z,(y+h/2-H/(2*z))*move))
    picture=Image.blend(wide,spot,move*.92) if variant%3!=1 else wide
    if variant%3!=0 and move>0:
        picture=picture.copy();draw=ImageDraw.Draw(picture)
        advance=ease((t-.62)/.64)
        # Underline the source text itself without modifying its characters.
        end=x+min(w,W*.71)*advance
        draw.line((x,y+h+4,end,y+h+4),fill='#f3c571',width=4)
    if variant%3==2:
        # An oblique entrance resolves to a straight-on macro for the reading hold.
        angle=(1-move)*(.048 if variant%2 else -.048)
        if abs(angle)>.0001:
            src=[(0,0),(W,0),(W,H),(0,H)]
            dst=[(W*abs(angle),H*.035),(W-W*abs(angle),H*.035+H*angle),(W,H-H*.042),(0,H-H*.042-H*angle)]
            matrix=[];targets=[]
            for (u,v),(px,py) in zip(dst,src):
                matrix.extend([[u,v,1,0,0,0,-px*u,-px*v],[0,0,0,u,v,1,-py*u,-py*v]])
                targets.extend([px,py])
            coeff=np.linalg.solve(matrix,targets)
            picture=picture.transform((W,H),Image.Transform.PERSPECTIVE,coeff,Image.Resampling.BICUBIC,fillcolor='#121313')
    return picture.transform((W,H),Image.Transform.AFFINE,(1/z,0,left,0,1/z,top),Image.Resampling.BICUBIC)
