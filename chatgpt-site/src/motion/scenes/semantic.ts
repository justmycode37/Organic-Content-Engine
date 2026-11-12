import { ease, prog, type Ctx, type Frame } from '../core.ts';
import { text, textWidth } from '../prim.ts';

export interface FitBodyOptions {
  color: string;
  align?: CanvasTextAlign;
  maxSize?: number;
  minSize?: number;
  maxLines?: number;
  weight?: number;
}

export interface BodyLayout { lines: string[]; size: number; lineGap: number }

function splitLongWord(ctx: Ctx, word: string, width: number, size: number): string[] {
  const pieces: string[] = [];
  let part = '';
  for (const char of Array.from(word)) {
    if (part && textWidth(ctx, `${part}${char}-`, size, 800) > width) {
      pieces.push(`${part}-`);
      part = char;
    } else part += char;
  }
  if (part) pieces.push(part);
  return pieces;
}

function wrapBody(ctx: Ctx, value: string, width: number, size: number, maxLines: number): string[] {
  const words = String(value ?? '').replaceAll('*', '').trim().split(/\s+/).filter(Boolean);
  const units = words.flatMap(word => textWidth(ctx, word, size, 800) <= width ? [word] : splitLongWord(ctx, word, width, size));
  const lines: string[] = [];
  let line = '';
  for (const unit of units) {
    const next = line ? `${line} ${unit}` : unit;
    if (line && textWidth(ctx, next, size, 800) > width) { lines.push(line); line = unit; }
    else line = next;
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const clipped = lines.slice(0, maxLines);
  let tail = clipped[maxLines - 1] ?? '';
  while (tail && textWidth(ctx, `${tail}…`, size, 800) > width) tail = tail.slice(0, -1);
  clipped[maxLines - 1] = tail ? `${tail}…` : '…';
  return clipped;
}

export function fitBody(ctx: Ctx, value: string, width: number, height: number, options: Pick<FitBodyOptions, 'maxSize' | 'minSize' | 'maxLines'> = {}): BodyLayout {
  const maxSize = options.maxSize ?? 76;
  const minSize = options.minSize ?? 64;
  const maxLines = options.maxLines ?? 2;
  const lineGap = 8;
  for (let size = maxSize; size >= minSize; size -= 2) {
    const lines = wrapBody(ctx, value, width, size, Number.MAX_SAFE_INTEGER);
    const blockHeight = lines.length * size + Math.max(0, lines.length - 1) * lineGap;
    if (lines.length <= maxLines && blockHeight <= height && lines.every(line => textWidth(ctx, line, size, 800) <= width)) return { lines, size, lineGap };
  }
  return { lines: wrapBody(ctx, value, width, minSize, maxLines), size: minSize, lineGap };
}

export function drawBody(ctx: Ctx, value: string, x: number, y: number, width: number, height: number, options: FitBodyOptions): BodyLayout {
  const layout = fitBody(ctx, value, width, height, options);
  const blockHeight = layout.lines.length * layout.size + Math.max(0, layout.lines.length - 1) * layout.lineGap;
  const top = y + Math.max(0, (height - blockHeight) / 2);
  layout.lines.forEach((line, index) => text(ctx, line, x, top + index * (layout.size + layout.lineGap) + layout.size / 2, {
    size: layout.size,
    color: options.color,
    weight: options.weight ?? 800,
    align: options.align ?? 'left',
    baseline: 'middle',
  }));
  return layout;
}

export function beatTime(frame: Frame, target: string, fallback: number): number {
  const kinds: Record<string, string> = { contact: 'contact', result: 'resolve', focus: 'highlight', extract: 'transform', flip: 'compare', compare: 'compare' };
  return frame.events?.find(event => event.target === target)?.at
    ?? frame.events?.find(event => !event.target && event.kind === kinds[target])?.at
    ?? frame.dur * fallback;
}

export function beatProgress(frame: Frame, target: string, fallback: number): number {
  return ease.outCubic(prog(frame.t, beatTime(frame, target, fallback), 0.22));
}

export function activeStep(frame: Frame, count: number): number {
  if (count <= 1) return 0;
  let active = 0;
  for (let index = 1; index < count; index++) {
    const at = frame.events?.[index - 1]?.at ?? frame.hits?.[index - 1] ?? frame.dur * index / count;
    if (frame.t >= at) active = index;
  }
  return active;
}
