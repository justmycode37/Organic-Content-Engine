import { clamp, ease, markupWords, type Frame } from '../../core.ts';

export const DISPLAY = "'Breaking Anton', Impact, 'Arial Narrow', sans-serif";
export const BODY = "'Breaking Archivo', 'Arial Narrow', Helvetica, Arial, sans-serif";
/** Anton has no ≠ glyph and its fallback renders it like "=", inverting the claim; spell the relation out. */
export const clean = (value: unknown) => String(value ?? '').replaceAll('*', '').replace(/\s*≠\s*/g, ' NOT ');
/** Supporting copy floor: Archivo Narrow caps measure about 0.69 em, so 94px keeps rendered caps at 64px. */
export const SUPPORT = 94;
/** Fixed print inks for cut-outs: the sticker outline is always white, the keyline and halftone always ink. */
const INK = '#111110', OUTLINE = '#FFFFFF';
/** Top of the scene area, just below the masthead (clear of the Instagram header). */
export const TOP = 324;

export function rect(frame: Frame, x: number, y: number, width: number, height: number, color: string) {
  frame.ctx.fillStyle = color;
  frame.ctx.fillRect(x, y, Math.max(0, width), Math.max(0, height));
}

function linesAt(frame: Frame, value: string, width: number, size: number, family: string): string[] {
  const { ctx } = frame;
  ctx.font = `${family === DISPLAY ? 400 : 700} ${size}px ${family}`;
  const lines: string[] = [];
  for (const paragraph of value.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (ctx.measureText([line, word].filter(Boolean).join(' ')).width > width && line) {
        lines.push(line);
        line = '';
      }
      for (const character of (line ? ' ' : '') + word) {
        if (ctx.measureText(line + character).width > width && line) {
          lines.push(line);
          line = '';
        }
        line += character;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

/** Largest size up to `maximum` at which no word breaks and every line fits the box: headlines fill the format. */
export function fit(frame: Frame, value: unknown, width: number, height: number, maximum: number, minimum = 96, family = DISPLAY, leading = 1) {
  const content = clean(value).toUpperCase();
  for (let size = maximum; size > minimum; size -= 4) {
    frame.ctx.font = `${family === DISPLAY ? 400 : 700} ${size}px ${family}`;
    if (content.split(/\s+/).some(word => frame.ctx.measureText(word).width > width)) continue;
    if (linesAt(frame, content, width, size, family).length * size * leading <= height) return size;
  }
  return minimum;
}

export function copy(frame: Frame, value: unknown, x: number, y: number, width: number, height: number, size = 72, color = frame.theme.fg, family = DISPLAY, leading = 1.14) {
  const { ctx } = frame;
  const content = clean(value).toUpperCase();
  const floor = Math.min(size, family === BODY ? SUPPORT : 96);
  let fitted = size;
  let lines = linesAt(frame, content, width, fitted, family);
  while (lines.length * fitted * leading > height && fitted > floor) {
    fitted -= 2;
    lines = linesAt(frame, content, width, fitted, family);
  }
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const capacity = Math.max(1, Math.floor(height / (fitted * leading)));
  const visible = lines.slice(0, capacity);
  if (lines.length > capacity) {
    let last = visible.at(-1) ?? '';
    while (last && ctx.measureText(last + '…').width > width) last = last.slice(0, -1);
    visible[visible.length - 1] = last + '…';
  }
  visible.forEach((line, index) => ctx.fillText(line, x, y + index * fitted * leading));
  return visible.length * fitted * leading;
}

export function label(frame: Frame, value: unknown, x = 120, y = TOP, width = 816, accent = false) {
  copy(frame, value, x, y, Math.min(width, 772), 150, SUPPORT, accent ? frame.theme.accent : frame.theme.fg, BODY);
}

export function literal(frame: Frame, value: string, x: number, y: number, width: number, height: number, size: number, color: string) {
  const { ctx } = frame;
  let fitted = Math.min(size, height / 1.14);
  ctx.font = `700 ${fitted}px ${BODY}`;
  const measured = ctx.measureText(value).width;
  if (measured > width) fitted *= width / measured;
  ctx.font = `700 ${Math.max(8, fitted)}px ${BODY}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(value, x, y, width);
}

export function rule(frame: Frame, y: number, width = 816, x = 120) {
  rect(frame, x, y, width, 4, frame.theme.fg);
}

/**
 * Slams `draw` in from a readable state: 12% oversized around (anchorX, anchorY) and knocked low, settling in at
 * most 0.18 s. Content columns are sized so even the oversized peak stays inside the safe zone. Every resolved event or hit retriggers it, so each spoken anchor lands as a physical impact; the
 * opening frame is already settled.
 */
export function slam<T>(frame: Frame, delay: number, draw: () => T, direction = 1, anchorY = 700, anchorX = 120): T {
  const { ctx } = frame;
  const latest = Math.max(delay, ...(frame.events ?? []).filter(event => event.at <= frame.t).map(event => event.at), ...(frame.hits ?? []).filter(hit => hit <= frame.t));
  const settle = frame.opening && frame.t <= 0.3 ? 0 : 1 - ease.outExpo(clamp((frame.t - latest) / Math.min(0.18, frame.dur * 0.12)));
  ctx.save();
  ctx.translate(anchorX, anchorY + settle * 24 * direction);
  ctx.scale(1 + settle * 0.12, 1 + settle * 0.12);
  ctx.translate(-anchorX, -anchorY);
  const result = draw();
  ctx.restore();
  return result;
}

export function stamp(frame: Frame, value: string, y: number, width = 720) {
  const { ctx, theme } = frame;
  const progress = clamp(frame.t / Math.min(0.24, frame.dur * 0.16));
  const scale = 1 + (1 - ease.outExpo(progress)) * 0.18;
  ctx.save();
  ctx.translate(528, y + 54);
  ctx.rotate(-0.045);
  ctx.scale(scale, scale);
  rect(frame, -width / 2, -54, width, 108, theme.accent);
  copy(frame, value, -width / 2 + 18, -42, width - 36, 84, 66, theme.onAccent);
  ctx.restore();
}

export function dots(frame: Frame, x: number, y: number, width: number, height: number) {
  const { ctx, theme } = frame;
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = theme.fg;
  for (let row = 0; row < height / 16; row++) {
    for (let column = 0; column < width / 16; column++) {
      ctx.beginPath();
      ctx.arc(x + column * 16 + row % 2 * 8, y + row * 16, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function silhouette(image: CanvasImageSource, width: number, height: number, color: string) {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d')!;
  context.drawImage(image, 0, 0, width, height);
  context.globalCompositeOperation = 'source-in';
  context.fillStyle = color;
  context.fillRect(0, 0, width, height);
  return canvas;
}

function halftone(image: CanvasImageSource, width: number, height: number) {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d')!;
  context.filter = 'grayscale(1) contrast(1.45) brightness(1.04)';
  context.drawImage(image, 0, 0, width, height);
  context.filter = 'none';
  const cell = new OffscreenCanvas(8, 8);
  const dot = cell.getContext('2d')!;
  dot.fillStyle = INK;
  for (const [x, y] of [[2, 2], [6, 6]]) { dot.beginPath(); dot.arc(x!, y!, 1.5, 0, Math.PI * 2); dot.fill(); }
  context.globalCompositeOperation = 'source-atop';
  context.globalAlpha = 0.28;
  context.fillStyle = context.createPattern(cell, 'repeat')!;
  context.fillRect(0, 0, width, height);
  return canvas;
}

/** Draws a ring of copies around (x, y): a hard dilation without blur. */
function ring(ctx: Frame['ctx'], source: CanvasImageSource, x: number, y: number, radius: number) {
  for (let step = 0; step < 16; step++) {
    const angle = step / 16 * Math.PI * 2;
    ctx.drawImage(source, x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
  }
}

/**
 * Tilted sticker cut-out: signal offset, ink keyline, thick white outline, greyscale halftone print.
 * The image may run up to 20% below the box and is cropped hard at its bottom edge.
 */
export function cutout(frame: Frame, asset: string | undefined, x: number, y: number, width: number, height: number) {
  const { ctx, theme } = frame;
  const settle = 1 - ease.outExpo(clamp(frame.t / Math.min(0.22, frame.dur * 0.12)));
  const image = asset ? frame.assets[asset] : undefined;
  ctx.save();
  ctx.beginPath(); ctx.rect(x - 60, y - 60, width + 120, height + 60); ctx.clip();
  ctx.translate(x + width / 2, y + height / 2);
  ctx.rotate(-0.035 + Math.sin(frame.t * 2) * 0.008);
  ctx.scale(1 + settle * 0.14, 1 + settle * 0.14);
  if (image && image.width > 0 && image.height > 0) {
    const scale = Math.min((width - 48) / image.width, height * 1.2 / image.height);
    const drawWidth = Math.max(1, Math.round(image.width * scale)), drawHeight = Math.max(1, Math.round(image.height * scale));
    const left = -drawWidth / 2, top = -height / 2 + 24;
    ring(ctx, silhouette(image, drawWidth, drawHeight, theme.accent), left + 20, top + 20, 12);
    ring(ctx, silhouette(image, drawWidth, drawHeight, INK), left, top, 16);
    ring(ctx, silhouette(image, drawWidth, drawHeight, OUTLINE), left, top, 12);
    ctx.drawImage(halftone(image, drawWidth, drawHeight), left, top);
  } else {
    rect(frame, -width * 0.3 + 18, -height * 0.43 + 18, width * 0.6, height * 0.86, theme.accent);
    rect(frame, -width * 0.3, -height * 0.43, width * 0.6, height * 0.86, theme.fg);
    for (let row = 0; row < 5; row++) {
      rect(frame, -width * 0.24, -height * 0.35 + row * height * 0.14, width * 0.48, height * 0.1, theme.bg);
    }
  }
  ctx.restore();
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255).map(value => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

/** True once the scene's stamp event has landed. */
export function reversed(frame: Frame) {
  return frame.events.some(event => event.sfx === 'stamp' && event.at <= frame.t);
}

/**
 * The tabloid verdict: when a scene's `stamp` event lands, the whole frame flips to the signal colour with knocked-out
 * type for the rest of that scene. One flip per scene keeps full-frame luminance changes far below three per second.
 */
export function background(frame: Frame) {
  if (reversed(frame)) {
    // Knock-out type is white whenever it clears 4.5:1 on the signal colour, otherwise ink; hero values turn ink.
    const knockout = contrast(frame.theme.accent, '#FFFFFF') >= 4.5 ? '#FFFFFF' : INK;
    frame.theme = { ...frame.theme, bg: frame.theme.accent, fg: knockout, accent: knockout === INK ? '#FFFFFF' : INK, line: knockout, dim: knockout, muted: knockout, onAccent: frame.theme.accent };
  }
  rect(frame, 0, 0, 1080, 1920, frame.theme.bg);
}

export function caption(frame: Frame, value: string) {
  const { ctx, theme } = frame;
  const parsed = markupWords(value).reduce<ReturnType<typeof markupWords>>((words, word) => {
    if (/^[.,!?;:…%)\]}”’]+$/.test(word.text) && words.length) words[words.length - 1]!.text += word.text;
    else words.push({ ...word });
    return words;
  }, []);
  const words = parsed.flatMap(word => [...word.text.toUpperCase()].reduce<string[]>((parts, character) => {
    if (!parts.length || parts.at(-1)!.length >= 22) parts.push('');
    parts[parts.length - 1] += character;
    return parts;
  }, []).map(text => ({ text, accent: word.accent })));
  let size = 100;
  let rows: typeof words[] = [];
  for (; size >= SUPPORT; size -= 2) {
    ctx.font = `700 ${size}px ${BODY}`;
    rows = [];
    let row: typeof words = [];
    let width = 0;
    words.forEach(word => {
      const advance = ctx.measureText(word.text + ' ').width;
      if (width + advance > 808 && row.length) { rows.push(row); row = []; width = 0; }
      row.push(word); width += advance;
    });
    if (row.length) rows.push(row);
    if (rows.length <= 2 || size === SUPPORT) break;
  }
  const page = Math.min(Math.ceil(rows.length / 2) - 1, Math.floor(frame.t / 0.9));
  rows.slice(page * 2, page * 2 + 2).forEach((row, index) => {
    const rowWidth = row.reduce((width, word) => width + ctx.measureText(word.text + ' ').width, 0);
    const left = 502 - rowWidth / 2;
    const top = 996 + index * (size * 1.16 + 8);
    let cursor = left;
    row.forEach(word => {
      ctx.fillStyle = theme.fg;
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillText(word.text, cursor, top);
      cursor += ctx.measureText(word.text + ' ').width;
    });
  });
}
