// handoff — A gives an item to B; optionally B gives something back.
// The REFERENCE shot for the general library: read it before writing a shot.
import type { Cue, Frame, ShotProps } from '../core.ts';
import { arc, clamp, ease, phase, squash, tween, bob } from '../kit/motion.ts';
import { drawStage, label } from '../kit/stage.ts';
import { ring, sparks } from '../kit/fx.ts';
import { measure } from '../kit/type.ts';
import { STAGE, actorPaw, beats, cue, cuesIn, drawActor, drawItem, itemParam, itemSize, str, isItem, type ItemId } from './common.ts';
import type { ShotDef } from './index.ts';

interface Plan { dur: number; give: number; back: number; from: string; to: string; item: ItemId; backItem?: ItemId }
function plan(props: ShotProps, dur: number): Plan {
  const p = props.params, [give, back] = beats(props, dur, [0.38, 0.72]);
  const backItem = p?.back;
  return { dur, give: give!, back: Math.max(back!, give! + 0.35), from: str(p, 'from', 'lender'), to: str(p, 'to', 'hedgy'), item: itemParam(p, 'item', 'ticket'), backItem: isItem(backItem) ? backItem : undefined };
}

const FROM_X = 140, TO_X = 580, PAW_Y = 652, SHOW_Y = 392, TRAVEL = 0.42;

export const handoffShot: ShotDef = {
  name: 'handoff',
  stage: 'clean',
  describe: 'One character shows an item, hands it paw to paw to another who lifts it up; optionally something comes back the other way. params: from, to (actors), item, back (item, optional), fromLabel, toLabel, tag (word on a hanging tag above the item). Events: 1 = the hand-over, 2 = the return.',
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame, dur = Math.max(0.05, frame.dur), t = clamp(frame.t, 0, dur), s = plan(props, dur), p = props.params;
    const size = itemSize(s.item, 0.5);
    // Key positions: shown above the giver's head, lowered to the paw, passed paw to paw, lifted by the taker.
    const show = { x: FROM_X + 108, y: SHOW_Y }, give = { x: FROM_X + 138, y: PAW_Y }, take = { x: TO_X - 138, y: PAW_Y }, lift = { x: TO_X - 108, y: SHOW_Y };
    const leave = s.give - 0.08, landed = leave + TRAVEL;
    const lower = ease.inOutCubic(phase(t, leave - 0.34, leave - 0.02)), u = tween(t, leave, TRAVEL, 0, 1, ease.inOutCubic), raise = ease.inOutCubic(phase(t, landed + 0.1, landed + 0.46));
    let pos = { x: show.x + (give.x - show.x) * lower, y: show.y + (give.y - show.y) * lower };
    if (u > 0) pos = arc(give, take, 58, u);
    if (raise > 0) pos = { x: take.x + (lift.x - take.x) * raise, y: take.y + (lift.y - take.y) * raise };
    const idle = (lower <= 0 || raise >= 1) ? bob(t, 1.6, 6) : 0, itemY = pos.y + idle;
    const catchSquash = squash(t, landed, 0.16, 0.24), enter = ease.outBack(phase(t, 0, 0.2));

    // The return item goes back at paw height once the first item is on its way up.
    const backStart = Math.max(s.back - 0.08, landed + 0.12), backU = s.backItem ? tween(t, backStart, TRAVEL, 0, 1, ease.inOutCubic) : 0;
    const backPos = arc({ x: take.x + 6, y: PAW_Y + 22 }, { x: give.x - 6, y: PAW_Y + 22 }, 44, backU);
    const backShown = s.backItem ? ease.outBack(phase(t, backStart - 0.16, backStart)) : 0;
    const backSquash = squash(t, backStart + TRAVEL, 0.14, 0.22);

    drawStage(ctx, { floorY: STAGE.floor, line: true });

    const giverHolds = 1 - phase(t, leave + 0.1, leave + 0.3), giverCatches = s.backItem ? phase(t, backStart + TRAVEL * 0.45, backStart + TRAVEL) : 0;
    drawActor(ctx, {
      who: s.from, x: FROM_X, y: STAGE.floor, time: t, look: raise > 0 && !giverCatches ? 'up' : 'forward',
      keys: [{ at: 0, pose: 'hold' }, { at: leave + 0.26, pose: s.backItem ? 'idle' : 'wave-off' }, ...(s.backItem ? [{ at: backStart + TRAVEL * 0.4, pose: 'receive' as const }, { at: backStart + TRAVEL + 0.12, pose: 'celebrate' as const, expression: 'happy' as const }] : [])],
      handTarget: giverCatches > 0 ? { x: backPos.x - 8, y: backPos.y + 16 } : { x: pos.x - 10, y: itemY + size.h * 0.32 }, reach: Math.max(giverHolds * lower, giverCatches * (1 - phase(t, backStart + TRAVEL + 0.1, backStart + TRAVEL + 0.3))),
    });
    const takerHolds = phase(t, leave + TRAVEL * 0.4, landed);
    drawActor(ctx, {
      who: s.to, x: TO_X, y: STAGE.floor, facing: -1, time: t, look: raise > 0.3 ? 'up' : 'forward',
      keys: [{ at: 0, pose: 'idle' }, { at: leave + 0.04, pose: 'receive' }, { at: landed + 0.08, pose: 'hold', expression: 'happy' }],
      handTarget: { x: pos.x + 10, y: itemY + size.h * 0.32 }, reach: takerHolds * (1 - raise),
    });

    // carried things are drawn over the bodies but stay below the chins or above the heads
    if (s.backItem && backShown > 0) drawItem(ctx, s.backItem, { x: backPos.x, y: backPos.y, t, scale: 0.5 * Math.min(1, backShown), rot: -Math.sin(backU * Math.PI) * 0.1, sx: backSquash.sx, sy: backSquash.sy });
    drawItem(ctx, s.item, { x: pos.x, y: itemY, t, rot: Math.sin(u * Math.PI) * 0.08, scale: 0.5 * enter, sx: catchSquash.sx, sy: catchSquash.sy });
    const tag = str(p, 'tag', '').toUpperCase();
    if (tag) {
      const w = measure(tag).w, tx = Math.max(w / 2 + 44, Math.min(STAGE.w - w / 2 - 44, pos.x));
      // the tag is only out while the item is held up, so it never crosses a face during the pass
      const out = Math.max(enter * (1 - phase(t, leave - 0.34, leave - 0.2)), ease.outBack(phase(t, landed + 0.3, landed + 0.52)));
      if (out > 0.02) label(ctx, tag, tx, itemY - size.h / 2 - 52, { variant: 'tag', rot: -0.04, pop: out });
    }

    const fromLabel = str(p, 'fromLabel', '').toUpperCase(), toLabel = str(p, 'toLabel', '').toUpperCase();
    if (fromLabel) label(ctx, fromLabel, Math.max(FROM_X, measure(fromLabel).w / 2 + 40), 812, { variant: 'sign', pop: ease.outBack(phase(t, 0.05, 0.3)) });
    if (toLabel) label(ctx, toLabel, Math.min(TO_X, STAGE.w - measure(toLabel).w / 2 - 40), 812, { variant: 'sign', pop: ease.outBack(phase(t, 0.12, 0.38)) });

    ring(ctx, take.x, PAW_Y, landed, t, { r: 90 });
    sparks(ctx, take.x, PAW_Y - 30, landed, t, { count: 5, seed: frame.seed });
    if (s.backItem) sparks(ctx, give.x, PAW_Y, backStart + TRAVEL, t, { count: 4, seed: frame.seed + 7 });
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const s = plan(props, Math.max(0.05, dur)), leave = s.give - 0.08, landed = leave + TRAVEL, backStart = Math.max(s.back - 0.08, landed + 0.12);
    return cuesIn(dur, [
      cue(0.03, 'pop', 0.6, FROM_X), cue(Math.max(0.05, leave - 0.3), 'rustle', 0.6, FROM_X), cue(leave, 'whump', 0.9, FROM_X), cue(landed, 'thump', 1.4, TO_X), cue(landed + 0.14, 'paper', 0.7, TO_X), cue(landed + 0.3, 'swish', 0.5, TO_X),
      ...(s.backItem ? [cue(backStart, 'slide', 0.7, TO_X), cue(backStart + TRAVEL, 'thump', 1.3, FROM_X), cue(backStart + TRAVEL + 0.1, 'coin', 0.6, FROM_X)] : []),
    ]);
  },
};
