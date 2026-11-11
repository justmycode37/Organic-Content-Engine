import { SAFE, clamp, ease, parseMarkup, type Frame, type KineticProps, type SceneDef } from '../core.ts';
import { blocks, pixelBlock, pixelHeight, pixelText, pixelWidth } from '../prim.ts';

type Piece = { text: string; accent: boolean; spaceBefore: boolean };
type Layout = { px: number; lines: string[]; truncated: boolean };

function serialize(pieces: Piece[]): string {
  return pieces.map((piece, index) => `${index > 0 && piece.spaceBefore ? ' ' : ''}${piece.accent ? `*${piece.text}*` : piece.text}`).join('');
}

function width(pieces: Piece[], px: number): number {
  return pixelWidth(serialize(pieces).replaceAll('*', ''), px);
}

function layoutAt(value: string, maxWidth: number, maxLines: number, px: number): Layout {
  const raw = String(value ?? '').slice(0, 3000).toUpperCase();
  const truncatedInput = String(value ?? '').length > raw.length;
  const source: Piece[] = [];
  let hasWord = false;
  let pendingSpace = false;
  for (const span of parseMarkup(raw)) {
    for (const part of span.text.match(/\s+|\S+/g) ?? []) {
      if (/^\s+$/.test(part)) { pendingSpace = hasWord; continue; }
      const word = part;
      let chunk = '';
      let firstChunk = true;
      for (const char of [...word]) {
        if (chunk && pixelWidth(chunk + char, px) > maxWidth) {
          source.push({ text: chunk, accent: span.accent, spaceBefore: hasWord && pendingSpace && firstChunk });
          hasWord = true;
          firstChunk = false;
          pendingSpace = false;
          chunk = '';
        }
        chunk += char;
      }
      if (chunk) {
        source.push({ text: chunk, accent: span.accent, spaceBefore: hasWord && pendingSpace && firstChunk });
        hasWord = true;
        pendingSpace = false;
      }
    }
  }
  if (!source.length) return { px, lines: [], truncated: truncatedInput };

  const rows: Piece[][] = [];
  let current: Piece[] = [];
  let truncated = truncatedInput;
  for (let i = 0; i < source.length; i++) {
    const piece = source[i]!;
    const next = current.length ? piece : { ...piece, spaceBefore: false };
    if (!current.length || width([...current, next], px) <= maxWidth) {
      current = [...current, next];
      continue;
    }
    if (rows.length >= maxLines - 1) {
      truncated = true;
      break;
    }
    rows.push(current);
    current = [{ ...piece, spaceBefore: false }];
  }
  if (current.length && rows.length < maxLines) rows.push(current);
  if (truncated && rows.length) {
    const last = rows[rows.length - 1]!;
    const dots: Piece = { text: '...', accent: false, spaceBefore: last.length > 0 };
    while (last.length && width([...last, dots], px) > maxWidth) last.pop();
    if (pixelWidth('...', px) <= maxWidth) last.push(dots);
  }
  return { px, lines: rows.map(serialize), truncated };
}

function fitText(value: string, maxWidth: number, maxLines: number): Layout {
  const plain = value.replace(/\*[^*]*\*/g, match => match.slice(1, -1));
  const singleWord = plain.trim().split(/\s+/).length === 1;
  const modules = pixelWidth(plain, 1);
  const heightCap = Math.max(8, Math.floor(560 / 7));
  if (singleWord && modules > 0) {
    const letterCount = [...plain.replaceAll('*', '')].length;
    const shortWordCap = letterCount <= 2 ? 40 : 80;
    const px = Math.max(8, Math.min(Math.floor(800 / modules), heightCap, shortWordCap));
    const result = layoutAt(value, maxWidth, maxLines, px);
    if (result.lines.length === 1 && !result.truncated) return result;
  }
  let fallback = layoutAt(value, maxWidth, maxLines, 8);
  for (const px of [40, 36, 32, 28, 24, 20, 16, 12, 8]) {
    const result = layoutAt(value, maxWidth, maxLines, px);
    const lineHeight = pixelHeight(px) + Math.max(12, px * 1.4);
    const blockHeight = result.lines.length * lineHeight - Math.max(12, px * 1.4);
    fallback = result;
    if (!result.truncated && result.lines.length <= maxLines && blockHeight <= 560) return result;
  }
  return fallback;
}

export const kineticScene: SceneDef<KineticProps> = {
  type: 'kinetic',
  render(frame: Frame, props: KineticProps) {
    const { ctx, theme, t, dur, seed } = frame;
    const words = (props.words ?? []).map(word => String(word ?? '').trim()).filter(Boolean).slice(0, 12);
    if (!words.length) return;

    const beat = dur / words.length;
    const index = Math.min(words.length - 1, Math.floor(Math.max(0, t) / beat));
    const local = clamp((t - index * beat) / Math.min(0.22, beat * 0.24));
    const content = words[index]!.slice(0, 3000).toUpperCase();
    const inverted = index % 2 === 1;
    const bg = inverted ? theme.fg : theme.bg;
    const fg = inverted ? theme.bg : theme.fg;
    const areaY = 240;
    const areaH = 1000;
    ctx.fillStyle = bg;
    ctx.fillRect(SAFE.x, areaY, SAFE.w, areaH);

    const fit = fitText(content, 800, 3);
    const lineGap = Math.max(12, fit.px * 1.4);
    const blockH = fit.lines.length * pixelHeight(fit.px) + Math.max(0, fit.lines.length - 1) * lineGap;
    const blockY = 740 - blockH / 2;
    const entrance = ease.outBack(local);
    ctx.save();
    const method = index % 4;
    if (method === 0) {
      ctx.translate(SAFE.cx, 740); ctx.scale(0.82 + entrance * 0.18, 0.82 + entrance * 0.18); ctx.translate(-SAFE.cx, -740);
    } else if (method === 1) {
      ctx.translate(Math.round((1 - ease.outExpo(local)) * SAFE.w * -1), 0);
    } else if (method === 3) {
      const revealW = Math.max(1, SAFE.w * ease.outExpo(local));
      ctx.beginPath(); ctx.rect(SAFE.cx - revealW / 2, areaY, revealW, areaH); ctx.clip();
    }
    const stretch = fit.lines.length === 1 ? Math.min(2, 800 / Math.max(1, pixelWidth(fit.lines[0]!.replaceAll('*', ''), fit.px))) : 1;
    fit.lines.forEach((line, lineIndex) => {
      ctx.save();
      ctx.translate(SAFE.cx, 0);
      ctx.scale(stretch, 1);
      ctx.translate(-SAFE.cx, 0);
      pixelBlock(ctx, [line], SAFE.cx, blockY + lineIndex * (pixelHeight(fit.px) + lineGap), fit.px, {
        color: fg, accent: theme.accent, align: 'center', reveal: method === 2 ? ease.outExpo(local) : 1,
        seed: seed + index * 73 + lineIndex * 11, gap: 0,
      });
      ctx.restore();
    });
    ctx.restore();
  },
};
