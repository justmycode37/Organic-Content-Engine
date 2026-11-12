import { Grid, PAL } from '../kit/pixel';
import { ART, drawSprite } from '../kit/sprite';

export const PRESS_SIZE = { w: 456, h: 540 } as const;
export const PRESS_ANCHOR = 'centre' as const;
export interface SqueezeOptions { x: number; y: number; t?: number; rot?: number; scale?: number; alpha?: number; close: number; w: number; h: number }
export interface PressRect { x: number; y: number; w: number; h: number }

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const ease = (v: number) => { const p = clamp(v); return p * p * (3 - 2 * p); };
function sprite(key: string, w: number, h: number, paint: (g: Grid) => void) {
  const g = new Grid(w, h); paint(g); return g.sprite(`prop-vise:${key}`);
}
function dims(o: Pick<SqueezeOptions, 'w' | 'h'>) {
  return { cols: Math.max(54, Math.ceil(o.w / ART)), rows: Math.max(65, Math.ceil(o.h / ART)) };
}
function rotateAround(ctx: CanvasRenderingContext2D, x: number, y: number, rot?: number) {
  ctx.save(); if (rot) { ctx.translate(x, y); ctx.rotate(rot); ctx.translate(-x, -y); }
}
function measures(o: SqueezeOptions) {
  const { cols, rows } = dims(o), s = o.scale ?? 1, p = ease(o.close);
  const left = o.x - cols * ART * s / 2, top = o.y - rows * ART * s / 2;
  const jawTop = Math.round(rows * 0.24), jawBottom = Math.round(rows * 0.67);
  const fixedFace = Math.round(cols * 0.40), movingFace = Math.round(cols * (0.73 - p * 0.27));
  const movingLeft = movingFace - 5;
  return { cols, rows, s, p, left, top, jawTop, jawBottom, fixedFace, movingFace, movingLeft };
}

function frame(cols: number, rows: number, jawTop: number, jawBottom: number, fixedFace: number) {
  return sprite(`frame-${cols}x${rows}`, cols, rows, g => {
    const baseY = rows - 15;
    // Heavy bolted bench foot and a cast support neck.
    g.round(5, baseY, cols - 10, 12, 2, PAL.ink);
    g.rect(8, baseY + 1, cols - 16, 7, PAL.blue3); g.rect(11, baseY + 2, cols - 22, 2, PAL.blue1);
    g.rect(14, rows - 4, 17, 3, PAL.ink); g.rect(cols - 31, rows - 4, 17, 3, PAL.ink);
    g.round(fixedFace - 7, jawBottom - 4, Math.max(13, cols * 0.28), baseY - jawBottom + 5, 3, PAL.ink);
    g.rect(fixedFace - 5, jawBottom - 2, Math.max(9, cols * 0.28 - 4), baseY - jawBottom, PAL.blue4);
    g.rect(fixedFace - 3, jawBottom - 1, 3, baseY - jawBottom - 2, PAL.blue2);
    // Fixed jaw is a thick steel block, clearly distinct from its gripping face.
    g.round(4, jawTop - 4, fixedFace - 2, jawBottom - jawTop + 9, 3, PAL.ink);
    g.rect(7, jawTop - 2, fixedFace - 11, jawBottom - jawTop + 5, PAL.grey3);
    g.rect(9, jawTop - 1, fixedFace - 16, 5, PAL.grey1);
    g.rect(8, jawBottom - 1, fixedFace - 12, 4, PAL.grey4);
    // Flat replaceable jaw plate with three deep grip grooves.
    g.rect(fixedFace - 5, jawTop, 5, jawBottom - jawTop, PAL.blue4);
    g.rect(fixedFace - 5, jawTop, 2, jawBottom - jawTop, PAL.blue1);
    for (const y of [jawTop + 8, jawTop + 17, jawTop + 26]) g.rect(fixedFace - 4, y, 4, 2, PAL.ink);
    // Slide rails and a threaded steel screw run from jaw to handle.
    const screwY = Math.round((jawTop + jawBottom) / 2) + 7;
    g.line({ x: fixedFace - 1, y: screwY }, { x: cols - 10, y: screwY }, 5, PAL.blue4);
    g.line({ x: fixedFace, y: screwY - 1 }, { x: cols - 11, y: screwY - 1 }, 2, PAL.grey1);
    for (let x = fixedFace + 7; x < cols - 14; x += 6) g.line({ x, y: screwY - 2 }, { x: x + 3, y: screwY + 2 }, 2, PAL.grey5);
    g.line({ x: fixedFace + 4, y: jawBottom + 4 }, { x: cols - 18, y: jawBottom + 4 }, 4, PAL.blue4);
    g.line({ x: fixedFace + 4, y: jawBottom + 3 }, { x: cols - 18, y: jawBottom + 3 }, 1, PAL.blue1);
    g.outline();
  });
}
const crank = sprite('red-crank', 25, 25, g => {
  g.line({ x: 12, y: 3 }, { x: 12, y: 21 }, 5, PAL.ink);
  g.line({ x: 12, y: 4 }, { x: 12, y: 20 }, 3, PAL.red2);
  g.line({ x: 3, y: 12 }, { x: 21, y: 12 }, 5, PAL.ink);
  g.line({ x: 4, y: 12 }, { x: 20, y: 12 }, 3, PAL.red2);
  g.ellipse(12, 3, 3, 3, PAL.red3); g.ellipse(12, 3, 1, 1, PAL.red1);
  g.ellipse(12, 21, 3, 3, PAL.red3); g.ellipse(12, 21, 1, 1, PAL.red1);
  g.outline();
});
function movingJaw() {
  return sprite('moving-jaw', 27, 48, g => {
    g.round(0, 2, 26, 44, 3, PAL.ink);
    g.rect(3, 4, 20, 40, PAL.grey3); g.rect(5, 5, 14, 5, PAL.grey1);
    g.rect(1, 8, 5, 30, PAL.blue4); g.rect(1, 8, 2, 30, PAL.blue1);
    for (const y of [15, 24, 33]) g.rect(2, y, 4, 2, PAL.ink);
    g.rect(5, 39, 17, 4, PAL.grey4); g.rect(6, 40, 12, 2, PAL.blue2);
    g.outline();
  });
}

export function squeezeGap(o: SqueezeOptions): PressRect {
  const m = measures(o), gapLeft = m.left + m.fixedFace * ART * m.s;
  const gapRight = m.left + m.movingFace * ART * m.s;
  return {
    x: gapLeft,
    y: m.top + (m.jawTop + 4) * ART * m.s,
    w: Math.max(0, gapRight - gapLeft),
    h: Math.max(0, (m.jawBottom - m.jawTop - 8) * ART * m.s),
  };
}
export const pressGap = squeezeGap;

export function drawSqueeze(ctx: CanvasRenderingContext2D, o: SqueezeOptions) {
  const m = measures(o), base = frame(m.cols, m.rows, m.jawTop, m.jawBottom, m.fixedFace), jaw = movingJaw();
  rotateAround(ctx, o.x, o.y, o.rot);
  drawSprite(ctx, base, m.left, m.top, { anchor: [0, 0], scale: m.s, alpha: o.alpha });
  // The jaw glides on the screw. Coordinates stay float-valued during motion.
  drawSprite(ctx, jaw, m.left + m.movingLeft * ART * m.s, m.top + (m.jawTop - 2) * ART * m.s, { anchor: [0, 0], scale: m.s, alpha: o.alpha });
  const handleX = m.cols - 12, handleY = m.rows - 22;
  drawSprite(ctx, crank, m.left + handleX * ART * m.s, m.top + handleY * ART * m.s, { scale: m.s, rot: m.p * Math.PI * 2, alpha: o.alpha });
  ctx.restore();
}

export const GALLERY: { name: string; draw(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void }[] = [
  { name: 'vise open', draw: (ctx, x, y) => drawSqueeze(ctx, { x, y, w: PRESS_SIZE.w, h: PRESS_SIZE.h, scale: 0.62, close: 0 }) },
  { name: 'vise halfway', draw: (ctx, x, y) => drawSqueeze(ctx, { x, y, w: PRESS_SIZE.w, h: PRESS_SIZE.h, scale: 0.62, close: 0.5 }) },
  { name: 'vise closed', draw: (ctx, x, y) => drawSqueeze(ctx, { x, y, w: PRESS_SIZE.w, h: PRESS_SIZE.h, scale: 0.62, close: 1 }) },
  { name: 'vise closing', draw: (ctx, x, y, t) => drawSqueeze(ctx, { x, y, w: PRESS_SIZE.w, h: PRESS_SIZE.h, scale: 0.62, close: clamp(t * 2.5) }) },
];
