import type { Ctx } from '../core.ts';
import { Grid, PAL } from '../kit/pixel.ts';
import { ART, drawSprite, spriteFromRows, type DrawSpriteOptions } from '../kit/sprite.ts';

const tau = Math.PI * 2;
const radiusX = 45, radiusY = 33;
const road = new Grid(106, 82, 53, 41);
road.ellipse(0, 1, radiusX + 7, radiusY + 7, PAL.ink)
  .ellipse(0, 0, radiusX + 7, radiusY + 7, PAL.grey3)
  .ellipse(0, 0, radiusX + 5, radiusY + 5, PAL.grey5)
  .ellipse(0, 0, radiusX - 5, radiusY - 5, PAL.paperDark)
  .ellipse(0, 0, radiusX - 6, radiusY - 6, PAL.green4);
for (let i = 0; i < 36; i++) {
  const a = i * tau / 36;
  // Short edge markings leave a single unbroken lane for the experiment.
  road.line({ x: (radiusX + 5) * Math.cos(a), y: (radiusY + 5) * Math.sin(a) },
    { x: (radiusX + 5) * Math.cos(a + .085), y: (radiusY + 5) * Math.sin(a + .085) }, 1.4, PAL.paper);
}
for (let i = 0; i < 45; i++) {
  const x = (i * 17) % 77 - 38, y = (i * 13) % 51 - 25;
  if (road.get(x, y) === PAL.green4) road.rect(x, y, 2, 1, PAL.green3, [PAL.green4]);
}
const ring = road.sprite('test-track:ring');
export const RING_SIZE = { w: ring.w, h: ring.h };

export function drawRingRoad(ctx: Ctx, o: DrawSpriteOptions & { x: number; y: number }) {
  drawSprite(ctx, ring, o.x, o.y, o);
}

export function circuitPosition(angle: number) {
  return { x: ART * radiusX * Math.cos(angle), y: ART * radiusY * Math.sin(angle),
    heading: Math.atan2(radiusY * Math.cos(angle), -radiusX * Math.sin(angle)) };
}

// The nose points right. The two separated tail lights make a braking driver
// identifiable at any rotation, including when the car turns away from us.
const carRows = [
  '...KKK......KKK....',
  '..KSSSSSSSSSSSSSK..',
  '.LccWcccccWcccccHL.',
  '.LccDWWccDDWccccHL.',
  '.KccDwwccDwwccccSK.',
  '.KccDwwccDwwccccSK.',
  '.LccDWWccDDWccccHL.',
  '.LccWcccccWcccccHL.',
  '..KSSSSSSSSSSSSSK..',
  '...KKK......KKK....',
];
const paint = [[PAL.gold2, PAL.gold3], [PAL.blue2, PAL.blue3], [PAL.paper, PAL.paperDark],
  [PAL.green2, PAL.green3], [PAL.orange1, PAL.orange3]] as const;
const cars = paint.map(([base, shade], i) => spriteFromRows(`test-track:car:${i}`, carRows,
  { K: PAL.ink, S: shade, c: base, W: PAL.blue1, D: PAL.grey5, w: PAL.blue4, H: PAL.white, L: PAL.red3 }));
const lamps = spriteFromRows('test-track:braking', [
  '.rrr......', '..rRR.....', '...RRRWW..', '....RRWW..', '..........', '..........',
  '....RRWW..', '...RRRWW..', '..rRR.....', '.rrr......',
], { r: PAL.red3, R: PAL.red2, W: PAL.pink1 });

export function drawCircuitCar(ctx: Ctx, x: number, y: number, heading: number, scale: number, index: number, braking: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading);
  ctx.scale(scale, scale);
  drawSprite(ctx, cars[index % cars.length]!, 0, 0);
  if (braking > 0) drawSprite(ctx, lamps, -9 * ART, 0, { alpha: braking });
  ctx.restore();
}
