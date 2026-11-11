import { CONTENT_BOTTOM, SAFE, clamp, ease, parseMarkup, type Frame, type OutroProps, type SceneDef } from '../core.ts';
import { pixelBlock, pixelHeight, pixelText, pixelWidth, text, textWidth } from '../prim.ts';

type Piece = { text: string; accent: boolean; spaceBefore: boolean };
type Fit = { px: number; lines: string[]; truncated: boolean };

function serialize(pieces: Piece[]): string {
  return pieces.map((piece, index) => `${index > 0 && piece.spaceBefore ? ' ' : ''}${piece.accent ? `*${piece.text}*` : piece.text}`).join('');
}
function lineWidth(pieces: Piece[], px: number): number { return pixelWidth(serialize(pieces).replaceAll('*', ''), px); }

function layoutAt(value: string, maxWidth: number, maxLines: number, px: number): Fit {
  const input = String(value ?? '').slice(0, 4000).toUpperCase();
  const truncatedInput = String(value ?? '').length > input.length;
  const source: Piece[] = [];
  let hasWord = false;
  let pendingSpace = false;
  for (const span of parseMarkup(input)) {
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
    if (!current.length || lineWidth([...current, next], px) <= maxWidth) { current = [...current, next]; continue; }
    if (rows.length >= maxLines - 1) { truncated = true; break; }
    rows.push(current);
    current = [{ ...piece, spaceBefore: false }];
  }
  if (current.length && rows.length < maxLines) rows.push(current);
  if (truncated && rows.length) {
    const last = rows[rows.length - 1]!;
    const dots: Piece = { text: '...', accent: false, spaceBefore: last.length > 0 };
    while (last.length && lineWidth([...last, dots], px) > maxWidth) last.pop();
    if (pixelWidth('...', px) <= maxWidth) last.push(dots);
  }
  return { px, lines: rows.map(serialize), truncated };
}

function fitPixelSafe(value: string, maxWidth: number, maxLines: number, sizes: number[]): Fit {
  let fallback: Fit = { px: sizes.at(-1) ?? 8, lines: [], truncated: false };
  for (const px of sizes) {
    const result = layoutAt(value, maxWidth, maxLines, px);
    fallback = result;
    if (!result.truncated && result.lines.length <= maxLines && result.lines.every(line => pixelWidth(line.replaceAll('*', ''), px) <= maxWidth)) return result;
  }
  return fallback;
}

function wrapSans(ctx: Frame['ctx'], value: string, maxWidth: number, size: number, maxLines: number): string[] {
  const raw = String(value ?? '').trim().slice(0, 4000);
  if (!raw) return [];
  const tokens: string[] = [];
  for (const word of raw.split(/\s+/)) {
    let chunk = '';
    for (const char of [...word]) {
      if (chunk && textWidth(ctx, chunk + char, size) > maxWidth) { tokens.push(chunk); chunk = ''; }
      chunk += char;
    }
    if (chunk) tokens.push(chunk);
  }
  const lines: string[] = [];
  let line = '';
  let truncated = false;
  for (const token of tokens) {
    const candidate = line ? `${line} ${token}` : token;
    if (!line || textWidth(ctx, candidate, size) <= maxWidth) line = candidate;
    else {
      lines.push(line);
      if (lines.length >= maxLines) { truncated = true; line = ''; break; }
      line = token;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (truncated && lines.length) {
    let last = lines[lines.length - 1]!;
    while (last && textWidth(ctx, `${last}...`, size) > maxWidth) last = last.slice(0, -1).trimEnd();
    lines[lines.length - 1] = `${last}...`;
  }
  return lines;
}

export const outroScene: SceneDef<OutroProps> = {
  type: 'outro',
  render(frame: Frame, props: OutroProps) {
    const { ctx, theme, t, dur, seed } = frame;
    const cta = String(props.cta ?? '').trim();
    const ctaFit = fitPixelSafe(cta.toUpperCase(), SAFE.w, 3, [14, 12, 10, 8]);
    const ctaLineGap = Math.max(12, ctaFit.px * 1.5);
    const ctaH = ctaFit.lines.length ? ctaFit.lines.length * pixelHeight(ctaFit.px) + (ctaFit.lines.length - 1) * ctaLineGap : 0;
    const wordModule = 22;
    const wordGap = 24;
    const wordH = pixelHeight(wordModule) * 2 + wordGap;
    const handle = String(props.handle ?? '').trim().replace(/^@/, '');
    let handleText = handle ? `@${handle}` : '';
    let handleSize = 44;
    while (handleText && handleSize > 24 && textWidth(ctx, handleText, handleSize) > SAFE.w) handleSize -= 4;
    if (handleText && textWidth(ctx, handleText, handleSize) > SAFE.w) {
      let clipped = handleText;
      while (clipped.length && textWidth(ctx, `${clipped}...`, handleSize) > SAFE.w) clipped = clipped.slice(0, -1);
      handleText = `${clipped}...`;
    }
    const handleH = handleText ? 54 : 0;
    const subLines = props.sub ? wrapSans(ctx, props.sub, SAFE.w, 36, 2) : [];
    const subH = subLines.length ? subLines.length * 44 : 0;

    const ctaGap = ctaH ? 40 : 0;
    const wordAfterGap = handleH ? 32 : (subH ? 24 : 0);
    const handleAfterGap = subH && handleH ? 24 : 0;
    const groupH = ctaH + ctaGap + wordH + wordAfterGap + handleH + handleAfterGap + subH;
    let y = SAFE.y + Math.max(0, (Math.max(0, CONTENT_BOTTOM - SAFE.y) - groupH) / 2);
    const ctaReveal = ease.outExpo(clamp(t / Math.min(0.24, Math.max(0.12, dur * 0.12))));

    if (ctaH) {
      pixelBlock(ctx, ctaFit.lines, SAFE.cx, y, ctaFit.px, {
        color: theme.fg, accent: theme.accent, align: 'center',
        reveal: ctaReveal, seed, gap: ctaLineGap, stagger: ctaFit.lines.length > 1 ? 0.12 : 0,
      });
      y += ctaH + ctaGap;
    }

    const logoProgress = ease.outExpo(clamp((t - Math.min(0.12, dur * 0.08)) / Math.min(0.38, dur * 0.2)));
    pixelText(ctx, 'PATCH', SAFE.cx, y, wordModule, { color: theme.fg, align: 'center', reveal: logoProgress, mode: 'blocks', seed: seed + 11 });
    pixelText(ctx, 'NOTES', SAFE.cx, y + pixelHeight(wordModule) + wordGap, wordModule, { color: theme.fg, align: 'center', reveal: clamp(logoProgress * 1.2 - 0.12), mode: 'blocks', seed: seed + 29 });
    y += wordH + wordAfterGap;
    if (handleH) {
      const reveal = ease.outExpo(clamp((t - dur * 0.25) / Math.max(0.12, dur * 0.12)));
      text(ctx, handleText, SAFE.cx, y + 44, { size: handleSize, color: theme.dim, weight: 800, align: 'center', alpha: reveal });
      y += handleH + handleAfterGap;
    }
    if (subH) {
      const reveal = ease.outExpo(clamp((t - dur * 0.34) / Math.max(0.12, dur * 0.12)));
      subLines.forEach((line, index) => text(ctx, line, SAFE.cx, y + index * 44 + 36, { size: 36, color: theme.dim, weight: 800, align: 'center', alpha: reveal }));
    }
  },
};
