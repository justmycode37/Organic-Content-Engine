// Fine pixel rendering. Everything "pixel art" in a Reel is drawn on a small
// buffer and blown up without smoothing, so pixels are small (CELL canvas px),
// detailed and always on one grid. Also owns the rainbow accent: the spectrum,
// the animated pixel-mosaic paint, and the high-resolution pixel typeface.
import { hash, makeTheme, type AccentName, type Ctx, type Mode, type Theme } from './core.ts';

/** Size of one art pixel in canvas px. 4 gives a 270 x 480 pixel-art frame. */
export const CELL = 4;

// ---------------------------------------------------------------- spectrum

/**
 * The accent is not one colour but this spectrum, laid out in diagonal bands of
 * small pixels and always moving. Order follows the brand reference (ember,
 * red, orange, yellow, white, ice, cyan, blue, royal, violet).
 */
export const SPECTRUM = ['#FF2A2A', '#FF8A00', '#FFD400', '#FFF6D8', '#A8ECF2', '#19C3E6', '#1479E0', '#3B3BE0', '#7A3CF0', '#D1267F'] as const;
/** On a light canvas the two pale bands would vanish, so they are dropped. */
export const SPECTRUM_LIGHT = ['#E81E1E', '#FF7A00', '#F2B600', '#12B5D8', '#1479E0', '#3B3BE0', '#7A3CF0', '#D1267F'] as const;
/** Deep tones from the reference, for shaded sides of 3D accent faces and backdrops. Never for text. */
export const SPECTRUM_DEEP = ['#7A1232', '#2A1F4E', '#16161E'] as const;
export const spectrum = (mode: Mode = 'dark'): readonly string[] => (mode === 'light' ? SPECTRUM_LIGHT : SPECTRUM);

export const hexRgb = (hex: string): [number, number, number] => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
/** Spectrum colour at a continuous position (wraps). Use for discrete rainbow details: one colour per item. */
export function spectrumAt(position: number, mode: Mode = 'dark'): string {
  const list = spectrum(mode);
  return list[((Math.floor(position) % list.length) + list.length) % list.length]!;
}

// ---------------------------------------------------------------- buffers

type Layer = { canvas: OffscreenCanvas | HTMLCanvasElement; ctx: Ctx };
const pool = new Map<string, Layer>();
export const canDraw = () => typeof OffscreenCanvas !== 'undefined' || typeof document !== 'undefined';
/** A cleared scratch canvas from a pool. `key` separates buffers that are alive at the same time. */
export function layer(cols: number, rows: number, key = 'a'): Layer {
  const w = Math.max(1, Math.ceil(cols)), h = Math.max(1, Math.ceil(rows)), id = `${key}:${w}x${h}`;
  let item = pool.get(id);
  if (!item) {
    if (pool.size > 48) pool.clear();
    const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
    item = { canvas, ctx: canvas.getContext('2d', { willReadFrequently: true }) as Ctx };
    pool.set(id, item);
  }
  item.ctx.setTransform(1, 0, 0, 1, 0, 0);
  item.ctx.globalAlpha = 1;
  item.ctx.globalCompositeOperation = 'source-over';
  item.ctx.clearRect(0, 0, w, h);
  return item;
}

/** Draws a small buffer onto the frame at `cell` canvas px per buffer pixel, hard edged. */
export function blit(ctx: Ctx, source: CanvasImageSource, x: number, y: number, cols: number, rows: number, cell = CELL) {
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, Math.round(x), Math.round(y), cols * cell, rows * cell);
  ctx.imageSmoothingEnabled = smooth;
}

let depth = 0;
/**
 * Runs `draw` with normal canvas coordinates but rasterises it as pixel art:
 * the region (x, y, w, h) is drawn at 1/cell resolution, edges are made hard
 * and the result is scaled back up. Use it to turn ANY vector drawing (lines,
 * circles, curves, polygons, big type) into fine, on-grid pixels.
 */
export function pixelate(ctx: Ctx, x: number, y: number, w: number, h: number, draw: (p: Ctx) => void, options: { cell?: number; crisp?: boolean } = {}) {
  const cell = options.cell ?? CELL;
  const cols = Math.ceil(w / cell), rows = Math.ceil(h / cell);
  if (cols < 1 || rows < 1 || !canDraw()) return;
  const left = Math.round(x / cell) * cell, top = Math.round(y / cell) * cell;
  const buffer = layer(cols, rows, `px${depth++}`);
  try {
    const p = buffer.ctx;
    p.save();
    p.scale(1 / cell, 1 / cell);
    p.translate(-left, -top);
    draw(p);
    p.restore();
    if (options.crisp !== false) {
      // Antialiased edges become fully on or fully off: that is what makes it pixel art.
      const image = p.getImageData(0, 0, cols, rows), data = image.data;
      for (let i = 3; i < data.length; i += 4) data[i] = data[i]! >= 112 ? 255 : 0;
      p.putImageData(image, 0, 0);
    }
    blit(ctx, buffer.canvas as CanvasImageSource, left, top, cols, rows, cell);
  } finally { depth--; }
}

// ---------------------------------------------------------------- rainbow paint

/**
 * Which spectrum colour an art pixel gets. Reads like a heatmap: the colours
 * follow the contours of a smooth, wandering field (no straight stripes, no
 * stray speckles), so neighbouring pixels always belong to the same soft blob.
 * Periodic over `n * band * 2` pixels in x and y, so it can be tiled.
 */
export function spectrumIndex(x: number, y: number, n: number, band = 3): number {
  const size = n * band * 2, k = (Math.PI * 2) / size;
  const warp = 1.9 * Math.sin((x - y) * k) + 1.2 * Math.sin((x * 2 + y) * k + 1.7) + 0.9 * Math.sin((x - y * 3) * k + 4.1)
    + 0.7 * Math.sin((x * 3 + y * 2) * k + 0.6) + 0.45 * Math.sin((x * 4 - y * 3) * k + 2.9);
  return (((Math.floor((x + y) / band + warp)) % n) + n) % n;
}

const tiles = new Map<string, Layer>();
/**
 * The accent paint: diagonal spectrum bands built from small pixels, drifting
 * with `time`. It is a CanvasPattern, so it works as fillStyle or strokeStyle
 * for rects, paths and text alike. Returns a solid colour where no canvas exists.
 */
export function rainbowPaint(ctx: Ctx, time = 0, mode: Mode = 'dark', cell = CELL * 2, band = 3): string | CanvasPattern {
  const colors = spectrum(mode);
  if (!canDraw() || typeof ctx.createPattern !== 'function') return colors[0]!;
  const id = `${mode}:${band}`;
  let tile = tiles.get(id);
  const size = colors.length * band * 2;
  if (!tile) {
    const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(size, size) : Object.assign(document.createElement('canvas'), { width: size, height: size });
    tile = { canvas, ctx: canvas.getContext('2d') as Ctx };
    const image = tile.ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const [r, g, b] = hexRgb(colors[spectrumIndex(x, y, colors.length, band)]!);
      // Each pixel is a slightly different tile, like the hand-laid mosaic in the reference.
      const k = 0.96 + 0.04 * hash(x, y);
      const i = (y * size + x) * 4;
      image.data[i] = r * k; image.data[i + 1] = g * k; image.data[i + 2] = b * k; image.data[i + 3] = 255;
    }
    tile.ctx.putImageData(image, 0, 0);
    tiles.set(id, tile);
  }
  const pattern = ctx.createPattern(tile.canvas as CanvasImageSource, 'repeat');
  if (!pattern) return colors[0]!;
  // Bands travel one pixel at a time so the mosaic never smears.
  const shift = Math.floor(time * 9) % size;
  pattern.setTransform(new DOMMatrix([cell, 0, 0, cell, -shift * cell, 0]));
  return pattern;
}

/** The theme for one frame: greys from makeTheme, plus the live rainbow accent and its spectrum. */
export function frameTheme(ctx: Ctx, mode: Mode = 'dark', accent: AccentName = 'rainbow', time = 0): Theme {
  const theme = makeTheme(mode, accent);
  theme.time = time;
  if (accent === 'rainbow') { theme.accent = rainbowPaint(ctx, time, mode); theme.spectrum = spectrum(mode); }
  return theme;
}

// ---------------------------------------------------------------- high-resolution pixel type

/** Heavy condensed display face that is rasterised into pixels for titles. */
export const DISPLAY = "'Anton', 'Impact', 'Haettenschweiler', 'Arial Narrow Bold', 'Arial Black', sans-serif";
export interface TypeMask { cols: number; rows: number; cap: number; bits: Uint8Array; /** start column of each character, plus the end column */ edges: number[] }
const masks = new Map<string, TypeMask | null>();
let measure: Ctx | null | undefined;
let capRatio = 0;
function measurer(): Ctx | null {
  if (measure !== undefined) return measure;
  measure = typeof OffscreenCanvas !== 'undefined' ? (new OffscreenCanvas(4, 4).getContext('2d') as Ctx) : typeof document !== 'undefined' ? (document.createElement('canvas').getContext('2d') as Ctx) : null;
  if (measure) { measure.font = `400 200px ${DISPLAY}`; capRatio = measure.measureText('H').actualBoundingBoxAscent / 200 || 0.72; }
  return measure;
}

/**
 * Pixel mask of `text` set in the display face with a cap height of `cap`
 * art pixels. Null where no canvas exists (node tests): callers fall back to
 * the 5x7 bitmap face.
 */
export function typeMask(text: string, cap: number): TypeMask | null {
  const id = `${cap}|${text}`;
  const cached = masks.get(id);
  if (cached !== undefined) return cached;
  const m = measurer();
  if (!m) { masks.set(id, null); return null; }
  const size = cap / capRatio, track = Math.max(1, Math.round(cap / 7));
  const fontSpec = `400 ${size}px ${DISPLAY}`;
  m.font = fontSpec;
  const chars = [...text], edges: number[] = [];
  let cursor = 0;
  for (const char of chars) { edges.push(cursor); cursor += Math.max(1, Math.round(m.measureText(char).width)) + track; }
  const cols = Math.max(1, cursor - track);
  edges.push(cols);
  const pad = Math.ceil(cap * 0.3), rows = cap + pad;
  const buffer = layer(cols, rows, 'type');
  buffer.ctx.font = fontSpec;
  buffer.ctx.textBaseline = 'alphabetic';
  buffer.ctx.fillStyle = '#fff';
  chars.forEach((char, index) => buffer.ctx.fillText(char, edges[index]!, cap));
  const data = buffer.ctx.getImageData(0, 0, cols, rows).data;
  const bits = new Uint8Array(cols * rows);
  for (let i = 0; i < bits.length; i++) bits[i] = data[i * 4 + 3]! >= 132 ? 1 : 0;
  const mask = { cols, rows, cap, bits, edges };
  if (masks.size > 600) masks.clear();
  masks.set(id, mask);
  return mask;
}

/** Fills the set pixels of a mask between two columns as merged runs (fast, and safe for pattern paints). */
export function fillMask(ctx: Ctx, mask: TypeMask, x: number, y: number, cell: number, from = 0, to = mask.cols, keep?: (col: number, row: number) => boolean) {
  for (let row = 0; row < mask.rows; row++) {
    let run = -1;
    for (let col = from; col <= to; col++) {
      const on = col < to && mask.bits[row * mask.cols + col] === 1 && (!keep || keep(col, row));
      if (on && run < 0) run = col;
      else if (!on && run >= 0) { ctx.fillRect(x + run * cell, y + row * cell, (col - run) * cell, cell); run = -1; }
    }
  }
}

// ---------------------------------------------------------------- shading

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** Ordered-dither threshold 0..1 for an art pixel. Compare a 0..1 value against it to get a hard on/off pattern. */
export const bayer = (col: number, row: number) => (BAYER[(row & 3) * 4 + (col & 3)]! + 0.5) / 16;

/**
 * Dithered fill: paints `color` over the rect with a pixel density that follows
 * `amount(u, v)` (0..1 across the rect). The only gradient this style allows.
 */
export function dither(ctx: Ctx, x: number, y: number, w: number, h: number, color: string | CanvasPattern, amount: (u: number, v: number) => number, cell = CELL) {
  const cols = Math.floor(w / cell), rows = Math.floor(h / cell);
  const left = Math.round(x / cell) * cell, top = Math.round(y / cell) * cell;
  ctx.fillStyle = color;
  for (let row = 0; row < rows; row++) {
    let run = -1;
    for (let col = 0; col <= cols; col++) {
      const on = col < cols && amount(cols > 1 ? col / (cols - 1) : 0, rows > 1 ? row / (rows - 1) : 0) > bayer(col + left / cell, row + top / cell);
      if (on && run < 0) run = col;
      else if (!on && run >= 0) { ctx.fillRect(left + run * cell, top + row * cell, (col - run) * cell, cell); run = -1; }
    }
  }
}
