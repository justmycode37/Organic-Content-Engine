import { clamp, ease, parseMarkup, SAFE, type Frame } from '../../core.ts';

export const FACES = {
  display: "'BigIdea Archivo', 'Arial Black', sans-serif",
  serif: "'BigIdea Instrument', Georgia, serif",
  sans: "'BigIdea Sans', 'Helvetica Neue', Arial, sans-serif",
  mono: "'SF Mono', Menlo, Consolas, monospace",
};

export const clean = (value: unknown) => String(value ?? '').replaceAll('*', '');
export const phase = (frame: Frame) => clamp(frame.t / Math.max(.001, frame.dur));
export const beat = (frame: Frame, count: number) => Math.min(Math.max(0, count - 1), Math.floor(phase(frame) * Math.max(1, count)));

type TypeOptions = {
  x?: number; y?: number; width?: number; height?: number; size?: number;
  face?: keyof typeof FACES; weight?: number; color?: string; emphasis?: string; underline?: string;
  leading?: number; align?: 'left' | 'center' | 'right';
  /** 0..1: an accent rule drawing under the `emphasis` word (the second move of a held cover). */
  mark?: number;
  /** 0..1: rows ink from `dim` to `color` top to bottom, one hard step per row. */
  ink?: number;
};

function linesFor(frame: Frame, value: string, width: number) {
  const rows: string[] = [];
  for (const paragraph of value.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && frame.ctx.measureText(`${line} ${word}`).width > width) {
        rows.push(line);
        line = '';
      }
      if (frame.ctx.measureText(word).width > width) {
        if (line) rows.push(line);
        line = '';
        for (const char of word) {
          if (line && frame.ctx.measureText(line + char).width > width) {
            rows.push(line);
            line = '';
          }
          line += char;
        }
      } else line = line ? `${line} ${word}` : word;
    }
    rows.push(line);
  }
  return rows;
}

export function type(frame: Frame, value: unknown, options: TypeOptions = {}) {
  const { ctx, theme } = frame;
  const raw = clean(value);
  if (!raw.trim()) return 0;
  const { x = SAFE.x, y = 420, width = 804, height = 600, face = 'display', weight = 400,
    color = theme.fg, emphasis, underline, leading = .98, align = 'left', mark = 0, ink = 1 } = options;
  ctx.save();
  let size = options.size ?? 156;
  ctx.font = `${weight} ${size}px ${FACES[face]}`;
  const longest = Math.max(1, ...raw.split(/\s+/).map(word => ctx.measureText(word).width));
  size *= Math.min(1, width / longest);
  let rows: string[] = [];
  for (let attempt = 0; attempt < 100; attempt++) {
    ctx.font = `${weight} ${size}px ${FACES[face]}`;
    rows = linesFor(frame, raw, width);
    if (rows.length * size * Math.max(1.05, leading) <= height && rows.every(row => ctx.measureText(row).width <= width)) break;
    size *= .94;
  }
  ctx.textBaseline = 'alphabetic';
  let marked = false;
  rows.forEach((row, index) => {
    const measured = ctx.measureText(row);
    const left = align === 'center' ? x + (width - measured.width) / 2 : align === 'right' ? x + width - measured.width : x;
    const top = y + index * size * Math.max(leading, 1.05);
    const baseline = top + ctx.measureText('Hg').actualBoundingBoxAscent;
    const target = emphasis ?? underline;
    const offset = target && !marked ? row.indexOf(target) : -1;
    const rowColor = index < Math.ceil(ink * rows.length - 1e-6) ? color : theme.dim;
    ctx.fillStyle = rowColor;
    if (offset < 0 || !target) ctx.fillText(row, left, baseline);
    else {
      const before = row.slice(0, offset), after = row.slice(offset + target.length);
      const beforeWidth = ctx.measureText(before).width;
      ctx.fillText(before, left, baseline);
      ctx.fillStyle = emphasis ? theme.accent : rowColor;
      ctx.fillText(target, left + beforeWidth, baseline);
      if (underline) ctx.fillRect(left + beforeWidth, baseline + 6, ctx.measureText(target).width, 2);
      if (emphasis && mark > 0) ctx.fillRect(left + beforeWidth, baseline + size * .12, ctx.measureText(target).width * clamp(mark), Math.max(6, size * .05));
      ctx.fillStyle = rowColor;
      ctx.fillText(after, left + beforeWidth + ctx.measureText(target).width, baseline);
      marked = true;
    }
  });
  ctx.restore();
  return rows.length * size * Math.max(leading, 1.05);
}

export function label(frame: Frame, value: unknown, y = 288, options: TypeOptions = {}) {
  return type(frame, clean(value).toUpperCase(), { y, size: 90, height: 192, face: 'sans', weight: 600, color: frame.theme.dim, leading: 1.12, ...options });
}

export function change(frame: Frame, index = 0) {
  const event = frame.events?.[index];
  if (event) return ease.outExpo(clamp((frame.t - event.at) / .24));
  return ease.outExpo(clamp((frame.t - (index + 1) * frame.dur / 3) / .24));
}

export function stage(frame: Frame, count: number) {
  const events = frame.events ?? [];
  return events.length
    ? Math.min(count - 1, events.filter(event => frame.t >= event.at).length)
    : beat(frame, count);
}

export function rule(frame: Frame, y: number, width = 840) {
  frame.ctx.fillStyle = frame.theme.line;
  frame.ctx.fillRect(SAFE.x, y, width, 2);
}

/** Start of a scene's second beat: a fraction of the scene, capped so short and long scenes both feel decisive. */
export const at = (frame: Frame, fraction: number, cap: number) => Math.min(cap, frame.dur * fraction);
const enter = (frame: Frame, delay = 0, length = .28) => ease.outExpo(clamp((frame.t - delay) / Math.min(length, Math.max(.01, frame.dur * .2))));

/** The hook entrance: readable on the first frame, the block settles 40 px up from 104 % scale (anchor: left margin). */
export function settle(frame: Frame, draw: () => void, from = 1.04, anchorY = 744) {
  const amount = 1 - enter(frame);
  const scale = 1 + (from - 1) * amount;
  frame.ctx.save();
  frame.ctx.translate(SAFE.x, anchorY + amount * 40);
  frame.ctx.scale(scale, scale);
  frame.ctx.translate(-SAFE.x, -anchorY);
  draw();
  frame.ctx.restore();
}

/** Hard-edged mask that opens downward over `height` px from `top`, starting at `delay`. Draws nothing before. */
export function mask(frame: Frame, delay: number, top: number, height: number, draw: () => void) {
  const open = enter(frame, delay, .22);
  if (open <= 0) return;
  frame.ctx.save();
  frame.ctx.beginPath();
  frame.ctx.rect(72, top, 912, height * open);
  frame.ctx.clip();
  draw();
  frame.ctx.restore();
}

export function headline(frame: Frame, value: unknown, kicker?: string, sub?: string, emphasis?: string) {
  if (kicker) label(frame, kicker);
  let height = 0;
  const mark = change(frame);
  settle(frame, () => { height = type(frame, value, { y: 432, size: 164, height: 540, emphasis, mark }); });
  const top = Math.min(1056, 480 + height);
  if (sub) type(frame, sub, { y: top, size: 64, face: 'sans', height: 180, color: frame.theme.dim });
}

/** Anchor rects for object continuity: where each layout family actually draws its hero. */
export const HERO = {
  number: { x: SAFE.x, y: 560, w: 780, h: 300 },
  headline: { x: SAFE.x, y: 432, w: 804, h: 360 },
  motif: { x: 228, y: 432, w: 540, h: 540 },
};

type NumeralOptions = {
  /** Scale the number starts from before `slam` lands; 1 means readable at full size from the first frame. */
  from?: number;
  /** 0..1 progress of the landing (defaults to the first event). */
  slam?: number;
  /** 0..1: an accent rule drawing under the settled number (defaults to the second event). */
  mark?: number;
  color?: string;
};

export function numeral(frame: Frame, value: unknown, meaning: string, note?: string, options: NumeralOptions = {}) {
  const { from = .55, slam = change(frame), mark = change(frame, 1), color = frame.theme.accent } = options;
  if (note) label(frame, note);
  settle(frame, () => {
    const raw = clean(value);
    frame.ctx.save();
    let size = 360;
    frame.ctx.font = `400 ${size}px ${FACES.display}`;
    size *= Math.min(1, 780 / Math.max(1, frame.ctx.measureText(raw).width));
    const full = size;
    size *= from + (1 - from) * slam;
    frame.ctx.font = `400 ${size}px ${FACES.display}`;
    const metrics = frame.ctx.measureText(raw);
    frame.ctx.fillStyle = color;
    frame.ctx.fillText(raw, SAFE.x + metrics.actualBoundingBoxLeft, 840);
    if (mark > 0) {
      frame.ctx.fillStyle = frame.theme.accent;
      frame.ctx.fillRect(SAFE.x, 840 + full * .06, metrics.width * clamp(mark), Math.max(12, full * .045));
    }
    frame.ctx.restore();
  }, 1.05, 840);
  type(frame, meaning, { y: 900 + Math.min(1, mark) * 24, size: 96, face: 'sans', weight: 600, height: 216 });
}

export type Motif = 'circle' | 'square' | 'arrow' | 'lock' | 'dot';
export function motif(frame: Frame, shape: Motif, fullBleed = false, asset?: string) {
  const { ctx, theme } = frame;
  const transform = change(frame), resolve = change(frame, 1);
  const growth = fullBleed ? 1 + transform * 6 : 1 + resolve * .22;
  const size = shape === 'dot' ? 48 : 408;
  ctx.save();
  ctx.translate(498, 702);
  ctx.scale(growth, growth);
  ctx.fillStyle = theme.accent;
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 30;
  const image = asset ? frame.assets[asset] : undefined;
  if (image && image.width > 0 && image.height > 0) {
    const ratio = Math.min(540 / image.width, 540 / image.height);
    ctx.drawImage(image, -image.width * ratio / 2, -image.height * ratio / 2, image.width * ratio, image.height * ratio);
  } else if (asset) {
    ctx.strokeRect(-180, -180, 360, 360);
    ctx.beginPath(); ctx.moveTo(-120, 120); ctx.lineTo(120, -120); ctx.stroke();
  } else if (shape === 'dot') {
    const extent = 24 + transform * 204;
    const corner = 24 * (1 - transform);
    ctx.lineWidth = 12;
    ctx.beginPath(); ctx.roundRect(-extent, -extent, extent * 2, extent * 2, corner);
    if (transform < .5) ctx.fill(); else ctx.stroke();
  } else if (shape === 'circle') {
    ctx.beginPath(); ctx.arc(0, 0, size / 2, 0, Math.PI * 2); ctx.fill();
  } else if (shape === 'square') {
    ctx.fillRect(-size / 2, -size / 2, size, size);
    ctx.fillStyle = theme.bg;
    const inset = transform * 156;
    ctx.fillRect(-inset, -inset, inset * 2, inset * 2);
  }
  else if (shape === 'arrow') {
    ctx.beginPath(); ctx.moveTo(-216, 0); ctx.lineTo(216, 0); ctx.moveTo(48, -168); ctx.lineTo(216, 0); ctx.lineTo(48, 168); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(0, -72, 120, Math.PI, 0); ctx.lineTo(120, 24); ctx.stroke();
    ctx.fillRect(-180, 0, 360, 240);
    ctx.fillStyle = theme.bg; ctx.beginPath(); ctx.arc(0, 96, 24, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(-12, 96, 24, 60);
  }
  ctx.restore();
}

export function markedWord(value: string) {
  return parseMarkup(value).find(span => span.accent)?.text.split(/\s+/)[0];
}
