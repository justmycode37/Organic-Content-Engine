// demand — one character asks another for an item, then sees the answer.
import type { Cue, Frame, ShotProps } from '../core.ts';
import { arc, clamp, ease, phase, squash, tween } from '../kit/motion.ts';
import { Grid, PAL } from '../kit/pixel.ts';
import { ART, drawSprite } from '../kit/sprite.ts';
import { measure, paintPixelText } from '../kit/type.ts';
import { drawStage, label } from '../kit/stage.ts';
import { poof, ring, sparks } from '../kit/fx.ts';
import { ACTORS, STAGE, beats, cue, cuesIn, drawActor, drawItem, itemParam, itemSize, pick, str, type ItemId } from './common.ts';
import type { ShotDef } from './index.ts';

type Outcome = 'empty' | 'pay' | 'refuse';
interface DemandPlan {
  demandAt: number;
  answerAt: number;
  from: string;
  to: string;
  fromLabel: string;
  toLabel: string;
  want: ItemId;
  word: string;
  outcome: Outcome;
}

const FROM_X = 145, TO_X = 575, BUBBLE_X = 360, BUBBLE_Y = 236;
const PAY_FROM = { x: 475, y: 690 }, PAY_TO = { x: 275, y: 680 }, PAY_TRAVEL = 0.46;

function plan(props: ShotProps, dur: number): DemandPlan {
  const [first, second] = beats(props, dur, [0.32, 0.68]);
  const rawWord = typeof props.params?.word === 'string' ? props.params.word.trim() : 'MORE';
  const word = rawWord.toUpperCase().replace(/[^A-Z0-9 $%+!?.,:'&/\-]/g, ' ').trim().slice(0, 8);
  return {
    demandAt: first ?? dur * 0.32,
    answerAt: Math.min(dur, Math.max(second ?? dur * 0.68, (first ?? dur * 0.32) + 0.34)),
    from: pick(props.params, 'from', ACTORS, 'broker'),
    to: pick(props.params, 'to', ACTORS, 'hedgy'),
    fromLabel: str(props.params, 'fromLabel', '').trim(),
    toLabel: str(props.params, 'toLabel', '').trim(),
    want: itemParam(props.params, 'want', 'cash'),
    word,
    outcome: pick(props.params, 'outcome', ['empty', 'pay', 'refuse'] as const, 'empty'),
  };
}

interface SpeechSprite { sprite: ReturnType<Grid['sprite']>; cols: number; rows: number; iconW: number; iconH: number }
const speechCache = new Map<string, SpeechSprite>();
function speechSprite(want: ItemId, word: string): SpeechSprite {
  const size = itemSize(want, 0.5), iconW = size.w / ART, iconH = size.h / ART;
  const text = word ? measure(word) : { cols: 0, rows: 0 };
  const pad = 3, gap = word ? 3 : 0, bodyW = Math.ceil(pad * 2 + iconW + gap + text.cols);
  const bodyH = Math.ceil(Math.max(iconH, text.rows) + 4), tailH = 5, cols = bodyW + 2, rows = bodyH + tailH;
  const key = `${want}:${word}:${cols}x${rows}`;
  const hit = speechCache.get(key);
  if (hit) return hit;
  const g = new Grid(cols, rows);
  g.round(1, 1, cols - 2, bodyH - 1, 2, PAL.paper);
  g.poly([{ x: 9, y: bodyH - 2 }, { x: 14, y: rows - 1 }, { x: 17, y: bodyH - 2 }], PAL.paper);
  g.outline(PAL.ink);
  if (word) {
    const textX = Math.ceil(1 + pad + iconW + gap);
    const textY = Math.floor((bodyH - text.rows) / 2);
    paintPixelText(g, word, textX, textY, PAL.ink);
  }
  const result = { sprite: g.sprite(`demand-speech:${key}`), cols, rows, iconW, iconH };
  speechCache.set(key, result);
  return result;
}

function drawWantedBubble(ctx: Frame['ctx'], s: DemandPlan, t: number, pop: number, bobY: number): void {
  if (pop <= 0.01) return;
  const plate = speechSprite(s.want, s.word), scale = pop;
  const width = plate.cols * ART * scale, height = plate.rows * ART * scale;
  drawSprite(ctx, plate.sprite, BUBBLE_X, BUBBLE_Y + bobY, { scale, anchor: [0.5, 0.5] });
  const iconX = BUBBLE_X - width / 2 + ART * scale * (1 + 3 + plate.iconW / 2);
  const iconY = BUBBLE_Y + bobY - height / 2 + ART * scale * (1 + (Math.max(plate.iconH, s.word ? measure(s.word).rows : 0) / 2));
  drawItem(ctx, s.want, { x: iconX, y: iconY, t, scale: 0.5 * scale });
}

export const demandShot: ShotDef = {
  name: 'demand',
  stage: 'clean',
  describe: "A full-size demander steps in with an open-palm thrust toward a paper bubble showing the wanted item and word, while the other actor reveals a wallet; params: from='broker' and to='hedgy' (any actor id in ACTORS), want='cash' (any item id in ITEMS), word='MORE' (short bubble word; empty hides it), outcome='empty'|'pay'|'refuse' (default empty), fromLabel='' and toLabel='' (optional name plates). Events: 1 = demander thrusts and shows the wanted item; 2 = responder opens and overturns an empty wallet, pays with the item, or waves the demander off.",
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame, dur = Math.max(0.05, frame.dur), t = clamp(frame.t, 0, dur), s = plan(props, dur);
    const stepStart = Math.max(0, s.demandAt - 0.48);
    const step = tween(t, stepStart, Math.max(0.01, s.demandAt - stepStart), 0, 1, ease.inOutCubic);
    const fromX = 112 + (FROM_X - 112) * step;
    const answer = phase(t, s.answerAt, s.answerAt + 0.26);
    const speechIn = ease.outCubic(phase(t, s.demandAt - 0.02, s.demandAt + 0.3));
    const speechOut = 1 - phase(t, s.answerAt + 0.52, s.answerAt + 0.82);
    const speechPop = speechIn * Math.max(0, speechOut);
    const talkPhase = Math.max(0, t - s.demandAt);
    const speechBob = t >= s.demandAt ? Math.sin(talkPhase * Math.PI * 2 / 1.1) * 4 : 0;
    const payU = s.outcome === 'pay' ? tween(t, s.answerAt + 0.08, PAY_TRAVEL, 0, 1, ease.inOutCubic) : 0;
    const payPos = arc(PAY_FROM, PAY_TO, 42, payU);
    const payArrived = s.answerAt + 0.08 + PAY_TRAVEL;
    const payHit = squash(t, payArrived, 0.16, 0.18);
    const thrustPulse = Math.sin(talkPhase * Math.PI * 2 / 0.72) * 7 * phase(t, s.demandAt, s.demandAt + 0.36);
    const fromKeys = [
      { at: 0, pose: 'idle' as const, expression: 'neutral' as const },
      { at: stepStart, pose: 'walk' as const, expression: 'determined' as const },
      { at: s.demandAt, pose: 'push' as const, expression: 'determined' as const },
      { at: Math.min(dur, s.demandAt + 0.24), pose: 'point' as const, expression: 'determined' as const },
      { at: Math.min(dur, s.demandAt + 0.62), pose: 'push' as const, expression: 'determined' as const },
      ...(s.outcome === 'pay' ? [
        { at: s.answerAt + 0.06, pose: 'receive' as const, expression: 'happy' as const },
        { at: payArrived, pose: 'hold' as const, expression: 'happy' as const },
      ] : []),
    ];
    const fromTarget = s.outcome === 'pay' && t >= s.answerAt
      ? { x: payPos.x - 28, y: payPos.y + 18 }
      : { x: 345 + thrustPulse, y: 640 };
    const fromActor = {
      who: s.from, x: fromX, y: STAGE.floor, facing: 1 as const, time: t, scale: 1, shadow: true,
      look: 'forward' as const, keys: fromKeys, handTarget: fromTarget,
      reach: s.outcome === 'pay' && t >= s.answerAt ? phase(t, s.answerAt, s.answerAt + 0.24) : phase(t, s.demandAt - 0.08, s.demandAt + 0.28),
    };

    const toX = TO_X + (s.outcome === 'refuse' && t >= s.answerAt ? 7 * Math.sin((t - s.answerAt) * Math.PI * 2 / 0.58) : 0);
    const toKeys = s.outcome === 'empty'
      ? [
        { at: 0, pose: 'idle' as const, expression: 'neutral' as const },
        { at: Math.max(0, s.answerAt - 0.2), pose: 'lookup' as const, expression: 'worried' as const },
        { at: s.answerAt, pose: 'shock' as const, expression: 'shocked' as const },
        { at: Math.min(dur, s.answerAt + 0.3), pose: 'sweat' as const, expression: 'sad' as const },
        { at: Math.min(dur, s.answerAt + 0.58), pose: 'empty' as const, expression: 'sad' as const },
        { at: Math.min(dur, s.answerAt + 0.98), pose: 'sweat' as const, expression: 'sad' as const },
      ]
      : s.outcome === 'pay'
        ? [
          { at: 0, pose: 'idle' as const, expression: 'neutral' as const },
          { at: s.answerAt, pose: 'give' as const, expression: 'worried' as const },
          { at: Math.min(dur, s.answerAt + 0.58), pose: 'hold' as const, expression: 'neutral' as const },
        ]
        : [
          { at: 0, pose: 'idle' as const, expression: 'neutral' as const },
          { at: s.answerAt, pose: 'wave-off' as const, expression: 'worried' as const },
          { at: Math.min(dur, s.answerAt + 0.62), pose: 'point' as const, expression: 'worried' as const },
        ];

    const walletX = 470, walletY = 708;
    const open = ease.outCubic(phase(t, s.answerAt, s.answerAt + 0.34));
    const turn = Math.PI * ease.inOutCubic(phase(t, s.answerAt + 0.18, s.answerAt + 0.56));
    const walletWobble = t >= s.answerAt + 0.56 ? Math.sin((t - s.answerAt - 0.56) * Math.PI * 2 / 0.68) * 0.1 : 0;
    const walletBob = t >= s.answerAt + 0.56 ? Math.sin((t - s.answerAt - 0.56) * Math.PI * 2 / 0.72) * 5 : 0;
    const payFloat = 7 * Math.sin((t - payArrived) * Math.PI * 2 / 0.86) * phase(t, payArrived, payArrived + 0.2);

    drawStage(ctx, { floorY: STAGE.floor, line: true });
    // The wanted-item bubble enters above the heads; it never crosses either face.
    drawWantedBubble(ctx, s, t, speechPop, speechBob);
    if (s.outcome === 'pay' && t >= s.answerAt) {
      drawItem(ctx, s.want, { x: payPos.x, y: payPos.y + payFloat, t, scale: 0.5, rot: Math.sin(payU * Math.PI) * 0.08, sx: payHit.sx, sy: payHit.sy });
    }
    drawActor(ctx, fromActor);
    drawActor(ctx, {
      who: s.to, x: toX, y: STAGE.floor, facing: -1, time: t, scale: 1, shadow: true,
      look: s.outcome === 'empty' && answer > 0 ? 'down' : 'forward', keys: toKeys,
      ...(s.outcome === 'empty' && answer > 0 ? { handTarget: { x: walletX - 12, y: walletY - 4 }, reach: ease.outCubic(answer) } : {}),
    });

    if (s.outcome === 'empty') {
      const walletPop = ease.outBack(phase(t, s.answerAt - 0.1, s.answerAt + 0.14));
      if (walletPop > 0) {
        drawItem(ctx, 'wallet', { x: walletX, y: walletY + walletBob, t, scale: 0.5, open, empty: true, rot: turn + walletWobble, sy: 1 + 0.04 * Math.sin(Math.PI * answer) });
        poof(ctx, walletX - 24, walletY + 22, s.answerAt + 0.72, t, { count: 4, seed: frame.seed, radius: 26, duration: 0.4, color: PAL.paperShade });
        ring(ctx, walletX, walletY - 18, s.answerAt + 0.75, t, { r: 62, width: 8, duration: 0.36 });
      }
    }
    if (s.outcome === 'pay' && t >= s.answerAt) {
      ring(ctx, PAY_TO.x, PAY_TO.y, payArrived, t, { r: 66, width: 9, duration: 0.34 });
      sparks(ctx, PAY_TO.x, PAY_TO.y, payArrived, t, { count: 4, seed: frame.seed, duration: 0.34, size: 9 });
    }
    if (s.fromLabel) label(ctx, s.fromLabel.toUpperCase(), FROM_X, 816, { variant: 'sign', maxWidth: 300 });
    if (s.toLabel) label(ctx, s.toLabel.toUpperCase(), TO_X, 816, { variant: 'sign', maxWidth: 300 });
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const safeDur = Math.max(0.05, dur), s = plan(props, safeDur), answer = s.answerAt;
    const responseCues = s.outcome === 'empty'
      ? [cue(answer, 'creak', 0.85, TO_X), cue(answer + 0.34, 'rustle', 0.75, 480), cue(answer + 0.72, 'thud', 1.3, 470)]
      : s.outcome === 'pay'
        ? [cue(answer, 'paper', 0.8, TO_X), cue(answer + 0.28, 'slide', 0.75, 380), cue(answer + 0.08 + PAY_TRAVEL, 'cash', 1.35, FROM_X)]
        : [cue(answer, 'thump', 1.1, TO_X), cue(answer + 0.22, 'slide', 0.75, TO_X), cue(answer + 0.52, 'clunk', 0.9, TO_X)];
    return cuesIn(safeDur, [
      cue(Math.max(0, s.demandAt - 0.18), 'footfall', 0.75, FROM_X - 12),
      cue(s.demandAt, 'thump', 1.35, FROM_X),
      cue(s.demandAt + 0.12, 'paper', 0.75, BUBBLE_X),
      ...responseCues,
    ]);
  },
};
