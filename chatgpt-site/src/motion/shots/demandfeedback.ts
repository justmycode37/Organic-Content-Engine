import { clamp, ease, hash, type Cue, type Frame, type ShotProps } from '../core.ts';
import { drawHedgy } from '../actor/hedgy.ts';
import { drawBurst, drawSpeedLines } from '../fx/particles.ts';
import { createCameraRig } from '../fx/rig.ts';
import { pixelText } from '../prim.ts';
import { drawTicket2D } from '../sets/ticket.ts';
import type { ShotDef } from './index.ts';

const W = 1080, H = 1290;
const RED = '#E43A34', INK = '#090B0D', PAPER = '#E4E6E8';
type Point = { x: number; y: number };
type Booth = { x: number; y: number; w: number; h: number; facing: 1 | -1 };
const BOOTHS: Booth[] = [
  { x: 24, y: 842, w: 432, h: 220, facing: 1 },
  { x: 624, y: 544, w: 432, h: 220, facing: -1 },
  { x: 24, y: 246, w: 432, h: 220, facing: 1 },
];

function eventAt(props: ShotProps, kind: string, fallback: number, dur: number) {
  const event = props.events?.find(item => item.kind.toLowerCase() === kind);
  return clamp(event?.at ?? fallback, 0, Math.max(0, dur));
}

function buyTimes(dur: number) {
  const first = Math.min(0.8, dur * 0.3);
  const spacing = Math.min(0.5, dur * 0.1875);
  return [0, 1, 2].map(beat => clamp(first + beat * spacing, 0, dur));
}

function drawBackdrop(ctx: Frame['ctx'], t: number, seed: number) {
  ctx.fillStyle = '#171B1F'; ctx.fillRect(0, 0, W, H);
  // Deep arena blocks scroll down as the camera climbs the price rail.
  const drift = (t * 190) % 236;
  const blocks = [
    { x: -22, w: 194, shade: '#242A2F' }, { x: 188, w: 118, shade: '#1D2227' },
    { x: 788, w: 124, shade: '#20262B' }, { x: 912, w: 194, shade: '#262C31' },
  ];
  for (const block of blocks) {
    ctx.fillStyle = block.shade; ctx.fillRect(block.x, 0, block.w, 1190);
    ctx.fillStyle = '#424A51'; ctx.fillRect(block.x, 0, 7, 1190); ctx.fillRect(block.x + block.w - 8, 0, 8, 1190);
    for (let row = -1; row < 7; row++) {
      const y = Math.round(row * 236 + drift - 146);
      ctx.fillStyle = '#333A40'; ctx.fillRect(block.x + 12, y, block.w - 24, 10);
      ctx.fillStyle = '#596168'; ctx.fillRect(block.x + 12, y + 10, block.w - 24, 4);
      for (let col = 0; col < Math.floor((block.w - 30) / 30); col++) {
        const id = row * 47 + col * 13 + block.x;
        if (hash(id, seed) > 0.23) {
          const wx = block.x + 18 + col * 30, wy = y + 28;
          ctx.fillStyle = hash(id, seed + Math.floor(t * 1.7)) > 0.56 ? '#8A9298' : '#515A61';
          ctx.fillRect(wx, wy, 17, 34); ctx.fillStyle = '#31383E'; ctx.fillRect(wx + 3, wy + 4, 11, 26);
        }
      }
    }
  }
  // Cross-venue bridges and vanishing rails give the narrow vertical climb scale.
  for (let i = 0; i < 6; i++) {
    const y = Math.round(((i * 252 + drift * 0.72) % 1480) - 96);
    ctx.fillStyle = '#333A40'; ctx.fillRect(0, y, W, 12);
    ctx.fillStyle = '#737C83'; ctx.fillRect(0, y, W, 4);
    ctx.fillStyle = '#101316'; ctx.fillRect(0, y + 12, W, 8);
    for (let x = 18; x < W; x += 72) {
      ctx.fillStyle = (x / 72 + i) % 2 ? '#565F66' : '#3B4248';
      ctx.fillRect(x, y + 18, 4, 20);
    }
  }
  // Receding window bands stay low contrast behind the red line.
  for (let y = 0; y < 1120; y += 16) {
    const row = Math.floor(y / 16);
    for (let x = (row % 2) * 12; x < W; x += 32) {
      if (hash(row * 97 + x, seed + 19) > 0.62) {
        ctx.fillStyle = '#32393F'; ctx.fillRect(x, y, 12, 5);
      }
    }
  }
}

function drawTrack(ctx: Frame['ctx'], path: Point[], progress: number, color: string, widthScale = 1) {
  if (path.length < 2) return;
  const last = (path.length - 1) * clamp(progress), full = Math.floor(last), partial = last - full;
  const draw = (width: number, stroke: string) => {
    ctx.beginPath(); ctx.moveTo(path[0]!.x, path[0]!.y);
    for (let i = 1; i <= Math.min(full, path.length - 1); i++) ctx.lineTo(path[i]!.x, path[i]!.y);
    if (full < path.length - 1 && partial > 0) {
      const a = path[full]!, b = path[full + 1]!;
      ctx.lineTo(Math.round(a.x + (b.x - a.x) * partial), Math.round(a.y + (b.y - a.y) * partial));
    }
    ctx.strokeStyle = stroke; ctx.lineWidth = width * widthScale; ctx.lineCap = 'square'; ctx.lineJoin = 'bevel'; ctx.stroke();
  };
  draw(44, '#080A0C'); draw(34, '#343B41'); draw(22, color);
  draw(4, color === RED ? '#FFAAA4' : '#252B30');
  if (progress > 0 && progress < 1) {
    const i = Math.min(full, path.length - 1), a = path[i]!, b = path[Math.min(i + 1, path.length - 1)]!;
    const x = Math.round((a.x + (b.x - a.x) * partial) / 4) * 4, y = Math.round((a.y + (b.y - a.y) * partial) / 4) * 4;
    ctx.fillStyle = '#F7D5D2'; ctx.fillRect(x - 10, y - 10, 20, 20);
    ctx.fillStyle = RED; ctx.fillRect(x - 6, y - 6, 12, 12);
  }
}

function drawSeller(ctx: Frame['ctx'], x: number, feetY: number, scale: number, index: number, t: number, recoil: number, buying: number, facing: 1 | -1) {
  ctx.save(); ctx.translate(Math.round(x), Math.round(feetY)); ctx.scale(scale, scale);
  const colors = [
    { coat: '#92999F', shade: '#424A51', light: '#E0E3E5', face: '#F0E8D9' },
    { coat: '#737D84', shade: '#343C42', light: '#C8CDD0', face: '#E3DACC' },
    { coat: '#A0A6AA', shade: '#4A5157', light: '#ECEDEE', face: '#E8DDC7' },
  ][index]!;
  const wobble = Math.round(Math.sin(t * 10 + index * 2) * 1.2);
  const lunge = ease.outCubic(buying) * 7, away = recoil * 5;
  ctx.save(); ctx.translate(Math.round(-facing * away + facing * lunge), 0);
  ctx.rotate(-facing * recoil * 0.15 + facing * buying * 0.035);
  // Feet and coat silhouette: tall, round, and bearded profiles are deliberately distinct.
  const bodyW = index === 1 ? 29 : index === 0 ? 20 : 25;
  ctx.fillStyle = INK; ctx.fillRect(-bodyW / 2 - 4, -5 + wobble, 12, 5); ctx.fillRect(bodyW / 2 - 7, -5 - wobble, 12, 5);
  ctx.fillStyle = colors.shade;
  if (index === 0) ctx.fillRect(-12, -38, 24, 35);
  else if (index === 1) ctx.fillRect(-19, -31, 38, 29);
  else ctx.fillRect(-16, -35, 32, 33);
  ctx.fillStyle = colors.coat;
  if (index === 0) { ctx.fillRect(-9, -36, 18, 32); ctx.fillRect(-13, -9, 26, 7); }
  else if (index === 1) { ctx.fillRect(-16, -29, 32, 26); ctx.fillRect(-19, -18, 38, 13); }
  else { ctx.fillRect(-13, -33, 26, 30); ctx.fillRect(-18, -21, 36, 13); }
  ctx.fillStyle = colors.light;
  ctx.fillRect(-2, -34, 5, index === 1 ? 19 : 25);
  if (index === 1) { ctx.fillRect(-8, -15, 7, 5); ctx.fillRect(2, -15, 7, 5); }
  else { ctx.fillRect(-1, -13, 4, 8); }

  // Arms pivot up in fright, then one reaches across the panel to mash its button.
  const drawArm = (side: -1 | 1) => {
    const shoulderX = side * (bodyW / 2 - 2), shoulderY = -28;
    const isButtonArm = side === facing;
    let endX = side * (recoil > 0.18 ? 29 : 21), endY = recoil > 0.18 ? -46 : -8;
    if (buying > 0.02 && isButtonArm) { endX = side * 38; endY = -18 - buying * 12; }
    const angle = Math.atan2(endY - shoulderY, endX - shoulderX);
    ctx.save(); ctx.translate(shoulderX, shoulderY); ctx.rotate(angle);
    ctx.fillStyle = INK; ctx.fillRect(0, -4, 25, 9);
    ctx.fillStyle = colors.coat; ctx.fillRect(1, -2, 20, 5);
    ctx.fillStyle = colors.face; ctx.fillRect(20, -4, 8, 8);
    ctx.restore();
  };
  drawArm(-1); drawArm(1);

  // Face, hair and accessories distinguish the short sellers at a glance.
  ctx.fillStyle = INK; ctx.fillRect(-14, -59, 28, 27);
  ctx.fillStyle = colors.face; ctx.fillRect(-11, -56, 22, 21);
  ctx.fillStyle = colors.shade; ctx.fillRect(-11, -58, 22, 5);
  if (index === 0) {
    ctx.fillStyle = INK; ctx.fillRect(-18, -64, 36, 6); ctx.fillRect(-11, -73, 23, 11); ctx.fillStyle = colors.coat; ctx.fillRect(-7, -71, 15, 5);
  } else if (index === 1) {
    ctx.fillStyle = colors.coat; ctx.fillRect(-12, -64, 22, 5); ctx.fillRect(-8, -68, 14, 5);
    ctx.fillStyle = INK; ctx.fillRect(-18, -47, 5, 13); ctx.fillRect(13, -47, 5, 13);
  } else {
    ctx.fillStyle = INK; ctx.fillRect(-14, -64, 28, 7); ctx.fillRect(-16, -42, 32, 12);
    ctx.fillStyle = colors.coat; ctx.fillRect(-11, -43, 22, 7); ctx.fillStyle = colors.face; ctx.fillRect(-6, -39, 12, 4);
  }
  ctx.fillStyle = recoil > 0.1 ? '#FFFFFF' : INK;
  ctx.fillRect(-7, -48, 4, recoil > 0.1 ? 7 : 4); ctx.fillRect(4, -48, 4, recoil > 0.1 ? 7 : 4);
  ctx.fillStyle = INK; ctx.fillRect(-1, -39, 4, recoil > 0.5 ? 6 : 3);
  if (index === 0) { ctx.fillStyle = '#15181B'; ctx.fillRect(-12, -49, 10, 5); ctx.fillRect(2, -49, 10, 5); ctx.fillRect(-3, -47, 6, 2); }
  ctx.restore(); ctx.restore();
}

function drawButton(ctx: Frame['ctx'], x: number, y: number, t: number, hitAt: number, index: number, active: boolean) {
  const p = clamp((t - hitAt) / 0.18), rebound = clamp((t - hitAt - 0.1) / 0.28);
  const depressed = ease.outCubic(p) * (1 - ease.outCubic(rebound) * 0.72);
  const pulse = active ? 1 - clamp((t - hitAt) / 0.5) : 0;
  const top = Math.round((y + depressed * 10) / 4) * 4;
  ctx.fillStyle = '#050607'; ctx.fillRect(x - 58, y - 7, 116, 75);
  ctx.fillStyle = '#A9B0B5'; ctx.fillRect(x - 58, y - 7, 116, 8); ctx.fillRect(x - 58, y - 7, 8, 75);
  ctx.fillStyle = '#333B41'; ctx.fillRect(x - 48, y + 4, 96, 55);
  ctx.fillStyle = active ? (pulse > 0.1 ? '#F17770' : RED) : '#7C858B'; ctx.fillRect(x - 42, top, 84, 44);
  ctx.fillStyle = active ? '#FFB0AA' : '#BBC1C5'; ctx.fillRect(x - 42, top, 84, 6);
  ctx.fillStyle = '#191C1F'; ctx.fillRect(x - 36, top + 34, 72, 6);
  pixelText(ctx, 'BUY', x, top + 17, 2, { color: '#F3F4F5', align: 'center', mode: 'type', reveal: 1 });
  // The receipt slot opens on impact; the same grey ticket punches through in a short upward beat.
  ctx.fillStyle = '#080A0C'; ctx.fillRect(x - 43, y + 78, 86, 18);
  ctx.fillStyle = '#8F979D'; ctx.fillRect(x - 43, y + 78, 86, 5);
  if (p > 0 && p < 1.25) {
    const q = clamp(p / 0.78);
    drawTicket2D(ctx, x, y + 91 - ease.outCubic(q) * 66, 88, { rot: -0.08 + q * 0.16 });
  }
  if (active && t >= hitAt && t < hitAt + 0.36) {
    ctx.fillStyle = '#F6C3BF'; ctx.fillRect(x - 62, y + 62, 8, 8); ctx.fillRect(x + 54, y + 62, 8, 8);
  }
  void index;
}

function drawBooth(ctx: Frame['ctx'], booth: Booth, index: number, t: number, reactionAt: number, buyAt: number, seed: number, activeIndex: number) {
  const { x, y, w, h, facing } = booth;
  const local = clamp((t - buyAt) / 0.32);
  const recoil = t < reactionAt ? 0 : 0.15 + 0.85 * ease.outBack(clamp((t - reactionAt) / 0.21));
  const innerX = x + 14, innerY = y + 14, innerW = w - 28, innerH = h - 28;
  ctx.fillStyle = '#080A0C'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = index === 1 ? '#C0C5C8' : '#A8AFB4'; ctx.fillRect(x + 4, y + 4, w - 8, 8); ctx.fillRect(x + 4, y + 4, 8, h - 8);
  ctx.fillStyle = '#343C42'; ctx.fillRect(x + w - 12, y + 8, 8, h - 12); ctx.fillRect(x + 8, y + h - 12, w - 16, 8);
  ctx.fillStyle = '#191E22'; ctx.fillRect(innerX, innerY, innerW, innerH);
  ctx.fillStyle = '#3D464D'; ctx.fillRect(innerX + 8, innerY + 8, innerW - 16, 6);
  ctx.fillStyle = '#101417'; ctx.fillRect(innerX + 18, innerY + 18, innerW - 36, innerH - 54);
  // Luminous glass ribs sweep past with the moving camera.
  for (let rib = 0; rib < 6; rib++) {
    const rx = innerX + 24 + ((rib * 57 + Math.floor(t * 66 + index * 19)) % (innerW - 52));
    ctx.fillStyle = rib % 2 ? '#384149' : '#56616A'; ctx.fillRect(rx, innerY + 20, 4, innerH - 78);
  }
  const sellerX = facing > 0 ? x + 250 : x + 182;
  drawSeller(ctx, sellerX, y + h - 25, 2.55, index, t, recoil, local, facing);
  const buttonX = facing > 0 ? x + 350 : x + 82, buttonY = y + h - 103;
  drawButton(ctx, buttonX, buttonY, t, buyAt, index, activeIndex === index && t >= buyAt);
  // Distinct silhouette badges are etched into the booth glass, without competing with the faces.
  ctx.fillStyle = '#252C31'; ctx.fillRect(x + 20, y + h - 20, w - 40, 4);
  ctx.fillStyle = '#8B9399'; ctx.fillRect(x + 20, y + h - 20, 64 + index * 26, 4);
  for (let bolt = 0; bolt < 6; bolt++) {
    const bx = x + 20 + bolt * 76;
    ctx.fillStyle = hash(bolt + index * 7, seed) > 0.5 ? '#D7DBDE' : '#555E65';
    ctx.fillRect(bx, y + 16, 8, 8);
  }
}

function drawTowerLoop(ctx: Frame['ctx'], t: number, finalBuyAt: number) {
  const open = ease.outCubic(clamp((t - finalBuyAt) / 0.3));
  // The rising rail enters a lit steel loop at the top centre, then continues through the tower.
  ctx.fillStyle = '#080A0C'; ctx.fillRect(396, -244, 248, 540);
  ctx.fillStyle = '#525B62'; ctx.fillRect(396, -244, 28, 540); ctx.fillRect(616, -244, 28, 540);
  ctx.fillStyle = '#B6BEC2'; ctx.fillRect(400, -244, 8, 540); ctx.fillRect(620, -244, 8, 540);
  ctx.fillStyle = '#343C42'; ctx.fillRect(424, -232, 192, 18); ctx.fillRect(424, 274, 192, 18);
  ctx.fillStyle = '#7C858B'; ctx.fillRect(424, -232, 192, 6); ctx.fillRect(424, 274, 192, 6);
  // Square nested rims read as a mechanical loop instead of a floating graphic.
  ctx.fillStyle = '#1B2126'; ctx.fillRect(446, -122, 148, 270);
  ctx.fillStyle = '#929BA1'; ctx.fillRect(446, -122, 148, 18); ctx.fillRect(446, 130, 148, 18);
  ctx.fillRect(446, -122, 18, 270); ctx.fillRect(576, -122, 18, 270);
  ctx.fillStyle = '#D0D5D7'; ctx.fillRect(464, -104, 6, 234); ctx.fillRect(570, -104, 6, 234);
  ctx.fillStyle = '#080A0C'; ctx.fillRect(474, -88, 92, 202);
  // Two shutters retract after the last BUY hit, leaving the red path a clear exit.
  const shutter = 24 * open;
  ctx.fillStyle = '#69737A'; ctx.fillRect(474 - shutter, -40, Math.max(8, 20 - shutter * 0.45), 108);
  ctx.fillRect(566 + shutter - Math.max(8, 20 - shutter * 0.45), -40, Math.max(8, 20 - shutter * 0.45), 108);
  ctx.fillStyle = '#D8DDDF';
  for (let i = 0; i < 5; i++) {
    const y = -194 + i * 92;
    ctx.fillRect(434, y, 8, 8); ctx.fillRect(598, y, 8, 8);
  }
  ctx.fillStyle = '#AEB7BB'; ctx.fillRect(486, 152, 68, 8);
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * clamp(t); }

export const demandFeedbackShot: ShotDef = {
  name: 'demandfeedback',
  describe: 'The red price tip hits calm sellers, then three staggered BUY slams ratchet it up a steel tower loop. The camera follows the climb while Hedgy stays on the right catwalk.',
  render(frame: Frame, props: ShotProps) {
    const { ctx, seed } = frame, dur = Math.max(0.25, frame.dur), t = clamp(frame.t, 0, dur);
    const scareAt = eventAt(props, 'scaring', dur * 0.12, dur), covers = buyTimes(dur);
    const impactAt = clamp(Math.max(scareAt + 0.26, dur * 0.1125), 0, dur);
    const reactions = [impactAt, covers[0]! + 0.16, covers[1]! + 0.16];
    const path: Point[] = [
      { x: 518, y: 1240 }, { x: 518, y: 1102 }, { x: 456, y: 1046 }, { x: 300, y: 950 },
      { x: 406, y: 902 }, { x: 548, y: 842 }, { x: 624, y: 780 }, { x: 714, y: 770 },
      { x: 800, y: 738 }, { x: 704, y: 560 }, { x: 570, y: 500 }, { x: 430, y: 500 },
      { x: 300, y: 486 }, { x: 410, y: 300 }, { x: 500, y: 220 }, { x: 520, y: 130 },
      { x: 520, y: 40 }, { x: 520, y: -180 }, { x: 520, y: -460 }, { x: 520, y: -800 },
    ];
    const anchors = [3, 8, 12];
    const raised = path.map((point, pointIndex) => {
      let lift = 0;
      for (let i = 0; i < covers.length; i++) if (pointIndex > anchors[i]!) {
        lift += ease.outCubic(clamp((t - (covers[i]! - 0.1)) / 0.16)) * 64;
      }
      return { x: point.x, y: point.y - lift };
    });
    const fractions = anchors.map(anchor => anchor / (path.length - 1));
    let lineProgress = lerp(0, fractions[0]!, ease.outCubic(clamp((t - scareAt) / Math.max(0.08, impactAt - scareAt))));
    // Each cover advances to the next physical track segment on its own impact beat.
    covers.forEach((at, index) => {
      const from = fractions[index]!, to = fractions[index + 1] ?? 1;
      const p = ease.outBack(clamp((t - (at - 0.04)) / 0.13));
      if (t >= at - 0.04) lineProgress = lerp(from, to, Math.min(1, p));
    });
    const rig = createCameraRig({
      width: W, height: H, seed: seed + 121, handheld: 0.75, hits: [impactAt, ...covers], punch: 0.02, shake: 12,
      keyframes: [
        { t: 0, x: 0, y: 0, zoom: 1, rot: 0 },
        { t: impactAt, x: 0, y: 10, zoom: 1.015, rot: 0.002 },
        { t: covers[0]!, x: 0, y: 22, zoom: 1.025, rot: -0.002 },
        { t: covers[1]!, x: 0, y: 72, zoom: 1.04, rot: 0.002 },
        { t: covers[2]!, x: 0, y: 128, zoom: 1.05, rot: -0.002 },
        { t: dur, x: 0, y: 160, zoom: 1.055, rot: 0.001 },
      ],
      whip: [{ at: scareAt, direction: 'up', duration: 0.24, amount: 0.1 }],
    });

    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip(); ctx.imageSmoothingEnabled = false;
    drawBackdrop(ctx, t, seed + 43);
    ctx.save(); rig.apply(ctx, t);
    drawSpeedLines(ctx, t, { center: { x: 540, y: 620 }, count: 38, reach: 700, start: 0, duration: 0.72, mode: 'linear', direction: 1, color: '#929BA1', seed: seed + 67, strength: 0.3, cell: 6 });

    drawTowerLoop(ctx, t, covers[2]!);
    // Sellers hold their ground until the moving red tip reaches their window.
    BOOTHS.forEach((booth, i) => drawBooth(ctx, booth, i, t, reactions[i]!, covers[i]!, seed + i * 17, i));
    // The tip reaches the first booth, pauses, then extends one physical segment after each BUY slam.
    drawTrack(ctx, raised, 1, '#40484E', 1);
    drawTrack(ctx, raised, lineProgress, RED, 1);
    anchors.forEach((anchor, index) => {
      const p = raised[anchor]!;
      ctx.fillStyle = '#101316'; ctx.fillRect(p.x - 25, p.y - 8, 50, 16);
      ctx.fillStyle = index < covers.filter(at => at <= t).length ? RED : '#5B646B';
      ctx.fillRect(p.x - 18, p.y - 4, 36, 8);
    });

    covers.forEach((at, i) => {
      const p = raised[anchors[i]!]!;
      if (t >= at && t < at + 0.48) {
        ctx.fillStyle = RED; ctx.fillRect(p.x - 26, p.y - 29, 52, 12);
        ctx.fillStyle = '#FFB0AA'; ctx.fillRect(p.x - 9, p.y - 36, 18, 6);
      }
      drawBurst(ctx, t, { x: p.x, y: p.y, seed: seed + 280 + i * 19, count: 12, kind: 'shard', start: at, life: 0.62, speed: 180 + i * 22, gravity: 260, drag: 0.4, floor: 1240, size: 1, color: '#D7DBDE', cell: 4 });
    });

    // Close rails and ticket stubs move faster than the booth layer for clear foreground parallax.
    const catwalkY = 1076;
    ctx.fillStyle = '#090B0D'; ctx.fillRect(0, catwalkY, W, 214);
    ctx.fillStyle = '#B7BEC3'; ctx.fillRect(0, catwalkY, W, 10);
    ctx.fillStyle = '#424A50'; ctx.fillRect(0, catwalkY + 26, W, 8); ctx.fillRect(0, catwalkY + 138, W, 12);
    ctx.fillStyle = '#1E2429'; ctx.fillRect(0, catwalkY + 48, W, 5); ctx.fillRect(0, catwalkY + 174, W, 5);
    for (let bolt = 0; bolt < 15; bolt++) {
      const bx = (bolt * 79 + Math.floor(t * 240)) % W;
      ctx.fillStyle = bolt % 3 ? '#727B82' : '#D4D8DB'; ctx.fillRect(bx, catwalkY + 5, 9, 8);
    }
    for (let i = 0; i < 3; i++) {
      const x = (i * 438 + Math.floor(t * (245 + i * 18))) % 1220 - 70;
      drawTicket2D(ctx, x, 1142 + i * 30, 82 + i * 8, { rot: -0.1 + Math.sin(t * 5 + i) * 0.06 });
    }
    const hedgyX = 800 + 8 * Math.sin(t * 5);
    drawHedgy(ctx, { x: hedgyX, y: 1050, scale: 4.6, t, pose: 'run', facing: 1, look: t < impactAt ? 'forward' : 'up', expression: t < impactAt ? 'determined' : 'shocked' });
    ctx.restore(); ctx.restore();
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const scareAt = eventAt(props, 'scaring', dur * 0.12, dur), impactAt = clamp(Math.max(scareAt + 0.26, dur * 0.1125), 0, dur), covers = buyTimes(dur);
    const cues: Cue[] = [
      { t: scareAt, kind: 'whoosh', gain: 0.68, pan: 0.02, len: 0.2 },
      { t: impactAt, kind: 'thud', gain: 1.24, pan: -0.18 },
      ...covers.map((t, i) => ({ t, kind: 'clack' as const, pan: [-0.56, 0.42, -0.44][i]!, gain: 1.3 + i * 0.1, step: i / 2 })),
    ];
    return cues.filter(cue => cue.t >= 0 && cue.t < dur);
  },
};
