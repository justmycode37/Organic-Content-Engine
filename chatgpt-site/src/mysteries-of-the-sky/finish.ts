// A partial two-pixel pass lets the artwork pick up a fine raster edge while
// retaining the smooth original underneath, including thin paths and small type.
let raster: OffscreenCanvas | undefined;
export function finePixelFinish(ctx: CanvasRenderingContext2D) {
  const { width, height } = ctx.canvas;
  if (!width || !height) return;
  const stageScale = Math.min(width / 1920, height / 1080);
  const pitch = Math.max(1.25, 2 * stageScale);
  const w = Math.max(1, Math.round(width / pitch)),
    h = Math.max(1, Math.round(height / pitch));
  if (!raster || raster.width !== w || raster.height !== h) raster = new OffscreenCanvas(w, h);
  const sample = raster.getContext('2d')!;
  sample.globalCompositeOperation = 'copy';
  sample.imageSmoothingEnabled = true;
  sample.drawImage(ctx.canvas, 0, 0, w, h);
  ctx.save();
  try {
    ctx.resetTransform();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 0.42;
    ctx.drawImage(raster, 0, 0, width, height);
  } finally {
    ctx.restore();
  }
}
