import type { Ctx } from '../core.ts';
import { drawTicket2D } from './ticket.ts';
import { pixelText } from '../prim.ts';

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
  opacity?: number;
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
  const clean = stamp.toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim().slice(0, 18);
  if (!clean) return;
  ctx.save();
  ctx.globalAlpha *= Math.max(0, Math.min(1, opacity));
  ctx.translate(Math.round(x / 4) * 4, Math.round(y / 4) * 4);
  ctx.rotate(rotation - 0.025);
  const textSize = width >= 900 ? 7 : width >= 550 ? 5 : 4;
  const stampWidth = Math.min(420, Math.max(240, width * 0.29));
  const stampHeight = width >= 900 ? 92 : width >= 550 ? 64 : 48;
  ctx.fillStyle = '#101214';
  ctx.fillRect(-stampWidth / 2, -stampHeight / 2, stampWidth, stampHeight);
  ctx.strokeStyle = '#E3E6E8';
  ctx.lineWidth = 3;
  ctx.strokeRect(-stampWidth / 2 + 4, -stampHeight / 2 + 4, stampWidth - 8, stampHeight - 8);
  pixelText(ctx, clean, 0, -textSize * 3.5, textSize, { color: '#FFFFFF', align: 'center', mode: 'type', reveal: 1 });
  ctx.restore();
}

export function drawHeroTicket(ctx: Ctx, pose: HeroTicketPose = {}) {
  drawHeroTicketBody(ctx, pose);
  drawHeroTicketStamp(ctx, pose);
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
