// equation — two actors feed real objects through a machine; a third item comes out.
import type { Cue, Frame, ShotProps } from '../core.ts';
import { clamp, ease, phase, squash } from '../kit/motion.ts';
import { Grid, PAL } from '../kit/pixel.ts';
import { drawSprite } from '../kit/sprite.ts';
import { drawStage, label } from '../kit/stage.ts';
import { ring, sparks } from '../kit/fx.ts';
import { ACTORS, STAGE, actorBounds, beats, cue, cuesIn, drawActor, drawItem, itemParam, itemSize, pick, type ActorId, type ItemId } from './common.ts';
import type { ShotDef } from './index.ts';

const OPS = ['+', '−', '-', '×', 'x', 'X'] as const;
const GEAR = (() => {
  const g = new Grid(16, 16);
  g.ellipse(8, 8, 7, 7, PAL.ink).ellipse(8, 8, 5, 5, PAL.grey3);
  for (const [x, y] of [[8, 0], [8, 12], [0, 8], [12, 8], [3, 3], [11, 3], [3, 11], [11, 11]]) g.rect(x, y, 4, 4, PAL.ink);
  g.ellipse(8, 8, 2, 2, PAL.gold2).outline(PAL.ink);
  return g.sprite('equation:machine-gear');
})();
const MACHINE = (() => {
  const g = new Grid(64, 42);
  g.rect(5, 4, 54, 34, PAL.ink);
  g.rect(7, 6, 50, 30, PAL.grey4);
  g.rect(9, 8, 46, 24, PAL.grey3);
  g.rect(10, 8, 44, 4, PAL.grey1);
  g.rect(12, 32, 40, 5, PAL.grey5);
  g.rect(14, 36, 8, 5, PAL.ink).rect(46, 36, 8, 5, PAL.ink);
  // Two visible feed throats and one low output hatch.
  g.rect(14, 11, 13, 7, PAL.ink).rect(16, 12, 9, 4, PAL.blue3);
  g.rect(37, 11, 13, 7, PAL.ink).rect(39, 12, 9, 4, PAL.blue3);
  g.rect(25, 19, 14, 13, PAL.ink).rect(27, 21, 10, 9, PAL.grey5);
  g.rect(29, 22, 6, 7, PAL.gold3);
  g.rect(11, 24, 9, 3, PAL.grey1).rect(44, 24, 9, 3, PAL.grey1);
  g.rect(14, 29, 36, 2, PAL.blue2);
  g.outline(PAL.ink);
  return g.sprite('equation:feed-machine');
})();
const ROLLER = (() => {
  const g = new Grid(22, 8);
  g.rect(1, 1, 20, 6, PAL.ink).rect(2, 2, 18, 4, PAL.grey4);
  for (let x = 4; x < 20; x += 4) g.rect(x, 2, 2, 4, PAL.grey1);
  g.outline(PAL.ink);
  return g.sprite('equation:output-roller');
})();

function actorsFor(params: ShotProps['params']): ActorId[] {
  const raw = params?.actors;
  if (Array.isArray(raw)) return raw.filter((id): id is ActorId => typeof id === 'string' && (ACTORS as readonly string[]).includes(id)).slice(0, 2);
  const legacy = params?.who;
  if (typeof legacy === 'string') return legacy === 'none' ? [] : (ACTORS as readonly string[]).includes(legacy) ? [legacy as ActorId] : [];
  return ['hedgy', 'mouse'];
}
function labelsParam(params: ShotProps['params']): [string, string, string] {
  const raw = params?.labels;
  const fallback = ['', '', ''];
  const values = Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' ? raw.split(/[|/]/) : fallback;
  return [0, 1, 2].map(i => String(values[i] ?? '').trim().slice(0, 14)) as [string, string, string];
}
interface Plan {
  a: ItemId; b: ItemId; c: ItemId; op: '+' | '−' | '×'; actors: ActorId[]; labels: [string, string, string];
  aAt: number; bAt: number; cAt: number; extra: number[];
}
function plan(props: ShotProps, dur: number): Plan {
  const p = props.params, [first, second, third] = beats(props, dur, [0.24, 0.48, 0.72]);
  const gap = Math.min(0.24, dur * 0.16);
  const aAt = first, bAt = Math.min(dur, Math.max(second, first + gap)), cAt = Math.min(dur, Math.max(third, bAt + gap));
  const requested = pick(p, 'op', OPS, '+');
  return {
    a: itemParam(p, 'a', 'share'), b: itemParam(p, 'b', 'cash'), c: itemParam(p, 'c', 'moneyBag'),
    op: requested === '-' ? '−' : requested === 'x' || requested === 'X' ? '×' : requested as '+' | '−' | '×',
    actors: actorsFor(p), labels: labelsParam(p), aAt, bAt, cAt,
    extra: [...(props.events ?? [])].slice(3, 6).map(event => Math.max(0, event.at)),
  };
}
const approach = (t: number, at: number) => ease.outCubic(phase(t, at - 0.48, at));
function flight(ctx: Frame['ctx'], id: ItemId, startX: number, slotX: number, t: number, at: number, seed: number, scale = 0.46) {
  if (t < at - 0.48) return;
  const move = approach(t, at), enter = ease.outCubic(phase(t, at - 0.48, at - 0.18));
  const swallowed = ease.inOutCubic(phase(t, at - 0.04, at + 0.2));
  const fromY = 445, slotY = 556;
  const x = startX + (slotX - startX) * move + (slotX > startX ? 1 : -1) * swallowed * 16;
  const y = fromY + (slotY - fromY) * move + Math.sin(move * Math.PI) * 28 - swallowed * 42;
  const size = itemSize(id, scale), hit = squash(t, at, 0.22, 0.24);
  const alpha = t < at ? enter : 1 - ease.outCubic(phase(t, at + 0.06, at + 0.22));
  if (alpha <= 0.01) return;
  ctx.save(); ctx.globalAlpha *= alpha;
  drawItem(ctx, id, { x, y, t, scale: scale * (1 - swallowed * 0.28), sx: hit.sx, sy: hit.sy, rot: (1 - move) * 0.05 });
  ctx.restore();
  if (t >= at && t < at + 0.46) {
    ring(ctx, slotX, slotY - size.h * 0.08, at, t, { r: 54, width: 7, duration: 0.34, color: PAL.gold1 });
    sparks(ctx, slotX, slotY - 18, at, t, { count: 4, seed, size: 6, duration: 0.3, color: PAL.gold1 });
  }
}
function actorAt(ctx: Frame['ctx'], who: ActorId, side: 'left' | 'right', t: number, at: number, target: { x: number; y: number }, outputAt: number, removesItem = false) {
  const facing = side === 'left' ? 1 : -1;
  const preferred = side === 'left' ? 190 : 530;
  const base = actorBounds({ who, x: 0, y: STAGE.floor, facing });
  const x = clamp(preferred, 46 - base.left, 674 - base.right);
  const approach = ease.outCubic(phase(t, at - 0.48, at - 0.12));
  const keys = [
    { at: 0, pose: 'walk' as const, expression: 'neutral' as const },
    { at: Math.max(0, at - 0.46), pose: 'carry' as const, expression: 'determined' as const },
    { at: Math.max(0, at - 0.12), pose: removesItem ? 'receive' as const : 'push' as const, expression: 'determined' as const },
    { at, pose: removesItem ? 'hold' as const : 'give' as const, expression: 'happy' as const },
    { at: at + 0.3, pose: 'hold' as const, expression: 'neutral' as const },
    { at: Math.max(at + 0.35, outputAt - 0.18), pose: 'receive' as const, expression: 'shocked' as const },
    { at: outputAt + 0.22, pose: 'celebrate' as const, expression: 'happy' as const },
  ].sort((a, b) => a.at - b.at);
  const renderX = x + (side === 'left' ? 14 : -14) * (1 - approach);
  const current = actorBounds({ who, x: renderX, y: STAGE.floor, facing, time: t, keys });
  const correction = current.left < 28 ? 28 - current.left : current.right > 692 ? 692 - current.right : 0;
  drawActor(ctx, {
    who, x: renderX + correction, y: STAGE.floor, facing, scale: 1, time: t,
    look: 'up', keys, handTarget: target, reach: ease.outCubic(phase(t, at - 0.18, at + 0.12)),
  });
}

export const equationShot: ShotDef = {
  name: 'equation',
  stage: 'clean',
  describe: 'Two actors carry real items into a feed machine one at a time; its gear turns, then a third item rises from the output hatch. op (+|−|×) changes the machine cycle: both items feed in, the second is pulled back out, or the first makes a duplicate pass; no floating math marks. params: a, b, c (item ids; defaults share, cash, moneyBag), op (+|−|×, default +), actors (up to two actor ids; defaults hedgy and mouse), who (legacy single actor or none), labels (three optional short words on feed plates). Events: 1 = actor feeds A; 2 = actor feeds or removes B; 3 = C rises from the hatch; later events bounce the output.',
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame, dur = Math.max(0.05, frame.dur), t = clamp(frame.t, 0, dur), s = plan(props, dur);
    const slotL = 300, slotR = 420, outputAt = s.cAt;
    const aScale = Math.min(0.46, 172 / itemSize(s.a).w, 210 / itemSize(s.a).h);
    const bScale = Math.min(0.46, 172 / itemSize(s.b).w, 210 / itemSize(s.b).h);
    const outScale = Math.min(1, 660 / itemSize(s.c).w, 760 / itemSize(s.c).h);
    const outProgress = ease.outBack(phase(t, outputAt - 0.24, outputAt + 0.18));
    const outputY = 420 + (1 - outProgress) * 142 + (t >= outputAt ? Math.sin((t - outputAt) * Math.PI * 2 / 0.86) * 6 : 0);
    const active = ease.outCubic(phase(t, s.aAt, s.cAt + 0.2));
    drawStage(ctx, { floorY: STAGE.floor, line: true, shadow: [{ x: STAGE.centre, y: 752, w: 490 }, { x: 360, y: 772, w: 440, h: 20 }] });
    drawSprite(ctx, MACHINE, STAGE.centre, 632, { anchor: [0.5, 0.5] });
    drawSprite(ctx, ROLLER, 360, 775, { anchor: [0.5, 0.5], rot: Math.sin(t * Math.PI * 2 / 0.36) * 0.06 });
    drawSprite(ctx, GEAR, 494, 620, { anchor: [0.5, 0.5], rot: t * (s.op === '×' ? 5.2 : s.op === '−' ? -3.2 : 3.8) * active });
    drawSprite(ctx, GEAR, 226, 620, { anchor: [0.5, 0.5], rot: -t * 3.4 * active });

    const leftActor = s.actors[0], rightActor = s.actors[1];
    if (leftActor) actorAt(ctx, leftActor, 'left', t, s.aAt, { x: slotL, y: 506 }, outputAt);
    if (rightActor) actorAt(ctx, rightActor, 'right', t, s.bAt, s.op === '−' ? { x: 560, y: 500 } : { x: slotR, y: 506 }, outputAt, s.op === '−');
    if (s.labels[0]) label(ctx, s.labels[0], slotL, 458, { variant: 'tag', maxWidth: 160 });
    if (s.labels[1]) label(ctx, s.labels[1], slotR, 458, { variant: 'tag', maxWidth: 160 });

    flight(ctx, s.a, 180, slotL, t, s.aAt, frame.seed + 17, aScale);
    const removeB = s.op === '−';
    if (!removeB) flight(ctx, s.b, 540, slotR, t, s.bAt, frame.seed + 31, bScale);
    else if (t >= s.bAt - 0.48 && t < s.bAt + 0.28) {
      const p = ease.outCubic(phase(t, s.bAt - 0.48, s.bAt + 0.28));
      const alpha = 1 - ease.outCubic(phase(t, s.bAt + 0.04, s.bAt + 0.28));
      const exitScale = Math.min(bScale, 132 / itemSize(s.b).w, 150 / itemSize(s.b).h);
      ctx.save(); ctx.globalAlpha *= alpha;
      drawItem(ctx, s.b, { x: 530 + p * 88, y: 445 + p * 125, t, scale: bScale + (exitScale - bScale) * p, rot: p * 0.18 });
      ctx.restore();
    }
    if (s.op === '×' && t >= s.aAt + 0.08 && t < s.bAt + 0.16) {
      const p = ease.outCubic(phase(t, s.aAt + 0.08, s.aAt + 0.32));
      const alpha = p * (1 - ease.outCubic(phase(t, s.bAt - 0.04, s.bAt + 0.16)));
      ctx.save(); ctx.globalAlpha *= alpha;
      drawItem(ctx, s.a, { x: 360, y: 542 + Math.sin(t * 18) * 4, t, scale: aScale * 0.68, rot: Math.sin(t * 12) * 0.04 });
      ctx.restore();
    }
    if (t >= outputAt - 0.28) {
      ctx.save(); ctx.globalAlpha *= ease.outCubic(phase(t, outputAt - 0.28, outputAt - 0.04));
      drawItem(ctx, s.c, { x: STAGE.centre, y: outputY, t, scale: outScale, rot: Math.sin((t - outputAt) * 5) * 0.025 });
      ctx.restore();
      for (const at of s.extra) if (t >= at && t < at + 0.5) {
        ring(ctx, STAGE.centre, outputY - 22, at, t, { r: 76, width: 9, duration: 0.38, color: PAL.gold1 });
      }
      if (t >= outputAt && t < outputAt + 0.5) {
        sparks(ctx, STAGE.centre, outputY - 42, outputAt, t, { count: 5, seed: frame.seed + 53, size: 7, duration: 0.42, color: PAL.gold1 });
      }
    }
    // The wheel keeps turning and the output belt keeps crawling after the reveal.
    if (t > s.cAt + 0.35) drawSprite(ctx, ROLLER, 360, 775, { anchor: [0.5, 0.5], rot: t * 0.08 });
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const safeDur = Math.max(0.05, dur), s = plan(props, safeDur);
    return cuesIn(safeDur, [
      cue(Math.max(0, s.aAt - 0.15), 'footfall', 0.7, 180), cue(s.aAt, 'clunk', 1.15, 300),
      cue(Math.max(0, s.bAt - 0.15), 'footfall', 0.7, 540), cue(s.bAt, s.op === '−' ? 'slide' : 'clunk', 1.2, 420),
      cue(Math.max(0, s.cAt - 0.12), 'rise', 0.8, 360), cue(s.cAt, 'thump', 1.4, 360),
      ...s.extra.map(at => cue(at, 'knock', 0.65, 360)),
    ].slice(0, 8));
  },
};
