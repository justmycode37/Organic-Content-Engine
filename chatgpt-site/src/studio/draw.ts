// Composites one finished frame: graded footage, hook title, timed captions and the end card.
// Everything is a pure function of the timeline time, so preview and export are identical.
import { FRAME, easeOut, fitText, segmentAt, type TimedCaption, type EditPlan, type Measure, type Segment, type Timeline } from './plan.ts';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type FrameSource = { image: CanvasImageSource; width: number; height: number };

const { width: W, height: H } = FRAME;
export const FONT_FAMILY = "Manrope, 'DM Sans', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif";
const font = (size: number, weight = 800) => `${weight} ${size}px ${FONT_FAMILY}`;

// Platform interface covers the top and bottom of a vertical video and the lower right rail.
const TEXT_WIDTH = 860;
const HOOK_Y = H * 0.3;
const CAPTION_Y = H * 0.685;
const CAPTION_WIDTH = 800;

const measureAt = (ctx: Ctx) => (size: number, weight = 800): Measure => text => {
  ctx.font = font(size, weight);
  return ctx.measureText(text).width;
};

function drawFootage(ctx: Ctx, source: FrameSource | null, segment: Segment, time: number, timeline: Timeline) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  if (!source) return;
  const progress = (time - segment.start) / (segment.end - segment.start);
  // A slow push or pull keeps every shot alive; a short punch sells each cut.
  const drift = segment.index % 2 === 0 ? 1 + 0.06 * progress : 1.06 - 0.06 * progress;
  const punch = segment.index > 0 ? 1 + 0.035 * (1 - easeOut((time - segment.start) / 0.17)) : 1;
  const scale = Math.max(W / source.width, H / source.height) * drift * punch;
  const end = timeline.ctaStart < timeline.duration ? easeOut((time - timeline.ctaStart) / 0.4) : 0;
  ctx.save();
  ctx.filter = `contrast(1.06) saturate(1.1)${end > 0 ? ` blur(${(end * 14).toFixed(1)}px) brightness(${(1 - 0.55 * end).toFixed(3)})` : ''}`;
  ctx.drawImage(source.image, (W - source.width * scale) / 2, (H - source.height * scale) / 2, source.width * scale, source.height * scale);
  ctx.restore();
  // Soft top and bottom falloff: reads as a grade and keeps type legible on bright footage.
  const top = ctx.createLinearGradient(0, 0, 0, H * 0.3);
  top.addColorStop(0, 'rgba(0,0,0,0.28)'); top.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = top; ctx.fillRect(0, 0, W, H * 0.3);
  const bottom = ctx.createLinearGradient(0, H * 0.5, 0, H);
  bottom.addColorStop(0, 'rgba(0,0,0,0)'); bottom.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = bottom; ctx.fillRect(0, H * 0.5, W, H * 0.5);
}

function roundedRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Opening title: solid label blocks, fully visible on frame one so it doubles as the cover. */
function drawHook(ctx: Ctx, text: string, time: number, hookEnd: number) {
  if (!text.trim() || time >= hookEnd) return;
  const measure = measureAt(ctx);
  const { size, lines } = fitText(text.trim(), measure, TEXT_WIDTH - 72, 3, [108, 96, 84, 72, 62]);
  const lineHeight = size * 1.34, padX = 36, gap = 10;
  const exit = easeOut((time - (hookEnd - 0.22)) / 0.22);
  const scale = 1 + 0.06 * (1 - easeOut(time / 0.3));
  ctx.save();
  ctx.globalAlpha = 1 - exit;
  ctx.translate(W / 2, HOOK_Y - exit * 36);
  ctx.scale(scale, scale);
  ctx.font = font(size);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const total = lines.length * lineHeight + (lines.length - 1) * gap;
  lines.forEach((line, index) => {
    const y = -total / 2 + index * (lineHeight + gap) + lineHeight / 2;
    const w = ctx.measureText(line).width + padX * 2;
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 28; ctx.shadowOffsetY = 8;
    ctx.fillStyle = '#fff';
    roundedRect(ctx, -w / 2, y - lineHeight / 2, w, lineHeight, 20); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#0a0a0a';
    ctx.fillText(line, 0, y + size * 0.04);
  });
  ctx.restore();
}

/** Timed text beat: heavy outlined type, words landing in sequence so the line reads at speaking pace. */
function drawCaption(ctx: Ctx, caption: TimedCaption, time: number) {
  const measure = measureAt(ctx);
  const { size, lines } = fitText(caption.text, measure, CAPTION_WIDTH, 2, [74, 66, 58, 50]);
  const lineHeight = size * 1.22;
  const words = lines.flatMap(line => line.split(' ')).length;
  const span = caption.end - caption.start;
  const step = Math.min(0.11, (span * 0.5) / Math.max(1, words));
  const exit = 1 - easeOut((time - (caption.end - 0.12)) / 0.12);
  ctx.save();
  ctx.font = font(size);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = size * 0.17; ctx.strokeStyle = '#0a0a0a'; ctx.fillStyle = '#fff';
  const space = ctx.measureText(' ').width;
  let wordIndex = 0;
  lines.forEach((line, lineIndex) => {
    const y = CAPTION_Y + (lineIndex - (lines.length - 1) / 2) * lineHeight;
    let x = (W - ctx.measureText(line).width) / 2;
    for (const word of line.split(' ')) {
      const wordStart = caption.words?.[wordIndex]?.start ?? caption.start + wordIndex * step;
      const appear = easeOut((time - wordStart) / 0.08);
      if (appear > 0) {
        ctx.globalAlpha = appear * exit;
        const lift = (1 - appear) * 18;
        ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 5;
        ctx.strokeText(word, x, y + lift);
        ctx.shadowColor = 'transparent';
        ctx.fillText(word, x, y + lift);
      }
      x += ctx.measureText(word).width + space;
      wordIndex++;
    }
  });
  ctx.restore();
}

/** End card over the blurred final shot: one action, then the account. */
function drawEndCard(ctx: Ctx, text: string, handle: string, time: number, timeline: Timeline) {
  if (!text.trim() || time < timeline.ctaStart) return;
  const enter = easeOut((time - timeline.ctaStart - 0.08) / 0.38);
  if (enter <= 0) return;
  const measure = measureAt(ctx);
  const { size, lines } = fitText(text.trim(), measure, TEXT_WIDTH, 3, [104, 92, 80, 68, 58]);
  const lineHeight = size * 1.16;
  const total = lines.length * lineHeight;
  const centre = H * 0.45;
  ctx.save();
  ctx.globalAlpha = enter;
  ctx.translate(0, (1 - enter) * 44);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.font = font(size);
  lines.forEach((line, index) => ctx.fillText(line, W / 2, centre - total / 2 + index * lineHeight + lineHeight / 2));
  const rule = 132 * easeOut((time - timeline.ctaStart - 0.25) / 0.4);
  ctx.fillRect(W / 2 - rule / 2, centre + total / 2 + 30, rule, 8);
  const name = handle.trim().replace(/^@+/, '');
  if (name) {
    ctx.globalAlpha = enter * 0.86;
    ctx.font = font(44, 600);
    ctx.fillText(`@${name}`, W / 2, centre + total / 2 + 108);
  }
  ctx.restore();
}

/** Draws the finished frame at `time`. `source` supplies the already-seeked footage frame for a segment. */
export function drawFrame(ctx: Ctx, time: number, timeline: Timeline, plan: EditPlan, handle: string, source: (segment: Segment) => FrameSource | null) {
  const segment = segmentAt(timeline, time);
  if (!segment) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); return; }
  drawFootage(ctx, source(segment), segment, time, timeline);
  drawHook(ctx, plan.hook, time, timeline.hookEnd);
  const caption = timeline.captions.find(item => time >= item.start && time < item.end);
  if (caption) drawCaption(ctx, caption, time);
  drawEndCard(ctx, plan.cta, handle, time, timeline);
}
