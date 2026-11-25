import {
  atmosphericLimb,
  transmittedLight,
  drawMolecule,
  drawPlanet,
  body,
  camera,
  charge,
  ellipse,
  label,
  layer,
  shells,
  stars,
  tau,
  trace,
  tween,
  wave,
  type Point,
  type PlanetName,
  type Shot,
} from './index.ts';

import { montageStudies } from './compositing.ts';
import { diagramStudies } from './diagrams.ts';
import { depthStudies } from './depth.ts';
import { catalogStudies } from './catalog.ts';
import { interactionStudies } from './interactions.ts';
import { plasmaStudies } from './plasma.ts';
import { cosmosStudies } from './cosmos.ts';

const planetGallery: ReadonlyArray<{ body: PlanetName; radius: number; longitude: number; roll?: number }> = [
  { body: 'mercury', radius: 100, longitude: 0.22 },
  { body: 'venus', radius: 114, longitude: 0.06 },
  { body: 'earth', radius: 120, longitude: -1.45, roll: -0.20 },
  { body: 'mars', radius: 108, longitude: -1.10 },
  { body: 'moon', radius: 105, longitude: -0.21 },
  { body: 'jupiter', radius: 136, longitude: -0.44 },
  { body: 'saturn', radius: 76, longitude: 0.08, roll: -0.26 },
  { body: 'uranus', radius: 110, longitude: 0.78, roll: 1.52 },
  { body: 'neptune', radius: 112, longitude: 0.46 },
  { body: 'sun', radius: 123, longitude: 0.0 },
];

const realisticPlanets: Shot = {
  duration: 8,
  draw(ctx, t) {
    const space = ctx.createLinearGradient(0, 0, 1760, 1080);
    space.addColorStop(0, '#171320');
    space.addColorStop(0.46, '#100f1b');
    space.addColorStop(1, '#070b15');
    ctx.fillStyle = space;
    ctx.fillRect(0, 0, 1920, 1080);
    label(ctx, 'Solar System', [960, 113], 60);
    label(ctx, 'Observation-based textures · display sizes vary', [960, 181], 25);
    planetGallery.forEach(({ body, radius, longitude, roll }, i) => {
      const x = 220 + (i % 5) * 370;
      const y = i < 5 ? 391 : 746;
      drawPlanet(ctx, {
        body, center: [x, y], radius, roll,
        longitude: longitude + t * (0.035 + 0.004 * i),
        light: [-0.62, 0.31, 0.72],
      });
      label(ctx, body[0].toUpperCase() + body.slice(1), [x, y + 166], 31);
    });
    label(ctx, 'Texture maps by Solar System Scope · CC BY 4.0', [960, 1001], 21);
  },
};

// Reference-image reconstruction. Diagrammatic symbols, independent of physical scale.
const electron: Shot = {
  duration: 6,
  draw(ctx, t) {
    camera(ctx, [960, 536], tween(t, 0, 6, 0.95, 1.04), () => {
      layer(ctx, { x: 940, y: 532 }, () => {
        [532, 350].forEach((radius, i) => {
          const onset = 0.25 + i * 0.53;
          layer(
            ctx,
            { scale: tween(t, onset, onset + 0.9, 0.3, 1), alpha: tween(t, onset, onset + 0.3, 0, 1) },
            () => shells(ctx, [radius], t + i),
          );
        });
        body(ctx, 'torus', [0, 0], 176, 'ember');
        label(ctx, 'e', [0, -2], 80);
        label(ctx, 'Electron', [0, 232], 56);
      });
      const symbols: Point[] = [
        [233, 544],
        [1440, 174],
        [1620, 490],
        [1464, 841],
        [385, 882],
      ];
      symbols.forEach(([x, y], i) => {
        const arrival = tween(t, 0.9 + 0.19 * i, 1.8 + 0.19 * i, 0, 1);
        layer(ctx, { alpha: arrival, x: (x - 940) * 0.38 * (1 - arrival) }, () =>
          charge(ctx, [x + 9 * Math.sin(t * 0.7 + i), y + 12 * Math.cos(t * 0.5 + i)], '+'),
        );
      });
    });
  },
};

// A straight-line transit across a uniform stellar disk, with the plotted flux
// and the moving marker both derived from the same disk-overlap calculation.
function obscured(distance: number, r: number, R: number) {
  if (distance >= R + r) return 0;
  if (distance <= R - r) return (r * r) / (R * R);
  const a = Math.acos(Math.max(-1, Math.min(1, (distance ** 2 + r * r - R * R) / (2 * distance * r))));
  const b = Math.acos(Math.max(-1, Math.min(1, (distance ** 2 + R * R - r * r) / (2 * distance * R))));
  return (r * r * (a - Math.sin(2 * a) / 2) + R * R * (b - Math.sin(2 * b) / 2)) / (Math.PI * R * R);
}
const transit: Shot = {
  duration: 7,
  draw(ctx, t) {
    stars(ctx, t);
    const p = t / 7,
      star: Point = [960, 394],
      r = 52,
      R = 277,
      impact = 65;
    const offset = (u: number) => (u - 0.5) * 1220;
    const curve = (u: number): Point => [
      350 + 1220 * u,
      784 + 3400 * obscured(Math.hypot(offset(u), impact), r, R),
    ];
    body(ctx, 'sphere', star, R, 'ember');
    body(ctx, 'sphere', [star[0] + offset(p), star[1] + impact], r, 'ink');
    trace(ctx, (u) => [350 + 1220 * u, 784], 1, 'ink', 2);
    trace(ctx, curve, p, 'chalk', 5);
    body(ctx, 'sphere', curve(p), 14, 'signal');
    label(ctx, 'Relative starlight', [510, 727], 34);
    label(ctx, 'Time →', [1470, 954], 30);
  },
};

// Retarded phase produces travelling crests even when the emitter and receiver hold.
const signal: Shot = {
  duration: 6,
  draw(ctx, t) {
    stars(ctx, t, 140);
    const source: Point = [340, 530],
      receiver: Point = [1570, 530];
    layer(ctx, { x: source[0], y: source[1] }, () => shells(ctx, [126, 160], t, 'ember'));
    body(ctx, 'sphere', source, 86, 'ember');
    const path = wave([506, 530], 970, 63, 4.5, t * 0.77);
    const front = tween(t, 0.25, 4.6, 0, 1);
    trace(ctx, path, front, 'twilight', 8, 320);
    if (front > 0 && front < 1) body(ctx, 'sphere', path(front), 13, 'signal');
    body(ctx, 'sphere', receiver, 88, 'twilight');
    label(ctx, 'Source', [340, 752], 42);
    label(ctx, 'Observer', [1570, 752], 42);
  },
};

// Draw the far arc and its satellites first so the planet naturally occludes them.
const orbit: Shot = {
  duration: 8,
  draw(ctx, t) {
    stars(ctx, t, 180);
    camera(ctx, [955, 525], tween(t, 0, 8, 0.91, 1.09), () => {
      const path = ellipse([960, 540], 650, 125, -0.24);
      const phase = (t / 8 + 0.08) % 1,
        moon = path(phase);
      trace(ctx, (u) => path(0.5 + 0.5 * u), 1, 'twilight', 5);
      if (phase >= 0.5) body(ctx, 'sphere', moon, 46, 'twilight');
      body(ctx, 'sphere', [960, 540], 276, 'ember');
      trace(ctx, (u) => path(0.5 * u), 1, 'chalk', 5);
      if (phase < 0.5) body(ctx, 'sphere', moon, 46, 'twilight');
    });
  },
};

export const studies = {
  electron,
  transit,
  signal,
  orbit,
  ...cosmosStudies,
  ...montageStudies,
  ...depthStudies,
  ...catalogStudies,
  ...interactionStudies,
  ...plasmaStudies,
  ...diagramStudies,
  'realistic-planets': realisticPlanets,
  'grazing-starlight': {
    duration: 7,
    draw(ctx, t) {
      const center: Point = [1060, 1430],
        radius = 890;
      body(ctx, 'sphere', center, radius, 'ember', 17);
      atmosphericLimb(ctx, center, radius, 26);
      for (const [offset, tint, phase] of [
        [72, '#bec6f6', 0.55],
        [15, '#ffcaac', 0.19],
      ] as const) {
        const y = center[1] - radius - offset;
        transmittedLight(
          ctx,
          {
            center,
            radius,
            scaleHeight: 26,
            extinction: 0.009,
            start: [60, y],
            end: [1860, y],
            tint,
            period: 4,
            phase,
          },
          t,
        );
      }
    },
  },
  'molecular-stretch': {
    duration: 8,
    draw(ctx, t) {
      drawMolecule(ctx, 'CO2', [960, 540], 2.25, t);
    },
  },
  'water-photolysis': {
    duration: 7,
    draw(ctx, t) {
      drawMolecule(ctx, 'H2O', [960, 540], 2.25, t, true);
    },
  },
} satisfies Record<string, Shot>;
export const sampler = Object.values(studies);
