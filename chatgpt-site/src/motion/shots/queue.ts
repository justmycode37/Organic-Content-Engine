// queue — buyers step forward, take the chosen item, and move on as demand nudges price.
import type { Cue, Frame, ShotProps } from '../core.ts';
import type { HedgyKey } from '../actor/hedgy.ts';
import { clamp, ease, phase, tween } from '../kit/motion.ts';
import { PAL } from '../kit/pixel.ts';
import { arrow, drawStage } from '../kit/stage.ts';
import { boothWindow } from '../props/booth.ts';
import { ACTORS, STAGE, actorBounds, actorFace, actorPaw, beats, cue, cuesIn, drawActor, drawItem, itemParam, itemSize, num, pick, str, type ActorId, type ItemId } from './common.ts';
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

const PLACE_X = 410;
const SERVICE_X = 390;
const FLOOR = STAGE.floor;
const BUYER_SCALE = 0.68;
const QUEUE_XS = [SERVICE_X, 240, 90] as const;
const EXIT_X = 645;
const EXIT_DELAY = 0.25;
const EXIT_DURATION = 0.36;
const PRODUCT_DISPLAY_SCALE = 0.18;

function itemLabel(item: ItemId): string {
  const special: Partial<Record<ItemId, string>> = {
    ticket: 'TICKET', ticketStack: 'TICKETS', cash: 'CASH', cashPile: 'CASH', coin: 'COIN', coinStack: 'COINS',
    priceTag: 'PRICE', barChart: 'CHART', appleCrate: 'APPLES', lemonade: 'LEMON', pizza: 'PIZZA',
    snowball: 'SNOWBAL', banknote: 'CASH', gold: 'GOLD', phone: 'PHONE', car: 'CAR', house: 'HOUSE',
  };
  return (special[item] ?? item.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[^A-Za-z0-9 ]/g, ' ').toUpperCase()).slice(0, 7);
}

function orderedBeats(props: ShotProps, dur: number, count: number): number[] {
  const fractions = Array.from({ length: count }, (_, i) => count === 2 ? 0.32 + i * 0.36 : 0.22 + i * 0.24);
  const result = beats(props, dur, fractions).map(value => clamp(value, 0, dur));
  const gap = Math.min(0.2, dur / (count + 1) * 0.54);
  for (let i = 1; i < result.length; i++) result[i] = Math.max(result[i]!, result[i - 1]! + gap);
  if (result.length && result[result.length - 1]! > dur) {
    result[result.length - 1] = dur;
    for (let i = result.length - 2; i >= 0; i--) result[i] = Math.min(result[i]!, result[i + 1]! - gap);
  }
  return result.map(value => clamp(value, 0, dur));
}

function parseCrowd(params: ShotProps['params']): ActorId[] {
  const raw = params?.crowd;
  if (Array.isArray(raw)) {
    const actors = raw.filter((who): who is ActorId => typeof who === 'string' && ACTORS.includes(who as typeof ACTORS[number])).slice(0, 3);
    if (actors.length >= 2) return actors;
  }
  const count = typeof raw === 'number' ? raw : num(params, 'steps', 3, 2, 3);
  return ['fan1', 'fan2', 'fan3'].slice(0, clamp(Math.round(count), 2, 3)) as ActorId[];
}

function plan(props: ShotProps, dur: number): QueuePlan {
  const crowd = parseCrowd(props.params);
  const item = itemParam(props.params, 'item', 'ticket');
  return {
    crowd,
    place: pick(props.params, 'place', ['booth', 'shop'] as const, 'booth'),
    sign: str(props.params, 'sign', itemLabel(item)).toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 7) || itemLabel(item),
    dir: pick(props.params, 'dir', ['up', 'down'] as const, 'up'),
    chart: pick(props.params, 'chart', ['candles'] as const, 'candles'),
    item,
    times: orderedBeats(props, dur, crowd.length),
  };
}

function queuePosition(index: number, event: number, times: readonly number[], t: number): number {
  const start = index === 0 ? Math.max(0, event - 0.44) : Math.min(event - 0.08, (times[index - 1] ?? 0) + 0.34);
  const from = QUEUE_XS[index] ?? QUEUE_XS[QUEUE_XS.length - 1]!;
  return t < start ? from : tween(t, start, Math.max(0.08, event - start), from, SERVICE_X, ease.inOutCubic);
}

function carriedGeometry(who: ActorId, x: number, t: number, item: ItemId, facing: 1 | -1 = 1) {
  const scale = Math.min(0.38, 180 / Math.max(itemSize(item).w, itemSize(item).h));
  const dims = itemSize(item, scale);
  const actor = { who, x, y: FLOOR, scale: BUYER_SCALE, facing, time: t, pose: 'hold' as const };
  const face = actorFace(actor), paw = actorPaw(actor);
  const lowY = Math.max(paw.y + 10, face.y + face.r + dims.h / 2 + 12);
  const center = {
    x: clamp(paw.x + facing * Math.min(44, dims.w * 0.24), dims.w / 2 + 28, STAGE.w - dims.w / 2 - 28),
    y: Math.min(FLOOR - dims.h / 2 - 8, lowY),
  };
  return { center, hand: { x: center.x - facing * dims.w * 0.34, y: center.y - dims.h * 0.16 }, scale };
}

function arcPoint(a: Point, b: Point, p: number): Point {
  const u = ease.inOutCubic(p);
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u - Math.sin(Math.PI * u) * 24 };
}

function waitKeys(dur: number): HedgyKey[] {
  const keys: HedgyKey[] = [{ at: 0, pose: 'think', expression: 'determined', look: 'up' }];
  for (let at = 0.3; at < dur; at += 0.52) {
    keys.push({ at, pose: 'walk', expression: 'determined', look: 'up' });
    keys.push({ at: Math.min(dur, at + 0.2), pose: 'think', expression: 'determined', look: 'up' });
  }
  return keys;
}

export const queueShot: ShotDef = {
  name: 'queue',
  stage: 'clean',
  describe: 'Two or three buyers form a line at a booth or shop; each steps forward for the chosen item as the displayed stock shrinks and one simple price arrow advances. Earlier buyers walk away; the last keeps the item visible while reacting to the completed move. params: crowd (2–3 actor ids or count, default fan1/fan2/fan3), steps (2–3 buyers when crowd is omitted, default 3), place (booth|shop, default booth), sign (short word, defaults to the chosen item name), item (any item id, default ticket), dir (up|down, default up), chart (candles; shown as a single clean price arrow). Events: one buyer at a time takes the chosen item and advances the price arrow; later buyers step forward, and the final buyer holds the item on screen.',
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame, dur = Math.max(0.05, frame.dur), t = clamp(frame.t, 0, dur), s = plan(props, dur);
    const sold = s.times.filter(at => t >= at).length;
    const remaining = Math.max(0, s.crowd.length - sold);
    const placeY = FLOOR - itemSize(s.place).h / 2;
    const window = s.place === 'booth' ? boothWindow({ x: PLACE_X, y: FLOOR, scale: 1 }) : undefined;
    const productSource = window
      ? { x: window.x + window.w * 0.75, y: window.y + window.h * 0.68 }
      : { x: PLACE_X + 82, y: FLOOR - 250 };
    const productScale = Math.min(PRODUCT_DISPLAY_SCALE, 100 / Math.max(itemSize(s.item).w, itemSize(s.item).h));
    const productBob = Math.sin(t * 4.2) * 3;
    const trend = sold / Math.max(1, s.crowd.length);
    const trendStart = s.dir === 'up' ? { x: 50, y: 244 } : { x: 50, y: 176 };
    const trendEnd = s.dir === 'up' ? { x: 150, y: 176 } : { x: 150, y: 244 };

    drawStage(ctx, { floorY: FLOOR, line: true, shadow: [{ x: PLACE_X, y: FLOOR - 3, w: 320 }] });
    drawItem(ctx, s.place, {
      x: PLACE_X, y: placeY, t, scale: 1,
      sign: s.sign, clerk: s.place === 'booth',
      stock: 0, stockKind: 'none',
    });
    if (remaining > 0) {
      if (window) {
        const visibleStock = Math.min(3, remaining);
        for (let i = 0; i < visibleStock; i++) {
          const x = window.x + window.w * (0.58 + i * 0.13);
          drawItem(ctx, s.item, { x, y: productSource.y + productBob + Math.sin(t * 4 + i) * 2, t, scale: productScale });
        }
      } else {
        drawItem(ctx, s.item, { x: productSource.x, y: productSource.y + productBob, t, scale: productScale });
      }
    }
    arrow(ctx, trendStart, trendEnd, { color: s.dir === 'up' ? PAL.UP : PAL.DOWN, width: 12, progress: trend });

    for (let i = 0; i < s.crowd.length; i++) {
      const who = s.crowd[i]!, event = s.times[i]!;
      const approachX = queuePosition(i, event, s.times, t);
      const last = i === s.crowd.length - 1;
      const exitStart = event + EXIT_DELAY;
      const exitEnd = exitStart + EXIT_DURATION;
      const rawX = t < event ? approachX : last ? SERVICE_X : t < exitEnd ? tween(t, exitStart, EXIT_DURATION, SERVICE_X, EXIT_X, ease.inOutCubic) : EXIT_X;
      const facing: 1 | -1 = 1;
      const presence = last ? 1 : t < exitEnd - 0.12 ? 1 : 1 - phase(t, exitEnd - 0.12, exitEnd);
      const itemStart = Math.max(0, event - 0.22);
      const itemEnd = event + 0.12;
      const keys: HedgyKey[] = t < event ? waitKeys(Math.max(dur, event)) : [
        { at: 0, pose: 'think' as const, expression: 'determined' as const, look: 'up' as const },
        { at: Math.max(0, event - 0.1), pose: 'receive' as const, expression: 'happy' as const, look: 'down' as const },
        { at: event + 0.12, pose: 'hold' as const, expression: 'happy' as const, look: 'down' as const },
        ...(last ? [] : [{ at: exitStart, pose: 'run' as const, expression: 'happy' as const, look: 'forward' as const }]),
      ];
      if (last) {
        for (let at = itemEnd + 0.38, index = 0; at < dur - 0.05; at += 0.42, index++) {
          keys.push({ at, pose: index % 2 === 0 ? 'point' : 'celebrate', expression: 'happy', look: 'up' });
        }
      }
      const actorBoundsNow = actorBounds({ who, x: rawX, y: FLOOR, scale: BUYER_SCALE, facing, time: t, keys });
      const actorCorrection = actorBoundsNow.left < 28 ? 28 - actorBoundsNow.left : actorBoundsNow.right > 692 ? 692 - actorBoundsNow.right : 0;
      const x = rawX + actorCorrection;
      const carry = carriedGeometry(who, x, t, s.item, facing);
      const atStep = carriedGeometry(who, SERVICE_X, t, s.item);
      const itemProgress = phase(t, itemStart, itemEnd);
      const itemPos = t < itemEnd ? arcPoint(productSource, atStep.center, itemProgress) : carry.center;
      ctx.save();
      ctx.globalAlpha *= presence;
      drawActor(ctx, {
        who, x, y: FLOOR, scale: BUYER_SCALE, facing, time: t,
        look: t < event ? 'up' : t < exitStart ? 'down' : 'forward', keys,
        handTarget: t >= Math.max(0, event - 0.12) && (last || t <= exitEnd) ? carry.hand : undefined,
        reach: t >= Math.max(0, event - 0.12) && t <= itemEnd ? phase(t, event - 0.12, itemEnd) : t > itemEnd && (last || t <= exitEnd) ? 1 : 0,
      });
      ctx.restore();
      if (t >= itemStart && (last || t <= exitEnd)) {
        ctx.save();
        ctx.globalAlpha *= presence;
        drawItem(ctx, s.item, { x: itemPos.x, y: itemPos.y, t, scale: carry.scale, rot: Math.sin(itemProgress * Math.PI) * 0.035 });
        ctx.restore();
      }
    }
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const d = Math.max(0.05, dur), s = plan(props, d);
    return cuesIn(d, [
      ...s.times.flatMap((at, i) => [
        cue(Math.max(0, at - 0.2), 'footfall', 0.8, QUEUE_XS[i] ?? SERVICE_X),
        cue(at, 'paper', 1.2, SERVICE_X),
        cue(Math.min(d, at + EXIT_DELAY), 'thump', 0.9, SERVICE_X - 30),
      ]),
    ]);
  },
};
