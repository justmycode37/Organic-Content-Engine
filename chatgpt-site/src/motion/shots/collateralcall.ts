import { clamp, type Cue, type Frame, type ShotProps } from '../core.ts';
import { ASSETS } from '../assets/index.ts';
import { drawHedgy } from '../actor/hedgy.ts';
import { drawEnv } from '../env/index.ts';
import { createCameraRig } from '../fx/rig.ts';
import { drawBurst } from '../fx/particles.ts';
import { pixelText } from '../prim.ts';
import { TICKET_MATERIALS, ticketMesh } from '../sets/ticket.ts';
import { box, cylinder, merge, place, render3d, sphere, type Mesh, type Object3D } from '../three.ts';
import type { ShotDef } from './index.ts';

const SCALE = ASSETS['balance-scale']({ detail: 0.85 });
const CASH = ASSETS['banknote-bundle']({ count: 4 });
const TICKET = ticketMesh();
const TICKET_SCALE = 0.43;
const PRICE_TRACE: Mesh = merge(
  place(box(0.24, 0.07, 0.035, 0), { pos: [-0.55, -0.25, 0.1], rot: [0, 0, 0.03] }),
  place(box(0.26, 0.07, 0.035, 0), { pos: [-0.32, -0.17, 0.1], rot: [0, 0, 0.22] }),
  place(box(0.25, 0.07, 0.035, 0), { pos: [-0.09, -0.09, 0.1], rot: [0, 0, -0.14] }),
  place(box(0.27, 0.07, 0.035, 0), { pos: [0.15, 0.01, 0.1], rot: [0, 0, 0.34] }),
  place(box(0.27, 0.07, 0.035, 0), { pos: [0.39, 0.13, 0.1], rot: [0, 0, -0.08] }),
);
const RED_MATERIAL = [{ ramp: 'red' as const, tone: 1, emissive: 0.88, unlit: true }];
const GRID = 4;

const eventAt = (props: ShotProps, kind: string, fallback: number, dur: number) => {
  const event = props.events?.find(item => item.kind.toLowerCase() === kind);
  return clamp(Number.isFinite(event?.at) ? event!.at : fallback, 0, dur);
};
const progress = (t: number, start: number, end: number) => clamp((t - start) / Math.max(0.001, end - start));
const easeOut = (value: number) => 1 - (1 - clamp(value)) ** 3;
const label = (value: unknown, fallback: string, max = 12) => String(value ?? fallback).trim().toUpperCase().replace(/\s+/g, ' ').slice(0, max) || fallback;

function scaleObjects(sink: number): Object3D[] {
  const unit = 1.42, angle = -0.19 * sink, pivotY = 0.43, centerX = 0.48, depth = -1.15;
  const at = (x: number, y: number, z = depth): [number, number, number] => [centerX + x * unit, y * unit, z * unit];
  const objects: Object3D[] = [];
  // Keep the shared asset's base, upright and pivot; build its moving pieces as clear, individually posed parts.
  for (const name of ['weighted-base', 'pedestal', 'central-pivot', 'top-finial']) {
    const part = SCALE.parts.find(candidate => candidate.name === name)!;
    objects.push({ mesh: part.mesh, pos: at(part.pos?.[0] ?? 0, part.pos?.[1] ?? 0), rot: part.rot, scale: unit, materials: SCALE.materials });
  }
  objects.push({ mesh: box(2.45, 0.12, 0.18, 1), pos: at(0, pivotY), rot: [0, 0, angle], scale: unit, materials: SCALE.materials });
  objects.push({ mesh: sphere(0.11, 14, 8, 2), pos: at(-1.12 * Math.cos(angle), pivotY - 1.12 * Math.sin(angle), depth - 0.08), scale: unit, materials: SCALE.materials });
  objects.push({ mesh: sphere(0.11, 14, 8, 2), pos: at(1.12 * Math.cos(angle), pivotY + 1.12 * Math.sin(angle), depth - 0.08), scale: unit, materials: SCALE.materials });
  for (const side of [-1, 1] as const) {
    const sideName = side < 0 ? 'left' : 'right';
    const endY = pivotY + side * 1.02 * Math.sin(angle);
    const sideSink = side > 0 ? sink * 0.48 : -sink * 0.13;
    const chainLength = 0.62 + (side > 0 ? sink * 0.5 : 0);
    const chainY = endY - chainLength / 2;
    const panY = endY - chainLength - 0.06 + sideSink;
    const endX = side * 1.02 * Math.cos(angle);
    for (const z of [-0.2, 0.2]) objects.push({ mesh: cylinder(0.025, 0.62, 8, 2), pos: at(endX, chainY, depth + z), scale: [unit, unit * chainLength / 0.62, unit], materials: SCALE.materials });
    objects.push({ mesh: cylinder(0.56, 0.1, 28, 1, 1, 0.38), pos: at(endX, panY, depth), scale: unit, materials: SCALE.materials });
    if (side < 0) {
      objects.push({ mesh: CASH.mesh, pos: at(endX, panY + 0.19, depth - 0.04), scale: 0.26 * unit, materials: CASH.materials });
    } else {
      const ticketPos = at(endX, panY + 0.15, depth - 0.08);
      objects.push({ mesh: TICKET, pos: ticketPos, scale: TICKET_SCALE, materials: TICKET_MATERIALS });
      objects.push({ mesh: PRICE_TRACE, pos: ticketPos, scale: TICKET_SCALE, materials: RED_MATERIAL });
      // A compact steel counterweight makes the obligation visibly heavier than the notes.
      objects.push({ mesh: box(0.34, 0.19, 0.28, 0), pos: at(endX - 0.18, panY + 0.14, depth + 0.18), scale: unit, materials: [{ ramp: 'steel', tone: 0.84, spec: 0.65 }] });
    }
  }
  return objects;
}

function drawWall(ctx: Frame['ctx'], theme: Frame['theme'], t: number, unfold: number) {
  const open = easeOut(unfold);
  ctx.fillStyle = '#101214'; ctx.fillRect(172, 322, 736, 540);
  ctx.fillStyle = '#343A3E'; ctx.fillRect(192, 342, 696, 502);
  ctx.fillStyle = '#171A1D'; ctx.fillRect(216, 366, 648, 462);
  // Tall folded steel leaves swing out from the venue wall.
  const wing = Math.round(188 * open / GRID) * GRID;
  ctx.fillStyle = '#454B50'; ctx.fillRect(192 - wing, 416, wing, 360);
  ctx.fillRect(888, 416, wing, 360);
  ctx.fillStyle = '#AAB1B5'; ctx.fillRect(192 - wing, 416, wing, 8); ctx.fillRect(888, 416, wing, 8);
  ctx.fillStyle = '#858C91'; ctx.fillRect(188, 390, 8, 425); ctx.fillRect(884, 390, 8, 425);
  for (let i = 0; i < 7; i++) {
    const y = 444 + i * 48;
    ctx.fillStyle = i % 2 ? '#25292D' : '#202428';
    ctx.fillRect(240, y, 600, 8);
    ctx.fillStyle = i % 2 ? '#555C61' : '#3D4449';
    ctx.fillRect(240, y + 8, 600, 4);
  }
  const pulse = Math.sin(t * 9) > 0.88 ? 1 : 0;
  ctx.fillStyle = pulse ? '#E6E8E9' : '#858B90';
  ctx.fillRect(220, 360, 10, 60);
  ctx.fillRect(850, 360, 10, 60);
  ctx.fillStyle = theme.dim;
  for (let i = 0; i < 5; i++) ctx.fillRect(252 + i * 132, 390, 4, 12);
}

function drawCounter(ctx: Frame['ctx'], theme: Frame['theme'], t: number, drawerProgress: number, demand: string, asksAt: number) {
  // A deep, extruded counter front and a bright steel lip frame the scale behind it.
  ctx.fillStyle = '#090A0C'; ctx.fillRect(0, 894, 1080, 396);
  ctx.fillStyle = '#30363A'; ctx.fillRect(0, 862, 1080, 38);
  ctx.fillStyle = '#C1C6C9'; ctx.fillRect(0, 858, 1080, 8);
  ctx.fillStyle = '#1C2023'; ctx.fillRect(0, 900, 1080, 18);
  ctx.fillStyle = '#52595E'; ctx.fillRect(0, 920, 1080, 10);
  ctx.fillStyle = '#24282B'; ctx.fillRect(0, 930, 1080, 360);
  for (let i = 0; i < 15; i++) {
    const x = i * 76;
    ctx.fillStyle = '#363D42'; ctx.fillRect(x, 936, 4, 326);
    ctx.fillStyle = '#111416'; ctx.fillRect(x + 4, 936, 5, 326);
  }
  // Drawer telescopes out at the collateral call, with rails visible in the gap.
  const open = easeOut(drawerProgress), x = 510 - 52 * open, y = 986 + 40 * open;
  ctx.fillStyle = '#090B0D'; ctx.fillRect(364, 968, 440, 94);
  ctx.fillStyle = '#747D82'; ctx.fillRect(380, 960, 400, 12);
  ctx.fillRect(380, 1058, 400, 10);
  ctx.fillStyle = '#565E63'; ctx.fillRect(x - 12, y - 9, 440, 92);
  ctx.fillStyle = '#A1A8AC'; ctx.fillRect(x - 12, y - 9, 440, 8);
  ctx.fillStyle = '#252A2E'; ctx.fillRect(x, y, 416, 68);
  ctx.fillStyle = '#C1C6C9'; ctx.fillRect(x, y, 416, 6);
  ctx.fillStyle = '#727A7F'; ctx.fillRect(x + 24, y + 18, 112, 32);
  ctx.fillStyle = '#171A1C'; ctx.fillRect(x + 32, y + 24, 96, 20);
  pixelText(ctx, demand, x + 80, y + 25, demand.length > 7 ? 2 : 3, { color: theme.fg, align: 'center' });
  ctx.fillStyle = '#D8DCDE'; ctx.fillRect(x + 300, y + 20, 56, 12);
  ctx.fillStyle = '#33383C'; ctx.fillRect(x + 312, y + 32, 32, 8);

  const bellHit = Math.max(0, 1 - (t - asksAt) / 0.24);
  const bellRock = (t >= asksAt && t < asksAt + 0.24) ? Math.sin((t - asksAt) * 76) * bellHit * 7 : 0;
  ctx.save(); ctx.translate(842, 856); ctx.rotate(bellRock * Math.PI / 180);
  ctx.fillStyle = '#15181A'; ctx.fillRect(-42, 18, 84, 14);
  ctx.fillStyle = '#A6ADB1'; ctx.fillRect(-34, 12, 68, 8);
  ctx.fillStyle = '#646C71'; ctx.fillRect(-28, -8, 56, 22);
  ctx.fillStyle = '#E2E5E7'; ctx.fillRect(-18, -26, 36, 20);
  ctx.fillStyle = '#71797E'; ctx.fillRect(-9, -36, 18, 12);
  ctx.fillStyle = '#CDD2D5'; ctx.fillRect(-5, -43, 10, 8);
  ctx.restore();
  ctx.fillStyle = theme.line;
  for (let i = 0; i < 10; i++) ctx.fillRect(40 + i * 108, 1238, 42, 4);
}

export const collateralCallShot: ShotDef = {
  name: 'collateralcall',
  describe: 'A steel broker counter unfolds around an animated balance scale as Hedgy is called for more collateral. params.demand changes the drawer label (default MORE).',
  render(frame: Frame, props: ShotProps) {
    const { ctx, theme, seed } = frame, dur = Math.max(0.01, frame.dur), t = clamp(frame.t, 0, dur);
    const asksAt = eventAt(props, 'asks', dur * 0.32, dur);
    const collateralAt = eventAt(props, 'collateral', dur * 0.66, dur);
    const unfold = progress(t, 0.02, Math.min(dur * 0.28, 0.42));
    const drawer = progress(t, collateralAt, collateralAt + Math.min(0.26, dur * 0.18));
    const sink = easeOut(progress(t, collateralAt, collateralAt + Math.min(0.42, dur * 0.28)));
    const demand = label(props.params?.demand ?? props.params?.requiredCollateral, 'MORE', 12);
    const rig = createCameraRig({
      width: 1080, height: 1290, seed: seed + 81, handheld: 3.2,
      keyframes: [
        { t: 0, x: -14, y: 5, zoom: 1, rot: 0 },
        { t: dur * 0.46, x: 2, y: -3, zoom: 1.025, rot: 0, ease: 'inOut' },
        { t: dur, x: 30, y: 8, zoom: 1.09, rot: 0.004, ease: 'in' },
      ], hits: [asksAt, collateralAt], punch: 0.012, shake: 7,
    });
    const pose = rig.poseAt(t), camera = rig.view3D(t);
    ctx.imageSmoothingEnabled = false;
    drawEnv(ctx, { type: 'exchange', t, theme, seed: seed + 5, width: 1080, height: 1290, camera: { x: pose.x * 0.28, y: pose.y * 0.24, zoom: pose.zoom, rot: pose.rot, yaw: camera.yaw, pitch: camera.pitch } });
    ctx.save(); rig.apply(ctx, t);
    drawWall(ctx, theme, t, unfold);
    render3d(ctx, theme, {
      x: 122, y: 230, w: 910, h: 790, zoom: 100, yaw: camera.yaw + 0.12, pitch: 0.34 + camera.pitch * 0.22,
      distance: 6.8, target: [camera.target[0], camera.target[1] + 0.17, camera.target[2]], cell: 4, outline: true, light: [-0.5, 0.78, -0.46], ambient: 0.4, rim: 0.48,
      ground: { y: -2.2, shadow: 0.54, grid: false }, fog: { near: 7, far: 15, color: '#16191B' },
    }, scaleObjects(sink));
    drawCounter(ctx, theme, t, drawer, demand, asksAt);
    drawHedgy(ctx, { x: 246, y: 1188, scale: 5.05, t, pose: t < collateralAt ? 'sweat' : 'shock', look: 'up', expression: 'worried' });
    // Hedgy's pouch turns inside-out exactly on the word “collateral.”
    const pouchOpen = easeOut(progress(t, collateralAt - 0.12, collateralAt + 0.18));
    ctx.save(); ctx.translate(330, 1112); ctx.rotate(-0.13 + pouchOpen * 0.62);
    ctx.fillStyle = '#08090A'; ctx.fillRect(-42, -33, 84, 54); ctx.fillRect(-34, 19, 68, 14); ctx.fillRect(-24, 33, 48, 8);
    ctx.fillStyle = '#777E82'; ctx.fillRect(-37, -29, 74, 46); ctx.fillRect(-29, 17, 58, 14); ctx.fillRect(-20, 31, 40, 7);
    ctx.fillStyle = '#D0D5D7'; ctx.fillRect(-42, -38, 84, 14);
    ctx.fillStyle = '#25292C'; ctx.fillRect(-31, -32, 62, 18);
    ctx.fillStyle = '#989FA3'; ctx.fillRect(-20, 23, 40, 5);
    ctx.fillStyle = '#B7BEC2'; ctx.fillRect(-45, -26, 5, 12); ctx.fillRect(40, -26, 5, 12);
    ctx.restore();
    if (t >= collateralAt && t < collateralAt + 0.42) drawBurst(ctx, t, { x: 414, y: 1005, seed: seed + 119, count: 10, kind: 'dust', start: collateralAt, life: 0.42, speed: 70, gravity: 20, drag: 1.2, size: 2, color: theme.dim });
    // Alarm strip flashes briefly after the drawer's demand lands.
    if (t >= collateralAt + 0.13 && t < collateralAt + 0.42 && Math.sin((t - collateralAt) * 38) > 0.1) {
      ctx.fillStyle = theme.fg; ctx.fillRect(420, 402, 240, 7); ctx.fillRect(430, 414, 220, 4);
    }
    ctx.restore();
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const asksAt = eventAt(props, 'asks', dur * 0.32, dur), collateralAt = eventAt(props, 'collateral', dur * 0.66, dur);
    const cues = ([
      { t: asksAt, kind: 'ding', pan: 0.48, gain: 0.72 },
      { t: collateralAt, kind: 'clack', pan: 0.36, gain: 0.9 },
      { t: Math.min(dur, collateralAt + 0.06), kind: 'servo', pan: -0.12, gain: 0.72 },
      { t: Math.min(dur, collateralAt + 0.2), kind: 'alarm', pan: -0.08, gain: 0.48, len: 0.16 },
    ] satisfies Cue[]).filter(cue => cue.t >= 0 && cue.t <= dur);
    return cues;
  },
};
