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

function gridLine(ctx: Frame['ctx'], x0: number, y0: number, x1: number, y1: number, color: string, width = GRID) {
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
  // Exchange balconies converge on the buyback kiosk; their lateral drift sells depth.
  ctx.fillStyle = '#090B0D'; ctx.fillRect(0, 290, 1080, 620);
  const drift = runDistance * 0.82;
  for (let side = 0; side < 2; side++) {
    const left = side === 0;
    for (let row = 0; row < 5; row++) {
      const y = 344 + row * 104, depth = row / 5;
      const width = 170 + row * 56, baseX = left ? -62 + row * 78 : 972 - row * 76;
      const x = snap(baseX - drift * (0.18 + depth * 0.25));
      ctx.fillStyle = row % 2 ? '#282D31' : '#3D4449'; ctx.fillRect(x, y, width, 76);
      ctx.fillStyle = '#777F84'; ctx.fillRect(x, y, width, 7);
      ctx.fillStyle = '#121619'; ctx.fillRect(x + 12, y + 19, width - 24, 44);
      for (let col = 0; col < 3; col++) {
        ctx.fillStyle = (col + row + Math.floor(t * 2)) % 9 === 0 ? '#E2E5E7' : '#555D62';
        ctx.fillRect(x + 22 + col * Math.max(18, (width - 54) / 3), y + 31, 9, 18);
      }
      ctx.fillStyle = '#A5ADB1'; ctx.fillRect(x + 6, y + 77, width - 12, 6);
    }
  }
  ctx.fillStyle = theme.bg; ctx.fillRect(0, 282, 1080, 10);
  // Overhead steel ribs and marquee windows frame the distant destination.
  for (let i = 0; i < 7; i++) {
    const x = snap(96 + i * 148 - drift * (0.08 + i * 0.015));
    ctx.fillStyle = i % 2 ? '#3C4247' : '#24292D'; ctx.fillRect(x, 298, 34, 550);
    ctx.fillStyle = '#778086'; ctx.fillRect(x, 298, 5, 550);
  }
}

function drawKiosk(ctx: Frame['ctx'], theme: Frame['theme'], t: number, destination: string) {
  const x = 800, y = 344, flash = Math.sin(t * 12) > 0.83;
  // A small terminal arch with the BUY sign bolted to its crown.
  ctx.fillStyle = '#090B0D'; ctx.fillRect(x - 94, y - 32, 188, 262);
  ctx.fillStyle = '#474E53'; ctx.fillRect(x - 84, y - 25, 168, 242);
  ctx.fillStyle = '#B6BDC1'; ctx.fillRect(x - 84, y - 25, 168, 8);
  ctx.fillStyle = '#202529'; ctx.fillRect(x - 64, y + 55, 128, 140);
  ctx.fillStyle = '#0C0E10'; ctx.fillRect(x - 52, y + 69, 104, 100);
  ctx.fillStyle = flash ? '#E9ECEE' : '#7C858A'; ctx.fillRect(x - 44, y + 83, 88, 8);
  ctx.fillStyle = '#5B6368'; ctx.fillRect(x - 37, y + 105, 74, 5);
  ctx.fillStyle = '#252A2D'; ctx.fillRect(x - 27, y + 143, 54, 15);
  ctx.fillStyle = '#D3D8DB'; ctx.fillRect(x - 53, y + 183, 106, 8);
  ctx.fillStyle = '#111416'; ctx.fillRect(x - 110, y - 92, 220, 54);
  ctx.fillStyle = flash ? '#E9ECEE' : '#858D92'; ctx.fillRect(x - 106, y - 88, 212, 46);
  ctx.fillStyle = '#15181A'; ctx.fillRect(x - 96, y - 80, 192, 31);
  pixelText(ctx, destination, x - 14, y - 74, destination.length > 6 ? 2 : 3, { color: theme.fg, align: 'center' });
  // Block arrow is part of the sign face, never floating in space.
  ctx.fillStyle = theme.fg; ctx.fillRect(x + 48, y - 69, 26, 8); ctx.fillRect(x + 66, y - 77, 8, 24);
  ctx.fillRect(x + 74, y - 81, 8, 8); ctx.fillRect(x + 74, y - 49, 8, 8);
  ctx.fillStyle = '#A8AFB3'; ctx.fillRect(x - 78, y + 220, 24, 14); ctx.fillRect(x + 54, y + 220, 24, 14);
}

function drawRunway(ctx: Frame['ctx'], theme: Frame['theme'], t: number, runDistance: number) {
  const horizonX = 800, horizonY = 552;
  ctx.fillStyle = '#111416'; ctx.fillRect(0, horizonY, 1080, 738);
  ctx.fillStyle = '#24292D'; ctx.fillRect(0, horizonY, 1080, 9);
  // Counter rails and floor seams stretch from the foreground into the kiosk.
  for (let i = -5; i <= 5; i++) {
    const nearX = 540 + i * 232 - runDistance * (0.75 + Math.abs(i) * 0.045);
    const farX = horizonX + i * 18;
    gridLine(ctx, farX, horizonY, snap(nearX), 1290, i % 2 ? '#50585D' : '#7C858A', i % 3 === 0 ? 8 : 4);
    if (i >= -2 && i <= 2) gridLine(ctx, farX + 8, horizonY, snap(nearX + 13), 1290, '#252A2D', 4);
  }
  const phase = (runDistance * 1.2) % 142;
  for (let i = 0; i < 10; i++) {
    const d = (i * 142 + phase) % 1420, p = d / 1420;
    const y = horizonY + Math.round(p * p * 700), half = Math.round(16 + p * 550), shade = i % 2 ? '#343A3E' : '#555D62';
    ctx.fillStyle = shade; ctx.fillRect(snap(horizonX - half), snap(y), Math.max(24, snap(half * 2)), p > 0.55 ? 8 : 4);
  }
  // Raised counter edges pass very close to lens for a second parallax layer.
  const railOffset = (runDistance * 2.1) % 420;
  for (let i = -1; i < 5; i++) {
    const x = snap(i * 420 - railOffset);
    ctx.fillStyle = '#101315'; ctx.fillRect(x, 1168, 264, 24);
    ctx.fillStyle = '#7E878C'; ctx.fillRect(x, 1164, 264, 8);
    ctx.fillStyle = '#383F43'; ctx.fillRect(x + 18, 1192, 228, 11);
    ctx.fillStyle = '#C1C6C9'; ctx.fillRect(x + 30, 1193, 4, 9); ctx.fillRect(x + 226, 1193, 4, 9);
  }
  ctx.fillStyle = theme.line;
  for (let i = 0; i < 8; i++) {
    const x = snap(60 + i * 146 - runDistance * (0.42 + (i % 3) * 0.08));
    ctx.fillRect(x, 1270, 52, 4);
  }
  // Slow metal dust and paper flecks keep the still, pre-run section alive.
  for (let i = 0; i < 14; i++) {
    const x = snap((i * 197 + Math.floor(t * 38) * (i % 2 ? 1 : -1) + 6000) % 1080), y = 510 + ((i * 67 + Math.floor(t * 22)) % 170);
    ctx.fillStyle = i % 3 ? '#7E858A' : '#D1D5D7'; ctx.fillRect(x, y, i % 4 === 0 ? 8 : 4, 4);
  }
}

function drawPouch(ctx: Frame['ctx'], x: number, y: number, t: number, coverAt: number) {
  const turn = easeOut(progress(t, coverAt - 0.1, coverAt + 0.22));
  ctx.save(); ctx.translate(snap(x), snap(y)); ctx.rotate(-0.18 + turn * 0.75);
  ctx.fillStyle = '#090A0B'; ctx.fillRect(-48, -31, 96, 54); ctx.fillRect(-39, 23, 78, 15); ctx.fillRect(-27, 38, 54, 8);
  ctx.fillStyle = '#626A6F'; ctx.fillRect(-42, -27, 84, 48); ctx.fillRect(-33, 21, 66, 14); ctx.fillRect(-23, 35, 46, 7);
  ctx.fillStyle = '#C1C6C9'; ctx.fillRect(-49, -38, 98, 14);
  ctx.fillStyle = '#1A1E21'; ctx.fillRect(-35, -32, 70, 19);
  ctx.fillStyle = '#A1A8AC'; ctx.fillRect(-21, 27, 42, 5);
  ctx.fillStyle = '#AEB5B9'; ctx.fillRect(-52, -24, 5, 12); ctx.fillRect(47, -24, 5, 12);
  // Inside-out folds catch a pale top-left rim light.
  if (turn > 0.48) {
    ctx.fillStyle = '#DFE2E4'; ctx.fillRect(-30, -29, 14, 9); ctx.fillRect(17, -29, 14, 9);
    ctx.fillStyle = '#4C5358'; ctx.fillRect(-26, 25, 54, 6);
  }
  ctx.restore();
}

export const forcedBuybackShot: ShotDef = {
  name: 'forcedbuyback',
  describe: 'Close-up Hedgy turns out an empty pouch, then runs along a broker counter toward a distant buyback kiosk. params.destinationLabel changes the kiosk sign (default BUY).',
  render(frame: Frame, props: ShotProps) {
    const { ctx, theme, seed } = frame, dur = Math.max(0.01, frame.dur), t = clamp(frame.t, 0, dur);
    const coverAt = eventAt(props, 'cover', dur * 0.34, dur), buyAt = eventAt(props, 'buy', dur * 0.62, dur);
    const runDuration = Math.max(0.2, dur - buyAt), run = easeOut(progress(t, buyAt, dur));
    const runDistance = 336 * run;
    const actorX = 260 + 336 * progress(t, buyAt, dur);
    const destination = label(props.params?.destinationLabel, 'BUY', 10);
    const rig = createCameraRig({
      width: 1080, height: 1290, seed: seed + 271, handheld: 3.8,
      keyframes: [
        { t: 0, x: 0, y: 5, zoom: 1, rot: 0 },
        { t: buyAt, x: 0, y: 1, zoom: 1.025, rot: 0, ease: 'inOut' },
        { t: dur, x: -206, y: -8, zoom: 1.075, rot: -0.003, ease: 'linear' },
      ],
      whip: [{ at: buyAt, direction: 'left', duration: 0.22, amount: 0.16 }],
    });
    const pose = rig.poseAt(t), buying = t >= buyAt;
    ctx.imageSmoothingEnabled = false;
    drawEnv(ctx, { type: 'exchange', t, theme, seed: seed + 8, width: 1080, height: 1290, camera: { x: pose.x * 0.34, y: pose.y * 0.28, zoom: pose.zoom, rot: pose.rot } });
    ctx.save(); rig.apply(ctx, t);
    drawVenue(ctx, theme, t, runDistance);
    drawRunway(ctx, theme, t, runDistance);
    drawKiosk(ctx, theme, t, destination);
    if (buying) {
      drawSpeedLines(ctx, t, {
        x: 0, y: 0, width: 1080, height: 1290, mode: 'linear', direction: -1,
        count: 44, start: buyAt, duration: runDuration, seed: seed + 91, color: theme.dim, strength: 0.55,
      });
      // Broken white streaks repeat as the camera locks onto Hedgy's height.
      for (let i = 0; i < 8; i++) {
        const x = snap((i * 197 - runDistance * 1.65 + 5000) % 1080), y = 676 + i * 47;
        ctx.fillStyle = i % 2 ? '#8D959A' : '#D5D9DB'; ctx.fillRect(x, y, 42 + (i % 3) * 18, 4);
      }
    }
    const actorT = Math.max(0, t - buyAt);
    const actorPose = buying ? 'run' : t > coverAt + 0.12 ? 'shock' : 'sweat';
    drawHedgy(ctx, {
      x: actorX, y: 1132, scale: 6.25, t: buying ? actorT : t,
      pose: actorPose, facing: 1, look: buying ? 'forward' : 'down',
      expression: buying ? 'determined' : t > coverAt ? 'shocked' : 'worried',
    });
    if (!buying) drawPouch(ctx, actorX + 94, 1072, t, coverAt);
    if (t >= coverAt && t < coverAt + 0.5) {
      drawBurst(ctx, t, { x: actorX + 94, y: 1072, seed: seed + 33, count: 22, kind: 'dust', start: coverAt, life: 0.48, speed: 112, spread: Math.PI * 1.1, gravity: 42, drag: 1.4, size: 3, color: theme.dim });
      // A three-beat moth-like dust flutter, reduced to pale square wing pixels.
      const flutter = Math.sin((t - coverAt) * 48);
      for (let i = 0; i < 8; i++) {
        const wing = 6 + (i % 3) * 4;
        ctx.fillStyle = i % 2 ? '#D6DADD' : '#92999E';
        ctx.fillRect(snap(actorX + 70 + i * 13 + flutter * (i % 2 ? 1 : -1) * 6), snap(1090 - i * 11), wing, 4);
      }
    }
    if (buying) {
      // The running sprite remains visible over the fast rails; two small foot hits sell the first strides.
      const stepPulse = Math.sin(actorT * (Math.PI * 2 / 0.44));
      if (stepPulse > 0.76) {
        ctx.fillStyle = '#BFC5C8'; ctx.fillRect(snap(actorX - 18), 1142, 24, 4);
      }
    }
    ctx.restore();
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const coverAt = eventAt(props, 'cover', dur * 0.34, dur), buyAt = eventAt(props, 'buy', dur * 0.62, dur), cues: Cue[] = [
      { t: coverAt, kind: 'swish', pan: -0.12, gain: 0.12 },
      { t: buyAt, kind: 'bass', pan: 0.12, gain: 0.9 },
      { t: buyAt, kind: 'whoosh', pan: 0.2, gain: 0.8, len: Math.min(0.5, Math.max(0.18, dur - buyAt)) },
    ];
    for (let t = buyAt + 0.22; t < dur; t += 0.22) cues.push({ t: Number(t.toFixed(3)), kind: 'step', pan: -0.08, gain: 0.48 });
    return cues.filter(cue => cue.t >= 0 && cue.t <= dur);
  },
};
