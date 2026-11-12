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

const FROM_X = 135, TO_X = 585, HOLD_Y = 300, TRAVEL = 0.46;

export const handoffShot: ShotDef = {
  name: 'handoff',
  stage: 'clean',
  describe: 'One character hands a big item to another; optionally something comes back. params: from, to (actors), item, back (item, optional), fromLabel, toLabel, tag (word on a hanging tag). Events: 1 = the hand-over, 2 = the return.',
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame, dur = Math.max(0.05, frame.dur), t = clamp(frame.t, 0, dur), s = plan(props, dur), p = props.params;
    const size = itemSize(s.item), half = size.w / 2;
    const start = { x: Math.max(half + 16, FROM_X + half * 0.45), y: HOLD_Y }, end = { x: Math.min(STAGE.w - half - 16, TO_X - half * 0.45), y: HOLD_Y };

    // 1. the item: held up by the giver, a small anticipation dip, then an eased arc across
    const leave = s.give - 0.1, u = tween(t, leave, TRAVEL, 0, 1, ease.inOutCubic);
    const dip = Math.sin(phase(t, leave - 0.16, leave) * Math.PI) * 18;
    const pos = arc(start, end, 110, u);
    const landed = leave + TRAVEL, catchSquash = squash(t, landed, 0.16, 0.26);
    const enter = ease.outBack(phase(t, 0, 0.22));
    const itemY = pos.y + dip + (u <= 0 || u >= 1 ? bob(t, 1.8, 7) : 0);

    // 2. the return item travels the other way, lower, after the second beat
    const backU = s.backItem ? tween(t, s.back - 0.1, TRAVEL, 0, 1, ease.inOutCubic) : 0;
    // the return item travels at paw height, below both chins, so it never covers a face
    const backFrom = { x: TO_X - 120, y: 668 }, backTo = { x: FROM_X + 128, y: 668 };
    const backPos = arc(backFrom, backTo, 46, backU);

    drawStage(ctx, { floorY: STAGE.floor, line: true });

    // 3. actors: paws follow the item while they hold it (reach eases in and out)
    const giverReach = (1 - phase(t, leave + 0.05, leave + 0.3)) * phase(t, 0.02, 0.2);
    const takerReach = phase(t, leave + 0.12, landed);
    const giverBack = s.backItem ? phase(t, s.back + 0.1, s.back - 0.1 + TRAVEL) : 0;
    drawActor(ctx, {
      who: s.from, x: FROM_X, y: STAGE.floor, time: t, look: u > 0 && u < 1 ? 'up' : 'forward',
      keys: [{ at: 0, pose: 'hold' }, { at: leave + 0.28, pose: s.backItem ? 'idle' : 'point' }, ...(s.backItem ? [{ at: s.back, pose: 'receive' as const, expression: 'happy' as const }] : [])],
      handTarget: giverBack > 0 ? { x: backPos.x - 50, y: backPos.y + 10 } : { x: pos.x - half * 0.5, y: itemY + size.h / 2 }, reach: Math.max(giverReach, giverBack),
    });
    drawActor(ctx, {
      who: s.to, x: TO_X, y: STAGE.floor, facing: -1, time: t, look: u < 1 ? 'forward' : 'up',
      keys: [{ at: 0, pose: 'idle' }, { at: leave, pose: 'receive' }, { at: landed + 0.05, pose: 'hold', expression: 'happy' }],
      handTarget: { x: pos.x + half * 0.5, y: itemY + size.h / 2 }, reach: takerReach,
    });

    drawItem(ctx, s.item, { x: pos.x, y: itemY, t, rot: Math.sin(u * Math.PI) * 0.1, scale: enter, sx: catchSquash.sx, sy: catchSquash.sy });
    const tag = str(p, 'tag', '');
    if (tag) label(ctx, tag.toUpperCase(), Math.max(measure(tag.toUpperCase()).w / 2 + 40, Math.min(STAGE.w - measure(tag.toUpperCase()).w / 2 - 40, pos.x)), itemY - size.h / 2 - 50, { variant: 'tag', rot: -0.05 + Math.sin(u * Math.PI) * 0.08, pop: enter });
    if (s.backItem && backU > 0) drawItem(ctx, s.backItem, { x: backPos.x, y: backPos.y, t, scale: 0.5, rot: -Math.sin(backU * Math.PI) * 0.12 });

    // 4. name plates under the actors
    const fromLabel = str(p, 'fromLabel', ''), toLabel = str(p, 'toLabel', '');
    if (fromLabel) label(ctx, fromLabel.toUpperCase(), Math.max(FROM_X, measure(fromLabel.toUpperCase()).w / 2 + 36), 812, { variant: 'sign', pop: ease.outBack(phase(t, 0.05, 0.3)) });
    if (toLabel) label(ctx, toLabel.toUpperCase(), Math.min(TO_X, STAGE.w - measure(toLabel.toUpperCase()).w / 2 - 36), 812, { variant: 'sign', pop: ease.outBack(phase(t, 0.12, 0.38)) });

    // 5. one clean impact when it is caught
    ring(ctx, end.x, HOLD_Y, landed, t, { r: 120 });
    sparks(ctx, end.x, HOLD_Y - 40, landed, t, { count: 5, seed: frame.seed });
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const s = plan(props, Math.max(0.05, dur)), leave = s.give - 0.1;
    return cuesIn(dur, [
      cue(0.04, 'pop', 0.6, FROM_X), cue(leave, 'swish', 1, FROM_X), cue(leave + TRAVEL, 'paper', 1.4, TO_X),
      ...(s.backItem ? [cue(s.back - 0.1, 'swish', 0.7, TO_X), cue(s.back - 0.1 + TRAVEL, 'cash', 1.3, FROM_X)] : []),
    ]);
  },
};
