import {
  body,
  camera,
  ellipse,
  label,
  layer,
  smooth,
  tau,
  trace,
  tween,
  type Material,
  type Point,
  type Shot,
} from './index.ts';
import { wash } from './materials.ts';

type Ctx = CanvasRenderingContext2D;
type Point3 = readonly [number, number, number];
export type Particle = {
  id: string;
  name: string;
  glyph: string;
  material: Material;
  kind: 'quark' | 'lepton' | 'neutrino' | 'force' | 'scalar';
  generation?: 0 | 1 | 2;
};

// Reference: 05:20–06:20 fills these outer slots; 06:30 sorts generations;
// 06:55–07:15 tilts and reorders the same upright icons over an annular deck.
// The catalog is a diagram of the Standard Model, not a physical scale model.
export const catalogParticles: readonly Particle[] = [
  { id: 'up', name: 'Up quark', glyph: 'u', material: 'ember', kind: 'quark', generation: 0 },
  { id: 'down', name: 'Down quark', glyph: 'd', material: 'ember', kind: 'quark', generation: 0 },
  { id: 'strange', name: 'Strange quark', glyph: 's', material: 'twilight', kind: 'quark', generation: 1 },
  { id: 'bottom', name: 'Bottom quark', glyph: 'b', material: 'twilight', kind: 'quark', generation: 2 },
  {
    id: 'tau-neutrino',
    name: 'Tau neutrino',
    glyph: 'ντ',
    material: 'twilight',
    kind: 'neutrino',
    generation: 2,
  },
  {
    id: 'muon-neutrino',
    name: 'Muon neutrino',
    glyph: 'νμ',
    material: 'twilight',
    kind: 'neutrino',
    generation: 1,
  },
  {
    id: 'electron-neutrino',
    name: 'Electron neutrino',
    glyph: 'νe',
    material: 'ember',
    kind: 'neutrino',
    generation: 0,
  },
  { id: 'electron', name: 'Electron', glyph: 'e', material: 'ember', kind: 'lepton', generation: 0 },
  { id: 'muon', name: 'Muon', glyph: 'μ', material: 'twilight', kind: 'lepton', generation: 1 },
  { id: 'tau', name: 'Tau', glyph: 'τ', material: 'twilight', kind: 'lepton', generation: 2 },
  { id: 'top', name: 'Top quark', glyph: 't', material: 'twilight', kind: 'quark', generation: 2 },
  { id: 'charm', name: 'Charm quark', glyph: 'c', material: 'twilight', kind: 'quark', generation: 1 },
  { id: 'photon', name: 'Photon', glyph: 'γ', material: 'ember', kind: 'force' },
  { id: 'gluon', name: 'Gluon', glyph: 'g', material: 'twilight', kind: 'force' },
  { id: 'w', name: 'W boson', glyph: 'W', material: 'twilight', kind: 'force' },
  { id: 'z', name: 'Z boson', glyph: 'Z', material: 'ember', kind: 'force' },
  { id: 'higgs', name: 'Higgs boson', glyph: 'H', material: 'chalk', kind: 'scalar' },
];
const fermions = catalogParticles.slice(0, 12);
const mix = (a: number, b: number, p: number) => a + (b - a) * p;
const mixPoint = (a: Point, b: Point, p: number): Point => [mix(a[0], b[0], p), mix(a[1], b[1], p)];
const angleAt = (i: number) => -Math.PI / 2 - Math.PI / 12 + (tau * i) / 12;
const radial = (angle: number, r: number): Point => [r * Math.cos(angle), r * Math.sin(angle)];

function caption(ctx: Ctx, text: string, at: Point, size: number) {
  const words = text.split(' ');
  if (words.length < 2) label(ctx, text, at, size);
  else {
    label(ctx, words.slice(0, -1).join(' '), [at[0], at[1] - size * 0.56], size);
    label(ctx, words.at(-1)!, [at[0], at[1] + size * 0.56], size);
  }
}

/** Stable object-space paint; the procedural linework moves inside an upright icon. */
export function particleIcon(
  ctx: Ctx,
  particle: Particle,
  center: Point,
  radius = 48,
  t = 0,
  showName = false,
) {
  if (radius <= 0) return;
  layer(ctx, { x: center[0], y: center[1], scale: radius / 48 }, () => {
    body(ctx, particle.kind === 'lepton' ? 'torus' : 'sphere', [0, 0], 48, particle.material, 3);
    if (particle.kind === 'quark') {
      // A fine winding line distinguishes quarks from the charged-lepton rings.
      trace(ctx, (p) => [35 * Math.sin(tau * p + t * 0.35), -34 + 68 * p], 1, 'chalk', 1.4, 72);
    } else if (particle.kind === 'neutrino') {
      for (let j = 0; j < 3; j++)
        trace(ctx, ellipse([0, 0], 36, 9, t * 0.22 + (j * Math.PI) / 3), 1, 'chalk', 1.1, 64);
    } else if (particle.kind === 'force') {
      if (particle.id === 'gluon') {
        for (let j = 0; j < 3; j++)
          trace(ctx, ellipse([0, 0], 31, 12, (j * Math.PI) / 3 + t * 0.18), 1, 'chalk', 1.4, 64);
      } else if (particle.id === 'photon') {
        trace(ctx, (p) => [-35 + 70 * p, 11 * Math.sin(tau * (2 * p - t * 0.2))], 1, 'chalk', 2, 72);
      } else body(ctx, 'torus', [0, 0], 37, 'chalk', 4);
    }
    // A small dark center keeps the letter legible over moving internal paths.
    if (particle.kind !== 'lepton') body(ctx, 'sphere', [0, 0], 17, 'ink', 2);
    label(ctx, particle.glyph, [0, 0], particle.kind === 'neutrino' ? 21 : 27);
    if (showName) caption(ctx, particle.name, [0, 76], 17);
  });
}

function annulus(ctx: Ctx, outer: number, inner: number, material: Material = 'twilight', sectors = 12) {
  ctx.save();
  try {
    ctx.beginPath();
    ctx.arc(0, 0, outer, 0, tau);
    ctx.arc(0, 0, inner, 0, tau, true);
    ctx.clip('evenodd');
    ctx.fillStyle = wash(ctx, material, -outer, outer, outer * 2, -outer * 2);
    ctx.fillRect(-outer, -outer, outer * 2, outer * 2);
    // The translucent paint and attached grain come from the existing sky body.
    layer(ctx, { alpha: 0.28 }, () => body(ctx, 'sphere', [0, 0], outer, 'twilight', 11));
  } finally {
    ctx.restore();
  }
  layer(ctx, { alpha: 0.48 }, () => {
    trace(ctx, ellipse([0, 0], outer, outer), 1, 'chalk', 1.3);
    trace(ctx, ellipse([0, 0], inner, inner), 1, 'chalk', 1.3);
    for (let i = 0; i < sectors; i++) {
      const angle = -Math.PI / 2 - Math.PI / 6 + (tau * i) / sectors;
      const a = radial(angle, inner),
        b = radial(angle, outer);
      ctx.save();
      ctx.setLineDash([4, 7]);
      trace(ctx, (p) => mixPoint(a, b, p), 1, 'chalk', 1.2, 2);
      ctx.restore();
    }
  });
}

function emptySlot(ctx: Ctx, center: Point, radius: number) {
  layer(ctx, { alpha: 0.38 }, () => {
    ctx.save();
    ctx.setLineDash([3, 5]);
    trace(ctx, ellipse(center, radius, radius), 1, 'chalk', 1.6, 72);
    ctx.restore();
  });
}

export type TaxonomyOptions = {
  center?: Point;
  radius?: number;
  fill?: number;
  innerFill?: number;
  names?: boolean;
  sectors?: boolean;
  selected?: string;
  rotation?: number;
};

/** A named, segmented annulus with independently fillable matter/force slots. */
export function taxonomyWheel(ctx: Ctx, t: number, options: TaxonomyOptions = {}) {
  const {
    center = [960, 540],
    radius = 410,
    fill = 12,
    innerFill = 5,
    names = true,
    sectors = true,
    selected,
    rotation = 0,
  } = options;
  layer(ctx, { x: center[0], y: center[1], scale: radius / 410 }, () => {
    // Broad, quiet concentric ground remains behind the exact slot outlines.
    layer(ctx, { alpha: 0.35 }, () => {
      body(ctx, 'shell', [0, 0], 530, 'ink', 8);
      body(ctx, 'shell', [0, 0], 660, 'ink', 9);
    });
    layer(ctx, { angle: rotation }, () => annulus(ctx, 410, 265));
    if (sectors) {
      label(ctx, 'QUARKS', [0, -456], 22);
      label(ctx, 'LEPTONS', [0, 456], 22);
    }
    fermions.forEach((particle, i) => {
      const at = radial(angleAt(i) + rotation, 339),
        appear = smooth(fill - i);
      emptySlot(ctx, at, 39);
      if (selected === particle.id)
        layer(ctx, { alpha: 0.75 }, () => trace(ctx, ellipse(at, 58, 58), 1, 'chalk', 2));
      layer(ctx, { alpha: appear, scale: 1 }, () => particleIcon(ctx, particle, at, 39, t, names));
    });
    layer(ctx, { alpha: smooth(innerFill) }, () => annulus(ctx, 241, 104, 'ink', 4));
    catalogParticles.slice(12, 16).forEach((particle, i) => {
      const at = radial(-Math.PI * 0.75 + (i * Math.PI) / 2, 169);
      layer(ctx, { alpha: smooth(innerFill - i) }, () => particleIcon(ctx, particle, at, 37, t, names));
    });
    layer(ctx, { alpha: smooth(innerFill - 4) }, () =>
      particleIcon(ctx, catalogParticles[16], [0, 0], 44, t, names),
    );
  });
}

function generationColumn(particle: Particle) {
  if (particle.kind === 'lepton') return 0;
  if (particle.kind === 'neutrino') return 1;
  return ['up', 'charm', 'top'].includes(particle.id) ? 2 : 3;
}

export type ReflowOptions = {
  center?: Point;
  radius?: number;
  rows?: number;
  deck?: number;
  rotation?: number;
  names?: boolean;
};

/** Continuous identities between a ring, three generation rows and three tilted decks.
 * rows/deck are clamped blend amounts; the icons billboard rather than flattening. */
export function taxonomyReflow(ctx: Ctx, t: number, options: ReflowOptions = {}) {
  const { center = [1050, 540], radius = 390, rotation = 0, names = true } = options;
  const rows = Math.max(0, Math.min(1, options.rows ?? 0));
  const deck = Math.max(0, Math.min(1, options.deck ?? 0));
  layer(ctx, { x: center[0], y: center[1] }, () => {
    layer(ctx, { alpha: (1 - rows) * (1 - deck) }, () => annulus(ctx, radius, radius * 0.64));
    for (let generation = 0; generation < 3; generation++) {
      const y = -228 + generation * 228;
      layer(ctx, { alpha: Math.max(rows, deck) }, () =>
        label(
          ctx,
          ['1st generation', '2nd generation', '3rd generation'][generation],
          [mix(-650, -556, deck), y + 38 * deck],
          27,
        ),
      );
      layer(ctx, { x: 70, y: y + 43, alpha: deck }, () => {
        ctx.save();
        ctx.scale(1, 0.24);
        annulus(ctx, 440, 167, 'twilight', 4);
        ctx.restore();
      });
    }
    const placed = fermions.map((particle, i) => {
      const generation = particle.generation!,
        column = generationColumn(particle);
      const wheel = radial(angleAt(i), radius * 0.825);
      const row: Point = [-335 + column * 240, -228 + generation * 228];
      const a = -Math.PI * 0.75 + (column * Math.PI) / 2 + rotation;
      const floor: Point = [70 + 340 * Math.cos(a), -228 + generation * 228 + 43 + 82 * Math.sin(a)];
      return {
        particle,
        at: mixPoint(mixPoint(wheel, row, rows), floor, deck),
        radius: mix(39, 43, rows) * (1 - 0.08 * deck),
      };
    });
    // Back-to-front sorting is stable through all three layouts.
    placed.sort((a, b) => a.at[1] - b.at[1]);
    placed.forEach(({ particle, at, radius: r }) => particleIcon(ctx, particle, at, r, t, names));
  });
}

const cubeVertices: readonly Point3[] = [
  [-1, -1, -1],
  [1, -1, -1],
  [1, 1, -1],
  [-1, 1, -1],
  [-1, -1, 1],
  [1, -1, 1],
  [1, 1, 1],
  [-1, 1, 1],
];
const cubeEdges: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];

function project(point: Point3, rotation: number, size: number): Point3 {
  const cy = Math.cos(rotation),
    sy = Math.sin(rotation),
    cx = Math.cos(-0.24),
    sx = Math.sin(-0.24);
  const x = point[0] * cy + point[2] * sy,
    z = -point[0] * sy + point[2] * cy;
  const y = point[1] * cx - z * sx,
    depth = point[1] * sx + z * cx;
  const perspective = 1 / (1 + depth * 0.12);
  return [x * size * perspective, y * size * perspective, depth];
}

export type ContainerOptions = {
  center?: Point;
  size?: number;
  mode?: 'exclusion' | 'coalescence';
  progress?: number;
  rotation?: number;
};

/** Rotating wire cube: distinct schematic state markers versus a shared state.
 * This visual comparison does not equate the Pauli principle with spatial repulsion.
 * Reference: the six colored particles and shared shell at 03:35–03:55. */
export function particleContainer(ctx: Ctx, t: number, options: ContainerOptions = {}) {
  const { center = [960, 540], size = 205, mode = 'exclusion', rotation = t * 0.2 } = options;
  const progress = smooth(options.progress ?? 1);
  const vertices = cubeVertices.map((v) => project(v, rotation, size));
  const edge = (a: number, b: number, alpha: number) =>
    layer(ctx, { alpha }, () =>
      trace(
        ctx,
        (p) => mixPoint([vertices[a][0], vertices[a][1]], [vertices[b][0], vertices[b][1]], p),
        1,
        'chalk',
        2,
        2,
      ),
    );
  const points: Point3[] = [
    [-0.53, 0.48, -0.4],
    [0, 0.48, 0.35],
    [0.53, 0.48, -0.15],
    [-0.29, -0.05, 0.25],
    [0.29, -0.05, -0.3],
    [0, -0.56, 0.05],
  ];
  layer(ctx, { x: center[0], y: center[1] }, () => {
    // Far edges, then depth-sorted particles, then the nearest wire segments.
    cubeEdges.forEach(([a, b]) => {
      if ((vertices[a][2] + vertices[b][2]) / 2 > 0) edge(a, b, 0.3);
    });
    if (mode === 'coalescence')
      layer(ctx, { alpha: progress * 0.8 }, () => {
        body(ctx, 'shell', [0, 0], size * 0.67, 'twilight', 12);
        body(ctx, 'shell', [0, 0], size * 0.75, 'chalk', 5);
      });
    const placed = points
      .map((p, i) => {
        const drift: Point3 = [
          p[0] + 0.06 * Math.sin(t * 0.8 + i),
          p[1] + 0.045 * Math.cos(t * 0.6 + i),
          p[2],
        ];
        const amount = mode === 'coalescence' ? mix(1, 0.16, progress) : 1;
        const projected = project([drift[0] * amount, drift[1] * amount, drift[2] * amount], rotation, size);
        return { i, projected };
      })
      .sort((a, b) => b.projected[2] - a.projected[2]);
    placed.forEach(({ i, projected: [x, y, z] }) => {
      const radius = (size * 0.135) / (1 + z * 0.12);
      layer(ctx, { x, y, scale: radius / 48, alpha: mode === 'coalescence' ? 0.86 : 1 }, () =>
        body(ctx, 'sphere', [0, 0], 48, i % 3 === 0 ? 'ember' : 'twilight', (i % 3) + 1),
      );
    });
    cubeEdges.forEach(([a, b]) => {
      if ((vertices[a][2] + vertices[b][2]) / 2 <= 0) edge(a, b, 0.75);
    });
  });
}

export type MaskHole = { center: Point; radius: number };

/** True transparent cutouts. Sequential inverse clips subtract the union even
 * when holes overlap; a single even-odd path would incorrectly restore overlaps. */
export function negativeSpaceMask(
  ctx: Ctx,
  holes: readonly MaskHole[],
  paint: () => void,
  bounds: readonly [number, number, number, number] = [-4096, -4096, 8192, 8192],
) {
  ctx.save();
  try {
    for (const { center, radius } of holes) {
      if (radius <= 0) continue;
      ctx.beginPath();
      ctx.rect(...bounds);
      ctx.moveTo(center[0] + radius, center[1]);
      ctx.arc(...center, radius, 0, tau);
      ctx.clip('evenodd');
    }
    paint();
  } finally {
    ctx.restore();
  }
}

/** A moving perforated field with attached concentric texture and lit cut edges.
 * Reference: the wheel recedes into an aperture and becomes a field at 14:45–15:00. */
export function cutoutField(
  ctx: Ctx,
  t: number,
  options: { center?: Point; scale?: number; openness?: number } = {},
) {
  const { center = [960, 540], scale = 1, openness = 1 } = options;
  const opening = Math.max(0, Math.min(1, openness));
  const source: readonly (readonly [number, number, number])[] = [
    [0, 0, 137],
    [-770, -170, 278],
    [-544, 480, 233],
    [630, 373, 280],
    [510, -518, 206],
    [-305, -560, 172],
    [840, -150, 170],
  ];
  layer(ctx, { x: center[0], y: center[1], scale }, () => {
    const holes = source.map(([x, y, r], i) => ({
      center: [x + Math.sin(t * 0.19 + i) * 26, y + Math.cos(t * 0.17 + i * 1.7) * 22] as Point,
      radius: r * opening,
    }));
    const paint = () => {
      ctx.fillStyle = wash(ctx, 'twilight', -1260, 780, 2520, -1560);
      ctx.fillRect(-2400, -1600, 4800, 3200);
      layer(ctx, { alpha: 0.7 }, () => body(ctx, 'sphere', [0, 0], 1260, 'ink', 13));
      for (let i = 0; i < 8; i++) {
        const r = 210 + i * 147;
        layer(ctx, { alpha: 0.56 }, () => body(ctx, 'shell', [0, 0], r, 'ink', i + 2));
        layer(ctx, { alpha: 0.2 }, () => trace(ctx, ellipse([0, 0], r, r), 1, 'chalk', 2));
      }
    };
    negativeSpaceMask(ctx, holes, paint);
    // Clip edge lighting too: overlapping holes must remain open in the output.
    holes.forEach((hole, i) =>
      negativeSpaceMask(
        ctx,
        holes.filter((_, j) => i !== j),
        () => {
          layer(ctx, { alpha: 0.68 * opening }, () =>
            trace(ctx, ellipse(hole.center, hole.radius, hole.radius), 1, 'twilight', 8, 144),
          );
          layer(ctx, { alpha: 0.4 * opening }, () =>
            trace(
              ctx,
              (p) => {
                const a = Math.PI * 0.5 + p * Math.PI * 0.85;
                return [
                  hole.center[0] + Math.cos(a) * hole.radius,
                  hole.center[1] + Math.sin(a) * hole.radius,
                ];
              },
              1,
              'chalk',
              2.4,
              72,
            ),
          );
        },
      ),
    );
  });
}

const taxonomy: Shot = {
  duration: 12,
  draw(ctx, t) {
    label(ctx, 'A particle taxonomy', [960, 67], 38);
    taxonomyWheel(ctx, t, { radius: 398, fill: tween(t, 0.5, 7, 0, 12), innerFill: tween(t, 7, 10, 0, 5) });
    layer(ctx, { alpha: 1 - smooth((t - 7) / 2) }, () =>
      label(ctx, 'One family, many distinct identities', [960, 1015], 26),
    );
    layer(ctx, { alpha: smooth((t - 8) / 2) }, () =>
      label(ctx, 'Matter around the rim · bosons inside', [960, 1015], 26),
    );
  },
};

const reflow: Shot = {
  duration: 15,
  draw(ctx, t) {
    const rows = tween(t, 2, 5, 0, 1),
      deck = tween(t, 7.5, 10.5, 0, 1);
    label(
      ctx,
      deck > 0.5
        ? 'The same catalog, viewed as a stacked deck'
        : rows > 0.5
          ? 'Sort by generation'
          : 'Keep each identity through a reflow',
      [960, 75],
      36,
    );
    taxonomyReflow(ctx, t, { rows, deck, rotation: tween(t, 11, 15, 0, 0.38) });
    label(ctx, 'Ring → rows → tilted layers', [960, 1010], 26);
  },
};

const containers: Shot = {
  duration: 10,
  draw(ctx, t) {
    label(ctx, 'State occupancy — schematic', [960, 82], 38);
    label(ctx, 'FERMIONS', [515, 230], 31);
    label(ctx, 'BOSONS', [1405, 230], 31);
    particleContainer(ctx, t, { center: [515, 560], size: 204, mode: 'exclusion' });
    particleContainer(ctx, t, {
      center: [1405, 560],
      size: 204,
      mode: 'coalescence',
      progress: tween(t, 2, 6, 0, 1),
    });
    label(ctx, 'One particle per state', [515, 903], 31);
    label(ctx, 'Many particles in one state', [1405, 903], 31);
    label(ctx, 'The markers represent states, not positions in space', [960, 1016], 25);
  },
};

const fillZoom: Shot = {
  duration: 10,
  draw(ctx, t) {
    const zoom = tween(t, 4, 8, 1, 2.9),
      focus = mixPoint(
        [960, 540],
        [960 + radial(angleAt(7), 339)[0], 540 + radial(angleAt(7), 339)[1]],
        smooth((t - 4) / 4),
      );
    camera(ctx, focus, zoom, () =>
      taxonomyWheel(ctx, t, {
        fill: tween(t, 0.2, 3.8, 0, 12),
        innerFill: 0,
        sectors: false,
        selected: 'electron',
      }),
    );
    // Keep screen typography outside the camera so its hierarchy survives the push.
    label(ctx, t < 5 ? 'Fill the vacancies' : 'Focus one occupied sector', [960, 70], 36);
  },
};

const masks: Shot = {
  duration: 12,
  draw(ctx, t) {
    const shrink = tween(t, 0, 4, 1, 0.08);
    layer(
      ctx,
      { alpha: 1 - smooth((t - 2) / 2), scale: shrink, x: 960 * (1 - shrink), y: 540 * (1 - shrink) },
      () => taxonomyWheel(ctx, t, { radius: 392 }),
    );
    layer(ctx, { alpha: smooth((t - 2.5) / 2) }, () =>
      cutoutField(ctx, t, { scale: tween(t, 4, 12, 0.65, 1.18), openness: tween(t, 2.5, 6, 0.12, 1) }),
    );
    label(ctx, t < 4 ? 'Let the catalog recede' : 'Use absence as a shape', [960, 76], 36);
    layer(ctx, { alpha: smooth((t - 6) / 2) }, () =>
      label(ctx, 'Moving cutouts reveal the sky beneath', [960, 1015], 27),
    );
  },
};

export const catalogStudies: Record<string, Shot> = {
  'taxonomy-wheel': taxonomy,
  'taxonomy-reflow': reflow,
  'particle-containers': containers,
  'catalog-fill-zoom': fillZoom,
  'negative-space': masks,
};
