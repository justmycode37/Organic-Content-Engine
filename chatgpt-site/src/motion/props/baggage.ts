import type { Ctx } from '../core.ts';
import { clamp } from '../kit/motion.ts';
import { Grid, PAL } from '../kit/pixel.ts';
import { ART, drawSprite, type DrawSpriteOptions } from '../kit/sprite.ts';

type Placement = DrawSpriteOptions & { x: number; y: number };
const halfStraight = 21, radius = 19, projection = .57, beltHalfWidth = 9;
const straight = halfStraight * 2, turn = Math.PI * radius;
export const CAROUSEL_LENGTH = 2 * (straight + turn);

// Constant distance on a stadium-shaped belt, projected onto the terminal
// floor. A slat's two ends and a bag at its centre share the same belt phase.
export function carouselPoint(distance: number, offset = 0) {
  const d = ((distance % CAROUSEL_LENGTH) + CAROUSEL_LENGTH) % CAROUSEL_LENGTH, r = radius + offset;
  if (d < straight) return { x: -halfStraight + d, y: r * projection };
  if (d < straight + turn) {
    const a = (d - straight) / radius;
    return { x: halfStraight + r * Math.sin(a), y: r * Math.cos(a) * projection };
  }
  if (d < 2 * straight + turn) return { x: halfStraight - (d - straight - turn), y: -r * projection };
  const a = (d - 2 * straight - turn) / radius;
  return { x: -halfStraight - r * Math.sin(a), y: -r * Math.cos(a) * projection };
}
const base = new Grid(102, 50, 51, 22);
function stadium(x: number, y: number) { return Math.hypot(Math.max(0, Math.abs(x) - halfStraight), y / projection); }
for (const x of [-33, -17, 17, 33]) {
  base.rect(x - 2, 7, 5, 18, PAL.grey5).rect(x - 2, 8, 2, 15, PAL.grey3);
  base.rect(x - 3, 24, 7, 2, PAL.ink);
}
base.fill((x,y) => stadium(x, y - 5) <= radius + beltHalfWidth + 1, PAL.ink)
  .fill((x,y) => stadium(x, y - 4) <= radius + beltHalfWidth, PAL.grey4)
  .fill((x,y) => stadium(x, y - 1) <= radius + beltHalfWidth + 1, PAL.grey2)
  .fill((x,y) => stadium(x, y) <= radius + beltHalfWidth, PAL.grey5)
  .fill((x,y) => stadium(x, y) <= radius - beltHalfWidth, PAL.ink)
  .fill((x,y) => stadium(x, y - .5) <= radius - beltHalfWidth - 2, PAL.grey3)
  .fill((x,y) => stadium(x, y - .5) <= radius - beltHalfWidth - 4, PAL.grey2);
for (const x of [-33, -16, 0, 16, 33]) base.rect(x, 18, 2, 1, PAL.grey2);
const belt = base.sprite('airport:carousel');
export const CONVEYOR_SIZE = { w: belt.w, h: belt.h };
const counterGrid = new Grid(100, 32);
counterGrid.round(2, 8, 96, 23, 2, PAL.ink).rect(4, 10, 92, 19, PAL.wood3);
for (const x of [8, 38, 68]) {
  counterGrid.rect(x, 13, 24, 12, PAL.wood2).rect(x + 1, 14, 22, 1, PAL.wood1);
}
counterGrid.poly([{x:7,y:1},{x:93,y:1},{x:99,y:9},{x:1,y:9}], PAL.paperDark)
  .rect(1, 9, 98, 3, PAL.wood1).outline();
const counter = counterGrid.sprite('baggage:inspection-counter');
export function drawInspectionCounter(ctx: Ctx, x: number, y: number) {
  drawSprite(ctx, counter, x, y, { anchor: [.5, .2] });
}

export function drawConveyor(ctx: Ctx, o: Placement & { distance?: number }) {
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.rotate(o.rot ?? 0);
  ctx.scale(o.scale ?? 1, o.scale ?? 1);
  ctx.globalAlpha *= o.alpha ?? 1;
  // Centre the full prop (including its feet) around the item coordinates.
  drawSprite(ctx, belt, 0, 0);
  ctx.scale(ART, ART);
  ctx.translate(0, -3);
  const slats = 44;
  const step = CAROUSEL_LENGTH / slats;
  for (let i = 0; i < slats; i++) {
    const d = (o.distance ?? 0) + i * step;
    const a = carouselPoint(d, -beltHalfWidth + 1), b = carouselPoint(d, beltHalfWidth - 1);
    const n = Math.ceil(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)));
    ctx.fillStyle = PAL.grey4;
    for (let j = 0; j <= n; j++) ctx.fillRect(Math.round(a.x + (b.x - a.x) * j / n), Math.round(a.y + (b.y - a.y) * j / n), 1, 1);
  }
  ctx.restore();
}

const tray = new Grid(48, 29);
for (const y of [5, 17]) tray.round(0, y, 4, 5, 1, PAL.ink).rect(0, y + 1, 1, 3, PAL.grey3);
tray.round(1, 4, 46, 20, 4, PAL.ink).round(2, 5, 44, 18, 3, PAL.blue3)
  .round(2, 2, 44, 18, 3, PAL.blue1).round(3, 2, 42, 16, 3, PAL.ink)
  .round(5, 4, 38, 12, 2, PAL.paperDark).round(6, 5, 36, 10, 2, PAL.paperShade)
  .rect(5, 18, 38, 2, PAL.grey5);
tray.round(16, 18, 16, 7, 2, PAL.ink).round(18, 19, 12, 3, 1, PAL.blue3)
  .rect(5, 20, 2, 2, PAL.paperDark).rect(40, 20, 2, 2, PAL.paperDark);
const bottom = tray.sprite('airport:suitcase-tray');
const handle = new Grid(21, 9).round(1, 1, 19, 10, 4, PAL.ink)
  .round(4, 4, 13, 7, 2, undefined).rect(5, 1, 11, 1, PAL.grey3).sprite('airport:case-handle');
const luggageTag = new Grid(9, 14).line({x:2,y:1},{x:4,y:6},1.3,PAL.ink)
  .poly([{x:1,y:6},{x:3,y:3},{x:6,y:4},{x:8,y:11},{x:3,y:13}],PAL.paper)
  .rect(3, 7, 3, 1, PAL.grey5).rect(4, 9, 2, 1, PAL.grey4).outline().sprite('airport:luggage-tag');
const shell = new Grid(48, 23);
shell.round(1, 0, 46, 22, 4, PAL.ink).round(2, 1, 44, 20, 3, PAL.blue3)
  .round(3, 1, 42, 17, 3, PAL.blue2);
for (const x of [6, 12, 18, 24, 30, 36]) {
  shell.round(x, 3, 3, 12, 1, PAL.blue3).rect(x, 3, 1, 10, PAL.blue1);
}
shell.rect(35, 1, 5, 19, PAL.gold3).rect(35, 2, 4, 15, PAL.gold2);
const lid = shell.sprite('airport:suitcase-shell');
const liningGrid = new Grid(48, 23);
liningGrid.round(1, 0, 46, 22, 4, PAL.ink).round(2, 1, 44, 20, 3, PAL.blue2)
  .round(4, 2, 40, 18, 2, PAL.paperDark).round(6, 4, 36, 14, 2, PAL.paperShade)
  .round(8, 6, 32, 10, 2, PAL.paperDark).rect(9, 6, 30, 1, PAL.grey4)
  .rect(12, 7, 2, 2, PAL.grey2);
const lining = liningGrid.sprite('airport:suitcase-lining');
export const SUITCASE_SIZE = { w: bottom.w, h: 32 * ART };

export function drawSuitcase(ctx: Ctx, o: Placement & { open?: number }, contents?: () => void) {
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.rotate(o.rot ?? 0);
  ctx.scale(o.scale ?? 1, o.scale ?? 1);
  ctx.globalAlpha *= o.alpha ?? 1;
  drawSprite(ctx, handle, -2 * ART, -15 * ART);
  drawSprite(ctx, bottom, 0, 0);
  const angle = clamp(o.open ?? 0) * Math.PI * .64;
  // The projecting edge travels back THROUGH the hinge. As its projected
  // height changes sign, the viewer sees the lining on the inside of the lid.
  const projected = .9 * Math.cos(angle) - 1.32 * Math.sin(angle);
  const hingeY = -12 * ART;
  if (projected > 0) {
    contents?.();
    drawSprite(ctx, lid, 0, hingeY, { anchor: [.5, 0], sy: projected });
  } else {
    drawSprite(ctx, lining, 0, hingeY, { anchor: [.5, 1], sy: -projected });
    contents?.();
  }
  drawSprite(ctx, luggageTag, 17 * ART, 3 * ART, { anchor: [.25, .1], scale: .8 });
  ctx.restore();
}
