import { SAFE, ease, prog, type CompareProps, type Cue, type Frame, type SceneDef } from '../core.ts';
import { panel, pixelBlock, pixelHeight, pixelText, pixelWidth, text, textWidth } from '../prim.ts';
import { dither } from '../pix.ts';

const CARD = { width: 380, height: 700, y: 390 } as const;
const CARD_X = [120, 580] as const;
const MAX_POINTS = 4;
const POINT_SIZE = 40;

interface CompareTiming {
  cardIn: number;
  pointStart: number;
  pointGap: number;
  pointDur: number;
  verdict: number;
  verdictDur: number;
  cardStarts: [number, number];
}

interface CardProps {
  label: string;
  points: string[];
}

function compareTiming(dur: number, pointCount: number): CompareTiming {
  const cardIn = Math.min(0.36, dur * 0.18);
  const pointStart = Math.min(0.28, dur * 0.16);
  const pointGap = Math.min(0.09, dur * 0.06);
  const pointDur = Math.min(0.2, dur * 0.16);
  const pointEnd = pointStart + Math.max(0, pointCount - 1) * pointGap + pointDur;
  const verdict = Math.min(dur * 0.64, Math.max(pointEnd + Math.min(0.18, dur * 0.12), dur * 0.34));
  return {
    cardIn,
    pointStart,
    pointGap,
    pointDur,
    verdict,
    verdictDur: Math.min(0.28, dur * 0.2),
    cardStarts: [0, Math.min(0.06, dur * 0.04)],
  };
}

function safeCard(input: Partial<CardProps> | undefined, fallback: string): CardProps {
  const points = Array.isArray(input?.points)
    ? input.points.slice(0, MAX_POINTS).map(point => String(point ?? '').trim()).filter(Boolean)
    : [];
  return { label: String(input?.label ?? fallback), points };
}

function hardWrapBody(ctx: Frame['ctx'], raw: string, width: number, size: number, maxLines = 2): string[] {
  const words = String(raw ?? '').replaceAll('*', '').trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (textWidth(ctx, word, size, 800) <= width) {
      const candidate = current ? `${current} ${word}` : word;
      if (textWidth(ctx, candidate, size, 800) <= width) { current = candidate; continue; }
      if (current) lines.push(current);
      current = word;
      continue;
    }

    if (current) lines.push(current);
    current = '';
    let chunk = '';
    for (const char of [...word]) {
      if (chunk && textWidth(ctx, chunk + char, size, 800) > width) {
        if (lines.length < maxLines - 1) lines.push(chunk);
        else current = chunk;
        chunk = char;
      } else chunk += char;
    }
    current = current ? `${current}${chunk}` : chunk;
  }
  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines;

  const clipped = lines.slice(0, maxLines);
  let last = clipped[maxLines - 1] ?? '';
  while (last && textWidth(ctx, `${last}...`, size, 800) > width) last = last.slice(0, -1);
  clipped[maxLines - 1] = `${last}...`;
  return clipped;
}

function wrapCardLabel(raw: string, width: number): { px: number; lines: string[] } {
  const source = String(raw ?? '').trim().toUpperCase().replace(/\s+/g, ' ') || '—';
  for (const px of [10, 9, 8, 7, 6]) {
    const words = source.split(' ');
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (pixelWidth(candidate, px) <= width) current = candidate;
      else if (current) { lines.push(current); current = word; }
      else current = word;
    }
    if (current) lines.push(current);
    if (lines.length <= 2 && lines.every(line => pixelWidth(line, px) <= width)) return { px, lines };
  }
  const px = 8;
  let value = source;
  while (value.length > 1 && pixelWidth(`${value.slice(0, -1)}...`, px) > width) value = value.slice(0, -1);
  return { px, lines: [`${value}...`] };
}

function drawTexture(ctx: Frame['ctx'], theme: Frame['theme'], x: number, y: number) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 4, y + 4, CARD.width - 8, CARD.height - 8);
  ctx.clip();
  ctx.globalAlpha = theme.mode === 'dark' ? 0.2 : 0.12;
  dither(ctx, x + 8, y + 8, CARD.width - 16, CARD.height - 16, theme.line,
    (u, v) => 0.08 + 0.1 * (1 - v) + 0.025 * Math.sin(u * Math.PI * 8), 4);
  ctx.restore();
}

function drawPixelBullet(ctx: Frame['ctx'], x: number, y: number, color: Frame['theme']['accent'] | string) {
  ctx.fillStyle = color;
  ctx.fillRect(x + 4, y, 8, 8);
  ctx.fillRect(x, y + 8, 8, 8);
  ctx.fillRect(x + 8, y + 8, 8, 8);
  ctx.fillRect(x + 4, y + 16, 8, 4);
}

function cardPoints(input: CardProps): string[] {
  return input.points.slice(0, MAX_POINTS);
}

function drawCard(
  frame: Frame,
  card: CardProps,
  side: 0 | 1,
  winner: 0 | 1,
  timing: CompareTiming,
) {
  const { ctx, theme, t } = frame;
  const cardStart = timing.cardStarts[side];
  const entrance = ease.outBack(prog(t, cardStart, timing.cardIn));
  if (entrance <= 0) return;

  const verdictProgress = ease.outBack(prog(t, timing.verdict, timing.verdictDur));
  const won = side === winner;
  const decided = t >= timing.verdict;
  const idle = Math.max(0, t - timing.verdict);
  const breathe = decided && won ? Math.sin(idle * 2.2) * 4 : 0;
  const lift = decided ? (won ? -34 * verdictProgress + breathe : 18 * verdictProgress) : 0;
  const opacity = decided && !won ? 1 - 0.45 * verdictProgress : 1;
  const scale = 0.965 + 0.035 * Math.min(1, entrance);
  const x = CARD_X[side] + (side === 0 ? -52 : 52) * (1 - entrance);
  const y = CARD.y + (1 - entrance) * 20 + lift;
  const centerX = CARD_X[side] + CARD.width / 2;
  const centerY = CARD.y + CARD.height / 2;
  const label = wrapCardLabel(card.label, CARD.width - 72);
  const headerHeight = label.lines.length * (pixelHeight(label.px) + label.px * 1.1) - label.px * 1.1;
  const points = cardPoints(card);
  const pointTop = 56 + headerHeight + 28;
  const pointBottom = CARD.height - 34;
  const rowHeight = points.length ? Math.max(0, pointBottom - pointTop) / points.length : 0;
  const verdictFill = decided && won;

  ctx.save();
  ctx.globalAlpha *= Math.max(0, opacity * Math.min(1, entrance));
  ctx.translate(centerX, centerY);
  ctx.scale(scale, scale);
  ctx.translate(-centerX, -centerY);

  panel(ctx, x, y, CARD.width, CARD.height, {
    fill: theme.panel,
    stroke: verdictFill ? theme.accent : theme.line,
    lineWidth: verdictFill ? 8 : 4,
    notch: 16,
  });
  drawTexture(ctx, theme, x, y);

  ctx.fillStyle = theme.panelAlt;
  ctx.fillRect(x + 20, y + 20, CARD.width - 40, 4);
  ctx.fillStyle = theme.line;
  ctx.fillRect(x + 20, y + 30, CARD.width - 40, 2);

  const scanY = y + 64 + ((t * 46 + side * 31) % (CARD.height - 128));
  ctx.globalAlpha *= 0.42;
  ctx.fillStyle = theme.line;
  ctx.fillRect(x + 20, scanY, CARD.width - 40, 4);
  ctx.globalAlpha /= 0.42;

  pixelBlock(ctx, label.lines, x + CARD.width / 2, y + 54, label.px, {
    color: verdictFill ? theme.accent : theme.fg,
    align: 'center',
    gap: label.px * 1.1,
    reveal: ease.outExpo(prog(t, cardStart + 0.04, Math.min(0.2, timing.cardIn * 0.7))),
    seed: frame.seed + side * 41,
  });

  const dividerY = y + 54 + headerHeight + 28;
  for (let xOffset = 28; xOffset < CARD.width - 28; xOffset += 16) {
    ctx.fillStyle = xOffset % 3 === 0 ? theme.dim : theme.line;
    ctx.fillRect(x + xOffset, dividerY, 8, 4);
  }

  points.forEach((point, index) => {
    const rowStart = cardStart + timing.pointStart + index * timing.pointGap;
    const reveal = ease.outBack(prog(t, rowStart, timing.pointDur));
    if (reveal <= 0) return;

    const rowY = y + pointTop + index * rowHeight;
    const pointLines = hardWrapBody(ctx, point, CARD.width - 112, POINT_SIZE, 2);
    const slideX = (1 - reveal) * (side === 0 ? -22 : 22);
    ctx.save();
    ctx.globalAlpha *= Math.min(1, reveal);
    drawPixelBullet(ctx, x + 32 + slideX, rowY + 12, verdictFill ? theme.accent : theme.dim);
    pointLines.forEach((line, lineIndex) => {
      text(ctx, line, x + 68 + slideX, rowY + lineIndex * (POINT_SIZE + 8), {
        size: POINT_SIZE,
        weight: 800,
        color: decided && !won ? theme.muted : theme.fg,
        baseline: 'top',
      });
    });
    ctx.restore();

    if (index < points.length - 1) {
      ctx.fillStyle = theme.line;
      for (let offset = 0; offset < CARD.width - 72; offset += 16) {
        ctx.fillRect(x + 36 + offset, rowY + rowHeight - 8, 8, 2);
      }
    }
  });

  if (verdictFill) {
    ctx.fillStyle = theme.accent;
    ctx.fillRect(x + CARD.width - 36, y + 46, 8, 8);
    ctx.fillRect(x + CARD.width - 24, y + 46, 8, 8);
  }
  ctx.restore();
}

function drawTitle(frame: Frame, title: string) {
  if (!title.trim()) return;
  const source = title.trim().toUpperCase().replace(/\s+/g, ' ');
  const maxWidth = SAFE.w - 120;
  let fitted = source;
  let px = 8;
  let fits = false;

  for (const size of [10, 9, 8, 7, 6]) {
    if (pixelWidth(source, size) <= maxWidth) {
      px = size;
      fits = true;
      break;
    }
  }
  if (!fits) {
    px = 6;
    while (fitted.length > 1 && pixelWidth(`${fitted}...`, px) > maxWidth) fitted = fitted.slice(0, -1);
    fitted = `${fitted}...`;
  }

  pixelBlock(frame.ctx, [fitted], SAFE.cx, 250, px, {
    color: frame.theme.fg,
    align: 'center',
    reveal: ease.outBack(prog(frame.t, 0, 0.22)),
    seed: frame.seed + 100,
  });
}
export const compareScene: SceneDef<CompareProps> = {
  type: 'compare',

  render(frame, props) {
    const left = safeCard(props.left, 'LEFT');
    const right = safeCard(props.right, 'RIGHT');
    const winner: 0 | 1 = props.winner === 'right' ? 1 : 0;
    const pointCount = Math.max(left.points.length, right.points.length);
    const timing = compareTiming(frame.dur, pointCount);

    drawTitle(frame, String(props.title ?? ''));
    drawCard(frame, left, 0, winner, timing);
    drawCard(frame, right, 1, winner, timing);

    const chipY = CARD.y + CARD.height / 2 - 30;
    const reveal = ease.outBack(prog(frame.t, 0.08, Math.min(0.24, frame.dur * 0.2)));
    if (reveal > 0) {
      const chipSize = 72;
      frame.ctx.save();
      frame.ctx.globalAlpha *= Math.min(1, reveal);
      frame.ctx.translate(SAFE.cx, chipY + chipSize / 2);
      frame.ctx.scale(0.8 + 0.2 * reveal, 0.8 + 0.2 * reveal);
      frame.ctx.translate(-SAFE.cx, -(chipY + chipSize / 2));
      panel(frame.ctx, SAFE.cx - chipSize / 2, chipY, chipSize, chipSize, {
        fill: frame.theme.panelAlt,
        stroke: frame.theme.line,
        lineWidth: 4,
        notch: 8,
      });
      pixelText(frame.ctx, 'VS', SAFE.cx, chipY + 15, 6, {
        color: frame.theme.dim,
        align: 'center',
      });
      frame.ctx.restore();
    }
  },

  cues(props, dur) {
    const left = safeCard(props.left, 'LEFT');
    const right = safeCard(props.right, 'RIGHT');
    const pointCount = Math.max(left.points.length, right.points.length);
    const timing = compareTiming(dur, pointCount);
    const cues: Cue[] = [{ t: 0, kind: 'rise', len: Math.min(dur, timing.pointStart + pointCount * timing.pointGap) }];
    cues.push(
      { t: timing.cardStarts[0], kind: 'pop', step: 0 },
      { t: timing.cardStarts[1], kind: 'pop', step: 0.2 },
      { t: 0.08, kind: 'pop', step: 0.3 },
    );
    for (let index = 0; index < pointCount; index++) {
      const step = pointCount > 1 ? index / (pointCount - 1) : 0.5;
      cues.push({ t: timing.cardStarts[0] + timing.pointStart + index * timing.pointGap, kind: 'pop', step });
      cues.push({ t: timing.cardStarts[1] + timing.pointStart + index * timing.pointGap, kind: 'pop', step: Math.min(1, step + 0.08) });
    }
    cues.push(
      { t: timing.verdict, kind: 'rise', len: timing.verdictDur },
      { t: timing.verdict, kind: 'impact' },
      { t: timing.verdict + timing.verdictDur + 0.02, kind: 'shimmer' },
    );
    return cues.filter(cue => cue.t >= 0 && cue.t < dur).slice(0, 24);
  },
};
