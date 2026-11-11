import { clamp, hash, type Ctx, type Theme, type TransitionName } from '../core.ts';

export const TRANSITION_OUT = 0.13;
export const TRANSITION_IN = 0.13;
const W = 1080, H = 1920, CELL = 20;

/** Fine-pixel covers. phase runs -1..0 for outgoing and 0..1 for incoming. */
export function drawTransition(ctx: Ctx, name: TransitionName, phase: number, theme: Theme, seed: number) {
  if (!Number.isFinite(phase) || name === 'cut') return;
  const cover = phase <= 0 ? clamp(phase + 1) : clamp(1 - phase);
  if (cover <= 0) return;
  ctx.save();
  const bg = name === 'flash' ? theme.fg : theme.panelAlt;
  const cols = Math.ceil(W / CELL), rows = Math.ceil(H / CELL);
  const fillPixel = (x: number, y: number, w = CELL, h = CELL) => ctx.fillRect(x, y, w + 1, h + 1);
  if (name === 'shutter') {
    const open = 1 - cover;
    const gap = Math.floor(H * open / CELL) * CELL;
    const top = Math.floor((H - gap) / 2 / CELL) * CELL;
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, top); ctx.fillRect(0, top + gap, W, H - top - gap);
    for (let x = 0; x < W; x += CELL) {
      ctx.fillStyle = bg; ctx.fillRect(x, Math.max(0, top - CELL), CELL, CELL);
      ctx.fillRect(x, Math.min(H - CELL, top + gap), CELL, CELL);
    }
    if (open > 0 && open < 1) { ctx.globalAlpha = .78; ctx.fillStyle = theme.accent; ctx.fillRect(0, top - 2, W, 4); ctx.fillRect(0, top + gap - 2, W, 4); }
  } else if (name === 'wipe') {
    const edge = cover * (W + H * .32);
    ctx.fillStyle = bg;
    for (let y = 0; y < H; y += CELL) {
      const xedge = edge - y * .32;
      const n = Math.ceil(clamp(xedge / CELL, 0, cols));
      for (let x = 0; x < n; x++) fillPixel(x * CELL, y);
    }
    ctx.globalAlpha = .9; ctx.fillStyle = theme.accent;
    for (let y = 0; y < H; y += CELL) { const x = Math.floor((edge - y * .32) / CELL) * CELL; if (x >= 0 && x < W) fillPixel(x, y); }
  } else if (name === 'glitch') {
    const bandH = CELL * 3;
    for (let y = 0; y < H; y += bandH) {
      const row = Math.floor(y / bandH), local = clamp((cover - hash(row, seed) * .13) / .87);
      const width = Math.floor(local * cols) * CELL;
      const shift = Math.round((hash(row, seed + 9) - .5) * 9 * CELL * (1 - local));
      ctx.fillStyle = bg;
      ctx.fillRect(row % 2 ? W - width + shift : -shift, y, width + CELL, bandH);
      if (width > 0 && width < W) { ctx.globalAlpha = .88; ctx.fillStyle = theme.accent; ctx.fillRect(row % 2 ? W - width + shift : width - shift, y, CELL, bandH); ctx.globalAlpha = 1; }
    }
  } else {
    // Ranked cell mosaic, diagonal except for stepped zoom rings and the crisp flash.
    const order = (x: number, y: number) => {
      const n = hash(x * 31 + y * 997, seed);
      if (name === 'zoom') { const d = Math.hypot((x + .5 - cols / 2) / cols, (y + .5 - rows / 2) / rows); return 1 - d + n * .07; }
      if (name === 'flash') return 1 - Math.max(Math.abs((x + .5) / cols - .5), Math.abs((y + .5) / rows - .5)) * 1.7 + n * .05;
      return (x / cols + y / rows) * .5 + n * .09;
    };
    const threshold = name === 'flash' ? cover : cover * 1.1;
    ctx.fillStyle = bg;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (order(x, y) < threshold) fillPixel(x * CELL, y * CELL);
    if (name !== 'flash' && cover > .02 && cover < .98) {
      ctx.globalAlpha = .82; ctx.fillStyle = theme.accent;
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { const o = order(x, y); if (Math.abs(o - threshold) < .035) fillPixel(x * CELL, y * CELL); }
    }
  }
  ctx.restore();
}
