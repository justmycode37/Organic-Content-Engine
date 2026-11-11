import { clamp, ease, type Cue, type Frame, type ShotProps } from '../core.ts';
import { drawHedgy } from '../actor/hedgy.ts';
import { drawEnv } from '../env/index.ts';
import { createCameraRig } from '../fx/rig.ts';
import { drawBurst, drawImpactStar, drawSpeedLines } from '../fx/particles.ts';
import { pixelText } from '../prim.ts';
import { drawTicket2D, TICKET_MATERIALS, ticketMesh } from '../sets/ticket.ts';
import { box, cylinder, merge, place, render3d, type Material, type Mesh } from '../three.ts';
import type { ShotDef } from './index.ts';

const W = 1080, H = 1290;
const ink = '#070809', deep = '#101114', wall = '#24262A', steel = '#50535A', edge = '#888B91', light = '#D3D4D6', paper = '#EDEDED';
const MATERIALS: Material[] = [
  { ramp: 'steel', tone: .9, spec: .48 },
  { ramp: 'chrome', tone: .96, spec: .72 },
  { ramp: 'ink', tone: .72 },
  { ramp: 'paper', tone: .96 },
];
const SHARE_MESH = merge(
  box(1.8, 1, .07, 3),
  place(box(1.15, .18, .025, 2), { pos: [0, .22, -.05] }),
);
const COIN_MESH = cylinder(.73, .16, 12, 1, 1);
const RAIL_MESH = merge(
  place(box(1.8, .24, .78, 0, [0, 0, 1, 0, 0, 0]), { pos: [0, .8, 0] }),
  place(box(1.55, 1.9, .65, 0, [0, 0, 1, 0, 0, 0]), { pos: [0, -.18, 0] }),
  place(box(1.22, .2, .06, 2), { pos: [0, -.52, -.36] }),
);

type AssetKind = 'ticket' | 'share' | 'coin' | 'banknote';
function assetKind(value: unknown): AssetKind {
  const name = String(value ?? 'ticket').toLowerCase();
  if (['share', 'shares', 'stock', 'certificate'].includes(name)) return 'share';
  if (['coin', 'token', 'deposit'].includes(name)) return 'coin';
  if (['banknote', 'cash', 'bill'].includes(name)) return 'banknote';
  return 'ticket';
}
function assetMesh(kind: AssetKind): Mesh {
  return kind === 'ticket' ? ticketMesh() : kind === 'coin' ? COIN_MESH : kind === 'share' ? SHARE_MESH : box(1.8, .86, .06, 3);
}
function assetMaterials(kind: AssetKind): Material[] { return kind === 'ticket' ? TICKET_MATERIALS : MATERIALS; }
function paramText(params: Record<string, unknown>, key: string, fallback: string): string {
  const value = params[key];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}
function eventAt(props: ShotProps, names: string[], fallback: number, dur: number): number {
  const key = names.map(s => s.toLowerCase());
  const found = props.events?.find(event => key.includes(String(event.kind).toLowerCase()));
  return clamp(found?.at ?? fallback * dur, 0, dur);
}
function interpolate(a: number, b: number, p: number) { return a + (b - a) * ease.outCubic(clamp(p)); }
function mix(a: number, b: number, p: number) { return a + (b - a) * clamp(p); }
function polygon(ctx: Frame['ctx'], points: [number, number][], fill: string, stroke?: string, width = 4) {
  ctx.beginPath(); ctx.moveTo(points[0]![0], points[0]![1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i]![0], points[i]![1]);
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}

function drawSkyline(ctx: Frame['ctx'], t: number) {
  const buildings = [
    [0, 325, 95, 310], [65, 248, 80, 390], [133, 302, 76, 344], [201, 190, 74, 450],
    [802, 288, 83, 352], [872, 224, 77, 418], [938, 315, 75, 327], [1000, 184, 80, 458],
  ];
  ctx.fillStyle = '#1A1B1F'; ctx.fillRect(0, 230, W, 460);
  for (const [x0, y, w, h] of buildings) {
    const x = x0 + Math.round(Math.sin(t * .19 + x0) * 3);
    ctx.fillStyle = '#3B3D42'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#777A80'; ctx.fillRect(x, y, w, 7);
    for (let row = 0; row < 6; row++) for (let col = 0; col < 3; col++) {
      if ((row * 5 + col * 3 + x0 / 10) % 4 < 2) {
        ctx.fillStyle = row % 2 ? '#A2A4A8' : '#63666B';
        ctx.fillRect(x + 14 + col * 21, y + 22 + row * 38, 8, 17);
      }
    }
  }
}

/** Layered arena atrium: a bright architectural shell around a dark, deep central void. */
function drawLobby(frame: Frame, t: number, depthLayers: number) {
  const { ctx, theme, seed } = frame;
  drawEnv(ctx, { type: 'stage', t, seed: seed + 17, theme, width: W, height: H,
    camera: { x: Math.sin(t * .5) * 26, y: Math.cos(t * .3) * 12, zoom: 1.02, yaw: Math.sin(t * .22) * .04, pitch: .04 } });
  drawSkyline(ctx, t);
  const vpX = 540 + Math.sin(t * .45) * 18, vpY = 640 - t * 5;
  // Outer atrium walls rake inward to the vanishing point.
  polygon(ctx, [[0, 0], [286, 0], [vpX - 178, vpY], [295, 1180], [0, 1290]], '#35373C', '#999BA0', 8);
  polygon(ctx, [[1080, 0], [794, 0], [vpX + 178, vpY], [785, 1180], [1080, 1290]], '#303237', '#85878D', 8);
  polygon(ctx, [[286, 0], [794, 0], [vpX + 140, vpY - 28], [vpX - 140, vpY - 28]], '#494B50', '#B8BABE', 8);
  // A few bright ceiling ribs lead toward the action without crossing its silhouette.
  for (let i = 0; i < 6; i++) {
    const x = 34 + i * 202;
    ctx.strokeStyle = i < 3 ? '#BFC1C5' : '#696C72'; ctx.lineWidth = i % 3 === 0 ? 8 : 4;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(vpX + (x - 540) * .18, vpY - 52); ctx.stroke();
  }
  // Balcony tiers compress toward the city. Repeating rails make the scale read at a glance.
  const tierCount = Math.max(3, Math.min(7, Math.floor(depthLayers)));
  for (let i = 0; i < tierCount; i++) {
    const p = i / Math.max(1, tierCount - 1), y = 232 + p * 410, half = 520 - p * 240;
    const x1 = vpX - half, x2 = vpX + half, thick = 22 - p * 7;
    polygon(ctx, [[x1 - 22, y], [x2 + 22, y], [x2 + 14, y + thick], [x1 - 14, y + thick]], i % 2 ? '#777A80' : '#5A5D63', '#B6B8BC', 4);
    ctx.fillStyle = '#C8C9CC'; ctx.fillRect(x1 - 6, y + thick, x2 - x1 + 12, 7);
    for (let x = x1; x < x2; x += Math.max(48, 126 - p * 30)) {
      ctx.fillStyle = '#AEB0B5'; ctx.fillRect(x, y - 52 + p * 18, 9, 50);
    }
    if (i < tierCount - 1) {
      ctx.fillStyle = '#212327';
      ctx.fillRect(x1 + 15, y + thick + 10, x2 - x1 - 30, 31);
      for (let x = x1 + 32; x < x2 - 18; x += Math.max(42, 80 - p * 30)) {
        ctx.fillStyle = '#62656B'; ctx.fillRect(x, y + thick + 15, 22, 10);
      }
    }
  }
  // Floor tiles widen toward camera; polished paths echo the vanishing point.
  polygon(ctx, [[vpX - 140, vpY], [vpX + 140, vpY], [1080, 1290], [0, 1290]], '#17191C', '#686B70', 5);
  for (let i = 1; i <= 12; i++) {
    const q = i / 12, y = vpY + q * (1290 - vpY);
    ctx.fillStyle = i % 3 === 0 ? '#777A80' : '#44474D'; ctx.fillRect(0, Math.round(y / 4) * 4, W, i % 3 === 0 ? 6 : 3);
  }
  for (let i = -8; i <= 8; i++) {
    ctx.strokeStyle = i % 2 ? '#45484E' : '#777A80'; ctx.lineWidth = i % 3 === 0 ? 5 : 3;
    ctx.beginPath(); ctx.moveTo(vpX, vpY); ctx.lineTo(540 + i * 145, 1290); ctx.stroke();
  }
  // The arena's old proscenium arch anchors the lobby as a venue, not a generic corridor.
  ctx.strokeStyle = '#B8BABF'; ctx.lineWidth = 14; ctx.beginPath();
  ctx.moveTo(220, 720); ctx.lineTo(220, 510); ctx.bezierCurveTo(220, 330, 355, 277, 540, 277);
  ctx.bezierCurveTo(725, 277, 860, 330, 860, 510); ctx.lineTo(860, 720); ctx.stroke();
  ctx.strokeStyle = '#65686E'; ctx.lineWidth = 7; ctx.beginPath();
  ctx.moveTo(268, 720); ctx.lineTo(268, 516); ctx.bezierCurveTo(268, 385, 382, 336, 540, 336);
  ctx.bezierCurveTo(698, 336, 812, 385, 812, 516); ctx.lineTo(812, 720); ctx.stroke();
  ctx.fillStyle = '#B9BBC0'; ctx.fillRect(210, 704, 666, 15);
  ctx.fillStyle = '#3B3D42'; ctx.fillRect(292, 380, 496, 12);
  for (let i = 0; i < 18; i++) {
    ctx.fillStyle = i % 3 ? '#787B81' : '#D2D4D7';
    ctx.fillRect(309 + i * 26, 398, 8, 94);
  }
  // A few dithered light wells lift the deep atrium without making a gradient.
  for (let row = 0; row < 13; row++) for (let col = 0; col < 18; col++) {
    const cx = 72 + col * 56, cy = 136 + row * 42;
    if (((row * 7 + col * 11 + seed) % 13) < 3 && cx > 220 && cx < 860) {
      ctx.fillStyle = row < 4 ? '#777A80' : '#55585E'; ctx.fillRect(cx, cy, 12, 4);
    }
  }
  // Low steel lip and two edge braces preserve depth while keeping the exchange clear.
  const railShift = (t * 190) % 420;
  ctx.fillStyle = '#B9BBC0'; ctx.fillRect(0, 1252 + railShift * .04, W, 8);
  ctx.fillStyle = '#3A3D42'; ctx.fillRect(0, 1260 + railShift * .04, W, 30);
  for (const x of [32, 1036]) {
    ctx.fillStyle = '#8D9096'; ctx.fillRect(x, 1094 + railShift * .05, 8, 190);
    ctx.fillStyle = '#D1D2D4'; ctx.fillRect(x + 8, 1094 + railShift * .05, 4, 190);
  }
  // Marquee silhouettes frame the far skyline.
  for (const side of [-1, 1]) {
    const x = side < 0 ? 48 : 922;
    ctx.fillStyle = '#191A1E'; ctx.fillRect(x, 310, 110, 192);
    ctx.fillStyle = '#A7A9AE'; ctx.fillRect(x, 310, 110, 8);
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i % 2 ? '#85888E' : '#C9CACC';
      ctx.fillRect(x + 13 + i * 19, 335, 8, 150);
    }
  }
}

function drawLenderDock(ctx: Frame['ctx'], x: number, y: number, t: number) {
  const left = Math.round((x - 108) / 4) * 4, top = Math.round((y - 166) / 4) * 4;
  ctx.fillStyle = ink; ctx.fillRect(left - 12, top - 12, 240, 356);
  ctx.fillStyle = '#72757B'; ctx.fillRect(left, top, 216, 328);
  ctx.fillStyle = '#B8BABF'; ctx.fillRect(left, top, 12, 328); ctx.fillRect(left, top, 216, 11);
  ctx.fillStyle = '#292B30'; ctx.fillRect(left + 16, top + 14, 188, 293);
  ctx.fillStyle = '#8E9197'; ctx.fillRect(left + 26, top + 24, 168, 34);
  ctx.fillStyle = '#D8DADD'; ctx.fillRect(left + 32, top + 31, 156, 7);
  ctx.fillStyle = '#6A6D73'; ctx.fillRect(left + 34, top + 42, 102, 5);
  ctx.fillStyle = '#A3A6AC'; ctx.fillRect(left + 20, top + 104, 176, 108);
  ctx.fillStyle = '#17191D'; ctx.fillRect(left + 28, top + 118, 160, 76);
  ctx.fillStyle = '#C1C3C7'; ctx.fillRect(left + 26, top + 112, 164, 7);
  ctx.fillStyle = '#777A80'; ctx.fillRect(left + 28, top + 195, 160, 11);
  ctx.fillStyle = '#303237'; ctx.fillRect(left + 28, top + 220, 160, 72);
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i % 2 ? '#777A80' : '#D5D6D9';
    ctx.fillRect(left + 39 + i * 32, top + 235, 6, 42);
  }
  ctx.fillStyle = '#E1E2E4'; ctx.fillRect(left + 190, top + 96 + Math.round(Math.sin(t * 9) * 3), 10, 10);
  ctx.fillStyle = '#4B4E54'; ctx.fillRect(left + 46, top + 314, 126, 9);
}

function drawGenericAsset(ctx: Frame['ctx'], kind: AssetKind, x: number, y: number, w: number, rot: number, tear: number) {
  if (kind === 'ticket') { drawTicket2D(ctx, x, y, w, { rot, tear }); return; }
  ctx.save(); ctx.translate(Math.round(x / 4) * 4, Math.round(y / 4) * 4); ctx.rotate(rot);
  const h = kind === 'coin' ? w * .39 : kind === 'share' ? w * .55 : w * .48;
  if (kind === 'coin') {
    ctx.fillStyle = ink;
    ctx.beginPath(); ctx.moveTo(-w * .45, -h * .34); ctx.lineTo(-w * .22, -h * .5); ctx.lineTo(w * .26, -h * .48); ctx.lineTo(w * .46, -h * .23);
    ctx.lineTo(w * .46, h * .26); ctx.lineTo(w * .2, h * .46); ctx.lineTo(-w * .28, h * .42); ctx.lineTo(-w * .45, h * .18); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#8E9196'; ctx.fillRect(-w * .42, -h * .3, w * .82, h * .63);
    ctx.strokeStyle = '#D9DADD'; ctx.lineWidth = 5; ctx.strokeRect(-w * .34, -h * .24, w * .66, h * .48);
    ctx.fillStyle = '#4A4D52'; ctx.fillRect(-w * .035, -h * .2, w * .07, h * .4);
  } else {
    ctx.fillStyle = ink; ctx.fillRect(-w * .5, -h * .5, w, h);
    ctx.fillStyle = kind === 'share' ? paper : '#E0DBD2'; ctx.fillRect(-w * .47, -h * .46, w * .94, h * .9);
    ctx.strokeStyle = '#70737A'; ctx.lineWidth = 4; ctx.strokeRect(-w * .43, -h * .4, w * .86, h * .78);
    ctx.fillStyle = '#25272B'; ctx.fillRect(-w * .36, -h * .29, w * .72, h * .12);
    ctx.fillStyle = '#6F7278'; ctx.fillRect(-w * .36, h * .02, w * .48, 6); ctx.fillRect(-w * .36, h * .15, w * .34, 5);
    if (kind === 'share') {
      ctx.strokeStyle = '#4A4D52'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-w * .14, h * .18); ctx.lineTo(0, h * .02); ctx.lineTo(w * .1, h * .12); ctx.lineTo(w * .3, -h * .04); ctx.stroke();
    }
  }
  ctx.restore();
}

function stampAsset(ctx: Frame['ctx'], kind: AssetKind, x: number, y: number, w: number, rot: number, progress: number) {
  if (progress <= 0) return;
  const scale = .86 + Math.min(1, progress * 9) * .14;
  ctx.save(); ctx.translate(Math.round(x / 4) * 4, Math.round(y / 4) * 4); ctx.rotate(rot); ctx.scale(scale, scale);
  const labelW = Math.min(204, w * (kind === 'ticket' ? .56 : .62)), labelH = 38, cx = kind === 'ticket' ? -w * .16 : 0, cy = 0;
  ctx.fillStyle = '#17181B'; ctx.fillRect(Math.round((cx - labelW / 2) / 4) * 4, Math.round((cy - labelH / 2) / 4) * 4, Math.round(labelW / 4) * 4, labelH);
  pixelText(ctx, 'BORROWED', cx, cy - 14, 2, { color: paper, align: 'center', mode: 'type', reveal: Math.min(1, progress * 7) });
  ctx.restore();
}

function eventPosition(props: ShotProps, dur: number) {
  return {
    sells: eventAt(props, ['sells', 'sell', 'sale'], .16, dur),
    his: eventAt(props, ['his', 'borrowed', 'borrow'], .68, dur),
  };
}

function drawStamp(ctx: Frame['ctx'], x: number, y: number, w: number, rot: number, progress: number) {
  if (progress <= 0) return;
  const reveal = clamp(progress);
  const stampW = Math.min(222, w * .72), stampH = 52;
  ctx.save(); ctx.translate(Math.round(x / 4) * 4, Math.round(y / 4) * 4); ctx.rotate(rot - .025);
  ctx.fillStyle = '#111214'; ctx.fillRect(-stampW / 2, -stampH / 2, stampW, stampH);
  ctx.strokeStyle = '#F4F4F4'; ctx.lineWidth = 3; ctx.strokeRect(-stampW / 2 + 4, -stampH / 2 + 4, stampW - 8, stampH - 8);
  pixelText(ctx, 'BORROWED', 0, -17, 3, { color: '#FFFFFF', align: 'center', mode: 'type', reveal });
  ctx.restore();
}

export const borrowedAssetShot: ShotDef = {
  name: 'borrowedasset',
  describe: 'Hook: a giant asset rockets out of depth into a noir venue lobby; Hedgy snatches it from a chrome lender dock and sells it through a hatch with the tether intact. Params: asset (ticket default; share, coin, banknote), lenderDock, obligationTether, heroAction, cameraEntry, depthLayers.',
  render(frame: Frame, props: ShotProps) {
    const dur = Math.max(.1, frame.dur), t = Math.max(0, frame.t), activeT = clamp(t, 0, dur), p = props.params ?? {}, kind = assetKind(p.asset);
    const { sells, his } = eventPosition(props, dur);
    const dock = paramText(p, 'lenderDock', 'chrome');
    const dockSide = dock.toLowerCase();
    const tether = paramText(p, 'obligationTether', 'fine steel wire');
    const cameraEntry = paramText(p, 'cameraEntry', 'whip-dive');
    const depthLayers = Math.max(3, Math.min(7, Math.floor(Number(p.depthLayers ?? 6) || 6)));
    const ctx = frame.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    const sellFlash = Math.max(0, 1 - Math.abs(activeT - sells) / .07);
    const borrowedHit = Math.max(0, 1 - Math.abs(activeT - his) / .07);
    const rig = createCameraRig({ width: W, height: H, seed: frame.seed + 101, handheld: 1.25, punch: .045, shake: 7,
      hits: [sells, his],
      keyframes: [
        { t: 0, x: 0, y: 8, zoom: 1.055, rot: -.004 },
        { t: .15, x: 26, y: -8, zoom: 1.025, rot: .003, ease: 'out' },
        { t: sells, x: -32, y: 4, zoom: 1.075, rot: -.004, ease: 'inOut' },
        { t: his - .22, x: -12, y: -18, zoom: 1.08, rot: .003, ease: 'inOut' },
        { t: dur - .28, x: 8, y: -12, zoom: 1.1, rot: -.002, ease: 'inOut' },
        { t: dur + .2, x: 14, y: -6, zoom: 1.1, rot: 0, ease: 'out' },
      ],
      whip: cameraEntry === 'whip-dive' ? [{ at: .12, direction: 'down', duration: .19, amount: .12 }] : [],
    });
    rig.apply(ctx, t);
    drawLobby(frame, t, depthLayers);

    // The chrome lender dock sits in a recessed balcony bay. Mesh landmarks stay stable across variants.
    const dockAnchor = dockSide.includes('right') ? 324 : dockSide.includes('left') ? 188 : 252;
    const dockX = dockAnchor + Math.sin(t * .25) * 6, dockY = 730;
    render3d(ctx, frame.theme, {
      x: dockX - 128, y: 448, w: 256, h: 438, zoom: 226,
      yaw: Math.sin(t * .6) * .08, pitch: .18, distance: 6.2, cell: 3, outline: true,
      ambient: .42, rim: .5, light: [-.55, .78, -.35], fog: { near: 8, far: 18 },
    }, [{ mesh: RAIL_MESH, materials: MATERIALS, rot: [0, t * .04, 0] }]);
    drawLenderDock(ctx, dockX, dockY, t);
    // A second small 3D pass makes the borrowed hero prop continuous with the shared ticket model.

    // Sale hatch: a deep mouth in a heavy shutter. The hatch is open for the flip.
    const hatchY = 790, hatchX = 786, hatchW = 420, hatchH = 216;
    const open = ease.outCubic(clamp((activeT - sells + .11) / .18));
    ctx.fillStyle = '#191B1F'; ctx.fillRect(hatchX - hatchW / 2 - 28, hatchY - hatchH / 2 - 38, hatchW + 56, hatchH + 76);
    ctx.fillStyle = '#777A80'; ctx.fillRect(hatchX - hatchW / 2 - 42, hatchY - hatchH / 2 - 48, hatchW + 84, 24);
    ctx.fillRect(hatchX - hatchW / 2 - 42, hatchY + hatchH / 2 + 24, hatchW + 84, 24);
    ctx.fillStyle = '#C0C2C6'; ctx.fillRect(hatchX - hatchW / 2 - 42, hatchY - hatchH / 2 - 48, 16, hatchH + 120);
    ctx.fillRect(hatchX + hatchW / 2 + 26, hatchY - hatchH / 2 - 48, 16, hatchH + 120);
    ctx.fillStyle = '#090A0C'; ctx.fillRect(hatchX - hatchW / 2, hatchY - hatchH / 2, hatchW, hatchH);
    ctx.fillStyle = '#A7A9AE'; ctx.fillRect(hatchX - hatchW / 2 + 12, hatchY - hatchH / 2 - 12, hatchW - 24, 14);
    const shutterY = hatchY - hatchH / 2 - 6 + open * (hatchH - 28);
    ctx.fillStyle = '#B9BBC0'; ctx.fillRect(hatchX - hatchW / 2 + 18, Math.round(shutterY / 4) * 4, hatchW - 36, 24);
    ctx.fillStyle = '#70737A'; for (let i = 0; i < 14; i++) ctx.fillRect(hatchX - hatchW / 2 + 32 + i * 25, Math.round(shutterY / 4) * 4 + 5, 4, 15);

    // The lens ticket keeps growing, then clears to reveal the same ticket at the lender dock.
    const passP = clamp(activeT / .17), passX = 540 + 1580 * passP, passY = 762 - 220 * passP;
    const passW = 1340 + 560 * ease.outCubic(clamp(passP * 2.2));
    const passRot = -.035 - passP * .075;

    // Ticket path: it breaks from the dock into Hedgy's paw, then snaps through the sale mouth.
    const pickup = ease.outCubic(clamp((activeT - .12) / .12));
    const handX = 474, handY = 824;
    let x = mix(dockX + 28, handX, pickup), y = mix(dockY - 18, handY, pickup), w = mix(250, 304, pickup);
    let rot = mix(-.02, .045, pickup);
    const saleP = ease.inOutCubic(clamp((activeT - .24) / Math.max(.06, sells - .24)));
    x = mix(x, hatchX - 10, saleP); y = mix(y, hatchY, saleP); w = mix(w, 344, saleP);
    rot = mix(rot, -.12 + Math.sin(activeT * 11) * .025, saleP);
    if (activeT >= sells) {
      const settle = ease.outCubic(clamp((activeT - sells) / .2));
      x = mix(hatchX - 10, hatchX - 18, settle);
      y = mix(hatchY, hatchY + 5, settle);
      w = mix(344, 326, settle);
      rot = mix(rot, -.015, settle);
    }
    const portalP = ease.inOutCubic(clamp((activeT - (dur - .28)) / .28));
    const heroW = mix(w, 1740, portalP), heroX = mix(x, 510, portalP), heroY = mix(y, 820, portalP);
    const heroRot = mix(rot, -.01, portalP);

    // Hedgy reaches from the lower lobby; the sale hatch stays clear of his face.
    const hedgyX = 470 + Math.sin(t * 1.2) * 4, hedgyY = 1152 + Math.sin(t * 5.5) * 2;
    const pose = activeT < .12 ? 'jump' : activeT < sells - .05 ? 'carry' : activeT < sells + .16 ? 'push' : activeT < his ? 'carry' : 'shock';
    const expression = activeT < sells ? 'determined' : activeT < his ? 'smug' : 'shocked';
    ctx.fillStyle = '#0C0D0F'; ctx.fillRect(hedgyX - 194, hedgyY + 7, 388, 16);
    ctx.fillStyle = '#4C4F55'; ctx.fillRect(hedgyX - 142, hedgyY + 10, 284, 7);
    drawHedgy(ctx, { x: hedgyX, y: hedgyY, scale: 7.3, t: Math.max(0, activeT - .12), pose, facing: 1,
      look: activeT < his ? 'forward' : 'down', expression });

    // Silver tether stays fixed to the lender dock as the ticket crosses the hatch.
    const tetherColor = tether.toLowerCase().includes('paper') ? '#D0D1D3' : '#E4E6E8';
    const attachX = heroX - heroW * .47, attachY = heroY + Math.sin(t * 7) * 4;
    const glow = .22 + .15 * (0.5 + 0.5 * Math.sin((activeT - his) * 13));
    ctx.save(); ctx.globalAlpha *= glow; ctx.strokeStyle = '#F2F3F4'; ctx.lineWidth = 14; ctx.beginPath();
    ctx.moveTo(dockX + 34, dockY - 25); ctx.bezierCurveTo(dockX + 140, dockY + 68, attachX - 110, attachY - 104, attachX, attachY); ctx.stroke(); ctx.restore();
    ctx.strokeStyle = tetherColor; ctx.lineWidth = 4; ctx.beginPath();
    ctx.moveTo(dockX + 34, dockY - 25); ctx.bezierCurveTo(dockX + 140, dockY + 68, attachX - 110, attachY - 104, attachX, attachY); ctx.stroke();
    ctx.fillStyle = '#F2F3F4'; ctx.fillRect(dockX + 28, dockY - 31, 12, 12);
    drawGenericAsset(ctx, kind, heroX, heroY, heroW, heroRot, activeT > sells ? clamp((activeT - sells) / .1) : 0);
    const stampStart = Math.max(sells + .72, his - .42);
    drawStamp(ctx, heroX - heroW * .15, heroY - 4, heroW, heroRot, clamp((activeT - stampStart) / .34));
    if (activeT >= .12 && activeT < sells + .01) {
      // Put the reaching paw in front of the paper for one readable grab moment.
      drawHedgy(ctx, { x: hedgyX, y: hedgyY, scale: 7.3, t: Math.max(0, activeT - .12), pose, facing: 1,
        look: activeT < his ? 'forward' : 'down', expression });
    }

    // The opening ticket crosses the lens on entry; its matching perforation grows into the exit portal.
    if (activeT < .17) {
      drawGenericAsset(ctx, kind, passX, passY, passW, passRot, 0);
      drawSpeedLines(ctx, activeT, { center: { x: 540, y: 668 }, count: 25, reach: 620, start: 0, duration: .17,
        color: '#D1D3D6', seed: frame.seed + 14, strength: .65 });
    }
    drawBurst(ctx, activeT, { center: { x: hatchX, y: hatchY }, seed: frame.seed + 42, count: 14, kind: 'shard',
      start: sells, life: .45, speed: 174, gravity: 470, drag: .48, floor: 1190, bounce: .08, spin: 3.4, size: 2, color: '#D8D9DB' });
    drawImpactStar(ctx, activeT, { x: hatchX, y: hatchY, size: 66, start: sells, duration: .1, color: '#F4F4F5', seed: frame.seed + 12 });
    if (sellFlash > 0) { ctx.fillStyle = '#F1F1F2'; ctx.globalAlpha = sellFlash * .09; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    if (borrowedHit > 0) {
      ctx.strokeStyle = '#F2F3F5'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(dockX + 30, dockY - 25); ctx.lineTo(dockX + 64, dockY - 61); ctx.lineTo(dockX + 99, dockY - 22); ctx.stroke();
    }
    ctx.restore();
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const { sells, his } = eventPosition(props, dur);
    const cues: Cue[] = [
      { t: 0, kind: 'whip', gain: .7, pan: 0, len: .16 },
      { t: sells, kind: 'impact', gain: 1, pan: .48 },
      { t: his, kind: 'snap', gain: .78, pan: -.15 },
    ];
    return cues.filter(cue => cue.t <= dur && Number.isFinite(cue.t));
  },
};
