import { type Ctx } from '../core.ts';
import { CELL } from '../pix.ts';
import { cam, drawSkyBase, envSize, envTheme, pixelLine, type EnvOptions } from './common.ts';

/** Pixel ocean with a broken horizon, layered wave crests, and ordered-dither shimmer. */
export function drawEnv(ctx: Ctx, options: EnvOptions) {
  const { w, h } = envSize(options), theme = envTheme(options), t = options.t, camera = cam(options, .22);
  const horizon = Math.round((h * .49 + camera.y * .22) / CELL) * CELL;
  drawSkyBase(ctx, options, .5);
  ctx.fillStyle = '#070708'; ctx.fillRect(0, horizon, w, h - horizon);
  ctx.fillStyle = theme.dim; ctx.fillRect(0, horizon, w, CELL);
  for (let row = 0; row < 24; row++) {
    const depth = row / 24;
    const y = horizon + CELL * (2 + row * row * .64) + Math.round(camera.y * depth * .08 / CELL) * CELL;
    if (y >= h) break;
    const amp = 3 + depth * 12, wavelength = Math.max(28, 104 - depth * 42);
    const scroll = t * (16 + depth * 70) + camera.x * depth * .2;
    const step = CELL * 2;
    let px = 0, py = y;
    for (let x = 0; x <= w + step; x += step) {
      const wave = Math.sin((x + scroll) / wavelength + row * 1.31) * amp
        + Math.sin((x - scroll * .43) / (wavelength * .57) + row * .7) * amp * .28;
      const nextY = Math.round((y + wave) / CELL) * CELL;
      if (x > 0) pixelLine(ctx, px, py, x, nextY, row % 4 === 0 ? theme.dim : theme.line, CELL);
      px = x; py = nextY;
    }
    if (row % 3 === 0) {
      ctx.fillStyle = theme.fg;
      const glintX = Math.round(((row * 137 + t * (29 + row)) % w) / CELL) * CELL;
      const glintY = Math.round((y + Math.sin(t * 2 + row) * amp) / CELL) * CELL;
      ctx.fillRect(glintX, glintY, CELL * (2 + row % 3), CELL);
    }
  }
}
