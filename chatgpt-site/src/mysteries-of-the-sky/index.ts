import { finePixelFinish } from './finish.ts';
import { ramps, sky, surface, wash, type Material, type Surface } from './materials.ts';
export { sky, ramps, type Material, type Surface } from './materials.ts';

type Ctx = CanvasRenderingContext2D;
export type Point = readonly [number, number];
export type Shot = { duration: number; draw: (ctx: Ctx, seconds: number) => void };
export const width = 1920,
  height = 1080;
export const tau = 2 * Math.PI;
const clamp = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => {
  const t = clamp(x);
  return t * t * (3 - 2 * t);
};
export function tween(t: number, start: number, end: number, a: number, b: number) {
  if (end <= start) return t < start ? a : b;
  return a + (b - a) * smooth((t - start) / (end - start));
}

export function layer(
  ctx: Ctx,
  pose: { x?: number; y?: number; scale?: number; angle?: number; alpha?: number },
  draw: () => void,
) {
  ctx.save();
  try {
    ctx.translate(pose.x ?? 0, pose.y ?? 0);
    ctx.rotate(pose.angle ?? 0);
    ctx.scale(pose.scale ?? 1, pose.scale ?? 1);
    ctx.globalAlpha *= clamp(pose.alpha ?? 1);
    draw();
  } finally {
    ctx.restore();
  }
}

export function camera(ctx: Ctx, focus: Point, zoom: number, draw: () => void) {
  layer(ctx, { x: width / 2, y: height / 2, scale: zoom }, () => {
    ctx.translate(-focus[0], -focus[1]);
    draw();
  });
}

export function backdrop(ctx: Ctx) {
  const g = ctx.createLinearGradient(0, 0, width, height);
  g.addColorStop(0, '#101022');
  g.addColorStop(0.52, sky.plum);
  g.addColorStop(1, sky.night);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
}

export function body(ctx: Ctx, kind: Surface, center: Point, radius: number, material: Material, seed = 1) {
  if (radius <= 0) return;
  const d = radius * 2.16;
  ctx.drawImage(surface(kind, material, radius, seed), center[0] - d / 2, center[1] - d / 2, d, d);
}

// Slightly different angular velocities keep successive shell silhouettes independent.
export function shells(ctx: Ctx, radii: readonly number[], t: number, material: Material = 'twilight') {
  radii.forEach((radius, i) =>
    layer(
      ctx,
      {
        angle: 0.075 * Math.sin(t * 0.47 + i),
        scale: 1 + 0.012 * Math.sin(t * 1.2 + i * 1.6),
      },
      () => body(ctx, 'shell', [0, 0], radius, material, 7 + i),
    ),
  );
}

export function label(ctx: Ctx, words: string, at: Point, size = 40, material: Material = 'chalk') {
  ctx.font = '500 ' + size + 'px "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = wash(ctx, material, at[0], at[1] + size * 1.45, 0, -size * 2.1);
  ctx.fillText(words, ...at);
}

export function charge(ctx: Ctx, center: Point, sign: string, radius = 45) {
  layer(ctx, { x: center[0], y: center[1] }, () => {
    ctx.lineWidth = 3;
    ctx.strokeStyle = wash(ctx, 'chalk', -radius, radius, radius * 2, -radius * 2);
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, tau);
    ctx.stroke();
    label(ctx, sign, [0, 0], radius * 1.48);
  });
}

// A single sampled path drives both the revealed line and any moving marker.
// Native canvas transforms allow the same primitive to draw rays, orbits and graphs.
export type Curve = (progress: number) => Point;
export function trace(
  ctx: Ctx,
  curve: Curve,
  progress = 1,
  material: Material = 'twilight',
  weight = 4,
  steps = 160,
) {
  const end = clamp(progress);
  if (!end) return;
  const start = curve(0),
    mid = curve(0.5),
    last = curve(1);
  const dx = last[0] - start[0],
    dy = last[1] - start[1];
  ctx.strokeStyle =
    Math.hypot(dx, dy) > 1
      ? wash(ctx, material, ...start, dx, dy)
      : wash(ctx, material, ...start, mid[0] - start[0] || 1, mid[1] - start[1]);
  ctx.lineWidth = weight;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(...start);
  const count = Math.max(1, Math.ceil(end * steps));
  for (let i = 1; i <= count; i++) ctx.lineTo(...curve((end * i) / count));
  ctx.stroke();
}
export function ellipse(center: Point, rx: number, ry: number, tilt = 0): Curve {
  return (p) => {
    const x = rx * Math.cos(tau * p),
      y = ry * Math.sin(tau * p);
    return [
      center[0] + x * Math.cos(tilt) - y * Math.sin(tilt),
      center[1] + x * Math.sin(tilt) + y * Math.cos(tilt),
    ];
  };
}
export function wave(from: Point, length: number, amplitude: number, cycles: number, phase: number): Curve {
  return (p) => [from[0] + length * p, from[1] + amplitude * Math.sin(tau * (cycles * p - phase))];
}
export function stars(ctx: Ctx, t: number, count = 100, seed = 4) {
  let state = seed;
  const next = () => (state = (Math.imul(1664525, state) + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < count; i++) {
    const depth = next(),
      x = (next() * width + t * (1 + depth) * 2) % width,
      y = next() * height;
    layer(ctx, { alpha: 0.2 + 0.43 * depth }, () => body(ctx, 'sphere', [x, y], 1.3 + depth * 2, 'chalk', 1));
  }
}

// All shot coordinates use the same 16:9 stage. Letterbox other aspect ratios.
export function renderFrame(ctx: Ctx, shots: readonly Shot[], seconds: number) {
  if (
    !Number.isFinite(seconds) ||
    !shots.length ||
    shots.some((s) => !Number.isFinite(s.duration) || s.duration <= 0)
  )
    throw new RangeError('Expected a finite time and at least one positive-duration shot');
  let local = Math.max(0, seconds),
    shot = shots[shots.length - 1];
  for (let i = 0; i < shots.length; i++) {
    shot = shots[i];
    if (local < shot.duration || i === shots.length - 1) break;
    local -= shot.duration;
  }
  ctx.save();
  try {
    ctx.resetTransform();
    const w = ctx.canvas.width,
      h = ctx.canvas.height,
      scale = Math.min(w / width, h / height);
    ctx.clearRect(0, 0, w, h);
    ctx.translate((w - width * scale) / 2, (h - height * scale) / 2);
    ctx.scale(scale, scale);
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.clip();
    backdrop(ctx);
    shot.draw(ctx, Math.min(local, shot.duration));
    finePixelFinish(ctx);
  } finally {
    ctx.restore();
  }
}
