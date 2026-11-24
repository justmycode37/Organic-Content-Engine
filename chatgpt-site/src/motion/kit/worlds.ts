// Worlds: full-frame pixel-art environments painted behind every clean shot.
// A world sets WHERE the story happens (a bakery, a bank lobby, a trading floor)
// so a frame reads as a place instead of props floating on black. Worlds are
// deliberately dimmer and less saturated than actors and props, keep the centre
// of the stage quiet, and never carry words. Each world is baked once into a
// cached sprite on the 720 x 860 clean stage (120 x 144 art cells, floor row
// 128 = stage y 770); a few cheap overlays add ambient life (clouds, tickers,
// flickering lamps) as pure functions of time.
import type { Ctx } from '../core.ts';
import { ART, drawSprite, makeSprite, type Sprite } from './sprite.ts';

import { WORLDS, type WorldId } from './world-ids.ts';
export { WORLDS, WORLD_HINTS, isWorld, type WorldId } from './world-ids.ts';

const COLS = 120, FLOOR_ROW = 128, BG = '#0B0B0D';
let ROWS = 144;
type Paint = { glow(x: number, y: number, w: number, h: number, c: string, alpha: number): void; shade(x: number, y: number, w: number, h: number, alpha: number): void; r(x: number, y: number, w: number, h: number, c: string): void; d(x: number, y: number, w: number, h: number, c: string, density?: number, phase?: number): void; px(x: number, y: number, c: string): void };

// ---- colour helpers -----------------------------------------------------
function rgb(hex: string): [number, number, number] { const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function hex([r, g, b]: [number, number, number]) { return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
export function mix(a: string, b: string, k: number) { const x = rgb(a), y = rgb(b); return hex([x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k]); }
/** Worlds sit behind the action: dim and slightly desaturate every colour. */
function tone(c: string, dim = 0.42) { const [r, g, b] = rgb(c), grey = (r + g + b) / 3; return mix(hex([r + (grey - r) * 0.22, g + (grey - g) * 0.22, b + (grey - b) * 0.22]), BG, dim); }
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function painter(ctx: Ctx, dim: number): Paint {
  const r = (x: number, y: number, w: number, h: number, c: string) => { ctx.fillStyle = tone(c, dim); ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  return {
    r,
    glow(x, y, w, h, c, alpha) { ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = tone(c, dim); ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); ctx.restore(); },
    shade(x, y, w, h, alpha) { ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = BG; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); ctx.restore(); },
    px: (x, y, c) => r(x, y, 1, 1, c),
    d(x, y, w, h, c, density = 0.5, phase = 0) {
      ctx.fillStyle = tone(c, dim);
      for (let yy = Math.round(y); yy < y + h; yy++) for (let xx = Math.round(x); xx < x + w; xx++) if (BAYER[((yy + phase) & 3) * 4 + ((xx + phase) & 3)]! < density * 16) ctx.fillRect(xx, yy, 1, 1);
    },
  };
}

// ---- reusable set pieces ------------------------------------------------
function sky(p: Paint, top: number, bottom: number, colors: string[]) {
  const band = (bottom - top) / colors.length;
  colors.forEach((c, i) => { p.r(0, top + i * band, COLS, band + 1, c); if (i) p.d(0, top + i * band - 2, COLS, 3, colors[i - 1]!, 0.5); });
}
function perspectiveFloor(p: Paint, top: number, a: string, b: string, kind: 'tiles' | 'planks' | 'stone') {
  p.r(0, top, COLS, ROWS - top, a);
  if (kind === 'planks') { for (let y = top + 2, gap = 2; y < ROWS; y += gap, gap++) p.r(0, y, COLS, 1, b); for (let i = -12; i <= 12; i++) { for (let y = top; y < ROWS; y++) { const x = 60 + i * (6 + (y - top) * 0.55); if ((y + i * 3) % 7 < 4) p.px(x, y, b); } } return; }
  for (let y = top, row = 0, h = 2; y < ROWS; y += h, row++, h = Math.min(6, h + 1)) {
    const w = 8 + (y - top) * 0.6;
    for (let x = -((row % 2) * w / 2), col = 0; x < COLS; x += w, col++) if (kind === 'tiles' ? (col + row) % 2 === 0 : col % 3 === row % 3) p.r(x, y, w, h, b);
    if (kind === 'stone') p.r(0, y, COLS, 1, b);
  }
}
function glassPane(p: Paint, x: number, y: number, w: number, h: number, frame: string, glass: string[], mullions = true) {
  p.r(x - 2, y - 2, w + 4, h + 4, frame);
  const band = h / glass.length;
  glass.forEach((c, i) => p.r(x, y + i * band, w, band + 1, c));
  p.d(x + 2, y + 2, Math.min(6, w / 3), h - 4, '#FFFFFF', 0.18);
  if (mullions) { p.r(x + w / 2 - 1, y, 2, h, frame); p.r(x, y + h / 2 - 1, w, 2, frame); }
  p.r(x - 3, y + h + 2, w + 6, 2, frame);
}
function shelf(p: Paint, x: number, y: number, w: number, wood: string, dark: string) { p.r(x, y, w, 2, wood); p.r(x, y + 2, w, 1, dark); }
function goods(p: Paint, x: number, y: number, w: number, seed: number, palette: string[]) {
  for (let cx = x + 1, i = 0; cx < x + w - 3; i++) {
    const kind = (seed + i * 7) % 4, c = palette[(seed + i * 3) % palette.length]!;
    if (kind === 0) { p.r(cx, y - 5, 4, 5, c); p.r(cx, y - 6, 4, 1, '#E8E2D0'); cx += 5; }
    else if (kind === 1) { p.r(cx, y - 3, 6, 3, c); p.r(cx + 1, y - 4, 4, 1, c); p.r(cx + 1, y - 3, 1, 1, '#F2D8A8'); cx += 7; }
    else if (kind === 2) { p.r(cx, y - 7, 3, 7, c); p.r(cx, y - 8, 3, 1, '#2A2A30'); cx += 4; }
    else { p.r(cx, y - 4, 5, 4, c); p.r(cx + 1, y - 3, 3, 1, '#F6EEDC'); cx += 6; }
  }
}
function pendant(p: Paint, x: number, len: number, shade: string) { p.r(x, 0, 1, len, '#2A2A30'); p.r(x - 3, len, 7, 2, shade); p.r(x - 4, len + 2, 9, 1, shade); p.d(x - 6, len + 3, 13, 4, '#FFE7A8', 0.25); }
function plant(p: Paint, x: number, base: number) { p.r(x - 3, base - 5, 7, 5, '#B25A22'); p.r(x - 4, base - 6, 9, 1, '#C47038'); for (const [dx, dy, h] of [[-3, -12, 7], [0, -15, 10], [3, -11, 6], [-1, -9, 4], [2, -13, 8]] as const) p.r(x + dx, base + dy, 2, h, '#3A8550'); p.d(x - 5, base - 16, 11, 9, '#63B26B', 0.4); }
function building(p: Paint, x: number, top: number, w: number, base: number, wall: string, win: string, seed: number, lit = 0.35) {
  p.r(x, top, w, base - top, wall); p.r(x, top, w, 1, mix(wall, '#FFFFFF', 0.15));
  for (let y = top + 3, r = 0; y < base - 6; y += 6, r++) for (let xx = x + 2, c = 0; xx < x + w - 3; xx += 5, c++) { const on = ((seed * 31 + r * 17 + c * 13) % 100) / 100 < lit; p.r(xx, y, 3, 3, on ? '#F2D27A' : win); }
}
function cloud(p: Paint, x: number, y: number, s: number, c = '#F2F4F8') { p.r(x, y + 2 * s, 12 * s, 2 * s, c); p.r(x + 2 * s, y, 5 * s, 2 * s, c); p.r(x + 6 * s, y + s, 4 * s, s, c); }
function tree(p: Paint, x: number, base: number, h: number) { p.r(x - 1, base - h * 0.45, 3, h * 0.45, '#6F4A2C'); p.r(x - 7, base - h, 15, h * 0.6, '#3A8550'); p.r(x - 5, base - h - 2, 11, 2, '#3A8550'); p.d(x - 7, base - h, 15, h * 0.3, '#63B26B', 0.45); p.d(x - 7, base - h * 0.55, 15, h * 0.15, '#235C3A', 0.6); }
function awning(p: Paint, x: number, y: number, w: number, a: string, b: string) { for (let i = 0; i < w; i += 4) p.r(x + i, y, 4, 5, (i / 4) % 2 ? b : a); for (let i = 0; i < w; i += 4) p.r(x + i + 1, y + 5, 2, 1, (i / 4) % 2 ? b : a); }
function vignette(p: Paint) {
  for (let i = 0; i < 4; i++) { const a = 0.34 - i * 0.08; p.shade(0, i * 2, COLS, 2, a + 0.1); p.shade(i * 2, 0, 2, ROWS, a); p.shade(COLS - 2 - i * 2, 0, 2, ROWS, a); }
  // Tall (viral) worlds continue the floor under the captions: darken it in clean steps so text stays readable.
  for (let y = 140, k = 0; y < ROWS; y += 6, k++) p.shade(0, y, COLS, 6, Math.min(0.78, 0.18 + k * 0.07));
}
/** A soft, dithered pool of light on the floor where the action happens. */
function lightPool(p: Paint, c = '#FFF2D6') { for (let i = 0; i < 4; i++) p.glow(18 + i * 8, FLOOR_ROW - 4 + i, 84 - i * 16, 8 - i * 2, c, 0.05); }

// ---- worlds -----------------------------------------------------------------
const PAINT: Record<WorldId, (p: Paint) => void> = {
  shop(p) {
    p.r(0, 0, COLS, 112, '#C9A97A'); p.r(0, 0, COLS, 10, '#7A5A3C');
    for (let x = 0; x < COLS; x += 6) p.r(x, 10, 1, 64, '#B8956A');
    p.r(0, 74, COLS, 38, '#7A4E2E'); p.r(0, 74, COLS, 2, '#9A663C'); for (let x = 3; x < COLS; x += 10) p.r(x, 79, 8, 28, '#6F4A2C');
    for (const sx of [4, 86]) { p.r(sx, 18, 30, 56, '#4A2F1C'); for (let y = 30; y < 74; y += 14) { shelf(p, sx + 1, y, 28, '#9A663C', '#3A2A20'); goods(p, sx + 1, y, 28, sx + y, ['#D99A4E', '#C47038', '#E8C77A', '#DD4B45', '#F2B93B']); } }
    p.r(44, 20, 32, 22, '#2E4A3A'); p.r(43, 19, 34, 1, '#6F4A2C'); p.r(43, 42, 34, 1, '#6F4A2C'); for (let y = 24; y < 40; y += 4) p.r(47, y, 10 + (y * 7) % 14, 1, '#A8C8B0');
    pendant(p, 36, 12, '#2E2E36'); pendant(p, 84, 12, '#2E2E36'); pendant(p, 60, 8, '#2E2E36');
    perspectiveFloor(p, 112, '#5A4632', '#463624', 'tiles'); lightPool(p); vignette(p);
  },
  street(p) {
    sky(p, 0, 80, ['#5B97DA', '#73A8E0', '#8DBAE6', '#A9CDF2']); cloud(p, 10, 12, 1); cloud(p, 78, 24, 1);
    building(p, -2, 30, 30, 104, '#9A5A44', '#3A4A66', 3); building(p, 28, 18, 26, 104, '#C9A97A', '#3A4A66', 7); building(p, 66, 26, 28, 104, '#7A8A9A', '#3A4A66', 11); building(p, 94, 36, 28, 104, '#A06A50', '#3A4A66', 5);
    p.r(30, 84, 22, 20, '#3A2A20'); glassPane(p, 32, 88, 18, 12, '#2A2A30', ['#F2D27A', '#E8B860'], false); awning(p, 28, 80, 26, '#DD4B45', '#F6EEDC');
    p.r(68, 84, 22, 20, '#2A3A4A'); glassPane(p, 70, 88, 18, 12, '#1E2A36', ['#A9CDF2', '#73A8E0'], false); awning(p, 66, 80, 26, '#3A8550', '#F6EEDC');
    p.r(58, 52, 2, 52, '#2A2A30'); p.r(55, 50, 8, 3, '#2A2A30'); p.r(56, 53, 6, 2, '#FFE08A');
    p.r(0, 104, COLS, 10, '#8A8D9B'); for (let x = 0; x < COLS; x += 8) p.r(x, 104, 1, 10, '#6A6D7B'); p.r(0, 114, COLS, 2, '#B9BBC6');
    p.r(0, 116, COLS, ROWS - 116, '#3A3D48'); for (let x = 4; x < COLS; x += 16) p.r(x, 132, 8, 1, '#E4E5EA');
    lightPool(p, '#FFFFFF'); vignette(p);
  },
  home(p) {
    p.r(0, 0, COLS, 112, '#8E9A7E'); for (let x = 0; x < COLS; x += 8) p.d(x, 0, 3, 112, '#7E8A6E', 0.5);
    p.r(0, 106, COLS, 6, '#E2D3B4');
    glassPane(p, 14, 22, 26, 34, '#E2D3B4', ['#73A8E0', '#8DBAE6', '#A9CDF2']); p.r(8, 18, 6, 46, '#A52E33'); p.r(40, 18, 6, 46, '#A52E33'); p.r(6, 16, 42, 2, '#6F4A2C');
    p.r(76, 24, 22, 16, '#6F4A2C'); p.r(78, 26, 18, 12, '#A9CDF2'); p.r(78, 33, 18, 5, '#63B26B'); p.r(84, 29, 5, 4, '#F2B93B');
    p.r(104, 40, 2, 66, '#33353F'); p.r(99, 32, 12, 8, '#F2D8A8'); p.d(96, 40, 18, 6, '#FFE7A8', 0.25);
    plant(p, 10, 106);
    perspectiveFloor(p, 112, '#7A5236', '#5E3E28', 'planks'); lightPool(p); vignette(p);
  },
  kitchen(p) {
    p.r(0, 0, COLS, 112, '#D8D4C8'); p.r(0, 0, COLS, 30, '#6F4A2C'); for (let x = 2; x < COLS; x += 13) { p.r(x, 2, 11, 26, '#8A603E'); p.r(x + 9, 14, 1, 4, '#E2D3B4'); }
    for (let y = 46; y < 84; y += 4) for (let x = (y / 4) % 2 ? 0 : 2; x < COLS; x += 4) p.r(x, y, 3, 3, '#BFD3E0');
    glassPane(p, 44, 40, 32, 24, '#F6EEDC', ['#73A8E0', '#A9CDF2']);
    p.r(0, 84, COLS, 4, '#B9BBC6'); p.r(0, 88, COLS, 24, '#6F4A2C'); for (let x = 2; x < COLS; x += 13) { p.r(x, 90, 11, 20, '#8A603E'); p.r(x + 5, 92, 2, 1, '#E2D3B4'); }
    p.r(100, 34, 20, 78, '#E4E5EA'); p.r(100, 62, 20, 1, '#8A8D9B'); p.r(102, 44, 1, 12, '#8A8D9B'); p.r(102, 68, 1, 16, '#8A8D9B');
    p.r(8, 76, 8, 8, '#DD4B45'); p.r(9, 74, 6, 2, '#33353F');
    perspectiveFloor(p, 112, '#C8C0B0', '#8A8478', 'tiles'); lightPool(p); vignette(p);
  },
  bank(p) {
    p.r(0, 0, COLS, 112, '#C8C4B8'); for (let y = 0; y < 112; y += 12) p.r(0, y, COLS, 1, '#B0AC9E'); p.d(0, 0, COLS, 112, '#E8E4DA', 0.12);
    for (const cx of [6, 108]) { p.r(cx, 8, 8, 104, '#E8E4DA'); p.r(cx - 2, 6, 12, 4, '#F6F2E8'); p.r(cx - 2, 106, 12, 6, '#F6F2E8'); for (let x = cx + 1; x < cx + 8; x += 2) p.r(x, 10, 1, 96, '#C8C4B8'); }
    p.r(44, 22, 32, 32, '#5A5D6B'); p.r(46, 24, 28, 28, '#8A8D9B'); p.r(52, 30, 16, 16, '#B9BBC6'); p.r(58, 30, 4, 16, '#5A5D6B'); p.r(52, 36, 16, 4, '#5A5D6B'); p.r(59, 37, 2, 2, '#F2B93B');
    for (const tx of [18, 80]) { p.r(tx, 60, 22, 30, '#6F4A2C'); p.r(tx + 2, 62, 18, 16, '#2A3A4A'); for (let x = tx + 4; x < tx + 20; x += 3) p.r(x, 62, 1, 16, '#B9BBC6'); p.r(tx, 78, 22, 2, '#9A663C'); }
    p.r(14, 90, 92, 22, '#7A4E2E'); p.r(14, 90, 92, 2, '#C99664');
    perspectiveFloor(p, 112, '#B0AC9E', '#8A867A', 'tiles'); lightPool(p); vignette(p);
  },
  office(p) {
    p.r(0, 0, COLS, 112, '#5A6270'); glassPane(p, 6, 10, 62, 52, '#33353F', ['#1E2A44', '#2A3A5A', '#3A4A6A', '#4A5A7A'], false);
    building(p, 8, 30, 10, 62, '#2A3242', '#1A2030', 2, 0.45); building(p, 20, 20, 12, 62, '#323A4A', '#1A2030', 4, 0.5); building(p, 34, 34, 9, 62, '#2A3242', '#1A2030', 6, 0.4); building(p, 45, 24, 12, 62, '#323A4A', '#1A2030', 9, 0.5); building(p, 58, 38, 10, 62, '#2A3242', '#1A2030', 1, 0.4);
    for (let y = 12; y < 62; y += 4) p.d(6, y, 62, 1, '#B9BBC6', 0.5);
    p.r(80, 16, 32, 22, '#F6F2E8'); p.r(79, 15, 34, 1, '#8A8D9B'); p.r(79, 38, 34, 1, '#8A8D9B'); for (let i = 0; i < 7; i++) p.r(83 + i * 4, 32 - [2, 5, 3, 8, 6, 11, 14][i]!, 3, 1, '#346AAE');
    p.r(88, 46, 12, 12, '#E4E5EA'); p.r(87, 45, 14, 1, '#33353F'); p.r(93, 48, 1, 5, '#33353F'); p.r(93, 52, 4, 1, '#33353F');
    plant(p, 112, 112); p.r(0, 108, COLS, 4, '#3A3D48');
    perspectiveFloor(p, 112, '#4A4E5A', '#3E424C', 'tiles'); lightPool(p); vignette(p);
  },
  market(p) {
    sky(p, 0, 70, ['#5B97DA', '#73A8E0', '#8DBAE6', '#A9CDF2']); cloud(p, 70, 10, 1); cloud(p, 6, 20, 1);
    for (let x = 0; x < COLS; x += 2) { const y = 22 + Math.round(Math.sin(x / 9) * 3); p.px(x, y, '#2A2A30'); if (x % 8 === 0) p.r(x, y + 1, 2, 2, ['#F2B93B', '#DD4B45', '#63B26B', '#5B97DA'][(x / 8) % 4]!); }
    const stall = (x: number, w: number, a: string) => { awning(p, x, 44, w, a, '#F6EEDC'); p.r(x + 1, 50, 2, 54, '#6F4A2C'); p.r(x + w - 3, 50, 2, 54, '#6F4A2C'); p.r(x, 84, w, 20, '#8A603E'); p.r(x, 84, w, 2, '#C99664'); for (let i = 0; i < w - 4; i += 6) { p.r(x + 2 + i, 78, 5, 6, ['#DD4B45', '#F2B93B', '#63B26B', '#E8833A'][(x + i) % 4]!); p.r(x + 3 + i, 77, 3, 1, '#235C3A'); } };
    stall(0, 34, '#DD4B45'); stall(43, 34, '#3A8550'); stall(86, 34, '#346AAE');
    perspectiveFloor(p, 104, '#9A8A70', '#857660', 'stone'); lightPool(p, '#FFFFFF'); vignette(p);
  },
  exchange(p) {
    p.r(0, 0, COLS, 112, '#1C1F2A'); p.r(4, 6, 112, 26, '#0E1018'); p.r(4, 6, 112, 1, '#3A3D48'); p.r(4, 31, 112, 1, '#3A3D48');
    for (let i = 0; i < 6; i++) { const x = 10 + i * 18; p.r(x - 2, 42, 16, 22, '#2A2D38'); p.r(x - 1, 43, 14, 20, '#0E1018'); for (let k = 0; k < 6; k++) { const up = (i * 7 + k * 3) % 5 > 1, h = 2 + (i * 5 + k * 7) % 7; p.r(x + k * 2, 52 - h + (up ? 0 : 3), 1, h, up ? '#30D158' : '#FF3B30'); } }
    p.r(0, 70, COLS, 3, '#3A3D48'); for (let x = 0; x < COLS; x += 20) { p.r(x + 2, 76, 16, 30, '#2A2D38'); p.r(x + 3, 77, 14, 9, '#16324A'); p.r(x + 4, 82, 12, 1, '#5B97DA'); }
    p.r(0, 106, COLS, 6, '#2A2D38');
    perspectiveFloor(p, 112, '#2A2D38', '#22252E', 'tiles'); lightPool(p, '#A9CDF2'); vignette(p);
  },
  park(p) {
    sky(p, 0, 74, ['#5B97DA', '#6AA2DE', '#7FB2E4', '#A9CDF2']); cloud(p, 12, 10, 1); cloud(p, 80, 20, 1);
    p.r(98, 8, 10, 10, '#FFE08A'); p.d(95, 5, 16, 16, '#FFF2B8', 0.25);
    for (let x = 0; x < COLS; x++) { const h = 10 + Math.sin(x / 14) * 5 + Math.sin(x / 5) * 1.5; p.r(x, 74 - h, 1, h, '#7FB07A'); }
    p.r(0, 74, COLS, 40, '#63B26B'); p.d(0, 74, COLS, 40, '#3A8550', 0.18);
    tree(p, 12, 104, 54); tree(p, 106, 104, 60); tree(p, 30, 84, 28); tree(p, 92, 82, 26);
    p.r(78, 96, 22, 2, '#8A603E'); p.r(78, 92, 22, 2, '#8A603E'); p.r(80, 98, 2, 6, '#33353F'); p.r(96, 98, 2, 6, '#33353F');
    perspectiveFloor(p, 112, '#C9B48A', '#B09C74', 'stone'); p.r(0, 104, COLS, 8, '#58A060'); lightPool(p, '#FFFFFF'); vignette(p);
  },
  night(p) {
    sky(p, 0, 90, ['#0A0E22', '#0E1430', '#141C3E', '#1C2650']); for (let i = 0; i < 40; i++) p.px((i * 37) % COLS, (i * 23) % 50, i % 3 ? '#B9BBC6' : '#FFFFFF');
    p.r(92, 10, 10, 10, '#F6EEDC'); p.r(95, 10, 7, 10, '#E2D3B4'); p.r(96, 11, 5, 2, '#F6EEDC');
    building(p, -2, 36, 26, 106, '#1E2230', '#141826', 3, 0.5); building(p, 24, 22, 22, 106, '#262A3A', '#141826', 8, 0.55); building(p, 72, 30, 24, 106, '#1E2230', '#141826', 12, 0.5); building(p, 96, 44, 26, 106, '#262A3A', '#141826', 2, 0.5);
    p.r(50, 50, 2, 56, '#2A2A30'); p.r(47, 48, 8, 3, '#2A2A30'); p.r(48, 51, 6, 2, '#FFE08A'); p.d(42, 53, 18, 50, '#FFE08A', 0.06);
    p.r(0, 106, COLS, 8, '#33353F'); p.r(0, 114, COLS, ROWS - 114, '#1A1C24'); for (let x = 4; x < COLS; x += 16) p.r(x, 132, 8, 1, '#5A5D6B');
    lightPool(p, '#FFE08A'); vignette(p);
  },
  vault(p) {
    p.r(0, 0, COLS, 112, '#4A4E5A'); for (let y = 4; y < 112; y += 18) for (let x = 2; x < COLS; x += 18) { p.px(x, y, '#8A8D9B'); p.px(x + 14, y, '#8A8D9B'); }
    for (const bx of [2, 86]) for (let y = 14; y < 100; y += 10) for (let x = bx; x < bx + 32; x += 8) { p.r(x, y, 7, 9, '#7A7D8A'); p.r(x + 1, y + 1, 5, 7, '#9A9DAA'); p.r(x + 3, y + 4, 1, 1, '#F2B93B'); }
    p.r(40, 16, 40, 40, '#5A5D6B'); p.r(42, 18, 36, 36, '#8A8D9B'); p.r(46, 22, 28, 28, '#B9BBC6'); p.r(58, 22, 4, 28, '#5A5D6B'); p.r(46, 34, 28, 4, '#5A5D6B'); p.r(57, 33, 6, 6, '#F2B93B');
    perspectiveFloor(p, 112, '#3E424C', '#353841', 'tiles'); lightPool(p); vignette(p);
  },
  farm(p) {
    sky(p, 0, 76, ['#5B97DA', '#73A8E0', '#8DBAE6', '#BFDCF2']); cloud(p, 40, 12, 1); p.r(14, 10, 10, 10, '#FFE08A');
    for (let x = 0; x < COLS; x++) { const h = 6 + Math.sin(x / 18) * 3; p.r(x, 76 - h, 1, h, '#8DBE7A'); }
    p.r(0, 76, COLS, 30, '#A6C46A'); for (let y = 78; y < 106; y += 4) p.r(0, y, COLS, 1, '#8AAA52');
    p.r(76, 40, 36, 44, '#A52E33'); for (let i = 0; i < 20; i++) p.r(74 + i, 40 - i * 0.9, 40 - i * 2, 1, '#8A2228'); p.r(88, 60, 12, 24, '#4A2F1C'); p.r(88, 60, 12, 1, '#F6EEDC'); p.r(88, 60, 1, 24, '#F6EEDC'); p.r(99, 60, 1, 24, '#F6EEDC'); p.r(90, 46, 8, 7, '#F6EEDC');
    for (let x = 0; x < 70; x += 8) p.r(x, 92, 2, 12, '#C99664'); p.r(0, 95, 70, 2, '#C99664'); p.r(0, 100, 70, 2, '#C99664');
    tree(p, 24, 90, 30);
    perspectiveFloor(p, 106, '#9A7A50', '#8A6A44', 'stone'); lightPool(p, '#FFFFFF'); vignette(p);
  },
  cafe(p) {
    p.r(0, 0, COLS, 112, '#5E4636'); for (let y = 10; y < 70; y += 5) for (let x = (y / 5) % 2 ? 0 : 5; x < COLS; x += 10) p.r(x, y, 9, 4, '#6E5240');
    p.r(30, 14, 60, 26, '#1E2420'); p.r(29, 13, 62, 1, '#8A603E'); p.r(29, 40, 62, 1, '#8A603E'); for (let y = 18; y < 38; y += 4) { p.r(34, y, 18, 1, '#D8D4C8'); p.r(70, y, 14, 1, '#D8D4C8'); }
    p.r(0, 70, COLS, 4, '#C99664'); p.r(0, 74, COLS, 38, '#4A2F1C'); for (let x = 4; x < COLS; x += 12) p.r(x, 78, 10, 30, '#5A3A24');
    p.r(92, 52, 18, 18, '#B9BBC6'); p.r(94, 54, 14, 6, '#5A5D6B'); p.r(98, 62, 2, 4, '#33353F'); p.r(104, 62, 2, 4, '#33353F'); p.d(97, 44, 4, 8, '#F2F4F8', 0.3);
    for (let i = 0; i < 4; i++) { p.r(8 + i * 5, 64, 4, 6, '#F6EEDC'); p.r(9 + i * 5, 63, 2, 1, '#6F4A2C'); }
    pendant(p, 24, 8, '#2A5040'); pendant(p, 60, 6, '#2A5040'); pendant(p, 96, 8, '#2A5040');
    perspectiveFloor(p, 112, '#6E5240', '#5A4232', 'planks'); lightPool(p); vignette(p);
  },
  carlot(p) {
    sky(p, 0, 80, ['#5B97DA', '#73A8E0', '#8DBAE6', '#A9CDF2']); cloud(p, 54, 10, 1);
    p.r(60, 34, 60, 66, '#E4E5EA'); glassPane(p, 64, 46, 52, 40, '#B9BBC6', ['#73A8E0', '#5B97DA'], true); p.r(60, 32, 60, 4, '#346AAE');
    for (let x = 0; x < COLS; x += 2) { const y = 20 + Math.round(Math.abs(Math.sin(x / 10)) * 4); p.px(x, y, '#2A2A30'); if (x % 6 === 0) { p.r(x, y + 1, 3, 2, ['#DD4B45', '#F2B93B', '#5B97DA'][(x / 6) % 3]!); p.px(x + 1, y + 3, ['#DD4B45', '#F2B93B', '#5B97DA'][(x / 6) % 3]!); } }
    p.r(2, 18, 2, 86, '#8A8D9B'); p.r(116, 16, 2, 20, '#8A8D9B');
    p.r(6, 88, 30, 8, '#346AAE'); p.r(10, 83, 20, 5, '#346AAE'); p.r(12, 84, 16, 3, '#A9CDF2'); p.r(8, 95, 6, 4, '#17110E'); p.r(28, 95, 6, 4, '#17110E');
    p.r(0, 100, COLS, 12, '#5A5D6B'); for (let x = 10; x < COLS; x += 24) p.r(x, 104, 1, 8, '#E4E5EA');
    perspectiveFloor(p, 112, '#4A4E5A', '#42464F', 'stone'); lightPool(p, '#FFFFFF'); vignette(p);
  },
};

/** Viral layout: the stage sits this many stage units lower, and worlds extend upward to cover it. */
export const VIRAL_SHIFT = 102;
// Keep sky and ceiling visible while the opening camera pulls back around the actors' feet.
const VIRAL_SKY = 210;
const EXTRA = VIRAL_SKY / ART;
function worldSprite(id: WorldId, dim: number, tall: boolean): Sprite {
  const rows = tall ? 214 : 144, extra = tall ? EXTRA : 0;
  return makeSprite(`world:${id}:${dim}:${rows}`, COLS, rows + extra, ctx => {
    ROWS = rows; ctx.fillStyle = BG; ctx.fillRect(0, 0, COLS, rows + extra);
    ctx.save(); ctx.translate(0, extra); PAINT[id](painter(ctx, dim)); ctx.restore(); ROWS = 144;
    // Continue the top row (sky or ceiling) upward, then darken it in steps behind the header.
    if (extra) { ctx.drawImage(ctx.canvas as CanvasImageSource, 0, extra + 2, COLS, 1, 0, 0, COLS, extra); const p = painter(ctx, 0); for (let y = 0; y < extra; y += 3) p.shade(0, y, COLS, 3, 0.55 - 0.43 * y / extra); }
  });
}

/** Cheap ambient life on top of the baked world, as a pure function of time. */
function ambient(ctx: Ctx, id: WorldId, t: number) {
  const a = (x: number, y: number, w: number, h: number, c: string, alpha = 1) => { ctx.globalAlpha = alpha; ctx.fillStyle = c; ctx.fillRect(x * ART, y * ART, w * ART, h * ART); ctx.globalAlpha = 1; };
  if (id === 'exchange') {
    // A scrolling ticker of up/down blocks on the big board.
    for (let i = 0; i < 16; i++) { const x = ((i * 9 - t * 14) % 120 + 120) % 120; const up = (i * 5) % 3 !== 0; if (x > 4 && x < 110) { a(x, 12, 5, 2, up ? '#1E7A3C' : '#8A2424'); a(x, 18 + (i % 2) * 6, 3, 2, '#5A5D6B'); } }
  } else if (id === 'street' || id === 'market' || id === 'park' || id === 'farm' || id === 'carlot') {
    const x = ((t * 1.6) % 140) - 20; a(x, 6, 10, 2, '#C8D2DE', 0.5); a(x + 2, 4, 4, 2, '#C8D2DE', 0.5);
  } else if (id === 'night') {
    for (let i = 0; i < 6; i++) if (Math.sin(t * 3 + i * 2.1) > 0.7) a((i * 41) % 118, (i * 17) % 40, 1, 1, '#FFFFFF', 0.8);
  } else if (id === 'cafe' || id === 'kitchen') {
    const s = (t * 4) % 8; a(id === 'cafe' ? 98 : 10, (id === 'cafe' ? 50 : 72) - s, 1, 2, '#D8D4C8', 0.35 * (1 - s / 8));
  }
}

/**
 * Paint a world as the stage background (clean-stage units, inside the shot's
 * STAGE_ZOOM transform). Overdraws past the stage so camera moves never reveal
 * an edge. `dim` 0..1 pushes the world further back (default 0.42).
 */
export function drawWorld(ctx: Ctx, id: WorldId, t = 0, dim = 0.42, tall = false) {
  ctx.save();
  ctx.fillStyle = BG; ctx.fillRect(-200, -300, 1200, 1800);
  const sprite = worldSprite(id, dim, tall), top = tall ? -VIRAL_SKY : 0;
  drawSprite(ctx, sprite, 0, top, { anchor: [0, 0] });
  // Mirrored copies either side: zooms and the hook-time framing never reveal an empty border.
  drawSprite(ctx, sprite, 0, top, { anchor: [0, 0], flip: true });
  drawSprite(ctx, sprite, 2 * sprite.w, top, { anchor: [0, 0], flip: true });
  ambient(ctx, id, t);
  ctx.restore();
}

// ---- the active world for the shot being drawn ------------------------------
let active: { id: WorldId; t: number; tall: boolean } | undefined;
/** Set by the shot scene before each shot renders; `undefined` keeps the classic flat stage. */
export function setActiveWorld(id: WorldId | undefined, t = 0, tall = false) { active = id ? { id, t, tall } : undefined; }
export function activeWorld() { return active; }
let tallLayout = false;
/** The player sets this per layer: viral reels paint worlds to the bottom of the frame. */
export function setWorldTall(tall: boolean) { tallLayout = tall; }
export function worldTall() { return tallLayout; }
