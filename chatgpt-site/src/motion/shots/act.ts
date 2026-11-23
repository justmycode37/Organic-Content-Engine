// act — a general choreography shot: up to two actors and up to three items, with a short script of
// verbs that fire on the narration's sync words (give, take, put, drop, appear, vanish, grow, shrink,
// shake, stamp, walk-in, walk-out, point, jump, celebrate, shock). Lets a storyboard act out a line
// that no fixed template covers, using the same actors, items and timing rules as every other shot.
import type { Cue, Frame, ShotProps } from '../core.ts';
import type { HedgyKey, HedgyPose, HedgyExpression } from '../actor/hedgy.ts';
import { arc, bob, clamp, ease, phase, squash } from '../kit/motion.ts';
import { poof, sparks } from '../kit/fx.ts';
import { drawStage, label } from '../kit/stage.ts';
import { ACTORS, STAGE, cue, cuesIn, drawActor, drawItem, isItem, itemSize, pick, str, type ItemId } from './common.ts';
import type { ShotDef } from './index.ts';

const VERBS = ['give', 'take', 'put', 'drop', 'appear', 'vanish', 'grow', 'shrink', 'shake', 'stamp', 'walk-in', 'walk-out', 'point', 'jump', 'celebrate', 'shock'] as const;
type Verb = typeof VERBS[number];
type Side = 'left' | 'right';
type Loc = 'hidden' | 'center' | 'left' | 'right' | 'top' | 'onCenter';
const MOODS = ['happy', 'worried', 'shocked', 'smug', 'determined', 'sad', 'neutral'] as const;
const X = { left: 128, right: 592, center: 360 } as const, PAW_Y = 600, FLOOR = STAGE.floor;
interface Move { at: number; verb: Verb; who: Side; item?: ItemId; word?: string }
interface Segment { at: number; dur: number; from: Loc; to: Loc; verb: Verb }
interface Plan { count: number; left: string; right: string; moods: Record<Side, typeof MOODS[number]>; moves: Move[]; items: Map<ItemId, { start: Loc; segments: Segment[]; tag?: string }>; dur: number }

const other = (side: Side): Side => side === 'left' ? 'right' : 'left';
function plan(props: ShotProps, dur: number): Plan {
  const p = props.params ?? {}, events = [...(props.events ?? [])].map(e => e.at).filter(Number.isFinite).sort((a, b) => a - b);
  const raw = Array.isArray(p.moves) ? p.moves.slice(0, 6) : [];
  const at = (n: unknown, i: number) => { const k = typeof n === 'number' ? Math.round(n) - 1 : i; return clamp(events[k] ?? (0.15 + 0.7 * (k + 0.5) / Math.max(1, raw.length)) * dur, 0.05, Math.max(0.05, dur - 0.3)); };
  const moves: Move[] = raw.flatMap((m, i) => {
    if (!m || typeof m !== 'object') return [];
    const o = m as Record<string, unknown>, verb = VERBS.includes(o.action as Verb) ? o.action as Verb : undefined;
    if (!verb) return [];
    return [{ at: at(o.event, i), verb, who: (o.who === 'right' ? 'right' : 'left') as Side, item: isItem(o.item) ? o.item : undefined, word: typeof o.word === 'string' ? o.word.toUpperCase().slice(0, 14) : undefined }];
  }).sort((a, b) => a.at - b.at);
  const items = new Map<ItemId, { start: Loc; segments: Segment[]; tag?: string }>();
  const center = isItem(p.item) ? p.item : undefined, leftItem = isItem(p.leftItem) ? p.leftItem : undefined, rightItem = isItem(p.rightItem) ? p.rightItem : undefined;
  if (center) items.set(center, { start: 'center', segments: [], tag: str(p, 'tag', '').toUpperCase().slice(0, 12) || undefined });
  if (leftItem) items.set(leftItem, { start: 'left', segments: [] });
  if (rightItem) items.set(rightItem, { start: 'right', segments: [] });
  const locOf = (id: ItemId) => { const s = items.get(id)!; return s.segments.at(-1)?.to ?? s.start; };
  const pickItem = (m: Move, prefer: Loc[]) => m.item ?? [...items.keys()].find(id => prefer.includes(locOf(id))) ?? [...items.keys()][0];
  for (const m of moves) {
    const travel = 0.42;
    const go = (id: ItemId | undefined, to: Loc, dur = travel, from?: Loc) => {
      if (!id) return;
      if (!items.has(id)) items.set(id, { start: 'hidden', segments: [] });
      items.get(id)!.segments.push({ at: m.at, dur, from: from ?? locOf(id), to, verb: m.verb });
    };
    if (m.verb === 'give') go(pickItem(m, [m.who, 'center']), other(m.who));
    else if (m.verb === 'take') go(pickItem(m, ['center', other(m.who)]), m.who);
    else if (m.verb === 'put') { const id = pickItem(m, [m.who]); const occupied = [...items.keys()].some(other => other !== id && locOf(other) === 'center'); go(id, occupied ? 'onCenter' : 'center'); }
    else if (m.verb === 'drop') go(m.item ?? pickItem(m, ['hidden', 'top']), 'center', 0.36, 'top');
    else if (m.verb === 'appear') go(m.item ?? pickItem(m, ['hidden']), m.item && items.get(m.item) ? 'center' : 'center', 0.22, 'hidden');
    else if (m.verb === 'vanish') go(pickItem(m, ['center', 'left', 'right']), 'hidden', 0.3);
    else if (m.verb === 'grow' || m.verb === 'shrink' || m.verb === 'shake') { const id = pickItem(m, ['center']); if (id) go(id, locOf(id), 0.5); }
  }
  return { count: Math.max(1, Math.min(60, Math.round(typeof p.count === 'number' ? p.count : 1))), left: pick(p, 'left', ACTORS, 'hedgy'), right: str(p, 'right', 'none') === 'none' ? 'none' : pick(p, 'right', ACTORS, 'clerk'), moods: { left: pick(p, 'leftMood', MOODS, 'neutral'), right: pick(p, 'rightMood', MOODS, 'neutral') }, moves, items, dur };
}

function sizeScale(id: ItemId, loc: Loc) {
  const s = itemSize(id), hand = loc === 'left' || loc === 'right' || loc === 'onCenter';
  return hand ? Math.min(0.42, 130 / s.w, 130 / s.h) : Math.min(0.8, 250 / s.w, 300 / s.h);
}
function place(id: ItemId, loc: Loc, s: Plan): { x: number; y: number; scale: number } {
  const scale = sizeScale(id, loc), h = itemSize(id, scale).h;
  if (loc === 'left' || loc === 'right') { const solo = s.right === 'none' && loc === 'left'; return { x: X[loc] + (loc === 'left' ? 118 : -118) + (solo ? 20 : 0), y: PAW_Y - 10, scale }; }
  if (loc === 'top') return { x: X.center, y: -160, scale };
  if (loc === 'onCenter') {
    // Tapped onto / laid against the item already standing at centre (a card on a terminal, cash on a counter item).
    const base = [...s.items.keys()].find(other => other !== id && s.items.get(other)!.start === 'center') ?? id;
    const bs = sizeScale(base, 'center'), bh = itemSize(base, bs).h;
    return { x: X.center + 20, y: FLOOR - bh - 6 + bh * 0.42, scale };
  }
  return { x: X.center, y: FLOOR - h / 2 - 6, scale };
}

function itemState(id: ItemId, s: Plan, t: number) {
  const it = s.items.get(id)!;
  let loc = it.start, seg: Segment | undefined;
  for (const g of it.segments) { if (t >= g.at) { loc = g.to; seg = g; } }
  const target = place(id, loc, s);
  if (!seg) return loc === 'hidden' ? undefined : { ...target, rot: 0, alpha: 1, sx: 1, sy: 1, loc };
  const u = clamp((t - seg.at) / seg.dur), e = ease.inOutCubic(u);
  if (seg.verb === 'vanish') return u >= 1 ? undefined : { ...place(id, seg.from, s), rot: 0, alpha: 1 - u, sx: 1 + u * 0.3, sy: 1 + u * 0.3, loc: seg.from };
  if (seg.verb === 'appear') { const k = ease.outBack(u); return { ...target, scale: target.scale * Math.max(0.01, k), rot: 0, alpha: 1, sx: 1, sy: 1, loc }; }
  if (seg.verb === 'grow' || seg.verb === 'shrink') { const f = seg.verb === 'grow' ? 1 + 0.45 * ease.outBack(u) : 1 - 0.5 * ease.outCubic(u); return { ...target, scale: target.scale * f, y: FLOOR - itemSize(id, target.scale * f).h / 2 - 6, rot: 0, alpha: 1, sx: 1, sy: 1, loc }; }
  if (seg.verb === 'shake') return { ...target, rot: Math.sin(u * Math.PI * 10) * 0.12 * (1 - u), x: target.x + Math.sin(u * Math.PI * 14) * 10 * (1 - u), alpha: 1, sx: 1, sy: 1, loc };
  const from = place(id, seg.from, s), sq = seg.verb === 'drop' ? squash(t, seg.at + seg.dur, 0.28, 0.26) : squash(t, seg.at + seg.dur, 0.14, 0.2);
  if (u >= 1) return { ...target, rot: 0, alpha: 1, sx: sq.sx, sy: sq.sy, loc };
  const pos = seg.verb === 'drop' ? { x: target.x, y: from.y + (target.y - from.y) * ease.inCubic(u) } : arc(from, target, 70, e);
  return { x: pos.x, y: pos.y, scale: from.scale + (target.scale - from.scale) * e, rot: Math.sin(u * Math.PI) * 0.12, alpha: 1, sx: 1, sy: 1, loc: u > 0.5 ? loc : seg.from };
}

/** Many copies of the centre item as a heap/wall, so "forty pairs" looks like forty. Rows pop in from the back. */
function drawPile(ctx: Frame['ctx'], id: ItemId, count: number, t: number, st: { x: number; y: number; scale: number; alpha: number; sx: number; sy: number }, appearAt: number) {
  const perRow = Math.max(2, Math.ceil(Math.sqrt(count * 1.2))), rows = Math.ceil(count / perRow);
  const base = itemSize(id), grow = Math.max(0.01, st.scale / Math.max(0.01, sizeScale(id, 'center')));
  const scale = Math.min(0.6, 400 / (perRow * base.w * 0.92)) * grow;
  const size = itemSize(id, scale), step = Math.max(size.h * 0.72, size.w * 0.42), floorY = st.y + itemSize(id, st.scale).h / 2;
  let n = 0;
  for (let r = rows - 1; r >= 0; r--) {
    const inRow = Math.min(perRow - (r % 2 ? 1 : 0), count - n);
    for (let c = 0; c < inRow && n < count; c++, n++) {
      const pop = ease.outBack(clamp((t - appearAt - (rows - 1 - r) * 0.05 - c * 0.015) / 0.25));
      if (pop <= 0) continue;
      const x = st.x + (c - (inRow - 1) / 2) * size.w * 0.92, y = floorY - size.h / 2 - r * step;
      drawItem(ctx, id, { x, y, t, scale: scale * pop, alpha: st.alpha, rot: ((c * 7 + r * 3) % 5 - 2) * 0.03 });
    }
  }
}

function actorKeys(side: Side, s: Plan): HedgyKey[] {
  const mood = s.moods[side] as HedgyExpression, keys: HedgyKey[] = [{ at: 0, pose: 'idle', expression: mood, look: 'forward' }];
  const holdsAt = (t: number) => [...s.items.keys()].some(id => itemState(id, s, t)?.loc === side);
  for (const m of s.moves) {
    const me = m.who === side, them = !me;
    let pose: HedgyPose | undefined, expression: HedgyExpression = mood;
    if (m.verb === 'give') pose = me ? 'give' : 'receive';
    else if (m.verb === 'take') pose = me ? 'receive' : 'shock';
    else if (m.verb === 'put') pose = me ? 'give' : undefined;
    else if (m.verb === 'drop' || m.verb === 'stamp' || m.verb === 'vanish') { pose = 'shock'; expression = 'shocked'; }
    else if (m.verb === 'appear' || m.verb === 'grow') { pose = 'lookup'; }
    else if (m.verb === 'shrink' || m.verb === 'shake') { pose = 'sweat'; expression = 'worried'; }
    else if (me && (m.verb === 'point' || m.verb === 'jump' || m.verb === 'celebrate' || m.verb === 'shock')) { pose = m.verb; if (m.verb === 'celebrate' || m.verb === 'jump') expression = 'happy'; if (m.verb === 'shock') expression = 'shocked'; }
    else if (me && m.verb === 'walk-in') { keys.push({ at: 0, pose: 'walk', expression: 'determined', look: 'forward' }); pose = 'idle'; }
    else if (me && m.verb === 'walk-out') pose = 'walk';
    if (!pose || (them && !['give', 'take', 'drop', 'stamp', 'vanish', 'appear', 'grow', 'shrink', 'shake'].includes(m.verb))) continue;
    keys.push({ at: Math.max(0, m.at - 0.08), pose, expression, look: m.verb === 'drop' || m.verb === 'appear' || m.verb === 'grow' ? 'up' : 'forward' });
    if (m.verb !== 'walk-out') keys.push({ at: m.at + 0.55, pose: holdsAt(m.at + 0.6) ? 'hold' : (m.verb === 'celebrate' || m.verb === 'jump' ? 'celebrate' : 'point'), expression, look: 'forward' });
  }
  // Keep a little life after the last action.
  const last = keys.at(-1)!;
  for (let at = last.at + 0.6, i = 0; at < s.dur - 0.1; at += 0.6, i++) keys.push({ at, pose: holdsAt(at) ? 'hold' : i % 2 ? 'think' : last.pose === 'walk' ? 'walk' : 'idle', expression: last.expression, look: 'forward' });
  return keys.sort((a, b) => a.at - b.at);
}

function actorX(side: Side, s: Plan, t: number) {
  const home = X[side], off = side === 'left' ? -220 : STAGE.w + 220;
  const enter = s.moves.find(m => m.who === side && m.verb === 'walk-in'), leave = s.moves.find(m => m.who === side && m.verb === 'walk-out');
  let x = home;
  if (enter) x = off + (home - off) * ease.outCubic(phase(t, Math.max(0, enter.at - 0.6), enter.at));
  if (leave) x = x + (off - x) * ease.inCubic(phase(t, leave.at, leave.at + 0.7));
  return x;
}

export const actShot: ShotDef = {
  name: 'act',
  stage: 'clean',
  describe: 'A general choreography shot that acts out a line no other shot covers: up to two actors (left, right) and up to three items, with a script of verbs that fire on the sync words in order. params: left (actor id, default hedgy), right (actor id or none, default clerk), leftMood/rightMood, item (item standing at centre), count (1–60: show the centre item as a heap/wall of that many copies, e.g. 40 unsold pairs), leftItem/rightItem (item held in that actor\'s paw), tag (short word on the centre item), moves (1–6 steps, each {"event":1..6,"action":"give|take|put|drop|appear|vanish|grow|shrink|shake|stamp|walk-in|walk-out|point|jump|celebrate|shock","who":"left|right","item":"item id (optional)","word":"STAMP WORD (stamp only)"}). give = who hands their item to the other actor; take = who grabs the centre item (or the other actor\'s); put = who sets their item down at centre; drop = an item falls from above onto the centre; appear/vanish = an item pops in at centre / poofs away; grow/shrink/shake = the centre item gets bigger / smaller / wobbles; stamp = a word slams down above the action; walk-in/walk-out = who enters or leaves; point/jump/celebrate/shock = who reacts. Items move paw to paw in clear arcs and stay where they land.',
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame, dur = Math.max(0.05, frame.dur), t = clamp(frame.t, 0, dur), s = plan(props, dur);
    const sides: Side[] = s.right === 'none' ? ['left'] : ['left', 'right'];
    drawStage(ctx, { floorY: FLOOR, line: true, shadow: sides.map(side => ({ x: actorX(side, s, t), y: FLOOR - 2, w: 160 })) });
    const states = [...s.items.keys()].map(id => ({ id, st: itemState(id, s, t) }));
    // Centre items behind the actors' paws; held/travelling items in front.
    const pileId = s.count > 1 && isItem(props.params?.item) ? props.params!.item as ItemId : undefined;
    for (const { id, st } of states) {
      if (!st || st.loc !== 'center' || s.items.get(id)!.start === 'onCenter') continue;
      if (id === pileId) { const appear = s.items.get(id)!.segments.find(g => g.verb === 'appear' || g.verb === 'drop')?.at ?? -1; drawPile(ctx, id, s.count, t, st, appear); }
      else drawItem(ctx, id, { x: st.x, y: st.y + bob(t + 0.3, 2.4, 3), t, scale: st.scale, rot: st.rot, alpha: st.alpha, sx: st.sx, sy: st.sy });
    }
    for (const side of sides) {
      const held = states.find(x => x.st && x.st.loc === side);
      const who = side === 'left' ? s.left : s.right;
      drawActor(ctx, { who, x: actorX(side, s, t), y: FLOOR, facing: side === 'left' ? 1 : -1, time: t, keys: actorKeys(side, s), ...(held?.st ? { handTarget: { x: held.st.x + (side === 'left' ? -12 : 12), y: held.st.y + 10 }, reach: 1 } : {}) });
    }
    for (const { id, st } of states) if (st && st.loc !== 'center') drawItem(ctx, id, { x: st.x, y: st.y, t, scale: st.scale, rot: st.rot, alpha: st.alpha, sx: st.sx, sy: st.sy });
    const centre = states.find(x => x.st?.loc === 'center' && s.items.get(x.id)?.tag);
    if (centre?.st) label(ctx, s.items.get(centre.id)!.tag!, centre.st.x, centre.st.y - itemSize(centre.id, centre.st.scale).h / 2 - 40, { variant: 'tag', maxWidth: 320 });
    for (const m of s.moves) {
      if (m.verb === 'stamp' && m.word && t >= m.at - 0.12) {
        const k = phase(t, m.at - 0.12, m.at), sq = squash(t, m.at, 0.3, 0.3);
        ctx.save(); ctx.translate(X.center, 150 - (1 - ease.inCubic(k)) * 260); ctx.scale(sq.sx * (1.4 - 0.4 * k), sq.sy * (1.4 - 0.4 * k)); ctx.rotate(-0.05);
        label(ctx, m.word, 0, 0, { variant: 'stamp', maxWidth: 560 });
        ctx.restore();
        sparks(ctx, X.center, 170, m.at, t, { count: 6, seed: frame.seed });
      }
      if (m.verb === 'vanish') { const id = [...s.items.keys()].find(i => s.items.get(i)!.segments.some(g => g.at === m.at && g.verb === 'vanish')); if (id) { const p = place(id, s.items.get(id)!.segments.find(g => g.at === m.at)!.from, s); poof(ctx, p.x, p.y, m.at, t, { count: 6, seed: frame.seed + 3, radius: 50 }); } }
      if (m.verb === 'drop') poof(ctx, X.center, FLOOR - 10, m.at + 0.36, t, { count: 5, seed: frame.seed + 5, radius: 40 });
      if (m.verb === 'appear' || m.verb === 'give' || m.verb === 'take') sparks(ctx, m.verb === 'appear' ? X.center : X[m.verb === 'give' ? other(m.who) : m.who] + (m.who === 'left' ? 100 : -100), m.verb === 'appear' ? FLOOR - 160 : PAW_Y, m.at + (m.verb === 'appear' ? 0.2 : 0.42), t, { count: 4, seed: frame.seed + 9 });
    }
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const s = plan(props, Math.max(0.05, dur));
    const kind: Record<Verb, Cue['kind']> = { give: 'swish', take: 'swish', put: 'thump', drop: 'thud', appear: 'pop', vanish: 'whump', grow: 'rise', shrink: 'gulp', shake: 'rumble', stamp: 'stamp', 'walk-in': 'footfall', 'walk-out': 'footfall', point: 'click', jump: 'boing', celebrate: 'ding', shock: 'knock' };
    return cuesIn(dur, s.moves.flatMap(m => {
      const x = m.who === 'left' ? X.left : X.right, list = [cue(m.at, kind[m.verb], 1.2, x)];
      if (m.verb === 'give' || m.verb === 'take') list.push(cue(m.at + 0.42, 'thump', 1, x));
      if (m.verb === 'drop') list.push(cue(m.at + 0.36, 'impact', 1.4, X.center));
      return list;
    }));
  },
};
