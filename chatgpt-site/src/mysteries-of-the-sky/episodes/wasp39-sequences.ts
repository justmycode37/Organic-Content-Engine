// These shots build over the recorded phrases. All times are seconds from the
// cut to the shot, including when the shot begins partway through a chapter.
import { c, ice, pink, lime, muted, words, line, grad, lensGlow } from './stage.ts';
import observations from './wasp39-data.json';
import { drawMolecule } from '../molecules.ts';
import model from './wasp39-model.json';
import miri from './wasp39-miri.json';
import g395h from './wasp39-g395h.json';
const tau = 2 * Math.PI;
function ease(t: number, start: number, end: number) {
  const f = Math.max(0, Math.min(1, (t - start) / (end - start)));
  return f * f * (3 - 2 * f);
}
function heading(_s: string) {}
function mark(x: number, y: number, r: number, color: string) {
  c.fillStyle = color;
  c.beginPath();
  c.arc(x, y, r, 0, tau);
  c.fill();
}
function strip(t: number) {
  heading('The same thickness of air');
  const open = ease(t, 4.4, 10.7);
  for (const [i, r] of [58, 109].entries()) {
    const circumference = tau * r;
    const bend = Math.max(0.0001, 1 - open);
    const startX = [340, 890][i],
      endX = 232 + circumference / 2;
    const x = startX + (endX - startX) * open,
      y = 398 - r + (i === 0 ? 301 - (398 - r) : 455 - (398 - r)) * open;
    const points = [];
    for (let j = 0; j <= 128; j++) {
      const a = (j / 128 - 0.5) * tau * bend;
      points.push([x + (r * Math.sin(a)) / bend, y + (r * (1 - Math.cos(a))) / bend]);
    }
    const col = i === 0 ? ice : pink;
    line(points, grad(x - r, y, r * 2, r * 2, [col + '8f', col, '#d2acbc']), 15);
    const travel = (t * 0.4 + i * 0.2) % 1;
    const [px, py] = points[Math.floor(travel * 128)];
    lensGlow(px, py, 32 + 15 * open, col, 0.74);
    c.globalAlpha = ease(t, 10.4, 11.4);
    words(i ? 'Larger planet · more light blocked' : 'Smaller planet', 233, y - 33, 25, 'sans', col);
    c.globalAlpha = 1;
    // Small fiducial marks move with the material as the annulus unwraps.
    for (let j = 0; j < points.length - 1; j += 8) {
      const [px, py] = points[j],
        a = (j / 128 - 0.5) * tau * bend;
      line(
        [
          [px - 5 * Math.sin(a), py + 5 * Math.cos(a)],
          [px + 5 * Math.sin(a), py - 5 * Math.cos(a)],
        ],
        '#281e3390',
        1.2,
      );
    }
  }
}
function density(t: number) {
  heading('How quickly does the gas thin out?');
  for (const [i, h] of [67, 135].entries()) {
    const x = 322 + i * 620,
      y = 590,
      col = i ? pink : ice;
    const g = c.createLinearGradient(0, y - 373, 0, y);
    for (let j = 0; j <= 12; j++) {
      const a = Math.exp((-373 * (1 - j / 12)) / h);
      g.addColorStop(
        j / 12,
        col +
          Math.round(162 * a)
            .toString(16)
            .padStart(2, '0'),
      );
    }
    c.fillStyle = g;
    c.fillRect(x - 165, y - 373, 330, 373);
    line(
      [
        [x - 182, y],
        [x + 182, y],
      ],
      col,
      2,
    );
    const z = 45 + 152 * ease(t, 0, 7);
    line(
      [
        [x - 167, y - z],
        [x + 167, y - z],
      ],
      col + 'b0',
      1.4,
    );
    words(i ? 'Extended atmosphere' : 'Compact atmosphere', x, y + 53, 24, 'sans', muted, 'center');
    for (let n = 0; n < 165; n++) {
      const f = (n + 0.5) / 165,
        alt = -h * Math.log(f);
      if (alt > 370) continue;
      const xx = x - 155 + 310 * ((n * 0.6180339 + 0.008 * Math.sin(t * 0.55 + n)) % 1);
      mark(xx, y - alt + 2 * Math.sin(n + t * 0.8), 1.8, col + '9c');
    }
  }
}
function photonCups(t: number) {
  heading('Counting photons');
  const n = 12,
    gap = 70,
    left = 220,
    bottom = 535;
  const widened = ease(t, 9, 13);
  for (let i = 0; i < n; i++) {
    const x = left + i * gap,
      col = i % 2 ? ice : pink;
    const total = Math.max(0, t - 0.2) * 3.2 + i * 0.38;
    const count = Math.floor(total),
      phase = total - count;
    // Each drop lands as its column gains one count.
    // A one-second count jumps around; more time or a wider cup steadies it.
    const hash = (q: number) => {
      const v = Math.sin(q * 12.9898 + i * 78.233) * 43758.5453;
      return v - Math.floor(v);
    };
    const tick = t * 2.6,
      k = Math.floor(tick),
      u = tick - k,
      jitter = hash(k) + (hash(k + 1) - hash(k)) * u * u * (3 - 2 * u) - 0.5;
    const calm = Math.max(widened, ease(t, 6, 9) * 0.55);
    const stack = Math.min(count, 18) * 3.4 * Math.min(1, t / 4) + 70 * jitter * (1 - 0.85 * calm) + 40,
      level = bottom - 5 - stack;
    c.fillStyle = grad(x - 24, level, 48, stack || 1, [col + 'ae', col + '26']);
    c.fillRect(x - 23, level, 46, stack);
    c.globalAlpha = i % 3 === 2 ? 1 : 1 - 0.67 * widened;
    line(
      [
        [x - 31, bottom - 188],
        [x - 31, bottom],
        [x + 31, bottom],
        [x + 31, bottom - 188],
      ],
      ice + '80',
      1.8,
    );
    c.globalAlpha = 1;
    const yy = 175 + (level - 175) * phase * phase;
    line(
      [
        [x, yy - 9],
        [x, yy],
      ],
      col + '6b',
      1.5,
    );
    mark(x, yy, 3.3, col);
  }
  if (widened > 0) {
    c.globalAlpha = widened;
    for (let i = 0; i < 4; i++) {
      const x = left + 3 * i * gap - 28;
      line(
        [
          [x, 563],
          [x, 573],
          [x + 2 * gap + 56, 573],
          [x + 2 * gap + 56, 563],
        ],
        muted,
        1.7,
      );
    }
    c.globalAlpha = 1;
  }
}
function rebin(t: number) {
  const cols = observations.spectrum.filter(([w]) => w >= 3.88 && w <= 4.25);
  const group = t < 3 ? 1 : t < 7 ? 3 : 6;
  heading('Grouping the readings');
  const X = (w: number) => 160 + (w - 3.86) * 2380,
    Y = (p: number) => 531 - (p - 2.07) * 3120;
  for (let i = 0; i < cols.length; i += group) {
    const bin = cols.slice(i, i + group),
      weight = bin.reduce((s, b) => s + 1 / b[2] ** 2, 0);
    const avg = bin.reduce((s, b) => s + b[1] / b[2] ** 2, 0) / weight;
    const mid = bin.reduce((s, b) => s + b[0], 0) / bin.length,
      x = X(mid),
      y = Y(avg),
      err = 3120 / Math.sqrt(weight);
    for (const [wl, p] of bin) mark(X(wl), Y(p), 3, pink + '77');
    const l = X(bin[0][0]) - 9,
      r = X(bin.at(-1)![0]) + 9;
    line(
      [
        [l, y],
        [r, y],
      ],
      ice,
      2,
    );
    line(
      [
        [x, y - err],
        [x, y + err],
      ],
      lime,
      2,
    );
    mark(x, y, 4.5, lime);
  }
  words('Wavelength (μm)', 1088, 625, 20, 'mono', muted, 'right');
  for (const w of [3.9, 4, 4.1, 4.2]) words(w.toFixed(1), X(w), 573, 18, 'mono', muted, 'center');
}
function modelAt(w: number) {
  const i = model.findIndex((p) => p[0] >= w);
  if (i <= 0) return model[i === 0 ? 0 : model.length - 1][1];
  const a = model[i - 1],
    b = model[i];
  return a[1] + ((b[1] - a[1]) * (w - a[0])) / (b[0] - a[0]);
}
function fit(t: number, returnToEvidence = false) {
  const start = 3.84,
    stop = 4.58,
    X = (w: number) => 150 + ((w - start) / (stop - start)) * 995;
  const separate = ease(t, 6.2, 10.1),
    y0 = 540 - 123 * separate,
    amp = 1290 - 450 * separate;
  const Y = (p: number) => y0 - (p - 2.07) * amp;
  words('Measured transit depths', 155, 128, 25, 'sans', ice);
  words('Proposed gas mixture', 1140, 128, 25, 'sans', pink, 'right');
  line(
    [
      [150, y0 + 18],
      [1145, y0 + 18],
    ],
    muted + '75',
    1.2,
  );
  const curve = model.filter(([w]) => w >= start && w <= stop);
  const reveal = Math.max(2, Math.ceil(ease(t, 0, 2.7) * curve.length));
  line(
    curve.slice(0, reveal).map(([w, p]) => [X(w), Y(p)]),
    pink,
    2.7,
  );
  for (const [w, p, e] of observations.spectrum.filter(([w]) => w >= start && w <= stop)) {
    const x = X(w),
      y = Y(p);
    line(
      [
        [x, Y(p + e)],
        [x, Y(p - e)],
      ],
      ice + '9c',
      1.2,
    );
    mark(x, y, 3.6, ice);
    if (separate > 0) {
      const residual = 546 - (p - modelAt(w)) * 1330;
      c.globalAlpha = separate;
      const yy = y + (residual - y) * separate;
      line(
        [
          [x, yy - e * 1330],
          [x, yy + e * 1330],
        ],
        ice + '8f',
        1.2,
      );
      const nearby = Math.abs(w - 4.05) < 0.062 && p > modelAt(w);
      if (nearby && returnToEvidence) lensGlow(x, yy, 27, lime, 0.43);
      mark(x, yy, nearby ? 5 : 3.7, nearby ? lime : ice);
      c.globalAlpha = 1;
    }
  }
  if (separate > 0) {
    c.globalAlpha = separate;
    line(
      [
        [150, 546],
        [1145, 546],
      ],
      muted + 'a0',
      1,
    );
    words('Observed − model', 155, 475, 20, 'sans', muted);
    c.globalAlpha = 1;
  }
  for (const w of [3.9, 4.05, 4.3, 4.5]) words(w + ' μm', X(w), y0 + 49 + 178 * separate, 18, 'sans', muted, 'center');
}
function thousand(t: number) {
  heading('One photon in a thousand');
  const beat = ease(t, 1.8, 4.8);
  for (let j = 0; j < 20; j++)
    for (let i = 0; i < 50; i++) {
      const id = j * 50 + i,
        x = 201 + i * 18,
        y = 203 + j * 18;
      const col = id === 20 ? lime : id < 20 ? pink : ice + '65';
      mark(x, y, id === 20 ? 4 + 1.8 * beat : 3.2, col);
    }
  lensGlow(201 + 20 * 18, 203, 13 + 7 * beat, lime, 0.7);
}
function turnDips(t: number) {
  const morph = ease(t, 4.7, 8.3);
  const axes = ease(t, 6.5, 9.6);
  c.globalAlpha = axes;
  line([[156, 244], [156, 507], [1127, 507]], '#cfc2dc78', 1.5);
  words('Wavelength', 1127, 550, 23, 'sans', muted, 'right');
  c.globalAlpha = 1;
  words(morph > 0.5 ? 'Fraction blocked' : 'Light reaching the detector', 140, 190, 20, 'mono', muted);
  for (const [i, depth] of [2, 2.1].entries()) {
    const align = ease(t, 8.3, 11.2);
    const x = 375 + 530 * i + (i ? -141 : 142) * align,
      col = i ? pink : ice,
      base = 245 + 258 * morph,
      dy = 73 * depth * (1 - 2 * morph);
    const pts = Array.from({ length: 101 }, (_, j) => {
      const f = j / 100;
      return [
        x + (f - 0.5) * 360 * (1 - morph),
        base + dy * Math.min(1, ease(f, 0.12, 0.24), 1 - ease(f, 0.77, 0.89)),
      ];
    });
    line(pts, col, 3);
    lensGlow(x, base + dy, 18 + 10 * axes, col, 0.6);
    mark(x, base + dy, 6, col);
    if (morph > 0.7) words(depth.toFixed(1) + '%', x, base + dy - 27, 32, 'title', col, 'center');
  }
}
function bandScale(t: number) {
  // All three wave trains travel at the same screen speed. Their crest
  // spacing shares a scale, so the wavelength comparison survives the cut.
  const visible = 0.4 + 0.3 * ease(t, 4.8, 6.4);
  const spread = ease(t, 7.5, 9.2);
  const bands = [
    { wavelength: visible, name: 'Visible light', y: 355 - 165 * spread, at: 0, colors: [ice, pink] },
    { wavelength: 4.05, name: 'First band', y: 356, at: 8.1, colors: [pink, '#ffd0ab'] },
    { wavelength: 8.5, name: 'Longer-wave band', y: 522, at: 10.7, colors: ['#bb9fd9', ice] },
  ];
  c.fillStyle = grad(0, 0, 1280, 720, ['#312248', '#231c3b', '#643342']);
  c.fillRect(-90, -50, 1460, 820);
  for (const { wavelength, name, y, at, colors } of bands) {
    const opened = ease(t, at, at + 1.35);
    if (!opened) continue;
    c.save();
    c.globalAlpha = opened;
    const spacing = wavelength * 75;
    for (let layer = 0; layer < 10; layer++) {
      const curve = Array.from({ length: 601 }, (_, i) => {
        const x = 104 + i * 1.78 * opened;
        const phase = (x - 104 - t * 80) * tau / spacing;
        const amplitude = 33 + 50 * (1 - spread);
        return [x, y + amplitude * Math.sin(phase + layer * 0.065) + layer * 1.2];
      });
      line(curve, grad(104, y - 45, 1068, 90, colors.map(col => col + (layer === 9 ? 'ff' : '35'))), layer === 9 ? 3.2 : 4.5);
    }
    const value = wavelength === visible ? visible.toFixed(2) : String(wavelength);
    words(name + '   ' + value + ' μm', 110, y - 60 - 50 * (1 - spread), 26, 'sans', '#f4e4ec');
    c.restore();
  }
  if (t > 16.7) {
    c.globalAlpha = ease(t, 16.7, 17.7);
    words('Infrared shown in illustrative colors', 1160, 645, 20, 'sans', muted, 'right');
    c.globalAlpha = 1;
  }
}
function drift(t: number) {
  const x = (u: number) => 155 + 980 * u;
  const y = (u: number) => 295 - 94 * u;
  const dip = (u: number) => Math.min(ease(u, 0.27, 0.34), 1 - ease(u, 0.66, 0.73));
  const available = ease(t, 0, 6.8);
  const hideWings = ease(t, 8.3, 9.6) * (1 - ease(t, 15.4, 17.8));
  const until = Math.round(available * 180);
  const shade = grad(0, 150, 0, 360, [ice + '05', ice + '25', ice + '06']);
  c.fillStyle = shade;
  c.fillRect(x(0.27), 150, x(0.73) - x(0.27), 390);
  words('During transit', 640, 526, 22, 'sans', muted, 'center');
  for (let i = 0; i <= until; i++) {
    const u = i / 180;
    const inTransit = u >= 0.27 && u <= 0.73;
    const py = y(u) + 140 * dip(u) + 5 * Math.sin(i * 7.21);
    c.globalAlpha = inTransit ? 1 : 1 - hideWings;
    mark(x(u), py, 3.8, inTransit ? '#f3d7da' : ice);
  }
  c.globalAlpha = 1;
  if (t < 7) lensGlow(x(available), y(available) + 140 * dip(available), 32, ice);
  // With only the interior of the transit, its unocculted level is unknown.
  if (hideWings > 0) {
    c.save();
    c.setLineDash([8, 8]);
    for (const shift of [-29, 23]) {
      c.globalAlpha = hideWings * 0.85;
      line([[x(0.1), y(0.1) + shift], [x(0.9), y(0.9) + shift]], pink, 2.5);
    }
    c.restore();
    c.globalAlpha = hideWings;
    words('Which baseline?', 640, 150, 32, 'sans', pink, 'center');
    c.globalAlpha = 1;
  }
  const fit = ease(t, 16.1, 18.8);
  if (fit) {
    line([[x(0), y(0)], [x(fit), y(fit)]], ice, 3);
    const u = 0.5;
    const depth = 140 * ease(t, 18.3, 20.3);
    line([[x(u), y(u)], [x(u), y(u) + depth]], lime, 4);
    if (depth > 90) words('transit depth', x(u) + 18, y(u) + 85, 24, 'sans', lime);
  }
  words('Relative brightness', 155, 110, 26, 'sans', muted);
  words('Illustrative exposure', 155, 625, 20, 'sans', muted);
  words('Time →', 1135, 625, 24, 'sans', muted, 'right');
}
export const evidenceScenes: Record<string, (t: number) => void> = {
  strip,
  density,
  photonCups,
  rebin,
  fit,
  thousand,
  turnDips,
  bandScale,
  drift,
};

// Powell et al. Figure 2 depths and 1σ errors with the PICASO curves
// from Extended Data Figure 3, including the isolated effect of SO₂ opacity.
function miriEvidence(t: number) {
  const ink = '#30263b';
  const plum = '#674760';
  const withSulfur = '#874056';
  const withoutSulfur = '#4a4f78';
  const compare = ease(t, 4.1, 6.1);
  const close = ease(t, 0, 3.2);
  const lo = 5.0 + 2.02 * close;
  const hi = 11.0 - 1.88 * close;
  const x = (w: number) => 154 + ((w - lo) / (hi - lo)) * 970;
  const lowDepth = 1.85 + 0.14 * close;
  const depthRange = 0.4 - 0.12 * close;
  const y = (value: number) => 516 - (value - lowDepth) * 337 / depthRange;
  c.fillStyle = grad(0, 0, 1280, 720, ['#ffe0c0', '#edcdcb', '#cbbbd6']);
  c.fillRect(-90, -50, 1460, 820);
  words('Webb · mid-infrared', 154, 105, 34, 'sans', ink);
  words('Transit depth', 154, 151, 21, 'sans', plum);
  for (const depth of [1.9, 2.0, 2.1, 2.2]) {
    if (depth < lowDepth) continue;
    line([[154, y(depth)], [1124, y(depth)]], '#65465c42', 1.4);
    words(depth.toFixed(1) + '%', 140, y(depth) + 6, 20, 'sans', plum, 'right');
  }
  c.save();
  c.beginPath();
  c.rect(154, 155, 970, 370);
  c.clip();
  const limits = [[7.28, 7.98], [8.26, 8.9]];
  for (const [i, [left, right]] of limits.entries()) {
    c.globalAlpha = ease(t, i * 1.65, i * 1.65 + 0.7);
    c.fillStyle = grad(0, 155, 0, 370, ['#733b581c', lime + '64', '#ad706339']);
    c.fillRect(x(left), 155, x(right) - x(left), 370);
  }
  const model = miri.models.filter(([w]) => w > lo - 0.13 && w < hi + 0.13);
  for (const [i, [left, right]] of limits.entries()) {
    const fill = ease(t, 6.0 + i * 1.8, 7.85 + i * 1.8);
    if (!fill) continue;
    const band = model.filter(([w]) => w >= left && w <= left + (right - left) * fill);
    c.globalAlpha = fill * 0.72;
    c.fillStyle = grad(0, 215, 0, 260, ['#9b485d95', '#844c734a']);
    c.beginPath();
    band.forEach(([w, withSO2], j) => j ? c.lineTo(x(w), y(withSO2)) : c.moveTo(x(w), y(withSO2)));
    [...band].reverse().forEach(([w, , noSO2]) => c.lineTo(x(w), y(noSO2)));
    c.fill();
  }
  c.globalAlpha = compare;
  line(model.map(([w, depth]) => [x(w), y(depth)]), withSulfur, 4.1);
  c.setLineDash([8, 7]);
  line(model.map(([w, , depth]) => [x(w), y(depth)]), withoutSulfur, 3.1);
  c.setLineDash([]);
  c.globalAlpha = 1;
  for (const [w, depth, error] of miri.measurements) {
    if (w < lo || w > hi) continue;
    line([[x(w), y(depth - error)], [x(w), y(depth + error)]], plum + 'ad', 2.2);
    mark(x(w), y(depth), 5.6, ink);
  }
  c.restore();
  for (const [i, [left, right]] of limits.entries()) {
    c.globalAlpha = ease(t, i * 1.65, i * 1.65 + 0.7);
    words(i ? '8.5 μm band' : '7.7 μm band', x((left + right) / 2), 147, 23, 'sans', ink, 'center');
  }
  c.globalAlpha = 1;
  line([[154, 526], [1124, 526]], plum, 1.5);
  for (const w of [5, 6, 7, 7.5, 8, 8.5, 9, 10, 11]) {
    if (w < lo || w > hi - 0.3 || (w % 1 !== 0 && close < 0.55)) continue;
    words(String(w), x(w), 560, 20, 'sans', ink, 'center');
  }
  mark(161, 614, 5, ink);
  words('Webb measurements', 179, 621, 21, 'sans', ink);
  c.globalAlpha = compare;
  line([[432, 614], [477, 614]], withSulfur, 4);
  words('Model with SO₂', 493, 621, 21, 'sans', withSulfur);
  c.setLineDash([8, 7]);
  line([[723, 614], [767, 614]], withoutSulfur, 3);
  c.setLineDash([]);
  words('Same model without SO₂', 783, 621, 21, 'sans', withoutSulfur);
  c.globalAlpha = 1;
  words('Wavelength (μm)', 1124, 560, 20, 'sans', ink, 'right');
}
evidenceScenes.confirm = miriEvidence;
evidenceScenes.confirmRecap = (t) => miriEvidence(10 + t);
evidenceScenes.residual = (t) => fit(10.6 + t, true);

function detector(t: number) {
  heading('On the detector');
  const shift = 1.4 * Math.sin(t * 0.7),
    width = 38,
    height = 11;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const mid = 4.7 + 1.4 * Math.sin(x / 18) + shift;
      const v = Math.exp(-((y - mid) ** 2) / 1.4) * (0.72 + 0.21 * Math.cos(x * 0.48));
      const px = 149 + x * 26,
        py = 217 + y * 26;
      c.fillStyle = grad(px, py, 24, 24, [
        ice +
          Math.round(15 + v * 194)
            .toString(16)
            .padStart(2, '0'),
        pink +
          Math.round(9 + v * 158)
            .toString(16)
            .padStart(2, '0'),
      ]);
      c.fillRect(px, py, 24, 24);
    }
}
const prismSpectrum = observations.spectrum.filter(([w]) => w > 3.84 && w < 4.26);
function resolution(t: number) {
  const x = (w: number) => 185 + (w - 3.84) * 2210;
  const spectra = [
    { rows: g395h, color: ice, name: 'Grating · G395H', start: 1.2, base: 305 },
    { rows: prismSpectrum, color: pink, name: 'Prism · PRISM', start: 2.9, base: 542 },
  ];
  c.fillStyle = grad(0, 0, 1280, 720, ['#101929', '#253052', '#482d48']);
  c.fillRect(-90, -50, 1460, 820);
  const chart = ease(t, 4.8, 7.1);
  const match = ease(t, 8.7, 9.6);
  for (const { rows, color, name, start, base } of spectra) {
    const enter = ease(t, start, start + 0.8);
    c.save();
    c.globalAlpha = enter;
    words(name, 185, base - 173, 27, 'sans', color);
    const y = (depth: number) => base - (depth - 2.05) * 740;
    c.globalAlpha = enter * chart;
    for (const depth of [2.05, 2.15, 2.25]) {
      line([[185, y(depth)], [1113, y(depth)]], '#bfb4d431', 1.1);
      words(depth.toFixed(2) + '%', 169, y(depth) + 6, 17, 'sans', muted, 'right');
    }
    c.globalAlpha = enter;
    for (const [i, [w, depth, error]] of rows.entries()) {
      const cx = x(w);
      const resting = base - 68;
      const py = resting + (y(depth) - resting) * chart;
      const width = rows === g395h ? 9 : 19;
      const focus = ease(t, 8.65 + i * 0.009, 9.15 + i * 0.009) * (Math.abs(w - 4.05) < 0.042 ? 1 : 0);
      c.globalAlpha = enter * (1 - chart);
      c.fillStyle = grad(cx, resting - 29, 0, 58, [color + '35', color, color + '23']);
      c.fillRect(cx - width / 2, resting - 28, width, 56);
      c.globalAlpha = enter * chart;
      line([[cx, py - error * 740 * chart], [cx, py + error * 740 * chart]], focus > 0.5 ? lime : color + '82', 1.7);
      mark(cx, py, rows === g395h ? 3.2 : 5, focus > 0.5 ? lime : color);
    }
    c.restore();
  }
  c.globalAlpha = match;
  c.setLineDash([4, 7]);
  line([[x(4.05), 151], [x(4.05), 553]], lime, 2);
  c.setLineDash([]);
  words('4.05 μm', x(4.05), 591, 26, 'sans', lime, 'center');
  c.globalAlpha = chart;
  for (const w of [3.9, 4, 4.1, 4.2]) words(w.toFixed(1), x(w), 591, 20, 'sans', muted, 'center');
  words('Wavelength (μm)', 1113, 635, 21, 'sans', muted, 'right');
  c.globalAlpha = 1;
}
function spectralWindow(t: number) {
  const x = (w: number) => 142 + (w - 0.5) * 85;
  const ranges = [
    { start: 0.6, end: 5.3, y: 286, color: ice, name: 'NIRSpec · PRISM', reveal: 1 },
    { start: 5.0, end: 12.0, y: 432, color: pink, name: 'MIRI · low-resolution spectrum', reveal: ease(t, 3.7, 7.3) },
  ];
  c.fillStyle = grad(0, 0, 1280, 720, ['#20192f', '#493758', '#704151']);
  c.fillRect(-90, -50, 1460, 820);
  const band = (left: number, right: number, y: number, color: string) => {
    c.fillStyle = grad(0, y - 31, 0, 62, [color + '0d', color + '9a', color + '0b']);
    c.fillRect(left, y - 31, right - left, 62);
    for (let i = 0; i < 30; i++) {
      const target = left + (right - left) * ((i * 0.618 + t * 0.16) % 1);
      lensGlow(target, y + 14 * Math.sin(i + t), 12, color, 0.42);
    }
  };
  for (const { start, end, y, color, name, reveal } of ranges) {
    if (reveal <= 0) continue;
    band(x(start), x(start) + reveal * (x(end) - x(start)), y, color);
    c.globalAlpha = reveal;
    words(name, x(start), y - 49, 26, 'sans', color);
    c.globalAlpha = 1;
  }
  for (const [w, y, start] of [[4.05, 286, 0.4], [7.7, 432, 7], [8.5, 432, 7.8]]) {
    c.globalAlpha = ease(t, start, start + 0.7);
    line([[x(w), y - 23], [x(w), y + 24]], lime, 2.1);
    words(w + ' μm', x(w), y + 59, 18, 'sans', lime, 'center');
  }
  c.globalAlpha = 1;
  line([[x(0.5), 551], [x(12), 551]], muted + '99', 1.5);
  for (const w of [1, 3, 5, 7, 9, 11]) words(String(w), x(w), 584, 20, 'sans', muted, 'center');
  words('Wavelength (μm)', x(12), 632, 23, 'sans', muted, 'right');
}
function finalPoints(t: number) {
  heading('The bump beside the peak');
  const points = observations.spectrum.filter(([w]) => w >= 3.88 && w <= 4.17);
  const f = ease(t, 0, 3.4);
  for (const [w, p, e] of points) {
    const x = 182 + (w - 3.88) * 3100,
      y = 501 - (p - 2.09) * 3500,
      hi = w >= 3.99 && w <= 4.05;
    c.globalAlpha = hi ? 0.8 + 0.2 * f : 1 - 0.62 * f;
    line(
      [
        [x, y - e * 3500],
        [x, y + e * 3500],
      ],
      hi ? lime : ice,
      2,
    );
    mark(x, y, hi ? 5.5 : 4, hi ? lime : pink);
  }
  c.globalAlpha = 1;
  words('4.05 μm', 182 + 0.17 * 3100, 606, 29, 'mono', muted, 'center');
}
Object.assign(evidenceScenes, { detector, resolution, window: spectralWindow, finalPoints });

// Schematic upper-atmosphere column. The particles illustrate a qualitative
// chemical model prediction; their number does not encode a measured abundance.
function column(t: number, illuminated: boolean) {
  const reveal = illuminated ? ease(t, 6.4, 8.2) : 0;
  const create = illuminated ? ease(t, 1.1, 4.2) : 0;
  const parcel = (x: number, y: number, radius: number, lit: boolean) => {
    lensGlow(x, y, radius * 1.45, lit ? pink : ice, 0.43);
    c.save();
    const alpha = c.globalAlpha;
    c.beginPath();
    c.arc(x, y, radius, 0, tau);
    c.clip();
    c.fillStyle = grad(x - radius, y - radius, 2 * radius, 2 * radius, ['#272544', '#472d49', '#99606a']);
    c.fillRect(x - radius, y - radius, 2 * radius, 2 * radius);
    for (let i = 0; i < 130; i++) {
      const u = (i * 0.618 + t * 0.022) % 1;
      const v = (i * 0.733 + 0.018 * Math.sin(i + t)) % 1;
      mark(x + (u - 0.5) * 2 * radius, y + (v - 0.5) * 2 * radius, 1.5 + (i % 3), ice + '53');
    }
    if (lit) {
      for (let i = 0; i < 12; i++) {
        const phase = (t * 0.9 + i * 0.073) % 1;
        const px = x + (i - 5.5) * radius * 0.145;
        const py = y - radius * 1.04 + phase * radius * 0.91;
        c.globalAlpha = alpha * Math.sin(Math.PI * phase) * 0.75;
        line([[px - 15, py - 40], [px, py]], '#d1b9ff', 2.3);
        c.globalAlpha = alpha;
      }
    }
    const molecules = lit ? 12 : illuminated ? 2 : 0;
    for (let i = 0; i < molecules; i++) {
      const angle = i * 2.4;
      const span = radius * (0.15 + 0.68 * Math.sqrt(i / 12));
      const px = x + span * Math.cos(angle) + 4 * Math.sin(i + t);
      const py = y - 16 + span * 0.75 * Math.sin(angle) + 5 * Math.cos(t * 1.1 + i);
      c.globalAlpha = alpha * (lit ? ease(create, i / 18, i / 18 + 0.23) : 1);
      drawMolecule(c, 'SO2', [px, py], 0.23, t + i);
    }
    c.restore();
    c.strokeStyle = lit ? '#fac0a180' : '#c4bed88c';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(x, y, radius, 0, tau);
    c.stroke();
  };
  const x = 640 - 300 * reveal;
  const y = 354;
  const radius = 218 - 40 * reveal;
  parcel(x, y, radius, illuminated);
  if (reveal) {
    c.save();
    c.globalAlpha = reveal;
    parcel(940, y, radius, false);
    words('Without UV chemistry', 940, 593, 27, 'sans', ice, 'center');
    c.restore();
  }
  words(illuminated ? 'With UV chemistry' : 'Thermal equilibrium', x, 593, 27, 'sans', illuminated ? '#f7c5b2' : ice, 'center');
  words('Upper atmosphere · schematic', 640, 653, 20, 'sans', '#e7cfdb', 'center');
}
function identity(t: number) {
  heading('From the spectrum to the molecule');
  const X = (w: number) => 105 + (w - 3.89) * 1420,
    Y = (d: number) => 480 - (d - 2.09) * 2600;
  for (const [w, d, e] of observations.spectrum.filter(([w]) => w >= 3.9 && w < 4.2)) {
    const x = X(w),
      y = Y(d),
      col = Math.abs(w - 4.045) < 0.044 ? lime : ice;
    line(
      [
        [x, Y(d - e)],
        [x, Y(d + e)],
      ],
      col,
      1.7,
    );
    mark(x, y, 4, col);
  }
  words('4.05 μm', X(4.045), 575, 24, 'mono', muted, 'center');
  const show = ease(t, 0.7, 3.4);
  c.save();
  c.globalAlpha = show;
  drawMolecule(c, 'SO2', [896, 385], 0.94, t);
  words('SO₂', 896, 575, 31, 'title', pink, 'center');
  c.restore();
}
evidenceScenes.balance = (t) => column(t, false);
evidenceScenes.chemistry = (t) => column(t, true);
evidenceScenes.identity = identity;

evidenceScenes.discovery = (t) => {
  heading('Two features in the starlight');
  const zoom = ease(t, 9.6, 13.2),
    left = 3.6 + 0.29 * zoom,
    right = 4.79 - 0.56 * zoom;
  const x = (w: number) => 155 + ((w - left) / (right - left)) * 966;
  const y = (d: number) => 548 - (d - 2.065) * (1680 + 1300 * zoom);
  c.save();
  c.beginPath();
  c.rect(151, 145, 975, 408);
  c.clip();
  const focus = 4.34 - 0.297 * ease(t, 8.6, 10.3);
  const width = 0.06 - 0.022 * zoom;
  const bright = ease(t, 2.2, 4);
  c.fillStyle = grad(0, 159, 0, 389, [ice + '03', ice + '23']);
  c.fillRect(x(focus - width), 159, x(focus + width) - x(focus - width), 389);
  for (const [w, p, e] of observations.spectrum) {
    if (w < left || w > right) continue;
    const near = Math.abs(w - focus) < width;
    const grow = ease(t, 0.32 + (w - 3.6) * 1.55, 1.38 + (w - 3.6) * 1.55);
    c.globalAlpha = 0.15 + grow * 0.85;
    const center = y(p);
    if (near && bright > 0.2) lensGlow(x(w), center, 37 * bright, lime, 0.56 + Math.sin(t * 2.3 + w * 44) * 0.12);
    const col = near && bright > 0.3 ? lime : ice;
    line(
      [
        [x(w), center + (y(p + e) - center) * grow],
        [x(w), center + (y(p - e) - center) * grow],
      ],
      col + 'be',
      1.5,
    );
    mark(x(w), y(p), 3.4, near ? col : pink);
  }
  c.restore();
  line(
    [
      [155, 153],
      [155, 550],
      [1121, 550],
    ],
    muted + '8f',
    1.2,
  );
  for (const wl of [3.7, 3.9, 4.05, 4.3, 4.5, 4.7])
    if (wl >= left && wl <= right) words(String(wl), x(wl), 591, 19, 'mono', muted, 'center');
  words('Wavelength (μm)', 1120, 645, 20, 'mono', muted, 'right');
  words('Light blocked', 155, 138, 19, 'mono', muted);
};
