import { H, W, hash, type Frame } from '../core.ts';

/** Quiet monochrome atmosphere: fine dither, a slow pixel field, and a faint grid. */
export function drawBackground(frame: Frame, time: number) {
  const { ctx, theme } = frame;
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);
  const t = Math.max(0, Number.isFinite(time) ? time : 0);
  ctx.save();
  // Broad dithered vignette built from fine pixel stipple; no gradient or color cast.
  const dark = theme.mode === 'dark';
  for (let y = 0; y < H; y += 8) for (let x = 0; x < W; x += 8) {
    const nx = (x + 4 - W / 2) / (W * 0.7), ny = (y + 4 - H / 2) / (H * 0.72);
    const edge = Math.max(0, nx * nx + ny * ny - 0.18);
    if (hash(x * 31 + y, 19) < Math.min(.19, edge * .065)) {
      ctx.globalAlpha = dark ? .10 : .055;
      ctx.fillStyle = dark ? '#ffffff' : '#000000';
      ctx.fillRect(x, y, 4, 4);
    }
  }
  // Fine grid is only perceptible at close inspection.
  ctx.globalAlpha = dark ? .035 : .04;
  ctx.fillStyle = theme.line;
  for (let x = 0; x < W; x += 96) ctx.fillRect(x, 0, 1, H);
  for (let y = 0; y < H; y += 96) ctx.fillRect(0, y, W, 1);
  // Sparse 4px dust drifts slowly at two parallax rates.
  for (let i = 0; i < 125; i++) {
    const seed = 4157 + i * 97;
    const speed = .7 + hash(seed, 3) * 1.8;
    const x = (Math.floor(hash(seed, 1) * W + t * speed) % W + W) % W;
    const y = (Math.floor(hash(seed, 2) * H + t * speed * .37) % H + H) % H;
    ctx.globalAlpha = (dark ? .10 : .065) * (.35 + hash(seed, 5) * .65);
    ctx.fillStyle = theme.muted;
    ctx.fillRect(x & ~3, y & ~3, 4, 4);
  }
  ctx.restore();
}
