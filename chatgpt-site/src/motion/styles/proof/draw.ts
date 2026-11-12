import { clamp, ease, prog, type Frame } from '../../core.ts';

export const SANS = "'Proof Grotesk', 'Helvetica Neue', Arial, sans-serif";
export const MONO = "'Proof Mono', 'SF Mono', Consolas, monospace";
export const entry = (frame: Frame, delay = 0) => ease.outCubic(prog(frame.t, delay * frame.dur, Math.min(.28, frame.dur * .17)));

export function beat(frame: Frame, index: number, fallback = .6 * (index + 1)) {
  return ease.inOutCubic(prog(frame.t, frame.events?.[index]?.at ?? fallback, .24));
}

export function active(frame: Frame, count: number) {
  if (count < 2) return 0;
  const events = frame.events ?? [];
  return Math.min(count - 1, events.length ? events.filter(event => frame.t >= event.at).length : Math.floor(frame.t / Math.max(.1, frame.dur) * count));
}

export function focusText(frame: Frame, value: string | undefined, size = 104, top = 580, progress = 1) {
  return copy(frame, value, 120, top, 768, { size, maxLines: 4, progress });
}

export function rule(frame: Frame, left: number, top: number, right: number, bottom: number, progress = 1, accent = false) {
  const { ctx, theme } = frame;
  ctx.beginPath(); ctx.moveTo(left, top); ctx.lineTo(left + (right - left) * clamp(progress), top + (bottom - top) * clamp(progress));
  ctx.strokeStyle = accent ? theme.accent : theme.line; ctx.lineWidth = accent ? 5 : 2; ctx.stroke();
}

export function marker(frame: Frame, left: number, top: number, width: number, height: number, progress = 1) {
  if (progress <= 0) return;
  const { ctx, theme } = frame;
  ctx.save(); ctx.globalAlpha *= .68; ctx.fillStyle = theme.accent;
  ctx.beginPath(); ctx.moveTo(left - 4, top + 3); ctx.lineTo(left + width * clamp(progress), top);
  ctx.lineTo(left + width * clamp(progress) - 3, top + height); ctx.lineTo(left, top + height - 2); ctx.closePath(); ctx.fill(); ctx.restore();
}

/** `glue` marks a fragment that continues the previous word without a space, e.g. the `.` in `*word*.`. */
type Piece = { text: string; marked: boolean; glue: boolean };
export type Box = { x: number; y: number; w: number; h: number };
type CopyOptions = { size?: number; maxLines?: number; mono?: boolean; weight?: number; muted?: boolean; mark?: boolean; progress?: number; lineHeight?: number; marks?: Box[] };

function pieces(raw: string) {
  const result: Piece[] = [];
  let marked = false;
  for (const word of raw.split(/\s+/).filter(Boolean)) {
    let glue = false;
    for (const chunk of word.split(/(\*)/)) {
      if (chunk === '*') { marked = !marked; continue; }
      if (chunk) { result.push({ text: chunk, marked, glue }); glue = true; }
    }
  }
  return result;
}

const rowText = (row: Piece[]) => row.map((piece, index) => (index && !piece.glue ? ' ' : '') + piece.text).join('');

/** Draws wrapped text; `*phrase*` gets a marker sweep. Boxes of marked words are pushed into `options.marks`. */
export function copy(frame: Frame, value: string | undefined, left: number, top: number, width: number, options: CopyOptions = {}) {
  const { ctx, theme } = frame;
  const family = options.mono ? MONO : SANS;
  const weight = options.weight ?? (options.mono ? 400 : 600);
  const maxLines = options.maxLines ?? 4;
  let size = options.size ?? 54;
  const words = pieces(String(value ?? '').slice(0, 2000));
  let rows: Piece[][] = [];
  for (;;) {
    ctx.font = `${weight} ${size}px ${family}`;
    rows = []; let row: Piece[] = [];
    for (const piece of words) {
      const chunks: string[] = []; let current = '';
      for (const character of piece.text) {
        if (current && ctx.measureText(current + character).width > width) { chunks.push(current); current = ''; }
        current += character;
      }
      if (current) chunks.push(current);
      chunks.forEach((chunk, index) => {
        const next = { ...piece, text: chunk, glue: index > 0 || piece.glue };
        if (row.length && ctx.measureText(rowText([...row, next])).width > width) { rows.push(row); row = []; }
        row.push(next);
      });
    }
    if (row.length) rows.push(row);
    if (rows.length <= maxLines || size <= 16) break;
    size -= 2;
  }
  rows = rows.slice(0, maxLines);
  const lineHeight = size * (options.lineHeight ?? 1.14);
  ctx.textBaseline = 'top'; ctx.textAlign = 'left';
  const space = ctx.measureText(' ').width;
  rows.forEach((row, rowIndex) => {
    let cursor = left;
    const y = top + rowIndex * lineHeight;
    row.forEach((piece, index) => {
      if (index && !piece.glue) cursor += space;
      const measured = ctx.measureText(piece.text).width;
      // The marker overshoots the glyphs on every side, so the word sits on yellow rather than on a yellow stripe.
      if (piece.marked && options.mark !== false) marker(frame, cursor - 12, y - size * .02, measured + 26, size * 1.2, options.progress ?? entry(frame));
      if (piece.marked) options.marks?.push({ x: cursor, y, w: measured, h: size });
      ctx.fillStyle = options.muted ? theme.dim : theme.fg;
      ctx.fillText(piece.text, cursor, y);
      cursor += measured;
    });
  });
  return rows.length * lineHeight;
}
