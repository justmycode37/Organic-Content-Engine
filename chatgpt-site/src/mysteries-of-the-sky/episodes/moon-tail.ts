import { c, canvas, grad, lensGlow, line, W, H, words } from './stage.ts';
import coverUrl from './moon-tail-cover.jpg';

const gold = '#f6be63', cream = '#f3e6da', lilac = '#c4b9e0', rose = '#e7a6a9';
const tau = Math.PI * 2;
const clamp = (a: number) => Math.max(0, Math.min(1, a));
const mix = (a: number, b: number, f: number) => a + (b - a) * f;
const ease = (t: number, a: number, b: number) => {
  const f = clamp((t - a) / (b - a));
  return f * f * (3 - 2 * f);
};
const trace = (n: number, point: (u: number) => number[]) => Array.from({ length: n + 1 }, (_, i) => point(i / n));
const measure = (text: string, x: number, y: number, size = 23, color = cream, align: CanvasTextAlign = 'left') =>
  words(text, x, y, size, 'sans', color, align);
const note = (text: string) => measure(text, 111, 661, 18, '#ddc7da');

let seed = 87;
const rng = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const stars = Array.from({ length: 460 }, () => [rng(), rng(), rng(), rng()]);
const craters = Array.from({ length: 87 }, () => [rng() * 2 - 1, rng() * 2 - 1, 0.017 + rng() ** 3 * 0.13]);
const particles = Array.from({ length: 290 }, () => [rng(), rng(), rng(), rng()]);
const cover = new Image();
cover.src = coverUrl;
Object.assign(window, { motionAssetsReady: cover.decode() });

function dot(x: number, y: number, r: number, fill: string | CanvasGradient) {
  c.fillStyle = fill;
  c.beginPath();
  c.arc(x, y, r, 0, tau);
  c.fill();
}
function ellipse(x: number, y: number, rx: number, ry: number, color: string | CanvasGradient, thick = 1.6) {
  c.strokeStyle = color;
  c.lineWidth = thick;
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, tau);
  c.stroke();
}
function backdrop(t: number, look: 'space' | 'desert' | 'instrument' | 'paper' | 'plum' = 'space') {
  const colors = {
    space: ['#070a1b', '#1a1933', '#3d2444'],
    desert: ['#131529', '#40283c', '#b77574'],
    instrument: ['#171426', '#352e4d', '#514663'],
    paper: ['#f7e0c5', '#eed1cb', '#cec1dd'],
    plum: ['#251630', '#4b2a48', '#75454f'],
  }[look];
  c.fillStyle = grad(0, 0, W * 0.48, H, colors);
  c.fillRect(0, 0, W, H);
  if (look === 'space' || look === 'desert') {
    for (const [u, v, r, phase] of stars) {
      const x = ((u + (0.0014 + 0.0012 * r) * t) % 1) * W;
      const light = 0.2 + r * 0.42 + 0.16 * Math.sin(phase * tau + t * (0.35 + r));
      c.globalAlpha = light;
      dot(x, v * H * (look === 'desert' ? 0.76 : 1), 0.4 + 1.4 * r ** 3, '#e7d9ec');
    }
    c.globalAlpha = 1;
  }
}
function disc(x: number, y: number, r: number, kind: 'moon' | 'earth' | 'sun', roll = 0) {
  const shades = {
    moon: ['#f3e1ca', '#9d8892', '#403349', '#181727'],
    earth: ['#c3c8ea', '#6b77a1', '#2f3e63', '#1e1d32'],
    sun: ['#fff1d1', '#ffc899', '#e5968f', '#a95171'],
  }[kind];
  lensGlow(x, y, r * (kind === 'sun' ? 2.2 : 1.12), kind === 'sun' ? '#ed9f8a' : lilac, 0.45);
  c.save();
  c.beginPath();
  c.arc(x, y, r, 0, tau);
  c.clip();
  const lit = c.createRadialGradient(x - r * 0.43, y - r * 0.34, r * 0.08, x, y, r * 1.08);
  shades.forEach((color, i) => lit.addColorStop(i / 3, color));
  c.fillStyle = lit;
  c.fillRect(x - r, y - r, r * 2, r * 2);
  if (kind === 'moon') {
    for (const [u, v, size] of craters) {
      const px = x + r * (u + roll * 0.02), py = y + r * v;
      const falloff = Math.max(0, 1 - Math.hypot(u, v) * 0.48);
      c.globalAlpha = falloff * 0.66;
      dot(px, py, r * size, '#746276');
      ellipse(px - r * size * 0.05, py - r * size * 0.07, r * size, r * size * 0.78, '#ead0baa0', Math.max(0.6, r * size * 0.11));
    }
  } else {
    for (let i = 0; i < 17; i++) {
      const z = (i / 17 + roll * 0.009) % 1;
      const py = y + r * (2 * z - 1);
      const strip = trace(36, (u) => [x - r + 2 * r * u, py + r * 0.08 * Math.sin(i + 8 * u + roll * 0.15)]);
      line(strip, kind === 'sun' ? '#ffe7b42b' : '#e2dbe53b', r * 0.028);
    }
  }
  c.restore();
  ellipse(x, y, r, r, kind === 'sun' ? '#ffd2ba70' : '#d6c6df50', 1.5);
}
function wave(x: number, y: number, length: number, amplitude: number, pitch: number, t: number, color: string) {
  const points = trace(121, (u) => [x + length * u, y + amplitude * Math.sin(length * u * tau / pitch - t * 7.5)]);
  line(points, grad(x, y, length, amplitude, [color + '44', color, color + '80']), 3.6);
}
function arrow(a: number[], b: number[], color: string, thick = 2) {
  line([a, b], color, thick);
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const wing = (offset: number) => [b[0] - 13 * Math.cos(angle + offset), b[1] - 13 * Math.sin(angle + offset)];
  line([wing(-0.48), b, wing(0.48)], color, thick);
}
function camera(x: number, y: number, radius: number, t: number) {
  c.fillStyle = grad(x - radius, y - radius, radius * 2, radius * 2, ['#aea1b8', '#413450', '#1c172c']);
  c.beginPath();
  c.arc(x, y, radius, 0, tau);
  c.fill();
  for (let i = 0; i < 5; i++) {
    const size = radius * (1 - i * 0.138);
    ellipse(x, y, size, size, i % 2 ? '#c6b8d887' : '#f1c7af8b', Math.max(1, radius * 0.048));
  }
  dot(x, y, radius * 0.28, '#201c3b');
  lensGlow(x - radius * 0.19, y + radius * 0.24, radius * 0.65, '#a58bc2', 0.68 + 0.13 * Math.cos(t));
}

function skyPatch(t: number, discovery = false) {
  backdrop(t, 'desert');
  c.fillStyle = grad(0, 430, W, 280, ['#1a1a2a', '#362138', '#190f23']);
  c.beginPath();
  c.moveTo(0, H);
  trace(100, (u) => [u * W, 520 - 37 * Math.sin(u * 8) - 20 * Math.sin(u * 19 + 1)]).forEach(([x, y]) => c.lineTo(x, y));
  c.lineTo(W, H);
  c.fill();
  const search = ease(t, 0.2, 5.0);
  const x = mix(490, 737, search), y = mix(295, 223, search);
  for (let i = 1; i <= 3; i++) ellipse(x, y, i * 38, i * 38, '#cec0d872', 1.2);
  lensGlow(x + 6, y + 3, 50 + 31 * search, gold, 0.17 + 0.68 * ease(t, 1.5, 5.8));
  const k = (t * 0.44) % 1;
  line([[x - 100, y - 96 + 191 * k], [x + 100, y - 96 + 191 * k]], '#e4d1e75c', 1.35);
  measure(discovery ? 'West Texas · November 1998' : 'All-sky sodium camera', 113, 140, 29);
  measure('Direction opposite the Sun', x, y + 144, 24, cream, 'center');
  note('Illustration of the discovery');
}
function nights(t: number) {
  backdrop(t, 'paper');
  const ink = '#392841', gray = '#765b71';
  const y = (v: number) => 515 - v * 2.68;
  measure('Three nights of sodium light', 137, 115, 35, ink);
  measure('Brightness in rayleighs', 137, 152, 23, gray);
  for (const value of [0, 30, 60, 90, 120]) {
    line([[157, y(value)], [1132, y(value)]], '#72576958', 1.2);
    measure(String(value), 142, y(value) + 6, 20, gray, 'right');
  }
  for (const [i, value] of [22, 90, 38].entries()) {
    const x = 345 + 290 * i;
    const reveal = ease(t, i * 1.1, i * 1.1 + 0.95);
    const shown = value * reveal;
    c.fillStyle = grad(x - 54, y(shown), 108, 270, i === 1 ? ['#c27d43', '#e7bb7b', '#edc79d6d'] : ['#79628a', '#ab8eaa', '#ba9da471']);
    c.fillRect(x - 53, y(shown), 106, 515 - y(shown));
    if (reveal > 0.9) {
      line([[x, y(value * 0.75)], [x, y(value * 1.25)]], ink, 2);
      for (const error of [0.75, 1.25]) line([[x - 8, y(value * error)], [x + 8, y(value * error)]], ink, 2);
      measure(String(value), x, y(value * 1.25) - 16, 25, ink, 'center');
    }
    measure('Nov ' + (18 + i), x, 565, 25, ink, 'center');
  }
  measure('Smith et al. · McDonald Observatory · ±25% estimated uncertainty', 136, 631, 21, gray);
}
function phaseScene(t: number, mode: 'geometry' | 'orbit' | 'newmoon' = 'geometry') {
  backdrop(t);
  const progress = ease(t, 0.2, mode === 'orbit' ? 11.8 : 6.1);
  const orbitalAngle = mode === 'orbit'
    ? mix(-Math.PI * 0.7, -Math.PI / 2, ease(t, 3.3, 10.0)) + (Math.PI / 2) * ease(t, 12.4, 14.5)
    : Math.PI - (1 - progress) * 0.27;
  const earthX = 762, earthY = 357, pathRx = 268, pathRy = 173;
  const mx = earthX + pathRx * Math.cos(orbitalAngle);
  const my = earthY + pathRy * Math.sin(orbitalAngle);
  ellipse(earthX, earthY, pathRx, pathRy, '#d9c4df70', 1.8);
  disc(92, earthY, 99, 'sun', t);
  const tailLength = mode === 'geometry' ? 0 : 1180 - mx;
  if (tailLength > 0) {
    for (const [u, v, z] of particles) {
      const k = (u + t * 0.12 * (0.6 + z)) % 1;
      const x = mx + 27 + k * tailLength;
      const y = my + (v - 0.5) * (28 + 120 * k);
      c.globalAlpha = Math.sin(k * Math.PI) * 0.75;
      dot(x, y, 0.65 + z * 1.35, gold);
    }
    c.globalAlpha = 1;
  }
  disc(earthX, earthY, 74, 'earth', t);
  disc(mx, my, 35, 'moon', t);
  measure('Sun', 109, 519, 26, cream, 'center');
  measure('Earth', earthX, earthY + 113, 26, cream, 'center');
  measure('Moon', mx, my - 56, 25, cream, 'center');
  if (mode === 'geometry') {
    const right = ease(t, 2.1, 5.5);
    const tx = earthX + 76 + 306 * right;
    arrow([earthX + 80, earthY], [tx, earthY], lilac, 3);
    lensGlow(tx, earthY, 36, gold, 0.86 * right);
    measure('Night side', 964, 460, 27, cream, 'center');
    measure('The camera looks this way', 1144, 291, 23, lilac, 'right');
  } else {
    const status = mode === 'newmoon' ? 'Near new Moon' : t >= 13.5 ? 'Near full Moon' : t >= 9.5 ? 'First quarter' : 'The Moon orbits Earth';
    measure(status, 119, 135, 34);
    arrow([181, 187], [483, 187], rose);
    measure('Away from the Sun', 186, 167, 22, rose);
  }
  note('Orbital geometry · schematic · distances and sizes exaggerated');
}
function spectrum(t: number) {
  backdrop(t, 'instrument');
  const x = 146, w = 985;
  measure('Sunlight', 163, 144, 31);
  for (const [i, color] of ['#ab91c6', '#c8afd7', '#ccc2d4', '#eabcb0', '#ebaeaa', '#cb859d'].entries()) {
    const py = 219 + i * 53;
    wave(x, py, w * ease(t, i * 0.25, 2.5 + i * 0.25), 14, 68 + i * 15, t, i === 4 ? gold : color);
  }
  const show = ease(t, 3, 5.2);
  c.globalAlpha = show;
  c.fillStyle = grad(0, 410, 0, 55, [gold + '25', gold + '68', gold + '04']);
  c.fillRect(147, 406, 984, 55);
  measure('Sodium D lines', 1139, 559, 29, gold, 'right');
  measure('589.0 nm  ·  589.6 nm', 1139, 600, 24, cream, 'right');
  c.globalAlpha = 1;
  note('Waves shown schematically');
}
function scatter(t: number, pressure = false) {
  backdrop(t, 'plum');
  const turn = (t / 3.3) % 1;
  const count = Math.floor(t / 3.3);
  const displacement = pressure ? 240 * ease(t, 0, 14.4) : 0;
  const atomX = 470 + displacement, atomY = 365;
  const inbound = ease(turn, 0, 0.39);
  const out = ease(turn, 0.53, 0.99);
  const excited = ease(turn, 0.37, 0.51) * (1 - ease(turn, 0.54, 0.69));
  const phi = [-0.73, 0.72, -1.64, 0.33, 1.48][count % 5];
  ellipse(atomX, atomY, 100 + excited * 34, 100 + excited * 34, '#e4cee15b', 2.2);
  lensGlow(atomX, atomY, 123 + 78 * excited, gold, 0.32 + excited * 0.45);
  dot(atomX, atomY, 30 + excited * 11, grad(atomX - 40, atomY - 35, 96, 70, ['#fff2d2', '#e6b399', '#9a678e']));
  measure('Na', atomX, atomY + 7, 22, '#392543', 'center');
  if (inbound < 1) {
    const x = mix(113, atomX - 28, inbound);
    wave(x - 83, atomY, 80, 12, 28, t, gold);
    lensGlow(x, atomY, 30, gold, 0.79);
  }
  if (out > 0) {
    const x = atomX + Math.cos(phi) * out * 377;
    const y = atomY + Math.sin(phi) * out * 282;
    c.save();
    c.translate(x, y);
    c.rotate(phi);
    wave(-85, 0, 80, 12, 29, t, gold);
    c.restore();
    lensGlow(x, y, 33, gold, 0.7 * (1 - 0.51 * out));
  }
  if (pressure) {
    arrow([147, 548], [872 + displacement * 0.8, 548], lilac, 2.6);
    measure('Net push away from the Sun', 148, 593, 27, cream);
    for (let i = 0; i < Math.min(count + 1, 8); i++) dot(172 + 81 * i, 548, 4.5, gold + 'bb');
  } else {
    measure('Absorb', 140, 190, 29);
    measure('Re-emit', 1003, 190, 29, cream, 'center');
    measure('Sodium atom', atomX, 588, 28, cream, 'center');
  }
  note('Photon interactions · schematic');
}
function optics(t: number) {
  backdrop(t, 'instrument');
  const center = 675, r = 178;
  c.save();
  c.translate(center, 346);
  c.rotate(-0.25 + 0.16 * Math.sin(t * 0.31));
  for (let j = 0; j < 7; j++) ellipse(j * 7, 0, r * 0.46, r + j * 0.75, j === 6 ? '#e4c5a1' : '#b0a0bd8a', j === 6 ? 4 : 2.3);
  lensGlow(28, 0, 141, '#bf8bab', 0.57);
  c.restore();
  for (let i = 0; i < 9; i++) {
    const tint = i === 4 ? gold : i < 4 ? lilac : rose;
    const py = 214 + i * 33;
    wave(123, py, 540, 9, 49 + i * 5, t, tint);
    if (i === 4) {
      wave(703, py, 430, 15, 69, t, gold);
      lensGlow(720 + 371 * ((t * 0.77) % 1), py, 50, gold, 0.76);
    }
  }
  measure('A narrow filter', 675, 584, 30, cream, 'center');
  measure('Sodium light', 1138, 453, 25, gold, 'right');
  note('The rejected wavelengths are simplified');
}
function surface(t: number, escaping = false) {
  backdrop(t);
  const sx = 510 + (escaping ? 91 * ease(t, 0, 8) : 0), sy = 778, r = 340;
  disc(sx, sy, r, 'moon', t);
  for (const [i, [u, v, z]] of particles.slice(0, 98).entries()) {
    const day = (u + t * (0.17 + z * 0.13)) % 1;
    const px = sx + (v - 0.5) * 400, origin = sy - Math.sqrt(r * r - (px - sx) ** 2);
    const leave = escaping && z > 0.58;
    const rise = leave ? day * (151 + 166 * z) : Math.sin(day * Math.PI) * (59 + 149 * z);
    const away = (v - 0.5) * day * 245 + (leave ? 221 * day * day : 0);
    c.globalAlpha = Math.sin(day * Math.PI) * 0.92;
    dot(px + away, origin - rise, 1.5 + 2.25 * z, leave ? gold : '#cfb1ce');
    if (i % 19 === 0) lensGlow(px + away, origin - rise, 21, leave ? gold : lilac, 0.46);
  }
  c.globalAlpha = 1;
  if (escaping) {
    line(trace(84, (u) => [409 + u * 116, 454 - 507 * u * (1 - u)]), lilac, 2.6);
    line(trace(84, (u) => [594 + u * 434, 439 - 327 * (1 - (1 - u) ** 2)]), gold, 2.8);
    measure('Falls back', 338, 274, 27, lilac);
    measure('Escapes', 992, 155, 29, gold, 'right');
  } else {
    const progress = (t * 0.46) % 1;
    const impact = ease(progress, 0.53, 0.64) * (1 - ease(progress, 0.66, 0.94));
    const hit = ease(progress, 0, 0.57);
    arrow([174 + 270 * hit, 116 + 325 * hit], [200 + 270 * hit, 144 + 325 * hit], rose, 2.6);
    lensGlow(488, 439, 144, gold, impact);
    measure('Lunar soil', 952, 509, 30);
    if (t > 2.5) measure('A sparse exosphere', 947, 210, 27, lilac);
  }
  note('Individual sodium trajectories · schematic');
}
function sources(t: number) {
  backdrop(t, 'desert');
  const sun = ease(t, 3.9, 5.2);
  const wind = ease(t, 6.05, 7.1);
  const names = ['Meteoroid impacts', 'Sunlight releases atoms', 'Solar wind knocks atoms loose'];
  for (const [i, x] of [260, 640, 1020].entries()) {
    const reveal = i === 0 ? 1 : i === 1 ? sun : wind;
    if (!reveal) continue;
    c.save();
    c.globalAlpha = reveal;
    disc(x, 474, 118, 'moon', t);
    const phase = (t * (0.5 + i * 0.05)) % 1;
    if (i === 1) {
      wave(x - 117, 294, 234, 10, 44, t, rose);
      for (let k = -2; k <= 2; k++) arrow([x + k * 25, 303], [x + k * 25, 347], rose, 1.8);
    } else {
      const y = 192 + phase * 177;
      for (let k = -(i * 2); k <= i * 2; k++) {
        line([[x - 27 + k * 18, y - 24], [x + k * 18, y]], i ? lilac : rose, i ? 2.2 : 4);
      }
    }
    for (let j = 0; j < 42; j++) {
      const [u, v, z] = particles[j];
      const jump = (u + t * 0.78) % 1;
      const px = x + (v - 0.5) * 158 * jump;
      const y = 367 - jump * (65 + z * 77);
      c.globalAlpha = reveal * Math.sin(jump * Math.PI) * 0.9;
      dot(px, y, 0.8 + z * 1.4, gold);
    }
    c.globalAlpha = reveal;
    measure(names[i], x, 626, i === 2 ? 22 : 25, cream, 'center');
    c.restore();
  }
  measure('How sodium can leave lunar soil', 114, 115, 33);
}
function tail(t: number) {
  backdrop(t);
  const move = ease(t, 0, 6.2), moon = 438 - 183 * move;
  const y = 343, r = 115 - 30 * move;
  disc(85, y, 69, 'sun', t);
  for (let j = 0; j < 13; j++) {
    const side = (j - 6) / 6;
    const points = trace(105, (u) => [moon + r * 0.7 + u * 815, y + side * u ** 0.52 * 137 + 13 * Math.sin(u * 8 - t * 0.4 + j)]);
    line(points, grad(moon, y, 660, 0, [gold + 'b2', gold + '52', gold + '06']), j === 6 ? 3 : 1.15);
  }
  for (const [u, v, q] of particles) {
    const f = (u + t * (0.12 + q * 0.22)) % 1;
    const x = moon + r * 0.7 + f * 822, py = y + 260 * f ** 0.52 * (v - 0.5);
    c.globalAlpha = Math.sin(Math.PI * f) * (0.34 + q * 0.53);
    dot(x, py, 0.72 + q * 1.83, gold);
  }
  c.globalAlpha = 1;
  disc(moon, y, r, 'moon', t);
  measure('Beyond the Moon', 176, 147, 37);
  arrow([578, 567], [1112, 567], '#e0ccdb', 2);
  measure('Away from sunlight’s source', 1105, 610, 22, lilac, 'right');
  note('Neutral sodium · schematic');
}

// Integrate representative atom trajectories in normalized units. The
// animation is a qualitative comparison, with an enlarged Earth.
const runs = [-155, -124, -95, -79, -65, 65, 79, 95, 124, 155].map((aim) => {
  const result = [];
  let x = 62, y = aim, vx = 4.5, vy = 0;
  while (x < W + 20 && result.length < 400) {
    const dx = x - 632;
    const d = Math.hypot(dx, y);
    if (d < 48) break;
    const a = -270 / Math.max(48, d) ** 3;
    vx += a * dx;
    vy += a * y;
    x += vx;
    y += vy;
    result.push([x, y]);
  }
  return result;
});
function focus(t: number) {
  backdrop(t, 'space');
  const center = 354;
  const pull = ease(t, 5.1, 8.1);
  const focusLight = ease(t, 18.2, 21.6);
  for (const [i, run] of runs.entries()) {
    const enter = i === 2 ? 1.7 : i === 7 ? 12.0 : 14.9 + (i % 5) * 0.32;
    const shown = ease(t, enter, enter + (i === 2 ? 7.2 : 4.2));
    if (!shown) continue;
    const straightY = run[0][1];
    const pts = run.map(([x, y]) => [x, center + mix(straightY, y, pull)]);
    if (i === 2 || i === 7) {
      c.setLineDash([7, 8]);
      line([[63, center + straightY], [1168, center + straightY]], '#b8a2cc58', 1.6);
      c.setLineDash([]);
    }
    const n = Math.max(2, Math.floor(pts.length * shown));
    line(pts.slice(0, n), grad(62, 0, 1116, 0, [lilac + '55', gold + 'da', gold + '51']), i === 2 || i === 7 ? 3.7 : 1.75);
    for (let j = 0; j < 4; j++) {
      const q = (t * 0.55 + i * 0.17 + j / 4) % 1;
      const [x, y] = pts[Math.floor(q * (n - 1))];
      dot(x, y, 1.4 + 1.05 * (j % 2), gold);
      if (j === 0) lensGlow(x, y, 19, gold, 0.43);
    }
  }
  lensGlow(1015, center, 104, gold, 0.37 * focusLight);
  disc(632, center, 48, 'earth', t);
  measure('Earth', 632, center + 79, 25, cream, 'center');
  measure(t < 5.1 ? 'An atom approaches Earth' : 'Gravity bends the paths', 157, 133, 34);
  c.globalAlpha = focusLight;
  measure('Denser core beyond Earth', 1138, 538, 26, gold, 'right');
  c.globalAlpha = 1;
  note('Qualitative particle paths · schematic');
}
function lineOfSight(t: number) {
  const angle = (Math.PI / 2) * ease(t, 3.8, 8.3);
  const ex = 0.5 + 0.5 * Math.cos(angle);
  backdrop(t, 'instrument');
  for (const [u, v, z, key] of particles) {
    const axial = (u + t * (0.1 + key * 0.11)) % 1;
    const radius = 14 + z * (66 + 59 * Math.abs(0.58 - axial));
    const phi = v * tau + t * 0.098;
    const x = 631 + (axial - 0.5) * Math.cos(angle) * 918 + radius * Math.sin(angle) * Math.cos(phi);
    const y = 355 + radius * Math.sin(phi);
    c.globalAlpha = 0.5 + (1 - ex) * 0.29;
    dot(x, y, 1.2 + key, gold);
  }
  c.globalAlpha = 1;
  if (angle < 1.45) {
    const start = [134 + 336 * Math.sin(angle), 356];
    arrow(start, [1131 - 350 * Math.sin(angle), 356], lilac, 2.2);
  }
  for (let i = 0; i < 4; i++) ellipse(632, 355, 76 + i * 40 + 210 * Math.cos(angle), 76 + i * 29, '#c0a9d44f', 1.65);
  lensGlow(632, 355, 86 + 182 * (1 - ex), gold, 0.22 + 0.73 * ease(angle, 0.2, 1.56));
  measure(angle < 0.7 ? 'Across the beam' : 'Along the beam', 640, 148, 35, cream, 'center');
  measure('Each pixel adds the sodium light along its sightline', 640, 623, 27, cream, 'center');
  note('Observer’s view · schematic');
}
function viewCompare(t: number) {
  backdrop(t, 'instrument');
  const align = ease(t, 3.55, 5.15);
  const tip = mix(552, 359, align);
  const left = 120, right = 913, center = 358;
  for (const [u, v, p] of particles) {
    const f = (u + t * (0.1 + p * 0.1)) % 1;
    const px = left + f * (right - left);
    const py = center + (v - 0.5) * (62 + 36 * f);
    c.globalAlpha = 0.37 + p * 0.6;
    dot(px, py, 1 + p * 1.3, gold);
  }
  c.globalAlpha = 1;
  camera(103, center, 37, t);
  arrow([145, center], [right, tip], lilac, 2.5);
  const exit = mix(333, 800, align);
  line([[144, center], [exit, center + (tip - center) * (exit - 144) / (right - 144)]], gold, 3.5);
  ellipse(1072, 348, 108, 108, '#d3bddaef', 2);
  lensGlow(1072, 348, 98, gold, 0.16 + align * 0.65);
  measure('Brightness in one camera direction', 111, 132, 34);
  measure(align > 0.8 ? 'Longer path along the beam' : 'Shorter path cuts across the beam', 121, 523, 28, cream);
  note('Viewing geometry · schematic');
}
function pair(t: number, early: boolean) {
  backdrop(t, early ? 'paper' : 'space');
  const color = early ? '#3c3049' : cream;
  const centers = [350, 930];
  for (const [i, x] of centers.entries()) {
    const reveal = ease(t, i * 2, i * 2 + 2.3);
    c.globalAlpha = reveal;
    c.fillStyle = grad(x - 180, 168, 360, 360, ['#1b1730', '#3d314d', '#82566d']);
    c.save();
    c.beginPath();
    c.arc(x, 347, 175, 0, tau);
    c.clip();
    c.fillRect(x - 179, 171, 359, 357);
    for (const [u, v, z] of stars.slice(0, 140)) dot(x - 174 + 350 * u, 181 + v * 340, 0.6 + z, '#dbc8df7c');
    const sx = x + 27 - i * 19, sy = 339 + i * 15;
    lensGlow(sx, sy, 64 + 9 * Math.sin(t * 0.4 + i), gold, 0.67);
    const scan = (t * 0.39 + i * 0.27) % 1;
    line([[x - 175, 170 + 351 * scan], [x + 175, 170 + 351 * scan]], '#e9cfe262', 1.7);
    c.restore();
    ellipse(x, 347, 175, 175, '#cdb6d7', 2);
    if (early) {
      measure(i ? 'November 1998' : 'August 1998', x, 578, 30, color, 'center');
      measure(i ? 'Leonid meteor shower' : 'Earlier images', x, 611, 21, color, 'center');
    } else {
      measure(i ? 'Shigaraki, Japan' : 'McDonald Observatory, Texas', x, 578, 26, color, 'center');
    }
    c.globalAlpha = 1;
  }
  measure(early ? 'The patch existed before the Leonids' : 'Two observing sites', 644, 117, 37, color, 'center');
  measure('Illustrations of the reported detections', 640, 661, 18, early ? '#765b71' : '#ddc7da', 'center');
}
function longStudy(t: number) {
  backdrop(t, 'paper');
  const ink = '#382943', gray = '#745b72';
  measure('Fourteen years of observing', 123, 128, 37, ink);
  measure('El Leoncito Observatory · Argentina', 125, 168, 25, gray);
  const until = ease(t, 0.25, 4.6);
  const x = (i: number) => 165 + i * 70;
  for (let i = 0; i < 14; i++) {
    const visible = ease(until, i / 15, (i + 1.8) / 15);
    c.globalAlpha = visible;
    const g = grad(x(i), 226, 48, 165, ['#51405f', '#93798e', '#caa19a']);
    c.fillStyle = g;
    c.fillRect(x(i), 238, 52, 142);
    dot(x(i) + 26, 312, 5.3, '#edc898');
    c.globalAlpha = 1;
    if (i % 4 === 0 || i === 13) measure(String(2006 + i), x(i) + 26, 421, 19, gray, 'center');
  }
  const factor = ease(t, 4.1, 6.3);
  c.globalAlpha = factor;
  measure('Largest effect', 135, 517, 22, gray);
  measure('Sun–Moon–Earth geometry', 135, 562, 31, ink);
  c.globalAlpha = ease(t, 6.5, 8.8);
  measure('After accounting for geometry', 690, 517, 22, gray);
  measure('A link with sporadic meteors', 690, 562, 31, ink);
  c.globalAlpha = 1;
  measure('Baumgardner et al. · 2006–2019 observations', 135, 643, 19, gray);
}
function doppler(t: number) {
  backdrop(t, 'paper');
  const ink = '#372c46', red = '#944c66', blue = '#6d628e';
  const f = ease(t, 0.75, 4.9);
  const x = (p: number) => 165 + p * 956;
  const shape = (p: number, mean: number) => 475 - 241 * Math.exp(-(((p - mean) / 0.149) ** 2));
  measure('The sodium line shifts', 150, 130, 37, ink);
  measure('Relative light', 151, 170, 22, '#755972');
  const shift = 0.32 * f;
  line([[165, 186], [165, 486], [1121, 486]], '#826981a2', 1.9);
  c.setLineDash([8, 8]);
  line(trace(160, (u) => [x(u), shape(u, 0.33)]), blue, 3.1);
  c.setLineDash([]);
  line(trace(160, (u) => [x(u), shape(u, 0.33 + shift)]), red, 4.25);
  arrow([x(0.33), 202], [x(0.33 + shift), 202], red, 2.4);
  measure('Longer wavelength', 1117, 535, 23, ink, 'right');
  c.globalAlpha = ease(t, 3.1, 5);
  measure('12.4 km/s away from Earth', 665, 589, 33, ink, 'center');
  measure('Three nights near new Moon · Mierkiewicz et al. · line shape illustrated', 150, 652, 20, '#755972');
  c.globalAlpha = 1;
}
function columnCompare(t: number) {
  backdrop(t, 'instrument');
  const scan = ease(t, 3.3, 9.8);
  const reveal = ease(t, 9.6, 14.8);
  measure('What can one camera pixel tell us?', 114, 128, 35);
  for (const [i, cx] of [354, 923].entries()) {
    const r = i ? 268 : 104;
    const x0 = cx - 220;
    const y = 353;
    c.save();
    c.beginPath();
    c.rect(x0, 190, 440, 320);
    c.clip();
    for (const [u, v, size] of particles.slice(0, 113)) {
      const x = cx + (u - 0.5) * r * 1.68;
      const py = y + (v - 0.5) * (82 + 30 * Math.sin(u * Math.PI));
      c.globalAlpha = (i ? 0.53 : 0.77) * (0.58 + 0.42 * Math.sin(t + size * tau) ** 2);
      dot(x, py, 0.7 + size * 2.3, gold);
    }
    c.globalAlpha = 1;
    const optic = x0 + 33;
    camera(optic, y, 28, t);
    arrow([optic + 27, y], [optic + 30 + scan * 360, y], lilac, 2.4);
    lensGlow(cx + 120, y, 46 + reveal * 38, gold, reveal * 0.63);
    c.restore();
    measure(i ? 'Long column, end-on' : 'Small cloud', cx, 551, 28, cream, 'center');
  }
  note('Rowan Ellery · illustrative comparison');
}
function geometryBias(t: number) {
  backdrop(t, 'plum');
  const pass = ease(t, 3.4, 12.7);
  const center = 335;
  const earthY = mix(154, center, pass);
  measure('The same stream can look brighter', 116, 110, 35);
  for (const [u, v, z] of particles) {
    const f = (u + t * 0.19 * (0.4 + z)) % 1;
    const x = 104 + f * 769, y = center + (v - 0.5) * (83 + 25 * Math.sin(f * Math.PI));
    c.globalAlpha = 0.38 + 0.5 * z;
    dot(x, y, 0.8 + 1.6 * z, gold);
  }
  c.globalAlpha = 1;
  disc(484, earthY, 41, 'earth', t);
  line([[484, 128], [484, 510]], '#eccee266', 1.4);
  arrow([530, earthY], [851, earthY], lilac, 2.2);
  ellipse(1037, 323, 121, 121, '#cbb4cd', 2.4);
  lensGlow(1037, 323, 108, gold, 0.08 + pass * 0.83);
  measure('Camera view', 1037, 488, 25, cream, 'center');
  measure('Sodium supply stays the same', 120, 575, 25, cream);
  note('Rowan Ellery · geometry illustrated');
}

function credit(t: number) {
  backdrop(t, 'paper');
  const ink = '#372a42';
  for (let i = 0; i < 18; i++) {
    line(trace(78, (u) => [81 + 386 * u, 160 + 16 * i + (22 + 7 * u) * Math.sin(u * 6 - t * 1.2 + i * 0.21)]),
      grad(65, 0, 400, 188, ['#ae6e8440', '#725677bd', '#a8759c22']), 1.7);
  }
  measure('The Moon Has a Tail', 516, 214, 44, ink);
  measure('Mysteries of the Sky', 518, 262, 25, '#755b74');
  for (const [i, msg] of [
    'Discovery and follow-up · Smith et al. and Baumgardner et al.',
    'Velocity measurements · Mierkiewicz et al.',
    'Rowan Ellery is a fictional presenter',
  ].entries()) {
    c.globalAlpha = ease(t, 0.3 + 0.65 * i, 1.0 + 0.65 * i);
    measure(msg, 518, 344 + i * 58, 22, ink);
  }
  c.globalAlpha = 1;
}
function hook(t: number) {
  skyPatch(t, true);
  const tile = 80;
  const zoom = 1 + 0.09 * ease(t, 0, 3);
  c.save();
  c.translate(960, 360);
  c.scale(zoom, zoom);
  c.translate(-960, -360);
  for (let y = 0; y < H; y += tile) for (let x = 0; x < W; x += tile) {
    const delay = 0.46 + 1.3 * (1 - x / W) + 0.15 * Math.sin(x * 0.045 + y * 0.028);
    const peel = ease(t, delay, delay + 0.72);
    if (peel >= 1) continue;
    const size = tile * (1 - peel * 0.31);
    c.globalAlpha = 1 - peel ** 1.6;
    c.drawImage(cover, x, y, tile, tile, x + 19 * peel, y - 29 * peel, size + 0.2, size + 0.2);
  }
  c.restore();
}
const scenes: Record<string, (t: number) => void> = {
  hook, discovery: (t) => skyPatch(t, true), skyPatch, nights, geometry: phaseScene,
  title: (t) => {
    backdrop(t);
    disc(894, 352, 226 - ease(t, 0.4, 5.7) * 68, 'moon', t);
    measure('The Moon Has a Tail', 107, 336, 52);
    measure('Mysteries of the Sky', 110, 398, 27, lilac);
  },
  spectrum, scatter, optics, surface, sources, escape: (t) => surface(t, true),
  photonPush: (t) => scatter(t, true), tail,
  orbit: (t) => phaseScene(t, 'orbit'), newmoon: (t) => phaseScene(t, 'newmoon'),
  focus, focusRecap: (t) => focus(15 + t * 2.8), lineOfSight, viewCompare, twoSites: (t) => pair(t, false), early: (t) => pair(t, true),
  longStudy, doppler, columnCompare, geometryBias, credits: credit,
  eye: (t) => {
    backdrop(t, 'instrument');
    const r = 136 + ease(t, 0, 5) * 78;
    camera(640, 351, r, t);
    const flash = Math.sin(t * 0.8) * 0.12;
    lensGlow(640, 353, r * 0.73, gold, 0.27 + flash);
    measure('Looking into the sodium tail', 640, 626, 31, cream, 'center');
  },
};
Object.assign(window, {
  moonTailFrame(key: string, t: number) {
    const draw = scenes[key];
    if (!draw) throw new Error('Unknown Moon-tail scene: ' + key);
    c.save();
    draw(t);
    c.restore();
    return canvas.toDataURL('image/jpeg', 0.92).split(',')[1];
  },
});
