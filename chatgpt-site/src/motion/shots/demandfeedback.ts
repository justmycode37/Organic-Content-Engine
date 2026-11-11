import { clamp, ease, hash, type Cue, type Frame, type ShotProps } from '../core.ts';
import { drawHedgy } from '../actor/hedgy.ts';
import { drawEnv } from '../env/index.ts';
import { drawBurst, drawSpeedLines } from '../fx/particles.ts';
import { createCameraRig } from '../fx/rig.ts';
import { pixelText } from '../prim.ts';
import { drawTicket2D } from '../sets/ticket.ts';
import { box, instances, render3d } from '../three.ts';
import type { ShotDef } from './index.ts';

const W = 1080, H = 1290;
const RED = '#E43A34';
const INK = '#08090B';
const PALE = '#E1E3E5';
const STEEL = '#7A8288';
const DIM = '#31363B';
const CITY_BLOCK = box(1.55, 7.6, 1.1, 0, [1, 1, 2, 0, 2, 0]);
const CITY_MATERIALS = [{ ramp: 'steel' as const, tone: 0.82 }, { ramp: 'mono' as const, tone: 0.44 }, { ramp: 'chrome' as const, tone: 0.54 }];
const CITY_TRANSFORMS = [
  { pos: [-4.6, 2.9, 4.8] as [number, number, number], scale: [1.25, 1.16, 1.05] as [number, number, number] },
  { pos: [4.5, 3.9, 7.4] as [number, number, number], scale: [1.05, 1.55, 1.1] as [number, number, number] },
  { pos: [-2.8, 4.2, 10.4] as [number, number, number], scale: [0.76, 1.72, 1.0] as [number, number, number] },
  { pos: [2.8, 2.2, 11.5] as [number, number, number], scale: [0.92, 0.88, 1.1] as [number, number, number] },
];

const numParam = (props: ShotProps, key: string, fallback: number, lo: number, hi: number) => {
  const value = Number(props.params?.[key]);
  return Number.isFinite(value) ? clamp(value, lo, hi) : fallback;
};
const strParam = (props: ShotProps, key: string, fallback: string) => String(props.params?.[key] ?? fallback).toLowerCase();
const listParam = (props: ShotProps, key: string): unknown[] => Array.isArray(props.params?.[key]) ? props.params![key] as unknown[] : [];
function eventAt(props: ShotProps, kind: string, fallback: number, dur: number) {
  const found = props.events?.find(event => event.kind.toLowerCase() === kind.toLowerCase());
  return clamp(found?.at ?? fallback, 0, Math.max(0, dur));
}
function buyTimes(props: ShotProps, dur: number, start: number, count: number, repeatGain: number) {
  const custom = listParam(props, 'buyerWave');
  if (custom.length) {
    return Array.from({ length: count }, (_, i) => {
      const raw = Number(custom[i]);
      return clamp(Number.isFinite(raw) ? raw : start + (i * 0.12), 0, dur);
    });
  }
  const gap = Math.min(0.15, dur * 0.065);
  return Array.from({ length: count }, (_, i) => {
    let delay = 0;
    for (let j = 0; j < i; j++) delay += gap * Math.max(0.42, 1 - j * repeatGain * 0.48);
    return clamp(start + delay, 0, dur);
  });
}

function drawTowerWindows(ctx: Frame['ctx'], x: number, y: number, w: number, h: number, drift: number, seed: number, t: number) {
  const floorH = 18, colW = 17;
  for (let row = 0; row < Math.floor(h / 38); row++) {
    const yy = y + row * 38 + Math.round(drift * (0.08 + row * 0.015));
    ctx.fillStyle = row % 3 === 0 ? '#25292E' : '#1C2024';
    ctx.fillRect(Math.round(x), yy, Math.round(w), floorH);
    for (let col = 0; col < Math.floor(w / 32); col++) {
      const id = row * 37 + col * 11;
      if (hash(id, seed) > 0.57) {
        ctx.fillStyle = hash(id, Math.floor(t * 2.5) + seed) > 0.55 ? '#ADB2B6' : '#656C72';
        ctx.fillRect(Math.round(x + 11 + col * 32), yy + 5, colW, 8);
      }
    }
    ctx.fillStyle = '#0E1012';
    ctx.fillRect(Math.round(x), yy + floorH, Math.round(w), 4);
  }
}

function drawSkyline(ctx: Frame['ctx'], t: number, seed: number, travel: number) {
  // A brighter grey fog shelf and three independent skyline depths keep the run from becoming a black void.
  ctx.fillStyle = '#202429';
  ctx.fillRect(0, 356 + Math.round(travel * 0.07), W, 4);
  for (let i = 0; i < 10; i++) {
    const width = 76 + (i % 3) * 24, x = ((i * 151 - Math.round(travel * (0.12 + i % 2 * 0.05))) % (W + 120) + W + 120) % (W + 120) - 60;
    const height = 170 + hash(i, seed + 32) * 250, base = 660 + Math.round(travel * 0.13);
    ctx.fillStyle = i % 2 ? '#292E33' : '#20252A';
    ctx.fillRect(Math.round(x), Math.round(base - height), width, height + 400);
    ctx.fillStyle = '#515960';
    ctx.fillRect(Math.round(x), Math.round(base - height), width, 8);
    drawTowerWindows(ctx, x + 8, base - height + 18, width - 16, height - 20, travel, seed + i * 9, t);
  }
  ctx.fillStyle = '#171B1F';
  ctx.fillRect(0, 930, W, 360);
}

function drawBooth(ctx: Frame['ctx'], x: number, y: number, w: number, h: number, index: number, t: number, scareAt: number, reactionDelay: number, buyAt: number, coverAt: number, coverEnd: number, active: boolean) {
  const reaction = clamp((t - scareAt - reactionDelay) / 0.18);
  const buy = clamp((t - buyAt) / 0.34);
  const innerX = x + 20, innerY = y + 18, innerW = w - 40, innerH = h - 40;
  // Double booth casing: bevels, boltheads and a shaded window make each stop feel bolted into the venue.
  ctx.fillStyle = '#08090B'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = index % 2 ? '#858D93' : '#B3B8BC'; ctx.fillRect(x + 4, y + 4, w - 8, 7); ctx.fillRect(x + 4, y + 4, 7, h - 8);
  ctx.fillStyle = '#33393E'; ctx.fillRect(x + w - 11, y + 8, 7, h - 12); ctx.fillRect(x + 8, y + h - 11, w - 16, 7);
  ctx.fillStyle = '#171B1F'; ctx.fillRect(innerX, innerY, innerW, innerH);
  ctx.fillStyle = '#434A50'; ctx.fillRect(innerX + 4, innerY + 4, innerW - 8, 5);
  ctx.fillStyle = '#101316'; ctx.fillRect(innerX + 12, innerY + 12, innerW - 24, innerH - 24);
  // Reflected slats in the glass, shifted with the camera.
  for (let slat = 0; slat < 5; slat++) {
    const sx = innerX + 18 + ((slat * 59 + Math.round(t * 64 + index * 23)) % Math.max(1, innerW - 42));
    ctx.fillStyle = slat % 2 ? '#293036' : '#343C42';
    ctx.fillRect(sx, innerY + 17, 3, innerH - 36);
  }
  const hatchX = x + w - 84, hatchY = y + h - 58;
  ctx.fillStyle = '#060708'; ctx.fillRect(hatchX, hatchY, 66, 38);
  ctx.fillStyle = '#8C949A'; ctx.fillRect(hatchX, hatchY, 66, 5);
  ctx.fillStyle = '#3B4248'; ctx.fillRect(hatchX + 8, hatchY + 10, 50, 4);
  ctx.fillStyle = active && buy > 0.12 ? RED : '#D0D4D7'; ctx.fillRect(hatchX + 8, hatchY + 27, 50, 4);
  for (let bolt = 0; bolt < 4; bolt++) {
    ctx.fillStyle = '#E0E2E4';
    ctx.fillRect(x + 12 + (bolt % 2) * (w - 24), y + 13 + Math.floor(bolt / 2) * (h - 26), 7, 7);
    ctx.fillStyle = '#272C31'; ctx.fillRect(x + 14 + (bolt % 2) * (w - 24), y + 15 + Math.floor(bolt / 2) * (h - 26), 3, 3);
  }
  // Seller is an original voxel/pixel extra, with little glasses/hair variations and expressive recoil.
  const sellerX = x + Math.round(w * (0.36 + buy * 0.32));
  const sellerY = y + Math.round(h * 0.72) - Math.round(reaction * 15) - Math.round(Math.sin(t * (buy > 0 ? 18 : 7) + index) * (buy > 0 ? 4 : 2));
  const scale = index > 4 ? 2.0 : 2.55;
  drawSeller(ctx, sellerX, sellerY, scale, t, index, reaction, buy);
  if (buy > 0.72 && buy < 1.35) {
    drawTicket2D(ctx, hatchX + 28, hatchY + 17, 58, { rot: -0.12 + Math.sin(t * 13 + index) * 0.08 });
  }
  // A single live BUY label stays attached to the active slot, never floats in the scene.
  if (active && t >= coverAt && t <= coverEnd) pixelText(ctx, 'BUY', hatchX + 32, hatchY - 22, 2, { color: PALE, align: 'center', reveal: clamp((t - coverAt) / 0.12), mode: 'type' });
  ctx.fillStyle = '#14171A'; ctx.fillRect(x + 13, y + h - 20, w - 26, 4);
}

function drawSeller(ctx: Frame['ctx'], x: number, feetY: number, scale: number, t: number, index: number, reaction: number, buying: number) {
  ctx.save(); ctx.translate(Math.round(x), Math.round(feetY)); ctx.scale(scale, scale);
  const lean = Math.round(reaction * 4) - Math.round(buying * 10), bob = Math.round(Math.sin(t * 11 + index) * 1.4);
  const ink = '#090A0C', coat = index % 2 ? '#777E84' : '#A0A6AB', lit = '#E0E2E4', shade = '#41474D';
  // feet and coat
  ctx.fillStyle = ink; ctx.fillRect(-12 + lean, -3 + bob, 10, 4); ctx.fillRect(4 + lean, -3 - bob, 10, 4);
  ctx.fillStyle = shade; ctx.fillRect(-10 + lean, -27 + bob, 24, 27);
  ctx.fillStyle = coat; ctx.fillRect(-8 + lean, -26 + bob, 19, 22);
  ctx.fillStyle = lit; ctx.fillRect(-3 + lean, -25 + bob, 4, 14);
  ctx.fillStyle = ink; ctx.fillRect(-18 + lean - Math.round(reaction * 8), -24 + bob, 8, 20); ctx.fillRect(13 + lean + Math.round(reaction * 7), -24 + bob, 8, 20);
  ctx.fillStyle = coat; ctx.fillRect(-17 + lean - Math.round(reaction * 8), -23 + bob, 5, 16); ctx.fillRect(14 + lean + Math.round(reaction * 7), -23 + bob, 5, 16);
  // hair, ears and face
  ctx.fillStyle = ink; ctx.fillRect(-11 + lean, -47 + bob, 25, 23);
  ctx.fillStyle = lit; ctx.fillRect(-9 + lean, -44 + bob, 21, 18);
  ctx.fillStyle = shade; ctx.fillRect(-9 + lean, -45 + bob, 21, 4);
  if (index % 3 === 0) { ctx.fillStyle = ink; ctx.fillRect(-12 + lean, -48 + bob, 26, 6); }
  else if (index % 3 === 1) { ctx.fillStyle = coat; ctx.fillRect(-8 + lean, -51 + bob, 19, 5); }
  ctx.fillStyle = ink; ctx.fillRect(-5 + lean, -39 + bob, 4, 4); ctx.fillRect(5 + lean, -39 + bob, 4, 4);
  ctx.fillStyle = reaction > 0.2 ? '#FFFFFF' : '#1B1E21';
  if (reaction > 0.2) { ctx.fillRect(-5 + lean, -40 + bob, 4, 7); ctx.fillRect(5 + lean, -40 + bob, 4, 7); }
  else { ctx.fillRect(-5 + lean, -39 + bob, 4, 4); ctx.fillRect(5 + lean, -39 + bob, 4, 4); }
  ctx.fillStyle = ink; ctx.fillRect(0 + lean, -32 + bob, 4, reaction > 0.55 ? 5 : 2);
  if (index % 2 === 0) { ctx.fillStyle = '#2B3035'; ctx.fillRect(-8 + lean, -41 + bob, 20, 2); ctx.fillRect(-2 + lean, -41 + bob, 2, 8); }
  ctx.restore();
}

type Point = { x: number; y: number };
function drawTrack(ctx: Frame['ctx'], points: Point[], progress: number, color = RED) {
  if (points.length < 2 || progress <= 0) return;
  const full = points.length - 1, exact = clamp(progress) * full, last = Math.floor(exact), partial = exact - last;
  const draw = (width: number, style: string) => {
    ctx.beginPath(); ctx.moveTo(points[0]!.x, points[0]!.y);
    for (let i = 1; i <= Math.min(last, full); i++) ctx.lineTo(points[i]!.x, points[i]!.y);
    if (last < full && partial > 0) {
      const a = points[last]!, b = points[last + 1]!;
      ctx.lineTo(Math.round(a.x + (b.x - a.x) * partial), Math.round(a.y + (b.y - a.y) * partial));
    }
    ctx.strokeStyle = style; ctx.lineWidth = width; ctx.lineJoin = 'bevel'; ctx.lineCap = 'square'; ctx.stroke();
  };
  draw(34, '#252A2F'); draw(24, '#08090B'); draw(11, color);
  const at = points[Math.min(last, full)]!;
  ctx.fillStyle = '#F5B0AA'; ctx.fillRect(Math.round(at.x / 6) * 6 - 6, Math.round(at.y / 6) * 6 - 6, 12, 12);
}

function resolvedPath(props: ShotProps, fallback: Point[]): Point[] {
  const custom = listParam(props, 'pricePath');
  if (!custom.length) return fallback;
  const points = custom.slice(0, 20).map(point => {
    if (Array.isArray(point)) return { x: clamp(Number(point[0]), -80, 1160), y: clamp(Number(point[1]), 0, 1260) };
    if (point && typeof point === 'object') {
      const p = point as Record<string, unknown>;
      return { x: clamp(Number(p.x), -80, 1160), y: clamp(Number(p.y), 0, 1260) };
    }
    return null;
  }).filter((point): point is Point => point !== null && Number.isFinite(point.x) && Number.isFinite(point.y));
  return points.length >= 2 ? points : fallback;
}

export const demandFeedbackShot: ShotDef = {
  name: 'demandfeedback',
  describe: 'Camera races up a red price track through layered short-seller booths; params: buyerWave (buyback times), pricePath (screen points), cascadeCount, sellerReactions, repeatGain, loopDirection.',
  render(frame: Frame, props: ShotProps) {
    const { ctx, theme, seed } = frame;
    const dur = Math.max(0.25, frame.dur);
    const t = clamp(frame.t, 0, dur);
    const scareAt = eventAt(props, 'scare', dur * 0.39, dur);
    const coverAt = eventAt(props, 'covering', dur * 0.65, dur);
    const repeatGain = numParam(props, 'repeatGain', 0.22, 0.08, 0.38);
    const count = Math.floor(numParam(props, 'cascadeCount', 5, 3, 7));
    const covers = buyTimes(props, dur, coverAt, count, repeatGain);
    const coverEnd = Math.min(dur, (covers.at(-1) ?? coverAt) + 0.3);
    const direction = strParam(props, 'loopDirection', 'up');
    const travelSign = direction === 'down' || direction === 'left' || direction === 'reverse' ? -1 : 1;
    const reactions = listParam(props, 'sellerReactions');
    const reactionDelay = (i: number) => {
      const raw = reactions[i];
      const value = raw && typeof raw === 'object' ? Number((raw as Record<string, unknown>).delay ?? (raw as Record<string, unknown>).at) : Number(raw);
      return Number.isFinite(value) ? clamp(value, 0, 0.48) : i * 0.035;
    };
    const travel = travelSign * (360 * clamp(t / dur) + 30 * Math.sin(t * 2.2));
    const scareHit = Math.max(0, scareAt);
    const rig = createCameraRig({
      width: W, height: H, seed: seed + 121, handheld: 2.2,
      keyframes: [
        { t: 0, x: -12, y: 18, zoom: 1.02, rot: -0.006 },
        { t: dur * 0.32, x: -32, y: -18, zoom: 1.06, rot: 0.004 },
        { t: dur * 0.68, x: 18, y: -32, zoom: 1.09, rot: -0.008 },
        { t: dur, x: 36, y: -52, zoom: 1.12, rot: 0.006 },
      ],
      hits: [scareAt, ...covers], punch: 0.014, shake: 17,
      whip: [{ at: scareHit, direction: direction === 'left' || direction === 'right' ? direction : 'up', duration: 0.24, amount: 0.12 }],
    });

    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip(); ctx.imageSmoothingEnabled = false;
    drawEnv(ctx, { type: 'city', t, camera: { x: -travel * 0.18, y: travel * 0.13, zoom: 1.05, yaw: Math.sin(t * 0.7) * 0.04, pitch: 0.025 }, theme: { ...theme, bg: '#121417' }, seed: seed + 31, width: W, height: H });
    drawSkyline(ctx, t, seed + 43, travel);
    const z = 12 - clamp(t / dur) * 1.45, cityView = { x: 0, y: 0, w: W, h: H, zoom: 210, fov: 52, position: [Math.sin(t * 0.48) * 1.6, 2.5 + clamp(t / dur) * 0.65, -z] as [number, number, number], target: [0, 2.6, 4] as [number, number, number], light: [-0.45, 0.76, -0.42] as [number, number, number], ambient: 0.46, rim: 0.38, cell: 6, outline: true, fog: { near: 12, far: 24 } };
    render3d(ctx, theme, cityView, [instances(CITY_BLOCK, CITY_TRANSFORMS, { materials: CITY_MATERIALS })]);

    ctx.save(); rig.apply(ctx, t);
    drawSpeedLines(ctx, t, { x: 0, y: 0, width: W, height: H, count: 42, start: 0, duration: dur * 1.1, mode: 'linear', direction: 1, color: '#9AA1A7', seed: seed + 67, strength: 0.38, cell: 6 });
    const defaultPath = [
      { x: 455, y: 1210 }, { x: 486, y: 1068 }, { x: 580, y: 1015 }, { x: 522, y: 886 },
      { x: 625, y: 826 }, { x: 570, y: 704 }, { x: 674, y: 645 }, { x: 627, y: 508 },
      { x: 736, y: 446 }, { x: 700, y: 308 }, { x: 812, y: 238 }, { x: 866, y: 88 },
    ];
    const path = resolvedPath(props, defaultPath);
    drawTrack(ctx, path, 0.4 + 0.6 * clamp(t / dur));
    // Booth stacks slide past camera on alternating sides; their changing depth and size sell the vertical ride.
    const shift = clamp(t / dur) * 350;
    const booths = Array.from({ length: 7 }, (_, i) => {
      const y = 86 + i * 218 - shift;
      if (y < -205 || y > 1300) return null;
      const side = i % 2 === 0 ? 0 : 1, w = 376 - (i > 4 ? 30 : 0), h = 184 - (i > 4 ? 16 : 0);
      const x = side ? 664 - (i > 4 ? 0 : 0) : 34;
      return { i, x, y: Math.round(y / 4) * 4, w, h };
    }).filter((booth): booth is { i: number; x: number; y: number; w: number; h: number } => booth !== null);
    booths.forEach(({ i, x, y, w, h }) => {
      const nextBuyer = covers.findIndex(at => at > t);
      const activeIndex = nextBuyer < 0 ? covers.length - 1 : Math.max(0, nextBuyer - 1);
      drawBooth(ctx, x, y, w, h, i, t, scareAt, reactionDelay(i), covers[i] ?? coverAt, coverAt, coverEnd, activeIndex === i || (t < coverAt && i === 1));
    });
    // Purchases kick the price rail in a visible ratchet and send the same paper ticket past lens.
    covers.forEach((at, i) => {
      const p = clamp((t - at) / 0.22), near = path[Math.min(path.length - 1, Math.max(0, Math.floor((i + 5) / (count + 4) * (path.length - 1))))]!;
      const bumpY = near.y - i * 22 - ease.outBack(p) * 25;
      if (p > 0 && p < 1) {
        ctx.fillStyle = RED; ctx.fillRect(Math.round(near.x / 6) * 6 - 12, Math.round(bumpY / 6) * 6 - 6, 30, 12);
        ctx.fillStyle = '#F7AAA4'; ctx.fillRect(Math.round(near.x / 6) * 6 + 12, Math.round(bumpY / 6) * 6 - 6, 6, 12);
      }
      drawBurst(ctx, t, { x: near.x, y: near.y, seed: seed + 300 + i * 7, count: 14, kind: 'shard', start: at, life: 0.9, speed: 210, gravity: 260, drag: 0.36, floor: 1218, bounce: 0.18, size: 1, color: '#D8D6D1', cell: 4 });
      if (t >= at && t < at + 0.7) drawTicket2D(ctx, near.x + Math.sin((t - at) * 8) * 24, near.y - 35 - (t - at) * 84, 72, { rot: -0.3 + (t - at) * 0.75 });
    });
    // Catwalk rails cross close to lens while Hedgy runs and keeps checking the cascade behind him.
    ctx.fillStyle = '#090A0C'; ctx.fillRect(0, 1052, W, 238);
    ctx.fillStyle = '#A0A6AB'; ctx.fillRect(0, 1052, W, 10); ctx.fillRect(0, 1078, W, 5);
    ctx.fillStyle = '#41484E'; ctx.fillRect(0, 1184, W, 12); ctx.fillRect(0, 1240, W, 8);
    for (let bolt = 0; bolt < 12; bolt++) { ctx.fillStyle = bolt % 2 ? '#E4E6E7' : '#555D63'; ctx.fillRect((bolt * 102 + Math.floor(t * 180)) % W, 1062, 8, 8); }
    ctx.fillStyle = '#242A2F'; ctx.fillRect(0, 1090, W, 4); ctx.fillRect(0, 1210, W, 5);
    const hedgyX = 260 + 520 * ease.outCubic(clamp(t / dur)) + 22 * Math.sin(t * 5.8);
    drawHedgy(ctx, { x: hedgyX, y: 1180, scale: 5.4, t: Math.max(0, t), pose: 'run', facing: 1, look: t < scareAt ? 'forward' : 'camera', expression: t < scareAt ? 'determined' : 'shocked' });
    for (let i = 0; i < 5; i++) {
      const px = (i * 263 + Math.floor(t * (270 + i * 23))) % 1160 - 40;
      drawTicket2D(ctx, px, 1140 - i * 18, 88 + (i % 2) * 20, { rot: -0.13 + Math.sin(t * 4 + i) * 0.06 });
    }
    ctx.restore(); ctx.restore();
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const scareAt = eventAt(props, 'scare', dur * 0.39, dur), coverAt = eventAt(props, 'covering', dur * 0.65, dur);
    const repeatGain = numParam(props, 'repeatGain', 0.22, 0.08, 0.38);
    const count = Math.floor(numParam(props, 'cascadeCount', 5, 3, 7)), wave = buyTimes(props, dur, coverAt, count, repeatGain);
    const coverEnd = wave.at(-1) ?? coverAt;
    const cues: Cue[] = [
      { t: 0, kind: 'whoosh', gain: 0.62, pan: -0.2 },
      { t: scareAt, kind: 'alarm', gain: 0.7, pan: 0.12 },
      { t: scareAt + 0.04, kind: 'pop', gain: 0.42, pan: -0.25 },
      ...wave.map((t, i) => ({ t, kind: 'clack' as const, pan: -0.55 + i * (1.1 / Math.max(1, count - 1)), gain: 0.62 + i * repeatGain, step: i / Math.max(1, count - 1) })),
      { t: coverEnd, kind: 'build', gain: 0.58, len: Math.max(0.12, dur - coverEnd) },
    ];
    return cues.filter(cue => cue.t >= 0 && cue.t < dur);
  },
};
