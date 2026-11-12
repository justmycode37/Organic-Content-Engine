// Hedgy, the mascot: a slim, upright hedgehog in clean pixel art (ART = 6 device
// px per art pixel). Body parts are cached sprites animated with float
// transforms, so motion is sub-pixel smooth and poses blend instead of popping.
import { ART, drawSprite, makeSprite, type Sprite } from '../kit/sprite.ts';
import type { Cue } from '../core.ts';

export type HedgyPose =
  | 'idle' | 'walk' | 'run' | 'jump' | 'shock' | 'celebrate' | 'point' | 'think'
  | 'push' | 'carry' | 'fall' | 'curl' | 'roll' | 'peek' | 'sweat' | 'sleep' | 'wave-off'
  | 'give' | 'receive' | 'hold' | 'smug' | 'lookup' | 'tap' | 'empty' | 'panic' | 'squeezed';
export const HEDGY_POSES: readonly HedgyPose[] = ['idle', 'walk', 'run', 'jump', 'shock', 'celebrate', 'point', 'think', 'push', 'carry', 'fall', 'curl', 'roll', 'peek', 'sweat', 'sleep', 'wave-off', 'give', 'receive', 'hold', 'smug', 'lookup', 'tap', 'empty', 'panic', 'squeezed'];
export type HedgyLook = 'camera' | 'forward' | 'up' | 'down';
export type HedgyExpression = 'happy' | 'worried' | 'shocked' | 'smug' | 'determined' | 'sad' | 'neutral';
/** Legacy field; props are now drawn by the shot at `hedgyPaw()`. */
export type HedgyProp = 'coin' | 'sign' | 'phone' | 'umbrella' | 'briefcase' | 'magnifier' | 'none';

export interface HedgyOptions {
  /** Centre of the feet, device px (floats). */
  x: number;
  /** Feet baseline, device px. He is ~350 px tall at scale 1. */
  y: number;
  /** 1 (default, recommended) = ART 6 px per art pixel. Legacy values > 2.5 are mapped down. */
  scale?: number;
  /** Seconds since this pose began. */
  t?: number;
  pose: HedgyPose;
  facing?: 1 | -1;
  look?: HedgyLook;
  /** Defaults to the natural expression of the pose. */
  expression?: HedgyExpression;
  prop?: HedgyProp;
  /** Extra vertical squash/stretch (1 = neutral), volume preserving. */
  squash?: number;
  /** Front paw reaches for this device-space point; `reach` 0..1 blends it in. */
  handTarget?: { x: number; y: number };
  reach?: number;
  /** Blend from a previous pose: `mix` 0..1 (use `hedgyAt` to fill these in). */
  from?: HedgyPose; fromT?: number; fromExpression?: HedgyExpression; mix?: number;
  /** Soft ground shadow under the feet. */
  shadow?: boolean;
  /** Which animal. Default 'hedgy'. The supporting cast shares Hedgy's rig, poses and helpers. */
  species?: SpeciesId;
  accessory?: Accessory;
}
export type SpeciesId = 'hedgy' | 'hedgehog' | 'hedgehog2' | 'fox' | 'badger' | 'owl' | 'raccoon' | 'rabbit' | 'rabbit2' | 'rabbit3' | 'mouse';
export const SPECIES_IDS: readonly SpeciesId[] = ['hedgy', 'hedgehog', 'hedgehog2', 'fox', 'badger', 'owl', 'raccoon', 'rabbit', 'rabbit2', 'rabbit3', 'mouse'];
export type Accessory = 'none' | 'tie' | 'glasses' | 'tie+glasses' | 'cap' | 'scarf' | 'visor';

export interface HedgyBounds { x: number; y: number; width: number; height: number; left: number; top: number; right: number; bottom: number }
/** Standing height in device px at scale 1 (feet to quill tips). */
export const HEDGY_HEIGHT = 320;

/** Action landmarks are shared by drawing and cue generation. */
export const HEDGY_TIMING = {
  idle: { loop: 2.4, blink: 1.8 },
  walk: { loop: 0.82, step: 0.41 },
  run: { loop: 0.46, step: 0.23 },
  jump: { anticipate: 0.18, launch: 0.42, apex: 0.68, land: 1.03, settle: 1.42, duration: 1.5 },
  shock: { burst: 0.11, recoil: 0.28, settle: 0.86, duration: 1.08 },
  celebrate: { loop: 0.74 },
  point: { gesture: 0.24, hold: 0.8, duration: 1.15 },
  think: { loop: 1.8, tick: 0.62 },
  push: { loop: 0.9, effort: 0.3 },
  carry: { loop: 0.84 },
  fall: { tip: 0.2, tumble: 0.64, land: 0.78, duration: 1.28 },
  curl: { tuck: 0.3, hold: 0.72, duration: 1.05 },
  roll: { loop: 0.58, revolution: 0.58 },
  peek: { rise: 0.42, hold: 0.9, duration: 1.3 },
  sweat: { loop: 1.4, drop: 0.72 },
  sleep: { loop: 3.2 },
  'wave-off': { loop: 1.05, shrug: 0.45 },
} as const;

type Canvas2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Point = { x: number; y: number };

// ---------------------------------------------------------------------------
// Pixel art. Everything is authored on an art-pixel grid (1 unit = ART device
// px), origin at the centre of the feet, +x forward (he faces right), +y down.
// ---------------------------------------------------------------------------
// Palette slots: O outline, Q coat, QL coat light, S face/limb fur, SD its shade, C belly/muzzle, K black, W white,
// QM coat dark, T tip/accent, P pink, R red, B blue, G gold, D dark limbs/markings.
const O = 1, Q = 2, QL = 3, S = 4, SD = 5, C = 6, K = 7, W = 8, QM = 9, T = 10, P = 11, R = 12, B = 13, G = 14, D = 15;
const pal = (q: string, ql: string, s: string, sd: string, c: string, qm: string, t: string, d = '#2B2C33') =>
  ['', '#1E120B', q, ql, s, sd, c, '#17110E', '#FFFFFF', qm, t, '#EC9AA0', '#DD4B45', '#346AAE', '#F2B93B', d] as const;
interface Anchors { eye: [number, number]; mouth: [number, number] | null; eyeStyle?: 'dark' | 'white' | 'owl' }
interface Species {
  id: SpeciesId; pal: readonly string[]; size: number; wide?: number; quills: boolean; collar?: boolean;
  arm?: number; armWidth?: number; leg?: number; accessory?: Accessory;
  head(g: Grid, len: number): Anchors; tail?(g: Grid): void;
}
let SP: Species, ACC: Accessory = 'none';

class Grid {
  readonly data: Uint8Array;
  constructor(readonly cols: number, readonly rows: number, readonly ox: number, readonly oy: number) { this.data = new Uint8Array(cols * rows); }
  get(x: number, y: number) { const cx = x + this.ox, cy = y + this.oy; return cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows ? 0 : this.data[cy * this.cols + cx]!; }
  set(x: number, y: number, c: number) { const cx = x + this.ox, cy = y + this.oy; if (cx >= 0 && cy >= 0 && cx < this.cols && cy < this.rows) this.data[cy * this.cols + cx] = c; }
  /** Fill every cell whose centre satisfies `inside`; `only` restricts to cells currently holding one of those colours. */
  fill(inside: (x: number, y: number) => boolean, c: number, only?: number[]) {
    for (let cy = 0; cy < this.rows; cy++) for (let cx = 0; cx < this.cols; cx++) {
      const x = cx - this.ox + 0.5, y = cy - this.oy + 0.5;
      if (!inside(x, y)) continue;
      if (only && !only.includes(this.data[cy * this.cols + cx]!)) continue;
      this.data[cy * this.cols + cx] = c;
    }
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: number, only?: number[]) { this.fill((x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1, c, only); }
  tri(a: Point, b: Point, p: Point, c: number, only?: number[]) {
    const sign = (u: Point, v: Point, x: number, y: number) => (x - v.x) * (u.y - v.y) - (u.x - v.x) * (y - v.y);
    this.fill((x, y) => { const d1 = sign(a, b, x, y), d2 = sign(b, p, x, y), d3 = sign(p, a, x, y); return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)); }, c, only);
  }
  line(a: Point, b: Point, width: number, c: number, only?: number[]) {
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy || 1, r = width / 2;
    this.fill((x, y) => { const u = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2)), px = a.x + dx * u - x, py = a.y + dy * u - y; return px * px + py * py <= r * r; }, c, only);
  }
  rect(x: number, y: number, w: number, h: number, c: number, only?: number[]) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (!only || only.includes(this.get(x + i, y + j))) this.set(x + i, y + j, c); }
  /** One art-pixel dark outline around the silhouette. */
  outline(c = O) {
    const add: number[] = [];
    for (let cy = 0; cy < this.rows; cy++) for (let cx = 0; cx < this.cols; cx++) {
      if (this.data[cy * this.cols + cx]) continue;
      const x = cx - this.ox, y = cy - this.oy;
      if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) add.push(cy * this.cols + cx);
    }
    for (const i of add) this.data[i] = c;
  }
  sprite(key: string): Sprite {
    const pal_ = SP.pal;
    return makeSprite(`critter1:${SP.id}:${ACC}:${key}`, this.cols, this.rows, ctx => {
      for (let cy = 0; cy < this.rows; cy++) for (let cx = 0; cx < this.cols; cx++) {
        const c = this.data[cy * this.cols + cx]!;
        if (!c) continue;
        ctx.fillStyle = pal_[c]!;
        ctx.fillRect(cx, cy, 1, 1);
      }
    });
  }
}

/** A quill: a slim spine, dark at the base with a pale tip, like the real thing. */
function quill(g: Grid, bx: number, by: number, angle: number, length: number, half: number) {
  const dx = Math.cos(angle), dy = Math.sin(angle), nx = -dy, ny = dx;
  const a = { x: bx + nx * half, y: by + ny * half }, b = { x: bx - nx * half, y: by - ny * half }, tip = { x: bx + dx * length, y: by + dy * length };
  g.tri(a, b, tip, Q);
  const upper = a.y < b.y ? a : b, mid = { x: bx, y: by };
  g.tri(upper, mid, tip, QL, [Q]);
  const cut = { x: bx + dx * length * 0.62, y: by + dy * length * 0.62 };
  g.fill((x, y) => (x - cut.x) * dx + (y - cut.y) * dy > 0, T, [Q, QL]);
}
/** Regular rows of short pale strokes: a groomed coat of spines, never noise. */
function coat(g: Grid, region: (x: number, y: number) => boolean) {
  const mod = (n: number, m: number) => ((n % m) + m) % m;
  g.fill((x, y) => { const cx = Math.floor(x), cy = Math.floor(y); return region(x, y) && (mod(cx + cy * 3, 7) === 0 || mod(cx + 1 + (cy + 1) * 3, 7) === 0); }, QL, [Q]);
}

const SPIKE_LENGTH = [4.6, 7.5, 10.5] as const;
const sprites = new Map<string, Sprite>();
const cached = (name: string, build: () => Sprite) => { const key = `${SP.id}:${ACC}:${name}`; let s = sprites.get(key); if (!s) { s = build(); sprites.set(key, s); } return s; };

// Torso: slim upright egg, quilled back, cream belly. Origin = feet centre.
const TORSO = { cols: 60, rows: 46, ox: 40, oy: 44 };
function torsoSprite(spike: 0 | 1 | 2): Sprite {
  return cached(`torso${spike}`, () => {
    const g = new Grid(TORSO.cols, TORSO.rows, TORSO.ox, TORSO.oy), len = SPIKE_LENGTH[spike];
    // pear-shaped body leaning forward on the hind legs
    const body = (x: number, y: number) => ((x + 1) / 12) ** 2 + ((y + 15) / 11.5) ** 2 <= 1 || ((x - 3) / 9.2) ** 2 + ((y + 24.5) / 9.5) ** 2 <= 1;
    if (SP.quills) {
      // a dense fringe of small spines along the whole back
      for (let y = -33; y <= -5; y += 2.6) {
        let x = -24; while (x < 10 && !body(x + 0.5, y)) x += 0.25;
        if (x >= 10) continue;
        const u = (y + 33) / 28, angle = -2.5 - u * 1.1;
        quill(g, x + 1.6, y, angle, len, 2);
      }
      g.fill(body, Q);
      coat(g, (x, y) => body(x, y));
    } else {
      SP.tail?.(g);
      g.fill(body, Q);
      g.fill((x, y) => body(x, y) && !body(x - 2, y - 2.4), QL, [Q]);
      g.fill((x, y) => body(x, y) && !body(x - 1.4, y + 2.6), QM, [Q]);
    }
    // pale furry belly
    const belly = (x: number, y: number) => ((x - 5.5) / 7.6) ** 2 + ((y + 17) / 11.5) ** 2 <= 1;
    g.fill((x, y) => body(x, y) && belly(x, y), C);
    g.fill((x, y) => body(x, y) && belly(x, y) && !belly(x + 1.4, y - 1.2), S, [C]);
    if (ACC === 'tie' || ACC === 'tie+glasses') { g.rect(8, -32, 4, 2, R); g.tri({ x: 8.4, y: -30 }, { x: 12.4, y: -30 }, { x: 10.4, y: -20 }, R); g.rect(10, -29, 1, 6, T, [R]); }
    if (ACC === 'scarf') { g.fill((x, y) => body(x, y) && y < -29.5, R); g.rect(9, -30, 3, 7, R); g.rect(9, -25, 3, 1, W, [R]); }
    g.outline();
    return g.sprite(`torso${spike}`);
  });
}

// Head: quill hood with a forehead tuft, tan face, pointed snout, big eyes. Origin = head centre.
const HEAD = { cols: 46, rows: 54, ox: 22, oy: 36 };
type Eyes = 'open' | 'wide' | 'half' | 'closed' | 'sad';
type Brow = 'none' | 'worried' | 'angry' | 'raised';
type Mouth = 'smile' | 'flat' | 'frown' | 'open' | 'smirk' | 'grit';
interface Face { eyes: Eyes; brow: Brow; mouth: Mouth }
const FACES: Record<HedgyExpression, Face> = {
  neutral: { eyes: 'open', brow: 'none', mouth: 'flat' },
  happy: { eyes: 'open', brow: 'none', mouth: 'smile' },
  smug: { eyes: 'half', brow: 'none', mouth: 'smirk' },
  worried: { eyes: 'open', brow: 'worried', mouth: 'frown' },
  shocked: { eyes: 'wide', brow: 'raised', mouth: 'open' },
  determined: { eyes: 'open', brow: 'angry', mouth: 'grit' },
  sad: { eyes: 'sad', brow: 'worried', mouth: 'frown' },
};
const LOOK: Record<HedgyLook, [number, number]> = { camera: [0, 0], forward: [1, 0], up: [0, -1], down: [0, 1] };

function headSprite(expression: HedgyExpression, look: HedgyLook, blink: boolean, spike: 0 | 1 | 2): Sprite {
  const key = `head:${expression}:${look}:${blink ? 1 : 0}:${spike}`;
  return cached(key, () => {
    const g = new Grid(HEAD.cols, HEAD.rows, HEAD.ox, HEAD.oy), len = SPIKE_LENGTH[spike], face = FACES[expression];
    const anchors = SP.head(g, len), [ex, ey] = anchors.eye, style = anchors.eyeStyle ?? 'dark';
    // eyes
    const [lx, ly] = LOOK[look], closed = blink || face.eyes === 'closed';
    if (style === 'owl') {
      g.ellipse(ex + 1.5, ey + 2, 4.7, 4.7, W);
      if (closed) g.rect(ex - 2, ey + 2, 7, 1, K);
      else { const r = face.eyes === 'wide' ? 1.6 : 2.5; g.ellipse(ex + 2 + lx, ey + 2 + ly, r, r, K); g.set(ex + 1 + lx, ey + 1 + ly, W); if (face.eyes === 'half' || face.eyes === 'sad') g.rect(ex - 3, ey - 3, 9, 3, SD, [W, K]); }
    } else if (closed) g.rect(ex, ey + 2, 3, 1, style === 'white' ? W : K);
    else if (face.eyes === 'wide' || style === 'white') {
      const big = face.eyes === 'wide' ? 1 : 0;
      g.rect(ex - big, ey - big, 3 + big * 2, 4 + big * 2, W);
      g.rect(ex + 1 + Math.max(0, lx), ey + 1 + ly, 2, 2, K);
      if (face.eyes === 'half') g.rect(ex, ey, 3, 1, K);
    } else {
      g.rect(ex + lx, ey + ly, 3, 4, K);
      g.set(ex + lx, ey + ly, W);
      if (face.eyes === 'half') { g.rect(ex + lx, ey + ly, 3, 2, S); g.rect(ex + lx - 1, ey + ly + 1, 5, 1, K); }
      if (face.eyes === 'sad') { g.rect(ex + lx, ey + ly, 3, 1, S); g.set(ex + lx, ey + ly + 1, K); }
    }
    // brow
    const ink = style === 'white' ? W : K;
    if (face.brow === 'worried') { g.rect(ex - 2, ey - 3, 2, 1, ink); g.rect(ex, ey - 4, 3, 1, ink); }
    if (face.brow === 'angry') { g.rect(ex - 1, ey - 4, 2, 1, ink); g.rect(ex + 1, ey - 3, 3, 1, ink); g.set(ex + 4, ey - 2, ink); }
    if (face.brow === 'raised') g.rect(ex - 1, ey - 5, 5, 1, ink);
    // mouth, on the lower jaw
    if (anchors.mouth) {
      const m = face.mouth, [mx, my] = anchors.mouth;
      if (m === 'smile') { g.set(mx - 1, my - 1, K); g.rect(mx, my, 4, 1, K); }
      if (m === 'flat') g.rect(mx, my, 4, 1, K);
      if (m === 'frown') { g.set(mx - 1, my + 1, K); g.rect(mx, my, 4, 1, K); }
      if (m === 'smirk') { g.rect(mx, my, 3, 1, K); g.set(mx - 1, my - 1, K); g.set(mx - 2, my - 2, K); }
      if (m === 'open') { g.rect(mx, my - 1, 3, 3, K); g.set(mx + 1, my + 1, P); }
      if (m === 'grit') { g.rect(mx - 1, my, 5, 1, K); g.rect(mx, my - 1, 3, 1, W); }
    }
    if (ACC === 'glasses' || ACC === 'tie+glasses') { g.rect(ex - 2, ey - 2, 7, 1, K); g.rect(ex - 2, ey + 5, 7, 1, K); g.rect(ex - 2, ey - 2, 1, 8, K); g.rect(ex + 4, ey - 2, 1, 8, K); g.rect(ex - 9, ey, 7, 1, K); }
    if (ACC === 'cap' || ACC === 'visor') { if (ACC === 'cap') g.fill((x, y) => ((x + 1) / 11.5) ** 2 + (y / 10.5) ** 2 <= 1 && y < -5.5, B); g.rect(-2, -7, 16, 2, B); g.rect(-2, -6, 16, 1, D, [B]); }
    g.outline();
    // no collar line where the hood meets the back
    if (SP.collar === false) for (let y = 8; y < 18; y++) for (let x = -22; x <= 1; x++) if (g.get(x, y) === O && y >= 9 + Math.max(0, -8 - x) * 0.5) g.set(x, y, 0);
    return g.sprite(key);
  });
}

// Limbs. Origin = joint (shoulder / hip) at the top centre.
const ARM_LENGTH = 9;
function armSprite(rear: boolean): Sprite {
  return cached(`arm${rear ? 'R' : 'F'}`, () => {
    const g = new Grid(11, 18, 5, 3), base = SP.arm ?? S, fur = rear ? (base === S ? SD : QM) : base, w = SP.armWidth ?? 2.1;
    g.ellipse(0, 0, w, w, fur);
    g.fill((x, y) => Math.abs(x) <= w - y * 0.05 && y >= 0 && y <= ARM_LENGTH - 1, fur);
    g.ellipse(0, ARM_LENGTH, w + 0.3, w + 0.3, fur);
    if (base === S) g.fill((x, y) => x < -0.9 && y > 0 && y < ARM_LENGTH, rear ? QM : SD, [fur]);
    g.outline(QM);
    g.set(-2, ARM_LENGTH + 2, K); g.set(0, ARM_LENGTH + 3, K); g.set(2, ARM_LENGTH + 2, K);
    return g.sprite(`arm${rear ? 'R' : 'F'}`);
  });
}
function legSprite(rear: boolean): Sprite {
  return cached(`leg${rear ? 'R' : 'F'}`, () => {
    const g = new Grid(14, 12, 4, 1), legBase = SP.leg ?? S, skin = rear && legBase === S ? SD : legBase;
    g.rect(-2, 0, 4, 7, skin);
    g.fill((x, y) => x >= -2 && x <= 5.6 && y >= 6 && y <= 9 && (x < 3.6 || y > 7), skin);
    g.set(5, 8, K); g.set(3, 8, K);
    g.outline();
    return g.sprite(`leg${rear ? 'R' : 'F'}`);
  });
}
// Curled ball for curl/roll. Origin = ball centre.
function ballSprite(): Sprite {
  return cached('ball', () => {
    const g = new Grid(48, 48, 24, 24);
    if (SP.quills) for (let i = 0; i < 26; i++) { const a = (i / 26) * Math.PI * 2 + 0.12; quill(g, Math.cos(a) * 13, Math.sin(a) * 13, a, 5.5, 2.1); }
    g.ellipse(0, 0, 14.5, 14.5, Q);
    if (SP.quills) coat(g, (x, y) => x * x + y * y <= 14.5 ** 2);
    g.ellipse(5.5, 3, 6.5, 5.5, S);
    g.rect(3, 2, 3, 1, K); g.rect(8, 2, 2, 1, K); g.rect(10, 4, 2, 2, K);
    g.outline();
    return g.sprite('ball');
  });
}

// ---------------------------------------------------------------------------
// The cast. Every animal shares Hedgy's rig; a species is a palette, a head
// painter (cranium, ears, snout, markings) and an optional tail.
// ---------------------------------------------------------------------------
const hoodShape = (x: number, y: number) => ((x + 1) / 11.5) ** 2 + (y / 10.5) ** 2 <= 1;
function hedgehogHead(g: Grid, len: number): Anchors {
  const hood = (x: number, y: number) => ((x + 1) / 11.5) ** 2 + (y / 10.5) ** 2 <= 1;
  for (let deg = 150; deg <= 292; deg += 15.5) { const a = deg * Math.PI / 180; quill(g, Math.cos(a) * 9.6 - 1, Math.sin(a) * 8.8, a - 0.12, len + 0.6, 2.1); }
  g.fill(hood, Q);
  coat(g, hood);
  // ear, tucked in the hairline
  g.ellipse(-2.6, -6.6, 4.1, 4.1, O); g.ellipse(-2.6, -6.6, 3.1, 3.1, S); g.ellipse(-2.3, -6.2, 1.6, 1.6, SD, [S]);
  // face + snout
  const faceShape = (x: number, y: number) => ((x - 3.6) / 9.6) ** 2 + ((y - 2.4) / 8.4) ** 2 <= 1;
  g.fill((x, y) => faceShape(x, y) && (hood(x, y) || x > 0), S);
  g.tri({ x: 8, y: -2.4 }, { x: 21.5, y: 2.6 }, { x: 6, y: 9.6 }, S);
  // darker bridge along the top of the muzzle
  g.fill((x, y) => x > 9 && y < -2.4 + (x - 8) * 0.37 + 1.5, SD, [S]);
  g.fill((x, y) => y > 7.4 + Math.max(0, 6 - x) * 0.4, C, [S]);
  // nose
  g.rect(19, 1, 3, 3, K); g.set(19, 1, W);
  g.rect(2, 4, 2, 1, SD);
  return { eye: [5, -3], mouth: [9, 6] };
}
/** Generic furry head: cranium + pointed snout with a pale lower jaw. */
function furHead(g: Grid, o: { snout?: number; muzzle?: number; nose?: number; face?: number } = {}) {
  const tip = o.snout ?? 21, face = o.face ?? Q;
  g.fill(hoodShape, face);
  g.tri({ x: 7, y: -3 }, { x: tip, y: 3 }, { x: 6, y: 9.6 }, face);
  g.fill((x, y) => hoodShape(x, y) && !hoodShape(x - 2, y - 2.4) && x < 4, QL, [Q]);
  g.fill((x, y) => x > -3 && y > 2.6 + Math.max(0, 6 - x) * 0.8, o.muzzle ?? C, [face]);
  g.rect(tip - 2, 1, 3, 3, o.nose ?? K); g.set(tip - 2, 1, W);
}
const SPECIES: Record<SpeciesId, Species> = {
  hedgy: { id: 'hedgy', pal: pal('#553621', '#8A603B', '#D9B78C', '#B58B5F', '#EEDDC0', '#6F4A2C', '#E3C79C'), size: 1, quills: true, collar: false, head: hedgehogHead },
  hedgehog: { id: 'hedgehog', pal: pal('#4B4640', '#7F786F', '#D5CABB', '#AFA392', '#ECE6DA', '#625B54', '#E8E1D4'), size: 0.96, quills: true, collar: false, head: hedgehogHead },
  hedgehog2: { id: 'hedgehog2', pal: pal('#6A3A2B', '#A2644A', '#E3C0A0', '#C19A78', '#F2E2CC', '#84503B', '#EFD3B4'), size: 1.02, quills: true, collar: false, head: hedgehogHead },
  fox: {
    id: 'fox', pal: pal('#D9722E', '#F09A52', '#D9722E', '#B25A22', '#F6EEDC', '#B25A22', '#F6EEDC', '#3A2A20'), size: 1.07, quills: false, arm: D, leg: D,
    head(g) {
      g.tri({ x: -8, y: -5 }, { x: -1, y: -9 }, { x: -6, y: -20 }, Q); g.tri({ x: -6, y: -7 }, { x: -3, y: -9 }, { x: -5.6, y: -16 }, D);
      g.tri({ x: 0, y: -9 }, { x: 7, y: -6 }, { x: 5, y: -19 }, Q); g.fill((x, y) => y < -14.5, D, [Q]);
      furHead(g, { snout: 22 });
      g.tri({ x: -9, y: 3 }, { x: -2, y: 4 }, { x: -9, y: 10 }, C);
      return { eye: [5, -3], mouth: [9, 6] };
    },
    tail(g) { g.line({ x: -9, y: -8 }, { x: -22, y: -19 }, 10, Q); g.ellipse(-22.5, -19.5, 5, 5, C); },
  },
  badger: {
    id: 'badger', pal: pal('#8A8D9B', '#B9BBC6', '#F4F4F6', '#C9CAD3', '#3D3F4A', '#5A5D6B', '#F4F4F6'), size: 1.03, wide: 1.12, quills: false, arm: D, leg: D,
    head(g) {
      g.ellipse(-4, -8, 3.6, 3.6, D); g.ellipse(-3.8, -7.6, 1.6, 1.6, W);
      furHead(g, { face: S, muzzle: S });
      g.fill((x, y) => x > -13 && x < 17 && Math.abs(y - (-1.6 + x * 0.14)) < 2.9 - Math.max(0, x - 6) * 0.2, D, [S]);
      g.fill((x, y) => hoodShape(x, y) && x < -7, Q, [S]);
      return { eye: [5, -3], mouth: [9, 6], eyeStyle: 'white' };
    },
    tail(g) { g.ellipse(-12, -7, 4, 2.8, QM); },
  },
  owl: {
    id: 'owl', pal: pal('#8A603B', '#B58B5F', '#EFE0BF', '#D3BC92', '#EFE0BF', '#6F4A2C', '#EFE0BF'), size: 1, wide: 1.08, quills: false, arm: Q, armWidth: 3.2, leg: G,
    head(g) {
      g.tri({ x: -9, y: -5 }, { x: -3, y: -9 }, { x: -10, y: -17 }, Q); g.tri({ x: 2, y: -9 }, { x: 8, y: -6 }, { x: 9, y: -16 }, Q);
      g.fill(hoodShape, Q);
      g.fill((x, y) => hoodShape(x, y) && !hoodShape(x - 2, y - 2.4) && x < 2, QL, [Q]);
      g.ellipse(4.5, 0.5, 8.6, 8.4, S); g.fill((x, y) => ((x - 4.5) / 8.6) ** 2 + ((y - 0.5) / 8.4) ** 2 > 0.72, SD, [S]);
      g.tri({ x: 11, y: 2.5 }, { x: 16.8, y: 5 }, { x: 11, y: 7.6 }, G);
      return { eye: [5, -3], mouth: null, eyeStyle: 'owl' };
    },
    tail(g) { g.tri({ x: -9, y: -9 }, { x: -3, y: -3 }, { x: -16, y: 0 }, QM); },
  },
  raccoon: {
    id: 'raccoon', pal: pal('#8A8D9B', '#B9BBC6', '#8A8D9B', '#5A5D6B', '#F4F4F6', '#5A5D6B', '#F4F4F6'), size: 1, quills: false, arm: D, leg: D,
    head(g) {
      g.tri({ x: -8, y: -5 }, { x: -2, y: -9 }, { x: -7, y: -16 }, Q); g.tri({ x: -6.5, y: -7 }, { x: -3.5, y: -9 }, { x: -6.4, y: -13 }, W);
      g.tri({ x: 0, y: -9 }, { x: 6, y: -6.5 }, { x: 4.5, y: -15 }, Q);
      furHead(g);
      g.ellipse(4, -6.2, 6.5, 2, C, [Q, QL]);
      g.fill((x, y) => ((x - 5) / 7.2) ** 2 + ((y + 1.2) / 3.7) ** 2 <= 1, D, [Q, QL, C]);
      return { eye: [5, -3], mouth: [9, 6], eyeStyle: 'white' };
    },
    tail(g) {
      const a = { x: -9, y: -7 }, b = { x: -25, y: -15 };
      g.line(a, b, 9, Q); g.fill((x, y) => x < -11 && Math.floor((x - y * 0.5 + 60) / 3.2) % 2 === 0, D, [Q]);
    },
  },
  rabbit: rabbit('rabbit', 'up'), rabbit2: rabbit('rabbit2', 'flop'), rabbit3: rabbit('rabbit3', 'lop'),
  mouse: {
    id: 'mouse', pal: pal('#B9BBC6', '#E4E5EA', '#B9BBC6', '#8A8D9B', '#F6EEDC', '#8A8D9B', '#F6EEDC'), size: 0.78, quills: false,
    head(g) {
      g.ellipse(3.5, -11, 5.4, 5.4, QM);
      g.ellipse(-5, -9.5, 7, 7, Q); g.ellipse(-5, -9.5, 4.6, 4.6, P);
      furHead(g, { snout: 22, nose: P });
      return { eye: [5, -3], mouth: [9, 6] };
    },
    tail(g) { g.line({ x: -10, y: -5 }, { x: -20, y: -3 }, 2.2, P); g.line({ x: -20, y: -3 }, { x: -25, y: -10 }, 2.2, P); },
  },
};
function rabbit(id: SpeciesId, ears: 'up' | 'flop' | 'lop'): Species {
  return {
    id, pal: pal('#E4E5EA', '#FFFFFF', '#E4E5EA', '#B9BBC6', '#FFFFFF', '#B9BBC6', '#FFFFFF'), size: ears === 'lop' ? 0.94 : 1, quills: false,
    head(g) {
      const ear = (a: Pt2, b: Pt2) => { g.line(a, b, 6, Q); g.line({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 }, { x: a.x * 0.8 + b.x * 0.2, y: a.y * 0.8 + b.y * 0.2 }, 2.4, P); };
      if (ears === 'lop') { ear({ x: -9, y: -5 }, { x: -13, y: 12 }); }
      else { ear({ x: -4, y: -8 }, { x: -6, y: -30 }); if (ears === 'up') ear({ x: 2, y: -8 }, { x: 3, y: -29 }); else { g.line({ x: 2, y: -8 }, { x: 4, y: -19 }, 6, Q); g.line({ x: 4, y: -19 }, { x: 13, y: -16 }, 6, Q); } }
      furHead(g, { snout: 17, nose: P });
      g.rect(10, 7, 2, 2, W);
      return { eye: [5, -3], mouth: [7, 6] };
    },
    tail(g) { g.ellipse(-12.5, -9, 4, 4, C); },
  };
}
type Pt2 = { x: number; y: number };
SP = SPECIES.hedgy;

// ---------------------------------------------------------------------------
// Rig. Angles: 0 = limb hangs straight down, +PI/2 = points forward, PI = up.
// ---------------------------------------------------------------------------
interface Rig {
  dx: number; dy: number; rot: number; sx: number; sy: number;
  headX: number; headY: number; headRot: number;
  armF: number; armR: number; armFLen: number; armRLen: number;
  legF: number; legR: number; legFLift: number; legRLift: number;
  spike: number; ball: number; spin: number;
}
const NECK = { x: 4, y: -29 }, HEAD_CENTRE = { x: 7, y: -37 };
const SHOULDER_F = { x: 5, y: -23 }, SHOULDER_R = { x: 10, y: -24 };
const HIP_F = { x: -4, y: -8 }, HIP_R = { x: 3, y: -8 };
const TAU = Math.PI * 2;
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const smooth = (u: number) => { const v = clamp(u); return v * v * (3 - 2 * v); };
const outBack = (u: number) => { const v = clamp(u) - 1, s = 1.9; return 1 + v * v * ((s + 1) * v + s); };
const ramp = (t: number, a: number, b: number) => smooth((t - a) / Math.max(1e-6, b - a));

function baseRig(): Rig {
  return { dx: 0, dy: 0, rot: 0, sx: 1, sy: 1, headX: 0, headY: 0, headRot: 0, armF: 0.22, armR: 0.12, armFLen: 1, armRLen: 1, legF: 0, legR: 0, legFLift: 0, legRLift: 0, spike: 0, ball: 0, spin: 0 };
}

function poseRig(pose: HedgyPose, time: number): Rig {
  const t = Math.max(0, time), r = baseRig();
  const breath = Math.sin(t * TAU / 1.7);
  const breathe = (amount = 1) => { r.sy *= 1 + 0.012 * breath * amount; r.headY -= 0.35 * breath * amount; r.armF += 0.03 * breath * amount; };
  const stride = (loop: number, leg: number, arm: number, bounce: number, lean: number) => {
    const c = t * TAU / loop, s = Math.sin(c);
    r.legF = leg * s; r.legR = -leg * s;
    r.legFLift = Math.max(0, Math.cos(c)) * leg * 2.2; r.legRLift = Math.max(0, -Math.cos(c)) * leg * 2.2;
    r.armF = -arm * s + 0.2; r.armR = arm * s + 0.2;
    r.dy = -Math.abs(Math.cos(c)) * bounce; r.rot = lean; r.headRot = -lean * 0.5;
  };
  switch (pose) {
    case 'idle': breathe(); break;
    case 'walk': stride(HEDGY_TIMING.walk.loop, 0.5, 0.45, 0.7, 0.03); break;
    case 'run': stride(HEDGY_TIMING.run.loop, 0.95, 1.05, 1.5, 0.17); break;
    case 'panic': stride(0.4, 0.95, 0, 1.6, 0.12); r.armF = 2.75 + 0.22 * Math.sin(t * TAU / 0.2); r.armR = 2.9 - 0.22 * Math.sin(t * TAU / 0.2); r.spike = 0.6; break;
    case 'carry': stride(HEDGY_TIMING.carry.loop, 0.36, 0, 0.5, 0.02); r.armF = 1.3; r.armR = 1.42; break;
    case 'push': stride(HEDGY_TIMING.push.loop, 0.5, 0, 0.3, 0.24); r.armF = 1.42; r.armR = 1.55; r.armFLen = 1.12; r.armRLen = 1.12; break;
    case 'jump': {
      const J = HEDGY_TIMING.jump, crouch = ramp(t, 0, J.anticipate) * (1 - ramp(t, J.anticipate, J.launch));
      const air = clamp((t - J.launch) / (J.land - J.launch)), height = t > J.launch && t < J.land ? 4 * air * (1 - air) : 0;
      const landed = t >= J.land ? Math.exp(-(t - J.land) / 0.09) * Math.cos((t - J.land) * 26) : 0;
      r.sy = 1 - 0.16 * crouch + 0.08 * height - 0.14 * landed; r.sx = 1 + 0.1 * crouch - 0.05 * height + 0.1 * landed;
      r.dy = -15 * height; r.armF = lerp(0.22, 2.7, smooth(height * 1.6)) - 0.3 * crouch; r.armR = lerp(0.12, 2.85, smooth(height * 1.6)) - 0.3 * crouch;
      r.legF = -0.35 * height; r.legR = 0.4 * height;
      break;
    }
    case 'shock': {
      const S = HEDGY_TIMING.shock, pop = outBack(ramp(t, 0, S.recoil)), hop = t < S.settle ? Math.sin(clamp(t / S.recoil) * Math.PI) : 0;
      r.dx = -3 * pop; r.dy = -4.5 * hop; r.rot = -0.08 * pop; r.headRot = -0.1 * pop; r.sy = 1 + 0.05 * hop;
      r.armF = lerp(0.22, 2.25, pop); r.armR = lerp(0.12, 2.5, pop); r.spike = lerp(0, 1, ramp(t, 0, S.burst)) * (1 - 0.35 * ramp(t, S.settle, S.duration));
      break;
    }
    case 'celebrate': {
      const c = t * TAU / HEDGY_TIMING.celebrate.loop, hop = Math.abs(Math.sin(c / 2));
      r.dy = -5 * hop; r.sy = 1 + 0.05 * hop - 0.05 * (1 - hop); r.armF = 2.75 + 0.25 * Math.sin(c); r.armR = 2.9 - 0.25 * Math.sin(c); r.headRot = -0.08;
      r.legF = -0.25 * hop; r.legR = 0.25 * hop;
      break;
    }
    case 'point': { const u = outBack(ramp(t, 0, HEDGY_TIMING.point.gesture)); breathe(0.6); r.armF = lerp(0.22, 1.72, u); r.armFLen = lerp(1, 1.22, u); r.rot = 0.04 * u; break; }
    case 'give': { const u = outBack(ramp(t, 0, 0.22)); breathe(0.5); r.armF = lerp(0.22, 1.5, u); r.armFLen = lerp(1, 1.3, u); r.rot = 0.06 * u; r.headRot = 0.03 * u; break; }
    case 'receive': { const u = outBack(ramp(t, 0, 0.22)); breathe(0.5); r.armF = lerp(0.22, 1.3, u); r.armR = lerp(0.12, 1.4, u); r.armFLen = lerp(1, 1.2, u); r.rot = 0.04 * u; break; }
    case 'hold': { const u = outBack(ramp(t, 0, 0.2)); breathe(0.6); r.armF = lerp(0.22, 2.05, u); r.armFLen = lerp(1, 1.12, u); r.headRot = -0.05 * u; break; }
    case 'think': { const u = ramp(t, 0, 0.25); breathe(0.6); r.armF = lerp(0.22, 2.5, u); r.armFLen = lerp(1, 0.86, u); r.armR = lerp(0.12, 1.0, u); r.armRLen = 0.8; r.headRot = -0.09 * u + 0.03 * Math.sin(t * TAU / HEDGY_TIMING.think.loop); break; }
    case 'smug': { const u = ramp(t, 0, 0.22); breathe(0.6); r.rot = -0.05 * u; r.headRot = -0.1 * u; r.armF = lerp(0.22, 0.95, u); r.armFLen = lerp(1, 0.72, u); r.armR = lerp(0.12, 0.85, u); r.armRLen = lerp(1, 0.72, u); break; }
    case 'lookup': { const u = ramp(t, 0, 0.22); breathe(0.6); r.rot = -0.05 * u; r.headRot = -0.34 * u; r.armF = lerp(0.22, 0.45, u); break; }
    case 'tap': { breathe(0.5); const c = t * TAU / 0.44; r.legF = -0.42 * Math.max(0, Math.sin(c)); r.armF = 0.95; r.armFLen = 0.7; r.armR = 0.8; r.armRLen = 0.7; r.headRot = 0.04 * Math.sin(t * TAU / 1.76); break; }
    case 'empty': { const u = outBack(ramp(t, 0, 0.24)); breathe(0.5); r.armF = lerp(0.22, 1.25, u); r.armR = lerp(0.12, 1.05, u); r.armFLen = lerp(1, 1.1, u); r.headRot = 0.12 * u; r.headY = 1 * u; r.rot = 0.03 * u; break; }
    case 'sweat': { breathe(1.4); r.rot = 0.05; r.headRot = 0.08; r.headY += 1; r.armF = 0.7 + 0.12 * Math.sin(t * TAU / 0.5); r.armFLen = 0.8; r.armR = 0.6 - 0.12 * Math.sin(t * TAU / 0.5); r.armRLen = 0.8; break; }
    case 'wave-off': { const u = ramp(t, 0, HEDGY_TIMING['wave-off'].shrug); breathe(0.6); r.armF = lerp(0.22, 1.85, u) + 0.2 * Math.sin(t * TAU / 0.5) * u; r.armR = lerp(0.12, 1.95, u); r.headRot = -0.08 * u; r.dy = -1 * u; break; }
    case 'squeezed': { const u = outBack(ramp(t, 0, 0.18)); r.sy = lerp(1, 0.64, u); r.sx = lerp(1, 1.28, u); r.armF = lerp(0.22, 1.75, u); r.armR = lerp(0.12, 1.9, u); r.spike = 0.7 * u; break; }
    case 'fall': { const F = HEDGY_TIMING.fall, u = ramp(t, F.tip, F.land), land = t >= F.land ? Math.exp(-(t - F.land) / 0.08) : 0; r.rot = -1.45 * u; r.dx = -9 * u; r.dy = -3 * Math.sin(u * Math.PI) + 0.8 * land; r.armF = lerp(0.22, 2.4, u); r.armR = lerp(0.12, 2.7, u); r.legF = -0.5 * u; r.legR = 0.4 * u; break; }
    case 'peek': { const P = HEDGY_TIMING.peek, u = outBack(ramp(t, 0.05, P.rise)); r.dy = lerp(34, 0, u); r.headRot = -0.1 * u; break; }
    case 'sleep': { const slow = Math.sin(t * TAU / HEDGY_TIMING.sleep.loop); r.sy = 1 + 0.025 * slow; r.headRot = 0.24; r.headY = 1.5 - 0.5 * slow; r.armF = 0.1; break; }
    case 'curl': { r.ball = ramp(t, 0.06, HEDGY_TIMING.curl.tuck); r.sy = 1 - 0.1 * Math.sin(r.ball * Math.PI); break; }
    case 'roll': { r.ball = 1; r.spin = t * TAU / HEDGY_TIMING.roll.loop; r.dy = -0.6 * Math.abs(Math.sin(r.spin)); break; }
  }
  return r;
}

const DEFAULT_EXPRESSION: Record<HedgyPose, HedgyExpression> = {
  idle: 'happy', walk: 'happy', run: 'determined', jump: 'happy', shock: 'shocked', celebrate: 'happy', point: 'happy', think: 'neutral',
  push: 'determined', carry: 'happy', fall: 'shocked', curl: 'neutral', roll: 'neutral', peek: 'neutral', sweat: 'worried', sleep: 'neutral',
  'wave-off': 'neutral', give: 'happy', receive: 'happy', hold: 'happy', smug: 'smug', lookup: 'worried', tap: 'neutral', empty: 'sad', panic: 'shocked', squeezed: 'shocked',
};

function mixRig(a: Rig, b: Rig, u: number): Rig {
  const out = {} as Rig;
  for (const key of Object.keys(b) as (keyof Rig)[]) out[key] = lerp(a[key], b[key], u);
  return out;
}

const deviceScale = (scale: number) => (scale <= 2.5 ? scale : scale / 11);

interface State { rig: Rig; expression: HedgyExpression; previous?: HedgyExpression; mix: number; k: number; facing: 1 | -1 }
function resolve(options: HedgyOptions): State {
  SP = SPECIES[options.species ?? 'hedgy'] ?? SPECIES.hedgy; ACC = options.accessory ?? SP.accessory ?? 'none';
  const t = options.t ?? 0, k = deviceScale(options.scale ?? 1) * SP.size, facing = options.facing ?? 1;
  let rig = poseRig(options.pose, t), mix = 1;
  const expression = options.expression ?? DEFAULT_EXPRESSION[options.pose];
  let previous: HedgyExpression | undefined;
  if (options.from && options.mix !== undefined && options.mix < 1) {
    mix = smooth(options.mix);
    rig = mixRig(poseRig(options.from, options.fromT ?? t), rig, mix);
    previous = options.fromExpression ?? DEFAULT_EXPRESSION[options.from];
  }
  if (options.handTarget) {
    // Paw reaches for a device-space point (rotation/squash of the body are small enough to ignore here).
    const lx = (options.handTarget.x - options.x) / (k * ART) * facing - rig.dx, ly = (options.handTarget.y - options.y) / (k * ART) - rig.dy;
    const vx = lx - SHOULDER_F.x, vy = ly - SHOULDER_F.y, reach = clamp(options.reach ?? 1);
    // swing the arm the short way round IN FRONT of the body (never back across the muzzle)
    let target = Math.atan2(vx, vy); if (target < -0.6) target += Math.PI * 2;
    rig.armF = lerp(rig.armF, target, reach);
    rig.armFLen = lerp(rig.armFLen, clamp(Math.hypot(vx, vy) / (ARM_LENGTH + 1), 0.6, 1.9), reach);
  }
  const squash = clamp(options.squash ?? 1, 0.5, 1.5);
  rig.sy *= squash; rig.sx /= Math.sqrt(squash);
  return { rig, expression, previous, mix, k, facing };
}

function part(ctx: Canvas2D, sprite: Sprite, grid: { ox: number; oy: number }, x: number, y: number, rot = 0, sx = 1, sy = 1, alpha = 1) {
  drawSprite(ctx, sprite, x * ART, y * ART, { anchor: [grid.ox / sprite.cols, grid.oy / sprite.rows], rot, sx, sy, alpha });
}
// Sprite angle convention: limbs are authored hanging down (+y); rig angle a → canvas rotation -a.
const ARM_GRID = { ox: 5.5, oy: 3.5 }, LEG_GRID = { ox: 4, oy: 1 }, BALL_GRID = { ox: 24, oy: 24 };

/** Draw Hedgy. `x`,`y` = centre of the feet in device px (floats — never round them). */
export function drawHedgy(ctx: Canvas2D, options: HedgyOptions): void {
  const { rig, expression, previous, mix, k, facing } = resolve(options), t = options.t ?? 0;
  const spike = (rig.spike > 0.75 ? 2 : rig.spike > 0.3 ? 1 : 0) as 0 | 1 | 2;
  ctx.save();
  ctx.translate(options.x, options.y);
  if (options.shadow) {
    const lift = clamp(1 + rig.dy / 26, 0.35, 1), w = 96 * k * lift;
    ctx.save(); ctx.globalAlpha *= 0.5 * lift; ctx.fillStyle = '#000000';
    ctx.beginPath(); ctx.ellipse(0, 6 * k, w, 15 * k * lift, 0, 0, TAU); ctx.fill(); ctx.restore();
  }
  ctx.scale(k * facing * (SP.wide ?? 1), k);
  ctx.translate(rig.dx * ART, rig.dy * ART);
  ctx.rotate(rig.rot);
  ctx.scale(rig.sx, rig.sy);
  if (rig.ball > 0.5) {
    const grow = smooth((rig.ball - 0.5) * 2);
    ctx.save(); ctx.translate(0, -15 * ART); ctx.rotate(rig.spin); ctx.scale(0.8 + 0.2 * grow, 0.8 + 0.2 * grow);
    part(ctx, ballSprite(), BALL_GRID, 0, 0);
    ctx.restore(); ctx.restore();
    return;
  }
  const tuck = smooth(rig.ball * 2);
  if (tuck > 0) { ctx.translate(0, -15 * ART * 0); ctx.scale(1 + 0.06 * tuck, 1 - 0.3 * tuck); }
  part(ctx, armSprite(true), ARM_GRID, SHOULDER_R.x, SHOULDER_R.y, -rig.armR, 1, rig.armRLen);
  part(ctx, legSprite(true), LEG_GRID, HIP_R.x, HIP_R.y - rig.legRLift, -rig.legR);
  part(ctx, legSprite(false), LEG_GRID, HIP_F.x, HIP_F.y - rig.legFLift, -rig.legF);
  part(ctx, torsoSprite(spike), TORSO, 0, 0);
  // head pivots about the neck
  const hx = HEAD_CENTRE.x - NECK.x, hy = HEAD_CENTRE.y - NECK.y, c = Math.cos(rig.headRot), s = Math.sin(rig.headRot);
  const headX = NECK.x + c * hx - s * hy + rig.headX, headY = NECK.y + s * hx + c * hy + rig.headY + 6 * tuck;
  const closed = options.pose === 'sleep' || tuck > 0.4;
  const blink = closed || (expression !== 'shocked' && (t % 2.9) > 2.78);
  const look = options.look ?? 'forward';
  if (previous && previous !== expression && mix < 1) {
    part(ctx, headSprite(previous, look, blink, spike), HEAD, headX, headY, rig.headRot);
    part(ctx, headSprite(expression, look, blink, spike), HEAD, headX, headY, rig.headRot, 1, 1, mix);
  } else part(ctx, headSprite(expression, look, blink, spike), HEAD, headX, headY, rig.headRot);
  part(ctx, armSprite(false), ARM_GRID, SHOULDER_F.x, SHOULDER_F.y, -rig.armF, 1, rig.armFLen);
  if (options.pose === 'sweat') {
    const u = (t % HEDGY_TIMING.sweat.loop) / HEDGY_TIMING.sweat.loop;
    ctx.globalAlpha *= 1 - smooth((u - 0.7) / 0.3);
    ctx.fillStyle = '#FFFFFF';
    const dx = (headX - 9) * ART, dy = (headY - 9 + 9 * u * u) * ART;
    ctx.beginPath(); ctx.moveTo(dx, dy - ART * 1.6); ctx.quadraticCurveTo(dx + ART * 1.4, dy + ART * 0.6, dx, dy + ART * 1.1); ctx.quadraticCurveTo(dx - ART * 1.4, dy + ART * 0.6, dx, dy - ART * 1.6); ctx.fill();
  }
  ctx.restore();
}

function toDevice(options: HedgyOptions, state: State, local: Point): Point {
  const { rig, k, facing } = state, x = local.x * rig.sx, y = local.y * rig.sy, c = Math.cos(rig.rot), s = Math.sin(rig.rot);
  return { x: options.x + facing * k * ART * (rig.dx + c * x - s * y), y: options.y + k * ART * (rig.dy + s * x + c * y) };
}

/** Device-space position of the front paw — attach held props here. */
export function hedgyPaw(options: HedgyOptions): Point {
  const state = resolve(options), { rig } = state, len = (ARM_LENGTH + 1) * rig.armFLen;
  return toDevice(options, state, { x: SHOULDER_F.x + Math.sin(rig.armF) * len, y: SHOULDER_F.y + Math.cos(rig.armF) * len });
}

/** Device-space face centre and the radius to keep clear of props. */
export function hedgyFace(options: HedgyOptions): { x: number; y: number; r: number } {
  const state = resolve(options);
  return { ...toDevice(options, state, { x: HEAD_CENTRE.x + 5, y: HEAD_CENTRE.y + state.rig.headY }), r: 15 * ART * state.k };
}

/** Animated bounds (device px) for layout checks. */
export function hedgyBounds(options: HedgyOptions): HedgyBounds {
  const state = resolve(options), points: Point[] = [];
  const spike = SPIKE_LENGTH[state.rig.spike > 0.75 ? 2 : state.rig.spike > 0.3 ? 1 : 0];
  for (const x of [-14 - spike, 29]) for (const y of [-48 - spike, 2]) points.push(toDevice(options, state, { x, y }));
  points.push(hedgyPaw(options));
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
  return { x: left, y: top, width: right - left, height: bottom - top, left, top, right, bottom };
}

export interface HedgyKey { at: number; pose: HedgyPose; expression?: HedgyExpression; look?: HedgyLook }
/**
 * Resolve a pose timeline into drawHedgy options with smooth blends between
 * poses: `drawHedgy(ctx, { x, y, ...hedgyAt(t, [{ at: 0, pose: 'idle' }, { at: 0.8, pose: 'give' }]) })`.
 */
export function hedgyAt(t: number, keys: readonly HedgyKey[], blend = 0.18): Pick<HedgyOptions, 'pose' | 't' | 'expression' | 'look' | 'from' | 'fromT' | 'fromExpression' | 'mix'> {
  let index = 0;
  for (let i = 0; i < keys.length; i++) if (t >= keys[i]!.at) index = i;
  const key = keys[index]!, before = index > 0 ? keys[index - 1] : undefined, local = Math.max(0, t - key.at);
  const out = { pose: key.pose, t: local, expression: key.expression, look: key.look } as ReturnType<typeof hedgyAt>;
  if (before && local < blend) { out.from = before.pose; out.fromT = t - before.at; out.fromExpression = before.expression; out.mix = local / blend; }
  return out;
}

/** Sound suggestions stay aligned with the existing action landmarks. */
export function hedgyCues(pose: HedgyPose, duration: number): Cue[] {
  const canonical = pose;
  const cues: Cue[] = [];
  const add = (t: number, kind: Cue['kind'], gain = 1) => { if (t >= 0 && t <= duration) cues.push({ t, kind, gain }); };
  if (canonical === 'walk' || canonical === 'run') {
    const step = canonical === 'walk' ? HEDGY_TIMING.walk.step : HEDGY_TIMING.run.step;
    for (let t = step; t <= duration; t += step) add(Number(t.toFixed(3)), 'step', canonical === 'run' ? 0.75 : 0.55);
  } else if (canonical === 'jump') {
    add(HEDGY_TIMING.jump.anticipate, 'swish', 0.6); add(HEDGY_TIMING.jump.launch, 'boing', 0.7);
    add(HEDGY_TIMING.jump.land, 'land'); add(HEDGY_TIMING.jump.land + 0.04, 'boing', 0.55);
  } else if (canonical === 'shock') {
    add(HEDGY_TIMING.shock.burst, 'crack', 0.55); add(HEDGY_TIMING.shock.recoil, 'boing', 0.8); add(HEDGY_TIMING.shock.settle, 'squeak', 0.45);
  } else if (canonical === 'celebrate') {
    for (let t = 0.12; t <= duration; t += HEDGY_TIMING.celebrate.loop) add(Number(t.toFixed(3)), 'boing', 0.65);
    add(0.18, 'sparkle', 0.5);
  } else if (canonical === 'point') add(HEDGY_TIMING.point.gesture, 'pop', 0.6);
  else if (canonical === 'think') add(HEDGY_TIMING.think.tick, 'tick', 0.45);
  else if (canonical === 'fall') { add(HEDGY_TIMING.fall.tumble, 'swish'); add(HEDGY_TIMING.fall.land, 'land'); }
  else if (canonical === 'curl') { add(HEDGY_TIMING.curl.tuck, 'snap'); add(HEDGY_TIMING.curl.hold, 'squeak', 0.4); }
  else if (canonical === 'roll') for (let t = 0.06; t <= duration; t += HEDGY_TIMING.roll.loop) add(Number(t.toFixed(3)), 'thud', 0.5);
  else if (canonical === 'peek') { add(0.08, 'swish', 0.5); add(HEDGY_TIMING.peek.rise, 'pop'); }
  else if (canonical === 'wave-off') add(HEDGY_TIMING['wave-off'].shrug, 'squeak', 0.55);
  else if (canonical === 'push') for (let t = 0.08; t <= duration; t += HEDGY_TIMING.push.loop) add(Number(t.toFixed(3)), 'thud', 0.45);
  else if (canonical === 'carry') add(0.08, 'clack', 0.5);
  else if (canonical === 'sweat') for (let t = 0.1; t <= duration; t += HEDGY_TIMING.sweat.drop) add(Number(t.toFixed(3)), 'drop', 0.35);
  return cues.sort((a, b) => a.t - b.t);
}

export const cuesForPose = hedgyCues;
