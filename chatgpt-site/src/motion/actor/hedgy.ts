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

// Palette is deliberately confined to natural hedgehog browns, warm cream, and ink.
// K is the one-pixel silhouette ink; the six quill browns each have a distinct job.
const COLORS: Record<string, string> = {
  K: '#291910', Q: '#402719', A: '#573621', B: '#70472b', C: '#8b5c38', D: '#a87347',
  E: '#bd8b58', H: '#d4a66f', F: '#f0d9b3', G: '#e2c69b', S: '#c5a77f', I: '#17120f', W: '#fff0d3',
};

// Hand-authored 1-art-pixel maps. The broken, bright tips give the quills depth at small sizes.
const QUILLS = [
  '        KQK     KQK     KQK     KQK',
  '      KQAAAK  KQAAAK  KQAAAK  KQAAAK',
  '    KQABBBBAKQABBBBAKQABBBBAKQABBBBAK',
  '  KQABCCBBAABCCBBAABCCBBAABCCBBAK',
  ' KQABCCBBABCCBBABCCBBABCCBBABCCBAK',
  'KQABCCBBAABCCBBAABCCBBAABCCBBAABK',
  'KQABCCBBABCCBBABCCBBABCCBBABCCBBAK',
  'KQABCCBBAABCCBBAABCCBBAABCCBBAABCCBAK',
  'KQABCCBBABCCBBABCCBBABCCBBABCCBBABCCBAK',
  'KQABCCBBAABCCBBAABCCBBAABCCBBAABCCBAK',
  'KQABCCBBABCCBBABCCBBABCCBBABCCBBABCCBAK',
  'KQABCCBBAABCCBBAABCCBBAABCCBBAABCCBAK',
  'KQABCCBBABCCBBABCCBBABCCBBABCCBBABCCBAK',
  'KQABCCBBAABCCBBAABCCBBAABCCBBAABCCBAK',
  ' KQABCCBBABCCBBABCCBBABCCBBABCCBBABCCBAK',
  '  KQABCCBBAABCCBBAABCCBBAABCCBBAABCCBAK',
  '   KQABCCBBABCCBBABCCBBABCCBBABCCBBABCCBAK',
  '    KQABCCBBAABCCBBAABCCBBAABCCBBAABCCBAK',
  '      KQABCCBBABCCBBABCCBBABCCBBABCCBBABCCBAK',
  '        KQABCCBBAABCCBBAABCCBBAABCCBBAABCCBAK',
  '          KQABCCBBABCCBBABCCBBABCCBBABCCBBABCCBAK',
  '            KQABCCBBAABCCBBAABCCBBAABCCBBAABCCBAK',
  '              KQABCCBBABCCBBABCCBBABCCBBABCCBBABCCBAK',
  '                KQABCCBBAABCCBBAABCCBBAABCCBBAABCCBAK',
  '                  KQABCCBBABCCBBABCCBBABCCBBABCCBBABCCBAK',
  '                    KQABCCBBAABCCBBAABCCBBAABCCBBAABCCBAK',
  '                      KQABCCBBABCCBBABCCBBABCCBBABCCBAK',
  '                        KQABCCBBAABCCBBAABCCBBAABCCBAK',
  '                          KQABCCBBABCCBBABCCBBABCCBAK',
  '                            KQABCCBBAABCCBBAABCCBAK',
  '                              KQABCCBBABCCBBABCCBAK',
];

const BODY = [
  '             KQAAK',
  '          KQABBBBAK',
  '        KQABBBBBBBAK',
  '      KQABBBBBBBBBBAK',
  '     KQABBBBBBBBBBBBAK',
  '    KQABBBBBCCBBBBBBBAK',
  '   KQABBBBBCCCBBBBBBBBAK',
  '  KQABBBBBCCCCCCBBBBBBBAK',
  ' KQABBBBBCCCCCCGGGGBBBBBAK',
  ' KQABBBBCCCCCCGGGGGGGBBBBAK',
  'KQABBBBCCCCCCGGGGGGGGBBBBAK',
  'KQABBBBCCCCCGGGGGGGGGGBBBBAK',
  'KQABBBBCCCCGGGGGGGGGGGGBBBBAK',
  'KQABBBBCCCCGGGGGGGGGGGGGBBBBAK',
  'KQABBBBCCCCGGGGGGGGGGGGGBBBBAK',
  'KQABBBBCCCCGGGGGGGGGGGGGBBBBAK',
  'KQABBBBCCCBGGGGGGGGGGGGBBBBAK',
  ' KQABBBBCCBBBBGGGGGGGGBBBBAK',
  '  KQABBBBBBBBBBBGGGGGBBBBAK',
  '   KQABBBBBBBBBBBBBBBBBBAK',
  '    KQABBBBBBBBBBBBBBBBAK',
  '      KQABBBBBBBBBBBBBAK',
  '        KQABBBBBBBBBAK',
  '          KQABBBBBAK',
  '         KQABBBBBBBBBAK',
  '          KQABBBBBBBBBBAK',
  '            KQABBBBBBBGGBBAK',
  '              KQABBBBBBGGBBAK',
  '                KQABBBBGBBAK',
  '                  KQABBBBAK',
  '                    KQAAK',
];

const FACE = [
  '              KQAAAK',
  '           KQABBBCCAK',
  '         KQABBBCCCCCBAK',
  '       KQABBBCCCCCCCCCCAK',
  '      KQABBBCCCGGGGGGGCCBAK',
  '     KQABBBCCCGGGGGGGFFGGCCBAK',
  '    KQABBBCCCGGGGGGGGGGGGGCCBAK',
  '   KQABBBCCCGGGGGGGGGFFGGGGGCCBAK',
  '  KQABBBCCCGGGGGGGGGGGGGGGGGGCCBAK',
  '  KQABBBCCCGGGGGGGGGGGGGGGGGGGGCBAK',
  ' KQABBBCCCGGGGGGGGGGGGGGGGGGGGGGCCBAK',
  ' KQABBBCCCGGGGGGGGGGGGGGGGGGGGGGGGCBAK',
  'KQABBBCCCGGGGGGGGGGGGGGGGGGGGGGGGGGCBAK',
  'KQABBBCCCGGGGGGGGGGGGGGGGGGGGGGGGGGCCBAK',
  'KQABBBCCCGGGGGGGGGGGGGGGGGGGGGGGGGCCBAK',
  ' KQABBBCCCGGGGGGGGGGGGGGGGGGGGGGCCBAK',
  '  KQABBBCCCGGGGGGGGGGGGGGGGGGGCCBAK',
  '   KQABBBCCCGGGGGGGGGGGGGGGGCCBAK',
  '    KQABBBCCCGGGGGGGGGGGGGCCBAK',
  '      KQABBBCCCGGGGGGGGGCCBAK',
  '        KQABBBCCCGGGCCBAK',
  '          KQABBBCCAK',
  '            KQABBBCCCGGGGGGGGCCBAK',
  '              KQABBBCCCGGGCCBAK',
  '                KQABBBCCAK',
];

const BALL = [
  '               KQK',
  '          KQK  KQK   KQK',
  '       KQAAAKQAAAKQAAAKQK',
  '     KQABCCABBBCCABBBCCBAK',
  '   KQABCCABBBCCABBBCCABBBBAK',
  ' KQABCCABBBCCABBBCCABBBCCBBBAK',
  'KQABCCABBBCCABBBCCABBBCCABBBBBAK',
  'KQABBBCCABBBCCABBBCCABBBCCABBBBBAK',
  'KQABBBCCABBBCCABBBCCABBBCCABBBBBAK',
  'KQABBBCCABBBCCABBBCCABBBCCABBBBBAK',
  'KQABBBCCABBBCCABBBCCABBBCCABBBBBAK',
  'KQABBBCCABBBCCABBBCCABBBCCABBBBBAK',
  'KQABBBCCABBBCCABBBCCABBBCCABBBBBAK',
  'KQABBBCCABBBCCABBBCCABBBCCABBBBBAK',
  'KQABBBCCABBBCCABBBCCABBBCCABBBBBAK',
  'KQABBBCCABBBCCABBBCCABBBCCABBBBBAK',
  'KQABBBCCABBBCCABBBCCABBBCCABBBBBAK',
  ' KQABBBCCABBBCCABBBCCABBBCCABBBBBAK',
  '  KQABBBCCABBBCCABBBCCABBBCCABBBBAK',
  '   KQABBBCCABBBCCABBBCCABBBCCABBBBAK',
  '     KQABBBCCABBBCCABBBCCABBBCCBBAK',
  '       KQABBBCCABBBCCABBBCCABBBBAK',
  '         KQABBBCCABBBCCABBBCCBAK',
  '           KQABBBCCABBBCCBAK',
  '              KQABBBBBAK',
  '                 KQK',
];

type Canvas2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Motion = { dx: number; dy: number; sx: number; sy: number; angle: number; leg: number; arm: number; burst: number; blink: boolean; eyeWide: boolean; ball: boolean; roll: boolean };
const TAU = Math.PI * 2;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => { const x = clamp01(n); return x * x * (3 - 2 * x); };
const pulse = (t: number, start: number, duration: number) => Math.sin(Math.PI * clamp01((t - start) / duration));
const px = (ctx: Canvas2D, x: number, y: number, w: number, h = w, color = 'K') => {
  ctx.fillStyle = COLORS[color] ?? color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
};

function drawMap(ctx: Canvas2D, map: readonly string[], x: number, y: number, outline?: string) {
  for (let row = 0; row < map.length; row++) {
    const line = map[row]!;
    for (let col = 0; col < line.length; col++) {
      const cell = line[col]!;
      if (cell !== ' ') px(ctx, x + col, y + row, 1, 1, cell === 'K' && outline ? outline : cell);
    }
  }
}

function segment(ctx: Canvas2D, x1: number, y1: number, x2: number, y2: number, inner: string, width = 5) {
  // Bresenham cells keep arms and legs crisp, including on diagonals.
  const xStart = Math.round(x1), yStart = Math.round(y1), xEnd = Math.round(x2), yEnd = Math.round(y2);
  const dx = Math.abs(xEnd - xStart), sx = xStart < xEnd ? 1 : -1;
  const dy = -Math.abs(yEnd - yStart), sy = yStart < yEnd ? 1 : -1;
  let err = dx + dy, x = xStart, y = yStart;
  for (;;) {
    px(ctx, x - width / 2, y - width / 2, width + 2, width + 2, 'K');
    px(ctx, x - width / 2 + 1, y - width / 2 + 1, width, width, inner);
    if (x === xEnd && y === yEnd) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

function paw(ctx: Canvas2D, x: number, y: number, color = 'D') {
  px(ctx, x - 3, y - 2, 7, 5, 'K');
  px(ctx, x - 2, y - 1, 5, 3, color);
  px(ctx, x - 1, y - 1, 2, 1, 'H');
  px(ctx, x + 2, y + 1, 1, 1, 'K');
}

function drawLegs(ctx: Canvas2D, pose: HedgyPose, t: number, leg: number, squashY: number) {
  if (pose === 'curl' || pose === 'roll' || pose === 'fall') return;
  const stride = pose === 'run' ? 7 : pose === 'walk' ? 5 : pose === 'push' ? 3 : 0;
  const lift = pose === 'run' ? 4 : pose === 'walk' ? 2 : 0;
  const l = leg * stride;
  const leftX = -6 + l, rightX = 8 - l;
  const leftLift = Math.max(0, leg) * lift, rightLift = Math.max(0, -leg) * lift;
  segment(ctx, -1, -7 * squashY, leftX, -2 - leftLift, 'B', 4);
  segment(ctx, 9, -7 * squashY, rightX, -2 - rightLift, 'C', 4);
  px(ctx, leftX - 4, -2 - leftLift, 7, 3, 'K'); px(ctx, leftX - 3, -2 - leftLift, 6, 2, 'D');
  px(ctx, rightX - 4, -2 - rightLift, 7, 3, 'K'); px(ctx, rightX - 3, -2 - rightLift, 6, 2, 'E');
}

function drawFace(ctx: Canvas2D, expression: HedgyExpression, look: HedgyLook, blink: boolean, eyeWide: boolean, pose: HedgyPose) {
  // Face-map origin is (1,-46); these eye coordinates expose the near eye and a tiny far-eye glint.
  const eyeX = 22, eyeY = -34;
  const gazeX = look === 'camera' ? -1 : 0;
  const gazeY = look === 'up' ? -1 : look === 'down' ? 1 : 0;
  if (blink || pose === 'sleep') {
    px(ctx, eyeX - 1, eyeY + 1, 5, 1, 'K');
    px(ctx, eyeX, eyeY, 3, 1, 'D');
  } else if (expression === 'shocked' || eyeWide) {
    px(ctx, eyeX - 1, eyeY - 1, 5, 6, 'F'); px(ctx, eyeX, eyeY, 3, 4, 'I');
    px(ctx, eyeX + gazeX, eyeY + gazeY, 1, 1, 'W');
  } else {
    px(ctx, eyeX - 1, eyeY, 5, 4, 'K'); px(ctx, eyeX + gazeX, eyeY + gazeY, 2, 3, 'I');
    px(ctx, eyeX + gazeX, eyeY + gazeY, 1, 1, 'W');
  }
  px(ctx, 15, -34, 2, 2, 'I'); // far eye, softened by the 3/4 angle
  px(ctx, 15, -35, 1, 1, 'W');

  if (expression === 'worried' || expression === 'sad') {
    segment(ctx, 20, -37, 24, -38, 'A', 1);
    px(ctx, 28, -25, 5, 1, 'K'); px(ctx, 29, -26, 3, 1, 'K');
  } else if (expression === 'determined') {
    segment(ctx, 19, -38, 24, -36, 'A', 1);
    px(ctx, 28, -24, 5, 1, 'K');
  } else if (expression === 'smug') {
    px(ctx, 20, -37, 5, 1, 'A'); px(ctx, 29, -24, 4, 1, 'A'); px(ctx, 32, -25, 2, 1, 'K');
  } else if (expression === 'shocked') {
    px(ctx, 29, -26, 3, 4, 'K'); px(ctx, 30, -25, 1, 2, 'S');
  } else if (expression === 'happy') {
    px(ctx, 28, -24, 2, 1, 'K'); px(ctx, 30, -23, 3, 1, 'K'); px(ctx, 33, -24, 2, 1, 'K');
    px(ctx, 30, -23, 2, 1, 'F');
  } else {
    px(ctx, 29, -24, 4, 1, 'K');
  }
  // Nose and nostril sit on the cream muzzle; a single pale glint keeps it readable at small sizes.
  px(ctx, 35, -29, 3, 3, 'K'); px(ctx, 35, -29, 2, 2, 'I'); px(ctx, 35, -29, 1, 1, 'W');
}

function idleLook(t: number): HedgyLook {
  const p = t % HEDGY_TIMING.idle.loop;
  if (p > 0.55 && p < 0.82) return 'up';
  if (p > 1.2 && p < 1.48) return 'camera';
  if (p > 1.92 && p < 2.15) return 'down';
  return 'forward';
}

function drawArmLine(ctx: Canvas2D, x: number, y: number, handX: number, handY: number, raised = false) {
  segment(ctx, x, y, raised ? x - 2 : (x + handX) / 2, raised ? y - 7 : (y + handY) / 2, 'B', 4);
  segment(ctx, raised ? x - 2 : (x + handX) / 2, raised ? y - 7 : (y + handY) / 2, handX, handY, 'C', 4);
}
function drawProp(ctx: Canvas2D, prop: HedgyProp, x: number, y: number, t: number) {
  if (prop === 'none') return;
  const wiggle = Math.round(Math.sin(t * 4) * 0.35);
  if (prop === 'coin') {
    px(ctx, x - 5, y - 5 + wiggle, 11, 11, 'K'); px(ctx, x - 4, y - 4 + wiggle, 9, 9, 'E');
    px(ctx, x - 3, y - 3 + wiggle, 7, 7, 'H'); px(ctx, x - 1, y - 2 + wiggle, 1, 5, 'D'); px(ctx, x + 1, y - 2 + wiggle, 1, 5, 'D');
  } else if (prop === 'sign') {
    px(ctx, x - 1, y - 1, 2, 11, 'K'); px(ctx, x, y, 1, 9, 'D');
    px(ctx, x - 8, y - 14, 17, 14, 'K'); px(ctx, x - 7, y - 13, 15, 12, 'S');
    px(ctx, x - 5, y - 10, 3, 2, 'B'); px(ctx, x, y - 10, 7, 2, 'A'); px(ctx, x - 4, y - 6, 11, 1, 'D');
  } else if (prop === 'phone') {
    px(ctx, x - 5, y - 11, 10, 16, 'K'); px(ctx, x - 4, y - 10, 8, 13, 'A');
    px(ctx, x - 3, y - 9, 6, 10, 'S'); px(ctx, x - 2, y - 8, 4, 2, 'F'); px(ctx, x - 1, y + 3, 2, 1, 'H');
  } else if (prop === 'umbrella') {
    px(ctx, x - 11, y - 13, 4, 2, 'A'); px(ctx, x - 7, y - 16, 5, 3, 'B'); px(ctx, x - 2, y - 17, 7, 2, 'D'); px(ctx, x + 5, y - 15, 5, 2, 'B'); px(ctx, x + 10, y - 13, 3, 2, 'A');
    px(ctx, x - 11, y - 11, 23, 1, 'K'); px(ctx, x, y - 10, 1, 13, 'K'); px(ctx, x, y + 3, 4, 2, 'K');
  } else if (prop === 'briefcase') {
    px(ctx, x - 10, y - 9, 21, 14, 'K'); px(ctx, x - 8, y - 7, 17, 10, 'A'); px(ctx, x - 7, y - 6, 15, 7, 'D');
    px(ctx, x - 3, y - 12, 8, 3, 'K'); px(ctx, x - 2, y - 11, 6, 2, 'C'); px(ctx, x - 1, y - 4, 3, 3, 'F');
  } else if (prop === 'magnifier') {
    px(ctx, x - 7, y - 14, 13, 13, 'K'); px(ctx, x - 5, y - 12, 9, 9, 'S'); px(ctx, x - 4, y - 11, 6, 6, 'F');
    px(ctx, x + 4, y - 1, 3, 3, 'K'); px(ctx, x + 6, y + 1, 3, 8, 'K'); px(ctx, x + 7, y + 2, 1, 6, 'D');
  }
}

function motion(pose: HedgyPose, t: number): Motion {
  const m: Motion = { dx: 0, dy: 0, sx: 1, sy: 1, angle: 0, leg: 0, arm: 0, burst: 0, blink: false, eyeWide: false, ball: false, roll: false };
  const phase = (period: number) => (t % period) / period;
  switch (pose) {
    case 'idle': {
      m.dy = -Math.sin(t * TAU / 2.4) * 0.7; m.sy = 1 + Math.sin(t * TAU / 2.4) * 0.012;
      m.blink = (t % 2.4 > 1.66 && t % 2.4 < 1.78) || (t % 2.4 > 0.04 && t % 2.4 < 0.11);
      break;
    }
    case 'walk': {
      const p = phase(HEDGY_TIMING.walk.loop); m.leg = Math.sin(p * TAU); m.arm = m.leg;
      m.dy = -Math.abs(Math.sin(p * TAU)) * 1.3; m.angle = 0.025 * m.leg; break;
    }
    case 'run': {
      const p = phase(HEDGY_TIMING.run.loop); m.leg = Math.sin(p * TAU); m.arm = m.leg;
      m.dy = -2 - Math.abs(Math.sin(p * TAU)) * 3; m.angle = 0.09; m.sx = 1.05; m.sy = 0.96 + Math.abs(Math.sin(p * TAU)) * 0.07; break;
    }
    case 'jump': {
      const { anticipate, launch, apex, land, settle } = HEDGY_TIMING.jump;
      if (t < anticipate) { const p = smooth(t / anticipate); m.sy = 1 - 0.18 * p; m.sx = 1 + 0.13 * p; m.dy = 2 * p; }
      else if (t < launch) { const p = smooth((t - anticipate) / (launch - anticipate)); m.dy = 2 - 32 * p; m.sy = 1.14; m.sx = 0.92; m.arm = p; }
      else if (t < apex) { const p = smooth((t - launch) / (apex - launch)); m.dy = -30 - 6 * p; m.sy = 1.14 - 0.04 * p; m.sx = 0.92 + 0.03 * p; m.arm = 1 - 0.15 * p; }
      else if (t < land) { const p = smooth((t - apex) / (land - apex)); m.dy = -34 + 32 * p; m.sy = 1.1 - 0.1 * p; m.sx = 0.95 + 0.05 * p; m.arm = 1 - p * 0.25; }
      else { const p = Math.exp(-(t - land) * 8); m.dy = -4 * p * Math.sin((t - land) * 18) - Math.sin((t - settle) * 3) * 0.25; m.sy = 1 - 0.2 * p + Math.sin((t - settle) * 3) * 0.004; m.sx = 1 + 0.14 * p; }
      m.blink = t < anticipate * 0.9 || (t > settle && t < settle + 0.1); break;
    }
    case 'shock': {
      const p = smooth(t / HEDGY_TIMING.shock.recoil); m.dy = -pulse(t, 0.03, 0.48) * 8; m.dx = -smooth(t / 0.32) * 5;
      m.sx = 1 + pulse(t, 0.02, 0.28) * 0.12; m.sy = 1 + pulse(t, 0.02, 0.28) * 0.12; m.angle = -0.08 * (1 - p); m.burst = 1 - smooth(t / 0.46); m.eyeWide = t > 0.05; break;
    }
    case 'celebrate': {
      const p = phase(HEDGY_TIMING.celebrate.loop); m.dy = -Math.abs(Math.sin(p * TAU)) * 4; m.sy = 1 - Math.max(0, Math.sin(p * TAU)) * 0.08;
      m.sx = 1 + Math.max(0, Math.sin(p * TAU)) * 0.06; m.arm = 1; break;
    }
    case 'point': m.arm = smooth(t / HEDGY_TIMING.point.gesture); m.dy = -Math.sin(t * 3) * 0.45; break;
    case 'think': m.angle = -0.045; m.arm = 0.4 + 0.08 * Math.sin(t * 3); m.blink = t % 1.8 > 1.58 && t % 1.8 < 1.7; break;
    case 'push': m.angle = 0.13; m.sx = 1.06; m.sy = 0.94 + 0.04 * Math.sin(t * TAU / 0.9); m.leg = Math.sin(t * TAU / 0.9); m.arm = 0.7 + 0.12 * Math.sin(t * TAU / 0.9); break;
    case 'carry': m.dy = -Math.abs(Math.sin(t * TAU / 0.84)) * 1.5; m.arm = 1; m.sx = 1 + 0.012 * Math.sin(t * 4); break;
    case 'fall': {
      const p = smooth(t / HEDGY_TIMING.fall.tumble); m.angle = p * Math.PI * 1.65;
      m.dy = t < HEDGY_TIMING.fall.land ? -Math.sin(Math.PI * clamp01(t / 0.78)) * 8 : 2;
      m.sx = t > 0.72 && t < 0.95 ? 1.22 : 1; m.sy = t > 0.72 && t < 0.95 ? 0.78 : 1; m.arm = 1; break;
    }
    case 'curl': m.ball = t >= HEDGY_TIMING.curl.tuck; m.sx = t < HEDGY_TIMING.curl.tuck ? 1 + smooth(t / 0.3) * 0.1 : 0.9; m.sy = t < HEDGY_TIMING.curl.tuck ? 1 - smooth(t / 0.3) * 0.12 : 0.88; break;
    case 'roll': m.ball = true; m.roll = true; m.dx = Math.sin(t * TAU / 1.6) * 10; m.dy = -Math.abs(Math.sin(t * TAU / HEDGY_TIMING.roll.loop)) * 1.2; break;
    case 'peek': m.dy = 15 * (1 - smooth(t / HEDGY_TIMING.peek.rise)) - (t > 0.42 ? Math.sin((t - 0.42) * 8) * 0.55 : 0); m.blink = t < 0.14; break;
    case 'sweat': m.dx = Math.sin(t * 18) * 0.45; m.dy = -Math.abs(Math.sin(t * 18)) * 0.8; m.angle = Math.sin(t * 9) * 0.025; m.blink = t % 1.1 > 0.9 && t % 1.1 < 0.98; break;
    case 'sleep': m.sy = 1 + Math.sin(t * TAU / 3.2) * 0.025; m.sx = 1 - Math.sin(t * TAU / 3.2) * 0.015; m.blink = true; break;
    case 'wave-off': { const p = phase(HEDGY_TIMING['wave-off'].loop); m.arm = Math.sin(p * TAU); m.dy = -Math.abs(Math.sin(p * TAU)) * 1.3; break; }
  }
  const blinkClock = t % 3.15;
  if (pose !== 'sleep' && blinkClock > 2.95 && blinkClock < 3.08) m.blink = true;
  return m;
}

function drawBurst(ctx: Canvas2D, amount: number, t: number) {
  if (amount <= 0.03) return;
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI * 0.92 + i * Math.PI * 0.82 / (n - 1);
    const reach = 25 + Math.round((1 - amount) * 4) + (i % 3 === 0 ? 4 : 0);
    const x = -6 + Math.round(Math.cos(a) * reach), y = -43 + Math.round(Math.sin(a) * reach);
    const len = i % 3 === 0 ? 4 : 3;
    px(ctx, x, y + Math.round(Math.sin(t * 17 + i) * amount), len, 2, i % 2 ? 'A' : 'H');
  }
}

function drawThought(ctx: Canvas2D, t: number) {
  if (Math.sin(t * TAU / HEDGY_TIMING.think.loop) > 0.15) {
    px(ctx, 29, -54, 3, 3, 'S'); px(ctx, 34, -59, 5, 5, 'S');
    px(ctx, 35, -60, 3, 1, 'F'); px(ctx, 43, -66, 10, 8, 'K'); px(ctx, 44, -65, 8, 6, 'F');
    px(ctx, 46, -63, 2, 1, 'A'); px(ctx, 48, -63 + (Math.floor(t * 3) % 2), 1, 2, 'A');
  }
}

function drawSweat(ctx: Canvas2D, t: number) {
  const p = (t % HEDGY_TIMING.sweat.drop) / HEDGY_TIMING.sweat.drop;
  const y = -45 + Math.floor(p * 8);
  px(ctx, 43, y, 2, 3, 'S'); px(ctx, 44, y - 1, 1, 1, 'F');
  px(ctx, 48, -38 + Math.floor(((p + 0.5) % 1) * 7), 1, 2, 'S');
}

function drawDust(ctx: Canvas2D, t: number) {
  const phase = (t % HEDGY_TIMING.run.loop) / HEDGY_TIMING.run.loop;
  if (phase > 0.34) return;
  const spread = Math.round(phase / 0.34 * 5), fade = Math.round(phase / 0.34 * 2);
  const x = -18 - spread, y = -2 - fade;
  px(ctx, x, y, 4, 2, 'S'); px(ctx, x + 2, y - 1, 3, 1, 'G'); px(ctx, x - 2, y + 1, 2, 1, 'D');
}

function drawSleepMarks(ctx: Canvas2D, t: number) {
  const shift = Math.floor((t % 2.4) * 1.4);
  const x = 42 + shift, y = -56 - shift;
  px(ctx, x, y, 6, 1, 'S'); px(ctx, x + 4, y, 1, 3, 'S'); px(ctx, x + 2, y + 2, 3, 1, 'S'); px(ctx, x, y + 4, 6, 1, 'S');
}

function drawBall(ctx: Canvas2D, t: number, rolling: boolean, outline?: string) {
  ctx.save();
  if (rolling) { ctx.translate(0, -15); ctx.rotate(t * TAU / HEDGY_TIMING.roll.revolution); ctx.translate(0, 15); }
  drawMap(ctx, BALL, -18, -29, outline);
  // A folded cream muzzle and a single tucked eye keep the curled silhouette unmistakably Hedgy.
  px(ctx, 4, -19, 10, 7, 'K'); px(ctx, 5, -18, 8, 5, 'G'); px(ctx, 12, -17, 3, 3, 'F');
  px(ctx, 2, -24, 2, 2, 'I'); px(ctx, 2, -25, 1, 1, 'W');
  if (rolling && Math.floor(t * 12) % 2 === 0) { px(ctx, -15, -13, 3, 2, 'H'); px(ctx, 17, -24, 2, 3, 'H'); }
  ctx.restore();
}

function drawHog(ctx: Canvas2D, options: HedgyOptions, m: Motion, expression: HedgyExpression, look: HedgyLook, t: number) {
  const { pose, prop = 'none', outline } = options;
  const curlMix = pose === 'curl' ? smooth((t - 0.12) / 0.3) : 0;
  drawLegs(ctx, pose, t, m.leg, m.sy);
  if (pose === 'roll' || (pose === 'curl' && curlMix >= 1)) {
    drawBall(ctx, t, m.roll, outline); return;
  }
  if (pose === 'curl' && curlMix > 0) { ctx.save(); ctx.globalAlpha *= 1 - curlMix; }

  const frontPaw = pose === 'point'
    ? { x: look === 'up' ? 22 : look === 'down' ? 31 : 40, y: look === 'up' ? -47 : look === 'down' ? -22 : -33 }
    : pose === 'jump' && m.arm > 0.25 ? { x: 22, y: -47 }
    : pose === 'wave-off' ? { x: 26 + m.arm * 4, y: -39 + m.arm * 8 }
    : pose === 'think' ? { x: 21, y: -31 }
      : pose === 'celebrate' ? { x: 29, y: -48 }
        : pose === 'carry' ? { x: 20, y: -59 }
          : pose === 'push' ? { x: 38, y: -22 }
            : pose === 'shock' ? { x: 27, y: -34 }
              : pose === 'fall' ? { x: 25, y: -32 }
                : { x: 18 + m.arm * 1.5, y: -18 - (pose === 'walk' || pose === 'run' ? m.arm * 4 : 0) };
  const farPaw = pose === 'celebrate' || (pose === 'jump' && m.arm > 0.25) ? { x: -8, y: -47 }
    : pose === 'wave-off' ? { x: -8 - m.arm * 2, y: -39 - m.arm * 8 }
    : pose === 'carry' ? { x: 4, y: -59 }
      : pose === 'point' ? { x: 2, y: -23 }
        : { x: -2 - m.arm, y: -23 + m.arm * 2 };
  const armsRaised = pose === 'celebrate' || pose === 'carry' || (pose === 'jump' && m.arm > 0.25) || (pose === 'wave-off' && m.arm > 0);
  const drawArms = pose !== 'curl';
  drawMap(ctx, QUILLS, -31, -59, outline);
  // Pale, tapered tips catch the light across the dark shell.
  for (const [x, y] of [[-22, -58], [-16, -57], [-9, -58], [-3, -57]] as const) {
    px(ctx, x, y + Math.round(Math.sin(t * 4 + x) * 0.5), 2, 1, 'H');
  }
  drawMap(ctx, BODY, -11, -39, outline);
  if (drawArms) {
    drawArmLine(ctx, -6, -28, farPaw.x, farPaw.y, armsRaised);
    if (pose !== 'idle' && pose !== 'sleep') drawArmLine(ctx, 12, -25, frontPaw.x, frontPaw.y, armsRaised);
  }
  drawMap(ctx, FACE, 1, -46, outline);
  drawFace(ctx, expression, look, m.blink || pose === 'sleep', m.eyeWide, pose);
  if (drawArms) {
    paw(ctx, farPaw.x, farPaw.y, 'D');
    if (pose !== 'idle' && pose !== 'sleep') paw(ctx, frontPaw.x, frontPaw.y, 'D');
  }
  if (pose === 'run') drawDust(ctx, t);
  if (pose === 'think') drawThought(ctx, t);
  if (pose === 'sweat' || pose === 'shock') drawSweat(ctx, t);
  if (pose === 'sleep') drawSleepMarks(ctx, t);
  if (pose === 'shock') drawBurst(ctx, m.burst, t);
  if (prop !== 'none') {
    const overhead = pose === 'carry';
    const propX = overhead ? 14 : frontPaw.x + 7;
    const propY = overhead ? -63 : frontPaw.y - 5;
    drawProp(ctx, prop, propX, propY, t);
  }
  if (pose === 'curl' && curlMix > 0) {
    ctx.restore(); ctx.save(); ctx.globalAlpha *= curlMix; drawBall(ctx, t, false, outline); ctx.restore();
  }
}

function defaultExpression(pose: HedgyPose): HedgyExpression {
  if (pose === 'shock') return 'shocked';
  if (pose === 'sweat' || pose === 'push' || pose === 'fall') return 'worried';
  if (pose === 'sleep') return 'neutral';
  if (pose === 'celebrate' || pose === 'wave-off') return 'happy';
  if (pose === 'run') return 'determined';
  return 'happy';
}

/** Draw the expressive, hand-pixeled Hedgy actor. The same inputs always produce the same frame. */
export function drawHedgy(ctx: Canvas2D, options: HedgyOptions): void {
  const t = Math.max(0, options.t), scale = Math.max(0.1, options.scale), facing = options.facing ?? 1;
  const m = motion(options.pose, t), expression = options.expression ?? defaultExpression(options.pose), look = options.look ?? (options.pose === 'idle' ? idleLook(t) : 'forward');
  const extraSquash = Math.max(0.5, Math.min(1.5, options.squash ?? 1));
  const angle = m.angle + (options.pose === 'push' ? 0 : 0);
  ctx.save();
  ctx.translate(Math.round(options.x + m.dx * scale * facing), Math.round(options.y + m.dy * scale));
  ctx.scale(scale * facing, scale);
  ctx.rotate(angle);
  ctx.scale(m.sx / Math.sqrt(extraSquash), m.sy * extraSquash);
  if (m.roll) {
    // Keep the moving ball close to its feet baseline while it rolls through its art-pixel orbit.
    ctx.translate(0, 0);
  }
  drawHog(ctx, options, m, expression, look, t);
  ctx.restore();
}

/** Approximate animated bounds for composition and collision-free label placement. */
export function hedgyBounds(options: HedgyOptions): HedgyBounds {
  const scale = Math.max(0.1, options.scale), facing = options.facing ?? 1, m = motion(options.pose, Math.max(0, options.t));
  const ball = options.pose === 'roll' || (options.pose === 'curl' && m.ball);
  let leftArt = ball ? -19 : options.pose === 'fall' ? -82 : -34;
  let rightArt = ball ? 20 : options.pose === 'fall' ? 82 : 43;
  let topArt = options.pose === 'roll' ? -44 : options.pose === 'fall' ? -82 : options.pose === 'curl' && m.ball ? -31 : -70;
  let bottomArt = options.pose === 'roll' ? 13 : options.pose === 'fall' ? 82 : options.pose === 'curl' && m.ball ? 1 : 2;
  if (options.prop && options.prop !== 'none') {
    if (options.pose === 'carry') topArt = Math.min(topArt, -82);
    else rightArt = Math.max(rightArt, 62);
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
