import { clamp, ease, hash, type Cue, type Frame, type ShotProps } from '../core.ts';
import { drawHedgy } from '../actor/hedgy.ts';
import { createCameraRig } from '../fx/rig.ts';
import { drawBurst } from '../fx/particles.ts';
import { box, instances, merge, place, project, render3d, type InstanceTransform, type Material, type Mesh, type Vec3, type View3D } from '../three.ts';
import { drawTicket2D } from '../sets/ticket.ts';
import type { ShotDef } from './index.ts';

const RED_DARK = '#421210';
const RED_MID = '#A32B26';
const RED_HOT = '#FF5148';
const ARCH_MATERIALS: Material[] = [
  { ramp: 'ink', tone: .76 }, { ramp: 'steel', tone: .86, spec: .18 },
  { ramp: 'mono', tone: .71 }, { ramp: 'glass', tone: .94, emissive: .2 },
  { ramp: 'bone', tone: .78 },
];
const numberParam = (value: unknown, fallback: number) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const eventAt = (props: ShotProps, kind: string, dur: number, fallback: number) => {
  const found = props.events?.find(event => event.kind.toLowerCase() === kind.toLowerCase());
  return clamp(found ? found.at : dur * fallback, 0, dur);
};
const snap = (n: number) => Math.round(n / 4) * 4;

interface PathPoint { x: number; y: number; z: number }

function safePath(input: unknown): number[] {
  const list = Array.isArray(input) ? input.slice(0, 32).map(value => Number(value)).filter(Number.isFinite) : [];
  return list.length >= 2 ? list : [12, 15, 14, 19, 17, 24, 22, 30, 28, 38, 36, 48, 45, 60];
}

function makePath(values: number[], direction: 'up' | 'down'): PathPoint[] {
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  return values.map((value, index) => {
    const u = index / Math.max(1, values.length - 1), v = (value - lo) / span;
    const rise = u * 13.4 + v * .85;
    return {
      x: -2.8 + Math.sin(u * Math.PI * 5) * 1.55 + (v - .5) * .48,
      y: direction === 'up' ? .55 + rise : 14.35 - rise,
      z: -2.35,
    };
  });
}

function pointAt(points: readonly PathPoint[], position: number): PathPoint {
  const i = Math.min(points.length - 1, Math.floor(position)), j = Math.min(points.length - 1, i + 1), f = position - i;
  return { x: points[i]!.x + (points[j]!.x - points[i]!.x) * f, y: points[i]!.y + (points[j]!.y - points[i]!.y) * f, z: points[i]!.z + (points[j]!.z - points[i]!.z) * f };
}

function buildArchMesh(): Mesh {
  const pieces: Mesh[] = [];
  const steps = 18, xs = Array.from({ length: steps + 1 }, (_, i) => -5 + i * 10 / steps);
  const ys = xs.map(x => .16 + Math.abs(x) / 5 * .58);
  for (let i = 0; i < steps; i++) {
    const x0 = xs[i]!, x1 = xs[i + 1]!, y0 = ys[i]!, y1 = ys[i + 1]!, dx = x1 - x0, dy = y1 - y0;
    pieces.push(place(box(Math.hypot(dx, dy), .13, .18, 1), { pos: [(x0 + x1) / 2, (y0 + y1) / 2, 0], rot: [0, 0, Math.atan2(dy, dx)] }));
  }
  return merge(...pieces);
}

function architecture(): Array<{ mesh: Mesh; pos?: Vec3; materials?: Material[]; instances?: readonly InstanceTransform[] }> {
  const wall = box(12.2, 17.8, .28, 0);
  const platform = box(10.8, .22, 2.3, 1);
  const rail = box(10.4, .11, .16, 4);
  const seat = box(.34, .34, .46, 2);
  const windowFrame = merge(box(.86, .82, .16, 0), place(box(.58, .52, .08, 3), { pos: [0, .01, -.105] }), place(box(.78, .1, .07, 4), { pos: [0, .3, -.145] }));
  const arch = buildArchMesh();
  const floors: InstanceTransform[] = [], rails: InstanceTransform[] = [], seats: InstanceTransform[] = [], windows: InstanceTransform[] = [], arches: InstanceTransform[] = [];
  const floorsCount = 8;
  for (let level = 0; level < floorsCount; level++) {
    const y = level * 1.82 + .15;
    floors.push({ pos: [0, y, -.18] });
    rails.push({ pos: [0, y + .18, -1.38] });
    arches.push({ pos: [0, y, -1.18], rot: [0, level % 2 ? .035 : -.035, 0] });
    for (let col = 0; col < 17; col++) {
      const x = -4.6 + col * .575, aisle = col === 8 || col === 9;
      if (!aisle) seats.push({ pos: [x, y + .43 + ((col % 3) ? 0 : .04), -.77 + (col % 2) * .08], rot: [0, col % 2 ? .018 : -.018, 0], scale: .86 + (col % 4) * .035 });
    }
    windows.push({ pos: [-3.9, y + .68, -1.52] }, { pos: [3.9, y + .68, -1.52] });
  }
  return [
    { mesh: wall, pos: [0, 7.05, 1.45], materials: ARCH_MATERIALS },
    { mesh: box(.34, 18, .3, 1), pos: [-5.45, 7, .14], materials: ARCH_MATERIALS },
    { mesh: box(.34, 18, .3, 1), pos: [5.45, 7, .14], materials: ARCH_MATERIALS },
    instances(platform, floors, { materials: ARCH_MATERIALS }),
    instances(rail, rails, { materials: ARCH_MATERIALS }),
    instances(seat, seats, { materials: ARCH_MATERIALS }),
    instances(windowFrame, windows, { materials: ARCH_MATERIALS }),
    instances(arch, arches, { materials: ARCH_MATERIALS }),
    { mesh: box(.18, 14.5, .15, 1), pos: [-4.95, 6.8, -1.7], materials: ARCH_MATERIALS },
    { mesh: box(.18, 14.5, .15, 1), pos: [4.95, 6.8, -1.7], materials: ARCH_MATERIALS },
  ];
}

const VENUE = architecture();

function drawCity(ctx: Frame['ctx'], time: number, rise: number, seed: number) {
  ctx.fillStyle = '#090A0C'; ctx.fillRect(0, 0, 1080, 1290);
  // A remote skyline sinks below the balcony rim as the camera climbs.
  const base = 920 + rise * 430;
  for (let layer = 0; layer < 3; layer++) {
    const factor = [.22, .38, .58][layer]!, width = [92, 76, 58][layer]!;
    let cursor = -80 + Math.sin(time * .34 + layer) * 20;
    let n = 0;
    while (cursor < 1160) {
      const id = n + layer * 39, bw = width * (.46 + hash(id, seed + 2) * .48), bh = 160 + hash(id, seed + 5) * 320;
      const x = Math.round((cursor - rise * 32 * factor) / 4) * 4, y = base - bh * factor;
      ctx.fillStyle = layer === 0 ? '#191A1E' : layer === 1 ? '#202126' : '#2B2D32';
      ctx.fillRect(x, snap(y), snap(bw), snap(bh));
      ctx.fillStyle = layer === 2 ? '#5C6066' : '#3C3F44'; ctx.fillRect(x, snap(y), snap(bw), 6);
      for (let row = 0; row < Math.floor(bh / 38); row++) for (let col = 0; col < Math.floor(bw / 20); col++) {
        const key = id * 113 + row * 31 + col;
        if (hash(key, seed + 11) > .69) { ctx.fillStyle = hash(key, Math.floor(time * 4) + seed) > .5 ? '#A6A9AE' : '#777B81'; ctx.fillRect(x + 10 + col * 20, snap(y + 16 + row * 36), 8, 10); }
      }
      cursor += bw + 22 + layer * 16; n++;
    }
  }
  ctx.fillStyle = '#777B81'; ctx.fillRect(0, Math.min(1284, snap(base)), 1080, 6);
}

function partialPath(values: readonly PathPoint[], progress: number): PathPoint[] {
  const position = clamp(progress) * (values.length - 1), upto = Math.floor(position), current = pointAt(values, position);
  const out = values.slice(0, upto + 1).map(point => ({ ...point }));
  if (!out.length || Math.hypot(out.at(-1)!.x - current.x, out.at(-1)!.y - current.y) > .02) out.push(current);
  return out;
}

function drawPixelSegment(ctx: Frame['ctx'], a: { x: number; y: number }, b: { x: number; y: number }, color: string, width: number, alpha = 1) {
  let x = Math.round(a.x / 4), y = Math.round(a.y / 4), ex = Math.round(b.x / 4), ey = Math.round(b.y / 4);
  const dx = Math.abs(ex - x), sx = x < ex ? 1 : -1, dy = -Math.abs(ey - y), sy = y < ey ? 1 : -1;
  let err = dx + dy, guard = 0;
  ctx.fillStyle = color; ctx.globalAlpha *= alpha;
  while (guard++ < 4200) {
    ctx.fillRect(x * 4 - Math.floor(width / 2), y * 4 - Math.floor(width / 2), width, width);
    if (x === ex && y === ey) break;
    const e2 = err * 2;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
  ctx.globalAlpha /= alpha || 1;
}

function drawTrack(ctx: Frame['ctx'], line: readonly { x: number; y: number }[]) {
  if (!line.length) return;
  ctx.save();
  if (line.length > 1) {
    for (let i = 1; i < line.length; i++) drawPixelSegment(ctx, line[i - 1]!, line[i]!, RED_DARK, 36, .72);
    for (let i = 1; i < line.length; i++) drawPixelSegment(ctx, line[i - 1]!, line[i]!, RED_MID, 20, .96);
    for (let i = 1; i < line.length; i++) drawPixelSegment(ctx, line[i - 1]!, line[i]!, RED_HOT, 8, 1);
  }
  const head = line.at(-1)!;
  ctx.fillStyle = RED_DARK; ctx.fillRect(snap(head.x - 24), snap(head.y - 24), 48, 48);
  ctx.fillStyle = RED_HOT; ctx.fillRect(snap(head.x - 16), snap(head.y - 16), 32, 32);
  ctx.fillStyle = '#FFD1CB'; ctx.fillRect(snap(head.x - 4), snap(head.y - 4), 8, 8);
  ctx.restore();
}

function drawTether(ctx: Frame['ctx'], from: { x: number; y: number }, to: { x: number; y: number }, t: number, tight: boolean, seed: number) {
  const mid = tight ? { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 + Math.sin(t * 29 + seed) * 4 } : { x: (from.x + to.x) / 2 + 26, y: Math.max(from.y, to.y) + 68 };
  ctx.save(); ctx.strokeStyle = '#151619'; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(snap(from.x), snap(from.y)); ctx.lineTo(snap(mid.x), snap(mid.y)); ctx.lineTo(snap(to.x), snap(to.y)); ctx.stroke();
  ctx.strokeStyle = '#D0D2D6'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(snap(from.x), snap(from.y)); ctx.lineTo(snap(mid.x), snap(mid.y)); ctx.lineTo(snap(to.x), snap(to.y)); ctx.stroke(); ctx.restore();
}

function drawCityDropMarker(ctx: Frame['ctx'], x: number, y: number, t: number, alpha: number) {
  if (alpha <= .02) return;
  ctx.save(); ctx.globalAlpha *= alpha; ctx.fillStyle = '#08090A';
  ctx.beginPath(); ctx.moveTo(x - 66, y); ctx.lineTo(x + 54, y + 16); ctx.lineTo(x - 206, y + 440); ctx.lineTo(x - 304, y + 396); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#222429'; ctx.fillRect(snap(x - 65), snap(y - 12), 128, 16);
  // The shadow's stepped tail lengthens as the venue falls away beneath him.
  ctx.fillStyle = '#111215'; ctx.fillRect(snap(x - 304), snap(y + 388), 50, 8); ctx.globalAlpha /= alpha || 1; ctx.restore();
}

function drawWorldTicket(ctx: Frame['ctx'], point: { x: number; y: number }, t: number) {
  drawTicket2D(ctx, snap(point.x), snap(point.y), 78, { rot: Math.sin(t * 2.2) * .08 });
}

export const priceRideShot: ShotDef = {
  name: 'priceride',
  describe: 'A camera rides behind a self-drawing red price path through stacked venue balconies. Params: pathValues, colorDirection (red-up/red-down), riderActor, rideSpeed.',
  render(frame: Frame, props: ShotProps) {
    const { ctx, theme } = frame, dur = Math.max(.1, frame.dur), t = clamp(frame.t, 0, dur), params = props.params ?? {};
    const directionRaw = String(params.colorDirection ?? params.direction ?? 'red-up').toLowerCase();
    const direction: 'up' | 'down' = directionRaw.includes('down') ? 'down' : 'up';
    const values = safePath(params.pathValues ?? params.values);
    const world = makePath(values, direction), startAt = eventAt(props, 'climbs', dur, .18), lossAt = eventAt(props, 'losses', dur, .57);
    const requestedSpeed = clamp(numberParam(params.rideSpeed, 1), .65, 1.5);
    const rideDuration = clamp((lossAt - startAt + dur * .24) / requestedSpeed, dur * .42, dur * .78);
    const progress = ease.outCubic(clamp((t - startAt) / rideDuration));
    const traveled = partialPath(world, progress), headWorld = traveled.at(-1) ?? world[0]!;
    const sample = pointAt(world, Math.max(0, progress * (world.length - 1) - .85));
    const camX = headWorld.x + Math.sin(t * 2.3) * .07;
    const camY = headWorld.y;
    const rig = createCameraRig({ width: 1080, height: 1290, seed: frame.seed + 809, handheld: 1.15, hits: [lossAt], punch: .014, shake: 5, keyframes: [
      { t: 0, x: 0, y: 0, zoom: 1, rot: 0 },
      { t: dur * .42, x: 12, y: -4, zoom: 1.015, rot: -.002, ease: 'inOut' },
      { t: dur, x: -8, y: 5, zoom: 1.04, rot: .003, ease: 'out' },
    ] });
    const target: Vec3 = [camX, camY - .92, -.8];
    const view: View3D = {
      x: 0, y: 0, w: 1080, h: 1290, zoom: 290, cell: 4, fov: 42,
      position: [camX - .36, camY - 1.8, -12.2], target, light: [-.5, .76, -.44], ambient: .43, rim: .5,
      outline: true, fog: { near: 9, far: 24 },
    };
    const screenPath = traveled.map(point => project(view, [point.x, point.y, point.z]));
    const head = screenPath.at(-1) ?? project(view, [headWorld.x, headWorld.y, headWorld.z]);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 1080, 1290); ctx.clip(); ctx.imageSmoothingEnabled = false;
    ctx.save(); rig.apply(ctx, t);
    drawCity(ctx, t, progress, frame.seed);
    // Small suspended lights and a dithered concrete haze keep the far chamber alive.
    for (let i = 0; i < 72; i++) {
      const x = Math.floor(hash(i, frame.seed + 42) * 1080 / 4) * 4;
      const y = Math.floor(hash(i, frame.seed + 51) * 660 / 4) * 4;
      ctx.fillStyle = hash(i, frame.seed + Math.floor(t * 2)) > .62 ? '#696D73' : '#35383D';
      ctx.fillRect(x, y, i % 8 === 0 ? 8 : 4, 4);
    }
    const objects = VENUE.map(object => ({ ...object }));
    render3d(ctx, theme, view, objects);
    // Lens-close balcony bars create strong depth parallax as the camera passes each tier.
    const passLevel = Math.floor(camY / 1.82), passY = passLevel * 1.82 + 1.1;
    const nearRailA = project(view, [-6.2, passY - .34, -4.2]), nearRailB = project(view, [6.2, passY - .34, -4.2]);
    const nearRailTopA = project(view, [-6.2, passY - .48, -4.2]), nearRailTopB = project(view, [6.2, passY - .48, -4.2]);
    ctx.fillStyle = '#15171A'; ctx.beginPath(); ctx.moveTo(nearRailTopA.x, nearRailTopA.y); ctx.lineTo(nearRailTopB.x, nearRailTopB.y); ctx.lineTo(nearRailB.x, nearRailB.y); ctx.lineTo(nearRailA.x, nearRailA.y); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#B5B8BD'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(snap(nearRailTopA.x), snap(nearRailTopA.y)); ctx.lineTo(snap(nearRailTopB.x), snap(nearRailTopB.y)); ctx.stroke();
    drawTrack(ctx, screenPath);
    // A crisp tail spark is tied to the first spoken climb beat.
    drawBurst(ctx, t, { x: head.x, y: head.y, start: startAt, life: .42, count: 16, kind: 'spark', seed: frame.seed + 117, speed: 190, gravity: 28, drag: .8, size: 5, color: RED_HOT, cell: 4 });
    const hxWorld: PathPoint = { x: headWorld.x + 2.65, y: headWorld.y - 6.1, z: -.9 };
    const hedgyFeet = project(view, [hxWorld.x, hxWorld.y, hxWorld.z]);
    const hedgyX = clamp(snap(hedgyFeet.x), 175, 910), hedgyY = clamp(snap(hedgyFeet.y), 820, 1160);
    const shadowAlpha = clamp((t - lossAt + .12) / .34);
    drawCityDropMarker(ctx, hedgyX + 8, hedgyY - 5, t, shadowAlpha * .58);
    const tetherFrom = { x: hedgyX - 50, y: hedgyY - 176 };
    const stub = project(view, [sample.x, sample.y, sample.z - .18]);
    const tight = t >= lossAt;
    drawTether(ctx, tetherFrom, { x: stub.x, y: stub.y }, t, tight, frame.seed);
    drawWorldTicket(ctx, stub, t);
    const riderOption = String(params.riderActor ?? params.rider ?? 'hedgy').toLowerCase();
    if (riderOption !== 'none' && riderOption !== 'false') {
      const shocked = t >= lossAt;
      drawHedgy(ctx, {
        x: hedgyX, y: hedgyY, scale: 3.5, t: Math.max(0, t - (shocked ? lossAt : 0)),
        pose: shocked ? 'shock' : 'think', facing: -1, look: 'up', expression: shocked ? 'shocked' : 'neutral', prop: 'none',
      });
    }
    // Glowing path head is drawn last so it stays sharp above the rib highlights.
    drawTrack(ctx, [head]);
    ctx.restore(); ctx.restore();
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const d = Math.max(.1, dur), climb = eventAt(props, 'climbs', d, .18), loss = eventAt(props, 'losses', d, .57);
    const cues: Cue[] = [
      { t: climb, kind: 'servo', gain: .65, len: Math.min(.72, d * .38), pan: 0 },
      { t: climb + .08, kind: 'rise', gain: .53, len: Math.min(.66, d * .34), pan: .08 },
      { t: climb + .18, kind: 'sparkle', gain: .58, pan: 0 },
      { t: loss, kind: 'heartbeat', gain: .8, pan: .28 },
      { t: Math.min(d, loss + .17), kind: 'heartbeat', gain: 1, pan: .28 },
      { t: loss, kind: 'impact', gain: .46, pan: .26 },
      { t: loss + .04, kind: 'squeak', gain: .36, pan: .32 },
    ];
    return cues.filter(cue => cue.t >= 0 && cue.t <= d);
  },
};
