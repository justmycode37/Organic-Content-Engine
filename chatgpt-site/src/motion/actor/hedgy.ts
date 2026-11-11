import type { Cue } from '../core.ts';

export type HedgyPose =
  | 'idle' | 'walk' | 'run' | 'jump' | 'shock' | 'celebrate' | 'point' | 'think'
  | 'push' | 'carry' | 'fall' | 'curl' | 'roll' | 'peek' | 'sweat' | 'sleep' | 'wave-off';
export type HedgyLook = 'camera' | 'forward' | 'up' | 'down';
export type HedgyExpression = 'happy' | 'worried' | 'shocked' | 'smug' | 'determined' | 'sad' | 'neutral';
export type HedgyProp = 'coin' | 'sign' | 'phone' | 'umbrella' | 'briefcase' | 'magnifier' | 'none';

export interface HedgyOptions {
  /** Horizontal center of the feet in canvas pixels. */
  x: number;
  /** Feet baseline in canvas pixels. */
  y: number;
  /** Screen pixels per authored sprite pixel. */
  scale: number;
  /** Seconds since this action began. */
  t: number;
  pose: HedgyPose;
  facing?: 1 | -1;
  look?: HedgyLook;
  expression?: HedgyExpression;
  prop?: HedgyProp;
  /** Additional body squash, where 1 is neutral. */
  squash?: number;
  /** Optional outline override for the outer silhouette. */
  outline?: string;
}

export interface HedgyBounds { x: number; y: number; width: number; height: number; left: number; top: number; right: number; bottom: number }

/** Action landmarks are shared by drawing and cue generation. Seconds are relative to the pose start. */
export const HEDGY_TIMING = {
  idle: { loop: 2.4, blink: 1.7 },
  walk: { loop: 0.82, step: 0.41 },
  run: { loop: 0.44, step: 0.22 },
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
  sweat: { loop: 1.1, drop: 0.55 },
  sleep: { loop: 3.2 },
  'wave-off': { loop: 1.05, shrug: 0.45 },
} as const;

// Ink, chestnut, toasted brown, and warm cream keep the little silhouette readable
// against both black and grey scenes. Every visible edge is drawn on the art-pixel grid.
const COLORS: Record<string, string> = {
  K: '#2a1a12', Q: '#3e281b', A: '#573822', B: '#70492e', C: '#8a5e3d', D: '#a97850',
  E: '#bd9165', H: '#dfbd8c', F: '#f2dfbd', G: '#e6d1ac', S: '#d2b58a', I: '#1b120e', W: '#fff5df',
  R: '#b88770',
};

type Canvas2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Point = readonly [number, number];
type Motion = {
  dx: number; dy: number; sx: number; sy: number; angle: number; leg: number; arm: number;
  burst: number; blink: boolean; eyeWide: boolean; ball: boolean; roll: boolean;
};

const TAU = Math.PI * 2;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => { const x = clamp01(n); return x * x * (3 - 2 * x); };
const pulse = (t: number, start: number, duration: number) => Math.sin(Math.PI * clamp01((t - start) / duration));

function px(ctx: Canvas2D, x: number, y: number, w = 1, h = 1, color = 'K') {
  ctx.fillStyle = COLORS[color] ?? color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}

function pointInPolygon(x: number, y: number, points: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]!;
    const [xj, yj] = points[j]!;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function rasterPolygon(ctx: Canvas2D, points: readonly Point[], colorAt: (x: number, y: number) => string) {
  const minX = Math.floor(Math.min(...points.map(p => p[0])));
  const maxX = Math.ceil(Math.max(...points.map(p => p[0])));
  const minY = Math.floor(Math.min(...points.map(p => p[1])));
  const maxY = Math.ceil(Math.max(...points.map(p => p[1])));
  for (let y = minY; y < maxY; y++) for (let x = minX; x < maxX; x++) {
    if (pointInPolygon(x + 0.5, y + 0.5, points)) px(ctx, x, y, 1, 1, colorAt(x, y));
  }
}

function line(ctx: Canvas2D, x1: number, y1: number, x2: number, y2: number, color = 'K', width = 1) {
  let x = Math.round(x1), y = Math.round(y1);
  const endX = Math.round(x2), endY = Math.round(y2);
  const dx = Math.abs(endX - x), sx = x < endX ? 1 : -1;
  const dy = -Math.abs(endY - y), sy = y < endY ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    px(ctx, x - Math.floor(width / 2), y - Math.floor(width / 2), width, width, color);
    if (x === endX && y === endY) break;
    const e2 = err * 2;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

function rasterEllipse(ctx: Canvas2D, cx: number, cy: number, rx: number, ry: number, colorAt: (x: number, y: number) => string, outline = 'K') {
  const minX = Math.floor(cx - rx - 1), maxX = Math.ceil(cx + rx + 1);
  const minY = Math.floor(cy - ry - 1), maxY = Math.ceil(cy + ry + 1);
  const innerRx = Math.max(0.1, rx - 1), innerRy = Math.max(0.1, ry - 1);
  for (let y = minY; y < maxY; y++) for (let x = minX; x < maxX; x++) {
    const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
    if (nx * nx + ny * ny <= 1) {
      const ix = (x + 0.5 - cx) / innerRx, iy = (y + 0.5 - cy) / innerRy;
      px(ctx, x, y, 1, 1, ix * ix + iy * iy > 1 ? outline : colorAt(x, y));
    }
  }
}

const deg = (n: number) => n * Math.PI / 180;
function edgePoint(cx: number, cy: number, rx: number, ry: number, angle: number, radius = 1): Point {
  const a = deg(angle);
  return [Math.round(cx + Math.cos(a) * rx * radius), Math.round(cy + Math.sin(a) * ry * radius)];
}

function drawFeet(ctx: Canvas2D, pose: HedgyPose, t: number, leg: number) {
  if (pose === 'curl' || pose === 'roll') return;
  const walk = pose === 'walk' || pose === 'run' || pose === 'push';
  const stride = pose === 'run' ? 3.2 : pose === 'walk' ? 2.5 : pose === 'push' ? 1.2 : 0;
  const lift = pose === 'run' ? 2.8 : pose === 'walk' ? 1.8 : 0;
  const sway = walk ? leg * stride : 0;
  const leftX = -10 + sway, rightX = 8 - sway;
  const leftLift = Math.max(0, leg) * lift, rightLift = Math.max(0, -leg) * lift;
  for (const [x, y, fill] of [[leftX, 1 - leftLift, 'C'], [rightX, 1 - rightLift, 'D']] as const) {
    line(ctx, x, -4, x, y - 1, 'K', 3);
    line(ctx, x, -3, x, y - 1, fill, 1);
    rasterEllipse(ctx, x, y, 3.2, 2.2, () => fill, 'K');
    px(ctx, x - 2, Math.round(y - 1), 2, 1, 'E');
  }
  if (pose === 'fall' && t < 0.78) {
    line(ctx, -6, -7, -16, -10, 'K', 3); line(ctx, -6, -7, -15, -10, 'C', 1);
    rasterEllipse(ctx, -17, -10, 3, 2.5, () => 'C', 'K');
  }
}

function shellGeometry(flare: number) {
  const cx = -5, cy = -24, rx = 22, ry = 20;
  const count = 20, start = 140, end = 316, step = (end - start) / count;
  const outer: Point[] = [], tips: Point[] = [];
  for (let i = 0; i < count; i++) {
    const a0 = start + i * step, a1 = a0 + step, am = (a0 + a1) / 2;
    const baseA = edgePoint(cx, cy, rx, ry, a0);
    const baseB = edgePoint(cx, cy, rx, ry, a1);
    const [ex, ey] = edgePoint(cx, cy, rx, ry, am);
    const nx = Math.cos(deg(am)) / rx, ny = Math.sin(deg(am)) / ry;
    const normal = Math.hypot(nx, ny);
    const length = 4.4 + flare + (i % 4 === 1 ? 0.8 : 0);
    const tip: Point = [Math.round(ex + nx / normal * length), Math.round(ey + ny / normal * length)];
    outer.push(baseA, tip, baseB);
    tips.push(tip);
  }
  const polygon: Point[] = [...outer];
  for (let a = end; a >= start; a -= 8) polygon.push(edgePoint(cx, cy, rx, ry, a, 0.73));
  return { polygon, outer, tips, center: [cx, cy] as Point };
}

function drawQuillCoat(ctx: Canvas2D, flare: number, outline?: string) {
  const geometry = shellGeometry(flare);
  const { polygon, outer, tips, center } = geometry;
  rasterPolygon(ctx, polygon, (x, y) => {
    if (y < -39) return (x + y) % 5 === 0 ? 'H' : 'D';
    if (y < -33) return (x + y * 2) % 7 === 0 ? 'E' : 'C';
    if (y < -25) return (x * 3 + y) % 9 === 0 ? 'D' : 'B';
    return (x + y * 2) % 7 === 0 ? 'B' : 'A';
  });
  for (let i = 0; i < outer.length - 1; i++) {
    const a = outer[i]!, b = outer[i + 1]!;
    line(ctx, a[0], a[1], b[0], b[1], outline ?? 'K');
  }
  for (let i = 0; i < tips.length; i++) {
    const [tx, ty] = tips[i]!;
    const [cx, cy] = center;
    const dx = cx - tx, dy = cy - ty, d = Math.hypot(dx, dy) || 1;
    px(ctx, tx + Math.round(dx / d), ty + Math.round(dy / d), 1, 1, i % 3 === 0 ? 'H' : 'E');
  }

  // Two inset rows make the quills read as a coat over the round back, not a detached fan.
  for (let row = 0; row < 2; row++) {
    const radius = row === 0 ? 0.78 : 0.58;
    const from = row === 0 ? 151 : 162, to = row === 0 ? 305 : 292, step = row === 0 ? 17 : 23;
    for (let a = from; a <= to; a += step) {
      const base = edgePoint(-5, -24, 22, 20, a, radius);
      const [ex, ey] = edgePoint(-5, -24, 22, 20, a, radius);
      const nx = Math.cos(deg(a)), ny = Math.sin(deg(a)), len = row === 0 ? 3 : 2.3;
      const tip: Point = [Math.round(ex + nx * len), Math.round(ey + ny * len)];
      line(ctx, base[0], base[1], tip[0], tip[1], row === 0 ? 'Q' : 'B');
      px(ctx, tip[0] - (nx < -0.4 ? 1 : 0), tip[1] - (ny < -0.4 ? 1 : 0), 1, 1, row === 0 ? 'E' : 'D');
    }
  }
}

const FACE_SHAPE: Point[] = [
  [2, -36], [5, -39], [10, -40], [15, -39], [20, -36], [24, -32], [27, -28],
  [29, -26], [27, -23], [24, -21], [19, -19], [13, -19], [8, -21], [4, -24], [2, -29],
];

function shrinkPolygon(points: readonly Point[], amount: number): Point[] {
  const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
  const cy = points.reduce((s, p) => s + p[1], 0) / points.length;
  return points.map(([x, y]) => [Math.round(cx + (x - cx) * amount), Math.round(cy + (y - cy) * amount)] as Point);
}

function drawEar(ctx: Canvas2D) {
  rasterEllipse(ctx, 7, -38, 4.5, 5, () => 'A', 'K');
  rasterEllipse(ctx, 7.5, -38, 2.2, 2.8, () => 'D', 'B');
  px(ctx, 7, -40, 2, 1, 'E');
}

function drawFaceMask(ctx: Canvas2D) {
  rasterPolygon(ctx, FACE_SHAPE, () => 'B');
  rasterPolygon(ctx, shrinkPolygon(FACE_SHAPE, 0.91), (x, y) => {
    if (y < -34) return x < 14 ? 'F' : 'G';
    if (y < -27) return x < 18 ? 'G' : 'F';
    return (x + y) % 5 === 0 ? 'G' : 'F';
  });
  // A small muzzle pad rounds the end of the mask without making a long wedge.
  rasterEllipse(ctx, 20, -25, 7, 4.7, () => 'F', 'G');
  px(ctx, 10, -35, 4, 1, 'W');
  px(ctx, 8, -34, 2, 1, 'F');
  rasterEllipse(ctx, 20, -25, 3.3, 1.8, () => 'G', 'F');
  px(ctx, 19, -26, 2, 1, 'D'); // muted natural cheek, kept very small
}

function drawEye(ctx: Canvas2D, expression: HedgyExpression, look: HedgyLook, blink: boolean, eyeWide: boolean, pose: HedgyPose) {
  const x = 16, y = -32;
  const gazeX = look === 'camera' ? -1 : 0;
  const gazeY = look === 'up' ? -1 : look === 'down' ? 1 : 0;
  if (blink || pose === 'sleep' || expression === 'happy') {
    px(ctx, x - 2, y + 1, 1, 1, 'K'); px(ctx, x - 1, y, 1, 1, 'K');
    px(ctx, x, y - 1, 1, 1, 'K'); px(ctx, x + 1, y, 1, 1, 'K'); px(ctx, x + 2, y + 1, 1, 1, 'K');
    px(ctx, x - 1, y + 2, 3, 1, 'B');
  } else if (expression === 'shocked' || eyeWide) {
    rasterEllipse(ctx, x, y, 3, 3.8, () => 'W', 'B');
    rasterEllipse(ctx, x + gazeX, y + gazeY, 1.6, 2.3, () => 'I', 'I');
    px(ctx, x + gazeX - 1, y + gazeY - 2, 1, 1, 'W');
  } else if (expression === 'smug') {
    px(ctx, x - 3, y - 1, 7, 2, 'B');
    rasterEllipse(ctx, x, y, 2.2, 2.3, () => 'I', 'K');
    px(ctx, x + gazeX - 1, y - 1, 1, 1, 'W');
  } else if (expression === 'determined') {
    rasterEllipse(ctx, x, y, 2.1, 3, () => 'I', 'K');
    px(ctx, x - 3, y - 3, 7, 2, 'B');
    px(ctx, x + gazeX - 1, y - 1, 1, 1, 'W');
  } else {
    rasterEllipse(ctx, x, y, 2.1, 3, () => 'I', 'K');
    px(ctx, x + gazeX - 1, y + gazeY - 2, 1, 1, 'W');
    px(ctx, x + gazeX + 1, y + gazeY - 1, 1, 1, 'W');
  }

  if (expression === 'worried' || expression === 'sad') {
    line(ctx, x - 3, y - 5, x + 2, y - 7, 'B');
    if (expression === 'sad') px(ctx, x + 1, y + 5, 3, 1, 'B');
  } else if (expression === 'determined') {
    line(ctx, x - 3, y - 6, x + 2, y - 4, 'A');
  }

  // Nose, single white catchlight, and one short mouth line anchor the rounded snout.
  rasterEllipse(ctx, 27, -26, 2.8, 2.5, () => 'I', 'K');
  px(ctx, 26, -28, 1, 1, 'W');
  if (expression === 'shocked') {
    rasterEllipse(ctx, 23, -20, 1.7, 2.2, () => 'I', 'K');
  } else if (expression === 'happy') {
    line(ctx, 22, -21, 25, -20, 'K'); line(ctx, 25, -20, 27, -21, 'K');
  } else if (expression === 'sad' || expression === 'worried') {
    line(ctx, 22, -20, 26, -21, 'K');
  } else {
    line(ctx, 23, -21, 26, -21, 'K');
  }
}

function drawBody(ctx: Canvas2D) {
  rasterEllipse(ctx, -4, -20, 23, 19, (x, y) => {
    if (x < -15 && y < -20) return (x + y) % 5 === 0 ? 'E' : 'D';
    if (y < -27) return (x + y * 2) % 6 === 0 ? 'D' : 'C';
    if (y > -10) return (x + y) % 6 === 0 ? 'B' : 'A';
    return (x * 3 + y) % 8 === 0 ? 'C' : 'B';
  }, 'K');
  // Broad warm bib blends into the round underside and makes the belly visible beneath the mask.
  rasterEllipse(ctx, 3, -7, 12, 8, (x, y) => (x + y) % 5 === 0 ? 'F' : 'G', 'B');
  px(ctx, -3, -7, 2, 4, 'F'); px(ctx, -1, -3, 3, 1, 'F');
}

function arm(ctx: Canvas2D, ax: number, ay: number, hx: number, hy: number, raised = false) {
  const elbowX = raised ? ax + (hx - ax) * 0.45 - 2 : (ax + hx) / 2;
  const elbowY = raised ? Math.min(ay, hy) - 3 : (ay + hy) / 2;
  line(ctx, ax, ay, elbowX, elbowY, 'K', 2); line(ctx, ax, ay, elbowX, elbowY, 'C', 1);
  line(ctx, elbowX, elbowY, hx, hy, 'K', 2); line(ctx, elbowX, elbowY, hx, hy, 'D', 1);
  rasterEllipse(ctx, hx, hy, 2.5, 2.1, () => 'D', 'K');
  px(ctx, hx - 1, hy - 1, 1, 1, 'E');
}

function paw(ctx: Canvas2D, x: number, y: number) {
  rasterEllipse(ctx, x, y, 2.5, 2.1, () => 'D', 'K');
  px(ctx, x - 1, y - 1, 1, 1, 'E');
}

function drawProp(ctx: Canvas2D, prop: HedgyProp, x: number, y: number, t: number) {
  if (prop === 'none') return;
  const wiggle = Math.round(Math.sin(t * 4) * 0.35);
  if (prop === 'coin') {
    rasterEllipse(ctx, x, y + wiggle, 5, 5, () => 'E', 'K');
    px(ctx, x - 1, y - 3 + wiggle, 1, 6, 'H'); px(ctx, x + 1, y - 2 + wiggle, 1, 5, 'D');
  } else if (prop === 'sign') {
    px(ctx, x - 1, y, 2, 10, 'K'); px(ctx, x, y + 1, 1, 8, 'D');
    px(ctx, x - 8, y - 13, 17, 13, 'K'); px(ctx, x - 7, y - 12, 15, 11, 'S');
    px(ctx, x - 5, y - 9, 3, 2, 'B'); px(ctx, x, y - 9, 7, 2, 'A'); px(ctx, x - 4, y - 5, 11, 1, 'D');
  } else if (prop === 'phone') {
    px(ctx, x - 5, y - 10, 10, 16, 'K'); px(ctx, x - 4, y - 9, 8, 13, 'A');
    px(ctx, x - 3, y - 8, 6, 10, 'S'); px(ctx, x - 2, y - 7, 4, 2, 'F'); px(ctx, x - 1, y + 4, 2, 1, 'H');
  } else if (prop === 'umbrella') {
    px(ctx, x - 10, y - 12, 4, 2, 'A'); px(ctx, x - 6, y - 15, 5, 3, 'B'); px(ctx, x - 1, y - 16, 7, 2, 'D');
    px(ctx, x + 6, y - 14, 5, 2, 'B'); px(ctx, x + 11, y - 12, 3, 2, 'A');
    px(ctx, x - 10, y - 10, 23, 1, 'K'); px(ctx, x, y - 9, 1, 13, 'K'); px(ctx, x, y + 4, 4, 2, 'K');
  } else if (prop === 'briefcase') {
    px(ctx, x - 10, y - 8, 21, 14, 'K'); px(ctx, x - 8, y - 6, 17, 10, 'A'); px(ctx, x - 7, y - 5, 15, 7, 'D');
    px(ctx, x - 3, y - 11, 8, 3, 'K'); px(ctx, x - 2, y - 10, 6, 2, 'C'); px(ctx, x - 1, y - 3, 3, 3, 'F');
  } else if (prop === 'magnifier') {
    rasterEllipse(ctx, x, y - 8, 6, 6, () => 'S', 'K'); rasterEllipse(ctx, x - 1, y - 9, 3.5, 3.5, () => 'F', 'G');
    line(ctx, x + 4, y - 2, x + 8, y + 6, 'K', 3); line(ctx, x + 5, y, x + 7, y + 5, 'D', 1);
  }
}

function drawBurst(ctx: Canvas2D, amount: number, t: number) {
  if (amount <= 0.03) return;
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI * 0.93 + i * Math.PI * 0.86 / 6;
    const reach = 31 + Math.round(amount * 5) + (i % 3 === 0 ? 2 : 0);
    const x = Math.round(Math.cos(a) * reach), y = Math.round(-25 + Math.sin(a) * reach);
    px(ctx, x, y + Math.round(Math.sin(t * 17 + i) * amount), i % 2 ? 2 : 3, 1, i % 2 ? 'E' : 'H');
  }
}

function drawBall(ctx: Canvas2D, t: number, rolling: boolean, outline?: string) {
  ctx.save();
  if (rolling) { ctx.translate(0, -21); ctx.rotate(t * TAU / HEDGY_TIMING.roll.revolution); ctx.translate(0, 21); }
  const cx = -1, cy = -21;
  for (let a = 0; a < 360; a += 15) {
    const baseA = edgePoint(cx, cy, 16, 16, a - 4);
    const baseB = edgePoint(cx, cy, 16, 16, a + 4);
    const tip = edgePoint(cx, cy, 22 + (a % 4 === 0 ? 1 : 0), 22 + (a % 4 === 0 ? 1 : 0), a);
    const spike: Point[] = [baseA, tip, baseB];
    rasterPolygon(ctx, spike, () => 'A');
    line(ctx, baseA[0], baseA[1], tip[0], tip[1], outline ?? 'K');
    line(ctx, tip[0], tip[1], baseB[0], baseB[1], outline ?? 'K');
    const [tx, ty] = tip;
    const [hx, hy] = edgePoint(cx, cy, 20, 20, a);
    px(ctx, hx, hy, 1, 1, a % 3 === 0 ? 'H' : 'E');
    void tx; void ty;
  }
  rasterEllipse(ctx, cx, cy, 16, 16, (x, y) => y < -24 ? ((x + y) % 5 === 0 ? 'D' : 'C') : ((x * 2 + y) % 6 === 0 ? 'B' : 'A'), outline ?? 'K');
  // The nose and folded muzzle peek out just enough to keep the ball unmistakably Hedgy.
  rasterEllipse(ctx, 10, -20, 7, 5, () => 'G', 'B');
  rasterEllipse(ctx, 15, -21, 2.3, 2.1, () => 'I', 'K');
  px(ctx, 14, -23, 1, 1, 'W');
  line(ctx, 8, -17, 11, -17, 'B');
  if (rolling && Math.floor(t * 12) % 2 === 0) { px(ctx, -18, -15, 2, 2, 'H'); px(ctx, 17, -29, 2, 2, 'H'); }
  ctx.restore();
}

function drawThought(ctx: Canvas2D, t: number) {
  if (Math.sin(t * TAU / HEDGY_TIMING.think.loop) <= 0.15) return;
  px(ctx, 15, -48, 2, 2, 'S'); px(ctx, 20, -52, 4, 4, 'S');
  rasterEllipse(ctx, 31, -58, 7, 5, () => 'F', 'K');
  px(ctx, 28, -59, 2, 1, 'A'); px(ctx, 32 + Math.floor(t * 3) % 2, -59, 1, 2, 'A');
}

function drawSweat(ctx: Canvas2D, t: number) {
  const p = (t % HEDGY_TIMING.sweat.drop) / HEDGY_TIMING.sweat.drop;
  const y = -43 + Math.floor(p * 8);
  px(ctx, 31, y, 2, 3, 'S'); px(ctx, 32, y - 1, 1, 1, 'F');
  px(ctx, 35, -37 + Math.floor(((p + 0.5) % 1) * 6), 1, 2, 'S');
}

function drawDust(ctx: Canvas2D, t: number) {
  const p = (t % HEDGY_TIMING.run.loop) / HEDGY_TIMING.run.loop;
  if (p > 0.34) return;
  const spread = Math.round(p / 0.34 * 5), fade = Math.round(p / 0.34 * 2);
  px(ctx, -28 - spread, -1 - fade, 3, 2, 'S'); px(ctx, -26 - spread, -2 - fade, 2, 1, 'G');
}

function drawSleepMarks(ctx: Canvas2D, t: number) {
  const shift = Math.floor((t % 2.4) * 1.3), x = 24 + shift, y = -48 - shift;
  px(ctx, x, y, 5, 1, 'S'); px(ctx, x + 4, y, 1, 3, 'S'); px(ctx, x + 2, y + 2, 3, 1, 'S'); px(ctx, x, y + 4, 5, 1, 'S');
}

function idleLook(t: number): HedgyLook {
  const p = t % HEDGY_TIMING.idle.loop;
  if (p > 0.55 && p < 0.82) return 'up';
  if (p > 1.2 && p < 1.48) return 'camera';
  if (p > 1.92 && p < 2.15) return 'down';
  return 'forward';
}

function motion(pose: HedgyPose, t: number): Motion {
  const m: Motion = { dx: 0, dy: 0, sx: 1, sy: 1, angle: 0, leg: 0, arm: 0, burst: 0, blink: false, eyeWide: false, ball: false, roll: false };
  const phase = (period: number) => (t % period) / period;
  switch (pose) {
    case 'idle':
      m.dy = -Math.sin(t * TAU / HEDGY_TIMING.idle.loop) * 0.45;
      m.sy = 1 + Math.sin(t * TAU / HEDGY_TIMING.idle.loop) * 0.012;
      m.blink = (t % HEDGY_TIMING.idle.loop > 1.66 && t % HEDGY_TIMING.idle.loop < 1.78) || (t % HEDGY_TIMING.idle.loop > 0.04 && t % HEDGY_TIMING.idle.loop < 0.11);
      break;
    case 'walk': {
      const p = phase(HEDGY_TIMING.walk.loop); m.leg = Math.sin(p * TAU); m.arm = m.leg;
      m.dy = -Math.abs(Math.sin(p * TAU)) * 0.8; m.angle = 0.018 * m.leg; break;
    }
    case 'run': {
      const p = phase(HEDGY_TIMING.run.loop); m.leg = Math.sin(p * TAU); m.arm = m.leg;
      m.dy = -1.5 - Math.abs(Math.sin(p * TAU)) * 2; m.angle = 0.035; m.sx = 1.035; m.sy = 0.97 + Math.abs(Math.sin(p * TAU)) * 0.05; break;
    }
    case 'jump': {
      const { anticipate, launch, apex, land, settle } = HEDGY_TIMING.jump;
      if (t < anticipate) { const p = smooth(t / anticipate); m.sy = 1 - 0.16 * p; m.sx = 1 + 0.12 * p; m.dy = 1.4 * p; }
      else if (t < launch) { const p = smooth((t - anticipate) / (launch - anticipate)); m.dy = 1.4 - 25 * p; m.sy = 1.11; m.sx = 0.94; m.arm = p; }
      else if (t < apex) { const p = smooth((t - launch) / (apex - launch)); m.dy = -24 - 5 * p; m.sy = 1.11 - 0.03 * p; m.sx = 0.94 + 0.03 * p; m.arm = 1 - 0.15 * p; }
      else if (t < land) { const p = smooth((t - apex) / (land - apex)); m.dy = -29 + 27 * p; m.sy = 1.08 - 0.08 * p; m.sx = 0.97 + 0.03 * p; m.arm = 1 - p * 0.25; }
      else { const p = Math.exp(-(t - land) * 8); m.dy = -3 * p * Math.sin((t - land) * 18) - Math.sin((t - settle) * 3) * 0.18; m.sy = 1 - 0.16 * p + Math.sin((t - settle) * 3) * 0.004; m.sx = 1 + 0.11 * p; }
      m.blink = t < anticipate * 0.9 || (t > settle && t < settle + 0.1); break;
    }
    case 'shock': {
      const p = smooth(t / HEDGY_TIMING.shock.recoil); m.dy = -pulse(t, 0.03, 0.48) * 5; m.dx = -smooth(t / 0.32) * 2.5;
      m.sx = 1 + pulse(t, 0.02, 0.28) * 0.08; m.sy = 1 + pulse(t, 0.02, 0.28) * 0.08;
      m.angle = -0.05 * (1 - p); m.burst = 1 - smooth(t / 0.46); m.eyeWide = t > 0.05; break;
    }
    case 'celebrate': {
      const p = phase(HEDGY_TIMING.celebrate.loop); m.dy = -Math.abs(Math.sin(p * TAU)) * 3;
      m.sy = 1 - Math.max(0, Math.sin(p * TAU)) * 0.07; m.sx = 1 + Math.max(0, Math.sin(p * TAU)) * 0.05; m.arm = 1; break;
    }
    case 'point': m.arm = smooth(t / HEDGY_TIMING.point.gesture); m.dy = -Math.sin(t * 3) * 0.3; break;
    case 'think': m.angle = -0.025; m.arm = 0.4 + 0.08 * Math.sin(t * 3); m.blink = t % HEDGY_TIMING.think.loop > 1.58 && t % HEDGY_TIMING.think.loop < 1.7; break;
    case 'push': m.angle = 0.08; m.sx = 1.04; m.sy = 0.96 + 0.03 * Math.sin(t * TAU / HEDGY_TIMING.push.loop); m.leg = Math.sin(t * TAU / HEDGY_TIMING.push.loop); m.arm = 0.7 + 0.12 * Math.sin(t * TAU / HEDGY_TIMING.push.loop); break;
    case 'carry': m.dy = -Math.abs(Math.sin(t * TAU / HEDGY_TIMING.carry.loop)) * 0.8; m.arm = 1; m.sx = 1 + 0.008 * Math.sin(t * 4); break;
    case 'fall': {
      const p = smooth(t / HEDGY_TIMING.fall.tumble); m.angle = p * Math.PI * 1.5;
      m.dy = t < HEDGY_TIMING.fall.land ? -Math.sin(Math.PI * clamp01(t / 0.78)) * 5 : 1;
      m.sx = t > 0.72 && t < 0.95 ? 1.15 : 1; m.sy = t > 0.72 && t < 0.95 ? 0.84 : 1; m.arm = 1; break;
    }
    case 'curl': m.ball = t >= HEDGY_TIMING.curl.tuck; m.sx = t < HEDGY_TIMING.curl.tuck ? 1 + smooth(t / 0.3) * 0.08 : 0.94; m.sy = t < HEDGY_TIMING.curl.tuck ? 1 - smooth(t / 0.3) * 0.09 : 0.92; break;
    case 'roll': m.ball = true; m.roll = true; m.dx = Math.sin(t * TAU / 1.6) * 8; m.dy = -Math.abs(Math.sin(t * TAU / HEDGY_TIMING.roll.loop)) * 0.7; break;
    case 'peek': m.dy = 10 * (1 - smooth(t / HEDGY_TIMING.peek.rise)) - (t > 0.42 ? Math.sin((t - 0.42) * 8) * 0.35 : 0); m.blink = t < 0.14; break;
    case 'sweat': m.dx = Math.sin(t * 18) * 0.3; m.dy = -Math.abs(Math.sin(t * 18)) * 0.5; m.angle = Math.sin(t * 9) * 0.018; m.blink = t % HEDGY_TIMING.sweat.loop > 0.9 && t % HEDGY_TIMING.sweat.loop < 0.98; break;
    case 'sleep': m.sy = 1 + Math.sin(t * TAU / HEDGY_TIMING.sleep.loop) * 0.022; m.sx = 1 - Math.sin(t * TAU / HEDGY_TIMING.sleep.loop) * 0.012; m.blink = true; break;
    case 'wave-off': { const p = phase(HEDGY_TIMING['wave-off'].loop); m.arm = Math.sin(p * TAU); m.dy = -Math.abs(Math.sin(p * TAU)) * 0.8; break; }
  }
  const blinkClock = t % 3.15;
  if (pose !== 'sleep' && blinkClock > 2.95 && blinkClock < 3.08) m.blink = true;
  return m;
}

function defaultExpression(pose: HedgyPose): HedgyExpression {
  if (pose === 'shock') return 'shocked';
  if (pose === 'sweat' || pose === 'push' || pose === 'fall') return 'worried';
  if (pose === 'sleep') return 'neutral';
  if (pose === 'celebrate' || pose === 'wave-off') return 'happy';
  if (pose === 'run') return 'determined';
  return 'neutral';
}

function drawHog(ctx: Canvas2D, options: HedgyOptions, m: Motion, expression: HedgyExpression, look: HedgyLook, t: number) {
  const { pose, prop = 'none', outline } = options;
  const curlMix = pose === 'curl' ? smooth((t - 0.12) / 0.3) : 0;
  if (pose === 'roll' || (pose === 'curl' && curlMix >= 1)) { drawBall(ctx, t, m.roll, outline); return; }
  if (pose === 'curl' && curlMix > 0) ctx.globalAlpha *= 1 - curlMix;

  drawFeet(ctx, pose, t, m.leg);
  drawBody(ctx);
  drawQuillCoat(ctx, pose === 'shock' ? 3.2 * m.burst : 0, outline);
  drawEar(ctx);

  let nearHand: Point;
  if (pose === 'point') nearHand = [look === 'up' ? 27 : look === 'down' ? 29 : 31 + m.arm * 4, look === 'up' ? -40 : look === 'down' ? -18 : -30];
  else if (pose === 'jump' && m.arm > 0.25) nearHand = [23, -36];
  else if (pose === 'wave-off') nearHand = [18 + Math.round(Math.abs(m.arm) * 2), -36 - Math.round(m.arm * 2)];
  else if (pose === 'think') nearHand = [15, -20];
  else if (pose === 'celebrate') nearHand = [23, -36];
  else if (pose === 'carry') nearHand = [10, -43];
  else if (pose === 'push') nearHand = [26, -17];
  else if (pose === 'shock') nearHand = [19, -25];
  else if (pose === 'fall') nearHand = [20, -25];
  else nearHand = [15 + Math.round(m.arm * 1.2), -12 - ((pose === 'walk' || pose === 'run') ? Math.round(m.arm * 2) : 0)];

  const armOrigin: Point = pose === 'jump' || pose === 'celebrate' ? [13, -25]
    : pose === 'wave-off' ? [13, -22]
      : pose === 'carry' ? [12, -24]
        : [12, -17];
  if (pose !== 'idle' && pose !== 'sleep') arm(ctx, armOrigin[0], armOrigin[1], nearHand[0], nearHand[1]);

  drawFaceMask(ctx);
  if (pose !== 'idle' && pose !== 'sleep') paw(ctx, nearHand[0], nearHand[1]);
  if (pose === 'point') line(ctx, nearHand[0] + 2, nearHand[1], nearHand[0] + 6, nearHand[1] - 1, 'E', 1);
  drawEye(ctx, expression, look, m.blink, m.eyeWide, pose);
  if (pose === 'run') drawDust(ctx, t);
  if (pose === 'think') drawThought(ctx, t);
  if (pose === 'sweat' || pose === 'shock') drawSweat(ctx, t);
  if (pose === 'sleep') drawSleepMarks(ctx, t);
  if (pose === 'shock') drawBurst(ctx, m.burst, t);
  if (prop !== 'none') {
    if (pose === 'carry') drawProp(ctx, prop, 10, -50, t);
    else drawProp(ctx, prop, nearHand[0] + 5, nearHand[1] - 5, t);
  }
  if (pose === 'curl' && curlMix > 0) {
    ctx.globalAlpha = Math.max(0, 1 - ctx.globalAlpha);
    drawBall(ctx, t, false, outline);
  }
}

/** Draw the expressive, pixel-grid Hedgy actor. The same inputs always produce the same frame. */
export function drawHedgy(ctx: Canvas2D, options: HedgyOptions): void {
  const t = Math.max(0, options.t), scale = Math.max(0.1, options.scale), facing = options.facing ?? 1;
  const m = motion(options.pose, t), expression = options.expression ?? defaultExpression(options.pose);
  const look = options.look ?? (options.pose === 'idle' ? idleLook(t) : 'forward');
  const extraSquash = Math.max(0.5, Math.min(1.5, options.squash ?? 1));
  ctx.save();
  ctx.translate(Math.round(options.x + m.dx * scale * facing), Math.round(options.y + m.dy * scale));
  ctx.scale(scale * facing, scale);
  ctx.rotate(m.angle);
  ctx.scale(m.sx / Math.sqrt(extraSquash), m.sy * extraSquash);
  drawHog(ctx, options, m, expression, look, t);
  ctx.restore();
}

/** Approximate animated bounds for composition and collision-free label placement. */
export function hedgyBounds(options: HedgyOptions): HedgyBounds {
  const scale = Math.max(0.1, options.scale), facing = options.facing ?? 1, t = Math.max(0, options.t);
  const m = motion(options.pose, t);
  const ball = options.pose === 'roll' || (options.pose === 'curl' && m.ball);
  let leftArt = ball ? -24 : options.pose === 'fall' ? -45 : -31;
  let rightArt = ball ? 24 : options.pose === 'fall' ? 45 : 34;
  let topArt = ball ? -46 : options.pose === 'fall' ? -51 : options.pose === 'shock' ? -61 : -53;
  let bottomArt = ball ? 3 : options.pose === 'fall' ? 8 : 3;
  if (options.prop && options.prop !== 'none') {
    if (options.pose === 'carry') topArt = Math.min(topArt, -67);
    else rightArt = Math.max(rightArt, 58);
  }
  const left = Math.round(options.x + (facing > 0 ? leftArt : -rightArt) * scale + m.dx * scale * facing);
  const right = Math.round(options.x + (facing > 0 ? rightArt : -leftArt) * scale + m.dx * scale * facing);
  const top = Math.round(options.y + (topArt + m.dy) * scale);
  const bottom = Math.round(options.y + (bottomArt + m.dy) * scale);
  return { x: left, y: top, width: right - left, height: bottom - top, left, top, right, bottom };
}

/** Sound suggestions use the same exported landmarks as the animation. */
export function hedgyCues(pose: HedgyPose, duration: number): Cue[] {
  const cues: Cue[] = [];
  const add = (t: number, kind: Cue['kind'], gain = 1) => { if (t >= 0 && t <= duration) cues.push({ t, kind, gain }); };
  if (pose === 'walk' || pose === 'run') {
    const step = pose === 'walk' ? HEDGY_TIMING.walk.step : HEDGY_TIMING.run.step;
    for (let t = step; t <= duration; t += step) add(Number(t.toFixed(3)), 'step', pose === 'run' ? 0.75 : 0.55);
  } else if (pose === 'jump') {
    add(HEDGY_TIMING.jump.anticipate, 'swish', 0.6); add(HEDGY_TIMING.jump.launch, 'boing', 0.7); add(HEDGY_TIMING.jump.land, 'land'); add(HEDGY_TIMING.jump.land + 0.04, 'boing', 0.55);
  } else if (pose === 'shock') {
    add(HEDGY_TIMING.shock.burst, 'crack', 0.55); add(HEDGY_TIMING.shock.recoil, 'boing', 0.8); add(HEDGY_TIMING.shock.settle, 'squeak', 0.45);
  } else if (pose === 'celebrate') {
    for (let t = 0.12; t <= duration; t += HEDGY_TIMING.celebrate.loop) add(Number(t.toFixed(3)), 'boing', 0.65);
    add(0.18, 'sparkle', 0.5);
  } else if (pose === 'point') add(HEDGY_TIMING.point.gesture, 'pop', 0.6);
  else if (pose === 'think') add(HEDGY_TIMING.think.tick, 'tick', 0.45);
  else if (pose === 'fall') { add(HEDGY_TIMING.fall.tumble, 'swish'); add(HEDGY_TIMING.fall.land, 'land'); }
  else if (pose === 'curl') { add(HEDGY_TIMING.curl.tuck, 'snap'); add(HEDGY_TIMING.curl.hold, 'squeak', 0.4); }
  else if (pose === 'roll') for (let t = 0.06; t <= duration; t += HEDGY_TIMING.roll.loop) add(Number(t.toFixed(3)), 'thud', 0.5);
  else if (pose === 'peek') { add(0.08, 'swish', 0.5); add(HEDGY_TIMING.peek.rise, 'pop'); }
  else if (pose === 'wave-off') add(HEDGY_TIMING['wave-off'].shrug, 'squeak', 0.55);
  else if (pose === 'push') for (let t = 0.08; t <= duration; t += HEDGY_TIMING.push.loop) add(Number(t.toFixed(3)), 'thud', 0.45);
  else if (pose === 'carry') add(0.08, 'clack', 0.5);
  else if (pose === 'sweat') for (let t = 0.1; t <= duration; t += HEDGY_TIMING.sweat.drop) add(Number(t.toFixed(3)), 'drop', 0.35);
  return cues.sort((a, b) => a.t - b.t);
}

/** Alias for callers that prefer a cue-oriented name. */
export const cuesForPose = hedgyCues;
