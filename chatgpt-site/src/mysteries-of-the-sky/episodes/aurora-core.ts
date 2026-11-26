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
  // Small labels read on a phone: scale them up.
  words(s, x, y, size < 26 ? Math.round(size * 1.15) : size, style, color, align);
}

// Gradient map from luminance to the dusk ramp. Auroral green survives as the
// accent and auroral red becomes coral, so the colors still carry meaning.
const ramp = ['#0d0a1e', '#1e1f55', '#3b3c9a', '#6d5fc4', '#b073c4', '#f0878f', '#ffe1cf'].map((h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
]);
const greenRamp = ['#14261f', '#2f6a48', '#6fbf6a', '#c6f56a', '#f2ffd8'].map((h) => [
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
      // Ratio-based, so pale over-exposed aurora is still recognised as green.
      const green = clamp((gg / (Math.max(r, b) + 8) - 1.06) / 0.3) * clamp(lum * 2.4);
      const red = clamp((r - Math.max(gg, b) - 10) / 60) * 0.85;
      const gf = clamp(lum * 1.15) * (greenRamp.length - 1),
        gk = Math.min(greenRamp.length - 2, Math.floor(gf)),
        gu = gf - gk;
      o = o.map((v, j) => v + (greenRamp[gk][j] + (greenRamp[gk + 1][j] - greenRamp[gk][j]) * gu - v) * green * 0.9);
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
  const s = Math.max((W + 80) / img.width, (H + 80) / img.height) * zoom;
  const w = img.width * s,
    h = img.height * s;
  // Keep the image covering the frame (with margin for the camera drift).
  const m = 40,
    x = Math.min(-m, Math.max(W + m - w, W / 2 - fx * w + dx)),
    y = Math.min(-m, Math.max(H + m - h, H / 2 - fy * h));
  c.drawImage(img, x, y, w, h);
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
const dust = Array.from({ length: 320 }, () => ({ x: rnd(), y: rnd(), d: 0.2 + 0.8 * rnd() ** 2, p: rnd() * tau }));
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
    const x = (((m.x + g * 0.012 * m.d) % 1) + 1) % 1,
      y = (((m.y + 0.01 * Math.sin(g * 0.4 * m.d + m.p)) % 1) + 1) % 1;
    c.globalAlpha = (0.1 + 0.4 * m.d) * (0.5 + 0.5 * Math.sin(g * (1.2 + 2 * m.d) + m.p));
    c.fillStyle = m.p > 4 ? '#f4a9a6' : '#c7c9ff';
    const sz = m.d > 0.8 ? 2.5 : 1.3;
    c.fillRect(x * W, y * H, sz, sz);
  }
  c.globalAlpha = 1;
}

const hudQueue: (() => void)[] = [];
export function hud(fn: () => void) {
  hudQueue.push(fn);
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
const hardIn = new Set<string>();
export function cutTo(keys: string[]) {
  keys.forEach((k) => hardIn.add(k));
}
const cells = tiles(16, 5);

function shot(draw: Draw, k: string, t: number, g: number, enter: number, lens = t) {
  c.fillStyle = night;
  c.fillRect(0, 0, W, H);
  const s = still.has(k) ? 1 : (1.04 + 0.05 * (lens / (lens + 7)) + 0.012 * Math.sin(g * 0.29)) * (0.95 + 0.05 * enter);
  // A slow, never-stopping drift; amplitude stays inside the push margin.
  const dx = still.has(k) ? 0 : 20 * Math.sin(g * 0.21 + 0.7) + 6 * Math.sin(g * 0.53),
    dy = still.has(k) ? 0 : 9 * Math.sin(g * 0.17) + 3 * Math.sin(g * 0.47 + 1);
  c.save();
  c.translate(W / 2 + dx, H / 2 + dy);
  c.scale(s, s);
  c.translate(-W / 2, -H / 2);
  hudQueue.length = 0;
  paintWithFinePixels(c, () => draw(k, t, g));
  c.restore();
  // Out-of-focus foreground glows drift faster than the diagram: depth.
  if (!hardIn.has(k) && !still.has(k) && k !== 'title' && k !== 'spectrometer' && k !== 'mclennan') {
    for (let i = 0; i < 6; i++) {
      const h = Math.abs(Math.sin(i * 91.7) * 1000) % 1,
        v = Math.abs(Math.sin(i * 37.3) * 1000) % 1;
      const x = (((h * (W + 400) + g * (14 + 10 * v)) % (W + 400)) + W + 400) % (W + 400) - 200,
        y = v * H;
      lensGlow(x, y, 90 + 70 * v, i % 2 ? '#7d6fd0' : '#c0607a', 0.16);
    }
  }
  paintWithFinePixels(c, () => hudQueue.splice(0).forEach((fn) => fn()));
}
export function directFrame(draw: Draw, current: Cue) {
  cue = current;
  const { key, t, prev, prevT = 0, g } = current;
  const family = prev && families.some((f) => f.has(prev) && f.has(key));
  if (prev && family) {
    shot(draw, key, t, g, 1, t + prevT);
  } else if (prev && mosaicIn.has(key) && t < 1.1) {
    // The new picture replaces the old one tile by tile.
    // The outgoing shot looks up its cues from its own start, not the new shot's.
    cue = { ...current, key: prev, t: prevT + t };
    shot(draw, prev, prevT + t, g, 1);
    cue = current;
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
  } else if (prev && t < 0.3 && !hardIn.has(key) && !key.includes('~') && !prev.includes('~') && prev.split('~')[0] !== key) {
    const e = ease(t, 0, 0.3);
    // The outgoing shot looks up its cues from its own start, not the new shot's.
    cue = { ...current, key: prev, t: prevT + t };
    shot(draw, prev, prevT + t, g, 1);
    cue = current;
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
    if (!prev && t < 0.6 && !still.has(key)) {
      c.fillStyle = night;
      c.globalAlpha = 1 - ease(t, 0, 0.6);
      c.fillRect(0, 0, W, H);
      c.globalAlpha = 1;
    }
  }
  return canvas.toDataURL('image/jpeg', 0.92).split(',')[1];
}

// Local shot time at which a phrase is spoken, searching from the start of the
// current shot (or from an earlier word in the same shot). Infinity if absent.
let said: [string, number][] = [];
/** Each episode supplies its recorded words with episode times. */
export function setTimeline(words: [string, number][]) {
  said = words;
}
export function at(phrase: string, after = 0) {
  const start = cue.g - cue.t,
    end = cue.g + cue.left,
    terms = phrase.toLowerCase().replace(/[’']/g, '').split(' ');
  for (let i = 0; i < said.length; i++) {
    if (said[i][1] < start + after - 0.05) continue;
    if (said[i][1] > end) break;
    if (terms.every((w, j) => said[i + j]?.[0] === w)) return said[i][1] - start;
  }
  return Infinity;
}

/** Frame function for an episode: alternate framings ("key~zoom:x:y") of the
 * same scene keep that scene's clock running across the cut. */
export function episodeFrame(scenes: Record<string, (t: number, g: number) => void>) {
  let chain = { base: '', start: 0 };
  return (k: string, t: number, current?: Cue) => {
    const base = k.split('~')[0];
    if (!scenes[base]) throw new Error('Unknown scene: ' + k);
    const cue0 = current ?? { key: k, t, g: t, left: 99 };
    const prevBase = cue0.prev?.split('~')[0];
    if (!(prevBase === base && chain.base === base)) chain = { base, start: cue0.g - cue0.t };
    const T = cue0.g - chain.start;
    const cueT = { ...cue0, t: T, left: cue0.left + (cue0.t - T) };
    return directFrame((key, time, g) => {
      const [name, frame] = key.split('~');
      if (!frame) return scenes[name](time, g);
      const [zRaw, fxRaw, fyRaw] = frame.split(':').map(Number);
      // Gentle reframings only: cap the zoom and pull the focus toward the centre
      // so labels near the edges stay in frame.
      const z = Math.min(1.15, zRaw),
        fx = mix(W / 2, fxRaw, 0.5),
        fy = mix(H / 2, fyRaw, 0.5);
      const zz = z * (1 + 0.006 * Math.min(time, 12));
      c.save();
      c.translate(W / 2, H / 2);
      c.scale(zz, zz);
      c.translate(-fx, -fy);
      scenes[name](time, g);
      c.restore();
    }, cueT);
  };
}
