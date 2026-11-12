/** Pure, float-time motion helpers shared by clean motion shots. */

export type Easing = (progress: number) => number;
export type EaseName = keyof typeof ease;
export interface XY { x: number; y: number }
export type Point = XY | readonly [number, number];
export type MotionValue = number | Point;

export const clamp = (value: number, min = 0, max = 1): number => Math.min(max, Math.max(min, value));
export const lerp = (from: number, to: number, progress: number): number => from + (to - from) * progress;

/** The inverse of lerp. It intentionally permits progress outside 0..1. */
export function invLerp(from: number, to: number, value: number): number {
  return from === to ? 0 : (value - from) / (to - from);
}

/** Map one range to another. Pass an easing to shape the unbounded progress. */
export function remap(value: number, inFrom: number, inTo: number, outFrom: number, outTo: number, easing?: Easing): number {
  const progress = invLerp(inFrom, inTo, value);
  return lerp(outFrom, outTo, easing ? easing(progress) : progress);
}

const unit = (x: number) => clamp(x);
const overshoot = 1.70158;

export const ease = {
  linear: (x: number) => unit(x),
  inCubic: (x: number) => unit(x) ** 3,
  outCubic: (x: number) => 1 - (1 - unit(x)) ** 3,
  inOutCubic: (x: number) => {
    const p = unit(x);
    return p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
  },
  inQuint: (x: number) => unit(x) ** 5,
  outQuint: (x: number) => 1 - (1 - unit(x)) ** 5,
  inOutQuint: (x: number) => {
    const p = unit(x);
    return p < 0.5 ? 16 * p ** 5 : 1 - (-2 * p + 2) ** 5 / 2;
  },
  inBack: (x: number, amount = overshoot) => {
    const p = unit(x);
    return (amount + 1) * p ** 3 - amount * p ** 2;
  },
  outBack: (x: number, amount = overshoot) => {
    const p = unit(x) - 1;
    return 1 + (amount + 1) * p ** 3 + amount * p ** 2;
  },
  inOutBack: (x: number, amount = overshoot) => {
    const p = unit(x), s = amount * 1.525;
    return p < 0.5
      ? ((2 * p) ** 2 * ((s + 1) * 2 * p - s)) / 2
      : (((2 * p - 2) ** 2 * ((s + 1) * (2 * p - 2) + s) + 2) / 2);
  },
  inExpo: (x: number) => unit(x) === 0 ? 0 : 2 ** (10 * unit(x) - 10),
  outExpo: (x: number) => unit(x) === 1 ? 1 : 1 - 2 ** (-10 * unit(x)),
  inOutExpo: (x: number) => {
    const p = unit(x);
    if (p === 0 || p === 1) return p;
    return p < 0.5 ? 2 ** (20 * p - 10) / 2 : (2 - 2 ** (-20 * p + 10)) / 2;
  },
} satisfies Record<string, Easing>;

function resolveEase(value?: Easing | EaseName): Easing {
  return typeof value === 'function' ? value : value ? ease[value] : ease.inOutCubic;
}

export interface SpringOptions {
  /** Angular stiffness in s⁻². Higher values settle faster. */
  stiffness?: number;
  /** Damping ratio: 1 is critical, below 1 has a smooth overshoot, above 1 has no overshoot. */
  damping?: number;
}

/** Analytic unit step response. Time is seconds; values may exceed 1 while an under-damped spring settles. */
export function spring(t: number, { stiffness = 140, damping = 0.82 }: SpringOptions = {}): number {
  if (t <= 0) return 0;
  const omega = Math.sqrt(Math.max(1e-6, stiffness));
  const zeta = Math.max(0, damping);
  if (Math.abs(zeta - 1) < 1e-5) {
    return 1 - (1 + omega * t) * Math.exp(-omega * t);
  }
  if (zeta < 1) {
    const wd = omega * Math.sqrt(1 - zeta * zeta);
    const error = Math.exp(-zeta * omega * t) * (
      Math.cos(wd * t) + (zeta / Math.sqrt(1 - zeta * zeta)) * Math.sin(wd * t)
    );
    return 1 - error;
  }
  const root = Math.sqrt(zeta * zeta - 1);
  const r1 = -omega * (zeta - root), r2 = -omega * (zeta + root);
  const error = (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r2 - r1);
  return 1 - error;
}

/** An eased scalar tween. A non-positive duration switches at `start`. */
export function tween(t: number, start: number, dur: number, from: number, to: number, easing: Easing | EaseName = ease.inOutCubic): number {
  const p = dur <= 0 ? (t < start ? 0 : 1) : clamp((t - start) / dur);
  return lerp(from, to, resolveEase(easing)(p));
}

export interface Keyframe<T extends MotionValue = MotionValue> {
  /** Seconds on the shot timeline. Keyframes should be supplied in time order. */
  t: number;
  value: T;
  /** Easing used from this frame to the next. Defaults to cubic in-out. */
  ease?: Easing | EaseName;
  /** Hold this value until the next keyframe. */
  hold?: boolean;
}

function isTuple(point: Point): point is readonly [number, number] { return Array.isArray(point); }
function xy(point: Point): XY { return isTuple(point) ? { x: point[0], y: point[1] } : point; }
function mixValue<T extends MotionValue>(from: T, to: T, p: number): T {
  if (typeof from === 'number' && typeof to === 'number') return lerp(from, to, p) as T;
  if (typeof from !== 'number' && typeof to !== 'number') {
    const a = xy(from), b = xy(to), x = lerp(a.x, b.x, p), y = lerp(a.y, b.y, p);
    return (isTuple(from) ? [x, y] : { x, y }) as T;
  }
  throw new TypeError('track keyframes must all contain numbers or all contain points');
}

/** Interpolate numeric or point keyframes without storing any frame-to-frame state. */
export function track<T extends MotionValue>(t: number, keyframes: readonly Keyframe<T>[]): T {
  if (!keyframes.length) return 0 as T;
  if (keyframes.length === 1 || t <= keyframes[0]!.t) return keyframes[0]!.value;
  const last = keyframes[keyframes.length - 1]!;
  if (t >= last.t) return last.value;
  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i]!, b = keyframes[i + 1]!;
    if (t > b.t) continue;
    if (a.hold) return a.value;
    const p = b.t <= a.t ? 1 : clamp((t - a.t) / (b.t - a.t));
    return mixValue(a.value, b.value, resolveEase(a.ease)(p));
  }
  return last.value;
}

/** A smooth parabolic hand-off arc. Positive height lifts the path upward on canvas. */
export function arc<T extends Point>(p0: T, p1: T, height: number, u: number): T {
  const a = xy(p0), b = xy(p1), p = clamp(u);
  const lift = 4 * height * p * (1 - p);
  const x = lerp(a.x, b.x, p), y = lerp(a.y, b.y, p) - lift;
  return (isTuple(p0) ? [x, y] : { x, y }) as T;
}

/** Return non-negative local time after a secondary action's delay. */
export const delay = (t: number, seconds = 0): number => Math.max(0, t - Math.max(0, seconds));

/** Sample a primary motion at an earlier time to give a follower a stable, stateless lag. */
export function follow<T>(t: number, sample: (at: number) => T, lag = 0): T {
  return sample(delay(t, lag));
}

/** Start a secondary tween `lead` seconds early so it overlaps the primary beat. */
export function overlap(t: number, start: number, dur: number, lead = 0): number {
  const early = Math.max(0, lead);
  return phase(t, start - early, start + Math.max(0, dur));
}

/** Progress from a start to an end time, clamped to 0..1. */
export function phase(t: number, a: number, b: number): number {
  return b <= a ? (t < a ? 0 : 1) : clamp((t - a) / (b - a));
}

/** Back-eased progress with a small initial recoil, useful for anticipation before a readable move. */
export function anticipate(t: number, start: number, dur: number, amount = 0.18): number {
  const p = dur <= 0 ? (t < start ? 0 : 1) : phase(t, start, start + dur);
  return ease.inBack(p, Math.max(0, amount));
}

/** Smooth area-preserving squash: it begins before impact, peaks at hitTime, then settles. */
export function squash(t: number, hitTime: number, amount = 0.24, dur = 0.24): { sx: number; sy: number } {
  if (dur <= 0 || t < hitTime - dur / 2 || t > hitTime + dur / 2) return { sx: 1, sy: 1 };
  const p = phase(t, hitTime - dur / 2, hitTime + dur / 2);
  const envelope = Math.sin(Math.PI * p) ** 2;
  const sx = Math.max(0.25, 1 - clamp(amount, 0, 0.72) * envelope);
  return { sx, sy: 1 / sx };
}

/** Direction and modest stretch for a fast moving object. Velocity is pixels per second. */
export function smear(velocity: Point, maxSpeed = 1800, maxStretch = 0.55): { stretch: number; angle: number } {
  const { x, y } = xy(velocity);
  const speed = Math.hypot(x, y);
  return { stretch: 1 + clamp(speed / Math.max(1, maxSpeed)) * maxStretch, angle: Math.atan2(y, x) };
}

/** Slow idle bob. Prefer periods of at least 1.2 seconds. */
export function bob(t: number, period: number, amp: number): number {
  return period <= 0 ? 0 : Math.sin((Math.PI * 2 * t) / period) * amp;
}

/** Delay item `i` in a staggered sequence by `gap` seconds. */
export const stagger = (i: number, gap: number): number => Math.max(0, i) * Math.max(0, gap);

export interface TimedEvent { at: number; kind: string }
/** Use a narration event when present, otherwise use a caller-computed proportional fallback (often `dur * .4`). */
export function beat(events: readonly TimedEvent[] | null | undefined, kind: string, fallback: number): number {
  const match = events?.find(event => String(event.kind).toLowerCase() === kind.toLowerCase() && Number.isFinite(event.at));
  return match ? match.at : fallback;
}

/** Approximate the greatest displacement in pixels during one frame of a time range. */
export function speedGuard(positionAt: (t: number) => number | Point, start: number, end: number, fps = 30): number {
  if (end <= start || fps <= 0) return 0;
  const step = 1 / fps;
  let previous = positionAt(start), max = 0;
  for (let t = Math.min(end, start + step); t <= end + 1e-9; t = Math.min(end, t + step)) {
    const current = positionAt(t);
    const delta = typeof current === 'number' && typeof previous === 'number'
      ? Math.abs(current - previous)
      : typeof current !== 'number' && typeof previous !== 'number'
        ? Math.hypot(xy(current).x - xy(previous).x, xy(current).y - xy(previous).y)
        : Number.POSITIVE_INFINITY;
    max = Math.max(max, delta);
    previous = current;
    if (t === end) break;
  }
  return max;
}
