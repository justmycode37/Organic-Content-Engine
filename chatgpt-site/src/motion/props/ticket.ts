import { Grid, PAL } from '../kit/pixel';
import { drawSprite } from '../kit/sprite';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type DrawOptions = { x: number; y: number; t?: number; rot?: number; scale?: number; alpha?: number };

export const TICKET_SIZE = { w: 420, h: 204 };
export const TICKET_SMALL_SIZE = { w: 210, h: 102 };
export const TICKET_STACK_SIZE = { w: 456, h: 228 };

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

function measure(value: string, cell: number, gap: number) {
  const chars = [...value.toUpperCase()];
  return chars.reduce((sum, ch) => sum + (ch === ' ' ? 2 : Math.max(...(FONT[ch] ?? ['000']).map(row => row.length))), 0) * cell
    + Math.max(0, chars.length - 1) * gap * cell;
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
  pixelText(g, value, Math.round(cx - measure(value, cell, gap) / 2), y, color, cell, gap);
}

function ticketShape(px: number, py: number, cols: number, rows: number, inset = 0, split = Math.round(cols * 0.72)) {
  if (px < inset || py < inset || px >= cols - inset || py >= rows - inset) return false;
  const x = px - inset, y = py - inset, w = cols - inset * 2, h = rows - inset * 2;
  if ((x < 2 && y < 2) || (x >= w - 2 && y < 2) || (x < 2 && y >= h - 2) || (x >= w - 2 && y >= h - 2)) return false;
  return Math.hypot(px - split, py) >= 2.6 && Math.hypot(px - split, py - rows) >= 2.6;
}

function star(g: Grid, cx: number, cy: number, r: number, color: string) {
  const points = [];
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + i * Math.PI / 5;
    const radius = i % 2 ? r * 0.45 : r;
    points.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
  }
  g.poly(points, color);
}

function ticketSprite(small: boolean, outline: boolean) {
  const cols = small ? 35 : 70, rows = small ? 17 : 34, split = small ? 24 : 51;
  const g = new Grid(cols, rows);
  if (!outline) {
    g.fill((x, y) => ticketShape(x, y, cols, rows, 0, split), PAL.ink);
    g.fill((x, y) => ticketShape(x, y, cols, rows, 1, split), PAL.red2);
    g.fill((x, y) => ticketShape(x, y, cols, rows, 3, split), PAL.paper);
    if (!small) {
      g.rect(4, 4, 43, 3, PAL.red2);
      g.rect(4, 27, 43, 3, PAL.red2);
      g.rect(5, 4, 41, 1, PAL.red1);
      g.rect(5, 29, 41, 1, PAL.red3);
    } else {
      g.rect(3, 3, 19, 2, PAL.red2);
      g.rect(3, 13, 19, 2, PAL.red2);
    }
  } else {
    // Owed ticket: a clean, dashed outline with generous gaps around the ticket shape.
    const step = small ? 4 : 5, dash = 2;
    for (let x = 3; x < cols - 3; x += step) {
      if (Math.abs(x - split) < 5) continue;
      g.rect(x, 1, Math.min(dash, cols - x - 1), 2, PAL.red2);
      g.rect(x, rows - 3, Math.min(dash, cols - x - 1), 2, PAL.red2);
    }
    for (let y = 4; y < rows - 4; y += step) {
      g.rect(1, y, 2, Math.min(dash, rows - y - 1), PAL.red2);
      g.rect(cols - 3, y, 2, Math.min(dash, rows - y - 1), PAL.red2);
    }
  }

  // The perforated tear and stub distinguish a ticket even when its centre is stamped.
  for (let y = small ? 5 : 7; y < rows - (small ? 4 : 6); y += small ? 3 : 4) {
    g.rect(split, y, small ? 2 : 2, small ? 2 : 2, outline ? PAL.red2 : PAL.red3);
  }
  if (!small) {
    star(g, 7, 17, 5.5, PAL.red2);
    if (!outline) {
      centeredText(g, 'ADMIT', 30, 9, PAL.ink, 2, 1);
      centeredText(g, 'ONE', 30, 20, PAL.ink, 2, 1);
    } else {
      centeredText(g, 'ADMIT', 30, 11, PAL.red2, 2, 1);
    }
    // Bold barcode on the narrow cream stub.
    const bars: [number, number][] = [[55, 2], [58, 2], [61, 3], [65, 2], [68, 2]];
    for (const [x, width] of bars) g.rect(x, 12, width, 12, PAL.ink);
    g.rect(54, 10, 17, 2, PAL.paperDark);
    g.rect(54, 25, 17, 2, PAL.paperDark);
  } else {
    star(g, 4, 8.5, 2, PAL.red2);
    if (!outline) {
      centeredText(g, 'ADMIT', 15, 4, PAL.ink, 1, 0);
      centeredText(g, 'ONE', 15, 10, PAL.ink, 1, 0);
    }
    g.rect(27, 6, 2, 7, PAL.ink);
    g.rect(30, 5, 2, 8, PAL.ink);
    g.rect(33, 7, 2, 6, PAL.ink);
  }
  if (!outline) g.outline();
  return g.sprite(`ticket:${small ? 'small' : 'hero'}:${outline ? 'owed-dashed' : 'cream-red'}`);
}

function stampLines(value: string) {
  const words = value.toUpperCase().split(/\s+/).filter(Boolean);
  if (words.length > 1) return words.slice(0, 2);
  return words.length ? [words[0]!] : ['SOLD'];
}

function ticketStampSprite(value: string, small: boolean) {
  const label = value.toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim() || 'SOLD';
  const cell = small ? 1 : 2;
  const gap = small ? 0 : 1;
  const width = small ? 23 : 50, height = small ? 15 : 26;
  const g = new Grid(width, height);
  g.round(0, 0, width, height, 2, PAL.red2);
  g.round(small ? 1 : 2, small ? 1 : 2, width - (small ? 2 : 4), height - (small ? 2 : 4), 1, PAL.paper);
  const lines = stampLines(label);
  const lineHeight = 5 * cell;
  const totalHeight = lines.length * lineHeight + (lines.length - 1) * (small ? 1 : 1);
  let y = Math.max(small ? 1 : 1, Math.floor((height - totalHeight) / 2));
  for (const line of lines) {
    const textW = measure(line, cell, gap);
    const x = Math.floor((width - textW) / 2);
    pixelText(g, line, x, y, PAL.red2, cell, gap);
    y += lineHeight + 1;
  }
  g.outline();
  return g.sprite(`ticket:stamp:red:${small ? 'small' : 'hero'}:${label}`);
}

function borrowedTagSprite(small: boolean) {
  const cols = small ? 40 : 74, rows = small ? 16 : 30;
  const g = new Grid(cols, rows);
  // Cord hangs below the tag and reaches the ticket's upper edge.
  const cx = Math.floor(cols / 2);
  g.line({ x: cx - 1, y: small ? 10 : 14 }, { x: cx + 1, y: rows - 1 }, 2, PAL.wood4);
  g.line({ x: cx, y: small ? 11 : 15 }, { x: cx + 2, y: rows - 1 }, 1, PAL.paperDark);
  const cardH = small ? 11 : 15;
  g.round(0, 0, cols, cardH, 2, PAL.ink);
  g.round(1, 1, cols - 2, cardH - 2, 1, PAL.paperShade);
  g.round(2, 2, cols - 4, cardH - 4, 1, PAL.paper);
  g.ellipse(small ? 5 : 6, small ? 5 : 7, small ? 2 : 2.5, small ? 2 : 2.5, PAL.ink);
  g.ellipse(small ? 5 : 6, small ? 5 : 7, 0.9, 0.9, PAL.paperShade);
  if (small) pixelText(g, 'BORROWED', 12, 3, PAL.ink, 1, 0);
  else pixelText(g, 'BORROWED', 7, 2.5, PAL.ink, 2, 1);
  g.outline();
  return g.sprite(`ticket:borrowed-tag:${small ? 'small' : 'hero'}`);
}

/** Draw a 420×204 hero ticket. tagSwing controls the BORROWED tag's gentle motion. */
export function drawTicket(ctx: Ctx, o: DrawOptions & {
  tag?: 'borrowed' | 'none'; tagSwing?: number; stamp?: 'SOLD' | 'SOLD OUT' | 'SHORT SQUEEZE'; stampProgress?: number;
  size?: 'hero' | 'small'; outline?: boolean;
}) {
  const small = o.size === 'small';
  const outlined = o.outline ?? false;
  const scale = o.scale ?? 1;
  const angle = o.rot ?? 0;
  drawSprite(ctx, ticketSprite(small, outlined), o.x, o.y, { rot: angle, scale, alpha: o.alpha });

  if (o.tag === 'borrowed' && !outlined) {
    const swing = o.tagSwing ?? Math.sin((o.t ?? 0) * Math.PI * 1.5) * 0.08;
    const endY = -(small ? TICKET_SMALL_SIZE.h : TICKET_SIZE.h) * 0.5 * scale;
    const tx = o.x - Math.sin(angle) * endY;
    const ty = o.y + Math.cos(angle) * endY;
    drawSprite(ctx, borrowedTagSprite(small), tx, ty, {
      anchor: [0.5, 1], rot: angle + swing, scale, alpha: o.alpha,
    });
  }

  if (o.stamp && !outlined && (o.stampProgress ?? 1) > 0) {
    const p = Math.max(0, Math.min(1, o.stampProgress ?? 1));
    const eased = 1 - Math.pow(1 - p, 3);
    const backOut = 1 + 2.70158 * Math.pow(p - 1, 3) + 1.70158 * Math.pow(p - 1, 2);
    const stamp = ticketStampSprite(o.stamp, small);
    const localX = (small ? -33 : -60) * scale;
    const localY = (1 - eased) * 13 * scale;
    const sx = o.x + Math.cos(angle) * localX - Math.sin(angle) * localY;
    const sy = o.y + Math.sin(angle) * localX + Math.cos(angle) * localY;
    drawSprite(ctx, stamp, sx, sy, {
      rot: angle + (o.stamp === 'SHORT SQUEEZE' ? -0.025 : -0.045) + (1 - eased) * 0.035,
      scale: scale * (0.55 + 0.45 * backOut), alpha: (o.alpha ?? 1) * eased,
    });
  }
}

/** Draw a neat fan of 0–5 cream tickets centred at x/y. */
export function drawTicketStack(ctx: Ctx, o: DrawOptions & { count: number }) {
  const count = Math.max(0, Math.min(5, Math.floor(o.count)));
  const sprite = ticketSprite(false, false);
  for (let i = 0; i < count; i++) {
    const centered = i - (count - 1) / 2;
    drawSprite(ctx, sprite, o.x + centered * 8 * (o.scale ?? 1), o.y + Math.abs(centered) * 3 * (o.scale ?? 1), {
      rot: (o.rot ?? 0) + centered * 0.075, scale: o.scale, alpha: o.alpha,
    });
  }
}

const g = (name: string, draw: (ctx: Ctx, x: number, y: number, t: number) => void, w = 420, h = 204) => ({ name, draw, w, h });
export const GALLERY = [
  g('Ticket · hero', (ctx, x, y) => drawTicket(ctx, { x, y })),
  g('Ticket · borrowed tag', (ctx, x, y, t) => drawTicket(ctx, { x, y, t, tag: 'borrowed' }), 450, 390),
  g('Ticket · stamping', (ctx, x, y, t) => drawTicket(ctx, { x, y, stamp: 'SOLD', stampProgress: Math.min(1, t * 3) })),
  g('Ticket · SOLD', (ctx, x, y) => drawTicket(ctx, { x, y, stamp: 'SOLD', stampProgress: 1 })),
  g('Ticket · SOLD OUT', (ctx, x, y) => drawTicket(ctx, { x, y, stamp: 'SOLD OUT', stampProgress: 1 })),
  g('Ticket · SHORT SQUEEZE', (ctx, x, y) => drawTicket(ctx, { x, y, stamp: 'SHORT SQUEEZE', stampProgress: 1 })),
  g('Ticket · owes outline', (ctx, x, y) => drawTicket(ctx, { x, y, outline: true })),
  g('Ticket · small', (ctx, x, y) => drawTicket(ctx, { x, y, size: 'small' }), 210, 102),
  g('Ticket · small borrowed', (ctx, x, y, t) => drawTicket(ctx, { x, y, t, size: 'small', tag: 'borrowed' }), 300, 198),
  g('Ticket stack · 1', (ctx, x, y) => drawTicketStack(ctx, { x, y, count: 1 }), TICKET_STACK_SIZE.w, TICKET_STACK_SIZE.h),
  g('Ticket stack · 2', (ctx, x, y) => drawTicketStack(ctx, { x, y, count: 2 }), TICKET_STACK_SIZE.w, TICKET_STACK_SIZE.h),
  g('Ticket stack · 3', (ctx, x, y) => drawTicketStack(ctx, { x, y, count: 3 }), TICKET_STACK_SIZE.w, TICKET_STACK_SIZE.h),
  g('Ticket stack · 4', (ctx, x, y) => drawTicketStack(ctx, { x, y, count: 4 }), TICKET_STACK_SIZE.w, TICKET_STACK_SIZE.h),
  g('Ticket stack · 5', (ctx, x, y) => drawTicketStack(ctx, { x, y, count: 5 }), TICKET_STACK_SIZE.w, TICKET_STACK_SIZE.h),
];
