import type { Ctx } from '../core.ts';
import { CELL, bayer } from '../pix.ts';
import { cam, envSize, envTheme, pixelLine, type EnvOptions } from './common.ts';

/** Noir stage with stepped volumetric light cones and a reflective floor. */
export function drawEnv(ctx: Ctx, options: EnvOptions) {
  const { w, h } = envSize(options), theme = envTheme(options), camera = cam(options, .22);
  ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, w, h);
  const floor = Math.round((h * .69 + camera.y * .2) / CELL) * CELL;
  for (let i = 0; i < 3; i++) {
    const origin = Math.round((w * (.21 + i * .29) - camera.x * .15) / CELL) * CELL;
    const spread = w * (.17 + i % 2 * .025);
    const color = i === 1 ? '#BDBDC2' : '#77777D';
    ctx.fillStyle = color;
    const rows = Math.ceil(floor / CELL);
    for (let row = 0; row < rows; row++) {
      const v = row / Math.max(1, rows - 1), half = CELL * 5 + (spread - CELL * 5) * v;
      const left = Math.max(0, Math.floor((origin - half) / CELL)), right = Math.min(Math.ceil(w / CELL), Math.ceil((origin + half) / CELL));
      const coverage = .24 + .24 * (1 - v);
      for (let col = left; col < right; col++) if (coverage * (1 - Math.abs(col * CELL + CELL / 2 - origin) / Math.max(1, half)) > bayer(col, row))
        ctx.fillRect(col * CELL, row * CELL, CELL, CELL);
    }
  }
  ctx.fillStyle = '#080809'; ctx.fillRect(0, floor, w, h - floor);
  ctx.fillStyle = theme.line; ctx.fillRect(0, floor, w, CELL);
  for (let i = 1; i <= 10; i++) {
    const y = floor + Math.round((i * i * 7 + i * 3) / CELL) * CELL;
    if (y < h) { ctx.fillStyle = i % 3 === 0 ? theme.dim : theme.line; ctx.fillRect(0, y, w, CELL); }
  }
  for (let x = -w; x <= w * 2; x += CELL * 20) pixelLine(ctx, w / 2, floor, x - camera.x * .2, h, theme.line, CELL);
  const poolY = floor + CELL * 6;
  ctx.fillStyle = theme.dim; ctx.fillRect(Math.round((w * .5 - camera.x * .2) / CELL) * CELL - CELL * 4, poolY, CELL * 8, CELL);
}
