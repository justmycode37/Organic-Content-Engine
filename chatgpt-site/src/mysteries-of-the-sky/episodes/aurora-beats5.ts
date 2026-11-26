// Round-4 revisions: volumetric curtains everywhere, shaded atoms in the
// airglow, a calibrated detector, glowing response traces, a fuller Mars
// surface, a shared excitation cue, and a many-emitter ending.
import { c, W, H, lensGlow, line, grad } from './stage.ts';
import { tau, ease, mix, clamp, ink, muted, lilac, coral, accent, text, space, cover, at, hud, cream, tiles } from './aurora-core.ts';
import { path, dot, spark, wave, contours } from './aurora-scenes.ts';
import { oxygen } from './aurora-beats3.ts';
import { sheet3d } from './aurora-beats4.ts';
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
const note = (s: string) => hud(() => text(s, W - 48, H - 30, 16, muted + 'bb', 'right'));

// ── 01 Opening: tiles of several sizes pop in over a gridded cream sheet ─
const small = tiles(24, 41),
  large = tiles(8, 17);
function portrait(t: number) {
  c.fillStyle = cream;
  c.fillRect(0, 0, W, H);
  c.strokeStyle = '#b9b0a233';
  c.lineWidth = 1;
  for (let x = 0; x <= W; x += W / 24) line([[x, 0], [x, H]], '#b9b0a230', 1);
  for (let y = 0; y <= H; y += W / 24) line([[0, y], [W, y]], '#b9b0a230', 1);
  const fill = ease(t, 0.15, 3.2) * 0.5 + ease(t, 4.8, 7.2) * 0.5;
  const drawSet = (set: ReturnType<typeof tiles>, front: boolean, bias: number) => {
    for (const q of set) {
      const behind = q.at < 0.5;
      if (behind === front || q.at * bias > fill) continue;
      const age = clamp((fill - q.at * bias) * 10);
      c.save();
      c.beginPath();
      // Tiles grow in from their centre.
      const s = q.size * (0.6 + 0.4 * age);
      c.rect(q.x + (q.size - s) / 2, q.y + (q.size - s) / 2, s + 0.5, s + 0.5);
      c.clip();
      if (q.kind < 0.2) cover(photos.pillars, 1.4, 0.5 + 0.2 * Math.sin(q.x), 0.4);
      else if (q.kind < 0.32) {
        c.fillStyle = '#1c1d4a';
        c.fillRect(q.x, q.y, q.size, q.size);
      } else cover(photos.limb, 1.15, 0.5, 0.5);
      c.strokeStyle = '#ffffff26';
      c.strokeRect(q.x + 0.5, q.y + 0.5, q.size - 1, q.size - 1);
      c.restore();
    }
  };
  drawSet(small, false, 1);
  drawSet(large, false, 1.15);
  const p = photos.cut,
    h = 700,
    w = (p.width / p.height) * h;
  const z = 1 + 0.05 * ease(t, 0, 7);
  c.drawImage(p, W * 0.56 - (w * z) / 2, H - h * z + 30, w * z, h * z);
  drawSet(small, true, 1);
  drawSet(large, true, 1.15);
}
// The orbit view begins inside one tile and pulls back.
function orbit(t: number) {
  cover(photos.limb, mix(1.9, 1.1, ease(t, 0, 2.4)) + 0.01 * t, 0.62, 0.55, -6 * t);
}

// ── 07 Waiting: one shared excitation, then fast vs delayed flashes ──────
function waiting(t: number, g: number) {
  space(g);
  const period = 3.2,
    k = Math.floor(t / period),
    s = t - k * period;
  // The shared trigger: one pulse crosses both groups at the same moment.
  const pulseX = mix(60, 1220, clamp(s / 0.35));
  if (s < 0.4) {
    line([[pulseX, 150], [pulseX, 560]], '#c9b6ff88', 3);
    lensGlow(pulseX, 360, 80, '#c9b6ff', 0.4);
  }
  const grid = (x0: number, slow: boolean) => {
    for (let i = 0; i < 36; i++) {
      const x = x0 + (i % 6) * 62,
        y = 190 + Math.floor(i / 6) * 58;
      const excitedAt = clamp((x - 60) / 1160) * 0.35;
      const delay = slow ? excitedAt + -0.7 * Math.log(1 - 0.98 * hash(i * 7 + k * 131)) : excitedAt + 0.03;
      const since = s - delay;
      if (!slow) {
        const fast = (t * 1.7 + hash(i * 5)) % 1;
        if (fast < 0.12) spark(x, y, 5, '#cfd4ff', 1 - fast / 0.12);
      }
      const waitingNow = s > excitedAt && since < 0;
      oxygen(x, y, 9, waitingNow ? 1 : 0, 1);
      if (since > 0 && since < 0.35) spark(x, y, 6, slow ? accent : '#cfd4ff', 1 - since / 0.35);
    }
  };
  grid(140, false);
  grid(780, true);
  text('many excited states', 295, 590, 24, muted, 'center');
  text('the green state', 935, 590, 24, ink, 'center');
  const avg = ease(t, cue('nearly a second'), cue('nearly a second') + 0.8);
  c.globalAlpha = avg;
  text('average ≈ 0.7 s · nearly a second', 935, 140, 26, accent, 'center');
  text('≈ 0.00000001 s', 295, 140, 26, muted, 'center');
  c.globalAlpha = 1;
}

// ── 10 Volumetric curtains for the nitrogen colours and camera vs eye ────
const fullStops: [number, string][] = [
  [0, '#8f7cff00'],
  [0.1, '#8f7cff66'],
  [0.32, coral + '44'],
  [0.6, accent + '66'],
  [0.88, accent + 'aa'],
  [0.95, '#ff6fc8aa'],
  [1, '#ff6fc800'],
];
function nitrogenColors(t: number, g: number) {
  space(g);
  const violet = ease(t, cue('violet and blue') - 0.3, cue('violet and blue') + 0.8);
  const pink = ease(t, cue('pink or crimson') - 0.3, cue('pink or crimson') + 0.8);
  const stops: [number, string][] = [
    [0, '#8f7cff00'],
    [0.1, '#8f7cff' + Math.round(20 + 120 * violet).toString(16).padStart(2, '0')],
    [0.32, coral + '44'],
    [0.6, accent + '66'],
    [0.88, accent + 'aa'],
    [0.95, '#ff6fc8' + Math.round(20 + 170 * pink).toString(16).padStart(2, '0')],
    [1, '#ff6fc800'],
  ];
  sheet3d(t, 0.35 + 0.1 * Math.sin(t * 0.2), 640, 400, 1.4, 1.4, stops, 1100);
  c.globalAlpha = violet;
  text('nitrogen ions · violet and blue', 1180, 110, 22, '#b3a9ff', 'right');
  c.globalAlpha = pink;
  text('nitrogen low down · pink fringe', 1180, 660, 22, '#ff8fd2', 'right');
  c.globalAlpha = 1;
}
function eyeCamera(t: number, g: number) {
  space(g);
  c.save();
  c.beginPath();
  c.rect(0, 0, W / 2 - 4, H);
  c.clip();
  sheet3d(t, 0.4, 320, 400, 0.85, 1.6, [
    [0, '#b04a8a00'],
    [0.3, '#d65a8aaa'],
    [0.7, '#9a5ad099'],
    [1, '#9a5ad000'],
  ], 800);
  c.restore();
  c.save();
  c.beginPath();
  c.rect(W / 2 + 4, 0, W / 2, H);
  c.clip();
  sheet3d(t, 0.4, 960, 400, 0.85, 1.2, [
    [0, '#9a9a9a00'],
    [0.6, '#aeb8a866'],
    [1, '#c9d6bb00'],
  ], 800);
  c.restore();
  line([[W / 2, 80], [W / 2, 620]], '#ffffff22', 1);
  text('camera', 320, 660, 26, ink, 'center');
  text('your eye, faint aurora', 960, 660, 26, muted, 'center');
}

// ── 11 Response traces with glow and a live head ─────────────────────────
function flicker(t: number, g: number) {
  space(g);
  const x0 = 140,
    x1 = 1140,
    span = 4;
  const input = (s: number) => (Math.sin(s * 18) > 0.6 ? 1 : 0) * (0.6 + 0.4 * Math.sin(s * 3));
  const green = (s: number) => {
    let v = 0;
    for (let k = 0; k < 60; k++) v += input(s - k * 0.03) * Math.exp(-(k * 0.03) / 0.7) * 0.03;
    return v / 0.7;
  };
  const rows: [string, string, (s: number) => number, number][] = [
    ['incoming electrons', electron, input, 210],
    ['nitrogen · fast', '#a9b2ff', input, 390],
    ['oxygen green · waits, so it blurs', accent, green, 570],
  ];
  rows.forEach(([name, col, fn, y], i) => {
    const a = ease(t, i * 0.5, i * 0.5 + 0.8);
    const pts = path((u) => [mix(x0, x1, u), y - 100 * fn(t - span + u * span)], 300);
    c.globalAlpha = a * 0.35;
    c.fillStyle = grad(0, y - 100, 0, 100, [col + '66', col + '00']);
    c.beginPath();
    c.moveTo(x0, y);
    pts.forEach(([x, yy]) => c.lineTo(x, yy));
    c.lineTo(x1, y);
    c.fill();
    c.globalAlpha = a;
    line(pts, col, 2.6);
    const head = pts[pts.length - 1];
    lensGlow(head[0], head[1], 26, col, 0.8 * a);
    line([[x0, y], [x1, y]], '#ffffff22', 1);
    text(name, x0, y - 118, 22, col);
    c.globalAlpha = 1;
  });
  note('Schematic response');
}

// ── 15 Spectrograph with a calibrated detector ───────────────────────────
function spectrograph(t: number, g: number) {
  space(g);
  const sx0 = 60,
    gx = 480,
    gy = 360,
    dx = 1000;
  line([[sx0, gy], [gx, gy]], grad(sx0, 0, gx - sx0, 0, ['#fff1e600', '#fff1e6']), 5);
  for (let k = 0; k < 8; k++) {
    const f = (t * 0.6 + k / 8) % 1;
    spark(mix(sx0, gx, f), gy, 2.5, '#fff1e6', Math.sin(Math.PI * f));
  }
  c.fillStyle = grad(gx - 30, gy - 110, 60, 220, ['#cfc6ef55', '#8f86c033']);
  c.fillRect(gx - 12, gy - 110, 24, 220);
  // Faint continuum fan, one bright green ray.
  const Ynm = (nm: number) => gy + ((nm - 550) / 150) * 230;
  const cols = ['#5b3fd0', '#3f6be0', '#2fb6c9', '#7fd65b', '#e8d35a', '#f09a4a', '#e0484a'];
  for (let i = 0; i < 28; i++) {
    const nm = 400 + (i / 27) * 300;
    c.globalAlpha = 0.12;
    line([[gx, gy], [dx, Ynm(nm)]], cols[Math.min(6, Math.floor((i / 28) * 7))], 2);
  }
  c.globalAlpha = 1;
  const on = ease(t, cue('stripe stands') - 0.3, cue('stripe stands') + 0.5);
  line([[gx, gy], [dx, Ynm(557.7)]], accent, 2 + 3 * on);
  c.fillStyle = '#1b1838';
  c.fillRect(dx, gy - 260, 64, 520);
  for (const nm of [450, 500, 550, 600, 650]) {
    line([[dx + 64, Ynm(nm)], [dx + 80, Ynm(nm)]], muted, 1.5);
    text(nm + ' nm', dx + 88, Ynm(nm) + 6, 17, muted);
  }
  lensGlow(dx + 32, Ynm(557.7), 60, accent, 0.8 * on);
  c.fillStyle = accent;
  c.globalAlpha = on;
  c.fillRect(dx + 2, Ynm(557.7) - 4, 60, 8);
  const meas = ease(t, cue('measure where') - 0.2, cue('measure where') + 0.6);
  c.globalAlpha = meas;
  line([[dx - 120, Ynm(557.7)], [dx, Ynm(557.7)]], accent, 1.5);
  text('557.7 nm', dx - 130, Ynm(557.7) - 22, 26, accent, 'right');
  c.globalAlpha = 1;
}

// ── 17 Airglow with shaded atoms ─────────────────────────────────────────
function recombine(t: number, g: number) {
  const night = ease(t, cue('at night') - 0.3, cue('at night') + 1);
  space(g);
  c.fillStyle = '#3a2f6a';
  c.globalAlpha = 0.45 * (1 - night);
  c.fillRect(0, 0, W, H);
  c.globalAlpha = 1;
  const cx = 600,
    cy = 330;
  const sp = cue('splits oxygen');
  const split = ease(t, sp - 0.2, sp + 0.8);
  const meet = ease(t, cue('find each other') - 0.3, cue('find each other') + 1);
  const give = ease(t, cue('energy released'), cue('energy released') + 1.2);
  if (night < 1) {
    c.globalAlpha = 1 - night;
    lensGlow(80, 110, 280, '#fff1e6', 0.6);
    // The ultraviolet photon travels in and is absorbed on the split.
    const travel = ease(t, sp - 1.4, sp);
    if (split < 0.2) wave(120, 150, mix(130, cx - 30, travel), mix(150, cy - 10, travel), t, '#b9a2ff', 7, 18);
    c.globalAlpha = 1;
  }
  const sep = night > 0 ? mix(260, 26, meet) : mix(26, 260, split);
  if (sep < 40) line([[cx - sep, cy], [cx + sep, cy]], '#ffffff77', 6);
  oxygen(cx - sep, cy, 26, 0, 1);
  oxygen(cx + sep, cy, 26, 0, 1);
  const third: XY = [cx + 300, cy + 160];
  if (night > 0.5) {
    const excited = give > 0.6;
    const glowT = cue('energy released') + 2.2;
    const glow = ease(t, glowT, glowT + 1.4);
    oxygen(third[0], third[1], 26, excited && glow < 0.1 ? 1 : 0, 1);
    if (give > 0 && give < 1) spark(mix(cx, third[0], give), mix(cy, third[1], give), 5, '#c9b6ff', 1);
    if (glow > 0) {
      spark(third[0], third[1], 8, accent, 1 - glow * 0.5);
      wave(third[0] + 30, third[1], mix(third[0] + 40, 1240, glow), third[1] - 40, t, accent, 8, 30);
    }
  }
  text(night > 0.5 ? 'night' : 'day', 80, 640, 30, ink, 'left', 'title');
}

// ── 18 Jezero at night, the rover's mast turning to the sky ──────────────
function jezero(t: number, g: number) {
  c.fillStyle = grad(0, 0, 0, H, ['#070616', '#11102a', '#1d1a38']);
  c.fillRect(0, 0, W, H);
  for (let i = 0; i < 220; i++)
    dot(hash(i) * W, hash(i + 99) * 440, hash(i + 3) > 0.9 ? 1.6 : 0.9, '#d9d6ff' + (0.5 + 0.5 * Math.sin(t * (1 + hash(i)) + i) > 0.5 ? 'cc' : '55'));
  const glow = ease(t, 0.3, 3);
  for (let k = 0; k < 6; k++) {
    const gg = c.createLinearGradient(0, 120, 0, 520);
    gg.addColorStop(0, accent + '00');
    gg.addColorStop(1, accent + '22');
    c.globalAlpha = glow * (0.25 + 0.2 * Math.sin(t * 0.9 + k * 1.7));
    c.fillStyle = gg;
    c.fillRect(-100 + 40 * Math.sin(t * 0.2 + k), 120 + 30 * Math.sin(t * 0.35 + k), W + 200, 400);
  }
  c.globalAlpha = 1;
  // Layered crater rim and plain, plum to indigo.
  for (const [base, amp, col, sp] of [
    [470, 40, '#2a1f3e', 0.02],
    [520, 26, '#1d1630', 0.04],
    [590, 14, '#120d1e', 0.08],
  ] as const) {
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(0, H);
    for (let x = 0; x <= W; x += 16) c.lineTo(x, base - amp * Math.sin(x / 230 + 1 + t * sp) - amp * 0.4 * Math.sin(x / 80));
    c.lineTo(W, H);
    c.fill();
  }
  // Rover, rim-lit faintly by the green sky.
  const rx = 780,
    ry = 600;
  c.fillStyle = '#06050c';
  c.fillRect(rx, ry - 46, 180, 36);
  c.fillRect(rx + 20, ry - 60, 120, 16);
  for (const wx of [rx + 18, rx + 70, rx + 122, rx + 164]) dot(wx, ry, 15, '#06050c');
  const look = ease(t, cue('pointed its cameras') - 0.5, cue('pointed its cameras') + 1.5);
  const mastX = rx + 140,
    mastTop = ry - 150;
  c.fillRect(mastX, mastTop, 9, 104);
  c.save();
  c.translate(mastX + 4, mastTop);
  c.rotate(-0.9 * look);
  c.fillRect(-22, -14, 44, 22);
  c.restore();
  line([[rx, ry - 46], [rx + 180, ry - 46]], accent + '55', 1.5);
  if (look > 0.5) {
    c.globalAlpha = (look - 0.5) * 2 * 0.5;
    c.fillStyle = grad(mastX, mastTop - 300, 0, 300, [accent + '00', accent + '33']);
    c.beginPath();
    c.moveTo(mastX + 4, mastTop);
    c.lineTo(mastX - 240, mastTop - 360);
    c.lineTo(mastX + 120, mastTop - 360);
    c.fill();
    c.globalAlpha = 1;
  }
  text('Jezero Crater · Perseverance', 80, 670, 28, ink, 'left', 'title');
  note('Illustration');
}

// ── 13 Ending: one atom becomes many, the many become a curtain ──────────
function finale(t: number, g: number) {
  space(g);
  const many = ease(t, 0, 3);
  const sheet = ease(t, 2.5, 5);
  const photo = ease(t, Math.max(4.5, cue('the next time') - 1.5), Math.max(6, cue('the next time') + 0.5));
  for (let i = 0; i < 160; i++) {
    const x = mix(640, 120 + hash(i) * 1040, many),
      y = mix(380, 200 + hash(i + 5) * 340, many);
    const k = Math.floor(t / 2.2),
      d = -0.7 * Math.log(1 - 0.98 * hash(i * 3 + k * 17)),
      since = t - k * 2.2 - d;
    c.globalAlpha = 1 - sheet * 0.8;
    oxygen(x, y, mix(40, 7, many), since < 0 ? 1 : 0, 1);
    c.globalAlpha = 1;
    if (since > 0 && since < 0.4) spark(x, y, 4, accent, (1 - since / 0.4) * (1 - sheet * 0.6));
  }
  if (sheet > 0) sheet3d(t, 0.3, 640, 420, 1.4, 1.6 * sheet, undefined, 1100);
  if (photo > 0) {
    c.globalAlpha = photo;
    cover(photos.blanket, mix(1.4, 1.08, photo), 0.5, 0.6);
    c.globalAlpha = 1;
  }
}

void contours;
void lilac;
void coral;
export const beats5: Record<string, (t: number, g: number) => void> = {
  portrait: (t) => portrait(t),
  orbit: (t) => orbit(t),
  waiting,
  nitrogen: nitrogenColors,
  eyeCamera,
  flicker,
  spectrograph,
  recombine,
  jezero,
  finale,
};
