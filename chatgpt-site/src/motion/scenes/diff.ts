import { clamp, ease, font, type DiffProps, type Frame, type SceneDef } from '../core.ts';
import { pixelText, pixelWidth, textWidth, windowFrame } from '../prim.ts';

const MAX_INPUT_LINES = 14;
const MAX_LINE_CHARS = 512;
const MAX_CONTENT_HEIGHT = 1000;
const WINDOW_CHROME_HEIGHT = 144;
const CONTENT_WIDTH = 752;

type ChangeRow = {
  text: string;
  sourceIndex: number;
  rowIndex: number;
};
type DiffRows = { context: ChangeRow[]; removed: ChangeRow[]; added: ChangeRow[] };

function clean(lines: string[] | undefined): string[] {
  return (Array.isArray(lines) ? lines : []).slice(0, MAX_INPUT_LINES).map(value => {
    const line = String(value ?? '').replace(/\t/g, '    ');
    const chars = Array.from(line);
    return chars.length <= MAX_LINE_CHARS ? line : chars.slice(0, MAX_LINE_CHARS - 3).join('') + '...';
  });
}

function wrapMeasured(ctx: Frame['ctx'], value: string, maxWidth: number, size: number): string[] {
  const chars = Array.from(String(value ?? ''));
  if (!chars.length) return [''];
  const lines: string[] = [];
  let remaining = chars;
  while (remaining.length) {
    if (textWidth(ctx, remaining.join(''), size, 800, 'mono') <= maxWidth) {
      lines.push(remaining.join(''));
      break;
    }
    let cut = 0;
    for (let end = 1; end <= remaining.length; end++) {
      if (textWidth(ctx, remaining.slice(0, end).join(''), size, 800, 'mono') > maxWidth) break;
      cut = end;
    }
    if (!cut) cut = 1;
    const lastSpace = remaining.slice(0, cut).lastIndexOf(' ');
    if (lastSpace > 0) cut = lastSpace + 1;
    lines.push(remaining.slice(0, cut).join(''));
    remaining = remaining.slice(cut);
  }
  return lines;
}

function rowsFor(ctx: Frame['ctx'], lines: string[], size: number, wrap: boolean): ChangeRow[] {
  return lines.flatMap((text, sourceIndex) => {
    const segments = wrap ? wrapMeasured(ctx, text, CONTENT_WIDTH, size) : [text];
    return segments.map((segment, rowIndex) => ({ text: segment, sourceIndex, rowIndex }));
  });
}

function drawDiffChrome(ctx: Frame['ctx'], frame: Frame, x: number, y: number, w: number, h: number, filename: string, counter: string) {
  const { theme } = frame;
  const box = windowFrame(ctx, theme, x, y, w, h, '');
  const bar = 72;
  ctx.fillStyle = theme.panelAlt;
  ctx.fillRect(x + 2, y + 2, w - 4, bar - 4);

  const countWidth = pixelWidth(counter, 5);
  const countX = x + w - 24 - countWidth;
  const name = Array.from(String(filename ?? '').toUpperCase().trim());
  const safeName = name.length > 128 ? name.slice(0, 125).join('') + '...' : name.join('');
  const nameWidth = pixelWidth(safeName, 4);
  let dotsX = x + 28;
  const nameX = x + 24;
  const candidateDotsX = nameX + nameWidth + 20;
  const candidateDotsEnd = candidateDotsX + 3 * 16 + 2 * 16;
  const showName = Boolean(safeName) && candidateDotsEnd + 20 <= countX;
  if (showName) {
    pixelText(ctx, safeName, nameX, y + 22, 4, { color: theme.dim });
    dotsX = candidateDotsX;
  }

  for (let dot = 0; dot < 3; dot++) {
    ctx.fillStyle = dot === 0 ? theme.fg : theme.muted;
    ctx.fillRect(dotsX + dot * 32, y + 28, 16, 16);
  }
  pixelText(ctx, counter, x + w - 24, y + 18, 5, { color: theme.accent, align: 'right' });
  return box;
}

function drawAddedRow(ctx: Frame['ctx'], box: { x: number; y: number; w: number; h: number }, y: number, rowHeight: number, size: number, text: string, theme: Frame['theme'], progress: number) {
  if (progress <= 0 || rowHeight <= 0) return;
  const left = box.x - 34;
  ctx.fillStyle = theme.panelAlt;
  ctx.fillRect(left, y, box.w + 68, rowHeight);
  ctx.fillStyle = theme.accent;
  ctx.fillRect(left, y, 12, rowHeight);

  const scale = 0.84 + 0.16 * ease.outBack(progress);
  const cx = box.x + box.w / 2;
  ctx.save();
  ctx.globalAlpha *= ease.outExpo(progress);
  ctx.translate(cx, y + rowHeight / 2);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -(y + rowHeight / 2));
  ctx.textBaseline = 'top';
  ctx.font = font(size, 800, 'mono');
  ctx.fillStyle = theme.fg;
  ctx.fillText('+', box.x + 12, y + Math.max(0, (rowHeight - size) / 2));
  ctx.fillText(text, box.x + 64, y + Math.max(0, (rowHeight - size) / 2));
  ctx.restore();
}

export const diffScene: SceneDef<DiffProps> = {
  type: 'diff',
  render(frame, props) {
    const { ctx, theme, t, dur } = frame;
    const contextLines = clean(props.context);
    const removedLines = clean(props.removed);
    const addedLines = clean(props.added);
    const allLines = [...contextLines, ...removedLines, ...addedLines];

    let size = 30;
    for (let candidate = 46; candidate >= 30; candidate--) {
      const fitsWidth = allLines.every(line => textWidth(ctx, line, candidate, 800, 'mono') <= CONTENT_WIDTH);
      const lineH = Math.round(candidate * 1.6);
      const initialRows = contextLines.length + removedLines.length;
      const finalRows = contextLines.length + addedLines.length;
      const height = WINDOW_CHROME_HEIGHT + Math.max(initialRows, finalRows) * lineH;
      if (fitsWidth && height <= MAX_CONTENT_HEIGHT) {
        size = candidate;
        break;
      }
    }
    const wrap = !allLines.every(line => textWidth(ctx, line, size, 800, 'mono') <= CONTENT_WIDTH);
    let rows: DiffRows = {
      context: rowsFor(ctx, contextLines, size, wrap),
      removed: rowsFor(ctx, removedLines, size, wrap),
      added: rowsFor(ctx, addedLines, size, wrap),
    };

    const lineH = Math.round(size * 1.6);
    const maxRows = Math.max(1, Math.floor((MAX_CONTENT_HEIGHT - WINDOW_CHROME_HEIGHT) / lineH));
    const changedRows = Math.max(rows.removed.length, rows.added.length);
    const contextCapacity = Math.max(0, maxRows - changedRows);
    if (rows.context.length > contextCapacity) rows.context = rows.context.slice(0, contextCapacity);
    const changedCapacity = Math.max(0, maxRows - rows.context.length);
    if (rows.removed.length > changedCapacity) rows.removed = rows.removed.slice(0, changedCapacity);
    if (rows.added.length > changedCapacity) rows.added = rows.added.slice(0, changedCapacity);

    const enter = clamp(t / Math.min(0.08, Math.max(0.04, dur * 0.025)));
    if (enter <= 0) return;

    const removeStart = Math.min(0.18, Math.max(0.12, dur * 0.08));
    const strikeDuration = Math.min(0.16, Math.max(0.12, dur * 0.08));
    const strikeSpread = Math.min(0.08, dur * 0.03);
    const collapseStart = removeStart + strikeDuration + strikeSpread + Math.min(0.04, dur * 0.02);
    const collapseDuration = Math.min(0.18, Math.max(0.14, dur * 0.1));
    const addGap = Math.min(0.16, Math.max(0.075, dur * 0.05));
    const addStart = rows.removed.length ? collapseStart + collapseDuration + addGap : removeStart;
    const addSpread = Math.min(0.54, dur * 0.18);
    const addStep = rows.added.length > 1 ? addSpread / (rows.added.length - 1) : 0;
    const addDuration = Math.min(0.18, Math.max(0.12, dur * 0.1));
    const collapseP = ease.outExpo(clamp((t - collapseStart) / collapseDuration));
    const removedHeight = rows.removed.length * lineH * (1 - collapseP);
    const addedProgress = rows.added.map((_, index) => clamp((t - addStart - index * addStep) / addDuration));
    const addedHeight = addedProgress.reduce((sum, progress) => sum + lineH * ease.outExpo(progress), 0);
    const contentHeight = rows.context.length * lineH + removedHeight + addedHeight;
    const height = WINDOW_CHROME_HEIGHT + contentHeight;
    const y = 740 - height / 2;
    const entrance = ease.outBack(enter);

    ctx.save();
    ctx.translate(540, y + height / 2);
    ctx.scale(0.9 + 0.1 * entrance, 0.9 + 0.1 * entrance);
    ctx.translate(-540, -(y + height / 2));

    const counter = '-' + removedLines.length + ' +' + addedLines.length;
    const box = drawDiffChrome(ctx, frame, 96, y, 888, height, props.filename ?? '', counter);

    let rowY = box.y;
    ctx.font = font(size, 800, 'mono');
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    for (const row of rows.context) {
      ctx.fillStyle = theme.dim;
      ctx.fillText(row.text, box.x + 64, rowY + 1);
      rowY += lineH;
    }

    for (const row of rows.removed) {
      const rowCollapse = 1 - collapseP;
      const rowHeight = lineH * rowCollapse;
      if (rowHeight > 1) {
        const strikeStart = removeStart + row.sourceIndex * (rows.removed.length > 1 ? strikeSpread / (rows.removed.length - 1) : 0);
        const strikeP = clamp((t - strikeStart) / strikeDuration);
        ctx.save();
        ctx.globalAlpha *= 1 - 0.28 * strikeP;
        ctx.translate(0, rowY + rowHeight / 2);
        ctx.scale(1, rowCollapse);
        ctx.translate(0, -(rowY + rowHeight / 2));
        ctx.fillStyle = strikeP > 0 ? theme.dim : theme.fg;
        ctx.fillText('-', box.x + 12, rowY + Math.max(0, (rowHeight - size) / 2));
        ctx.fillStyle = strikeP > 0 ? theme.dim : theme.fg;
        ctx.fillText(row.text, box.x + 64, rowY + Math.max(0, (rowHeight - size) / 2));
        if (strikeP > 0) {
          ctx.strokeStyle = theme.muted;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(box.x + 64, rowY + rowHeight * 0.52);
          ctx.lineTo(box.x + 64 + textWidth(ctx, row.text, size, 800, 'mono') * strikeP, rowY + rowHeight * 0.52);
          ctx.stroke();
        }
        ctx.restore();
      }
      rowY += rowHeight;
    }

    let lastAddedY = rowY;
    for (let index = 0; index < rows.added.length; index++) {
      const row = rows.added[index]!;
      const progress = addedProgress[index]!;
      const rowHeight = lineH * ease.outExpo(progress);
      drawAddedRow(ctx, box, rowY, rowHeight, size, row.text, theme, progress);
      lastAddedY = rowY;
      rowY += rowHeight;
    }
    const idleStart = addStart + Math.max(0, rows.added.length - 1) * addStep + addDuration;
    if (rows.added.length && t >= idleStart && Math.floor((t - idleStart) * 3) % 2 === 0) {
      const last = rows.added[rows.added.length - 1]!;
      const caretX = Math.min(box.x + 64 + textWidth(ctx, last.text, size, 800, 'mono'), box.x + box.w - 12);
      ctx.fillStyle = theme.dim;
      ctx.fillRect(caretX, lastAddedY + Math.max(0, (lineH - size) / 2), 8, size);
    }

    ctx.restore();
  },
};

