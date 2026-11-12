import type { Ctx } from '../core.ts';
import { Grid, PAL } from './pixel.ts';
import { ART, drawSprite, type Sprite } from './sprite.ts';
import { clamp, ease, phase, type Point } from './motion.ts';

type XY = { x: number; y: number };
function xy(point: Point): XY { return Array.isArray(point) ? { x: point[0], y: point[1] } : point as XY; }
function artCells(value: number, min = 1): number { return Math.max(min, Math.round(value / ART)); }
function alphaStep(value: number): number { return value > 0.66 ? 1 : value > 0.32 ? 0.66 : 0.34; }
function colorKey(color: string): string { return color.replace('#', ''); }

/** Stable integer hash for deterministic effect placement. */
function hash(seed: number, index: number, lane = 0): number {
  let x = (seed | 0) ^ Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(lane + 7, 0x85ebca6b);
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

function ringSprite(radius: number, width: number, color: string): Sprite {
  const radiusCells = artCells(radius), widthCells = artCells(width, 1), pad = widthCells + 2;
  const cells = radiusCells * 2 + pad * 2 + 1, key = `fx-ring:${radiusCells}:${widthCells}:${colorKey(color)}`;
  const outer = radiusCells + widthCells / 2;
  const inner = Math.max(0, radiusCells - widthCells / 2);
  const g = new Grid(cells, cells).ellipse(cells / 2, cells / 2, outer, outer, color);
  if (inner > 0) g.ellipse(cells / 2, cells / 2, inner, inner, undefined, [color]);
  g.outline(PAL.ink);
  return g.sprite(key);
}

export interface RingOptions { r?: number; width?: number; duration?: number; color?: string }
/** One expanding pixel ring with three calm fade levels; it never flashes or loops. */
export function ring(ctx: Ctx, x: number, y: number, t0: number, t: number, { r = 96, width = 12, duration = 0.44, color = PAL.paper }: RingOptions = {}): void {
  if (t < t0 || duration <= 0) return;
  const p = phase(t, t0, t0 + duration);
  if (p >= 1) return;
  const radius = r * (0.16 + 0.84 * ease.outCubic(p));
  const alpha = alphaStep((1 - p) ** 1.5);
  drawSprite(ctx, ringSprite(radius, width * (1 - p * 0.28), color), x, y, { alpha, anchor: [0.5, 0.5] });
}

export interface SparksOptions { count?: number; seed?: number; duration?: number; color?: string; size?: number }
function sparkSprite(cells: number, color: string): Sprite {
  const key = `fx-spark:${cells}:${colorKey(color)}`;
  const g = new Grid(cells, cells).rect(0, 0, cells, cells, color).outline(PAL.ink);
  if (cells >= 3) g.rect(1, 1, cells - 2, cells - 2, color);
  return g.sprite(key);
}
/** 4–8 deterministic chunky pixels on short eased ballistic paths. */
export function sparks(ctx: Ctx, x: number, y: number, t0: number, t: number, { count = 6, seed = 1, duration = 0.48, color = PAL.gold1, size = ART * 2 }: SparksOptions = {}): void {
  if (t < t0 || duration <= 0) return;
  const p = phase(t, t0, t0 + duration);
  if (p >= 1) return;
  const travel = ease.outCubic(p), alpha = alphaStep((1 - p) ** 1.35), pieces = Math.max(4, Math.min(8, Math.round(count)));
  for (let i = 0; i < pieces; i++) {
    const angle = i / pieces * Math.PI * 2 + (hash(seed, i, 0) - 0.5) * 0.55;
    const distance = 22 + hash(seed, i, 1) * 64, gravity = 14 + hash(seed, i, 2) * 34;
    const origin = 6 + hash(seed, i, 4) * 4;
    const px = x + Math.cos(angle) * (origin + distance * travel);
    const py = y + Math.sin(angle) * (origin + distance * travel) + gravity * p * p;
    const cells = Math.max(1, artCells(size * (0.85 + hash(seed, i, 3) * 0.45)));
    drawSprite(ctx, sparkSprite(cells, color), px, py, { anchor: [0.5, 0.5], alpha });
  }
}

export interface PoofOptions { count?: number; seed?: number; duration?: number; radius?: number; color?: string }
function puffSprite(size: number, color: string): Sprite {
  const cells = Math.max(5, size), key = `fx-puff:${cells}:${colorKey(color)}`;
  const g = new Grid(cells, cells).ellipse(cells / 2, cells / 2, cells / 2 - 0.5, cells / 2 - 0.5, color);
  if (cells >= 9) {
    g.rect(Math.floor(cells * 0.2), Math.floor(cells * 0.28), Math.ceil(cells * 0.2), Math.floor(cells * 0.16), PAL.white);
  }
  g.outline(PAL.ink);
  return g.sprite(key);
}
/** A few chunky stepped puffs separate and rise before fading. */
export function poof(ctx: Ctx, x: number, y: number, t0: number, t: number, { count = 4, seed = 1, duration = 0.52, radius = 28, color = PAL.grey2 }: PoofOptions = {}): void {
  if (t < t0 || duration <= 0) return;
  const p = phase(t, t0, t0 + duration);
  if (p >= 1) return;
  const travel = ease.outCubic(p), alpha = alphaStep((1 - p) ** 1.35), puffs = Math.max(3, Math.min(5, Math.round(count)));
  for (let i = 0; i < puffs; i++) {
    const offset = hash(seed, i, 0) - 0.5, rise = 12 + hash(seed, i, 1) * 24;
    const startCells = Math.max(7, artCells(radius * (0.58 + hash(seed, i, 2) * 0.5)));
    const shrink = Math.floor(p * Math.min(3, Math.max(1, startCells - 6)));
    const px = x + offset * radius * 2.6 * travel, py = y - rise * travel;
    drawSprite(ctx, puffSprite(Math.max(5, startCells - shrink), color), px, py, { anchor: [0.5, 0.5], alpha });
  }
}

export interface SpeedLineOptions {
  t0?: number;
  count?: number;
  seed?: number;
  duration?: number;
  length?: number;
  width?: number;
  color?: string;
}
function streakSprite(lengthCells: number, widthCells: number, color: string): Sprite {
  const cols = Math.max(4, lengthCells), rows = Math.max(3, widthCells + 2), key = `fx-streak:${cols}x${rows}:${colorKey(color)}`;
  const g = new Grid(cols, rows).poly([
    { x: 0, y: rows / 2 },
    { x: Math.max(1, cols - 3), y: 1 },
    { x: cols - 1, y: rows / 2 },
    { x: Math.max(1, cols - 3), y: rows - 1 },
  ], color).outline(PAL.ink);
  return g.sprite(key);
}
/** Up to five tapered pixel streaks behind an object's current float position. */
export function speedLines(ctx: Ctx, x: number, y: number, velocity: Point, t: number, { t0 = 0, count = 4, seed = 1, duration = 0.3, length = 100, width = 18, color = PAL.paper }: SpeedLineOptions = {}): void {
  if (t < t0 || duration <= 0) return;
  const p = phase(t, t0, t0 + duration);
  if (p >= 1) return;
  const v = xy(velocity), magnitude = Math.hypot(v.x, v.y);
  if (magnitude < 1) return;
  const dx = v.x / magnitude, dy = v.y / magnitude;
  const eased = ease.outCubic(p), alpha = alphaStep(Math.sin(Math.PI * p) ** 0.65), lines = Math.max(1, Math.min(5, Math.round(count)));
  for (let i = 0; i < lines; i++) {
    const centered = i - (lines - 1) / 2;
    const offset = centered * width * 1.8 + (hash(seed, i, 0) - 0.5) * width * 0.35;
    const lineLength = length * (0.56 + hash(seed, i, 1) * 0.44) * (0.45 + 0.55 * eased);
    const tipX = x - dx * (12 + i * 5) - dy * offset;
    const tipY = y - dy * (12 + i * 5) + dx * offset;
    const len = artCells(lineLength, 4), thick = artCells(width * (0.75 + 0.2 * alpha), 2);
    const sprite = streakSprite(len, thick, color);
    drawSprite(ctx, sprite, tipX, tipY, { anchor: [1, 0.5], rot: Math.atan2(dy, dx), alpha });
  }
}

/** Scale-in progress for drawSprite; reaches 1 with a restrained overshoot. */
export function pop(progress: number, overshoot = 0.14): number {
  const p = clamp(progress);
  if (p === 0) return 0;
  const amount = 1.70158 * clamp(overshoot / 0.14, 0.35, 1.8);
  return Math.max(0, ease.outBack(p, amount));
}
