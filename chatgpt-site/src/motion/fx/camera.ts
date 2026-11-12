import { clamp, CONTENT_BOTTOM, ease, SAFE, type CameraClipRegion, type CameraSpec, type Ctx, type Frame, type ObjectRect } from '../core.ts';

/** Applies an explicit screen-space clip before camera transforms. Undefined means the full canvas. */
export function applyCameraClip(ctx: Ctx, clip?: CameraClipRegion | null) {
  if (!clip) return;
  ctx.beginPath();
  if (clip === 'safe') ctx.rect(SAFE.x, SAFE.y, SAFE.w, SAFE.bottom - SAFE.y);
  else ctx.rect(clip.x, clip.y, clip.w, clip.h);
  ctx.clip();
}

function focusOf(frame: Frame, camera?: CameraSpec): ObjectRect | undefined {
  const id = camera?.target;
  if (id === 'content') return { x: SAFE.x, y: SAFE.y, w: SAFE.w, h: Math.min(CONTENT_BOTTOM, SAFE.bottom) - SAFE.y };
  return id ? frame.objects?.current.get(id)?.rect : undefined;
}

function moveProgress(frame: Frame, camera: CameraSpec): number {
  const duration = clamp(frame.dur * 0.34, 0.55, 0.9);
  const progress = clamp(frame.t / duration);
  if (camera.ramp === false) return progress;
  if (progress < 0.72) return 0.88 * (1 - (1 - progress / 0.72) ** 4);
  return 0.88 + 0.12 * ease.outCubic((progress - 0.72) / 0.28);
}

/** Applies the existing restrained impact camera, plus an optional semantic scene move. Call ctx.restore() afterwards. */
export function applyCamera(frame: Frame, hits: number[], camera?: CameraSpec) {
  const { ctx, t } = frame;
  ctx.save();
  applyCameraClip(ctx, camera?.clip);
  let punch = 0;
  let sx = 0, sy = 0;
  // The opening frame stays clean; later scenes flash on entry and on each hit.
  const events = [...(frame.opening ? [] : [0]), ...hits.filter(hit => Number.isFinite(hit) && hit > 0.001)];

  events.forEach((eventTime, index) => {
    const dt = t - eventTime;
    if (dt < 0 || dt > 0.3) return;
    const decay = Math.exp(-dt / 0.085);
    punch = Math.max(punch, 0.055 * decay);
    sx += Math.round(Math.sin((dt * 31 + index * 7.3 + 0.6) * 2.4) * 9 * decay);
    sy += Math.round(Math.cos((dt * 27 + index * 4.1 + 0.7) * 2.1) * 8 * decay);
  });

  const shakeLimit = camera ? 6 : 12;
  const shakeLength = Math.hypot(sx, sy);
  if (shakeLength > shakeLimit) {
    sx = Math.round(sx * shakeLimit / shakeLength);
    sy = Math.round(sy * shakeLimit / shakeLength);
  }
  const cx = SAFE.cx, cy = SAFE.y + (Math.min(CONTENT_BOTTOM, SAFE.bottom) - SAFE.y) / 2;
  const target = focusOf(frame, camera);
  const fx = target ? clamp(target.x + target.w / 2, SAFE.x, SAFE.right) : cx;
  const fy = target ? clamp(target.y + target.h / 2, SAFE.y, Math.min(CONTENT_BOTTOM, SAFE.bottom)) : cy;
  let scale = 1;
  let moveX = 0, moveY = 0;
  if (camera?.move) {
    const progress = moveProgress(frame, camera);
    const settle = camera.ramp === false || progress < 0.8 ? 0 : Math.sin(((progress - 0.8) / 0.2) * Math.PI) * 0.008;
    if (camera.move === 'push-in') scale = 1 + 0.36 * progress + settle;
    else if (camera.move === 'pull-out') scale = 1.36 - 0.36 * progress + settle;
    else if (camera.move === 'pan-left') moveX = 180 * progress;
    else if (camera.move === 'pan-right') moveX = -180 * progress;
    else if (camera.move === 'track') {
      scale = 1 + 0.12 * progress + settle;
      if (target) { moveX = (cx - fx) * progress; moveY = (cy - fy) * progress; }
    } else if (camera.move === 'fly') {
      scale = 1 + 0.56 * progress + settle;
      if (target) { moveX = (cx - fx) * progress; moveY = (cy - fy) * progress; }
    }
  }
  const scaleAtHit = scale + punch;
  ctx.translate(moveX + sx, moveY + sy);
  ctx.translate(fx, fy);
  ctx.scale(scaleAtHit, scaleAtHit);
  ctx.translate(-fx, -fy);
}

/** Accent corner brackets snap in at the content corners on each impact. */
export function drawImpact(frame: Frame, hits: number[]) {
  const { ctx, t, theme } = frame;
  // The opening frame stays clean; later scenes flash on entry and on each hit.
  const events = [...(frame.opening ? [] : [0]), ...hits.filter(hit => Number.isFinite(hit) && hit > 0.001)];
  const active = events.reduce((strength, hit) => {
    const dt = t - hit;
    return dt >= 0 && dt < 0.15 ? Math.max(strength, 1 - dt / 0.15) : strength;
  }, 0);
  if (active <= 0) return;

  // Inset 60 px from the safe rect so the lower right bracket stays clear of the Reels action rail (x >= 930).
  const left = SAFE.x + 60, right = SAFE.right - 60, top = SAFE.y, bottom = Math.min(CONTENT_BOTTOM, SAFE.bottom);
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
