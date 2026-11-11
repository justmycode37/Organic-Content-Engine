import { clamp, ease, type Cue, type Frame, type ShotProps } from '../core.ts';
import { drawHedgy } from '../actor/hedgy.ts';
import { drawEnv } from '../env/index.ts';
import { createCameraRig } from '../fx/rig.ts';
import { drawBurst, drawMotionStreak } from '../fx/particles.ts';
import { pixelText } from '../prim.ts';
import { drawTicket2D, TICKET_MATERIALS, ticketMesh } from '../sets/ticket.ts';
import { box, cylinder, merge, place, render3d, type Material, type Mesh } from '../three.ts';
import type { ShotDef } from './index.ts';

const W = 1080, H = 1290;
const ink = '#070809', wall = '#26282D', steel = '#62656C', edge = '#B4B6BA', paper = '#F0EBE2';
const MATERIALS: Material[] = [
  { ramp: 'steel', tone: .9, spec: .56 },
  { ramp: 'chrome', tone: .95, spec: .76 },
  { ramp: 'ink', tone: .72 },
  { ramp: 'paper', tone: .96 },
];
const PORTAL_MESH = merge(
  place(box(2.7, 1.45, .72, 0, [0, 0, 1, 0, 0, 0]), { pos: [0, 0, 0] }),
  place(box(2.18, .22, .06, 2), { pos: [0, -.23, -.39] }),
  place(box(2.35, .12, .08, 1), { pos: [0, .48, -.4] }),
  place(box(.16, .92, .09, 1), { pos: [-1.1, .02, -.42] }),
  place(box(.16, .92, .09, 1), { pos: [1.1, .02, -.42] }),
);
const SHARE_MESH = merge(box(1.8, 1, .07, 3), place(box(1.1, .16, .025, 2), { pos: [0, .2, -.05] }));
const COIN_MESH = cylinder(.72, .15, 12, 1, 1);

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
function textParam(params: Record<string, unknown>, key: string, fallback: string) {
  const value = params[key];
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 18) : fallback;
}
function numberParam(params: Record<string, unknown>, key: string, fallback: number, min: number, max: number) {
  const value = Number(params[key]);
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}
function alias(props: ShotProps, key: string): string[] {
  const raw = props.params?.syncEvents;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const val = (raw as Record<string, unknown>)[key];
  return typeof val === 'string' ? [val.toLowerCase()] : Array.isArray(val) ? val.map(String).map(s => s.toLowerCase()) : [];
}
function eventAt(props: ShotProps, kind: string, fallback: number, dur: number, also: string[] = []): number {
  const wanted = [kind.toLowerCase(), ...also.map(s => s.toLowerCase()), ...alias(props, kind)];
  const found = props.events?.find(event => wanted.includes(String(event.kind).toLowerCase()));
  return clamp(found?.at ?? fallback * dur, 0, dur);
}
function polygon(ctx: Frame['ctx'], points: [number, number][], fill: string, stroke?: string, width = 4) {
  ctx.beginPath(); ctx.moveTo(points[0]![0], points[0]![1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i]![0], points[i]![1]);
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.lineJoin = 'miter'; ctx.stroke(); }
}
function line(ctx: Frame['ctx'], x1: number, y1: number, x2: number, y2: number, color: string, width = 4) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}
function mix(a: number, b: number, p: number) { return a + (b - a) * ease.outCubic(clamp(p)); }

/** Perspective ticket-counter shaft with repeating counter banks, a central throat and close rails. */
function drawShaft(frame: Frame, t: number, depthLayers: number, cameraPath: string) {
  const { ctx, theme, seed } = frame;
  drawEnv(ctx, { type: 'stage', t, seed: seed + 29, theme, width: W, height: H,
    camera: { x: Math.sin(t * .6) * 18, y: -t * 16, zoom: 1.025, yaw: Math.sin(t * .28) * .05, pitch: .1 } });
  const drift = cameraPath.toLowerCase().includes('left') ? -18 : cameraPath.toLowerCase().includes('right') ? 18 : 0;
  const vpX = 540 + drift + Math.sin(t * .5) * 12, vpY = 258 + (t * 10 % 44);
  // Shaft walls are bright enough to frame the dark central drop.
  polygon(ctx, [[0, 0], [252, 0], [vpX - 112, vpY], [355, 1290], [0, 1290]], '#3F4248', '#B6B8BC', 8);
  polygon(ctx, [[1080, 0], [828, 0], [vpX + 112, vpY], [725, 1290], [1080, 1290]], '#35383D', '#96999F', 8);
  polygon(ctx, [[252, 0], [828, 0], [vpX + 112, vpY], [vpX - 112, vpY]], '#56595F', '#C2C4C8', 8);
  polygon(ctx, [[355, 1290], [725, 1290], [vpX + 112, vpY], [vpX - 112, vpY]], '#111316', '#4E5157', 5);
  // Deep vertical ribs and ducts pull the eye through the shaft.
  for (let i = 0; i < 7; i++) {
    const x = 80 + i * 154;
    const x2 = vpX + (x - 540) * .22;
    line(ctx, x, 0, x2, 1290, i % 2 ? '#65686E' : '#A2A4A9', i % 3 === 0 ? 10 : 5);
    ctx.fillStyle = i % 2 ? '#222429' : '#7A7D83'; ctx.fillRect(x - 8, 0, 14, 1290);
  }
  // Corrugated bulkheads stream upward past camera; each frame has a measurable depth cue.
  const beamCount = Math.max(4, Math.min(8, Math.floor(depthLayers) + 1)), scroll = (t * 250) % 190;
  for (let i = -1; i < beamCount; i++) {
    const y = 122 + i * 190 + scroll;
    if (y < -55 || y > 1260) continue;
    const p = clamp((y - vpY) / Math.max(1, 1280 - vpY)), half = 72 + p * 420, thick = 13 + p * 9;
    const l = vpX - half, r = vpX + half;
    polygon(ctx, [[l - 18, y], [r + 18, y], [r + 32, y + thick], [l - 32, y + thick]], i % 2 ? '#74777D' : '#55585E', '#C2C4C8', 4);
    ctx.fillStyle = '#D0D2D5'; ctx.fillRect(l - 18, y + thick, r - l + 36, 6);
    for (let k = -1; k <= 1; k++) {
      const x = vpX + k * half * .56;
      ctx.fillStyle = '#AEB0B5'; ctx.fillRect(x, y + thick + 5, 6, Math.max(5, 30 * p));
    }
  }
  // Counter windows and numbered-looking blank slats form the market depth, with no floating type.
  const counters = Math.max(3, Math.min(6, Math.floor(depthLayers)));
  for (let row = 0; row < counters; row++) {
    const p = row / Math.max(1, counters - 1), y = 390 + row * 143 + scroll * .62, scale = .34 + p * .67;
    for (const side of [-1, 1]) {
      const x = vpX + side * (120 + p * 370), w = 112 * scale, h = 74 * scale;
      ctx.fillStyle = '#1A1C20'; ctx.fillRect(x - w / 2 - 8, y - h / 2 - 9, w + 16, h + 18);
      ctx.fillStyle = row % 2 ? '#777A80' : '#96999F'; ctx.fillRect(x - w / 2, y - h / 2, w, h);
      ctx.fillStyle = '#17191C'; ctx.fillRect(x - w / 2 + 7, y - h / 2 + 7, w - 14, h * .48);
      ctx.fillStyle = '#C4C6C9'; ctx.fillRect(x - w / 2 + 12, y + h * .2, w * .64, Math.max(3, 4 * scale));
      ctx.fillStyle = '#55585E'; ctx.fillRect(x + w * .27, y + h * .15, Math.max(4, 7 * scale), Math.max(6, 16 * scale));
    }
  }
  // Close rails cross lens at different speeds than the stationary counter banks.
  const railTravel = (t * 350) % 510;
  for (let side = 0; side < 2; side++) {
    const x = side === 0 ? 116 : 948;
    ctx.fillStyle = '#C4C6C9'; ctx.fillRect(x, 0, 16, 1290);
    ctx.fillStyle = '#55585E'; ctx.fillRect(x + 16, 0, 18, 1290);
    for (let y = -210 + railTravel; y < 1320; y += 255) {
      ctx.fillStyle = '#A8AAAF'; ctx.fillRect(x - 32, Math.round(y / 4) * 4, 106, 16);
      ctx.fillStyle = '#23252A'; ctx.fillRect(x - 23, Math.round(y / 4) * 4 + 16, 87, 8);
    }
  }
  // Recessed depth lights and cable runs keep the entire top half occupied.
  for (let i = 0; i < 8; i++) {
    const y = 44 + i * 154 + scroll * .4;
    const span = 84 + i * 52;
    ctx.fillStyle = i % 2 ? '#70737A' : '#C6C8CB';
    ctx.fillRect(Math.round((vpX - span) / 4) * 4, Math.round(y / 4) * 4, Math.round(span * 2 / 4) * 4, 5);
  }
  for (let i = 0; i < 6; i++) {
    const x = 250 + i * 116;
    ctx.fillStyle = '#8F9298'; ctx.fillRect(x, 0, 5, 160 + i * 18);
  }
  // Near-floor crossbar and dithered rivets sell the camera passing through a real shaft.
  ctx.fillStyle = '#C0C2C6'; ctx.fillRect(0, 1210, W, 12);
  ctx.fillStyle = '#32353A'; ctx.fillRect(0, 1222, W, 42);
  for (let i = 0; i < 42; i++) {
    ctx.fillStyle = i % 3 === 0 ? '#D2D3D6' : '#676A70'; ctx.fillRect(i * 27, 1236 + i % 2 * 4, 6, 6);
  }
  // A pale shaft beam highlights the route without introducing a new hue.
  for (let i = 0; i < 12; i++) {
    const x = 466 + i * 12, y = 260 + Math.round(i * 34 + Math.sin(t * 3 + i) * 5);
    ctx.fillStyle = i % 3 ? '#6E7177' : '#D1D3D6'; ctx.fillRect(x, y, 4, 246);
  }
}

function drawPaperAsset(ctx: Frame['ctx'], kind: AssetKind, x: number, y: number, w: number, rot = 0, tear = 0) {
  if (kind === 'ticket') { drawTicket2D(ctx, x, y, w, { rot, tear }); return; }
  ctx.save(); ctx.translate(Math.round(x / 4) * 4, Math.round(y / 4) * 4); ctx.rotate(rot);
  const h = kind === 'coin' ? w * .4 : kind === 'share' ? w * .54 : w * .45;
  if (kind === 'coin') {
    ctx.fillStyle = ink; ctx.beginPath(); ctx.moveTo(-w * .48, -h * .24); ctx.lineTo(-w * .28, -h * .46); ctx.lineTo(w * .23, -h * .46); ctx.lineTo(w * .47, -h * .2);
    ctx.lineTo(w * .45, h * .26); ctx.lineTo(w * .18, h * .46); ctx.lineTo(-w * .3, h * .4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#A9ABB0'; ctx.fillRect(-w * .42, -h * .31, w * .82, h * .6);
    ctx.strokeStyle = '#E0E1E3'; ctx.lineWidth = 4; ctx.strokeRect(-w * .34, -h * .22, w * .66, h * .43);
  } else {
    ctx.fillStyle = ink; ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = paper; ctx.fillRect(-w * .47, -h * .45, w * .94, h * .9);
    ctx.fillStyle = '#3B3D42'; ctx.fillRect(-w * .36, -h * .28, w * .72, h * .12);
    ctx.fillStyle = '#73767C'; ctx.fillRect(-w * .36, h * .04, w * .55, 6); ctx.fillRect(-w * .36, h * .18, w * .32, 5);
    if (kind === 'share') {
      ctx.strokeStyle = '#55585E'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-w * .2, h * .22); ctx.lineTo(-w * .02, -h * .02); ctx.lineTo(w * .08, h * .08); ctx.lineTo(w * .3, -h * .17); ctx.stroke();
    }
  }
  ctx.restore();
}

function drawReceipt(ctx: Frame['ctx'], x: number, y: number, width: number, mode: string, t: number) {
  ctx.save(); ctx.translate(Math.round(x / 4) * 4, Math.round(y / 4) * 4);
  const envelope = mode.toLowerCase().includes('envelope');
  const w = envelope ? width * 1.12 : width, h = envelope ? 114 : 154;
  ctx.fillStyle = ink; ctx.fillRect(-w / 2 - 5, -h / 2 - 5, w + 10, h + 10);
  ctx.fillStyle = envelope ? '#C6C8CB' : paper; ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.fillStyle = envelope ? '#777A80' : '#3B3D42'; ctx.fillRect(-w * .39, -h * .31, w * .78, 11);
  for (let i = 0; i < 5; i++) {
    const widthScale = (i % 2 ? .66 : .8) - i * .035;
    ctx.fillStyle = i % 2 ? '#777A80' : '#A6A8AD'; ctx.fillRect(-w * widthScale / 2, -h * .03 + i * 17, w * widthScale, 5);
  }
  // Perforated lower edge and a receipt fold move under the camera as the paper zips out.
  ctx.fillStyle = '#767980';
  for (let x0 = -w / 2; x0 < w / 2; x0 += 14) ctx.fillRect(x0, h / 2 - 4, 7, 4);
  if (mode.toLowerCase().includes('ledger')) { ctx.fillStyle = '#4E5157'; ctx.fillRect(-w * .42, -h * .42, 8, h * .8); }
  ctx.fillStyle = '#D9DBDE'; ctx.fillRect(-w / 2 + 10, h / 2 - 15 + Math.sin(t * 14) * 2, w - 20, 4);
  ctx.restore();
}

function drawReturnStub(ctx: Frame['ctx'], x: number, y: number, width: number, label: string, progress: number, rotate: number) {
  const w = width, h = 86, snap = (n: number) => Math.round(n / 4) * 4;
  ctx.save(); ctx.translate(snap(x), snap(y)); ctx.rotate(rotate);
  ctx.fillStyle = ink; ctx.fillRect(-w / 2 - 5, -h / 2 - 5, w + 10, h + 10);
  ctx.fillStyle = '#E8E4DC'; ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.fillStyle = '#7D8086'; ctx.fillRect(-w * .46, -h * .38, w * .92, 7);
  ctx.fillStyle = '#27292D'; ctx.fillRect(-w * .44, -h * .29, w * .88, h * .66);
  pixelText(ctx, label.toUpperCase(), -10, -10, 3, { color: '#F1F2F3', align: 'center' });
  // Fine perforation bars on the detachable corner.
  ctx.fillStyle = '#D1D2D5';
  for (let i = 0; i < 6; i++) ctx.fillRect(w * .3 + i * 7, -h * .3, 3, h * .6);
  ctx.fillStyle = '#F7F4ED'; ctx.fillRect(-w / 2 + 5, -h / 2 + 4, Math.max(0, (w - 10) * clamp(progress)), 4);
  ctx.restore();
}

function drawSeal(ctx: Frame['ctx'], x: number, y: number, progress: number) {
  if (progress <= 0) return;
  const scale = .78 + ease.outBack(clamp(progress * 1.05)) * .22;
  ctx.save(); ctx.translate(Math.round(x / 4) * 4, Math.round(y / 4) * 4); ctx.scale(scale, scale);
  ctx.fillStyle = ink; ctx.fillRect(-44, -11, 92, 24);
  ctx.fillStyle = '#ECE9E2'; ctx.fillRect(-40, -7, 84, 16);
  ctx.fillStyle = '#6B6E74'; ctx.fillRect(-33, -3, 66, 7);
  ctx.fillStyle = '#E4E5E7'; ctx.fillRect(31, -3, 10, 7);
  ctx.restore();
}

function timings(props: ShotProps, dur: number) {
  return {
    short: eventAt(props, 'short', .22, dur, ['short-selling', 'selling']),
    promises: eventAt(props, 'promises', .48, dur),
    returns: eventAt(props, 'return', .72, dur, ['returns', 'receipt']),
  };
}

export const shortSaleHandoffShot: ShotDef = {
  name: 'shortsalehandoff',
  describe: 'Camera tracks down a vertical ticket-counter shaft as Hedgy passes a borrowed asset through a one-way sale portal. A return stub stays tethered above, then is sealed to his wrist on the promise beat. Params: asset, salePortal, proceedsContainer, returnReceipt, syncEvents, cameraPath, depthLayers.',
  render(frame: Frame, props: ShotProps) {
    const dur = Math.max(.1, frame.dur), t = clamp(frame.t, 0, dur), p = props.params ?? {}, ctx = frame.ctx, kind = assetKind(p.asset);
    const { short, promises, returns } = timings(props, dur);
    const salePortal = textParam(p, 'salePortal', 'center chrome slot').toLowerCase();
    const proceedsContainer = textParam(p, 'proceedsContainer', 'receipt tray').toLowerCase();
    const returnLabel = textParam(p, 'returnReceipt', 'RETURN 1').toUpperCase();
    const cameraPath = textParam(p, 'cameraPath', 'tracking drop');
    const depthLayers = numberParam(p, 'depthLayers', 5, 3, 7);
    const portalX = salePortal.includes('left') ? 432 : salePortal.includes('right') ? 648 : 540;
    const slotY = 674 + Math.sin(t * 2.4) * 5;
    const promiseProgress = clamp((t - promises + .025) / .13);
    const shortProgress = ease.outExpo(clamp((t - short + .08) / .19));
    const returnProgress = ease.outCubic(clamp((t - (returns - dur * .14)) / (dur * .14)));
    const rig = createCameraRig({
      width: W, height: H, seed: frame.seed + 203, handheld: 1.45, punch: .045, shake: 6, hits: [promises, returns],
      keyframes: [
        { t: 0, x: -5, y: 18, zoom: 1.035, rot: .003 },
        { t: dur * .34, x: 20, y: -26, zoom: 1.06, rot: -.006, ease: 'inOut' },
        { t: dur * .7, x: -18, y: -62, zoom: 1.12, rot: .004, ease: 'inOut' },
        { t: dur, x: -6, y: -91, zoom: 1.17, rot: 0, ease: 'out' },
      ],
      whip: cameraPath.toLowerCase().includes('spiral') ? [{ at: dur * .58, direction: 'left', duration: .24, amount: .12 }] : [],
    });
    ctx.save(); ctx.imageSmoothingEnabled = false; ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip(); rig.apply(ctx, t);
    drawShaft(frame, t, depthLayers, cameraPath);

    // 3D chrome portal anchors the scene; the 2D mechanisms make its paper actions legible.
    render3d(ctx, frame.theme, {
      x: portalX - 215, y: slotY - 130, w: 430, h: 250, zoom: 205,
      yaw: Math.sin(t * .4) * .07, pitch: .16, distance: 6.2, cell: 3, outline: true,
      ambient: .43, rim: .54, light: [-.56, .79, -.34], fog: { near: 7, far: 18 },
    }, [{ mesh: PORTAL_MESH, materials: MATERIALS, rot: [0, t * .035, 0] }]);
    ctx.fillStyle = '#111316'; ctx.fillRect(portalX - 151, slotY - 24, 302, 53);
    ctx.fillStyle = '#D0D2D5'; ctx.fillRect(portalX - 157, slotY - 32, 314, 8);
    ctx.fillRect(portalX - 157, slotY + 29, 314, 8);
    ctx.fillStyle = '#6D7076'; ctx.fillRect(portalX - 144, slotY + 36, 288, 10);
    ctx.fillStyle = '#E2E3E5'; ctx.fillRect(portalX - 135, slotY - 41, 270, 6);
    // Portal depth rails slide as the camera travels down the shaft.
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = i % 2 ? '#51545A' : '#C8CACE'; ctx.fillRect(portalX - 132 + i * 24, slotY - 20, 4, 43);
    }
    // Lender rack and tethered strip are placed above the sale throat in the same vertical axis.
    const rackY = 260 - t * 13;
    ctx.fillStyle = '#202227'; ctx.fillRect(portalX - 148, rackY - 33, 296, 69);
    ctx.fillStyle = '#9A9DA3'; ctx.fillRect(portalX - 176, rackY - 46, 352, 14);
    ctx.fillStyle = '#D1D3D6'; ctx.fillRect(portalX - 162, rackY + 31, 324, 9);
    for (let i = -2; i <= 2; i++) {
      ctx.fillStyle = i % 2 ? '#777A80' : '#C7C9CC'; ctx.fillRect(portalX + i * 48 - 3, rackY - 30, 7, 57);
      ctx.fillStyle = '#D8DADD'; ctx.fillRect(portalX + i * 48 - 8, rackY + 24, 16, 9);
    }
    ctx.fillStyle = '#D9DBDE'; ctx.fillRect(portalX - 68, rackY - 57, 136, 7);

    const assetStart = Math.max(0, short - dur * .18), assetEnd = short + dur * .08;
    const feed = ease.outCubic(clamp((t - assetStart) / Math.max(.01, assetEnd - assetStart)));
    const assetX = portalX - 10, assetY = mix(slotY - 104, slotY + 95, feed);
    if (t < short + dur * .06) {
      // The ticket is pulled down through the one-way mouth; the perforated return piece stays above.
      drawPaperAsset(ctx, kind, assetX, assetY, 286 * (1 - feed * .28), -.02 + feed * .035, feed);
      if (t < dur * .22) {
        render3d(ctx, frame.theme, {
          x: portalX - 126, y: rackY - 22, w: 252, h: 110, zoom: 164, yaw: .18 + t * .1, pitch: .26,
          distance: 5.2, cell: 3, outline: true, ambient: .45, rim: .54,
        }, [{ mesh: assetMesh(kind), materials: assetMaterials(kind), rot: [0, t * .18, -.02] }]);
      }
    }

    // The return stub peels away from the asset but remains tied to the rack by a fine wire.
    const wristX = 606 + Math.sin(t * 1.1) * 5, wristY = 1024 + Math.sin(t * 5.4) * 2;
    const stubP = ease.outBack(clamp((t - promises + .12) / .2));
    const stubX = mix(portalX - 18, wristX - 204, stubP), stubY = mix(rackY + 102, wristY - 34, stubP);
    ctx.strokeStyle = '#D4D6D9'; ctx.lineWidth = 3; ctx.beginPath();
    ctx.moveTo(portalX, rackY + 24);
    ctx.bezierCurveTo(portalX + 56, rackY + 138, stubX - 82, stubY - 82, stubX, stubY);
    ctx.stroke();
    ctx.fillStyle = '#E4E5E7'; ctx.fillRect(portalX - 4, rackY + 20, 8, 8);
    // A short paper link and band visibly pin the stub to Hedgy's wrist on “promises”.
    ctx.strokeStyle = '#F2EFE8'; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(stubX + 107, stubY + 13); ctx.lineTo(wristX - 8, wristY + 18); ctx.stroke();

    // The proceeds receipt zips from the far side after the transfer, while the stub stays with Hedgy.
    const receiptX = portalX - 210 + returnProgress * 24, receiptY = slotY + 72 + returnProgress * 82;
    const receiptWidth = 238 + returnProgress * 18;
    if (t >= returns - dur * .16) {
      drawReceipt(ctx, receiptX, receiptY, receiptWidth, proceedsContainer, t);
      drawMotionStreak(ctx, { x: receiptX - 68, y: receiptY - 24, dx: 0, dy: 1, length: 118, width: 3, alpha: .5 * (1 - returnProgress), color: '#D4D6D9' });
    }

    // Hedgy rides the shaft with one paw at the wrist seal; his sprite stays the only warm color.
    const hedgyX = 728 + Math.sin(t * 1.25) * 6, hedgyY = 1147 + Math.sin(t * 5) * 3;
    ctx.fillStyle = '#0B0C0E'; ctx.fillRect(hedgyX - 190, hedgyY + 4, 380, 18);
    ctx.fillStyle = '#55585E'; ctx.fillRect(hedgyX - 134, hedgyY + 9, 268, 7);
    const hedgyPose = t < promises - .06 ? 'think' : t < returns ? 'point' : 'carry';
    drawHedgy(ctx, { x: hedgyX, y: hedgyY, scale: 7.1, t: Math.max(0, t - promises), pose: hedgyPose, facing: -1,
      look: 'down', expression: t < promises ? 'worried' : t < returns ? 'determined' : 'happy' });
    drawReturnStub(ctx, stubX, stubY, 248, returnLabel, promiseProgress, (1 - stubP) * .11);
    drawSeal(ctx, wristX, wristY + 23, promiseProgress);
    if (promiseProgress > .82) {
      ctx.fillStyle = '#F2F0EA'; ctx.fillRect(wristX + 39, wristY + 12, 8, 18);
      ctx.fillStyle = '#74777D'; ctx.fillRect(wristX + 47, wristY + 12, 8, 18);
    }

    // Pass close guide rails, receipt flecks and a restrained pin-impact burst.
    const railOffset = (t * 240) % 320;
    for (let i = -1; i < 5; i++) {
      const x = 48 + i * 255, y = Math.round((220 + i * 274 + railOffset) / 4) * 4;
      if (y > 40 && y < 1230) {
        ctx.fillStyle = '#C9CBCF'; ctx.fillRect(x, y, 70, 8);
        ctx.fillStyle = '#53565C'; ctx.fillRect(x + 10, y + 8, 9, 68);
        ctx.fillStyle = '#96999F'; ctx.fillRect(x + 53, y + 8, 9, 68);
      }
    }
    drawBurst(ctx, t, { center: [wristX, wristY, 0], projector: point => ({ x: point[0], y: point[1], scale: 1 }),
      seed: frame.seed + 61, count: 12, kind: 'confetti', start: promises, life: .55, speed: 140, gravity: 180,
      drag: .5, floor: 1240, bounce: .1, spin: 4, size: 2, color: '#E7E4DE' });
    ctx.restore();
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const { short, promises, returns } = timings(props, dur);
    const cues: Cue[] = [
      { t: Math.min(.2, dur * .08), kind: 'servo', gain: .63, pan: -.05, len: .18 },
      { t: Math.max(0, short - dur * .1), kind: 'clack', gain: .72, pan: 0 },
      { t: short, kind: 'paper', gain: .67, pan: 0, len: .12 },
      { t: Math.max(short, promises - .045), kind: 'swish', gain: .56, pan: .2, len: .14 },
      { t: promises, kind: 'click', gain: .88, pan: .24 },
      { t: Math.min(dur, promises + .025), kind: 'snap', gain: .68, pan: .2 },
      { t: Math.min(dur, promises + .05), kind: 'paper', gain: .42, pan: .15 },
      { t: Math.max(promises, returns - dur * .15), kind: 'rise', gain: .42, pan: 0, len: dur * .12 },
      { t: returns, kind: 'swish', gain: .88, pan: -.1, len: .2 },
      { t: Math.min(dur, returns + .03), kind: 'paper', gain: .72, pan: -.06 },
      { t: Math.min(dur, returns + .12), kind: 'tick', gain: .38, pan: -.08, step: .6 },
    ];
    return cues.filter(cue => Number.isFinite(cue.t) && cue.t <= dur);
  },
};
