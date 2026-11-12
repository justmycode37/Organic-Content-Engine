// rush — full-size buyers dash for a market stall; the final purchase closes it.
import type { Cue, Frame, ShotProps } from '../core.ts';
import { clamp, ease, lerp, phase, tween } from '../kit/motion.ts';
import { drawStage, label } from '../kit/stage.ts';
import { ring, sparks } from '../kit/fx.ts';
import { boothWindow } from '../props/booth.ts';
import { ACTORS, STAGE, actorBounds, actorFace, actorPaw, beats, cue, cuesIn, drawActor, drawItem, itemParam, itemSize, num, pick, str, type ActorId, type ItemId } from './common.ts';
import type { HedgyKey } from '../actor/hedgy.ts';
import type { ShotDef } from './index.ts';

const DEFAULT_CROWD: ActorId[] = ['fan1', 'fan2', 'fan3'];
const PLACES = ['booth', 'bank', 'shop', 'exchange'] as const;
type Place = (typeof PLACES)[number];
const FLOOR = STAGE.floor;
const PLACE_X = 410;
const HANDOFF_XS = [230, 390, 540] as const;
const RUN_DISTANCE = 76;
const EXIT_DISTANCE = 150;
const EXIT_MAX_X = 670;
const EXIT_DURATION = 0.4;
const EXIT_START_DELAY = 0.08;
const EXIT_FADE_DURATION = 0.14;
const TRANSFER_START = 0.28;
const TRANSFER_END = 0;
const SOLD_OUT_DELAY = 0.08;
const HAND_FACE_GAP = 36;

interface RushPlan {
  crowd: ActorId[];
  arrivals: number[];
  place: Place;
  item: ItemId;
  stock: number;
  sign: string;
  endSign: string;
  soldAt?: number;
  signY: number;
}

function actorList(value: unknown): ActorId[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : DEFAULT_CROWD;
  const valid = raw
    .filter((who): who is string => typeof who === 'string')
    .map(who => who.trim())
    .filter((who): who is ActorId => (ACTORS as readonly string[]).includes(who))
    .slice(0, 3);
  return valid.length >= 2 ? valid : [...DEFAULT_CROWD];
}

function itemLabel(item: ItemId): string {
  const special: Partial<Record<ItemId, string>> = {
    ticket: 'TICKET', ticketStack: 'TICKETS', cash: 'CASH', cashPile: 'CASH', coin: 'COIN', coinStack: 'COINS',
    priceTag: 'PRICE', barChart: 'CHART', appleCrate: 'APPLES', lemonade: 'LEMON', pizza: 'PIZZA',
    snowball: 'SNOWBAL', banknote: 'CASH', gold: 'GOLD', phone: 'PHONE', car: 'CAR', house: 'HOUSE',
  };
  return (special[item] ?? item.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[^A-Za-z0-9 ]/g, ' ').toUpperCase()).slice(0, 8);
}

function plan(props: ShotProps, dur: number): RushPlan {
  const crowd = actorList(props.params?.crowd);
  const place = pick(props.params, 'place', PLACES, 'booth');
  const item = itemParam(props.params, 'item', 'ticket');
  const events = [...(props.events ?? [])].filter(event => Number.isFinite(event.at)).sort((a, b) => a.at - b.at);
  const actionCount = Math.min(crowd.length, events.length || crowd.length);
  const fallback = crowd.slice(0, actionCount).map((_, i) => [0.3, 0.58, 0.82][i]!);
  const arrivals = beats(props, dur, fallback);
  const stock = Math.floor(num(props.params, 'stock', arrivals.length, 0, 5));
  const sign = str(props.params, 'sign', itemLabel(item)).toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 8) || itemLabel(item);
  const endSign = str(props.params, 'endSign', 'SOLD OUT').toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 8) || 'SOLD OUT';
  const soldAt = stock === 0 ? 0 : stock <= arrivals.length ? arrivals[stock - 1] : undefined;
  return {
    crowd, arrivals, place, item, stock, sign, endSign, soldAt,
    signY: place === 'booth' ? FLOOR - 720 + 66 : place === 'shop' ? FLOOR - 564 + 210 : FLOOR - 564 + 156,
  };
}

function itemFlight(from: { x: number; y: number }, to: { x: number; y: number }, p: number) {
  const u = smoothStep(p);
  return { x: lerp(from.x, to.x, u), y: lerp(from.y, to.y, u) };
}

function smoothStep(value: number): number {
  const p = clamp(value);
  return p * p * (3 - 2 * p);
}

function inverseSmoothstep(value: number): number {
  const target = clamp(value);
  let lo = 0, hi = 1;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2, p = mid * mid * (3 - 2 * mid);
    if (p < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function heldGeometry(who: ActorId, x: number, t: number, item: ItemId, keys: HedgyKey[]) {
  const actor = { who, x, y: FLOOR, facing: 1 as const, time: t, pose: 'hold' as const, keys };
  const face = actorFace(actor), paw = actorPaw(actor), fullSize = itemSize(item);
  const scale = Math.min(0.5, Math.max(0.15, (STAGE.h - 48 - face.y - face.r - HAND_FACE_GAP) / fullSize.h));
  const dims = itemSize(item, scale);
  const lowY = Math.max(paw.y + 16, face.y + face.r + dims.h / 2 + HAND_FACE_GAP);
  if (lowY + dims.h / 2 <= STAGE.h - 36) {
    const center = { x: clamp(paw.x + Math.min(42, dims.w * 0.22), dims.w / 2 + 36, STAGE.w - dims.w / 2 - 36), y: lowY };
    return { center, hand: { x: center.x - dims.w * 0.34, y: center.y - dims.h * 0.18 }, dims, scale };
  }
  const center = {
    x: clamp(face.x, dims.w / 2 + 24, STAGE.w - dims.w / 2 - 24),
    y: Math.max(24 + dims.h / 2, face.y - face.r - dims.h / 2 - 16),
  };
  return { center, hand: { x: center.x, y: center.y + dims.h / 2 + 8 }, dims, scale };
}

export const rushShot: ShotDef = {
  name: 'rush',
  stage: 'clean',
  describe: 'Two or three buyers run one at a time to a booth, bank, shop, or exchange; the sign and visible stock identify the chosen item, each buyer takes it, and the last reacts beside the changed sign as the booth shutter closes. params: crowd (2–3 actor ids, default fan1/fan2/fan3), place (booth|bank|shop|exchange, default booth), item (any item id, default ticket), stock (0–5, default crowd size), sign (short word, defaults to the chosen item name), endSign (word, default SOLD OUT). Events: one buyer arrives per event and takes the chosen item at the paw; the final stocked sale changes the sign to endSign and lowers the booth shutter while the last buyer stays visible.',
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame, dur = Math.max(0.05, frame.dur), t = clamp(frame.t, 0, dur), s = plan(props, dur);
    const soldCount = s.arrivals.filter(at => t >= at).length;
    const remaining = Math.max(0, s.stock - soldCount);
    const shutterEnd = s.soldAt === undefined ? 0 : Math.max(dur, s.soldAt + 0.6);
    const shutter = s.soldAt === undefined ? 0 : inverseSmoothstep(phase(t, s.soldAt, shutterEnd));
    const sign = s.soldAt !== undefined && t >= s.soldAt + SOLD_OUT_DELAY ? s.endSign : s.sign;
    const window = s.place === 'booth' ? boothWindow({ x: PLACE_X, y: FLOOR, scale: 1 }) : undefined;

    drawStage(ctx, { floorY: FLOOR, line: true, shadow: [{ x: PLACE_X, y: FLOOR - 3, w: 340 }] });
    drawItem(ctx, s.place, {
      x: PLACE_X, y: FLOOR - itemSize(s.place).h / 2, t, scale: 1,
      sign: s.place === 'booth' ? sign : s.sign,
      sold: s.soldAt !== undefined && t >= s.soldAt,
      stock: remaining,
      stockKind: 'none',
      shutter: s.place === 'booth' ? shutter : undefined,
      clerk: s.place === 'booth',
    });

    // The display uses the actual chosen item so the stall never implies
    // tickets or anonymous boxes when a different product is being sold.
    const remainingDisplay = Math.min(3, remaining);
    const itemScale = Math.min(0.2, 108 / Math.max(itemSize(s.item).w, itemSize(s.item).h));
    if (s.place === 'booth' && window) {
      for (let i = 0; i < remainingDisplay; i++) {
        drawItem(ctx, s.item, {
          x: window.x + window.w * (0.55 + i * 0.13),
          y: window.y + window.h * 0.72,
          t, scale: itemScale,
        });
      }
    } else if (remainingDisplay > 0) {
      drawItem(ctx, s.item, { x: PLACE_X + 90, y: FLOOR - 255, t, scale: itemScale });
    }

    if (s.place !== 'booth' && s.soldAt !== undefined && t >= s.soldAt + 0.04) {
      const flip = ease.outBack(phase(t, s.soldAt + 0.04, s.soldAt + 0.26));
      ring(ctx, PLACE_X, s.signY, s.soldAt, t, { r: 76, duration: 0.48 });
      if (s.place === 'shop') {
        drawItem(ctx, s.place, { x: PLACE_X, y: FLOOR - itemSize(s.place).h / 2, t, scale: 1, sign: s.endSign, sold: true, alpha: flip });
      } else {
        label(ctx, s.endSign, PLACE_X, s.signY, { variant: 'sign', pop: flip, maxWidth: 420 });
      }
    }

    for (let i = 0; i < Math.min(s.crowd.length, s.arrivals.length); i++) {
      const who = s.crowd[i]!, arrival = s.arrivals[i]!, hasStock = i < s.stock;
      const last = i === Math.min(s.crowd.length, s.arrivals.length) - 1;
      const stepX = HANDOFF_XS[i] ?? HANDOFF_XS[HANDOFF_XS.length - 1]!;
      const start = Math.max(0, arrival - 0.12);
      const entranceX = stepX - RUN_DISTANCE;
      if (t < start) continue;
      const exitStart = arrival + EXIT_START_DELAY, exitEnd = exitStart + EXIT_DURATION;
      const exitX = Math.min(EXIT_MAX_X, stepX + EXIT_DISTANCE);
      const keys: HedgyKey[] = [
        { at: start, pose: 'run' as const, expression: 'determined' as const },
        { at: arrival - 0.035, pose: hasStock ? 'receive' as const : 'wave-off' as const, expression: hasStock ? 'happy' as const : 'worried' as const },
        { at: arrival + 0.04, pose: hasStock ? 'hold' as const : 'tap' as const, expression: hasStock ? 'happy' as const : 'worried' as const },
        { at: exitStart, pose: hasStock ? 'run' as const : 'wave-off' as const, expression: hasStock ? 'happy' as const : 'sad' as const },
      ];
      if (last) {
        for (let at = arrival + 0.48, index = 0; at < dur - 0.05; at += 0.42, index++) {
          keys.push({ at, pose: hasStock ? (index % 2 === 0 ? 'celebrate' as const : 'point' as const) : 'wave-off' as const, expression: hasStock ? 'happy' as const : 'sad' as const });
        }
      }
      const rawX = t < arrival
        ? tween(t, start, Math.max(0.06, arrival - start), entranceX, stepX, smoothStep)
        : last ? stepX
        : t < exitStart ? stepX : t < exitEnd ? tween(t, exitStart, EXIT_DURATION, stepX, exitX, smoothStep) : exitX;
      const actorBox = actorBounds({ who, x: rawX, y: FLOOR, scale: 1, facing: 1, time: t, keys });
      const x = rawX + (actorBox.left < 28 ? 28 - actorBox.left : actorBox.right > 692 ? 692 - actorBox.right : 0);
      const presence = last ? 1 : 1 - phase(t, exitEnd - EXIT_FADE_DURATION, exitEnd);
      const receivedAt = arrival + TRANSFER_END;
      const held = heldGeometry(who, x, t, s.item, keys);
      const heldAtStep = heldGeometry(who, stepX, t, s.item, keys);
      const transferStart = Math.max(0, receivedAt - TRANSFER_START);
      const transferDuration = Math.max(0, receivedAt - transferStart);
      const maxTransfer = 40 * 30 * transferDuration / 1.5;
      const sourceDelta = heldAtStep.center.x - PLACE_X;
      const sourceFraction = Math.abs(sourceDelta) <= maxTransfer || Math.abs(sourceDelta) < 0.001
        ? 1
        : maxTransfer / Math.abs(sourceDelta);
      const sourceAt = {
        x: lerp(heldAtStep.center.x, PLACE_X, sourceFraction),
        y: heldAtStep.center.y,
      };
      const itemP = ease.inOutCubic(phase(t, transferStart, receivedAt));
      const itemPos = t < receivedAt ? itemFlight(sourceAt, heldAtStep.center, itemP) : held.center;
      const reached = hasStock && t >= arrival - 0.05;
      ctx.save();
      ctx.globalAlpha *= presence;
      drawActor(ctx, {
        who, x, y: FLOOR, scale: 1, facing: 1, time: t,
        look: t < arrival ? 'up' : hasStock ? 'down' : 'forward', keys,
        handTarget: reached ? held.hand : undefined,
        reach: reached ? 1 : 0,
      });
      ctx.restore();

      if (hasStock && t >= transferStart) {
        const itemAlpha = presence;
        const pop = t < receivedAt ? 1 : 0.96 + 0.08 * ease.outBack(phase(t, receivedAt, receivedAt + 0.12));
        ctx.save();
        ctx.globalAlpha *= itemAlpha;
        drawItem(ctx, s.item, { x: itemPos.x, y: itemPos.y, t, scale: heldAtStep.scale * pop, rot: Math.sin(itemP * Math.PI) * 0.045 });
        ctx.restore();
        if (t >= receivedAt && t < receivedAt + 0.34) {
          ring(ctx, itemPos.x, itemPos.y, receivedAt, t, { r: 40, width: 7, duration: 0.30 });
          sparks(ctx, itemPos.x, itemPos.y, receivedAt + 0.02, t, { count: 4, seed: frame.seed + i, duration: 0.32 });
        }
      }
    }
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const d = Math.max(0.05, dur), s = plan(props, d);
    const list: Cue[] = [];
    s.arrivals.forEach((at, i) => {
      const buyerX = HANDOFF_XS[i] ?? HANDOFF_XS[HANDOFF_XS.length - 1]!;
      const start = Math.max(0, at - 0.12);
      list.push(cue(start + (at - start) * 0.36, 'footfall', 0.9, buyerX - RUN_DISTANCE / 2));
      if (i < s.stock) list.push(cue(at + TRANSFER_END, 'paper', 1.05, buyerX + 42));
    });
    if (s.soldAt !== undefined) list.push(cue(s.soldAt + SOLD_OUT_DELAY, 'clunk', 1.4, PLACE_X));
    return cuesIn(d, list);
  },
};
