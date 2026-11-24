// Observed points are from the ERS PRISM public release. Orbital geometry,
// atmosphere thickness, molecules and illustrative counting examples are schematic.
import { atmosphericLimb, transmittedLight } from '../atmosphere.ts';
import { drawMolecule, type Molecule } from '../molecules.ts';
import data from './wasp39-data.json';
import {
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
import { paintWithFinePixels } from '../finish.ts';

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
function heading(s: string) {
  words(s, 62, 91, 43, 'title');
}
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
    const n = 42;
    for (let i = 0; i < n; i++) {
      const z = (i / n + t * 0.025) % 1,
        a = i * 2.4;
      const x = 640 + 880 * z * z * Math.cos(a),
        y = 361 + 480 * z * z * Math.sin(a);
      lensGlow(x, y, 2 + 7 * z, ice, 0.5);
    }
    lensGlow(640, 361, 56, pink, 0.85);
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
    const r = 340 + 5 * Math.sin(t * 0.17);
    body(969, 404, r);
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
    }
  } else {
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
  const vertical = k === 'vertical',
    cloudy = k === 'cloudray';
  const radius = 790,
    center = [815, 1164] as const,
    top = center[1] - radius;
  const height = cloudy ? 22 : 16;
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

const plotX = 139,
  plotW = 1010,
  yBottom = 591,
  plotH = 387;
function chart(t: number, k: string) {
  const zoom = k === 'shoulder' || k === 'bins' || k === 'sulfur';
  const min = zoom ? 3.88 : 3.38,
    max = zoom ? 4.2 : 5.06,
    lo = zoom ? 2.063 : 2.06,
    hi = zoom ? 2.18 : 2.29;
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
  const target = k === 'co2' || k === 'peak' ? 4.34 : 4.045;
  const band = zoom ? 0.035 : 0.052;
  c.fillStyle = grad(0, yBottom - plotH, 0, plotH, [ice + '05', ice + '28']);
  c.fillRect(X(target - band), yBottom - plotH, X(target + band) - X(target - band), plotH);
  const ticks = zoom ? [3.9, 4.0, 4.1, 4.2] : [3.5, 4, 4.5, 5];
  line(
    [
      [plotX, yBottom - plotH],
      [plotX, yBottom],
      [plotX + plotW, yBottom],
    ],
    '#c4b5cd88',
  );
  for (const w of ticks) {
    const x = X(w);
    line(
      [
        [x, yBottom],
        [x, yBottom + 8],
      ],
      muted,
      1,
    );
    words(w.toFixed(1), x, yBottom + 35, 18, 'mono', muted, 'center');
  }
  for (const p of zoom ? [2.08, 2.12, 2.16] : [2.1, 2.2]) {
    const y = Y(p);
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
  words('Wavelength (μm)', 1150, 662, 20, 'mono', muted, 'right');
  words('Light blocked', plotX, 163, 19, 'mono', muted);
  for (const [w, p, err] of data.spectrum) {
    if (w < min || w > max || p < lo || p > hi) continue;
    const x = X(w),
      y = Y(p),
      highlight = Math.abs(w - target) < band;
    line(
      [
        [x, Y(Math.min(hi, p + err))],
        [x, Y(Math.max(lo, p - err))],
      ],
      highlight ? lime : ice + 'b0',
      1.6,
    );
    c.fillStyle = highlight ? lime : pink;
    c.beginPath();
    c.arc(x, y, zoom ? 4.7 : 3.7, 0, tau);
    c.fill();
  }
  const m = zoom ? 4.0425 : target === 4.34 ? 4.348 : 4.0425;
  const point = data.spectrum.reduce((a, b) => (Math.abs(a[0] - m) < Math.abs(b[0] - m) ? a : b));
  ring(X(point[0]), Y(point[1]), 12 + 1.7 * Math.sin(t * 1.2), lime, 0.72);
}
function lightcurve(t: number, k: string) {
  const keys = Object.keys(data.light) as (keyof typeof data.light)[];
  const row = data.light[keys[k === 'narrow' ? 7 : 0]];
  const X = (h: number) => 144 + (h + 4.7) * 105,
    Y = (v: number) => 219 + (1.002 - v) * 13700;
  heading(k === 'baseline' ? 'Before and after' : k === 'narrow' ? '4.28 μm' : 'Recorded starlight');
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
  drawMolecule(c, species, [666, 389], 1.34, t, species === 'H2O');
  heading(title);
}
function instrument(t: number, k: string) {
  heading(k === 'photon' ? 'Counting photons' : k === 'binsize' ? 'Wavelength bins' : 'Splitting starlight');
  const ox = 525,
    oy = 376;
  line(
    [
      [60, oy],
      [ox, oy],
    ],
    grad(40, 0, 480, 0, [pink + '20', '#ffe8cf']),
    5,
  );
  const thickness = k === 'binsize' ? 14 : 6;
  for (let i = 0; i < 29; i++) {
    const yy = 159 + i * 15,
      col = i % 5 === 0 ? pink : ice;
    line(
      [
        [ox, oy],
        [1012, yy],
      ],
      grad(ox, oy, 520, yy - oy, [col + '10', col + '9a']),
      1.4,
    );
    c.fillStyle = grad(1030, yy - 5, 141, 8, [col + 'bb', col + '22']);
    c.fillRect(1030, yy - 4, 50 + 44 * (0.5 + 0.5 * Math.sin(i * 0.46)), thickness);
    const f = (t * 0.33 + i * 0.11) % 1;
    if (i % 4 === 0) lensGlow(ox + 487 * f, oy + (yy - oy) * f, 6, col, 0.9);
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
  const mid = k === 'mid',
    numbers = mid ? [4.05, 7.7, 8.5] : [2, 2.1],
    x0 = 171,
    dx = 940;
  heading(mid ? 'Three absorption bands' : 'An illustrative transit');
  if (mid) {
    line(
      [
        [x0, 425],
        [x0 + dx, 425],
      ],
      grad(x0, 0, dx, 0, [ice, pink]),
      3,
    );
    for (let i = 0; i < 3; i++) {
      const x = x0 + ((numbers[i] - 3.4) / 5.8) * dx;
      line(
        [
          [x, 405],
          [x, 445],
        ],
        i ? pink : ice,
        3,
      );
      lensGlow(x, 425, 22 + Math.sin(t + i) * 4, i ? pink : ice);
      words(numbers[i] + ' μm', x, 481, 24, 'mono', muted, 'center');
    }
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
function credits(t: number) {
  const rows = [
    'Observations · JWST Transiting Exoplanet Community ERS Team',
    'Chemistry · Tsai et al. (2023) and Powell et al. (2024)',
    'Mysteries of the Sky · Rowan Ellery is a fictional AI presenter',
  ];
  words(rows[Math.min(2, Math.floor(t / 3.3))], 640, 372, 30, 'title', '#ebdfe8', 'center');
}
const scenes: Record<string, (t: number, k: string) => void> = {};
for (const k of Object.keys(titles)) scenes[k] = planet;
for (const k of ['transit', 'ingress', 'exit']) scenes[k] = crossing;
for (const k of ['grazing', 'vertical', 'cloudray']) scenes[k] = rays;
for (const k of ['data', 'peak', 'shoulder', 'bins', 'unknown', 'co2', 'sulfur']) scenes[k] = chart;
for (const k of ['curve', 'narrow', 'baseline']) scenes[k] = lightcurve;
for (const k of ['carbon', 'sulfide', 'water', 'so2']) scenes[k] = molecule;
for (const k of ['prism', 'photon', 'binsize']) scenes[k] = instrument;
scenes.mid = compare;
scenes.example = compare;
scenes.credits = credits;
Object.assign(window, {
  waspFrame(k: string, t: number) {
    c.drawImage(plate, 0, 0);
    paintWithFinePixels(c, () => scenes[k](t, k));
    return canvas.toDataURL('image/jpeg', 0.91).split(',')[1];
  },
});
