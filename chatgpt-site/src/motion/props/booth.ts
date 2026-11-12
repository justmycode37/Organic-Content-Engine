import { Grid, PAL } from '../kit/pixel';
import { ART, drawSprite } from '../kit/sprite';

export const BOOTH_SIZE = { w: 564, h: 720 } as const;
export const BOOTH_ANCHOR = 'bottom-centre' as const;
export interface BoothOptions {
  x: number; y: number; t?: number; rot?: number; scale?: number; alpha?: number;
  sign?: string; awning?: 'red' | 'blue' | 'green'; shutter?: number;
  stock?: number; stockKind?: 'ticket' | 'box' | 'none'; tickets?: number; clerk?: boolean;
}
export interface BoothRect { x: number; y: number; w: number; h: number }

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const ease = (v: number) => { const p = clamp(v); return p * p * (3 - 2 * p); };
function sprite(key: string, w: number, h: number, paint: (g: Grid) => void) {
  const g = new Grid(w, h); paint(g); return g.sprite(`prop-booth:${key}`);
}
function rotateAround(ctx: CanvasRenderingContext2D, x: number, y: number, rot?: number) {
  ctx.save(); if (rot) { ctx.translate(x, y); ctx.rotate(rot); ctx.translate(-x, -y); }
}

const FONT: Record<string, string[]> = {
  A:['0110','1001','1001','1111','1001','1001','1001'], B:['1110','1001','1001','1110','1001','1001','1110'],
  C:['0111','1000','1000','1000','1000','1000','0111'], D:['1110','1001','1001','1001','1001','1001','1110'],
  E:['1111','1000','1000','1110','1000','1000','1111'], F:['1111','1000','1000','1110','1000','1000','1000'],
  G:['0111','1000','1000','1011','1001','1001','0111'], H:['1001','1001','1001','1111','1001','1001','1001'],
  I:['1111','0110','0110','0110','0110','0110','1111'], J:['0011','0001','0001','0001','1001','1001','0110'],
  K:['1001','1010','1100','1100','1010','1010','1001'], L:['1000','1000','1000','1000','1000','1000','1111'],
  M:['1001','1111','1111','1001','1001','1001','1001'], N:['1001','1101','1101','1011','1011','1001','1001'],
  O:['0110','1001','1001','1001','1001','1001','0110'], P:['1110','1001','1001','1110','1000','1000','1000'],
  Q:['0110','1001','1001','1001','1011','1010','0101'], R:['1110','1001','1001','1110','1010','1001','1001'],
  S:['0111','1000','1000','0110','0001','0001','1110'], T:['1111','0110','0110','0110','0110','0110','0110'],
  U:['1001','1001','1001','1001','1001','1001','0110'], V:['1001','1001','1001','1001','1001','0110','0110'],
  W:['1001','1001','1001','1111','1111','1111','1001'], X:['1001','1001','0110','0110','0110','1001','1001'],
  Y:['1001','1001','0110','0110','0110','0110','0110'], Z:['1111','0001','0010','0110','0100','1000','1111'],
  '0':['0110','1001','1011','1011','1101','1001','0110'], '1':['0110','1110','0110','0110','0110','0110','1111'],
  '2':['1110','0001','0001','0110','1000','1000','1111'], '3':['1110','0001','0001','0110','0001','0001','1110'],
  '4':['1001','1001','1001','1111','0001','0001','0001'], '5':['1111','1000','1000','1110','0001','0001','1110'],
  '6':['0111','1000','1000','1110','1001','1001','0110'], '7':['1111','0001','0010','0010','0100','0100','0100'],
  '8':['0110','1001','1001','0110','1001','1001','0110'], '9':['0110','1001','1001','0111','0001','0001','1110'],
};
function textWidth(value: string, pixel = 2) {
  return [...value.toUpperCase()].reduce((w, ch, i) => w + (ch === ' ' ? 4 : 4 * pixel) + (i ? pixel : 0), 0);
}
function pixelText(g: Grid, value: string, cx: number, y: number, color: string, pixel = 2) {
  const fullWidth = textWidth(value, pixel); let x = Math.round(cx - fullWidth / 2);
  [...value.toUpperCase()].forEach((ch, i) => {
    if (i) x += pixel;
    if (ch === ' ') { x += 4; return; }
    const rows = FONT[ch] ?? ['1111','0001','0010','0100','0100','0000','0100'];
    rows.forEach((row, yy) => [...row].forEach((bit, xx) => { if (bit === '1') g.rect(x + xx * pixel, y + yy * pixel, pixel, pixel, color); }));
    x += 4 * pixel;
  });
}

const signColors = { red: PAL.red2, blue: PAL.blue2, green: PAL.green2 } as const;
const signShade = { red: PAL.red3, blue: PAL.blue4, green: PAL.green4 } as const;
function boothFrame(label: string, awning: 'red' | 'blue' | 'green') {
  return sprite(`frame-${awning}-${label.toUpperCase()}`, 94, 120, g => {
    // Timber market stall, sign board, projecting striped canopy, open service window.
    g.round(5, 22, 84, 91, 4, PAL.wood4);
    g.rect(8, 25, 78, 82, PAL.wood2); g.rect(9, 27, 4, 75, PAL.wood1);
    g.rect(81, 27, 4, 75, PAL.wood3);
    g.rect(12, 20, 70, 2, PAL.wood3);
    // The sign is broad, cream paper with heavy pixel lettering.
    g.round(6, 1, 82, 20, 3, PAL.ink); g.round(9, 3, 76, 15, 2, PAL.paperShade);
    g.rect(12, 4, 70, 2, PAL.paper);
    pixelText(g, label || 'SHOP', 47, 4, PAL.ink);
    // Red-and-cream (or blue/green) wide cloth stripes and a scalloped valance.
    const color = signColors[awning], shade = signShade[awning];
    g.rect(3, 19, 88, 16, PAL.ink); g.rect(5, 20, 84, 11, PAL.paper);
    for (let i = 0; i < 7; i++) {
      const x = 5 + i * 12;
      if (i % 2 === 0) g.rect(x, 20, 12, 11, color);
      g.rect(x, 31, 12, 5, i % 2 === 0 ? shade : PAL.paperShade);
      g.poly([{ x, y: 31 }, { x: x + 12, y: 31 }, { x: x + 6, y: 37 }], i % 2 === 0 ? color : PAL.paper);
      g.rect(x + 5, 20, 2, 10, i % 2 === 0 ? PAL.red1 : PAL.paper);
    }
    g.rect(5, 20, 84, 2, PAL.paper);
    // Window has a dark, deep interior and a thick timber frame.
    g.round(10, 36, 74, 31, 3, PAL.wood4);
    g.rect(14, 39, 66, 25, PAL.ink);
    g.rect(16, 41, 62, 21, PAL.blue4);
    g.rect(16, 41, 56, 3, PAL.blue3); g.rect(75, 44, 3, 16, PAL.ink);
    // Heavy counter ledge and a useful, visible lower cabinet.
    g.rect(6, 64, 82, 9, PAL.ink); g.rect(8, 64, 78, 5, PAL.wood1); g.rect(9, 69, 75, 2, PAL.wood3);
    g.round(10, 76, 74, 31, 2, PAL.wood4); g.rect(13, 79, 68, 24, PAL.wood2);
    g.rect(15, 81, 64, 3, PAL.wood1); g.rect(16, 90, 62, 2, PAL.wood3);
    g.rect(37, 85, 20, 12, PAL.wood4); g.rect(40, 87, 14, 8, PAL.wood1); g.rect(44, 88, 6, 5, PAL.gold3);
    // Stout legs and feet keep the object grounded as a stall.
    g.rect(9, 107, 9, 10, PAL.ink); g.rect(11, 108, 5, 7, PAL.wood3);
    g.rect(76, 107, 9, 10, PAL.ink); g.rect(78, 108, 5, 7, PAL.wood3);
    g.rect(6, 115, 25, 4, PAL.ink); g.rect(8, 115, 21, 2, PAL.wood1);
    g.rect(63, 115, 25, 4, PAL.ink); g.rect(65, 115, 21, 2, PAL.wood1);
    g.outline();
  });
}

const clerk = sprite('clerk', 23, 25, g => {
  g.ellipse(11, 6, 5, 5, PAL.ink); g.ellipse(11, 5, 4, 4, PAL.paperShade);
  g.rect(7, 4, 8, 3, PAL.wood3); g.rect(8, 6, 2, 1, PAL.ink); g.rect(12, 6, 2, 1, PAL.ink);
  g.round(4, 11, 15, 12, 3, PAL.green3); g.rect(6, 12, 10, 5, PAL.green1);
  g.rect(0, 14, 7, 3, PAL.paperShade); g.rect(16, 14, 7, 3, PAL.paperShade);
  g.rect(1, 16, 5, 5, PAL.wood2); g.rect(17, 16, 5, 5, PAL.wood2);
  g.rect(8, 22, 7, 2, PAL.wood4); g.outline();
});
const ticketStock = sprite('stock-ticket', 10, 9, g => {
  g.rect(0, 1, 10, 7, PAL.ink); g.rect(1, 2, 8, 5, PAL.paper);
  g.rect(2, 3, 3, 2, PAL.red2); g.rect(6, 3, 2, 1, PAL.gold2); g.rect(6, 5, 2, 1, PAL.blue2);
  g.rect(4, 2, 1, 5, PAL.paperShade); g.outline();
});
const boxStock = sprite('stock-box', 12, 11, g => {
  g.poly([{ x: 1, y: 3 }, { x: 6, y: 0 }, { x: 11, y: 3 }, { x: 6, y: 6 }], PAL.wood1);
  g.poly([{ x: 1, y: 3 }, { x: 6, y: 6 }, { x: 6, y: 10 }, { x: 1, y: 7 }], PAL.wood2);
  g.poly([{ x: 6, y: 6 }, { x: 11, y: 3 }, { x: 11, y: 7 }, { x: 6, y: 10 }], PAL.wood3);
  g.rect(5, 3, 2, 3, PAL.gold2); g.outline();
});

function shutterFor(amount: number) {
  const visible = Math.round(clamp(amount) * 28);
  return sprite(`shutter-${visible}`, 66, 28, g => {
    if (!visible) return;
    g.rect(0, 0, 66, visible, PAL.grey4);
    g.rect(2, 0, 62, visible, PAL.grey3);
    for (let y = 2; y < visible; y += 5) {
      g.rect(3, y, 60, 2, PAL.grey1); g.rect(3, y + 2, 60, 2, PAL.grey2);
      g.rect(3, y + 4, 60, 1, PAL.grey5);
    }
    g.rect(0, Math.max(0, visible - 3), 66, 3, PAL.ink);
    if (visible > 2) g.rect(2, Math.max(0, visible - 3), 62, 1, PAL.grey1);
    g.outline();
  });
}

export function boothWindow(o: Pick<BoothOptions, 'x' | 'y' | 'scale'>): BoothRect {
  const s = o.scale ?? 1;
  return { x: o.x - 31 * ART * s, y: o.y - BOOTH_SIZE.h * s + 36 * ART * s, w: 62 * ART * s, h: 28 * ART * s };
}
export function boothCounter(o: Pick<BoothOptions, 'x' | 'y' | 'scale'>): BoothRect {
  const s = o.scale ?? 1;
  return { x: o.x - 41 * ART * s, y: o.y - BOOTH_SIZE.h * s + 63 * ART * s, w: 82 * ART * s, h: 8 * ART * s };
}
export function boothTicketSize() { return { w: 66, h: 36 }; }

export function drawBooth(ctx: CanvasRenderingContext2D, o: BoothOptions) {
  rotateAround(ctx, o.x, o.y, o.rot);
  const s = o.scale ?? 1, label = o.sign ?? 'TICKETS', awning = o.awning ?? 'red';
  const count = Math.max(0, Math.min(5, Math.floor(o.stock ?? o.tickets ?? 3)));
  const frame = boothFrame(label, awning);
  drawSprite(ctx, frame, o.x, o.y, { anchor: [0.5, 1], scale: s, alpha: o.alpha });
  const win = boothWindow(o);
  if (o.clerk) drawSprite(ctx, clerk, win.x + win.w * 0.31, win.y + win.h * 0.42, { scale: s, alpha: o.alpha });
  const kind = o.stockKind ?? 'ticket';
  if (kind !== 'none' && count > 0) {
    const item = kind === 'box' ? boxStock : ticketStock, iw = kind === 'box' ? 12 : 10, ih = kind === 'box' ? 11 : 9;
    const gap = 1, total = count * iw + (count - 1) * gap, start = o.x - total * ART * s / 2;
    for (let i = 0; i < count; i++) {
      const px = start + (i * (iw + gap) + iw / 2) * ART * s;
      const py = win.y + win.h * 0.61;
      drawSprite(ctx, item, px, py, { scale: s, alpha: o.alpha });
    }
  }
  // Shutter drops over the opening in whole art-pixel rows while its position
  // remains continuous to the caller.
  const amount = ease(o.shutter ?? 0);
  if (amount > 0) {
    const shutter = shutterFor(amount);
    drawSprite(ctx, shutter, o.x, win.y + 1 * ART * s, { anchor: [0.5, 0], scale: s, alpha: o.alpha });
  }
  ctx.restore();
}

export const GALLERY: { name: string; draw(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void }[] = [
  { name: 'market stall · tickets and clerk', draw: (ctx, x, y) => drawBooth(ctx, { x, y: y + 169.2, scale: 0.47, sign: 'TICKETS', stock: 5, clerk: true }) },
  { name: 'market stall · BUY', draw: (ctx, x, y) => drawBooth(ctx, { x, y: y + 169.2, scale: 0.47, sign: 'BUY', stock: 1, awning: 'blue' }) },
  { name: 'market stall · SOLD OUT', draw: (ctx, x, y) => drawBooth(ctx, { x, y: y + 169.2, scale: 0.47, sign: 'SOLD OUT', stock: 0, shutter: 1, awning: 'green' }) },
  { name: 'market stall · boxes', draw: (ctx, x, y) => drawBooth(ctx, { x, y: y + 169.2, scale: 0.47, sign: 'SHOP', stock: 3, stockKind: 'box', clerk: true }) },
  { name: 'shutter opening', draw: (ctx, x, y, t) => drawBooth(ctx, { x, y: y + 169.2, scale: 0.47, sign: 'BANK', stock: 2, clerk: true, shutter: 0.92 * (1 - clamp(t * 2.5)) }) },
];
