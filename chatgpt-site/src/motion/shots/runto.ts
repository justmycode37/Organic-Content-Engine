// runto — a full-size actor runs to a destination that slides into view, then skids to a stop.
import type { Cue, Frame, ShotProps } from '../core.ts';
import { clamp, ease, phase } from '../kit/motion.ts';
import { PAL } from '../kit/pixel.ts';
import { drawStage } from '../kit/stage.ts';
import { poof, speedLines } from '../kit/fx.ts';
import { boothCounter } from '../props/booth.ts';
import { HEDGY_TIMING } from '../actor/hedgy.ts';
import type { HedgyKey } from '../actor/hedgy.ts';
import { runStride } from '../props/people.ts';
import { ACTORS, STAGE, cue, cuesIn, drawActor, drawItem, itemParam, itemSize, pick, str, type ItemId } from './common.ts';
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
}

const PLACE_X = 584, PLACE_SCALE = 0.48;
const PUSH_TRANSITION_HALF = 0.21;
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
  const startX = 160, endX = 350;
  return {
    ...times,
    who: pick(props.params, 'who', ACTORS, 'hedgy'),
    place: pick(props.params, 'place', placeIds, 'booth'),
    sign: str(props.params, 'sign', 'BUY').toUpperCase(),
    mood: pick(props.params, 'mood', ['panic', 'determined'] as const, 'panic'),
    carry: rawCarry === 'none' ? undefined : itemParam(props.params, 'carry', 'wallet'),
    startX, endX,
  };
}

function smoothStep(value: number): number {
  const p = clamp(value);
  return p * p * p * (p * (p * 6 - 15) + 10);
}

function pushEase(value: number): number {
  const p = clamp(value);
  return p < 0.5 ? 16 * p ** 5 : 1 - ((-2 * p + 2) ** 5) / 2;
}

function runProgress(t: number, start: number, end: number): number {
  return end <= start ? (t < start ? 0 : 1) : smoothStep(phase(t, start, end));
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
  describe: "A full-size actor runs from the left to a stationary destination and skids beside its counter; params: who (any actor id in ACTORS, default hedgy), place='booth'|'bank'|'exchange'|'shop' (default booth), sign='BUY' (printed on the booth sign, default BUY), mood='panic'|'determined' (default panic), carry='none' (optional item id in ITEMS; 'wallet' opens empty at the paw). Events: 1 = the actor starts running; the last event = skid, squash, and dust poof at the counter.",
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame, dur = Math.max(0.05, frame.dur), t = clamp(frame.t, 0, dur), s = plan(props, dur);
    // This timed booth scene enters on a push-left; counter that push so the booth is fixed on screen.
    const followsPushEntry = s.who === 'hedgy' && s.place === 'booth' && s.sign === 'BUY' && s.mood === 'panic';
    const entryProgress = followsPushEntry ? phase(t, -PUSH_TRANSITION_HALF, PUSH_TRANSITION_HALF) : 1;
    const entryOffset = followsPushEntry ? STAGE.w * (1 - pushEase(entryProgress)) : 0;
    const progress = runProgress(t, s.start, s.arrive);
    const runX = s.startX + (s.endX - s.startX) * progress - entryOffset;
    const placeX = PLACE_X - entryOffset;
    const skid = phase(t, s.arrive, s.arrive + 0.34);
    const skidOffset = 15 * Math.sin(Math.PI * skid);
    const settle = phase(t, s.arrive + 0.2, s.arrive + 0.48);
    const settlePhase = Math.max(0, t - s.arrive);
    const x = runX + skidOffset + Math.sin(settlePhase * Math.PI * 2 / 0.48) * 12 * settle;
    const actorY = STAGE.floor - Math.max(0, Math.sin(settlePhase * Math.PI * 2 / 0.4)) * 14 * settle;
    const distance = s.endX - s.startX;
    const runClock = s.start + (distance * progress / runStride) * HEDGY_TIMING.run.loop;
    const runEnd = s.start + (distance / runStride) * HEDGY_TIMING.run.loop;
    const poseTime = t < s.start ? t : t <= s.arrive ? runClock : runEnd + (t - s.arrive);
    const carriedSize = s.carry ? itemSize(s.carry, 0.5) : undefined;
    const held = carriedSize ? { x: x + 108, y: STAGE.floor - 70 } : undefined;
    const counterTap = 0.5 + 0.5 * Math.sin(settlePhase * Math.PI * 2 / 0.42);
    const boothTouch = s.place === 'booth' ? boothCounter({ x: placeX, y: STAGE.floor, scale: PLACE_SCALE }) : undefined;
    const actorOptions = {
      who: s.who, x, y: actorY, facing: 1 as const, time: poseTime, scale: 1, shadow: true,
      look: t < s.arrive ? 'forward' as const : 'up' as const,
      keys: reactionKeys(s.start, runEnd, dur, s.mood),
      ...(held ? { handTarget: { x: held.x - 42, y: held.y - 4 }, reach: 0.88 } : {}),
      ...(t >= s.arrive ? {
        handTarget: boothTouch
          ? { x: boothTouch.x + 10, y: boothTouch.y + boothTouch.h / 2 + (counterTap - 0.5) * 3 }
          : { x: placeX - 130, y: STAGE.floor - 180 },
        reach: 0.96,
      } : {}),
      squash: 1 - 0.18 * Math.exp(-(((t - s.arrive) / 0.105) ** 2)),
    };
    // Keep the destination fixed and visible throughout; the actor alone runs on event 1.
    ctx.save();
    ctx.translate(-entryOffset, 0);
    drawStage(ctx, { floorY: STAGE.floor, line: true });
    ctx.restore();
    drawItem(ctx, s.place, { x: placeX, y: STAGE.floor, t, scale: PLACE_SCALE, sign: s.sign, stock: 1, clerk: true });
    if (t >= s.start && t < s.arrive + 0.28) {
      const first = Math.max(0, s.start - 0.08);
      for (let i = 0; i < 4; i++) {
        const burstAt = first + i * Math.max(0.16, (s.arrive - s.start) / 4);
        if (burstAt > s.arrive) break;
        speedLines(ctx, x - 58, STAGE.floor - 190, { x: 1, y: 0 }, t, { t0: burstAt, count: 4, seed: frame.seed + i, duration: 0.34, length: 72, width: 10 });
      }
    }
    if (s.carry && held && carriedSize) {
      const carryX = clamp(held.x, 24 + carriedSize.w / 2, STAGE.w - 24 - carriedSize.w / 2);
      const flap = 0.5 + 0.18 * Math.sin(t * Math.PI * 2 / 0.74);
      const carryRot = 0.07 * Math.sin(t * Math.PI * 2 / 0.62);
      drawItem(ctx, s.carry, {
        x: carryX, y: held.y, t, scale: 0.5, rot: carryRot,
        ...(s.carry === 'wallet' ? { open: flap, empty: true } : {}),
      });
    }
    drawActor(ctx, actorOptions);
    poof(ctx, s.endX + 28, STAGE.floor - 28, s.arrive, t, { count: 5, seed: frame.seed, radius: 36, duration: 0.52, color: PAL.paperShade });
    // A short counter skid line and settled dust sell the contact without shaking the stage.
    if (skid > 0) speedLines(ctx, s.endX + 14, STAGE.floor - 55, { x: -1, y: 0 }, t, { t0: s.arrive, count: 3, seed: frame.seed + 7, duration: 0.3, length: 42, width: 8 });
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
