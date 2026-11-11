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

function drawClerk(ctx: Frame['ctx'], t: number, slapAt: number) {
  // A narrow clerk silhouette and a cuffed arm stay on the far side of the counter.
  polygon(ctx, '#151A1D', [[1012, 354], [1080, 372], [1080, 748], [1044, 764], [1008, 604]]);
  polygon(ctx, '#4A5257', [[1030, 374], [1072, 390], [1072, 560], [1032, 580]]);
  rect(ctx, '#AEB5B8', 1036, 386, 36, 8);
  const reach = ease.outCubic(clamp((t - slapAt + 0.1) / 0.3));
  const handX = 790 + reach * 12;
  stroke(ctx, [[1078, 486], [1026, 548], [956, 616], [handX + 30, 710]], '#171C1F', 58);
  stroke(ctx, [[1076, 478], [1024, 540], [954, 608], [handX + 30, 702]], '#747D82', 40);
  stroke(ctx, [[1072, 476], [1020, 538], [950, 606], [handX + 30, 700]], '#B5BBBD', 6);
  rect(ctx, '#242A2E', handX + 2, 690, 22, 46);
  // One deliberate wrist movement follows the money, then holds as the ticket is pushed.
  const settle = clamp((t - slapAt) / 0.2);
  if (settle < 1) {
    rect(ctx, '#DFE2E2', handX + 8, 722 + (1 - settle) * 12, 20, 8);
  }
}

function drawClerkPaw(ctx: Frame['ctx'], t: number, slapAt: number) {
  const reach = ease.outCubic(clamp((t - slapAt + 0.1) / 0.3));
  const x = 780 + reach * 12;
  // The paw sits clearly above the counter surface, with fingers reaching toward Hedgy's ticket.
  rect(ctx, '#252B2F', x - 20, 684, 104, 52);
  rect(ctx, '#D4D8D9', x - 12, 688, 88, 40);
  rect(ctx, '#F1F2EF', x - 4, 684, 48, 10);
  rect(ctx, '#929A9F', x + 62, 692, 16, 24);
  rect(ctx, '#EFF1EF', x - 34, 694, 36, 12);
  rect(ctx, '#D6DADB', x - 40, 708, 42, 12);
  rect(ctx, '#EFF1EF', x - 30, 722, 34, 10);
  rect(ctx, '#AAB2B5', x + 12, 716, 24, 14);
  for (let i = 0; i < 3; i++) rect(ctx, '#8D969A', x + 2 + i * 18, 718, 8, 4);
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

function drawCash(ctx: Frame['ctx'], t: number, slapAt: number) {
  const drop = ease.outCubic(clamp((t - (slapAt - 0.12)) / 0.12));
  const impactAge = t - slapAt;
  const bounce = impactAge < 0 ? 0 : Math.sin(Math.max(0, impactAge) * 30) * 12 * Math.exp(-Math.max(0, impactAge) * 14);
  const y = 590 + drop * 179 - (impactAge < 0 ? 0 : 0) + bounce;
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

function drawTether(ctx: Frame['ctx'], t: number, nowAt: number) {
  const snapAge = t - nowAt;
  const taut = ease.outCubic(clamp((snapAge + 0.03) / 0.12));
  const slack = 54 * (1 - taut);
  const wrist: [number, number] = [382, 808], rackClip: [number, number] = [912, 486];
  const pts: [number, number][] = [wrist, [442, 680 + slack], [650, 582 + slack * 0.42], [822, 520], rackClip];
  stroke(ctx, pts, '#20262A', 12);
  stroke(ctx, pts, snapAge >= -0.025 && snapAge < 0.12 ? '#F1F3F2' : '#9AA2A6', snapAge >= -0.025 && snapAge < 0.12 ? 8 : 4);
  // The only white flare is attached to the moving tether and races toward its rack clip.
  if (snapAge >= 0 && snapAge < 0.15) {
    const p = ease.outCubic(clamp(snapAge / 0.15));
    const x = wrist[0] + (rackClip[0] - wrist[0]) * p;
    const y = wrist[1] + (rackClip[1] - wrist[1]) * p - Math.sin(Math.PI * p) * 106 * (1 - taut * 0.35);
    rect(ctx, '#FFFFFF', x - 14, y - 6, 28, 12);
    rect(ctx, '#FFFFFF', x - 6, y - 14, 12, 28);
  }
  if (snapAge > -0.03 && snapAge < 0.17) {
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
    const slapAt = clamp(backAt - Math.min(0.22, dur * 0.17), 0, dur);
    const slide = ease.outCubic(clamp((t - backAt) / Math.max(0.12, Math.min(0.2, dur * 0.16))));
    const pose = createCameraRig({
      width: W, height: H, seed: seed + 117, handheld: 1.35,
      keyframes: [
        { t: 0, x: 0, y: 6, zoom: 1.015, rot: 0 },
        { t: slapAt, x: -8, y: -4, zoom: 1.035, rot: -0.003 },
        { t: backAt, x: 12, y: -14, zoom: 1.075, rot: 0.004 },
        { t: nowAt, x: 22, y: -10, zoom: 1.085, rot: -0.004 },
        { t: dur, x: 42, y: -24, zoom: 1.12, rot: 0.002 },
      ],
      hits: [slapAt, nowAt], punch: 0.012, shake: 5,
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
    drawTether(ctx, t, nowAt);
    drawClerk(ctx, t, slapAt);
    drawCounter(ctx);
    drawClerkPaw(ctx, t, slapAt);

    const hedgyPose = t < backAt - 0.02 ? 'push' : 'carry';
    drawHedgy(ctx, {
      x: 286, y: 1068, scale: 6.1, t: Math.max(0, t - backAt),
      pose: hedgyPose, facing: 1,
      expression: t < backAt ? 'worried' : t < nowAt ? 'determined' : 'shocked',
      look: t < backAt ? 'forward' : t < nowAt ? 'down' : 'up',
    });

    drawCash(ctx, t, slapAt);
    // Ticket starts directly under the clerk's paw and slides over the counter into Hedgy's reach.
    const ticketX = 798 - 368 * slide;
    const ticketY = 795 - 20 * slide + Math.sin(slide * Math.PI) * 8;
    const ticketRot = -0.02 - 0.03 * slide + Math.sin(t * 15) * 0.008 * (1 - slide);
    drawTicket2D(ctx, ticketX, ticketY, 244, { rot: ticketRot });
    if (slide > 0.85) {
      const grip = ease.outCubic(clamp((slide - 0.85) / 0.15));
      const pawX = ticketX - 108 + grip * 8;
      rect(ctx, '#3E281B', pawX, ticketY + 22, 44, 28);
      rect(ctx, '#8A5E3D', pawX + 4, ticketY + 22, 36, 20);
      rect(ctx, '#D4A66F', pawX + 14, ticketY + 22, 14, 8);
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
    const slapAt = clamp(backAt - Math.min(0.22, dur * 0.17), 0, dur);
    const cues: Cue[] = [
      { t: slapAt, kind: 'impact', gain: 0.9, pan: 0.22 },
      { t: backAt, kind: 'paper', gain: 0.78, pan: -0.12, len: 0.28 },
      { t: nowAt, kind: 'snap', gain: 0.72, pan: 0.48 },
    ];
    return cues.filter(cue => cue.t >= 0 && cue.t <= dur);
  },
};
