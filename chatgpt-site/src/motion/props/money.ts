import { Grid, PAL } from '../kit/pixel';
import { drawSprite } from '../kit/sprite';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type DrawOptions = { x: number; y: number; t?: number; rot?: number; scale?: number; alpha?: number };

export const BANKNOTE_SIZE = { w: 300, h: 150 };
export const CASH_BUNDLE_SIZE = { w: 264, h: 168 };
export const CASH_PILE_SIZE = { w: 264, h: 276 };
export const COIN_SIZE = { w: 132, h: 132 };
export const COIN_STACK_SIZE = { w: 132, h: 258 };
export const PRICE_TAG_SIZE = { w: 252, h: 240 };

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
  '9': ['010', '101', '011', '001', '110'],
};
const DOLLAR = ['01110', '11000', '11000', '01110', '00011', '00011', '01110'] as const;

function textWidth(value: string, cell: number, gap: number) {
  const chars = [...value.toUpperCase()];
  return chars.reduce((sum, ch) => sum + (ch === ' ' ? 2 : Math.max(...(FONT[ch] ?? ['000']).map(row => row.length))) * cell, 0)
    + Math.max(0, chars.length - 1) * gap * cell;
}

function pixelText(g: Grid, value: string, x: number, y: number, color: string, cell = 1, gap = 1) {
  let cursor = x;
  for (const ch of value.toUpperCase()) {
    if (ch === ' ') { cursor += 2 * cell + gap * cell; continue; }
    const glyph = FONT[ch];
    if (!glyph) { cursor += 4 * cell; continue; }
    glyph.forEach((row, gy) => {
      for (let gx = 0; gx < row.length; gx++) if (row[gx] === '1') g.rect(cursor + gx * cell, y + gy * cell, cell, cell, color);
    });
    cursor += (Math.max(...glyph.map(row => row.length)) + gap) * cell;
  }
}

function centeredText(g: Grid, value: string, cx: number, y: number, color: string, cell = 1, gap = 1) {
  pixelText(g, value, Math.round(cx - textWidth(value, cell, gap) / 2), y, color, cell, gap);
}

function dollarMark(g: Grid, x: number, y: number, color: string, cell = 1) {
  DOLLAR.forEach((row, gy) => {
    for (let gx = 0; gx < row.length; gx++) if (row[gx] === '1') g.rect(x + gx * cell, y + gy * cell, cell, cell, color);
  });
  // The long centre stroke distinguishes a dollar from a plain S at icon size.
  g.rect(x + 2 * cell, y - cell, 1, 9 * cell, color);
}

function banknoteSprite() {
  const g = new Grid(50, 25);
  g.round(1, 1, 48, 23, 3, PAL.green4);
  g.round(2, 2, 46, 21, 2, PAL.paper);
  g.round(4, 4, 42, 17, 2, PAL.green2);
  g.round(5, 5, 40, 15, 1, PAL.green3);
  g.rect(5, 5, 39, 2, PAL.green1);
  g.fill((x, y) => y > 17 && x > 5 && x < 45, PAL.green4, [PAL.green2, PAL.green3]);

  // A cream portrait oval gives the bill a clear centre medallion.
  g.ellipse(25, 12.5, 10, 10, PAL.ink);
  g.ellipse(25, 12.5, 9, 9, PAL.paperShade);
  g.ellipse(25, 11.8, 8, 8, PAL.green1);
  g.ellipse(25, 12.7, 7, 7, PAL.green2);
  dollarMark(g, 20, 5.5, PAL.green4, 2);

  // Large corner marks survive downscaling and frame the central dollar.
  dollarMark(g, 6, 8, PAL.green4, 1);
  pixelText(g, '10', 40, 14, PAL.green4, 1, 0);
  g.outline();
  return g.sprite('money:banknote:green-dollar');
}

function cashBundleSprite(count: number) {
  const n = Math.max(1, Math.min(4, Math.floor(count)));
  const g = new Grid(44, 28);
  const top = 9 - (n - 1) * 2;
  for (let layer = n - 1; layer >= 0; layer--) {
    const y = 9 - layer * 2;
    const inset = layer % 2;
    g.round(2 + inset, y, 40 - inset * 2, 17 + layer * 2, 2, PAL.green4);
    g.round(3 + inset, y + 1, 38 - inset * 2, 15 + layer * 2, 1, layer % 2 ? PAL.green3 : PAL.green2);
    g.rect(4 + inset, y + 1, 36 - inset * 2, 2, PAL.green1);
    g.rect(4 + inset, y + 13 + layer * 2, 36 - inset * 2, 1, PAL.green4);
  }

  // A broad cream paper band wraps the complete bundle, with a dollar seal.
  g.rect(18, top, 9, 27 - top, PAL.paperShade);
  g.rect(19, top + 1, 2, 25 - top, PAL.paper);
  g.rect(25, top + 1, 1, 25 - top, PAL.paperDark);
  g.round(19, 12, 7, 8, 1, PAL.paper);
  dollarMark(g, 20, 12.5, PAL.green4, 1);
  g.outline();
  return g.sprite(`money:cash-bundle:green:${n}`);
}

function paintMiniBundle(g: Grid, x: number, y: number) {
  g.round(x, y, 22, 10, 2, PAL.green4);
  g.round(x + 1, y + 1, 20, 8, 1, PAL.green2);
  g.rect(x + 2, y + 1, 18, 2, PAL.green1);
  g.rect(x + 2, y + 7, 18, 1, PAL.green3);
  g.rect(x + 9, y, 5, 10, PAL.paperShade);
  g.rect(x + 10, y + 1, 2, 8, PAL.paper);
  dollarMark(g, x + 9, y + 1.5, PAL.green4, 1);
}

function miniBundleSprite() {
  const g = new Grid(22, 10);
  paintMiniBundle(g, 0, 0);
  g.outline();
  return g.sprite('money:cash-pile:mini-banded-bundle');
}

function cashPileSprite(count: number) {
  const n = Math.max(0, Math.min(6, Math.floor(count)));
  const g = new Grid(44, 46);
  for (let i = 0; i < n; i++) {
    const col = i % 2, row = Math.floor(i / 2);
    const x0 = col * 22, y0 = 35 - row * 11;
    paintMiniBundle(g, x0, y0);
  }
  g.outline();
  return g.sprite(`money:cash-pile:bundles:${n}`);
}

function coinFaceSprite() {
  const g = new Grid(22, 22);
  g.ellipse(11, 11, 10, 10, PAL.gold4);
  g.ellipse(11, 10.5, 9, 9, PAL.gold1);
  g.ellipse(10.6, 10.5, 7.5, 7.5, PAL.gold2);
  g.fill((x, y) => x > 12 && y > 11, PAL.gold3, [PAL.gold1, PAL.gold2]);
  // Short top-left gleam is a deliberate arc, not texture.
  g.line({ x: 7, y: 4 }, { x: 10, y: 3 }, 2, PAL.white);
  g.line({ x: 5, y: 6 }, { x: 6, y: 5 }, 2, PAL.gold1);
  dollarMark(g, 6, 4, PAL.gold4, 2);
  g.outline();
  return g.sprite('money:coin:gold-face');
}

function coinEdgeSprite() {
  const g = new Grid(8, 22);
  g.round(1, 0, 6, 22, 2, PAL.gold4);
  g.rect(2, 2, 1, 17, PAL.gold1);
  g.rect(3, 2, 3, 17, PAL.gold2);
  g.rect(5, 3, 1, 15, PAL.gold3);
  g.rect(2, 1, 4, 1, PAL.white);
  g.outline();
  return g.sprite('money:coin:gold-edge');
}

function coinStackSprite(count: number) {
  const n = Math.max(1, Math.min(8, Math.floor(count)));
  const h = 22 + (n - 1) * 3;
  const g = new Grid(22, h);
  const sideTop = 9;
  g.round(1, sideTop, 20, h - sideTop - 1, 4, PAL.gold4);
  g.rect(2, sideTop + 2, 18, h - sideTop - 5, PAL.gold3);
  for (let i = 0; i < n; i++) {
    const y = 11 + i * 3;
    if (y < h - 2) {
      g.rect(3, y, 16, 1, PAL.gold1);
      g.rect(3, y + 1, 16, 1, PAL.gold2);
      g.rect(3, y + 2, 16, 1, PAL.gold4);
    }
  }
  // The top disc is face-up, while the layered edge below reads as a stack.
  g.ellipse(11, 8, 10, 8, PAL.ink);
  g.ellipse(11, 7.5, 9, 7, PAL.gold1);
  g.ellipse(10.5, 7.5, 7.5, 5.5, PAL.gold2);
  g.fill((x, y) => x > 12 && y > 7, PAL.gold3, [PAL.gold1, PAL.gold2]);
  dollarMark(g, 8.5, 4.5, PAL.gold4, 1);
  g.outline();
  return g.sprite(`money:coin-stack:gold:${n}`);
}

function priceTagSprite(textValue: string, level: number, direction?: 'up' | 'down') {
  const label = textValue.toUpperCase().replace(/[^A-Z0-9 $]/g, '').slice(0, 7);
  const coins = Math.max(1, Math.min(3, Math.floor(level)));
  const g = new Grid(42, 40);
  // A taut cord runs into the tag's punched hole.
  g.line({ x: 1, y: 0 }, { x: 8, y: 15 }, 2, PAL.wood4);
  g.line({ x: 2, y: 0 }, { x: 9, y: 14 }, 1, PAL.wood1);
  const tag = [{ x: 5, y: 7 }, { x: 29, y: 7 }, { x: 41, y: 20 }, { x: 29, y: 33 }, { x: 5, y: 33 }];
  g.poly(tag, PAL.ink);
  g.poly([{ x: 6, y: 8 }, { x: 28, y: 8 }, { x: 39, y: 20 }, { x: 28, y: 32 }, { x: 6, y: 32 }], PAL.paperShade);
  g.poly([{ x: 7, y: 9 }, { x: 27, y: 9 }, { x: 37, y: 20 }, { x: 27, y: 30 }, { x: 7, y: 30 }], PAL.paper);
  g.ellipse(10, 20, 3, 3, PAL.ink);
  g.ellipse(10, 20, 1.2, 1.2, PAL.paperShade);

  if (label) centeredText(g, label, 23, 10, PAL.ink, 2, 1);
  dollarMark(g, 16, 18.5, PAL.green4, 2);
  if (direction) {
    const color = direction === 'up' ? PAL.UP : PAL.DOWN;
    if (direction === 'up') {
      g.poly([{ x: 35, y: 20 }, { x: 30, y: 26 }, { x: 33, y: 26 }, { x: 33, y: 31 }, { x: 37, y: 31 }, { x: 37, y: 26 }, { x: 40, y: 26 }], color);
    } else {
      g.poly([{ x: 35, y: 31 }, { x: 30, y: 25 }, { x: 33, y: 25 }, { x: 33, y: 20 }, { x: 37, y: 20 }, { x: 37, y: 25 }, { x: 40, y: 25 }], color);
    }
  } else {
    // One to three broad, gold coin faces sit at the right point of the tag.
    for (let i = 0; i < coins; i++) {
      const cx = 31 + i * 3, cy = 29 - (i % 2) * 2;
      g.ellipse(cx, cy, 3, 3, PAL.gold4);
      g.ellipse(cx, cy - 0.5, 2, 2, PAL.gold1);
      g.rect(cx, cy - 1, 1, 3, PAL.gold3);
    }
  }
  g.outline();
  return g.sprite(`money:price-tag:${label}:${coins}:${direction ?? 'coins'}`);
}

/** Draw a green 300×150 banknote with a cream border and a clear dollar medallion. x/y are the centre. */
export function drawBanknote(ctx: Ctx, o: DrawOptions) {
  drawSprite(ctx, banknoteSprite(), o.x, o.y, { rot: o.rot, scale: o.scale, alpha: o.alpha });
}

/** Draw a strapped stack of 1–4 green banknotes. count selects a cached thickness frame. */
export function drawCashBundle(ctx: Ctx, o: DrawOptions & { count?: number }) {
  drawSprite(ctx, cashBundleSprite(o.count ?? 3), o.x, o.y, { rot: o.rot, scale: o.scale, alpha: o.alpha });
}

/** Draw a growing pile of 0–6 neatly banded cash bundles. level is continuous from 0 to 1. */
export function drawCashPile(ctx: Ctx, o: DrawOptions & { level: number }) {
  const value = Math.max(0, Math.min(1, o.level)) * 6;
  const count = Math.floor(value);
  const fraction = value - count;
  const blend = fraction * fraction * (3 - 2 * fraction);
  const anchor = [0.5, 1] as [number, number];
  if (count > 0) drawSprite(ctx, cashPileSprite(count), o.x, o.y, { anchor, rot: o.rot, scale: o.scale, alpha: o.alpha });
  if (count < 6 && blend > 0.001) {
    const col = count % 2, row = Math.floor(count / 2);
    const scale = o.scale ?? 1;
    const rowOffset = row * 11;
    const colOffset = col * 22;
    const left = (-22 + colOffset + 11) * 6 * scale;
    const bottom = (-46 + 45 - rowOffset) * 6 * scale;
    const angle = o.rot ?? 0;
    const x = o.x + Math.cos(angle) * left - Math.sin(angle) * bottom;
    const y = o.y + Math.sin(angle) * left + Math.cos(angle) * bottom;
    const grow = 0.2 + 0.8 * blend;
    const appear = Math.max(0, Math.min(1, blend / 0.2));
    const alpha = appear * appear * (3 - 2 * appear);
    drawSprite(ctx, miniBundleSprite(), x, y, {
      anchor: [0.5, 1], rot: o.rot, scale: scale * grow, alpha: (o.alpha ?? 1) * alpha,
    });
  }
}

/** Draw a gold coin. spin=0..1 makes a smooth width squash and a clean, thick edge-on profile. */
export function drawCoin(ctx: Ctx, o: DrawOptions & { spin?: number }) {
  const spin = ((o.spin ?? 0) % 1 + 1) % 1;
  const facing = Math.cos(spin * Math.PI * 2);
  const faceOn = Math.abs(facing);
  const edgeMixRaw = Math.max(0, Math.min(1, (0.34 - faceOn) / 0.3));
  const edgeMix = edgeMixRaw * edgeMixRaw * (3 - 2 * edgeMixRaw);
  const face = coinFaceSprite();
  drawSprite(ctx, face, o.x, o.y, {
    rot: o.rot, scale: o.scale, sx: Math.max(0.08, faceOn), alpha: (o.alpha ?? 1) * (1 - edgeMix), flip: facing < 0,
  });
  if (edgeMix > 0.001) drawSprite(ctx, coinEdgeSprite(), o.x, o.y, { rot: o.rot, scale: o.scale, alpha: (o.alpha ?? 1) * edgeMix });
}

/** Draw a vertical stack of 1–8 gold coins; the top coin is face-up and each side disc is visible. */
export function drawCoinStack(ctx: Ctx, o: DrawOptions & { n: number }) {
  drawSprite(ctx, coinStackSprite(o.n), o.x, o.y, { anchor: [0.5, 1], rot: o.rot, scale: o.scale, alpha: o.alpha });
}

/** Draw a paper hang tag with a large dollar mark and a direction arrow or gold coins. */
export function drawPriceTag(ctx: Ctx, o: DrawOptions & { text?: string; level?: number; direction?: 'up' | 'down' }) {
  drawSprite(ctx, priceTagSprite(o.text ?? '', o.level ?? 2, o.direction), o.x, o.y, { rot: o.rot, scale: o.scale, alpha: o.alpha });
}

const g = (name: string, draw: (ctx: Ctx, x: number, y: number, t: number) => void, w = 320, h = 320) => ({ name, draw, w, h });
export const GALLERY = [
  g('Banknote', (ctx, x, y) => drawBanknote(ctx, { x, y }), BANKNOTE_SIZE.w, BANKNOTE_SIZE.h),
  g('Cash bundle · 1 note', (ctx, x, y) => drawCashBundle(ctx, { x, y, count: 1 }), CASH_BUNDLE_SIZE.w, CASH_BUNDLE_SIZE.h),
  g('Cash bundle · 2 notes', (ctx, x, y) => drawCashBundle(ctx, { x, y, count: 2 }), CASH_BUNDLE_SIZE.w, CASH_BUNDLE_SIZE.h),
  g('Cash bundle · 3 notes', (ctx, x, y) => drawCashBundle(ctx, { x, y, count: 3 }), CASH_BUNDLE_SIZE.w, CASH_BUNDLE_SIZE.h),
  g('Cash bundle · 4 notes', (ctx, x, y) => drawCashBundle(ctx, { x, y, count: 4 }), CASH_BUNDLE_SIZE.w, CASH_BUNDLE_SIZE.h),
  g('Cash pile · 0', (ctx, x, y) => drawCashPile(ctx, { x, y, level: 0 }), CASH_PILE_SIZE.w, CASH_PILE_SIZE.h),
  g('Cash pile · half', (ctx, x, y) => drawCashPile(ctx, { x, y: y + 84, level: 0.5 }), CASH_PILE_SIZE.w, CASH_PILE_SIZE.h),
  g('Cash pile · full', (ctx, x, y) => drawCashPile(ctx, { x, y: y + 120, level: 1 }), CASH_PILE_SIZE.w, CASH_PILE_SIZE.h),
  g('Cash pile · growing', (ctx, x, y, t) => drawCashPile(ctx, { x, y: y + 120, level: Math.min(1, t * 2.75) }), CASH_PILE_SIZE.w, CASH_PILE_SIZE.h),
  g('Coin · face', (ctx, x, y) => drawCoin(ctx, { x, y, spin: 0 }), COIN_SIZE.w, COIN_SIZE.h),
  g('Coin · quarter spin', (ctx, x, y) => drawCoin(ctx, { x, y, spin: 0.25 }), COIN_SIZE.w, COIN_SIZE.h),
  g('Coin · edge', (ctx, x, y) => drawCoin(ctx, { x, y, spin: 0.5 }), COIN_SIZE.w, COIN_SIZE.h),
  g('Coin · continuous spin', (ctx, x, y, t) => drawCoin(ctx, { x, y, spin: t }), COIN_SIZE.w, COIN_SIZE.h),
  g('Coin stack · 1', (ctx, x, y) => drawCoinStack(ctx, { x, y: y + COIN_SIZE.h / 2, n: 1 }), COIN_STACK_SIZE.w, COIN_SIZE.h),
  g('Coin stack · 2', (ctx, x, y) => drawCoinStack(ctx, { x, y: y + 75, n: 2 }), COIN_STACK_SIZE.w, 150),
  g('Coin stack · 3', (ctx, x, y) => drawCoinStack(ctx, { x, y: y + 84, n: 3 }), COIN_STACK_SIZE.w, 168),
  g('Coin stack · 4', (ctx, x, y) => drawCoinStack(ctx, { x, y: y + 93, n: 4 }), COIN_STACK_SIZE.w, 186),
  g('Coin stack · 5', (ctx, x, y) => drawCoinStack(ctx, { x, y: y + 102, n: 5 }), COIN_STACK_SIZE.w, 204),
  g('Coin stack · 6', (ctx, x, y) => drawCoinStack(ctx, { x, y: y + 111, n: 6 }), COIN_STACK_SIZE.w, 222),
  g('Coin stack · 7', (ctx, x, y) => drawCoinStack(ctx, { x, y: y + 120, n: 7 }), COIN_STACK_SIZE.w, 240),
  g('Coin stack · 8', (ctx, x, y) => drawCoinStack(ctx, { x, y: y + COIN_STACK_SIZE.h / 2, n: 8 }), COIN_STACK_SIZE.w, COIN_STACK_SIZE.h),
  g('Price tag · 2 coins', (ctx, x, y) => drawPriceTag(ctx, { x, y, text: 'MID', level: 2 }), PRICE_TAG_SIZE.w, PRICE_TAG_SIZE.h),
  g('Price tag · 1 coin', (ctx, x, y) => drawPriceTag(ctx, { x, y, text: 'LOW', level: 1 }), PRICE_TAG_SIZE.w, PRICE_TAG_SIZE.h),
  g('Price tag · 3 coins', (ctx, x, y) => drawPriceTag(ctx, { x, y, text: 'HIGH', level: 3 }), PRICE_TAG_SIZE.w, PRICE_TAG_SIZE.h),
  g('Price tag · rising', (ctx, x, y) => drawPriceTag(ctx, { x, y, text: 'PRICE', direction: 'up' }), PRICE_TAG_SIZE.w, PRICE_TAG_SIZE.h),
  g('Price tag · falling', (ctx, x, y) => drawPriceTag(ctx, { x, y, text: 'PRICE', direction: 'down' }), PRICE_TAG_SIZE.w, PRICE_TAG_SIZE.h),
];
