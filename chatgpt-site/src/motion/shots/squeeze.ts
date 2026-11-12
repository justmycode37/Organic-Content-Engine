// Pressure builds in distinct ratchet steps. Items or short seller groups can
// be shown in a vise, or between a rising red floor and a descending bar.
import type { Cue, Frame, ShotProps } from '../core.ts';
import { clamp, ease, phase, squash, tween } from '../kit/motion.ts';
import { Grid, PAL } from '../kit/pixel.ts';
import { drawSprite } from '../kit/sprite.ts';
import { bar, candles, drawStage, label } from '../kit/stage.ts';
import { ACTORS, STAGE, actorBounds, beats, cue, cuesIn, drawActor, drawItem, itemSize, isItem, num, pick, type ActorId, type ItemId } from './common.ts';
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
  chart: 'candles' | 'none';
}

const VISE = { x: STAGE.centre, left: 24, top: 632, bedTop: 656, width: 672, jawHeight: 150, jawStart: 175, jawTravel: 210 };
const isActor = (value: unknown): value is ActorId => typeof value === 'string' && (ACTORS as readonly string[]).includes(value);

const TOP_JAW = (() => {
  const g = new Grid(112, 25);
  g.round(1, 1, 110, 23, 3, PAL.ink);
  g.round(3, 2, 106, 19, 2, PAL.grey4);
  g.rect(5, 3, 102, 4, PAL.grey1);
  g.rect(4, 7, 104, 10, PAL.grey3);
  g.rect(4, 17, 104, 4, PAL.blue4);
  g.rect(6, 18, 100, 2, PAL.blue2);
  for (const x of [10, 25, 86, 101]) {
    g.round(x, 9, 5, 5, 1, PAL.ink);
    g.rect(x + 1, 10, 3, 2, PAL.grey1);
  }
  g.outline();
  return g.sprite('squeeze:top-jaw');
})();

const LOWER_BED = (() => {
  const g = new Grid(112, 35);
  // Fixed bottom jaw with two cast supports standing on the stage floor.
  g.rect(10, 20, 15, 12, PAL.ink); g.rect(12, 20, 11, 10, PAL.blue4); g.rect(13, 20, 3, 9, PAL.blue2);
  g.rect(87, 20, 15, 12, PAL.ink); g.rect(89, 20, 11, 10, PAL.blue4); g.rect(90, 20, 3, 9, PAL.blue2);
  g.round(6, 30, 100, 4, 1, PAL.ink); g.rect(9, 30, 94, 2, PAL.blue3);
  g.round(1, 4, 110, 21, 3, PAL.ink);
  g.round(3, 5, 106, 17, 2, PAL.blue4);
  g.rect(5, 6, 102, 4, PAL.grey1);
  g.rect(4, 10, 104, 8, PAL.grey3);
  g.rect(4, 18, 104, 3, PAL.grey5);
  g.rect(4, 21, 104, 2, PAL.blue2);
  for (const x of [10, 25, 86, 101]) {
    g.round(x, 9, 5, 5, 1, PAL.ink);
    g.rect(x + 1, 10, 3, 2, PAL.grey1);
  }
  g.outline();
  return g.sprite('squeeze:lower-bed');
})();

const SCREW = (() => {
  const g = new Grid(9, 88);
  g.round(2, 0, 5, 87, 2, PAL.ink);
  g.rect(3, 0, 2, 87, PAL.blue3);
  g.rect(4, 0, 1, 87, PAL.blue1);
  for (let y = 5; y < 84; y += 7) g.line({ x: 2, y }, { x: 7, y: y + 4 }, 2, PAL.grey5);
  g.outline();
  return g.sprite('squeeze:threaded-screw');
})();

const HANDLE = (() => {
  const g = new Grid(16, 16);
  g.line({ x: 8, y: 1 }, { x: 8, y: 15 }, 4, PAL.ink);
  g.line({ x: 1, y: 8 }, { x: 15, y: 8 }, 4, PAL.ink);
  g.line({ x: 8, y: 2 }, { x: 8, y: 14 }, 2, PAL.red2);
  g.line({ x: 2, y: 8 }, { x: 14, y: 8 }, 2, PAL.red2);
  g.ellipse(8, 8, 3, 3, PAL.gold2); g.ellipse(7.5, 7.5, 1, 1, PAL.gold1);
  g.outline();
  return g.sprite('squeeze:turn-handle');
})();

const SWEAT = (() => {
  const g = new Grid(7, 10);
  g.poly([{ x: 3.5, y: 0 }, { x: 1, y: 5 }, { x: 1, y: 7 }, { x: 3.5, y: 9 }, { x: 6, y: 7 }, { x: 6, y: 5 }], PAL.blue2);
  g.ellipse(3.5, 6.5, 1.6, 1.8, PAL.blue1);
  g.outline();
  return g.sprite('squeeze:sweat-drop');
})();

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
  const first = Math.min(0.14, Math.max(0.06, dur * 0.06));
  const interval = Math.min(0.4, Math.max(0.28, dur * 0.13));
  const fallback = Array.from({ length: steps }, (_, index) => Math.min(dur * 0.84, first + interval * index));
  const rawHits = beats(props, dur, fallback.map(at => at / dur)).sort((a, b) => a - b);
  const minGap = Math.min(0.16, Math.max(0.11, dur * 0.07));
  const hits: number[] = [];
  rawHits.forEach((raw, index) => {
    const lower = index === 0 ? 0.06 : hits[index - 1]! + minGap;
    const upper = Math.max(lower, dur - 0.24 - (steps - index - 1) * minGap);
    hits.push(Math.min(upper, Math.max(lower, raw)));
  });
  const rawWord = params?.word;
  const word = (typeof rawWord === 'string' ? rawWord : '').trim().slice(0, 22).toUpperCase();
  return {
    steps, hits,
    victim: parseVictim(params?.victim),
    who: pick(params, 'who', [...ACTORS, 'none'] as const, 'hedgy'),
    mood: pick(params, 'mood', ['worried', 'happy', 'shocked'] as const, 'worried'),
    word,
    mode: pick(params, 'mode', ['vise', 'walls'] as const, 'vise'),
    chart: pick(params, 'chart', ['candles', 'none'] as const, 'none'),
  };
}

function stepTarget(steps: number, index: number): number {
  return (steps === 2 ? [0.44, 0.86] : [0.3, 0.58, 0.87])[index]!;
}

function stepDuration(s: Plan, index: number): number {
  const next = s.hits[index + 1];
  if (next === undefined) return 0.42;
  return Math.min(0.2, Math.max(0.14, (next - s.hits[index]!) * 0.5));
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
  let close = 0.045 + 0.055 * ease.outCubic(phase(t, 0.02, s.hits[0]!));
  for (let index = 0; index < s.steps; index++) {
    const at = s.hits[index]!, from = index ? stepTarget(s.steps, index - 1) : 0.1;
    const previousAt = index ? s.hits[index - 1]! : at;
    const gap = at - previousAt;
    const anticipation = index ? Math.min(gap, Math.max(0.14, gap - stepDuration(s, index - 1) - 0.4)) : 0;
    const start = at - anticipation;
    if (t < start) break;
    close = tween(t, start, anticipation + stepDuration(s, index), from, stepTarget(s.steps, index), pressureEase);
  }
  if (t > last + 0.3) {
    const held = phase(t, last + 0.3, last + 0.7);
    const tremble = ease.outCubic(held);
    close += (Math.sin((t - last) * Math.PI * 2 / 0.54) * 0.1 - 0.07) * tremble;
  }
  return clamp(close, 0.02, 0.92);
}

function actorKeys(s: Plan) {
  const pressedExpression = s.mood === 'happy' ? 'happy' as const : 'shocked' as const;
  return [
    { at: 0, pose: 'shock' as const, expression: s.mood === 'happy' ? 'happy' as const : s.mood === 'shocked' ? 'shocked' as const : 'worried' as const },
    ...s.hits.map(at => ({ at, pose: 'sweat' as const, expression: pressedExpression })),
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
  const lastHit = s.hits[s.steps - 1]!;
  const trembleOn = ease.outCubic(phase(t, lastHit + 0.12, lastHit + 0.36));
  const tremble = t > lastHit + 0.12 ? Math.sin(t * Math.PI * 2 / 0.2 + x) * 2.8 * trembleOn : 0;
  const lift = t > lastHit + 0.12 ? Math.cos(t * Math.PI * 2 / 0.27 + x) * 1.8 * trembleOn : 0;
  const keys = actorKeys(s), squashAmount = Math.max(0.82, 1 - pressure * 0.08 - impactSquash(t, s) * 0.06 - strain * 0.035);
  const current = actorBounds({ who, x: x + tremble, y: y + lift, facing, time: t, keys, squash: squashAmount });
  const correction = current.left < 28 ? 28 - current.left : current.right > 692 ? 692 - current.right : 0;
  ctx.save();
  ctx.globalAlpha *= alpha;
  drawActor(ctx, {
    who, x: x + tremble + correction, y: y + lift, facing, scale: 1, time: t, look: 'up', keys,
    // Preserve the animal silhouette: at most 18% vertical squash and about
    // 10% horizontal spread, with the vise doing the visible pressing.
    squash: squashAmount,
  });
  ctx.restore();
}

function clusterPositions(actors: ActorId[]): { x: number; facing: 1 | -1 }[] {
  if (actors.length < 2) return actors.map(() => ({ x: STAGE.centre, facing: 1 }));
  const left = actorBounds({ who: actors[0]!, x: 0, y: 0, facing: 1 });
  const right = actorBounds({ who: actors[1]!, x: 0, y: 0, facing: -1 });
  const leftW = left.right - left.left, rightW = right.right - right.left, gap = 18;
  const start = clamp(STAGE.centre - (leftW + gap + rightW) / 2, 32, 688 - leftW - gap - rightW);
  return [
    { x: start - left.left, facing: 1 },
    { x: start + leftW + gap - right.left, facing: -1 },
  ];
}

function actorCluster(ctx: Frame['ctx'], s: Plan, t: number, feetY: number, pressure: number) {
  if (s.victim.kind !== 'actors') return;
  const actors = s.victim.actors;
  if (actors.length === 1) {
    drawActorWithAlpha(ctx, s, actors[0]!, STAGE.centre, feetY, 1, t, 1, pressure);
    return;
  }

  const [left, right] = clusterPositions(actors);
  drawActorWithAlpha(ctx, s, actors[0]!, left!.x, feetY, left!.facing, t, 1, pressure);
  if (actors.length === 2) {
    drawActorWithAlpha(ctx, s, actors[1]!, right!.x, feetY, right!.facing, t, 1, pressure);
    return;
  }
  const changeAt = s.hits[1] ?? s.hits[0]! + 0.25;
  const leave = phase(t, changeAt, changeAt + 0.1);
  const enter = phase(t, changeAt + 0.12, changeAt + 0.28);
  if (t < changeAt + 0.1) drawActorWithAlpha(ctx, s, actors[1]!, right!.x, feetY, right!.facing, t, 1 - leave, pressure);
  if (t >= changeAt + 0.12) drawActorWithAlpha(ctx, s, actors[2]!, right!.x, feetY, right!.facing, t, enter, pressure);
}

function drawSweat(ctx: Frame['ctx'], x: number, feetY: number, t: number, pressure: number, facingSide: 1 | -1, start: number) {
  if (pressure < 0.12) return;
  if (t < start) return;
      const atX = x + facingSide * 82;
  for (let i = 0; i < 2; i++) {
    const p = ((t - start + i * 0.24) % 0.48) / 0.48;
    const atY = feetY - 248 + p * 64;
    drawSprite(ctx, SWEAT, atX + facingSide * p * 8, atY, {
      scale: (i === 0 ? 0.86 : 0.62) * (1 - p * 0.12),
      rot: facingSide * (0.18 + p * 0.3), alpha: 0.8 * (1 - p * 0.48),
    });
  }
}

const VISE_SCALE = 0.84;
function drawViseBack(ctx: Frame['ctx']) {
  drawSprite(ctx, SCREW, VISE.x + 225, 112, { anchor: [0.5, 0] });
  drawSprite(ctx, LOWER_BED, VISE.x, VISE.top, { anchor: [0.5, 0], scale: VISE_SCALE });
}

function drawViseJaw(ctx: Frame['ctx'], t: number, close: number, trembleAt: number) {
  const jawY = VISE.jawStart + close * VISE.jawTravel;
  drawSprite(ctx, TOP_JAW, VISE.x, jawY, { scale: VISE_SCALE });
  const ratchet = Math.sin(t * Math.PI * 2 / 0.12) * phase(t, trembleAt, trembleAt + 0.24);
  drawSprite(ctx, HANDLE, VISE.x + 225, jawY, { rot: close * Math.PI * 4 + ratchet * 0.03 });
}

function drawStamp(ctx: Frame['ctx'], s: Plan, t: number) {
  if (!s.word) return;
  const at = s.hits[s.steps - 1]!;
  if (t < at - 0.12) return;
  const land = ease.outCubic(phase(t, at - 0.12, at));
  const pulse = t >= at ? 1 + 0.055 * Math.sin((t - at) * Math.PI * 2 / 0.64) : 1;
  const pop = (0.48 + land * 0.6) * pulse;
  label(ctx, s.word, STAGE.centre, 145, {
    variant: 'stamp', maxWidth: 520,
    rot: -0.11 + land * 0.092 + (pulse - 1) * 0.18, pop,
  });
}

function drawWatcher(ctx: Frame['ctx'], s: Plan, t: number, preferred: number, facing: 1 | -1, look: 'up' | 'forward') {
  const keys = [
    { at: 0, pose: 'think' as const, expression: 'worried' as const },
    { at: s.hits[0]!, pose: 'sweat' as const, expression: 'worried' as const },
    { at: s.hits[s.steps - 1]! + 0.1, pose: s.mood === 'happy' ? 'celebrate' as const : 'panic' as const, expression: s.mood === 'happy' ? 'happy' as const : 'shocked' as const },
  ];
  const base = actorBounds({ who: s.who as ActorId, x: 0, y: STAGE.floor, facing });
  const x = clamp(preferred, 32 - base.left, 688 - base.right);
  const current = actorBounds({ who: s.who as ActorId, x, y: STAGE.floor, facing, time: t, keys });
  const correction = current.left < 28 ? 28 - current.left : current.right > 692 ? 692 - current.right : 0;
  drawActor(ctx, { who: s.who, x: x + correction, y: STAGE.floor, facing, look, scale: 1, time: t, keys });
}

export const squeezeShot: ShotDef = {
  name: 'squeeze',
  stage: 'clean',
  describe: 'A steel vise ratchets down onto one real item or one to three actors; the item visibly flattens or two actors huddle and strain as the screw turns, with a third actor replacing the right-side victim at press 2. An optional word stamp lands on the final press, and an optional candle strip appears at the side. params: victim (item id or 1–3 actor ids; default ticket), who (watching actor or none, default hedgy), mood (worried|happy|shocked, default worried), word (optional short stamp; default empty), mode (vise|walls, default vise), steps (2|3, default 3), chart (candles|none, default none). Events: 1–3 = successive presses; later events add a small settling shake.',
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame, dur = Math.max(0.05, frame.dur), t = clamp(frame.t, 0, dur), s = plan(props, dur);
    const close = closeAt(t, s), pressure = clamp((close - 0.035) / 0.835);
    const showWatcher = s.who !== 'none' && (s.victim.kind === 'actors' ? s.victim.actors.length < 2 : itemSize(s.victim.item).w <= 300);

    if (s.mode === 'vise') {
      const jawBottom = VISE.jawStart + close * VISE.jawTravel + VISE.jawHeight / 2;
      const bedTop = VISE.bedTop;
      const gap = bedTop - jawBottom;
      drawStage(ctx, {
        floorY: STAGE.floor, line: true,
        shadow: [
          { x: STAGE.centre, y: STAGE.floor + 4, w: 590 },
          ...(showWatcher ? [{ x: 112, y: STAGE.floor + 4, w: 190 }] : []),
        ],
      });
      drawViseBack(ctx);

      if (s.victim.kind === 'item') {
        const strain = followThrough(t, s);
        const lastHit = s.hits[s.steps - 1]!;
        const rattle = ease.outCubic(phase(t, lastHit + 0.12, lastHit + 0.36));
        const itemShakeX = Math.sin(t * Math.PI * 2 / 0.18) * 10 * rattle;
        const itemShakeY = Math.cos(t * Math.PI * 2 / 0.24) * 3 * rattle;
        const activeHit = [...s.hits].reverse().find(at => t >= at) ?? s.hits[0]!;
        const hit = squash(t, activeHit + 0.02, 0.2, 0.28);
        const dims = itemSize(s.victim.item, 1);
        const itemX = showWatcher && dims.w <= 420 ? STAGE.centre + 65 : STAGE.centre;
        const itemScaleY = Math.max(0.18, Math.min(1 - pressure * 0.18 - strain * 0.03, (gap - 18) / dims.h));
        drawItem(ctx, s.victim.item, {
          x: itemX + itemShakeX, y: (jawBottom + bedTop) / 2 + itemShakeY, t, scale: 1,
          rot: Math.sin(t * Math.PI * 2 / 0.3) * 0.04 * rattle,
          sx: Math.min(1.15, 1 + pressure * 0.08 + (1 - hit.sx) * 0.08 + rattle * 0.025),
          sy: Math.max(0.78, itemScaleY + (1 - hit.sx) * 0.04 + strain * 0.02 + Math.sin(t * Math.PI * 2 / 0.24) * 0.015 * rattle),
        });
        if (showWatcher) drawWatcher(ctx, s, t, 112, 1, 'forward');
      } else {
        actorCluster(ctx, s, t, bedTop, pressure);
      }

    } else {
      drawStage(ctx, { floorY: STAGE.floor, line: false });
      let pressureBarY = 470;

      if (s.victim.kind === 'item') {
        const strain = followThrough(t, s);
        const dims = itemSize(s.victim.item, 1);
        const itemX = STAGE.centre, itemY = STAGE.floor - dims.h / 2 - 8;
        const itemScale = Math.min(1, 660 / dims.w, 760 / dims.h);
        const itemTop = itemY - dims.h * itemScale / 2;
        pressureBarY = itemTop - 220 + pressure * 218;
        const activeHit = [...s.hits].reverse().find(at => t >= at) ?? s.hits[0]!;
        const hit = squash(t, activeHit + 0.02, 0.2, 0.28);
        drawItem(ctx, s.victim.item, {
          x: itemX, y: itemY, t, scale: itemScale,
          sx: Math.min(1.15, 1 + pressure * 0.08),
          sy: Math.max(0.78, 1 - pressure * 0.18 - strain * 0.03 + (1 - hit.sx) * 0.04),
        });
      } else {
        pressureBarY = 270 + pressure * 190;
        actorCluster(ctx, s, t, STAGE.floor, pressure);
      }

      // The bar descends onto the item or actors so its pressure has a visible target.
      bar(ctx, 40, pressureBarY, 640, 44, { progress: 1, color: PAL.blue3, background: PAL.blue4, direction: 'right' });
      if (showWatcher) drawWatcher(ctx, s, t, 620, -1, 'up');
    }

    if (s.mode === 'vise') {
      drawViseJaw(ctx, t, close, s.hits[s.steps - 1]! + 0.12);
      const sweatStart = s.hits[0]! + 0.18;
      if (s.victim.kind === 'actors') {
      if (s.victim.actors.length > 1) {
          const positions = clusterPositions(s.victim.actors);
          drawSweat(ctx, positions[0]!.x, s.mode === 'vise' ? VISE.bedTop : STAGE.floor, t, pressure, -1, sweatStart);
          drawSweat(ctx, positions[1]!.x, s.mode === 'vise' ? VISE.bedTop : STAGE.floor, t, pressure, 1, sweatStart);
        } else drawSweat(ctx, STAGE.centre, VISE.bedTop, t, pressure, 1, sweatStart);
      }
    } else if (s.victim.kind === 'actors') {
      const sweatStart = s.hits[0]! + 0.18;
      if (s.victim.actors.length > 1) {
        const positions = clusterPositions(s.victim.actors);
        drawSweat(ctx, positions[0]!.x, STAGE.floor, t, pressure, -1, sweatStart);
        drawSweat(ctx, positions[1]!.x, STAGE.floor, t, pressure, 1, sweatStart);
      } else drawSweat(ctx, STAGE.centre, STAGE.floor, t, pressure, 1, sweatStart);
    }
    // Keep the mini candle column inside the frame with a little right margin.
    if (s.chart === 'candles') candles(ctx, 568, 548, 126, 184, {
      closes: 'up', count: s.steps, revealAt: s.hits.map(at => Math.max(-0.2, at - 0.18)),
      revealDuration: 0.30, t, seed: frame.seed, colorUp: PAL.DOWN, colorDown: PAL.UP,
    });
    drawStamp(ctx, s, t);
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const safeDur = Math.max(0.05, dur), s = plan(props, safeDur);
    const hitX = s.mode === 'vise' ? STAGE.centre : 360;
    return cuesIn(safeDur, [
      cue(0.02, 'creak', 0.7, hitX),
      ...s.hits.map((at, index) => cue(at, 'clunk', index === s.hits.length - 1 ? 1.45 : 1.2, hitX)),
      cue(s.hits[s.steps - 1]!, 'whump', 1.15, hitX),
      ...(s.word ? [cue(s.hits[s.steps - 1]!, 'stamp', 1.25, STAGE.centre)] : []),
    ]);
  },
};
