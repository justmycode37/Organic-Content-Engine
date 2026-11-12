// Pressure builds in distinct ratchet steps. Items or short seller groups can
// be shown in a vise, or between a rising red floor and a descending bar.
import type { Cue, Frame, ShotProps } from '../core.ts';
import { clamp, ease, phase, squash, tween } from '../kit/motion.ts';
import { PAL } from '../kit/pixel.ts';
import { bar, drawStage, label, priceLine } from '../kit/stage.ts';
import { ring } from '../kit/fx.ts';
import { pressGap } from '../props/press.ts';
import { ACTORS, STAGE, beats, cue, cuesIn, drawActor, drawItem, itemSize, isItem, num, pick, type ActorId, type ItemId } from './common.ts';
import type { ShotDef } from './index.ts';

type Victim = { kind: 'item'; item: ItemId } | { kind: 'actors'; actors: ActorId[] };
interface Plan {
  steps: number;
  hits: number[];
  victim: Victim;
  who: string;
  mood: 'worried' | 'happy' | 'shocked';
  word: string;
  mode: 'vise' | 'walls';
}

const PRESS = { x: STAGE.centre, y: 455, w: 672, h: 720 };
const WALL_LINE = [
  { x: 42, y: 810 }, { x: 192, y: 790 }, { x: 360, y: 765 }, { x: 528, y: 735 }, { x: 678, y: 700 },
];
const isActor = (value: unknown): value is ActorId => typeof value === 'string' && (ACTORS as readonly string[]).includes(value);

function parseVictim(value: unknown): Victim {
  if (isItem(value)) return { kind: 'item', item: value };
  let actors: unknown[] = [];
  if (Array.isArray(value)) actors = value;
  else if (value && typeof value === 'object' && !Array.isArray(value)) {
    const group = (value as Record<string, unknown>).actors;
    if (Array.isArray(group)) actors = group;
  } else if (isActor(value)) actors = [value];
  const valid = actors.filter(isActor).slice(0, 3);
  return valid.length ? { kind: 'actors', actors: valid } : { kind: 'item', item: 'ticket' };
}

function plan(props: ShotProps, dur: number): Plan {
  const params = props.params;
  const steps = Math.round(num(params, 'steps', 3, 2, 3));
  const first = Math.min(0.18, Math.max(0.08, dur * 0.1));
  const interval = Math.min(0.48, Math.max(0.24, dur * 0.2));
  const fallback = Array.from({ length: steps }, (_, index) => Math.min(dur * 0.84, first + interval * index));
  const rawHits = beats(props, dur, fallback).sort((a, b) => a - b);
  const minGap = Math.min(0.16, Math.max(0.11, dur * 0.07));
  const hits: number[] = [];
  rawHits.forEach((raw, index) => {
    const lower = index === 0 ? 0.06 : hits[index - 1]! + minGap;
    const upper = Math.max(lower, dur - 0.24 - (steps - index - 1) * minGap);
    hits.push(Math.min(upper, Math.max(lower, raw)));
  });
  const rawWord = params?.word;
  const word = (typeof rawWord === 'string' ? rawWord : 'PRESSURE').trim().slice(0, 22).toUpperCase();
  return {
    steps, hits,
    victim: parseVictim(params?.victim),
    who: pick(params, 'who', [...ACTORS, 'none'] as const, 'hedgy'),
    mood: pick(params, 'mood', ['worried', 'happy', 'shocked'] as const, 'worried'),
    word,
    mode: pick(params, 'mode', ['vise', 'walls'] as const, 'vise'),
  };
}

function stepTarget(steps: number, index: number): number {
  return (steps === 2 ? [0.44, 0.86] : [0.3, 0.58, 0.87])[index]!;
}

function stepDuration(s: Plan, index: number): number {
  const next = s.hits[index + 1];
  if (next === undefined) return 0.42;
  return Math.min(0.42, Math.max(0.14, (next - s.hits[index]!) * 0.86));
}

function pressureEase(progress: number): number {
  const p = clamp(progress);
  return 0.5 - 0.5 * Math.cos(Math.PI * p);
}

function followThrough(t: number, s: Plan): number {
  const start = s.hits[s.steps - 1]! + 0.34;
  if (t <= start) return 0;
  return 0.5 - 0.5 * Math.cos((t - start) * Math.PI * 2 / 0.78);
}

function closeAt(t: number, s: Plan): number {
  const lastIndex = s.steps - 1, last = s.hits[lastIndex]!;
  let close = 0.035 + 0.035 * ease.outCubic(phase(t, 0.035, s.hits[0]!));
  for (let index = 0; index < s.steps; index++) {
    const at = s.hits[index]!, from = index ? stepTarget(s.steps, index - 1) : 0.07;
    if (t < at) break;
    close = tween(t, at, stepDuration(s, index), from, stepTarget(s.steps, index), pressureEase);
  }
  if (t > last + 0.3) {
    const held = phase(t, last + 0.3, last + 0.7);
    close += Math.sin((t - last) * Math.PI * 2 / 0.78) * 0.06 * ease.outCubic(held);
  }
  return clamp(close, 0.02, 0.92);
}

function actorKeys(s: Plan) {
  return [
    { at: 0, pose: 'shock' as const, expression: s.mood === 'happy' ? 'happy' as const : s.mood === 'shocked' ? 'shocked' as const : 'worried' as const },
    ...s.hits.map(at => ({ at, pose: 'squeezed' as const, expression: s.mood === 'happy' ? 'happy' as const : 'shocked' as const })),
  ];
}

function impactSquash(t: number, s: Plan): number {
  let amount = 0;
  for (const at of s.hits) {
    const hit = squash(t, at + 0.02, 0.22, 0.3);
    amount = Math.max(amount, 1 - hit.sx);
  }
  return amount;
}

function drawActorWithAlpha(ctx: Frame['ctx'], s: Plan, who: ActorId, x: number, y: number, facing: 1 | -1, t: number, alpha: number, pressure: number) {
  if (alpha <= 0.01) return;
  const strain = followThrough(t, s);
  ctx.save();
  ctx.globalAlpha *= alpha;
  drawActor(ctx, {
    who, x, y, facing, scale: 1, time: t, look: 'up', keys: actorKeys(s),
    squash: 1 - pressure * 0.045 - impactSquash(t, s) * 0.4 - strain * 0.06,
  });
  ctx.restore();
}

function actorCluster(ctx: Frame['ctx'], s: Plan, t: number, centreX: number, feetY: number, pressure: number) {
  if (s.victim.kind !== 'actors') return;
  const actors = s.victim.actors;
  if (actors.length === 1) {
    drawActorWithAlpha(ctx, s, actors[0]!, centreX, feetY, -1, t, 1, pressure);
    return;
  }

  // Two full-size victims fit cleanly at once. With a third id, the right-hand
  // place changes over to that actor at the second ratchet beat.
  const leftX = centreX - 132, rightX = centreX + 132;
  drawActorWithAlpha(ctx, s, actors[0]!, leftX, feetY, -1, t, 1, pressure);
  if (actors.length === 2) {
    drawActorWithAlpha(ctx, s, actors[1]!, rightX, feetY, 1, t, 1, pressure);
    return;
  }
  const changeAt = s.hits[1] ?? s.hits[0]! + 0.25;
  const swap = phase(t, changeAt - 0.12, changeAt + 0.12);
  drawActorWithAlpha(ctx, s, actors[1]!, rightX, feetY, 1, t, 1 - swap, pressure);
  drawActorWithAlpha(ctx, s, actors[2]!, rightX, feetY, 1, t, swap, pressure);
}

function drawStamp(ctx: Frame['ctx'], s: Plan, t: number) {
  if (!s.word) return;
  const at = s.hits[s.steps - 1]! + 0.14;
  const pop = ease.outBack(phase(t, at, at + 0.22));
  label(ctx, s.word, STAGE.centre, 145, {
    variant: 'stamp', maxWidth: 520,
    rot: -0.018 + (1 - clamp(pop)) * 0.025, pop,
  });
}

export const squeezeShot: ShotDef = {
  name: 'squeeze',
  stage: 'clean',
  describe: 'A vise ratchets down on an item or up to two full-size victims at a time; pressure increases in distinct steps before a red-on-paper word stamp lands. walls mode uses a rising price floor and descending bar. params: victim (item id, actor id, or 1–3 actor ids; default ticket), who (watching actor or none, default hedgy), mood (worried|happy|shocked, default worried), word (stamp, default PRESSURE; empty hides it), mode (vise|walls, default vise), steps (2|3, default 3). Events: 1–3 = successive pressure steps.',
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame, dur = Math.max(0.05, frame.dur), t = clamp(frame.t, 0, dur), s = plan(props, dur);
    const close = closeAt(t, s), pressure = clamp((close - 0.035) / 0.835);
    const showWatcher = s.who !== 'none' && (s.victim.kind === 'item' || s.victim.actors.length < 2);

    if (s.mode === 'vise') {
      drawStage(ctx, {
        floorY: STAGE.floor, line: true,
        shadow: [
          { x: STAGE.centre, y: PRESS.y + PRESS.h / 2 - 4, w: 590 },
          ...(showWatcher ? [{ x: 540, y: STAGE.floor + 4, w: 190 }] : []),
        ],
      });
      drawItem(ctx, 'press', { ...PRESS, t, scale: 1, close });
      const gap = pressGap({ ...PRESS, close });
      const centreX = gap.x + gap.w / 2;
      const feetY = gap.y + gap.h;

      if (s.victim.kind === 'item') {
        const strain = followThrough(t, s);
        const activeHit = [...s.hits].reverse().find(at => t >= at) ?? s.hits[0]!;
        const hit = squash(t, activeHit + 0.02, 0.2, 0.28);
        drawItem(ctx, s.victim.item, {
          x: centreX, y: gap.y + gap.h / 2, t, scale: 0.5,
          sx: 1 - pressure * 0.5 - strain * 0.08,
          sy: 1 + pressure * 0.08 + (1 - hit.sx) * 0.18 + strain * 0.07,
        });
      } else {
        actorCluster(ctx, s, t, centreX, feetY, pressure);
      }

      if (showWatcher) drawActor(ctx, {
        who: s.who, x: 540, y: STAGE.floor, facing: -1, look: 'up', scale: 1, time: t,
        keys: [
          { at: 0, pose: 'think', expression: 'worried' },
          { at: s.hits[0]!, pose: 'sweat', expression: 'worried' },
          { at: s.hits[s.steps - 1]! + 0.1, pose: s.mood === 'happy' ? 'celebrate' : 'panic', expression: s.mood === 'happy' ? 'happy' : 'shocked' },
        ],
      });

      s.hits.forEach(at => ring(ctx, centreX, feetY - 120, at, t, { r: 94, width: 12, color: PAL.gold2 }));
    } else {
      drawStage(ctx, { floorY: STAGE.floor, line: false });
      const floorPoints = WALL_LINE.map(point => ({ x: point.x, y: point.y - pressure * 18 }));
      priceLine(ctx, floorPoints, { width: 36, progress: 1, head: 'arrow', color: PAL.UP });
      bar(ctx, 40, 250 + close * 120, 640, 44, { progress: 1, color: PAL.blue3, background: PAL.blue4, direction: 'right' });

      if (s.victim.kind === 'item') {
        const strain = followThrough(t, s);
        const dims = itemSize(s.victim.item, 0.5);
        const itemX = 285, itemY = STAGE.floor - dims.h / 2 - 8;
        const activeHit = [...s.hits].reverse().find(at => t >= at) ?? s.hits[0]!;
        const hit = squash(t, activeHit + 0.02, 0.2, 0.28);
        drawItem(ctx, s.victim.item, {
          x: itemX, y: itemY, t, scale: 0.5,
          sx: 1 - pressure * 0.4 - strain * 0.08,
          sy: 1 + pressure * 0.08 + (1 - hit.sx) * 0.18 + strain * 0.07,
        });
      } else {
        actorCluster(ctx, s, t, STAGE.centre, STAGE.floor, pressure);
      }

      if (showWatcher) drawActor(ctx, {
        who: s.who, x: 560, y: STAGE.floor, facing: -1, look: 'up', scale: 1, time: t,
        keys: [{ at: 0, pose: 'think' }, { at: s.hits[0]!, pose: 'sweat' }, { at: s.hits[s.steps - 1]! + 0.1, pose: 'panic' }],
      });
      s.hits.forEach(at => ring(ctx, STAGE.centre, 565, at, t, { r: 94, width: 12, color: PAL.gold2 }));
    }

    drawStamp(ctx, s, t);
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const safeDur = Math.max(0.05, dur), s = plan(props, safeDur);
    const hitX = s.mode === 'vise' ? STAGE.centre : 360;
    return cuesIn(safeDur, [
      cue(0.02, 'creak', 0.7, hitX),
      ...s.hits.map((at, index) => cue(at, 'clunk', index === s.hits.length - 1 ? 1.45 : 1.2, hitX)),
      cue(s.hits[s.steps - 1]! + 0.13, 'whump', 1.15, hitX),
      ...(s.word ? [cue(s.hits[s.steps - 1]! + 0.14, 'stamp', 1.25, STAGE.centre)] : []),
    ]);
  },
};
