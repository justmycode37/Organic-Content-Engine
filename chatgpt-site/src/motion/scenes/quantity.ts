import { SAFE, clamp, ease, lerp, type QuantityProps, type SceneDef } from '../core.ts';
import { pixelText, pixelWidth } from '../prim.ts';
import { beatProgress, beatTime, drawBody } from './semantic.ts';

const COLUMNS = 5;
const MAX_CELLS = 10;
const CELL = 144;
const GAP = 12;

export const quantityScene: SceneDef<QuantityProps> = {
  type: 'quantity',
  render(frame, props) {
    const { ctx, theme } = frame;
    const total = Math.max(0, Math.floor(props.quantity));
    const removed = Math.min(total, Math.max(0, Math.floor(props.subset)));
    const remainder = total - removed;
    const extract = beatProgress(frame, 'extract', 0.3);
    const extractAt = beatTime(frame, 'extract', 0.3);
    const result = beatProgress(frame, 'result', 0.64);
    const value = result > 0 ? remainder : total;
    const numeral = value.toLocaleString('en-US');
    const module = Math.min(38, Math.floor(744 / Math.max(1, pixelWidth(numeral, 1))));
    pixelText(ctx, numeral, SAFE.cx - 24, 384, module, { color: result > 0 ? theme.accent : theme.fg, align: 'center' });
    const matched = props.comparator.value === remainder;
    const explicitScale = props.scale && props.scale > 1 ? Math.floor(props.scale) : 0;
    const unit = explicitScale ? `${props.unit} · ■ = ${explicitScale.toLocaleString('en-US')}` : props.unit;
    const label = result > 0 ? (matched ? props.comparator.label : `${props.comparator.label} ${props.comparator.value.toLocaleString('en-US')}`) : unit;
    drawBody(ctx, label.toUpperCase(), SAFE.cx - 24, 664, 744, 96, { color: theme.fg, align: 'center', maxSize: 72, maxLines: 1 });

    // Objects: an explicit scale is honoured; otherwise the quantity is spread over at most 10 cells (large cells read as objects, not glyphs).
    const cells = total ? Math.max(1, Math.min(MAX_CELLS, explicitScale ? Math.ceil(total / explicitScale) : MAX_CELLS)) : 0;
    const kept = total ? Math.round(cells * remainder / total) : 0;
    const left = SAFE.cx - 24 - (COLUMNS * CELL + (COLUMNS - 1) * GAP) / 2;
    for (let index = 0; index < cells; index++) {
      const x = left + (index % COLUMNS) * (CELL + GAP);
      const y = 816 + Math.floor(index / COLUMNS) * (CELL + GAP);
      if (index < kept) {
        ctx.fillStyle = result > 0 ? theme.accent : theme.fg;
        ctx.fillRect(x, y, CELL, CELL);
        continue;
      }
      // Extracted cells drop out one after another, last cell first.
      const order = cells - 1 - index;
      const fall = clamp((frame.t - extractAt - order * 0.02) / 0.32);
      if (fall >= 1) continue;
      ctx.save();
      ctx.globalAlpha *= 1 - ease.inCubic(fall);
      ctx.fillStyle = extract > 0 ? theme.dim : theme.fg;
      ctx.fillRect(x, y + lerp(0, 120, ease.inCubic(fall)), CELL, CELL);
      ctx.restore();
    }
    if (extract > 0 && result === 0) {
      drawBody(ctx, `−${removed.toLocaleString('en-US')}`, SAFE.cx - 24, lerp(1128, 1152, extract), 744, 88, { color: theme.accent, align: 'center', maxSize: 80, maxLines: 1 });
    }
  },
};
