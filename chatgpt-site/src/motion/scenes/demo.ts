import { SAFE, lerp, type DemoProps, type SceneDef } from '../core.ts';
import { place } from '../fx/objects.ts';
import { panel, pixelText, pixelWidth } from '../prim.ts';
import { beatProgress, drawBody } from './semantic.ts';

export const demoScene: SceneDef<DemoProps> = {
  type: 'demo',
  layout(frame) {
    place(frame, 'device', { x: 144, y: 480, w: 744, h: 456 }, 'terminal');
  },
  render(frame, props) {
    const { ctx, theme } = frame;
    const contact = beatProgress(frame, 'contact', 0.28);
    const resolve = beatProgress(frame, 'result', 0.58);
    const resolved = resolve > 0;
    const left = 144, top = 480, width = 744;
    panel(ctx, left, top, width, 456, { fill: theme.panel, stroke: resolved ? theme.accent : theme.line, lineWidth: 4 });
    drawBody(ctx, (contact > 0 ? props.action : props.actor).toUpperCase(), left + 48, top + 24, width - 96, 112, { color: theme.dim, maxSize: 88, maxLines: 1 });
    const state = (resolved ? props.after : props.before).toUpperCase();
    const module = Math.max(8, Math.min(32, Math.floor((width - 96) / Math.max(1, pixelWidth(state, 1)))));
    ctx.save();
    ctx.translate(0, resolved ? (1 - resolve) * 36 : 0);
    pixelText(ctx, state, SAFE.cx - 24, top + 190, module, { color: resolved ? theme.accent : theme.fg, align: 'center' });
    ctx.restore();
    if (contact > 0 && !resolved) {
      const packetX = lerp(left + 48, left + width - 72, contact);
      ctx.fillStyle = theme.accent;
      ctx.fillRect(packetX, top + 360, 24, 24);
      ctx.fillStyle = theme.line;
      ctx.fillRect(left + width - 48, top + 336, 8, 72);
    }
    drawBody(ctx, (resolved && props.contrast ? props.contrast : props.target).toUpperCase(), SAFE.cx - 24, 984, 744, 112, { color: theme.fg, align: 'center', maxSize: 88, maxLines: 1 });
  },
};
