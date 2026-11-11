import { CONTENT_BOTTOM, SAFE, ease, prog, type Frame, type BarsProps, type SceneDef } from '../core.ts';
import { blocks, fitPixel, pixelBlock, pixelHeight, pixelText, pixelWidth } from '../prim.ts';

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

function decimalPlaces(value: number) {
  const text = Math.abs(value).toString().toLowerCase();
  const [mantissa = '', exponentText] = text.split('e');
  const fractionLength = mantissa.split('.')[1]?.length ?? 0;
  const exponent = Number(exponentText ?? 0);
  return Math.max(0, Math.min(6, fractionLength - (Number.isFinite(exponent) ? exponent : 0)));
}

function formatValue(value: number, decimals: number, unit: string) {
  const safe = Number.isFinite(value) ? value : 0;
  const formatted = Math.abs(safe) >= 1e12
    ? safe.toExponential(Math.min(decimals, 2)).replace('e', 'E')
    : new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(safe);
  return `${formatted}${unit}`;
}

export const barsScene: SceneDef<BarsProps> = {
  type: 'bars',
  render(frame: Frame, props: BarsProps) {
    const { ctx, theme, t, dur } = frame;
    const source = Array.isArray(props.items) ? props.items : [];
    const items = source.slice(0, 6).map(item => ({
      label: String(item?.label ?? ''),
      value: Number.isFinite(item?.value) ? item.value : 0,
      accent: Boolean(item?.accent),
    }));
    if (!items.length) return;

    const titleText = String(props.title ?? '');
    const title = titleText ? fitSafePixel(titleText, SAFE.w - 24, 1, [8, 7, 6, 5]) : null;
    if (title) title.lines.forEach((line, index) => pixelText(ctx, line, SAFE.cx, 252 + index * pixelHeight(title.px), title.px, { color: theme.fg, align: 'center' }));

    const unit = String(props.unit ?? '');
    const maxAbs = Math.max(...items.map(item => Math.abs(item.value)), 0);
    const accentIndex = items.some(item => item.accent)
      ? items.findIndex(item => item.accent)
      : items.reduce((best, item, index) => Math.abs(item.value) > Math.abs(items[best]!.value) ? index : best, 0);
    const layouts = items.map(item => {
      const decimals = decimalPlaces(item.value);
      const label = fitSafePixel(item.label, 540, 2, [6, 5]);
      const number = fitSafePixel(formatValue(item.value, decimals, unit), 300, 1, [6, 5, 4]);
      const labelH = label.lines.length * pixelHeight(label.px) + Math.max(0, label.lines.length - 1) * 8;
      return { decimals, label, number, labelH, rowH: labelH + 12 + 48 };
    });
    const rowHeight = Math.max(...layouts.map(layout => layout.rowH));
    const rowStart = title ? 320 : 276;
    const rowEnd = CONTENT_BOTTOM - rowHeight - 8;
    const rowStep = items.length > 1 ? (rowEnd - rowStart) / (items.length - 1) : 0;
    const segment = 48, segmentGap = 12;
    const segmentCount = Math.floor((SAFE.w + segmentGap) / (segment + segmentGap));
    const actualBarW = segmentCount * segment + (segmentCount - 1) * segmentGap;
    const barX = SAFE.x + (SAFE.w - actualBarW) / 2;
    const animationDur = Math.min(0.55, dur * 0.26);

    items.forEach((item, index) => {
      const delay = index * Math.min(0.075, dur * 0.025);
      const raw = ease.outExpo(prog(t, delay, animationDur));
      const rowY = items.length === 1 ? (rowStart + rowEnd - rowHeight) / 2 : rowStart + index * rowStep;
      const layout = layouts[index]!;
      const isAccent = index === accentIndex;
      const labelColor = isAccent ? theme.fg : theme.dim;
      const current = item.value * raw;
      const currentText = fitSafePixel(formatValue(current, layout.decimals, unit), 300, 1, [layout.number.px]);
      const numberY = rowY + Math.max(0, (layout.labelH - pixelHeight(layout.number.px)) / 2);

      pixelBlock(ctx, layout.label.lines, SAFE.x, rowY, layout.label.px, { color: labelColor, gap: 8, reveal: raw });
      pixelText(ctx, currentText.lines[0] ?? '', SAFE.right, numberY, currentText.px, {
        color: isAccent ? theme.accent : theme.fg,
        align: 'right',
        reveal: raw,
      });

      const barY = rowY + layout.labelH + 12;
      blocks(ctx, barX, barY, segmentCount, segmentCount, segment, theme.line, theme.line, segmentGap);
      const filled = maxAbs > 0 ? Math.round(segmentCount * Math.abs(item.value / maxAbs) * raw) : 0;
      const color = isAccent ? theme.accent : theme.dim;
      blocks(ctx, barX, barY, segmentCount, filled, segment, color, theme.line, segmentGap);

      if (isAccent && raw >= 1 && filled > 0) {
        const phase = (t * 1.5) % 1;
        ctx.fillStyle = theme.accent;
        ctx.fillRect(barX + phase * Math.max(1, filled * (segment + segmentGap)), barY, segment, segment);
      }

      const finish = prog(t, delay + animationDur, 0.18);
      if (isAccent && filled > 0 && finish > 0 && finish < 1) {
        const s = 1 + Math.sin(finish * Math.PI) * 0.16;
        ctx.save();
        ctx.translate(barX + (filled - 0.5) * (segment + segmentGap), barY + segment / 2);
        ctx.scale(s, s);
        ctx.fillStyle = theme.accent;
        ctx.fillRect(-12, -12, 24, 24);
        ctx.restore();
      }
    });
  },
};
