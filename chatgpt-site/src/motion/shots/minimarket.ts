import { clamp, ease, type Cue, type Frame, type ShotProps } from '../core.ts';
import { drawEnv } from '../env/index.ts';
import { createCameraRig } from '../fx/rig.ts';
import { drawBurst, drawSpeedLines } from '../fx/particles.ts';
import { drawTicket2D } from '../sets/ticket.ts';
import { pixelText } from '../prim.ts';
import type { ShotDef } from './index.ts';

const W = 1080, H = 1290;
const snap = (n: number) => Math.round(n / 4) * 4;

function eventTime(props: ShotProps, kind: string, fallback: number, dur: number) {
  const event = props.events?.find(item => item.kind.toLowerCase() === kind);
  return clamp(event?.at ?? dur * fallback, 0, dur);
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

function polygon(ctx: Frame['ctx'], color: string, points: readonly [number, number][]) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(snap(points[0]![0]), snap(points[0]![1]));
  for (let i = 1; i < points.length; i++) ctx.lineTo(snap(points[i]![0]), snap(points[i]![1]));
  ctx.closePath();
  ctx.fill();
}

function drawHall(ctx: Frame['ctx'], time: number) {
  // Huge roof ribs, balcony tiers and a distant entrance make the market feel toy-sized.
  rect(ctx, '#15171A', 0, 0, W, 1290);
  polygon(ctx, '#25292D', [[0, 0], [540, 344], [540, 424], [0, 180]]);
  polygon(ctx, '#25292D', [[1080, 0], [540, 344], [540, 424], [1080, 180]]);
  for (let i = 0; i < 6; i++) {
    const yy = 210 + i * 118;
    const inX = i * 48;
    line(ctx, [[0, yy], [226 + inX, yy + 38], [432 + inX * 0.3, yy + 72]], i % 2 ? '#565C61' : '#73797E', 8);
    line(ctx, [[1080, yy], [854 - inX, yy + 38], [648 - inX * 0.3, yy + 72]], i % 2 ? '#565C61' : '#73797E', 8);
    rect(ctx, '#303438', 0, yy + 42, Math.max(80, 332 - inX), 20);
    rect(ctx, '#303438', 748 + inX, yy + 42, Math.max(80, 332 - inX), 20);
    rect(ctx, '#8A9094', 0, yy + 62, Math.max(72, 324 - inX), 8);
    rect(ctx, '#8A9094', 756 + inX, yy + 62, Math.max(72, 324 - inX), 8);
    for (let seat = 0; seat < 16; seat++) {
      const x = 14 + seat * (17 + i);
      rect(ctx, seat % 3 ? '#41464A' : '#747A7E', x, yy + 12 + (seat % 2) * 8, 10, 12);
      rect(ctx, seat % 2 ? '#35393D' : '#646A6F', 1060 - x, yy + 12 + (seat % 2) * 8, 10, 12);
    }
  }
  // Double doors glow with monochrome spill at the vanishing end of the hall.
  polygon(ctx, '#555B60', [[422, 386], [658, 386], [690, 844], [390, 844]]);
  polygon(ctx, '#171A1D', [[442, 404], [638, 404], [660, 820], [420, 820]]);
  rect(ctx, '#3A4044', 536, 414, 8, 386);
  rect(ctx, '#858B8F', 492, 616, 12, 12);
  rect(ctx, '#858B8F', 576, 616, 12, 12);
  line(ctx, [[0, 1040], [540, 842], [1080, 1040]], '#383D41', 12);
  line(ctx, [[0, 1152], [540, 884], [1080, 1152]], '#2D3135', 12);
  // Foreground venue pillars pass at different times to sell the backward camera move.
  const slide = Math.sin(time * 2.5) * 12;
  rect(ctx, '#30353A', -14 + slide, 152, 52, 1020);
  rect(ctx, '#858B90', 34 + slide, 152, 10, 1020);
  rect(ctx, '#30353A', 1042 - slide, 152, 52, 1020);
  rect(ctx, '#858B90', 1036 - slide, 152, 10, 1020);
}

function drawPriceStep(ctx: Frame['ctx'], lifted: number) {
  const base: [number, number][] = [[140, 488], [300, 488], [300, 472], [424, 472], [424, 456], [540, 456], [540, 440], [604, 440]];
  const jump: [number, number][] = [[604, 440], [604, 384], [720, 384], [720, 368], [830, 368], [830, 320], [924, 320]];
  line(ctx, base, '#81221F', 8);
  for (let i = 0; i < 6; i++) rect(ctx, '#B54139', 196 + i * 68, 480 - i * 8, 8, 8);
  if (lifted > 0) {
    const reach = clamp(lifted * 1.3);
    const full = jump.slice(1);
    const count = Math.max(1, Math.ceil(reach * full.length));
    const path = [[604, 446] as [number, number], ...full.slice(0, count)];
    if (count < full.length) {
      const a = path.at(-1)!, b = full[count]!;
      const local = reach * full.length - Math.floor(reach * full.length);
      path[path.length - 1] = [a[0] + (b[0] - a[0]) * local, a[1] + (b[1] - a[1]) * local];
    }
    line(ctx, path, '#C3453D', 10);
    rect(ctx, '#F07A70', path.at(-1)![0] - 4, path.at(-1)![1] - 4, 12, 12);
  }
}

function drawToken(ctx: Frame['ctx'], x: number, y: number, size = 36, bright = false) {
  const s = Math.max(20, snap(size));
  const u = snap(s / 6);
  const cx = snap(x), cy = snap(y);
  rect(ctx, '#101214', cx - u * 3, cy - u * 3, u * 6, u * 6);
  rect(ctx, bright ? '#C9C8C3' : '#858A8D', cx - u * 2, cy - u * 3, u * 4, u * 6);
  rect(ctx, bright ? '#EEECE5' : '#B4B7B8', cx - u * 3, cy - u * 2, u * 6, u * 4);
  rect(ctx, '#585D60', cx - u, cy - u * 2, u * 2, u * 4);
  rect(ctx, '#E4E2DC', cx - u, cy - u, u * 2, u * 2);
}

function drawRack(ctx: Frame['ctx'], t: number, liftAt: number, supply: number, asset: string, seed: number) {
  const cx = 540, top = 560, width = 636, height = 252;
  rect(ctx, '#111417', cx - width / 2 - 14, top - 20, width + 28, height + 48);
  rect(ctx, '#93999C', cx - width / 2, top - 8, width, 16);
  rect(ctx, '#5E6468', cx - width / 2, top + height + 8, width, 16);
  rect(ctx, '#777D81', cx - width / 2, top, 16, height);
  rect(ctx, '#777D81', cx + width / 2 - 16, top, 16, height);
  rect(ctx, '#24292D', cx - width / 2 + 16, top + 16, width - 32, height - 24);
  // Layered grey glass panes and thin supports retain depth without obscuring the tickets.
  ctx.save(); ctx.globalAlpha *= 0.18; rect(ctx, '#CFD3D4', cx - width / 2 + 28, top + 24, width - 56, height - 48); ctx.restore();
  rect(ctx, '#6F767A', cx - width / 2 + 24, top + 24, 8, height - 48);
  rect(ctx, '#6F767A', cx + width / 2 - 32, top + 24, 8, height - 48);
  rect(ctx, '#8C9295', cx - width / 2 + 28, top + 170, width - 56, 12);
  rect(ctx, '#4E5559', cx - width / 2 + 28, top + 182, width - 56, 22);
  rect(ctx, '#D0D2D0', cx - width / 2 + 84, top + 226, width - 168, 8);

  const count = Math.max(2, Math.min(10, Math.floor(supply)));
  const gap = Math.min(80, (width - 120) / count), left = cx - gap * (count - 1) / 2;
  const ticketWidth = Math.min(70, gap - 8);
  const soldSlot = count - 1;
  const sold = t >= liftAt;
  const assetLabel = asset.trim().toUpperCase().split(/[\s_-]+/)[0]?.slice(0, 14) || 'TICKET';
  rect(ctx, '#272C30', cx - 94, top - 52, 188, 36);
  pixelText(ctx, assetLabel, cx, top - 44, 3, { color: '#F2F2EF', align: 'center', reveal: 1 });
  for (let i = 0; i < count; i++) {
    const x = left + i * gap;
    rect(ctx, '#111315', x - 38, top + 66, 76, 104);
    rect(ctx, '#666D71', x - 38, top + 66, 76, 8);
    rect(ctx, '#777D80', x - 38, top + 162, 76, 8);
    if (!(sold && i === soldSlot)) drawTicket2D(ctx, x, top + 116, ticketWidth, { rot: i % 2 ? 0.018 : -0.018 });
    else {
      rect(ctx, '#0D0F11', x - 26, top + 96, 52, 42);
      rect(ctx, '#353B3F', x - 22, top + 100, 44, 34);
    }
  }
  if (t >= liftAt && t < liftAt + 0.34) {
    const p = ease.outCubic(clamp((t - liftAt) / 0.34));
    const from = left + soldSlot * gap;
    const x = from + (388 - from) * p;
    const y = top + 116 + 116 * p;
    ctx.save(); ctx.globalAlpha *= 1 - p * 0.75;
    drawTicket2D(ctx, x, y, ticketWidth, { rot: -0.12 - p * 0.32, tear: p * 0.08 });
    ctx.restore();
    drawBurst(ctx, t, { x: from, y: top + 112, seed: seed + 51, count: 13, kind: 'shard', start: liftAt, life: 0.32,
      speed: 126, gravity: 120, drag: 0.5, size: 1, color: '#E1E2DF' });
  }
}

function marketGroup(ctx: Frame['ctx'], zoom: number, x: number, y: number) {
  ctx.translate(snap(540 + x), snap(690 + y));
  ctx.scale(zoom, zoom);
  ctx.translate(-540, -690);
}

export const miniMarketShot: ShotDef = {
  name: 'minimarket',
  describe: 'A tiny ticket market sits inside an enormous monochrome venue. A buyer token joins the queue, params.supplyCount (2–10) controls rack inventory, params.asset (default TICKET) labels the glass rack, and the camera pulls sharply back as one ticket sells.',
  render(frame: Frame, props: ShotProps) {
    const { ctx, theme, seed } = frame;
    const dur = Math.max(0.01, frame.dur);
    const t = clamp(frame.t, 0, dur);
    const buyersAt = eventTime(props, 'buyers', 0.35, dur);
    const liftAt = eventTime(props, 'lifts', 0.69, dur);
    const supply = Math.max(2, Math.min(10, Math.floor(Number(props.params?.supplyCount ?? 5) || 5)));
    const asset = String(props.params?.asset ?? 'TICKET').slice(0, 24);
    const rig = createCameraRig({
      width: W, height: H, seed: seed + 18, handheld: 1.2,
      keyframes: [
        { t: 0, x: 0, y: 0, zoom: 1.12, rot: 0 },
        { t: buyersAt, x: -8, y: 2, zoom: 1.08, rot: 0.004 },
        { t: liftAt, x: 14, y: -8, zoom: 1.04, rot: -0.006 },
        { t: Math.min(dur, liftAt + dur * 0.31), x: 0, y: -8, zoom: 0.61, rot: 0 },
        { t: dur, x: 0, y: 0, zoom: 0.56, rot: 0 },
      ],
      whip: [{ at: liftAt + dur * 0.11, direction: 'down', duration: 0.24, amount: 0.12 }],
    });
    const pose = rig.poseAt(t);

    ctx.imageSmoothingEnabled = false;
    drawEnv(ctx, { type: 'stage', t, theme, seed: seed + 6, width: W, height: H,
      camera: { x: pose.x * 0.08, y: pose.y * 0.08, zoom: 1.015, yaw: pose.rot * 0.08, pitch: 0.015 } });
    drawHall(ctx, t);

    // The only red in the hall marks the upward price path; “lifts” adds its new step.
    const liftProgress = clamp((t - liftAt + 0.02) / Math.max(0.14, dur * 0.18));
    drawPriceStep(ctx, liftProgress);

    ctx.save();
    marketGroup(ctx, pose.zoom, pose.x * 0.35, pose.y * 0.25);
    ctx.rotate(pose.rot * 0.18);
    drawRack(ctx, t, liftAt, supply, asset, seed);

    // Buyer tokens line up at the near lip. The arriving one slides into the queue on “buyers”.
    rect(ctx, '#A2A7A9', 232, 820, 616, 20);
    rect(ctx, '#363B3F', 216, 840, 648, 38);
    rect(ctx, '#111315', 260, 878, 560, 14);
    drawToken(ctx, 488, 802, 36, false);
    drawToken(ctx, 440, 802, 36, false);
    drawToken(ctx, 392, 802, 36, false);
    const buyerP = ease.outExpo(clamp((t - buyersAt) / Math.max(0.12, dur * 0.2)));
    const arrivingX = 870 - buyerP * 526;
    const arrivingY = 802 - Math.sin(buyerP * Math.PI) * 12;
    if (t >= buyersAt - 0.06) drawToken(ctx, arrivingX, arrivingY, 42, true);
    rect(ctx, '#262A2D', 252, 900, 24, 82);
    rect(ctx, '#A0A5A8', 246, 896, 36, 10);
    rect(ctx, '#262A2D', 804, 900, 24, 82);
    rect(ctx, '#A0A5A8', 798, 896, 36, 10);
    ctx.restore();

    // Foreground scale cues hold their size while the little cabinet recedes.
    rect(ctx, '#202428', 0, 1080, W, 210);
    polygon(ctx, '#747A7E', [[0, 1060], [540, 1000], [1080, 1060], [1080, 1088], [540, 1028], [0, 1088]]);
    rect(ctx, '#A3A8AB', 0, 1088, W, 8);
    for (let i = 0; i < 12; i++) {
      const x = i * 102 - 28;
      rect(ctx, i % 2 ? '#5E6468' : '#33383C', x, 1136, 14, 154);
      rect(ctx, '#91979A', x + 14, 1136, 6, 154);
    }
    // Camera retreat rakes close speed marks across the lens for a single clean accent beat.
    if (t >= liftAt && t <= liftAt + dur * 0.42) {
      drawSpeedLines(ctx, t, { center: { x: 540, y: 700 }, count: 18, reach: 320, start: liftAt, duration: dur * 0.28,
        color: '#BFC3C4', seed: seed + 101, strength: 0.38 });
    }
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const buyers = eventTime(props, 'buyers', 0.35, dur), lifts = eventTime(props, 'lifts', 0.69, dur);
    const cues: Cue[] = [
      { t: buyers, kind: 'coin', gain: 0.72, pan: -0.18 },
      { t: lifts, kind: 'tick', gain: 0.78, pan: 0.14 },
      { t: lifts + 0.075, kind: 'tick', gain: 0.58, pan: 0.31 },
      { t: lifts + 0.12, kind: 'bass', gain: 0.72, pan: 0 },
      { t: lifts + 0.015, kind: 'whoosh', gain: 0.52, len: 0.23, pan: 0.02 },
    ];
    return cues.filter(cue => cue.t >= 0 && cue.t <= dur);
  },
};
