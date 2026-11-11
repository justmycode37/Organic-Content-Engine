import { clamp, ease, hash, type Cue, type Frame, type ShotProps } from '../core.ts';
import { drawHedgy } from '../actor/hedgy.ts';
import { drawEnv } from '../env/index.ts';
import { drawBurst, drawImpactStar, drawShockwave, drawSpeedLines } from '../fx/particles.ts';
import { createCameraRig } from '../fx/rig.ts';
import { applyImpactFrame } from '../fx/post.ts';
import { pixelText } from '../prim.ts';
import { drawTicket2D } from '../sets/ticket.ts';
import { box, merge, place, render3d } from '../three.ts';
import type { ShotDef } from './index.ts';

const W = 1080, H = 1290;
const RED = '#E43A34';
const IVORY = '#E8E5DE';
const STEEL = '#737B82';
const INK = '#090A0C';
const TAU = Math.PI * 2;
type Point = { x: number; y: number; z: number; u: number; angle: number };

function makeTower() {
  const parts = [
    place(box(3.65, 9.7, 1.7, 0, [1, 1, 2, 1, 2, 0]), { pos: [0, 4.5, 0] }),
    place(box(3.92, 0.22, 1.92, 1), { pos: [0, 8.9, 0] }),
    place(box(4.22, 0.28, 2.12, 2), { pos: [0, 9.53, 0] }),
    place(box(0.2, 9.9, 1.96, 1), { pos: [-1.84, 4.5, -0.02] }),
    place(box(0.2, 9.9, 1.96, 1), { pos: [1.84, 4.5, -0.02] }),
    place(box(0.12, 9.5, 0.16, 2), { pos: [-0.62, 4.5, -0.91] }),
    place(box(0.12, 9.5, 0.16, 2), { pos: [0.62, 4.5, -0.91] }),
  ];
  for (let floor = 0; floor < 9; floor++) {
    const y = 0.15 + floor * 1.04;
    parts.push(place(box(3.58, 0.12, 1.78, floor % 2 ? 1 : 2), { pos: [0, y, -0.02] }));
    for (let col = 0; col < 4; col++) {
      const lit = hash(floor * 11 + col, 65) > 0.28;
      if (!lit) continue;
      parts.push(place(box(0.36, 0.5, 0.055, 2), { pos: [-1.25 + col * 0.82, y + 0.38, -0.89] }));
    }
  }
  return merge(...parts);
}
const TOWER = makeTower();
const TOWER_MATERIALS = [
  { ramp: 'steel' as const, tone: 0.64 },
  { ramp: 'mono' as const, tone: 0.82 },
  { ramp: 'chrome' as const, tone: 0.66, spec: 0.28 },
];
const BLOCK = box(1.7, 6.4, 1.0, 0, [1, 1, 2, 0, 2, 0]);
const BLOCKS = [
  { pos: [-5.2, 2.4, 4.4] as [number, number, number], scale: [1.2, 1.2, 1.1] as [number, number, number] },
  { pos: [5.2, 2.1, 6.8] as [number, number, number], scale: [1.15, 1.0, 1.1] as [number, number, number] },
  { pos: [-3.6, 3.5, 9.8] as [number, number, number], scale: [0.82, 1.55, 1.0] as [number, number, number] },
  { pos: [3.9, 3.0, 11.4] as [number, number, number], scale: [0.92, 1.35, 1.0] as [number, number, number] },
];
const BLOCK_MATERIALS = [{ ramp: 'mono' as const, tone: 0.65 }, { ramp: 'steel' as const, tone: 0.76 }, { ramp: 'chrome' as const, tone: 0.5 }];

const numParam = (props: ShotProps, key: string, fallback: number, lo: number, hi: number) => {
  const value = Number(props.params?.[key]);
  return Number.isFinite(value) ? clamp(value, lo, hi) : fallback;
};
const listParam = (props: ShotProps, key: string): unknown[] => Array.isArray(props.params?.[key]) ? props.params![key] as unknown[] : [];
const strParam = (props: ShotProps, key: string, fallback: string) => String(props.params?.[key] ?? fallback);
function eventAt(props: ShotProps, kind: string, fallback: number, dur: number) {
  const event = props.events?.find(item => item.kind.toLowerCase() === kind.toLowerCase());
  return clamp(event?.at ?? fallback, 0, Math.max(0, dur));
}
function buyTimes(props: ShotProps, dur: number, loopAt: number, squeezeAt: number, count: number) {
  const span = Math.max(0, squeezeAt - loopAt - 0.12);
  return Array.from({ length: count }, (_, i) => clamp(loopAt + 0.1 + span * ((i + 1) / (count + 1)), 0, Math.max(0, dur)));
}

function helixPoint(u: number, turns: number, time: number, boost: number, radius = 308): Point {
  const angle = u * turns * TAU + Math.sin(time * 0.42) * 0.08;
  const z = Math.cos(angle);
  return {
    x: Math.round((540 + Math.sin(angle) * radius) / 4) * 4,
    y: Math.round((1004 - u * 682 - Math.cos(angle) * 70 - boost) / 4) * 4,
    z,
    u,
    angle,
  };
}

function drawHelix(ctx: Frame['ctx'], points: Point[], progress: number, front: boolean, width: number, color: string) {
  if (points.length < 2 || progress <= 0) return;
  const maxIndex = Math.floor(clamp(progress) * (points.length - 1));
  ctx.beginPath(); let drawing = false;
  for (let i = 0; i <= maxIndex; i++) {
    const p = points[i]!;
    const visible = front ? p.z < 0.02 : p.z >= 0.02;
    if (!visible) { drawing = false; continue; }
    if (!drawing) { ctx.moveTo(p.x, p.y); drawing = true; }
    else ctx.lineTo(p.x, p.y);
  }
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'square'; ctx.lineJoin = 'bevel'; ctx.stroke();
}

function drawKiosk(ctx: Frame['ctx'], x: number, y: number, scale: number, t: number, active: number) {
  const w = Math.round(112 * scale / 4) * 4, h = Math.round(94 * scale / 4) * 4, left = Math.round((x - w / 2) / 4) * 4, top = Math.round((y - h / 2) / 4) * 4;
  ctx.fillStyle = INK; ctx.fillRect(left, top, w, h);
  ctx.fillStyle = '#D0D4D7'; ctx.fillRect(left + 4, top + 4, w - 8, 6); ctx.fillRect(left + 4, top + 4, 6, h - 8);
  ctx.fillStyle = '#343A40'; ctx.fillRect(left + w - 10, top + 8, 6, h - 12); ctx.fillRect(left + 8, top + h - 10, w - 16, 6);
  ctx.fillStyle = '#20252A'; ctx.fillRect(left + 14, top + 16, w - 28, h - 34);
  ctx.fillStyle = '#9BA2A8'; ctx.fillRect(left + 20, top + 22, w - 40, 5);
  ctx.fillStyle = active > 0.05 ? RED : '#B8BDC1'; ctx.fillRect(left + w - 44, top + h - 30, 28, 8);
  ctx.fillStyle = '#070809'; ctx.fillRect(left + 18, top + h - 34, w - 58, 16);
  ctx.fillStyle = '#C4C8CA'; ctx.fillRect(left + 24, top + h - 30, w - 70, 4);
  if (active > 0.18 && active < 0.92) drawTicket2D(ctx, x, y + h * 0.43 + Math.sin(t * 14) * 4, Math.max(34, 48 * scale), { rot: 0.08 });
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = '#ECEDEF'; ctx.fillRect(left + 12 + (i % 2) * (w - 24), top + 14 + Math.floor(i / 2) * (h - 28), 5, 5);
  }
}

function drawPress(ctx: Frame['ctx'], t: number, squeezeAt: number) {
  const inHit = clamp((t - (squeezeAt - 0.09)) / 0.16);
  const release = clamp((t - (squeezeAt + 0.06)) / 0.38);
  const close = ease.outCubic(inHit) * (1 - ease.outCubic(release) * 0.72);
  const topY = Math.round(252 + close * 285), bottomY = Math.round(1014 - close * 257);
  // Monochrome press frame is a single huge die with bright machined edges and stepped pins.
  ctx.fillStyle = '#111519'; ctx.fillRect(0, 84, W, 118);
  ctx.fillStyle = '#92999E'; ctx.fillRect(0, 84, W, 10); ctx.fillRect(0, 84, 14, 118);
  ctx.fillStyle = '#353C42'; ctx.fillRect(0, 190, W, 12);
  for (const x of [72, 930]) {
    ctx.fillStyle = '#151A1E'; ctx.fillRect(x, 126, 78, 960);
    ctx.fillStyle = '#9AA1A6'; ctx.fillRect(x, 126, 9, 960); ctx.fillRect(x + 62, 126, 12, 960);
    ctx.fillStyle = '#2E353A'; ctx.fillRect(x + 15, 145, 40, 920);
    for (let bolt = 0; bolt < 8; bolt++) {
      ctx.fillStyle = bolt % 2 ? '#AEB3B6' : '#555D63';
      ctx.fillRect(x + 22, 170 + bolt * 118, 24, 10);
    }
  }
  // Twin piston rods visibly travel with the platen.
  ctx.fillStyle = '#B5BABD'; ctx.fillRect(190, topY - 82, 34, 86); ctx.fillRect(856, topY - 82, 34, 86);
  ctx.fillStyle = '#444B51'; ctx.fillRect(198, topY - 72, 18, 80); ctx.fillRect(864, topY - 72, 18, 80);
  ctx.fillStyle = '#111519'; ctx.fillRect(124, topY, 832, 122);
  ctx.fillStyle = '#B4BABE'; ctx.fillRect(124, topY, 832, 10); ctx.fillRect(124, topY, 12, 122);
  ctx.fillStyle = '#41484E'; ctx.fillRect(145, topY + 24, 790, 15);
  for (let notch = 0; notch < 24; notch++) { ctx.fillStyle = notch % 2 ? '#171B1F' : '#7B8389'; ctx.fillRect(154 + notch * 32, topY + 48, 18, 28); }
  ctx.fillStyle = '#0D1012'; ctx.fillRect(124, bottomY, 832, 96);
  ctx.fillStyle = '#B4BABE'; ctx.fillRect(124, bottomY, 832, 10); ctx.fillRect(124, bottomY + 80, 832, 12);
  ctx.fillStyle = '#373E44'; ctx.fillRect(148, bottomY + 22, 784, 28);
  for (let tooth = 0; tooth < 26; tooth++) { ctx.fillStyle = tooth % 2 ? '#111417' : '#7D858B'; ctx.fillRect(150 + tooth * 30, bottomY + 55, 18, 18); }
  return { topY, bottomY, close };
}

function pathPoints(value: unknown[], fallback: Point[]) {
  const points = value.slice(0, 16).map(point => {
    if (Array.isArray(point)) {
      const x = Number(point[0]), y = Number(point[1]);
      return Number.isFinite(x) && Number.isFinite(y) ? { x: clamp(x, -100, 1180), y: clamp(y, -120, 1260), z: 0, u: 0, angle: 0 } : null;
    }
    if (point && typeof point === 'object') {
      const p = point as Record<string, unknown>, x = Number(p.x), y = Number(p.y);
      return Number.isFinite(x) && Number.isFinite(y) ? { x: clamp(x, -100, 1180), y: clamp(y, -120, 1260), z: 0, u: 0, angle: 0 } : null;
    }
    return null;
  }).filter((p): p is Point => p !== null);
  return points.length > 1 ? points : fallback;
}

function drawLaunch(ctx: Frame['ctx'], path: Point[], progress: number) {
  if (progress <= 0) return;
  const n = (path.length - 1) * clamp(progress), last = Math.floor(n), partial = n - last;
  ctx.beginPath(); ctx.moveTo(path[0]!.x, path[0]!.y);
  for (let i = 1; i <= Math.min(last, path.length - 1); i++) ctx.lineTo(path[i]!.x, path[i]!.y);
  if (last < path.length - 1 && partial > 0) {
    const a = path[last]!, b = path[last + 1]!;
    ctx.lineTo(Math.round(a.x + (b.x - a.x) * partial), Math.round(a.y + (b.y - a.y) * partial));
  }
  ctx.strokeStyle = '#292E33'; ctx.lineWidth = 42; ctx.lineCap = 'square'; ctx.lineJoin = 'bevel'; ctx.stroke();
  ctx.strokeStyle = RED; ctx.lineWidth = 18; ctx.stroke();
  ctx.strokeStyle = '#F6ACA5'; ctx.lineWidth = 4; ctx.stroke();
}

function drawPointingFinger(ctx: Frame['ctx'], x: number, feetY: number) {
  // A few enlarged brown art-pixels reinforce the actor's upward point at the final hold.
  const cells: Array<[number, number, number, number]> = [
    [x + 24, feetY - 174, 30, 26], [x + 40, feetY - 202, 30, 28],
    [x + 56, feetY - 232, 28, 28], [x + 64, feetY - 262, 22, 42],
    [x + 64, feetY - 312, 22, 58],
  ];
  ctx.fillStyle = '#291910';
  for (const [cx, cy, w, h] of cells) ctx.fillRect(cx, cy, w, h);
  ctx.fillStyle = '#8B5C38';
  for (const [cx, cy, w, h] of cells) ctx.fillRect(cx + 5, cy + 4, w - 10, h - 8);
  ctx.fillStyle = '#D4A66F';
  ctx.fillRect(x + 70, feetY - 312, 10, 26); ctx.fillRect(x + 74, feetY - 320, 6, 12);
  ctx.fillStyle = '#F0D9B3'; ctx.fillRect(x + 74, feetY - 322, 6, 8);
}

export const squeezeRocketShot: ShotDef = {
  name: 'squeezerocket',
  describe: 'A rising ticket loop wraps the venue tower, then a hydraulic press stamps the oversized ticket. params: stampWord/terminalLabel, loopTurns, launchPath, riderActor, particleSet, loopOutPoint.',
  render(frame: Frame, props: ShotProps) {
    const { ctx, theme, seed } = frame;
    const dur = Math.max(0.25, frame.dur), t = clamp(frame.t, 0, dur);
    const loopAt = eventAt(props, 'loop', dur * 0.34, dur);
    const squeezeAt = eventAt(props, 'squeeze', dur * 0.76, dur);
    const turns = numParam(props, 'loopTurns', 2.2, 1.2, 3.4);
    const count = Math.floor(numParam(props, 'buybackCount', 5, 3, 7));
    const purchases = buyTimes(props, dur, loopAt, squeezeAt, count);
    const stamp = strParam(props, 'stampWord', strParam(props, 'terminalLabel', 'SHORT SQUEEZE')).toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim().slice(0, 18) || 'SHORT SQUEEZE';
    const rider = strParam(props, 'riderActor', 'hedgy').toLowerCase() !== 'none';
    const burstKind = ['shard', 'confetti', 'spark', 'dust'].includes(strParam(props, 'particleSet', 'shard')) ? strParam(props, 'particleSet', 'shard') as 'shard' | 'confetti' | 'spark' | 'dust' : 'shard';
    const launchDir = strParam(props, 'loopOutPoint', 'top').toLowerCase();
    const fallbackLaunch: Point[] = launchDir === 'left'
      ? [{ x: 560, y: 470, z: 0, u: 0, angle: 0 }, { x: 370, y: 290, z: 0, u: 0, angle: 0 }, { x: 170, y: 180, z: 0, u: 0, angle: 0 }, { x: -70, y: 90, z: 0, u: 0, angle: 0 }]
      : launchDir === 'right'
        ? [{ x: 560, y: 470, z: 0, u: 0, angle: 0 }, { x: 730, y: 290, z: 0, u: 0, angle: 0 }, { x: 930, y: 180, z: 0, u: 0, angle: 0 }, { x: 1150, y: 90, z: 0, u: 0, angle: 0 }]
        : [{ x: 560, y: 506, z: 0, u: 0, angle: 0 }, { x: 544, y: 348, z: 0, u: 0, angle: 0 }, { x: 540, y: 162, z: 0, u: 0, angle: 0 }, { x: 540, y: -160, z: 0, u: 0, angle: 0 }];
    const launch = pathPoints(listParam(props, 'launchPath'), fallbackLaunch);
    const rig = createCameraRig({
      width: W, height: H, seed: seed + 901, handheld: 1.4,
      keyframes: [
        { t: 0, x: -28, y: 24, zoom: 1.02, rot: -0.012 },
        { t: loopAt, x: 24, y: -18, zoom: 1.075, rot: 0.014 },
        { t: squeezeAt - 0.06, x: -18, y: 26, zoom: 1.13, rot: -0.018 },
        { t: dur, x: 0, y: 0, zoom: 1.015, rot: 0 },
      ],
      hits: [...purchases, squeezeAt], punch: 0.022, shake: 30,
      whip: [{ at: squeezeAt + 0.08, direction: 'up', duration: 0.32, amount: 0.1 }],
    });
    const squeezePulse = clamp((t - (squeezeAt - 0.09)) / 0.16) * (1 - clamp((t - (squeezeAt + 0.07)) / 0.35) * 0.72);
    const ratchet = purchases.reduce((sum, at) => sum + ease.outCubic(clamp((t - at) / 0.16)) * 26, 0);
    const progress = 0.18 + 0.82 * clamp((t - loopAt + 0.12) / Math.max(0.15, squeezeAt - loopAt + 0.12));
    const pts = Array.from({ length: 181 }, (_, i) => helixPoint(i / 180, turns, t, ratchet));

    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip(); ctx.imageSmoothingEnabled = false;
    drawEnv(ctx, { type: 'city', t, camera: { x: Math.sin(t * 0.42) * 28, y: Math.cos(t * 0.31) * 20, zoom: 1.04 + Math.sin(t * 0.28) * 0.015, yaw: Math.sin(t * 0.36) * 0.06, pitch: 0.04 }, theme: { ...theme, bg: '#121417' }, seed: seed + 19, width: W, height: H });
    // The far half of the demand spiral slips behind a fully lit voxel tower.
    drawHelix(ctx, pts, progress, false, 38, '#31373D'); drawHelix(ctx, pts, progress, false, 23, '#111417'); drawHelix(ctx, pts, progress, false, 12, RED);
    const cameraX = Math.sin(t * 0.72) * 2.3, cameraY = 4.3 + Math.sin(t * 0.52) * 0.54;
    const view = { x: 210, y: 18, w: 660, h: 1102, zoom: 120, fov: 43, position: [cameraX, cameraY, -14] as [number, number, number], target: [0, 4.5, 0] as [number, number, number], light: [-0.48, 0.78, -0.36] as [number, number, number], ambient: 0.48, rim: 0.42, cell: 5, outline: true, fog: { near: 14, far: 27 } };
    render3d(ctx, theme, view, [
      { mesh: TOWER, materials: TOWER_MATERIALS, pos: [0, 0, 0], rot: [0, t * 0.018, 0] },
      { mesh: BLOCK, materials: BLOCK_MATERIALS, instances: BLOCKS },
    ]);

    ctx.save(); rig.apply(ctx, t);
    drawSpeedLines(ctx, t, { center: { x: 540, y: 650 }, count: 58, reach: 710, start: loopAt, duration: Math.max(0.22, squeezeAt - loopAt), color: '#999FA4', seed: seed + 65, strength: 0.34, cell: 6 });
    // Buyback points pulse like physical ratchets; their click timing also raises the entire spiral.
    purchases.forEach((at, i) => {
      const p = clamp((t - at) / 0.22), point = pts[Math.floor((i + 1) * pts.length / (count + 1))]!;
      const scale = 0.7 + ease.outBack(p) * 0.5;
      drawKiosk(ctx, point.x + (point.z > 0 ? -50 : 48), point.y - 12, (point.z < 0 ? 1.04 : 0.78) * scale, t, p);
      if (p > 0 && p < 1) { ctx.fillStyle = RED; ctx.fillRect(point.x - 14, point.y - 36, 28, 12); }
      drawBurst(ctx, t, { x: point.x, y: point.y, seed: seed + 181 + i * 13, count: 9, kind: 'spark', start: at, life: 0.52, speed: 150, gravity: 120, drag: 0.52, floor: 1220, size: 1, color: '#D8DADD', cell: 4 });
    });
    drawHelix(ctx, pts, progress, true, 42, '#292F35'); drawHelix(ctx, pts, progress, true, 28, '#0D1012'); drawHelix(ctx, pts, progress, true, 15, RED);
    // Identical shared concert tickets stream around both sides of the tower with close-to-lens parallax.
    const queueCount = 13, queueOffset = (t * 0.27) % 1;
    for (let i = 0; i < queueCount; i++) {
      const u = (i / queueCount + queueOffset) % 1;
      if (u > progress) continue;
      const p = helixPoint(u, turns, t, ratchet), tangent = helixPoint(Math.min(1, u + 0.006), turns, t, ratchet);
      const scale = p.z < 0 ? 1 : 0.56;
      drawTicket2D(ctx, p.x, p.y, (p.z < 0 ? 72 : 42) * scale, { rot: Math.atan2(tangent.y - p.y, tangent.x - p.x) });
    }

    const press = drawPress(ctx, t, squeezeAt);
    // Purchase tickets collapse into the paper shape while the press is at maximum travel.
    const ticketReveal = ease.outBack(clamp((t - squeezeAt + 0.025) / 0.18));
    if (ticketReveal > 0) {
      ctx.save(); ctx.globalAlpha *= clamp(ticketReveal);
      const ticketY = 642 + Math.round((1 - ticketReveal) * 54);
      drawTicket2D(ctx, 540, ticketY, 850 + ticketReveal * 26, { rot: 0.012 * (1 - ticketReveal) });
      pixelText(ctx, stamp, 389, ticketY - 30, 6, { color: '#111315', align: 'center', reveal: clamp((t - squeezeAt - 0.06) / 0.22), mode: 'type', seed: seed + 77 });
      ctx.restore();
    }
    // The red line rockets out through the top after the die releases.
    const launchProgress = ease.outCubic(clamp((t - squeezeAt - 0.055) / 0.58));
    drawLaunch(ctx, launch, launchProgress);
    if (launchProgress > 0.18) drawSpeedLines(ctx, t, { center: { x: launch[0]!.x, y: launch[0]!.y }, count: 30, reach: 580, start: squeezeAt + 0.08, duration: 0.32, color: '#A6ADB2', seed: seed + 69, strength: 0.48, cell: 4 });
    drawImpactStar(ctx, t, { x: 540, y: 647, size: 150, start: squeezeAt - 0.01, duration: 0.17, color: '#F3F1EC', seed: seed + 79, cell: 4 });
    drawBurst(ctx, t, { x: 540, y: 644, seed: seed + 91, count: 62, kind: 'shard', start: squeezeAt, life: 1.55, speed: 470, spread: TAU, gravity: 270, drag: 0.3, floor: 1220, bounce: 0.18, spin: 8, size: 2, color: IVORY, cell: 4 });
    drawShockwave(ctx, t, { x: 540, y: 644, start: squeezeAt, duration: 0.7, radius: 18, maxRadius: 520, width: 2, color: '#E1E3E5', seed: seed + 111, cell: 4 });
    drawPressFront(ctx, press.topY, press.bottomY);

    // Foreground ledge and Hedgy's landing: tumbling arrival, curled impact, uncurl, then point at the launch.
    ctx.fillStyle = '#0C0F12'; ctx.fillRect(600, 1120, 480, 170);
    ctx.fillStyle = '#C0C5C8'; ctx.fillRect(600, 1120, 480, 12);
    ctx.fillStyle = '#343B41'; ctx.fillRect(620, 1142, 440, 12); ctx.fillRect(680, 1200, 14, 90); ctx.fillRect(984, 1200, 14, 90);
    for (let bolt = 0; bolt < 7; bolt++) { ctx.fillStyle = '#E5E7E8'; ctx.fillRect(630 + bolt * 68, 1124, 10, 8); }
    if (rider) {
      const fallStart = squeezeAt - 0.36, landAt = squeezeAt + 0.02, elapsed = t - landAt;
      const x = 846 + Math.sin(t * 2.4) * 8;
      if (t < landAt) drawHedgy(ctx, { x, y: 1120, scale: 5.3, t: Math.max(0, t - fallStart), pose: 'fall', facing: 1, look: 'up', expression: 'shocked' });
      else if (elapsed < 0.3) drawHedgy(ctx, { x, y: 1120, scale: 5.3, t: Math.max(0, 0.78 - elapsed * 2.6), pose: 'curl', facing: 1, look: 'up', expression: 'shocked' });
      else {
        drawHedgy(ctx, { x, y: 1120, scale: 5.3, t: elapsed - 0.3, pose: 'point', facing: 1, look: 'up', expression: 'determined' });
        drawPointingFinger(ctx, x, 1120);
      }
    }
    ctx.restore(); ctx.restore();

    const impactFrame = Math.floor(t * 30) === Math.floor(squeezeAt * 30);
    if (impactFrame) applyImpactFrame(ctx, { x: 0, y: 0, w: W, h: H, cell: 8, t, at: squeezeAt, fps: 30, seed: seed + 119, threshold: 130 });
    const flash = Math.max(0, 1 - Math.abs(t - squeezeAt) / 0.05) * 0.42;
    if (flash > 0.02) {
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip(); ctx.fillStyle = '#FFFFFF'; ctx.globalAlpha = flash; ctx.fillRect(0, 0, W, H); ctx.restore();
    }
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const loopAt = eventAt(props, 'loop', dur * 0.34, dur), squeezeAt = eventAt(props, 'squeeze', dur * 0.76, dur);
    const count = Math.floor(numParam(props, 'buybackCount', 5, 3, 7)), purchases = buyTimes(props, dur, loopAt, squeezeAt, count);
    const cues: Cue[] = [
      { t: 0, kind: 'whoosh', gain: 0.54, pan: -0.25 },
      { t: loopAt, kind: 'build', len: Math.max(0.12, squeezeAt - loopAt), gain: 0.82, pan: 0 },
      ...purchases.map((t, i) => ({ t, kind: 'servo' as const, pan: -0.58 + i * (1.16 / Math.max(1, count - 1)), gain: 0.46 + i * 0.08, step: i / Math.max(1, count - 1) })),
      { t: Math.max(0, squeezeAt - 0.11), kind: 'bass', gain: 0.9 },
      { t: squeezeAt, kind: 'impact', gain: 1, pan: 0 },
      { t: squeezeAt + 0.02, kind: 'paper', gain: 0.78, pan: 0.08 },
      { t: squeezeAt + 0.12, kind: 'rise', len: Math.max(0.12, Math.min(0.5, dur - squeezeAt - 0.12)), gain: 0.75, pan: 0.1 },
      { t: squeezeAt + 0.32, kind: 'land', gain: 0.58, pan: 0.58 },
    ];
    return cues.filter(cue => cue.t >= 0 && cue.t < dur);
  },
};

function drawPressFront(ctx: Frame['ctx'], topY: number, bottomY: number) {
  // Thin front lips sit above the reveal so the oversized ticket reads as material captured by the press.
  ctx.fillStyle = '#0C0F12'; ctx.fillRect(124, topY + 112, 832, 12);
  ctx.fillStyle = '#7F878D'; ctx.fillRect(124, topY + 112, 832, 5);
  ctx.fillStyle = '#171B1F'; ctx.fillRect(124, bottomY - 14, 832, 18);
  ctx.fillStyle = '#A2A8AC'; ctx.fillRect(124, bottomY - 14, 832, 5);
}
