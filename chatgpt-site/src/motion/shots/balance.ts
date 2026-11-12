// balance — actors load two real items onto pans; the beam tips under their weight.
import type { Cue, Frame, ShotProps } from '../core.ts';
import type { HedgyKey } from '../actor/hedgy.ts';
import { clamp, ease, phase, squash } from '../kit/motion.ts';
import { Grid, PAL } from '../kit/pixel.ts';
import { drawSprite } from '../kit/sprite.ts';
import { drawStage, label } from '../kit/stage.ts';
import { ring, sparks } from '../kit/fx.ts';
import { ACTORS, STAGE, actorBounds, beats, cue, cuesIn, drawActor, drawItem, itemParam, itemSize, pick, type ActorId, type ItemId } from './common.ts';
import type { ShotDef } from './index.ts';

const MODES = ['balance', 'leverage'] as const;
const TILTS = ['left', 'right', 'level'] as const;
const ACTIONS = ['add', 'jump'] as const;
const BALANCE_BEAM = (() => {
  const g = new Grid(68, 12);
  g.poly([{ x: 0, y: 3 }, { x: 67, y: 3 }, { x: 63, y: 10 }, { x: 4, y: 10 }], PAL.ink);
  g.poly([{ x: 4, y: 4 }, { x: 63, y: 4 }, { x: 60, y: 8 }, { x: 7, y: 8 }], PAL.wood2);
  g.rect(8, 4, 52, 2, PAL.wood1).rect(31, 4, 4, 4, PAL.gold3);
  g.outline(PAL.ink);
  return g.sprite('balance:beam');
})();
const LEVERAGE_BEAM = (() => {
  const g = new Grid(72, 12);
  g.poly([{ x: 0, y: 3 }, { x: 71, y: 3 }, { x: 67, y: 10 }, { x: 4, y: 10 }], PAL.ink);
  g.poly([{ x: 4, y: 4 }, { x: 67, y: 4 }, { x: 64, y: 8 }, { x: 7, y: 8 }], PAL.wood2);
  g.rect(8, 4, 56, 2, PAL.wood1).rect(33, 4, 4, 4, PAL.gold3);
  g.outline(PAL.ink);
  return g.sprite('balance:long-beam');
})();
const FULCRUM = (() => {
  const g = new Grid(30, 28);
  g.poly([{ x: 15, y: 1 }, { x: 2, y: 25 }, { x: 28, y: 25 }], PAL.ink);
  g.poly([{ x: 15, y: 5 }, { x: 6, y: 23 }, { x: 24, y: 23 }], PAL.wood2);
  g.poly([{ x: 15, y: 6 }, { x: 15, y: 23 }, { x: 7, y: 23 }], PAL.wood1);
  g.rect(0, 24, 30, 4, PAL.ink).rect(3, 24, 24, 2, PAL.grey2);
  g.outline(PAL.ink);
  return g.sprite('balance:fulcrum');
})();
const PAN = (() => {
  const g = new Grid(38, 16);
  g.poly([{ x: 1, y: 2 }, { x: 36, y: 2 }, { x: 31, y: 14 }, { x: 7, y: 14 }], PAL.ink);
  g.poly([{ x: 4, y: 4 }, { x: 33, y: 4 }, { x: 29, y: 11 }, { x: 9, y: 11 }], PAL.gold3);
  g.poly([{ x: 5, y: 4 }, { x: 32, y: 4 }, { x: 28, y: 8 }, { x: 10, y: 8 }], PAL.gold1);
  g.rect(8, 12, 22, 2, PAL.gold4).outline(PAL.ink);
  return g.sprite('balance:pan');
})();
const ROPE = (() => new Grid(2, 10).rect(0, 0, 2, 10, PAL.ink).rect(1, 1, 1, 8, PAL.grey2).sprite('balance:rope'))();

function actorsFor(params: ShotProps['params']): ActorId[] {
  const raw = params?.actors;
  if (Array.isArray(raw)) return raw.filter((id): id is ActorId => typeof id === 'string' && (ACTORS as readonly string[]).includes(id)).slice(0, 2);
  const legacy = params?.who;
  if (typeof legacy === 'string') return legacy === 'none' ? [] : (ACTORS as readonly string[]).includes(legacy) ? [legacy as ActorId] : [];
  return ['hedgy', 'mouse'];
}
function labelsParam(params: ShotProps['params']): [string, string] {
  const raw = params?.labels;
  if (Array.isArray(raw)) return [String(raw[0] ?? '').trim().slice(0, 14), String(raw[1] ?? '').trim().slice(0, 14)];
  if (typeof raw === 'string') { const values = raw.split(/[|/]/); return [String(values[0] ?? '').trim().slice(0, 14), String(values[1] ?? '').trim().slice(0, 14)]; }
  return ['', ''];
}
interface Plan {
  mode: typeof MODES[number]; tilt: typeof TILTS[number]; left: ItemId; right: ItemId; actors: ActorId[];
  action: typeof ACTIONS[number]; actorSide: 'left' | 'right'; labels: [string, string]; leftAt: number; rightAt: number;
}
function plan(props: ShotProps, dur: number): Plan {
  const p = props.params, [leftAt, rightAt] = beats(props, dur, [0.37, 0.66]);
  return {
    mode: pick(p, 'mode', MODES, 'balance'), tilt: pick(p, 'tilt', TILTS, 'right'),
    left: itemParam(p, 'left', 'gold'), right: itemParam(p, 'right', 'coinStack'), actors: actorsFor(p),
    action: pick(p, 'action', ACTIONS, 'add'), actorSide: pick(p, 'actorSide', ['left', 'right'] as const, 'left'),
    labels: labelsParam(p), leftAt, rightAt: Math.min(dur, Math.max(rightAt, leftAt + Math.min(0.24, dur * 0.12))),
  };
}
function layout(mode: Plan['mode'], tilt: Plan['tilt']) {
  if (mode === 'leverage') {
    const longSide = tilt === 'left' ? 'left' : 'right', pivotCell = longSide === 'right' ? 18 : 54;
    return { beam: LEVERAGE_BEAM, pivotX: 144 + pivotCell * 6, pivotCell, leftX: 180, rightX: 540 };
  }
  return { beam: BALANCE_BEAM, pivotX: STAGE.centre, pivotCell: 34, leftX: 180, rightX: 540 };
}
function angleAt(t: number, s: Plan): number {
  const target = s.tilt === 'left' ? -0.18 : s.tilt === 'right' ? 0.18 : 0;
  const first = -0.1 * ease.outCubic(phase(t, s.leftAt - 0.06, s.leftAt + 0.36));
  const progress = ease.outCubic(phase(t, s.rightAt - 0.08, s.rightAt + 0.72));
  let angle = first + (target - first) * progress;
  for (const at of [s.leftAt, s.rightAt]) {
    const age = t - at;
    if (age >= 0) angle += 0.055 * Math.exp(-3.6 * age) * Math.sin(11 * age);
  }
  return clamp(angle + Math.sin(t * Math.PI * 2 / 1.12) * 0.022, -0.3, 0.3);
}
function loader(ctx: Frame['ctx'], who: ActorId, side: 'left' | 'right', t: number, at: number, target: { x: number; y: number }, action: Plan['action']) {
  const facing = side === 'left' ? 1 : -1, preferred = side === 'left' ? 220 : 500;
  const bounds = actorBounds({ who, x: 0, y: STAGE.floor, facing });
  const x = clamp(preferred, 50 - bounds.left, 670 - bounds.right);
  const arrival = ease.outCubic(phase(t, 0, 0.34)), hop = action === 'jump' ? Math.sin(phase(t, at - 0.14, at + 0.3) * Math.PI) * 66 : 0;
  const keys: HedgyKey[] = [
    { at: 0, pose: 'walk', expression: 'neutral' },
    { at: Math.max(0, at - 0.46), pose: 'carry', expression: 'determined' },
    { at: Math.max(0, at - 0.12), pose: action === 'jump' ? 'jump' : 'give', expression: 'determined' },
    { at, pose: action === 'jump' ? 'jump' : 'give', expression: 'happy' },
    { at: at + 0.28, pose: 'hold', expression: 'happy' },
    { at: at + 0.72, pose: 'think', expression: 'neutral' },
  ];
  const renderX = x + (side === 'left' ? -18 : 18) * (1 - arrival), renderY = STAGE.floor - hop;
  const current = actorBounds({ who, x: renderX, y: renderY, facing, time: t, keys });
  const correction = current.left < 28 ? 28 - current.left : current.right > 692 ? 692 - current.right : 0;
  drawActor(ctx, {
    who, x: renderX + correction, y: renderY,
    scale: 1, facing, time: t, look: 'up', keys, handTarget: target,
    reach: ease.outCubic(phase(t, at - 0.24, at + 0.12)),
  });
}
function loadItem(ctx: Frame['ctx'], id: ItemId, side: 'left' | 'right', x: number, panY: number, t: number, at: number, seed: number) {
  const scale = Math.min(0.5, (panY - 68) / itemSize(id).h, (x - 32) / itemSize(id).w, (688 - x) / itemSize(id).w);
  const size = itemSize(id, scale), restY = panY - 28 - size.h / 2;
  const p = ease.inOutCubic(phase(t, at - 0.48, at));
  if (t < at - 0.48) return;
  const startX = x + (side === 'left' ? 82 : -82), startY = restY - 112;
  const impact = squash(t, at, 0.22, 0.27);
  const bounce = t >= at ? Math.sin((t - at) * Math.PI * 2 / 0.82) * 3.5 * ease.outCubic(phase(t, at, at + 0.3)) : 0;
  ctx.save(); ctx.globalAlpha *= ease.outCubic(phase(t, at - 0.48, at - 0.12));
  drawItem(ctx, id, { x: startX + (x - startX) * p, y: startY + (restY - startY) * p + bounce, t, scale, sx: impact.sx, sy: impact.sy, rot: (1 - p) * (side === 'left' ? -0.06 : 0.06) });
  ctx.restore();
  if (t >= at && t < at + 0.38) {
    ring(ctx, x, panY - 25, at, t, { r: 50, width: 7, duration: 0.28, color: PAL.gold1 });
    sparks(ctx, x, panY - 32, at, t, { count: 4, seed, size: 6, duration: 0.32, color: PAL.gold1 });
  }
}

export const balanceShot: ShotDef = {
  name: 'balance',
  stage: 'clean',
  describe: 'Two actors carry real items onto separate balance pans; each landing pulls that side down and the beam rocks into its final tilt. leverage moves the pivot so a short-arm item counters a long-arm item. params: left, right (item ids; defaults gold, coinStack), mode (balance|leverage, default balance), tilt (final low side left|right|level, default right), actors (up to two actor ids; defaults hedgy and mouse), who (legacy single actor or none), action (add|jump, jump adds a hop on each landing), actorSide (side for a single actor), labels (optional short pan tags). Events: 1 = left item lands; 2 = right item lands; later events add settling knocks.',
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame, dur = Math.max(0.05, frame.dur), t = clamp(frame.t, 0, dur), s = plan(props, dur);
    const l = layout(s.mode, s.tilt), angle = angleAt(t, s);
    const pointY = (x: number) => 326 + Math.sin(angle) * (x - l.pivotX), panY = (x: number) => pointY(x) + 104;
    const leftY = panY(l.leftX), rightY = panY(l.rightX);
    drawStage(ctx, { floorY: STAGE.floor, line: true, shadow: [{ x: STAGE.centre, y: 582, w: 540 }] });
    drawSprite(ctx, FULCRUM, l.pivotX, 344, { anchor: [0.5, 0] });
    drawSprite(ctx, l.beam, l.pivotX, 326, { anchor: [l.pivotCell / (l.beam.w / 6), 0.5], rot: angle });
    for (const [x, y] of [[l.leftX, leftY], [l.rightX, rightY]] as const) {
      const endY = pointY(x), rot = angle * 0.72;
      drawSprite(ctx, ROPE, x - 48, endY + 30, { anchor: [0.5, 0], rot });
      drawSprite(ctx, ROPE, x + 48, endY + 30, { anchor: [0.5, 0], rot });
      drawSprite(ctx, PAN, x, y, { rot });
    }

    const cast = s.actors.map((who, index) => ({
      who, side: s.actors.length === 1 ? s.actorSide : index === 0 ? 'left' as const : 'right' as const,
      at: index === 0 ? s.leftAt : s.rightAt,
    }));
    for (const actor of cast) {
      const targetX = actor.side === 'left' ? l.leftX : l.rightX, targetY = actor.side === 'left' ? leftY : rightY;
      loader(ctx, actor.who, actor.side, t, actor.at, { x: targetX, y: targetY - 48 }, s.action);
    }
    loadItem(ctx, s.left, 'left', l.leftX, leftY, t, s.leftAt, frame.seed + 11);
    loadItem(ctx, s.right, 'right', l.rightX, rightY, t, s.rightAt, frame.seed + 23);
    if (s.labels[0]) label(ctx, s.labels[0], l.leftX, 206, { variant: 'tag', maxWidth: 150 });
    if (s.labels[1]) label(ctx, s.labels[1], l.rightX, 206, { variant: 'tag', maxWidth: 150 });
    for (const at of (props.events ?? []).slice(2, 5).map(event => event.at)) {
      if (t >= at && t < at + 0.38) ring(ctx, l.pivotX, 326, at, t, { r: 60, width: 7, duration: 0.32, color: PAL.gold1 });
    }
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const safeDur = Math.max(0.05, dur), s = plan(props, safeDur), l = layout(s.mode, s.tilt);
    const list: Cue[] = [
      cue(Math.max(0, s.leftAt - 0.22), 'footfall', 0.65, l.leftX - 80), cue(s.leftAt, 'thud', 1.35, l.leftX),
      cue(Math.max(0, s.rightAt - 0.22), 'footfall', 0.65, l.rightX + 80), cue(s.rightAt, 'land', 1.3, l.rightX),
      cue(s.leftAt + 0.1, 'creak', 0.6, l.pivotX), cue(s.rightAt + 0.12, 'creak', 0.9, l.pivotX),
      ...(props.events ?? []).slice(2, 4).map(event => cue(event.at, 'knock', 0.65, l.pivotX)),
    ];
    return cuesIn(safeDur, list);
  },
};
