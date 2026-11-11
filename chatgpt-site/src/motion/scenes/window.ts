import { SAFE, clamp, ease, type Ctx, type Theme } from '../core.ts';
import { CELL, dither } from '../pix.ts';
import { pixelText, pixelWidth } from '../prim.ts';

export const WINDOW_HEADER = 68;
export const WINDOW_MAX_HEIGHT = 1000;

export interface WindowLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  content: { x: number; y: number; w: number; h: number };
}

export function makeWindowLayout(contentHeight: number): WindowLayout {
  const h = WINDOW_HEADER + 24 + Math.max(0, contentHeight) + 20;
  const x = SAFE.x;
  const y = 740 - h / 2;
  return {
    x,
    y,
    w: SAFE.w,
    h,
    content: {
      x: x + 36,
      y: y + WINDOW_HEADER + 24,
      w: SAFE.w - 72,
      h: Math.max(0, contentHeight),
    },
  };
}

function steppedPath(ctx: Ctx, x: number, y: number, w: number, h: number, step: number) {
  ctx.beginPath();
  ctx.moveTo(x + step, y);
  ctx.lineTo(x + w - step, y);
  ctx.lineTo(x + w - step, y + step);
  ctx.lineTo(x + w, y + step);
  ctx.lineTo(x + w, y + h - step);
  ctx.lineTo(x + w - step, y + h - step);
  ctx.lineTo(x + w - step, y + h);
  ctx.lineTo(x + step, y + h);
  ctx.lineTo(x + step, y + h - step);
  ctx.lineTo(x, y + h - step);
  ctx.lineTo(x, y + step);
  ctx.lineTo(x + step, y + step);
  ctx.closePath();
}

function safeTitle(value: string, maxWidth: number): string {
  const title = String(value ?? '').trim().toUpperCase();
  if (pixelWidth(title, 6) <= maxWidth) return title;
  const chars = Array.from(title);
  while (chars.length && pixelWidth(chars.join('') + '...', 6) > maxWidth) chars.pop();
  return chars.length ? chars.join('') + '...' : '';
}

/**
 * Draws the shared fine-pixel editor shell, its dithered depth and content.
 * The caller owns timing; reveal is the exact 0..1 pixel-build progress.
 */
export function drawPixelWindow(
  ctx: Ctx,
  theme: Theme,
  layout: WindowLayout,
  filename: string,
  reveal: number,
  drawContent: (content: WindowLayout['content']) => void,
  rightLabel = '',
) {
  const p = clamp(reveal);
  if (p <= 0) return;

  const { x, y, w, h } = layout;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const scale = 0.9 + 0.1 * ease.outBack(p);
  const lift = (1 - ease.outExpo(p)) * 14;

  ctx.save();
  ctx.translate(cx, cy + lift);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);

  // The shadow is a clipped field of four-pixel flecks, offset from the frame.
  ctx.save();
  ctx.globalAlpha *= 0.72 * p;
  ctx.translate(12, 12);
  steppedPath(ctx, x, y, w, h, 12);
  ctx.clip();
  dither(ctx, x, y, w, h, theme.line, () => 0.3, CELL);
  ctx.restore();

  // Ordered pixel reveal gives the window its short digital build.
  ctx.save();
  steppedPath(ctx, x, y, w, h, 12);
  ctx.clip();
  dither(ctx, x, y, w, h, theme.panel, () => p, CELL);

  ctx.globalAlpha *= ease.outExpo(clamp((p - 0.18) / 0.82));
  ctx.fillStyle = theme.panelAlt;
  ctx.fillRect(x + 4, y + 4, w - 8, WINDOW_HEADER - 4);
  ctx.globalAlpha *= 0.45;
  dither(ctx, x + 4, y + 4, w - 8, WINDOW_HEADER - 4, theme.dim, (_u, v) => 0.03 + 0.08 * v, CELL);
  ctx.globalAlpha /= 0.45;

  ctx.fillStyle = theme.line;
  ctx.fillRect(x + 4, y + WINDOW_HEADER, w - 8, 4);

  // Three small square lights and a compact pixel filename.
  const lightY = y + 28;
  const lights = [theme.fg, theme.dim, theme.muted];
  for (let i = 0; i < lights.length; i++) {
    ctx.fillStyle = lights[i]!;
    ctx.fillRect(x + 24 + i * 20, lightY, 12, 12);
    ctx.fillStyle = theme.panel;
    ctx.fillRect(x + 28 + i * 20, lightY + 4, 4, 4);
  }

  const rightText = String(rightLabel ?? '').trim().toUpperCase();
  const rightWidth = rightText ? pixelWidth(rightText, 6) : 0;
  const titleMax = w - 174 - (rightWidth ? rightWidth + 28 : 0);
  const title = safeTitle(filename, titleMax);
  if (title) pixelText(ctx, title, x + 100, y + 13, 6, { color: theme.dim });
  if (rightText) pixelText(ctx, rightText, x + w - 24, y + 13, 6, { color: theme.dim, align: 'right' });

  // Quiet surface grain, a hard perimeter and a thin bevel catch.
  ctx.globalAlpha *= 0.42;
  dither(ctx, x + 4, y + WINDOW_HEADER + 4, w - 8, h - WINDOW_HEADER - 8, theme.line, (_u, v) => 0.025 + 0.09 * v, CELL);
  ctx.globalAlpha /= 0.42;

  ctx.globalAlpha *= 0.86;
  steppedPath(ctx, x + 2, y + 2, w - 4, h - 4, 10);
  ctx.strokeStyle = theme.line;
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.globalAlpha *= 0.82;
  ctx.strokeStyle = theme.dim;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x + 16, y + 6);
  ctx.lineTo(x + w - 16, y + 6);
  ctx.moveTo(x + 6, y + 16);
  ctx.lineTo(x + 6, y + h - 16);
  ctx.stroke();

  ctx.globalAlpha *= 0.52;
  ctx.strokeStyle = theme.muted;
  ctx.beginPath();
  ctx.moveTo(x + 16, y + h - 6);
  ctx.lineTo(x + w - 16, y + h - 6);
  ctx.moveTo(x + w - 6, y + 16);
  ctx.lineTo(x + w - 6, y + h - 16);
  ctx.stroke();
  ctx.restore();

  // Keep every scene's content clipped to the stepped frame.
  ctx.save();
  steppedPath(ctx, x + 4, y + 4, w - 8, h - 8, 8);
  ctx.clip();
  ctx.beginPath();
  ctx.rect(x + 12, y + WINDOW_HEADER + 4, w - 24, h - WINDOW_HEADER - 12);
  ctx.clip();
  ctx.globalAlpha *= ease.outExpo(clamp((p - 0.28) / 0.72));
  drawContent(layout.content);
  ctx.restore();

  ctx.restore();
}
