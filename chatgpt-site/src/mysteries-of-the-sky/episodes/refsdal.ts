// Browser entry for the narrated Refsdal episode. Positions in the observation
// plates refer to the published, already registered ESA/Hubble composites.
import { smooth, tau } from '../index.ts';
import { galaxy } from '../cosmos.ts';
import { sky } from '../materials.ts';
import { paintWithFinePixels } from '../finish.ts';

const canvas = document.createElement('canvas');
canvas.width = 1280;
canvas.height = 720;
const c = canvas.getContext('2d', { alpha: false })!;
const pictures: Record<string, HTMLImageElement> = {};
const W = canvas.width,
  H = canvas.height;
const muted = '#cebbdf',
  pink = '#f79c9a',
  ice = '#b8bbff',
  lime = sky.accent;
const grad = (x: number, y: number, w: number, h: number, colors: string[]) => {
  const g = c.createLinearGradient(x, y, x + w, y + h);
  colors.forEach((color, i) => g.addColorStop(i / (colors.length - 1), color));
  return g;
};
function words(
  s: string,
  x: number,
  y: number,
  size: number,
  style = 'sans',
  color = sky.light as string,
  align: CanvasTextAlign = 'left',
) {
  c.textAlign = align;
  c.textBaseline = 'alphabetic';
  c.font =
    style === 'title'
      ? size + 'px Georgia, serif'
      : style === 'italic'
        ? 'italic ' + size + 'px Georgia, serif'
        : style === 'mono'
          ? size + 'px Menlo, monospace'
          : '500 ' + size + 'px "Helvetica Neue", Arial, sans-serif';
  c.fillStyle = color;
  c.fillText(s, x, y);
}
function lensGlow(x: number, y: number, r: number, color: string, opacity = 1) {
  c.save();
  c.globalAlpha *= opacity;
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color + 'da');
  g.addColorStop(0.18, color + '80');
  g.addColorStop(0.62, color + '26');
  g.addColorStop(1, color + '00');
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
  c.restore();
}
const plate = document.createElement('canvas');
plate.width = W;
plate.height = H;
function makeSky() {
  c.fillStyle = grad(0, 0, W, H, ['#080917', '#131126', '#2e1b32', '#160f24']);
  c.fillRect(0, 0, W, H);
  lensGlow(958, 248, 500, '#504d9a', 0.38);
  lensGlow(300, 750, 450, '#a34f57', 0.29);
  let seed = 14;
  const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 4800; i++) {
    const x = rand() * W,
      y = rand() * H,
      a = rand();
    c.globalAlpha = 0.028 + a * a * a * 0.35;
    c.fillStyle = i % 4 === 0 ? pink : ice;
    c.fillRect(x | 0, y | 0, i % 10 === 0 ? 2 : 1, i % 10 === 0 ? 2 : 1);
  }
  c.globalAlpha = 1;
  plate.getContext('2d')!.drawImage(canvas, 0, 0);
}
makeSky();
function dot(x: number, y: number, r: number, color: string) {
  lensGlow(x, y, r * 3, color, 0.7);
  c.fillStyle = grad(x - r, y - r, r * 2, r * 2, ['#fff7e8', color, color + '99']);
  c.beginPath();
  c.arc(x, y, r, 0, tau);
  c.fill();
}
function line(points: number[][], color: string | CanvasGradient, weight = 2) {
  c.strokeStyle = color;
  c.lineWidth = weight;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath();
  points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.stroke();
}
function ring(x: number, y: number, r: number, color: string, alpha = 1) {
  c.save();
  c.globalAlpha *= alpha;
  c.strokeStyle = color;
  c.lineWidth = 1.4;
  c.beginPath();
  c.arc(x, y, r, 0, tau);
  c.stroke();
  c.restore();
}
function target(x: number, y: number, r: number, t: number) {
  ring(x, y, r, lime, 0.89);
  ring(x, y, r + 4 + 9 * ((t / 2.8) % 1), lime, 0.4 * (1 - ((t / 2.8) % 1)));
  for (let i = 0; i < 4; i++) {
    const a = (i * tau) / 4;
    line(
      [
        [x + Math.cos(a) * (r + 3), y + Math.sin(a) * (r + 3)],
        [x + Math.cos(a) * (r + 10), y + Math.sin(a) * (r + 10)],
      ],
      lime,
      1,
    );
  }
}
function photo(
  key: string,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const im = pictures[key];
  c.drawImage(im, sx * im.width, sy * im.height, sw * im.width, sh * im.height, x, y, w, h);
}
function leftShade() {
  c.fillStyle = grad(0, 0, 850, 0, ['#090915fa', '#0d0b1dea', '#140e2090', '#140e2000']);
  c.fillRect(0, 0, 850, H);
}
function heading(title: string) {
  words(title, 60, 105, 48, 'title');
}
function field(t: number, z = 1) {
  const sw = 0.72 / z,
    sh = (sw * 9) / 16;
  photo('heic1505b', 0.545 - sw / 2 + 0.012 * Math.sin(t / 9), 0.59 - sh / 2, sw, sh, 0, 0, W, H);
}
function discovery(t: number, close: boolean) {
  if (!close) {
    field(t, 1 + 0.009 * t);
    leftShade();
    words('Four points of light', 61, 383, 64, 'title');
  } else {
    const f = 1 + 0.065 * smooth(t / 12);
    const sw = 0.3 / f;
    photo('heic1505a', 0.778 - sw / 2, 0.505 - sw / 2, sw, sw, 625, 68, 582, 582);
    words('One star, four images', 55, 371, 50, 'title');
  }
}
function exposure(t: number, view: 'full' | 'before' | 'after' | 'blink') {
  if (view === 'full') {
    photo('heic1525a', 0, 0, 1, 1, 231, 106, 1002, 575);
    heading('Two visits');
  } else {
    const after = view === 'after' || (view === 'blink' && t % 5 > 2.5);
    photo('heic1525a', 0.58, after ? 0.506 : 0.008, 0.412, 0.482, 558, 110, 662, 450);
    words(after ? 'December 11' : 'October 30', 60, 369, 57, 'title');
  }
}
function intro(t: number) {
  field(t, 1.08 + t * 0.008);
  leftShade();
  words('The Star That Kept Its Appointment', 57, 392, 56, 'title');
}
function side(t: number, delay: boolean, phase: number) {
  const sx = 144,
    ex = 1120,
    cy = 393;
  galaxy(c, [sx, cy], 118, -0.65, t * 0.024);
  for (let k = 0; k < 5; k++) {
    const a = k * 2.4;
    galaxy(c, [622 + Math.cos(a) * 49, cy + Math.sin(a) * 42], 62 - k * 5, a, 0.03 * t);
  }
  for (let k = 0; k < 3; k++) ring(625, cy, 52 + k * 15, ice, 0.19 - k * 0.035);
  // Interpolate a drawn ray and its moving wave packet on the same curve.
  for (let j = 0; j < (phase === 0 ? 1 : 2); j++) {
    const amp = j === 0 ? -105 : 157,
      path = (v: number) => [sx + (ex - sx) * v, cy + amp * Math.sin(Math.PI * v) ** 1.22];
    const col = j === 0 ? ice : pink;
    const reveal = smooth((t + 0.3 - j * 0.65) / 2.8);
    line(
      Array.from({ length: 80 }, (_, i) => path((i / 79) * reveal)),
      grad(sx, cy, ex - sx, 30, [col + '55', col, col + '75']),
      3,
    );
    const clock = t % 9.2,
      duration = delay ? (j === 0 ? 5.7 : 7.4) : 6.8,
      u = Math.min(1, clock / duration);
    if (clock < duration + 0.6) {
      const [x, y] = path(u);
      dot(x, y, 5, col);
    }
    if (delay && clock >= duration && clock < duration + 1.1) target(ex, cy, 17 + 6 * (clock - duration), t);
  }
  c.strokeStyle = '#e8dbe8';
  c.lineWidth = 3;
  c.strokeRect(ex - 5, cy - 18, 10, 36);
  [
    [sx, 'Supernova'],
    [625, 'Foreground cluster'],
    [ex, 'Telescope'],
  ].forEach(([x, n]) => words(String(n), Number(x), 598, 23, 'sans', sky.light, 'center'));
}
function cross(t: number, phase: number) {
  const x = 832,
    y = 379,
    radius = 154;
  galaxy(c, [x, y], 229, -0.6, t * 0.018);
  lensGlow(x, y, 90, '#df8e86', 0.72);
  const p = phase === 0 ? 0.02 : smooth(t / 6.4);
  for (let i = 0; i < 264; i++) {
    const a = (i / 264) * tau;
    const rr = radius * (1 + 0.06 * p * Math.cos(2 * a + 0.55));
    const alpha = 0.18 + 0.78 * (1 - p + p * Math.pow(0.5 + 0.5 * Math.cos(4 * a + 0.73), 9));
    c.save();
    c.globalAlpha = alpha;
    dot(x + Math.cos(a) * rr, y + Math.sin(a) * rr, phase === 0 ? 1.9 : 2.5, i % 7 < 3 ? ice : pink);
    c.restore();
  }
  if (phase > 0) {
    for (let j = 0; j < 4; j++) {
      const a = (j * tau - 0.73) / 4,
        rr = radius * (1 + 0.06 * p * Math.cos(2 * a + 0.55));
      dot(x + rr * Math.cos(a), y + rr * Math.sin(a), 3 + 4 * p, sky.blush);
    }
  }
  words(phase === 0 ? 'Perfect alignment' : 'A broken symmetry', 60, 391, 50, 'title');
}
function spiral(t: number, phase: number) {
  const points =
    phase === 0
      ? [{ x: 817, y: 393, r: 405, flip: 1 }]
      : [
          { x: 371, y: 407, r: 279, flip: 1 },
          { x: 889, y: 411, r: 279, flip: -1 },
        ];
  for (const o of points) {
    c.save();
    c.translate(o.x, o.y);
    c.scale(o.flip, 1);
    const a = 0.12 * Math.sin(t * 0.07);
    galaxy(c, [0, 0], o.r, -0.26, a);
    const x = o.r * 0.43 * Math.cos(a),
      y = -o.r * 0.2;
    dot(x, y, 5, sky.blush);
    target(x, y, 17, t);
    c.restore();
  }
  if (phase === 0) words('One spiral arm', 64, 376, 50, 'title');
  else heading('The same spiral arm');
}
function brightness(t: number, mode: 'flash' | 'fit' | 'measure') {
  const fit = mode === 'fit';
  heading('Illustrative light curves');
  const x = 166,
    y = 548,
    width = 965;
  for (let j = 0; j < 4; j++)
    line(
      [
        [x, y - j * 83],
        [x + width, y - j * 83],
      ],
      '#bdabe82a',
      1,
    );
  line(
    [
      [x, 213],
      [x, y],
      [x + width, y],
    ],
    '#dccfe2a0',
    1.5,
  );
  const p = fit ? smooth(((t % 13) - 3) / 6) : 0;
  const glowShape = (a: number) => (a <= 0 ? 0 : Math.pow(a / 0.19, 2.7) * Math.exp(2.7 * (1 - a / 0.19)));
  for (let j = 0; j < (mode === 'flash' ? 1 : 2); j++) {
    const shift = j === 0 ? 0.045 : 0.36 - 0.315 * p,
      amp = j === 0 ? 1 : 0.3 + 0.7 * p;
    const curve = (v: number) => [x + width * v, y - 288 * amp * glowShape(v - shift)];
    const reveal = smooth((t + 0.8) / 4.3);
    const col = j === 0 ? ice : pink;
    line(
      Array.from({ length: 133 }, (_, i) => curve((i / 132) * reveal)),
      grad(x, y, width, 0, [col + '88', col, col + '99']),
      3,
    );
    for (let n = 1; n < 28; n++) {
      const v = n / 29;
      if (v <= reveal && glowShape(v - shift) > 0.025) {
        const [px, py] = curve(v);
        dot(px, py, 2.6, col);
      }
    }
    if (mode === 'flash') {
      const v = (t % 9) / 9;
      const [xx, yy] = curve(v);
      line(
        [
          [xx, y],
          [xx, yy],
        ],
        '#b8bbff58',
        1,
      );
      dot(xx, yy, 5, lime);
    }
  }
  words('Brightness', 96, 204, 18, 'sans', muted);
  words('Observing date →', 1133, 595, 19, 'sans', muted, 'right');
  if (mode !== 'flash') {
    words('S1', 902, 196, 20, 'mono', ice);
    words('SX', 982, 196, 20, 'mono', pink);
  }
}
function map(t: number, phase: number) {
  const cx = 825,
    cy = 370;
  for (let j = 0; j < 16; j++) {
    const r = 30 + j * 12;
    const path = Array.from({ length: 161 }, (_, k) => {
      const a = (k / 160) * tau,
        f =
          1 +
          0.13 * Math.cos(3 * a + 0.025 * j) +
          0.085 * Math.sin(2 * a + 0.15 * t) +
          0.035 * Math.sin(5 * a + 0.14 * j);
      return [cx + Math.cos(a) * r * f * 1.52, cy + Math.sin(a) * r * f * 0.8];
    });
    line(path, grad(cx - r, cy - r, 2 * r, 2 * r, ['#9380dc99', '#7764b8ba', '#eaa0a499']), 1.3);
  }
  for (let k = 0; k < 13; k++) {
    const a = k * 2.399,
      r = 20 + 13 * k;
    galaxy(c, [cx + r * 1.31 * Math.cos(a), cy + r * 0.64 * Math.sin(a)], 27 + (k % 3) * 9, a, t * 0.014);
  }
  words(phase === 0 ? 'Where is the mass?' : 'One sky, several maps', 58, 383, 49, 'title');
}
function forecast(t: number) {
  words('November 2015 ± one month', 65, 313, 51, 'title');
  const x = 205,
    y = 514,
    len = 890;
  line(
    [
      [x, y],
      [x + len, y],
    ],
    '#ab92bd99',
    2,
  );
  for (let j = 0; j < 5; j++) {
    const xx = x + (j * len) / 4;
    line(
      [
        [xx, y - 10],
        [xx, y + 10],
      ],
      ice,
      2,
    );
    words(['SEP', 'OCT', 'NOV', 'DEC', 'JAN'][j], xx, y + 46, 19, 'mono', muted, 'center');
  }
  const p = smooth(t / 4);
  c.fillStyle = grad(x + len * 0.25, y, len * 0.5, 0, ['#6964a120', '#c8b1fb9f', '#e6aba02f']);
  c.fillRect(x + len * 0.25, y - 35, len * 0.5 * p, 30);
}
function value(t: number, key: 'days' | 'light' | 'hubble' | 'models') {
  const reading = { days: '376 days', light: '0.30×', hubble: '64.8 km/s/Mpc', models: '66.6 km/s/Mpc' }[key];
  const x = 750,
    y = 371;
  for (let i = 0; i < 9; i++) {
    const r = 95 + i * 13;
    ring(x + 88, y, r, ice, 0.1 + 0.06 * Math.sin(t * 0.4 + i));
  }
  if (key === 'days' || key === 'light') {
    galaxy(c, [x + 88, y], 250, -0.6, t * 0.025);
    target(x + 132, y - 43, 17, t);
  } else {
    for (let i = 0; i < 6; i++) {
      const a = i * 2.39;
      galaxy(c, [x + 88 + Math.cos(a) * (31 + 18 * i), y + Math.sin(a) * (24 + 15 * i)], 65, a, t * 0.015);
    }
  }
  words(reading, 60, 396, reading.length < 11 ? 86 : 67, 'title');
}
function scale(t: number, part: number) {
  heading(part === 0 ? 'The same angles' : 'A ruler made of time');
  const base = [158, 493],
    side = 220 + 120 * smooth((t % 12) / 8);
  for (let k = 0; k < 2; k++) {
    const f = k === 0 ? 1 : 1.55,
      bx = k === 0 ? base[0] : 716,
      by = base[1];
    const pts = [
      [bx, by],
      [bx + side * f * 0.64, by - side * f * 0.48],
      [bx + side * f, by],
    ];
    line([...pts, pts[0]], grad(bx, by, side * f, -100, [ice, sky.blush]), 2.5);
    pts.forEach(([x, y]) => dot(x, y, 4, ice));
    const q = (t / (k === 0 ? 5.7 : 8.835)) % 1;
    dot(pts[0][0] + (pts[1][0] - pts[0][0]) * q, by + (pts[1][1] - by) * q, 5, lime);
  }
}
function endcard(t: number, phase: number) {
  if (phase === 0) {
    field(t, 1.3 + 0.012 * t);
    leftShade();
    words('The light arrived', 60, 386, 65, 'title');
    return;
  }
  words('MYSTERIES OF THE SKY', 60, 80, 19, 'mono', ice);
  words('Observations & research', 57, 157, 55, 'title');
  const rows = [
    'Hubble imaging  ·  NASA and ESA; S. Rodney / FrontierSN; T. Treu, P. Kelly / GLASS;',
    'J. Lotz / Frontier Fields; M. Postman / CLASH; Z. Levay. Reappearance composite: P. Kelly.',
    'P. Kelly et al.  ·  Discovery (Science, 2015) and reappearance (ApJL, 2016).',
    'M. Jauzac et al.  ·  Hubble Frontier Fields predictions (MNRAS, 2016).',
    'P. Kelly et al.  ·  Time delay and magnification (ApJ, 2023); expansion rate (Science, 2023).',
    'Orbital film: NASA / Johnson Space Center, STS-125 (May 2009).',
    'Main narration: Titan. Professor Rowan Ellery is a fictional, AI-generated presenter.',
  ];
  rows.forEach((s, i) =>
    words(s, 62, 245 + i * 52, 21, 'sans', i === 0 || i === 2 || i === 4 ? sky.light : muted),
  );
}
type Draw = (t: number) => void;
const cuts: Record<number, [number, Draw][]> = {
  1: [
    [0, intro],
    [0.36, (t) => exposure(t, 'before')],
    [0.63, (t) => discovery(t, true)],
    [0.83, (t) => side(t, false, 1)],
  ],
  2: [
    [0, (t) => discovery(t, false)],
    [0.22, (t) => discovery(t, true)],
    [0.65, (t) => spiral(t, 0)],
  ],
  3: [
    [0, (t) => side(t, false, 0)],
    [0.38, (t) => side(t, false, 1)],
    [0.77, (t) => cross(t, 1)],
  ],
  4: [
    [0, (t) => cross(t, 0)],
    [0.35, (t) => cross(t, 1)],
    [0.66, (t) => discovery(t, true)],
    [0.85, (t) => spiral(t, 0)],
  ],
  5: [
    [0, (t) => spiral(t, 1)],
    [0.47, (t) => brightness(t, 'flash')],
  ],
  6: [
    [0, (t) => side(t, true, 1)],
    [0.43, (t) => map(t, 0)],
    [0.68, (t) => side(t, true, 1)],
  ],
  7: [
    [0, (t) => discovery(t, false)],
    [0.27, (t) => spiral(t, 1)],
    [0.71, (t) => exposure(t, 'before')],
  ],
  8: [
    [0, (t) => map(t, 0)],
    [0.43, (t) => map(t, 1)],
    [0.72, forecast],
  ],
  9: [
    [0, (t) => exposure(t, 'full')],
    [0.32, (t) => exposure(t, 'blink')],
    [0.61, (t) => exposure(t, 'after')],
    [0.82, (t) => side(t, true, 1)],
  ],
  10: [
    [0, (t) => exposure(t, 'blink')],
    [0.34, (t) => brightness(t, 'flash')],
    [0.66, (t) => brightness(t, 'fit')],
  ],
  11: [
    [0, (t) => value(t, 'days')],
    [0.34, (t) => value(t, 'light')],
    [0.66, (t) => brightness(t, 'measure')],
  ],
  12: [
    [0, (t) => discovery(t, false)],
    [0.27, (t) => map(t, 0)],
    [0.68, (t) => map(t, 1)],
  ],
  13: [
    [0, (t) => side(t, true, 1)],
    [0.32, (t) => scale(t, 0)],
    [0.64, (t) => scale(t, 1)],
  ],
  14: [
    [0, (t) => value(t, 'hubble')],
    [0.38, (t) => scale(t, 1)],
    [0.56, (t) => value(t, 'models')],
    [0.83, (t) => map(t, 1)],
  ],
  15: [
    [0, (t) => discovery(t, true)],
    [0.27, (t) => exposure(t, 'before')],
    [0.56, (t) => exposure(t, 'after')],
    [0.79, (t) => endcard(t, 0)],
  ],
  16: [[0, (t) => endcard(t, 1)]],
};
async function load(assets: Record<string, string>) {
  await Promise.all(
    Object.entries(assets).map(async ([key, url]) => {
      const im = new Image();
      im.src = url;
      await im.decode();
      pictures[key] = im;
    }),
  );
}
function frame(ch: number, t: number, duration: number) {
  const stages = cuts[ch];
  const [at, draw] = stages.filter(([s]) => s * duration <= t).at(-1)!;
  const local = t - at * duration;
  c.drawImage(plate, 0, 0);
  paintWithFinePixels(c, () => draw(local));
  return canvas.toDataURL('image/jpeg', 0.93).split(',')[1];
}
Object.assign(window, { refsdal: { load, frame } });
