// Only the artwork receives the subtle raster finish. Keep original output
// pixels around glyphs, including their antialiased edges, in the normal paint
// order. This also preserves clipped or partially occluded labels during a wipe.
type Ctx = CanvasRenderingContext2D;
type Region = { x: number; y: number; w: number; h: number };
let raster: OffscreenCanvas | undefined;
let overlay: OffscreenCanvas | undefined;

function textRegion(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  maxWidth: number | undefined,
  stroke: boolean,
): Region {
  const metrics = ctx.measureText(text);
  const transform = ctx.getTransform();
  const sx = maxWidth === undefined || metrics.width === 0 ? 1 : Math.min(1, maxWidth / metrics.width);
  const pad = stroke ? (ctx.lineWidth * ctx.miterLimit) / 2 : 0;
  const left = x - metrics.actualBoundingBoxLeft * sx - pad,
    right = x + metrics.actualBoundingBoxRight * sx + pad;
  const top = y - metrics.actualBoundingBoxAscent - pad,
    bottom = y + metrics.actualBoundingBoxDescent + pad;
  const corners = [
    [left, top],
    [right, top],
    [right, bottom],
    [left, bottom],
  ].map(([px, py]) => transform.transformPoint({ x: px, y: py }));
  const xs = corners.map((p) => p.x),
    ys = corners.map((p) => p.y);
  const x0 = Math.floor(Math.min(...xs)) - 2,
    y0 = Math.floor(Math.min(...ys)) - 2;
  return { x: x0, y: y0, w: Math.ceil(Math.max(...xs)) + 2 - x0, h: Math.ceil(Math.max(...ys)) + 2 - y0 };
}

// Scope the two native text observers to this draw callback. A custom shot
// calling fillText/strokeText directly has the same behavior as a library label.
export function paintWithFinePixels(ctx: Ctx, draw: () => void) {
  const regions: Region[] = [];
  const methods = ['fillText', 'strokeText'] as const;
  const descriptors = methods.map((name) => Object.getOwnPropertyDescriptor(ctx, name));
  try {
    for (const name of methods) {
      const paint = ctx[name];
      ctx[name] = function (text, x, y, maxWidth) {
        if (text && ctx.globalAlpha > 0)
          regions.push(textRegion(ctx, text, x, y, maxWidth, name === 'strokeText'));
        if (maxWidth === undefined) paint.call(ctx, text, x, y);
        else paint.call(ctx, text, x, y, maxWidth);
      };
    }
    draw();
  } finally {
    methods.forEach((name, i) => {
      const descriptor = descriptors[i];
      if (descriptor) Object.defineProperty(ctx, name, descriptor);
      else Reflect.deleteProperty(ctx, name);
    });
  }
  const { width, height } = ctx.canvas;
  if (!width || !height) return;
  const pitch = Math.max(1.25, 2 * Math.min(width / 1920, height / 1080));
  const w = Math.max(1, Math.round(width / pitch)),
    h = Math.max(1, Math.round(height / pitch));
  if (!raster || raster.width !== w || raster.height !== h) raster = new OffscreenCanvas(w, h);
  const sample = raster.getContext('2d')!;
  sample.globalCompositeOperation = 'copy';
  sample.drawImage(ctx.canvas, 0, 0, w, h);
  if (!overlay || overlay.width !== width || overlay.height !== height)
    overlay = new OffscreenCanvas(width, height);
  const art = overlay.getContext('2d')!;
  art.globalCompositeOperation = 'copy';
  art.imageSmoothingEnabled = false;
  art.drawImage(raster, 0, 0, width, height);
  for (const { x, y, w, h } of regions) art.clearRect(x, y, w, h);
  ctx.save();
  try {
    ctx.resetTransform();
    ctx.globalAlpha = 0.42;
    ctx.drawImage(overlay, 0, 0);
  } finally {
    ctx.restore();
  }
}
