// split — portions travel from one readable source to two to four owners.
import type { Cue, Frame, ShotProps } from '../core.ts';
import { arc, bob, clamp, ease, lerp, phase, squash } from '../kit/motion.ts';
import { Grid, PAL } from '../kit/pixel.ts';
import { drawSprite } from '../kit/sprite.ts';
import { drawStage } from '../kit/stage.ts';
import { ACTORS, ITEM_IDS, STAGE, actorBounds, actorPaw, beats, cue, cuesIn, drawActor, drawItem, itemSize, num, pick, type ItemId } from './common.ts';
import type { ShotDef } from './index.ts';

const MODES = ['split', 'merge'] as const;
type Mode = typeof MODES[number];
interface Point { x: number; y: number }
interface Recipient { who: string; x: number; facing: 1 | -1; scale: number; at: number }
interface Plan {
  item: ItemId;
  parts: number;
  mode: Mode;
  recipients: Recipient[];
  times: number[];
  travel: number;
  sourceScale: number;
  pieceScale: number;
}

const FONT: Record<string, readonly string[]> = {
  '0': ['111','101','101','101','111'], '1': ['010','110','010','010','111'],
  '2': ['110','001','010','100','111'], '3': ['110','001','010','001','110'],
  '4': ['101','101','111','001','001'], '5': ['111','100','110','001','110'],
  '6': ['011','100','110','101','010'], '7': ['111','001','010','010','010'],
  '8': ['010','101','010','101','010'], '9': ['010','101','011','001','110'],
  '/': ['001','001','010','100','100'],
};

function fractionBadge(index: number, count: number) {
  const value = `${index + 1}/${count}`, cols = value.length * 4 + 2, g = new Grid(cols, 9);
  g.rect(0, 0, cols, 9, PAL.ink).rect(1, 1, cols - 2, 7, PAL.paper);
  let x = 2;
  for (const char of value) {
    const glyph = FONT[char] ?? FONT['1']!;
    glyph.forEach((row, y) => [...row].forEach((on, xx) => { if (on === '1') g.rect(x + xx, y + 2, 1, 1, PAL.ink); }));
    x += 4;
  }
  return g.sprite(`shot-split:fraction:${value}`);
}

function sourceScaleFor(item: ItemId): number {
  const size = itemSize(item);
  return Math.min(0.70, 360 / Math.max(size.w, size.h));
}

function pieceScaleFor(item: ItemId): number {
  const size = itemSize(item);
  return Math.min(0.32, 126 / Math.max(size.w, size.h));
}

function drawItemAt(ctx: Frame['ctx'], item: ItemId, point: Point, t: number, scale: number, extra: Record<string, unknown> = {}) {
  drawItem(ctx, item, { x: point.x, y: point.y, t, scale, ...extra });
}

// Broad triangular face, toppings, and a thick browned crust at the wide end.
const pizzaSlice = (() => {
  const g = new Grid(52, 50);
  g.poly([{x:26,y:3},{x:49,y:43},{x:47,y:47},{x:5,y:47},{x:3,y:43}], PAL.ink);
  g.poly([{x:26,y:7},{x:45,y:41},{x:7,y:41}], PAL.orange3);
  g.poly([{x:26,y:9},{x:41,y:38},{x:11,y:38}], PAL.gold2);
  g.poly([{x:26,y:14},{x:37,y:35},{x:15,y:35}], PAL.red2);
  g.poly([{x:9,y:38},{x:43,y:38},{x:46,y:43},{x:6,y:43}], PAL.orange3);
  g.line({x:12,y:41},{x:40,y:41},2,PAL.gold1);
  g.ellipse(25,21,3,3,PAL.red1).ellipse(21,29,2.5,2.5,PAL.red1).ellipse(30,31,2.5,2.5,PAL.red1);
  g.outline(PAL.ink);
  return g.sprite('shot-split:triangular-pizza-slice');
})();

function recipientXs(count: number): { xs: number[]; scale: number } {
  if (count === 2) return { xs: [160, 560], scale: 0.62 };
  if (count === 3) return { xs: [94, 360, 626], scale: 0.48 };
  return { xs: [78, 260, 460, 642], scale: 0.40 };
}

function ownerList(props: ShotProps, count: number): string[] {
  const raw = props.params?.owners;
  const requested = Array.isArray(raw)
    ? raw.filter((v): v is string => typeof v === 'string')
    : typeof raw === 'string' ? raw.split(',').map(v => v.trim()) : [];
  const valid = requested.filter((v): v is typeof ACTORS[number] => ACTORS.includes(v as typeof ACTORS[number]));
  const first = pick(props.params, 'who', ACTORS, 'hedgy');
  const owners = [...new Set(valid.length ? valid : [first])];
  for (const fallback of ['hedgy', 'badger', 'owl', 'mouse'] as const) {
    if (owners.length >= count) break;
    if (!owners.includes(fallback)) owners.push(fallback);
  }
  while (owners.length < count) owners.push(first);
  return owners.slice(0, count);
}

function plannedTimes(props: ShotProps, dur: number, count: number, travel: number): number[] {
  const start = Math.min(0.14, dur * 0.09);
  const end = Math.max(start, dur - travel - Math.min(0.14, dur * 0.1));
  const gap = count > 1 ? (end - start) / (count - 1) : 0;
  const requested = beats(props, dur, Array.from({ length: count }, (_, i) => 0.12 + (i / Math.max(1, count - 1)) * 0.62));
  const result: number[] = [];
  for (let i = 0; i < count; i++) {
    const lo = i === 0 ? start : result[i - 1]! + Math.min(0.32, gap);
    const hi = end - Math.min(0.32, gap) * (count - i - 1);
    result.push(clamp(requested[i] ?? start + gap * i, lo, Math.max(lo, hi)));
  }
  return result;
}

function plan(props: ShotProps, dur: number): Plan {
  const p = props.params;
  const rawOwners = Array.isArray(p?.owners) ? p.owners.length : typeof p?.owners === 'string' ? p.owners.split(',').filter(Boolean).length : 0;
  const parts = Math.round(num(p, 'parts', rawOwners ? clamp(rawOwners, 2, 4) : 3, 2, 4));
  const mode = pick(p, 'mode', MODES, 'split');
  const item = pick(p, 'item', ITEM_IDS, 'share');
  const travel = Math.min(0.54, Math.max(0.30, dur * 0.24));
  const times = plannedTimes(props, dur, parts, travel);
  const { xs, scale } = recipientXs(parts);
  const owners = ownerList(props, parts);
  const recipients = xs.map((x, i) => {
    const facing: 1 | -1 = x <= STAGE.centre ? 1 : -1;
    const at = times[i]!;
    const key = [{ at: 0, pose: 'think' as const, expression: 'neutral' as const },
      { at: Math.max(0.08, times[i]! - 0.08), pose: 'give' as const, expression: 'determined' as const },
      { at: times[i]! + travel * 0.75, pose: 'receive' as const, expression: 'happy' as const },
      { at: times[i]! + travel + 0.32, pose: 'hold' as const, expression: 'happy' as const }];
    const bounds = actorBounds({ who: owners[i]!, x, y: STAGE.floor, facing, scale, time: 0, keys: key });
    const safeX = x + (bounds.left < 30 ? 30 - bounds.left : bounds.right > 690 ? 690 - bounds.right : 0);
    return { who: owners[i]!, x: safeX, facing, scale, at };
  });
  return { item, parts, mode, recipients, times, travel, sourceScale: sourceScaleFor(item), pieceScale: item === 'pizza' ? 0.28 : pieceScaleFor(item) };
}

function recipientKeys(at: number, index: number, dur: number, travel: number): { at: number; pose: 'think' | 'give' | 'receive' | 'hold' | 'tap' | 'point'; expression: 'neutral' | 'determined' | 'happy' }[] {
  const keys: { at: number; pose: 'think' | 'give' | 'receive' | 'hold' | 'tap' | 'point'; expression: 'neutral' | 'determined' | 'happy' }[] = [
    { at: 0, pose: 'think', expression: 'neutral' },
    { at: Math.max(0.05, at - 0.10), pose: 'give', expression: 'determined' },
    { at: at + travel * 0.75, pose: 'receive', expression: 'happy' },
    { at: at + travel + 0.12, pose: 'hold', expression: 'happy' },
  ];
  for (let next = at + travel + 0.46, step = 0; next < dur - 0.05; next += 0.54, step++) {
    keys.push({ at: next, pose: (step + index) % 2 ? 'point' : 'tap', expression: 'happy' });
  }
  return keys;
}

function piecePoint(recipient: Recipient, t: number, index: number, item: ItemId, travel: number): Point {
  const keys = recipientKeys(recipient.at, index, Math.max(recipient.at + travel + 0.5, t + 0.01), travel);
  const actor = { who: recipient.who, x: recipient.x, y: STAGE.floor, facing: recipient.facing, scale: recipient.scale, time: t, keys };
  const paw = actorPaw(actor), dims = itemSize(item, item === 'pizza' ? 0.28 : pieceScaleFor(item));
  const x = paw.x + recipient.facing * (Math.min(28, dims.w * 0.18) + 6);
  const y = Math.min(paw.y - 78, STAGE.floor - 150 * recipient.scale);
  return { x: clamp(x, 28 + dims.w / 2, STAGE.w - 28 - dims.w / 2), y: clamp(y, 100, STAGE.h - dims.h / 2 - 18) };
}

function sourcePoint(s: Plan, index: number): Point {
  const size = itemSize(s.item, s.sourceScale);
  const angle = Math.PI * 0.5 + ((index / Math.max(1, s.parts - 1)) - 0.5) * 1.2;
  return { x: STAGE.centre + Math.cos(angle) * Math.min(46, size.w * 0.16), y: 342 + Math.sin(angle) * Math.min(38, size.h * 0.14) };
}

function drawPiece(ctx: Frame['ctx'], s: Plan, index: number, point: Point, t: number, alpha = 1, rot = 0, sx = 1, sy = 1) {
  const scale = s.item === 'pizza' ? s.pieceScale : s.pieceScale;
  if (s.item === 'pizza') {
    drawSprite(ctx, pizzaSlice, point.x, point.y, { anchor: [0.5, 0.5], scale, alpha, rot, sx, sy });
  } else {
    drawItemAt(ctx, s.item, point, t, scale, { alpha, rot, sx, sy });
    const dims = itemSize(s.item, scale), badge = fractionBadge(index, s.parts);
    const badgeScale = 0.58, badgeW = badge.w * badgeScale, badgeH = badge.h * badgeScale;
    const badgeX = clamp(point.x + Math.min(40, dims.w * 0.3), 35 + badgeW / 2, STAGE.w - 35 - badgeW / 2);
    const badgeY = clamp(point.y - dims.h / 2 - badgeH / 2 - 3, 40 + badgeH / 2, STAGE.h - badgeH / 2 - 20);
    drawSprite(ctx, badge, badgeX, badgeY, { anchor: [0.5, 0.5], scale: badgeScale, alpha });
  }
}

export const splitShot: ShotDef = {
  name: 'split',
  stage: 'clean',
  describe: 'One whole item stays visible while two to four recognizable portions travel into the reaching paws of their owners; pizza becomes crusted triangular slices and other items carry a small fraction tag. params: item (any library item, default share), parts (2–4, default 3), owners (2–4 actor ids, default hedgy, badger, owl, mouse; old who sets the first owner), who (first owner id, default hedgy), mode (split | merge, default split). Events: each event starts the next portion moving to its owner; merge events return portions to the whole; missing beats are spaced evenly.',
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame, dur = Math.max(0.05, frame.dur), t = clamp(frame.t, 0, dur), s = plan(props, dur);
    const source = { x: STAGE.centre, y: 342 };
    const sourceVisible = s.mode === 'split' ? 1 : ease.outCubic(phase(t, s.times[s.parts - 1]! + s.travel - 0.16, s.times[s.parts - 1]! + s.travel));

    drawStage(ctx, { floorY: STAGE.floor, line: true, shadow: s.recipients.map(owner => ({ x: owner.x, y: STAGE.floor - 2, w: 105 })) });
    if (sourceVisible > 0.01) {
      const hit = s.mode === 'merge' ? squash(t, s.times[s.parts - 1]! + s.travel, 0.18, 0.13) : { sx: 1, sy: 1 };
      drawItemAt(ctx, s.item, source, t, s.sourceScale, { alpha: sourceVisible, sx: hit.sx, sy: hit.sy });
    }

    for (let i = 0; i < s.parts; i++) {
      const owner = s.recipients[i]!, keys = recipientKeys(owner.at, i, dur, s.travel), point = piecePoint(owner, t, i, s.item, s.travel);
      const active = t >= owner.at - 0.10 && t < owner.at + s.travel + 0.54;
      drawActor(ctx, {
        who: owner.who, x: owner.x, y: STAGE.floor, facing: owner.facing, scale: owner.scale, time: t,
        look: active ? 'down' : 'forward', keys,
        handTarget: { x: point.x - owner.facing * 12, y: point.y }, reach: active ? 0.85 : 0.42,
      });
    }
    for (let i = 0; i < s.parts; i++) {
      const owner = s.recipients[i]!, at = s.times[i]!, hand = piecePoint(owner, t, i, s.item, s.travel);
      const origin = sourcePoint(s, i), depart = at, arrive = at + s.travel;
      const progress = ease.inOutCubic(phase(t, depart, arrive));
      const start = s.mode === 'split' ? origin : hand;
      const end = s.mode === 'split' ? hand : origin;
      const pos = t < depart ? (s.mode === 'merge' ? hand : origin) : arc(start, end, s.mode === 'split' ? -36 : 30, progress);
      const alpha = s.mode === 'split'
        ? (t < depart || t >= arrive ? 0 : 1)
        : (t < depart ? 1 : 1 - ease.outCubic(phase(t, arrive - 0.12, arrive)));
      const hit = squash(t, arrive, 0.16, 0.19);
      if (alpha > 0.01) drawPiece(ctx, s, i, pos, t, alpha, (1 - progress) * (i % 2 ? 0.055 : -0.055), hit.sx, hit.sy);
      if (s.mode === 'split' && t >= arrive) {
        const settled = piecePoint(owner, t, i, s.item, s.travel), wobble = bob(t + i * 0.11, 1.15, 4);
        drawPiece(ctx, s, i, { x: settled.x, y: settled.y + wobble }, t, 1, Math.sin(t * 1.4 + i) * 0.018);
      }
    }
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const safeDur = Math.max(0.05, dur), s = plan(props, safeDur);
    return cuesIn(safeDur, [
      cue(0.05, 'footfall', 0.55, s.recipients[0]!.x),
      ...s.times.map((at, i) => cue(s.mode === 'split' ? at : at + s.travel * 0.18, s.mode === 'split' ? (i ? 'slide' : 'swish') : 'slide', i ? 0.82 : 1.08, s.recipients[i]!.x)),
      ...s.times.map((at, i) => cue(s.mode === 'split' ? at + s.travel : at + s.travel * 0.18, s.mode === 'split' ? 'land' : 'thud', i ? 0.82 : 1.1, s.mode === 'split' ? s.recipients[i]!.x : STAGE.centre)),
    ]);
  },
};
