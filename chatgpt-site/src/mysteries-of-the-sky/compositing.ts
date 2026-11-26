// Reference montage techniques. Media remains caller-owned; a layer can draw a
// decoded video frame, transparent illustration, procedural landscape or text.
import {
  body,
  camera,
  ellipse,
  height,
  label,
  layer,
  stars,
  trace,
  tween,
  width,
  type Shot,
} from './index.ts';
import { galaxy, ridge } from './cosmos.ts';
import { sky, wash } from './materials.ts';
type Ctx = CanvasRenderingContext2D;

export function throughMatte(ctx: Ctx, matte: Path2D, content: () => void) {
  ctx.save();
  try {
    ctx.clip(matte);
    content();
  } finally {
    ctx.restore();
  }
}

// Each incoming plane approaches the camera on its own depth track. A single
// projected coordinate system keeps the chamber rings and beam on the same axis.
export function chamber(ctx: Ctx, t: number, planes = 16) {
  const period = 6;
  const depths = Array.from({ length: planes }, (_, i) => (((i / planes + t / period) % 1) + 1) % 1).sort(
    (a, b) => a - b,
  );
  const bloom = ctx.createRadialGradient(960, 540, 3, 960, 540, 730);
  bloom.addColorStop(0, sky.blush);
  bloom.addColorStop(0.06, sky.coral);
  bloom.addColorStop(0.27, '#873f4077');
  bloom.addColorStop(1, '#293fb000');
  ctx.fillStyle = bloom;
  ctx.fillRect(0, 0, width, height);
  for (const depth of depths) {
    const scale = 0.12 / (1.09 - depth),
      r = 810 * scale;
    const offset = 490 * scale;
    for (const side of [-1, 1]) {
      layer(ctx, { alpha: Math.min(1, depth * 3, (1 - depth) * 7) }, () => {
        trace(ctx, ellipse([960 + side * offset, 540], r * 0.28, r), 1, 'ember', Math.max(2, 9 * scale));
      });
    }
  }
  for (let i = 0; i < 100; i++) {
    const p = (i * 0.618 + t * 0.45) % 1,
      a = i * 2.4;
    const origin: [number, number] = [960 + 950 * p * p * Math.cos(a), 540 + 610 * p * p * Math.sin(a)];
    layer(ctx, { alpha: p * 0.65 }, () =>
      trace(
        ctx,
        (u) => [origin[0] + 36 * u * p * Math.cos(a), origin[1] + 36 * u * p * Math.sin(a)],
        1,
        'chalk',
        1.5,
      ),
    );
  }
}

// Draw a travelling rule, then reveal text from its edge (titles and credits).
export function typeWipe(ctx: Ctx, text: string, y: number, size: number, progress: number) {
  ctx.font = '500 ' + size + 'px "Helvetica Neue", Arial, sans-serif';
  const w = ctx.measureText(text).width + 32,
    x = (width - w) / 2,
    edge = x + w * progress;
  const region = new Path2D();
  region.rect(x, y - size, w * progress, 2 * size);
  throughMatte(ctx, region, () => label(ctx, text, [width / 2, y], size));
  if (progress > 0 && progress < 1)
    trace(ctx, (p) => [edge, y - size * 0.55 + p * size * 1.1], 1, 'ember', 4);
}

const passage: Shot = {
  duration: 5,
  draw(ctx, t) {
    chamber(ctx, t);
  },
};
const aperture: Shot = {
  duration: 6,
  draw(ctx, t) {
    stars(ctx, t);
    const plate = new Path2D(),
      cx = 950,
      cy = 445;
    const s = tween(t, 2, 5.6, 1, 5.5);
    // An original helmet silhouette supplies the matte for the illustrated cutaway.
    const shape = new Path2D();
    shape.moveTo(-340, 410);
    shape.bezierCurveTo(-325, 236, -209, 218, -108, 179);
    shape.bezierCurveTo(-220, 63, -201, -186, -45, -206);
    shape.bezierCurveTo(143, -254, 238, -43, 135, 155);
    shape.lineTo(116, 180);
    shape.bezierCurveTo(233, 220, 334, 234, 351, 410);
    shape.closePath();
    plate.addPath(shape, new DOMMatrix().translate(cx, cy).scale(s));
    throughMatte(ctx, plate, () => {
      const atmosphere = wash(ctx, 'ember', 260, 820, 700, -980);
      ctx.fillStyle = atmosphere;
      ctx.fillRect(0, 0, width, height);
      camera(ctx, [960, 500], 1 + t * 0.04, () => {
        body(ctx, 'sphere', [1000, 350], 95, 'ember');
        ridge(ctx, 520, 100, t * 17, 'twilight');
        ridge(ctx, 654, 85, 320 + t * 36, 'ink');
      });
    });
  },
};
const titles: Shot = {
  duration: 6,
  draw(ctx, t) {
    stars(ctx, t, 200);
    layer(ctx, { alpha: 0.8 }, () => galaxy(ctx, [960, 530], 980, -0.24, t * 0.015));
    typeWipe(ctx, 'Mysteries of the Sky', 540, 92, tween(t, 0.6, 3, 0, 1));
  },
};
export const montageStudies = { passage, aperture, titles };
