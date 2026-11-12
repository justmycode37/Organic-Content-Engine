// news — an item-specific announcement appears and the nearby character reacts.
import type { Cue, Frame, ShotProps } from '../core.ts';
import { clamp, ease, phase, tween } from '../kit/motion.ts';
import { drawStage, label } from '../kit/stage.ts';
import { ring, sparks } from '../kit/fx.ts';
import { ACTORS, STAGE, actorBounds, beats, cue, cuesIn, drawActor, drawItem, itemParam, itemSize, pick, str, type ItemId } from './common.ts';
import type { HedgyKey } from '../actor/hedgy.ts';
import type { ShotDef } from './index.ts';

const MEDIUMS = ['poster', 'megaphone', 'phone'] as const;
const ARTS = ['band', 'star', 'megaphone', 'chart'] as const;
const MOODS = ['shocked', 'happy', 'worried'] as const;
const HERO_X = 350;
const HERO_Y = 382;
const POSTER_X = 290;
const ACTOR_X = 610;
const ACTOR_FLOOR = 770;

type Medium = (typeof MEDIUMS)[number];
type Mood = (typeof MOODS)[number];

function productWord(item: ItemId): string {
  const special: Partial<Record<ItemId, string>> = {
    ticket: 'TICKET', ticketStack: 'TICKETS', cash: 'CASH', cashPile: 'CASH', coin: 'COIN', coinStack: 'COINS',
    priceTag: 'PRICE', barChart: 'CHART', appleCrate: 'APPLES', lemonade: 'LEMONADE', pizza: 'PIZZA',
    snowball: 'SNOWBALL', banknote: 'CASH', gold: 'GOLD', phone: 'PHONE', car: 'CAR', house: 'HOUSE',
  };
  return (special[item] ?? item.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[^A-Za-z0-9 ]/g, ' ').toUpperCase()).slice(0, 10);
}

function plan(props: ShotProps, dur: number) {
  const [announceAt, reactAt] = beats(props, dur, [0.32, 0.68]);
  const item = itemParam(props.params, 'item', 'ticket');
  const rawWord = str(props.params, 'word', productWord(item));
  const word = rawWord.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').trim().replace(/\s+/g, ' ').slice(0, 12) || productWord(item);
  return {
    announceAt: announceAt!,
    reactAt: Math.min(dur, Math.max(reactAt!, announceAt! + 0.24)),
    medium: pick(props.params, 'medium', MEDIUMS, 'poster'),
    art: pick(props.params, 'art', ARTS, 'star'),
    item,
    who: pick(props.params, 'who', ACTORS, 'hedgy'),
    mood: pick(props.params, 'mood', MOODS, 'shocked'),
    word,
    label: str(props.params, 'label', '').trim().toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').slice(0, 8),
  };
}

function reactionPose(mood: Mood): HedgyKey['pose'] {
  return mood === 'happy' ? 'celebrate' : mood === 'worried' ? 'sweat' : 'shock';
}

function reactionKeys(announceAt: number, reactAt: number, dur: number, mood: Mood): HedgyKey[] {
  const expression: HedgyKey['expression'] = mood === 'happy' ? 'happy' : mood === 'worried' ? 'worried' : 'shocked';
  const keys: HedgyKey[] = [
    { at: 0, pose: 'lookup', expression: 'neutral', look: 'up' },
    { at: Math.max(0, announceAt - 0.12), pose: 'walk', expression: 'neutral', look: 'up' },
    { at: announceAt, pose: 'point', expression: 'neutral', look: 'up' },
    { at: Math.max(announceAt + 0.12, reactAt - 0.12), pose: 'lookup', expression: 'neutral', look: 'up' },
    { at: reactAt, pose: 'shock', expression, look: 'up' },
    { at: Math.min(dur, reactAt + 0.28), pose: reactionPose(mood), expression: mood === 'happy' ? 'happy' : mood === 'worried' ? 'worried' : 'shocked', look: 'up' },
  ];
  for (let at = reactAt + 0.56, i = 0; at < dur - 0.06; at += 0.46, i++) {
    keys.push({ at, pose: i % 2 === 0 ? 'point' : reactionPose(mood), expression, look: 'up' });
  }
  return keys.sort((a, b) => a.at - b.at);
}

function productScale(item: ItemId, maxSide: number): number {
  const size = itemSize(item);
  return Math.min(0.5, maxSide / Math.max(size.w, size.h));
}

export const newsShot: ShotDef = {
  name: 'news',
  stage: 'clean',
  describe: 'A poster, megaphone, or phone reveals the chosen item with its short word; the announcement makes a full-size actor recoil, then point and react in the chosen mood. params: medium (poster|megaphone|phone, default poster), item (any item id, default ticket), word (short headline, defaults to the item name), art (legacy poster motif band|star|megaphone|chart; band becomes a neutral starburst behind the item), who (any actor id, default hedgy), mood (shocked|happy|worried, default shocked), label (optional short word below the action). Events: 1 reveals or lights the item announcement; 2 makes the actor recoil and react; the medium keeps a small secondary motion while the actor points or reacts again.',
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame, dur = Math.max(0.05, frame.dur), t = clamp(frame.t, 0, dur), s = plan(props, dur);
    const revealStart = Math.max(0, s.announceAt - 0.28);
    const reveal = ease.outCubic(phase(t, revealStart, s.announceAt + 0.04));
    const afterReveal = Math.max(0, t - s.announceAt);
    const mediumBob = Math.sin(t * 3.2) * 4 * reveal;
    const actorX = tween(t, s.reactAt - 0.12, 0.24, ACTOR_X, ACTOR_X - 18, ease.outBack);
    const actorJump = 24 * Math.sin(Math.PI * phase(t, s.reactAt, s.reactAt + 0.34));
    const actorKeys = reactionKeys(s.announceAt, s.reactAt, dur, s.mood);
    const actorY = ACTOR_FLOOR - actorJump;
    const actorBox = actorBounds({ who: s.who, x: actorX, y: actorY, scale: 1, time: t, keys: actorKeys });
    const actorCorrection = actorBox.right > 692 ? 692 - actorBox.right : actorBox.left < 28 ? 28 - actorBox.left : 0;
    const posterArt = s.art === 'band' ? 'star' : s.art;
    const posterWord = s.word.split(' ')[0]!.slice(0, 8);

    drawStage(ctx, { floorY: ACTOR_FLOOR, line: true, shadow: [{ x: ACTOR_X, y: ACTOR_FLOOR - 3, w: 210 }] });
    if (s.medium === 'poster') {
      const posterY = HERO_Y + (1 - reveal) * 60 + mediumBob;
      drawItem(ctx, 'poster', {
        x: POSTER_X, y: posterY, t, scale: 0.82, reveal,
        word: posterWord, art: posterArt,
      });
      drawItem(ctx, s.item, {
        x: POSTER_X, y: posterY - 50, t, scale: productScale(s.item, 240),
        alpha: reveal, rot: Math.sin(t * 2.6) * 0.018,
      });
    } else if (s.medium === 'megaphone') {
      const megaphoneX = 220;
      const megaphoneY = 488 + mediumBob;
      drawItem(ctx, 'megaphone', {
        x: megaphoneX, y: megaphoneY, t, scale: 0.88 * reveal,
        blast: reveal * (0.85 + 0.15 * Math.sin(afterReveal * 4.2)),
      });
      const itemX = 465 + Math.sin(afterReveal * 2.8) * 5 * reveal;
      drawItem(ctx, s.item, {
        x: itemX, y: 432 + mediumBob * 0.7, t, scale: productScale(s.item, 170), alpha: reveal,
      });
      if (reveal > 0.05) label(ctx, s.word, 465, 230 + mediumBob * 0.45, { variant: 'bubble', maxWidth: 450, pop: 0.92 + 0.08 * reveal });
      ring(ctx, 280, megaphoneY, s.announceAt, t, { r: 68, duration: 0.42 });
      sparks(ctx, 280, megaphoneY, s.announceAt, t, { count: 4, seed: frame.seed, duration: 0.38 });
    } else {
      const phoneY = 480 + mediumBob;
      drawItem(ctx, 'phone', { x: HERO_X, y: phoneY, t, scale: 0.94 * reveal, direction: 'up' });
      drawItem(ctx, s.item, {
        x: HERO_X, y: phoneY + 1, t, scale: productScale(s.item, 92), alpha: reveal,
      });
      if (reveal > 0.05) label(ctx, s.word, HERO_X, 170 + mediumBob * 0.45, { variant: 'tag', maxWidth: 390, pop: 0.92 + 0.08 * reveal });
      for (let pulse = s.announceAt; pulse <= t; pulse += 0.78) {
        ring(ctx, HERO_X, phoneY, pulse, t, { r: 90, duration: 0.44 });
      }
    }

    drawActor(ctx, {
      who: s.who, x: actorX + actorCorrection, y: actorY, scale: 1, facing: 1,
      time: t, look: t < s.reactAt ? 'up' : 'forward', keys: actorKeys,
    });
    if (s.label) label(ctx, s.label, 360, 822, { variant: 'sign', maxWidth: 300 });
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const d = Math.max(0.05, dur), s = plan(props, d);
    const mediumX = s.medium === 'poster' ? POSTER_X : s.medium === 'phone' ? HERO_X : 250;
    return cuesIn(d, [
      cue(Math.max(0, s.announceAt - 0.24), s.medium === 'poster' ? 'rustle' : 'creak', 0.7, mediumX),
      cue(s.announceAt, s.medium === 'megaphone' ? 'whump' : s.medium === 'phone' ? 'ding' : 'paper', 1.35, mediumX),
      cue(Math.min(d, s.announceAt + 0.18), 'slide', 0.75, mediumX + 30),
      cue(Math.max(0, s.reactAt - 0.1), 'thump', 0.65, ACTOR_X),
      cue(s.reactAt, s.mood === 'happy' ? 'land' : 'whump', 1.35, ACTOR_X),
      cue(Math.min(d, s.reactAt + 0.28), s.mood === 'worried' ? 'rustle' : 'knock', 0.65, ACTOR_X),
    ]);
  },
};
