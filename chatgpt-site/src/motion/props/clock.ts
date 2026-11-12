import { Grid, PAL } from '../kit/pixel';
import { ART, drawSprite } from '../kit/sprite';

export const CLOCK_SIZE = { w: 468, h: 468 } as const;
export const HOURGLASS_SIZE = { w: 210, h: 330 } as const;
export const CLOCK_ANCHOR = 'centre' as const;
export const HOURGLASS_ANCHOR = 'centre' as const;
export interface ClockOptions {
  x: number; y: number; t?: number; rot?: number; scale?: number; alpha?: number;
  hour: number; minute: number; ring?: boolean; fast?: boolean; rim?: 'red' | 'blue'; bells?: boolean;
}
export interface HourglassOptions { x: number; y: number; t?: number; rot?: number; scale?: number; alpha?: number; p: number }

const TAU = Math.PI * 2;
const clamp = (v: number) => Math.max(0, Math.min(1, v));
function sprite(key: string, w: number, h: number, paint: (g: Grid) => void) {
  const g = new Grid(w, h); paint(g); return g.sprite(`prop-clock:${key}`);
}
function rotateAround(ctx: CanvasRenderingContext2D, x: number, y: number, rot?: number) {
  ctx.save(); if (rot) { ctx.translate(x, y); ctx.rotate(rot); ctx.translate(-x, -y); }
}

function faceFor(rim: 'red' | 'blue') {
  return sprite(`face-${rim}`, 78, 78, g => {
    const c = rim === 'red' ? PAL.red2 : PAL.blue2;
    const shade = rim === 'red' ? PAL.red3 : PAL.blue4;
    g.ellipse(39, 39, 37, 37, PAL.ink);
    g.ellipse(38, 38, 35, 35, shade);
    g.ellipse(37, 37, 32, 32, c);
    g.ellipse(36, 36, 29, 29, PAL.paper);
    g.ellipse(35, 34, 26, 26, PAL.paper);
    // Twelve thick hour marks and four longer cardinal marks.
    for (let i = 0; i < 12; i++) {
      const a = i * TAU / 12, x = 37 + Math.sin(a) * 22, y = 37 - Math.cos(a) * 22;
      const cardinal = i % 3 === 0, w = cardinal ? 4 : 3, h = cardinal ? 7 : 4;
      g.rect(Math.round(x - w / 2), Math.round(y - h / 2), w, h, PAL.ink);
    }
    // Small feet and crown make the alarm-clock silhouette unmistakable.
    g.rect(17, 67, 12, 5, PAL.ink); g.rect(19, 68, 8, 3, shade);
    g.rect(49, 67, 12, 5, PAL.ink); g.rect(51, 68, 8, 3, shade);
    g.outline();
  });
}

const bell = sprite('bell', 19, 15, g => {
  g.poly([{ x: 2, y: 11 }, { x: 5, y: 4 }, { x: 9, y: 2 }, { x: 13, y: 4 }, { x: 17, y: 11 }], PAL.gold3);
  g.rect(3, 10, 13, 3, PAL.gold2); g.rect(5, 5, 8, 2, PAL.gold1);
  g.rect(1, 13, 17, 2, PAL.ink); g.rect(7, 0, 5, 3, PAL.ink); g.rect(8, 1, 3, 2, PAL.gold1);
  g.outline();
});
const bellNote = sprite('bell-note', 13, 10, g => {
  g.rect(2, 4, 2, 5, PAL.gold1); g.rect(3, 3, 7, 2, PAL.gold1); g.rect(9, 3, 2, 5, PAL.gold1);
  g.rect(1, 8, 4, 2, PAL.gold2); g.rect(8, 7, 4, 2, PAL.gold2);
});

const minuteHand = sprite('minute-hand', 5, 27, g => {
  g.rect(1, 1, 3, 21, PAL.ink); g.rect(2, 2, 1, 18, PAL.grey1);
  g.rect(0, 20, 5, 7, PAL.ink); g.rect(1, 21, 3, 4, PAL.blue4);
  g.outline();
});
const hourHand = sprite('hour-hand', 9, 20, g => {
  g.rect(3, 1, 3, 15, PAL.ink); g.rect(4, 2, 1, 12, PAL.grey1);
  g.rect(1, 14, 7, 6, PAL.ink); g.rect(2, 15, 5, 3, PAL.blue3);
  g.outline();
});
const hub = sprite('hub', 9, 9, g => {
  g.ellipse(4, 4, 4, 4, PAL.ink); g.ellipse(4, 4, 3, 3, PAL.gold2); g.ellipse(3, 3, 1, 1, PAL.gold1);
  g.outline();
});

function smearFor(angle: number) {
  // A broad clock-face sector trails the racing hand in clean pixel steps.
  const key = Math.round(((angle % TAU) + TAU) % TAU * 96);
  const a0 = key / 96, width = 0.88;
  return sprite(`smear-${key}`, 78, 78, g => {
    g.fill((x, y) => {
      const dx = x - 37, dy = 37 - y, r = Math.hypot(dx, dy);
      let a = Math.atan2(dx, dy); if (a < 0) a += TAU;
      let d = (a0 - a + TAU) % TAU;
      return r >= 11 && r <= 30 && d >= 0.08 && d <= width;
    }, PAL.blue1);
    // Break the fan into two bands so it reads like a stepped speed trail.
    g.fill((x, y) => {
      const dx = x - 37, dy = 37 - y, r = Math.hypot(dx, dy);
      let a = Math.atan2(dx, dy); if (a < 0) a += TAU;
      const d = (a0 - a + TAU) % TAU;
      return r >= 18 && r <= 29 && d >= 0.18 && d <= 0.45;
    }, PAL.paperShade, [PAL.blue1]);
  });
}

export function drawClock(ctx: CanvasRenderingContext2D, o: ClockOptions) {
  rotateAround(ctx, o.x, o.y, o.rot);
  const s = o.scale ?? 1, rim = o.rim ?? 'blue', f = faceFor(rim);
  const minuteAngle = o.minute * TAU / 60;
  const hourAngle = (o.hour * 60 + o.minute) * TAU / 720;
  if (o.bells !== false) {
    drawSprite(ctx, bell, o.x - 21 * ART * s, o.y - 37 * ART * s, { scale: s, rot: -0.17, alpha: o.alpha });
    drawSprite(ctx, bell, o.x + 21 * ART * s, o.y - 37 * ART * s, { scale: s, rot: 0.17, alpha: o.alpha });
    if (o.ring) {
      drawSprite(ctx, bellNote, o.x - 34 * ART * s, o.y - 48 * ART * s, { scale: s, alpha: o.alpha });
      drawSprite(ctx, bellNote, o.x + 34 * ART * s, o.y - 49 * ART * s, { scale: s, flip: true, alpha: o.alpha });
    }
  }
  drawSprite(ctx, f, o.x, o.y, { scale: s, alpha: o.alpha });
  if (o.fast) drawSprite(ctx, smearFor(minuteAngle), o.x, o.y, { scale: s, alpha: (o.alpha ?? 1) * 0.34 });
  drawSprite(ctx, hourHand, o.x, o.y, { anchor: [0.5, 1], scale: s, rot: hourAngle, alpha: o.alpha });
  drawSprite(ctx, minuteHand, o.x, o.y, { anchor: [0.5, 1], scale: s, rot: minuteAngle, alpha: o.alpha });
  drawSprite(ctx, hub, o.x, o.y, { scale: s, alpha: o.alpha });
  ctx.restore();
}

function hourglassFor(progress: number) {
  const p = Math.round(clamp(progress) * 20), sandTop = 1 - p / 20;
  return sprite(`hourglass-${p}`, 35, 55, g => {
    // Dark outline, warm wooden uprights and sturdy top/bottom rails.
    g.rect(1, 1, 33, 7, PAL.ink); g.rect(3, 2, 29, 4, PAL.wood2); g.rect(5, 2, 23, 2, PAL.wood1);
    g.rect(1, 47, 33, 7, PAL.ink); g.rect(3, 48, 29, 4, PAL.wood2); g.rect(5, 48, 23, 2, PAL.wood1);
    g.rect(4, 7, 5, 41, PAL.ink); g.rect(5, 8, 2, 38, PAL.wood1); g.rect(7, 8, 2, 38, PAL.wood2);
    g.rect(26, 7, 5, 41, PAL.ink); g.rect(27, 8, 2, 38, PAL.wood1); g.rect(29, 8, 1, 38, PAL.wood3);
    // Clear glass shoulders form the unmistakable pinched silhouette.
    g.line({ x: 9, y: 8 }, { x: 15, y: 25 }, 2, PAL.blue3);
    g.line({ x: 25, y: 8 }, { x: 19, y: 25 }, 2, PAL.blue4);
    g.line({ x: 15, y: 25 }, { x: 17, y: 28 }, 2, PAL.blue3);
    g.line({ x: 19, y: 25 }, { x: 17, y: 28 }, 2, PAL.blue4);
    g.line({ x: 17, y: 28 }, { x: 15, y: 31 }, 2, PAL.blue3);
    g.line({ x: 17, y: 28 }, { x: 19, y: 31 }, 2, PAL.blue4);
    g.line({ x: 15, y: 31 }, { x: 9, y: 47 }, 2, PAL.blue3);
    g.line({ x: 19, y: 31 }, { x: 25, y: 47 }, 2, PAL.blue4);
    // Gold sand, with a narrowing top pile and a growing lower pile.
    const topEnd = 8 + Math.round(18 * Math.sqrt(sandTop));
    g.fill((x, y) => {
      if (y < 9 || y > topEnd) return false;
      const half = Math.max(1, 9 * (1 - (y - 8) / 20));
      return Math.abs(x - 17) <= half;
    }, PAL.gold2);
    g.fill((x, y) => y >= 8 && y <= topEnd && Math.abs(x - 17) <= Math.max(1, 9 * (1 - (y - 8) / 20)) && y < 12, PAL.gold1, [PAL.gold2]);
    const bottomStart = 47 - Math.round(18 * Math.sqrt(p / 20));
    g.fill((x, y) => {
      if (y < bottomStart || y > 46) return false;
      const half = Math.max(1, 9 * ((y - 27) / 20));
      return Math.abs(x - 17) <= half;
    }, PAL.gold2);
    g.fill((x, y) => y >= bottomStart && y <= 46 && Math.abs(x - 17) <= Math.max(1, 9 * ((y - 27) / 20)) && y > 42, PAL.gold1, [PAL.gold2]);
    // The narrow falling stream stays thick enough to read at 100%.
    if (p > 0 && p < 20) g.rect(16, 26, 3, 6, PAL.gold3);
    // Glass highlights sit at the outside edges, never across the sand.
    g.rect(10, 10, 1, 7, PAL.blue1); g.rect(23, 39, 1, 6, PAL.blue1);
    g.outline();
  });
}

export function drawHourglass(ctx: CanvasRenderingContext2D, o: HourglassOptions) {
  rotateAround(ctx, o.x, o.y, o.rot);
  drawSprite(ctx, hourglassFor(o.p), o.x, o.y, { scale: o.scale ?? 1, alpha: o.alpha });
  ctx.restore();
}

export const GALLERY: { name: string; draw(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void }[] = [
  { name: 'clock noon', draw: (ctx, x, y) => drawClock(ctx, { x, y, scale: 0.74, hour: 12, minute: 0, rim: 'blue' }) },
  { name: 'clock half past', draw: (ctx, x, y) => drawClock(ctx, { x, y, scale: 0.74, hour: 3, minute: 30, ring: true, rim: 'red' }) },
  { name: 'clock racing', draw: (ctx, x, y) => drawClock(ctx, { x, y, scale: 0.74, hour: 11, minute: 24, fast: true, rim: 'blue' }) },
  { name: 'clock sweeping', draw: (ctx, x, y, t) => drawClock(ctx, { x, y, scale: 0.74, hour: 11, minute: 18 + t * 60, fast: true, rim: 'blue' }) },
  { name: 'hourglass full', draw: (ctx, x, y) => drawHourglass(ctx, { x, y, p: 0 }) },
  { name: 'hourglass half', draw: (ctx, x, y) => drawHourglass(ctx, { x, y, p: 0.55 }) },
  { name: 'hourglass empty', draw: (ctx, x, y) => drawHourglass(ctx, { x, y, p: 1 }) },
  { name: 'hourglass draining', draw: (ctx, x, y, t) => drawHourglass(ctx, { x, y, p: clamp(0.08 + t * 2.5) }) },
];
