// compare — a character checks two offers, then points to the better choice.
import type { Cue, Frame, ShotProps } from '../core.ts';
import type { HedgyKey } from '../actor/hedgy.ts';
import { bob, clamp, ease, phase, squash } from '../kit/motion.ts';
import { Grid, PAL } from '../kit/pixel.ts';
import { drawSprite } from '../kit/sprite.ts';
import { drawStage, label } from '../kit/stage.ts';
import { STAGE, actorBounds, cue, cuesIn, drawActor, drawItem, itemParam, itemSize, num, str, type ItemId } from './common.ts';
import type { ShotDef } from './index.ts';

type Side = 'left' | 'right';
type Winner = Side | 'none';

const CHECK_BADGE = (() => {
  const g = new Grid(12, 12);
  g.round(0, 0, 12, 12, 2, PAL.ink);
  g.round(1, 1, 10, 10, 1, PAL.green2);
  g.poly([{ x: 2, y: 6 }, { x: 4, y: 4 }, { x: 6, y: 7 }, { x: 9, y: 3 }, { x: 11, y: 5 }, { x: 6, y: 10 }], PAL.paper);
  g.outline();
  return g.sprite('shot-compare:winner-check');
})();

interface ComparePlan {
  left: ItemId;
  right: ItemId;
  leftLabel: string;
  rightLabel: string;
  leftCoins: number;
  rightCoins: number;
  winner: Winner;
  who: string;
  leftAt: number;
  rightAt: number;
  resultAt: number;
}

const ITEM_XS = { left: 210, right: 510 } as const;
const FLOOR = STAGE.floor;

function shortLabel(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9 $.-]/g, ' ').trim().replace(/\s+/g, ' ').slice(0, 12) || 'ITEM';
}

function compareTimes(props: ShotProps, dur: number): [number, number, number] {
  const events = [...(props.events ?? [])]
    .filter(event => Number.isFinite(event.at))
    .sort((a, b) => a.at - b.at)
    .map(event => clamp(event.at, 0, dur));
  const gap = Math.min(0.3, dur / 5);
  const left = clamp(events[0] ?? dur * 0.2, 0, dur);
  const right = clamp(Math.max(events[1] ?? left + gap, left + gap), left, dur);
  const result = clamp(Math.max(events[2] ?? right + gap, right + gap), right, dur);
  return [left, right, result];
}

function plan(props: ShotProps, dur: number): ComparePlan {
  const p = props.params;
  const [leftAt, rightAt, resultAt] = compareTimes(props, dur);
  const winnerParam = str(p, 'winner', 'none');
  return {
    left: itemParam(p, 'left', 'share'),
    right: itemParam(p, 'right', 'share'),
    leftLabel: shortLabel(str(p, 'leftLabel', 'CHEAP')),
    rightLabel: shortLabel(str(p, 'rightLabel', 'COSTLY')),
    leftCoins: Math.round(num(p, 'leftCoins', 1, 1, 6)),
    rightCoins: Math.round(num(p, 'rightCoins', 5, 1, 6)),
    winner: winnerParam === 'left' || winnerParam === 'right' ? winnerParam : 'none',
    who: str(p, 'who', 'hedgy'),
    leftAt, rightAt, resultAt,
  };
}

function showItem(ctx: Frame['ctx'], id: ItemId, side: Side, t: number, at: number, labelText: string, coins: number, result: number, winner: Winner) {
  const x = ITEM_XS[side], size = itemSize(id);
  const scale = Math.min(0.88, 270 / Math.max(size.w, size.h));
  const arrive = ease.outCubic(phase(t, Math.max(0, at - 0.26), at + 0.02));
  if (arrive <= 0) return;
  const selected = winner === side ? result : 0;
  const unselected = winner !== 'none' && winner !== side ? result : 0;
  const bump = squash(t, at, 0.16, 0.16);
  const xOffset = (side === 'left' ? -1 : 1) * (1 - arrive) * 28 + (side === 'left' ? -1 : 1) * unselected * 12;
  const y = 320 + bob(t, 1.45, 4) - selected * 8;
  const pulse = selected > 0 ? 1 + 0.045 * Math.sin(t * Math.PI * 3) : 1;
  drawItem(ctx, id, {
    x: x + xOffset,
    y,
    t,
    scale: scale * (0.86 + 0.14 * arrive) * pulse,
    alpha: arrive * (1 - unselected * 0.55),
    sx: bump.sx,
    sy: bump.sy,
  });
  const word = `${labelText} $${coins}`;
  ctx.save();
  ctx.globalAlpha *= arrive;
  label(ctx, word, x, 112, { variant: 'sign', maxWidth: 340, pop: 1 + selected * 0.05 });
  ctx.restore();
  if (winner === side && result > 0) {
    const badgeX = clamp(x + (side === 'left' ? 105 : -105), 44, 676);
    drawSprite(ctx, CHECK_BADGE, badgeX, 238 - result * 18, {
      anchor: [0.5, 0.5], scale: ease.outBack(result) * (1 + 0.05 * Math.sin(t * Math.PI * 3)),
    });
  }
}

export const compareShot: ShotDef = {
  name: 'compare',
  stage: 'clean',
  describe: 'Two chosen items slide into view with their CHEAP/COSTLY words and 1–6 price markers; a full-size actor points to each in turn, then marks the selected item or keeps weighing both. params: left/right (any item id, default share), leftLabel/rightLabel (short words, default CHEAP/COSTLY), leftCoins/rightCoins (1–6, default 1/5), winner (left|right|none, optional check mark; default none), who (actor id|none, default hedgy). Events: 1 slides in the left item as the actor checks it; 2 slides in the right item as the actor compares it; 3 marks the chosen side or prompts another look; both items keep a gentle bob.',
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame;
    const dur = Math.max(0.05, frame.dur);
    const t = clamp(frame.t, 0, dur);
    const s = plan(props, dur);
    const result = ease.outCubic(phase(t, s.resultAt, s.resultAt + 0.22));

    drawStage(ctx, { floorY: FLOOR, line: true, shadow: [{ x: STAGE.centre, y: FLOOR - 3, w: 220 }] });
    showItem(ctx, s.left, 'left', t, s.leftAt, s.leftLabel, s.leftCoins, result, s.winner);
    showItem(ctx, s.right, 'right', t, s.rightAt, s.rightLabel, s.rightCoins, result, s.winner);

    const actorKeys: HedgyKey[] = [
      { at: 0, pose: 'think', expression: 'neutral', look: 'up' },
      { at: Math.max(0, s.leftAt - 0.12), pose: 'lookup', expression: 'determined', look: 'up' },
      { at: s.leftAt, pose: 'point', expression: 'neutral', look: 'up' },
      { at: Math.min(dur, s.leftAt + 0.28), pose: 'tap', expression: 'neutral', look: 'up' },
      { at: Math.max(s.leftAt + 0.34, s.rightAt - 0.12), pose: 'lookup', expression: 'determined', look: 'up' },
      { at: s.rightAt, pose: 'point', expression: 'neutral', look: 'up' },
      { at: Math.min(dur, s.rightAt + 0.28), pose: 'tap', expression: 'neutral', look: 'up' },
      { at: s.resultAt, pose: s.winner === 'none' ? 'think' : 'celebrate', expression: s.winner === 'none' ? 'neutral' : 'happy', look: 'up' },
    ];
    for (let at = s.resultAt + 0.46, index = 0; at < dur - 0.05; at += 0.46, index++) {
      actorKeys.push({ at, pose: index % 2 === 0 ? 'point' : (s.winner === 'none' ? 'think' : 'celebrate'), expression: s.winner === 'none' ? 'neutral' : 'happy', look: 'up' });
    }
    actorKeys.sort((a, b) => a.at - b.at);
    if (s.who !== 'none') {
      const actorBox = actorBounds({ who: s.who, x: STAGE.centre, y: FLOOR, scale: 1, facing: 1, time: t, keys: actorKeys });
      const correction = actorBox.left < 28 ? 28 - actorBox.left : actorBox.right > 692 ? 692 - actorBox.right : 0;
      drawActor(ctx, {
        who: s.who, x: STAGE.centre + correction, y: FLOOR, scale: 1, facing: 1, time: t,
        look: 'up', keys: actorKeys,
      });
    }
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const d = Math.max(0.05, dur), s = plan(props, d);
    return cuesIn(d, [
      cue(Math.max(0, s.leftAt - 0.16), 'slide', 0.75, ITEM_XS.left),
      cue(s.leftAt, 'thump', 1.25, ITEM_XS.left),
      cue(Math.max(0, s.rightAt - 0.14), 'rustle', 0.7, ITEM_XS.right),
      cue(s.rightAt, 'land', 1.25, ITEM_XS.right),
      cue(s.resultAt, s.winner === 'none' ? 'knock' : 'stamp', s.winner === 'none' ? 0.8 : 1.35, ITEM_XS[s.winner === 'none' ? 'left' : s.winner]),
      cue(Math.min(d, s.resultAt + 0.16), s.winner === 'none' ? 'paper' : 'ding', 0.7, ITEM_XS[s.winner === 'none' ? 'right' : s.winner]),
    ]);
  },
};
