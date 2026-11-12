import {
  ASSET_MATERIALS, assemble, box, boxPart, cablePart, countOpt, cylPart, detailOpt,
  faceCyl, faceRing, factory, linkPart, part, prisma, seeded, smallSphere, sphere,
  token, type AssetFactory, type AssetModel, type AssetOptions, type AssetPart, type Vec3,
  cylinder, merge, place, torus,
} from './common.ts';
import { box as rawBox, cone as rawCone, cylinder as rawCylinder, merge as mergeMeshes, place as move, sphere as rawSphere, torus as rawTorus, type Mesh } from '../three.ts';
import { detailedPhoneParts, PHONE_MATERIALS } from '../detailed-phone.ts';

function coinMesh(detail = 1): Mesh {
  const segments = Math.round(32 * detail);
  const bits: Mesh[] = [rawCylinder(0.55, 0.15, segments, 1, 2)];
  bits.push(move(rawTorus(0.44, 0.045, segments, 6, 2), { pos: [0, 0.084, 0] }));
  bits.push(move(rawTorus(0.34, 0.018, segments, 5, 0), { pos: [0, 0.09, 0] }));
  bits.push(move(rawCylinder(0.39, 0.02, segments, 0, 0), { pos: [0, 0.083, 0] }));
  // Raised monogram and engraved divider, kept chunky enough to survive at reel scale.
  bits.push(move(rawBox(0.075, 0.018, 0.47, 4), { pos: [0, 0.101, 0] }));
  bits.push(move(rawBox(0.33, 0.018, 0.065, 4), { pos: [0, 0.101, 0] }));
  bits.push(move(rawBox(0.065, 0.018, 0.28, 4), { pos: [-0.12, 0.101, 0] }));
  bits.push(move(rawBox(0.065, 0.018, 0.28, 4), { pos: [0.12, 0.101, 0] }));
  const ticks: Mesh[] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    ticks.push(move(rawBox(0.025, 0.085, 0.036, 2), { pos: [Math.cos(a) * 0.546, 0, Math.sin(a) * 0.546], rot: [0, -a, 0] }));
  }
  bits.push(mergeMeshes(...ticks));
  return mergeMeshes(...bits);
}
export const coin: AssetFactory = factory('coin', 'Reeded steel coin with concentric engraved rim and raised monogram', () =>
  assemble('coin', coin.describe, [
    part('coin-face-and-reeded-rim', coinMesh()),
  ]),
);

export const coinStack = factory('coin-stack', 'Generator for individually named, reeded coins stacked into a rising column', opts => {
  const n = countOpt(opts, 6, 18), spacing = 0.17;
  const parts = Array.from({ length: n }, (_, i) => part('coin-' + (i + 1), coinMesh(detailOpt(opts)), [Math.sin(i * 1.7) * 0.035, (i - (n - 1) / 2) * spacing, Math.cos(i * 1.3) * 0.025]));
  return assemble('coin-stack', coinStack.describe, parts);
});
export const coinPile = factory('coin-pile', 'Deterministic mound of individually movable engraved coins', opts => {
  const n = countOpt(opts, 13, 28), seed = Number(opts.seed ?? 1);
  const parts = Array.from({ length: n }, (_, i) => {
    const baseCount = Math.ceil(n * 0.5), middleCount = Math.ceil(n * 0.375);
    const layer = i < baseCount ? 0 : i < baseCount + middleCount ? 1 : 2 + Math.floor((i - baseCount - middleCount) / 4);
    const slot = layer === 0 ? i : layer === 1 ? i - baseCount : (i - baseCount - middleCount) % 4;
    const ring = layer === 0 ? baseCount : layer === 1 ? middleCount : 4;
    const radius = layer === 0 ? 0.43 : layer === 1 ? 0.22 : Math.max(0.04, 0.11 - (layer - 2) * 0.025);
    const a = (slot / ring) * Math.PI * 2 + layer * 0.42 + (seeded(i, seed) - 0.5) * 0.22;
    const x = Math.cos(a) * radius, z = Math.sin(a) * radius;
    const y = layer * 0.18 + (seeded(i + 100, seed) - 0.5) * 0.025;
    return part('coin-' + (i + 1), coinMesh(detailOpt(opts)), [x, y, z], [0, (seeded(i + 200, seed) - 0.5) * 0.18, (seeded(i + 300, seed) - 0.5) * 0.1]);
  });
  return assemble('coin-pile', coinPile.describe, parts);
});

export const banknote = factory('banknote', 'Fine paper banknote with engraved double border, serial blocks and portrait medallion', () => {
  const p: AssetPart[] = [
    boxPart('paper-note', 1.72, 0.94, 0.075, 5),
    boxPart('outer-engraved-frame', 1.54, 0.77, 0.018, 1, [0, 0, -0.047]),
    boxPart('inner-paper-field', 1.43, 0.66, 0.02, 5, [0, 0, -0.061]),
    faceCyl('portrait-medallion', 0.22, 0.025, 1, [-0.45, 0, -0.08], 24),
    faceRing('portrait-engraving', 0.16, 0.022, 4, [-0.45, 0, -0.1], 24),
    boxPart('portrait-relief', 0.1, 0.21, 0.018, 0, [-0.45, 0, -0.11]),
    boxPart('central-denomination-stroke', 0.38, 0.08, 0.02, 4, [0.23, 0.15, -0.083]),
    boxPart('secondary-rule', 0.36, 0.035, 0.02, 1, [0.23, -0.01, -0.083]),
    boxPart('serial-top', 0.43, 0.035, 0.02, 4, [0.25, -0.23, -0.083]),
    boxPart('serial-bottom', 0.31, 0.025, 0.02, 1, [0.19, -0.3, -0.083]),
  ];
  for (const x of [-0.68, 0.68]) for (const y of [-0.31, 0.31]) {
    p.push(boxPart('corner-guilloche-' + x + '-' + y, 0.12, 0.11, 0.02, 1, [x, y, -0.075]));
  }
  return assemble('banknote', banknote.describe, p);
});

export const banknoteBundle = factory('banknote-bundle', 'Tightly aligned banknote brick with individual paper edges and a crosswise security band', opts => {
  const n = countOpt(opts, 7, 16), p: AssetPart[] = [];
  for (let i = 0; i < n; i++) p.push(part('note-' + (i + 1), rawBox(1.35, 0.1, 0.76, 5), [0, (i - (n - 1) / 2) * 0.105, (i % 2) * 0.012]));
  p.push(boxPart('security-band-front', 0.27, 0.82, 0.82, 1, [0, 0, -0.39]));
  p.push(boxPart('security-band-back', 0.27, 0.82, 0.82, 1, [0, 0, 0.39]));
  p.push(boxPart('band-top', 0.27, 0.1, 0.82, 2, [0, 0.4, 0]));
  p.push(boxPart('band-stamp', 0.16, 0.05, 0.015, 4, [0, 0.405, -0.42]));
  return assemble('banknote-bundle', banknoteBundle.describe, p);
});

export const ingot = factory('ingot', 'Machined trapezoid bullion bar in cool chrome with stamped serial and beveled shoulders', () => {
  const p: AssetPart[] = [
    prisma('chrome-ingot', [[-0.86, -0.3], [0.86, -0.3], [0.68, 0.29], [-0.68, 0.29]], 0.86, 2),
    prisma('raised-top-face', [[-0.64, -0.18], [0.64, -0.18], [0.53, 0.19], [-0.53, 0.19]], 0.025, 1, -0.445),
    boxPart('maker-stamp', 0.38, 0.055, 0.02, 4, [0, 0.045, -0.47]),
    boxPart('serial-stamp', 0.23, 0.035, 0.02, 4, [0, -0.065, -0.47]),
    boxPart('edge-highlight-front', 1.25, 0.035, 0.025, 0, [0, -0.28, -0.44]),
  ];
  return assemble('ingot', ingot.describe, p);
});

export const piggyBank = factory('piggy-bank', 'Charming ceramic pig bank with coin slot, snout, ears, feet and curly tail', () => {
  const p: AssetPart[] = [
    part('rounded-body', rawSphere(0.72, 24, 16, 0), [0, 0.02, 0]),
    part('head', rawSphere(0.38, 20, 12, 0), [0, 0.25, -0.62]),
    part('snout', rawCylinder(0.27, 0.18, 18, 0), [0, 0.14, -0.91], [Math.PI / 2, 0, 0]),
    faceCyl('snout-face', 0.19, 0.02, 1, [0, 0.14, -1.01], 18),
    boxPart('coin-slot', 0.32, 0.045, 0.025, 4, [0, 0.73, -0.08]),
    part('left-ear', prisma('ear-shape', [[-0.16, -0.06], [0.13, -0.06], [0.02, 0.24]], 0.13, 0).mesh, [-0.22, 0.48, -0.73]),
    part('right-ear', prisma('ear-shape', [[-0.16, -0.06], [0.13, -0.06], [0.02, 0.24]], 0.13, 0).mesh, [0.22, 0.48, -0.73]),
    part('left-eye', rawSphere(0.055, 10, 6, 4), [-0.15, 0.34, -0.94]),
    part('right-eye', rawSphere(0.055, 10, 6, 4), [0.15, 0.34, -0.94]),
    part('left-leg', rawCylinder(0.13, 0.25, 10, 1), [-0.42, -0.62, -0.13]),
    part('right-leg', rawCylinder(0.13, 0.25, 10, 1), [0.42, -0.62, -0.13]),
    part('rear-left-leg', rawCylinder(0.13, 0.25, 10, 1), [-0.42, -0.62, 0.28]),
    part('rear-right-leg', rawCylinder(0.13, 0.25, 10, 1), [0.42, -0.62, 0.28]),
    part('tail-curl', rawTorus(0.14, 0.045, 16, 6, 0), [0.71, 0.08, 0.4], [Math.PI / 2, 0, 0]),
  ];
  p.push(part('nostrils', mergeMeshes(
    move(rawSphere(0.035, 8, 5, 4), { pos: [-0.08, 0.14, -1.025] }),
    move(rawSphere(0.035, 8, 5, 4), { pos: [0.08, 0.14, -1.025] }),
  )));
  return assemble('piggy-bank', piggyBank.describe, p);
});

export const wallet = factory('wallet', 'Open leather wallet with stitched edge, bill pocket, layered card slots and peeking cards', () => {
  const p: AssetPart[] = [
    boxPart('rear-cover', 1.48, 0.1, 0.95, 4, [0, 0, 0.36]),
    boxPart('left-fold', 0.7, 0.12, 0.93, 4, [-0.39, 0, -0.1]),
    boxPart('right-fold', 0.7, 0.12, 0.93, 4, [0.39, 0, -0.1]),
    boxPart('bill-pocket-seam', 1.27, 0.04, 0.025, 1, [0, 0.08, 0.31]),
    boxPart('center-hinge', 0.08, 0.18, 0.88, 4),
    boxPart('left-card-pocket', 0.58, 0.045, 0.27, 1, [-0.39, 0.1, -0.1]),
    boxPart('right-card-pocket', 0.58, 0.045, 0.27, 1, [0.39, 0.1, -0.1]),
    boxPart('peeking-card-left', 0.42, 0.065, 0.46, 5, [-0.38, 0.2, -0.18]),
    boxPart('peeking-card-right', 0.42, 0.065, 0.46, 0, [0.38, 0.2, -0.18]),
    boxPart('card-chip', 0.12, 0.025, 0.12, 2, [-0.45, 0.24, -0.27]),
  ];
  for (let i = 0; i < 7; i++) p.push(boxPart('stitch-' + i, 0.035, 0.025, 0.02, 0, [-0.59 + i * 0.19, 0.082, -0.48]));
  return assemble('wallet', wallet.describe, p);
});

export const creditCard = factory('credit-card', 'Brushed metal payment card with clipped corners, chip module, magnetic stripe and embossed number blocks', () => {
  const p: AssetPart[] = [
    prisma('card-body', [[-0.9, -0.54], [0.82, -0.54], [0.9, -0.46], [0.9, 0.46], [0.82, 0.54], [-0.9, 0.54]], 0.07, 1),
    boxPart('magnetic-stripe', 1.7, 0.18, 0.02, 4, [0, 0.2, -0.047]),
    boxPart('chip-plaque', 0.28, 0.2, 0.025, 2, [-0.57, -0.16, -0.053]),
    boxPart('chip-center', 0.17, 0.13, 0.02, 1, [-0.57, -0.16, -0.072]),
    boxPart('chip-divider-v', 0.018, 0.14, 0.012, 4, [-0.57, -0.16, -0.085]),
    boxPart('chip-divider-h', 0.23, 0.018, 0.012, 4, [-0.57, -0.16, -0.085]),
  ];
  for (let i = 0; i < 12; i++) p.push(boxPart('embossed-digit-' + i, i % 3 === 0 ? 0.075 : 0.045, 0.045, 0.018, i % 4 === 0 ? 2 : 0, [-0.15 + (i % 4) * 0.2, -0.16 - Math.floor(i / 4) * 0.11, -0.05]));
  return assemble('credit-card', creditCard.describe, p);
});

export const bank = factory('bank', 'Classical stone bank with raised plinth, six fluted columns, pediment and broad steps', opts => {
  const d = detailOpt(opts), p: AssetPart[] = [
    boxPart('foundation', 2.5, 0.22, 1.35, 1, [0, -0.88, 0]),
    boxPart('upper-step', 2.3, 0.16, 1.2, 0, [0, -0.69, 0]),
    boxPart('column-platform', 2.13, 0.17, 0.86, 0, [0, -0.53, -0.08]),
    boxPart('rear-wall', 1.86, 1.25, 0.3, 0, [0, 0.14, 0.22]),
    boxPart('entablature', 2.28, 0.18, 0.96, 1, [0, 0.83, -0.05]),
    prisma('triangular-pediment', [[-1.12, 0], [1.12, 0], [0, 0.66]], 0.92, 0, 0.0),
  ];
  for (let i = 0; i < 6; i++) {
    const x = (i - 2.5) * 0.37;
    p.push(cylPart('column-' + (i + 1), 0.105 * d, 1.24, 0, [x, 0.08, -0.26], 12));
    p.push(cylPart('column-capital-' + (i + 1), 0.16, 0.09, 2, [x, 0.72, -0.26], 12));
    p.push(cylPart('column-base-' + (i + 1), 0.15, 0.11, 1, [x, -0.47, -0.26], 12));
    p.push(boxPart('flute-' + i, 0.018, 0.83, 0.018, 1, [x + 0.06, 0.07, -0.37]));
  }
  p.push(boxPart('dark-doorway', 0.42, 0.9, 0.08, 4, [0, -0.03, -0.16]));
  return assemble('bank', bank.describe, p);
});

export const vaultDoor = factory('vault-door', 'Heavy circular vault door with independently animated wheel, ring, hinge and eight locking bolts', opts => {
  const d = detailOpt(opts), bolts: Mesh[] = [];
  const n = Math.round(8 * d);
  for (let i = 0; i < n; i++) {
    const a = i * Math.PI * 2 / n;
    bolts.push(move(rawCylinder(0.075, 0.24, 10, 2), { pos: [Math.cos(a) * 0.77, Math.sin(a) * 0.77, -0.14], rot: [Math.PI / 2, 0, a] }));
    bolts.push(move(rawCylinder(0.095, 0.045, 12, 1), { pos: [Math.cos(a) * 0.77, Math.sin(a) * 0.77, -0.29], rot: [Math.PI / 2, 0, 0] }));
  }
  const spokes: Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 6;
    spokes.push(move(rawBox(0.055, 0.74, 0.075, 2), { pos: [0, 0, -0.39], rot: [0, 0, a] }));
  }
  const p: AssetPart[] = [
    faceCyl('door-disc', 1.05, 0.27, 1, [0, 0, 0], 40),
    faceRing('outer-machined-rim', 0.94, 0.085, 2, [0, 0, -0.18], 40),
    faceRing('inner-race', 0.65, 0.035, 0, [0, 0, -0.24], 32),
    part('wheel', rawTorus(0.33, 0.075, 32, 8, 2), [0, 0, -0.42], [Math.PI / 2, 0, 0]),
    part('wheel-hub', rawCylinder(0.12, 0.08, 20, 1), [0, 0, -0.44], [Math.PI / 2, 0, 0]),
    part('wheel-spokes', mergeMeshes(...spokes)),
    part('locking-bolts', mergeMeshes(...bolts)),
    boxPart('hinge-upper', 0.19, 0.34, 0.36, 1, [1.08, 0.58, 0.02]),
    boxPart('hinge-lower', 0.19, 0.34, 0.36, 1, [1.08, -0.58, 0.02]),
    part('hinge-pin', rawCylinder(0.07, 1.44, 12, 2), [1.08, 0, 0.1]),
  ];
  return assemble('vault-door', vaultDoor.describe, p);
});

export const vault = factory('vault', 'Armoured vault chamber with thick surround, recessed dark opening and detached detailed door', opts => {
  const d = detailOpt(opts), door = vaultDoor(opts).mesh;
  const p: AssetPart[] = [
    boxPart('rear-chamber', 2.55, 2.4, 0.48, 4, [0, 0, 0.42]),
    boxPart('left-armour-wall', 0.37, 2.55, 1.6, 1, [-1.26, 0, -0.02]),
    boxPart('right-armour-wall', 0.37, 2.55, 1.6, 1, [1.26, 0, -0.02]),
    boxPart('top-armour-lintel', 2.9, 0.38, 1.55, 1, [0, 1.26, -0.02]),
    boxPart('bottom-armour-sill', 2.9, 0.38, 1.55, 1, [0, -1.26, -0.02]),
    part('open-darkness', rawBox(2.06, 1.98, 0.1, 4), [0, 0, -0.3]),
    part('detached-vault-door', door, [1.45 * d, 0, -0.56], [0, 0.28, 0]),
  ];
  return assemble('vault', vault.describe, p);
});

export const safe = factory('safe', 'Compact steel safe with thick beveled casing, inset door, chrome dial, bolts and handle', opts => {
  const d = detailOpt(opts), p: AssetPart[] = [
    boxPart('cabinet-shell', 1.66, 1.9, 1.1, 1),
    boxPart('door-bevel', 1.43, 1.64, 0.16, 2, [0, 0, -0.6]),
    boxPart('recessed-door-face', 1.25, 1.45, 0.06, 0, [0, 0, -0.71]),
    faceRing('dial-ring', 0.29, 0.045, 2, [-0.28, 0.13, -0.78], 32),
    faceCyl('dial', 0.22, 0.07, 1, [-0.28, 0.13, -0.78], 24),
    faceCyl('dial-hub', 0.075, 0.04, 2, [-0.28, 0.13, -0.83], 16),
    boxPart('handle-post', 0.12, 0.5, 0.15, 2, [0.34, 0, -0.83]),
    boxPart('handle-crossbar', 0.42, 0.09, 0.13, 2, [0.47, -0.2, -0.83]),
  ];
  for (let i = 0; i < 6; i++) p.push(faceCyl('door-bolt-' + i, 0.06 * d, 0.08, 2, [(i % 2 ? 0.53 : -0.53), (Math.floor(i / 2) - 1) * 0.42, -0.79], 12));
  return assemble('safe', safe.describe, p);
});

export const ticker = factory('ticker-board', 'Black market ticker board with framed quote cells and red loss / green gain candles', opts => {
  const columns = countOpt(opts, 8, 16), p: AssetPart[] = [
    boxPart('board-casing', 2.2, 1.2, 0.22, 4),
    boxPart('display-glass', 2.02, 0.98, 0.025, 3, [0, 0, -0.13]),
    boxPart('top-header-rule', 1.75, 0.05, 0.02, 1, [0, 0.37, -0.16]),
  ];
  for (let i = 0; i < columns; i++) {
    const x = (i - (columns - 1) / 2) * 0.22;
    const up = i % 3 !== 1;
    p.push(boxPart('quote-column-' + i, 0.15, 0.13 + seeded(i, Number(opts.seed ?? 2)) * 0.3, 0.025, up ? 8 : 7, [x, -0.22 + (up ? 0.09 : -0.03), -0.16]));
    p.push(boxPart('quote-tick-' + i, 0.09 + seeded(i + 9) * 0.06, 0.035, 0.025, 0, [x, 0.09, -0.16]));
  }
  for (let i = 0; i < 4; i++) p.push(boxPart('ticker-symbol-' + i, 0.15 + (i % 2) * 0.08, 0.025, 0.02, 2, [-0.72 + i * 0.36, 0.39, -0.16]));
  p.push(boxPart('frame-foot', 2.0, 0.12, 0.3, 1, [0, -0.67, 0]));
  return assemble('ticker-board', ticker.describe, p);
});

export const candlestick = factory('candlestick', 'Standalone market candle with separate direction-coloured body and long steel wick', opts => {
  const up = opts.direction !== 'down', ramp = up ? 8 : 7, p: AssetPart[] = [
    boxPart('wick', 0.055, 1.46, 0.055, 1, [0, 0, 0]),
    boxPart('candle-body', 0.48, 0.78, 0.43, ramp, [0, up ? -0.02 : 0.08, -0.02]),
    boxPart('body-highlight', 0.08, 0.62, 0.035, up ? 8 : 7, [-0.12, up ? -0.02 : 0.08, -0.245]),
  ];
  return assemble('candlestick', candlestick.describe, p);
});

export const barChart = factory('bar-chart', 'Three-dimensional ascending bar chart with a shared plinth and individually named bars', opts => {
  const n = countOpt(opts, 6, 14), p: AssetPart[] = [
    boxPart('chart-base', 2.5, 0.12, 0.62, 4, [0, -0.67, 0]),
    boxPart('back-axis', 0.06, 1.5, 0.06, 1, [-1.1, 0.04, 0]),
    boxPart('bottom-axis', 2.35, 0.06, 0.06, 1, [0, -0.56, 0]),
  ];
  for (let i = 0; i < n; i++) {
    const h = 0.28 + 1.35 * ((i + 1) / n);
    const material = i === n - 1 ? 8 : 0;
    p.push(boxPart('bar-' + (i + 1), 2.0 / n, h, 0.42, material, [-0.88 + (i + 0.5) * 1.76 / n, -0.56 + h / 2, 0]));
    p.push(boxPart('bar-cap-' + (i + 1), 2.0 / n, 0.06, 0.44, material === 8 ? 8 : 1, [-0.88 + (i + 0.5) * 1.76 / n, -0.56 + h, 0]));
  }
  return assemble('bar-chart', barChart.describe, p);
});

export const lineChart = factory('line-chart', 'Extruded line-chart ribbon with raised data nodes generated from a number array', opts => {
  const values = Array.isArray(opts.values) && opts.values.length ? opts.values.slice(0, 20).map(v => Number(v) || 0) : [2, 3, 2.5, 5, 4, 7, 6.2, 9];
  const low = Math.min(...values), high = Math.max(...values), span = Math.max(0.001, high - low), n = values.length;
  const points: Vec3[] = values.map((v, i) => [-1.08 + (i / Math.max(1, n - 1)) * 2.16, -0.55 + ((v - low) / span) * 1.1, -0.04]);
  const p: AssetPart[] = [
    boxPart('chart-floor-axis', 2.45, 0.06, 0.08, 1, [0, -0.62, 0]),
    boxPart('chart-side-axis', 0.06, 1.42, 0.08, 1, [-1.16, 0.05, 0]),
  ];
  for (let i = 0; i < points.length - 1; i++) p.push(cablePart('ribbon-segment-' + i, points[i]!, points[i + 1]!, 0.055, 8));
  points.forEach((point, i) => p.push(smallSphere('data-node-' + (i + 1), 0.095, i === points.length - 1 ? 8 : 0, point, 12, 8)));
  return assemble('line-chart', lineChart.describe, p);
});

export const arrow = factory('arrow', 'Chunky extruded arrow with a removable shaft and arrowhead', opts => {
  const up = opts.direction !== 'down', material = up ? 8 : 7, sign = up ? 1 : -1;
  return assemble('arrow', arrow.describe, [
    boxPart('shaft', 0.38, 1.05, 0.5, material, [0, -0.18 * sign, 0]),
    prisma('arrowhead', [[-0.68, -0.22], [0.68, -0.22], [0, 0.52]], 0.5, material, 0.0),
  ].map(p => {
    if (up) return p;
    return { ...p, rot: [0, 0, Math.PI] };
  }));
});

export const hourglass = factory('hourglass', 'Steel-framed hourglass with two glass bulbs and visible falling sand', () => {
  const p: AssetPart[] = [
    boxPart('top-cap', 1.45, 0.15, 0.6, 1, [0, 1.0, 0]),
    boxPart('bottom-cap', 1.45, 0.15, 0.6, 1, [0, -1.0, 0]),
    linkPart('left-frame', [-0.6, 0.95, 0], [-0.27, -0.95, 0], 0.12, 2),
    linkPart('right-frame', [0.6, 0.95, 0], [0.27, -0.95, 0], 0.12, 2),
    part('upper-glass-bulb', rawSphere(0.61, 20, 12, 3), [0, 0.48, 0], [0, 0, Math.PI]),
    part('lower-glass-bulb', rawSphere(0.61, 20, 12, 3), [0, -0.48, 0]),
    part('upper-sand', rawCone(0.42, 0.42, 14, 5), [0, 0.52, 0]),
    part('falling-sand', rawCylinder(0.035, 0.42, 8, 5), [0, 0.02, 0]),
    part('sand-pile', rawCone(0.28, 0.22, 12, 5), [0, -0.79, 0]),
    boxPart('glass-waist-collar', 0.16, 0.07, 0.16, 2, [0, 0, 0]),
  ];
  return assemble('hourglass', hourglass.describe, p);
});

export const clock = factory('clock', 'Rimmed analogue clock with twelve raised hour markers and separate hands', () => {
  const p: AssetPart[] = [
    faceCyl('clock-case', 0.91, 0.28, 1, [0, 0, 0], 40),
    faceCyl('dial', 0.78, 0.035, 5, [0, 0, -0.16], 40),
    faceRing('chrome-bezel', 0.83, 0.075, 2, [0, 0, -0.19], 40),
    faceCyl('hand-pivot', 0.085, 0.08, 2, [0, 0, -0.22], 16),
    boxPart('minute-hand', 0.055, 0.55, 0.035, 4, [0, 0.26, -0.24]),
    boxPart('hour-hand', 0.36, 0.07, 0.035, 4, [-0.12, -0.06, -0.24]),
  ];
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6;
    p.push(boxPart('hour-marker-' + i, 0.07, 0.13, 0.025, 1, [Math.sin(a) * 0.65, Math.cos(a) * 0.65, -0.22]));
  }
  return assemble('clock', clock.describe, p);
});

export const calculator = factory('calculator', 'Precision desk calculator with inset display, solar strip and individually named tactile keys', () => {
  const p: AssetPart[] = [
    boxPart('calculator-shell', 1.12, 1.72, 0.22, 4),
    boxPart('display-bezel', 0.88, 0.31, 0.035, 1, [0, 0.53, -0.125]),
    boxPart('liquid-crystal-screen', 0.76, 0.2, 0.025, 3, [0, 0.53, -0.16]),
    boxPart('solar-panel', 0.34, 0.08, 0.025, 4, [-0.25, 0.27, -0.14]),
  ];
  for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
    const accent = col === 3 ? 1 : 0;
    p.push(boxPart('key-' + row + '-' + col, 0.16, 0.16, 0.07, accent, [-0.33 + col * 0.22, 0.04 - row * 0.25, -0.17]));
  }
  p.push(boxPart('wide-zero-key', 0.37, 0.16, 0.07, 0, [-0.22, -0.96, -0.17]));
  return assemble('calculator', calculator.describe, p);
});

export const briefcase = factory('briefcase', 'Ribbed steel briefcase with clasp plates, reinforced corners, top handle and carry grip', () => {
  const p: AssetPart[] = [
    boxPart('lower-case', 1.6, 0.86, 0.62, 1, [0, -0.1, 0]),
    boxPart('lid', 1.6, 0.58, 0.62, 0, [0, 0.59, 0]),
    boxPart('lid-seam', 1.63, 0.045, 0.66, 2, [0, 0.19, 0]),
    boxPart('handle-left-foot', 0.16, 0.18, 0.16, 2, [-0.28, 0.9, 0]),
    boxPart('handle-right-foot', 0.16, 0.18, 0.16, 2, [0.28, 0.9, 0]),
    boxPart('carry-handle', 0.62, 0.11, 0.14, 2, [0, 1.0, 0]),
  ];
  for (let i = 0; i < 4; i++) p.push(boxPart('front-rib-' + i, 0.06, 0.58, 0.035, 2, [-0.53 + i * 0.35, 0.59, -0.34]));
  for (const x of [-0.45, 0.45]) p.push(boxPart('front-clasp-' + x, 0.15, 0.25, 0.07, 4, [x, 0.09, -0.35]));
  return assemble('briefcase', briefcase.describe, p);
});

const PHONE_ASSET_MATERIALS = [
  { ...PHONE_MATERIALS[0], ramp: ASSET_MATERIALS[1]!.ramp },
  { ...PHONE_MATERIALS[1], ramp: ASSET_MATERIALS[4]!.ramp },
  { ...PHONE_MATERIALS[2], ramp: ASSET_MATERIALS[3]!.ramp },
  { ...PHONE_MATERIALS[3], ramp: ASSET_MATERIALS[5]!.ramp },
  { ...PHONE_MATERIALS[4], ramp: ASSET_MATERIALS[4]!.ramp },
  { ...PHONE_MATERIALS[5], ramp: ASSET_MATERIALS[2]!.ramp },
];
export const phone = factory('smartphone', 'Detailed reusable handset with machined rail, lock-screen interface, controls and rear camera island', () => {
  const names = ['machined-chassis', 'glass-screen', 'display-bezel', 'status-icons', 'lockscreen-clock', 'notification', 'app-dock', 'buttons-ports', 'rear-camera-island'];
  const p = detailedPhoneParts().map((mesh, i) => part(names[i] ?? 'phone-detail-' + i, mesh));
  return assemble('smartphone', phone.describe, p, PHONE_ASSET_MATERIALS);
});

export const atm = factory('atm', 'Walk-up ATM with recessed illuminated screen, keypad, card slot, cash tray and privacy wings', () => {
  const p: AssetPart[] = [
    boxPart('atm-cabinet', 1.36, 2.45, 0.92, 1),
    boxPart('front-control-panel', 1.12, 2.0, 0.08, 0, [0, 0, -0.5]),
    boxPart('screen-bezel', 0.84, 0.48, 0.055, 4, [0, 0.56, -0.56]),
    boxPart('screen-glass', 0.68, 0.31, 0.025, 10, [0, 0.57, -0.6]),
    boxPart('screen-baseline', 0.48, 0.025, 0.02, 0, [0, 0.54, -0.62]),
    boxPart('card-slot', 0.48, 0.07, 0.075, 4, [0, 0.04, -0.57]),
    boxPart('cash-dispenser', 0.72, 0.22, 0.11, 4, [0, -0.42, -0.58]),
    boxPart('cash-slot-lip', 0.58, 0.05, 0.05, 2, [0, -0.3, -0.64]),
  ];
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) p.push(boxPart('key-' + row + '-' + col, 0.13, 0.11, 0.05, 2, [-0.18 + col * 0.18, -0.15 - row * 0.15, -0.6]));
  for (const x of [-0.64, 0.64]) p.push(boxPart('privacy-wing-' + x, 0.12, 1.55, 0.42, 1, [x, 0.07, 0.2]));
  return assemble('atm', atm.describe, p);
});

export const printingPress = factory('printing-press', 'Industrial currency press with engraved rollers, paper feed path, control flywheel and output tray', opts => {
  const d = detailOpt(opts), p: AssetPart[] = [
    boxPart('cast-press-frame', 1.8, 1.32, 0.82, 4),
    cylPart('upper-engraving-roller', 0.31, 1.35, 2, [0, 0.34, -0.51], 32),
    cylPart('lower-feed-roller', 0.24, 1.35, 1, [0, -0.25, -0.51], 32),
    boxPart('paper-feed', 0.94, 0.06, 1.0, 5, [0, -0.59, -0.73]),
    boxPart('printed-sheet', 0.91, 0.05, 0.75, 5, [0, -0.54, -1.0]),
    faceCyl('flywheel', 0.38, 0.14, 1, [1.05, 0.11, -0.03], 32),
    faceRing('flywheel-rim', 0.33, 0.04, 2, [1.05, 0.11, -0.13], 32),
    boxPart('control-lever', 0.08, 0.62 * d, 0.08, 2, [1.28, 0.56, -0.12]),
    boxPart('output-table', 1.9, 0.16, 1.15, 1, [0, -0.84, 0.16]),
  ];
  for (let i = 0; i < 8; i++) p.push(boxPart('roller-groove-' + i, 0.035, 0.46, 0.02, i % 2 ? 4 : 1, [-0.56 + i * 0.16, 0.34, -0.79]));
  return assemble('printing-press', printingPress.describe, p);
});

export const moneyPrinter = factory('money-printer', 'High-speed money printer with paper reels, feed rollers, security hood and output banknotes', opts => {
  const base = printingPress(opts), extra: AssetPart[] = [
    boxPart('transparent-hood', 1.96, 0.68, 1.08, 3, [0, 0.62, 0.23]),
    cylPart('paper-reel-left', 0.34, 0.22, 2, [-0.64, 0.96, 0.52], 28),
    cylPart('paper-reel-right', 0.34, 0.22, 1, [0.64, 0.96, 0.52], 28),
    boxPart('banknote-output', 1.18, 0.08, 0.72, 5, [0, -0.65, -0.61]),
    boxPart('output-denomination-mark', 0.35, 0.025, 0.02, 1, [0, -0.59, -0.99]),
  ];
  return assemble('money-printer', moneyPrinter.describe, [...base.parts, ...extra]);
});

export const receipt = factory('receipt', 'Thermal receipt strip with perforated edge, item rows, totals separator and folded paper curl', () => {
  const p: AssetPart[] = [
    prisma('paper-strip', [[-0.55, 0.96], [0.55, 0.96], [0.55, -0.89], [0.36, -0.98], [0.18, -0.89], [0, -0.98], [-0.18, -0.89], [-0.36, -0.98], [-0.55, -0.89]], 0.055, 5),
    boxPart('store-header', 0.4, 0.1, 0.022, 1, [0, 0.73, -0.035]),
    boxPart('header-rule', 0.76, 0.025, 0.022, 1, [0, 0.55, -0.035]),
  ];
  for (let i = 0; i < 7; i++) {
    p.push(boxPart('item-row-' + i, 0.3 + (i % 3) * 0.08, 0.035, 0.02, i % 2 ? 1 : 4, [-0.17, 0.37 - i * 0.15, -0.035]));
    p.push(boxPart('price-' + i, 0.16, 0.035, 0.02, 4, [0.31, 0.37 - i * 0.15, -0.035]));
  }
  p.push(boxPart('total-separator', 0.78, 0.055, 0.025, 1, [0, -0.7, -0.04]));
  p.push(boxPart('total-amount', 0.29, 0.09, 0.025, 4, [0.25, -0.81, -0.04]));
  return assemble('receipt', receipt.describe, p);
});

export const FINANCE_ASSETS = {
  coin, 'coin-stack': coinStack, 'coin-pile': coinPile, banknote, 'banknote-bundle': banknoteBundle,
  ingot, 'piggy-bank': piggyBank, wallet, 'credit-card': creditCard, bank,
  'vault-door': vaultDoor, vault, safe, 'ticker-board': ticker, candlestick, 'bar-chart': barChart,
  'line-chart': lineChart, arrow, hourglass, clock, calculator, briefcase, smartphone: phone,
  atm, 'printing-press': printingPress, 'money-printer': moneyPrinter, receipt,
} satisfies Record<string, AssetFactory>;

