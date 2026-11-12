import { Grid, PAL } from '../kit/pixel';
import { ART, drawSprite, type Sprite } from '../kit/sprite';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Base = { x: number; y: number; t?: number; rot?: number; scale?: number; alpha?: number };
export const SYMBOL_ANCHOR = [0.5, 0.5] as const;
export const BULL_SIZE = { w: 510, h: 390 } as const;
export const BEAR_SIZE = { w: 480, h: 390 } as const;
export const ARROW_SIZE = { w: 300, h: 420 } as const;
export const ARROW_BLOCK_SIZE = ARROW_SIZE;
export const BUBBLE_SIZE = { w: 600, h: 252 } as const;
export const SPEECH_BUBBLE_SIZE = BUBBLE_SIZE;
export const THOUGHT_SIZE = { w: 600, h: 300 } as const;
export const THOUGHT_BUBBLE_SIZE = THOUGHT_SIZE;
export const WARNING_SIZE = { w: 360, h: 330 } as const;
export const WARNING_TRIANGLE_SIZE = WARNING_SIZE;
export const STAMP_SIZE = { w: 300, h: 300 } as const;
export const CHECK_STAMP_SIZE = STAMP_SIZE;
export const CROSS_STAMP_SIZE = STAMP_SIZE;
export const QUESTION_SIZE = { w: 240, h: 330 } as const;
export const QUESTION_MARK_SIZE = QUESTION_SIZE;
export const CHIP_SIZE = { w: 228, h: 228 } as const;
export const EQUATION_CHIP_SIZE = CHIP_SIZE;
export const VS_CHIP_SIZE = { w: 270, h: 228 } as const;
export const BOX_SIZE = { w: 420, h: 360 } as const;
export const LABELLED_CRATE_SIZE = BOX_SIZE;

type Painter = (g: Grid) => void;
const sprite = (key: string, w: number, h: number, paint: Painter, outline = true): Sprite => {
  const g = new Grid(w, h);
  paint(g);
  if (outline) g.outline(PAL.ink);
  return g.sprite('symbols:v2:' + key);
};
const box = (g: Grid, x: number, y: number, w: number, h: number, c: string) => g.rect(x, y, w, h, c);
const ellipse = (g: Grid, x: number, y: number, rx: number, ry: number, c: string) => g.ellipse(x, y, rx, ry, c);
const poly = (g: Grid, pts: [number, number][], c: string) => g.poly(pts.map(([x, y]) => ({ x, y })), c);
const line = (g: Grid, x1: number, y1: number, x2: number, y2: number, c: string, w = 2) => g.line({ x: x1, y: y1 }, { x: x2, y: y2 }, w, c);
const clamp = (n: number) => Math.max(0, Math.min(1, n));
function draw(ctx: Ctx, s: Sprite, o: Base) {
  drawSprite(ctx, s, o.x, o.y, { scale: o.scale, rot: o.rot, alpha: o.alpha });
}

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
  '?':['1110','0001','0001','0110','0100','0000','0100'], '+':['0000','0110','0110','1111','0110','0110','0000'],
  '-':['0000','0000','0000','1111','0000','0000','0000'], '=':['0000','1111','0000','1111','0000','0000','0000'],
  '%':['1001','0001','0010','0100','1000','1001','0000'],
};
function textWidth(value: string, scale: number, gap = 1) {
  let w = 0;
  for (const ch of value.toUpperCase()) w += (ch === ' ' ? 3 : 4) * scale + gap;
  return Math.max(0, w - gap);
}
function putText(g: Grid, value: string, x: number, y: number, color: string, scale = 2, gap = 1) {
  let px = x;
  for (const ch of value.toUpperCase()) {
    if (ch === ' ') { px += 3 * scale + gap; continue; }
    const glyph = FONT[ch] ?? FONT['?']!;
    for (let yy = 0; yy < glyph.length; yy++) for (let xx = 0; xx < glyph[yy]!.length; xx++) {
      if (glyph[yy]![xx] === '1') g.rect(px + xx * scale, y + yy * scale, scale, scale, color);
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
function centeredText(g: Grid, value: string, cx: number, y: number, color: string, maxW: number, maxH: number, preferred = 2) {
  const v = value.toUpperCase();
  const scale = Math.max(1, Math.min(preferred, Math.floor(maxH / 7), Math.floor((maxW + 1) / Math.max(1, v.length * 4 + v.split(' ').length))));
  if (scale < 2 && maxH >= 14 && condensedWidth(v, 2) <= maxW) {
    putCondensedText(g, v, Math.floor(cx - condensedWidth(v, 2) / 2), y, color, 2);
  } else {
    putText(g, v, Math.floor(cx - textWidth(v, scale) / 2), y, color, scale);
  }
}

function bullBody() {
  return sprite('bull-body', 85, 65, g => {
    // Barrel chest, high shoulder, long tail and lowered forehead are the bull's main masses.
    poly(g, [[7,34],[10,27],[17,21],[28,17],[41,15],[51,17],[57,22],[64,20],[69,15],[77,16],[83,22],[84,30],[80,36],[73,39],[67,39],[61,45],[54,47],[47,45],[37,44],[29,42],[19,42],[12,39]], PAL.ink);
    poly(g, [[12,33],[15,27],[21,23],[31,20],[43,18],[52,20],[58,25],[65,23],[70,19],[76,20],[80,24],[80,30],[76,34],[70,36],[65,36],[59,42],[53,43],[47,42],[37,41],[29,39],[20,39],[14,37]], PAL.wood2);
    poly(g, [[15,27],[22,23],[32,20],[44,18],[52,20],[57,25],[51,30],[42,31],[31,29],[22,31],[15,33]], PAL.wood1);
    poly(g, [[35,34],[43,31],[54,31],[61,35],[59,41],[53,43],[46,41],[37,40]], PAL.wood3);
    // Bull head and blunt muzzle face right.
    poly(g, [[58,22],[66,18],[74,19],[79,23],[83,27],[81,33],[75,36],[66,35],[60,31]], PAL.wood3);
    poly(g, [[66,23],[75,22],[81,26],[80,31],[74,33],[67,31]], PAL.wood2);
    ellipse(g, 78, 31, 7, 5, PAL.wood1); ellipse(g, 80, 30, 4, 3, PAL.pink2);
    box(g, 79, 29, 2, 2, PAL.wood4); box(g, 83, 29, 2, 2, PAL.wood4);
    box(g, 70, 23, 3, 3, PAL.ink); box(g, 69, 22, 1, 1, PAL.white);
    ellipse(g, 62, 21, 3, 2, PAL.wood1);
    // Two high, curved cream horns make the species unmistakable.
    poly(g, [[61,23],[55,17],[53,10],[55,6],[58,12],[63,18]], PAL.ink);
    poly(g, [[58,20],[55,15],[55,10],[57,14],[62,19]], PAL.gold1);
    poly(g, [[70,20],[72,13],[78,8],[82,9],[78,13],[75,21]], PAL.ink);
    poly(g, [[72,18],[74,14],[78,11],[77,14],[75,19]], PAL.gold1);
    // Upturned tail tuft.
    line(g, 13, 28, 8, 21, PAL.wood4, 4); line(g, 8, 21, 5, 16, PAL.wood3, 4);
    poly(g, [[4,18],[2,12],[8,15],[10,20]], PAL.wood1);
    // Small brass nose ring, a clean accent against the muzzle.
    ellipse(g, 77, 36, 3, 3, PAL.gold2); ellipse(g, 77, 36, 1, 1, PAL.wood4);
  });
}
function bullLeg(front: boolean) {
  return sprite('bull-leg:' + front, 14, 24, g => {
    poly(g, [[3,1],[11,1],[11,16],[12,19],[13,22],[2,22],[3,19]], PAL.ink);
    poly(g, [[5,3],[9,3],[9,16],[10,19],[10,21],[5,21],[5,17]], front ? PAL.wood2 : PAL.wood3);
    box(g, 3, 20, 10, 3, PAL.wood4); box(g, 5, 20, 5, 1, PAL.wood2);
  });
}
export function drawBull(ctx: Ctx, o: Base & { charge?: number }) {
  const q = clamp(o.charge ?? 0), s = o.scale ?? 1, t = o.t ?? 0, x = o.x + q * 24 * s;
  const back = bullLeg(false), front = bullLeg(true);
  for (const [ax, phase] of [[26,0],[35,Math.PI]] as [number,number][]) {
    drawSprite(ctx, back, x + (ax - 42.5) * ART * s, o.y + (52 - 32.5) * ART * s, { scale:s, rot:Math.sin(t * 12 + phase) * q * 0.32, alpha:o.alpha });
  }
  drawSprite(ctx, bullBody(), x, o.y, { scale:s, rot:-q * 0.025, alpha:o.alpha });
  for (const [ax, phase] of [[59,Math.PI],[69,0]] as [number,number][]) {
    drawSprite(ctx, front, x + (ax - 42.5) * ART * s, o.y + (52 - 32.5) * ART * s, { scale:s, rot:Math.sin(t * 12 + phase) * q * 0.35, alpha:o.alpha });
  }
}

function bearBody() {
  return sprite('bear-body', 80, 65, g => {
    // Big sloping back, little ears, forward muzzle and broad paws create a bear profile.
    poly(g, [[7,36],[9,29],[16,23],[26,19],[37,18],[47,20],[54,23],[61,20],[68,22],[73,27],[80,30],[83,35],[80,40],[72,43],[66,43],[61,49],[51,51],[41,49],[31,48],[22,45],[14,42]], PAL.ink);
    poly(g, [[11,35],[13,29],[19,25],[28,22],[38,21],[47,23],[54,26],[61,23],[67,25],[71,29],[78,32],[79,36],[76,39],[70,41],[64,41],[59,46],[51,48],[42,46],[32,45],[23,43],[16,40]], PAL.wood4);
    poly(g, [[14,30],[20,25],[29,22],[39,21],[47,23],[54,26],[59,31],[53,36],[43,37],[32,35],[23,37],[15,36]], PAL.wood3);
    poly(g, [[55,26],[62,23],[68,25],[73,29],[79,32],[79,37],[73,40],[65,39],[59,36]], PAL.wood3);
    // Rounded ears sit behind a long, grey muzzle.
    ellipse(g, 62, 21, 6, 6, PAL.ink); ellipse(g, 62, 21, 3, 3, PAL.wood2);
    ellipse(g, 73, 22, 6, 6, PAL.ink); ellipse(g, 73, 22, 3, 3, PAL.wood2);
    poly(g, [[66,27],[74,26],[81,30],[83,35],[78,39],[69,37],[64,33]], PAL.grey3);
    poly(g, [[69,29],[76,28],[81,31],[80,35],[76,37],[70,35]], PAL.grey1);
    ellipse(g, 82, 32, 4, 3, PAL.grey5); ellipse(g, 83, 31, 1, 1, PAL.ink);
    ellipse(g, 69, 28, 3, 3, PAL.grey1); ellipse(g, 70, 28, 2, 2, PAL.ink); box(g, 69, 27, 1, 1, PAL.white);
    line(g, 73, 37, 79, 38, PAL.wood4, 2);
    // A heavy brow and pale claws distinguish the face and paws.
    box(g, 67, 25, 7, 2, PAL.wood4);
    box(g, 15, 39, 12, 5, PAL.wood3);
  });
}
function bearLeg(front: boolean) {
  return sprite('bear-leg:' + front, 16, 23, g => {
    poly(g, [[2,1],[14,1],[14,14],[15,18],[14,21],[2,21],[1,18]], PAL.ink);
    poly(g, [[4,3],[12,3],[12,14],[13,17],[12,19],[4,19],[3,17]], front ? PAL.wood3 : PAL.wood4);
    if (front) {
      for (const x of [5,8,11]) {
        line(g, x, 17, x - 1, 22, PAL.paper, 2);
      }
    } else {
      box(g, 4, 18, 9, 2, PAL.wood3);
    }
  });
}
export function drawBear(ctx: Ctx, o: Base & { charge?: number }) {
  const q = clamp(o.charge ?? 0), s = o.scale ?? 1, t = o.t ?? 0, x = o.x + q * 16 * s;
  const back = bearLeg(false), front = bearLeg(true);
  for (const [ax, phase] of [[21,0],[31,Math.PI]] as [number,number][]) {
    drawSprite(ctx, back, x + (ax - 40) * ART * s, o.y + (53 - 32.5) * ART * s, { scale:s, rot:Math.sin(t * 10 + phase) * q * 0.3, alpha:o.alpha });
  }
  drawSprite(ctx, bearBody(), x, o.y, { scale:s, rot:-q * 0.018, alpha:o.alpha });
  for (const [ax, phase] of [[56,Math.PI],[66,0]] as [number,number][]) {
    drawSprite(ctx, front, x + (ax - 40) * ART * s, o.y + (53 - 32.5) * ART * s, { scale:s, rot:Math.sin(t * 10 + phase) * q * 0.3, alpha:o.alpha });
  }
}

function arrowSprite(direction: 'up' | 'down', tone: 'gain' | 'loss' | 'neutral', progress: number) {
  const reveal = Math.round(clamp(progress) * 70), key = Math.round(clamp(progress) * 70);
  const g = new Grid(50, 70);
  const base = new Grid(50, 70);
  const color = tone === 'gain' ? PAL.DOWN : tone === 'loss' ? PAL.UP : PAL.gold2;
  const light = tone === 'gain' ? PAL.green1 : tone === 'loss' ? PAL.red1 : PAL.gold1;
  if (direction === 'up') {
    poly(base, [[25,1],[49,25],[38,25],[38,68],[12,68],[12,25],[1,25]], PAL.ink);
    poly(base, [[25,7],[43,24],[33,24],[33,63],[17,63],[17,24],[7,24]], color); box(base, 18, 27, 5, 31, light);
  } else {
    poly(base, [[12,2],[38,2],[38,45],[49,45],[25,69],[1,45],[12,45]], PAL.ink);
    poly(base, [[17,7],[33,7],[33,46],[43,46],[25,63],[7,46],[17,46]], color); box(base, 18, 10, 5, 30, light);
  }
  base.outline(PAL.ink);
  for (let y = 0; y < 70; y++) for (let x = 0; x < 50; x++) {
    const visible = direction === 'up' ? y >= 70 - reveal : y < reveal;
    if (visible) g.set(x, y, base.get(x, y));
  }
  return g.sprite('symbols:v2:arrow:' + direction + ':' + tone + ':' + key);
}
export function drawArrowBlock(ctx: Ctx, o: Base & { direction: 'up' | 'down'; tone?: 'gain' | 'loss' | 'neutral'; progress?: number }) {
  draw(ctx, arrowSprite(o.direction, o.tone ?? 'neutral', o.progress ?? 1), o);
}

function bubbleSprite(value: string, thought: boolean) {
  const label = value.toUpperCase().slice(0, 10), w = Math.min(100, Math.max(48, textWidth(label, 2) + 22)), h = thought ? 50 : 42;
  return sprite('bubble:' + thought + ':' + label, w, h, g => {
    if (thought) {
      ellipse(g, w / 2, 22, w / 2 - 3, 21, PAL.ink); ellipse(g, w / 2, 21, w / 2 - 7, 17, PAL.paper);
      ellipse(g, 13, 36, 7, 6, PAL.ink); ellipse(g, 12, 35, 4, 3, PAL.paper);
      ellipse(g, 7, 44, 3, 3, PAL.ink);
      centeredText(g, label, w / 2, 18, PAL.ink, w - 20, 14, 2);
    } else {
      g.round(3, 1, w - 6, 32, 7, PAL.ink); g.round(6, 3, w - 12, 27, 5, PAL.paper);
      poly(g, [[16,30],[30,30],[20,41]], PAL.ink); poly(g, [[19,30],[26,30],[20,36]], PAL.paper);
      centeredText(g, label, w / 2, 11, PAL.ink, w - 18, 15, 2);
    }
  });
}
export function drawSpeechBubble(ctx: Ctx, o: Base & { text: string }) { draw(ctx, bubbleSprite(o.text, false), o); }
export function drawThoughtBubble(ctx: Ctx, o: Base & { text: string }) { draw(ctx, bubbleSprite(o.text, true), o); }

const warning = sprite('warning-triangle', 60, 55, g => {
  poly(g, [[30,1],[59,53],[1,53]], PAL.ink); poly(g, [[30,7],[52,47],[8,47]], PAL.gold2);
  poly(g, [[30,10],[46,40],[30,40]], PAL.gold3); poly(g, [[30,9],[30,38],[13,40]], PAL.gold1);
  box(g, 27, 17, 6, 17, PAL.ink); box(g, 27, 17, 3, 16, PAL.wood4);
  box(g, 27, 38, 6, 6, PAL.ink); box(g, 28, 39, 4, 4, PAL.wood4);
});
export function drawWarningTriangle(ctx: Ctx, o: Base) { draw(ctx, warning, o); }

function stampSprite(kind: 'check' | 'cross') {
  const color = kind === 'check' ? PAL.green2 : PAL.red2;
  const light = kind === 'check' ? PAL.green1 : PAL.red1;
  return sprite('stamp:' + kind, 50, 50, g => {
    ellipse(g, 25, 25, 24, 24, PAL.ink); ellipse(g, 25, 25, 20, 20, PAL.paper); ellipse(g, 25, 25, 16, 16, color);
    ellipse(g, 25, 25, 11, 11, PAL.paper);
    if (kind === 'check') {
      line(g, 12, 26, 21, 35, PAL.green4, 7); line(g, 21, 35, 39, 15, PAL.green4, 7);
      line(g, 13, 25, 21, 32, light, 3); line(g, 21, 32, 37, 15, light, 3);
    } else {
      line(g, 15, 15, 35, 35, PAL.red3, 7); line(g, 35, 15, 15, 35, PAL.red3, 7);
      line(g, 16, 15, 34, 33, light, 3); line(g, 34, 15, 16, 33, light, 3);
    }
  });
}
export function drawCheckStamp(ctx: Ctx, o: Base) { draw(ctx, stampSprite('check'), o); }
export function drawCrossStamp(ctx: Ctx, o: Base) { draw(ctx, stampSprite('cross'), o); }

const question = sprite('question-mark', 40, 55, g => {
  centeredText(g, '?', 20, 3, PAL.gold3, 34, 49, 7);
  box(g, 17, 48, 7, 7, PAL.gold3); box(g, 18, 49, 4, 4, PAL.gold1);
});
export function drawQuestionMark(ctx: Ctx, o: Base) { draw(ctx, question, o); }

function chipSprite(label: '+' | '-' | '=' | 'X' | 'VS') {
  const two = label === 'VS', w = two ? 45 : 38, h = 38;
  return sprite('chip:' + label, w, h, g => {
    g.round(1, 1, w - 2, h - 2, 5, PAL.ink); g.round(3, 3, w - 6, h - 6, 4, PAL.blue3);
    g.round(5, 5, w - 10, h - 10, 3, PAL.paper);
    centeredText(g, label, w / 2, two ? 15 : 9, PAL.ink, w - 12, 15, two ? 2 : 2);
  });
}
export function drawEquationChip(ctx: Ctx, o: Base & { symbol: '=' | '+' | '-' | 'x' }) {
  draw(ctx, chipSprite(o.symbol === 'x' ? 'X' : o.symbol), o);
}
export function drawVsChip(ctx: Ctx, o: Base) { draw(ctx, chipSprite('VS'), o); }

function crateSprite(label: string) {
  const v = label.toUpperCase().slice(0, 6);
  return sprite('crate:' + v, 70, 60, g => {
    poly(g, [[4,13],[35,2],[66,13],[66,48],[35,58],[4,48]], PAL.ink);
    poly(g, [[8,15],[35,6],[62,15],[35,25]], PAL.wood1);
    poly(g, [[8,18],[33,28],[33,53],[8,46]], PAL.wood2);
    poly(g, [[37,28],[62,18],[62,46],[37,53]], PAL.wood3);
    poly(g, [[11,20],[31,28],[31,33],[11,26]], PAL.wood1);
    line(g, 35, 25, 35, 55, PAL.wood4, 3); line(g, 8, 15, 35, 25, PAL.wood4, 2); line(g, 35, 25, 62, 15, PAL.wood4, 2);
    box(g, 8, 32, 54, 21, PAL.wood4); box(g, 9, 34, 52, 17, PAL.paper);
    centeredText(g, v, 35, 35, PAL.wood4, 52, 14, 2);
  });
}
export function drawLabelledCrate(ctx: Ctx, o: Base & { label: string }) { draw(ctx, crateSprite(o.label), o); }

const gEntry = (name: string, fn: (ctx: Ctx, x: number, y: number, t: number) => void, w: number, h: number) => ({ name, draw: fn, w, h });
export const GALLERY = [
  gEntry('Bull · still', (c,x,y,t)=>drawBull(c,{x,y,t}),510,390),
  gEntry('Bull · charging', (c,x,y,t)=>drawBull(c,{x,y,t,charge:.8}),510,390),
  gEntry('Bear · still', (c,x,y,t)=>drawBear(c,{x,y,t}),480,390),
  gEntry('Bear · charging', (c,x,y,t)=>drawBear(c,{x,y,t,charge:.8}),480,390),
  gEntry('Arrow · up, gain', (c,x,y)=>drawArrowBlock(c,{x,y,direction:'up',tone:'gain',progress:1}),300,420),
  gEntry('Arrow · down, loss', (c,x,y)=>drawArrowBlock(c,{x,y,direction:'down',tone:'loss',progress:1}),300,420),
  gEntry('Arrow · progress', (c,x,y,t)=>drawArrowBlock(c,{x,y,direction:'up',tone:'gain',progress:t*2.5}),300,420),
  gEntry('Speech bubble', (c,x,y)=>drawSpeechBubble(c,{x,y,text:'BUY NOW'}),480,270),
  gEntry('Thought bubble', (c,x,y)=>drawThoughtBubble(c,{x,y,text:'WHY?'}),420,300),
  gEntry('Warning triangle', (c,x,y)=>drawWarningTriangle(c,{x,y}),360,330),
  gEntry('Check stamp', (c,x,y)=>drawCheckStamp(c,{x,y}),300,300),
  gEntry('Cross stamp', (c,x,y)=>drawCrossStamp(c,{x,y}),300,300),
  gEntry('Question mark', (c,x,y)=>drawQuestionMark(c,{x,y}),240,330),
  gEntry('Equation chips', (c,x,y)=>{drawEquationChip(c,{x:x-120,y,symbol:'+'});drawEquationChip(c,{x,y,symbol:'='});drawEquationChip(c,{x:x+120,y,symbol:'x'});},480,240),
  gEntry('VS chip', (c,x,y)=>drawVsChip(c,{x,y}),270,228),
  gEntry('Wooden crate · BOX',(c,x,y)=>drawLabelledCrate(c,{x,y,label:'BOX'}),420,360),
];
