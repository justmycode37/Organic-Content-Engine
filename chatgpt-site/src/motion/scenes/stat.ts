import { SAFE, ease, prog, type Frame, type StatProps, type SceneDef } from '../core.ts';
import { blocks, fitPixel, pixelBlock, pixelHeight, pixelText, pixelWidth, pop } from '../prim.ts';

const numberString = (value: number, decimals: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    .format(Number.isFinite(value) ? value : 0);

const compactNumber = (value: number) => {
  const abs = Math.abs(value);
  if (abs >= 1e15) return value.toExponential(1).replace('e', 'E');
  const unit = abs >= 1e9 ? 'B' : 'M';
  const divisor = unit === 'B' ? 1e9 : 1e6;
  const rounded = Math.round(abs / divisor);
  return `${value < 0 ? '-' : ''}${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(rounded)}${unit}`;
};

const formatCount = (value: number, decimals: number, compact: boolean) => {
  const safe = Number.isFinite(value) ? value : 0;
  if (compact && Math.abs(safe) >= 1e6) return compactNumber(safe);
  if (Math.abs(safe) >= 1e15) return safe.toExponential(Math.min(decimals, 2)).replace('e', 'E');
  return numberString(safe, decimals);
};

const affixCount = (formatted: string, prefix: string, suffix: string) =>
  formatted.startsWith('-')
    ? `-${prefix}${formatted.slice(1)}${suffix}`
    : `${prefix}${formatted}${suffix}`;

function safePixelLines(value: string, px: number, maxWidth: number): string[] {
  const words = String(value ?? '').toUpperCase().trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  const width = (input: string) => pixelWidth(input.replaceAll('*', ''), px);

  for (const word of words) {
    const chunks: string[] = [];
    let chunk = '';
    for (const char of [...word]) {
      if (chunk && width(`${chunk}${char}`) > maxWidth) {
        chunks.push(chunk);
        chunk = char;
      } else chunk += char;
    }
    if (chunk) chunks.push(chunk);

    for (const part of chunks) {
      const candidate = line ? `${line} ${part}` : part;
      if (line && width(candidate) > maxWidth) {
        lines.push(line);
        line = part;
      } else line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function fitSafePixel(value: string, maxWidth: number, maxLines: number, sizes: number[]) {
  let last = { px: sizes.at(-1) ?? 5, lines: [] as string[] };
  for (const px of sizes) {
    const usual = fitPixel(value, maxWidth, maxLines, [px]);
    const lines = usual.lines.length && usual.lines.every(line => pixelWidth(line.replaceAll('*', ''), px) <= maxWidth)
      ? usual.lines
      : safePixelLines(value, px, maxWidth);
    last = { px, lines };
    if (lines.length <= maxLines) return last;
  }

  const px = last.px;
  const lines = last.lines.slice(0, Math.max(1, maxLines));
  if (lines.length) {
    let tail = lines[lines.length - 1] ?? '';
    while (tail && pixelWidth(`${tail}...`.replaceAll('*', ''), px) > maxWidth) tail = tail.slice(0, -1);
    lines[lines.length - 1] = `${tail}...`;
  }
  return { px, lines };
}

export const statScene: SceneDef<StatProps> = {
  type: 'stat',
  render(frame: Frame, props: StatProps) {
    const { ctx, theme, t, dur } = frame;
    const value = Number.isFinite(props.value) ? props.value : 0;
    const from = Number.isFinite(props.from) ? props.from! : 0;
    const decimals = Math.max(0, Math.min(6, Math.floor(Number.isFinite(props.decimals) ? props.decimals! : 0)));
    const prefix = String(props.prefix ?? '');
    const suffix = String(props.suffix ?? '');
    const compact = Math.abs(value) >= 1e6 && decimals === 0 && !suffix;
    const countP = ease.outExpo(prog(t, 0, Math.min(dur * 0.4, 1.05)));
    const current = from * (1 - countP) + value * countP;
    const finalNumeral = affixCount(formatCount(value, decimals, compact), prefix, suffix);
    const numeral = affixCount(formatCount(current, decimals, compact), prefix, suffix);
    const numeralPx = Math.max(8, Math.min(64, Math.floor((SAFE.w - 24) / Math.max(1, pixelWidth(finalNumeral, 1)))));
    const numberH = pixelHeight(numeralPx);

    // The 16 × 48 px modules span the full safe width and give the stat a strong second beat.
    const moduleCount = 16, moduleSize = 48, moduleGap = 8;
    const rowH = moduleSize;
    const label = fitSafePixel(String(props.label ?? ''), SAFE.w - 24, 2, [8, 7, 6, 5]);
    const labelH = label.lines.length * pixelHeight(label.px) + Math.max(0, label.lines.length - 1) * 12;
    const versusText = props.versus
      ? `VS ${formatCount(Number.isFinite(props.versus.value) ? props.versus.value : 0, decimals, compact)} ${String(props.versus.label ?? '')}`
      : '';
    const versus = props.versus ? fitSafePixel(versusText, SAFE.w - 24, 2, [6, 5, 4]) : null;
    const versusH = versus ? versus.lines.length * pixelHeight(versus.px) + Math.max(0, versus.lines.length - 1) * 10 : 0;
    const heights = [numberH, rowH, labelH, ...(versus ? [versusH] : [])];
    const contentH = heights.reduce((sum, height) => sum + height, 0);
    const gapCount = heights.length - 1;
    const targetH = Math.min(940, Math.max(760, contentH + gapCount * 120));
    const gap = gapCount ? Math.max(24, (targetH - contentH) / gapCount) : 0;
    const top = SAFE.y + (1000 - targetH) / 2;

    const landingStart = dur * 0.37;
    const landingDur = Math.min(dur * 0.08, 0.45);
    const landing = prog(t, landingStart, landingDur);
    const elapsed = Math.max(0, t - landingStart - landingDur);
    const hitScale = landing < 1
      ? 0.92 + landing * 0.08 + Math.sin(Math.PI * landing) * 0.1
      : 1 + Math.sin(elapsed * 24) * Math.exp(-elapsed * 9) * 0.12;
    const numberColor = landing >= 1 ? theme.accent : theme.fg;

    let y = top;
    pop(ctx, SAFE.cx, y + numberH / 2, hitScale, 1, () => pixelText(ctx, numeral, SAFE.cx, y, numeralPx, { color: numberColor, align: 'center' }));
    y += numberH + gap;

    blocks(ctx, SAFE.x, y, moduleCount, Math.round(moduleCount * countP), moduleSize, theme.dim, theme.line, moduleGap);
    y += rowH + gap;

    pixelBlock(ctx, label.lines, SAFE.cx, y, label.px, { color: theme.fg, align: 'center', gap: 12 });
    y += labelH + gap;

    if (versus && props.versus) {
      const reveal = ease.outExpo(prog(t, dur * 0.58, Math.min(dur * 0.1, 0.24)));
      pixelBlock(ctx, versus.lines, SAFE.cx, y, versus.px, { color: theme.muted, align: 'center', gap: 10, reveal });
    }
  },
};
