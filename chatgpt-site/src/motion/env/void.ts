import { hash, type Ctx } from '../core.ts';
import { CELL } from '../pix.ts';
import { cam, envSeed, envSize, envTheme, pixelLine, type EnvOptions } from './common.ts';

/** Deep black void with layered depth particles, camera parallax, and occasional pixel streaks. */
export function drawEnv(ctx: Ctx, options: EnvOptions) {
  const { w, h } = envSize(options), theme = envTheme(options), seed = envSeed(options), t = options.t;
  ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 280; i++) {
    const depth = .12 + hash(i, seed + 5) * .88;
    const speed = (8 + depth * 72) * (hash(i, seed + 8) > .5 ? 1 : -1);
    const px = hash(i, seed + 11) * w + t * speed + cam(options, depth).x * depth;
    const py = hash(i, seed + 17) * h + Math.sin(t * (.3 + depth) + i) * 9 + cam(options, depth).y * depth;
    const x = ((Math.round(px / CELL) * CELL) % w + w) % w;
    const y = ((Math.round(py / CELL) * CELL) % h + h) % h;
    const size = depth > .78 ? CELL * 2 : CELL;
    ctx.fillStyle = hash(i, Math.floor(t * 3) + seed) > .47 ? theme.dim : theme.line;
    ctx.fillRect(x, y, size, size);
    if (depth > .82 && hash(i, seed + 22) > .91) {
      const trail = Math.round((CELL * (2 + depth * 7)) / CELL) * CELL;
      pixelLine(ctx, x - trail, y, x, y, theme.dim, CELL);
    }
  }
}
