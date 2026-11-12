// equation — two supporting terms resolve into one full-size result.
import type { Cue, Frame, ShotProps } from '../core.ts';
import type { HedgyKey } from '../actor/hedgy.ts';
import { clamp, ease, phase, squash, bob } from '../kit/motion.ts';
import { PAL } from '../kit/pixel.ts';
import { drawStage, label } from '../kit/stage.ts';
import { ring, sparks } from '../kit/fx.ts';
import { ACTORS, STAGE, actorBounds, beats, cue, cuesIn, drawActor, drawItem, itemParam, itemSize, pick, type ItemId } from './common.ts';
import type { ShotDef } from './index.ts';

const ACTOR_OPTIONS = [...ACTORS, 'none'] as const;
const OPERATORS = ['+', '−', '-', '×', 'x', 'X'] as const;

function labelsParam(params: ShotProps['params']): string[] {
  const raw = params?.labels;
  if (Array.isArray(raw)) return [0, 1, 2].map(i => String(raw[i] ?? ['A', 'B', 'C'][i]).trim());
  if (typeof raw === 'string') {
    const values = raw.split(/[|/]/).map(value => value.trim());
    return [0, 1, 2].map(i => values[i] || ['A', 'B', 'C'][i]!);
  }
  return ['A', 'B', 'C'];
}

function eventsOf(props: ShotProps): number[] {
  return [...(props.events ?? [])]
    .filter(event => Number.isFinite(event.at))
    .map(event => Math.max(0, event.at))
    .sort((a, b) => a - b);
}

interface Plan {
  a: ItemId;
  b: ItemId;
  c: ItemId;
  op: string;
  labels: string[];
  who: typeof ACTOR_OPTIONS[number];
  aAt: number;
  bAt: number;
  cAt: number;
}

function plan(props: ShotProps, dur: number): Plan {
  const p = props.params, [rawAAt, rawBAt, rawCAt] = beats(props, dur, [0.2, 0.42, 0.65]);
  const supplied = eventsOf(props).map(at => Math.min(dur, at));
  const gap = Math.min(0.52, dur * 0.34);
  const aAt = supplied[0] ?? rawAAt!;
  const bAt = supplied[1] ?? Math.min(rawBAt!, aAt + gap);
  const cAt = supplied[2] ?? Math.min(rawCAt!, bAt + gap);
  const orderedB = Math.max(bAt, Math.min(dur, aAt + Math.min(0.2, dur / 5)));
  const orderedC = Math.max(cAt, Math.min(dur, orderedB + Math.min(0.2, dur / 5)));
  const requested = pick(p, 'op', OPERATORS, '+');
  return {
    a: itemParam(p, 'a', 'share'),
    b: itemParam(p, 'b', 'cash'),
    c: itemParam(p, 'c', 'moneyBag'),
    op: requested === '-' ? '−' : requested === 'x' || requested === 'X' ? '×' : requested,
    labels: labelsParam(p),
    who: pick(p, 'who', ACTOR_OPTIONS, 'none'),
    aAt,
    bAt: orderedB,
    cAt: orderedC,
  };
}

function entry(t: number, at: number, travel: number): number {
  return ease.outCubic(phase(t, Math.max(0, at - travel), at));
}

function chip(
  ctx: Frame['ctx'], id: ItemId, x: number, restY: number, t: number, at: number,
  scale: 1 | 0.5, travel: number, seed: number, result = false, extraEvents: number[] = [],
) {
  const size = itemSize(id, scale);
  const p = entry(t, at, travel);
  const maxOffset = Math.max(0, restY - 24 - size.h / 2);
  const offset = Math.min(result ? 74 : 62, maxOffset);
  const y = restY - offset * (1 - p) + (t >= at ? Math.sin((t - at) * Math.PI * 2 / 1.15) * (result ? 9 : 8) : 0);
  const impact = squash(t, at, result ? 0.24 : 0.2, result ? 0.3 : 0.25);
  const bounce = result ? extraEvents.reduce((sum, eventAt) => {
    const age = t - eventAt;
    return sum + (age >= 0 ? 0.035 * Math.exp(-5.8 * age) * Math.sin(13 * age) : 0);
  }, 0) : 0;
  drawItem(ctx, id, { x, y, t, scale, alpha: p, sx: impact.sx + bounce, sy: impact.sy - bounce });
  if (result && t >= at && t < at + 0.48) {
    ring(ctx, x, y - size.h * 0.2, at, t, { r: 118, width: 12, duration: 0.42, color: PAL.gold1 });
    sparks(ctx, x, y - size.h * 0.2, at, t, { count: 6, seed, size: 8, duration: 0.44, color: PAL.gold1 });
  }
}

export const equationShot: ShotDef = {
  name: 'equation',
  stage: 'clean',
  describe: 'Two half-size item terms assemble above a full-size result, with each term named on a paper plate and a clear operator and equals sign. params: a, b, c (item ids; defaults share, cash, moneyBag), op (+|−|×, default +), labels (three strings or A|B|C, default A|B|C), who (actor id|none, default none). Events: 1 lands A; 2 lands B; 3 brings in the full-size result C; later events add small settling bounces.',
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame, dur = Math.max(0.05, frame.dur), t = clamp(frame.t, 0, dur), s = plan(props, dur);
    const extraEvents = eventsOf(props).slice(3, 6);
    const aSize = itemSize(s.a, 0.5), bSize = itemSize(s.b, 0.5), cSize = itemSize(s.c);
    const inputTravel = Math.min(0.82, Math.max(0.72, dur * 0.2));
    const resultTravel = Math.min(0.72, Math.max(0.48, dur * 0.18));
    const aX = 180;
    const bX = 540;
    const aY = 220;
    const bY = 220;
    const cX = clamp(500, 24 + cSize.w / 2, STAGE.w - 24 - cSize.w / 2);
    const cY = STAGE.floor - cSize.h / 2 - 18;
    const aLabelY = aY + aSize.h / 2 + 43;
    const bLabelY = bY + bSize.h / 2 + 43;
    const cLabelY = Math.min(790, cY + cSize.h / 2 + 38);
    const aLabelAt = Math.max(0, s.aAt - inputTravel);
    const bLabelAt = Math.max(0, s.bAt - inputTravel);
    const aProgress = entry(t, s.aAt, inputTravel);
    const bProgress = entry(t, s.bAt, inputTravel);
    const cProgress = entry(t, s.cAt, resultTravel);
    const equalsPop = ease.outBack(phase(t, Math.max(0, s.cAt - 0.18), Math.max(0.22, s.cAt + 0.08)));

    drawStage(ctx, { floorY: STAGE.floor, line: true, shadow: [{ x: cX, y: STAGE.floor - 3, w: 390 }] });
    // The two inputs are supporting terms; C is the single full-size hero object.
    chip(ctx, s.a, aX, aY, t, s.aAt, 0.5, inputTravel, frame.seed + 17);
    chip(ctx, s.b, bX, bY, t, s.bAt, 0.5, inputTravel, frame.seed + 31);

    label(ctx, s.op, STAGE.centre, 220, { variant: 'sign', maxWidth: 90, pop: ease.outBack(phase(t, 0.02, 0.28)) });

    chip(ctx, s.c, cX, cY, t, s.cAt, 1, resultTravel, frame.seed + 53, true, extraEvents);
    // Keep the equation mark in the clear space between the input row and result.
    const equalsX = Math.max(64, cX - cSize.w / 2 - 42);
    label(ctx, '=', equalsX, cY, { variant: 'sign', maxWidth: 78, pop: equalsPop });
    label(ctx, s.labels[2]!.toUpperCase(), cX, cLabelY, { variant: 'sign', maxWidth: 380, pop: ease.outBack(cProgress) });

    // Keep entrance labels synchronized while every settled item keeps moving gently.
    if (aProgress > 0.02 && aLabelAt <= t) label(ctx, s.labels[0]!.toUpperCase(), aX, aLabelY + (1 - aProgress) * 56, { variant: 'sign', maxWidth: 300, pop: ease.outBack(aProgress) });
    if (bProgress > 0.02 && bLabelAt <= t) label(ctx, s.labels[1]!.toUpperCase(), bX, bLabelY + (1 - bProgress) * 56, { variant: 'sign', maxWidth: 300, pop: ease.outBack(bProgress) });

    if (s.who !== 'none') {
      const actorBase = actorBounds({ who: s.who, x: 0, y: STAGE.floor, scale: 1, facing: 1 });
      const actorX = clamp(108, 24 - actorBase.left, 696 - actorBase.right);
      const keys: HedgyKey[] = [
        { at: 0, pose: 'think', expression: 'neutral', look: 'up' },
        { at: Math.min(0.12, dur), pose: 'point', expression: 'neutral', look: 'up' },
        { at: Math.max(0, s.aAt - 0.12), pose: 'point', expression: 'neutral', look: 'up' },
        { at: s.aAt, pose: 'lookup', expression: 'neutral', look: 'up' },
        { at: (s.aAt + s.bAt) / 2, pose: 'think', expression: 'neutral', look: 'up' },
        { at: Math.max(s.aAt + 0.2, s.bAt - 0.14), pose: 'tap', expression: 'neutral', look: 'up' },
        { at: s.bAt, pose: 'lookup', expression: 'neutral', look: 'up' },
        { at: (s.bAt + s.cAt) / 2, pose: 'point', expression: 'neutral', look: 'up' },
        { at: Math.max(0, s.cAt - 0.1), pose: 'point', expression: 'neutral', look: 'up' },
        { at: s.cAt, pose: 'celebrate', expression: 'happy', look: 'up' },
        { at: Math.min(dur, s.cAt + 0.34), pose: 'think', expression: 'happy', look: 'up' },
      ];
      if (s.aAt > 0.64) keys.push({ at: s.aAt / 2, pose: 'tap', expression: 'neutral', look: 'up' });
      for (let at = s.cAt + 0.78, index = 0; at < dur - 0.18; at += 0.55, index++) {
        keys.push({ at, pose: index % 2 ? 'think' : 'point', expression: 'happy', look: 'up' });
      }
      keys.sort((a, b) => a.at - b.at);
      drawActor(ctx, {
        who: s.who, x: actorX, y: STAGE.floor, scale: 1, facing: 1, time: t, look: 'up', keys,
        handTarget: { x: cX - cSize.w * 0.32, y: cY - cSize.h * 0.2 },
        reach: phase(t, s.cAt - 0.18, s.cAt + 0.22),
      });
    }
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const safeDur = Math.max(0.05, dur), s = plan(props, safeDur), p = props.params;
    const list: Cue[] = [
      cue(Math.max(0, s.aAt - 0.12), 'rustle', 0.65, 140),
      cue(s.aAt, 'thump', 1.35, 140),
      cue(Math.max(0, s.bAt - 0.12), 'slide', 0.7, 580),
      cue(s.bAt, 'land', 1.3, 580),
      cue(Math.max(0, s.cAt - 0.12), 'sub', 0.85, 470),
      cue(s.cAt, 'thump', 1.45, 470),
    ];
    if (pick(p, 'who', ACTOR_OPTIONS, 'none') !== 'none') list.push(cue(s.cAt + 0.14, 'footfall', 0.75, 108));
    else list.push(cue(s.cAt + 0.14, 'ding', 0.7, 470));
    for (const at of eventsOf(props).slice(3, 5)) list.push(cue(at, 'knock', 0.65, 470));
    return cuesIn(safeDur, list.slice(0, 8));
  },
};
