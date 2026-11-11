import { clamp, type Cue, type Frame, type ShotProps } from '../core.ts';
import { ASSETS } from '../assets/index.ts';
import { drawHedgy } from '../actor/hedgy.ts';
import { drawEnv } from '../env/index.ts';
import { drawBurst } from '../fx/particles.ts';
import { createCameraRig } from '../fx/rig.ts';
import { pixelText } from '../prim.ts';
import { drawTicket2D } from '../sets/ticket.ts';
import { box, cylinder, place, render3d, sphere, type Object3D } from '../three.ts';
import type { ShotDef } from './index.ts';

const SCALE = ASSETS['balance-scale']({ detail: 0.48 });
const CASH = ASSETS['banknote-bundle']({ count: 4 });
const SCALE_PARTS = ['weighted-base', 'pedestal', 'central-pivot', 'top-finial']
  .map(name => SCALE.parts.find(candidate => candidate.name === name)!);
const SCALE_BEAM = box(2.45, 0.12, 0.18, 1);
const SCALE_BALL = sphere(0.11, 14, 8, 2);
const SCALE_CHAIN = cylinder(0.025, 0.62, 8, 2);
const SCALE_PAN = cylinder(0.56, 0.1, 28, 1, 1, 0.38);
const SCALE_TRAY = box(0.34, 0.19, 0.28, 0);
const GRID = 4;

const eventAt = (props: ShotProps, kind: string, fallback: number, dur: number) => {
  const event = props.events?.find(item => item.kind.toLowerCase() === kind);
  return clamp(Number.isFinite(event?.at) ? event!.at : fallback, 0, dur);
};
const progress = (t: number, start: number, end: number) => clamp((t - start) / Math.max(0.001, end - start));
const easeOut = (value: number) => 1 - (1 - clamp(value)) ** 3;
const easeInOut = (value: number) => value < 0.5 ? 4 * value ** 3 : 1 - ((-2 * value + 2) ** 3) / 2;
const snap = (value: number) => Math.round(value / GRID) * GRID;

function scaleObjects(sink: number): Object3D[] {
  const unit = 1.42, angle = -0.31 * sink, pivotY = 0.45, centerX = 0.48, depth = -1.15;
  const at = (x: number, y: number, z = depth): [number, number, number] => [centerX + x * unit, y * unit, z * unit];
  const objects: Object3D[] = [];
  for (const part of SCALE_PARTS) {
    objects.push({ mesh: part.mesh, pos: at(part.pos?.[0] ?? 0, part.pos?.[1] ?? 0), rot: part.rot, scale: unit, materials: SCALE.materials });
  }
  objects.push({ mesh: SCALE_BEAM, pos: at(0, pivotY), rot: [0, 0, angle], scale: unit, materials: SCALE.materials });
  objects.push({ mesh: SCALE_BALL, pos: at(-1.12 * Math.cos(angle), pivotY - 1.12 * Math.sin(angle), depth - 0.08), scale: unit, materials: SCALE.materials });
  objects.push({ mesh: SCALE_BALL, pos: at(1.12 * Math.cos(angle), pivotY + 1.12 * Math.sin(angle), depth - 0.08), scale: unit, materials: SCALE.materials });
  for (const side of [-1, 1] as const) {
    const endY = pivotY + side * 1.02 * Math.sin(angle);
    const sideSink = side > 0 ? sink * 0.73 : -sink * 0.16;
    const chainLength = 0.62 + (side > 0 ? sink * 0.56 : 0);
    const chainY = endY - chainLength / 2;
    const panY = endY - chainLength - 0.06 + sideSink;
    const endX = side * 1.02 * Math.cos(angle);
    for (const z of [-0.2, 0.2]) objects.push({ mesh: SCALE_CHAIN, pos: at(endX, chainY, depth + z), scale: [unit, unit * chainLength / 0.62, unit], materials: SCALE.materials });
    objects.push({ mesh: SCALE_PAN, pos: at(endX, panY, depth), scale: unit, materials: SCALE.materials });
    if (side < 0) {
      objects.push({ mesh: CASH.mesh, pos: at(endX, panY + 0.19, depth - 0.04), scale: 0.26 * unit, materials: CASH.materials });
    } else {
      objects.push({ mesh: SCALE_TRAY, pos: at(endX - 0.18, panY + 0.14, depth + 0.18), scale: unit, materials: [{ ramp: 'steel', tone: 0.84, spec: 0.65 }] });
    }
  }
  return objects;
}

function drawWall(ctx: Frame['ctx'], theme: Frame['theme'], t: number, unfold: number) {
  const open = easeOut(unfold);
  ctx.fillStyle = '#101214'; ctx.fillRect(118, 266, 844, 608);
  ctx.fillStyle = '#343A3E'; ctx.fillRect(138, 286, 804, 568);
  ctx.fillStyle = '#171A1D'; ctx.fillRect(164, 310, 752, 522);
  const wing = Math.round(202 * open / GRID) * GRID;
  ctx.fillStyle = '#454B50'; ctx.fillRect(138 - wing, 378, wing, 402); ctx.fillRect(942, 378, wing, 402);
  ctx.fillStyle = '#AAB1B5'; ctx.fillRect(138 - wing, 378, wing, 8); ctx.fillRect(942, 378, wing, 8);
  ctx.fillStyle = '#858C91'; ctx.fillRect(132, 344, 8, 476); ctx.fillRect(940, 344, 8, 476);
  for (let i = 0; i < 8; i++) {
    const y = 396 + i * 48;
    ctx.fillStyle = i % 2 ? '#25292D' : '#202428'; ctx.fillRect(182, y, 716, 8);
    ctx.fillStyle = i % 2 ? '#555C61' : '#3D4449'; ctx.fillRect(182, y + 8, 716, 4);
  }
  const sweep = Math.sin(t * 5.5);
  ctx.fillStyle = sweep > 0.72 ? '#E6E8E9' : '#858B90';
  ctx.fillRect(166, 330, 12, 48); ctx.fillRect(902, 330, 12, 48);
  ctx.fillStyle = '#9AA1A5'; ctx.fillRect(196, 344, 176, 8); ctx.fillRect(708, 344, 176, 8);
}

function drawCounterBase(ctx: Frame['ctx'], t: number, camera: number) {
  // The bright lip occupies the near foreground; the camera pushes between this edge and the scale.
  ctx.fillStyle = '#090A0C'; ctx.fillRect(0, 876, 1080, 414);
  ctx.fillStyle = '#30363A'; ctx.fillRect(0, 844, 1080, 38);
  ctx.fillStyle = '#D1D5D7'; ctx.fillRect(0, 840, 1080, 8);
  ctx.fillStyle = '#181C1F'; ctx.fillRect(0, 888, 1080, 18);
  ctx.fillStyle = '#52595E'; ctx.fillRect(0, 908, 1080, 12);
  ctx.fillStyle = '#252A2E'; ctx.fillRect(0, 920, 1080, 370);
  for (let i = 0; i < 15; i++) {
    const x = snap(i * 82 - camera * (0.18 + i % 3 * 0.06));
    ctx.fillStyle = '#3A4146'; ctx.fillRect(x, 928, 5, 322);
    ctx.fillStyle = '#111416'; ctx.fillRect(x + 5, 928, 5, 322);
    if (i % 2 === 0) { ctx.fillStyle = '#687176'; ctx.fillRect(x + 13, 956, 17, 5); }
  }
  ctx.fillStyle = '#717A7F';
  for (let i = 0; i < 10; i++) {
    const x = snap(i * 126 - camera * 0.42);
    ctx.fillRect(x, 1256 + Math.round(Math.sin(t * 3 + i) * 2), 60, 4);
  }
  // Two bolted runner rails make the drawer's depth legible before it moves.
  ctx.fillStyle = '#858D92'; ctx.fillRect(380, 948, 400, 8); ctx.fillRect(380, 1070, 400, 8);
  ctx.fillStyle = '#1A1E21'; ctx.fillRect(388, 962, 384, 100);
}

function drawDrawer(ctx: Frame['ctx'], t: number, collateralAt: number) {
  const thrust = easeOut(progress(t, collateralAt - 0.04, collateralAt + 0.23));
  const recoil = Math.exp(-Math.max(0, t - collateralAt - 0.23) * 6);
  const kick = t < collateralAt + 0.24 ? Math.sin(progress(t, collateralAt, collateralAt + 0.24) * Math.PI) * 14 : 0;
  const x = 500 - 260 * thrust - 24 * recoil + kick;
  const y = 914 + 92 * thrust + kick * 0.35;
  const w = 434 + 168 * thrust, h = 104 + 42 * thrust;
  ctx.fillStyle = '#080A0B'; ctx.fillRect(snap(x - 18), snap(y + 8), snap(w + 22), snap(h + 10));
  ctx.fillStyle = '#6F787D'; ctx.fillRect(snap(x - 10), snap(y), snap(w + 12), 10);
  ctx.fillStyle = '#4A5257'; ctx.fillRect(snap(x - 10), snap(y), snap(w + 12), snap(h));
  ctx.fillStyle = '#B9C0C3'; ctx.fillRect(snap(x - 10), snap(y), snap(w + 12), 8);
  ctx.fillStyle = '#252A2D'; ctx.fillRect(snap(x), snap(y + 12), snap(w - 8), snap(h - 20));
  ctx.fillStyle = '#A6ADB1'; ctx.fillRect(snap(x + 20), snap(y + h - 12), snap(w - 48), 6);

  const plateX = snap(x + 26), plateY = snap(y + 20), plateW = Math.min(264, snap(w * 0.57)), plateH = 42;
  ctx.fillStyle = '#111416'; ctx.fillRect(plateX, plateY, plateW, plateH);
  ctx.fillStyle = '#C1C7CA'; ctx.fillRect(plateX, plateY, plateW, 5); ctx.fillRect(plateX, plateY + plateH - 5, plateW, 5);
  ctx.fillStyle = '#171A1C'; ctx.fillRect(plateX + 8, plateY + 8, plateW - 16, plateH - 16);
  if (thrust > 0.34) pixelText(ctx, 'COLLATERAL', plateX + plateW / 2, plateY + 11, 2, { color: '#F0F2F3', align: 'center' });
  const handleX = snap(x + w - 86);
  ctx.fillStyle = '#D8DCDE'; ctx.fillRect(handleX, plateY + 10, 48, 10);
  ctx.fillStyle = '#4D555A'; ctx.fillRect(handleX + 8, plateY + 22, 36, 8);
  ctx.fillStyle = '#AEB5B9';
  for (let i = 0; i < 4; i++) ctx.fillRect(snap(x + 12 + i * 12), snap(y + 10), 4, 4);

}

function drawClosingDrawer(ctx: Frame['ctx'], close: number) {
  if (close <= 0) return;
  // The drawer rises out of the counter and becomes a full-height steel shutter into shot 10.
  const top = snap(1290 - easeInOut(close) * 1320);
  const height = 1290 - top;
  ctx.fillStyle = '#080A0B'; ctx.fillRect(0, top - 10, 1080, height + 10);
  ctx.fillStyle = '#343B3F'; ctx.fillRect(0, top, 1080, height);
  ctx.fillStyle = '#AEB6BA'; ctx.fillRect(0, top, 1080, 12);
  ctx.fillStyle = '#171B1E'; ctx.fillRect(20, top + 24, 1040, Math.max(0, height - 42));
  for (let i = 0; i < 5; i++) {
    const y = top + 52 + i * 72;
    if (y + 12 >= 1290) continue;
    ctx.fillStyle = i % 2 ? '#2C3236' : '#363D42'; ctx.fillRect(36, y, 1008, 8);
    ctx.fillStyle = '#788186'; ctx.fillRect(36, y + 8, 1008, 4);
  }
  if (close > 0.24) {
    const plateY = Math.max(top + 68, 1280 - close * 650);
    ctx.fillStyle = '#080A0B'; ctx.fillRect(334, plateY, 412, 72);
    ctx.fillStyle = '#AEB6BA'; ctx.fillRect(334, plateY, 412, 8); ctx.fillRect(334, plateY + 64, 412, 8);
    pixelText(ctx, 'COLLATERAL', 540, plateY + 20, 3, { color: '#F0F2F3', align: 'center' });
  }
}

function drawTicketTrace(ctx: Frame['ctx'], t: number, sink: number) {
  // The perforation sits over the right pan's center, so the incoming red pixel lands
  // on the obligation and rides down with it when the broker demands more collateral.
  const ticketX = 696 + Math.round(Math.sin(t * 1.4) * 2), y = 642 + Math.round(sink * 96);
  drawTicket2D(ctx, ticketX, y, 128, { rot: -0.025 + sink * 0.01 });
  const anchorX = ticketX + 22, anchorY = y;
  const points: Array<[number, number]> = [
    [anchorX, anchorY], [anchorX - 14, anchorY - 4], [anchorX - 28, anchorY - 14],
    [anchorX - 46, anchorY - 10], [anchorX - 62, anchorY - 25],
    [anchorX - 82, anchorY - 20], [anchorX - 104, anchorY - 38],
  ];
  ctx.fillStyle = '#B73532';
  for (let segment = 0; segment < points.length - 1; segment++) {
    const [x0, y0] = points[segment]!, [x1, y1] = points[segment + 1]!;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) / GRID));
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      ctx.fillRect(snap(x0 + (x1 - x0) * u), snap(y0 + (y1 - y0) * u), GRID, GRID);
    }
  }
  ctx.fillStyle = '#F34A40';
  ctx.fillRect(snap(anchorX - 4), snap(anchorY - 4), GRID, GRID);
}

function drawEmptyPouch(ctx: Frame['ctx'], x: number, y: number, reveal: number) {
  if (reveal <= 0.01) return;
  const lift = Math.round((1 - easeOut(reveal)) * 34 / GRID) * GRID;
  const tilt = (1 - easeOut(reveal)) * -0.16;
  ctx.save();
  ctx.translate(snap(x), snap(y - lift)); ctx.rotate(tilt);
  ctx.globalAlpha *= Math.min(1, reveal * 2.4);
  // Soft, tapered cloth body with the pale lining turned outward and an empty mouth.
  ctx.fillStyle = '#111416';
  ctx.beginPath(); ctx.moveTo(-32, -20); ctx.lineTo(-24, -28); ctx.lineTo(-12, -24); ctx.lineTo(16, -24);
  ctx.lineTo(28, -28); ctx.lineTo(36, -20); ctx.lineTo(28, 20); ctx.lineTo(20, 32);
  ctx.lineTo(-20, 32); ctx.lineTo(-28, 20); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#8D969A';
  ctx.fillRect(-28, -16, 16, 40); ctx.fillRect(-12, -20, 28, 48); ctx.fillRect(16, -16, 12, 40);
  ctx.fillStyle = '#D0D5D7'; ctx.fillRect(-24, -24, 40, 8); ctx.fillRect(-20, 24, 40, 8);
  ctx.fillStyle = '#202427';
  ctx.beginPath(); ctx.moveTo(-20, -12); ctx.lineTo(20, -12); ctx.lineTo(14, 0); ctx.lineTo(-14, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#B5BDC0'; ctx.fillRect(-24, 0, 8, 20); ctx.fillRect(16, 0, 8, 20);
  ctx.strokeStyle = '#D0D5D7'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(-28, -20); ctx.lineTo(-40, -32); ctx.moveTo(28, -20); ctx.lineTo(40, -32); ctx.stroke();
  ctx.fillStyle = '#E4E7E8'; ctx.fillRect(-8, 8, 16, 4);
  ctx.restore();
}

function drawWarning(ctx: Frame['ctx'], t: number, collateralAt: number) {
  const pulses = [0, 0.18, 0.38, 0.58];
  const lit = pulses.some(offset => Math.abs(t - collateralAt - offset) < 0.075);
  ctx.fillStyle = '#101315'; ctx.fillRect(742, 322, 144, 50);
  ctx.fillStyle = '#6F787D'; ctx.fillRect(750, 330, 128, 34);
  ctx.fillStyle = lit ? '#F2F4F5' : '#2F3539'; ctx.fillRect(758, 338, 112, 18);
  if (lit) {
    ctx.fillStyle = '#DDE1E3'; ctx.fillRect(696, 348, 32, 5); ctx.fillRect(890, 348, 32, 5);
    ctx.fillRect(772, 306, 12, 8); ctx.fillRect(836, 306, 12, 8);
  }
  ctx.fillStyle = '#333A3E'; ctx.fillRect(764, 368, 100, 6);
}

export const collateralCallShot: ShotDef = {
  name: 'collateralcall',
  describe: 'The obligation pan sinks on demands; a marked collateral drawer punches out toward Hedgy as the camera pushes between the counter and the scale.',
  render(frame: Frame, props: ShotProps) {
    const { ctx, theme, seed } = frame, dur = Math.max(0.01, frame.dur), t = clamp(frame.t, 0, dur);
    const demandsAt = eventAt(props, 'demands', dur * 0.31, dur);
    const collateralAt = eventAt(props, 'collateral', dur * 0.57, dur);
    const sinkHit = easeOut(progress(t, demandsAt - 0.22, demandsAt + 0.04));
    const sinkSettle = t > demandsAt + 0.28 ? 0.1 * Math.sin((t - demandsAt - 0.28) * 18) * Math.exp(-(t - demandsAt - 0.28) * 4.5) : 0;
    const sink = clamp(sinkHit + sinkSettle, 0, 1.14);
    const unfold = progress(t, 0.015, Math.min(dur * 0.22, 0.36));
    const endClose = progress(t, dur - 0.31, dur - 0.025);
    const rig = createCameraRig({
      width: 1080, height: 1290, seed: seed + 81, handheld: 1.8,
      keyframes: [
        { t: 0, x: -22, y: 8, zoom: 1, rot: 0 },
        { t: demandsAt, x: 0, y: 0, zoom: 1.035, rot: 0, ease: 'inOut' },
        { t: collateralAt, x: 12, y: -10, zoom: 1.13, rot: -0.003, ease: 'inOut' },
        { t: dur, x: 30, y: -16, zoom: 1.2, rot: -0.005, ease: 'in' },
      ], hits: [demandsAt, collateralAt], punch: 0.022, shake: 8,
      dollyZoom: { start: demandsAt, end: Math.min(dur, collateralAt + 0.32), amount: 0.12 },
    });
    const pose = rig.poseAt(t), camera = rig.view3D(t);
    ctx.imageSmoothingEnabled = false;
    drawEnv(ctx, { type: 'exchange', t, theme, seed: seed + 5, width: 1080, height: 1290, camera: { x: pose.x * 0.22, y: pose.y * 0.2, zoom: pose.zoom, rot: pose.rot, yaw: camera.yaw, pitch: camera.pitch } });
    ctx.save(); rig.apply(ctx, t);
    drawWall(ctx, theme, t, unfold);
    render3d(ctx, theme, {
      x: 7, y: 235, w: 850, h: 660, zoom: 112, yaw: camera.yaw + 0.12, pitch: 0.34 + camera.pitch * 0.24,
      distance: Math.max(4.5, camera.distance - 0.28), target: [camera.target[0], camera.target[1] + 0.17, camera.target[2]], cell: 4,
      outline: true, light: [-0.5, 0.78, -0.46], ambient: 0.44, rim: 0.54,
      fog: { near: 7, far: 15, color: '#16191B' },
    }, scaleObjects(sink));
    drawTicketTrace(ctx, t, sink);
    drawCounterBase(ctx, t, pose.x);
    drawWarning(ctx, t, collateralAt);
    drawDrawer(ctx, t, collateralAt);
    const recoil = easeOut(progress(t, collateralAt + 0.01, collateralAt + 0.22));
    const pouchReveal = progress(t, collateralAt + 0.03, collateralAt + 0.22);
    drawHedgy(ctx, {
      x: 300 - 20 * recoil, y: 1080, scale: 4.35, t: Math.max(0, t - demandsAt),
      pose: t < demandsAt ? 'sweat' : t < collateralAt + 0.08 ? 'shock' : 'wave-off', facing: 1,
      look: 'up', expression: t < demandsAt ? 'worried' : 'shocked', prop: 'none',
    });
    drawEmptyPouch(ctx, 432 - 12 * recoil, 960 + 8 * recoil, pouchReveal);
    const alarmDustStart = collateralAt + 0.13;
    if (t >= demandsAt && t < demandsAt + 0.38) {
      drawBurst(ctx, t, { x: 950, y: 846 + sink * 55, seed: seed + 119, count: 8, kind: 'dust', start: demandsAt, life: 0.36, speed: 48, gravity: 24, drag: 1.3, size: 2, color: '#C7CDD0' });
    }
    drawClosingDrawer(ctx, endClose);
    if (t >= alarmDustStart && t < collateralAt + 0.56) {
      const p = pulsesAt(t, collateralAt);
      if (p > 0) {
        ctx.fillStyle = '#E1E4E6';
        ctx.fillRect(742, 374, Math.round(196 * p / GRID) * GRID, 4);
        ctx.fillRect(760, 386, Math.round(160 * p / GRID) * GRID, 4);
      }
    }
    ctx.restore();
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const demandsAt = eventAt(props, 'demands', dur * 0.31, dur), collateralAt = eventAt(props, 'collateral', dur * 0.57, dur);
    return ([
      { t: demandsAt, kind: 'thud', pan: 0.32, gain: 1.28 },
      { t: collateralAt, kind: 'clack', pan: -0.12, gain: 1.42 },
      { t: collateralAt + 0.18, kind: 'alarm', pan: -0.12, gain: 0.62, len: 0.2 },
    ] satisfies Cue[]).filter(cue => cue.t >= 0 && cue.t <= dur);
  },
};

function pulsesAt(t: number, start: number) {
  const pulses = [0, 0.18, 0.38, 0.58];
  return Math.max(0, ...pulses.map(offset => 1 - Math.abs(t - start - offset) / 0.075));
}
