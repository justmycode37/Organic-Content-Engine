import { clamp, ease, lerp, type Cue, type Frame, type ShotProps } from '../core.ts';
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
  // The clock face takes the vault wheel's centre and radius for a clean iris match.
  const cx = 540, cy = 645, scale = 1.342, r = 202;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(scale, scale);
  ellipseFill(ctx, 14, 18, r + 7, r + 7, '#060608');
  ellipseFill(ctx, 0, 0, r + 5, r + 5, '#626269');
  ellipseFill(ctx, 0, 0, r - 8, r - 8, '#17171B');
  ellipseRing(ctx, 0, 0, r, r, '#E1E1E4', CELL * 3);
  ellipseRing(ctx, 0, 0, r - 20, r - 22, '#77777D', CELL * 2, 4);
  ellipseRing(ctx, 0, 0, r - 38, r - 40, '#303035', CELL * 2, 9);

  // Twelve long markers are large enough to read while the clock stays fully in frame.
  for (let mark = 0; mark < 12; mark++) {
    const a = -Math.PI / 2 + mark * Math.PI / 6;
    const inner = mark % 3 === 0 ? 151 : 160, outer = 176;
    pixelLine(ctx, Math.cos(a) * inner, Math.sin(a) * inner,
      Math.cos(a) * outer, Math.sin(a) * outer, mark % 3 === 0 ? '#F1F1F3' : '#8B8B91', mark % 3 === 0 ? 10 : 6);
  }
  pixelText(ctx, '12', 0, -132, 2, { color: '#D5D5D9', align: 'center' });
  pixelText(ctx, '6', 0, 113, 2, { color: '#D5D5D9', align: 'center' });
  pixelText(ctx, '3', 126, -9, 2, { color: '#A5A5AB', align: 'center' });
  pixelText(ctx, '9', -126, -9, 2, { color: '#A5A5AB', align: 'center' });

  // The long hand sweeps through the dial, then reaches the incoming right-hand spotlight.
  const pushStart = Math.max(0, dur - .34);
  const turn = ease.outCubic((t - pushStart) / Math.max(.12, dur - pushStart));
  const minuteBase = -Math.PI / 2 + t * speed * 2.8;
  const spotAngle = Math.atan2(-381, 220);
  const spotAngleNear = spotAngle + Math.round((minuteBase - spotAngle) / (Math.PI * 2)) * Math.PI * 2;
  const minute = lerp(minuteBase, spotAngleNear, turn);
  const minuteLength = 179 + (328 - 179) * turn;
  const hour = -Math.PI / 2 + t * speed * .7 + .78;
  pixelLine(ctx, 0, 0, Math.cos(hour) * 102, Math.sin(hour) * 112, '#BDBDC2', 14);
  pixelLine(ctx, 0, 0, Math.cos(minute) * minuteLength, Math.sin(minute) * minuteLength, '#F4F4F5', 10);
  pixelLine(ctx, Math.cos(minute) * (minuteLength - 9), Math.sin(minute) * (minuteLength - 9),
    Math.cos(minute) * (minuteLength + 12), Math.sin(minute) * (minuteLength + 12), '#8D8D93', 6);
  ellipseFill(ctx, -8, -8, 19, 20, '#D7D7DB');
  ellipseFill(ctx, -4, -4, 9, 10, '#39393F');
  ctx.restore();
}

function drawPriceTrace(ctx: Frame['ctx'], t: number, dur: number, fadeAt: number, seed: number) {
  const settle = ease.outCubic(t / Math.max(.35, dur)) * 24;
  const sink = ease.outCubic((t - fadeAt) / Math.max(.2, Math.min(.34, dur * .2)));
  const fade = ease.outCubic((t - (fadeAt + .16)) / Math.max(.28, Math.min(.5, dur * .29)));
  const points = Array.from({ length: 21 }, (_, i) => {
    const u = i / 20;
    const wobble = Math.sin(u * 19 + seed * .013) * 5 + Math.sin(u * 41 + 1.2) * 2;
    return { x: 36 + u * 1008, y: 560 + u * 126 + settle * u + sink * 260 + wobble, alpha: .86 * (1 - fade * .72) };
  });
  drawTrail(ctx, points, { color: '#9A9AA0', width: CELL * 2 });
  if (fade < .9) {
    const index = Math.min(points.length - 1, Math.floor(clamp(t / Math.max(.2, dur)) * 17) + 2);
    const head = points[index]!;
    ellipseFill(ctx, snap(head.x), snap(head.y), 7 * (1 - fade), 7 * (1 - fade), '#D0D0D4');
  }
}

function drawWristStub(ctx: Frame['ctx'], t: number, check: number) {
  const sway = Math.sin(t * 5.6) * 5 + check * 16;
  // The ticket stays clipped to the wrist on a short, taut tether as Hedgy checks its stub.
  drawTrail(ctx, [
    { x: 382, y: 928, alpha: .94 }, { x: 402 + sway * .35, y: 916, alpha: .9 },
    { x: 470 + sway, y: 900, alpha: .78 },
  ], { color: '#B3B3B8', width: CELL * 2 });
  drawTicket2D(ctx, snap(500 + sway), snap(894 - check * 10), 94, { rot: .08 + Math.sin(t * 3) * .025 + check * .18, tear: .32 });
  ctx.fillStyle = '#222227'; ctx.fillRect(372, 923, 20, 8);
  ctx.fillStyle = '#D3D3D7'; ctx.fillRect(380, 920, CELL * 2, CELL);
}

function drawTap(ctx: Frame['ctx'], x: number, y: number, tap: number) {
  if (tap <= 0) return;
  const footX = x + 8 * 3.612, footY = y + 4;
  const spread = 30 + (1 - tap) * 34;
  ellipseRing(ctx, footX, footY + 2, spread, 8 + (1 - tap) * 5, '#E1E1E4', CELL, Math.round((1 - tap) * 5));
  pixelLine(ctx, footX - 20, footY - 16, footX - 12, footY - 8, '#F1F1F3', CELL);
  pixelLine(ctx, footX + 20, footY - 16, footX + 12, footY - 8, '#F1F1F3', CELL);
  ctx.fillStyle = '#F1F1F3';
  ctx.fillRect(snap(footX - 16), snap(footY - 14 - (1 - tap) * 8), CELL, CELL * 2);
  ctx.fillRect(snap(footX + 16), snap(footY - 14 - (1 - tap) * 8), CELL, CELL * 2);
}

function drawSpotlightTarget(ctx: Frame['ctx'], t: number, dur: number) {
  const reveal = ease.outCubic((t - (dur - .34)) / .34);
  if (reveal <= 0) return;
  ctx.save(); ctx.globalAlpha *= reveal;
  ctx.fillStyle = '#4B4B51'; ctx.fillRect(728, 250, 64, 18);
  ctx.fillStyle = '#DADAE0'; ctx.fillRect(736, 252, 48, 8);
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(752, 244, 20, 8);
  ctx.fillStyle = '#77777D'; ctx.fillRect(734, 270, 52, CELL);
  ctx.restore();
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
    const checkAt = Math.min(dur, dur * .548);
    const tapAge = t - waitAt;
    const tap = clamp(1 - Math.abs(tapAge) / .075);
    const check = ease.outBack((t - checkAt + .04) / .12) * (1 - ease.outCubic((t - checkAt - .12) / .2));
    const rig = createCameraRig({
      width: W, height: H, seed: seed + 17, handheld: 1.7,
      keyframes: [
        { t: 0, x: -10, y: 4, zoom: 1.005, rot: -.01, ease: 'linear' },
        { t: dur * .46, x: 6, y: -26, zoom: 1.038, rot: .018, ease: 'inOut' },
        { t: dur, x: 24, y: -86, zoom: 1.095, rot: .064, ease: 'inOut' },
      ], hits: [waitAt, fadeAt], punch: .009, shake: 1.8,
    });
    const camera = rig.poseAt(t);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    rig.apply(ctx, t);
    drawVenue(ctx, t, camera.x);
    drawClock(ctx, t, dur, speed);
    drawPriceTrace(ctx, t, dur, fadeAt, seed);
    drawWristStub(ctx, t, check);

    const baseline = 1000 + tap * 8;
    ellipseFill(ctx, 330, baseline + 5, 110, 9, '#08080A');
    drawHedgy(ctx, { x: 330, y: baseline, scale: 3.612, t: Math.max(0, t - waitAt), pose: 'think', facing: 1, look: check > .12 ? 'down' : 'up', expression: 'worried', prop: 'none', squash: 1 + tap * .12 });
    drawTap(ctx, 330, baseline, tap);
    drawSpotlightTarget(ctx, t, dur);

    // Close rail and ticket scraps cross the foreground while the camera pushes in.
    ctx.fillStyle = '#08080A'; ctx.fillRect(-24, 1232, 1128, 58);
    ctx.fillStyle = '#73737A'; ctx.fillRect(-24, 1232, 1128, CELL);
    ctx.fillStyle = '#2B2B30'; ctx.fillRect(-24, 1244, 1128, CELL * 2);
    drawForegroundTickets(ctx, t, dur);
    ctx.restore();
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const safeDur = Math.max(0, dur);
    const waitAt = eventTime(props, 'waits', dur, dur * .22);
    const fadeAt = eventTime(props, 'fade', dur, dur * .66);
    const checkAt = Math.min(safeDur, safeDur * .548);
    return [
      { t: Number(waitAt.toFixed(3)), kind: 'step', pan: -.35, gain: .78 },
      { t: Number(checkAt.toFixed(3)), kind: 'paper', pan: -.06, gain: .62 },
      { t: Number(fadeAt.toFixed(3)), kind: 'drop', pan: .42, gain: .84 },
    ];
  },
};
