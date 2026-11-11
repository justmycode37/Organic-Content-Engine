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
  const jumpDrift = Math.min(dur, jumpAt + Math.min(.18, Math.max(.08, (lossesAt - jumpAt) * .3)));
  const lossDrift = Math.min(dur, lossesAt + Math.min(.18, Math.max(.08, (dur - lossesAt) * .22)));
  return [
    { t: 0, point: { x: 1040, y: 1018 } },
    { t: Math.max(.02, jumpAt - .08), point: { x: 954, y: 1004 } },
    { t: jumpAt, point: { x: 846, y: 830 } },
    { t: jumpDrift, point: { x: 812, y: 795 } },
    { t: Math.max(jumpDrift + .01, lossesAt - .08), point: { x: 730, y: 780 } },
    { t: lossesAt, point: { x: 668, y: 620 } },
    { t: lossDrift, point: { x: 684, y: 592 } },
    { t: dur, point: { x: 710, y: 630 } },
  ];
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

function drawBalconyTier(ctx: Frame['ctx'], y: number, layer: number, index: number, seed: number, t: number) {
  if (y < -210 || y > 1370) return;
  const inset = layer === 0 ? 150 : layer === 1 ? 70 : 0;
  const x = inset + Math.round(Math.sin(index * .8 + layer) * (layer === 0 ? 18 : 8));
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

function drawVenue(ctx: Frame['ctx'], time: number, scroll: number, seed: number) {
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
    drawBalconyTier(ctx, snap(i * 238 + farShift), 0, i, seed, time);
    drawBalconyTier(ctx, snap(-105 + i * 270 + middleShift), 1, i, seed, time);
    drawBalconyTier(ctx, snap(-265 + i * 355 + nearShift), 2, i, seed, time);
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

function drawLossBand(ctx: Frame['ctx'], points: readonly Point[], saleY: number, amount: number, seed: number) {
  if (points.length < 2 || amount <= .01) return;
  const first = points[0]!, head = points.at(-1)!;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(snap(first.x), snap(first.y));
  for (let i = 1; i < points.length; i++) ctx.lineTo(snap(points[i]!.x), snap(points[i]!.y));
  ctx.lineTo(snap(head.x), snap(saleY));
  ctx.lineTo(snap(first.x), snap(saleY));
  ctx.closePath();
  ctx.clip();
  ctx.globalAlpha *= amount;
  ctx.fillStyle = '#511B18';
  ctx.fillRect(snap(head.x), snap(Math.min(...points.map(point => point.y))), snap(first.x - head.x), snap(saleY - Math.min(...points.map(point => point.y))));
  for (let y = snap(Math.min(...points.map(point => point.y))); y < saleY; y += 8) {
    for (let x = snap(head.x); x < first.x; x += 8) {
      const value = hash((x / 8) * 4099 + y / 8, seed + 201);
      if (value > .43) {
        ctx.fillStyle = value > .86 ? '#D7473D' : value > .67 ? '#9E2B26' : '#68211D';
        ctx.fillRect(x, y, 8, 8);
      }
    }
  }
  ctx.restore();
}

function drawPriceTrack(ctx: Frame['ctx'], points: readonly Point[]) {
  if (!points.length) return;
  for (let i = 1; i < points.length; i++) drawPixelLine(ctx, points[i - 1]!, points[i]!, RED_DARK, 34, .9);
  for (let i = 1; i < points.length; i++) drawPixelLine(ctx, points[i - 1]!, points[i]!, RED_MID, 20, 1);
  for (let i = 1; i < points.length; i++) drawPixelLine(ctx, points[i - 1]!, points[i]!, RED_HOT, 8, 1);
  const head = points.at(-1)!;
  ctx.fillStyle = RED_DARK;
  ctx.fillRect(snap(head.x - 27), snap(head.y - 27), 54, 54);
  ctx.fillStyle = RED_HOT;
  ctx.fillRect(snap(head.x - 19), snap(head.y - 19), 38, 38);
  ctx.fillStyle = '#FFD8D4';
  ctx.fillRect(snap(head.x - 5), snap(head.y - 5), 10, 10);
}

function drawSaleLevel(ctx: Frame['ctx'], saleY: number) {
  ctx.fillStyle = '#C0C3C8';
  for (let x = 480; x < 1072; x += 34) ctx.fillRect(x, saleY, 20, 5);
  ctx.fillStyle = '#777B82';
  ctx.fillRect(478, saleY + 7, 594, 4);
  // A small marker is embedded in the foreground balcony beam.
  ctx.fillStyle = '#25272D';
  ctx.fillRect(780, saleY - 26, 112, 36);
  ctx.fillStyle = '#C4C7CC';
  ctx.fillRect(780, saleY - 26, 112, 5);
  pixelText(ctx, 'SALE', 836, saleY - 21, 3, { color: '#E1E3E6', align: 'center' });
  ctx.fillStyle = '#D0D3D8';
  ctx.fillRect(816, saleY - 5, 28, 20);
  ctx.fillStyle = '#3D4148';
  ctx.fillRect(820, saleY - 1, 20, 10);
}

function drawTether(ctx: Frame['ctx'], from: Point, to: Point) {
  ctx.save();
  ctx.strokeStyle = '#101216';
  ctx.lineWidth = 9;
  ctx.beginPath(); ctx.moveTo(snap(from.x), snap(from.y)); ctx.lineTo(snap(to.x), snap(to.y)); ctx.stroke();
  ctx.strokeStyle = '#D6D8DC';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(snap(from.x), snap(from.y)); ctx.lineTo(snap(to.x), snap(to.y)); ctx.stroke();
  ctx.restore();
}

function drawOpeningTicket(ctx: Frame['ctx'], t: number) {
  const alpha = 1 - easeOut(t / .2);
  if (alpha <= .01) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  drawTicket2D(ctx, 1032 - t * 68, 970 - t * 74, 86, { rot: .13 - t * .38 });
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
    const saleY = 1024;
    const jumpTravel = easeOut((t - jumpAt) / .58);
    const lossesTravel = easeOut((t - lossesAt) / .62);
    const scroll = 42 + jumpTravel * 194 + lossesTravel * 206 + (t / dur) * 86;
    const bandAmount = t < lossesAt ? 0 : .38 + .62 * easeOut((t - lossesAt) / .2);

    const rig = createCameraRig({
      width: 1080, height: 1290, seed: seed + 83, handheld: 1.5,
      hits: [jumpAt, lossesAt], punch: .016, shake: 6,
      keyframes: [
        { t: 0, x: 4, y: 4, zoom: 1.01, rot: 0 },
        { t: jumpAt, x: -4, y: -10, zoom: 1.025, rot: -.002, ease: 'inOut' },
        { t: lossesAt, x: -18, y: -24, zoom: 1.045, rot: .002, ease: 'inOut' },
        { t: dur, x: -32, y: -38, zoom: 1.07, rot: -.003, ease: 'out' },
      ],
    });
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, 1080, 1290); ctx.clip();
    ctx.save();
    rig.apply(ctx, t);
    drawVenue(ctx, t, scroll, seed);
    ctx.restore();

    // The opening ticket is the final ticket leaving shot 7; its perforation becomes the line's lead.
    drawLossBand(ctx, points, saleY, bandAmount, seed);
    drawSaleLevel(ctx, saleY);

    const shocked = t >= lossesAt;
    const hedgyX = 842, hedgyY = 1194;
    const tetherStart = { x: hedgyX - 49, y: hedgyY - 164 };
    const saleMarker = { x: 840, y: saleY + 3 };
    drawTether(ctx, tetherStart, saleMarker);

    // The grey dashed trace stays attached to Hedgy while the camera chases the rising market.
    drawHedgy(ctx, {
      x: hedgyX, y: hedgyY, scale: 3.65,
      t: Math.max(0, t - (shocked ? lossesAt : jumpAt)),
      pose: shocked ? 'shock' : t >= jumpAt ? 'fall' : 'think',
      facing: -1, look: 'up',
      expression: shocked ? 'shocked' : 'worried',
      squash: shocked ? .9 : 1,
      prop: 'none',
    });

    drawPriceTrack(ctx, points);
    drawOpeningTicket(ctx, t);
    if (t >= jumpAt && t < jumpAt + .38) {
      drawBurst(ctx, t, {
        x: head.x, y: head.y, start: jumpAt, life: .38, count: 12, kind: 'spark',
        seed: seed + 117, speed: 168, gravity: 22, drag: .9, size: 4, color: RED_HOT, cell: CELL,
      });
    }
    ctx.restore();
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const d = Math.max(.1, dur), lossesAt = eventAt(props, 'losses', d, .53);
    return [{ t: lossesAt, kind: 'heartbeat', pan: .16, gain: .84, len: .34 }];
  },
};
