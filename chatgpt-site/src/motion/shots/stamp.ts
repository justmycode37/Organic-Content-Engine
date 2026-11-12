// stamp — a heavy pixel word lands on paper beside a hero item while its actor reacts.
import type { Cue, Frame, ShotProps } from '../core.ts';
import { bob, clamp, ease, phase, squash, tween } from '../kit/motion.ts';
import { poof, ring, sparks } from '../kit/fx.ts';
import { drawStage, label } from '../kit/stage.ts';
import { measure } from '../kit/type.ts';
import { ACTORS, ITEMS, STAGE, beats, cue, cuesIn, drawActor, drawItem, itemParam, itemSize, pick, str, type ItemId } from './common.ts';
import type { HedgyKey } from '../actor/hedgy.ts';
import type { ShotDef } from './index.ts';

const MOODS = ['happy', 'worried', 'shocked', 'smug', 'determined', 'sad', 'neutral'] as const;
type Mood = (typeof MOODS)[number];
type Placement = 'below' | 'beside' | 'head';
const smoothInOut = (p: number) => 0.5 - Math.cos(Math.PI * clamp(p)) * 0.5;

interface Plan {
  dur: number;
  hitAt: number;
  reactionAt: number;
  who: string;
  item: ItemId;
  word: string;
  mood: Mood;
  placement: Placement;
}

function wordLineCount(text: string, maxWidth = 560): number {
  const maxCols = Math.max(8, Math.floor(maxWidth / 6) - 6);
  let lines = 0, line = '';
  for (const word of text.trim().split(/\s+/)) {
    if (!word) continue;
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate).cols <= maxCols) { line = candidate; continue; }
    if (line) { lines++; line = ''; }
    if (measure(word).cols <= maxCols) { line = word; continue; }
    let chunk = '';
    for (const char of [...word]) {
      const next = chunk + char;
      if (chunk && measure(next).cols > maxCols) { lines++; chunk = char; }
      else chunk = next;
    }
    line = chunk;
  }
  return Math.max(1, lines + (line ? 1 : 0));
}

function plan(props: ShotProps, dur: number): Plan {
  const [hitAt, reaction] = beats(props, dur, [Math.min(0.34, 0.96 / dur), Math.min(0.7, 2.4 / dur)]);
  const rawWord = str(props.params, 'word', 'CONCEPT').trim().toUpperCase()
    .replace(/[^A-Z0-9 $%+!?.,:'&/\-]/g, ' ').replace(/\s+/g, ' ').slice(0, 18);
  return {
    dur,
    hitAt: hitAt!,
    reactionAt: Math.min(dur, Math.max(reaction!, hitAt! + 0.3)),
    who: pick(props.params, 'who', ACTORS, 'hedgy'),
    item: itemParam(props.params, 'item', 'ticket'),
    word: rawWord || 'CONCEPT',
    mood: pick(props.params, 'mood', MOODS, 'shocked'),
    placement: pick(props.params, 'placement', ['below', 'beside', 'head'] as const, 'below'),
  };
}

function reactionPose(mood: Mood): HedgyKey['pose'] {
  if (mood === 'happy') return 'celebrate';
  if (mood === 'worried' || mood === 'sad') return 'sweat';
  if (mood === 'shocked') return 'shock';
  if (mood === 'smug') return 'smug';
  return 'hold';
}

function livelyKeys(base: HedgyKey[], dur: number, mood: Mood): { keys: HedgyKey[]; gestures: number[] } {
  const anchors = [...base].sort((a, b) => a.at - b.at), extras: HedgyKey[] = [];
  let index = 0;
  for (let i = 0; i < anchors.length; i++) {
    const left = anchors[i]!, right = anchors[i + 1];
    const end = Math.min(right?.at ?? dur, dur);
    for (let at = left.at + 0.48; at < end - 0.16 && at < dur - 0.12; at += 0.48) {
      extras.push({ at, pose: index++ % 2 === 0 ? 'point' : reactionPose(mood), expression: mood, look: 'up' });
    }
  }
  return { keys: [...anchors, ...extras].sort((a, b) => a.at - b.at), gestures: extras.map(key => key.at) };
}

function layout(s: Plan) {
  const size = itemSize(s.item);
  const itemX = Math.min(470, STAGE.w - 24 - size.w / 2);
  const restingY = ITEMS[s.item].base ? STAGE.floor - size.h / 2 : 450;
  const itemY = clamp(restingY, 24 + size.h / 2, 836 - size.h / 2);
  const actorX = clamp(itemX - size.w / 2 - 18, 150, 180);
  const wordWidth = Math.min(560, measure(s.word).w + 36);
  const lineCount = Math.min(2, wordLineCount(s.word));
  const wordHeight = 78 + (lineCount - 1) * 60;
  const itemTop = itemY - size.h / 2, itemBottom = itemY + size.h / 2;
  const minY = 24 + wordHeight / 2, maxY = 836 - wordHeight / 2;
  const gap = 4;
  let placement = s.placement;
  let stampX = itemX;
  let stampY = itemBottom + gap + wordHeight / 2;
  if (placement === 'below' && stampY > maxY) {
    const above = itemTop - gap - wordHeight / 2;
    if (above >= minY) stampY = above;
    else { placement = 'head'; stampY = STAGE.floor - 320 - wordHeight / 2 - 40; }
  } else if (placement === 'beside') {
    const left = itemX - size.w / 2 - 28 - wordWidth / 2;
    const right = itemX + size.w / 2 + 28 + wordWidth / 2;
    if (left >= 24 + wordWidth / 2) stampX = left;
    else if (right <= 696 - wordWidth / 2) stampX = right;
    else {
      const above = itemTop - gap - wordHeight / 2;
      const below = itemBottom + gap + wordHeight / 2;
      placement = above >= minY || below <= maxY ? 'below' : 'head';
      stampX = itemX;
      stampY = placement === 'below'
        ? (above >= minY ? above : below)
        : STAGE.floor - 320 - wordHeight / 2 - 40;
    }
    if (placement === 'beside') stampY = itemY;
  } else if (placement === 'head') {
    stampX = clamp(360, 24 + wordWidth / 2, 696 - wordWidth / 2);
    stampY = STAGE.floor - 320 - wordHeight / 2 - 40;
  }
  stampX = clamp(stampX, 24 + wordWidth / 2, 696 - wordWidth / 2);
  stampY = clamp(stampY, minY, maxY);
  return { size, itemX, actorX, itemY, wordWidth, wordHeight, stampX, stampY, placement };
}

function stampTiming(s: Plan, l: ReturnType<typeof layout>) {
  const desiredTravel = l.placement === 'below' ? l.size.h + 90 : Math.max(150, l.wordHeight + 90);
  const room = l.stampY - (24 + l.wordHeight / 2);
  const travel = Math.min(desiredTravel, Math.max(0, room), s.hitAt * 260);
  const duration = Math.max(0.001, travel / 260);
  return { travel, duration, startAt: Math.max(0, s.hitAt - duration) };
}

export const stampShot: ShotDef = {
  name: 'stamp',
  stage: 'clean',
  describe: "A full-size actor reacts as a red pixel word lands on a paper stamp plate beside or below a full-size item; params: who (any actor id in ACTORS, default hedgy), item (any item id in ITEMS, default ticket), word='CONCEPT' (up to 18 characters; long words wrap to two lines), mood='shocked'|'happy'|'worried'|'smug'|'determined'|'sad'|'neutral' (default shocked), placement='below'|'beside'|'head' (uses another clear stage position when the requested one does not fit). Events: 1 = the paper word stamp lands with squash and dust poof; 2 = the actor reacts and points at the stamped idea.",
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame, dur = Math.max(0.05, frame.dur), t = clamp(frame.t, 0, dur), s = plan(props, dur);
    const l = layout(s), { itemX, actorX, itemY, wordHeight, stampX, stampY } = l;
    const { travel, duration: moveDuration, startAt } = stampTiming(s, l);
    const progress = phase(t, startAt, s.hitAt);
    const falling = smoothInOut(progress);
    const stampStartY = stampY - travel;
    const movingY = tween(t, startAt, moveDuration, stampStartY, stampY, smoothInOut);
    const stampIdle = t >= s.hitAt ? bob(t - s.hitAt, 1.8, 3) : 0;
    const hitSquash = squash(t, s.hitAt, 0.18, 0.2);
    const stampScale = progress < 1 ? 0.96 + ease.outBack(falling) * 0.04 : 1 + bob(t - s.hitAt, 2.4, 0.01);
    const itemIdleY = bob(t, 1.8, 5);
    const itemHit = squash(t, s.hitAt, 0.1, 0.15);
    const timeline = livelyKeys([
      { at: 0, pose: 'hold', expression: 'neutral', look: 'up' },
      ...(s.hitAt > 0.04 ? [{ at: Math.max(0, startAt), pose: 'lookup' as const, expression: 'neutral' as const, look: 'up' as const }] : []),
      { at: s.hitAt, pose: 'shock', expression: 'shocked', look: 'up' },
      { at: Math.min(dur, s.hitAt + 0.3), pose: reactionPose(s.mood), expression: s.mood, look: 'up' },
      { at: s.reactionAt, pose: 'point', expression: s.mood, look: 'up' },
    ], dur, s.mood);

    drawStage(ctx, { floorY: STAGE.floor, line: true });
    drawItem(ctx, s.item, { x: itemX, y: itemY + itemIdleY, t, scale: 1, sx: itemHit.sx, sy: itemHit.sy });
    ring(ctx, stampX, stampY, s.hitAt, t, { r: 112, width: 12, duration: 0.44 });
    poof(ctx, stampX, stampY + wordHeight * 0.32, s.hitAt, t, { count: 4, seed: frame.seed + 7, radius: 28, duration: 0.52 });
    sparks(ctx, stampX, stampY, s.hitAt, t, { count: 5, seed: frame.seed, duration: 0.4, size: 10 });
    ctx.save();
    ctx.translate(stampX, movingY + stampIdle);
    ctx.rotate((1 - progress) * -0.07 + (t >= s.hitAt ? Math.sin((Math.PI * 2 * (t - s.hitAt)) / 2.4) * 0.006 : 0));
    ctx.scale(hitSquash.sx, hitSquash.sy);
    label(ctx, s.word, 0, 0, { variant: 'stamp', maxWidth: 560, pop: stampScale });
    ctx.restore();
    drawActor(ctx, {
      who: s.who, x: actorX, y: STAGE.floor, facing: 1, scale: 1, time: t, look: 'up', keys: timeline.keys,
    });
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const s = plan(props, Math.max(0.05, dur)), l = layout(s), { startAt } = stampTiming(s, l);
    const timeline = livelyKeys([
      { at: 0, pose: 'hold' },
      ...(s.hitAt > 0.04 ? [{ at: Math.max(0, startAt), pose: 'lookup' as const }] : []),
      { at: s.hitAt, pose: 'shock' },
      { at: Math.min(dur, s.hitAt + 0.3), pose: reactionPose(s.mood) },
      { at: s.reactionAt, pose: 'point' },
    ], Math.max(0.05, dur), s.mood);
    return cuesIn(dur, [
      cue(Math.max(0, startAt - 0.12), 'creak', 0.65, l.stampX),
      cue(startAt, 'slide', 0.8, l.stampX),
      cue(s.hitAt, 'stamp', 1.55, l.stampX),
      cue(s.hitAt + 0.06, 'sub', 0.9, l.stampX),
      cue(s.reactionAt, 'knock', 0.75, l.actorX),
      ...timeline.gestures.filter(at => at >= s.hitAt).slice(0, 3).map((at, i) => cue(at, i % 2 ? 'rustle' : 'knock', 0.55, l.actorX)),
    ]);
  },
};
