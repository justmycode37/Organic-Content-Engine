import { hash, type Ctx } from '../core.ts';
import { CELL } from '../pix.ts';
import { cam, envSeed, envSize, envTheme, pixelLine, type EnvOptions } from './common.ts';

/** Abstract stock-exchange wall: ticker panels, dithered charts, and monochrome candles. */
export function drawEnv(ctx: Ctx, options: EnvOptions) {
  const { w, h } = envSize(options), theme = envTheme(options), seed = envSeed(options), camera = cam(options, .4);
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#101013';
  ctx.fillRect(0, 0, w, Math.floor(h * .76));
  const panelW = 280, panelH = 344, top = Math.round((h * .13 + camera.y * .2) / CELL) * CELL;
  const offset = Math.round(camera.x * .28 / CELL) * CELL;
  for (let i = -1; i < 5; i++) {
    const x = i * (panelW + 18) - offset;
    ctx.fillStyle = '#202025'; ctx.fillRect(x, top, panelW, panelH);
    ctx.fillStyle = '#050506'; ctx.fillRect(x + CELL * 2, top + CELL * 2, panelW - CELL * 4, panelH - CELL * 4);
    ctx.fillStyle = theme.line; ctx.fillRect(x + CELL * 2, top + CELL * 2, panelW - CELL * 4, CELL * 3);
    // Header blocks read as interface chrome without legible ticker copy.
    for (let j = 0; j < 4; j++) {
      const width = 12 + Math.floor(hash(i * 13 + j, seed) * 40);
      ctx.fillStyle = j === 0 ? theme.fg : theme.dim;
      ctx.fillRect(x + CELL * (4 + j * 11), top + CELL * 3, width, CELL);
    }
    const gx = x + CELL * 4, gy = top + CELL * 8, chartW = panelW - CELL * 8, chartH = panelH - CELL * 14;
    for (let gy0 = gy; gy0 < gy + chartH; gy0 += CELL * 8) { ctx.fillStyle = '#26262B'; ctx.fillRect(gx, gy0, chartW, CELL); }
    for (let gx0 = gx; gx0 < gx + chartW; gx0 += CELL * 8) { ctx.fillStyle = '#222227'; ctx.fillRect(gx0, gy, CELL, chartH); }
    let prevX = gx, prevY = gy + chartH * (.45 + hash(i, seed + 10) * .3);
    for (let n = 1; n < 18; n++) {
      const nx = gx + n * chartW / 18;
      const ny = gy + chartH * (.18 + hash(i * 31 + n, seed + 17) * .65);
      pixelLine(ctx, prevX, prevY, nx, ny, n % 5 === 0 ? theme.fg : theme.dim, CELL);
      prevX = nx; prevY = ny;
    }
    for (let n = 0; n < 20; n++) {
      const cx = gx + CELL * 2 + n * CELL * 3;
      const candleY = gy + CELL * (4 + Math.floor(hash(i * 41 + n, seed + 32) * 28));
      const candleH = CELL * (2 + Math.floor(hash(i * 43 + n, seed + 36) * 4));
      ctx.fillStyle = hash(i + n, seed + 39) > .5 ? '#A9A9AE' : '#5C5C62';
      ctx.fillRect(cx, candleY, CELL * 2, candleH);
      ctx.fillRect(cx + CELL, candleY - CELL * 2, CELL, candleH + CELL * 4);
    }
  }
  const floorY = Math.round(h * .77 / CELL) * CELL;
  ctx.fillStyle = '#080809'; ctx.fillRect(0, floorY, w, h - floorY);
  for (let y = floorY; y < h; y += CELL * 7) { ctx.fillStyle = theme.line; ctx.fillRect(0, y, w, CELL); }
  for (let x = -w; x < w * 2; x += CELL * 24) pixelLine(ctx, w / 2, floorY, x - offset, h, theme.line, CELL);
}
