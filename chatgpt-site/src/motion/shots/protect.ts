// protect — a guard catches red loss drops before they reach Hedgy or an asset.
import type { Cue, Frame, ShotProps } from '../core.ts';
import { arc, bob, clamp, ease, lerp, phase, squash } from '../kit/motion.ts';
import { Grid, PAL } from '../kit/pixel.ts';
import { drawSprite } from '../kit/sprite.ts';
import { drawStage, label } from '../kit/stage.ts';
import { ring } from '../kit/fx.ts';
import { ACTORS, STAGE, beats, cue, cuesIn, drawActor, drawItem, itemParam, itemSize, pick, str, type ItemId } from './common.ts';
import type { ShotDef } from './index.ts';

const GUARDS = ['umbrella', 'shield'] as const;
const OUTCOMES = ['full', 'partial'] as const;
const TARGETS = ['actor', 'item'] as const;
const lossDrop = new Grid(24, 32)
  .poly([{ x: 12, y: 1 }, { x: 20, y: 10 }, { x: 22, y: 18 }, { x: 18, y: 27 }, { x: 12, y: 31 }, { x: 6, y: 27 }, { x: 2, y: 18 }, { x: 4, y: 10 }], PAL.ink)
  .poly([{ x: 12, y: 4 }, { x: 18, y: 11 }, { x: 19, y: 18 }, { x: 16, y: 25 }, { x: 11, y: 28 }, { x: 6, y: 24 }, { x: 5, y: 17 }, { x: 7, y: 10 }], PAL.UP)
  .poly([{ x: 12, y: 6 }, { x: 15, y: 11 }, { x: 11, y: 16 }, { x: 9, y: 14 }], PAL.red1)
  .outline(PAL.ink)
  .sprite('shot-protect:red-loss-drop');

interface Geometry {
  actorX?: number;
  targetX: number;
  targetY: number;
  targetTop: number;
  guardX: number;
  guardY: number;
  guardScale: number;
  hitY: number;
}
interface Plan {
  guard: typeof GUARDS[number];
  outcome: typeof OUTCOMES[number];
  target: typeof TARGETS[number];
  who: string;
  item: ItemId;
  word: string;
  times: number[];
  openAt: number;
  impacts: number[];
}

function plannedTimes(props: ShotProps, dur: number): number[] {
  const eventCount = (props.events ?? []).filter(event => Number.isFinite(event.at)).length;
  const capacity = Math.max(3, Math.min(6, Math.floor(dur / 0.56) + 1));
  const count = Math.min(capacity, Math.max(3, eventCount || 4));
  const fractions = Array.from({ length: count }, (_, i) => 0.12 + (i / Math.max(1, count - 1)) * 0.76);
  const requested = beats(props, dur, fractions);
  const first = Math.min(0.14, dur * 0.1), end = Math.max(first, dur - 0.38);
  const gap = count > 1 ? Math.min(0.48, (end - first) / (count - 1)) : 0;
  const result: number[] = [];
  for (let i = 0; i < count; i++) {
    const earliest = i === 0 ? first : result[i - 1]! + gap;
    const latest = Math.max(earliest, end - gap * (count - 1 - i));
    result.push(clamp(requested[i] ?? earliest, earliest, latest));
  }
  return result;
}

function plan(props: ShotProps, dur: number): Plan {
  const p = props.params, times = plannedTimes(props, dur);
  return {
    guard: pick(p, 'guard', GUARDS, 'umbrella'), outcome: pick(p, 'outcome', OUTCOMES, 'full'),
    target: pick(p, 'target', TARGETS, 'actor'), who: pick(p, 'who', ACTORS, 'hedgy'),
    item: itemParam(p, 'item', 'ticket'), word: str(p, 'word', '').trim().toUpperCase().slice(0, 12),
    times, openAt: times[0]!, impacts: times.slice(1),
  };
}

function geometry(s: Plan): Geometry {
  if (s.target === 'actor') {
    return {
      actorX: 545, targetX: 545, targetY: STAGE.floor, targetTop: STAGE.floor - 320,
      guardX: s.guard === 'umbrella' ? 400 : 300,
      guardY: s.guard === 'umbrella' ? 300 : 460,
      guardScale: 1,
      hitY: s.guard === 'umbrella' ? 212 : 445,
    };
  }
  const dims = itemSize(s.item);
  const targetX = clamp(STAGE.centre + 150, dims.w / 2 + 24, STAGE.w - dims.w / 2 - 24);
  const targetY = STAGE.floor - dims.h / 2, targetTop = targetY - dims.h / 2;
  const guardScale = 0.5;
  const guardY = clamp(targetTop - 35, STAGE.top + 90, 520);
  return {
    targetX, targetY, targetTop,
    guardX: targetX, guardY, guardScale,
    hitY: s.guard === 'umbrella' ? guardY - 38 : guardY,
  };
}

function followThrough(last: number, dur: number, outcome: Plan['outcome']) {
  const keys: { at: number; pose: 'point' | 'think' | 'wave-off'; expression: 'happy' | 'worried' }[] = [];
  for (let at = last + 0.42, index = 0; at < dur - 0.08; at += 0.4, index++) {
    keys.push({ at, pose: index % 2 ? 'think' : outcome === 'full' ? 'wave-off' : 'point', expression: outcome === 'full' ? 'happy' : 'worried' });
  }
  return keys;
}

export const protectShot: ShotDef = {
  name: 'protect',
  stage: 'clean',
  describe: 'A blue umbrella or shield blocks red loss drops before they reach Hedgy or a chosen asset; partial protection lets the last drop through. params: guard (umbrella | shield, default umbrella), target (actor | item, default actor), who (actor id, default hedgy; used for actor target), item (any library item, default ticket; used for item target), outcome (full | partial, default full), word (optional short paper label, default none). Events: 1 = the guard opens or rises; later events time incoming losses, with spaced fallback hits and fewer hits in very short shots.',
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame, dur = Math.max(0.05, frame.dur), t = clamp(frame.t, 0, dur), s = plan(props, dur), g = geometry(s);
    const actorTarget = s.target === 'actor';
    const dims = actorTarget ? undefined : itemSize(s.item);
    const open = ease.outCubic(phase(t, 0.1, s.openAt + 0.14));
    const sway = Math.sin(t * 2.3);
    const guardX = g.guardX + sway * 6;
    const guardBob = s.guard === 'shield' && actorTarget ? bob(t, 1.3, 7) : bob(t, 0.9, 18);
    const guardRot = s.guard === 'shield' && actorTarget ? sway * 0.06 : sway * 0.12;
    const latestHit = [...s.impacts].reverse().find(at => t >= at);
    const lastHit = s.impacts[s.impacts.length - 1]!;
    const leakIndex = s.outcome === 'partial' ? s.impacts.length - 1 : -1;
    const leakAt = leakIndex >= 0 ? s.impacts[leakIndex] : undefined;
    const actorKeys = [
      { at: 0, pose: 'think' as const, expression: 'neutral' as const },
      { at: 0.14, pose: 'panic' as const, expression: 'worried' as const },
      { at: s.openAt + 0.1, pose: 'hold' as const, expression: 'worried' as const },
      ...s.impacts.map((at, i) => ({
        at: at + 0.08,
        pose: (i === leakIndex ? 'sweat' : i % 2 ? 'point' : 'shock') as 'sweat' | 'point' | 'shock',
        expression: (i === leakIndex ? 'worried' : 'happy') as 'worried' | 'happy',
      })),
      { at: lastHit + 0.24, pose: (s.outcome === 'full' ? 'wave-off' : 'sweat') as 'wave-off' | 'sweat', expression: (s.outcome === 'full' ? 'happy' : 'worried') as 'happy' | 'worried' },
      ...followThrough(lastHit, dur, s.outcome),
    ];

    drawStage(ctx, {
      floorY: STAGE.floor, line: true,
      shadow: actorTarget
        ? [{ x: g.actorX!, y: STAGE.floor - 3, w: 188 }]
        : [{ x: g.targetX, y: STAGE.floor - 3, w: Math.min(420, dims!.w) }],
    });

    if (!actorTarget) {
      drawItem(ctx, s.guard, {
        x: guardX, y: g.guardY + guardBob, t, scale: g.guardScale,
        ...(s.guard === 'umbrella' ? { color: 'blue', open, rot: open * sway * 0.18 } : { rot: guardRot }),
      });
      const impact = leakAt === undefined ? { sx: 1, sy: 1 } : squash(t, leakAt + 0.1, 0.18, 0.22);
      drawItem(ctx, s.item, {
        x: g.targetX + Math.sin(t * 1.7) * 7, y: g.targetY + bob(t, 1.1, 14), t, scale: 1,
        sx: impact.sx, sy: impact.sy,
      });
    } else {
      drawItem(ctx, s.guard, {
        x: guardX, y: g.guardY + guardBob, t, scale: g.guardScale,
        ...(s.guard === 'umbrella' ? { color: 'blue', open, rot: open * sway * 0.18 } : { rot: guardRot }),
      });
      drawActor(ctx, {
        who: s.who, x: g.actorX! + Math.sin(t * 1.55) * 20, y: STAGE.floor, facing: -1, scale: 1, time: t,
        look: 'up', keys: actorKeys,
      });
    }

    if (s.word) label(ctx, s.word, 360, 822, { variant: 'tag', maxWidth: 420 });

    for (let i = 0; i < s.impacts.length; i++) {
      const at = s.impacts[i]!, start = Math.max(0.1, at - 0.4);
      const travelEnd = at + (i === leakIndex ? 0.48 : 0.38);
      if (t < start || t > travelEnd) continue;
      const lane = (i % 3 - 1) * 70;
      const barrier = { x: g.guardX + lane, y: g.hitY };
      const from = { x: barrier.x + (s.guard === 'shield' ? 0 : i % 2 ? -14 : 14), y: s.guard === 'shield' ? 160 : 76 };
      if (t <= at) {
        const p = ease.inOutCubic(phase(t, start, at));
        drawSprite(ctx, lossDrop, lerp(from.x, barrier.x, p), lerp(from.y, barrier.y, p), {
          anchor: [0.5, 0.5], scale: 1, rot: Math.sin(p * Math.PI) * 0.035,
        });
      } else if (i === leakIndex) {
        const target = actorTarget
          ? { x: g.targetX - 36, y: STAGE.floor - 122 }
          : { x: g.targetX, y: g.targetTop + 110 };
        const p = ease.inOutCubic(phase(t, at, at + 0.48)), pos = arc(barrier, target, 18, p);
        drawSprite(ctx, lossDrop, pos.x, pos.y, { anchor: [0.5, 0.5], scale: 1, rot: 0.025 });
      } else {
        const p = ease.inOutCubic(phase(t, at, at + 0.16));
        const alpha = 1 - ease.outCubic(phase(t, at + 0.14, at + 0.38));
        const bounce = arc(barrier, { x: barrier.x + (i % 2 ? -20 : 20), y: barrier.y - 26 }, 6, p);
        if (alpha > 0.01) drawSprite(ctx, lossDrop, bounce.x, bounce.y, { anchor: [0.5, 0.5], scale: 1, alpha, rot: -0.03 });
      }
    }

    if (latestHit !== undefined && t - latestHit < 0.32) {
      ring(ctx, g.guardX + ((s.impacts.indexOf(latestHit) % 3) - 1) * 70, g.hitY, latestHit, t, {
        r: 24, width: 4, color: PAL.red1, duration: 0.16,
      });
    }
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const safeDur = Math.max(0.05, dur), s = plan(props, safeDur), g = geometry(s);
    return cuesIn(safeDur, [
      cue(0.08, 'footfall', 0.58, s.target === 'actor' ? g.actorX! : g.targetX),
      cue(Math.max(0.12, s.openAt - 0.08), s.guard === 'umbrella' ? 'creak' : 'clunk', 0.9, g.guardX),
      ...s.impacts.map((at, i) => cue(at, i === leakIndexFor(s) ? 'thud' : 'thump', i === 0 ? 1.42 : 0.82, g.guardX)),
      cue(Math.min(safeDur, s.impacts[s.impacts.length - 1]! + 0.12), 'land', 0.68, g.targetX),
    ]);
  },
};

function leakIndexFor(s: Plan): number { return s.outcome === 'partial' ? s.impacts.length - 1 : -1; }
