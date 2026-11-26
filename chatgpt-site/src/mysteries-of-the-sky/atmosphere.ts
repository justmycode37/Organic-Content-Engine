// Schematic shell thickness and extinction. Positions and scale height share
// the caller's drawing units so the same ray works at the limb or in close-up.
type Ctx = CanvasRenderingContext2D;
type Point = readonly [number, number];

const shells = new Map<string, OffscreenCanvas>();
export function atmosphericLimb(ctx: Ctx, center: Point, radius: number, height: number, cloudy = false) {
  if (radius <= 0 || height <= 0) return;
  const extent = radius + height * 5;
  const size = Math.min(1800, Math.ceil(extent * 2));
  const key = [size, height / radius, cloudy].join('/');
  let surface = shells.get(key);
  if (!surface) {
    surface = new OffscreenCanvas(size, size);
    const g = surface.getContext('2d')!;
    const pix = g.createImageData(size, size);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const u = (((x + 0.5) * 2) / size - 1) * extent;
        const v = (((y + 0.5) * 2) / size - 1) * extent;
        const h = (Math.hypot(u, v) - radius) / height;
        if (h < -1.4 || h > 5) continue;
        const angle = Math.atan2(v, u);
        const light = 0.54 + 0.46 * Math.cos(angle + 2.25);
        // Long low-contrast filaments in the haze soften the cloud tops at the terminator.
        const curl = Math.sin(angle * 13 + 0.6 * Math.sin(angle * 9));
        const filament = 0.52 + 0.48 * Math.sin(2.9 * h + angle * 24 + curl * 2);
        const cloud = cloudy
          ? Math.exp(-Math.pow((h - 0.15 - 0.28 * curl) / 0.43, 2)) * (0.4 + 0.6 * filament)
          : 0;
        const density = h >= 0 ? Math.exp(-1.28 * h) : Math.exp(-3.1 * h * h);
        const warmth = light * Math.exp(-Math.max(0, h) * 0.62);
        const i = (y * size + x) * 4;
        pix.data[i] = 128 + 100 * warmth + 14 * cloud;
        pix.data[i + 1] = 134 + 31 * warmth + 25 * cloud;
        pix.data[i + 2] = 206 - 15 * warmth + 25 * cloud;
        pix.data[i + 3] = 255 * Math.min(0.94, density * (0.22 + 0.48 * light) + 0.25 * cloud);
      }
    g.putImageData(pix, 0, 0);
    if (shells.size >= 10) shells.delete(shells.keys().next().value!);
    shells.set(key, surface);
  }
  ctx.drawImage(surface, center[0] - extent, center[1] - extent, 2 * extent, 2 * extent);
}

export interface LightPath {
  start: Point;
  end: Point;
  center: Point;
  radius: number;
  scaleHeight: number;
  extinction: number;
  tint: string;
  period: number;
  phase?: number;
}
// Integrate optical depth along the *straight* ray. Both the travelling packet
// and its fine underlying trail use the same surviving light fraction.
export function transmittedLight(ctx: Ctx, path: LightPath, t: number) {
  const { start, end, center, radius, scaleHeight, extinction, tint, period, phase = 0 } = path;
  const dx = end[0] - start[0],
    dy = end[1] - start[1],
    length = Math.hypot(dx, dy);
  if (length <= 0 || period <= 0 || scaleHeight <= 0) return;
  const n = 112,
    transmission = [1];
  let depth = 0;
  const beam = ctx.createLinearGradient(...start, ...end);
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    if (i) {
      const mid = (i - 0.5) / n;
      const altitude = Math.hypot(start[0] + dx * mid - center[0], start[1] + dy * mid - center[1]) - radius;
      depth += (extinction * Math.exp(-Math.max(-2, altitude / scaleHeight)) * length) / n;
      if (altitude < 0) depth += (length / n) * 0.34;
      transmission.push(Math.exp(-depth));
    }
    const edge = Math.min(1, f * 14, (1 - f) * 14);
    beam.addColorStop(
      f,
      tint +
        Math.round(255 * edge * 0.4 * transmission[i])
          .toString(16)
          .padStart(2, '0'),
    );
  }
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(...start);
  ctx.lineTo(...end);
  ctx.strokeStyle = beam;
  ctx.lineWidth = 1.3;
  ctx.stroke();
  ctx.translate(...start);
  ctx.rotate(Math.atan2(dy, dx));
  const f = (((t / period + phase) % 1) + 1) % 1;
  const energy = transmission[Math.round(f * n)] * Math.min(1, f * 11, (1 - f) * 13);
  ctx.globalAlpha *= energy;
  const x = f * length;
  const tail = ctx.createLinearGradient(x - 90, 0, x + 6, 0);
  tail.addColorStop(0, tint + '00');
  tail.addColorStop(0.76, tint + '8c');
  tail.addColorStop(0.94, '#ffede1');
  tail.addColorStop(1, tint + '00');
  ctx.fillStyle = tail;
  ctx.beginPath();
  ctx.ellipse(x - 42, 0, 48, 1.8, 0, 0, Math.PI * 2);
  ctx.fill();
  const bloom = ctx.createRadialGradient(x, 0, 0, x, 0, 11);
  bloom.addColorStop(0, '#fff2e8d9');
  bloom.addColorStop(0.19, tint + 'bc');
  bloom.addColorStop(1, tint + '00');
  ctx.fillStyle = bloom;
  ctx.fillRect(x - 11, -11, 22, 22);
  ctx.restore();
}
