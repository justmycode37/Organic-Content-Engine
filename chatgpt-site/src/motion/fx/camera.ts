import { clamp, CONTENT_BOTTOM, SAFE, W, type Frame } from '../core.ts';
import { createCameraRig } from './rig.ts';

/** Applies a restrained deterministic camera rig. Call ctx.restore() afterwards. */
export function applyCamera(frame: Frame, hits: number[], clipBottom: number = SAFE.bottom, cinematic = false, exitZoom = false, fullBleed = false) {
  const { ctx, t, dur, seed } = frame;
  ctx.save();
  const x = fullBleed ? 0 : SAFE.x, y = fullBleed ? 0 : SAFE.y;
  const width = fullBleed ? W : SAFE.w;
  ctx.beginPath();
  ctx.rect(x, y, width, clipBottom - y);
  ctx.clip();

  const height = clipBottom - y;
  const centerX = x + width / 2;
  const centerY = fullBleed ? clipBottom / 2 : y + (Math.min(CONTENT_BOTTOM, clipBottom) - y) / 2;
  const path = cinematic ? [
    { t: 0, x: -8, y: 4, zoom: 1, rot: 0 },
    { t: Math.max(0.01, dur), x: 8, y: -4, zoom: 1.018, rot: 0.002, ease: 'inOut' as const },
  ] : [];
  const rig = createCameraRig({
    width, height,
    keyframes: path,
    handheld: cinematic ? 1.8 : 0.25,
    seed,
    hits: [0, ...hits.filter(hit => Number.isFinite(hit) && hit > 0.001)],
    punch: cinematic ? 0.024 : 0.032,
    shake: cinematic ? 4 : 5,
    dollyZoom: cinematic ? { start: 0, end: Math.max(0.1, dur), amount: exitZoom ? 0.22 : 0.025 } : undefined,
  });
  ctx.translate(centerX - width / 2, centerY - height / 2);
  rig.apply(ctx, t);
}

/** Impact brackets remain on non-Hedgy explainer scenes; Hedgy keeps the clean legacy frame. */
export function drawImpact(frame: Frame, hits: number[], enabled = true) {
  if (!enabled) return;
  const { ctx, t, theme } = frame;
  const events = [0, ...hits.filter(hit => Number.isFinite(hit) && hit > 0.001)];
  const active = events.reduce((strength, hit) => {
    const dt = t - hit;
    return dt >= 0 && dt < 0.14 ? Math.max(strength, 1 - dt / 0.14) : strength;
  }, 0);
  if (active <= 0) return;

  const left = SAFE.x, right = SAFE.right, top = SAFE.y, bottom = Math.min(CONTENT_BOTTOM, SAFE.bottom);
  const length = 72, thickness = 8;
  ctx.save();
  ctx.globalAlpha *= active * 0.38;
  ctx.fillStyle = theme.fg;
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

/** Keeps a transition focus inside the full-bleed animation aperture. */
export function cameraFocus(frame: Frame, point?: [number, number]): [number, number] {
  return [clamp(point?.[0] ?? W / 2, 0, W), clamp(point?.[1] ?? 645, 0, 1290)];
}
