// wait — an impatient actor taps, checks a racing clock, then gets a result or gives up.
import type { Cue, Frame, ShotProps } from '../core.ts';
import { arc, bob, clamp, ease, phase } from '../kit/motion.ts';
import { Grid, PAL } from '../kit/pixel.ts';
import { drawSprite } from '../kit/sprite.ts';
import { drawStage, label } from '../kit/stage.ts';
import { STAGE, ACTORS, actorBounds, actorFace, actorPaw, beats, cue, cuesIn, drawActor, drawItem, isItem, itemSize, pick, str, type ItemId } from './common.ts';
import type { ShotDef } from './index.ts';

const TIMERS = ['clock', 'hourglass', 'calendar'] as const;
type TimerId = (typeof TIMERS)[number];
const MOODS = ['neutral', 'worried', 'sad', 'relieved', 'happy'] as const;
type WaitMood = (typeof MOODS)[number];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const ACTOR_X = 142;
const TIMER_X = 492;
const TIMER_Y = 380;
const TIMER_SCALE: Record<TimerId, number> = { clock: 0.64, hourglass: 0.76, calendar: 0.66 };

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
  outcomeStart: number;
  timer: TimerId;
  who: string;
  mood: WaitMood;
  item?: ItemId;
  outcome?: { item?: ItemId; word?: string };
  fade?: { item?: ItemId; word?: string };
  label: string;
}

function plan(props: ShotProps, dur: number): WaitPlan {
  const [check, sigh] = beats(props, dur, [0.24, 0.72]);
  const checkAt = check ?? dur * 0.24;
  const sighAt = Math.min(dur, Math.max(sigh ?? dur * 0.72, checkAt + Math.min(0.32, dur * 0.22)));
  const rawItem = str(props.params, 'item', 'none').trim();
  const rawFade = str(props.params, 'fade', '').trim();
  const rawOutcome = str(props.params, 'outcome', '').trim();
  const fadeItem = isItem(rawFade) ? rawFade : undefined;
  const outcomeItem = isItem(rawOutcome) ? rawOutcome : undefined;
  const outcomeWord = !outcomeItem && rawOutcome
    ? rawOutcome.toUpperCase().replace(/[^A-Z0-9 $%+!?.,:'&/\-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 20)
    : undefined;
  return {
    checkAt, sighAt, outcomeStart: Math.max(0, sighAt - 0.34),
    timer: pick(props.params, 'timer', TIMERS, 'clock'),
    who: pick(props.params, 'who', ACTORS, 'hedgy'),
    mood: pick(props.params, 'mood', MOODS, 'worried'),
    item: isItem(rawItem) ? rawItem : undefined,
    outcome: outcomeItem ? { item: outcomeItem } : outcomeWord ? { word: outcomeWord } : undefined,
    fade: fadeItem ? { item: fadeItem } : rawFade ? { word: rawFade.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').trim().slice(0, 12) } : undefined,
    label: str(props.params, 'label', '').trim(),
  };
}

function raceProgress(t: number, dur: number, checkAt: number) {
  const early = 0.86 * phase(t, 0, dur);
  const accelerated = 0.14 * ease.inCubic(phase(t, checkAt, dur));
  return clamp(early + accelerated);
}

function actorKeys(s: WaitPlan, dur: number) {
  const keys = [
    { at: 0, pose: 'tap' as const, expression: s.mood === 'happy' || s.mood === 'relieved' ? 'neutral' as const : s.mood, look: 'up' as const },
    { at: Math.max(0, s.checkAt - 0.1), pose: 'lookup' as const, expression: s.mood === 'happy' || s.mood === 'relieved' ? 'neutral' as const : s.mood, look: 'up' as const },
    { at: Math.min(dur, s.checkAt + 0.22), pose: 'tap' as const, expression: s.mood === 'happy' || s.mood === 'relieved' ? 'neutral' as const : s.mood, look: s.item ? 'down' as const : 'up' as const },
    ...Array.from({ length: 8 }, (_, i) => ({ at: s.checkAt + 0.6 + i * 0.52, pose: i % 2 ? 'tap' as const : 'think' as const, expression: s.mood === 'happy' || s.mood === 'relieved' ? 'neutral' as const : s.mood, look: i % 2 ? 'up' as const : 'down' as const }))
      .filter(key => key.at < s.sighAt - 0.12),
    ...(s.outcome ? [
      { at: s.sighAt - 0.07, pose: 'receive' as const, expression: 'shocked' as const, look: 'forward' as const },
      { at: Math.min(dur, s.sighAt + 0.14), pose: s.mood === 'happy' || s.mood === 'relieved' ? 'celebrate' as const : 'hold' as const, expression: s.mood === 'worried' || s.mood === 'sad' ? s.mood : 'happy' as const, look: 'forward' as const },
    ] : [
      { at: s.sighAt, pose: 'wave-off' as const, expression: s.mood === 'worried' || s.mood === 'sad' ? s.mood : 'happy' as const, look: 'up' as const },
    ]),
  ];
  return keys.filter(key => key.at <= dur).sort((a, b) => a.at - b.at);
}

function heldItem(s: WaitPlan, actorX: number, t: number, lift: number, drop: number) {
  if (!s.item) return undefined;
  const raw = itemSize(s.item);
  const scale = Math.min(0.38, 180 / raw.w, 240 / raw.h);
  const dims = itemSize(s.item, scale);
  const actorBase = { who: s.who, x: actorX, y: STAGE.floor, facing: 1 as const, time: t };
  const face = actorFace(actorBase), paw = actorPaw(actorBase);
  const belowChin = Math.max(paw.y + 18, face.y + face.r + dims.h / 2 + 12);
  const maxY = STAGE.h - 24 - dims.h / 2;
  return {
    scale,
    x: clamp(paw.x + Math.min(38, dims.w * 0.22), dims.w / 2 + 28, STAGE.w - dims.w / 2 - 28),
    y: Math.min(maxY, belowChin) + lift + drop + bob(t, 1.7, 2),
    dims,
  };
}

export const waitShot: ShotDef = {
  name: 'wait',
  stage: 'clean',
  describe: 'An impatient actor taps a foot while a clock, hourglass, or calendar visibly races, checks the time at event 1, then sighs or catches an optional arriving outcome at event 2; a legacy fade prop still droops away during the sigh. params: timer (clock|hourglass|calendar, default clock), who (actor id, default hedgy), mood (neutral|worried|sad|relieved|happy, default worried), item (any item id held in one paw, default none), outcome (optional item id or short word that travels into the actor\'s paws at event 2), fade (legacy optional short word or item that droops and fades at event 2), label (optional short word beside the timer). Events: 1 = the actor pauses the tapping to check the racing timer or held item; 2 = time stops and the actor sighs, or catches and reacts to outcome when set.',
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame, dur = Math.max(0.05, frame.dur), t = clamp(frame.t, 0, dur), s = plan(props, dur);
    const clockT = Math.min(t, s.sighAt);
    const race = raceProgress(clockT, dur, s.checkAt);
    const checkLift = -8 * ease.outCubic(phase(t, s.checkAt - 0.12, s.checkAt + 0.16));
    const sighDrop = 12 * ease.inOutCubic(phase(t, s.sighAt - 0.16, s.sighAt + 0.22));
    const keys = actorKeys(s, dur);
    const actorBase = { who: s.who, x: ACTOR_X, y: STAGE.floor, facing: 1 as const, time: t, keys };
    const bounds = actorBounds(actorBase);
    const actorCorrection = bounds.left < 28 ? 28 - bounds.left : bounds.right > 692 ? 692 - bounds.right : 0;
    const actorX = ACTOR_X + actorCorrection;
    const actorOptions = { who: s.who, x: actorX, y: STAGE.floor, facing: 1 as const, time: t, keys };
    const held = heldItem(s, actorX, t, checkLift, sighDrop);
    const timerY = TIMER_Y + bob(t, 2.8, 2);
    const outcomeProgress = s.outcome ? ease.outBack(phase(t, s.outcomeStart, s.sighAt)) : 0;
    const outcomeFrom = { x: 670, y: 628 }, outcomeTo = { x: 340, y: 560 };
    const outcomePos = arc(outcomeFrom, outcomeTo, 38, outcomeProgress);
    const arrivalPoseAt = s.sighAt;

    const drawTimer = () => {
      if (s.timer === 'clock') {
        drawItem(ctx, 'clock', {
          x: TIMER_X, y: timerY, t, scale: TIMER_SCALE.clock,
          hour: 10, minute: 4 + race * 72 * dur, fast: true, rim: 'blue', bells: true,
          rot: Math.sin(t * Math.PI * 2 / 1.1) * 0.02,
        });
        drawSprite(ctx, pendulum, TIMER_X, timerY + 225 * TIMER_SCALE.clock, {
          anchor: [0.5, 0], scale: TIMER_SCALE.clock, rot: Math.sin(t * Math.PI * 2 / 0.84) * 0.36,
        });
      } else if (s.timer === 'hourglass') {
        drawItem(ctx, 'hourglass', { x: TIMER_X, y: timerY, t, scale: TIMER_SCALE.hourglass, p: race });
      } else {
        const turns = race * (1.4 + dur * 0.9), page = Math.floor(turns), fraction = turns - page;
        const flip = ease.inOutCubic(phase(fraction, 0, 0.75));
        drawItem(ctx, 'calendar', { x: TIMER_X, y: timerY, t, scale: TIMER_SCALE.calendar, label: MONTHS[page % MONTHS.length], flip });
      }
      if (s.label) label(ctx, s.label.toUpperCase(), TIMER_X, 102, { variant: 'sign', maxWidth: 320 });
    };

    drawStage(ctx, { floorY: STAGE.floor, line: true, shadow: [{ x: actorX, y: STAGE.floor - 2, w: 170 }, { x: TIMER_X, y: STAGE.floor - 4, w: 200 }] });
    drawTimer();
    drawActor(ctx, {
      ...actorOptions, look: t < s.checkAt ? 'up' : held && t < s.sighAt ? 'down' : 'up',
      handTarget: held ? { x: held.x - held.dims.w * 0.34, y: held.y - held.dims.h * 0.18 } : undefined,
      reach: s.item ? 1 : 0,
    });
    if (s.item && held) drawItem(ctx, s.item, { x: held.x, y: held.y, t, scale: held.scale, rot: -0.025 + Math.sin(t * 2.1) * 0.018 });

    if (s.outcome && outcomeProgress > 0) {
      if (s.outcome.item) {
        const raw = itemSize(s.outcome.item), scale = Math.min(0.34, 150 / raw.w, 190 / raw.h);
        drawItem(ctx, s.outcome.item, { x: outcomePos.x, y: outcomePos.y, t, scale, rot: Math.sin(outcomeProgress * Math.PI) * 0.08 });
      } else if (s.outcome.word) {
        label(ctx, s.outcome.word, outcomePos.x, outcomePos.y, { variant: 'bubble', maxWidth: 340, pop: Math.min(1, outcomeProgress) });
      }
      if (t >= arrivalPoseAt && t < arrivalPoseAt + 0.3) {
        ctx.save();
        ctx.strokeStyle = PAL.paper;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(outcomeTo.x - 38, outcomeTo.y - 8); ctx.lineTo(outcomeTo.x - 58, outcomeTo.y - 26);
        ctx.moveTo(outcomeTo.x + 34, outcomeTo.y - 4); ctx.lineTo(outcomeTo.x + 52, outcomeTo.y - 22);
        ctx.stroke();
        ctx.restore();
      }
    }

    if (s.fade) {
      const fadeVisibleAt = Math.max(0, s.sighAt - 0.48);
      const fadeStart = Math.max(0, s.sighAt - 0.02);
      const fadeOut = ease.outCubic(phase(t, fadeStart, Math.min(dur, s.sighAt + 0.46)));
      const fadeAlpha = t < fadeStart ? 1 : 1 - fadeOut;
      if (t >= fadeVisibleAt && fadeAlpha > 0.01) {
        ctx.save();
        ctx.globalAlpha *= fadeAlpha;
        if (s.fade.item) {
          const raw = itemSize(s.fade.item), scale = Math.min(0.32, 144 / raw.w, 184 / raw.h);
          const dims = itemSize(s.fade.item, scale);
          drawItem(ctx, s.fade.item, { x: clamp(actorX + 20, dims.w / 2 + 24, STAGE.w - dims.w / 2 - 24), y: 306 + 18 * fadeOut, t, scale, rot: 0.04 * fadeOut });
        } else if (s.fade.word) {
          label(ctx, s.fade.word, 180, 110 + 18 * fadeOut, { variant: 'bubble', maxWidth: 300, pop: 1 });
        }
        ctx.restore();
      }
    }
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const safeDur = Math.max(0.05, dur), s = plan(props, safeDur), mid = (s.checkAt + s.sighAt) / 2;
    return cuesIn(safeDur, [
      cue(0.03, 'footfall', 0.75, ACTOR_X),
      ...Array.from({ length: 4 }, (_, i) => cue(0.18 + i * 0.46, 'step', i % 2 ? 0.48 : 0.62, ACTOR_X)).filter(item => item.t < s.sighAt),
      cue(Math.max(0, s.checkAt - 0.08), s.item ? 'rustle' : 'step', 0.72, ACTOR_X),
      cue(s.checkAt, 'tick', 0.92, TIMER_X),
      cue(mid, 'tick', 0.62, TIMER_X),
      cue(s.sighAt, s.outcome ? 'land' : 'squeak', s.outcome ? 1.12 : 0.86, s.outcome ? 340 : ACTOR_X),
      ...(s.outcome ? [cue(s.sighAt + 0.12, 'thump', 0.86, 340)] : []),
      ...(s.fade ? [cue(s.sighAt + 0.16, 'drop', 0.72, ACTOR_X)] : []),
      cue(safeDur - 0.05, 'tick', 0.42, TIMER_X),
    ]);
  },
};
