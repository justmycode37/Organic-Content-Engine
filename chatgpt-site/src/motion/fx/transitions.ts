import { clamp, ease, FPS, hash, SAFE, type Ctx, type ObjectRect, type Theme, type TransitionContext, type TransitionName } from '../core.ts';

/** Legacy transitions keep their existing 0.30 second cover/reveal. */
export const TRANSITION_OUT = 0.15;
export const TRANSITION_IN = 0.15;
/** New transitions use a 0.20 second total beat, within the v2 0.10–0.25 s range. */
export const FAST_TRANSITION_OUT = 0.10;
export const FAST_TRANSITION_IN = 0.10;
const FAST_TRANSITIONS = new Set<TransitionName>(['whip', 'push', 'morph', 'slide']);

export const transitionOut = (name: TransitionName) => FAST_TRANSITIONS.has(name) ? FAST_TRANSITION_OUT : TRANSITION_OUT;
export const transitionIn = (name: TransitionName) => FAST_TRANSITIONS.has(name) ? FAST_TRANSITION_IN : TRANSITION_IN;

const centerRect = (): ObjectRect => ({ x: SAFE.cx - 72, y: SAFE.y + 500 - 72, w: 144, h: 144 });
const mixRect = (a: ObjectRect, b: ObjectRect, p: number): ObjectRect => ({
  x: a.x + (b.x - a.x) * p,
  y: a.y + (b.y - a.y) * p,
  w: a.w + (b.w - a.w) * p,
  h: a.h + (b.h - a.h) * p,
});
const rectCenter = (rect: ObjectRect) => ({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 });
// Player phases are -1..0 before the cut and 0..1 after it. Map both halves to one continuous 0..1 beat.
const transitionProgress = (phase: number) => phase < 0 ? clamp(phase + 1) * 0.5 : 0.5 + clamp(phase) * 0.5;
const side = (context: TransitionContext | undefined, seed: number): 'left' | 'right' => {
  if (context?.direction === 'left' || context?.direction === 'right') return context.direction;
  return hash(seed, 3) < 0.5 ? 'left' : 'right';
};

/** Directional whip-pan with flat streaks and a two-to-four-frame destination settle. */
export function drawWhipTransition(ctx: Ctx, phase: number, theme: Theme, seed: number, context?: TransitionContext) {
  const incoming = phase >= 0;
  const p = transitionProgress(phase);
  const cover = incoming ? (1 - p) * 2 : p * 2;
  const direction = side(context, seed);
  const sign = direction === 'left' ? -1 : 1;
  ctx.save();
  ctx.globalAlpha *= cover * 0.64;
  ctx.fillStyle = theme.panelAlt;
  ctx.fillRect(0, 0, 1080, 1920);
  ctx.globalAlpha = Math.min(1, 0.9 * (incoming ? 1 - p : p));
  for (let index = 0; index < 12; index++) {
    const travel = p;
    const width = 180 + hash(index, seed) * 560;
    const x = sign < 0 ? 1280 - travel * 1760 + hash(index, seed + 2) * 240 : -width - 280 + travel * 1760 + hash(index, seed + 2) * 240;
    const y = 320 + index * 102 + hash(index, seed + 1) * 44;
    ctx.fillStyle = index % 4 === 0 ? theme.accent : index % 2 ? theme.fg : theme.line;
    ctx.fillRect(x, y, width, index % 3 === 0 ? 8 : 4);
  }
  if (incoming) {
    const target = context?.incoming?.rect ?? centerRect();
    const settleFrames = 2 + Math.floor(hash(seed, 11) * 3);
    const settle = clamp((phase * FPS) / settleFrames);
    const center = rectCenter(target);
    const offset = sign * (1 - settle) * 24;
    ctx.globalAlpha = (1 - settle) * 0.85;
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 6;
    ctx.strokeRect(target.x + offset, target.y, target.w, target.h);
    ctx.beginPath();
    ctx.moveTo(center.x + offset - sign * 54, center.y);
    ctx.lineTo(center.x + offset + sign * 54, center.y);
    ctx.stroke();
  }
  ctx.restore();
}

/** The player scales scene content around its tracked object; the shared push draws no frame or overlay. */
export function drawPushTransition(_ctx: Ctx, _phase: number, _theme: Theme, _seed: number, _context?: TransitionContext) {}

/** Match-cut marker that morphs the outgoing target bounds into the incoming target bounds. */
export function drawMorphTransition(ctx: Ctx, phase: number, theme: Theme, _seed: number, context?: TransitionContext) {
  const p = transitionProgress(phase);
  const from = context?.outgoing?.rect ?? centerRect();
  const to = context?.incoming?.rect ?? from;
  const rect = mixRect(from, to, ease.inOutCubic(p));
  const opacity = Math.sin(Math.PI * p) * 0.84;
  ctx.save();
  ctx.globalAlpha *= opacity;
  ctx.fillStyle = theme.panelAlt;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 8;
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
}

/** Fast grid-panel slide, with staggered rows and a single accent edge. */
export function drawSlideTransition(ctx: Ctx, phase: number, theme: Theme, seed: number, context?: TransitionContext) {
  const p = transitionProgress(phase);
  const coverage = phase >= 0 ? (1 - p) * 2 : p * 2;
  const direction = side(context, seed);
  const cols = 5, rows = 6, cellW = 1080 / cols, cellH = 1920 / rows;
  ctx.save();
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const cell = row * cols + col;
    const delay = 0.12 * (hash(cell, seed) * 0.8 + ((row + col) % 3) * 0.06);
    const amount = clamp((coverage - delay) / (1 - delay));
    if (amount <= 0) continue;
    const width = cellW * amount;
    const x = (col + row) % 2 === 0
      ? (direction === 'left' ? col * cellW : (col + 1) * cellW - width)
      : (direction === 'left' ? (col + 1) * cellW - width : col * cellW);
    ctx.fillStyle = theme.panelAlt;
    ctx.fillRect(x, row * cellH, width + 1, cellH + 1);
    if (amount < 1) {
      ctx.fillStyle = theme.accent;
      ctx.fillRect(direction === 'left' ? x : x + width - 6, row * cellH, 6, cellH);
    }
  }
  ctx.restore();
}

/** Draw a deterministic transition overlay around a cut. */
export function drawTransition(ctx: Ctx, name: TransitionName, phase: number, theme: Theme, seed: number, context?: TransitionContext) {
  if (name === 'cut' || !Number.isFinite(phase)) return;
  if (name === 'whip') return drawWhipTransition(ctx, phase, theme, seed, context);
  if (name === 'push') return drawPushTransition(ctx, phase, theme, seed, context);
  if (name === 'morph') return drawMorphTransition(ctx, phase, theme, seed, context);
  if (name === 'slide') return drawSlideTransition(ctx, phase, theme, seed, context);

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
