import { clamp, ease, type Cue, type Frame, type ShotProps } from '../core.ts';
import { drawHedgy } from '../actor/hedgy.ts';
import { createCameraRig } from '../fx/rig.ts';
import { drawTicket2D } from '../sets/ticket.ts';
import { pixelText } from '../prim.ts';
import type { ShotDef } from './index.ts';

const W = 1080, H = 1290, GRID = 4;
const snap = (n: number) => Math.round(n / GRID) * GRID;
const progress = (t: number, start: number, span: number) => clamp((t - start) / Math.max(0.001, span));
const eventTime = (props: ShotProps, kind: string, fallback: number, dur: number) => {
  const event = props.events?.find(item => item.kind.toLowerCase() === kind);
  return clamp(event?.at ?? dur * fallback, 0, dur);
};
const rect = (ctx: Frame['ctx'], color: string, x: number, y: number, w: number, h: number) => {
  ctx.fillStyle = color;
  ctx.fillRect(snap(x), snap(y), Math.max(GRID, snap(w)), Math.max(GRID, snap(h)));
};

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

function polygon(ctx: Frame['ctx'], color: string, points: readonly [number, number][]) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(snap(points[0]![0]), snap(points[0]![1]));
  for (let i = 1; i < points.length; i++) ctx.lineTo(snap(points[i]![0]), snap(points[i]![1]));
  ctx.closePath();
  ctx.fill();
}

function drawBuyer(ctx: Frame['ctx'], x: number, y: number, s: number, phase: number, t: number, reach = 0, facing: 1 | -1 = x < 540 ? 1 : -1) {
  const bob = snap(Math.sin(t * 7 + phase) * Math.max(2, s * 0.035));
  const cx = snap(x), cy = snap(y + bob), f = facing;
  // Stepped head, collar, and shoulders give the queue readable human silhouettes.
  rect(ctx, '#111619', cx - s * 0.25, cy - s * 1.56, s * 0.5, s * 0.43);
  rect(ctx, '#111619', cx - s * 0.31, cy - s * 1.42, s * 0.62, s * 0.25);
  rect(ctx, '#C2C8CA', cx - s * 0.17, cy - s * 1.49, s * 0.34, s * 0.22);
  rect(ctx, '#737C81', cx - s * 0.23, cy - s * 1.16, s * 0.46, s * 0.13);
  polygon(ctx, '#171C1F', [[cx - s * 0.43, cy - s], [cx - s * 0.22, cy - s * 1.08], [cx + s * 0.23, cy - s * 1.08], [cx + s * 0.44, cy - s * 0.94], [cx + s * 0.37, cy - s * 0.22], [cx - s * 0.36, cy - s * 0.22]]);
  polygon(ctx, '#454E53', [[cx - s * 0.34, cy - s * 0.97], [cx - s * 0.18, cy - s], [cx + s * 0.18, cy - s], [cx + s * 0.34, cy - s * 0.91], [cx + s * 0.29, cy - s * 0.28], [cx - s * 0.29, cy - s * 0.28]]);
  rect(ctx, '#AAB1B4', cx - s * 0.06, cy - s * 0.96, s * 0.12, s * 0.48);
  // Two separated legs and feet keep the bodies planted in the crowd.
  rect(ctx, '#181D20', cx - s * 0.3, cy - s * 0.26, s * 0.24, s * 0.23);
  rect(ctx, '#181D20', cx + s * 0.07, cy - s * 0.26, s * 0.24, s * 0.23);
  rect(ctx, '#A4ABAE', cx - s * 0.34, cy - s * 0.06, s * 0.32, s * 0.07);
  rect(ctx, '#A4ABAE', cx + s * 0.04, cy - s * 0.06, s * 0.32, s * 0.07);

  // Bent forearms end in bright hands; near buyers reach toward the rack in distinct poses.
  for (const side of [-1, 1] as const) {
    const shoulder: [number, number] = [cx + side * s * 0.3, cy - s * 0.85];
    const reachX = reach * s * 0.72;
    const elbow: [number, number] = [cx + side * s * 0.52 + f * reachX * 0.36, cy - s * (0.62 + reach * 0.13)];
    const hand: [number, number] = [cx + side * s * 0.66 + f * reachX, cy - s * (0.42 + reach * 0.2)];
    line(ctx, [shoulder, elbow], '#101518', Math.max(8, s * 0.2));
    line(ctx, [shoulder, elbow], '#737C81', Math.max(4, s * 0.13));
    line(ctx, [elbow, hand], '#171C1F', Math.max(8, s * 0.18));
    line(ctx, [elbow, hand], '#AAB1B4', Math.max(4, s * 0.1));
    rect(ctx, '#C7CCCE', hand[0] - s * 0.07, hand[1] - s * 0.1, s * 0.16, s * 0.18);
    rect(ctx, '#E0E3E4', hand[0] + f * s * 0.08, hand[1] - s * 0.16, s * 0.07, s * 0.17);
  }
}

function drawHall(ctx: Frame['ctx'], t: number, pull: number, queueAt: number) {
  rect(ctx, '#252A2E', 0, 0, W, H);
  // The rear volume stays full-frame while a second architectural layer scales away to reveal its size.
  const z = 1.14 - pull * 0.36;
  ctx.save(); ctx.translate(W / 2, 672); ctx.scale(z, z); ctx.translate(-W / 2, -672);
  polygon(ctx, '#111619', [[0, 0], [540, 160], [1080, 0], [1080, 930], [540, 782], [0, 930]]);
  polygon(ctx, '#343B40', [[0, 0], [540, 178], [1080, 0], [1080, 80], [540, 254], [0, 80]]);
  // Roof ribs converge on the tiny market cabinet.
  for (let i = 0; i < 8; i++) {
    const y = 54 + i * 64;
    const inX = i * 18;
    line(ctx, [[-40, y], [220 + inX, y + 30], [540, 220 + i * 42]], i % 2 ? '#727A7F' : '#92999D', i % 3 ? 7 : 11);
    line(ctx, [[1120, y], [860 - inX, y + 30], [540, 220 + i * 42]], i % 2 ? '#727A7F' : '#92999D', i % 3 ? 7 : 11);
    rect(ctx, '#3D454A', 0, y + 36, Math.max(140, 310 - inX), 12);
    rect(ctx, '#3D454A', 1080 - Math.max(140, 310 - inX), y + 36, Math.max(140, 310 - inX), 12);
  }
  // Balconies, lamps, and rows of buyers show the market hall's scale.
  for (let tier = 0; tier < 5; tier++) {
    const y = 264 + tier * 142;
    const depth = tier / 5;
    const xInset = tier * 34;
    const tierW = 416 - tier * 34;
    for (const side of [-1, 1]) {
      const x = side < 0 ? -8 + xInset : W - tierW - xInset + 8;
      rect(ctx, tier % 2 ? '#343B40' : '#454D52', x, y, tierW, 58);
      rect(ctx, '#9AA1A5', x, y, tierW, 8);
      rect(ctx, '#171C1F', x + 8, y + 14, tierW - 16, 34);
      for (let i = 0; i < 21 - tier; i++) {
        const px = x + 18 + i * (tierW - 36) / (21 - tier);
        const bob = Math.sin(t * 6 + i * 1.7 + tier) * 3;
        rect(ctx, i % 4 ? '#51595E' : '#92999D', px, y + 20 + bob, 9, 15);
        rect(ctx, '#242A2E', px - 3, y + 35 + bob, 15, 13);
      }
      rect(ctx, '#BCC1C3', x + 8, y + 62, tierW - 16, 8);
      const lampX = side < 0 ? x + tierW - 28 : x + 8;
      rect(ctx, '#C9CDCE', lampX, y + 70, 16, 42);
    }
    // Roof-to-floor buttresses add a strong vanishing point behind the rack.
    const pillarW = 18 + tier * 4;
    rect(ctx, '#262D31', 48 + tier * 26, 210, pillarW, 642);
    rect(ctx, '#8A9296', 52 + tier * 26, 210, 6, 642);
    rect(ctx, '#262D31', 1014 - tier * 26, 210, pillarW, 642);
    rect(ctx, '#8A9296', 1018 - tier * 26, 210, 6, 642);
  }
  ctx.restore();

  // A bright, expanding floor grid keeps the bottom half out of shadow.
  polygon(ctx, '#434B50', [[0, 806], [540, 700], [1080, 806], [1080, 1290], [0, 1290]]);
  polygon(ctx, '#757D82', [[0, 806], [540, 700], [1080, 806], [1080, 830], [540, 724], [0, 830]]);
  for (let i = -7; i <= 7; i++) {
    const nearX = 540 + i * 240;
    const farX = 540 + i * 22;
    line(ctx, [[farX, 716], [nearX, 1294]], i % 2 ? '#626B70' : '#9BA2A5', i % 3 === 0 ? 8 : 4);
  }
  for (let i = 0; i < 10; i++) {
    const p = (i / 10 + t * 0.12) % 1;
    const y = 740 + p * p * 620;
    const half = 36 + p * 550;
    rect(ctx, i % 3 ? '#51595E' : '#A0A6A9', 540 - half, y, half * 2, p > 0.45 ? 8 : 4);
  }
  // Foreground balcony posts move across lens as the camera retreats.
  const drift = t * 44;
  for (let i = -1; i < 6; i++) {
    const x = snap((i * 282 - drift + 1800) % 1500 - 180);
    rect(ctx, '#30373B', x, 256, 34, 906);
    rect(ctx, '#A2A9AC', x + 8, 256, 6, 906);
    rect(ctx, '#60686D', x + 30, 256, 8, 906);
  }
  // Buyers press into the floor-level market from both wings, in separated depth bands.
  for (let i = 0; i < 7; i++) {
    const xL = 36 + i * 68 + Math.sin(t * 2 + i) * 8;
    const xR = 1044 - i * 68 + Math.sin(t * 2.3 + i) * 8;
    drawBuyer(ctx, xL, 1008 + (i % 3) * 45, 54 + (i % 2) * 12, i * 0.8, t, pull * 0.3, 1);
    drawBuyer(ctx, xR, 1004 + (i % 3) * 46, 52 + (i % 2) * 13, i * 1.1 + 3, t, pull * 0.3, -1);
  }
  for (let i = 0; i < 5; i++) {
    const x = 360 + i * 86 + Math.sin(t * 2.5 + i * 0.8) * 8;
    drawBuyer(ctx, x, 900 + (i % 2) * 34, 74 + (i % 3) * 6, i * 1.3 + 8, t, pull * 0.52, x < 540 ? 1 : -1);
  }
  // One newcomer slides into the foreground queue at the first beat.
  if (t >= queueAt - 0.04) {
    const p = ease.outCubic(progress(t, queueAt, 0.32));
    drawBuyer(ctx, 1190 - 282 * p, 900, 84, 2.4, t, 0.15 + p * 0.58, -1);
  }
  // Lower-edge rail and a close passerby supply another moving parallax layer.
  const passX = (t * 184 + 720) % 1320 - 120;
  drawBuyer(ctx, passX, 1262, 80, 1.8, t, 0.18);
  rect(ctx, '#161B1E', 0, 1250, W, 40);
  rect(ctx, '#92999D', 0, 1246, W, 8);
}

function drawToken(ctx: Frame['ctx'], x: number, y: number, size: number, bright = false) {
  const s = Math.max(12, snap(size));
  const outer = s / 2 + 4, cut = Math.max(4, snap(s * 0.2));
  polygon(ctx, '#13181B', [[x - outer + cut, y - outer], [x + outer - cut, y - outer], [x + outer, y - outer + cut], [x + outer, y + outer - cut], [x + outer - cut, y + outer], [x - outer + cut, y + outer], [x - outer, y + outer - cut], [x - outer, y - outer + cut]]);
  const inner = s / 2;
  polygon(ctx, bright ? '#D8DCDD' : '#899195', [[x - inner + cut, y - inner], [x + inner - cut, y - inner], [x + inner, y - inner + cut], [x + inner, y + inner - cut], [x + inner - cut, y + inner], [x - inner + cut, y + inner], [x - inner, y + inner - cut], [x - inner, y - inner + cut]]);
  rect(ctx, bright ? '#F1F2F0' : '#C1C6C8', x - s * 0.3, y - s * 0.3, s * 0.6, s * 0.6);
  rect(ctx, '#424A4F', x - s * 0.16, y - s * 0.25, s * 0.32, s * 0.5);
  rect(ctx, '#21272A', x - s * 0.1, y - s * 0.08, s * 0.2, s * 0.16);
}

function drawRack(ctx: Frame['ctx'], t: number, transitionT: number, queueAt: number, demandAt: number, departureAt: number, supply: number, asset: string) {
  const x = 338, y = 422, w = 482, h = 318;
  rect(ctx, '#101518', x - 24, y - 24, w + 48, h + 50);
  rect(ctx, '#A5ACAF', x - 12, y - 12, w + 24, h + 24);
  rect(ctx, '#252C30', x, y, w, h);
  rect(ctx, '#858D91', x + 12, y + 12, w - 24, h - 24);
  rect(ctx, '#171D20', x + 24, y + 24, w - 48, h - 48);
  // The glass catches a moving white strip, but the ticket faces stay high contrast.
  const glareX = x + 24 + ((t * 146) % (w - 64));
  rect(ctx, '#737B80', glareX, y + 36, 12, h - 92);
  rect(ctx, '#353D41', x + 30, y + 52, w - 60, 10);
  rect(ctx, '#B2B8BA', x + 34, y + h - 60, w - 68, 10);
  rect(ctx, '#4B5358', x + 34, y + h - 50, w - 68, 26);
  const label = asset.trim().toUpperCase().split(/[\s_-]+/)[0]?.slice(0, 10) || 'TICKET';
  rect(ctx, '#111619', x + 150, y - 62, 182, 40);
  rect(ctx, '#BBC1C3', x + 158, y - 54, 166, 6);
  pixelText(ctx, label, x + 241, y - 42, 3, { color: '#F1F2EF', align: 'center', reveal: 1 });

  const count = Math.max(3, Math.min(8, Math.floor(supply)));
  const slotGap = Math.min(82, (w - 96) / count);
  const startX = x + w / 2 - slotGap * (count - 1) / 2;
  const entrySlot = Math.min(1, count - 1), entryX = startX + entrySlot * slotGap;
  const soldSlot = count - 1;
  for (let i = 0; i < count; i++) {
    const tx = startX + i * slotGap;
    rect(ctx, '#101518', tx - 36, y + 108, 72, 120);
    rect(ctx, '#737B80', tx - 36, y + 108, 72, 8);
    rect(ctx, '#353D41', tx - 36, y + 220, 72, 8);
    if (i === soldSlot && t >= departureAt) {
      rect(ctx, '#242A2E', tx - 23, y + 132, 46, 54);
      rect(ctx, '#565E63', tx - 18, y + 138, 36, 42);
    } else if (i !== entrySlot || transitionT >= 0.24) drawTicket2D(ctx, tx, y + 168, 70, { rot: i % 2 ? 0.018 : -0.018 });
  }
  // Carry the handoff ticket up through the push cut and seat it in the rack.
  if (transitionT < 0.24) {
    const p = ease.outCubic(progress(transitionT, -0.2, 0.44));
    const entryXNow = 520 + (entryX - 520) * p;
    const entryYNow = 1310 + ((y + 168) - 1310) * p;
    drawTicket2D(ctx, entryXNow, entryYNow, 86 - 16 * p, { rot: -0.13 * (1 - p) });
  }
  // One ticket leaves early, lifts into a clear hero beat, then drops into the buyer's hand.
  const flightEnd = demandAt + 0.58;
  if (t >= departureAt && t < flightEnd) {
    const fromX = startX + soldSlot * slotGap, fromY = y + 168;
    const heroX = 710, heroY = 430, launchEnd = departureAt + 0.22, carryAt = demandAt + 0.12;
    let ticketX: number, ticketY: number, ticketSize: number, flight: number;
    if (t < launchEnd) {
      flight = ease.outCubic(progress(t, departureAt, 0.22));
      ticketX = fromX + (heroX - fromX) * flight;
      ticketY = fromY + (heroY - fromY) * flight - Math.sin(flight * Math.PI) * 22;
      ticketSize = 70 + 68 * flight;
    } else if (t < carryAt) {
      flight = 0;
      ticketX = heroX; ticketY = heroY; ticketSize = 138;
    } else {
      flight = ease.outCubic(progress(t, carryAt, 0.46));
      ticketX = heroX + (846 - heroX) * flight;
      ticketY = heroY + (y + h + 70 - heroY) * flight;
      ticketSize = 138 - 56 * flight;
    }
    drawTicket2D(ctx, ticketX, ticketY, ticketSize, { rot: -0.03 - flight * 0.14 });
    rect(ctx, '#F1F3F2', ticketX - ticketSize * 0.52, ticketY + 20, 12, 4);
    rect(ctx, '#BFC6C9', ticketX + ticketSize * 0.48, ticketY - 16, 8, 4);
  } else if (t >= flightEnd) {
    drawTicket2D(ctx, 846, y + h + 70, 82, { rot: -0.17 });
  }
  // Lower lip and vanishing floor line carry the buyer queue into the hall.
  rect(ctx, '#A5ACAF', x - 96, y + h + 24, w + 192, 16);
  rect(ctx, '#454D52', x - 108, y + h + 40, w + 216, 34);
  rect(ctx, '#1A2023', x - 64, y + h + 76, w + 128, 12);
  drawToken(ctx, x + 110, y + h + 14, 44);
  drawToken(ctx, x + 188, y + h + 14, 44);
  drawToken(ctx, x + 266, y + h + 14, 44);
  const tokenJoinAt = Math.max(0, queueAt - 0.24);
  const tokenP = progress(t, tokenJoinAt, 0.22), joinP = ease.outCubic(tokenP);
  const rowY = y + h + 14;
  const joinX = 944 - 262 * joinP;
  const joinY = rowY - (1 - joinP) * 108 - Math.sin(joinP * Math.PI) * 22;
  if (t >= tokenJoinAt - 0.04) drawToken(ctx, joinX, joinY, 42 + 16 * joinP, true);
}

function drawCrowdHands(ctx: Frame['ctx'], t: number, queueAt: number) {
  const press = 0.35 + 0.65 * ease.outCubic(progress(t, queueAt, 0.55));
  const arms: [number, number][][] = [
    [[34, 1090], [124, 980], [224, 886], [326, 790 + 10 * (1 - press)]],
    [[1044, 1078], [954, 966], [876, 872], [802, 790 + 12 * (1 - press)]],
  ];
  for (const [index, points] of arms.entries()) {
    line(ctx, points, '#111619', 54);
    line(ctx, points, index ? '#727B80' : '#858D91', 36);
    line(ctx, points, '#C0C6C8', 8);
    const [hx, hy] = points[points.length - 1]!;
    rect(ctx, '#D2D6D7', hx - 22, hy - 16, 40, 30);
    rect(ctx, '#EFF1F0', hx + (index ? -30 : 10), hy - 20, 30, 8);
    rect(ctx, '#8A9296', hx + (index ? -22 : 4), hy + 8, 22, 8);
  }
}

function applyPull(ctx: Frame['ctx'], zoom: number, x: number, y: number) {
  ctx.translate(W / 2 + snap(x), 720 + snap(y));
  ctx.scale(zoom, zoom);
  ctx.translate(-W / 2, -720);
}

function drawPartialPath(ctx: Frame['ctx'], points: readonly [number, number][], amount: number, color: string, width: number) {
  if (points.length < 2 || amount <= 0) return;
  const scaled = clamp(amount) * (points.length - 1), last = Math.floor(scaled), partial = scaled - last;
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'square'; ctx.lineJoin = 'miter'; ctx.beginPath();
  ctx.moveTo(snap(points[0]![0]), snap(points[0]![1]));
  for (let i = 1; i <= Math.min(last, points.length - 1); i++) ctx.lineTo(snap(points[i]![0]), snap(points[i]![1]));
  if (last < points.length - 1 && partial > 0) {
    const a = points[last]!, b = points[last + 1]!;
    ctx.lineTo(snap(a[0] + (b[0] - a[0]) * partial), snap(a[1] + (b[1] - a[1]) * partial));
  }
  ctx.stroke();
}

function drawPricePath(ctx: Frame['ctx'], anchor: [number, number], t: number, higherAt: number) {
  const [x, y] = anchor;
  const base: [number, number][] = [[x - 8, y + 124], [x - 40, y + 102], [x - 78, y + 78], [x - 104, y + 48]];
  line(ctx, base, '#762321', 12);
  line(ctx, base.slice(-3), '#C44A42', 6);
  const jump = ease.outExpo(progress(t, higherAt, 0.12));
  const stepX = x - 104, stepY = y + 48;
  const raisedY = stepY - 228 * jump;
  if (jump > 0.002) {
    const jumpPts: [number, number][] = [[stepX, stepY], [stepX, raisedY], [stepX + 32 * jump, raisedY]];
    line(ctx, jumpPts, '#9D2F2A', 14); line(ctx, jumpPts, '#E75E54', 6);
  }
  const climb = ease.outCubic(progress(t, higherAt + 0.14, 0.56));
  const climbPts: [number, number][] = [
    [stepX + 32, raisedY], [stepX + 4, raisedY - 180], [stepX - 42, raisedY - 360],
    [stepX - 94, raisedY - 580], [stepX - 146, raisedY - 820], [stepX - 198, raisedY - 1080],
  ];
  drawPartialPath(ctx, climbPts, climb, '#9D2F2A', 14);
  drawPartialPath(ctx, climbPts, climb, '#E75E54', 6);
  const full = (climbPts.length - 1) * climb, segment = Math.min(Math.floor(full), climbPts.length - 2), part = full - segment;
  const a = climbPts[segment]!, b = climbPts[segment + 1]!;
  const head = [a[0] + (b[0] - a[0]) * part, a[1] + (b[1] - a[1]) * part] as const;
  if (jump > 0.002 || climb > 0.002) {
    rect(ctx, '#FF8B80', head[0] - 6, head[1] - 6, 16, 16);
    rect(ctx, '#FFF1EF', head[0] - 2, head[1] - 2, 8, 8);
  }
}

export const miniMarketShot: ShotDef = {
  name: 'minimarket',
  describe: 'The camera pulls back from Hedgy holding his buyback ticket to reveal a dwindling rack in a huge buyer-filled hall. On “demand” one ticket leaves and a buyer token joins; on “higher” the red price path jumps and climbs out of frame.',
  render(frame: Frame, props: ShotProps) {
    const { ctx, seed } = frame;
    const dur = Math.max(0.01, frame.dur), transitionT = frame.t, t = clamp(frame.t, 0, dur);
    const demandAt = eventTime(props, 'demand', 0.372, dur);
    const higherAt = eventTime(props, 'higher', 0.742, dur);
    const queueAt = Math.min(0.4, dur * 0.15);
    const departureAt = Math.max(0, demandAt - 0.28);
    const supply = Math.max(3, Math.min(8, Math.floor(Number(props.params?.supplyCount ?? 5) || 5)));
    const asset = String(props.params?.asset ?? 'TICKET').slice(0, 24);
    const pull = ease.outCubic(progress(t, 0, dur * 0.6));
    const rig = createCameraRig({
      width: W, height: H, seed: seed + 42, handheld: 1.1, hits: [demandAt, higherAt], punch: 0.012, shake: 5,
      keyframes: [
        { t: 0, x: 0, y: 0, zoom: 1.12, rot: 0 },
        { t: Math.min(dur * 0.6, demandAt + 0.58), x: -4, y: 0, zoom: 0.80, rot: 0.002 },
        { t: higherAt, x: 0, y: 24, zoom: 0.80, rot: -0.002 },
        { t: dur, x: 0, y: 180, zoom: 0.78, rot: 0.002 },
      ],
    });
    const pose = rig.poseAt(t);
    ctx.imageSmoothingEnabled = false;
    drawHall(ctx, t, pull, queueAt);

    ctx.save(); applyPull(ctx, pose.zoom, pose.x, pose.y);
    // Small inventory remains a bright focal island against the giant architecture.
    drawRack(ctx, t, transitionT, queueAt, demandAt, departureAt, supply, asset);
    drawCrowdHands(ctx, t, queueAt);
    const hedgyPose = t < demandAt ? 'carry' : t < higherAt ? 'sweat' : 'shock';
    drawHedgy(ctx, {
      x: 298, y: 1020, scale: 6.3, t: Math.max(0, t - demandAt),
      pose: hedgyPose, facing: 1,
      expression: t < demandAt ? 'determined' : t < higherAt ? 'worried' : 'shocked',
      look: t < demandAt ? 'forward' : 'up',
    });
    // The handoff ticket from shot 11 stays in Hedgy's raised paw as the lens retreats.
    const heldX = 560 + Math.sin(t * 4) * 3;
    line(ctx, [[440, 930], [492, 874], [heldX - 42, 826]], '#3E281B', 30);
    line(ctx, [[444, 924], [496, 870], [heldX - 46, 824]], '#8A5E3D', 18);
    rect(ctx, '#D4A66F', heldX - 52, 812, 42, 28);
    rect(ctx, '#E2B982', heldX - 34, 808, 22, 12);
    drawTicket2D(ctx, heldX, 820, 126, { rot: -0.04 + Math.sin(t * 3) * 0.012 });
    drawPricePath(ctx, [842, 514], t, higherAt);
    ctx.restore();

    // A last near-camera rail sweeps upward, giving the next whip-up a moving edge to catch.
    const railY = 1212 - pull * 88;
    rect(ctx, '#272E32', 0, railY, W, 78);
    rect(ctx, '#8B9397', 0, railY, W, 8);
    const railOffset = (t * 118) % 228;
    for (let i = -1; i < 7; i++) {
      const x = snap(i * 228 - railOffset);
      rect(ctx, '#596166', x, railY + 18, 104, 8);
      rect(ctx, '#A7AEB1', x + 18, railY + 28, 8, 30);
    }
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const demandAt = eventTime(props, 'demand', 0.372, dur);
    const higherAt = eventTime(props, 'higher', 0.742, dur);
    const queueAt = Math.min(0.4, dur * 0.15);
    const cues: Cue[] = [
      { t: queueAt + 0.22, kind: 'step', gain: 0.62, pan: 0.78 },
      { t: demandAt, kind: 'paper', gain: 1.4, pan: 0.3 },
      { t: higherAt, kind: 'impact', gain: 1.45, pan: 0.02 },
    ];
    return cues.filter(cue => cue.t >= 0 && cue.t <= dur);
  },
};
