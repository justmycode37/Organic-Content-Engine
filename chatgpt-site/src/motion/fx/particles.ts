// Deterministic pixel particle systems. Every state is derived from time + seed;
// there is no mutable emitter state, so random access rendering is reproducible.
import { clamp, hash, type Ctx } from '../core.ts';
import { CELL, bayer } from '../pix.ts';

export type Point2 = { x: number; y: number };
export type Point3 = [number, number, number];
export type ParticlePoint = Point2 | Point3;
export type Projector = (point: Point3) => { x: number; y: number; scale?: number };
export type BurstKind = 'coin' | 'shard' | 'spark' | 'confetti' | 'dust' | 'quill';
export type EmitterKind = 'smoke' | 'sparkles' | 'rain' | 'banknotes' | 'snow' | 'embers';

export interface ParticleState {
  x: number;
  y: number;
  z?: number;
  vx: number;
  vy: number;
  vz?: number;
  spin: number;
  rotation: number;
  alpha: number;
  size: number;
  age: number;
  kind: BurstKind | EmitterKind;
  color: string;
  flip?: number;
}

export interface BurstOptions {
  /** Pixel coordinate [x,y] or a world point [x,y,z]. World bursts need project. */
  center?: ParticlePoint;
  x?: number;
  y?: number;
  z?: number;
  seed?: number;
  count?: number;
  kind?: BurstKind;
  start?: number;
  life?: number;
  speed?: number;
  spread?: number;
  gravity?: number;
  drag?: number;
  floor?: number;
  bounce?: number;
  spin?: number;
  size?: number;
  color?: string;
  projector?: Projector;
  cell?: number;
}

export interface EmitterOptions {
  kind: EmitterKind;
  x?: number;
  y?: number;
  /** A three-coordinate center enables projected world-space particles. */
  center?: Point3;
  width?: number;
  height?: number;
  depth?: number;
  seed?: number;
  start?: number;
  rate?: number;
  life?: number;
  speed?: number;
  wind?: number;
  gravity?: number;
  size?: number;
  color?: string;
  projector?: Projector;
  cell?: number;
}

export interface DrawParticlesOptions { color?: string; cell?: number; projector?: Projector }

const finite = (value: number | undefined, fallback: number) => Number.isFinite(value) ? value! : fallback;
const snap = (value: number, cell: number) => Math.round(value / cell) * cell;
const clampCount = (count: number | undefined, fallback: number, max: number) => Math.max(0, Math.min(max, Math.floor(finite(count, fallback))));

function centerOf(options: BurstOptions): { x: number; y: number; z?: number } {
  const p = options.center;
  if (Array.isArray(p)) return { x: finite(p[0], 0), y: finite(p[1], 0), z: finite(p[2], 0) };
  if (p) return { x: finite(p.x, 0), y: finite(p.y, 0) };
  return { x: finite(options.x, 540), y: finite(options.y, 760), ...(options.z === undefined ? {} : { z: options.z }) };
}

function solveImpact(y: number, vy: number, gravity: number, floor: number, remaining: number) {
  if (gravity > 1e-6) {
    const disc = Math.max(0, vy * vy + 2 * gravity * (floor - y));
    const root = (-vy + Math.sqrt(disc)) / gravity;
    return root > 1e-6 && root <= remaining ? root : Infinity;
  }
  if (vy > 1e-6) {
    const root = (floor - y) / vy;
    return root > 1e-6 && root <= remaining ? root : Infinity;
  }
  return Infinity;
}

function evolveBurst(t: number, index: number, options: BurstOptions): ParticleState | null {
  const start = finite(options.start, 0), age = t - start, life = Math.max(.01, finite(options.life, 1.65));
  if (age < 0 || age >= life) return null;
  const seed = finite(options.seed, 1), center = centerOf(options);
  const is3d = center.z !== undefined;
  const angle = hash(index, seed + 1) * Math.PI * 2;
  const speed = finite(options.speed, 420) * (.48 + hash(index, seed + 2) * .88);
  let x = center.x, y = center.y, z = center.z;
  let vx: number, vy: number, vz = 0;
  if (is3d) {
    const sy = hash(index, seed + 3) * 2 - 1;
    const ring = Math.sqrt(Math.max(0, 1 - sy * sy));
    vx = Math.cos(angle) * ring * speed * .02;
    vy = sy * speed * .02;
    vz = Math.sin(angle) * ring * speed * .02;
  } else {
    const spread = finite(options.spread, Math.PI * 2);
    const a = -Math.PI / 2 + (hash(index, seed + 4) - .5) * spread;
    vx = Math.cos(a) * speed;
    vy = Math.sin(a) * speed;
  }
  const gravity = finite(options.gravity, is3d ? -10.5 : 620);
  const drag = Math.max(0, finite(options.drag, .42));
  const floor = finite(options.floor, is3d ? -Infinity : 1130);
  const restitution = clamp(finite(options.bounce, .38), 0, .92);
  let remaining = age;
  let impacts = 0;
  while (remaining > 1e-6) {
    const impact = Number.isFinite(floor) && impacts < 4
      ? is3d ? (() => {
        if (gravity >= -1e-6) return Infinity;
        const disc = Math.max(0, vy * vy - 2 * gravity * (y! - floor));
        const root = (-vy - Math.sqrt(disc)) / gravity;
        return root > 1e-6 && root <= remaining ? root : Infinity;
      })() : solveImpact(y, vy, gravity, floor, remaining)
      : Infinity;
    const step = impact === Infinity ? remaining : impact;
    const decay = drag > 0 ? Math.exp(-drag * step) : 1;
    const travel = drag > 0 ? (1 - decay) / drag : step;
    x += vx * travel;
    if (is3d) {
      y! += vy * step + .5 * gravity * step * step;
      z! += vz * travel;
    } else y += vy * step + .5 * gravity * step * step;
    vy += gravity * step;
    vx *= decay;
    vz *= decay;
    remaining -= step;
    if (impact !== Infinity) {
      if (is3d) y = floor;
      else y = floor;
      vy = -vy * restitution;
      impacts++;
      // Stop spending work on tiny floor taps; the residual is a deterministic rest.
      if (Math.abs(vy) < 32) { remaining = 0; vy = 0; }
    }
  }
  return {
    x, y, ...(z === undefined ? {} : { z }), vx, vy, ...(is3d ? { vz } : {}),
    spin: (hash(index, seed + 7) * 2 - 1) * finite(options.spin, 8),
    rotation: hash(index, seed + 8) * Math.PI * 2 + (hash(index, seed + 7) * 2 - 1) * finite(options.spin, 8) * age,
    alpha: Math.pow(1 - age / life, .66), size: Math.max(1, finite(options.size, 2 + Math.floor(hash(index, seed + 9) * 3))),
    age, kind: options.kind ?? 'coin', color: options.color ?? '#F4F4F5',
  };
}

/** Returns deterministic burst states at t. Values are independent of frame order or frame rate. */
export function burstParticles(t: number, options: BurstOptions): ParticleState[] {
  const count = clampCount(options.count, 40, 256), out: ParticleState[] = [];
  for (let i = 0; i < count; i++) {
    const particle = evolveBurst(t, i, options);
    if (particle) out.push(particle);
  }
  return out;
}

function emitterState(t: number, sequence: number, options: EmitterOptions): ParticleState | null {
  const seed = finite(options.seed, 1), rate = Math.max(.1, finite(options.rate, 14));
  const born = finite(options.start, 0) + sequence / rate;
  const age = t - born, life = Math.max(.05, finite(options.life, options.kind === 'rain' ? 2.1 : 1.8));
  if (age < 0 || age >= life) return null;
  const width = Math.max(CELL, finite(options.width, 420)), height = Math.max(CELL, finite(options.height, 520));
  const world = options.center;
  const x0 = world?.[0] ?? finite(options.x, 540), y0 = world?.[1] ?? finite(options.y, 680), z0 = world?.[2];
  const xRand = hash(sequence, seed + 11), yRand = hash(sequence, seed + 17), zRand = hash(sequence, seed + 23);
  const speed = finite(options.speed, options.kind === 'rain' ? 520 : options.kind === 'smoke' ? 76 : 132);
  let x = x0 + (xRand - .5) * width, y = y0 + (yRand - .5) * (options.kind === 'rain' ? height : height * .15);
  let z = z0 === undefined ? undefined : z0 + (zRand - .5) * finite(options.depth, 8);
  const wind = finite(options.wind, options.kind === 'rain' ? 26 : 8);
  let vy = speed;
  switch (options.kind) {
    case 'smoke':
      x += Math.sin(age * 2.2 + sequence) * (14 + age * 15); y -= speed * age; vy = -speed; break;
    case 'sparkles':
      x += Math.sin(age * 5 + sequence) * 8; y -= speed * age; vy = -speed; break;
    case 'rain':
      x += wind * age; y += speed * age; break;
    case 'banknotes':
      x += wind * age + Math.sin(age * 4 + sequence) * 34; y += speed * age + 42 * age * age; vy = speed + 84 * age; break;
    case 'snow':
      x += Math.sin(age * 1.5 + sequence) * 32 + wind * age * .2; y += speed * age * .38; vy = speed * .38; break;
    case 'embers':
      x += Math.sin(age * 4 + sequence) * 18; y -= speed * age; vy = -speed; break;
  }
  const lifeRatio = age / life;
  const alpha = options.kind === 'smoke' ? Math.sin(Math.PI * lifeRatio) * .72
    : options.kind === 'rain' ? .68 : options.kind === 'banknotes' ? Math.min(1, Math.min(lifeRatio * 5, (1 - lifeRatio) * 5))
      : Math.min(1, Math.min(lifeRatio * 6, (1 - lifeRatio) * 5));
  return {
    x, y, ...(z === undefined ? {} : { z }), vx: wind, vy, ...(z === undefined ? {} : { vz: 0 }), spin: Math.sin(sequence) * 2,
    rotation: Math.sin(age * (options.kind === 'banknotes' ? 8 : 2) + sequence) * (options.kind === 'banknotes' ? .7 : .22),
    alpha, size: finite(options.size, options.kind === 'banknotes' ? 4 : options.kind === 'rain' ? 1 : 2), age,
    kind: options.kind, color: options.color ?? (options.kind === 'smoke' ? '#BDBDC2' : '#F4F4F5'),
    ...(options.kind === 'banknotes' ? { flip: Math.floor(age * 30 / 3) % 3 } : {}),
  };
}

/** Evaluates the active deterministic slice of a continuous emitter. */
export function emitterParticles(t: number, options: EmitterOptions): ParticleState[] {
  const rate = Math.max(.1, finite(options.rate, 14)), life = Math.max(.05, finite(options.life, options.kind === 'rain' ? 2.1 : 1.8));
  const first = Math.max(0, Math.floor((t - finite(options.start, 0) - life) * rate));
  const last = Math.min(10000000, Math.floor((t - finite(options.start, 0)) * rate));
  const out: ParticleState[] = [];
  for (let sequence = first; sequence <= last && out.length < 240; sequence++) {
    const particle = emitterState(t, sequence, options);
    if (particle) out.push(particle);
  }
  return out;
}

const SHAPES: Record<BurstKind | EmitterKind, readonly [number, number][]> = {
  coin: [
    [-1, -3], [0, -3], [1, -3],
    [-2, -2], [-1, -2], [0, -2], [1, -2], [2, -2],
    [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1],
    [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0],
    [-2, 1], [-1, 1], [0, 1], [1, 1], [2, 1],
    [-2, 2], [-1, 2], [0, 2], [1, 2], [2, 2],
    [-1, 3], [0, 3], [1, 3],
  ],
  shard: [[0, -2], [0, -1], [0, 0], [1, 0], [-1, 1], [-1, 2]],
  spark: [[0, -1], [0, 0], [0, 1], [-1, 0], [1, 0], [-2, 0], [2, 0]],
  confetti: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1]],
  dust: [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]],
  quill: [[0, 0], [1, -1], [2, -2], [3, -2], [2, -1], [1, 0]],
  smoke: [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [2, 0], [-2, 0]],
  sparkles: [[0, -1], [0, 0], [0, 1], [-1, 0], [1, 0]],
  rain: [[0, -2], [0, -1], [0, 0]],
  banknotes: [[-3, -1], [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1], [3, -1], [-3, 0], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [3, 0], [-3, 1], [-2, 1], [-1, 1], [0, 1], [1, 1], [2, 1], [3, 1]],
  snow: [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1]],
  embers: [[0, 0], [0, -1], [1, 0], [-1, 0]],
};

function projected(particle: ParticleState, projector?: Projector) {
  if (particle.z === undefined || !projector) return { x: particle.x, y: particle.y, scale: 1 };
  const p = projector([particle.x, particle.y, particle.z]);
  return { x: p.x, y: p.y, scale: p.scale ?? 1 };
}

/** Draws one particle with Bayer coverage; its silhouette and position stay on CELL. */
export function drawParticle(ctx: Ctx, particle: ParticleState, options: DrawParticlesOptions = {}) {
  const cell = Math.max(1, Math.round(finite(options.cell, CELL))), p = projected(particle, options.projector);
  const px = snap(p.x, cell), py = snap(p.y, cell), scale = Math.max(.4, Math.min(4, p.scale));
  const size = Math.max(1, Math.round(particle.size * scale));
  const shape = SHAPES[particle.kind] ?? SHAPES.dust;
  const quarter = Math.round(particle.rotation / (Math.PI / 2));
  const color = options.color ?? particle.color;
  for (const [sx, sy] of shape) {
    let rx = sx, ry = sy;
    for (let turn = 0; turn < ((quarter % 4) + 4) % 4; turn++) [rx, ry] = [-ry, rx];
    // The flipbook note compresses to a narrow strip for one of its three frames.
    if (particle.kind === 'banknotes' && particle.flip === 1) { if (Math.abs(rx) > 1) continue; }
    if (particle.kind === 'banknotes' && particle.flip === 2 && ry === 0) ry = 1;
    const x = px + rx * size * cell, y = py + ry * size * cell;
    const coverage = particle.alpha;
    if (coverage <= bayer(Math.floor(x / cell), Math.floor(y / cell))) continue;
    if (particle.kind === 'coin') {
      const inner = Math.abs(rx) <= 1 && Math.abs(ry) <= 2;
      ctx.fillStyle = inner ? '#69696F' : color;
      ctx.fillRect(x, y, cell * size, cell * size);
      if (ry === -3 || rx === -2) { ctx.fillStyle = color; ctx.fillRect(x, y, cell * size, cell * size); }
      if (rx === 0 && Math.abs(ry) < 2) { ctx.fillStyle = '#C6C6CA'; ctx.fillRect(x, y, cell * size, cell * size); }
    } else {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, cell * size, cell * size);
    }
  }
}

/** Burst renderer. Physics include gravity, exponential drag, floor bounce, and deterministic spin. */
export function drawBurst(ctx: Ctx, t: number, options: BurstOptions & DrawParticlesOptions) {
  const states = burstParticles(t, options), color = options.color;
  for (const particle of states) drawParticle(ctx, particle, { color, cell: options.cell, projector: options.projector });
  return states.length;
}

/** Continuous smoke, sparkle, rain, banknote, snow, or ember emitter. */
export function drawEmitter(ctx: Ctx, t: number, options: EmitterOptions) {
  const states = emitterParticles(t, options);
  for (const particle of states) drawParticle(ctx, particle, { color: options.color, cell: options.cell, projector: options.projector });
  return states.length;
}

export interface TrailPoint { x: number; y: number; z?: number; alpha?: number }
export interface TrailOptions { color?: string; width?: number; cell?: number; projector?: Projector }

/** Draws a stepped, dither-fading polyline trail, optionally projecting world points. */
export function drawTrail(ctx: Ctx, points: readonly TrailPoint[], options: TrailOptions = {}) {
  if (points.length < 2) return;
  const cell = Math.max(1, Math.round(options.cell ?? CELL)), color = options.color ?? '#F4F4F5';
  const projectPoint = (point: TrailPoint) => point.z !== undefined && options.projector
    ? options.projector([point.x, point.y, point.z]) : point;
  ctx.fillStyle = color;
  for (let i = 1; i < points.length; i++) {
    const p0 = projectPoint(points[i - 1]!), p1 = projectPoint(points[i]!);
    const fade = ((points[i - 1]!.alpha ?? (i / points.length)) + (points[i]!.alpha ?? (i / points.length))) * .5;
    const x0 = snap(p0.x, cell), y0 = snap(p0.y, cell), x1 = snap(p1.x, cell), y1 = snap(p1.y, cell);
    let x = Math.round(x0 / cell), y = Math.round(y0 / cell);
    const ex = Math.round(x1 / cell), ey = Math.round(y1 / cell), dx = Math.abs(ex - x), sx = x < ex ? 1 : -1;
    const dy = -Math.abs(ey - y), sy = y < ey ? 1 : -1;
    let err = dx + dy;
    for (let guard = 0; guard < 3000; guard++) {
      if (fade > bayer(x, y)) ctx.fillRect(x * cell, y * cell, Math.max(cell, options.width ?? cell), Math.max(cell, options.width ?? cell));
      if (x === ex && y === ey) break;
      const twice = 2 * err;
      if (twice >= dy) { err += dy; x += sx; }
      if (twice <= dx) { err += dx; y += sy; }
    }
  }
}

export interface ShockwaveOptions extends Point2 {
  center3d?: Point3;
  projector?: Projector;
  start?: number;
  duration?: number;
  radius?: number;
  maxRadius?: number;
  width?: number;
  color?: string;
  seed?: number;
  cell?: number;
}

/** Pixel-stepped expanding ring with dithered gaps and a short square-cell tail. */
export function drawShockwave(ctx: Ctx, t: number, options: ShockwaveOptions) {
  const p = clamp((t - finite(options.start, 0)) / Math.max(.01, finite(options.duration, .48)));
  if (p <= 0 || p >= 1) return 0;
  const cell = Math.max(1, Math.round(options.cell ?? CELL)), radius = finite(options.radius, 12) + (finite(options.maxRadius, 420) - finite(options.radius, 12)) * p;
  const center = options.center3d && options.projector ? options.projector(options.center3d) : options;
  const steps = Math.max(24, Math.ceil(Math.PI * 2 * radius / (cell * 1.7))), phase = finite(options.seed, 0);
  ctx.fillStyle = options.color ?? '#F4F4F5';
  let drawn = 0;
  for (let i = 0; i < steps; i++) {
    if (hash(i, phase) < .1 + (1 - p) * .18) continue;
    const a = i * Math.PI * 2 / steps;
    const x = snap(center.x + Math.cos(a) * radius, cell), y = snap(center.y + Math.sin(a) * radius, cell);
    if (hash(i, phase + 7) < p * .2) continue;
    ctx.fillRect(x, y, cell * Math.max(1, Math.round(finite(options.width, 1))), cell);
    drawn++;
  }
  return drawn;
}

export interface SpeedLinesOptions {
  x?: number; y?: number; width?: number; height?: number; center?: Point2; center3d?: Point3;
  projector?: Projector; count?: number; start?: number; duration?: number; mode?: 'radial' | 'linear';
  direction?: number; color?: string; seed?: number; cell?: number; strength?: number;
  reach?: number;
}

/** Radial manga burst lines or drifting linear speed lines, all rasterized on CELL. */
export function drawSpeedLines(ctx: Ctx, t: number, options: SpeedLinesOptions = {}) {
  const duration = Math.max(.01, finite(options.duration, .32)), p = clamp((t - finite(options.start, 0)) / duration);
  if (p <= 0 || p >= 1) return 0;
  const cell = Math.max(1, Math.round(options.cell ?? CELL)), w = finite(options.width, 1080), h = finite(options.height, 1260);
  const center = options.center3d && options.projector ? options.projector(options.center3d) : options.center ?? { x: w / 2, y: h / 2 };
  const count = clampCount(options.count, 42, 180), seed = finite(options.seed, 1), strength = clamp(finite(options.strength, 1));
  ctx.fillStyle = options.color ?? '#E6E6E8';
  let drawn = 0;
  for (let i = 0; i < count; i++) {
    if (hash(i, seed + 2) > strength) continue;
    if (options.mode === 'linear') {
      const y = snap(hash(i, seed + 3) * h, cell), left = hash(i, seed + 4) * w;
      const length = (w * (.12 + hash(i, seed + 5) * .38)) * (1 - p * .35);
      const drift = (options.direction ?? 1) * p * w * .22;
      const x0 = snap(left + drift, cell), x1 = snap(left + length + drift, cell);
      pixelSegment(ctx, x0, y, x1, y, cell, 1 + (i % 2));
    } else {
      const angle = hash(i, seed + 7) * Math.PI * 2;
      const inner = 12 + hash(i, seed + 9) * Math.max(w, h) * .2 + p * 70;
      const outer = finite(options.reach, Math.max(w, h) * (.55 + hash(i, seed + 11) * .45));
      pixelSegment(ctx, center.x + Math.cos(angle) * inner, center.y + Math.sin(angle) * inner,
        center.x + Math.cos(angle) * outer, center.y + Math.sin(angle) * outer, cell, 1 + (i % 3 === 0 ? 1 : 0));
    }
    drawn++;
  }
  return drawn;
}

export interface ImpactStarOptions { x?: number; y?: number; center3d?: Point3; projector?: Projector; size?: number; start?: number; duration?: number; color?: string; cell?: number; seed?: number }

/** Sharp stepped impact star. Its expansion and dithered edge are timeline pure. */
export function drawImpactStar(ctx: Ctx, t: number, options: ImpactStarOptions) {
  const p = clamp((t - finite(options.start, 0)) / Math.max(.01, finite(options.duration, .22)));
  if (p <= 0 || p >= 1) return;
  const projectedCenter = options.center3d && options.projector ? options.projector(options.center3d) : undefined;
  const cell = Math.max(1, Math.round(options.cell ?? CELL)), radius = finite(options.size, 96) * (.55 + p * .55);
  const cx = snap(projectedCenter?.x ?? finite(options.x, 540), cell), cy = snap(projectedCenter?.y ?? finite(options.y, 760), cell);
  const spikes = 12, points: Array<[number, number]> = [];
  for (let i = 0; i < spikes * 2; i++) {
    const a = i * Math.PI / spikes - Math.PI / 2;
    const r = radius * (i % 2 === 0 ? 1 : .25 + hash(i, finite(options.seed, 1)) * .22);
    points.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  const left = Math.floor((cx - radius) / cell), right = Math.ceil((cx + radius) / cell);
  const top = Math.floor((cy - radius) / cell), bottom = Math.ceil((cy + radius) / cell);
  ctx.fillStyle = options.color ?? '#F4F4F5';
  for (let gy = top; gy <= bottom; gy++) {
    let run = -1;
    for (let gx = left; gx <= right + 1; gx++) {
      const x = gx * cell + cell / 2, y = gy * cell + cell / 2;
      const inside = gx <= right && polygonContains(points, x, y);
      const on = inside && bayer(gx, gy) < (1 - p * .35);
      if (on && run < 0) run = gx;
      else if (!on && run >= 0) { ctx.fillRect(run * cell, gy * cell, (gx - run) * cell, cell); run = -1; }
    }
  }
}

export interface MotionStreakOptions {
  x?: number; y?: number; center3d?: Point3; dx: number; dy: number; length?: number; width?: number;
  color?: string; alpha?: number; cell?: number; projector?: Projector;
}

/** Fixed-time stepped streak behind a moving subject; delta can also be a 3D projected point. */
export function drawMotionStreak(ctx: Ctx, options: MotionStreakOptions) {
  const center = options.center3d && options.projector ? options.projector(options.center3d) : { x: finite(options.x, 0), y: finite(options.y, 0) };
  const cell = Math.max(1, Math.round(options.cell ?? CELL)), length = finite(options.length, 96), width = Math.max(1, Math.round(finite(options.width, 1)));
  const d = Math.hypot(options.dx, options.dy) || 1, ux = options.dx / d, uy = options.dy / d;
  ctx.fillStyle = options.color ?? '#F4F4F5';
  const segments = Math.max(2, Math.ceil(length / cell));
  for (let i = 0; i < segments; i++) {
    const fade = 1 - i / segments;
    const x = snap(center.x - ux * i * cell, cell), y = snap(center.y - uy * i * cell, cell);
    if (clamp(finite(options.alpha, 1) * fade) > bayer(Math.floor(x / cell), Math.floor(y / cell)))
      ctx.fillRect(x, y, cell * width, cell * width);
  }
  return segments;
}

function pixelSegment(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, cell: number, widthCells = 1) {
  let x = Math.round(x0 / cell), y = Math.round(y0 / cell);
  const ex = Math.round(x1 / cell), ey = Math.round(y1 / cell), dx = Math.abs(ex - x), sx = x < ex ? 1 : -1;
  const dy = -Math.abs(ey - y), sy = y < ey ? 1 : -1;
  let err = dx + dy;
  for (let guard = 0; guard < 4000; guard++) {
    ctx.fillRect(x * cell, y * cell, widthCells * cell, widthCells * cell);
    if (x === ex && y === ey) break;
    const twice = 2 * err;
    if (twice >= dy) { err += dy; x += sx; }
    if (twice <= dx) { err += dx; y += sy; }
  }
}

function polygonContains(points: Array<[number, number]>, x: number, y: number) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]!, [xj, yj] = points[j]!;
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
