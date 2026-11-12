import { clamp, ease, hash, type Cue, type Frame, type ShotProps } from '../core.ts';
import { drawHedgy } from '../actor/hedgy.ts';
import { drawBurst, drawImpactStar, drawShockwave, drawSpeedLines } from '../fx/particles.ts';
import { createCameraRig } from '../fx/rig.ts';
import { drawTicket2D } from '../sets/ticket.ts';
import { drawHeroTicketBackground, drawHeroTicketFace, drawHeroTicketFrame, HERO_TICKET_FRAME } from '../sets/heroticket.ts';
import { box, merge, place, render3d } from '../three.ts';
import type { ShotDef } from './index.ts';

const W = 1080, H = 1290, RED = '#E43A34', INK = '#090B0D', PAPER = '#E5E7E9';
const TAU = Math.PI * 2;
const IMPACT_HOLD = 3 / 30;
type Point = { x: number; y: number; z: number; u: number; angle: number };

function makeTower() {
  const parts = [
    place(box(3.65, 9.7, 1.7, 0, [1, 1, 2, 1, 2, 0]), { pos: [0, 4.5, 0] }),
    place(box(3.92, 0.22, 1.92, 1), { pos: [0, 8.9, 0] }),
    place(box(4.22, 0.28, 2.12, 2), { pos: [0, 9.53, 0] }),
    place(box(0.2, 9.9, 1.96, 1), { pos: [-1.84, 4.5, -0.02] }),
    place(box(0.2, 9.9, 1.96, 1), { pos: [1.84, 4.5, -0.02] }),
    place(box(0.12, 9.5, 0.16, 2), { pos: [-0.62, 4.5, -0.91] }),
    place(box(0.12, 9.5, 0.16, 2), { pos: [0.62, 4.5, -0.91] }),
  ];
  for (let floor = 0; floor < 9; floor++) {
    const y = 0.15 + floor * 1.04;
    parts.push(place(box(3.58, 0.12, 1.78, floor % 2 ? 1 : 2), { pos: [0, y, -0.02] }));
    for (let col = 0; col < 4; col++) {
      if (hash(floor * 11 + col, 65) > 0.28) parts.push(place(box(0.36, 0.5, 0.055, 2), { pos: [-1.25 + col * 0.82, y + 0.38, -0.89] }));
    }
  }
  return merge(...parts);
}

const TOWER = makeTower();
const TOWER_MATERIALS = [
  { ramp: 'steel' as const, tone: 0.7 },
  { ramp: 'mono' as const, tone: 0.86 },
  { ramp: 'chrome' as const, tone: 0.68, spec: 0.28 },
];
const BLOCK = box(1.7, 6.4, 1.0, 0, [1, 1, 2, 0, 2, 0]);
const BLOCKS = [
  { pos: [-5.2, 2.4, 4.4] as [number, number, number], scale: [1.2, 1.2, 1.1] as [number, number, number] },
  { pos: [5.2, 2.1, 6.8] as [number, number, number], scale: [1.15, 1.0, 1.1] as [number, number, number] },
  { pos: [-3.6, 3.5, 9.8] as [number, number, number], scale: [0.82, 1.55, 1.0] as [number, number, number] },
  { pos: [3.9, 3.0, 11.4] as [number, number, number], scale: [0.92, 1.35, 1.0] as [number, number, number] },
];
const BLOCK_MATERIALS = [{ ramp: 'mono' as const, tone: 0.65 }, { ramp: 'steel' as const, tone: 0.76 }, { ramp: 'chrome' as const, tone: 0.5 }];

const numParam = (props: ShotProps, key: string, fallback: number, lo: number, hi: number) => {
  const value = Number(props.params?.[key]);
  return Number.isFinite(value) ? clamp(value, lo, hi) : fallback;
};
const strParam = (props: ShotProps, key: string, fallback: string) => String(props.params?.[key] ?? fallback);
function eventAt(props: ShotProps, kind: string, fallback: number, dur: number) {
  const event = props.events?.find(item => item.kind.toLowerCase() === kind);
  return clamp(event?.at ?? fallback, 0, Math.max(0, dur));
}

function helixPoint(u: number, turns: number, t: number, rise: number, radius = 328): Point {
  const angle = u * turns * TAU + Math.sin(t * 0.46) * 0.065;
  const z = Math.cos(angle);
  return {
    x: Math.round((540 + Math.sin(angle) * radius) / 4) * 4,
    y: Math.round((982 - u * 650 - Math.cos(angle) * 64 - rise) / 4) * 4,
    z, u, angle,
  };
}

function drawVenue(ctx: Frame['ctx'], t: number, seed: number) {
  ctx.fillStyle = '#14181C'; ctx.fillRect(0, 0, W, H);
  const drift = (t * 136) % 240;
  for (let side = 0; side < 2; side++) {
    const x = side ? 850 : 0, width = 230;
    ctx.fillStyle = side ? '#252B30' : '#20262B'; ctx.fillRect(x, 0, width, 1150);
    ctx.fillStyle = '#515A61'; ctx.fillRect(x + (side ? 14 : 0), 0, 8, 1150);
    for (let row = -1; row < 7; row++) {
      const y = Math.round(row * 240 + drift - 140);
      ctx.fillStyle = '#343C42'; ctx.fillRect(x + 12, y, width - 24, 12);
      ctx.fillStyle = '#69727A'; ctx.fillRect(x + 12, y, width - 24, 4);
      for (let col = 0; col < 4; col++) {
        const id = row * 41 + col * 7 + side * 91;
        if (hash(id, seed) > 0.22) {
          const wx = x + 28 + col * 47;
          ctx.fillStyle = hash(id, seed + Math.floor(t * 1.8)) > 0.52 ? '#818A91' : '#535C63';
          ctx.fillRect(wx, y + 29, 29, 48); ctx.fillStyle = '#30373C'; ctx.fillRect(wx + 4, y + 34, 21, 38);
        }
      }
    }
  }
  // Layered bridge girders slide past the venue windows during the vertical climb.
  for (let i = 0; i < 5; i++) {
    const y = Math.round(((i * 286 + drift * 0.68) % 1480) - 150);
    ctx.fillStyle = '#31383E'; ctx.fillRect(0, y, W, 16); ctx.fillStyle = '#899197'; ctx.fillRect(0, y, W, 5);
    ctx.fillStyle = '#0B0D0F'; ctx.fillRect(0, y + 16, W, 8);
    for (let x = 20; x < W; x += 92) { ctx.fillStyle = i % 2 ? '#596168' : '#3F474D'; ctx.fillRect(x, y + 24, 6, 26); }
  }
  ctx.fillStyle = '#0E1114'; ctx.fillRect(0, 1080, W, 210);
}

function drawLoop(ctx: Frame['ctx'], points: Point[], progress: number, front: boolean, width: number, color: string) {
  if (progress <= 0 || points.length < 2) return;
  const max = Math.floor(clamp(progress) * (points.length - 1));
  ctx.beginPath(); let open = false;
  for (let i = 0; i <= max; i++) {
    const p = points[i]!, visible = front ? p.z < 0 : p.z >= 0;
    if (!visible) { open = false; continue; }
    if (!open) { ctx.moveTo(p.x, p.y); open = true; } else ctx.lineTo(p.x, p.y);
  }
  ctx.strokeStyle = '#090B0D'; ctx.lineWidth = width + 22; ctx.lineCap = 'square'; ctx.lineJoin = 'bevel'; ctx.stroke();
  ctx.strokeStyle = '#353C42'; ctx.lineWidth = width + 12; ctx.stroke();
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
  ctx.strokeStyle = '#F3AAA4'; ctx.lineWidth = 4; ctx.stroke();
}

function drawPress(ctx: Frame['ctx'], t: number, impactAt: number) {
  const close = ease.inCubic(clamp((t - (impactAt - 0.32)) / 0.32));
  const release = ease.outCubic(clamp((t - (impactAt + IMPACT_HOLD)) / 0.25));
  const amount = close * (1 - release);
  const topY = Math.round(250 + amount * 276), bottomY = Math.round(1030 - amount * 276);
  // Two independent hydraulic carriages and their piston rods make the cause of the crush clear.
  ctx.fillStyle = '#151A1E'; ctx.fillRect(94, 154, 92, 926); ctx.fillRect(894, 154, 92, 926);
  ctx.fillStyle = '#7A8389'; ctx.fillRect(94, 154, 10, 926); ctx.fillRect(976, 154, 10, 926);
  ctx.fillStyle = '#30373D'; ctx.fillRect(116, 178, 50, 878); ctx.fillRect(906, 178, 50, 878);
  for (const x of [124, 914]) for (let bolt = 0; bolt < 9; bolt++) {
    ctx.fillStyle = bolt % 2 ? '#AEB5B9' : '#5D666D'; ctx.fillRect(x, 202 + bolt * 94, 26, 12);
  }
  ctx.fillStyle = '#A8B0B5'; ctx.fillRect(234, topY - 118, 40, 124); ctx.fillRect(806, topY - 118, 40, 124);
  ctx.fillStyle = '#535C63'; ctx.fillRect(245, topY - 108, 18, 108); ctx.fillRect(817, topY - 108, 18, 108);
  ctx.fillStyle = '#111519'; ctx.fillRect(150, topY, 780, 120);
  ctx.fillStyle = '#C2C7CA'; ctx.fillRect(150, topY, 780, 12); ctx.fillRect(150, topY, 14, 120);
  ctx.fillStyle = '#434B51'; ctx.fillRect(176, topY + 30, 726, 18);
  for (let tooth = 0; tooth < 22; tooth++) {
    ctx.fillStyle = tooth % 2 ? '#15191C' : '#8A9399'; ctx.fillRect(170 + tooth * 34, topY + 76, 20, 32);
  }
  ctx.fillStyle = '#111519'; ctx.fillRect(150, bottomY, 780, 104);
  ctx.fillStyle = '#C2C7CA'; ctx.fillRect(150, bottomY + 82, 780, 12); ctx.fillRect(916, bottomY, 14, 104);
  ctx.fillStyle = '#434B51'; ctx.fillRect(176, bottomY + 5, 726, 20);
  for (let tooth = 0; tooth < 22; tooth++) {
    ctx.fillStyle = tooth % 2 ? '#15191C' : '#8A9399'; ctx.fillRect(170 + tooth * 34, bottomY + 28, 20, 28);
  }
  return { topY, bottomY, close: amount };
}

function drawCrushChain(ctx: Frame['ctx'], t: number, impactAt: number, topY: number, bottomY: number) {
  const crush = ease.inCubic(clamp((t - (impactAt - 0.32)) / 0.32));
  const reveal = ease.outCubic(clamp((t - (impactAt - 0.38)) / 0.08));
  const release = ease.outCubic(clamp((t - (impactAt + IMPACT_HOLD)) / 0.22));
  const alpha = reveal * (1 - release);
  if (alpha <= 0.01) return;
  const y = (topY + 120 + bottomY) / 2;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(540, y);
  ctx.scale(1 - crush * 0.22, 1 - crush * 0.6);
  ctx.translate(-540, -y);
  ctx.fillStyle = '#090B0D'; ctx.fillRect(224, y - 29, 632, 58);
  ctx.fillStyle = '#7F211F'; ctx.fillRect(232, y - 22, 616, 44);
  const left = 252, step = 82, linkW = 72;
  for (let i = 0; i < 8; i++) {
    const x = left + i * step;
    ctx.fillStyle = '#080A0C'; ctx.fillRect(x - 4, y - 27, linkW + 8, 54);
    ctx.fillStyle = i % 2 ? '#B82E2A' : '#E43A34'; ctx.fillRect(x, y - 23, linkW, 46);
    ctx.fillStyle = '#F1F2F3'; ctx.fillRect(x + 12, y - 4, linkW - 24, 8);
    ctx.fillStyle = '#571815'; ctx.fillRect(x + 5, y - 17, 6, 6); ctx.fillRect(x + linkW - 11, y + 11, 6, 6);
  }
  ctx.restore();
}

function drawPressFront(ctx: Frame['ctx'], topY: number, bottomY: number) {
  ctx.fillStyle = '#111519'; ctx.fillRect(150, topY + 110, 780, 15);
  ctx.fillStyle = '#929BA1'; ctx.fillRect(150, topY + 110, 780, 5);
  ctx.fillStyle = '#111519'; ctx.fillRect(150, bottomY - 14, 780, 18);
  ctx.fillStyle = '#929BA1'; ctx.fillRect(150, bottomY - 14, 780, 5);
}

export const squeezeRocketShot: ShotDef = {
  name: 'squeezerocket',
  describe: 'A red ticket chain rises into a loop around the tower, gets crushed by a hydraulic press, then its stamped ticket rockets through the lens to match the opening.',
  render(frame: Frame, props: ShotProps) {
    const { ctx, theme, seed } = frame, dur = Math.max(0.25, frame.dur), t = clamp(frame.t, 0, dur);
    const loopAt = eventAt(props, 'loop', dur * 0.22, dur), squeezeAt = eventAt(props, 'squeeze', dur * 0.43, dur);
    const turns = numParam(props, 'loopTurns', 1, 0.8, 2.2);
    const stamp = strParam(props, 'stampWord', strParam(props, 'terminalLabel', 'SHORT SQUEEZE')).toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim().slice(0, 18) || 'SHORT SQUEEZE';
    const terminalAt = Math.max(0, dur - 1 / 30);
    if (t >= dur - 0.04) {
      drawHeroTicketFrame(ctx);
      return;
    }
    const rushAt = Math.max(squeezeAt + 0.6, dur - 0.5);
    const impactAt = Math.round(squeezeAt * 30) / 30;
    const rushProgress = clamp((t - rushAt) / Math.max(0.08, terminalAt - rushAt));
    const sceneAlpha = 1 - ease.inOutCubic(rushProgress);
    const beforeLoop = 0.04 + 0.96 * clamp(t / Math.max(0.1, loopAt));
    const progress = t < loopAt ? beforeLoop : 1;
    const rise = Math.max(0, t - loopAt) * 92;
    const points = Array.from({ length: 129 }, (_, i) => helixPoint(i / 128, turns, t, rise));
    const rig = createCameraRig({
      width: W, height: H, seed: seed + 901, handheld: 0, hits: [impactAt], punch: 0.014, shake: 13,
      keyframes: [
        { t: 0, x: -26, y: 24, zoom: 1.015, rot: -0.01 },
        { t: loopAt, x: 22, y: -16, zoom: 1.065, rot: 0.014 },
        { t: squeezeAt - 0.05, x: -14, y: 20, zoom: 1.11, rot: -0.016 },
        { t: rushAt, x: 0, y: 0, zoom: 1, rot: 0, ease: 'out' },
        { t: terminalAt, x: 0, y: 0, zoom: 1, rot: 0 },
      ],
    });

    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip(); ctx.imageSmoothingEnabled = false;
    drawHeroTicketBackground(ctx);
    ctx.save(); rig.apply(ctx, t);
    if (sceneAlpha > 0.015) {
      ctx.save(); ctx.globalAlpha *= sceneAlpha;
      drawVenue(ctx, t, seed + 19);
      drawSpeedLines(ctx, t, { center: { x: 540, y: 636 }, count: 40, reach: 730, start: loopAt, duration: Math.max(0.35, squeezeAt - loopAt + 0.5), color: '#9DA5AA', seed: seed + 65, strength: 0.32, cell: 6 });

      // The red helix carries individual tickets around the tower as it closes into a loop.
      drawLoop(ctx, points, progress, false, 20, '#C92F2B');
      render3d(ctx, theme, {
        x: 198, y: 22, w: 684, h: 1078, zoom: 126,
        position: [Math.sin(t * 0.54) * 1.9, 4.2 + Math.sin(t * 0.43) * 0.28, -14],
        target: [0, 4.7, 0], fov: 43, light: [-0.48, 0.78, -0.36], ambient: 0.5, rim: 0.44, cell: 5, outline: true,
        fog: { near: 14, far: 27 },
      }, [
        { mesh: TOWER, materials: TOWER_MATERIALS, pos: [0, 0, 0], rot: [0, t * 0.018, 0] },
        { mesh: BLOCK, materials: BLOCK_MATERIALS, instances: BLOCKS },
      ]);
      drawLoop(ctx, points, progress, true, 25, RED);

      const chainAlpha = 1 - ease.outCubic(clamp((t - (impactAt + IMPACT_HOLD)) / 0.16));
      if (chainAlpha > 0) {
        ctx.save(); ctx.globalAlpha *= chainAlpha;
        const chainCount = 10, offset = (t * 0.22) % 1;
        for (let i = 0; i < chainCount; i++) {
          const u = (i / chainCount + offset) % 1;
          if (u > progress) continue;
          const index = Math.min(points.length - 1, Math.floor(u * (points.length - 1)));
          const p = points[index]!, next = points[Math.min(points.length - 1, index + 1)]!;
          const front = p.z < 0, size = front ? 74 : 48;
          drawTicket2D(ctx, p.x, p.y, size, { rot: Math.atan2(next.y - p.y, next.x - p.x) * 0.24 + (front ? 0 : 0.1) });
        }
        ctx.restore();
      }

      // Hydraulic jaws have a 150 ms anticipation, a held impact, and a clear release.
      const press = drawPress(ctx, t, impactAt);
      drawLoop(ctx, points, progress, true, 12, '#B92E2A');
      drawCrushChain(ctx, t, impactAt, press.topY, press.bottomY);

      // Ledge and Hedgy remain present through the hit, then recoil, land, curl and point.
      ctx.fillStyle = '#0B0E10'; ctx.fillRect(286, 1118, 514, 172);
      ctx.fillStyle = '#D0D4D7'; ctx.fillRect(286, 1118, 514, 12);
      ctx.fillStyle = '#353D43'; ctx.fillRect(306, 1142, 474, 12); ctx.fillRect(326, 1200, 14, 90); ctx.fillRect(746, 1200, 14, 90);
      for (let bolt = 0; bolt < 8; bolt++) { ctx.fillStyle = '#E7E9EA'; ctx.fillRect(306 + bolt * 68, 1122, 10, 8); }
      const reaction = t - impactAt, hedgyX = 838 - 298 * ease.outCubic(clamp(t / 1.28));
      const hedgyY = reaction >= 0 && reaction < 0.12 ? 1070 : 1118;
      if (reaction < 0) drawHedgy(ctx, { x: hedgyX, y: 1118, scale: 6.15, t, pose: 'run', facing: -1, look: 'up', expression: 'determined' });
      else if (reaction < 0.12) drawHedgy(ctx, { x: hedgyX, y: hedgyY, scale: 6.15, t: reaction, pose: 'jump', facing: -1, look: 'up', expression: 'shocked' });
      else if (reaction < 0.42) drawHedgy(ctx, { x: hedgyX, y: 1118, scale: 6.15, t: reaction - 0.12, pose: 'fall', facing: -1, look: 'up', expression: 'shocked' });
      else if (reaction < 0.76) drawHedgy(ctx, { x: hedgyX, y: 1118, scale: 6.15, t: reaction - 0.42, pose: 'curl', facing: -1, look: 'up', expression: 'shocked' });
      else drawHedgy(ctx, { x: hedgyX, y: 1118, scale: 6.15, t: reaction - 0.76, pose: 'point', facing: -1, look: 'up', expression: 'determined' });

      const emerge = ease.outBack(clamp((t - (impactAt + 0.10)) / 0.2));
      const settleProgress = ease.outCubic(clamp((t - (impactAt + 0.1)) / 0.2));
      const ticketHoldWidth = 432 + 228 * settleProgress;
      const ticketGrowAt = Math.max(impactAt + 0.3, rushAt - 0.36);
      const flightScale = ease.inOutCubic(clamp((t - ticketGrowAt) / Math.max(0.1, rushAt - ticketGrowAt)));
      const ticketWidth = Math.round((ticketHoldWidth + (720 - 660) * flightScale) / 12) * 12;
      const pressAlpha = 1 - ease.outCubic(clamp((t - (rushAt - 0.02)) / 0.16));
      drawImpactStar(ctx, t, { x: 540, y: 700, size: 32, start: impactAt, duration: 0.1, color: '#F2F3F4', seed: seed + 79, cell: 4 });
      drawBurst(ctx, t, { x: 540, y: 700, seed: seed + 91, count: 38, kind: 'confetti', start: impactAt, life: 1.22, speed: 330, spread: TAU, gravity: 285, drag: 0.34, floor: 1210, bounce: 0.14, spin: 7, size: 2, color: PAPER, cell: 4 });
      drawShockwave(ctx, t, { x: 540, y: 700, start: impactAt, duration: 0.28, radius: 12, maxRadius: 240, width: 2, color: '#E0E3E5', seed: seed + 111, cell: 4 });
      if (rushProgress > 0) drawSpeedLines(ctx, t, { center: { x: 540, y: 700 }, count: 48, reach: 760, start: rushAt, duration: Math.max(0.12, dur - rushAt), color: '#D6DADD', seed: seed + 69, strength: 0.66, cell: 4 });
      if (rushProgress <= 0) {
        drawHeroTicketFace(ctx, { x: 540, y: 700, width: ticketWidth, rotation: -0.018, stamp, opacity: emerge,
          pixelLock: t >= impactAt + IMPACT_HOLD && rushProgress <= 0 });
        if (pressAlpha > 0.01) drawPressFront(ctx, press.topY, press.bottomY);
      }
      const impactPulse = Math.max(0, 1 - Math.abs(t - impactAt) / 0.06);
      if (impactPulse > 0) {
        ctx.save(); ctx.globalAlpha *= impactPulse * 0.62; ctx.strokeStyle = '#F2F3F4'; ctx.lineWidth = 4;
        ctx.strokeRect(452, 666, 176, 68);
        ctx.restore();
      }
      ctx.restore();
    }
    ctx.restore();

    if (rushProgress > 0) {
      const scaleP = ease.inOutCubic(rushProgress);
      const x = HERO_TICKET_FRAME.x;
      const y = 700 + (HERO_TICKET_FRAME.y - 700) * scaleP;
      const width = 540 + (HERO_TICKET_FRAME.width - 540) * scaleP;
      const rotation = -0.018 + (HERO_TICKET_FRAME.rotation + 0.018) * scaleP;
      const revealBorrowed = ease.inOutCubic(clamp((rushProgress - 0.72) / 0.28));
      drawHeroTicketFace(ctx, { x, y, width, rotation, stamp, stampOpacity: 1 - revealBorrowed,
        secondaryStamp: HERO_TICKET_FRAME.stamp, secondaryStampOpacity: revealBorrowed });
    }

    ctx.restore();
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const loopAt = eventAt(props, 'loop', dur * 0.22, dur), squeezeAt = eventAt(props, 'squeeze', dur * 0.43, dur);
    const rushAt = Math.max(squeezeAt + 0.6, dur - 0.5);
    const suctionAt = Math.max(0, squeezeAt - 0.35);
    const cues: Cue[] = [
      { t: 0, kind: 'whoosh', gain: 0.66, pan: -0.22 },
      { t: loopAt, kind: 'build', len: 0.31, gain: 0.96, pan: 0 },
      { t: suctionAt, kind: 'whoosh', len: 0.31, gain: 1.05, pan: 0 },
      { t: squeezeAt - 0.21, kind: 'servo', len: 0.19, gain: 1.05, pan: 0 },
      { t: squeezeAt, kind: 'impact', gain: 1.8, pan: 0 },
      { t: rushAt, kind: 'rise', len: Math.max(0.12, dur - rushAt), gain: 0.72, pan: 0.08 },
    ];
    return cues.filter(cue => cue.t >= 0 && cue.t < dur);
  },
};
