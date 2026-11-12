import type { Ctx } from '../core.ts';
import { CELL, dither } from '../pix.ts';
import { cam, drawSkyBase, envSize, envTheme, pixelLine, type EnvOptions } from './common.ts';

/** Horizon and vanishing-point floor grid; camera pan and time scroll the floor. */
export function drawEnv(ctx: Ctx, options: EnvOptions) {
  const { w, h } = envSize(options), theme = envTheme(options), camera = cam(options, .22), t = options.t;
  const horizon = Math.round((h * .53 + camera.y) / CELL) * CELL;
  drawSkyBase(ctx, options, .55);
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, horizon, w, h - horizon);
  dither(ctx, 0, horizon, w, h - horizon, theme.dim, (_u, v) => v * .08, CELL);

  const vanishX = Math.round((w * .5 - camera.x * .35) / CELL) * CELL;
  ctx.fillStyle = theme.line;
  ctx.fillRect(0, horizon, w, CELL);
  // Vanishing rays are rasterised as square steps so they never blur.
  for (let x = -w; x <= w * 2; x += 112) {
    const baseX = x + Math.round(((t * 22 + camera.x * .2) % 112) / CELL) * CELL;
    pixelLine(ctx, vanishX, horizon, baseX, h, theme.line, CELL);
  }
  const phase = ((t * 44 + camera.y) % 88 + 88) % 88;
  for (let i = 0; i < 12; i++) {
    const distance = 22 + phase;
    const y = horizon + Math.round((distance * (1.28 ** i)) / CELL) * CELL;
    if (y >= h) break;
    const brightness = i % 3 === 0 ? theme.dim : theme.line;
    ctx.fillStyle = brightness;
    ctx.fillRect(0, y, w, i % 3 === 0 ? CELL : Math.max(2, CELL / 2));
  }
  ctx.fillStyle = theme.fg;
  ctx.fillRect(vanishX - CELL * 2, horizon - CELL, CELL * 4, CELL);
}
