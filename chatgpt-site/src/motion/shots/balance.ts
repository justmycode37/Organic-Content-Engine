// balance — two weighted pans tip a pixel lever; leverage uses an asymmetric beam.
import type { Cue, Frame, ShotProps } from '../core.ts';
import type { HedgyKey } from '../actor/hedgy.ts';
import { clamp, ease, phase, squash } from '../kit/motion.ts';
import { Grid, PAL } from '../kit/pixel.ts';
import { drawSprite } from '../kit/sprite.ts';
import { drawStage, label } from '../kit/stage.ts';
import { ring, sparks } from '../kit/fx.ts';
import { ACTORS, STAGE, actorBounds, beats, cue, cuesIn, drawActor, drawItem, itemParam, itemSize, pick, type ItemId } from './common.ts';
import type { ShotDef } from './index.ts';

const ACTOR_OPTIONS = [...ACTORS, 'none'] as const;
const MODES = ['balance', 'leverage'] as const;
const TILTS = ['left', 'right', 'level'] as const;
const ACTIONS = ['add', 'jump'] as const;

const beamSprite = (key: string, cells: number) => {
  const g = new Grid(cells, 12);
  g.poly([{ x: 0, y: 3 }, { x: cells - 1, y: 3 }, { x: cells - 4, y: 10 }, { x: 4, y: 10 }], PAL.ink);
  g.poly([{ x: 4, y: 4 }, { x: cells - 5, y: 4 }, { x: cells - 7, y: 8 }, { x: 6, y: 8 }], PAL.wood2);
  g.rect(8, 4, cells - 18, 2, PAL.wood1);
  g.rect(cells - 11, 5, 3, 3, PAL.wood3);
  g.outline(PAL.ink);
  return g.sprite(key);
};
const BALANCE_BEAM = beamSprite('shot:balance:beam:symmetric', 68);
const LEVERAGE_BEAM = beamSprite('shot:balance:beam:long-arm', 72);

const FULCRUM = (() => {
  const g = new Grid(30, 28);
  g.poly([{ x: 15, y: 1 }, { x: 2, y: 25 }, { x: 28, y: 25 }], PAL.ink);
  g.poly([{ x: 15, y: 5 }, { x: 6, y: 23 }, { x: 24, y: 23 }], PAL.wood2);
  g.poly([{ x: 15, y: 6 }, { x: 15, y: 23 }, { x: 7, y: 23 }], PAL.wood1);
  g.rect(0, 24, 30, 4, PAL.ink);
  g.rect(3, 24, 24, 2, PAL.grey2);
  g.outline(PAL.ink);
  return g.sprite('shot:balance:fulcrum');
})();

const PAN = (() => {
  const g = new Grid(38, 16);
  g.poly([{ x: 1, y: 2 }, { x: 36, y: 2 }, { x: 31, y: 14 }, { x: 7, y: 14 }], PAL.ink);
  g.poly([{ x: 4, y: 4 }, { x: 33, y: 4 }, { x: 29, y: 11 }, { x: 9, y: 11 }], PAL.gold3);
  g.poly([{ x: 5, y: 4 }, { x: 32, y: 4 }, { x: 28, y: 8 }, { x: 10, y: 8 }], PAL.gold1);
  g.rect(8, 12, 22, 2, PAL.gold4);
  g.outline(PAL.ink);
  return g.sprite('shot:balance:pan');
})();

const ROPE = (() => {
  const g = new Grid(2, 10);
  g.rect(0, 0, 2, 10, PAL.ink);
  g.rect(1, 1, 1, 8, PAL.grey2);
  return g.sprite('shot:balance:rope');
})();

function labelsParam(params: ShotProps['params'], fallback: readonly string[]): string[] {
  const raw = params?.labels;
  if (Array.isArray(raw)) return fallback.map((value, i) => String(raw[i] ?? value).trim());
  if (typeof raw === 'string') {
    const values = raw.split(/[|/]/).map(value => value.trim());
    return fallback.map((value, i) => values[i] || value);
  }
  return [...fallback];
}

function nonNegativeEvents(props: ShotProps): number[] {
  return [...(props.events ?? [])]
    .filter(event => Number.isFinite(event.at))
    .map(event => Math.max(0, event.at))
    .sort((a, b) => a - b);
}

interface Plan {
  mode: typeof MODES[number];
  tilt: typeof TILTS[number];
  left: ItemId;
  right: ItemId;
  who: typeof ACTOR_OPTIONS[number];
  action: typeof ACTIONS[number];
  actorSide: 'left' | 'right';
  labels: string[];
  leftAt: number;
  rightAt: number;
}

function plan(props: ShotProps, dur: number): Plan {
  const p = props.params;
  const [leftAt, rawRightAt] = beats(props, dur, [0.38, 0.64]);
  const supplied = nonNegativeEvents(props).length;
  const rightAt = supplied >= 2 ? rawRightAt : Math.min(rawRightAt!, leftAt! + Math.min(0.55, dur * 0.36));
  return {
    mode: pick(p, 'mode', MODES, 'balance'),
    tilt: pick(p, 'tilt', TILTS, 'right'),
    left: itemParam(p, 'left', 'gold'),
    right: itemParam(p, 'right', 'coinStack'),
    who: pick(p, 'who', ACTOR_OPTIONS, 'none'),
    action: pick(p, 'action', ACTIONS, 'add'),
    actorSide: pick(p, 'actorSide', ['left', 'right'] as const, 'left'),
    labels: labelsParam(p, ['LEFT', 'RIGHT']),
    leftAt: leftAt!,
    rightAt: rightAt!,
  };
}

interface LeverLayout {
  beam: typeof BALANCE_BEAM;
  pivotX: number;
  pivotCell: number;
  leftX: number;
  rightX: number;
  longSide: 'left' | 'right';
}

function layout(mode: Plan['mode'], tilt: Plan['tilt']): LeverLayout {
  if (mode === 'leverage') {
    const longSide = tilt === 'left' ? 'left' : 'right';
    const pivotCell = longSide === 'right' ? 18 : 54;
    const startX = 144;
    const pivotX = startX + pivotCell * 6;
    return {
      beam: LEVERAGE_BEAM,
      pivotX,
      pivotCell,
      leftX: startX + 36,
      rightX: startX + LEVERAGE_BEAM.w - 36,
      longSide,
    };
  }
  return { beam: BALANCE_BEAM, pivotX: STAGE.centre, pivotCell: 34, leftX: 190, rightX: 530, longSide: 'right' };
}

function landItem(ctx: Frame['ctx'], id: ItemId, x: number, panY: number, t: number, at: number, seed: number) {
  const size = itemSize(id, 0.5);
  const restY = panY - 30 - size.h / 2;
  const start = Math.max(0, Math.min(at - 0.56, 0.22));
  const p = ease.inOutCubic(phase(t, start, at));
  const enter = ease.outBack(phase(t, start, start + 0.24));
  const impact = squash(t, at, 0.22, 0.25);
  const bob = t >= at ? Math.sin((t - at) * Math.PI * 2 / 1.25) * 11 * ease.outCubic(phase(t, at, at + 0.28)) : 0;
  const y = restY - (1 - p) * 104 + bob;
  drawItem(ctx, id, { x, y, t, scale: 0.5 * enter, sx: impact.sx, sy: impact.sy, rot: (1 - p) * 0.08 });
  if (at > 0.04 && t >= at && t < at + 0.46) {
    ring(ctx, x, panY - 28, at, t, { r: 58, width: 8, duration: 0.3, color: PAL.gold1 });
    sparks(ctx, x, panY - 38, at, t, { count: 4, seed, size: 7, color: PAL.gold1, duration: 0.34 });
  }
}

function beamAngle(t: number, s: Plan, events: number[]): number {
  const tiltSide = s.tilt === 'level' ? 'right' : s.tilt;
  const amount = s.mode === 'leverage' ? 0.23 : 0.15;
  const end = s.tilt === 'level' && s.mode === 'balance' ? 0 : (tiltSide === 'right' ? amount : -amount);
  const first = s.leftAt;
  const second = Math.max(s.rightAt, first + 0.12);
  let angle: number;

  if (s.mode === 'leverage') {
    const start = -end;
    const age = t - first;
    const p = ease.outCubic(phase(t, first - 0.08, first + 0.62));
    angle = start + (end - start) * p;
    if (age >= 0) angle += (end - start) * 0.18 * Math.exp(-4.1 * age) * Math.sin(10.5 * age);
  } else {
    const initial = 0;
    const firstLoad = -0.1;
    const p1 = ease.outCubic(phase(t, first - 0.08, first + 0.35));
    const p2 = ease.outCubic(phase(t, second - 0.08, second + 0.82));
    angle = initial + (firstLoad - initial) * p1 + (end - firstLoad) * p2;
    for (const at of [first, second]) {
      const age = t - at;
      if (age >= 0) {
        const finalLoad = at === second;
        angle += (finalLoad ? 0.09 : 0.035) * Math.exp((finalLoad ? -2.2 : -4.8) * age) * Math.sin((finalLoad ? 8.5 : 11) * age);
      }
    }
  }

  for (const at of events.slice(2, 5)) {
    const age = t - at;
    if (age >= 0) angle += 0.022 * Math.exp(-5.2 * age) * Math.sin(12 * age);
  }
  // A restrained slow rock keeps the scale alive during anticipation and after settling.
  angle += Math.sin(t * Math.PI * 2 / 1.2) * 0.045;
  return clamp(angle, -0.34, 0.34);
}

export const balanceShot: ShotDef = {
  name: 'balance',
  stage: 'clean',
  describe: "Two items land on pans and tip a pixel balance; leverage puts the short-arm load opposite the small long-arm weight. params: left, right (item ids; defaults gold, coinStack), mode ('balance'|'leverage', default balance), tilt ('left'|'right'|'level', final low side; default right), labels (two strings or 'LEFT|RIGHT', default LEFT|RIGHT), who (actor id or none, default none), action ('add'|'jump', default add), actorSide ('left'|'right', default left). Events: 1 = first load lands; 2 = other load lands and the beam swings to its final tilt; later events add small settling pulses.",
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame, dur = Math.max(0.05, frame.dur), t = clamp(frame.t, 0, dur), s = plan(props, dur);
    const events = nonNegativeEvents(props), l = layout(s.mode, s.tilt), angle = beamAngle(t, s, events);
    const pointY = (x: number) => 326 + Math.sin(angle) * (x - l.pivotX);
    const panY = (x: number) => pointY(x) + 104;
    const leftPanY = panY(l.leftX), rightPanY = panY(l.rightX);
    const leverage = s.mode === 'leverage';
    const leftAt = s.leftAt;
    const rightAt = leverage && l.longSide === 'right' ? s.leftAt : s.rightAt;
    const leftLoadedAt = leverage && l.longSide === 'right' ? 0 : leftAt;
    const rightLoadedAt = leverage && l.longSide === 'left' ? 0 : rightAt;

    drawStage(ctx, { floorY: STAGE.floor, line: true, shadow: [{ x: STAGE.centre, y: 548, w: 530, h: 28 }] });
    drawSprite(ctx, FULCRUM, l.pivotX, 344, { anchor: [0.5, 0] });
    drawSprite(ctx, l.beam, l.pivotX, 326, { anchor: [l.pivotCell / (l.beam.w / 6), 0.5], rot: angle });

    for (const [x, y] of [[l.leftX, leftPanY], [l.rightX, rightPanY]] as const) {
      const endpointY = pointY(x);
      drawSprite(ctx, ROPE, x - 48, endpointY + 30, { anchor: [0.5, 0] });
      drawSprite(ctx, ROPE, x + 48, endpointY + 30, { anchor: [0.5, 0] });
      drawSprite(ctx, PAN, x, y);
    }

    if (leftLoadedAt === 0 || t >= leftLoadedAt - 0.28) landItem(ctx, s.left, l.leftX, leftPanY, t, leftLoadedAt, frame.seed + 11);
    if (rightLoadedAt === 0 || t >= rightLoadedAt - 0.28) landItem(ctx, s.right, l.rightX, rightPanY, t, rightLoadedAt, frame.seed + 23);

    if (s.who !== 'none') {
      const facing = s.actorSide === 'left' ? 1 : -1;
      const actorBase = actorBounds({ who: s.who, x: 0, y: STAGE.floor, scale: 1, facing });
      const actorX = clamp(s.actorSide === 'left' ? 108 : 612, 32 - actorBase.left, 688 - actorBase.right);
      const actorTarget = s.actorSide === 'left' ? { x: l.leftX - 14, y: leftPanY - 38 } : { x: l.rightX + 14, y: rightPanY - 38 };
      const activeAt = s.actorSide === 'left' ? leftAt : rightAt;
      const hopA = Math.sin(phase(t, leftAt - 0.34, leftAt + 0.3) * Math.PI);
      const hopB = Math.sin(phase(t, rightAt - 0.34, rightAt + 0.3) * Math.PI);
      const hop = Math.min(146, (hopA + hopB) * 112);
      const nextActionAt = Math.max(leftAt, rightAt);
      const actorKeys: HedgyKey[] = [
        { at: 0, pose: 'idle' },
        { at: Math.min(0.12, dur), pose: 'lookup', expression: 'neutral' },
        { at: Math.max(0, leftAt - 0.18), pose: s.action === 'jump' ? 'jump' : 'give' },
        { at: leftAt, pose: s.action === 'jump' ? 'jump' : 'give', expression: 'determined' },
        { at: Math.max(leftAt + 0.18, rightAt - 0.18), pose: 'tap', expression: 'neutral' },
        { at: rightAt, pose: s.action === 'jump' ? 'celebrate' : 'hold', expression: 'happy' },
        { at: Math.min(dur, nextActionAt + 0.42), pose: 'point', expression: 'happy' },
      ];
      for (let at = nextActionAt + 0.86, index = 0; at < dur - 0.2; at += 0.55, index++) {
        actorKeys.push({ at, pose: index % 2 ? 'think' : 'lookup', expression: 'happy', look: 'up' });
      }
      actorKeys.sort((a, b) => a.at - b.at);
      const actorY = STAGE.floor - (s.action === 'jump' ? hop : 0);
      const actorBoundsNow = actorBounds({ who: s.who, x: actorX, y: actorY, scale: 1, facing, time: t, keys: actorKeys });
      const actorCorrection = actorBoundsNow.left < 28 ? 28 - actorBoundsNow.left : actorBoundsNow.right > 692 ? 692 - actorBoundsNow.right : 0;
      drawActor(ctx, {
        who: s.who, x: actorX + actorCorrection, y: actorY, scale: 1,
        facing, time: t, look: 'up',
        keys: actorKeys,
        handTarget: actorTarget,
        reach: phase(t, activeAt - 0.16, activeAt + 0.18),
      });
    }

    const leftLabel = s.labels[0] || '', rightLabel = s.labels[1] || '';
    if (leftLabel) label(ctx, leftLabel.toUpperCase(), l.leftX, 208, { variant: 'sign', maxWidth: 332, pop: ease.outBack(phase(t, 0.08, 0.28)) });
    if (rightLabel) label(ctx, rightLabel.toUpperCase(), l.rightX, 208, { variant: 'sign', maxWidth: 332, pop: ease.outBack(phase(t, 0.08, 0.28)) });

    ring(ctx, l.pivotX, 326, Math.max(s.leftAt, s.rightAt), t, { r: 66, width: 8, duration: 0.34, color: PAL.gold1 });
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const safeDur = Math.max(0.05, dur), s = plan(props, safeDur), l = layout(s.mode, s.tilt), events = nonNegativeEvents(props);
    const first = s.leftAt, second = Math.max(s.rightAt, first + 0.12);
    const primarySide = s.mode === 'leverage' ? l.longSide : 'left';
    const primaryX = primarySide === 'left' ? l.leftX : l.rightX;
    const secondaryX = primarySide === 'left' ? l.rightX : l.leftX;
    const facing = s.actorSide === 'left' ? 1 : -1;
    const actorBase = actorBounds({ who: s.who === 'none' ? 'hedgy' : s.who, x: 0, y: STAGE.floor, scale: 1, facing });
    const actorX = clamp(s.actorSide === 'left' ? 108 : 612, 32 - actorBase.left, 688 - actorBase.right);
    const list: Cue[] = [
      cue(0.03, 'creak', 0.55, l.pivotX),
      cue(Math.max(0, first - 0.08), 'slide', 0.7, primaryX),
      cue(first, 'thud', 1.4, primaryX),
      cue(first + 0.12, 'coin', 0.65, primaryX),
      cue(second, 'creak', 1.1, secondaryX),
      cue(second + 0.27, 'land', 1.35, secondaryX),
      ...(s.who !== 'none' ? [cue(Math.max(0, first - 0.22), 'footfall', 0.7, actorX), cue(first + 0.28, 'thump', 0.8, actorX)] : []),
    ];
    // Keep extra narration beats visible through soft impacts while the beam settles.
    for (const [index, at] of events.slice(2, 4).entries()) list.push(cue(at, index === 0 ? 'knock' : 'ding', index === 0 ? 0.75 : 0.65, l.pivotX));
    return cuesIn(safeDur, list.slice(0, 8));
  },
};
