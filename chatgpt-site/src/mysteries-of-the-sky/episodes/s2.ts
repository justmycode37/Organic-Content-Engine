// All synthetic paths and spectra in this episode illustrate the measurement.
import { smooth, tau } from '../index.ts';
import { galaxy } from '../cosmos.ts';
import { sky } from '../materials.ts';
import { paintWithFinePixels } from '../finish.ts';
import {
  canvas,
  c,
  W,
  H,
  muted,
  pink,
  ice,
  lime,
  grad,
  words,
  lensGlow,
  plate,
  dot,
  line,
  ring,
  target,
} from './stage.ts';

const ecc = 0.884,
  a = 365,
  b = a * Math.sqrt(1 - ecc ** 2);
type Pt = [number, number];
function orbitPoint(E: number, tilt = 1, rotation = 0): Pt {
  const u = a * (Math.cos(E) - ecc),
    v = b * Math.sin(E) * tilt;
  return [
    955 + u * Math.cos(rotation) - v * Math.sin(rotation),
    386 + u * Math.sin(rotation) + v * Math.cos(rotation),
  ];
}
function eccentricAnomaly(mean: number) {
  const m = ((mean + Math.PI) % tau) - Math.PI;
  let E = m < 0 ? -Math.PI : Math.PI;
  for (let j = 0; j < 10; j++) E -= (E - ecc * Math.sin(E) - m) / (1 - ecc * Math.cos(E));
  return E;
}
function path(f: (u: number) => Pt, n = 170) {
  return Array.from({ length: n + 1 }, (_, i) => f(i / n));
}
function head(s: string) {
  words(s, 63, 94, 48, 'title');
}
function focus() {
  ring(955, 386, 9, pink, 0.9);
  lensGlow(955, 386, 47, pink, 0.72);
}
function orbit(t: number, mode: string) {
  const tilt = mode === 'tilt' ? 0.16 + 0.84 * (0.5 + 0.5 * Math.cos(t * 0.65)) : 1;
  const rot = mode === 'advance' ? 0.34 * smooth(t / 6) : -0.13;
  const E = eccentricAnomaly(Math.PI + (t * tau) / 7);
  const star = orbitPoint(E, tilt, rot);
  if (mode === 'advance') {
    for (let j = 0; j < 4; j++)
      line(
        path((u) => orbitPoint(tau * u, tilt, j * 0.11 * smooth(t / 5))),
        ice + '68',
        2,
      );
  }
  line(
    path((u) => orbitPoint(u * tau, tilt, rot)),
    grad(250, 300, 740, 0, ['#6461aa88', ice, pink]),
    3,
  );
  if (['area', 'dots'].includes(mode)) {
    for (let i = 0; i < 28; i++) {
      const q = orbitPoint(eccentricAnomaly((tau * i) / 28), tilt, rot);
      dot(...q, 2.8, ice);
    }
    if (mode === 'area') {
      const m = Math.PI + (t * tau) / 7,
        pts = path((u) => orbitPoint(eccentricAnomaly(m - 0.38 + 0.38 * u), tilt, rot), 32);
      c.beginPath();
      c.moveTo(955, 386);
      pts.forEach((q) => c.lineTo(...q));
      c.closePath();
      c.fillStyle = grad(305, 250, 655, 70, ['#767bd388', '#ffaca695']);
      c.fill();
      line([[955, 386], star], pink, 1.7);
    }
  }
  if (mode === 'trail' || mode === 'rush') {
    const m = Math.PI + (t * tau) / 7;
    line(
      path((u) => orbitPoint(eccentricAnomaly(m - 0.65 + 0.65 * u), tilt, rot), 70),
      pink,
      5,
    );
  }
  focus();
  dot(...star, 7, sky.blush);
  target(...star, 15, t);
  const labels: Record<string, string> = {
    area: 'Equal time, equal area',
    dots: 'One dot per time step',
    advance: 'Orbital advance · exaggerated',
    rush: '7,650 km/s',
    tilt: 'Tilt the orbit',
    trail: 'S2',
    period: '16 years',
    boundary: '120 AU',
    ellipse: 'One focus',
  };
  head(labels[mode]);
  if (mode === 'boundary') {
    line(
      [
        [955, 386],
        [955 + a * (1 - ecc), 386],
      ],
      lime,
      4,
    );
    ring(955, 386, a * (1 - ecc), lime, 0.6);
  }
}
function crowd(t: number, mode: string) {
  for (let k = 0; k < 104; k++) {
    let x = (k * 271.4 + 45 * Math.sin(k * 2.1 + t * 0.05)) % W,
      y = (k * k * 37.17 + 272 + 17 * Math.sin(k + t * 0.05)) % H;
    const r = 1.4 + (k % 9) * 0.43;
    dot(x, y, r, k % 3 ? ice : pink);
  }
  const u = smooth(t / 6),
    pos: Pt = [430 + 300 * u, 440 - 105 * u],
    other: Pt = [690 - 232 * u, 341 + 48 * u];
  lensGlow(...pos, 38, ice);
  dot(...pos, 8, ice);
  lensGlow(...other, 34, pink);
  dot(...other, 7, pink);
  if (mode === 'blend') {
    target((pos[0] + other[0]) / 2, (pos[1] + other[1]) / 2, 22, t);
    head('Blended starlight');
  } else if (mode === 'mark') {
    target(...pos, 19, t);
    line([[130, pos[1]], pos, [pos[0], 593]], ice + '90', 1.3);
    head('A position and a date');
  } else {
    target(...pos, 23, t);
    head('Follow one star');
  }
}
function spectrum(t: number, mode: string) {
  const shift = mode === 'extra' ? 18 * smooth(t / 3) : 36 * Math.sin(t * 0.8);
  head(
    mode === 'extra'
      ? 'The excess shift'
      : mode === 'blue'
        ? 'Toward us'
        : mode === 'red'
          ? 'Away from us'
          : 'Read the spectral lines',
  );
  for (let r = 0; r < 2; r++) {
    const y = 228 + r * 177,
      offset =
        r === 0 ? 0 : mode === 'blue' ? -38 * smooth(t / 2.5) : mode === 'red' ? 38 * smooth(t / 2.5) : shift;
    c.fillStyle = grad(170, y, 938, 0, ['#3e3d83', '#8183c7', '#c5b5df', '#efb0ae', '#b85b62']);
    c.fillRect(170, y, 938, 68);
    for (const [x, w] of [
      [336, 5],
      [490, 7],
      [517, 3],
      [763, 9],
      [919, 5],
    ]) {
      c.fillStyle = grad(x + offset - w, y, 2 * w, 0, ['#100c2400', '#190f25ee', '#100c2400']);
      c.fillRect(x + offset - w, y, w * 2, 68);
    }
    words(r ? 'Observed' : 'Rest', 165, y + 103, 22, 'mono', muted);
  }
  line(
    [
      [763, 298],
      [763, 399],
    ],
    ice + '77',
    1,
  );
  dot(
    763 + (mode === 'blue' ? -38 * smooth(t / 2.5) : mode === 'red' ? 38 * smooth(t / 2.5) : shift),
    400,
    4,
    lime,
  );
}
function scales(t: number, mode: string) {
  let caption =
    mode === 'mass'
      ? 'Four million Suns'
      : mode === 'clock'
        ? 'Half the period → four times the mass'
        : 'The same angle';
  head(caption);
  if (mode === 'angle') {
    for (const [d, col] of [
      [420, ice],
      [850, pink],
    ] as const) {
      const xx = 160 + d;
      line(
        [
          [160, 413],
          [xx, 413 - d * 0.22],
          [xx, 413 + d * 0.22],
          [160, 413],
        ],
        col,
        2,
      );
      dot(xx, 413 - d * 0.22, 5, col);
    }
    dot(160, 413, 7, lime);
    return;
  }
  for (let j = 0; j < 2; j++) {
    const x = 365 + j * 558,
      r = 124;
    ring(x, 394, r, ice, 0.8);
    lensGlow(x, 394, j ? 83 : 39, pink);
    dot(x, 394, j ? 13 : 8, pink);
    const a = t * (j ? 1.6 : 0.8);
    dot(x + r * Math.cos(a), 394 + r * Math.sin(a), 7, lime);
  }
}
function ruler(t: number, mode: string) {
  head(
    mode === 'pin'
      ? 'A fifth of one degree'
      : mode === 'compact'
        ? 'Inside the closest approach'
        : 'A small angle, enlarged',
  );
  const pivot: Pt = [189, 480],
    L = 890;
  if (mode === 'compact') {
    const scale = 1 + 0.35 * smooth(t / 6);
    for (let j = 0; j < 5; j++) ring(674, 390, (30 + 48 * j) * scale, ice, 0.65 - 0.1 * j);
    lensGlow(674, 390, 70, pink);
    dot(674, 390, 5, pink);
    dot(674 + 222 * scale, 390, 8, ice);
    return;
  }
  const a = -0.22,
    b = a - 0.11 * smooth(t / 4);
  for (const [ang, col] of [
    [a, ice],
    [b, pink],
  ] as const) {
    line([pivot, [pivot[0] + L * Math.cos(ang), pivot[1] + L * Math.sin(ang)]], col, 3);
  }
  dot(...pivot, 7, lime);
  words('Separation exaggerated', 64, 653, 18, 'mono', muted);
}
function residual(t: number) {
  head('Extra redshift near closest approach');
  const start = 156,
    end = 1130,
    base = 533;
  line(
    [
      [start, 182],
      [start, base],
      [end, base],
    ],
    muted,
    1.5,
  );
  const shape = (u: number): Pt => [
    start + (end - start) * u,
    base - 270 * Math.exp(-((u - 0.5) ** 2) / 0.017),
  ];
  const p = smooth((t + 0.4) / 4.7);
  line(
    path((u) => shape(u * p)),
    grad(start, base, 970, -190, [ice, pink]),
    4,
  );
  dot(...shape(p), 6, lime);
  words('Time →', end, 591, 23, 'sans', muted, 'right');
  words('Schematic', 61, 664, 16, 'mono', muted);
}
function instrument(t: number, mode: string) {
  head(mode === 'wave' ? 'One wavefront, two arrivals' : 'Four telescopes, one instrument');
  const stations: Pt[] = [
      [223, 353],
      [443, 245],
      [704, 219],
      [977, 344],
    ],
    hub: Pt = [670, 561];
  for (let i = 0; i < stations.length; i++) {
    const q = stations[i];
    line([q, hub], i % 2 ? pink + '99' : ice + '99', 2);
    ring(...q, 21, ice);
    dot(...q, 6, pink);
    const p = (t * 0.32 + i * 0.17) % 1;
    dot(q[0] + (hub[0] - q[0]) * p, q[1] + (hub[1] - q[1]) * p, 4, lime);
  }
  if (mode === 'wave') {
    for (let j = 0; j < 6; j++) {
      const y = ((t * 52 + j * 71) % 360) + 101;
      line(
        [
          [168, y],
          [1110, y - 122],
        ],
        ice + '44',
        1.6,
      );
    }
  }
  target(...hub, 16, t);
}
function wave(t: number, mode: string) {
  head(mode === 'clock' ? 'Two contributions to one shift' : 'Interference');
  for (let i = 0; i < 2; i++) {
    const y = 280 + i * 160;
    line(
      path((u) => [
        170 + 940 * u,
        y + 44 * Math.sin(tau * (u * (mode === 'clock' ? (i ? 6 : 7) : 6) - t * 0.6) + i * t * 0.45),
      ]),
      i ? pink : ice,
      3,
    );
  }
}
function card(t: number, mode: string) {
  if (mode === 'credits') {
    words('Observations & research', 60, 115, 46, 'title');
    const rows = [
      'GRAVITY Collaboration · Astronomy & Astrophysics (2018, 2020, 2021)',
      'Infrared observations, zoom and close approach: ESO/MPE/GRAVITY Collaboration',
      'Orbit illustrations: ESO/L. Calçada/SpaceEngine; ESO/L. Calçada',
      'Original score and explanatory diagrams: Mysteries of the Sky.',
      'Narration: Titan. Professor Rowan Ellery is a fictional, AI-generated presenter.',
    ];
    rows.forEach((v, i) => words(v, 64, 218 + 71 * i, 22, 'sans', muted));
    return;
  }
  galaxy(c, [866, 395], 470, -0.43, t * 0.018);
  lensGlow(865, 392, 65, pink);
  const labels: Record<string, string> = {
    title: 'The Star That Weighed a Black Hole',
    speed: '7,650 km/s',
    mass: '≈ 4 million Suns',
    shift: '≈ 200 km/s',
    distance: '26,000 light-years',
    angle: '12 arcminutes per orbit',
    period: '16 years',
    radius: '120 AU',
  };
  words(labels[mode], 59, 381, mode === 'title' ? 48 : 58, 'title');
}
const scenes: Record<string, (t: number) => void> = {};
for (const k of ['area', 'dots', 'advance', 'rush', 'tilt', 'trail', 'period', 'boundary', 'ellipse'])
  scenes[k] = (t) => orbit(t, k);
for (const k of ['blend', 'mark', 'follow']) scenes[k] = (t) => crowd(t, k);
for (const k of ['extra', 'blue', 'red', 'lines']) scenes[k] = (t) => spectrum(t, k);
for (const k of ['angle', 'clock', 'mass']) scenes['scale-' + k] = (t) => scales(t, k);
for (const k of ['pin', 'compact', 'ruler']) scenes[k] = (t) => ruler(t, k);
for (const k of ['array', 'wave']) scenes[k] = (t) => instrument(t, k);
for (const k of ['clock', 'fringes']) scenes[k] = (t) => wave(t, k);
for (const k of ['credits', 'title', 'speed', 'mass', 'shift', 'distance', 'angle', 'period', 'radius'])
  scenes['card-' + k] = (t) => card(t, k);
scenes.residual = residual;
Object.assign(window, {
  s2Frame(name: string, t: number) {
    c.drawImage(plate, 0, 0);
    paintWithFinePixels(c, () => scenes[name](t));
    return canvas.toDataURL('image/jpeg', 0.93).split(',')[1];
  },
});
