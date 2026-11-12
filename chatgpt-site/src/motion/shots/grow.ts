// grow — a changing asset compounds through visible steps as time passes.
import type { Cue, Frame, ShotProps } from '../core.ts';
import { bob, clamp, ease, lerp, phase, squash } from '../kit/motion.ts';
import { Grid, PAL } from '../kit/pixel.ts';
import { drawSprite, type Sprite } from '../kit/sprite.ts';
import { drawStage } from '../kit/stage.ts';
import { ACTORS, STAGE, actorBounds, beats, cue, cuesIn, drawActor, drawItem, itemSize, num, pick, type ItemId } from './common.ts';
import type { ShotDef } from './index.ts';

const GROW_ITEMS = ['tree', 'snowball', 'cashPile', 'piggy'] as const satisfies readonly ItemId[];
const DIRECTIONS = ['grow', 'shrink'] as const;
const TIMERS = ['clock', 'hourglass'] as const;
const HERO_X = 430;
const TIMER_X = 350;
const ACTOR_X = 112;
const cashPileSprites = new Map<number, Sprite>();

function cashPileFor(value: number): Sprite {
  const count = 7 + Math.round(clamp(value) * 5);
  const cached = cashPileSprites.get(count);
  if (cached) return cached;
  const g = new Grid(62, 64);
  for (let i = 0; i < count; i++) {
    const x = 3 + (i % 3) * 19, y = 48 - Math.floor(i / 3) * 15;
    g.round(x, y, 18, 13, 2, PAL.ink);
    g.round(x + 1, y + 1, 16, 11, 1, PAL.green3);
    g.rect(x + 2, y + 2, 14, 2, PAL.green1);
    g.rect(x + 2, y + 4, 14, 5, PAL.green2);
    g.rect(x + 7, y + 1, 4, 11, PAL.paperShade);
    g.rect(x + 8, y + 2, 2, 9, PAL.paper);
    g.rect(x + 8, y + 5, 2, 1, PAL.green4);
    g.rect(x + 6, y + 6, 6, 1, PAL.green4);
    g.rect(x + 7, y + 8, 4, 1, PAL.green4);
    g.rect(x + 2, y + 10, 14, 1, PAL.green4);
  }
  const sprite = g.outline(PAL.ink).sprite(`shot-grow:cash-pile:${count}`);
  cashPileSprites.set(count, sprite);
  return sprite;
}

interface Plan {
  item: typeof GROW_ITEMS[number];
  dir: typeof DIRECTIONS[number];
  steps: number;
  who: string;
  timer: typeof TIMERS[number];
  times: number[];
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
  return {
    item: pick(p, 'item', GROW_ITEMS, 'tree'),
    dir: pick(p, 'dir', DIRECTIONS, 'grow'),
    steps,
    who: pick(p, 'who', ACTORS, 'hedgy'),
    timer: pick(p, 'timer', TIMERS, 'clock'),
    times: plannedTimes(props, dur, steps),
  };
}

function heroSize(item: Plan['item']) {
  return item === 'cashPile' ? { w: 372, h: 384 } : itemSize(item);
}

function floorValue(item: Plan['item']): number {
  if (item === 'tree') return 0.4;
  if (item === 'snowball') return 0.52;
  if (item === 'cashPile') return 0.18;
  return 0;
}

function valueAt(t: number, s: Plan): number {
  const low = floorValue(s.item);
  let value = s.dir === 'grow' ? low : 1;
  for (let i = 0; i < s.times.length; i++) {
    const at = s.times[i]!;
    if (t < at) break;
    const portion = (i + 1) / s.times.length;
    const target = s.dir === 'grow'
      ? low + (1 - low) * portion ** 1.45
      : 1 - (1 - low) * portion ** 1.45;
    const progress = phase(t, at, at + 0.3);
    value = lerp(value, target, ease.outCubic(progress));
    if (progress < 1) break;
  }
  return clamp(value);
}

function assetState(item: Plan['item'], value: number): Record<string, unknown> {
  if (item === 'tree') return { grow: value };
  if (item === 'snowball') return { size: value };
  return { fill: value };
}

function followThrough(last: number, dur: number, direction: Plan['dir']) {
  const keys: { at: number; pose: 'point' | 'think'; expression: 'happy' | 'worried' }[] = [];
  for (let at = last + 0.48, index = 0; at < dur - 0.08; at += 0.56, index++) {
    keys.push({
      at,
      pose: index % 2 === 0 ? 'point' : 'think',
      expression: direction === 'grow' ? 'happy' : 'worried',
    });
  }
  return keys;
}

export const growShot: ShotDef = {
  name: 'grow',
  stage: 'clean',
  describe: 'A tree, snowball, cash pile, or piggy bank visibly grows in compounding steps or shrinks as time passes. params: item (tree | snowball | cashPile | piggy, default tree), dir (grow | shrink, default grow), steps (2–6, default 4; capped to fit short durations), who (actor id, default hedgy), timer (clock | hourglass, default clock). Events: each event triggers the next change; missing events use evenly spaced fallback steps.',
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame, dur = Math.max(0.05, frame.dur), t = clamp(frame.t, 0, dur), s = plan(props, dur);
    const dims = heroSize(s.item), itemY = s.item === 'tree' ? STAGE.floor - 180 : STAGE.floor - dims.h / 2;
    const amount = valueAt(t, s), last = [...s.times].reverse().find(at => t >= at);
    const hit = last === undefined ? { sx: 1, sy: 1 } : squash(t, last + 0.025, 0.2, 0.28);
    const itemDrawY = itemY + bob(t, 1.1, 9);
    const safeSy = Math.min(hit.sy, (STAGE.h - 28 - itemDrawY) / (dims.h / 2));
    const keys = [
      { at: 0, pose: 'think' as const, expression: 'neutral' as const },
      { at: 0.14, pose: 'point' as const, expression: 'determined' as const },
      ...s.times.flatMap((at, i) => [
        {
          at: at + 0.1,
          pose: (s.dir === 'grow' ? (i === s.times.length - 1 ? 'celebrate' : 'tap') : (i === s.times.length - 1 ? 'sweat' : 'give')) as 'celebrate' | 'tap' | 'sweat' | 'give',
          expression: (s.dir === 'grow' ? 'happy' : 'worried') as 'happy' | 'worried',
        },
        ...(i < s.times.length - 1 && at + 0.4 < s.times[i + 1]!
          ? [{ at: at + 0.4, pose: 'think' as const, expression: (s.dir === 'grow' ? 'happy' : 'worried') as 'happy' | 'worried' }]
          : []),
      ]),
      ...followThrough(s.times[s.times.length - 1]!, dur, s.dir),
    ];
    const handTarget = { x: 310, y: itemY + 26 };
    const rawActorX = ACTOR_X + Math.sin(t * 1.6) * 10;
    const actorBox = actorBounds({ who: s.who, x: rawActorX, y: STAGE.floor, facing: 1, scale: 1, time: t, keys });
    const actorCorrection = actorBox.left < 28 ? 28 - actorBox.left : actorBox.right > 692 ? 692 - actorBox.right : 0;
    const reach = last === undefined
      ? ease.outCubic(phase(t, 0.12, 0.38)) * 0.55
      : 0.42 + 0.28 * (1 - ease.outCubic(phase(t, last + 0.22, last + 0.42)));

    drawStage(ctx, {
      floorY: STAGE.floor, line: true,
      shadow: [
        { x: ACTOR_X, y: STAGE.floor - 3, w: 178 },
        { x: HERO_X, y: STAGE.floor - 3, w: Math.min(360, dims.w) },
      ],
    });

    if (s.timer === 'clock') {
      drawItem(ctx, 'clock', { x: TIMER_X, y: 207, t, scale: 0.5, hour: 11, minute: t * 170, fast: true, rim: 'blue' });
    } else {
      drawItem(ctx, 'hourglass', { x: TIMER_X, y: 207, t, scale: 0.5, p: clamp(t / dur) });
    }

    if (s.item === 'cashPile') {
      drawSprite(ctx, cashPileFor(amount), HERO_X + Math.sin(t * 1.7) * 3, itemY + bob(t, 1.1, 9), {
        anchor: [0.5, 0.5], scale: 1, sx: hit.sx, sy: safeSy,
      });
    } else {
      drawItem(ctx, s.item, {
        x: HERO_X + Math.sin(t * 1.7) * 3, y: itemDrawY, t, scale: 1,
        ...assetState(s.item, amount), sx: hit.sx, sy: safeSy,
      });
    }

    drawActor(ctx, {
      who: s.who, x: rawActorX + actorCorrection, y: STAGE.floor, facing: 1, scale: 1, time: t,
      look: 'up', keys, handTarget, reach,
    });
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const safeDur = Math.max(0.05, dur), s = plan(props, safeDur);
    return cuesIn(safeDur, [
      cue(0.08, 'footfall', 0.62, ACTOR_X),
      cue(0.2, s.timer === 'clock' ? 'tick' : 'paper', 0.55, TIMER_X),
      ...s.times.map((at, i) => cue(at + 0.04, i === 0 ? 'thump' : i % 2 ? 'paper' : 'clunk', i === 0 ? 1.4 : 0.8, HERO_X)),
    ]);
  },
};
