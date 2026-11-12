// price — one clean rise or fall carries the chosen item while its owner reacts.
import type { Cue, Frame, ShotProps } from '../core.ts';
import type { HedgyKey } from '../actor/hedgy.ts';
import { bob, clamp, ease, phase, squash } from '../kit/motion.ts';
import { PAL } from '../kit/pixel.ts';
import { arrow, bar, drawStage, label } from '../kit/stage.ts';
import { STAGE, actorBounds, cue, cuesIn, drawActor, drawItem, flag, itemParam, itemSize, num, pick, str, type ItemId } from './common.ts';
import type { ShotDef } from './index.ts';

type Direction = 'up' | 'down';
type Tone = 'loss' | 'gain';
type Mood = 'smug' | 'worried' | 'shocked' | 'celebrate';

interface PricePlan {
  item: ItemId;
  dir: Direction;
  tone: Tone;
  chart: 'candles';
  color: string;
  steps: number;
  who: string;
  mood: Mood;
  showBar: boolean;
  times: number[];
  hasEvents: boolean;
  moveStart: number;
  moveEnd: number;
}

const PATH_START = { x: 340, y: 586 };
const PATH_END = { x: 575, y: 246 };
const ACTOR_X = 118;

function stepTimes(props: ShotProps, dur: number, count: number): number[] {
  const events = [...(props.events ?? [])]
    .filter(event => Number.isFinite(event.at))
    .sort((a, b) => a.at - b.at)
    .slice(0, count)
    .map(event => clamp(event.at, 0, dur));
  if (events.length === 0) {
    const first = Math.min(0.32, dur * 0.18);
    const last = Math.max(first, dur - Math.min(0.35, dur * 0.16));
    if (count === 1) return [first];
    return Array.from({ length: count }, (_, i) => first + (last - first) * i / (count - 1));
  }
  const missing = count - events.length;
  if (missing <= 0) return events;
  const start = events[events.length - 1] ?? 0;
  return [...events, ...Array.from({ length: missing }, (_, i) => start + (dur - start) * (i + 1) / (missing + 1))];
}

function plan(props: ShotProps, dur: number): PricePlan {
  const p = props.params;
  const item = itemParam(p, 'item', 'ticket');
  const dir = pick(p, 'dir', ['up', 'down'] as const, 'up');
  const tone = pick(p, 'tone', ['loss', 'gain'] as const, dir === 'up' ? 'loss' : 'gain');
  const eventCount = (props.events ?? []).filter(event => Number.isFinite(event.at)).length;
  const automaticSteps = eventCount ? clamp(eventCount, 1, 7) : clamp(Math.ceil(dur / 0.7), 3, 7);
  const steps = Math.round(num(p, 'steps', automaticSteps, 1, 7));
  const times = stepTimes(props, dur, steps);
  const first = times[0] ?? Math.min(0.32, dur * 0.18);
  const last = times[times.length - 1] ?? first;
  const moveStart = Math.max(0, first - 0.18);
  const moveEnd = eventCount > 1
    ? Math.max(moveStart + 0.36, last + 0.06)
    : Math.min(dur, Math.max(moveStart + 0.62, first + Math.min(0.82, dur * 0.5)));
  return {
    item,
    dir,
    tone,
    chart: pick(p, 'chart', ['candles'] as const, 'candles'),
    color: dir === 'up' ? PAL.UP : PAL.DOWN,
    steps,
    who: str(p, 'who', 'hedgy'),
    mood: pick(p, 'mood', ['smug', 'worried', 'shocked', 'celebrate'] as const, tone === 'loss' ? 'worried' : 'smug'),
    showBar: flag(p, 'bar', true),
    times,
    hasEvents: eventCount > 0,
    moveStart,
    moveEnd,
  };
}

function moveProgress(t: number, s: PricePlan): number {
  return ease.inOutCubic(phase(t, s.moveStart, Math.max(s.moveStart + 0.08, s.moveEnd)));
}

function squashAt(t: number, times: readonly number[]) {
  let sx = 1, sy = 1;
  for (const at of times) {
    const hit = squash(t, at, 0.14, 0.14);
    sx *= hit.sx;
    sy *= hit.sy;
  }
  return { sx, sy };
}

function actorKeys(s: PricePlan, dur: number): HedgyKey[] {
  const reaction: HedgyKey['pose'] = s.tone === 'loss' ? 'sweat' : 'celebrate';
  const expression: HedgyKey['expression'] = s.tone === 'loss' ? 'worried' : 'happy';
  const keys: HedgyKey[] = [
    { at: 0, pose: 'think', expression: s.tone === 'loss' ? 'worried' : 'smug', look: 'up' },
    { at: s.moveStart, pose: 'lookup', expression, look: 'up' },
  ];
  s.times.forEach((at, index) => {
    keys.push({ at: Math.max(s.moveStart, at - 0.12), pose: 'point', expression, look: 'up' });
    keys.push({ at, pose: index === s.times.length - 1 && s.tone === 'loss' ? 'shock' : reaction, expression: index === s.times.length - 1 && s.tone === 'loss' ? 'shocked' : expression, look: 'up' });
  });
  for (let at = s.moveEnd + 0.15, index = 0; at < dur - 0.05; at += 0.44, index++) {
    keys.push({ at, pose: index % 2 === 0 ? 'point' : reaction, expression, look: 'up' });
  }
  const finalPose: HedgyKey['pose'] = s.mood === 'shocked' ? 'shock' : s.mood === 'worried' ? 'sweat' : s.mood;
  keys.push({ at: Math.min(dur, Math.max(s.moveEnd + 0.3, dur - 0.08)), pose: finalPose, expression: s.mood === 'shocked' ? 'shocked' : s.mood === 'worried' ? 'worried' : s.mood === 'celebrate' ? 'happy' : 'smug', look: 'up' });
  return keys.sort((a, b) => a.at - b.at);
}

export const priceShot: ShotDef = {
  name: 'price',
  stage: 'clean',
  describe: 'One red upward or green downward price arrow grows across the stage while the chosen half-size item rides its path and one full-size actor follows it with their eyes and reacts; an optional compact LOSS/GAIN bar tracks the move. params: item (any item id, default ticket), dir (up|down, default up), chart (candles, default candles), tone (loss|gain, defaults to loss for up and gain for down; selects the bar and reaction), steps (1–7, default event count or duration-based 3–7; sync checkpoints on the single move), who (actor id, default hedgy), mood (smug|worried|shocked|celebrate, final reaction; defaults from tone), bar (boolean, default true). Events: every event advances the same continuous price move, bumps the riding item and prompts an actor reaction; the move has one clear start and end.',
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame;
    const dur = Math.max(0.05, frame.dur);
    const t = clamp(frame.t, 0, dur);
    const s = plan(props, dur);
    const progress = moveProgress(t, s);
    const size = itemSize(s.item);
    const scale = Math.min(0.42, 220 / Math.max(size.w, size.h));
    const dims = itemSize(s.item, scale);
    const rawY0 = s.dir === 'up' ? PATH_START.y : PATH_END.y;
    const rawY1 = s.dir === 'up' ? PATH_END.y : PATH_START.y;
    const pathPoint = { x: PATH_START.x + (PATH_END.x - PATH_START.x) * progress, y: rawY0 + (rawY1 - rawY0) * progress };
    const enter = ease.outCubic(phase(t, Math.max(0, s.moveStart - 0.24), s.moveStart + 0.02));
    const impact = squashAt(t, s.times);
    const keys = actorKeys(s, dur);
    const actorBase = actorBounds({ who: s.who, x: ACTOR_X, y: STAGE.floor, scale: 1, facing: 1, time: t, keys });
    const actorCorrection = actorBase.left < 28 ? 28 - actorBase.left : actorBase.right > 692 ? 692 - actorBase.right : 0;

    drawStage(ctx, { floorY: STAGE.floor, line: true, shadow: [{ x: ACTOR_X, y: STAGE.floor - 3, w: 210 }] });
    const arrowStart = s.dir === 'up' ? PATH_START : { x: PATH_START.x, y: PATH_END.y };
    const arrowEnd = s.dir === 'up' ? PATH_END : { x: PATH_END.x, y: PATH_START.y };
    arrow(ctx, arrowStart, arrowEnd, { color: s.color, width: 18, progress });
    if (enter > 0) {
      const restingY = pathPoint.y - dims.h * 0.28 + bob(t, 1.2, 3);
      drawItem(ctx, s.item, {
        x: pathPoint.x,
        y: restingY,
        t,
        scale: scale * (0.82 + 0.18 * enter),
        alpha: enter,
        rot: s.dir === 'up' ? -0.045 : 0.045,
        sx: impact.sx,
        sy: impact.sy,
      });
    }
    drawActor(ctx, {
      who: s.who, x: ACTOR_X + actorCorrection, y: STAGE.floor, scale: 1, facing: 1,
      time: t, look: 'up', keys,
    });
    if (s.showBar) {
      label(ctx, s.tone === 'loss' ? 'LOSS' : 'GAIN', 575, 690, { variant: 'sign', maxWidth: 260 });
      bar(ctx, 526, 726, 98, 20, { progress, color: s.color, background: PAL.grey5 });
    }
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const d = Math.max(0.05, dur), s = plan(props, d);
    const list = s.times.map((at, index) => cue(at, index === 0 ? 'rise' : 'thump', index === 0 ? 0.85 : 1.2, PATH_START.x + (PATH_END.x - PATH_START.x) * (index + 1) / s.times.length));
    if (s.showBar) list.push(cue(Math.min(d, s.moveEnd), s.tone === 'loss' ? 'sub' : 'ding', 0.8, 575));
    return cuesIn(d, list);
  },
};
