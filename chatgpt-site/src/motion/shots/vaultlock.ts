import { clamp, lerp, type Cue, type Frame, type ShotProps } from '../core.ts';
import { drawHedgy } from '../actor/hedgy.ts';
import { ASSETS, type AssetModel } from '../assets/index.ts';
import { drawEnv } from '../env/index.ts';
import { drawBurst } from '../fx/particles.ts';
import { createCameraRig } from '../fx/rig.ts';
import { pixelText } from '../prim.ts';
import { ticketMesh, TICKET_MATERIALS } from '../sets/ticket.ts';
import { box, merge, place, project, render3d, type Material, type Mesh, type Object3D } from '../three.ts';
import type { ShotDef } from './index.ts';

const W = 1080;
const H = 1290;
const ROOM_MATERIALS: Material[] = [
  { ramp: 'steel', tone: 1.08, spec: 0.44, emissive: 0.035 },
  { ramp: 'chrome', tone: 1.12, spec: 0.84, emissive: 0.075 },
  { ramp: 'bone', tone: 1.04, spec: 0.32, emissive: 0.045 },
  { ramp: 'glass', tone: 0.88, spec: 0.86, emissive: 0.16 },
  { ramp: 'ink', tone: 0.82, emissive: 0.06 },
  { ramp: 'paper', tone: 1.08, emissive: 0.09, spec: 0.25 },
  { ramp: 'mono', tone: 1.08, emissive: 0.06, spec: 0.32 },
];
const DOOR_MATERIALS: Material[] = [
  { ramp: 'steel', tone: 1.1, spec: 0.64, emissive: 0.06 },
  { ramp: 'steel', tone: 0.94, spec: 0.72, emissive: 0.045 },
  { ramp: 'chrome', tone: 1.08, spec: 0.92, emissive: 0.09 },
  { ramp: 'glass', tone: 1.0, spec: 0.95, emissive: 0.13 },
  { ramp: 'ink', tone: 0.94, emissive: 0.09 },
  { ramp: 'paper', tone: 1.04, emissive: 0.055 },
  { ramp: 'mono', tone: 1.08, spec: 0.55, emissive: 0.05 },
];
const CASH_MATERIALS: Material[] = [
  { ramp: 'paper', tone: 1.14, spec: 0.32, emissive: 0.12 },
  { ramp: 'steel', tone: 1.05, spec: 0.3, emissive: 0.035 },
  { ramp: 'chrome', tone: 1.18, spec: 0.74, emissive: 0.08 },
  { ramp: 'glass', tone: 0.86, spec: 0.72, emissive: 0.08 },
  { ramp: 'ink', tone: 1.0, emissive: 0.08 },
  { ramp: 'paper', tone: 1.18, spec: 0.28, emissive: 0.11 },
  { ramp: 'brown', tone: 0.82, spec: 0.18, emissive: 0.02 },
  { ramp: 'red', tone: 0.65, spec: 0.12 },
  { ramp: 'green', tone: 0.65, spec: 0.12 },
  { ramp: 'mono', tone: 1.08, spec: 0.36, emissive: 0.07 },
  { ramp: 'paper', tone: 1.2, emissive: 0.16, unlit: true },
];
const ROOM_MESH: Mesh = merge(
  place(box(3.82, 3.76, 0.3, 4), { pos: [0, 0.18, 1.82] }),
  place(box(0.2, 3.95, 2.32, 1), { pos: [-1.9, 0.18, 0.65] }),
  place(box(0.2, 3.95, 2.32, 1), { pos: [1.9, 0.18, 0.65] }),
  place(box(3.98, 0.2, 2.32, 1), { pos: [0, 2.06, 0.65] }),
  place(box(3.98, 0.2, 2.32, 1), { pos: [0, -1.7, 0.65] }),
  place(box(3.42, 0.19, 1.6, 0), { pos: [0, -0.75, 0.68] }),
  place(box(3.52, 0.065, 0.05, 2), { pos: [0, -0.635, -0.14] }),
  place(box(3.42, 0.07, 0.05, 2), { pos: [0, 0.35, -0.12] }),
  place(box(0.12, 1.03, 0.05, 2), { pos: [-1.66, -0.15, -0.1] }),
  place(box(0.12, 1.03, 0.05, 2), { pos: [1.66, -0.15, -0.1] }),
  place(box(3.05, 0.11, 1.2, 2), { pos: [0, 0.42, 0.72] }),
  place(box(2.9, 0.12, 1.2, 2), { pos: [0, -0.15, 0.72] }),
  place(box(2.62, 0.1, 1.2, 2), { pos: [0, -0.72, 0.72] }),
  place(box(2.08, 0.065, 0.035, 1), { pos: [0, 0.505, 0.1] }),
  place(box(1.94, 0.065, 0.035, 1), { pos: [0, -0.065, 0.1] }),
);
const CASH_MODEL = ASSETS['banknote-bundle']({ detail: 1, count: 9, seed: 47 });
const TICKET = ticketMesh();
const ASSET_FACTORIES = ASSETS as unknown as Record<string, (options?: { detail?: number; count?: number; seed?: number }) => AssetModel>;
const MODEL_CACHE = new Map<string, AssetModel>();
const DOOR_MODEL = ASSETS['vault-door']({ detail: 1.12, seed: 53 });
const DOOR_BASE: Mesh = merge(...DOOR_MODEL.parts
  .filter(part => !['wheel', 'wheel-hub', 'wheel-spokes'].includes(part.name))
  .map(part => place(part.mesh, { pos: part.pos, rot: part.rot, ...(part.scale === undefined ? {} : { scale: part.scale }) })));
const DOOR_WHEEL = DOOR_MODEL.parts.find(part => part.name === 'wheel')!;
const DOOR_HUB = DOOR_MODEL.parts.find(part => part.name === 'wheel-hub')!;
const DOOR_SPOKES = DOOR_MODEL.parts.find(part => part.name === 'wheel-spokes')!;
const DOOR_POS: [number, number, number] = [2.05, 0.16, -2.72];
const DOOR_SCALE = 2.12;

function modelFor(name: string): AssetModel | undefined {
  const factory = ASSET_FACTORIES[name];
  if (!factory) return undefined;
  let model = MODEL_CACHE.get(name);
  if (!model) {
    model = factory({ detail: 0.9, count: 8, seed: 47 });
    MODEL_CACHE.set(name, model);
  }
  return model;
}

function eventTime(props: ShotProps, kind: string, dur: number, fallback: number): number {
  const at = props.events?.find(event => String(event.kind).toLowerCase() === kind)?.at;
  return clamp(Number.isFinite(at) ? at! : dur * fallback, 0, dur);
}

function pixelLine(ctx: Frame['ctx'], x0: number, y0: number, x1: number, y1: number, color: string, size = 6) {
  let x = Math.round(x0 / 4), y = Math.round(y0 / 4);
  const bx = Math.round(x1 / 4), by = Math.round(y1 / 4);
  const dx = Math.abs(bx - x), sx = x < bx ? 1 : -1;
  const dy = -Math.abs(by - y), sy = y < by ? 1 : -1;
  let error = dx + dy;
  ctx.fillStyle = color;
  for (let guard = 0; guard < 2000; guard++) {
    ctx.fillRect(x * 4 - size / 2, y * 4 - size / 2, size, size);
    if (x === bx && y === by) break;
    const twice = 2 * error;
    if (twice >= dy) { error += dy; x += sx; }
    if (twice <= dx) { error += dx; y += sy; }
  }
}

function pixelDisc(ctx: Frame['ctx'], cx: number, cy: number, radius: number, color: string) {
  ctx.fillStyle = color;
  for (let y = -radius; y <= radius; y += 4) {
    const half = Math.floor(Math.sqrt(Math.max(0, radius * radius - y * y)) / 4) * 4;
    ctx.fillRect(Math.round((cx - half) / 4) * 4, Math.round((cy + y) / 4) * 4, half * 2, 4);
  }
}

function drawWheel(ctx: Frame['ctx'], center: { x: number; y: number }, t: number, lockedAt: number, radius: number) {
  const close = clamp((t - (lockedAt - 0.3)) / 0.3);
  const angle = (1 - close) * (t * 2.8 + 1.9);
  pixelDisc(ctx, center.x, center.y, radius + 12, '#141719');
  ctx.strokeStyle = '#C9D0D4'; ctx.lineWidth = 8;
  for (const r of [radius, radius - 17, Math.max(10, radius - 34)]) {
    for (let i = 0; i < 56; i++) {
      const a = i * Math.PI * 2 / 56;
      ctx.fillStyle = i % 3 === 0 ? '#E0E5E8' : '#68727A';
      ctx.fillRect(Math.round((center.x + Math.cos(a) * r) / 4) * 4, Math.round((center.y + Math.sin(a) * r) / 4) * 4, 8, 8);
    }
  }
  for (let i = 0; i < 6; i++) {
    const a = angle + i * Math.PI / 3;
    pixelLine(ctx, center.x, center.y, center.x + Math.cos(a) * (radius - 22), center.y + Math.sin(a) * (radius - 22), '#B9C2C7', 12);
    const hx = center.x + Math.cos(a) * (radius + 7), hy = center.y + Math.sin(a) * (radius + 7);
    pixelDisc(ctx, hx, hy, 10, '#E2E6E8');
  }
  pixelDisc(ctx, center.x, center.y, 20, '#E0E5E8');
  pixelDisc(ctx, center.x, center.y, 9, '#373E43');
}

function drawGlass(ctx: Frame['ctx'], view: Parameters<typeof project>[0], t: number, dur: number, actorZ: number, push: number) {
  const z = actorZ - 0.48;
  const left = project(view, [-3.22, -1.62, z]);
  const right = project(view, [0.16, -1.62, z]);
  const rightTop = project(view, [0.16, 2.04, z]);
  const leftTop = project(view, [-3.22, 2.04, z]);
  const points = [left, right, rightTop, leftTop].map(p => [Math.round(p.x / 4) * 4, Math.round(p.y / 4) * 4] as [number, number]);
  ctx.save();
  ctx.beginPath(); ctx.moveTo(points[0]![0], points[0]![1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i]![0], points[i]![1]);
  ctx.closePath();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#BCC6CB'; ctx.fill();
  ctx.globalAlpha = 0.82;
  ctx.lineWidth = 12; ctx.strokeStyle = '#9DA8AE'; ctx.stroke();
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 4; ctx.strokeStyle = '#E2E7E9'; ctx.stroke();
  ctx.clip();
  const bounds = points.reduce((r, point) => ({
    minX: Math.min(r.minX, point[0]), maxX: Math.max(r.maxX, point[0]),
    minY: Math.min(r.minY, point[1]), maxY: Math.max(r.maxY, point[1]),
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
  const sweep = Math.round((t / Math.max(0.05, dur) * 96 + push * 360) / 4) * 4;
  ctx.globalAlpha = 0.26 + push * 0.28;
  for (let i = -3; i < 8; i++) {
    const x = bounds.minX + i * 118 + sweep;
    ctx.fillStyle = i % 2 === 0 ? '#E5EAEC' : '#727E85';
    ctx.beginPath();
    ctx.moveTo(x, bounds.maxY); ctx.lineTo(x + 30 + push * 112, bounds.maxY);
    ctx.lineTo(x + 292 + push * 220, bounds.minY); ctx.lineTo(x + 268, bounds.minY);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function stencilLabel(ctx: Frame['ctx'], label: string, anchor: { x: number; y: number }) {
  const text = String(label || 'COLLATERAL').trim().replace(/[^a-z0-9 -]/gi, '').slice(0, 13).toUpperCase() || 'COLLATERAL';
  const width = Math.min(330, Math.max(180, text.length * 24 + 52));
  const x = clamp(anchor.x - 150, width / 2 + 54, W - width / 2 - 148);
  const y = clamp(anchor.y, 250, 1120);
  ctx.fillStyle = '#20262A'; ctx.fillRect(x - width / 2, y - 25, width, 50);
  ctx.fillStyle = '#D5DADD'; ctx.fillRect(x - width / 2 + 8, y - 20, width - 16, 4);
  ctx.fillStyle = '#080A0B'; ctx.fillRect(x - width / 2 + 8, y + 16, width - 16, 4);
  for (const dx of [-width / 2 + 14, width / 2 - 14]) {
    ctx.fillStyle = '#E0E4E6'; ctx.fillRect(x + dx - 3, y - 3, 6, 6);
  }
  pixelText(ctx, text, x, y - 14, 4, { color: '#F0F2F3', align: 'center' });
}

export const vaultLockShot: ShotDef = {
  name: 'vaultlock',
  describe: 'A monumental vault door seals sale proceeds as Hedgy reaches through a thick glass collateral chamber; params.what/locked selects the collateral asset, label sets the face stencil (default COLLATERAL).',
  render(frame: Frame, props: ShotProps) {
    const { ctx, theme, seed } = frame;
    const dur = Math.max(0.05, frame.dur);
    const t = clamp(frame.t, 0, dur);
    const p = props.params ?? {};
    const lockedName = typeof p.locked === 'string' ? p.locked : typeof p.what === 'string' ? p.what : 'banknote-bundle';
    const lockedModel = modelFor(lockedName) ?? (lockedName === 'ticket' ? undefined : CASH_MODEL);
    const label = typeof p.label === 'string' ? p.label : 'COLLATERAL';
    const moneyAt = eventTime(props, 'money', dur, 0.28);
    const lockedAt = eventTime(props, 'locked', dur, 0.67);
    const pushAt = Math.min(dur, lockedAt + dur * 0.075);
    const push = clamp((t - pushAt) / Math.max(0.22, dur * 0.22));
    const rig = createCameraRig({
      width: W, height: H, seed: seed + 47, handheld: 2.8,
      keyframes: [
        { t: 0, x: -6, y: 8, zoom: 0.97, rot: -0.006 },
        { t: dur * 0.38, x: -20, y: 16, zoom: 1.015, rot: 0.012 },
        { t: dur * 0.68, x: 20, y: -10, zoom: 1.07, rot: 0.028 },
        { t: dur, x: -4, y: -36, zoom: 1.16, rot: 0.002 },
      ],
      hits: [lockedAt], punch: 0.038, shake: 6.5,
    });
    const camera = rig.view3D(t);
    const view = {
      x: 0, y: 0, w: W, h: H, zoom: 360,
      yaw: camera.yaw + lerp(-0.08, 0.12, clamp(t / dur)),
      pitch: camera.pitch + 0.055, distance: camera.distance + 2.35,
      cell: 4, outline: true, light: [-0.56, 0.82, -0.68] as [number, number, number],
      ambient: 0.5, rim: 0.55, ground: { y: -2.1, shadow: 0.58, grid: false }, fog: { near: 8, far: 20 },
    };
    const close = clamp((t - (lockedAt - 0.25)) / 0.25);
    const closeEase = 1 - (1 - close) ** 4;
    const doorYaw = lerp(-0.24, 0.012, closeEase);
    const travelLength = Math.max(0.22, Math.min(0.78, lockedAt - moneyAt + 0.18));
    const cashMove = clamp((t - (moneyAt - 0.12)) / travelLength);
    const cashModel = lockedModel;
    const movingCash = Array.from({ length: 3 }, (_, i) => {
      const delay = i * 0.095;
      const q = clamp((t - (moneyAt - 0.16 + delay)) / travelLength);
      const eased = 1 - (1 - q) ** 3;
      return {
        mesh: cashModel?.mesh ?? TICKET,
        materials: cashModel ? CASH_MATERIALS : TICKET_MATERIALS,
        pos: [lerp(0.34 - i * 0.28, -1.35 + i * 0.36, eased), lerp(0.93 - i * 0.14, 0.68 + (i % 2) * 0.04, eased), lerp(-1.0, 0.08 + i * 0.1, eased)] as [number, number, number],
        rot: [0.03 + Math.sin(t * 3 + i) * 0.06, t * (0.46 + i * 0.06), Math.sin(t * 2.4 + i * 0.8) * 0.12] as [number, number, number],
        scale: lockedName === 'ticket' ? 0.76 : 0.72,
      };
    });

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    rig.apply(ctx, t);
    drawEnv(ctx, { type: 'vault', t, theme, seed: seed + 4, width: W, height: H, camera: { x: t * 12, y: t * -8, zoom: 1.02 + push * 0.1, yaw: camera.yaw, pitch: camera.pitch } });

    const objects: Object3D[] = [
      { mesh: ROOM_MESH, pos: [-1.3, 0.05, 0.42] as [number, number, number], materials: ROOM_MATERIALS },
      ...movingCash,
      { mesh: DOOR_BASE, pos: DOOR_POS, rot: [0, doorYaw, 0] as [number, number, number], scale: DOOR_SCALE, materials: DOOR_MATERIALS },
      { mesh: DOOR_WHEEL.mesh, pos: [DOOR_POS[0], DOOR_POS[1], DOOR_POS[2] - 0.42 * DOOR_SCALE] as [number, number, number], rot: [Math.PI / 2, 0, (1 - closeEase) * (t * 2.8 + 1.9)] as [number, number, number], scale: DOOR_SCALE, materials: DOOR_MATERIALS },
      { mesh: DOOR_SPOKES.mesh, pos: [DOOR_POS[0], DOOR_POS[1], DOOR_POS[2] - 0.38 * DOOR_SCALE] as [number, number, number], rot: [0, 0, (1 - closeEase) * (t * 2.8 + 1.9)] as [number, number, number], scale: DOOR_SCALE, materials: DOOR_MATERIALS },
      { mesh: DOOR_HUB.mesh, pos: [DOOR_POS[0], DOOR_POS[1], DOOR_POS[2] - 0.44 * DOOR_SCALE] as [number, number, number], rot: [Math.PI / 2, 0, 0], scale: DOOR_SCALE, materials: DOOR_MATERIALS },
    ];
    render3d(ctx, theme, view, objects);

    // Hedgy is composited at the glass depth, so the reflection can pass over his reaching paw.
    const hedgyFoot = project(view, [-2.12, -1.42, 0.14]);
    const hedgyX = clamp(hedgyFoot.x, 200, 485);
    const hedgyY = clamp(hedgyFoot.y + 40, 930, 1195);
    ctx.fillStyle = '#121315'; ctx.fillRect(hedgyX - 126, hedgyY + 6, 252, 10);
    ctx.fillStyle = '#474A4D'; ctx.fillRect(hedgyX - 80, hedgyY + 6, 160, 5);
    drawHedgy(ctx, { x: hedgyX, y: hedgyY, scale: 7.2, t: Math.max(0, t - moneyAt + 0.1), pose: 'push', facing: 1, look: 'forward', expression: 'worried' });

    drawGlass(ctx, view, t, dur, 0.14, push);
    const wheelWorld = project(view, [DOOR_POS[0], DOOR_POS[1], DOOR_POS[2] - 0.54 * DOOR_SCALE]);
    const wheelRadius = Math.round(clamp(wheelWorld.y > 800 ? 108 : 95, 86, 118) / 4) * 4;
    drawWheel(ctx, wheelWorld, t, lockedAt, wheelRadius);
    const labelWorld = project(view, [DOOR_POS[0] - 0.1, DOOR_POS[1] + 1.58, DOOR_POS[2] - 0.16]);
    stencilLabel(ctx, label, { x: labelWorld.x - 32, y: labelWorld.y });

    if (cashMove > 0.78) {
      const chamberCenter = project(view, [-1.3, 0.72, 0.05]);
      drawBurst(ctx, t, { center: { x: chamberCenter.x, y: chamberCenter.y + 28 }, seed: seed + 81, count: 12, kind: 'dust', start: lockedAt - 0.02, life: 0.72, speed: 67, gravity: 126, drag: 0.4, size: 2, color: '#B8C0C4' });
    }

    // The sealed glass stays legible while its reflected bands surge toward lens on the exit push.
    const foregroundDrift = Math.round((t * 24 + push * 124) / 4) * 4;
    ctx.fillStyle = '#171B1E'; ctx.fillRect(-8, 1196 + foregroundDrift, 1096, 14);
    ctx.fillStyle = '#879198'; ctx.fillRect(-8, 1196 + foregroundDrift, 1096, 5);
    ctx.restore();
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const safeDur = Math.max(0.05, dur);
    const moneyAt = eventTime(props, 'money', safeDur, 0.28);
    const lockedAt = eventTime(props, 'locked', safeDur, 0.67);
    const cues: Cue[] = [
      { t: clamp(moneyAt - 0.12, 0, safeDur), kind: 'swish', pan: 0.25, gain: 0.62 },
      { t: moneyAt, kind: 'cash', pan: 0.1, gain: 0.86 },
      { t: clamp(moneyAt + 0.13, 0, safeDur), kind: 'paper', pan: -0.12, gain: 0.48 },
      { t: clamp(moneyAt + 0.3, 0, safeDur), kind: 'cash', pan: -0.35, gain: 0.54 },
      { t: clamp(lockedAt - 0.08, 0, safeDur), kind: 'servo', pan: 0.62, gain: 0.65 },
      { t: lockedAt, kind: 'thud', pan: 0.72, gain: 1.12 },
      { t: clamp(lockedAt + 0.035, 0, safeDur), kind: 'clack', pan: 0.72, gain: 0.95 },
      { t: clamp(lockedAt + 0.12, 0, safeDur), kind: 'glass', pan: 0.48, gain: 0.64 },
      { t: clamp(lockedAt + 0.2, 0, safeDur), kind: 'rumble', pan: 0.4, gain: 0.58 },
    ];
    return cues.filter(cue => cue.t <= safeDur).sort((a, b) => a.t - b.t);
  },
};
