import type { Ctx } from '../core.ts';
import { drawTicket2D } from './ticket.ts';
import { pixelText, pixelWidth } from '../prim.ts';

/** The ticket plate shared by the reel's first and final visible frame. */
export const HERO_TICKET_FRAME = Object.freeze({
  background: '#14181C',
  x: 540,
  y: 645,
  width: 1456,
  rotation: -0.035,
  stamp: 'BORROWED',
});

export interface HeroTicketPose {
  x?: number;
  y?: number;
  width?: number;
  rotation?: number;
  stamp?: string;
  stampOpacity?: number;
  secondaryStamp?: string;
  secondaryStampOpacity?: number;
  opacity?: number;
  /** Keep a readable ticket aligned to the output pixel grid inside a moving camera. */
  pixelLock?: boolean;
}

const FACE_SCALE = 3;
const FACE_WIDTH = 1500;
const FACE_HEIGHT = 660;
const FACE_PAD = 18;
const FACE_CX = FACE_WIDTH / 2;
const FACE_CY = FACE_HEIGHT / 2;
type FaceSurface = { canvas: OffscreenCanvas | HTMLCanvasElement; ctx: Ctx };
let faceSurface: FaceSurface | null = null;

function getFaceSurface(): FaceSurface | null {
  if (faceSurface) return faceSurface;
  const width = (FACE_WIDTH + FACE_PAD * 2) * FACE_SCALE;
  const height = (FACE_HEIGHT + FACE_PAD * 2) * FACE_SCALE;
  let canvas: OffscreenCanvas | HTMLCanvasElement;
  if (typeof OffscreenCanvas !== 'undefined') canvas = new OffscreenCanvas(width, height);
  else if (typeof document !== 'undefined') canvas = Object.assign(document.createElement('canvas'), { width, height });
  else return null;
  const ctx = canvas.getContext('2d') as Ctx | null;
  if (!ctx) return null;
  faceSurface = { canvas, ctx };
  return faceSurface;
}

function cleanStamp(stamp: string): string {
  return stamp.toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim().slice(0, 18);
}

function drawStampOnFace(ctx: Ctx, x: number, y: number, width: number, stamp: string, opacity = 1) {
  const clean = cleanStamp(stamp);
  if (!clean || opacity <= 0) return;
  // The stamp fills most of the ticket body so it stays legible after the scene camera scales the ticket down.
  const words = clean.split(/\s+/).filter(Boolean);
  const lines = words.length > 1 && clean.length > 10 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [clean];
  const stampWidth = Math.round(width * 0.58 / 4) * 4, stampHeight = Math.round(width / 2.4 * (lines.length > 1 ? 0.56 : 0.36) / 4) * 4;
  const family = "'Anton', 'Impact', 'Haettenschweiler', 'Arial Narrow Bold', 'Arial Black', sans-serif";
  let size = Math.floor((stampHeight - 16) / lines.length / 0.95);
  ctx.save();
  ctx.font = `900 ${size}px ${family}`;
  const widest = Math.max(...lines.map(line => ctx.measureText(line).width));
  if (widest > stampWidth - 28) size = Math.floor(size * (stampWidth - 28) / widest);
  const left = Math.round(x / 4) * 4 - width * 0.06, top = Math.round(y / 4) * 4 + width / 2.4 * 0.08;
  ctx.globalAlpha *= Math.max(0, Math.min(1, opacity));
  ctx.fillStyle = '#101214';
  ctx.fillRect(left - stampWidth / 2, top - stampHeight / 2, stampWidth, stampHeight);
  ctx.strokeStyle = '#E3E6E8';
  ctx.lineWidth = Math.max(3, Math.round(width / 160));
  ctx.strokeRect(left - stampWidth / 2 + 6, top - stampHeight / 2 + 6, stampWidth - 12, stampHeight - 12);
  ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `900 ${size}px ${family}`;
  const step = size * 0.98;
  lines.forEach((line, index) => ctx.fillText(line, left, top + (index - (lines.length - 1) / 2) * step + size * 0.04));
  ctx.restore();
}

export function drawHeroTicketBackground(ctx: Ctx) {
  ctx.fillStyle = HERO_TICKET_FRAME.background;
  ctx.fillRect(0, 0, 1080, 1290);
}

export function drawHeroTicketBody(ctx: Ctx, pose: HeroTicketPose = {}) {
  const { x = HERO_TICKET_FRAME.x, y = HERO_TICKET_FRAME.y, width = HERO_TICKET_FRAME.width, rotation = HERO_TICKET_FRAME.rotation, opacity = 1 } = pose;
  if (opacity <= 0) return;
  ctx.save();
  ctx.globalAlpha *= Math.max(0, Math.min(1, opacity));
  drawTicket2D(ctx, x, y, width, { rot: rotation });
  ctx.restore();
}

export function drawHeroTicketStamp(ctx: Ctx, pose: HeroTicketPose = {}) {
  const { x = HERO_TICKET_FRAME.x, y = HERO_TICKET_FRAME.y, width = HERO_TICKET_FRAME.width, rotation = HERO_TICKET_FRAME.rotation, stamp = HERO_TICKET_FRAME.stamp, opacity = 1 } = pose;
  if (opacity <= 0 || width <= 0 || !stamp) return;
  const clean = cleanStamp(stamp);
  if (!clean) return;
  ctx.save();
  ctx.globalAlpha *= Math.max(0, Math.min(1, opacity));
  ctx.translate(Math.round(x / 4) * 4, Math.round(y / 4) * 4);
  ctx.rotate(rotation - 0.025);
  drawStampOnFace(ctx, 0, 0, width, clean);
  ctx.restore();
}

/** Rasterizes the ticket face at 3x, then transforms it with nearest-neighbour sampling. */
export function drawHeroTicketFace(ctx: Ctx, pose: HeroTicketPose = {}) {
  const { x = HERO_TICKET_FRAME.x, y = HERO_TICKET_FRAME.y, width = HERO_TICKET_FRAME.width,
    rotation = HERO_TICKET_FRAME.rotation, stamp = HERO_TICKET_FRAME.stamp, opacity = 1,
    stampOpacity = 1, secondaryStamp, secondaryStampOpacity = 0, pixelLock = false } = pose;
  if (opacity <= 0 || width <= 0) return;

  let drawX = x, drawY = y, drawWidth = width;
  if (pixelLock) {
    const canvasScale = ctx.canvas.width / 1080 || 1;
    const matrix = ctx.getTransform();
    const scale = Math.hypot(matrix.a, matrix.b) / canvasScale;
    drawX = Math.round((matrix.a * x + matrix.c * y + matrix.e) / canvasScale / 4) * 4;
    drawY = Math.round((matrix.b * x + matrix.d * y + matrix.f) / canvasScale / 4) * 4;
    drawWidth = Math.round(width * scale / 4) * 4;
  }
  // The face is rasterized on a 3x surface; four-pixel size steps avoid
  // continuously resampling its stamp while keeping the ticket on the pixel grid.
  drawX = Math.round(drawX / 4) * 4;
  drawY = Math.round(drawY / 4) * 4;
  drawWidth = Math.max(4, Math.round(drawWidth / 4) * 4);
  const drawPose = { ...pose, x: drawX, y: drawY, width: drawWidth, rotation };
  const surface = drawWidth <= FACE_WIDTH - FACE_PAD * 2 ? getFaceSurface() : null;
  if (!surface) {
    ctx.save();
    if (pixelLock) ctx.setTransform(ctx.canvas.width / 1080 || 1, 0, 0, ctx.canvas.width / 1080 || 1, 0, 0);
    drawHeroTicketBody(ctx, drawPose);
    drawHeroTicketStamp(ctx, drawPose);
    ctx.restore();
    return;
  }

  const height = drawWidth / 2.4;
  const sourceX = Math.round((FACE_CX - drawWidth / 2 - FACE_PAD) * FACE_SCALE);
  const sourceY = Math.round((FACE_CY - height / 2 - FACE_PAD) * FACE_SCALE);
  const sourceW = Math.round((drawWidth + FACE_PAD * 2) * FACE_SCALE);
  const sourceH = Math.round((height + FACE_PAD * 2) * FACE_SCALE);
  const faceCtx = surface.ctx;
  faceCtx.save();
  faceCtx.setTransform(1, 0, 0, 1, 0, 0);
  faceCtx.clearRect(sourceX, sourceY, sourceW, sourceH);
  faceCtx.imageSmoothingEnabled = false;
  faceCtx.setTransform(FACE_SCALE, 0, 0, FACE_SCALE, 0, 0);
  drawTicket2D(faceCtx, FACE_CX, FACE_CY, drawWidth);
  drawStampOnFace(faceCtx, FACE_CX, FACE_CY, drawWidth, stamp, stampOpacity);
  if (secondaryStamp && secondaryStampOpacity > 0)
    drawStampOnFace(faceCtx, FACE_CX, FACE_CY, drawWidth, secondaryStamp, secondaryStampOpacity);
  faceCtx.restore();

  const destX = drawX, destY = drawY;
  ctx.save();
  if (pixelLock) ctx.setTransform(ctx.canvas.width / 1080 || 1, 0, 0, ctx.canvas.width / 1080 || 1, 0, 0);
  ctx.globalAlpha *= Math.max(0, Math.min(1, opacity));
  // Downsampling the 3x face: smoothing keeps glyph strokes; nearest-neighbour would drop them and garble the stamp.
  ctx.imageSmoothingEnabled = true; (ctx as CanvasRenderingContext2D).imageSmoothingQuality = 'high';
  ctx.translate(destX, destY);
  ctx.rotate(rotation);
  ctx.drawImage(surface.canvas as CanvasImageSource, sourceX, sourceY, sourceW, sourceH,
    -drawWidth / 2 - FACE_PAD, -height / 2 - FACE_PAD, drawWidth + FACE_PAD * 2, height + FACE_PAD * 2);
  ctx.restore();
}

export function drawHeroTicket(ctx: Ctx, pose: HeroTicketPose = {}) {
  drawHeroTicketFace(ctx, pose);
}

/** Paints the exact shared loop plate; call without a camera transform in both shots. */
export function drawHeroTicketFrame(ctx: Ctx) {
  const canvasScale = 'canvas' in ctx && ctx.canvas ? ctx.canvas.width / 1080 : 1;
  ctx.save();
  ctx.setTransform(canvasScale, 0, 0, canvasScale, 0, 0);
  drawHeroTicketBackground(ctx);
  drawHeroTicket(ctx, HERO_TICKET_FRAME);
  ctx.restore();
}
