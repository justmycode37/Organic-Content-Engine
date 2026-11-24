import {
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
  type Shot,
} from './index.ts';

import { montageStudies } from './compositing.ts';
import { diagramStudies } from './diagrams.ts';
import { depthStudies } from './depth.ts';
import { catalogStudies } from './catalog.ts';
import { interactionStudies } from './interactions.ts';
import { plasmaStudies } from './plasma.ts';
import { cosmosStudies } from './cosmos.ts';

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
} satisfies Record<string, Shot>;
export const sampler = Object.values(studies);
