from pathlib import Path
import subprocess,json,numpy as np,cv2,hashlib
from scipy.interpolate import PchipInterpolator
from scipy.ndimage import median_filter,gaussian_filter1d
from PIL import Image,ImageDraw,ImageFont
# Dependencies: numpy, scipy, Pillow, opencv-python-headless; ffmpeg/ffprobe on PATH.
# Regenerate: python scripts/acryllex/build-breaker-matte.py --source /private/cache/268746.mp4 --output-dir /tmp/outside-matte
import argparse,tempfile
parser=argparse.ArgumentParser(description="Rebuild the frozen approved4s AI-wave alpha. RGB source is read-only.")
parser.add_argument('--source',required=True,type=Path)
parser.add_argument('--recipe',type=Path,default=Path(__file__).resolve().parents[2]/'src/acryllex/assets/media/ocean-breaker-matte.json')
parser.add_argument('--output-dir',type=Path,default=Path(__file__).resolve().parent)
parser.add_argument('--work-dir',type=Path,default=Path(tempfile.gettempdir())/'agent-wave31-outside-approved4')
parser.add_argument('--previews',action='store_true',help='Also write six native preview frames and contact sheets.')
args=parser.parse_args();p=args.output_dir;p.mkdir(parents=True,exist_ok=True);tmp=args.work_dir;tmp.mkdir(parents=True,exist_ok=True);src=args.source;cfg=json.loads(args.recipe.read_text())
expected=cfg['sourceSHA256'];digest=hashlib.sha256()
with src.open('rb') as fd:
 for chunk in iter(lambda:fd.read(8*1024*1024),b''):digest.update(chunk)
if digest.hexdigest()!=expected:raise SystemExit('Source SHA256 mismatch: use the documented original Pixabay268746 RGB source.')
W,H=3840,2160;w,h=960,540;count=76;fps=30;check=[0,15,30,45,60,75]
# Manual guides stay in the original source orientation.
keys=sorted(map(int,cfg['manualKeyframes']));x=np.arange(w,dtype=float);guides={k:PchipInterpolator(np.array(cfg['manualKeyframes'][str(k)])[:,0],np.array(cfg['manualKeyframes'][str(k)])[:,1])(x) for k in keys}
def between(n,values):
 a=max(k for k in keys if k<=n);b=min(k for k in keys if k>=n);t=(n-a)/(b-a) if b>a else 0;return values[a]*(1-t)+values[b]*t
proc=subprocess.Popen(['ffmpeg','-v','error','-i',str(src),'-frames:v',str(count),'-vf',f'trim=start_frame=120:end_frame=196,setpts=PTS-STARTPTS,scale={w}:{h}:flags=area','-f','rawvideo','-pix_fmt','rgb24','-'],stdout=subprocess.PIPE)
small=[];curves=[];rawGuide=[]
for n in range(count):
 data=proc.stdout.read(w*h*3)
 if len(data)!=w*h*3:raise RuntimeError(f'Incomplete lowres source frame{n}')
 a=np.frombuffer(data,np.uint8).reshape(h,w,3).copy();small.append(a);guide=between(n,guides);rawGuide.append(guide);blur=cv2.GaussianBlur(a.astype(np.float32)/255,(0,0),.65);grad=np.sqrt(np.square(blur[2:]-blur[:-2]).sum(-1));grad=np.pad(grad,((1,1),(0,0)))
 delta=np.arange(-6,7)[:,None];yy=np.clip(np.rint(guide)[None,:].astype(int)+delta,1,h-2);score=grad[yy,np.arange(w)[None,:]]-.007*(delta/6)**2;arg=score.argmax(0);curve=yy[arg,np.arange(w)].astype(float);curve=gaussian_filter1d(median_filter(curve,size=7),.8);curves.append(curve)
proc.stdout.close();assert proc.wait()==0
curves=median_filter(np.array(curves),size=(3,1));guideArray=np.array(rawGuide);curves[guideArray<0]=guideArray[guideArray<0];np.save(p/'agent-wave31-outside-approved4-refined-contours.npy',curves)
# Create native lossless alpha with the exact same source clock/aspect as the RGB clip.
enc=subprocess.Popen(['ffmpeg','-y','-v','error','-f','rawvideo','-pix_fmt','gray','-s',f'{W}x{H}','-r','30','-i','-','-frames:v',str(count),'-an','-c:v','ffv1','-level','3','-pix_fmt','gray','-color_range','pc',str(p/'agent-wave31-outside-approved4-alpha-final.tmp.mkv')],stdin=subprocess.PIPE)
dec=subprocess.Popen(['ffmpeg','-v','error','-i',str(src),'-frames:v',str(count),'-vf','trim=start_frame=120:end_frame=196,setpts=PTS-STARTPTS','-f','rawvideo','-pix_fmt','rgb24','-'],stdout=subprocess.PIPE)
yy=np.arange(H,dtype=np.float32)[:,None]/4;xx=np.arange(W,dtype=np.float32)[None,:]/4;stats=[];font=ImageFont.truetype('/System/Library/Fonts/Menlo.ttc',22) if Path('/System/Library/Fonts/Menlo.ttc').exists() else ImageFont.load_default();nativeMasked=Image.new('RGB',(W*2,(H+55)*3),'#111111');nativeMatte=Image.new('RGB',nativeMasked.size,'#111111')
moonValues={k:np.array(cfg['moonCenters'][str(k)],float) for k in keys}
for n in range(count):
 data=dec.stdout.read(W*H*3)
 if len(data)!=W*H*3:raise RuntimeError(f'Incomplete native source frame{n}')
 rgb=np.frombuffer(data,np.uint8).reshape(H,W,3);a=rgb.astype(np.float32)/255;curve=np.interp(np.arange(W)/4,np.arange(w),curves[n]).astype(np.float32)[None,:];distance=yy-curve;pw=np.clip((xx-380)/55,0,1)*np.clip((710-xx)/70,0,1);feather=.8+3.2*pw;u=np.clip((distance+feather)/(2*feather),0,1);alpha=u*u*(3-2*u)
 # Preserve bright thin spray up to4guide-px outside the contour. Only the uncertainty band can change.
 lum=a.mean(-1);bgSmall=cv2.GaussianBlur(small[n].astype(np.float32).mean(-1)/255,(0,0),2);bgSample=bgSmall[np.clip(np.rint(curves[n]-9).astype(int),0,h-1),np.arange(w)];bg=np.interp(np.arange(W)/4,np.arange(w),bgSample)[None,:];outer=np.clip((distance+4)/4,0,1)*np.clip(-distance/1.0,0,1);spray=np.clip((lum-bg-.035)/.20,0,1)*outer;alpha=np.maximum(alpha,spray)
 edge=(distance>-7)&(distance<7);b=a[:,:,2];g=a[:,:,1];r=a[:,:,0];dark=(b<.28)&(g<.25);green=(g>b*1.08)&(g>r*1.05);alpha[edge&(dark|green)&(xx>80)&(xx<460)]=0
 # Exclude the actual moon and its warm halo above/at the crest, without touching reflections on the water.
 mx,my=between(n,moonValues);disk=((xx-mx)**2+(yy-my)**2)<19**2;moonWarm=(r>g*.99)&(r>b*1.03)&(g>b*1.005);alpha[disk&moonWarm]=0;halo=((xx-mx)**2+(yy-my)**2)<43**2;warm=(r>g*1.03)&(r>b*1.02);alpha[halo&warm&(yy<145)&(distance<5)]=0
 mask=np.uint8(np.clip(alpha,0,1)*255+.5);enc.stdin.write(mask.tobytes());stats.append({'n':n,'sourceFrame':n+120,'sourceSeconds':(n+120)/fps,'alphaMean':float(mask.mean()/255),'keptPixelFraction':float((mask>0).mean()),'foregroundPixelFraction':float((mask==255).mean()),'moonRegionMax':int(mask[disk].max()),'knownSkyMax':int(mask[:200,:1200].max())})
 if n in check and args.previews:
  masked=np.uint8(rgb.astype(np.float32)*(mask[:,:,None]/255));im=Image.fromarray(masked);ma=Image.fromarray(mask);im.save(p/f'agent-wave31-outside-approved4-masked-{n:03d}.png');ma.save(p/f'agent-wave31-outside-approved4-alpha-{n:03d}.png');idx=check.index(n);col=idx%2*W;row=idx//2*(H+55);nativeMasked.paste(im,(col,row+55));nativeMatte.paste(ma.convert('RGB'),(col,row+55));ImageDraw.Draw(nativeMasked).text((col+10,row+12),f'AI APPROVED source{n+120}/30={(n+120)/30:.3f}s | unflipped matte/RGB; engine mirrorX required',font=font,fill='white');ImageDraw.Draw(nativeMatte).text((col+10,row+12),f'Native alpha APPROVED source frame{n+120}; white=water, black=removed',font=font,fill='white')
dec.stdout.close();assert dec.wait()==0;enc.stdin.close();assert enc.wait()==0;(p/'agent-wave31-outside-approved4-alpha-final.tmp.mkv').replace(p/'agent-wave31-outside-approved4-alpha.mkv')
if args.previews:
 nativeMasked.save(p/'agent-wave31-outside-approved4-masked-native-contact.jpg',quality=95);nativeMatte.save(p/'agent-wave31-outside-approved4-matte-native-contact.png');nativeMasked.thumbnail((1920,1800));nativeMasked.save(p/'agent-wave31-outside-approved4-masked-contact.jpg',quality=94);nativeMatte.thumbnail((1920,1800));nativeMatte.save(p/'agent-wave31-outside-approved4-matte-contact.png')
json.dump({'frames':stats,'sourceStartFrame':120,'sourceEndFrameExclusive':196,'selectedCount':76,'fps':30,'nativeSize':[W,H],'orientation':'both original/unflipped','AIgenerated':True,'method':cfg['refinement']},open(p/'agent-wave31-outside-approved4-matte-audit.json','w'),indent=2);print('Saved native76-frame alpha/contact/audit')

subprocess.run(['ffmpeg','-y','-v','error','-i',str(p/'agent-wave31-outside-approved4-alpha.mkv'),'-vf','tpad=start_duration=4:start_mode=add:color=black,setpts=PTS-STARTPTS','-frames:v','196','-an','-c:v','ffv1','-level','3','-pix_fmt','gray','-color_range','pc',str(p/'agent-wave31-outside-approved4-alpha-full-clock.mkv')],check=True)
print('Full-clock alpha ready:120 black frames +76 source-matched alpha frames.')
