import type { Ctx } from '../core.ts';
import { Grid, PAL } from './pixel.ts';
import { ART, drawSprite, makeSprite, type DrawSpriteOptions, type Sprite } from './sprite.ts';
import { paintPixelText, measure, type PixelFace } from './type.ts';
import { clamp, ease, type Point } from './motion.ts';

export const STAGE_BG = '#0B0B0D';
export const STAGE_WHITE = PAL.paper;
export const STAGE_INK = PAL.ink;
export const PRICE_UP = PAL.UP;
export const PRICE_DOWN = PAL.DOWN;

type XY = { x: number; y: number };
type P = Point;
function isTuple(point: P): point is readonly [number, number] { return Array.isArray(point); }
function xy(point: P): XY { return isTuple(point) ? { x: point[0], y: point[1] } : point; }
const px = (value: number) => value / ART;
const artWidth = (value: number, minimum = 1) => Math.max(minimum, Math.round(value / ART));
function keyNum(value: number): string { return (Math.round(value / ART * 2) / 2).toString(); }
function keyColor(color: string): string { return color.replace('#', ''); }
function pathLength(points: readonly XY[]): number { let result = 0; for (let i = 1; i < points.length; i++) result += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y); return result; }
function pointAt(points: readonly XY[], distance: number): { point: XY; tangent: XY } {
  let remaining = Math.max(0, distance);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!, len = Math.hypot(b.x - a.x, b.y - a.y);
    if (remaining <= len || i === points.length - 1) {
      const t = len ? clamp(remaining / len) : 1;
      return { point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, tangent: { x: b.x - a.x, y: b.y - a.y } };
    }
    remaining -= len;
  }
  const a = points[points.length - 2] ?? { x: 0, y: 0 }, b = points[points.length - 1] ?? a;
  return { point: b, tangent: { x: b.x - a.x, y: b.y - a.y } };
}
function through(points: readonly XY[], distance: number): XY[] {
  const result = [points[0]!];
  if (distance <= 0) return result;
  let remaining = distance;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!, len = Math.hypot(b.x - a.x, b.y - a.y);
    if (remaining >= len) { result.push(b); remaining -= len; }
    else { const t = len ? remaining / len : 1; result.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }); break; }
  }
  return result;
}
function bezier(a: XY, c: XY, b: XY, t: number): XY {
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
}

interface PathRaster {
  grid: Grid;
  left: number;
  top: number;
  local(point: XY): XY;
}
function pathRaster(points: readonly XY[], pad: number): PathRaster {
  const origin = points[0] ?? { x: 0, y: 0 };
  const artPoints = points.map(point => ({ x: px(point.x - origin.x), y: px(point.y - origin.y) }));
  const minX = Math.floor(Math.min(...artPoints.map(point => point.x)) - pad);
  const minY = Math.floor(Math.min(...artPoints.map(point => point.y)) - pad);
  const maxX = Math.ceil(Math.max(...artPoints.map(point => point.x)) + pad);
  const maxY = Math.ceil(Math.max(...artPoints.map(point => point.y)) + pad);
  const raster = {
    grid: new Grid(Math.max(1, maxX - minX), Math.max(1, maxY - minY)),
    left: origin.x + minX * ART,
    top: origin.y + minY * ART,
    local(point: XY) { return { x: px(point.x - origin.x) - minX, y: px(point.y - origin.y) - minY }; },
  };
  return raster;
}
function drawPolyline(grid: Grid, points: readonly XY[], width: number, color: string, outline = true): void {
  for (let i = 1; i < points.length; i++) grid.line(points[i - 1]!, points[i]!, width, color);
  if (outline && grid.data.some(Boolean)) grid.outline(PAL.ink);
}
function drawSpriteAt(ctx: Ctx, sprite: Sprite, x: number, y: number, options: DrawSpriteOptions = {}): void {
  drawSprite(ctx, sprite, x, y, { ...options, anchor: options.anchor ?? [0, 0] });
}

export interface StageShadow { x: number; y: number; w: number; h?: number }
export type FloorLine = boolean | { y?: number; color?: string; width?: number };
export interface StageOptions { floorY?: number; line?: FloorLine; shadow?: readonly StageShadow[] }

const shadowCache = new Map<string, Sprite>();
function shadowSprite(w: number, h: number, color: string): Sprite {
  const cols = Math.max(2, artWidth(w)), rows = Math.max(1, artWidth(h));
  const key = `stage-shadow:${cols}x${rows}:${keyColor(color)}`;
  const hit = shadowCache.get(key); if (hit) return hit;
  const grid = new Grid(cols, rows).ellipse(cols / 2, rows / 2, cols / 2, rows / 2, color);
  const sprite = grid.sprite(key); shadowCache.set(key, sprite); return sprite;
}
function floorSprite(width: number, height: number, color: string): Sprite {
  const cols = Math.max(1, artWidth(width)), rows = Math.max(1, artWidth(height)), key = `stage-floor:${cols}x${rows}:${keyColor(color)}`;
  return makeSprite(key, cols, rows, ctx => { ctx.fillStyle = color; ctx.fillRect(0, 0, cols, rows); });
}

/** Fill the flat stage and optionally draw a one-pixel-grid floor and solid pixel shadows. */
export function drawStage(ctx: Ctx, { floorY, line: lineOption, shadow = [] }: StageOptions = {}): void {
  ctx.save();
  ctx.fillStyle = STAGE_BG;
  ctx.fillRect(0, 0, 1080, 1290);
  for (const item of shadow) {
    const h = item.h ?? item.w * 0.18;
    drawSprite(ctx, shadowSprite(item.w, h, '#050506'), item.x, item.y, { anchor: [0.5, 0.5] });
  }
  const lineConfig = typeof lineOption === 'object' ? lineOption : {};
  const drawLine = lineOption ?? floorY !== undefined;
  if (drawLine) {
    const y = Math.round((lineConfig.y ?? floorY ?? 1120) / ART) * ART;
    const lineHeight = Math.max(ART, lineConfig.width ?? ART);
    drawSpriteAt(ctx, floorSprite(960, lineHeight, lineConfig.color ?? PAL.grey5), 60, y - Math.round(lineHeight / 2));
  }
  ctx.restore();
}

export type LabelVariant = 'sign' | 'tag' | 'stamp' | 'bubble';
export interface LabelOptions {
  variant?: LabelVariant;
  /** Kept for compatibility; the heavy face is 54 px high, in ART-sized cells. */
  size?: number;
  bg?: string;
  fg?: string;
  rot?: number;
  /** Scale applied at draw time; use briefly for a pop (for example 1.08). */
  pop?: number | boolean;
  maxWidth?: number;
  face?: PixelFace;
}
const labelCache = new Map<string, Sprite>();
function wrapLabel(text: string, maxWidth: number | undefined, padCells: number, scale: number): string[] {
  const raw = String(text ?? '').toUpperCase().trim();
  if (!raw) return [''];
  const maxCells = maxWidth ? Math.max(8, Math.floor(maxWidth / (ART * scale)) - padCells * 2) : Infinity;
  if (!Number.isFinite(maxCells)) return [raw];
  const lines: string[] = [];
  let line = '';
  for (const word of raw.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && measure(candidate).cols <= maxCells) { line = candidate; continue; }
    if (line) lines.push(line);
    if (measure(word).cols <= maxCells) { line = word; continue; }
    let chunk = '';
    for (const char of [...word]) {
      const next = chunk + char;
      if (chunk && measure(next).cols > maxCells) { lines.push(chunk); chunk = char; }
      else chunk = next;
    }
    line = chunk;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}
function labelSprite(text: string, variant: LabelVariant, options: LabelOptions): Sprite {
  const color = options.fg ?? (variant === 'stamp' ? PAL.red2 : PAL.ink);
  const bg = options.bg ?? PAL.paper;
  const scale = Math.max(1, Math.round(Math.max(54, options.size ?? 56) / 54));
  const lines = wrapLabel(text, options.maxWidth, variant === 'stamp' ? 3 : 4, scale);
  const metrics = lines.map(line => measure(line));
  const textCols = Math.max(0, ...metrics.map(item => item.cols * scale));
  const padX = variant === 'stamp' ? 3 : 2;
  const padY = 2;
  const bodyW = textCols + padX * 2;
  const bodyH = metrics.reduce((sum, item) => sum + item.rows * scale, 0) + Math.max(0, lines.length - 1) * scale + padY * 2;
  const top = variant === 'tag' ? 4 : 0, tail = variant === 'bubble' ? 4 : 0;
  const cols = bodyW + (variant === 'tag' ? 1 : 0), rows = bodyH + top + tail;
  const key = `stage-label:${variant}:${lines.join('|')}:${color}:${bg ?? ''}:${scale}:${cols}x${rows}`;
  const hit = labelCache.get(key); if (hit) return hit;
  const g = new Grid(cols, rows);
  const bodyY = top, bx = variant === 'tag' ? 0 : 0, bodyX = bx;

  if (variant === 'stamp') {
    if (bg) g.rect(bodyX, bodyY, bodyW, bodyH, bg);
    g.rect(bodyX, bodyY, bodyW, 1, color).rect(bodyX, bodyY + bodyH - 1, bodyW, 1, color)
      .rect(bodyX, bodyY, 1, bodyH, color).rect(bodyX + bodyW - 1, bodyY, 1, bodyH, color);
    if (bodyW > 6 && bodyH > 6) {
      g.rect(bodyX + 2, bodyY + 2, bodyW - 4, 1, color).rect(bodyX + 2, bodyY + bodyH - 3, bodyW - 4, 1, color)
        .rect(bodyX + 2, bodyY + 2, 1, bodyH - 4, color).rect(bodyX + bodyW - 3, bodyY + 2, 1, bodyH - 4, color);
    }
  } else if (variant === 'tag') {
    const tag = [{ x: 0, y: bodyY }, { x: bodyW - 2, y: bodyY }, { x: bodyW, y: bodyY + 2 }, { x: bodyW, y: bodyY + bodyH }, { x: 0, y: bodyY + bodyH }];
    g.poly(tag, bg).outline(PAL.ink);
    g.rect(Math.floor(bodyW / 2), 0, 1, Math.max(1, bodyY - 1), PAL.ink);
    g.ellipse(bodyW - 2.4, bodyY + 2.3, 1, 1, PAL.ink);
  } else {
    g.round(bodyX, bodyY, bodyW, bodyH, variant === 'bubble' ? 2 : 0, bg);
    if (variant === 'bubble') {
      const tailX = Math.max(3, Math.floor(bodyW * 0.32));
      g.poly([{ x: tailX, y: bodyY + bodyH - 1 }, { x: tailX + 4, y: rows - 1 }, { x: tailX + 6, y: bodyY + bodyH - 1 }], bg);
    }
    g.outline(PAL.ink);
  }

  const textHeight = metrics.reduce((sum, item) => sum + item.rows * scale, 0) + Math.max(0, lines.length - 1) * scale;
  let textY = bodyY + Math.floor((bodyH - textHeight) / 2);
  lines.forEach((line, index) => {
    const m = metrics[index]!, width = m.cols * scale;
    const textX = bodyX + Math.floor((bodyW - width) / 2);
    if (scale === 1) paintPixelText(g, line, textX, textY, color, options.face ?? 'heavy');
    else {
      const unit = new Grid(Math.max(1, m.cols), 9);
      paintPixelText(unit, line, 0, 0, color, options.face ?? 'heavy');
      for (let yy = 0; yy < 9; yy++) for (let xx = 0; xx < m.cols; xx++) {
        const cell = unit.get(xx, yy);
        if (cell) g.rect(textX + xx * scale, textY + yy * scale, scale, scale, cell);
      }
    }
    textY += m.rows * scale + scale;
  });
  const sprite = g.sprite(key); labelCache.set(key, sprite); return sprite;
}

/** Draw a grid-built sign, hanging tag, red stamp, or speech bubble. */
export function label(ctx: Ctx, text: string, x: number, y: number, options: LabelOptions = {}): { x: number; y: number; w: number; h: number } {
  const variant = options.variant ?? 'sign';
  const sprite = labelSprite(String(text ?? '').toUpperCase(), variant, options);
  const pop = typeof options.pop === 'number' ? options.pop : options.pop ? 1.08 : 1;
  drawSprite(ctx, sprite, x, y, { scale: pop, rot: options.rot, anchor: [0.5, 0.5] });
  return { x: x - sprite.w * pop / 2, y: y - sprite.h * pop / 2, w: sprite.w * pop, h: sprite.h * pop };
}

export interface ArrowOptions { color?: string; width?: number; progress?: number; curve?: number }
const arrowHeadCache = new Map<string, Sprite>();
function arrowHead(color: string, width: number): { sprite: Sprite; tip: number; len: number } {
  const widthArt = artWidth(width, 3), len = Math.max(6, Math.ceil(widthArt * 2.3)), thick = Math.max(7, Math.ceil(widthArt * 2.3));
  const cols = len + 2, rows = thick + 2, key = `stage-arrow-head:${keyColor(color)}:${cols}x${rows}`;
  let sprite = arrowHeadCache.get(key);
  if (!sprite) {
    const g = new Grid(cols, rows).poly([{ x: 1, y: 1 }, { x: cols - 1, y: rows / 2 }, { x: 1, y: rows - 1 }], color).outline(PAL.ink);
    sprite = g.sprite(key); arrowHeadCache.set(key, sprite);
  }
  return { sprite, tip: cols - 1, len };
}
function curvePoints(a: XY, b: XY, curve: number, samples = 72): XY[] {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
  const control = { x: (a.x + b.x) / 2 - dy / d * curve, y: (a.y + b.y) / 2 + dx / d * curve };
  return Array.from({ length: samples + 1 }, (_, i) => bezier(a, control, b, i / samples));
}
function rasterPath(ctx: Ctx, prefix: string, points: readonly XY[], width: number, color: string, distance: number, pad: number, minWidthCells = 2): void {
  if (points.length < 2 || distance <= 0) return;
  const raster = pathRaster(points, pad), artPoints = through(points, distance).map(raster.local);
  const widthCells = artWidth(width, minWidthCells);
  const key = `${prefix}:${artPoints.map(p => `${Math.round(p.x * 2)}/${Math.round(p.y * 2)}`).join(';')}:${widthCells}:${keyColor(color)}`;
  const grid = raster.grid;
  drawPolyline(grid, artPoints, widthCells, color);
  drawSpriteAt(ctx, grid.sprite(key), raster.left, raster.top);
}

/** A 3-art-pixel stepped shaft and large pixel head, revealed along an eased path. */
export function arrow(ctx: Ctx, from: P, to: P, { color = STAGE_WHITE, width = 18, progress = 1, curve = 0 }: ArrowOptions = {}): void {
  const a = xy(from), b = xy(to), points = curvePoints(a, b, curve), total = pathLength(points);
  if (!total || progress <= 0) return;
  const p = ease.outCubic(clamp(progress)), travelled = total * p;
  const head = arrowHead(color, width), headLen = head.len * ART;
  const { point, tangent } = pointAt(points, travelled);
  const shaftEnd = Math.max(0, travelled - headLen * 0.76);
  rasterPath(ctx, `arrow:${keyNum(b.x - a.x)}:${keyNum(b.y - a.y)}:${keyNum(curve)}`, points, width, color, shaftEnd, Math.max(5, artWidth(width, 3)), 3);
  if (p > 0.025) drawSprite(ctx, head.sprite, point.x, point.y, { anchor: [head.tip / head.sprite.cols, 0.5], rot: Math.atan2(tangent.y, tangent.x) });
}

export interface LoopArrowOptions { progress?: number; spin?: number; color?: string; width?: number }
/** Pixel ring with a large arrowhead; `spin` rotates the whole cached ring smoothly. */
export function loopArrow(ctx: Ctx, cx: number, cy: number, r: number, { progress = 1, spin = 0, color = STAGE_WHITE, width = 18 }: LoopArrowOptions = {}): void {
  const radius = Math.max(5, Math.round(r / ART)), widthCells = artWidth(width, 3);
  const circumference = Math.PI * 1.76 * radius;
  const eased = ease.outCubic(clamp(progress)), revealed = circumference * eased;
  if (revealed <= 0) return;
  const base = -Math.PI / 2, sweep = Math.PI * 1.76, steps = Math.max(16, Math.ceil(circumference * 2));
  const size = radius * 2 + widthCells * 2 + 16, center = size / 2;
  const points = Array.from({ length: steps + 1 }, (_, i) => {
    const angle = base + sweep * i / steps;
    return { x: center + Math.cos(angle) * radius, y: center + Math.sin(angle) * radius };
  });
  const partial = through(points, circumference * eased), g = new Grid(size, size);
  drawPolyline(g, partial, widthCells, color);
  const state = Math.floor(circumference * eased), key = `loop-ring:${radius}:${widthCells}:${keyColor(color)}:${state}`;
  drawSprite(ctx, g.sprite(key), cx, cy, { anchor: [0.5, 0.5], rot: spin });
  const endAngle = base + sweep * eased, tip0 = { x: Math.cos(endAngle) * radius * ART, y: Math.sin(endAngle) * radius * ART };
  const tip = { x: cx + tip0.x * Math.cos(spin) - tip0.y * Math.sin(spin), y: cy + tip0.x * Math.sin(spin) + tip0.y * Math.cos(spin) };
  const head = arrowHead(color, width);
  drawSprite(ctx, head.sprite, tip.x, tip.y, { anchor: [head.tip / head.sprite.cols, 0.5], rot: endAngle + Math.PI / 2 + spin });
}

export interface PriceLineOptions {
  color?: string;
  width?: number;
  progress?: number;
  head?: 'dot' | 'arrow' | false;
  fill?: boolean;
  fillAlpha?: number;
  baseline?: number;
}
export interface PriceLineHead { x: number; y: number; progress: number; direction: 'up' | 'down' | 'flat' }
function circleSprite(color: string, diameter: number): Sprite {
  const cells = Math.max(3, artWidth(diameter, 3)), key = `stage-dot:${cells}:${keyColor(color)}`;
  return makeSprite(key, cells, cells, ctx => {
    const g = new Grid(cells, cells).ellipse(cells / 2, cells / 2, cells / 2 - 0.5, cells / 2 - 0.5, color).outline(PAL.ink);
    for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) { const c = g.get(x, y); if (c) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); } }
  });
}
function priceArea(ctx: Ctx, points: readonly XY[], baseline: number, color: string, alpha: number, progressDistance: number): void {
  const revealed = through(points, progressDistance);
  if (revealed.length < 2) return;
  const areaPoints = [...revealed, { x: revealed[revealed.length - 1]!.x, y: baseline }, { x: revealed[0]!.x, y: baseline }];
  const raster = pathRaster(areaPoints, 1), localPoints = areaPoints.map(raster.local), polygon = localPoints;
  const g = raster.grid;
  g.poly(polygon, color);
  const key = `price-area:${localPoints.map(p => `${Math.round(p.x * 2)}/${Math.round(p.y * 2)}`).join(';')}:${keyColor(color)}:${Math.round(alpha * 10)}`;
  drawSpriteAt(ctx, g.sprite(key), raster.left, raster.top, { alpha: clamp(alpha) });
}
/** Thick pixel market path. A rising path defaults red, falling defaults green. */
export function priceLine(ctx: Ctx, points: readonly P[], options: PriceLineOptions = {}): PriceLineHead | null {
  if (points.length < 2) return null;
  const path = points.map(xy), first = path[0]!, last = path[path.length - 1]!;
  const direction: PriceLineHead['direction'] = last.y < first.y ? 'up' : last.y > first.y ? 'down' : 'flat';
  const color = options.color ?? (direction === 'up' ? PAL.UP : direction === 'down' ? PAL.DOWN : STAGE_WHITE);
  const eased = ease.outCubic(clamp(options.progress ?? 1)), total = pathLength(path), distance = total * eased;
  if (distance <= 0) return null;
  const { point: headPoint, tangent } = pointAt(path, distance);
  const width = options.width ?? 18, headStyle = options.head ?? 'arrow';
  if (options.fill) {
    const dark = direction === 'up' ? PAL.red3 : direction === 'down' ? PAL.green4 : PAL.grey5;
    priceArea(ctx, path, options.baseline ?? Math.max(...path.map(point => point.y)), dark, options.fillAlpha ?? 0.32, distance);
  }
  rasterPath(ctx, `price:${path.slice(1).map(point => `${keyNum(point.x - first.x)},${keyNum(point.y - first.y)}`).join('|')}`, path, width, color, distance, artWidth(width, 3) + 2, 3);
  if (headStyle === 'arrow') {
    const head = arrowHead(color, width);
    drawSprite(ctx, head.sprite, headPoint.x, headPoint.y, { anchor: [head.tip / head.sprite.cols, 0.5], rot: Math.atan2(tangent.y, tangent.x) });
  } else if (headStyle === 'dot') {
    drawSprite(ctx, circleSprite(color, width * 1.8), headPoint.x, headPoint.y, { anchor: [0.5, 0.5] });
  }
  return { x: headPoint.x, y: headPoint.y, progress: eased, direction };
}

export type CandleTrend = 'up' | 'down';
export interface CandleOptions {
  /** Explicit close targets, or a deterministic market trend used to make a plausible series. */
  closes?: readonly number[] | CandleTrend;
  count?: number;
  /** Overall reveal, 0…1, used when `revealAt` is omitted. */
  progress?: number;
  /** Per-candle reveal start times in seconds. Pair with `t` for timed reveals. */
  revealAt?: readonly number[];
  revealDuration?: number;
  t?: number;
  seed?: number;
  /** Market body colours: rising closes are green; falling closes are red. */
  colorUp?: string;
  colorDown?: string;
  axes?: boolean;
  dollar?: boolean;
}
export interface CandleHead { x: number; y: number; progress: number; index: number; direction: CandleTrend }

interface CandleDatum { open: number; high: number; low: number; close: number }
function seededUnit(seed: number): () => number {
  let state = (Math.trunc(seed) | 0) || 0x6d2b79f5;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 0xffffffff;
  };
}
function interpolateSeries(values: readonly number[], index: number, count: number): number {
  if (values.length <= 1) return values[0] ?? 0.5;
  const at = count <= 1 ? values.length - 1 : index * (values.length - 1) / (count - 1);
  const lo = Math.floor(at), hi = Math.min(values.length - 1, lo + 1);
  return values[lo]! + (values[hi]! - values[lo]!) * (at - lo);
}
/**
 * Plausible market candles. A trend is a drifting random walk, not a straight line: most candles go with the
 * trend, but roughly every third one is a pullback in the other colour; bodies vary (a few big trend candles,
 * some small ones, the odd doji), wicks show intrabar range, and the next open sits near — not always exactly at —
 * the previous close. The LAST candle always goes with the trend, so the newest candle revealed on a narration
 * beat is the move the story talks about.
 */
function candleData(options: CandleOptions, count: number): CandleDatum[] {
  const random = seededUnit((options.seed ?? 0) * 7919 + count * 101 + 17), trend = options.closes === 'down' ? -1 : 1;
  const explicit = Array.isArray(options.closes) ? options.closes.filter(Number.isFinite) : [];
  if (explicit.length) {
    // Explicit closes: follow them, but give each candle a realistic open and wicks.
    let previous = explicit[0]! - (explicit.length > 1 ? explicit[1]! - explicit[0]! : 0.08) * 0.6;
    return Array.from({ length: count }, (_, index) => {
      const close = interpolateSeries(explicit, index, count), open = previous + (random() - 0.5) * 0.02;
      const range = Math.abs(close - open) + 0.03;
      previous = close;
      return { open, close, high: Math.max(open, close) + range * (0.15 + random() * 0.45), low: Math.min(open, close) - range * (0.15 + random() * 0.45) };
    });
  }
  // Choose which candles are pullbacks: about one in three, never two in a row, never the first or the last.
  const pullback = Array.from({ length: count }, () => false);
  for (let index = 1; index < count - 1; index++) if (!pullback[index - 1] && random() < 0.38) pullback[index] = true;
  if (count >= 4 && !pullback.some(Boolean)) pullback[Math.max(1, Math.floor(count / 2) - 1)] = true;
  const moves = pullback.map((pb, index) => {
    const last = index === count - 1;
    const size = pb ? 0.35 + random() * 0.45 : (random() < 0.22 ? 0.12 + random() * 0.15 : 0.7 + random() * 0.8) * (last ? 1.35 : 1);
    return (pb ? -trend : trend) * size;
  });
  // Normalise so the series spans a healthy part of the chart.
  const total = moves.reduce((sum, move) => sum + move, 0) || trend;
  const scale = 0.62 / Math.abs(total);
  let close = trend > 0 ? 0.2 : 0.82;
  return moves.map(move => {
    const open = close + (random() - 0.5) * 0.018; // tiny gap between candles
    close = open + move * scale;
    const body = Math.abs(close - open), range = Math.max(0.025, body);
    const upper = range * (0.12 + random() * (move * trend > 0 ? 0.35 : 0.7)), lower = range * (0.12 + random() * (move * trend > 0 ? 0.7 : 0.35));
    return { open, close, high: Math.max(open, close) + upper, low: Math.min(open, close) - lower };
  });
}
function candleAxes(cols: number, rows: number): Sprite {
  const key = `stage-candle-axes:${cols}x${rows}`;
  const grid = new Grid(cols, rows);
  const left = 3, top = 3, right = cols - 2, bottom = rows - 3;
  grid.rect(left, top, 1, bottom - top + 1, PAL.grey3);
  grid.rect(left, bottom, right - left + 1, 1, PAL.grey3);
  for (let i = 1; i <= 3; i++) {
    const yy = Math.round(top + (bottom - top) * i / 4);
    const xx = Math.round(left + (right - left) * i / 4);
    grid.rect(left, yy, 3, 1, PAL.grey3);
    grid.rect(xx, bottom - 2, 1, 3, PAL.grey3);
  }
  return grid.sprite(key);
}
function candleDollar(): Sprite {
  const grid = new Grid(16, 16);
  grid.round(0, 0, 16, 16, 2, PAL.ink);
  grid.round(1, 1, 14, 14, 1, PAL.paper);
  const glyph = ['..######..', '.##....##.', '##......##', '##........', '.########.', '....####..', '........##', '##......##', '.##....##.', '..######..'];
  for (let y = 0; y < glyph.length; y++) for (let x = 0; x < glyph[y]!.length; x++) if (glyph[y]![x] === '#') grid.rect(x + 3, y + 3, 1, 1, PAL.ink);
  grid.rect(7, 1, 2, 14, PAL.ink);
  return grid.sprite('stage-candle-dollar-plate');
}
function candleBodySprite(
  width: number, height: number, openY: number, closeY: number, highY: number, lowY: number,
  progress: number, color: string, light: string, wickColor: string, keyPrefix: string,
): Sprite {
  const growth = Math.max(0, Math.min(1.08, ease.outBack(progress, 0.65)));
  const currentY = Math.max(0, Math.min(height - 1, Math.round(openY + (closeY - openY) * growth)));
  let top = Math.min(openY, currentY), bottom = Math.max(openY, currentY);
  if (bottom - top + 1 < 3) {
    if (closeY < openY) top = Math.max(0, openY - 2);
    else bottom = Math.min(height - 1, openY + 2);
  }
  const wickTop = Math.round(openY + (highY - openY) * progress);
  const wickBottom = Math.round(openY + (lowY - openY) * progress);
  const key = `${keyPrefix}:${Math.round(progress * 100)}:${currentY}:${wickTop}:${wickBottom}:${color}:${light}:${wickColor}`;
  return makeSprite(key, width, height, ctx => {
    const g = new Grid(width, height);
    const wickX = Math.floor(width / 2);
    // Ink wicks disappear against the near-black stage. Use the darkest market
    // shade so each one-pixel wick stays visible while the body keeps its ink outline.
    g.rect(wickX, Math.min(wickTop, wickBottom), 1, Math.max(1, Math.abs(wickBottom - wickTop) + 1), wickColor);
    const bodyH = bottom - top + 1;
    g.rect(0, top, width, bodyH, PAL.ink);
    if (bodyH > 2 && width > 2) {
      g.rect(1, top + 1, width - 2, bodyH - 2, color);
      if (bodyH > 3) g.rect(1, top + 1, 1, 1, light);
    }
    for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++) {
      const cell = g.get(x, y); if (!cell) continue;
      ctx.fillStyle = cell; ctx.fillRect(x, y, 1, 1);
    }
  });
}
/** Draw a chunky pixel-art candlestick chart and return the newest visible close. */
export function candles(ctx: Ctx, x: number, y: number, w: number, h: number, options: CandleOptions = {}): CandleHead | null {
  const explicitCount = Array.isArray(options.closes) ? options.closes.length : 0;
  const count = Math.max(1, Math.min(32, Math.round(options.count ?? (explicitCount || 6))));
  const cols = Math.max(24, Math.ceil(w / ART)), rows = Math.max(20, Math.ceil(h / ART));
  const withAxes = options.axes ?? false, left = withAxes ? 10 : 2, right = withAxes ? 3 : 2;
  const top = withAxes ? 5 : 2, bottom = withAxes ? 7 : 2;
  const plotCols = Math.max(1, cols - left - right), plotRows = Math.max(8, rows - top - bottom);
  if (withAxes) drawSprite(ctx, candleAxes(cols, rows), x, y, { anchor: [0, 0] });
  if (options.dollar) drawSprite(ctx, candleDollar(), x + ART * (withAxes ? 0 : 1), y - ART * 8, { anchor: [0, 0] });

  const data = candleData(options, count);
  const values = data.flatMap(candle => [candle.open, candle.high, candle.low, candle.close]);
  let minValue = Math.min(...values), maxValue = Math.max(...values);
  const span = Math.max(0.08, maxValue - minValue), pad = span * 0.1;
  minValue -= pad; maxValue += pad;
  const toCell = (value: number) => Math.max(1, Math.min(plotRows - 2, Math.round((maxValue - value) / (maxValue - minValue) * (plotRows - 1))));
  const slot = plotCols / count;
  const bodyWidth = Math.max(4, Math.min(14, Math.floor(slot * 0.68)));
  const t = options.t ?? 0, duration = Math.max(0.08, options.revealDuration ?? 0.34);
  const states = data.map((_, index) => {
    const start = options.revealAt?.[index];
    if (start !== undefined && Number.isFinite(start)) {
      const p = (t - start) / duration;
      return ease.outCubic(Math.max(0, Math.min(1, p)));
    }
    return ease.outCubic(Math.max(0, Math.min(1, (options.progress ?? 1) * count - index)));
  });
  const latest = states.reduce((found, state, index) => state > 0 ? index : found, -1);
  if (latest < 0) return null;

  let latestCloseY = 0, latestDirection: CandleTrend = 'up', latestX = 0;
  for (let index = 0; index <= latest; index++) {
    const p = states[index]!;
    if (p <= 0) continue;
    const candle = data[index]!, openY = toCell(candle.open), closeY = toCell(candle.close);
    const highY = toCell(candle.high), lowY = toCell(candle.low);
    const rising = candle.close >= candle.open;
    const color = rising ? (options.colorUp ?? PAL.DOWN) : (options.colorDown ?? PAL.UP);
    const light = rising ? PAL.green1 : PAL.red1;
    const wickColor = rising ? PAL.green4 : PAL.red3;
    const steps = Math.max(6, Math.min(24, Math.round(Math.abs(closeY - openY) * 1.25)));
    const discrete = Math.round(p * steps) / steps;
    const candleSprite = candleBodySprite(bodyWidth, plotRows, openY, closeY, highY, lowY, discrete, color, light,
      wickColor, `stage-candle:${count}:${index}:${bodyWidth}x${plotRows}:${openY}:${closeY}:${highY}:${lowY}`);
    // Resting candle sprites sit on whole art cells so their outlines stay crisp.
    const cellX = left + Math.round(slot * index + (slot - bodyWidth) / 2);
    const centerX = x + (left + slot * (index + 0.5)) * ART;
    const tick = index === latest && p >= 1 ? Math.sin(t * Math.PI * 2 * 1.1 + (options.seed ?? 0)) * ART * 0.24 : 0;
    drawSprite(ctx, candleSprite, x + cellX * ART, y + top * ART, { anchor: [0, 0] });
    if (index === latest) {
      const growth = Math.max(0, Math.min(1.08, ease.outBack(discrete, 0.65)));
      latestDirection = rising ? 'up' : 'down';
      // Let the carried marker tick while the cached candle itself stays crisp.
      latestCloseY = y + (top + Math.round(openY + (closeY - openY) * growth) + 0.5) * ART + tick;
      const previousX = index > 0 ? x + (left + slot * (index - 0.5)) * ART : centerX;
      latestX = previousX + (centerX - previousX) * p;
    }
  }
  const headState = states[latest]!;
  return { x: latestX, y: latestCloseY, progress: headState, index: latest, direction: latestDirection };
}

export interface BarOptions { progress?: number; color?: string; background?: string; direction?: 'right' | 'left' | 'up' | 'down' }
/** A bordered, art-grid bar that grows one stable art cell at a time. */
export function bar(ctx: Ctx, x: number, y: number, w: number, h: number, { progress = 1, color = STAGE_WHITE, background, direction = 'right' }: BarOptions = {}): void {
  const cols = Math.max(2, artWidth(w)), rows = Math.max(2, artWidth(h));
  const usableW = Math.max(1, cols - 2), usableH = Math.max(1, rows - 2), p = ease.outCubic(clamp(progress));
  const amount = direction === 'left' || direction === 'right' ? Math.floor(usableW * p) : Math.floor(usableH * p);
  const key = `stage-bar:${cols}x${rows}:${direction}:${amount}:${keyColor(color)}:${keyColor(background ?? '')}`;
  const g = new Grid(cols, rows);
  if (background) g.rect(1, 1, usableW, usableH, background);
  if (direction === 'right') g.rect(1, 1, amount, usableH, color);
  else if (direction === 'left') g.rect(1 + usableW - amount, 1, amount, usableH, color);
  else if (direction === 'down') g.rect(1, 1, usableW, amount, color);
  else g.rect(1, 1 + usableH - amount, usableW, amount, color);
  g.outline(PAL.ink);
  drawSpriteAt(ctx, g.sprite(key), x, y);
}

export interface ConnectorOptions { color?: string; width?: number; slack?: number; curve?: number }
/** Pixel catenary tether. Geometry is stable on the local art grid and moves at float coordinates. */
export function connector(ctx: Ctx, from: P, to: P, { color = PAL.grey2, width = 12, slack = 30, curve = 0 }: ConnectorOptions = {}): void {
  const a = xy(from), b = xy(to), control = { x: (a.x + b.x) / 2 + curve, y: (a.y + b.y) / 2 + slack };
  const points = Array.from({ length: 65 }, (_, i) => bezier(a, control, b, i / 64));
  rasterPath(ctx, `connector:${keyNum(b.x - a.x)}:${keyNum(b.y - a.y)}:${keyNum(slack)}:${keyNum(curve)}`, points, width, color, pathLength(points), artWidth(width, 2) + 2);
}

export interface RectBounds { x: number; y: number; w?: number; h?: number; width?: number; height?: number }
export interface EdgeBounds { left: number; top: number; right: number; bottom: number }
type Bounds = RectBounds | EdgeBounds;
function edges(rect: Bounds): EdgeBounds {
  return 'right' in rect ? rect : { left: rect.x, top: rect.y, right: rect.x + (rect.w ?? rect.width ?? 0), bottom: rect.y + (rect.h ?? rect.height ?? 0) };
}
/** Throw when a scratch-test object would leave the readable 1080×1290 stage. */
export function assertInside(bounds: Bounds, margin = 0): true {
  const b = edges(bounds), m = Math.max(0, margin);
  if (b.left < m || b.top < m || b.right > 1080 - m || b.bottom > 1290 - m) throw new RangeError(`Object bounds ${JSON.stringify(b)} leave the stage with ${m}px margin`);
  return true;
}
/** Throw when two scratch-test boxes sit closer than the requested clear gap. */
export function assertGap(a: Bounds, b: Bounds, min: number): number {
  const aa = edges(a), bb = edges(b), dx = Math.max(0, aa.left - bb.right, bb.left - aa.right), dy = Math.max(0, aa.top - bb.bottom, bb.top - aa.bottom);
  const gap = Math.hypot(dx, dy);
  if (gap < min) throw new RangeError(`Object gap ${gap.toFixed(1)}px is below ${min}px`);
  return gap;
}
