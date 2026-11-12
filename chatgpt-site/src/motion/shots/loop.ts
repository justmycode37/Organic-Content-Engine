// loop — a large, parameter-driven feedback cycle with a marker that gathers speed.
import type { Cue, Frame, ShotProps } from '../core.ts';
import { clamp, ease, phase } from '../kit/motion.ts';
import { Grid, PAL } from '../kit/pixel.ts';
import { drawSprite } from '../kit/sprite.ts';
import { loopArrow, drawStage, label } from '../kit/stage.ts';
import { ring } from '../kit/fx.ts';
import { ACTORS, STAGE, beats, cue, cuesIn, drawActor, drawItem, isItem, itemSize, num, pick, type ItemId } from './common.ts';
import type { ShotDef } from './index.ts';

type Node = { item?: ItemId; word?: string };
interface Plan {
  nodes: Node[];
  marker: ItemId;
  who: string;
  mood: 'worried' | 'happy' | 'smug';
  speedup: number;
  events: number[];
}

const CX = STAGE.centre, CY = 360, RADIUS = 232, NODE_RADIUS = 224, START_ANGLE = -Math.PI / 2;
const INITIAL_RATE = 0.8;
const DISC = new Grid(36, 36)
  .ellipse(18, 18, 17, 17, PAL.ink)
  .ellipse(18, 18, 15.5, 15.5, PAL.paper)
  .ellipse(13.5, 12.5, 5.5, 3, PAL.white)
  .outline(PAL.ink)
  .sprite('shot-loop:paper-disc');

function parseNode(value: unknown): Node | undefined {
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return undefined;
    return isItem(text) ? { item: text } : { word: text.toUpperCase().slice(0, 18) };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const word = typeof raw.label === 'string' ? raw.label.trim().toUpperCase().slice(0, 18) : '';
  if (isItem(raw.item)) return { item: raw.item, ...(word ? { word } : {}) };
  return word ? { word } : undefined;
}

function plan(props: ShotProps, dur: number): Plan {
  const p = props.params;
  const rawNodes = Array.isArray(p?.nodes) ? p.nodes.map(parseNode).filter((node): node is Node => Boolean(node)).slice(0, 4) : [];
  const defaults: Node[] = [{ item: 'coin' }, { item: 'share' }, { item: 'warning' }];
  const nodes = rawNodes.slice();
  while (nodes.length < 3) nodes.push(defaults[nodes.length]!);
  const count = nodes.length;
  const eventCount = Math.min(1 + count, 4);
  const events = beats(props, dur, Array.from({ length: eventCount }, (_, i) => i === 0
    ? Math.min(0.16, dur * 0.1)
    : [0.36, 0.58, 0.78][i - 1]! * dur));
  return {
    nodes,
    marker: isItem(p?.marker) ? p.marker : 'coin',
    who: pick(p, 'who', [...ACTORS, 'none'] as const, 'hedgy'),
    mood: pick(p, 'mood', ['worried', 'happy', 'smug'] as const, 'worried'),
    speedup: num(p, 'speedup', 2.6, 1.1, 3.5),
    events,
  };
}

function nodeAngles(count: number): number[] {
  // Spread the normal three-node cycle around the ring. A fourth node sits on
  // the lower-left arc, leaving the floor actor's face open.
  return count === 3
    ? [Math.PI, -Math.PI / 2, 0]
    : [Math.PI, -Math.PI / 2, 0, -2.65];
}

function nodePulse(index: number, angle: number, laps: number, t: number, p: Plan): number {
  const offset = ((angle - START_ANGLE + Math.PI * 4) % (Math.PI * 2)) / (Math.PI * 2);
  const progress = laps - offset;
  const lastCrossing = Math.floor(progress) + offset;
  const rate = INITIAL_RATE * (1 + (p.speedup - 1) * phase(t, p.events[0]!, p.events[p.events.length - 1]! + 0.2));
  const age = Math.max(0, (laps - lastCrossing) / Math.max(0.25, rate));
  let pulse = ease.outCubic(1 - clamp(age / 0.34));
  for (let event = 1; event < p.events.length; event++) {
    const target = (event - 1) % p.nodes.length;
    if (target !== index) continue;
    pulse = Math.max(pulse, 1 - phase(t, p.events[event]!, p.events[event]! + 0.3));
  }
  return pulse;
}

function lapsAt(t: number, p: Plan, dur: number): number {
  const start = p.events[0] ?? 0, elapsed = Math.max(0, t - start), span = Math.max(0.2, dur - start);
  const initialRate = INITIAL_RATE, acceleration = initialRate * (p.speedup - 1) / span;
  return initialRate * elapsed + acceleration * elapsed * elapsed / 2;
}

function activeNode(p: Plan, laps: number, t: number): number {
  const eventTarget = p.events.slice(1).findIndex(at => t >= at && t < at + 0.32);
  if (eventTarget >= 0) return eventTarget % p.nodes.length;
  const angle = START_ANGLE + laps * Math.PI * 2;
  let nearest = 0, closest = Infinity;
  nodeAngles(p.nodes.length).forEach((nodeAngle, index) => {
    const delta = Math.atan2(Math.sin(angle - nodeAngle), Math.cos(angle - nodeAngle));
    if (Math.abs(delta) < closest) { closest = Math.abs(delta); nearest = index; }
  });
  return nearest;
}

function lapTimes(p: Plan, dur: number): number[] {
  const start = p.events[0]!, span = Math.max(0.2, dur - start);
  const initialRate = INITIAL_RATE, acceleration = initialRate * (p.speedup - 1) / span;
  const count = Math.floor(lapsAt(dur, p, dur));
  return Array.from({ length: count }, (_, index) => {
    const lap = index + 1;
    const elapsed = acceleration > 0
      ? (-initialRate + Math.sqrt(initialRate * initialRate + 2 * acceleration * lap)) / acceleration
      : lap / initialRate;
    return start + elapsed;
  }).filter(at => at < dur - 0.08);
}

function actorKeys(p: Plan, dur: number) {
  const initial = p.mood === 'happy' ? 'happy' as const : p.mood === 'smug' ? 'smug' as const : 'worried' as const;
  const keys: { at: number; pose: 'think' | 'lookup' | 'celebrate' | 'smug' | 'sweat' | 'panic'; expression: 'happy' | 'smug' | 'worried' | 'shocked' }[] = [
    { at: 0, pose: 'think' as const, expression: initial },
    { at: p.events[0]!, pose: 'lookup' as const, expression: initial },
  ];
  lapTimes(p, dur).forEach((at, index) => {
    const pose = p.mood === 'happy' ? 'celebrate' : p.mood === 'smug' ? 'smug' : index === 0 ? 'sweat' : 'panic';
    const expression = p.mood === 'happy' ? 'happy' : p.mood === 'smug' ? 'smug' : index === 0 ? 'worried' : 'shocked';
    keys.push({ at, pose: pose as 'celebrate' | 'smug' | 'sweat' | 'panic', expression: expression as 'happy' | 'smug' | 'worried' | 'shocked' });
  });
  p.events.slice(1).forEach((at, index) => {
    const pose = p.mood === 'happy' ? 'celebrate' : p.mood === 'smug' ? 'smug' : index === 0 ? 'sweat' : 'panic';
    const expression = p.mood === 'happy' ? 'happy' : p.mood === 'smug' ? 'smug' : 'shocked';
    keys.push({ at, pose: pose as 'celebrate' | 'smug' | 'sweat' | 'panic', expression: expression as 'happy' | 'smug' | 'worried' | 'shocked' });
  });
  return keys.sort((a, b) => a.at - b.at);
}

export const loopShot: ShotDef = {
  name: 'loop',
  stage: 'clean',
  describe: 'A thick pixel arrow circles 3–4 nodes as a bright marker passes and speeds up; an active node label appears on a clear paper plate, and an actor on the floor reacts each lap. params: nodes (3–4 item ids, short words, or {item,label} nodes; default coin, share, warning), marker (item id, default coin), who (actor or none, default hedgy), mood (worried|happy|smug, default worried), speedup (final speed relative to start, 1.1–3.5, default 2.6). Events: 1 = the orbit starts; later events pulse the next nodes while laps keep accelerating.',
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame, dur = Math.max(0.05, frame.dur), t = clamp(frame.t, 0, dur), p = plan(props, dur);
    const start = p.events[0]!, laps = lapsAt(t, p, dur), angle = START_ANGLE + laps * Math.PI * 2;
    const active = ease.outCubic(phase(t, start, start + 0.34));
    const markerDims = itemSize(p.marker, 0.5);
    const markerRadius = Math.min(
      RADIUS,
      CX - 24 - markerDims.w / 2,
      STAGE.w - 24 - CX - markerDims.w / 2,
      CY - 24 - markerDims.h / 2,
      STAGE.h - 24 - CY - markerDims.h / 2,
    );
    const markerX = CX + Math.cos(angle) * markerRadius, markerY = CY + Math.sin(angle) * markerRadius;
    const angles = nodeAngles(p.nodes.length);
    const visibleActor = p.who !== 'none';

    drawStage(ctx, {
      floorY: STAGE.floor, line: true,
      shadow: visibleActor ? [{ x: CX, y: STAGE.floor - 2, w: 220 }] : [],
    });
    loopArrow(ctx, CX, CY, RADIUS, { color: PAL.paper, width: 36, progress: active, spin: laps * Math.PI * 2 });

    const nodePoints = p.nodes.map((node, index) => {
      const baseAngle = angles[index]!;
      let x = CX + Math.cos(baseAngle) * NODE_RADIUS, y = CY + Math.sin(baseAngle) * NODE_RADIUS;
      if (node.item) {
        const dims = itemSize(node.item, 0.5);
        x = clamp(x, 24 + dims.w / 2, STAGE.w - 24 - dims.w / 2);
        y = clamp(y, 24 + dims.h / 2, STAGE.h - 24 - dims.h / 2);
      }
      const pulse = nodePulse(index, baseAngle, laps, t, p);
      return { node, index, baseAngle, x, y, pulse };
    });

    drawItem(ctx, p.marker, {
      x: markerX, y: markerY, t, scale: 0.5 * ease.outBack(phase(t, start, start + 0.2)),
      rot: Math.sin(laps * Math.PI * 2) * 0.035,
      sy: 1 + 0.08 * Math.sin(phase(t, start, start + 0.14) * Math.PI),
    });

    nodePoints.forEach(({ x, y, pulse }) => {
      if (pulse > 0.08) {
        const age = (1 - pulse) * 0.28;
        ring(ctx, x, y, t - age, t, { r: 78, width: 10, duration: 0.32, color: PAL.gold2 });
      }
    });

    nodePoints.forEach(({ node, index, x, y, pulse }) => {
      if (node.item) {
        drawSprite(ctx, DISC, x, y, { anchor: [0.5, 0.5], scale: 1 + pulse * 0.05 });
        drawItem(ctx, node.item, { x, y, t, scale: 0.5, alpha: 1, rot: 0 });
      } else {
        label(ctx, node.word!, x, y, { variant: 'bubble', maxWidth: 280, pop: 1 + pulse * 0.06 });
      }
    });

    const currentIndex = activeNode(p, laps, t);
    const activeLabel = p.nodes[currentIndex]!;
    const eventPulseAt = p.events.slice(1).find((at, i) => (i % p.nodes.length) === currentIndex && t >= at && t < at + 0.32);
    const eventPulse = eventPulseAt === undefined ? 0 : 1 - phase(t, eventPulseAt, eventPulseAt + 0.3);
    const activePulse = Math.max(nodePoints[currentIndex]!.pulse, eventPulse);
    if (activeLabel.item && activeLabel.word) {
      label(ctx, activeLabel.word, CX - 15, 290, { variant: 'sign', maxWidth: 300, pop: 1 + activePulse * 0.035 });
    }

    if (visibleActor) {
      drawActor(ctx, {
        who: p.who, x: CX, y: STAGE.floor, scale: 1, time: t, look: 'up',
        keys: actorKeys(p, dur),
      });
    }
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const safeDur = Math.max(0.05, dur), p = plan(props, safeDur);
    const accents = p.events.slice(0, Math.min(p.events.length, 4)).map((at, index) =>
      cue(at, index === 0 ? 'sub' : 'clunk', index === 0 ? 1.35 : 0.9 + index * 0.12, CX));
    return cuesIn(safeDur, [
      cue(0.03, 'creak', 0.65, CX), ...accents,
      cue(Math.max(0.06, p.events[0]! + 0.32), 'coin', 0.65, CX),
    ]);
  },
};
