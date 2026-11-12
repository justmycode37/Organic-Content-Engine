// arrive — a newcomer walks or runs in to join an actor at an item.
import type { Cue, Frame, ShotProps } from '../core.ts';
import type { HedgyKey } from '../actor/hedgy.ts';
import { bob, clamp, ease, phase } from '../kit/motion.ts';
import { drawStage } from '../kit/stage.ts';
import { ring, sparks } from '../kit/fx.ts';
import { ACTORS, STAGE, actorBounds, beats, cue, cuesIn, drawActor, drawItem, isItem, itemParam, itemSize, pick, type ItemId } from './common.ts';
import type { ShotDef } from './index.ts';

const SIDES = ['left', 'right'] as const, PACES = ['walk', 'run'] as const;
interface Plan { first: string; arriver: string; item: ItemId; carry?: ItemId; side: typeof SIDES[number]; pace: typeof PACES[number]; arriveAt: number }
const FLOOR = STAGE.floor, ITEM_X = STAGE.centre;
function fitScale(item: ItemId, maxW: number, maxH: number, cap: number): number {
  const size = itemSize(item);
  return Math.min(cap, maxW / size.w, maxH / size.h);
}
function plan(props: ShotProps, dur: number): Plan {
  const p = props.params, [arrival] = beats(props, dur, [0.66]);
  const carryParam = p?.carry;
  return {
    first: pick(p, 'first', ACTORS, 'hedgy'), arriver: pick(p, 'arriver', ACTORS, 'buyer'),
    item: itemParam(p, 'item', 'ticket'), carry: isItem(carryParam) ? carryParam : undefined,
    side: pick(p, 'side', SIDES, 'right'), pace: pick(p, 'pace', PACES, 'walk'),
    arriveAt: clamp(arrival ?? dur * 0.66, Math.min(0.2, dur * 0.2), Math.max(Math.min(0.2, dur * 0.2), dur - 0.16)),
  };
}
function correctedX(who: string, x: number, facing: 1 | -1, scale: number, t: number, keys: HedgyKey[]): number {
  const box = actorBounds({ who, x, y: FLOOR, facing, scale, time: t, keys });
  return x + (box.left < 28 ? 28 - box.left : box.right > 692 ? 692 - box.right : 0);
}

export const arriveShot: ShotDef = {
  name: 'arrive',
  stage: 'clean',
  describe: 'A second character walks or runs in from the side and joins the first beside an item; they turn and react together, and the newcomer can carry a small item such as cash or a contract. params: first (actor id, default hedgy), arriver (actor id, default buyer), item (any item id, default ticket), carry (optional item id, default none), side (left|right, default right), pace (walk|run, default walk). Events: 1 = the newcomer reaches the item and the first character turns to greet them; missing events use a late-arrival fallback.',
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame, dur = Math.max(0.05, frame.dur), t = clamp(frame.t, 0, dur), s = plan(props, dur);
    const entersRight = s.side === 'right', direction: 1 | -1 = entersRight ? -1 : 1;
    const firstX = entersRight ? 145 : 575, destinationX = entersRight ? 566 : 154;
    const startX = entersRight ? 675 : 45, facingFirst: 1 | -1 = entersRight ? 1 : -1;
    const itemScale = fitScale(s.item, 360, 360, 0.68), itemDims = itemSize(s.item, itemScale);
    const itemY = FLOOR - itemDims.h / 2, runDur = Math.min(0.72, Math.max(0.44, dur * 0.28));
    const moveStart = Math.max(0, s.arriveAt - runDur), approach = ease.inOutCubic(phase(t, moveStart, s.arriveAt));
    const actorX = startX + (destinationX - startX) * approach + Math.sin(t * 1.7) * 3 * phase(t, s.arriveAt, s.arriveAt + 0.3);
    const incomingKeys: HedgyKey[] = [
      { at: 0, pose: 'think', expression: 'neutral', look: 'forward' },
      { at: moveStart, pose: s.pace, expression: 'determined', look: 'forward' },
      { at: s.arriveAt, pose: 'receive', expression: 'happy', look: 'down' },
      { at: s.arriveAt + 0.25, pose: 'hold', expression: 'happy', look: 'forward' },
    ];
    const firstKeys: HedgyKey[] = [
      { at: 0, pose: 'think', expression: 'neutral', look: 'down' },
      { at: Math.max(0, s.arriveAt - 0.16), pose: 'lookup', expression: 'shocked', look: 'forward' },
      { at: s.arriveAt + 0.06, pose: 'give', expression: 'happy', look: 'forward' },
      { at: s.arriveAt + 0.36, pose: 'point', expression: 'happy', look: 'down' },
    ];
    for (let at = s.arriveAt + 0.74, i = 0; at < dur - 0.1; at += 0.52, i++) incomingKeys.push({ at, pose: i % 2 ? 'think' : 'point', expression: 'happy', look: 'down' });
    for (let at = s.arriveAt + 0.82, i = 0; at < dur - 0.1; at += 0.52, i++) firstKeys.push({ at, pose: i % 2 ? 'think' : 'point', expression: 'happy', look: 'down' });
    const itemTarget = { x: ITEM_X, y: itemY + bob(t, 1.02, 9) };
    const carriedScale = s.carry ? fitScale(s.carry, 84, 96, 0.24) : 0;
    const firstActorX = correctedX(s.first, firstX, facingFirst, 0.72, t, firstKeys);
    const inActorX = correctedX(s.arriver, actorX, direction, 0.72, t, incomingKeys);
    const carryX = inActorX + direction * 68, carryY = FLOOR - 190 + bob(t, 1.1, 5);

    drawStage(ctx, { floorY: FLOOR, line: true, shadow: [
      { x: firstX, y: FLOOR - 2, w: 160 }, { x: ITEM_X, y: FLOOR - 2, w: itemDims.w + 70 }, { x: destinationX, y: FLOOR - 2, w: 160 },
    ] });
    drawActor(ctx, { who: s.first, x: firstActorX, y: FLOOR, facing: facingFirst, scale: 0.72, time: t, look: 'down', keys: firstKeys,
      handTarget: { x: ITEM_X - facingFirst * 34, y: itemY - 16 }, reach: 0.12 + 0.5 * phase(t, s.arriveAt - 0.08, s.arriveAt + 0.34) });
    drawActor(ctx, { who: s.arriver, x: inActorX, y: FLOOR, facing: direction, scale: 0.72, time: t, look: 'down', keys: incomingKeys,
      handTarget: s.carry ? { x: carryX, y: carryY } : { x: ITEM_X - direction * 24, y: itemY - 10 }, reach: s.carry ? 0.72 : 0.22 + 0.38 * approach });
    drawItem(ctx, s.item, { x: itemTarget.x, y: itemTarget.y, t, scale: itemScale });
    if (s.carry) {
      drawItem(ctx, s.carry, { x: carryX, y: carryY, t, scale: carriedScale, rot: direction * 0.05 });
    }
    ring(ctx, destinationX, FLOOR - 82, s.arriveAt, t, { r: 54, duration: 0.34, width: 6 });
    sparks(ctx, destinationX, FLOOR - 122, s.arriveAt + 0.08, t, { count: 5, seed: frame.seed, duration: 0.38, size: 5 });
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const s = plan(props, Math.max(0.05, dur)), x = s.side === 'right' ? 566 : 154;
    return cuesIn(dur, [
      cue(Math.max(0, s.arriveAt - 0.42), s.pace === 'run' ? 'footfall' : 'step', 0.72, s.side === 'right' ? 675 : 45),
      cue(Math.max(0, s.arriveAt - 0.15), 'footfall', 0.86, x), cue(s.arriveAt, 'thump', 1.2, x), cue(s.arriveAt + 0.08, s.carry ? 'paper' : 'ding', 0.62, x),
    ]);
  },
};
