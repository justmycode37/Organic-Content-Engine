import { drawPlanet, preparePlanets, smooth, tau } from '../index.ts';
import { c, canvas, grad, lensGlow, line, plate, words, W, H } from './stage.ts';

Object.assign(window, { motionAssetsReady: preparePlanets(['jupiter', 'earth', 'sun']) });

type XY = [number, number];
type Scene = (t: number, duration: number) => void;
const cream = '#fff0d9', ink = '#32253c', plum = '#774968', blade = '#dff66c', moss = '#486400';
const peach = '#f4b6a7', violet = '#bdb6ef';
const mix = (a: number, b: number, p: number) => a + (b - a) * p;
const tween = (t: number, a: number, b: number) => smooth((t-a)/(b-a));
const limit = (p: number) => Math.max(0,Math.min(1,p));
const path = (fn: (u: number) => XY, count = 120) => Array.from({ length: count + 1 }, (_, i) => fn(i / count));
const polar = (x: number, y: number, r: number, theta: number, yScale = 1): XY =>
  [x + r * Math.cos(theta), y + r * yScale * Math.sin(theta)];
const text = (s: string, x: number, y: number, size = 26, color = cream, align: CanvasTextAlign = 'left') =>
  words(s,x,y,size,'sans',color,align);
const small = (s: string, color = cream) => text(s,70,675,18,color);

const grain = document.createElement('canvas');
grain.width = W;
grain.height = H;
const noise = grain.getContext('2d')!;
const pixels = noise.createImageData(W,H);
let seed = 1676;
for (let i = 0; i < pixels.data.length; i += 4) {
  seed = (Math.imul(seed,1664525) + 1013904223) >>> 0;
  const value = seed >>> 31 ? 255 : 0;
  pixels.data.set([value,value,value,(seed>>>16)&31],i);
}
noise.putImageData(pixels,0,0);

function paper(t: number) {
  c.fillStyle = grad(0,0,W,H,['#f2dfc3','#ecc6be','#d5bfd9','#abadc8']);
  c.fillRect(0,0,W,H);
  c.drawImage(grain,0,0);
  c.globalAlpha = 0.25;
  const shift = (t*4)%46;
  for (let x=-46+shift;x<W;x+=46) line([[x,0],[x,H]],'#9b72925c',1);
  for (let y=-46;y<H;y+=46) line([[0,y],[W,y]],'#9b72925c',1);
  c.globalAlpha=1;
}
function space(t: number) {
  c.fillStyle='#191326';
  c.fillRect(0,0,W,H);
  c.drawImage(plate,-42+37*Math.sin(t*0.16),-34,W+86,H+70);
  lensGlow(1120,281,605,'#c06a90',0.16);
}
function fillEllipse(x: number,y: number,rx: number,ry: number,fill: CanvasGradient | string) {
  c.fillStyle=fill;
  c.beginPath();
  c.ellipse(x,y,rx,ry,0,0,tau);
  c.fill();
}
function spark(x: number,y: number,r = 6,color: string = blade) {
  lensGlow(x,y,r*8,color,0.84);
  fillEllipse(x,y,r,r,color);
}
function edge(x: number,y: number,rx: number,ry: number,color: string,w = 1.5) {
  line(path(u=>polar(x,y,rx,u*tau,ry/rx),170),color,w);
}
function planet(body: 'jupiter'|'earth'|'sun',x: number,y: number,r: number,t: number) {
  drawPlanet(c,{body,center:[x,y],radius:r,longitude:(body==='earth'?-1.42:-0.45)+t*0.026,
    latitude:body==='earth'?0.36:0.1,roll:body==='jupiter'?-0.12:0.07,light:[-0.68,0.08,0.73]});
}
function moon(x: number,y: number,r: number,visible = 1) {
  const shade=c.createRadialGradient(x-r*0.30,y-r*0.25,0,x,y,r);
  shade.addColorStop(0, '#fff4b4');
  shade.addColorStop(0.52, '#cf9f62');
  shade.addColorStop(1, '#624653');
  fillEllipse(x,y,r,r,'#272031');
  c.globalAlpha=visible;
  fillEllipse(x,y,r,r,shade);
  c.globalAlpha=1;
}

function tickRing(x: number,y: number,r: number,t: number,color: string) {
  for(let i=0;i<60;i++) {
    const a=i*tau/60+t;
    const major=i%5===0;
    line([polar(x,y,r-(major?14:5),a),polar(x,y,r,a)],color,major?2.6:1.25);
  }
}
function gear(x: number,y: number,r: number,phase: number,teeth: number) {
  c.beginPath();
  const rim=path(u=>{
    const a=u*tau+phase;
    const f=(u*teeth)%1;
    return polar(x,y,r*(f>0.24&&f<0.76?1:0.924),a);
  },teeth*8);
  for(const [i,[a,b]] of rim.entries()) i?c.lineTo(a,b):c.moveTo(a,b);
  c.closePath();
  c.fillStyle=grad(x-r,y-r,2*r,2*r,['#815668','#eecaa3','#a86d79','#573a56']);
  c.fill();
  fillEllipse(x,y,r*0.71,r*0.71,'#4e3652');
  edge(x,y,r*0.79,r*0.79,'#f6d7c3af',2.6);
  for(let i=0;i<6;i++) {
    const angle=phase+i*tau/6;
    line([[x,y],polar(x,y,r*0.73,angle)],'#c19192',9);
  }
  fillEllipse(x,y,r*0.24,r*0.24,'#d0a087');
  fillEllipse(x,y,r*0.09,r*0.09,'#503855');
}

function cover(t: number,duration: number,still = false) {
  paper(t);
  const zoom=still?1:1+0.16*tween(t,duration*0.39,duration);
  const gx=876,gy=378;
  c.save();
  c.translate(gx,gy);
  c.scale(zoom,zoom);
  c.rotate(-0.11+0.022*Math.sin(t*0.52));
  fillEllipse(18,16,306,306,'#7c597c64');
  fillEllipse(0,0,299,299,grad(-288,-270,585,585,['#654460','#d39d8a','#fee2b8','#8c536e','#563957']));
  fillEllipse(0,0,279,279,grad(-260,-260,515,540,['#362741','#78465d','#28213b']));
  edge(0,0,271,271,'#efd4b59a',2);
  tickRing(0,0,267,t*0.034,'#f6d9bb');
  const f=0.3*t;
  gear(-165,133,112,-f*0.69,35);
  gear(-244,-31,71,f*1.07,24);
  gear(234,129,91,-f*0.86,28);
  const cx=33,cy=-31;
  edge(cx,cy,195,97,'#eed0ba9c',2);
  const a=-0.8+0.55*t;
  const io=polar(cx,cy,195,a,0.50);
  if(Math.sin(a)<0) moon(...io,8);
  planet('jupiter',cx,cy,149,t);
  if(Math.sin(a)>=0) moon(...io,8);
  c.rotate(-0.044*t);
  line([[0,0],[-89,202]],'#eee0c3',4);
  line([[0,0],[181,-151]],'#d79490',3);
  c.restore();
  const marker=still?1:tween(t,0.12,1.3)*(1-tween(t,0.39*duration,0.64*duration));
  c.globalAlpha=marker;
  text('The Moon',61,187,76,ink);
  text('That Ran Late',61,273,76,ink);
  text('Mysteries of the Sky',68,342,25,plum);
  c.globalAlpha=1;
  if(!still) small('Jupiter as a clock · visual analogy',ink);
}

function shadowScene(t: number,duration: number) {
  space(t);
  const zoom=1+0.14*tween(t,1,11.5),jx=mix(465,413,tween(t,0.5,11.6)),jy=355;
  const r=123*zoom, orbit=294*zoom;
  const into=tween(t,0,4.7), out=tween(t,4.7,8.2), away=tween(t,8.2,10.9);
  const next=tween(t,10.7,duration-0.25);
  const a=-1.17+0.90*into+0.78*out+0.23*away+tau*next;
  const here=polar(jx,jy,orbit,a,0.81);
  const [mx,my]=here;
  const shadowRadius=r*(1-0.09*limit((mx-jx)/(W-jx)));
  const behind=mx>jx&&Math.abs(my-jy)<shadowRadius;
  const light=mx>jx?limit((Math.abs(my-jy)-shadowRadius+9)/16):1;
  const shadow=grad(jx,jy,690,160,['#100f22','#1a142a','#2a193199']);
  c.fillStyle=shadow;
  c.beginPath();
  c.moveTo(jx,jy-r);
  c.lineTo(W,jy-r*0.91);
  c.lineTo(W,jy+r*0.91);
  c.lineTo(jx,jy+r);
  c.closePath();
  c.fill();
  edge(jx,jy,orbit,orbit*0.81,'#e8b7bf85',2);
  for(const sign of [-1,1]) {
    const height=jy+sign*r;
    line([[109,height],[jx,height],[W,jy+sign*r*0.91]],'#fbc591b8',2);
    const rayX=124+Math.max(0,jx-125)*((t*0.66+sign*0.19+1)%1);
    spark(rayX,height,2.6,peach);
  }
  planet('jupiter',jx,jy,r,t);
  text('Sunlight →',84,177,27,peach);
  text('Jupiter',jx,jy+r+48,23,cream,'center');
  text('Shadow',977,jy+10,31,violet);
  const labelY=Math.min(477,Math.max(125,my+28));
  line([[mx,my],[mx+84,labelY-7]],light>0.5?blade:violet,1.9);
  moon(mx,my,17,light);
  if(light>0.5) lensGlow(mx,my,31,blade,0.46);
  text(behind?'Io in shadow':'Io in sunlight',mx+96,labelY,24);
  const tick=tween(t,8.1,9.68);
  if(tick>0.02) {
    c.globalAlpha=tick;
    if(light > 0.8) fillEllipse(mx,my,5,5,blade);
    text('One reappearance = one tick',846,537,34,blade,'center');
    if(t>11.3) text('≈ 42½ hours to the next tick at Jupiter',846,582,23,cream,'center');
    c.globalAlpha=1;
  }
  small('Shadow and orbit schematic · bodies enlarged');
}

function solarMap(t: number,duration: number) {
  paper(t);
  const cx=465,cy=363,dx=1048,dy=306;
  const a=mix(-0.54,-2.3,tween(t,0.25,duration));
  const near=polar(cx,cy,234,-0.54,0.77),far=polar(cx,cy,234,-2.3,0.77);
  const earth=polar(cx,cy,234,a,0.77);
  edge(cx,cy,234,234*0.77,'#76526f99',2.2);
  line([near,[dx,dy]],'#91638788',2);
  line([far,[dx,dy]],'#91638788',2);
  line([earth,[dx,dy]],moss,3.2);
  planet('sun',cx,cy,72,t);
  planet('jupiter',dx,dy,77,t);
  planet('earth',earth[0],earth[1],31,t);
  text('Earth',earth[0],earth[1]-49,24,ink,'center');
  text('Sun',cx,cy+110,24,ink,'center');
  text('Jupiter & Io',dx,dy+126,26,ink,'center');
  text('Earth changes the length of the journey',72,93,44,ink);
  text('The telescope moves with Earth',73,571,25,ink);
  small('Earth’s orbit and sightlines schematic · distances and sizes exaggerated',ink);
}

function receiver(x: number,y: number,t: number,arrival: number) {
  planet('earth',x+4,y+5,45,t);
  const shine=tween(t,arrival-0.07,arrival+0.27)*(1-tween(t,arrival+0.85,arrival+2.80));
  if(shine>0) lensGlow(x-40,y,95,'#dff66c',shine);
  const angle=-0.32;
  const at=polar(x-21,y-47,22,angle);
  line([[x-18,y-27],[x-20,y-49]],cream,2);
  line([[x-17,y-45],at],cream,6);
  spark(x-39,y,3,shine>0.1?blade:violet);
}
function comparePaths(t: number,duration: number) {
  space(t);
  const x0=254,near=677,far=1143, top=278,bottom=487;
  const start=0.8,speed=93;
  const nearTime=start+(near-x0-43)/speed,farTime=start+(far-x0-43)/speed;
  text('The same tick, two possible journeys',71,90,43);
  for(const [end,y,label,arrival] of [[near,top,'Nearer Earth',nearTime],[far,bottom,'Farther Earth',farTime]] as const) {
    const x=mix(x0,end-40,limit((t-start)*speed/(end-x0-40)));
    const local=limit((t-start)/(arrival-start));
    line([[x0,y],[end-41,y]],'#a594c2a1',2);
    if(local>0) line([[x0,y],[x,y]],grad(x0,y,x-x0,0,['#a295525f','#dff66ced']),3.3);
    if(t>start && local<1) spark(x,y,6);
    planet('jupiter',x0-64,y,47,t);
    moon(x0,y,11);
    receiver(end,y,t,arrival);
    text(label,end-5,y+86,24,cream,'center');
    const signal=t>=arrival?'Tick seen':t<start?'Awaiting the tick':'Signal still traveling';
    text(signal,end+17,y-69,22,t>=arrival?blade:violet,'right');
  }
  line([[x0,top+16],[x0,bottom-16]],'#eac5a07c',1.7);
  text('Io clears the shadow',x0-8,172,24,peach,'center');
  if (t>farTime+0.3) {
    text('Same event. Different arrival times.',662,149,26,blade,'center');
  }
  small('Two illustrative observer positions · light moves at the same speed in both');
}

function accumulate(t: number,duration: number) {
  paper(t);
  const x0=174, x1=1107;
  const latest=limit((t-2.13)/10.4);
  text('A small delay grows across many ticks',72,91,43,ink);
  text('Earlier Earth position',504,191,21,neutral,'center');
  text('Earth moves away →',x1,207,24,ink,'right');
  line([[x0,240],[x1,240]],'#76527592',2);
  planet('jupiter',x0,287,46,t);
  const ex=mix(504,1037,latest);
  planet('earth',ex,240,34,t);
  line([[x0+51,287],[ex-34,240]],moss,2.4);
  for(let i=0;i<8;i++) {
    const traveled=409*(t-0.62-i*1.29);
    const beamLength=Math.hypot(ex-34-x0-51,47);
    if(traveled<=0||traveled>=beamLength) continue;
    const phase=traveled/beamLength;
    spark(mix(x0+51,ex-34,phase),mix(287,240,phase),4);
  }
  const xAxis=278,division=97;
  const expectedY=426,actualY=534;
  const count=8;
  const focus=1+0.17*tween(t,10.1,duration);
  c.save();
  c.translate(970,525);
  c.scale(focus,focus);
  c.translate(-970,-525);
  text('Steady clock',247,expectedY+8,24,neutral,'right');
  text('Seen from Earth',247,actualY+8,24,moss,'right');
  line([[xAxis-9,expectedY],[1164,expectedY]],'#986c946f',1.6);
  line([[xAxis-9,actualY],[1164,actualY]],'#986c946f',1.6);
  for(let i=0;i<count;i++) {
    const q=i/(count-1), expected=xAxis+division*i;
    const offset=4+i*10.1;
    const arrived=tween(latest,q-0.15,q+0.12);
    c.globalAlpha=0.2+0.7*tween(latest,q-0.22,q+0.05);
    line([[expected,expectedY-18],[expected,expectedY+18]],plum,3);
    c.globalAlpha=arrived;
    line([[expected,expectedY+20],[expected+offset,actualY-19]],'#927a9b70',1.8);
    line([[expected+offset,actualY-17],[expected+offset,actualY+17]],moss,4.2);
    c.globalAlpha=1;
  }
  if(t>8.9) {
    c.globalAlpha=tween(t,8.9,11.6);
    const expected=xAxis+division*7;
    line([[expected,588],[expected+75,588]],moss,2.2);
    line([[expected,581],[expected,596]],moss,2.2);
    line([[expected+75,581],[expected+75,596]],moss,2.2);
    text('Built-up delay',expected+75,624,24,moss,'right');
    c.globalAlpha=1;
  }
  c.restore();
  small('Illustrative tick sequence · no reconstructed eclipse timings',ink);
}

const neutral='#654e6e';
function clock(cx: number,cy: number,r: number,minute: number,second: number,t: number) {
  fillEllipse(cx+7,cy+11,r,r,'#7653744d');
  fillEllipse(cx,cy,r,r,grad(cx-r,cy-r,2*r,2*r,['#895268','#eca987','#fee1b3','#7a4866']));
  fillEllipse(cx,cy,r-8,r-8,grad(cx-r,cy-r,2*r,2*r,['#efe0cc','#faeed8','#d7b5bc']));
  edge(cx,cy,r-16,r-16,'#744e6d84',1.7);
  tickRing(cx,cy,r-21,-Math.PI/2,ink);
  for(const h of [12,3,6,9]) {
    const [x,y]=polar(cx,cy,r-53,(h/12)*tau-Math.PI/2);
    text(String(h),x,y+8,24,ink,'center');
  }
  const hourA=(5+minute/60)*tau/12-Math.PI/2;
  const minuteA=(minute+second/60)*tau/60-Math.PI/2;
  const secondsA=second*tau/60-Math.PI/2;
  line([[cx,cy],polar(cx,cy,r*0.45,hourA)],ink,7);
  line([[cx,cy],polar(cx,cy,r*0.67,minuteA)],ink,4.6);
  line([polar(cx,cy,19,secondsA+Math.PI),polar(cx,cy,r*0.76,secondsA)],plum,2.3);
  fillEllipse(cx,cy,8,8,plum);
}

function history(t: number,duration: number) {
  paper(t);
  const settle=tween(t,0.23,3.65);
  const plus=tween(t,7.1,9.2);
  const revisit=tween(t,10.1,duration-0.25);
  const r=mix(144,116,revisit);
  const cx=mix(mix(665,428,settle),313,revisit),cy=mix(373,400,revisit);
  const minute=mix(21,35,settle);
  clock(cx,cy,r,minute,45,t);
  const arc=tween(t,4.2,9.0);
  if(arc>0) {
    const from=(25.75/60)*tau-Math.PI/2;
    const to=(35.75/60)*tau-Math.PI/2;
    line(path(u=>polar(cx,cy,r*0.77,mix(from,to,u*arc)),46),moss,4.5);
    const edge=polar(cx,cy,r*0.77,mix(from,to,arc));
    fillEllipse(...edge,4,4,moss);
  }
  text('November 9, 1676',72,101,48,ink);
  text('Paris Observatory',75,147,25,plum);
  const show=tween(t,2.25,4.94);
  c.globalAlpha=show;
  text('5:35:45 p.m.',cx,569,45,ink,'center');
  c.globalAlpha=1;
  planet('jupiter',990,373,mix(138,173,tween(t,7.3,duration)),t);
  const here=polar(990,373,191,mix(-2.3,-1.43,tween(t,1.4,duration)),0.67);
  moon(...here,13,1);
  lensGlow(...here,37,blade,0.81);
  c.globalAlpha=plus;
  text('≈ 10 min later',907,603,40,moss,'center');
  c.globalAlpha=1;
  if(revisit>0) {
    c.globalAlpha=tween(t,10.1,11.3);
    const endpoint: XY=[cx+r+25,cy-30];
    line([here,endpoint],'#59446c7e',2.2);
    const v=limit((t-10.4)/3.1);
    spark(mix(here[0],endpoint[0],v),mix(here[1],endpoint[1],v),4.2,moss);
    c.globalAlpha=1;
  }
  small('Recorded in the 1676 report · clock face is an illustration',ink);
}
function credits(t: number,duration: number) {
  space(t);
  const x=mix(914,1039,tween(t,0,duration)), y=370;
  planet('jupiter',x,y,205,t);
  const orb=polar(x,y,249,-1.1+Math.PI*t/duration,0.53);
  moon(...orb,9);
  spark(...orb,3);
  text('The Moon That Ran Late',72,196,47);
  text('Eclipse record · Philosophical Transactions, 1677',74,290,24);
  text('Io orbital context · NASA',74,338,24);
  text('Planet maps · Solar System Scope · CC BY 4.0',74,386,24);
  text('Mysteries of the Sky',74,503,22,violet);
}

const scenes: Record<string,Scene> = {
  cover, thumbnail:(t,d)=>cover(t,d,true),
  shadow:shadowScene, map:solarMap, compare:comparePaths, accumulate, history, credits,
};
const centers: Record<string,XY> = {
  shadow:[798,307], map:[634,223], compare:[202,379], accumulate:[658,242], history:[665,373], credits:[990,373],
};
Object.assign(window,{
  ioClockFrame(key: string,t: number,cue?: {duration?: number;prev?: string;prevT?: number},mime='image/jpeg') {
    const draw=scenes[key];
    if(!draw) throw new Error('Unknown Io clock scene: '+key);
    const duration=cue?.duration??11;
    const previous=cue?.prev&&scenes[cue.prev];
    const center=centers[key];
    c.save();
    if(previous && cue.prevT && center && t<0.51) {
      previous(cue.prevT+t,cue.prevT);
      c.beginPath();
      c.arc(...center,1640*tween(t,0,0.51),0,tau);
      c.clip();
    }
    draw(t,duration);
    c.restore();
    return canvas.toDataURL(mime,0.95).split(',')[1];
  },
});
