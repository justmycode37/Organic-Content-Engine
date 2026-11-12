// store — an actor places an item in a container, then closes and locks it.
import type { Cue, Frame, ShotProps } from '../core.ts';
import { arc, bob, clamp, ease, phase, squash, tween } from '../kit/motion.ts';
import { Grid, PAL } from '../kit/pixel.ts';
import { drawSprite } from '../kit/sprite.ts';
import { drawStage } from '../kit/stage.ts';
import { ring, sparks } from '../kit/fx.ts';
import { ACTORS, STAGE, actorBounds, actorFace, actorPaw, beats, cue, cuesIn, drawActor, drawItem, itemParam, itemSize, pick, str, type ItemId } from './common.ts';
import type { ShotDef } from './index.ts';

const CONTAINERS = ['safe', 'piggy', 'bank', 'wallet', 'crate'] as const;
type ContainerId = typeof CONTAINERS[number];
const ACTOR_X = 140;
const CONTAINER_X = 430;

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
  itemScale: number;
  who: string;
  label: string;
}

const TAG_FONT: Record<string, readonly string[]> = {
  A:['010','101','111','101','101'], B:['110','101','110','101','110'], C:['011','100','100','100','011'], D:['110','101','101','101','110'], E:['111','100','110','100','111'], F:['111','100','110','100','100'], G:['011','100','101','101','011'], H:['101','101','111','101','101'], I:['111','010','010','010','111'], J:['001','001','001','101','010'], K:['101','101','110','101','101'], L:['100','100','100','100','111'], M:['101','111','111','101','101'], N:['101','111','111','111','101'], O:['111','101','101','101','111'], P:['110','101','110','100','100'], Q:['111','101','101','111','001'], R:['110','101','110','101','101'], S:['011','100','010','001','110'], T:['111','010','010','010','010'], U:['101','101','101','101','111'], V:['101','101','101','101','010'], W:['101','101','111','111','101'], X:['101','101','010','101','101'], Y:['101','101','010','010','010'], Z:['111','001','010','100','111'],
  '0':['111','101','101','101','111'], '1':['010','110','010','010','111'], '2':['110','001','010','100','111'], '3':['110','001','010','001','110'], '4':['101','101','111','001','001'], '5':['111','100','110','001','110'], '6':['011','100','110','101','010'], '7':['111','001','010','010','010'], '8':['010','101','010','101','010'], '9':['010','101','011','001','110'],
};
function smallTag(value: string) {
  const text = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8), cols = text.length * 4 + 4, g = new Grid(cols, 9);
  g.rect(0, 0, cols, 9, PAL.ink).rect(1, 1, cols - 2, 7, PAL.paper);
  let x = 2;
  for (const char of text) {
    (TAG_FONT[char] ?? TAG_FONT.S!).forEach((row, y) => [...row].forEach((on, xx) => { if (on === '1') g.rect(x + xx, y + 2, 1, 1, PAL.ink); }));
    x += 4;
  }
  return g.sprite(`shot-store:tag:${text}`);
}

function itemAt(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, item: ItemId, x: number, y: number, t: number, scale: number, extra: Record<string, unknown> = {}) {
  drawItem(ctx, item, { x, y, t, scale, ...extra });
}

function plan(props: ShotProps, dur: number): StorePlan {
  const [landedRaw, closeRaw] = beats(props, dur, [0.31, 0.74]);
  const landedAt = landedRaw ?? dur * 0.31;
  const closeAt = Math.min(dur, Math.max(closeRaw ?? dur * 0.74, landedAt + Math.min(0.24, dur * 0.14)));
  const travel = Math.min(0.36, Math.max(0.16, closeAt - landedAt - 0.08));
  const putAt = Math.max(0, landedAt - travel);
  const item = itemParam(props.params, 'item', 'cash'), dims = itemSize(item);
  return {
    putAt, closeAt, travel: landedAt - putAt, landedAt,
    container: pick(props.params, 'container', CONTAINERS, 'safe'),
    item, itemScale: Math.min(0.5, 156 / Math.max(dims.w, dims.h)),
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
  describe: 'An actor carries an item to an open container; it shrinks inside, then the door or lid closes and locks as the actor pats it. params: container (safe|piggy|bank|wallet|crate, default safe), item (any item id, default cash), who (actor id, default broker), label (optional short tag on the container, default none). Events: 1 = the item lands inside; 2 = the door or lid closes and the lock snaps.',
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame, dur = Math.max(0.05, frame.dur), t = clamp(frame.t, 0, dur), s = plan(props, dur), g = geometry(s.container);
    const carriedSize = itemSize(s.item, s.itemScale);
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
    const baseBounds = actorBounds({ who: s.who, x: ACTOR_X, y: STAGE.floor, facing: 1, time: 0, keys: actorKeys });
    const baseCorrection = baseBounds.left < 28 ? 28 - baseBounds.left : baseBounds.right > 692 ? 692 - baseBounds.right : 0;
    const actorBase = { who: s.who, x: ACTOR_X + baseCorrection, y: STAGE.floor, facing: 1 as const, time: 0, keys: actorKeys };
    const paw = actorPaw(actorBase), face = actorFace(actorBase);
    const approach = (at: number) => 62 * ease.outCubic(phase(at, 0, 0.46));
    const start = {
      x: Math.max(paw.x + 12, face.x + face.r + 14) + carriedSize.w / 2,
      y: Math.min(paw.y - 58, STAGE.floor - carriedSize.h / 2 - 44),
    };
    const prep = ease.inOutCubic(phase(t, prepareAt, s.putAt));
    const holdPoint = (at: number, p: number) => ({
      x: start.x + approach(at) - 6 * p + bob(at, 1.2, 4),
      y: start.y + Math.sin(Math.PI * p) * 12 + bob(at, 1.2, 18),
    });
    const flightStart = holdPoint(s.putAt, 1);
    const travelP = ease.inOutCubic(phase(t, s.putAt, s.landedAt));
    const flightPos = t < s.putAt ? holdPoint(t, prep) : arc(flightStart, g.entry, -60, travelP);
    // The direct diagonal into the container can skim the actor's cheek for
    // wide carried props. Bow the flight outward, then return to the opening.
    const itemPos = { ...flightPos, x: flightPos.x + (t < s.putAt ? 0 : 28 * Math.sin(Math.PI * travelP)) };
    const vanish = ease.inOutCubic(phase(t, s.landedAt - 0.06, s.landedAt + 0.12));
    const itemSquash = squash(t, s.landedAt, 0.16, 0.18);
    const opening = ease.outCubic(phase(t, 0, Math.min(0.45, s.putAt + 0.04)));
    const closing = ease.inOutCubic(phase(t, s.closeAt - 0.24, s.closeAt));
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
    const placeRetreat = 62 * ease.inOutCubic(phase(t, s.putAt, s.landedAt));
    const actorRawX = ACTOR_X + approach(t) - placeRetreat;
    const actorBoundsNow = actorBounds({ who: s.who, x: actorRawX, y: STAGE.floor, facing: 1, time: t, keys: actorKeys });
    const actorCorrection = actorBoundsNow.left < 28 ? 28 - actorBoundsNow.left : actorBoundsNow.right > 692 ? 692 - actorBoundsNow.right : 0;
    drawActor(ctx, {
      who: s.who, x: actorRawX + actorCorrection, y: STAGE.floor, facing: 1, time: t, look: t < s.landedAt ? 'up' : 'forward',
      keys: actorKeys,
      handTarget: patReach > 0.02 ? patTarget : { x: itemPos.x - carriedSize.w / 2 + 12, y: itemPos.y },
      reach: Math.max(actorReach, patReach),
    });

    if (t < s.landedAt + 0.14) {
      const flightAlpha = 1 - vanish;
      const settlingScale = s.itemScale * (1 - vanish * 0.34);
      itemAt(ctx, s.item, itemPos.x, itemPos.y + bob(t, 1.6, t < s.putAt ? 4 : 0), t, settlingScale, {
        rot: Math.sin(travelP * Math.PI) * 0.12,
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

    if (s.label && t >= s.landedAt) {
      const tag = smallTag(s.label), point = s.container === 'safe' || s.container === 'bank'
        ? { x: g.x + 132, y: g.y + 115 }
        : s.container === 'wallet' ? { x: g.x, y: g.y - 58 }
          : s.container === 'piggy' ? { x: g.x + 28, y: g.y - 62 }
            : { x: g.x, y: g.y - 86 };
      const tagAlpha = ease.outCubic(phase(t, s.landedAt, s.landedAt + 0.18));
      drawSprite(ctx, tag, point.x, point.y, { anchor: [0.5, 0.5], scale: 0.56, alpha: tagAlpha });
    }
    const lockP = ease.outCubic(phase(t, s.closeAt - 0.12, s.closeAt));
    if (s.container !== 'safe' && lockP > 0) {
      const lockY = s.container === 'crate' ? g.lock.y - (1 - lockP) * 28 : g.lock.y - (1 - lockP) * 22;
      drawItem(ctx, 'padlock', { x: g.lock.x, y: lockY, t, scale: g.lockScale, shut: lockP, alpha: lockP });
    }
    if (s.container === 'safe' && lockP > 0) {
      drawItem(ctx, 'padlock', { x: g.lock.x, y: g.lock.y - (1 - lockP) * 18, t, scale: g.lockScale, shut: lockP, alpha: lockP });
    }

    const lockHit = s.closeAt;
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
      cue(s.closeAt - 0.12, 'creak', 0.75, g.x),
      cue(s.closeAt, 'clunk', 1.5, g.x),
      cue(s.closeAt + 0.04, 'snap', 1.2, g.lock.x),
    ]);
  },
};
