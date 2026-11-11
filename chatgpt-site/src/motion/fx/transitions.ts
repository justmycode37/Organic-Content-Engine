import { clamp, hash, type Ctx, type Theme, type TransitionName } from '../core.ts';

/** The cover plus reveal stays within a 0.30 second beat. */
export const TRANSITION_OUT = 0.15;
export const TRANSITION_IN = 0.15;

/** Draw a deterministic full-frame transition overlay around a cut. */
export function drawTransition(ctx: Ctx, name: TransitionName, phase: number, theme: Theme, seed: number) {
  if (name === 'cut' || !Number.isFinite(phase)) return;
  const cover = phase <= 0;
  const progress = cover ? clamp(phase + 1) : clamp(phase);
  ctx.save();

  if (phase === 0) {
    ctx.fillStyle = name === 'flash' ? theme.fg : theme.bg;
    ctx.fillRect(0, 0, 1080, 1920);
    ctx.restore();
    return;
  }

  if (name === 'blocks') {
    const size = 120;
    const cols = Math.ceil(1080 / size), rows = Math.ceil(1920 / size);
    const cells = Array.from({ length: cols * rows }, (_, index) => index);
    cells.sort((a, b) => {
      const ax = a % cols, ay = Math.floor(a / cols);
      const bx = b % cols, by = Math.floor(b / cols);
      return (ax + ay + hash(a, seed) * 0.7) - (bx + by + hash(b, seed) * 0.7);
    });
    const covered = cover ? progress : 1 - progress;
    const count = Math.floor(covered * cells.length);
    ctx.fillStyle = theme.panelAlt;
    for (let index = 0; index < count; index++) {
      const cell = cells[cover ? index : cells.length - 1 - index]!;
      ctx.fillRect((cell % cols) * size, Math.floor(cell / cols) * size, size + 1, size + 1);
    }
    if (count > 0 && count < cells.length) {
      const cell = cells[cover ? count - 1 : cells.length - count]!;
      const x = (cell % cols) * size, y = Math.floor(cell / cols) * size;
      ctx.fillStyle = theme.accent;
      ctx.fillRect(cover ? x + size - 6 : x, y, 6, size);
    }
  } else if (name === 'wipe') {
    const step = 48, skew = 0.35;
    const edgeProgress = progress;
    ctx.fillStyle = theme.panelAlt;
    for (let y = 0; y < 1920; y += step) {
      const edge = edgeProgress * (1080 + 1920 * skew) - y * skew;
      const width = clamp(edge / 1080, 0, 1) * 1080;
      if (cover) ctx.fillRect(0, y, width, step + 1);
      else ctx.fillRect(width, y, 1080 - width, step + 1);
    }
    const edgeAt = (y: number) => edgeProgress * (1080 + 1920 * skew) - y * skew;
    ctx.beginPath();
    ctx.moveTo(edgeAt(0), 0);
    ctx.lineTo(edgeAt(1920), 1920);
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 6;
    ctx.stroke();
  } else if (name === 'glitch') {
    const slice = 192, rows = Math.ceil(1920 / slice);
    const covered = cover ? progress : 1 - progress;
    ctx.fillStyle = theme.panelAlt;
    for (let row = 0; row < rows; row++) {
      const stagger = hash(row, seed) * 0.12;
      const local = clamp((covered - stagger) / (1 - stagger));
      const width = local * 1080;
      const offset = Math.round((hash(row, seed + 1) - 0.5) * 72 * (1 - local));
      const fromLeft = row % 2 === 0;
      const x = fromLeft ? -offset : 1080 - width + offset;
      ctx.fillRect(x, row * slice, width + 1, slice + 1);
      if (row % 3 === 0 && width > 0 && width < 1080) {
        ctx.fillStyle = theme.accent;
        ctx.fillRect(fromLeft ? x + width - 6 : x, row * slice, 6, slice);
        ctx.fillStyle = theme.panelAlt;
      }
    }
  } else if (name === 'zoom') {
    const radius = cover ? (1 - progress) * 1200 : progress * 1200;
    ctx.fillStyle = theme.panelAlt;
    ctx.beginPath();
    ctx.rect(0, 0, 1080, 1920);
    ctx.rect(540 - radius, 960 - radius, radius * 2, radius * 2);
    ctx.fill('evenodd');
    if (radius > 10) {
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 6;
      ctx.strokeRect(540 - radius, 960 - radius, radius * 2, radius * 2);
    }
  } else if (name === 'flash') {
    const covered = cover ? progress : 1 - progress;
    const width = 1080 * covered, height = 1920 * covered;
    const x = (1080 - width) / 2, y = (1920 - height) / 2;
    ctx.fillStyle = theme.fg;
    ctx.fillRect(x, y, width, height);
    if (width > 20 && height > 20 && covered < 0.999) {
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 6;
      ctx.strokeRect(x, y, width, height);
    }
  } else if (name === 'shutter') {
    const opening = cover ? 1 - progress : progress;
    const gapHeight = 1920 * opening;
    const gapTop = (1920 - gapHeight) / 2;
    ctx.fillStyle = theme.panelAlt;
    ctx.fillRect(0, 0, 1080, gapTop);
    ctx.fillRect(0, gapTop + gapHeight, 1080, 1920 - gapTop - gapHeight);
    if (opening > 0 && opening < 1) {
      ctx.fillStyle = theme.accent;
      ctx.fillRect(0, Math.round(gapTop - 4), 1080, 8);
      ctx.fillRect(0, Math.round(gapTop + gapHeight - 4), 1080, 8);
    }
  }
  ctx.restore();
}
