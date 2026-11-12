// Pixel-art painter: shapes are rasterised on the ART grid (1 unit = 1 art
// pixel) by testing cell centres, so every edge is a clean stair-step, then an
// automatic 1-art-pixel outline closes the silhouette. This is how Hedgy is
// drawn (actor/critter.ts) — use it for every prop so the whole library shares
// one hand.
import { makeSprite, type Sprite } from './sprite.ts';

/**
 * The house palette: a small, muted, natural set. Objects use their real-world
 * colour family (gold coins, green banknotes, brown leather, steel safe...)
 * because colour is what makes a thing recognisable at a glance. Pick 3–4
 * tones per object (light / base / shade + INK outline). Never invent hues.
 * `UP` / `DOWN` are reserved for price direction and gains/losses only.
 */
export const PAL = {
  ink: '#1E120B', inkSoft: '#3A2A20', black: '#17110E', white: '#FFFFFF',
  paper: '#F6EEDC', paperShade: '#E2D3B4', paperDark: '#BFA982',
  grey1: '#E4E5EA', grey2: '#B9BBC6', grey3: '#8A8D9B', grey4: '#5A5D6B', grey5: '#33353F',
  gold1: '#FFE08A', gold2: '#F2B93B', gold3: '#C48416', gold4: '#8A5A12',
  green1: '#A8DDA0', green2: '#63B26B', green3: '#3A8550', green4: '#235C3A',
  red1: '#F58A84', red2: '#DD4B45', red3: '#A52E33',
  blue1: '#A9CDF2', blue2: '#5B97DA', blue3: '#346AAE', blue4: '#22467A',
  wood1: '#C99664', wood2: '#9A663C', wood3: '#6F4A2C', wood4: '#4A2F1C',
  pink1: '#F7C1C4', pink2: '#EC9AA0', pink3: '#C56F78',
  orange1: '#F6B26B', orange2: '#E8833A', orange3: '#B25A22',
  UP: '#FF3B30', DOWN: '#30D158',
} as const;
export type PalName = keyof typeof PAL;
export type Pt = { x: number; y: number };

export class Grid {
  readonly data: (string | undefined)[];
  /** `ox`,`oy`: where local (0,0) sits inside the grid (cells from the top-left). */
  constructor(readonly cols: number, readonly rows: number, readonly ox = 0, readonly oy = 0) { this.data = new Array(cols * rows); }
  get(x: number, y: number) { const cx = Math.floor(x) + this.ox, cy = Math.floor(y) + this.oy; return cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows ? undefined : this.data[cy * this.cols + cx]; }
  set(x: number, y: number, c: string | undefined) { const cx = Math.floor(x) + this.ox, cy = Math.floor(y) + this.oy; if (cx >= 0 && cy >= 0 && cx < this.cols && cy < this.rows) this.data[cy * this.cols + cx] = c; return this; }
  /** Colour every cell whose CENTRE satisfies `inside`. `only`: restrict to cells currently holding one of these colours (use [undefined] for empty). */
  fill(inside: (x: number, y: number) => boolean, c: string | undefined, only?: (string | undefined)[]) {
    for (let cy = 0; cy < this.rows; cy++) for (let cx = 0; cx < this.cols; cx++) {
      if (only && !only.includes(this.data[cy * this.cols + cx])) continue;
      if (inside(cx - this.ox + 0.5, cy - this.oy + 0.5)) this.data[cy * this.cols + cx] = c;
    }
    return this;
  }
  rect(x: number, y: number, w: number, h: number, c: string | undefined, only?: (string | undefined)[]) { return this.fill((px, py) => px >= x && px < x + w && py >= y && py < y + h, c, only); }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: string | undefined, only?: (string | undefined)[]) { return this.fill((x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1, c, only); }
  /** Rounded rectangle (corner radius r). */
  round(x: number, y: number, w: number, h: number, r: number, c: string | undefined, only?: (string | undefined)[]) {
    return this.fill((px, py) => { const dx = Math.max(x + r - px, 0, px - (x + w - r)), dy = Math.max(y + r - py, 0, py - (y + h - r)); return px >= x && px < x + w && py >= y && py < y + h && dx * dx + dy * dy <= r * r; }, c, only);
  }
  /** Convex or concave polygon (even-odd). */
  poly(points: Pt[], c: string | undefined, only?: (string | undefined)[]) {
    return this.fill((x, y) => { let inside = false; for (let i = 0, j = points.length - 1; i < points.length; j = i++) { const a = points[i]!, b = points[j]!; if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside; } return inside; }, c, only);
  }
  tri(a: Pt, b: Pt, p: Pt, c: string | undefined, only?: (string | undefined)[]) { return this.poly([a, b, p], c, only); }
  /** Thick line with round caps. */
  line(a: Pt, b: Pt, width: number, c: string | undefined, only?: (string | undefined)[]) {
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy || 1, r = width / 2;
    return this.fill((x, y) => { const u = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2)), px = a.x + dx * u - x, py = a.y + dy * u - y; return px * px + py * py <= r * r; }, c, only);
  }
  /** Bitmap rows: each character maps through `key` ('.' / ' ' skip). Top-left at (x, y). */
  rows_(x: number, y: number, rows: readonly string[], key: Record<string, string>) { rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) { const c = key[row[i]!]; if (c) this.set(x + i, y + j, c); } }); return this; }
  /** Recolour the part of `from`-coloured cells that satisfies `inside` (shading, highlights). */
  shade(inside: (x: number, y: number) => boolean, from: string | string[], to: string) { return this.fill(inside, to, Array.isArray(from) ? from : [from]); }
  /** One art-pixel outline around the whole silhouette (4-neighbour). */
  outline(c: string = PAL.ink) {
    const add: number[] = [];
    for (let cy = 0; cy < this.rows; cy++) for (let cx = 0; cx < this.cols; cx++) {
      if (this.data[cy * this.cols + cx]) continue;
      const at = (i: number, j: number) => i >= 0 && j >= 0 && i < this.cols && j < this.rows && this.data[j * this.cols + i];
      if (at(cx - 1, cy) || at(cx + 1, cy) || at(cx, cy - 1) || at(cx, cy + 1)) add.push(cy * this.cols + cx);
    }
    for (const i of add) this.data[i] = c;
    return this;
  }
  /** Bake into a cached sprite (key must encode every discrete state). */
  sprite(key: string): Sprite {
    return makeSprite(key, this.cols, this.rows, ctx => {
      for (let cy = 0; cy < this.rows; cy++) for (let cx = 0; cx < this.cols; cx++) { const c = this.data[cy * this.cols + cx]; if (!c) continue; ctx.fillStyle = c; ctx.fillRect(cx, cy, 1, 1); }
    });
  }
}
