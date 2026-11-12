import { Grid, PAL } from '../kit/pixel';
import { ART, drawSprite } from '../kit/sprite';
import { candles as drawStageCandles, type CandleOptions } from '../kit/stage';

export const CHART_SIZE = { w: 720, h: 420 } as const;
export const LOSS_BAR_SIZE = { w: 444, h: 144 } as const;
export const PRICE_BADGE_SIZE = { w: 180, h: 180 } as const;
export const PRICE_ARROW_SIZE = { w: 600, h: 400 } as const;
export const CHART_ANCHOR = 'centre' as const;
export const PRICE_ARROW_ANCHOR = 'centre' as const;
export const LOSS_BAR_ANCHOR = 'centre' as const;
export const PRICE_BADGE_ANCHOR = 'centre' as const;
export interface Point { x: number; y: number }
export interface ChartPanelOptions { x: number; y: number; w?: number; h?: number; t?: number; rot?: number; scale?: number; alpha?: number }
export interface PriceArrowOptions {
  x: number; y: number; t?: number; rot?: number; scale?: number; alpha?: number;
  w?: number; h?: number; points?: Point[]; from?: Point; to?: Point; color: 'up' | 'down'; progress: number;
}
export interface LossBarOptions { x: number; y: number; t?: number; rot?: number; scale?: number; alpha?: number; level: number; label?: string }
export interface GainBarOptions { x: number; y: number; t?: number; rot?: number; scale?: number; alpha?: number; level: number; label?: string }
export interface PriceBadgeOptions { x: number; y: number; t?: number; rot?: number; scale?: number; alpha?: number; level: number; dir: 'up' | 'down' }
export type CandleChartOptions = ChartPanelOptions & Omit<CandleOptions, 't'> & { t?: number };

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const TAU = Math.PI * 2;
function sprite(key: string, w: number, h: number, paint: (g: Grid) => void) {
  const g = new Grid(w, h); paint(g); return g.sprite(`prop-chart:${key}`);
}
function rotateAround(ctx: CanvasRenderingContext2D, x: number, y: number, rot?: number) {
  ctx.save(); if (rot) { ctx.translate(x, y); ctx.rotate(rot); ctx.translate(-x, -y); }
}

export function drawChartPanel(ctx: CanvasRenderingContext2D, o: ChartPanelOptions) {
  const w = o.w ?? CHART_SIZE.w, h = o.h ?? CHART_SIZE.h;
  const cols = Math.max(24, Math.ceil(w / ART)), rows = Math.max(20, Math.ceil(h / ART));
  const panel = sprite(`axes-${cols}x${rows}`, cols, rows, g => {
    const left = 7, top = 5, right = cols - 5, bottom = rows - 7;
    g.rect(left, top, 5, bottom - top + 1, PAL.ink); g.rect(left + 1, top, 2, bottom - top - 1, PAL.grey1);
    g.rect(left, bottom - 4, right - left + 1, 5, PAL.ink); g.rect(left + 4, bottom - 2, right - left - 4, 2, PAL.grey1);
    // Only three broad ticks on each axis; no wireframe or tiny HUD marks.
    for (let i = 1; i <= 3; i++) {
      const yy = Math.round(top + (bottom - top) * i / 4);
      const xx = Math.round(left + (right - left) * i / 4);
      g.rect(left + 5, yy, 5, 2, PAL.grey3);
      g.rect(xx, bottom - 9, 2, 5, PAL.grey3);
    }
    g.outline();
  });
  drawSprite(ctx, panel, o.x, o.y, { scale: o.scale ?? 1, rot: o.rot, alpha: o.alpha });
}

/** Centre-anchored candlestick chart prop for galleries and shot items. */
export function drawCandleChart(ctx: CanvasRenderingContext2D, o: CandleChartOptions) {
  const w = o.w ?? 420, h = o.h ?? 300;
  ctx.save();
  ctx.translate(o.x, o.y);
  if (o.rot) ctx.rotate(o.rot);
  ctx.scale(o.scale ?? 1, o.scale ?? 1);
  ctx.globalAlpha *= o.alpha ?? 1;
  drawStageCandles(ctx, -w / 2, -h / 2, w, h, o);
  ctx.restore();
}

function defaultPath(o: PriceArrowOptions): Point[] {
  const w = o.w ?? PRICE_ARROW_SIZE.w, h = o.h ?? PRICE_ARROW_SIZE.h;
  if (o.points && o.points.length > 1) return o.points;
  const from = o.from ?? { x: -w * 0.45, y: (o.color === 'up' ? 1 : -1) * h * 0.31 };
  const to = o.to ?? { x: w * 0.45, y: (o.color === 'up' ? -1 : 1) * h * 0.31 };
  const dy = to.y - from.y;
  return [
    from,
    { x: from.x + (to.x - from.x) * 0.22, y: from.y },
    { x: from.x + (to.x - from.x) * 0.22, y: from.y + dy * 0.25 },
    { x: from.x + (to.x - from.x) * 0.46, y: from.y + dy * 0.25 },
    { x: from.x + (to.x - from.x) * 0.46, y: from.y + dy * 0.52 },
    { x: from.x + (to.x - from.x) * 0.72, y: from.y + dy * 0.52 },
    { x: from.x + (to.x - from.x) * 0.72, y: from.y + dy * 0.78 },
    to,
  ];
}
function axisRoute(points: Point[]) {
  const result: Point[] = [{ x: points[0]!.x / ART, y: points[0]!.y / ART }];
  for (const p of points.slice(1)) {
    const next = { x: p.x / ART, y: p.y / ART }, last = result[result.length - 1]!;
    if (Math.abs(last.x - next.x) > 1e-6 && Math.abs(last.y - next.y) > 1e-6) result.push({ x: next.x, y: last.y });
    result.push(next);
  }
  return result;
}
function arrowPathSprite(color: 'up' | 'down', path: Point[], progress: number) {
  const xs = path.map(p => p.x), ys = path.map(p => p.y), pad = 8;
  const minX = Math.floor(Math.min(...xs)) - pad, minY = Math.floor(Math.min(...ys)) - pad;
  const maxX = Math.ceil(Math.max(...xs)) + pad, maxY = Math.ceil(Math.max(...ys)) + pad;
  const cols = Math.max(18, maxX - minX + 1), rows = Math.max(18, maxY - minY + 1), p = clamp(progress);
  const total = path.slice(1).reduce((n, b, i) => n + Math.abs(b.x - path[i]!.x) + Math.abs(b.y - path[i]!.y), 0);
  const target = total * p;
  let walked = 0, tip = { ...path[0]! }, angle = 0;
  const key = `${color}-${path.map(q => `${q.x.toFixed(2)},${q.y.toFixed(2)}`).join(';')}-${Math.round(p * 100)}`;
  const line = sprite(`path-${key}`, cols, rows, g => {
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!, b = path[i]!, len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y), remaining = target - walked;
      if (remaining <= 0) break;
      const u = len ? Math.min(1, remaining / len) : 1;
      const end = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
      const pa = { x: a.x - minX, y: a.y - minY }, pb = { x: end.x - minX, y: end.y - minY };
      g.line(pa, pb, 8, PAL.ink); g.line(pa, pb, 4, color === 'up' ? PAL.UP : PAL.DOWN);
      if (remaining <= len) { tip = end; angle = Math.atan2(b.y - a.y, b.x - a.x); break; }
      walked += len; tip = b; angle = Math.atan2(b.y - a.y, b.x - a.x);
    }
  });
  return { line, minX, minY, tip, angle };
}
function arrowHead(color: 'up' | 'down') {
  return sprite(`arrowhead-${color}`, 18, 18, g => {
    const fill = color === 'up' ? PAL.UP : PAL.DOWN;
    g.poly([{ x: 0, y: 6 }, { x: 9, y: 6 }, { x: 9, y: 1 }, { x: 17, y: 9 }, { x: 9, y: 17 }, { x: 9, y: 12 }, { x: 0, y: 12 }], PAL.ink);
    g.poly([{ x: 2, y: 8 }, { x: 10, y: 8 }, { x: 10, y: 4 }, { x: 15, y: 9 }, { x: 10, y: 14 }, { x: 10, y: 10 }, { x: 2, y: 10 }], fill);
  });
}
export function drawPriceArrow(ctx: CanvasRenderingContext2D, o: PriceArrowOptions) {
  rotateAround(ctx, o.x, o.y, o.rot);
  const s = o.scale ?? 1, route = axisRoute(defaultPath(o));
  const minX = Math.min(...route.map(p => p.x)), maxX = Math.max(...route.map(p => p.x));
  const minY = Math.min(...route.map(p => p.y)), maxY = Math.max(...route.map(p => p.y));
  const centered = route.map(p => ({ x: p.x - (minX + maxX) / 2, y: p.y - (minY + maxY) / 2 }));
  const built = arrowPathSprite(o.color, centered, o.progress);
  const left = o.x + built.minX * ART * s, top = o.y + built.minY * ART * s;
  drawSprite(ctx, built.line, left, top, { anchor: [0, 0], scale: s, alpha: o.alpha });
  if (o.progress > 0) {
    const head = arrowHead(o.color), px = o.x + built.tip.x * ART * s, py = o.y + built.tip.y * ART * s;
    drawSprite(ctx, head, px, py, { anchor: [0.18, 0.5], scale: s, rot: built.angle, alpha: o.alpha });
  }
  ctx.restore();
}

const FONT: Record<string, string[]> = {
  A:['0110','1001','1001','1111','1001','1001','1001'], B:['1110','1001','1001','1110','1001','1001','1110'],
  C:['0111','1000','1000','1000','1000','1000','0111'], D:['1110','1001','1001','1001','1001','1001','1110'],
  E:['1111','1000','1000','1110','1000','1000','1111'], F:['1111','1000','1000','1110','1000','1000','1000'],
  G:['0111','1000','1000','1011','1001','1001','0111'], H:['1001','1001','1001','1111','1001','1001','1001'],
  I:['1111','0110','0110','0110','0110','0110','1111'], J:['0011','0001','0001','0001','1001','1001','0110'],
  K:['1001','1010','1100','1100','1010','1010','1001'], L:['1000','1000','1000','1000','1000','1000','1111'],
  M:['1001','1111','1111','1001','1001','1001','1001'], N:['1001','1101','1101','1011','1011','1001','1001'],
  O:['0110','1001','1001','1001','1001','1001','0110'], P:['1110','1001','1001','1110','1000','1000','1000'],
  Q:['0110','1001','1001','1001','1011','1010','0101'], R:['1110','1001','1001','1110','1010','1001','1001'],
  S:['0111','1000','1000','0110','0001','0001','1110'], T:['1111','0110','0110','0110','0110','0110','0110'],
  U:['1001','1001','1001','1001','1001','1001','0110'], V:['1001','1001','1001','1001','1001','0110','0110'],
  W:['1001','1001','1001','1111','1111','1111','1001'], X:['1001','1001','0110','0110','0110','1001','1001'],
  Y:['1001','1001','0110','0110','0110','0110','0110'], Z:['1111','0001','0010','0110','0100','1000','1111'],
  '0':['0110','1001','1011','1011','1101','1001','0110'], '1':['0110','1110','0110','0110','0110','0110','1111'],
  '2':['1110','0001','0001','0110','1000','1000','1111'], '3':['1110','0001','0001','0110','0001','0001','1110'],
  '4':['1001','1001','1001','1111','0001','0001','0001'], '5':['1111','1000','1000','1110','0001','0001','1110'],
  '6':['0111','1000','1000','1110','1001','1001','0110'], '7':['1111','0001','0010','0010','0100','0100','0100'],
  '8':['0110','1001','1001','0110','1001','1001','0110'], '9':['0110','1001','1001','0111','0001','0001','1110'],
};
function pixelText(g: Grid, value: string, cx: number, y: number, color: string, size = 2) {
  const chars = [...value.toUpperCase()], width = chars.reduce((n, ch) => n + (ch === ' ' ? 4 : 4 * size) + (n ? size : 0), 0);
  let x = Math.round(cx - width / 2);
  chars.forEach((ch, i) => {
    if (i) x += size;
    if (ch === ' ') { x += 4; return; }
    const rows = FONT[ch] ?? ['1111','0001','0010','0100','0100','0000','0100'];
    rows.forEach((row, yy) => [...row].forEach((bit, xx) => { if (bit === '1') g.rect(x + xx * size, y + yy * size, size, size, color); }));
    x += 4 * size;
  });
}
function barSprite(kind: 'loss' | 'gain', level: number, label: string) {
  const p = Math.round(clamp(level) * 60), text = label || kind.toUpperCase();
  return sprite(`bar-${kind}-${p}-${text.toUpperCase()}`, 74, 24, g => {
    const fill = kind === 'loss' ? PAL.UP : PAL.DOWN;
    const shade = kind === 'loss' ? PAL.red3 : PAL.green4;
    g.round(0, 1, 74, 22, 3, PAL.ink); g.round(2, 2, 70, 20, 2, shade);
    g.rect(4, 3, 66, 2, kind === 'loss' ? PAL.red2 : PAL.green3);
    g.round(4, 17, 66, 5, 1, PAL.ink);
    if (p > 0) g.rect(5, 18, Math.max(1, Math.round(64 * p / 60)), 3, fill);
    g.rect(5, 18, Math.max(0, Math.min(Math.round(64 * p / 60), 18)), 1, kind === 'loss' ? PAL.red1 : PAL.green1);
    pixelText(g, text, 37, 3, PAL.paper, 2);
    // Reassert the dark outer edge around letters and panel, without filling glyph counters.
    g.rect(0, 1, 74, 1, PAL.ink); g.rect(0, 22, 74, 1, PAL.ink);
  });
}
function drawBar(ctx: CanvasRenderingContext2D, o: LossBarOptions | GainBarOptions, kind: 'loss' | 'gain') {
  rotateAround(ctx, o.x, o.y, o.rot);
  drawSprite(ctx, barSprite(kind, o.level, o.label ?? kind.toUpperCase()), o.x, o.y, { scale: o.scale ?? 1, alpha: o.alpha });
  ctx.restore();
}
export function drawLossBar(ctx: CanvasRenderingContext2D, o: LossBarOptions) { drawBar(ctx, o, 'loss'); }
export function drawGainBar(ctx: CanvasRenderingContext2D, o: GainBarOptions) { drawBar(ctx, o, 'gain'); }

function dollar(g: Grid, x: number, y: number) {
  const rows = ['0110','1001','1000','0110','0001','1001','0110'];
  rows.forEach((row, yy) => [...row].forEach((bit, xx) => { if (bit === '1') g.rect(x + xx, y + yy, 1, 1, PAL.ink); }));
  g.rect(x + 2, y - 2, 1, 11, PAL.ink);
}
function badge(dir: 'up' | 'down', level: number) {
  const p = Math.round(clamp(level) * 16), accent = dir === 'up' ? PAL.UP : PAL.DOWN;
  return sprite(`badge-${dir}-${p}`, 30, 30, g => {
    g.ellipse(15, 15, 14, 14, PAL.ink); g.ellipse(14, 14, 12, 12, PAL.gold3);
    g.ellipse(13, 13, 10, 10, PAL.gold1); g.ellipse(12, 12, 8, 8, PAL.gold2);
    dollar(g, 9, 8);
    if (dir === 'up') {
      g.rect(21, 17, 3, 8, PAL.ink); g.poly([{ x: 17, y: 19 }, { x: 22, y: 13 }, { x: 27, y: 19 }], PAL.ink);
      g.rect(22, 17, 1, 7, accent); g.poly([{ x: 19, y: 18 }, { x: 22, y: 15 }, { x: 25, y: 18 }], accent);
    } else {
      g.rect(21, 8, 3, 8, PAL.ink); g.poly([{ x: 17, y: 13 }, { x: 22, y: 20 }, { x: 27, y: 13 }], PAL.ink);
      g.rect(22, 9, 1, 7, accent); g.poly([{ x: 19, y: 13 }, { x: 22, y: 17 }, { x: 25, y: 13 }], accent);
    }
    g.round(5, 26, 20, 3, 1, PAL.ink); if (p > 0) g.rect(6, 27, Math.round(18 * p / 16), 1, accent);
  });
}
export function drawPriceBadge(ctx: CanvasRenderingContext2D, o: PriceBadgeOptions) {
  rotateAround(ctx, o.x, o.y, o.rot);
  drawSprite(ctx, badge(o.dir, o.level), o.x, o.y, { scale: o.scale ?? 1, alpha: o.alpha });
  ctx.restore();
}

export const GALLERY: { name: string; draw(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void }[] = [
  { name: 'price chart axes', draw: (ctx, x, y) => drawChartPanel(ctx, { x, y, w: 350, h: 204 }) },
  { name: 'candles · price rises', draw: (ctx, x, y) => drawCandleChart(ctx, { x, y, scale: 0.68, w: 500, h: 340, closes: 'up', count: 9, axes: true, dollar: true, t: 1, seed: 2 }) },
  { name: 'candles · price falls', draw: (ctx, x, y) => drawCandleChart(ctx, { x, y, scale: 0.68, w: 500, h: 340, closes: 'down', count: 9, axes: true, dollar: true, t: 1, seed: 7 }) },
  { name: 'candles revealing', draw: (ctx, x, y, t) => drawCandleChart(ctx, { x, y, scale: 0.68, w: 500, h: 340, closes: 'up', count: 8, progress: clamp(0.08 + t * 2.5), axes: true, dollar: true, t, seed: 4 }) },
  { name: 'price loss bar · half', draw: (ctx, x, y) => drawLossBar(ctx, { x, y, level: 0.5, label: 'LOSS' }) },
  { name: 'price loss bar · full', draw: (ctx, x, y) => drawLossBar(ctx, { x, y, level: 1, label: 'LOSS' }) },
  { name: 'price loss bar building', draw: (ctx, x, y, t) => drawLossBar(ctx, { x, y, level: clamp(0.1 + t * 2.5), label: 'LOSS' }) },
  { name: 'price gain bar · full', draw: (ctx, x, y) => drawGainBar(ctx, { x, y, level: 1, label: 'GAIN' }) },
  { name: 'price gain bar building', draw: (ctx, x, y, t) => drawGainBar(ctx, { x, y, level: clamp(0.1 + t * 2.5), label: 'GAIN' }) },
  { name: 'price badges', draw: (ctx, x, y) => { drawPriceBadge(ctx, { x: x - 96, y, level: 0.8, dir: 'up' }); drawPriceBadge(ctx, { x: x + 96, y, level: 0.45, dir: 'down' }); } },
];
