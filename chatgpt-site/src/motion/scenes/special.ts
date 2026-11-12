import { SAFE, type Frame, type SceneDef, type SpecialProps } from '../core.ts';
import { pixelText } from '../prim.ts';
import { styleOf } from '../styles/index.ts';

/** Dispatches a style-specific scene; an unknown kind draws a visible placeholder instead of throwing. */
export const specialScene: SceneDef<SpecialProps> = {
  type: 'special',
  layout(frame, props: SpecialProps) {
    const def = styleOf(frame.style).specials?.[props.kind];
    if (!def?.layout) return;
    const result = def.schema.safeParse(props.data ?? {});
    if (result.success) def.layout(frame, { kind: props.kind, data: result.data });
  },
  render(frame: Frame, props: SpecialProps) {
    const def = styleOf(frame.style).specials?.[props.kind];
    if (def) { def.render(frame, { kind: props.kind, data: props.data ?? {} }); return; }
    pixelText(frame.ctx, `NO SCENE ${String(props.kind ?? '').toUpperCase()}`.slice(0, 40), SAFE.cx, SAFE.cy, 6, { color: frame.theme.muted, align: 'center' });
  },
};
