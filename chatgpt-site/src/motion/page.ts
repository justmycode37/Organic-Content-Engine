// Browser entry for the headless frame/video tools (scripts/motion.mjs).
import { FPS, H, W, reelFrames, type ReelSpec } from './core.ts';
import { renderReel } from './player.ts';

declare global { interface Window { motion: { frames(spec: ReelSpec): number; shot(spec: ReelSpec, time: number, scale?: number): string; render(spec: ReelSpec): Promise<number> }; emitFrame(base64: string): Promise<void> } }
function canvasFor(scale = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = W * scale; canvas.height = H * scale;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  return { canvas, ctx, draw(spec: ReelSpec, time: number) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.save(); ctx.scale(scale, scale); renderReel(ctx, spec, time); ctx.restore(); } };
}
window.motion = {
  frames: reelFrames,
  shot(spec, time, scale = 1) { const target = canvasFor(scale); target.draw(spec, time); return target.canvas.toDataURL('image/png').split(',')[1]!; },
  async render(spec) {
    const target = canvasFor(), frames = reelFrames(spec);
    for (let index = 0; index < frames; index++) { target.draw(spec, index / FPS); await window.emitFrame(target.canvas.toDataURL('image/jpeg', 0.95).split(',')[1]!); }
    return frames;
  },
};
