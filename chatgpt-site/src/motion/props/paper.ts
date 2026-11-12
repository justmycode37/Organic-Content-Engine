import { Grid, PAL } from '../kit/pixel';
import { drawSprite } from '../kit/sprite';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type DrawOptions = { x: number; y: number; t?: number; rot?: number; scale?: number; alpha?: number };

export const IOU_SIZE = { w: 228, h: 276 };
export const STAMP_MARK_SIZE = { w: 648, h: 108 };

const FONT: Record<string, readonly string[]> = {
  A: ['010', '101', '111', '101', '101'], B: ['110', '101', '110', '101', '110'], C: ['011', '100', '100', '100', '011'],
  D: ['110', '101', '101', '101', '110'], E: ['111', '100', '110', '100', '111'], F: ['111', '100', '110', '100', '100'],
  G: ['011', '100', '101', '101', '011'], H: ['101', '101', '111', '101', '101'], I: ['111', '010', '010', '010', '111'],
  J: ['001', '001', '001', '101', '010'], K: ['101', '101', '110', '101', '101'], L: ['100', '100', '100', '100', '111'],
  M: ['10001', '11011', '10101', '10101', '10101'], N: ['1001', '1101', '1011', '1001', '1001'], O: ['111', '101', '101', '101', '111'],
  P: ['110', '101', '110', '100', '100'], Q: ['111', '101', '101', '111', '001'], R: ['110', '101', '110', '101', '101'],
  S: ['011', '100', '010', '001', '110'], T: ['111', '010', '010', '010', '010'], U: ['101', '101', '101', '101', '111'],
  V: ['101', '101', '101', '101', '010'], W: ['10001', '10001', '10101', '10101', '01010'], X: ['101', '101', '010', '101', '101'],
  Y: ['101', '101', '010', '010', '010'], Z: ['111', '001', '010', '100', '111'],
  '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'], '2': ['110', '001', '010', '100', '111'],
  '3': ['110', '001', '010', '001', '110'], '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '110', '001', '110'],
  '6': ['011', '100', '110', '101', '010'], '7': ['111', '001', '010', '010', '010'], '8': ['010', '101', '010', '101', '010'],
  '9': ['010', '101', '011', '001', '110'], '$': ['010', '111', '100', '111', '010'],
};

function pixelWidth(value: string, cell: number, gap: number) {
  const chars = [...value.toUpperCase()];
  const units = chars.reduce((sum, ch) => sum + (ch === ' ' ? 2 : Math.max(...(FONT[ch] ?? ['000']).map(row => row.length))), 0)
    + Math.max(0, chars.length - 1) * gap;
  return units * cell;
}

function pixelText(g: Grid, value: string, x: number, y: number, color: string, cell = 1, gap = 1) {
  let cursor = x;
  for (const ch of value.toUpperCase()) {
    if (ch === ' ') { cursor += (2 + gap) * cell; continue; }
    const glyph = FONT[ch];
    if (!glyph) { cursor += 4 * cell; continue; }
    glyph.forEach((row, gy) => {
      for (let gx = 0; gx < row.length; gx++) if (row[gx] === '1') g.rect(cursor + gx * cell, y + gy * cell, cell, cell, color);
    });
    cursor += (Math.max(...glyph.map(row => row.length)) + gap) * cell;
  }
}

function centeredText(g: Grid, value: string, cx: number, y: number, color: string, cell = 1, gap = 1) {
  pixelText(g, value, Math.round(cx - pixelWidth(value, cell, gap) / 2), y, color, cell, gap);
}

function iouSprite() {
  const g = new Grid(38, 46);
  g.round(1, 1, 36, 44, 3, PAL.paperDark);
  g.round(2, 2, 34, 42, 2, PAL.paper);
  g.rect(4, 4, 28, 2, PAL.white);
  g.rect(4, 40, 29, 2, PAL.paperShade);
  // A folded top corner, in two broad cream tones.
  g.poly([{ x: 27, y: 2 }, { x: 36, y: 2 }, { x: 36, y: 11 }], PAL.paperShade);
  g.line({ x: 28, y: 3 }, { x: 34, y: 9 }, 1.5, PAL.paperDark);
  centeredText(g, 'IOU', 19, 7, PAL.ink, 3, 1);
  g.rect(7, 25, 24, 1, PAL.paperDark);

  // Small but fully formed ticket pictogram: stub, star, and barcode.
  g.round(6, 30, 26, 12, 2, PAL.ink);
  g.round(7, 31, 24, 10, 1, PAL.paperShade);
  g.rect(8, 32, 14, 2, PAL.red2);
  g.rect(8, 35, 14, 5, PAL.paper);
  g.rect(23, 31, 1, 10, PAL.red2);
  g.line({ x: 24, y: 31 }, { x: 24, y: 40 }, 1, PAL.inkSoft);
  // Red star emblem on the ticket body.
  g.rect(12, 35, 2, 5, PAL.red2);
  g.rect(10, 36, 6, 2, PAL.red2);
  // Bold stub barcode bars.
  g.rect(26, 33, 1, 6, PAL.ink);
  g.rect(28, 32, 2, 8, PAL.ink);
  g.rect(31, 34, 1, 6, PAL.ink);
  g.outline();
  return g.sprite('paper:iou-cream-ticket');
}

function stampSprite(value: string) {
  const label = value.toUpperCase().replace(/[^A-Z0-9 $]/g, '').slice(0, 24) || 'STAMP';
  const cell = 2, gap = 1;
  const width = Math.max(34, Math.min(220, Math.ceil(pixelWidth(label, cell, gap) + 12)));
  const height = 18;
  const g = new Grid(width, height);
  g.round(0, 0, width, height, 2, PAL.red2);
  g.round(2, 2, width - 4, height - 4, 1, PAL.paper);
  g.rect(4, 4, width - 8, 1, PAL.red1);
  g.rect(4, height - 5, width - 8, 1, PAL.red1);
  const textW = pixelWidth(label, cell, gap);
  pixelText(g, label, Math.floor((width - textW) / 2), 4, PAL.red2, cell, gap);
  g.outline();
  return g.sprite(`paper:stamp:red:${label}:${width}`);
}

/** Draw a cream IOU slip with a large IOU label and a small ticket pictogram. x/y are the centre. */
export function drawIOU(ctx: Ctx, o: DrawOptions) {
  drawSprite(ctx, iouSprite(), o.x, o.y, { rot: o.rot, scale: o.scale, alpha: o.alpha });
}

/** Draw a generic bold red pixel stamp; progress 0..1 eases the mark in with a small squash. */
export function drawStampMark(ctx: Ctx, o: DrawOptions & { text: string; progress?: number }) {
  const p = Math.max(0, Math.min(1, o.progress ?? 1));
  if (p <= 0) return;
  const eased = 1 - Math.pow(1 - p, 3);
  const overshoot = Math.sin(Math.PI * p) * (1 - p) * 0.06;
  drawSprite(ctx, stampSprite(o.text), o.x, o.y, {
    rot: o.rot ?? -0.055,
    scale: (o.scale ?? 1) * (0.56 + 0.44 * eased + overshoot),
    alpha: (o.alpha ?? 1) * eased,
  });
}

const g = (name: string, draw: (ctx: Ctx, x: number, y: number, t: number) => void, w: number, h: number) => ({ name, draw, w, h });
export const GALLERY = [
  g('IOU · owes one ticket', (ctx, x, y) => drawIOU(ctx, { x, y }), IOU_SIZE.w, IOU_SIZE.h),
  g('Stamp · SOLD', (ctx, x, y) => drawStampMark(ctx, { x, y, text: 'SOLD', progress: 1 }), 240, STAMP_MARK_SIZE.h),
  g('Stamp · SHORT SQUEEZE', (ctx, x, y) => drawStampMark(ctx, { x, y, text: 'SHORT SQUEEZE', progress: 1 }), STAMP_MARK_SIZE.w, STAMP_MARK_SIZE.h),
];
