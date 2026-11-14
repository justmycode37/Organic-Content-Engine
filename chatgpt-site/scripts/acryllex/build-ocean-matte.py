#!/usr/bin/env python3
"""Tracked alpha only. Original RGB is never filtered/repainted. See recipe JSON."""
import argparse,json,subprocess,hashlib
from pathlib import Path
import cv2,numpy as np
from scipy.ndimage import gaussian_filter,distance_transform_edt,binary_propagation,binary_closing
from scipy.interpolate import PchipInterpolator
from PIL import Image,ImageDraw
ROOT=Path.cwd()
SRC=None
W,H,AW,AH,N,FPS=3850,2160,1283,720,76,30
XS=[390,400,410,420,435,450,470,490,510,530,550,575,600,625,650,675,700,725,750,775,800,825,850,875,900,925,950,975,1000,1025,1050,1075,1100,1125,1150,1175,1200,1225,1250,1283]
YS={
0:[337,323,314,305,295,290,284,287,292,297,300,305,307,323,336,340,331,280,245,225,209,211,230,205,189,172,167,154,128,92,54,2,-60,-100,-150,-200,-250,-300,-350,-400],
15:[350,340,332,320,311,303,297,300,305,310,313,322,330,340,356,368,366,346,335,305,260,248,246,238,220,218,214,209,202,170,146,130,108,73,30,-20,-60,-100,-140,-180],
30:[362,350,344,336,322,315,308,304,307,312,321,334,345,356,372,389,397,391,384,370,352,324,319,306,299,285,266,260,240,233,218,213,196,173,143,108,64,20,-20,-45],
45:[368,365,360,355,348,339,332,328,334,339,347,354,364,375,390,407,421,432,430,420,411,391,366,359,347,333,322,313,309,327,337,315,260,256,228,203,160,151,128,92],
60:[375,368,364,359,350,345,342,341,342,346,350,357,366,379,395,409,430,452,463,468,468,460,450,442,428,413,407,400,391,387,387,393,385,377,330,311,282,285,258,209],
75:[387,381,374,369,358,353,354,353,352,354,359,367,374,386,401,419,443,464,482,491,495,496,495,494,484,482,474,465,456,454,451,451,443,424,397,364,348,313,286,278]}
FOLDY=[0,200,270,300,320,340,360,380,400,420,440,500,600,720]
FOLDX=[420,420,440,420,406,396,392,392,399,412,435,480,550,650]
SHORE=[[0,448],[390,439],[450,449],[500,452],[600,451],[700,441],[800,430],[900,422],[1000,410],[1100,396],[1200,383],[1283,369]]
MOUNTAIN=[[0,448],[600,422],[650,410],[700,398],[750,387],[800,369],[850,358],[900,334],[930,331],[970,316],[1000,300],[1030,294],[1060,297],[1100,287],[1130,275],[1150,270],[1180,256],[1210,251],[1240,236],[1283,218]]
CHECKS=[0,15,30,45,60,75]
def smooth(a,b,x):
 t=np.clip((x-a)/(b-a),0,1);return t*t*(3-2*t)
def hand(n):
 ks=sorted(YS);k=max(k for k in ks if k<=n);j=min(k for k in ks if k>=n)
 t=0 if j==k else (n-k)/(j-k)
 lip=np.array(YS[k])*(1-t)+np.array(YS[j])*t
 xx=np.arange(AW); yy=np.arange(AH)[:,None]
 lip_curve=PchipInterpolator(XS,lip,extrapolate=False)(np.clip(xx,XS[0],XS[-1]))
 lip_curve[xx<XS[0]]=720
 upper=yy<=lip_curve[None,:]
 fold=xx[None,:]<=PchipInterpolator(FOLDY,FOLDX)(np.arange(AH))[:,None]
 shore=PchipInterpolator(*np.array(SHORE).T)(xx)[None,:]
 sea=yy>=shore
 body=upper|fold|sea
 mountain=np.interp(xx,*np.array(MOUNTAIN).T)[None,:]
 land=(yy>mountain-3)&(yy<shore)&(xx[None,:]>635)
 return body,land,sea,shore,mountain

def alpha_for(n,img,ref):
 body,land,sea,shore,mountain=hand(n)
 dist=distance_transform_edt(body)-distance_transform_edt(~body)
 # Full-opacity water core; only a narrow edge gets partial coverage.
 alpha=smooth(-.65,.65,dist)
 rgb=img.astype(np.float32)/255; bg=ref.astype(np.float32)/255
 delta=np.maximum(rgb-bg,0).max(2)
 lo=gaussian_filter(rgb,sigma=(2.2,2.2,0))
 bright=(rgb-lo).max(2)
 sat=(rgb.max(2)-rgb.min(2))/np.maximum(rgb.max(2),.01)
 water_hue=(sat<.39)|(rgb[:,:,2]>rgb[:,:,0]*.91)
 # Refine protrusions and detached spray against the actual static background.
 residual=smooth(.055,.18,delta)
 points=smooth(.055,.18,bright)*water_hue
 near=(dist>-64)&(dist<12)
 sky=np.arange(AH)[:,None] < mountain-3
 extra=np.maximum(residual,points*sky)*near*water_hue
 alpha=np.maximum(alpha,extra)
 # Coast behind translucent falling water: keep moving opaque scattering foam,
 # not static buildings/land baked into the original RGB.
 coast_water=smooth(.07,.24,delta)*water_hue
 alpha[land]=coast_water[land]
 alpha[sea]=1
 # Deep sky/sun stay unequivocally black, not a luminance key.
 alpha[(dist < -64)&(~land)]=0
 # Late blue-sky slit revealed between two falling sheets at the right edge.
 # Only flat colour matching the original sky, connected to the image edge,
 # is removed; textured blue water and independent spray are not a global key.
 yy=np.arange(AH)[:,None];xx=np.arange(AW)[None,:]
 local_std=np.sqrt(np.maximum(gaussian_filter(rgb*rgb,sigma=(1.25,1.25,0))-gaussian_filter(rgb,sigma=(1.25,1.25,0))**2,0)).max(2)
 same_sky=(np.abs(rgb-bg).max(2)<.13)&(local_std<.022)&(xx>1000)&(yy<mountain-4)
 same_sky=binary_closing(same_sky,structure=np.ones((3,3)),border_value=1)
 seed=np.zeros((AH,AW),bool);seed[:,-1]=same_sky[:,-1]
 reveal=binary_propagation(seed,mask=same_sky)
 alpha[reveal]=0
 return np.rint(np.clip(alpha,0,1)*255).astype(np.uint8),body,land

def main():
 global SRC,ROOT
 ap=argparse.ArgumentParser();ap.add_argument('--tag',default='v2');ap.add_argument('--source',type=Path,required=True);ap.add_argument('--recipe',type=Path,required=True);ap.add_argument('--output',type=Path,required=True);ap.add_argument('--output-dir',type=Path,default=ROOT);ap.add_argument('--previews-only',action='store_true');args=ap.parse_args();tag=args.tag
 SRC=args.source.expanduser().resolve()
 ROOT=args.output_dir.expanduser().resolve();ROOT.mkdir(parents=True,exist_ok=True)
 if args.recipe:
  global XS,YS,FOLDY,FOLDX,SHORE,MOUNTAIN
  authored=json.loads(args.recipe.read_text())
  if hashlib.sha256(SRC.read_bytes()).hexdigest()!=authored['sourceSHA256']:raise ValueError('Source differs from the pinned matte recipe')
  XS=authored['lipX'];YS={int(k):v for k,v in authored['lipYBySourceFrame'].items()};FOLDY=authored['foldY'];FOLDX=authored['foldX'];SHORE=authored['shorelineXY'];MOUNTAIN=authored['mountainXY']
 cap=cv2.VideoCapture(str(SRC));frames=[]
 for n in range(N):
  ok,bgr=cap.read()
  if not ok:raise RuntimeError(f'missing sourceframe{n}')
  if n==0:assert bgr.shape[:2]==(H,W)
  frames.append(cv2.resize(cv2.cvtColor(bgr,cv2.COLOR_BGR2RGB),(AW,AH),interpolation=cv2.INTER_AREA))
 cap.release();ref=frames[0]
 out=args.output.expanduser().resolve() if args.output else ROOT/f'agent-wave31-alpha-{tag}.mkv'
 out.parent.mkdir(parents=True,exist_ok=True)
 recipe={'sourceFile':SRC.name,'sourceSHA256':hashlib.sha256(SRC.read_bytes()).hexdigest(),'sourceFrames':[0,N],'dimensions':[W,H],'fps':FPS,'sourceFrame0MapsToMatteFrame0':True,'alphaFormat':'FFV1 gray8 lossless','analysisDimensions':[AW,AH],'coordinateMapping':'x_native=x_analysis*3850/1283; y_native=y_analysis*2160/720','lipX':XS,'lipYBySourceFrame':YS,'foldY':FOLDY,'foldX':FOLDX,'shorelineXY':SHORE,'mountainXY':MOUNTAIN,'method':'Hand-tracked six lip profiles and shore/fold, temporal linear interpolation, actual image colour/positive-background-residual and local contrast for narrow fringes/drops. Coast pixels are removed unless moving opaque foam. RGB untouched.','script':Path(__file__).name,'previewFrames':CHECKS,'tag':tag,'v2Refinement':{'lipSpatialInterpolation':'shape-preserving PCHIP, no spatial overshoot','foldSpatialInterpolation':'shape-preserving PCHIP','farShoreInsetAnalysisPixels':0,'shorelineRefinement':'actual bottom of distant beach traced from nativeRGB; old recipe followed upperbeach' ,'rightSkySlit':'flat original-sky colour connected to right image edge; absRGBdelta<.13 and localstd<.022; x>1000 and above mountain; does not key blue globally','scope':'contour smoothing, far-beach removal and late edge-connected sky reveal; source RGB and independent spray detection unchanged'}}
 (ROOT/f'agent-wave31-recipe-{tag}.json').write_text(json.dumps(recipe,indent=2)+'\n')
 proc=None
 if not args.previews_only:
  proc=subprocess.Popen(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo','-pixel_format','gray','-video_size',f'{W}x{H}','-framerate',str(FPS),'-i','pipe:0','-an','-c:v','ffv1','-level','3','-coder','1','-context','1','-g','1','-pix_fmt','gray',str(out)],stdin=subprocess.PIPE)
 cap=cv2.VideoCapture(str(SRC));stats=[]
 for n in range(N):
  ok,bgr=cap.read()
  if not ok:raise RuntimeError(n)
  if args.previews_only and n not in CHECKS:continue
  ac,body,land=alpha_for(n,frames[n],ref)
  a=cv2.resize(ac,(W,H),interpolation=cv2.INTER_LINEAR)
  # Exact all-white/all-black interiors survive interpolation.
  if proc:proc.stdin.write(a.tobytes())
  if n in CHECKS:
   rgb=cv2.cvtColor(bgr,cv2.COLOR_BGR2RGB);comp=((rgb.astype(np.uint16)*a[:,:,None]+127)//255).astype(np.uint8)
   Image.fromarray(a).save(ROOT/f'agent-wave31-matte-{tag}-{n:02}.png')
   Image.fromarray(comp).save(ROOT/f'agent-wave31-masked-{tag}-{n:02}.png')
   stats.append({'frame':n,'alphaMean':float(a.mean()/255),'opaqueFraction':float((a==255).mean()),'backgroundFraction':float((a==0).mean()),'RGBdifferenceOnOpaquePixels':int(np.abs(comp.astype(np.int16)-rgb.astype(np.int16))[a==255].max(initial=0))})
  if n%15==0:print(f'frame{n}/{N}',flush=True)
 cap.release()
 if proc:proc.stdin.close();code=proc.wait();assert code==0,code
 for typ in ['masked','matte']:
  tw,th,b=770,432,28;sheet=Image.new('RGB',(tw*2,(th+b)*3),(20,20,20));draw=ImageDraw.Draw(sheet)
  for i,n in enumerate(CHECKS):
   im=Image.open(ROOT/f'agent-wave31-{typ}-{tag}-{n:02}.png').convert('RGB').resize((tw,th),Image.Resampling.LANCZOS)
   x=(i%2)*tw;y=(i//2)*(th+b);sheet.paste(im,(x,y));draw.text((x+10,y+th+8),f'{typ} | source frame {n} | {n/30:.3f}s | {W}x{H}',fill=(255,255,255))
  sheet.save(ROOT/f'agent-wave31-{typ}-{tag}-contact.png')
 (ROOT/f'agent-wave31-audit-{tag}.json').write_text(json.dumps(stats,indent=2)+'\n')
 print(out if proc else 'previews complete',flush=True)
if __name__=='__main__':main()
