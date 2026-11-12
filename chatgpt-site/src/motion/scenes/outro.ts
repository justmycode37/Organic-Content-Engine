import { SAFE, type OutroProps, type SceneDef } from '../core.ts';
import { drawBody, beatProgress } from './semantic.ts';

export const outroScene: SceneDef<OutroProps> = {
  type: 'outro',
  render(frame, props) {
    const { ctx, theme } = frame;
    const action = beatProgress(frame, 'result', 0.35);
    if (props.sub) drawBody(ctx, props.sub, SAFE.cx - 24, 384, 744, 144, { color: theme.dim, align: 'center', maxSize: 64, minSize: 48, maxLines: 2 });
    drawBody(ctx, props.cta.replaceAll('*', ''), SAFE.cx - 24, 552 + (1 - action) * 24, 744, 336, { color: action > 0 ? theme.accent : theme.fg, align: 'center', maxSize: 112, maxLines: 3 });
    if (props.handle) drawBody(ctx, `@${props.handle.replace(/^@/, '')}`, SAFE.cx - 24, 960, 744, 72, { color: theme.fg, align: 'center', maxSize: 64, minSize: 48, maxLines: 1 });
  },
};
