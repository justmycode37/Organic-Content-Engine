// trade — payment and goods cross the counter in opposite directions.
import type { Cue, Frame, ShotProps } from '../core.ts';
import { arc, clamp, ease, phase, squash } from '../kit/motion.ts';
import { Grid, PAL } from '../kit/pixel.ts';
import { drawSprite } from '../kit/sprite.ts';
import { drawStage } from '../kit/stage.ts';
import { ring } from '../kit/fx.ts';
import { boothCounter } from '../props/booth.ts';
import type { HedgyKey } from '../actor/hedgy.ts';
import { ACTORS, STAGE, actorBounds, actorPaw, beats, cue, cuesIn, drawActor, drawItem, itemParam, itemSize, pick, str, type ActorId, type ItemId } from './common.ts';
import type { ShotDef } from './index.ts';

type Mode = 'buy' | 'sell';
type Price = 'low' | 'high';
type Tender = 'coin' | 'banknote';
type Place = 'booth' | 'shop';
interface Point { x: number; y: number }
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
  actorX: number;
  placeX: number;
  facing: 1 | -1;
  itemScale: number;
  payScale: number;
}

const PLACE_SCALE = 0.72;
const FLIGHT = 0.30;

const TAG_FONT: Record<string, readonly string[]> = {
  A:['010','101','111','101','101'], B:['110','101','110','101','110'], C:['011','100','100','100','011'], D:['110','101','101','101','110'], E:['111','100','110','100','111'], F:['111','100','110','100','100'], G:['011','100','101','101','011'], H:['101','101','111','101','101'], I:['111','010','010','010','111'], J:['001','001','001','101','010'], K:['101','101','110','101','101'], L:['100','100','100','100','111'], M:['101','111','111','101','101'], N:['101','111','111','111','101'], O:['111','101','101','101','111'], P:['110','101','110','100','100'], Q:['111','101','101','111','001'], R:['110','101','110','101','101'], S:['011','100','010','001','110'], T:['111','010','010','010','010'], U:['101','101','101','101','111'], V:['101','101','101','101','010'], W:['101','101','111','111','101'], X:['101','101','010','101','101'], Y:['101','101','010','010','010'], Z:['111','001','010','100','111'],
  '0':['111','101','101','101','111'], '1':['010','110','010','010','111'], '2':['110','001','010','100','111'], '3':['110','001','010','001','110'], '4':['101','101','111','001','001'], '5':['111','100','110','001','110'], '6':['011','100','110','101','010'], '7':['111','001','010','010','010'], '8':['010','101','010','101','010'], '9':['010','101','011','001','110'],
};

function smallTag(value: string) {
  const text = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8), cols = text.length * 4 + 4, g = new Grid(cols, 9);
  g.rect(0, 0, cols, 9, PAL.ink).rect(1, 1, cols - 2, 7, PAL.paper);
  let x = 2;
  for (const char of text) {
    (TAG_FONT[char] ?? TAG_FONT.S!).forEach((row, y) => [...row].forEach((on, xx) => { if (on === '1') g.rect(x + xx, y + 2, 1, 1, PAL.ink); }));
    x += 4;
  }
  return g.sprite(`shot-trade:tag:${text}`);
}

function orderedBeats(props: ShotProps, dur: number): [number, number] {
  const [rawFirst, rawSecond] = beats(props, dur, [0.3, 0.66]);
  const gap = Math.min(0.22, dur * 0.16);
  const first = clamp(rawFirst ?? dur * 0.3, 0, Math.max(0, dur - gap));
  const second = clamp(Math.max(rawSecond ?? dur * 0.66, first + gap), first + gap, dur);
  return [first, second];
}

function plan(props: ShotProps, dur: number): TradePlan {
  const p = props.params, [first, second] = orderedBeats(props, dur);
  const mode = pick(p, 'mode', ['buy', 'sell'] as const, 'buy');
  const facing: 1 | -1 = mode === 'buy' ? 1 : -1;
  const item = itemParam(p, 'item', 'ticket'), itemDims = itemSize(item);
  const sign = str(p, 'sign', 'MARKET').toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 8) || 'MARKET';
  return {
    mode, price: pick(p, 'price', ['low', 'high'] as const, 'low'),
    tender: pick(p, 'payment', ['coin', 'banknote'] as const, 'banknote'),
    who: pick(p, 'who', ACTORS, 'hedgy') as ActorId,
    place: pick(p, 'place', ['booth', 'shop'] as const, 'booth'), sign,
    item, tag: str(p, 'tag', '').trim().replace(/[^A-Za-z0-9]/g, '').slice(0, 8), first, second,
    actorX: mode === 'buy' ? 130 : 590,
    placeX: mode === 'buy' ? 470 : 250,
    facing,
    itemScale: Math.min(0.46, 216 / Math.max(itemDims.w, itemDims.h)),
    payScale: 0.42,
  };
}

function paymentId(s: TradePlan): ItemId { return s.price === 'high' ? 'cashPile' : s.tender; }

function drawItemAt(ctx: Frame['ctx'], item: ItemId, point: Point, t: number, scale: number, extra: Record<string, unknown> = {}) {
  drawItem(ctx, item, { x: point.x, y: point.y, t, scale, ...extra });
}

function station(s: TradePlan) {
  if (s.place === 'booth') {
    const counter = boothCounter({ x: s.placeX, y: STAGE.floor, scale: PLACE_SCALE });
    return { top: counter.y, height: counter.h };
  }
  return { top: STAGE.floor - 240, height: 36 };
}

function heldGeometry(who: ActorId, actorX: number, facing: 1 | -1, t: number, item: ItemId, scale: number, keys: HedgyKey[]) {
  const actor = { who, x: actorX, y: STAGE.floor, scale: 1, time: t, pose: 'hold' as const, facing, keys };
  const paw = actorPaw(actor), dims = itemSize(item, scale);
  const y = clamp(paw.y + dims.h * 0.18, STAGE.floor - dims.h / 2 - 180, STAGE.floor - dims.h / 2 - 20);
  const x = clamp(paw.x + facing * Math.min(58, dims.w * 0.34), 28 + dims.w / 2, STAGE.w - 28 - dims.w / 2);
  const center = { x, y };
  return { center, hand: { x: center.x - facing * dims.w * 0.34, y: center.y - dims.h * 0.18 }, dims, scale };
}

function transferPoint(t: number, start: number, duration: number, from: Point, to: Point): Point {
  const u = ease.inOutCubic(phase(t, start, start + duration));
  return arc(from, to, 22, u);
}

export const tradeShot: ShotDef = {
  name: 'trade',
  stage: 'clean',
  describe: 'A customer and shopkeeper exchange payment and an item across a counter; buy sends money to the shop before the item reaches the customer, while sell sends the item in before payment returns. params: who (actor id, default hedgy), place (booth|shop, default booth), sign (up to 8 characters, default MARKET), item (any library item, default ticket), mode (buy|sell, default buy), price (low|high, default low), payment (coin|banknote for low price, default banknote), tag (optional short tag by the item, default none). Events: buy event 1 = payment reaches the counter and event 2 = the item reaches the customer; sell event 1 = the item reaches the counter and event 2 = payment reaches the customer.',
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame, dur = Math.max(0.05, frame.dur), t = clamp(frame.t, 0, dur), s = plan(props, dur), place = station(s);
    const payId = paymentId(s), payScale = s.payScale, payDims = itemSize(payId, payScale), itemDims = itemSize(s.item, s.itemScale);
    const payTargetAt = s.mode === 'buy' ? s.first : s.second;
    const itemTargetAt = s.mode === 'buy' ? s.second : s.first;
    const payStart = Math.max(0, payTargetAt - FLIGHT), itemStart = Math.max(0, itemTargetAt - FLIGHT);
    const payArrives = payStart + FLIGHT, itemArrives = itemStart + FLIGHT;
    const actorKeys = ([
      { at: 0, pose: s.mode === 'sell' ? 'hold' : 'think', expression: 'neutral' },
      { at: payStart, pose: s.mode === 'buy' ? 'give' : 'hold', expression: s.price === 'high' && s.mode === 'buy' ? 'worried' : 'determined' },
      { at: payArrives + 0.04, pose: s.mode === 'sell' ? 'receive' : 'tap', expression: s.price === 'high' && s.mode === 'buy' ? 'worried' : 'happy' },
      { at: itemStart, pose: s.mode === 'sell' ? 'give' : 'receive', expression: 'determined' },
      { at: itemArrives + 0.04, pose: 'hold', expression: s.price === 'high' && s.mode === 'buy' ? 'worried' : 'happy' },
      { at: Math.max(itemArrives + 0.42, dur - 0.28), pose: 'tap', expression: s.price === 'high' && s.mode === 'buy' ? 'worried' : 'happy' },
    ] satisfies HedgyKey[]).sort((a, b) => a.at - b.at);
    const rawActorBounds = actorBounds({ who: s.who, x: s.actorX, y: STAGE.floor, facing: s.facing, scale: 1, time: t, keys: actorKeys });
    const actorCorrection = rawActorBounds.left < 28 ? 28 - rawActorBounds.left : rawActorBounds.right > 692 ? 692 - rawActorBounds.right : 0;
    const actorX = s.actorX + actorCorrection;
    const held = heldGeometry(s.who, actorX, s.facing, t, s.item, s.itemScale, actorKeys);
    const paymentHeld = heldGeometry(s.who, actorX, s.facing, t, payId, payScale, actorKeys);
    const payHand = paymentHeld.center;
    const payStationPoint = { x: s.placeX + s.facing * 66, y: place.top - payDims.h / 2 };
    const itemStationPoint = { x: s.placeX - s.facing * 68, y: place.top - itemDims.h / 2 };
    const payFrom = s.mode === 'buy' ? payHand : payStationPoint;
    const payTo = s.mode === 'buy' ? payStationPoint : payHand;
    const itemFrom = s.mode === 'buy' ? itemStationPoint : held.center;
    const itemTo = s.mode === 'buy' ? held.center : itemStationPoint;
    const payMoving = t >= payStart && t < payArrives;
    const itemMoving = t >= itemStart && t < itemArrives;
    const payPoint = t < payStart ? payFrom : payMoving ? transferPoint(t, payStart, FLIGHT, payFrom, payTo) : payTo;
    const itemPoint = t < itemStart ? itemFrom : itemMoving ? transferPoint(t, itemStart, FLIGHT, itemFrom, itemTo) : itemTo;
    const paymentHit = squash(t, payArrives, 0.14, 0.16), itemHit = squash(t, itemArrives, 0.14, 0.18);

    drawStage(ctx, { floorY: STAGE.floor, line: true });
    const placeDims = itemSize(s.place, PLACE_SCALE);
    drawItem(ctx, s.place, {
      x: s.placeX, y: STAGE.floor - placeDims.h / 2, t, scale: PLACE_SCALE,
      sign: s.sign, clerk: s.place === 'booth', stock: 0, stockKind: 'none',
    });
    drawActor(ctx, {
      who: s.who, x: actorX, y: STAGE.floor, scale: 1, facing: s.facing, time: t,
      look: t < itemStart ? 'forward' : 'down', keys: actorKeys,
      handTarget: s.mode === 'sell' && t < itemArrives ? held.hand : paymentHeld.hand,
      reach: t < payArrives + 0.1 || t >= itemStart ? 0.9 : 0.55,
    });

    drawItemAt(ctx, payId, payPoint, t, payScale, {
      sx: paymentHit.sx, sy: paymentHit.sy,
      ...(s.price === 'high' ? { level: 0.92 } : {}),
    });
    drawItemAt(ctx, s.item, itemPoint, t, held.scale, { sx: itemHit.sx, sy: itemHit.sy });

    if (s.tag) {
      const tag = smallTag(s.tag), active = ease.outCubic(phase(t, itemArrives - 0.06, itemArrives + 0.16));
      const x = clamp(itemPoint.x + Math.min(38, itemDims.w * 0.32), 36 + tag.w * 0.28, STAGE.w - 36 - tag.w * 0.28);
      const y = clamp(itemPoint.y - itemDims.h / 2 - tag.h * 0.24, 40 + tag.h * 0.25, STAGE.floor - 20);
      drawSprite(ctx, tag, x, y, { anchor: [0.5, 0.5], scale: 0.52, alpha: active });
    }

    const ringAt = itemArrives;
    ring(ctx, itemPoint.x, Math.min(STAGE.floor - 38, itemPoint.y + itemDims.h / 2 + 24), ringAt, t, { r: 34, width: 5, duration: 0.24 });
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const safeDur = Math.max(0.05, dur), s = plan(props, safeDur), payId = paymentId(s);
    const payTargetAt = s.mode === 'buy' ? s.first : s.second, itemTargetAt = s.mode === 'buy' ? s.second : s.first;
    const payArrives = Math.max(0, payTargetAt - FLIGHT) + FLIGHT;
    const itemArrives = Math.max(0, itemTargetAt - FLIGHT) + FLIGHT;
    return cuesIn(safeDur, [
      cue(0.03, 'clunk', 0.62, s.placeX),
      cue(Math.max(0, payTargetAt - FLIGHT), s.mode === 'buy' ? 'slide' : 'paper', 0.9, s.mode === 'buy' ? s.actorX : s.placeX),
      cue(payArrives, s.price === 'high' ? 'thump' : s.tender === 'coin' ? 'coin' : 'paper', s.price === 'high' ? 1.35 : 0.95, s.mode === 'buy' ? s.placeX : s.actorX),
      cue(Math.max(0, itemTargetAt - FLIGHT), 'slide', 0.88, s.mode === 'buy' ? s.placeX : s.actorX),
      cue(itemArrives, s.mode === 'buy' ? 'land' : payId === 'cashPile' ? 'thump' : 'coin', 1.15, s.mode === 'buy' ? s.actorX : s.placeX),
      ...(s.tag ? [cue(itemArrives + 0.06, 'paper', 0.58, s.actorX)] : []),
    ]);
  },
};
