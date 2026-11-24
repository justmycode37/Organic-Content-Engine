import type { ShotDef } from './index.ts';
import type { ShotProps } from '../core.ts';
import { beats, cue, cuesIn, drawItem, itemParam, itemSize, pick } from './common.ts';
import { ART } from '../kit/sprite.ts';
import { drawStage } from '../kit/stage.ts';
import { clamp, ease, lerp } from '../kit/motion.ts';
import { CAROUSEL_LENGTH, carouselPoint, drawConveyor, drawInspectionCounter, drawSuitcase } from '../props/baggage.ts';

const cx = 360, cy = 602;
const modeOf = (props: ShotProps) => pick(props.params, 'mode', ['ride', 'open', 'inspect'] as const, 'open');
function timing(props: ShotProps, dur: number) {
  if (modeOf(props) === 'inspect') return { stop: 0, open: beats(props, dur, [.32])[0]! };
  const [stop, open] = beats(props, dur, [.46, .59]);
  return { stop: stop!, open: Math.max(stop!, open!) };
}

export const baggageShot: ShotDef = {
  name: 'baggage', stage: 'clean', defaultWorld: props => modeOf(props) === 'inspect' ? 'shop' : 'airport',
  describe: 'The same blue, gold-strapped, tagged suitcase travels or opens. Ride circulates it around a moving slatted airport carousel. Open stops the belt at event 1, then hinges the lid back at event 2 to reveal the item inside. Inspect stages the stationary suitcase on a reseller counter in the shop, with event 1 opening it. params: mode (ride|open|inspect, default open), item (any drawable item inside the case, default sneaker). Use world airport for ride/open or shop for inspect.',
  render({ ctx, t, dur }, props) {
    const mode = modeOf(props);
    const { stop, open } = timing(props, dur);
    const travel = clamp(t / Math.max(.001, stop));
    const distance = mode === 'ride'
      ? CAROUSEL_LENGTH * (.64 + t / Math.max(4.5, dur))
      : 19 - CAROUSEL_LENGTH * .43 * (1 - travel) ** 1.4;
    const point = carouselPoint(distance);
    const inspect = mode === 'inspect';
    const x = inspect ? cx : cx + point.x * ART, y = inspect ? cy + 45 : cy + (point.y - 3) * ART;
    const opened = mode === 'ride' ? 0 : ease.inOutCubic((t - open) / Math.max(.10, Math.min(.64, (dur - open) * .78)));
    // A camera move around the stopped bag shows its contents at reading size.
    const zoom = 1 + (inspect ? .18 : .6) * opened;
    ctx.save();
    ctx.translate(cx, cy - 26);
    ctx.scale(zoom, zoom);
    ctx.translate(-cx, -(cy - 26));
    drawStage(ctx);
    if (!inspect) {
      // Keep the bag inside the wide frame as it rounds either end. This
      // framing applies to the carousel only; the terminal remains full bleed.
      const wide = lerp(.87, 1, opened);
      ctx.translate(cx, cy); ctx.scale(wide, wide); ctx.translate(-cx, -cy);
    }
    if (inspect) drawInspectionCounter(ctx, cx, y + 28);
    else drawConveyor(ctx, { x: cx, y: cy, distance });
    const scale = inspect ? 1.14 : lerp(.57, .74, clamp((point.y / 10.83 + 1) / 2));
    const id = itemParam(props.params, 'item', 'sneaker'), size = itemSize(id);
    drawSuitcase(ctx, { x, y: y - 44 * scale, scale, open: opened }, () => {
      if (opened < .16) return;
      const rise = ease.outCubic((opened - .16) / .84);
      drawItem(ctx, id, { x: 0, y: lerp(-16, -55, rise), t, scale: Math.min(185 / size.w, 123 / size.h), alpha: rise });
    });
    ctx.restore();
  },
  cues(props, dur) {
    const mode = modeOf(props);
    if (mode === 'ride') return [];
    const { stop, open } = timing(props, dur);
    const sounds = [cue(open, 'click', .78), cue(open + .08, 'creak', .38)];
    if (mode === 'open') sounds.push(cue(stop, 'clunk', .58));
    return cuesIn(dur, sounds);
  },
};
