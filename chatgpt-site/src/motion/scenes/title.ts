import { CONTENT_BOTTOM, SAFE, clamp, ease, parseMarkup, type Frame, type TitleProps, type SceneDef } from '../core.ts';
import { icon } from '../icons.ts';
import { cursor, pixelBlock, pixelHeight, pixelText, pixelWidth, tag, text, textWidth } from '../prim.ts';

type PixelPiece = { text: string; accent: boolean; spaceBefore: boolean };
type PixelFit = { px: number; lines: string[] };

function lineText(pieces: PixelPiece[]): string {
  return pieces.map((piece, index) => `${index > 0 && piece.spaceBefore ? ' ' : ''}${piece.accent ? `*${piece.text}*` : piece.text}`).join('');
}

function lineWidth(pieces: PixelPiece[], px: number): number {
  return pixelWidth(lineText(pieces).replaceAll('*', ''), px);
}

function pixelLinesAtSize(value: string, maxWidth: number, maxLines: number, px: number): { lines: string[]; truncated: boolean } {
  const raw = String(value ?? '').slice(0, 4000).toUpperCase();
  const rawTruncated = String(value ?? '').length > raw.length;
  const source: PixelPiece[] = [];
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
  if (!source.length) return { lines: [], truncated: rawTruncated };

  const rows: PixelPiece[][] = [];
  let current: PixelPiece[] = [];
  let truncated = rawTruncated;
  for (let index = 0; index < source.length; index++) {
    const piece = source[index]!;
    const candidatePiece = current.length ? piece : { ...piece, spaceBefore: false };
    const candidate = [...current, candidatePiece];
    if (!current.length || lineWidth(candidate, px) <= maxWidth) {
      current = candidate;
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
  if (rows.length > maxLines) rows.length = maxLines;

  if (truncated && rows.length) {
    const last = rows[rows.length - 1]!;
    const ellipsis: PixelPiece = { text: '...', accent: false, spaceBefore: last.length > 0 };
    while (last.length && lineWidth([...last, ellipsis], px) > maxWidth) last.pop();
    if (pixelWidth('...', px) <= maxWidth) last.push(ellipsis);
  }
  return { lines: rows.map(lineText), truncated };
}

function fitPixelSafe(value: string, maxWidth: number, maxLines: number, sizes: number[]): PixelFit {
  const ordered = sizes.filter(size => Number.isFinite(size) && size > 0).sort((a, b) => b - a);
  let fallback = { px: ordered.at(-1) ?? 8, lines: [] as string[] };
  for (const px of ordered) {
    const result = pixelLinesAtSize(value, maxWidth, maxLines, px);
    fallback = { px, lines: result.lines };
    if (!result.truncated && result.lines.length <= maxLines && result.lines.every(line => pixelWidth(line.replaceAll('*', ''), px) <= maxWidth)) return fallback;
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
      if (chunk && textWidth(ctx, chunk + char, size) > maxWidth) {
        tokens.push(chunk);
        chunk = '';
      }
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

function markedRuns(line: string, px: number): { text: string; x: number; width: number }[] {
  const plain = line.replaceAll('*', '');
  const start = SAFE.cx - pixelWidth(plain, px) / 2;
  const runs: { text: string; x: number; width: number }[] = [];
  const pattern = /\*([^*]+)\*/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(line))) {
    const prefix = line.slice(0, match.index).replaceAll('*', '');
    const value = match[1] ?? '';
    runs.push({ text: value, x: start + pixelWidth(prefix, px), width: pixelWidth(value, px) });
  }
  return runs;
}

export const titleScene: SceneDef<TitleProps> = {
  type: 'title',
  render(frame: Frame, props: TitleProps) {
    const { ctx, theme, t, dur, seed } = frame;
    const title = String(props.text ?? '').trim().toUpperCase();
    if (!title) return;

    const contentH = Math.max(0, CONTENT_BOTTOM - SAFE.y);
    const subLines = props.sub ? wrapSans(ctx, props.sub, SAFE.w, 42, 2) : [];
    const subH = subLines.length ? subLines.length * 52 : 0;
    const kickerText = String(props.kicker ?? '').trim().toUpperCase();
    const kickerFit = kickerText ? fitPixelSafe(kickerText, SAFE.w - 56, 1, [8, 7, 6, 5]) : { px: 8, lines: [] };
    const kicker = kickerFit.lines[0]?.replaceAll('*', '') ?? '';
    const kickerH = kicker ? pixelHeight(kickerFit.px) + kickerFit.px * 4 : 0;
    const kickerW = kicker ? pixelWidth(kicker, kickerFit.px) + kickerFit.px * 4 : 0;
    const hasIcon = Boolean(props.icon);
    const iconPx = 8;
    const iconH = hasIcon ? iconPx * 16 : 0;

    const pieces: { h: number; gap: number; kind: 'kicker' | 'icon' | 'title' | 'sub' }[] = [];
    if (kicker) pieces.push({ h: kickerH, gap: 24, kind: 'kicker' });
    if (hasIcon) pieces.push({ h: iconH, gap: 24, kind: 'icon' });
    const titleFit = fitPixelSafe(title, SAFE.w - 28, 4, [14, 12, 10, 8]);
    const titleGap = Math.max(12, titleFit.px * 1.5);
    const titleH = titleFit.lines.length * pixelHeight(titleFit.px) + Math.max(0, titleFit.lines.length - 1) * titleGap;
    pieces.push({ h: titleH, gap: 32, kind: 'title' });
    if (subH) pieces.push({ h: subH, gap: 0, kind: 'sub' });

    let contentTotal = pieces.reduce((sum, piece) => sum + piece.h, 0);
    for (let i = 0; i < pieces.length - 1; i++) contentTotal += pieces[i]!.gap;
    const top = SAFE.y + Math.max(0, (contentH - contentTotal) / 2);
    let y = top;
    const build = ease.outExpo(clamp(t / Math.min(0.25, Math.max(0.12, dur * 0.12))));
    for (const piece of pieces) {
      if (piece.kind === 'kicker') {
        tag(ctx, kicker, SAFE.cx - kickerW / 2, y, kickerFit.px, { bg: theme.fg, fg: theme.bg }, clamp(t / 0.16));
      } else if (piece.kind === 'icon' && props.icon) {
        const bob = Math.round(Math.sin(t * 4) * 3);
        icon(ctx, props.icon, SAFE.cx, y + iconH / 2 + bob, iconPx, theme.fg, ease.outExpo(clamp(t / 0.2)), seed);
      } else if (piece.kind === 'title') {
        pixelBlock(ctx, titleFit.lines, SAFE.cx, y, titleFit.px, {
          color: theme.fg, align: 'center', gap: titleGap, reveal: build,
          stagger: titleFit.lines.length > 1 ? 0.12 : 0, seed,
        });
        const markStart = dur * 0.38;
        const markProgress = ease.outExpo(clamp((t - markStart) / Math.max(0.12, dur * 0.08)));
        if (markProgress > 0) {
          titleFit.lines.forEach((line, lineIndex) => {
            const markY = y + lineIndex * (pixelHeight(titleFit.px) + titleGap);
            for (const run of markedRuns(line, titleFit.px)) {
              ctx.fillStyle = theme.accent;
              ctx.fillRect(run.x, markY, run.width * markProgress, pixelHeight(titleFit.px));
              if (markProgress >= 0.98) pixelText(ctx, run.text, run.x, markY, titleFit.px, { color: theme.onAccent });
            }
          });
        }
        const finalLine = titleFit.lines.at(-1) ?? '';
        const finalPlain = finalLine.replaceAll('*', '');
        const cursorX = SAFE.cx + pixelWidth(finalPlain, titleFit.px) / 2 + Math.max(4, titleFit.px / 2);
        cursor(ctx, cursorX, y + (titleFit.lines.length - 1) * (pixelHeight(titleFit.px) + titleGap), titleFit.px * 2, pixelHeight(titleFit.px), theme.accent, t);
      } else if (piece.kind === 'sub') {
        subLines.forEach((line, index) => text(ctx, line, SAFE.cx, y + index * 52 + 42, { size: 42, color: theme.dim, weight: 800, align: 'center' }));
      }
      y += piece.h + piece.gap;
    }
  },
};
