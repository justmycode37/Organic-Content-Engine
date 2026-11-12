// Renders one frame of a reel. Layer order: background, camera + scene, impact,
// transition, chrome, caption. Pure function of (spec, time).
import { H, SAFE, W, clamp, ease, makeTheme, placeScenes, reelDuration, stripMarkup, type Assets, type Ctx, type EventKind, type Frame, type PlacedScene, type ReelSpec, type ResolvedEvent, type SceneDef, type Theme } from './core.ts';
import type { LayoutFrame, SceneObject, TransitionContext, TransitionName } from './core.ts';
import { drawCaption, type ActiveCaption } from './captions.ts';
import { drawChrome } from './chrome.ts';
import { drawBackground } from './fx/background.ts';
import { applyCamera, applyCameraClip, drawImpact } from './fx/camera.ts';
import { objectFrame, targetObject } from './fx/objects.ts';
import { drawTransition, transitionIn, transitionOut } from './fx/transitions.ts';
import { SCENES } from './scenes/index.ts';
import { styleOf } from './styles/index.ts';

const V2_TRANSITIONS = new Set<TransitionName>(['whip', 'push', 'morph', 'slide']);

function transitionRenderer(style: ReturnType<typeof styleOf>, name: TransitionName) {
  return style.transitions?.[name] ?? (V2_TRANSITIONS.has(name) ? drawTransition : style.transition ?? drawTransition);
}

function sceneDef(scene: PlacedScene, style: ReturnType<typeof styleOf>): SceneDef<unknown> {
  const type = scene.spec.type;
  return ((type !== 'special' && style.scenes?.[type]) || SCENES[type]) as SceneDef<unknown>;
}

function layoutFrame(scene: PlacedScene, t: number, objects: ReturnType<typeof objectFrame>, style: ReturnType<typeof styleOf>, theme: Frame['theme'], assets: Assets): LayoutFrame {
  return {
    t, dur: scene.end - scene.start, seed: (scene.index + 1) * 7919, index: scene.index,
    opening: scene.index === 0, hits: [...(scene.spec.hits ?? [])], events: resolveSceneEvents(scene.spec),
    style: style.name as Frame['style'], theme, assets, objects,
  };
}

/** Scene layouts run from the spec and local time, with no playback state. */
function layoutScene(
  scene: PlacedScene,
  t: number,
  prior: ReadonlyMap<string, SceneObject>,
  style: ReturnType<typeof styleOf>,
  theme: Frame['theme'],
  assets: Assets,
  objects = objectFrame(prior),
) {
  const frame = layoutFrame(scene, t, objects, style, theme, assets);
  sceneDef(scene, style).layout?.(frame, scene.spec);
  return objects.current;
}

function priorObjects(placed: PlacedScene[], index: number, style: ReturnType<typeof styleOf>, theme: Frame['theme'], assets: Assets): ReadonlyMap<string, SceneObject> {
  let objects: ReadonlyMap<string, SceneObject> = new Map();
  for (let i = 0; i < index; i++) {
    const scene = placed[i]!;
    objects = layoutScene(scene, scene.end - scene.start, objects, style, theme, assets);
  }
  return objects;
}

function transitionObjects(placed: PlacedScene[], fromIndex: number, style: ReturnType<typeof styleOf>, theme: Frame['theme'], assets: Assets): TransitionContext {
  const outgoing = placed[fromIndex]!, incoming = placed[fromIndex + 1]!;
  const before = priorObjects(placed, fromIndex, style, theme, assets);
  const from = layoutScene(outgoing, outgoing.end - outgoing.start, before, style, theme, assets);
  const to = layoutScene(incoming, 0, from, style, theme, assets);
  const requested = incoming.spec.camera?.target ?? outgoing.spec.camera?.target;
  const outgoingTarget = targetObject(from, requested);
  const incomingTarget = targetObject(to, requested ?? outgoingTarget?.id) ?? outgoingTarget;
  const direction: TransitionContext['direction'] = (outgoing.index + incoming.index) % 2 ? 'left' : 'right';
  return { outgoing: outgoingTarget, incoming: incomingTarget, direction };
}

function prepareSceneObjects(frame: Frame, scene: PlacedScene, placed: PlacedScene[], style: ReturnType<typeof styleOf>, def: SceneDef<unknown>) {
  const objects = objectFrame(priorObjects(placed, scene.index, style, frame.theme, frame.assets));
  frame.objects = objects;
  def.layout?.(layoutFrame(scene, frame.t, objects, style, frame.theme, frame.assets), scene.spec);
}

function pushZoom(ctx: Ctx, target: TransitionContext['outgoing'], progress: number, entering: boolean) {
  const rect = target?.rect;
  const cx = rect ? rect.x + rect.w / 2 : SAFE.cx;
  const cy = rect ? rect.y + rect.h / 2 : SAFE.cy;
  const move = ease.inOutCubic(clamp(progress));
  const scale = 1 + 0.16 * (entering ? 1 - move : move);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);
}

function activePush(
  scene: PlacedScene,
  next: PlacedScene | undefined,
  frame: Frame,
  time: number,
  placed: PlacedScene[],
  style: ReturnType<typeof styleOf>,
  theme: Frame['theme'],
  assets: Assets,
) {
  if (scene.index > 0 && scene.spec.transition === 'push' && frame.t < transitionIn('push')) {
    const context = transitionObjects(placed, scene.index - 1, style, theme, assets);
    return { context, progress: frame.t / transitionIn('push'), entering: true };
  }
  if (next?.spec.transition === 'push' && time >= scene.end - transitionOut('push')) {
    const context = transitionObjects(placed, scene.index, style, theme, assets);
    return { context, progress: (time - (scene.end - transitionOut('push'))) / transitionOut('push'), entering: false };
  }
  return undefined;
}

const eventWord = (value: string) => value.toLocaleLowerCase().match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/u)?.[0] ?? '';
export const OPENING_STATE_HOLD_SECONDS = 0.3;

/** Resolves authored word anchors by their ordinal position for silent playback. Voiced specs contain timed `at` values. */
export function resolveSceneEvents(scene: PlacedScene['spec']): ResolvedEvent[] {
  const words = stripMarkup(scene.say ?? '').match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? [];
  return (scene.events ?? []).map(event => {
    let at = event.at;
    if (at === undefined && event.word) {
      const needle = eventWord(event.word);
      const index = words.findIndex(word => eventWord(word) === needle);
      at = words.length ? scene.duration * Math.max(0, index) / words.length : 0;
    }
    return {
      at: clamp(at ?? 0, 0, scene.duration),
      kind: event.kind,
      ...(event.target ? { target: event.target } : {}),
      ...(event.sfx ? { sfx: event.sfx } : {}),
      ...(event.word ? { word: event.word } : {}),
    };
  });
}

/** First-scene renderers use this to keep the opening snapshot stable over its first 300 ms. */
export function isOpeningFrame(frame: Frame): boolean {
  return frame.opening && frame.t <= OPENING_STATE_HOLD_SECONDS;
}

/** Gives legacy scene entrances a readable first state, then rejoins their normal timeline without a jump. */
export function openingSceneFrame(frame: Frame): Frame {
  return isOpeningFrame(frame) && frame.t < OPENING_STATE_HOLD_SECONDS
    ? { ...frame, t: OPENING_STATE_HOLD_SECONDS }
    : frame;
}

/** Progress from 0 at an event to 1 after a short 240 ms choreography window. */
export function eventProgress(frame: Frame, kindOrIndex: EventKind | number): number {
  const event = typeof kindOrIndex === 'number'
    ? frame.events[kindOrIndex]
    : frame.events.find(candidate => candidate.kind === kindOrIndex);
  return event ? clamp((frame.t - event.at) / 0.24) : 0;
}

/** Builds the exact frame object passed to a scene; exported so player contracts can be tested directly. */
export function createSceneFrame(ctx: Ctx, scene: PlacedScene, time: number, theme: Theme, style: ReelSpec['style'], assets: Assets = {}): Frame {
  return {
    ctx,
    t: Math.max(0, time - scene.start),
    dur: scene.end - scene.start,
    theme,
    seed: (scene.index + 1) * 7919,
    index: scene.index,
    opening: scene.index === 0,
    hits: [...(scene.spec.hits ?? [])],
    events: resolveSceneEvents(scene.spec),
    style: style ?? 'patch',
    assets,
  };
}

/** Per-scene captions laid on the reel timeline; explicit `spec.captions` win when present. */
export function reelCaptions(spec: ReelSpec, placed: PlacedScene[] = placeScenes(spec)): ActiveCaption[] {
  if (spec.captions?.length) return [...spec.captions].sort((a, b) => a.start - b.start);
  return placed.flatMap(scene => {
    const lines = (Array.isArray(scene.spec.caption) ? scene.spec.caption : scene.spec.caption ? [scene.spec.caption] : []).filter(line => line.trim());
    const span = (scene.end - scene.start) / Math.max(1, lines.length);
    return lines.map((text, index) => ({ text, start: scene.start + index * span, end: scene.start + (index + 1) * span }));
  });
}

/** Draws the reel at `time`. `assets` are the decoded images of `spec.assets` (see page.ts). */
export function renderReel(ctx: Ctx, spec: ReelSpec, time: number, assets: Assets = {}) {
  const placed = placeScenes(spec);
  const duration = reelDuration(spec);
  const style = styleOf(spec.style);
  const mode = spec.mode ?? style.defaultMode ?? 'dark', accent = spec.accent ?? style.defaultAccent ?? 'red';
  const theme = style.theme ? style.theme(mode, accent) : makeTheme(mode, accent);
  const scene = placed.find(item => time < item.end) ?? placed.at(-1);
  ctx.save();
  ctx.globalAlpha = 1;
  if (!scene) { ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, W, H); ctx.restore(); return; }
  const frame = createSceneFrame(ctx, scene, time, theme, spec.style, assets);
  const hits = frame.hits;

  (style.background ?? drawBackground)(frame, time);
  const def = sceneDef(scene, style);
  prepareSceneObjects(frame, scene, placed, style, def);
  const sceneCamera = scene.spec.camera;
  const clip = sceneCamera && sceneCamera.clip !== undefined ? sceneCamera.clip : style.cameraClip;
  let styleClipSaved = false;
  if (sceneCamera || !style.camera) applyCamera(frame, hits, { ...sceneCamera, clip });
  else {
    if (clip) { ctx.save(); applyCameraClip(ctx, clip); styleClipSaved = true; }
    style.camera(frame, hits);
  }
  const push = activePush(scene, placed[scene.index + 1], frame, time, placed, style, theme, assets);
  if (push) pushZoom(ctx, push.entering ? push.context.incoming : push.context.outgoing, push.progress, push.entering);
  ctx.save();
  def.render(openingSceneFrame(frame), scene.spec);
  ctx.restore();
  if (push) ctx.restore(); // tracked push zoom
  ctx.restore(); // camera
  if (styleClipSaved) ctx.restore(); // optional style clip
  if (style.impact) style.impact(frame, hits);
  else if (!push) drawImpact(frame, hits);
  // The incoming scene's transition hides the cut from both sides.
  const next = placed[scene.index + 1];
  const outgoingName = next?.spec.transition ?? 'cut';
  if (next && outgoingName !== 'cut' && time >= scene.end - transitionOut(outgoingName)) {
    const context = transitionObjects(placed, scene.index, style, theme, assets);
    transitionRenderer(style, outgoingName)(ctx, outgoingName, (time - scene.end) / transitionOut(outgoingName), theme, next.index + 1, context);
  } else if (scene.index > 0) {
    const incomingName = scene.spec.transition ?? 'cut';
    if (incomingName !== 'cut' && frame.t < transitionIn(incomingName)) {
      const context = transitionObjects(placed, scene.index - 1, style, theme, assets);
      transitionRenderer(style, incomingName)(ctx, incomingName, frame.t / transitionIn(incomingName), theme, scene.index + 1, context);
    }
  }

  (style.chrome ?? drawChrome)(frame, spec, time, duration);
  const caption = reelCaptions(spec, placed).find(item => time >= item.start && time < item.end);
  if (caption) (style.caption ?? drawCaption)(frame, caption, time);
  ctx.restore();
}
