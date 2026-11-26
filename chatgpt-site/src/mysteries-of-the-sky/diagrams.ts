import { body, label, layer, tau, tween, type Point, type Shot } from './index.ts';
import { catalogParticles, particleIcon } from './catalog.ts';
import { throughMatte } from './compositing.ts';
import { equation } from './cosmos.ts';
import { sky, wash } from './materials.ts';

type Ctx = CanvasRenderingContext2D;
// Stable indices let an author carry any set of symbols from one arrangement
// into another. Both layouts may move as the transition plays.
export function reflow<T>(
  items: readonly T[],
  from: (i: number) => Point,
  to: (i: number) => Point,
  p: number,
  paint: (item: T, at: Point, i: number) => void,
) {
  const k = Math.min(1, Math.max(0, p));
  items.forEach((item, i) => {
    const a = from(i),
      b = to(i);
    paint(item, [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], i);
  });
}

export function cutaway(
  ctx: Ctx,
  at: Point,
  radius: number,
  amount: number,
  outside: () => void,
  inside: () => void,
) {
  const k = Math.min(1, Math.max(0, amount)),
    edge = at[0] + radius * (1 - 2 * k);
  const mask = new Path2D();
  mask.arc(...at, radius, 0, tau);
  throughMatte(ctx, mask, () => {
    outside();
    const slice = new Path2D();
    slice.rect(edge, at[1] - radius, 2 * radius * k, 2 * radius);
    throughMatte(ctx, slice, inside);
  });
}
const shellModel: Shot = {
  duration: 6,
  draw(ctx, t) {
    const p = tween(t, 0.4, 3.5, 0, 1),
      spread = tween(t, 3.8, 6, 1, 1.43);
    const circle = (i: number): Point => {
      const a = (i * tau) / 12 - Math.PI / 2 + 0.08 * t;
      return [960 + 310 * spread * Math.cos(a), 530 + 310 * spread * Math.sin(a)];
    };
    body(ctx, 'sphere', [960, 530], 184, 'ink');
    label(ctx, 'Gravity', [960, 530], 56);
    reflow(
      catalogParticles.slice(0, 12),
      (i) => [180 + (i % 6) * 310, i < 6 ? 108 : 970],
      circle,
      p,
      (item, at) => particleIcon(ctx, item, at, 39, t),
    );
  },
};
const interior: Shot = {
  duration: 5,
  draw(ctx, t) {
    const at: Point = [960, 520];
    cutaway(
      ctx,
      at,
      334,
      tween(t, 0.6, 3.4, 0, 0.5),
      () => body(ctx, 'sphere', at, 334, 'twilight'),
      () => {
        body(ctx, 'sphere', at, 334, 'ink');
        body(ctx, 'sphere', at, 286, 'ember');
        body(ctx, 'sphere', at, 146, 'twilight');
        body(ctx, 'sphere', at, 76, 'ember');
      },
    );
    label(ctx, 'Interior layers', [960, 949], 44);
  },
};
const equationCard: Shot = {
  duration: 5,
  draw(ctx, t) {
    const paper = ctx.createLinearGradient(0, 0, 1920, 1080);
    paper.addColorStop(0, sky.blush);
    paper.addColorStop(0.6, '#ead4d5');
    paper.addColorStop(1, sky.lilac);
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, 1920, 1080);
    const disk = new Path2D();
    disk.ellipse(545, 535, 375, 375, 0, 0, tau);
    throughMatte(ctx, disk, () => {
      ctx.fillStyle = wash(ctx, 'twilight', 0, 1020, 700, -910);
      ctx.fillRect(0, 0, 1000, 1080);
      body(ctx, 'sphere', [545, 535], 225, 'ember');
    });
    layer(ctx, { x: 1300, y: 540 }, () => {
      ctx.fillStyle = wash(ctx, 'ink', -450, 150, 900, -400);
      ctx.fillRect(-450, -166, 900, 332);
      equation(ctx, [0, 0], [{ text: 'F' }, { text: '∝' }, { text: '1 / d²' }], t, 80);
    });
  },
};
export const diagramStudies = { 'shell-model': shellModel, interior, 'equation-card': equationCard };
