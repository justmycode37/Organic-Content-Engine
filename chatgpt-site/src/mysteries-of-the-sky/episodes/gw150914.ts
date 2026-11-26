import { drawPlanet, preparePlanets, smooth, tau } from '../index.ts';
import { c, canvas, grad, lime, lensGlow, line, plate, words, W, H } from './stage.ts';
import strain from './gw150914-strain.json';

Object.assign(window, { motionAssetsReady: preparePlanets(['earth']) });

type XY = [number, number];
type Scene = (progress: number, seconds: number, duration: number) => void;
const ink = '#261d35', cream = '#ffecd6', rose = '#f3aaa8', lilac = '#c1baf5', moss = '#486200';
const hColor = '#874568', lColor = '#484782', neutral = '#796887';
const timingOffset = 0.0069;
const start = 0.25, end = 0.46;
const mix = (a: number, b: number, f: number) => a + (b - a) * f;
const ramp = (p: number, a: number, b: number) => smooth((p - a) / (b - a));
const points = (fn: (u: number) => XY, n = 120) => Array.from({length: n + 1}, (_, i) => fn(i / n));
const text = (s: string, x: number, y: number, size = 24, color = cream, align: CanvasTextAlign = 'left') =>
  words(s, x, y, size, 'sans', color, align);
const note = (s: string, color = cream) => text(s, 72, 668, 18, color);

const grain = document.createElement('canvas');
grain.width = W;
grain.height = H;
const noise = grain.getContext('2d')!;
const pixels = noise.createImageData(W, H);
let seed = 914;
for (let i = 0; i < pixels.data.length; i += 4) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  const value = seed >>> 31 ? 255 : 0;
  pixels.data.set([value, value, value, (seed >>> 16) & 31], i);
}
noise.putImageData(pixels, 0, 0);

function paper(t: number) {
  c.fillStyle = grad(0, 0, W, H, ['#f1dfc4', '#e8c2c1', '#b6b1d3']);
  c.fillRect(0, 0, W, H);
  c.drawImage(grain, 0, 0);
  c.globalAlpha = 0.21;
  const drift = (t * 4) % 24;
  for (let x = -24 + drift; x < W; x += 24) line([[x, 0], [x, H]], '#67577a70', 1);
  for (let y = 0; y < H; y += 24) line([[0, y], [W, y]], '#67577a70', 1);
  c.globalAlpha = 1;
}
function sky(t: number) {
  c.fillStyle = '#100e1c';
  c.fillRect(0, 0, W, H);
  c.drawImage(plate, -42 + 31 * Math.sin(t * 0.1), -21, W + 84, H + 42);
}
function pill(x: number, y: number, w: number, h: number, color: string | CanvasGradient, radius = 10) {
  c.fillStyle = color;
  c.beginPath();
  c.roundRect(x, y, w, h, radius);
  c.fill();
}
function ellipse(x: number, y: number, rx: number, ry: number, color: string | CanvasGradient, angle = 0) {
  c.fillStyle = color;
  c.beginPath();
  c.ellipse(x, y, rx, ry, angle, 0, tau);
  c.fill();
}
function marker(x: number, y: number, color = '#ddf65e', radius = 5) {
  lensGlow(x, y, 6 * radius, color, 0.77);
  ellipse(x, y, radius, radius, color);
}
function clip(x: number, y: number, w: number, h: number, draw: () => void) {
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  draw();
  c.restore();
}
function trace(key: keyof typeof strain, x: number, y: number, w: number, h: number, color: string,
  cut = 1, shift = 0, sign = 1, weight = 3) {
  const visible = strain[key].filter(([t]) => t + shift <= mix(start, end, cut));
  const plot = visible.map(([t, a]) => [x + w * (t + shift - start) / (end - start), y - h * a * sign]);
  if (plot.length > 1) line(plot, color, weight);
  return plot.at(-1) as XY | undefined;
}
function earth(x: number, y: number, r: number, t: number) {
  drawPlanet(c, {body: 'earth', center: [x, y], radius: r, longitude: -1.62 + t * 0.007,
    latitude: 0.53, roll: 0.09, light: [-0.42, 0.3, 0.86]});
}

function cover(p: number, t: number, thumbnail = false) {
  paper(t);
  const zoom = 1 + 0.31 * ramp(p, 0.46, 1);
  const titleAlpha = thumbnail ? 1 : 1 - ramp(p, 0.34, 0.61);
  c.save();
  c.translate(785, 368);
  c.scale(zoom, zoom);
  const folds = [[55, -341], [495, -263], [471, 220], [281, 318], [-80, 272], [-202, 51], [-183, -177]];
  c.beginPath();
  for (const [i, [x, y]] of folds.entries()) i ? c.lineTo(x, y) : c.moveTo(x,y);
  c.closePath();
  c.fillStyle = grad(-180, -300, 687, 650, ['#321f40', '#674965', '#142039']);
  c.fill();
  c.save();
  c.clip();
  earth(182, -41, 266, t);
  c.drawImage(grain, -500, -330, W, H);
  c.restore();
  line([[-246,105],[-173,85],[-80,121],[471,121]], '#4f2b59', 6);
  pill(-153, 110, 638, 159, grad(-160,100,630,220,['#22223c','#563952','#221933']), 5);
  const revealed = thumbnail ? 1 : 0.14 + 0.86 * ramp(p, 0.02, 0.76);
  const tip = trace('livingston', -126, 183, 582, 55, lime, revealed, 0, 1, 4);
  if (tip) marker(...tip);
  c.restore();
  c.save();
  c.globalAlpha = titleAlpha;
  text('The Chirp', 70, 164, 80, ink);
  text('That Crossed', 70, 250, 80, ink);
  text('Earth', 70, 337, 80, ink);
  text('Mysteries of the Sky', 75, 409, 24, hColor);
  if (!thumbnail) note('Livingston strain · published data', ink);
  c.restore();
}

function sites(p: number, t: number) {
  sky(t);
  const ex = mix(489, 407, p), ey = 381, r = mix(242,252,p);
  earth(ex, ey, r, t);
  const hanford: XY = [ex - 0.31 * r, ey - 0.27 * r];
  const livingston: XY = [ex + 0.045 * r, ey - 0.023 * r];
  const phase = ramp(p, 0.1, 0.52);
  line([livingston, [719, 274]], lime, 2);
  marker(...livingston, lime);
  text('Livingston, Louisiana', 742, 230, 31);
  trace('livingston', 745, 281, 462, 29, lime, 0.5 + 0.5 * p);
  c.globalAlpha = phase;
  line([hanford, [675, 441], [719, 441]], rose, 2);
  marker(...hanford, rose);
  text('Hanford, Washington', 742, 390, 31);
  trace('hanford', 745, 445, 462, 29, rose, mix(0.3, 1, p));
  c.globalAlpha = 1;
  text('One event, two sites', 71, 92, 42);
  note('LIGO locations and published strain · magnified for comparison');
}

function distances(p: number, t: number) {
  paper(t);
  const cx = 528, cy = 367;
  const phase = tau * (p * 2.25 + p * p * 0.52);
  const change = Math.sin(phase) * ramp(p, 0.06, 0.2);
  const rx = 173 * (1 + change * 0.23), ry = 173 * (1 - change * 0.23);
  const circle = points((u) => [cx + 173 * Math.cos(tau * u), cy + 173 * Math.sin(tau * u)]);
  c.save();
  c.setLineDash([6, 7]);
  line(circle, '#7651738a', 2);
  c.restore();
  const r = mix(60, 240, (t * 0.44) % 1);
  const wave = points((u) => [cx + r * Math.cos(tau * u), cy + r * Math.sin(tau * u)]);
  c.globalAlpha = Math.sin(Math.PI * ((t * 0.44) % 1)) * 0.42;
  line(wave, lColor, 2.6);
  c.globalAlpha = 1;
  line(points((u) => [cx + rx * Math.cos(tau * u), cy + ry * Math.sin(tau * u)]), hColor, 3);
  line([[cx - rx, cy],[cx + rx, cy]], moss, 4);
  line([[cx, cy - ry],[cx, cy + ry]], lColor, 4);
  for (const [x,y] of [[cx-rx,cy],[cx+rx,cy],[cx,cy-ry],[cx,cy+ry]]) marker(x,y,'#4f375e',8);
  text('Two directions, one wave', 72, 91, 47, ink);
  text(change >= 0 ? 'Horizontal lengthens' : 'Horizontal shortens', 830, 305, 28, moss);
  text(change >= 0 ? 'Vertical shortens' : 'Vertical lengthens', 830, 378, 28, lColor);
  text('The pattern reverses', 830, 466, 24, ink);
  text('every half cycle', 830, 501, 24, ink);
  note('Distance changes exaggerated · looking along the wave’s direction', ink);
}

function lightPath(from: XY, to: XY, color: string, seconds: number, returning: boolean) {
  line([from, to], color + '56', 5);
  const travel = (seconds * 0.65) % 1;
  const packet = returning ? 1 - travel : travel;
  if (packet < 0.01 || packet > 0.99) return;
  marker(mix(from[0],to[0],packet), mix(from[1],to[1],packet),color,5);
}
function optics(p: number, t: number) {
  c.fillStyle = grad(0, 0, W, H, ['#131725','#3d2d48','#55384c','#19182b']);
  c.fillRect(0,0,W,H);
  c.drawImage(grain,0,0);
  const split: XY = [469,466], laser: XY = [116,466], photodiode: XY = [469,609];
  const showArms = ramp(p, 0.05, 0.24);
  const showReturn = ramp(p, 0.25, 0.39);
  const showDisturbance = ramp(p, 0.60, 0.76);
  const wave = Math.sin(t * 2.3) * showDisturbance;
  const intensity = 0.10 + 0.90 * Math.sin(wave * 1.35) ** 2;
  const right: XY = [856 + 36 * wave,466], up: XY = [469,118 + 36 * wave];
  text(p > 0.64 ? 'One arm grows as the other shrinks' : 'LIGO splits one laser beam', 72, 83, 42);
  lightPath(laser,split,cream,t,false);
  pill(laser[0]-22,laser[1]-19,44,38,'#695070');
  text('Laser', 109, 516, 23);
  c.globalAlpha = showArms;
  lightPath(split,right,rose,t,false);
  lightPath(split,up,lilac,t,false);
  pill(right[0],right[1]-27,11,54,rose,3);
  pill(up[0]-27,up[1]-11,54,11,lilac,3);
  text('4 km', 608, 427, 24, rose);
  text('4 km', 406, 234, 24, lilac, 'right');
  text('Mirrors', 541, 134, 23);
  c.globalAlpha = showReturn;
  lightPath(split,right,rose,t+0.28,true);
  lightPath(split,up,lilac,t+0.28+wave*0.17,true);
  lightPath(split,photodiode,cream,t+0.47,false);
  marker(...photodiode, lime, 4 + 7 * intensity);
  text('Light detector', 446, 615, 23, cream, 'right');
  c.globalAlpha = ramp(p, 0.41, 0.58);
  const chartX = 886, chartW = 287;
  text('Returning light', chartX, 204, 28);
  for (const [index,color] of [rose,lilac].entries()) {
    const y = 260 + 55 * index;
    line(points((u) => [chartX + chartW * u,y + 15 * Math.sin(u * tau * 3 - t * 4 + index * wave * 1.75)]),color,2.5);
  }
  text('Different path lengths',chartX, 391, 22);
  text('shift the crests',chartX, 420, 22);
  c.globalAlpha = ramp(p, 0.74, 0.90);
  pill(chartX,545,287,12,'#1b1629',5);
  pill(chartX,545,287*intensity,12,grad(chartX,545,287,12,['#adbb69',lime]),5);
  text('Light at the detector',chartX,523,24);
  c.globalAlpha = 1;
  c.save();
  c.translate(...split);
  c.rotate(-Math.PI/4);
  pill(-6,-24,12,48,'#e5d7ed',4);
  c.restore();
  text('Beam splitter', 501, 515, 23);
  note('Simplified interferometer · mirror motion and beam paths exaggerated');
}

function plot(p: number, t: number, duration: number) {
  paper(t);
  const x = 247, y = mix(470,395,ramp(p,0.42,0.8)), w = 900, top = 268;
  const align = ramp(p, 0.40, 0.50);
  const flip = ramp(p, 0.50, 0.65);
  const reveal = 0.20 + 0.80 * ramp(p, 0, 0.23);
  const merge = ramp(p, 0.71, 0.87);
  const upper = mix(top,y,merge);
  text('The chirp reaches Livingston first',72, 86, 45,ink);
  const sign = align > 0.95 ? '−6.9 ms' : '6.9 ms later';
  const flipLabel = flip > 0.94 ? ' · sign inverted' : '';
  text(align > 0.02 ? 'Hanford adjustment  ' + sign + flipLabel : 'Common clock · September 14, 2015',75,130,22,neutral);
  text('Hanford',226,upper-15,24,hColor,'right');
  text('Livingston',226,y + (merge > 0.5 ? 29 : -15),24,lColor,'right');
  for (const [i,tick] of [0.25,0.30,0.35,0.40,0.45].entries()) {
    const xx = x + w * (tick - start)/(end - start);
    line([[xx,162],[xx,544]], i === 3 ? '#ab7997a1' : '#8d71835c', i === 3 ? 1.8 : 1);
    text(tick.toFixed(2),xx,580,19,ink,'center');
  }
  for (const yy of [upper,y]) line([[x,yy],[x+w,yy]],'#6c59717a',1.2);
  for (const yy of (merge > 0.2 ? [y] : [upper,y])) {
    for (const tick of [-1,0,1]) {
      const at = yy - tick*80;
      line([[x,at],[x+8,at]],'#705874',1.4);
      if (tick) text(tick < 0 ? '−1' : '+1',x-12,at+5,16,neutral,'right');
    }
  }
  clip(x,162,w,383,() => {
    trace('livingston',x,y,w,80,lColor,reveal,0,1,3.4);
    trace('hanford',x,upper,w,80,hColor,reveal,-timingOffset*align,1-2*flip,3.1);
  });
  text('Seconds after 09:50:45 UTC',x + w/2,621,21,ink,'center');
  text('Strain',226,173,19,ink,'right');
  text('× 10⁻²¹',226,194,19,ink,'right');
  const arrival = ramp(p,0.22,0.31) * (1-ramp(p,0.38,0.43));
  if (arrival > 0) {
    const lx = x+w*(0.42-start)/(end-start);
    const hx = lx+w*timingOffset/(end-start);
    c.globalAlpha = arrival;
    line([[lx,y-78],[lx,y+82]],lColor,2);
    line([[hx,upper-78],[hx,upper+82]],hColor,2);
    line([[lx,348],[hx,348]],moss,2);
    text('6.9 ms',lx-7,354,21,moss,'right');
    c.globalAlpha=1;
  }
  if (merge > 0.9) {
    const region = x + w * (0.417 - start)/(end - start);
    line([[region,172],[region,518]],moss,2);
    text('Near the strongest peak',region-14,186,21,moss,'right');
  }
  note('Published LIGO strain · 35–350 Hz band-pass and instrumental line filtering',ink);
}

function blackHole(x: number,y: number,r: number,t: number) {
  for (let i=0; i<5; i++) {
    const blur = r * (1.17 + i * 0.13);
    c.globalAlpha = (0.42 - i * 0.064);
    line(points((u)=>[x + blur * Math.cos(tau*u), y + blur * Math.sin(tau*u)], 82),
      grad(x-r,y-r,2*r,2*r,['#dfacbd','#7971c2','#171523']),1.6);
  }
  c.globalAlpha=1;
  ellipse(x,y,r,r,'#090813');
  const hilite = r * (1.16 + 0.03*Math.sin(t*2));
  line(points(u=>[x+hilite*Math.cos(tau*(0.50+u*0.35)),y+hilite*Math.sin(tau*(0.50+u*0.35))],48),
    grad(x-r,y-r,r*2,r,['#8369a0','#e6b9d9']),2.5);
}
function binary(p: number,t: number) {
  sky(t);
  const cx=716,cy=330, pull=ramp(p,0.02,0.58);
  const radius=mix(274,22,pull), angle=-1 + 11*p + 19*p**3;
  for (let i=0;i<10;i++) {
    const wavelength=mix(52,25,pull);
    const r=85+i*wavelength + (t*23)%wavelength + 140*ramp(p,0.55,0.93);
    c.globalAlpha=Math.max(0,0.64*(1-r/570))*ramp(p,0.02,0.26)*(1-0.77*ramp(p,0.58,0.95));
    line(points(u=>{
      const a=u*tau;
      const w=r+15*Math.sin(2*a-angle+i*0.45);
      return [cx+w*Math.cos(a),cy+0.65*w*Math.sin(a)];
    }),i%2 ? lilac : rose,1.8);
  }
  c.globalAlpha=1;
  const merged=ramp(p,0.50,0.60);
  c.globalAlpha=1-merged;
  blackHole(cx+radius*Math.cos(angle),cy+0.68*radius*Math.sin(angle),53,t);
  blackHole(cx-radius*Math.cos(angle),cy-0.68*radius*Math.sin(angle),45,t);
  c.globalAlpha=1;
  if (merged>0.02) blackHole(cx,cy,merged*75,t);
  text(p < 0.55 ? 'As the orbit tightens, the waves crowd together' : 'The merged black hole settles',72,94,40);
  pill(376,525,776,108,grad(380,521,705,110,['#1b172b','#442b48']),11);
  const cursor=mix(0.17,0.82,Math.min(1,p/0.55))+0.18*ramp(p,0.55,0.82);
  trace('model',411,577,694,43,lime,cursor,0,1,2.6);
  const xx=411+694*cursor;
  line([[xx,535],[xx,616]],'#e1f76f82',1.4);
  note('Illustrative orbit · published numerical waveform projected onto Hanford');
}

function recording(p: number,t: number,duration: number) {
  sky(t);
  earth(mix(948,994,p),367,mix(322,259,p),t);
  pill(72,210,730,315,grad(78,217,712,321,['#1a172c','#442e47','#2a2140']),12);
  text('The chirp that crossed Earth',82, 123, 45);
  text('Livingston · GW150914',109,276,30);
  line([[109,399],[766,399]],'#93869c8b',1.3);
  trace('livingston',113,399,650,82,lime,1,0,1,3);
  const secondsToEnd=duration-t;
  const listen=smooth((3.0-secondsToEnd)*2);
  c.globalAlpha=listen;
  text('Listen to the measurement',113,490,25,lime);
  if (secondsToEnd<2.6) {
    const q=Math.max(0,Math.min(1,(2.6-secondsToEnd-0.45)/0.21));
    const xx=113+650*q;
    line([[xx,306],[xx,460]],lime,2.2);
  }
  c.globalAlpha=1;
  note('Whitened and band-passed strain · frequency shifted upward for audibility');
}
function credits(p: number,t: number) {
  paper(t);
  earth(1004,378,mix(184,173,p),t);
  text('The Chirp That Crossed Earth',73,190,48,ink);
  text('GW150914 data & audio · GWOSC · CC BY 4.0',76,306,24,ink);
  text('Observation · LIGO Scientific Collaboration and Virgo',76,352,23,ink);
  text('Earth maps · Solar System Scope · CC BY 4.0',76,399,23,ink);
  text('Mysteries of the Sky',76,496,22,hColor);
  trace('livingston',76,568,595,37,moss,Math.min(1,0.04+p*1.5),0,1,2.5);
}

const scenes: Record<string,Scene> = {
  cover: (p,t)=>cover(p,t), thumbnail: (_p,t)=>cover(0.22,t,true),
  sites, distances, optics, plot, binary, recording, credits,
};
Object.assign(window,{
  gw150914Frame(key: string,t: number,cue?: {duration?: number},mime = 'image/jpeg') {
    const scene=scenes[key];
    if (!scene) throw new Error('Unknown GW150914 scene: '+key);
    const duration=cue?.duration ?? 10;
    c.save();
    scene(Math.max(0,Math.min(1,t/duration)),t,duration);
    c.restore();
    return canvas.toDataURL(mime,0.95).split(',')[1];
  },
});
