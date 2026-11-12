import { SAFE, ease, prog, type ListProps, type SceneDef } from '../core.ts';
import { icon } from '../icons.ts';
import { pixelText } from '../prim.ts';
import { drawBody, activeStep } from './semantic.ts';

export const listScene: SceneDef<ListProps> = {
  type: 'list',
  render(frame, props) {
    const { ctx, theme } = frame;
    const items = props.items.slice(0, 5);
    if (!items.length) return;
    const current = activeStep(frame, items.length);
    const start = current ? frame.events?.[current - 1]?.at ?? frame.hits?.[current - 1] ?? frame.dur * current / items.length : 0;
    const enter = frame.opening && !current ? 1 : ease.outCubic(prog(frame.t, start, 0.2));
    if (props.title) drawBody(ctx, props.title.toUpperCase(), SAFE.cx - 24, 384, 744, 72, { color: theme.dim, align: 'center', maxSize: 72, minSize: 56, maxLines: 1 });
    // One item at a time replaces the last; the marker names the list's intent.
    const markerY = 552;
    const markerColor = props.style === 'cross' ? theme.dim : theme.accent;
    if (props.style === 'number') pixelText(ctx, String(current + 1).padStart(2, '0'), SAFE.cx - 24, markerY - 42, 12, { color: markerColor, align: 'center' });
    else if (props.style) icon(ctx, props.style, SAFE.cx - 24, markerY, 10, markerColor, enter);
    const top = (props.style ? 648 : 528) + (1 - enter) * 36;
    drawBody(ctx, items[current]!, SAFE.cx - 24, top, 744, 336, { color: theme.fg, align: 'center', maxSize: 112, maxLines: 3 });
    if (props.style === 'cross' && enter >= 1) {
      // Cross lists strike each item once it has been read.
      const strike = ease.outCubic(prog(frame.t, start + 0.45, 0.2));
      ctx.fillStyle = theme.accent;
      ctx.fillRect(SAFE.cx - 24 - 336 * strike, top + 168 - 6, 672 * strike, 12);
    }
    // Position pips: how many beats remain is part of the information.
    if (items.length > 1) {
      const pitch = 48, left = SAFE.cx - 24 - ((items.length - 1) * pitch) / 2;
      items.forEach((_, index) => {
        ctx.fillStyle = index === current ? theme.accent : index < current ? theme.fg : theme.line;
        ctx.fillRect(left + index * pitch - 12, 1056, 24, 24);
      });
    }
  },
};
