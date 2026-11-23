// versus — two big option cards side by side (item, price, when/label); then the gap between them
// slams down as a large number while the losing card dims. The comparison climax of a story.
import type { Cue, Frame, ShotProps } from '../core.ts';
import { bob, clamp, ease, phase, squash } from '../kit/motion.ts';
import { poof, sparks } from '../kit/fx.ts';
import { drawStage, label } from '../kit/stage.ts';
import { Grid, PAL } from '../kit/pixel.ts';
import { drawSprite, type Sprite } from '../kit/sprite.ts';
import { ACTORS, STAGE, beats, cue, cuesIn, drawActor, drawItem, itemParam, itemSize, pick, str, type ItemId } from './common.ts';
import type { HedgyKey } from '../actor/hedgy.ts';
import type { ShotDef } from './index.ts';

const PICKS = ['left', 'right', 'none'] as const;
const MOODS = ['happy', 'worried', 'shocked', 'smug', 'determined', 'sad', 'neutral'] as const;
const CARD = { w: 270, h: 336, y: 322, left: 210, right: 510 } as const;
const short = (v: string, n: number) => v.toUpperCase().replace(/\s+/g, ' ').trim().slice(0, n);

let cardCache: Sprite | undefined;
function cardSprite(): Sprite {
  if (cardCache) return cardCache;
  const g = new Grid(CARD.w / 6, CARD.h / 6);
  g.round(0, 0, CARD.w / 6, CARD.h / 6, 3, PAL.paper).rect(1, CARD.h / 6 - 4, CARD.w / 6 - 2, 3, PAL.paperShade).outline(PAL.ink);
  return (cardCache = g.sprite('versus-card'));
}

interface Plan { left: ItemId; right: ItemId; leftPrice: string; rightPrice: string; leftLabel: string; rightLabel: string; gap: string; pick: typeof PICKS[number]; who: string; mood: typeof MOODS[number]; inL: number; inR: number; hit: number }
function plan(props: ShotProps, dur: number): Plan {
  const p = props.params, [a, b, c] = beats(props, dur, [0.12, 0.38, 0.66]);
  const inL = Math.min(a!, dur * 0.4), inR = Math.max(inL + 0.25, Math.min(b!, dur * 0.7)), hit = Math.max(inR + 0.3, Math.min(c!, dur - 0.35));
  return {
    left: itemParam(p, 'left', 'cash'), right: itemParam(p, 'right', 'cash'),
    leftPrice: short(str(p, 'leftPrice', '$300'), 8), rightPrice: short(str(p, 'rightPrice', '$240'), 8),
    leftLabel: short(str(p, 'leftLabel', 'LATER'), 12), rightLabel: short(str(p, 'rightLabel', 'NOW'), 12),
    gap: short(str(p, 'gap', ''), 14), pick: pick(p, 'pick', PICKS, 'none'), who: pick(p, 'who', [...ACTORS, 'none'], 'hedgy'),
    mood: pick(p, 'mood', MOODS, 'shocked'), inL, inR, hit,
  };
}

function drawCard(ctx: Frame['ctx'], s: Plan, side: 'left' | 'right', t: number, enter: number, dim: number, win: number) {
  const x = side === 'left' ? CARD.left : CARD.right, from = side === 'left' ? -260 : STAGE.w + 260;
  const cx = from + (x - from) * ease.outBack(enter), cy = CARD.y + bob(t + (side === 'left' ? 0 : 0.7), 2.2, 4) - win * 10;
  if (enter <= 0) return;
  const item = side === 'left' ? s.left : s.right, price = side === 'left' ? s.leftPrice : s.rightPrice, text = side === 'left' ? s.leftLabel : s.rightLabel;
  ctx.save();
  ctx.globalAlpha *= 1 - dim * 0.55;
  ctx.translate(cx, cy); ctx.rotate((1 - enter) * (side === 'left' ? -0.2 : 0.2) + dim * (side === 'left' ? -0.06 : 0.06)); ctx.scale(1 + win * 0.06, 1 + win * 0.06);
  drawSprite(ctx, cardSprite(), 0, 0, { anchor: [0.5, 0.5] });
  const size = itemSize(item), scale = Math.min(0.55, 180 / size.w, 110 / size.h);
  drawItem(ctx, item, { x: 0, y: -92, t, scale });
  label(ctx, price, 0, 26, { variant: 'sign', size: 108, maxWidth: 240, singleLine: true, bg: PAL.paper });
  label(ctx, text, 0, 118, { variant: 'tag', maxWidth: 236, singleLine: true, bg: side === 'left' ? PAL.blue1 : PAL.gold1 });
  if (dim > 0.02) { ctx.globalAlpha = dim; ctx.strokeStyle = PAL.red2; ctx.lineWidth = 14; ctx.beginPath(); ctx.moveTo(-120, -150); ctx.lineTo(120, 150); ctx.stroke(); }
  ctx.restore();
}

export const versusShot: ShotDef = {
  name: 'versus',
  stage: 'clean',
  describe: 'Two big option cards slide in side by side, each with an item, a large price and a short when/label (e.g. $300 SATURDAY vs $240 TODAY); then the gap between them slams down as a huge number while the losing card is crossed out and the chosen card lifts; an actor below reacts. Use it for the comparison or reveal at the heart of a story. params: left/right (item ids, default cash), leftPrice/rightPrice (up to 8 characters, e.g. $300), leftLabel/rightLabel (up to 12 characters, e.g. SATURDAY, TODAY), gap (up to 14 characters with normal spaces, e.g. -$60 or SAVED $0.40), pick (left|right|none: the chosen card; the other is crossed out), who (actor id|none, default hedgy), mood (reaction). Events: 1 = left card slides in; 2 = right card slides in; 3 = the gap slams down.',
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame, dur = Math.max(0.05, frame.dur), t = clamp(frame.t, 0, dur), s = plan(props, dur);
    drawStage(ctx, { floorY: STAGE.floor, line: true, shadow: s.who === 'none' ? [] : [{ x: STAGE.centre, y: STAGE.floor - 3, w: 170 }] });
    const inL = phase(t, s.inL - 0.05, s.inL + 0.3), inR = phase(t, s.inR - 0.05, s.inR + 0.3), hit = phase(t, s.hit - 0.18, s.hit);
    const decided = ease.outCubic(phase(t, s.hit, s.hit + 0.3));
    const dimL = s.pick === 'right' ? decided : 0, dimR = s.pick === 'left' ? decided : 0;
    const winL = s.pick === 'left' ? decided : 0, winR = s.pick === 'right' ? decided : 0;
    drawCard(ctx, s, 'left', t, inL, dimL, winL);
    drawCard(ctx, s, 'right', t, inR, dimR, winR);
    if (s.who !== 'none') {
      const keys: HedgyKey[] = [
        { at: 0, pose: 'think', expression: 'neutral', look: 'up' },
        { at: s.inL, pose: 'point', expression: 'neutral', look: 'up' },
        { at: s.inR, pose: 'lookup', expression: 'worried', look: 'up' },
        { at: s.hit, pose: s.mood === 'happy' || s.mood === 'smug' ? 'celebrate' : 'shock', expression: s.mood, look: 'up' },
        { at: s.hit + 0.5, pose: 'point', expression: s.mood, look: 'up' },
      ];
      drawActor(ctx, { who: s.who, x: STAGE.centre, y: STAGE.floor, time: t, keys, scale: 0.72 });
    }
    if (s.gap && t >= s.hit - 0.18) {
      // The gap falls from above, squashes on impact and stays as the headline number.
      const y = -120 + (CARD.y + 200 + 120) * ease.inCubic(hit), sq = squash(t, s.hit, 0.3, 0.3);
      ctx.save(); ctx.translate(STAGE.centre, y); ctx.scale(sq.sx, sq.sy); ctx.rotate(-0.05);
      label(ctx, s.gap, 0, 0, { variant: 'stamp', size: 108, maxWidth: 440, singleLine: true, bg: PAL.paper });
      ctx.restore();
      sparks(ctx, STAGE.centre, CARD.y + 200, s.hit, t, { count: 8, seed: frame.seed, duration: 0.5 });
      poof(ctx, STAGE.centre, CARD.y + 250, s.hit, t, { count: 5, seed: frame.seed + 2, radius: 40 });
    }
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const s = plan(props, Math.max(0.05, dur));
    return cuesIn(dur, [cue(s.inL, 'slide', 1, CARD.left), cue(s.inL + 0.28, 'thump', 0.8, CARD.left), cue(s.inR, 'slide', 1, CARD.right), cue(s.inR + 0.28, 'thump', 0.8, CARD.right), cue(s.hit, 'impact', 1.5), ...(s.pick !== 'none' ? [cue(s.hit + 0.2, 'paper', 0.8)] : [])]);
  },
};
