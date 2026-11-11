import { clamp, ease, type Cue, type Frame, type ShotProps } from '../core.ts';
import { drawHedgy } from '../actor/hedgy.ts';
import { drawEnv } from '../env/index.ts';
import { createCameraRig } from '../fx/rig.ts';
import { drawBurst, drawEmitter } from '../fx/particles.ts';
import { drawTicket2D } from '../sets/ticket.ts';
import { pixelText } from '../prim.ts';
import type { ShotDef } from './index.ts';

const W = 1080, H = 1290;
const snap = (n: number) => Math.round(n / 4) * 4;

function eventTime(props: ShotProps, kind: string, fallback: number, dur: number) {
  const event = props.events?.find(item => item.kind.toLowerCase() === kind);
  return clamp(event?.at ?? dur * fallback, 0, dur);
}

function layer(ctx: Frame['ctx'], pose: ReturnType<ReturnType<typeof createCameraRig>['poseAt']>, depth: number) {
  ctx.translate(W / 2 + snap(pose.x * depth), H / 2 + snap(pose.y * depth));
  ctx.rotate(pose.rot * depth);
  ctx.scale(1 + (pose.zoom - 1) * depth, 1 + (pose.zoom - 1) * depth);
  ctx.translate(-W / 2, -H / 2);
}

function rect(ctx: Frame['ctx'], color: string, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = color;
  ctx.fillRect(snap(x), snap(y), snap(w), snap(h));
}

function line(ctx: Frame['ctx'], points: readonly [number, number][], color: string, width = 8) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'square';
  ctx.lineJoin = 'miter';
  ctx.beginPath();
  ctx.moveTo(snap(points[0]![0]), snap(points[0]![1]));
  for (let i = 1; i < points.length; i++) ctx.lineTo(snap(points[i]![0]), snap(points[i]![1]));
  ctx.stroke();
}

function doorsAndQueue(ctx: Frame['ctx'], t: number) {
  // Monumental venue doors behind the small kiosk queue.
  rect(ctx, '#101114', 264, 318, 552, 566);
  rect(ctx, '#73777B', 292, 346, 496, 510);
  rect(ctx, '#17191C', 308, 362, 464, 478);
  rect(ctx, '#353A3F', 520, 364, 16, 474);
  rect(ctx, '#555B60', 330, 386, 8, 428);
  rect(ctx, '#555B60', 742, 386, 8, 428);
  // Lit door slits and rows of seating make the lobby read as a deep public venue.
  for (let i = 0; i < 7; i++) {
    const y = 420 + i * 54;
    rect(ctx, i % 2 ? '#4A4E52' : '#62676C', 352, y, 376, 8);
    rect(ctx, '#1B1D20', 368, y + 12, 344, 6);
  }
  rect(ctx, '#9CA2A6', 430, 390, 8, 408);
  rect(ctx, '#9CA2A6', 640, 390, 8, 408);

  const pulse = Math.round(Math.sin(t * 8) * 4);
  // Sparse queue silhouettes, kept clearly behind Hedgy and the counter.
  const people = [[646, 798], [694, 786], [742, 797], [786, 778], [834, 795], [880, 781]];
  for (let i = 0; i < people.length; i++) {
    const [x, y] = people[i]!;
    const bob = i % 2 ? pulse : -pulse;
    rect(ctx, '#24272A', x - 13, y - 52 + bob, 26, 25);
    rect(ctx, '#111316', x - 18, y - 27 + bob, 36, 46);
    rect(ctx, '#4A4F53', x - 6, y - 48 + bob, 8, 8);
  }
  line(ctx, [[610, 840], [914, 800]], '#777D82', 8);
  for (let x = 650; x <= 900; x += 84) rect(ctx, '#A5AAAD', x, 808, 8, 42);
}

function lenderRack(ctx: Frame['ctx'], t: number, clipTravel: number, supplyCount: number) {
  const x = 846, y = 326;
  rect(ctx, '#25292D', x, y, 186, 300);
  rect(ctx, '#9AA0A4', x + 12, y + 12, 162, 276);
  rect(ctx, '#15181B', x + 24, y + 24, 138, 252);
  rect(ctx, '#5F666B', x + 36, y + 64, 114, 12);
  rect(ctx, '#43494E', x + 36, y + 158, 114, 12);
  rect(ctx, '#34393D', x + 36, y + 234, 114, 12);
  const stored = Math.max(1, Math.floor(supplyCount) - 1 + (clipTravel > 0.92 ? 1 : 0));
  for (let i = 0; i < stored; i++) {
    const col = i % 5, row = Math.floor(i / 5), tx = x + 52 + col * 16;
    const shelfY = [34, 126][row] ?? 200;
    rect(ctx, row === 0 ? '#C8C8C6' : '#858B8E', tx, y + shelfY, 8, row === 0 ? 30 : 32);
  }
  // The cuff detaches on “back”; its small bright clip races home along the cable.
  if (clipTravel < 1) {
    const p = ease.outCubic(clipTravel);
    const wrist: [number, number] = [453, 808];
    const rackPoint: [number, number] = [x + 56, y + 72];
    const endX = wrist[0] + (rackPoint[0] - wrist[0]) * p;
    const endY = wrist[1] + (rackPoint[1] - wrist[1]) * p;
    const bendX = wrist[0] + (endX - wrist[0]) * 0.62;
    const bendY = Math.min(wrist[1], endY) - 90 * Math.sin(Math.PI * p);
    line(ctx, [wrist, [bendX, bendY], [endX, endY]], '#D2D5D6', 4);
    rect(ctx, '#F2F2F0', endX - 10, endY - 8, 20, 16);
    rect(ctx, '#41464A', endX - 4, endY - 4, 8, 8);
    if (clipTravel > 0.1 && clipTravel < 0.78) {
      line(ctx, [[endX - 18, endY + 8], [endX - 38, endY + 16], [endX - 50, endY + 8]], '#B7BBC0', 4);
    }
  } else {
    rect(ctx, '#F4F4F2', x + 44, y + 64, 24, 20);
    rect(ctx, '#34383B', x + 52, y + 68, 8, 12);
  }
}

function counter(ctx: Frame['ctx']) {
  // Counter top catches the action; lower courses recede into the lobby.
  ctx.fillStyle = '#BCC0C2';
  ctx.beginPath();
  ctx.moveTo(0, 868); ctx.lineTo(1080, 810); ctx.lineTo(1080, 902); ctx.lineTo(0, 972); ctx.closePath(); ctx.fill();
  rect(ctx, '#3D4246', 0, 908, 1080, 250);
  rect(ctx, '#777D82', 0, 908, 1080, 18);
  for (let x = -24; x <= 1080; x += 96) {
    rect(ctx, '#262A2D', x, 956, 52, 112);
    rect(ctx, '#53595E', x + 52, 956, 12, 112);
  }
  rect(ctx, '#181B1E', 0, 1072, 1080, 16);
  rect(ctx, '#92989C', 0, 1104, 1080, 8);
}

function drawMoney(ctx: Frame['ctx'], t: number, backAt: number, seed: number) {
  const hit = backAt;
  const settle = ease.outCubic(clamp((t - hit + 0.05) / 0.18));
  // Funds are a bundled monochrome stack before impact, then split into paper and coins.
  if (t < hit + 0.06) {
    const slap = t >= hit - 0.06 ? Math.sin(clamp((t - hit + 0.06) / 0.12) * Math.PI) * 16 : 0;
    rect(ctx, '#D0CCC3', 438, 821 + slap, 156, 30);
    rect(ctx, '#F1ECE2', 450, 805 + slap, 136, 26);
    rect(ctx, '#77766F', 460, 814 + slap, 116, 6);
    rect(ctx, '#B9B4AA', 472, 792 + slap, 104, 20);
  }
  if (t >= hit - 0.08) {
    drawBurst(ctx, t, {
      x: 520, y: 824, seed: seed + 71, count: 36, kind: 'coin', start: hit, life: 0.92,
      speed: 252, gravity: 510, drag: 0.3, floor: 892, bounce: 0.22, spin: 7, size: 1, color: '#D3D2CE',
    });
    drawEmitter(ctx, t, {
      kind: 'banknotes', x: 510, y: 808, width: 170, height: 60, seed: seed + 97,
      start: hit + 0.015, rate: 17, life: 0.72, speed: 205, wind: 34, gravity: 0, size: 2, color: '#E6E2D8',
    });
  }
  // Stack settles into a short fan of bill corners after the slap.
  if (settle > 0.88) {
    rect(ctx, '#E4DFD4', 438, 827, 104, 8);
    rect(ctx, '#85837D', 442, 835, 96, 4);
  }
}

function drawSlapHand(ctx: Frame['ctx'], t: number, backAt: number) {
  const reach = ease.outCubic(clamp((t - backAt + 0.2) / 0.2));
  const recoil = clamp((t - backAt - 0.035) / 0.2);
  const alpha = Math.max(0, 1 - recoil);
  if (alpha <= 0) return;
  const y = 762 + reach * 48;
  ctx.save(); ctx.globalAlpha *= alpha;
    line(ctx, [[438, 836], [480, y + 16], [544, y + 7]], '#291910', 24);
    line(ctx, [[438, 834], [480, y + 13], [544, y + 5]], '#8B5C38', 16);
  rect(ctx, '#291910', 528, y - 8, 48, 28);
  rect(ctx, '#A87347', 532, y - 4, 40, 20);
  rect(ctx, '#D4A66F', 538, y - 4, 18, 8);
  ctx.restore();
}

export const buybackHandoffShot: ShotDef = {
  name: 'buybackhandoff',
  describe: 'A forced buyback at a venue kiosk: funds slap down, Hedgy takes the replacement ticket, and his wrist tether clips back to the lender rack. params.asset (default TICKET) and params.supplyCount (2–10) keep the handoff reusable.',
  render(frame: Frame, props: ShotProps) {
    const { ctx, theme, seed } = frame;
    const dur = Math.max(0.01, frame.dur);
    const t = clamp(frame.t, 0, dur);
    const backAt = eventTime(props, 'back', 0.43, dur);
    const rushAt = eventTime(props, 'rush', 0.76, dur);
    const supplyCount = Math.max(2, Math.min(10, Math.floor(Number(props.params?.supplyCount ?? 5) || 5)));
    const clipTravel = clamp((t - backAt + 0.035) / Math.max(0.24, dur * 0.3));
    const handoff = ease.outBack(clamp((t - backAt + 0.025) / Math.max(0.16, dur * 0.27)));
    const rackStart = t < backAt ? 0 : clipTravel;
    const rig = createCameraRig({
      width: W, height: H, seed,
      keyframes: [
        { t: 0, x: 0, y: 0, zoom: 1, rot: 0 },
        { t: dur * 0.23, x: -10, y: -4, zoom: 1.015, rot: -0.006 },
        { t: backAt, x: 18, y: -18, zoom: 1.065, rot: 0.018 },
        { t: Math.min(dur, backAt + dur * 0.24), x: 44, y: 10, zoom: 1.1, rot: -0.012 },
        { t: rushAt, x: -22, y: 2, zoom: 1.045, rot: 0.006 },
        { t: dur, x: 0, y: 0, zoom: 1.025, rot: 0 },
      ],
      hits: [backAt], punch: 0.028, shake: 18, handheld: 2.4,
      whip: [{ at: rushAt, direction: 'right', duration: 0.18, amount: 0.11 }],
    });
    const pose = rig.poseAt(t);

    ctx.imageSmoothingEnabled = false;
    drawEnv(ctx, { type: 'stage', t, theme, seed: seed + 10, width: W, height: H,
      camera: { x: pose.x * 0.14, y: pose.y * 0.12, zoom: 1 + (pose.zoom - 1) * 0.12, rot: pose.rot * 0.1 } });

    ctx.save(); layer(ctx, pose, 0.28); doorsAndQueue(ctx, t); ctx.restore();
    ctx.save(); layer(ctx, pose, 0.62);
    // A single red path keeps pointing up behind the transaction.
    line(ctx, [[94, 612], [254, 590], [350, 556], [480, 550], [560, 505], [676, 477], [746, 418], [862, 390]], '#A52B28', 8);
    for (let i = 0; i < 8; i++) rect(ctx, '#D35A51', 240 + i * 74, 575 - i * 24, 8, 8);
    lenderRack(ctx, t, rackStart, supplyCount);
    ctx.restore();

    ctx.save(); layer(ctx, pose, 0.84);
    drawHedgy(ctx, {
      x: 265, y: 950, scale: 4.6, t: Math.max(0, t - backAt + 0.1),
      pose: t < backAt ? 'push' : 'carry', facing: 1,
      expression: t < backAt + 0.13 ? 'worried' : t < backAt + 0.46 ? 'shocked' : 'determined',
      look: t < backAt ? 'forward' : 'up', prop: 'none',
    });
    counter(ctx);
    drawMoney(ctx, t, backAt, seed);
    drawSlapHand(ctx, t, backAt);
    // Bank notes still settling past the counter lip keep the impact alive.
    if (t >= backAt) drawEmitter(ctx, t, { kind: 'banknotes', x: 514, y: 830, width: 300, height: 40, seed: seed + 121,
      start: backAt + 0.1, rate: 7, life: 0.72, speed: 132, wind: -44, size: 2, color: '#C5C3BD' });
    ctx.restore();

    // The shared ticket stays in close foreground as the camera orbits around the exchange.
    ctx.save(); layer(ctx, pose, 1.12);
    const fly = clamp((t - backAt + 0.06) / Math.max(0.2, dur * 0.35));
    const ticketX = 726 - ease.outCubic(fly) * 72;
    const ticketY = 735 - ease.outCubic(fly) * 116;
    const ticketRot = -0.08 - handoff * 0.11 + Math.sin(t * 11) * (fly < 0.92 ? 0.025 : 0.008);
    drawTicket2D(ctx, ticketX, ticketY, 300, { rot: ticketRot });
    // A diegetic asset tag sits on the kiosk fascia; only one short word is visible.
    const rawAsset = String(props.params?.asset ?? 'TICKET').trim().toUpperCase();
    const assetLabel = rawAsset.split(/[\s_-]+/)[0]?.slice(0, 12) || 'TICKET';
    rect(ctx, '#272B2E', 824, 1120, 184, 56);
    rect(ctx, '#B8BDC0', 836, 1132, 160, 8);
    pixelText(ctx, assetLabel, 916, 1144, 3, { color: theme.fg, align: 'center' });
    ctx.restore();

    // Near-camera rails and paper flecks create a final parallax pass.
    ctx.save(); layer(ctx, pose, 1.22);
    rect(ctx, '#8A9094', -22, 1192, 1124, 20);
    rect(ctx, '#282C30', -22, 1212, 1124, 68);
    rect(ctx, '#C2C5C6', 46, 1170, 10, 120);
    rect(ctx, '#666D72', 1014, 1170, 10, 120);
    for (let i = 0; i < 8; i++) {
      const x = (i * 153 + t * (180 + i * 6)) % 1200 - 60;
      const y = 1070 + (i % 3) * 52;
      ctx.save(); ctx.translate(snap(x), snap(y)); ctx.rotate((i % 2 ? 1 : -1) * 0.5);
      rect(ctx, i % 2 ? '#D5D1C8' : '#777A7D', -5, -18, 10, 36);
      ctx.restore();
    }
    ctx.restore();
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const back = eventTime(props, 'back', 0.43, dur), rush = eventTime(props, 'rush', 0.76, dur);
    const cues: Cue[] = [
      { t: Math.max(0, back - 0.025), kind: 'impact', gain: 1.15, pan: -0.05 },
      { t: back + 0.018, kind: 'paper', gain: 0.9, pan: 0.08 },
      { t: back + 0.15, kind: 'snap', gain: 0.68, pan: 0.46 },
      { t: rush, kind: 'whoosh', gain: 0.76, pan: -0.32, len: 0.14 },
      { t: rush + 0.075, kind: 'whoosh', gain: 0.62, pan: 0.38, len: 0.12 },
      { t: Math.min(dur, rush + 0.12), kind: 'coins', gain: 0.38, pan: 0.1 },
    ];
    return cues.filter(cue => cue.t >= 0 && cue.t <= dur);
  },
};
