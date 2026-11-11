import { clamp, ease, hash, type Cue, type Frame, type ShotProps } from '../core.ts';
import { pixelText } from '../prim.ts';
import { drawHedgy } from '../actor/hedgy.ts';
import { createCameraRig } from '../fx/rig.ts';
import { drawTicket2D } from '../sets/ticket.ts';
import type { ShotDef } from './index.ts';

const CELL = 4;
const snap = (n: number) => Math.round(n / CELL) * CELL;
const numberParam = (value: unknown, fallback: number) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function eventAt(props: ShotProps, kind: string, dur: number, fallback: number) {
  const event = props.events?.find(item => item.kind.toLowerCase() === kind.toLowerCase());
  return clamp(event && Number.isFinite(event.at) ? event.at : dur * fallback, 0, dur);
}

function polygon(ctx: Frame['ctx'], points: Array<[number, number]>, fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(snap(points[0]![0]), snap(points[0]![1]));
  for (let i = 1; i < points.length; i++) ctx.lineTo(snap(points[i]![0]), snap(points[i]![1]));
  ctx.closePath();
  ctx.fill();
}

function drawArena(ctx: Frame['ctx'], t: number, seed: number) {
  ctx.fillStyle = '#111216';
  ctx.fillRect(0, 0, 1080, 1290);

  // A bowl of steel balconies, with a bright rim and seat banks receding into haze.
  polygon(ctx, [[0, 0], [1080, 0], [1080, 812], [922, 948], [156, 948], [0, 812]], '#191B20');
  polygon(ctx, [[0, 0], [74, 0], [74, 888], [156, 948], [0, 886]], '#34373D');
  polygon(ctx, [[1006, 0], [1080, 0], [1080, 886], [922, 948], [1006, 888]], '#34373D');
  ctx.fillStyle = '#8A8E95';
  ctx.fillRect(68, 0, 8, 874);
  ctx.fillRect(1004, 0, 8, 874);

  for (let tier = 0; tier < 6; tier++) {
    const y = 422 + tier * 106;
    const inset = Math.round((y - 422) * .19);
    const drift = Math.round(Math.sin(t * 1.3 + tier * .9) * 8);
    const x = 102 + inset + drift, w = 876 - inset * 2;
    ctx.fillStyle = tier % 2 ? '#26282E' : '#202227';
    ctx.fillRect(x, y, w, 54);
    ctx.fillStyle = tier < 2 ? '#767A81' : '#62666D';
    ctx.fillRect(x, y, w, 6);
    ctx.fillStyle = '#111317';
    ctx.fillRect(x + 8, y + 16, w - 16, 10);
    ctx.fillStyle = '#41444B';
    ctx.fillRect(x + 8, y + 43, w - 16, 5);

    // Individual seat backs and occasional lit aisle lamps break up the long bands.
    const seats = Math.floor(w / 46);
    for (let seat = 0; seat < seats; seat++) {
      const sx = x + 18 + seat * 46;
      const light = hash(tier * 71 + seat, seed + 9) > .73;
      ctx.fillStyle = light ? '#AEB2B8' : '#51555D';
      ctx.fillRect(sx, y + 24, 22, 12);
      ctx.fillStyle = '#25272C';
      ctx.fillRect(sx + 4, y + 36, 14, 7);
    }
    for (let post = 0; post < 8; post++) {
      const px = x + 32 + post * (w - 64) / 7;
      ctx.fillStyle = '#858990';
      ctx.fillRect(snap(px), y + 49, 5, 54);
    }
  }

  // Roof trusses converge toward the ticket fascia, giving the rush a deep venue to fill.
  ctx.strokeStyle = '#44474E';
  ctx.lineWidth = 8;
  for (let i = 0; i < 8; i++) {
    const x = i * 154 - 70;
    ctx.beginPath();
    ctx.moveTo(snap(540 + (x - 540) * .12), 116);
    ctx.lineTo(snap(x), 420);
    ctx.stroke();
  }
  ctx.fillStyle = '#A5A9AF';
  for (let i = 0; i < 12; i++) {
    const x = 58 + i * 88;
    ctx.fillRect(x, 124 + (i % 3) * 8, 34, 8);
    ctx.fillStyle = '#5E6269';
    ctx.fillRect(x + 10, 136 + (i % 3) * 8, 14, 24);
    ctx.fillStyle = '#A5A9AF';
  }
  // Fine concrete dither keeps the deep bowl bright enough to read without flattening it.
  for (let i = 0; i < 280; i++) {
    const x = Math.floor(hash(i, seed + 21) * 1080 / CELL) * CELL;
    const y = 450 + Math.floor(hash(i, seed + 37) * 560 / CELL) * CELL;
    ctx.fillStyle = hash(i, seed + 53) > .58 ? '#363940' : '#292B31';
    ctx.fillRect(x, y, CELL, CELL);
  }
}

interface Fan {
  x: number;
  y: number;
  scale: number;
  variant: number;
  phase: number;
  speed: number;
  delay: number;
  lean: number;
}

const FAN_CLOTHES = [
  ['#777B82', '#C4C7CC'],
  ['#5A5E65', '#9B9FA6'],
  ['#A3A6AC', '#E0E2E5'],
  ['#464A51', '#858990'],
] as const;

function fanLimb(ctx: Frame['ctx'], x: number, y: number, length: number, angle: number, width: number, color: string) {
  const ex = x + Math.cos(angle) * length, ey = y + Math.sin(angle) * length;
  ctx.strokeStyle = '#15171B';
  ctx.lineWidth = width + 4;
  ctx.lineCap = 'square';
  ctx.beginPath(); ctx.moveTo(snap(x), snap(y)); ctx.lineTo(snap(ex), snap(ey)); ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(snap(x), snap(y)); ctx.lineTo(snap(ex), snap(ey)); ctx.stroke();
  ctx.fillStyle = '#D7D9DC';
  ctx.fillRect(snap(ex - width * .48), snap(ey - width * .48), snap(width), snap(width));
}

function drawFan(ctx: Frame['ctx'], fan: Fan, time: number, surge: number) {
  const { x: homeX, y: homeY, scale, variant, phase, speed, delay, lean } = fan;
  const run = ease.outCubic(clamp((surge - delay) / .78));
  const sway = Math.sin(time * (variant % 2 ? 12 : 9) + phase);
  const x = homeX + speed * run + sway * (2 + scale);
  const y = homeY - run * (18 + scale * 9) + Math.sin(time * 8 + phase) * (2 + scale);
  const [cloth, highlight] = FAN_CLOTHES[variant % FAN_CLOTHES.length]!;
  const legKick = Math.sin(time * 20 + phase) * run * 5;
  const reach = variant % 4;

  ctx.save();
  ctx.translate(snap(x), snap(y));
  ctx.rotate(lean - run * .1);
  ctx.scale(scale, scale);

  // Separated legs and elbows make the tiny figures read as different people in motion.
  fanLimb(ctx, -5, -7, 13, Math.PI / 2 + legKick * .045, 6, cloth);
  fanLimb(ctx, 5, -7, 13, Math.PI / 2 - legKick * .045, 6, highlight);
  ctx.fillStyle = '#15171B';
  ctx.fillRect(-14, -40, 28, 34);
  ctx.fillStyle = cloth;
  ctx.fillRect(-10, -37, 20, 28);
  ctx.fillStyle = highlight;
  ctx.fillRect(-10, -37, 4, 23);
  ctx.fillRect(5, -32, 5, 14);
  ctx.fillStyle = '#101114';
  ctx.fillRect(-11, -60, 22, 21);
  ctx.fillStyle = variant % 3 === 0 ? '#C9CCD1' : '#888C93';
  ctx.fillRect(-8, -57, 16, 15);
  ctx.fillStyle = '#34373D';
  ctx.fillRect(-10 - variant % 3 * 2, -62, 20 + variant % 3 * 4, 6);

  const shoulderY = -34;
  const leftAngle = reach === 0 ? -2.05 : reach === 1 ? -1.15 : reach === 2 ? -2.55 : -0.35;
  const rightAngle = reach === 0 ? -1.05 : reach === 1 ? -.3 : reach === 2 ? -2.1 : -2.7;
  fanLimb(ctx, -11, shoulderY, 22, leftAngle + sway * .035, 7, cloth);
  fanLimb(ctx, 11, shoulderY, 24, rightAngle - sway * .04, 7, highlight);
  ctx.restore();
}

function crowdLayers(seed: number): { far: Fan[]; middle: Fan[]; near: Fan[] } {
  const far: Fan[] = [], middle: Fan[] = [], near: Fan[] = [];
  for (let i = 0; i < 27; i++) {
    const tier = i % 3;
    far.push({
      x: 72 + (i % 9) * 118 + (tier === 1 ? 24 : 0),
      y: 515 + tier * 114 + (Math.floor(i / 9) % 2) * 19,
      scale: .78 + hash(i, seed + 1) * .38,
      variant: Math.floor(hash(i, seed + 2) * 4),
      phase: hash(i, seed + 3) * Math.PI * 2,
      speed: 22 + hash(i, seed + 4) * 42,
      delay: hash(i, seed + 5) * .22,
      lean: (hash(i, seed + 6) - .5) * .2,
    });
  }
  for (let i = 0; i < 13; i++) {
    middle.push({
      x: 42 + i * 62,
      y: 766 + (i % 4) * 74,
      scale: 1.42 + hash(i, seed + 11) * .62,
      variant: Math.floor(hash(i, seed + 12) * 4),
      phase: hash(i, seed + 13) * Math.PI * 2,
      speed: 84 + hash(i, seed + 14) * 76,
      delay: hash(i, seed + 15) * .25,
      lean: -.06 - hash(i, seed + 16) * .16,
    });
  }
  for (let i = 0; i < 5; i++) {
    near.push({
      x: 58 + i * 138,
      y: 1060 + (i % 2) * 38,
      scale: 2.25 + hash(i, seed + 21) * .5,
      variant: Math.floor(hash(i, seed + 22) * 4),
      phase: hash(i, seed + 23) * Math.PI * 2,
      speed: 112 + hash(i, seed + 24) * 62,
      delay: hash(i, seed + 25) * .1,
      lean: -.13,
    });
  }
  return { far, middle, near };
}

function drawTicketWindows(frame: Frame, props: ShotProps, t: number, rushAt: number, lastAt: number) {
  const { ctx, theme } = frame;
  const count = Math.round(clamp(numberParam(props.params?.windowsCount ?? props.params?.windows, 5), 4, 7));
  const supply = Math.round(clamp(numberParam(props.params?.supplyLeft, 1), 1, Math.min(3, count)));
  const width = 96, gap = 28, total = count * width + (count - 1) * gap;
  const left = snap(540 - total / 2), y = 258, h = 162;
  const firstOpen = count - supply;
  const lastCenter = left + (count - 1) * (width + gap) + width / 2;

  ctx.fillStyle = '#0D0E11';
  ctx.fillRect(132, 116, 816, 111);
  ctx.fillStyle = '#B8BBC1';
  ctx.fillRect(132, 116, 816, 7);
  ctx.fillRect(132, 220, 816, 7);
  ctx.fillStyle = '#24262B';
  ctx.fillRect(154, 138, 772, 66);
  pixelText(ctx, 'TICKETS', 540, 154, 5, { color: theme.fg, align: 'center' });

  for (let i = 0; i < count; i++) {
    const x = left + i * (width + gap), active = i >= firstOpen, isLast = i === count - 1;
    const closesAt = active ? (isLast ? lastAt : rushAt + .12 + (i - firstOpen) * .035) : -1;
    const shutterStart = isLast ? closesAt - .06 : closesAt;
    const close = closesAt < 0 ? 1 : ease.outCubic(clamp((t - shutterStart) / (isLast ? .12 : .18)));
    ctx.fillStyle = '#090A0D';
    ctx.fillRect(x - 9, y - 9, width + 18, h + 22);
    ctx.fillStyle = '#7D8188';
    ctx.fillRect(x - 9, y - 9, width + 18, 8);
    ctx.fillRect(x - 9, y + h + 7, width + 18, 8);
    ctx.fillStyle = '#282A30';
    ctx.fillRect(x, y, width, h);
    ctx.fillStyle = '#565A62';
    ctx.fillRect(x + 8, y + 12, width - 16, 7);
    ctx.fillStyle = '#363940';
    ctx.fillRect(x + 8, y + 30, width - 16, 5);
    ctx.fillStyle = '#14161A';
    ctx.fillRect(x + 8, y + 43, width - 16, 94);

    if (active && (isLast ? t < lastAt - .08 : t < closesAt)) {
      ctx.fillStyle = '#C1C4C9';
      ctx.fillRect(x + 5, y + h - 12, width - 10, 9);
      drawTicket2D(ctx, x + width / 2, y + 99, 68, { rot: (i % 2 ? -.045 : .045) });
    } else {
      ctx.fillStyle = '#44474E';
      ctx.fillRect(x + 18, y + 71, width - 36, 8);
      ctx.fillRect(x + 18, y + 87, width - 36, 6);
    }

    if (closesAt >= 0) {
      ctx.save();
      ctx.beginPath(); ctx.rect(x + 4, y, width - 8, h); ctx.clip();
      const shutterY = y - h + Math.round((h + 4) * close);
      ctx.fillStyle = close > .5 ? '#777B82' : '#B8BBC1';
      ctx.fillRect(x + 4, shutterY, width - 8, h);
      ctx.fillStyle = '#E1E3E6';
      ctx.fillRect(x + 4, shutterY, width - 8, 8);
      ctx.fillStyle = '#5D6067';
      ctx.fillRect(x + 4, shutterY + 12, width - 8, 8);
      ctx.restore();
    } else {
      ctx.fillStyle = '#45484F';
      ctx.fillRect(x + 4, y + 16, width - 8, h - 32);
    }
    ctx.fillStyle = '#C2C5CA';
    ctx.fillRect(x - 8, y + h + 14, width + 16, 7);
  }
  return { lastCenter, ticketY: y + 99 };
}

function drawHand(ctx: Frame['ctx'], x: number, y: number, scale: number, angle: number, alpha = 1) {
  ctx.save();
  ctx.translate(snap(x), snap(y));
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  ctx.globalAlpha *= alpha;
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

function drawLastTicketDeparture(ctx: Frame['ctx'], time: number, lastAt: number, centerX: number, ticketY: number) {
  const flightAt = lastAt - .08;
  const age = time - flightAt;
  if (age < 0 || age > .72) return;
  const p = ease.outCubic(clamp(age / .64));
  const x = centerX + 260 * p;
  const y = ticketY + 600 * p - Math.sin(p * Math.PI) * 62;
  const alpha = 1 - ease.outCubic(clamp((age - .49) / .23));
  ctx.save();
  // As the ticket clears the final window, its perforation becomes the first red price trace.
  ctx.strokeStyle = '#68201D';
  ctx.lineWidth = 16;
  ctx.beginPath(); ctx.moveTo(snap(centerX), snap(ticketY)); ctx.lineTo(snap(x), snap(y)); ctx.stroke();
  ctx.strokeStyle = '#B73532';
  ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(snap(centerX), snap(ticketY)); ctx.lineTo(snap(x), snap(y)); ctx.stroke();
  ctx.globalAlpha *= alpha;
  drawTicket2D(ctx, snap(x), snap(y), 68 - p * 12, { rot: .08 + p * .34 });
  // Perforated edge flecks trail the ticket toward the next shot.
  ctx.fillStyle = '#D9DCE0';
  for (let i = 0; i < 4; i++) {
    const trail = p * 180 + i * 19;
    ctx.fillRect(snap(x - trail), snap(y - 12 - i * 7), 8, 8);
  }
  ctx.restore();
}

function drawSurgeHands(ctx: Frame['ctx'], t: number, rushAt: number, dur: number, transitionTime: number) {
  const opening = ease.outCubic(clamp((transitionTime + .15) / .36));
  // A palm sweeps in from the announcement side and carries the 6→7 whip across the lens.
  if (transitionTime < .23) drawHand(ctx, -220 + opening * 720, 880 - opening * 60, 1.8, -.3 + opening * .12, .98);
  const rush = ease.outCubic(clamp((t - rushAt + .06) / .38));
  if (rush > 0 && t < dur - .12) drawHand(ctx, -230 + rush * 380, 930 - rush * 84, 1.92, -.48 + rush * .1, .96);
}

export const crowdRushShot: ShotDef = {
  name: 'crowdrush',
  describe: 'Fans surge toward the final ticket window from three balcony depths; the last ticket flies out as its shutter slams. Params: crowdSize, windowsCount, supplyLeft.',
  render(frame: Frame, props: ShotProps) {
    const { ctx, theme, seed } = frame;
    const dur = Math.max(.1, frame.dur), t = clamp(frame.t, 0, dur);
    const rushAt = eventAt(props, 'rush', dur, .26);
    const lastAt = eventAt(props, 'last', dur, .48);
    const rig = createCameraRig({
      width: 1080, height: 1290, seed: seed + 41, handheld: 2.1,
      hits: [rushAt, lastAt], punch: .014, shake: 7,
      keyframes: [
        { t: 0, x: -8, y: 10, zoom: 1.01, rot: 0 },
        { t: rushAt, x: 10, y: -10, zoom: 1.035, rot: -.002, ease: 'inOut' },
        { t: lastAt, x: 20, y: 12, zoom: 1.055, rot: .002, ease: 'inOut' },
        { t: dur, x: -6, y: 8, zoom: 1.075, rot: -.004, ease: 'out' },
      ],
    });
    const crowd = crowdLayers(seed);
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, 1080, 1290); ctx.clip();
    drawArena(ctx, t, seed);
    ctx.save();
    rig.apply(ctx, t);
    const surge = t - rushAt;
    for (const fan of crowd.far) drawFan(ctx, fan, t, surge);
    const windows = drawTicketWindows(frame, props, t, rushAt, lastAt);
    for (const fan of crowd.middle) drawFan(ctx, fan, t, surge);
    for (const fan of crowd.near) drawFan(ctx, fan, t, surge);

    // A short floor apron leaves a clean silhouette window around Hedgy's feet.
    ctx.fillStyle = '#24262B';
    ctx.fillRect(722, 1198, 267, 14);
    ctx.fillStyle = '#9DA1A8';
    ctx.fillRect(722, 1198, 267, 5);
    ctx.fillStyle = '#0B0C0F';
    ctx.fillRect(722, 1212, 267, 24);
    ctx.fillStyle = '#7C8087';
    ctx.fillRect(754, 1236, 203, 8);
    ctx.fillStyle = '#111317';
    ctx.beginPath(); ctx.ellipse(855, 1190, 102, 20, 0, 0, Math.PI * 2); ctx.fill();

    const squeezed = t >= rushAt + .08;
    const shocked = t >= lastAt - .08;
    drawHedgy(ctx, {
      x: 850, y: 1195, scale: 2.9,
      t: Math.max(0, t - (shocked ? lastAt - .1 : squeezed ? rushAt : 0)),
      pose: shocked ? 'shock' : squeezed ? 'sweat' : 'think',
      facing: -1, look: 'up',
      expression: shocked ? 'shocked' : squeezed ? 'worried' : 'neutral',
      squash: squeezed ? .82 : 1,
      prop: 'none',
    });
    drawLastTicketDeparture(ctx, t, lastAt, windows.lastCenter, windows.ticketY);
    ctx.restore();

    // These lens-close hands sit in front of the fans but stop short of Hedgy's clear stage.
    drawSurgeHands(ctx, t, rushAt, dur, frame.t);

    // Final 7→8 match: the last ticket is carried out through the right edge.
    const exitProgress = ease.outCubic(clamp((t - lastAt - .3) / .48));
    if (t > lastAt + .3) {
      ctx.fillStyle = '#E5E7EA';
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(snap(890 + exitProgress * 148 + i * 18), snap(520 + i * 28 - exitProgress * 56), 8, 8);
      }
    }
    ctx.restore();
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const d = Math.max(.1, dur), rushAt = eventAt(props, 'rush', d, .26), lastAt = eventAt(props, 'last', d, .48);
    const cues: Cue[] = [
      { t: rushAt, kind: 'step', pan: -.38, gain: .72 },
      { t: Math.min(d, rushAt + .15), kind: 'step', pan: .12, gain: .8 },
      { t: lastAt, kind: 'snap', pan: .62, gain: .92 },
    ];
    return cues.filter(cue => cue.t >= 0 && cue.t <= d);
  },
};
