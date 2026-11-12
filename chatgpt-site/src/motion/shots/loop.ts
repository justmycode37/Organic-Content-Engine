// loop — two actors keep one real item moving around a belt; it changes at each station.
import type { Cue, Frame, ShotProps } from '../core.ts';
import { clamp, ease, phase } from '../kit/motion.ts';
import { Grid, PAL } from '../kit/pixel.ts';
import { drawSprite } from '../kit/sprite.ts';
import { drawStage, label } from '../kit/stage.ts';
import { ring } from '../kit/fx.ts';
import { ACTORS, STAGE, actorBounds, beats, cue, cuesIn, drawActor, drawItem, isItem, itemParam, itemSize, num, pick, type ActorId, type ItemId } from './common.ts';
import type { ShotDef } from './index.ts';
import type { HedgyKey } from '../actor/hedgy.ts';

type Node = { item?: ItemId; word?: string };
interface Plan {
  nodes: Node[]; marker: ItemId; actors: ActorId[]; mood: 'worried' | 'happy' | 'smug'; speedup: number; events: number[];
}
const CX = STAGE.centre, CY = 395, RX = 189, RY = 144, START_ANGLE = Math.PI;
const BELT = (() => {
  const g = new Grid(100, 72).ellipse(50, 36, 34, 27, PAL.ink).ellipse(50, 36, 32, 25, PAL.grey4).ellipse(50, 36, 29, 21, PAL.grey2);
  // The open center leaves the floor visible; raised pale treads make this read as a conveyor belt.
  g.fill((x, y) => ((x - 50) / 29) ** 2 + ((y - 36) / 21) ** 2 <= 1, undefined);
  for (let i = 0; i < 28; i++) {
    const angle = i * Math.PI * 2 / 28;
    const x = Math.round(50 + 30.5 * Math.cos(angle)), y = Math.round(36 + 23 * Math.sin(angle));
    g.rect(x, y, 2, 2, PAL.grey1);
  }
  // Restore a quiet inner rail around the open oval.
  g.ellipse(50, 36, 29, 21, undefined).outline(PAL.ink);
  return g.sprite('loop:physical-conveyor');
})();
const GATE = (() => {
  const g = new Grid(18, 12);
  g.rect(1, 4, 16, 7, PAL.ink).rect(3, 5, 12, 5, PAL.grey4);
  g.rect(4, 4, 10, 2, PAL.grey1).rect(7, 1, 4, 5, PAL.gold3);
  g.rect(8, 2, 2, 3, PAL.gold1).outline(PAL.ink);
  return g.sprite('loop:sorting-gate');
})();
const ROLLER = (() => {
  const g = new Grid(8, 8).ellipse(4, 4, 3.5, 3.5, PAL.ink).ellipse(4, 4, 2.5, 2.5, PAL.grey2);
  g.rect(3, 0, 2, 8, PAL.grey1).outline(PAL.ink);
  return g.sprite('loop:belt-roller');
})();

function parseNode(value: unknown): Node | undefined {
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return undefined;
    return isItem(text) ? { item: text } : { word: text.toUpperCase().slice(0, 18) };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>, word = typeof raw.label === 'string' ? raw.label.trim().toUpperCase().slice(0, 18) : '';
  if (isItem(raw.item)) return { item: raw.item, ...(word ? { word } : {}) };
  return word ? { word } : undefined;
}
function actorsFor(params: ShotProps['params']): ActorId[] {
  const raw = params?.actors;
  if (Array.isArray(raw)) return raw.filter((id): id is ActorId => typeof id === 'string' && (ACTORS as readonly string[]).includes(id)).slice(0, 2);
  const who = pick(params, 'who', [...ACTORS, 'none'] as const, 'hedgy');
  if (who === 'none') return [];
  const partner = pick(params, 'partner', [...ACTORS, 'none'] as const, 'mouse');
  return partner === 'none' ? [who as ActorId] : [who as ActorId, partner as ActorId];
}
function plan(props: ShotProps, dur: number): Plan {
  const p = props.params, raw = Array.isArray(p?.nodes) ? p.nodes.map(parseNode).filter((node): node is Node => Boolean(node)).slice(0, 3) : [];
  const nodes = raw.slice(), defaults: Node[] = [{ item: 'coin' }, { item: 'share' }, { item: 'warning' }];
  while (nodes.length < 3) nodes.push(defaults[nodes.length]!);
  return {
    nodes, marker: itemParam(p, 'marker', 'coin'), actors: actorsFor(p),
    mood: pick(p, 'mood', ['worried', 'happy', 'smug'] as const, 'worried'),
    speedup: num(p, 'speedup', 2.6, 1.1, 3.5),
    events: beats(props, dur, [0.12, 0.38, 0.62, 0.82]),
  };
}
function lapsAt(t: number, p: Plan, dur: number): number {
  const start = p.events[0]!, boostAt = p.events[1] ?? dur * 0.38;
  const rate = 0.22, end = Math.max(start + 0.2, dur);
  const ramp = Math.min(1, Math.max(0, (t - start) / Math.max(0.2, boostAt - start)));
  const afterBoost = Math.max(0, t - Math.max(start, boostAt));
  const rampDistance = rate * (t - start) * (1 + (p.speedup - 1) * Math.min(1, (t - start) / Math.max(0.2, end - start)) / 2);
  return Math.max(0, rampDistance + afterBoost * rate * (p.speedup - 1) * ramp * 0.35);
}
function crossings(p: Plan, dur: number): number[] {
  const total = lapsAt(dur, p, dur), out: number[] = [];
  for (let n = 1; n <= Math.ceil(total * 4); n++) {
    const target = n / 4; let low = p.events[0]!, high = dur;
    for (let i = 0; i < 18; i++) { const mid = (low + high) / 2; if (lapsAt(mid, p, dur) < target) low = mid; else high = mid; }
    if (high < dur - 0.03) out.push(high);
  }
  return out;
}
const near = (a: number, b: number) => 1 - clamp(Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) / 0.55);
function stationForStep(step: number) { return (step + 3) % 4; }
function stationPoint(station: number) {
  const theta = -Math.PI / 2 + station * Math.PI / 2;
  return { x: CX + Math.cos(theta) * RX, y: CY + Math.sin(theta) * RY };
}
function drawItemAlpha(ctx: Frame['ctx'], id: ItemId, x: number, y: number, t: number, alpha: number, rot: number) {
  if (alpha <= 0.01) return;
  const scale = Math.min(0.48, 270 / itemSize(id).w, 340 / itemSize(id).h);
  ctx.save(); ctx.globalAlpha *= alpha; drawItem(ctx, id, { x, y, t, scale, rot }); ctx.restore();
}
function actorKeys(events: number[], mood: Plan['mood']) {
  const expression = mood === 'happy' ? 'happy' as const : mood === 'smug' ? 'smug' as const : 'worried' as const;
  const keys: HedgyKey[] = [{ at: 0, pose: 'walk', expression }, { at: events[0] ?? 0.12, pose: 'carry', expression: 'determined' }];
  events.slice(0, 10).forEach((at, index) => keys.push({
    at: Math.max(0, at - 0.14), pose: index % 2 ? 'receive' as const : 'give' as const,
    expression: expression,
  }));
  return keys.sort((a, b) => a.at - b.at);
}

export const loopShot: ShotDef = {
  name: 'loop',
  stage: 'clean',
  describe: 'A real item rides a moving oval conveyor between two actors; each sorting gate changes it into the next real item, so the same object keeps coming around in a new form. params: nodes (three item ids, short words or {item,label} station tags; default coin, share, warning), marker (starting item id, default coin), actors (up to two actor ids; defaults hedgy and mouse), who (legacy first actor or none), partner (second actor), mood (worried|happy|smug), speedup (final belt speed, 1.1–3.5, default 2.6). Events: 1 = actor releases the item onto the belt; 2 = the far gate catches it and the belt accelerates; later events trigger gate clunks.',
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame, dur = Math.max(0.05, frame.dur), t = clamp(frame.t, 0, dur), p = plan(props, dur);
    const progress = lapsAt(t, p, dur), theta = START_ANGLE + progress * Math.PI * 2;
    const mx = CX + Math.cos(theta) * RX, my = CY + Math.sin(theta) * RY;
    const step = progress * 4, crossed = Math.floor(step), within = step - crossed;
    const before = crossed === 0 ? p.marker : p.nodes[(crossed - 1) % p.nodes.length]!.item ?? p.marker;
    const node = p.nodes[crossed % p.nodes.length]!, after = node.item ?? before;
    const change = ease.inOutCubic(phase(within, 0.76, 0.99));
    const movement = ease.outCubic(phase(t, p.events[0]!, p.events[0]! + 0.24));
    const visible = 0.18 + movement * 0.82;
    const stationPoints = [stationPoint(0), stationPoint(1), stationPoint(2), stationPoint(3)];
    drawStage(ctx, { floorY: 686, line: true, shadow: p.actors.length ? [{ x: 360, y: 672, w: 580 }] : [] });
    drawSprite(ctx, BELT, CX, CY, { anchor: [0.5, 0.5] });
    // Exposed rollers turn continuously under the belt and the top gate stamps each passing item.
    for (const [index, point] of stationPoints.entries()) {
      drawSprite(ctx, GATE, point.x, point.y, { anchor: [0.5, 0.5], rot: index === 0 ? Math.sin(t * 8) * 0.04 : 0 });
      drawSprite(ctx, ROLLER, point.x + (index % 2 ? -35 : 35), point.y + (index < 2 ? 26 : -26), { anchor: [0.5, 0.5], rot: t * (index % 2 ? -3 : 3) });
      if (node.word && stationForStep(crossed + 1) === index && change > 0.25) {
        label(ctx, node.word, point.x, point.y + (index === 0 ? 52 : 64), { variant: 'tag', maxWidth: 190 });
      }
    }

    const hits = crossings(p, dur);
    const cast = p.actors.slice(0, 2);
    for (let index = 0; index < cast.length; index++) {
      const left = index === 0, who = cast[index]!, x0 = left ? CX - 140 : CX + 140;
      const facing = left ? 1 : -1, bounds = actorBounds({ who, x: 0, y: 0, facing });
      const x = clamp(x0, 30 - bounds.left, 690 - bounds.right);
      const stationAngle = left ? Math.PI : 0;
      const actorEventTimes = hits.filter((_, i) => stationForStep(i + 1) === (left ? 3 : 1));
      const keys = actorKeys([p.events[0]!, ...actorEventTimes], p.mood);
      const contact = near(theta, stationAngle);
      const actorY = 668 + Math.sin(t * 7 + index) * 2.2;
      const current = actorBounds({ who, x, y: actorY, facing, time: t, keys });
      const correction = current.left < 28 ? 28 - current.left : current.right > 692 ? 692 - current.right : 0;
      drawActor(ctx, {
        who, x: x + correction, y: actorY, facing, scale: 1, time: t,
        look: 'up', keys, handTarget: { x: mx, y: my }, reach: 0.18 + contact * 0.76,
      });
    }
    const tangent = Math.atan2(Math.cos(theta) * RY, -Math.sin(theta) * RX);
    drawItemAlpha(ctx, before, mx, my, t, visible * (1 - change), tangent * 0.025);
    drawItemAlpha(ctx, after, mx, my, t, visible * change, tangent * 0.025);
    // Small impacts only when the item actually reaches a gate.
    const lastCrossing = hits[crossed - 1];
    if (lastCrossing !== undefined && t >= lastCrossing && t < lastCrossing + 0.26) {
      ring(ctx, mx, my, lastCrossing, t, { r: 46, width: 6, duration: 0.24, color: PAL.gold1 });
    }
    for (const [index, at] of p.events.slice(1).entries()) if (t >= at && t < at + 0.34) {
      const point = stationPoint(index === 0 ? 1 : 0);
      ring(ctx, point.x, point.y, at, t, { r: 46, width: 6, duration: 0.28, color: PAL.gold1 });
    }
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const safeDur = Math.max(0.05, dur), p = plan(props, safeDur);
    return cuesIn(safeDur, [
      cue(Math.max(0, p.events[0]! - 0.08), 'footfall', 0.7, CX - RX),
      cue(p.events[0]!, 'clunk', 1.1, CX), cue(p.events[1]!, 'rise', 0.65, CX),
      ...p.events.slice(2).map((at, i) => cue(at, i % 2 ? 'coin' : 'clack', 0.75, CX)),
      cue(safeDur * 0.88, 'slide', 0.55, CX),
    ]);
  },
};
