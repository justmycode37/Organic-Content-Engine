// Pixel icons as turning 3D voxel objects: far more detail than the flat 16x16 bitmap.
import type { Ctx, IconName, Theme } from './core.ts';
import { ICON_BITMAPS } from './icons.ts';
import { render3d, voxels, type Mesh } from './three.ts';

const cache = new Map<string, Mesh>();
/** Voxel mesh of an icon, about `size` world units across. Material 0 everywhere; pass `materials` to render3d to recolour. */
export function iconMesh(name: IconName, depth = 3, size = 2): Mesh {
  const id = `${name}:${depth}:${size}`;
  let mesh = cache.get(id);
  if (!mesh) { mesh = voxels(ICON_BITMAPS[name], depth, size); cache.set(id, mesh); }
  return mesh;
}

/**
 * Draws an icon as a shaded voxel object centred on (cx, cy), `size` canvas px across.
 * `yaw` turns it (pass a function of time for a wobble or spin), `accent` makes it rainbow.
 */
export function icon3d(ctx: Ctx, theme: Theme, name: IconName, cx: number, cy: number, size: number, options: { yaw?: number; pitch?: number; accent?: boolean; reveal?: number; seed?: number } = {}) {
  const box = size * 1.5;
  render3d(ctx, theme, { x: cx - box / 2, y: cy - box / 2, w: box, h: box, zoom: size / 2, yaw: options.yaw ?? 0.5, pitch: options.pitch ?? 0.3, distance: 9 },
    [{ mesh: iconMesh(name), materials: [{ tone: 0.9, accent: options.accent }], reveal: options.reveal, seed: options.seed }]);
}
