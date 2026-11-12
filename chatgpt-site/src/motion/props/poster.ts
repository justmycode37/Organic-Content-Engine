import { Grid, PAL } from '../kit/pixel';
import { ART, drawSprite } from '../kit/sprite';

export const POSTER_SIZE = { w: 522, h: 684 } as const;
export const MEGAPHONE_SIZE = { w: 300, h: 228 } as const;
export const POSTER_ANCHOR = 'centre' as const;
export const MEGAPHONE_ANCHOR = 'centre' as const;
export type PosterArt = 'band' | 'star' | 'megaphone' | 'chart';
export interface PosterOptions { x: number; y: number; t?: number; rot?: number; scale?: number; alpha?: number; reveal: number; word: string; art?: PosterArt }
export interface MegaphoneOptions { x: number; y: number; t?: number; rot?: number; scale?: number; alpha?: number; blast: number }

const TAU = Math.PI * 2;
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const ease = (v: number) => { const p = clamp(v); return p * p * (3 - 2 * p); };
function sprite(key: string, w: number, h: number, paint: (g: Grid) => void) {
  const g = new Grid(w, h); paint(g); return g.sprite(`prop-poster:${key}`);
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
function pixelText(g: Grid, value: string, cx: number, y: number, color: string) {
  const chars = [...value.toUpperCase()];
  const width = chars.reduce((n, ch) => n + (ch === ' ' ? 4 : 8) + 2, -2);
  let x = Math.round(cx - width / 2);
  for (const [i, ch] of chars.entries()) {
    if (ch === ' ') x += 4;
    else {
      const rows = FONT[ch] ?? ['1111','0001','0010','0100','0100','0000','0100'];
      rows.forEach((row, yy) => [...row].forEach((bit, xx) => { if (bit === '1') g.rect(x + xx * 2, y + yy * 2, 2, 2, color); }));
      x += 8;
    }
    if (i !== chars.length - 1) x += 2;
  }
}
function star(g: Grid, cx: number, cy: number, outer: number, inner: number, color: string) {
  const points = Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? inner : outer;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  });
  g.poly(points, color);
}

function bandArt(g: Grid) {
  // Gold starburst behind three distinct performers.
  const rays = [
    [{ x: 42, y: 31 }, { x: 38, y: 12 }, { x: 46, y: 12 }],
    [{ x: 38, y: 34 }, { x: 20, y: 17 }, { x: 17, y: 22 }],
    [{ x: 47, y: 34 }, { x: 68, y: 17 }, { x: 71, y: 23 }],
    [{ x: 40, y: 38 }, { x: 8, y: 34 }, { x: 8, y: 40 }],
    [{ x: 45, y: 38 }, { x: 78, y: 32 }, { x: 78, y: 40 }],
  ];
  rays.forEach(points => g.poly(points, PAL.gold2));
  g.ellipse(43, 39, 27, 18, PAL.gold1);
  // Guitarist: head, jacket, legs and a bold six-string guitar silhouette.
  g.ellipse(19, 34, 5, 5, PAL.ink); g.ellipse(18, 33, 4, 4, PAL.paperShade);
  g.rect(14, 31, 8, 2, PAL.wood3);
  g.poly([{ x: 13, y: 40 }, { x: 23, y: 39 }, { x: 26, y: 52 }, { x: 12, y: 52 }], PAL.blue3);
  g.rect(14, 51, 5, 12, PAL.ink); g.rect(21, 50, 5, 13, PAL.ink);
  g.rect(12, 61, 9, 3, PAL.wood4); g.rect(20, 61, 9, 3, PAL.wood4);
  g.ellipse(29, 47, 7, 6, PAL.ink); g.ellipse(28, 46, 5, 4, PAL.gold2);
  g.line({ x: 28, y: 46 }, { x: 43, y: 31 }, 3, PAL.wood3); g.rect(40, 28, 7, 4, PAL.wood4);
  // Drummer: seated torso, two readable drum faces and cymbal stands.
  g.ellipse(43, 34, 5, 5, PAL.ink); g.ellipse(42, 33, 4, 4, PAL.paperShade);
  g.rect(39, 31, 8, 2, PAL.red3);
  g.rect(37, 40, 13, 12, PAL.red2); g.rect(39, 42, 8, 7, PAL.red1);
  g.ellipse(35, 54, 7, 6, PAL.ink); g.ellipse(35, 54, 5, 4, PAL.paper);
  g.ellipse(51, 54, 7, 6, PAL.ink); g.ellipse(51, 54, 5, 4, PAL.paper);
  g.rect(34, 59, 3, 5, PAL.wood3); g.rect(50, 59, 3, 5, PAL.wood3);
  g.rect(29, 31, 2, 17, PAL.wood4); g.rect(28, 31, 9, 2, PAL.gold2);
  g.rect(56, 28, 2, 20, PAL.wood4); g.rect(52, 28, 10, 2, PAL.gold2);
  // Singer on the right with raised microphone and a broad stand.
  g.ellipse(67, 34, 5, 5, PAL.ink); g.ellipse(66, 33, 4, 4, PAL.paperShade);
  g.rect(63, 31, 8, 2, PAL.wood3);
  g.poly([{ x: 61, y: 40 }, { x: 72, y: 40 }, { x: 75, y: 53 }, { x: 60, y: 53 }], PAL.pink3);
  g.rect(62, 52, 5, 11, PAL.ink); g.rect(70, 52, 5, 11, PAL.ink);
  g.rect(60, 61, 9, 3, PAL.wood4); g.rect(69, 61, 9, 3, PAL.wood4);
  g.line({ x: 70, y: 40 }, { x: 77, y: 29 }, 3, PAL.ink); g.ellipse(78, 27, 3, 3, PAL.ink); g.ellipse(77, 26, 2, 2, PAL.grey2);
}

function posterArtwork(g: Grid, art: PosterArt) {
  if (art === 'band') { bandArt(g); return; }
  g.ellipse(43, 42, 29, 25, PAL.gold1);
  for (let i = 0; i < 8; i++) {
    const a = i * TAU / 8, x1 = 43 + Math.cos(a) * 25, y1 = 42 + Math.sin(a) * 20;
    const x2 = 43 + Math.cos(a) * 38, y2 = 42 + Math.sin(a) * 31;
    g.line({ x: x1, y: y1 }, { x: x2, y: y2 }, 3, PAL.gold2);
  }
  if (art === 'star') {
    star(g, 43, 43, 24, 11, PAL.red2); star(g, 43, 43, 16, 7, PAL.gold2);
  } else if (art === 'megaphone') {
    g.poly([{ x: 19, y: 37 }, { x: 51, y: 27 }, { x: 60, y: 24 }, { x: 60, y: 57 }, { x: 51, y: 53 }, { x: 19, y: 45 }], PAL.ink);
    g.poly([{ x: 21, y: 38 }, { x: 50, y: 30 }, { x: 56, y: 28 }, { x: 56, y: 52 }, { x: 50, y: 50 }, { x: 21, y: 44 }], PAL.paper);
    g.rect(17, 36, 7, 12, PAL.red2); g.rect(25, 38, 18, 3, PAL.red2);
    g.poly([{ x: 28, y: 46 }, { x: 39, y: 49 }, { x: 36, y: 61 }, { x: 30, y: 59 }], PAL.blue3);
    g.line({ x: 62, y: 32 }, { x: 69, y: 27 }, 3, PAL.red2);
    g.line({ x: 64, y: 40 }, { x: 75, y: 40 }, 3, PAL.red2);
    g.line({ x: 62, y: 48 }, { x: 69, y: 54 }, 3, PAL.red2);
  } else {
    // A bold rising/descending market chart in blue, without tiny axis clutter.
    g.rect(16, 58, 5, 5, PAL.ink); g.rect(16, 20, 5, 43, PAL.ink); g.rect(16, 58, 58, 5, PAL.ink);
    g.line({ x: 25, y: 51 }, { x: 34, y: 51 }, 4, PAL.blue3);
    g.line({ x: 34, y: 51 }, { x: 34, y: 43 }, 4, PAL.blue3);
    g.line({ x: 34, y: 43 }, { x: 46, y: 43 }, 4, PAL.blue3);
    g.line({ x: 46, y: 43 }, { x: 46, y: 33 }, 4, PAL.blue3);
    g.line({ x: 46, y: 33 }, { x: 59, y: 33 }, 4, PAL.blue3);
    g.line({ x: 59, y: 33 }, { x: 59, y: 23 }, 4, PAL.blue3);
    g.poly([{ x: 54, y: 25 }, { x: 59, y: 17 }, { x: 65, y: 25 }], PAL.blue3);
  }
}

function posterFor(word: string, art: PosterArt, reveal: number) {
  const visible = Math.max(0, Math.min(114, Math.round(ease(reveal) * 114)));
  return sprite(`paper-${art}-${word.toUpperCase()}-${visible}`, 87, 114, g => {
    // Warm cream paper with a thick dark outline, clean folded bottom corners.
    g.rect(1, 0, 85, 114, PAL.ink); g.rect(3, 2, 81, 110, PAL.paperShade);
    g.rect(5, 4, 77, 104, PAL.paper); g.rect(7, 6, 73, 2, PAL.white);
    g.rect(7, 7, 2, 101, PAL.white); g.rect(80, 8, 2, 99, PAL.paperDark);
    posterArtwork(g, art);
    // Big, heavy, local bitmap letters; the doubled pixels keep every stroke bold.
    pixelText(g, word, 43, 87, PAL.ink);
    g.rect(12, 104, 63, 2, PAL.red2); g.rect(16, 107, 55, 2, PAL.gold3);
    g.outline();
    if (visible < 114) {
      for (let y = visible; y < 114; y++) for (let x = 0; x < 87; x++) g.data[y * 87 + x] = undefined;
      if (visible > 0) {
        g.rect(1, visible - 1, 85, 1, PAL.ink);
        g.rect(3, visible - 2, 81, 1, PAL.paperShade);
      }
    }
  });
}
const rail = sprite('rail', 87, 9, g => {
  g.round(0, 1, 87, 7, 3, PAL.ink); g.rect(3, 2, 81, 3, PAL.wood2); g.rect(5, 2, 77, 2, PAL.wood1);
  g.rect(7, 6, 73, 2, PAL.wood4); g.outline();
});
const roller = sprite('roller', 87, 7, g => {
  g.round(0, 0, 87, 7, 3, PAL.ink); g.rect(3, 1, 81, 3, PAL.paperShade); g.rect(5, 1, 77, 2, PAL.paper);
  g.rect(7, 4, 73, 2, PAL.paperDark); g.outline();
});

export function drawPoster(ctx: CanvasRenderingContext2D, o: PosterOptions) {
  rotateAround(ctx, o.x, o.y, o.rot);
  const s = o.scale ?? 1, top = o.y - POSTER_SIZE.h * s / 2, art = o.art ?? 'band', p = ease(o.reveal);
  const paper = posterFor(o.word || 'SHOW', art, p), rows = Math.round(p * 114);
  drawSprite(ctx, rail, o.x, top, { anchor: [0.5, 0], scale: s, alpha: o.alpha });
  if (rows > 0) drawSprite(ctx, paper, o.x, top + 7 * ART * s, { anchor: [0.5, 0], scale: s, alpha: o.alpha });
  drawSprite(ctx, roller, o.x, top + (7 + rows) * ART * s, { anchor: [0.5, 0.5], scale: s, alpha: o.alpha });
  ctx.restore();
}

const horn = sprite('megaphone', 50, 38, g => {
  // Wide red-and-cream horn with an open bell, grip and wrist loop.
  g.poly([{ x: 4, y: 13 }, { x: 30, y: 7 }, { x: 46, y: 2 }, { x: 46, y: 31 }, { x: 30, y: 26 }, { x: 4, y: 21 }], PAL.ink);
  g.poly([{ x: 6, y: 14 }, { x: 29, y: 10 }, { x: 43, y: 5 }, { x: 43, y: 28 }, { x: 29, y: 23 }, { x: 6, y: 20 }], PAL.paper);
  g.poly([{ x: 8, y: 15 }, { x: 29, y: 11 }, { x: 37, y: 8 }, { x: 37, y: 24 }, { x: 29, y: 22 }, { x: 8, y: 19 }], PAL.red2);
  g.rect(2, 12, 8, 11, PAL.red3); g.rect(4, 13, 3, 8, PAL.red1);
  g.rect(41, 4, 6, 25, PAL.grey4); g.rect(42, 5, 3, 20, PAL.grey1);
  g.poly([{ x: 15, y: 21 }, { x: 26, y: 23 }, { x: 23, y: 35 }, { x: 17, y: 33 }], PAL.ink);
  g.poly([{ x: 17, y: 22 }, { x: 23, y: 24 }, { x: 21, y: 32 }, { x: 19, y: 31 }], PAL.red2);
  g.rect(15, 32, 11, 3, PAL.ink); g.rect(17, 32, 7, 1, PAL.red1);
  g.outline();
});
function soundWave(n: number) {
  return sprite(`wave-${n}`, 10 + n * 5, 25 + n * 6, g => {
    const w = 10 + n * 5, h = 25 + n * 6, cy = h / 2;
    for (let y = 2; y < h - 2; y++) {
      const radius = (h / 2 - 2), dx = Math.round(Math.sqrt(Math.max(0, radius * radius - (y - cy) ** 2)));
      const col = Math.max(0, w - 2 - dx);
      if (col < w - 2) g.rect(col, y, 2, 1, PAL.red2);
    }
    g.rect(w - 2, 2, 2, 3, PAL.red1); g.rect(w - 2, h - 5, 2, 3, PAL.red1);
  });
}

export function drawMegaphone(ctx: CanvasRenderingContext2D, o: MegaphoneOptions) {
  rotateAround(ctx, o.x, o.y, o.rot);
  const s = o.scale ?? 1, blast = ease(o.blast);
  drawSprite(ctx, horn, o.x, o.y, { scale: s, alpha: o.alpha });
  for (let i = 1; i <= 3; i++) {
    const wave = soundWave(i), a = ease((blast - (i - 1) * 0.12) / 0.82);
    if (a <= 0) continue;
    drawSprite(ctx, wave, o.x + (55 + i * 27) * s, o.y, { scale: s, alpha: (o.alpha ?? 1) * a });
  }
  ctx.restore();
}

export const GALLERY: { name: string; draw(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void }[] = [
  { name: 'poster hidden', draw: (ctx, x, y) => drawPoster(ctx, { x, y, scale: 0.5, reveal: 0, word: 'REUNION' }) },
  { name: 'poster half reveal', draw: (ctx, x, y) => drawPoster(ctx, { x, y, scale: 0.5, reveal: 0.52, word: 'REUNION', art: 'band' }) },
  { name: 'poster reunion', draw: (ctx, x, y) => drawPoster(ctx, { x, y, scale: 0.5, reveal: 1, word: 'REUNION', art: 'band' }) },
  { name: 'poster star', draw: (ctx, x, y) => drawPoster(ctx, { x, y, scale: 0.5, reveal: 1, word: 'MARKET', art: 'star' }) },
  { name: 'poster chart', draw: (ctx, x, y) => drawPoster(ctx, { x, y, scale: 0.5, reveal: 1, word: 'PRICES', art: 'chart' }) },
  { name: 'poster megaphone', draw: (ctx, x, y) => drawPoster(ctx, { x, y, scale: 0.5, reveal: 1, word: 'UPDATE', art: 'megaphone' }) },
  { name: 'poster revealing', draw: (ctx, x, y, t) => drawPoster(ctx, { x, y, scale: 0.5, reveal: clamp(0.05 + t * 2.5), word: 'REUNION' }) },
  { name: 'megaphone quiet', draw: (ctx, x, y) => drawMegaphone(ctx, { x, y, blast: 0 }) },
  { name: 'megaphone blast', draw: (ctx, x, y) => drawMegaphone(ctx, { x, y, blast: 1 }) },
  { name: 'megaphone sounding', draw: (ctx, x, y, t) => drawMegaphone(ctx, { x, y, blast: clamp(0.05 + t * 2.5) }) },
];
