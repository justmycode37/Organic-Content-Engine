import {
  body,
  camera,
  ellipse,
  label,
  layer,
  ramps,
  shells,
  smooth,
  tau,
  trace,
  tween,
  type Curve,
  type Material,
  type Point,
  type Shot,
} from './index.ts';

type Ctx = CanvasRenderingContext2D;
const unit = (n: number) => Math.max(0, Math.min(1, n));
const mix = (a: number, b: number, p: number) => a + (b - a) * p;
const between = (a: Point, b: Point, p: number): Point => [mix(a[0], b[0], p), mix(a[1], b[1], p)];
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Observed in the Quanta reference (YouTube ID Unl1jXFnzgo, 29.97 fps).
 * The ranges and individual frame samples are given in seconds.
 * These are diagram/motion studies; sizes, orbit paths and bond waves are symbols.
 * The source film and extracted images remain outside the repository.
 */
export const interactionReference = {
  atom: {
    range: [264, 270],
    samples: [265.5, 268.5],
    observation: 'Packed nucleus, then three thin tilted orbits and three travelling electrons.',
  },
  neutrino: {
    range: [285, 309],
    samples: [286.5, 289.5, 292.5, 304.5, 307.5],
    observation:
      'Luminous looping glyph, then many independent short meandering tracks around a stellar disk.',
  },
  exchange: {
    range: [500.6, 510],
    samples: [500.7, 501.9, 502.3, 503.9],
    observation:
      'Two stationary rings; a bright head with a short blue tail shuttles right, reverses, then reaches the left ring.',
  },
  nucleus: {
    range: [566, 577],
    samples: [568, 570, 572, 574, 576],
    observation:
      'Continuous zoom removes the orbit frame; packed nucleons separate, expose short wavy joins, then regroup.',
  },
  strands: {
    range: [609, 632],
    samples: [610.25, 612.25, 614.25, 615.75, 628, 630],
    observation:
      'One strand grows out of a quark, meets a second strand, then a third joins at a Y junction. The cluster expands and contracts.',
  },
  constituents: {
    range: [662, 669],
    samples: [662, 664, 666, 668],
    observation:
      'Opaque nucleon balls give way to three legible constituents inside a softly rimmed parent disk.',
  },
  emission: {
    range: [670, 675],
    samples: [670.25, 672.75, 673.25, 673.75, 674.25],
    observation:
      'Neutron holds; one d changes to u; separate electron and electron-antineutrino glyphs leave, retaining the parent proton.',
  },
  field: {
    range: [738, 755],
    samples: [739, 743, 745.5, 746.5, 747.5, 749.5, 754.5],
    observation:
      'Long straight streaks pass a luminous point; an irregular blue boundary expands and small interior nodes appear in sequence.',
  },
  collider: {
    range: [24, 30],
    samples: [25.5, 28.5],
    observation:
      'Layered cylindrical detector cutaways surround a common event vertex with many fine curved tracks.',
  },
} as const;

function glow(ctx: Ctx, at: Point, radius: number, material: Material, alpha = 1) {
  if (radius <= 0 || alpha <= 0) return;
  layer(ctx, { alpha }, () => {
    const colors = ramps[material];
    const gradient = ctx.createRadialGradient(...at, 0, ...at, radius);
    gradient.addColorStop(0, colors[4]);
    gradient.addColorStop(0.2, colors[3] + 'b0');
    gradient.addColorStop(0.55, colors[2] + '45');
    gradient.addColorStop(1, colors[0] + '00');
    ctx.fillStyle = gradient;
    ctx.fillRect(at[0] - radius, at[1] - radius, radius * 2, radius * 2);
  });
}

export type ParticleOptions = {
  radius?: number;
  material?: Material;
  kind?: 'sphere' | 'ring' | 'neutrino';
  symbol?: string;
  phase?: number;
  halo?: number;
  seed?: number;
};

/** Fixed-grain body paint plus independently moving, thin neutrino-glyph loops. */
export function drawParticle(ctx: Ctx, at: Point, options: ParticleOptions = {}) {
  const { radius = 48, material = 'ember', kind = 'sphere', symbol, phase = 0, halo = 0, seed = 1 } = options;
  if (radius <= 0) return;
  if (halo > 0) glow(ctx, at, radius * 2.1, 'twilight', halo);
  if (kind === 'neutrino') {
    glow(ctx, at, radius * 1.3, material, 0.8);
    layer(ctx, { alpha: 0.28 }, () => body(ctx, 'sphere', at, radius * 0.76, material, seed));
  } else body(ctx, kind === 'ring' ? 'torus' : 'sphere', at, radius, material, seed);
  if (kind === 'neutrino') {
    layer(ctx, { x: at[0], y: at[1] }, () => {
      for (let i = 0; i < 3; i++) {
        layer(ctx, { angle: (i * tau) / 3 + 0.1 * Math.sin(phase * 0.6), alpha: 0.7 }, () => {
          trace(
            ctx,
            (p) => [
              radius * 0.77 * Math.sin(tau * p),
              radius * 0.84 * Math.sin(tau * 2 * p + 0.16 * Math.sin(phase + i)),
            ],
            1,
            'chalk',
            1.6,
          );
        });
      }
    });
  }
  if (symbol) label(ctx, symbol, at, radius * 0.85);
}

/** Projected helix turns around a fixed-grain quark, with its letter kept upright. */
export function drawQuark(ctx: Ctx, at: Point, radius: number, seconds: number, symbol = 'u', seed = 1) {
  drawParticle(ctx, at, { radius, seed });
  layer(ctx, { alpha: 0.58 }, () =>
    trace(
      ctx,
      (p) => {
        const y = -0.88 + p * 1.76;
        return [
          at[0] + radius * Math.sqrt(1 - y * y) * Math.sin(tau * (p + seconds * 0.055)),
          at[1] + radius * y,
        ];
      },
      1,
      'chalk',
      Math.max(1.4, radius * 0.023),
      100,
    ),
  );
  label(ctx, symbol, at, radius * 0.71);
}

export type StrandOptions = {
  amplitude?: number;
  wavelength?: number;
  progress?: number;
  material?: Material;
  weight?: number;
};

/** Wave crests move, but the endpoints remain attached to their constituents. */
export function drawForceStrand(
  ctx: Ctx,
  from: Point,
  to: Point,
  seconds: number,
  options: StrandOptions = {},
) {
  const { amplitude = 8, wavelength = 32, progress = 1, material = 'twilight', weight = 4 } = options;
  const dx = to[0] - from[0],
    dy = to[1] - from[1],
    length = Math.hypot(dx, dy);
  if (length < 0.01 || progress <= 0) return;
  const cycles = Math.max(1, length / Math.max(1, wavelength));
  const curve: Curve = (p) => {
    const offset = amplitude * Math.sin(tau * (cycles * p - seconds * 0.72)) * Math.sin(Math.PI * p);
    return [from[0] + dx * p - (dy / length) * offset, from[1] + dy * p + (dx / length) * offset];
  };
  trace(ctx, curve, progress, material, weight, Math.ceil(cycles * 22));
}

const nucleonOffsets: readonly Point[] = [
  [-0.43, -0.34],
  [0.03, -0.58],
  [0.47, -0.26],
  [-0.55, 0.18],
  [0.48, 0.32],
  [-0.13, 0.57],
  [0, 0.04],
];
const nucleonBonds = [
  [0, 1],
  [1, 2],
  [0, 3],
  [2, 4],
  [3, 5],
  [4, 5],
  [0, 6],
  [2, 6],
  [5, 6],
] as const;

/** Spread exposes the joins without replacing or teleporting the packed balls. */
export function drawNucleus(ctx: Ctx, at: Point, radius: number, seconds: number, spread = 0) {
  layer(ctx, { x: at[0], y: at[1], scale: radius / 200 }, () => {
    const expansion = 1 + Math.max(0, spread) * 1.65;
    const points: Point[] = nucleonOffsets.map(([x, y], i) => [
      x * 200 * expansion + 3 * Math.sin(seconds * 0.8 + i),
      y * 200 * expansion + 3 * Math.cos(seconds * 0.7 + i),
    ]);
    layer(ctx, { alpha: smooth(spread * 3) }, () => {
      for (const [a, b] of nucleonBonds)
        drawForceStrand(ctx, points[a], points[b], seconds + a, {
          material: 'chalk',
          amplitude: 7,
          weight: 2.7,
        });
    });
    points.forEach((point, i) => drawParticle(ctx, point, { radius: 78, seed: i + 11 }));
  });
}

/** Far orbit halves and electrons are painted before the nucleus for occlusion. */
export function drawAtom(ctx: Ctx, at: Point, radius: number, seconds: number, orbitAlpha = 1) {
  const paths = [-0.98, 0.15, 1.17].map((tilt) => ellipse(at, radius, radius * 0.34, tilt));
  const phases = paths.map((_, i) => (((seconds * (0.13 + i * 0.013) + i * 0.31) % 1) + 1) % 1);
  const electron = (i: number) => {
    const path = paths[i],
      p = phases[i];
    drawParticleTrack(ctx, path, p, { tail: 0.055, weight: 6, radius: 10, material: 'ember', halo: 0.3 });
  };
  layer(ctx, { alpha: orbitAlpha }, () => {
    paths.forEach((path, i) => {
      trace(ctx, (p) => path(0.5 + p * 0.5), 1, 'chalk', 1.5);
      if (phases[i] >= 0.5) electron(i);
    });
  });
  drawNucleus(ctx, at, radius * 0.16, seconds);
  layer(ctx, { alpha: orbitAlpha }, () => {
    paths.forEach((path, i) => {
      trace(ctx, (p) => path(p * 0.5), 1, 'chalk', 1.5);
      if (phases[i] < 0.5) electron(i);
    });
  });
}

export type TrackOptions = {
  tail?: number;
  weight?: number;
  radius?: number;
  material?: Material;
  headMaterial?: Material;
  halo?: number;
};

/** A bounded trail and its head sample the same path, including at reversals. */
export function drawParticleTrack(ctx: Ctx, path: Curve, progress: number, options: TrackOptions = {}) {
  const {
    tail = 0.2,
    weight = 5,
    radius = 9,
    material = 'twilight',
    headMaterial = 'chalk',
    halo = 0,
  } = options;
  const end = unit(progress),
    start = Math.max(0, end - Math.max(0, tail));
  if (end > start) trace(ctx, (p) => path(mix(start, end, p)), 1, material, weight, 48);
  const head = path(end);
  if (halo > 0) glow(ctx, head, Math.max(radius * 4, weight * 3), material, halo);
  if (radius > 0) body(ctx, 'sphere', head, radius, headMaterial);
}

/** One smooth round trip; the tail uses prior times and turns with the packet. */
export function drawExchange(ctx: Ctx, from: Point, to: Point, seconds: number, period = 3.6) {
  if (!Number.isFinite(period) || period <= 0) throw new RangeError('Exchange period must be positive');
  const at = (time: number) => between(from, to, (1 - Math.cos((tau * time) / period)) / 2);
  const path: Curve = (p) => at(seconds - 0.23 * (1 - p));
  layer(ctx, {}, () => {
    ctx.globalCompositeOperation = 'screen';
    layer(ctx, { alpha: 0.28 }, () => trace(ctx, path, 1, 'twilight', 49, 40));
    trace(ctx, path, 1, 'twilight', 18, 40);
  });
  drawParticle(ctx, at(seconds), { radius: 23, halo: 0.85 });
  glow(ctx, at(seconds), 23, 'chalk', 0.8);
}

export type ConstituentOptions = {
  labels?: readonly [string, string, string];
  enclosure?: number;
  stretch?: number;
  reveal?: number;
};

/** A Y junction, rather than three disconnected springs, holds the triad. */
export function drawConstituents(
  ctx: Ctx,
  at: Point,
  radius: number,
  seconds: number,
  options: ConstituentOptions = {},
) {
  const { labels = ['u', 'u', 'd'], enclosure = 1, stretch = 1, reveal = 1 } = options;
  layer(ctx, { x: at[0], y: at[1], scale: radius / 240 }, () => {
    layer(ctx, { alpha: enclosure }, () => {
      glow(ctx, [0, 0], 290, 'twilight', 0.55);
      body(ctx, 'sphere', [0, 0], 240, 'ember', 32);
      glow(ctx, [0, 0], 230, 'chalk', 0.43);
      shells(ctx, [251], seconds, 'twilight');
    });
    const points: Point[] = [
      [-105, -66],
      [106, -62],
      [0, 116],
    ].map(([x, y], i) => [
      x * stretch + 7 * Math.sin(seconds * 0.8 + i * 2),
      y * stretch + 6 * Math.cos(seconds * 0.9 + i * 2),
    ]);
    layer(ctx, { alpha: smooth(reveal) }, () => {
      for (let i = 0; i < points.length; i++)
        drawForceStrand(ctx, [0, 0], points[i], seconds + i / 3, {
          amplitude: 7,
          wavelength: 22,
          progress: reveal,
          weight: 5,
        });
      points.forEach((point, i) => drawQuark(ctx, point, 61, seconds + i, labels[i], i + 21));
    });
  });
}

export type NeutrinoTrackOptions = {
  count?: number;
  seed?: number;
  bounds?: readonly [number, number, number, number];
};

/** Independent short tracks; time changes their drift and wiggle, never their seed. */
export function drawNeutrinoTracks(ctx: Ctx, seconds: number, options: NeutrinoTrackOptions = {}) {
  const { count = 65, seed = 17, bounds = [-180, -180, 2280, 1440] } = options;
  const [left, top, w, h] = bounds;
  for (let i = 0; i < count; i++) {
    const key = seed + i * 13,
      depth = hash(key + 1),
      length = 65 + hash(key + 2) * 145;
    const angle = hash(key + 3) * tau;
    const x = left + ((((hash(key + 4) * w + seconds * (10 + depth * 12)) % w) + w) % w);
    const y = top + ((((hash(key + 5) * h + seconds * (hash(key + 6) - 0.5) * 14) % h) + h) % h);
    layer(ctx, { x, y, angle, alpha: 0.2 + depth * 0.58 }, () => {
      const path: Curve = (p) => [
        p * length,
        10 * Math.sin(p * tau * 2.3 + seconds * 0.8 + key) +
          5 * Math.sin(p * tau * 6.7 - seconds * 1.1 + key * 2),
      ];
      trace(ctx, path, 1, i % 3 ? 'ember' : 'twilight', 1.4 + depth * 1.5, 90);
    });
  }
}

/** An electron and electron antineutrino leave the beta-minus decay vertex. */
export function drawEmission(
  ctx: Ctx,
  origin: Point,
  age: number,
  options: { speed?: number; electronAngle?: number; neutrinoAngle?: number } = {},
) {
  if (age <= 0) return;
  const { speed = 310, electronAngle = 0.55, neutrinoAngle = -0.63 } = options;
  const distance = speed * age;
  layer(ctx, { alpha: smooth(age / 0.16) }, () => {
    const electron: Point = [
      origin[0] + distance * Math.cos(electronAngle),
      origin[1] + distance * Math.sin(electronAngle),
    ];
    const antineutrino: Point = [
      origin[0] + distance * 1.1 * Math.cos(neutrinoAngle),
      origin[1] + distance * 1.1 * Math.sin(neutrinoAngle),
    ];
    drawParticle(ctx, electron, { kind: 'ring', radius: 29, halo: 0.15 });
    drawParticle(ctx, antineutrino, { kind: 'neutrino', radius: 27, halo: 0.4, phase: age });
  });
}

/** The whole boundary scales, so its paint/grain does not regenerate per frame. */
export function drawField(
  ctx: Ctx,
  at: Point,
  radius: number,
  seconds: number,
  options: { growth?: number; population?: number } = {},
) {
  const { growth = 1, population = 9 } = options;
  layer(ctx, { x: at[0], y: at[1] }, () => {
    layer(ctx, { scale: (Math.max(0.001, growth) * radius) / 280, alpha: smooth(growth * 4) }, () => {
      shells(ctx, [280], seconds, 'twilight');
      for (let i = 0; i < 9; i++) {
        const angle = i * 2.3999632297 + 0.12 * Math.sin(seconds * 0.2);
        const distance = 95 + hash(i + 28) * 115;
        layer(ctx, { alpha: smooth(population - i) }, () =>
          drawParticle(ctx, [Math.cos(angle) * distance, Math.sin(angle) * distance], {
            radius: 16,
            material: 'twilight',
            seed: i + 30,
          }),
        );
      }
    });
    glow(ctx, [0, 0], 88, 'twilight', 0.75);
    drawParticle(ctx, [0, 0], { radius: 38 });
    glow(ctx, [0, 0], 42, 'chalk', 0.9);
  });
}

/** Thin, palette-gradient streaks cross the frame, rather than pointing at its core. */
export function drawFieldStreaks(ctx: Ctx, seconds: number, count = 12) {
  for (let i = 0; i < count; i++) {
    const key = i * 11 + 47,
      angle = -0.6 + hash(key) * 2;
    const progress = (((seconds * (0.2 + hash(key + 1) * 0.15) + hash(key + 2)) % 1) + 1) % 1;
    const y = -220 + hash(key + 3) * 1500;
    layer(ctx, { x: -450 + progress * 2900, y, angle }, () => {
      ctx.globalCompositeOperation = 'screen';
      trace(ctx, (p) => [p * 280, 0], 1, 'twilight', 12, 2);
      trace(ctx, (p) => [95 + p * 185, 0], 1, 'ember', 7, 2);
      trace(ctx, (p) => [245 + p * 35, 0], 1, 'chalk', 7, 2);
    });
  }
}

/** Schematic detector cutaway and curved event tracks, sharing one event time. */
export function drawCollider(ctx: Ctx, at: Point, seconds: number, eventTime = 2) {
  layer(ctx, { x: at[0], y: at[1], angle: -0.12 }, () => {
    for (let i = 0; i < 6; i++) {
      layer(ctx, { alpha: 0.2 + i * 0.065 }, () => {
        trace(
          ctx,
          ellipse([i * 20 - 50, 0], 210 + i * 71, 170 + i * 58),
          1,
          i % 2 ? 'ember' : 'twilight',
          i % 2 ? 3 : 10,
        );
      });
    }
    layer(ctx, { alpha: 0.22 }, () => {
      for (let i = 0; i < 24; i++) {
        const angle = (i * tau) / 24;
        trace(
          ctx,
          (p) => [Math.cos(angle) * mix(205, 605, p), Math.sin(angle) * mix(170, 500, p)],
          1,
          'twilight',
          2,
          2,
        );
      }
    });
    const arrival = smooth(seconds / Math.max(0.01, eventTime));
    if (seconds <= eventTime) {
      for (const direction of [-1, 1])
        drawParticleTrack(ctx, (p) => [direction * (1260 - p * 1260), 0], arrival, {
          tail: 0.23,
          weight: 6,
          radius: 10,
          material: 'ember',
          halo: 0.5,
        });
    }
    const age = seconds - eventTime;
    if (age >= 0) {
      for (let i = 0; i < 58; i++) {
        const angle = hash(i + 71) * tau,
          reach = 380 + hash(i + 72) * 980;
        const bend = (hash(i + 73) - 0.5) * 2.6;
        const path: Curve = (p) => [
          Math.cos(angle + bend * p) * reach * p,
          Math.sin(angle + bend * p) * reach * p * 0.83,
        ];
        const progress = unit(age / (1.4 + hash(i + 74) * 2.7));
        layer(ctx, { alpha: 0.26 + hash(i + 75) * 0.54 }, () => {
          trace(ctx, path, progress, i % 4 ? 'ember' : 'chalk', i % 7 ? 1.8 : 3, 150);
        });
        if (progress > 0 && progress < 1)
          drawParticleTrack(ctx, path, progress, { tail: 0.035, weight: 3, radius: 2.5, material: 'chalk' });
      }
      glow(ctx, [0, 0], 30 + 100 * Math.exp(-age * 3), 'ember', 0.85);
      glow(ctx, [0, 0], 20 + 55 * Math.exp(-age * 5), 'chalk', 0.9);
    }
  });
}

const atomReveal: Shot = {
  duration: 9,
  draw(ctx, t) {
    const zoom = tween(t, 1.8, 5.3, 1, 5);
    camera(ctx, [960, 510], zoom, () => drawAtom(ctx, [960, 510], 430, t, 1 - smooth((t - 3) / 1.5)));
    layer(ctx, { alpha: 1 - smooth((t - 1.8) / 0.6) }, () => label(ctx, 'Atom', [960, 925], 44));
    layer(ctx, { alpha: smooth((t - 5.2) / 0.7) }, () => label(ctx, 'Nucleus', [960, 925], 44));
  },
};

const nucleusBonds: Shot = {
  duration: 8,
  draw(ctx, t) {
    const spread = smooth((t - 1) / 1.7) * (1 - smooth((t - 5.3) / 1.3));
    drawNucleus(ctx, [960, 510], 225, t, spread);
    label(ctx, 'Nucleus', [960, 925], 44);
  },
};

const exchange: Shot = {
  duration: 9,
  draw(ctx, t) {
    const from: Point = [570, 530],
      to: Point = [1350, 530];
    drawExchange(ctx, [650, 530], [1270, 530], Math.max(0, t - 0.5));
    drawParticle(ctx, from, { kind: 'ring', radius: 84 });
    drawParticle(ctx, to, { kind: 'ring', radius: 84 });
  },
};

const forceStrands: Shot = {
  duration: 12,
  draw(ctx, t) {
    const scale = tween(t, 4.8, 7.5, 1, 0.63) * (1 + 0.07 * Math.sin(Math.max(0, t - 7) * 1.7));
    layer(ctx, { x: 960, y: 535, scale }, () => {
      const left: Point = [-330, 90],
        right: Point = [330, 90],
        top: Point = [0, -280 + tween(t, 3.4, 5, -450, 0)],
        junction: Point = [0, 90];
      const growing = smooth((t - 1) / 2.5),
        branch = smooth((t - 4) / 1.5);
      drawForceStrand(ctx, left, junction, t, { progress: growing, amplitude: 10 });
      drawForceStrand(ctx, right, junction, t + 0.5, { progress: growing, amplitude: 10 });
      drawForceStrand(ctx, top, junction, t, { progress: branch, amplitude: 10 });
      drawQuark(ctx, left, 96, t, 'd');
      layer(ctx, { alpha: smooth((t - 2.3) / 0.7) }, () => drawQuark(ctx, right, 96, t + 1, 'd'));
      layer(ctx, { alpha: branch }, () => drawQuark(ctx, top, 96, t + 2, 'u'));
    });
  },
};

const constituentReveal: Shot = {
  duration: 8,
  draw(ctx, t) {
    const reveal = smooth((t - 1.3) / 2);
    drawConstituents(ctx, [960, 510], 270, t, { labels: ['u', 'd', 'd'], reveal });
    label(ctx, 'Neutron', [960, 925], 44);
  },
};

const neutrinoTracks: Shot = {
  duration: 10,
  draw(ctx, t) {
    const wide = smooth((t - 2.3) / 2);
    layer(ctx, { alpha: wide }, () => drawNeutrinoTracks(ctx, t));
    layer(ctx, { x: tween(t, 2.3, 4.3, 960, 1450), y: 520, scale: tween(t, 2.3, 4.3, 1, 0.23) }, () => {
      drawParticle(ctx, [0, 0], { kind: 'neutrino', radius: 160, halo: 0.75, phase: t });
    });
    layer(ctx, { alpha: 1 - wide }, () => label(ctx, 'Neutrino', [960, 835], 44));
    layer(ctx, { alpha: smooth((t - 5.6) / 1.2) }, () => {
      glow(ctx, [650, 530], 315, 'twilight', 0.6);
      drawParticle(ctx, [650, 530], { radius: 235 });
    });
  },
};

const betaEmission: Shot = {
  duration: 8,
  draw(ctx, t) {
    const age = t - 3.3;
    drawConstituents(ctx, [780, 510], 245, t, { labels: age < 0 ? ['u', 'd', 'd'] : ['u', 'u', 'd'] });
    drawEmission(ctx, [915, 435], age);
    label(ctx, age < 0 ? 'Neutron' : 'Proton', [780, 887], 44);
    layer(ctx, { alpha: smooth((t - 5.4) / 0.8) }, () => label(ctx, 'β decay', [1320, 510], 44));
  },
};

const fieldInteraction: Shot = {
  duration: 12,
  draw(ctx, t) {
    // Streaks continue independently while the boundary and its contents emerge.
    drawFieldStreaks(ctx, t, 13);
    const growth = tween(t, 2, 6.2, 0.02, 1);
    layer(ctx, { alpha: smooth((t - 1.5) / 0.7) }, () =>
      drawField(ctx, [960, 530], 280, t, { growth, population: Math.max(0, (t - 5) * 1.6) }),
    );
  },
};

const collider: Shot = {
  duration: 8,
  draw(ctx, t) {
    camera(ctx, [960, 540], tween(t, 0, 8, 0.9, 1.07), () => drawCollider(ctx, [960, 540], t));
  },
};

/** Standalone studies. Call draw through renderFrame for the shared backdrop. */
export const interactionStudies: Record<string, Shot> = {
  atomReveal,
  nucleusBonds,
  exchange,
  forceStrands,
  constituentReveal,
  neutrinoTracks,
  betaEmission,
  fieldInteraction,
  collider,
};
