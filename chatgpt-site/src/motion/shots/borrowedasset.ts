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
const ink = '#070809', deep = '#101114', wall = '#24262A', steel = '#50535A', edge = '#888B91', light = '#D3D4D6', paper = '#F0EBE2';
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
  // Ceiling ribs run toward the distant city, with top-left key-light bands.
  for (let i = 0; i < 9; i++) {
    const x = i * 135;
    ctx.strokeStyle = i < 5 ? '#BFC1C5' : '#696C72'; ctx.lineWidth = i % 3 === 0 ? 8 : 4;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(vpX + (x - 540) * .18, vpY - 52); ctx.stroke();
  }
  // Balcony tiers compress toward the city. Repeating rails make the scale read at a glance.
  const tierCount = Math.max(3, Math.min(7, Math.floor(depthLayers)));
  for (let i = 0; i < tierCount; i++) {
    const p = i / Math.max(1, tierCount - 1), y = 232 + p * 410, half = 520 - p * 240;
    const x1 = vpX - half, x2 = vpX + half, thick = 22 - p * 7;
    polygon(ctx, [[x1 - 22, y], [x2 + 22, y], [x2 + 14, y + thick], [x1 - 14, y + thick]], i % 2 ? '#777A80' : '#5A5D63', '#B6B8BC', 4);
    ctx.fillStyle = '#C8C9CC'; ctx.fillRect(x1 - 6, y + thick, x2 - x1 + 12, 7);
    for (let x = x1; x < x2; x += Math.max(30, 82 - p * 36)) {
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
  // Foreground steel handrail and recurring lens-side cross braces.
  const railShift = (t * 190) % 420;
  ctx.fillStyle = '#B9BBC0'; ctx.fillRect(0, 1162 + railShift * .08, W, 9);
  ctx.fillStyle = '#3A3D42'; ctx.fillRect(0, 1171 + railShift * .08, W, 16);
  for (let x = -50 + railShift; x < 1130; x += 212) {
    ctx.fillStyle = '#8D9096'; ctx.fillRect(Math.round(x / 4) * 4, 1142, 8, 148);
    ctx.fillStyle = '#D1D2D4'; ctx.fillRect(Math.round(x / 4) * 4 + 8, 1142, 4, 148);
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
    sells: eventAt(props, ['sells', 'sell', 'sale'], .49, dur),
    borrowed: eventAt(props, ['borrowed', 'borrow'], .76, dur),
  };
}

function poseOf(t: number, grab: number, sells: number) {
  if (t < grab - .08) return { pose: 'idle' as const, expression: 'curious' as const };
  if (t < sells + .08) return { pose: 'carry' as const, expression: 'determined' as const };
  return { pose: 'push' as const, expression: 'shocked' as const };
}

export const borrowedAssetShot: ShotDef = {
  name: 'borrowedasset',
  describe: 'Hook: a giant asset rockets out of depth into a noir venue lobby; Hedgy snatches it from a chrome lender dock and sells it through a hatch with the tether intact. Params: asset (ticket default; share, coin, banknote), lenderDock, obligationTether, heroAction, cameraEntry, depthLayers.',
  render(frame: Frame, props: ShotProps) {
    const dur = Math.max(.1, frame.dur), t = clamp(frame.t, 0, dur), p = props.params ?? {}, kind = assetKind(p.asset);
    const { sells, borrowed } = eventPosition(props, dur), grab = Math.max(.16 * dur, sells - .18 * dur);
    const dock = paramText(p, 'lenderDock', 'chrome');
    const dockSide = dock.toLowerCase();
    const action = paramText(p, 'heroAction', 'snatch-flip').toLowerCase();
    const tether = paramText(p, 'obligationTether', 'fine steel wire');
    const cameraEntry = paramText(p, 'cameraEntry', 'whip-dive');
    const depthLayers = Math.max(3, Math.min(7, Math.floor(Number(p.depthLayers ?? 6) || 6)));
    const ctx = frame.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    const sellFlash = Math.max(0, 1 - Math.abs(t - sells) / .075);
    const borrowedHit = Math.max(0, 1 - Math.abs(t - borrowed) / .06);
    const rig = createCameraRig({ width: W, height: H, seed: frame.seed + 101, handheld: 1.8, punch: .055, shake: 9,
      hits: [sells, borrowed],
      keyframes: [
        { t: 0, x: 8, y: 12, zoom: 1.055, rot: -.005 },
        { t: dur * .18, x: -28, y: 16, zoom: .99, rot: -.008, ease: 'out' },
        { t: dur * .52, x: 10, y: -14, zoom: 1.04, rot: .006, ease: 'inOut' },
        { t: dur, x: -14, y: -24, zoom: 1.08, rot: -.003, ease: 'out' },
      ],
      whip: cameraEntry === 'whip-dive' ? [{ at: dur * .16, direction: 'down', duration: .25, amount: .2 }] : [],
    });
    rig.apply(ctx, t);
    drawLobby(frame, t, depthLayers);

    // The chrome lender dock sits in a recessed balcony bay. Mesh landmarks stay stable across variants.
    const dockAnchor = dockSide.includes('right') ? 324 : dockSide.includes('left') ? 188 : 252;
    const dockX = dockAnchor + Math.sin(t * .25) * 8, dockY = 730;
    render3d(ctx, frame.theme, {
      x: dockX - 128, y: 448, w: 256, h: 438, zoom: 226,
      yaw: Math.sin(t * .6) * .08, pitch: .18, distance: 6.2, cell: 3, outline: true,
      ambient: .42, rim: .5, light: [-.55, .78, -.35], fog: { near: 8, far: 18 },
    }, [{ mesh: RAIL_MESH, materials: MATERIALS, rot: [0, t * .04, 0] }]);
    drawLenderDock(ctx, dockX, dockY, t);
    // A second small 3D pass makes the borrowed hero prop continuous with the shared ticket model.
    const closeOut = ease.outCubic(clamp(t / Math.max(.01, dur * .115)));
    if (t < dur * .15 && kind !== 'ticket') {
      ctx.save(); ctx.globalAlpha *= 1 - closeOut;
      render3d(ctx, frame.theme, {
        x: dockX - 118, y: 600, w: 236, h: 130, zoom: 150, yaw: .26 + t * .2,
        pitch: .25, distance: 4.8, cell: 3, outline: true, ambient: .45, rim: .55,
      }, [{ mesh: assetMesh(kind), materials: assetMaterials(kind), rot: [0, t * .28, -.04] }]);
      ctx.restore();
    } else if (t < dur * .15) {
      ctx.save(); ctx.globalAlpha *= 1 - closeOut;
      render3d(ctx, frame.theme, {
        x: dockX - 118, y: 600, w: 236, h: 130, zoom: 150, yaw: .26 + t * .2,
        pitch: .25, distance: 4.8, cell: 3, outline: true, ambient: .48, rim: .58,
      }, [{ mesh: ticketMesh(), materials: TICKET_MATERIALS, rot: [0, t * .28, -.04] }]);
      ctx.restore();
    }

    // Sale hatch: a deep mouth in a heavy shutter. The hatch is open for the flip.
    const hatchY = 798, hatchX = 780, open = ease.outCubic(clamp((t - sells + .15) / .26));
    ctx.fillStyle = ink; ctx.fillRect(hatchX - 124, hatchY - 162, 248, 286);
    ctx.fillStyle = '#777A80'; ctx.fillRect(hatchX - 148, hatchY - 186, 296, 24);
    ctx.fillRect(hatchX - 148, hatchY + 124, 296, 24);
    ctx.fillStyle = '#C0C2C6'; ctx.fillRect(hatchX - 148, hatchY - 186, 16, 334); ctx.fillRect(hatchX + 132, hatchY - 186, 16, 334);
    ctx.fillStyle = '#3A3C41'; ctx.fillRect(hatchX - 114, hatchY - 136, 228, 238);
    ctx.fillStyle = '#A7A9AE'; ctx.fillRect(hatchX - 102, hatchY - 120, 204, 16);
    const shutterY = hatchY - 118 + open * 202;
    ctx.fillStyle = '#B9BBC0'; ctx.fillRect(hatchX - 98, Math.round(shutterY / 4) * 4, 196, 24);
    ctx.fillStyle = '#70737A'; for (let i = 0; i < 10; i++) ctx.fillRect(hatchX - 90 + i * 20, Math.round(shutterY / 4) * 4 + 5, 4, 15);
    ctx.fillStyle = '#E5E6E8'; ctx.fillRect(hatchX - 166, hatchY - 196, 332, 8);

    const rushEnd = dur * .115, enterDock = dur * .23, grabEnd = grab + dur * .035, sellStart = Math.max(grabEnd, sells - dur * .15), sellEnd = sells + dur * .09;
    let x = 540, y = 625, w = 1320, rot = -.025;
    if (t <= rushEnd) {
      const q = ease.outExpo(clamp(t / Math.max(.01, rushEnd)));
      x = interpolate(540, dockX + 5, q); y = interpolate(630, dockY - 26, q); w = interpolate(1320, 350, q); rot = -.03 + q * .035;
    } else if (t <= grab) {
      const q = clamp((t - rushEnd) / Math.max(.01, grab - rushEnd));
      x = interpolate(dockX + 5, 510, q); y = interpolate(dockY - 26, 858, q); w = interpolate(350, 300, q); rot = .005 + Math.sin(q * Math.PI) * .09;
    } else if (t <= sells) {
      const q = clamp((t - grab) / Math.max(.01, sells - grab));
      x = interpolate(510, hatchX - 14, q); y = interpolate(858, hatchY - 6, q); w = interpolate(300, 322, q);
      rot = .02 + q * (action.includes('pass') ? -.16 : -.38);
    } else if (t <= sellEnd) {
      const q = ease.outBack(clamp((t - sells) / Math.max(.01, sellEnd - sells)));
      x = interpolate(hatchX - 14, hatchX + 6, q); y = interpolate(hatchY - 6, hatchY + 14, q); w = interpolate(322, 252, q); rot = -.38 * (1 - q);
    } else {
      x = hatchX + 6; y = hatchY + 14; w = 252; rot = 0;
    }
    // Static target ticket on the slot face is hidden by the rushing 2D prop as it arrives.
    const sourceAlpha = t < rushEnd ? .22 * (1 - closeOut) : 0;
    if (sourceAlpha > .01) {
      ctx.save(); ctx.globalAlpha *= sourceAlpha;
      render3d(ctx, frame.theme, {
        x: dockX - 118, y: dockY - 48, w: 236, h: 130, zoom: 172, yaw: .2, pitch: .28,
        distance: 5.2, cell: 3, outline: true, ambient: .48, rim: .55,
      }, [{ mesh: assetMesh(kind), materials: assetMaterials(kind), rot: [0, 0, -.03] }]);
      ctx.restore();
    }

    // Fine line remains attached to the borrowed asset through the sale hatch.
    const tetherColor = tether.toLowerCase().includes('paper') ? '#C8C2B8' : '#D5D7DA';
    ctx.strokeStyle = tetherColor; ctx.lineWidth = 3; ctx.beginPath();
    const attachX = x - w * (kind === 'ticket' ? .47 : .46), attachY = y + Math.sin(t * 6) * 6;
    ctx.moveTo(dockX + 34, dockY - 25);
    ctx.bezierCurveTo(dockX + 100, dockY + 74, attachX - 94, attachY - 72, attachX, attachY);
    ctx.stroke();
    ctx.fillStyle = '#E3E4E6'; ctx.fillRect(dockX + 29, dockY - 30, 10, 10);

    ctx.save();
    drawGenericAsset(ctx, kind, x, y, w, rot, t > sells ? clamp((t - sells) / .1) : 0);
    stampAsset(ctx, kind, x, y, w, rot, t >= borrowed ? clamp((t - borrowed + .025) / .075) : 0);
    ctx.restore();

    const actor = poseOf(t, grab, sells);
    const hedgyX = 520 + Math.sin(t * 1.25) * 5, hedgyY = 1127 + Math.sin(t * 6) * 2;
    ctx.fillStyle = '#0C0D0F'; ctx.fillRect(hedgyX - 200, hedgyY + 7, 400, 17);
    ctx.fillStyle = '#4C4F55'; ctx.fillRect(hedgyX - 148, hedgyY + 10, 296, 7);
    drawHedgy(ctx, { x: hedgyX, y: hedgyY, scale: 7.2, t: Math.max(0, t - grab), pose: actor.pose, facing: 1,
      look: 'forward', expression: actor.expression === 'curious' ? 'smug' : actor.expression });

    // Lens-side paper grit and rails accelerate on entry, then snap on the sale.
    drawSpeedLines(ctx, t, { center: { x: 540, y: 652 }, count: 27, reach: 560, start: 0, duration: dur * .16, color: '#D1D3D6', seed: frame.seed + 14, strength: .6 });
    drawBurst(ctx, t, { center: { x: hatchX, y: hatchY }, seed: frame.seed + 42, count: 24, kind: 'shard',
      start: sells, life: .72, speed: 206, gravity: 520, drag: .4, floor: 1190, bounce: .13, spin: 4, size: 2, color: '#D8D9DB' });
    drawImpactStar(ctx, t, { x: hatchX, y: hatchY, size: 78, start: sells, duration: .12, color: '#F4F4F5', seed: frame.seed + 12 });
    if (sellFlash > 0) { ctx.fillStyle = '#F1F1F2'; ctx.globalAlpha = sellFlash * .12; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    if (borrowedHit > 0) {
      ctx.strokeStyle = '#F2F3F5'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(dockX + 30, dockY - 25); ctx.lineTo(dockX + 64, dockY - 61); ctx.lineTo(dockX + 99, dockY - 22); ctx.stroke();
    }
    ctx.restore();
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const { sells, borrowed } = eventPosition(props, dur);
    const cues: Cue[] = [
      { t: 0, kind: 'bass', gain: .82, pan: 0 },
      { t: Math.min(dur * .05, .11), kind: 'whip', gain: .65, pan: 0, len: .18 },
      { t: dur * .16, kind: 'swish', gain: .72, pan: -.3, len: .16 },
      { t: Math.max(0, sells - dur * .12), kind: 'clack', gain: .58, pan: -.48 },
      { t: Math.max(0, sells - dur * .04), kind: 'paper', gain: .72, pan: .25, len: .09 },
      { t: sells, kind: 'impact', gain: 1, pan: .48 },
      { t: Math.min(dur, sells + .03), kind: 'coin', gain: .5, pan: .55, step: .3 },
      { t: Math.max(sells, borrowed - dur * .07), kind: 'stamp', gain: .7, pan: .43 },
      { t: borrowed, kind: 'snap', gain: .88, pan: -.15 },
      { t: Math.min(dur, borrowed + .035), kind: 'swish', gain: .38, pan: -.12 },
    ];
    return cues.filter(cue => cue.t <= dur && Number.isFinite(cue.t));
  },
};
