import { hash, type Ctx } from '../core.ts';
import { CELL } from '../pix.ts';
import { cam, envSeed, envSize, envTheme, type EnvOptions } from './common.ts';

/** Moving dither clouds built from stepped puffs, with depth-based parallax. */
export function drawEnv(ctx: Ctx, options: EnvOptions) {
  const { w, h } = envSize(options), theme = envTheme(options), seed = envSeed(options), t = options.t;
  ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, w, h);
  for (let depth = 0; depth < 3; depth++) {
    const speed = [5, 13, 24][depth]!;
    const shift = Math.round((t * speed + cam(options, .14 + depth * .16).x * .16) / CELL) * CELL;
    for (let i = -2; i < 12; i++) {
      const id = i + depth * 47, cloudW = CELL * (18 + Math.floor(hash(id, seed) * 24));
      const baseX = i * CELL * 31 - shift;
      const x = ((baseX % (w + cloudW * 2)) + (w + cloudW * 2)) % (w + cloudW * 2) - cloudW;
      const y = Math.round((h * (.13 + depth * .19 + hash(id, seed + 7) * .14) + cam(options, .12 + depth * .2).y * .15) / CELL) * CELL;
      const puffCount = 4 + Math.floor(hash(id, seed + 11) * 5);
      for (let p = 0; p < puffCount; p++) {
        const pw = CELL * (6 + Math.floor(hash(id * 9 + p, seed + 15) * 12));
        const ph = CELL * (3 + Math.floor(hash(id * 7 + p, seed + 19) * 7));
        const px = x + p * CELL * 7, py = y + Math.floor(hash(id + p, seed + 24) * CELL * 4);
        const color = depth === 0 ? '#35353A' : depth === 1 ? '#515158' : '#74747A';
        ctx.fillStyle = color;
        ctx.fillRect(px + CELL * 2, py, pw - CELL * 4, ph);
        ctx.fillRect(px, py + CELL, pw, ph - CELL);
        ctx.fillRect(px + CELL * 2, py - CELL, Math.max(CELL, pw - CELL * 5), CELL);
        // Keep every puff's edge noisy and pixel stepped, never blurred.
        for (let n = 0; n < Math.floor(pw / CELL); n++) if (hash(id * 101 + p * 17 + n, seed + 31) > .78) {
          const edgeX = px + n * CELL;
          ctx.fillStyle = theme.bg; ctx.fillRect(edgeX, py - CELL, CELL, CELL);
          ctx.fillStyle = color;
        }
      }
    }
  }
}
