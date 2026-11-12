import { SAFE, type SplitProps, type SceneDef } from '../core.ts';
import { panel } from '../prim.ts';
import { beatProgress, drawBody } from './semantic.ts';

export const splitScene: SceneDef<SplitProps> = {
  type: 'split',
  render(frame, props) {
    const { ctx, theme } = frame;
    const flip = beatProgress(frame, 'flip', 0.3);
    const result = beatProgress(frame, 'result', 0.66);
    // The answer lands under the pair, so both values stay readable while the conclusion arrives.
    if (result > 0) drawBody(ctx, props.answer.toUpperCase(), SAFE.cx - 24, 1008 + (1 - result) * 36, 744, 192, { color: theme.accent, align: 'center', maxSize: 96, maxLines: 2 });
    drawBody(ctx, [props.axis, props.baseline].filter(Boolean).join(' · ').toUpperCase(), SAFE.cx - 24, 384, 744, 96, { color: theme.dim, align: 'center', maxSize: 64, maxLines: 1 });
    const sides = [props.left, props.right];
    sides.forEach((side, index) => {
      const left = 144 + index * 384;
      const active = index === 0 || flip >= 0.5;
      ctx.save();
      if (index === 1) {
        ctx.translate(left + 180, 744);
        ctx.scale(Math.max(0.02, Math.abs(Math.cos(Math.PI * flip))), 1);
        ctx.translate(-left - 180, -744);
      }
      panel(ctx, left, 516, 360, 456, { fill: theme.panel, stroke: index === 1 && flip > 0 ? theme.accent : theme.line, lineWidth: 4 });
      drawBody(ctx, side.label.toUpperCase(), left + 180, 552, 352, 96, { color: theme.dim, align: 'center', maxSize: 64, maxLines: 1 });
      ctx.save();
      ctx.beginPath(); ctx.rect(left + 8, 672, 344, 240); ctx.clip();
      // "$3,094 /exploit": the figure stays whole and large, its unit drops to a quieter second line.
      const [figure = '', ...unit] = (active ? side.value : '?').toUpperCase().split(/\s+/);
      const shift = index === 1 ? (1 - flip) * 60 : 0;
      drawBody(ctx, figure, left + 180, 672 + shift, 312, unit.length ? 144 : 240, { color: index === 1 ? theme.accent : theme.fg, align: 'center', maxSize: 92, minSize: 48, maxLines: 1 });
      if (unit.length) drawBody(ctx, unit.join(' '), left + 180, 816 + shift, 312, 96, { color: theme.dim, align: 'center', maxSize: 56, minSize: 48, maxLines: 2 });
      ctx.restore();
      ctx.restore();
    });
  },
};
