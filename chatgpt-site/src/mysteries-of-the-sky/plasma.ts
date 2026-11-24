import { body, ellipse, layer, trace, tween, type Point, type Shot } from './index.ts';
import { ramps, type Material } from './materials.ts';

type Ctx = CanvasRenderingContext2D;
const maps = new Map<number, OffscreenCanvas>();
// Lattice noise is sampled once per atlas. The same eddies survive a camera move.
function lattice(x: number, y: number, seed: number) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + seed;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
function noise(x: number, y: number, seed: number) {
  const i = Math.floor(x),
    j = Math.floor(y),
    dx = x - i,
    dy = y - j;
  const u = dx * dx * (3 - 2 * dx),
    v = dy * dy * (3 - 2 * dy);
  const a = lattice(i, j, seed),
    b = lattice(i + 1, j, seed),
    c = lattice(i, j + 1, seed),
    d = lattice(i + 1, j + 1, seed);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}
function convection(seed: number) {
  const cached = maps.get(seed);
  if (cached) return cached;
  const size = 384,
    plate = new OffscreenCanvas(size, size),
    ctx = plate.getContext('2d')!;
  const pixels = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size,
        v = y / size,
        distort = noise(u * 4, v * 4, seed) * 2;
      const density =
        0.58 * noise(u * 12 + distort, v * 12 - distort, seed) +
        0.29 * noise(u * 27, v * 27, seed) +
        0.13 * noise(u * 77, v * 77, seed);
      const i = 4 * (y * size + x),
        glow = Math.max(0, (density - 0.31) * 2.8);
      pixels.data[i] = 255;
      pixels.data[i + 1] = 140 + 102 * glow;
      pixels.data[i + 2] = 122 + 95 * glow;
      pixels.data[i + 3] = Math.min(200, glow * glow * 147);
    }
  ctx.putImageData(pixels, 0, 0);
  if (maps.size >= 8) maps.delete(maps.keys().next().value!);
  maps.set(seed, plate);
  return plate;
}

export function halo(ctx: Ctx, at: Point, radius: number, material: Material) {
  const ramp = ramps[material],
    g = ctx.createRadialGradient(...at, 0, ...at, radius);
  g.addColorStop(0, ramp[4] + 'bb');
  g.addColorStop(0.44, ramp[3] + '88');
  g.addColorStop(0.74, ramp[2] + '36');
  g.addColorStop(1, ramp[0] + '00');
  ctx.fillStyle = g;
  ctx.fillRect(at[0] - radius, at[1] - radius, radius * 2, radius * 2);
}
export function photosphere(ctx: Ctx, at: Point, radius: number, t: number) {
  layer(ctx, { x: at[0], y: at[1], scale: radius / 200 }, () => {
    halo(ctx, [0, 0], 305, 'ember');
    body(ctx, 'sphere', [0, 0], 200, 'ember');
    ctx.beginPath();
    ctx.arc(0, 0, 200, 0, Math.PI * 2);
    ctx.clip();
    for (let i = 0; i < 2; i++)
      layer(ctx, { angle: 0.055 * Math.sin(t * 0.31 + i * 5) + i * 1.4, alpha: 0.7 }, () => {
        ctx.drawImage(convection(65 + i), -228 + 8 * Math.sin(t * 0.5 + i), -228, 456, 456);
      });
  });
}

// The plume rises and spreads at its head. Reuse as a schematic for a hot
// upwelling; speed, silhouette and colour are art direction rather than measurements.
export function risingPlume(ctx: Ctx, base: Point, t: number, progress: number) {
  const p = Math.max(0, Math.min(1, progress));
  layer(ctx, { x: base[0], y: base[1], alpha: Math.min(1, p * 6) }, () => {
    const top = -520 * p;
    for (let i = 0; i <= 13; i++) {
      const u = i / 13;
      layer(
        ctx,
        { x: 10 * Math.sin(3 * u + t * 0.7), y: u * top, scale: 0.08 + 0.11 * Math.sin(u * Math.PI) },
        () => {
          photosphere(ctx, [0, 0], 160, t + u * 1.7);
        },
      );
    }
    layer(ctx, { x: 0, y: top, scale: 0.16 + 0.88 * p }, () => {
      ctx.scale(1.35, 0.74);
      photosphere(ctx, [0, 0], 155, t);
    });
    const r = 28 + p * 475;
    trace(ctx, ellipse([0, top * 0.4], r, r * 0.128), 1, 'twilight', 5);
  });
}
const plasma: Shot = {
  duration: 7,
  draw(ctx, t) {
    risingPlume(ctx, [960, 810], t, tween(t, 0.3, 4.7, 0, 1));
  },
};
export const plasmaStudies = { plasma };
