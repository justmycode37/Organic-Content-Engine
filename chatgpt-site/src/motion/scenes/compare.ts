import { CONTENT_BOTTOM, SAFE, ease, prog, type Frame, type CompareProps, type SceneDef } from '../core.ts';
import { fitPixel, panel, pixelBlock, pixelHeight, pixelText, pixelWidth, pop, text, textWidth } from '../prim.ts';

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

function wrapSans(ctx: Frame['ctx'], value: string, maxWidth: number, size: number, maxLines: number): string[] {
  const words = String(value ?? '').trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const pieces: string[] = [];
    let piece = '';
    for (const char of [...word]) {
      if (piece && textWidth(ctx, `${piece}${char}-`, size, 800) > maxWidth) {
        pieces.push(`${piece}-`);
        piece = char;
      } else piece += char;
    }
    if (piece) pieces.push(piece);
    for (const part of pieces) {
      const candidate = line ? `${line} ${part}` : part;
      if (line && textWidth(ctx, candidate, size, 800) > maxWidth) {
        lines.push(line);
        line = part;
      } else line = candidate;
    }
  }
  if (line) lines.push(line);

  if (lines.length <= maxLines) return lines;
  const clipped = lines.slice(0, Math.max(1, maxLines));
  let tail = clipped[clipped.length - 1] ?? '';
  while (tail && textWidth(ctx, `${tail}...`, size, 800) > maxWidth) tail = tail.slice(0, -1);
  clipped[clipped.length - 1] = `${tail}...`;
  return clipped;
}

export const compareScene: SceneDef<CompareProps> = {
  type: 'compare',
  render(frame: Frame, props: CompareProps) {
    const { ctx, theme, t, dur } = frame;
    const titleText = String(props.title ?? '');
    const title = titleText ? fitSafePixel(titleText, SAFE.w - 24, 1, [8, 7, 6]) : null;
    if (title) title.lines.forEach((line, index) => pixelText(ctx, line, SAFE.cx, 252 + index * pixelHeight(title.px), title.px, { color: theme.fg, align: 'center' }));

    const columnWidth = 376, framePad = 12;
    const columns = [
      { side: props.left ?? { label: '', points: [] }, x: SAFE.x + 16 },
      { side: props.right ?? { label: '', points: [] }, x: SAFE.cx + 52 },
    ].map(({ side, x }, index) => {
      const points = (Array.isArray(side.points) ? side.points : [])
        .slice(0, 4)
        .map(point => String(point ?? '').trim())
        .filter(Boolean);
      return {
        side,
        x,
        index,
        points,
        winner: props.winner === (index === 0 ? 'left' : 'right'),
      };
    });

    const headerY = title ? 340 : 280;
    const headerH = 112;
    const bodyTop = headerY + headerH + 32;
    const bodyBottomLimit = CONTENT_BOTTOM - 24;
    const pointLayouts = columns.map(column => {
      const count = column.points.length;
      const available = Math.max(0, bodyBottomLimit - bodyTop);
      const bodySpan = count === 0 ? 0 : count === 1 ? Math.min(216, available) : available;
      const slotH = count ? bodySpan / count : 0;
      const maxLines = count ? Math.max(1, Math.floor((slotH - 20) / 50)) : 1;
      const points = column.points.map(value => ({
        lines: wrapSans(ctx, value.toUpperCase(), columnWidth - 76, 42, maxLines),
      }));
      return { points, bodySpan, slotH, bottom: bodyTop + bodySpan };
    });

    const reveal = ease.outBack(prog(t, 0, Math.min(0.3, dur * 0.17)));
    const winnerProgress = prog(t, dur * 0.55, Math.min(0.22, dur * 0.1));
    const winnerHit = ease.outBack(winnerProgress);

    const dividerTop = headerY + headerH + 12;
    const dividerBottom = Math.max(dividerTop + 72, ...pointLayouts.map(layout => layout.bottom));
    ctx.fillStyle = theme.line;
    for (let y = dividerTop; y < dividerBottom; y += 24) ctx.fillRect(SAFE.cx - 4, y, 8, 16);

    columns.forEach((column, index) => {
      const x = column.x;
      const layout = pointLayouts[index]!;
      const frameBottom = Math.max(headerY + headerH, layout.bottom) + framePad;
      const frameY = headerY - framePad;
      const slide = (1 - reveal) * (index ? 100 : -100);
      const accenting = column.winner && winnerProgress > 0;
      const header = fitSafePixel(String(column.side.label ?? ''), columnWidth - 32, 1, [8, 7, 6, 5]);

      ctx.save();
      ctx.translate(slide, 0);
      if (accenting) {
        panel(ctx, x - framePad, frameY, columnWidth + framePad * 2, frameBottom - frameY, {
          stroke: theme.accent,
          lineWidth: 8,
        });
      }
      panel(ctx, x, headerY, columnWidth, headerH, {
        fill: accenting ? theme.accent : theme.panelAlt,
        stroke: accenting ? theme.accent : theme.line,
        lineWidth: 4,
        notch: 18,
      });
      pixelBlock(ctx, header.lines, x + columnWidth / 2, headerY + Math.max(12, (headerH - pixelHeight(header.px)) / 2), header.px, {
        color: accenting ? theme.onAccent : theme.fg,
        align: 'center',
      });

      const pointColor = props.winner && !column.winner && winnerHit > 0 ? theme.muted : theme.fg;
      layout.points.forEach((point, pointIndex) => {
        const slotTop = bodyTop + pointIndex * layout.slotH;
        const textH = point.lines.length * 50;
        const rowTop = slotTop + Math.max(0, (layout.slotH - textH) / 2);
        const entrance = ease.outBack(prog(t, Math.min(0.12, dur * 0.05) + pointIndex * Math.min(0.07, dur * 0.025), Math.min(0.25, dur * 0.15)));
        const scale = Math.max(0, entrance);
        pop(ctx, x + columnWidth / 2, rowTop + textH / 2, scale, 1, () => {
          ctx.fillStyle = pointColor;
          ctx.fillRect(x + 20, rowTop + textH / 2 - 9, 18, 18);
          point.lines.forEach((line, lineIndex) => text(ctx, line, x + 56, rowTop + lineIndex * 50 + 25, {
            size: 42,
            color: pointColor,
            weight: 800,
            family: 'body',
            baseline: 'middle',
          }));
        });
      });
      ctx.restore();
    });

    const vsWidth = 72, vsHeight = 64;
    const vsX = SAFE.cx - vsWidth / 2;
    const vsCenterY = (dividerTop + dividerBottom) / 2;
    const vsY = vsCenterY - vsHeight / 2;
    // The background fill cleanly cuts the central dashed divider beneath the VS tag.
    panel(ctx, vsX, vsY, vsWidth, vsHeight, { fill: theme.bg });
    pixelText(ctx, 'VS', SAFE.cx, vsY + (vsHeight - pixelHeight(6)) / 2, 6, { color: theme.dim, align: 'center' });
  },
};
