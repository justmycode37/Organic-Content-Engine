import { CONTENT_BOTTOM, SAFE, type Cue, type Frame, type ListProps, type SceneDef, clamp, ease, parseMarkup, prog, stripMarkup } from '../core.ts';
import { bitmap, fitPixel, panel, pixelBlock, pixelHeight, pixelLines, pixelText, pixelWidth } from '../prim.ts';
import { dither } from '../pix.ts';

const CHECK = ['00000000', '00000001', '00000011', '00000110', '10001100', '11111000', '01110000', '00100000'];
const CROSS = ['10000001', '01000010', '00100100', '00011000', '00011000', '00100100', '01000010', '10000001'];
const ARROW = ['00010000', '00011000', '11111111', '11111111', '11111111', '00011000', '00010000', '00000000'];

type EntryTiming = { order: number[]; start: number; stagger: number; length: number; payoff: number };

function listItems(props: ListProps): string[] {
  return (Array.isArray(props.items) ? props.items : [])
    .slice(0, 5)
    .map(value => String(value ?? '').trim().slice(0, 360))
    .filter(Boolean);
}

function markedIndex(items: string[]): number {
  return items.findIndex(item => parseMarkup(item).some(span => span.accent && span.text.trim()));
}

/** Keep the highlighted row for the last landing, wherever it appears in the input. */
function entryTiming(items: string[], dur: number): EntryTiming {
  const marked = markedIndex(items);
  const order = items.map((_, index) => index).filter(index => index !== marked);
  if (marked >= 0) order.push(marked);
  const start = Math.min(0.08, dur * 0.045);
  const stagger = Math.min(0.1, Math.max(0.04, dur * 0.06));
  const length = Math.min(0.26, Math.max(0.16, dur * 0.1));
  const payoff = marked < 0 ? -1 : start + Math.max(0, order.length - 1) * stagger + length;
  return { order, start, stagger, length, payoff };
}

function rowHeight(count: number): number {
  const spread = count <= 1 ? 220 : count === 2 ? 520 : count === 3 ? 720 : count === 4 ? 860 : 900;
  return (spread - Math.max(0, count - 1) * 14) / count;
}

function fitRow(value: string, width: number, height: number) {
  for (const px of [16, 14, 12]) {
    const fit = fitPixel(value, width, 2, [px]);
    if (fit.lines.length <= 2
      && fit.lines.length * pixelHeight(px) <= height
      && fit.lines.every(line => pixelWidth(stripMarkup(line), px) <= width)) return fit;
  }

  const px = 12;
  const lines = pixelLines(value, px, width);
  const maxLines = Math.max(1, Math.floor(height / pixelHeight(px)));
  if (lines.length <= maxLines) return { px, lines };

  const visible = lines.slice(0, maxLines);
  const spans = parseMarkup(visible[1] ?? '');
  const chars = spans.flatMap(span => [...span.text].map(char => ({ char, accent: span.accent })));
  let chosen: typeof chars = [];
  for (const piece of chars) {
    const candidate = [...chosen, piece].map(item => item.char).join('') + '…';
    if (pixelWidth(candidate, px) > width) break;
    chosen.push(piece);
  }
  const clipped = chosen.reduce((out, item, index) => {
    const prev = chosen[index - 1];
    if (index === 0 || prev?.accent !== item.accent) out += item.accent ? '*' : (prev?.accent ? '*' : '');
    return out + item.char;
  }, '');
  visible[1] = `${clipped}${clipped.endsWith('*') ? '' : ''}…`;
  if (visible[1].includes('*') && (visible[1].match(/\*/g)?.length ?? 0) % 2) visible[1] += '*';
  return { px, lines: visible };
}

function drawMarker(
  ctx: Frame['ctx'],
  theme: Frame['theme'],
  x: number,
  y: number,
  size: number,
  label: string,
  style: NonNullable<ListProps['style']>,
  active: boolean,
) {
  const face = active ? theme.accent : theme.panelAlt;
  const glyphColor = active ? theme.onAccent : theme.fg;
  const inset = 12;

  ctx.fillStyle = theme.line;
  ctx.fillRect(x + 8, y + 8, size, size);
  panel(ctx, x, y, size, size, { fill: face, stroke: theme.fg, lineWidth: 4, notch: 12 });
  ctx.fillStyle = theme.dim;
  ctx.fillRect(x + 12, y + 12, size - 24, 4);
  ctx.fillRect(x + 12, y + 12, 4, size - 24);
  ctx.fillStyle = theme.line;
  ctx.fillRect(x + size - 16, y + 16, 4, size - 32);
  ctx.fillRect(x + 16, y + size - 16, size - 32, 4);
  dither(ctx, x + inset, y + inset, size - inset * 2, size - inset * 2, theme.fg, (u, v) => 0.035 + (1 - v) * 0.12, 4);

  const glyphSize = size - 48;
  const glyphX = x + (size - glyphSize) / 2;
  const glyphY = y + (size - glyphSize) / 2;
  if (style === 'check' || style === 'cross' || style === 'arrow') {
    const rows = style === 'check' ? CHECK : style === 'cross' ? CROSS : ARROW;
    bitmap(ctx, rows, glyphX, glyphY, glyphSize / 8, glyphColor);
  } else {
    const number = label.padStart(2, '0');
    const px = 12;
    pixelText(ctx, number, x + size / 2, y + (size - pixelHeight(px)) / 2, px, { color: glyphColor, align: 'center' });
  }
}

export const listScene: SceneDef<ListProps> = {
  type: 'list',
  cues(props, dur) {
    const items = listItems(props);
    if (!items.length || dur <= 0) return [];
    const timing = entryTiming(items, dur);
    const cues: Cue[] = timing.order.map((_, sequenceIndex) => ({
      t: timing.start + sequenceIndex * timing.stagger,
      kind: 'pop',
      step: timing.order.length > 1 ? sequenceIndex / (timing.order.length - 1) : 0,
    }));
    if (timing.payoff >= 0) {
      cues.push({ t: timing.payoff, kind: 'impact' });
      cues.push({ t: Math.min(dur - 0.005, timing.payoff + 0.045), kind: 'shimmer' });
    }
    return cues.filter(cue => cue.t >= 0 && cue.t < dur);
  },
  render(frame: Frame, props: ListProps) {
    const { ctx, theme, t, dur, seed } = frame;
    const items = listItems(props);
    if (!items.length) return;

    const timing = entryTiming(items, dur);
    const title = String(props.title ?? '').trim().slice(0, 120);
    const count = items.length;
    const rowH = rowHeight(count);
    const spread = rowH * count + (count - 1) * 14;
    const top = Math.round(740 - spread / 2);
    const markerSize = Math.min(144, Math.floor(rowH - 20));
    const markerX = SAFE.x + 18;
    const textX = markerX + markerSize + 34;
    const textWidth = SAFE.right - textX - 22;
    const layouts = items.map(item => fitRow(item, textWidth, rowH));
    const positions = new Map(timing.order.map((itemIndex, sequenceIndex) => [itemIndex, sequenceIndex]));

    if (title) {
      const label = fitPixel(title.toUpperCase(), SAFE.w - 24, 1, [7, 6]);
      pixelText(ctx, label.lines[0] ?? '', SAFE.x + 18, Math.max(SAFE.y + 8, top - 48), label.px, { color: theme.dim });
    }

    items.forEach((item, index) => {
      const sequenceIndex = positions.get(index) ?? index;
      const start = timing.start + sequenceIndex * timing.stagger;
      const p = prog(t, start, timing.length);
      if (p <= 0) return;

      const y = top + index * (rowH + 14);
      const marked = index === markedIndex(items);
      const eased = ease.outBack(p);
      const direction = index % 2 === 0 ? -1 : 1;
      const offset = direction * (1 - eased) * 870;
      const scale = marked ? 0.93 + 0.07 * eased : 0.98 + 0.02 * eased;
      const alpha = ease.outExpo(clamp(p * 3.4));
      const centerY = y + rowH / 2;

      ctx.save();
      ctx.beginPath();
      ctx.rect(SAFE.x, SAFE.y, SAFE.w, CONTENT_BOTTOM - SAFE.y);
      ctx.clip();
      ctx.globalAlpha *= alpha;
      ctx.translate(SAFE.cx + offset, centerY);
      ctx.scale(scale, scale);
      ctx.translate(-SAFE.cx, -centerY);

      panel(ctx, SAFE.x, y, SAFE.w, rowH, { fill: theme.panel, stroke: theme.line, lineWidth: 4, notch: 12 });
      ctx.fillStyle = theme.panelAlt;
      ctx.fillRect(SAFE.x + 16, y + 14, SAFE.w - 32, 4);
      ctx.fillStyle = theme.line;
      ctx.fillRect(SAFE.x + 16, y + rowH - 18, SAFE.w - 32, 4);

      const markerY = Math.round(centerY - markerSize / 2);
      drawMarker(ctx, theme, markerX, markerY, markerSize, String(index + 1), props.style ?? 'number', marked);

      const layout = layouts[index]!;
      const lineGap = layout.px >= 16 ? 4 : 0;
      const blockH = layout.lines.length * pixelHeight(layout.px) + Math.max(0, layout.lines.length - 1) * lineGap;
      const textY = centerY - blockH / 2;
      pixelBlock(ctx, layout.lines, textX, textY, layout.px, {
        color: theme.fg,
        accent: theme.accent,
        align: 'left',
        reveal: ease.outExpo(p),
        mode: 'type',
        seed: seed + index * 19,
        gap: lineGap,
        stagger: 0,
      });
      ctx.restore();
    });
  },
};
