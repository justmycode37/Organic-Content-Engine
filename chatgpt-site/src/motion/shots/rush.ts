// rush — full-size buyers dash for a market stall; the final purchase closes it.
import type { Cue, Frame, ShotProps } from '../core.ts';
import { arc, clamp, ease, lerp, phase, tween } from '../kit/motion.ts';
import { drawStage, label } from '../kit/stage.ts';
import { ring, sparks } from '../kit/fx.ts';
import { boothWindow } from '../props/booth.ts';
import { ACTORS, STAGE, actorFace, actorPaw, beats, cue, cuesIn, drawActor, drawItem, itemParam, itemSize, num, pick, str, type ActorId, type ItemId } from './common.ts';
import type { ShotDef } from './index.ts';

const DEFAULT_CROWD: ActorId[] = ['fan1', 'fan2', 'fan3'];
const PLACES = ['booth', 'bank', 'shop', 'exchange'] as const;
type Place = (typeof PLACES)[number];
const FLOOR = STAGE.floor;
const PLACE_X = 414;
const RUN_START_X = 124;
const STEP_X = 218;
const EXIT_X = 492;
const RUN_DURATION = 0.46;
const EXIT_DURATION = 0.41;
const TRANSFER_START = 0.32;
const TRANSFER_END = 0.10;

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

function defaultSign(place: Place): string {
  return place === 'booth' ? 'TICKETS' : place === 'exchange' ? 'EXCHANGE' : place === 'shop' ? 'MARKET' : 'BANK';
}

function plan(props: ShotProps, dur: number): RushPlan {
  const crowd = actorList(props.params?.crowd);
  const place = pick(props.params, 'place', PLACES, 'booth');
  const fallback = crowd.map((_, i) => [0.12, 0.42, 0.72][i]!);
  const rawArrivals = beats(props, dur, fallback);
  const arrivals: number[] = [];
  for (let i = 0; i < crowd.length; i++) {
    const minGap = i >= 2 ? 0.70 : 0.28;
    const earliest = i === 0 ? 0 : arrivals[i - 1]! + minGap;
    arrivals.push(clamp(Math.max(rawArrivals[i] ?? fallback[i]!, earliest), 0, dur));
  }
  const stock = Math.floor(num(props.params, 'stock', crowd.length, 0, 5));
  const sign = str(props.params, 'sign', defaultSign(place)).toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 8) || defaultSign(place);
  const endSign = str(props.params, 'endSign', 'SOLD OUT').toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 8) || 'SOLD OUT';
  const soldAt = stock === 0 ? 0 : stock <= arrivals.length ? arrivals[stock - 1] : undefined;
  return {
    crowd, arrivals, place, item: itemParam(props.params, 'item', 'ticket'), stock, sign, endSign, soldAt,
    signY: place === 'booth' ? FLOOR - 720 + 66 : place === 'shop' ? FLOOR - 564 + 210 : FLOOR - 564 + 156,
  };
}

function itemFlight(from: { x: number; y: number }, to: { x: number; y: number }, p: number) {
  if (p < 0.60) {
    const u = ease.inOutCubic(p / 0.60);
    return { x: from.x, y: lerp(from.y, to.y, u) };
  }
  const u = ease.inOutCubic((p - 0.60) / 0.40);
  return arc({ x: from.x, y: to.y }, to, 16, u);
}

function heldGeometry(who: ActorId, x: number, t: number, item: ItemId) {
  const actor = { who, x, y: FLOOR, facing: 1 as const, time: t, pose: 'hold' as const };
  const face = actorFace(actor), paw = actorPaw(actor), dims = itemSize(item, 0.5);
  const lowY = Math.max(paw.y + 16, face.y + face.r + dims.h / 2 + 14);
  if (lowY + dims.h / 2 <= FLOOR - 4) {
    const center = { x: clamp(paw.x + Math.min(42, dims.w * 0.22), dims.w / 2 + 24, STAGE.w - dims.w / 2 - 24), y: lowY };
    return { center, hand: { x: center.x - dims.w * 0.34, y: center.y - dims.h * 0.18 }, dims };
  }
  const center = {
    x: clamp(face.x, dims.w / 2 + 24, STAGE.w - dims.w / 2 - 24),
    y: Math.max(24 + dims.h / 2, face.y - face.r - dims.h / 2 - 16),
  };
  return { center, hand: { x: center.x, y: center.y + dims.h / 2 + 8 }, dims };
}

export const rushShot: ShotDef = {
  name: 'rush',
  stage: 'clean',
  describe: 'Two or three full-size buyers run one at a time to a full-size booth or building and receive a half-size item at the paw. params: crowd (2–3 actor ids, default fan1/fan2/fan3), place (booth|bank|shop|exchange, default booth), item (any item id, default ticket), stock (0–5, default crowd size), sign (word, default TICKETS or place name), endSign (word, default SOLD OUT). Events: one per buyer in order; each buyer takes an item at the paw, the final stocked sale changes the sign to endSign, and a booth shutter closes when stock runs out.',
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame, dur = Math.max(0.05, frame.dur), t = clamp(frame.t, 0, dur), s = plan(props, dur);
    const soldCount = s.arrivals.filter(at => t >= at).length;
    const remaining = Math.max(0, s.stock - soldCount);
    const shutter = s.soldAt === undefined ? 0 : ease.outCubic(phase(t, s.soldAt, s.soldAt + 0.30));
    const sign = s.soldAt !== undefined && t >= s.soldAt + 0.04 ? s.endSign : s.sign;
    const window = s.place === 'booth' ? boothWindow({ x: PLACE_X, y: FLOOR, scale: 1 }) : undefined;
    const sourceY = window ? window.y + window.h * 0.58 : FLOOR - 195;

    drawStage(ctx, { floorY: FLOOR, line: true, shadow: [{ x: PLACE_X, y: FLOOR - 3, w: 340 }] });
    drawItem(ctx, s.place, {
      x: PLACE_X, y: FLOOR - itemSize(s.place).h / 2, t, scale: 1,
      sign: s.place === 'booth' ? sign : s.sign,
      sold: s.soldAt !== undefined && t >= s.soldAt,
      stock: remaining,
      stockKind: s.place === 'booth' ? (s.item === 'ticket' ? 'ticket' : 'box') : 'none',
      shutter: s.place === 'booth' ? shutter : undefined,
      clerk: s.place === 'booth',
    });

    if (s.place !== 'booth' && s.soldAt !== undefined && t >= s.soldAt + 0.04) {
      const flip = ease.outBack(phase(t, s.soldAt + 0.04, s.soldAt + 0.26));
      ring(ctx, PLACE_X, s.signY, s.soldAt, t, { r: 76, duration: 0.48 });
      if (s.place === 'shop') {
        drawItem(ctx, s.place, { x: PLACE_X, y: FLOOR - itemSize(s.place).h / 2, t, scale: 1, sign: s.endSign, sold: true, alpha: flip });
      } else {
        label(ctx, s.endSign, PLACE_X, s.signY, { variant: 'sign', pop: flip, maxWidth: 420 });
      }
    }

    for (let i = 0; i < s.crowd.length; i++) {
      const who = s.crowd[i]!, arrival = s.arrivals[i]!, hasStock = i < s.stock;
      const start = i === 0 ? 0 : Math.max(0, arrival - RUN_DURATION, i >= 2 ? s.arrivals[i - 1]! + 0.22 : 0);
      if (t < start) continue;
      const runEnd = Math.min(arrival, start + RUN_DURATION);
      const exitStart = arrival + 0.12, exitEnd = exitStart + EXIT_DURATION;
      const x = t < runEnd
        ? tween(t, start, Math.max(0.06, runEnd - start), RUN_START_X, STEP_X, ease.inOutCubic)
        : t < exitStart ? STEP_X : t < exitEnd ? tween(t, exitStart, EXIT_DURATION, STEP_X, EXIT_X, ease.inOutCubic) : EXIT_X;
      const presence = i === s.crowd.length - 1 ? 1 : 1 - phase(t, exitEnd - 0.04, exitEnd + 0.08);
      const receivedAt = arrival + TRANSFER_END;
      const held = heldGeometry(who, x, t, s.item);
      const heldAtStep = heldGeometry(who, STEP_X, t, s.item);
      const safeSourceX = Math.min(window ? window.x + window.w * 0.82 : PLACE_X + 130, STAGE.w - held.dims.w / 2 - 24);
      const sourceAt = { x: safeSourceX, y: sourceY };
      const itemP = ease.inOutCubic(phase(t, arrival - TRANSFER_START, receivedAt));
      const itemPos = t < receivedAt ? itemFlight(sourceAt, heldAtStep.center, itemP) : held.center;
      const keys = [
        { at: start, pose: 'run' as const, expression: 'determined' as const },
        ...(runEnd < arrival - 0.06 ? [{ at: runEnd, pose: 'tap' as const, expression: 'determined' as const }] : []),
        { at: arrival - 0.035, pose: hasStock ? 'receive' as const : 'wave-off' as const, expression: hasStock ? 'happy' as const : 'worried' as const },
        { at: arrival + 0.16, pose: hasStock ? 'hold' as const : 'tap' as const, expression: hasStock ? 'happy' as const : 'worried' as const },
        { at: exitStart, pose: hasStock ? 'run' as const : 'wave-off' as const, expression: hasStock ? 'happy' as const : 'sad' as const },
      ];
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

      const transferStart = arrival - TRANSFER_START;
      if (hasStock && t >= transferStart) {
        const itemAlpha = presence;
        const pop = t < receivedAt ? 1 : 0.96 + 0.08 * ease.outBack(phase(t, receivedAt, receivedAt + 0.12));
        ctx.save();
        ctx.globalAlpha *= itemAlpha;
        drawItem(ctx, s.item, { x: itemPos.x, y: itemPos.y, t, scale: 0.5 * pop, rot: Math.sin(itemP * Math.PI) * 0.045 });
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
      const start = i === 0 ? 0 : Math.max(0, at - RUN_DURATION);
      list.push(cue(Math.min(at, start + RUN_DURATION * 0.5), 'footfall', 0.9, RUN_START_X + 48));
      if (i < s.stock) list.push(cue(at + TRANSFER_END, 'paper', 1.05, STEP_X + 42));
    });
    if (s.soldAt !== undefined) list.push(cue(s.soldAt + 0.27, 'clunk', 1.4, PLACE_X));
    return cuesIn(d, list);
  },
};
