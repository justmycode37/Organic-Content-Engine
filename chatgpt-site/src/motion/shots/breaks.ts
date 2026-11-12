// breaks — a tool hits an asset; the impact leaves a crack and scatters pieces.
import type { Cue, Frame, ShotProps } from '../core.ts';
import type { HedgyKey } from '../actor/hedgy.ts';
import { Grid, PAL } from '../kit/pixel.ts';
import { drawSprite } from '../kit/sprite.ts';
import { arc, clamp, ease, phase, squash } from '../kit/motion.ts';
import { drawStage } from '../kit/stage.ts';
import { ring, sparks } from '../kit/fx.ts';
import { ACTORS, STAGE, actorBounds, beats, cue, cuesIn, drawActor, drawItem, itemParam, itemSize, num, pick, type ItemId } from './common.ts';
import type { ShotDef } from './index.ts';

const CAUSES = ['pin', 'hammer', 'weight'] as const;
const hammer = new Grid(44, 48)
  .poly([{ x: 27, y: 19 }, { x: 33, y: 24 }, { x: 21, y: 44 }, { x: 15, y: 41 }], PAL.wood3)
  .poly([{ x: 25, y: 6 }, { x: 41, y: 9 }, { x: 39, y: 23 }, { x: 21, y: 20 }, { x: 20, y: 11 }], PAL.grey4)
  .rect(27, 9, 11, 3, PAL.grey2).rect(22, 18, 17, 3, PAL.grey5).outline(PAL.ink)
  .sprite('shot-breaks:hammer');
const pin = new Grid(30, 46)
  .ellipse(15, 8, 9, 8, PAL.red2).ellipse(12, 5, 4, 3, PAL.red1)
  .rect(13, 14, 4, 20, PAL.grey2).poly([{ x: 12, y: 33 }, { x: 18, y: 33 }, { x: 15, y: 45 }], PAL.grey1)
  .outline(PAL.ink).sprite('shot-breaks:pin');
const weight = new Grid(46, 42)
  .rect(19, 2, 8, 8, PAL.grey3).rect(16, 8, 14, 5, PAL.grey4)
  .poly([{ x: 11, y: 13 }, { x: 35, y: 13 }, { x: 42, y: 33 }, { x: 37, y: 39 }, { x: 9, y: 39 }, { x: 4, y: 33 }], PAL.grey4)
  .rect(10, 18, 27, 4, PAL.grey2).rect(8, 32, 31, 4, PAL.grey5).outline(PAL.ink)
  .sprite('shot-breaks:weight');
const crack = new Grid(48, 48)
  .line({ x: 24, y: 0 }, { x: 22, y: 10 }, 3, PAL.ink).line({ x: 22, y: 10 }, { x: 29, y: 17 }, 3, PAL.ink)
  .line({ x: 29, y: 17 }, { x: 20, y: 26 }, 3, PAL.ink).line({ x: 20, y: 26 }, { x: 27, y: 35 }, 3, PAL.ink)
  .line({ x: 27, y: 35 }, { x: 23, y: 48 }, 3, PAL.ink)
  .line({ x: 21, y: 10 }, { x: 12, y: 14 }, 2, PAL.paper).line({ x: 29, y: 17 }, { x: 38, y: 13 }, 2, PAL.paper)
  .line({ x: 20, y: 26 }, { x: 11, y: 31 }, 2, PAL.paper).line({ x: 27, y: 35 }, { x: 36, y: 40 }, 2, PAL.paper)
  .sprite('shot-breaks:crack');

interface Plan { item: ItemId; who: string; cause: typeof CAUSES[number]; hits: number; times: number[]; travel: number }
const ITEM_X = 456, OWNER_X = 128;
function eventTimes(props: ShotProps, dur: number, count: number, travel: number): number[] {
  const fractions = Array.from({ length: count }, (_, i) => count === 1 ? 0.34 : 0.2 + i * 0.23);
  const requested = beats(props, dur, fractions), first = Math.min(0.12, dur * 0.1), last = Math.max(first, dur - travel - 0.08);
  const gap = count > 1 ? Math.min(0.48, (last - first) / (count - 1)) : 0, result: number[] = [];
  for (let i = 0; i < count; i++) {
    const low = i ? result[i - 1]! + gap : first, high = Math.max(low, last - gap * (count - 1 - i));
    result.push(clamp(requested[i] ?? low, low, high));
  }
  return result;
}
function plan(props: ShotProps, dur: number): Plan {
  const eventCount = (props.events ?? []).filter(e => Number.isFinite(e.at)).length;
  const hits = Math.round(num(props.params, 'hits', eventCount ? clamp(eventCount, 1, 3) : 1, 1, 3));
  const travel = Math.min(0.68, Math.max(0.5, dur * 0.26));
  return { item: itemParam(props.params, 'item', 'piggy'), who: pick(props.params, 'who', ACTORS, 'hedgy'), cause: pick(props.params, 'cause', CAUSES, 'hammer'), hits, travel, times: eventTimes(props, dur, hits, travel) };
}
function actorKeys(s: Plan, dur: number): HedgyKey[] {
  const keys: HedgyKey[] = [{ at: 0, pose: 'think', expression: 'neutral', look: 'up' }];
  s.times.forEach((at, i) => keys.push(
    { at: Math.max(0, at - 0.12), pose: 'push', expression: 'determined', look: 'up' },
    { at: at + 0.05, pose: 'shock', expression: 'shocked', look: 'forward' },
    { at: at + 0.28, pose: i === s.times.length - 1 ? 'sweat' : 'point', expression: 'worried', look: 'down' },
  ));
  for (let at = (s.times[s.times.length - 1] ?? 0) + 0.56, i = 0; at < dur - 0.1; at += 0.52, i++) keys.push({ at, pose: i % 2 ? 'think' : 'sweat', expression: 'worried', look: 'down' });
  return keys.sort((a, b) => a.at - b.at);
}
function toolSprite(cause: Plan['cause']) { return cause === 'hammer' ? hammer : cause === 'pin' ? pin : weight; }

export const breaksShot: ShotDef = {
  name: 'breaks',
  stage: 'clean',
  describe: 'A pin, hammer, or falling weight strikes any item; the asset visibly cracks, shrinks, and sheds small pieces as its owner recoils. params: who (owner actor id, default hedgy), item (any item id, default piggy), cause (pin|hammer|weight, default hammer), hits (1–3, default event count or 1). Events: one per strike; each event times the tool impact, crack, flying fragments, and owner reaction, with evenly spaced fallback hits.',
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame, dur = Math.max(0.05, frame.dur), t = clamp(frame.t, 0, dur), s = plan(props, dur), keys = actorKeys(s, dur), dims = itemSize(s.item);
    const baseScale = Math.min(0.68, 330 / dims.w, 350 / dims.h), done = s.times.filter(at => t >= at).length;
    const damage = Math.min(0.58, done * 0.22), itemScale = baseScale * (1 - damage), itemW = dims.w * itemScale, itemH = dims.h * itemScale;
    const itemY = STAGE.floor - itemH / 2 + Math.sin(t * 2.1) * 6, itemTop = itemY - itemH / 2;
    const actorTarget = { x: ITEM_X - itemW * 0.34, y: itemY + itemH * 0.08 };
    const currentHit = [...s.times].reverse().findIndex(at => t >= at);
    const hitIndex = currentHit < 0 ? -1 : s.times.length - 1 - currentHit;
    const hitAt = hitIndex >= 0 ? s.times[hitIndex]! : 0;
    const hitAge = hitIndex >= 0 ? Math.max(0, t - hitAt) : 0;
    const nextIndex = s.times.findIndex(at => t < at + 0.24);
    const toolIndex = nextIndex >= 0 ? nextIndex : Math.max(0, s.times.length - 1);
    const toolHitAt = s.times[toolIndex] ?? 0, attackStart = toolHitAt - s.travel;
    const impactP = ease.inOutCubic(phase(t, attackStart, toolHitAt));
    const tool = toolSprite(s.cause), toolScale = Math.min(0.45, 102 / tool.w, 112 / tool.h);
    const from = s.cause === 'hammer' ? { x: ITEM_X + 125, y: itemTop - 96 } : { x: ITEM_X + 42, y: itemTop - 112 };
    const strike = s.cause === 'hammer' ? { x: ITEM_X + 48, y: itemTop + 36 } : { x: ITEM_X + 34, y: itemTop + 30 };
    let toolX = from.x, toolY = from.y + Math.sin(t * 2.2) * 5, toolRot = s.cause === 'hammer' ? -0.58 + Math.sin(t * 1.9) * 0.06 : Math.sin(t * 1.9) * 0.025;
    if (t >= attackStart) {
      const hitPos = arc(from, strike, s.cause === 'hammer' ? -28 : 0, impactP);
      const rebound = ease.outCubic(phase(t, toolHitAt + 0.04, toolHitAt + 0.24));
      const retract = s.cause === 'hammer' ? 0.18 : 0.04;
      toolX = hitPos.x + (from.x - hitPos.x) * rebound * retract;
      toolY = hitPos.y - rebound * 9 + Math.sin(t * 3.2) * 2;
      toolRot = s.cause === 'hammer' ? -0.58 + impactP * 1.28 - rebound * 0.12 + Math.sin(t * 2.4) * 0.015 : Math.sin(t * 2.4) * 0.012;
    }
    const actorRawX = OWNER_X + Math.sin(t * 1.7) * 3;
    const actorBoundsNow = actorBounds({ who: s.who, x: actorRawX, y: STAGE.floor, facing: 1, scale: 0.76, time: t, keys });
    const actorX = actorRawX + (actorBoundsNow.left < 28 ? 28 - actorBoundsNow.left : actorBoundsNow.right > 692 ? 692 - actorBoundsNow.right : 0);

    drawStage(ctx, { floorY: STAGE.floor, line: true, shadow: [
      { x: actorX, y: STAGE.floor - 2, w: 164 }, { x: ITEM_X, y: STAGE.floor - 2, w: Math.min(390, itemW + 50) },
    ] });
    drawActor(ctx, { who: s.who, x: actorX, y: STAGE.floor, facing: 1, scale: 0.76, time: t, look: 'up', keys,
      handTarget: actorTarget, reach: 0.18 + 0.38 * phase(t, (s.times[0] ?? 0) - 0.18, (s.times[0] ?? 0) + 0.2) });
    const itemHit = hitIndex >= 0 ? squash(t, hitAt, 0.18, 0.22) : { sx: 1, sy: 1 };
    drawItem(ctx, s.item, { x: ITEM_X, y: itemY, t, scale: itemScale, sx: itemHit.sx, sy: itemHit.sy, rot: done ? 0.012 * Math.sin(hitAge * 8) : 0 });
    if (done > 0) drawSprite(ctx, crack, ITEM_X, itemY, { sx: itemW / crack.w, sy: itemH / crack.h, alpha: 0.66 + Math.min(0.2, (done - 1) * 0.12) + Math.sin(t * 2.4) * 0.08 });
    drawSprite(ctx, tool, toolX, toolY, { scale: toolScale, rot: toolRot });

    if (hitIndex >= 0) {
      const flying = hitAge < 0.64, p = ease.outCubic(phase(hitAge, 0.02, 0.64));
      const alpha = flying ? 1 - ease.outCubic(phase(hitAge, 0.35, 0.64)) : 0.82;
      const fragmentScale = Math.min(0.12, 62 / Math.max(dims.w, dims.h));
      const fragments = [
        { from: { x: ITEM_X - itemW * 0.22, y: itemY - itemH * 0.08 }, to: { x: ITEM_X - itemW * 0.44, y: itemY - 36 } },
        { from: { x: ITEM_X + itemW * 0.08, y: itemY + itemH * 0.12 }, to: { x: ITEM_X + itemW * 0.16, y: itemY + 42 } },
        { from: { x: ITEM_X + itemW * 0.24, y: itemY - itemH * 0.16 }, to: { x: ITEM_X + itemW * 0.42, y: itemY - 18 } },
      ];
      fragments.forEach((fragment, index) => {
        const landed = { x: fragment.to.x, y: fragment.to.y + Math.sin(t * 2 + index) * 2 };
        const pos = flying ? arc(fragment.from, landed, 35 + index * 8, p) : landed;
        drawItem(ctx, s.item, { x: pos.x, y: pos.y, t, scale: fragmentScale, rot: flying ? (index - 1) * 0.16 * p : (index - 1) * 0.16 + Math.sin(t * 1.8 + index) * 0.03, alpha });
      });
      if (flying) {
        ring(ctx, strike.x, strike.y, hitAt, t, { r: 58, duration: 0.34, width: 7, color: PAL.paper });
        sparks(ctx, strike.x, strike.y, hitAt, t, { count: 5, seed: frame.seed + hitIndex, duration: 0.38, size: 6, color: PAL.gold2 });
      }
    }
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const s = plan(props, Math.max(0.05, dur)), x = ITEM_X + 42;
    return cuesIn(dur, s.times.flatMap((at, i) => [
      cue(Math.max(0, at - s.travel), s.cause === 'weight' ? 'rumble' : 'swish', 0.74, x),
      cue(at, s.cause === 'pin' ? 'pop' : s.cause === 'weight' ? 'thud' : 'impact', 1.3, x),
      cue(at + 0.04, 'crack', 1.15, ITEM_X), cue(at + 0.12, i === s.hits - 1 ? 'shatter' : 'clack', 0.84, ITEM_X),
    ]));
  },
};
