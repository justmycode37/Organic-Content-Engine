// price — a chosen item follows a bold stepped market path while its owner reacts.
import type { Cue, Frame, ShotProps } from '../core.ts';
import type { HedgyKey } from '../actor/hedgy.ts';
import { bob, clamp, ease, phase, squash } from '../kit/motion.ts';
import { Grid, PAL } from '../kit/pixel.ts';
import { drawSprite } from '../kit/sprite.ts';
import { bar, drawStage, label, priceLine } from '../kit/stage.ts';
import { STAGE, actorBounds, cue, cuesIn, drawActor, drawItem, flag, itemParam, itemSize, num, pick, str, type ItemId } from './common.ts';
import type { ShotDef } from './index.ts';

type Direction = 'up' | 'down';
type Tone = 'loss' | 'gain';
type Mood = 'smug' | 'worried' | 'shocked' | 'celebrate';

interface PricePlan {
  item: ItemId;
  dir: Direction;
  tone: Tone;
  lineColor: string;
  barColor: string;
  steps: number;
  who: string;
  mood: Mood;
  showBar: boolean;
  times: number[];
  hasEvents: boolean;
}
interface ChartPath {
  points: { x: number; y: number }[];
  seed: number;
  step: number;
  total: number;
}

const AXIS_X = 185;
const AXIS_TOP = 180;
const CHART_START_HEAD = 310;
const SEED_LENGTH = 50;
const PRICE_TAG_SIZE = { w: 72, h: 60 };

const AXES = (() => {
  const grid = new Grid(90, 94);
  grid.rect(4, 0, 6, 90, PAL.grey3);
  grid.rect(4, 87, 86, 6, PAL.grey3);
  grid.outline(PAL.ink);
  return grid.sprite('price-shot:grey3-l-axes');
})();

const DOLLAR_PLATE = (() => {
  const grid = new Grid(16, 16);
  grid.round(0, 0, 16, 16, 2, PAL.ink);
  grid.round(1, 1, 14, 14, 1, PAL.paper);
  const dollar = [
    '..######..',
    '.##....##.',
    '##......##',
    '##........',
    '.########.',
    '....####..',
    '........##',
    '##......##',
    '.##....##.',
    '..######..',
  ];
  for (let y = 0; y < dollar.length; y++) {
    for (let x = 0; x < dollar[y]!.length; x++) if (dollar[y]![x] === '#') grid.rect(x + 3, y + 3, 1, 1, PAL.ink);
  }
  grid.rect(7, 1, 2, 14, PAL.ink);
  grid.outline(PAL.ink);
  return grid.sprite('price-shot:paper-dollar-plate');
})();

const SMALL_PRICE_TAG = (() => {
  const grid = new Grid(12, 10);
  grid.line({ x: 1, y: 0 }, { x: 3, y: 2 }, 1, PAL.wood4);
  grid.poly([{ x: 1, y: 2 }, { x: 9, y: 2 }, { x: 11, y: 5 }, { x: 9, y: 8 }, { x: 1, y: 8 }], PAL.paper).outline(PAL.ink);
  grid.ellipse(3, 4, 0.8, 0.8, PAL.ink);
  const dollar = ['.###.', '##...', '##...', '.###.', '...##', '...##', '.###.'];
  for (let y = 0; y < dollar.length; y++) {
    for (let x = 0; x < dollar[y]!.length; x++) if (dollar[y]![x] === '#') grid.rect(x + 5, y + 2, 1, 1, PAL.ink);
  }
  grid.rect(7, 1, 1, 9, PAL.ink);
  grid.outline(PAL.ink);
  return grid.sprite('price-shot:small-paper-dollar-tag');
})();

function plan(props: ShotProps, dur: number): PricePlan {
  const p = props.params;
  const item = itemParam(p, 'item', 'ticket');
  const dir = pick(p, 'dir', ['up', 'down'] as const, 'up');
  const tone = pick(p, 'tone', ['loss', 'gain'] as const, dir === 'up' ? 'loss' : 'gain');
  const eventCount = (props.events ?? []).filter(event => Number.isFinite(event.at)).length;
  const automaticSteps = eventCount ? clamp(eventCount, 1, 7) : clamp(Math.ceil(dur / 0.7), 3, 7);
  const steps = Math.round(num(p, 'steps', automaticSteps, 1, 7));
  const times = stepTimes(props, dur, steps);
  return {
    item,
    dir,
    tone,
    lineColor: dir === 'up' ? PAL.UP : PAL.DOWN,
    barColor: tone === 'loss' ? PAL.UP : PAL.DOWN,
    steps,
    who: str(p, 'who', 'hedgy'),
    mood: pick(p, 'mood', ['smug', 'worried', 'shocked', 'celebrate'] as const, tone === 'loss' ? 'worried' : 'smug'),
    showBar: flag(p, 'bar', true),
    times,
    hasEvents: eventCount > 0,
  };
}

function stepTimes(props: ShotProps, dur: number, count: number): number[] {
  const events = [...(props.events ?? [])]
    .filter(event => Number.isFinite(event.at))
    .sort((a, b) => a.at - b.at)
    .slice(0, count)
    .map(event => clamp(event.at, 0, dur));
  if (events.length === 0) {
    const first = Math.min(0.36, dur * 0.2);
    const last = Math.max(first, dur - Math.min(0.4, dur * 0.18));
    if (count === 1) return [first];
    return Array.from({ length: count }, (_, i) => first + (last - first) * i / (count - 1));
  }
  const missing = count - events.length;
  if (missing <= 0) return events;
  const start = events[events.length - 1] ?? 0;
  return [
    ...events,
    ...Array.from({ length: missing }, (_, i) => start + (dur - start) * (i + 1) / (missing + 1)),
  ];
}

function stepDuration(times: readonly number[], index: number, dur: number): number {
  const gap = Math.max(0, (times[index + 1] ?? dur) - (times[index] ?? 0));
  return Math.min(0.42, Math.max(0.1, gap * 0.78));
}

/** The last rise keeps easing toward its next level all the way to the cut. */
function lineStepDuration(times: readonly number[], index: number, dur: number): number {
  if (index !== times.length - 1) return stepDuration(times, index, dur);
  const start = Math.max(0, times[index]! - 0.24);
  return Math.max(stepDuration(times, index, dur), dur - start);
}

/** Each event advances one stair; the opening starts on its cue and later moves land on theirs. */
function stepProgress(t: number, times: readonly number[], dur: number, hasEvents: boolean): number {
  let amount = 0;
  if (hasEvents) {
    for (let i = 0; i < times.length; i++) {
      const at = times[i]!;
      const previousAt = i === 0 ? 0 : times[i - 1]!;
      const gap = Math.max(0, (times[i + 1] ?? dur) - at);
      // The opening price stays flat until its narration event. Later moves
      // anticipate briefly and land on their event, so the called-out state is
      // already visible on that frame.
      const start = i === 0 ? at : Math.max(previousAt, at - Math.min(0.46, at - previousAt));
      const finish = i === 0 ? at + Math.min(stepDuration(times, i, dur), Math.max(0.08, gap - 0.46)) : at;
      const progress = t >= at && i > 0
        ? 1
        : ease.inOutCubic(phase(t, start, Math.max(start + 0.08, finish)));
      amount = i + progress;
      if (progress < 1) break;
    }
    return amount / Math.max(1, times.length);
  }

  for (let i = 0; i < times.length; i++) {
    const at = times[i]!;
    const start = i === 0 ? at : Math.max(0, at - 0.24);
    const duration = i === 0 ? stepDuration(times, i, dur) : lineStepDuration(times, i, dur);
    const progress = phase(t, start, start + duration);
    amount = i + ease.inOutCubic(progress);
    if (progress < 1) break;
  }
  return amount / Math.max(1, times.length);
}

function barProgress(t: number, times: readonly number[], dur: number, hasEvents: boolean): number {
  if (!hasEvents || !times.length) return stepProgress(t, times, dur, false);
  const at = times[times.length - 1]!;
  return phase(t, at, at + stepDuration(times, times.length - 1, dur));
}

function chartPath(s: PricePlan): ChartPath {
  const size = itemSize(s.item, 0.5);
  const itemRight = size.w * 0.5 + size.w * 0.1;
  const tagRight = size.w * 0.34 + PRICE_TAG_SIZE.w * 0.5;
  const startHeadX = Math.max(CHART_START_HEAD, AXIS_X + 32 + size.w * 0.4);
  const finalHeadX = STAGE.w - 24 - Math.max(itemRight, tagRight);
  const endHeadX = Math.max(startHeadX + 24, finalHeadX);
  const run = (endHeadX - startHeadX) / s.steps;
  const high = Math.max(280, size.h * 0.82 + 105);
  const low = 690;
  const fromY = s.dir === 'up' ? low : high;
  const toY = s.dir === 'up' ? high : low;
  const rise = (toY - fromY) / s.steps;
  const points = [
    { x: startHeadX - SEED_LENGTH, y: fromY },
    { x: startHeadX, y: fromY },
  ];
  for (let i = 1; i <= s.steps; i++) {
    const x = startHeadX + run * i;
    const y = fromY + rise * i;
    points.push({ x, y: points[points.length - 1]!.y }, { x, y });
  }
  const stepLength = run + Math.abs(rise);
  return { points, seed: SEED_LENGTH, step: stepLength, total: SEED_LENGTH + s.steps * stepLength };
}

function actorKeys(s: PricePlan, dur: number): HedgyKey[] {
  const keys: HedgyKey[] = [{ at: 0, pose: 'think', expression: s.tone === 'loss' ? 'worried' : 'smug', look: 'up' }];
  const openingAt = Math.min(0.12, s.times[0]! * 0.22);
  keys.push({ at: openingAt, pose: s.tone === 'loss' ? 'lookup' : 'celebrate', expression: s.tone === 'loss' ? 'worried' : 'happy', look: 'up' });
  for (let i = 0; i < s.times.length; i++) {
    const at = s.times[i]!;
    const anticipation = Math.max(0, at - Math.min(0.24, (s.times[i + 1] ?? dur) - at > 0 ? 0.24 : 0.1));
    if (s.tone === 'loss') {
      keys.push({ at: anticipation, pose: 'lookup', expression: 'worried', look: 'up' });
      keys.push({ at, pose: 'sweat', expression: 'worried', look: 'up' });
      if (i < s.times.length - 1) {
        const recoveryAt = Math.min(at + 0.22, s.times[i + 1]! - 0.16);
        if (recoveryAt > at + 0.08) keys.push({ at: recoveryAt, pose: 'wave-off', expression: 'worried', look: 'up' });
      }
      if (i === s.times.length - 1) keys.push({ at: at + 0.14, pose: 'shock', expression: 'shocked', look: 'up' });
    } else {
      keys.push({ at: anticipation, pose: 'smug', expression: 'smug', look: 'up' });
      keys.push({ at, pose: 'celebrate', expression: 'happy', look: 'up' });
      keys.push({ at: at + 0.28, pose: 'smug', expression: 'smug', look: 'up' });
    }
  }
  if (s.times.length) {
    const lastIndex = s.times.length - 1;
    const last = s.times[lastIndex]!;
    const settledAt = last + stepDuration(s.times, lastIndex, dur);
    const finalPose: HedgyKey['pose'] = s.mood === 'shocked' ? 'shock' : s.mood === 'worried' ? 'sweat' : s.mood;
    const finalAt = Math.min(dur, Math.max(last + 0.42, dur - 0.08));
    const followStart = Math.max(last + 0.38, settledAt + 0.1);
    for (let at = followStart, index = 0; at < finalAt - 0.12; at += 0.42, index++) {
      const followPose: HedgyKey['pose'] = s.tone === 'loss'
        ? (index % 2 === 0 ? 'wave-off' : 'shock')
        : (index % 2 === 0 ? 'celebrate' : 'point');
      keys.push({ at, pose: followPose, expression: s.tone === 'loss' ? 'worried' : 'happy', look: 'up' });
    }
    keys.push({ at: finalAt, pose: finalPose, expression: s.mood === 'celebrate' ? 'happy' : s.mood === 'smug' ? 'smug' : s.mood === 'shocked' ? 'shocked' : 'worried', look: 'up' });
  }
  return keys.sort((a, b) => a.at - b.at);
}

export const priceShot: ShotDef = {
  name: 'price',
  stage: 'clean',
  describe: 'A half-size item with an attached dollar tag rides a long stepped price chart with a grey L-axis and dollar plate while a full-size actor reacts and an optional colored bar pulses. params: item (any item id, default ticket), dir (up|down, default up; controls the red/green line), tone (loss|gain, defaults to loss for up and gain for down; controls the bar), steps (1–7, default event count or duration-based 3–7), who (actor id, default hedgy), mood (smug|worried|shocked|celebrate, final pose after the step reactions; default worried for loss and smug for gain), bar (boolean, default true). Events: each event anticipates and advances one step with an actor reaction; missing requested steps use evenly spaced times.',
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame;
    const dur = Math.max(0.05, frame.dur);
    const t = clamp(frame.t, 0, dur);
    const s = plan(props, dur);
    const size = itemSize(s.item, 0.5);
    const path = chartPath(s);
    const stepped = stepProgress(t, s.times, dur, s.hasEvents);
    const barFill = barProgress(t, s.times, dur, s.hasEvents);
    const desiredDistance = path.seed + stepped * s.steps * path.step;
    const pathProgress = clamp(desiredDistance / path.total);
    // priceLine eases internally; invert that easing so narration timing is stable.
    const lineProgress = pathProgress <= 0 ? 0 : 1 - Math.cbrt(1 - pathProgress);
    const lastStep = s.times.reduce((last, at, index) => t >= at ? index : last, -1);
    const landedAt = lastStep >= 0 ? s.times[lastStep]! + stepDuration(s.times, lastStep, dur) : -1;
    const impact = landedAt >= 0 ? squash(t, landedAt, 0.16, 0.2) : { sx: 1, sy: 1 };

    const keys = actorKeys(s, dur);
    const actorBase = actorBounds({ who: s.who, x: 0, y: STAGE.floor, scale: 1, facing: 1, time: t, keys });
    const actorX = clamp(108, 24 - actorBase.left, 696 - actorBase.right);
    drawStage(ctx, { floorY: STAGE.floor, line: true, shadow: [{ x: actorX, y: STAGE.floor - 3, w: 210 }] });
    drawSprite(ctx, AXES, AXIS_X - 30, AXIS_TOP, { anchor: [0, 0] });
    drawSprite(ctx, DOLLAR_PLATE, AXIS_X, AXIS_TOP - 48, { anchor: [0.5, 0.5] });

    const head = priceLine(ctx, path.points, { color: s.lineColor, width: 42, progress: lineProgress, head: 'arrow' })
      ?? { x: path.points[0]!.x, y: path.points[0]!.y };
    const itemX = head.x + size.w * 0.1;
    const itemY = head.y - size.h * 0.5 - 14 + bob(t, 1.3, 6);
    drawItem(ctx, s.item, { x: itemX, y: itemY, t, scale: 0.5, sx: impact.sx, sy: impact.sy });
    drawSprite(ctx, SMALL_PRICE_TAG, itemX + size.w * 0.31, itemY - size.h * 0.24, {
      anchor: [0.5, 0.5], rot: Math.sin(t * Math.PI * 1.4) * 0.025,
    });

    drawActor(ctx, {
      who: s.who,
      x: actorX,
      y: STAGE.floor,
      scale: 1,
      facing: 1,
      time: t,
      look: 'up',
      keys,
    });

    if (s.showBar) {
      const word = s.tone === 'loss' ? 'LOSS' : 'GAIN';
      label(ctx, word, 578, 770, { variant: 'sign', maxWidth: 300 });
      const pulse = 1 + 0.045 * Math.sin(Math.max(0, t - (s.times[s.times.length - 1] ?? 0)) * Math.PI * 3.2);
      ctx.save();
      ctx.translate(578, 815);
      ctx.scale(1, pulse);
      bar(ctx, -118, -19, 236, 38, { progress: barFill, color: s.barColor, background: PAL.grey5 });
      ctx.restore();
    }
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const safeDur = Math.max(0.05, dur), s = plan(props, safeDur);
    const actorBase = actorBounds({ who: s.who, x: 0, y: STAGE.floor, scale: 1, facing: 1, keys: actorKeys(s, safeDur) });
    const actorX = clamp(108, 24 - actorBase.left, 696 - actorBase.right);
    const list: Cue[] = [];
    if (s.steps <= 4) list.push(cue(0.03, 'footfall', 0.7, actorX), cue(Math.max(0, s.times[0]! - 0.24), 'rise', 0.6, CHART_START_HEAD));
    for (let i = 0; i < s.steps; i++) list.push(cue(s.times[i]!, 'thump', 1.4, CHART_START_HEAD + 90 + 28 * i));
    if (s.showBar && list.length < 7) list.push(cue(Math.min(safeDur, s.times[0]! + 0.18), 'clunk', 0.75, 578));
    const finalIndex = s.steps - 1;
    if (s.steps <= 3 && list.length < 7) list.push(cue(Math.min(safeDur, s.times[finalIndex]! + stepDuration(s.times, finalIndex, safeDur) + 0.44), 'rustle', 0.65, actorX));
    if (list.length < 8) list.push(cue(Math.min(safeDur, s.times[s.steps - 1]! + 0.2), s.tone === 'loss' ? 'sub' : 'ding', s.tone === 'loss' ? 0.8 : 0.7, 560));
    return cuesIn(safeDur, list);
  },
};
