import { clamp, hash, type Cue, type Ctx, type Theme, type TransitionDirection, type TransitionName } from '../core.ts';

export const TRANSITION_DURATIONS: Record<TransitionName, number> = {
  cut: 0,
  blocks: 0.42, wipe: 0.38, glitch: 0.32, zoom: 0.48, flash: 0.3, shutter: 0.38,
  push: 0.42, whip: 0.3, zoomthrough: 0.52, shatter: 0.5, pixelsort: 0.46, melt: 0.48,
  iris: 0.24, cube: 0.52, flip: 0.42, dissolve: 0.44, slice: 0.38, ink: 0.52, match: 0.2,
};
/** Symmetric defaults kept for callers that used the original timing constants. */
export const TRANSITION_OUT = 0.21;
export const TRANSITION_IN = 0.21;
const W = 1080, H = 1920, CELL = 12;
type ImageLayer = CanvasImageSource;

export interface TransitionOptions {
  focus?: [number, number];
  direction?: TransitionDirection;
  height?: number;
}

const stepped = (value: number, unit = 4) => Math.round(value / unit) * unit;
const easeInOut = (p: number) => p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

/** Keep legacy transition names valid while routing HEDGY to the clean renderer set. */
const CLEAN_TRANSITION_MAP: Readonly<Record<TransitionName, TransitionName>> = {
  cut: 'cut', blocks: 'match', wipe: 'iris', glitch: 'match', zoom: 'push', flash: 'match', shutter: 'iris',
  push: 'push', whip: 'push', zoomthrough: 'push', shatter: 'match', pixelsort: 'match', melt: 'match',
  iris: 'iris', cube: 'push', flip: 'push', dissolve: 'match', slice: 'push', ink: 'iris', match: 'match',
};
export const cleanTransition = (name: TransitionName): TransitionName => CLEAN_TRANSITION_MAP[name] ?? 'cut';
function entryVector(direction: TransitionDirection) {
  if (direction === 'left') return [1, 0];
  if (direction === 'right') return [-1, 0];
  if (direction === 'up') return [0, 1];
  return [0, -1];
}

function drawLayer(ctx: Ctx, image: ImageLayer, x = 0, y = 0, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, stepped(x), stepped(y), W, H);
  ctx.restore();
}

function drawCleanLayer(ctx: Ctx, image: ImageLayer, height: number, x = 0, y = 0, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(image, 0, 0, W, height, x, y, W, height);
  ctx.restore();
}

function drawCleanScaled(ctx: Ctx, image: ImageLayer, height: number, focus: [number, number], scale: number, alpha: number) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.imageSmoothingEnabled = true;
  ctx.translate(focus[0], focus[1]);
  ctx.scale(scale, scale);
  ctx.translate(-focus[0], -focus[1]);
  ctx.drawImage(image, 0, 0, W, height);
  ctx.restore();
}

/** Continuous two-plane slide; the incoming stage fills beneath both planes. */
function drawCleanPush(ctx: Ctx, outgoing: ImageLayer, incoming: ImageLayer, progress: number, direction: TransitionDirection, height: number) {
  // quintic in-out: gentle start and a soft, fully settled stop (no jolt at the end of the move)
  const u = Math.max(0, Math.min(1, progress)), p = u < 0.5 ? 16 * u ** 5 : 1 - ((-2 * u + 2) ** 5) / 2;
  const [vx, vy] = entryVector(direction);
  const dx = vx * W, dy = vy * height;
  drawCleanLayer(ctx, incoming, height);
  drawCleanLayer(ctx, outgoing, height, -dx * p, -dy * p);
  drawCleanLayer(ctx, incoming, height, dx * (1 - p), dy * (1 - p));
}

function drawCleanIris(ctx: Ctx, outgoing: ImageLayer, incoming: ImageLayer, progress: number, focus: [number, number], height: number) {
  drawCleanLayer(ctx, outgoing, height);
  const radius = Math.hypot(W, height) * easeInOut(progress);
  ctx.save();
  ctx.beginPath();
  ctx.arc(focus[0], focus[1], radius, 0, Math.PI * 2);
  ctx.clip();
  drawCleanLayer(ctx, incoming, height);
  ctx.restore();
}

function drawCleanMatch(ctx: Ctx, outgoing: ImageLayer, incoming: ImageLayer, progress: number, focus: [number, number], height: number) {
  const p = easeInOut(progress), scale = 1 + 0.012 * Math.sin(Math.PI * p);
  drawCleanScaled(ctx, outgoing, height, focus, scale, 1);
  drawCleanScaled(ctx, incoming, height, focus, scale, p);
}

function drawTransformed(ctx: Ctx, image: ImageLayer, focus: [number, number], scaleX: number, scaleY = scaleX, x = 0, y = 0, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.imageSmoothingEnabled = !Number.isInteger(scaleX) || !Number.isInteger(scaleY) || x % 1 !== 0 || y % 1 !== 0;
  ctx.translate(stepped(focus[0] + x), stepped(focus[1] + y));
  ctx.scale(scaleX, scaleY);
  ctx.translate(-focus[0], -focus[1]);
  ctx.drawImage(image, 0, 0, W, H);
  ctx.restore();
}

function drawMotionLayer(ctx: Ctx, image: ImageLayer, x: number, y: number, height: number, scale: number, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.imageSmoothingEnabled = true;
  if (scale === 1) {
    ctx.drawImage(image, 0, 0, W, height, stepped(x), stepped(y), W, height);
  } else {
    ctx.translate(stepped(W / 2 + x), stepped(height / 2 + y));
    ctx.scale(scale, scale);
    ctx.translate(-W / 2, -height / 2);
    ctx.drawImage(image, 0, 0, W, height, 0, 0, W, height);
  }
  ctx.restore();
}

/** A small scale pulse lets the moving planes pass their landing point, then settle. */
function landingPunch(progress: number) {
  const settle = clamp((progress - 0.76) / 0.24);
  return 1 + 0.018 * Math.sin(Math.PI * settle);
}

function drawCell(ctx: Ctx, image: ImageLayer, x: number, y: number, cell: number) {
  const width = Math.min(cell, W - x), height = Math.min(cell, H - y);
  if (width > 0 && height > 0) ctx.drawImage(image, x, y, width, height, x, y, width, height);
}

function bayer(x: number, y: number) {
  const matrix = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  return (matrix[(y & 3) * 4 + (x & 3)]! + 0.5) / 16;
}

function drawDither(ctx: Ctx, incoming: ImageLayer, outgoing: ImageLayer, progress: number, seed: number, height: number, ordered: boolean) {
  drawLayer(ctx, outgoing);
  const rows = Math.ceil(height / CELL), cols = Math.ceil(W / CELL);
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const order = ordered ? bayer(col + seed % 4, row + Math.floor(seed / 4) % 4) :
      (col / cols + row / rows) * 0.5 + hash(col * 31 + row * 997, seed) * 0.1;
    if (order <= progress) drawCell(ctx, incoming, col * CELL, row * CELL, CELL);
  }
}

function drawIris(ctx: Ctx, outgoing: ImageLayer, incoming: ImageLayer, progress: number, focus: [number, number], height: number) {
  drawLayer(ctx, outgoing);
  const p = easeInOut(progress), settle = clamp((progress - 0.74) / 0.26);
  const radius = stepped(Math.hypot(W, height) * 1.04 * (p + 0.025 * Math.sin(Math.PI * settle)), CELL);
  const cols = Math.ceil(W / CELL), rows = Math.ceil(height / CELL);
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const x = col * CELL, y = row * CELL;
    const cx = x + CELL / 2, cy = y + CELL / 2;
    const d = Math.hypot(cx - focus[0], cy - focus[1]);
    const jitter = (hash(col * 83 + row * 41, 19) - 0.5) * CELL * 1.3;
    if (d + jitter <= radius) drawCell(ctx, incoming, x, y, CELL);
  }
}

function drawInk(ctx: Ctx, outgoing: ImageLayer, incoming: ImageLayer, progress: number, focus: [number, number], height: number, seed: number) {
  drawLayer(ctx, outgoing);
  const cols = Math.ceil(W / CELL), rows = Math.ceil(height / CELL);
  const maxDistance = Math.hypot(W, height) * 1.15;
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const x = col * CELL, y = row * CELL;
    const nx = (x + CELL / 2 - focus[0]) / W, ny = (y + CELL / 2 - focus[1]) / height;
    const distance = Math.hypot(nx * W, ny * height);
    const edge = Math.sin(nx * 25 + seed) * Math.cos(ny * 21 - seed * 0.7) * 0.055
      + Math.sin((nx + ny) * 43 + seed * 0.4) * 0.025
      + (hash(col * 67 + row * 101, seed) - 0.5) * 0.05;
    if (distance / maxDistance + edge <= progress) drawCell(ctx, incoming, x, y, CELL);
  }
}

function drawPush(ctx: Ctx, outgoing: ImageLayer, incoming: ImageLayer, progress: number, direction: TransitionDirection, height: number, echoes = 0) {
  const [vx, vy] = entryVector(direction), p = easeInOut(progress);
  const dx = vx * W, dy = vy * height;
  const parallax = stepped(20 * Math.sin(Math.PI * p), 4);
  const echoStrength = 0.14 * Math.sin(Math.PI * p);
  const punch = landingPunch(progress);
  // The incoming scene is a safety fill beneath the two moving planes. Their
  // capped travel meets edge-to-edge, so this only appears at a raster seam.
  drawLayer(ctx, incoming);
  if (echoes) {
    for (let i = echoes; i >= 1; i--) {
      const trail = clamp(p - i * 0.045);
      drawMotionLayer(ctx, outgoing, -dx * trail, -dy * trail - parallax * 0.45, height, punch, echoStrength / i);
      drawMotionLayer(ctx, incoming, dx * (1 - trail), dy * (1 - trail) + parallax * 0.45, height, punch, echoStrength / i);
    }
  }
  // Offset near and far scene planes by a few pixel cells to hold depth as the cut moves.
  drawMotionLayer(ctx, outgoing, -dx * p, -dy * p - parallax * 0.35, height, punch);
  drawMotionLayer(ctx, incoming, dx * (1 - p), dy * (1 - p) + parallax * 0.65, height, punch);
  if (echoes && progress > 0.06 && progress < 0.94) {
    ctx.fillStyle = '#FFFFFF';
    ctx.globalAlpha *= 0.22;
    const edgeX = dx ? stepped(W * p * (dx > 0 ? -1 : 1)) : 0;
    const edgeY = dy ? stepped(height * p * (dy > 0 ? -1 : 1)) : 0;
    if (dx) ctx.fillRect(edgeX, 0, 8, height);
    else ctx.fillRect(0, edgeY, W, 8);
  }
}

function drawWhip(ctx: Ctx, outgoing: ImageLayer, incoming: ImageLayer, progress: number, direction: TransitionDirection, height: number) {
  const [vx, vy] = entryVector(direction), p = easeInOut(progress);
  const distanceX = W, distanceY = height;
  const echoStrength = 0.14 * Math.sin(Math.PI * p);
  const punch = landingPunch(progress);
  // Keep the whole aperture opaque if a stepped edge ever rounds unevenly.
  drawLayer(ctx, incoming);
  // Two stepped echoes turn the fast pan into a crisp, directional smear.
  for (let i = 2; i >= 1; i--) {
    const lag = i * 0.045;
    const trailP = clamp(p - lag);
    drawMotionLayer(ctx, outgoing, -vx * distanceX * trailP, -vy * distanceY * trailP, height, punch, echoStrength / i);
    drawMotionLayer(ctx, incoming, vx * distanceX * (1 - trailP), vy * distanceY * (1 - trailP), height, punch, echoStrength / i);
  }
  drawMotionLayer(ctx, outgoing, -vx * distanceX * p, -vy * distanceY * p, height, punch);
  drawMotionLayer(ctx, incoming, vx * distanceX * (1 - p), vy * distanceY * (1 - p), height, punch);
}

function drawZoom(ctx: Ctx, outgoing: ImageLayer, incoming: ImageLayer, progress: number, focus: [number, number]) {
  const p = easeInOut(progress);
  drawTransformed(ctx, outgoing, focus, 1 + 1.65 * p);
  if (p > 0.01) drawTransformed(ctx, incoming, focus, 0.12 + 0.88 * p);
}

function drawZoomthrough(ctx: Ctx, outgoing: ImageLayer, incoming: ImageLayer, progress: number, focus: [number, number]) {
  const p = easeInOut(progress), punch = landingPunch(progress);
  const outScale = 1 + 1.62 * p;
  const inScale = Math.min(1.035, 0.18 + 0.82 * p) * punch;
  // Staggered scale echoes make the portal feel like a fast, stepped camera move.
  for (let i = 3; i >= 1; i--) {
    const lag = i * 0.045, trail = Math.max(0, p - lag);
    const alpha = 0.12 / i * Math.sin(Math.PI * p);
    drawTransformed(ctx, outgoing, focus, 1 + 1.62 * trail, 1 + 1.62 * trail, 0, 0, alpha);
    if (p > 0.03) {
      const scale = Math.max(0.18, 0.18 + 0.82 * trail);
      drawTransformed(ctx, incoming, focus, scale, scale, 0, 0, alpha);
    }
  }
  drawTransformed(ctx, outgoing, focus, outScale, outScale);
  if (p > 0.01) drawTransformed(ctx, incoming, focus, inScale, inScale);
}

function drawShatter(ctx: Ctx, outgoing: ImageLayer, incoming: ImageLayer, progress: number, seed: number, height: number) {
  drawLayer(ctx, incoming);
  const cell = 24, cols = Math.ceil(W / cell), rows = Math.ceil(height / cell);
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const delay = hash(col * 31 + row * 113, seed) * 0.42;
    const p = clamp((progress - delay) / 0.46);
    if (p >= 1) continue;
    const x = col * cell, y = row * cell;
    const dx = stepped((hash(col + row * 17, seed + 31) - 0.5) * 180 * p, 4);
    const fall = stepped(220 * p * p + (hash(col * 7 + row, seed + 9) - 0.5) * 36 * p, 4);
    const width = Math.min(cell, W - x), tileH = Math.min(cell, height - y);
    ctx.drawImage(outgoing, x, y, width, tileH, x + dx, y + fall, width, tileH);
  }
}

function drawColumns(ctx: Ctx, outgoing: ImageLayer, incoming: ImageLayer, progress: number, seed: number, height: number, melt: boolean, direction: TransitionDirection) {
  drawLayer(ctx, incoming);
  const cell = 12, cols = Math.ceil(W / cell), rows = Math.ceil(height / cell);
  const [vx] = entryVector(direction);
  for (let col = 0; col < cols; col++) {
    const order = hash(col, seed);
    const p = clamp((progress - order * 0.45) / 0.53);
    if (p >= 1) continue;
    const x = col * cell, width = Math.min(cell, W - x);
    if (melt) {
      const y = stepped(height * p * p, 4);
      ctx.drawImage(outgoing, x, 0, width, height, x, y, width, height);
    } else {
      const shift = stepped((hash(col, seed + 13) - 0.5) * 200 * p, 4) - vx * 48 * p;
      const vertical = stepped((hash(col, seed + 29) - 0.5) * 120 * p, 4);
      ctx.drawImage(outgoing, x, 0, width, height, x + shift, vertical, width, height);
    }
  }
  // Small staggered drops keep the column edges stepped without a soft blur.
  if (melt && progress > 0.12 && progress < 0.9) {
    ctx.save();
    ctx.fillStyle = '#FFFFFF';
    for (let col = 0; col < cols; col += 5) {
      const p = clamp((progress - hash(col, seed) * 0.45) / 0.53);
      const y = stepped(height * p * p, 4);
      ctx.fillRect(col * cell, Math.min(height - 4, y), cell, 4);
    }
    ctx.restore();
  }
}

function drawCube(ctx: Ctx, outgoing: ImageLayer, incoming: ImageLayer, progress: number, focus: [number, number], flip: boolean, theme: Theme) {
  const p = easeInOut(progress), out = p < 0.5, local = out ? p * 2 : (p - 0.5) * 2;
  const minScale = flip ? 0.58 : 0.12;
  const scale = Math.max(minScale, out ? 1 - local * (1 - minScale) : minScale + local * (1 - minScale));
  const offset = stepped((out ? -1 : 1) * W * 0.18 * Math.sin(local * Math.PI / 2), 4);
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);
  if (flip) {
    // Keep scene detail behind the turning card so the midpoint never collapses to black.
    drawLayer(ctx, outgoing, 0, 0, 1 - p);
    drawLayer(ctx, incoming, 0, 0, p);
  }
  drawTransformed(ctx, out ? outgoing : incoming, focus, scale, flip ? 1 : 0.98, offset);
  const edge = stepped(focus[0] + offset + (out ? -1 : 1) * (W * scale / 2), 4);
  const depth = stepped((flip ? 8 : 52) * Math.sin(local * Math.PI), 4);
  ctx.fillStyle = flip ? theme.panelAlt : theme.line;
  ctx.fillRect(out ? edge : edge - depth, 0, Math.max(4, depth), H);
  if (!flip && depth > 8) {
    ctx.fillStyle = theme.panelAlt;
    ctx.fillRect(out ? edge + depth - 4 : edge - depth, 0, 4, H);
  }
  if (flip && local > 0.82) {
    ctx.fillStyle = theme.fg;
    for (let y = 12; y < H; y += 48) ctx.fillRect(edge - 4, y, 8, 20);
  }
}

function drawSlices(ctx: Ctx, outgoing: ImageLayer, incoming: ImageLayer, progress: number, seed: number, height: number, direction: TransitionDirection) {
  drawLayer(ctx, incoming);
  const slab = 48, count = Math.ceil(height / slab), [vx] = entryVector(direction);
  for (let row = 0; row < count; row++) {
    const y = row * slab, h = Math.min(slab, height - y);
    const parity = row % 2 ? -1 : 1;
    const localDir = parity * (direction === 'right' ? -1 : 1);
    const p = easeInOut(progress);
    const x = stepped(localDir * W * p, 4);
    ctx.drawImage(outgoing, 0, y, W, h, x, y, W, h);
    // The alternating slab seams read as motion while remaining on the pixel grid.
    if (p > 0.12 && p < 0.88) {
      ctx.save();
      ctx.fillStyle = '#FFFFFF';
      ctx.globalAlpha *= 0.32;
      ctx.fillRect(x + (localDir > 0 ? W - 8 : 0), y, 8, h);
      ctx.restore();
    }
  }
}

function drawGlitch(ctx: Ctx, outgoing: ImageLayer, incoming: ImageLayer, progress: number, seed: number, height: number) {
  drawLayer(ctx, incoming);
  const band = 24, count = Math.ceil(height / band);
  for (let row = 0; row < count; row++) {
    const y = row * band, h = Math.min(band, height - y);
    const local = clamp((progress - hash(row, seed) * 0.16) / 0.84);
    if (local >= 1) continue;
    const shift = stepped((hash(row, seed + 9) - 0.5) * 160 * (1 - local), 4);
    ctx.drawImage(outgoing, 0, y, W, h, shift, y, W, h);
  }
}

/** Composite two full scene canvases through a motivated, pixel-stepped transition. `progress` runs 0..1 across the cut. */
export function compositeTransition(ctx: Ctx, outgoing: ImageLayer, incoming: ImageLayer, name: TransitionName, progress: number, theme: Theme, seed: number, options: TransitionOptions = {}) {
  if (!Number.isFinite(progress)) return;
  const p = clamp(progress), height = clamp(options.height ?? H, 1, H);
  const direction = options.direction ?? 'left';
  const requestedFocus = options.focus ?? [W / 2, Math.min(height, 1290) / 2];
  const focus: [number, number] = [clamp(requestedFocus[0], 0, W), clamp(requestedFocus[1], 0, height)];
  const snappedFocus: [number, number] = [stepped(focus[0]), stepped(focus[1])];
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, W, height); ctx.clip();
  ctx.clearRect(0, 0, W, height);
  if (p <= 0) { drawLayer(ctx, outgoing); ctx.restore(); return; }
  if (p >= 1) { drawLayer(ctx, incoming); ctx.restore(); return; }
  switch (name) {
    case 'cut':
      drawLayer(ctx, p < 0.5 ? outgoing : incoming);
      break;
    case 'push':
      drawCleanPush(ctx, outgoing, incoming, p, direction, height);
      break;
    case 'whip':
      drawWhip(ctx, outgoing, incoming, p, direction, height);
      break;
    case 'zoom':
      drawZoom(ctx, outgoing, incoming, p, snappedFocus);
      break;
    case 'zoomthrough':
      drawZoomthrough(ctx, outgoing, incoming, p, snappedFocus);
      break;
    case 'shatter':
      drawShatter(ctx, outgoing, incoming, p, seed, height);
      break;
    case 'pixelsort':
      drawColumns(ctx, outgoing, incoming, p, seed, height, false, direction);
      break;
    case 'melt':
      drawColumns(ctx, outgoing, incoming, p, seed, height, true, direction);
      break;
    case 'iris':
      drawCleanIris(ctx, outgoing, incoming, p, focus, height);
      break;
    case 'cube':
      drawCube(ctx, outgoing, incoming, p, snappedFocus, false, theme);
      break;
    case 'flip':
      drawCube(ctx, outgoing, incoming, p, snappedFocus, true, theme);
      break;
    case 'dissolve':
    case 'blocks':
      drawDither(ctx, incoming, outgoing, p, seed, height, name === 'dissolve');
      break;
    case 'slice':
      drawSlices(ctx, outgoing, incoming, p, seed, height, direction);
      break;
    case 'ink':
      drawInk(ctx, outgoing, incoming, p, snappedFocus, height, seed);
      break;
    case 'wipe': {
      drawLayer(ctx, outgoing);
      const [vx, vy] = entryVector(direction), rows = Math.ceil(height / CELL);
      for (let row = 0; row < rows; row++) {
        const y = row * CELL, h = Math.min(CELL, height - y);
        const diag = direction === 'up' || direction === 'down' ? 0 : y * 0.28 * Math.sin(Math.PI * p);
        const edge = stepped(vx > 0 ? W * (1 - p) + diag : W * p - diag, CELL);
        if (vx > 0) { const left = clamp(edge, 0, W); ctx.drawImage(incoming, left, y, W - left, h, left, y, W - left, h); }
        else if (vx < 0) { const right = clamp(edge, 0, W); ctx.drawImage(incoming, 0, y, right, h, 0, y, right, h); }
        else {
          const reveal = stepped(height * p, CELL);
          const top = vy > 0 ? height - reveal : 0;
          const shown = vy > 0 ? clamp(y + h - top, 0, h) : clamp(top + reveal - y, 0, h);
          if (shown > 0) {
            const sourceY = vy > 0 ? Math.max(y, top) : y;
            ctx.drawImage(incoming, 0, sourceY, W, shown, 0, sourceY, W, shown);
          }
        }
      }
      break;
    }
    case 'glitch':
      drawGlitch(ctx, outgoing, incoming, p, seed, height);
      break;
    case 'shutter': {
      drawLayer(ctx, outgoing);
      const slab = 36, rows = Math.ceil(height / slab);
      for (let row = 0; row < rows; row++) {
        const y = row * slab, h = Math.min(slab, height - y);
        const delay = Math.abs(row - (rows - 1) / 2) / rows * 0.35;
        const local = clamp((p - delay) / 0.65);
        const reveal = stepped(local * W / 2, CELL);
        if (reveal > 0) ctx.drawImage(incoming, W / 2 - reveal, y, reveal * 2, h, W / 2 - reveal, y, reveal * 2, h);
      }
      break;
    }
    case 'flash': {
      drawDither(ctx, incoming, outgoing, p, seed, height, true);
      if (Math.abs(p - 0.5) <= 0.5 / 30) { ctx.fillStyle = theme.fg; ctx.fillRect(0, 0, W, height); }
      break;
    }
    case 'match': {
      drawCleanMatch(ctx, outgoing, incoming, p, focus, height);
      break;
    }
  }
  ctx.restore();
}

const cueAtCut: Partial<Record<TransitionName, Cue[]>> = {
  blocks: [{ t: -0.01, kind: 'tick', gain: 0.55 }],
  wipe: [{ t: -0.1, kind: 'swish', gain: 0.7 }],
  glitch: [{ t: -0.02, kind: 'tape', gain: 0.6 }],
  zoom: [{ t: -0.16, kind: 'rise', len: 0.28, gain: 0.62 }],
  flash: [{ t: 0, kind: 'shimmer', gain: 0.45 }],
  shutter: [{ t: -0.02, kind: 'servo', gain: 0.55 }],
  push: [{ t: -0.12, kind: 'whoosh', gain: 0.7, len: 0.38 }],
  whip: [{ t: -0.1, kind: 'whip', gain: 0.72, len: 0.22 }],
  zoomthrough: [{ t: -0.2, kind: 'rise', len: 0.4, gain: 0.65 }],
  shatter: [{ t: -0.02, kind: 'shatter', gain: 0.72 }],
  pixelsort: [{ t: -0.04, kind: 'reverse', gain: 0.55 }],
  melt: [{ t: -0.04, kind: 'drop', gain: 0.58 }],
  iris: [{ t: -0.12, kind: 'rise', len: 0.3, gain: 0.52 }],
  cube: [{ t: -0.03, kind: 'servo', gain: 0.6 }],
  flip: [{ t: -0.03, kind: 'tape', gain: 0.55 }],
  dissolve: [{ t: -0.05, kind: 'shimmer', gain: 0.45 }],
  slice: [{ t: -0.04, kind: 'swish', gain: 0.65 }],
  ink: [{ t: -0.12, kind: 'rise', len: 0.28, gain: 0.5 }],
  match: [{ t: -0.01, kind: 'impact', len: 0.16, gain: 0.5 }],
};

/** Cue moments in seconds relative to the cut; pan follows the transition travel direction. */
export function transitionCues(name: TransitionName, direction: TransitionDirection = 'left'): Cue[] {
  const pan = direction === 'left' ? -0.7 : direction === 'right' ? 0.7 : 0;
  return (cueAtCut[name] ?? []).map(cue => ({ ...cue, pan: cue.pan ?? pan }));
}

/** Legacy single-layer cover API retained for integrations that still draw a transition without scene canvases. */
export function drawTransition(ctx: Ctx, name: TransitionName, phase: number, theme: Theme, seed: number) {
  if (!Number.isFinite(phase) || name === 'cut') return;
  const cover = phase <= 0 ? clamp(phase + 1) : clamp(1 - phase);
  if (cover <= 0) return;
  if (name === 'match') {
    ctx.save();
    ctx.globalAlpha *= 0.18 * cover;
    ctx.strokeStyle = theme.fg;
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, W - 4, H - 4);
    ctx.restore();
    return;
  }
  ctx.save();
  const cols = Math.ceil(W / 20), rows = Math.ceil(H / 20), cell = 20;
  ctx.fillStyle = name === 'flash' ? theme.fg : theme.panelAlt;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const order = name === 'iris' || name === 'zoom' || name === 'zoomthrough'
      ? 1 - Math.hypot((x + 0.5) / cols - 0.5, (y + 0.5) / rows - 0.5) + hash(x * 31 + y * 997, seed) * 0.07
      : (x / cols + y / rows) * 0.5 + hash(x * 31 + y * 997, seed) * 0.09;
    if (order < cover) ctx.fillRect(x * cell, y * cell, cell + 1, cell + 1);
  }
  ctx.restore();
}
