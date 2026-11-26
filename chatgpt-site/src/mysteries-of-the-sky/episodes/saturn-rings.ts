import { drawPlanet, preparePlanets, smooth, tau } from '../index.ts';
import { c, canvas, grad, ice, lensGlow, lime, line, pink, plate, words, W, H } from './stage.ts';
import watchSpiralUrl from './saturn-watch-spiral.jpg';

const photo = new Image();
photo.src = watchSpiralUrl;
Object.assign(window, { motionAssetsReady: Promise.all([photo.decode(), preparePlanets(['saturn'])]) });

type XY = [number, number];
type Scene = (p: number, t: number) => void;
const paper = '#f2dec6', ink = '#30263c', plum = '#6d4968', cream = '#fff0d8', moss = '#526612';
const mix = (a: number, b: number, p: number) => a + (b - a) * p;
const section = (p: number, a: number, b: number) => smooth((p - a) / (b - a));
const path = (fn: (v: number) => XY, steps = 150) => Array.from({length: steps + 1}, (_, i) => fn(i / steps));
const polar = (cx: number, cy: number, r: number, a: number, squash = 1): XY =>
  [cx + r * Math.cos(a), cy + squash * r * Math.sin(a)];
const text = (s: string, x: number, y: number, size = 24, color = cream, align: CanvasTextAlign = 'left') =>
  words(s, x, y, size, 'sans', color, align);
const subtitle = (s: string, color = cream) => text(s, 72, 670, 18, color);

let seed = 2014;
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
}
const flakes = Array.from({length: 640}, () => [random(), random(), random()]);
const grain = document.createElement('canvas');
grain.width = W;
grain.height = H;
const noise = grain.getContext('2d')!;
const pixels = noise.createImageData(W, H);
for (let i = 0; i < pixels.data.length; i += 4) {
  const gray = random() > 0.5 ? 255 : 0;
  pixels.data.set([gray, gray, gray, random() * 24], i);
}
noise.putImageData(pixels, 0, 0);

function space(t: number) {
  c.fillStyle = '#0d0b18';
  c.fillRect(0, 0, W, H);
  c.drawImage(plate, -20 + 16 * Math.sin(t * 0.12), -20, W + 40, H + 40);
}
function sheet(cool = false) {
  c.fillStyle = grad(0, 0, W, H, cool ? ['#eadede', '#d4c3dd', '#b7b1ce'] : [paper, '#e9bbc1', '#bfaac8']);
  c.fillRect(0, 0, W, H);
  c.drawImage(grain, 0, 0);
}
function speck(x: number, y: number, r: number, color: string) {
  c.fillStyle = color;
  c.beginPath();
  c.arc(x, y, r, 0, tau);
  c.fill();
}
function disc(x: number, y: number, rx: number, ry: number, fill: CanvasGradient | string, turn = 0) {
  c.fillStyle = fill;
  c.beginPath();
  c.ellipse(x, y, rx, ry, turn, 0, tau);
  c.fill();
}
function glowPoint(x: number, y: number, color: string = lime, r = 4) {
  lensGlow(x, y, r * 6, color, 0.75);
  speck(x, y, r, color);
}
function planet(x: number, y: number, radius: number, t: number, latitude = 0.43, roll = -0.28, rings = true) {
  drawPlanet(c, {body: 'saturn', center: [x, y], radius, longitude: 0.12 + t * 0.024,
    latitude, roll, rings, light: [-0.64, 0.35, 0.69]});
}

function artwork(t: number, p: number, thumbnail = false) {
  sheet();
  c.save();
  c.translate(746, 386);
  const scale = thumbnail ? 1 : mix(1.02, 1.21, section(p, 0.45, 1));
  c.scale(scale, scale);
  c.rotate(-0.26 + 0.03 * Math.sin(t * 0.45));
  disc(15, 26, 476, 249, '#432b424f');
  disc(0, 0, 475, 243, grad(-420, -260, 870, 430, ['#191526', '#5d395d', '#272039', '#160f25']));
  for (let i = 0; i < 55; i++) {
    const r = 74 + 7.2 * i;
    const skew = mix(0.53, 0.50, i / 55);
    c.beginPath();
    c.ellipse(0, 0, r, r * skew, 0, 0, tau);
    c.strokeStyle = i % 7 === 0 ? '#e2aec088' : '#c692ba43';
    c.lineWidth = i % 7 === 0 ? 2 : 1;
    c.stroke();
  }
  c.save();
  c.rotate(0.26);
  planet(0, 0, 159, t, 0.54, -0.23, true);
  c.restore();
  const pin = polar(0, 0, 399, mix(-0.56, 0.19, section(p, 0.02, 0.68)), 0.51);
  const [sx, sy] = pin;
  c.fillStyle = grad(sx, sy - 240, 400, 230, ['#625264', '#fbe3bd', '#ac737f', '#e6b8a4']);
  c.beginPath();
  c.moveTo(sx + 114, sy - 395);
  c.lineTo(sx + 161, sy - 381);
  c.lineTo(sx + 119, sy - 113);
  c.lineTo(sx + 21, sy - 21);
  c.lineTo(sx + 3, sy - 8);
  c.lineTo(sx - 15, sy - 29);
  c.lineTo(sx + 91, sy - 148);
  c.closePath();
  c.fill();
  line([[sx - 3, sy - 12], pin], '#302238', 3);
  c.globalAlpha = thumbnail ? 1 : section(p, 0.26, 0.52);
  glowPoint(sx, sy, lime, 7);
  line(path((u) => polar(0, 0, 399, mix(-0.72, 0.5, u), 0.51), 84), lime, 2);
  c.restore();
  c.save();
  c.globalAlpha = thumbnail ? 1 : 1 - section(p, 0.63, 0.94);
  text('How Saturn’s', 82, 165, 66, ink);
  text('Rings Heard', 82, 236, 66, ink);
  text('Its Core', 82, 308, 66, ink);
  text('Mysteries of the Sky', 87, 373, 21, plum);
  if (!thumbnail) subtitle('Record and stylus · visual analogy', ink);
  c.restore();
}

function guide(t: number, source = 'C ring') {
  space(t);
  const right = mix(980, 1050, section(t, 0, 9));
  const cy = 512;
  c.save();
  c.translate(right, cy);
  c.rotate(-0.27);
  planet(-840, -286, 451, t, 0.76, 0.17);
  c.restore();
  const y = mix(390, 338, section(t, 0, 10));
  line([[715, y + 54], [949, y - 11], [1107, y - 11]], lime, 2.3);
  glowPoint(715, y + 54, lime, 5);
  text(source, 1108, y - 24, 30, cream, 'right');
  text('A narrow strip of ice', 865, 140, 38, cream, 'center');
  subtitle('Localized region indicated schematically');
}

function scans(p: number, t: number, repeat: boolean) {
  sheet(true);
  const left = 237, right = 1090, top = 132;
  const phase = repeat ? 0.90 : 0;
  const scan = mix(0.06, 1, section(p, 0.02, 0.84));
  const graph = (u: number, ph: number) => 444 + 51 * (0.54 + 0.44 * Math.cos(31 * u + 18 * u * u + ph));
  text(repeat ? 'The spiral turns between scans' : 'Cassini tracks one star', 72, 83, 42, ink);
  c.save();
  c.beginPath();
  c.rect(left, top, right - left, 173);
  c.clip();
  c.fillStyle = grad(left, 0, right - left, 180, ['#2f2240', '#986878', '#3f365c']);
  c.fillRect(left, top, right - left, 173);
  for (let i = 0; i < 80; i++) {
    const u = i / 80;
    const opacity = 0.1 + 0.16 * (0.5 + 0.48 * Math.cos(31 * u + 18 * u * u + phase));
    c.globalAlpha = opacity;
    line(path((q) => [mix(left, right, u) - 102 * (q - 0.53) + 18 * (q - 0.53) ** 2, top + 192 * q], 20), '#ffddbe', 10);
  }
  c.globalAlpha = 1;
  c.restore();
  const x = mix(left, right, scan);
  const brightness = 0.27 + 0.73 * (500 - graph(scan, phase)) / 56;
  line([[x, 116], [x, 544]], moss, 2);
  glowPoint(x, 233, lime, 4 + 3 * brightness);
  text('Light reaching Cassini', left, 371, 24, ink);
  line([[left, 412], [left, 536], [right, 536]], '#6a5877', 1.5);
  if (repeat) line(path((u) => [mix(left, right, u), graph(u, 0)]), '#714769', 3);
  line(path((u) => [mix(left, right, u * scan), graph(u * scan, phase)]), moss, 4);
  speck(x, graph(scan, phase), 5, moss);
  text('Across the rings →', right, 579, 23, ink, 'right');
  subtitle(repeat ? 'Two illustrative scans · their phase difference constrains pattern speed' : 'Illustrative scan · more material lets less light through', ink);
}

function tugs(p: number, t: number) {
  space(t);
  const cx = 600, cy = 391;
  const widen = section(p, 0.37, 0.85);
  const orbit = 184 + 131 * widen;
  planet(cx, cy, 104 - 13 * widen, t, 0.91, 0.07, false);
  const spin = t * 0.88;
  const angleMoon = -0.9 + 0.6 * t;
  for (const [u, v, r] of flakes) {
    const radius = mix(orbit - 34, orbit + 60, v);
    const initial = u * tau + spin * (1.01 - 0.12 * v);
    const ripple = Math.sin(2 * (initial - angleMoon) + radius * 0.044);
    const [x, y] = polar(cx, cy, radius + 9 * widen * ripple, initial + 0.22 * widen * ripple, 0.65);
    c.globalAlpha = (0.24 + 0.66 * r) * (0.38 + 0.62 * widen);
    speck(x, y, 0.6 + 2.0 * r * r, r > 0.7 ? pink : ice);
  }
  c.globalAlpha = 1;
  const moon = polar(cx, cy, 405, angleMoon, 0.64);
  const grain = polar(cx, cy, orbit, -0.9 + spin, 0.65);
  c.globalAlpha = (1 - Math.min(1, 0.7 * widen)) * Math.pow(0.5 + 0.5 * Math.cos((t - 0.2) * 2.3), 8);
  line([moon, grain], lime, 2.1);
  c.globalAlpha = 1;
  glowPoint(...grain, lime, 5);
  speck(...moon, 13, '#c1a4a8');
  text('Moon', moon[0] + (moon[0] < 610 ? -24 : 24), moon[1] + 6, 20, cream, moon[0] < 610 ? 'right' : 'left');
  text(widen > 0.45 ? 'The pattern and the ice move differently' : 'A recurring gravitational tug', 72, 87, 36);
  subtitle('Orbital resonance · schematic view');
}

function evidence(p: number, t: number) {
  sheet();
  const x = 505 - 15 * p, y = 47, size = 603;
  c.save();
  c.beginPath();
  c.rect(x, y, size, size);
  c.clip();
  const push = 1 + 0.13 * section(p, 0, 1);
  c.drawImage(photo, x - size * (push - 1) / 2, y - size * (push - 1) / 2, size * push, size * push);
  c.restore();
  text('A moon-driven', 67, 188, 47, ink);
  text('spiral', 67, 245, 47, ink);
  text('Cassini image of the A ring', 69, 312, 24, ink);
  text('NASA / JPL / Space Science Institute', x, 677, 17, ink);
  const reveal = section(p, 0.38, 0.82);
  c.globalAlpha = reveal;
  line([[418, 431], [x + 150 * push, 431], [x + 215 * push, 368]], moss, 2);
  text('Closely spaced bands', 67, 437, 25, moss);
  c.globalAlpha = 1;
}

function mystery(p: number, t: number) {
  space(t);
  const x = 378, y = 380, r = 127 + 19 * p;
  planet(x, y, r, t, 0.54, -0.23);
  const observed: XY = [x + 1.38 * r, y - 0.23 * r];
  glowPoint(...observed, lime, 6);
  line([observed, [733, 232], [1130, 232]], lime, 2);
  text('Inner C ring', 736, 204, 30);
  text('A wave without a matching', 736, 355, 33);
  text('known moon resonance', 736, 398, 33);
  const draw = section(p, 0.12, 0.86);
  line(path((v) => [736 + 387 * v * draw, 498 + 26 * Math.sin(27 * v * draw + 10 * v ** 2 * draw)]),
    grad(736, 498, 387, 0, [pink, ice, lime]), 3);
  subtitle('Ring location and wave shape illustrated');
}

function mode(p: number, t: number) {
  space(t);
  const cx = 655, cy = 390, radius = 158;
  const drift = t * 0.65;
  planet(cx, cy, radius, t, 0.32, -0.1, false);
  for (let i = 0; i < 10; i++) {
    const r = radius + 18 + i * (9 + 4 * p);
    const wave = path((u) => {
      const theta = u * tau;
      return polar(cx, cy, r + (17 - i) * Math.cos(theta * 2 - drift), theta, 0.87);
    });
    line(wave, i % 4 ? '#bb94cf53' : '#f8c8aeaf', i % 4 ? 1.3 : 2.1);
  }
  for (const a of [drift / 2, drift / 2 + Math.PI]) {
    const hot = polar(cx, cy, radius + 23, a, 0.87);
    glowPoint(...hot, pink, 5);
  }
  const shoot = polar(cx, cy, 396, -0.29, 0.8);
  const cue = 0.5 + 0.5 * Math.cos(-0.58 - drift);
  glowPoint(...shoot, lime, 4 + cue * 4);
  line([[shoot[0] - 31 - cue * 57, shoot[1]], shoot], lime, 2);
  text('A rhythm from inside Saturn', 75, 93, 42);
  subtitle('Planetary oscillation and gravitational variation · exaggerated');
}

function interiorDisk(x: number, y: number, r: number, diffuse: number) {
  const core = c.createRadialGradient(x - r * 0.15, y + r * 0.1, 0, x, y, r);
  const edge = mix(0.32, 0.82, diffuse);
  core.addColorStop(0, '#45273f');
  core.addColorStop(edge * (0.96 - 0.73 * diffuse), '#78526b');
  core.addColorStop(edge, '#c49396');
  core.addColorStop(1, '#f6d8ae');
  disc(x, y, r, r, core);
  for (let i = 1; i <= 12; i++) {
    const size = (r * i) / 13;
    line(path((u) => polar(x, y, size, Math.PI + u * Math.PI), 45), '#492c4260', 1);
  }
}

function parcel(p: number, t: number) {
  sheet(true);
  const cx = mix(640, 460, section(p, 0, 0.36)), cy = 373, r = mix(184, 239, section(p, 0, 0.36));
  interiorDisk(cx, cy, r, 1);
  const bottom = 485, dx = cx + r * 0.11;
  const drag = 91 * Math.sin(t * 2.05) * Math.exp(-0.07 * t);
  const y = bottom - 157 - drag;
  line([[cx - r * 0.72, bottom - 157], [cx + r * 0.75, bottom - 157]], '#fff1c38e', 1.6);
  glowPoint(dx, y, lime, 9);
  const sign = Math.sign(drag);
  const arrowY = y + 39 * sign;
  if (Math.abs(drag) > 9) {
    line([[dx + 27, y], [dx + 27, arrowY]], '#fff1dc', 2.6);
    line([[dx + 21, arrowY - 9 * sign], [dx + 27, arrowY], [dx + 33, arrowY - 9 * sign]], '#fff1dc', 2.6);
  }
  line([[dx + 45, y], [777, y], [821, 322]], moss, 2);
  text('A parcel of fluid', 821, 313, 32, ink);
  text('Oscillates around its', 821, 361, 25, ink);
  text('equilibrium depth', 821, 393, 25, ink);
  text('Density changes with depth', 72, 82, 39, ink);
  subtitle('Simplified cutaway and exaggerated displacement', ink);
}

function compare(p: number, t: number, stage: 'sharp' | 'wide' | 'fit') {
  sheet();
  const resolve = stage === 'fit';
  const x = 360;
  const width = 449, axisX = 716, axisY = 536, y = 348, r = 165;
  const fit = 0.56;
  const move = stage === 'sharp' ? 0.05 + 0.23 * section(p, 0.43, 0.68)
    : stage === 'wide' ? 0.28 + 0.66 * section(p, 0.05, 0.72)
    : mix(0.94, fit, section(p, 0.06, 0.48));
  const guideX = axisX + width * mix(0.92, 0.31, fit);
  const modelX = axisX + width * mix(0.92, 0.31, move);
  text(resolve ? 'The model that fits the ring wave' : 'Change the interior, change the rhythm', 74, 87, 40, ink);
  interiorDisk(x, y, r, move);
  line([[axisX, axisY], [axisX + width, axisY]], plum, 2);
  line([[guideX, axisY - 250], [guideX, axisY + 11]], moss, 2.5);
  text('Observed wave', guideX, axisY - 266, 23, moss, 'center');
  line(path((u) => {
    const xx = axisX + width * u;
    return [xx, axisY - 112 * Math.exp(-(((xx - modelX) / 35) ** 2))];
  }), plum, 3.5);
  text('Predicted mode', modelX, axisY - 130, 23, plum, 'center');
  text('Slower', axisX, axisY + 38, 20, ink);
  text('Faster', axisX + width, axisY + 38, 20, ink, 'right');
  if (resolve) {
    c.globalAlpha = section(p, 0.47, 0.70);
    const angle = -0.58;
    const end = polar(x, y, r * 0.60, angle);
    line([[x, y], end], lime, 3);
    speck(...end, 6, lime);
    text('≈ 0.6 Saturn radii', x, y + r + 47, 25, ink, 'center');
    c.globalAlpha = 1;
  } else {
    const desc = stage === 'wide' ? 'Very broad transition' : p < 0.53 ? 'Sharp boundary' : 'Broader transition';
    text(desc, x, y + r + 47, 25, ink, 'center');
  }
  subtitle('Schematic comparison · Mankovich and Fuller (2021)', ink);
}

function finale(p: number, t: number) {
  const cx = mix(537, 749, section(p, 0.2, 0.84)), cy = 386;
  space(t);
  const r = mix(239, 158, section(p, 0.2, 0.84));
  planet(cx, cy, r, t, 0.54, -0.23);
  const remain = 1 - section(p, 0.12, 0.51);
  c.globalAlpha = remain;
  interiorDisk(cx, cy, r * 0.93, 0.64);
  const end = polar(cx, cy, r * 0.59, -0.58);
  line([[cx, cy], end], lime, 3);
  c.globalAlpha = 1;
  const beam = section(p, 0.34, 0.76);
  const x = mix(cx + r * 1.49, cx + r * 2.14, beam), y = cy - r * 0.17;
  glowPoint(x, y, lime, 5);
  line([[x, y], [x + 56, y - 77], [1173, y - 77]], lime, 2.3);
  text('The wave in the ice', 1173, y - 91, 25, cream, 'right');
  text('The part light can’t reach', 78, 167, 41);
  if (p > 0.74) {
    c.globalAlpha = section(p, 0.74, 1);
    artwork(t, 0.52, true);
    c.globalAlpha = 1;
  }
}

function credits(p: number, t: number) {
  sheet();
  planet(322, 333, 106, t, 0.54, -0.23);
  text('How Saturn’s Rings Heard Its Core', 586, 235, 36, ink);
  text('Ring waves · Hedman and Nicholson (2013)', 587, 317, 22, ink);
  text('Interior models · Mankovich and Fuller (2021)', 587, 357, 22, ink);
  text('Cassini image · NASA / JPL / Space Science Institute', 587, 397, 22, ink);
  text('Planet maps · Solar System Scope · CC BY 4.0', 587, 437, 22, ink);
  text('Mysteries of the Sky', 589, 564, 23, plum);
}

const scenes: Record<string, Scene> = {
  hook: (p, t) => {
    guide(t);
    c.globalAlpha = 1 - section(p, 0.57, 0.97);
    artwork(t, p);
    c.globalAlpha = 1;
  },
  groove: (p, t) => guide(t, p > 0.56 ? 'Inner C ring' : 'C ring'),
  scan: (p, t) => scans(p, t, false),
  repeat: (p, t) => scans(p, t, true),
  tugs,
  evidence,
  mystery,
  mode,
  parcel,
  compare: (p, t) => compare(p, t, 'sharp'),
  wide: (p, t) => compare(p, t, 'wide'),
  match: (p, t) => compare(p, t, 'fit'),
  finale,
  credits,
  thumbnail: (_p, t) => artwork(t, 0.56, true),
};

Object.assign(window, {
  saturnRingsFrame(key: string, t: number, cue?: {duration?: number}, mime = 'image/jpeg') {
    const draw = scenes[key];
    if (!draw) throw new Error('Unknown Saturn rings scene: ' + key);
    const p = Math.max(0, Math.min(1, t / Math.max(0.1, cue?.duration ?? 10)));
    c.save();
    draw(p, t);
    c.restore();
    return canvas.toDataURL(mime, 0.95).split(',')[1];
  },
});
