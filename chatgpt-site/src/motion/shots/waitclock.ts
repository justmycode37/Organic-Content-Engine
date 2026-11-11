import { clamp, ease, type Cue, type Frame, type ShotProps } from '../core.ts';
import { drawHedgy } from '../actor/hedgy.ts';
import { createCameraRig } from '../fx/rig.ts';
import { drawTrail } from '../fx/particles.ts';
import { pixelText } from '../prim.ts';
import { CELL } from '../pix.ts';
import { drawTicket2D } from '../sets/ticket.ts';
import type { ShotDef } from './index.ts';

const W = 1080;
const H = 1290;
const snap = (n: number) => Math.round(n / CELL) * CELL;

function eventTime(props: ShotProps, kind: string, dur: number, fallback: number) {
  const event = props.events?.find(item => item.kind.toLowerCase() === kind);
  return clamp(event?.at ?? fallback, 0, Math.max(0, dur));
}

function numberParam(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback;
}

function pixelLine(ctx: Frame['ctx'], x0: number, y0: number, x1: number, y1: number, color: string, size = CELL) {
  let x = Math.round(x0 / CELL), y = Math.round(y0 / CELL);
  const bx = Math.round(x1 / CELL), by = Math.round(y1 / CELL);
  const dx = Math.abs(bx - x), sx = x < bx ? 1 : -1;
  const dy = -Math.abs(by - y), sy = y < by ? 1 : -1;
  let error = dx + dy;
  ctx.fillStyle = color;
  for (let guard = 0; guard < 700; guard++) {
    ctx.fillRect(x * CELL - size / 2, y * CELL - size / 2, size, size);
    if (x === bx && y === by) break;
    const twice = 2 * error;
    if (twice >= dy) { error += dy; x += sx; }
    if (twice <= dx) { error += dx; y += sy; }
  }
}

function ellipseFill(ctx: Frame['ctx'], cx: number, cy: number, rx: number, ry: number, color: string) {
  const top = Math.floor((cy - ry) / CELL) * CELL;
  const bottom = Math.ceil((cy + ry) / CELL) * CELL;
  ctx.fillStyle = color;
  for (let y = top; y <= bottom; y += CELL) {
    const v = (y + CELL / 2 - cy) / ry;
    if (Math.abs(v) > 1) continue;
    const half = rx * Math.sqrt(1 - v * v);
    const left = Math.floor((cx - half) / CELL) * CELL;
    const right = Math.ceil((cx + half) / CELL) * CELL;
    ctx.fillRect(left, y, right - left + CELL, CELL);
  }
}

function ellipseRing(ctx: Frame['ctx'], cx: number, cy: number, rx: number, ry: number, color: string, width = CELL * 2, phase = 0) {
  const steps = Math.ceil(Math.PI * 2 * Math.max(rx, ry) / (CELL * 2.6));
  ctx.fillStyle = color;
  for (let i = 0; i < steps; i++) {
    if ((i + phase) % 17 < 2) continue;
    const a = i / steps * Math.PI * 2;
    const x = snap(cx + Math.cos(a) * rx), y = snap(cy + Math.sin(a) * ry);
    ctx.fillRect(x, y, width, width);
  }
}

function drawVenue(ctx: Frame['ctx'], t: number, cameraX: number) {
  ctx.fillStyle = '#0D0D10'; ctx.fillRect(0, 0, W, H);
  // High roof trusses and five receding balcony tiers give the wait a real arena.
  ctx.fillStyle = '#242429'; ctx.fillRect(0, 110, W, 18);
  ctx.fillStyle = '#626269'; ctx.fillRect(0, 124, W, CELL);
  for (let x = -44; x < W + 50; x += 172) {
    const parallax = Math.round(cameraX * .22);
    ctx.fillStyle = '#39393F'; ctx.fillRect(x + parallax, 72, 10, 82);
    ctx.fillStyle = '#77777E'; ctx.fillRect(x + parallax + 12, 96, 60, 7);
    ctx.fillStyle = '#222227'; ctx.fillRect(x + parallax + 70, 92, 8, 52);
  }
  for (let tier = 0; tier < 5; tier++) {
    const y = 216 + tier * 108, half = 336 + tier * 92;
    ctx.fillStyle = tier % 2 ? '#18181C' : '#202025';
    ctx.fillRect(540 - half, y, half * 2, 40);
    ctx.fillStyle = tier % 2 ? '#55555B' : '#717178';
    ctx.fillRect(540 - half, y, half * 2, CELL);
    ctx.fillStyle = '#09090B'; ctx.fillRect(540 - half + 12, y + 42, half * 2 - 24, 18);
    for (let seat = 0; seat < 13 + tier * 2; seat++) {
      const x = 540 - half + 28 + seat * (2 * half - 56) / Math.max(1, 12 + tier * 2);
      ctx.fillStyle = (seat + tier + Math.floor(t * 2)) % 19 === 0 ? '#A5A5AB' : '#38383E';
      ctx.fillRect(snap(x), y - 22, CELL * 3, CELL * 2);
      ctx.fillStyle = '#101014'; ctx.fillRect(snap(x), y - 10, CELL * 3, CELL);
    }
  }
  // The mezzanine edge stays bright beneath Hedgy; long supports add depth without visual noise.
  ctx.fillStyle = '#121216'; ctx.fillRect(84, 816, 590, 36);
  ctx.fillStyle = '#626269'; ctx.fillRect(84, 812, 590, 8);
  ctx.fillStyle = '#B9B9BE'; ctx.fillRect(84, 812, 590, CELL);
  ctx.fillStyle = '#29292F'; ctx.fillRect(112, 854, 10, 94); ctx.fillRect(624, 854, 10, 94);
  for (let x = 144; x < 650; x += 92) {
    ctx.fillStyle = '#77777E'; ctx.fillRect(x, 782, CELL * 2, 30);
    ctx.fillStyle = '#29292F'; ctx.fillRect(x + CELL * 2, 788, CELL * 2, 24);
  }
  // An arena floor receives the descending trace and gives the clock a clear silhouette.
  ctx.fillStyle = '#151519'; ctx.fillRect(0, 944, W, H - 944);
  ctx.fillStyle = '#45454B'; ctx.fillRect(0, 944, W, CELL);
  for (let i = -5; i <= 5; i++) pixelLine(ctx, 540 + cameraX * .1, 952, 540 + i * 196 + cameraX * .28, 1290, '#28282E', CELL);
  for (let i = 1; i <= 7; i++) {
    const y = 944 + i * i * 7;
    ctx.fillStyle = i % 2 ? '#222227' : '#303036'; ctx.fillRect(0, y, W, CELL);
  }
}

function drawClock(ctx: Frame['ctx'], t: number, dur: number, speed: number) {
  // This is the shared centre of the incoming iris and the outgoing vault wheel.
  const cx = 640, cy = 1000, rx = 184, ry = 202;
  ellipseFill(ctx, cx + 14, cy + 18, rx + 7, ry + 7, '#060608');
  ellipseFill(ctx, cx, cy, rx + 5, ry + 5, '#626269');
  ellipseFill(ctx, cx, cy, rx - 8, ry - 8, '#17171B');
  ellipseRing(ctx, cx, cy, rx, ry, '#E1E1E4', CELL * 3);
  ellipseRing(ctx, cx, cy, rx - 20, ry - 22, '#77777D', CELL * 2, 4);
  ellipseRing(ctx, cx, cy, rx - 38, ry - 40, '#303035', CELL * 2, 9);

  // Twelve long markers are large enough to read while the clock stays fully in frame.
  for (let mark = 0; mark < 12; mark++) {
    const a = -Math.PI / 2 + mark * Math.PI / 6;
    const inner = mark % 3 === 0 ? 151 : 160, outer = 176;
    pixelLine(ctx, cx + Math.cos(a) * inner, cy + Math.sin(a) * inner * 1.04,
      cx + Math.cos(a) * outer, cy + Math.sin(a) * outer * 1.04, mark % 3 === 0 ? '#F1F1F3' : '#8B8B91', mark % 3 === 0 ? 10 : 6);
  }
  pixelText(ctx, '12', cx, cy - 132, 2, { color: '#D5D5D9', align: 'center' });
  pixelText(ctx, '6', cx, cy + 113, 2, { color: '#D5D5D9', align: 'center' });
  pixelText(ctx, '3', cx + 126, cy - 9, 2, { color: '#A5A5AB', align: 'center' });
  pixelText(ctx, '9', cx - 126, cy - 9, 2, { color: '#A5A5AB', align: 'center' });

  // The long hand sweeps several decisive turns and lands on the spotlight at the next cut.
  // Sweep into noon as the upward push begins; the incoming house spot carries the eye on.
  const pushStart = Math.max(0, dur - .21);
  const minute = -Math.PI / 2 + (t - pushStart) * speed * 2.8;
  const hour = -Math.PI / 2 + (t - dur) * speed * 1.55 + .78;
  pixelLine(ctx, cx, cy, cx + Math.cos(hour) * 102, cy + Math.sin(hour) * 112, '#BDBDC2', 14);
  pixelLine(ctx, cx, cy, cx + Math.cos(minute) * 167, cy + Math.sin(minute) * 179, '#F4F4F5', 10);
  pixelLine(ctx, cx + Math.cos(minute) * 158, cy + Math.sin(minute) * 169,
    cx + Math.cos(minute) * 183, cy + Math.sin(minute) * 194, '#8D8D93', 6);
  ellipseFill(ctx, cx - 8, cy - 8, 19, 20, '#D7D7DB');
  ellipseFill(ctx, cx - 4, cy - 4, 9, 10, '#39393F');
}

function drawPriceTrace(ctx: Frame['ctx'], t: number, dur: number, fadeAt: number, seed: number) {
  const settle = ease.outCubic(t / Math.max(.35, dur * .7));
  const fade = ease.outCubic((t - fadeAt) / Math.max(.2, dur * .28));
  const fadeSink = ease.outCubic((t - fadeAt) / Math.max(.25, dur * .31));
  const points = Array.from({ length: 21 }, (_, i) => {
    const u = i / 20;
    const wobble = Math.sin(u * 19 + seed * .013) * 5 + Math.sin(u * 41 + 1.2) * 2;
    return { x: 36 + u * 1008, y: 560 + u * 126 + settle * (u * 52) + fadeSink * 170 + wobble, alpha: .88 * (1 - fade) };
  });
  drawTrail(ctx, points, { color: '#9A9AA0', width: CELL * 2 });
  if (fade < .9) {
    const index = Math.min(points.length - 1, Math.floor(clamp(t / Math.max(.2, dur)) * 17) + 2);
    const head = points[index]!;
    ellipseFill(ctx, snap(head.x), snap(head.y), 7 * (1 - fade), 7 * (1 - fade), '#D0D0D4');
  }
}

function drawWristStub(ctx: Frame['ctx'], t: number, tap: number, check: number) {
  const sway = Math.sin(t * 5.6) * 8 + check * 10;
  drawTrail(ctx, [
    { x: 314, y: 766, alpha: .9 }, { x: 351 + sway, y: 851, alpha: .84 },
    { x: 408 + sway, y: 900, alpha: .7 }, { x: 468 + sway, y: 906, alpha: .62 },
  ], { color: '#B3B3B8', width: CELL * 2 });
  drawTicket2D(ctx, snap(458 + sway), snap(902 - tap * 5), 74, { rot: .08 + Math.sin(t * 3) * .035 + check * .2, tear: .32 });
  ctx.fillStyle = '#222227'; ctx.fillRect(314, 761, 28, 10);
  ctx.fillStyle = '#D3D3D7'; ctx.fillRect(324, 757, CELL * 2, CELL);
}

function drawTap(ctx: Frame['ctx'], x: number, y: number, tap: number) {
  if (tap <= 0) return;
  const lift = Math.round((1 - tap) * 7 / CELL) * CELL;
  ctx.fillStyle = '#77777D'; ctx.fillRect(x - 68, y + 3, 138, CELL);
  ctx.fillStyle = '#E5E5E8';
  ctx.fillRect(x + 30, y - lift, 10, CELL);
  ctx.fillRect(x + 44, y - lift - 8, 8, CELL);
  if (tap > .42) ctx.fillRect(x + 56, y - lift - 16, 8, CELL);
  ctx.fillStyle = '#BEBEC3'; ctx.fillRect(x + 16, y + 14, 10, CELL);
  ctx.fillStyle = '#E8E8EB';
  ctx.fillRect(x + 18, y + 26, Math.round((14 + tap * 22) / CELL) * CELL, CELL);
  ctx.fillRect(x + 8, y + 38, Math.round((9 + tap * 14) / CELL) * CELL, CELL);
}

function drawForegroundTickets(ctx: Frame['ctx'], t: number, dur: number) {
  const p = clamp(t / Math.max(.1, dur));
  // Two lens-close ticket edges pass on opposite sides for a quick parallax cue.
  drawTicket2D(ctx, snap(-82 + p * 204), snap(1160 + Math.sin(t * 4) * 18), 112, { rot: -.4 + t * .24, tear: .18, dark: true });
  drawTicket2D(ctx, snap(1036 - p * 170), snap(504 + Math.sin(t * 3.1 + 1) * 24), 88, { rot: .48 - t * .2, tear: .24, dark: true });
}

export const waitclockShot: ShotDef = {
  name: 'waitclock',
  describe: 'A restless Hedgy taps beside a full-frame vault clock as the grey price trace sinks away; params: clockSpeed (0.2–5), traceDirection (down/up/flat).',
  render(frame: Frame, props: ShotProps) {
    const { ctx, t: rawT, dur, theme, seed } = frame;
    const t = clamp(rawT, 0, Math.max(.01, dur));
    const speed = numberParam(props.params?.clockSpeed, 1.35, .2, 5);
    const waitAt = eventTime(props, 'waits', dur, dur * .22);
    const fadeAt = eventTime(props, 'fade', dur, dur * .66);
    const tapAge = t >= waitAt ? (t - waitAt) % .48 : 1;
    const tap = clamp(1 - tapAge / .13);
    const check = t >= waitAt ? clamp(1 - Math.abs(tapAge - .22) / .12) : 0;
    const rig = createCameraRig({
      width: W, height: H, seed: seed + 17, handheld: 1.7,
      keyframes: [
        { t: 0, x: -14, y: 4, zoom: 1.005, rot: -.004, ease: 'linear' },
        { t: dur * .5, x: 2, y: -14, zoom: 1.028, rot: .008, ease: 'inOut' },
        { t: dur, x: 17, y: -40, zoom: 1.058, rot: -.016, ease: 'inOut' },
      ], hits: [waitAt, fadeAt], punch: .009, shake: 1.8,
    });
    const camera = rig.poseAt(t);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    rig.apply(ctx, t);
    drawVenue(ctx, t, camera.x);
    drawPriceTrace(ctx, t, dur, fadeAt, seed);
    drawWristStub(ctx, t, tap, check);
    drawClock(ctx, t, dur, speed);

    const baseline = 812 + tap * 16;
    ellipseFill(ctx, 264, baseline + 5, 110, 9, '#08080A');
    drawHedgy(ctx, { x: 270, y: baseline, scale: 2.58, t: t - waitAt, pose: 'think', facing: 1, look: 'up', expression: 'worried', prop: 'none' });
    drawTap(ctx, 270, baseline, tap);

    // Close rail and ticket scraps cross the foreground while the camera pushes in.
    ctx.fillStyle = '#08080A'; ctx.fillRect(-24, 1232, 1128, 58);
    ctx.fillStyle = '#73737A'; ctx.fillRect(-24, 1232, 1128, CELL);
    ctx.fillStyle = '#2B2B30'; ctx.fillRect(-24, 1244, 1128, CELL * 2);
    drawForegroundTickets(ctx, t, dur);
    ctx.restore();
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const waitAt = eventTime(props, 'waits', dur, dur * .22);
    const fadeAt = eventTime(props, 'fade', dur, dur * .66);
    return [
      { t: Number(waitAt.toFixed(3)), kind: 'step', pan: -.35, gain: .5 },
      { t: Number(fadeAt.toFixed(3)), kind: 'drop', pan: .42, gain: .52 },
    ];
  },
};
