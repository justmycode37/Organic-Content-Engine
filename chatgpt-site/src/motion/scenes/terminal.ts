import { SAFE, ease, font, prog, type TerminalProps, type SceneDef } from '../core.ts';
import { panel, text, textWidth } from '../prim.ts';
import { activeStep, drawBody } from './semantic.ts';

export const terminalScene: SceneDef<TerminalProps> = {
  type: 'terminal',
  render(frame, props) {
    const { ctx, theme } = frame;
    const rows = (props.lines ?? []).slice(0, 6);
    if (!rows.length) return;
    const index = activeStep(frame, rows.length);
    const row = rows[index]!;
    const start = index ? frame.events?.[index - 1]?.at ?? frame.hits?.[index - 1] ?? frame.dur * index / rows.length : 0;
    const command = String(row.cmd ?? '');
    const typed = frame.opening && index === 0 ? command.length : Math.ceil(Math.max(0, frame.t - start) / 0.18 * command.length);
    panel(ctx, 144, 480, 744, 456, { fill: theme.panel, stroke: row.status === 'ok' && typed >= command.length ? theme.accent : theme.line, lineWidth: 4 });
    if (command) {
      const visible = `$ ${command.slice(0, typed)}`;
      ctx.font = font(72, 800, 'mono');
      const scale = Math.min(1, 648 / Math.max(1, ctx.measureText(visible).width));
      ctx.save(); ctx.translate(192, 564); ctx.scale(scale, 1);
      text(ctx, visible, 0, 0, { size: 72, color: theme.dim, family: 'mono', weight: 800 });
      ctx.restore();
    }
    if (props.title) drawBody(ctx, props.title.toUpperCase(), SAFE.cx - 24, 384, 744, 72, { color: theme.dim, align: 'center', maxSize: 72, minSize: 56, maxLines: 1 });
    if (typed >= command.length && row.out) {
      const out = drawBody(ctx, String(row.out), SAFE.cx - 24, 672, 648, 192, { color: row.status === 'ok' ? theme.accent : row.status === 'fail' ? theme.dim : theme.fg, align: 'center', maxSize: 108, maxLines: 2 });
      if (row.status === 'fail') {
        // A failed step is struck through rather than recoloured, so it never reads as the accent result.
        const strike = ease.outCubic(prog(frame.t, start + 0.18, 0.2));
        const width = Math.max(...out.lines.map(line => textWidth(ctx, line, out.size, 800))) * strike;
        ctx.fillStyle = theme.fg;
        ctx.fillRect(SAFE.cx - 24 - width / 2, 768 - 6, width, 12);
      }
    }
  },
};
