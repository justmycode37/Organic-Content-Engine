import { type Frame, type ListProps, type SceneDef, clamp, ease, prog, stripMarkup } from '../core.ts';
import { bitmap, fitPixel, pixelBlock, pixelText, pixelWidth, text, textWidth } from '../prim.ts';

const CHECK = ['00000000', '00000001', '00000011', '00000110', '10001100', '11111000', '01110000', '00100000'];
const CROSS = ['10000001', '01000010', '00100100', '00011000', '00011000', '00100100', '01000010', '10000001'];
const ARROW = ['00010000', '00011000', '11111111', '11111111', '11111111', '00011000', '00010000', '00000000'];

function onePixelLine(value: string, maxWidth: number, px: number): string {
  const source = stripMarkup(value).toUpperCase().replace(/\s+/g, ' ').trim();
  let line = source;
  if (pixelWidth(line, px) <= maxWidth) return line;
  const chars = [...source];
  while (chars.length && pixelWidth(`${chars.join('')}...`, px) > maxWidth) chars.pop();
  return chars.length ? `${chars.join('')}...` : '';
}

function wrapSans(ctx: Frame['ctx'], value: string, maxWidth: number, size: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = '';
  const words = String(value ?? '').trim().split(/\s+/).filter(Boolean);
  for (const word of words) {
    const chunks: string[] = [];
    let chunk = '';
    for (const char of [...word]) {
      if (chunk && textWidth(ctx, chunk + char, size, 800) > maxWidth) {
        chunks.push(chunk);
        chunk = char;
      } else chunk += char;
    }
    if (chunk) chunks.push(chunk);
    chunks.forEach((part, index) => {
      const candidate = line ? `${line}${index === 0 ? ' ' : ''}${part}` : part;
      if (line && textWidth(ctx, candidate, size, 800) > maxWidth) {
        lines.push(line);
        line = part;
      } else line = candidate;
    });
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    let last = lines[maxLines - 1] ?? '';
    while (last && textWidth(ctx, `${last}…`, size, 800) > maxWidth) last = [...last].slice(0, -1).join('');
    lines[maxLines - 1] = `${last}…`;
  }
  return lines;
}

export const listScene: SceneDef<ListProps> = {
  type: 'list',
  render(frame: Frame, props: ListProps) {
    const { ctx, theme, t, dur } = frame;
    const items = (Array.isArray(props.items) ? props.items : []).slice(0, 5).map(value => String(value ?? '').trim().slice(0, 360)).filter(Boolean);
    if (!items.length) return;

    const title = String(props.title ?? '').trim().slice(0, 120);
    if (title) pixelText(ctx, onePixelLine(title, 840, 9), 132, 264, 9, { color: theme.fg, accent: theme.accent });

    const markerSize = 110;
    const markerX = 132;
    const textX = 264;
    const textWidthMax = 708;
    const rowTop = 360;
    const rowBottom = 1212;
    const rowHeight = (rowBottom - rowTop) / items.length;
    const pixelLayouts = items.map(item => fitPixel(item, textWidthMax, 2, [8]));
    const pixelMode = pixelLayouts.every(layout => layout.lines.length <= 2);
    const sansSize = 48;
    const sansLayouts = pixelMode ? [] : items.map(item => wrapSans(ctx, stripMarkup(item), textWidthMax, sansSize, 3));
    const start = Math.min(0.08, dur * 0.04);
    const stagger = Math.min(0.08, Math.max(0.035, dur * 0.02));
    const entrance = Math.min(0.28, Math.max(0.18, dur * 0.12));
    const style = props.style ?? 'number';

    items.forEach((item, index) => {
      const y = rowTop + index * rowHeight;
      const p = prog(t, start + index * stagger, entrance);
      if (p > 0) {
        const activeIndex = Math.min(items.length - 1, Math.max(0, Math.floor((t - start) / stagger)));
        const active = index === activeIndex;
        const markerBg = active ? theme.accent : theme.fg;
        const markerFg = active ? theme.onAccent : theme.bg;
        const markerY = y + (rowHeight - markerSize) / 2;
        const offset = (1 - ease.outBack(p)) * -300;

        ctx.save();
        ctx.globalAlpha *= clamp(p * 3);
        ctx.translate(offset, 0);
        const rowAlpha = ctx.globalAlpha;
        const pulse = active ? 0.88 + 0.12 * (0.5 + 0.5 * Math.sin(t * Math.PI * 5)) : 1;
        ctx.globalAlpha = rowAlpha * pulse;
        ctx.fillStyle = markerBg;
        ctx.fillRect(markerX, markerY, markerSize, markerSize);
        ctx.globalAlpha = rowAlpha;

        if (style === 'check' || style === 'cross' || style === 'arrow') {
          const shape = style === 'check' ? CHECK : style === 'cross' ? CROSS : ARROW;
          bitmap(ctx, shape, markerX + (markerSize - 64) / 2, y + (rowHeight - 64) / 2, 8, markerFg);
        } else {
          pixelText(ctx, String(index + 1).padStart(2, '0'), markerX + markerSize / 2, y + (rowHeight - 56) / 2, 8, { color: markerFg, align: 'center' });
        }

        const copyColor = active ? theme.fg : theme.dim;
        if (pixelMode) {
          const lines = pixelLayouts[index]!.lines;
          const blockHeight = lines.length * 56 + Math.max(0, lines.length - 1) * 16;
          pixelBlock(ctx, lines, textX, y + (rowHeight - blockHeight) / 2, 8, {
            color: copyColor,
            accent: theme.accent,
            gap: 16,
            reveal: p,
            mode: 'type',
            seed: frame.seed + index,
          });
        } else {
          const lines = sansLayouts[index]!;
          const lineHeight = 54;
          const baseline = y + (rowHeight - lines.length * lineHeight) / 2 + 42;
          lines.forEach((line, lineIndex) => text(ctx, line, textX, baseline + lineIndex * lineHeight, { size: sansSize, color: copyColor, weight: 800 }));
        }
        ctx.restore();
      }

      if (index < items.length - 1) {
        ctx.fillStyle = theme.line;
        ctx.fillRect(markerX, Math.round(y + rowHeight - 2), 840, 3);
      }
    });
  },
};
