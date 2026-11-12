// Clean pixel-art sprites: authored on a small art-pixel grid, upscaled once with
// nearest-neighbour into a cached device-resolution canvas, then drawn with
// smoothing ON at float positions. That keeps every art pixel a perfect square
// while motion stays sub-pixel smooth (no 1 px edge wobble, no grid snapping).
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Device pixels per art pixel. ONE value for every sprite in a reel. */
export const ART = 6;
/**
 * Clean shots are authored on a 720 x 860 stage that the player draws at
 * STAGE_ZOOM, so one art pixel is 9 device px on screen. Sprites are baked at
 * that density so they land 1:1 on device pixels (crisp), while their size in
 * stage units stays cols * ART.
 */
export const STAGE_ZOOM = 1.5;

export interface Sprite { canvas: CanvasImageSource; cols: number; rows: number; w: number; h: number }

const cache = new Map<string, Sprite>();

function surface(w: number, h: number): { canvas: OffscreenCanvas | HTMLCanvasElement; ctx: Ctx } {
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  return { canvas, ctx: canvas.getContext('2d') as Ctx };
}

/**
 * Build (or fetch from cache) a sprite. `paint` draws at ART resolution: one
 * unit = one art pixel, integer fillRect only. `key` must encode every state
 * that changes the picture (frame index, open/closed...). Keep the number of
 * distinct keys small (animation frames, not continuous values).
 */
export function makeSprite(key: string, cols: number, rows: number, paint: (ctx: Ctx) => void, art = ART): Sprite {
  const id = `${key}|${cols}x${rows}@${art}`;
  const hit = cache.get(id);
  if (hit) return hit;
  const small = surface(cols, rows);
  small.ctx.imageSmoothingEnabled = false;
  paint(small.ctx);
  const px = Math.round(art * STAGE_ZOOM);
  const big = surface(cols * px, rows * px);
  big.ctx.imageSmoothingEnabled = false;
  big.ctx.drawImage(small.canvas, 0, 0, cols * px, rows * px);
  const sprite: Sprite = { canvas: big.canvas, cols, rows, w: cols * art, h: rows * art };
  cache.set(id, sprite);
  return sprite;
}

/** Sprite from text rows; each character maps to a colour in `palette` ('.' and ' ' are transparent). */
export function spriteFromRows(key: string, rows: readonly string[], palette: Record<string, string>, art = ART): Sprite {
  const cols = Math.max(...rows.map(row => row.length));
  return makeSprite(key, cols, rows.length, ctx => {
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const color = palette[row[x]!];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      }
    });
  }, art);
}

export interface DrawSpriteOptions {
  /** Uniform scale on top of the ART upscale. Keep 1 for most objects; animate only briefly (pops, squash). */
  scale?: number; sx?: number; sy?: number; rot?: number; alpha?: number;
  /** Anchor inside the sprite, 0..1 (default centre). Use [0.5, 1] for things standing on the floor. */
  anchor?: [number, number]; flip?: boolean;
}

/** Draw at float device coordinates (never round positions — smooth motion is the point). */
export function drawSprite(ctx: Ctx, sprite: Sprite, x: number, y: number, options: DrawSpriteOptions = {}) {
  const scale = options.scale ?? 1, sx = (options.sx ?? 1) * scale * (options.flip ? -1 : 1), sy = (options.sy ?? 1) * scale;
  const [ax, ay] = options.anchor ?? [0.5, 0.5];
  ctx.save();
  ctx.globalAlpha *= options.alpha ?? 1;
  ctx.translate(x, y);
  if (options.rot) ctx.rotate(options.rot);
  ctx.scale(sx, sy);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sprite.canvas, -sprite.w * ax, -sprite.h * ay, sprite.w, sprite.h);
  ctx.restore();
}
