import {
  assemble, box, boxPart, cablePart, countOpt, cylPart, detailOpt, factory,
  faceCyl, faceRing, linkPart, part, prisma, smallSphere, type AssetFactory, type AssetPart,
} from './common.ts';
import { box as rawBox, cylinder, merge, place, sphere, torus, voxels } from '../three.ts';

export const shield = factory('shield', 'Faceted steel shield with raised boss, riveted rim and deep central ridge', () => {
  const p: AssetPart[] = [
    prisma('shield-plate', [[0, 1.05], [0.85, 0.72], [0.72, -0.18], [0.38, -0.72], [0, -1.02], [-0.38, -0.72], [-0.72, -0.18], [-0.85, 0.72]], 0.22, 1),
    prisma('inner-engraved-field', [[0, 0.76], [0.6, 0.52], [0.52, -0.12], [0.28, -0.57], [0, -0.78], [-0.28, -0.57], [-0.52, -0.12], [-0.6, 0.52]], 0.025, 0, -0.13),
    boxPart('central-ridge', 0.08, 1.25, 0.055, 2, [0, 0.04, -0.18]),
    boxPart('cross-ridge', 1.08, 0.075, 0.05, 2, [0, 0.28, -0.18]),
    faceCyl('shield-boss', 0.22, 0.11, 2, [0, -0.08, -0.21], 24),
    faceRing('boss-rim', 0.17, 0.035, 1, [0, -0.08, -0.28], 24),
  ];
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI * 0.8 + i * Math.PI * 0.32;
    p.push(part('rim-rivet-' + i, sphere(0.06, 10, 6, 2), [Math.sin(a) * 0.65, Math.cos(a) * 0.65, -0.17]));
  }
  return assemble('shield', shield.describe, p);
});

export const padlock = factory('padlock', 'Solid cast padlock with oversized steel shackle, layered body, keyway and stamped escutcheon', () => {
  const p: AssetPart[] = [
    faceRing('shackle', 0.43, 0.105, 2, [0, 0.58, 0], 28),
    boxPart('shackle-leg-left', 0.18, 0.56, 0.2, 2, [-0.42, 0.36, 0]),
    boxPart('shackle-leg-right', 0.18, 0.56, 0.2, 2, [0.42, 0.36, 0]),
    boxPart('lock-body', 1.22, 1.05, 0.47, 1, [0, -0.34, 0]),
    boxPart('front-inset', 0.94, 0.78, 0.06, 0, [0, -0.34, -0.27]),
    faceRing('escutcheon-rim', 0.16, 0.035, 2, [0, -0.38, -0.32], 20),
    faceCyl('keyway-top', 0.07, 0.035, 4, [0, -0.36, -0.34], 16),
    boxPart('keyway-slot', 0.07, 0.17, 0.03, 4, [0, -0.48, -0.34]),
    boxPart('body-crown', 1.3, 0.12, 0.53, 2, [0, 0.17, 0]),
  ];
  for (let i = 0; i < 4; i++) p.push(faceCyl('body-rivet-' + i, 0.055, 0.045, 2, [i % 2 ? 0.47 : -0.47, i < 2 ? -0.03 : -0.64, -0.31], 10));
  return assemble('padlock', padlock.describe, p);
});

export const key = factory('key', 'Machined warded key with open bow, long shaft, stepped bit and separated tooth notches', () => {
  const p: AssetPart[] = [
    part('key-bow', torus(0.33, 0.1, 24, 8, 2), [-0.53, 0, 0]),
    boxPart('key-bow-bridge', 0.28, 0.14, 0.18, 2, [-0.25, 0, 0]),
    boxPart('key-shaft', 1.14, 0.13, 0.15, 1, [0.39, 0, 0]),
    boxPart('bit-shoulder', 0.18, 0.29, 0.19, 2, [0.9, -0.06, 0]),
    boxPart('first-tooth', 0.14, 0.28, 0.17, 2, [0.74, -0.21, 0]),
    boxPart('second-tooth', 0.14, 0.22, 0.17, 2, [1.06, -0.18, 0]),
    boxPart('shaft-groove', 0.62, 0.035, 0.025, 4, [0.4, 0.035, -0.085]),
  ];
  return assemble('key', key.describe, p);
});

export const balanceScale = factory('balance-scale', 'Classic balance scale with separate beam, hanging chains and removable metal pans', () => {
  const p: AssetPart[] = [
    boxPart('weighted-base', 1.6, 0.2, 0.82, 1, [0, -0.94, 0]),
    cylPart('pedestal', 0.19, 1.25, 2, [0, -0.24, 0], 20),
    faceCyl('central-pivot', 0.22, 0.24, 2, [0, 0.42, 0], 20),
    linkPart('balance-beam', [-1.18, 0.43, 0], [1.18, 0.43, 0], 0.11, 1),
    faceRing('left-beam-jewel', 0.11, 0.035, 2, [-1.12, 0.43, -0.08], 16),
    faceRing('right-beam-jewel', 0.11, 0.035, 2, [1.12, 0.43, -0.08], 16),
    part('left-chain-front', cylinder(0.025, 0.62, 8, 2), [-1.02, 0.03, -0.2]),
    part('left-chain-back', cylinder(0.025, 0.62, 8, 2), [-1.02, 0.03, 0.2]),
    part('right-chain-front', cylinder(0.025, 0.62, 8, 2), [1.02, 0.03, -0.2]),
    part('right-chain-back', cylinder(0.025, 0.62, 8, 2), [1.02, 0.03, 0.2]),
    part('left-pan', cylinder(0.56, 0.09, 28, 1, 1, 0.38), [-1.02, -0.32, 0]),
    part('right-pan', cylinder(0.56, 0.09, 28, 1, 1, 0.38), [1.02, -0.32, 0]),
    boxPart('top-finial', 0.18, 0.2, 0.18, 2, [0, 0.68, 0]),
  ];
  return assemble('balance-scale', balanceScale.describe, p);
});

export const dice = factory('dice', 'Beveled ivory die with deeply inset pips on three visible faces', () => {
  const p: AssetPart[] = [
    boxPart('die-body', 1.2, 1.2, 1.2, 5),
    boxPart('beveled-top', 1.08, 0.045, 1.08, 0, [0, 0.6, 0]),
  ];
  const pip = (name: string, x: number, y: number, z: number) => p.push(part(name, sphere(0.085, 12, 8, 4), [x, y, z]));
  // Front face shows five; top shows six; right side shows three.
  for (const [i, [x, y]] of [[-1, [-0.31, -0.31]], [0, [0, 0]], [1, [0.31, 0.31]], [2, [-0.31, 0.31]], [3, [0.31, -0.31]]] as Array<[number, number[]]>) pip('front-pip-' + i, x, y, -0.615);
  for (let col = 0; col < 3; col++) for (let row = 0; row < 2; row++) pip('top-pip-' + col + '-' + row, -0.35 + col * 0.35, 0.625, -0.3 + row * 0.6);
  for (const [i, [y, z]] of [[0, [-0.3, -0.3]], [1, [0, 0]], [2, [0.3, 0.3]]] as Array<[number, number[]]>) pip('side-pip-' + i, 0.615, y, z);
  return assemble('dice', dice.describe, p);
});

export const trophy = factory('trophy', 'Polished cup trophy with flared bowl, twin handles, engraved plinth and stepped pedestal', () => {
  const p: AssetPart[] = [
    cylPart('cup-bowl', 0.68, 0.82, 2, [0, 0.55, 0], 28, 0.42),
    cylPart('cup-rim', 0.69, 0.11, 2, [0, 0.99, 0], 28),
    cylPart('stem', 0.16, 0.48, 1, [0, 0.0, 0], 16),
    cylPart('upper-pedestal', 0.38, 0.18, 1, [0, -0.33, 0], 20),
    cylPart('lower-pedestal', 0.56, 0.22, 2, [0, -0.55, 0], 24),
    boxPart('award-plaque', 0.48, 0.12, 0.035, 4, [0, -0.55, -0.58]),
    part('left-handle', torus(0.36, 0.075, 20, 7, 1), [-0.59, 0.65, 0], [0, 0, Math.PI / 2]),
    part('right-handle', torus(0.36, 0.075, 20, 7, 1), [0.59, 0.65, 0], [0, 0, Math.PI / 2]),
  ];
  return assemble('trophy', trophy.describe, p);
});

export const crown = factory('crown', 'Faceted royal crown with alternating tall points, inset rim and steel orb finials', () => {
  const p: AssetPart[] = [
    cylPart('crown-band', 0.74, 0.26, 2, [0, -0.34, 0], 32, 0.68),
    cylPart('inner-band', 0.63, 0.12, 1, [0, -0.47, 0], 32),
  ];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2, x = Math.cos(a) * 0.61, z = Math.sin(a) * 0.61;
    p.push(part('crown-point-' + i, prisma('point', [[-0.19, -0.04], [0.19, -0.04], [0, 0.58 + (i % 2) * 0.2]], 0.2, i % 2 ? 0 : 2).mesh, [x, -0.17, z], [0, a + Math.PI / 2, 0]));
    p.push(part('finial-' + i, sphere(0.09, 12, 8, 2), [x, 0.4 + (i % 2) * 0.2, z]));
  }
  p.push(part('front-medallion', sphere(0.16, 16, 10, 0), [0, -0.34, -0.7]));
  return assemble('crown', crown.describe, p);
});

export const magnet = factory('magnet', 'Heavy horseshoe magnet with sculpted steel arms, bright pole shoes and central keeper', () => {
  const p: AssetPart[] = [
    boxPart('left-pole', 0.32, 0.78, 0.36, 1, [-0.61, 0.12, 0]),
    boxPart('right-pole', 0.32, 0.78, 0.36, 1, [0.61, 0.12, 0]),
    boxPart('curved-crossbar', 1.28, 0.38, 0.36, 1, [0, 0.68, 0]),
    boxPart('left-pole-shoe', 0.4, 0.22, 0.44, 2, [-0.61, -0.37, 0]),
    boxPart('right-pole-shoe', 0.4, 0.22, 0.44, 2, [0.61, -0.37, 0]),
    boxPart('keeper-bar', 1.26, 0.12, 0.34, 0, [0, -0.54, 0]),
  ];
  return assemble('magnet', magnet.describe, p);
});

export const ladder = factory('ladder', 'Rigid industrial ladder with separate rails, twelve evenly spaced rungs and reinforced feet', opts => {
  const n = countOpt(opts, 10, 18), p: AssetPart[] = [
    linkPart('left-rail', [-0.48, -1.2, 0], [-0.48, 1.2, 0], 0.13, 1),
    linkPart('right-rail', [0.48, -1.2, 0], [0.48, 1.2, 0], 0.13, 1),
    boxPart('left-foot', 0.24, 0.12, 0.34, 4, [-0.48, -1.22, 0]),
    boxPart('right-foot', 0.24, 0.12, 0.34, 4, [0.48, -1.22, 0]),
  ];
  for (let i = 0; i < n; i++) {
    const y = -1.02 + i * (2.04 / Math.max(1, n - 1));
    p.push(boxPart('rung-' + (i + 1), 0.9, 0.08, 0.16, 2, [0, y, -0.02]));
    p.push(boxPart('left-rivet-' + i, 0.07, 0.07, 0.18, 4, [-0.48, y, -0.04]));
    p.push(boxPart('right-rivet-' + i, 0.07, 0.07, 0.18, 4, [0.48, y, -0.04]));
  }
  return assemble('ladder', ladder.describe, p);
});

export const seesaw = factory('seesaw', 'Playful seesaw with pivoting plank, fulcrum, rounded safety ends and ground plate', () => {
  const p: AssetPart[] = [
    boxPart('ground-plinth', 1.45, 0.14, 0.65, 4, [0, -0.91, 0]),
    prisma('fulcrum', [[-0.45, -0.62], [0.45, -0.62], [0, 0.32]], 0.54, 1, 0),
    linkPart('pivot-axle', [-0.18, -0.25, 0], [0.18, -0.25, 0], 0.16, 2),
    part('seesaw-plank', box(2.3, 0.16, 0.53, 0), [0, 0.23, 0], [0, 0, -0.16]),
    boxPart('left-end-grip', 0.18, 0.23, 0.58, 1, [-1.06, 0.08, 0]),
    boxPart('right-end-grip', 0.18, 0.23, 0.58, 1, [1.06, 0.38, 0]),
    boxPart('left-seat', 0.54, 0.1, 0.58, 2, [-0.8, -0.01, 0]),
    boxPart('right-seat', 0.54, 0.1, 0.58, 2, [0.8, 0.48, 0]),
  ];
  return assemble('seesaw', seesaw.describe, p);
});

export const ropeBridge = factory('rope-bridge', 'Suspension rope bridge built from separately movable wooden planks, catenary cables and upright hangers', opts => {
  const n = countOpt(opts, 9, 16), p: AssetPart[] = [];
  for (let i = 0; i < n; i++) {
    const x = -1.25 + i * (2.5 / Math.max(1, n - 1)), sag = 0.18 * (1 - (x / 1.25) ** 2);
    p.push(boxPart('plank-' + (i + 1), 0.27, 0.1, 0.78, 6, [x, -sag, 0]));
    for (const z of [-0.47, 0.47]) {
      const cableY = 0.55 - 0.2 * (1 - (x / 1.25) ** 2);
      p.push(linkPart('suspension-hanger-' + i + '-' + z, [x, -sag + 0.03, z], [x, cableY, z], 0.04, 4));
    }
  }
  for (const z of [-0.47, 0.47]) for (let i = 0; i < n - 1; i++) {
    const x1 = -1.25 + i * (2.5 / (n - 1)), x2 = -1.25 + (i + 1) * (2.5 / (n - 1));
    const y1 = 0.55 - 0.2 * (1 - (x1 / 1.25) ** 2), y2 = 0.55 - 0.2 * (1 - (x2 / 1.25) ** 2);
    p.push(cablePart('upper-rope-' + i + '-' + z, [x1, y1, z], [x2, y2, z], 0.045, 4));
  }
  return assemble('rope-bridge', ropeBridge.describe, p);
});

export const bomb = factory('bomb', 'Classic cast iron bomb with ribbed casing, stepped nose, warning studs and separate lit fuse', () => {
  const p: AssetPart[] = [
    part('bomb-casing', sphere(0.72, 24, 16, 4), [0, -0.14, 0]),
    cylPart('nose-collar', 0.3, 0.23, 1, [0, 0.57, 0], 16),
    cylPart('nose-cap', 0.18, 0.3, 2, [0, 0.81, 0], 16, 0),
    boxPart('tail-fin-hub', 0.24, 0.2, 0.24, 1, [0, -0.82, 0]),
    boxPart('tail-fin-left', 0.54, 0.08, 0.14, 1, [-0.32, -0.73, 0]),
    boxPart('tail-fin-right', 0.54, 0.08, 0.14, 1, [0.32, -0.73, 0]),
    boxPart('tail-fin-front', 0.14, 0.08, 0.54, 1, [0, -0.73, -0.32]),
    boxPart('tail-fin-back', 0.14, 0.08, 0.54, 1, [0, -0.73, 0.32]),
    cablePart('fuse-cord', [0.18, 0.88, 0], [0.54, 1.14, 0], 0.04, 4),
    part('fuse-spark', sphere(0.12, 10, 8, 10), [0.59, 1.19, 0]),
  ];
  for (let i = 0; i < 10; i++) p.push(boxPart('casing-rib-' + i, 0.055, 0.54, 0.045, 1, [Math.cos(i * Math.PI / 5) * 0.68, -0.14, Math.sin(i * Math.PI / 5) * 0.68]));
  return assemble('bomb', bomb.describe, p);
});

export const dominoRow = factory('domino-row', 'Deterministic row of individually named pip-marked dominoes, staged at the edge of a topple', opts => {
  const n = countOpt(opts, 9, 20), p: AssetPart[] = [];
  for (let i = 0; i < n; i++) {
    const x = -1.1 + i * (2.2 / Math.max(1, n - 1)), tilt = Math.max(0, i - (n - 3)) * 0.2;
    const body = box(0.2, 0.56, 0.11, 5);
    const marks = [
      place(box(0.1, 0.025, 0.02, 1), { pos: [0, 0, -0.061] }),
      place(sphere(0.036, 8, 6, 4), { pos: [-0.045, 0.13, -0.075] }),
      place(sphere(0.036, 8, 6, 4), { pos: [0.045, -0.13, -0.075] }),
    ];
    p.push(part('domino-' + (i + 1), merge(body, ...marks), [x, 0.3, 0], [0, 0, -tilt]));
  }
  return assemble('domino-row', dominoRow.describe, p);
});

export const houseOfCards = factory('house-of-cards', 'Fragile three-dimensional house of cards with leaning card pairs and a separately balanced cap', () => {
  const card = box(0.52, 0.8, 0.035, 5);
  const p: AssetPart[] = [
    part('left-card-pair-front', card, [-0.3, -0.32, -0.22], [0, 0, 0.58]),
    part('left-card-pair-back', card, [-0.3, -0.32, 0.22], [0, 0, -0.58]),
    part('right-card-pair-front', card, [0.3, -0.32, -0.22], [0, 0, -0.58]),
    part('right-card-pair-back', card, [0.3, -0.32, 0.22], [0, 0, 0.58]),
    boxPart('lower-cross-card', 1.2, 0.08, 0.52, 5, [0, -0.71, 0]),
    boxPart('upper-balanced-card', 1.38, 0.09, 0.62, 0, [0, 0.18, 0]),
    part('top-tent-left', card, [-0.31, 0.61, -0.18], [0, 0, 0.54]),
    part('top-tent-right', card, [0.31, 0.61, 0.18], [0, 0, -0.54]),
    boxPart('top-cap-card', 0.95, 0.075, 0.48, 5, [0, 1.04, 0]),
  ];
  return assemble('house-of-cards', houseOfCards.describe, p);
});

export const bubble = factory('bubble', 'Translucent faceted glass bubble with bright rim arc, highlight patch and inner reflection', opts => {
  const d = detailOpt(opts), segments = Math.round(24 * d), p: AssetPart[] = [
    part('glass-sphere', sphere(0.88, segments, Math.max(8, Math.round(16 * d)), 3), [0, 0, 0]),
    part('optical-rim', torus(0.87, 0.025, segments, 6, 2), [0, 0, 0.02], [Math.PI / 2, 0, 0]),
    part('specular-highlight', sphere(0.16, 12, 8, 10), [-0.36, 0.43, -0.62]),
    boxPart('secondary-glint', 0.11, 0.035, 0.025, 2, [0.45, -0.42, -0.7]),
  ];
  return assemble('bubble', bubble.describe, p);
});

export const balloon = factory('balloon', 'Pearl-grey balloon with pinched neck, tied knot, delicate string and subtle seam ribs', opts => {
  const d = detailOpt(opts), p: AssetPart[] = [
    part('balloon-envelope', sphere(0.68, Math.round(24 * d), Math.round(16 * d), 0), [0, 0.43, 0], [0, 0, 0.05]),
    cylPart('neck', 0.14, 0.2, 0, [0, -0.23, 0], 14, 0.08),
    part('tied-knot', prisma('knot-shape', [[-0.1, 0.04], [0.1, 0.04], [0, -0.12]], 0.15, 1).mesh, [0, -0.34, 0]),
    cablePart('balloon-string', [0, -0.39, 0], [0.13, -1.47, 0], 0.018, 4),
    linkPart('left-seam', [-0.12, 1.04, 0], [0, 0.86, -0.59], 0.022, 1),
    linkPart('right-seam', [0.12, 1.04, 0], [0, 0.86, 0.59], 0.022, 1),
  ];
  return assemble('balloon', balloon.describe, p);
});

export const anvil = factory('anvil', 'Forged blacksmith anvil with flat horn, hardy hole, waist, four feet and bevelled striking face', () => {
  const p: AssetPart[] = [
    boxPart('anvil-foot', 1.2, 0.24, 0.84, 4, [0, -0.78, 0]),
    prisma('anvil-waist', [[-0.64, -0.65], [0.64, -0.65], [0.4, 0.1], [-0.4, 0.1]], 0.68, 1),
    boxPart('striking-face', 1.45, 0.23, 0.82, 2, [0, 0.23, 0]),
    prisma('horn', [[0.6, 0.2], [1.3, 0.2], [1.18, -0.02], [0.6, -0.02]], 0.55, 2),
    boxPart('heel', 0.5, 0.24, 0.82, 1, [-0.92, 0.21, 0]),
    boxPart('hardy-hole', 0.16, 0.025, 0.18, 4, [-0.43, 0.36, -0.02]),
    boxPart('step-hole', 0.11, 0.025, 0.12, 4, [-0.19, 0.36, -0.02]),
  ];
  return assemble('anvil', anvil.describe, p);
});

export const gear = factory('gear', 'Heavy steel cog with individually visible square teeth, machined ring, hub and six spokes', opts => {
  const n = countOpt(opts, 12, 24), p: AssetPart[] = [
    cylPart('gear-blank', 0.68, 0.3, 1, [0, 0, 0], 36),
    part('machined-inner-ring', torus(0.45, 0.06, 32, 8, 2), [0, 0.16, 0]),
    cylPart('central-hub', 0.3, 0.38, 2, [0, 0.02, 0], 24),
    cylPart('axle-bore', 0.13, 0.4, 4, [0, 0.03, 0], 20),
  ];
  for (let i = 0; i < n; i++) {
    const a = i * Math.PI * 2 / n, x = Math.sin(a) * 0.77, z = Math.cos(a) * 0.77;
    p.push(part('tooth-' + i, box(0.25, 0.32, 0.22, i % 3 ? 1 : 2), [x, 0, z], [0, a, 0]));
  }
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    p.push(boxPart('spoke-' + i, 0.11, 0.13, 0.37, 1, [Math.sin(a) * 0.25, 0.13, Math.cos(a) * 0.25]));
  }
  return assemble('gear', gear.describe, p);
});

export const conveyorBelt = factory('conveyor-belt', 'Heavy conveyor section with moving segmented belt, rollers, side rails and adjustable support legs', opts => {
  const n = countOpt(opts, 7, 14), p: AssetPart[] = [
    boxPart('conveyor-bed', 2.55, 0.16, 0.94, 4, [0, 0.0, 0]),
    boxPart('belt-surface', 2.36, 0.09, 0.8, 0, [0, 0.13, 0]),
    boxPart('left-side-rail', 2.65, 0.14, 0.09, 1, [0, 0.23, -0.49]),
    boxPart('right-side-rail', 2.65, 0.14, 0.09, 1, [0, 0.23, 0.49]),
    boxPart('support-crossbar', 2.1, 0.1, 0.12, 2, [0, -0.54, 0]),
  ];
  for (let i = 0; i < n; i++) {
    const x = -1.05 + i * (2.1 / Math.max(1, n - 1));
    p.push(part('belt-cleat-' + i, box(0.12, 0.035, 0.78, i % 2 ? 1 : 2), [x, 0.19, 0]));
    p.push(part('roller-' + i, cylinder(0.13, 0.78, 14, 2), [x, -0.02, 0], [Math.PI / 2, 0, 0]));
  }
  for (const x of [-0.86, 0.86]) for (const z of [-0.28, 0.28]) p.push(linkPart('support-leg-' + x + '-' + z, [x, -0.08, z], [x, -0.88, z], 0.09, 1));
  return assemble('conveyor-belt', conveyorBelt.describe, p);
});

export const bull = factory('bull', 'Charismatic voxel bull with broad shoulders, lowered charging head, horns and hooves', () => {
  const rows = [
    '0000022000000000',
    '0000222200000000',
    '0002222220002200',
    '0022222222022220',
    '0222222222222200',
    '0222222222222000',
    '0022222222220000',
    '0002222222200000',
    '0002220222200000',
    '0002200220200000',
    '0002200220200000',
    '0002200220200000',
    '0002200220200000',
    '0004400440000000',
  ];
  const p: AssetPart[] = [
    part('voxel-bull', voxels(rows, 3, 2.2), [0, 0, 0]),
    part('left-horn', prisma('horn-shape', [[-0.2, -0.05], [0.08, -0.05], [-0.34, 0.3]], 0.18, 0).mesh, [0.7, 0.68, -0.18]),
    part('right-horn', prisma('horn-shape', [[-0.08, -0.05], [0.2, -0.05], [0.34, 0.3]], 0.18, 0).mesh, [1.0, 0.68, -0.18]),
    boxPart('nose-band', 0.38, 0.13, 0.1, 2, [0.72, 0.1, -0.25]),
    part('eye', sphere(0.05, 8, 6, 4), [0.9, 0.51, -0.28]),
  ];
  return assemble('bull', bull.describe, p);
});

export const bear = factory('bear', 'Friendly voxel bear with round ears, stout paws, bright eyes and soft charcoal-grey fur', () => {
  const rows = [
    '0000002200000000',
    '0000022222000000',
    '0002222222220000',
    '0022222222222000',
    '0222222222222200',
    '0222222222222200',
    '0222222222222200',
    '0022222222222000',
    '0002222222220000',
    '0002200220022000',
    '0002200220022000',
    '0002200220022000',
    '0002200220022000',
    '0002200220022000',
    '0001100110011000',
  ];
  const p: AssetPart[] = [
    part('voxel-bear', voxels(rows, 3, 2.1), [0, 0, 0]),
    part('left-ear', sphere(0.18, 12, 8, 1), [-0.47, 0.79, -0.2]),
    part('right-ear', sphere(0.18, 12, 8, 1), [0.47, 0.79, -0.2]),
    part('muzzle', sphere(0.25, 14, 10, 0), [0, 0.18, -0.28]),
    part('left-eye', sphere(0.045, 8, 6, 4), [-0.18, 0.42, -0.34]),
    part('right-eye', sphere(0.045, 8, 6, 4), [0.18, 0.42, -0.34]),
    part('nose', sphere(0.09, 10, 7, 4), [0, 0.18, -0.48]),
  ];
  return assemble('bear', bear.describe, p);
});

export const laptop = factory('laptop', 'Open ultrabook with thin machined chassis, luminous glass display, hinge, keyboard and large trackpad', () => {
  const p: AssetPart[] = [
    boxPart('keyboard-deck', 1.82, 0.12, 1.25, 1, [0, -0.34, 0.32]),
    boxPart('keyboard-field', 1.47, 0.045, 0.57, 4, [0, -0.255, 0.12]),
    boxPart('screen-shell', 1.82, 1.2, 0.12, 1, [0, 0.31, -0.38]),
    boxPart('screen-glass', 1.59, 0.95, 0.035, 3, [0, 0.32, -0.46]),
    boxPart('screen-light', 1.38, 0.055, 0.02, 10, [0, 0.11, -0.49]),
    boxPart('screen-light-2', 0.9, 0.045, 0.02, 0, [0, -0.01, -0.49]),
    boxPart('trackpad', 0.58, 0.035, 0.42, 2, [0, -0.255, 0.78]),
    boxPart('hinge', 1.25, 0.11, 0.13, 2, [0, -0.3, -0.28]),
    boxPart('front-lip', 1.84, 0.08, 0.1, 2, [0, -0.4, 0.94]),
  ];
  for (let row = 0; row < 4; row++) for (let col = 0; col < 12; col++) p.push(boxPart('key-' + row + '-' + col, 0.085, 0.033, 0.09, (row + col) % 7 === 0 ? 2 : 0, [-0.69 + col * 0.125, -0.21, -0.11 + row * 0.13]));
  return assemble('laptop', laptop.describe, p);
});

export const shoppingCart = factory('shopping-cart', 'Wire shopping cart with sculpted basket lattice, child seat, push handle and four swivel wheels', opts => {
  const n = countOpt(opts, 7, 12), p: AssetPart[] = [
    boxPart('basket-bottom', 1.2, 0.08, 0.76, 1, [0, 0.18, 0]),
    linkPart('front-slope-left', [0.48, 0.18, -0.35], [0.1, 0.84, -0.35], 0.06, 1),
    linkPart('front-slope-right', [0.48, 0.18, 0.35], [0.1, 0.84, 0.35], 0.06, 1),
    linkPart('rear-wall-left', [-0.55, 0.18, -0.35], [-0.55, 0.78, -0.35], 0.06, 1),
    linkPart('rear-wall-right', [-0.55, 0.18, 0.35], [-0.55, 0.78, 0.35], 0.06, 1),
    linkPart('top-rim-left', [-0.55, 0.78, -0.35], [0.1, 0.84, -0.35], 0.06, 2),
    linkPart('top-rim-right', [-0.55, 0.78, 0.35], [0.1, 0.84, 0.35], 0.06, 2),
    linkPart('push-handle-neck', [-0.55, 0.78, 0], [-0.94, 1.1, 0], 0.07, 1),
    boxPart('rubber-grip', 0.14, 0.14, 0.75, 4, [-1.0, 1.11, 0]),
    linkPart('underframe', [0.2, 0.14, 0], [-0.65, -0.4, 0], 0.09, 1),
    linkPart('front-wheel-axle', [0.26, -0.4, -0.46], [0.26, -0.4, 0.46], 0.08, 2),
    linkPart('rear-wheel-axle', [-0.72, -0.4, -0.46], [-0.72, -0.4, 0.46], 0.08, 2),
  ];
  for (let i = 0; i < n; i++) {
    const y = 0.25 + i * (0.49 / Math.max(1, n - 1));
    p.push(linkPart('basket-wire-left-' + i, [-0.53, y, -0.36], [0.26 - (y - 0.25) * 0.7, y, -0.36], 0.028, 2));
    p.push(linkPart('basket-wire-right-' + i, [-0.53, y, 0.36], [0.26 - (y - 0.25) * 0.7, y, 0.36], 0.028, 2));
    p.push(linkPart('basket-cross-wire-' + i, [-0.54 + i * 0.09, 0.2, -0.36], [-0.54 + i * 0.09, 0.75, -0.36], 0.028, 2));
    p.push(linkPart('basket-cross-wire-back-' + i, [-0.54 + i * 0.09, 0.2, 0.36], [-0.54 + i * 0.09, 0.75, 0.36], 0.028, 2));
  }
  for (const x of [-0.72, 0.26]) for (const z of [-0.47, 0.47]) {
    p.push(part('wheel-' + x + '-' + z, cylinder(0.17, 0.12, 16, 4), [x, -0.47, z], [Math.PI / 2, 0, 0]));
    p.push(part('wheel-hub-' + x + '-' + z, cylinder(0.07, 0.14, 12, 2), [x, -0.47, z * 1.03], [Math.PI / 2, 0, 0]));
  }
  return assemble('shopping-cart', shoppingCart.describe, p);
});

export const OBJECT_ASSETS = {
  shield, padlock, key, 'balance-scale': balanceScale, dice, trophy, crown, magnet,
  ladder, seesaw, 'rope-bridge': ropeBridge, bomb, 'domino-row': dominoRow,
  'house-of-cards': houseOfCards, bubble, balloon, anvil, gear,
  'conveyor-belt': conveyorBelt, bull, bear, laptop, 'shopping-cart': shoppingCart,
} satisfies Record<string, AssetFactory>;

