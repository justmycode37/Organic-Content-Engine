// Round-3 revisions: no empty or frozen spans, correct over-the-horizon
// geometry, auroral sheets in true 3D, and a quicker recap.
import { c, W, H, lensGlow, line, grad } from './stage.ts';
import { tau, ease, mix, clamp, ink, muted, lilac, coral, accent, text, space, cover, at, hud } from './aurora-core.ts';
import { path, dot, spark, wave, X, lineRow, barcodes, gradedPlanet } from './aurora-scenes.ts';
import { softRainbow, oxygen } from './aurora-beats3.ts';
import { photos } from './aurora.ts';

type XY = [number, number];
const cue = (phrase: string, after = 0) => {
  const v = at(phrase, after);
  return Number.isFinite(v) ? v : -20;
};
const electron = '#e8e4ff';
const hash = (n: number) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};
function note(s: string) {
  if (!s.includes('Knutsen')) return;
  hud(() => text(s, W - 48, H - 30, 16, muted + 'bb', 'right'));
}

// ── 01 The single line keeps receiving photons ───────────────────────────
function oneLine(t: number, g: number) {
  space(g);
  const x0 = 140,
    x1 = 1140,
    y = 330,
    hgt = 110;
  const band = c.createLinearGradient(x0, 0, x1, 0);
  ['#2a1d5a', '#2a3a86', '#256a7a', '#4b7a3a', '#7a6a2e', '#7a3a30'].forEach((col, i, a) => band.addColorStop(i / (a.length - 1), col + '55'));
  c.fillStyle = band;
  c.fillRect(x0, y, x1 - x0, hgt);
  const lx = x0 + ((557.7 - 400) / 300) * (x1 - x0);
  const on = ease(t, 0.4, 1.6);
  // Photons stream down into the one place they all land.
  for (let k = 0; k < 26; k++) {
    const f = (t * 0.7 + hash(k)) % 1;
    const sx = lx + (hash(k + 3) - 0.5) * 900 * (1 - f);
    spark(sx, mix(-20, y + hgt / 2, f), 2.2, accent, on * Math.sin(Math.PI * f));
  }
  lensGlow(lx, y + hgt / 2, (140 + 30 * Math.sin(t * 2.2)) * on, accent, 0.8 * on);
  c.fillStyle = accent;
  c.globalAlpha = on;
  c.fillRect(lx - 3, y - 20 * on, 6, hgt + 40 * on);
  c.globalAlpha = ease(t, 1.4, 2.2);
  text('557.7 nm', lx, y + hgt + 80, 46, accent, 'center');
  c.globalAlpha = 1;
  for (const [w, s] of [
    [400, '400'],
    [500, '500'],
    [600, '600'],
    [700, '700 nm'],
  ] as const)
    text(s, x0 + ((w - 400) / 300) * (x1 - x0), y - 22, 18, muted, 'center');
}

// ── 02 A beam through a prism opens into the rainbow row ─────────────────
function rainbow(t: number, g: number) {
  space(g);
  const hot = cue('hot solid'),
    gas = cue('thin glowing'),
    bar = cue('pattern of lines');
  // Before "hot solid": white light, a prism, a fan of colour.
  const fan = 1 - ease(t, hot - 0.6, hot + 0.4);
  if (fan > 0) {
    c.globalAlpha = fan;
    const px = 420,
      py = 330;
    line([[0, py], [px - 30, py]], grad(0, 0, px, 0, ['#fff1e600', '#fff1e6']), 5);
    for (let k = 0; k < 6; k++) {
      const f = (t * 0.6 + k / 6) % 1;
      spark(mix(0, px - 30, f), py, 3, '#fff1e6', Math.sin(Math.PI * f));
    }
    c.fillStyle = grad(px - 70, py - 90, 140, 170, ['#e8def755', '#8f86c044']);
    c.beginPath();
    c.moveTo(px - 70, py + 80);
    c.lineTo(px, py - 90);
    c.lineTo(px + 70, py + 80);
    c.closePath();
    c.fill();
    c.strokeStyle = '#d8cdf0aa';
    c.stroke();
    const open = ease(t, 0.2, 2.2);
    const cols = ['#e0484a', '#f09a4a', '#e8d35a', '#7fd65b', '#2fb6c9', '#3f6be0', '#5b3fd0'];
    cols.forEach((col, i) => {
      const a = (0.06 + (i / 6) * 0.2) * open;
      line([[px + 30, py + 20], [px + 30 + 800 * Math.cos(a), py + 20 + 800 * Math.sin(a)]], col + 'aa', 7);
    });
    c.globalAlpha = 1;
  }
  softRainbow(200, ease(t, hot - 0.3, hot + 0.5));
  const lamp = ease(t, hot - 0.3, hot + 0.5);
  if (lamp > 0) {
    lensGlow(1180, 222, 60 + 8 * Math.sin(t * 6), '#ffb27a', 0.9 * lamp);
    c.globalAlpha = lamp;
    line(path((u) => [1165 + 30 * u, 222 + 8 * Math.sin(u * 24)], 80), '#fff0c8', 3);
    c.globalAlpha = 1;
  }
  c.globalAlpha = ease(t, hot - 0.3, hot + 0.5);
  text('Hot solid', 200, 230, 24, muted, 'right');
  c.globalAlpha = 1;
  barcodes.forEach(([name, nms], i) => {
    const a = ease(t, (i ? bar : gas) + i * 0.5, (i ? bar : gas) + i * 0.5 + 0.7);
    lineRow(300 + i * 70, nms, a);
    c.globalAlpha = a;
    text(name, 200, 330 + i * 70, 24, muted, 'right');
    c.globalAlpha = 1;
  });
  note('Laboratory line positions · simplified');
}

// ── 04 Solar wind as streaks that keep flowing ───────────────────────────
function sunWind(t: number, g: number) {
  space(g);
  gradedPlanet('sun', 140, 360, 260, t, [0, 0, 1], 0);
  lensGlow(140, 360, 560 + 30 * Math.sin(t * 1.4), coral, 0.5);
  for (let i = 0; i < 240; i++) {
    const ang = (hash(i) - 0.5) * 1.2,
      speed = 0.22 + 0.18 * hash(i + 3);
    const u = (hash(i + 7) + t * speed) % 1;
    const rr = 270 + u * 1050,
      tail = 30 + 50 * speed;
    const x = 140 + rr * Math.cos(ang),
      y = 360 + rr * Math.sin(ang);
    c.globalAlpha = 0.65 * Math.sin(Math.PI * u);
    line([[x - tail * Math.cos(ang), y - tail * Math.sin(ang)], [x, y]], i % 5 ? '#f6c3b6' : lilac, 1.6);
  }
  c.globalAlpha = 1;
  gradedPlanet('earth', 1110, 360, 34, t, [-1, 0, 0.3]);
}

// ── 14 Over the horizon, with the tangent drawn ──────────────────────────
function horizon(t: number, g: number) {
  space(g, 1);
  const R = 1400,
    cx = 640,
    cy = H + R - 200;
  const a0 = 0.2,
    hg0 = 70,
    hg1 = 140,
    hr = 420;
  const atp = (a: number, h: number): XY => [cx + (R + h) * Math.sin(a), cy - (R + h) * Math.cos(a)];
  c.fillStyle = grad(0, 500, 0, 220, ['#2a2456', '#120e24']);
  c.beginPath();
  c.arc(cx, cy, R, 0, tau);
  c.fill();
  line(path((u) => atp(mix(-0.6, 0.6, u), 0), 200), '#8f86c0', 2);
  // The auroral column, green below and red above, rooted beyond the curve.
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 90; k++) {
    const a = a0 + (k - 45) * 0.0009 + 0.002 * Math.sin(t * 0.7 + k * 0.3);
    const fade = Math.sin((Math.PI * k) / 89);
    c.globalAlpha = (0.05 + 0.04 * Math.sin(k * 0.7 + t * 2)) * fade;
    line([atp(a, hg0), atp(a, hg1)], accent, 9);
    c.globalAlpha *= 0.8;
    line([atp(a, hg1), atp(a, hr)], coral, 9);
  }
  c.restore();
  // Solve for an observer far enough away that the green layer is below the
  // horizon while the taller red layer is still above it.
  const blocked = (oa: number, h: number) => {
    const o = atp(oa, 3),
      tp = atp(a0, h);
    for (let s = 0.01; s <= 1; s += 0.004) if (Math.hypot(mix(o[0], tp[0], s) - cx, mix(o[1], tp[1], s) - cy) < R - 1) return true;
    return false;
  };
  let target = -0.3;
  for (let oa = 0.05; oa > -0.7; oa -= 0.005)
    if (blocked(oa, hg1) && !blocked(oa, hr)) {
      target = oa - 0.03;
      break;
    }
  const move = ease(t, cue('a viewer far') + 0.3, cue('the tall red') + 1);
  const obA = mix(0.08, target, move);
  const ob = atp(obA, 3);
  // The observer's horizon: a tangent to the Earth.
  const tx = Math.cos(obA),
    ty = Math.sin(obA);
  c.setLineDash([8, 8]);
  line([[ob[0] - 600 * tx, ob[1] - 600 * ty], [ob[0] + 1400 * tx, ob[1] + 1400 * ty]], '#ffffff44', 1.5);
  c.setLineDash([]);
  dot(ob[0], ob[1] - 4, 7, ink);
  for (const [h, col] of [
    [hg1, accent],
    [hr, coral],
  ] as const) {
    const tp = atp(a0, h);
    let hit = 1;
    for (let s = 0.01; s <= 1; s += 0.004) {
      if (Math.hypot(mix(ob[0], tp[0], s) - cx, mix(ob[1], tp[1], s) - cy) < R - 1) {
        hit = s;
        break;
      }
    }
    const end: XY = [mix(ob[0], tp[0], hit), mix(ob[1], tp[1], hit)];
    line([ob, end], col, 2.6);
    if (hit < 1) {
      line([end, tp], col + '30', 1.5);
      spark(end[0], end[1], 4, ink, 0.9);
    }
  }
  const hiddenNow = move > 0.7;
  c.globalAlpha = ease(t, cue('the tall red'), cue('the tall red') + 0.8);
  text('red: still above the horizon', 72, 90, 24, coral);
  c.globalAlpha = ease(t, cue('still hidden'), cue('still hidden') + 0.8) * (hiddenNow ? 1 : 0);
  text('green: blocked by the Earth', 72, 130, 24, accent);
  c.globalAlpha = 1;
  note('Heights and curvature exaggerated');
}

// ── 09 Altitude column that keeps working ────────────────────────────────
function column(t: number, g: number) {
  c.fillStyle = grad(0, 0, 0, H, ['#07061a', '#120f2e', '#2a1f4a', '#4a2a4e']);
  c.fillRect(0, 0, W, H);
  const Y = (km: number) => 660 - km * 2.0;
  const greenOn = ease(t, Math.min(0.2, cue('explains where') - 0.2), Math.min(1.2, cue('explains where') + 0.8));
  const quenchOn = ease(t, cue('below about'), cue('below about') + 0.8);
  const redOn = ease(t, cue('higher up'), cue('higher up') + 2.5);
  const fringeAt = at('purple or pink');
  const fringe = Number.isFinite(fringeAt) ? ease(t, fringeAt, fringeAt + 0.8) : 0;
  const profile = (peak: number, below: number, above: number, col: string, a: number) => {
    if (a <= 0) return;
    c.save();
    c.filter = 'blur(3px)';
    for (let km = 60; km <= 320; km += 2) {
      const d = km - peak,
        v = Math.exp(-((d / (d < 0 ? below : above)) ** 2));
      if (v < 0.02) continue;
      c.globalAlpha = a * v * (0.5 + 0.1 * Math.sin(t * 1.7 + km * 0.05));
      c.fillStyle = grad(380, 0, 520, 0, [col + '00', col, col + '00']);
      c.fillRect(380, Y(km) - 2.6, 520, 5.2);
    }
    c.restore();
  };
  profile(106, 5, 34, accent, greenOn);
  if (greenOn > 0) {
    c.globalAlpha = greenOn * 0.8;
    line([[400, Y(100)], [880, Y(100)]], grad(400, 0, 480, 0, [accent + '00', accent, accent + '00']), 2);
    c.globalAlpha = 1;
  }
  profile(250, 55, 70, coral, redOn);
  profile(92, 6, 6, '#e08ad6', fringe);
  // Electrons rain down; each lights a flash at the height where it collides.
  for (let i = 0; i < 70; i++) {
    const life = 1.6 + hash(i) * 1.2,
      f = ((t + hash(i + 1) * 9) % life) / life;
    const x = 400 + hash(i + 2) * 480;
    const stop = hash(i + 4);
    const km = stop < 0.55 ? 100 + 30 * hash(i + 5) : stop < 0.85 ? 180 + 110 * hash(i + 6) : 70 + 28 * hash(i + 7);
    const fall = clamp(f / 0.6),
      y = mix(Y(330), Y(km), fall);
    if (f < 0.6) spark(x, y, 1.6, electron, 0.6);
    else {
      const k = (f - 0.6) / 0.4;
      const col = km >= 180 ? coral : km >= 100 ? accent : '#8b83b8';
      const show = km >= 180 ? redOn : km >= 100 ? greenOn : quenchOn;
      // Red waits longest, so its flashes start late and fade slowly.
      const glow = km >= 180 ? Math.sin(Math.PI * clamp(k * 0.8)) * 0.6 : km >= 100 ? 1 - k : 0.4 * (1 - k);
      spark(x, Y(km), km < 100 ? 2 : 3, col, show * glow);
    }
  }
  for (const km of [0, 100, 200, 300]) {
    line([[340, Y(km)], [360, Y(km)]], muted, 1.5);
    text(km + ' km', 330, Y(km) + 7, 20, muted, 'right');
  }
  line([[360, Y(0)], [360, Y(310)]], muted + '88', 1.5);
  c.globalAlpha = greenOn;
  dot(836, Y(108), 6, accent);
  text('green · ~0.75 s', 850, Y(108) + 8, 24, ink);
  c.globalAlpha = redOn;
  dot(836, Y(250), 6, coral);
  text('red · ~2 min', 850, Y(250) + 8, 24, ink);
  c.globalAlpha = quenchOn;
  text('collisions win', 850, Y(72) + 8, 24, muted);
  c.globalAlpha = fringe;
  dot(836, Y(92), 6, '#e08ad6');
  text('nitrogen fringe', 850, Y(96) + 8, 22, ink);
  c.globalAlpha = 1;
  note('Approximate altitudes · profiles vary');
}

// ── 11 A thin folded sheet in 3D; the view turns from across to along ────
export function sheet3d(
  t: number,
  angle: number,
  cx: number,
  cy: number,
  scale: number,
  gain: number,
  stops: [number, string][] = [
    [0, coral + '00'],
    [0.3, coral + '33'],
    [0.65, accent + '66'],
    [0.95, accent + 'aa'],
    [1, accent + '00'],
  ],
  length = 900,
  edge = accent,
) {
  c.save();
  c.globalCompositeOperation = 'lighter';
  const ca = Math.cos(angle),
    sa = Math.sin(angle);
  const n = 420;
  for (let i = 0; i < n; i++) {
    const s = i / (n - 1);
    // The sheet: long in x, folded in z, tall in y; a ripple travels along it.
    const x0 = (s - 0.5) * length,
      z0 = 90 * Math.sin(s * Math.PI * 2.2 + t * 0.35) + 30 * Math.sin(s * 9 - t * 0.6);
    const x = x0 * ca - z0 * sa,
      z = x0 * sa + z0 * ca;
    const p = 900 / (900 + z + 400);
    const ripple = 16 * Math.sin(s * 13 - t * 1.7) + 7 * Math.sin(s * 31 + t * 2.3);
    // Ray striations: bright vertical structure that drifts along the sheet.
    const ray = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(s * 150 + t * 2.2 + 3 * Math.sin(s * 17 - t * 0.4))) ** 3;
    const sx = cx + x * p * scale,
      base = cy + (120 + ripple) * p * scale,
      top = cy - 260 * p * scale * (0.75 + 0.25 * ray) + ripple * p * scale;
    const gg = c.createLinearGradient(0, top, 0, base);
    stops.forEach(([o, col]) => gg.addColorStop(o, col));
    const a = gain * Math.sin(Math.PI * s);
    c.globalAlpha = 0.11 * a * (0.5 + ray);
    c.strokeStyle = gg;
    c.lineWidth = 4 * p * scale;
    c.beginPath();
    c.moveTo(sx, top);
    c.lineTo(sx, base);
    c.stroke();
    // A sharp, bright lower edge.
    c.globalAlpha = 0.07 * a * (0.6 + 0.4 * ray);
    c.strokeStyle = edge;
    c.beginPath();
    c.moveTo(sx, base - 14 * p * scale);
    c.lineTo(sx, base);
    c.stroke();
  }
  c.restore();
}
function sheets(t: number, g: number) {
  space(g);
  const along = ease(t, cue('look along') - 0.4, cue('look along') + 1.4);
  const across = ease(t, cue('look across') - 0.4, cue('look across') + 1.4);
  const angle = mix(0.15, Math.PI / 2 - 0.08, along * (1 - across)) + 0.05 * Math.sin(t * 0.3);
  sheet3d(t, angle, 640, 380, 1.35, 1.3);
  const eye: XY = [640, 690];
  dot(eye[0], eye[1], 6, ink);
  line([eye, [640, 120]], '#ffffff33', 1.5);
  const isAlong = along * (1 - across) > 0.5;
  c.globalAlpha = ease(t, cue('look along') - 0.2, cue('look along') + 0.6);
  text(isAlong ? 'looking along the sheet: a long path through glowing gas' : 'looking across: only its thickness', 640, 70, 24, isAlong ? ink : muted, 'center');
  c.globalAlpha = 1;
  note('Sheet thickness exaggerated');
}

// ── 13 Recap: electrons rain in, one atom waits, then the curtain ────────
function recap(t: number, g: number) {
  space(g);
  const excite = ease(t, cue('a collision can') - 0.2, cue('a collision can') + 0.6);
  const emit = ease(t, cue('then gives up') - 0.2, cue('then gives up') + 0.6);
  const out = ease(t, cue('theres enough'), cue('theres enough') + 0.9);
  c.globalAlpha = 1 - out;
  // Field lines with electrons streaming down them from the first second.
  for (let k = 0; k < 5; k++) line([[160 + k * 80, -20], [420 + k * 30, 420]], lilac + '44', 1.5);
  for (let i = 0; i < 24; i++) {
    const f = (t * 0.55 + hash(i)) % 1,
      k = i % 5;
    spark(mix(160 + k * 80, 420 + k * 30, f), mix(-20, 420, f), 2.6, electron, 0.8 * Math.sin(Math.PI * f));
  }
  oxygen(520, 380, 70, mix(0, 2, excite) - emit, 1);
  c.globalAlpha = 1 - out;
  const top = 200,
    bottom = 520,
    ys = [bottom, mix(bottom, top, 0.47), top];
  ys.forEach((y, i) => {
    line([[820, y], [1040, y]], '#d8cdf0', 3);
    text(['ground', '¹D', '¹S'][i], 1056, y + 8, 22, muted);
  });
  const lvl = 2 * excite - emit;
  spark(930, lvl <= 1 ? mix(ys[0], ys[1], lvl) : mix(ys[1], ys[2], lvl - 1), 7, '#c9b6ff', 1);
  if (emit > 0) {
    line([[790, ys[2]], [790, ys[1]]], accent, 2);
    text('2.2 eV', 775, (ys[1] + ys[2]) / 2 + 10, 30, accent, 'right');
    wave(560, 440, mix(580, 1240, ease(t, cue('then gives up'), cue('then gives up') + 2)), 640, t, accent, 9, 30);
  }
  c.globalAlpha = 1;
  if (out > 0) {
    c.globalAlpha = out;
    cover(photos.layers, mix(1.6, 1.08, out), 0.5, 0.55);
    c.globalAlpha = 1;
  }
}

// ── Photos with a stronger camera move ───────────────────────────────────
function storm(t: number) {
  // From the treeline up into the red sky.
  cover(photos.storm, 1.05 + 0.02 * t, 0.55, mix(0.62, 0.32, ease(t, 0, 14)), -4 * t);
}

void X;
export const beats4: Record<string, (t: number, g: number) => void> = {
  oneLine,
  rainbow,
  sunWind,
  horizon,
  column,
  sheets,
  recap,
  storm: (t) => storm(t),
};
