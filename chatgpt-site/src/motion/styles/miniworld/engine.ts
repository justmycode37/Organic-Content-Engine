import { clamp, ease, stripMarkup, type Ctx, type Frame, type Theme } from '../../core.ts';

export const LABEL = 'Nunito, "Arial Rounded MT Bold", Arial, sans-serif';
export const BODY = '"Miniworld Sans", Inter, Arial, sans-serif';
export const PLACES = ['SERVER CITY', 'THE LAB', 'THE MARKET', 'CAPITOL', 'THE HARBOR'] as const;
export type Place = typeof PLACES[number];
type Point = { x: number; y: number };
type Solid = { top: string; left: string; right: string };
export const material = (theme: Theme): Record<string, Solid> => ({
  ground: theme.mode === 'dark' ? { top: theme.panelAlt, left: theme.panel, right: theme.line } : { top: theme.panel, left: theme.line, right: theme.panelAlt },
  clay: theme.mode === 'dark' ? { top: theme.dim, left: theme.line, right: theme.muted } : { top: theme.panelAlt, left: theme.muted, right: theme.line },
  teal: { top: theme.dim, left: theme.muted, right: theme.line },
  ink: theme.mode === 'dark' ? { top: theme.muted, left: theme.panel, right: theme.line } : { top: theme.muted, left: theme.fg, right: theme.dim },
  key: { top: theme.accent, left: theme.accent, right: theme.accent },
  alarm: { top: '#C84F46', left: '#C84F46', right: '#C84F46' },
  bit: theme.mode === 'dark' ? { top: theme.fg, left: theme.dim, right: theme.muted } : { top: theme.dim, left: theme.fg, right: '#1B2E33' },
});

// ---------------------------------------------------------------- timing: every helper is a pure function of t

/** Height above the ground of a block that starts falling at `at` and lands 0.18 s later with one small bounce. */
export function fall(t: number, at: number, from = 5) {
  const p = (t - at) / 0.18;
  if (p < 1) return from * (1 - clamp(p) ** 2);
  const q = (t - at - 0.18) / 0.16;
  return q < 1 ? Math.sin(q * Math.PI) * 0.12 : 0;
}
/** One hop of `height` world units starting at `at`. */
export const hop = (t: number, at: number, height = 0.45, length = 0.26) => { const p = (t - at) / length; return p > 0 && p < 1 ? Math.sin(p * Math.PI) * height : 0; };
/** Scale bump that peaks shortly after `at` and settles within `length` seconds. */
export const pulse = (t: number, at: number, amount = 0.14, length = 0.3) => { const p = (t - at) / length; return p >= 0 && p < 1 ? 1 + amount * Math.sin(p * Math.PI) * (1 - p) : 1; };
/** Index of the last beat in `times` that has started, or -1. */
export const beatIndex = (t: number, times: number[]) => times.reduce((last, time, index) => (t >= time ? index : last), -1);

// ---------------------------------------------------------------- flat type and plates

export function plate(ctx: Ctx, x: number, y: number, width: number, height: number, fill: string, radius = 20) {
  ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); ctx.fillStyle = fill; ctx.fill();
}

/** A clay slab: a rounded plate on a darker lip, so flat signs read as the same material as the world. */
export function slab(ctx: Ctx, x: number, y: number, width: number, height: number, fill: string, lip: string, radius = 22) {
  plate(ctx, x, y + 12, width, height, lip, radius); plate(ctx, x, y, width, height, fill, radius);
}

export function label(ctx: Ctx, value: string, x: number, y: number, width: number, size: number, color: string, align: CanvasTextAlign = 'center', family = LABEL) {
  ctx.save(); ctx.textAlign = align; ctx.textBaseline = 'middle';
  const plain = stripMarkup(value ?? '');
  ctx.font = `800 ${size}px ${family}`;
  const fitted = Math.min(size, size * width / Math.max(1, ctx.measureText(plain).width));
  ctx.font = `800 ${fitted}px ${family}`; ctx.fillStyle = color;
  ctx.fillText(plain, x, y, width); ctx.restore();
}

/** Wraps `value` into at most `maxRows` rows, shrinking the size until it fits. */
export function wrap(ctx: Ctx, value: string, width: number, size: number, maxRows = 2, family = LABEL) {
  let rows: string[] = [], fitted = size;
  ctx.save();
  for (; fitted >= 18; fitted -= 2) {
    ctx.font = `800 ${fitted}px ${family}`; rows = [];
    for (const word of stripMarkup(value ?? '').split(/\s+/).filter(Boolean)) {
      const last = rows.at(-1);
      if (last && ctx.measureText(`${last} ${word}`).width <= width) rows[rows.length - 1] = `${last} ${word}`;
      else rows.push(word);
    }
    if (rows.length <= maxRows) break;
  }
  ctx.restore();
  return { rows: rows.slice(0, maxRows), size: fitted };
}

/** Rows centred vertically on `y`. */
export function lines(ctx: Ctx, value: string, x: number, y: number, width: number, size: number, color: string, maxRows = 2, family = LABEL) {
  const fit = wrap(ctx, value, width, size, maxRows, family);
  const step = fit.size * 1.08;
  fit.rows.forEach((row, index) => label(ctx, row, x, y + (index - (fit.rows.length - 1) / 2) * step, width, fit.size, color, 'center', family));
}

/** The one title sign above every scene. `changedAt` slams it when its text changes. */
export function sign(frame: Frame, title: string, subtitle = '', changedAt = -1, titleColor?: string) {
  const { ctx, theme } = frame;
  const height = subtitle ? 232 : 182;
  const scale = pulse(frame.t, changedAt, 0.1, 0.24);
  ctx.save(); ctx.translate(540, 250 + height / 2); ctx.scale(scale, scale); ctx.translate(-540, -250 - height / 2);
  slab(ctx, 120, 250, 840, height, theme.panel, theme.line, 28);
  lines(ctx, title, 540, subtitle ? 330 : 341, 770, 78, titleColor ?? theme.fg, 2);
  if (subtitle) label(ctx, subtitle, 540, 438, 760, 36, theme.dim);
  ctx.restore();
}

// ---------------------------------------------------------------- the world

export class World {
  private queue: { depth: number; order: number; draw: () => void }[] = [];
  readonly colors: Record<string, Solid>;
  readonly frame: Frame;
  readonly origin: Point;
  readonly unit: number;
  constructor(frame: Frame, origin: Point = { x: 540, y: 940 }, unit = 52) {
    this.frame = frame; this.origin = origin; this.unit = unit; this.colors = material(frame.theme);
  }
  project(x: number, y: number, z = 0): Point { return { x: this.origin.x + (x - y) * this.unit, y: this.origin.y + (x + y) * this.unit * 0.5 - z * this.unit }; }
  add(depth: number, draw: () => void) { this.queue.push({ depth, order: this.queue.length, draw }); }
  polygon(points: Point[], fill: string) {
    const { ctx } = this.frame;
    ctx.beginPath(); points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  }
  box(x: number, y: number, z: number, width: number, depth: number, height: number, color = 'clay') {
    if (height <= 0) return;
    const shades = this.colors[color] ?? this.colors.clay;
    this.add(color === 'ground' ? -10000 + z : x + y + (width + depth) * 0.5 + z * 0.002, () => {
      const point = (dx: number, dy: number, dz: number) => this.project(x + dx, y + dy, z + dz);
      const left = [point(0, depth, 0), point(width, depth, 0), point(width, depth, height), point(0, depth, height)];
      const right = [point(width, 0, 0), point(width, depth, 0), point(width, depth, height), point(width, 0, height)];
      this.polygon(left, shades.left); this.polygon(right, shades.right);
      this.polygon([point(0, 0, height), point(width, 0, height), point(width, depth, height), point(0, depth, height)], shades.top);
      if (color === 'key') {
        // The accent stays one material: its sides are the same colour under the fixed upper-left light.
        this.frame.ctx.save(); this.frame.ctx.globalAlpha = 0.14; this.polygon(left, this.frame.theme.fg);
        this.frame.ctx.globalAlpha = 0.25; this.polygon(right, this.frame.theme.fg); this.frame.ctx.restore();
      }
    });
  }
  prism(x: number, y: number, z: number, width: number, depth: number, height: number) {
    const shades = this.colors.clay;
    this.add(x + y + (width + depth) / 2, () => {
      const peakA = this.project(x + width / 2, y, z + height), peakB = this.project(x + width / 2, y + depth, z + height);
      this.polygon([this.project(x, y, z), peakA, peakB, this.project(x, y + depth, z)], shades.top);
      this.polygon([peakA, this.project(x + width, y, z), this.project(x + width, y + depth, z), peakB], shades.right);
      this.polygon([this.project(x, y + depth, z), this.project(x + width, y + depth, z), peakB], shades.left);
    });
  }
  cylinder(x: number, y: number, z: number, radius: number, height: number, color = 'teal') {
    if (height <= 0) return;
    const shades = this.colors[color] ?? this.colors.clay;
    this.add(x + y + z * 0.002, () => {
      const ring = (level: number) => Array.from({ length: 12 }, (_, index) => this.project(x + Math.cos(index * Math.PI / 6) * radius, y + Math.sin(index * Math.PI / 6) * radius, level));
      const top = ring(z + height), bottom = ring(z);
      for (let index = 0; index < 6; index++) this.polygon([bottom[index], bottom[index + 1], top[index + 1], top[index]], index < 3 ? shades.right : shades.left);
      this.polygon(top, shades.top);
    });
  }
  shadow(x: number, y: number, width = 1, depth = 0.5, lift = 0) {
    this.add(-5000 + x + y, () => {
      const point = this.project(x, y, 0.02), { ctx, theme } = this.frame;
      const shrink = 1 / (1 + lift * 0.6);
      ctx.save(); ctx.globalAlpha = 0.13 * shrink; ctx.fillStyle = theme.fg;
      ctx.beginPath(); ctx.ellipse(point.x, point.y, width * this.unit * shrink, depth * this.unit * 0.5 * shrink, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    });
  }
  /** BIT, the cube robot: an ink body, a screen face with two eyes and an accent antenna bulb, so it never reads as the
   * accent-coloured story object it carries. `lift` raises it for hops; `active` lights the bulb when BIT is the subject. */
  bit(x: number, y: number, active = false, lift = 0) {
    const bob = Math.sin(this.frame.t * 5 + x) * 0.035 + lift;
    this.shadow(x + 0.3, y + 0.3, 0.55, 0.5, lift);
    this.box(x + 0.1, y + 0.3, lift, 0.16, 0.22, 0.22, 'ink');
    this.box(x + 0.42, y + 0.3, lift, 0.16, 0.22, 0.22, 'ink');
    this.box(x, y, 0.18 + bob, 0.66, 0.58, 0.63, 'bit');
    this.box(x + 0.29, y + 0.25, 0.81 + bob, 0.08, 0.08, 0.2, 'ink');
    this.add(x + y + 1.1, () => {
      const { ctx, theme } = this.frame, point = (dx: number, dz: number) => this.project(x + dx, y + 0.585, dz + bob);
      // The visor sits on the front face; the eyes blink about once every three seconds.
      const dark = theme.mode === 'dark';
      this.polygon([point(0.07, 0.36), point(0.59, 0.36), point(0.59, 0.66), point(0.07, 0.66)], dark ? theme.bg : theme.panel);
      const blink = Math.sin(this.frame.t * 2.2 + x) > 0.97, eye = this.unit * 0.075;
      ctx.fillStyle = theme.fg;
      [0.2, 0.46].forEach(dx => { const center = point(dx, 0.51); ctx.fillRect(center.x - eye / 2, center.y - (blink ? eye * 0.15 : eye * 0.65), eye, blink ? eye * 0.3 : eye * 1.3); });
      const bulb = this.project(x + 0.33, y + 0.29, 1.07 + bob);
      ctx.fillStyle = active ? theme.accent : theme.dim;
      ctx.beginPath(); ctx.arc(bulb.x, bulb.y, this.unit * 0.09, 0, Math.PI * 2); ctx.fill();
    });
  }
  /** ADA, the builder; `crowd` draws the smaller cap-less crowd figure. `arm` swings her working arm (0..1). */
  ada(x: number, y: number, crowd = false, lift = 0, arm = 0) {
    const step = Math.floor(this.frame.t * 6) % 4, size = crowd ? 0.65 : 1;
    this.shadow(x + 0.2, y + 0.2, 0.38 * size, 0.5, lift);
    this.box(x, y, 0.25 * size + lift, 0.42 * size, 0.36 * size, 0.55 * size, 'teal');
    this.box(x + 0.04, y + 0.02, 0.8 * size + lift, 0.34 * size, 0.32 * size, 0.32 * size, 'clay');
    if (!crowd) {
      this.box(x - 0.03, y - 0.04, 1.09 + lift, 0.48, 0.42, 0.12, 'clay');
      this.cylinder(x + 0.48, y + 0.16, 0.5 + lift + arm * 0.3, 0.13, 0.14, 'teal');
    }
    this.box(x, y + (step === 1 ? 0.07 : 0), lift, 0.14 * size, 0.25 * size, 0.25 * size, 'ink');
    this.box(x + 0.27 * size, y + (step === 3 ? 0.07 : 0), lift, 0.14 * size, 0.25 * size, 0.25 * size, 'ink');
  }
  /** A server rack; `lit` (0..1) switches its five lights on bottom-up, in the accent when `active`. */
  rack(x: number, y: number, height = 2.3, active = false, lit = 1) {
    this.shadow(x + 0.55, y + 0.55, 0.8);
    this.box(x, y, 0, 0.85, 0.75, height, 'teal');
    for (let index = 0; index < 5; index++) {
      const on = index < lit * 5;
      if (on) this.add(x + y + 1, () => {
        const point = this.project(x + 0.2, y + 0.77, 0.27 + index * height / 6);
        this.frame.ctx.fillStyle = active ? this.frame.theme.accent : this.frame.theme.panel;
        this.frame.ctx.beginPath(); this.frame.ctx.arc(point.x, point.y, this.unit * 0.025, 0, Math.PI * 2); this.frame.ctx.fill();
      });
    }
  }
  ground(radius = 2.6) { this.box(-radius, -radius, -0.35, radius * 2, radius * 2, 0.35, 'ground'); }
  road(from = -2.4, to = 2.2) { for (let x = from; x <= to; x += 1) this.box(x, 0.5, 0.01, 0.7, 0.4, 0.035, 'clay'); }
  flush() { this.queue.sort((left, right) => left.depth - right.depth || left.order - right.order).forEach(item => item.draw()); this.queue = []; }
}

/** A recurring place, large enough to read on a phone. Buildings stand from frame zero and settle in. */
export function establish(frame: Frame, place: Place = 'SERVER CITY', unit = 84, origin = { x: 540, y: 905 }) {
  const world = new World(frame, origin, unit);
  world.ground(); world.road();
  const settle = (index: number) => 1 + (1 - ease.outBack(clamp((frame.t - index * 0.06) / 0.3))) * 0.25;
  if (place === 'SERVER CITY') {
    [[-2.3, -2.2], [-0.8, -2.4], [0.9, -2.1]].forEach(([x, y], index) => world.rack(x, y, (1.7 + index * 0.4) * settle(index)));
  } else if (place === 'THE LAB') {
    world.box(-2.2, -2.2, 0, 3, 1.8, 1.3 * settle(0)); world.prism(-2.4, -2.4, 1.3 * settle(0), 3.4, 2.2, 0.8);
    world.cylinder(1.4, -1.2, 0, 0.5, 1.4 * settle(1)); world.cylinder(1.4, -1.2, 1.4 * settle(1), 0.2, 0.5);
  } else if (place === 'CAPITOL') {
    world.box(-2.2, -2.2, 0, 4, 2, 0.3); world.prism(-2.3, -2.2, 1.8 * settle(0), 4.2, 2.1, 0.9);
    for (let index = 0; index < 4; index++) world.cylinder(-1.7 + index * 1.05, -0.55, 0.3, 0.2, 1.5 * settle(index), 'clay');
  } else if (place === 'THE MARKET') {
    for (let index = 0; index < 2; index++) { world.box(-2.2 + index * 2.3, -1.9, 0, 1.4, 1.1, 0.9 * settle(index)); world.prism(-2.3 + index * 2.3, -2, 0.9 * settle(index), 1.6, 1.3, 0.5); }
  } else {
    world.box(-2.6, -2.6, 0.02, 5.2, 1.3, 0.06, 'teal');
    for (let index = 0; index < 3; index++) world.box(-1.9 + index * 1.4, -1.1, 0, 1.1, 0.9, (0.7 + index * 0.25) * settle(index));
  }
  return world;
}
