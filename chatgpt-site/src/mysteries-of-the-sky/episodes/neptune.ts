// "The Planet Found on Paper". Portraits and spacecraft images are real and
// palette-graded; orbits, residuals, sky charts and pulls are schematic.
import { c, W, H, lensGlow, line, grad } from './stage.ts';
import { preparePlanets } from '../index.ts';
import {
  tau,
  ease,
  mix,
  clamp,
  ink,
  muted,
  lilac,
  coral,
  blush,
  accent,
  cream,
  text,
  grade,
  load,
  cover,
  tiles,
  space,
  at,
  hud,
  setTimeline,
  episodeFrame,
  arriveByMosaic,
  lockCamera,
  cutTo,
} from './aurora-core.ts';
import { path, dot, spark, wave, contours, gradedPlanet } from './aurora-scenes.ts';
import { oxygen } from './aurora-beats3.ts';
import words from './neptune/words.json';
import leverrierUrl from './neptune/leverrier-cut.png';
import galleUrl from './neptune/galle-cut.png';
import herschelUrl from './neptune/herschel-cut.png';
import adamsUrl from './neptune/adams-cut.png';
import voyagerUrl from './neptune/neptune-voyager.jpg';
import spotUrl from './neptune/great-dark-spot.jpg';
import tritonUrl from './neptune/triton.jpg';
import uranusUrl from './neptune/uranus-voyager.jpg';
import webbUrl from './neptune/neptune-webb-wide.jpg';
import milkyUrl from './aurora/milky-way.jpg';

setTimeline(words as [string, number][]);
const raw = {
  leverrier: load(leverrierUrl),
  galle: load(galleUrl),
  herschel: load(herschelUrl),
  adams: load(adamsUrl),
  voyager: load(voyagerUrl),
  spot: load(spotUrl),
  triton: load(tritonUrl),
  uranus: load(uranusUrl),
  webb: load(webbUrl),
  milky: load(milkyUrl),
};
const portraits = new Set(['leverrier', 'galle', 'herschel', 'adams']);
const P: Record<string, HTMLCanvasElement> = {};
Object.assign(window, {
  motionAssetsReady: Promise.all([...Object.values(raw).map((i) => i.decode()), preparePlanets(['mercury', 'sun', 'jupiter', 'saturn'])]).then(() => {
    for (const [k, img] of Object.entries(raw)) {
      // Neptune's blue is this episode's subject; the grade keeps no green accent.
      P[k] = grade(img, false, portraits.has(k) ? 1.15 : k === 'milky' ? 1.25 : 1.1);
      if (portraits.has(k)) {
        const x = P[k].getContext('2d')!;
        x.globalCompositeOperation = 'destination-in';
        x.drawImage(img, 0, 0);
      }
    }
  }),
});
const cue = (phrase: string, after = 0) => {
  const v = at(phrase, after);
  return Number.isFinite(v) ? v : -20;
};
const hash = (n: number) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};
const neptuneBlue = '#7d9cff';

// ── Cream plates: a portrait among tiles of the sky, as in the reference opening
function plate(t: number, who: string, place: string, name: string, tileSrc: string, side = 0.62) {
  c.fillStyle = cream;
  c.fillRect(0, 0, W, H);
  for (let x = 0; x <= W; x += W / 24) line([[x, 0], [x, H]], '#b9b0a230', 1);
  for (let y = 0; y <= H; y += W / 24) line([[0, y], [W, y]], '#b9b0a230', 1);
  const set = tiles(16, who.length * 31 + 7);
  const fill = ease(t, 0.2, 3.5) * 0.5;
  for (const q of set) {
    if (q.at > fill || (q.x < 480 && q.y > 520)) continue;
    const age = clamp((fill - q.at) * 10),
      s = q.size * (0.6 + 0.4 * age);
    c.save();
    c.beginPath();
    c.rect(q.x + (q.size - s) / 2, q.y + (q.size - s) / 2, s, s);
    c.clip();
    cover(P[q.kind < 0.5 ? tileSrc : 'milky'], 1.3, 0.3 + 0.4 * q.kind, 0.5);
    c.restore();
  }
  const p = P[who],
    h = 660,
    w = (p.width / p.height) * h,
    z = 1 + 0.05 * ease(t, 0, 8);
  c.drawImage(p, W * side - (w * z) / 2, H - h * z + 20, w * z, h * z);
  c.globalAlpha = ease(t, 0.4, 1.2);
  text(place, 90, 596, 36, '#2a1d3a', 'left', 'title');
  text(name, 92, 640, 24, '#4a3b58', 'left', 'title');
  c.globalAlpha = 1;
}

// ── 01 A star chart with one point too many ──────────────────────────────
function starField(t: number, g: number, extra: number, moved = 0) {
  space(g);
  for (let i = 0; i < 160; i++) {
    const x = 80 + hash(i) * 1120,
      y = 60 + hash(i + 50) * 600,
      m = 1 + 3 * hash(i + 9) ** 3;
    dot(x, y, m, '#e8e4ff');
    if (m > 2.6) lensGlow(x, y, m * 5, '#c9c6ff', 0.4);
  }
  if (extra > 0) {
    const x = 690 + 14 * moved,
      y = 330 + 4 * moved;
    lensGlow(x, y, 40, neptuneBlue, 0.6 * extra);
    dot(x, y, 4.5, neptuneBlue);
    c.globalAlpha = extra;
    c.strokeStyle = accent;
    c.lineWidth = 2;
    c.beginPath();
    c.arc(x, y, 24 + 3 * Math.sin(t * 3), 0, tau);
    c.stroke();
    c.globalAlpha = 1;
  }
}
function chart(t: number, g: number) {
  starField(t, g, ease(t, cue('there it was') - 0.2, cue('there it was') + 0.6));
}
function title(t: number) {
  cover(P.voyager, 1.25 + 0.01 * t, 0.5, 0.5);
  c.fillStyle = grad(0, 0, W * 0.7, 0, ['#0d0a1ecc', '#0d0a1e55', '#0d0a1e00']);
  c.fillRect(0, 0, W, H);
  c.globalAlpha = ease(t, 0.3, 1.2);
  text('Mysteries of the Sky', 80, 300, 20, muted, 'left', 'caps');
  c.globalAlpha = ease(t, 0.7, 1.8);
  text('The Planet', 76, 380, 76, ink, 'left', 'title');
  text('Found on Paper', 76, 462, 76, ink, 'left', 'title');
  c.globalAlpha = 1;
}
function photo(name: string, zoom: number, fx: number, fy: number, drift: number) {
  return (t: number) => cover(P[name], zoom + 0.012 * t, fx, fy, drift * t);
}
// A whole planet on a starfield, slowly approaching.
function planetPhoto(name: string, size = 0.86) {
  return (t: number, g: number) => {
    space(g);
    const img = P[name],
      s = ((H * size) / img.height) * (1 + 0.015 * t);
    lensGlow(W / 2, H / 2, H * 0.6, '#5a6fd8', 0.35);
    c.drawImage(img, W / 2 - (img.width * s) / 2, H / 2 - (img.height * s) / 2, img.width * s, img.height * s);
  };
}

// ── Solar-system orbits, top-down, schematic scale (square-root of distance)
const AU = (a: number) => 52 * Math.sqrt(a);
const planets: [string, number, number, string][] = [
  ['Jupiter', 5.2, 11.86, '#e6b98a'],
  ['Saturn', 9.58, 29.46, '#e8d3a0'],
  ['Uranus', 19.2, 84.0, '#9fd8e6'],
  ['Neptune', 30.1, 164.8, neptuneBlue],
];
// Mean longitude (degrees) at 1846.0, approximate.
const L1846: Record<string, number> = { Jupiter: 80, Saturn: 330, Uranus: 335, Neptune: 326 };
function lon(name: string, year: number) {
  const p = planets.find((q) => q[0] === name)!;
  return ((L1846[name] + (360 * (year - 1846)) / p[2]) * Math.PI) / 180;
}
function orbits(year: number, show: string[], cx = 640, cy = 360, s = 1) {
  lensGlow(cx, cy, 70 * s, '#ffd2a8', 0.8);
  dot(cx, cy, 10 * s, '#fff1dc');
  for (const [name, a, , col] of planets) {
    if (!show.includes(name)) continue;
    c.strokeStyle = col + '44';
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(cx, cy, AU(a) * s, 0, tau);
    c.stroke();
    const th = lon(name, year);
    const x = cx + AU(a) * s * Math.cos(th),
      y = cy - AU(a) * s * Math.sin(th);
    lensGlow(x, y, 22 * s, col, 0.6);
    dot(x, y, 6 * s, col);
  }
}
// ── 02 Uranus drifts off its predicted path ──────────────────────────────
function drift(t: number, g: number) {
  space(g);
  const year = mix(1781, 1846, ease(t, 0.5, 14));
  orbits(year, ['Jupiter', 'Saturn', 'Uranus']);
  // A ghost marks where the tables said Uranus should be.
  const off = clamp((year - 1800) / 46);
  const th = lon('Uranus', year) - 0.06 * off * Math.sin((year - 1800) / 9);
  const x = 640 + AU(19.2) * Math.cos(th),
    y = 360 - AU(19.2) * Math.sin(th);
  c.globalAlpha = 0.8;
  c.strokeStyle = '#9fd8e6';
  c.setLineDash([4, 4]);
  c.beginPath();
  c.arc(x, y, 10, 0, tau);
  c.stroke();
  c.setLineDash([]);
  c.globalAlpha = 1;
  text(String(Math.round(year)), 1180, 90, 40, ink, 'right', 'title');
}
// ── 03 Residuals: observed minus predicted, through the decades ──────────
function residuals(t: number, g: number) {
  space(g);
  const x0 = 150,
    x1 = 1130,
    y0 = 380;
  const X = (yr: number) => mix(x0, x1, (yr - 1690) / 160),
    Y = (arcsec: number) => y0 - arcsec * 1.6;
  line([[x0, y0], [x1, y0]], muted + '88', 1.4);
  line([[x0, 120], [x0, 640]], muted + '55', 1.2);
  for (const yr of [1700, 1750, 1800, 1850]) text(String(yr), X(yr), y0 + 290, 18, muted, 'center');
  text('observed − predicted', x0 + 10, 110, 20, muted);
  // Schematic residual curve (Bouvard's fit fails before and after 1821).
  // Fit through 1821: small misfits on either side that keep growing afterwards.
  const curve = (yr: number) => (yr > 1821 ? 0.045 : -0.012) * (yr - 1821) * Math.abs(yr - 1821);
  const end = mix(1690, 1846, ease(t, 0.2, 9));
  const pts = path((u) => [X(mix(1690, end, u)), Y(curve(mix(1690, end, u)))], 200);
  line(pts, grad(x0, 0, x1 - x0, 0, ['#9fd8e6', coral]), 3);
  for (let i = 0; i < 40; i++) {
    const yr = 1690 + i * 4;
    if (yr > end) break;
    dot(X(yr), Y(curve(yr) + 8 * (hash(i) - 0.5)), 3.5, '#e8e4ff');
  }
  const two = ease(t, cue('two arcminutes') - 0.2, cue('two arcminutes') + 0.6);
  if (two > 0) {
    c.globalAlpha = two;
    // Two arcminutes beside the full Moon (30 arcminutes) at the same scale.
    const r = 180,
      mx = 960,
      my = 240;
    lensGlow(mx, my, r * 1.2, '#fff1dc', 0.25);
    c.strokeStyle = '#fff1dc88';
    c.beginPath();
    c.arc(mx, my, r / 2, 0, tau);
    c.stroke();
    line([[mx - r / 2, my + r / 2 + 30], [mx - r / 2 + r / 15, my + r / 2 + 30]], accent, 6);
    text('2′', mx - r / 2 + r / 15 + 14, my + r / 2 + 38, 26, accent);
    text('full Moon', mx, my + 8, 20, muted, 'center');
    c.globalAlpha = 1;
  }
}
// ── 04 Every planet pulls on every other ─────────────────────────────────
function pulls(t: number, g: number) {
  space(g);
  const year = 1820 + t * 0.8;
  orbits(year, ['Jupiter', 'Saturn', 'Uranus']);
  const pos = (n: string, a: number) => {
    const th = lon(n, year);
    return [640 + AU(a) * Math.cos(th), 360 - AU(a) * Math.sin(th)] as [number, number];
  };
  const u = pos('Uranus', 19.2);
  for (const [n, a] of [
    ['Jupiter', 5.2],
    ['Saturn', 9.58],
  ] as const) {
    const p = pos(n, a);
    const k = 0.18;
    line([u, [mix(u[0], p[0], k), mix(u[1], p[1], k)]], '#e8d3a0aa', 2.5);
  }
  line([u, [mix(u[0], 640, 0.3), mix(u[1], 360, 0.3)]], '#fff1dcaa', 3);
  const left = ease(t, cue('still did not fit') - 0.2, cue('still did not fit') + 0.8);
  if (left > 0) {
    lensGlow(u[0], u[1], 60, coral, 0.6 * left);
    c.globalAlpha = left;
    text('?', u[0] + 30, u[1] - 30, 46, coral, 'left', 'title');
    c.globalAlpha = 1;
  }
}
// ── 05 Working backwards: the equation over flowing contours ─────────────
function inverse(t: number) {
  contours(t);
  const terms = ['F', '=', 'G', 'm₁', 'm₂', '/', 'r²'];
  c.font = 'italic 88px Georgia, serif';
  const ws = terms.map((s) => c.measureText(s).width + 24);
  let x = W / 2 - ws.reduce((a, b) => a + b, 0) / 2;
  terms.forEach((s, i) => {
    const a = ease(t, 0.3 + i * 0.3, 0.9 + i * 0.3);
    c.save();
    c.globalAlpha = a;
    c.font = 'italic 88px Georgia, serif';
    c.textAlign = 'center';
    c.fillStyle = s === 'm₂' ? accent : ink;
    c.fillText(s, x + ws[i] / 2, 330);
    c.restore();
    x += ws[i];
  });
  const rev = ease(t, cue('reverse problem') - 0.2, cue('reverse problem') + 0.8);
  c.globalAlpha = rev;
  text('known motion  →  unknown mass, distance, position', W / 2, 470, 28, accent, 'center');
  c.globalAlpha = 1;
}
// ── 21 Uranus speeds up approaching the hidden planet ───────────────────
function tug(t: number, g: number) {
  space(g);
  const year = mix(1800, 1846, ease(t, 0.3, 11));
  orbits(year, ['Uranus', 'Neptune']);
  const th = lon('Uranus', year),
    thn = lon('Neptune', year);
  const u = [640 + AU(19.2) * Math.cos(th), 360 - AU(19.2) * Math.sin(th)];
  const n = [640 + AU(30.1) * Math.cos(thn), 360 - AU(30.1) * Math.sin(thn)];
  line([u as [number, number], [mix(u[0], n[0], 0.5), mix(u[1], n[1], 0.5)]], accent + 'cc', 3);
  // Uranus's speed relative to its own average: faster before conjunction (1822), slower after.
  const ahead = year < 1822 ? 1 : -1;
  const v = 50 + 25 * ahead * Math.exp(-(((year - 1822) / 14) ** 2));
  const tx = -Math.sin(th),
    ty = -Math.cos(th);
  line([u as [number, number], [u[0] + tx * v, u[1] + ty * v]], '#9fd8e6', 3);
  text(year < 1822 ? 'speeding up' : 'slowing down', u[0] + 20, u[1] + 40, 22, '#9fd8e6');
  text(String(Math.round(year)), 1180, 90, 40, ink, 'right', 'title');
}
// ── 06 The prediction on the sky; 07 the search ─────────────────────────
function prediction(t: number, g: number) {
  starField(t, g, 0);
  const x = 690,
    y = 330;
  const on = ease(t, 0.5, 1.5);
  c.globalAlpha = on;
  c.strokeStyle = accent;
  c.setLineDash([8, 8]);
  c.lineDashOffset = -t * 10;
  c.beginPath();
  c.arc(x, y, 60, 0, tau);
  c.stroke();
  c.setLineDash([]);
  text('predicted', x + 70, y - 50, 24, accent);
  text('Capricornus', 90, 640, 30, ink, 'left', 'title');
  c.globalAlpha = 1;
}
function search(t: number, g: number) {
  const found = ease(t, cue('could not find') - 0.2, cue('could not find') + 0.6);
  const moved = ease(t, cue('next night') - 0.2, cue('next night') + 2);
  starField(t, g, found, moved);
  // The chart and the eyepiece agree star by star, until one does not.
  const k = Math.floor(t * 1.6) % 160;
  const sx = 80 + hash(k) * 1120,
    sy = 60 + hash(k + 50) * 600;
  if (found < 0.5) {
    c.strokeStyle = '#e8e4ff88';
    c.strokeRect(sx - 12, sy - 12, 24, 24);
  }
  text('Berlin, 23 September 1846', 90, 640, 30, ink, 'left', 'title');
}
// ── 09 Wrong orbit, right place ─────────────────────────────────────────
function luck(t: number, g: number) {
  space(g);
  const year = mix(1800, 1846, ease(t, 0.3, 10));
  orbits(year, ['Uranus', 'Neptune']);
  const show = ease(t, 0.8, 2);
  // Le Verrier's assumed planet: farther out, roughly the same direction.
  const a = 36.2,
    th = lon('Neptune', year) + 0.05;
  c.globalAlpha = show;
  c.strokeStyle = coral + '88';
  c.setLineDash([6, 8]);
  c.beginPath();
  c.arc(640, 360, AU(a), 0, tau);
  c.stroke();
  c.setLineDash([]);
  const x = 640 + AU(a) * Math.cos(th),
    y = 360 - AU(a) * Math.sin(th);
  dot(x, y, 7, coral);
  text('predicted orbit', x + 14, y - 14, 20, coral);
  c.globalAlpha = 1;
  const thu = lon('Uranus', year);
  const u: [number, number] = [640 + AU(19.2) * Math.cos(thu), 360 - AU(19.2) * Math.sin(thu)];
  const real = lon('Neptune', year);
  const n: [number, number] = [640 + AU(30.1) * Math.cos(real), 360 - AU(30.1) * Math.sin(real)];
  line([u, [mix(u[0], n[0], 0.45), mix(u[1], n[1], 0.45)]], neptuneBlue, 3);
  line([u, [mix(u[0], x, 0.45), mix(u[1], y, 0.45)]], coral + 'cc', 2);
  text(String(Math.round(year)), 1180, 90, 40, ink, 'right', 'title');
}
// ── 10 Galileo's notebook, December 1612 ────────────────────────────────
function galileo(t: number) {
  c.fillStyle = '#efe6d2';
  c.fillRect(0, 0, W, H);
  for (let y = 100; y < H; y += 46) line([[60, y], [W - 60, y]], '#c9b89a55', 1);
  const ink2 = '#3a2a1e';
  const night = Math.min(2, Math.floor(t / 3));
  for (let k = 0; k <= night; k++) {
    const y = 180 + k * 150;
    dot(500, y, 16, ink2);
    [-140, -70, 60, 160].forEach((dx, i) => dot(500 + dx + 6 * Math.sin(k + i), y, 5, ink2));
    // A "star" beside Jupiter that drifts slightly between entries.
    dot(820 + 10 * k, y + 4, 5, '#2b5a9e');
    text(['28 Dec 1612', '2 Jan 1613', '28 Jan 1613'][k], 120, y + 8, 24, ink2, 'left', 'italic');
  }
  c.globalAlpha = ease(t, 6.5, 7.3);
  c.strokeStyle = '#2b5a9e';
  c.beginPath();
  c.arc(840, 480, 30, 0, tau);
  c.stroke();
  c.globalAlpha = 1;
}
// ── 11 Triton orbits backwards; its orbit weighs Neptune ────────────────
function triton(t: number, g: number) {
  space(g);
  const cx = 640,
    cy = 360;
  lensGlow(cx, cy, 200, neptuneBlue, 0.5);
  c.save();
  c.beginPath();
  c.arc(cx, cy, 110, 0, tau);
  c.clip();
  cover(P.voyager, 1, 0.5, 0.5);
  c.restore();
  // Neptune spins one way (arrow), Triton orbits the other way.
  c.strokeStyle = '#9fd8e6';
  c.lineWidth = 2;
  c.beginPath();
  c.ellipse(cx, cy, 300, 90, -0.3, 0, tau);
  c.stroke();
  const a = -t * 0.6;
  const x = cx + 300 * Math.cos(a) * Math.cos(-0.3) - 90 * Math.sin(a) * Math.sin(-0.3),
    y = cy + 300 * Math.cos(a) * Math.sin(-0.3) + 90 * Math.sin(a) * Math.cos(-0.3);
  dot(x, y, 10, '#e8d3c8');
  text('Triton · orbits backwards', 1190, 640, 24, ink, 'right');
  const mass = ease(t, cue('seventeen earth') - 0.3, cue('seventeen earth') + 0.6);
  c.globalAlpha = mass;
  text('≈ 17 Earth masses', 90, 110, 34, accent);
  c.globalAlpha = 1;
}
// ── 13 Mercury's orbit turns; Vulcan was never there ────────────────────
function mercury(t: number, g: number, vulcan = true) {
  space(g);
  const cx = 640,
    cy = 360;
  lensGlow(cx, cy, 120, '#ffd2a8', 0.9);
  dot(cx, cy, 18, '#fff1dc');
  // Exaggerated precession: a rosette of successive orbits.
  const turns = 6,
    shown = ease(t, 0.3, 8) * turns;
  for (let k = 0; k < Math.ceil(shown); k++) {
    const rot = k * 0.25,
      a = Math.min(1, shown - k);
    c.globalAlpha = 0.25 + 0.5 * (k === Math.ceil(shown) - 1 ? 1 : 0.4);
    c.strokeStyle = '#d9c8b8';
    c.lineWidth = 1.6;
    c.beginPath();
    c.ellipse(cx + 40 * Math.cos(rot), cy + 40 * Math.sin(rot), 230, 180, rot, 0, tau * a);
    c.stroke();
  }
  c.globalAlpha = 1;
  const v = vulcan ? ease(t, cue('vulcan') - 0.3, cue('vulcan') + 0.6) : 0;
  if (v > 0) {
    c.globalAlpha = v * (0.6 + 0.4 * Math.sin(t * 3));
    c.strokeStyle = coral;
    c.setLineDash([5, 7]);
    c.beginPath();
    c.arc(cx, cy, 90, 0, tau);
    c.stroke();
    c.setLineDash([]);
    text('Vulcan?', cx + 100, cy - 70, 26, coral);
    c.globalAlpha = 1;
  }
  text('43″ per century', 90, 640, 30, accent);
}
// ── 14 Curved space-time: Mercury's extra turn ──────────────────────────
function einstein(t: number, g: number) {
  space(g);
  const cx = 640,
    cy = 330;
  for (let i = -9; i <= 9; i++) {
    const v = i / 9;
    line(
      path((u) => {
        const x = (u - 0.5) * 2,
          r = Math.hypot(x, v * 0.5);
        const dip = 140 * Math.exp(-(r * r) / 0.08);
        return [cx + x * 520, cy + v * 200 + dip];
      }, 80),
      '#7d86d855',
      1.4,
    );
    line(
      path((u) => {
        const y = (u - 0.5) * 2,
          r = Math.hypot(v, y * 0.5);
        const dip = 140 * Math.exp(-(r * r) / 0.08);
        return [cx + v * 520, cy + y * 200 + dip];
      }, 80),
      '#7d86d833',
      1.2,
    );
  }
  lensGlow(cx, cy + 140, 90, '#ffd2a8', 0.9);
  dot(cx, cy + 140, 14, '#fff1dc');
  const a = t * 0.9;
  dot(cx + 220 * Math.cos(a), cy + 140 + 80 * Math.sin(a), 7, '#d9c8b8');
  c.globalAlpha = ease(t, 0.5, 1.5);
  text('General relativity · 1915', 90, 640, 30, ink, 'left', 'title');
  c.globalAlpha = 1;
}
// ── 15 Finding worlds by their pull today ───────────────────────────────
function wobble(t: number, g: number) {
  space(g);
  const cx = 640,
    cy = 300,
    a = t * 1.2;
  lensGlow(cx + 14 * Math.cos(a + Math.PI), cy + 4 * Math.sin(a + Math.PI), 90, '#ffd2a8', 0.8);
  dot(cx + 14 * Math.cos(a + Math.PI), cy + 4 * Math.sin(a + Math.PI), 22, '#fff1dc');
  dot(cx + 260 * Math.cos(a), cy + 70 * Math.sin(a), 8, neptuneBlue);
  const pts = path((u) => [160 + u * 960, 560 - 50 * Math.sin((u * 4 - t * 0.19) * tau)], 200);
  line(pts, accent, 2.5);
  text('the star’s wobble, measured in its light', 160, 650, 22, muted);
}
// ── 19 Answer: residual → arithmetic → chart → planet ───────────────────
function answer(t: number, g: number) {
  const a = ease(t, cue('work backwards') - 0.3, cue('work backwards') + 0.6),
    b = ease(t, cue('exactly where') - 0.3, cue('exactly where') + 0.6),
    d = ease(t, cue('that is how') - 0.3, cue('that is how') + 1.2);
  if (d > 0.99) return cover(P.voyager, 1.2 + 0.01 * t, 0.5, 0.5);
  if (b > 0) starField(t, g, b);
  else if (a > 0) inverse(t + 4);
  else residuals(t + 9, g);
  if (d > 0) {
    c.globalAlpha = d;
    cover(P.voyager, mix(2, 1.2, d), 0.5, 0.5);
    c.globalAlpha = 1;
  }
}
function credits(t: number) {
  cover(P.webb, 1.1 + 0.01 * t, 0.5, 0.5);
  c.fillStyle = grad(0, 0, W * 0.75, 0, ['#0d0a1ee6', '#0d0a1e99', '#0d0a1e00']);
  c.fillRect(0, 0, W, H);
  const rows = [
    'Neptune and Triton images · NASA / JPL, Voyager 2',
    'Webb image · NASA, ESA, CSA, STScI · CC BY 4.0',
    'Portraits · public domain · Wikimedia Commons',
    'Orbits, residuals and sky charts are schematic',
  ];
  text('The Planet Found on Paper', 80, 200, 46, ink, 'left', 'title');
  rows.forEach((r, i) => {
    c.globalAlpha = ease(t, 0.5 + i * 0.4, 1.2 + i * 0.4);
    text(r, 82, 280 + i * 44, 22, muted);
  });
  c.globalAlpha = 1;
  text('Mysteries of the Sky', 82, 520, 20, lilac, 'left', 'caps');
}
// ── 17 A transit instrument: a star crosses the wire; clock and circle give its place
function transitWire(t: number, g: number) {
  space(g);
  const cx = 440,
    cy = 360,
    r = 230;
  c.save();
  c.beginPath();
  c.arc(cx, cy, r, 0, tau);
  c.clip();
  c.fillStyle = grad(cx - r, cy - r, 2 * r, 2 * r, ['#0b0a1d', '#141233']);
  c.fillRect(cx - r, cy - r, 2 * r, 2 * r);
  for (let i = 0; i < 40; i++) dot(cx - r + hash(i) * 2 * r, cy - r + hash(i + 9) * 2 * r, 1.2, '#e8e4ff88');
  line([[cx, cy - r], [cx, cy + r]], '#e8e4ffcc', 1.5);
  line([[cx - r, cy], [cx + r, cy]], '#e8e4ff55', 1);
  const f = (t * 0.12) % 1,
    sx = cx - r + 2 * r * f;
  lensGlow(sx, cy - 30, 30, '#9fd8e6', 0.7);
  dot(sx, cy - 30, 5, '#9fd8e6');
  c.restore();
  c.strokeStyle = '#c9b6e6';
  c.lineWidth = 3;
  c.beginPath();
  c.arc(cx, cy, r, 0, tau);
  c.stroke();
  // Clock and circle readings; the crossing time freezes when the star meets the wire.
  const crossing = Math.abs(sx - cx) < 4;
  const secs = 21 * 60 + 14 + t * 1.0;
  const hms = (v: number) => `${String(Math.floor(v / 3600) % 24).padStart(2, '0')}h ${String(Math.floor(v / 60) % 60).padStart(2, '0')}m ${(v % 60).toFixed(1).padStart(4, '0')}s`;
  text(hms(secs), 760, 300, 40, crossing ? accent : ink, 'left');
  text('altitude 31° 14′ 08″', 760, 360, 30, muted, 'left');
  const rows = ['1843  ·  Greenwich', '1844  ·  Paris', '1845  ·  Berlin', '1845  ·  Cambridge'];
  rows.forEach((row, i) => {
    c.globalAlpha = ease(t, cue('ledger') + i * 0.4, cue('ledger') + i * 0.4 + 0.6);
    text(row, 760, 440 + i * 36, 22, muted, 'left');
  });
  c.globalAlpha = 1;
}
// ── 18 Rings found by a flickering star; one Neptunian year
function occult(t: number, g: number) {
  space(g);
  const cx = 520,
    cy = 330;
  lensGlow(cx, cy, 160, neptuneBlue, 0.5);
  c.save();
  c.beginPath();
  c.arc(cx, cy, 110, 0, tau);
  c.clip();
  cover(P.voyager, 1, 0.5, 0.5);
  c.restore();
  c.strokeStyle = '#c9c6ff66';
  for (const k of [1.6, 1.9, 2.3]) {
    c.beginPath();
    c.ellipse(cx, cy, 110 * k, 32 * k, -0.2, 0, tau);
    c.stroke();
  }
  const sx = mix(60, 1220, (t * 0.07) % 1),
    sy = cy + 40;
  const inRing = [1.6, 1.9, 2.3].some((k) => Math.abs(Math.abs(sx - cx) - 110 * k) < 10);
  dot(sx, sy, inRing ? 2 : 4, '#fff1dc');
  lensGlow(sx, sy, 20, '#fff1dc', inRing ? 0.1 : 0.6);
  const pts = path((u) => {
    const x = mix(60, 1220, u),
      dip = [1.6, 1.9, 2.3].some((k) => Math.abs(Math.abs(x - cx) - 110 * k) < 10) ? 40 : 0;
    return [x, 640 - (x < sx ? 60 - dip : 60)];
  }, 400);
  line(pts.filter((p) => p[0] <= sx), '#fff1dc', 2);
  text('starlight', 60, 560, 20, muted);
}
function orbitLoop(t: number, g: number) {
  space(g);
  const f = ease(t, 0.3, 7);
  const year = mix(1846, 2011, f);
  lensGlow(640, 360, 60, '#ffd2a8', 0.8);
  dot(640, 360, 9, '#fff1dc');
  const R = 260,
    th0 = (L1846.Neptune * Math.PI) / 180;
  line(path((u) => [640 + R * Math.cos(th0 + u * tau * f), 360 - R * Math.sin(th0 + u * tau * f)], 200), neptuneBlue, 3);
  const x = 640 + R * Math.cos(th0 + tau * f),
    y = 360 - R * Math.sin(th0 + tau * f);
  lensGlow(x, y, 26, neptuneBlue, 0.7);
  dot(x, y, 8, neptuneBlue);
  text(String(Math.round(year)), 1180, 90, 44, ink, 'right', 'title');
  if (f > 0.98) text('one Neptunian year', 640, 680, 26, accent, 'center');
}
void wave;
void oxygen;
void blush;
void gradedPlanet;
void hud;

const scenes: Record<string, (t: number, g: number) => void> = {
  leverrier: (t) => plate(t, 'leverrier', 'Paris, 1846', 'Urbain Le Verrier', 'voyager'),
  herschel: (t) => plate(t, 'herschel', 'Bath, 1781', 'William Herschel', 'uranus'),
  galle: (t) => plate(t, 'galle', 'Berlin, 1846', 'Johann Galle', 'voyager'),
  adams: (t) => plate(t, 'adams', 'Cambridge, 1845', 'John Couch Adams', 'webb'),
  chart,
  title: (t) => title(t),
  neptune: planetPhoto('voyager', 0.92),
  spot: photo('spot', 1.1, 0.5, 0.45, 3),
  tritonPhoto: planetPhoto('triton', 0.8),
  uranus: planetPhoto('uranus', 0.86),
  webb: photo('webb', 1.1, 0.5, 0.55, -2),
  drift,
  residuals,
  pulls,
  inverse: (t) => inverse(t),
  tug,
  prediction,
  search,
  luck,
  galileo: (t) => galileo(t),
  triton,
  mercury: (t, g) => mercury(t, g, true),
  mercuryPlain: (t, g) => mercury(t + 8, g, false),
  einstein,
  wobble,
  answer,
  transitWire,
  occult,
  orbitLoop,
  credits: (t) => credits(t),
};
// Rowan's interview lines play over the matching diagram with his name.
for (const [key, base] of [
  ['rowanTug', 'tug'],
  ['rowanLuck', 'luck'],
  ['rowanTwo', 'mercuryPlain'],
] as const) {
  scenes[key] = (t, g) => {
    scenes[base](t, g);
    const a = ease(t, 0.2, 0.8) * (1 - ease(t, 4.5, 5.2));
    hud(() => {
      const scrim = c.createRadialGradient(W / 2, 690, 10, W / 2, 690, 320);
      scrim.addColorStop(0, '#0d0a1ed0');
      scrim.addColorStop(1, '#0d0a1e00');
      c.globalAlpha = a;
      c.fillStyle = scrim;
      c.fillRect(W / 2 - 340, 600, 680, 120);
      text('Professor Rowan Ellery', W / 2, 700, 28, ink, 'center', 'title');
      c.globalAlpha = 1;
    });
  };
}
arriveByMosaic(['chart', 'title', 'neptune', 'webb']);
lockCamera(['leverrier', 'herschel', 'galle', 'adams']);
cutTo(['spot', 'webb', 'galileo']);
Object.assign(window, { neptuneFrame: episodeFrame(scenes) });
