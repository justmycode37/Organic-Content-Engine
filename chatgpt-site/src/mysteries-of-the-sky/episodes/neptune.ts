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
  continuous,
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
const neptuneBlue = '#9aa6f0';

// ── Cream plates: a portrait among tiles of the sky, as in the reference opening
function plate(t: number, who: string, place: string, name: string, tileSrc: string, side = 0.62) {
  c.fillStyle = cream;
  c.fillRect(0, 0, W, H);
  for (let x = 0; x <= W; x += W / 24) line([[x, 0], [x, H]], '#b9b0a230', 1);
  for (let y = 0; y <= H; y += W / 24) line([[0, y], [W, y]], '#b9b0a230', 1);
  const set = tiles(16, who.length * 31 + 7);
  const fill = ease(t, 0.2, 3.5) * 0.45 + ease(t, 4, 16) * 0.3;
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
    z = 1 + 0.14 * ease(t, 0, 16);
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
    c.save();
    c.globalCompositeOperation = 'lighten';
    c.drawImage(img, W / 2 - (img.width * s) / 2, H / 2 - (img.height * s) / 2, img.width * s, img.height * s);
    c.restore();
    if (name === 'uranus') {
      // Where the tables said Uranus should be, slowly parting from where it is.
      const w0 = at('would not stay'),
        k = Number.isFinite(w0) ? ease(t, w0 - 0.3, w0 + 3) : 0;
      if (k > 0) {
        const r = (img.height * s) / 2,
          ox = W / 2 + 70 * k,
          oy = H / 2 - 24 * k;
        c.globalAlpha = k;
        c.strokeStyle = coral;
        c.lineWidth = 2;
        c.setLineDash([8, 8]);
        c.lineDashOffset = -t * 8;
        c.beginPath();
        c.arc(ox, oy, r, 0, tau);
        c.stroke();
        c.setLineDash([]);
        text('predicted', ox + r * 0.75, oy - r * 0.8, 22, coral);
        c.globalAlpha = 1;
      }
    }
    if (name === 'triton') {
      // Dark plumes thought to be driven by nitrogen gas.
      const g0 = at('geysers'),
        on = Number.isFinite(g0) ? ease(t, g0 - 0.3, g0 + 1) : 0;
      for (let k = 0; k < 6; k++) {
        const x = W / 2 - 120 + k * 46,
          y = H / 2 + 60 + 20 * hash(k);
        c.globalAlpha = on * 0.25;
        lensGlow(x + 12, y - 30 - 10 * Math.sin(t * 0.7 + k), 22, '#2a1d3a', 0.9);
      }
      c.globalAlpha = 1;
    }
  };
}

// ── Solar-system orbits, top-down, schematic scale (square-root of distance)
const AU = (a: number) => 60 * Math.sqrt(a);
const planets: [string, number, number, string][] = [
  ['Jupiter', 5.2, 11.86, '#e6b98a'],
  ['Saturn', 9.58, 29.46, '#e8d3a0'],
  ['Uranus', 19.2, 84.0, '#c9b6ff'],
  ['Neptune', 30.1, 164.8, neptuneBlue],
];
// Mean longitude (degrees) at 1846.0, approximate.
const L1846: Record<string, number> = { Jupiter: 80, Saturn: 330, Uranus: 335, Neptune: 326 };
function lonRaw(name: string, year: number) {
  const p = planets.find((q) => q[0] === name)!;
  return ((L1846[name] + (360 * (year - 1846)) / p[2]) * Math.PI) / 180;
}
function lon(name: string, year: number) {
  return lonRaw(name, year) + spin;
}
function orbits(year: number, show: string[], cx = 640, cy = 360, s = 1, inward: string[] = []) {
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
    lensGlow(x, y, 30 * s, col, 0.6);
    oxygen(x, y, 8 * s, 0, 1);
    c.save();
    c.globalCompositeOperation = 'color';
    dot(x, y, 8 * s, col);
    c.restore();
    if (inward.includes(name)) text(name, x - 52 * Math.cos(th), y + 52 * Math.sin(th) + 6, 20, muted, 'center');
    else text(name, x + 14, y - 12, 20, muted);
  }
}
// The whole system is turned so the 1820s conjunction sits on the right, mid-frame.
const spin = -((L1846.Neptune - 30) * Math.PI) / 180 + Math.PI / 12;
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
  c.strokeStyle = '#c9b6ff';
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
    Y = (arcsec: number) => y0 - Math.max(-140, Math.min(140, arcsec * 0.55));
  line([[x0, y0], [x1, y0]], muted + '88', 1.4);
  line([[x0, 120], [x0, 640]], muted + '55', 1.2);
  for (const yr of [1700, 1750, 1800, 1850]) text(String(yr), X(yr), y0 + 290, 18, muted, 'center');
  text('observed − predicted', x0 + 10, 110, 20, muted);
  // Schematic residual curve (Bouvard's fit fails before and after 1821).
  // Fit through 1821: small misfits on either side that keep growing afterwards.
  const curve = (yr: number) => (yr > 1821 ? 0.045 : -0.012) * (yr - 1821) * Math.abs(yr - 1821);
  const end = mix(1690, 1846, ease(t, 0.2, 9));
  const pts = path((u) => [X(mix(1690, end, u)), Y(curve(mix(1690, end, u)))], 200);
  line(pts, grad(x0, 0, x1 - x0, 0, ['#c9b6ff', coral]), 3);
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
  const year = 1820 + t * 0.3,
    cx = 450;
  orbits(year, ['Jupiter', 'Saturn', 'Uranus'], cx);
  const pos = (n: string, a: number) => {
    const th = lon(n, year);
    return [cx + AU(a) * Math.cos(th), 360 - AU(a) * Math.sin(th)] as [number, number];
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
  line([u, [mix(u[0], cx, 0.3), mix(u[1], 360, 0.3)]], '#fff1dcaa', 3);
  // Jupiter and Saturn nudge each other in a slow rhythm.
  const js = ease(t, cue('jupiter and saturn') - 0.2, cue('jupiter and saturn') + 0.6) * (1 - ease(t, cue('when they added') - 0.2, cue('when they added') + 0.6));
  if (js > 0) {
    const j = pos('Jupiter', 5.2),
      s = pos('Saturn', 9.58),
      beat = 0.5 + 0.5 * Math.sin(t * 2.2);
    c.globalAlpha = js;
    line([j, s], '#e8d3a0', 1.5 + 2 * beat);
    lensGlow((j[0] + s[0]) / 2, (j[1] + s[1]) / 2, 40, '#e8d3a0', 0.4 * beat);
    text('Jupiter ⇄ Saturn', 860, 600, 24, '#e8d3a0');
    c.globalAlpha = 1;
  }
  const cards: [string, string][] = [
    ['maybe the observations', 'bad observations?'],
    ['maybe gravity', 'different gravity far out?'],
    ['or maybe something', 'something unseen pulling?'],
  ];
  cards.forEach(([ph, label], i) => {
    const a = ease(t, cue(ph) - 0.2, cue(ph) + 0.5);
    if (a <= 0) return;
    c.globalAlpha = a * (i === 2 ? 1 : 0.75);
    c.fillStyle = grad(820, 120 + i * 90, 400, 0, ['#2a2050cc', '#1a143800']);
    c.fillRect(820, 120 + i * 90, 400, 66);
    text(label, 840, 162 + i * 90, 24, i === 2 ? coral : ink);
    c.globalAlpha = 1;
  });
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
    c.fillStyle = s === 'm₂' ? coral : ink;
    c.fillText(s, x + ws[i] / 2, 330);
    c.restore();
    x += ws[i];
  });
  const rev = ease(t, cue('reverse problem') - 0.2, cue('reverse problem') + 0.8);
  c.globalAlpha = rev;
  text('known motion  →  unknown mass, distance, position', W / 2, 470, 28, ink, 'center');
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
  line([u as [number, number], [u[0] + tx * v, u[1] + ty * v]], '#c9b6ff', 3);
  text(year < 1822 ? 'speeding up' : 'slowing down', u[0] + 20, u[1] + 40, 22, '#c9b6ff');
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
  text('predicted', x + 70, y - 50, 24, ink);
  // Le Verrier's letter: about five degrees east of delta Capricorni.
  const delta = ease(t, cue('delta') - 0.3, cue('delta') + 0.8);
  if (delta > 0) {
    c.globalAlpha = delta;
    lensGlow(x - 300, y + 40, 30, '#fff1dc', 0.6);
    dot(x - 300, y + 40, 5, '#fff1dc');
    text('δ Capricorni', x - 300, y + 80, 22, muted, 'center');
    line([[x - 285, y + 34], [x - 60, y + 4]], '#ffffff55', 1.5);
    text('≈ 5° east', x - 170, y + 2, 22, ink, 'center');
    c.globalAlpha = 1;
  }
  for (let i = 0; i < 30; i++) {
    const f = (t * 0.04 + hash(i)) % 1;
    c.globalAlpha = 0.3 * Math.sin(Math.PI * f);
    dot(80 + hash(i + 3) * 1120 - 40 * f, 60 + hash(i + 7) * 600, 1.2, '#e8e4ff');
  }
  c.globalAlpha = 1;
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
  const year = mix(1800, 1846, ease(t, 0.5, 26));
  orbits(year, ['Uranus', 'Neptune'], 640, 360, 1, ['Neptune']);
  const show = ease(t, 0.8, 2);
  // The strongest clues came while the two planets were closest (about 1815–1830).
  const near = Math.exp(-(((year - 1822) / 7) ** 2));
  const said = ease(t, cue('strongest clues') - 0.3, cue('strongest clues') + 0.6);
  if (near > 0.05) {
    lensGlow(640 + AU(24) * Math.cos(lon('Uranus', year)), 360 - AU(24) * Math.sin(lon('Uranus', year)), 120, '#c9b6ff', 0.35 * near);
  }
  if (said > 0) {
    c.globalAlpha = said;
    text('closest approach · the clues are strongest', 90, 96, 28, ink);
    c.globalAlpha = 1;
  }
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
  // Label outside the orbit, along the radius, so it never sits on Neptune's own label.
  text('predicted orbit', x + 56 * Math.cos(th), y - 56 * Math.sin(th) + 6, 20, coral, 'center');
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
  const night = Math.min(2, Math.floor(t / 4));
  for (let k = 0; k <= night; k++) {
    const y = 180 + k * 150;
    dot(500, y, 16, ink2);
    [[-150, -60, 70, 150], [-90, 40, 110, 200], [-180, -40, 30, 130]][k].forEach((dx) => dot(500 + dx, y, 5, ink2));
    // A "star" beside Jupiter that drifts slightly between entries.
    dot(820 + (k === 2 ? 26 : 10 * k), y + 4, 6, '#2b5a9e');
    if (k === 2) line([[836, y + 26], [846, y + 26]], '#2b5a9e', 2);
    text(['28 Dec 1612', '27 Jan 1613', '28 Jan 1613'][k], 120, y + 8, 24, ink2, 'left', 'italic');
  }
  // "One entry even suggests he noticed it had moved": last night's place as a
  // ghost, and the step between them.
  const moved = ease(t, cue('even suggests') - 0.2, cue('even suggests') + 0.8);
  c.globalAlpha = moved;
  c.strokeStyle = '#2b5a9e';
  c.lineWidth = 2;
  c.beginPath();
  c.arc(846, 484, 30 + 2 * Math.sin(t * 2.5), 0, tau);
  c.stroke();
  c.setLineDash([3, 4]);
  c.beginPath();
  c.arc(830, 484, 6, 0, tau);
  c.stroke();
  c.setLineDash([]);
  line([[830, 512], [846, 512]], '#2b5a9e', 2);
  text('moved', 846, 540, 22, '#2b5a9e', 'center', 'italic');
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
  // Terminator shading so the disk reads as a globe.
  const sh = c.createRadialGradient(cx - 40, cy - 40, 20, cx, cy, 120);
  sh.addColorStop(0, '#0d0a1e00');
  sh.addColorStop(0.7, '#0d0a1e33');
  sh.addColorStop(1, '#0d0a1ecc');
  c.fillStyle = sh;
  c.fillRect(cx - 120, cy - 120, 240, 240);
  c.restore();
  // Neptune spins one way (arrow), Triton orbits the other way.
  c.strokeStyle = '#c9b6ff';
  c.lineWidth = 2;
  c.beginPath();
  c.ellipse(cx, cy, 300, 90, -0.3, 0, tau);
  c.stroke();
  const a = -t * 0.6;
  const x = cx + 300 * Math.cos(a) * Math.cos(-0.3) - 90 * Math.sin(a) * Math.sin(-0.3),
    y = cy + 300 * Math.cos(a) * Math.sin(-0.3) + 90 * Math.sin(a) * Math.cos(-0.3);
  dot(x, y, 10, '#e8d3c8');
  const back = ease(t, cue('orbits backwards') - 0.3, cue('orbits backwards') + 0.6);
  c.globalAlpha = back;
  text('Triton · orbits backwards', 1190, 640, 24, ink, 'right');
  // Neptune's spin (lilac) against Triton's orbit (coral).
  line(path((u) => [cx + 150 * Math.cos(-1.2 + u * 1.2), cy - 150 * Math.sin(-1.2 + u * 1.2) * 0.35 - 130], 30), '#c9b6ff', 3);
  text('spin', cx + 160, cy - 150, 20, '#c9b6ff');
  text('orbit', cx - 320, cy - 40, 20, coral);
  c.globalAlpha = 1;
  const mass = ease(t, cue('17 earth') - 0.3, cue('17 earth') + 0.6);
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
  // Exaggerated precession: a rosette of successive orbits, still turning.
  const turns = 6,
    shown = ease(t, 0.3, 8) * turns,
    drift = 0.012 * t;
  for (let k = 0; k < Math.ceil(shown); k++) {
    const rot = k * 0.25 + drift,
      a = Math.min(1, shown - k);
    c.globalAlpha = 0.25 + 0.5 * (k === Math.ceil(shown) - 1 ? 1 : 0.4);
    c.strokeStyle = '#d9c8b8';
    c.lineWidth = 1.6;
    c.beginPath();
    c.ellipse(cx + 40 * Math.cos(rot), cy + 40 * Math.sin(rot), 230, 180, rot, 0, tau * a);
    c.stroke();
  }
  c.globalAlpha = 1;
  // Mercury itself, running round the newest orbit.
  {
    const k = Math.max(0, Math.ceil(shown) - 1),
      rot = k * 0.25 + drift,
      m = t * 1.4;
    const ex = 230 * Math.cos(m),
      ey = 180 * Math.sin(m);
    const mx = cx + 40 * Math.cos(rot) + ex * Math.cos(rot) - ey * Math.sin(rot),
      my = cy + 40 * Math.sin(rot) + ex * Math.sin(rot) + ey * Math.cos(rot);
    lensGlow(mx, my, 22, '#d9c8b8', 0.6 * ease(t, 0.3, 1));
    dot(mx, my, 6, '#e8ded4');
  }
  const gone = ease(t, cue('wasnt there') - 0.2, cue('wasnt there') + 1.2);
  const v = vulcan ? ease(t, cue('vulcan') - 0.3, cue('vulcan') + 0.6) * (1 - 0.85 * gone) : 0;
  if (v > 0) {
    c.globalAlpha = v;
    c.strokeStyle = coral;
    c.lineWidth = 2.5;
    c.setLineDash([5, 7]);
    c.beginPath();
    c.arc(cx, cy, 90, 0, tau);
    c.stroke();
    c.setLineDash([]);
    text('Vulcan?', cx + 100, cy - 70, 26, coral);
    c.globalAlpha = 1;
    const claim = clamp((t - cue('claimed') ) / 3);
    if (claim > 0 && claim < 1) {
      c.globalAlpha = Math.sin(Math.PI * claim);
      dot(cx - 20 + 40 * claim, cy - 4, 4, '#1a1328');
      c.globalAlpha = 1;
    }
  }
  c.globalAlpha = ease(t, cue('fortythree') - 0.2, cue('fortythree') + 0.6);
  text('43″ per century', 90, 640, 30, accent);
  c.globalAlpha = 1;
  text('precession exaggerated', 1190, 640, 20, muted, 'right');
}
// ── 23 Same evidence, two lessons: a missing planet, a missing theory ─────
function contrast(t: number, g: number) {
  space(g);
  const year = 1815 + t * 0.6;
  // Left: Uranus pulled by Neptune.
  const lc = 330,
    s = 0.62;
  lensGlow(lc, 340, 50, '#ffd2a8', 0.7);
  dot(lc, 340, 7, '#fff1dc');
  for (const [name, a, , col] of planets) {
    if (name !== 'Uranus' && name !== 'Neptune') continue;
    c.strokeStyle = col + '44';
    c.lineWidth = 1.2;
    c.beginPath();
    c.arc(lc, 340, AU(a) * s, 0, tau);
    c.stroke();
    const th = lon(name, year);
    const x = lc + AU(a) * s * Math.cos(th),
      y = 340 - AU(a) * s * Math.sin(th);
    lensGlow(x, y, 22, col, 0.6);
    dot(x, y, 6, col);
  }
  // Right: Mercury's orbit turning in a dip of curved space.
  const rc = 950;
  for (let i = -5; i <= 5; i++) {
    const v = i / 5;
    line(path((u) => {
      const x = (u - 0.5) * 2;
      return [rc + x * 240, 340 + v * 120 + 70 * Math.exp(-(x * x + v * v) / 0.12)];
    }, 50), '#7d86d844', 1.1);
  }
  lensGlow(rc, 410, 50, '#ffd2a8', 0.8);
  dot(rc, 410, 8, '#fff1dc');
  for (let k = 0; k < 4; k++) {
    const rot = k * 0.3 + 0.02 * t;
    c.strokeStyle = k === 3 ? '#e8ded4' : '#d9c8b855';
    c.lineWidth = 1.4;
    c.beginPath();
    c.ellipse(rc + 14 * Math.cos(rot), 410, 120, 40, rot * 0.25, 0, tau);
    c.stroke();
  }
  const l = ease(t, cue('with uranus') - 0.2, cue('with uranus') + 0.6),
    r = ease(t, cue('with mercury') - 0.2, cue('with mercury') + 0.6);
  c.globalAlpha = 0.4 + 0.6 * l;
  text('Uranus', lc, 110, 30, ink, 'center', 'title');
  c.globalAlpha = l;
  text('missing piece: a planet', lc, 560, 24, neptuneBlue, 'center');
  c.globalAlpha = 0.4 + 0.6 * r;
  text('Mercury', rc, 110, 30, ink, 'center', 'title');
  c.globalAlpha = r;
  text('missing piece: a better theory of gravity', rc, 560, 24, coral, 'center');
  c.globalAlpha = 1;
  line([[640, 140], [640, 520]], '#ffffff22', 1);
}
// ── 14 Curved space-time: Mercury's extra turn ──────────────────────────
function einstein(t: number, g: number) {
  space(g);
  // A full-frame sheet of space-time seen in perspective, sagging into a well
  // around the Sun; the camera circles slowly.
  const cam = 0.25 + 0.035 * t,
    depth = (r: number) => 1.6 * Math.exp(-(r * r) / 1.8) + 0.25 / (0.6 + r * r);
  const project = (x: number, z: number, y = -depth(Math.hypot(x, z))): [number, number, number] => {
    const xr = x * Math.cos(cam) - z * Math.sin(cam),
      zr = Math.max(0.9, x * Math.sin(cam) + z * Math.cos(cam) + 8);
    const yc = 4 - y; // camera above the sheet
    return [640 + (xr * 820) / zr, -60 + (yc * 820) / zr, zr];
  };
  const N = 22,
    span = 4.5;
  for (let i = 0; i <= N; i++) {
    const v = -span + (2 * span * i) / N;
    for (const along of [true, false]) {
      const pts = path((u) => {
        const w = -span + 2 * span * u;
        const p = along ? project(w, v) : project(v, w);
        return [p[0], p[1]];
      }, 90);
      const near = 1 - Math.abs(v) / span;
      line(pts, `rgba(125,134,216,${(0.12 + 0.35 * near).toFixed(2)})`, 1 + 0.6 * near);
    }
  }
  const sun = project(0, 0, -depth(0) + 0.25);
  lensGlow(sun[0], sun[1], 120, '#ffd2a8', 0.9);
  dot(sun[0], sun[1], 16, '#fff1dc');
  // Mercury on a slowly turning ellipse inside the well; faint trails of earlier turns.
  const orbitAt = (u: number, turn: number) => {
    const a = 2.1,
      e = 0.35,
      th = u * tau;
    const r = (a * (1 - e * e)) / (1 + e * Math.cos(th));
    const x = r * Math.cos(th + turn),
      z = r * Math.sin(th + turn);
    return project(x, z, -depth(Math.hypot(x, z)) + 0.12);
  };
  const turn = 0.06 * t;
  for (let k = 3; k >= 0; k--) {
    const tk = turn - k * 0.22;
    line(
      path((u) => {
        const p = orbitAt(u, tk);
        return [p[0], p[1]];
      }, 120),
      k === 0 ? '#e8ded4cc' : `rgba(217,200,184,${(0.32 - k * 0.07).toFixed(2)})`,
      k === 0 ? 2 : 1.2,
    );
  }
  const m = orbitAt((t * 0.22) % 1, turn);
  lensGlow(m[0], m[1], 26, '#e8ded4', 0.7);
  dot(m[0], m[1], 7, '#e8ded4');
  // Perihelion marker advancing with each turn.
  const peri = orbitAt(0, turn);
  c.globalAlpha = ease(t, cue('43') - 0.3, cue('43') + 0.6);
  lensGlow(peri[0], peri[1], 30, accent, 0.6);
  text('+43″ per century', peri[0] + 24, peri[1] - 18, 24, accent);
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
  const e = ease(t, cue('the same kind') - 0.3, cue('the same kind') + 0.8);
  if (e > 0.99) return einstein(t, g);
  if (d > 0.99) {
    cover(P.voyager, 1.2 + 0.01 * t, 0.5, 0.5);
    if (e > 0) {
      c.globalAlpha = e;
      einstein(t, g);
      c.globalAlpha = 1;
    }
    return;
  }
  if (b > 0) starField(t, g, b);
  else if (a > 0) inverse(t + 4);
  else {
    // Watch a planet for a long time, then take the leftover error seriously.
    const lo = cue('leftover error');
    if (t < lo - 0.3) drift(t, g);
    else residuals(t - lo + 1, g);
  }
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
  lensGlow(sx, cy - 30, 30, '#c9b6ff', 0.7);
  dot(sx, cy - 30, 5, '#c9b6ff');
  c.restore();
  c.strokeStyle = '#c9b6e6';
  c.lineWidth = 3;
  c.beginPath();
  c.arc(cx, cy, r, 0, tau);
  c.stroke();
  // Clock and circle readings; the crossing time freezes when the star meets the wire.
  const crossing = Math.abs(sx - cx) < 4;
  const secs = 21 * 3600 + 14 * 60 + Math.min(t, 8.3);
  const hms = (v: number) => `${String(Math.floor(v / 3600) % 24).padStart(2, '0')}h ${String(Math.floor(v / 60) % 60).padStart(2, '0')}m ${(v % 60).toFixed(1).padStart(4, '0')}s`;
  text(hms(secs), 760, 300, 40, t > 8.3 ? accent : ink, 'left');
  // The graduated circle: a scale sweeps to the object's height.
  const gc = ease(t, cue('graduated circle') - 0.3, cue('graduated circle') + 0.6) * (1 - ease(t, cue('bending') - 1, cue('bending') - 0.2));
  if (gc > 0) {
    c.globalAlpha = gc;
    const ox = 760,
      oy = 600,
      R = 150,
      alt = (31.2 * Math.PI) / 180;
    c.strokeStyle = '#c9b6e6aa';
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(ox, oy, R, -Math.PI / 2, 0);
    c.stroke();
    for (let d = 0; d <= 90; d += 5) {
      const a = (d * Math.PI) / 180,
        l = d % 30 === 0 ? 14 : 7;
      line([[ox + R * Math.cos(a), oy - R * Math.sin(a)], [ox + (R - l) * Math.cos(a), oy - (R - l) * Math.sin(a)]], '#c9b6e6aa', 1.2);
    }
    const sweep = alt * ease(t, cue('graduated circle'), cue('graduated circle') + 2);
    line([[ox, oy], [ox + (R + 10) * Math.cos(sweep), oy - (R + 10) * Math.sin(sweep)]], '#e8e4ff', 2);
    line([[ox, oy], [ox + R + 20, oy]], '#ffffff44', 1);
    c.globalAlpha = 1;
  }
  c.globalAlpha = ease(t, cue('height in the sky') - 0.2, cue('height in the sky') + 0.6);
  text('altitude 31° 14′ 08″', 760, 360, 30, accent, 'left');
  c.globalAlpha = 1;
  // Starlight bends slightly on its way down through the atmosphere.
  const bend = ease(t, cue('bending') - 0.3, cue('bending') + 0.8);
  if (bend > 0) {
    c.globalAlpha = bend;
    const bx = 1000,
      by = 600;
    c.fillStyle = grad(0, by - 60, 0, 120, ['#7a6fc000', '#7a6fc066']);
    c.fillRect(bx - 140, by - 60, 280, 120);
    line([[bx - 130, by - 160], [bx - 40, by - 40], [bx + 20, by + 50]], '#fff1dc', 2);
    line([[bx - 40, by - 40], [bx + 40, by + 70]], '#fff1dc44', 1.5);
    text('refraction', bx + 60, by - 70, 20, muted);
    c.globalAlpha = 1;
  }
  const rows = ['1843  ·  Greenwich', '1844  ·  Paris', '1845  ·  Berlin', '1845  ·  Cambridge'].slice(0, 2);
  rows.forEach((row, i) => {
    c.globalAlpha = ease(t, cue('ledger') + i * 0.4, cue('ledger') + i * 0.4 + 0.6);
    text(row, 760, 170 + i * 36, 22, muted, 'left');
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
  // Bright clumps along the outermost ring.
  const clumps = ease(t, cue('bright clumps') - 0.2, cue('bright clumps') + 0.8);
  if (clumps > 0) {
    c.globalAlpha = clumps;
    for (let k = 0; k < 4; k++) {
      const a = 0.9 + k * 0.16 + 0.02 * t;
      const x = cx + 110 * 2.3 * Math.cos(a) * Math.cos(-0.2) - 32 * 2.3 * Math.sin(a) * Math.sin(-0.2),
        y = cy + 110 * 2.3 * Math.cos(a) * Math.sin(-0.2) + 32 * 2.3 * Math.sin(a) * Math.cos(-0.2);
      lensGlow(x, y, 18, '#e8e4ff', 0.7);
      dot(x, y, 3, '#fff');
    }
    text('ring arcs', cx + 200, cy + 110, 20, muted);
    c.globalAlpha = 1;
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
  // The 1846 position stays marked; the planet arrives back at it.
  const x0 = 640 + R * Math.cos(th0),
    y0 = 360 - R * Math.sin(th0);
  c.strokeStyle = '#ffffff66';
  c.setLineDash([5, 6]);
  c.lineDashOffset = -t * 6;
  c.beginPath();
  c.arc(x0, y0, 22 + 3 * Math.sin(t * 2), 0, tau);
  c.stroke();
  c.setLineDash([]);
  text('1846', x0 + 30, y0 + 6, 20, muted);
  const done = ease(t, 7, 8);
  if (done > 0) {
    c.globalAlpha = done;
    lensGlow(x0, y0, 60 + 10 * Math.sin(t * 1.5), neptuneBlue, 0.5);
    text('one Neptunian year', 640, 680, 26, ink, 'center');
    c.globalAlpha = 1;
  }
}
void wave;
void oxygen;
void blush;
void gradedPlanet;
void hud;

// ── 02 Night after night, the new object steps across the stars ──────────
function steps(t: number, g: number) {
  starField(t, g, 0);
  for (let k = 0; k < 6; k++) {
    const a = ease(t, 0.3 + k * 0.9, 0.8 + k * 0.9);
    if (a <= 0) continue;
    const x = 420 + k * 70,
      y = 300 + k * 18;
    c.globalAlpha = a * (k === 5 ? 1 : 0.35 + 0.1 * k);
    lensGlow(x, y, 26, '#c9b6ff', 0.6);
    dot(x, y, 5, '#e8e4ff');
    c.globalAlpha = 1;
  }
  text('Bath, March 1781', 90, 640, 30, ink, 'left', 'title');
}
// ── Engraved Berlin star chart (Bremiker), drawn on paper ──────────────────
function chartPaper(x0: number, y0: number, w: number, h: number, t: number, ticked: number) {
  c.fillStyle = '#efe6d2';
  c.fillRect(x0, y0, w, h);
  c.strokeStyle = '#8a7a6a55';
  for (let i = 1; i < 6; i++) {
    line([[x0 + (w * i) / 6, y0], [x0 + (w * i) / 6, y0 + h]], '#8a7a6a44', 1);
    line([[x0, y0 + (h * i) / 6], [x0 + w, y0 + (h * i) / 6]], '#8a7a6a44', 1);
  }
  for (let i = 0; i < 40; i++) {
    const x = x0 + 20 + hash(i) * (w - 40),
      y = y0 + 20 + hash(i + 50) * (h - 40),
      m = 1.5 + 4 * hash(i + 9) ** 2;
    dot(x, y, m, '#2a1d14');
    if (i < ticked) line([[x - 10, y + 8], [x - 4, y + 14], [x + 10, y - 6]], '#8a4a3a', 1.6);
  }
}
function bremiker(t: number) {
  c.fillStyle = cream;
  c.fillRect(0, 0, W, H);
  chartPaper(220, 90, 840, 520, t, 0);
  text('Berlin star chart · hour 21', 230, 650, 28, '#2a1d3a', 'left', 'title');
}
// ── 07 Chart against eyepiece, star by star, until one does not match ─────
function searchSplit(t: number, g: number) {
  space(g);
  const called = Math.floor(clamp((t - 1) / 14) * 40);
  const found = ease(t, cue('could not find') - 0.2, cue('could not find') + 0.6);
  const moved = ease(t, cue('next night') - 0.2, cue('next night') + 2);
  chartPaper(70, 120, 540, 460, t, called);
  // Eyepiece: the same stars, plus one more.
  c.save();
  c.beginPath();
  c.arc(940, 350, 250, 0, tau);
  c.clip();
  c.fillStyle = grad(690, 100, 500, 500, ['#0b0a1d', '#141233']);
  c.fillRect(690, 100, 500, 500);
  for (let i = 0; i < 40; i++) {
    const x = 690 + 20 * 500 / 580 + hash(i) * (500 - 40),
      y = 120 + hash(i + 50) * 460,
      m = 1.2 + 3 * hash(i + 9) ** 2;
    dot(x, y, m, '#e8e4ff');
    if (i === called % 40 && found < 0.5) {
      c.strokeStyle = '#e8e4ffaa';
      c.strokeRect(x - 14, y - 14, 28, 28);
    }
  }
  const nx = 960 + 18 * moved,
    ny = 300 + 6 * moved;
  dot(nx, ny, 4, neptuneBlue);
  if (found > 0) {
    lensGlow(nx, ny, 40, accent, 0.7 * found);
    c.globalAlpha = found;
    c.strokeStyle = accent;
    c.lineWidth = 2;
    c.beginPath();
    c.arc(nx, ny, 22, 0, tau);
    c.stroke();
    c.setLineDash([6, 8]);
    c.beginPath();
    c.arc(930, 330, 70, 0, tau);
    c.stroke();
    c.setLineDash([]);
    c.globalAlpha = 1;
  }
  c.restore();
  c.strokeStyle = '#c9b6e6';
  c.lineWidth = 3;
  c.beginPath();
  c.arc(940, 350, 250, 0, tau);
  c.stroke();
  const deg = ease(t, cue('one degree') - 0.2, cue('one degree') + 0.6);
  c.globalAlpha = deg;
  text('within about 1° of the prediction', 940, 660, 24, accent, 'center');
  c.globalAlpha = 1;
  text('chart', 330, 640, 24, muted, 'center');
}
// ── 08 Challis's ledger: two sightings nobody compared ─────────────────────
function challis(t: number) {
  c.fillStyle = cream;
  c.fillRect(0, 0, W, H);
  for (let y = 120; y < H - 60; y += 44) line([[100, y], [W - 100, y]], '#8a7a6a44', 1);
  const rows = [
    ['30 July 1846', '≈ 21h 58.4m', '≈ −13° 15′'],
    ['4 Aug 1846', '≈ 21h 58.1m', '≈ −13° 17′'],
    ['12 Aug 1846', '≈ 21h 57.6m', '≈ −13° 20′'],
    ['…', '', ''],
  ];
  rows.forEach((r, i) => {
    const a = ease(t, 0.4 + i * 0.6, 1 + i * 0.6);
    c.globalAlpha = a;
    text(r[0], 140, 170 + i * 88, 30, '#2a1d14', 'left', 'italic');
    text(r[1], 520, 170 + i * 88, 30, '#2a1d14', 'left', 'italic');
    text(r[2], 860, 170 + i * 88, 30, '#2a1d14', 'left', 'italic');
    c.globalAlpha = 1;
  });
  const mark = ease(t, cue('twice in august') - 0.2, cue('twice in august') + 0.6);
  c.globalAlpha = mark;
  c.strokeStyle = '#8a4a3a';
  c.lineWidth = 2;
  for (const i of [1, 2]) {
    c.beginPath();
    c.ellipse(640, 160 + i * 88, 560, 30, 0, 0, tau);
    c.stroke();
  }
  text('Neptune, recorded but not recognised', 140, 560, 28, '#8a4a3a', 'left', 'title');
  c.globalAlpha = 1;
  text('Cambridge · James Challis', 140, 650, 26, '#4a3b58', 'left', 'title');
  text('values illustrative', 1140, 650, 18, '#4a3b58', 'right');
}
// ── 03 Bouvard's see-saw: fit one era, the other goes wrong ───────────────
function seesaw(t: number, g: number) {
  space(g);
  const x0 = 150,
    x1 = 1130,
    y0 = 380;
  const X = (yr: number) => mix(x0, x1, (yr - 1690) / 160);
  line([[x0, y0], [x1, y0]], muted + '88', 1.4);
  for (const yr of [1700, 1750, 1800, 1850]) text(String(yr), X(yr), 620, 20, muted, 'center');
  const old = Array.from({ length: 12 }, (_, i) => 1690 + i * 7),
    neu = Array.from({ length: 12 }, (_, i) => 1781 + i * 5);
  const fitOld = ease(t, cue('fit the old') - 0.2, cue('fit the old') + 0.6) * (1 - ease(t, cue('fit the new') - 0.2, cue('fit the new') + 0.6));
  const fitNew = ease(t, cue('fit the new') - 0.2, cue('fit the new') + 0.6);
  const off = (yr: number) => (yr < 1781 ? -1 : 1) * (fitOld > fitNew ? (yr < 1781 ? 0 : 60) : yr < 1781 ? 60 : 0);
  for (const yr of [...old, ...neu]) {
    const y = y0 - off(yr) + 6 * Math.sin(yr);
    dot(X(yr), y, 4.5, yr < 1781 ? '#c9b6ff' : '#e8e4ff');
  }
  text(fitOld > fitNew ? 'fit the old observations' : fitNew > 0.1 ? 'fit the new observations' : '', 640, 140, 28, ink, 'center');
  text('old sightings', X(1730), 520, 20, muted, 'center');
  text('after 1781', X(1810), 520, 20, muted, 'center');
}
// ── 15 A star wobbles around the shared centre; timing shifts; Planet Nine
function wobble2(t: number, g: number) {
  space(g);
  const tt = ease(t, cue('timing of another') - 0.3, cue('timing of another') + 0.8);
  const nine = ease(t, cue('ninth planet') - 0.3, cue('ninth planet') + 0.8);
  if (nine > 0.5) {
    // Clustered orbits of distant icy bodies (schematic).
    lensGlow(640, 360, 40, '#ffd2a8', 0.8);
    for (let k = 0; k < 7; k++) {
      c.strokeStyle = '#c9b6ff' + (k === 3 ? 'ff' : '88');
      c.beginPath();
      c.ellipse(640 + 120, 360 - 20 + k * 6, 300 + k * 10, 110 + k * 6, 0.35 + k * 0.03, 0, tau);
      c.stroke();
    }
    c.globalAlpha = nine;
    text('a possible ninth planet · not yet found', 90, 640, 26, ink);
    c.globalAlpha = 1;
    return;
  }
  const cx = 640,
    cy = 300,
    a = t * 1.2;
  // The star circles the shared centre of mass, opposite the planet.
  const sx = cx - 28 * Math.cos(a),
    sy = cy - 8 * Math.sin(a);
  line([[cx - 4, cy], [cx + 4, cy]], '#ffffff55', 1);
  lensGlow(sx, sy, 90, '#ffd2a8', 0.8);
  dot(sx, sy, 22, '#fff1dc');
  dot(cx + 260 * Math.cos(a), cy + 70 * Math.sin(a), 8, neptuneBlue);
  // Live trace of the star's line-of-sight motion.
  const span = 6;
  const pts = path((u) => {
    const tau2 = t - span + u * span;
    return [160 + u * 960, 560 + 50 * Math.sin(tau2 * 1.2)];
  }, 200);
  line(pts, accent, 2.5);
  lensGlow(pts[pts.length - 1][0], pts[pts.length - 1][1], 20, accent, 0.8);
  text('the star’s wobble, measured in its light', 160, 650, 22, muted);
  if (tt > 0) {
    c.globalAlpha = tt;
    for (let k = 0; k < 6; k++) {
      const x = 200 + k * 160 + 14 * Math.sin(k * 1.7);
      line([[x, 120], [x, 150]], '#c9b6ff', 3);
      line([[200 + k * 160, 158], [200 + k * 160, 168]], '#ffffff44', 2);
    }
    text('transit times arrive early or late', 640, 100, 22, muted, 'center');
    c.globalAlpha = 1;
  }
}

const scenes: Record<string, (t: number, g: number) => void> = {
  leverrier: (t) => plate(t, 'leverrier', 'Paris, 1846', 'Urbain Le Verrier', 'voyager'),
  herschel: (t) => plate(t, 'herschel', 'Bath, 1781', 'William Herschel', 'uranus'),
  galle: (t) => plate(t, 'galle', 'Berlin', 'Johann Galle', 'voyager', 0.7),
  adams: (t) => plate(t, 'adams', 'Cambridge', 'John Couch Adams', 'webb', 0.7),
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
  contrast,
  leverrierDesk: (t) => plate(t, 'leverrier', 'Paris Observatory', 'Urbain Le Verrier · 1845', 'webb', 0.74),
  einstein,
  wobble,
  answer,
  steps,
  bremiker: (t) => bremiker(t),
  searchSplit,
  challis: (t) => challis(t),
  seesaw,
  wobble2,
  transitWire,
  occult,
  orbitLoop,
  credits: (t) => credits(t),
};
// Rowan's interview lines play over the matching diagram with his name.
for (const [key, base] of [
  ['rowanTug', 'tug'],
  ['rowanLuck', 'luck'],
  ['rowanTwo', 'contrast'],
] as const) {
  scenes[key] = (t, g) => {
    scenes[base](t, g);
    const a = ease(t, 0.2, 0.8);
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
