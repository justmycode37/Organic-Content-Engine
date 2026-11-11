// Renders one frame of a reel. Overlapping transitions render their two pure-time scene layers
// into cached canvases, then composite those images before chrome and captions.
import { H, W, placeScenes, reelDuration, type Ctx, type Frame, type PlacedScene, type ReelSpec, type SceneDef, type Theme, type TransitionName } from './core.ts';
import { drawCaption, type ActiveCaption } from './captions.ts';
import { frameTheme } from './pix.ts';
import { drawChrome } from './chrome.ts';
import { drawBackground } from './fx/background.ts';
import { applyCamera, cameraFocus, drawImpact } from './fx/camera.ts';
import { compositeTransition, TRANSITION_DURATIONS } from './fx/transitions.ts';
import { SCENES } from './scenes/index.ts';

interface Surface { canvas: OffscreenCanvas | HTMLCanvasElement; ctx: Ctx }
const surfacesBySize = new Map<string, [Surface, Surface]>();

function makeSurface(width: number, height: number): Surface {
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(width, height)
    : Object.assign(document.createElement('canvas'), { width, height });
  const ctx = canvas.getContext('2d', { alpha: false }) as Ctx | null;
  if (!ctx) throw new Error('Could not create a 2D motion transition surface');
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

function transitionSurfaces(width = W, height = H) {
  const key = `${width}x${height}`;
  let pair = surfacesBySize.get(key);
  if (!pair) { pair = [makeSurface(width, height), makeSurface(width, height)]; surfacesBySize.set(key, pair); }
  return pair;
}

/** Per-scene captions laid on the reel timeline; explicit `spec.captions` win when present. */
export function reelCaptions(spec: ReelSpec, placed: PlacedScene[] = placeScenes(spec)): ActiveCaption[] {
  if (spec.captions?.length) return spec.captions.map(c => ({ text: c.text, start: c.start, end: c.end, ...(c.words ? { wordTimings: c.words } : {}) })).sort((a, b) => a.start - b.start);
  return placed.flatMap(scene => {
    const lines = (Array.isArray(scene.spec.caption) ? scene.spec.caption : scene.spec.caption ? [scene.spec.caption] : []).filter(line => line.trim());
    const span = (scene.end - scene.start) / Math.max(1, lines.length);
    return lines.map((text, index) => ({ text, start: scene.start + index * span, end: scene.start + (index + 1) * span }));
  });
}

function renderSceneLayer(ctx: Ctx, scene: PlacedScene, spec: ReelSpec, time: number, theme: Theme, hedgy: boolean) {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.imageSmoothingEnabled = false;
  const isShot = scene.spec.type === 'shot';
  const hits = scene.spec.hits ?? [];
  // Pass local time through the overlap: scenes remain pure functions and animate across the cut.
  const frame: Frame = { ctx, t: time - scene.start, dur: scene.end - scene.start, theme, seed: (scene.index + 1) * 7919, index: scene.index, time };
  if (hedgy) { ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, W, H); }
  else drawBackground(frame, time);
  const clipBottom = isShot ? 1290 : hedgy && scene.spec.type === 'hedgy' ? 1260 : undefined;
  applyCamera(frame, hits, clipBottom, hedgy || isShot, spec.scenes[scene.index + 1]?.transition === 'zoom' || spec.scenes[scene.index + 1]?.transition === 'zoomthrough', isShot);
  ctx.save();
  // Keep the established Hedgy scene aperture exactly as it was; shot scenes use the new full bleed aperture.
  if (hedgy && scene.spec.type === 'hedgy') { ctx.beginPath(); ctx.rect(96, 240, 888, 1020); ctx.clip(); }
  const def = SCENES[scene.spec.type] as SceneDef<unknown>;
  def.render(frame, scene.spec);
  ctx.restore();
  ctx.restore(); // camera
  drawImpact(frame, hits, !hedgy && !isShot);
  ctx.restore();
}

function activeTransition(placed: PlacedScene[], time: number) {
  for (let index = 1; index < placed.length; index++) {
    const incoming = placed[index]!;
    const name = incoming.spec.transition ?? 'cut';
    const duration = TRANSITION_DURATIONS[name as TransitionName] ?? 0;
    if (duration <= 0) continue;
    const progress = (time - (incoming.start - duration / 2)) / duration;
    if (progress >= 0 && progress <= 1) return { outgoing: placed[index - 1]!, incoming, name, duration, progress };
  }
  return undefined;
}

export function renderReel(ctx: Ctx, spec: ReelSpec, time: number) {
  const placed = placeScenes(spec);
  const duration = reelDuration(spec);
  const hedgy = spec.series?.startsWith('HEDGY') ?? false;
  const theme = frameTheme(ctx, spec.mode, hedgy ? 'mono' : spec.accent, time);
  if (hedgy) { theme.accent = theme.fg; theme.accentSolid = theme.fg; theme.onAccent = theme.bg; theme.spectrum = [theme.bg, theme.fg]; }
  const scene = placed.find(item => time < item.end) ?? placed.at(-1);
  ctx.save();
  ctx.globalAlpha = 1;
  if (!scene) { ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, W, H); ctx.restore(); return; }
  const activeFrame: Frame = { ctx, t: time - scene.start, dur: scene.end - scene.start, theme, seed: (scene.index + 1) * 7919, index: scene.index, time };
  const transition = activeTransition(placed, time);
  if (transition) {
    const [outgoing, incoming] = transitionSurfaces(W, H);
    const outgoingTheme = frameTheme(outgoing.ctx, spec.mode, hedgy ? 'mono' : spec.accent, time);
    const incomingTheme = frameTheme(incoming.ctx, spec.mode, hedgy ? 'mono' : spec.accent, time);
    if (hedgy) {
      for (const t of [outgoingTheme, incomingTheme]) { t.accent = t.fg; t.accentSolid = t.fg; t.onAccent = t.bg; t.spectrum = [t.bg, t.fg]; }
    }
    renderSceneLayer(outgoing.ctx, transition.outgoing, spec, time, outgoingTheme, hedgy);
    renderSceneLayer(incoming.ctx, transition.incoming, spec, time, incomingTheme, hedgy);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(outgoing.canvas, 0, 0, W, H);
    const isShot = transition.outgoing.spec.type === 'shot' || transition.incoming.spec.type === 'shot';
    const height = isShot ? 1290 : hedgy ? 1260 : H;
    compositeTransition(ctx, outgoing.canvas, incoming.canvas, transition.name, transition.progress, theme, transition.incoming.index + 1, {
      focus: cameraFocus(activeFrame, transition.incoming.spec.transitionAt),
      direction: transition.incoming.spec.transitionDir,
      height,
    });
  } else {
    renderSceneLayer(ctx, scene, spec, time, theme, hedgy);
  }
  drawChrome(activeFrame, spec, time, duration);
  const caption = reelCaptions(spec, placed).find(item => time >= item.start && time < item.end);
  if (caption) {
    ctx.save();
    drawCaption(activeFrame, caption, time, hedgy ? { top: 1320, bottom: 1650 } : undefined);
    ctx.restore();
  }
  ctx.restore();
}
