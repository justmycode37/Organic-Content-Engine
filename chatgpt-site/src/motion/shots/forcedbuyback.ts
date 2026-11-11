import { clamp, type Cue, type Frame, type ShotProps } from '../core.ts';
import { drawHedgy } from '../actor/hedgy.ts';
import { drawEnv } from '../env/index.ts';
import { drawBurst, drawSpeedLines } from '../fx/particles.ts';
import { createCameraRig } from '../fx/rig.ts';
import { pixelText } from '../prim.ts';
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

function drawPouch(ctx: Frame['ctx'], x: number, y: number, t: number, payAt: number) {
  const flip = easeOut(progress(t, payAt, payAt + 0.23));
  const snapShut = t >= payAt && t < payAt + 0.18 ? Math.sin(progress(t, payAt, payAt + 0.18) * Math.PI) * 0.12 : 0;
  ctx.save(); ctx.translate(snap(x), snap(y)); ctx.rotate(-0.32 + flip * 0.86 + snapShut);
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
  // The incoming shutter is the back of shot 9's drawer, sliding past the lens into shot 10.
  if (rawT >= 0) return;
  const retract = easeOut(progress(rawT, -0.185, -0.012));
  ctx.save(); ctx.translate(-Math.round(retract * 1180 / GRID) * GRID, 0);
  ctx.fillStyle = '#090B0D'; ctx.fillRect(0, 0, 1080, 1290);
  ctx.fillStyle = '#363D42'; ctx.fillRect(0, 0, 1080, 1280);
  ctx.fillStyle = '#60696E'; ctx.fillRect(0, 0, 1080, 22);
  ctx.fillStyle = '#15191B'; ctx.fillRect(20, 34, 1040, 1220);
  for (let i = 0; i < 18; i++) {
    const y = 54 + i * 68;
    ctx.fillStyle = i % 2 ? '#252A2E' : '#2E3438'; ctx.fillRect(38, y, 1004, 8);
    ctx.fillStyle = '#737C81'; ctx.fillRect(38, y + 8, 1004, 4);
  }
  ctx.fillStyle = '#C3C9CC'; ctx.fillRect(0, 1250, 1080, 12);
  ctx.fillStyle = '#0A0C0D'; ctx.fillRect(0, 1266, 1080, 24);
  ctx.restore();
}

export const forcedBuybackShot: ShotDef = {
  name: 'forcedbuyback',
  describe: 'Close-up Hedgy turns an empty pouch inside out on pay, then bolts as the buyback kiosk rushes toward the camera.',
  render(frame: Frame, props: ShotProps) {
    const { ctx, theme, seed } = frame, dur = Math.max(0.01, frame.dur), rawT = frame.t, t = clamp(rawT, 0, dur);
    const payAt = eventAt(props, 'pay', dur * 0.225, dur), buyAt = eventAt(props, 'buy', dur * 0.62, dur);
    const runU = progress(t, buyAt, dur);
    const run = 0.2 * runU + 0.8 * easeOut(runU);
    const runDistance = 620 * run;
    const destination = label(props.params?.destinationLabel, 'BUY', 10);
    const rig = createCameraRig({
      width: 1080, height: 1290, seed: seed + 271, handheld: 1.7,
      keyframes: [
        { t: 0, x: -4, y: 5, zoom: 1, rot: 0 },
        { t: payAt, x: -8, y: 1, zoom: 1.025, rot: 0, ease: 'inOut' },
        { t: buyAt, x: -12, y: -2, zoom: 1.045, rot: 0, ease: 'inOut' },
        { t: dur, x: -226, y: -20, zoom: 1.18, rot: -0.004, ease: 'linear' },
      ], hits: [payAt, buyAt], punch: 0.018, shake: 6,
      whip: [{ at: buyAt, direction: 'left', duration: 0.22, amount: 0.15 }],
    });
    const pose = rig.poseAt(t);
    ctx.imageSmoothingEnabled = false;
    drawEnv(ctx, { type: 'exchange', t, theme, seed: seed + 8, width: 1080, height: 1290, camera: { x: pose.x * 0.32, y: pose.y * 0.24, zoom: pose.zoom, rot: pose.rot } });
    ctx.save(); rig.apply(ctx, t);
    drawVenue(ctx, theme, t, runDistance);
    drawRunway(ctx, theme, t, runDistance);
    if (t >= buyAt) {
      drawSpeedLines(ctx, t, {
        x: 0, y: 0, width: 1080, height: 1290, mode: 'linear', direction: -1,
        count: 66, start: buyAt, duration: Math.max(0.22, dur - buyAt), seed: seed + 91,
        color: '#A7AFB3', strength: 0.7,
      });
      drawSpeedLines(ctx, t, {
        width: 1080, height: 1290, center: { x: 814, y: 635 }, mode: 'radial', direction: -1,
        count: 38, start: buyAt + 0.06, duration: Math.max(0.2, dur - buyAt - 0.04), seed: seed + 171,
        color: '#7C858A', strength: 0.48, reach: 790,
      });
      // Broken silver streaks skim separate depth planes around, never across, Hedgy's face.
      for (let i = 0; i < 10; i++) {
        const x = snap((i * 197 - runDistance * (1.35 + (i % 3) * 0.12) + 6000) % 1080);
        const y = 664 + i * 48;
        ctx.fillStyle = i % 2 ? '#7F888D' : '#D5DADD'; ctx.fillRect(x, y, 38 + (i % 3) * 18, 4);
      }
    }
    const kioskScale = 1 + 2.18 * run;
    drawKiosk(ctx, theme, t, 840, 560, kioskScale, destination);

    const actorX = 312 + 510 * run, actorY = 1174 - run * 26;
    const actorT = Math.max(0, t - buyAt);
    const actorPose = t >= buyAt ? 'run' : t > payAt + 0.17 ? 'shock' : 'sweat';
    drawHedgy(ctx, {
      x: actorX, y: actorY, scale: 7.15, t: t >= buyAt ? actorT : Math.max(0, t - payAt),
      pose: actorPose, facing: 1, look: t >= buyAt ? 'forward' : 'down',
      expression: t >= buyAt ? 'determined' : t > payAt ? 'shocked' : 'worried',
    });
    const pouchX = actorX + 122, pouchY = actorY - 94;
    if (t < buyAt) drawPouch(ctx, pouchX, pouchY, t, payAt);
    if (t >= payAt && t < payAt + 0.44) {
      drawBurst(ctx, t, { x: pouchX, y: pouchY - 10, seed: seed + 33, count: 24, kind: 'dust', start: payAt, life: 0.43, speed: 126, spread: Math.PI * 1.15, gravity: 54, drag: 1.42, size: 3, color: '#C5CBCF' });
      drawPayPuff(ctx, pouchX, pouchY - 16, t, payAt);
    }
    drawMoth(ctx, pouchX, pouchY - 14, t, payAt);
    if (t >= buyAt) {
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
    ctx.restore();
    drawDrawerPass(ctx, rawT);
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const payAt = eventAt(props, 'pay', dur * 0.225, dur), buyAt = eventAt(props, 'buy', dur * 0.62, dur);
    return ([
      { t: payAt, kind: 'paper', pan: -0.12, gain: 0.62 },
      { t: buyAt, kind: 'bass', pan: 0.12, gain: 0.78 },
      { t: buyAt + 0.06, kind: 'whoosh', pan: 0.18, gain: 0.72, len: Math.min(0.48, dur - buyAt) },
    ] satisfies Cue[]).filter(cue => cue.t >= 0 && cue.t <= dur);
  },
};
