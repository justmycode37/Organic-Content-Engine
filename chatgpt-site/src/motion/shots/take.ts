// take — one actor removes repeated pieces from another actor's asset.
import type { Cue, Frame, ShotProps } from '../core.ts';
import type { HedgyKey } from '../actor/hedgy.ts';
import { arc, bob, clamp, ease, phase, squash } from '../kit/motion.ts';
import { drawStage } from '../kit/stage.ts';
import { ring, sparks } from '../kit/fx.ts';
import { ACTORS, STAGE, actorBounds, beats, cue, cuesIn, drawActor, drawItem, itemParam, itemSize, num, pick, type ItemId } from './common.ts';
import type { ShotDef } from './index.ts';

const AMOUNTS = ['bite', 'half'] as const;
interface Plan { item: ItemId; owner: string; taker: string; amount: typeof AMOUNTS[number]; count: number; times: number[]; travel: number }
const OWNER_X = 92, TAKER_X = 628, ITEM_X = 346, BASE_SCALE = 0.6, PAW_Y = 620;

function eventTimes(props: ShotProps, dur: number, count: number, travel: number): number[] {
  const fractions = Array.from({ length: count }, (_, i) => count === 1 ? 0.48 : 0.2 + i * 0.28);
  const requested = beats(props, dur, fractions);
  const first = Math.min(0.14, dur * 0.1), latest = Math.max(first, dur - travel - 0.06);
  const gap = count > 1 ? Math.min(0.42, (latest - first) / (count - 1)) : 0;
  const result: number[] = [];
  for (let i = 0; i < count; i++) {
    const low = i === 0 ? first : result[i - 1]! + gap;
    const high = Math.max(low, latest - gap * (count - 1 - i));
    result.push(clamp(requested[i] ?? low, low, high));
  }
  return result;
}

function plan(props: ShotProps, dur: number): Plan {
  const p = props.params, count = Math.round(num(p, 'repeat', 1, 1, 3));
  const travel = dur < 1.7 ? Math.min(0.24, dur * 0.18) : Math.min(0.42, Math.max(0.3, dur * 0.2));
  return {
    item: itemParam(p, 'item', 'ticket'), owner: pick(p, 'owner', ACTORS, 'hedgy'), taker: pick(p, 'taker', ACTORS, 'buyer'),
    amount: pick(p, 'amount', AMOUNTS, 'bite'), count, travel, times: eventTimes(props, dur, count, travel),
  };
}

function keysFor(times: number[], dur: number, side: 'owner' | 'taker'): HedgyKey[] {
  const keys: HedgyKey[] = [{ at: 0, pose: side === 'owner' ? 'hold' : 'think', expression: 'neutral', look: 'forward' }];
  times.forEach((at, i) => {
    if (side === 'owner') keys.push({ at: Math.max(0, at - 0.12), pose: 'squeezed', expression: 'worried' }, { at: at + 0.22, pose: i === times.length - 1 ? 'sweat' : 'empty', expression: 'worried' });
    else keys.push({ at: at + 0.08, pose: 'receive', expression: 'determined' }, { at: at + 0.28, pose: 'hold', expression: i === times.length - 1 ? 'happy' : 'neutral' });
  });
  for (let at = (times[times.length - 1] ?? 0) + 0.48, i = 0; at < dur - 0.12; at += 0.54, i++) {
    keys.push({ at, pose: side === 'owner' ? (i % 2 ? 'think' : 'wave-off') : (i % 2 ? 'celebrate' : 'point'), expression: side === 'owner' ? 'worried' : 'happy' });
  }
  return keys.sort((a, b) => a.at - b.at);
}

export const takeShot: ShotDef = {
  name: 'take',
  stage: 'clean',
  describe: 'One actor reaches in and takes a small bite or a half-sized piece from another actor’s item; each piece flies into the taker’s paw while the owner’s item visibly shrinks. params: owner (actor id, default hedgy), taker (actor id, default buyer), item (any item id, default ticket), amount (bite|half, default bite), repeat (1–3 takes, default 1). Events: one per take; each event launches a piece toward the taker and reduces the owner’s item, with evenly spaced fallback beats.',
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame, dur = Math.max(0.05, frame.dur), t = clamp(frame.t, 0, dur), s = plan(props, dur), dims = itemSize(s.item);
    const ownerKeys = keysFor(s.times, dur, 'owner'), takerKeys = keysFor(s.times, dur, 'taker');
    const bite = s.amount === 'bite' ? 0.1 : 0.28;
    const done = s.times.filter(at => t >= at).length;
    const activeIndex = s.times.findIndex(at => t >= at && t <= at + s.travel);
    const scaleFactor = Math.max(0.34, (1 - bite) ** done);
    const sourceScale = BASE_SCALE * scaleFactor;
    const sourceY = STAGE.floor - dims.h * sourceScale / 2 + bob(t, 1.05, 8);
    const pieceScale = Math.min(0.15, 78 / Math.max(dims.w, dims.h));
    const piecesLanded = s.times.filter(at => t > at + s.travel).length;
    const ownerRawX = OWNER_X + Math.sin(t * 1.7) * 3, takerRawX = TAKER_X + Math.sin(t * 1.8) * 3;
    const ownerBounds = actorBounds({ who: s.owner, x: ownerRawX, y: STAGE.floor, facing: 1, scale: 0.72, time: t, keys: ownerKeys });
    const takerBounds = actorBounds({ who: s.taker, x: takerRawX, y: STAGE.floor, facing: -1, scale: 0.72, time: t, keys: takerKeys });
    const ownerX = ownerRawX + (ownerBounds.left < 28 ? 28 - ownerBounds.left : ownerBounds.right > 692 ? 692 - ownerBounds.right : 0);
    const takerX = takerRawX + (takerBounds.left < 28 ? 28 - takerBounds.left : takerBounds.right > 692 ? 692 - takerBounds.right : 0);
    const hand = { x: takerX - 74, y: PAW_Y + bob(t, 0.86, 3) };
    const ownerTarget = { x: ITEM_X - 28, y: sourceY - Math.min(30, dims.h * sourceScale * 0.12) };

    drawStage(ctx, { floorY: STAGE.floor, line: true, shadow: [
      { x: ownerX, y: STAGE.floor - 2, w: 156 }, { x: ITEM_X, y: STAGE.floor - 2, w: Math.min(330, dims.w * sourceScale) }, { x: takerX, y: STAGE.floor - 2, w: 156 },
    ] });
    drawActor(ctx, { who: s.owner, x: ownerX, y: STAGE.floor, facing: 1, scale: 0.72, time: t, look: 'forward', keys: ownerKeys,
      handTarget: ownerTarget, reach: 0.2 + (activeIndex >= 0 ? 0.25 : 0) });
    drawActor(ctx, { who: s.taker, x: takerX, y: STAGE.floor, facing: -1, scale: 0.72, time: t, look: 'down', keys: takerKeys,
      handTarget: hand, reach: 0.35 + (activeIndex >= 0 ? 0.35 : 0) });

    const squashItem = squash(t, s.times[Math.max(0, done - 1)] ?? -1, 0.12, 0.2);
    drawItem(ctx, s.item, { x: ITEM_X, y: sourceY, t, scale: sourceScale, sx: squashItem.sx, sy: squashItem.sy });

    // The pieces are tiny copies of the selected asset, so the removed part stays
    // recognizable even when the story uses an unusual prop.
    for (let i = 0; i < piecesLanded; i++) {
      const stack = Math.min(i, 2), pos = { x: hand.x + stack * 13, y: hand.y - stack * 7 };
      drawItem(ctx, s.item, { x: pos.x, y: pos.y, t, scale: pieceScale, rot: (i % 2 ? -1 : 1) * 0.07 });
    }
    if (activeIndex >= 0) {
      const at = s.times[activeIndex]!, u = ease.inOutCubic(phase(t, at, at + s.travel));
      const from = { x: ITEM_X + Math.min(92, dims.w * sourceScale * 0.22), y: sourceY - Math.min(18, dims.h * sourceScale * 0.08) };
      const pos = arc(from, hand, 44, u);
      const squashPiece = squash(t, at + s.travel, 0.16, 0.18);
      drawItem(ctx, s.item, { x: pos.x, y: pos.y + bob(t - at, 0.5, 3), t, scale: pieceScale, rot: -0.12 * Math.sin(u * Math.PI), sx: squashPiece.sx, sy: squashPiece.sy });
      ring(ctx, ITEM_X + 56, sourceY, at, t, { r: 38, width: 5, duration: 0.25 });
      sparks(ctx, hand.x, hand.y, at + s.travel, t, { count: 4, seed: frame.seed + activeIndex, duration: 0.3, size: 6 });
    }
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const s = plan(props, Math.max(0.05, dur));
    return cuesIn(dur, s.times.flatMap((at, i) => [
      cue(Math.max(0, at - 0.12), 'rustle', 0.56, ITEM_X), cue(at, 'swish', 0.88, ITEM_X + 70),
      cue(at + s.travel, i === s.count - 1 ? 'thump' : 'coin', 1.1, TAKER_X - 74),
    ]));
  },
};
