// runto — a full-size actor runs to a stationary destination, then skids to a stop.
import type { Cue, Frame, ShotProps } from '../core.ts';
import { clamp, ease, phase } from '../kit/motion.ts';
import { PAL } from '../kit/pixel.ts';
import { drawStage } from '../kit/stage.ts';
import { poof, speedLines } from '../kit/fx.ts';
import type { HedgyKey } from '../actor/hedgy.ts';
import { ACTORS, STAGE, actorBounds, actorPaw, cue, cuesIn, drawActor, drawItem, itemParam, itemSize, pick, str, type ItemId } from './common.ts';
import type { ShotDef } from './index.ts';

type Destination = 'booth' | 'bank' | 'exchange' | 'shop';
type Mood = 'panic' | 'determined';
interface RuntoPlan {
  start: number;
  arrive: number;
  who: string;
  place: Destination;
  sign: string;
  mood: Mood;
  carry?: ItemId;
  startX: number;
  endX: number;
  placeX: number;
  facing: 1 | -1;
  carryScale: number;
}

const PLACE_SCALE = 0.74;
const placeIds = ['booth', 'bank', 'exchange', 'shop'] as const;

function timing(props: ShotProps, dur: number): { start: number; arrive: number } {
  const events = [...(props.events ?? [])].filter(event => Number.isFinite(event.at)).sort((a, b) => a.at - b.at);
  let start: number, arrive: number;
  if (events.length >= 2) {
    start = clamp(events[0]!.at, 0, dur);
    arrive = clamp(events[events.length - 1]!.at, 0, dur);
  } else if (events.length === 1) {
    arrive = clamp(events[0]!.at, 0, dur);
    start = Math.max(0, arrive - Math.min(0.68, dur * 0.42));
  } else {
    start = Math.min(0.18, dur * 0.12);
    arrive = Math.min(dur, start + Math.min(0.86, dur * 0.36));
  }
  if (arrive - start < 0.3) start = Math.max(0, arrive - Math.min(0.42, dur * 0.38));
  if (arrive - start < 0.12) arrive = Math.min(dur, start + 0.22);
  return { start, arrive };
}

function plan(props: ShotProps, dur: number): RuntoPlan {
  const times = timing(props, dur);
  const rawCarry = str(props.params, 'carry', 'none');
  const place = pick(props.params, 'place', placeIds, 'booth');
  const facing: 1 | -1 = place === 'bank' || place === 'exchange' ? -1 : 1;
  const placeX = facing === 1 ? 460 : 360;
  const startX = facing === 1 ? 112 : 605, endX = facing === 1 ? 292 : 468;
  const carry = rawCarry === 'none' ? undefined : itemParam(props.params, 'carry', 'wallet');
  const carryDims = carry ? itemSize(carry) : undefined;
  return {
    ...times,
    who: pick(props.params, 'who', ACTORS, 'hedgy'),
    place,
    sign: str(props.params, 'sign', 'BUY').toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 8) || 'BUY',
    mood: pick(props.params, 'mood', ['panic', 'determined'] as const, 'panic'),
    carry, startX, endX, placeX, facing,
    carryScale: carryDims ? Math.min(0.48, 132 / Math.max(carryDims.w, carryDims.h)) : 0,
  };
}

function smoothStep(value: number): number {
  const p = clamp(value);
  return p * p * p * (p * (p * 6 - 15) + 10);
}

function runProgress(t: number, start: number, end: number): number {
  return end <= start ? (t < start ? 0 : 1) : smoothStep(phase(t, start, end));
}

function drawItemAt(ctx: Frame['ctx'], item: ItemId, x: number, y: number, t: number, scale: number, extra: Record<string, unknown> = {}) {
  drawItem(ctx, item, { x, y, t, scale, ...extra });
}

function inverseInOutCubic(value: number): number {
  const target = clamp(value);
  let lo = 0, hi = 1;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (ease.inOutCubic(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function reactionKeys(start: number, arrive: number, dur: number, mood: Mood) {
  const expression = mood === 'panic' ? 'shocked' as const : 'determined' as const;
  const keys: HedgyKey[] = [
    { at: 0, pose: 'idle' as const, expression: 'neutral' as const },
    { at: Math.max(0, Math.min(start - 0.2, 0.12)), pose: mood === 'panic' ? 'panic' as const : 'tap' as const, expression },
    { at: start, pose: 'run' as const, expression },
    { at: arrive, pose: 'push' as const, expression },
  ];
  for (let at = arrive + 0.32, i = 0; at < dur - 0.08; at += 0.38, i++) {
    keys.push({ at, pose: i % 2 === 0 ? 'tap' as const : 'point' as const, expression });
  }
  return keys;
}

export const runtoShot: ShotDef = {
  name: 'runto',
  stage: 'clean',
  describe: "An actor runs across the stage to a destination, skids at its counter, and kicks up dust; booth and shop approach from the left, bank and exchange from the right. params: who (any actor id, default hedgy), place (booth|bank|exchange|shop, default booth), sign (up to 8 characters on the destination, default BUY), mood (panic|determined, default panic), carry (none or any item id, default none). Events: 1 = the run begins; the last event = skid and dust at the counter.",
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame, dur = Math.max(0.05, frame.dur), t = clamp(frame.t, 0, dur), s = plan(props, dur);
    const progress = runProgress(t, s.start, s.arrive);
    const runX = s.startX + (s.endX - s.startX) * progress;
    const placeX = s.placeX;
    const skid = phase(t, s.arrive, s.arrive + 0.34);
    const skidOffset = 15 * Math.sin(Math.PI * skid) * s.facing;
    const settle = phase(t, s.arrive + 0.2, s.arrive + 0.48);
    const settlePhase = Math.max(0, t - s.arrive);
    const x = runX + skidOffset + Math.sin(settlePhase * Math.PI * 2 / 0.48) * 12 * settle * s.facing;
    const actorY = STAGE.floor - Math.max(0, Math.sin(settlePhase * Math.PI * 2 / 0.4)) * 14 * settle;
    const keys = reactionKeys(s.start, s.arrive, dur, s.mood);
    const actorBoundsNow = actorBounds({ who: s.who, x, y: actorY, facing: s.facing, scale: 1, time: t, keys });
    const correction = actorBoundsNow.left < 28 ? 28 - actorBoundsNow.left : actorBoundsNow.right > 692 ? 692 - actorBoundsNow.right : 0;
    const actorX = x + correction;
    const carriedSize = s.carry ? itemSize(s.carry, s.carryScale) : undefined;
    const actorBase = { who: s.who, x: actorX, y: actorY, facing: s.facing, scale: 1, time: t, keys };
    const paw = actorPaw(actorBase);
    const held = carriedSize ? {
      x: clamp(paw.x + s.facing * Math.min(48, carriedSize.w * 0.3), 28 + carriedSize.w / 2, STAGE.w - 28 - carriedSize.w / 2),
      y: clamp(paw.y + carriedSize.h * 0.18, STAGE.floor - carriedSize.h / 2 - 180, STAGE.floor - carriedSize.h / 2 - 16),
    } : undefined;
    const actorOptions = {
      who: s.who, x: actorX, y: actorY, facing: s.facing, time: t, scale: 1, shadow: true,
      look: t < s.arrive ? 'forward' as const : 'up' as const,
      keys,
      ...(held ? { handTarget: { x: held.x - s.facing * Math.min(40, carriedSize!.w * 0.22), y: held.y - carriedSize!.h * 0.18 }, reach: 0.88 } : {}),
      squash: 1 - 0.18 * Math.exp(-(((t - s.arrive) / 0.105) ** 2)),
    };
    drawStage(ctx, { floorY: STAGE.floor, line: true });
    // Keep the full-size destination fixed while the actor runs on event 1.
    const placeDims = itemSize(s.place, PLACE_SCALE);
    drawItem(ctx, s.place, { x: placeX, y: STAGE.floor - placeDims.h / 2, t, scale: PLACE_SCALE, sign: s.sign, stock: 1, clerk: true });
    if (t >= s.start && t < s.arrive + 0.28) {
      const first = Math.max(0, s.start - 0.08);
      for (let i = 0; i < 4; i++) {
        const burstAt = first + i * Math.max(0.16, (s.arrive - s.start) / 4);
        if (burstAt > s.arrive) break;
        speedLines(ctx, x - s.facing * 58, STAGE.floor - 190, { x: s.facing, y: 0 }, t, { t0: burstAt, count: 4, seed: frame.seed + i, duration: 0.34, length: 72, width: 10 });
      }
    }
    drawActor(ctx, actorOptions);
    if (s.carry && held && carriedSize) {
      const carryX = clamp(held.x, 28 + carriedSize.w / 2, STAGE.w - 28 - carriedSize.w / 2);
      const flap = 0.5 + 0.18 * Math.sin(t * Math.PI * 2 / 0.74);
      const carryRot = 0.07 * Math.sin(t * Math.PI * 2 / 0.62);
      // Draw the carried prop over the reaching paw so it stays legible in the run.
      drawItemAt(ctx, s.carry, carryX, held.y, t, s.carryScale, {
        rot: carryRot,
        ...(s.carry === 'wallet' ? { open: flap, empty: true } : {}),
      });
    }
    poof(ctx, s.endX + s.facing * 28, STAGE.floor - 28, s.arrive, t, { count: 5, seed: frame.seed, radius: 36, duration: 0.52, color: PAL.paperShade });
    // A short counter skid line and settled dust sell the contact without shaking the stage.
    if (skid > 0) speedLines(ctx, s.endX - s.facing * 14, STAGE.floor - 55, { x: -s.facing, y: 0 }, t, { t0: s.arrive, count: 3, seed: frame.seed + 7, duration: 0.3, length: 42, width: 8 });
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const safeDur = Math.max(0.05, dur), s = plan(props, safeDur), span = Math.max(0.12, s.arrive - s.start);
    const footfalls = [0.25, 0.55, 0.85].map((p, i) => {
      const target = Math.max(0.02, Math.min(0.98, p));
      return cue(s.start + span * inverseInOutCubic(target), 'footfall', i === 1 ? 1.05 : 0.78, s.startX + (s.endX - s.startX) * target);
    });
    const prepareAt = Math.max(0, Math.min(s.start - 0.2, 0.12));
    return cuesIn(safeDur, [
      cue(prepareAt, 'rustle', 0.65, s.startX),
      cue(s.start, 'swish', 0.9, s.startX),
      ...footfalls,
      cue(s.arrive, 'slide', 1, s.endX),
      cue(s.arrive + 0.04, 'whump', 1.45, s.endX),
      cue(s.arrive + 0.19, 'land', 0.85, s.endX),
    ]);
  },
};
