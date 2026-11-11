// Shared hero prop for the "ticket" story world: one concert ticket used by every shot,
// so it looks identical from shot to shot. 3D (mesh) and flat 2D (drawTicket2D) forms.
import { box, merge, place, type Material, type Mesh } from '../three.ts';
import type { Ctx } from '../core.ts';

/** Material slots: 0 paper body, 1 printed band (ink), 2 stub, 3 perforation dots (dark), 4 star / mark (white, slight glow). */
export const TICKET_MATERIALS: Material[] = [
  { ramp: 'mono', tone: 0.97 },
  { ramp: 'ink', tone: 0.35 },
  { ramp: 'mono', tone: 0.8 },
  { ramp: 'ink', tone: 0.1 },
  { ramp: 'mono', tone: 1, emissive: 0.35 },
];

/** Ticket centred on the origin, 2.4 wide x 1.0 tall x 0.05 thick (world units), stub on the right third. */
export function ticketMesh(opts: { stubOffset?: number } = {}): Mesh {
  const stub = opts.stubOffset ?? 0, parts: Mesh[] = [];
  parts.push(place(box(1.62, 1, 0.05, 0), { pos: [-0.39, 0, 0] }));
  // Printed band and a star mark across the main body (front and back).
  parts.push(place(box(1.4, 0.22, 0.056, 1), { pos: [-0.42, 0.18, 0] }));
  parts.push(place(box(0.9, 0.06, 0.056, 1), { pos: [-0.67, -0.2, 0] }));
  parts.push(place(box(0.6, 0.06, 0.056, 1), { pos: [-0.82, -0.32, 0] }));
  parts.push(place(box(0.16, 0.16, 0.058, 4), { pos: [0.18, -0.26, 0], rot: [0, 0, Math.PI / 4] }));
  // Stub with "ADMIT ONE" bars.
  const s: Mesh[] = [place(box(0.7, 1, 0.05, 2), { pos: [0.78, 0, 0] }), place(box(0.08, 0.7, 0.056, 1), { pos: [0.95, 0, 0] }), place(box(0.05, 0.5, 0.056, 1), { pos: [0.75, 0, 0] })];
  parts.push(place(merge(...s), { pos: [stub, 0, 0] }));
  // Perforation line between body and stub.
  for (let i = 0; i < 9; i++) parts.push(place(box(0.035, 0.05, 0.06, 3), { pos: [0.425, -0.42 + i * 0.105, 0] }));
  return merge(...parts);
}

/**
 * Flat pixel ticket for 2D layers (foreground rushes, hand-offs). x/y = centre, w = width in px.
 * `rot` radians, `tear` 0..1 separates the stub, `label` small pixel word on the band (optional, drawn by caller if needed).
 */
export function drawTicket2D(ctx: Ctx, x: number, y: number, w: number, opts: { rot?: number; tear?: number; dark?: boolean } = {}) {
  const h = Math.round(w / 2.4), px = Math.max(2, Math.round(w / 96));
  const snap = (v: number) => Math.round(v / px) * px;
  ctx.save(); ctx.translate(snap(x), snap(y)); ctx.rotate(opts.rot ?? 0);
  const body = snap(w * 0.675), stubW = snap(w - body), left = snap(-w / 2), top = snap(-h / 2), tear = (opts.tear ?? 0) * w * 0.12;
  const paper = opts.dark ? '#B4B4B4' : '#EDEDED', shade = opts.dark ? '#858585' : '#C4C4C4', ink = '#121315', outline = '#060708';
  const notch = (cx: number, cy: number) => { ctx.fillStyle = outline; ctx.fillRect(snap(cx - px * 3), snap(cy - px * 3), px * 6, px * 6); };
  ctx.fillStyle = outline; ctx.fillRect(left - px, top - px, body + px * 2, h + px * 2); ctx.fillRect(left + body + tear - px, top - px, stubW + px * 2, h + px * 2);
  ctx.fillStyle = paper; ctx.fillRect(left, top, body, h);
  ctx.fillStyle = shade; ctx.fillRect(left + body + tear, top, stubW, h); ctx.fillRect(left, top + h - px * 2, body, px * 2);
  ctx.fillStyle = ink; ctx.fillRect(left + px * 4, top + snap(h * 0.18), body - px * 8, snap(h * 0.22));
  ctx.fillRect(left + px * 4, top + snap(h * 0.56), snap(body * 0.55), px * 2); ctx.fillRect(left + px * 4, top + snap(h * 0.7), snap(body * 0.38), px * 2);
  ctx.fillRect(left + body + tear + snap(stubW * 0.55), top + snap(h * 0.15), px * 3, snap(h * 0.7));
  ctx.fillStyle = paper; for (let i = 0; i < 5; i++) ctx.fillRect(left + px * 6 + i * px * 8, top + snap(h * 0.24), px * 4, px * 3);
  ctx.fillStyle = outline; for (let yy = top + px * 2; yy < top + h - px * 2; yy += px * 4) ctx.fillRect(left + body - px, yy, px * 2, px * 2);
  notch(left + body, top); notch(left + body, top + h);
  ctx.restore();
}
