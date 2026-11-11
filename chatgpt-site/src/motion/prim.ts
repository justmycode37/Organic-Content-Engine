// Drawing primitives shared by every scene. Use these instead of raw canvas calls
// wherever one fits, so type, panels and pixel details look identical across scenes.
import { GLYPHS } from './glyphs.ts';
import { FONT, clamp, ease, font, hash, parseMarkup, snap, type Ctx, type Span, type Theme } from './core.ts';

// ---------------------------------------------------------------- pixel type (titles, labels, tags, numerals)

const GLYPH_W = 5, GLYPH_H = 7, ADVANCE = 6, SPACE = 4;
const glyph = (char: string) => GLYPHS[char] ?? GLYPHS[char.toUpperCase()];
const advance = (char: string) => (char === ' ' ? SPACE : glyph(char) ? ADVANCE : SPACE);

/** Width in canvas pixels of pixel text at module size `px` (one glyph is 5x7 modules; cap height = 7 * px). */
export function pixelWidth(text: string, px: number): number {
  let modules = 0;
  for (const char of text) modules += advance(char);
  return Math.max(0, modules - 1) * px;
}
export const pixelHeight = (px: number) => GLYPH_H * px;

export interface PixelTextOptions {
  color?: string;
  /** Colour for `*marked*` spans. Pass theme.accent. Without it markup is drawn in `color`. */
  accent?: string;
  align?: 'left' | 'center' | 'right';
  /** 0..1 build progress. Omit for fully drawn. */
  reveal?: number;
  /** blocks: modules pop in random order. type: characters appear left to right. rise: rows fill from the bottom. */
  mode?: 'blocks' | 'type' | 'rise';
  seed?: number;
  alpha?: number;
}

/** Draws one line of pixel type with its top-left (or aligned anchor) at x, y. `*word*` takes the accent. */
export function pixelText(ctx: Ctx, text: string, x: number, y: number, px: number, options: PixelTextOptions = {}): number {
  const { color = '#fff', accent, align = 'left', reveal = 1, mode = 'blocks', seed = 1, alpha = 1 } = options;
  const spans: Span[] = parseMarkup(text);
  const plain = spans.map(span => span.text).join('');
  const width = pixelWidth(plain, px);
  let cursor = snap(align === 'center' ? x - width / 2 : align === 'right' ? x - width : x);
  const top = snap(y);
  const total = [...plain].length;
  if (reveal <= 0) return width;
  ctx.save();
  ctx.globalAlpha *= alpha;
  let index = 0;
  for (const span of spans) {
    ctx.fillStyle = span.accent && accent ? accent : color;
    for (const char of span.text) {
      const rows = glyph(char);
      if (rows && !(mode === 'type' && index >= Math.ceil(reveal * total))) {
        for (let row = 0; row < GLYPH_H; row++) {
          for (let col = 0; col < GLYPH_W; col++) {
            if (rows[row]![col] !== '1') continue;
            if (reveal < 1) {
              if (mode === 'blocks' && hash(index * 35 + row * 5 + col, seed) > reveal) continue;
              if (mode === 'rise' && (GLYPH_H - 1 - row) / GLYPH_H > reveal) continue;
            }
            ctx.fillRect(cursor + col * px, top + row * px, px, px);
          }
        }
      }
      cursor += advance(char) * px;
      index++;
    }
  }
  ctx.restore();
  return width;
}

/** Greedy wrap for pixel type. Markup is preserved per line. */
export function pixelLines(text: string, px: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '', open = false;
  for (const raw of text.trim().split(/\s+/).filter(Boolean)) {
    // Keep an accent span that crosses a line break balanced on both lines.
    const candidate = line ? `${line} ${raw}` : (open ? `*${raw}` : raw);
    if (line && pixelWidth(candidate.replaceAll('*', ''), px) > maxWidth) {
      lines.push(open ? `${line}*` : line);
      line = open ? `*${raw}` : raw;
    } else line = candidate;
    if ((raw.match(/\*/g)?.length ?? 0) % 2 === 1) open = !open;
  }
  if (line) lines.push(line);
  return lines;
}

/** Largest module size from `sizes` whose wrap fits `maxLines`; falls back to the smallest. */
export function fitPixel(text: string, maxWidth: number, maxLines: number, sizes: number[] = [14, 12, 10, 8, 7, 6]): { px: number; lines: string[] } {
  let last = { px: sizes.at(-1)!, lines: [] as string[] };
  for (const px of sizes) {
    const lines = pixelLines(text.toUpperCase(), px, maxWidth);
    last = { px, lines };
    if (lines.length <= maxLines && lines.every(line => pixelWidth(line.replaceAll('*', ''), px) <= maxWidth)) return last;
  }
  return last;
}

/** Draws a wrapped pixel block centred (or left aligned) on x, starting at y. Returns the block height. */
export function pixelBlock(ctx: Ctx, lines: string[], x: number, y: number, px: number, options: PixelTextOptions & { gap?: number; stagger?: number } = {}): number {
  const gap = options.gap ?? px * 3;
  const lineHeight = pixelHeight(px) + gap;
  lines.forEach((line, index) => {
    // Each line starts a little after the previous one so the block builds top to bottom.
    const reveal = options.reveal === undefined ? 1 : clamp((options.reveal * (1 + (options.stagger ?? 0.35) * (lines.length - 1))) - index * (options.stagger ?? 0.35));
    pixelText(ctx, line, x, y + index * lineHeight, px, { ...options, reveal, seed: (options.seed ?? 1) + index * 17 });
  });
  return lines.length * lineHeight - gap;
}

/** Square pixel tag (category chip, version label). Returns its width. Anchor is top-left. */
export function tag(ctx: Ctx, label: string, x: number, y: number, px: number, colors: { bg: string; fg: string }, reveal = 1): number {
  const pad = px * 2, width = pixelWidth(label.toUpperCase(), px) + pad * 2, height = pixelHeight(px) + pad * 2;
  if (reveal <= 0) return width;
  ctx.fillStyle = colors.bg;
  ctx.fillRect(snap(x), snap(y), snap(width * ease.outExpo(reveal)), height);
  if (reveal > 0.5) pixelText(ctx, label.toUpperCase(), x + pad, y + pad, px, { color: colors.fg, reveal: (reveal - 0.5) * 2, mode: 'type' });
  return width;
}

/** Draws a bitmap ('1' = filled) at module size px. Used for icons and sprites. */
export function bitmap(ctx: Ctx, rows: readonly string[], x: number, y: number, px: number, color: string, reveal = 1, seed = 1) {
  if (reveal <= 0) return;
  ctx.fillStyle = color;
  const left = snap(x), top = snap(y);
  for (let row = 0; row < rows.length; row++) for (let col = 0; col < rows[row]!.length; col++) {
    if (rows[row]![col] !== '1') continue;
    if (reveal < 1 && hash(row * 31 + col, seed) > reveal) continue;
    ctx.fillRect(left + col * px, top + row * px, px, px);
  }
}

// ---------------------------------------------------------------- clean type (captions, body, code)

export interface TextOptions { size: number; color: string; weight?: number; family?: keyof typeof FONT; align?: CanvasTextAlign; baseline?: CanvasTextBaseline; alpha?: number }
export function text(ctx: Ctx, value: string, x: number, y: number, options: TextOptions): number {
  ctx.save();
  ctx.font = font(options.size, options.weight ?? 800, options.family ?? 'body');
  ctx.fillStyle = options.color;
  ctx.textAlign = options.align ?? 'left';
  ctx.textBaseline = options.baseline ?? 'alphabetic';
  ctx.globalAlpha *= options.alpha ?? 1;
  ctx.fillText(value, x, y);
  const width = ctx.measureText(value).width;
  ctx.restore();
  return width;
}
export function textWidth(ctx: Ctx, value: string, size: number, weight = 800, family: keyof typeof FONT = 'body'): number {
  ctx.save();
  ctx.font = font(size, weight, family);
  const width = ctx.measureText(value).width;
  ctx.restore();
  return width;
}
/** Greedy word wrap for clean type. */
export function wrapText(ctx: Ctx, value: string, maxWidth: number, size: number, weight = 800, family: keyof typeof FONT = 'body'): string[] {
  const lines: string[] = [];
  for (const word of value.trim().split(/\s+/).filter(Boolean)) {
    const candidate = lines.length ? `${lines.at(-1)} ${word}` : word;
    if (lines.length && textWidth(ctx, candidate, size, weight, family) <= maxWidth) lines[lines.length - 1] = candidate;
    else lines.push(word);
  }
  return lines;
}

// ---------------------------------------------------------------- shapes

/** Square-cornered panel. `notch` cuts stepped pixel corners, the brand's frame detail. */
export function panel(ctx: Ctx, x: number, y: number, w: number, h: number, style: { fill?: string; stroke?: string; lineWidth?: number; notch?: number } = {}) {
  const n = style.notch ?? 0;
  ctx.beginPath();
  if (n > 0) {
    ctx.moveTo(x + n, y); ctx.lineTo(x + w - n, y); ctx.lineTo(x + w - n, y + n); ctx.lineTo(x + w, y + n);
    ctx.lineTo(x + w, y + h - n); ctx.lineTo(x + w - n, y + h - n); ctx.lineTo(x + w - n, y + h); ctx.lineTo(x + n, y + h);
    ctx.lineTo(x + n, y + h - n); ctx.lineTo(x, y + h - n); ctx.lineTo(x, y + n); ctx.lineTo(x + n, y + n);
    ctx.closePath();
  } else ctx.rect(x, y, w, h);
  if (style.fill) { ctx.fillStyle = style.fill; ctx.fill(); }
  if (style.stroke) { ctx.strokeStyle = style.stroke; ctx.lineWidth = style.lineWidth ?? 4; ctx.lineJoin = 'miter'; ctx.stroke(); }
}

/** Window chrome used by code, terminal and chat scenes: title bar with three square dots and a pixel title. Returns the content rect. */
export function windowFrame(ctx: Ctx, theme: Theme, x: number, y: number, w: number, h: number, title = ''): { x: number; y: number; w: number; h: number } {
  const bar = 72;
  panel(ctx, x, y, w, h, { fill: theme.panel, stroke: theme.line, lineWidth: 4 });
  ctx.fillStyle = theme.panelAlt;
  ctx.fillRect(x + 2, y + 2, w - 4, bar - 2);
  ctx.fillStyle = theme.line;
  ctx.fillRect(x, y + bar, w, 4);
  for (let dot = 0; dot < 3; dot++) { ctx.fillStyle = dot === 0 ? theme.fg : theme.muted; ctx.fillRect(x + 28 + dot * 32, y + 28, 16, 16); }
  if (title) pixelText(ctx, title.toUpperCase(), x + w - 28, y + 22, 4, { color: theme.dim, align: 'right' });
  return { x: x + 36, y: y + bar + 36, w: w - 72, h: h - bar - 72 };
}

/** Stepped pixel arrow from (x1,y1) to (x2,y2) along one axis, drawn up to `progress`. */
export function pixelArrow(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, color: string, progress = 1, px = 8) {
  const p = clamp(progress);
  if (p <= 0) return;
  const horizontal = Math.abs(x2 - x1) >= Math.abs(y2 - y1);
  const length = horizontal ? x2 - x1 : y2 - y1, sign = Math.sign(length) || 1;
  const drawn = Math.abs(length) * p;
  ctx.fillStyle = color;
  // Dashed shaft made of separated square modules.
  for (let offset = 0; offset < drawn - px * 2; offset += px * 2) {
    if (horizontal) ctx.fillRect(snap(x1 + sign * offset - (sign < 0 ? px : 0)), snap(y1 - px / 2), px, px);
    else ctx.fillRect(snap(x1 - px / 2), snap(y1 + sign * offset - (sign < 0 ? px : 0)), px, px);
  }
  // Stepped head at the current tip.
  const tipX = horizontal ? x1 + sign * drawn : x1, tipY = horizontal ? y1 : y1 + sign * drawn;
  for (let step = 0; step < 3; step++) {
    const span = (step * 2 + 1) * px, back = (step + 1) * px;
    if (horizontal) ctx.fillRect(snap(tipX - sign * back - (sign < 0 ? px : 0) + (sign > 0 ? 0 : px)), snap(tipY - span / 2), px, span);
    else ctx.fillRect(snap(tipX - span / 2), snap(tipY - sign * back - (sign < 0 ? px : 0) + (sign > 0 ? 0 : px)), span, px);
  }
}

/** Blinking block cursor. */
export function cursor(ctx: Ctx, x: number, y: number, w: number, h: number, color: string, t: number) {
  if (Math.floor(t * 3) % 2 === 1) return;
  ctx.fillStyle = color;
  ctx.fillRect(snap(x), snap(y), w, h);
}

/** Row of square progress modules, `filled` of `count` lit. */
export function blocks(ctx: Ctx, x: number, y: number, count: number, filled: number, px: number, on: string, off: string, gap = px / 2) {
  for (let index = 0; index < count; index++) {
    ctx.fillStyle = index < filled ? on : off;
    ctx.fillRect(snap(x + index * (px + gap)), snap(y), px, px);
  }
}

/** Entrance transform helper: runs `draw` scaled and offset around (cx, cy), with alpha. */
export function pop(ctx: Ctx, cx: number, cy: number, scale: number, alpha: number, draw: () => void, dy = 0) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= clamp(alpha);
  ctx.translate(cx, cy + dy);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);
  draw();
  ctx.restore();
}
