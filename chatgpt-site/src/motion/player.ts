// Renders one frame of a reel. Overlapping transitions render their two pure-time scene layers
// into cached canvases, then composite those images before chrome and captions.
import { H, W, placeScenes, reelDuration, type Ctx, type Frame, type PlacedScene, type ReelSpec, type SceneDef, type Theme, type TransitionName } from './core.ts';
import { drawCaption, type ActiveCaption } from './captions.ts';
import { frameTheme } from './pix.ts';
import { drawChrome } from './chrome.ts';
import { drawBackground } from './fx/background.ts';
import { applyCamera, cameraFocus, drawImpact } from './fx/camera.ts';
import { applyGlobalGrade } from './fx/post.ts';
import { compositeTransition, TRANSITION_DURATIONS } from './fx/transitions.ts';
import { SCENES } from './scenes/index.ts';

interface Surface { canvas: OffscreenCanvas | HTMLCanvasElement; ctx: Ctx }
const surfacesBySize = new Map<string, [Surface, Surface]>();
const compositionSurfacesBySize = new Map<string, Surface>();
let reflectionSurfaces: [Surface, Surface, Surface] | undefined;

function makeSurface(width: number, height: number, alpha = false): Surface {
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(width, height)
    : Object.assign(document.createElement('canvas'), { width, height });
  const ctx = canvas.getContext('2d', { alpha }) as Ctx | null;
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

function compositionSurface(width = W, height = H) {
  const key = `${width}x${height}`;
  let surface = compositionSurfacesBySize.get(key);
  if (!surface) { surface = makeSurface(width, height); compositionSurfacesBySize.set(key, surface); }
  return surface;
}

function getReflectionSurfaces(): [Surface, Surface, Surface] {
  if (!reflectionSurfaces) {
    const width = W / 4, height = 108, bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    const mask = makeSurface(width, height, true), pixels = mask.ctx.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      const fade = 1 - y / (height - 1);
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4, dither = bayer[(y & 3) * 4 + (x & 3)]! / 15;
        pixels.data[index] = 255; pixels.data[index + 1] = 255; pixels.data[index + 2] = 255;
        pixels.data[index + 3] = Math.round(((0.15 + dither * 0.07) / 0.22) * fade * 255);
      }
    }
    mask.ctx.putImageData(pixels, 0, 0);
    reflectionSurfaces = [makeSurface(width, height, true), makeSurface(width, height, true), mask];
  }
  return reflectionSurfaces;
}

function drawFloorReflection(ctx: Ctx, source: Surface['canvas'], time: number) {
  const [base, rippled, mask] = getReflectionSurfaces(), width = W / 4, height = 108;
  const sourceTop = 990, sourceHeight = 300;
  base.ctx.clearRect(0, 0, width, height);
  base.ctx.save();
  base.ctx.translate(0, height);
  base.ctx.scale(1, -1);
  base.ctx.imageSmoothingEnabled = false;
  base.ctx.drawImage(source, 0, sourceTop, W, sourceHeight, 0, 0, width, height);
  base.ctx.restore();

  rippled.ctx.clearRect(0, 0, width, height);
  rippled.ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < height; y += 2) {
    const bandHeight = Math.min(2, height - y);
    const offset = Math.round(Math.sin(time * 2.8 + y * 0.11) * 0.7);
    rippled.ctx.drawImage(base.canvas, 0, y, width, bandHeight, offset, y, width, bandHeight);
  }
  rippled.ctx.globalCompositeOperation = 'destination-in';
  rippled.ctx.drawImage(mask.canvas, 0, 0);
  rippled.ctx.globalCompositeOperation = 'source-over';

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fillRect(0, 1290, W, 3);
  const sweepX = Math.round(((time * 210) % (W + 240)) - 120);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(sweepX, 1292, 104, 5);
  ctx.fillStyle = 'rgba(255,255,255,0.045)';
  ctx.fillRect(sweepX - 28, 1292, 160, 11);
  ctx.globalAlpha *= 0.29;
  ctx.drawImage(rippled.canvas, 0, 0, width, height, 0, 1300, W, 432);

  // A dim, offset continuation of the set sits below the caption band. The
  // moving crop suggests depth while leaving the existing caption treatment clear.
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 1650, W, H - 1650); ctx.clip();
  ctx.globalAlpha *= 0.22;
  const parallaxX = Math.round(Math.sin(time * 0.55) * 12);
  ctx.drawImage(source, 0, 1030, W, 260, parallaxX, 1650, W, 270);
  ctx.restore();
  ctx.restore();
}

function extendSmallCaptionGaps(captions: ActiveCaption[]): ActiveCaption[] {
  const sorted = captions.sort((a, b) => a.start - b.start);
  for (let index = 0; index < sorted.length - 1; index++) {
    const current = sorted[index]!, next = sorted[index + 1]!;
    const gap = next.start - current.end;
    if (gap > 0 && gap < 0.25) current.end = next.start;
  }
  return sorted;
}

/** Per-scene captions laid on the reel timeline; explicit `spec.captions` win when present. */
export function reelCaptions(spec: ReelSpec, placed: PlacedScene[] = placeScenes(spec)): ActiveCaption[] {
  if (spec.captions?.length) return extendSmallCaptionGaps(spec.captions.map(c => ({ text: c.text, start: c.start, end: c.end, ...(c.words ? { wordTimings: c.words } : {}) })));
  return extendSmallCaptionGaps(placed.flatMap(scene => {
    const lines = (Array.isArray(scene.spec.caption) ? scene.spec.caption : scene.spec.caption ? [scene.spec.caption] : []).filter(line => line.trim());
    const span = (scene.end - scene.start) / Math.max(1, lines.length);
    return lines.map((text, index) => ({ text, start: scene.start + index * span, end: scene.start + (index + 1) * span }));
  }));
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
  const needsReflection = hedgy && (transition
    ? transition.outgoing.spec.type === 'shot' || transition.incoming.spec.type === 'shot'
    : scene.spec.type === 'shot');
  const composition = needsReflection ? compositionSurface() : undefined;
  const sceneCtx = composition?.ctx ?? ctx;
  if (composition) {
    sceneCtx.save();
    sceneCtx.globalAlpha = 1;
    sceneCtx.globalCompositeOperation = 'source-over';
    sceneCtx.fillStyle = theme.bg;
    sceneCtx.fillRect(0, 0, W, H);
    sceneCtx.restore();
  }
  if (transition) {
    const [outgoing, incoming] = transitionSurfaces(W, H);
    const outgoingTheme = frameTheme(outgoing.ctx, spec.mode, hedgy ? 'mono' : spec.accent, time);
    const incomingTheme = frameTheme(incoming.ctx, spec.mode, hedgy ? 'mono' : spec.accent, time);
    if (hedgy) {
      for (const t of [outgoingTheme, incomingTheme]) { t.accent = t.fg; t.accentSolid = t.fg; t.onAccent = t.bg; t.spectrum = [t.bg, t.fg]; }
    }
    renderSceneLayer(outgoing.ctx, transition.outgoing, spec, time, outgoingTheme, hedgy);
    renderSceneLayer(incoming.ctx, transition.incoming, spec, time, incomingTheme, hedgy);
    sceneCtx.imageSmoothingEnabled = false;
    sceneCtx.drawImage(outgoing.canvas, 0, 0, W, H);
    const isShot = transition.outgoing.spec.type === 'shot' || transition.incoming.spec.type === 'shot';
    const height = isShot ? 1290 : hedgy ? 1260 : H;
    compositeTransition(sceneCtx, outgoing.canvas, incoming.canvas, transition.name, transition.progress, theme, transition.incoming.index + 1, {
      focus: cameraFocus(activeFrame, transition.incoming.spec.transitionAt),
      direction: transition.incoming.spec.transitionDir,
      height,
    });
  } else {
    renderSceneLayer(sceneCtx, scene, spec, time, theme, hedgy);
  }
  if (hedgy) applyGlobalGrade(sceneCtx, { x: 0, y: 0, w: W, h: 1290, cell: 6, t: time, seed: 1701, grainStrength: 2.5, vignetteStrength: 0.12 });
  if (composition) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(composition.canvas, 0, 0, W, H);
    drawFloorReflection(ctx, composition.canvas, time);
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
