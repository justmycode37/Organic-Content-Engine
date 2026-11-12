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
  const stampWidth = Math.min(420, Math.max(300, width >= 550 ? 360 : width * 0.75));
  let fitSize = width >= 900 ? 7 : 6;
  const words = clean.split(/\s+/).filter(Boolean);
  while (fitSize > 3 && words.some(word => pixelWidth(word, fitSize) > stampWidth - 24)) fitSize--;
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && pixelWidth(candidate, fitSize) > stampWidth - 24) { lines.push(line); line = word; }
    else line = candidate;
  }
  if (line) lines.push(line);
  const lineStep = fitSize * 8;
  const textHeight = lines.length * lineStep - fitSize;
  const stampHeight = Math.max(width >= 900 ? 92 : 64, textHeight + 12);
  const left = Math.round(x / 4) * 4, top = Math.round(y / 4) * 4;
  ctx.save();
  ctx.globalAlpha *= Math.max(0, Math.min(1, opacity));
  ctx.fillStyle = '#101214';
  ctx.fillRect(left - stampWidth / 2, top - stampHeight / 2, stampWidth, stampHeight);
  ctx.strokeStyle = '#E3E6E8';
  ctx.lineWidth = 3;
  ctx.strokeRect(left - stampWidth / 2 + 4, top - stampHeight / 2 + 4, stampWidth - 8, stampHeight - 8);
  const firstY = top - textHeight / 2;
  for (let index = 0; index < lines.length; index++)
    pixelText(ctx, lines[index]!, left, firstY + index * lineStep, fitSize, { color: '#FFFFFF', align: 'center', mode: 'type', reveal: 1 });
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
    stampOpacity = 1, secondaryStamp, secondaryStampOpacity = 0 } = pose;
  if (opacity <= 0 || width <= 0) return;
  const surface = width <= FACE_WIDTH - FACE_PAD * 2 ? getFaceSurface() : null;
  if (!surface) {
    drawHeroTicketBody(ctx, pose);
    drawHeroTicketStamp(ctx, pose);
    return;
  }

  const height = width / 2.4;
  const sourceX = Math.round((FACE_CX - width / 2 - FACE_PAD) * FACE_SCALE);
  const sourceY = Math.round((FACE_CY - height / 2 - FACE_PAD) * FACE_SCALE);
  const sourceW = Math.round((width + FACE_PAD * 2) * FACE_SCALE);
  const sourceH = Math.round((height + FACE_PAD * 2) * FACE_SCALE);
  const faceCtx = surface.ctx;
  faceCtx.save();
  faceCtx.setTransform(1, 0, 0, 1, 0, 0);
  faceCtx.clearRect(sourceX, sourceY, sourceW, sourceH);
  faceCtx.imageSmoothingEnabled = false;
  faceCtx.setTransform(FACE_SCALE, 0, 0, FACE_SCALE, 0, 0);
  drawTicket2D(faceCtx, FACE_CX, FACE_CY, width);
  drawStampOnFace(faceCtx, FACE_CX, FACE_CY, width, stamp, stampOpacity);
  if (secondaryStamp && secondaryStampOpacity > 0)
    drawStampOnFace(faceCtx, FACE_CX, FACE_CY, width, secondaryStamp, secondaryStampOpacity);
  faceCtx.restore();

  const destX = Math.round(x / 4) * 4, destY = Math.round(y / 4) * 4;
  ctx.save();
  ctx.globalAlpha *= Math.max(0, Math.min(1, opacity));
  ctx.imageSmoothingEnabled = false;
  ctx.translate(destX, destY);
  ctx.rotate(rotation);
  ctx.drawImage(surface.canvas as CanvasImageSource, sourceX, sourceY, sourceW, sourceH,
    -width / 2 - FACE_PAD, -height / 2 - FACE_PAD, width + FACE_PAD * 2, height + FACE_PAD * 2);
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
