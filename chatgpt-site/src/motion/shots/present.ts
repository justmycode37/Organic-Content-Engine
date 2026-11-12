// present — an actor reveals a hero item as a clear definition or hook.
import type { Cue, Frame, ShotProps } from '../core.ts';
import { bob, clamp, ease, phase, squash, tween } from '../kit/motion.ts';
import { poof, ring, sparks } from '../kit/fx.ts';
import { connector, drawStage, label } from '../kit/stage.ts';
import { measure } from '../kit/type.ts';
import { ACTORS, ITEMS, STAGE, beats, cue, cuesIn, drawActor, drawItem, itemParam, itemSize, pick, str, type ItemId } from './common.ts';
import type { HedgyKey } from '../actor/hedgy.ts';
import type { ShotDef } from './index.ts';

const MOODS = ['happy', 'worried', 'shocked', 'smug', 'determined', 'sad', 'neutral'] as const;
type Mood = (typeof MOODS)[number];
type Reveal = 'drop' | 'lift';
const smoothInOut = (p: number) => 0.5 - Math.cos(Math.PI * clamp(p)) * 0.5;
function actorLayout(_who: string, itemX: number, itemWidth: number) {
  return { x: clamp(itemX - itemWidth / 2 - 18, 150, 180), scale: 1 };
}

interface Plan {
  dur: number;
  revealAt: number;
  secondAt: number;
  who: string;
  item: ItemId;
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
  return {
    dur,
    revealAt: revealAt!,
    secondAt: Math.min(dur, Math.max(second!, revealAt! + 0.28)),
    who: pick(p, 'who', ACTORS, 'hedgy'),
    item,
    tag: str(p, 'tag', 'ASSET').toUpperCase(),
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
  label(ctx, text, 0, 0, { variant: 'tag', maxWidth: 520, rot: idleRot + Math.sin(Math.PI * p) * 0.08, pop });
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

export const presentShot: ShotDef = {
  name: 'present',
  stage: 'clean',
  describe: "An actor proudly reveals a large hero item with a hanging tag and optional one-line name plate. params: who='hedgy' (any actor id in ACTORS), item='ticket' (any item id in ITEMS), tag='ASSET' (hanging word), backTag='' (optional second-beat replacement word), label='' (optional short name plate, ellipsized to fit), mood='happy'|'worried'|'shocked'|'smug'|'determined'|'sad'|'neutral' (actor expression), reveal='lift'|'drop'. Events: 1 = item rises or drops and settles; 2 = the tag flips to backTag when set, while the actor points at the item.",
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame, dur = Math.max(0.05, frame.dur), t = clamp(frame.t, 0, dur), s = plan(props, dur);
    const size = itemSize(s.item);
    const itemX = Math.min(490, STAGE.w - 24 - size.w / 2);
    const { x: actorX, scale: actorScale } = actorLayout(s.who, itemX, size.w);
    const restingY = ITEMS[s.item].base ? STAGE.floor - size.h / 2 : 450;
    const itemY = clamp(restingY, 24 + size.h / 2, 836 - size.h / 2);
    const room = s.reveal === 'drop'
      ? itemY - (24 + size.h / 2)
      : STAGE.h - 24 - size.h / 2 - itemY;
    const travel = Math.min(170, Math.max(0, room), s.revealAt * 260);
    const startY = itemY + (s.reveal === 'drop' ? -travel : travel);
    const moveDuration = Math.max(0.001, travel < 120 ? s.revealAt : travel / 260);
    const moveStart = Math.max(0, s.revealAt - moveDuration);
    const moveProgress = phase(t, moveStart, s.revealAt);
    const lift = s.reveal === 'lift' ? 8 : 0;
    const flight = tween(t, moveStart, Math.max(0.001, s.revealAt - moveStart), startY, itemY, smoothInOut) - Math.sin(moveProgress * Math.PI) * lift;
    const itemIdleY = t >= s.revealAt ? bob(t - s.revealAt, 1.8, 8) : 0;
    const itemDrawY = flight + itemIdleY;
    const hit = squash(t, s.revealAt, 0.2, 0.22);
    const itemScale = t < moveStart ? 1 : 0.92 + ease.outBack(moveProgress) * 0.08;
    const tagAbove = itemY - size.h / 2 >= 112;
    const tagX = itemX;
    const tagY = tagAbove ? itemDrawY - size.h / 2 - 56 : itemDrawY - size.h / 2 + 72;
    const tagProgress = s.backTag ? phase(t, s.secondAt - 0.14, s.secondAt + 0.14) : 0;
    const tagText = s.backTag && tagProgress >= 0.5 ? s.backTag : s.tag;
    const timeline = livelyKeys([
      { at: 0, pose: 'think', expression: 'neutral', look: 'up' },
      ...(s.revealAt > 0.04 ? [{ at: Math.max(0, s.revealAt - 0.22), pose: s.reveal === 'drop' ? 'lookup' as const : 'hold' as const, expression: 'neutral' as const, look: 'up' as const }] : []),
      { at: s.revealAt, pose: 'receive', expression: 'happy', look: 'up' },
      { at: Math.min(dur, s.revealAt + 0.22), pose: 'hold', expression: s.mood, look: 'up' },
      { at: s.secondAt, pose: 'point', expression: s.mood, look: 'up' },
    ], dur, (at, index) => at < s.revealAt ? 'lookup' : index % 2 === 0 ? 'point' : reactionPose(s.mood), at => at < s.revealAt ? 'neutral' : s.mood);

    drawStage(ctx, { floorY: STAGE.floor, line: true });
    ring(ctx, itemX, itemY, s.revealAt, t, { r: 98, duration: 0.38 });
    sparks(ctx, itemX, itemY - size.h * 0.18, s.revealAt, t, { count: 5, seed: frame.seed, duration: 0.42 });
    poof(ctx, itemX, itemY + size.h * 0.3, s.revealAt, t, { count: 3, seed: frame.seed + 3, radius: 22, duration: 0.34 });
    const itemTop = itemDrawY - size.h / 2;
    if (moveProgress > 0.08) connector(ctx, { x: tagX, y: tagY + 34 }, { x: tagX, y: itemTop + (tagAbove ? 2 : 0) }, { width: 9, slack: 12, curve: tagAbove ? 0 : 26 });
    drawItem(ctx, s.item, {
      x: itemX, y: itemDrawY, t,
      scale: itemScale, sx: hit.sx, sy: hit.sy, ...(s.item === 'ticket' ? { tag: 'none' } : {}),
    });
    if (t >= moveStart && s.tag) {
      cleanText(ctx, tagText, tagX, tagY + bob(t, 2.15, 4), t, s.secondAt, Boolean(s.backTag), Math.sin((Math.PI * 2 * t) / 2.15) * 0.055, Math.max(0.08, ease.outBack(phase(t, moveStart, Math.min(s.revealAt, moveStart + 0.2)))));
    }
    drawActor(ctx, {
      who: s.who, x: actorX, y: STAGE.floor, facing: 1, scale: actorScale, time: t, look: t < s.secondAt ? 'up' : 'forward', keys: timeline.keys,
      handTarget: { x: itemX - size.w * 0.34, y: itemDrawY + size.h * 0.32 },
      reach: phase(t, moveStart, s.revealAt + 0.24),
    });
    if (s.nameplate) label(ctx, oneLine(s.nameplate, 600), 360, 812, { variant: 'sign', maxWidth: 600, pop: ease.outBack(phase(t, 0.04, 0.28)) });
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const s = plan(props, Math.max(0.05, dur));
    const size = itemSize(s.item), itemY = clamp(450, 24 + size.h / 2, STAGE.floor - 32 - size.h / 2);
    const { x: actorX } = actorLayout(s.who, Math.min(490, STAGE.w - 24 - size.w / 2), size.w);
    const room = s.reveal === 'drop'
      ? itemY - (24 + size.h / 2)
      : STAGE.h - 24 - size.h / 2 - itemY;
    const travel = Math.min(170, Math.max(0, room), s.revealAt * 260);
    const moveStart = Math.max(0, s.revealAt - (travel < 120 ? s.revealAt : travel / 260));
    const timeline = livelyKeys([
      { at: 0, pose: 'think' },
      ...(s.revealAt > 0.04 ? [{ at: Math.max(0, s.revealAt - 0.22), pose: s.reveal === 'drop' ? 'lookup' as const : 'hold' as const }] : []),
      { at: s.revealAt, pose: 'receive' },
      { at: Math.min(dur, s.revealAt + 0.22), pose: 'hold' },
      { at: s.secondAt, pose: 'point' },
    ], Math.max(0.05, dur), (at, index) => at < s.revealAt ? 'lookup' : index % 2 === 0 ? 'point' : reactionPose(s.mood), at => at < s.revealAt ? 'neutral' : s.mood);
    return cuesIn(dur, [
      cue(Math.max(0, moveStart - 0.12), 'rustle', 0.55, 170),
      cue(moveStart, 'slide', 0.75, 360),
      cue(s.revealAt, 'land', 1.45, 490),
      cue(s.revealAt + 0.08, 'thump', 0.85, 490),
      cue(s.secondAt, s.backTag ? 'paper' : 'knock', 0.9, 490),
      ...sampledTimes(timeline.gestures.filter(at => at >= s.revealAt), 3).map((at, i) => cue(at, i % 2 ? 'knock' : 'rustle', 0.55, actorX)),
    ]);
  },
};
