import { clamp, ease, type Cue, type Frame, type ShotProps } from '../core.ts';
import { drawHedgy } from '../actor/hedgy.ts';
import { drawEnv } from '../env/index.ts';
import { createCameraRig } from '../fx/rig.ts';
import { drawBurst } from '../fx/particles.ts';
import { applyPixelBloom } from '../fx/post.ts';
import { fitPixel, pixelText } from '../prim.ts';
import { CELL, bayer } from '../pix.ts';
import type { ShotDef } from './index.ts';

const W = 1080;
const H = 1290;

function eventTime(props: ShotProps, kind: string, dur: number, fallback: number) {
  const event = props.events?.find(item => item.kind.toLowerCase() === kind);
  return clamp(event?.at ?? fallback, 0, Math.max(0, dur));
}

function numberParam(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback;
}

function textParam(value: unknown) {
  const text = typeof value === 'string' ? value : 'REUNION';
  const clean = text.toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim().slice(0, 18);
  return clean || 'REUNION';
}

function drawArena(ctx: Frame['ctx'], t: number, reunionAt: number, count: number) {
  // The concert bowl climbs behind the stage in distinct steel and stone tiers.
  ctx.fillStyle = '#101013'; ctx.fillRect(0, 170, W, 1000);
  ctx.fillStyle = '#39393F'; ctx.fillRect(0, 184, W, 10);
  for (let tier = 0; tier < count; tier++) {
    const y = 250 + tier * 116, half = 284 + tier * 92;
    ctx.fillStyle = tier % 2 ? '#1B1B1F' : '#242429';
    ctx.fillRect(540 - half, y, half * 2, 35);
    ctx.fillStyle = '#74747B'; ctx.fillRect(540 - half, y, half * 2, CELL);
    ctx.fillStyle = '#09090B'; ctx.fillRect(540 - half + 10, y + 38, half * 2 - 20, 20);
    for (let seat = 0; seat < 16 + tier * 3; seat++) {
      const x = 540 - half + 24 + seat * (2 * half - 48) / (15 + tier * 3);
      // Start at the stage-side rail and chase the light up toward the roof.
      const flash = t >= reunionAt + (count - 1 - tier) * .095;
      const lit = flash && (seat + tier) % 3 !== 1;
      ctx.fillStyle = lit ? '#DADAE0' : (seat + tier) % 2 ? '#3C3C42' : '#55555B';
      ctx.fillRect(Math.round(x / CELL) * CELL, y - 21, CELL * 3, CELL * 2);
      if (lit && (seat + tier) % 4 === 0) {
        ctx.fillStyle = '#FFFFFF'; ctx.fillRect(Math.round(x / CELL) * CELL, y - 25, CELL * 3, CELL);
      }
    }
    // Each row has a strong horizontal lip, so the light cascade reads at phone size.
    if (t >= reunionAt + tier * .095) {
      ctx.fillStyle = '#BABABF'; ctx.fillRect(540 - half, y + 48, half * 2, CELL);
      ctx.fillStyle = '#F0F0F2'; ctx.fillRect(540 - half, y + 48, half * 2, CELL / 2);
    }
  }

  // Stage arch, floor and side towers give the poster a deep, legible frame.
  ctx.fillStyle = '#0A0A0C'; ctx.fillRect(126, 310, 828, 610);
  ctx.fillStyle = '#38383E'; ctx.fillRect(145, 294, 790, 18);
  ctx.fillStyle = '#77777D'; ctx.fillRect(158, 300, 764, CELL);
  ctx.fillStyle = '#151519'; ctx.fillRect(162, 334, 756, 520);
  ctx.fillStyle = '#55555B'; ctx.fillRect(194, 836, 692, 12);
  ctx.fillStyle = '#B4B4B9'; ctx.fillRect(222, 848, 636, CELL);
  ctx.fillStyle = '#08080A'; ctx.beginPath(); ctx.moveTo(0, 1010); ctx.lineTo(W, 1010); ctx.lineTo(990, 1100); ctx.lineTo(90, 1100); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#5D5D63'; ctx.fillRect(0, 1002, W, CELL * 2);
  ctx.fillStyle = '#C0C0C4'; ctx.fillRect(0, 1002, W, CELL);
  for (let i = -6; i <= 6; i++) {
    ctx.strokeStyle = '#2C2C32'; ctx.lineWidth = CELL;
    ctx.beginPath(); ctx.moveTo(540, 1012); ctx.lineTo(540 + i * 144, 1290); ctx.stroke();
  }
  for (let i = 1; i < 7; i++) {
    ctx.fillStyle = i % 2 ? '#202024' : '#2B2B30'; ctx.fillRect(0, 1010 + i * i * 7, W, CELL);
  }

  // Low front balcony carries Hedgy through the full reveal.
  ctx.fillStyle = '#08080A'; ctx.beginPath(); ctx.moveTo(-28, 1128); ctx.lineTo(1108, 1128); ctx.lineTo(1080, 1240); ctx.lineTo(0, 1240); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#535359'; ctx.fillRect(0, 1118, W, CELL * 3);
  ctx.fillStyle = '#D0D0D4'; ctx.fillRect(0, 1118, W, CELL);
  ctx.fillStyle = '#29292E'; ctx.fillRect(0, 1144, W, 12);
  for (let i = 0; i < 12; i++) {
    const x = 30 + i * 91;
    ctx.fillStyle = '#76767D'; ctx.fillRect(x, 1156, CELL * 2, 66);
    ctx.fillStyle = '#303035'; ctx.fillRect(x + CELL * 2, 1162, CELL * 2, 60);
  }
}

function ditherCone(ctx: Frame['ctx'], ax: number, ay: number, reach: number, halfWidth: number, energy: number, seed: number) {
  const step = CELL * 2;
  const bottom = Math.min(1240, Math.ceil((ay + reach) / step) * step);
  for (let y = Math.floor(ay / step) * step; y < bottom; y += step) {
    const v = clamp((y - ay) / Math.max(1, reach));
    const half = Math.max(step, halfWidth * v);
    const left = Math.max(0, Math.floor((ax - half) / step) * step);
    const right = Math.min(W, Math.ceil((ax + half) / step) * step);
    for (let x = left; x < right; x += step) {
      const across = Math.abs((x + step / 2 - ax) / half);
      const density = energy * (1 - v * .38) * (1 - across * .46);
      const threshold = (bayer(x / CELL + seed, y / CELL + seed * 3) + .08) % 1;
      if (density <= threshold) continue;
      ctx.fillStyle = density > .72 ? '#D8D8DC' : density > .43 ? '#99999F' : '#68686E';
      ctx.fillRect(x, y, step, step);
    }
  }
}

function drawSpotlights(ctx: Frame['ctx'], t: number, reunionAt: number) {
  if (t < reunionAt) return;
  const bloom = .36 + .64 * ease.outExpo((t - reunionAt) / .22);
  // These three hard-edged beams land from the roof onto the poster and the crowd bowl.
  ditherCone(ctx, 320, 264, 770, 260, .65 * bloom, 7);
  ditherCone(ctx, 760, 264, 770, 260, .65 * bloom, 19);
  ditherCone(ctx, 540, 270, 680, 150, .48 * bloom, 31);
  for (const [x, y] of [[320, 258], [540, 254], [760, 258]]) {
    ctx.fillStyle = '#D6D6DA'; ctx.fillRect(x - 24, y, 48, 16);
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(x - 12, y - 8, 24, 8);
    ctx.fillStyle = '#606066'; ctx.fillRect(x - 30, y + 16, 60, CELL);
  }
}

function drawMarquee(ctx: Frame['ctx'], t: number, announcesAt: number, reunionAt: number, word: string, seed: number) {
  if (t < reunionAt) {
    // Once the curtains part, a compact sign cassette hangs above the empty stage.
    const deploy = ease.outExpo((t - announcesAt) / .14);
    const caseWidth = 264 * deploy;
    if (caseWidth > 0) {
      ctx.fillStyle = '#08080A'; ctx.fillRect(540 - caseWidth / 2 - 12, 538, caseWidth + 24, 56);
      ctx.fillStyle = '#8B8B91'; ctx.fillRect(540 - caseWidth / 2, 542, caseWidth, 8);
      ctx.fillStyle = '#D6D6DA'; ctx.fillRect(540 - caseWidth / 2 + 8, 544, Math.max(0, caseWidth - 16), CELL);
      ctx.fillStyle = '#414147'; ctx.fillRect(540 - 6, 552, 12, 32);
      ctx.fillStyle = '#A5A5AB'; ctx.fillRect(540 - 14, 580, 28, CELL);
    }
    return;
  }
  const p = ease.outBack(clamp((t - reunionAt) / .2));
  const scale = .82 + .18 * p;
  ctx.save();
  ctx.translate(540, 556); ctx.scale(scale, scale); ctx.translate(-540, -556);
  const x = 104, y = 328, w = 872, h = 456;
  // Deep black casing and polished silver rails make this an arena marquee, not a title card.
  ctx.fillStyle = '#050506'; ctx.fillRect(x - 28, y - 24, w + 56, h + 60);
  ctx.fillStyle = '#7B7B81'; ctx.fillRect(x - 18, y - 16, w + 36, h + 36);
  ctx.fillStyle = '#D5D5D9'; ctx.fillRect(x - 10, y - 10, w + 20, 14);
  ctx.fillStyle = '#151518'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#E4E4E7'; ctx.fillRect(x + 14, y + 14, w - 28, h - 28);
  ctx.fillStyle = '#F3F3F5'; ctx.fillRect(x + 24, y + 24, w - 48, h - 48);
  ctx.fillStyle = '#9F9FA5'; ctx.fillRect(x + 34, y + 34, 10, h - 68);
  ctx.fillStyle = '#C3C3C7'; ctx.fillRect(x + w - 44, y + 34, 10, h - 68);

  // A restrained halftone grain holds the paper face without filling the frame with noise.
  for (let row = 0; row < 28; row++) for (let col = 0; col < 64; col++) {
    if (bayer(col + seed, row + seed * 3) > .91) {
      ctx.fillStyle = '#C5C5CA'; ctx.fillRect(x + 56 + col * 12, y + 44 + row * 12, CELL, CELL);
    }
  }
  ctx.fillStyle = '#333338'; ctx.fillRect(x + 78, y + 78, w - 156, 8);
  ctx.fillStyle = '#A2A2A8'; ctx.fillRect(x + 78, y + h - 86, w - 156, 8);
  ctx.fillStyle = '#5E5E64'; ctx.fillRect(x + 112, y + h - 64, w - 224, CELL);

  const fitted = fitPixel(word, 716, 1, [14, 13, 12, 11, 10, 9, 8]);
  pixelText(ctx, fitted.lines[0] ?? 'REUNION', 540, y + 190, fitted.px, { color: '#111114', align: 'center', reveal: 1, mode: 'type', seed });

  // The bulb row snaps to life with the sign; alternating pixels retain a handmade marquee feel.
  for (let i = 0; i < 21; i++) {
    const bx = x + 32 + i * 40;
    ctx.fillStyle = i % 3 === 0 ? '#FFFFFF' : '#A5A5AA';
    ctx.fillRect(bx, y - 2, 12, 12);
    ctx.fillRect(bx, y + h - 10, 12, 12);
  }
  for (let i = 0; i < 9; i++) {
    const by = y + 30 + i * 48;
    ctx.fillStyle = i % 2 ? '#BFC0C4' : '#FFFFFF';
    ctx.fillRect(x - 5, by, 12, 12); ctx.fillRect(x + w - 7, by, 12, 12);
  }
  ctx.restore();
}

function drawCurtains(ctx: Frame['ctx'], open: number, t: number, curtainStart: number) {
  const shiver = Math.sin((t - curtainStart) * 42) * (1 - open) * 5;
  const gapL = Math.round(540 - open * 516 + shiver);
  const gapR = Math.round(540 + open * 516 - shiver);
  ctx.fillStyle = '#1A1A1E'; ctx.fillRect(-12, -8, gapL + 12, 1300);
  for (let x = -8; x < gapL; x += 28) {
    const rib = Math.floor((x + 8) / 28), pulse = Math.sin(rib * .63 + t * .28) * 4;
    const width = Math.min(20, gapL - x);
    ctx.fillStyle = rib % 2 ? '#2B2B30' : '#414147'; ctx.fillRect(x + 4, 0, width, 1288);
    ctx.fillStyle = rib % 3 === 0 ? '#85858B' : '#55555B'; ctx.fillRect(x + 4 + Math.round(pulse), 0, 4, 1288);
    ctx.fillStyle = '#101013'; ctx.fillRect(x + 22, 0, 6, 1288);
  }
  ctx.fillStyle = '#1A1A1E'; ctx.fillRect(gapR, -8, 1092 - gapR, 1300);
  for (let x = gapR; x < 1092; x += 28) {
    const rib = Math.floor((x - gapR) / 28), pulse = Math.sin(rib * .62 + t * .3 + 1) * 4;
    const width = Math.min(20, 1092 - x);
    ctx.fillStyle = rib % 2 ? '#414147' : '#2B2B30'; ctx.fillRect(x + 4, 0, width, 1288);
    ctx.fillStyle = rib % 3 === 0 ? '#85858B' : '#55555B'; ctx.fillRect(x + 4 + Math.round(pulse), 0, 4, 1288);
    ctx.fillStyle = '#101013'; ctx.fillRect(x + 22, 0, 6, 1288);
  }
  // Weighty valance and bright inner hems keep the curtain action tactile.
  ctx.fillStyle = '#242428'; ctx.fillRect(-8, 0, 1096, 82);
  ctx.fillStyle = '#77777D'; ctx.fillRect(0, 74, W, 8);
  ctx.fillStyle = '#D0D0D4'; ctx.fillRect(0, 78, W, CELL);
  ctx.fillStyle = '#B8B8BD'; ctx.fillRect(gapL - 5, 0, 5, 1288);
  ctx.fillStyle = '#B8B8BD'; ctx.fillRect(gapR, 0, 5, 1288);
  // One narrow house spot glows through the closed velvet and fades as it parts.
  ctx.save(); ctx.globalAlpha *= .42 * (1 - open);
  ctx.fillStyle = '#9A9AA0';
  for (let row = 0; row < 32; row++) {
    const y = 100 + row * 16, half = 12 + row * 3;
    for (let x = 540 - half; x <= 540 + half; x += 12) {
      if (bayer(Math.floor(x / CELL), row) < .53) ctx.fillRect(x, y, CELL * 2, CELL * 2);
    }
  }
  ctx.fillStyle = '#F0F0F2'; ctx.fillRect(528, 90, 24, 8);
  ctx.fillStyle = '#77777D'; ctx.fillRect(512, 98, 56, 8);
  ctx.restore();
}

function drawTransitionPalm(ctx: Frame['ctx'], x: number, y: number, scale: number, angle: number) {
  ctx.save();
  ctx.translate(Math.round(x / CELL) * CELL, Math.round(y / CELL) * CELL);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  ctx.fillStyle = '#17191E';
  ctx.strokeStyle = '#090A0C';
  ctx.lineWidth = 9;
  ctx.lineJoin = 'miter';
  ctx.beginPath();
  ctx.moveTo(-36, 126); ctx.lineTo(-20, 73); ctx.lineTo(-34, 10); ctx.lineTo(-17, -43);
  ctx.lineTo(2, -39); ctx.lineTo(13, 26); ctx.lineTo(25, -76); ctx.lineTo(47, -75);
  ctx.lineTo(54, 23); ctx.lineTo(70, -55); ctx.lineTo(91, -48); ctx.lineTo(82, 35);
  ctx.lineTo(103, 6); ctx.lineTo(122, 20); ctx.lineTo(101, 87); ctx.lineTo(77, 147);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#BFC2C7';
  ctx.fillRect(-27, 71, 71, 13);
  ctx.fillRect(-10, 3, 10, 42);
  ctx.fillRect(32, -54, 10, 67);
  ctx.fillRect(73, -31, 10, 54);
  ctx.fillStyle = '#747880';
  ctx.fillRect(-37, 128, 75, 15);
  ctx.restore();
}

function drawOutgoingPalm(ctx: Frame['ctx'], t: number, dur: number) {
  // Finish at the same scale and anchor used by the incoming crowd hand during the overlap.
  const start = Math.max(0, dur - .34), travel = .19;
  if (t < start) return;
  const p = ease.outCubic(clamp((t - start) / travel));
  const x = 720 + (545 - 720) * p;
  const y = 1210 + (1030 - 1210) * p;
  drawTransitionPalm(ctx, x, y, 1.18, -.3);
}

export const announcementShot: ShotDef = {
  name: 'announcement',
  describe: 'The venue curtains snap open on announces; a REUNION marquee hits with a shock pop as seven balcony tiers and three spotlights ignite on reunion.',
  render(frame: Frame, props: ShotProps) {
    const { ctx, t: rawT, dur, theme, seed } = frame;
    const t = clamp(rawT, 0, Math.max(.01, dur));
    const lightCount = Math.round(numberParam(props.params?.lightCount, 7, 4, 9));
    const word = textParam(props.params?.posterWord);
    const announcesAt = eventTime(props, 'announces', dur, dur * .32);
    const reunionAt = eventTime(props, 'reunion', dur, dur * .54);
    const curtainStart = clamp(announcesAt - dur * .276, 0, dur);
    const curtainSpan = Math.max(.12, dur * .2);
    const open = ease.outCubic((t - curtainStart) / curtainSpan);
    const rig = createCameraRig({
      width: W, height: 1920, seed: seed + 41, handheld: 1.6,
      keyframes: [
        { t: 0, x: 0, y: 8, zoom: 1.005, rot: 0, ease: 'linear' },
        { t: announcesAt, x: -4, y: 0, zoom: 1.02, rot: 0, ease: 'out' },
        { t: reunionAt, x: 0, y: -16, zoom: 1.12, rot: -.003, ease: 'inOut' },
        { t: Math.min(dur, reunionAt + .18), x: -4, y: -22, zoom: 1.08, rot: .002, ease: 'out' },
        { t: dur, x: -12, y: -44, zoom: 1.085, rot: .006, ease: 'inOut' },
      ], hits: [announcesAt, reunionAt], punch: .04, shake: 6,
    });
    const camera = rig.poseAt(t);
    drawEnv(ctx, { type: 'stage', t, theme, seed, width: W, height: H, camera: { x: camera.x, y: camera.y, zoom: camera.zoom, rot: camera.rot, yaw: camera.rot * 1.2, pitch: .23 } });

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    rig.apply(ctx, t);
    drawArena(ctx, t, reunionAt, lightCount);
    drawSpotlights(ctx, t, reunionAt);
    drawMarquee(ctx, t, announcesAt, reunionAt, word, seed + 3);
    drawCurtains(ctx, open, t, curtainStart);

    // Hedgy starts low in the front balcony, then pops upright in a clear shock pose.
    const pop = ease.outBack(clamp((t - reunionAt) / .17));
    const feet = 1190 - pop * 44;
    const pose = t < reunionAt ? 'peek' : 'shock';
    const poseT = Math.max(0, t - reunionAt);
    ctx.fillStyle = '#08080A'; ctx.fillRect(104, 1218, 310, 20);
    ctx.fillStyle = '#B8B8BD'; ctx.fillRect(104, 1212, 310, CELL);
    drawHedgy(ctx, {
      x: 252, y: feet, scale: 4.1, t: pose === 'shock' ? poseT : Math.max(0, t - announcesAt),
      pose, facing: 1, look: 'up', expression: pose === 'shock' ? 'shocked' : 'worried', prop: 'none',
    });

    // A brief white pixel burst lifts away from the marquee impact, then drifts through depth.
    if (t >= reunionAt - .02) {
      drawBurst(ctx, t, { center: { x: 540, y: 570 }, seed: seed + 101, count: 48, kind: 'dust', start: reunionAt, life: 1.0, speed: 390, spread: 5.8, gravity: 82, drag: .16, floor: 1300, size: 1, color: '#E5E5E9' });
      drawBurst(ctx, t, { center: { x: 540, y: 650 }, seed: seed + 127, count: 22, kind: 'confetti', start: reunionAt + .025, life: .92, speed: 280, spread: 5.4, gravity: 220, drag: .2, floor: 1300, spin: 8, size: 2, color: '#F0F0F2' });
    }
    ctx.restore();

    // Pixel bloom is confined to the sign and beam landing zone for a clean, bright hit.
    if (t >= reunionAt) applyPixelBloom(ctx, { x: 112, y: 276, w: 856, h: 650, threshold: 186, radius: 2, strength: .5, cell: 8 });
    drawOutgoingPalm(ctx, t, dur);
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const announcesAt = eventTime(props, 'announces', dur, dur * .32);
    const reunionAt = eventTime(props, 'reunion', dur, dur * .54);
    const curtainStart = clamp(announcesAt - dur * .276, 0, dur);
    const cues: Cue[] = [
      { t: Number(curtainStart.toFixed(3)), kind: 'swish', pan: 0, gain: .76 },
      { t: Number(reunionAt.toFixed(3)), kind: 'impact', pan: 0, gain: 1.42 },
      { t: Number(Math.min(dur, reunionAt + .19).toFixed(3)), kind: 'shimmer', pan: .12, gain: .62, len: .22 },
    ];
    return cues.filter(cue => cue.t <= dur);
  },
};
