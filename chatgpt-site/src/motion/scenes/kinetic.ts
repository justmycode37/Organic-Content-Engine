import {
  CONTENT_BOTTOM,
  SAFE,
  clamp,
  ease,
  hash,
  parseMarkup,
  type Cue,
  type Frame,
  type KineticProps,
  type SceneDef,
} from '../core.ts';
import { pixelBlock, pixelHeight, pixelText, pixelWidth, typeCell } from '../prim.ts';
import { typeMask } from '../pix.ts';

type Piece = { text: string; accent: boolean; spaceBefore: boolean };
type Layout = { px: number; lines: string[]; truncated: boolean; splitWord: boolean };
type MarkedRun = { text: string; x: number; y: number; width: number };

function serialize(pieces: Piece[]): string {
  return pieces.map((piece, index) => {
    const space = index > 0 && piece.spaceBefore ? ' ' : '';
    return space + (piece.accent ? '*' + piece.text + '*' : piece.text);
  }).join('');
}

function width(pieces: Piece[], px: number): number {
  return pixelWidth(serialize(pieces).replaceAll('*', ''), px);
}

function layoutAt(value: string, maxWidth: number, maxLines: number, px: number): Layout {
  const original = String(value ?? '');
  const raw = original.slice(0, 3000).toUpperCase();
  const source: Piece[] = [];
  let hasWord = false;
  let pendingSpace = false;
  let splitWord = false;

  for (const span of parseMarkup(raw)) {
    for (const part of span.text.match(/\s+|\S+/g) ?? []) {
      if (/^\s+$/.test(part)) {
        pendingSpace = hasWord;
        continue;
      }
      if ((part === '/' || part === '|') && source.length) {
        source[source.length - 1]!.text += ' ' + part;
        pendingSpace = true;
        continue;
      }

      let chunk = '';
      let firstChunk = true;
      for (const char of [...part]) {
        if (chunk && pixelWidth(chunk + char, px) > maxWidth) {
          splitWord = true;
          source.push({
            text: chunk,
            accent: span.accent,
            spaceBefore: hasWord && pendingSpace && firstChunk,
          });
          hasWord = true;
          firstChunk = false;
          pendingSpace = false;
          chunk = '';
        }
        chunk += char;
      }
      if (chunk) {
        source.push({
          text: chunk,
          accent: span.accent,
          spaceBefore: hasWord && pendingSpace && firstChunk,
        });
        hasWord = true;
        pendingSpace = false;
      }
    }
  }

  if (!source.length) {
    return { px, lines: [], truncated: original.length > raw.length, splitWord: false };
  }

  const rows: Piece[][] = [];
  let current: Piece[] = [];
  let truncated = original.length > raw.length;

  for (const piece of source) {
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

  return { px, lines: rows.map(serialize), truncated, splitWord };
}

function lineGap(px: number): number {
  return Math.max(16, Math.round(px * 0.55));
}

function fitText(value: string, maxWidth: number, maxLines: number): Layout {
  let fallback = layoutAt(value, maxWidth, maxLines, 12);
  const maxHeight = CONTENT_BOTTOM - SAFE.y - 64;
  let best: Layout | undefined;
  let bestScore = -Infinity;

  for (let px = 88; px >= 12; px--) {
    const result = layoutAt(value, maxWidth, maxLines, px);
    const height = result.lines.length * pixelHeight(px)
      + Math.max(0, result.lines.length - 1) * lineGap(px);
    fallback = result;

    if (
      !result.truncated
      && !result.splitWord
      && result.lines.length <= maxLines
      && height <= maxHeight
      && result.lines.every(line => pixelWidth(line.replaceAll('*', ''), px) <= maxWidth)
    ) {
      const score = px / (1 + Math.max(0, result.lines.length - 1) * 0.22);
      if (score > bestScore) {
        best = result;
        bestScore = score;
      }
    }
  }

  return best ?? fallback;
}

function markedRuns(line: string, cx: number, y: number, px: number): MarkedRun[] {
  const plain = line.replaceAll('*', '');
  const start = cx - pixelWidth(plain, px) / 2;
  const runs: MarkedRun[] = [];
  const pattern = /\*([^*]+)\*/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(line))) {
    const prefix = line.slice(0, match.index).replaceAll('*', '');
    const value = match[1] ?? '';
    runs.push({
      text: value,
      x: start + pixelWidth(prefix, px),
      y,
      width: pixelWidth(value, px),
    });
  }
  return runs;
}

function drawPixelAssembly(
  ctx: Frame['ctx'],
  line: string,
  cx: number,
  y: number,
  px: number,
  progress: number,
  seed: number,
  fg: string,
  accent: Frame['theme']['accent'],
) {
  const spans = parseMarkup(line);
  const plain = spans.map(span => span.text).join('');
  const cell = typeCell(px);
  const cap = Math.round(pixelHeight(px) / cell);
  let x = cx - pixelWidth(plain, px) / 2;

  spans.forEach((span, spanIndex) => {
    const mask = typeMask(span.text, cap);
    if (!mask) {
      pixelText(ctx, line, cx, y, px, { color: fg, accent, reveal: ease.outExpo(progress), seed });
      return;
    }

    ctx.save();
    ctx.fillStyle = span.accent ? accent : fg;
    const salt = seed + spanIndex * 101;
    for (let row = 0; row < mask.rows; row++) {
      for (let col = 0; col < mask.cols; col++) {
        if (mask.bits[row * mask.cols + col] !== 1) continue;

        const delay = hash(col + salt * 7, row + salt * 13) * 0.36;
        const local = clamp((progress - delay) / (1 - delay));
        const settle = ease.outCubic(local);
        const dx = (hash(row + salt * 19, col + salt * 3) - 0.5) * 240;
        const dy = (hash(col + salt * 11, row + salt * 23) - 0.5) * 180;
        const targetX = x + col * cell;
        const targetY = y + row * cell;

        ctx.fillRect(
          Math.round((targetX + dx * (1 - settle)) / cell) * cell,
          Math.round((targetY + dy * (1 - settle)) / cell) * cell,
          cell,
          cell,
        );
      }
    }
    ctx.restore();
    x += mask.cols * cell;
  });
}

function drawLines(
  ctx: Frame['ctx'],
  lines: string[],
  cx: number,
  blockY: number,
  px: number,
  theme: Frame['theme'],
  seed: number,
) {
  const gap = lineGap(px);
  lines.forEach((line, index) => {
    pixelBlock(ctx, [line], cx, blockY + index * (pixelHeight(px) + gap), px, {
      color: theme.fg,
      accent: theme.accent,
      align: 'center',
      gap: 0,
      seed: seed + index * 37,
    });
  });
}

function drawAccentTrail(
  ctx: Frame['ctx'],
  line: string,
  cx: number,
  y: number,
  px: number,
  time: number,
  seed: number,
  accent: Frame['theme']['accent'],
) {
  const runs = markedRuns(line, cx, y, px).slice(0, 3);
  const cell = typeCell(px);

  runs.forEach((run, runIndex) => {
    for (let i = 0; i < 8; i++) {
      const salt = seed + runIndex * 71 + i * 19;
      const phase = (time * 1.35 + hash(i, salt)) % 1;
      const fade = 1 - phase;
      const x = run.x + run.width * (0.25 + hash(salt, i + 11) * 0.65) - phase * 24;
      const cy = run.y - cell - 8 - phase * 36 + Math.sin((phase + i) * Math.PI) * 8;
      const size = i % 3 === 0 ? cell * 2 : cell;

      ctx.save();
      ctx.globalAlpha *= fade * 0.82;
      ctx.fillStyle = accent;
      ctx.fillRect(
        Math.round(x / cell) * cell,
        Math.round(cy / cell) * cell,
        size,
        size,
      );
      ctx.restore();
    }
  });
}

function entranceDuration(beat: number): number {
  return Math.min(0.34, Math.max(0.14, beat * 0.28));
}

export const kineticScene: SceneDef<KineticProps> = {
  type: 'kinetic',

  render(frame: Frame, props: KineticProps) {
    const { ctx, theme, t, dur, seed } = frame;
    const words = (props.words ?? [])
      .map(word => String(word ?? '').trim())
      .filter(Boolean)
      .slice(0, 12);
    if (!words.length) return;

    const beat = dur / words.length;
    const index = Math.min(words.length - 1, Math.floor(Math.max(0, t) / beat));
    const start = index * beat;
    const enterDuration = entranceDuration(beat);
    const local = clamp((t - start) / enterDuration);
    const content = words[index]!.slice(0, 3000).toUpperCase();
    const fit = fitText(content, SAFE.w, 3);
    const gap = lineGap(fit.px);
    const blockHeight = fit.lines.length * pixelHeight(fit.px)
      + Math.max(0, fit.lines.length - 1) * gap;
    const blockY = 740 - blockHeight / 2;
    const method = index % 3;
    const entrance = ease.outBack(local);

    ctx.save();
    ctx.beginPath();
    ctx.rect(SAFE.x, SAFE.y, SAFE.w, CONTENT_BOTTOM - SAFE.y);
    ctx.clip();

    if (method === 0) {
      const idle = local >= 1 ? 1 + Math.sin(t * 5.2) * 0.012 : 1;
      const scale = (0.46 + 0.54 * entrance) * idle;
      ctx.translate(SAFE.cx, 740);
      ctx.scale(scale, scale);
      ctx.translate(-SAFE.cx, -740);
      drawLines(ctx, fit.lines, SAFE.cx, blockY, fit.px, theme, seed + index * 73);
      fit.lines.forEach((line, lineIndex) => {
        drawAccentTrail(
          ctx,
          line,
          SAFE.cx,
          blockY + lineIndex * (pixelHeight(fit.px) + gap),
          fit.px,
          t,
          seed + index * 73 + lineIndex,
          theme.accent,
        );
      });
    } else if (method === 1) {
      const assembly = ease.outCubic(local);
      fit.lines.forEach((line, lineIndex) => {
        const y = blockY + lineIndex * (pixelHeight(fit.px) + gap);
        drawPixelAssembly(ctx, line, SAFE.cx, y, fit.px, assembly, seed + index * 97 + lineIndex * 31, theme.fg, theme.accent);
        drawAccentTrail(ctx, line, SAFE.cx, y, fit.px, t, seed + index * 97 + lineIndex, theme.accent);
      });
    } else {
      const split = clamp(1 - entrance, -0.04, 1) * SAFE.w * 0.42;
      ctx.save();
      ctx.beginPath();
      ctx.rect(SAFE.x, SAFE.y, SAFE.cx - SAFE.x, CONTENT_BOTTOM - SAFE.y);
      ctx.clip();
      ctx.translate(-split, 0);
      drawLines(ctx, fit.lines, SAFE.cx, blockY, fit.px, theme, seed + index * 113);
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.rect(SAFE.cx, SAFE.y, SAFE.right - SAFE.cx, CONTENT_BOTTOM - SAFE.y);
      ctx.clip();
      ctx.translate(split, 0);
      drawLines(ctx, fit.lines, SAFE.cx, blockY, fit.px, theme, seed + index * 113);
      ctx.restore();

      fit.lines.forEach((line, lineIndex) => {
        drawAccentTrail(
          ctx,
          line,
          SAFE.cx,
          blockY + lineIndex * (pixelHeight(fit.px) + gap),
          fit.px,
          t,
          seed + index * 113 + lineIndex,
          theme.accent,
        );
      });
    }

    ctx.restore();
  },

  cues(props: KineticProps, dur: number): Cue[] {
    const words = (props.words ?? [])
      .map(word => String(word ?? '').trim())
      .filter(Boolean)
      .slice(0, 12);
    if (!words.length || dur <= 0) return [];

    const beat = dur / words.length;
    const enterDuration = entranceDuration(beat);
    const cues = words.flatMap((word, index) => {
      const start = index * beat;
      const end = start + enterDuration;
      const marked = parseMarkup(word).some(span => span.accent);
      return [
        { t: start, kind: 'rise' as const, len: enterDuration, step: words.length > 1 ? index / (words.length - 1) : 0 },
        { t: end, kind: 'impact' as const, step: words.length > 1 ? index / (words.length - 1) : 0 },
        ...(marked ? [{ t: end + 0.025, kind: 'shimmer' as const }] : []),
      ].filter(cue => cue.t >= 0 && cue.t < dur);
    });

    return cues;
  },
};
