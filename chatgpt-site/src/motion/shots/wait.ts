// wait — time races by while one character waits and grows impatient.
import type { Cue, Frame, ShotProps } from '../core.ts';
import { bob, clamp, ease, phase } from '../kit/motion.ts';
import { Grid, PAL } from '../kit/pixel.ts';
import { drawSprite } from '../kit/sprite.ts';
import { drawStage, label } from '../kit/stage.ts';
import { STAGE, ACTORS, actorBounds, actorFace, actorPaw, beats, cue, cuesIn, drawActor, drawItem, itemSize, pick, str, type ItemId } from './common.ts';
import type { ShotDef } from './index.ts';

const TIMERS = ['clock', 'hourglass', 'calendar'] as const;
type TimerId = typeof TIMERS[number];
const MOODS = ['neutral', 'worried', 'sad'] as const;
type WaitMood = typeof MOODS[number];
const HELD_ITEMS = ['coin', 'ticket', 'key'] as const satisfies readonly ItemId[];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const ACTOR_X = 140;
const TIMER_X = 520;
const TIMER_Y = 378;
const TIMER_SCALE: Record<TimerId, number> = { clock: 0.62, hourglass: 0.88, calendar: 0.78 };

const pendulum = new Grid(12, 18)
  .line({ x: 6, y: 0 }, { x: 6, y: 11 }, 2, PAL.grey3)
  .line({ x: 5, y: 1 }, { x: 5, y: 10 }, 1, PAL.paperShade)
  .ellipse(6, 14, 5, 4, PAL.ink)
  .ellipse(5, 13, 3, 3, PAL.gold2)
  .ellipse(4, 12, 1, 1, PAL.gold1)
  .outline()
  .sprite('shot-wait:pendulum');

interface WaitPlan {
  checkAt: number;
  sighAt: number;
  timer: TimerId;
  who: string;
  mood: WaitMood;
  item?: ItemId;
  label: string;
}

function plan(props: ShotProps, dur: number): WaitPlan {
  const [check, sigh] = beats(props, dur, [0.24, 0.72]);
  const checkAt = check ?? dur * 0.24;
  const sighAt = Math.min(dur, Math.max(sigh ?? dur * 0.72, checkAt + Math.min(0.32, dur * 0.22)));
  const rawItem = str(props.params, 'item', 'none').toLowerCase();
  return {
    checkAt, sighAt,
    timer: pick(props.params, 'timer', TIMERS, 'clock'),
    who: pick(props.params, 'who', ACTORS, 'hedgy'),
    mood: pick(props.params, 'mood', MOODS, 'worried'),
    item: HELD_ITEMS.includes(rawItem as typeof HELD_ITEMS[number]) ? rawItem as ItemId : undefined,
    label: str(props.params, 'label', '').trim(),
  };
}

function raceProgress(t: number, dur: number, checkAt: number) {
  const early = 0.86 * phase(t, 0, dur);
  const accelerated = 0.14 * ease.inCubic(phase(t, checkAt, dur));
  return clamp(early + accelerated);
}

export const waitShot: ShotDef = {
  name: 'wait',
  stage: 'clean',
  describe: 'A waiting actor taps a foot, looks up at a fast-moving timer, checks an optional item, and sighs while a clock hand and pendulum keep moving. params: timer (clock|hourglass|calendar, default clock), who (actor id, default hedgy), mood (neutral|worried|sad, default worried), item (optional coin|ticket|key in the paw, default none), label (optional word beside the timer, default none). Events: 1 = the actor checks the item or timer, 2 = the actor sighs and keeps waiting.',
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame, dur = Math.max(0.05, frame.dur), t = clamp(frame.t, 0, dur), s = plan(props, dur);
    const race = raceProgress(t, dur, s.checkAt);
    const checkLift = -8 * ease.outCubic(phase(t, s.checkAt - 0.12, s.checkAt + 0.16));
    const sighDrop = 12 * ease.inOutCubic(phase(t, s.sighAt - 0.16, s.sighAt + 0.22));
    const look = t < s.checkAt ? 'up' : t < s.sighAt ? (s.item ? 'down' : 'up') : 'up';
    const tapAgain = Math.min(s.checkAt + 0.62, s.sighAt - 0.08);
    const actorKeys = [
      { at: 0, pose: 'tap' as const, expression: s.mood, look: 'up' as const },
      { at: s.checkAt, pose: s.item ? 'think' as const : 'lookup' as const, expression: s.mood, look: s.item ? 'down' as const : 'up' as const },
      { at: tapAgain, pose: 'tap' as const, expression: s.mood, look: 'up' as const },
      { at: s.sighAt, pose: 'wave-off' as const, expression: 'sad' as const, look: 'up' as const },
      { at: Math.min(dur, s.sighAt + 0.3), pose: 'tap' as const, expression: 'sad' as const, look: 'up' as const },
    ];
    const actorBoundsNow = actorBounds({ who: s.who, x: ACTOR_X, y: STAGE.floor, facing: 1, time: t, keys: actorKeys });
    const actorCorrection = actorBoundsNow.left < 28 ? 28 - actorBoundsNow.left : actorBoundsNow.right > 692 ? 692 - actorBoundsNow.right : 0;
    const actorX = ACTOR_X + actorCorrection;
    const actorBase = { who: s.who, x: actorX, y: STAGE.floor, facing: 1 as const, time: t, keys: actorKeys };
    const face = actorFace(actorBase), paw = actorPaw(actorBase);
    const itemDims = s.item ? itemSize(s.item, 0.5) : undefined;
    const heldPos = itemDims ? {
      x: clamp(paw.x + Math.min(42, itemDims.w * 0.22), itemDims.w / 2 + 28, STAGE.w - itemDims.w / 2 - 28),
      y: Math.min(STAGE.h - 24 - itemDims.h / 2, Math.max(paw.y + 18, face.y + face.r + itemDims.h / 2 + 14)) + checkLift + sighDrop + bob(t, 1.7, 2),
    } : undefined;

    drawStage(ctx, { floorY: STAGE.floor, line: true, shadow: [{ x: actorX, y: STAGE.floor - 2, w: 170 }, { x: TIMER_X, y: STAGE.floor - 4, w: 240 }] });
    drawActor(ctx, {
      who: s.who, x: actorX, y: STAGE.floor, facing: 1, time: t, look,
      keys: actorKeys,
      handTarget: heldPos && itemDims ? { x: heldPos.x - itemDims.w * 0.34, y: heldPos.y - itemDims.h * 0.18 } : undefined,
      reach: s.item ? 0.78 : 0,
    });

    if (s.item && heldPos) drawItem(ctx, s.item, { x: heldPos.x, y: heldPos.y, t, scale: 0.5, rot: -0.035 + Math.sin(t * 2.1) * 0.025 });

    if (s.timer === 'clock') {
      drawItem(ctx, 'clock', {
        x: TIMER_X, y: TIMER_Y + bob(t, 2.8, 3), t, scale: TIMER_SCALE.clock,
        hour: 10, minute: 4 + race * 72 * dur, fast: true, rim: 'blue', bells: true,
        rot: Math.sin(t * Math.PI * 2 / 1.1) * 0.028,
      });
      drawSprite(ctx, pendulum, TIMER_X, TIMER_Y + 225 * TIMER_SCALE.clock, {
        anchor: [0.5, 0], scale: TIMER_SCALE.clock, rot: Math.sin(t * Math.PI * 2 / 0.84) * 0.38,
      });
    } else if (s.timer === 'hourglass') {
      drawItem(ctx, 'hourglass', { x: TIMER_X, y: TIMER_Y + bob(t, 2.8, 3), t, scale: TIMER_SCALE.hourglass, p: race });
    } else {
      const turns = race * (1.4 + dur * 0.9), page = Math.floor(turns), fraction = turns - page;
      const flip = ease.inOutCubic(phase(fraction, 0, 0.75));
      drawItem(ctx, 'calendar', {
        x: TIMER_X, y: TIMER_Y + bob(t, 2.8, 3), t, scale: TIMER_SCALE.calendar,
        label: MONTHS[page % MONTHS.length], flip,
      });
    }

    if (s.label) label(ctx, s.label.toUpperCase(), TIMER_X, 102, { variant: 'sign', maxWidth: 340 });
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const safeDur = Math.max(0.05, dur), s = plan(props, safeDur), mid = (s.checkAt + s.sighAt) / 2;
    return cuesIn(safeDur, [
      cue(0.03, 'footfall', 0.75, ACTOR_X),
      cue(Math.max(0, s.checkAt - 0.08), s.item ? 'rustle' : 'step', 0.72, ACTOR_X),
      cue(s.checkAt, 'tick', 0.92, TIMER_X),
      cue(mid, 'tick', 0.62, TIMER_X),
      cue(s.sighAt, 'squeak', 0.86, ACTOR_X),
      cue(s.sighAt + 0.16, s.timer === 'hourglass' ? 'drop' : 'thump', 1.1, TIMER_X),
      cue(safeDur - 0.05, 'tick', 0.58, TIMER_X),
    ]);
  },
};
