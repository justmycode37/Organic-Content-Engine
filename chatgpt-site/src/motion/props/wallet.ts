import { Grid, PAL } from '../kit/pixel';
import { drawSprite } from '../kit/sprite';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export const WALLET_SIZE = { w: 264, h: 192 };

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
};

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

function stitchLine(g: Grid, x1: number, x2: number, y: number) {
  for (let x = x1; x + 2 <= x2; x += 5) g.rect(x, y, 2, 2, PAL.paperShade);
}

function walletInteriorSprite(empty: boolean) {
  const g = new Grid(44, 32);
  g.round(0, 0, 44, 32, 4, PAL.wood4);
  g.round(1, 1, 42, 30, 3, PAL.wood2);
  g.rect(3, 2, 35, 2, PAL.wood1);
  g.fill((x, y) => y > 22 && x > 2 && x < 42, PAL.wood3, [PAL.wood2]);

  // Open bifold: deep bill pocket on the left and one card sleeve on the right.
  g.round(3, 5, 18, 23, 2, PAL.wood4);
  g.round(4, 6, 16, 20, 1, PAL.ink);
  g.rect(4, 6, 16, 2, PAL.wood1);
  g.rect(21, 4, 2, 24, PAL.wood4);
  g.rect(22, 4, 1, 24, PAL.wood1);
  g.round(25, 8, 15, 12, 2, PAL.wood4);
  g.round(26, 9, 13, 10, 1, PAL.wood3);
  g.rect(26, 9, 13, 2, PAL.wood1);

  if (!empty) {
    // Three green note edges clearly protrude from the open bill pocket.
    g.round(6, 0, 6, 13, 1, PAL.green4);
    g.round(7, 0, 4, 11, 1, PAL.green2);
    g.rect(7, 1, 3, 2, PAL.green1);
    g.round(12, 0, 6, 14, 1, PAL.green4);
    g.round(13, 0, 4, 12, 1, PAL.green2);
    g.rect(13, 1, 3, 2, PAL.green1);
    g.round(17, 1, 5, 12, 1, PAL.green4);
    g.round(18, 1, 3, 10, 1, PAL.green2);
    g.rect(18, 2, 2, 2, PAL.green1);
    g.rect(8, 9, 10, 1, PAL.green4);
  }
  stitchLine(g, 5, 39, 3);
  stitchLine(g, 5, 39, 27);
  g.outline();
  return g.sprite(`wallet:open-interior:${empty ? 'empty' : 'cash'}`);
}

function walletFlapSprite(emptyLabel: boolean) {
  const g = new Grid(44, 32);
  g.round(0, 0, 44, 32, 4, PAL.wood4);
  g.round(1, 1, 42, 30, 3, PAL.wood2);
  g.round(2, 2, 39, 27, 2, PAL.wood3);
  g.rect(4, 3, 34, 2, PAL.wood1);
  g.fill((x, y) => x < 19 && y > 5 && y < 26, PAL.wood2, [PAL.wood3]);
  g.fill((x, y) => y > 23 && x > 2 && x < 41, PAL.wood4, [PAL.wood2, PAL.wood3]);

  // Bifold crease plus a stitched perimeter are the leather construction cues.
  g.rect(21, 4, 1, 23, PAL.wood4);
  g.rect(22, 4, 1, 23, PAL.wood1);
  stitchLine(g, 5, 39, 4);
  stitchLine(g, 5, 39, 26);

  if (emptyLabel) pixelText(g, 'EMPTY', 5, 8, PAL.paper, 2, 0);

  // A short button strap crosses the fold and ends in a large leather stud.
  g.round(29, 21, 15, 8, 2, PAL.wood4);
  g.round(29, 22, 14, 6, 1, PAL.wood1);
  g.ellipse(35.5, 25, 4.5, 4.5, PAL.wood4);
  g.ellipse(35.5, 24.5, 3, 3, PAL.wood2);
  g.ellipse(34.5, 23.5, 1, 1, PAL.paperShade);
  g.outline();
  return g.sprite(`wallet:closed-leather:${emptyLabel ? 'empty-label' : 'plain'}`);
}

/** Draw a classic brown leather bifold. open is 0..1; empty opens to a dark pocket marked EMPTY. */
export function drawWallet(ctx: Ctx, o: {
  x: number; y: number; open: number; empty: boolean; t?: number; rot?: number; scale?: number; alpha?: number;
}) {
  const open = Math.max(0, Math.min(1, o.open));
  const eased = open * open * (3 - 2 * open);
  const scale = o.scale ?? 1;
  ctx.save();
  ctx.translate(o.x, o.y);
  if (o.rot) ctx.rotate(o.rot);

  drawSprite(ctx, walletInteriorSprite(o.empty), 0, 0, { scale, alpha: o.alpha });
  // The front cover swings left from its lower hinge, exposing the bill pocket smoothly.
  const lidY = 96 * scale;
  const lidRot = -1.22 * eased;
  drawSprite(ctx, walletFlapSprite(false), 0, lidY, {
    anchor: [0.5, 1], rot: lidRot, scale, alpha: o.alpha,
  });
  if (o.empty && eased < 0.999) drawSprite(ctx, walletFlapSprite(true), 0, lidY, {
    anchor: [0.5, 1], rot: lidRot, scale, alpha: (o.alpha ?? 1) * (1 - eased),
  });
  ctx.restore();
}

const g = (name: string, draw: (ctx: Ctx, x: number, y: number, t: number) => void) => ({ name, draw, w: WALLET_SIZE.w, h: WALLET_SIZE.h });
export const GALLERY = [
  g('Wallet · closed full', (ctx, x, y) => drawWallet(ctx, { x, y, open: 0, empty: false })),
  g('Wallet · open full', (ctx, x, y) => drawWallet(ctx, { x, y, open: 1, empty: false })),
  g('Wallet · closed EMPTY', (ctx, x, y) => drawWallet(ctx, { x, y, open: 0, empty: true })),
  g('Wallet · open EMPTY', (ctx, x, y) => drawWallet(ctx, { x, y, open: 1, empty: true })),
  g('Wallet · upside down, still empty', (ctx, x, y) => drawWallet(ctx, { x, y, open: 0.8, empty: true, rot: Math.PI })),
  g('Wallet · opening', (ctx, x, y, t) => drawWallet(ctx, { x, y, open: Math.min(1, t), empty: true })),
];
