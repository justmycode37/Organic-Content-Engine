import { clamp, ease, lerp, type Cue, type Frame, type ShotProps } from '../core.ts';
import { drawHedgy } from '../actor/hedgy.ts';
import { drawBurst } from '../fx/particles.ts';
import { createCameraRig } from '../fx/rig.ts';
import { pixelText } from '../prim.ts';
import { drawTicket2D } from '../sets/ticket.ts';
import type { ShotDef } from './index.ts';

const W = 1080;
const H = 1290;
const CELL = 4;
const snap = (n: number) => Math.round(n / CELL) * CELL;

function eventTime(props: ShotProps, kind: string, dur: number, fallback: number): number {
  const at = props.events?.find(event => String(event.kind).toLowerCase() === kind)?.at;
  return clamp(Number.isFinite(at) ? at! : dur * fallback, 0, dur);
}

type Point = readonly [number, number];
type Step = { x: number; y: number; w: number; d: number; h: number };

function polygon(ctx: Frame['ctx'], points: readonly Point[], fill: string, stroke?: string, lineWidth = 4) {
  ctx.beginPath();
  ctx.moveTo(snap(points[0]![0]), snap(points[0]![1]));
  for (let i = 1; i < points.length; i++) ctx.lineTo(snap(points[i]![0]), snap(points[i]![1]));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}

function line(ctx: Frame['ctx'], a: Point, b: Point, color: string, width = 8, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'square';
  ctx.beginPath();
  ctx.moveTo(snap(a[0]), snap(a[1]));
  ctx.lineTo(snap(b[0]), snap(b[1]));
  ctx.stroke();
  ctx.restore();
}

function drawBackground(ctx: Frame['ctx'], t: number) {
  ctx.fillStyle = '#111619';
  ctx.fillRect(0, 0, W, H);
  polygon(ctx, [[0, 140], [1080, 140], [1080, 825], [540, 655], [0, 825]], '#1A2024');
  polygon(ctx, [[0, 814], [540, 655], [1080, 814], [1080, 1290], [0, 1290]], '#20262A');
  polygon(ctx, [[0, 956], [540, 700], [1080, 956], [1080, 1290], [0, 1290]], '#272D31');

  // Exchange tiers and roof trusses converge on the shelf edge that becomes the vault wheel.
  for (let i = 0; i < 7; i++) {
    const x = i * 180 - 25;
    const shift = snap((t * (22 + i * 2)) % 48);
    ctx.fillStyle = i % 2 ? '#252C30' : '#30383D';
    ctx.fillRect(x + shift, 170, 24, 494);
    ctx.fillStyle = '#68737A';
    ctx.fillRect(x + 24 + shift, 192, 8, 436);
    ctx.fillStyle = '#424B51';
    ctx.fillRect(x + 48 + shift, 255 + (i % 2) * 44, 84, 8);
    ctx.fillRect(x + 48 + shift, 292 + (i % 2) * 44, 54, 6);
  }
  for (let i = 0; i < 5; i++) {
    const y = 212 + i * 92 + snap((t * 16) % 36);
    line(ctx, [0, y], [540, 645 + (y - 212) * 0.19], '#3A4348', 6, 0.75 - i * 0.08);
    line(ctx, [1080, y], [540, 645 + (y - 212) * 0.19], '#59636A', 4, 0.58 - i * 0.06);
  }
  for (let i = 0; i < 8; i++) {
    const x0 = i * 180 - 110;
    line(ctx, [540, 645], [x0, 1290], i % 2 ? '#384147' : '#485258', 4, 0.66);
  }

  // A cold opening in the exchange architecture gives the staircase real depth.
  polygon(ctx, [[390, 232], [690, 232], [758, 524], [322, 524]], '#0A0D0F', '#6A747A', 8);
  polygon(ctx, [[414, 260], [666, 260], [718, 482], [362, 482]], '#181D20', '#3B454B', 4);
  for (let i = 0; i < 4; i++) {
    const yy = 290 + i * 48 + snap((t * 20) % 28);
    ctx.fillStyle = i === 0 ? '#7F8A90' : '#465057';
    ctx.fillRect(420 + i * 18, yy, 244 - i * 36, 7);
  }
  // Close rails and loose paper create foreground parallax without crossing the hero.
  const drift = snap((t * 74) % 56);
  ctx.fillStyle = '#101316';
  ctx.fillRect(-8, 570 + drift, 42, 760);
  ctx.fillRect(1044, 432 - drift, 44, 900);
  ctx.fillStyle = '#89939A';
  ctx.fillRect(30, 564 + drift, 8, 732);
  ctx.fillRect(1040, 424 - drift, 8, 874);
  for (let i = 0; i < 8; i++) {
    const x = snap((i * 167 + t * (84 + i * 7)) % W);
    const y = snap((i * 113 + t * (57 + i * 9)) % 1220);
    ctx.fillStyle = i % 3 ? '#707B82' : '#C5CDD1';
    ctx.fillRect(x, y, 8 + (i % 2) * 4, 4);
  }
}

function drawStep(ctx: Frame['ctx'], step: Step, index: number, t: number) {
  const { x, y, w, d, h } = step;
  const skew = Math.max(8, Math.round(d * 0.18));
  const left = x - w / 2, right = x + w / 2;
  polygon(ctx, [[left, y], [right, y - skew], [right + skew, y + d], [left + skew, y + d + skew]], '#7D878D', '#D2D8DB', 8);
  polygon(ctx, [[left + skew, y + 10], [right - 8, y - skew + 10], [right + skew - 8, y + d - 8], [left + skew + 8, y + d + skew - 8]], index % 2 ? '#8E989D' : '#A7B0B4');
  polygon(ctx, [[left + skew, y + d + skew - 4], [right + skew, y + d - 4], [right + skew, y + d + h], [left + skew, y + d + skew + h]], '#30383D', '#737E84', 4);
  ctx.fillStyle = '#D4DADD';
  ctx.fillRect(snap(left + skew + 16), snap(y + d + skew + 10), Math.max(24, snap(w - 64)), 5);
  ctx.fillStyle = '#171B1E';
  ctx.fillRect(snap(left + skew + 18), snap(y + d + skew + 17), Math.max(20, snap(w - 72)), Math.max(6, h - 20));
  // Moving glints keep the metal steps alive between the two spoken beats.
  const glintX = left + skew + snap(((t * 110 + index * 61) % Math.max(48, w - 36)));
  ctx.fillStyle = '#EDF0F1';
  ctx.fillRect(glintX, snap(y + 5), 18, 4);
}

function drawPixelRing(ctx: Frame['ctx'], cx: number, cy: number, radius: number, color: string, step = 8) {
  const count = Math.max(16, Math.round((Math.PI * 2 * radius) / step));
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const a = i / count * Math.PI * 2;
    ctx.fillRect(snap(cx + Math.cos(a) * radius), snap(cy + Math.sin(a) * radius), step, step);
  }
}

function drawTrace(ctx: Frame['ctx'], points: readonly Point[], progress: number) {
  if (progress <= 0) return;
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const length = Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]);
    lengths.push(length);
    total += length;
  }
  let remain = total * clamp(progress);
  for (let i = 1; i < points.length && remain > 0; i++) {
    const length = lengths[i - 1]!;
    const q = Math.min(1, remain / length);
    line(ctx, points[i - 1]!, [lerp(points[i - 1]![0], points[i]![0], q), lerp(points[i - 1]![1], points[i]![1], q)], '#C0C7CB', 10, 0.96);
    if (q > 0.2) drawPixelRing(ctx, points[i - 1]![0], points[i - 1]![1], 10, '#D7DDE0', 8);
    remain -= length;
  }
  if (progress >= 1) drawPixelRing(ctx, points.at(-1)![0], points.at(-1)![1], 14, '#EDF0F1', 8);
}

function drawPlate(ctx: Frame['ctx'], x: number, y: number, reveal: number) {
  const w = 236, h = 66;
  ctx.fillStyle = '#090C0E'; ctx.fillRect(x - w / 2 - 8, y - h / 2 - 8, w + 16, h + 16);
  ctx.fillStyle = '#282F34'; ctx.fillRect(x - w / 2, y - h / 2, w, h);
  ctx.fillStyle = '#D8DEE1'; ctx.fillRect(x - w / 2, y - h / 2, w, 8);
  ctx.fillStyle = '#748087'; ctx.fillRect(x - w / 2 + 12, y + h / 2 - 8, w - 24, 5);
  for (const dx of [-w / 2 + 16, w / 2 - 16]) {
    ctx.fillStyle = '#C6CDD1'; ctx.fillRect(x + dx - 4, y - 4, 8, 8);
  }
  pixelText(ctx, 'CHEAPER', x, y - 18, 5, { color: '#F1F3F4', align: 'center', reveal, mode: 'type' });
}

export const priceStairShot: ShotDef = {
  name: 'pricestair',
  describe: 'A crane tracks a perforated ticket mark down a clear high-to-low stair; a ghost ticket lands on the lowest step with the CHEAPER plate as Hedgy points into the path. No price amounts.',
  render(frame: Frame, props: ShotProps) {
    const { ctx, seed } = frame;
    const dur = Math.max(0.05, frame.dur);
    const t = clamp(frame.t, 0, dur);
    const fallAt = eventTime(props, 'fall', dur, 0.33);
    const cheaperAt = eventTime(props, 'cheaper', dur, 0.74);
    const steps: Step[] = [
      { x: 720, y: 318, w: 250, d: 54, h: 34 },
      { x: 684, y: 402, w: 310, d: 62, h: 36 },
      { x: 648, y: 490, w: 370, d: 70, h: 38 },
      { x: 612, y: 582, w: 430, d: 78, h: 40 },
      { x: 576, y: 678, w: 490, d: 86, h: 42 },
      { x: 540, y: 778, w: 530, d: 92, h: 44 },
    ];
    const landing = steps.at(-1)!;
    const focusX = landing.x;
    const focusY = landing.y + landing.d * 0.5;
    const finalZoom = 1.05;
    const finalCameraY = -(focusY - H / 2) * finalZoom;
    const rig = createCameraRig({
      width: W, height: H, seed: seed + 17, handheld: 0.9,
      keyframes: [
        { t: 0, x: 0, y: 42, zoom: .99, rot: 0 },
        { t: fallAt, x: 0, y: 34, zoom: 1, rot: 0, ease: 'inOut' },
        { t: fallAt + (cheaperAt - fallAt) * .56, x: 12, y: -52, zoom: 1.018, rot: -.002, ease: 'inOut' },
        { t: cheaperAt, x: 0, y: finalCameraY, zoom: finalZoom, rot: .002, ease: 'out' },
        { t: dur, x: 0, y: finalCameraY, zoom: finalZoom, rot: 0, ease: 'inOut' },
      ],
      hits: [fallAt, cheaperAt], punch: 0.018, shake: 2.2,
    });
    const trace: Point[] = [
      [884, 270], [826, 314], [750, 330], [730, 382], [718, 402], [700, 454],
      [684, 490], [666, 542], [648, 582], [630, 634], [612, 678], [594, 730],
      [576, 778], [540, 824],
    ];
    const flightStart = cheaperAt - Math.min(0.5, dur * 0.24);
    const flight = clamp((t - flightStart) / Math.max(0.12, cheaperAt - flightStart));
    const flightEase = 1 - (1 - flight) ** 3;
    const landX = focusX;
    const landY = focusY;
    const ghostX = lerp(824, landX, flightEase);
    const ghostY = lerp(330, landY, flightEase) - Math.sin(Math.PI * flight) * 94;
    const landingSkew = Math.max(8, Math.round(landing.d * 0.18));
    const plateX = landing.x - 96;
    const plateTargetY = landing.y + landing.d + landingSkew + landing.h * .52;
    const plateProgress = clamp((t - (cheaperAt - .1)) / .1);
    const plateY = lerp(plateTargetY + 92, plateTargetY, ease.outBack(plateProgress));

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    rig.apply(ctx, t);
    drawBackground(ctx, t);
    // The shared ticket carries the lender perforation into the first falling mark.
    ctx.save();
    ctx.globalAlpha = 0.98;
    const receiptBob = Math.round(Math.sin(t * 2.1) * 4);
    const receiptRot = 0.055 + Math.sin(t * 1.15) * 0.012;
    drawTicket2D(ctx, 824, 288 + receiptBob, 320, { rot: receiptRot });
    ctx.save();
    ctx.translate(824, 288 + receiptBob); ctx.rotate(receiptRot);
    ctx.fillStyle = '#E4E7E9'; ctx.fillRect(-146, -8, 132, 42);
    pixelText(ctx, 'SALE', -80, -3, 4, { color: '#15191C', align: 'center' });
    ctx.restore();
    ctx.restore();
    for (let i = 0; i < steps.length; i++) drawStep(ctx, steps[i]!, i, t);

    // The lowest-step ring resolves to the exact vault-wheel centre at the next cut.
    drawPixelRing(ctx, focusX, focusY, 38, '#D2D9DD', 8);
    drawPixelRing(ctx, focusX, focusY, 26, '#59656C', 8);
    drawPixelRing(ctx, focusX, focusY, 8, '#E8ECEE', 8);
    drawTrace(ctx, trace, clamp((t - fallAt) / Math.min(0.58, dur * 0.24)));

    if (t >= flightStart) {
      ctx.save();
      ctx.globalAlpha = lerp(0.56, 0.94, flight);
      const settled = clamp((t - cheaperAt) / 0.22);
      const bob = settled > 0 ? Math.sin(t * 8) * (1 - settled) * 3 : 0;
      drawTicket2D(ctx, ghostX, ghostY - bob, lerp(152, 124, flightEase), { rot: lerp(-0.28, -0.035, flightEase), dark: true });
      ctx.restore();
    }
    if (t >= cheaperAt && t < cheaperAt + 0.72) {
      drawBurst(ctx, t, { center: { x: landX, y: landY + 14 }, seed: seed + 93, count: 12, kind: 'dust', start: cheaperAt, life: 0.62, speed: 72, gravity: 142, drag: 0.4, size: 2, color: '#CFD5D8' });
    }

    ctx.save();
    ctx.globalAlpha *= plateProgress;
    drawPlate(ctx, plateX, plateY, plateProgress);
    ctx.restore();

    // Hedgy changes from a calculating think to a clear point down the price path.
    const pointing = t >= fallAt;
    drawHedgy(ctx, {
      x: 732, y: 1124, scale: 5.7,
      t: pointing ? Math.max(0, t - fallAt + 0.2) : t,
      pose: pointing ? 'point' : 'think', facing: -1,
      look: 'down', expression: pointing ? 'determined' : 'worried',
    });
    ctx.restore();
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const safeDur = Math.max(0.05, dur);
    const fallAt = eventTime(props, 'fall', safeDur, 0.33);
    const cheaperAt = eventTime(props, 'cheaper', safeDur, 0.74);
    const cues: Cue[] = [
      { t: fallAt, kind: 'paper', pan: 0.32, gain: 1.2, len: 0.18 },
      { t: clamp(fallAt + 0.19, 0, safeDur), kind: 'step', pan: 0.14, gain: 0.58, step: 0.35 },
      { t: clamp(fallAt + 0.4, 0, safeDur), kind: 'step', pan: -0.06, gain: 0.62, step: 0.7 },
      { t: cheaperAt, kind: 'land', pan: -0.04, gain: 1.45, len: 0.2 },
    ];
    return cues.filter(cue => cue.t <= safeDur).sort((a, b) => a.t - b.t);
  },
};
