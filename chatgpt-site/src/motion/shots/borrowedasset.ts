import { clamp, ease, type Cue, type Frame, type ShotProps } from '../core.ts';
import { drawHedgy } from '../actor/hedgy.ts';
import { drawEnv } from '../env/index.ts';
import { createCameraRig } from '../fx/rig.ts';
import { drawBurst, drawImpactStar } from '../fx/particles.ts';
import { drawHeroTicket, drawHeroTicketBackground, drawHeroTicketFrame, HERO_TICKET_FRAME } from '../sets/heroticket.ts';
import { box, merge, place, render3d, type Material } from '../three.ts';
import type { ShotDef } from './index.ts';

const W = 1080, H = 1290;
const ink = '#070809', deep = '#101114', wall = '#24262A', steel = '#50535A', edge = '#888B91', light = '#D3D4D6', paper = '#EDEDED';
const MATERIALS: Material[] = [
  { ramp: 'steel', tone: .9, spec: .48 },
  { ramp: 'chrome', tone: .96, spec: .72 },
  { ramp: 'ink', tone: .72 },
  { ramp: 'paper', tone: .96 },
];
const RAIL_MESH = merge(
  place(box(1.8, .24, .78, 0, [0, 0, 1, 0, 0, 0]), { pos: [0, .8, 0] }),
  place(box(1.55, 1.9, .65, 0, [0, 0, 1, 0, 0, 0]), { pos: [0, -.18, 0] }),
  place(box(1.22, .2, .06, 2), { pos: [0, -.52, -.36] }),
);

function paramText(params: Record<string, unknown>, key: string, fallback: string): string {
  const value = params[key];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}
function eventAt(props: ShotProps, names: string[], fallback: number, dur: number): number {
  const key = names.map(s => s.toLowerCase());
  const found = props.events?.find(event => key.includes(String(event.kind).toLowerCase()));
  return clamp(found?.at ?? fallback * dur, 0, dur);
}
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

function eventPosition(props: ShotProps, dur: number) {
  return {
    sells: eventAt(props, ['sells', 'sell', 'sale'], .16, dur),
    his: eventAt(props, ['his', 'borrowed', 'borrow'], .68, dur),
  };
}

export const borrowedAssetShot: ShotDef = {
  name: 'borrowedasset',
  describe: 'Hook: the stamped ticket dives from the lens to Hedgy’s paw, then travels to the sale hatch on a taut lender tether. Params: lenderDock, obligationTether, depthLayers.',
  render(frame: Frame, props: ShotProps) {
    const dur = Math.max(.1, frame.dur), t = Math.max(0, frame.t), activeT = clamp(t, 0, dur), p = props.params ?? {};
    const { sells, his } = eventPosition(props, dur);
    const dock = paramText(p, 'lenderDock', 'chrome');
    const dockSide = dock.toLowerCase();
    const tether = paramText(p, 'obligationTether', 'fine steel wire');
    const depthLayers = Math.max(3, Math.min(7, Math.floor(Number(p.depthLayers ?? 6) || 6)));
    const ctx = frame.ctx;
    if (activeT <= 1e-8) {
      drawHeroTicketFrame(ctx);
      return;
    }
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    const sellFlash = Math.max(0, 1 - Math.abs(activeT - sells) / .07);
    const borrowedHit = Math.max(0, 1 - Math.abs(activeT - his) / .07);
    const intro = ease.outCubic(clamp(activeT / .18));
    const rig = createCameraRig({ width: W, height: H, seed: frame.seed + 101, handheld: .55, punch: .04, shake: 5,
      hits: [sells, his],
      keyframes: [
        { t: 0, x: 0, y: 0, zoom: 1, rot: 0 },
        { t: .42, x: 10, y: -10, zoom: 1.035, rot: .004, ease: 'inOut' },
        { t: .92, x: -18, y: 12, zoom: 1.065, rot: -.008, ease: 'inOut' },
        { t: 1.56, x: 12, y: -8, zoom: 1.08, rot: .005, ease: 'inOut' },
        { t: dur, x: -8, y: -4, zoom: 1.07, rot: 0, ease: 'inOut' },
      ],
    });
    drawHeroTicketBackground(ctx);
    rig.apply(ctx, t);
    ctx.save(); ctx.globalAlpha *= intro;
    drawLobby(frame, t, depthLayers);

    // The lender dock and sale hatch frame a full-height ticket exchange.
    const dockAnchor = dockSide.includes('right') ? 324 : dockSide.includes('left') ? 188 : 252;
    const dockX = dockAnchor + Math.sin(t * .25) * 6, dockY = 730;
    render3d(ctx, frame.theme, {
      x: dockX - 128, y: 448, w: 256, h: 438, zoom: 226,
      yaw: Math.sin(t * .6) * .08, pitch: .18, distance: 6.2, cell: 3, outline: true,
      ambient: .42, rim: .5, light: [-.55, .78, -.35], fog: { near: 8, far: 18 },
    }, [{ mesh: RAIL_MESH, materials: MATERIALS, rot: [0, t * .04, 0] }]);
    drawLenderDock(ctx, dockX, dockY, t);

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

    const pawX = 534, pawY = 695, pawWidth = 310, pawRotation = .025;
    const intoPaw = ease.outCubic(clamp(activeT / .5));
    const toHatch = ease.inOutCubic(clamp((activeT - .5) / 1.0));
    const startX = mix(HERO_TICKET_FRAME.x, pawX, intoPaw), startY = mix(HERO_TICKET_FRAME.y, pawY, intoPaw);
    const startWidth = mix(HERO_TICKET_FRAME.width, pawWidth, intoPaw), startRotation = mix(HERO_TICKET_FRAME.rotation, pawRotation, intoPaw);
    const x = mix(startX, hatchX - 30, toHatch), y = mix(startY, hatchY, toHatch);
    const width = mix(startWidth, 344, toHatch), rotation = mix(startRotation, -.11, toHatch) + Math.sin(activeT * 9) * .008;

    // Hedgy reaches at the left rail, then leans into the one-way sale hatch.
    const hedgyX = 470 + Math.sin(t * 1.2) * 3, hedgyY = 1030 + Math.sin(t * 4.2) * 1.5, hedgyScale = 6.4;
    const pose = activeT < .5 ? 'carry' : activeT < 1.5 ? 'push' : activeT < his ? 'carry' : 'shock';
    const expression = activeT < sells ? 'determined' : activeT < his ? 'smug' : 'shocked';
    ctx.fillStyle = '#0C0D0F'; ctx.fillRect(hedgyX - 174, hedgyY + 7, 348, 14);
    ctx.fillStyle = '#4C4F55'; ctx.fillRect(hedgyX - 130, hedgyY + 10, 260, 6);
    drawHedgy(ctx, { x: hedgyX, y: hedgyY, scale: hedgyScale, t: activeT, pose, facing: 1, look: activeT < his ? 'forward' : 'down', expression });

    // A straight silver line stays under tension from the lender slot to the ticket stub.
    const tetherColor = tether.toLowerCase().includes('paper') ? '#D0D1D3' : '#E4E6E8';
    const attachX = x - width * .47, attachY = y + Math.sin(t * 7) * 2;
    const lineStartX = dockX + 34, lineStartY = dockY - 25;
    ctx.save(); ctx.globalAlpha *= .22; ctx.strokeStyle = '#F2F3F4'; ctx.lineWidth = 14; ctx.beginPath();
    ctx.moveTo(lineStartX, lineStartY); ctx.lineTo(attachX, attachY); ctx.stroke(); ctx.restore();
    ctx.strokeStyle = tetherColor; ctx.lineWidth = 4; ctx.beginPath();
    ctx.moveTo(lineStartX, lineStartY); ctx.lineTo(attachX, attachY); ctx.stroke();
    ctx.fillStyle = '#F2F3F4'; ctx.fillRect(dockX + 28, dockY - 31, 12, 12);
    ctx.restore();

    drawHeroTicket(ctx, { x, y, width, rotation, stamp: HERO_TICKET_FRAME.stamp });
    if (activeT >= .12 && activeT < .58) {
      // Re-drawing the actor on top puts his paw over the ticket edge during the catch.
      drawHedgy(ctx, { x: hedgyX, y: hedgyY, scale: hedgyScale, t: activeT, pose: 'carry', facing: 1, look: 'forward', expression: 'determined' });
    }
    const hitX = mix(HERO_TICKET_FRAME.x, pawX, ease.outCubic(clamp(sells / .5)));
    const hitY = mix(HERO_TICKET_FRAME.y, pawY, ease.outCubic(clamp(sells / .5)));
    drawBurst(ctx, activeT, { center: { x: hatchX, y: hatchY }, seed: frame.seed + 42, count: 14, kind: 'shard',
      start: Math.max(sells, 1.42), life: .45, speed: 174, gravity: 470, drag: .48, floor: 1190, bounce: .08, spin: 3.4, size: 2, color: '#D8D9DB' });
    drawImpactStar(ctx, activeT, { x: hitX, y: hitY, size: 66, start: sells, duration: .1, color: '#F4F4F5', seed: frame.seed + 12 });
    if (sellFlash > 0) { ctx.save(); ctx.fillStyle = '#F1F1F2'; ctx.globalAlpha *= sellFlash * .09; ctx.fillRect(0, 0, W, H); ctx.restore(); }
    if (borrowedHit > 0) {
      ctx.strokeStyle = '#F2F3F5'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(dockX + 30, dockY - 25); ctx.lineTo(dockX + 64, dockY - 61); ctx.lineTo(dockX + 99, dockY - 22); ctx.stroke();
    }
    ctx.restore();
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const { sells, his } = eventPosition(props, dur);
    const cues: Cue[] = [
      { t: 0, kind: 'bass', gain: .78, pan: 0, len: .18 },
      { t: .15, kind: 'paper', gain: .72, pan: -.12, len: .16 },
      { t: sells, kind: 'paper', gain: 1.5, pan: .48 },
      { t: sells + .035, kind: 'coin', gain: .66, pan: .5 },
      { t: Math.max(0, his - .035), kind: 'clack', gain: .68, pan: -.15 },
      { t: his, kind: 'snap', gain: 1.5, pan: -.15 },
    ];
    return cues.filter(cue => cue.t <= dur && Number.isFinite(cue.t));
  },
};
