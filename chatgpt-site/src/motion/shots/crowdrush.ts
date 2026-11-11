import { clamp, ease, hash, type Cue, type Frame, type ShotProps } from '../core.ts';
import { pixelText } from '../prim.ts';
import { drawHedgy } from '../actor/hedgy.ts';
import { drawEnv } from '../env/index.ts';
import { createCameraRig } from '../fx/rig.ts';
import { box, instances, merge, place, render3d, type InstanceTransform, type Material, type Mesh } from '../three.ts';
import { drawTicket2D } from '../sets/ticket.ts';
import type { ShotDef } from './index.ts';

const CELL = 4;
const BASE_MATERIALS: Material[] = [
  { ramp: 'mono', tone: .88 }, { ramp: 'mono', tone: .55 }, { ramp: 'steel', tone: .74 },
  { ramp: 'bone', tone: .94 }, { ramp: 'ink', tone: .56 },
];

function makeFan(reach: 'both' | 'one'): Mesh {
  const pieces: Mesh[] = [
    place(box(.56, .62, .34, 2), { pos: [0, .55, 0] }),
    place(box(.48, .44, .42, 0), { pos: [0, 1.13, 0] }),
    place(box(.12, .18, .13, 1), { pos: [-.27, 1.17, 0] }),
    place(box(.12, .18, .13, 1), { pos: [.27, 1.17, 0] }),
    place(box(.07, .07, .035, 4), { pos: [-.11, 1.16, -.23] }),
    place(box(.07, .07, .035, 4), { pos: [.11, 1.16, -.23] }),
    place(box(.2, .38, .22, 1), { pos: [-.16, .2, 0] }),
    place(box(.2, .38, .22, 1), { pos: [.16, .2, 0] }),
  ];
  const leftReach = reach === 'both' ? -.63 : -.42;
  const rightReach = reach === 'both' ? .63 : -.63;
  pieces.push(
    place(box(.17, .58, .18, 2), { pos: [-.39, .86, 0], rot: [0, 0, leftReach] }),
    place(box(.17, .58, .18, 2), { pos: [.39, .86, 0], rot: [0, 0, rightReach] }),
    place(box(.23, .19, .2, 3), { pos: [-.39 + Math.sin(leftReach) * .35, 1.1, 0] }),
    place(box(.23, .19, .2, 3), { pos: [.39 + Math.sin(rightReach) * .35, 1.1, 0] }),
  );
  return merge(...pieces);
}

const fanBoth = makeFan('both');
const fanOne = makeFan('one');
const toNum = (value: unknown, fallback: number) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const eventAt = (props: ShotProps, kind: string, dur: number, fallback: number) => {
  const event = props.events?.find(item => item.kind.toLowerCase() === kind.toLowerCase());
  return clamp(event ? event.at : dur * fallback, 0, dur);
};
const snap = (n: number) => Math.round(n / CELL) * CELL;

type Point = { x: number; y: number };
const ROUTE: Point[][] = [
  [{ x: 126, y: 1064 }, { x: 866, y: 900 }],
  [{ x: 866, y: 900 }, { x: 218, y: 680 }],
  [{ x: 218, y: 680 }, { x: 886, y: 454 }],
];

function drawRamp(ctx: Frame['ctx'], a: Point, b: Point, width: number, phase: number) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
  const corners: Point[] = [
    { x: a.x + nx * width / 2, y: a.y + ny * width / 2 }, { x: b.x + nx * width / 2, y: b.y + ny * width / 2 },
    { x: b.x - nx * width / 2, y: b.y - ny * width / 2 }, { x: a.x - nx * width / 2, y: a.y - ny * width / 2 },
  ];
  ctx.fillStyle = phase === 0 ? '#191A1D' : phase === 1 ? '#202125' : '#292A2E';
  ctx.beginPath(); ctx.moveTo(snap(corners[0]!.x), snap(corners[0]!.y));
  for (let i = 1; i < corners.length; i++) ctx.lineTo(snap(corners[i]!.x), snap(corners[i]!.y));
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#686A70'; ctx.lineWidth = 6; ctx.lineCap = 'square';
  ctx.beginPath(); ctx.moveTo(snap(a.x + nx * width * .46), snap(a.y + ny * width * .46)); ctx.lineTo(snap(b.x + nx * width * .46), snap(b.y + ny * width * .46)); ctx.stroke();
  ctx.strokeStyle = '#414349'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(snap(a.x - nx * width * .46), snap(a.y - ny * width * .46)); ctx.lineTo(snap(b.x - nx * width * .46), snap(b.y - ny * width * .46)); ctx.stroke();
  const ties = Math.max(5, Math.floor(len / 38));
  ctx.strokeStyle = '#37393E'; ctx.lineWidth = 4;
  for (let i = 1; i < ties; i++) {
    const u = i / ties, x = a.x + dx * u, y = a.y + dy * u;
    ctx.beginPath(); ctx.moveTo(snap(x + nx * width * .4), snap(y + ny * width * .4));
    ctx.lineTo(snap(x - nx * width * .4), snap(y - ny * width * .4)); ctx.stroke();
  }
}

function windowTimes(props: ShotProps, dur: number, count: number, supply: number) {
  const chase = eventAt(props, 'chase', dur, .14), few = eventAt(props, 'few', dur, .68);
  const first = Math.max(0, count - supply), span = Math.max(0, few - chase), early = Math.max(0, supply - 2);
  return Array.from({ length: count }, (_, index) => {
    if (index < first) return 0;
    const activeIndex = index - first, activeCount = Math.max(1, supply);
    if (activeIndex === activeCount - 1) return few;
    if (activeIndex >= early) return Math.max(chase, few - .14);
    const earlyEnd = Math.max(chase + .04, few - .26);
    return chase + .12 + (early > 1 ? (earlyEnd - chase - .12) * activeIndex / (early - 1) : 0);
  });
}

function drawWindows(frame: Frame, props: ShotProps, t: number, dur: number) {
  const { ctx, theme } = frame;
  const count = Math.round(clamp(toNum(props.params?.windowsCount ?? props.params?.windows, 5), 2, 7));
  const supply = Math.round(clamp(toNum(props.params?.supplyLeft, 3), 0, count));
  const times = windowTimes(props, dur, count, supply);
  const width = Math.min(108, Math.floor(780 / count / 4) * 4), gap = Math.floor((780 - width * count) / Math.max(1, count - 1) / 4) * 4;
  const total = count * width + (count - 1) * gap, startX = snap(540 - total / 2), y = 222, h = 132;
  // The diegetic fascia makes the slots belong to the venue, never to a floating HUD.
  ctx.fillStyle = '#111215'; ctx.fillRect(92, 142, 896, 82);
  ctx.fillStyle = '#D2D4D7'; ctx.fillRect(92, 142, 896, 6); ctx.fillRect(92, 218, 896, 6);
  ctx.fillStyle = '#25272B'; ctx.fillRect(116, 164, 848, 44);
  pixelText(ctx, 'TICKETS', 540, 174, 5, { color: theme.fg, align: 'center' });
  for (let i = 0; i < count; i++) {
    const x = startX + i * (width + gap), shutAt = times[i]!, close = shutAt <= 0 ? 1 : ease.outCubic(clamp((t - shutAt) / .19));
    ctx.fillStyle = '#08090B'; ctx.fillRect(x - 8, y - 8, width + 16, h + 24);
    ctx.fillStyle = '#8E9298'; ctx.fillRect(x - 8, y - 8, width + 16, 8); ctx.fillRect(x - 8, y + h + 8, width + 16, 8);
    ctx.fillStyle = '#292B30'; ctx.fillRect(x, y, width, h);
    if (i >= count - supply) {
      ctx.fillStyle = '#D7D9DC'; ctx.fillRect(x + 10, y + 12, width - 20, 8);
      ctx.fillStyle = '#90949A'; ctx.fillRect(x + 10, y + 28, width - 20, 4);
      const ticketAlpha = 1 - close;
      if (ticketAlpha > .05) { ctx.save(); ctx.globalAlpha *= ticketAlpha; drawTicket2D(ctx, x + width / 2, y + 83, Math.min(60, width - 14), { rot: (i % 2 ? -1 : 1) * .04 }); ctx.restore(); }
    } else {
      ctx.fillStyle = '#35373B'; ctx.fillRect(x + 10, y + 20, width - 20, 7);
      ctx.fillStyle = '#1B1C20'; ctx.fillRect(x + 10, y + 42, width - 20, 58);
    }
    // Each shutter travels down its own guide; the final one starts exactly at “few”.
    if (shutAt > 0) {
      ctx.save(); ctx.beginPath(); ctx.rect(x + 4, y, width - 8, h); ctx.clip();
      ctx.fillStyle = close > 0 ? '#AEB2B7' : '#C8CBD0';
      const shutterY = y + Math.round((h + 4) * close);
      ctx.fillRect(x + 4, shutterY - h, width - 8, h);
      ctx.fillStyle = '#65686E'; ctx.fillRect(x + 4, shutterY - 8, width - 8, 8);
      ctx.restore();
    } else {
      ctx.fillStyle = '#51545A'; ctx.fillRect(x + 4, y + 12, width - 8, 12);
    }
    ctx.fillStyle = '#D9DBDE'; ctx.fillRect(x - 10, y + h + 16, width + 20, 6);
  }
  return { count, supply, times, firstX: startX + Math.max(0, count - 1) * (width + gap) + width / 2 };
}

function fanInstances(size: number, time: number): { both: InstanceTransform[]; one: InstanceTransform[] } {
  const both: InstanceTransform[] = [], one: InstanceTransform[] = [];
  const perLane = Math.ceil(size / ROUTE.length);
  for (let i = 0; i < size; i++) {
    const lane = i % ROUTE.length, order = Math.floor(i / ROUTE.length), local = order / Math.max(1, perLane - 1), [a, b] = ROUTE[lane]!;
    const phase = hash(i, 441), u = clamp(local + Math.sin(time * 5.2 + phase * 9) * .025);
    const sx = a.x + (b.x - a.x) * u + Math.sin(time * 8 + phase * 7) * 5;
    const sy = a.y + (b.y - a.y) * u + Math.sin(time * 15 + phase * 8) * 7;
    const depth = lane === 0 ? -1.5 : lane === 1 ? .3 : 1.6;
    const scale = (lane === 0 ? .54 : lane === 1 ? .43 : .34) * (.91 + phase * .15);
    const transform: InstanceTransform = { pos: [(sx - 540) / 80, (645 - sy) / 80, depth + (phase - .5) * 1.4], rot: [0, Math.sin(time * 7 + phase * 8) * .035, Math.sin(time * 10 + phase * 12) * .06], scale };
    (i % 4 === 0 ? both : one).push(transform);
  }
  return { both, one };
}

function drawHand(ctx: Frame['ctx'], x: number, y: number, scale: number, angle: number, alpha: number) {
  ctx.save(); ctx.translate(snap(x), snap(y)); ctx.rotate(angle); ctx.scale(scale, scale); ctx.globalAlpha *= alpha;
  ctx.fillStyle = '#151619'; ctx.strokeStyle = '#08090A'; ctx.lineWidth = 11; ctx.lineJoin = 'miter';
  // A blocky concert-crowd hand: wrist, palm, separated fingers and hard rim light.
  ctx.beginPath(); ctx.moveTo(-42, 136); ctx.lineTo(-20, 78); ctx.lineTo(-32, 14); ctx.lineTo(-18, -42); ctx.lineTo(1, -42); ctx.lineTo(14, 25); ctx.lineTo(28, -72); ctx.lineTo(49, -74); ctx.lineTo(54, 20); ctx.lineTo(73, -54); ctx.lineTo(94, -49); ctx.lineTo(83, 35); ctx.lineTo(104, 5); ctx.lineTo(123, 16); ctx.lineTo(99, 92); ctx.lineTo(75, 148); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#C8CACE'; ctx.fillRect(-28, 75, 76, 16); ctx.fillRect(-12, 8, 11, 42); ctx.fillRect(34, -54, 11, 66); ctx.fillRect(78, -32, 10, 54);
  ctx.fillStyle = '#777B81'; ctx.fillRect(-38, 134, 76, 16); ctx.restore();
}

function drawForeground(frame: Frame, t: number, chaseAt: number, fewAt: number, dur: number) {
  const { ctx } = frame;
  // Lens-close steel handrail parallax; the vertical jog crosses the viewer as the camera cranes up.
  const railY = 1140 - clamp(t / dur) * 310;
  ctx.fillStyle = '#090A0C'; ctx.fillRect(-24, snap(railY), 1128, 34);
  ctx.fillStyle = '#C2C5CA'; ctx.fillRect(-24, snap(railY), 1128, 8);
  ctx.fillStyle = '#46494F'; ctx.fillRect(-24, snap(railY + 28), 1128, 8);
  for (let x = -8; x < 1090; x += 96) { ctx.fillStyle = '#797D83'; ctx.fillRect(x, snap(railY - 48), 10, 56); }
  const swipe = ease.outCubic(clamp((t - chaseAt + .12) / .42));
  drawHand(ctx, -172 + swipe * 370, 748 - swipe * 90, 1.04, -.48 + swipe * .12, .94);
  const clearSlot = ease.outCubic(clamp((t - fewAt + .08) / .34));
  const rightAlpha = (.72 + Math.sin(t * 4.2) * .08) * (1 - clearSlot * .88);
  drawHand(ctx, 934 + Math.sin(t * 2.2) * 26 + clearSlot * 250, 366 + Math.sin(t * 3.1) * 22 - clearSlot * 190, .73, 2.6 + Math.sin(t * 1.7) * .12, rightAlpha);
}

export const crowdRushShot: ShotDef = {
  name: 'crowdrush',
  describe: 'Voxel fans surge along three switchback ramps as ticket windows shutter in sync with chase/few. Params: crowdSize, windowsCount, supplyLeft.',
  render(frame: Frame, props: ShotProps) {
    const { ctx, theme } = frame, dur = Math.max(.1, frame.dur), t = clamp(frame.t, 0, dur);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 1080, 1290); ctx.clip(); ctx.imageSmoothingEnabled = false;
    drawEnv(ctx, { type: 'city', t, theme, seed: frame.seed, width: 1080, height: 1290, camera: { x: Math.sin(t * .5) * 24, y: t * 18, zoom: 1.06 } });
    // Arena shell, deep arch and the far concourse keep the frame full behind the fans.
    ctx.fillStyle = '#101114'; ctx.beginPath(); ctx.moveTo(32, 0); ctx.lineTo(1048, 0); ctx.lineTo(1048, 968); ctx.lineTo(905, 1110); ctx.lineTo(170, 1110); ctx.lineTo(32, 962); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#24262B'; ctx.fillRect(42, 0, 34, 1000); ctx.fillRect(1004, 0, 34, 1000);
    ctx.fillStyle = '#5B5E64'; ctx.fillRect(42, 0, 8, 1000); ctx.fillRect(1030, 0, 8, 1000);
    for (let y = 388; y < 982; y += 108) {
      const inset = Math.round((y - 388) * .11);
      ctx.fillStyle = y % 2 ? '#27292E' : '#1E2024'; ctx.fillRect(94 + inset, y, 892 - inset * 2, 58);
      ctx.fillStyle = '#74777D'; ctx.fillRect(94 + inset, y, 892 - inset * 2, 6);
      ctx.fillStyle = '#101114'; ctx.fillRect(102 + inset, y + 18, 876 - inset * 2, 8);
    }
    // Switchback queue ramps, with repeating tread marks and raised outside rails.
    ROUTE.forEach(([a, b], i) => drawRamp(ctx, a, b, 116 - i * 12, i));
    const windows = drawWindows(frame, props, t, dur);
    const crowdSize = Math.round(clamp(toNum(props.params?.crowdSize, 24), 6, 42));
    const group = fanInstances(crowdSize, t);
    const rig = createCameraRig({ width: 1080, height: 1290, seed: frame.seed, handheld: 2.2, hits: [eventAt(props, 'chase', dur, .16), eventAt(props, 'few', dur, .68)], punch: .012, shake: 6, keyframes: [
      { t: 0, x: -8, y: 0, zoom: 1.015, rot: 0 },
      { t: dur * .45, x: 10, y: 28, zoom: 1.035, rot: .002, ease: 'inOut' },
      { t: dur, x: -5, y: 88, zoom: 1.075, rot: -.004, ease: 'out' },
    ] });
    ctx.save(); rig.apply(ctx, t);
    const view = { x: 0, y: 0, w: 1080, h: 1290, zoom: 320, yaw: .035 + Math.sin(t * 1.1) * .045, pitch: .025, distance: 9, ortho: true, cell: 4, light: [-.48, .78, -.42] as [number, number, number], ambient: .48, rim: .42, outline: true as const, fog: { near: 8, far: 20 } };
    render3d(ctx, theme, view, [instances(fanBoth, group.both, { materials: BASE_MATERIALS }), instances(fanOne, group.one, { materials: BASE_MATERIALS })]);
    // Rail caps land in front of feet, so the instanced crowd feels embedded in the ramps.
    ROUTE.forEach(([a, b], lane) => {
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, nx = dy / len, ny = -dx / len;
      ctx.strokeStyle = lane === 0 ? '#C1C4C8' : '#989CA2'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(snap(a.x + nx * 52), snap(a.y + ny * 52)); ctx.lineTo(snap(b.x + nx * 52), snap(b.y + ny * 52)); ctx.stroke();
    });
    const lastX = windows.firstX, lastY = 368;
    ctx.fillStyle = '#0A0B0D'; ctx.fillRect(825, 1024, 225, 38);
    ctx.fillStyle = '#B7BBC0'; ctx.fillRect(825, 1024, 225, 7);
    if (props.mascot !== false && props.params?.mascot !== false) {
      const shocked = t >= eventAt(props, 'few', dur, .68) - .15;
      drawHedgy(ctx, { x: 906, y: 1038, scale: 3.45, t: Math.max(0, t - (shocked ? eventAt(props, 'few', dur, .68) - .1 : 0)), pose: shocked ? 'point' : 'sweat', facing: -1, look: 'up', expression: shocked ? 'shocked' : 'worried', prop: 'none' });
      // The paw's aim line guides attention to the last slot without adding explanatory type.
      ctx.strokeStyle = '#D8DADD'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(820, 916); ctx.lineTo(lastX, lastY); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(lastX - 12, lastY + 16); ctx.lineTo(lastX, lastY); ctx.lineTo(lastX + 12, lastY + 16); ctx.stroke();
      ctx.fillStyle = '#E6E8EA'; ctx.fillRect(lastX - 5, lastY - 5, 10, 10);
    }
    ctx.restore();
    drawForeground(frame, t, eventAt(props, 'chase', dur, .16), eventAt(props, 'few', dur, .68), dur);
    // Ticket flecks carry the counter hand-off into the following price shot.
    const flecks = 2 + Math.floor(clamp(t / dur) * 4);
    for (let i = 0; i < flecks; i++) {
      const p = clamp(t * .72 - i * .13), x = 244 + i * 123 + Math.sin(t * 4 + i) * 26, y = 414 + i * 67 - p * 96;
      if (p > 0 && p < 1) drawTicket2D(ctx, snap(x), snap(y), 42 - i * 3, { rot: Math.sin(t * 5 + i) * .18 });
    }
    ctx.restore();
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const d = Math.max(.1, dur), chase = eventAt(props, 'chase', d, .16), few = eventAt(props, 'few', d, .68);
    const count = Math.round(clamp(toNum(props.params?.windowsCount ?? props.params?.windows, 5), 2, 7));
    const supply = Math.round(clamp(toNum(props.params?.supplyLeft, 3), 0, count));
    const times = windowTimes(props, d, count, supply), cues: Cue[] = [{ t: 0, kind: 'build', gain: .58, len: Math.min(.7, d * .36), pan: 0 }, { t: chase, kind: 'rumble', gain: .68, len: .38, pan: .1 }];
    for (let i = 0; i < 5; i++) {
      const at = chase + i * .105;
      if (at <= d && at < few) cues.push({ t: at, kind: 'step', gain: .31 + i * .035, pan: -.45 + i * .18, step: i / 4 });
    }
    for (let i = 0; i < count; i++) if (times[i]! > 0) {
      const x = -0.72 + 1.44 * i / Math.max(1, count - 1), last = i === count - 1;
      cues.push({ t: times[i]!, kind: last ? 'snap' : 'click', gain: last ? .84 : .55, pan: x, step: i / Math.max(1, count - 1) });
    }
    cues.sort((a, b) => a.t - b.t);
    return cues.filter(cue => cue.t >= 0 && cue.t <= d);
  },
};
