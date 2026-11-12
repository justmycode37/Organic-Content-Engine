import { hash, type Ctx } from '../core.ts';
import { CELL } from '../pix.ts';
import { cam, envSeed, envSize, envTheme, pixelLine, type EnvOptions } from './common.ts';

/** Sparse depth stars and a receding, pixel-stepped warp tunnel. */
export function drawEnv(ctx: Ctx, options: EnvOptions) {
  const { w, h } = envSize(options), theme = envTheme(options), seed = envSeed(options), camera = cam(options, .28), t = options.t;
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, w, h);
  const cx = Math.round((w / 2 - camera.x * .6) / CELL) * CELL;
  const cy = Math.round((h * .47 + camera.y * .45) / CELL) * CELL;
  for (let i = 0; i < 190; i++) {
    const phase = hash(i, seed + 2) * 14 + t * (1.1 + hash(i, seed + 8) * 2.7);
    const depth = (phase % 14) / 14;
    const angle = hash(i, seed + 4) * Math.PI * 2 + (camera.rot ?? 0) * .25;
    const radius = (24 + depth * Math.max(w, h) * .57) * (camera.zoom ?? 1);
    const x = Math.round((cx + Math.cos(angle) * radius) / CELL) * CELL;
    const y = Math.round((cy + Math.sin(angle) * radius) / CELL) * CELL;
    const size = depth > .78 ? CELL * 2 : CELL;
    ctx.fillStyle = hash(i, Math.floor(t * 4) + seed) > .23 ? theme.dim : theme.line;
    ctx.fillRect(x, y, size, size);
    if (depth > .87 && hash(i, seed + 13) > .62) {
      const tx = Math.round((cx + Math.cos(angle) * radius * .89) / CELL) * CELL;
      const ty = Math.round((cy + Math.sin(angle) * radius * .89) / CELL) * CELL;
      pixelLine(ctx, tx, ty, x, y, theme.line, CELL);
    }
  }
  for (let ring = 0; ring < 11; ring++) {
    const r = 32 + ((ring * 89 + Math.floor(t * 94)) % 940);
    const corners: Array<[number, number]> = [];
    for (let i = 0; i <= 16; i++) {
      const a = i * Math.PI / 8 + (camera.rot ?? 0) * .2;
      corners.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * .66]);
    }
    for (let i = 1; i < corners.length; i++) {
      const [x0, y0] = corners[i - 1]!, [x1, y1] = corners[i]!;
      pixelLine(ctx, x0, y0, x1, y1, ring % 3 === 0 ? theme.dim : theme.line, CELL);
    }
  }
}
