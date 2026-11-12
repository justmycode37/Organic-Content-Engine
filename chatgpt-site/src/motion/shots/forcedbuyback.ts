import { clamp, type Cue, type Frame, type ShotProps } from '../core.ts';
import { drawHedgy, hedgyBounds } from '../actor/hedgy.ts';
import { drawEnv } from '../env/index.ts';
import { drawBurst, drawSpeedLines } from '../fx/particles.ts';
import { createCameraRig } from '../fx/rig.ts';
import { pixelText } from '../prim.ts';
import { drawTicket2D } from '../sets/ticket.ts';
import type { ShotDef } from './index.ts';

const GRID = 4;
const eventAt = (props: ShotProps, kind: string, fallback: number, dur: number) => {
  const event = props.events?.find(item => item.kind.toLowerCase() === kind);
  return clamp(Number.isFinite(event?.at) ? event!.at : fallback, 0, dur);
};
const progress = (t: number, start: number, end: number) => clamp((t - start) / Math.max(0.001, end - start));
const easeOut = (value: number) => 1 - (1 - clamp(value)) ** 3;
const label = (value: unknown, fallback: string, max = 10) => String(value ?? fallback).trim().toUpperCase().replace(/\s+/g, ' ').slice(0, max) || fallback;
const snap = (value: number) => Math.round(value / GRID) * GRID;

function line(ctx: Frame['ctx'], x0: number, y0: number, x1: number, y1: number, color: string, width = GRID) {
  let ax = Math.round(x0 / GRID), ay = Math.round(y0 / GRID);
  const bx = Math.round(x1 / GRID), by = Math.round(y1 / GRID), dx = Math.abs(bx - ax), sx = ax < bx ? 1 : -1;
  const dy = -Math.abs(by - ay), sy = ay < by ? 1 : -1;
  let err = dx + dy;
  ctx.fillStyle = color;
  for (let guard = 0; guard < 1800; guard++) {
    ctx.fillRect(ax * GRID, ay * GRID, width, width);
    if (ax === bx && ay === by) break;
    const twice = 2 * err;
    if (twice >= dy) { err += dy; ax += sx; }
    if (twice <= dx) { err += dx; ay += sy; }
  }
}

function drawVenue(ctx: Frame['ctx'], theme: Frame['theme'], t: number, runDistance: number) {
  // Bright tiered exchange balconies replace the empty floor with a destination-rich arena.
  ctx.fillStyle = '#101315'; ctx.fillRect(0, 150, 1080, 470);
  for (let row = 0; row < 4; row++) {
    const y = 178 + row * 100, depth = 0.18 + row * 0.16, drift = runDistance * depth * 0.23;
    for (let col = -1; col < 7; col++) {
      const w = 150 + row * 18, x = snap(col * 182 - 20 - drift);
      ctx.fillStyle = row % 2 ? '#292F33' : '#41484D'; ctx.fillRect(x, y, w, 68);
      ctx.fillStyle = '#879095'; ctx.fillRect(x, y, w, 7);
      ctx.fillStyle = '#111416'; ctx.fillRect(x + 9, y + 13, w - 18, 43);
      for (let k = 0; k < 5; k++) {
        const lit = (row * 11 + col * 7 + k + Math.floor(t * 5)) % 13 === 0;
        ctx.fillStyle = lit ? '#E3E6E8' : k % 2 ? '#6A7277' : '#42494E';
        const wx = x + 16 + k * (w - 36) / 5;
        ctx.fillRect(snap(wx), y + 24 + (k % 2) * 4, 9, 17);
      }
      ctx.fillStyle = '#B1B8BC'; ctx.fillRect(x + 3, y + 69, w - 6, 5);
    }
  }
  // Deep perspective ribs and lit headers pull toward the buyback counter.
  for (let i = 0; i < 9; i++) {
    const nearX = snap(i * 142 - 92 - runDistance * (0.15 + i * 0.018));
    const farX = 812 + (i - 4) * 21;
    line(ctx, farX, 152, nearX, 632, i % 2 ? '#5E676C' : '#30363A', i % 3 === 0 ? 12 : 8);
  }
  ctx.fillStyle = '#A6ADB1'; ctx.fillRect(0, 144, 1080, 8);
  ctx.fillStyle = '#24292D'; ctx.fillRect(0, 614, 1080, 22);
  ctx.fillStyle = theme.line;
  for (let i = 0; i < 7; i++) {
    const x = snap(50 + i * 158 - runDistance * (0.08 + i * 0.02));
    ctx.fillRect(x, 628, 48, 4);
  }
}

function drawRunway(ctx: Frame['ctx'], theme: Frame['theme'], t: number, runDistance: number) {
  const horizonX = 814, horizonY = 632;
  ctx.fillStyle = '#15191C'; ctx.fillRect(0, horizonY, 1080, 658);
  ctx.fillStyle = '#4C5459'; ctx.fillRect(0, horizonY, 1080, 8);
  ctx.fillStyle = '#262C30'; ctx.fillRect(0, horizonY + 8, 1080, 19);
  for (let i = -6; i <= 6; i++) {
    const farX = horizonX + i * 18;
    const nearX = snap(540 + i * 206 - runDistance * (0.68 + Math.abs(i) * 0.075));
    line(ctx, farX, horizonY + 24, nearX, 1288, i % 2 ? '#545D62' : '#838B90', i % 3 === 0 ? 8 : 4);
    if (i >= -2 && i <= 2) line(ctx, farX + 10, horizonY + 28, nearX + 16, 1288, '#252B2F', 4);
  }
  // Cross rails stream from the horizon, growing as they pass under the lens.
  const phase = (runDistance * 1.8 + t * 16) % 188;
  for (let i = 0; i < 13; i++) {
    const d = (i * 188 + phase) % 2444, p = d / 2444;
    const y = horizonY + 34 + Math.round(p * p * 610), half = Math.round(12 + p * 620);
    ctx.fillStyle = i % 2 ? '#41484D' : '#687176';
    ctx.fillRect(snap(horizonX - half), snap(y), Math.max(24, snap(half * 2)), p > 0.5 ? 8 : 4);
  }
  // The near counter rails pass in separate layers, visibly faster than the balconies.
  const railPhase = (runDistance * 2.65) % 468;
  for (let i = -1; i < 5; i++) {
    const x = snap(i * 468 - railPhase);
    ctx.fillStyle = '#0D1012'; ctx.fillRect(x, 1128, 292, 34);
    ctx.fillStyle = '#9AA2A6'; ctx.fillRect(x, 1124, 292, 8);
    ctx.fillStyle = '#353C40'; ctx.fillRect(x + 22, 1162, 246, 12);
    ctx.fillStyle = '#D4D8DA'; ctx.fillRect(x + 34, 1163, 6, 8); ctx.fillRect(x + 246, 1163, 6, 8);
  }
  const nearPhase = (runDistance * 3.4) % 640;
  for (let i = 0; i < 4; i++) {
    const x = snap(i * 640 - nearPhase - 180);
    ctx.fillStyle = '#202529'; ctx.fillRect(x, 1210, 410, 74);
    ctx.fillStyle = '#858D92'; ctx.fillRect(x, 1206, 410, 8);
    ctx.fillStyle = '#3D4449'; ctx.fillRect(x + 20, 1228, 370, 10);
  }
  ctx.fillStyle = theme.line;
  for (let i = 0; i < 8; i++) {
    const x = snap(60 + i * 148 - runDistance * (0.55 + (i % 3) * 0.1));
    ctx.fillRect(x, 1276, 52, 4);
  }
}

function drawKiosk(ctx: Frame['ctx'], theme: Frame['theme'], t: number, centerX: number, centerY: number, scale: number, destination: string) {
  const flash = Math.sin(t * 15) > 0.72;
  ctx.save(); ctx.translate(snap(centerX), snap(centerY)); ctx.scale(scale, scale);
  // Perspective terminal arch, authored around its slot so the 10→11 zoomthrough lands there.
  ctx.fillStyle = '#080A0B'; ctx.fillRect(-158, -252, 316, 510);
  ctx.fillStyle = '#444C51'; ctx.fillRect(-148, -244, 296, 486);
  ctx.fillStyle = '#AEB6BA'; ctx.fillRect(-148, -244, 296, 10);
  ctx.fillStyle = '#272D31'; ctx.fillRect(-128, -224, 256, 444);
  ctx.fillStyle = '#131719'; ctx.fillRect(-108, -204, 216, 392);
  // BUY plaque is bolted to the crown, with a mechanical arrow in the face.
  ctx.fillStyle = '#0B0D0F'; ctx.fillRect(-132, -220, 264, 74);
  ctx.fillStyle = flash ? '#EEF0F1' : '#858D92'; ctx.fillRect(-126, -214, 252, 62);
  ctx.fillStyle = '#15191B'; ctx.fillRect(-116, -204, 232, 42);
  pixelText(ctx, destination, -8, -197, destination.length > 6 ? 3 : 4, { color: theme.fg, align: 'center' });
  ctx.fillStyle = theme.fg;
  ctx.fillRect(70, -188, 28, 8); ctx.fillRect(90, -198, 8, 28); ctx.fillRect(98, -202, 8, 8); ctx.fillRect(98, -170, 8, 8);
  // Receipt display and lit slot are big, high-contrast silhouettes as the kiosk approaches.
  ctx.fillStyle = '#5B6469'; ctx.fillRect(-76, -126, 152, 94);
  ctx.fillStyle = '#080A0B'; ctx.fillRect(-64, -114, 128, 70);
  ctx.fillStyle = flash ? '#EEF0F1' : '#8B9499'; ctx.fillRect(-48, -96, 96, 8);
  ctx.fillStyle = '#4F575C'; ctx.fillRect(-42, -76, 84, 6);
  ctx.fillStyle = '#272D31'; ctx.fillRect(-38, -56, 76, 6);
  ctx.fillStyle = '#D1D6D8'; ctx.fillRect(-70, 10, 140, 15);
  ctx.fillStyle = '#080A0B'; ctx.fillRect(-58, 16, 116, 16);
  ctx.fillStyle = '#AEB5B9'; ctx.fillRect(-48, 34, 96, 8);
  // Slot aperture: the transition focus and destination of Hedgy's run.
  ctx.fillStyle = '#0A0C0E'; ctx.fillRect(-98, 100, 196, 72);
  ctx.fillStyle = '#A7AFB3'; ctx.fillRect(-96, 98, 192, 10);
  ctx.fillStyle = '#E0E3E5'; ctx.fillRect(-80, 118, 160, 7);
  ctx.fillStyle = '#030405'; ctx.fillRect(-80, 130, 160, 28);
  ctx.fillStyle = '#929A9F'; ctx.fillRect(-58, 144, 116, 6);
  ctx.fillStyle = '#697277'; ctx.fillRect(-130, 214, 34, 28); ctx.fillRect(96, 214, 34, 28);
  ctx.fillStyle = '#CBD0D3'; ctx.fillRect(-140, 208, 38, 8); ctx.fillRect(102, 208, 38, 8);
  ctx.restore();
}

function drawPouch(ctx: Frame['ctx'], x: number, y: number, t: number, recoilAt: number, payAt: number) {
  const flip = easeOut(progress(t, recoilAt, recoilAt + 0.23));
  const recoilAge = t - recoilAt;
  const recoil = recoilAge < 0 ? 0 : Math.sin(Math.min(recoilAge, 0.2) / 0.2 * Math.PI) * Math.exp(-recoilAge * 2.6);
  const paySnap = t >= payAt && t < payAt + 0.14 ? Math.sin(progress(t, payAt, payAt + 0.14) * Math.PI) * 0.14 : 0;
  ctx.save();
  ctx.translate(snap(x - recoil * 14), snap(y + recoil * 18));
  ctx.rotate(-0.32 + flip * 0.86 + recoil * 0.2 + paySnap);
  ctx.scale(1 + recoil * 0.06, 1 - recoil * 0.08);
  // Slumped fabric body, a gathered rim and one hollow mouth make it read as a pouch in silhouette.
  const cloth = flip < 0.48 ? '#626B70' : '#D3D8DA';
  const seam = flip < 0.48 ? '#A9B1B5' : '#6E777C';
  ctx.fillStyle = '#08090A';
  ctx.beginPath(); ctx.moveTo(-48, -34); ctx.lineTo(48, -34); ctx.lineTo(60, -18); ctx.lineTo(56, 10);
  ctx.lineTo(48, 34); ctx.lineTo(32, 50); ctx.lineTo(16, 58); ctx.lineTo(-20, 58); ctx.lineTo(-40, 48);
  ctx.lineTo(-52, 28); ctx.lineTo(-60, 4); ctx.lineTo(-56, -18); ctx.closePath(); ctx.fill();
  ctx.fillStyle = cloth;
  ctx.beginPath(); ctx.moveTo(-46, -26); ctx.lineTo(46, -26); ctx.lineTo(52, -12); ctx.lineTo(48, 10);
  ctx.lineTo(40, 30); ctx.lineTo(28, 42); ctx.lineTo(12, 50); ctx.lineTo(-18, 50); ctx.lineTo(-34, 42);
  ctx.lineTo(-46, 26); ctx.lineTo(-52, 4); ctx.lineTo(-50, -12); ctx.closePath(); ctx.fill();
  // The drawstring crinkles and diagonal folds catch light as the lining rolls outward.
  ctx.fillStyle = seam; ctx.fillRect(-48, -38, 96, 7); ctx.fillRect(-44, -31, 8, 7); ctx.fillRect(36, -31, 8, 7);
  ctx.fillRect(-42, -2, 7, 22); ctx.fillRect(35, 4, 7, 18);
  ctx.fillRect(-30, 26, 13, 6); ctx.fillRect(17, 32, 16, 6); ctx.fillRect(-10, 44, 20, 5);
  ctx.fillStyle = '#08090A'; ctx.fillRect(-40, -27, 80, 12); ctx.fillRect(-32, -34, 64, 7);
  ctx.fillStyle = '#111416'; ctx.fillRect(-30, -24, 60, 8);
  if (flip >= 0.48) {
    ctx.fillStyle = '#EEF0F1'; ctx.fillRect(-4, 2, 8, 20); ctx.fillRect(-12, 22, 24, 5);
    ctx.fillStyle = '#7D868B'; ctx.fillRect(-30, 4, 8, 18); ctx.fillRect(22, -2, 8, 20);
  }
  ctx.fillStyle = '#D9DEE0'; ctx.fillRect(-52, -42, 20, 5); ctx.fillRect(32, -42, 20, 5);
  ctx.restore();
}

function drawMoth(ctx: Frame['ctx'], x: number, y: number, t: number, payAt: number) {
  const age = t - payAt;
  if (age < 0 || age > 0.62) return;
  const fade = Math.min(1, (0.58 - age) / 0.13);
  const flutter = Math.sin(age * 47), wingY = 0.24 + 0.76 * Math.abs(flutter);
  const cx = snap(x + 72 + age * 190), cy = snap(y - 16 - age * 124 + Math.sin(age * 25) * 18);
  ctx.save(); ctx.globalAlpha = Math.max(0.35, fade); ctx.translate(cx, cy); ctx.rotate(Math.sin(age * 13) * 0.16);
  ctx.fillStyle = '#F0F2F3';
  ctx.save(); ctx.scale(1, wingY);
  ctx.beginPath(); ctx.moveTo(-6, -2); ctx.lineTo(-28, -22); ctx.lineTo(-46, -12); ctx.lineTo(-42, 2); ctx.lineTo(-25, 14); ctx.lineTo(-7, 7); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(6, -2); ctx.lineTo(28, -22); ctx.lineTo(46, -12); ctx.lineTo(42, 2); ctx.lineTo(25, 14); ctx.lineTo(7, 7); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#30373B'; ctx.fillRect(-4, -17, 8, 36); ctx.fillRect(-12, -25, 4, 9); ctx.fillRect(8, -25, 4, 9);
  ctx.fillStyle = '#899196'; ctx.fillRect(-32, -9, 10, 6); ctx.fillRect(22, -9, 10, 6);
  ctx.restore();
}

function drawPayPuff(ctx: Frame['ctx'], x: number, y: number, t: number, payAt: number) {
  const age = t - payAt;
  if (age < 0 || age > 0.38) return;
  const spread = 18 + Math.min(age, 0.16) * 220;
  const shrink = Math.max(0.48, 1 - age * 1.35);
  ctx.save(); ctx.globalAlpha = age < 0.2 ? 1 : Math.max(0.28, 1 - (age - 0.2) * 3.5);
  const bits: Array<[number, number, number, number]> = [
    [-1, -1, 20, 16], [-2, 0, 12, 24], [1, -2, 16, 12], [-3, 2, 14, 12],
    [-4, -1, 10, 8], [2, 2, 12, 8], [0, -3, 8, 10],
  ];
  for (let i = 0; i < bits.length; i++) {
    const [dx, dy, w, h] = bits[i]!;
    const side = i % 2 ? 1 : -1, rise = (i % 3) - 1;
    const px = snap(x + dx * spread + side * age * 44), py = snap(y + dy * spread - age * (38 + i * 10) + rise * age * 24);
    ctx.fillStyle = i % 3 ? '#D7DCDE' : '#A6AFB3';
    ctx.fillRect(px, py, Math.max(4, snap(w * shrink)), Math.max(4, snap(h * shrink)));
  }
  ctx.restore();
}

function drawDrawerPass(ctx: Frame['ctx'], rawT: number) {
  // The content side owns the lens at the cut, then rides left as shot 10's kiosk is revealed.
  if (rawT > 0.21) return;
  const p = progress(rawT, 0, 0.21);
  const retract = p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2;
  ctx.save(); ctx.translate(-Math.round(retract * 1180 / GRID) * GRID, 0);
  ctx.fillStyle = '#090B0D'; ctx.fillRect(0, 0, 1080, 1290);
  ctx.fillStyle = '#202529'; ctx.fillRect(0, 0, 1080, 1280);
  ctx.fillStyle = '#B9C0C3'; ctx.fillRect(0, 0, 1080, 18);
  ctx.fillStyle = '#535C61'; ctx.fillRect(0, 18, 1080, 20);
  ctx.fillStyle = '#090B0D'; ctx.fillRect(20, 42, 1040, 1200);
  ctx.fillStyle = '#717A7F'; ctx.fillRect(36, 58, 1008, 8);
  ctx.fillStyle = '#343B3F'; ctx.fillRect(48, 74, 984, 1132);
  ctx.fillStyle = '#171B1E'; ctx.fillRect(68, 94, 944, 1088);
  // Bright inner rails and a recessed tray make the drawer's carrying side unmistakable.
  ctx.fillStyle = '#AEB6BA'; ctx.fillRect(68, 94, 944, 12); ctx.fillRect(68, 1170, 944, 12);
  ctx.fillStyle = '#424A4F'; ctx.fillRect(104, 148, 872, 18); ctx.fillRect(104, 1100, 872, 18);
  ctx.fillStyle = '#0A0C0E'; ctx.fillRect(146, 204, 788, 778);
  ctx.fillStyle = '#515A5F'; ctx.fillRect(166, 224, 748, 738);
  ctx.fillStyle = '#202529'; ctx.fillRect(184, 242, 712, 702);
  // The pouch lies inside-out in the tray: the empty lining is visible as the lens clears.
  ctx.fillStyle = '#08090A'; ctx.fillRect(386, 554, 308, 288);
  ctx.fillStyle = '#C9CFD2'; ctx.fillRect(410, 572, 260, 242);
  ctx.fillStyle = '#727B80'; ctx.fillRect(430, 592, 220, 14);
  ctx.fillStyle = '#08090A'; ctx.fillRect(438, 614, 204, 116);
  ctx.fillStyle = '#D5DADD'; ctx.fillRect(454, 744, 172, 10);
  ctx.fillStyle = '#535C61'; ctx.fillRect(472, 770, 136, 8);
  // Recessed side channels echo the drawer rails from the outgoing collateral shot.
  for (let i = 0; i < 8; i++) {
    const y = 198 + i * 116;
    ctx.fillStyle = i % 2 ? '#2A3034' : '#32393D'; ctx.fillRect(88, y, 52, 12); ctx.fillRect(940, y, 52, 12);
    ctx.fillStyle = '#858E93'; ctx.fillRect(88, y + 12, 52, 4); ctx.fillRect(940, y + 12, 52, 4);
  }
  ctx.fillStyle = '#D1D6D8'; ctx.fillRect(0, 1240, 1080, 16);
  ctx.fillStyle = '#080A0B'; ctx.fillRect(0, 1256, 1080, 34);
  ctx.restore();
}

export const forcedBuybackShot: ShotDef = {
  name: 'forcedbuyback',
  describe: 'Close-up Hedgy turns an empty pouch inside out on pay, then bolts as the buyback kiosk rushes toward the camera.',
  render(frame: Frame, props: ShotProps) {
    const { ctx, theme, seed } = frame, dur = Math.max(0.01, frame.dur), rawT = frame.t, t = clamp(rawT, 0, dur);
    const payAt = eventAt(props, 'pay', dur * 0.225, dur), buyAt = eventAt(props, 'buy', dur * 0.62, dur);
    // Event offsets preserve the requested beats when narration stretches this compact shot.
    const recoilAt = clamp(payAt - Math.min(0.258, dur * 0.149), 0, dur);
    const runStart = clamp(buyAt - Math.min(0.643, dur * 0.371), 0, dur);
    const runEnd = clamp(runStart + Math.min(0.8, dur * 0.462), runStart + 0.01, dur);
    const runU = progress(t, runStart, runEnd);
    const run = easeOut(runU);
    const runDistance = 620 * run;
    const destination = label(props.params?.destinationLabel, 'BUY', 10);
    const kioskU = progress(t, runStart, dur);
    const kioskScale = 0.72 + kioskU * (8.5 - 0.72);
    const rig = createCameraRig({
      width: 1080, height: 1290, seed: seed + 271, handheld: 0.75,
      keyframes: [
        { t: 0, x: 58, y: 4, zoom: 1, rot: 0 },
        { t: recoilAt, x: 54, y: 0, zoom: 1.018, rot: -0.002, ease: 'inOut' },
        { t: runStart, x: 50, y: -2, zoom: 1.025, rot: 0.002, ease: 'inOut' },
        { t: buyAt, x: -20, y: -8, zoom: 1.05, rot: -0.003, ease: 'inOut' },
        { t: dur, x: -92, y: -16, zoom: 1.075, rot: 0, ease: 'linear' },
      ], hits: [payAt, buyAt], punch: 0.012, shake: 4,
    });
    const pose = rig.poseAt(t);
    // Keep the aperture on the zoomthrough focus as the terminal grows around it.
    const kioskX = 840 + (540 - pose.x / pose.zoom - 840) * kioskU;
    const slotCenterY = 538 + (645 - pose.y / pose.zoom - 538) * kioskU;
    const kioskY = slotCenterY - 136 * kioskScale;
    // The outgoing zoomthrough expands around the handoff slot. Carry Hedgy into
    // that portal and counter-scale him so the transition never crops his shape.
    const transitionStart = Math.max(0, dur - 0.26);
    const transitionProgress = progress(rawT, transitionStart, dur + 0.26);
    const transitionEase = transitionProgress < 0.5
      ? 2 * transitionProgress * transitionProgress
      : 1 - ((-2 * transitionProgress + 2) ** 2) / 2;
    const portalZoom = 1 + 1.62 * transitionEase;
    const exitBlend = easeOut(progress(rawT, runEnd, transitionStart));
    const outerRig = createCameraRig({
      width: 1080, height: 1290, seed, handheld: 1.8,
      keyframes: [
        { t: -0.42, x: -18, y: 7, zoom: 0.992, rot: -0.002 },
        { t: 0, x: -8, y: 4, zoom: 1, rot: 0 },
        { t: dur, x: 8, y: -4, zoom: 1.018, rot: 0.002, ease: 'inOut' },
        { t: dur + 0.42, x: 18, y: -7, zoom: 1.026, rot: 0.003 },
      ],
      hits: [0], punch: 0.024, shake: 4,
      dollyZoom: { start: 0, end: Math.max(0.1, dur), amount: 0.22 },
    }).poseAt(rawT);
    ctx.imageSmoothingEnabled = false;
    drawEnv(ctx, { type: 'exchange', t, theme, seed: seed + 8, width: 1080, height: 1290, camera: { x: pose.x * 0.32, y: pose.y * 0.24, zoom: pose.zoom, rot: pose.rot } });
    ctx.save(); rig.apply(ctx, t);
    drawVenue(ctx, theme, t, runDistance);
    drawRunway(ctx, theme, t, runDistance);
    if (t >= runStart) {
      drawSpeedLines(ctx, t, {
        x: 0, y: 0, width: 1080, height: 1290, mode: 'linear', direction: -1,
        count: 66, start: runStart, duration: Math.max(0.22, dur - runStart), seed: seed + 91,
        color: '#A7AFB3', strength: 0.62,
      });
      drawSpeedLines(ctx, t, {
        width: 1080, height: 1290, center: { x: 814, y: 635 }, mode: 'radial', direction: -1,
        count: 38, start: buyAt + 0.02, duration: Math.max(0.2, dur - buyAt - 0.02), seed: seed + 171,
        color: '#7C858A', strength: 0.48, reach: 790,
      });
      // Broken silver streaks skim separate depth planes around, never across, Hedgy's face.
      for (let i = 0; i < 10; i++) {
        const x = snap((i * 197 - runDistance * (1.35 + (i % 3) * 0.12) + 6000) % 1080);
        const y = 664 + i * 48;
        ctx.fillStyle = i % 2 ? '#7F888D' : '#D5DADD'; ctx.fillRect(x, y, 38 + (i % 3) * 18, 4);
      }
    }
    drawKiosk(ctx, theme, t, kioskX, kioskY, kioskScale, destination);

    const pathX = 200 + 550 * run, pathY = 1138 - run * 28;
    const actorScale = 5.35 * (1 - exitBlend + exitBlend / portalZoom);
    const targetBodyX = 540 + ((-outerRig.x / outerRig.zoom) - pose.x) / pose.zoom;
    const targetBodyY = 645 + ((-outerRig.y / outerRig.zoom) - pose.y) / pose.zoom;
    const unboundedActorX = pathX * (1 - exitBlend) + (targetBodyX - 1.5 * actorScale) * exitBlend;
    const actorY = pathY * (1 - exitBlend) + (targetBodyY + 25 * actorScale) * exitBlend;
    const actorT = Math.max(0, t - runStart);
    const actorPose = t >= runStart ? 'run' : t > payAt ? 'shock' : 'sweat';
    const actorBounds = hedgyBounds({ x: unboundedActorX, y: actorY, scale: actorScale, t: actorT, pose: actorPose, facing: 1 });
    const cameraX = Math.round(pose.x / GRID) * GRID, cos = Math.cos(pose.rot), sin = Math.sin(pose.rot);
    const screenX = (x: number, y: number) => 540 + cameraX + pose.zoom * ((x - 540) * cos - (y - 645) * sin);
    // Shock flares the quill coat beyond hedgyBounds' resting outline. Include that
    // extra silhouette before clamping, then keep a 64 px nominal margin for pixels.
    const quillFlare = actorPose === 'shock' ? actorScale * 10 : 0;
    const projectedLeft = Math.min(screenX(actorBounds.left - quillFlare, actorBounds.top), screenX(actorBounds.left - quillFlare, actorBounds.bottom));
    const actorX = unboundedActorX + Math.max(0, 64 - projectedLeft) / pose.zoom;
    drawHedgy(ctx, {
      x: actorX, y: actorY, scale: actorScale, t: t >= runStart ? actorT : Math.max(0, t - payAt),
      pose: actorPose, facing: 1, look: t >= runStart ? 'forward' : 'down',
      expression: t >= runStart ? 'determined' : t > payAt ? 'shocked' : 'worried',
    });
    const pouchX = actorX + 91, pouchY = actorY - 84;
    if (t < runStart) drawPouch(ctx, pouchX, pouchY, t, recoilAt, payAt);
    if (t >= payAt && t < payAt + 0.44) {
      drawBurst(ctx, t, { x: pouchX, y: pouchY - 10, seed: seed + 33, count: 24, kind: 'dust', start: payAt, life: 0.43, speed: 126, spread: Math.PI * 1.15, gravity: 54, drag: 1.42, size: 3, color: '#C5CBCF' });
      drawPayPuff(ctx, pouchX, pouchY - 16, t, payAt);
    }
    drawMoth(ctx, pouchX, pouchY - 14, t, payAt);
    if (t >= runStart) {
      const step = Math.sin(actorT * (Math.PI * 2 / 0.44));
      if (step > 0.66) {
        ctx.fillStyle = '#D4D9DB'; ctx.fillRect(snap(actorX - 24), snap(actorY - 4), 32, 4);
      }
      // A tapered quill/dust wake stays behind the running actor as the near rails whip past.
      for (let i = 0; i < 6; i++) {
        const x = snap(actorX - 74 - i * 24 - runDistance * 0.05), y = snap(actorY - 13 + i * 6 + Math.sin(actorT * 13 + i) * 3);
        ctx.fillStyle = i % 2 ? '#70797E' : '#B9C0C3'; ctx.fillRect(x, y, 12 + (5 - i) * 4, 4);
      }
    }
    // The BUY cue kicks one shared ticket out of the enlarged kiosk slot toward Hedgy's paw.
    const eject = easeOut(progress(t, buyAt, dur));
    if (t >= buyAt) {
      const slotX = kioskX, slotY = kioskY + 130 * kioskScale;
      const pawX = actorX + 80 * actorScale / 5.35, pawY = actorY - 63 * actorScale / 5.35;
      const ticketX = slotX + (pawX - slotX) * eject;
      const ticketY = slotY + (pawY - slotY) * eject - Math.sin(Math.PI * eject) * 82;
      const ticketSize = 132 - 24 * eject;
      line(ctx, slotX, slotY, ticketX - ticketSize * 0.38, ticketY, '#A33330', 4);
      drawTicket2D(ctx, ticketX, ticketY, ticketSize, { rot: -0.08 + 0.28 * eject });
      if (t < buyAt + 0.12) {
        const flash = 1 - progress(t, buyAt, buyAt + 0.12);
        ctx.save(); ctx.globalAlpha *= flash;
        ctx.fillStyle = '#F0F2F3'; ctx.fillRect(snap(slotX - 48), snap(slotY - 8), 96, 8);
        ctx.restore();
      }
    }
    ctx.restore();
    drawDrawerPass(ctx, rawT);
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const payAt = eventAt(props, 'pay', dur * 0.225, dur), buyAt = eventAt(props, 'buy', dur * 0.62, dur);
    const recoilAt = clamp(payAt - Math.min(0.258, dur * 0.149), 0, dur);
    const runStart = clamp(buyAt - Math.min(0.643, dur * 0.371), 0, dur);
    return ([
      { t: recoilAt, kind: 'paper', pan: -0.12, gain: 0.68 },
      { t: payAt, kind: 'thud', pan: -0.12, gain: 1.28 },
      { t: runStart, kind: 'step', pan: 0.12, gain: 0.72 },
      { t: buyAt, kind: 'impact', pan: 0.12, gain: 1.34 },
      { t: buyAt + 0.04, kind: 'paper', pan: 0.18, gain: 1.16, len: Math.min(0.38, dur - buyAt) },
    ] satisfies Cue[]).filter(cue => cue.t >= 0 && cue.t <= dur);
  },
};
