// Observed points are from the ERS PRISM public release. Orbital geometry,
// atmosphere thickness, molecules and illustrative counting examples are schematic.
import { atmosphericLimb, transmittedLight } from '../atmosphere.ts';
import { drawMolecule, type Molecule } from '../molecules.ts';
import { evidenceScenes } from './wasp39-sequences.ts';
import { coverHook, field, showpieces } from './wasp39-showpieces.ts';
import { makeBeats } from './wasp39-beats.ts';
import data from './wasp39-data.json';
import {
  faces,
  canvas,
  c,
  W,
  H,
  ice,
  pink,
  muted,
  lime,
  plate,
  grad,
  words,
  line,
  lensGlow,
  ring,
} from './stage.ts';
import { directFrame, continuous, cue, type Cue } from './direction.ts';

const tau = Math.PI * 2;
const cubic = (t: number) => t * t * (3 - 2 * t);
function noise(x: number, y: number) {
  const hash = (a: number, b: number) => {
    const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const i = Math.floor(x),
    j = Math.floor(y),
    u = cubic(x - i),
    v = cubic(y - j);
  return (
    (hash(i, j) * (1 - u) + hash(i + 1, j) * u) * (1 - v) +
    (hash(i, j + 1) * (1 - u) + hash(i + 1, j + 1) * u) * v
  );
}
function globe(star: boolean) {
  const size = star ? 720 : 1280,
    img = document.createElement('canvas');
  img.width = img.height = size;
  const ctx = img.getContext('2d')!,
    px = ctx.createImageData(size, size);
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) {
      const x = ((i + 0.5) * 2) / size - 1,
        y = ((j + 0.5) * 2) / size - 1,
        r = x * x + y * y;
      if (r >= 1) continue;
      const z = Math.sqrt(1 - r),
        lon = Math.atan2(x, z),
        lat = Math.asin(y);
      const swirl = noise(3 * lon + 4, 4 * lat) + 0.42 * noise(8 * lon, 12 * lat);
      const dust = noise(79 * lon + 5, 90 * lat + 7);
      const bands = Math.sin(21 * lat + 4 * swirl + 0.8 * Math.sin(6 * lon + lat)) * 0.5 + 0.5;
      const idx = (j * size + i) * 4;
      if (star) {
        const k = (0.58 + 0.42 * Math.pow(z, 0.55)) * (0.91 + 0.12 * dust + 0.04 * swirl);
        [255 * k, 202 * k * k, 151 * k * k * k, 255].forEach((v, q) => (px.data[idx + q] = v));
      } else {
        const light = Math.pow(Math.max(0, -0.81 * x - 0.33 * y + 0.32 * z), 0.7);
        const rim = Math.pow(1 - z, 3.7) * (0.37 + 0.55 * light);
        const shear = 5 * lat + 0.48 * swirl + 0.1 * Math.sin(4 * lon + lat);
        const wisps = noise(lon * 11 + 4, shear * 26) + 0.48 * noise(lon * 26, shear * 63);
        const veils = Math.sin(shear * 56 + 3.6 * wisps) * 0.026;
        const v = light * (0.53 + 0.21 * bands + 0.18 * swirl + 0.12 * wisps + veils + 0.04 * dust);
        [
          14 + 199 * v + 116 * rim,
          14 + 113 * v + 97 * rim,
          29 + 88 * v + 166 * rim,
          255 * Math.min(1, (1 - Math.sqrt(r)) * size * 0.65),
        ].forEach((k, q) => (px.data[idx + q] = k));
      }
    }
  ctx.putImageData(px, 0, 0);
  return img;
}
const gas = globe(false),
  sun = globe(true);
function body(x: number, y: number, r: number, star = false) {
  lensGlow(x, y, r * 1.37, star ? '#df896d' : '#716693', star ? 0.51 : 0.18);
  c.drawImage(star ? sun : gas, x - r, y - r, 2 * r, 2 * r);
}
// One sans family for every label and card; equations keep their italic serif.
faces.title = (size) => '300 ' + size + 'px "Helvetica Neue", Arial, sans-serif';
faces.mono = (size) => '500 ' + Math.round(size * 1.08) + 'px "Helvetica Neue", Arial, sans-serif';
// Distinct looks for comparison planets reuse the banded gas texture.
function globeLook(x: number, y: number, r: number, look: 'wasp' | 'saturn' | 'jupiter' | 'star' = 'wasp') {
  if (r <= 0.5) return;
  if (look === 'star' || look === 'wasp') return body(x, y, r, look === 'star');
  const ring = (front: boolean) => {
    c.save();
    c.translate(x, y);
    c.rotate(-0.28);
    c.strokeStyle = grad(-2.2 * r, 0, 4.4 * r, 0, ['#e9d2a855', '#f3e0bd', '#c9a77a', '#e9d2a855']);
    for (const [k, w] of [
      [1.75, 7],
      [2.05, 4],
    ]) {
      c.lineWidth = (w * r) / 66;
      c.beginPath();
      c.ellipse(0, 0, k * r, 0.38 * k * r, 0, front ? 0 : Math.PI, front ? Math.PI : tau);
      c.stroke();
    }
    c.restore();
  };
  lensGlow(x, y, r * 1.37, look === 'saturn' ? '#d9b98a' : '#c9a080', 0.2);
  if (look === 'saturn') ring(false);
  c.save();
  c.filter =
    look === 'jupiter'
      ? 'sepia(0.55) hue-rotate(-10deg) saturate(1.2) brightness(1.3) contrast(1.15)'
      : 'sepia(0.85) saturate(0.55) brightness(1.45)';
  c.drawImage(gas, x - r, y - r, 2 * r, 2 * r);
  c.restore();
  if (look === 'saturn') ring(true);
}
// Shots carry no slide titles; Titan names what is on screen.
function heading(_s: string) {}
function path(fn: (f: number) => number[], count = 100) {
  return Array.from({ length: count + 1 }, (_, i) => fn(i / count));
}
const titles: Record<string, string> = {
  hero: 'WASP-39 b',
  title: 'The Bump Beside the Peak',
  year: 'A four-day year',
  size: 'Wider than Jupiter',
  distance: '700 light-years',
  ring: 'The atmospheric rim',
  puff: 'A deeper layer',
  cloud: 'The cloud deck',
  edges: 'Two edges of one world',
};
function planet(t: number, k: string) {
  if (k === 'year') {
    heading(titles[k]);
    const x = 643,
      y = 377;
    const orb = path((f) => [x + 447 * Math.cos(tau * f), y + 139 * Math.sin(tau * f)], 150);
    line(orb, grad(180, y, 880, 40, [ice, '#695f88', pink]), 2);
    const a = t * 0.43 - 0.7,
      py = y + 139 * Math.sin(a);
    if (py < y) body(x + 447 * Math.cos(a), py, 37);
    body(x, y, 110, true);
    if (py >= y) body(x + 447 * Math.cos(a), py, 37);
    return;
  }
  if (k === 'distance') {
    const n = 90;
    for (let i = 0; i < n; i++) {
      const z = (i / n + t * 0.07) % 1,
        a = i * 2.4;
      const x = 640 + 880 * z * z * Math.cos(a),
        y = 361 + 480 * z * z * Math.sin(a);
      lensGlow(x, y, 2 + 7 * z, ice, 0.5);
    }
    lensGlow(640, 361, 56 + 10 * (1 - Math.exp(-t / 6)), pink, 0.85);
    words(titles[k], 65, 603, 51, 'title');
    return;
  }
  if (k === 'size' || k === 'puff') {
    heading(titles[k]);
    const rr = k === 'size' ? 127 : 67;
    body(370, 409, rr);
    body(867, 409, 173);
    for (const [x, r] of [
      [370, rr],
      [867, 173],
    ]) {
      atmosphericLimb(c, [x, 409], r, k === 'size' ? 3 : x === 370 ? 3 : 11);
    }
    if (k === 'size') {
      words('Jupiter', 370, 627, 22, 'mono', muted, 'center');
      words('WASP-39 b', 867, 627, 22, 'mono', muted, 'center');
    }
    return;
  }
  if (k === 'title' || k === 'hero') {
    const pull = k === 'hero' ? cubic(Math.max(0, Math.min(1, (t - 3.3) / 6))) : 0;
    const r = 340 + 5 * Math.sin(t * 0.17) - 124 * pull;
    const x = 969 - 100 * pull;
    body(x, 404, r);
    if (pull > 0) atmosphericLimb(c, [x, 404], r, 9 + 8 * pull);
    words(titles[k], 62, 391, k === 'hero' ? 64 : 50, 'title');
    return;
  }
  const r = 280,
    x = 755,
    y = 410;
  body(x, y, r);
  if (k === 'edges') {
    for (const [a, b, color] of [
      [-0.55, 0.55, pink],
      [Math.PI - 0.55, Math.PI + 0.55, ice],
    ] as const) {
      line(
        path((f) => [x + (r + 7) * Math.cos(a + (b - a) * f), y + (r + 7) * Math.sin(a + (b - a) * f)]),
        color,
        6,
      );
      for (let j = 0; j < 3; j++) {
        const f = (t * 0.22 + j / 3) % 1,
          a2 = a + (b - a) * f;
        lensGlow(x + (r + 7) * Math.cos(a2), y + (r + 7) * Math.sin(a2), 22, color, Math.sin(Math.PI * f));
      }
    }
  } else {
    if (k === 'ring') {
      // "At wavelengths the gas absorbs strongly ... reaches higher" (+2.5 s),
      // "pass through more freely ... closer to the center" (+7.2 s).
      for (const [extra, color, at, name] of [
        [26, pink, 2.2, 'strongly absorbed light'],
        [6, ice, 7, 'light that passes freely'],
      ] as const) {
        const a = Math.min(1, Math.max(0, (t - at) / 0.8));
        if (a <= 0) continue;
        c.save();
        c.globalAlpha = a * (0.75 + 0.25 * Math.sin(t * 2 + extra));
        c.setLineDash([10, 9]);
        c.lineDashOffset = -t * 12;
        c.strokeStyle = color;
        c.lineWidth = 2.5;
        c.beginPath();
        c.arc(x, y, r + extra, 0, tau);
        c.stroke();
        c.restore();
        c.globalAlpha = a;
        words(name, x - r - 40, y + (extra > 10 ? -120 : 120), 22, 'mono', color, 'right');
        c.globalAlpha = 1;
      }
    }
    const height = k === 'cloud' ? 12 : 8;
    atmosphericLimb(c, [x, y], r, height, k === 'cloud');
    const altitude = k === 'cloud' ? 3 : 10;
    transmittedLight(
      c,
      {
        start: [38, y - r - altitude],
        end: [1210, y - r - altitude],
        center: [x, y],
        radius: r,
        scaleHeight: height,
        extinction: k === 'cloud' ? 0.048 : 0.008,
        tint: '#f1c4ad',
        period: 3.7,
        phase: 0.24,
      },
      t,
    );
  }
  heading(titles[k]);
}
function crossing(t: number, k: string) {
  const xx =
    k === 'ingress'
      ? 328 + Math.min(145, t * 15)
      : k === 'exit'
        ? 865 + Math.min(170, t * 16)
        : 270 + ((t * 49) % 760);
  const r = 226;
  body(640, 378, r, true);
  const p = 63;
  const halo = c.createRadialGradient(xx, 387, p - 3, xx, 387, p + 9);
  halo.addColorStop(0, '#1a1126');
  halo.addColorStop(0.56, '#805f7d');
  halo.addColorStop(1, '#99778300');
  c.fillStyle = halo;
  c.fillRect(xx - p - 10, 314, p * 2 + 20, 150);
  c.fillStyle = grad(xx - p, 325, p * 2, 120, ['#322034', '#0d0c17', '#191322']);
  c.beginPath();
  c.arc(xx, 387, p, 0, tau);
  c.fill();
  heading(k === 'ingress' ? 'First contact' : k === 'exit' ? 'Last contact' : 'A transit');
}
function rays(t: number, k: string) {
  const vertical = false,
    cloudy = k === 'cloudray',
    breathing = k === 'layers';
  const radius = 790,
    center = [815, 1164] as const,
    top = center[1] - radius;
  const swing = breathing ? 0.5 - 0.5 * Math.cos(t * 0.9) : 0;
  const height = cloudy ? 22 : breathing ? 11 + 22 * swing : 16;
  if (breathing) {
    words(swing > 0.5 ? 'warmer · layers spread higher' : 'cooler · layers sit lower', 1220, 640, 24, 'mono', swing > 0.5 ? pink : ice, 'right');
  }
  body(...center, radius);
  atmosphericLimb(c, center, radius, height, cloudy);
  const extinction = cloudy ? 0.046 : 0.012;
  if (vertical) {
    const x = 683;
    transmittedLight(
      c,
      {
        center,
        radius,
        scaleHeight: height,
        extinction,
        start: [x, 129],
        end: [x, 470],
        tint: '#f5ceb9',
        period: 2.7,
        phase: 0.15,
      },
      t,
    );
  } else {
    // One reference beam passes above the haze; the lower beam samples the gas.
    for (const [altitude, tint, phase] of [
      [58, '#bec6f6', 0.55],
      [cloudy ? 4 : 14, '#ffcaac', 0.19],
    ] as const) {
      const y = top - altitude;
      transmittedLight(
        c,
        {
          center,
          radius,
          scaleHeight: height,
          extinction,
          start: [48, y],
          end: [1238, y],
          tint,
          period: 3.4,
          phase,
        },
        t,
      );
    }
  }
  heading(vertical ? 'Looking straight down' : cloudy ? 'An opaque layer' : 'Grazing starlight');
}

function cloudDeck(t: number) {
  c.fillStyle = grad(0, 0, W, H, ['#211b35', '#704652', '#28233f']);
  c.fillRect(-90, -50, W + 180, H + 100);
  const cloud = Math.min(1, Math.max(0, (t - 0.55) / 1.55));
  const cutoff = 410 - 105 * cubic(cloud);
  const layers = [259, 315, 372, 429, 486];
  words('Clear limb', 345, 135, 30, 'sans', ice, 'center');
  words('High cloud deck', 935, 135, 30, 'sans', pink, 'center');
  for (const [i, cx] of [345, 935].entries()) {
    const left = cx - 248;
    const right = cx + 248;
    c.save();
    c.beginPath();
    c.rect(left, 167, 496, 376);
    c.clip();
    c.fillStyle = grad(0, 177, 0, 366, ['#1f203766', '#9570a1aa', '#d98783ee']);
    c.fillRect(left, 174, 496, 369);
    for (const altitude of layers) {
      const color = altitude < 325 ? ice : '#f6cdb6';
      const area = path((u) => [left + u * 496, altitude + 45 * (2 * u - 1) ** 2]);
      line(area, color + '42', 2.2);
    }
    if (i) {
      c.fillStyle = grad(0, cutoff, 0, 220, ['#ad6e84', '#57354a', '#301e3a']);
      c.beginPath();
      path((u) => [left + u * 496, cutoff + 22 + 12 * Math.sin(u * 17 + t * 0.45) + 8 * Math.sin(u * 28)]).forEach(([x, y], idx) => idx ? c.lineTo(x, y) : c.moveTo(x, y));
      c.lineTo(right, 545);
      c.lineTo(left, 545);
      c.fill();
    }
    for (const [j, altitude] of [230, 350, 434].entries()) {
      const blocked = i === 1 && altitude > cutoff + 21;
      const end = blocked ? cx - 88 - (altitude - cutoff) * 0.75 : right;
      const progress = Math.min(1, Math.max(0, (t - j * 0.34) / 1.05));
      const tip = left + (end - left) * progress;
      line([[left, altitude], [tip, altitude]], grad(left, 0, Math.max(1, tip - left), 0, ['#ded5ff61', '#fee6bf']), 2.8);
      if (blocked) {
        c.setLineDash([3, 8]);
        line([[end + 11, altitude], [right, altitude]], '#efd6dd37', 2.2);
        c.setLineDash([]);
      }
      const traveling = (t * 0.55 + j * 0.2) % 1;
      lensGlow(left + (tip - left) * traveling, altitude, 18, '#ffe1b7', 0.65);
    }
    c.restore();
    words(i ? 'Only the upper path reaches Webb' : 'Paths sample several heights', cx, 597, 25, 'sans', i ? '#f5c6bb' : ice, 'center');
  }
  words('Atmospheric cross-sections · schematic', 640, 656, 19, 'sans', '#e7cfdb', 'center');
}

function cloudComparison(t: number) {
  const phase = (start: number, end: number) => cubic(Math.max(0, Math.min(1, (t - start) / (end - start))));
  const move = phase(0, 2.35);
  const labels = phase(1.5, 2.8);
  cloudDeck(4.5 + t);
  c.globalAlpha = move;
  c.fillStyle = grad(0, 0, W, H, ['#282034', '#544058', '#292339']);
  c.fillRect(-90, -50, W + 180, H + 100);
  const start = 180;
  const span = 918;
  const zoom = phase(2.15, 4.35);
  const axis = 528;
  line([[start, 174], [start, axis], [start + span, axis]], '#e8cbe59c', 1.6);
  c.globalAlpha = phase(1.57, 2.24);
  words('Extra light blocked', start, 146, 22, 'sans', muted);
  words('Wavelength', start + span, 566, 21, 'sans', muted, 'right');
  c.globalAlpha = 1;
  for (const [i, tint] of [ice, pink].entries()) {
    const draw = phase(0.12 + i * 0.39, 1.76 + i * 0.47);
    c.globalAlpha = draw;
    const points = path((u) => {
      const w = u * draw;
      const width = 0.18 - zoom * 0.055 + 0.004 * i;
      const shape = Math.exp(-(((w - 0.49) / width) ** 2));
      return [start + w * span, axis - 91 - 154 * shape - i * (15 - 11 * zoom) * (1 - shape * 0.9)];
    });
    if (i > 0) c.setLineDash([10, 9]);
    line(points, tint, 3.7);
    c.setLineDash([]);
    if (draw < 1) {
      const [x, y] = points.at(-1)!;
      lensGlow(x, y, 29, tint, 0.78);
    }
    c.globalAlpha = labels;
    line([[205 + 525 * i, 604], [244 + 525 * i, 604]], tint, 3.3);
    words(i ? 'More gas above a high cloud deck' : 'Less gas, clear limb', 259 + 525 * i, 611, 21, 'sans', tint);
  }
  c.globalAlpha = labels;
  words('One small part of the spectrum · schematic', 640, 658, 19, 'sans', muted, 'center');
  c.globalAlpha = 1;
}

const plotX = 139,
  plotW = 1010,
  yBottom = 591,
  plotH = 387;
const chartKeys = ['data', 'peak', 'shoulder', 'bins', 'unknown', 'co2', 'sulfur', 'pretty'];
const zoomed = (k?: string) => k === 'shoulder' || k === 'bins' || k === 'sulfur';
const mix = (a: number, b: number, f: number) => a + (b - a) * f;
function chart(t: number, k: string) {
  // A cut between chart views is one continuous zoom of the same axes.
  const from = cue.prev && chartKeys.includes(cue.prev) ? cue.prev : undefined;
  const move = from ? Math.min(1, t / 1.6) : 1,
    e = move * move * (3 - 2 * move);
  const z = mix(zoomed(from ?? k) ? 1 : 0, zoomed(k) ? 1 : 0, e);
  const zoom = z > 0.5;
  const min = mix(3.38, 3.88, z),
    max = mix(5.06, 4.2, z),
    lo = mix(2.06, 2.063, z),
    hi = mix(2.29, 2.18, z);
  // Points arrive left to right the first time the plot appears.
  const build = from ? 1 : Math.min(1, t / 1.8);
  const X = (w: number) => plotX + ((w - min) / (max - min)) * plotW,
    Y = (p: number) => yBottom - ((p - lo) / (hi - lo)) * plotH;
  const title: Record<string, string> = {
    data: 'The measured spectrum',
    peak: 'The large peak',
    shoulder: 'The little bump',
    bins: 'Neighboring measurements',
    co2: 'Carbon dioxide',
    sulfur: 'Sulfur dioxide',
    unknown: 'Two features',
  };
  heading(title[k]);
  const aim = (q?: string) => (q === 'co2' || q === 'peak' ? 4.34 : 4.045);
  const target = mix(aim(from ?? k), aim(k), e);
  const band = mix(0.052, 0.035, z);
  c.save();
  c.beginPath();
  c.rect(plotX - 4, yBottom - plotH - 10, plotW + 8, plotH + 14);
  c.clip();
  c.fillStyle = grad(0, yBottom - plotH, 0, plotH, [ice + '05', ice + '28']);
  c.fillRect(X(target - band), yBottom - plotH, X(target + band) - X(target - band), plotH);
  c.restore();
  line(
    [
      [plotX, yBottom - plotH],
      [plotX, yBottom],
      [plotX + plotW, yBottom],
    ],
    '#c4b5cd88',
  );
  for (const [w, wide] of [3.5, 4, 4.5, 5, 3.9, 4.0, 4.1, 4.2].map((w, i) => [w, i < 4] as const)) {
    const x = X(w);
    if (x < plotX - 1 || x > plotX + plotW + 1) continue;
    c.globalAlpha = wide ? 1 - z : z;
    line(
      [
        [x, yBottom],
        [x, yBottom + 8],
      ],
      muted,
      1,
    );
    words(w.toFixed(1), x, yBottom + 35, 20, 'mono', muted, 'center');
  }
  for (const [p, wide] of [2.1, 2.2, 2.08, 2.12, 2.16].map((p, i) => [p, i < 2] as const)) {
    const y = Y(p);
    if (y < yBottom - plotH || y > yBottom) continue;
    c.globalAlpha = wide ? 1 - z : z;
    line(
      [
        [plotX, y],
        [plotX + plotW, y],
      ],
      '#b79bb52d',
      1,
    );
    words(p.toFixed(2) + '%', plotX - 11, y + 6, 16, 'mono', muted, 'right');
  }
  c.globalAlpha = 1;
  words('Wavelength (μm)', 1150, 662, 20, 'mono', muted, 'right');
  words('Light blocked', plotX, 163, 19, 'mono', muted);
  c.save();
  c.beginPath();
  c.rect(plotX - 4, yBottom - plotH - 10, plotW + 8, plotH + 14);
  c.clip();
  for (const [w, p, err] of data.spectrum) {
    if (w < min - 0.05 || w > max + 0.05) continue;
    const x = X(w),
      y = Y(p),
      highlight = Math.abs(w - target) < band;
    const arrive = Math.max(0, Math.min(1, (build * 1.4 * plotW - (x - plotX)) / 60));
    if (arrive <= 0) continue;
    c.globalAlpha = arrive;
    const lift = (1 - arrive) * 24;
    line(
      [
        [x, Y(p + err) + lift],
        [x, Y(p - err) + lift],
      ],
      highlight ? lime : ice + 'b0',
      mix(2, 2.6, z),
    );
    const r = mix(5, 6.6, z);
    if (highlight) lensGlow(x, y + lift, r * 4, lime, 0.55);
    c.fillStyle = grad(x - r, y - r, 2 * r, 2 * r, highlight ? ['#f6ffd0', lime] : ['#ffd9d2', pink]);
    c.beginPath();
    c.arc(x, y + lift, r, 0, tau);
    c.fill();
    c.globalAlpha = 1;
  }
  if (k === 'pretty') {
    // "A smooth line drawn through those measurements has already involved a choice."
    const pts = data.spectrum.filter(([w]) => w >= min && w <= max);
    const smooth = pts.map((_, i) => {
      const win = pts.slice(Math.max(0, i - 2), i + 3);
      return [X(pts[i][0]), Y(win.reduce((s, q) => s + q[1], 0) / win.length)];
    });
    line(smooth.slice(0, Math.max(2, Math.ceil(Math.min(1, t / 2.2) * smooth.length))), grad(plotX, 0, plotW, 0, [ice, pink]), 3.5);
  }
  c.restore();
  const m = zoom ? 4.0425 : target === 4.34 ? 4.348 : 4.0425;
  const point = data.spectrum.reduce((a, b) => (Math.abs(a[0] - m) < Math.abs(b[0] - m) ? a : b));
  ring(X(point[0]), Y(point[1]), 12 + 1.7 * Math.sin(t * 1.2), lime, 0.72);
}
function lightcurve(t: number, k: string) {
  const keys = Object.keys(data.light) as (keyof typeof data.light)[];
  const row = data.light[keys[k === 'narrow' ? 7 : 0]];
  const X = (h: number) => 144 + (h + 4.7) * 105,
    Y = (v: number) => 219 + (1.002 - v) * 13700;
  if (k === 'narrow') words('4.28 μm', 1150, 196, 26, 'mono', lime, 'right');
  line(
    [
      [144, 193],
      [144, 567],
      [1155, 567],
    ],
    '#c4b5cd88',
  );
  for (const h of [-4, -2, 0, 2, 4]) words(String(h), X(h), 604, 19, 'mono', muted, 'center');
  words('Hours from mid-transit', 1150, 655, 20, 'mono', muted, 'right');
  const f = Math.min(1, 0.28 + t * 0.13);
  const head = Math.min(row.length - 1, Math.floor(f * row.length) - 1);
  const scan = row[(Math.floor(t * 9) % row.length + row.length) % row.length];
  if (f >= 1) lensGlow(X(scan[0]), Y(scan[1]), 26, ice, 0.6);
  else if (head > 0) lensGlow(X(row[head][0]), Y(row[head][1]), 34, lime, 0.8);
  row.forEach(([h, v], i) => {
    if (i / row.length > f) return;
    c.fillStyle = k === 'baseline' && Math.abs(h) > 2 ? lime : ice;
    c.beginPath();
    c.arc(X(h), Y(v), 2.7, 0, tau);
    c.fill();
  });
}
const moleculeShots: Record<string, [Molecule, string]> = {
  carbon: ['CO2', 'CO₂'],
  water: ['H2O', 'Water vapor'],
  sulfide: ['H2S', 'Hydrogen sulfide'],
  so2: ['SO2', 'SO₂'],
};
function molecule(t: number, k: string) {
  const [species, title] = moleculeShots[k];
  const grow = 0.82 + 0.18 * (1 - Math.exp(-t * 1.6));
  lensGlow(640, 372, 330, species === 'SO2' ? pink : ice, 0.22);
  drawMolecule(c, species, [640, 372], 1.6 * grow, t, species === 'H2O');
  words(title, 640, 600, 30, 'title', muted, 'center');
}
function instrument(t: number, k: string) {
  heading(k === 'photon' ? 'Counting photons' : k === 'binsize' ? 'Wavelength bins' : 'Splitting starlight');
  const ox = 525,
    oy = 376;
  const smooth = (x: number) => cubic(Math.max(0, Math.min(1, x)));
  // Follow the incident packet to the prism before unfolding the spectrum.
  const beam = k === 'prism' ? smooth(t / 0.52) : 1;
  const spread = k === 'prism' ? smooth((t - 0.5) / 1.4) : 1;
  line([[60, oy], [60 + (ox - 60) * beam, oy]], grad(40, 0, 480, 0, [pink + '20', '#ffe8cf']), 6);
  lensGlow(60 + (ox - 60) * beam, oy, 52, '#ffdab4', 0.7);
  for (let i = 0; i < 29; i++) {
    const yy = 159 + i * 15;
    const active = i === 10;
    const col = active ? lime : i < 14 ? ice : pink;
    const endX = ox + 487 * spread;
    const endY = oy + (yy - oy) * spread;
    line([[ox, oy], [endX, endY]], grad(ox, oy, 487, yy - oy, [col + '10', col + 'c0']), active ? 4 : 2);
    const f = ((t * 0.62 + 0.72) % 1) * spread;
    if (active || i % 5 === 0) lensGlow(ox + 487 * f, oy + (yy - oy) * f, active ? 20 : 9, col, spread);
    c.globalAlpha = spread;
    c.fillStyle = grad(1022, yy, 133, 0, [col + 'dc', col + '35']);
    c.fillRect(1022, yy - 5, 48 + 64 * (0.5 + 0.5 * Math.sin(i * 0.46)), k === 'binsize' ? 13 : 8);
    c.globalAlpha = 1;
  }
  c.fillStyle = grad(435, 284, 185, 164, ['#dfc6df77', '#8879b15e', '#7561801a']);
  c.beginPath();
  c.moveTo(447, 464);
  c.lineTo(518, 267);
  c.lineTo(607, 464);
  c.closePath();
  c.fill();
  c.strokeStyle = '#cbb9e0af';
  c.stroke();
}
function compare(t: number, k: string) {
  const mid = k === 'mid' || k === 'predict' || k === 'confirm',
    numbers = mid ? [4.05, 7.7, 8.5] : [2, 2.1],
    x0 = 171,
    dx = 940;
  heading(mid ? 'Three absorption bands' : 'An illustrative transit');
  if (mid) {
    // Schematic SO₂ absorption: each band rises in turn and its molecule vibrates above it.
    const X = (w: number) => x0 + ((w - 3.4) / 5.8) * dx,
      base = 470;
    // predict: 4.05 μm measured, 7.7 and 8.5 μm only predicted. confirm: the two
    // new bands rise as Titan names them. mid: all three established.
    const grow = (s: number) => 1 - Math.exp(-Math.max(0, s) * 2.4);
    const rise =
      k === 'predict'
        ? [1, 0, 0]
        : k === 'confirm'
          ? [1, grow(t - 1.1), grow(t - 2.3)]
          : numbers.map((_, i) => (cue.prev && ['predict', 'confirm', 'mid'].includes(cue.prev) ? 1 : grow(t - 0.4 - i * 0.9)));
    const active = k === 'predict' ? 0 : k === 'confirm' ? (t > 2.3 ? 2 : t > 1.1 ? 1 : 0) : -1;
    const curve = path((f) => {
      const w = 3.4 + 5.8 * f;
      let a = 0;
      numbers.forEach((n, i) => (a += rise[i] * [0.55, 1, 0.8][i] * Math.exp(-(((w - n) / [0.09, 0.22, 0.2][i]) ** 2))));
      return [X(w), base - 190 * a];
    }, 300);
    const fill = c.createLinearGradient(0, base - 200, 0, base);
    fill.addColorStop(0, pink + '88');
    fill.addColorStop(0.6, '#7c5f9a44');
    fill.addColorStop(1, ice + '05');
    c.fillStyle = fill;
    c.beginPath();
    c.moveTo(X(3.4), base);
    curve.forEach(([x, y]) => c.lineTo(x, y));
    c.lineTo(X(9.2), base);
    c.fill();
    line(curve, grad(x0, 0, dx, 0, [ice, '#d6a3c8', pink]), 3);
    line(
      [
        [x0, base],
        [x0 + dx, base],
      ],
      muted + '88',
      1.4,
    );
    for (let i = 0; i < 3; i++) {
      const x = X(numbers[i]),
        full = base - 190 * [0.55, 1, 0.8][i],
        top = base - 190 * rise[i] * [0.55, 1, 0.8][i];
      const on = i === active;
      // Hollow marker: where the band must appear if the identification is right.
      if (rise[i] < 0.98) {
        c.save();
        c.setLineDash([5, 7]);
        c.strokeStyle = (on ? lime : muted) + 'cc';
        c.lineWidth = 2;
        c.beginPath();
        c.arc(x, full, 16 + 3 * Math.sin(t * 3), 0, tau);
        c.stroke();
        c.restore();
      }
      lensGlow(x, top, 40 + 8 * Math.sin(t * 1.7 + i), on ? lime : i ? pink : ice, 0.6 * rise[i]);
      c.globalAlpha = Math.max(0.25, rise[i]);
      drawMolecule(c, 'SO2', [x + [0, -34, 34][i], full - [70, 150, 70][i]], 0.34, t * (1 + 0.35 * i) + i);
      c.globalAlpha = 1;
      words(numbers[i] + ' μm', x, base + 36, 24, 'mono', on ? lime : muted, 'center');
    }
    if (k === 'predict') words('predicted', X(8.1), base + 72, 22, 'mono', muted, 'center');
    words('SO₂ bands · schematic shapes', x0, base + 104, 20, 'mono', muted);
  } else {
    numbers.forEach((n, j) => {
      const x = 292 + j * 560,
        col = j ? pink : ice;
      const pts = path((f) => {
        const edge = Math.max(0, Math.min(1, (f - 0.19) * 15, (0.83 - f) * 15));
        return [x - 190 + 380 * f, 260 + edge * (j ? 171 : 150)];
      });
      line(pts, grad(x - 190, 0, 380, 0, [muted, col]), 4);
      const p = pts[~~(((t * 0.14) % 1) * 100)];
      lensGlow(p[0], p[1], 17, col);
      words(n.toFixed(1) + '% blocked', x, 527, 29, 'mono', muted, 'center');
    });
  }
}
// A single pullback from the star to the evidence at three wavelengths.
function recap(t: number) {
  const reveal = (start: number, end: number) => cubic(Math.max(0, Math.min(1, (t - start) / (end - start))));
  const transit = reveal(1.3, 4.8);
  const separate = reveal(5.6, 8.5);
  const spectrum = reveal(10.0, 12.9);
  const ultraviolet = reveal(14.0, 16.0) * (1 - reveal(18.2, 19.6));
  const extend = reveal(19.3, 22.0);
  const clearMontage = reveal(23.4, 24.72);
  const returnToShoulder = reveal(24.7, 26.9);
  field(t, 1.2 + 1.41 * (1 - transit), [W / 2, H / 2]);
  c.fillStyle = grad(0, 0, W, H, ['#1011216e', '#261c3bbc', '#351d3999']);
  c.fillRect(-90, -50, W + 180, H + 100);
  const starX = 625 - 335 * separate - 55 * ultraviolet;
  const starY = 340 - 39 * separate;
  const starR = 14 + 156 * transit - 61 * separate;
  c.save();
  c.globalAlpha = 1 - clearMontage;
  globeLook(starX, starY, starR, 'star');
  const planetR = starR * 0.17 + 10 * separate;
  const planetX = starX - starR * (1.25 - 1.16 * transit) + 330 * ultraviolet;
  c.fillStyle = grad(planetX - planetR, starY - planetR, planetR * 2, planetR * 2, ['#352947', '#120d20', '#47304c']);
  c.beginPath();
  c.arc(planetX, starY, planetR, 0, tau);
  c.fill();
  for (let i = 0; i < 5; i++) {
    const shell = planetR + 2.2 + 3.1 * i;
    c.strokeStyle = '#f5aec7' + Math.round((130 - 19 * i) * separate).toString(16).padStart(2, '0');
    c.lineWidth = 2;
    c.beginPath();
    c.arc(planetX, starY, shell, 0, tau);
    c.stroke();
  }
  c.globalAlpha *= ultraviolet;
  for (let i = 0; ultraviolet > 0 && i < 8; i++) {
    const travel = (t * 1.12 + i * 0.12) % 1;
    const offset = (i - 3.5) * 7;
    const start = starX + Math.sqrt(starR ** 2 - offset ** 2);
    const finish = planetX - Math.sqrt((planetR + 6) ** 2 - offset ** 2);
    if (finish <= start) continue;
    const x = start + (finish - start) * travel;
    const y = starY + offset;
    line([[Math.max(start, x - 32), y], [x, y]], '#c2adff', 2.5);
    lensGlow(x, y, 22, '#b4a1ed', Math.sin(Math.PI * travel));
  }
  c.restore();
  const shoulderCue = reveal(10.7, 11.8) * (1 - reveal(13.6, 14.4));
  const bands = [
    { wavelength: '4.05 μm', y: 383, color: lime, phase: separate },
    { wavelength: '7.7 μm', y: 473, color: pink, phase: extend },
    { wavelength: '8.5 μm', y: 565, color: ice, phase: reveal(20.4, 22.15) },
  ];
  for (const [i, band] of bands.entries()) {
    const opacity = band.phase * (1 - clearMontage) * (1 - ultraviolet);
    if (opacity === 0) continue;
    c.save();
    c.globalAlpha = opacity;
    const end = 1096;
    const limb = planetX + Math.sqrt((planetR + 8) ** 2 - 64);
    const span = end - limb;
    const trace = path((u) => {
      const phase = u * (13 - 3.8 * i) - t * 2.8;
      const envelope = Math.sin(Math.PI * u);
      return [limb + u * span, starY - 8 + (band.y - starY + 8) * u + 24 * Math.sin(phase) * envelope];
    });
    line(trace, grad(limb, 0, span, 0, [band.color + '35', band.color]), 2.2 + i * 0.4);
    const dot = trace[Math.floor((t * 0.24 + i * 0.27) % 1 * 100)];
    lensGlow(dot[0], dot[1], 22, band.color, 0.85);
    c.globalAlpha = opacity * spectrum * (1 - shoulderCue);
    words(band.wavelength, end, band.y - 19, 24, 'sans', band.color, 'right');
    c.restore();
  }
  if (shoulderCue > 0) {
    c.save();
    c.globalAlpha = shoulderCue;
    c.translate(574, 168);
    c.scale(0.49, 0.49);
    c.beginPath();
    c.rect(0, 0, W, H);
    c.clip();
    evidenceScenes.finalPoints(2 + t - 10.7);
    c.restore();
  }
  const handoff = reveal(23.7, 24.1) * (1 - reveal(25.34, 25.8));
  if (handoff > 0) {
    const move = reveal(24, 25.58);
    const x = 1096 + (544 - 1096) * move;
    const y = 383 + (432 - 383) * move;
    lensGlow(x, y, 38, lime, handoff * 0.8);
  }
  if (returnToShoulder > 0) {
    c.save();
    c.globalAlpha = returnToShoulder;
    evidenceScenes.finalPoints(Math.max(0, t - 24.7));
    c.restore();
  }
}

function credits(t: number) {
  c.fillStyle = grad(0, 0, W, H, ['#f1d1b8', '#e4c3c9', '#bfb6d6']);
  c.fillRect(-90, -50, W + 180, H + 100);
  const ink = '#382941';
  const shimmer = cubic(Math.min(1, t / 7));
  for (let i = 0; i < 13; i++) {
    const y = 172 + i * 23;
    line(path((u) => [100 + 390 * u, y + 34 * Math.sin(u * 5 - i * 0.24 - t * 0.51)]),
      grad(100, 0, 390, 200, ['#986a8144', '#5d517380', '#9a6a810b']), 1.7);
  }
  lensGlow(268 + 125 * shimmer, 315, 145, '#8e6077', 0.55);
  words('Mysteries of the Sky', 523, 228, 38, 'sans', ink);
  const rows = [
    'Observations · JWST Early Release Science team',
    'Chemistry · Tsai et al. and Powell et al.',
    'Rowan Ellery is a fictional AI presenter',
  ];
  for (const [i, row] of rows.entries()) {
    c.globalAlpha = cubic(Math.max(0, Math.min(1, (t - 0.22 - 0.72 * i) / 0.56)));
    words(row, 524, 322 + i * 66, 23, 'sans', ink);
  }
  c.globalAlpha = 1;
}
const scenes: Record<string, (t: number, k: string) => void> = {};
for (const k of Object.keys(titles)) scenes[k] = planet;
for (const k of ['transit', 'ingress', 'exit']) scenes[k] = crossing;
for (const k of ['grazing', 'layers', 'cloudray']) scenes[k] = rays;
for (const k of chartKeys) scenes[k] = chart;
for (const k of ['curve', 'narrow', 'baseline']) scenes[k] = lightcurve;
for (const k of ['carbon', 'sulfide', 'water', 'so2']) scenes[k] = molecule;
for (const k of ['prism', 'photon', 'binsize']) scenes[k] = instrument;
Object.assign(scenes, evidenceScenes, showpieces, makeBeats(globeLook));
scenes.mid = scenes.predict = compare;
scenes.cloudray = cloudDeck;
scenes.degenerate = cloudComparison;
scenes.example = compare;
scenes.credits = credits;
scenes.recap = recap;
continuous(chartKeys);
continuous(['vertical', 'slant']);
continuous(['cloudray', 'degenerate']);
continuous(['predict', 'confirm', 'mid']);
Object.assign(window, {
  waspFrame(k: string, t: number, cue?: Cue) {
    const frame = cue ?? { key: k, t, g: t, left: 99 };
    if (k === 'residual' && !frame.prev) frame.prev = k;
    return directFrame((key, time) => scenes[key](time, key), frame, k === 'discovery' ? () => coverHook(t) : undefined);
  },
});
