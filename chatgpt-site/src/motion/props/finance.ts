import { Grid, PAL } from '../kit/pixel';
import { drawSprite, type Sprite } from '../kit/sprite';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Base = { x: number; y: number; t?: number; rot?: number; scale?: number; alpha?: number };
const A: [number, number] = [0.5, 0.5];
export const FINANCE_ANCHOR: [number, number] = A;
export const FINANCE_SIZE = { w: 480, h: 420 } as const;
export const SHARE_SIZE = { w: 480, h: 372 } as const;
export const CONTRACT_SIZE = { w: 420, h: 390 } as const;
export const OPTION_CONTRACT_SIZE = CONTRACT_SIZE;
export const BOND_SIZE = { w: 450, h: 390 } as const;
export const PIGGY_SIZE = { w: 390, h: 336 } as const;
export const PIGGY_BANK_SIZE = PIGGY_SIZE;
export const MONEY_BAG_SIZE = { w: 360, h: 420 } as const;
export const GOLD_SIZE = { w: 420, h: 300 } as const;
export const COIN_SIZE = { w: 240, h: 240 } as const;
export const CREDIT_CARD_SIZE = { w: 432, h: 276 } as const;
export const CALCULATOR_SIZE = { w: 360, h: 456 } as const;
export const PERCENT_SIZE = { w: 420, h: 264 } as const;
export const PIE_SIZE = { w: 384, h: 384 } as const;
export const PIE_CHART_SIZE = PIE_SIZE;
export const BAR_CHART_SIZE = { w: 480, h: 360 } as const;
export const CANDLESTICKS_SIZE = { w: 420, h: 336 } as const;
export const DIVIDEND_SIZE = { w: 300, h: 360 } as const;
export const DIVIDEND_DRIP_SIZE = DIVIDEND_SIZE;
export const BASKET_SIZE = { w: 420, h: 360 } as const;
export const DIVERSIFICATION_BASKET_SIZE = BASKET_SIZE;
export const UMBRELLA_SIZE = { w: 420, h: 420 } as const;
export const SHIELD_SIZE = { w: 330, h: 390 } as const;
export const LEVER_SIZE = { w: 510, h: 360 } as const;
export const MAGNIFIER_SIZE = { w: 360, h: 360 } as const;
export const MAGNIFYING_GLASS_SIZE = MAGNIFIER_SIZE;
export const HOURGLASS_SIZE = { w: 300, h: 420 } as const;
export const CALENDAR_SIZE = { w: 390, h: 420 } as const;
export const DICE_SIZE = { w: 300, h: 300 } as const;
export const CRYPTO_COIN_SIZE = { w: 330, h: 330 } as const;

type Painter = (g: Grid) => void;
const sprite = (key: string, w: number, h: number, paint: Painter, outline = true): Sprite => {
  const g = new Grid(w, h);
  paint(g);
  if (outline) g.outline(PAL.ink);
  return g.sprite('finance:v2:' + key);
};
const box = (g: Grid, x: number, y: number, w: number, h: number, c: string) => g.rect(x, y, w, h, c);
const ellipse = (g: Grid, x: number, y: number, rx: number, ry: number, c: string) => g.ellipse(x, y, rx, ry, c);
const poly = (g: Grid, pts: [number, number][], c: string) => g.poly(pts.map(([x, y]) => ({ x, y })), c);
const line = (g: Grid, x1: number, y1: number, x2: number, y2: number, c: string, w = 2) => g.line({ x: x1, y: y1 }, { x: x2, y: y2 }, w, c);
const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
function draw(ctx: Ctx, s: Sprite, o: Base, anchor: [number, number] = A) {
  drawSprite(ctx, s, o.x, o.y, { anchor, scale: o.scale, rot: o.rot, alpha: o.alpha });
}

// 4 × 7 bitmap letters. A 2 × draw makes bold, chunky 12-art-pixel caps.
const FONT: Record<string, readonly string[]> = {
  A:['0110','1001','1001','1111','1001','1001','1001'], B:['1110','1001','1001','1110','1001','1001','1110'],
  C:['0111','1000','1000','1000','1000','1000','0111'], D:['1110','1001','1001','1001','1001','1001','1110'],
  E:['1111','1000','1000','1110','1000','1000','1111'], F:['1111','1000','1000','1110','1000','1000','1000'],
  G:['0111','1000','1000','1011','1001','1001','0111'], H:['1001','1001','1001','1111','1001','1001','1001'],
  I:['1111','0110','0110','0110','0110','0110','1111'], J:['0011','0001','0001','0001','1001','1001','0110'],
  K:['1001','1010','1100','1000','1100','1010','1001'], L:['1000','1000','1000','1000','1000','1000','1111'],
  M:['1001','1111','1111','1001','1001','1001','1001'], N:['1001','1101','1101','1011','1011','1001','1001'],
  O:['0110','1001','1001','1001','1001','1001','0110'], P:['1110','1001','1001','1110','1000','1000','1000'],
  Q:['0110','1001','1001','1001','1011','1010','0101'], R:['1110','1001','1001','1110','1100','1010','1001'],
  S:['0111','1000','1000','0110','0001','0001','1110'], T:['1111','0110','0110','0110','0110','0110','0110'],
  U:['1001','1001','1001','1001','1001','1001','0110'], V:['1001','1001','1001','1001','1001','0110','0110'],
  W:['1001','1001','1001','1001','1111','1111','1001'], X:['1001','1001','0110','0110','0110','1001','1001'],
  Y:['1001','1001','0110','0110','0110','0110','0110'], Z:['1111','0001','0010','0110','1000','1000','1111'],
  '0':['0110','1001','1011','1011','1101','1001','0110'], '1':['0110','1110','0110','0110','0110','0110','1111'],
  '2':['1110','0001','0001','0110','1000','1000','1111'], '3':['1110','0001','0001','0110','0001','0001','1110'],
  '4':['1001','1001','1001','1111','0001','0001','0001'], '5':['1111','1000','1000','1110','0001','0001','1110'],
  '6':['0111','1000','1000','1110','1001','1001','0110'], '7':['1111','0001','0010','0010','0100','0100','0100'],
  '8':['0110','1001','1001','0110','1001','1001','0110'], '9':['0110','1001','1001','0111','0001','0001','1110'],
  '$':['0110','1111','1000','0110','0001','1111','0110'], '%':['1001','0001','0010','0100','1000','1001','0000'],
  '+':['0000','0110','0110','1111','0110','0110','0000'], '-':['0000','0000','0000','1111','0000','0000','0000'],
  '=':['0000','1111','0000','1111','0000','0000','0000'], '?':['1110','0001','0001','0110','0100','0000','0100'],
  '!':['0110','0110','0110','0110','0110','0000','0110'], '.':['0000','0000','0000','0000','0000','0000','0110'],
};
function textWidth(value: string, scale: number, gap = 1): number {
  let w = 0;
  for (const ch of value.toUpperCase()) w += (ch === ' ' ? 3 : 4) * scale + gap;
  return Math.max(0, w - gap);
}
function putText(g: Grid, value: string, x: number, y: number, color: string, scale = 2, gap = 1) {
  let px = x;
  for (const ch of value.toUpperCase()) {
    if (ch === ' ') { px += 3 * scale + gap; continue; }
    const glyph = FONT[ch] ?? FONT['?']!;
    for (let row = 0; row < glyph.length; row++) {
      for (let col = 0; col < glyph[row]!.length; col++) {
        if (glyph[row]![col] === '1') g.rect(px + col * scale, y + row * scale, scale, scale, color);
      }
    }
    px += 4 * scale + gap;
  }
}
function condensedWidth(value: string, scale: number, gap = 2) {
  return Math.max(0, [...value].length * (3 * scale + gap) - gap);
}
function putCondensedText(g: Grid, value: string, x: number, y: number, color: string, scale = 2, gap = 2) {
  let px = x;
  for (const ch of value.toUpperCase()) {
    if (ch === ' ') { px += 2 * scale + gap; continue; }
    const glyph = FONT[ch] ?? FONT['?']!;
    for (let row = 0; row < glyph.length; row++) {
      const bits = glyph[row]!;
      const condensed = [bits[0], bits[1] === '1' || bits[2] === '1' ? '1' : '0', bits[3]];
      for (let col = 0; col < 3; col++) if (condensed[col] === '1') g.rect(px + col * scale, y + row * scale, scale, scale, color);
    }
    px += 3 * scale + gap;
  }
}
function centeredText(g: Grid, value: string, cx: number, y: number, color: string, maxW: number, maxH: number, prefer = 2) {
  const v = value.toUpperCase().slice(0, 12);
  const scale = Math.max(1, Math.min(prefer, Math.floor(maxH / 7), Math.floor((maxW + 1) / Math.max(1, v.length * 4 + v.split(' ').length))));
  if (scale < 2 && maxH >= 14 && condensedWidth(v, 2) <= maxW) {
    putCondensedText(g, v, Math.floor(cx - condensedWidth(v, 2) / 2), y, color, 2);
  } else {
    putText(g, v, Math.floor(cx - textWidth(v, scale) / 2), y, color, scale);
  }
}

/** Share certificate. x/y mark its centre. */
export function drawShare(ctx: Ctx, o: Base & { label?: string }) {
  const issuer = (o.label ?? '').toUpperCase().slice(0, 8);
  const s = sprite('share:' + issuer, 80, 62, g => {
    poly(g, [[3,2],[76,2],[78,4],[78,59],[2,59],[1,58],[1,4]], PAL.ink);
    poly(g, [[5,4],[74,4],[76,6],[76,57],[4,57],[3,56],[3,6]], PAL.paper);
    box(g, 7, 7, 53, 2, PAL.paperDark);
    if (issuer) centeredText(g, issuer, 39, 12, PAL.wood3, 65, 14, 2);
    centeredText(g, 'SHARE', 38, issuer ? 27 : 17, PAL.ink, 65, 15, 2);
    box(g, 8, 43, 41, 2, PAL.paperShade); box(g, 8, 48, 34, 2, PAL.paperShade);
    ellipse(g, 62, 45, 9, 9, PAL.red3); ellipse(g, 61, 44, 6, 6, PAL.red1);
    poly(g, [[57,51],[62,54],[59,60],[55,57]], PAL.red2);
    poly(g, [[64,51],[68,52],[69,59],[64,57]], PAL.red2);
    ellipse(g, 61, 44, 2, 2, PAL.gold1);
  });
  draw(ctx, s, o);
}
function contractSprite(title: string, signed = 0) {
  const label = title.toUpperCase().slice(0, 8), p = Math.round(clamp(signed) * 10);
  return sprite('contract:' + label + ':' + p, 70, 65, g => {
    poly(g, [[3,1],[57,1],[68,12],[68,63],[2,63],[1,62],[1,4]], PAL.ink);
    poly(g, [[5,3],[55,3],[66,14],[66,60],[4,60],[3,59],[3,5]], PAL.paper);
    poly(g, [[55,4],[64,13],[55,13]], PAL.paperShade);
    centeredText(g, label, 34, 8, PAL.ink, 64, 15, 2);
    box(g, 8, 27, 43, 2, PAL.paperDark); box(g, 8, 33, 47, 2, PAL.paperShade);
    box(g, 8, 39, 38, 2, PAL.paperShade); box(g, 8, 45, 45, 2, PAL.paperShade);
    if (p > 0) {
      const end = 9 + Math.round(47 * p / 10);
      line(g, 9, 55, 17, 51, PAL.red3, 3); line(g, 17, 51, 23, 56, PAL.red3, 3);
      line(g, 23, 56, 31, 50, PAL.red3, 3); line(g, 31, 50, end, 54, PAL.red3, 3);
    } else {
      ellipse(g, 57, 52, 7, 7, PAL.red3); ellipse(g, 56, 51, 4, 4, PAL.red1);
    }
    ellipse(g, 59, 28, 6, 6, PAL.red3); ellipse(g, 58, 27, 4, 4, PAL.red1);
    ellipse(g, 58, 27, 2, 2, PAL.gold1);
  });
}
/** Paper contract. signed from 0 to 1 draws in a signature. */
export function drawContract(ctx: Ctx, o: Base & { signed?: number; label?: string }) {
  draw(ctx, contractSprite(o.label ?? 'CONTRACT', o.signed ?? 0), o);
}
function bondSprite(label: string) {
  const v = label.toUpperCase().slice(0, 8);
  return sprite('bond:' + v, 75, 65, g => {
    poly(g, [[2,1],[72,1],[73,3],[73,62],[2,62],[1,61],[1,4]], PAL.ink);
    poly(g, [[4,3],[70,3],[71,4],[71,60],[4,60],[3,59],[3,5]], PAL.paper);
    box(g, 7, 7, 48, 2, PAL.paperDark);
    centeredText(g, v || 'BOND', 35, 13, PAL.ink, 64, 15, 2);
    box(g, 8, 30, 43, 2, PAL.paperShade); box(g, 8, 36, 39, 2, PAL.paperShade);
    box(g, 8, 42, 45, 2, PAL.paperShade); box(g, 8, 48, 25, 2, PAL.paperShade);
    ellipse(g, 59, 48, 9, 9, PAL.red3); ellipse(g, 58, 47, 6, 6, PAL.red1);
    centeredText(g, '$', 58, 42, PAL.gold1, 9, 12, 1);
    box(g, 68, 8, 3, 47, PAL.red2);
  });
}
export function drawBond(ctx: Ctx, o: Base & { label?: string }) { draw(ctx, bondSprite(o.label ?? 'BOND'), o); }

function pigSprite(fill: number, crack: boolean) {
  const level = Math.round(clamp(fill) * 3);
  return sprite('pig:' + level + ':' + crack, 65, 56, g => {
    ellipse(g, 31, 31, 27, 20, PAL.ink); ellipse(g, 30, 29, 24, 17, PAL.pink2);
    ellipse(g, 25, 25, 13, 10, PAL.pink1); ellipse(g, 41, 33, 11, 9, PAL.pink3);
    poly(g, [[12,17],[13,5],[25,14],[22,21]], PAL.ink); poly(g, [[15,16],[16,9],[22,15],[21,18]], PAL.pink2);
    poly(g, [[34,14],[43,4],[49,19],[43,22]], PAL.ink); poly(g, [[38,15],[43,9],[46,18],[42,19]], PAL.pink1);
    ellipse(g, 55, 30, 9, 7, PAL.ink); ellipse(g, 57, 30, 6, 4, PAL.pink1);
    box(g, 55, 28, 3, 3, PAL.pink3); box(g, 60, 28, 3, 3, PAL.pink3); ellipse(g, 45, 23, 2, 2, PAL.ink);
    box(g, 25, 8, 13, 4, PAL.ink); box(g, 27, 9, 9, 2, PAL.wood3);
    box(g, 16, 43, 10, 10, PAL.ink); box(g, 18, 44, 6, 8, PAL.pink3);
    box(g, 38, 43, 10, 10, PAL.ink); box(g, 40, 44, 6, 8, PAL.pink3);
    for (let i = 0; i < level; i++) {
      const cx = 25 + i * 8, cy = 5 - Math.floor(i / 2) * 2;
      ellipse(g, cx, cy, 6, 3, PAL.gold4); ellipse(g, cx, cy - 1, 5, 2, PAL.gold2);
      box(g, cx - 2, cy - 2, 4, 1, PAL.gold1);
    }
    if (crack) {
      line(g, 14, 25, 19, 30, PAL.wood4, 3); line(g, 19, 30, 15, 35, PAL.wood4, 3);
      line(g, 15, 35, 22, 39, PAL.wood4, 3); line(g, 22, 39, 19, 43, PAL.wood4, 3);
    }
  });
}
export function drawPiggyBank(ctx: Ctx, o: Base & { fill?: number; crack?: boolean }) {
  draw(ctx, pigSprite(o.fill ?? 0, !!o.crack), o);
}

const bag = sprite('money-bag', 60, 70, g => {
  ellipse(g, 30, 44, 25, 25, PAL.ink); ellipse(g, 28, 41, 22, 22, PAL.wood2);
  ellipse(g, 22, 34, 11, 15, PAL.wood1); ellipse(g, 40, 47, 10, 14, PAL.wood3);
  poly(g, [[19,21],[41,21],[38,31],[23,31]], PAL.ink); poly(g, [[22,23],[38,23],[35,28],[25,28]], PAL.wood1);
  box(g, 18, 18, 24, 4, PAL.ink); box(g, 21, 19, 18, 2, PAL.wood3);
  line(g, 19, 19, 14, 14, PAL.wood4, 3); line(g, 41, 19, 46, 14, PAL.wood4, 3);
  centeredText(g, '$', 30, 32, PAL.green4, 23, 30, 4);
  box(g, 12, 62, 13, 5, PAL.ink); box(g, 14, 62, 9, 3, PAL.wood3);
  box(g, 36, 62, 13, 5, PAL.ink); box(g, 38, 62, 9, 3, PAL.wood3);
});
export function drawMoneyBag(ctx: Ctx, o: Base) { draw(ctx, bag, o); }

const goldBars = sprite('gold-bars', 70, 50, g => {
  poly(g, [[3,31],[34,20],[67,31],[67,45],[35,49],[3,42]], PAL.ink);
  poly(g, [[7,31],[34,23],[62,31],[35,39]], PAL.gold1);
  poly(g, [[7,34],[35,40],[35,45],[7,40]], PAL.gold2); poly(g, [[35,40],[62,34],[62,41],[35,45]], PAL.gold3);
  poly(g, [[18,16],[39,6],[61,15],[39,25]], PAL.ink);
  poly(g, [[22,16],[39,9],[56,15],[39,21]], PAL.gold1);
  poly(g, [[22,18],[39,23],[39,28],[22,23]], PAL.gold2); poly(g, [[39,23],[56,18],[56,22],[39,28]], PAL.gold3);
  poly(g, [[7,28],[29,19],[44,23],[23,32]], PAL.ink);
  poly(g, [[11,28],[29,22],[39,25],[23,30]], PAL.gold1);
  poly(g, [[11,30],[23,33],[23,37],[11,34]], PAL.gold2); poly(g, [[23,33],[39,28],[39,32],[23,37]], PAL.gold3);
});
export function drawGoldBars(ctx: Ctx, o: Base) { draw(ctx, goldBars, o); }

function coinSprite(symbol: '$' | 'B') {
  return sprite('gold-coin:' + symbol, 40, 40, g => {
    ellipse(g, 20, 20, 19, 19, PAL.ink); ellipse(g, 19, 19, 16, 16, PAL.gold4);
    ellipse(g, 18, 18, 13, 13, PAL.gold2); ellipse(g, 15, 14, 6, 5, PAL.gold1);
    ellipse(g, 20, 20, 10, 10, PAL.gold3); centeredText(g, symbol, 20, 13, PAL.gold1, 15, 18, 2);
  });
}
export function drawGoldCoin(ctx: Ctx, o: Base & { symbol?: '$' | 'B' }) { draw(ctx, coinSprite(o.symbol ?? '$'), o); }

const card = sprite('credit-card', 72, 46, g => {
  g.round(0, 2, 72, 42, 5, PAL.ink); g.round(2, 4, 68, 38, 4, PAL.blue4);
  g.round(4, 6, 64, 33, 3, PAL.blue2); box(g, 5, 12, 62, 8, PAL.blue4); box(g, 5, 12, 62, 4, PAL.blue3);
  box(g, 11, 25, 17, 13, PAL.ink); box(g, 13, 27, 13, 9, PAL.gold2);
  box(g, 19, 27, 2, 9, PAL.gold3); box(g, 13, 30, 13, 2, PAL.gold3);
  centeredText(g, 'CARD', 48, 25, PAL.paper, 35, 15, 2); box(g, 38, 36, 26, 2, PAL.blue1);
});
export function drawCreditCard(ctx: Ctx, o: Base) { draw(ctx, card, o); }

const calculator = sprite('calculator', 60, 76, g => {
  g.round(1, 0, 58, 76, 6, PAL.ink); g.round(4, 3, 52, 70, 5, PAL.blue4); g.round(7, 6, 46, 65, 4, PAL.blue2);
  g.round(9, 7, 42, 22, 2, PAL.ink); g.round(11, 9, 38, 18, 1, PAL.paper);
  centeredText(g, '1234', 30, 11, PAL.green4, 34, 14, 2);
  const xs = [14, 25, 36, 47], ys = [34, 44, 54, 64];
  ys.forEach((y, row) => xs.forEach((x, col) => {
    g.round(x - 4, y - 3, 9, 8, 1, PAL.ink);
    g.round(x - 3, y - 2, 7, 5, 1, row === 3 && col === 3 ? PAL.gold2 : PAL.blue1);
  }));
  centeredText(g, '+', 47, 31, PAL.ink, 7, 11, 1);
  centeredText(g, '-', 47, 41, PAL.ink, 7, 11, 1);
  centeredText(g, '=', 47, 61, PAL.ink, 7, 11, 1);
});
export function drawCalculator(ctx: Ctx, o: Base) { draw(ctx, calculator, o); }

function percentSprite(value: string, tone: 'gain' | 'loss' | 'neutral') {
  const label = value.replace(/[^A-Za-z0-9.%+-]/g, '').slice(0, 7).toUpperCase() || '5%';
  const color = tone === 'gain' ? PAL.DOWN : tone === 'loss' ? PAL.UP : PAL.gold4;
  return sprite('percent:' + label + ':' + tone, 70, 44, g => {
    ellipse(g, 35, 22, 33, 21, PAL.ink); ellipse(g, 34, 20, 30, 18, PAL.paperShade); ellipse(g, 31, 17, 24, 13, PAL.paper);
    const scale = label.length > 5 ? 2 : 3;
    centeredText(g, label, 35, 22 - 3 * scale, color, 56, 7 * scale, scale);
  });
}
export function drawPercentBadge(ctx: Ctx, o: Base & { value?: string | number; tone?: 'gain' | 'loss' | 'neutral' }) {
  draw(ctx, percentSprite(String(o.value ?? '5%'), o.tone ?? 'neutral'), o);
}

const PIE_COLORS = [[PAL.blue2, PAL.blue1, PAL.blue3], [PAL.gold2, PAL.gold1, PAL.gold3], [PAL.red2, PAL.red1, PAL.red3], [PAL.green2, PAL.green1, PAL.green3]];
function pieSprite(values: number[], highlight: number) {
  const vals = values.slice(0, 8).map(n => Math.max(0, n));
  if (!vals.length || vals.reduce((a, b) => a + b, 0) <= 0) vals.splice(0, vals.length, 1);
  const total = vals.reduce((a, b) => a + b, 0), quant = vals.map(n => n / total);
  return sprite('pie:' + quant.map(n => Math.round(n * 128)).join('.') + ':h' + highlight, 64, 64, g => {
    const cx = 32, cy = 32, radius = 28;
    for (let y = 3; y < 61; y++) for (let x = 3; x < 61; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy > radius * radius) continue;
      const a = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2);
      let acc = 0, idx = quant.length - 1;
      for (let i = 0; i < quant.length; i++) { acc += quant[i]! * Math.PI * 2; if (a <= acc) { idx = i; break; } }
      const tones = PIE_COLORS[idx % PIE_COLORS.length]!;
      const col = dx < -3 && dy < 2 ? tones[1] : dx > 6 || dy > 8 ? tones[2] : tones[0];
      g.set(x, y, idx === highlight ? tones[1] : col);
    }
    g.ellipse(cx, cy, 3, 3, PAL.paper);
  });
}
export function drawPieChart(ctx: Ctx, o: Base & { slices?: number[]; highlight?: number }) {
  draw(ctx, pieSprite(o.slices ?? [1, 1, 1], o.highlight ?? 0), o);
}

function barsSprite(values: number[], grow: number) {
  const arr = values.slice(0, 7).map(n => clamp(n));
  if (!arr.length) arr.push(0.7);
  const p = Math.round(clamp(grow) * 24) / 24;
  return sprite('bars:' + arr.map(n => Math.round(n * 20)).join('-') + ':' + Math.round(p * 24), 80, 60, g => {
    box(g, 8, 6, 3, 47, PAL.ink); box(g, 8, 50, 68, 3, PAL.ink);
    box(g, 10, 8, 2, 41, PAL.grey2); box(g, 11, 51, 64, 2, PAL.grey2);
    const gap = 4, bw = Math.floor((62 - (arr.length - 1) * gap) / arr.length);
    arr.forEach((v, i) => {
      const full = Math.round(37 * v), h = Math.round(full * p);
      if (!h) return;
      const x = 14 + i * (bw + gap), y = 49 - h;
      box(g, x, y, bw, h, PAL.blue3); box(g, x + 1, y + 1, Math.max(1, bw - 2), Math.max(1, h - 2), PAL.blue2);
      box(g, x + 1, y + 1, Math.max(1, bw - 2), Math.min(3, h - 1), PAL.blue1);
    });
  });
}
export function drawBarChart(ctx: Ctx, o: Base & { bars?: number[]; grow?: number }) {
  draw(ctx, barsSprite(o.bars ?? [0.45, 0.72, 0.55, 0.92], o.grow ?? 1), o);
}

function candlesSprite(gains: ('gain' | 'loss' | 'neutral')[]) {
  const list = [...gains, 'neutral', 'gain'].slice(0, 3);
  return sprite('candles:' + list.join('-'), 70, 56, g => {
    const xs = [16, 35, 54], tops = [14, 7, 20], bottoms = [43, 40, 48];
    list.forEach((kind, i) => {
      const x = xs[i]!, top = tops[i]!, bottom = bottoms[i]!;
      const main = kind === 'gain' ? PAL.DOWN : kind === 'loss' ? PAL.UP : PAL.blue2;
      const light = kind === 'gain' ? PAL.green1 : kind === 'loss' ? PAL.red1 : PAL.blue1;
      const shade = kind === 'gain' ? PAL.green4 : kind === 'loss' ? PAL.red3 : PAL.blue4;
      box(g, x - 2, top - 7, 4, bottom - top + 14, PAL.ink); box(g, x - 1, top - 6, 2, bottom - top + 12, shade);
      box(g, x - 5, top, 10, bottom - top, PAL.ink); box(g, x - 3, top + 2, 5, Math.max(2, bottom - top - 4), main);
      box(g, x - 3, top + 2, 2, Math.max(2, bottom - top - 4), light);
    });
    box(g, 6, 49, 58, 3, PAL.ink); box(g, 8, 49, 54, 1, PAL.grey2);
  });
}
export function drawCandlestickTrio(ctx: Ctx, o: Base & { candles?: ('gain' | 'loss' | 'neutral')[] }) {
  draw(ctx, candlesSprite(o.candles ?? ['gain', 'loss', 'gain']), o);
}

const drip = sprite('dividend-drop', 34, 40, g => {
  poly(g, [[17,1],[31,19],[31,27],[27,35],[17,39],[7,35],[3,27],[3,19]], PAL.ink);
  poly(g, [[17,5],[27,20],[27,27],[23,32],[17,35],[10,32],[7,27],[7,20]], PAL.green3);
  poly(g, [[17,7],[24,20],[20,25],[12,24],[9,20]], PAL.green1); centeredText(g, '$', 17, 20, PAL.paper, 12, 14, 2);
});
const dripCoin = coinSprite('$');
export function drawDividendDrip(ctx: Ctx, o: Base) {
  const sc = o.scale ?? 1, t = o.t ?? 0;
  draw(ctx, drip, { ...o, y: o.y - 48 * sc });
  drawSprite(ctx, dripCoin, o.x, o.y + 72 * sc + Math.sin(t * Math.PI * 2) * 10 * sc, { scale: sc, alpha: o.alpha });
}

function basketSprite(count: number) {
  const n = Math.max(0, Math.min(5, Math.floor(count)));
  return sprite('basket:' + n, 70, 60, g => {
    const pos: [number, number][] = [[17,28],[27,23],[37,27],[47,22],[56,28]];
    for (let i = 0; i < n; i++) {
      const [x, y] = pos[i]!;
      if (i % 3 === 0) {
        ellipse(g, x, y, 7, 8, PAL.red3); ellipse(g, x - 1, y - 2, 5, 5, PAL.red1);
        line(g, x, y - 8, x + 2, y - 12, PAL.wood4, 2); box(g, x + 2, y - 11, 6, 3, PAL.green2);
      } else if (i % 3 === 1) {
        poly(g, [[x,y-9],[x-7,y+3],[x+7,y+3]], PAL.ink); poly(g, [[x,y-6],[x-5,y+1],[x+5,y+1]], PAL.gold2);
      } else {
        ellipse(g, x, y, 7, 6, PAL.blue4); ellipse(g, x - 1, y - 1, 5, 4, PAL.blue1);
      }
    }
    line(g, 14, 32, 18, 7, PAL.wood4, 5); line(g, 18, 7, 52, 7, PAL.wood4, 5); line(g, 52, 7, 57, 32, PAL.wood4, 5);
    poly(g, [[7,29],[63,29],[56,56],[14,56]], PAL.ink); poly(g, [[11,32],[59,32],[53,52],[18,52]], PAL.wood2);
    box(g, 13, 37, 45, 4, PAL.wood3); box(g, 15, 45, 41, 4, PAL.wood1);
    for (let x = 19; x < 55; x += 9) box(g, x, 32, 3, 20, PAL.wood4);
    box(g, 10, 30, 50, 3, PAL.wood1);
  });
}
export function drawDiversificationBasket(ctx: Ctx, o: Base & { items?: number }) { draw(ctx, basketSprite(o.items ?? 5), o); }

function umbrellaSprite(progress: number, color: 'red' | 'blue') {
  const p = Math.round(clamp(progress) * 20) / 20;
  const main = color === 'red' ? PAL.red2 : PAL.blue2;
  const light = color === 'red' ? PAL.red1 : PAL.blue1;
  const shade = color === 'red' ? PAL.red3 : PAL.blue4;
  const half = Math.round(7 + 24 * p), top = Math.round(8 - 2 * p), bottom = Math.round(50 - 16 * p);
  const upper = Math.round(top + (bottom - top) * 0.30), lower = Math.round(bottom - 5);
  return sprite('umbrella:' + Math.round(p * 20) + ':' + color, 70, 70, g => {
    const canopy: [number,number][] = [
      [35,top],[35+Math.round(half*.42),upper-3],[35+Math.round(half*.78),upper],
      [35+half,lower],[35+Math.round(half*.72),lower-1],[35+Math.round(half*.5),bottom],
      [35+Math.round(half*.28),lower-2],[35,bottom],[35-Math.round(half*.28),lower-2],
      [35-Math.round(half*.5),bottom],[35-Math.round(half*.72),lower-1],[35-half,lower],
      [35-Math.round(half*.78),upper],[35-Math.round(half*.42),upper-3],
    ];
    poly(g, canopy.map(([x,y])=>[x,y] as [number,number]), PAL.ink);
    const inner: [number,number][] = canopy.map(([x,y])=>[35+(x-35)*0.88, top+(y-top)*0.88] as [number,number]);
    poly(g, inner, main);
    poly(g, [[35,top+3],[35-Math.round(half*.55),upper],[35-Math.round(half*.86),lower-3],
      [35-Math.round(half*.48),bottom-3],[35,bottom-2]], light);
    poly(g, [[35,top+3],[35+Math.round(half*.52),upper],[35+Math.round(half*.86),lower-3],
      [35+Math.round(half*.48),bottom-3],[35,bottom-2]], shade);
    if (p > 0.55) {
      line(g, 35, top+4, 35, bottom-3, PAL.ink, 2);
      line(g, 35-Math.round(half*.48), upper+1, 35, bottom-3, PAL.ink, 2);
      line(g, 35+Math.round(half*.48), upper+1, 35, bottom-3, PAL.ink, 2);
    }
    line(g, 35, bottom-1, 35, 61, PAL.ink, 5); line(g, 35, bottom, 35, 59, PAL.grey3, 2);
    line(g, 35, 60, 35, 67, PAL.ink, 5); line(g, 35, 60, 35, 65, PAL.wood2, 2);
    poly(g, [[34,67],[38,67],[40,63],[38,61],[36,64]], PAL.wood3);
  });
}
export function drawUmbrella(ctx: Ctx, o: Base & { open?: number; color?: 'red' | 'blue' }) {
  const p = clamp(o.open ?? 1), sc = o.scale ?? 1, color = o.color ?? 'red';
  drawSprite(ctx, umbrellaSprite(p, color), o.x, o.y, { scale: sc, rot: o.rot, alpha: o.alpha });
}

const shield = sprite('insurance-shield', 55, 65, g => {
  poly(g, [[27,1],[51,9],[49,34],[43,47],[35,57],[27,63],[19,57],[11,47],[5,34],[3,9]], PAL.ink);
  poly(g, [[27,5],[47,12],[45,33],[39,45],[33,53],[27,58],[21,53],[15,45],[9,33],[8,12]], PAL.blue3);
  poly(g, [[10,13],[27,8],[27,56],[20,51],[14,42],[10,32]], PAL.blue1);
  poly(g, [[27,8],[44,14],[42,32],[37,43],[31,51],[27,56]], PAL.blue2);
  line(g, 15, 31, 24, 40, PAL.green4, 7); line(g, 24, 40, 40, 21, PAL.green4, 7);
  line(g, 16, 30, 24, 37, PAL.green1, 3); line(g, 24, 37, 38, 21, PAL.green1, 3);
});
export function drawShield(ctx: Ctx, o: Base) { draw(ctx, shield, o); }

const leverBeam = sprite('lever-beam', 76, 9, g => {
  poly(g, [[1,2],[75,2],[71,8],[5,8]], PAL.ink); poly(g, [[5,3],[70,3],[67,6],[8,6]], PAL.wood2);
  box(g, 7, 3, 55, 2, PAL.wood1); box(g, 68, 3, 3, 3, PAL.wood4);
});
const leverPan = sprite('lever-pan', 34, 24, g => {
  line(g, 3, 1, 10, 16, PAL.ink, 3); line(g, 31, 1, 24, 16, PAL.ink, 3);
  line(g, 4, 2, 10, 15, PAL.grey2, 2); line(g, 30, 2, 24, 15, PAL.grey2, 2);
  poly(g, [[1,15],[33,15],[27,23],[7,23]], PAL.ink); poly(g, [[5,16],[29,16],[25,20],[9,20]], PAL.gold2);
  box(g, 8, 16, 15, 2, PAL.gold1);
});
const fulcrum = sprite('lever-fulcrum', 44, 36, g => {
  poly(g, [[22,2],[2,32],[42,32]], PAL.ink); poly(g, [[22,8],[8,29],[36,29]], PAL.wood2);
  poly(g, [[22,9],[22,28],[10,28]], PAL.wood1); box(g, 3, 32, 38, 4, PAL.ink); box(g, 6, 32, 32, 2, PAL.grey3);
});
const hanger = sprite('lever-hanger', 4, 9, g => { box(g, 0, 0, 4, 9, PAL.ink); box(g, 1, 1, 2, 7, PAL.grey2); });
export function drawLever(ctx: Ctx, o: Base & { tilt?: number }) {
  const a = clamp((o.tilt ?? 0), -1, 1) * 0.3, sc = o.scale ?? 1;
  draw(ctx, fulcrum, { ...o, y: o.y + 65 * sc });
  drawSprite(ctx, leverBeam, o.x, o.y - 13 * sc, { scale: sc, rot: a, alpha: o.alpha });
  for (const sign of [-1, 1]) {
    const dx = sign * 218 * sc, yy = o.y - 13 * sc + Math.sin(a) * dx;
    drawSprite(ctx, hanger, o.x + dx, yy + 24 * sc, { scale: sc, alpha: o.alpha });
    drawSprite(ctx, leverPan, o.x + dx, yy + 50 * sc, { scale: sc, alpha: o.alpha });
  }
}

const magnifier = sprite('magnifier', 60, 60, g => {
  line(g, 38, 38, 57, 57, PAL.ink, 12); line(g, 39, 39, 55, 55, PAL.wood3, 7); line(g, 41, 40, 53, 52, PAL.wood1, 2);
  ellipse(g, 25, 24, 23, 23, PAL.ink); ellipse(g, 24, 23, 19, 19, PAL.blue4);
  ellipse(g, 23, 22, 15, 15, PAL.blue2); ellipse(g, 19, 17, 6, 5, PAL.blue1); ellipse(g, 26, 26, 7, 7, PAL.grey3);
});
export function drawMagnifyingGlass(ctx: Ctx, o: Base) { draw(ctx, magnifier, o); }

function hourglassSprite(progress: number) {
  const p = Math.round(clamp(progress) * 24) / 24;
  return sprite('hourglass:' + Math.round(p * 24), 50, 70, g => {
    box(g, 5, 1, 40, 8, PAL.ink); box(g, 8, 3, 34, 4, PAL.wood2); box(g, 10, 3, 24, 2, PAL.wood1);
    box(g, 5, 61, 40, 8, PAL.ink); box(g, 8, 63, 34, 4, PAL.wood2); box(g, 10, 63, 24, 2, PAL.wood1);
    line(g, 11, 8, 22, 30, PAL.ink, 6); line(g, 39, 8, 28, 30, PAL.ink, 6);
    line(g, 22, 40, 11, 62, PAL.ink, 6); line(g, 28, 40, 39, 62, PAL.ink, 6);
    poly(g, [[14,10],[36,10],[27,30],[27,40],[36,60],[14,60],[23,40],[23,30]], PAL.blue4);
    poly(g, [[16,12],[34,12],[26,30],[26,40],[34,58],[16,58],[24,40],[24,30]], PAL.blue1);
    const topY = 12 + Math.round(17 * p);
    if (p < 1) poly(g, [[16,12],[34,12],[26,topY],[24,topY]], PAL.gold2);
    if (p > 0) {
      const bottom = 58, height = Math.round(17 * p), half = Math.max(3, Math.round(height * 0.72));
      poly(g, [[25,41],[27,41],[27 + half,bottom],[25 - half,bottom]], PAL.gold2);
      poly(g, [[25,45],[26,45],[26 + Math.floor(half * 0.5),bottom - 2],[25 - Math.floor(half * 0.5),bottom - 2]], PAL.gold1);
    }
    box(g, 24, 31, 2, 10, PAL.gold3); line(g, 10, 11, 19, 28, PAL.wood1, 2); line(g, 40, 11, 31, 28, PAL.wood3, 2);
  });
}
export function drawHourglass(ctx: Ctx, o: Base & { p?: number }) { draw(ctx, hourglassSprite(o.p ?? 0.5), o); }

function calendarSprite(label: string) {
  const v = label.toUpperCase().slice(0, 8) || 'DATE';
  return sprite('calendar:' + v, 65, 70, g => {
    g.round(1, 2, 63, 66, 3, PAL.ink); g.round(4, 5, 57, 61, 2, PAL.paper); g.round(4, 5, 57, 17, 2, PAL.red2);
    box(g, 5, 18, 55, 4, PAL.red3); centeredText(g, v, 32, 9, PAL.paper, 51, 14, 2);
    for (const x of [17, 48]) { g.round(x - 3, 0, 6, 12, 2, PAL.ink); g.round(x - 1, 1, 3, 8, 1, PAL.grey2); }
    for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) {
      const x = 11 + col * 12, y = 29 + row * 10, chosen = row === 1 && col === 2;
      g.round(x, y, 7, 7, 1, chosen ? PAL.red3 : PAL.paperShade);
      if (chosen) g.round(x + 1, y + 1, 5, 5, 1, PAL.red1);
    }
  });
}
const calendarLeaf = sprite('calendar-leaf', 57, 60, g => {
  poly(g, [[2,1],[54,1],[56,3],[56,58],[2,58],[1,57]], PAL.ink); poly(g, [[4,3],[52,3],[54,5],[54,56],[4,56],[3,55]], PAL.paper);
  box(g, 8, 9, 39, 3, PAL.red2); box(g, 8, 19, 41, 2, PAL.paperShade);
  box(g, 8, 26, 36, 2, PAL.paperShade); box(g, 8, 33, 43, 2, PAL.paperShade); box(g, 8, 40, 38, 2, PAL.paperShade);
});
export function drawCalendarPage(ctx: Ctx, o: Base & { label?: string; flip?: number }) {
  const sc = o.scale ?? 1, f = clamp(o.flip ?? 0);
  draw(ctx, calendarSprite(o.label ?? 'JUNE'), o);
  if (f > 0 && f < 1) {
    const sx = 0.48 + 0.52 * Math.abs(Math.cos(f * Math.PI));
    drawSprite(ctx, calendarLeaf, o.x + 30 * sc * (f < 0.5 ? f : 1 - f), o.y - 10 * sc, { scale: sc, sx, rot: (f - 0.5) * 0.18, alpha: o.alpha });
  }
}

function diceSprite(face: number) {
  const v = Math.max(1, Math.min(6, Math.floor(face)));
  return sprite('dice:' + v, 50, 50, g => {
    poly(g, [[8,3],[43,3],[48,8],[48,42],[42,48],[7,48],[2,43],[2,9]], PAL.ink);
    poly(g, [[9,6],[42,6],[45,9],[45,41],[41,45],[9,45],[5,41],[5,10]], PAL.grey2);
    poly(g, [[9,6],[42,6],[45,9],[45,15],[8,15]], PAL.white);
    const positions: Record<number, [number, number][]> = {
      1:[[25,25]], 2:[[15,15],[35,35]], 3:[[15,15],[25,25],[35,35]],
      4:[[15,15],[35,15],[15,35],[35,35]], 5:[[15,15],[35,15],[25,25],[15,35],[35,35]],
      6:[[15,13],[35,13],[15,25],[35,25],[15,37],[35,37]],
    };
    positions[v]!.forEach(([x, y]) => { ellipse(g, x, y, 4, 4, PAL.ink); ellipse(g, x - 1, y - 1, 1, 1, PAL.grey3); });
  });
}
export function drawDice(ctx: Ctx, o: Base & { face?: number }) { draw(ctx, diceSprite(o.face ?? 5), o); }

function cryptoCoin(symbol: 'B' | '$') {
  return sprite('crypto-coin:' + symbol, 55, 55, g => {
    ellipse(g, 27, 27, 26, 26, PAL.ink); ellipse(g, 26, 25, 22, 22, PAL.orange3);
    ellipse(g, 24, 23, 18, 18, PAL.gold2); ellipse(g, 19, 16, 8, 6, PAL.gold1);
    ellipse(g, 26, 27, 14, 14, PAL.orange2); ellipse(g, 25, 26, 11, 11, PAL.gold2);
    centeredText(g, symbol, 25, 16, PAL.wood4, 22, 24, 3);
    if (symbol === 'B') { box(g, 22, 12, 2, 31, PAL.wood4); box(g, 28, 12, 2, 31, PAL.wood4); }
  });
}
/** Orange-gold digital coin. $ is generic; B is Bitcoin-style. */
export function drawCryptoCoin(ctx: Ctx, o: Base & { symbol?: 'B' | '$' }) { draw(ctx, cryptoCoin(o.symbol ?? 'B'), o); }

const gEntry = (name: string, fn: (ctx: Ctx, x: number, y: number, t: number) => void, w: number, h: number) => ({ name, draw: fn, w, h });
export const GALLERY = [
  gEntry('Share certificate', (c,x,y)=>drawShare(c,{x,y}),480,372),
  gEntry('Contract · unsigned', (c,x,y)=>drawContract(c,{x,y}),420,390),
  gEntry('Contract · signed', (c,x,y)=>drawContract(c,{x,y,signed:1}),420,390),
  gEntry('Option contract', (c,x,y)=>drawContract(c,{x,y,label:'OPTION',signed:.75}),420,390),
  gEntry('Bond and coupon', (c,x,y)=>drawBond(c,{x,y}),450,390),
  gEntry('Piggy bank · empty', (c,x,y)=>drawPiggyBank(c,{x,y,fill:0}),390,336),
  gEntry('Piggy bank · filled', (c,x,y)=>drawPiggyBank(c,{x,y,fill:1}),390,336),
  gEntry('Piggy bank · filling', (c,x,y,t)=>drawPiggyBank(c,{x,y,fill:clamp(t*2.5)}),390,336),
  gEntry('Piggy bank · cracked', (c,x,y)=>drawPiggyBank(c,{x,y,fill:.65,crack:true}),390,336),
  gEntry('Money bag · dollar', (c,x,y)=>drawMoneyBag(c,{x,y}),360,420),
  gEntry('Gold bar stack', (c,x,y)=>drawGoldBars(c,{x,y}),420,300),
  gEntry('Gold coin', (c,x,y)=>drawGoldCoin(c,{x,y}),COIN_SIZE.w,COIN_SIZE.h),
  gEntry('Credit card', (c,x,y)=>drawCreditCard(c,{x,y}),432,276),
  gEntry('Calculator', (c,x,y)=>drawCalculator(c,{x,y}),360,456),
  gEntry('Percent · gain', (c,x,y)=>drawPercentBadge(c,{x,y,value:'+12%',tone:'gain'}),420,264),
  gEntry('Percent · loss', (c,x,y)=>drawPercentBadge(c,{x,y,value:'-8%',tone:'loss'}),420,264),
  gEntry('Pie chart · allocation', (c,x,y)=>drawPieChart(c,{x,y,slices:[5,3,2],highlight:0}),384,384),
  gEntry('Bars · growing', (c,x,y)=>drawBarChart(c,{x,y,bars:[.3,.55,.7,1],grow:.72}),480,360),
  gEntry('Candles · mixed', (c,x,y)=>drawCandlestickTrio(c,{x,y,candles:['gain','loss','gain']}),420,336),
  gEntry('Dividend drip', (c,x,y,t)=>drawDividendDrip(c,{x,y,t}),300,360),
  gEntry('Diversification basket · 5', (c,x,y)=>drawDiversificationBasket(c,{x,y,items:5}),420,360),
  gEntry('Umbrella · open', (c,x,y)=>drawUmbrella(c,{x,y,open:1}),420,420),
  gEntry('Umbrella · blue', (c,x,y)=>drawUmbrella(c,{x,y,open:1,color:'blue'}),420,420),
  gEntry('Umbrella · closed', (c,x,y)=>drawUmbrella(c,{x,y,open:0}),420,420),
  gEntry('Umbrella · opening', (c,x,y,t)=>drawUmbrella(c,{x,y,open:clamp(t*2.5)}),420,420),
  gEntry('Insurance shield', (c,x,y)=>drawShield(c,{x,y}),330,390),
  gEntry('Leverage · tilted', (c,x,y)=>drawLever(c,{x,y,tilt:.45}),510,360),
  gEntry('Leverage · balancing', (c,x,y,t)=>drawLever(c,{x,y,tilt:Math.sin(t*2)}),510,360),
  gEntry('Magnifying glass', (c,x,y)=>drawMagnifyingGlass(c,{x,y}),360,360),
  gEntry('Hourglass · half', (c,x,y)=>drawHourglass(c,{x,y,p:.5}),300,420),
  gEntry('Hourglass · draining', (c,x,y,t)=>drawHourglass(c,{x,y,p:clamp(.15+t)}),300,420),
  gEntry('Calendar page · June', (c,x,y)=>drawCalendarPage(c,{x,y,label:'JUNE'}),390,420),
  gEntry('Calendar · flip', (c,x,y,t)=>drawCalendarPage(c,{x,y,label:'JUNE',flip:clamp(t)}),390,420),
  gEntry('Dice · five', (c,x,y)=>drawDice(c,{x,y,face:5}),300,300),
  gEntry('Crypto coin · Bitcoin', (c,x,y)=>drawCryptoCoin(c,{x,y}),330,330),
];
