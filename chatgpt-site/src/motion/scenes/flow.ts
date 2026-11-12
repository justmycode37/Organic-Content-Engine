import { clamp, ease, lerp, prog, type Frame, type FlowProps, type SceneDef } from '../core.ts';
import { panel, pixelArrow, pixelHeight, pixelText, pixelWidth, tag, text, textWidth } from '../prim.ts';
import { icon } from '../icons.ts';

const LABEL_PX = 7;
const NOTE_SIZE = 30;
const NOTE_LEADING = 36;

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

function measuredWrap(ctx: Frame['ctx'], value: string, maxWidth: number, size = NOTE_SIZE): string[] {
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

function noteLayout(ctx: Frame['ctx'], value: string | undefined, width: number) {
  let size = NOTE_SIZE;
  let lines = measuredWrap(ctx, value ?? '', width, size);
  // Keep pathological input readable and bounded while retaining 30 px for normal copy.
  while (lines.length > 3 && size > 22) {
    size -= 2;
    lines = measuredWrap(ctx, value ?? '', width, size);
  }
  return { size, lines, height: lines.length ? lines.length * (size + 6) : 0 };
}

export const flowScene: SceneDef<FlowProps> = {
  type: 'flow',
  render(frame: Frame, props: FlowProps) {
    const { ctx, theme, t, dur } = frame;
    const nodes = (props.nodes ?? []).slice(0, 5);
    if (nodes.length < 2) return;

    const n = nodes.length;
    const down = props.direction !== 'right' || n > 3;
    const looping = !!props.loop && down;
    const cardW = down ? 744 : n === 2 ? 380 : 272;
    const rightGap = n === 2 ? 100 : 32;
    const hasPacket = !!props.packet;
    const layouts = nodes.map(node => {
      const labelOffset = down ? (node.icon ? 144 : 44) : 0;
      const rightReserve = down ? (hasPacket ? 112 : 48) : 20;
      const textW = Math.max(100, cardW - labelOffset - rightReserve);
      const labelLines = pixelWrap(node.label ?? '', textW, LABEL_PX);
      const labelHeight = labelLines.length * pixelHeight(LABEL_PX) + Math.max(0, labelLines.length - 1) * 8;
      const note = noteLayout(ctx, node.note, textW);
      const stackHeight = labelHeight + (note.lines.length ? 10 + note.height : 0);
      return { labelLines, labelHeight, note, stackHeight, textW, labelOffset };
    });
    const maxStack = Math.max(...layouts.map(layout => layout.stackHeight));
    const cardHeights = down
      ? layouts.map(layout => Math.max(152, layout.stackHeight + (hasPacket ? 58 : 44)))
      : nodes.map(() => Math.max(216, maxStack + 72 + (nodes.some(node => node.icon) ? 24 : 0)));
    const centers = down
      ? (() => {
          const availableTop = 270, availableBottom = 1218;
          const availableHeight = availableBottom - availableTop;
          const heights = cardHeights;
          const usedHeight = heights.reduce((sum, height) => sum + height, 0);
          const maxGap = (availableHeight - usedHeight) / (n - 1);
          const desiredGap = n === 2 ? 260 : n === 3 ? 178 : n === 4 ? 108 : 43;
          const gap = Math.max(8, Math.min(desiredGap, maxGap));
          const groupHeight = usedHeight + gap * (n - 1);
          let cursor = (availableTop + availableBottom - groupHeight) / 2;
          return nodes.map((_, i) => {
            const center = cursor + heights[i]! / 2;
            cursor += heights[i]! + gap;
            return { x: 540, y: center };
          });
        })()
      : (() => {
          const totalW = n * cardW + (n - 1) * rightGap;
          const firstX = 540 - totalW / 2 + cardW / 2;
          return nodes.map((_, i) => ({ x: firstX + i * (cardW + rightGap), y: 740 }));
        })();

    const start = dur * 0.12;
    // Declared events (or camera hits) move the packet one hop per beat; otherwise it travels on a timer.
    const beats = (frame.events?.length ? frame.events.map(event => event.at) : frame.hits ?? []).slice(0, n - 1);
    const eventDriven = !looping && beats.length > 0;
    const travelStart = eventDriven ? 0 : dur * 0.2;
    const travelEnd = dur * 0.82;
    const cycleSpan = Math.max(0.2, travelEnd - travelStart);
    const travel = Math.max(0, (t - travelStart) / cycleSpan);
    const hop = beats.filter(at => t >= at).length;
    const cycle = eventDriven
      ? Math.max(0, hop - 1) + (hop ? ease.outCubic(prog(t, beats[hop - 1]!, 0.3)) : 0)
      : looping ? travel * n : clamp(travel) * (n - 1);
    const active = Math.floor(cycle) % n;
    const phase = eventDriven ? cycle - Math.floor(cycle) : !looping && travel >= 1 ? 1 : cycle - Math.floor(cycle);
    const accentIndex = nodes.findIndex(node => node.accent);

    // Main connectors sit entirely in the gaps and use the shared stepped arrow head.
    for (let i = 0; i < n - 1; i++) {
      const a = centers[i]!, b = centers[i + 1]!;
      if (down) {
        pixelArrow(ctx, 540, a.y + cardHeights[i]! / 2 + 8, 540, b.y - cardHeights[i + 1]! / 2 - 8,
          theme.dim, prog(t, start + i * dur * 0.045, Math.min(0.24, dur * 0.18)), 8);
      } else {
        pixelArrow(ctx, a.x + cardW / 2 + 8, a.y, b.x - cardW / 2 - 8, b.y,
          theme.dim, prog(t, start + i * dur * 0.045, Math.min(0.24, dur * 0.18)), 8);
      }
    }

    // A left-side return path makes the loop read as one continuous circuit.
    if (looping && t > dur * 0.42) {
      const routeX = 112;
      const topY = centers[0]!.y;
      const lowY = centers[n - 1]!.y;
      const left = centers[0]!.x - cardW / 2 - 12;
      const returnProgress = prog(t, dur * 0.42, Math.min(0.3, dur * 0.16));
      ctx.fillStyle = theme.dim;
      ctx.fillRect(routeX - 4, topY, 8, lowY - topY);
      pixelArrow(ctx, left, lowY, routeX, lowY, theme.dim, returnProgress, 8);
      pixelArrow(ctx, routeX, lowY, routeX, topY, theme.dim, returnProgress, 8);
      pixelArrow(ctx, routeX, topY, left, topY, theme.dim, returnProgress, 8);
    }

    nodes.forEach((node, i) => {
      const c = centers[i]!;
      const layout = layouts[i]!;
      const nodeH = cardHeights[i]!;
      const entered = ease.outBack(prog(t, i * Math.min(0.07, dur * 0.035), Math.min(0.28, dur * 0.22)));
      const on = t >= travelStart && active === i;
      const accented = i === accentIndex && t >= dur * 0.58;
      const kick = on ? 1 + 0.12 * Math.exp(-16 * phase) * Math.cos(22 * phase) : 1;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.scale(Math.max(0.01, entered * kick), Math.max(0.01, entered * kick));
      const x = -cardW / 2, y = -nodeH / 2;
      panel(ctx, x, y, cardW, nodeH, {
        fill: on && !accented ? theme.panelAlt : theme.panel,
        stroke: accented ? theme.accent : on ? theme.fg : theme.line,
        lineWidth: accented ? 8 : 4,
        notch: 18,
      });
      if (accented) {
        ctx.fillStyle = theme.accent;
        ctx.fillRect(x, y, 24, 24);
        ctx.fillRect(x + cardW - 24, y + nodeH - 24, 24, 24);
      }

      if (down) {
        if (node.icon) icon(ctx, node.icon, x + 76, 0, 6, accented ? theme.accent : theme.fg);
        const textX = x + layout.labelOffset;
        let top = -layout.stackHeight / 2;
        if (hasPacket) top += 4;
        layout.labelLines.forEach((line, row) => pixelText(ctx, line, textX, top + row * (pixelHeight(LABEL_PX) + 8), LABEL_PX, { color: theme.fg }));
        if (layout.note.lines.length) {
          const noteTop = top + layout.labelHeight + 10;
          layout.note.lines.forEach((line, row) => text(ctx, line, textX, noteTop + layout.note.size + row * (layout.note.size + 6), {
            size: layout.note.size, color: theme.dim, weight: 800,
          }));
        }
      } else {
        const iconHeight = nodes.some(item => item.icon) ? 72 : 0;
        if (node.icon) icon(ctx, node.icon, 0, y + 42, 4, accented ? theme.accent : theme.fg);
        const top = iconHeight ? -nodeH / 2 + iconHeight + 14 : -layout.stackHeight / 2;
        layout.labelLines.forEach((line, row) => pixelText(ctx, line, 0, top + row * (pixelHeight(LABEL_PX) + 8), LABEL_PX, { color: theme.fg, align: 'center' }));
        if (layout.note.lines.length) {
          const noteTop = top + layout.labelHeight + 10;
          layout.note.lines.forEach((line, row) => text(ctx, line, 0, noteTop + layout.note.size + row * (layout.note.size + 6), {
            size: layout.note.size, color: theme.dim, weight: 800, align: 'center',
          }));
        }
      }

      if (props.packet && on) {
        const tagX = down ? x + cardW - 38 : x + cardW - 96;
        const tagY = down ? y - 20 : y + 6;
        tag(ctx, props.packet, tagX, tagY, 4,
          { bg: accented ? theme.accent : theme.fg, fg: accented ? theme.onAccent : theme.bg });
      }
      ctx.restore();
    });

    if (t > travelStart) {
      const from = active;
      const to = (active + 1) % n;
      const f = ease.inOutCubic(phase);
      let px = 0, py = 0;
      if (from < n - 1) {
        const a = centers[from]!, b = centers[to]!;
        if (down) {
          px = 540;
          py = lerp(a.y + cardHeights[from]! / 2 + 8, b.y - cardHeights[to]! / 2 - 8, f);
        } else {
          px = lerp(a.x + cardW / 2 + 8, b.x - cardW / 2 - 8, f);
          py = 740;
        }
        ctx.fillStyle = theme.accent;
        ctx.fillRect(px - 8, py - 8, 16, 16);
      } else if (looping) {
        const routeX = 112, left = centers[0]!.x - cardW / 2 - 12;
        const topY = centers[0]!.y, lowY = centers[n - 1]!.y;
        if (f < 1 / 3) { px = lerp(left, routeX, f * 3); py = lowY; }
        else if (f < 2 / 3) { px = routeX; py = lerp(lowY, topY, (f - 1 / 3) * 3); }
        else { px = lerp(routeX, left, (f - 2 / 3) * 3); py = topY; }
        ctx.fillStyle = theme.accent;
        ctx.fillRect(px - 8, py - 8, 16, 16);
      }
    }
  },
};
