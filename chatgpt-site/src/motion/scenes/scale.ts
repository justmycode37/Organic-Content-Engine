import { SAFE, ease, prog, type ScaleProps, type SceneDef } from '../core.ts';
import { pixelText, pixelWidth } from '../prim.ts';
import { activeStep, drawBody } from './semantic.ts';

export const scaleScene: SceneDef<ScaleProps> = {
  type: 'scale',
  render(frame, props) {
    const { ctx, theme } = frame;
    const levels = props.levels.slice(0, 4);
    if (!levels.length) return;
    const current = activeStep(frame, levels.length);
    const level = levels[current]!;
    const start = current ? frame.events?.[current - 1]?.at ?? frame.hits?.[current - 1] ?? frame.dur * current / levels.length : 0;
    const landing = ease.outCubic(prog(frame.t, start, 0.22));
    const numeral = level.value.toLocaleString('en-US');
    const module = Math.min(40, Math.floor(744 / Math.max(1, pixelWidth(numeral, 1))));
    pixelText(ctx, numeral, SAFE.cx - 24, 432 + (1 - landing) * 24, module, { color: current ? theme.accent : theme.fg, align: 'center' });
    drawBody(ctx, `${level.label} ${props.unit}`.toUpperCase(), SAFE.cx - 24, 756, 744, 144, { color: theme.fg, align: 'center', maxSize: 72, maxLines: 2 });
    const ratio = levels[0]!.value === 0 ? null : level.value / levels[0]!.value;
    if (current && ratio !== null) drawBody(ctx, `${ratio.toFixed(1)}× ${props.reference}`, SAFE.cx - 24, 960, 744, 96, { color: theme.dim, align: 'center', maxSize: 64, maxLines: 1 });
  },
};
