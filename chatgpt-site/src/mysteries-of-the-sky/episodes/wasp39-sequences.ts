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
const readings = observations.spectrum.filter(([w]) => w >= 3.88 && w <= 4.25);
function averageBins(size: number) {
  const bins = [];
  for (let start = 0; start < readings.length; start += size) {
    const rows = readings.slice(start, start + size);
    const weight = rows.reduce((sum, [, , error]) => sum + 1 / error ** 2, 0);
    bins.push({
      start,
      left: rows[0][0],
      right: rows.at(-1)![0],
      wavelength: rows.reduce((sum, [w]) => sum + w, 0) / rows.length,
      depth: rows.reduce((sum, [, depth, error]) => sum + depth / error ** 2, 0) / weight,
      error: 1 / Math.sqrt(weight),
    });
  }
  return bins;
}

const narrowBins = averageBins(1);
const wideBins = averageBins(6);
const joinedBins = averageBins(3);
function rebin(t: number) {
  const x = (w: number) => 167 + (w - 3.86) * 2390;
  const y = (depth: number) => 543 - (depth - 2.07) * 3160;
  const ink = '#42314c';
  const mutedInk = '#70556d';
  const widen = ease(t, 5.85, 7.3);
  const refine = ease(t, 9.45, 11.2);
  c.fillStyle = grad(0, 0, 1280, 720, ['#f1d1bd', '#e5c7cb', '#c9b9d3']);
  c.fillRect(-90, -50, 1460, 820);

  const bandX = x(4.05);
  c.fillStyle = grad(0, 170, 0, 375, ['#42723704', lime + '8f', '#42723705']);
  c.fillRect(bandX - 46, 166, 92, 381);
  words('4.05 μm', bandX, 150, 23, 'sans', ink, 'center');
  const captions = [
    ['Narrow bins', 'More detail, more uncertainty', 1 - ease(t, 5.85, 6.15)],
    ['Wide bins', 'Nearby features blend together', ease(t, 6.15, 6.55) * (1 - ease(t, 9.45, 9.83))],
    ['Group neighboring readings', 'A balance of detail and precision', ease(t, 9.83, 10.3) * (1 - ease(t, 13.3, 13.7))],
    ['Smaller uncertainty bars', 'Individual reading and grouped estimate', ease(t, 13.75, 14.2)],
  ] as const;
  for (const [title, detail, opacity] of captions) {
    c.globalAlpha = opacity;
    words(title, 164, 112, 32, 'sans', ink);
    words(detail, 1112, 112, 23, 'sans', mutedInk, 'right');
  }
  c.globalAlpha = 1;
  for (const depth of [2.07, 2.11, 2.15, 2.19]) {
    line([[167, y(depth)], [1112, y(depth)]], '#734c6544', 1);
    words(depth.toFixed(2) + '%', 152, y(depth) + 6, 19, 'sans', mutedInk, 'right');
  }
  for (const [w, depth] of readings) mark(x(w), y(depth), 4.4, '#925d71ab');

  const to = refine > 0 ? joinedBins : wideBins;
  const progress = refine > 0 ? refine : widen;
  for (const bin of to) {
    const left = x(bin.left) - 8;
    const right = x(bin.right) + 8;
    c.globalAlpha = progress * 0.66;
    c.fillStyle = grad(0, 176, 0, 374, ['#ac6e8b0d', '#906b9e49', '#79557721']);
    c.fillRect(left, 176, right - left, 374);
    c.globalAlpha = 1;
  }
  // Leave the original marks visible so viewers can see what the average hides.
  const markBin = (cx: number, center: number, error: number, alpha: number) => {
    if (alpha <= 0) return;
    c.globalAlpha = alpha;
    const half = error * 3160;
    line([[cx, center - half], [cx, center + half]], '#62456d', 2);
    line([[cx - 5, center - half], [cx + 5, center - half]], '#62456d', 1.5);
    line([[cx - 5, center + half], [cx + 5, center + half]], '#62456d', 1.5);
    mark(cx, center, 5, ink);
    c.globalAlpha = 1;
  };
  const moveBin = (first: typeof wideBins[number], second: typeof wideBins[number], alpha: number) => {
    const wavelength = first.wavelength + (second.wavelength - first.wavelength) * progress;
    const depth = first.depth + (second.depth - first.depth) * progress;
    const error = first.error + (second.error - first.error) * progress;
    markBin(x(wavelength), y(depth), error, alpha);
  };
  if (refine > 0) {
    for (const bin of joinedBins) moveBin(wideBins[Math.floor(bin.start / 6)], bin, 1);
  } else {
    for (const bin of narrowBins) moveBin(bin, wideBins[Math.floor(bin.start / 6)], 1 - widen);
    for (const bin of wideBins) markBin(x(bin.wavelength), y(bin.depth), bin.error, widen);
  }

  const compare = ease(t, 13.55, 14.6);
  if (compare > 0) {
    c.globalAlpha = compare;
    const example = joinedBins.find((bin) => bin.left <= 4.05 && bin.right >= 4.05) ??
      joinedBins.reduce((near, bin) => Math.abs(bin.wavelength - 4.05) < Math.abs(near.wavelength - 4.05) ? bin : near);
    const [w, depth, error] = readings[example.start];
    const low = Math.min(x(w), x(example.wavelength));
    c.fillStyle = grad(low - 24, 210, 100, 286, ['#e5da8b13', '#e0f176b2', '#ebe18932']);
    c.fillRect(low - 22, 205, Math.abs(x(w) - x(example.wavelength)) + 44, 295);
    c.globalAlpha = 1;
    markBin(x(w), y(depth), error, compare);
    markBin(x(example.wavelength), y(example.depth), example.error, compare);
  }

  for (const w of [3.9, 4, 4.1, 4.2]) words(w.toFixed(1), x(w), 584, 20, 'sans', ink, 'center');
  words('Illustrative grouping of Webb measurements', 167, 625, 20, 'sans', mutedInk);
  words('Wavelength (μm)', 1112, 625, 22, 'sans', ink, 'right');
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
const transitRows = Object.entries(observations.light);
function detectorTrace(t: number) {
  const unfolding = ease(t, 1.4, 3.4);
  const stack = ease(t, 10.9, 14.2);
  const explainDepth = ease(t, 14.4, 15.8);
  const startX = 222;
  const endX = 1087;
  const x = (hour: number) => startX + (hour + 4.55) * (endX - startX) / 8.2;
  const main = 6;
  const plotted = [2, 4, main, 7, 9];
  c.fillStyle = grad(0, 0, 1280, 720, ['#151925', '#263044', '#51344d']);
  c.fillRect(-90, -50, 1460, 820);
  c.globalAlpha = 1 - unfolding;
  for (const [i] of transitRows.entries()) {
    const px = 182 + i * 84;
    const tint = i === main ? lime : i < main ? ice : pink;
    c.fillStyle = grad(px, 255, 0, 145, [tint + '25', tint + 'b1', tint + '19']);
    c.fillRect(px, 254, 68, 145);
    const pulse = ((t * 1.1 + i * 0.12) % 1);
    lensGlow(px + 34, 240 + 177 * pulse, 22, tint, 0.7 * Math.sin(Math.PI * pulse));
  }
  words('Wavelength bins on the detector', 640, 476, 26, 'sans', muted, 'center');
  c.globalAlpha = unfolding;
  const seen = ease(t, 2.0, 5.45);
  const baseline = ease(t, 6.1, 8.6) * (1 - stack);
  const lower = 528 + stack * 45;
  line([[startX, 163], [startX, lower], [endX, lower]], '#cfc4d780', 1.4);
  words('Relative brightness', startX, 131, 25, 'sans', muted);
  const chip = unfolding * (1 - ease(t, 11.3, 12.7));
  c.globalAlpha = chip;
  c.fillStyle = grad(908, 94, 177, 43, ['#4a4259', '#76815c', '#39384f']);
  c.fillRect(897, 94, 191, 46);
  words('4.07 μm bin', 994, 125, 22, 'sans', '#ecf3c5', 'center');
  c.globalAlpha = unfolding;
  for (const hour of [-4, -2, 0, 2]) words(String(hour), x(hour), lower + 30, 20, 'sans', muted, 'center');
  words('Hours from mid-transit', endX, 650, 20, 'sans', muted, 'right');
  for (const [index, channel] of plotted.entries()) {
    const [wave, row] = transitRows[channel];
    const active = channel === main;
    const alpha = active ? 1 : ease(t, 11.15 + index * 0.34, 12.55 + index * 0.34);
    if (alpha === 0) continue;
    const height = 286 - 229 * stack;
    const base = 221 + (178 + 79 * index - 221) * stack;
    const y = (brightness: number) => base + (1.002 - brightness) * height / 0.028;
    const steps = active ? Math.max(1, Math.ceil(seen * row.length)) : Math.max(1, Math.ceil(alpha * row.length));
    const points = row.slice(0, steps).map(([hour, brightness]) => [x(hour), y(brightness)]);
    c.globalAlpha = unfolding * alpha;
    const col = active ? lime : channel < main ? ice : pink;
    line(points, grad(startX, 0, endX - startX, 0, [col + '65', col]), active ? 2.6 : 1.9);
    for (const [px, py] of points) mark(px, py, active ? 3.5 : 2.45, col);
    if (active && seen < 1) {
      const [px, py] = points.at(-1)!;
      lensGlow(px, py, 23, lime, 0.8);
    }
    if (active && baseline > 0) {
      c.globalAlpha = baseline;
      for (const [from, to, label] of [[-4.5, -1.58, 'Before'], [-1.55, 1.55, 'In transit'], [1.58, 3.63, 'After']] as const) {
        c.fillStyle = grad(0, 168, 0, 342, ['#cbbbe91b', '#cbbbe908']);
        c.fillRect(x(from), 166, x(to) - x(from), lower - 166);
        words(label, (x(from) + x(to)) / 2, 186, 20, 'sans', muted, 'center');
      }
    }
    c.globalAlpha = alpha * unfolding * (active ? 1 : stack);
    words(Number(wave).toFixed(2) + ' μm', 1123, base + 12, 20, 'sans', col);
    const baselineSamples = row.filter(([hour]) => Math.abs(hour) > 2.2);
    const baseLevel = baselineSamples.reduce((sum, [, flux]) => sum + flux, 0) / baselineSamples.length;
    const midLevel = row.reduce((nearest, item) => Math.abs(item[0]) < Math.abs(nearest[0]) ? item : nearest)[1];
    if (active && baseline > 0) {
      const compareDepth = ease(t, 6.2, 9.45);
      const cursor = x(-2.45 + 2.45 * compareDepth);
      const height = y(baseLevel) + (y(midLevel) - y(baseLevel)) * compareDepth;
      c.globalAlpha = baseline;
      line([[x(-3.8), y(baseLevel)], [cursor, y(baseLevel)], [cursor, height]], '#e7efab', 1.7);
      lensGlow(cursor, height, 28, lime, 0.7);
    }
    const second = channel === 7;
    if ((active || second) && explainDepth > 0) {
      c.globalAlpha = active ? explainDepth : ease(t, 15.7, 16.6);
      const top = y(baseLevel);
      const bottom = y(midLevel);
      const cx = x(0) - 25;
      const color = active ? lime : pink;
      line([[cx - 6, top], [cx + 6, top]], color, 2.1);
      line([[cx, top], [cx, bottom]], color, 2.1);
      line([[cx - 6, bottom], [cx + 6, bottom]], color, 2.1);
      if (active) words('Dip depth', cx + 20, bottom + 18, 20, 'sans', lime);
    }
  }
  c.globalAlpha = 1;
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
  detectorTrace,
};

// Powell et al. Figure 2 depths and 1σ errors with the PICASO curves
// from Extended Data Figure 3, including the isolated effect of SO₂ opacity.
function miriEvidence(t: number) {
  const ink = '#30263b';
  const plum = '#674760';
  const withSulfur = '#783045';
  const withoutSulfur = '#384b79';
  const compare = ease(t, 4.8, 6.5);
  const close = ease(t, 0.15, 1.95);
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
  // The cut enters on "In the new spectrum"; these are the recorded
  // times of "seven-point-seven", "eight-point-five", and "It did."
  const spoken = [1.88, 3.13];
  const together = ease(t, 15.9, 16.64);
  const named = (i: number) => ease(t, spoken[i], spoken[i] + 0.32);
  const emphasis = (i: number) => named(i) * Math.max(together, 1 - ease(t, spoken[i] + 0.55, spoken[i] + 1.3));
  for (const [i, [left, right]] of limits.entries()) {
    c.globalAlpha = named(i) * (0.43 + 0.57 * emphasis(i));
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
  line(model.map(([w, depth]) => [x(w), y(depth)]), withSulfur, 5);
  c.setLineDash([12, 9]);
  line(model.map(([w, , depth]) => [x(w), y(depth)]), withoutSulfur, 3.1);
  c.setLineDash([]);
  c.globalAlpha = 1;
  for (const [w, depth, error] of miri.measurements) {
    if (w < lo || w > hi) continue;
    const band = w === 7.625 ? 0 : w === 8.625 ? 1 : undefined;
    const closeLook = band === undefined ? 0 : ease(t, 5.8 + band * 2.3, 6.9 + band * 2.3) *
      (1 - ease(t, 7.7 + band * 2.3, 8.25 + band * 2.3));
    const showGuides = band === undefined ? 0 : Math.max(together, closeLook);
    if (showGuides > 0) {
      const after = model.findIndex(([wavelength]) => wavelength > w);
      if (after > 0) {
        const left = model[after - 1];
        const right = model[after];
        const pos = (w - left[0]) / (right[0] - left[0]);
        const predicted = [left[1] + pos * (right[1] - left[1]), left[2] + pos * (right[2] - left[2])];
        c.globalAlpha = showGuides;
        lensGlow(x(w), y(depth), 23, lime, 0.58);
        for (const [i, prediction] of predicted.entries()) {
          const off = i ? 13 : -13;
          const tone = i ? withoutSulfur : withSulfur;
          line([[x(w) + off, y(depth)], [x(w) + off, y(prediction)]], tone + 'c7', 2.3);
          line([[x(w) + off - 4, y(prediction)], [x(w) + off + 4, y(prediction)]], tone, 2.5);
        }
        c.globalAlpha = 1;
      }
    }
    line([[x(w), y(depth - error)], [x(w), y(depth + error)]], plum + 'ad', 2.2);
    mark(x(w), y(depth), 5.6, ink);
  }
  c.restore();
  for (const [i, [left, right]] of limits.entries()) {
    c.globalAlpha = named(i);
    const middle = x((left + right) / 2);
    c.fillStyle = grad(middle - 72, 0, 144, 0, ['#e6d2bb', lime + 'bf', '#e6d2bb']);
    c.globalAlpha *= emphasis(i);
    c.fillRect(middle - 74, 121, 148, 35);
    c.globalAlpha = named(i);
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
  c.setLineDash([12, 9]);
  line([[723, 614], [767, 614]], withoutSulfur, 3);
  c.setLineDash([]);
  words('Same model without SO₂', 783, 621, 21, 'sans', withoutSulfur);
  c.globalAlpha = 1;
  words('Wavelength (μm)', 1124, 583, 20, 'sans', ink, 'right');
}
evidenceScenes.confirm = miriEvidence;
evidenceScenes.residual = (t) => {
  residualInset(6.84 + t);
  const widen = ease(t, 0.18, 0.92);
  if (!widen) return;
  c.globalAlpha = widen;
  c.fillStyle = grad(0, 0, 1280, 720, ['#151426', '#2d243e', '#362b44']);
  c.fillRect(-90, -50, 1460, 820);
  c.globalAlpha = 1;
  if (widen > 0.55) fit(10.6 + t, true);
};

// Schematic model family. Matching all three bands narrows the set of
// plausible atmospheres, even when several settings fit the short segment.
function abundanceRange(t: number) {
  const broad = ease(t, 0.4, 3.5);
  const constrain = ease(t, 4.45, 7.9);
  const start = 172;
  const width = 938;
  const bottom = 527;
  const shown = width * (0.44 + 0.56 * broad);
  c.fillStyle = grad(0, 0, 1280, 720, ['#eee0ce', '#e3c2cc', '#c4b9d7']);
  c.fillRect(-90, -50, 1460, 820);
  const ink = '#392b46';
  words('Which atmospheres fit?', 173, 108, 35, 'sans', ink);
  words('Extra light blocked', 173, 148, 21, 'sans', '#6b4e69');
  const bands = [
    { position: 0.24, label: '4.05 μm' },
    { position: 0.66, label: '7.7 μm' },
    { position: 0.84, label: '8.5 μm' },
  ];
  for (const [i, { position, label }] of bands.entries()) {
    c.globalAlpha = i ? broad : 1;
    const x = start + position * width;
    c.fillStyle = grad(0, 170, 0, 350, ['#ac749528', '#b091ac80', '#ad849117']);
    c.fillRect(x - 41, 166, 82, 360);
    words(label, x, 572, 22, 'sans', ink, 'center');
  }
  c.globalAlpha = 1;
  const peak = (u: number, position: number, spread: number) => Math.exp(-(((u - position) / spread) ** 2));
  for (let i = 0; i < 7; i++) {
    const offset = i - 3;
    const compatible = Math.abs(offset) < 2;
    c.globalAlpha = compatible ? 0.7 : 0.64 * (1 - constrain) + 0.12 * constrain;
    if (!compatible) c.setLineDash([8, 8]);
    const points = Array.from({ length: 181 }, (_, j) => {
      const u = j / 180 * shown / width;
      const depth = 0.43 * peak(u, 0.24, 0.048) +
        (0.49 + offset * 0.099) * peak(u, 0.66, 0.073) +
        (0.31 + offset * 0.084) * peak(u, 0.84, 0.051);
      return [start + u * width, bottom - 59 - depth * 290 - 3.4 * offset];
    });
    line(points, compatible ? '#7c4566' : '#746694', compatible ? 3.1 : 1.95);
    c.setLineDash([]);
  }
  c.globalAlpha = 1;
  line([[start, 157], [start, bottom], [start + shown, bottom]], '#67516d', 1.6);
  words('Schematic model family', start, 632, 21, 'sans', '#654e68');
  c.globalAlpha = ease(t, 6.1, 7.4);
  words('A range still fits all three bands', start + width, 632, 23, 'sans', ink, 'right');
  c.globalAlpha = 1;
}
evidenceScenes.abundanceRange = abundanceRange;

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
  const zoom = ease(t, 7.5, 10.6);
  const crop = ease(t, 2.75, 4.8);
  const low = 0.6 + 3.24 * crop + 0.06 * zoom;
  const high = 5.3 - 1.04 * crop - 0.09 * zoom;
  const x = (w: number) => 185 + (w - low) * 928 / (high - low);
  const spectra = [
    { rows: g395h, color: ice, name: 'NIRSpec G395H · Fine dispersion', start: 0, base: 305, coverage: [[2.73, 3.72], [3.82, 5.15]] },
    { rows: prismSpectrum, color: pink, name: 'NIRSpec PRISM · Broad coverage', start: 1, base: 542, coverage: [[0.6, 5.3]] },
  ];
  c.fillStyle = grad(0, 0, 1280, 720, ['#101929', '#253052', '#482d48']);
  c.fillRect(-90, -50, 1460, 820);
  const chart = ease(t, 4.8, 7.1);
  const match = ease(t, 7.8, 10.0);
  const guide = ease(t, 0.1, 0.8);
  words('Two Webb observations', 1113, 110, 23, 'sans', '#e2d7e7', 'right');
  for (const { rows, color, name, start, base, coverage } of spectra) {
    const enter = ease(t, start, start + 0.8);
    c.save();
    c.globalAlpha = enter;
    words(name, 185, base - 173, 27, 'sans', color);
    const depthScale = 710 + 410 * zoom;
    const depthFloor = 2.05 + 0.026 * zoom;
    const y = (depth: number) => base - (depth - depthFloor) * depthScale;
    c.globalAlpha = enter * chart;
    for (const depth of [2.05, 2.1, 2.15, 2.2, 2.25]) {
      if (y(depth) < base - 152 || y(depth) > base + 14) continue;
      line([[185, y(depth)], [1113, y(depth)]], '#bfb4d431', 1.1);
      words(depth.toFixed(2) + '%', 169, y(depth) + 6, 17, 'sans', muted, 'right');
    }
    c.beginPath();
    c.rect(185, base - 149, 928, 166);
    c.clip();
    c.globalAlpha = enter * (1 - crop);
    for (const [begin, end] of coverage) {
      const from = x(begin);
      const width = x(end) - from;
      c.fillStyle = grad(0, base - 109, 0, 84, [color + '16', color + 'bf', color + '36']);
      c.fillRect(from, base - 109, width, 74);
      for (let i = 0; i < 36; i++) {
        const offset = (t * 0.19 + i * 0.618) % 1;
        lensGlow(from + width * offset, base - 71, 16, color, 0.43);
      }
    }
    c.globalAlpha = enter * match;
    const half = 0.041;
    c.fillStyle = grad(0, base - 149, 0, 166, ['#b7cb6920', '#b7cb6950', '#b7cb6917']);
    c.fillRect(x(4.05 - half), base - 149, x(4.05 + half) - x(4.05 - half), 166);
    const showBaseline = ease(t, 9.1, 10.4);
    const side = rows.filter(([w]) => (w >= 3.91 && w < 3.985) || (w > 4.105 && w <= 4.165));
    const level = side.reduce((sum, [, depth]) => sum + depth, 0) / side.length;
    c.globalAlpha = enter * showBaseline;
    c.setLineDash([10, 7]);
    line([[185, y(level)], [1113, y(level)]], color + 'c0', 1.5);
    c.setLineDash([]);
    c.globalAlpha = enter;
    for (const [i, [w, depth, error]] of rows.entries()) {
      const cx = x(w);
      const resting = base - 68;
      const py = resting + (y(depth) - resting) * chart;
      const width = rows === g395h ? 9 : 19;
      const focus = ease(t, 8.65 + i * 0.009, 9.15 + i * 0.009) * (Math.abs(w - 4.05) < 0.042 ? 1 : 0);
      c.globalAlpha = enter * crop * (1 - chart);
      c.fillStyle = grad(cx, resting - 29, 0, 58, [color + '35', color, color + '23']);
      c.fillRect(cx - width / 2, resting - 28, width, 56);
      c.globalAlpha = enter * chart;
      line([[cx, py - error * depthScale * chart], [cx, py + error * depthScale * chart]], focus > 0.5 ? lime : color + '82', 1.7);
      mark(cx, py, rows === g395h ? 3.2 : 5, focus > 0.5 ? lime : color);
    }
    c.restore();
  }
  c.globalAlpha = guide;
  c.setLineDash([4, 7]);
  line([[x(4.05), 154], [x(4.05), 553]], lime, 2);
  c.setLineDash([]);
  words('4.05 μm', x(4.05), 591, 26, 'sans', lime, 'center');
  c.globalAlpha = 1 - crop;
  line([[185, 555], [1113, 555]], '#c6c0dc80', 1.2);
  for (const w of [1, 2, 3, 5]) if (w >= low && w <= high) words(String(w), x(w), 591, 20, 'sans', muted, 'center');
  c.globalAlpha = chart;
  for (const w of [3.9, 4, 4.1, 4.2]) {
    if (w < low - 1e-7 || w > high) continue;
    words(w.toFixed(1), x(w), 591, 20, 'sans', muted, 'center');
  }
  words('Wavelength (μm)', 1113, 635, 21, 'sans', muted, 'right');
  c.globalAlpha = ease(t, 9.1, 10.4);
  c.setLineDash([9, 6]);
  line([[185, 632], [224, 632]], muted, 1.5);
  c.setLineDash([]);
  words('Local baseline from side bins', 239, 640, 20, 'sans', muted);
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
function residualInset(t: number) {
  const ink = '#342743';
  c.fillStyle = grad(0, 0, 1280, 720, ['#f9deca', '#dbc5d7', '#c8bbd6']);
  c.fillRect(-90, -50, 1460, 820);
  const x = (w: number) => 265 + (w - 3.95) * 3770;
  const y = (residual: number) => 478 - residual * 4050;
  line([[191, 478], [1070, 478]], '#6a4f71', 5);
  const group = ease(t, 2.92, 3.55);
  const nearby = observations.spectrum.filter(([w]) => w > 3.95 && w < 4.14);
  const initial = nearby.findIndex(([w]) => w > 4.01);
  for (const [i, [w, depth, error]] of nearby.entries()) {
    const diff = depth - modelAt(w);
    const highlight = w > 3.98 && w < 4.06 && diff > 0;
    const show = i === initial ? ease(t, 0.22, 0.8) : ease(t, 2.92 + Math.abs(i - initial) * 0.12, 3.42 + Math.abs(i - initial) * 0.12);
    if (!show) continue;
    c.globalAlpha = show;
    const tint = highlight ? '#5c781e' : '#664d6c';
    const cx = x(w);
    const center = 478 + (y(diff) - 478) * show;
    line([[cx, 478], [cx, center]], tint + '70', 4.3);
    line([[cx, center - error * 4050 * show], [cx, center + error * 4050 * show]], tint, 6);
    mark(cx, center, 12, tint);
  }
  c.globalAlpha = 1 - ease(t, 2.56, 2.9);
  words('One point above the model', 640, 153, 61, 'sans', ink, 'center');
  c.globalAlpha = group;
  words('Several neighboring bins', 640, 153, 66, 'sans', ink, 'center');
  c.globalAlpha = 1;
  words('Observed − model', 640, 633, 53, 'sans', ink, 'center');
}
evidenceScenes.residualInset = residualInset;

function inference(t: number) {
  const divide = ease(t, 2.3, 4.1);
  const left = 169 - 28 * divide;
  const chartWidth = 947 - 522 * divide;
  const x = (w: number) => left + (w - 3.87) * chartWidth / 0.42;
  const y = (depth: number) => 510 - (depth - 2.066) * 1510;
  const axisEnd = x(4.29);
  c.fillStyle = grad(0, 0, 1280, 720, ['#182133', '#3b364d', '#583446']);
  c.fillRect(-90, -50, 1460, 820);
  const points = observations.spectrum.filter(([w]) => w >= 3.87 && w <= 4.28);
  const show = ease(t, 0, 1.7);
  line([[x(3.87), 179], [x(3.87), 524], [axisEnd, 524]], '#e4d0e491', 1.4);
  for (const depth of [2.08, 2.16, 2.24, 2.28]) {
    line([[left, y(depth)], [axisEnd, y(depth)]], '#d8c7e531', 1.1);
    words(depth.toFixed(2) + '%', left - 13, y(depth) + 6, 17, 'sans', muted, 'right');
  }
  words('Webb measured the missing light', x(3.87), 129, 27, 'sans', '#f3e2f2');
  for (const [i, [w, depth, error]] of points.entries()) {
    if (i / points.length > show) continue;
    const tint = Math.abs(w - 4.05) < 0.044 ? lime : ice;
    line([[x(w), y(depth - error)], [x(w), y(depth + error)]], tint, 1.75);
    mark(x(w), y(depth), 4.4, tint);
  }
  words('4.05 μm', x(4.05), 565, 24, 'sans', lime, 'center');

  c.globalAlpha = divide;
  words('Chemistry explains the measurement', 654, 129, 27, 'sans', '#f3e2f2');
  c.setLineDash([6, 9]);
  line([[610, 163], [610, 556]], '#d4b8cb80', 1.6);
  c.setLineDash([]);
  const stage = ease(t, 3.39, 5.4);
  lensGlow(938, 360, 190, '#bc647f', stage * 0.72);
  drawMolecule(c, 'SO2', [938, 367], 1, t);
  const passes = (t * 0.9) % 1;
  const start = 694;
  const end = 875;
  const beam = Array.from({ length: 65 }, (_, i) => {
    const u = i / 64;
    return [start + u * (end - start), 285 + 19 * Math.sin(u * 34 - t * 8)];
  });
  c.globalAlpha = divide * stage;
  line(beam, grad(start, 285, end - start, 0, [ice + '45', ice]), 3.4);
  const head = beam[Math.floor(passes * 64)];
  lensGlow(head[0], head[1], 24, ice, 0.75);
  words('Ultraviolet from the star', 687, 234, 23, 'sans', ice);
  words('SO₂ production · modeled', 938, 544, 25, 'sans', '#f5cbc9', 'center');
  c.globalAlpha = 1;
}
evidenceScenes.inference = inference;

function finalPoints(t: number) {
  heading('The bump beside the peak');
  const points = observations.spectrum.filter(([w]) => w >= 3.73 && w <= 4.52);
  const f = ease(t, 2, 4.1);
  const xAt = (w: number) => 164 + (w - 3.73) * 1185;
  const yAt = (depth: number) => 516 - (depth - 2.07) * 1110;
  const opacity = c.globalAlpha;
  c.fillStyle = grad(0, 0, 1280, 720, ['#141126ce', '#201735ef', '#29203ada']);
  c.fillRect(-90, -50, 1460, 820);
  for (const [w, color] of [[4.05, lime], [4.3, pink]] as const) {
    c.globalAlpha = opacity * (w === 4.05 ? 0.25 + 0.62 * f : 0.66 - 0.23 * f);
    c.fillStyle = grad(0, 171, 0, 368, [color + '0b', color + '36', color + '11']);
    c.fillRect(xAt(w) - 43, 174, 86, 367);
    line([[xAt(w), 539], [xAt(w), 566]], color, 1.4);
  }
  for (const [w, p, e] of points) {
    const tall = Math.abs(w - 4.3) < 0.09;
    const x = xAt(w),
      y = yAt(p),
      hi = w >= 3.99 && w <= 4.05;
    c.globalAlpha = opacity * (hi ? 0.84 + 0.16 * f : tall ? 1 : 0.83 - 0.29 * f);
    line(
      [
        [x, y - e * 1110],
        [x, y + e * 1110],
      ],
      hi ? lime : ice,
      2,
    );
    mark(x, y, hi ? 5.5 : tall ? 5 : 4, hi ? lime : pink);
  }
  c.globalAlpha = opacity;
  line([[xAt(3.73), 542], [xAt(4.52), 542]], '#e0cbe594', 1.25);
  words('4.05 μm', xAt(4.05), 598, 26, 'sans', lime, 'center');
  words('4.3 μm', xAt(4.3), 598, 26, 'sans', muted, 'center');
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
