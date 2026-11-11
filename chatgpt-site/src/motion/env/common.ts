import { H, W, hash, type Ctx, type Theme } from '../core.ts';
import { CELL, bayer, dither } from '../pix.ts';

export interface EnvCamera {
  x?: number;
  y?: number;
  zoom?: number;
  rot?: number;
  yaw?: number;
  pitch?: number;
}

export interface EnvOptions {
  t: number;
  camera?: EnvCamera;
  theme?: Theme;
  seed?: number;
  width?: number;
  height?: number;
}

export const envSize = (options: EnvOptions) => ({ w: options.width ?? W, h: options.height ?? H });
export const envTheme = (options: EnvOptions) => options.theme ?? {
  mode: 'dark' as const, bg: '#050506', fg: '#F4F4F5', panel: '#111114', panelAlt: '#1C1C20',
  line: '#45454B', muted: '#77777D', dim: '#BDBDC2', accent: '#FFFFFF', accentSolid: '#FFFFFF',
  spectrum: ['#FFFFFF'], onAccent: '#000000', time: options.t,
};
export const envSeed = (options: EnvOptions) => options.seed ?? 173;
export const cam = (options: EnvOptions, depth = 1) => {
  const c = options.camera ?? {};
  const zoom = Math.max(.72, Math.min(1.55, c.zoom ?? 1));
  const rot = c.rot ?? (c.yaw ?? 0) * .12;
  return {
    x: Math.round(((c.x ?? 0) * depth - rot * 92) / CELL) * CELL,
    y: Math.round(((c.y ?? 0) * depth + (c.pitch ?? 0) * 80) / CELL) * CELL,
    zoom,
    rot,
    yaw: c.yaw ?? 0,
    pitch: c.pitch ?? 0,
  };
};

/** Draws a pixel stepped line with Bresenham on the CELL grid. */
export function pixelLine(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, color: string, width = CELL) {
  let ax = Math.round(x0 / CELL), ay = Math.round(y0 / CELL);
  const bx = Math.round(x1 / CELL), by = Math.round(y1 / CELL);
  const dx = Math.abs(bx - ax), sx = ax < bx ? 1 : -1, dy = -Math.abs(by - ay), sy = ay < by ? 1 : -1;
  let err = dx + dy;
  ctx.fillStyle = color;
  for (let guard = 0; guard < 6000; guard++) {
    ctx.fillRect(ax * CELL, ay * CELL, width, width);
    if (ax === bx && ay === by) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; ax += sx; }
    if (e2 <= dx) { err += dx; ay += sy; }
  }
}

export function steppedPoly(ctx: Ctx, points: Array<[number, number]>, color: string, width: number, height: number, cell = CELL) {
  const cols = Math.ceil(width / cell), rows = Math.ceil(height / cell);
  const inside = (x: number, y: number) => {
    let hit = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i]!, [xj, yj] = points[j]!;
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
  ctx.fillStyle = color;
  for (let row = 0; row < rows; row++) {
    let start = -1;
    for (let col = 0; col <= cols; col++) {
      const on = col < cols && inside(col * cell + cell / 2, row * cell + cell / 2);
      if (on && start < 0) start = col;
      else if (!on && start >= 0) { ctx.fillRect(start * cell, row * cell, (col - start) * cell, cell); start = -1; }
    }
  }
}

export function drawSkyBase(ctx: Ctx, options: EnvOptions, horizon = .58) {
  const { w, h } = envSize(options), theme = envTheme(options), camera = cam(options, .12);
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, w, h);
  // A three-step monochrome sky, made only from ordered dither coverage.
  const top = Math.max(0, Math.round(camera.y * .18 / CELL) * CELL);
  dither(ctx, -CELL, top, w + CELL * 2, Math.floor(h * horizon) - top, theme.fg, (_u, v) => .035 + (1 - v) * .19, CELL);
  dither(ctx, -CELL, Math.floor(h * horizon * .72), w + CELL * 2, Math.floor(h * horizon * .3), theme.dim, (_u, v) => .04 + v * .17, CELL);
  // Sparse, seeded distant specks keep the sky from reading as a flat card.
  const seed = envSeed(options);
  for (let i = 0; i < 56; i++) {
    const x = Math.floor((hash(i, seed + 4) * w + camera.x * .3) / CELL) * CELL;
    const y = Math.floor((hash(i, seed + 8) * h * horizon * .84 + camera.y * .18) / CELL) * CELL;
    if (hash(i, Math.floor(options.t * 2) + seed) > .32) {
      ctx.fillStyle = hash(i, seed + 7) > .76 ? theme.dim : theme.line;
      ctx.fillRect(x, y, CELL, CELL);
    }
  }
}

/** Ordered dither fill helper for irregular pixel silhouettes. */
export function ditherShape(ctx: Ctx, x: number, y: number, w: number, h: number, amount: (u: number, v: number) => number, color: string, seed = 0) {
  const cols = Math.floor(w / CELL), rows = Math.floor(h / CELL);
  ctx.fillStyle = color;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const u = cols > 1 ? col / (cols - 1) : 0, v = rows > 1 ? row / (rows - 1) : 0;
      const threshold = (bayer(col + seed, row + seed * 3) + hash(col + seed * 19, row + seed * 29) * .07) % 1;
      if (amount(u, v) > threshold) ctx.fillRect(x + col * CELL, y + row * CELL, CELL, CELL);
    }
  }
}
