import {
  body,
  camera,
  ellipse,
  height,
  label,
  layer,
  smooth,
  stars,
  tau,
  trace,
  tween,
  width,
  type Curve,
  type Point,
  type Shot,
} from './index.ts';
import { sky, wash, type Material } from './materials.ts';

type Ctx = CanvasRenderingContext2D;
function sequence(seed: number) {
  return () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
}

// A seeded clip works with an illustration, decoded image, video frame or another shot.
export function tileReveal(ctx: Ctx, progress: number, columns: number, draw: () => void, seed = 7) {
  if (!Number.isInteger(columns) || columns < 1 || columns > 256)
    throw new RangeError('Tile column count must be between 1 and 256');
  const cell = width / columns,
    random = sequence(seed);
  ctx.save();
  try {
    ctx.beginPath();
    for (let y = 0; y < height; y += cell)
      for (let x = 0; x < width; x += cell) {
        if (random() < progress) ctx.rect(x, y, cell + 0.5, cell + 0.5);
      }
    ctx.clip();
    draw();
  } finally {
    ctx.restore();
  }
}

// Render a lumpy, inclined spiral in object coordinates, then move the camera
// over the same dust lanes. Caching keeps seek and playback equally inexpensive.
let galaxyPlate: OffscreenCanvas | undefined;
function spiralPlate() {
  if (galaxyPlate) return galaxyPlate;
  const n = 1300,
    plate = new OffscreenCanvas(n, n),
    ctx = plate.getContext('2d')!;
  const random = sequence(1327);
  ctx.translate(n / 2, n / 2);
  const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, n * 0.47);
  halo.addColorStop(0, sky.blush);
  halo.addColorStop(0.09, sky.coral);
  halo.addColorStop(0.3, '#a24f6866');
  halo.addColorStop(0.7, '#5954a533');
  halo.addColorStop(1, '#48469900');
  ctx.fillStyle = halo;
  ctx.fillRect(-n / 2, -n / 2, n, n);
  const paint = [sky.lilac, sky.coral, sky.blush, sky.indigo, sky.wine, sky.light];
  for (let i = 0; i < 85000; i++) {
    const r = random() ** 1.45 * n * 0.46;
    const scatter = i % 7 === 0 ? 3.6 : 0.49 + (0.72 * r) / n;
    const spread = (random() + random() + random() - 1.5) * scatter;
    const a = ((i % 3) * tau) / 3 + 4.2 * Math.log1p(r / 65) + spread + 0.085 * Math.sin(r * 0.033);
    const x = Math.cos(a) * r * (1 + 0.1 * Math.sin(3 * a)),
      y = Math.sin(a) * r + 0.03 * r * Math.sin(0.017 * r);
    const k = Math.floor(random() * paint.length),
      dot = (0.35 + random() ** 3 * 2.7) * (1 - (0.58 * r) / (n * 0.46));
    ctx.globalAlpha = 0.12 + 0.51 * random();
    ctx.fillStyle = paint[k];
    ctx.fillRect(x, y, dot, dot);
  }
  galaxyPlate = plate;
  return plate;
}

export function galaxy(ctx: Ctx, center: Point, radius: number, tilt: number, rotation: number) {
  layer(ctx, { x: center[0], y: center[1], angle: tilt }, () => {
    ctx.scale(1, 0.62);
    ctx.rotate(rotation);
    ctx.drawImage(spiralPlate(), -radius, -radius, 2 * radius, 2 * radius);
  });
}

// Perspective latitude/longitude mesh. The height function also accepts a flat
// plane or a passing wave so a shot can transition continuously into a well.
export function gravityMesh(ctx: Ctx, t: number, depth: number) {
  const yaw = 0.21 + 0.055 * Math.sin(0.35 * t);
  const project = (x: number, z: number): Point => {
    const turn = x * Math.cos(yaw) + z * Math.sin(yaw),
      back = z * Math.cos(yaw) - x * Math.sin(yaw);
    const y = depth * Math.exp(-(x * x + z * z) / 0.56);
    const perspective = 1 / (1 + back * 0.084);
    return [960 + turn * 350 * perspective, 490 + (-back * 128 + y) * perspective];
  };
  for (let i = -10; i <= 10; i++) {
    const v = i * 0.32;
    trace(ctx, (p) => project(v, p * 6.4 - 3.2), 1, 'twilight', 2.7);
    trace(ctx, (p) => project(p * 6.4 - 3.2, v), 1, 'chalk', 1.5);
  }
}

export function fieldRibbon(ctx: Ctx, length: number, halfWidth: number, t: number, material: Material) {
  const edge = (p: number, sign: number): Point => [
    (p - 0.5) * length,
    sign * (halfWidth + 7 * Math.sin(9 * tau * p + t) + 3 * Math.sin(15 * tau * p - t * 0.4)),
  ];
  ctx.beginPath();
  for (let i = 0; i <= 180; i++) {
    const pt = edge(i / 180, 1);
    if (i) ctx.lineTo(...pt);
    else ctx.moveTo(...pt);
  }
  for (let i = 180; i >= 0; i--) ctx.lineTo(...edge(i / 180, -1));
  ctx.closePath();
  ctx.fillStyle = wash(ctx, material, -length * 0.28, -halfWidth, length * 0.55, halfWidth * 2);
  ctx.fill();
  trace(ctx, (p) => [(p - 0.5) * length, halfWidth * 0.68 * Math.sin(10 * tau * p - t * 2)], 1, 'chalk', 4);
}

export function flowContours(ctx: Ctx, t: number, rows = 18) {
  for (let i = 0; i < rows; i++) {
    const a = (i * tau) / rows;
    const line: Curve = (p) => {
      const r = 70 + 1280 * p,
        angle = a + 1.1 * Math.exp(-p * 3) + 0.18 * Math.sin(2 * tau * p + a + t * 0.22);
      return [960 + r * Math.cos(angle), 540 + 0.69 * r * Math.sin(angle)];
    };
    layer(ctx, { alpha: 0.34 }, () => trace(ctx, line, 1, 'twilight', 7 + (i % 3) * 3));
  }
}

// Inline annotations stay tied to the width of the expression as it scales.
export function equation(
  ctx: Ctx,
  center: Point,
  terms: readonly { text: string; meaning?: string }[],
  t: number,
  size = 76,
) {
  layer(ctx, { x: center[0], y: center[1] }, () => {
    ctx.font = 'italic ' + size + 'px Georgia, serif';
    const widths = terms.map((term) => ctx.measureText(term.text).width + size * 0.2);
    let x = -widths.reduce((a, b) => a + b, 0) / 2;
    terms.forEach((term, i) => {
      const w = widths[i],
        local = t - i * 0.42;
      layer(ctx, { alpha: smooth(local / 0.6) }, () => {
        ctx.font = 'italic ' + size + 'px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = wash(ctx, 'chalk', 0, size, 0, -size * 1.7);
        ctx.fillText(term.text, x + w / 2, 0);
        if (term.meaning) {
          const offset = terms.slice(0, i).filter((prior) => prior.meaning).length % 2 === 0 ? -1 : 1,
            start = x + w / 2;
          trace(ctx, (p) => [start, p * offset * 77 + offset * 50], smooth((local - 0.35) / 0.7), 'chalk', 2);
          layer(ctx, { alpha: smooth((local - 0.8) / 0.5) }, () =>
            label(ctx, term.meaning!, [start, offset * 154], 28),
          );
        }
      });
      x += w;
    });
  });
}

export function expansionCone(ctx: Ctx, p: number, t: number) {
  const span = 1510 * smooth(p);
  if (span < 1) return;
  layer(ctx, { x: 270, y: 540 }, () => {
    const radius = (u: number) => 142 * (1 - Math.exp(-u * 13)) + u * 150;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let i = 0; i <= 180; i++) {
      const x = (i / 180) * span;
      ctx.lineTo(x, -radius(x / 1510));
    }
    for (let i = 180; i >= 0; i--) {
      const x = (i / 180) * span;
      ctx.lineTo(x, radius(x / 1510));
    }
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = wash(ctx, 'ember', 1510, -350, -1510, 700);
    ctx.fillRect(0, -360, 1510, 720);
    const random = sequence(41);
    for (let i = 0; i < 720; i++) {
      const u = (random() + t * 0.047) % 1,
        v = random() * 2 - 1,
        r = 1 + random() * 5;
      body(ctx, 'sphere', [1510 * u, v * radius(u)], r, 'chalk');
    }
  });
}

export function ridge(ctx: Ctx, baseline: number, relief: number, shift: number, material: Material) {
  const contour = (x: number) =>
    baseline +
    relief *
      (0.43 * Math.sin(x * 0.004) +
        0.28 * Math.sin(x * 0.009 + 1) +
        0.21 * Math.cos(0.016 * x) +
        0.08 * Math.sin(0.044 * x));
  ctx.beginPath();
  ctx.moveTo(0, height);
  for (let x = 0; x <= width + 8; x += 8) ctx.lineTo(x, contour(x + shift));
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fillStyle = wash(ctx, material, 0, height, 0, baseline - relief - height);
  ctx.fill();
}

const cosmos: Shot = {
  duration: 6,
  draw(ctx, t) {
    const skywash = ctx.createLinearGradient(0, 0, width * 0.8, height * 0.8);
    skywash.addColorStop(0, sky.indigo);
    skywash.addColorStop(0.48, sky.lilac);
    skywash.addColorStop(0.8, sky.blush);
    skywash.addColorStop(1, sky.coral);
    ctx.fillStyle = skywash;
    ctx.fillRect(0, 0, width, height);
    body(ctx, 'sphere', [1240, 335], 182, 'ember');
    ridge(ctx, 608, 129, t * 13, 'twilight');
    ridge(ctx, 790, 166, 600 + t * 26, 'ink');
    tileReveal(ctx, tween(t, 0.65, 2.65, 0, 1), 16, () => {
      const background = ctx.createLinearGradient(0, 0, width, height);
      background.addColorStop(0, sky.plum);
      background.addColorStop(1, sky.night);
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
      stars(ctx, t, 220);
      camera(ctx, [940, 520], tween(t, 2, 6, 1, 1.28), () => galaxy(ctx, [960, 545], 940, -0.19, t * 0.025));
    });
  },
};
const spacetime: Shot = {
  duration: 5,
  draw(ctx, t) {
    stars(ctx, t, 100);
    gravityMesh(ctx, t, tween(t, 0.35, 3, 0, 390));
    body(ctx, 'sphere', [960, 450 + tween(t, 0, 3, 0, 240)], 83, 'ember');
  },
};
const fields: Shot = {
  duration: 6,
  draw(ctx, t) {
    const spread = tween(t, 0.5, 4, 0, 1);
    ['twilight', 'ember', 'twilight'].forEach((m, i) => {
      layer(
        ctx,
        { x: 960 + (i - 1) * (447 - spread * 340), y: 540, angle: Math.PI / 2 + (i - 1) * spread * 0.82 },
        () => {
          ctx.scale(0.17 + 0.83 * spread, 0.88);
          fieldRibbon(ctx, 1560, 98, t + i, m as Material);
        },
      );
    });
  },
};
const annotation: Shot = {
  duration: 6,
  draw(ctx, t) {
    flowContours(ctx, t);
    equation(
      ctx,
      [960, 540],
      [
        { text: 'F', meaning: 'Observed flux' },
        { text: '=' },
        { text: 'L', meaning: 'Luminosity' },
        { text: '/' },
        { text: '(4πd²)', meaning: 'Area of a sphere' },
      ],
      t,
    );
  },
};
const expansion: Shot = {
  duration: 5,
  draw(ctx, t) {
    stars(ctx, t);
    for (let i = 1; i < 8; i++)
      layer(ctx, { alpha: 0.22 }, () => trace(ctx, ellipse([270, 540], i * 245, i * 245), 1, 'twilight', 2));
    expansionCone(ctx, t / 3.5, t);
  },
};
export const cosmosStudies = { cosmos, spacetime, fields, annotation, expansion };
