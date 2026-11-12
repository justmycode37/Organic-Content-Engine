// split — one whole becomes separate portions or holdings.
import type { Cue, Frame, ShotProps } from '../core.ts';
import { arc, bob, clamp, ease, lerp, phase, squash } from '../kit/motion.ts';
import { Grid, PAL } from '../kit/pixel.ts';
import { drawSprite } from '../kit/sprite.ts';
import { drawStage } from '../kit/stage.ts';
import { ACTORS, STAGE, actorBounds, beats, cue, cuesIn, drawActor, drawItem, itemSize, num, pick, type ItemId } from './common.ts';
import type { ShotDef } from './index.ts';

const SPLIT_ITEMS = ['pie', 'pizza', 'basket', 'share'] as const satisfies readonly ItemId[];
const MODES = ['split', 'merge'] as const;

// A generous crust and broad toppings keep each half-scale slice readable.
const pizzaPart = new Grid(60, 60)
  .poly([{ x: 30, y: 57 }, { x: 4, y: 31 }, { x: 9, y: 15 }, { x: 18, y: 7 }, { x: 30, y: 3 }, { x: 42, y: 7 }, { x: 51, y: 15 }, { x: 56, y: 31 }], PAL.ink)
  .poly([{ x: 30, y: 52 }, { x: 9, y: 31 }, { x: 14, y: 17 }, { x: 21, y: 10 }, { x: 30, y: 7 }, { x: 39, y: 10 }, { x: 46, y: 17 }, { x: 51, y: 31 }], PAL.orange3)
  .poly([{ x: 30, y: 47 }, { x: 13, y: 30 }, { x: 18, y: 19 }, { x: 24, y: 13 }, { x: 30, y: 11 }, { x: 36, y: 13 }, { x: 42, y: 19 }, { x: 47, y: 30 }], PAL.gold2)
  .poly([{ x: 30, y: 44 }, { x: 16, y: 29 }, { x: 21, y: 21 }, { x: 27, y: 17 }, { x: 33, y: 17 }, { x: 39, y: 21 }, { x: 44, y: 29 }], PAL.red2)
  .ellipse(22, 26, 4, 4, PAL.red1).ellipse(38, 27, 4, 4, PAL.red1).ellipse(30, 20, 3.5, 3.5, PAL.red1)
  .outline(PAL.ink)
  .sprite('shot-split:pizza-wedge');
const piePart = new Grid(60, 60)
  .poly([{ x: 30, y: 57 }, { x: 3, y: 5 }, { x: 57, y: 5 }], PAL.ink)
  .poly([{ x: 30, y: 52 }, { x: 8, y: 9 }, { x: 52, y: 9 }], PAL.blue3)
  .poly([{ x: 30, y: 47 }, { x: 14, y: 13 }, { x: 46, y: 13 }], PAL.blue1)
  .rect(20, 21, 6, 6, PAL.gold2).rect(34, 17, 6, 6, PAL.red2)
  .outline(PAL.ink)
  .sprite('shot-split:pie-wedge');

interface Point { x: number; y: number }
interface Plan {
  item: typeof SPLIT_ITEMS[number];
  parts: number;
  mode: typeof MODES[number];
  who: string;
  times: number[];
  travel: number;
  outputs: ItemId[];
  positions: Point[];
}

function outputItems(item: Plan['item'], count: number): ItemId[] {
  if (item === 'basket') return (count === 2 ? ['share', 'bond'] : ['share', 'bond', 'pie']).slice(0, count) as ItemId[];
  return Array.from({ length: count }, () => item === 'pizza' || item === 'pie' ? item : 'share');
}

function partPositions(count: number, mode: Plan['mode']): Point[] {
  if (count === 2) return [{ x: 320, y: 410 }, { x: 580, y: 410 }];
  return [{ x: 320, y: 325 }, { x: 565, y: 325 }, mode === 'merge' ? { x: 380, y: 520 } : { x: 330, y: 570 }];
}

function plannedTimes(props: ShotProps, dur: number, count: number, travel: number): number[] {
  const fractions = Array.from({ length: count }, (_, i) => 0.2 + (i / Math.max(1, count - 1)) * 0.6);
  const requested = beats(props, dur, fractions);
  const first = Math.min(0.16, dur * 0.1);
  const latestEnd = Math.max(first, dur - travel - 0.08);
  const gap = count > 1 ? Math.min(0.46, (latestEnd - first) / (count - 1)) : 0;
  const result: number[] = [];
  for (let i = 0; i < count; i++) {
    const earliest = i === 0 ? first : result[i - 1]! + gap;
    const latest = Math.max(earliest, latestEnd - gap * (count - 1 - i));
    result.push(clamp(requested[i] ?? earliest, earliest, latest));
  }
  return result;
}

function plan(props: ShotProps, dur: number): Plan {
  const p = props.params;
  const requested = Math.round(num(p, 'parts', 3, 2, 3));
  const parts = Math.min(requested, Math.max(2, Math.min(3, Math.floor(Math.max(0, dur - 0.14) / 0.8) + 1)));
  const travel = dur < 1.9 ? Math.min(0.32, dur * 0.16) : Math.min(1.2, Math.max(0.4, dur * 0.29));
  const item = pick(p, 'item', SPLIT_ITEMS, 'share');
  return {
    item, parts, mode: pick(p, 'mode', MODES, 'split'), who: pick(p, 'who', ACTORS, 'hedgy'), travel,
    times: plannedTimes(props, dur, parts, travel),
    outputs: outputItems(item, parts), positions: partPositions(parts, pick(p, 'mode', MODES, 'split')),
  };
}

function drawPart(ctx: Frame['ctx'], s: Plan, index: number, x: number, y: number, t: number, alpha = 1, rot = 0, sx = 1, sy = 1): void {
  if (s.item === 'pizza' || s.item === 'pie') {
    const part = s.item === 'pizza' ? pizzaPart : piePart;
    const centerX = clamp(x, 36 + part.w * 0.25, STAGE.w - 36 - part.w * 0.25);
    drawSprite(ctx, part, centerX, y, { anchor: [0.5, 0.5], scale: 0.5, alpha, rot, sx, sy });
    return;
  }
  const dims = itemSize(s.outputs[index]!, 0.5);
  const centerX = clamp(x, 36 + dims.w / 2, STAGE.w - 36 - dims.w / 2);
  drawItem(ctx, s.outputs[index]!, { x: centerX, y, t, scale: 0.5, alpha, rot, sx, sy });
}

function sourceState(item: Plan['item']): Record<string, unknown> {
  if (item === 'pie') return { slices: [1, 1, 1, 1, 1], highlight: 0 };
  if (item === 'pizza') return { slices: 6, taken: 0 };
  if (item === 'basket') return { items: 3 };
  return {};
}

function followThrough(last: number, dur: number, mode: Plan['mode']) {
  const keys: { at: number; pose: 'point' | 'think' | 'hold'; expression: 'happy' | 'neutral' }[] = [];
  for (let at = last + 0.54, index = 0; at < dur - 0.08; at += 0.58, index++) {
    keys.push({ at, pose: index % 2 ? 'think' : mode === 'split' ? 'hold' : 'point', expression: mode === 'split' ? 'happy' : 'neutral' });
  }
  return keys;
}

function intervalActing(times: number[], mode: Plan['mode']) {
  const keys: { at: number; pose: 'point' | 'think' | 'tap' | 'give'; expression: 'happy' | 'neutral' }[] = [];
  for (let i = 0; i < times.length - 1; i++) {
    for (let at = times[i]! + 0.44, index = 0; at < times[i + 1]! - 0.12; at += 0.4, index++) {
      keys.push({
        at,
        pose: index % 2 ? 'think' : 'point',
        expression: mode === 'split' ? 'happy' : 'neutral',
      });
    }
  }
  return keys;
}

export const splitShot: ShotDef = {
  name: 'split',
  stage: 'clean',
  describe: 'A whole pie, pizza, basket, or share certificate separates into two or three portions or holdings; merge gathers them back together. params: item (pie | pizza | basket | share, default share), parts (2–3, default 3; capped to fit short durations), mode (split | merge, default split), who (actor id, default hedgy). Events: each event releases the next part or gathers one back; missing events use evenly spaced fallback beats.',
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame, dur = Math.max(0.05, frame.dur), t = clamp(frame.t, 0, dur), s = plan(props, dur), quick = dur < 1.9;
    const source = { x: 450, y: 410 };
    const lastAt = s.times[s.times.length - 1]!;
    const payoffAt = lastAt + s.travel;
    const carryMix = s.parts === 3 && s.mode === 'split' ? ease.inOutCubic(phase(t, lastAt, payoffAt)) : 0;
    const handTarget = { x: lerp(314, 194, carryMix), y: lerp(433, 610, carryMix) };
    const keys = [
      { at: 0, pose: 'think' as const, expression: 'neutral' as const },
      { at: 0.14, pose: 'point' as const, expression: 'determined' as const },
      ...s.times.flatMap((at, i) => [
        {
          at: at + 0.1,
          pose: (s.mode === 'split' ? (i === s.parts - 1 ? (s.parts === 3 ? 'hold' : 'celebrate') : 'tap') : (i === s.parts - 1 ? 'hold' : 'give')) as 'celebrate' | 'tap' | 'hold' | 'give',
          expression: (s.mode === 'split' ? 'happy' : 'neutral') as 'happy' | 'neutral',
        },
      ]),
      ...intervalActing(s.times, s.mode),
      { at: payoffAt + 0.18, pose: 'point' as const, expression: 'happy' as const },
      ...followThrough(payoffAt, dur, s.mode),
    ].sort((a, b) => a.at - b.at);

    drawStage(ctx, {
      floorY: STAGE.floor, line: true,
      shadow: [{ x: 112, y: STAGE.floor - 3, w: 178 }],
    });

    if (s.mode === 'split') {
      const sourceFade = 1 - ease.outCubic(phase(t, s.times[0]! - 0.08, s.times[0]! + (quick ? 0.32 : s.travel * 0.72)));
      if (sourceFade > 0.01) {
        drawItem(ctx, s.item, { x: source.x, y: source.y + bob(t, 1.15, 7), t, scale: 1, ...sourceState(s.item), alpha: sourceFade });
      }
      for (let i = 0; i < s.parts; i++) {
        const at = s.times[i]!, dest = s.positions[i]!;
        if (t < at) continue;
        const resting = { x: dest.x, y: dest.y + bob(t + i * 0.13, 1.05, 14) };
        const progress = quick ? 1 : ease.inOutCubic(phase(t, at, at + s.travel));
        const pos = quick ? resting : arc(source, resting, 34, progress);
        const alpha = ease.outCubic(phase(t, at, at + (quick ? 0.32 : 0.18)));
        const hit = squash(t, at + s.travel, 0.14, 0.2);
        if (alpha > 0.01) drawPart(ctx, s, i, pos.x, pos.y, t, alpha, (1 - progress) * (i % 2 ? 0.07 : -0.07), hit.sx, hit.sy);
      }
    } else {
      const sourceAlpha = quick
        ? ease.outCubic(phase(t, lastAt + 0.1, lastAt + 0.4))
        : ease.outCubic(phase(t, payoffAt - 0.24, payoffAt + 0.08));
      const sourceHit = squash(t, payoffAt + 0.04, 0.16, 0.2);
      for (let i = 0; i < s.parts; i++) {
        const at = s.times[i]!, dest = s.positions[i]!;
        if (t < at) {
          drawPart(ctx, s, i, dest.x, dest.y + bob(t + i * 0.13, 1.05, 14), t);
          continue;
        }
        const launch = { x: dest.x, y: dest.y + bob(at + i * 0.13, 1.05, 14) };
        const progress = ease.inOutCubic(phase(t, at, at + (quick ? 0.34 : s.travel)));
        const pos = quick ? arc(launch, source, 18, progress * 0.12) : arc(launch, source, 30, progress);
        const alpha = 1 - ease.outCubic(phase(t, at + (quick ? 0.18 : s.travel * 0.55), at + (quick ? 0.4 : s.travel)));
        const hit = squash(t, at + s.travel, 0.14, 0.2);
        if (alpha > 0.01) drawPart(ctx, s, i, pos.x, pos.y, t, alpha, progress * (i % 2 ? 0.07 : -0.07), hit.sx, hit.sy);
      }
      if (sourceAlpha > 0.01) {
        drawItem(ctx, s.item, { x: source.x, y: source.y + bob(t, 1.15, 7), t, scale: 1, ...sourceState(s.item), alpha: sourceAlpha, sx: sourceHit.sx, sy: sourceHit.sy });
      }
    }

    const rawActorX = 112 + Math.sin(t * 2.8 + 0.4) * 24;
    const actorBox = actorBounds({ who: s.who, x: rawActorX, y: STAGE.floor, facing: 1, scale: 1, time: t, keys });
    const actorCorrection = actorBox.left < 28 ? 28 - actorBox.left : actorBox.right > 692 ? 692 - actorBox.right : 0;
    drawActor(ctx, {
      who: s.who, x: rawActorX + actorCorrection, y: STAGE.floor, facing: 1, scale: 1, time: t, look: 'up', keys,
      handTarget: { x: handTarget.x + actorCorrection, y: handTarget.y },
      reach: ease.inOutCubic(phase(t, 0.14, 0.42)) * (t > payoffAt + 0.25 ? 0.5 : 0.76),
    });
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const safeDur = Math.max(0.05, dur), s = plan(props, safeDur), last = s.times[s.times.length - 1]!;
    return cuesIn(safeDur, [
      cue(0.08, 'footfall', 0.58, 112),
      cue(0.16, 'rustle', 0.55, 450),
      ...s.times.map((at, i) => cue(s.mode === 'split' ? at + s.travel : at, s.mode === 'split' ? (i === 0 ? 'thump' : 'paper') : 'slide', i === 0 ? 1.3 : 0.78, s.positions[i]!.x)),
      ...s.times.slice(0, -1).filter((at, i) => at + 0.4 < s.times[i + 1]!).map(at => cue(at + 0.4, 'rustle', 0.55, 112)),
      cue(Math.min(safeDur, last + (safeDur < 1.9 ? 0.26 : s.travel + 0.12)), s.mode === 'split' ? 'ding' : 'clunk', 0.62, 450),
    ]);
  },
};
