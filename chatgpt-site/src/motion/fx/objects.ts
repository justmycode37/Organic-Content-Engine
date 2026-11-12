import type { Frame, FrameObjects, ObjectRect, SceneObject } from '../core.ts';

/** Create a fresh registry for one render pass; no layout leaks between requested times. */
export function objectFrame(previousObjects: ReadonlyMap<string, SceneObject> = new Map()): FrameObjects {
  return { current: new Map(), previous: new Map(previousObjects) };
}

/** Declare a named placement for this frame. Invalid or empty placements are ignored. */
export function place(
  frame: Pick<Frame, 'objects'>,
  id: string,
  rect: ObjectRect,
  kind = 'object',
): SceneObject | undefined {
  if (!frame.objects || !id?.trim() || !rect || ![rect.x, rect.y, rect.w, rect.h].every(Number.isFinite) || rect.w <= 0 || rect.h <= 0) return;
  const object = { id, rect: { x: rect.x, y: rect.y, w: rect.w, h: rect.h }, kind: kind || 'object' };
  frame.objects.current.set(id, object);
  return object;
}

/** Read the same object's final placement from the immediately preceding scene. */
export function previous(frame: Pick<Frame, 'objects'>, id: string): SceneObject | undefined {
  return frame.objects?.previous.get(id);
}

/** Prefer a requested id, then a semantic target/accent, then the first declared object. */
export function targetObject(objects: ReadonlyMap<string, SceneObject>, id?: string): SceneObject | undefined {
  if (id) {
    const named = objects.get(id);
    if (named) return named;
  }
  for (const kind of ['target', 'accent', 'hero']) {
    const match = [...objects.values()].find(object => object.kind === kind);
    if (match) return match;
  }
  return objects.values().next().value as SceneObject | undefined;
}

export function interpolateRect(from: ObjectRect, to: ObjectRect, progress: number): ObjectRect {
  const p = Math.min(1, Math.max(0, progress));
  return {
    x: from.x + (to.x - from.x) * p,
    y: from.y + (to.y - from.y) * p,
    w: from.w + (to.w - from.w) * p,
    h: from.h + (to.h - from.h) * p,
  };
}
