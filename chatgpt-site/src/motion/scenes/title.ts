import {
  CONTENT_BOTTOM,
  SAFE,
  clamp,
  ease,
  hash,
  parseMarkup,
  type Cue,
  type Frame,
  type SceneDef,
  type TitleProps,
} from '../core.ts';
import { icon3d } from '../icon3d.ts';
import { pixelBlock, pixelHeight, pixelText, pixelWidth, tag, text, textWidth, typeCell } from '../prim.ts';
import { typeMask } from '../pix.ts';

type PixelPiece = { text: string; accent: boolean; spaceBefore: boolean };
type PixelFit = { px: number; lines: string[] };
type MarkedRun = { text: string; x: number; y: number; width: number };

type TitleTiming = {
  kickerDuration: number;
  iconStart: number;
  iconDuration: number;
  titleStart: number;
  titleDuration: number;
  accentStart: number;
  accentDuration: number;
  subStart: number;
};

function lineText(pieces: PixelPiece[]): string {
  return pieces.map((piece, index) => {
    const space = index > 0 && piece.spaceBefore ? ' ' : '';
    return space + (piece.accent ? '*' + piece.text + '*' : piece.text);
  }).join('');
}

function lineWidth(pieces: PixelPiece[], px: number): number {
  return pixelWidth(lineText(pieces).replaceAll('*', ''), px);
}

function pixelLinesAtSize(
  value: string,
  maxWidth: number,
  maxLines: number,
  px: number,
): { lines: string[]; truncated: boolean } {
  const original = String(value ?? '');
  const raw = original.slice(0, 4000).toUpperCase();
  const source: PixelPiece[] = [];
  let hasWord = false;
  let pendingSpace = false;

  for (const span of parseMarkup(raw)) {
    for (const part of span.text.match(/\s+|\S+/g) ?? []) {
      if (/^\s+$/.test(part)) {
        pendingSpace = hasWord;
        continue;
      }

      let chunk = '';
      let firstChunk = true;
      for (const char of [...part]) {
        if (chunk && pixelWidth(chunk + char, px) > maxWidth) {
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

  if (!source.length) return { lines: [], truncated: original.length > raw.length };

  const rows: PixelPiece[][] = [];
  let current: PixelPiece[] = [];
  let truncated = original.length > raw.length;

  for (const piece of source) {
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
  if (truncated && rows.length) {
    const last = rows[rows.length - 1]!;
    const ellipsis: PixelPiece = { text: '...', accent: false, spaceBefore: last.length > 0 };
    while (last.length && lineWidth([...last, ellipsis], px) > maxWidth) last.pop();
    if (pixelWidth('...', px) <= maxWidth) last.push(ellipsis);
  }

  return { lines: rows.map(lineText), truncated };
}

function fitPixelSafe(
  value: string,
  maxWidth: number,
  maxLines: number,
  maxHeight: number,
  sizes: number[],
  lineGap: (px: number) => number,
): PixelFit {
  let fallback = { px: sizes.at(-1) ?? 12, lines: [] as string[] };

  for (const px of sizes) {
    const result = pixelLinesAtSize(value, maxWidth, maxLines, px);
    const height = result.lines.length * pixelHeight(px)
      + Math.max(0, result.lines.length - 1) * lineGap(px);
    fallback = { px, lines: result.lines };

    if (
      !result.truncated
      && result.lines.length <= maxLines
      && height <= maxHeight
      && result.lines.every(line => pixelWidth(line.replaceAll('*', ''), px) <= maxWidth)
    ) return fallback;
  }

  return fallback;
}

function wrapSans(
  ctx: Frame['ctx'],
  value: string,
  maxWidth: number,
  size: number,
  maxLines: number,
): string[] {
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
    const candidate = line ? line + ' ' + token : token;
    if (!line || textWidth(ctx, candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }

    lines.push(line);
    if (lines.length >= maxLines) {
      truncated = true;
      line = '';
      break;
    }
    line = token;
  }

  if (line && lines.length < maxLines) lines.push(line);
  if (truncated && lines.length) {
    let last = lines[lines.length - 1]!;
    while (last && textWidth(ctx, last + '...', size) > maxWidth) last = last.slice(0, -1).trimEnd();
    lines[lines.length - 1] = last + '...';
  }
  return lines;
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

function drawAccentAssembly(
  ctx: Frame['ctx'],
  run: MarkedRun,
  px: number,
  progress: number,
  seed: number,
  paint: Frame['theme']['accent'],
) {
  if (progress <= 0) return;

  const cell = typeCell(px);
  const cap = Math.round(pixelHeight(px) / cell);
  const mask = typeMask(run.text, cap);
  if (!mask) {
    pixelText(ctx, run.text, run.x, run.y, px, { color: paint });
    return;
  }

  ctx.save();
  ctx.fillStyle = paint;
  const salt = seed * 37;
  for (let row = 0; row < mask.rows; row++) {
    for (let col = 0; col < mask.cols; col++) {
      if (mask.bits[row * mask.cols + col] !== 1) continue;

      const order = clamp((col + row * 0.28) / Math.max(1, mask.cols + mask.rows * 0.28));
      const local = clamp((progress - order * 0.62) / 0.38);
      const settle = ease.outBack(local);
      const targetX = run.x + col * cell;
      const targetY = run.y + row * cell;
      const dx = (hash(col + salt, row + seed * 53) - 0.5) * 104;
      const dy = 36 + hash(row + salt * 2, col + seed * 19) * 72;

      ctx.fillRect(
        Math.round((targetX + dx * (1 - settle)) / cell) * cell,
        Math.round((targetY + dy * (1 - settle)) / cell) * cell,
        cell,
        cell,
      );
    }
  }
  ctx.restore();
}

function timing(props: TitleProps, dur: number): TitleTiming {
  const kickerDuration = Math.min(0.22, Math.max(0.16, dur * 0.08));
  const iconStart = props.kicker ? kickerDuration + 0.03 : 0.04;
  const iconDuration = Math.min(0.34, Math.max(0.18, dur * 0.1));
  const titleStart = props.icon
    ? iconStart + iconDuration * 0.75
    : props.kicker ? kickerDuration * 0.75 : 0.03;
  const titleDuration = Math.min(0.38, Math.max(0.16, dur * 0.14));
  const accentStart = Math.min(dur * 0.42, titleStart + titleDuration * 0.85);
  const accentDuration = Math.min(0.42, Math.max(0.16, dur * 0.14));
  const subStart = Math.min(dur * 0.75, accentStart + accentDuration + 0.08);

  return {
    kickerDuration,
    iconStart,
    iconDuration,
    titleStart,
    titleDuration,
    accentStart,
    accentDuration,
    subStart,
  };
}

export const titleScene: SceneDef<TitleProps> = {
  type: 'title',

  render(frame: Frame, props: TitleProps) {
    const { ctx, theme, t, dur, seed } = frame;
    const title = String(props.text ?? '').trim().toUpperCase();
    if (!title) return;

    const contentHeight = CONTENT_BOTTOM - SAFE.y;
    const kickerText = String(props.kicker ?? '').trim().toUpperCase();
    const kickerFit = kickerText
      ? fitPixelSafe(kickerText, SAFE.w - 56, 1, 200, [8, 7, 6, 5], () => 0)
      : { px: 8, lines: [] };
    const kicker = kickerFit.lines[0]?.replaceAll('*', '') ?? '';
    const kickerHeight = kicker
      ? pixelHeight(kickerFit.px) + kickerFit.px * 4
      : 0;
    const kickerWidth = kicker
      ? pixelWidth(kicker, kickerFit.px) + kickerFit.px * 4
      : 0;

    const hasIcon = Boolean(props.icon);
    const iconHeight = hasIcon ? 312 : 0;
    const subLines = props.sub ? wrapSans(ctx, props.sub, SAFE.w, 44, 2) : [];
    const subLineHeight = 50;
    const subHeight = subLines.length * subLineHeight;
    const fixedHeight = kickerHeight + iconHeight + subHeight;
    const fixedGaps = (kicker ? 36 : 0) + (hasIcon ? 36 : 0) + (subHeight ? 30 : 0);
    const titleGapFor = (px: number) => Math.max(16, Math.round(px * 1.5));
    const titleFit = fitPixelSafe(
      title,
      SAFE.w - 32,
      4,
      contentHeight - fixedHeight - fixedGaps,
      [20, 18, 16, 14, 12],
      titleGapFor,
    );
    const titleGap = titleGapFor(titleFit.px);
    const titleHeight = titleFit.lines.length * pixelHeight(titleFit.px)
      + Math.max(0, titleFit.lines.length - 1) * titleGap;
    const contentTotal = fixedHeight + fixedGaps + titleHeight;
    const top = SAFE.y + Math.max(0, (contentHeight - contentTotal) / 2);
    const times = timing(props, dur);

    let y = top;
    if (kicker) {
      const progress = clamp((t / times.kickerDuration));
      tag(ctx, kicker, SAFE.cx - kickerWidth / 2, y, kickerFit.px, {
        bg: theme.fg,
        fg: theme.bg,
      }, progress);
      y += kickerHeight + 36;
    }

    if (hasIcon && props.icon) {
      const progress = ease.outExpo((t - times.iconStart) / times.iconDuration);
      const bob = Math.round(Math.sin(t * 3.4) * 4);
      icon3d(
        ctx,
        theme,
        props.icon,
        SAFE.cx,
        y + iconHeight / 2 + bob,
        300,
        { yaw: t * 1.35, pitch: 0.34, accent: false, reveal: progress, seed },
      );
      y += iconHeight + 36;
    }

    const titleY = y;
    const titleProgress = ease.outBack((t - times.titleStart) / times.titleDuration);
    const titleReveal = ease.outExpo((t - times.titleStart) / (times.titleDuration * 0.78));
    const titleScale = 0.82 + 0.18 * titleProgress;
    const titleCenterY = titleY + titleHeight / 2;

    ctx.save();
    ctx.translate(SAFE.cx, titleCenterY);
    ctx.scale(titleScale, titleScale);
    ctx.translate(-SAFE.cx, -titleCenterY);
    pixelBlock(
      ctx,
      titleFit.lines.map(line => line.replaceAll('*', '')),
      SAFE.cx,
      titleY,
      titleFit.px,
      {
        color: theme.fg,
        align: 'center',
        gap: titleGap,
        reveal: titleReveal,
        stagger: titleFit.lines.length > 1 ? 0.08 : 0,
        seed,
      },
    );

    titleFit.lines.forEach((line, lineIndex) => {
      const lineY = titleY + lineIndex * (pixelHeight(titleFit.px) + titleGap);
      for (const run of markedRuns(line, SAFE.cx, lineY, titleFit.px)) {
        const progress = clamp((t - times.accentStart) / times.accentDuration);
        drawAccentAssembly(ctx, run, titleFit.px, progress, seed + lineIndex * 17, theme.accent);
      }
    });
    ctx.restore();

    if (subLines.length) {
      subLines.forEach((line, index) => {
        const progress = ease.outExpo((t - times.subStart - index * 0.045) / 0.2);
        text(ctx, line, SAFE.cx, y + titleHeight + 30 + index * subLineHeight + 44, {
          size: 44,
          color: theme.dim,
          weight: 800,
          align: 'center',
          alpha: progress,
        });
      });
    }
  },

  cues(props: TitleProps, dur: number): Cue[] {
    if (!String(props.text ?? '').trim() || dur <= 0) return [];
    const times = timing(props, dur);
    const cues: Cue[] = [
      { t: 0, kind: 'rise', len: Math.min(0.18, times.titleStart) },
      { t: times.titleStart, kind: 'type', len: times.titleDuration },
      {
        t: times.accentStart + times.accentDuration,
        kind: 'impact',
      },
      {
        t: times.accentStart + times.accentDuration + 0.025,
        kind: 'shimmer',
      },
    ];

    if (props.kicker) cues.push({ t: 0, kind: 'pop' });
    if (props.icon) cues.push({ t: times.iconStart, kind: 'swish' });
    if (props.sub) cues.push({ t: times.subStart, kind: 'pop' });

    return cues.filter(cue => cue.t >= 0 && cue.t < dur);
  },
};
