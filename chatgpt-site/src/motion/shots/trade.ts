// trade — a full-size seller takes payment, then hands the purchased item over.
import type { Cue, Frame, ShotProps } from '../core.ts';
import { arc, clamp, ease, phase, squash, tween } from '../kit/motion.ts';
import { drawStage, label } from '../kit/stage.ts';
import { ring } from '../kit/fx.ts';
import { boothCounter } from '../props/booth.ts';
import type { HedgyKey } from '../actor/hedgy.ts';
import { ACTORS, STAGE, actorFace, actorPaw, beats, cue, cuesIn, drawActor, drawItem, itemParam, itemSize, pick, str, type ActorId, type ItemId } from './common.ts';
import type { ShotDef } from './index.ts';

type Mode = 'buy' | 'sell';
type Price = 'low' | 'high';
type Tender = 'coin' | 'banknote';
type Place = 'booth' | 'shop';

interface TradePlan {
  mode: Mode;
  price: Price;
  tender: Tender;
  who: ActorId;
  place: Place;
  sign: string;
  item: ItemId;
  tag: string;
  first: number;
  second: number;
}

const ACTOR_X = 148;
const PLACE_X = 410;
const PAY_FLIGHT = 0.34;
const ITEM_FLIGHT = 0.30;
const ITEM_SCALE = 0.5;
const HOLD_SCALE = 0.36;
const HAND_FACE_GAP = 8;

function orderedBeats(props: ShotProps, dur: number, fractions: readonly number[]): number[] {
  const result = beats(props, dur, fractions).map(value => clamp(value, 0, dur));
  const gap = Math.min(0.16, dur / (result.length + 1) * 0.55);
  for (let i = 1; i < result.length; i++) result[i] = Math.max(result[i]!, result[i - 1]! + gap);
  if (result.length && result[result.length - 1]! > dur) {
    result[result.length - 1] = dur;
    for (let i = result.length - 2; i >= 0; i--) result[i] = Math.min(result[i]!, result[i + 1]! - gap);
  }
  return result.map(value => clamp(value, 0, dur));
}

function plan(props: ShotProps, dur: number): TradePlan {
  const p = props.params;
  const [first = dur * 0.3, second = dur * 0.66] = orderedBeats(props, dur, [0.3, 0.66]);
  const sign = str(p, 'sign', 'MARKET').toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 8) || 'MARKET';
  return {
    mode: pick(p, 'mode', ['buy', 'sell'] as const, 'buy'),
    price: pick(p, 'price', ['low', 'high'] as const, 'low'),
    tender: pick(p, 'payment', ['coin', 'banknote'] as const, 'banknote'),
    who: pick(p, 'who', ACTORS, 'hedgy') as ActorId,
    place: pick(p, 'place', ['booth', 'shop'] as const, 'booth'),
    sign,
    item: itemParam(p, 'item', 'ticket'),
    tag: str(p, 'tag', '').trim().slice(0, 8),
    first: first!,
    second: second!,
  };
}

function station(s: TradePlan) {
  if (s.place === 'booth') {
    const counter = boothCounter({ x: PLACE_X, y: STAGE.floor, scale: 1 });
    return { x: counter.x + counter.w * 0.5, top: counter.y, centre: counter.y + counter.h * 0.5, height: counter.h };
  }
  return { x: PLACE_X + 20, top: STAGE.floor - 228, centre: STAGE.floor - 196, height: 48 };
}

function paymentId(s: TradePlan): ItemId { return s.price === 'high' ? 'cashPile' : s.tender; }
function paymentScale(_s: TradePlan) { return 0.5; }

function heldGeometry(who: ActorId, t: number, item: ItemId, keys: HedgyKey[]) {
  const actor = { who, x: ACTOR_X, y: STAGE.floor, scale: 1, time: t, pose: 'hold' as const, facing: 1 as const, keys };
  const face = actorFace(actor), paw = actorPaw(actor), fullSize = itemSize(item);
  const scale = Math.min(HOLD_SCALE, ITEM_SCALE, Math.max(0.15, (STAGE.h - 48 - face.y - face.r - HAND_FACE_GAP) / fullSize.h));
  const dims = itemSize(item, scale);
  const lowY = Math.max(paw.y + 16, face.y + face.r + dims.h / 2 + HAND_FACE_GAP);
  if (lowY + dims.h / 2 <= STAGE.h - 36) {
    const center = { x: Math.min(STAGE.w - dims.w / 2 - 36, paw.x + Math.min(64, dims.w * 0.34)), y: lowY };
    return { center, hand: { x: center.x - dims.w * 0.34, y: center.y - dims.h * 0.18 }, dims, scale };
  }
  const center = { x: face.x, y: Math.max(24 + dims.h / 2, face.y - face.r - dims.h / 2 - 16) };
  return { center, hand: { x: center.x, y: center.y + dims.h / 2 + 8 }, dims, scale };
}
function amountPosition(t: number, start: number, from: Point, to: Point, height: number, duration: number) {
  const u = ease.inOutCubic(phase(t, start, start + duration));
  return { u, point: arc(from, to, height, u) };
}

function pawTransferPosition(t: number, start: number, duration: number, from: Point, to: Point, mode: Mode): Point {
  const u = ease.inOutCubic(phase(t, start, start + duration));
  if (mode === 'buy') return { x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u };
  if (u < 0.62) return { x: from.x + (to.x - from.x) * ease.inOutCubic(u / 0.62), y: from.y };
  return { x: to.x, y: from.y + (to.y - from.y) * ease.inOutCubic((u - 0.62) / 0.38) };
}

interface Point { x: number; y: number }

export const tradeShot: ShotDef = {
  name: 'trade',
  stage: 'clean',
  describe: 'An actor trades across a full-size booth or shop; a high price shows a full-size cash pile and a worried reaction. params: who (actor id, default hedgy), place (booth|shop, default booth), sign (word, default MARKET), item (any item id, default ticket), mode (buy|sell, default buy), price (low|high, default low), payment (coin|banknote for a low price, default banknote), tag (optional word by the item, default none). Events for buy: 1 = payment crosses the counter, 2 = the item reaches the buyer. Events for sell: 1 = the item reaches the shop, 2 = payment reaches the seller.',
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame, dur = Math.max(0.05, frame.dur), t = clamp(frame.t, 0, dur), s = plan(props, dur), place = station(s);
    const payId = paymentId(s), payScale = paymentScale(s), payDims = itemSize(payId, payScale);
    const payStart = Math.max(0, s.first - PAY_FLIGHT);
    const itemStart = Math.max(0, s.second - ITEM_FLIGHT);
    const itemFlightStart = s.mode === 'buy' ? itemStart : payStart;
    const payFlightStart = s.mode === 'buy' ? payStart : itemStart;
    const paymentArrives = payFlightStart + PAY_FLIGHT;
    const itemArrives = itemFlightStart + ITEM_FLIGHT;
    const actorKeys: HedgyKey[] = [
      { at: 0, pose: s.mode === 'sell' ? 'hold' as const : 'tap' as const, expression: s.price === 'high' && s.mode === 'buy' ? 'worried' as const : 'neutral' as const },
      { at: payStart, pose: 'give' as const, expression: s.price === 'high' && s.mode === 'buy' ? 'worried' as const : 'determined' as const },
      ...(s.price === 'high' && s.mode === 'buy' ? [{ at: paymentArrives, pose: 'sweat' as const, expression: 'worried' as const }] : [{ at: paymentArrives + 0.04, pose: 'tap' as const }]),
      { at: itemStart, pose: 'receive' as const, expression: s.price === 'high' && s.mode === 'buy' ? 'worried' as const : 'happy' as const },
      { at: itemArrives + 0.04, pose: 'hold' as const, expression: s.price === 'high' && s.mode === 'buy' ? 'worried' as const : 'happy' as const },
      { at: Math.max(itemArrives + 0.36, dur - 0.3), pose: 'tap' as const, expression: s.price === 'high' && s.mode === 'buy' ? 'worried' as const : 'happy' as const },
    ].sort((a, b) => a.at - b.at);
    const actorBase = { who: s.who, x: ACTOR_X, y: STAGE.floor, scale: 1, time: t, t, pose: 'hold' as const, facing: 1 as const, keys: actorKeys };
    const face = actorFace(actorBase), paw = actorPaw(actorBase), held = heldGeometry(s.who, t, s.item, actorKeys);
    const itemDims = held.dims;
    const itemHeld = held.center;
    const tenderAtHand = {
      x: paw.x + Math.min(40, payDims.w * 0.22),
      y: Math.min(STAGE.h - 24 - payDims.h / 2, Math.max(paw.y + payDims.h * 0.24, face.y + face.r + payDims.h / 2 + 12)),
    };
    const payRestDims = itemSize(payId, s.price === 'high' ? 1 : payScale);
    const payFloorY = STAGE.floor - payRestDims.h / 2;
    const payStation = { x: place.x + 96, y: payFloorY };
    const payActor = { x: ACTOR_X + 296, y: payFloorY };
    const payFrom = s.mode === 'buy' ? tenderAtHand : payStation;
    const payTo = s.mode === 'buy' ? payStation : payActor;
    const itemFrom = s.mode === 'buy' ? { x: place.x + 56, y: itemHeld.y } : itemHeld;
    const itemTo = s.mode === 'buy' ? itemHeld : { x: place.x + 56, y: place.centre + 18 };
    const payFlight = amountPosition(t, payFlightStart, payFrom, payTo, 14, PAY_FLIGHT);
    const itemFlightPoint = pawTransferPosition(t, itemFlightStart, ITEM_FLIGHT, itemFrom, itemTo, s.mode);
    const paymentSquash = squash(t, paymentArrives, 0.14, 0.18);
    const itemSquash = squash(t, itemArrives, 0.14, 0.18);

    drawStage(ctx, { floorY: STAGE.floor, line: true });
    const placeScale = 1;
    drawItem(ctx, s.place, {
      x: PLACE_X, y: STAGE.floor - itemSize(s.place).h / 2, t, scale: placeScale,
      sign: s.sign, clerk: s.place === 'booth', stock: 0, stockKind: 'none',
    });

    const paymentHandTarget = s.price === 'high'
      ? { x: payFrom.x - payDims.w * 0.34, y: payFrom.y - payDims.h * 0.18 }
      : tenderAtHand;
    const faceClearTarget = s.mode === 'buy' && t < itemStart
      ? paymentHandTarget
      : s.mode === 'sell' && t >= payFlightStart
        ? { x: payTo.x - payDims.w * 0.34, y: payTo.y - 16 }
        : held.hand;
    drawActor(ctx, {
      who: s.who, x: ACTOR_X, y: STAGE.floor, scale: 1, time: t,
      look: t < itemStart ? 'forward' : 'down', keys: actorKeys,
      handTarget: faceClearTarget, reach: t < payFlightStart + PAY_FLIGHT ? 1 : phase(t, itemStart, itemStart + 0.14),
    });

    const paymentVisible = s.mode === 'buy' || t >= payFlightStart;
    if (paymentVisible) {
      const paymentPoint = t < payFlightStart ? payFrom : t < paymentArrives ? payFlight.point : payTo;
      const stowAt = s.second - 0.12;
      const stow = s.price === 'high' && s.mode === 'buy' ? ease.inOutCubic(phase(t, stowAt, s.second)) : 0;
      const leavingPoint = { x: paymentPoint.x + 42 * stow, y: paymentPoint.y - 20 * stow };
      const highPileAlpha = s.mode === 'buy'
        ? 1 - ease.inOutCubic(phase(t, stowAt, s.second))
        : 1;
      const highPileLevel = s.price === 'high'
        ? 0.18 + 0.82 * ease.outCubic(phase(t, payFlightStart, paymentArrives))
        : undefined;
      const heldScale = s.price === 'high'
        ? 0.5 + 0.5 * ease.outCubic(phase(t, payFlightStart + 0.04, paymentArrives))
        : payScale;
      drawItem(ctx, payId, {
        x: leavingPoint.x, y: leavingPoint.y, t, scale: heldScale,
        level: highPileLevel,
        sx: paymentSquash.sx, sy: paymentSquash.sy,
        alpha: highPileAlpha,
      });
    }

    const itemVisible = s.mode === 'sell' ? 1 : phase(t, itemStart - 0.06, itemStart + 0.04);
    if (s.mode === 'sell' || t >= itemStart - 0.06) {
      const itemPoint = t < itemFlightStart ? itemFrom : t < itemArrives ? itemFlightPoint : itemTo;
      drawItem(ctx, s.item, {
        x: itemPoint.x, y: itemPoint.y, t, scale: held.scale,
        sx: itemSquash.sx, sy: itemSquash.sy, alpha: itemVisible,
      });
      if (s.tag) {
        const tagProgress = s.mode === 'sell'
          ? phase(t, payStart, payStart + 0.20)
          : phase(t, itemStart, itemStart + 0.16);
        const tagX = clamp(itemPoint.x + itemDims.w * 0.5 + 42, 86, STAGE.w - 92);
        const tagY = Math.min(STAGE.floor - 62, itemPoint.y + itemDims.h * 0.5 + 46);
        label(ctx, s.tag.toUpperCase(), tagX, tagY, {
          variant: 'tag', pop: tagProgress * 0.62, maxWidth: 260,
        });
      }
    }

    if (t >= itemArrives - 0.02) ring(ctx, itemTo.x, itemTo.y, itemArrives, t, { r: 54, width: 8 });
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const safeDur = Math.max(0.05, dur), s = plan(props, safeDur), pileHit = s.price === 'high' ? 'thump' : 'coin';
    const payStart = Math.max(0, s.first - PAY_FLIGHT), itemStart = Math.max(0, s.second - ITEM_FLIGHT);
    const itemFlightStart = s.mode === 'buy' ? itemStart : payStart;
    const payFlightStart = s.mode === 'buy' ? payStart : itemStart;
    return cuesIn(safeDur, [
      cue(0.03, 'clunk', 0.65, PLACE_X),
      cue(payStart, s.mode === 'buy' ? 'slide' : 'paper', 0.92, s.mode === 'buy' ? ACTOR_X + 200 : PLACE_X),
      cue(payFlightStart + PAY_FLIGHT, s.mode === 'buy' ? pileHit : 'paper', s.price === 'high' ? 1.5 : 1.0, PLACE_X),
      cue(itemFlightStart, 'slide', 0.88, s.mode === 'buy' ? PLACE_X : ACTOR_X),
      cue(itemFlightStart + ITEM_FLIGHT, s.mode === 'buy' ? 'land' : pileHit, s.price === 'high' && s.mode === 'sell' ? 1.4 : 1.25, ACTOR_X),
      ...(s.tag ? [cue(itemFlightStart + ITEM_FLIGHT + 0.08, 'paper', 0.6, ACTOR_X)] : []),
    ]);
  },
};
