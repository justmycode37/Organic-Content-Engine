// reveal — a page or curtain is pulled aside to expose a hidden detail.
import type { Cue, Frame, ShotProps } from '../core.ts';
import type { HedgyKey } from '../actor/hedgy.ts';
import { Grid, PAL } from '../kit/pixel.ts';
import { drawSprite } from '../kit/sprite.ts';
import { bob, clamp, ease, phase } from '../kit/motion.ts';
import { drawStage, label } from '../kit/stage.ts';
import { measure } from '../kit/type.ts';
import { ring, sparks } from '../kit/fx.ts';
import { ACTORS, STAGE, actorBounds, beats, cue, cuesIn, drawActor, drawItem, itemParam, itemSize, pick, str, type ItemId } from './common.ts';
import type { ShotDef } from './index.ts';

const MODES = ['fee', 'failures', 'crack'] as const, COVERS = ['page', 'curtain'] as const;
const page = new Grid(64, 80)
  .rect(3, 2, 58, 76, PAL.paper).rect(7, 6, 50, 68, PAL.paperShade)
  .rect(10, 10, 44, 2, PAL.paper).rect(10, 17, 36, 1, PAL.paper).rect(10, 22, 40, 1, PAL.paper)
  .rect(10, 27, 32, 1, PAL.paper).rect(10, 58, 39, 1, PAL.paper).rect(10, 64, 44, 1, PAL.paper)
  .poly([{ x: 48, y: 2 }, { x: 61, y: 15 }, { x: 48, y: 15 }], PAL.white)
  .outline(PAL.ink).sprite('shot-reveal:paper-cover');
const curtain = new Grid(64, 80)
  .rect(1, 2, 62, 8, PAL.grey4).rect(4, 10, 56, 3, PAL.grey3)
  .poly([{ x: 5, y: 12 }, { x: 59, y: 12 }, { x: 57, y: 68 }, { x: 49, y: 74 }, { x: 42, y: 68 }, { x: 34, y: 74 }, { x: 26, y: 68 }, { x: 18, y: 74 }, { x: 7, y: 67 }], PAL.blue4)
  .rect(11, 14, 5, 49, PAL.blue3).rect(28, 14, 5, 50, PAL.blue3).rect(45, 14, 5, 49, PAL.blue3)
  .rect(18, 16, 3, 48, PAL.blue2).rect(37, 15, 3, 48, PAL.blue2)
  .outline(PAL.ink).sprite('shot-reveal:curtain-cover');
const crack = new Grid(48, 48)
  .line({ x: 22, y: 1 }, { x: 24, y: 12 }, 3, PAL.ink).line({ x: 24, y: 12 }, { x: 16, y: 18 }, 3, PAL.ink)
  .line({ x: 16, y: 18 }, { x: 23, y: 26 }, 3, PAL.ink).line({ x: 23, y: 26 }, { x: 18, y: 35 }, 3, PAL.ink)
  .line({ x: 18, y: 35 }, { x: 25, y: 47 }, 3, PAL.ink)
  .line({ x: 24, y: 12 }, { x: 33, y: 16 }, 2, PAL.paper).line({ x: 33, y: 16 }, { x: 30, y: 24 }, 2, PAL.paper)
  .line({ x: 23, y: 26 }, { x: 34, y: 30 }, 2, PAL.paper).line({ x: 34, y: 30 }, { x: 31, y: 39 }, 2, PAL.paper)
  .sprite('shot-reveal:cracked-surface');

interface Plan { item: ItemId; revealer: string; watcher: string; mode: typeof MODES[number]; cover: typeof COVERS[number]; tag: string; pullAt: number; reactAt: number; pullDur: number }
function plan(props: ShotProps, dur: number): Plan {
  const [pullRaw, reactRaw] = beats(props, dur, [0.34, 0.68]);
  const pullAt = clamp(pullRaw ?? dur * 0.34, Math.min(0.12, dur * 0.12), Math.max(Math.min(0.12, dur * 0.12), dur - 0.48));
  const pullDur = Math.min(0.62, Math.max(0.34, dur * 0.24));
  return {
    item: itemParam(props.params, 'item', 'ticket'), revealer: pick(props.params, 'revealer', ACTORS, 'hedgy'), watcher: pick(props.params, 'watcher', ACTORS, 'buyer'),
    mode: pick(props.params, 'mode', MODES, 'fee'), cover: pick(props.params, 'cover', COVERS, 'page'),
    tag: str(props.params, 'tag', 'FEE').trim().toUpperCase().slice(0, 12), pullAt, pullDur,
    reactAt: Math.max(pullAt + pullDur, reactRaw ?? dur * 0.68),
  };
}
function correctedX(who: string, x: number, facing: 1 | -1, t: number, keys: HedgyKey[]): number {
  const box = actorBounds({ who, x, y: STAGE.floor, facing, scale: 0.7, time: t, keys });
  return x + (box.left < 28 ? 28 - box.left : box.right > 692 ? 692 - box.right : 0);
}

export const revealShot: ShotDef = {
  name: 'reveal',
  stage: 'clean',
  describe: 'A revealer pulls a page or curtain sideways to expose a hidden detail on an item while a second character watches and reacts. mode controls the hidden detail: fee reveals a hanging fee tag, failures reveals three red failure marks, and crack reveals a jagged crack across the item. params: revealer (actor id, default hedgy), watcher (actor id, default buyer), item (any item id, default ticket), mode (fee|failures|crack, default fee), cover (page|curtain, default page), tag (short tag word for fee mode, default FEE). Events: 1 = the cover is pulled aside and the secret appears; 2 = both characters react, with fallback beats if omitted.',
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame, dur = Math.max(0.05, frame.dur), t = clamp(frame.t, 0, dur), s = plan(props, dur), size = itemSize(s.item);
    const itemScale = Math.min(0.68, 300 / size.w, 350 / size.h), w = size.w * itemScale, h = size.h * itemScale;
    const x = STAGE.centre, y = STAGE.floor - h / 2 + bob(t, 1.05, 8), pull = ease.inOutCubic(phase(t, s.pullAt, s.pullAt + s.pullDur));
    const pageW = Math.min(350, w + 34), pageH = Math.min(390, h + 38), baseSX = pageW / page.w, baseSY = pageH / page.h;
    const revealShift = ease.inOutCubic(pull) * pageW * 0.78;
    const revealerKeys: HedgyKey[] = [
      { at: 0, pose: 'think', expression: 'neutral', look: 'down' },
      { at: Math.max(0, s.pullAt - 0.12), pose: 'give', expression: 'determined', look: 'forward' },
      { at: s.pullAt + s.pullDur, pose: 'point', expression: 'happy', look: 'down' },
      { at: s.reactAt, pose: 'celebrate', expression: 'happy', look: 'forward' },
    ];
    const watcherKeys: HedgyKey[] = [
      { at: 0, pose: 'think', expression: 'neutral', look: 'down' },
      { at: s.pullAt + s.pullDur * 0.6, pose: 'shock', expression: 'shocked', look: 'forward' },
      { at: s.reactAt + 0.12, pose: 'point', expression: 'shocked', look: 'down' },
    ];
    for (let at = s.reactAt + 0.58, i = 0; at < dur - 0.1; at += 0.5, i++) {
      revealerKeys.push({ at, pose: i % 2 ? 'think' : 'point', expression: 'happy', look: 'down' });
      watcherKeys.push({ at: at + 0.12, pose: i % 2 ? 'think' : 'point', expression: 'shocked', look: 'down' });
    }
    const actorLeft = correctedX(s.revealer, 110, 1, t, revealerKeys), actorRight = correctedX(s.watcher, 610, -1, t, watcherKeys);

    drawStage(ctx, { floorY: STAGE.floor, line: true, shadow: [
      { x: actorLeft, y: STAGE.floor - 2, w: 154 }, { x, y: STAGE.floor - 2, w: w + 72 }, { x: actorRight, y: STAGE.floor - 2, w: 154 },
    ] });
    // The asset and secret are drawn behind the opaque cover; the page movement
    // therefore reveals them continuously instead of popping them into view.
    drawItem(ctx, s.item, { x, y, t, scale: itemScale });
    if (s.mode === 'fee') {
      const tag = s.tag || 'FEE', scale = Math.min(0.72, 190 / (measure(tag).w + 36));
      ctx.save(); ctx.translate(x + w * 0.24, y - h * 0.2); ctx.scale(scale, scale);
      label(ctx, tag, 0, 0, { variant: 'tag', maxWidth: 280, rot: -0.08 + Math.sin(t * 2) * 0.025 });
      ctx.restore();
    } else if (s.mode === 'failures') {
      for (let i = 0; i < 3; i++) drawItem(ctx, 'cross', { x: x + (i - 1) * Math.min(82, w * 0.23), y: y + h * 0.22, t, scale: 0.19, rot: (i - 1) * 0.06 });
    } else {
      drawSprite(ctx, crack, x, y, { sx: Math.max(0.45, w / crack.w), sy: Math.max(0.45, h / crack.h), alpha: 1 });
    }

    drawActor(ctx, { who: s.revealer, x: actorLeft, y: STAGE.floor, facing: 1, scale: 0.7, time: t, look: 'forward', keys: revealerKeys,
      handTarget: { x: x - pageW / 2 + revealShift * 0.22, y: y - 12 }, reach: ease.outCubic(phase(t, s.pullAt - 0.14, s.pullAt + 0.12)) * (1 - 0.4 * pull) });
    drawActor(ctx, { who: s.watcher, x: actorRight, y: STAGE.floor, facing: -1, scale: 0.7, time: t, look: 'down', keys: watcherKeys,
      handTarget: { x: x + w * 0.42, y: y - 20 }, reach: 0.14 + 0.4 * phase(t, s.pullAt + s.pullDur * 0.5, s.reactAt) });

    const coverSprite = s.cover === 'page' ? page : curtain;
    const coverX = x + revealShift, coverScaleX = baseSX * (1 - 0.72 * pull);
    drawSprite(ctx, coverSprite, coverX + Math.sin(t * 1.7) * 2, y, { sx: coverScaleX, sy: baseSY, rot: -0.025 * pull + Math.sin(t * 1.4) * 0.01 });
    ring(ctx, x + w * 0.24, y, s.pullAt + s.pullDur * 0.5, t, { r: 48, duration: 0.32, width: 6 });
    sparks(ctx, x + w * 0.25, y - h * 0.08, s.pullAt + s.pullDur, t, { count: 4, seed: frame.seed, duration: 0.36, size: 5 });
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const s = plan(props, Math.max(0.05, dur));
    return cuesIn(dur, [
      cue(Math.max(0, s.pullAt - 0.12), 'rustle', 0.7, STAGE.centre), cue(s.pullAt, s.cover === 'curtain' ? 'swish' : 'paper', 1.1, STAGE.centre),
      cue(s.pullAt + s.pullDur * 0.55, 'whoosh', 0.86, STAGE.centre + 90), cue(s.pullAt + s.pullDur, s.mode === 'crack' ? 'crack' : 'shimmer', 0.9, STAGE.centre),
      cue(s.reactAt, 'ding', 0.72, 610),
    ]);
  },
};
