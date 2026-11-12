import { clamp, ease, type Cue, type Frame, type ShotProps } from '../core.ts';
import { drawHedgy } from '../actor/hedgy.ts';
import { createCameraRig } from '../fx/rig.ts';
import { drawTicket2D } from '../sets/ticket.ts';
import type { ShotDef } from './index.ts';

const W = 1080, H = 1290, GRID = 4;
const snap = (n: number) => Math.round(n / GRID) * GRID;
const rect = (ctx: Frame['ctx'], color: string, x: number, y: number, w: number, h: number) => {
  ctx.fillStyle = color;
  ctx.fillRect(snap(x), snap(y), Math.max(GRID, snap(w)), Math.max(GRID, snap(h)));
};
const eventTime = (props: ShotProps, kind: string, fallback: number, dur: number) => {
  const event = props.events?.find(item => item.kind.toLowerCase() === kind);
  return clamp(event?.at ?? dur * fallback, 0, dur);
};

function stroke(ctx: Frame['ctx'], points: readonly [number, number][], color: string, width = 8) {
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

function drawKioskWall(ctx: Frame['ctx'], t: number) {
  rect(ctx, '#252A2E', 0, 0, W, 838);
  // Tall steel ribs and a bright ticket window put this exchange inside a real hall.
  for (let i = 0; i < 9; i++) {
    const x = snap(i * 144 - 24 + Math.sin(t * 0.7 + i) * 5);
    rect(ctx, i % 2 ? '#333A3F' : '#444B50', x, 56, 42, 700);
    rect(ctx, '#828A8F', x + 4, 56, 8, 700);
    rect(ctx, '#171B1E', x + 24, 84, 7, 626);
  }
  rect(ctx, '#111518', 660, 178, 364, 492);
  rect(ctx, '#A4AAAD', 676, 194, 332, 460);
  rect(ctx, '#202529', 692, 210, 300, 428);
  // Lit glazing and deep frames make the lender's rack a readable destination.
  rect(ctx, '#60686D', 708, 230, 268, 340);
  rect(ctx, '#171B1E', 720, 242, 244, 316);
  for (let shelf = 0; shelf < 3; shelf++) {
    const sy = 284 + shelf * 88;
    rect(ctx, shelf === 0 ? '#8B9296' : '#646C71', 734, sy, 216, 8);
    rect(ctx, '#30373B', 734, sy + 8, 216, 8);
    for (let i = 0; i < 5; i++) {
      if (shelf > 1 && i > 1) continue;
      drawTicket2D(ctx, 754 + i * 39, sy - 14, 32, { rot: i % 2 ? 0.02 : -0.02 });
    }
  }
  rect(ctx, '#C2C7C9', 692, 594, 300, 20);
  // A recessed doorway and moving light slats add a second depth plane.
  rect(ctx, '#171B1E', 40, 176, 492, 518);
  rect(ctx, '#60676C', 56, 192, 460, 486);
  rect(ctx, '#202529', 72, 208, 428, 454);
  rect(ctx, '#3B4247', 92, 228, 388, 12);
  rect(ctx, '#92999D', 92, 240, 388, 8);
  for (let i = 0; i < 6; i++) {
    const y = 314 + i * 54;
    rect(ctx, i % 2 ? '#50585D' : '#71797E', 110, y, 350, 8);
    rect(ctx, '#292F33', 110, y + 12, 350, 22);
    rect(ctx, '#9AA1A5', 110, y + 35, 350, 5);
  }
  for (let i = 0; i < 12; i++) {
    const x = snap((i * 103 + t * 30) % 1250 - 70);
    rect(ctx, '#777F84', x, 722 + (i % 3) * 24, 36, 4);
  }
  rect(ctx, '#858D92', 0, 808, W, 8);
}

function drawClerk(ctx: Frame['ctx'], t: number, moneyAt: number) {
  // A narrow clerk silhouette and a cuffed arm stay on the far side of the counter.
  polygon(ctx, '#151A1D', [[1012, 354], [1080, 372], [1080, 748], [1044, 764], [1008, 604]]);
  polygon(ctx, '#4A5257', [[1030, 374], [1072, 390], [1072, 560], [1032, 580]]);
  rect(ctx, '#AEB5B8', 1036, 386, 36, 8);
  const reach = ease.outCubic(clamp((t - moneyAt + 0.06) / 0.26));
  const handX = 790 + reach * 12;
  stroke(ctx, [[1078, 486], [1026, 548], [956, 616], [handX + 30, 902]], '#171C1F', 58);
  stroke(ctx, [[1076, 478], [1024, 540], [954, 608], [handX + 30, 894]], '#747D82', 40);
  stroke(ctx, [[1072, 476], [1020, 538], [950, 606], [handX + 30, 894]], '#B5BBBD', 6);
  rect(ctx, '#242A2E', handX + 2, 878, 22, 46);
  // One deliberate wrist movement follows the money, then holds as the ticket is pushed.
  const settle = clamp((t - moneyAt) / 0.2);
  if (settle < 1) {
    rect(ctx, '#DFE2E2', handX + 8, 908 + (1 - settle) * 12, 20, 8);
  }
}

function drawClerkPaw(ctx: Frame['ctx'], t: number, moneyAt: number) {
  const reach = ease.outCubic(clamp((t - moneyAt + 0.06) / 0.26));
  const x = 780 + reach * 12;
  // Palm and fingers land at the requested counter height beside the returning ticket.
  rect(ctx, '#252B2F', x - 20, 868, 104, 52);
  rect(ctx, '#D4D8D9', x - 12, 872, 88, 40);
  rect(ctx, '#F1F2EF', x - 4, 868, 48, 10);
  rect(ctx, '#929A9F', x + 62, 876, 16, 24);
  rect(ctx, '#EFF1EF', x - 34, 878, 36, 12);
  rect(ctx, '#D6DADB', x - 40, 892, 42, 12);
  rect(ctx, '#EFF1EF', x - 30, 906, 34, 10);
  rect(ctx, '#AAB2B5', x + 12, 900, 24, 14);
  for (let i = 0; i < 3; i++) rect(ctx, '#8D969A', x + 2 + i * 18, 902, 8, 4);
}

function drawCounter(ctx: Frame['ctx']) {
  polygon(ctx, '#B9BEC0', [[0, 794], [1080, 730], [1080, 886], [0, 958]]);
  polygon(ctx, '#E1E3E3', [[0, 794], [1080, 730], [1080, 758], [0, 830]]);
  stroke(ctx, [[0, 828], [1080, 764]], '#626A6F', 8);
  polygon(ctx, '#363D42', [[0, 958], [1080, 886], [1080, 1224], [0, 1276]]);
  stroke(ctx, [[0, 968], [1080, 896]], '#858D92', 12);
  for (let i = 0; i < 9; i++) {
    const x = i * 136 - 14;
    polygon(ctx, i % 2 ? '#242A2E' : '#454C51', [[x, 1004], [x + 58, 1000], [x + 58, 1188], [x, 1192]]);
    rect(ctx, '#747C81', x + 62, 1000, 8, 188);
  }
  rect(ctx, '#15191C', 0, 1216, W, 12);
  rect(ctx, '#9AA1A4', 0, 1252, W, 8);
}

function drawHandoffSlot(ctx: Frame['ctx'], t: number, slide: number) {
  // This steel aperture inherits the kiosk slot's position through the zoomthrough cut.
  const pulse = t < 0.18 ? 1 - t / 0.18 : 0;
  const x = 560, y = 850;
  rect(ctx, '#090B0D', x - 156, y - 70, 312, 140);
  rect(ctx, '#7A8388', x - 148, y - 62, 296, 124);
  rect(ctx, '#B7BEC1', x - 142, y - 56, 284, 12);
  rect(ctx, '#252B2F', x - 132, y - 42, 264, 82);
  rect(ctx, '#060809', x - 118, y - 30, 236, 60);
  rect(ctx, '#DCE0E1', x - 102, y - 20, 204, 8);
  rect(ctx, '#90999E', x - 88, y + 20, 176, 6);
  if (pulse > 0 && slide < 0.08) {
    ctx.save(); ctx.globalAlpha *= pulse;
    rect(ctx, '#FFFFFF', x - 84, y - 8, 168, 8);
    ctx.restore();
  }
  for (const [dx, dy] of [[-132, -46], [120, -46], [-132, 38], [120, 38]] as const) {
    rect(ctx, '#D9DEDF', x + dx, y + dy, 12, 12);
  }
}

function drawCash(ctx: Frame['ctx'], t: number, moneyAt: number) {
  const drop = ease.outCubic(clamp((t - (moneyAt - 0.11)) / 0.11));
  const impactAge = t - moneyAt;
  const bounce = impactAge < 0 ? 0 : Math.sin(Math.max(0, impactAge) * 30) * 12 * Math.exp(-Math.max(0, impactAge) * 14);
  const y = 590 + drop * 179 + bounce;
  // A two-note bundle drops from the clerk's side and lands with a square, readable slap.
  rect(ctx, '#252A2E', 580, y + 17, 154, 18);
  rect(ctx, '#7C8489', 570, y + 4, 160, 18);
  rect(ctx, '#D5D9DA', 578, y - 7, 148, 18);
  rect(ctx, '#F0F1EF', 594, y - 15, 120, 12);
  rect(ctx, '#929A9F', 590, y - 2, 116, 4);
  rect(ctx, '#747C80', 604, y + 10, 100, 4);
  if (impactAge >= 0 && impactAge < 0.07) {
    const alpha = 1 - impactAge / 0.07;
    ctx.save(); ctx.globalAlpha *= alpha;
    stroke(ctx, [[538, 758], [558, 750]], '#E7E9E8', 8);
    stroke(ctx, [[742, 756], [762, 748]], '#E7E9E8', 8);
    ctx.restore();
  }
}

function pointOnPath(points: readonly [number, number][], progress: number): [number, number] {
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    lengths.push(length); total += length;
  }
  let remaining = total * clamp(progress);
  for (let i = 0; i < lengths.length; i++) {
    const length = lengths[i]!, a = points[i]!, b = points[i + 1]!;
    if (remaining <= length || i === lengths.length - 1) {
      const p = length > 0 ? clamp(remaining / length) : 0;
      return [a[0] + (b[0] - a[0]) * p, a[1] + (b[1] - a[1]) * p];
    }
    remaining -= length;
  }
  const last = points.at(-1)!;
  return [last[0], last[1]];
}

function drawTether(ctx: Frame['ctx'], t: number, clipAt: number, ticketX: number, ticketY: number, hedgyX: number, hedgyY: number, ticketW: number) {
  const clipAge = t - clipAt;
  const clipped = ease.outCubic(clamp((clipAge + 0.025) / 0.14));
  const wrist: [number, number] = [hedgyX + 12 * 5.5, hedgyY - 24 * 5.5];
  const rackClip: [number, number] = [912, 486];
  const ticketEdge: [number, number] = [ticketX + ticketW * 0.18, ticketY];
  // The cord bows beneath Hedgy's eyes, touches the ticket perforation, then reaches the rack.
  const pts: [number, number][] = [
    wrist,
    [470, 964],
    [ticketX - 38, 964],
    ticketEdge,
    [ticketX + ticketW * 0.78, ticketY + 84],
    [770, 920],
    [842, 700],
    [rackClip[0] - 20 * (1 - clipped), rackClip[1] + 20 * (1 - clipped)],
    rackClip,
  ];
  stroke(ctx, pts, '#20262A', 12);
  stroke(ctx, pts, clipped > 0.55 ? '#AEB6BA' : '#963834', clipped > 0.55 ? 4 : 5);
  // The white flare follows the routed tether as the lender clip snaps shut on “now”.
  if (clipAge >= 0 && clipAge < 0.19) {
    const p = ease.outCubic(clamp(clipAge / 0.19));
    const [x, y] = pointOnPath(pts, p);
    rect(ctx, '#FFFFFF', x - 14, y - 6, 28, 12);
    rect(ctx, '#FFFFFF', x - 6, y - 14, 12, 28);
  }
  if (clipAge >= -0.025 && clipAge < 0.18) {
    rect(ctx, '#F4F5F3', 896, 470, 32, 28);
    rect(ctx, '#42494D', 906, 478, 12, 12);
    rect(ctx, '#FFFFFF', 902, 466, 20, 8);
  } else {
    rect(ctx, '#C4C9CB', 900, 474, 24, 20);
    rect(ctx, '#41484C', 908, 478, 8, 12);
  }
}

export const buybackHandoffShot: ShotDef = {
  name: 'buybackhandoff',
  describe: 'Tight counter close-up: the clerk slaps down the buyback money, slides one shared ticket to Hedgy on “back”, then the tether flashes home to the lender rack on “now”.',
  render(frame: Frame, props: ShotProps) {
    const { ctx, seed } = frame;
    const dur = Math.max(0.01, frame.dur), t = clamp(frame.t, 0, dur);
    const backAt = eventTime(props, 'back', 0.335, dur), nowAt = eventTime(props, 'now', 0.495, dur);
    const moneyAt = Math.min(0.15, dur * 0.14);
    const clipAt = clamp(nowAt + Math.min(0.206, dur * 0.158), 0, dur);
    const slideStart = Math.min(backAt, moneyAt);
    const slideEnd = Math.min(dur, Math.max(backAt + 0.2, 0.64));
    const slide = ease.outCubic(clamp((t - slideStart) / Math.max(0.06, slideEnd - slideStart)));
    // Keep the paper in the open gap between Hedgy and the clerk throughout the handoff.
    const ticketX = 640 - 90 * slide;
    const ticketY = 850 - 4 * slide + Math.sin(slide * Math.PI) * 3;
    const ticketW = 120;
    const hedgyX = 350, hedgyY = 1050;
    const pose = createCameraRig({
      width: W, height: H, seed: seed + 117, handheld: 0.9,
      keyframes: [
        { t: 0, x: -8, y: 5, zoom: 1.015, rot: -0.014 },
        { t: moneyAt, x: -2, y: -4, zoom: 1.03, rot: -0.024, ease: 'inOut' },
        { t: backAt, x: 8, y: -10, zoom: 1.045, rot: 0.002, ease: 'inOut' },
        { t: clipAt, x: 20, y: -8, zoom: 1.06, rot: 0.02, ease: 'inOut' },
        { t: dur, x: 34, y: -18, zoom: 1.075, rot: 0.026, ease: 'inOut' },
      ],
      hits: [moneyAt, backAt, clipAt], punch: 0.01, shake: 3,
    }).poseAt(t);

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#171B1E'; ctx.fillRect(0, 0, W, H);
    // Quiet lateral light drift holds the depth while the counter transaction takes over.
    for (let i = 0; i < 10; i++) {
      const x = snap((i * 153 - t * (16 + i) + 1600) % 1300 - 100);
      rect(ctx, i % 2 ? '#30363A' : '#42494E', x, 0, 4, 790);
    }
    ctx.save();
    ctx.translate(W / 2 + snap(pose.x), H / 2 + snap(pose.y));
    ctx.rotate(pose.rot);
    ctx.scale(pose.zoom, pose.zoom);
    ctx.translate(-W / 2, -H / 2);
    drawKioskWall(ctx, t);
    drawCounter(ctx);
    drawHandoffSlot(ctx, t, slide);
    drawClerk(ctx, t, moneyAt);
    drawTether(ctx, t, clipAt, ticketX, ticketY, hedgyX, hedgyY, ticketW);
    drawClerkPaw(ctx, t, moneyAt);
    drawCash(ctx, t, moneyAt);
    // Paper stays behind Hedgy so his face and eyes remain unobstructed on every frame.
    const ticketRot = -0.02 - 0.025 * slide + Math.sin(t * 15) * 0.008 * (1 - slide);
    drawTicket2D(ctx, ticketX, ticketY, ticketW, { rot: ticketRot });

    const hedgyPose = t < backAt - 0.02 ? 'push' : 'point';
    drawHedgy(ctx, {
      x: hedgyX, y: hedgyY, scale: 5.5, t: Math.max(0, t - backAt),
      pose: hedgyPose, facing: 1,
      expression: t < backAt ? 'worried' : t < clipAt ? 'determined' : 'shocked',
      look: t < backAt ? 'forward' : 'down',
    });

    // Hedgy's paw closes over the ticket edge as it reaches the centre of the exchange.
    if (slide > 0.85) {
      const grip = ease.outCubic(clamp((slide - 0.85) / 0.15));
      const pawX = ticketX - 55 + grip * 5;
      rect(ctx, '#3E281B', pawX, ticketY + 10, 30, 17);
      rect(ctx, '#8A5E3D', pawX + 4, ticketY + 10, 22, 12);
      rect(ctx, '#D4A66F', pawX + 12, ticketY + 10, 10, 6);
    }
    // The camera keeps creeping into the counter's chrome on the final frames.
    const rail = (t * 32) % 192;
    for (let i = -1; i < 8; i++) {
      const x = snap(i * 192 - rail);
      rect(ctx, '#555D62', x, 1264, 108, 8);
      rect(ctx, '#A6ADB0', x + 20, 1272, 8, 16);
    }
    ctx.restore();
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const backAt = eventTime(props, 'back', 0.335, dur), nowAt = eventTime(props, 'now', 0.495, dur);
    const moneyAt = Math.min(0.15, dur * 0.14);
    const clipAt = clamp(nowAt + Math.min(0.206, dur * 0.158), 0, dur);
    const cues: Cue[] = [
      { t: moneyAt, kind: 'cash', gain: 1.28, pan: 0.22 },
      { t: backAt, kind: 'paper', gain: 1.24, pan: -0.12, len: 0.16 },
      { t: clipAt, kind: 'snap', gain: 1.32, pan: 0.48 },
    ];
    return cues.filter(cue => cue.t >= 0 && cue.t <= dur);
  },
};
