// store — an actor places an item in a container, then closes and locks it.
import type { Cue, Frame, ShotProps } from '../core.ts';
import { arc, bob, clamp, ease, phase, squash, tween } from '../kit/motion.ts';
import { Grid, PAL } from '../kit/pixel.ts';
import { drawSprite } from '../kit/sprite.ts';
import { drawStage, label } from '../kit/stage.ts';
import { ring, sparks } from '../kit/fx.ts';
import { ACTORS, STAGE, actorFace, actorPaw, beats, cue, cuesIn, drawActor, drawItem, itemParam, itemSize, pick, str, type ItemId } from './common.ts';
import type { ShotDef } from './index.ts';

const CONTAINERS = ['safe', 'piggy', 'bank', 'wallet', 'crate'] as const;
type ContainerId = typeof CONTAINERS[number];
const ACTOR_X = 126;
const CONTAINER_X = 430;
const ITEM_SCALE = 0.5;

const crateOpening = (() => {
  const g = new Grid(70, 26);
  g.poly([{ x: 4, y: 13 }, { x: 35, y: 2 }, { x: 66, y: 13 }, { x: 35, y: 25 }], PAL.wood4);
  g.poly([{ x: 8, y: 13 }, { x: 35, y: 4 }, { x: 62, y: 13 }, { x: 35, y: 22 }], PAL.black);
  g.outline(PAL.ink);
  return g.sprite('shot-store:crate-opening');
})();

const crateLid = (() => {
  const g = new Grid(70, 26);
  g.poly([{ x: 4, y: 13 }, { x: 35, y: 2 }, { x: 66, y: 13 }, { x: 35, y: 25 }], PAL.ink);
  g.poly([{ x: 7, y: 13 }, { x: 35, y: 4 }, { x: 63, y: 13 }, { x: 35, y: 23 }], PAL.wood2);
  g.poly([{ x: 9, y: 12 }, { x: 35, y: 5 }, { x: 59, y: 12 }, { x: 35, y: 20 }], PAL.wood1);
  g.line({ x: 35, y: 5 }, { x: 35, y: 20 }, 2, PAL.wood3);
  g.line({ x: 15, y: 11 }, { x: 35, y: 17 }, 2, PAL.wood3);
  g.line({ x: 55, y: 11 }, { x: 35, y: 17 }, 2, PAL.wood3);
  g.outline(PAL.ink);
  return g.sprite('shot-store:crate-lid');
})();

const piggyHatch = (() => {
  const g = new Grid(22, 10);
  g.round(1, 1, 20, 8, 2, PAL.ink);
  g.round(3, 2, 16, 6, 1, PAL.pink3);
  g.rect(5, 3, 12, 2, PAL.pink1);
  g.rect(8, 6, 7, 1, PAL.pink2);
  g.outline(PAL.ink);
  return g.sprite('shot-store:piggy-hatch');
})();

interface StorePlan {
  putAt: number;
  closeAt: number;
  landedAt: number;
  travel: number;
  container: ContainerId;
  item: ItemId;
  who: string;
  label: string;
}

function plan(props: ShotProps, dur: number): StorePlan {
  const [putRaw, closeRaw] = beats(props, dur, [0.31, 0.74]);
  const putAt = putRaw ?? dur * 0.31;
  const closeAt = Math.min(dur, Math.max(closeRaw ?? dur * 0.74, putAt + Math.min(0.48, dur * 0.28)));
  const travel = Math.min(0.46, Math.max(0.28, (closeAt - putAt) * 0.54));
  return {
    putAt, closeAt, travel, landedAt: Math.min(dur, putAt + travel),
    container: pick(props.params, 'container', CONTAINERS, 'safe'),
    item: itemParam(props.params, 'item', 'cash'),
    who: pick(props.params, 'who', ACTORS, 'broker'),
    label: str(props.params, 'label', '').trim(),
  };
}

function geometry(container: ContainerId) {
  switch (container) {
    case 'safe': return { x: CONTAINER_X, y: STAGE.floor - 282, entry: { x: CONTAINER_X, y: STAGE.floor - 270 }, labelY: STAGE.floor - 535, lock: { x: CONTAINER_X + 134, y: STAGE.floor - 385 }, lockScale: 0.58 };
    case 'bank': return { x: CONTAINER_X, y: STAGE.floor - 282, entry: { x: CONTAINER_X + 35, y: STAGE.floor - 128 }, labelY: STAGE.floor - 535, lock: { x: CONTAINER_X + 45, y: STAGE.floor - 132 }, lockScale: 0.38 };
    case 'wallet': return { x: CONTAINER_X + 5, y: 625, entry: { x: CONTAINER_X + 5, y: 625 }, labelY: 480, lock: { x: CONTAINER_X + 70, y: 635 }, lockScale: 0.38 };
    case 'piggy': return { x: CONTAINER_X + 10, y: 590, entry: { x: CONTAINER_X + 4, y: 482 }, labelY: 350, lock: { x: CONTAINER_X + 72, y: 490 }, lockScale: 0.34 };
    case 'crate': return { x: CONTAINER_X, y: 586, entry: { x: CONTAINER_X, y: 487 }, labelY: 664, lock: { x: CONTAINER_X, y: 487 }, lockScale: 0.38 };
  }
}

function drawStoredContainer(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, s: StorePlan, t: number, g: ReturnType<typeof geometry>, open: number, fill: number) {
  const lockTurn = tween(t, s.closeAt - 0.28, 0.42, 0, Math.PI * 0.9, ease.inOutCubic);
  const patTurn = Math.max(0, t - s.closeAt - 0.18) * Math.PI * 2.8;
  const dial = lockTurn + patTurn;
  if (s.container === 'safe') drawItem(ctx, 'safe', { x: g.x, y: g.y, t, door: open, dial, contents: 'empty' });
  else if (s.container === 'bank') drawItem(ctx, 'bank', { x: g.x, y: g.y, t, doorOpen: open });
  else if (s.container === 'wallet') drawItem(ctx, 'wallet', { x: g.x, y: g.y, t, open, empty: false });
  else if (s.container === 'piggy') drawItem(ctx, 'piggy', { x: g.x, y: g.y, t, fill });
  else drawItem(ctx, 'crate', { x: g.x, y: g.y, t, label: '' });
}

export const storeShot: ShotDef = {
  name: 'store',
  stage: 'clean',
  describe: 'An actor puts an item into a container, closes and locks it, then pats the safe or dusts their paws while the dial turns. params: container (safe|piggy|bank|wallet|crate, default safe), item (any item id, default cash), who (actor id, default broker), label (optional word on a paper plate above the container, default none). Events: 1 = the actor carries or tosses the item in, 2 = the container closes and locks.',
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame, dur = Math.max(0.05, frame.dur), t = clamp(frame.t, 0, dur), s = plan(props, dur), g = geometry(s.container);
    const carriedSize = itemSize(s.item, ITEM_SCALE);
    const walkEnd = Math.min(0.42, s.putAt * 0.44);
    const prepareAt = Math.max(walkEnd, s.putAt - 0.48);
    const timeAfterClose = Math.max(0, dur - s.closeAt);
    const patOne = s.closeAt + Math.min(0.18, timeAfterClose * 0.28);
    const patTwo = s.closeAt + Math.min(0.58, timeAfterClose * 0.72);
    const actorKeys = [
      { at: 0, pose: 'walk' as const, expression: 'determined' as const },
      { at: walkEnd, pose: 'carry' as const, expression: 'determined' as const },
      { at: prepareAt, pose: 'think' as const, expression: 'determined' as const, look: 'up' as const },
      { at: s.putAt, pose: 'give' as const, expression: 'determined' as const, look: 'up' as const },
      { at: s.landedAt + 0.04, pose: 'point' as const, expression: 'happy' as const, look: 'forward' as const },
      { at: patOne, pose: 'tap' as const, expression: 'happy' as const, look: 'up' as const },
      { at: s.closeAt + 0.48, pose: 'hold' as const, expression: 'happy' as const, look: 'forward' as const },
      { at: patTwo, pose: 'tap' as const, expression: 'happy' as const, look: 'up' as const },
    ];
    const actorBase = { who: s.who, x: ACTOR_X, y: STAGE.floor, facing: 1 as const, time: 0, keys: actorKeys };
    const paw = actorPaw(actorBase), face = actorFace(actorBase);
    const approach = (at: number) => 62 * ease.outCubic(phase(at, 0, 0.46));
    const start = {
      x: Math.max(paw.x + 12, face.x + face.r + 14) + carriedSize.w / 2,
      y: paw.y + Math.min(34, carriedSize.h * 0.18),
    };
    const prep = ease.inOutCubic(phase(t, prepareAt, s.putAt));
    const holdPoint = (at: number, p: number) => ({
      x: start.x + approach(at) - 6 * p + bob(at, 1.2, 4),
      y: start.y + Math.sin(Math.PI * p) * 12 + bob(at, 1.2, 18),
    });
    const flightStart = holdPoint(s.putAt, 1);
    const travelP = ease.inOutCubic(phase(t, s.putAt, s.landedAt));
    const itemPos = t < s.putAt ? holdPoint(t, prep) : arc(flightStart, g.entry, 66, travelP);
    const vanish = ease.inOutCubic(phase(t, s.landedAt - 0.06, s.landedAt + 0.12));
    const itemSquash = squash(t, s.landedAt, 0.16, 0.18);
    const opening = ease.outCubic(phase(t, 0, Math.min(0.45, s.putAt + 0.04)));
    const closing = ease.inOutCubic(phase(t, s.closeAt - 0.24, s.closeAt + 0.08));
    const openness = opening * (1 - closing);
    const stored = ease.outCubic(phase(t, s.landedAt, s.closeAt));

    drawStage(ctx, { floorY: STAGE.floor, line: true, shadow: [{ x: ACTOR_X, y: STAGE.floor - 2, w: 170 }, { x: g.x, y: STAGE.floor - 2, w: s.container === 'wallet' ? 210 : 300 }] });
    drawStoredContainer(ctx, s, t, g, openness, stored);

    if (s.container === 'crate') {
      const roofY = g.y - 99;
      drawSprite(ctx, crateOpening, g.x, roofY);
    }

    const actorReach = 1 - phase(t, s.putAt, s.landedAt + 0.18);
    const pulse = (from: number) => ease.outCubic(phase(t, from, from + 0.10)) * (1 - ease.inCubic(phase(t, from + 0.17, from + 0.27)));
    const patReach = Math.max(pulse(patOne), pulse(patTwo));
    const patTarget = { x: g.x - 114, y: g.y - (s.container === 'safe' ? 256 : 146) };
    drawActor(ctx, {
      who: s.who, x: ACTOR_X + approach(t), y: STAGE.floor, facing: 1, time: t, look: t < s.landedAt ? 'up' : 'forward',
      keys: actorKeys,
      handTarget: patReach > 0.02 ? patTarget : { x: itemPos.x - carriedSize.w / 2 + 12, y: itemPos.y },
      reach: Math.max(actorReach, patReach),
    });

    if (t < s.landedAt + 0.14) {
      const flightAlpha = 1 - vanish;
      const settlingScale = ITEM_SCALE * (1 - vanish * 0.74);
      drawItem(ctx, s.item, {
        x: itemPos.x, y: itemPos.y + bob(t, 1.6, t < s.putAt ? 4 : 0), t,
        scale: settlingScale, rot: Math.sin(travelP * Math.PI) * 0.12,
        sx: itemSquash.sx, sy: itemSquash.sy, alpha: flightAlpha,
      });
    }

    if (s.container === 'piggy') {
      const opened = ease.outCubic(phase(t, 0, 0.32));
      const lowered = closing;
      if (opened < 1 || lowered > 0) {
        const raise = 38 * opened * (1 - lowered);
        drawSprite(ctx, piggyHatch, g.x - 6, g.y - 108 - raise);
      }
    }
    if (s.container === 'crate') {
      const opened = ease.outCubic(phase(t, 0, 0.36));
      const lidP = closing;
      const hit = squash(t, s.closeAt + 0.05, 0.12, 0.2);
      drawSprite(ctx, crateLid, g.x, g.y - 99 - 96 * opened * (1 - lidP), { sx: hit.sx, sy: hit.sy, rot: -0.06 * opened * (1 - lidP) });
    }

    if (s.label) label(ctx, s.label.toUpperCase(), g.x, g.labelY, { variant: 'tag', maxWidth: 520 });
    const lockP = ease.outCubic(phase(t, s.closeAt + 0.04, s.closeAt + 0.24));
    if (s.container !== 'safe' && lockP > 0) {
      const lockY = s.container === 'crate' ? g.lock.y - (1 - lockP) * 28 : g.lock.y - (1 - lockP) * 22;
      drawItem(ctx, 'padlock', { x: g.lock.x, y: lockY, t, scale: g.lockScale, shut: lockP, alpha: lockP });
    }
    if (s.container === 'safe' && lockP > 0) {
      drawItem(ctx, 'padlock', { x: g.lock.x, y: g.lock.y - (1 - lockP) * 18, t, scale: g.lockScale, shut: lockP, alpha: lockP });
    }

    const lockHit = s.closeAt + 0.08;
    ring(ctx, g.lock.x, g.lock.y, lockHit, t, { r: 46, duration: 0.34, width: 8, color: PAL.gold2 });
    if (t >= s.closeAt && t < s.closeAt + 0.55) sparks(ctx, g.lock.x, g.lock.y, s.closeAt + 0.14, t, { count: 4, seed: frame.seed, duration: 0.42, color: PAL.gold2, size: 4 });
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const safeDur = Math.max(0.05, dur), s = plan(props, safeDur), g = geometry(s.container);
    return cuesIn(safeDur, [
      cue(Math.max(0, s.putAt - 0.56), 'rustle', 0.7, ACTOR_X),
      cue(0.16, 'footfall', 0.75, ACTOR_X),
      cue(0.04, 'creak', 0.55, g.x),
      cue(s.putAt, 'swish', 0.9, ACTOR_X + 120),
      cue(s.landedAt, 'thud', 1.35, g.entry.x),
      cue(s.closeAt - 0.06, 'creak', 0.75, g.x),
      cue(s.closeAt + 0.07, 'clunk', 1.5, g.x),
      cue(s.closeAt + 0.24, 'snap', 1.2, g.lock.x),
    ]);
  },
};
