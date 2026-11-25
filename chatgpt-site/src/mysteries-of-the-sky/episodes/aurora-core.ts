// Shared machinery for "The Light Oxygen Makes": palette grading for real
// photographs, a camera that never stops, and mosaic or dissolve transitions.
import { c, canvas, W, H, lensGlow, words } from './stage.ts';
import { paintWithFinePixels } from '../finish.ts';

export const tau = Math.PI * 2;
export const clamp = (x: number) => Math.min(1, Math.max(0, x));
export const ease = (t: number, a: number, b: number) => {
  const f = clamp((t - a) / (b - a));
  return f * f * (3 - 2 * f);
};
export const mix = (a: number, b: number, f: number) => a + (b - a) * f;
export const ink = '#f4ecf6',
  muted = '#c9b9dd',
  lilac = '#a99cf0',
  coral = '#f0878f',
  blush = '#ffd9c9',
  accent = '#c6f56a', // the one surprise hue: oxygen's green
  night = '#0f0c1f',
  cream = '#e9e2d6';

export function text(
  s: string,
  x: number,
  y: number,
  size = 24,
  color = ink,
  align: CanvasTextAlign = 'left',
  style: 'sans' | 'title' | 'italic' | 'caps' = 'sans',
) {
  if (style === 'caps') {
    c.save();
    c.font = '600 ' + size + 'px "Helvetica Neue", Arial, sans-serif';
    c.textAlign = align;
    c.fillStyle = color;
    (c as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = Math.round(size * 0.22) + 'px';
    c.fillText(s.toUpperCase(), x, y);
    c.restore();
    return;
  }
  words(s, x, y, size, style, color, align);
}

// Gradient map from luminance to the dusk ramp. Auroral green survives as the
// accent and auroral red becomes coral, so the colors still carry meaning.
const ramp = ['#0d0a1e', '#1e1f55', '#3b3c9a', '#6d5fc4', '#b073c4', '#f0878f', '#ffe1cf'].map((h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
]);
const greenRGB = [198, 245, 106],
  coralRGB = [240, 135, 143];
export function grade(img: CanvasImageSource & { width: number; height: number }, keepGreen = true, lift = 1) {
  const g = document.createElement('canvas');
  g.width = img.width;
  g.height = img.height;
  const x = g.getContext('2d')!;
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, g.width, g.height),
    p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const r = p[i],
      gg = p[i + 1],
      b = p[i + 2];
    const lum = clamp(((0.3 * r + 0.55 * gg + 0.15 * b) / 255) ** 0.85 * lift);
    const f = lum * (ramp.length - 1),
      k = Math.min(ramp.length - 2, Math.floor(f)),
      u = f - k;
    let o = [0, 1, 2].map((j) => ramp[k][j] + (ramp[k + 1][j] - ramp[k][j]) * u);
    if (keepGreen) {
      const green = clamp((gg - Math.max(r, b) - 12) / 70) * clamp(lum * 2.2);
      const red = clamp((r - Math.max(gg, b) - 10) / 60) * 0.85;
      o = o.map((v, j) => v + (greenRGB[j] * (0.45 + 0.75 * lum) - v) * green);
      o = o.map((v, j) => v + (coralRGB[j] * (0.5 + 0.7 * lum) - v) * red);
    }
    p[i] = o[0];
    p[i + 1] = o[1];
    p[i + 2] = o[2];
  }
  x.putImageData(d, 0, 0);
  return g;
}
export function load(url: string) {
  const img = new Image();
  img.src = url;
  return img;
}
// Draw an image to cover the frame, with a push (zoom) about a focus point.
export function cover(img: CanvasImageSource & { width: number; height: number }, zoom = 1, fx = 0.5, fy = 0.5, dx = 0) {
  const s = Math.max(W / img.width, H / img.height) * zoom;
  const w = img.width * s,
    h = img.height * s;
  c.drawImage(img, W / 2 - fx * w + dx, H / 2 - fy * h, w, h);
}

// Seeded tile order for mosaic reveals, as in the reference opening.
export function tiles(cols: number, seed: number) {
  let s = seed;
  const rand = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  const rows = Math.ceil((cols * H) / W),
    size = W / cols;
  return Array.from({ length: cols * rows }, (_, i) => ({
    x: (i % cols) * size,
    y: Math.floor(i / cols) * size,
    size,
    at: rand(),
    kind: rand(),
  }));
}
export function mosaicClip(cells: ReturnType<typeof tiles>, progress: number) {
  c.beginPath();
  for (const q of cells) if (q.at < progress) c.rect(q.x, q.y, q.size + 0.5, q.size + 0.5);
  c.clip();
}

// Background for diagram shots: deep night with slow glows and dust.
let seed = 77;
const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const dust = Array.from({ length: 220 }, () => ({ x: rnd(), y: rnd(), d: 0.2 + 0.8 * rnd() ** 2, p: rnd() * tau }));
export function space(g: number, warm = 0) {
  const b = c.createLinearGradient(0, 0, W * 0.5, H * 1.2);
  b.addColorStop(0, '#0c0b1d');
  b.addColorStop(0.55, '#16132e');
  b.addColorStop(1, warm ? '#33183a' : '#1d1533');
  c.fillStyle = b;
  c.fillRect(0, 0, W, H);
  lensGlow(W * (0.74 + 0.05 * Math.sin(g * 0.03)), H * 0.26, 640, '#3d3f9c', 0.34);
  lensGlow(W * (0.18 + 0.04 * Math.cos(g * 0.025)), H * 0.92, 560, '#8d3f5c', 0.26 + 0.1 * warm);
  for (const m of dust) {
    const x = (((m.x + g * 0.002 * m.d) % 1) + 1) % 1;
    c.globalAlpha = (0.08 + 0.32 * m.d) * (0.6 + 0.4 * Math.sin(g * (0.5 + m.d) + m.p));
    c.fillStyle = m.p > 4 ? '#f4a9a6' : '#c7c9ff';
    c.fillRect(x * W, m.y * H, m.d > 0.8 ? 2 : 1, m.d > 0.8 ? 2 : 1);
  }
  c.globalAlpha = 1;
}

export type Cue = { key: string; t: number; prev?: string; prevT?: number; g: number; left: number };
export let cue: Cue = { key: '', t: 0, g: 0, left: 99 };
type Draw = (k: string, t: number, g: number) => void;

const held = document.createElement('canvas');
held.width = W;
held.height = H;
const hc = held.getContext('2d')!;
const families: Set<string>[] = [];
export function continuous(keys: string[]) {
  families.push(new Set(keys));
}
const mosaicIn = new Set<string>();
export function arriveByMosaic(keys: string[]) {
  keys.forEach((k) => mosaicIn.add(k));
}
const still = new Set<string>();
export function lockCamera(keys: string[]) {
  keys.forEach((k) => still.add(k));
}
const cells = tiles(16, 5);

function shot(draw: Draw, k: string, t: number, g: number, enter: number, lens = t) {
  c.fillStyle = night;
  c.fillRect(0, 0, W, H);
  const s = still.has(k) ? 1 : (1.035 + 0.09 * (lens / (lens + 7))) * (0.94 + 0.06 * enter);
  const dx = still.has(k) ? 0 : 12 * Math.sin(g * 0.12 + 0.7),
    dy = still.has(k) ? 0 : 6 * Math.sin(g * 0.09);
  c.save();
  c.translate(W / 2 + dx, H / 2 + dy);
  c.scale(s, s);
  c.translate(-W / 2, -H / 2);
  paintWithFinePixels(c, () => draw(k, t, g));
  c.restore();
}
export function directFrame(draw: Draw, current: Cue) {
  cue = current;
  const { key, t, prev, prevT = 0, g } = current;
  const family = prev && families.some((f) => f.has(prev) && f.has(key));
  if (prev && family) {
    shot(draw, key, t, g, 1, t + prevT);
  } else if (prev && mosaicIn.has(key) && t < 1.1) {
    // The new picture replaces the old one tile by tile.
    shot(draw, prev, prevT + t, g, 1);
    hc.drawImage(canvas, 0, 0);
    shot(draw, key, t, g, 1);
    // Paint the outgoing frame back except where tiles have arrived.
    c.save();
    c.beginPath();
    c.rect(0, 0, W, H);
    for (const q of cells) if (q.at < ease(t, 0, 1.1)) c.rect(q.x, q.y, q.size + 0.5, q.size + 0.5);
    c.clip('evenodd');
    c.drawImage(held, 0, 0);
    c.restore();
  } else if (prev && t < 0.45) {
    const e = ease(t, 0, 0.45);
    shot(draw, prev, prevT + t, g, 1);
    hc.drawImage(canvas, 0, 0);
    shot(draw, key, t, g, e);
    c.save();
    c.globalAlpha = 1 - e;
    c.translate(W / 2, H / 2);
    c.scale(1 + 0.05 * e, 1 + 0.05 * e);
    c.translate(-W / 2, -H / 2);
    c.drawImage(held, 0, 0);
    c.restore();
  } else {
    shot(draw, key, t, g, prev ? 1 : ease(t, 0, 0.6));
    if (!prev && t < 0.6) {
      c.fillStyle = night;
      c.globalAlpha = 1 - ease(t, 0, 0.6);
      c.fillRect(0, 0, W, H);
      c.globalAlpha = 1;
    }
  }
  return canvas.toDataURL('image/jpeg', 0.92).split(',')[1];
}
