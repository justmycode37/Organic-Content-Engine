import { smooth, tau } from '../index.ts';
import { c, canvas, grad, line, lensGlow, plate, words, W, H } from './stage.ts';
import fieldUrl from './hubble-deep-field.jpg';
import telescopeUrl from './hubble-sts125.jpg';

type XY = [number, number];
type Scene = (t: number, seconds: number) => void;
const field = new Image(), telescope = new Image();
field.src=fieldUrl;
telescope.src=telescopeUrl;
const cream='#fff0db', ink='#2b253b', purple='#7a5079', blush='#f3a1a0';
const lime='#dff66d', moss='#475d0b', lilac='#bdb4ef';
const target: XY=[0.594,0.644];
const cropFraction=0.107;
const sampleSize=176, sampleCount=20;
const exposures: HTMLCanvasElement[]=[];
const averages: HTMLCanvasElement[]=[];
Object.assign(window,{motionAssetsReady: Promise.all([field.decode(),telescope.decode()]).then(buildSamples)});

const p=(t: number,start: number,end: number)=>smooth((t-start)/(end-start));
const clamp=(x: number)=>Math.max(0,Math.min(1,x));
const mix=(a: number,b: number,t: number)=>a+(b-a)*t;
const path=(fn: (u: number)=>XY,n=120)=>Array.from({length:n+1},(_,i)=>fn(i/n));
const text=(s: string,x: number,y: number,size=24,fill=cream,align: CanvasTextAlign='left')=>
  words(s,x,y,size,'sans',fill,align);
const note=(s: string,color=cream)=>text(s,72,675,17,color);

const grain=document.createElement('canvas');
grain.width=W;
grain.height=H;
const grainCtx=grain.getContext('2d')!;
const gr=grainCtx.createImageData(W,H);
let seed=1995;
function rand() {
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  return seed / 4294967296;
}
for(let i=0;i<gr.data.length;i+=4) {
  const value=rand()>0.5?255:0;
  gr.data.set([value,value,value,rand()*37],i);
}
grainCtx.putImageData(gr,0,0);

function cropped(ctx: CanvasRenderingContext2D,cx: number,cy: number,fraction: number,w: number,h: number) {
  const fw=field.naturalWidth,fh=field.naturalHeight;
  const span=fw*fraction;
  ctx.drawImage(field,cx*fw-span/2,cy*fh-span/2,span,span,0,0,w,h);
}
function sampleImage(values: Float32Array,n: number) {
  const sample=document.createElement('canvas');
  sample.width=sample.height=sampleSize;
  const ctx=sample.getContext('2d')!;
  const pixels=ctx.createImageData(sampleSize,sampleSize);
  for(let i=0;i<values.length;i++){
    const v=Math.max(0,Math.min(255,values[i]/n));
    pixels.data.set([v*0.91,v*0.93,v,255],i*4);
  }
  ctx.putImageData(pixels,0,0);
  return sample;
}
function buildSamples() {
  const original=document.createElement('canvas');
  original.width=original.height=sampleSize;
  const ctx=original.getContext('2d')!;
  cropped(ctx,...target,cropFraction,sampleSize,sampleSize);
  const source=ctx.getImageData(0,0,sampleSize,sampleSize).data;
  const sums=new Float32Array(sampleSize*sampleSize);
  for(let frame=0;frame<sampleCount;frame++){
    const values=new Float32Array(sums.length);
    for(let i=0;i<sums.length;i++){
      const signal=0.22*(0.22*source[4*i]+0.70*source[4*i+1]+0.08*source[4*i+2]);
      const noise=57*(rand()+rand()+rand()+rand()-2);
      values[i]=55+signal+noise;
      sums[i]+=values[i];
    }
    exposures.push(sampleImage(values,1));
    averages.push(sampleImage(sums,frame+1));
  }
}

function paper(t: number) {
  c.fillStyle=grad(0,0,W,H,['#f1ddc3','#ebc6c3','#d5bddb','#a6a5c5']);
  c.fillRect(0,0,W,H);
  c.drawImage(grain,0,0);
  c.globalAlpha=0.26;
  const drift=(t*4.8)%51;
  for(let x=-51+drift;x<W;x+=51) line([[x,0],[x,H]],'#9f6f9257',1);
  for(let y=0;y<H;y+=51) line([[0,y],[W,y]],'#9f6f9257',1);
  c.globalAlpha=1;
}
function sky(t: number) {
  c.drawImage(plate,-28+22*Math.sin(t*0.24),-18,W+60,H+36);
  lensGlow(1110,179,590,'#ae5587',0.24);
}
function pill(x: number,y: number,w: number,h: number,fill: string | CanvasGradient,r=0) {
  c.fillStyle=fill;
  c.beginPath();
  c.roundRect(x,y,w,h,r);
  c.fill();
}
function spot(x: number,y: number,r: number,fill: string) {
  c.fillStyle=fill;
  c.beginPath();
  c.arc(x,y,r,0,tau);
  c.fill();
}
function aperture(x: number,y: number,w: number,h: number,color: string,stroke=2.5) {
  const a=Math.min(w,h)*0.18;
  for(const dx of [0,1]) for(const dy of [0,1]){
    const xx=x+w*dx,yy=y+h*dy;
    line([[xx,yy+a*(1-2*dy)],[xx,yy],[xx+a*(1-2*dx),yy]],color,stroke);
  }
}
function imageCrop(cx: number,cy: number,fraction: number,x: number,y: number,w: number,h=w) {
  c.save();
  c.translate(x,y);
  cropped(c,cx,cy,fraction,w,h);
  c.restore();
}
function steppedMosaic(x: number,y: number,w: number,h: number) {
  c.save();
  const edges: XY[]=[[0,0],[0.5,0],[0.5,0.27],[0.725,0.27],[0.725,0.49],[1,0.49],[1,1],[0,1]];
  c.beginPath();
  edges.forEach(([u,v],i)=>i?c.lineTo(x+u*w,y+v*h):c.moveTo(x+u*w,y+v*h));
  c.closePath();
  c.clip();
  c.drawImage(field,x,y,w,h);
  c.restore();
}
function cover(t: number,duration: number,still=false) {
  paper(t);
  const cx=mix(872,696,p(t,6.6,duration)),cy=356,r=mix(242,320,p(t,6.6,duration));
  c.save();
  c.translate(cx,cy);
  c.rotate(-0.12+0.038*Math.sin(t*0.72));
  const widths=[0.83,1.04,1.23];
  for (const [i,k] of widths.entries()) {
    const dx=(-54+31*i)*Math.sin(t*0.35+i);
    const y=18*i;
    pill(-r*k+dx,-r*0.92+y,2*r*k,2*r*0.90,grad(-r,-r,2*r,2*r,
      ['#3a3557','#bd7192','#efb292','#6b567c']),14);
    pill(-r*k+dx+6,-r*0.92+y+6,2*r*k-12,2*r*0.90-12,'#28223a',9);
  }
  c.beginPath();
  c.arc(0,0,r*0.88,0,tau);
  c.clip();
  imageCrop(...target,0.50,-r,-r,2*r);
  const reveal=still?1:p(t,2.2,5.5);
  c.globalAlpha=1-reveal*0.95;
  pill(-r,-r,2*r,2*r,'#160e23');
  c.globalAlpha=1;
  lensGlow(r*0.38,-r*0.49,r*0.86,'#c33872',0.34);
  const side=r*(0.35+0.35*p(t,6.3,duration));
  aperture(-side/2,-side/2,side,side,lime,4.5);
  c.restore();
  const fade=still?1:1-p(t,5.8,6.6);
  c.globalAlpha=fade;
  text('The Sky That',69,172,71,ink);
  text('Looked Empty',69,254,71,ink);
  text('Mysteries of the Sky',74,322,25,purple);
  c.globalAlpha=1;
  if(!still){
    const label=p(t,4.3,5.8)*(1-p(t,7.0,9.0));
    c.globalAlpha=label;
    text('≈ 3,000 galaxies',75,424,36,moss);
    c.globalAlpha=1;
    c.globalAlpha=1-p(t,7,8.0);
    note('Hubble Deep Field · enlarged detail',ink);
    c.globalAlpha=1;
  }
}

function observing(t: number,duration: number) {
  sky(t);
  const x=mix(-93,23,p(t,0,3.7)),w=867, y=89,h=576;
  c.save();
  c.beginPath();
  c.moveTo(20,111);
  c.lineTo(830,70);
  c.lineTo(846,608);
  c.lineTo(41,655);
  c.closePath();
  c.clip();
  c.drawImage(telescope,x,y,w,h);
  c.restore();
  const targetX=mix(1120,1011,p(t,0.6,duration)),targetY=mix(235,342,p(t,0,duration));
  const hx=x+w*0.39,hy=y+h*0.49;
  c.beginPath();
  c.moveTo(hx,hy);
  c.lineTo(targetX-71,targetY-61);
  c.lineTo(targetX-71,targetY+69);
  c.closePath();
  c.fillStyle=grad(hx,hy,targetX-hx,0,['#dff66d14','#de96b936','#dec1e19f']);
  c.fill();
  const marker=0.08+0.9*((t*0.58)%1);
  spot(mix(hx,targetX-70,marker),mix(hy,targetY,marker),4,lime);
  pill(targetX-76,targetY-76,152,152,'#3c2b49',8);
  imageCrop(...target,cropFraction,targetX-72,targetY-72,144);
  aperture(targetX-77,targetY-77,154,154,lime,3);
  text('One patch near the Big Dipper',818,130,26);
  text('December 1995 observations',817,166,20,lilac);
  note('Telescope photo · NASA / STS-125, May 2009');
}

function framePlate(sample: HTMLCanvasElement,x: number,y: number,size: number,angle=0,zoom=1){
  c.save();
  c.translate(x+size/2,y+size/2);
  c.rotate(angle);
  pill(-size/2-11,-size/2-11,size+29,size+29,'#43294b70',7);
  pill(-size/2-8,-size/2-8,size+16,size+16,grad(-size/2,-size/2,size,size,['#c7bad9','#fbd0b0','#774e79']),6);
  const source=sample.width/zoom;
  const inset=(sample.width-source)/2;
  c.drawImage(sample,inset,inset,source,source,-size/2,-size/2,size,size);
  c.restore();
}
function single(t: number,duration: number) {
  paper(t);
  const x=mix(714,660,p(t,0,duration)),y=mix(188,151,p(t,0,duration)),size=mix(314,407,p(t,0,duration));
  const next=Math.min(3,Math.floor(t/2.15));
  framePlate(exposures[next],x,y,size);
  aperture(x+size*0.38,y+size*0.38,size*0.24,size*0.24,lime,2.7);
  const endX=x+size*0.39,endY=y+size*0.52;
  line([[368,349],[592,349],[endX,endY]],moss,2.3);
  text('One exposure',72,113,49,ink);
  text('A faint galaxy is here',72,341,29,moss);
  const cue=p(t,4.0,5.0);
  c.globalAlpha=cue;
  text('Noise varies in the next frame',73,434,25,ink);
  c.globalAlpha=1;
  note('Simulated exposures · same field detail with independent noise',ink);
}

function register(t: number,duration: number) {
  paper(t);
  const gather=p(t,0.5,3.82);
  const inspect=p(t,4.1,duration);
  const targetX=mix(944,788,gather)+49*inspect,targetY=346,side=mix(199,272,gather)+30*inspect;
  const cards=[[198,244,-0.24],[440,286,0.08],[692,234,0.20]];
  for(const [i,[left,top,tilt]] of cards.entries()){
    const travel=p(t,i*0.39,3.14+i*0.32);
    const size=mix(212,side,travel);
    const x=mix(left,targetX-side/2,travel),y=mix(top,targetY-side/2,travel);
    framePlate(exposures[i],x,y,size,tilt*(1-travel));
    aperture(x+size*0.40,y+size*0.40,size*0.20,size*0.20,lime,2.3);
    if(travel<0.66) text('Exposure '+(i+1),x+size/2,y-33,20,ink,'center');
  }
  const aligned=p(t,3.06,4.8);
  if(aligned>0.01){
    const current=3+Math.floor((t-3)*1.4)%6;
    framePlate(exposures[Math.max(3,current)],targetX-side/2,targetY-side/2,side);
    aperture(targetX-side*0.12,targetY-side*0.12,side*0.24,side*0.24,lime,3);
    line([[471,393],[565,393],[targetX-side*0.14,targetY+15]],moss,2.5);
    text('Same place in each frame',93,385,28,moss);
    c.globalAlpha=aligned;
    text('The noise pattern changes',94,447,24,ink);
    c.globalAlpha=1;
  }
  text('Line up the same galaxy',72,104,43,ink);
  note('Simulated crops · offsets, alignment and noise illustrated',ink);
}

function average(t: number,duration: number) {
  paper(t);
  const count=Math.min(sampleCount,1+Math.floor(t*3.2));
  const left=169,right=mix(729,757,p(t,0.0,duration)),y=215,size=329;
  const zoom=1+0.65*p(t,5.2,duration);
  framePlate(exposures[0],left,y,size,0,zoom);
  framePlate(averages[count-1],right,y,size,0,zoom);
  aperture(left+size*0.35,y+size*0.35,size*0.30,size*0.30,lilac,2.4);
  aperture(right+size*0.35,y+size*0.35,size*0.30,size*0.30,lime,3.1);
  line([[539,385],[688,385]],moss,2.1);
  line([[676,377],[688,385],[676,393]],moss,2.1);
  text('The galaxy stays. The noise fades.',72,106,45,ink);
  text('One exposure',left+size/2,178,28,ink,'center');
  text('Average of '+count,right+size/2,178,28,moss,'center');
  const yBar=580;
  pill(right,yBar,size,8,'#987c9b53',4);
  pill(right,yBar,size*count/sampleCount,8,moss,4);
  text('More independent exposures',right+size/2,620,20,ink,'center');
  note('Same brightness scale · simulated noise decreases with averaging',ink);
}

const filters=[['300 nm','#a68be1'],['450 nm','#a7a4ff'],['606 nm','#f2ba9f'],['814 nm','#db757b']];
function filtersScene(t: number,duration: number) {
  sky(t);
  const spread=1-p(t,duration*0.55,duration);
  const angle=-0.12+0.04*Math.sin(t*0.51);
  text('342 exposures',74,140,59);
  text('Four wavelength bands',76,204,29,lilac);
  for(const [i,[wavelength,color]] of filters.entries()){
    const x=604+i*(112*spread+12),y=127+i*40*spread;
    c.save();
    c.translate(x,y);
    c.rotate(angle*(1-spread*0.2));
    pill(0,0,278,388,color,9);
    imageCrop(...target,cropFraction*1.2,11,12,256,353);
    c.globalAlpha=0.23;
    pill(11,12,256,353,color,3);
    c.globalAlpha=1;
    if(spread>0.38) text(wavelength,19,375,22,cream);
    c.restore();
  }
  note('Filter layers illustrated · Hubble Deep Field observations, December 1995');
}

function reveal(t: number,duration: number) {
  sky(t);
  const detail=p(t,0.15,3.5);
  const approach=p(t,4.8,duration);
  const xf=mix(637,507,detail)-117*approach,yf=mix(-128,49,detail)-126*approach;
  const w=mix(1010,615,detail)+287*approach,h=w*0.980;
  c.save();
  c.beginPath();
  c.rect(492,0,W-492,H);
  c.clip();
  steppedMosaic(xf,yf,w,h);
  c.restore();
  const markerX=xf+w*target[0],markerY=yf+h*target[1],markerSize=w*cropFraction;
  aperture(markerX-markerSize/2,markerY-markerSize/2,markerSize,markerSize,lime,2.9);
  const issue=p(t,0.75,2.0);
  c.globalAlpha=issue;
  text('The Hubble Deep Field',71,128,42);
  text('The actual 1995 mosaic',74,176,24,lilac);
  c.globalAlpha=1;
  const locations: XY[]=[[0.306,0.454],target,[0.885,0.741]];
  for(const [i,loc] of locations.entries()){
    const open=p(t,2.9+i*0.23,4.5+i*0.23);
    if(open<=0) continue;
    const x=69+i*130,y=489,side=112;
    const fromX=xf+w*loc[0],fromY=yf+h*loc[1];
    c.globalAlpha=open;
    line([[fromX,fromY],[x+side/2,y]],i===1?lime:lilac,1.65);
    imageCrop(...loc,0.047,x,y,side);
    aperture(x,y,side,side,i===1?lime:lilac,2);
    c.globalAlpha=1;
  }
  const late=p(t,5.2,7.2);
  c.globalAlpha=late;
  text('Different light travel times',73,345,24,cream);
  text('Different moments in cosmic history',73,386,22,cream);
  c.globalAlpha=1;
  note('Mosaic · R. Williams, the Hubble Deep Field Team and NASA');
}
function credits(t: number,duration: number) {
  paper(t);
  const w=mix(634,713,p(t,0,duration));
  steppedMosaic(656,92,w,w*0.98);
  text('The Sky That Looked Empty',73,183,44,ink);
  text('Mosaic · R. Williams, Hubble Deep Field Team, NASA',75,308,22,ink);
  text('Hubble photograph · NASA / STS-125',75,350,22,ink);
  text('Observations and reduction · Williams et al. (1996)',75,392,22,ink);
  text('Mysteries of the Sky',75,507,21,purple);
}

const scenes: Record<string,Scene>={
  cover, observing, single, register, average, filters: filtersScene, reveal, credits,
  thumbnail:(t,duration)=>cover(t,duration,true),
};
const iris: Record<string,XY>={
  observing:[921,289], single:[835,350], register:[852,344], average:[931,354],
  filters:[900,356],reveal:[895,355],credits:[864,363],
};
Object.assign(window,{
  hubbleFieldFrame(key: string,t: number,cue?: {duration?: number;prev?: string;prevT?: number},mime='image/jpeg') {
    const draw=scenes[key];
    if(!draw) throw new Error('Unknown Hubble field scene: '+key);
    const duration=cue?.duration??10;
    const previous=cue?.prev&&scenes[cue.prev];
    const center=iris[key];
    c.save();
    if(previous&&cue.prevT&&center&&t<0.54){
      previous(cue.prevT+t,cue.prevT);
      c.beginPath();
      c.arc(...center,1760*p(t,0.0,0.54),0,tau);
      c.clip();
    }
    draw(t,duration);
    c.restore();
    return canvas.toDataURL(mime,0.95).split(',')[1];
  },
});
