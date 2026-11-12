// price — a chosen item follows a bold stepped market path while its owner reacts.
import type { Cue, Frame, ShotProps } from '../core.ts';
import type { HedgyKey } from '../actor/hedgy.ts';
import { bob, clamp, ease, phase, squash } from '../kit/motion.ts';
import { PAL } from '../kit/pixel.ts';
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

/** Each narration beat anticipates then advances exactly one stair. */
function stepProgress(t: number, times: readonly number[], dur: number): number {
  let amount = 0;
  for (let i = 0; i < times.length; i++) {
    const start = Math.max(0, times[i]! - 0.24);
    const progress = phase(t, start, start + stepDuration(times, i, dur));
    amount = i + ease.inOutCubic(progress);
    if (progress < 1) break;
  }
  return amount / Math.max(1, times.length);
}

function chartPoints(dir: Direction, count: number) {
  const left = 255;
  const right = 655;
  const low = 690;
  const high = 220;
  const fromY = dir === 'up' ? low : high;
  const toY = dir === 'up' ? high : low;
  const points = [{ x: left, y: fromY }];
  for (let i = 1; i <= count; i++) {
    const x = left + (right - left) * i / count;
    const y = fromY + (toY - fromY) * i / count;
    points.push({ x, y: points[points.length - 1]!.y }, { x, y });
  }
  return points;
}

function actorKeys(s: PricePlan, dur: number): HedgyKey[] {
  const keys: HedgyKey[] = [{ at: 0, pose: 'think', expression: s.tone === 'loss' ? 'worried' : 'smug', look: 'up' }];
  for (let i = 0; i < s.times.length; i++) {
    const at = s.times[i]!;
    const anticipation = Math.max(0, at - Math.min(0.24, (s.times[i + 1] ?? dur) - at > 0 ? 0.24 : 0.1));
    if (s.tone === 'loss') {
      keys.push({ at: anticipation, pose: 'lookup', expression: 'worried', look: 'up' });
      keys.push({ at, pose: i === 0 ? 'lookup' : 'sweat', expression: i === 0 ? 'worried' : 'worried', look: 'up' });
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
    const finalAt = Math.max(last + 0.42, dur - 0.16);
    for (let at = settledAt + 0.12, index = 0; at < Math.min(dur, finalAt) - 0.15; at += 0.55, index++) {
      const followPose: HedgyKey['pose'] = s.tone === 'loss'
        ? (index % 2 === 0 ? 'wave-off' : 'shock')
        : (index % 2 === 0 ? 'celebrate' : 'point');
      keys.push({ at, pose: followPose, expression: s.tone === 'loss' ? 'worried' : 'happy', look: 'up' });
    }
    keys.push({ at: Math.min(dur, finalAt), pose: finalPose, expression: s.mood === 'celebrate' ? 'happy' : s.mood === 'smug' ? 'smug' : s.mood === 'shocked' ? 'shocked' : 'worried', look: 'up' });
  }
  return keys.sort((a, b) => a.at - b.at);
}

export const priceShot: ShotDef = {
  name: 'price',
  stage: 'clean',
  describe: 'A half-size item rides a long, thick stepped price line while a full-size actor reacts and a colored bar grows beside him. params: item (any item id, default ticket), dir (up|down, default up; controls the red/green line), tone (loss|gain, defaults to loss for up and gain for down; controls the bar), steps (1–7, default event count or duration-based 3–7), who (actor id, default hedgy), mood (smug|worried|shocked|celebrate, final pose after the step reactions; default worried for loss and smug for gain), bar (boolean, default true). Events: each event anticipates and advances one step with an actor reaction; missing requested steps use evenly spaced times.',
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame;
    const dur = Math.max(0.05, frame.dur);
    const t = clamp(frame.t, 0, dur);
    const s = plan(props, dur);
    const size = itemSize(s.item, 0.5);
    const points = chartPoints(s.dir, s.steps);
    const stepped = stepProgress(t, s.times, dur);
    // priceLine uses out-cubic internally; this inverse preserves the eased beat timeline.
    const lineProgress = stepped <= 0 ? 0.02 : 1 - Math.cbrt(1 - stepped);
    const lastStep = s.times.reduce((last, at, index) => t >= at ? index : last, -1);
    const landedAt = lastStep >= 0 ? s.times[lastStep]! + stepDuration(s.times, lastStep, dur) : -1;
    const impact = landedAt >= 0 ? squash(t, landedAt, 0.16, 0.2) : { sx: 1, sy: 1 };

    const keys = actorKeys(s, dur);
    const actorBase = actorBounds({ who: s.who, x: 0, y: STAGE.floor, scale: 1, facing: 1, time: t, keys });
    const actorX = clamp(108, 24 - actorBase.left, 696 - actorBase.right);
    drawStage(ctx, { floorY: STAGE.floor, line: true, shadow: [{ x: actorX, y: STAGE.floor - 3, w: 210 }] });
    // Keep the half-size item attached to the actual line head. On a rising
    // line it rides below the path near the actor; on a falling line it rides
    // above it, leaving a clean gap around the face.
    const head = priceLine(ctx, points, { color: s.lineColor, width: 42, progress: lineProgress, head: 'arrow' }) ?? points[0]!;
    const itemX = clamp(Math.max(head.x, actorX + actorBase.right + size.w / 2 + 16), 24 + size.w / 2, STAGE.w - 24 - size.w / 2);
    const rawItemY = head.y + (s.dir === 'up' ? size.h / 2 + 16 : -size.h / 2 - 16) + bob(t, 1.3, 8);
    const itemY = clamp(rawItemY, 24 + size.h / 2, 836 - size.h / 2);
    drawItem(ctx, s.item, { x: itemX, y: itemY, t, scale: 0.5, sx: impact.sx, sy: impact.sy });

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
      bar(ctx, 460, 784, 236, 48, { progress: stepped, color: s.barColor, background: PAL.grey5 });
      label(ctx, word, 578, 738, { variant: 'sign', maxWidth: 300 });
    }
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const safeDur = Math.max(0.05, dur), s = plan(props, safeDur);
    const actorBase = actorBounds({ who: s.who, x: 0, y: STAGE.floor, scale: 1, facing: 1, keys: actorKeys(s, safeDur) });
    const actorX = clamp(108, 24 - actorBase.left, 696 - actorBase.right);
    const list: Cue[] = [];
    if (s.steps <= 4) list.push(cue(0.03, 'footfall', 0.7, actorX), cue(Math.max(0, s.times[0]! - 0.24), 'rise', 0.6, 255));
    for (let i = 0; i < s.steps; i++) list.push(cue(s.times[i]!, 'thump', 1.4, 255 + 400 * (i + 1) / s.steps));
    if (s.showBar && list.length < 7) list.push(cue(Math.min(safeDur, s.times[0]! + 0.18), 'clunk', 0.75, 578));
    const finalIndex = s.steps - 1;
    if (s.steps <= 3 && list.length < 7) list.push(cue(Math.min(safeDur, s.times[finalIndex]! + stepDuration(s.times, finalIndex, safeDur) + 0.44), 'rustle', 0.65, actorX));
    if (list.length < 8) list.push(cue(Math.min(safeDur, s.times[s.steps - 1]! + 0.2), s.tone === 'loss' ? 'sub' : 'ding', s.tone === 'loss' ? 0.8 : 0.7, 560));
    return cuesIn(safeDur, list);
  },
};
