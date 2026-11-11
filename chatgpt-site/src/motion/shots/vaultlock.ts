import { clamp, lerp, type Cue, type Ctx, type Frame, type ShotProps } from '../core.ts';
import { drawHedgy } from '../actor/hedgy.ts';
import { createCameraRig } from '../fx/rig.ts';
import { pixelText } from '../prim.ts';
import { drawTicket2D } from '../sets/ticket.ts';
import type { ShotDef } from './index.ts';

const W = 1080;
const H = 1290;
const CELL = 4;
const snap = (n: number) => Math.round(n / CELL) * CELL;
const VAULT_CENTER: readonly [number, number] = [540, 645];

function eventTime(props: ShotProps, kind: string, dur: number, fallback: number): number {
  const at = props.events?.find(event => String(event.kind).toLowerCase() === kind)?.at;
  return clamp(Number.isFinite(at) ? at! : dur * fallback, 0, dur);
}

type Point = readonly [number, number];

function polygon(ctx: Ctx, points: readonly Point[], fill: string, stroke?: string, width = 4) {
  ctx.beginPath();
  ctx.moveTo(snap(points[0]![0]), snap(points[0]![1]));
  for (let i = 1; i < points.length; i++) ctx.lineTo(snap(points[i]![0]), snap(points[i]![1]));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}

function drawRoom(ctx: Ctx, t: number) {
  ctx.fillStyle = '#111619'; ctx.fillRect(0, 0, W, H);
  polygon(ctx, [[0, 0], [1080, 0], [1080, 774], [540, 605], [0, 774]], '#191F23');
  polygon(ctx, [[0, 758], [540, 605], [1080, 758], [1080, 1290], [0, 1290]], '#22292D');
  polygon(ctx, [[0, 895], [540, 670], [1080, 895], [1080, 1290], [0, 1290]], '#2A3135');

  // Vault gallery ribs drift at separate rates to keep the room deep and active.
  for (let i = 0; i < 9; i++) {
    const x = i * 152 - 24 + snap((t * (13 + i * 1.8)) % 64);
    const y = 94 + (i % 3) * 42;
    ctx.fillStyle = i % 2 ? '#252D32' : '#30383D';
    ctx.fillRect(x, y, 34, 650);
    ctx.fillStyle = '#89949A'; ctx.fillRect(x + 30, y + 12, 8, 612);
    ctx.fillStyle = '#465057'; ctx.fillRect(x - 24, y + 18, 92, 10);
    ctx.fillRect(x - 10, y + 80, 64, 6);
  }
  for (let i = 0; i < 7; i++) {
    line(ctx, [540, 645], [i * 190 - 120, 1290], i % 2 ? '#4B555B' : '#364046', 5, 0.7);
  }
  for (let i = 0; i < 5; i++) {
    const y = 842 + i * 82 + snap((t * 24) % 40);
    ctx.fillStyle = i % 2 ? '#30383D' : '#394248';
    ctx.fillRect(0, y, W, 7);
    ctx.fillStyle = '#737F86'; ctx.fillRect(0, y + 7, W, 3);
  }
  // Foreground gantry and side rails pass on their own parallax track.
  const rail = snap((t * 44) % 96);
  ctx.fillStyle = '#111416';
  ctx.fillRect(-12 + rail, 260, 38, 1040);
  ctx.fillRect(1030 - rail, 190, 48, 1090);
  ctx.fillStyle = '#A9B2B7';
  ctx.fillRect(22 + rail, 266, 8, 1012);
  ctx.fillRect(1024 - rail, 194, 8, 1060);
}

function line(ctx: Ctx, a: Point, b: Point, color: string, width = 6, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'square';
  ctx.beginPath(); ctx.moveTo(snap(a[0]), snap(a[1])); ctx.lineTo(snap(b[0]), snap(b[1])); ctx.stroke();
  ctx.restore();
}

function drawChamber(ctx: Ctx) {
  polygon(ctx, [[236, 346], [829, 312], [914, 912], [272, 960]], '#0B0E10', '#5E6970', 18);
  polygon(ctx, [[276, 382], [798, 354], [860, 876], [310, 914]], '#171D21', '#343D42', 6);
  for (let i = 0; i < 3; i++) {
    const yy = 472 + i * 138;
    polygon(ctx, [[315 + i * 12, yy], [838 - i * 15, yy - 22], [847 - i * 12, yy + 21], [320 + i * 12, yy + 48]], i % 2 ? '#313A40' : '#3C454B', '#8E999F', 5);
    ctx.fillStyle = '#AAB4B9'; ctx.fillRect(364 + i * 10, yy + 5, 400 - i * 22, 5);
  }
  for (const [x, y] of [[286, 390], [800, 365], [320, 892], [846, 858]] as const) {
    ctx.fillStyle = '#E1E5E7'; ctx.fillRect(x, y, 16, 16);
    ctx.fillStyle = '#4B555B'; ctx.fillRect(x + 4, y + 4, 8, 8);
  }
}

function drawCashBundle(ctx: Ctx, x: number, y: number, scale: number, angle: number, id: number) {
  ctx.save();
  ctx.translate(snap(x), snap(y)); ctx.rotate(angle); ctx.scale(scale, scale);
  ctx.fillStyle = '#07090A'; ctx.fillRect(-68, -36, 140, 74);
  for (let layer = 0; layer < 5; layer++) {
    ctx.fillStyle = layer % 2 ? '#9DA8AE' : '#CAD1D5';
    ctx.fillRect(-64, -36 + layer * 4, 128, 62);
    ctx.fillStyle = '#6D787E'; ctx.fillRect(-60, 18 + layer * 4, 120, 4);
  }
  ctx.fillStyle = id % 2 ? '#C5CDD1' : '#E0E4E6'; ctx.fillRect(-62, -38, 124, 54);
  ctx.strokeStyle = '#5E6970'; ctx.lineWidth = 4; ctx.strokeRect(-62, -38, 124, 54);
  ctx.fillStyle = '#8E999F'; ctx.fillRect(-7, -36, 14, 50);
  ctx.fillStyle = '#F0F2F3'; ctx.fillRect(-47, -27, 30, 30);
  ctx.fillStyle = '#78838A'; ctx.fillRect(-41, -21, 18, 18);
  ctx.fillStyle = '#5A646A'; ctx.fillRect(18, -24, 32, 5); ctx.fillRect(18, -12, 26, 5); ctx.fillRect(18, 0, 32, 5);
  pixelText(ctx, '$', 33, -20, 2, { color: '#F3F4F5', align: 'center' });
  ctx.restore();
}

function drawGlass(ctx: Ctx, t: number, moneyAt: number) {
  const pane: Point[] = [[262, 356], [836, 326], [892, 922], [286, 956]];
  ctx.save();
  ctx.beginPath(); ctx.moveTo(pane[0]![0], pane[0]![1]);
  for (let i = 1; i < pane.length; i++) ctx.lineTo(pane[i]![0], pane[i]![1]);
  ctx.closePath();
  ctx.globalAlpha = 0.16; ctx.fillStyle = '#CFD8DC'; ctx.fill();
  ctx.globalAlpha = 0.92; ctx.lineWidth = 28; ctx.strokeStyle = '#87939A'; ctx.stroke();
  ctx.globalAlpha = 0.9; ctx.lineWidth = 8; ctx.strokeStyle = '#E2E7E9'; ctx.stroke();
  ctx.clip();
  const sweep = snap((Math.max(0, t - moneyAt) * 280) % 760) - 360;
  ctx.globalAlpha = 0.25;
  for (let i = -1; i < 4; i++) {
    const x = 210 + i * 190 + sweep;
    polygon(ctx, [[x, 980], [x + 22, 980], [x + 290, 300], [x + 254, 300]], '#F2F4F5');
  }
  ctx.globalAlpha = 0.44;
  ctx.fillStyle = '#EDF0F1';
  ctx.fillRect(438 + sweep * 0.36, 350, 16, 585);
  ctx.restore();
  for (const [x, y] of [[278, 370], [826, 342], [304, 936], [876, 901]] as const) {
    ctx.fillStyle = '#ECF0F2'; ctx.fillRect(x, y, 20, 20);
    ctx.fillStyle = '#525D63'; ctx.fillRect(x + 5, y + 5, 10, 10);
  }
}

function octagonPoints(cx: number, cy: number, radius: number, angle = -Math.PI / 8): Point[] {
  return Array.from({ length: 8 }, (_, i) => [
    snap(cx + Math.cos(angle + i * Math.PI / 4) * radius),
    snap(cy + Math.sin(angle + i * Math.PI / 4) * radius),
  ] as const);
}

function drawPreDoor(ctx: Ctx, cx: number, cy: number, t: number) {
  ctx.save(); ctx.globalAlpha = 0.46;
  ctx.strokeStyle = '#C1C9CD'; ctx.lineWidth = 12;
  for (const radius of [42, 30]) {
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.fillStyle = '#E3E7E9';
  ctx.fillRect(snap(cx + Math.cos(t * 1.8) * 42), snap(cy + Math.sin(t * 1.8) * 42), 8, 8);
  ctx.restore();
}

function drawDoor(ctx: Ctx, cx: number, cy: number, t: number, eventAt: number, progress: number, scale: number, spin: number, label: string) {
  if (progress <= 0) { drawPreDoor(ctx, cx, cy, t); return; }
  ctx.save();
  ctx.translate(cx, cy); ctx.scale(scale, scale); ctx.translate(-cx, -cy);
  const outer = octagonPoints(cx, cy, 412, -Math.PI / 8 + 0.035);
  const inner = octagonPoints(cx, cy, 282, -Math.PI / 8 + 0.035);
  ctx.beginPath();
  ctx.moveTo(outer[0]![0], outer[0]![1]);
  for (let i = 1; i < outer.length; i++) ctx.lineTo(outer[i]![0], outer[i]![1]);
  ctx.closePath();
  ctx.moveTo(inner[0]![0], inner[0]![1]);
  for (let i = inner.length - 1; i >= 0; i--) ctx.lineTo(inner[i]![0], inner[i]![1]);
  ctx.closePath();
  ctx.fillStyle = '#59636A'; ctx.globalAlpha = 0.96; ctx.fill('evenodd');
  ctx.strokeStyle = '#E0E5E7'; ctx.lineWidth = 16; ctx.stroke();
  ctx.strokeStyle = '#20272B'; ctx.lineWidth = 8;
  for (let i = 0; i < outer.length; i++) line(ctx, outer[i]!, outer[(i + 1) % outer.length]!, '#20272B', 8, 0.92);

  // Segmented armor plates and perimeter teeth make the door read at Reel scale.
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4 + Math.PI / 8;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle);
    ctx.fillStyle = i % 2 ? '#8D989E' : '#B6BEC2';
    ctx.fillRect(312, -18, 72, 36);
    ctx.fillStyle = '#252C30'; ctx.fillRect(326, -7, 45, 14);
    ctx.fillStyle = '#E7EBED'; ctx.fillRect(382, -6, 28, 12);
    ctx.restore();
  }
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(spin);
  for (let i = 0; i < 6; i++) {
    ctx.save(); ctx.rotate(i * Math.PI / 3);
    ctx.fillStyle = '#AEB8BD'; ctx.fillRect(58, -15, 213, 30);
    ctx.fillStyle = '#434C52'; ctx.fillRect(82, -5, 165, 10);
    ctx.fillStyle = '#E4E8EA'; ctx.fillRect(240, -22, 28, 44);
    ctx.restore();
  }
  ctx.fillStyle = '#D8DEE1'; ctx.beginPath(); ctx.arc(0, 0, 70, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#59636A'; ctx.beginPath(); ctx.arc(0, 0, 42, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1A2024'; ctx.fillRect(-10, -34, 20, 68);
  ctx.fillRect(-34, -10, 68, 20);
  ctx.restore();

  const lockAmount = clamp((t - eventAt + 0.04) / 0.18);
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4 + Math.PI / 8;
    ctx.save(); ctx.translate(cx + Math.cos(angle) * 252, cy + Math.sin(angle) * 252); ctx.rotate(angle);
    ctx.fillStyle = '#E4E8EA';
    ctx.fillRect(lerp(-12, 20, lockAmount), -12, lerp(28, 78, lockAmount), 24);
    ctx.fillStyle = '#495258'; ctx.fillRect(lerp(-8, 26, lockAmount), -4, lerp(20, 60, lockAmount), 8);
    ctx.restore();
  }
  if (lockAmount > 0.92) {
    ctx.fillStyle = '#20272B'; ctx.fillRect(722, 221, 284, 58);
    ctx.fillStyle = '#D8DEE1'; ctx.fillRect(730, 229, 268, 6);
    pixelText(ctx, label.toUpperCase().slice(0, 13), 864, 242, 4, { color: '#F1F3F4', align: 'center', reveal: clamp((lockAmount - 0.92) / 0.08), mode: 'type' });
  }
  // Tight impact rays dissipate quickly while the room's moving camera continues the shot.
  const hit = clamp(1 - (t - eventAt) / 0.16);
  if (t >= eventAt && hit > 0) {
    ctx.globalAlpha = hit * 0.72; ctx.strokeStyle = '#F0F2F3'; ctx.lineWidth = 8;
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      ctx.beginPath();
      ctx.moveTo(snap(cx + Math.cos(a) * 426), snap(cy + Math.sin(a) * 426));
      ctx.lineTo(snap(cx + Math.cos(a) * (464 + hit * 34)), snap(cy + Math.sin(a) * (464 + hit * 34)));
      ctx.stroke();
    }
  }
  ctx.restore();
}

export const vaultLockShot: ShotDef = {
  name: 'vaultlock',
  describe: 'Sale cash sweeps into a thick glass broker vault; the inset becomes a monumental steel door and wheel that slams shut and locks on collateral, with Hedgy reaching from the foreground.',
  render(frame: Frame, props: ShotProps) {
    const { ctx, seed } = frame;
    const dur = Math.max(0.05, frame.dur);
    const t = clamp(frame.t, 0, dur);
    const p = props.params ?? {};
    const label = typeof p.label === 'string' ? p.label : 'COLLATERAL';
    const moneyAt = eventTime(props, 'money', dur, 0.46);
    const collateralAt = eventTime(props, 'collateral', dur, 0.64);
    const rig = createCameraRig({
      width: W, height: H, seed: seed + 47, handheld: 1.4,
      keyframes: [
        { t: 0, x: -18, y: 18, zoom: 0.99, rot: -0.014 },
        { t: Math.max(0.08, moneyAt - 0.12), x: 8, y: 4, zoom: 1.025, rot: -0.008 },
        { t: Math.min(dur, moneyAt + 0.22), x: 26, y: -30, zoom: 1.082, rot: 0.016 },
        { t: Math.max(moneyAt + 0.3, collateralAt - 0.08), x: -12, y: -18, zoom: 1.12, rot: 0.034 },
        { t: dur, x: 12, y: -58, zoom: 1.1, rot: 0.02 },
      ],
      hits: [collateralAt], punch: 0.034, shake: 5.2,
    });
    const growth = clamp((t - (collateralAt - 0.16)) / 0.16);
    const settle = Math.exp(-Math.max(0, t - collateralAt) / 0.15);
    const doorScale = growth < 1 ? 0.24 + 0.86 * (1 - (1 - growth) ** 3) : 1.1 - 0.1 * (1 - settle);
    const spinStart = (t - moneyAt) * 5.4 + 0.12;
    const spinTarget = Math.round(spinStart / (Math.PI / 3)) * (Math.PI / 3);
    const spinLock = clamp((t - (collateralAt - 0.08)) / 0.16);
    const spin = lerp(spinStart, spinTarget, spinLock);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    rig.apply(ctx, t);
    drawRoom(ctx, t);
    drawChamber(ctx);

    // Three readable paper bundles travel from the sale receipt into the chamber.
    const cash = [
      { start: [948, 435] as Point, end: [540, 554] as Point, delay: 0, angle: -0.14, size: 1.15 },
      { start: [1002, 527] as Point, end: [556, 646] as Point, delay: 0.075, angle: 0.08, size: 1.34 },
      { start: [936, 630] as Point, end: [540, 742] as Point, delay: 0.15, angle: -0.1, size: 1.26 },
    ];
    cash.forEach((bundle, index) => {
      // The larger banknote stacks leave the upper-right slot before “money” and settle together inside the vault.
      const cashStart = Math.max(0, moneyAt - 0.65);
      const cashSpan = Math.max(0.5, Math.min(0.82, moneyAt + 0.1 - cashStart));
      const q = clamp((t - cashStart - bundle.delay) / Math.max(0.12, cashSpan - bundle.delay));
      const eased = q * q * (3 - 2 * q);
      const x = lerp(bundle.start[0], bundle.end[0], eased);
      const y = lerp(bundle.start[1], bundle.end[1], eased) - Math.sin(Math.PI * q) * 48;
      drawCashBundle(ctx, x, y, bundle.size, bundle.angle + Math.sin(t * 3 + index) * 0.025, index);
      if (q > 0 && q < 1) {
        line(ctx, bundle.start, [x, y], '#D3DADF', 7, 0.26 + q * 0.24);
      }
    });
    drawGlass(ctx, t, moneyAt);
    drawDoor(ctx, VAULT_CENTER[0], VAULT_CENTER[1], t, collateralAt, growth, doorScale, spin, label);
    ctx.restore();

    // Fixed foreground composition keeps the whole actor between x=120 and x=450 as the camera arcs.
    ctx.fillStyle = '#111416'; ctx.fillRect(142, 1160, 302, 18);
    ctx.fillStyle = '#606A70'; ctx.fillRect(170, 1160, 240, 6);
    drawHedgy(ctx, {
      x: 280, y: 1160, scale: 4.95,
      t: Math.max(0, t - moneyAt + 0.12),
      pose: t < moneyAt ? 'think' : 'push', facing: 1,
      look: 'forward', expression: t < collateralAt ? 'worried' : 'shocked',
    });
    // The concert ticket remains on Hedgy’s tether outside the glass while the cash enters the chamber.
    const ticketX = 490 + Math.sin(t * 2.4) * 3;
    const ticketY = 1042 + Math.sin(t * 3.2) * 4;
    const reach = clamp((t - moneyAt + 0.08) / 0.16);
    const paw: Point = [lerp(354, 409, reach), lerp(1061, 1076, reach)];
    line(ctx, paw, [ticketX - 30, ticketY - 5], '#D8DEE1', 4, 0.92);
    drawTicket2D(ctx, ticketX, ticketY, 82, { rot: -0.16 + Math.sin(t * 2) * 0.025, tear: 0.12 });

    // Paw-to-cash-to-wheel glint keeps the camera arc legible while the real camera pushes through the same path.
    const arc = clamp((t - moneyAt + 0.05) / Math.max(0.28, collateralAt - moneyAt));
    if (arc > 0) {
      const q = 1 - (1 - arc) ** 3;
      const x = lerp(paw[0], 540, q), y = lerp(paw[1], 645, q);
      line(ctx, paw, [x, y], '#D2D9DD', 5, 0.24);
      ctx.fillStyle = '#EFF2F3'; ctx.fillRect(snap(x - 4), snap(y - 4), 8, 8);
    }
    // Nearby glass mullions slide past lens and keep the final frames in motion.
    const drift = snap((t * 32) % 64);
    ctx.fillStyle = '#151A1D'; ctx.fillRect(-10 + drift, 1218, 1100, 24);
    ctx.fillStyle = '#AAB4B9'; ctx.fillRect(-10 + drift, 1218, 1100, 5);
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const safeDur = Math.max(0.05, dur);
    const moneyAt = eventTime(props, 'money', safeDur, 0.46);
    const collateralAt = eventTime(props, 'collateral', safeDur, 0.64);
    const cues: Cue[] = [
      { t: moneyAt, kind: 'paper', pan: 0.54, gain: 1.32 },
      { t: collateralAt, kind: 'impact', pan: 0.02, gain: 1.42 },
    ];
    return cues.filter(cue => cue.t <= safeDur).sort((a, b) => a.t - b.t);
  },
};
