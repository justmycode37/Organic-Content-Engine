// queue — each buyer gets a turn while a bold market price ratchets one step.
import type { Cue, Frame, ShotProps } from '../core.ts';
import type { HedgyKey } from '../actor/hedgy.ts';
import { arc, bob, clamp, ease, lerp, phase } from '../kit/motion.ts';
import { PAL } from '../kit/pixel.ts';
import { candles, drawStage } from '../kit/stage.ts';
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
  chart: 'candles';
  item: ItemId;
  times: number[];
}
interface Point { x: number; y: number }
interface Slot extends Point {}

const PLACE_X = 630;
const BUYER_STEP_X = 480;
const EXIT_X = -190;
const ITEM_FLIGHT = 0.22;
const EXIT_DELAY = 0.02;
const EXIT_DURATION = 0.66;
const EXIT_PASS_DURATION = 0.22;
const EXIT_DEPTH = 135;
const TURN_DURATION = 0.30;
const SHIFT_DELAY = 0.23;
const SHIFT_DURATION = 0.20;
const BUYER_SCALE = 0.74;
const FLOOR = STAGE.floor;
const QUEUE_SLOTS: readonly Slot[] = [
  { x: 480, y: FLOOR },
  { x: 315, y: FLOOR },
  { x: 150, y: FLOOR },
];
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
    chart: pick(props.params, 'chart', ['candles'] as const, 'candles'),
    item: itemParam(props.params, 'item', 'ticket'),
    times: orderedBeats(props, dur, crowd.length),
  };
}

function slotAt(index: number): Slot {
  return QUEUE_SLOTS[clamp(index, 0, QUEUE_SLOTS.length - 1)]!;
}

function shiftStartAt(index: number, times: readonly number[]): number {
  return times[index]! + SHIFT_DELAY;
}

function shiftDurationAt(index: number, times: readonly number[]): number {
  const gap = Math.max(0, (times[index + 1] ?? Infinity) - times[index]!);
  return Math.min(SHIFT_DURATION, Math.max(0, gap - SHIFT_DELAY));
}

function shiftEndAt(index: number, times: readonly number[]): number {
  return shiftStartAt(index, times) + shiftDurationAt(index, times);
}

/** Later buyers advance one floor position after each completed sale. */
function queuedPosition(t: number, index: number, times: readonly number[]): Slot {
  let slotIndex = index;
  for (let purchase = 0; purchase < index; purchase++) {
    const start = shiftStartAt(purchase, times);
    const end = shiftEndAt(purchase, times);
    if (t >= end) {
      slotIndex--;
      continue;
    }
    if (t > start) {
      const from = slotAt(slotIndex), to = slotAt(slotIndex - 1);
      const p = phase(t, start, Math.max(start + 0.001, end));
      return { x: lerp(from.x, to.x, p), y: lerp(from.y, to.y, p) };
    }
    break;
  }
  return slotAt(slotIndex);
}

function heldGeometry(who: ActorId, x: number, y: number, t: number, item: ItemId, facing: 1 | -1 = 1) {
  const actor = { who, x, y, scale: BUYER_SCALE, facing, time: t, pose: 'hold' as const };
  const face = actorFace(actor), paw = actorPaw(actor), dims = itemSize(item, 0.5);
  const lowY = Math.max(paw.y + 14, face.y + face.r + dims.h / 2 + 12);
  const pawOffset = Math.min(56, dims.w * 0.26);
  const center = {
    x: paw.x + facing * pawOffset,
    y: Math.min(FLOOR - dims.h / 2 - 5, lowY),
  };
  return { center, hand: { x: center.x - facing * dims.w * 0.34, y: center.y - dims.h * 0.16 }, dims };
}

function blendPoint(a: Point, b: Point, p: number): Point {
  return { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p) };
}

function handoverFlight(from: Point, to: Point, p: number): Point {
  if (p < 0.60) return { x: from.x, y: lerp(from.y, to.y, ease.inOutCubic(p / 0.60)) };
  return arc({ x: from.x, y: to.y }, to, 14, ease.inOutCubic((p - 0.60) / 0.40));
}

export const queueShot: ShotDef = {
  name: 'queue',
  stage: 'clean',
  describe: 'Two or three full-size buyers queue beside a full-size booth or shop while a small candlestick chart starts with two candles and adds one market-color candle per purchase. params: crowd (2–3 actor ids or count, default fan1/fan2/fan3), steps (2–3 buyers when crowd is omitted, default 3), place (booth|shop, default booth), sign (word, default BUY), item (any item id, default ticket), dir (up|down, default up), chart (candles, default candles). Events: the next buyer receives the item at the paw, walks off left, and reveals one new candle.',
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame, dur = Math.max(0.05, frame.dur), t = clamp(frame.t, 0, dur), s = plan(props, dur);
    // Realistic history: a small rise, a red pullback, then one trend candle per purchase (bigger each time).
    const seedCandles = 3, chartCount = seedCandles + s.crowd.length;
    const history = [0.26, 0.34, 0.29], steps = [0.13, 0.17, 0.22];
    const rising = [...history, ...steps.slice(0, s.crowd.length).reduce<number[]>((acc, step) => [...acc, (acc.at(-1) ?? history.at(-1)!) + step], [])];
    const closes = s.dir === 'up' ? rising : rising.map(value => 1 - value);
    const placeCenterY = FLOOR - itemSize(s.place).h / 2;
    const counter = s.place === 'booth' ? boothCounter({ x: PLACE_X, y: FLOOR, scale: 1 }) : undefined;
    const service = counter
      ? { x: counter.x + counter.w * 0.5, y: counter.y + counter.h * 0.38 }
      : { x: PLACE_X, y: FLOOR - 205 };
    drawStage(ctx, { floorY: FLOOR, line: true, shadow: [
      { x: PLACE_X, y: FLOOR - 3, w: 340 },
      ...QUEUE_SLOTS.slice(0, s.crowd.length).map(slot => ({ x: slot.x, y: slot.y - 3, w: 150 })),
    ] });
    drawItem(ctx, s.place, {
      x: PLACE_X, y: placeCenterY, t, scale: 1,
      sign: s.sign, clerk: s.place === 'booth', stock: 0, stockKind: 'none',
    });
    // The chart lives in the open upper-left corner, above the queue.
    const chartHead = candles(ctx, 40, 96, 352, 324, {
      closes,
      count: chartCount,
      revealAt: [-3, -2, -1, ...s.times.map(at => Math.max(-0.2, at - Math.min(0.22, at * 0.6)))],
      revealDuration: 0.28,
      t,
      seed: frame.seed,
      axes: true,
      colorUp: PAL.DOWN,
      colorDown: PAL.UP,
    });

    for (let i = 0; i < s.crowd.length; i++) {
      const who = s.crowd[i]!, event = s.times[i]!, last = i === s.crowd.length - 1;
      const previousShiftEnd = i === 0 ? 0 : shiftEndAt(i - 1, s.times);
      const moveStart = i === 0 ? 0 : Math.max(s.times[i - 1]! + SHIFT_DELAY, previousShiftEnd);
      const approachEnd = Math.min(event, moveStart + 0.34);
      const approachFrom = queuedPosition(moveStart, i, s.times);
      const queued = queuedPosition(t, i, s.times);
      const approach = ease.inOutCubic(phase(t, moveStart, Math.max(moveStart + 0.08, approachEnd)));
      const isApproaching = t >= moveStart && t < event;
      const itemStart = Math.max(0, event - ITEM_FLIGHT), itemArrives = event;
      const exitStart = event + EXIT_DELAY;
      const exitEnd = exitStart + EXIT_DURATION;
      let x = isApproaching ? lerp(approachFrom.x, BUYER_STEP_X, approach) : queued.x;
      let y = isApproaching ? lerp(approachFrom.y, FLOOR, approach) : queued.y;
      if (t >= event) {
        if (t < exitStart) {
          x = BUYER_STEP_X;
          y = FLOOR;
        } else if (t < exitStart + EXIT_PASS_DURATION) {
          const pass = phase(t, exitStart, exitStart + EXIT_PASS_DURATION);
          x = lerp(BUYER_STEP_X, QUEUE_SLOTS[1]!.x, pass);
          y = lerp(FLOOR, FLOOR - EXIT_DEPTH, pass);
        } else {
          const exit = phase(t, exitStart + EXIT_PASS_DURATION, exitEnd);
          x = lerp(QUEUE_SLOTS[1]!.x, EXIT_X, exit);
          y = FLOOR - EXIT_DEPTH;
        }
      }
      const presence = t < exitEnd - 0.14 ? 1 : 1 - phase(t, exitEnd - 0.14, exitEnd);
      const queueFacing: 1 | -1 = i > 0 && t < previousShiftEnd ? -1 : 1;
      const facing: 1 | -1 = t < exitStart ? queueFacing : -1;
      const oldHeld = heldGeometry(who, x, y, t, s.item, 1);
      const turnedHeld = heldGeometry(who, x, y, t, s.item, -1);
      const turn = ease.inOutCubic(phase(t, exitStart, exitStart + TURN_DURATION));
      const held = {
        center: blendPoint(oldHeld.center, turnedHeld.center, t < exitStart ? 0 : turn),
        hand: blendPoint(oldHeld.hand, turnedHeld.hand, t < exitStart ? 0 : turn),
        dims: oldHeld.dims,
      };
      const heldAtStep = heldGeometry(who, BUYER_STEP_X, FLOOR, t, s.item);
      const safeSourceX = clamp(service.x - 42, held.dims.w / 2 + 24, STAGE.w - held.dims.w / 2 - 24);
      const from = { x: safeSourceX, y: heldAtStep.center.y };
      const itemU = ease.inOutCubic(phase(t, itemStart, itemArrives));
      const flightTarget = heldAtStep.center;
      const target = { x: held.center.x, y: held.center.y + bob(t, 1.45, 3) };
      const itemPos = t < itemArrives ? handoverFlight(from, flightTarget, itemU) : target;

      const keys: HedgyKey[] = [{ at: 0, pose: 'think', expression: 'determined', look: 'up' }];
      for (let previous = 0; previous < i; previous++) {
        keys.push({ at: s.times[previous]! + SHIFT_DELAY, pose: 'walk', expression: 'determined' });
        keys.push({ at: s.times[previous]! + SHIFT_DELAY + SHIFT_DURATION, pose: 'think', expression: 'determined' });
      }
      for (let shuffleAt = 0.20; shuffleAt < moveStart - 0.18; shuffleAt += 0.55) {
        keys.push({ at: shuffleAt, pose: 'walk', expression: 'determined' });
        keys.push({ at: shuffleAt + 0.18, pose: 'think', expression: 'determined' });
      }
      keys.push({ at: moveStart, pose: 'walk', expression: 'determined' });
      for (let shuffleAt = approachEnd + 0.10; shuffleAt < event - 0.14; shuffleAt += 0.55) {
        keys.push({ at: shuffleAt, pose: 'walk', expression: 'determined' });
        keys.push({ at: shuffleAt + 0.18, pose: 'think', expression: 'determined' });
      }
      keys.push({ at: Math.max(0, event - 0.12), pose: 'receive', expression: 'happy' });
      keys.push({ at: event, pose: 'hold', expression: 'happy' });
      keys.push({ at: exitStart, pose: 'walk', expression: 'happy' });
      if (last) keys.push({ at: Math.max(exitStart + 0.24, dur - 0.12), pose: 'lookup', expression: 'happy' });
      keys.sort((a, b) => a.at - b.at);

      ctx.save();
      ctx.globalAlpha *= presence;
      drawActor(ctx, {
        who, x, y, scale: BUYER_SCALE, facing, time: t, keys,
        look: t < event ? 'up' : last ? 'up' : 'down',
        handTarget: t >= Math.max(0, event - 0.12) ? held.hand : undefined,
        reach: t >= Math.max(0, event - 0.12) ? 1 : 0,
      });
      ctx.restore();

      if (t >= itemStart) {
        ctx.save();
        ctx.globalAlpha *= presence;
        drawItem(ctx, s.item, { x: itemPos.x, y: itemPos.y, t, scale: 0.5, rot: Math.sin(itemU * Math.PI) * 0.035 });
        ctx.restore();
        if (t >= itemArrives && t < itemArrives + 0.32) ring(ctx, itemPos.x, itemPos.y, itemArrives, t, { r: 34, width: 7, duration: 0.28 });
      }
    }

    const purchaseIndex = chartHead ? chartHead.index - seedCandles : -1;
    if (chartHead && purchaseIndex >= 0) ring(ctx, chartHead.x, chartHead.y, s.times[purchaseIndex] ?? 0, t, { r: 24, width: 6, duration: 0.26 });
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const safeDur = Math.max(0.05, dur), s = plan(props, safeDur);
    return cuesIn(safeDur, [
      cue(0.03, 'clunk', 0.65, PLACE_X),
      ...s.times.flatMap((at, i) => [
        cue(at, 'thump', 1.45, 180 + 48 * i),
        cue(at, 'paper', 0.78, BUYER_STEP_X),
      ]),
    ]);
  },
};
