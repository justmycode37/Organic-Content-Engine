"""Silicon Footnote's 16:9 motion vocabulary. All positions follow narration time."""
import math
import re
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit
import numpy as np
from PIL import Image, ImageDraw, ImageFont

W, H, FPS = 1280, 720, 24
WHITE, MUTED, ACCENT = '#ffffff', '#c8c8c8', '#ffbf58'
def ease(x):
    x = max(0, min(1, x))
    return x*x*(3-2*x)

@lru_cache(None)
def font(size, mono=False, bold=False):
    names = (['/System/Library/Fonts/Menlo.ttc', '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'] if mono else
             ['/System/Library/Fonts/Supplemental/Arial'+(' Bold' if bold else '')+'.ttf',
              '/usr/share/fonts/truetype/dejavu/DejaVuSans'+('-Bold' if bold else '')+'.ttf'])
    return ImageFont.truetype(next(n for n in names if Path(n).exists()), size)

def wrap(text, face, width):
    lines = ['']
    for word in text.split():
        line = (lines[-1]+' '+word).strip()
        if face.getlength(line) <= width or not lines[-1]:
            lines[-1] = line
        else:
            lines.append(word)
    return lines

def block(d, xy, text, width, size, color=WHITE, bold=False, max_lines=4, accent_word=None):
    x,y = xy
    while size > 14:
        face = font(size,bold=bold)
        lines = wrap(text,face,width)
        if len(lines)<=max_lines and all(face.getlength(s)<=width for s in lines):
            break
        size -= 2
    for line in lines:
        d.text((x,y),line,font=face,fill=color)
        if accent_word:
            match=re.search(r'(?<!\w)'+re.escape(accent_word)+r'(?!\w)',line,re.IGNORECASE)
            if match:
                offset=face.getlength(line[:match.start()])
                d.text((x+offset,y),match.group(),font=face,fill=ACCENT)
                accent_word=None
        y += round(size*1.16)
    return y

@lru_cache(2)
def backdrop(contours):
    y,x = np.mgrid[0:H,0:W]
    glow = np.exp(-((x-750)/560)**2-((y-305)/390)**2)
    noise = np.random.default_rng(42).normal(0,1.6,(H,W))
    field = 10*np.sin(x/213+np.cos(y/96))+7*np.sin(y/100+x/310)+y/75
    contour = np.exp(-((field-np.round(field))/.076)**2)*18 if contours else 0
    intensity = np.uint8(np.clip(4+24*glow+noise+contour,0,255))
    return Image.fromarray(intensity).convert('RGB')

@lru_cache(4096)
def glyphs(text,size):
    face=font(size,True)
    mask=Image.new('L',(int(face.getlength(text))+3,size*2))
    ImageDraw.Draw(mask).text((0,0),text,font=face,fill=255)
    return mask


class Scene:
    def __init__(self, beat, source, index, count, credit=''):
        self.b,self.source,self.index,self.count,self.credit = beat,source,index,count,credit
        self.kind = beat['kind']
        self.host = urlsplit(source['url']).netloc.removeprefix('www.')
        self.bg = backdrop(self.kind in ('document','quote'))
        self.words = '   '.join(beat['labels']+[beat['title']]).lower()
        self.card = self.build_card() if self.kind in ('document','quote') else None

    def build_card(self):
        panel = Image.new('RGB',(1000,410),'#080808')
        d=ImageDraw.Draw(panel)
        d.rounded_rectangle((0,0,999,409),radius=14,outline='#505050',width=2)
        d.line((1,43,998,43),fill='#373737')
        for i,c in enumerate(('#585858','#898989','#bbbbbb')):
            d.ellipse((22+17*i,18,31+17*i,27),fill=c)
        d.text((88,12),self.host,font=font(16,True),fill=MUTED)
        d.text((56,93),'SOURCE EXCERPT' if self.kind=='quote' else 'SOURCE DOCUMENT',font=font(16,True),fill=WHITE)
        title=self.b['quote'] if self.kind=='quote' else self.source['title']
        block(d,(56,139),title,874,51,WHITE,True,3,accent_word=self.b.get('accentWord'))
        subtitle=self.b['title'] if self.b['title']!=title else self.b['labels'][0]
        block(d,(56,337),subtitle,865,23,MUTED,max_lines=2)
        return panel

    def frame(self,t,length):
        im=self.bg.copy()
        d=ImageDraw.Draw(im)
        if self.card:
            p=ease(t/.72)
            scale=.92+.08*p+.026*ease(t/max(1,length))
            card=self.card.resize((round(1000*scale),round(410*scale)),Image.Resampling.BILINEAR)
            im.paste(card,((W-card.width)//2,round(150+(1-p)*36)))
        elif self.kind=='image':
            w,h=self.figure.size
            focus=self.b.get('focus','full')
            cx,cy={'upper-right':(.70,.32),'lower-left':(.29,.75)}.get(focus,(.5,.50))
            zoom=(1.0 if focus=='full' else 1.5)+.12*ease(t/length)
            crop_w,crop_h=w/zoom,h/zoom
            x=min(w-crop_w,max(0,cx*w-crop_w/2))
            y=min(h-crop_h,max(0,cy*h-crop_h/2))
            scale=min(790/crop_w,532/crop_h)
            width,height=round(crop_w*scale),round(crop_h*scale)
            picture=self.figure.resize((width,height),Image.Resampling.BILINEAR,box=(x,y,min(w,x+crop_w),min(h,y+crop_h)))
            im.paste(picture,(68+(790-width)//2,96+(532-height)//2))
            d.text((890,155),'SOURCE FIGURE',font=font(16,True),fill=MUTED)
            end=block(d,(890,203),self.b['title'],315,35,bold=True,max_lines=5)
            block(d,(890,end+32),self.b['labels'][0],315,23,max_lines=4)
            block(d,(890,550),self.credit,320,16,MUTED,max_lines=3)
        elif self.kind=='chart':
            block(d,(70,102),self.b['title'],1130,48,bold=True,max_lines=2)
            values=self.b['chart']['values']
            unit=self.b['chart']['unit']
            for i,(label,value) in enumerate(zip(self.b['labels'],values)):
                y=245+i*90
                block(d,(70,y),label,278,23,max_lines=2)
                width=640*value/max(values)*ease((t-i*.23)/1.25)
                d.rectangle((360,y+1,360+width,y+27),fill=WHITE)
                d.text((373+width,y),f'{value:g} {unit}',font=font(21),fill=WHITE)
        elif self.kind=='steps':
            block(d,(70,112),self.b['title'],1140,53,bold=True,max_lines=2)
            labels=self.b['labels']
            points=[(122+i*min(340,1010/max(1,len(labels)-1)),388+48*math.sin(i*1.4)) for i in range(len(labels))]
            for i,(x,y) in enumerate(points):
                p=ease((t-i*min(1.4,length/(len(labels)+1)))/.7)
                if i and p:
                    a,b=points[i-1]
                    d.line((a,b,a+(x-a)*p,b+(y-b)*p),fill=WHITE,width=3)
                if p:
                    for radius,color in [(16,'#303030'),(10,'#5a5a5a'),(5,WHITE)]:
                        r=radius*p
                        d.ellipse((x-r,y-r,x+r,y+r),fill=color)
                    block(d,(max(70,min(x-32,1050)),y+28),labels[i],178,25,max_lines=3)
        else:
            # Perspective bands of type roll over a low, illuminated data surface.
            for row in range(27):
                z=row/26
                y=round(360+z*z*260)
                size=8+round(z*4)
                f=font(size,True)
                phrase=(self.words+'    ')*6
                offset=int(t*(6+11*z)+row*25)%max(1,int(f.getlength(self.words+'    ')))
                for column in range(9):
                    x=column*165-20
                    height=(1-z)*87*math.exp(-((x-680-62*math.sin(t*.26))/340)**2)
                    start=(column*24+row)%len(self.words)
                    fragment=(phrase[start:]+phrase)[:22]
                    mask=glyphs(fragment,size)
                    im.paste((88+row,)*3,(x-offset%35,round(y-height+5*math.sin(column*.6+row*.13+t*.35))),mask)
            block(d,(70,112),self.b['title'],1120,53,bold=True,max_lines=2)
            items=self.b['labels']
            current=min(len(items)-1,int(t/max(length,.01)*len(items)))
            block(d,(72,244),items[current],1100,31,WHITE,max_lines=2)
        d.text((1212,45),f'{self.index+1:02} / {self.count:02}',anchor='ra',font=font(16,True),fill=MUTED)
        d.line((68,652,1212,652),fill='#494949')
        d.line((68,652,68+1144*min(t/max(.01,length),1),652),fill=WHITE,width=2)
        d.text((68,670),self.host,font=font(17,True),fill=MUTED)
        return im

def lower_third(beat,credit):
    im=Image.new('RGBA',(W,H))
    d=ImageDraw.Draw(im)
    plate=beat.get('nameplate',{})
    name=plate.get('name') or beat['title']
    date=plate.get('date')
    role=plate.get('role')
    credit=credit.split('https://')[0].strip(' ·|-') or 'Source footage'
    rows=[(name.upper(),32,True),(date,23,True),(' · '.join(filter(None,[role,credit])),19,False)]
    y=660
    for text,size,bold in reversed(rows):
        if not text:
            continue
        while size>13 and font(size,bold=bold).getlength(text)>W-160:
            size-=1
        face=font(size,bold=bold)
        width=min(W-100,round(face.getlength(text))+44)
        height=size+22
        d.rounded_rectangle((54,y-height,54+width,y),radius=height//2,fill=(0,0,0,210),outline=(255,255,255,145),width=1)
        d.text((76,y-height/2),text,font=face,anchor='lm',fill=WHITE)
        y-=height+7
    return im
