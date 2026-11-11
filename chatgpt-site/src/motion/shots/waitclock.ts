import { clamp, ease, type Cue, type Frame, type ShotProps } from '../core.ts';
import { drawHedgy, type HedgyPose } from '../actor/hedgy.ts';
import { drawEnv } from '../env/index.ts';
import { createCameraRig } from '../fx/rig.ts';
import { drawEmitter, drawTrail } from '../fx/particles.ts';
import { pixelText } from '../prim.ts';
import { CELL, bayer } from '../pix.ts';
import type { ShotDef } from './index.ts';

const POSES: HedgyPose[] = ['idle', 'walk', 'run', 'jump', 'shock', 'celebrate', 'point', 'think', 'push', 'carry', 'fall', 'curl', 'roll', 'peek', 'sweat', 'sleep', 'wave-off'];

function eventTime(props: ShotProps, kind: string, dur: number, fallback: number) {
  const event = props.events?.find(item => item.kind.toLowerCase() === kind);
  return clamp(event?.at ?? fallback, 0, Math.max(0, dur));
}

function numberParam(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback;
}

function poseParam(value: unknown): HedgyPose {
  return typeof value === 'string' && POSES.includes(value as HedgyPose) ? value as HedgyPose : 'idle';
}

function segment(ctx: Frame['ctx'], x0: number, y0: number, x1: number, y1: number, color: string, width = CELL) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / CELL));
  ctx.fillStyle = color;
  for (let i = 0; i <= steps; i++) {
    const p = i / steps;
    ctx.fillRect(Math.round((x0 + (x1 - x0) * p) / CELL) * CELL, Math.round((y0 + (y1 - y0) * p) / CELL) * CELL, width, width);
  }
}

function ellipseFill(ctx: Frame['ctx'], cx: number, cy: number, rx: number, ry: number, color: string, dither = 0) {
  const top = Math.floor((cy - ry) / CELL) * CELL, bottom = Math.ceil((cy + ry) / CELL) * CELL;
  ctx.fillStyle = color;
  for (let y = top; y <= bottom; y += CELL) {
    const v = (y + CELL / 2 - cy) / ry;
    if (Math.abs(v) > 1) continue;
    const half = rx * Math.sqrt(1 - v * v);
    const left = Math.floor((cx - half) / CELL) * CELL, right = Math.ceil((cx + half) / CELL) * CELL;
    if (dither <= 0) { ctx.fillRect(left, y, right - left + CELL, CELL); continue; }
    for (let x = left; x <= right; x += CELL) {
      if (bayer(x / CELL, y / CELL) > dither) continue;
      ctx.fillRect(x, y, CELL, CELL);
    }
  }
}

function ellipseRing(ctx: Frame['ctx'], cx: number, cy: number, rx: number, ry: number, color: string, width = CELL * 2, phase = 0) {
  const steps = Math.ceil(Math.PI * 2 * Math.max(rx, ry) / (CELL * 1.5));
  ctx.fillStyle = color;
  for (let i = 0; i < steps; i++) {
    const a = i / steps * Math.PI * 2;
    const x = Math.round((cx + Math.cos(a) * rx) / CELL) * CELL;
    const y = Math.round((cy + Math.sin(a) * ry) / CELL) * CELL;
    if ((i + phase) % 11 < 2) continue;
    ctx.fillRect(x, y, width, width);
  }
}

function drawVenue(ctx: Frame['ctx'], t: number, theme: Frame['theme']) {
  // Deep, empty seat tiers climb into haze behind the mezzanine.
  for (let tier = 0; tier < 7; tier++) {
    const y = 214 + tier * 76, half = 208 + tier * 72;
    ctx.fillStyle = tier % 2 ? '#141417' : '#1B1B1F';
    ctx.fillRect(540 - half, y, half * 2, 13);
    ctx.fillStyle = tier % 2 ? '#48484E' : '#5A5A60';
    ctx.fillRect(540 - half, y, half * 2, 4);
    ctx.fillStyle = '#08080A';
    ctx.fillRect(540 - half + 12, y + 13, half * 2 - 24, 18);
    for (let seat = 0; seat < 13 + tier * 4; seat++) {
      const x = 540 - half + 20 + seat * (2 * half - 40) / Math.max(1, 12 + tier * 4);
      const on = ((seat * 7 + tier * 11 + Math.floor(t * 2)) % 19) === 0;
      ctx.fillStyle = on ? '#77777D' : (seat + tier) % 3 === 0 ? '#303035' : '#202024';
      ctx.fillRect(Math.round(x / CELL) * CELL, y - 17, CELL * 3, CELL * 3);
      ctx.fillStyle = '#101013';
      ctx.fillRect(Math.round(x / CELL) * CELL, y - 8, CELL * 3, CELL);
    }
  }

  // The lower hall floor and its vanishing point retain a sense of scale.
  ctx.fillStyle = '#0A0A0C'; ctx.fillRect(0, 900, 1080, 390);
  ctx.fillStyle = '#37373D'; ctx.fillRect(0, 900, 1080, CELL * 2);
  for (let i = -6; i <= 6; i++) segment(ctx, 540, 910, 540 + i * 180, 1290, '#202024', CELL);
  for (let i = 1; i <= 6; i++) {
    const y = 900 + i * i * 9;
    ctx.fillStyle = i % 2 ? '#18181C' : '#222227'; ctx.fillRect(0, y, 1080, CELL);
  }

  // A monumental locked vault sits below Hedgy, but far enough back to stay legible.
  ellipseFill(ctx, 445, 1090, 215, 124, '#08080A');
  ellipseFill(ctx, 445, 1080, 204, 116, '#303036', 0.83);
  ellipseFill(ctx, 445, 1080, 184, 100, '#101013');
  ellipseRing(ctx, 445, 1080, 199, 112, '#BDBDC2', CELL * 3);
  ellipseRing(ctx, 445, 1080, 171, 90, '#55555B', CELL * 2, 3);
  ellipseRing(ctx, 445, 1080, 108, 56, '#77777D', CELL * 2, 5);
  ellipseFill(ctx, 445, 1080, 65, 36, '#222227');
  ellipseRing(ctx, 445, 1080, 60, 33, '#C7C7CA', CELL * 2);
  for (let spoke = 0; spoke < 8; spoke++) {
    const a = spoke * Math.PI / 4 + t * 0.06;
    segment(ctx, 445, 1080, 445 + Math.cos(a) * 91, 1080 + Math.sin(a) * 45, '#68686E', CELL * 2);
    ellipseFill(ctx, 445 + Math.cos(a) * 91, 1080 + Math.sin(a) * 45, 8, 8, '#BDBDC2');
  }
  ctx.fillStyle = '#08080A'; ctx.fillRect(309, 1210, 272, 31);
  ctx.fillStyle = '#BDBDC2'; ctx.fillRect(309, 1206, 272, 4);
  pixelText(ctx, 'COLLATERAL', 445, 1212, 3, { color: '#D4D4D7', align: 'center' });
  // Locked seam, hinge blocks and a small status lamp keep the door tactile.
  ctx.fillStyle = '#A5A5AA'; ctx.fillRect(439, 1028, 12, 104);
  ctx.fillStyle = '#55555B'; ctx.fillRect(423, 1060, 44, 38);
  ctx.fillStyle = '#E2E2E5'; ctx.fillRect(437, 1071, 16, 16);
  ctx.fillStyle = '#29292E'; ctx.fillRect(441, 1075, 8, 8);
  ctx.fillStyle = '#C8C8CC'; ctx.fillRect(628, 1035, CELL * 2, CELL * 2);
  ctx.fillStyle = '#2A2A30'; ctx.fillRect(624, 1055, CELL * 2, CELL * 7);

  // Catwalks and cross braces create stacked, readable depth.
  for (let i = 0; i < 4; i++) {
    const y = 630 + i * 104, inset = i * 104;
    ctx.fillStyle = i === 0 ? '#414147' : '#28282D';
    ctx.fillRect(74 + inset, y, 932 - inset * 2, CELL * 2);
    ctx.fillStyle = '#77777D'; ctx.fillRect(74 + inset, y, 932 - inset * 2, CELL);
    ctx.fillStyle = '#111114'; ctx.fillRect(74 + inset, y + CELL * 2, 932 - inset * 2, CELL * 3);
    for (let x = 100 + inset; x < 1000 - inset; x += 88) {
      ctx.fillStyle = '#626268'; ctx.fillRect(x, y - 34, CELL, 34);
      ctx.fillStyle = '#222227'; ctx.fillRect(x + CELL, y - 30, CELL * 2, 28);
    }
  }
  ctx.fillStyle = theme.line; ctx.fillRect(0, 629, 1080, CELL);
}

function drawClock(ctx: Frame['ctx'], t: number, speed: number) {
  const cx = 867, cy = 416, rx = 254, ry = 277;
  ellipseFill(ctx, cx + 16, cy + 18, rx + 10, ry + 10, '#050506');
  ellipseFill(ctx, cx, cy, rx + 8, ry + 8, '#65656B', 0.94);
  ellipseFill(ctx, cx, cy, rx - 6, ry - 6, '#16161A');
  ellipseRing(ctx, cx, cy, rx, ry, '#E1E1E4', CELL * 4);
  ellipseRing(ctx, cx, cy, rx - 19, ry - 20, '#77777D', CELL * 2, 4);
  ellipseRing(ctx, cx, cy, rx - 35, ry - 38, '#303035', CELL * 2);
  ellipseFill(ctx, cx, cy, rx - 41, ry - 44, '#202024', 0.96);

  // Twelve oversized baton marks and minute teeth, all on the four-pixel grid.
  for (let mark = 0; mark < 60; mark++) {
    const a = -Math.PI / 2 + mark * Math.PI / 30;
    const long = mark % 5 === 0, inner = long ? 184 : 198, outer = long ? 218 : 213;
    const x0 = cx + Math.cos(a) * inner, y0 = cy + Math.sin(a) * inner * 1.04;
    const x1 = cx + Math.cos(a) * outer, y1 = cy + Math.sin(a) * outer * 1.04;
    segment(ctx, x0, y0, x1, y1, long ? '#F1F1F3' : '#7B7B81', long ? CELL * 3 : CELL);
  }
  // Dithered face striation catches a hard top-left key.
  for (let row = -31; row <= 27; row++) for (let col = -28; col <= 28; col++) {
    const x = cx + col * CELL, y = cy + row * CELL;
    if ((col * col) / (52 * 52) + (row * row) / (57 * 57) > 0.88) continue;
    if (bayer(col, row) < .12 + clamp((-col - row) / 250, 0, .18)) {
      ctx.fillStyle = '#34343A'; ctx.fillRect(x, y, CELL, CELL);
    }
  }
  // Sweeping long hand and slower hour hand. Each moves continuously, not as a static clock face.
  const minute = -Math.PI / 2 + t * speed * 2.6;
  const hour = -Math.PI / 2 + t * speed * 0.73 + 0.85;
  segment(ctx, cx, cy, cx + Math.cos(hour) * 116, cy + Math.sin(hour) * 126, '#BFC0C4', CELL * 8);
  segment(ctx, cx, cy, cx + Math.cos(minute) * 188, cy + Math.sin(minute) * 204, '#F4F4F5', CELL * 4);
  segment(ctx, cx + Math.cos(minute) * 180, cy + Math.sin(minute) * 195, cx + Math.cos(minute) * 208, cy + Math.sin(minute) * 226, '#88888E', CELL * 2);
  ellipseFill(ctx, cx, cy, 21, 23, '#D6D6D9');
  ellipseFill(ctx, cx, cy, 9, 10, '#3A3A40');
  ctx.fillStyle = '#A7A7AC'; ctx.fillRect(cx - 8, cy + 39, 16, 48);
  ctx.fillStyle = '#29292E'; ctx.fillRect(cx - 4, cy + 45, 8, 34);
}

function drawMezzanine(ctx: Frame['ctx'], t: number, theme: Frame['theme']) {
  // Narrow platform in perspective, with a dark underside and bright handrail.
  ctx.fillStyle = '#08080A'; ctx.beginPath(); ctx.moveTo(20, 756); ctx.lineTo(790, 756); ctx.lineTo(945, 805); ctx.lineTo(120, 805); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#65656B'; ctx.fillRect(20, 748, 770, CELL * 2);
  ctx.fillStyle = '#C3C3C7'; ctx.fillRect(20, 748, 770, CELL);
  ctx.fillStyle = '#26262B'; ctx.fillRect(20, 772, 830, CELL * 5);
  for (let i = 0; i < 8; i++) {
    const x = 52 + i * 94;
    ctx.fillStyle = '#8A8A90'; ctx.fillRect(x, 684, CELL * 2, 66);
    ctx.fillStyle = '#303035'; ctx.fillRect(x + CELL * 2, 692, CELL * 3, 52);
    ctx.fillStyle = '#C0C0C4'; ctx.fillRect(x, 681, CELL * 4, CELL * 2);
  }
  ctx.fillStyle = theme.dim; ctx.fillRect(20, 680, 790, CELL * 2);
  ctx.fillStyle = '#18181C'; ctx.fillRect(20, 816, 860, CELL * 3);
  for (let i = 0; i < 13; i++) {
    const x = 74 + i * 62;
    ctx.fillStyle = i % 2 ? '#37373D' : '#242428'; ctx.fillRect(x, 786, CELL * 2, 30);
  }
  // Downward return tether, caught on a paper stub and running to the vault.
  const sway = Math.sin(t * 2.4) * 5;
  drawTrail(ctx, [
    { x: 415, y: 720, alpha: 0.9 }, { x: 430 + sway, y: 836, alpha: 0.82 },
    { x: 438 + sway, y: 924, alpha: 0.68 }, { x: 474, y: 983, alpha: 0.54 },
  ], { color: '#B6B6BB', width: CELL * 2 });
  ctx.fillStyle = '#D6D6D9'; ctx.fillRect(414 + sway, 846, 75, 42);
  ctx.fillStyle = '#56565C'; ctx.fillRect(422 + sway, 854, 59, 26);
  ctx.fillStyle = '#E4E4E7'; ctx.fillRect(426 + sway, 858, 49, 3);
  ctx.fillStyle = '#77777D'; ctx.fillRect(426 + sway, 866, 35, 3);
  ctx.fillStyle = '#1A1A1D'; ctx.fillRect(470, 984, CELL * 3, CELL * 3);
  ctx.fillStyle = '#BDBDC2'; ctx.fillRect(474, 988, CELL, CELL);
}

function drawTrace(ctx: Frame['ctx'], t: number, dur: number, fadeAt: number, direction: string, seed: number) {
  const settle = ease.outCubic(t / Math.max(.4, dur * .72));
  const fade = ease.outCubic((t - fadeAt) / Math.max(.2, dur * .24));
  const slope = direction === 'up' ? -92 : direction === 'flat' ? 0 : 92;
  const pts = Array.from({ length: 30 }, (_, i) => {
    const u = i / 29, wave = Math.sin(u * 17 + seed * .01) * 8 + Math.sin(u * 43 + 1.7) * 3;
    return { x: 28 + u * 1024, y: 858 + slope * u * settle + wave * settle, alpha: (0.68 - fade * 0.52) * Math.min(1, .16 + (t / Math.max(.1, dur)) * 2.7) };
  });
  drawTrail(ctx, pts, { color: fade > .7 ? '#34343A' : '#85858B', width: CELL * 2 });
  if (fade < .76) {
    const head = pts[Math.min(pts.length - 1, Math.floor((clamp(t / Math.max(.2, dur)) * .82 + .16) * 29))]!;
    ellipseFill(ctx, head.x, head.y, 8, 8, '#C2C2C6', 0.7 * (1 - fade));
  }
}

export const waitclockShot: ShotDef = {
  name: 'waitclock',
  describe: 'Hedgy waits above the empty venue as a giant clock sweeps and a tethered vault sits below; params: waitingPose (Hedgy pose), clockSpeed (0.2–5), traceDirection (down/up/flat).',
  render(frame: Frame, props: ShotProps) {
    const { ctx, t: rawT, dur, theme, seed } = frame;
    const t = clamp(rawT, 0, Math.max(.01, dur));
    const p = props.params ?? {};
    const clockSpeed = numberParam(p.clockSpeed, 1.4, .2, 5);
    const traceDirection = p.traceDirection === 'up' || p.traceDirection === 'flat' ? p.traceDirection : 'down';
    const pose = poseParam(p.waitingPose ?? p.pose);
    const fadeAt = eventTime(props, 'fade', dur, dur * .70);
    const waitAt = eventTime(props, 'waits', dur, dur * .34);
    const cam = createCameraRig({
      width: 1080, height: 1920, seed: seed + 17, handheld: 2.4,
      keyframes: [
        { t: 0, x: -8, y: 12, zoom: 1.01, rot: .004, ease: 'linear' },
        { t: dur * .48, x: 12, y: -25, zoom: 1.035, rot: -.008, ease: 'inOut' },
        { t: dur, x: 34, y: -86, zoom: 1.075, rot: -.026, ease: 'inOut' },
      ],
    });
    const camera = cam.poseAt(t);
    drawEnv(ctx, { type: 'stage', t, theme, seed, camera: { x: camera.x, y: camera.y, zoom: camera.zoom, rot: camera.rot, yaw: camera.rot * 1.5, pitch: .18 } });

    ctx.save(); cam.apply(ctx, t);
    drawVenue(ctx, t, theme);
    drawTrace(ctx, t, dur, fadeAt, traceDirection, seed);
    drawMezzanine(ctx, t, theme);

    const footAge = t >= waitAt ? (t - waitAt) % .58 : 1;
    const pulse = clamp(1 - footAge / .13);
    ctx.fillStyle = '#070709'; ctx.fillRect(266, 816, 194, 14);
    ctx.fillStyle = '#2C2C31'; ctx.fillRect(280, 817, 164, 5);
    drawHedgy(ctx, { x: 370, y: 756, scale: 1.72, t, pose, facing: 1, look: 'down', expression: 'worried' });
    if (pulse > 0) {
      // Three visible toe-tap sparks sit above the platform lip and vanish between beats.
      ctx.fillStyle = '#E0E0E3'; ctx.fillRect(400, 740 + Math.round((1 - pulse) * 8), 8, 4);
      ctx.fillStyle = '#A7A7AC'; ctx.fillRect(412, 732 + Math.round((1 - pulse) * 4), 8, 4);
      if (pulse > .45) { ctx.fillStyle = '#D1D1D5'; ctx.fillRect(424, 724, 8, 4); }
    }

    // Clock is a close foreground layer that sweeps across the depth of the hall.
    drawClock(ctx, t, clockSpeed);
    ctx.fillStyle = '#39393F'; ctx.fillRect(-16, 168, 68, 466);
    ctx.fillStyle = '#A7A7AC'; ctx.fillRect(12, 168, CELL * 2, 466);
    ctx.fillStyle = '#151518'; ctx.fillRect(48, 168, 16, 466);
    // Near-camera dust hangs in the light while the hall empties.
    drawEmitter(ctx, t, { kind: 'smoke', x: 510, y: 744, width: 980, height: 460, seed: seed + 83, start: 0, rate: 7.5, life: 2.3, speed: 22, wind: -7, size: 1, color: '#77777D' });
    ctx.restore();
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const fadeAt = eventTime(props, 'fade', dur, dur * .70);
    const waitAt = eventTime(props, 'waits', dur, dur * .34);
    const cues: Cue[] = [{ t: 0, kind: 'tick', pan: 0.62, gain: .46 }];
    if (waitAt < fadeAt && waitAt < dur) cues.push({ t: Number(waitAt.toFixed(3)), kind: 'step', pan: -.3, gain: .38 });
    for (let i = 1; i <= 4; i++) {
      const at = waitAt + i * Math.min(.58, dur * .22);
      if (at < dur && at < fadeAt) cues.push({ t: Number(at.toFixed(3)), kind: i % 2 ? 'step' : 'tick', pan: -.3, gain: i % 2 ? .3 : .42, step: i / 5 });
    }
    if (fadeAt < dur) cues.push({ t: Number(fadeAt.toFixed(3)), kind: 'drop', pan: .4, gain: .4 });
    return cues;
  },
};
