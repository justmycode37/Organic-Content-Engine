// Explanatory shots for "The Light Oxygen Makes". All geometry is schematic:
// field lines, atoms, energy levels, altitudes and particle paths are illustrated.
import { c, W, H, lensGlow, line, grad } from './stage.ts';
import { drawPlanet } from '../index.ts';
import { tau, ease, mix, clamp, ink, muted, lilac, coral, blush, accent, text, space, cover } from './aurora-core.ts';
import { photos, atomGlyph } from './aurora.ts';

type XY = [number, number];
export const path = (fn: (u: number) => XY, n = 100) => Array.from({ length: n + 1 }, (_, i) => fn(i / n));
export function dot(x: number, y: number, r: number, color: string | CanvasGradient) {
  c.fillStyle = color;
  c.beginPath();
  c.arc(x, y, r, 0, tau);
  c.fill();
}
export function spark(x: number, y: number, r: number, color = accent, a = 1) {
  if (a <= 0) return;
  c.save();
  c.globalAlpha *= a;
  lensGlow(x, y, r * 6, color, 0.9);
  dot(x, y, r, color);
  c.restore();
}
export function wave(x0: number, y0: number, x1: number, y1: number, t: number, color = accent, amp = 9, lambda = 34) {
  const len = Math.hypot(x1 - x0, y1 - y0),
    ux = (x1 - x0) / len,
    uy = (y1 - y0) / len;
  line(
    path((u) => {
      const s = u * len,
        o = amp * Math.sin((s / lambda - t * 3) * tau);
      return [x0 + ux * s - uy * o, y0 + uy * s + ux * o];
    }, 160),
    color,
    2.6,
  );
  lensGlow(x1, y1, 26, color, 0.6);
}
// Earth drawn through the same gradient map as the photographs.
const scratch = document.createElement('canvas'),
  sx = scratch.getContext('2d', { willReadFrequently: true })!;
const rampStops = ['#0d0a1e', '#1e1f55', '#3b3c9a', '#6d5fc4', '#b073c4', '#f0878f', '#ffe1cf'].map((h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
]);
export function gradedPlanet(body: 'earth' | 'mars' | 'sun', x: number, y: number, r: number, t: number, light: [number, number, number], lat = 0.55) {
  const size = Math.ceil(2 * r + 8);
  scratch.width = scratch.height = size;
  drawPlanet(sx, { body, center: [size / 2, size / 2], radius: r, latitude: lat, longitude: -1.3 + 0.03 * t, roll: 0.12, light, ambient: 0.05 });
  const d = sx.getImageData(0, 0, size, size),
    p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    if (!p[i + 3]) continue;
    const lum = clamp(((0.3 * p[i] + 0.55 * p[i + 1] + 0.15 * p[i + 2]) / 255) ** 0.8 * 1.2);
    const f = lum * 6,
      k = Math.min(5, Math.floor(f)),
      u = f - k;
    for (let j = 0; j < 3; j++) p[i + j] = rampStops[k][j] + (rampStops[k + 1][j] - rampStops[k][j]) * u;
  }
  sx.putImageData(d, 0, 0);
  c.drawImage(scratch, x - size / 2, y - size / 2);
}

// ── 02 A line without a name ─────────────────────────────────────────────
function spectrometer(t: number, g: number) {
  space(g);
  const e = photos.engravingInv;
  const h = 560,
    w = (e.width / e.height) * h;
  c.globalAlpha = ease(t, 0, 1.2);
  c.drawImage(e, W / 2 - w / 2 + 120, H / 2 - h / 2 + 10, w, h);
  c.globalAlpha = 1;
  text('Uppsala, 1867', 90, 620, 30, ink, 'left', 'title');
}
// Hot solid → continuous rainbow; thin gas → a barcode of lines.
export const barcodes: [string, number[]][] = [
  ['Hydrogen', [410.2, 434.0, 486.1, 656.3]],
  ['Helium', [447.1, 471.3, 492.2, 501.6, 587.6, 667.8]],
  ['Neon', [585.2, 588.2, 603.0, 607.4, 616.4, 621.7, 626.6, 633.4, 640.2, 650.7, 659.9, 692.9]],
];
export const X = (nm: number) => 230 + ((nm - 400) / 300) * 900;
export function rainbowRow(y: number, a: number) {
  const g = c.createLinearGradient(X(400), 0, X(700), 0);
  ['#5b3fd0', '#3f6be0', '#2fb6c9', '#7fd65b', '#e8d35a', '#f09a4a', '#e0484a'].forEach((col, i, arr) => g.addColorStop(i / (arr.length - 1), col));
  c.globalAlpha = a;
  c.fillStyle = g;
  c.fillRect(X(400), y, X(700) - X(400), 44);
  c.globalAlpha = 1;
}
export function lineRow(y: number, nms: number[], a: number, color = '#dcd2f3') {
  c.fillStyle = '#120f26';
  c.globalAlpha = a;
  c.fillRect(X(400), y, X(700) - X(400), 44);
  for (const nm of nms) {
    lensGlow(X(nm), y + 22, 22, color, 0.5);
    c.fillStyle = color;
    c.fillRect(X(nm) - 1.5, y, 3, 44);
  }
  c.globalAlpha = 1;
}
function rainbow(t: number, g: number) {
  space(g);
  rainbowRow(200, ease(t, 0.2, 1));
  text('Hot solid', 200, 230, 24, muted, 'right');
  barcodes.forEach(([name, nms], i) => {
    const a = ease(t, 1.4 + i * 0.7, 2.2 + i * 0.7);
    lineRow(300 + i * 70, nms, a);
    c.globalAlpha = a;
    text(name, 200, 330 + i * 70, 24, muted, 'right');
    c.globalAlpha = 1;
  });
}
function mystery(t: number, g: number) {
  space(g);
  barcodes.forEach(([name, nms], i) => {
    lineRow(170 + i * 70, nms, 0.55);
    text(name, 200, 200 + i * 70, 24, muted, 'right');
  });
  const a = ease(t, 0.3, 1.2);
  lineRow(430, [557.7], a, accent);
  c.globalAlpha = a;
  text('Aurora', 200, 460, 26, accent, 'right');
  c.globalAlpha = 1;
  // A scanning cursor searches the known patterns and finds no match.
  const s = ((t * 0.35) % 1) * 3;
  const row = Math.floor(s);
  if (t > 1.5) {
    c.strokeStyle = '#ffffff55';
    c.setLineDash([6, 6]);
    c.strokeRect(X(557.7) - 14, 160 + row * 70, 28, 64);
    c.setLineDash([]);
  }
  c.strokeStyle = accent + '66';
  c.beginPath();
  c.moveTo(X(557.7), 150);
  c.lineTo(X(557.7), 480);
  c.stroke();
}

// ── 03 Laboratory ────────────────────────────────────────────────────────
export function tube(t: number, g: number) {
  space(g);
  const x0 = 220,
    x1 = 1060,
    y = 260;
  const on = ease(t, 0.6, 1.6);
  // Glass
  c.fillStyle = grad(0, y - 60, 0, 120, ['#ffffff10', '#ffffff04', '#ffffff12']);
  c.beginPath();
  c.roundRect(x0, y - 50, x1 - x0, 100, 50);
  c.fill();
  c.strokeStyle = '#d9d2f066';
  c.lineWidth = 2;
  c.stroke();
  // Electrodes
  for (const x of [x0 + 30, x1 - 30]) {
    c.fillStyle = '#8f86b0';
    c.fillRect(x - 6, y - 28, 12, 56);
  }
  // Glowing discharge: mostly helium, a little oxygen.
  const glow = c.createLinearGradient(x0, 0, x1, 0);
  glow.addColorStop(0, '#f4b2a800');
  glow.addColorStop(0.1, '#f4b2a8');
  glow.addColorStop(0.5, '#ffd7c4');
  glow.addColorStop(0.9, '#f4b2a8');
  glow.addColorStop(1, '#f4b2a800');
  c.globalAlpha = on * (0.75 + 0.08 * Math.sin(t * 13) + 0.05 * Math.sin(t * 31));
  c.fillStyle = glow;
  c.fillRect(x0 + 40, y - 22, x1 - x0 - 80, 44);
  lensGlow((x0 + x1) / 2, y, 420, '#f4b2a8', 0.35);
  c.globalAlpha = 1;
  for (let i = 0; i < 46; i++) {
    const u = (i * 0.618 + t * (0.05 + (i % 5) * 0.01)) % 1,
      v = Math.sin(i * 3.1 + t * 2) * 26;
    dot(x0 + 50 + u * (x1 - x0 - 100), y + v, i % 6 === 0 ? 4 : 2.2, i % 6 === 0 ? coral : '#fff1e6aa');
  }
  // The spectrum below: helium lines, then oxygen's green line appears.
  lineRow(450, [447.1, 471.3, 492.2, 501.6, 587.6, 667.8], ease(t, 1.2, 2), '#f6c7b8');
  const green = ease(t, 3, 4.2);
  if (green > 0) {
    lensGlow(X(557.7), 472, 70 * green, accent, 0.9);
    c.fillStyle = accent;
    c.globalAlpha = green;
    c.fillRect(X(557.7) - 2.5, 440, 5, 64);
    text('557.7 nm', X(557.7), 560, 30, accent, 'center');
    c.globalAlpha = 1;
  }
  text('Toronto, 1925', 90, 640, 30, ink, 'left', 'title');
}

// ── 04 Sun, field, tail, oval ────────────────────────────────────────────
export function dipole(u: number, L: number, cx: number, cy: number, r: number, side: number, squash = 1): XY {
  const pole = Math.acos(Math.sqrt(1.02 / L)),
    lat = mix(-pole, pole, u);
  const d = r * L * Math.cos(lat) ** 2;
  const sq = side > 0 ? squash : 1 / squash;
  return [cx + side * d * Math.cos(lat) * sq, cy - d * Math.sin(lat)];
}
function sunWind(t: number, g: number) {
  space(g);
  gradedPlanet('sun', 140, 360, 260, t, [0, 0, 1], 0);
  lensGlow(140, 360, 520, coral, 0.45);
  for (let i = 0; i < 160; i++) {
    const u = (i * 0.6180339 + t * (0.12 + (i % 7) * 0.012)) % 1,
      y = 360 + (((i * 0.7548) % 1) - 0.5) * 640 * (0.4 + u);
    spark(400 + u * 900, y, 1.6, i % 5 ? '#f6c3b6' : lilac, 0.65 * Math.sin(Math.PI * u));
  }
  gradedPlanet('earth', 1110, 360, 34, t, [-1, 0, 0.3]);
}
export function magnetosphere(t: number, g: number, tail = 0) {
  space(g);
  const cx = 470,
    cy = 360,
    r = 70;
  // Solar wind arriving from the left and flowing around the field.
  for (let i = 0; i < 120; i++) {
    const u = (i * 0.6180339 + t * 0.16) % 1;
    const y0 = (((i * 0.7548) % 1) - 0.5) * 720;
    const x = -40 + u * 1360,
      dx = x - cx;
    const bow = Math.max(0, 1 - Math.abs(dx + 120) / 900) * Math.sign(y0 || 1) * 140 * Math.exp(-(y0 * y0) / 90000);
    spark(x, cy + y0 + (dx > -260 ? bow : 0), 1.5, '#f6c3b6', 0.5 * Math.sin(Math.PI * u));
  }
  for (const L of [1.6, 2.2, 3, 4.2, 6]) {
    for (const side of [-1, 1]) {
      const pts = path((u) => dipole(u, L, cx, cy, r, side, side > 0 ? 1 + 0.25 * L + tail * 0.3 * L : 0.7), 140);
      line(pts, grad(cx - 400, 0, 800, 0, [coral + '88', lilac + 'aa', '#8f9ce6aa']), 2);
    }
  }
  gradedPlanet('earth', cx, cy, r, t, [-1, 0, 0.35]);
  if (tail > 0) {
    // Released energy sends electrons racing back along field lines.
    for (let k = 0; k < 10; k++) {
      const L = 3 + (k % 5) * 0.6,
        hemi = k < 5 ? 1 : -1;
      const f = (t * 0.45 + k * 0.13) % 1;
      const pts = path((u) => dipole(u, L, cx, cy, r, 1, 1 + 0.25 * L + 0.3 * L), 140);
      const idx = Math.round(hemi > 0 ? mix(70, 138, f) : mix(70, 2, f));
      const [px, py] = pts[idx];
      spark(px, py, 3, accent, tail * Math.sin(Math.PI * f));
    }
  }
}
function oval(t: number, g: number, grow = 0) {
  space(g);
  const cx = 640,
    cy = 380,
    r = 250;
  gradedPlanet('earth', cx, cy, r, t * 0.3, [-0.2, 0.3, 0.9], 1.25);
  // The oval sits around the magnetic pole, offset from the geographic one.
  const ox = cx + 18,
    oy = cy - 30;
  const rr = r * mix(0.34, 0.56, grow);
  for (let i = 0; i < 3; i++) {
    c.save();
    c.globalCompositeOperation = 'screen';
    c.strokeStyle = i ? accent + '55' : accent;
    c.lineWidth = i ? 16 + i * 10 : 6;
    c.filter = i ? 'blur(' + i * 6 + 'px)' : 'none';
    c.beginPath();
    for (let k = 0; k <= 180; k++) {
      const a = (k / 180) * tau;
      const w = 1 + 0.07 * Math.sin(5 * a + t * 0.8) + 0.04 * Math.sin(11 * a - t * 1.3);
      const x = ox + rr * w * Math.cos(a),
        y = oy + rr * w * 0.82 * Math.sin(a);
      if (k) c.lineTo(x, y);
      else c.moveTo(x, y);
    }
    c.stroke();
    c.restore();
  }
}
// Over the horizon: a distant viewer sees the tall red layer before the green.
function horizon(t: number, g: number) {
  space(g, 1);
  const R = 2600,
    cx = 640,
    cy = 720 + R - 170;
  c.fillStyle = grad(0, 500, 0, 220, ['#2a2456', '#120e24']);
  c.beginPath();
  c.arc(cx, cy, R, 0, tau);
  c.fill();
  const at = (a: number, h: number): XY => [cx + (R + h) * Math.sin(a), cy - (R + h) * Math.cos(a)];
  // Aurora column far to the north (right).
  const a0 = 0.17;
  for (let k = 0; k < 40; k++) {
    const a = a0 + (k - 20) * 0.0016;
    const [gx0, gy0] = at(a, 60),
      [gx1, gy1] = at(a, 150);
    const [rx1, ry1] = at(a, 330);
    c.globalAlpha = 0.25 + 0.15 * Math.sin(k + t * 2);
    line([[gx0, gy0], [gx1, gy1]], accent, 3);
    line([[gx1, gy1], [rx1, ry1]], coral, 3);
  }
  c.globalAlpha = 1;
  // Observer far to the south (left) and the line of sight grazing the ground.
  const ob = at(-0.06, 0);
  dot(ob[0], ob[1] - 6, 6, ink);
  const sight = ease(t, 0.8, 2.6);
  const tangentEnd = at(a0, 250);
  line([[ob[0], ob[1] - 6], [mix(ob[0], tangentEnd[0], sight), mix(ob[1] - 6, tangentEnd[1], sight)]], ink + 'aa', 2);
  c.globalAlpha = ease(t, 2.4, 3.2);
  text('red glow: still above the horizon', tangentEnd[0] - 40, tangentEnd[1] - 40, 22, coral, 'right');
  text('green layer: hidden below it', at(a0, 100)[0] - 40, at(a0, 100)[1] + 40, 22, accent, 'right');
  c.globalAlpha = 1;
}

// ── 05 One collision ─────────────────────────────────────────────────────
function dive(t: number, g: number) {
  // Altitude layers, thin at the top and denser below.
  c.fillStyle = grad(0, 0, 0, H, ['#0b0a1d', '#1a1840', '#3b2a5a', '#6b3a5c']);
  c.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) {
    const y = H * (((i * 0.7548) % 1) ** 0.45),
      x = ((i * 0.6180339 + t * 0.004 * (i % 3)) % 1) * W;
    dot(x, y, 1.6 + (y / H) * 1.8, i % 4 ? '#b8a9e055' : coral + '66');
  }
  // One electron spirals down a field line.
  const f = ease(t, 0.3, 5.5);
  const yE = mix(-40, 520, f),
    xE = 640 + 26 * Math.sin(t * 9) * (1 - f * 0.5);
  line(path((u) => [640 + 26 * Math.sin((t - (1 - u) * 0.6) * 9), mix(-40, yE, u)], 80), accent + '55', 2);
  spark(xE, yE, 4, accent, 1);
  text('100 km', 1180, 520, 22, muted, 'right');
  line([[1060, 512], [1200, 512]], '#ffffff33', 1);
}
function collision(t: number, g: number) {
  space(g);
  const cx = 700,
    cy = 380;
  // Nucleus and two shells; one electron is lifted to the outer shell.
  const lift = ease(t, 1.6, 2.4);
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
    spark(cx + r * Math.cos(a), cy + r * Math.sin(a), i === 0 ? 5 : 3.5, i === 0 && lift > 0.5 ? accent : blush, 1);
  }
  // The incoming electron streaks in and glances off.
  const inF = ease(t, 0, 1.6),
    outF = ease(t, 1.6, 3.2);
  const ex = t < 1.6 ? mix(-40, cx - 150, inF) : mix(cx - 150, cx - 600, outF),
    ey = t < 1.6 ? mix(80, cy - 60, inF) : mix(cy - 60, cy + 300, outF);
  spark(ex, ey, 4, lilac, 1 - outF);
  if (lift > 0) lensGlow(cx, cy, 260, accent, 0.25 * lift * (0.8 + 0.2 * Math.sin(t * 6)));
}

// ── 06 Energy ladder ─────────────────────────────────────────────────────
function ladder(t: number, g: number, greenOnly = false) {
  space(g);
  const x0 = 300,
    x1 = 760;
  const levels = greenOnly ? [190, 420] : [130, 250, 420, 560];
  levels.forEach((y, i) => {
    line([[x0, y], [x1, y]], grad(x0, 0, x1 - x0, 0, ['#d8cdf066', '#d8cdf0', '#d8cdf066']), 3);
    void i;
  });
  // Drops: a big one gives a blue photon, a small one a red photon.
  const drops: [number, number, string, number][] = greenOnly
    ? [[190, 420, accent, 0.4]]
    : [
        [130, 560, '#7d8cff', 0.4],
        [420, 560, coral, 3.4],
      ];
  for (const [ya, yb, col, at] of drops) {
    const f = ease(t, at, at + 0.8);
    const x = greenOnly ? 530 : at < 1 ? 430 : 620;
    spark(x, mix(ya, yb, f), 6, col, 1);
    if (f > 0.95) {
      const travel = ease(t, at + 0.8, at + 2.6);
      wave(x + 20, mix(ya, yb, 0.5), mix(x + 60, 1180, travel), mix(ya, yb, 0.5), t, col, 10, greenOnly ? 30 : col === coral ? 44 : 22);
    }
  }
  if (greenOnly) {
    c.globalAlpha = ease(t, 1, 1.8);
    text('2.2 eV', 280, 315, 40, accent, 'right');
    line([[300, 200], [300, 410]], accent, 2);
    text('557.7 nm', 1180, 260, 34, accent, 'right');
    c.globalAlpha = 1;
  } else {
    c.globalAlpha = ease(t, 1.2, 2);
    text('bigger drop · bluer', 1180, 120, 24, '#a9b2ff', 'right');
    c.globalAlpha = ease(t, 4.2, 5);
    text('smaller drop · redder', 1180, 640, 24, coral, 'right');
    c.globalAlpha = 1;
  }
}

// ── 15 Reading the line, and E = hc/λ over flowing contours ──────────────
function spectrograph(t: number, g: number) {
  space(g);
  const sx0 = 80,
    gx = 520,
    gy = 360;
  line([[sx0, gy], [gx, gy]], grad(sx0, 0, gx - sx0, 0, ['#fff1e600', '#fff1e6']), 5);
  c.fillStyle = grad(gx - 30, gy - 110, 60, 220, ['#cfc6ef55', '#8f86c033']);
  c.fillRect(gx - 12, gy - 110, 24, 220);
  for (let i = 0; i < 24; i++) {
    const a = -0.5 + i / 23;
    const ex = 1060,
      ey = gy + a * 420;
    const col = i === 11 ? accent : '#cfc6ef';
    c.globalAlpha = i === 11 ? 1 : 0.12;
    line([[gx, gy], [ex, ey]], col, i === 11 ? 4 : 1.2);
  }
  c.globalAlpha = 1;
  // Detector with one stripe.
  c.fillStyle = '#1b1838';
  c.fillRect(1060, gy - 230, 70, 460);
  const y = gy + (-0.5 + 11 / 23) * 420;
  lensGlow(1095, y, 60, accent, 0.8 * ease(t, 0.5, 1.5));
  c.fillStyle = accent;
  c.globalAlpha = ease(t, 0.5, 1.5);
  c.fillRect(1062, y - 4, 66, 8);
  c.globalAlpha = 1;
  for (let k = 0; k < 8; k++) {
    const f = (t * 0.6 + k / 8) % 1;
    spark(mix(sx0, gx, f), gy, 2.5, accent, Math.sin(Math.PI * f));
  }
}
export function contours(t: number) {
  c.fillStyle = '#16131f';
  c.fillRect(0, 0, W, H);
  lensGlow(W * 0.7, H * 0.25, 520, '#3d3f9c', 0.3);
  c.lineCap = 'round';
  const n = 32;
  for (let i = 0; i < n; i++) {
    const v = i / (n - 1);
    c.beginPath();
    for (let k = 0; k <= 120; k++) {
      const x = -40 + (k / 120) * (W + 80);
      const bend =
        80 * Math.sin(x / 260 + v * 1.6 + t * 0.09) + 45 * Math.sin(x / 140 - v * 2.3 - t * 0.06) * Math.sin(v * Math.PI) + 130 * Math.exp(-(((x - W * 0.66) / 220) ** 2)) * Math.sin(v * 5 + t * 0.12);
      const y = -60 + v * (H + 120) + bend * (0.5 + 0.5 * Math.sin(v * Math.PI));
      if (k) c.lineTo(x, y);
      else c.moveTo(x, y);
    }
    c.strokeStyle = i % 5 === 0 ? '#7d86d855' : '#5a5fae38';
    c.lineWidth = 1.2 + (i % 3) * 0.6;
    c.stroke();
  }
}
function equation(t: number) {
  contours(t);
  const terms: [string, string?, boolean?][] = [['E'], ['='], ['h', 'Planck’s constant'], ['c', 'speed of light'], ['/'], ['λ', 'wavelength', true]];
  c.font = 'italic 92px Georgia, serif';
  const ws = terms.map(([s]) => c.measureText(s).width + 26);
  let x = W / 2 - ws.reduce((a, b) => a + b, 0) / 2;
  let flip = 1;
  terms.forEach(([s, meaning, hot], i) => {
    const a = ease(t, 0.3 + i * 0.35, 0.9 + i * 0.35);
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
      const b = ease(t, 0.9 + i * 0.35, 1.6 + i * 0.35);
      c.globalAlpha = b;
      line([[mid, 330 + (flip > 0 ? 30 : -86)], [mid, 330 + (flip > 0 ? 70 : -126)]], muted, 1.5);
      text(meaning, mid, 330 + (flip > 0 ? 104 : -140), 22, muted, 'center');
      c.globalAlpha = 1;
    }
    x += ws[i];
  });
  const r = ease(t, 3.4, 4.4);
  c.globalAlpha = r;
  text('557.7 nm  →  2.22 eV', W / 2, 560, 40, accent, 'center');
  c.globalAlpha = 1;
}

// ── 07 Slow atom; 08 quenching ───────────────────────────────────────────
function waiting(t: number, g: number) {
  space(g);
  // Ordinary excited atoms flash at once and are done.
  for (let i = 0; i < 70; i++) {
    const x = 120 + (i % 10) * 46,
      y = 170 + Math.floor(i / 10) * 56;
    const phase = (t * 1.3 + ((i * 0.618) % 1)) % 1;
    dot(x, y, 4, '#8b83b8');
    if (phase < 0.06) spark(x, y, 4, '#d9d0ff', 1 - phase / 0.06);
  }
  // The green state holds its energy; a ring fills while it waits.
  const cx = 900,
    cy = 360;
  const cycle = 2.6,
    f = (t % cycle) / cycle,
    wait = clamp(f / 0.8);
  lensGlow(cx, cy, 120, '#6d5fc4', 0.5);
  dot(cx, cy, 30, grad(cx - 30, cy - 30, 60, 60, [blush, '#b073c4']));
  c.strokeStyle = accent;
  c.lineWidth = 5;
  c.beginPath();
  c.arc(cx, cy, 70, -Math.PI / 2, -Math.PI / 2 + tau * wait);
  c.stroke();
  if (f > 0.8) {
    const e = (f - 0.8) / 0.2;
    spark(cx, cy, 8, accent, 1 - e);
    wave(cx + 40, cy, mix(cx + 60, 1240, e), cy, t, accent, 9, 30);
  }
  text('about 0.7 s', cx, cy + 130, 28, accent, 'center');
  text('a hundred-millionth of a second', 350, 600, 22, muted, 'center');
}
export function quench(t: number, g: number) {
  space(g);
  const panel = (x0: number, dense: boolean) => {
    const cx = x0 + 300,
      cy = 330;
    c.strokeStyle = '#ffffff18';
    c.strokeRect(x0 + 20, 80, 560, 500);
    const n = dense ? 70 : 8;
    for (let i = 0; i < n; i++) {
      const sp = dense ? 1.6 : 0.4;
      const x = x0 + 40 + ((i * 0.618 * 520 + t * 90 * sp * Math.cos(i)) % 520 + 520) % 520,
        y = 100 + ((i * 0.7548 * 460 + t * 90 * sp * Math.sin(i * 1.7)) % 460 + 460) % 460;
      dot(x, y, 4, '#8b83b8');
    }
    const cycle = 2.6,
      f = (t % cycle) / cycle;
    if (dense) {
      // A neighbor strikes before the wait is over; the energy leaves as motion.
      const hit = f > 0.35;
      dot(cx, cy, 14, hit ? '#8b83b8' : accent);
      if (!hit) lensGlow(cx, cy, 50, accent, 0.5);
      const bx = mix(cx + 160, cx + 16, clamp(f / 0.35));
      dot(bx, cy - 10, 10, '#b5aee0');
      if (hit) {
        const k = (f - 0.35) / 0.65;
        line([[cx - 20 - 60 * k, cy], [cx - 60 - 60 * k, cy]], '#ffffff44', 2);
      }
    } else {
      dot(cx, cy, 14, f < 0.8 ? accent : '#8b83b8');
      lensGlow(cx, cy, 50, accent, f < 0.8 ? 0.5 : 0);
      if (f > 0.8) {
        const e = (f - 0.8) / 0.2;
        wave(cx + 20, cy, mix(cx + 40, x0 + 570, e), cy, t, accent, 8, 28);
      }
    }
    text(dense ? 'dense air' : 'thin air', cx, 630, 28, dense ? muted : ink, 'center');
  };
  panel(40, true);
  panel(660, false);
}

// ── 09 Height sets the color ─────────────────────────────────────────────
export function column(t: number, g: number) {
  c.fillStyle = grad(0, 0, 0, H, ['#07061a', '#120f2e', '#2a1f4a', '#4a2a4e']);
  c.fillRect(0, 0, W, H);
  const Y = (km: number) => 660 - km * 2.05;
  const band = (lo: number, hi: number, col: string, a: number) => {
    const gg = c.createLinearGradient(0, Y(hi), 0, Y(lo));
    gg.addColorStop(0, col + '00');
    gg.addColorStop(0.5, col + 'aa');
    gg.addColorStop(1, col + '22');
    c.globalAlpha = a;
    c.fillStyle = gg;
    c.fillRect(380, Y(hi), 520, Y(lo) - Y(hi));
    c.globalAlpha = 1;
  };
  band(200, 300, coral, ease(t, 2.5, 3.5) * (0.85 + 0.15 * Math.sin(t * 1.7)));
  band(100, 200, accent, ease(t, 0.5, 1.5) * (0.85 + 0.15 * Math.sin(t * 2.3)));
  // Electrons rain down along the field.
  for (let i = 0; i < 40; i++) {
    const f = (t * 0.5 + i * 0.137) % 1;
    spark(400 + ((i * 0.618) % 1) * 480, mix(Y(300), Y(110), f), 1.8, lilac, Math.sin(Math.PI * f));
  }
  for (const km of [0, 100, 200, 300]) {
    line([[340, Y(km)], [360, Y(km)]], muted, 1.5);
    text(km + ' km', 330, Y(km) + 7, 20, muted, 'right');
  }
  line([[360, Y(0)], [360, Y(310)]], muted + '88', 1.5);
  c.globalAlpha = ease(t, 0.8, 1.6);
  text('green · waits about 0.7 s', 930, Y(150) + 8, 24, accent);
  c.globalAlpha = ease(t, 2.8, 3.6);
  text('red · waits about 2 minutes', 930, Y(250) + 8, 24, coral);
  c.globalAlpha = ease(t, 5, 5.8);
  text('too dense: collisions win', 930, Y(60) + 8, 24, muted);
  c.globalAlpha = 1;
}

// ── 10-11 Curtains ───────────────────────────────────────────────────────
export function curtain(t: number, x0: number, w: number, base: number, hgt: number, palette: 'aurora' | 'eye', a = 1) {
  c.save();
  c.globalCompositeOperation = 'screen';
  for (let i = 0; i < 260; i++) {
    const u = i / 259;
    const x = x0 + u * w + 30 * Math.sin(u * 7 + t * 0.6);
    const y = base + 24 * Math.sin(u * 9 + t * 0.8) + 14 * Math.sin(u * 23 - t);
    const k = (0.55 + 0.45 * Math.cos(u * 37 - t * 1.4)) * Math.sin(Math.PI * u);
    const h = hgt * (0.7 + 0.5 * k);
    const gg = c.createLinearGradient(0, y - h, 0, y + 20);
    if (palette === 'aurora') {
      gg.addColorStop(0, coral + '00');
      gg.addColorStop(0.25, coral + '66');
      gg.addColorStop(0.55, accent + 'aa');
      gg.addColorStop(0.9, accent);
      gg.addColorStop(0.97, '#d58bd6');
      gg.addColorStop(1, '#d58bd600');
    } else {
      gg.addColorStop(0, '#9a9a9a00');
      gg.addColorStop(0.6, '#b8c4ae66');
      gg.addColorStop(1, '#c9d6bb00');
    }
    c.globalAlpha = a * 0.13 * k;
    c.strokeStyle = gg;
    c.lineWidth = 14;
    c.beginPath();
    c.moveTo(x, y - h);
    c.lineTo(x, y + 20);
    c.stroke();
  }
  c.restore();
}
function nitrogen(t: number, g: number) {
  space(g);
  curtain(t, 160, 960, 560, 380, 'aurora');
  c.globalAlpha = ease(t, 0.8, 1.6);
  text('nitrogen ions · violet and blue', 1180, 140, 22, '#a9b2ff', 'right');
  c.globalAlpha = ease(t, 2.2, 3);
  text('nitrogen low down · pink fringe', 1180, 650, 22, '#e7a0dc', 'right');
  c.globalAlpha = 1;
}
function eyeCamera(t: number, g: number) {
  space(g);
  curtain(t, 60, 520, 560, 360, 'aurora');
  curtain(t, 700, 520, 560, 360, 'eye', 0.9);
  text('camera', 320, 640, 26, ink, 'center');
  text('human eye, faint aurora', 960, 640, 26, muted, 'center');
}
function sheets(t: number, g: number) {
  space(g);
  // A thin sheet seen across (faint) then turned to be seen along (bright).
  const turn = ease(t, 1.5, 5);
  const w = mix(900, 120, turn);
  curtain(t, 640 - w / 2, w, 560, 380, 'aurora', mix(0.55, 1.8, turn));
  c.globalAlpha = 1 - turn;
  text('looking across a sheet', 640, 660, 24, muted, 'center');
  c.globalAlpha = turn;
  text('looking along it', 640, 660, 24, accent, 'center');
  c.globalAlpha = 1;
}

// ── 17 Airglow, 18 Mars ──────────────────────────────────────────────────
function recombine(t: number, g: number) {
  space(g);
  const cx = 640,
    cy = 340;
  const f = (t % 4) / 4;
  const meet = ease(f, 0, 0.5);
  dot(mix(cx - 300, cx - 18, meet), cy, 16, coral);
  dot(mix(cx + 300, cx + 18, meet), cy, 16, coral);
  if (f > 0.5) {
    const e = (f - 0.5) / 0.5;
    // The released energy excites a third oxygen atom, which later glows green.
    dot(cx + 200, cy + 120, 16, e > 0.3 ? accent : coral);
    lensGlow(cx + 200, cy + 120, 90, accent, e > 0.3 ? 0.6 * (1 - e) + 0.2 : 0);
    line([[cx, cy], [mix(cx, cx + 200, clamp(e * 3)), mix(cy, cy + 120, clamp(e * 3))]], '#ffffff44', 2);
  }
  text('O + O', cx, 560, 30, ink, 'center');
}
function airglowEarth(t: number, g: number) {
  space(g);
  const cx = 640,
    cy = 1200,
    r = 900;
  gradedPlanet('earth', cx, cy, r, t, [0.9, 0.2, -0.3], 0.3);
  c.save();
  c.globalCompositeOperation = 'screen';
  c.strokeStyle = accent;
  for (const [wdt, a] of [
    [2, 0.9],
    [10, 0.25],
    [24, 0.1],
  ] as const) {
    c.globalAlpha = a;
    c.lineWidth = wdt;
    c.beginPath();
    c.arc(cx, cy, r + 16, Math.PI * 1.1, Math.PI * 1.9);
    c.stroke();
  }
  c.restore();
  text('about 95 km', 1100, 260, 24, accent, 'right');
}
function mars(t: number, g: number) {
  space(g);
  const cx = 640,
    cy = 380,
    r = 230;
  gradedPlanet('mars', cx, cy, r, t, [0.95, 0.1, -0.2], 0.2);
  const a = ease(t, 1, 3) * (0.8 + 0.2 * Math.sin(t * 1.3));
  c.save();
  c.globalCompositeOperation = 'screen';
  c.globalAlpha = a * 0.5;
  c.strokeStyle = accent;
  c.lineWidth = 18;
  c.filter = 'blur(8px)';
  c.beginPath();
  c.arc(cx, cy, r + 10, Math.PI * 0.55, Math.PI * 1.45);
  c.stroke();
  c.restore();
  // Energetic particles arriving and splitting carbon dioxide.
  for (let i = 0; i < 30; i++) {
    const f = (t * 0.4 + i * 0.173) % 1;
    spark(mix(-40, cx - r * 0.9, f), cy + (((i * 0.7548) % 1) - 0.5) * 400, 1.6, blush, Math.sin(Math.PI * f));
  }
  text('Mars · March 2024', 90, 640, 30, ink, 'left', 'title');
}

// ── 13 Answer, credits ───────────────────────────────────────────────────
function recap(t: number, g: number) {
  space(g);
  curtain(t, 120, 1040, 600, 420, 'aurora', 1.2);
  atomGlyph(640, 250, 90, t);
}
function credits(t: number) {
  cover(photos.redGreen, 1.06 + 0.01 * t, 0.5, 0.6);
  c.fillStyle = grad(0, 0, W * 0.75, 0, ['#0d0a1ee6', '#0d0a1e99', '#0d0a1e00']);
  c.fillRect(0, 0, W, H);
  const rows = [
    'Photographs · NASA, International Space Station crews',
    'Storm photograph · pedrik, Connecticut, May 2024 · CC BY 2.0',
    'Milky Way panorama · ESO/S. Brunier · CC BY 4.0',
    'Planet textures · Solar System Scope · CC BY 4.0',
    'Ångström and McLennan portraits, spectrometer · public domain',
    'Jezero Crater · NASA/JPL-Caltech/ASU/MSSS, Perseverance',
    'Field lines, atoms, levels and altitudes are schematic',
  ];
  text('The Light Oxygen Makes', 80, 200, 46, ink, 'left', 'title');
  rows.forEach((r, i) => {
    c.globalAlpha = ease(t, 0.5 + i * 0.4, 1.2 + i * 0.4);
    text(r, 82, 280 + i * 44, 22, muted);
  });
  c.globalAlpha = 1;
  text('Mysteries of the Sky', 82, 640, 20, lilac, 'left', 'caps');
}

export const scenes2: Record<string, (t: number, g: number) => void> = {
  spectrometer,
  rainbow,
  mystery,
  tube,
  sunWind,
  magnetosphere: (t, g) => magnetosphere(t, g, 0),
  tailRelease: (t, g) => magnetosphere(t, g, ease(t, 0.3, 2)),
  oval: (t, g) => oval(t, g, 0),
  ovalGrow: (t, g) => oval(t, g, ease(t, 0.5, 6)),
  horizon,
  dive,
  collision,
  ladder: (t, g) => ladder(t, g, false),
  greenDrop: (t, g) => ladder(t, g, true),
  spectrograph,
  equation: (t) => equation(t),
  waiting,
  quench,
  column,
  nitrogen,
  eyeCamera,
  sheets,
  recombine,
  airglowEarth,
  mars,
  recap,
  credits: (t) => credits(t),
};
