import {
  assemble, boxPart, countOpt, cylPart, detailOpt, factory, linkPart, part, prisma,
  seeded, type AssetFactory, type AssetPart,
} from './common.ts';
import { box, cylinder, place, sphere, torus, type Vec3 } from '../three.ts';

export const house = factory('house', 'Stepped stone house with pitched roof, recessed doorway, chimney, lintel and divided windows', () => {
  const p: AssetPart[] = [
    boxPart('stone-walls', 1.55, 1.08, 1.16, 0, [0, -0.13, 0]),
    prisma('gable', [[-0.78, 0], [0.78, 0], [0, 0.7]], 1.2, 0, 0),
    prisma('left-roof-slope', [[-0.9, 0.28], [0.02, 0.83], [0.02, 0.69], [-0.72, 0.18]], 1.36, 4, 0),
    prisma('right-roof-slope', [[-0.02, 0.83], [0.9, 0.28], [0.72, 0.18], [-0.02, 0.69]], 1.36, 1, 0),
    boxPart('chimney', 0.21, 0.68, 0.25, 1, [0.47, 0.75, 0.24]),
    boxPart('front-door', 0.38, 0.68, 0.08, 4, [0, -0.33, -0.62]),
    boxPart('door-panel', 0.25, 0.43, 0.025, 0, [0, -0.36, -0.67]),
    boxPart('door-knob', 0.055, 0.055, 0.035, 2, [0.12, -0.31, -0.7]),
  ];
  for (const x of [-0.48, 0.48]) {
    p.push(boxPart('window-recess-' + x, 0.36, 0.34, 0.055, 4, [x, -0.04, -0.61]));
    p.push(boxPart('window-glass-' + x, 0.27, 0.25, 0.028, 3, [x, -0.04, -0.65]));
    p.push(boxPart('window-mullion-v-' + x, 0.035, 0.29, 0.035, 1, [x, -0.04, -0.68]));
    p.push(boxPart('window-mullion-h-' + x, 0.3, 0.035, 0.035, 1, [x, -0.04, -0.68]));
    p.push(boxPart('window-sill-' + x, 0.44, 0.075, 0.12, 1, [x, -0.26, -0.66]));
  }
  p.push(boxPart('roof-ridge', 0.1, 0.09, 1.3, 2, [0, 0.67, 0]));
  return assemble('house', house.describe, p);
});

export const apartmentTower = factory('apartment-tower', 'Mid-rise apartment building with stepped roofline, balconies, window bays and recessed entrance', opts => {
  const floors = countOpt(opts, 7, 14), p: AssetPart[] = [
    boxPart('main-concrete-core', 1.36, 1.9, 0.92, 0),
    boxPart('roof-parapet', 1.54, 0.14, 1.04, 1, [0, 1.0, 0]),
    boxPart('ground-floor-plinth', 1.52, 0.22, 1.04, 1, [0, -0.93, 0]),
    boxPart('entrance', 0.38, 0.55, 0.055, 4, [0, -0.68, -0.49]),
    boxPart('entrance-lintel', 0.52, 0.09, 0.1, 2, [0, -0.38, -0.49]),
  ];
  for (let row = 0; row < floors; row++) {
    const y = -0.72 + row * (1.72 / Math.max(1, floors - 1));
    p.push(boxPart('floor-slab-' + row, 1.46, 0.045, 1.0, 1, [0, y - 0.11, 0]));
    for (let col = 0; col < 3; col++) {
      const x = (col - 1) * 0.39;
      p.push(boxPart('window-' + row + '-' + col, 0.23, 0.17, 0.035, 3, [x, y, -0.485]));
      p.push(boxPart('balcony-' + row + '-' + col, 0.29, 0.05, 0.28, 1, [x, y - 0.15, -0.62]));
      p.push(boxPart('balcony-rail-' + row + '-' + col, 0.29, 0.11, 0.035, 2, [x, y - 0.07, -0.76]));
    }
  }
  return assemble('apartment-tower', apartmentTower.describe, p);
});

export const skyscraper = factory('skyscraper', 'Parametric glass-and-steel skyscraper with floor bands, corner mullions and a stepped crown', opts => {
  const floors = countOpt(opts, 12, 26), h = 0.62 + floors * 0.13, p: AssetPart[] = [
    boxPart('steel-core', 1.05, h, 0.9, 4, [0, h / 2 - 0.56, 0]),
    boxPart('glass-facade-front', 0.96, h - 0.16, 0.035, 3, [0, h / 2 - 0.56, -0.47]),
    boxPart('glass-facade-side', 0.035, h - 0.16, 0.84, 3, [0.54, h / 2 - 0.56, 0]),
    boxPart('crown-cap', 1.2, 0.18, 1.05, 2, [0, h - 0.52, 0]),
    boxPart('roof-spire', 0.18, 0.46, 0.18, 1, [0, h - 0.2, 0]),
    boxPart('entrance-plinth', 1.22, 0.22, 1.08, 1, [0, -0.62, 0]),
  ];
  for (let row = 0; row < floors; row++) {
    const y = -0.46 + row * 0.13;
    p.push(boxPart('front-floor-band-' + row, 0.98, 0.025, 0.05, 1, [0, y, -0.49]));
    p.push(boxPart('side-floor-band-' + row, 0.05, 0.025, 0.86, 1, [0.55, y, 0]));
    for (let col = 0; col < 4; col++) {
      const x = (col - 1.5) * 0.235;
      if (seeded(row * 13 + col, Number(opts.seed ?? 3)) > 0.12) p.push(boxPart('front-window-' + row + '-' + col, 0.16, 0.082, 0.027, (row + col) % 5 === 0 ? 2 : 3, [x, y + 0.055, -0.512]));
    }
  }
  for (const x of [-0.51, 0.51]) p.push(boxPart('corner-mullion-' + x, 0.045, h - 0.2, 0.045, 2, [x, h / 2 - 0.56, -0.51]));
  return assemble('skyscraper', skyscraper.describe, p);
});

export const cityBlock = factory('city-block', 'Seeded miniature city block with individually named landmark towers, homes and mid-rise buildings', opts => {
  const count = countOpt(opts, 7, 14), seed = Number(opts.seed ?? 17), p: AssetPart[] = [
    boxPart('city-plinth', 3.4, 0.18, 2.1, 4, [0, -0.45, 0]),
    boxPart('cross-street', 3.25, 0.03, 0.34, 1, [0, -0.34, 0.54]),
  ];
  for (let i = 0; i < count; i++) {
    const u = seeded(i, seed), v = seeded(i + 89, seed), x = -1.2 + (i % 4) * 0.78, z = -0.58 + Math.floor(i / 4) * 0.78;
    const kind = (i + Math.floor(u * 3)) % 3;
    const floors = 3 + Math.floor(v * 8);
    const height = 0.52 + floors * 0.13;
    const width = kind === 0 ? 0.51 : 0.63;
    const shell = box(width, height, 0.56, kind === 1 ? 0 : 4, [1, 4, 2, 4, kind === 0 ? 3 : 0, 1]);
    p.push(part('building-' + (i + 1) + '-shell', shell, [x, -0.34 + height / 2, z]));
    const floorsHere = Math.max(2, floors);
    for (let row = 0; row < floorsHere; row++) {
      const y = -0.34 + 0.17 + row * Math.max(0.11, (height - 0.28) / floorsHere);
      for (let col = 0; col < 2; col++) {
        const wx = x + (col ? 0.14 : -0.14);
        p.push(boxPart('building-' + (i + 1) + '-window-' + row + '-' + col, 0.1, 0.09, 0.025, kind === 0 ? 3 : (row + col) % 4 === 0 ? 2 : 3, [wx, y, z - 0.3]));
      }
      if (kind === 2) p.push(boxPart('building-' + (i + 1) + '-floor-band-' + row, 0.65, 0.025, 0.035, 1, [x, y - 0.055, z - 0.31]));
    }
    if (kind === 0) p.push(boxPart('building-' + (i + 1) + '-roof-cap', 0.58, 0.12, 0.64, 2, [x, -0.34 + height, z]));
  }
  return assemble('city-block', cityBlock.describe, p);
});

export const factoryBuilding = factory('factory', 'Compact factory with sawtooth roof, clerestory windows, smokestacks and loading doors', () => {
  const p: AssetPart[] = [
    boxPart('factory-floor', 2.2, 0.18, 1.35, 1, [0, -0.81, 0]),
    boxPart('production-hall', 2.05, 1.05, 1.18, 0, [0, -0.16, 0]),
    prisma('sawtooth-roof-left', [[-1.05, 0.36], [0.0, 0.83], [0.0, 0.66], [-1.05, 0.23]], 1.28, 1),
    prisma('sawtooth-roof-right', [[0.0, 0.83], [1.05, 0.36], [1.05, 0.23], [0.0, 0.66]], 1.28, 1),
    boxPart('loading-bay', 0.55, 0.62, 0.07, 4, [-0.58, -0.38, -0.63]),
    boxPart('loading-bay-lintel', 0.68, 0.09, 0.09, 2, [-0.58, -0.03, -0.63]),
    boxPart('clerestory-glass', 0.73, 0.19, 0.04, 3, [0.43, 0.28, -0.62]),
  ];
  for (let i = 0; i < 3; i++) {
    const x = 0.56 + i * 0.48;
    p.push(cylPart('smokestack-' + i, 0.13, 1.0 + (i % 2) * 0.22, 1, [x, 0.97, 0.3], 16, 0.1));
    p.push(cylPart('stack-lip-' + i, 0.17, 0.1, 2, [x, 1.48 + (i % 2) * 0.22, 0.3], 16));
  }
  for (let i = 0; i < 4; i++) p.push(boxPart('roof-ridge-seam-' + i, 0.035, 0.58, 0.035, 2, [-0.72 + i * 0.48, 0.52, 0]));
  return assemble('factory', factoryBuilding.describe, p);
});

export const oilBarrel = factory('oil-barrel', 'Ribbed industrial oil drum with rolled steel hoops, recessed lid and stamped cap', () => {
  const p: AssetPart[] = [
    cylPart('barrel-body', 0.58, 1.16, 1, [0, 0, 0], 32, 0.55),
    cylPart('top-lid', 0.55, 0.075, 2, [0, 0.59, 0], 32),
    cylPart('bottom-rim', 0.58, 0.085, 1, [0, -0.59, 0], 32),
    part('upper-hoop', torus(0.55, 0.07, 32, 8, 2), [0, 0.34, 0]),
    part('lower-hoop', torus(0.55, 0.07, 32, 8, 2), [0, -0.34, 0]),
    cylPart('filler-neck', 0.1, 0.07, 2, [0.25, 0.65, 0], 16),
    cylPart('filler-cap', 0.065, 0.045, 4, [0.25, 0.71, 0], 12),
  ];
  for (let i = 0; i < 12; i++) p.push(boxPart('vertical-rib-' + i, 0.028, 0.7, 0.035, 0, [Math.cos(i * Math.PI / 6) * 0.562, 0, Math.sin(i * Math.PI / 6) * 0.562]));
  return assemble('oil-barrel', oilBarrel.describe, p);
});

export const shippingContainer = factory('shipping-container', 'Steel freight container with corner castings, corrugated sides, locking bars and end doors', opts => {
  const corrugations = countOpt(opts, 13, 24), p: AssetPart[] = [
    boxPart('container-shell', 2.0, 1.05, 0.92, 4),
    boxPart('front-end', 1.88, 0.92, 0.06, 0, [0, 0, -0.49]),
    boxPart('rear-end', 1.88, 0.92, 0.06, 1, [0, 0, 0.49]),
    boxPart('top-roof', 2.02, 0.06, 0.93, 1, [0, 0.55, 0]),
    boxPart('bottom-rail', 2.08, 0.08, 0.98, 1, [0, -0.55, 0]),
  ];
  for (let i = 0; i < corrugations; i++) {
    const x = -0.9 + (i / Math.max(1, corrugations - 1)) * 1.8;
    p.push(boxPart('front-corrugation-' + i, 0.055, 0.87, 0.055, i % 4 === 0 ? 2 : 1, [x, 0, -0.54]));
  }
  for (let i = 0; i < 7; i++) p.push(boxPart('door-rib-' + i, 0.055, 0.76, 0.035, 1, [-0.73 + i * 0.24, 0, 0.54]));
  for (const x of [-0.96, 0.96]) for (const y of [-0.49, 0.49]) p.push(boxPart('corner-casting-' + x + '-' + y, 0.14, 0.14, 0.14, 2, [x, y, 0]));
  for (const x of [-0.47, 0.47]) {
    p.push(boxPart('locking-bar-' + x, 0.045, 0.78, 0.055, 2, [x, 0, 0.58]));
    p.push(boxPart('locking-handle-' + x, 0.13, 0.07, 0.07, 1, [x, 0.31, 0.62]));
  }
  return assemble('shipping-container', shippingContainer.describe, p);
});

export const cargoShip = factory('cargo-ship', 'Layered container vessel with deep hull, raised bow, bridge tower, deck rails and stacked freight', opts => {
  const n = countOpt(opts, 8, 16), p: AssetPart[] = [
    prisma('ship-hull', [[-1.55, 0.15], [1.55, 0.15], [1.13, -0.55], [-1.16, -0.55]], 0.9, 4),
    boxPart('deck', 2.85, 0.16, 0.94, 1, [0, 0.18, 0]),
    boxPart('bow-cap', 0.35, 0.42, 0.96, 2, [1.38, 0.16, 0]),
    boxPart('bridge-body', 0.58, 0.9, 0.72, 0, [-1.0, 0.67, 0.02]),
    boxPart('bridge-windows', 0.5, 0.28, 0.04, 3, [-1.0, 0.8, -0.37]),
    boxPart('bridge-roof', 0.76, 0.1, 0.86, 2, [-1.0, 1.14, 0.02]),
    boxPart('mast', 0.055, 0.54, 0.055, 2, [-0.98, 1.44, 0.02]),
    boxPart('mast-crossbar', 0.29, 0.055, 0.055, 1, [-0.98, 1.52, 0.02]),
  ];
  for (let i = 0; i < n; i++) {
    const x = -0.55 + (i % 4) * 0.39, row = Math.floor(i / 4), y = 0.46 + row * 0.43, z = row % 2 ? 0.16 : -0.16;
    p.push(boxPart('cargo-container-' + (i + 1), 0.36, 0.37, 0.45, i % 3 === 0 ? 2 : 0, [x, y, z]));
    for (let r = 0; r < 4; r++) p.push(boxPart('container-rib-' + i + '-' + r, 0.025, 0.32, 0.025, 1, [x - 0.1 + r * 0.067, y, z - 0.24]));
  }
  for (let i = 0; i < 8; i++) p.push(boxPart('deck-rail-post-' + i, 0.035, 0.28, 0.035, 2, [-1.2 + i * 0.34, 0.4, -0.46]));
  return assemble('cargo-ship', cargoShip.describe, p);
});

export const INFRA_ASSETS = {
  house, 'apartment-tower': apartmentTower, skyscraper, 'city-block': cityBlock,
  factory: factoryBuilding, 'oil-barrel': oilBarrel, 'shipping-container': shippingContainer, 'cargo-ship': cargoShip,
} satisfies Record<string, AssetFactory>;

