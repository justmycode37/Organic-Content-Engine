import { hash, type Ctx } from '../core.ts';
import { CELL } from '../pix.ts';
import { cam, envSize, envTheme, pixelLine, type EnvOptions } from './common.ts';

/** Steel vault chamber: paneled walls, rivets, floor seams, and a monumental pixel door. */
export function drawEnv(ctx: Ctx, options: EnvOptions) {
  const { w, h } = envSize(options), theme = envTheme(options), camera = cam(options, .18), seed = options.seed ?? 173;
  ctx.fillStyle = '#09090B'; ctx.fillRect(0, 0, w, h);
  const wallBottom = Math.round(h * .78 / CELL) * CELL;
  // Broad steel plates with recessed seams and corner rivets.
  ctx.fillStyle = '#19191D'; ctx.fillRect(0, 0, w, wallBottom);
  const panelW = CELL * 56, shift = Math.round(camera.x * .14 / CELL) * CELL;
  for (let i = -1; i < Math.ceil(w / panelW) + 2; i++) {
    const x = i * panelW - shift;
    ctx.fillStyle = '#2A2A2F'; ctx.fillRect(x + CELL * 2, CELL * 3, panelW - CELL * 4, wallBottom - CELL * 6);
    ctx.fillStyle = '#111114'; ctx.fillRect(x + CELL * 4, CELL * 5, panelW - CELL * 8, wallBottom - CELL * 10);
    ctx.fillStyle = '#202024'; ctx.fillRect(x + CELL * 6, CELL * 7, panelW - CELL * 12, wallBottom - CELL * 14);
    ctx.fillStyle = '#404046'; ctx.fillRect(x + CELL * 6, CELL * 7, panelW - CELL * 12, CELL * 2);
    for (const y of [CELL * 10, Math.round(wallBottom * .48 / CELL) * CELL, wallBottom - CELL * 12]) {
      ctx.fillStyle = '#0A0A0C'; ctx.fillRect(x + CELL * 8, y, panelW - CELL * 16, CELL * 2);
      ctx.fillStyle = '#3B3B41'; ctx.fillRect(x + CELL * 8, y + CELL * 2, panelW - CELL * 16, CELL);
    }
    for (const [bx, by] of [[CELL * 8, CELL * 9], [panelW - CELL * 12, CELL * 9], [CELL * 8, wallBottom - CELL * 13], [panelW - CELL * 12, wallBottom - CELL * 13]]) {
      ctx.fillStyle = theme.dim; ctx.fillRect(x + bx, by, CELL * 3, CELL * 3);
      ctx.fillStyle = '#101013'; ctx.fillRect(x + bx + CELL, by + CELL, CELL, CELL);
    }
  }
  const cx = Math.round((w * .5 - camera.x * .08) / CELL) * CELL;
  const cy = Math.round((h * .39 + camera.y * .12) / CELL) * CELL;
  const radiusX = Math.round(w * .34 / CELL) * CELL, radiusY = Math.round(h * .24 / CELL) * CELL;
  // Concentric hard pixel arcs: ring pixels sampled deterministically around the vault face.
  const drawRing = (rx: number, ry: number, color: string, thickness = CELL) => {
    const steps = Math.ceil(Math.PI * 2 * Math.max(rx, ry) / (CELL * 2));
    ctx.fillStyle = color;
    for (let i = 0; i < steps; i++) {
      const a = i * Math.PI * 2 / steps;
      const x = Math.round((cx + Math.cos(a) * rx) / CELL) * CELL;
      const y = Math.round((cy + Math.sin(a) * ry) / CELL) * CELL;
      ctx.fillRect(x, y, thickness, thickness);
    }
  };
  // Pixel-step the silhouette with a stack of horizontal bands.
  for (let yy = -radiusY; yy <= radiusY; yy += CELL) {
    const edge = Math.sqrt(Math.max(0, 1 - (yy * yy) / (radiusY * radiusY))) * radiusX;
    const left = Math.floor((cx - edge) / CELL) * CELL;
    const width = Math.ceil(edge * 2 / CELL) * CELL;
    ctx.fillStyle = '#0A0A0C'; ctx.fillRect(left, cy + yy, width, CELL);
  }
  drawRing(radiusX, radiusY, theme.fg, CELL * 2);
  drawRing(radiusX - CELL * 7, radiusY - CELL * 7, '#5C5C62', CELL * 2);
  drawRing(radiusX - CELL * 18, radiusY - CELL * 18, theme.line, CELL * 2);
  for (let spoke = 0; spoke < 8; spoke++) {
    const a = spoke * Math.PI / 4;
    const endX = cx + Math.cos(a) * (radiusX - CELL * 10), endY = cy + Math.sin(a) * (radiusY - CELL * 10);
    pixelLine(ctx, cx, cy, endX, endY, '#5B5B61', CELL * 2);
    const knobX = Math.round((cx + Math.cos(a) * radiusX * .58) / CELL) * CELL;
    const knobY = Math.round((cy + Math.sin(a) * radiusY * .58) / CELL) * CELL;
    ctx.fillStyle = theme.dim; ctx.fillRect(knobX - CELL * 2, knobY - CELL * 2, CELL * 4, CELL * 4);
    ctx.fillStyle = '#101013'; ctx.fillRect(knobX - CELL, knobY - CELL, CELL * 2, CELL * 2);
  }
  for (let i = 0; i < 32; i++) {
    const a = i * Math.PI * 2 / 32;
    const x = Math.round((cx + Math.cos(a) * (radiusX - CELL * 4)) / CELL) * CELL;
    const y = Math.round((cy + Math.sin(a) * (radiusY - CELL * 4)) / CELL) * CELL;
    ctx.fillStyle = hash(i, seed) > .5 ? theme.dim : theme.line;
    ctx.fillRect(x, y, CELL * 2, CELL * 2);
  }
  ctx.fillStyle = '#080809'; ctx.fillRect(0, wallBottom, w, h - wallBottom);
  ctx.fillStyle = theme.line; ctx.fillRect(0, wallBottom, w, CELL * 2);
  for (let y = wallBottom + CELL * 8; y < h; y += CELL * 9) {
    ctx.fillStyle = '#29292E'; ctx.fillRect(0, y, w, CELL);
  }
}
