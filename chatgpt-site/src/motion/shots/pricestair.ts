import { clamp, lerp, type Cue, type Frame, type ShotProps } from '../core.ts';
import { drawHedgy } from '../actor/hedgy.ts';
import { ASSETS, type AssetModel } from '../assets/index.ts';
import { drawEnv } from '../env/index.ts';
import { drawBurst } from '../fx/particles.ts';
import { createCameraRig } from '../fx/rig.ts';
import { pixelText } from '../prim.ts';
import { drawTicket2D, ticketMesh, TICKET_MATERIALS } from '../sets/ticket.ts';
import { box, instances, merge, place, project, render3d, type Material, type Mesh, type Object3D } from '../three.ts';
import type { ShotDef } from './index.ts';

const W = 1080;
const H = 1290;
const STAIR_MATERIALS: Material[] = [
  { ramp: 'steel', tone: 1.12, spec: 0.58, emissive: 0.035 },
  { ramp: 'chrome', tone: 1.12, spec: 0.88, emissive: 0.06 },
  { ramp: 'bone', tone: 1.08, spec: 0.3, emissive: 0.05 },
];
const TICKET = ticketMesh();
const SHELF_MESH: Mesh = merge(
  box(3.05, 0.16, 1.08, 0),
  place(box(3.1, 0.23, 0.14, 1), { pos: [0, -0.17, -0.49] }),
  place(box(2.92, 0.045, 0.035, 2), { pos: [0, -0.01, -0.58] }),
  place(box(2.68, 0.025, 0.035, 2), { pos: [0, 0.112, -0.52] }),
);
const PILLAR_MESH = merge(
  box(0.28, 5.2, 0.36, 0),
  place(box(0.4, 0.12, 0.48, 1), { pos: [0, 2.44, 0] }),
  place(box(0.4, 0.12, 0.48, 1), { pos: [0, -2.44, 0] }),
  place(box(0.07, 4.6, 0.04, 2), { pos: [0, 0, -0.204] }),
);
const BEAM_MESH = merge(box(7.4, 0.2, 0.4, 1), place(box(7.08, 0.055, 0.04, 2), { pos: [0, -0.125, -0.22] }));
const ASSET_FACTORIES = ASSETS as unknown as Record<string, (options?: { detail?: number; count?: number; seed?: number }) => AssetModel>;
const MODEL_CACHE = new Map<string, AssetModel>();

function modelFor(name: string): AssetModel | undefined {
  const factory = ASSET_FACTORIES[name];
  if (!factory) return undefined;
  let model = MODEL_CACHE.get(name);
  if (!model) {
    model = factory({ detail: 0.8, count: 6, seed: 31 });
    MODEL_CACHE.set(name, model);
  }
  return model;
}

function numberParam(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback;
}

function eventTime(props: ShotProps, kind: string, dur: number, fallback: number): number {
  const at = props.events?.find(event => String(event.kind).toLowerCase() === kind)?.at;
  return clamp(Number.isFinite(at) ? at! : dur * fallback, 0, dur);
}

function stairPoints(count: number, direction: 'down' | 'up') {
  const sign = direction === 'down' ? -1 : 1;
  return Array.from({ length: count }, (_, i) => {
    const p = count < 2 ? 0 : i / (count - 1);
    return {
      x: lerp(-2.15, -0.5, p),
      y: sign < 0 ? lerp(1.8, -1.95, p) : lerp(-1.95, 1.8, p),
      z: lerp(2.6, -1.75, p),
      p,
    };
  });
}

function drawForegroundRails(ctx: Frame['ctx'], t: number, color: string) {
  const drift = Math.round((t * 58) % 48);
  ctx.save();
  ctx.fillStyle = '#101316';
  ctx.fillRect(-8, 422 + drift, 58, 925);
  ctx.fillRect(1030, 274 - drift, 58, 1075);
  ctx.fillStyle = '#59636B';
  ctx.fillRect(36, 420 + drift, 8, 890);
  ctx.fillRect(1035, 272 - drift, 8, 1070);
  ctx.fillStyle = '#C2C9CD';
  for (let y = 452 + drift; y < 1288; y += 142) ctx.fillRect(28, y, 26, 6);
  for (let y = 304 - drift; y < 1288; y += 142) ctx.fillRect(1022, y, 26, 6);
  // Close paper flecks, deterministic and stepped to the 4 px grid.
  for (let i = 0; i < 7; i++) {
    const x = (i * 173 + Math.round(t * (92 + i * 7))) % 1080;
    const y = (i * 197 + Math.round(t * (64 + i * 9))) % 1260;
    ctx.fillStyle = i % 3 === 0 ? color : '#777F84';
    ctx.fillRect(Math.round(x / 4) * 4, Math.round(y / 4) * 4, 8 + (i % 2) * 4, 4);
  }
  ctx.restore();
}

export const priceStairShot: ShotDef = {
  name: 'pricestair',
  describe: 'A luminous ticket exchange stair descends into depth as Hedgy points toward a ghost ticket landing on the lower shelf; params.direction (down/up), steps (3–9), asset (ticket or an asset-library prop).',
  render(frame: Frame, props: ShotProps) {
    const { ctx, theme, seed } = frame;
    const dur = Math.max(0.05, frame.dur);
    const t = clamp(frame.t, 0, dur);
    const p = props.params ?? {};
    const direction = p.direction === 'up' ? 'up' : 'down';
    const steps = Math.round(numberParam(p.steps, 6, 3, 9));
    const extraAssetName = typeof p.asset === 'string' && p.asset !== 'ticket' ? p.asset : '';
    const extraAsset = modelFor(extraAssetName);
    const bettingAt = eventTime(props, 'betting', dur, 0.16);
    const cheaperAt = eventTime(props, 'cheaper', dur, 0.72);
    const crane = direction === 'down' ? -104 : 104;
    const rig = createCameraRig({
      width: W, height: H, seed: seed + 17, handheld: 3.4,
      keyframes: [
        { t: 0, x: 0, y: 10, zoom: 1, rot: 0 },
        { t: dur * 0.42, x: -18, y: crane * 0.32, zoom: 1.025, rot: -0.004 },
        { t: dur, x: 22, y: crane, zoom: 1.075, rot: 0.006 },
      ],
      hits: [cheaperAt], punch: 0.022, shake: 3.2,
    });
    const camera = rig.view3D(t);
    const view = {
      x: 0, y: 0, w: W, h: H, zoom: 345,
      yaw: camera.yaw - 0.06, pitch: camera.pitch + 0.035, distance: camera.distance + 2.15,
      cell: 4, outline: true, light: [-0.5, 0.82, -0.64] as [number, number, number],
      ambient: 0.48, rim: 0.48, ground: { y: -2.55, shadow: 0.62, grid: false }, fog: { near: 7.5, far: 19 },
    };
    const shelves = stairPoints(steps, direction);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    rig.apply(ctx, t);
    drawEnv(ctx, { type: 'exchange', t, theme, seed: seed + 2, width: W, height: H, camera: { x: t * -16, y: t * 5, zoom: 1.04, yaw: camera.yaw, pitch: camera.pitch } });

    const shelfInstances = shelves.map(point => ({ pos: [point.x, point.y, point.z] as [number, number, number] }));
    const pillarZs = [-0.3, 1.5, 3.3];
    const architecture: Object3D[] = [
      instances(PILLAR_MESH, [-1, 1].flatMap(side => pillarZs.map(z => ({ pos: [side * 3.45, 0.25, z] as [number, number, number] }))), { materials: STAIR_MATERIALS }),
      { mesh: BEAM_MESH, pos: [0, 2.9, 0.95] as [number, number, number], materials: STAIR_MATERIALS },
      { mesh: BEAM_MESH, pos: [0, -2.5, 0.95] as [number, number, number], materials: STAIR_MATERIALS },
      instances(SHELF_MESH, shelfInstances, { materials: STAIR_MATERIALS }),
      instances(box(0.1, 0.74, 0.12, 1), shelves.map(point => ({ pos: [point.x, point.y - 0.44, point.z - 0.08] as [number, number, number] })), { materials: STAIR_MATERIALS }),
      { mesh: TICKET, pos: [1.15, 1.95, -2.35], rot: [0.05, -0.08, -0.16], scale: 1.22, materials: TICKET_MATERIALS },
    ];
    if (extraAsset) {
      const low = shelves.at(-1)!;
      architecture.push({ mesh: extraAsset.mesh, pos: [low.x - 0.95, low.y + 0.55, low.z - 0.12], rot: [0.08, t * 0.2, 0.05], scale: 0.42, materials: extraAsset.materials });
    }
    render3d(ctx, theme, view, architecture);

    const landing = shelves.at(-1)!;
    const landingScreen = project(view, [landing.x, landing.y - 0.12, landing.z - 0.61]);
    const actorScreen = project(view, [landing.x + (direction === 'down' ? 1.45 : -1.45), landing.y - 0.55, landing.z - 0.3]);
    const actorX = clamp(actorScreen.x, 730, 922);
    const actorY = clamp(actorScreen.y + 78, 790, 1160);
    ctx.fillStyle = '#181719';
    ctx.fillRect(actorX - 116, actorY + 8, 232, 12);
    ctx.fillStyle = '#4B4844';
    ctx.fillRect(actorX - 82, actorY + 8, 164, 6);
    drawHedgy(ctx, { x: actorX, y: actorY, scale: 7, t: Math.max(0, t - bettingAt + 0.08), pose: 'point', facing: direction === 'down' ? -1 : 1, look: direction === 'down' ? 'down' : 'up', expression: 'determined' });

    // The lower shelf inscription is attached to its front fascia by the projected shelf anchor.
    const plateW = 216, plateH = 48;
    const labelX = clamp(landingScreen.x - 160, 180, 870);
    const labelY = clamp(landingScreen.y - 25, 280, 1140);
    ctx.fillStyle = '#181B1E';
    ctx.fillRect(labelX - plateW / 2, labelY - plateH / 2, plateW, plateH);
    ctx.fillStyle = '#AEB6BB';
    ctx.fillRect(labelX - plateW / 2, labelY - plateH / 2, plateW, 5);
    ctx.fillRect(labelX - plateW / 2 + 10, labelY + plateH / 2 - 5, plateW - 20, 4);
    for (const dx of [-94, 94]) {
      ctx.fillStyle = '#D1D6D9'; ctx.fillRect(labelX + dx - 3, labelY - 4, 6, 6);
      ctx.fillStyle = '#454B50'; ctx.fillRect(labelX + dx - 1, labelY - 2, 2, 2);
    }
    const labelReveal = clamp((t - cheaperAt + 0.2) / 0.2);
    pixelText(ctx, 'CHEAPER', labelX, labelY - 16, 4, { color: '#E5E8EA', align: 'center', reveal: labelReveal, mode: 'type' });

    const flight = clamp((t - (cheaperAt - 0.42)) / 0.42);
    const easedFlight = 1 - (1 - flight) ** 3;
    const originX = direction === 'down' ? 906 : 188;
    const originY = direction === 'down' ? 412 : 1085;
    const targetX = clamp(landingScreen.x, 360, 820);
    const targetY = clamp(landingScreen.y, 965, 1085);
    const ticketX = lerp(originX, targetX - (direction === 'down' ? 16 : -16), easedFlight);
    const ticketY = lerp(originY, targetY - 55, easedFlight) - Math.sin(Math.PI * flight) * 78;
    ctx.save();
    ctx.globalAlpha = 0.9;
    drawTicket2D(ctx, ticketX, ticketY, 188, { rot: lerp(-0.24, -0.04, easedFlight), dark: true });
    ctx.restore();
    if (flight > 0.8) {
      drawBurst(ctx, t, { center: { x: landingScreen.x, y: landingScreen.y - 8 }, seed: seed + 93, count: 16, kind: 'dust', start: cheaperAt - 0.01, life: 0.72, speed: 86, gravity: 155, drag: 0.36, size: 2, color: '#CFD4D8' });
    }

    drawForegroundRails(ctx, t, theme.dim);
    // The original sale receipt stays high and close to lens throughout the crane.
    ctx.save();
    ctx.globalAlpha = 0.96;
    drawTicket2D(ctx, 800, 367 + Math.round(Math.sin(t * 2.2) * 5), 320, { rot: 0.06 + Math.sin(t * 1.1) * 0.014 });
    ctx.restore();
    ctx.restore();
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const safeDur = Math.max(0.05, dur);
    const bettingAt = eventTime(props, 'betting', safeDur, 0.16);
    const cheaperAt = eventTime(props, 'cheaper', safeDur, 0.72);
    const cues: Cue[] = [{ t: bettingAt, kind: 'thud', pan: 0.42, gain: 0.55 }];
    for (let i = 0; i < 4; i++) {
      const t = 0.22 + i * Math.min(0.085, safeDur * 0.055);
      if (t < cheaperAt - 0.15 && t <= safeDur) cues.push({ t, kind: 'tick', pan: -0.42 + i * 0.21, gain: 0.22, step: i / 4 });
    }
    [-0.14, -0.07, 0].forEach((offset, i) => cues.push({
      t: clamp(cheaperAt + offset, 0, safeDur), kind: 'glass', pan: 0.24, gain: 0.5 - i * 0.08, step: 1 - i * 0.5,
    }));
    cues.push({ t: clamp(cheaperAt + 0.055, 0, safeDur), kind: 'paper', pan: 0.24, gain: 0.56 });
    return cues.filter(cue => cue.t <= safeDur).sort((a, b) => a.t - b.t);
  },
};
