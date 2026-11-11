import { SAFE, ease, hash, prog, type Cue, type Frame, type SceneDef, type StatProps } from '../core.ts';
import { pixelBlock, pixelHeight, pixelText, pixelWidth, text, textWidth } from '../prim.ts';

interface StatTiming {
  start: number;
  count: number;
  countEnd: number;
  payoff: number;
  labelStart: number;
  labelDur: number;
  versusStart: number;
  versusDur: number;
}

interface NumberLayout {
  px: number;
  text: string;
  width: number;
}

function statTiming(dur: number): StatTiming {
  const start = Math.min(0.06, dur * 0.035);
  const count = Math.min(1.5, dur * 0.44);
  const countEnd = start + count;
  const payoff = Math.min(dur * 0.68, countEnd + Math.min(0.2, dur * 0.12));
  const labelStart = payoff + Math.min(0.05, dur * 0.04);
  const labelDur = Math.min(0.18, dur * 0.16);
  const versusStart = labelStart + labelDur + Math.min(0.06, dur * 0.05);
  const versusDur = Math.min(0.16, dur * 0.12);
  return { start, count, countEnd, payoff, labelStart, labelDur, versusStart, versusDur };
}

function formatNumber(value: number, decimals: number, compact = false): string {
  const safe = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: compact ? 0 : decimals,
    maximumFractionDigits: compact ? Math.min(3, decimals || 3) : decimals,
    notation: compact ? 'compact' : Math.abs(safe) >= 1e15 ? 'compact' : 'standard',
    maximumSignificantDigits: compact ? 4 : undefined,
  }).format(safe);
}

function largestNumber(value: number, prefix: string, suffix: string, decimals: number, maxHeight: number): NumberLayout {
  const candidates = [
    `${prefix}${formatNumber(value, decimals)}${suffix}`,
    `${prefix}${formatNumber(value, decimals, true)}${suffix}`,
    `${prefix}${Number.isFinite(value) ? value.toExponential(2) : '0'}${suffix}`,
  ];
  for (const candidate of candidates) {
    for (let px = 120; px >= 8; px--) {
      const width = pixelWidth(candidate, px);
      if (width <= SAFE.w - 16 && px * 7 <= maxHeight) return { px, text: candidate, width };
    }
  }
  const fallback = candidates.at(-1) ?? '0';
  const px = 8;
  return { px, text: fallback, width: Math.min(pixelWidth(fallback, px), SAFE.w - 16) };
}

function hardWrapPixel(raw: string, px: number, maxWidth: number, maxLines: number): string[] {
  const words = String(raw ?? '').trim().toUpperCase().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    if (pixelWidth(word, px) <= maxWidth) {
      const candidate = line ? `${line} ${word}` : word;
      if (pixelWidth(candidate, px) <= maxWidth) { line = candidate; continue; }
      if (line) lines.push(line);
      line = word;
      continue;
    }

    if (line) lines.push(line);
    line = '';
    let chunk = '';
    for (const char of [...word]) {
      if (chunk && pixelWidth(chunk + char, px) > maxWidth) {
        if (lines.length < maxLines - 1) lines.push(chunk);
        else line = chunk;
        chunk = char;
      } else chunk += char;
    }
    line = line ? `${line}${chunk}` : chunk;
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;

  const clipped = lines.slice(0, maxLines);
  let last = clipped[maxLines - 1] ?? '';
  while (last && pixelWidth(`${last}...`, px) > maxWidth) last = last.slice(0, -1);
  clipped[maxLines - 1] = `${last}...`;
  return clipped;
}

function fitLabel(raw: string, width: number): { px: number; lines: string[] } {
  raw = String(raw ?? '').trim() || 'STATISTIC';
  for (const px of [14, 12, 10, 9, 8]) {
    const lines = hardWrapPixel(raw, px, width, 2);
    if (lines.length <= 2 && lines.every(line => pixelWidth(line, px) <= width)) return { px, lines };
  }
  const px = 8;
  return { px, lines: hardWrapPixel(raw, px, width, 2) };
}

function wrapVersus(ctx: Frame['ctx'], line: string): { lines: string[]; size: number } {
  for (const size of [28, 26, 24, 22]) {
    const words = line.trim().split(/\s+/);
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (textWidth(ctx, next, size, 800) <= SAFE.w - 64) current = next;
      else if (current) { lines.push(current); current = word; }
      else current = word;
    }
    if (current) lines.push(current);
    if (lines.length <= 2 && lines.every(value => textWidth(ctx, value, size, 800) <= SAFE.w - 64)) return { lines, size };
  }
  return { lines: [line.slice(0, 48)], size: 22 };
}

function drawUnderline(
  ctx: Frame['ctx'],
  centerX: number,
  y: number,
  width: number,
  progress: number,
  color: Frame['theme']['accent'] | string,
) {
  const cellWidth = 12;
  const columns = Math.max(1, Math.floor(width / cellWidth));
  const visible = Math.ceil(columns * ease.outExpo(progress));
  ctx.fillStyle = color;
  for (let column = 0; column < visible; column++) {
    const x = centerX - (columns * cellWidth) / 2 + column * cellWidth;
    ctx.fillRect(x, y + (column % 3 === 1 ? 4 : 0), cellWidth - 4, 4);
  }
}

function drawDebris(ctx: Frame['ctx'], frame: Frame, x: number, y: number, width: number, height: number, age: number) {
  const life = Math.max(0, 1 - age / 0.82);
  if (life <= 0) return;

  const right = x + width;
  const bottom = y + height;
  ctx.save();
  for (let index = 0; index < 32; index++) {
    const seed = frame.seed + index * 13;
    const h = hash(seed, 19);
    const along = hash(seed, 77);
    const edge = index % 4;
    let originX: number;
    let originY: number;
    let vx: number;
    let vy: number;

    if (edge === 0) {
      originX = x - 8 - h * 28;
      originY = y + along * height;
      vx = -70 - h * 130;
      vy = -120 + along * 170;
    } else if (edge === 1) {
      originX = right + 8 + h * 28;
      originY = y + along * height;
      vx = 70 + h * 130;
      vy = -120 + along * 170;
    } else if (edge === 2) {
      originX = x + along * width;
      originY = y - 8 - h * 26;
      vx = (along - 0.5) * 190;
      vy = -110 - h * 120;
    } else {
      originX = x + along * width;
      originY = bottom + 8 + h * 24;
      vx = (along - 0.5) * 190;
      vy = 55 + h * 100;
    }

    const px = Math.round((originX + vx * age) / 4) * 4;
    const py = Math.round((originY + vy * age + 250 * age * age) / 4) * 4;
    ctx.globalAlpha = life * (0.58 + 0.42 * h);
    ctx.fillStyle = index % 5 === 0 ? frame.theme.accent : frame.theme.dim;
    const size = index % 4 === 0 ? 12 : 8;
    ctx.fillRect(px, py, size, size);
  }
  ctx.restore();
}
export const statScene: SceneDef<StatProps> = {
  type: 'stat',

  render(frame, props) {
    const { ctx, theme, t, dur } = frame;
    const timing = statTiming(dur);
    const value = Number.isFinite(props.value) ? props.value : 0;
    const from = Number.isFinite(props.from) ? Number(props.from) : 0;
    const decimals = Math.max(0, Math.min(6, Math.floor(props.decimals ?? 0)));
    const prefix = String(props.prefix ?? '');
    const suffix = String(props.suffix ?? '');
    const label = fitLabel(String(props.label ?? ''), SAFE.w - 48);
    const labelHeight = label.lines.length * (pixelHeight(label.px) + label.px * 1.8) - label.px * 1.8;
    const hasVersus = Boolean(props.versus);
    const versus = hasVersus
      ? wrapVersus(ctx, `VERSUS  ${formatNumber(Number(props.versus!.value) || 0, decimals)}  ${String(props.versus!.label ?? '')}`)
      : { lines: [], size: 0 };
    const versusHeight = versus.lines.length * (versus.size + 8);
    const fixedHeight = 28 + 10 + 26 + labelHeight + (hasVersus ? 22 + versusHeight : 0);
    const layout = largestNumber(value, prefix, suffix, decimals, 940 - fixedHeight);
    const countProgress = ease.outCubic(prog(t, timing.start, timing.count));
    const current = from + (value - from) * countProgress;
    const shown = t >= timing.countEnd ? layout.text : `${prefix}${formatNumber(current, decimals)}${suffix}`;
    const lineWidth = Math.min(SAFE.w - 20, Math.max(160, layout.width * 0.76));
    const totalHeight = pixelHeight(layout.px) + fixedHeight;
    const top = 740 - totalHeight / 2;
    const numberY = top;
    const underlineY = numberY + pixelHeight(layout.px) + 28;
    const labelY = underlineY + 26;
    const labelBottom = labelY + labelHeight;
    const versusY = labelBottom + 22;

    const assembled = ease.outExpo(prog(t, timing.start, timing.count));
    const age = Math.max(0, t - timing.payoff);
    const punch = t >= timing.payoff
      ? 1 + 0.11 * Math.exp(-age * 12) * Math.cos(age * 25)
      : 0.94 + 0.06 * ease.outBack(assembled);

    ctx.save();
    ctx.translate(SAFE.cx, numberY + pixelHeight(layout.px) / 2);
    ctx.scale(punch, punch);
    ctx.translate(-SAFE.cx, -(numberY + pixelHeight(layout.px) / 2));
    pixelText(ctx, shown, SAFE.cx, numberY, layout.px, {
      color: t >= timing.payoff ? theme.accent : theme.dim,
      align: 'center',
      reveal: assembled,
      mode: 'blocks',
      seed: frame.seed,
    });
    ctx.restore();

    const lineProgress = prog(t, timing.start + timing.count * 0.16, timing.payoff - timing.start - timing.count * 0.16);
    drawUnderline(ctx, SAFE.cx, underlineY, lineWidth, lineProgress, t >= timing.payoff ? theme.accent : theme.dim);
    if (t >= timing.payoff) {
      const glint = (age * 128) % lineWidth;
      ctx.fillStyle = theme.accent;
      ctx.fillRect(SAFE.cx - lineWidth / 2 + glint, underlineY - 2, 8, 8);
      drawDebris(ctx, frame, SAFE.cx - layout.width / 2, numberY, layout.width, pixelHeight(layout.px), age);
    }

    const labelProgress = ease.outBack(prog(t, timing.labelStart, timing.labelDur));
    pixelBlock(ctx, label.lines, SAFE.cx, labelY, label.px, {
      color: theme.fg,
      align: 'center',
      reveal: labelProgress,
      seed: frame.seed + 40,
      gap: label.px * 1.8,
    });

    if (hasVersus) {
      const versusProgress = ease.outExpo(prog(t, timing.versusStart, timing.versusDur));
      ctx.save();
      ctx.globalAlpha *= versusProgress;
      versus.lines.forEach((line, index) => {
        text(ctx, line.toUpperCase(), SAFE.cx, versusY + index * (versus.size + 8), {
          size: versus.size,
          weight: 800,
          color: theme.muted,
          align: 'center',
          baseline: 'top',
        });
      });
      ctx.restore();
    }
  },

  cues(props, dur) {
    const timing = statTiming(dur);
    const ticks = Math.min(10, Math.max(2, Math.floor(timing.count * 11)));
    const cues: Cue[] = [{ t: timing.start, kind: 'rise', len: timing.count }];
    for (let index = 0; index < ticks; index++) {
      cues.push({
        t: timing.start + (timing.count * (index + 1)) / ticks,
        kind: 'tick',
        step: (index + 1) / ticks,
      });
    }
    cues.push(
      { t: timing.payoff, kind: 'impact' },
      { t: timing.payoff, kind: 'shimmer' },
      { t: timing.labelStart, kind: 'pop', step: 0.7 },
    );
    if (props.versus) cues.push({ t: timing.versusStart, kind: 'pop', step: 1 });
    return cues.filter(cue => cue.t >= 0 && cue.t < dur);
  },
};
