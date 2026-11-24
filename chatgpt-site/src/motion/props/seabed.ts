import type { Ctx } from '../core.ts';
import { clamp, lerp } from '../kit/motion.ts';
import { Grid, PAL } from '../kit/pixel.ts';
import { ART, drawSprite, type DrawSpriteOptions } from '../kit/sprite.ts';

type Placement = DrawSpriteOptions & { x: number; y: number; t?: number };
const fish = new Grid(44, 27);
// A swimming puffer has a tapered tail, a blunt snout, and a spotted back.
fish.ellipse(24, 13, 16, 10, PAL.wood2)
  .ellipse(30, 13, 11, 9, PAL.wood2)
  .ellipse(24, 16, 15, 7, PAL.paperDark)
  .ellipse(26, 17, 13, 5, PAL.paper)
  .ellipse(29, 9, 10, 5, PAL.wood1);
for (const [x, y] of [[10, 12], [14, 8], [18, 11], [21, 6], [25, 9], [28, 5], [33, 7], [16, 15]]) {
  fish.rect(x, y, 2, 2, PAL.paperShade);
}
fish.ellipse(34, 11, 3.8, 4.1, PAL.ink)
  .ellipse(34, 11, 2.8, 3, PAL.gold1)
  .ellipse(35, 11, 1.6, 2.2, PAL.ink)
  .set(35, 9, PAL.white)
  .round(38, 15, 5, 3, 1, PAL.paperShade)
  .rect(39, 17, 3, 1, PAL.wood3)
  .outline();
const body = fish.sprite('seabed:puffer');
const tail = new Grid(13, 14)
  .poly([{x:1,y:1},{x:4,y:2},{x:12,y:5},{x:12,y:9},{x:2,y:13},{x:3,y:8}], PAL.wood1)
  .line({x:3,y:4},{x:10,y:7},1,PAL.wood3)
  .line({x:3,y:10},{x:10,y:8},1,PAL.wood3).outline().sprite('seabed:puffer-tail');
const fin = new Grid(13, 8).poly([{x:1,y:2},{x:12,y:1},{x:8,y:7},{x:4,y:6}], PAL.gold2)
  .line({x:4,y:3},{x:10,y:2},1,PAL.gold1).outline().sprite('seabed:puffer-fin');
export const PUFFER_SIZE = { w: body.w, h: body.h };

export function drawPufferfish(ctx: Ctx, o: Placement) {
  const flap = Math.sin((o.t ?? 0) * 14);
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.rotate(o.rot ?? 0);
  const s = o.scale ?? 1;
  ctx.scale((o.flip ? -s : s) * (o.sx ?? 1), s);
  ctx.globalAlpha *= o.alpha ?? 1;
  drawSprite(ctx, tail, -12 * ART, 0, { anchor: [1, .5], sx: .9 + .09 * flap, sy: .83 + .15 * flap });
  drawSprite(ctx, body, 0, 0);
  drawSprite(ctx, fin, ART * 4, ART * 2, { anchor: [.9, .25], rot: -.25 + .3 * flap, sy: .8 + .16 * flap });
  ctx.restore();
}

const bed = new Grid(102, 70, 51, 35);
// Disturbed sand feathers into its surroundings. The rays beyond the central
// depression must read as relief in the sea floor, rather than a solid disc.
for (let y = -34; y < 35; y++) for (let x = -50; x < 51; x++) {
  const radius = Math.hypot(x / 50, y / 34);
  const noise = Math.sin(x * 121.71 + y * 31.29) * 43758.5;
  const grain = noise - Math.floor(noise);
  if (grain < clamp((1 - radius) * 2.5)) bed.set(x, y, grain < .12 ? '#A3947A' : '#95856C');
}
bed.ellipse(0, 0, 13, 8, '#86765D').ellipse(0, 1, 12, 7, PAL.paperDark);
for (let i = 0; i < 30; i++) {
  const a = i * 2.4, r = Math.sqrt(i / 30);
  bed.rect(Math.cos(a) * r * 11, 1 + Math.sin(a) * r * 6, 2, 1, i % 2 ? '#AE997B' : PAL.paperShade);
}
const sand = bed.sprite('seabed:nest-floor');
export const NEST_SIZE = { w: sand.w, h: sand.h };

// Art-cell coordinates relative to the nest centre. Both the furrow and the
// fish use this same path so that fresh sand appears only where the fins pass.
const furrowTwist = (radius: number) => -.8 + .07 * Math.sin(radius * Math.PI);
function furrowPoint(index: number, ridges: number, radius: number) {
  const a = Math.PI * 2 * index / ridges + furrowTwist(radius);
  return { x: lerp(14, 46, radius) * Math.cos(a), y: lerp(9, 30, radius) * Math.sin(a) };
}

interface FurrowCell { x: number; y: number; radius: number; color: string }
const layouts = new Map<number, FurrowCell[][]>();
function furrowLayout(ridges: number) {
  const cached = layouts.get(ridges);
  if (cached) return cached;
  const layout = Array.from({ length: ridges }, () => [] as FurrowCell[]);
  for (let y = -30; y <= 30; y++) for (let x = -46; x <= 46; x++) {
    const depth = (Math.hypot(x, y * 46 / 30) - 14) / 32;
    if (depth < 0 || depth > 1) continue;
    const angle = Math.atan2(y * 46 / 30, x);
    const phase = (angle - furrowTwist(depth)) / (2 * Math.PI) * ridges;
    const nearest = Math.round(phase), offset = phase - nearest;
    // Raised banks widen toward the outer tips. Alternating sunlit and
    // shaded faces give each ridge two slopes around a narrower crest.
    const width = .34 - .10 * depth ** 4;
    if (Math.abs(offset) > width) continue;
    const side = offset / width * (Math.sin(angle + .8) < 0 ? -1 : 1);
    const color = side < -.74 ? '#8C7457' : side < -.25 ? '#AE9472'
      : side < .04 ? PAL.paperShade : side < .50 ? '#CFB89A' : '#B6A082';
    layout[(nearest + ridges) % ridges]!.push({ x, y, radius: depth, color });
  }
  layouts.set(ridges, layout);
  return layout;
}

export function nestBuilderPosition(work: number, ridges: number) {
  const index = Math.min(ridges - 1, Math.floor(work)), fraction = work - index;
  // Alternate inward/outward passes, swimming across the rim or centre to
  // reach the next bay instead of teleporting there between cuts.
  const pass = clamp(fraction / .78), r = index % 2 ? 1 - pass : pass;
  const current = furrowPoint(index, ridges, r);
  if (fraction <= .78 || index === ridges - 1) return current;
  const next = furrowPoint(index + 1, ridges, r), cross = (fraction - .78) / .22;
  return { x: lerp(current.x, next.x, cross), y: lerp(current.y, next.y, cross) };
}

export function drawSandNest(ctx: Ctx, o: Placement & { ridges?: number; work?: number }) {
  const ridges = Math.round(clamp(o.ridges ?? 12, 8, 20)), work = clamp(o.work ?? ridges, 0, ridges);
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.rotate(o.rot ?? 0);
  ctx.scale(o.scale ?? 1, o.scale ?? 1);
  ctx.globalAlpha *= o.alpha ?? 1;
  drawSprite(ctx, sand, 0, 0);
  ctx.scale(ART, ART);
  const layout = furrowLayout(ridges);
  for (let i = 0; i < Math.ceil(work); i++) {
    const pass = clamp((work - i) / .78);
    const first = i % 2 ? 1 - pass : 0, last = i % 2 ? 1 : pass;
    for (const cell of layout[i]!) if (cell.radius >= first && cell.radius <= last) {
      ctx.fillStyle = cell.color;
      ctx.fillRect(cell.x, cell.y, 1, 1);
    }
  }
  ctx.restore();
}
