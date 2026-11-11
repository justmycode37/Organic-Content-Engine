import { CONTENT_BOTTOM, ease, prog, type Frame, type LayersProps, type SceneDef } from '../core.ts';
import { fitPixel, pixelHeight, pixelText, pixelWidth, text, textWidth } from '../prim.ts';

const LABEL_PX = 6;
const NOTE_SIZE = 30;

function pixelWrap(value: string, maxWidth: number, px = LABEL_PX): string[] {
  const clean = String(value ?? '').replaceAll('*', '').trim().replace(/\s+/g, ' ').toUpperCase();
  if (!clean) return [''];
  const lines: string[] = [];
  let line = '';
  for (const word of clean.split(' ')) {
    let parts = [word];
    if (pixelWidth(word, px) > maxWidth) {
      parts = [];
      let part = '';
      for (const char of Array.from(word)) {
        if (part && pixelWidth(part + char, px) > maxWidth) { parts.push(part); part = char; }
        else part += char;
      }
      if (part) parts.push(part);
    }
    for (const part of parts) {
      const candidate = line ? `${line} ${part}` : part;
      if (line && pixelWidth(candidate, px) > maxWidth) { lines.push(line); line = part; }
      else line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function measuredWrap(ctx: Frame['ctx'], value: string, maxWidth: number, size: number): string[] {
  const words = String(value ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const units: string[] = [];
  for (const word of words) {
    if (textWidth(ctx, word, size, 800) <= maxWidth) { units.push(word); continue; }
    let part = '';
    for (const char of Array.from(word)) {
      if (part && textWidth(ctx, part + char, size, 800) > maxWidth) { units.push(part); part = char; }
      else part += char;
    }
    if (part) units.push(part);
  }
  const lines: string[] = [];
  let line = '';
  for (const unit of units) {
    const candidate = line ? `${line} ${unit}` : unit;
    if (line && textWidth(ctx, candidate, size, 800) > maxWidth) { lines.push(line); line = unit; }
    else line = candidate;
  }
  if (line) lines.push(line);
  return lines;
}

function drawTopPattern(ctx: Frame['ctx'], theme: Frame['theme'], index: number, x: number, y: number, w: number, depth: number) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + depth, y); ctx.lineTo(x + depth + w, y); ctx.lineTo(x + w, y + depth); ctx.lineTo(x, y + depth); ctx.closePath();
  ctx.clip();
  ctx.globalAlpha *= 0.3;
  ctx.fillStyle = theme.dim;
  ctx.strokeStyle = theme.dim;
  ctx.lineWidth = 4;

  if (index % 4 === 0) {
    for (let xx = x + 12; xx < x + w + depth; xx += 32) {
      ctx.beginPath(); ctx.moveTo(xx, y - 2); ctx.lineTo(xx - depth, y + depth + 2); ctx.stroke();
    }
    for (let yy = y + 22; yy < y + depth; yy += 28) {
      ctx.beginPath(); ctx.moveTo(x - 4, yy); ctx.lineTo(x + w + depth + 4, yy); ctx.stroke();
    }
  } else if (index % 4 === 1) {
    for (let row = 0; row < 5; row++) for (let col = 0; col < 16; col++) {
      if ((row + col) % 2 === 0) ctx.fillRect(x + col * 34 + 8, y + row * 28 + 6, 16, 16);
    }
  } else if (index % 4 === 2) {
    ctx.save();
    ctx.translate(x + depth + w / 2, y + depth / 2);
    ctx.rotate(-Math.PI / 4);
    for (let offset = -320; offset <= 320; offset += 34) ctx.fillRect(-360, offset, 720, 14);
    ctx.restore();
  } else {
    for (let row = 0; row < 6; row++) for (let col = 0; col < 18; col++) {
      if ((row + col) % 2 === 0) ctx.fillRect(x + col * 28 + 4, y + row * 24 + 4, 28, 24);
    }
  }
  ctx.restore();
}

function drawFace(ctx: Frame['ctx'], points: [number, number][], fill: string, stroke: string) {
  ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = stroke; ctx.lineWidth = 4; ctx.lineJoin = 'miter'; ctx.stroke();
}

export const layersScene: SceneDef<LayersProps> = {
  type: 'layers',
  render(frame: Frame, props: LayersProps) {
    const { ctx, theme, t, dur } = frame;
    const layers = (props.layers ?? []).slice(0, 6);
    if (layers.length < 2) return;
    const n = layers.length;
    const accentIndex = layers.findIndex(layer => layer.accent);
    if (props.title) {
      const fitted = fitPixel(props.title.toUpperCase(), 888, 1, [10, 9, 8]);
      pixelText(ctx, fitted.lines[0] ?? '', 540, 252, fitted.px, { color: theme.fg, align: 'center' });
    }

    const baseX = 156, slabW = 460, faceDepth = 120, thickness = 28;
    const slabH = faceDepth + thickness;
    const explodedGap = n >= 5 ? 36 : 40;
    const contentTop = props.title ? 340 : 270;
    const contentBottom = CONTENT_BOTTOM - 16;
    const centerY = (contentTop + contentBottom) / 2;
    const collapsedPitch = slabH - 18;
    const explodedPitch = slabH + explodedGap;
    const spread = ease.outBack(prog(t, dur * 0.1, Math.min(0.48, dur * 0.24)));
    const collapsedHeight = slabH + (n - 1) * collapsedPitch;
    const explodedHeight = slabH + (n - 1) * explodedPitch;
    const collapsedTop = centerY - collapsedHeight / 2;
    const explodedTop = centerY - explodedHeight / 2;
    const calloutX = 768, calloutW = 216;
    const accentProgress = ease.outCubic(prog(t, dur * 0.56, Math.min(0.28, dur * 0.16)));
    const labelAlpha = ease.outExpo(prog(t, dur * 0.12, Math.min(0.28, dur * 0.16)));
    const callouts = layers.map((layer, i) => {
      const labelPad = i === accentIndex ? 8 : 0;
      let labelPx = LABEL_PX;
      let labelLines = pixelWrap(layer.label ?? '', calloutW - 24, labelPx);
      while (labelPx > 4 && (labelLines.length > 4 || labelLines.some(line => line.length === 1))) {
        labelPx--;
        labelLines = pixelWrap(layer.label ?? '', calloutW - 24, labelPx);
      }
      let noteSize = NOTE_SIZE;
      let noteLines = layer.note ? measuredWrap(ctx, layer.note, calloutW, noteSize) : [];
      while (noteLines.length > 2 && noteSize > 18) {
        noteSize -= 2;
        noteLines = measuredWrap(ctx, layer.note ?? '', calloutW, noteSize);
      }
      let labelH = labelLines.length * pixelHeight(labelPx) + Math.max(0, labelLines.length - 1) * 8;
      let noteH = noteLines.length ? noteLines.length * (noteSize + 6) : 0;
      let height = labelH + labelPad * 2 + (noteLines.length ? 4 + noteH : 0);
      const maxBlockHeight = Math.max(explodedPitch, (contentBottom - contentTop - 14 * (n - 1)) / n);
      while (height > maxBlockHeight && (noteSize > 18 || labelPx > 4)) {
        if (noteSize > 18) {
          noteSize -= 2;
          noteLines = measuredWrap(ctx, layer.note ?? '', calloutW, noteSize);
          noteH = noteLines.length ? noteLines.length * (noteSize + 6) : 0;
        } else if (labelPx > 4) {
          labelPx--;
          labelLines = pixelWrap(layer.label ?? '', calloutW - 24, labelPx);
          labelH = labelLines.length * pixelHeight(labelPx) + Math.max(0, labelLines.length - 1) * 8;
        }
        height = labelH + labelPad * 2 + (noteLines.length ? 4 + noteH : 0);
      }
      return { labelPad, labelPx, labelLines, labelH, noteSize, noteLines, noteH, height };
    });
    const repackCallouts = callouts.some(callout => callout.height > explodedPitch);
    let packedCenters: number[] | undefined;
    if (repackCallouts) {
      const packedHeight = callouts.reduce((sum, callout) => sum + callout.height, 0) + 14 * (n - 1);
      let cursor = (contentTop + contentBottom - packedHeight) / 2;
      packedCenters = callouts.map(callout => {
        const center = cursor + callout.height / 2;
        cursor += callout.height + 14;
        return center;
      });
    }

    // Paint the lower plates first so the collapsed stack has clear depth order.
    for (let i = n - 1; i >= 0; i--) {
      const layer = layers[i]!;
      const callout = callouts[i]!;
      const yCollapsed = collapsedTop + i * collapsedPitch;
      const yExploded = explodedTop + i * explodedPitch;
      const y = yCollapsed + (yExploded - yCollapsed) * spread;
      const isAccent = i === accentIndex && t >= dur * 0.56;
      const slide = isAccent ? -60 * accentProgress : 0;
      const x = baseX + slide;
      const mid = y + slabH / 2;
      const stroke = isAccent ? theme.accent : theme.fg;
      const alpha = ease.outExpo(prog(t, i * Math.min(0.07, dur * 0.035), Math.min(0.24, dur * 0.18)));

      ctx.save();
      ctx.globalAlpha *= alpha;
      ctx.translate(0, Math.sin(t * 2.4 + i) * 1.1);

      drawFace(ctx, [
        [x, y + faceDepth], [x + slabW, y + faceDepth],
        [x + slabW, y + slabH], [x, y + slabH],
      ], theme.panelAlt, stroke);
      drawFace(ctx, [
        [x + slabW, y + faceDepth], [x + slabW + faceDepth, y],
        [x + slabW + faceDepth, y + thickness], [x + slabW, y + slabH],
      ], theme.panelAlt, stroke);
      drawFace(ctx, [
        [x + faceDepth, y], [x + faceDepth + slabW, y],
        [x + slabW, y + faceDepth], [x, y + faceDepth],
      ], theme.panel, stroke);
      drawTopPattern(ctx, theme, i, x, y, slabW, faceDepth);
      // Re-stroke the top edge over the pattern to keep the 4 px silhouette crisp.
      ctx.beginPath();
      ctx.moveTo(x + faceDepth, y); ctx.lineTo(x + faceDepth + slabW, y);
      ctx.lineTo(x + slabW, y + faceDepth); ctx.lineTo(x, y + faceDepth); ctx.closePath();
      ctx.strokeStyle = stroke; ctx.lineWidth = 4; ctx.stroke();

      if (isAccent) {
        const scan = ((Math.max(0, t - dur * 0.62) * 1.35) % 1) * (slabW - 16);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x + faceDepth, y); ctx.lineTo(x + faceDepth + slabW, y);
        ctx.lineTo(x + slabW, y + faceDepth); ctx.lineTo(x, y + faceDepth); ctx.closePath();
        ctx.clip();
        ctx.fillStyle = theme.accent;
        ctx.globalAlpha *= 0.9;
        ctx.fillRect(x + faceDepth + scan - 8, y, 16, faceDepth);
        ctx.restore();
        // Refresh the accent outline above the moving scan.
        ctx.beginPath();
        ctx.moveTo(x + faceDepth, y); ctx.lineTo(x + faceDepth + slabW, y);
        ctx.lineTo(x + slabW, y + faceDepth); ctx.lineTo(x, y + faceDepth); ctx.closePath();
        ctx.strokeStyle = theme.accent; ctx.lineWidth = 4; ctx.stroke();
      }

      const labelCenter = packedCenters?.[i] ?? mid;
      const labelTop = labelCenter - callout.height / 2 + callout.labelPad;
      const longestLine = Math.max(0, ...callout.labelLines.map(line => pixelWidth(line, callout.labelPx)));

      // A stepped leader ties each slab to its own measured label block.
      const edgeX = x + slabW + faceDepth;
      const elbowX = calloutX - 24;
      ctx.globalAlpha *= labelAlpha;
      ctx.strokeStyle = isAccent ? theme.accent : theme.fg;
      ctx.lineWidth = 8; ctx.lineJoin = 'miter'; ctx.lineCap = 'square';
      ctx.beginPath();
      ctx.moveTo(edgeX, y + faceDepth / 2);
      ctx.lineTo(elbowX, y + faceDepth / 2);
      ctx.lineTo(elbowX, labelCenter);
      ctx.lineTo(calloutX - 12, labelCenter);
      ctx.stroke();
      ctx.fillStyle = isAccent ? theme.accent : theme.fg;
      ctx.fillRect(edgeX - 6, y + faceDepth / 2 - 6, 12, 12);
      ctx.fillRect(calloutX - 18, labelCenter - 6, 12, 12);

      if (isAccent) {
        ctx.fillStyle = theme.accent;
        ctx.fillRect(calloutX - 6, labelTop - 8, Math.min(calloutW, longestLine + 14), callout.labelH + 16);
      }
      callout.labelLines.forEach((line, row) => pixelText(ctx, line, calloutX, labelTop + row * (pixelHeight(callout.labelPx) + 8), callout.labelPx, {
        color: isAccent ? theme.onAccent : theme.fg,
      }));
      if (callout.noteLines.length) {
        const noteTop = labelTop + callout.labelH + callout.labelPad * 2 + 4;
        callout.noteLines.forEach((line, row) => text(ctx, line, calloutX, noteTop + callout.noteSize + row * (callout.noteSize + 6), {
          size: callout.noteSize, color: theme.dim, weight: 800,
        }));
      }
      ctx.restore();
    }
  },
};
