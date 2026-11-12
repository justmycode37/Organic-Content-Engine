// present — an actor pushes a hero item into view, it bounces, and its tag flips.
import type { Cue, Frame, ShotProps } from '../core.ts';
import { bob, clamp, ease, phase, tween } from '../kit/motion.ts';
import { poof, ring, sparks } from '../kit/fx.ts';
import { connector, drawStage, label } from '../kit/stage.ts';
import { measure } from '../kit/type.ts';
import { ACTORS, ITEMS, STAGE, actorBounds, beats, cue, cuesIn, drawActor, drawItem, itemParam, itemSize, pick, str, type ItemId } from './common.ts';
import type { HedgyKey } from '../actor/hedgy.ts';
import type { ShotDef } from './index.ts';

const MOODS = ['happy', 'worried', 'shocked', 'smug', 'determined', 'sad', 'neutral'] as const;
type Mood = (typeof MOODS)[number];
type Reveal = 'drop' | 'lift';
const smoothInOut = (p: number) => 0.5 - Math.cos(Math.PI * clamp(p)) * 0.5;

interface Plan {
  dur: number;
  revealAt: number;
  secondAt: number;
  who: string;
  item: ItemId;
  scale: number;
  tag: string;
  backTag: string;
  nameplate: string;
  mood: Mood;
  reveal: Reveal;
}

function livelyKeys(base: HedgyKey[], dur: number, poseAt: (at: number, index: number) => HedgyKey['pose'], expressionAt: (at: number) => HedgyKey['expression']): { keys: HedgyKey[]; gestures: number[] } {
  const anchors = [...base].sort((a, b) => a.at - b.at), extras: HedgyKey[] = [];
  let index = 0;
  for (let i = 0; i < anchors.length; i++) {
    const left = anchors[i]!, right = anchors[i + 1];
    const end = Math.min(right?.at ?? dur, dur);
    for (let at = left.at + 0.45; at < end - 0.16 && at < dur - 0.15; at += 0.45) {
      let pose = poseAt(at, index++);
      if (right && pose === right.pose) pose = pose === 'point' ? 'think' : 'point';
      extras.push({ at, pose, expression: expressionAt(at), look: 'up' });
    }
  }
  return { keys: [...anchors, ...extras].sort((a, b) => a.at - b.at), gestures: extras.map(key => key.at) };
}

function sampledTimes(times: number[], limit: number): number[] {
  if (times.length <= limit) return times;
  return Array.from({ length: limit }, (_, i) => times[Math.round(i * (times.length - 1) / (limit - 1))]!);
}

function plan(props: ShotProps, dur: number): Plan {
  const p = props.params;
  const [revealAt, second] = beats(props, dur, [Math.min(0.34, 0.96 / dur), Math.min(0.7, 2.4 / dur)]);
  const item = itemParam(p, 'item', 'ticket');
  const size = itemSize(item);
  return {
    dur,
    revealAt: revealAt!,
    secondAt: Math.min(dur, Math.max(second!, revealAt! + 0.28)),
    who: pick(p, 'who', ACTORS, 'hedgy'),
    item,
    scale: Math.min(0.82, 360 / size.w, 480 / size.h),
    tag: str(p, 'tag', 'ASSET').trim().toUpperCase(),
    backTag: typeof p?.backTag === 'string' ? p.backTag.trim().toUpperCase() : '',
    nameplate: typeof p?.label === 'string' ? p.label.trim().toUpperCase() : '',
    mood: pick(p, 'mood', MOODS, 'happy'),
    reveal: pick(p, 'reveal', ['drop', 'lift'] as const, 'lift'),
  };
}

function reactionPose(mood: Mood): 'celebrate' | 'sweat' | 'shock' | 'smug' | 'hold' {
  if (mood === 'happy') return 'celebrate';
  if (mood === 'worried' || mood === 'sad') return 'sweat';
  if (mood === 'shocked') return 'shock';
  if (mood === 'smug') return 'smug';
  return 'hold';
}

function cleanText(ctx: Frame['ctx'], text: string, x: number, y: number, t: number, flipAt: number, flip: boolean, idleRot: number, pop = 1): void {
  const flipStart = Math.max(0, flipAt - 0.14), flipEnd = flipAt + 0.14;
  const p = flip ? phase(t, flipStart, flipEnd) : 0;
  const turn = flip ? Math.cos(Math.PI * p) : 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(Math.max(0.08, Math.abs(turn)), 1);
  label(ctx, text, 0, 0, { variant: 'tag', maxWidth: 480, rot: idleRot + Math.sin(Math.PI * p) * 0.08, pop });
  ctx.restore();
}

function oneLine(text: string, maxWidth: number): string {
  const source = text.trim().toUpperCase();
  if (measure(source).w + 24 <= maxWidth) return source;
  const suffix = '...';
  let result = '';
  for (const char of [...source]) {
    const next = `${result}${char}`.trimEnd();
    if (measure(`${next}${suffix}`).w + 24 > maxWidth) break;
    result += char;
  }
  return `${result.trimEnd()}${suffix}`;
}

function geometry(s: Plan) {
  const size = itemSize(s.item, s.scale);
  const itemX = 470;
  const restingY = STAGE.floor - size.h / 2;
  const itemY = clamp(restingY, 24 + size.h / 2, 836 - size.h / 2);
  const startX = itemX - 168;
  const room = s.reveal === 'drop' ? itemY - (24 + size.h / 2) : STAGE.h - 24 - size.h / 2 - itemY;
  const verticalTravel = Math.min(72, Math.max(0, room), s.revealAt * 240);
  const startY = itemY + (s.reveal === 'drop' ? -verticalTravel : verticalTravel);
  const moveDuration = Math.max(0.001, Math.min(s.revealAt, Math.max(0.22, verticalTravel / 240)));
  const moveStart = Math.max(0, s.revealAt - moveDuration);
  const tagAbove = itemY - size.h / 2 >= 112;
  return { size, itemX, itemY, startX, startY, moveStart, tagAbove };
}

export const presentShot: ShotDef = {
  name: 'present',
  stage: 'clean',
  describe: "An actor pushes any full-size item across the stage into view; it bounces to a stop while a hanging tag flips to a second word and the actor points it out. params: who='hedgy' (any actor id in ACTORS), item='ticket' (any item id in ITEMS), tag='ASSET' (hanging word), backTag='' (optional replacement word), label='' (optional short name plate), mood='happy'|'worried'|'shocked'|'smug'|'determined'|'sad'|'neutral', reveal='lift'|'drop' (item's vertical entrance). Events: 1 = the actor pushes the item across, it lands and bounces; 2 = the tag flips to backTag when set and the actor reacts.",
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame, dur = Math.max(0.05, frame.dur), t = clamp(frame.t, 0, dur), s = plan(props, dur), g = geometry(s);
    const { size, itemX, itemY, startX, startY, moveStart, tagAbove } = g;
    const moveProgress = phase(t, moveStart, s.revealAt);
    const easedMove = smoothInOut(moveProgress);
    const movingX = startX + (itemX - startX) * easedMove;
    const movingY = tween(t, moveStart, Math.max(0.001, s.revealAt - moveStart), startY, itemY, smoothInOut);
    const postHit = Math.max(0, t - s.revealAt);
    const bounceY = postHit > 0 ? -Math.sin(Math.min(1, postHit / 0.52) * Math.PI) * 15 * Math.exp(-postHit * 2.8) : 0;
    const idleY = postHit > 0.55 ? bob(postHit - 0.55, 1.8, 3) : 0;
    const itemDrawY = movingY + bounceY + idleY;
    const itemRot = (1 - easedMove) * (s.reveal === 'drop' ? -0.12 : 0.12) + Math.sin(Math.min(1, postHit / 0.52) * Math.PI) * 0.08;
    const tagProgress = s.backTag ? phase(t, s.secondAt - 0.14, s.secondAt + 0.14) : 0;
    const tagText = s.backTag && tagProgress >= 0.5 ? s.backTag : s.tag;
    const tagX = movingX;
    const tagY = tagAbove ? itemDrawY - size.h / 2 - 48 : itemDrawY + size.h / 2 + 52;
    const actorProgress = ease.outCubic(phase(t, moveStart - 0.16, s.revealAt + 0.12));
    const actorX = 112 + actorProgress * 94;
    const timeline = livelyKeys([
      { at: 0, pose: 'walk', expression: 'determined', look: 'forward' },
      { at: Math.max(0, moveStart - 0.05), pose: 'push', expression: 'determined', look: 'forward' },
      { at: s.revealAt, pose: 'hold', expression: 'happy', look: 'up' },
      { at: Math.min(dur, s.revealAt + 0.22), pose: 'celebrate', expression: s.mood, look: 'up' },
      { at: s.secondAt, pose: 'point', expression: s.mood, look: 'up' },
    ], dur, (at, index) => at < s.revealAt ? 'push' : index % 2 === 0 ? 'point' : reactionPose(s.mood), at => at < s.revealAt ? 'determined' : s.mood);
    const actorBox = actorBounds({ who: s.who, x: actorX, y: STAGE.floor, facing: 1, scale: 1, time: t, keys: timeline.keys });
    const correction = actorBox.left < 28 ? 28 - actorBox.left : actorBox.right > 692 ? 692 - actorBox.right : 0;
    const handTarget = { x: movingX - size.w / 2 + 10, y: itemDrawY + size.h * 0.18 };

    drawStage(ctx, { floorY: STAGE.floor, line: true, shadow: [{ x: actorX, y: STAGE.floor - 3, w: 170 }, { x: itemX, y: STAGE.floor - 3, w: size.w * 0.82 }] });
    ring(ctx, itemX, itemY, s.revealAt, t, { r: 96, duration: 0.42 });
    sparks(ctx, itemX, itemY - size.h * 0.18, s.revealAt, t, { count: 5, seed: frame.seed, duration: 0.42 });
    poof(ctx, itemX, itemY + size.h * 0.3, s.revealAt, t, { count: 3, seed: frame.seed + 3, radius: 22, duration: 0.34 });
    const itemTop = itemDrawY - size.h / 2;
    const connectorStartY = tagAbove ? tagY + 34 : tagY - 34;
    if (moveProgress > 0.04 && s.tag) connector(ctx, { x: tagX, y: connectorStartY }, { x: tagX, y: itemTop + (tagAbove ? 2 : size.h - 2) }, { width: 8, slack: 10, curve: tagAbove ? 0 : 24 });
    drawItem(ctx, s.item, {
      x: movingX, y: itemDrawY, t, scale: s.scale, rot: itemRot,
      ...(s.item === 'ticket' ? { tag: 'none' } : {}),
    });
    if (t >= moveStart && s.tag) {
      cleanText(ctx, tagText, tagX, tagY + bob(t, 2.15, 3), t, s.secondAt, Boolean(s.backTag), Math.sin((Math.PI * 2 * t) / 2.15) * 0.035,
        Math.max(0.08, ease.outBack(phase(t, moveStart, Math.min(s.revealAt, moveStart + 0.2)))));
    }
    drawActor(ctx, {
      who: s.who, x: actorX + correction, y: STAGE.floor, facing: 1, scale: 1, time: t,
      look: t < s.secondAt ? 'up' : 'forward', keys: timeline.keys, handTarget, reach: ease.outCubic(phase(t, moveStart - 0.12, s.revealAt + 0.18)),
    });
    if (s.nameplate) label(ctx, oneLine(s.nameplate, 600), 360, 812, { variant: 'sign', maxWidth: 600, pop: ease.outBack(phase(t, 0.04, 0.28)) });
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const s = plan(props, Math.max(0.05, dur)), g = geometry(s);
    const timeline = livelyKeys([
      { at: 0, pose: 'walk' }, { at: Math.max(0, g.moveStart - 0.05), pose: 'push' },
      { at: s.revealAt, pose: 'hold' }, { at: Math.min(dur, s.revealAt + 0.22), pose: 'celebrate' }, { at: s.secondAt, pose: 'point' },
    ], Math.max(0.05, dur), (at, index) => at < s.revealAt ? 'push' : index % 2 === 0 ? 'point' : reactionPose(s.mood), at => at < s.revealAt ? 'determined' : s.mood);
    return cuesIn(dur, [
      cue(Math.max(0, g.moveStart - 0.12), 'footfall', 0.72, 112),
      cue(g.moveStart, 'whump', 0.9, g.startX),
      cue(s.revealAt, 'land', 1.45, 470),
      cue(s.revealAt + 0.08, 'thump', 0.88, 470),
      cue(s.secondAt, s.backTag ? 'paper' : 'knock', 0.9, 470),
      ...sampledTimes(timeline.gestures.filter(at => at >= s.revealAt), 3).map((at, i) => cue(at, i % 2 ? 'knock' : 'rustle', 0.55, 198)),
    ]);
  },
};
