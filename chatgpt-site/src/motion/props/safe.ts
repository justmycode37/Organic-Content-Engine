import { Grid, PAL } from '../kit/pixel';
import { ART, drawSprite } from '../kit/sprite';

export const SAFE_SIZE = { w: 528, h: 564 } as const;
export const PADLOCK_SIZE = { w: 168, h: 204 } as const;
export const SAFE_ANCHOR = 'bottom-centre' as const;
export const PADLOCK_ANCHOR = 'centre' as const;
export interface SafeOptions {
  x: number; y: number; t?: number; rot?: number; scale?: number; alpha?: number;
  door?: number; dial?: number; locked?: boolean; contents?: 'empty' | 'cash';
}
export interface PadlockOptions { x: number; y: number; t?: number; rot?: number; scale?: number; alpha?: number; shut?: number }
export interface SafeRect { x: number; y: number; w: number; h: number }

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const ease = (v: number) => { const p = clamp(v); return p * p * (3 - 2 * p); };
function sprite(key: string, w: number, h: number, paint: (g: Grid) => void) {
  const g = new Grid(w, h); paint(g); return g.sprite(`prop-safe:${key}`);
}
function rotateAround(ctx: CanvasRenderingContext2D, x: number, y: number, rot?: number) {
  ctx.save(); if (rot) { ctx.translate(x, y); ctx.rotate(rot); ctx.translate(-x, -y); }
}

const shell = sprite('shell', 88, 94, g => {
  // Broad steel body, dark cavity, lit bevel and feet form the silhouette.
  g.round(8, 7, 72, 76, 8, PAL.blue3);
  g.rect(10, 10, 3, 66, PAL.blue1);
  g.rect(13, 9, 58, 3, PAL.blue1);
  g.rect(73, 12, 5, 63, PAL.blue4);
  g.rect(15, 77, 56, 3, PAL.blue4);
  g.round(13, 18, 62, 57, 5, PAL.ink);
  g.round(16, 21, 56, 51, 3, PAL.blue4);
  g.round(18, 23, 52, 47, 2, PAL.black);
  g.rect(19, 24, 49, 2, PAL.blue3);
  g.rect(19, 67, 49, 2, PAL.blue4);
  // Large cast hinges on the left edge remain visible when the door swings.
  for (const y of [25, 42, 59]) {
    g.round(8, y, 9, 8, 2, PAL.ink);
    g.rect(9, y + 1, 6, 5, PAL.blue1);
    g.rect(10, y + 5, 5, 2, PAL.blue3);
  }
  // Four chunky bolts, two feet and a plinth.
  for (const [x, y] of [[16, 12], [68, 12], [16, 72], [68, 72]]) {
    g.round(x, y, 5, 5, 1, PAL.ink); g.rect(x + 1, y + 1, 3, 2, PAL.grey1);
  }
  g.rect(9, 82, 70, 6, PAL.ink); g.rect(12, 82, 64, 4, PAL.blue3); g.rect(16, 83, 56, 2, PAL.blue2);
  g.rect(15, 87, 13, 5, PAL.ink); g.rect(17, 87, 9, 3, PAL.blue4);
  g.rect(60, 87, 13, 5, PAL.ink); g.rect(62, 87, 9, 3, PAL.blue4);
  g.outline();
});

const door = sprite('door', 70, 62, g => {
  // A wide hinge spine stays attached to the safe body as the door swings.
  g.round(2, 7, 13, 48, 3, PAL.blue4);
  g.rect(4, 9, 3, 43, PAL.blue1);
  for (const y of [13, 29, 45]) { g.rect(9, y, 5, 5, PAL.ink); g.rect(10, y + 1, 3, 2, PAL.grey1); }
  // Thick round safe door with a deep steel rim and a bright blue face.
  g.ellipse(39, 31, 30, 30, PAL.blue4);
  g.ellipse(38, 30, 27, 27, PAL.blue1);
  g.ellipse(38, 30, 23, 23, PAL.blue2);
  g.ellipse(38, 30, 19, 19, PAL.blue3);
  g.ellipse(38, 30, 15, 15, PAL.blue2);
  g.ellipse(36, 27, 11, 10, PAL.blue1);
  // A broad inset ring and large bolt heads give the door real weight.
  g.ellipse(30, 30, 8, 8, PAL.blue4);
  for (const [x, y] of [[19, 11], [56, 11], [19, 49], [56, 49]]) {
    g.round(x, y, 5, 5, 1, PAL.ink); g.rect(x + 1, y + 1, 3, 2, PAL.grey1);
  }
  g.outline();
});

const wheel = sprite('wheel', 27, 27, g => {
  // Brass dial and four unmistakable spokes, all two or more art pixels wide.
  g.ellipse(13, 13, 12, 12, PAL.ink);
  g.ellipse(12, 12, 10, 10, PAL.gold3);
  g.ellipse(12, 12, 7, 7, PAL.gold1);
  g.rect(10, 1, 5, 10, PAL.gold3); g.rect(11, 2, 2, 7, PAL.gold1);
  g.rect(10, 15, 5, 10, PAL.gold3); g.rect(11, 18, 2, 6, PAL.gold1);
  g.rect(1, 10, 10, 5, PAL.gold3); g.rect(2, 11, 6, 2, PAL.gold1);
  g.rect(15, 10, 10, 5, PAL.gold3); g.rect(18, 11, 6, 2, PAL.gold1);
  g.ellipse(13, 13, 4, 4, PAL.ink); g.ellipse(12, 12, 2, 2, PAL.gold1);
  g.outline();
});

const cashBundle = sprite('cash', 36, 18, g => {
  g.poly([{ x: 3, y: 8 }, { x: 28, y: 4 }, { x: 34, y: 9 }, { x: 8, y: 14 }], PAL.green4);
  g.poly([{ x: 2, y: 5 }, { x: 28, y: 1 }, { x: 34, y: 6 }, { x: 8, y: 11 }], PAL.green2);
  g.poly([{ x: 2, y: 4 }, { x: 27, y: 1 }, { x: 31, y: 4 }, { x: 7, y: 8 }], PAL.green1);
  g.rect(15, 3, 4, 4, PAL.green3); g.rect(16, 4, 2, 2, PAL.paper);
  g.rect(25, 3, 4, 1, PAL.green4); g.rect(26, 4, 3, 1, PAL.green4); g.rect(25, 5, 4, 1, PAL.green4);
  g.outline();
});

const padBody = sprite('padlock-body', 28, 23, g => {
  g.round(1, 1, 26, 21, 4, PAL.gold3);
  g.round(3, 3, 21, 17, 3, PAL.gold2);
  g.rect(5, 4, 15, 3, PAL.gold1); g.rect(22, 7, 2, 10, PAL.gold3);
  // Keyhole is a large dark key shape, visible at gallery size.
  g.ellipse(14, 10, 3, 3, PAL.ink); g.rect(12, 11, 5, 6, PAL.ink);
  g.rect(13, 12, 3, 4, PAL.black);
  g.outline();
});

function shackleFor(open: number) {
  const p = Math.round(clamp(open) * 12);
  return sprite(`shackle-${p}`, 25, 22, g => {
    // Heavy steel U-loop. The right leg lifts smoothly as the lock opens.
    const rightEnd = 20 - p * 1.25;
    g.line({ x: 5, y: 18 }, { x: 5, y: 8 }, 4, PAL.grey4);
    g.line({ x: 5, y: 8 }, { x: 8, y: 4 }, 4, PAL.grey4);
    g.line({ x: 8, y: 4 }, { x: 17, y: 4 }, 4, PAL.grey4);
    g.line({ x: 17, y: 4 }, { x: 20, y: 8 }, 4, PAL.grey4);
    g.line({ x: 20, y: 8 }, { x: 20, y: rightEnd }, 4, PAL.grey4);
    g.line({ x: 5, y: 8 }, { x: 5, y: 16 }, 2, PAL.grey1);
    g.line({ x: 8, y: 5 }, { x: 16, y: 5 }, 2, PAL.grey1);
    g.line({ x: 19, y: 8 }, { x: 19, y: Math.max(8, rightEnd - 1) }, 2, PAL.grey2);
    g.outline();
  });
}

/** Interior in device coordinates for cash or other shot props. */
export function safeInterior(o: Pick<SafeOptions, 'x' | 'y' | 'scale'>): SafeRect {
  const s = o.scale ?? 1;
  return {
    x: o.x - SAFE_SIZE.w * s / 2 + 18 * ART * s,
    y: o.y - SAFE_SIZE.h * s + 23 * ART * s,
    w: 52 * ART * s,
    h: 47 * ART * s,
  };
}

export function drawSafe(ctx: CanvasRenderingContext2D, o: SafeOptions) {
  rotateAround(ctx, o.x, o.y, o.rot);
  const s = o.scale ?? 1, left = o.x - SAFE_SIZE.w * s / 2, top = o.y - SAFE_SIZE.h * s;
  const open = ease(o.door ?? 0);
  drawSprite(ctx, shell, o.x, o.y, { anchor: [0.5, 1], scale: s, alpha: o.alpha });
  if (o.contents === 'cash') {
    const inner = safeInterior(o);
    drawSprite(ctx, cashBundle, inner.x + inner.w * 0.53, inner.y + inner.h * 0.68, { scale: 0.9 * s, alpha: (o.alpha ?? 1) * open });
  }
  // The hinge sits at the actual left edge of the thick circular door. A single
  // float rotation and gentle foreshortening make the open state read as a swing.
  const hingeX = left + 13 * ART * s, hingeY = top + 50 * ART * s;
  ctx.save(); ctx.globalAlpha *= o.alpha ?? 1; ctx.translate(hingeX, hingeY); ctx.scale(s * (1 - open * 0.2), s); ctx.rotate(-0.88 * open);
  drawSprite(ctx, door, 0, 0, { anchor: [0.1, 0.5], scale: 1, alpha: 1 });
  drawSprite(ctx, wheel, 32 * ART, 0, { scale: 1, rot: o.dial ?? 0, alpha: 1 });
  ctx.restore();
  if (o.locked) {
    drawPadlock(ctx, { x: o.x + 18 * ART * s, y: o.y - 42 * ART * s, scale: 0.42 * s, shut: 1, alpha: o.alpha });
  }
  ctx.restore();
}

export function drawPadlock(ctx: CanvasRenderingContext2D, o: PadlockOptions) {
  rotateAround(ctx, o.x, o.y, o.rot);
  const s = o.scale ?? 1, shut = ease(o.shut ?? 0), top = o.y - 17 * ART * s;
  const shackle = shackleFor(1 - shut);
  drawSprite(ctx, shackle, o.x, top - (1 - shut) * 6 * ART * s, { anchor: [0.5, 0], scale: s, alpha: o.alpha });
  drawSprite(ctx, padBody, o.x, top + 12 * ART * s, { anchor: [0.5, 0], scale: s, alpha: o.alpha });
  ctx.restore();
}

export const GALLERY: { name: string; draw(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void }[] = [
  { name: 'safe closed, empty', draw: (ctx, x, y) => drawSafe(ctx, { x, y: y + 282 * 0.58, scale: 0.58, door: 0, dial: 0, locked: false }) },
  { name: 'safe open, cash', draw: (ctx, x, y) => drawSafe(ctx, { x, y: y + 282 * 0.58, scale: 0.58, door: 1, dial: 0.65, contents: 'cash' }) },
  { name: 'safe swinging', draw: (ctx, x, y, t) => drawSafe(ctx, { x, y: y + 282 * 0.58, scale: 0.58, door: clamp(t * 2.5), dial: t * 2, contents: 'cash' }) },
  { name: 'safe locked', draw: (ctx, x, y) => drawSafe(ctx, { x, y: y + 282 * 0.58, scale: 0.58, locked: true }) },
  { name: 'padlock open', draw: (ctx, x, y) => drawPadlock(ctx, { x, y, shut: 0 }) },
  { name: 'padlock shut', draw: (ctx, x, y) => drawPadlock(ctx, { x, y, shut: 1 }) },
  { name: 'padlock closing', draw: (ctx, x, y, t) => drawPadlock(ctx, { x, y, shut: clamp(0.08 + t * 2.5) }) },
];
