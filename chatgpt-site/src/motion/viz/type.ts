import { clamp, ease, hash, type Frame } from '../core.ts';
import { pixelText, pixelWidth } from '../prim.ts';

export interface TypeRect { x: number; y: number; w: number; h: number }
export type KineticEffect = 'slam' | 'assemble' | 'split' | 'shatter' | 'stretch' | 'typewriter' | 'scramble' | 'mask' | 'crack';
export interface HeroTypeOptions {
  effect?: KineticEffect;
  size?: number;
  startAt?: number;
  stagger?: number;
  direction?: 'gain' | 'loss';
  seed?: number;
  /** Optional small clean sans line above/below the hero word. */
  eyebrow?: string;
}

const UP = '#55D68A';
const DOWN = '#FF5B62';
const SCRAMBLE = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
const adv = (char: string, px: number) => (char === ' ' ? 4 : 6) * px;
const totalAdvance = (chars: string[], px: number) => Math.max(0, chars.reduce((sum, char) => sum + adv(char, px), 0) - px);
const fitSize = (chars: string[], rect: TypeRect, requested?: number) => {
  const maximum = Math.min(requested ?? 22, Math.floor(rect.h / 7));
  for (let px = maximum; px >= 7; px--) if (totalAdvance(chars, px) <= rect.w - 24) return px;
  return Math.max(1, Math.floor((rect.w - 24) / (Math.max(1, chars.length) * 6)));
};

function drawGlyph(frame: Frame, char: string, x: number, y: number, px: number, opts: { color: string; scaleX?: number; scaleY?: number; rotate?: number; alpha?: number }) {
  if (char === ' ') return;
  const w = Math.max(px * 5, pixelWidth(char, px));
  frame.ctx.save();
  frame.ctx.globalAlpha *= opts.alpha ?? 1;
  frame.ctx.translate(x + w / 2, y + px * 3.5);
  frame.ctx.rotate(opts.rotate ?? 0);
  frame.ctx.scale(opts.scaleX ?? 1, opts.scaleY ?? 1);
  frame.ctx.translate(-(x + w / 2), -(y + px * 3.5));
  pixelText(frame.ctx, char, x, y, px, { color: opts.color });
  frame.ctx.restore();
}

/**
 * Pixel-display hero type for one or two short words. Each effect is deterministic and resolves from frame time.
 * Effects: slam, assemble, split, shatter, stretch, typewriter, scramble, mask, crack.
 */
export function drawHeroType(frame: Frame, raw: string, rect: TypeRect, time: number, options: HeroTypeOptions = {}) {
  const source = String(raw ?? '').trim().toUpperCase().replace(/\s+/g, ' ').split(' ').slice(0, 2).join(' ').slice(0, 36);
  if (!source || rect.w <= 0 || rect.h <= 0) return { visible: 0, total: 0, progress: 0 };
  const effect = options.effect ?? 'slam', chars = [...source], px = fitSize(chars, rect, options.size), width = totalAdvance(chars, px), capH = px * 7;
  const start = options.startAt ?? Math.min(0.08, frame.dur * 0.035), enter = Math.min(0.9, Math.max(0.42, frame.dur * 0.28)), elapsed = Math.max(0, time - start), progress = clamp(elapsed / enter), seed = options.seed ?? frame.seed;
  const color = options.direction === 'gain' ? UP : options.direction === 'loss' ? DOWN : frame.theme.fg;
  const baseX = rect.x + (rect.w - width) / 2, baseY = rect.y + (rect.h - capH) / 2;
  if (options.eyebrow) pixelText(frame.ctx, options.eyebrow.toUpperCase(), rect.x + rect.w / 2, rect.y + 2, 6, { color: frame.theme.dim, align: 'center' });
  if (effect === 'assemble' || effect === 'mask') {
    const reveal = ease.outExpo(progress);
    pixelText(frame.ctx, source, rect.x + rect.w / 2, baseY, px, { color, align: 'center', reveal, mode: effect === 'assemble' ? 'blocks' : 'rise', seed });
    return { visible: Math.ceil(chars.length * reveal), total: chars.length, progress: reveal };
  }
  if (effect === 'typewriter' || effect === 'scramble') {
    const reveal = ease.outExpo(progress), shown = Math.floor(reveal * chars.length), count = chars.filter(c => c !== ' ').length;
    let x = baseX, visible = 0;
    chars.forEach((char, i) => {
      if (char === ' ') { x += adv(char, px); return; }
      const local = clamp((reveal * chars.length - i) / 0.9);
      if (local > 0) {
        const scrambled = effect === 'scramble' && local < 1
          ? SCRAMBLE[Math.floor(hash(i, seed + Math.floor(time * 18)) * SCRAMBLE.length)]!
          : char;
        drawGlyph(frame, scrambled, x, baseY, px, { color, alpha: 0.4 + 0.6 * local });
        if (local >= 1) visible++;
      }
      x += adv(char, px);
    });
    return { visible: effect === 'typewriter' ? shown : visible, total: count, progress: reveal };
  }
  if (effect === 'crack') {
    const drop = ease.outBack(progress), dropY = (1 - drop) * -rect.h * 0.5 + Math.sin(Math.max(0, elapsed - enter) * 13) * (elapsed > enter ? 4 : 0), split = ease.outCubic(clamp((elapsed - enter * 1.45) / 0.44));
    const center = baseX + width / 2, leftChars = Math.ceil(chars.length / 2);
    let x = baseX;
    chars.forEach((char, i) => {
      const move = i < leftChars ? -split * 30 : split * 30;
      drawGlyph(frame, char, x + move, baseY + dropY, px, { color, rotate: split * (i < leftChars ? -0.035 : 0.035) });
      x += adv(char, px);
    });
    if (progress > 0.45) {
      frame.ctx.save(); frame.ctx.strokeStyle = frame.theme.bg; frame.ctx.lineWidth = Math.max(4, px * 0.62); frame.ctx.lineJoin = 'miter'; frame.ctx.beginPath();
      const steps = 12, mid = baseY + capH * 0.54 + dropY;
      frame.ctx.moveTo(center - width * 0.43, mid);
      for (let i = 1; i <= steps; i++) frame.ctx.lineTo(center - width * 0.43 + width * 0.86 * i / steps, mid + (i % 2 ? px * 0.8 : -px * 0.8));
      frame.ctx.stroke(); frame.ctx.restore();
      frame.ctx.save(); frame.ctx.strokeStyle = color; frame.ctx.lineWidth = Math.max(2, px * 0.24); frame.ctx.beginPath();
      frame.ctx.moveTo(center - width * 0.43, mid); for (let i = 1; i <= steps; i++) frame.ctx.lineTo(center - width * 0.43 + width * 0.86 * i / steps, mid + (i % 2 ? px * 0.8 : -px * 0.8)); frame.ctx.stroke(); frame.ctx.restore();
    }
    return { visible: chars.length, total: chars.length, progress };
  }

  const gap = options.stagger ?? 0.06, charsOnly = chars.filter(char => char !== ' ').length;
  let x = baseX, visible = 0;
  chars.forEach((char, index) => {
    if (char === ' ') { x += adv(char, px); return; }
    const local = clamp((elapsed - index * gap) / Math.max(0.16, enter - gap * (chars.length - 1))), easeIn = ease.outBack(local), centerX = x + px * 2.5;
    if (effect === 'shatter') {
      const explode = ease.outCubic(clamp((elapsed - enter * 1.55) / 0.54));
      const direction = hash(index, seed) < 0.5 ? -1 : 1;
      if (explode > 0.04) {
        for (let bit = 0; bit < 9; bit++) {
          const key = index * 17 + bit, seedX = hash(key, seed + 11), seedY = hash(key, seed + 19), originX = x + seedX * px * 5, originY = baseY + seedY * capH,
            vx = direction * (64 + seedX * 200), vy = (seedY - 0.46) * 240 + 80 * explode, size = 8 + Math.floor(seedY * 3) * 4,
            bx = Math.round((originX + vx * explode) / 4) * 4, by = Math.round((originY + vy * explode + 56 * explode * explode) / 4) * 4;
          frame.ctx.save(); frame.ctx.globalAlpha *= (0.6 - explode * 0.2) * Math.min(1, explode * 2.5); frame.ctx.fillStyle = color; frame.ctx.fillRect(bx, by, size, size); frame.ctx.restore();
        }
      }
      if (explode < 1) drawGlyph(frame, char, x + direction * explode * (44 + hash(index, seed + 8) * 120), baseY + (hash(index, seed + 1) - 0.5) * explode * 180,
        px, { color, rotate: direction * explode * 0.18, alpha: 1 - explode * 0.68, scaleX: 1 - explode * 0.12 });
    } else if (effect === 'slam') {
      const fromY = -rect.h * 0.62 * (1 - local), squash = local < 0.82 ? 1 + 0.35 * Math.sin(local * Math.PI / 0.82) : 1;
      drawGlyph(frame, char, x, baseY + fromY, px, { color, scaleX: 1 / squash, scaleY: squash, rotate: (1 - easeIn) * (hash(index, seed) - 0.5) * 0.12 });
    } else if (effect === 'split') {
      const side = hash(index, seed) < 0.5 ? -1 : 1;
      drawGlyph(frame, char, x + side * (1 - easeIn) * (rect.w * 0.44 + index * 14), baseY + (hash(index, seed + 2) - 0.5) * (1 - easeIn) * 60, px, { color, alpha: Math.min(1, local * 1.8) });
    } else if (effect === 'stretch') {
      const stretch = 1 + (1 - easeIn) * 2.2;
      drawGlyph(frame, char, centerX - px * 2.5, baseY, px, { color, scaleX: stretch, scaleY: 1 / stretch, alpha: Math.min(1, local * 1.8) });
    }
    if (local > 0.02) visible++;
    x += adv(char, px);
  });
  return { visible, total: charsOnly, progress };
}

/** Word-sized convenience API with the same behavior as `drawHeroType`. */
export const drawHeroWord = drawHeroType;

