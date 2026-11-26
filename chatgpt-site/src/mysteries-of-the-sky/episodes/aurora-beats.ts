// Revised beats, each step cued to the spoken phrase with at(). When a shot is
// reused where its phrase is not spoken, it shows its finished state.
import { c, W, H, lensGlow, line, grad } from './stage.ts';
import { tau, ease, mix, clamp, ink, muted, lilac, coral, blush, accent, text, space, cover, at, hud } from './aurora-core.ts';
import {
  path,
  dot,
  spark,
  wave,
  X,
  rainbowRow,
  lineRow,
  barcodes,
  curtain,
  gradedPlanet,
} from './aurora-scenes.ts';
import { photos } from './aurora.ts';
import { softRainbow } from './aurora-beats3.ts';

type XY = [number, number];
// Shot time of a phrase, or a time long past when the phrase is not in this shot.
const cue = (phrase: string, after = 0) => {
  const v = at(phrase, after);
  return Number.isFinite(v) ? v : -20;
};
const electron = '#e8e4ff'; // incoming electrons are neutral, never the accent
function note(s: string) {
  if (!s.includes('Knutsen')) return;
  hud(() => text(s, W - 48, H - 30, 16, muted + 'bb', 'right'));
}
function hash(n: number) {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
}

// ── 02 ───────────────────────────────────────────────────────────────────
function spectrometer(t: number, g: number) {
  space(g);
  const e = photos.engravingInv,
    h = 560,
    w = (e.width / e.height) * h,
    x = W / 2 - w / 2 + 140,
    y = H / 2 - h / 2 + 10;
  c.globalAlpha = ease(t, 0, 1.2);
  c.globalCompositeOperation = 'lighten';
  c.drawImage(e, x, y, w, h);
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 1;
  // Northern light enters the collimator tube.
  const tx = x + w * 0.08,
    ty = y + h * 0.12;
  line([[0, ty - 40], [tx, ty]], grad(0, 0, tx, 0, [accent + '00', accent + 'cc']), 4);
  for (let k = 0; k < 6; k++) {
    const f = (t * 0.5 + k / 6) % 1;
    spark(mix(0, tx, f), mix(ty - 40, ty, f), 2.5, accent, Math.sin(Math.PI * f));
  }
  c.globalAlpha = ease(t, cue('anders') - 0.2, cue('anders') + 0.6);
  text('Uppsala, 1867', 90, 620, 30, ink, 'left', 'title');
  c.globalAlpha = 1;
}
function rainbow(t: number, g: number) {
  space(g);
  const hot = cue('hot solid'),
    gas = cue('thin glowing'),
    bar = cue('pattern of lines');
  softRainbow(200, ease(t, hot - 0.3, hot + 0.5));
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
function mystery(t: number, g: number) {
  space(g);
  const checks = [cue('not hydrogen'), cue('not helium'), cue('not any gas')];
  barcodes.forEach(([name, nms], i) => {
    const on = ease(t, checks[i], checks[i] + 0.3);
    lineRow(170 + i * 70, nms, 0.5 + 0.4 * on);
    text(name, 200, 200 + i * 70, 24, on > 0.5 ? ink : muted, 'right');
    if (on > 0) {
      c.globalAlpha = on;
      c.strokeStyle = coral;
      c.setLineDash([5, 5]);
      c.strokeRect(X(557.7) - 14, 166 + i * 70, 28, 52);
      c.setLineDash([]);
      c.globalAlpha = 1;
    }
  });
  const a = ease(t, cue('brightest line') - 0.2, cue('brightest line') + 0.6);
  lineRow(430, [557.7], a, accent);
  c.globalAlpha = a;
  text('Aurora', 200, 460, 26, accent, 'right');
  line([[X(557.7), 150], [X(557.7), 480]], accent + '55', 1.5);
  c.globalAlpha = 1;
  note('Laboratory line positions · simplified');
}
// ── 03 McLennan and Shrum's tube, assembled on the words ─────────────────
function tube(t: number, g: number) {
  space(g);
  const x0 = 220,
    x1 = 1060,
    y = 260;
  const glass = Math.max(0.3, ease(t, cue('discharge tube') - 0.4, cue('discharge tube') + 0.4));
  const he = ease(t, cue('mostly with helium'), cue('mostly with helium') + 0.8);
  const ox = ease(t, cue('small amount'), cue('small amount') + 0.8);
  const amp = ease(t, cue('electric current'), cue('electric current') + 0.6);
  const green = ease(t, cue('green line appeared'), cue('green line appeared') + 0.7);
  c.globalAlpha = glass;
  c.fillStyle = grad(0, y - 60, 0, 120, ['#ffffff10', '#ffffff04', '#ffffff12']);
  c.beginPath();
  c.roundRect(x0, y - 50, x1 - x0, 100, 50);
  c.fill();
  c.strokeStyle = '#d9d2f066';
  c.lineWidth = 2;
  c.stroke();
  for (const x of [x0 + 30, x1 - 30]) {
    c.fillStyle = '#8f86b0';
    c.fillRect(x - 6, y - 28, 12, 56);
  }
  c.globalAlpha = 1;
  if (amp > 0) {
    const glow = c.createLinearGradient(x0, 0, x1, 0);
    glow.addColorStop(0, '#f4b2a800');
    glow.addColorStop(0.1, '#f4b2a8');
    glow.addColorStop(0.5, '#ffd7c4');
    glow.addColorStop(0.9, '#f4b2a8');
    glow.addColorStop(1, '#f4b2a800');
    c.globalAlpha = amp * (0.75 + 0.08 * Math.sin(t * 13));
    c.fillStyle = glow;
    c.fillRect(x0 + 40, y - 22, x1 - x0 - 80, 44);
    lensGlow((x0 + x1) / 2, y, 420, '#f4b2a8', 0.35);
    c.globalAlpha = 1;
  }
  for (let i = 0; i < 52; i++) {
    const isO = i % 7 === 0;
    const a = isO ? ox : he;
    if (a <= 0) continue;
    const u = (i * 0.618 + t * (0.02 + amp * (0.04 + (i % 5) * 0.01))) % 1,
      v = Math.sin(i * 3.1 + t * 2) * 26;
    c.globalAlpha = a;
    dot(x0 + 50 + u * (x1 - x0 - 100), y + v, isO ? 5 : 2.4, isO ? coral : '#fff1e6');
    c.globalAlpha = 1;
  }
  c.globalAlpha = glass;
  text('helium', x0 + 40, y + 90, 20, '#fff1e6', 'left');
  c.globalAlpha = ox;
  text('+ a little oxygen', x0 + 130, y + 90, 20, coral, 'left');
  c.globalAlpha = 1;
  lineRow(450, [447.1, 471.3, 492.2, 501.6, 587.6, 667.8], amp, '#f6c7b8');
  if (green > 0) {
    lensGlow(X(557.7), 472, 70 * green, accent, 0.9);
    c.fillStyle = accent;
    c.globalAlpha = green;
    c.fillRect(X(557.7) - 2.5, 440, 5, 64);
    text('557.7 nm', X(557.7), 560, 30, accent, 'center');
    c.globalAlpha = 1;
  }
  text('Toronto, 1925', 90, 640, 30, ink, 'left', 'title');
  note('Reconstruction · spectrum simplified');
}

// ── 14 Storm geometry: the observer moves until the green sightline is blocked
function horizon(t: number, g: number) {
  space(g, 1);
  const R = 2400,
    cx = 640,
    cy = H + R - 200;
  c.fillStyle = grad(0, 480, 0, 240, ['#2a2456', '#120e24']);
  c.beginPath();
  c.arc(cx, cy, R, 0, tau);
  c.fill();
  const atp = (a: number, h: number): XY => [cx + (R + h) * Math.sin(a), cy - (R + h) * Math.cos(a)];
  const a0 = 0.2,
    scaleH = 2.2; // heights exaggerated
  for (let k = 0; k < 50; k++) {
    const a = a0 + (k - 25) * 0.0012;
    c.globalAlpha = 0.18 + 0.12 * Math.sin(k + t * 2);
    line([atp(a, 100 * scaleH * 0.6), atp(a, 200 * scaleH * 0.6)], accent, 3);
    line([atp(a, 200 * scaleH * 0.6), atp(a, 330 * scaleH * 0.6)], coral, 3);
  }
  c.globalAlpha = 1;
  const move = ease(t, cue('a viewer far') + 0.5, cue('the tall red') + 0.5);
  const obA = mix(0.12, -0.14, move);
  const ob = atp(obA, 4);
  dot(ob[0], ob[1], 6, ink);
  const targets: [number, string][] = [
    [150 * scaleH * 0.6, accent],
    [300 * scaleH * 0.6, coral],
  ];
  for (const [h, col] of targets) {
    const tp = atp(a0, h);
    // Where does the straight sightline first meet the ground?
    let hitAt = 1;
    for (let s = 0.02; s <= 1; s += 0.005) {
      const px = mix(ob[0], tp[0], s),
        py = mix(ob[1], tp[1], s);
      if (Math.hypot(px - cx, py - cy) < R - 1) {
        hitAt = s;
        break;
      }
    }
    const end: XY = [mix(ob[0], tp[0], hitAt), mix(ob[1], tp[1], hitAt)];
    line([ob, end], col, 2.2);
    if (hitAt < 1) {
      line([end, tp], col + '33', 1.5);
      spark(end[0], end[1], 3, ink, 0.8);
    }
  }
  const blocked = move > 0.6;
  c.globalAlpha = ease(t, cue('the tall red'), cue('the tall red') + 0.8);
  text('red: still above the horizon', 60, 90, 24, coral);
  c.globalAlpha = ease(t, cue('still hidden'), cue('still hidden') + 0.8) * (blocked ? 1 : 0);
  text('green: blocked by the Earth', 60, 130, 24, accent);
  c.globalAlpha = 1;
  note('Heights exaggerated');
}

// ── 05 One electron, many collisions; one excitation ─────────────────────
function dive(t: number, g: number) {
  c.fillStyle = grad(0, 0, 0, H, ['#0b0a1d', '#1a1840', '#3b2a5a', '#6b3a5c']);
  c.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) {
    const y = H * ((i * 0.7548) % 1) ** 0.45,
      x = ((i * 0.6180339 + t * 0.004 * (i % 3)) % 1) * W;
    dot(x, y, 1.6 + (y / H) * 1.8, i % 4 ? '#b8a9e055' : coral + '66');
  }
  const band = ease(t, cue('green aurora often'), cue('green aurora often') + 1);
  if (band > 0) {
    const gg = c.createLinearGradient(0, 300, 0, 560);
    gg.addColorStop(0, accent + '00');
    gg.addColorStop(0.6, accent + '44');
    gg.addColorStop(1, accent + '00');
    c.globalAlpha = band;
    c.fillStyle = gg;
    c.fillRect(0, 300, W, 260);
    c.globalAlpha = 1;
    text('about 100 km', 1180, 520, 22, muted, 'right');
  }
  const f = 1 - Math.exp(-Math.max(0, t - 0.3) / 3);
  const yE = mix(-40, 600, f),
    xE = 640 + 26 * Math.sin(t * 9) * (1 - f);
  line(path((u) => [640 + 26 * Math.sin((t - (1 - u) * 0.6) * 9) * (1 - f), mix(-40, yE, u)], 80), electron + '55', 2);
  spark(xE, yE, 4, electron, 1);
  // Collisions at many heights along the way.
  for (let k = 0; k < 14; k++) {
    const hitT = 0.8 + k * 0.55,
      age = t - hitT;
    if (age < 0 || age > 1.2) continue;
    const fy = 1 - Math.exp(-(hitT - 0.3) / 3);
    spark(640 + (hash(k) - 0.5) * 60, mix(-40, 600, fy), 3, lilac, 1 - age / 1.2);
  }
}
function collision(t: number, g: number, rowan = false) {
  space(g);
  const cx = 600,
    cy = 380;
  const lift = rowan ? 1 : ease(t, cue('lift one') - 0.3, cue('lift one') + 0.5);
  const hitT = rowan ? -5 : cue('strikes an oxygen') - 0.2;
  lensGlow(cx, cy, 130, coral, 0.5);
  dot(cx, cy, 22, grad(cx - 20, cy - 20, 40, 40, [blush, coral]));
  for (const [r, a] of [
    [110, 0.6],
    [190, 0.35],
  ] as const) {
    c.strokeStyle = '#d9b6e6' + Math.round(a * 255).toString(16);
    c.lineWidth = 2;
    c.beginPath();
    c.arc(cx, cy, r, 0, tau);
    c.stroke();
  }
  for (let i = 0; i < 6; i++) {
    const a = t * 0.8 + (i * tau) / 6;
    const r = i === 0 ? mix(110, 190, lift) : 110;
    spark(cx + r * Math.cos(a), cy + r * Math.sin(a), i === 0 ? 5 : 3.5, i === 0 && lift > 0.5 ? '#c9b6ff' : blush, 1);
  }
  // The incoming electron arrives, transfers energy and scatters away.
  const inF = ease(t, hitT - 1.4, hitT),
    outF = ease(t, hitT, hitT + 1.6);
  if (t < hitT + 1.6) {
    const ex = t < hitT ? mix(-40, cx - 150, inF) : mix(cx - 150, cx - 600, outF),
      ey = t < hitT ? mix(80, cy - 60, inF) : mix(cy - 60, cy + 320, outF);
    spark(ex, ey, 4, electron, 1 - outF);
  }
  if (lift > 0) lensGlow(cx, cy, 240, '#9d8cf0', 0.22 * lift);
  // Energy-level inset: the same jump drawn as a step up the ladder.
  const lx = 960,
    top = 250,
    bot = 470;
  c.globalAlpha = ease(t, hitT - 0.5, hitT + 0.3);
  line([[lx, top], [lx + 200, top]], '#d8cdf0', 3);
  line([[lx, bot], [lx + 200, bot]], '#d8cdf0', 3);
  spark(lx + 100, mix(bot, top, lift), 6, '#c9b6ff', 1);
  text('excited', lx + 214, top + 8, 20, muted);
  text('ground', lx + 214, bot + 8, 20, muted);
  c.globalAlpha = 1;
  // Rowan: "The light comes later, from the atom."
  if (rowan) {
    const later = cue('light comes later');
    const e = ease(t, later, later + 2.2);
    if (e > 0) {
      spark(lx + 100, mix(top, bot, ease(t, later - 0.4, later + 0.2)), 6, accent, 1);
      wave(cx + 40, cy, mix(cx + 60, 1240, e), cy - 10, t, accent, 9, 30);
    }
  }
}

// ── 07 Waiting: an average delay, not a timer ────────────────────────────
function waiting(t: number, g: number) {
  space(g);
  const period = 3.2,
    k = Math.floor(t / period),
    s = t - k * period;
  const grid = (x0: number, slow: boolean) => {
    for (let i = 0; i < 36; i++) {
      const x = x0 + (i % 6) * 62,
        y = 190 + Math.floor(i / 6) * 58;
      dot(x, y, 5, '#8b83b8');
      // Every atom is excited by the same pulse; each emits after its own random delay.
      if (s < 0.25) spark(x, y, 5, '#c9b6ff', 1 - s / 0.25);
      const delay = slow ? -0.7 * Math.log(1 - 0.98 * hash(i * 7 + k * 131)) : 0.03 + 0.04 * hash(i);
      const since = s - delay;
      if (since > 0 && since < 0.35) spark(x, y, 6, slow ? accent : '#cfd4ff', 1 - since / 0.35);
      if (slow && since < 0 && s > 0.25) lensGlow(x, y, 16, '#9d8cf0', 0.35);
    }
  };
  grid(140, false);
  grid(780, true);
  text('most excited states', 295, 590, 24, muted, 'center');
  text('the green state', 935, 590, 24, ink, 'center');
  const avg = ease(t, cue('nearly a second'), cue('nearly a second') + 0.8);
  c.globalAlpha = avg;
  text('average ≈ 0.7 s · nearly a second', 935, 140, 26, accent, 'center');
  text('≈ 0.00000001 s', 295, 140, 26, muted, 'center');
  c.globalAlpha = 1;
}

// ── 09 One height profile; layers overlap ────────────────────────────────
function column(t: number, g: number) {
  c.fillStyle = grad(0, 0, 0, H, ['#07061a', '#120f2e', '#2a1f4a', '#4a2a4e']);
  c.fillRect(0, 0, W, H);
  const Y = (km: number) => 660 - km * 2.0;
  const greenOn = ease(t, cue('explains where') - 0.2, cue('explains where') + 0.8);
  const quenchOn = ease(t, cue('below about'), cue('below about') + 0.8);
  const redOn = ease(t, cue('higher up'), cue('higher up') + 1.2);
  const fringe = ease(t, cue('purple or pink'), cue('purple or pink') + 0.8);
  // Approximate emission profiles drawn as soft, overlapping glows.
  const profile = (peak: number, below: number, above: number, col: string, a: number) => {
    if (a <= 0) return;
    for (let km = 60; km <= 320; km += 2) {
      const d = km - peak,
        v = Math.exp(-((d / (d < 0 ? below : above)) ** 2));
      if (v < 0.02) continue;
      c.globalAlpha = a * v * (0.55 + 0.08 * Math.sin(t * 1.7 + km * 0.05));
      c.fillStyle = grad(380, 0, 520, 0, [col + '00', col, col + '00']);
      c.fillRect(380, Y(km) - 1.2, 520, 2.4);
    }
    c.globalAlpha = 1;
  };
  profile(120, 14, 45, accent, greenOn);
  profile(250, 55, 70, coral, redOn);
  profile(92, 6, 6, '#e08ad6', fringe);
  // Electrons rain down; below the green layer, collisions win.
  for (let i = 0; i < 46; i++) {
    const f = (t * 0.45 + i * 0.137) % 1;
    spark(400 + hash(i) * 480, mix(Y(320), Y(80), f), 1.8, electron, Math.sin(Math.PI * f) * 0.7);
  }
  if (quenchOn > 0) {
    for (let i = 0; i < 40; i++) {
      const x = 400 + ((hash(i + 9) * 480 + t * 40 * (hash(i) - 0.5)) % 480 + 480) % 480,
        y = Y(60 + hash(i + 3) * 35);
      c.globalAlpha = quenchOn * 0.8;
      dot(x, y, 3, '#8b83b8');
    }
    c.globalAlpha = 1;
  }
  for (const km of [0, 100, 200, 300]) {
    line([[340, Y(km)], [360, Y(km)]], muted, 1.5);
    text(km + ' km', 330, Y(km) + 7, 20, muted, 'right');
  }
  line([[360, Y(0)], [360, Y(310)]], muted + '88', 1.5);
  c.globalAlpha = greenOn;
  text('green · waits about 0.7 s', 920, Y(125) + 8, 24, accent);
  c.globalAlpha = redOn;
  text('red · about 2 min', 920, Y(250) + 8, 24, coral);
  c.globalAlpha = quenchOn;
  text('collisions win', 920, Y(72) + 8, 24, muted);
  c.globalAlpha = fringe;
  text('nitrogen fringe', 920, Y(96) + 8, 22, '#e08ad6');
  c.globalAlpha = 1;
  note('Approximate altitudes · profiles vary');
}

// ── 11 Looking along vs across a sheet, and why green blurs flicker ──────
function sheets(t: number, g: number) {
  space(g);
  const along = ease(t, cue('look along') - 0.3, cue('look along') + 1.2);
  const across = ease(t, cue('look across') - 0.3, cue('look across') + 1);
  const turn = along * (1 - across);
  const w = mix(900, 110, turn);
  curtain(t, 640 - w / 2, w, 540, 380, 'aurora', mix(0.6, 1.9, turn));
  // The observer and the sightline through the sheet.
  const eye: XY = [640, 690];
  dot(eye[0], eye[1], 7, ink);
  if (along > 0.05) {
    c.globalAlpha = Math.max(along - across, across);
    const len = mix(40, 300, turn);
    line([eye, [640, 160]], '#ffffff55', 1.5);
    line([[640, 540 - len], [640, 540]], ink, 4);
    text(turn > 0.5 ? 'long path through glowing gas' : 'short path', 700, 300, 22, turn > 0.5 ? accent : muted);
    c.globalAlpha = 1;
  }
}
function flicker(t: number, g: number) {
  space(g);
  const x0 = 140,
    x1 = 1140;
  const input = (s: number) => (Math.sin(s * 18) > 0.6 ? 1 : 0) * (0.6 + 0.4 * Math.sin(s * 3));
  const rows: [string, string, (s: number) => number, number][] = [
    ['incoming electrons', electron, input, 200],
    ['nitrogen · fast', '#a9b2ff', input, 380],
    ['oxygen green · waits', accent, (s) => {
      let v = 0;
      for (let k = 0; k < 60; k++) v += input(s - k * 0.03) * Math.exp(-(k * 0.03) / 0.7) * 0.03;
      return v / 0.7;
    }, 560],
  ];
  const span = 4;
  rows.forEach(([name, col, fn, y], i) => {
    const a = ease(t, i * 0.6, i * 0.6 + 0.8);
    c.globalAlpha = a;
    line(path((u) => [mix(x0, x1, u), y - 90 * fn(t - span + u * span)], 300), col, 2.4);
    line([[x0, y], [x1, y]], '#ffffff22', 1);
    text(name, x0, y - 110, 22, col);
    c.globalAlpha = 1;
  });
  note('Schematic response');
}

// ── 15 Same line whatever the curtain does ───────────────────────────────
function sameLine(t: number, g: number) {
  space(g);
  curtain(t * 1.6, 80, 520, 560, 300 + 120 * Math.sin(t * 0.9), 'aurora', 0.8 + 0.6 * Math.sin(t * 1.3) ** 2);
  const y = 330;
  c.fillStyle = '#120f26';
  c.fillRect(680, y, 520, 70);
  const lx = 680 + ((557.7 - 400) / 300) * 520;
  const b = 0.5 + 0.5 * Math.sin(t * 1.3) ** 2;
  lensGlow(lx, y + 35, 40 + 40 * b, accent, 0.4 + 0.5 * b);
  c.fillStyle = accent;
  c.fillRect(lx - 2.5, y - 10, 5, 90);
  text('557.7 nm', lx, y + 130, 30, accent, 'center');
}

// ── 17 Airglow in two steps ──────────────────────────────────────────────
function recombine(t: number, g: number) {
  const night = ease(t, cue('at night') - 0.3, cue('at night') + 1);
  space(g);
  c.fillStyle = '#3a2f6a';
  c.globalAlpha = 0.5 * (1 - night);
  c.fillRect(0, 0, W, H);
  c.globalAlpha = 1;
  const cx = 640,
    cy = 330;
  const split = ease(t, cue('splits oxygen') - 0.2, cue('splits oxygen') + 0.8);
  const meet = ease(t, cue('find each other') - 0.3, cue('find each other') + 1);
  const give = ease(t, cue('energy released') , cue('energy released') + 1.2);
  // Day: ultraviolet splits O₂.
  if (night < 1) {
    c.globalAlpha = 1 - night;
    lensGlow(80, 120, 260, '#fff1e6', 0.6);
    if (split < 1) wave(120, 160, mix(140, cx - 30, ease(t, cue('splits oxygen') - 1.2, cue('splits oxygen'))), cy - 20, t, '#b9a2ff', 7, 18);
    c.globalAlpha = 1;
  }
  const sep = night > 0 ? mix(260, 20, meet) : mix(20, 260, split);
  dot(cx - sep, cy, 18, coral);
  dot(cx + sep, cy, 18, coral);
  if (sep < 30) line([[cx - sep, cy], [cx + sep, cy]], '#ffffff66', 5);
  // Night: recombination hands energy to a third atom, which waits, then glows.
  const third: XY = [cx + 260, cy + 150];
  if (night > 0.5) {
    dot(third[0], third[1], 18, give > 0.5 ? '#b9a2ff' : coral);
    if (give > 0) line([[cx, cy], [mix(cx, third[0], give), mix(cy, third[1], give)]], '#ffffff55', 2);
    const glow = ease(t, cue('energy released') + 2, cue('energy released') + 3);
    if (glow > 0) {
      spark(third[0], third[1], 8, accent, 1);
      wave(third[0] + 20, third[1], mix(third[0] + 30, 1240, glow), third[1], t, accent, 8, 30);
    }
  }
  text(night > 0.5 ? 'night' : 'day', 80, 640, 30, ink, 'left', 'title');
}

// ── 18 Mars, as an observation ───────────────────────────────────────────
function mars(t: number, g: number) {
  space(g);
  const cx = 640,
    cy = 380,
    r = 230;
  gradedPlanet('mars', cx, cy, r, t, [-0.95, 0.1, 0.3], 0.2);
  // Sunlight (from the left) splits CO₂ high above the dayside.
  const day = ease(t, cue('sunlight splits') - 0.3, cue('sunlight splits') + 1);
  for (let i = 0; i < 14; i++) {
    const a = Math.PI * (0.65 + hash(i) * 0.7),
      rr = r + 30 + hash(i + 5) * 40;
    const x = cx + rr * Math.cos(a),
      y = cy + rr * Math.sin(a);
    const f = clamp((t - cue('sunlight splits') - hash(i) * 2) / 1.5);
    c.globalAlpha = day;
    dot(x - 8 * f, y, 5, '#9a94c8');
    dot(x + 10 + 18 * f, y - 6 * f, 4, coral);
    c.globalAlpha = 1;
  }
  // Solar particles reach the nightside (right).
  const storm = ease(t, cue('in march') - 0.3, cue('in march') + 1);
  for (let i = 0; i < 40; i++) {
    const f = (t * 0.5 + i * 0.137) % 1;
    spark(mix(W + 40, cx + r * 0.7, f), cy + (hash(i) - 0.5) * 420, 1.8, blush, storm * Math.sin(Math.PI * f));
  }
  if (storm > 0) {
    c.save();
    c.globalCompositeOperation = 'screen';
    c.globalAlpha = storm * 0.35;
    c.strokeStyle = accent;
    c.lineWidth = 26;
    c.filter = 'blur(14px)';
    c.beginPath();
    c.arc(cx, cy, r + 8, -0.45 * Math.PI, 0.45 * Math.PI);
    c.stroke();
    c.restore();
  }
  note('Illustration');
}
function jezero(t: number, g: number) {
  c.fillStyle = grad(0, 0, 0, H, ['#070616', '#0f1026', '#1b1a36']);
  c.fillRect(0, 0, W, H);
  for (let i = 0; i < 160; i++) dot(hash(i) * W, hash(i + 99) * 420, hash(i + 3) > 0.9 ? 1.6 : 0.9, '#d9d6ff' + (hash(i + 7) > 0.5 ? 'cc' : '66'));
  const glow = ease(t, 0.5, 4);
  const sky = c.createLinearGradient(0, 160, 0, 520);
  sky.addColorStop(0, accent + '00');
  sky.addColorStop(1, accent + '2a');
  for (let k = 0; k < 5; k++) {
    c.globalAlpha = glow * (0.25 + 0.2 * Math.sin(t * 0.9 + k * 1.7));
    c.fillStyle = sky;
    c.fillRect(0, 140 + 30 * Math.sin(t * 0.35 + k), W, 380);
  }
  c.globalAlpha = 1;
  // Crater rim and ground.
  c.fillStyle = '#120c18';
  c.beginPath();
  c.moveTo(0, 520);
  for (let x = 0; x <= W; x += 20) c.lineTo(x, 520 - 30 * Math.sin(x / 260 + 1) - 14 * Math.sin(x / 90));
  c.lineTo(W, H);
  c.lineTo(0, H);
  c.fill();
  // Rover silhouette.
  const rx = 820,
    ry = 560;
  c.fillStyle = '#05040b';
  c.fillRect(rx, ry - 40, 140, 34);
  c.fillRect(rx + 100, ry - 100, 10, 60);
  c.fillRect(rx + 88, ry - 112, 34, 18);
  for (const wx of [rx + 15, rx + 70, rx + 125]) dot(wx, ry, 14, '#05040b');
  text('Jezero crater · Perseverance', 80, 640, 30, ink, 'left', 'title');
  note('Illustration');
}
function marsSpectrum(t: number, g: number) {
  space(g);
  const x0 = 160,
    x1 = 1120,
    base = 520;
  const peak = ease(t, cue('5577') - 0.3, cue('5577') + 0.6);
  const draw = ease(t, 0, 1.8);
  const pts = path((u) => {
    const nm = 500 + u * 120;
    const v = 0.08 * Math.sin(u * 90 + t * 3) * hash(Math.floor(u * 300) + Math.floor(t * 4)) + peak * (0.9 + 0.1 * Math.sin(t * 2)) * Math.exp(-(((nm - 557.7) / 1.6) ** 2));
    return [mix(x0, x1, u), base - 260 * v - 18];
  }, 400).slice(0, Math.ceil(401 * draw));
  line(pts, '#cfc6ef', 2);
  line([[x0, base], [x1, base]], muted + '88', 1.4);
  for (const nm of [500, 540, 580, 620]) text(nm + ' nm', mix(x0, x1, (nm - 500) / 120), base + 34, 18, muted, 'center');
  text('light from the night sky', x0, base - 300, 20, muted);
  if (peak > 0) {
    const px = mix(x0, x1, (557.7 - 500) / 120);
    lensGlow(px, base - 270, 60, accent, 0.7 * peak);
    c.globalAlpha = peak;
    text('557.7 nm', px, base - 300, 32, accent, 'center');
    c.globalAlpha = 1;
  }
  note('Schematic spectrum · after Knutsen et al. 2025');
}

// ── 13 Recap: one collision becomes a curtain ────────────────────────────
function recap(t: number, g: number) {
  space(g);
  const excite = ease(t, cue('a collision can'), cue('a collision can') + 0.8);
  const emit = ease(t, cue('then gives up'), cue('then gives up') + 1.6);
  const many = ease(t, cue('theres enough'), cue('theres enough') + 3);
  const cx = 640,
    cy = mix(300, 160, many);
  // Field line and the descending electron.
  line([[cx - 200, -20], [cx, cy]], lilac + '66', 2);
  const fall = ease(t, 0, Math.max(1, cue('a collision can')));
  spark(mix(cx - 200, cx, fall), mix(-20, cy, fall), 4, electron, 1 - excite);
  dot(cx, cy, 20, excite > 0.5 ? '#b9a2ff' : coral);
  if (excite > 0 && emit < 0.05) lensGlow(cx, cy, 80, '#9d8cf0', 0.4 * excite);
  if (emit > 0) wave(cx + 24, cy, mix(cx + 40, 1220, emit), cy, t, accent, 8, 30);
  if (many > 0) curtain(t, 640 - 520 * many, 1040 * many, 600, 380, 'aurora', 1.4 * many);
}

export const beats2: Record<string, (t: number, g: number) => void> = {
  spectrometer,
  rainbow,
  mystery,
  tube,
  horizon,
  storm: (t) => cover(photos.storm, 1.05 + 0.01 * t, 0.5, 0.45, -3 * t),
  dive,
  collision: (t, g) => collision(t, g, false),
  collisionRowan: (t, g) => collision(t, g, true),
  waiting,
  column,
  sheets,
  flicker,
  sameLine,
  recombine,
  mars,
  jezero,
  marsSpectrum,
  recap,
};
