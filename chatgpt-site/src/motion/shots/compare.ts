// compare — two full-size examples land on separate levels and a character weighs the difference.
import type { Cue, Frame, ShotProps } from '../core.ts';
import type { HedgyKey } from '../actor/hedgy.ts';
import { bob, clamp, ease, phase, squash } from '../kit/motion.ts';
import { Grid, PAL } from '../kit/pixel.ts';
import { drawSprite } from '../kit/sprite.ts';
import { drawStage, label } from '../kit/stage.ts';
import { measure } from '../kit/type.ts';
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

interface Layout {
  sequential: boolean;
  leftX: number;
  leftY: number;
  rightX: number;
  rightY: number;
  focusX: number;
  focusY: number;
  actorX: number;
  actorFacing: 1 | -1;
}

function plan(props: ShotProps, dur: number): ComparePlan {
  const p = props.params;
  const [leftAt, rightAt, resultAt] = compareTimes(props, dur);
  const winnerParam = str(p, 'winner', 'none');
  const winner: Winner = winnerParam === 'left' || winnerParam === 'right' ? winnerParam : 'none';
  return {
    left: itemParam(p, 'left', 'share'),
    right: itemParam(p, 'right', 'share'),
    leftLabel: str(p, 'leftLabel', 'CHEAP'),
    rightLabel: str(p, 'rightLabel', 'COSTLY'),
    leftCoins: Math.round(num(p, 'leftCoins', 1, 1, 6)),
    rightCoins: Math.round(num(p, 'rightCoins', 5, 1, 6)),
    winner,
    who: str(p, 'who', 'hedgy'),
    leftAt, rightAt, resultAt,
  };
}

function compareTimes(props: ShotProps, dur: number): [number, number, number] {
  const events = [...(props.events ?? [])]
    .filter(event => Number.isFinite(event.at))
    .sort((a, b) => a.at - b.at)
    .map(event => clamp(event.at, 0, dur));
  const gap = Math.min(0.38, dur / 4);
  const left = clamp(events[0] ?? dur * 0.18, 0, Math.max(0, dur - gap * 2));
  const right = clamp(Math.max(events[1] ?? left + gap, left + gap), left + gap, Math.max(left + gap, dur - gap));
  const result = clamp(Math.max(events[2] ?? right + gap, right + gap), right + gap, dur);
  return [left, right, result];
}

function layout(s: ComparePlan): Layout {
  const left = itemSize(s.left), right = itemSize(s.right);
  const sequential = left.w + right.w + 32 > STAGE.w - 48 || Math.max(left.h, right.h) > 400;
  const leftX = 32 + left.w / 2;
  const rightX = STAGE.w - 32 - right.w / 2;
  const leftY = 300;
  const rightY = 300;
  const focusX = clamp(275, 32 + Math.max(left.w, right.w) / 2, STAGE.w - 32 - Math.max(left.w, right.w) / 2);
  const focusY = clamp(282, 84 + Math.max(left.h, right.h) / 2, 776 - Math.max(left.h, right.h) / 2);
  const actorBase = actorBounds({ who: s.who === 'none' ? 'hedgy' : s.who, x: 0, y: STAGE.floor, scale: 1, facing: sequential ? -1 : 1 });
  const preferredActorX = sequential ? 610 : 108;
  const actorX = clamp(preferredActorX, 32 - actorBase.left, 684 - actorBase.right);
  return {
    sequential,
    leftX,
    leftY,
    rightX,
    rightY,
    focusX,
    focusY,
    actorX,
    actorFacing: sequential ? -1 : 1,
  };
}

function itemAlpha(t: number, at: number): number {
  return ease.outCubic(phase(t, Math.max(0, at - 0.55), at + 0.05));
}

function drawPairItem(
  ctx: Frame['ctx'], id: ItemId, x: number, y: number, at: number, t: number,
  labelText: string, side: Side, resultProgress: number, isWinner: boolean,
) {
  const incoming = itemAlpha(t, at);
  if (incoming <= 0) return;
  const size = itemSize(id);
  const enterOffset = (1 - incoming) * 68;
  const baseY = y + (side === 'left' ? enterOffset : -enterOffset);
  const impact = squash(t, at + 0.05, 0.16, 0.2);
  const activeBob = bob(t, 1.55, 6);
  drawItem(ctx, id, { x, y: baseY + activeBob, t, scale: 1, alpha: incoming, sx: impact.sx, sy: impact.sy });

  // Paper plates carry both the comparison word and its simple value marker.
  const text = labelText.trim().toUpperCase();
  const plateWidth = Math.min(380, measure(text).w + 24);
  const plateX = clamp(x, 24 + plateWidth / 2, 696 - plateWidth / 2);
  const plateY = Math.max(50, y - size.h / 2 - 50);
  ctx.save();
  ctx.globalAlpha *= incoming;
  label(ctx, text, plateX, plateY, { variant: 'sign', maxWidth: 380 });
  ctx.restore();

  if (isWinner && resultProgress > 0) {
    const badgeX = clamp(x + (side === 'left' ? size.w * 0.38 : -size.w * 0.38), 32, 688);
    const badgeY = clamp(y - size.h * 0.32, 32, 790);
    const pulse = 1 + 0.08 * Math.sin(t * Math.PI * 3.4);
    drawSprite(ctx, CHECK_BADGE, badgeX, badgeY, { anchor: [0.5, 0.5], scale: ease.outBack(resultProgress) * pulse });
  }
}

function drawFocusItem(
  ctx: Frame['ctx'], s: ComparePlan, l: Layout, t: number, resultProgress: number,
) {
  const fromRight = phase(t, s.rightAt - 0.2, s.rightAt + 0.22);
  const leftAlpha = 1 - fromRight;
  const rightAlpha = fromRight;
  const leftSize = itemSize(s.left), rightSize = itemSize(s.right);
  const y = l.focusY + bob(t, 1.5, 7);
  if (leftAlpha > 0.015) drawItem(ctx, s.left, {
    x: l.focusX, y, t, scale: 1, alpha: leftAlpha,
    sx: squash(t, s.leftAt + 0.05, 0.16, 0.18).sx,
    sy: squash(t, s.leftAt + 0.05, 0.16, 0.18).sy,
  });
  if (rightAlpha > 0.015) drawItem(ctx, s.right, {
    x: l.focusX, y, t, scale: 1, alpha: rightAlpha,
    sx: squash(t, s.rightAt + 0.05, 0.16, 0.18).sx,
    sy: squash(t, s.rightAt + 0.05, 0.16, 0.18).sy,
  });
  const activeLabel = fromRight > 0.5 ? s.rightLabel : s.leftLabel;
  const activeCoins = fromRight > 0.5 ? s.rightCoins : s.leftCoins;
  const itemHeight = fromRight > 0.5 ? rightSize.h : leftSize.h;
  const labelY = clamp(l.focusY + itemHeight / 2 + 48, 72, 810);
  const text = `${activeLabel} ${activeCoins}`.toUpperCase();
  const plateWidth = Math.min(380, measure(text).w + 24);
  const plateX = clamp(l.focusX - 24, 24 + plateWidth / 2, 696 - plateWidth / 2);
  label(ctx, text, plateX, labelY, { variant: 'sign', maxWidth: 380 });
  if (s.winner !== 'none' && resultProgress > 0) {
    const winnerId = s.winner === 'left' ? s.left : s.right;
    const winSize = itemSize(winnerId);
    const badgeY = clamp(l.focusY - winSize.h * 0.32, 32, 790);
    const pulse = 1 + 0.08 * Math.sin(t * Math.PI * 3.4);
    drawSprite(ctx, CHECK_BADGE, l.focusX + winSize.w * 0.38, badgeY, { anchor: [0.5, 0.5], scale: ease.outBack(resultProgress) * pulse });
  }
}

export const compareShot: ShotDef = {
  name: 'compare',
  stage: 'clean',
  describe: 'Two full-size items arrive in a clear high/low comparison, with paper plates naming each side and its value; very large pairs take turns in one center display. params: left/right (any item id, default share), leftLabel/rightLabel (words, default CHEAP/COSTLY), leftCoins/rightCoins (1–6, default 1/5), winner (left|right|none, optional check mark), who (actor id|none, default hedgy). Events: 1 brings in the first item; 2 brings in the second; event 3 marks the winner or prompts the actor to choose; items keep a gentle bob after landing.',
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame;
    const dur = Math.max(0.05, frame.dur);
    const t = clamp(frame.t, 0, dur);
    const s = plan(props, dur), l = layout(s);
    const resultProgress = phase(t, s.resultAt, s.resultAt + 0.22);

    drawStage(ctx, { floorY: STAGE.floor, line: true, shadow: [{ x: l.actorX, y: STAGE.floor - 3, w: 205 }] });
    if (l.sequential) {
      drawFocusItem(ctx, s, l, t, resultProgress);
    } else {
      drawPairItem(ctx, s.left, l.leftX, l.leftY, s.leftAt, t, `${s.leftLabel} ${s.leftCoins}`, 'left', resultProgress, s.winner === 'left');
      drawPairItem(ctx, s.right, l.rightX, l.rightY, s.rightAt, t, `${s.rightLabel} ${s.rightCoins}`, 'right', resultProgress, s.winner === 'right');
    }

  const faceLook = t < s.rightAt ? 'up' : 'forward';
    const actorKeys: HedgyKey[] = [
      { at: 0, pose: 'think', expression: 'neutral', look: 'up' },
      { at: Math.min(0.12, dur), pose: 'point', expression: 'neutral', look: 'up' },
      { at: Math.max(0, s.leftAt - 0.14), pose: 'point', expression: 'neutral', look: 'up' },
      { at: s.leftAt, pose: 'lookup', expression: 'neutral', look: 'up' },
      { at: Math.max(s.leftAt + 0.2, s.rightAt - 0.14), pose: 'tap', expression: 'neutral', look: 'forward' },
      { at: s.rightAt, pose: 'lookup', expression: 'neutral', look: 'forward' },
      { at: s.resultAt, pose: s.winner === 'none' ? 'think' : 'celebrate', expression: s.winner === 'none' ? 'neutral' : 'happy', look: faceLook },
      { at: Math.min(dur, s.resultAt + 0.42), pose: 'point', expression: s.winner === 'none' ? 'neutral' : 'happy', look: 'up' },
    ];
    for (let at = s.resultAt + 0.9, index = 0; at < dur; at += 0.55, index++) {
      actorKeys.push({ at, pose: index % 2 ? 'think' : 'lookup', expression: s.winner === 'none' ? 'neutral' : 'happy', look: 'up' });
    }
    actorKeys.sort((a, b) => a.at - b.at);
    const actorBox = s.who === 'none' ? undefined : actorBounds({ who: s.who, x: l.actorX, y: STAGE.floor, scale: 1, facing: l.actorFacing, time: t, keys: actorKeys });
    const actorCorrection = actorBox && actorBox.left < 28 ? 28 - actorBox.left : actorBox && actorBox.right > 692 ? 692 - actorBox.right : 0;
    if (s.who !== 'none') drawActor(ctx, {
      who: s.who,
      x: l.actorX + actorCorrection,
      y: STAGE.floor,
      scale: 1,
      facing: l.actorFacing,
      time: t,
      look: faceLook,
      keys: actorKeys,
    });
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const safeDur = Math.max(0.05, dur), s = plan(props, safeDur), l = layout(s);
    const list: Cue[] = [
      cue(Math.max(0, s.leftAt - 0.16), 'slide', 0.7, l.sequential ? l.focusX : l.leftX),
      cue(s.leftAt, 'thump', 1.35, l.sequential ? l.focusX : l.leftX),
      cue(Math.max(0, s.rightAt - 0.14), 'rustle', 0.65, l.sequential ? l.focusX : l.rightX),
      cue(s.rightAt, 'land', 1.3, l.sequential ? l.focusX : l.rightX),
      cue(s.resultAt, s.winner === 'none' ? 'knock' : 'stamp', s.winner === 'none' ? 0.8 : 1.35, l.sequential ? l.focusX : (s.winner === 'left' ? l.leftX : l.rightX)),
      cue(Math.min(safeDur, s.resultAt + 0.15), s.winner === 'none' ? 'paper' : 'ding', 0.7, l.sequential ? l.focusX : (s.winner === 'left' ? l.leftX : l.rightX)),
    ];
    return cuesIn(safeDur, list);
  },
};
