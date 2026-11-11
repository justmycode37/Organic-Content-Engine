import { SAFE, type Cue, type Frame, type ChangelogProps, type SceneDef, clamp, ease, prog, stripMarkup } from '../core.ts';
import { panel, pixelText, pixelWidth, text, textWidth } from '../prim.ts';
import { dither } from '../pix.ts';

type ChangeItem = ChangelogProps['items'][number];
type Timing = { card: number; rowStart: number; stagger: number; length: number; sweep: number };

const TAG_STYLE: Record<ChangeItem['tag'], { fill: 'fg' | 'panelAlt' | 'panel'; strike?: boolean }> = {
  NEW: { fill: 'fg' },
  FIX: { fill: 'panel' },
  CHG: { fill: 'panelAlt' },
  DEL: { fill: 'panel', strike: true },
};

function itemsOf(props: ChangelogProps): ChangeItem[] {
  return (Array.isArray(props.items) ? props.items : [])
    .slice(0, 6)
    .filter((item): item is ChangeItem => !!item && !!String(item.text ?? '').trim());
}

function timingFor(dur: number): Timing {
  const card = Math.min(0.3, Math.max(0.16, dur * 0.16));
  return {
    card,
    rowStart: card + Math.min(0.06, dur * 0.04),
    stagger: Math.min(0.09, Math.max(0.045, dur * 0.055)),
    length: Math.min(0.25, Math.max(0.16, dur * 0.09)),
    sweep: Math.min(0.42, Math.max(0.24, dur * 0.14)),
  };
}

function fitPixelLine(value: string, width: number, px: number): string {
  const source = String(value ?? '').toUpperCase().replace(/\s+/g, ' ').trim();
  if (pixelWidth(source, px) <= width) return source;
  const chars = [...source];
  while (chars.length && pixelWidth(`${chars.join('')}…`, px) > width) chars.pop();
  return chars.length ? `${chars.join('')}…` : '';
}

function fitVersion(value: string, width: number): { text: string; px: number } {
  const source = String(value ?? '').toUpperCase().replace(/\s+/g, ' ').trim();
  for (const px of [22, 20, 18, 16, 14, 12]) {
    if (pixelWidth(source, px) <= width) return { text: source, px };
  }
  const px = 12;
  return { text: fitPixelLine(source, width, px), px };
}

function splitLongWord(ctx: Frame['ctx'], word: string, width: number, size: number): string[] {
  const chunks: string[] = [];
  let chunk = '';
  for (const char of [...word]) {
    if (chunk && textWidth(ctx, chunk + char, size, 800) > width) {
      chunks.push(chunk);
      chunk = char;
    } else chunk += char;
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

function wrapTwoLines(ctx: Frame['ctx'], value: string, width: number, size: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of String(value ?? '').trim().split(/\s+/).filter(Boolean)) {
    const chunks = splitLongWord(ctx, word, width, size);
    chunks.forEach((chunk, index) => {
      const candidate = line ? `${line}${index === 0 ? ' ' : ''}${chunk}` : chunk;
      if (line && textWidth(ctx, candidate, size, 800) > width) {
        lines.push(line);
        line = chunk;
      } else line = candidate;
    });
  }
  if (line) lines.push(line);
  if (lines.length > 2) {
    lines.length = 2;
    let last = lines[1] ?? '';
    while (last && textWidth(ctx, `${last}…`, size, 800) > width) last = [...last].slice(0, -1).join('');
    lines[1] = `${last}…`;
  }
  return lines;
}

function drawTag(ctx: Frame['ctx'], theme: Frame['theme'], label: string, x: number, y: number, w: number, h: number, reveal: number) {
  const style = TAG_STYLE[label as ChangeItem['tag']] ?? TAG_STYLE.CHG;
  const fill = style.fill === 'fg' ? theme.fg : style.fill === 'panelAlt' ? theme.panelAlt : theme.panel;
  const ink = style.fill === 'fg' ? theme.bg : theme.fg;

  ctx.save();
  ctx.globalAlpha *= ease.outExpo(reveal);
  ctx.fillStyle = theme.line;
  ctx.fillRect(x + 8, y + 8, w, h);
  panel(ctx, x, y, w, h, { fill, stroke: theme.dim, lineWidth: 4, notch: 10 });
  ctx.fillStyle = theme.dim;
  ctx.fillRect(x + 10, y + 10, w - 20, 4);
  ctx.fillRect(x + 10, y + 10, 4, h - 20);
  ctx.fillStyle = theme.line;
  ctx.fillRect(x + w - 14, y + 14, 4, h - 28);
  ctx.fillRect(x + 14, y + h - 14, w - 28, 4);
  dither(ctx, x + 12, y + 12, w - 24, h - 24, theme.dim, (u, v) => 0.035 + (1 - v) * 0.12, 4);
  pixelText(ctx, label, x + w / 2, y + (h - 49) / 2, 7, { color: ink, align: 'center', reveal, mode: 'type' });
  if (style.strike) {
    ctx.fillStyle = theme.fg;
    ctx.fillRect(x + 18, y + Math.floor(h / 2) - 2, w - 36, 4);
  }
  ctx.restore();
}

function sweepFrame(ctx: Frame['ctx'], theme: Frame['theme'], x: number, y: number, w: number, h: number, progress: number) {
  const p = clamp(progress);
  const thickness = 8;
  const perimeter = 2 * (w + h);
  // The frame is traced clockwise, then the remaining left edge closes the sweep.
  ctx.fillStyle = theme.accent;
  const top = Math.min(w, perimeter * p);
  ctx.fillRect(x, y, top, thickness);
  let rest = Math.max(0, perimeter * p - w);
  const right = Math.min(h, rest);
  ctx.fillRect(x + w - thickness, y, thickness, right);
  rest -= right;
  const bottom = Math.min(w, rest);
  ctx.fillRect(x + w - bottom, y + h - thickness, bottom, thickness);
  rest -= bottom;
  if (rest > 0) ctx.fillRect(x, y + h - rest, thickness, rest);
  if (p >= 1) {
    // A quiet complete frame remains after the moving rainbow edge lands.
    ctx.fillRect(x, y, w, thickness);
    ctx.fillRect(x, y + h - thickness, w, thickness);
    ctx.fillRect(x, y, thickness, h);
    ctx.fillRect(x + w - thickness, y, thickness, h);
  }
}

export const changelogScene: SceneDef<ChangelogProps> = {
  type: 'changelog',
  cues(props, dur) {
    if (dur <= 0) return [];
    const items = itemsOf(props);
    const timing = timingFor(dur);
    const cues: Cue[] = [{ t: 0, kind: 'rise', len: timing.card }];
    items.forEach((_, index) => {
      cues.push({
        t: timing.rowStart + index * timing.stagger,
        kind: 'pop',
        step: items.length > 1 ? index / (items.length - 1) : 0,
      });
    });
    const accentIndex = items.findIndex(item => !!item.accent);
    if (accentIndex >= 0) {
      const landing = timing.rowStart + accentIndex * timing.stagger + timing.length * 0.35 + timing.sweep;
      if (landing < dur) {
        cues.push({ t: landing, kind: 'impact' });
        if (landing + 0.04 < dur) cues.push({ t: landing + 0.04, kind: 'shimmer' });
      }
    }
    return cues.filter(cue => cue.t >= 0 && cue.t < dur).slice(0, 40);
  },
  render(frame: Frame, props: ChangelogProps) {
    const { ctx, theme, t, dur, seed } = frame;
    const items = itemsOf(props);
    const timing = timingFor(dur);
    const count = items.length;
    const x = SAFE.x;
    const w = SAFE.w;
    const gap = count >= 6 ? 6 : count >= 4 ? 10 : count >= 2 ? 14 : 0;
    const rowH = count >= 6 ? 104 : count === 5 ? 126 : count === 4 ? 155 : count === 3 ? 190 : count === 2 ? 220 : 196;
    const headerBottom = 260;
    const panelH = headerBottom + count * rowH + Math.max(0, count - 1) * gap + 24;
    const y = Math.round(740 - panelH / 2);
    const rowsTop = y + headerBottom;
    const product = String(props.product ?? 'PATCH NOTES').trim().toUpperCase().slice(0, 24) || 'PATCH NOTES';
    const version = String(props.version ?? 'V1.0').trim().toUpperCase().slice(0, 48) || 'V1.0';
    const productLine = fitPixelLine(product, w - 96, 6);
    const versionFit = fitVersion(version, w - 96);
    const cardProgress = ease.outExpo(prog(t, 0, timing.card));
    const entranceRows = items.map((item, index) => ({ item, index }));

    if (cardProgress > 0) {
      ctx.save();
      const visibleW = w * cardProgress;
      ctx.beginPath();
      ctx.rect(SAFE.cx - visibleW / 2, y, visibleW, panelH);
      ctx.clip();
      panel(ctx, x, y, w, panelH, { fill: theme.panel, stroke: theme.line, lineWidth: 4, notch: 28 });
      ctx.fillStyle = theme.panelAlt;
      ctx.fillRect(x + 18, y + 16, w - 36, 4);
      ctx.fillStyle = theme.line;
      ctx.fillRect(x + 32, y + 244, w - 64, 4);
      pixelText(ctx, productLine, x + 40, y + 22, 6, { color: theme.dim, reveal: cardProgress, mode: 'type' });
      pixelText(ctx, versionFit.text, x + 40, y + 68, versionFit.px, { color: theme.fg, reveal: cardProgress, mode: 'blocks', seed });
      ctx.restore();
    }

    entranceRows.forEach(({ item, index }) => {
      const start = timing.rowStart + index * timing.stagger;
      const raw = prog(t, start, timing.length);
      if (raw <= 0) return;
      const p = ease.outBack(raw);
      const rowY = rowsTop + index * (rowH + gap);
      const centerY = rowY + rowH / 2;
      const accented = !!item.accent;
      const offset = (index % 2 === 0 ? -1 : 1) * (1 - p) * 42;
      const scale = 0.94 + 0.06 * p;
      const textSize = 46;
      const textX = x + 238;
      const textRight = x + w - 40;
      const lines = wrapTwoLines(ctx, stripMarkup(String(item.text ?? '').slice(0, 500)), textRight - textX, textSize);
      const lineGap = 50;
      const firstBaseline = centerY - ((lines.length - 1) * lineGap) / 2 + 16;

      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, panelH);
      ctx.clip();
      ctx.globalAlpha *= ease.outExpo(raw * 3.2);
      ctx.translate(SAFE.cx + offset, centerY);
      ctx.scale(scale, scale);
      ctx.translate(-SAFE.cx, -centerY);

      if (index > 0) {
        ctx.fillStyle = theme.line;
        ctx.fillRect(x + 32, rowY - gap / 2 - 1, w - 64, 2);
      }
      const tagW = 158;
      const tagH = Math.min(84, rowH - 16);
      drawTag(ctx, theme, item.tag in TAG_STYLE ? item.tag : 'CHG', x + 32, Math.round(centerY - tagH / 2), tagW, tagH, ease.outExpo(raw));
      lines.forEach((line, lineIndex) => {
        text(ctx, line, textX, firstBaseline + lineIndex * lineGap, {
          size: textSize,
          color: theme.fg,
          weight: 800,
        });
      });

      if (accented) {
        const sweepStart = start + timing.length * 0.35;
        const sweep = ease.outExpo(prog(t, sweepStart, timing.sweep));
        sweepFrame(ctx, theme, x + 20, rowY + 4, w - 40, rowH - 8, sweep);
      }
      ctx.restore();
    });

    if (!count && cardProgress > 0) {
      text(ctx, 'NO CHANGES', SAFE.cx, rowsTop + 72, { size: 48, color: theme.dim, align: 'center', weight: 800 });
    }
  },
};
