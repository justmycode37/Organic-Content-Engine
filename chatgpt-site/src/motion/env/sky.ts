import type { Ctx } from '../core.ts';
import { cam, drawSkyBase, envSize, envTheme, type EnvOptions } from './common.ts';

/** Monochrome sky with an ordered-dither luminance field and a low hard horizon. */
export function drawEnv(ctx: Ctx, options: EnvOptions) {
  const { w, h } = envSize(options), theme = envTheme(options), camera = cam(options, .18);
  drawSkyBase(ctx, options, .66);
  const y = Math.round((h * .66 + camera.y) / 4) * 4;
  ctx.fillStyle = theme.line;
  ctx.fillRect(0, y, w, 4);
  ctx.fillStyle = theme.fg;
  ctx.fillRect(0, y + 8, w, 4);
}
