// Stops sampled from the owner's landscape (shadow swatches and upper sky).
export const sky = {
  night: '#040411',
  plum: '#2e1d2d',
  wine: '#63374a',
  brick: '#873f40',
  coral: '#c46d65',
  blush: '#ffc7c4',
  indigo: '#293fb0',
  lilac: '#bdabe8',
  light: '#fff1ea',
  accent: '#ddf65e',
} as const;

export const ramps = {
  ember: [sky.plum, sky.brick, sky.coral, '#f79d92', sky.blush],
  twilight: [sky.night, '#282142', sky.indigo, '#6876c4', sky.lilac],
  ink: [sky.night, '#161224', sky.plum, sky.wine, '#a37289'],
  chalk: [sky.wine, '#ab859a', '#dfc2d4', '#f5dedc', sky.light],
  signal: [sky.plum, '#746f47', '#b4be59', sky.accent, '#f1fcc2'],
} as const;
export type Material = keyof typeof ramps;
export type Surface = 'sphere' | 'shell' | 'torus';
const cache = new Map<string, OffscreenCanvas>();

// Object-space grain stays attached to the paint during a pan or a scale change.
export function surface(kind: Surface, material: Material, radius: number, seed: number) {
  const size = Math.min(1200, Math.max(64, Math.ceil(radius * 2.16)));
  const key = [kind, material, size, seed].join('/');
  const found = cache.get(key);
  if (found) return found;
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d')!;
  const pixels = ctx.createImageData(size, size);
  const colors = ramps[material].map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)));
  const phase = seed * 1.87;
  let random = seed | 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = ((x + 0.5) / size - 0.5) * 2.16;
      const v = ((y + 0.5) / size - 0.5) * 2.16;
      const angle = Math.atan2(v, u);
      const boundary =
        kind === 'shell'
          ? 1 +
            0.024 * Math.sin(3 * angle + phase) +
            0.016 * Math.cos(5 * angle - phase) +
            0.009 * Math.sin(9 * angle + phase)
          : 1;
      const r = Math.hypot(u, v) / boundary;
      if (r >= 1) continue;
      random = (Math.imul(random, 1664525) + 1013904223) | 0;
      const noise = (random >>> 0) / 4294967296 - 0.5;
      let opacity = Math.min(1, (1 - r) * size * 0.46);
      let value: number;
      if (kind === 'shell') {
        if (r < 0.68) continue;
        const depth = (r - 0.68) / 0.32;
        opacity *= depth ** 1.4;
        value = 0.37 + 0.43 * depth + 0.14 * Math.cos(angle + phase);
      } else if (kind === 'torus') {
        if (r < 0.3) continue;
        opacity *= Math.min(1, (r - 0.3) * size * 0.46);
        const arch = Math.sin((Math.PI * (r - 0.3)) / 0.7);
        value = 0.41 + 0.42 * arch + 0.12 * Math.cos(angle + 1.7);
      } else {
        const z = Math.sqrt(1 - r * r);
        const light = Math.max(0, -0.52 * u - 0.57 * v + 0.63 * z);
        value = 0.07 + 0.82 * light + 0.15 * (1 - z) ** 3;
      }
      const t = Math.min(3.9999, Math.max(0, (value + noise * 0.12) * 4));
      const k = Math.floor(t);
      const i = (y * size + x) * 4;
      for (let c = 0; c < 3; c++)
        pixels.data[i + c] = colors[k][c] + (colors[k + 1][c] - colors[k][c]) * (t - k);
      pixels.data[i + 3] = 255 * opacity;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  // Bound retained bitmaps when an editor scrubs through many different shots.
  if (cache.size >= 32) cache.delete(cache.keys().next().value!);
  cache.set(key, canvas);
  return canvas;
}

export function wash(
  ctx: CanvasRenderingContext2D,
  material: Material,
  x: number,
  y: number,
  dx: number,
  dy: number,
) {
  const grad = ctx.createLinearGradient(x, y, x + dx, y + dy);
  ramps[material].forEach((color, i) => grad.addColorStop(i / 4, color));
  return grad;
}
