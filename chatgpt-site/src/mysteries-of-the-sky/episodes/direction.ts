// Frame-level direction shared by episode renderers: a living backdrop, a slow
// camera push inside every cut, and zoom dissolves between cuts. The reference
// film never holds a frozen frame; something always drifts, breathes or builds.
import { canvas, c, W, H, lensGlow, grad } from './stage.ts';
import { paintWithFinePixels } from '../finish.ts';

const tau = Math.PI * 2;
const smooth = (x: number) => {
  const f = Math.max(0, Math.min(1, x));
  return f * f * (3 - 2 * f);
};

// Static base: a mid-tone indigo-to-wine field, never a flat fill.
const base = document.createElement('canvas');
base.width = W;
base.height = H;
{
  const b = base.getContext('2d')!;
  const g = b.createLinearGradient(0, 0, W * 0.4, H * 1.1);
  g.addColorStop(0, '#15163a');
  g.addColorStop(0.45, '#221a3d');
  g.addColorStop(0.8, '#3a2140');
  g.addColorStop(1, '#2a1830');
  b.fillStyle = g;
  b.fillRect(0, 0, W, H);
  const v = b.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, W * 0.75);
  v.addColorStop(0, '#00000000');
  v.addColorStop(1, '#0606128a');
  b.fillStyle = v;
  b.fillRect(0, 0, W, H);
}

// Dust in three depths. Each mote has its own drift and twinkle phase.
let seed = 71;
const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const motes = Array.from({ length: 260 }, () => ({
  x: rand(),
  y: rand(),
  depth: 0.25 + 0.75 * rand() ** 2,
  phase: rand() * tau,
  warm: rand() < 0.3,
}));

const spectrograph = new Set(['data','peak','shoulder','bins','unknown','co2','sulfur','pretty','discovery','fit','shortfall','pipelines','resolution','detector','finalPoints','drift','manydips','turnDips','curve','baseline','narrow','curveedges']);
const atmosphere = new Set(['reaction','balance','chemistry','identity','sulfide','water','so2','carbon','density','degenerate','layers','cloudray','grazing','slant','vertical']);
const space = new Set(['transit','year','inflate','mass','hero','puff','limbs','edges','ring','strip','transitcurve']);
export function backdrop(g: number, key: string) {
  if (spectrograph.has(key)) {
    // Etched glass in the spectrograph. The fine grid gives the measured
    // positions a stable ground while spectral reflections move at the edges.
    c.fillStyle = grad(0, 0, W, H, ['#101021', '#262840', '#121427']);
    c.fillRect(0, 0, W, H);
    c.lineWidth = 1;
    c.strokeStyle = '#b4acc316';
    c.beginPath();
    for (let x = 0; x < W; x += 54) { c.moveTo(x, 0); c.lineTo(x, H); }
    for (let y = 0; y < H; y += 54) { c.moveTo(0, y); c.lineTo(W, y); }
    c.stroke();
    lensGlow(60 + 50 * Math.sin(g * 0.08), H, 410, '#98739c', 0.36);
    return;
  }
  if (atmosphere.has(key)) {
    // Bands of haze seen edge-on, with deeper, denser layers below.
    c.fillStyle = grad(0, 0, W * 0.28, H, ['#242039', '#663749', '#a85757', '#472639']);
    c.fillRect(0, 0, W, H);
    for (let layer = 0; layer < 6; layer++) {
      const y = 412 + layer * 56;
      c.fillStyle = grad(0, y - 60, 0, 160, ['#fda8a329', '#5429390b']);
      c.beginPath();
      c.moveTo(-20, H + 30);
      for (let x = -20; x < W + 25; x += 20) {
        c.lineTo(x, y + 24 * Math.sin(x / 212 + g * 0.09 + layer * 0.6) + 31 * Math.sin(x / 381 - g * 0.045));
      }
      c.lineTo(W + 25, H + 30);
      c.fill();
    }
    return;
  }
  if (space.has(key)) {
    c.fillStyle = grad(0, 0, W, H, ['#060815', '#111528', '#432a43']);
    c.fillRect(0, 0, W, H);
    for (const m of motes) {
      const x = ((m.x + g * m.depth * 0.001) % 1) * W;
      c.globalAlpha = 0.3 + 0.5 * m.depth;
      c.fillStyle = m.warm ? '#f0b2a4' : '#cbc9ef';
      c.fillRect(x, m.y * H, 0.8 + 1.7 * m.depth, 0.8 + 1.7 * m.depth);
    }
    c.globalAlpha = 1;
    return;
  }
  c.drawImage(base, 0, 0);
  // Large soft glows wander slowly; their colors stay inside the landscape palette.
  lensGlow(W * (0.72 + 0.06 * Math.sin(g * 0.031)), H * (0.3 + 0.05 * Math.cos(g * 0.027)), 620, '#5a58b0', 0.42);
  lensGlow(W * (0.2 + 0.05 * Math.cos(g * 0.023 + 1)), H * (0.95 + 0.04 * Math.sin(g * 0.035)), 560, '#a14d5c', 0.36);
  lensGlow(W * (0.45 + 0.08 * Math.sin(g * 0.017 + 2)), H * (0.55 + 0.06 * Math.sin(g * 0.021)), 430, '#7c3f6a', 0.16);
  for (const m of motes) {
    const x = (((m.x + g * 0.0022 * m.depth) % 1) + 1) % 1,
      y = (((m.y - g * 0.0009 * m.depth + 0.004 * Math.sin(g * 0.3 * m.depth + m.phase)) % 1) + 1) % 1;
    const tw = 0.55 + 0.45 * Math.sin(g * (0.6 + m.depth) + m.phase);
    c.globalAlpha = (0.05 + 0.3 * m.depth) * tw;
    c.fillStyle = m.warm ? '#f4a7a0' : '#c3c6ff';
    const s = m.depth > 0.8 ? 2 : 1;
    c.fillRect(x * W, y * H, s, s);
  }
  c.globalAlpha = 1;
}

// Two full-frame buffers let a cut dissolve while both shots keep moving.
const held = document.createElement('canvas');
held.width = W;
held.height = H;
const hc = held.getContext('2d')!;

export type Cue = {
  key: string;
  t: number; // seconds since this cut
  prev?: string; // previous cut inside the chapter
  prevT?: number; // seconds the previous cut had run when this one started
  g: number; // seconds since the episode began
  left: number; // seconds until the chapter ends
};

// Keys in one family share a drawing that interpolates between them itself,
// so a cut inside a family becomes one continuous camera move.
const families: Set<string>[] = [];
export function continuous(keys: string[]) {
  families.push(new Set(keys));
}
const together = (a: string, b: string) => families.some((f) => f.has(a) && f.has(b));
export let cue: Cue = { key: '', t: 0, g: 0, left: 99 };

const PUSH = 0.085,
  DISSOLVE = 0.25,
  OPEN = 0.6;

function shot(
  draw: (k: string, t: number) => void,
  k: string,
  t: number,
  g: number,
  enter: number,
  lens = t,
) {
  backdrop(g, k);
  // A slow push that eases toward a stop, plus a faint lateral drift.
  const s = (1.03 + PUSH * (lens / (lens + 6))) * (0.93 + 0.07 * enter);
  const dx = 16 * Math.sin(g * 0.13 + 0.7),
    dy = 8 * Math.sin(g * 0.097);
  c.save();
  c.translate(W / 2 + dx, H / 2 + dy);
  c.scale(s, s);
  c.translate(-W / 2, -H / 2);
  paintWithFinePixels(c, () => draw(k, t));
  c.restore();
}

export function directFrame(draw: (k: string, t: number) => void, current: Cue, overlay?: () => void) {
  cue = current;
  const { key, t, prev, prevT = 0, g, left } = current;
  if (prev && together(prev, key)) {
    // Carry the previous cut's push so the camera does not jump.
    shot(draw, key, t, g, 1, t + prevT);
  } else if (prev && t < DISSOLVE) {
    const e = smooth(t / DISSOLVE);
    // Outgoing shot keeps running and pushes past the camera as it fades.
    shot(draw, prev, prevT + t, g, 1);
    hc.drawImage(canvas, 0, 0);
    shot(draw, key, t, g, e);
    c.save();
    c.globalAlpha = 1 - e;
    const z = 1 + 0.06 * e;
    c.translate(W / 2, H / 2);
    c.scale(z, z);
    c.translate(-W / 2, -H / 2);
    c.drawImage(held, 0, 0);
    c.restore();
  } else {
    shot(draw, key, t, g, prev ? 1 : smooth(t / OPEN));
  }
  // Chapter edges breathe through the backdrop alone.
  const veil = prev ? 0 : 1 - smooth(t / OPEN);
  if (veil > 0.001) {
    hc.drawImage(canvas, 0, 0);
    backdrop(g, key);
    c.globalAlpha = 1 - veil;
    c.drawImage(held, 0, 0);
    c.globalAlpha = 1;
  }
  overlay?.();
  return canvas.toDataURL('image/jpeg', 0.92).split(',')[1];
}
