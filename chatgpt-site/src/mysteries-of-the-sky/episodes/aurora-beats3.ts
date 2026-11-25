// Round-2 revisions: one shaded-sphere atom with an energy-level ladder
// (ground, ¹D, ¹S), a dense upper atmosphere, a real bow shock and tail, and
// every reveal cued to the narration. All geometry remains schematic.
import { c, W, H, lensGlow, line, grad } from './stage.ts';
import { tau, ease, mix, clamp, ink, muted, lilac, coral, blush, accent, text, space, cover, at } from './aurora-core.ts';
import { path, dot, spark, wave, contours, gradedPlanet, dipole, X, lineRow } from './aurora-scenes.ts';
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
  text(s, W - 40, H - 34, 16, muted + 'aa', 'right');
}

// One atom design for the whole film: a lit sphere whose glow shows its state.
export function oxygen(x: number, y: number, r: number, state: 0 | 1 | 2 | number = 0, alpha = 1) {
  if (alpha <= 0) return;
  c.save();
  c.globalAlpha *= alpha;
  const excited = clamp(state);
  if (excited > 0) lensGlow(x, y, r * 3.2, state >= 1.5 ? accent : '#a99cf0', 0.45 * excited);
  lensGlow(x, y, r * 1.8, coral, 0.35);
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.08, x, y, r);
  g.addColorStop(0, '#fff3ea');
  g.addColorStop(0.35, excited > 0.5 ? '#d9b4ff' : '#f2a3a4');
  g.addColorStop(1, '#3a2342');
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, tau);
  c.fill();
  c.restore();
}
function nitrogen2(x: number, y: number, r: number, a: number, alpha = 1) {
  c.save();
  c.globalAlpha *= alpha;
  for (const s of [-1, 1]) {
    const px = x + s * r * 0.75 * Math.cos(a),
      py = y + s * r * 0.75 * Math.sin(a);
    const g = c.createRadialGradient(px - r * 0.3, py - r * 0.3, 1, px, py, r * 0.8);
    g.addColorStop(0, '#eef0ff');
    g.addColorStop(0.4, '#8f94d8');
    g.addColorStop(1, '#262a55');
    c.fillStyle = g;
    c.beginPath();
    c.arc(px, py, r * 0.8, 0, tau);
    c.fill();
  }
  c.restore();
}
function oxygen2(x: number, y: number, r: number, a: number, alpha = 1, split = 0) {
  for (const s of [-1, 1]) oxygen(x + s * r * (0.75 + 1.6 * split) * Math.cos(a), y + s * r * (0.75 + 1.6 * split) * Math.sin(a), r * 0.8, 0, alpha);
}
// Energy ladder of atomic oxygen: ground, ¹D (red, 630 nm) and ¹S (green, 557.7 nm).
function ladder3(x: number, top: number, bottom: number, level: number, a = 1, labels = true) {
  if (a <= 0) return;
  c.save();
  c.globalAlpha *= a;
  const ys = [bottom, mix(bottom, top, 0.47), top];
  const names = ['ground', '¹D', '¹S'];
  ys.forEach((y, i) => {
    line([[x, y], [x + 220, y]], grad(x, 0, 220, 0, ['#d8cdf055', '#d8cdf0', '#d8cdf055']), 3);
    if (labels) text(names[i], x + 236, y + 8, 22, muted);
  });
  const y = level <= 1 ? mix(ys[0], ys[1], level) : mix(ys[1], ys[2], level - 1);
  spark(x + 110, y, 7, level > 1.5 ? accent : '#c9b6ff', 1);
  c.restore();
  return ys;
}

// ── 01 Earth sits in the band with an atmosphere, then the camera dives in
export function earthBand(t: number) {
  c.fillStyle = '#0b0a1c';
  c.fillRect(0, 0, W, H);
  const m = photos.milky,
    s = (W * 1.5) / m.width;
  const dive = ease(t, Math.max(1, at('the color comes') - 1.8), at('the color comes') + 0.2);
  const z = 1 + 0.6 * dive;
  c.drawImage(m, W / 2 - m.width * s * z * (0.5 + 0.004 * t), H / 2 - (m.height * s * z) / 2, m.width * s * z, m.height * s * z);
  const r = mix(70, 150, ease(t, 0, 6)) * (1 + 4 * dive * dive);
  lensGlow(W / 2, H / 2, r * 1.5, '#7d86f0', 0.45);
  gradedPlanet('earth', W / 2, H / 2, r, t, [-0.6, 0.2, 0.75]);
  c.strokeStyle = '#a9b2ff88';
  c.lineWidth = Math.max(2, r * 0.025);
  c.beginPath();
  c.arc(W / 2, H / 2, r * 1.01, 0, tau);
  c.stroke();
}

// ── 04 The Sun's wind meets a compressed, tailed magnetosphere ───────────
function sunWind(t: number, g: number) {
  space(g);
  gradedPlanet('sun', 140, 360, 260, t, [0, 0, 1], 0);
  lensGlow(140, 360, 520, coral, 0.45);
  for (let i = 0; i < 220; i++) {
    const ang = (hash(i) - 0.5) * 1.1,
      speed = 0.1 + 0.1 * hash(i + 3);
    const u = (hash(i + 7) + t * speed) % 1;
    const rr = 270 + u * 1000;
    spark(140 + rr * Math.cos(ang), 360 + rr * Math.sin(ang), 1.4 + hash(i + 2), i % 5 ? '#f6c3b6' : lilac, 0.6 * Math.sin(Math.PI * u));
  }
  gradedPlanet('earth', 1110, 360, 34, t, [-1, 0, 0.3]);
}
function magnetosphere(t: number, g: number, release: number) {
  space(g);
  const cx = 420,
    cy = 360,
    r = 66;
  // Bow shock and magnetopause on the dayside.
  const bow = (k: number, col: string, wdt: number) =>
    line(
      path((u) => {
        const a = (u - 0.5) * 2.4;
        const d = k * (1 + 0.55 * a * a);
        return [cx - d * Math.cos(a * 0.62), cy + d * Math.sin(a * 0.62) * 1.9];
      }, 120),
      col,
      wdt,
    );
  bow(250, '#f6c3b655', 10);
  bow(250, '#f6c3b6aa', 2);
  bow(170, '#a99cf099', 2);
  // Solar wind parts around the bow shock.
  for (let i = 0; i < 150; i++) {
    const y0 = (hash(i) - 0.5) * 760,
      u = (hash(i + 5) + t * (0.15 + 0.05 * hash(i + 9))) % 1;
    const x = -40 + u * 1400;
    const near = Math.exp(-((y0 / 260) ** 2));
    const push = x > cx - 300 ? Math.sign(y0 || 1) * near * 150 * clamp((x - (cx - 300)) / 200) : 0;
    spark(x, cy + y0 + push, 1.5, '#f6c3b6', 0.5 * Math.sin(Math.PI * u));
  }
  // Closed dayside loops, a long stretched nightside tail.
  for (const L of [1.5, 2.1, 2.8, 3.8, 5]) {
    line(path((u) => dipole(u, L, cx, cy, r, -1, 0.75), 120), grad(cx - 300, 0, 300, 0, ['#f0878f66', '#a99cf0cc']), 2);
  }
  for (let k = 0; k < 8; k++) {
    const y = (k + 1) * 14 * (1 + release * 0.2),
      pinch = release * Math.exp(-(((k - 3) / 2) ** 2));
    for (const sgn of [-1, 1]) {
      line(
        path((u) => {
          const x = cx + 50 + u * 900;
          const dy = sgn * (y + 160 * Math.sqrt(u) * (1 - 0.5 * pinch * Math.exp(-(((u - 0.5) / 0.15) ** 2))));
          return [x, cy + dy * (u < 0.06 ? u / 0.06 : 1)];
        }, 120),
        grad(cx, 0, 900, 0, ['#a99cf0cc', '#8f9ce655']),
        1.8,
      );
    }
  }
  gradedPlanet('earth', cx, cy, r, t, [-1, 0, 0.35]);
  // Released energy sends electrons back toward the poles.
  if (release > 0) {
    for (let k = 0; k < 18; k++) {
      const f = (t * 0.5 + k * 0.071) % 1,
        sgn = k % 2 ? 1 : -1;
      const x = mix(cx + 600, cx + 10, f),
        y = cy + sgn * mix(120, r * 0.95, f * f);
      spark(x, y, 2.6, electron, release * Math.sin(Math.PI * f));
    }
  }
}

// ── 05 Into a crowded upper atmosphere ───────────────────────────────────
function dive(t: number, g: number) {
  c.fillStyle = grad(0, 0, 0, H, ['#0b0a1d', '#1a1840', '#33275a', '#5a3358']);
  c.fillRect(0, 0, W, H);
  const pop = ease(t, cue('nitrogen and oxygen') - 0.3, cue('nitrogen and oxygen') + 1);
  const uv = ease(t, cue('split apart') - 1.2, cue('split apart') + 0.4);
  const push = ease(t, cue('when the electron') - 2, cue('when the electron') + 0.5);
  c.save();
  const zoom = 1 + 0.5 * push;
  c.translate(640, 420);
  c.scale(zoom, zoom);
  c.translate(-640, -420);
  // Three depths of molecules and atoms with parallax drift.
  for (let i = 0; i < 90; i++) {
    const depth = 0.4 + 0.6 * hash(i + 11),
      kind = hash(i + 5);
    const x = ((hash(i) * 1500 + t * 10 * depth) % 1500) - 110,
      y = 120 + hash(i + 2) * 560;
    const r = 7 + 9 * depth,
      a = t * 0.3 + i;
    const alpha = mix(0.35, 1, pop) * depth;
    if (kind < 0.55) nitrogen2(x, y, r, a, alpha);
    else if (kind < 0.75) oxygen2(x, y, r, a, alpha, uv * (hash(i + 8) < 0.6 ? 1 : 0));
    else oxygen(x, y, r * 0.8, 0, alpha);
  }
  c.restore();
  if (uv > 0 && uv < 1) {
    for (let k = 0; k < 5; k++) wave(1300, 60 + k * 30, mix(1300, 300, uv), 200 + k * 60, t, '#b9a2ff', 6, 18);
  }
  c.globalAlpha = pop;
  text('nitrogen', 80, 90, 24, '#a9b2ff');
  text('oxygen', 220, 90, 24, coral);
  c.globalAlpha = 1;
  // The incoming electron and the secondary electrons it frees.
  const f = 1 - Math.exp(-Math.max(0, t - 0.3) / 3.2);
  const yE = mix(-40, 560, f),
    xE = 640 + 30 * Math.sin(t * 9) * (1 - f);
  line(path((u) => [640 + 30 * Math.sin((t - (1 - u) * 0.6) * 9) * (1 - f), mix(-40, yE, u)], 80), electron + '66', 2);
  spark(xE, yE, 5, electron, 1);
  for (let k = 0; k < 14; k++) {
    const hitT = 0.8 + k * 0.6,
      age = t - hitT;
    if (age < 0 || age > 1.4) continue;
    const fy = 1 - Math.exp(-(hitT - 0.3) / 3.2),
      hx = 640 + (hash(k) - 0.5) * 50,
      hy = mix(-40, 560, fy);
    spark(hx, hy, 4, lilac, 1 - age / 1.4);
    for (let j = 0; j < 3; j++) {
      const a = hash(k * 3 + j) * tau;
      spark(hx + Math.cos(a) * age * 70, hy + Math.sin(a) * age * 70, 2, electron, 0.8 * (1 - age / 1.4));
    }
  }
  const band = ease(t, cue('green aurora often'), cue('green aurora often') + 1);
  if (band > 0) {
    c.globalAlpha = band;
    text('about 100 km', 1200, 500, 22, muted, 'right');
    line([[980, 492], [1210, 492]], '#ffffff33', 1);
    c.globalAlpha = 1;
  }
}
// ── 05/21 Collision: excitation drawn on the ladder ──────────────────────
function collision(t: number, g: number, rowan: boolean) {
  space(g);
  const cx = 470,
    cy = 370;
  const hitT = rowan ? -5 : cue('strikes an oxygen') - 0.2;
  const lift = rowan ? 1 : ease(t, cue('lift one') - 0.3, cue('lift one') + 0.6);
  const later = rowan ? cue('light comes later') : 1e9;
  const drop = ease(t, later - 0.4, later + 0.3);
  const level = 2 * lift - drop;
  oxygen(cx, cy, 90, mix(0, 2, lift) - drop, 1);
  if (t < hitT + 1.8) {
    const inF = ease(t, hitT - 1.4, hitT),
      outF = ease(t, hitT, hitT + 1.8);
    const ex = t < hitT ? mix(-40, cx - 110, inF) : mix(cx - 110, cx - 520, outF),
      ey = t < hitT ? mix(60, cy - 70, inF) : mix(cy - 70, cy + 330, outF);
    spark(ex, ey, 5, electron, 1 - outF);
    if (Math.abs(t - hitT) < 0.25) lensGlow(cx - 90, cy - 50, 90, electron, 0.7);
  }
  ladder3(820, 200, 520, level, ease(t, hitT - 0.6, hitT + 0.2));
  if (drop > 0) {
    const e = ease(t, later, later + 2.4);
    wave(cx + 100, cy, mix(cx + 110, 1240, e), cy - 20, t, accent, 9, 30);
  }
}

// ── 06 The ladder; drops cued to the words ───────────────────────────────
function ladderDrops(t: number, g: number) {
  space(g);
  const x0 = 300,
    x1 = 760,
    levels = [130, 250, 420, 560];
  levels.forEach((y) => line([[x0, y], [x1, y]], grad(x0, 0, x1 - x0, 0, ['#d8cdf066', '#d8cdf0', '#d8cdf066']), 3));
  const big = cue('a bigger drop'),
    small = cue('a smaller drop');
  for (const [ya, yb, col, when, x, lam, label, ly] of [
    [130, 560, '#7d8cff', big, 430, 22, 'bigger drop · bluer', 120],
    [420, 560, coral, small, 620, 44, 'smaller drop · redder', 640],
  ] as const) {
    const f = ease(t, when - 0.2, when + 0.6);
    spark(x, mix(ya, yb, f), 7, col, 1);
    if (f > 0.9) wave(x + 20, (ya + yb) / 2, mix(x + 60, 1180, ease(t, when + 0.5, when + 2.2)), (ya + yb) / 2, t, col, 10, lam);
    c.globalAlpha = ease(t, when, when + 0.6);
    text(label, 1180, ly, 24, col === coral ? coral : '#a9b2ff', 'right');
    c.globalAlpha = 1;
    // After the reveal the same drop keeps repeating, photon after photon.
    if (t > when + 2.4) {
      const k = ((t - when - 2.4) % 1.6) / 1.6;
      spark(x, mix(ya, yb, ease(k, 0, 0.3)), 6, col, 1 - k);
      wave(x + 20, (ya + yb) / 2, mix(x + 60, 1180, ease(k, 0.25, 1)), (ya + yb) / 2, t, col, 10, lam);
    }
  }
}
function greenDrop(t: number, g: number) {
  space(g);
  const ys = ladder3(380, 190, 540, 2 - ease(t, 0.6, 1.4), 1)!;
  const f = ease(t, 1.2, 3);
  if (f > 0) wave(500, (ys[2] + ys[1]) / 2, mix(520, 1180, f), (ys[2] + ys[1]) / 2, t, accent, 10, 30);
  c.globalAlpha = ease(t, 1, 1.8);
  line([[350, ys[2]], [350, ys[1]]], accent, 2);
  text('2.2 eV', 330, (ys[2] + ys[1]) / 2 + 12, 40, accent, 'right');
  c.globalAlpha = ease(t, cue('five hundred') - 0.3, cue('five hundred') + 0.6);
  text('557.7 nm', 1180, (ys[2] + ys[1]) / 2 - 40, 34, accent, 'right');
  c.globalAlpha = 1;
}

// ── 15 Spectrograph stripe and the equation, term by term ────────────────
function equation(t: number) {
  contours(t);
  const terms: [string, string, string?, boolean?][] = [
    ['E', 'energy of a'],
    ['=', 'equals'],
    ['h', 'plancks constant', 'Planck’s constant'],
    ['c', 'speed of light', 'speed of light'],
    ['/', 'divided by'],
    ['λ', 'divided by', 'wavelength', true],
  ];
  c.font = 'italic 92px Georgia, serif';
  const ws = terms.map(([s]) => c.measureText(s).width + 26);
  let x = W / 2 - ws.reduce((a, b) => a + b, 0) / 2,
    flip = 1;
  terms.forEach(([s, phrase, meaning, hot], i) => {
    const when = cue(phrase) + (i === 5 ? 0.5 : 0);
    const a = ease(t, when - 0.2, when + 0.4);
    const mid = x + ws[i] / 2;
    c.save();
    c.globalAlpha = a;
    c.font = 'italic 92px Georgia, serif';
    c.textAlign = 'center';
    c.fillStyle = hot ? accent : ink;
    c.fillText(s, mid, 330 + 12 * (1 - a));
    c.restore();
    if (meaning) {
      flip = -flip;
      const b = ease(t, when + 0.3, when + 0.9);
      c.globalAlpha = b;
      line([[mid, 330 + (flip > 0 ? 30 : -86)], [mid, 330 + (flip > 0 ? 70 : -126)]], muted, 1.5);
      text(meaning, mid, 330 + (flip > 0 ? 104 : -140), 22, muted, 'center');
      c.globalAlpha = 1;
    }
    x += ws[i];
  });
  const put = cue('put in');
  c.globalAlpha = ease(t, put, put + 0.6);
  text('557.7 nm', W / 2 - 40, 560, 40, accent, 'right');
  c.globalAlpha = ease(t, cue('two point two two') - 0.2, cue('two point two two') + 0.5);
  text('→  2.22 eV', W / 2 - 20, 560, 40, accent, 'left');
  c.globalAlpha = 1;
}

// ── 07 Forbidden: the fast route is closed, a slow one remains ───────────
function forbidden(t: number, g: number) {
  space(g);
  const ys = ladder3(480, 190, 540, 2, 1)!;
  const blocked = ease(t, cue('isnt allowed') - 0.3, cue('isnt allowed') + 0.5);
  const slow = ease(t, cue('much less likely') - 0.3, cue('much less likely') + 0.8);
  // The usual fast route, crossed out.
  line([[560, ys[2] + 10], [560, ys[1] - 10]], '#cfd4ff', 3);
  c.globalAlpha = blocked;
  line([[530, (ys[2] + ys[1]) / 2 - 20], [590, (ys[2] + ys[1]) / 2 + 20]], coral, 5);
  line([[590, (ys[2] + ys[1]) / 2 - 20], [530, (ys[2] + ys[1]) / 2 + 20]], coral, 5);
  text('usual fast way', 460, (ys[2] + ys[1]) / 2 + 8, 22, muted, 'right');
  c.globalAlpha = slow;
  c.setLineDash([6, 8]);
  c.lineDashOffset = -t * 20;
  line(path((u) => [620 + 60 * Math.sin(Math.PI * u), mix(ys[2], ys[1], u)], 40), accent, 2.5);
  c.setLineDash([]);
  text('rare route · takes time', 700, (ys[2] + ys[1]) / 2 + 8, 22, accent);
  c.globalAlpha = 1;
  for (let i = 0; i < 12; i++) {
    const x = 120 + (i % 3) * 70,
      y = 200 + Math.floor(i / 3) * 90;
    const k = Math.floor(t / 2.6),
      d = -0.7 * Math.log(1 - 0.98 * hash(i * 13 + k * 7)),
      since = t - k * 2.6 - d;
    oxygen(x, y, 16, since < 0 ? 2 : 0, 1);
    if (since > 0 && since < 0.5) spark(x, y, 7, accent, 1 - since / 0.5);
  }
}

// ── 10 Nitrogen colors and camera vs eye ─────────────────────────────────
function curtain2(t: number, x0: number, w: number, base: number, hgt: number, look: 'full' | 'camera' | 'eye', a = 1) {
  c.save();
  c.globalCompositeOperation = 'screen';
  for (let i = 0; i < 260; i++) {
    const u = i / 259,
      x = x0 + u * w + 30 * Math.sin(u * 7 + t * 0.6);
    const y = base + 24 * Math.sin(u * 9 + t * 0.8) + 14 * Math.sin(u * 23 - t);
    const k = (0.55 + 0.45 * Math.cos(u * 37 - t * 1.4)) * Math.sin(Math.PI * u),
      h = hgt * (0.7 + 0.5 * k);
    const gg = c.createLinearGradient(0, y - h, 0, y + 24);
    const stops: [number, string][] =
      look === 'full'
        ? [
            [0, '#8f7cff00'],
            [0.12, '#8f7cffaa'],
            [0.35, coral + '66'],
            [0.6, accent + 'aa'],
            [0.88, accent],
            [0.95, '#ff6fc8'],
            [1, '#ff6fc800'],
          ]
        : look === 'camera'
          ? [
              [0, '#b04a8a00'],
              [0.3, '#d65a8acc'],
              [0.7, '#9a5ad0aa'],
              [1, '#9a5ad000'],
            ]
          : [
              [0, '#9a9a9a00'],
              [0.6, '#aeb8a888'],
              [1, '#c9d6bb00'],
            ];
    stops.forEach(([o, col]) => gg.addColorStop(o, col));
    c.globalAlpha = a * 0.14 * k;
    c.strokeStyle = gg;
    c.lineWidth = 14;
    c.beginPath();
    c.moveTo(x, y - h);
    c.lineTo(x, y + 24);
    c.stroke();
  }
  c.restore();
}
function nitrogenColors(t: number, g: number) {
  space(g);
  curtain2(t, 160, 960, 560, 400, 'full', 1.1);
  c.globalAlpha = ease(t, cue('violet and blue') - 0.3, cue('violet and blue') + 0.5);
  text('nitrogen ions · violet and blue', 1180, 120, 22, '#b3a9ff', 'right');
  c.globalAlpha = ease(t, cue('pink or crimson') - 0.3, cue('pink or crimson') + 0.5);
  text('nitrogen low down · pink fringe', 1180, 660, 22, '#ff8fd2', 'right');
  c.globalAlpha = 1;
}
function eyeCamera(t: number, g: number) {
  space(g);
  curtain2(t, 60, 520, 560, 360, 'camera', 1.2);
  curtain2(t, 700, 520, 560, 360, 'eye', 0.9);
  text('camera', 320, 650, 26, ink, 'center');
  text('your eye, faint aurora', 960, 650, 26, muted, 'center');
}

// ── 23 A color photograph beside a spectrum ──────────────────────────────
function photoVsSpectrum(t: number) {
  space(0);
  c.save();
  c.beginPath();
  c.rect(0, 0, W / 2 - 6, H);
  c.clip();
  cover(photos.band, 1.3, 0.35, 0.45, -3 * t);
  c.restore();
  const y = 300,
    x0 = W / 2 + 60,
    x1 = W - 60;
  c.fillStyle = '#120f26';
  c.fillRect(x0, y, x1 - x0, 80);
  const lx = mix(x0, x1, (557.7 - 400) / 300);
  const on = ease(t, cue('the spectrum') - 0.3, cue('the spectrum') + 0.6);
  lensGlow(lx, y + 40, 70, accent, 0.8 * on);
  c.fillStyle = accent;
  c.globalAlpha = on;
  c.fillRect(lx - 2.5, y - 12, 5, 104);
  text('557.7 nm', lx, y + 140, 30, accent, 'center');
  c.globalAlpha = 1;
  text('color photograph', W / 4, 660, 24, ink, 'center');
  text('spectrum', (x0 + x1) / 2, 660, 24, ink, 'center');
}

// ── 13 Recap: from orbit, down one field line, onto the ladder, and out ──
function recap(t: number, g: number) {
  space(g);
  const excite = ease(t, cue('a collision can') - 0.2, cue('a collision can') + 0.6);
  const emit = ease(t, cue('then gives up') - 0.2, cue('then gives up') + 0.6);
  const out = ease(t, cue('theres enough'), cue('theres enough') + 2.5);
  const fall = ease(t, 0.2, Math.max(1, cue('a collision can')));
  c.globalAlpha = 1 - out;
  line([[240, -20], [470, 360]], lilac + '88', 2);
  spark(mix(240, 470, fall) - 80 * excite, mix(-20, 360, fall) + 200 * excite, 5, electron, 1 - excite * 0.6);
  oxygen(520, 380, 70, mix(0, 2, excite) - emit, 1);
  const ys = ladder3(820, 200, 520, 2 * excite - emit, ease(t, 0.5, 1.2))!;
  if (emit > 0) {
    line([[790, ys[2]], [790, ys[1]]], accent, 2);
    text('2.2 eV', 775, (ys[1] + ys[2]) / 2 + 10, 30, accent, 'right');
    wave(590, 380, mix(600, 1240, ease(t, cue('then gives up'), cue('then gives up') + 2)), 360, t, accent, 9, 30);
  }
  c.globalAlpha = 1;
  if (out > 0) {
    c.globalAlpha = out;
    cover(photos.layers, mix(1.6, 1.08, out), 0.5, 0.55);
    c.globalAlpha = 1;
  }
}

// ── 18 Mars: the particles come from the Sun's side ──────────────────────
function mars(t: number, g: number) {
  space(g);
  const cx = 640,
    cy = 380,
    r = 230;
  gradedPlanet('mars', cx, cy, r, t, [-0.95, 0.1, 0.3], 0.2);
  const day = ease(t, cue('sunlight splits') - 0.3, cue('sunlight splits') + 1);
  for (let i = 0; i < 14; i++) {
    const a = Math.PI * (0.65 + hash(i) * 0.7),
      rr = r + 30 + hash(i + 5) * 40;
    const x = cx + rr * Math.cos(a),
      y = cy + rr * Math.sin(a);
    const f = clamp((t - cue('sunlight splits') - hash(i) * 2) / 1.5);
    c.globalAlpha = day;
    dot(x - 8 * f, y, 5, '#9a94c8');
    dot(x + 6, y, 5, '#9a94c8');
    oxygen(x + 18 + 18 * f, y - 6 * f, 5, 0, 1);
    c.globalAlpha = 1;
  }
  const storm = ease(t, cue('in march') - 0.3, cue('in march') + 1);
  for (let i = 0; i < 50; i++) {
    const f = (t * 0.45 + i * 0.137) % 1;
    const y = cy + (hash(i) - 0.5) * 520;
    const x = mix(-40, cx + r * 0.9, f);
    const yy = Math.abs(x - cx) < r ? y + Math.sign(y - cy || 1) * 60 * f : y;
    spark(x, yy, 1.8, blush, storm * Math.sin(Math.PI * f));
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
// Desaturated continuum for the "hot solid" row.
export function softRainbow(y: number, a: number) {
  const g = c.createLinearGradient(X(400), 0, X(700), 0);
  ['#4d3f9c', '#4a63b8', '#4f8fa0', '#86a86a', '#c8b06a', '#d88a6a', '#c45a62'].forEach((col, i, arr) => g.addColorStop(i / (arr.length - 1), col));
  c.globalAlpha = a;
  c.fillStyle = g;
  c.fillRect(X(400), y, X(700) - X(400), 44);
  c.globalAlpha = 1;
}
void lineRow;

export const beats3: Record<string, (t: number, g: number) => void> = {
  earthBand: (t) => earthBand(t),
  sunWind,
  magnetosphere: (t, g) => magnetosphere(t, g, 0),
  tailRelease: (t, g) => magnetosphere(t, g, ease(t, 0.3, 2)),
  dive,
  collision: (t, g) => collision(t, g, false),
  collisionRowan: (t, g) => collision(t, g, true),
  ladder: ladderDrops,
  greenDrop,
  equation: (t) => equation(t),
  forbidden,
  nitrogen: nitrogenColors,
  eyeCamera,
  photoVsSpectrum: (t) => photoVsSpectrum(t),
  recap,
  mars,
};
