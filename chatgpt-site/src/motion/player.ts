// Renders one frame of a reel. Layer order: background, camera + scene, impact,
// transition, chrome, caption. Pure function of (spec, time).
import { H, W, placeScenes, reelDuration, type Ctx, type Frame, type PlacedScene, type ReelSpec, type SceneDef } from './core.ts';
import { drawCaption, type ActiveCaption } from './captions.ts';
import { frameTheme } from './pix.ts';
import { drawChrome } from './chrome.ts';
import { drawBackground } from './fx/background.ts';
import { applyCamera, drawImpact } from './fx/camera.ts';
import { TRANSITION_IN, TRANSITION_OUT, drawTransition } from './fx/transitions.ts';
import { SCENES } from './scenes/index.ts';

/** Per-scene captions laid on the reel timeline; explicit `spec.captions` win when present. */
export function reelCaptions(spec: ReelSpec, placed: PlacedScene[] = placeScenes(spec)): ActiveCaption[] {
  if (spec.captions?.length) return [...spec.captions].sort((a, b) => a.start - b.start);
  return placed.flatMap(scene => {
    const lines = (Array.isArray(scene.spec.caption) ? scene.spec.caption : scene.spec.caption ? [scene.spec.caption] : []).filter(line => line.trim());
    const span = (scene.end - scene.start) / Math.max(1, lines.length);
    return lines.map((text, index) => ({ text, start: scene.start + index * span, end: scene.start + (index + 1) * span }));
  });
}

export function renderReel(ctx: Ctx, spec: ReelSpec, time: number) {
  const placed = placeScenes(spec);
  const duration = reelDuration(spec);
  const theme = frameTheme(ctx, spec.mode, spec.accent, time);
  const scene = placed.find(item => time < item.end) ?? placed.at(-1);
  ctx.save();
  ctx.globalAlpha = 1;
  if (!scene) { ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, W, H); ctx.restore(); return; }
  const frame: Frame = { ctx, t: Math.max(0, time - scene.start), dur: scene.end - scene.start, theme, seed: (scene.index + 1) * 7919, index: scene.index, time };
  const hits = scene.spec.hits ?? [];

  drawBackground(frame, time);
  applyCamera(frame, hits);
  const def = SCENES[scene.spec.type] as SceneDef<unknown>;
  ctx.save();
  def.render(frame, scene.spec);
  ctx.restore();
  ctx.restore(); // camera
  drawImpact(frame, hits);

  // The incoming scene's transition hides the cut from both sides.
  const next = placed[scene.index + 1];
  if (next && (next.spec.transition ?? 'cut') !== 'cut' && time >= scene.end - TRANSITION_OUT)
    drawTransition(ctx, next.spec.transition!, (time - scene.end) / TRANSITION_OUT, theme, next.index + 1);
  else if (scene.index > 0 && (scene.spec.transition ?? 'cut') !== 'cut' && frame.t < TRANSITION_IN)
    drawTransition(ctx, scene.spec.transition!, frame.t / TRANSITION_IN, theme, scene.index + 1);

  drawChrome(frame, spec, time, duration);
  const caption = reelCaptions(spec, placed).find(item => time >= item.start && time < item.end);
  if (caption) drawCaption(frame, caption, time);
  ctx.restore();
}
