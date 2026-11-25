// Full-frame showpieces in the reference film's manner: a dense glowing deep
// field, a luminous chamber that light travels through, and equations written
// over slowly flowing contour lines. Library shots use a 1920 × 1080 space.
import { c, W, H, words, lensGlow, lime, muted } from './stage.ts';
import coverUrl from './wasp39-cover.jpg';
import { chamber, typeWipe } from '../compositing.ts';
import { tileReveal } from '../cosmos.ts';

const tau = Math.PI * 2;
const ease = (t: number, a: number, b: number) => {
  const f = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return f * f * (3 - 2 * f);
};
let seed = 913;
const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;

// One galaxy: an indigo halo, a coral body and a pale core, elongated and tilted.
function galaxyBlob(g: CanvasRenderingContext2D, x: number, y: number, r: number, stretch: number, angle: number) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.scale(1, stretch);
  const halo = g.createRadialGradient(0, 0, 0, 0, 0, r * 2.4);
  halo.addColorStop(0, '#7f7be0aa');
  halo.addColorStop(0.45, '#5b5bc244');
  halo.addColorStop(1, '#3a3d9a00');
  g.fillStyle = halo;
  g.beginPath();
  g.arc(0, 0, r * 2.4, 0, tau);
  g.fill();
  const body = g.createRadialGradient(0, 0, 0, 0, 0, r);
  body.addColorStop(0, '#fff4dc');
  body.addColorStop(0.22, '#ffd0b4');
  body.addColorStop(0.5, '#f4808a');
  body.addColorStop(0.82, '#c4559a88');
  body.addColorStop(1, '#a14fa000');
  g.fillStyle = body;
  g.beginPath();
  g.arc(0, 0, r, 0, tau);
  g.fill();
  g.restore();
}

function fieldPlate(w: number, h: number, count: number, big: number, s: number) {
  seed = s;
  const plate = document.createElement('canvas');
  plate.width = w;
  plate.height = h;
  const g = plate.getContext('2d')!;
  // Faint glints first, then galaxies from small to large.
  for (let i = 0; i < count * 6; i++) {
    g.globalAlpha = 0.25 + 0.6 * rand();
    g.fillStyle = rand() < 0.35 ? '#f8b8c4' : '#cfd3ff';
    const d = rand() < 0.15 ? 3 : 2;
    g.fillRect(rand() * w, rand() * h, d, d);
  }
  g.globalAlpha = 1;
  const list = Array.from({ length: count }, () => ({
    x: rand() * w,
    y: rand() * h,
    r: 3 + big * rand() ** 3.2,
    s: rand() < 0.35 ? 0.22 + 0.3 * rand() : 0.6 + 0.4 * rand(),
    a: rand() * Math.PI,
  })).sort((a, b) => a.r - b.r);
  for (const q of list) galaxyBlob(g, q.x, q.y, q.r, q.s, q.a);
  return plate;
}
const far = fieldPlate(2400, 1350, 520, 26, 913);
const near = fieldPlate(2400, 1350, 70, 52, 4417);
// The mosaic look: the far field is resampled through coarse blocks.
const mosaic = document.createElement('canvas');
mosaic.width = 480;
mosaic.height = 270;
mosaic.getContext('2d')!.drawImage(far, 0, 0, 480, 270);

export function field(t: number, zoom: number, focus: [number, number]) {
  c.fillStyle = '#1b1d36';
  c.fillRect(0, 0, W, H);
  for (const [img, depth, alpha] of [
    [mosaic, 1, 0.55],
    [far, 1, 0.9],
    [near, 1.6, 1],
  ] as const) {
    const z = 1 + (zoom - 1) * depth,
      w = W * 1.2 * z,
      h = H * 1.2 * z;
    const x = W / 2 - (focus[0] / W) * w + 18 * Math.sin(t * 0.05) * depth,
      y = H / 2 - (focus[1] / H) * h;
    c.save();
    c.globalAlpha = alpha;
    c.imageSmoothingEnabled = img !== mosaic;
    c.drawImage(img, x, y, w, h);
    c.restore();
  }
}

// Opening: the deep field arrives tile by tile, then the series title wipes on.
function opening(t: number) {
  c.fillStyle = '#15162e';
  c.fillRect(0, 0, W, H);
  c.save();
  c.scale(W / 1920, H / 1080);
  tileReveal(c, ease(t, 0, 2.4), 24, () => {
    c.scale(1920 / W, 1080 / H);
    field(t, 1 + 0.025 * t, [W * 0.52, H * 0.5]);
  });
  c.restore();
  c.save();
  c.fillStyle = '#0c0b1e';
  c.globalAlpha = 0.45 * ease(t, 2.2, 3.4);
  c.fillRect(0, 0, W, H);
  c.restore();
  c.save();
  c.scale(W / 1920, H / 1080);
  typeWipe(c, 'Mysteries of the Sky', 540, 92, ease(t, 2.4, 4.6));
  c.restore();
}

// The first narration question starts over the complete thumbnail. Its paper
// tiles peel away toward the rim glint and expose the measured spectrum below.
const cover = new Image();
cover.src = coverUrl;
Object.assign(window, { motionAssetsReady: cover.decode() });
export function coverHook(t: number) {
  if (t >= 3.5) return;
  // On frame one the full artwork reads as the thumbnail. Its square cuts
  // fan into depth with different amounts of travel in the hand and star.
  const zoom = 1 + 0.13 * ease(t, 0, 2.95);
  const push = ease(t, 0, 2.25);
  const tile = 80;
  c.save();
  c.translate(704, 125);
  c.scale(zoom, zoom);
  c.translate(-704, -125);
  for (let y = 0; y < H; y += tile) {
    for (let x = 0; x < W; x += tile) {
      const distance = Math.hypot(x + 40 - 704, y + 40 - 125) / 920;
      const aperture = x >= 720 && x < 1120 && y >= 160 && y < 480;
      const phase = (aperture ? 0.72 + (x % 240) / 780 : 2.39 - 0.9 * distance) + 0.07 * Math.sin(x + y * 2);
      const leave = ease(t, phase, phase + 0.57);
      if (leave >= 1) continue;
      const foreground = x < 650 && y > 370;
      const separation = foreground ? 25 : x > 850 ? 14 : 3;
      const drift = (x < 704 ? -1 : 1) * separation * push;
      const width = tile * (1 - 0.39 * leave);
      c.globalAlpha = 1 - leave ** 1.7;
      c.drawImage(cover, x, y, tile, tile, x + drift * leave + (tile - width) / 2, y - separation * leave, width + 0.15, width + 0.15);
    }
  }
  c.globalAlpha = 1;
  const glint = Math.sin(Math.PI * ease(t, 0.05, 1.6)) * 0.68;
  lensGlow(704, 125, 52, lime, glint);
  c.restore();
}

// Starlight travels through Webb's optics: a luminous chamber of rings.
function passage(t: number) {
  c.fillStyle = '#17163a';
  c.fillRect(0, 0, W, H);
  c.save();
  c.scale(W / 1920, H / 1080);
  chamber(c, t * 1.15, 22);
  c.restore();
  // Extra volume: a violet body around the beam and a hot core.
  lensGlow(W / 2, H / 2, 520, '#6b5fd6', 0.35);
  lensGlow(W / 2, H / 2, 260, '#f58aa8', 0.55 + 0.1 * Math.sin(t * 2));
  lensGlow(W / 2, H / 2, 90, '#fff1ea', 0.7);
}

// Slow flowing contours behind an equation, like a field map seen edge on.
function contours(t: number) {
  c.fillStyle = '#1c1a2a';
  c.fillRect(0, 0, W, H);
  lensGlow(W * 0.7, H * 0.25, 520, '#4d4a8f', 0.32);
  lensGlow(W * 0.2, H * 0.9, 480, '#7d3d55', 0.28);
  c.lineCap = 'round';
  // Neighbouring lines share one smooth displacement field, so they bend
  // together like field lines and never cross.
  const n = 30;
  for (let i = 0; i < n; i++) {
    const v = i / (n - 1);
    c.beginPath();
    for (let k = 0; k <= 120; k++) {
      const x = -40 + (k / 120) * (W + 80);
      const bend =
        70 * Math.sin(x / 260 + v * 1.6 + t * 0.09) +
        45 * Math.sin(x / 140 - v * 2.3 - t * 0.06) * Math.sin(v * Math.PI) +
        120 * Math.exp(-(((x - W * 0.62) / 220) ** 2)) * Math.sin(v * 5 + t * 0.12);
      const y = -60 + v * (H + 120) + bend * (0.5 + 0.5 * Math.sin(v * Math.PI));
      if (k) c.lineTo(x, y);
      else c.moveTo(x, y);
    }
    c.strokeStyle = i % 5 === 0 ? '#cdbcdc4a' : '#b7b0c82a';
    c.lineWidth = 1.1 + (i % 3) * 0.5;
    c.stroke();
  }
}
type Term = { text: string; meaning?: string; accent?: boolean };
function equation(t: number, terms: Term[], y = 330, size = 64) {
  c.font = 'italic ' + size + 'px Georgia, serif';
  const widths = terms.map((q) => c.measureText(q.text).width + size * 0.22);
  let x = W / 2 - widths.reduce((a, b) => a + b, 0) / 2;
  let flip = -1;
  terms.forEach((q, i) => {
    const local = t - 0.08 - i * 0.14,
      a = ease(local, 0, 0.6);
    const mid = x + widths[i] / 2;
    c.save();
    c.globalAlpha = a;
    c.font = 'italic ' + size + 'px Georgia, serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = q.accent ? lime : '#f3e7ef';
    const baseline = y + 10 * (1 - a);
    if (q.text.startsWith('R★')) {
      c.textAlign = 'left';
      const start = mid - widths[i] / 2 + size * 0.11;
      c.fillText('R', start, baseline);
      const end = start + c.measureText('R').width;
      c.font = 'italic ' + size * 0.52 + 'px Georgia, serif';
      c.fillText('★', end - 1, baseline + size * 0.22);
      if (q.text.endsWith('²')) c.fillText('²', end + size * 0.1, baseline - size * 0.22);
    } else {
      c.fillText(q.text, mid, baseline);
    }
    if (q.meaning) {
      flip = -flip;
      const reach = ease(local, 0.2, 0.65);
      c.strokeStyle = muted + 'aa';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(mid, y + flip * 52);
      c.lineTo(mid, y + flip * (52 + 46 * reach));
      c.stroke();
      c.globalAlpha = a * ease(local, 0.45, 0.95);
      c.font = '500 22px "Helvetica Neue", Arial, sans-serif';
      c.fillStyle = muted;
      c.fillText(q.meaning, mid, y + flip * 128);
    }
    c.restore();
    x += widths[i];
  });
}
function depthEquation(t: number) {
  contours(t);
  equation(t, [
    { text: 'depth', meaning: 'light blocked' },
    { text: '≈' },
    { text: '(' },
    { text: 'Rₚ', meaning: 'planet radius' },
    { text: '/' },
    { text: 'R★', meaning: 'star radius' },
    { text: ')²' },
    { text: '≈ 2%', accent: true },
  ]);
}
function scaleHeight(t: number) {
  contours(t);
  equation(t, [
    { text: 'H', meaning: 'how slowly gas thins with height' },
    { text: '=' },
    { text: 'k' },
    { text: 'T', meaning: 'hot outer atmosphere', accent: true },
    { text: '/' },
    { text: '(μ' },
    { text: 'g', meaning: 'weak gravity', accent: true },
    { text: ')' },
  ]);
}
function rimSignal(t: number) {
  contours(t);
  equation(t, [
    { text: 'signal', meaning: 'extra light blocked by the rim' },
    { text: '≈' },
    { text: '2' },
    { text: 'Rₚ', meaning: 'longer rim' },
    { text: 'H', meaning: 'thicker layers', accent: true },
    { text: '/' },
    { text: 'R★²' },
  ]);
}

export const showpieces: Record<string, (t: number) => void> = {
  opening,
  passage,
  eqdepth: depthEquation,
  eqscale: scaleHeight,
  eqsignal: rimSignal,
};
