// grow — an actor feeds or scrapes an item, making each size change visibly causal.
import type { Cue, Frame, ShotProps } from '../core.ts';
import { arc, bob, clamp, ease, lerp, phase } from '../kit/motion.ts';
import { Grid, PAL } from '../kit/pixel.ts';
import { drawSprite, type Sprite } from '../kit/sprite.ts';
import { drawStage } from '../kit/stage.ts';
import { ACTORS, STAGE, beats, cue, cuesIn, drawActor, drawItem, itemParam, itemSize, num, pick, type ItemId } from './common.ts';
import type { ShotDef } from './index.ts';

const DIRECTIONS = ['grow', 'shrink'] as const;
const TIMERS = ['none', 'clock', 'hourglass'] as const;
const MIN_SIZE = 0.34;
const MAX_SIZE = 0.9;
const HERO_X = 482;
const ACTOR_X = 140;
const TIMER_X = 640;
const ACTION_DUR = 0.22;

const feedPellet: Sprite = new Grid(9, 8)
  .ellipse(4.5, 4, 3.8, 3.1, PAL.paperShade)
  .ellipse(3.6, 3.1, 1.4, 1, PAL.paper)
  .outline(PAL.ink)
  .sprite('shot-grow:feed-pellet');
const shavedChunk: Sprite = new Grid(9, 8)
  .poly([{ x: 1, y: 5 }, { x: 3, y: 1 }, { x: 7, y: 2 }, { x: 8, y: 5 }, { x: 5, y: 7 }], PAL.grey2)
  .poly([{ x: 3, y: 2 }, { x: 7, y: 2 }, { x: 5, y: 4 }], PAL.grey1)
  .outline(PAL.grey5)
  .sprite('shot-grow:shaved-chunk');

interface Plan {
  item: ItemId;
  dir: typeof DIRECTIONS[number];
  steps: number;
  who: string;
  timer: typeof TIMERS[number];
  times: number[];
  baseScale: number;
}

function plannedTimes(props: ShotProps, dur: number, count: number): number[] {
  const fractions = Array.from({ length: count }, (_, i) => 0.16 + (i / Math.max(1, count - 1)) * 0.68);
  const requested = beats(props, dur, fractions);
  const first = Math.min(0.16, dur * 0.1);
  const span = Math.max(0.12, dur - first - 0.34);
  const gap = count > 1 ? Math.min(0.46, span / (count - 1)) : 0;
  const result: number[] = [];
  for (let i = 0; i < count; i++) {
    const earliest = i === 0 ? first : result[i - 1]! + gap;
    const latest = Math.max(earliest, dur - 0.34 - gap * (count - 1 - i));
    result.push(clamp(requested[i] ?? earliest, earliest, latest));
  }
  return result;
}

function plan(props: ShotProps, dur: number): Plan {
  const p = props.params;
  const requested = Math.round(num(p, 'steps', 4, 2, 6));
  const capacity = Math.max(2, Math.min(6, Math.floor(Math.max(0, dur - 0.2) / 0.38) + 1));
  const steps = Math.min(requested, capacity);
  const item = itemParam(p, 'item', 'tree');
  const dims = itemSize(item);
  return {
    item,
    dir: pick(p, 'dir', DIRECTIONS, 'grow'),
    steps,
    who: pick(p, 'who', ACTORS, 'hedgy'),
    timer: pick(p, 'timer', TIMERS, 'none'),
    times: plannedTimes(props, dur, steps),
    baseScale: Math.min(0.82, 410 / dims.w, 460 / dims.h),
  };
}

function sizeValueAt(t: number, s: Plan): number {
  let value = s.dir === 'grow' ? MIN_SIZE : MAX_SIZE;
  for (let i = 0; i < s.times.length; i++) {
    const at = s.times[i]!;
    if (t < at) break;
    const portion = (i + 1) / s.times.length;
    const target = s.dir === 'grow'
      ? lerp(MIN_SIZE, MAX_SIZE, portion ** 1.25)
      : lerp(MAX_SIZE, MIN_SIZE, portion ** 1.25);
    const progress = phase(t, at, at + ACTION_DUR);
    value = lerp(value, target, ease.outCubic(progress));
    if (progress < 1) break;
  }
  return clamp(value, MIN_SIZE, MAX_SIZE);
}

function sizeBeforeStep(s: Plan, index: number): number {
  if (index === 0) return s.dir === 'grow' ? MIN_SIZE : MAX_SIZE;
  const portion = index / s.times.length;
  return s.dir === 'grow'
    ? lerp(MIN_SIZE, MAX_SIZE, portion ** 1.25)
    : lerp(MAX_SIZE, MIN_SIZE, portion ** 1.25);
}

function poseKeys(s: Plan, dur: number) {
  const keys = [
    { at: 0, pose: 'walk' as const, expression: s.dir === 'grow' ? 'determined' as const : 'worried' as const },
    { at: Math.max(0, s.times[0]! - 0.18), pose: s.dir === 'grow' ? 'give' as const : 'push' as const, expression: s.dir === 'grow' ? 'determined' as const : 'determined' as const },
    ...s.times.flatMap((at, i) => [
      { at, pose: s.dir === 'grow' ? 'give' as const : 'push' as const, expression: s.dir === 'grow' ? 'happy' as const : 'determined' as const },
      ...(i < s.times.length - 1 && at + 0.24 < s.times[i + 1]!
        ? [{ at: at + 0.24, pose: s.dir === 'grow' ? 'think' as const : 'hold' as const, expression: s.dir === 'grow' ? 'happy' as const : 'worried' as const }]
        : []),
    ]),
    { at: Math.min(dur, s.times.at(-1)! + 0.26), pose: s.dir === 'grow' ? 'celebrate' as const : 'sweat' as const, expression: s.dir === 'grow' ? 'happy' as const : 'worried' as const },
  ];
  return keys.sort((a, b) => a.at - b.at);
}

function actionPoint(s: Plan, sizeValue: number) {
  const dims = itemSize(s.item, s.baseScale * sizeValue);
  const y = STAGE.floor - dims.h / 2;
  return { dims, x: HERO_X - dims.w / 2 + 10, y: y - dims.h * 0.12 };
}

function drawFlyingBits(ctx: Frame['ctx'], s: Plan, t: number) {
  for (let i = 0; i < s.times.length; i++) {
    const at = s.times[i]!, before = sizeBeforeStep(s, i), source = actionPoint(s, before);
    if (s.dir === 'grow') {
      const start = at - ACTION_DUR;
      const u = phase(t, start, at);
      if (u > 0 && u < 1) {
        const from = { x: ACTOR_X + 100, y: STAGE.floor - 182 };
        const to = { x: source.x, y: source.y };
        const pos = arc(from, to, 20, ease.inOutCubic(u));
        drawSprite(ctx, feedPellet, pos.x, pos.y, { anchor: [0.5, 0.5], scale: 0.38, rot: u * 0.24 });
      }
      continue;
    }
    for (let piece = 0; piece < 4; piece++) {
      const start = at + piece * 0.055, flight = 0.31 + piece * 0.02;
      const u = phase(t, start, start + flight);
      if (u <= 0 || u >= 1) continue;
      const from = { x: source.x, y: source.y + (piece - 1.5) * 16 };
      const to = { x: ACTOR_X + 94, y: STAGE.floor - 184 + (piece - 1.5) * 13 };
      const pos = arc(from, to, 24 + piece * 5, ease.inOutCubic(u));
      drawSprite(ctx, shavedChunk, pos.x, pos.y, { anchor: [0.5, 0.5], scale: 0.56 - piece * 0.055, rot: (u - 0.5) * 0.55 + piece * 0.18 });
    }
  }
}

function drawScraper(ctx: Frame['ctx'], x: number, y: number, t: number) {
  const nudge = Math.sin(t * Math.PI * 2 / 0.44) * 3;
  ctx.save();
  ctx.translate(x + nudge, y);
  ctx.rotate(-0.26);
  ctx.fillStyle = PAL.ink;
  ctx.fillRect(-24, -5, 30, 10);
  ctx.fillStyle = PAL.wood2;
  ctx.fillRect(-21, -3, 22, 6);
  ctx.fillStyle = PAL.grey5;
  ctx.fillRect(3, -10, 7, 20);
  ctx.fillStyle = PAL.grey1;
  ctx.fillRect(4, -8, 4, 16);
  ctx.restore();
}

export const growShot: ShotDef = {
  name: 'grow',
  stage: 'clean',
  describe: 'An actor feeds an item with small pieces that fly from its paw and make it grow, or scrapes visible chunks off it that fly back to the actor as it shrinks; every change keeps the item silhouette proportional. params: item (any item id in ITEMS, default tree), dir (grow|shrink, default grow), steps (2–6, default 4; capped to fit), who (actor id, default hedgy), timer (none|clock|hourglass, default none; when requested it stays small in the upper-right). Events: each event triggers the next feed or scrape; missing events use evenly spaced fallback steps.',
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame, dur = Math.max(0.05, frame.dur), t = clamp(frame.t, 0, dur), s = plan(props, dur);
    const amount = sizeValueAt(t, s), dims = itemSize(s.item, s.baseScale * amount);
    const itemY = STAGE.floor - dims.h / 2 + bob(t, 1.2, 3);
    const last = [...s.times].reverse().find(at => t >= at);
    const itemHit = last === undefined ? 1 : 1 + Math.sin(Math.min(1, Math.max(0, t - last) / 0.22) * Math.PI) * 0.035;
    const itemX = HERO_X + Math.sin(t * 1.4) * 2;
    const keys = poseKeys(s, dur);
    const touchX = itemX - dims.w / 2 + 10;
    const hand = { x: Math.max(ACTOR_X + 78, touchX - 10), y: Math.min(STAGE.floor - 150, itemY - dims.h * 0.1) };
    const currentAction = last !== undefined && t < last + 0.24;

    drawStage(ctx, { floorY: STAGE.floor, line: true, shadow: [{ x: ACTOR_X, y: STAGE.floor - 3, w: 170 }, { x: itemX, y: STAGE.floor - 3, w: Math.min(380, dims.w) }] });
    if (s.timer === 'clock') {
      drawItem(ctx, 'clock', { x: TIMER_X, y: 150, t, scale: 0.24, hour: 11, minute: t * 220, fast: true, rim: 'blue' });
    } else if (s.timer === 'hourglass') {
      drawItem(ctx, 'hourglass', { x: TIMER_X, y: 150, t, scale: 0.32, p: clamp(t / dur) });
    }

    drawFlyingBits(ctx, s, t);
    drawItem(ctx, s.item, {
      x: itemX, y: itemY, t, scale: s.baseScale * amount * itemHit,
      rot: s.item === 'snowball' ? Math.sin(t * 1.8) * 0.025 : 0,
    });
    if (s.dir === 'shrink' && currentAction) drawScraper(ctx, hand.x, hand.y, t);
    drawActor(ctx, {
      who: s.who, x: ACTOR_X + Math.sin(t * 1.9) * 3, y: STAGE.floor, facing: 1, scale: 1, time: t,
      look: 'up', keys, handTarget: hand, reach: ease.outCubic(phase(t, 0.08, Math.max(0.4, s.times[0]! + 0.16))),
    });
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const safeDur = Math.max(0.05, dur), s = plan(props, safeDur);
    return cuesIn(safeDur, [
      cue(0.03, 'footfall', 0.62, ACTOR_X),
      ...(s.timer !== 'none' ? [cue(0.16, 'tick', 0.42, TIMER_X)] : []),
      ...s.times.flatMap((at, i) => s.dir === 'grow'
        ? [cue(at - ACTION_DUR, 'swish', 0.56, ACTOR_X + 100), cue(at, i === 0 ? 'build' : 'thump', i === 0 ? 1.25 : 0.9, HERO_X)]
        : [cue(at - 0.04, 'slide', 0.58, HERO_X - 80), cue(at, i === 0 ? 'crack' : 'clunk', i === 0 ? 1.2 : 0.85, HERO_X)]),
    ]);
  },
};
