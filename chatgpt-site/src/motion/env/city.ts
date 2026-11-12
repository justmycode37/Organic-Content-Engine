import { hash, type Ctx } from '../core.ts';
import { CELL } from '../pix.ts';
import { cam, drawSkyBase, envSeed, envSize, envTheme, type EnvOptions } from './common.ts';

/** Seeded parallax skyline with deterministic, frame-stepped office lights. */
export function drawEnv(ctx: Ctx, options: EnvOptions) {
  const { w, h } = envSize(options), theme = envTheme(options), seed = envSeed(options), t = options.t;
  drawSkyBase(ctx, options, .75);
  const baseY = Math.round(h * .72 / CELL) * CELL + Math.round(cam(options, .14).y / CELL) * CELL;
  for (let layerIndex = 0; layerIndex < 3; layerIndex++) {
    const depth = [.16, .34, .66][layerIndex]!;
    const camera = cam(options, depth);
    const cellW = [68, 80, 92][layerIndex]!;
    let cursor = -cellW * 2 + ((Math.round(camera.x / CELL) * CELL) % cellW);
    let n = -4;
    while (cursor < w + cellW) {
      const width = Math.floor((cellW * (.48 + hash(n, seed + layerIndex * 41) * .45)) / CELL) * CELL;
      const height = Math.floor((h * (.11 + hash(n + 73, seed + layerIndex * 53) * .23)) / CELL) * CELL;
      const x = Math.round(cursor / CELL) * CELL;
      const y = baseY - height - Math.round(camera.y * .18 / CELL) * CELL;
      ctx.fillStyle = ['#131316', '#1C1C20', '#29292E'][layerIndex]!;
      ctx.fillRect(x, y, width, height + (h - baseY));
      ctx.fillStyle = layerIndex === 2 ? theme.line : '#39393E';
      ctx.fillRect(x, y, width, CELL);
      const cols = Math.max(1, Math.floor((width - CELL * 2) / (CELL * 4)));
      const rows = Math.max(1, Math.floor((height - CELL * 3) / (CELL * 5)));
      for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
        const id = n * 997 + row * 31 + col;
        const lit = hash(id, seed + layerIndex * 107) > .57 && hash(id, Math.floor(t * 5 + hash(id, seed) * 8)) > .31;
        if (!lit) continue;
        const wx = x + CELL * 2 + col * CELL * 4, wy = y + CELL * 3 + row * CELL * 5;
        ctx.fillStyle = hash(id, seed + 3) > .76 ? theme.fg : theme.dim;
        ctx.fillRect(wx, wy, CELL * 2, CELL * 2);
      }
      cursor += width + CELL * (2 + Math.floor(hash(n, seed + layerIndex) * 4));
      n++;
    }
  }
  ctx.fillStyle = theme.fg;
  ctx.fillRect(0, baseY, w, CELL);
}
