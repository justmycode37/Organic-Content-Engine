// queue — each buyer gets a turn while a bold market price ratchets one step.
import type { Cue, Frame, ShotProps } from '../core.ts';
import { arc, clamp, ease, lerp, phase, tween, bob } from '../kit/motion.ts';
import { drawStage, priceLine } from '../kit/stage.ts';
import { ring } from '../kit/fx.ts';
import { boothCounter } from '../props/booth.ts';
import { ACTORS, STAGE, actorFace, actorPaw, beats, cue, cuesIn, drawActor, drawItem, itemParam, itemSize, num, pick, str, type ActorId, type ItemId } from './common.ts';
import type { ShotDef } from './index.ts';

type Place = 'booth' | 'shop';
type Direction = 'up' | 'down';
interface QueuePlan {
  crowd: ActorId[];
  place: Place;
  sign: string;
  dir: Direction;
  item: ItemId;
  times: number[];
}
interface Point { x: number; y: number }

const PLACE_X = 414;
const BUYER_WAIT_X = 230;
const BUYER_STEP_X = 300;
const BUYER_EXIT_X = 492;
const ITEM_FLIGHT = 0.34;
const EXIT_DURATION = 0.41;
const STEP_IN = 0.42;
const FLOOR = STAGE.floor;
const CROWD_DEFAULT: ActorId[] = ['fan1', 'fan2', 'fan3'];

function orderedBeats(props: ShotProps, dur: number, count: number): number[] {
  const fractions = Array.from({ length: count }, (_, i) => count === 2 ? 0.30 + i * 0.38 : 0.22 + i * 0.24);
  const result = beats(props, dur, fractions).map(value => clamp(value, 0, dur));
  const gap = Math.min(0.18, dur / (count + 1) * 0.52);
  for (let i = 1; i < result.length; i++) result[i] = Math.max(result[i]!, result[i - 1]! + gap);
  if (result.length && result[result.length - 1]! > dur) {
    result[result.length - 1] = dur;
    for (let i = result.length - 2; i >= 0; i--) result[i] = Math.min(result[i]!, result[i + 1]! - gap);
  }
  return result.map(value => clamp(value, 0, dur));
}

function parseCrowd(props: ShotProps['params']): ActorId[] {
  const raw = props?.crowd;
  if (Array.isArray(raw)) {
    const actors = raw.filter((who): who is ActorId => typeof who === 'string' && ACTORS.includes(who as typeof ACTORS[number])).slice(0, 3);
    if (actors.length >= 2) return actors;
  }
  const count = typeof raw === 'number' ? raw : num(props, 'steps', 3, 2, 3);
  return CROWD_DEFAULT.slice(0, clamp(Math.round(count), 2, 3));
}

function plan(props: ShotProps, dur: number): QueuePlan {
  const crowd = parseCrowd(props.params);
  const sign = str(props.params, 'sign', 'BUY').toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 8) || 'BUY';
  return {
    crowd,
    place: pick(props.params, 'place', ['booth', 'shop'] as const, 'booth'),
    sign,
    dir: pick(props.params, 'dir', ['up', 'down'] as const, 'up'),
    item: itemParam(props.params, 'item', 'ticket'),
    times: orderedBeats(props, dur, crowd.length),
  };
}

function stagePoints(dir: Direction, count: number) {
  const rise = 96, run = 70;
  let x = 40, y = dir === 'up' ? 650 : 110, distance = 0;
  const points: Point[] = [{ x, y }], ends: Point[] = [], distances: number[] = [];
  for (let i = 0; i < count; i++) {
    x += run;
    points.push({ x, y }); distance += run;
    y += dir === 'up' ? -rise : rise;
    points.push({ x, y }); distance += rise;
    ends.push({ x, y }); distances.push(distance);
  }
  return { points, ends, distances, total: distance };
}

function progressAt(t: number, times: readonly number[], distances: readonly number[], total: number): number {
  let distance = 0;
  for (let i = 0; i < times.length; i++) {
    if (t < times[i]!) break;
    const from = i === 0 ? 0 : distances[i - 1]!;
    const to = distances[i]!;
    distance = lerp(from, to, ease.outCubic(phase(t, times[i]!, times[i]! + 0.22)));
  }
  return clamp(distance / total);
}

function heldGeometry(who: ActorId, x: number, t: number, item: ItemId) {
  const actor = { who, x, y: FLOOR, facing: 1 as const, time: t, pose: 'hold' as const };
  const face = actorFace(actor), paw = actorPaw(actor), dims = itemSize(item, 0.5);
  const lowY = Math.max(paw.y + 16, face.y + face.r + dims.h / 2 + 14);
  if (lowY + dims.h / 2 <= FLOOR - 4) {
    const center = { x: clamp(paw.x + Math.min(38, dims.w * 0.2), dims.w / 2 + 24, STAGE.w - dims.w / 2 - 24), y: lowY };
    return { center, hand: { x: center.x - dims.w * 0.34, y: center.y - dims.h * 0.18 }, dims };
  }
  const center = {
    x: clamp(face.x, dims.w / 2 + 24, STAGE.w - dims.w / 2 - 24),
    y: Math.max(24 + dims.h / 2, face.y - face.r - dims.h / 2 - 16),
  };
  return { center, hand: { x: center.x, y: center.y + dims.h / 2 + 8 }, dims };
}

function handoverFlight(from: Point, to: Point, p: number): Point {
  if (p < 0.60) return { x: from.x, y: lerp(from.y, to.y, ease.inOutCubic(p / 0.60)) };
  return arc({ x: from.x, y: to.y }, to, 14, ease.inOutCubic((p - 0.60) / 0.40));
}

export const queueShot: ShotDef = {
  name: 'queue',
  stage: 'clean',
  describe: 'Two or three full-size buyers step up one at a time at a full-size booth or shop and receive an item at the paw as a thick price line ratchets one step per purchase. params: crowd (2–3 actor ids or count, default fan1/fan2/fan3), steps (2–3 buyers when crowd is omitted, default 3), place (booth|shop, default booth), sign (word, default BUY), item (any item id, default ticket), dir (up|down, default up). Events: one per purchase in order; each buyer reaches the counter, gets a half-size item at the paw, and triggers one bold price step.',
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame, dur = Math.max(0.05, frame.dur), t = clamp(frame.t, 0, dur), s = plan(props, dur);
    const path = stagePoints(s.dir, s.crowd.length);
    const lineProgress = progressAt(t, s.times, path.distances, path.total);
    const placeCenterY = FLOOR - itemSize(s.place).h / 2;
    const counter = s.place === 'booth' ? boothCounter({ x: PLACE_X, y: FLOOR, scale: 1 }) : undefined;
    const service = counter
      ? { x: counter.x + counter.w * 0.5, y: counter.y + counter.h * 0.38 }
      : { x: PLACE_X, y: FLOOR - 205 };
    drawStage(ctx, { floorY: FLOOR, line: true, shadow: [{ x: PLACE_X, y: FLOOR - 3, w: 340 }] });
    // Keep the market stair on the open left side, above the buyers' faces.
    const head = priceLine(ctx, path.points, { progress: lineProgress, width: 42 });
    drawItem(ctx, s.place, {
      x: PLACE_X, y: placeCenterY, t, scale: 1,
      sign: s.sign, clerk: s.place === 'booth', stock: 0, stockKind: 'none',
    });

    for (let i = 0; i < s.crowd.length; i++) {
      const who = s.crowd[i]!, event = s.times[i]!, last = i === s.crowd.length - 1;
      const visibleAt = i === 0 ? 0 : Math.max(0, event - STEP_IN);
      if (t < visibleAt) continue;
      const moveStart = Math.max(visibleAt, event - STEP_IN);
      const exitStart = event + 0.18, exitEnd = exitStart + EXIT_DURATION;
      const x = t < moveStart ? BUYER_WAIT_X
        : t < event ? tween(t, moveStart, Math.max(0.10, event - moveStart), BUYER_WAIT_X, BUYER_STEP_X, ease.inOutCubic)
          : last || t < exitStart ? BUYER_STEP_X
            : t < exitEnd ? tween(t, exitStart, EXIT_DURATION, BUYER_STEP_X, BUYER_EXIT_X, ease.inOutCubic) : BUYER_EXIT_X;
      const presence = last ? 1 : 1 - phase(t, exitEnd - 0.04, exitEnd + 0.12);
      const held = heldGeometry(who, x, t, s.item);
      const heldAtStep = heldGeometry(who, BUYER_STEP_X, t, s.item);
      const itemStart = event + 0.04, itemArrives = itemStart + ITEM_FLIGHT;
      const itemU = ease.inOutCubic(phase(t, itemStart, itemArrives));
      const target = { x: held.center.x, y: held.center.y + bob(t, 1.45, 3) };
      const flightTarget = heldAtStep.center;
      const safeSourceX = Math.min(STAGE.w - held.dims.w / 2 - 24, service.x + 176);
      const from = { x: safeSourceX, y: service.y - held.dims.h * 0.24 };
      const itemPos = t < itemArrives ? handoverFlight(from, flightTarget, itemU) : target;
      const keys = [
        { at: 0, pose: 'tap' as const, expression: 'determined' as const },
        { at: moveStart, pose: 'run' as const, expression: 'determined' as const },
        { at: event - 0.035, pose: 'receive' as const, expression: 'happy' as const },
        { at: event + 0.20, pose: 'hold' as const, expression: 'happy' as const },
        ...(!last ? [{ at: exitStart, pose: 'walk' as const, expression: 'happy' as const }] : []),
        ...(last ? [{ at: Math.min(dur - 0.08, event + 0.56), pose: 'lookup' as const, expression: 'happy' as const }] : []),
      ].sort((a, b) => a.at - b.at);
      const handTarget = t >= event - 0.035 ? held.hand : undefined;

      ctx.save();
      ctx.globalAlpha *= presence;
      drawActor(ctx, {
        who, x, y: FLOOR, scale: 1, facing: 1, time: t,
        keys, look: t < event ? 'up' : last ? 'up' : 'down',
        handTarget, reach: t >= event - 0.035 ? 1 : 0,
      });
      ctx.restore();

      if (t >= itemStart) {
        const pop = t < itemArrives ? 1 : 0.96 + 0.08 * ease.outBack(phase(t, itemArrives, itemArrives + 0.12));
        ctx.save();
        ctx.globalAlpha *= presence;
        drawItem(ctx, s.item, { x: itemPos.x, y: itemPos.y, t, scale: 0.5 * pop, rot: Math.sin(itemU * Math.PI) * 0.04 });
        ctx.restore();
        if (t >= itemArrives && t < itemArrives + 0.32) ring(ctx, itemPos.x, itemPos.y, itemArrives, t, { r: 38, width: 7, duration: 0.28 });
      }
    }

    if (head) {
      path.ends.forEach((point, i) => ring(ctx, point.x, point.y, s.times[i]! + 0.22, t, { r: 32, width: 7, duration: 0.30 }));
    }
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const safeDur = Math.max(0.05, dur), s = plan(props, safeDur);
    const path = stagePoints(s.dir, s.crowd.length);
    return cuesIn(safeDur, [
      cue(0.03, 'clunk', 0.65, PLACE_X),
      ...s.times.flatMap((at, i) => [
        cue(at, 'thump', 1.45, path.ends[i]!.x),
        cue(at + ITEM_FLIGHT + 0.04, 'paper', 0.78, BUYER_STEP_X),
      ]),
    ]);
  },
};
