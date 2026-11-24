import {
  body,
  ellipse,
  label,
  layer,
  stars,
  tau,
  trace,
  tween,
  type Material,
  type Point,
  type Shot,
} from './index.ts';
import { galaxy } from './cosmos.ts';

export type Dust = { x: number; y: number; depth: number; size: number; material: Material };
export function dustCloud(count: number, seed: number): Dust[] {
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  return Array.from({ length: count }, () => ({
    x: random() * 2 - 1,
    y: random() * 2 - 1,
    depth: random(),
    size: 1 + random() ** 3 * 6,
    material: random() < 0.58 ? 'ember' : 'twilight',
  }));
}

// Perspective progression wraps behind the camera; fade across both endpoints
// so a cloud can run continuously without particles popping on at the far plane.
export function flyThrough(
  ctx: CanvasRenderingContext2D,
  particles: readonly Dust[],
  distance: number,
  center: Point = [960, 540],
) {
  for (const item of particles) {
    const z = (((item.depth - distance) % 1) + 1) % 1,
      scale = 1 / (0.14 + 1.8 * z);
    const x = center[0] + item.x * 1520 * scale,
      y = center[1] + item.y * 910 * scale;
    if (x < -70 || x > 1990 || y < -70 || y > 1150) continue;
    const alpha = Math.min(1, z * 18, (1 - z) * 10);
    layer(ctx, { x, y, scale: (item.size * scale) / 16, alpha }, () =>
      body(ctx, 'sphere', [0, 0], 16, item.material),
    );
  }
}
const cloud = dustCloud(6500, 538);
const sea: Shot = {
  duration: 4,
  draw(ctx, t) {
    flyThrough(ctx, cloud, t * 0.11);
  },
};
const scales: Shot = {
  duration: 7,
  draw(ctx, t) {
    stars(ctx, t, 160);
    const approach = tween(t, 0, 4, 1, 8),
      dissolve = tween(t, 1.5, 3.8, 1, 0);
    layer(ctx, { alpha: dissolve }, () => galaxy(ctx, [960, 540], 700 * approach, 0.12, -0.1));
    const planet = tween(t, 1.6, 5, 0.01, 1);
    layer(ctx, { x: 960, y: 540, scale: planet, alpha: 1 - dissolve }, () => {
      trace(ctx, ellipse([0, 0], 640, 170, -0.19), 1, 'twilight', 4);
      body(ctx, 'sphere', [0, 0], 180, 'ember');
      const a = t * 0.65;
      body(ctx, 'sphere', ellipse([0, 0], 640, 170, -0.19)(a / tau), 35, 'twilight');
    });
    layer(ctx, { alpha: dissolve }, () => label(ctx, 'Galactic scale', [960, 920], 43));
    layer(ctx, { alpha: 1 - dissolve }, () => label(ctx, 'Planetary scale', [960, 920], 43));
  },
};
export const depthStudies = { sea, scales };
