import { clamp, ease, font, type Cue, type DiffProps, type Frame, type SceneDef } from '../core.ts';
import { textWidth } from '../prim.ts';
import { drawPixelWindow, makeWindowLayout, WINDOW_HEADER, WINDOW_MAX_HEIGHT } from './window.ts';

const MAX_LINES = 14;
const MAX_LINE_CHARS = 512;
const MIN_CODE_SIZE = 36;
const MAX_CODE_SIZE = 44;
const LINE_RATIO = 1.26;

type DiffRow = { text: string; sourceLine: number };
type DiffRows = { context: DiffRow[]; removed: DiffRow[]; added: DiffRow[] };
type DiffTiming = {
  build: number;
  strikeStart: number;
  strikeDuration: number;
  strikeGap: number;
  collapseStart: number;
  collapseDuration: number;
  addStart: number;
  addDuration: number;
  addGap: number;
};

function clean(value: string[] | undefined): string[] {
  return (Array.isArray(value) ? value : []).slice(0, MAX_LINES).map(line => {
    const text = String(line ?? '').replace(/\t/g, '    ');
    const chars = Array.from(text);
    return chars.length <= MAX_LINE_CHARS
      ? text
      : chars.slice(0, MAX_LINE_CHARS - 3).join('') + '...';
  });
}

function wrapLine(ctx: Frame['ctx'], line: string, maxWidth: number, size: number): string[] {
  const chars = Array.from(line);
  if (!chars.length) return [''];

  const indent = line.match(/^[ \t]*/)?.[0] ?? '';
  const rows: string[] = [];
  let rest = chars;
  let prefix = '';
  while (rest.length) {
    const available = maxWidth - textWidth(ctx, prefix, size, 500, 'mono');
    let cut = rest.length;
    while (cut > 1 && textWidth(ctx, rest.slice(0, cut).join(''), size, 500, 'mono') > available) cut--;
    if (cut < rest.length) {
      const space = rest.slice(0, cut).lastIndexOf(' ');
      if (space > 0) cut = space + 1;
    }
    rows.push(prefix + rest.slice(0, cut).join(''));
    rest = rest.slice(cut);
    prefix = indent + '  ';
  }
  return rows;
}

function truncateLine(ctx: Frame['ctx'], line: string, maxWidth: number, size: number): string {
  const chars = Array.from(line);
  while (chars.length && textWidth(ctx, chars.join('') + '...', size, 500, 'mono') > maxWidth) chars.pop();
  return chars.length ? chars.join('') + '...' : '';
}

function makeRows(ctx: Frame['ctx'], lines: string[], maxWidth: number, size: number): DiffRow[] {
  return lines.flatMap((line, sourceLine) =>
    wrapLine(ctx, line, maxWidth, size).map(text => ({ text, sourceLine })),
  );
}

function fitRows(ctx: Frame['ctx'], lines: { context: string[]; removed: string[]; added: string[] }, maxWidth: number): { rows: DiffRows; size: number; lineHeight: number } {
  for (let size = MAX_CODE_SIZE; size >= MIN_CODE_SIZE; size--) {
    const lineHeight = Math.ceil(size * LINE_RATIO);
    const maxRows = Math.floor((WINDOW_MAX_HEIGHT - WINDOW_HEADER - 44) / lineHeight);
    const rows = {
      context: makeRows(ctx, lines.context, maxWidth, size),
      removed: makeRows(ctx, lines.removed, maxWidth, size),
      added: makeRows(ctx, lines.added, maxWidth, size),
    };
    if (rows.context.length + Math.max(rows.removed.length, rows.added.length) <= maxRows) {
      return { rows, size, lineHeight };
    }
  }

  const size = MIN_CODE_SIZE;
  const lineHeight = Math.ceil(size * LINE_RATIO);
  const maxRows = Math.floor((WINDOW_MAX_HEIGHT - WINDOW_HEADER - 44) / lineHeight);
  const removed = lines.removed.map((line, sourceLine) => ({
    text: truncateLine(ctx, line, maxWidth, size),
    sourceLine,
  })).slice(0, maxRows);
  const added = lines.added.map((line, sourceLine) => ({
    text: truncateLine(ctx, line, maxWidth, size),
    sourceLine,
  })).slice(0, maxRows);
  const contextCapacity = Math.max(0, maxRows - Math.max(removed.length, added.length));
  const context = lines.context.slice(0, contextCapacity).map((line, sourceLine) => ({
    text: truncateLine(ctx, line, maxWidth, size),
    sourceLine,
  }));
  return { rows: { context, removed, added }, size, lineHeight };
}

function timingFor(dur: number, removedCount: number, addedCount: number): DiffTiming {
  const build = Math.min(0.24, Math.max(0.16, dur * 0.1));
  const strikeStart = build + Math.min(0.14, dur * 0.05);
  const strikeDuration = Math.min(0.18, Math.max(0.12, dur * 0.08));
  const strikeSpread = removedCount > 1 ? Math.min(0.42, dur * 0.16) : 0;
  const collapseStart = strikeStart + strikeSpread + strikeDuration + Math.min(0.05, dur * 0.02);
  const collapseDuration = Math.min(0.2, Math.max(0.14, dur * 0.1));
  const addStart = removedCount ? collapseStart + collapseDuration + Math.min(0.12, dur * 0.04) : strikeStart;
  const addSpread = addedCount > 1 ? Math.min(0.45, dur * 0.17) : 0;
  const addDuration = Math.min(0.2, Math.max(0.14, dur * 0.1));
  const addGap = addedCount > 1 ? addSpread / (addedCount - 1) : 0;
  return {
    build,
    strikeStart,
    strikeDuration,
    strikeGap: removedCount > 1 ? strikeSpread / (removedCount - 1) : 0,
    collapseStart,
    collapseDuration,
    addStart,
    addDuration,
    addGap,
  };
}

function drawPixelStrike(ctx: Frame['ctx'], x: number, y: number, width: number, progress: number, color: string) {
  const extent = width * clamp(progress);
  ctx.fillStyle = color;
  for (let offset = 0; offset < extent; offset += 8) {
    ctx.fillRect(x + offset, y, Math.min(4, extent - offset), 4);
  }
}

export const diffScene: SceneDef<DiffProps> = {
  type: 'diff',

  render(frame, props) {
    const { ctx, theme, t, dur } = frame;
    const lines = {
      context: clean(props.context),
      removed: clean(props.removed),
      added: clean(props.added),
    };
    const maxWidth = 888 - 72 - 44;
    const fitted = fitRows(ctx, lines, maxWidth);
    const { rows, size, lineHeight } = fitted;
    const contentRows = rows.context.length + Math.max(rows.removed.length, rows.added.length);
    const layout = makeWindowLayout(contentRows * lineHeight);
    const timing = timingFor(dur, lines.removed.length, lines.added.length);
    const reveal = ease.outExpo(clamp(t / timing.build));
    const count = '-' + lines.removed.length + '  +' + lines.added.length;
    const textX = layout.content.x + 44;
    const markerX = layout.content.x + 8;

    drawPixelWindow(ctx, theme, layout, props.filename ?? 'CHANGES', reveal, content => {
      ctx.textBaseline = 'top';
      ctx.font = font(size, 500, 'mono');

      let rowY = content.y;
      for (const row of rows.context) {
        ctx.fillStyle = theme.dim;
        ctx.fillText(row.text, textX, rowY + 2);
        rowY += lineHeight;
      }

      rows.removed.forEach((row, index) => {
        const strikeAt = timing.strikeStart + row.sourceLine * timing.strikeGap;
        const strike = clamp((t - strikeAt) / timing.strikeDuration);
        const collapse = ease.outExpo(clamp((t - timing.collapseStart) / timing.collapseDuration));
        const height = lineHeight * (1 - collapse);
        if (height > 1) {
          const centerY = rowY + height / 2;
          ctx.save();
          ctx.globalAlpha *= 1 - 0.52 * strike;
          ctx.translate(0, centerY);
          ctx.scale(1, 1 - collapse);
          ctx.translate(0, -centerY);
          ctx.fillStyle = strike > 0.45 ? theme.muted : theme.fg;
          ctx.fillText('-', markerX, rowY + Math.max(0, (lineHeight - size) / 2));
          ctx.fillText(row.text, textX, rowY + Math.max(0, (lineHeight - size) / 2));
          ctx.restore();

          if (strike > 0) {
            const width = textWidth(ctx, row.text, size, 500, 'mono');
            drawPixelStrike(ctx, textX, rowY + lineHeight * 0.58, width, strike, theme.muted);
          }
        }
        rowY += height;
        void index;
      });

      rows.added.forEach(row => {
        const at = timing.addStart + row.sourceLine * timing.addGap;
        const progress = clamp((t - at) / timing.addDuration);
        if (progress <= 0) return;

        const height = lineHeight * ease.outExpo(progress);
        const centerX = textX + textWidth(ctx, row.text, size, 500, 'mono') / 2;
        const centerY = rowY + height / 2;
        ctx.save();
        ctx.globalAlpha *= ease.outExpo(progress);
        ctx.translate(centerX, centerY);
        ctx.scale(0.84 + 0.16 * ease.outBack(progress), 0.84 + 0.16 * ease.outBack(progress));
        ctx.translate(-centerX, -centerY);

        ctx.fillStyle = theme.panelAlt;
        ctx.globalAlpha *= 0.32;
        ctx.fillRect(layout.content.x + 2, rowY, content.w - 4, height);
        ctx.globalAlpha /= 0.32;
        ctx.textBaseline = 'top';
        ctx.font = font(size, 800, 'mono');
        ctx.fillStyle = theme.fg;
        ctx.fillText('+', markerX, rowY + Math.max(0, (lineHeight - size) / 2));
        ctx.fillStyle = theme.accent;
        ctx.fillText(row.text, textX, rowY + Math.max(0, (lineHeight - size) / 2));
        ctx.restore();
        rowY += height;
      });

      const lastSource = lines.added.length - 1;
      const idleAt = timing.addStart + Math.max(0, lastSource) * timing.addGap + timing.addDuration;
      const lastRow = rows.added.at(-1);
      if (lastRow && t >= idleAt) {
        const caretX = Math.min(textX + textWidth(ctx, lastRow.text, size, 800, 'mono'), content.x + content.w - 12);
        ctx.fillStyle = theme.dim;
        if (Math.floor(t * 3) % 2 === 0) ctx.fillRect(caretX, rowY - lineHeight + 5, 12, size);
      }
    }, count);
  },

  cues(props, dur): Cue[] {
    const removed = clean(props.removed);
    const added = clean(props.added);
    const timing = timingFor(dur, removed.length, added.length);
    const cues: Cue[] = [
      { t: 0, kind: 'rise', len: timing.build },
      { t: timing.build, kind: 'pop' },
    ];

    if (removed.length) {
      cues.push({
        t: timing.strikeStart,
        kind: 'swish',
        len: timing.strikeDuration + Math.max(0, removed.length - 1) * timing.strikeGap,
      });
      cues.push({ t: timing.collapseStart, kind: 'impact' });
    }
    added.forEach((_, index) => {
      cues.push({
        t: timing.addStart + index * timing.addGap,
        kind: 'pop',
        step: added.length < 2 ? 1 : index / (added.length - 1),
      });
    });
    if (added.length) {
      cues.push({
        t: timing.addStart + Math.max(0, added.length - 1) * timing.addGap + timing.addDuration,
        kind: 'shimmer',
      });
    }
    return cues.filter(cue => cue.t < dur).slice(0, 36);
  },
};
