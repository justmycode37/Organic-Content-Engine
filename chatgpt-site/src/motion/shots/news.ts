// news — a clear, parameter-driven announcement and reaction.
import type { Cue, Frame, ShotProps } from '../core.ts';
import { clamp, ease, phase, tween } from '../kit/motion.ts';
import { drawStage, label } from '../kit/stage.ts';
import { measure } from '../kit/type.ts';
import { ring, sparks } from '../kit/fx.ts';
import { ACTORS, STAGE, actorBounds, beats, cue, cuesIn, drawActor, drawItem, pick, str } from './common.ts';
import type { HedgyKey } from '../actor/hedgy.ts';
import type { ShotDef } from './index.ts';

const MEDIUMS = ['poster', 'megaphone', 'phone'] as const;
const ARTS = ['band', 'star', 'megaphone', 'chart'] as const;
const MOODS = ['shocked', 'happy', 'worried'] as const;
const HERO_X = 285;
const HERO_Y = 382;
const POSTER_X = 206;
const POSTER_SCALE = 0.66;
const ACTOR_X = 522;
const ACTOR_FLOOR = 770;

type Medium = (typeof MEDIUMS)[number];
type Mood = (typeof MOODS)[number];

function wordParam(props: ShotProps): string {
  const word = str(props.params, 'word', 'REUNION')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 12);
  return word || 'NEWS';
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

function plan(props: ShotProps, dur: number) {
    const [announceAt, reactAt] = beats(props, dur, [0.34, 0.72]);
  return {
    announceAt: announceAt!,
    reactAt: Math.min(dur, Math.max(reactAt!, announceAt! + 0.24)),
    medium: pick(props.params, 'medium', MEDIUMS, 'poster'),
    art: pick(props.params, 'art', ARTS, 'band'),
    who: pick(props.params, 'who', ACTORS, 'hedgy'),
    mood: pick(props.params, 'mood', MOODS, 'shocked'),
    word: wordParam(props),
    label: str(props.params, 'label', '').trim(),
  };
}

function reactionPose(mood: Mood): HedgyKey['pose'] {
  return mood === 'happy' ? 'celebrate' : mood === 'worried' ? 'sweat' : 'shock';
}

function reactionKeys(announceAt: number, reactAt: number, dur: number, mood: Mood): HedgyKey[] {
  const expression = mood as HedgyKey['expression'];
  const keys: HedgyKey[] = [
    { at: 0, pose: 'idle', expression: 'neutral', look: 'forward' },
    { at: Math.max(0, Math.min(0.14, announceAt - 0.18)), pose: 'lookup', expression: 'neutral', look: 'up' },
    { at: reactAt, pose: 'shock', expression: mood === 'happy' ? 'happy' : mood === 'worried' ? 'worried' : 'shocked', look: 'up' },
    { at: Math.min(dur, reactAt + 0.3), pose: reactionPose(mood), expression, look: 'up' },
  ];
  for (let at = reactAt + 0.58, i = 0; at < dur - 0.08; at += 0.5, i++) {
    keys.push({ at, pose: i % 2 === 0 ? 'point' : reactionPose(mood), expression, look: 'up' });
  }
  return keys.sort((a, b) => a.at - b.at);
}

export const newsShot: ShotDef = {
  name: 'news',
  stage: 'clean',
  describe: "A full-size actor reacts beside a full-size poster, megaphone, or phone announcement; params: medium='poster'|'megaphone'|'phone' (default poster), word='REUNION' (headline), art='band'|'star'|'megaphone'|'chart' (default band), who (any actor id in ACTORS, default hedgy), mood='shocked'|'happy'|'worried' (default shocked), label='' (optional short paper label below the scene). Events: 1 = the medium reveals its word or lights up; 2 = the actor recoils and reacts in the chosen mood.",
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame, dur = Math.max(0.05, frame.dur), t = clamp(frame.t, 0, dur), s = plan(props, dur);
    const revealStart = 0;
    const revealDuration = Math.min(0.24, dur);
    const revealEnd = revealStart + revealDuration;
    const revealProgress = phase(t, revealStart, revealEnd);
    const reveal = s.medium === 'poster' ? revealProgress : ease.outCubic(revealProgress);
    const headline = ease.outBack(phase(t, s.reactAt - 0.12, s.reactAt));
    const actorX = tween(t, s.reactAt - 0.1, 0.24, ACTOR_X, ACTOR_X - 10, ease.outBack);
    const actorJump = 38 * Math.sin(Math.PI * phase(t, s.reactAt, s.reactAt + 0.38));
    const settleAge = Math.max(0, t - s.reactAt - 0.18);
    const settle = t < s.reactAt + 0.18 ? 0 : Math.sin(settleAge * 13) * Math.exp(-settleAge * 5) * 4;
    const floatGate = ease.outCubic(phase(t, revealEnd, revealEnd + 0.22));
    const mediumFloat = Math.sin(t * 3.4) * 7 * floatGate;
    const expression = s.mood as 'shocked' | 'happy' | 'worried';
    const actorKeys = reactionKeys(s.announceAt, s.reactAt, dur, s.mood);
    const actorY = ACTOR_FLOOR - actorJump;
    const actorBoundsNow = actorBounds({ who: s.who, x: actorX + settle, y: actorY, scale: 1, time: t, keys: actorKeys });
    const actorCorrection = actorBoundsNow.right > 696 ? 696 - actorBoundsNow.right : actorBoundsNow.left < 24 ? 24 - actorBoundsNow.left : 0;
    const drawReactingActor = () => drawActor(ctx, {
      who: s.who,
      x: actorX + settle + actorCorrection,
      y: actorY,
      scale: 1,
      facing: 1,
      time: t,
      look: t < s.reactAt ? 'up' : 'forward',
      keys: actorKeys,
    });

    drawStage(ctx, { floorY: ACTOR_FLOOR, line: true });

    if (s.medium === 'poster') {
      drawItem(ctx, 'poster', {
        x: POSTER_X, y: HERO_Y + mediumFloat, t, scale: POSTER_SCALE, reveal, word: ' ', art: s.art,
      });
    } else if (s.medium === 'megaphone') {
      const broadcast = reveal * (0.9 + 0.1 * Math.sin(Math.max(0, t - s.announceAt) * 4.4));
      drawItem(ctx, 'megaphone', {
        x: HERO_X, y: 482 + mediumFloat * 0.65, t, scale: 1, blast: broadcast,
      });
      label(ctx, s.word, HERO_X + 190, 326 + mediumFloat * 0.65, {
        variant: 'bubble', maxWidth: 340, pop: headline,
      });
    } else {
      const phonePop = ease.outBack(phase(t, s.announceAt - 0.1, s.announceAt + 0.18));
      drawItem(ctx, 'phone', {
        x: HERO_X, y: 472 + mediumFloat * 0.55, t, scale: phonePop, direction: 'up',
      });
      label(ctx, s.word, HERO_X, 190 + mediumFloat * 0.45, {
        variant: 'tag', maxWidth: 420, pop: headline,
      });
      for (let pulse = s.announceAt; pulse <= t; pulse += 0.86) {
        ring(ctx, HERO_X, 472 + mediumFloat * 0.55, pulse, t, { r: 108, duration: 0.5 });
      }
    }

    drawReactingActor();

    // The large word plate stays centered over its poster.
    if (s.medium === 'poster') label(ctx, s.word, POSTER_X, 116 + mediumFloat, {
      variant: 'sign', maxWidth: 420, pop: headline,
    });

    // Editorial copy is absent unless the spec explicitly asks for a label.
    // One line below the floor keeps it clear of the announcement and actor.
    if (s.label) label(ctx, oneLine(s.label, 600), 360, 812, { variant: 'sign', maxWidth: 600, pop: headline });

    const effectY = s.medium === 'poster' ? HERO_Y + mediumFloat : 482 + mediumFloat * 0.65;
    ring(ctx, HERO_X + 24, effectY, s.announceAt + 0.28, t, { r: 76, duration: 0.42 });
    sparks(ctx, HERO_X + 24, effectY, s.announceAt + 0.24, t, { count: 5, seed: frame.seed, duration: 0.44 });
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const d = Math.max(0.05, dur), s = plan(props, d);
    const mediumX = s.medium === 'poster' ? HERO_X : HERO_X + 70;
    return cuesIn(d, [
      cue(Math.max(0, s.announceAt - 0.38), s.medium === 'poster' ? 'rustle' : 'creak', 0.7, mediumX),
      cue(s.announceAt, s.medium === 'megaphone' ? 'whump' : s.medium === 'phone' ? 'ding' : 'paper', 1.45, mediumX),
      cue(s.announceAt + 0.24, 'slide', 0.75, mediumX),
      cue(Math.max(0, s.reactAt - 0.1), 'thump', 0.65, ACTOR_X),
      cue(s.reactAt, s.mood === 'happy' ? 'land' : 'whump', 1.4, ACTOR_X),
      cue(s.reactAt + 0.28, s.mood === 'worried' ? 'rustle' : 'knock', 0.65, ACTOR_X),
    ]);
  },
};
