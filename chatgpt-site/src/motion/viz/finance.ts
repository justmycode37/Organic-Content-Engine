import { clamp, ease, type Frame, type Paint } from '../core.ts';
import { pixelText, pixelWidth, typeCell } from '../prim.ts';
import { CELL, dither } from '../pix.ts';
import { box, emptyMesh, quad, render3d, type Mesh, type Object3D, type Vec3, type View3D } from '../three.ts';

export interface VizRect { x: number; y: number; w: number; h: number }
export interface LinePoint { x: number; y: number }
export interface Candlestick { open: number; close: number; high: number; low: number; volume?: number }
export interface FinanceColors { up?: string; down?: string; neutral?: string; muted?: string; grid?: string; panel?: string }

const UP = '#55D68A';
const DOWN = '#FF5B62';
const colors = (theme: Frame['theme'], given: FinanceColors = {}) => ({
  up: given.up ?? UP,
  down: given.down ?? DOWN,
  neutral: given.neutral ?? theme.fg,
  muted: given.muted ?? theme.dim,
  grid: given.grid ?? theme.line,
  panel: given.panel ?? theme.panel,
});
const validRect = (r: VizRect) => Number.isFinite(r.x + r.y + r.w + r.h) && r.w > 0 && r.h > 0;
const safeValues = (values: readonly number[] | undefined, fallback: number[]) => {
  const list = Array.isArray(values) ? values.slice(0, 96).map(v => Number.isFinite(v) ? v : 0) : fallback;
  return list.length ? list : fallback;
};
const minMax = (values: readonly number[]) => {
  let lo = Math.min(...values), hi = Math.max(...values);
  if (Math.abs(hi - lo) < 1e-6) { lo -= Math.abs(lo) * 0.08 + 1; hi += Math.abs(hi) * 0.08 + 1; }
  const pad = (hi - lo) * 0.1;
  return [lo - pad, hi + pad] as const;
};

function chartGrid(ctx: Frame['ctx'], frame: Frame, rect: VizRect, opts: { left?: number; bottom?: number; horizontal?: number; vertical?: number } = {}) {
  const left = opts.left ?? 24, bottom = opts.bottom ?? 30, x = rect.x + left, y = rect.y + 16, w = rect.w - left - 12, h = rect.h - bottom - 28;
  if (w <= 0 || h <= 0) return { x, y, w: 0, h: 0 };
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.strokeStyle = colors(frame.theme).grid;
  ctx.lineWidth = 2;
  ctx.globalAlpha *= 0.54;
  const rows = opts.horizontal ?? 5, cols = opts.vertical ?? 6;
  for (let i = 0; i <= rows; i++) {
    const yy = Math.round((y + h * i / rows) / CELL) * CELL;
    ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke();
  }
  for (let i = 0; i <= cols; i++) {
    const xx = Math.round((x + w * i / cols) / CELL) * CELL;
    ctx.beginPath(); ctx.moveTo(xx, y); ctx.lineTo(xx, y + h); ctx.stroke();
  }
  ctx.restore();
  return { x, y, w, h };
}

function steppedLine(ctx: Frame['ctx'], points: LinePoint[], color: Paint, width = 8) {
  if (points.length < 2) return;
  ctx.save(); ctx.lineJoin = 'miter'; ctx.lineCap = 'square'; ctx.lineWidth = width; ctx.strokeStyle = color;
  ctx.beginPath(); ctx.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!;
    ctx.lineTo(Math.round(p.x / CELL) * CELL, Math.round(p.y / CELL) * CELL);
  }
  ctx.stroke(); ctx.restore();
}

function pointAt(points: LinePoint[], position: number): LinePoint {
  const index = Math.min(points.length - 1, Math.floor(position));
  const next = Math.min(points.length - 1, index + 1), f = position - index;
  return { x: points[index]!.x + (points[next]!.x - points[index]!.x) * f, y: points[index]!.y + (points[next]!.y - points[index]!.y) * f };
}

export interface PriceLineOptions extends FinanceColors { follow?: boolean; followX?: number; label?: string; valueLabel?: string; fill?: boolean; startAt?: number; drawSeconds?: number }
export interface PriceLineResult { head: LinePoint; progress: number; direction: 'up' | 'down' }

/** Draws an animated market line. `head` is the screen coordinate a shot can attach its camera or an actor to. */
export function drawPriceLine(frame: Frame, rect: VizRect, values: readonly number[], time: number, options: PriceLineOptions = {}): PriceLineResult {
  if (!validRect(rect)) return { head: { x: rect.x, y: rect.y }, progress: 0, direction: 'up' };
  const { ctx } = frame, palette = colors(frame.theme, options), data = safeValues(values, [18, 20, 19, 23, 21, 26, 25, 29, 27, 34, 32, 39]);
  const area = chartGrid(ctx, frame, rect, { left: 30, bottom: 38, horizontal: 5, vertical: 8 });
  const [lo, hi] = minMax(data), direction = data.at(-1)! >= data[0]! ? 'up' : 'down', color = direction === 'up' ? palette.up : palette.down;
  const drawDuration = options.drawSeconds ?? Math.min(1.45, Math.max(0.48, frame.dur * 0.52));
  const p = ease.outCubic(clamp((time - (options.startAt ?? 0.08)) / drawDuration));
  const last = p * (data.length - 1);
  const raw = data.map((v, i) => ({ x: area.x + area.w * i / Math.max(1, data.length - 1), y: area.y + area.h * (1 - (v - lo) / (hi - lo)) }));
  const nominalHead = pointAt(raw, last), targetX = area.x + area.w * (options.followX ?? 0.66);
  const shift = options.follow ? nominalHead.x - targetX : 0;
  const points = raw.map(point => ({ x: point.x - shift, y: point.y }));
  const head = { x: nominalHead.x - shift, y: nominalHead.y };
  const fractional = last - Math.floor(last);
  const linePoints = points.slice(0, Math.floor(last) + 1);
  if (linePoints.length === 0) linePoints.push(points[0]!);
  if (fractional > 0.001 && Math.floor(last) < points.length - 1) linePoints.push(head);
  if (options.label) pixelText(ctx, options.label.toUpperCase(), rect.x + 24, rect.y + 4, 7, { color: palette.muted, mode: 'type', reveal: ease.outExpo(clamp(time / 0.18)) });
  if (options.fill !== false && linePoints.length) {
    ctx.save(); ctx.beginPath(); ctx.rect(area.x, area.y, area.w, area.h); ctx.clip();
    ctx.beginPath(); ctx.moveTo(linePoints[0]!.x, linePoints[0]!.y);
    for (let i = 1; i < linePoints.length; i++) ctx.lineTo(linePoints[i]!.x, linePoints[i]!.y);
    ctx.lineTo(head.x, area.y + area.h); ctx.lineTo(linePoints[0]!.x, area.y + area.h); ctx.closePath(); ctx.clip();
    dither(ctx, area.x, area.y, area.w, area.h, color, (u, v) => 0.08 + 0.2 * (1 - v) * (0.45 + 0.55 * u), CELL);
    ctx.restore();
  }
  steppedLine(ctx, linePoints, color, 8);
  if (p > 0) {
    const cell = CELL, pulse = Math.floor((1 + Math.sin(time * 10)) * 0.5);
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(head.x / cell) * cell - 12, Math.round(head.y / cell) * cell - 12, 24, 24);
    ctx.fillStyle = frame.theme.bg;
    ctx.fillRect(Math.round(head.x / cell) * cell - 4, Math.round(head.y / cell) * cell - 4, 8, 8);
    ctx.fillStyle = color;
    if (pulse) { ctx.fillRect(head.x - 20, head.y - 4, 8, 8); ctx.fillRect(head.x + 12, head.y - 4, 8, 8); }
  }
  if (options.valueLabel && p > 0.86) {
    const label = options.valueLabel;
    const labelSize = [6, 5, 4].find(size => pixelWidth(label, size) <= 176) ?? 4, width = pixelWidth(label, labelSize) + 24, height = labelSize * 7 + 20;
    const x = Math.min(area.x + area.w - width, head.x + 24), y = clamp(head.y - height - 14, area.y + 8, area.y + area.h - height - 8);
    ctx.fillStyle = color; ctx.fillRect(x, y, width, height);
    pixelText(ctx, label, x + 12, y + 10, labelSize, { color: frame.theme.bg });
  }
  return { head, progress: p, direction };
}

export interface CandlesOptions extends FinanceColors { startAt?: number; buildSeconds?: number; volumes?: readonly number[]; label?: string }
export function drawCandlesticks(frame: Frame, rect: VizRect, input: readonly Candlestick[], time: number, options: CandlesOptions = {}) {
  if (!validRect(rect)) return { visible: 0, total: 0 };
  const candles = (Array.isArray(input) ? input.slice(0, 40) : []).filter(c => c && [c.open, c.close, c.high, c.low].every(Number.isFinite));
  const { ctx } = frame, palette = colors(frame.theme, options), chart = chartGrid(ctx, frame, rect, { left: 28, bottom: 126, horizontal: 5, vertical: Math.max(4, candles.length) });
  if (!candles.length || !chart.w) return { visible: 0, total: candles.length };
  const lohi = minMax(candles.flatMap(c => [c.low, c.high])), [lo, hi] = lohi;
  const progress = clamp((time - (options.startAt ?? 0.04)) / (options.buildSeconds ?? Math.min(1.55, Math.max(0.54, frame.dur * 0.55))));
  const visible = Math.min(candles.length, Math.ceil(ease.outCubic(progress) * candles.length));
  const volumeTop = rect.y + rect.h - 96, candleAreaBottom = volumeTop - 22, candleAreaH = candleAreaBottom - chart.y;
  const slot = chart.w / candles.length, bodyW = Math.max(12, Math.min(38, slot * 0.48));
  if (options.label) pixelText(ctx, options.label.toUpperCase(), rect.x + 20, rect.y + 2, 7, { color: palette.muted });
  const vols = candles.map((c, i) => options.volumes?.[i] ?? c.volume ?? 0), maxVol = Math.max(1, ...vols);
  ctx.save(); ctx.beginPath(); ctx.rect(chart.x, chart.y, chart.w, rect.h - 24); ctx.clip();
  for (let i = 0; i < visible; i++) {
    const c = candles[i]!, x = chart.x + i * slot + slot / 2, highY = chart.y + (1 - (c.high - lo) / (hi - lo)) * candleAreaH,
      lowY = chart.y + (1 - (c.low - lo) / (hi - lo)) * candleAreaH,
      openY = chart.y + (1 - (c.open - lo) / (hi - lo)) * candleAreaH,
      closeY = chart.y + (1 - (c.close - lo) / (hi - lo)) * candleAreaH,
      rising = c.close >= c.open, color = rising ? palette.up : palette.down;
    const local = clamp((time - (options.startAt ?? 0.04) - i * 0.055) / 0.26), reveal = ease.outBack(local);
    const cy = closeY + (openY - closeY) * (1 - reveal);
    ctx.strokeStyle = color; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(Math.round(x / 4) * 4, highY); ctx.lineTo(Math.round(x / 4) * 4, lowY); ctx.stroke();
    const top = Math.min(openY, cy), bottom = Math.max(openY, cy), height = Math.max(CELL * 2, bottom - top);
    ctx.fillStyle = color; ctx.fillRect(Math.round((x - bodyW / 2) / 4) * 4, Math.round(top / 4) * 4, Math.round(bodyW / 4) * 4, Math.round(height / 4) * 4);
    ctx.fillStyle = frame.theme.bg;
    if (bottom - top > 18) ctx.fillRect(x - bodyW / 2 + 8, top + 8, Math.max(4, bodyW - 16), Math.max(0, height - 16));
    const barH = Math.max(8, (rect.y + rect.h - 32 - volumeTop) * clamp(vols[i]! / maxVol));
    ctx.fillStyle = color; ctx.globalAlpha *= 0.55;
    ctx.fillRect(Math.round((x - bodyW / 2) / 4) * 4, volumeTop + (rect.y + rect.h - 32 - volumeTop - barH), Math.round(bodyW / 4) * 4, barH);
    ctx.globalAlpha /= 0.55;
  }
  ctx.restore();
  pixelText(ctx, 'VOL', rect.x + 22, rect.y + rect.h - 52, 6, { color: palette.muted });
  return { visible, total: candles.length };
}

export interface ExtrudedOptions extends FinanceColors { orbit?: boolean; yaw?: number; pitch?: number; count?: number; label?: string; kind?: 'bars' | 'candles' }
/** Lit isometric bars or candlesticks rendered with the software 3D engine; `orbit` changes camera yaw. */
export function drawExtrudedChart(frame: Frame, rect: VizRect, input: readonly number[] | readonly Candlestick[], time: number, options: ExtrudedOptions = {}) {
  if (!validRect(rect)) return { view: null as View3D | null, objects: 0 };
  const raw = Array.isArray(input) ? input.slice(0, 40) : [], candleMode = options.kind === 'candles' || (options.kind !== 'bars' && typeof raw[0] === 'object'),
    candles = candleMode ? (raw as Candlestick[]).filter(c => c && [c.open, c.close, c.high, c.low].every(Number.isFinite)) : [],
    data = candleMode ? [] : safeValues(raw as number[], [3, 5, 4, 7, 5, 8, 6, 10, 9, 12]);
  const count = Math.min(candleMode ? candles.length : data.length, options.count ?? (candleMode ? candles.length : data.length)), baseY = -2.3;
  if (count <= 0) return { view: null as View3D | null, objects: 0 };
  const lo = candleMode ? Math.min(...candles.slice(0, count).map(c => c.low)) : Math.min(0, ...data.slice(0, count)),
    hi = candleMode ? Math.max(...candles.slice(0, count).map(c => c.high)) : Math.max(...data.slice(0, count)), range = hi - lo || 1;
  const view: View3D = { x: rect.x, y: rect.y + 36, w: rect.w, h: rect.h - 76, zoom: Math.min(108, rect.w / 9.5), yaw: (options.yaw ?? 0.42) + (options.orbit ? time * 0.48 : 0), pitch: options.pitch ?? 0.48, ortho: true, outline: true, cell: CELL };
  const gains: Object3D[] = [], losses: Object3D[] = [], gap = count <= 1 ? 0 : 9.7 / (count - 1), span = (count - 1) * gap;
  for (let i = 0; i < count; i++) {
    if (candleMode) {
      const candle = candles[i]!, isGain = candle.close >= candle.open, x = i * gap - span / 2, scale = 4.35,
        lowY = baseY + ((candle.low - lo) / range) * scale, highY = baseY + ((candle.high - lo) / range) * scale,
        openY = baseY + ((candle.open - lo) / range) * scale, closeY = baseY + ((candle.close - lo) / range) * scale,
        bodyH = Math.max(0.2, Math.abs(closeY - openY)), bodyW = Math.min(0.66, gap * 0.54), material = [{ tone: 0.5 }, { accent: true }, { tone: 0.2 }];
      const group = isGain ? gains : losses;
      group.push({ mesh: box(bodyW, bodyH, 0.5, 0, [0, 0, 1, 2, 1, 0]), pos: [x, (openY + closeY) / 2, 0], materials: material });
      group.push({ mesh: box(Math.max(0.12, bodyW * 0.16), Math.max(0.12, highY - lowY), 0.22, 0, [0, 0, 1, 2, 1, 0]), pos: [x, (highY + lowY) / 2, 0], materials: material });
    } else {
      const value = data[i]!, h = 0.65 + ((value - lo) / range) * 3.9, isGain = value >= data[Math.max(0, i - 1)]!;
      const mesh = box(0.78, h, 0.62, 0, [0, 0, 1, 2, 1, 0]);
      const obj: Object3D = { mesh, pos: [i * gap - span / 2, baseY + h / 2, 0], materials: [{ tone: 0.55 }, { accent: true }, { tone: 0.2 }] };
      (isGain ? gains : losses).push(obj);
    }
  }
  if (options.label) pixelText(frame.ctx, options.label.toUpperCase(), rect.x + 20, rect.y + 4, 7, { color: frame.theme.dim });
  const makeTheme = (hex: string): Frame['theme'] => ({ ...frame.theme, accent: hex, accentSolid: hex, spectrum: [hex] });
  if (gains.length) render3d(frame.ctx, makeTheme(options.up ?? UP), view, gains);
  if (losses.length) render3d(frame.ctx, makeTheme(options.down ?? DOWN), view, losses);
  return { view, objects: gains.length + losses.length };
}

export interface OrderLevel { price: string | number; size: number }
export interface OrderBookOptions extends FinanceColors { rows?: number; spread?: string; startAt?: number; buildSeconds?: number; label?: string }
/** A depth ladder that reveals bids and asks in alternating steps around the spread. */
export function drawOrderBook(frame: Frame, rect: VizRect, bids: readonly OrderLevel[], asks: readonly OrderLevel[], time: number, options: OrderBookOptions = {}) {
  if (!validRect(rect)) return { visible: 0 };
  const { ctx } = frame, palette = colors(frame.theme, options), count = Math.min(10, options.rows ?? Math.max(bids.length, asks.length), bids.length, asks.length);
  const rows = Math.max(0, count), top = rect.y + 78, rowH = Math.min(76, (rect.h - 144) / Math.max(1, rows)), halfW = (rect.w - 40) / 2, maxSize = Math.max(1, ...bids.slice(0, rows).map(x => x.size), ...asks.slice(0, rows).map(x => x.size));
  if (options.label) pixelText(ctx, options.label.toUpperCase(), rect.x + 20, rect.y + 4, 6, { color: palette.muted });
  const p = ease.outExpo(clamp((time - (options.startAt ?? 0.08)) / (options.buildSeconds ?? Math.min(1.1, frame.dur * 0.46))));
  const visible = Math.min(rows, Math.ceil(p * rows));
  ctx.fillStyle = palette.grid; ctx.fillRect(rect.x + rect.w / 2 - 2, top - 4, 4, Math.max(0, rows * rowH));
  pixelText(ctx, 'BID DEPTH', rect.x + 20, rect.y + 50, 4, { color: palette.muted });
  pixelText(ctx, 'ASK DEPTH', rect.x + rect.w - 20, rect.y + 50, 4, { color: palette.muted, align: 'right' });
  for (let i = 0; i < rows; i++) {
    const y = top + i * rowH, bid = bids[i]!, ask = asks[i]!;
    ctx.fillStyle = palette.grid; ctx.globalAlpha *= 0.36; ctx.fillRect(rect.x + 16, y + rowH - 4, rect.w - 32, 2); ctx.globalAlpha /= 0.36;
    if (i >= visible) continue;
    const reveal = ease.outBack(clamp((p * rows - i) / 0.82)), barSpace = Math.max(20, halfW - 220), bh = Math.max(8, Math.round(barSpace * bid.size / maxSize * reveal)), ah = Math.max(8, Math.round(barSpace * ask.size / maxSize * reveal));
    ctx.fillStyle = palette.up; ctx.globalAlpha *= 0.62; ctx.fillRect(rect.x + 22, y + rowH / 2 - 8, bh, 16); ctx.globalAlpha /= 0.62;
    ctx.fillStyle = palette.down; ctx.globalAlpha *= 0.62; ctx.fillRect(rect.x + rect.w - 22 - ah, y + rowH / 2 - 8, ah, 16); ctx.globalAlpha /= 0.62;
    pixelText(ctx, String(bid.price), rect.x + halfW - 18, y + rowH / 2 - 22, 5, { color: palette.up, align: 'right' });
    pixelText(ctx, String(ask.price), rect.x + rect.w - halfW + 18, y + rowH / 2 - 22, 5, { color: palette.down });
    pixelText(ctx, compact(bid.size), rect.x + 22, y + rowH / 2 + 14, 4, { color: palette.muted });
    pixelText(ctx, compact(ask.size), rect.x + rect.w - 22, y + rowH / 2 + 14, 4, { color: palette.muted, align: 'right' });
  }
  if (options.spread) {
    const y = top + rows * rowH + 12;
    ctx.fillStyle = palette.panel; ctx.fillRect(rect.x + rect.w / 2 - 82, y, 164, 34);
    pixelText(ctx, `SPREAD ${options.spread}`, rect.x + rect.w / 2, y + 10, 5, { color: frame.theme.fg, align: 'center' });
  }
  return { visible };
}

function compact(value: number) { return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(Number.isFinite(value) ? value : 0); }

export interface TickerItem { symbol: string; price: string | number; change: number }
export interface TickerOptions extends FinanceColors { speed?: number; startAt?: number; label?: boolean }
/** Seamless, clipped exchange tape. Up/down color is tied only to each listed price move. */
export function drawTickerTape(frame: Frame, rect: VizRect, items: readonly TickerItem[], time: number, options: TickerOptions = {}) {
  if (!validRect(rect)) return { offset: 0 };
  const { ctx } = frame, palette = colors(frame.theme, options), data = (Array.isArray(items) ? items.slice(0, 12) : []).filter(x => x?.symbol);
  const stripY = rect.y + Math.max(0, (rect.h - 84) / 2), height = Math.min(84, rect.h);
  ctx.fillStyle = palette.panel; ctx.fillRect(rect.x, stripY, rect.w, height);
  ctx.fillStyle = palette.grid; ctx.fillRect(rect.x, stripY, rect.w, 4); ctx.fillRect(rect.x, stripY + height - 4, rect.w, 4);
  if (!data.length) return { offset: 0 };
  const chunks = data.map(item => ({ item, width: pixelWidth(`${item.symbol.toUpperCase()}  ${item.price}  ${item.change >= 0 ? '+' : ''}${item.change.toFixed(2)}%`, 8) + 80 }));
  const cycle = chunks.reduce((sum, chunk) => sum + chunk.width, 0), offset = (time * (options.speed ?? 164)) % Math.max(1, cycle);
  ctx.save(); ctx.beginPath(); ctx.rect(rect.x, stripY + 4, rect.w, height - 8); ctx.clip();
  let x = rect.x - offset;
  for (let pass = 0; x < rect.x + rect.w; pass++) {
    for (const { item, width } of chunks) {
      if (x > rect.x - width && x < rect.x + rect.w) {
        const change = `${item.change >= 0 ? '+' : ''}${item.change.toFixed(2)}%`, directionColor = item.change >= 0 ? palette.up : palette.down;
        pixelText(ctx, item.symbol.toUpperCase(), x + 16, stripY + 28, 8, { color: frame.theme.fg });
        pixelText(ctx, String(item.price), x + 16 + pixelWidth(item.symbol.toUpperCase(), 8) + 24, stripY + 28, 8, { color: palette.muted });
        pixelText(ctx, change, x + 16 + pixelWidth(item.symbol.toUpperCase(), 8) + pixelWidth(String(item.price), 8) + 40, stripY + 28, 8, { color: directionColor });
        ctx.fillStyle = palette.grid; ctx.fillRect(x + width - 20, stripY + 25, 4, 32);
      }
      x += width;
      if (x >= rect.x + rect.w) break;
    }
    if (pass > 2) break;
  }
  ctx.restore();
  if (options.label) pixelText(ctx, 'LIVE TAPE', rect.x + 8, stripY - 18, 5, { color: palette.muted });
  return { offset };
}

export interface OdometerOptions { from?: number; to: number; prefix?: string; suffix?: string; decimals?: number; size?: number; startAt?: number; rollSeconds?: number; color?: Paint; label?: string }
/** Mechanical pixel odometer; each digit rolls vertically into place in a short stagger. */
export function drawOdometer(frame: Frame, rect: VizRect, time: number, options: OdometerOptions) {
  if (!validRect(rect)) return { value: options.to, progress: 0 };
  const { ctx } = frame, duration = options.rollSeconds ?? Math.min(1.24, Math.max(0.5, frame.dur * 0.44)), p = ease.outCubic(clamp((time - (options.startAt ?? 0.08)) / duration));
  const decimals = clamp(Math.floor(options.decimals ?? 0), 0, 4), fromNum = Number.isFinite(options.from) ? options.from! : 0, toNum = Number.isFinite(options.to) ? options.to : 0,
    format = (number: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(number),
    from = format(fromNum), target = format(toNum), maxChars = Math.max(from.length, target.length),
    fromPad = from.padStart(maxChars, ' '), targetPad = target.padStart(maxChars, ' '), prefix = options.prefix ?? '', suffix = options.suffix ?? '', valueString = `${prefix}${targetPad}${suffix}`;
  let base = options.size ?? Math.min(20, Math.max(11, Math.floor(rect.h / 10.5)));
  base = Math.min(base, Math.max(6, Math.floor((rect.h - 48) / 7)));
  const metrics = (px: number) => {
    const tracking = px >= 5 ? typeCell(px) * Math.max(1, Math.round(px / typeCell(px))) : px;
    const digitW = Math.max(...Array.from({ length: 10 }, (_, digit) => pixelWidth(String(digit), px))) + tracking;
    const slot = (char: string) => /\d/.test(char) ? digitW : char === ' ' ? px * 4 : pixelWidth(char, px) + tracking;
    const total = [...valueString].reduce((sum, char) => sum + slot(char), 0) - tracking;
    return { tracking, digitW, slot, total };
  };
  let measure = metrics(base);
  while (base > 6 && measure.total > rect.w - 32) { base--; measure = metrics(base); }
  const capH = base * 7, x0 = rect.x + (rect.w - measure.total) / 2, y0 = rect.y + (rect.h - capH) / 2;
  if (options.label) pixelText(ctx, options.label.toUpperCase(), rect.x + rect.w / 2, rect.y + 4, 6, { color: frame.theme.dim, align: 'center' });
  let x = x0;
  const chars = [...valueString];
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i]!, slotW = measure.slot(char), digitPos = i - prefix.length;
    if (/\d/.test(char) && digitPos >= 0 && digitPos < maxChars) {
      const src = fromPad[digitPos]!, dst = targetPad[digitPos]!, fromDigit = /\d/.test(src) ? Number(src) : 0, toDigit = Number(dst), delay = (maxChars - digitPos - 1) * 0.035,
        local = ease.outCubic(clamp((p - delay) / 0.78)), turns = (toDigit - fromDigit + 10) % 10, travel = turns * local, stepNow = Math.floor(travel);
      ctx.save(); ctx.beginPath(); ctx.rect(x, y0 - 2, measure.digitW, capH + 4); ctx.clip();
      for (let step = stepNow - 1; step <= stepNow + 1; step++) {
        const digit = (fromDigit + step + 20) % 10, y = y0 + (step - travel) * capH;
        if (src === ' ' && local <= 0.02 && step === 0) continue;
        pixelText(ctx, String(digit), x + (measure.digitW - pixelWidth(String(digit), base)) / 2, y, base, { color: options.color ?? frame.theme.fg });
      }
      ctx.fillStyle = frame.theme.fg; ctx.fillRect(x, y0 + capH + 6, measure.digitW - measure.tracking, 4);
      ctx.restore();
    } else if (char !== ' ') pixelText(ctx, char, x, y0, base, { color: options.color ?? frame.theme.fg });
    x += slotW;
  }
  return { value: toNum, progress: p };
}

export interface ChangeBadgeOptions extends FinanceColors { value: number; label?: string; startAt?: number; color?: 'auto' | 'gain' | 'loss' }
/** Impact badge for a semantically directional percentage move. */
export function drawChangeBadge(frame: Frame, rect: VizRect, time: number, options: ChangeBadgeOptions) {
  if (!validRect(rect)) return { visible: false };
  const { ctx } = frame, palette = colors(frame.theme, options), valueNumber = Number.isFinite(options.value) ? options.value : 0, progress = clamp((time - (options.startAt ?? 0.12)) / 0.28), slam = ease.outBack(progress), up = (options.color === 'gain' || (options.color !== 'loss' && valueNumber >= 0)), color = up ? palette.up : palette.down;
  if (progress <= 0) return { visible: false };
  const value = `${valueNumber >= 0 ? '+' : ''}${valueNumber.toFixed(1)}%`, label = options.label?.toUpperCase() ?? (up ? 'GAIN' : 'LOSS'),
    size = [12, 11, 10, 9, 8, 7].find(px => px * 7 <= rect.h - 92 && pixelWidth(value, px) <= rect.w - 156) ?? 7,
    labelSize = [5, 4, 3].find(px => pixelWidth(label, px) <= rect.w - 48) ?? 3;
  const w = Math.min(rect.w, Math.max(pixelWidth(value, size) + 144, pixelWidth(label, labelSize) + 60)), h = Math.min(rect.h, 184), cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(0.76 + 0.24 * slam, 0.76 + 0.24 * slam); ctx.translate(-cx, -cy);
  ctx.fillStyle = color; ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
  ctx.fillStyle = frame.theme.bg; ctx.fillRect(cx - w / 2 + 8, cy - h / 2 + 8, w - 16, h - 16);
  ctx.fillStyle = color;
  const triY = cy - 4, triX = cx - w / 2 + 36;
  if (up) { ctx.fillRect(triX + 12, triY - 24, 16, 16); ctx.fillRect(triX + 4, triY - 8, 32, 12); ctx.fillRect(triX, triY + 4, 40, 12); }
  else { ctx.fillRect(triX, triY - 12, 40, 12); ctx.fillRect(triX + 4, triY, 32, 12); ctx.fillRect(triX + 12, triY + 12, 16, 16); }
  const valueX = cx - w / 2 + 100;
  pixelText(ctx, value, valueX, cy - size * 3.5, size, { color });
  pixelText(ctx, label, valueX, cy + 40, labelSize, { color: frame.theme.dim });
  ctx.restore();
  return { visible: true, direction: up ? 'up' : 'down', progress };
}

export interface DivergenceOptions extends FinanceColors { leftLabel?: string; rightLabel?: string; startAt?: number; drawSeconds?: number }
/** Two paths sharing one scale, with the spread opening as the chart draws. */
export function drawDivergence(frame: Frame, rect: VizRect, leftValues: readonly number[], rightValues: readonly number[], time: number, options: DivergenceOptions = {}) {
  if (!validRect(rect)) return { progress: 0, spread: 0 };
  const { ctx } = frame, palette = colors(frame.theme, options), left = safeValues(leftValues, [8, 9, 10, 10, 11, 12, 12, 13, 14, 14, 15]), right = safeValues(rightValues, [8, 8.5, 9, 9.5, 10, 12, 14, 18, 22, 27, 32]), n = Math.min(left.length, right.length), a = left.slice(0, n), b = right.slice(0, n), [lo, hi] = minMax([...a, ...b]), chart = chartGrid(ctx, frame, rect, { left: 28, bottom: 36, horizontal: 5, vertical: 8 });
  const p = ease.outCubic(clamp((time - (options.startAt ?? 0.08)) / (options.drawSeconds ?? Math.min(1.35, frame.dur * 0.5))));
  const make = (arr: number[]) => arr.map((value, i) => ({ x: chart.x + chart.w * i / Math.max(1, n - 1), y: chart.y + chart.h * (1 - (value - lo) / (hi - lo)) }));
  const visibleN = Math.max(1, Math.ceil(p * n)), A = make(a).slice(0, visibleN), B = make(b).slice(0, visibleN), direction = b.at(-1)! >= a.at(-1)! ? 'up' : 'down';
  steppedLine(ctx, A, palette.neutral, 7); steppedLine(ctx, B, direction === 'up' ? palette.up : palette.down, 8);
  const spread = Math.abs(b.at(-1)! - a.at(-1)!);
  if (A.length && B.length) {
    const end = A.at(-1)!, end2 = B.at(-1)!;
    ctx.fillStyle = direction === 'up' ? palette.up : palette.down; ctx.globalAlpha *= 0.16;
    for (let j = 0; j < 3; j++) ctx.fillRect(Math.round((end.x - 16 + j * 8) / 4) * 4, Math.round(Math.min(end.y, end2.y) / 4) * 4, 8, Math.max(4, Math.abs(end.y - end2.y) / 3));
    ctx.globalAlpha /= 0.16;
    if (options.leftLabel) pixelText(ctx, options.leftLabel.toUpperCase(), chart.x + 8, chart.y + chart.h - 38, 6, { color: palette.neutral });
    if (options.rightLabel) pixelText(ctx, options.rightLabel.toUpperCase(), chart.x + chart.w - 12, chart.y + 18, 6, { color: direction === 'up' ? palette.up : palette.down, align: 'right' });
  }
  return { progress: p, spread };
}

export interface HeatTile { label: string; change: number }
export interface HeatmapOptions extends FinanceColors { cols?: number; rows?: number; startAt?: number; flipSeconds?: number; label?: string }
/** A market map whose tiles turn to gain/loss colors in a staggered pixel flip. */
export function drawMarketHeatmap(frame: Frame, rect: VizRect, tiles: readonly HeatTile[], time: number, options: HeatmapOptions = {}) {
  if (!validRect(rect)) return { flipped: 0, total: 0 };
  const { ctx } = frame, palette = colors(frame.theme, options), data = (Array.isArray(tiles) ? tiles.slice(0, 40) : []), cols = Math.max(1, Math.min(options.cols ?? 5, data.length || 1)), rows = Math.max(1, Math.min(options.rows ?? Math.ceil(data.length / cols), Math.ceil(data.length / cols) || 1)), gap = 12, tileW = (rect.w - gap * (cols - 1)) / cols, tileH = (rect.h - 40 - gap * (rows - 1)) / rows;
  if (options.label) pixelText(ctx, options.label.toUpperCase(), rect.x + rect.w / 2, rect.y + 2, 4, { color: palette.muted, align: 'center' });
  const p = clamp((time - (options.startAt ?? 0.05)) / (options.flipSeconds ?? Math.min(1.18, frame.dur * 0.46))), flipped = Math.min(data.length, Math.floor(ease.outCubic(p) * data.length));
  data.forEach((tile, i) => {
    const col = i % cols, row = Math.floor(i / cols), x = rect.x + col * (tileW + gap), y = rect.y + 38 + row * (tileH + gap), local = clamp((p * data.length - i * 0.75) / 1.1), flip = Math.abs(1 - 2 * clamp(local * 2 - 0.2));
    const up = tile.change >= 0, direction = up ? palette.up : palette.down, complete = local >= 0.5, face = complete ? direction : palette.panel, width = Math.max(4, tileW * flip);
    ctx.fillStyle = palette.grid; ctx.fillRect(x, y, tileW, tileH);
    ctx.fillStyle = face; ctx.fillRect(x + (tileW - width) / 2, y + 4, width, tileH - 8);
    if (complete && flip > 0.58) {
      const label = String(tile.label ?? '').toUpperCase().slice(0, 8), value = `${tile.change >= 0 ? '+' : ''}${tile.change.toFixed(1)}%`,
        nameSize = [7, 6, 5, 4, 3].find(size => pixelWidth(label, size) <= tileW - 28 && pixelWidth(value, size) <= tileW - 28 && size * 7 <= 52) ?? 3;
      pixelText(ctx, label, x + 14, y + 16, nameSize, { color: frame.theme.bg });
      pixelText(ctx, value, x + 14, y + tileH - nameSize * 7 - 16, nameSize, { color: frame.theme.bg });
    } else if (flip > 0.1) {
      ctx.fillStyle = palette.muted; ctx.fillRect(x + tileW / 2 - 12, y + tileH / 2 - 4, 24, 8);
    }
    ctx.fillStyle = palette.grid; ctx.fillRect(x, y, tileW, 4); ctx.fillRect(x, y + tileH - 4, tileW, 4);
  });
  return { flipped, total: data.length };
}

export interface PieSlice { label: string; value: number }
export interface Pie3DOptions { yaw?: number; orbit?: boolean; pitch?: number; selected?: number }
function addTri(mesh: Mesh, a: Vec3, b: Vec3, c: Vec3, material: number) {
  const index = mesh.p.length / 3; mesh.p.push(...a, ...b, ...c); mesh.t.push(index, index + 1, index + 2); mesh.m.push(material);
}
function pieSector(start: number, end: number, radius: number, thickness: number): Mesh {
  const mesh = emptyMesh(), steps = Math.max(2, Math.ceil((end - start) / (Math.PI / 18))), y0 = -thickness / 2, y1 = thickness / 2;
  for (let i = 0; i < steps; i++) {
    const a = start + (end - start) * i / steps, b = start + (end - start) * (i + 1) / steps,
      p0: Vec3 = [Math.cos(a) * radius, y1, Math.sin(a) * radius], p1: Vec3 = [Math.cos(b) * radius, y1, Math.sin(b) * radius],
      q0: Vec3 = [Math.cos(a) * radius, y0, Math.sin(a) * radius], q1: Vec3 = [Math.cos(b) * radius, y0, Math.sin(b) * radius];
    addTri(mesh, [0, y1, 0], p0, p1, 2); addTri(mesh, [0, y0, 0], q1, q0, 0); quad(mesh, p0, q0, q1, p1, 1);
    quad(mesh, [0, y0, 0], [0, y1, 0], p0, q0, 1);
  }
  return mesh;
}
/** Extruded pie segments as a rotating coin-like stack of beveled pixel slices. */
export function drawPieCoins(frame: Frame, rect: VizRect, slices: readonly PieSlice[], time: number, options: Pie3DOptions = {}) {
  if (!validRect(rect)) return { view: null as View3D | null, slices: 0 };
  const data = (Array.isArray(slices) ? slices.slice(0, 10).filter(s => Number.isFinite(s.value) && s.value > 0) : []), total = data.reduce((sum, s) => sum + s.value, 0);
  if (!data.length || total <= 0) return { view: null as View3D | null, slices: 0 };
  const view: View3D = { x: rect.x, y: rect.y, w: rect.w, h: rect.h, zoom: Math.min(90, rect.w / 8.8), yaw: (options.yaw ?? 0.54) + (options.orbit ? time * 0.32 : 0), pitch: options.pitch ?? 0.62, ortho: true, cell: CELL, outline: true };
  let angle = -Math.PI / 2;
  const objects: Object3D[] = data.map((slice, index) => {
    const next = angle + (slice.value / total) * Math.PI * 2, exploded = index === (options.selected ?? 0) ? 0.16 : 0, mid = (angle + next) / 2;
    const mesh = pieSector(angle, next, 3.35, 0.44), scale = index === (options.selected ?? 0) ? 1.035 : 1;
    angle = next;
    return { mesh, pos: [Math.cos(mid) * exploded, index * 0.04, Math.sin(mid) * exploded], scale, materials: [{ tone: 0.38 }, { tone: 0.6 }, { tone: index === (options.selected ?? 0) ? 1 : 0.78 }] };
  });
  render3d(frame.ctx, frame.theme, view, objects);
  const selected = data[options.selected ?? 0];
  if (selected) {
    pixelText(frame.ctx, selected.label.toUpperCase(), rect.x + rect.w / 2, rect.y + rect.h - 32, 7, { color: frame.theme.fg, align: 'center' });
    const percent = `${Math.round(selected.value / total * 100)}%`;
    pixelText(frame.ctx, percent, rect.x + rect.w / 2, rect.y + 24, 7, { color: frame.theme.dim, align: 'center' });
  }
  return { view, slices: data.length };
}

