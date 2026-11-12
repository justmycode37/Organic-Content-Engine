import { hash, type Ctx } from '../core.ts';
import { CELL } from '../pix.ts';
import { cam, envSize, envTheme, pixelLine, type EnvOptions } from './common.ts';

/** Close paper or graph-paper desk surface, with dithered fibers and an ink chart. */
export function drawEnv(ctx: Ctx, options: EnvOptions) {
  const { w, h } = envSize(options), theme = envTheme(options), camera = cam(options, .14), seed = options.seed ?? 173, t = options.t;
  ctx.fillStyle = '#101013'; ctx.fillRect(0, 0, w, h);
  const paperX = Math.round((w * .07 - camera.x * .18) / CELL) * CELL;
  const paperY = Math.round((h * .08 - camera.y * .18) / CELL) * CELL;
  const paperW = Math.round(w * .86 / CELL) * CELL, paperH = Math.round(h * .83 / CELL) * CELL;
  ctx.fillStyle = '#D4D4D7'; ctx.fillRect(paperX + CELL * 3, paperY + CELL * 4, paperW, paperH);
  ctx.fillStyle = '#F0F0F1'; ctx.fillRect(paperX, paperY, paperW, paperH);
  // Subtle page grain is a sparse deterministic dither, never a color gradient.
  for (let i = 0; i < 3200; i++) {
    const x = paperX + Math.floor(hash(i, seed + 3) * paperW / CELL) * CELL;
    const y = paperY + Math.floor(hash(i, seed + 9) * paperH / CELL) * CELL;
    ctx.fillStyle = hash(i, seed + 13) > .5 ? '#DCDCDF' : '#FAFAFA';
    ctx.fillRect(x, y, CELL, CELL);
  }
  const gx = paperX + CELL * 10, gy = paperY + CELL * 13, gw = paperW - CELL * 20, gh = paperH - CELL * 24;
  ctx.fillStyle = '#B9B9BE';
  for (let x = gx; x <= gx + gw; x += CELL * 8) ctx.fillRect(x, gy, CELL, gh);
  for (let y = gy; y <= gy + gh; y += CELL * 8) ctx.fillRect(gx, y, gw, CELL);
  // A drawn price path moves one grid step at a time across the paper.
  let prevX = gx, prevY = gy + gh * .62;
  for (let i = 1; i <= 26; i++) {
    const nx = gx + gw * i / 26;
    const wave = Math.sin(i * .84 + t * .45) * .13 + Math.sin(i * .29) * .18;
    const ny = Math.round((gy + gh * (.47 - wave)) / CELL) * CELL;
    pixelLine(ctx, prevX, prevY, nx, ny, '#29292E', CELL * 2);
    prevX = nx; prevY = ny;
  }
  ctx.fillStyle = '#303035'; ctx.fillRect(gx, gy + gh * .82, gw, CELL * 2);
  for (let i = 0; i < 7; i++) {
    const width = CELL * (8 + Math.floor(hash(i, seed + 27) * 25));
    ctx.fillStyle = i === 0 ? '#414146' : '#A0A0A5';
    ctx.fillRect(gx + CELL * i * 4, gy - CELL * (4 + (i % 3) * 2), width, CELL * 2);
  }
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(paperX + CELL * 3, paperY + CELL * 4, paperW, CELL * 2);
}
