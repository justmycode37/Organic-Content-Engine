import {detailedPhoneParts} from './detailed-phone.ts';
import type { IconName, ModelName } from './core.ts';
import { ICON_BITMAPS } from './icons.ts';
import { iconMesh } from './icon3d.ts';
import { box, cylinder, merge, place, sphere, torus, type Mesh, type Vec3 } from './three.ts';

const meshCache = new Map<string, readonly Mesh[]>();
const mergedCache = new Map<string, Mesh>();

const move = (mesh: Mesh, pos: Vec3, rot?: Vec3) => place(mesh, { pos, rot });

/** Join two points with a thin, shaded link whose local Y axis follows the segment. */
function link(a: Vec3, b: Vec3, width = 0.045, material = 2): Mesh {
  const delta: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const length = Math.hypot(...delta);
  const horizontal = Math.hypot(delta[1], delta[2]);
  const midpoint: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const rot: Vec3 = [Math.atan2(delta[2], delta[1]), 0, Math.atan2(-delta[0], horizontal)];
  return place(box(width, length, width, material), { pos: midpoint, rot });
}

/** Square processor package with four pin combs, a raised die, and a corner key. */
function buildChip(): Mesh[] {
  const packageBody = merge(
    move(box(2.1, 0.28, 1.92, 2, [2, 2, 0, 4, 2, 2]), [0, -0.48, 0]),
    move(box(1.98, 0.72, 1.8, 0, [2, 2, 3, 4, 0, 2]), [0, 0.02, 0]),
    move(box(2.04, 0.12, 1.86, 2, [2, 2, 3, 4, 2, 2]), [0, 0.43, 0]),
  );

  const pinComb = merge(...Array.from({ length: 10 }, (_, i) => {
    const x = (i - 4.5) * 0.2;
    const z = (i - 4.5) * 0.18;
    return merge(
      move(box(0.105, 0.28, 0.28, 2), [x, -0.66, 1.04]),
      move(box(0.105, 0.28, 0.28, 2), [x, -0.66, -1.04]),
      move(box(0.28, 0.28, 0.105, 2), [1.15, -0.66, z]),
      move(box(0.28, 0.28, 0.105, 2), [-1.15, -0.66, z]),
    );
  }));

  const die = merge(
    move(box(1.12, 0.12, 1.0, 2), [0, 0.55, 0]),
    move(box(0.82, 0.1, 0.7, 1), [0, 0.65, 0]),
  );
  // A recessed square at one corner is the pin-one notch used to orient a chip.
  const notch = merge(
    move(box(0.3, 0.035, 0.3, 2), [-0.82, 0.51, -0.72]),
    move(box(0.17, 0.045, 0.17, 4), [-0.82, 0.55, -0.72]),
  );
  return [packageBody, pinComb, die, notch];
}

/** Three detailed rack units with vent fields, recessed trays, and one live status cluster. */
function buildServer(): Mesh[] {
  const at = [-0.78, 0, 0.78];
  const units = at.map((y, index) => {
    const chassis = merge(
      move(box(2.15, 0.62, 1.35, 2, [2, 2, 0, 4, 4, 2]), [0, y, 0]),
      move(box(1.96, 0.46, 0.05, 4), [0, y, -0.705]),
      move(box(1.98, 0.055, 0.07, 2), [0, y + 0.25, -0.72]),
      move(box(1.98, 0.055, 0.07, 2), [0, y - 0.25, -0.72]),
      move(box(0.055, 0.46, 0.07, 2), [-0.96, y, -0.72]),
      move(box(0.055, 0.46, 0.07, 2), [0.96, y, -0.72]),
    );

    const vents = merge(...Array.from({ length: 6 }, (_, i) =>
      move(box(0.62, 0.028, 0.025, 2), [-0.55, y + 0.17 - i * 0.065, -0.765]),
    ));
    const driveBays = merge(...[0.34, 0.73].map(x => merge(
      move(box(0.31, 0.32, 0.045, 2), [x, y, -0.77]),
      move(box(0.23, 0.23, 0.025, 4), [x, y, -0.805]),
      move(box(0.13, 0.025, 0.02, 2), [x, y - 0.085, -0.825]),
    )));
    const trim = move(box(1.7, 0.035, 0.035, 3), [-0.02, y + 0.28, -0.77]);
    const unit = merge(chassis, vents, driveBays, trim);
    const status = index === 1
      ? merge(...[-0.1, 0.08, 0.26].map(x => move(box(0.09, 0.09, 0.045, 1), [x, y + 0.19, -0.83])))
      : null;
    return { unit, status };
  });

  const rearSpine = move(box(0.11, 2.5, 1.18, 4), [1.02, 0, 0.04]);
  const foot = move(box(2.25, 0.12, 1.42, 2), [0, -1.18, 0.02]);
  return [foot, rearSpine, ...units.map(part => part.unit), units[1]!.status!];
}

/** Three spaced database drums with a thick continuous color band around the middle cylinder. */
function buildDatabase(): Mesh[] {
  const drums = [-0.82, 0, 0.82].map((y, index) =>
    move(cylinder(0.91, 0.62, 40, 0, 2), [index === 1 ? 0.04 : 0, y, 0]),
  );
  const middleBand = move(torus(0.94, 0.12, 40, 10, 1), [0.04, 0, 0]);
  return [...drums, middleBand];
}

/** Globe with small raised land masses and one tilted, rainbow orbit ring. */
function buildGlobe(): Mesh[] {
  // Low-resolution land silhouettes stay coherent as the sphere turns. Each
  // ellipse is a broad geographic mass; the renderer's sphere patches turn
  // their coastlines into the same crisp pixels as the rest of the object.
  const landMasses: Array<[number, number, number, number]> = [
    [4.1, 0.48, 0.58, 0.5], // North America
    [4.34, -0.45, 0.3, 0.72], // South America
    [1.22, 0.76, 0.38, 0.28], // Europe
    [1.48, -0.08, 0.38, 0.68], // Africa
    [2.38, 0.45, 0.78, 0.48], // Asia
    [2.5, -0.91, 0.34, 0.2], // Australia
    [4.02, 1.13, 0.24, 0.22], // Greenland
  ];
  const land = (lat: number, lon: number) => {
    const latitude = Math.PI / 2 - ((lat + 0.5) / 22) * Math.PI;
    const longitude = ((lon + 0.5) / 40) * Math.PI * 2;
    const onMass = landMasses.some(([centerLon, centerLat, width, height]) => {
      const distance = Math.atan2(Math.sin(longitude - centerLon), Math.cos(longitude - centerLon));
      const x = distance / width;
      const y = (latitude - centerLat) / height;
      return x * x + y * y < 1;
    });
    return onMass ? 2 : undefined;
  };
  const planet = sphere(1.02, 40, 22, 0, land);
  const ring = move(torus(1.27, 0.075, 56, 10, 1), [0, 0.04, 0], [Math.PI / 2 + 0.28, 0, 0.12]);
  const meridian = move(torus(1.025, 0.018, 40, 6, 2), [0, 0, 0], [Math.PI / 2, 0, 0]);
  return [planet, meridian, ring];
}

/** Thick upright token with a raised metal rim and a block-embossed dollar mark. */
function buildCoin(): Mesh[] {
  const body = move(cylinder(1.06, 0.34, 48, 0, 2), [0, 0, 0], [Math.PI / 2, 0, 0]);
  const rim = move(torus(0.88, 0.075, 48, 10, 2), [0, 0, -0.17], [Math.PI / 2, 0, 0]);
  const mark = merge(
    move(box(0.09, 0.82, 0.055, 1), [0, 0, -0.245]),
    move(box(0.52, 0.085, 0.055, 1), [0, 0.31, -0.245]),
    move(box(0.42, 0.085, 0.055, 1), [0, 0, -0.245]),
    move(box(0.52, 0.085, 0.055, 1), [0, -0.31, -0.245]),
    move(box(0.085, 0.24, 0.055, 1), [-0.21, 0.19, -0.245]),
    move(box(0.085, 0.24, 0.055, 1), [0.21, -0.19, -0.245]),
  );
  const edgeTicks = merge(...Array.from({ length: 32 }, (_, i) => {
    const a = (i / 32) * Math.PI * 2;
    return move(box(0.025, 0.04, 0.34, 2), [Math.cos(a) * 1.055, Math.sin(a) * 1.055, 0], [0, 0, a]);
  }));
  return [body, edgeTicks, rim, mark];
}

/** Air-spaced 3 x 3 x 3 voxel cube with one small, connected rainbow corner patch. */
function buildCube(): Mesh[] {
  const spacing = 0.66, side = 0.57;
  const neutralLayers: Mesh[] = [];
  const colorPatch: Mesh[] = [];
  for (let yIndex = 0; yIndex < 3; yIndex++) {
    const blocks: Mesh[] = [];
    for (let zIndex = 0; zIndex < 3; zIndex++) for (let xIndex = 0; xIndex < 3; xIndex++) {
      const patch = zIndex === 0 && ((xIndex === 0 && yIndex === 0) || (xIndex === 1 && yIndex === 0) || (xIndex === 0 && yIndex === 1));
      const block = move(box(side, side, side, patch ? 1 : 2, [2, 2, 3, 4, patch ? 1 : 0, 2]), [
        (xIndex - 1) * spacing,
        (1 - yIndex) * spacing,
        (zIndex - 1) * spacing,
      ]);
      (patch ? colorPatch : blocks).push(block);
    }
    neutralLayers.push(merge(...blocks));
  }
  return [...neutralLayers, merge(...colorPatch)];
}

/** Desktop display with a luminous code screen, stepped bezel, neck, and broad foot. */
function buildMonitor(): Mesh[] {
  const back = move(box(2.45, 1.68, 0.22, 2, [2, 2, 3, 4, 2, 2]), [0, 0.34, 0]);
  const screen = move(box(2.12, 1.28, 0.045, 3), [0, 0.38, -0.14]);
  const bezel = merge(
    move(box(2.25, 0.09, 0.05, 0), [0, 1.065, -0.15]),
    move(box(2.25, 0.09, 0.05, 0), [0, -0.305, -0.15]),
    move(box(0.075, 1.28, 0.05, 0), [-1.088, 0.38, -0.15]),
    move(box(0.075, 1.28, 0.05, 0), [1.088, 0.38, -0.15]),
    move(box(0.1, 0.07, 0.05, 3), [0, -0.28, -0.19]),
  );
  const greyCode = merge(
    move(box(0.48, 0.055, 0.025, 4), [-0.65, 0.72, -0.18]),
    move(box(0.19, 0.055, 0.025, 4), [-0.12, 0.72, -0.18]),
    move(box(0.3, 0.055, 0.025, 4), [0.47, 0.72, -0.18]),
    move(box(0.32, 0.055, 0.025, 4), [-0.7, 0.48, -0.18]),
    move(box(0.56, 0.055, 0.025, 4), [0.18, 0.48, -0.18]),
    move(box(0.24, 0.055, 0.025, 4), [-0.6, 0.24, -0.18]),
    move(box(0.44, 0.055, 0.025, 4), [0.16, 0.24, -0.18]),
  );
  const liveCode = merge(
    move(box(0.12, 0.055, 0.03, 1), [-0.39, 0.72, -0.19]),
    move(box(0.32, 0.055, 0.03, 1), [0.12, 0.72, -0.19]),
    move(box(0.19, 0.055, 0.03, 1), [0.78, 0.72, -0.19]),
    move(box(0.16, 0.055, 0.03, 1), [-0.35, 0.48, -0.19]),
    move(box(0.2, 0.055, 0.03, 1), [0.69, 0.48, -0.19]),
  );
  const stand = merge(
    move(box(0.28, 0.48, 0.24, 2), [0, -0.78, 0.02]),
    move(box(1.05, 0.13, 0.72, 0), [0, -1.08, 0.06]),
    move(box(0.72, 0.045, 0.42, 3), [0, -0.995, 0.03]),
  );
  return [back, screen, bezel, greyCode, liveCode, stand];
}

/** Handset slab with inset display, app grid, and a separate raised rear camera island. */
function buildPhone(): Mesh[] { return detailedPhoneParts(); }

/** Four offset cache slabs with one top face picked out in rainbow. */
function buildStack(): Mesh[] {
  const slabs = [-1.11, -0.37, 0.37, 1.11].map((y, index) => {
    const x = [-0.25, 0.18, -0.1, 0.23][index]!;
    const z = [0.08, -0.1, 0.12, -0.08][index]!;
    const active = index === 2;
    return move(box(1.9, 0.42, 1.48, active ? 1 : 0, active ? undefined : [2, 2, 0, 4, 0, 2]), [x, y, z]);
  });
  const fasteners = merge(...[-0.72, 0.72].flatMap(x => [-0.5, 0.5].map(z =>
    move(box(0.07, 0.035, 0.07, 3), [x, 1.35, z - 0.08]),
  )));
  return [...slabs, fasteners];
}

/** Central switch with six satellite nodes and six independent, slender connections. */
function buildNetwork(): Mesh[] {
  const center: Vec3 = [0, 0, 0];
  const satellites: Vec3[] = [
    [1.02, 0.38, 0.12], [0.5, 0.82, -0.18], [-0.72, 0.68, 0.16],
    [-1.04, -0.18, -0.12], [-0.4, -0.78, 0.18], [0.72, -0.62, -0.1],
  ];
  const links = satellites.map(point => link(center, point, 0.045, 2));
  const nodes = merge(...satellites.map((point, index) =>
    move(sphere(index === 1 ? 0.21 : 0.19, 16, 10, 0), point),
  ));
  const hub = move(sphere(0.31, 20, 12, 1), center);
  const collar = move(torus(0.34, 0.035, 24, 6, 2), center);
  return [...links, nodes, hub, collar];
}

const builders: Record<string, () => Mesh[]> = {
  chip: buildChip,
  server: buildServer,
  database: buildDatabase,
  globe: buildGlobe,
  coin: buildCoin,
  cube: buildCube,
  monitor: buildMonitor,
  phone: buildPhone,
  stack: buildStack,
  network: buildNetwork,
};

/** Cached immutable pieces for the assembly animation; icons are one solid piece. */
export function modelParts(name: ModelName): readonly Mesh[] {
  let pieces = meshCache.get(name);
  if (!pieces) {
    const build = builders[name];
    if (build) pieces = build();
    else pieces = [name in ICON_BITMAPS ? iconMesh(name as IconName) : iconMesh('chip')];
    meshCache.set(name, pieces);
  }
  return pieces;
}

/** Merged form for uses that need a single mesh. */
export function model(name: ModelName): Mesh {
  let mesh = mergedCache.get(name);
  if (!mesh) {
    mesh = merge(...modelParts(name));
    mergedCache.set(name, mesh);
  }
  return mesh;
}

/** Frame-size correction keeps every hero close to the same visual weight. */
export function modelScale(name: ModelName): number {
  if (name === 'server') return 0.92;
  if (name === 'cube') return 0.92;
  if (name === 'stack') return 0.76;
  if (name === 'coin') return 1.13;
  if (name === 'network') return 1.28;
  return 1;
}
