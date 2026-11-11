import { clamp, ease, hash, type Frame, type GridProps, type SceneDef } from '../core.ts';
import { fitPixel, pixelHeight, pixelText, pixelWidth } from '../prim.ts';

const GAP_TITLE = 12;
const GAP_LABELS = 12;
const GUTTER = 156;

function safeTitle(value: unknown): { line: string; px: number } | null {
  const title = String(value ?? '').trim().toUpperCase().slice(0, 120);
  if (!title) return null;
  const fit = fitPixel(title, 888, 1, [10, 9, 8, 7, 6, 5]);
  let line = fit.lines[0] ?? '';
  while (line && pixelWidth(line, fit.px) > 888) line = line.slice(0, -1);
  return line ? { line, px: fit.px } : null;
}

export const gridScene: SceneDef<GridProps> = {
  type: 'grid',
  render(frame: Frame, props: GridProps) {
    const { ctx, theme, t } = frame;
    const dur = Math.max(0.1, Number.isFinite(frame.dur) ? frame.dur : 1);
    const rows = Math.max(2, Math.min(16, Math.floor(Number.isFinite(props.rows) ? props.rows : 2)));
    const cols = Math.max(2, Math.min(16, Math.floor(Number.isFinite(props.cols) ? props.cols : 2)));
    const rowLabels = (Array.isArray(props.rowLabels) ? props.rowLabels : []).slice(0, rows).map(label => String(label ?? '').toUpperCase());
    const colLabels = (Array.isArray(props.colLabels) ? props.colLabels : []).slice(0, cols).map(label => String(label ?? '').toUpperCase());
    const hasRows = rowLabels.some(Boolean), hasCols = colLabels.some(Boolean);
    const gap = rows <= 6 && cols <= 6 ? 8 : 4;
    const gutter = hasRows ? GUTTER : 0;
    const availW = 888 - gutter;
    const title = safeTitle(props.title);
    const titleH = title ? pixelHeight(title.px) : 0;
    const maxLabelChars = cols >= 12 ? 6 : 7;
    const clippedColLabels = colLabels.map(label => label.slice(0, maxLabelChars));
    const longestLabel = clippedColLabels.reduce((max, label) => Math.max(max, pixelWidth(label, 4)), 0);
    const labelBand = hasCols ? longestLabel + 20 : 0;
    const fixedH = titleH + (title ? GAP_TITLE : 0) + labelBand + (hasCols ? GAP_LABELS : 0);
    const maxMatrixH = Math.max(120, Math.min(744, 1000 - fixedH));
    const cell = Math.max(24, Math.floor(Math.min(
      (availW - (cols - 1) * gap) / cols,
      (maxMatrixH - (rows - 1) * gap) / rows,
    ) / 6) * 6);
    const matrixW = cols * cell + (cols - 1) * gap;
    const matrixH = rows * cell + (rows - 1) * gap;
    const totalW = gutter + matrixW;
    const groupX = 96 + Math.max(0, (888 - totalW) / 2);
    const matrixX = groupX + gutter;
    const totalH = titleH + (title ? GAP_TITLE : 0) + labelBand + (hasCols ? GAP_LABELS : 0) + matrixH;
    const groupY = Math.max(240, Math.min(1240 - totalH, Math.round(740 - totalH / 2)));
    let cursorY = groupY;
    if (title) {
      pixelText(ctx, title.line, 540, cursorY, title.px, { color: theme.fg, align: 'center' });
      cursorY += titleH + GAP_TITLE;
    }
    let labelCenterY = 0;
    if (hasCols) {
      labelCenterY = cursorY + labelBand / 2;
      cursorY += labelBand + GAP_LABELS;
    }
    const gridY = cursorY;
    const rowLabelX = matrixX - 16;
    rowLabels.forEach((label, r) => {
      if (!label) return;
      const short = label.slice(0, 5);
      pixelText(ctx, short, rowLabelX, gridY + r * (cell + gap) + cell / 2 - pixelHeight(4) / 2, 4, { color: theme.dim, align: 'right' });
    });
    if (hasCols) clippedColLabels.forEach((label, c) => {
      if (!label) return;
      const x = matrixX + c * (cell + gap) + cell / 2;
      ctx.save(); ctx.translate(x, labelCenterY); ctx.rotate(-Math.PI / 2);
      pixelText(ctx, label, 0, -pixelHeight(4) / 2, 4, { color: theme.dim, align: 'center' });
      ctx.restore();
    });

    const pattern = props.pattern ?? 'attention';
    const highlights = new Set((Array.isArray(props.highlight) ? props.highlight : [])
      .filter(cell => Array.isArray(cell) && Number.isFinite(cell[0]) && Number.isFinite(cell[1]) && cell[0] >= 0 && cell[0] < rows && cell[1] >= 0 && cell[1] < cols)
      .map(cell => cell[0] + ',' + cell[1]));
    const build = Math.max(0.18, Math.min(0.4, dur * 0.12));
    const entranceSpan = Math.max(0.1, Math.min(0.18, build * 0.45));
    const cellCount = rows * cols;
    const elapsed = Math.max(0, t - build);
    const scanPassRows = Math.max(0.75, Math.min(1.8, dur * 0.55));
    const scanPassCols = Math.max(0.8, Math.min(2.2, dur * 0.7));
    const scanRow = Math.floor(elapsed / scanPassRows * rows) % rows;
    const scanCol = Math.floor(elapsed / scanPassCols * cols) % cols;
    const fillDuration = Math.max(0.45, Math.min(1.4, dur * 0.32));
    const focus = Math.floor(((elapsed / Math.max(0.35, dur * 0.6)) % 1) * rows);
    const hit = ease.outBack(clamp((t - dur * 0.54) / 0.2));

    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const entranceAt = build * idx / Math.max(1, cellCount);
      const entrance = ease.outExpo(clamp((t - entranceAt) / entranceSpan));
      if (entrance <= 0) continue;
      let level = hash(idx + frame.seed, r * 19 + c);
      if (pattern === 'scan') {
        const rowGlow = r === scanRow ? 1 : 0;
        const colGlow = c === scanCol ? 1 : 0;
        level = 0.08 + rowGlow * 0.42 + colGlow * 0.28 + rowGlow * colGlow * 0.22;
      }
      if (pattern === 'attention') level = (hash(r, c) < 0.26 ? 0.95 : 0.2) + (r === focus ? Math.sin(t * 12 + c) * 0.18 : 0);
      if (pattern === 'fill') {
        const diagonal = (r + c) / Math.max(1, rows + cols - 2);
        const progress = clamp((elapsed - 0.04 - diagonal * fillDuration) / 0.16);
        level = progress >= 1
          ? (r === Math.floor(Math.max(0, elapsed - fillDuration - 0.2) * 3) % rows ? 0.58 : 0.9)
          : 0.08 + progress * 0.88;
      }
      if (pattern === 'noise') {
        const settled = 0.65 * clamp(elapsed / Math.max(0.35, dur * 0.72));
        const sample = Math.floor(elapsed * 4);
        level = hash(idx + sample, r + c) * (1 - settled) + (0.18 + hash(r, c) * 0.6) * settled;
      }
      level = clamp(level);
      const x = matrixX + c * (cell + gap), y = gridY + r * (cell + gap), hot = highlights.has(r + ',' + c);
      ctx.save();
      ctx.translate(x + cell / 2, y + cell / 2);
      ctx.scale(entrance * (hot ? 1 + Math.max(0, hit - 0.85) * 0.18 : 1), entrance);
      ctx.translate(-cell / 2, -cell / 2);
      ctx.fillStyle = hot && hit > 0 ? theme.accent : level > 0.72 ? theme.fg : level > 0.42 ? theme.dim : level > 0.18 ? theme.muted : theme.line;
      ctx.fillRect(0, 0, cell, cell);
      if (pattern !== 'fill' && level > 0.78 && !hot) {
        const inset = Math.max(6, Math.floor(cell / 4 / 6) * 6);
        ctx.fillStyle = theme.panel;
        ctx.fillRect(inset, inset, cell - inset * 2, cell - inset * 2);
      }
      if (hot && hit > 0) { ctx.strokeStyle = theme.accent; ctx.lineWidth = 8; ctx.strokeRect(-4, -4, cell + 8, cell + 8); }
      ctx.restore();
    }
  },
};
