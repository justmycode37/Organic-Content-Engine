// lockaway — an owner locks an asset in a safe or unlocks it and takes it back.
import type { Cue, Frame, ShotProps } from '../core.ts';
import type { HedgyKey } from '../actor/hedgy.ts';
import { arc, bob, clamp, ease, phase, squash } from '../kit/motion.ts';
import { drawStage } from '../kit/stage.ts';
import { ring, sparks } from '../kit/fx.ts';
import { ACTORS, STAGE, beats, cue, cuesIn, drawActor, drawItem, itemParam, itemSize, pick, type ItemId } from './common.ts';
import type { ShotDef } from './index.ts';

const ACTIONS = ['lock', 'unlock'] as const;
interface Plan { item: ItemId; who: string; action: typeof ACTIONS[number]; events: [number, number]; travel: number }
const SAFE_X = 458, SAFE_Y = STAGE.floor - 282, SAFE_SCALE = 0.68, OWNER_X = 128;
function plan(props: ShotProps, dur: number): Plan {
  const [first, second] = beats(props, dur, [0.34, 0.72]);
  const earliest = Math.min(0.16, dur * 0.12), latest = Math.max(earliest, dur - 0.16);
  const at1 = clamp(first ?? dur * 0.34, earliest, latest), at2 = clamp(second ?? dur * 0.72, at1 + Math.min(0.24, dur * 0.18), latest);
  return {
    item: itemParam(props.params, 'item', 'cash'), who: pick(props.params, 'who', ACTORS, 'hedgy'), action: pick(props.params, 'action', ACTIONS, 'lock'),
    events: [at1, at2], travel: Math.min(0.42, Math.max(0.22, dur * 0.18)),
  };
}
function keysFor(s: Plan, dur: number): HedgyKey[] {
  const [first, second] = s.events;
  const keys: HedgyKey[] = s.action === 'lock' ? [
    { at: 0, pose: 'carry', expression: 'neutral', look: 'down' },
    { at: Math.max(0, first - s.travel), pose: 'give', expression: 'determined', look: 'down' },
    { at: first + 0.08, pose: 'tap', expression: 'neutral', look: 'forward' },
    { at: second + 0.12, pose: 'celebrate', expression: 'happy', look: 'up' },
  ] : [
    { at: 0, pose: 'think', expression: 'neutral', look: 'forward' },
    { at: first, pose: 'tap', expression: 'determined', look: 'down' },
    { at: second, pose: 'receive', expression: 'happy', look: 'down' },
    { at: second + 0.32, pose: 'hold', expression: 'happy', look: 'forward' },
  ];
  for (let at = second + 0.72, i = 0; at < dur - 0.1; at += 0.55, i++) keys.push({ at, pose: i % 2 ? 'think' : s.action === 'lock' ? 'tap' : 'point', expression: 'happy', look: 'up' });
  return keys.sort((a, b) => a.at - b.at);
}

export const lockawayShot: ShotDef = {
  name: 'lockaway',
  stage: 'clean',
  describe: 'An owner puts any item into a steel safe and visibly locks the door with a gold padlock; unlock mode opens the padlock and safe before the owner takes the item out. params: who (actor id, default hedgy), item (any item id, default cash), action (lock|unlock, default lock). Events for lock: 1 = the item slides into the open safe, 2 = the safe door closes and the padlock snaps shut. Events for unlock: 1 = the owner opens the padlock and safe, 2 = the item flies back into the owner’s paw.',
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame, dur = Math.max(0.05, frame.dur), t = clamp(frame.t, 0, dur), s = plan(props, dur), keys = keysFor(s, dur), [first, second] = s.events;
    const size = itemSize(s.item), itemScale = Math.min(0.5, 160 / size.w, 160 / size.h);
    const insertStart = Math.max(0, first - s.travel), takeStart = Math.max(first, second - s.travel);
    const lockMode = s.action === 'lock';
    const opened = lockMode
      ? ease.outCubic(phase(t, 0, insertStart + 0.18)) * (1 - ease.inOutCubic(phase(t, second - 0.22, second)))
      : ease.outCubic(phase(t, first, first + 0.34));
    const shut = lockMode ? ease.outCubic(phase(t, second - 0.12, second)) : 1 - ease.outCubic(phase(t, first - 0.12, first + 0.18));
    const dial = lockMode
      ? 0.9 * ease.inOutCubic(phase(t, second - 0.36, second)) + Math.max(0, t - second) * 0.72
      : -0.8 * ease.inOutCubic(phase(t, first - 0.22, first + 0.18)) + Math.max(0, t - first) * 0.18;
    const source = { x: OWNER_X + 112, y: STAGE.floor - 220 };
    const inside = { x: SAFE_X - 6, y: SAFE_Y + 4 };
    const ownerHand = { x: OWNER_X + 104, y: STAGE.floor - 210 };
    const actorTarget = lockMode ? source : ownerHand;

    drawStage(ctx, { floorY: STAGE.floor, line: true, shadow: [
      { x: OWNER_X, y: STAGE.floor - 2, w: 164 }, { x: SAFE_X, y: STAGE.floor - 2, w: 330 },
    ] });
    drawItem(ctx, 'safe', { x: SAFE_X, y: SAFE_Y, t, scale: SAFE_SCALE, door: opened, dial, contents: 'empty' });
    drawActor(ctx, { who: s.who, x: OWNER_X, y: STAGE.floor, facing: 1, scale: 0.76, time: t, look: lockMode ? 'down' : 'forward', keys,
      handTarget: actorTarget, reach: lockMode ? 0.65 * (1 - phase(t, first, first + 0.22)) : 0.6 * phase(t, second, second + 0.25) });

    if (lockMode) {
      if (t < first + 0.18) {
        const u = ease.inOutCubic(phase(t, insertStart, first));
        const pos = arc(source, inside, 22, u), fade = 1 - ease.outCubic(phase(t, first - 0.04, first + 0.16));
        const hit = squash(t, first, 0.14, 0.2);
        drawItem(ctx, s.item, { x: pos.x, y: pos.y + bob(t, 1.2, 3), t, scale: itemScale, rot: 0.08 * Math.sin(u * Math.PI), alpha: fade, sx: hit.sx, sy: hit.sy });
      }
    } else {
      const u = ease.inOutCubic(phase(t, takeStart, second));
      const pos = arc(inside, ownerHand, 32, u), visible = ease.outCubic(phase(t, first, first + 0.16));
      if (t >= first && visible > 0.01) drawItem(ctx, s.item, { x: pos.x, y: pos.y + bob(t, 1.3, 4), t, scale: itemScale, rot: -0.08 * Math.sin(u * Math.PI), alpha: visible });
    }

    const lockX = SAFE_X + 73, lockY = SAFE_Y + 20;
    const lockPop = lockMode ? ease.outBack(phase(t, second - 0.1, second + 0.08)) : 1;
    const lockAlpha = lockMode ? ease.outCubic(phase(t, second - 0.1, second + 0.06)) : 1 - ease.outCubic(phase(t, first - 0.16, first + 0.1));
    if (lockAlpha > 0.01) drawItem(ctx, 'padlock', { x: lockX, y: lockY, t, scale: SAFE_SCALE * 0.43 * lockPop, shut, alpha: lockAlpha });
    const lockBeat = lockMode ? second : first;
    ring(ctx, lockX, lockY, lockBeat, t, { r: 42, duration: 0.32, width: 6, color: '#FFE08A' });
    sparks(ctx, lockX, lockY, lockBeat + 0.04, t, { count: 4, seed: frame.seed, duration: 0.36, size: 5, color: '#FFE08A' });
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const s = plan(props, Math.max(0.05, dur)), [first, second] = s.events;
    return cuesIn(dur, s.action === 'lock' ? [
      cue(0.06, 'creak', 0.56, SAFE_X), cue(Math.max(0, first - s.travel), 'swish', 0.82, OWNER_X + 112), cue(first, 'thud', 1.2, SAFE_X),
      cue(second - 0.12, 'clunk', 0.85, SAFE_X), cue(second, 'snap', 1.4, SAFE_X + 73), cue(second + 0.08, 'click', 0.82, SAFE_X + 73),
    ] : [
      cue(Math.max(0, first - 0.12), 'click', 1.05, SAFE_X + 73), cue(first, 'clunk', 0.92, SAFE_X), cue(first + 0.12, 'creak', 0.78, SAFE_X),
      cue(Math.max(first, second - s.travel), 'swish', 0.85, SAFE_X), cue(second, 'thump', 1.2, OWNER_X + 112), cue(second + 0.08, 'ding', 0.58, OWNER_X),
    ]);
  },
};
