import { clamp, CONTENT_BOTTOM, SAFE, type Frame } from '../core.ts';

/** Applies a restrained impact camera. Call ctx.restore() afterwards. */
export function applyCamera(frame: Frame, hits: number[]) {
  const { ctx, t } = frame;
  ctx.save();
  ctx.beginPath();
  ctx.rect(SAFE.x, SAFE.y, SAFE.w, SAFE.bottom - SAFE.y);
  ctx.clip();
  let punch = 0;
  let sx = 0, sy = 0;
  const events = [0, ...hits.filter(hit => Number.isFinite(hit) && hit > 0.001)];

  events.forEach((eventTime, index) => {
    const dt = t - eventTime;
    if (dt < 0 || dt > 0.3) return;
    const decay = Math.exp(-dt / 0.085);
    punch = Math.max(punch, 0.055 * decay);
    sx += Math.round(Math.sin((dt * 31 + index * 7.3 + 0.6) * 2.4) * 9 * decay);
    sy += Math.round(Math.cos((dt * 27 + index * 4.1 + 0.7) * 2.1) * 8 * decay);
  });

  const shakeLength = Math.hypot(sx, sy);
  if (shakeLength > 12) {
    sx = Math.round(sx * 12 / shakeLength);
    sy = Math.round(sy * 12 / shakeLength);
  }
  const scale = 1 + punch;
  const cx = SAFE.cx, cy = SAFE.y + (Math.min(CONTENT_BOTTOM, SAFE.bottom) - SAFE.y) / 2;
  ctx.translate(cx + sx, cy + sy);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);
}

/** Accent corner brackets snap in at the content corners on each impact. */
export function drawImpact(frame: Frame, hits: number[]) {
  const { ctx, t, theme } = frame;
  const events = [0, ...hits.filter(hit => Number.isFinite(hit) && hit > 0.001)];
  const active = events.reduce((strength, hit) => {
    const dt = t - hit;
    return dt >= 0 && dt < 0.15 ? Math.max(strength, 1 - dt / 0.15) : strength;
  }, 0);
  if (active <= 0) return;

  const left = SAFE.x, right = SAFE.right, top = SAFE.y, bottom = Math.min(CONTENT_BOTTOM, SAFE.bottom);
  const length = 84, thickness = 12;
  ctx.save();
  ctx.globalAlpha *= active;
  ctx.fillStyle = theme.accent;
  ctx.fillRect(left, top, length, thickness);
  ctx.fillRect(left, top, thickness, length);
  ctx.fillRect(right - length, top, length, thickness);
  ctx.fillRect(right - thickness, top, thickness, length);
  ctx.fillRect(left, bottom - thickness, length, thickness);
  ctx.fillRect(left, bottom - length, thickness, length);
  ctx.fillRect(right - length, bottom - thickness, length, thickness);
  ctx.fillRect(right - thickness, bottom - length, thickness, length);
  ctx.restore();
}
