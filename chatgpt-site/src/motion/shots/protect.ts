// protect — an actor raises a guard and visibly deflects incoming losses.
import type { Cue, Frame, ShotProps } from '../core.ts';
import { arc, clamp, ease, lerp, phase, squash } from '../kit/motion.ts';
import { Grid, PAL } from '../kit/pixel.ts';
import { drawSprite } from '../kit/sprite.ts';
import { drawStage } from '../kit/stage.ts';
import { ring } from '../kit/fx.ts';
import type { HedgyKey } from '../actor/hedgy.ts';
import { ACTORS, STAGE, actorBounds, beats, cue, cuesIn, drawActor, drawItem, itemParam, itemSize, pick, str, type ItemId } from './common.ts';
import type { ShotDef } from './index.ts';

const GUARDS = ['umbrella', 'shield'] as const;
const OUTCOMES = ['full', 'partial'] as const;
const TARGETS = ['actor', 'item'] as const;
type Guard = typeof GUARDS[number];
type Target = typeof TARGETS[number];
interface Point { x: number; y: number }
interface Plan {
  guard: Guard;
  outcome: typeof OUTCOMES[number];
  target: Target;
  who: string;
  item: ItemId;
  word: string;
  times: number[];
  openAt: number;
  impacts: number[];
  targetX: number;
  targetY: number;
  targetScale: number;
  guardX: number;
  guardY: number;
  guardScale: number;
  hitY: number;
}

const WORD_FONT: Record<string, readonly string[]> = {
  A:['010','101','111','101','101'], B:['110','101','110','101','110'], C:['011','100','100','100','011'], D:['110','101','101','101','110'], E:['111','100','110','100','111'], F:['111','100','110','100','100'], G:['011','100','101','101','011'], H:['101','101','111','101','101'], I:['111','010','010','010','111'], J:['001','001','001','101','010'], K:['101','101','110','101','101'], L:['100','100','100','100','111'], M:['101','111','111','101','101'], N:['101','111','111','111','101'], O:['111','101','101','101','111'], P:['110','101','110','100','100'], Q:['111','101','101','111','001'], R:['110','101','110','101','101'], S:['011','100','010','001','110'], T:['111','010','010','010','010'], U:['101','101','101','101','111'], V:['101','101','101','101','010'], W:['101','101','111','111','101'], X:['101','101','010','101','101'], Y:['101','101','010','010','010'], Z:['111','001','010','100','111'],
  '0':['111','101','101','101','111'], '1':['010','110','010','010','111'], '2':['110','001','010','100','111'], '3':['110','001','010','001','110'], '4':['101','101','111','001','001'], '5':['111','100','110','001','110'], '6':['011','100','110','101','010'], '7':['111','001','010','010','010'], '8':['010','101','010','101','010'], '9':['010','101','011','001','110'],
};
function smallTag(value: string) {
  const text = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8), cols = text.length * 4 + 4, g = new Grid(cols, 9);
  g.rect(0, 0, cols, 9, PAL.ink).rect(1, 1, cols - 2, 7, PAL.paper);
  let x = 2;
  for (const char of text) {
    (WORD_FONT[char] ?? WORD_FONT.S!).forEach((row, y) => [...row].forEach((on, xx) => { if (on === '1') g.rect(x + xx, y + 2, 1, 1, PAL.ink); }));
    x += 4;
  }
  return g.sprite(`shot-protect:tag:${text}`);
}

function drawItemAt(ctx: Frame['ctx'], item: ItemId, point: Point, t: number, scale: number, extra: Record<string, unknown> = {}) {
  drawItem(ctx, item, { x: point.x, y: point.y, t, scale, ...extra });
}

const lossDrop = new Grid(24, 32)
  .poly([{x:12,y:1},{x:20,y:10},{x:22,y:18},{x:18,y:27},{x:12,y:31},{x:6,y:27},{x:2,y:18},{x:4,y:10}], PAL.ink)
  .poly([{x:12,y:4},{x:18,y:11},{x:19,y:18},{x:16,y:25},{x:11,y:28},{x:6,y:24},{x:5,y:17},{x:7,y:10}], PAL.red2)
  .poly([{x:12,y:6},{x:15,y:11},{x:11,y:16},{x:9,y:14}], PAL.red1)
  .line({x:12,y:17},{x:12,y:23},2,PAL.white)
  .poly([{x:8,y:21},{x:12,y:25},{x:16,y:21}], PAL.white)
  .outline(PAL.ink)
  .sprite('shot-protect:falling-loss-arrow');

function plannedTimes(props: ShotProps, dur: number): number[] {
  const eventCount = (props.events ?? []).filter(event => Number.isFinite(event.at)).length;
  const count = Math.min(Math.max(3, Math.min(6, Math.floor(dur / 0.56) + 1)), Math.max(3, eventCount || 4));
  const fractions = Array.from({ length: count }, (_, i) => 0.12 + i / Math.max(1, count - 1) * 0.76);
  const requested = beats(props, dur, fractions), start = Math.min(0.12, dur * 0.08), end = Math.max(start + 0.12, dur - 0.30);
  const gap = count > 1 ? Math.min(0.48, (end - start) / (count - 1)) : 0;
  const times: number[] = [];
  for (let i = 0; i < count; i++) {
    const lo = i === 0 ? start : times[i - 1]! + gap;
    const hi = Math.max(lo, end - gap * (count - i - 1));
    times.push(clamp(requested[i] ?? start + gap * i, lo, hi));
  }
  return times;
}

function plan(props: ShotProps, dur: number): Plan {
  const p = props.params, times = plannedTimes(props, dur), guard = pick(p, 'guard', GUARDS, 'umbrella');
  const target = pick(p, 'target', TARGETS, 'actor'), item = itemParam(p, 'item', 'ticket');
  const targetScale = target === 'item' ? Math.min(0.72, 330 / Math.max(itemSize(item).w, itemSize(item).h)) : 1;
  const targetDims = itemSize(item, targetScale), targetX = target === 'actor' ? 460 : guard === 'umbrella' ? 350 : 500;
  const targetY = STAGE.floor - targetDims.h / 2;
  const targetTop = targetY - targetDims.h / 2;
  const guardScale = target === 'actor' ? (guard === 'umbrella' ? 0.42 : 0.48) : 0.46;
  const guardX = target === 'actor' && guard === 'shield' ? targetX + 52 : targetX;
  const guardY = target === 'actor' ? (guard === 'umbrella' ? 440 : 590) : clamp(targetTop - 128, 186, 402);
  return {
    guard, outcome: pick(p, 'outcome', OUTCOMES, 'full'), target, who: pick(p, 'who', ACTORS, 'hedgy'),
    item, word: str(p, 'word', '').trim().replace(/[^A-Za-z0-9]/g, '').slice(0, 8),
    times, openAt: times[0]!, impacts: times.slice(1), targetX, targetY, targetScale,
    guardX, guardY, guardScale, hitY: guardY + (guard === 'umbrella' ? 16 : -20),
  };
}

function actorKeys(s: Plan, dur: number, leakIndex: number): HedgyKey[] {
  const keys: HedgyKey[] = [
    { at: 0, pose: 'think' as const, expression: 'neutral' as const },
    { at: Math.max(0, s.openAt - 0.12), pose: 'panic' as const, expression: 'worried' as const },
    { at: s.openAt, pose: 'give' as const, expression: 'determined' as const },
    { at: s.openAt + 0.22, pose: 'hold' as const, expression: 'worried' as const },
    ...s.impacts.map((at, i) => ({ at: at + 0.05, pose: (i === leakIndex ? 'sweat' : 'shock') as 'sweat' | 'shock', expression: (i === leakIndex ? 'worried' : 'determined') as 'worried' | 'determined' })),
    { at: s.impacts[s.impacts.length - 1]! + 0.26, pose: (leakIndex < 0 ? 'wave-off' : 'sweat') as 'wave-off' | 'sweat', expression: (leakIndex < 0 ? 'happy' : 'worried') as 'happy' | 'worried' },
  ];
  for (let at = s.impacts[s.impacts.length - 1]! + 0.56, i = 0; at < dur - 0.05; at += 0.52, i++) {
    keys.push({ at, pose: (i % 2 ? 'tap' : 'point') as 'tap' | 'point', expression: leakIndex < 0 ? 'happy' : 'worried' });
  }
  return keys.sort((a, b) => a.at - b.at);
}

export const protectShot: ShotDef = {
  name: 'protect',
  stage: 'clean',
  describe: 'An actor raises an umbrella or shield over Hedgy or an asset; red loss drops strike it and ricochet, while partial protection lets the last drop hit. params: guard (umbrella|shield, default umbrella), target (actor|item, default actor), who (actor id, default hedgy; actor target only), item (any library item, default ticket; item target only), outcome (full|partial, default full), word (optional short tag below the action, default none). Events: 1 = the guard rises; each later event sends a loss drop into it, with the last drop reaching the target only for partial outcome.',
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame, dur = Math.max(0.05, frame.dur), t = clamp(frame.t, 0, dur), s = plan(props, dur);
    const actorTarget = s.target === 'actor', targetDims = actorTarget ? undefined : itemSize(s.item, s.targetScale);
    const leakIndex = s.outcome === 'partial' ? s.impacts.length - 1 : -1, leakAt = leakIndex >= 0 ? s.impacts[leakIndex] : undefined;
    const keys = actorKeys(s, dur, leakIndex);
    const targetBox = actorTarget ? actorBounds({ who: s.who, x: s.targetX, y: STAGE.floor, facing: 1, scale: 1, time: t, keys }) : undefined;
    const correction = targetBox && targetBox.left < 28 ? 28 - targetBox.left : targetBox && targetBox.right > 692 ? 692 - targetBox.right : 0;
    const targetX = s.targetX + correction;
    const guardX = s.guardX + correction;
    const open = ease.outCubic(phase(t, s.openAt - 0.08, s.openAt + 0.26));
    const guardY = lerp(s.guardY + 74, s.guardY, open) + Math.sin(t * 2.2) * 3;
    const sway = Math.sin(t * 2.4) * 0.035;
    const guardDims = itemSize(s.guard, s.guardScale);
    const handle = { x: guardX, y: guardY + guardDims.h * (s.guard === 'umbrella' ? 0.46 : 0.08) };
    const lastHit = s.impacts[s.impacts.length - 1]!;

    drawStage(ctx, { floorY: STAGE.floor, line: true, shadow: actorTarget ? [{ x: targetX, y: STAGE.floor - 2, w: 180 }] : [{ x: s.targetX, y: STAGE.floor - 2, w: Math.min(360, targetDims!.w) }] });
    if (!actorTarget) {
      const targetHit = leakAt === undefined ? { sx: 1, sy: 1 } : squash(t, leakAt + 0.18, 0.2, 0.22);
      drawItemAt(ctx, s.item, { x: s.targetX, y: s.targetY + Math.sin(t * 1.5) * 3 }, t, s.targetScale, { sx: targetHit.sx, sy: targetHit.sy });
    }

    drawItem(ctx, s.guard, {
      x: guardX, y: guardY, t, scale: s.guardScale,
      ...(s.guard === 'umbrella' ? { color: 'blue', open, rot: sway } : { rot: sway }),
    });
    if (actorTarget) {
      drawActor(ctx, {
        who: s.who, x: targetX, y: STAGE.floor, facing: 1, scale: 1, time: t,
        look: 'up', keys, handTarget: handle, reach: 0.92,
      });
    }

    for (let i = 0; i < s.impacts.length; i++) {
      const at = s.impacts[i]!, start = Math.max(0.06, at - 0.40), isLeak = i === leakIndex;
      const lane = (i % 3 - 1) * 46;
      const barrier = { x: guardX + lane, y: s.hitY + (guardY - s.guardY) };
      const from = { x: barrier.x + (i % 2 ? -8 : 8), y: 54 - i * 5 };
      const dropScale = 0.42;
      if (t < start || t > at + (isLeak ? 0.52 : 0.38)) continue;
      if (t <= at) {
        const p = ease.inOutCubic(phase(t, start, at));
        drawSprite(ctx, lossDrop, lerp(from.x, barrier.x, p), lerp(from.y, barrier.y, p), {
          anchor: [0.5, 0.5], scale: dropScale, rot: Math.sin(p * Math.PI) * 0.025,
        });
      } else if (isLeak) {
        const target = actorTarget ? { x: targetX - 12, y: STAGE.floor - 112 } : { x: s.targetX, y: s.targetY - targetDims!.h * 0.18 };
        const p = ease.inOutCubic(phase(t, at, at + 0.52)), pos = arc(barrier, target, 20, p);
        drawSprite(ctx, lossDrop, pos.x, pos.y, { anchor: [0.5, 0.5], scale: dropScale, rot: 0.04 });
      } else {
        const p = ease.outCubic(phase(t, at, at + 0.18));
        const alpha = 1 - ease.outCubic(phase(t, at + 0.15, at + 0.38));
        const bounce = arc(barrier, { x: barrier.x + (i % 2 ? -56 : 56), y: barrier.y + 6 }, 8, p);
        if (alpha > 0.01) drawSprite(ctx, lossDrop, bounce.x, bounce.y, { anchor: [0.5, 0.5], scale: dropScale, alpha, rot: i % 2 ? -0.08 : 0.08 });
      }
      if (t >= at && t < at + 0.22) ring(ctx, barrier.x, barrier.y, at, t, { r: 22, width: 4, duration: 0.2, color: PAL.white });
    }

    if (s.word) {
      const tag = smallTag(s.word), y = STAGE.floor + 48;
      drawSprite(ctx, tag, 360, y, { anchor: [0.5, 0.5], scale: 0.48, alpha: ease.outCubic(phase(t, s.openAt, s.openAt + 0.18)) });
    }
    if (t >= lastHit && t < lastHit + 0.3) ring(ctx, guardX, s.hitY, lastHit, t, { r: 32, width: 4, duration: 0.22, color: PAL.red1 });
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const safeDur = Math.max(0.05, dur), s = plan(props, safeDur);
    return cuesIn(safeDur, [
      cue(Math.max(0, s.openAt - 0.08), s.guard === 'umbrella' ? 'creak' : 'clunk', 0.85, s.guardX),
      ...s.impacts.map((at, i) => cue(at, i === (s.outcome === 'partial' ? s.impacts.length - 1 : -1) ? 'thud' : 'thump', i === 0 ? 1.25 : 0.82, s.guardX)),
      cue(Math.min(safeDur, s.impacts[s.impacts.length - 1]! + 0.14), 'land', 0.7, s.targetX),
    ]);
  },
};
