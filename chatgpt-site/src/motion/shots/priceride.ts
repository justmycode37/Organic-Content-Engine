import { clamp, hash, type Cue, type Frame, type ShotProps } from '../core.ts';
import { drawHedgy } from '../actor/hedgy.ts';
import { createCameraRig } from '../fx/rig.ts';
import { drawBurst } from '../fx/particles.ts';
import { pixelText } from '../prim.ts';
import { drawTicket2D } from '../sets/ticket.ts';
import type { ShotDef } from './index.ts';

const CELL = 4;
const RED_DARK = '#471715';
const RED_MID = '#AA302A';
const RED_HOT = '#F34A40';
const snap = (n: number) => Math.round(n / CELL) * CELL;
const clamp01 = (n: number) => clamp(n, 0, 1);
const easeOut = (n: number) => 1 - (1 - clamp01(n)) ** 3;

interface Point { x: number; y: number }
interface KeyPoint { t: number; point: Point }

function eventAt(props: ShotProps, kind: string, dur: number, fallback: number) {
  const event = props.events?.find(item => item.kind.toLowerCase() === kind.toLowerCase());
  return clamp(event && Number.isFinite(event.at) ? event.at : dur * fallback, 0, dur);
}

function pathKeys(dur: number, jumpAt: number, lossesAt: number): KeyPoint[] {
  const handoffAt = Math.max(lossesAt + 0.42, dur - 0.52);
  const beforeJump = Math.max(0.08, jumpAt - 0.14);
  const afterJump = Math.min(dur, jumpAt + 0.28);
  const points: KeyPoint[] = [
    { t: 0, point: { x: 214, y: 704 } },
    { t: beforeJump, point: { x: 356, y: 680 } },
    { t: jumpAt, point: { x: 492, y: 424 } },
    { t: afterJump, point: { x: 548, y: 368 } },
    { t: Math.max(afterJump + 0.04, lossesAt - 0.1), point: { x: 660, y: 324 } },
    { t: lossesAt, point: { x: 728, y: 270 } },
    { t: Math.min(handoffAt - 0.2, lossesAt + 0.38), point: { x: 812, y: 222 } },
    { t: handoffAt, point: { x: 892, y: 190 } },
    { t: dur, point: { x: 892, y: 190 } },
  ];
  return points.filter((key, index) => index === 0 || key.t > points[index - 1]!.t).map(key => ({
    t: clamp(key.t, 0, dur), point: key.point,
  }));
}

function positionAt(keys: readonly KeyPoint[], time: number): Point {
  if (time <= keys[0]!.t) return { ...keys[0]!.point };
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i]!, a = keys[i - 1]!;
    if (time > b.t) continue;
    const p = easeOut((time - a.t) / Math.max(.001, b.t - a.t));
    return { x: a.point.x + (b.point.x - a.point.x) * p, y: a.point.y + (b.point.y - a.point.y) * p };
  }
  return { ...keys.at(-1)!.point };
}

function pathToTime(keys: readonly KeyPoint[], time: number): Point[] {
  const points = [keys[0]!.point];
  for (let i = 1; i < keys.length; i++) {
    const key = keys[i]!;
    if (time >= key.t) points.push(key.point);
    else break;
  }
  const head = positionAt(keys, time), last = points.at(-1)!;
  if (Math.hypot(last.x - head.x, last.y - head.y) > 1) points.push(head);
  return points;
}

function drawBalconyTier(ctx: Frame['ctx'], y: number, layer: number, index: number, seed: number, t: number, panX: number) {
  if (y < -210 || y > 1370) return;
  const inset = layer === 0 ? 150 : layer === 1 ? 70 : 0;
  const x = inset + panX + Math.round(Math.sin(index * .8 + layer) * (layer === 0 ? 18 : 8));
  const w = 1080 - inset * 2;
  const face = layer === 0 ? '#24262B' : layer === 1 ? '#303238' : '#41444B';
  const rail = layer === 0 ? '#5C6067' : layer === 1 ? '#777B82' : '#A1A5AB';
  const height = layer === 0 ? 70 : layer === 1 ? 86 : 100;

  ctx.fillStyle = '#111317';
  ctx.fillRect(snap(x - 12), snap(y - 16), snap(w + 24), height + 36);
  ctx.fillStyle = face;
  ctx.fillRect(snap(x), snap(y), snap(w), height);
  ctx.fillStyle = rail;
  ctx.fillRect(snap(x), snap(y), snap(w), 7);
  ctx.fillStyle = '#17191D';
  ctx.fillRect(snap(x + 8), snap(y + 19), snap(w - 16), 15);
  ctx.fillStyle = layer === 2 ? '#26292E' : '#1B1D22';
  ctx.fillRect(snap(x + 8), snap(y + 39), snap(w - 16), height - 46);
  ctx.fillStyle = layer === 0 ? '#363940' : '#4B4F56';
  ctx.fillRect(snap(x), snap(y + height - 10), snap(w), 8);

  const bays = layer === 0 ? 10 : layer === 1 ? 8 : 6;
  for (let bay = 0; bay < bays; bay++) {
    const bx = x + 28 + bay * (w - 56) / bays;
    const bw = (w - 56) / bays - 12;
    const lit = hash(index * 57 + bay, seed + layer * 31) > (layer === 0 ? .72 : .62);
    ctx.fillStyle = '#0C0D10';
    ctx.fillRect(snap(bx), snap(y + 45), snap(bw), height - 63);
    ctx.fillStyle = lit ? '#B8BBC1' : layer === 0 ? '#454950' : '#6C7077';
    ctx.fillRect(snap(bx + 8), snap(y + 52), snap(Math.max(8, bw - 16)), layer === 0 ? 21 : 30);
    ctx.fillStyle = '#272A30';
    ctx.fillRect(snap(bx + 5), snap(y + height - 20), snap(Math.max(8, bw - 10)), 5);
  }

  for (let post = 0; post <= bays; post++) {
    const px = x + post * w / bays;
    ctx.fillStyle = layer === 2 ? '#989CA3' : '#666A71';
    ctx.fillRect(snap(px), snap(y + 7), layer === 2 ? 6 : 4, height - 10);
  }
  if (layer === 2) {
    // The nearest balcony sweeps past the lens fastest.
    ctx.fillStyle = '#B4B7BD';
    ctx.fillRect(0, snap(y + height - 2), 1080, 7);
    ctx.fillStyle = '#1A1C20';
    for (let post = 0; post < 13; post++) ctx.fillRect(post * 92 + 18, snap(y + height + 5), 12, 54);
  }

  // A few shifting seat pixels create lateral parallax within each tier.
  const drift = Math.round(Math.sin(t * (layer + 1) * .7 + index) * (layer + 1) * 3);
  ctx.fillStyle = '#D0D2D7';
  for (let i = 0; i < 11; i++) {
    const px = x + 22 + i * (w - 44) / 11 + drift;
    const py = y + height - 22 - (i % 3) * 5;
    if (hash(index * 101 + i, seed + 97 + layer) > .35) ctx.fillRect(snap(px), snap(py), 8, 8);
  }
}

function drawVenue(ctx: Frame['ctx'], time: number, scroll: number, scrollX: number, seed: number) {
  ctx.fillStyle = '#181A1F';
  ctx.fillRect(0, 0, 1080, 1290);
  ctx.fillStyle = '#25272D';
  ctx.fillRect(0, 0, 1080, 230);
  ctx.fillStyle = '#0E1013';
  ctx.beginPath();
  ctx.moveTo(0, 218); ctx.lineTo(176, 0); ctx.lineTo(904, 0); ctx.lineTo(1080, 218);
  ctx.lineTo(1010, 254); ctx.lineTo(70, 254); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#8A8E95';
  ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(0, 220); ctx.lineTo(177, 10); ctx.lineTo(903, 10); ctx.lineTo(1080, 220); ctx.stroke();
  ctx.strokeStyle = '#4F535A';
  ctx.lineWidth = 16;
  for (let i = 0; i < 7; i++) {
    const x = 110 + i * 145;
    ctx.beginPath(); ctx.moveTo(snap(x), 10); ctx.lineTo(snap(540 + (x - 540) * .73), 240); ctx.stroke();
  }

  const farShift = scroll * .25;
  const middleShift = scroll * .62;
  const nearShift = scroll * 1.12;
  for (let i = -2; i < 9; i++) {
    drawBalconyTier(ctx, snap(i * 238 + farShift), 0, i, seed, time, -scrollX * .24);
    drawBalconyTier(ctx, snap(-105 + i * 270 + middleShift), 1, i, seed, time, -scrollX * .56);
    drawBalconyTier(ctx, snap(-265 + i * 355 + nearShift), 2, i, seed, time, -scrollX);
  }

  // Haze and suspended lamps make the upward camera travel legible between balcony passes.
  for (let i = 0; i < 140; i++) {
    const x = Math.floor(hash(i, seed + 141) * 1080 / CELL) * CELL;
    const y = Math.floor(hash(i, seed + 155) * 1290 / CELL) * CELL;
    ctx.fillStyle = hash(i, seed + Math.floor(time * 2) + 171) > .52 ? '#33363D' : '#292C32';
    ctx.fillRect(x, y, i % 9 === 0 ? 8 : CELL, CELL);
  }
}

function drawPixelLine(ctx: Frame['ctx'], a: Point, b: Point, color: string, width: number, alpha = 1) {
  let x = Math.round(a.x / CELL), y = Math.round(a.y / CELL);
  const ex = Math.round(b.x / CELL), ey = Math.round(b.y / CELL);
  const dx = Math.abs(ex - x), sx = x < ex ? 1 : -1;
  const dy = -Math.abs(ey - y), sy = y < ey ? 1 : -1;
  let err = dx + dy, guard = 0;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = color;
  while (guard++ < 5000) {
    ctx.fillRect(x * CELL - width / 2, y * CELL - width / 2, width, width);
    if (x === ex && y === ey) break;
    const twice = err * 2;
    if (twice >= dy) { err += dy; x += sx; }
    if (twice <= dx) { err += dx; y += sy; }
  }
  ctx.restore();
}

function drawLossBand(ctx: Frame['ctx'], points: readonly Point[], saleY: number, bloom: number, seed: number) {
  if (points.length < 2 || bloom <= .01) return;
  const head = points.at(-1)!;
  const expand = bloom * bloom * (3 - 2 * bloom);
  const first = points[0]!;
  const bloomPoint = (point: Point): Point => ({
    x: head.x + (point.x - head.x) * expand,
    y: head.y + (point.y - head.y) * expand,
  });
  const expanded = points.map(bloomPoint);
  const expandedHead = expanded.at(-1)!;
  const expandedFirst = expanded[0]!;
  const expandedSaleY = head.y + (saleY - head.y) * expand;
  const top = Math.min(...expanded.map(point => point.y));
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(snap(expandedFirst.x), snap(expandedFirst.y));
  for (let i = 1; i < expanded.length; i++) ctx.lineTo(snap(expanded[i]!.x), snap(expanded[i]!.y));
  ctx.lineTo(snap(expandedHead.x), snap(expandedSaleY));
  ctx.lineTo(snap(expandedFirst.x), snap(expandedSaleY));
  ctx.closePath();
  ctx.clip();
  ctx.globalAlpha *= .72 + .28 * bloom;
  ctx.fillStyle = '#511B18';
  ctx.fillRect(snap(Math.min(expandedFirst.x, expandedHead.x)), snap(top), snap(Math.abs(expandedHead.x - expandedFirst.x)), snap(expandedSaleY - top));
  for (let y = snap(top); y < expandedSaleY; y += 8) {
    for (let x = snap(Math.min(expandedFirst.x, expandedHead.x)); x < Math.max(expandedFirst.x, expandedHead.x); x += 8) {
      const value = hash((x / 8) * 4099 + y / 8, seed + 201);
      if (value > .43) {
        ctx.fillStyle = value > .86 ? '#D7473D' : value > .67 ? '#9E2B26' : '#68211D';
        ctx.fillRect(x, y, 8, 8);
      }
    }
  }
  ctx.restore();
}

function drawPriceTrack(ctx: Frame['ctx'], points: readonly Point[], headVisible = true) {
  if (!points.length) return;
  for (let i = 1; i < points.length; i++) drawPixelLine(ctx, points[i - 1]!, points[i]!, RED_DARK, 34, .9);
  for (let i = 1; i < points.length; i++) drawPixelLine(ctx, points[i - 1]!, points[i]!, RED_MID, 20, 1);
  for (let i = 1; i < points.length; i++) drawPixelLine(ctx, points[i - 1]!, points[i]!, RED_HOT, 8, 1);
  if (!headVisible) return;
  const head = points.at(-1)!;
  ctx.fillStyle = RED_DARK;
  ctx.fillRect(snap(head.x - 27), snap(head.y - 27), 54, 54);
  ctx.fillStyle = RED_HOT;
  ctx.fillRect(snap(head.x - 19), snap(head.y - 19), 38, 38);
  ctx.fillStyle = '#FFD8D4';
  ctx.fillRect(snap(head.x - 5), snap(head.y - 5), 10, 10);
}

function drawJumpAfterimages(ctx: Frame['ctx'], keys: readonly KeyPoint[], time: number, jumpAt: number) {
  const age = time - jumpAt;
  if (age < 0 || age > .34) return;
  const fade = 1 - clamp01(age / .34);
  const ghosts = [
    { offset: .12, size: 24, outer: RED_DARK, inner: RED_MID, alpha: .38 },
    { offset: .08, size: 20, outer: RED_DARK, inner: RED_HOT, alpha: .52 },
    { offset: .04, size: 16, outer: RED_MID, inner: RED_HOT, alpha: .68 },
  ];
  for (const ghost of ghosts) {
    const point = positionAt(keys, Math.max(jumpAt, time - ghost.offset));
    const size = snap(ghost.size);
    ctx.save();
    ctx.globalAlpha *= ghost.alpha * fade;
    ctx.fillStyle = ghost.outer;
    ctx.fillRect(snap(point.x - size / 2), snap(point.y - size / 2), size, size);
    ctx.fillStyle = ghost.inner;
    ctx.fillRect(snap(point.x - size / 2 + 4), snap(point.y - size / 2 + 4), size - 8, size - 8);
    ctx.fillStyle = '#FFD8D4';
    ctx.fillRect(snap(point.x - 2), snap(point.y - 2), 4, 4);
    ctx.restore();
  }
}

function drawPanHandoff(ctx: Frame['ctx'], chartHead: Point, time: number, startAt: number, dur: number) {
  if (time <= startAt) return;
  const p = easeOut((time - startAt) / Math.max(0.001, dur - startAt));
  // In shot 9's incoming camera, the perforation is transformed to this screen point.
  const pan = { x: 694, y: 650 };
  const head = { x: chartHead.x + (pan.x - chartHead.x) * p, y: chartHead.y + (pan.y - chartHead.y) * p };
  drawPixelLine(ctx, chartHead, head, RED_DARK, 22, .96);
  drawPixelLine(ctx, chartHead, head, RED_MID, 12, 1);
  drawPixelLine(ctx, chartHead, head, RED_HOT, 4, 1);
  ctx.fillStyle = RED_DARK; ctx.fillRect(snap(head.x - 12), snap(head.y - 12), 24, 24);
  ctx.fillStyle = RED_HOT; ctx.fillRect(snap(head.x - 8), snap(head.y - 8), 16, 16);
  ctx.fillStyle = '#FFD8D4'; ctx.fillRect(snap(head.x - 2), snap(head.y - 2), 4, 4);
}

function drawSaleLevel(ctx: Frame['ctx'], saleY: number, markerX: number, cameraRotation: number) {
  ctx.fillStyle = '#C0C3C8';
  for (let x = 112; x < 770; x += 34) ctx.fillRect(x, saleY, 20, 5);
  ctx.fillStyle = '#777B82';
  ctx.fillRect(108, saleY + 7, 666, 4);
  // A small marker is embedded in the foreground balcony beam.
  ctx.fillStyle = '#25272D';
  ctx.fillRect(markerX - 56, saleY - 26, 112, 36);
  ctx.fillStyle = '#C4C7CC';
  ctx.fillRect(markerX - 56, saleY - 26, 112, 5);
  // Keep the lettering horizontal while its center stays attached to the sale level.
  ctx.save();
  ctx.translate(markerX, saleY - 21);
  ctx.rotate(-cameraRotation);
  pixelText(ctx, 'SALE', 0, 0, 3, { color: '#E1E3E6', align: 'center' });
  ctx.restore();
  ctx.fillStyle = '#D0D3D8';
  ctx.fillRect(markerX - 20, saleY - 5, 28, 20);
  ctx.fillStyle = '#3D4148';
  ctx.fillRect(markerX - 16, saleY - 1, 20, 10);
}

function drawTether(ctx: Frame['ctx'], from: Point, to: Point, tension: number) {
  const sag = (1 - tension) * 40;
  const points = [from, { x: from.x + (to.x - from.x) * 0.34, y: from.y + (to.y - from.y) * 0.34 + sag },
    { x: from.x + (to.x - from.x) * 0.68, y: from.y + (to.y - from.y) * 0.68 + sag * 0.45 }, to];
  ctx.save();
  ctx.strokeStyle = '#101216';
  ctx.lineWidth = 12;
  ctx.beginPath(); ctx.moveTo(snap(points[0]!.x), snap(points[0]!.y));
  for (let i = 1; i < points.length; i++) ctx.lineTo(snap(points[i]!.x), snap(points[i]!.y));
  ctx.stroke();
  ctx.strokeStyle = '#D6D8DC';
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(snap(points[0]!.x), snap(points[0]!.y));
  for (let i = 1; i < points.length; i++) ctx.lineTo(snap(points[i]!.x), snap(points[i]!.y));
  ctx.stroke();
  ctx.restore();
}

function drawOpeningTicket(ctx: Frame['ctx'], t: number) {
  const alpha = 1 - easeOut(t / .2);
  if (alpha <= .01) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  drawTicket2D(ctx, 30 - t * 86, 700 - t * 22, 86, { rot: -.08 + t * .34, tear: 0.48 });
  ctx.restore();
}

export const priceRideShot: ShotDef = {
  name: 'priceride',
  describe: 'A camera rides the rising red price pixel past parallax balconies; a dithered loss band opens between Hedgy and his original sale level.',
  render(frame: Frame, props: ShotProps) {
    const { ctx, seed } = frame;
    const dur = Math.max(.1, frame.dur), t = clamp(frame.t, 0, dur);
    const jumpAt = eventAt(props, 'jump', dur, .225);
    const lossesAt = eventAt(props, 'losses', dur, .53);
    const keys = pathKeys(dur, jumpAt, lossesAt);
    const points = pathToTime(keys, t);
    const head = points.at(-1)!;
    const handoffAt = Math.max(lossesAt + 0.42, dur - 0.52);
    const saleY = 988, markerX = 600;
    const jumpTravel = easeOut((t - jumpAt) / .56);
    const lossesTravel = easeOut((t - lossesAt) / .56);
    const scroll = jumpTravel * 258 + lossesTravel * 208 + (t / dur) * 64;
    const scrollX = jumpTravel * 72 + lossesTravel * 92;
    const bandBloom = t < lossesAt ? 0 : clamp01((t - lossesAt) / .44);

    const rig = createCameraRig({
      width: 1080, height: 1290, seed: seed + 83, handheld: 1.5,
      hits: [jumpAt, lossesAt], punch: .012, shake: 4,
      keyframes: [
        { t: 0, x: 0, y: 0, zoom: 1, rot: 0 },
        { t: jumpAt, x: 4, y: -8, zoom: 1.018, rot: -.001, ease: 'inOut' },
        { t: jumpAt + .045, x: -12, y: 8, zoom: 1.045, rot: -.065, ease: 'out' },
        { t: jumpAt + .105, x: 4, y: -10, zoom: 1.027, rot: .014, ease: 'out' },
        { t: jumpAt + .22, x: 8, y: -17, zoom: 1.025, rot: .002, ease: 'inOut' },
        { t: lossesAt, x: 9, y: -18, zoom: 1.035, rot: .002, ease: 'inOut' },
        { t: Math.max(lossesAt + .3, dur - .34), x: 12, y: -12, zoom: 1.025, rot: 0, ease: 'out' },
        { t: dur, x: 0, y: 0, zoom: 1, rot: 0, ease: 'out' },
      ],
    });
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, 1080, 1290); ctx.clip();
    rig.apply(ctx, t);
    drawVenue(ctx, t, scroll, scrollX, seed);

    // The opening ticket is the final ticket leaving shot 7; its perforation becomes the line's lead.
    drawLossBand(ctx, points, saleY, bandBloom, seed);
    drawSaleLevel(ctx, saleY, markerX, rig.poseAt(t).rot);

    const shocked = t >= lossesAt;
    const tetherSnap = easeOut((t - jumpAt) / .12);
    const lossPull = easeOut((t - lossesAt) / .12);
    const hedgyX = 780 + 40 * lossPull, hedgyY = 1080 + 30 * lossPull;
    const tetherStart = { x: hedgyX - 56, y: hedgyY - 88 };
    const saleMarker = { x: markerX - 28, y: saleY - 4 };
    drawTether(ctx, tetherStart, saleMarker, tetherSnap);

    // The grey dashed trace stays attached to Hedgy while the camera chases the rising market.
    drawHedgy(ctx, {
      x: hedgyX, y: hedgyY, scale: 3.65,
      t: Math.max(0, t - (shocked ? lossesAt : jumpAt)),
      pose: shocked ? 'shock' : 'think',
      facing: -1, look: 'up',
      expression: shocked ? 'shocked' : 'worried',
      squash: shocked ? .9 : 1,
      prop: 'none',
    });

    drawPriceTrack(ctx, points, t <= handoffAt);
    drawPanHandoff(ctx, head, t, handoffAt, dur);
    drawOpeningTicket(ctx, t);
    if (t >= jumpAt && t < jumpAt + .38) {
      drawBurst(ctx, t, {
        x: head.x, y: head.y, start: jumpAt, life: .3, count: 8, kind: 'spark',
        seed: seed + 117, speed: 136, gravity: 22, drag: .9, size: 3, color: RED_HOT, cell: CELL,
      });
    }
    drawJumpAfterimages(ctx, keys, t, jumpAt);
    ctx.restore();
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const d = Math.max(.1, dur), jumpAt = eventAt(props, 'jump', d, .225), lossesAt = eventAt(props, 'losses', d, .53);
    const cues: Cue[] = [
      { t: Math.max(0, jumpAt - 0.1), kind: 'rise', pan: -0.12, gain: 0.72, len: 0.12 },
      { t: jumpAt, kind: 'servo', pan: -0.1, gain: 1.22, len: 0.22 },
      { t: lossesAt, kind: 'heartbeat', pan: 0.16, gain: 1.42, len: 0.3 },
      { t: lossesAt + 0.14, kind: 'heartbeat', pan: 0.16, gain: 0.72, len: 0.16 },
    ];
    return cues.filter(cue => cue.t >= 0 && cue.t <= d);
  },
};
