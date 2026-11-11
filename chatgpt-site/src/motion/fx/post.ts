// Low-resolution, deterministic pixel post-processing. Spatial effects work on
// CELL-sized ImageData and are blitted back without smoothing; no canvas blur.
import { clamp, hash, type Ctx } from '../core.ts';
import { CELL, bayer, blit, layer } from '../pix.ts';

export interface PostRegion { x?: number; y?: number; w?: number; h?: number }
export interface PostOptions extends PostRegion { cell?: number }
type ScratchLayer = { canvas: OffscreenCanvas | HTMLCanvasElement; ctx: Ctx };
type PixelBuffer = { x: number; y: number; w: number; h: number; cell: number; cols: number; rows: number; layer: ScratchLayer; image: ImageData };

function readPixels(ctx: Ctx, options: PostOptions = {}, key = 'post') : PixelBuffer | null {
  const cell = Math.max(1, Math.round(options.cell ?? CELL));
  const canvas = ctx.canvas;
  const x = Math.max(0, Math.floor((options.x ?? 0) / cell) * cell);
  const y = Math.max(0, Math.floor((options.y ?? 0) / cell) * cell);
  const w = Math.max(0, Math.min(canvas.width - x, options.w ?? canvas.width - x));
  const h = Math.max(0, Math.min(canvas.height - y, options.h ?? canvas.height - y));
  if (!w || !h) return null;
  const cols = Math.max(1, Math.ceil(w / cell)), rows = Math.max(1, Math.ceil(h / cell));
  const buffer = layer(cols, rows, key), sample = buffer.ctx;
  sample.imageSmoothingEnabled = false;
  sample.drawImage(canvas as CanvasImageSource, x, y, w, h, 0, 0, cols, rows);
  return { x, y, w, h, cell, cols, rows, layer: buffer, image: sample.getImageData(0, 0, cols, rows) };
}

function writePixels(ctx: Ctx, buffer: PixelBuffer) {
  buffer.layer.ctx.putImageData(buffer.image, 0, 0);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.beginPath(); ctx.rect(buffer.x, buffer.y, buffer.w, buffer.h); ctx.clip();
  blit(ctx, buffer.layer.canvas as CanvasImageSource, buffer.x, buffer.y, buffer.cols, buffer.rows, buffer.cell);
  ctx.restore();
}

/** Pixel bloom: bright art pixels seed a hard, dithered neighborhood halo. */
export function applyPixelBloom(ctx: Ctx, options: PostOptions & { threshold?: number; radius?: number; strength?: number } = {}) {
  const source = readPixels(ctx, options, 'post-bloom-source');
  if (!source) return;
  const { cols, rows, image, cell } = source, src = image.data;
  const halo = layer(cols, rows, 'post-bloom-halo'), out = halo.ctx.createImageData(cols, rows), dst = out.data;
  const threshold = Math.max(0, Math.min(255, options.threshold ?? 196));
  const radius = Math.max(1, Math.min(5, Math.floor(options.radius ?? 3)));
  const strength = clamp(options.strength ?? .52);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const si = (y * cols + x) * 4;
    const brightness = Math.max(src[si]!, src[si + 1]!, src[si + 2]!);
    if (brightness < threshold || src[si + 3] === 0) continue;
    const energy = ((brightness - threshold) / Math.max(1, 255 - threshold)) * strength;
    for (let oy = -radius; oy <= radius; oy++) for (let ox = -radius; ox <= radius; ox++) {
      const nx = x + ox, ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const dist = Math.abs(ox) + Math.abs(oy);
      if (dist > radius * 2) continue;
      const coverage = energy * Math.max(0, 1 - dist / (radius * 1.7));
      if (coverage <= ((y + ny) % 4) / 4 * .45) continue;
      const oi = (ny * cols + nx) * 4;
      // Neighboring bright sources add energy without a blur or resampling.
      dst[oi] = 245; dst[oi + 1] = 245; dst[oi + 2] = 245;
      dst[oi + 3] = Math.min(210, dst[oi + 3]! + 90 * coverage + (dist === 0 ? 72 : 0));
    }
  }
  halo.ctx.putImageData(out, 0, 0);
  ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.beginPath(); ctx.rect(source.x, source.y, source.w, source.h); ctx.clip();
  blit(ctx, halo.canvas as CanvasImageSource, source.x, source.y, cols, rows, cell);
  ctx.restore();
}

/** Dithered monochrome edge darkening, computed at one art pixel per cell. */
export function applyVignette(ctx: Ctx, options: PostOptions & { strength?: number; color?: string } = {}) {
  const buffer = readPixels(ctx, options, 'post-vignette');
  if (!buffer) return;
  const { cols, rows, image } = buffer, data = image.data, strength = clamp(options.strength ?? .48);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const nx = (x + .5 - cols / 2) / Math.max(1, cols * .5), ny = (y + .5 - rows / 2) / Math.max(1, rows * .5);
    const edge = clamp((nx * nx * .57 + ny * ny * .7 - .18) * strength * 1.5);
    const index = (y * cols + x) * 4;
    if (bayer(x, y) < edge) {
      const factor = 1 - edge * .52;
      data[index] = data[index]! * factor; data[index + 1] = data[index + 1]! * factor; data[index + 2] = data[index + 2]! * factor;
    }
  }
  writePixels(ctx, buffer);
}

/** Restrained CRT scan bands made from square dark rows; amount defaults to 6%. */
export function applyScanlines(ctx: Ctx, options: PostOptions & { amount?: number; spacing?: number } = {}) {
  const cell = Math.max(1, Math.round(options.cell ?? CELL)), x = options.x ?? 0, y = options.y ?? 0;
  const w = options.w ?? ctx.canvas.width - x, h = options.h ?? ctx.canvas.height - y;
  const spacing = Math.max(2, Math.round((options.spacing ?? cell * 2) / cell)) * cell;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.globalAlpha = clamp(options.amount ?? .055); ctx.fillStyle = '#000000';
  for (let yy = Math.ceil(y / cell) * cell; yy < y + h; yy += spacing) ctx.fillRect(x, yy, w, cell);
  ctx.restore();
}

/** RGB channel split, gated explicitly so color fringing only appears on glitch frames. */
export function applyChromaticGlitch(ctx: Ctx, options: PostOptions & { active: boolean; shift?: number } ) {
  if (!options.active) return;
  const buffer = readPixels(ctx, options, 'post-glitch');
  if (!buffer) return;
  const { cols, rows, image, cell } = buffer, src = image.data;
  const shifted = buffer.layer.ctx.createImageData(cols, rows), dst = shifted.data;
  const offset = Math.max(1, Math.min(4, Math.round(Math.abs(options.shift ?? 8) / cell)));
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const leftX = Math.max(0, x - offset), rightX = Math.min(cols - 1, x + offset);
    const fromRed = (y * cols + leftX) * 4, fromCyan = (y * cols + rightX) * 4, to = (y * cols + x) * 4;
    dst[to] = src[fromRed]!; dst[to + 1] = src[fromCyan + 1]!; dst[to + 2] = src[fromCyan + 2]!;
    dst[to + 3] = Math.max(src[fromRed + 3]!, src[fromCyan + 3]!);
  }
  buffer.image = shifted;
  writePixels(ctx, buffer);
}

/** White screen flash or a full monochrome invert, optionally mixed by amount. */
export function applyScreenFlash(ctx: Ctx, options: PostOptions & { amount: number; invert?: boolean } ) {
  const amount = clamp(options.amount);
  if (amount <= 0) return;
  const buffer = readPixels(ctx, options, 'post-flash');
  if (!buffer) return;
  const data = buffer.image.data;
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    for (let c = 0; c < 3; c++) {
      const original = data[i + c]!;
      data[i + c] = options.invert ? original + (255 - original * 2) * amount : original + (255 - original) * amount;
    }
  }
  writePixels(ctx, buffer);
}

/** One-frame, high-contrast impact treatment with a deterministic broken sunburst. */
export function applyImpactFrame(ctx: Ctx, options: PostOptions & { t?: number; at?: number; fps?: number; active?: boolean; threshold?: number; seed?: number } ) {
  const frame = Math.floor(finiteTime(options.t ?? 0) * (options.fps ?? 30));
  const triggerFrame = Math.floor(finiteTime(options.at ?? 0) * (options.fps ?? 30));
  if (!options.active && frame !== triggerFrame) return;
  const buffer = readPixels(ctx, options, 'post-impact');
  if (!buffer) return;
  const { cols, rows, image } = buffer, data = image.data, threshold = options.threshold ?? 105;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = (y * cols + x) * 4;
    const luma = data[i]! * .299 + data[i + 1]! * .587 + data[i + 2]! * .114;
    const ink = luma > threshold + (bayer(x, y) - .5) * 26 ? 255 : 0;
    data[i] = ink; data[i + 1] = ink; data[i + 2] = ink; data[i + 3] = 255;
  }
  const cx = cols / 2, cy = rows * .43, seed = options.seed ?? 1;
  for (let ray = 0; ray < 22; ray++) {
    const angle = ray * Math.PI * 2 / 22 + (hash(ray, seed) - .5) * .13;
    const length = Math.max(cols, rows) * (.18 + hash(ray, seed + 3) * .32);
    const width = 1 + (ray % 4 === 0 ? 1 : 0);
    const ex = Math.round(cx + Math.cos(angle) * length), ey = Math.round(cy + Math.sin(angle) * length);
    writeLowLine(data, cols, rows, Math.round(cx), Math.round(cy), ex, ey, width, ray % 3 === 0 ? 0 : 255);
  }
  buffer.image = image;
  writePixels(ctx, buffer);
}

/** Frame-keyed monochrome grain: sparse high-frequency dither, never random state. */
export function applyFilmGrain(ctx: Ctx, options: PostOptions & { t?: number; seed?: number; strength?: number } = {}) {
  const buffer = readPixels(ctx, options, 'post-grain');
  if (!buffer) return;
  const { cols, rows, image } = buffer, data = image.data, strength = Math.max(0, Math.min(96, options.strength ?? 24));
  const frame = Math.floor(finiteTime(options.t ?? 0) * 30), seed = options.seed ?? 1;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const index = (y * cols + x) * 4;
    if (data[index + 3] === 0) continue;
    const noise = (hash(x * 193 + y * 997 + frame * 17, seed) - .5) * 2;
    const threshold = bayer(x + frame, y - frame);
    const delta = noise > threshold - .5 ? strength * noise : -strength * Math.abs(noise) * .35;
    for (let channel = 0; channel < 3; channel++) data[index + channel] = Math.max(0, Math.min(255, data[index + channel]! + delta));
  }
  writePixels(ctx, buffer);
}

/** Animated square letterbox bars that close, hold, then open over the chosen interval. */
export function applyLetterbox(ctx: Ctx, options: PostOptions & { t: number; start?: number; duration?: number; hold?: number; maxHeight?: number } ) {
  const t = finiteTime(options.t), start = finiteTime(options.start ?? 0), duration = Math.max(.01, options.duration ?? .24);
  const hold = Math.max(0, options.hold ?? .42), close = clamp((t - start) / duration), open = clamp((t - start - duration - hold) / duration);
  const amount = close * (1 - open);
  if (amount <= 0) return;
  const canvasW = ctx.canvas.width, canvasH = ctx.canvas.height, x = options.x ?? 0, y = options.y ?? 0;
  const w = options.w ?? canvasW - x, h = options.h ?? canvasH - y;
  const bar = Math.round((options.maxHeight ?? 120) * amount / CELL) * CELL;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.fillStyle = '#000000';
  ctx.fillRect(x, y, w, bar); ctx.fillRect(x, y + h - bar, w, bar);
  ctx.restore();
}

function finiteTime(t: number) { return Number.isFinite(t) ? t : 0; }
function writeLowLine(data: Uint8ClampedArray, cols: number, rows: number, x0: number, y0: number, x1: number, y1: number, width: number, value: number) {
  let x = x0, y = y0; const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let guard = 0; guard < cols + rows + 8; guard++) {
    for (let oy = 0; oy < width; oy++) for (let ox = 0; ox < width; ox++) {
      const px = x + ox, py = y + oy;
      if (px < 0 || py < 0 || px >= cols || py >= rows) continue;
      const i = (py * cols + px) * 4; data[i] = value; data[i + 1] = value; data[i + 2] = value; data[i + 3] = 255;
    }
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}
