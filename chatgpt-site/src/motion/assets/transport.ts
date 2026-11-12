import {
  assemble, boxPart, cablePart, countOpt, cylPart, detailOpt, domeMesh, factory,
  faceCyl, faceRing, linkPart, part, prisma, type AssetFactory, type AssetPart, type Vec3,
} from './common.ts';
import { box, cylinder, place, sphere, torus } from '../three.ts';

export const truck = factory('truck', 'Heavy box truck with cab glazing, grille, bumper, rear cargo body, chassis and individually named wheels', () => {
  const p: AssetPart[] = [
    boxPart('cargo-box', 1.7, 0.98, 1.05, 0, [-0.34, 0.34, 0]),
    boxPart('cargo-roof-rail', 1.8, 0.08, 1.14, 2, [-0.34, 0.88, 0]),
    boxPart('cab', 0.78, 0.76, 1.0, 1, [0.92, 0.22, 0]),
    boxPart('windscreen', 0.52, 0.37, 0.035, 3, [1.02, 0.39, -0.52]),
    boxPart('side-window', 0.48, 0.33, 0.035, 3, [1.27, 0.42, -0.51]),
    boxPart('front-grille', 0.39, 0.34, 0.06, 4, [1.33, 0.03, -0.54]),
    boxPart('bumper', 0.86, 0.13, 0.18, 2, [1.02, -0.26, -0.51]),
    boxPart('chassis', 2.9, 0.2, 0.78, 4, [0, -0.28, 0]),
    boxPart('cargo-door-seam', 0.035, 0.88, 0.035, 1, [-1.22, 0.34, -0.54]),
    boxPart('side-mirror-arm', 0.24, 0.06, 0.06, 1, [1.11, 0.53, -0.6]),
    boxPart('side-mirror', 0.09, 0.17, 0.07, 2, [1.21, 0.57, -0.6]),
  ];
  for (const x of [-0.78, 0.82, 1.14]) {
    for (const z of [-0.44, 0.44]) {
      p.push(part('wheel-' + x + '-' + z, cylinder(0.3, 0.17, 20, 4), [x, -0.37, z], [Math.PI / 2, 0, 0]));
      p.push(part('wheel-hub-' + x + '-' + z, cylinder(0.14, 0.19, 16, 2), [x, -0.37, z * 1.02], [Math.PI / 2, 0, 0]));
    }
  }
  return assemble('truck', truck.describe, p);
});

export const airplane = factory('airplane', 'Commercial jet in a crisp isometric silhouette with swept wings, tailplane, engines, cockpit and windows', opts => {
  const d = detailOpt(opts), p: AssetPart[] = [
    part('fuselage', cylinder(0.27, 2.7, 24, 0, 0, 0.04), [0, 0, 0], [0, 0, Math.PI / 2]),
    part('nose-cone', cylinder(0.27, 0.55, 24, 1, 1, 0), [1.58, 0, 0], [0, 0, Math.PI / 2]),
    boxPart('main-wing', 0.3, 0.08, 2.65, 1, [0.1, -0.04, 0]),
    boxPart('wing-tip-left', 0.65, 0.07, 0.25, 2, [0.54, -0.05, -1.26]),
    boxPart('wing-tip-right', 0.65, 0.07, 0.25, 2, [0.54, -0.05, 1.26]),
    boxPart('tail-plane', 0.18, 0.06, 1.0, 1, [-1.03, 0.04, 0]),
    prisma('vertical-stabilizer', [[-0.34, 0], [0.18, 0], [-0.17, 0.64]], 0.12, 1, 0),
    boxPart('cockpit-glazing', 0.42, 0.14, 0.32, 3, [1.05, 0.2, 0]),
    part('left-engine', cylinder(0.2 * d, 0.65, 20, 4), [-0.02, -0.24, -0.72], [Math.PI / 2, 0, 0]),
    part('right-engine', cylinder(0.2 * d, 0.65, 20, 4), [-0.02, -0.24, 0.72], [Math.PI / 2, 0, 0]),
    part('left-engine-lip', cylinder(0.18, 0.035, 20, 2), [-0.02, -0.24, -1.06], [Math.PI / 2, 0, 0]),
    part('right-engine-lip', cylinder(0.18, 0.035, 20, 2), [-0.02, -0.24, 1.06], [Math.PI / 2, 0, 0]),
  ];
  for (let i = 0; i < 9; i++) p.push(part('cabin-window-' + i, box(0.11, 0.065, 0.025, 3), [0.74 - i * 0.2, 0.18, -0.28]));
  return assemble('airplane', airplane.describe, p);
});

export const rocket = factory('rocket', 'Compact orbital rocket with tapered nose, reinforced body rings, side fins and layered exhaust bell', () => {
  const p: AssetPart[] = [
    cylPart('rocket-core', 0.38, 1.55, 1, [0, 0.04, 0], 28),
    cylPart('nose-shoulder', 0.38, 0.12, 2, [0, 0.84, 0], 28),
    cylPart('payload-nose', 0.38, 0.74, 0, [0, 1.24, 0], 28, 0),
    cylPart('base-ring', 0.44, 0.18, 2, [0, -0.82, 0], 28),
    cylPart('engine-bell', 0.32, 0.47, 4, [0, -1.13, 0], 24, 0.18),
    cylPart('bell-lip', 0.33, 0.08, 2, [0, -1.38, 0], 24),
    faceRing('observation-port-rim', 0.14, 0.045, 2, [0.17, 0.12, -0.32], 20),
    faceCyl('observation-port-glass', 0.11, 0.03, 3, [0.17, 0.12, -0.34], 20),
    boxPart('insignia-rule', 0.27, 0.045, 0.025, 4, [-0.15, -0.1, -0.39]),
  ];
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    p.push(part('fin-' + i, prisma('fin-profile', [[-0.1, -0.42], [0.22, -0.42], [0.56, -0.92], [-0.03, -0.92]], 0.12, i % 2 ? 0 : 1).mesh, [Math.sin(a) * 0.06, 0, Math.cos(a) * 0.34], [0, a, 0]));
  }
  return assemble('rocket', rocket.describe, p);
});

export const parachute = factory('parachute', 'Open parachute with faceted canopy, alternating monochrome gores, tension lines and suspended payload', opts => {
  const detail = Math.round(12 * detailOpt(opts)), p: AssetPart[] = [
    part('canopy', domeMesh(1.02, 0.55, detail, 6, 0), [0, 1.0, 0]),
    boxPart('suspended-payload', 0.52, 0.44, 0.48, 1, [0, -0.72, 0]),
    boxPart('payload-band', 0.56, 0.09, 0.52, 2, [0, -0.55, 0]),
  ];
  for (let i = 0; i < detail; i++) {
    const a = i * Math.PI * 2 / detail, x = Math.sin(a) * 0.9, z = Math.cos(a) * 0.9;
    p.push(cablePart('suspension-line-' + i, [x, 0.95, z], [0, -0.49, 0], 0.022, 2));
    if (i % 2 === 0) p.push(linkPart('canopy-seam-' + i, [0, 1.54, 0], [x, 1.0, z], 0.025, 1));
  }
  return assemble('parachute', parachute.describe, p);
});

export const umbrella = factory('umbrella', 'Open rain umbrella with faceted dome, visible radial ribs, central shaft and hooked handle', opts => {
  const n = countOpt(opts, 10, 20), p: AssetPart[] = [
    part('canopy', domeMesh(0.98, 0.48, n, 5, 0), [0, 0.95, 0]),
    cylPart('central-shaft', 0.055, 1.65, 2, [0, 0.08, 0], 12),
    part('hook-handle', torus(0.2, 0.055, 16, 6, 1), [0, -0.82, 0.01], [0, 0, Math.PI / 2]),
  ];
  for (let i = 0; i < n; i++) {
    const a = i * Math.PI * 2 / n, x = Math.sin(a) * 0.94, z = Math.cos(a) * 0.94;
    p.push(linkPart('radial-rib-' + i, [0, 1.35, 0], [x, 0.96, z], 0.035, 2));
    p.push(boxPart('canopy-panel-edge-' + i, 0.035, 0.09, 0.035, 1, [x, 0.91, z]));
  }
  return assemble('umbrella', umbrella.describe, p);
});

export const TRANSPORT_ASSETS = {
  truck, airplane, rocket, parachute, umbrella,
} satisfies Record<string, AssetFactory>;

