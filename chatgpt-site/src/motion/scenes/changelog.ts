import { SAFE, ease, prog, type ChangelogProps, type SceneDef } from '../core.ts';
import { pixelText } from '../prim.ts';
import { activeStep, drawBody } from './semantic.ts';

export const changelogScene: SceneDef<ChangelogProps> = {
  type: 'changelog',
  render(frame, props) {
    const { ctx, theme } = frame;
    const items = props.items.slice(0, 5);
    const current = activeStep(frame, items.length);
    const item = items[current];
    if (!item) return;
    const start = current ? frame.events?.[current - 1]?.at ?? frame.hits?.[current - 1] ?? frame.dur * current / items.length : 0;
    const enter = frame.opening && !current ? 1 : ease.outCubic(prog(frame.t, start, 0.2));
    const header = [props.product, props.version].filter(Boolean).join(' ').toUpperCase();
    if (header) drawBody(ctx, header, SAFE.cx - 24, 384, 744, 72, { color: theme.dim, align: 'center', maxSize: 72, minSize: 56, maxLines: 1 });
    const tagColor = item.tag === 'DEL' ? theme.dim : theme.accent;
    pixelText(ctx, item.tag, SAFE.cx - 24, 504 - (1 - enter) * 24, 16, { color: tagColor, align: 'center' });
    drawBody(ctx, item.text, SAFE.cx - 24, 672 + (1 - enter) * 36, 744, 288, { color: item.accent ? theme.accent : theme.fg, align: 'center', maxSize: 96, maxLines: 3 });
  },
};
