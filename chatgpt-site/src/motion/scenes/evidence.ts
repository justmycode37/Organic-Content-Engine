import { SAFE, clamp, lerp, type EvidenceProps, type SceneDef } from '../core.ts';
import { panel } from '../prim.ts';
import { beatProgress, drawBody } from './semantic.ts';

export const evidenceScene: SceneDef<EvidenceProps> = {
  type: 'evidence',
  render(frame, props) {
    const { ctx, theme } = frame;
    const focus = beatProgress(frame, 'focus', 0.3);
    const result = beatProgress(frame, 'result', 0.65);
    const image = props.asset ? frame.assets[props.asset] : undefined;
    if (props.asset && !image) {
      drawBody(ctx, 'SOURCE IMAGE MISSING', SAFE.cx - 24, 540, 744, 240, { color: theme.dim, align: 'center', maxSize: 72 });
    } else if (image) {
      const raw = props.rect ?? { x: 0, y: 0, w: image.width, h: image.height };
      const sourceX = clamp(raw.x, 0, image.width - 1), sourceY = clamp(raw.y, 0, image.height - 1);
      const sourceW = clamp(raw.w, 1, image.width - sourceX), sourceH = clamp(raw.h, 1, image.height - sourceY);
      const width = 744, height = Math.min(456, width * sourceH / sourceW);
      const top = 636 - height / 2;
      panel(ctx, 132, top - 24, 768, height + 48, { fill: theme.fg, stroke: theme.line, lineWidth: 4 });
      ctx.save();
      ctx.beginPath(); ctx.rect(144, top, width, height); ctx.clip();
      const zoom = lerp(1, 1.04, focus);
      ctx.translate(516, 636); ctx.scale(zoom, zoom); ctx.translate(-516, -636);
      ctx.drawImage(image, sourceX, sourceY, sourceW, sourceH, 144, top, width, height);
      ctx.restore();
      ctx.fillStyle = theme.accent;
      ctx.fillRect(144, top + height + 12, width * focus, 8);
    } else {
      drawBody(ctx, `“${props.quote ?? ''}”`, SAFE.cx - 24, 480, 744, 312, { color: focus > 0 ? theme.accent : theme.fg, align: 'center', maxSize: 96, maxLines: 3 });
    }
    drawBody(ctx, result > 0 ? props.claim : [props.source, props.date].filter(Boolean).join(' · '), SAFE.cx - 24, 912, 744, 144, { color: result > 0 ? theme.accent : theme.dim, align: 'center', maxSize: 72, maxLines: 2 });
  },
};
