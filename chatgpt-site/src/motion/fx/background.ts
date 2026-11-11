import { H, W, hash, type Frame } from '../core.ts';

/** Quiet monochrome grid with deterministic, slowly drifting pixel dust. */
export function drawBackground(frame: Frame, time: number) {
  const { ctx, theme } = frame;
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.save();

  const cell = 72;
  ctx.globalAlpha = theme.mode === 'dark' ? 0.08 : 0.09;
  ctx.fillStyle = theme.line;
  for (let x = 0; x < W; x += cell) ctx.fillRect(x, 0, 1, H);
  for (let y = 0; y < H; y += cell) ctx.fillRect(0, y, W, 1);

  const t = Math.max(0, Number.isFinite(time) ? time : 0);
  const seed = 4157;
  for (let i = 0; i < 58; i++) {
    const pointSeed = seed + i * 97;
    const baseX = hash(pointSeed, 1) * W;
    const baseY = hash(pointSeed, 2) * H;
    const speedX = 2 + hash(pointSeed, 3) * 3;
    const speedY = 1 + hash(pointSeed, 4) * 2;
    const x = (Math.floor(baseX + t * speedX) + W) % W;
    const y = (Math.floor(baseY + t * speedY) + H) % H;
    const size = hash(pointSeed, 5) > 0.84 ? 4 : 2;
    ctx.globalAlpha = theme.mode === 'dark' ? 0.15 : 0.1;
    ctx.fillStyle = theme.muted;
    ctx.fillRect(x, y, size, size);
  }
  ctx.restore();
}
