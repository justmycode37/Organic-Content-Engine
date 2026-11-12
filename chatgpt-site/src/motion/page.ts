// Browser entry for the headless frame/video tools (scripts/motion.mjs).
import { FPS, H, W, reelFrames, type AssetImage, type ReelSpec } from './core.ts';
import { renderReel } from './player.ts';
import { styleOf, type StyleFont } from './styles/index.ts';

/** What a spec needs loaded before drawing: the style's font files and the spec's images (paths as written). */
export interface Requirements { style: string; fonts: StyleFont[]; assets: Record<string, string> }
/** Loaded payload: font files and images as data URLs. */
export interface Payload { fonts: (StyleFont & { data: string })[]; assets: Record<string, string> }

declare global { interface Window { motion: {
  frames(spec: ReelSpec): number;
  requirements(spec: ReelSpec): Requirements;
  load(payload: Payload): Promise<void>;
  shot(spec: ReelSpec, time: number, scale?: number): string;
  render(spec: ReelSpec): Promise<number>;
}; emitFrame(base64: string): Promise<void> } }

const assets: Record<string, AssetImage> = {};
function canvasFor(scale = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = W * scale; canvas.height = H * scale;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  return { canvas, ctx, draw(spec: ReelSpec, time: number) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.save(); ctx.scale(scale, scale); renderReel(ctx, spec, time, assets); ctx.restore(); } };
}
async function decode(url: string): Promise<AssetImage> {
  const image = new Image();
  image.decoding = 'sync';
  image.src = url;
  await image.decode();
  // SVGs without intrinsic size report 0; give them a usable default.
  if (!image.naturalWidth) { image.width = 1024; image.height = 1024; }
  return image;
}
window.motion = {
  frames: reelFrames,
  requirements(spec) {
    const style = styleOf(spec.style);
    return { style: style.name, fonts: style.fonts ?? [], assets: spec.assets ?? {} };
  },
  async load(payload) {
    for (const item of payload.fonts) {
      const face = new FontFace(item.family, `url(${item.data})`, { weight: item.weight ?? 'normal', style: item.style ?? 'normal' });
      document.fonts.add(await face.load());
    }
    for (const [id, url] of Object.entries(payload.assets)) assets[id] = await decode(url);
    await document.fonts.ready;
  },
  shot(spec, time, scale = 1) { const target = canvasFor(scale); target.draw(spec, time); return target.canvas.toDataURL('image/png').split(',')[1]!; },
  async render(spec) {
    const target = canvasFor(), frames = reelFrames(spec);
    for (let index = 0; index < frames; index++) { target.draw(spec, index / FPS); await window.emitFrame(target.canvas.toDataURL('image/jpeg', 0.95).split(',')[1]!); }
    return frames;
  },
};
