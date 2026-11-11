import {
  CONTENT_BOTTOM,
  clamp,
  ease,
  font,
  type CodeProps,
  type Cue,
  type Frame,
  type SceneDef,
} from '../core.ts';
import { cursor, textWidth } from '../prim.ts';
import { drawPixelWindow, makeWindowLayout, WINDOW_HEADER, WINDOW_MAX_HEIGHT } from './window.ts';

const MAX_SOURCE_LINES = 14;
const MAX_SOURCE_CHARS = 512;
const MIN_CODE_SIZE = 36;
const MAX_CODE_SIZE = 44;
const LINE_RATIO = 1.26;

type CodeRow = { text: string; sourceLine: number };
type CodeTiming = {
  build: number;
  typeStart: number;
  typeDuration: number;
  payoffStart: number;
  sweepDuration: number;
  highlightGap: number;
};

function cleanSource(value: string): string[] {
  return String(value ?? '')
    .replace(/\t/g, '    ')
    .split('\n')
    .slice(0, MAX_SOURCE_LINES)
    .map(line => {
      const chars = Array.from(line);
      return chars.length <= MAX_SOURCE_CHARS
        ? line
        : chars.slice(0, MAX_SOURCE_CHARS - 3).join('') + '...';
    });
}

function wrapLine(ctx: Frame['ctx'], line: string, maxWidth: number, size: number): string[] {
  const chars = Array.from(line);
  if (!chars.length) return [''];

  const indent = line.match(/^[ \t]*/)?.[0] ?? '';
  const rows: string[] = [];
  let remaining = chars;
  let prefix = '';
  while (remaining.length) {
    const available = maxWidth - textWidth(ctx, prefix, size, 500, 'mono');
    let cut = remaining.length;
    while (cut > 1 && textWidth(ctx, remaining.slice(0, cut).join(''), size, 500, 'mono') > available) cut--;
    if (cut < remaining.length) {
      const space = remaining.slice(0, cut).lastIndexOf(' ');
      if (space > 0) cut = space + 1;
    }
    rows.push(prefix + remaining.slice(0, cut).join(''));
    remaining = remaining.slice(cut);
    prefix = indent + '  ';
  }
  return rows;
}

function fitLine(ctx: Frame['ctx'], line: string, maxWidth: number, size: number): string {
  const chars = Array.from(line);
  while (chars.length && textWidth(ctx, chars.join('') + '...', size, 500, 'mono') > maxWidth) chars.pop();
  return chars.length ? chars.join('') + '...' : '';
}

function layoutCode(ctx: Frame['ctx'], source: string[], maxWidth: number): { rows: CodeRow[]; size: number; lineHeight: number } {
  for (let size = MAX_CODE_SIZE; size >= MIN_CODE_SIZE; size--) {
    const lineHeight = Math.ceil(size * LINE_RATIO);
    const maxRows = Math.floor((WINDOW_MAX_HEIGHT - WINDOW_HEADER - 44) / lineHeight);
    const rows = source.flatMap((line, index) =>
      wrapLine(ctx, line, maxWidth, size).map(text => ({ text, sourceLine: index + 1 })),
    );
    if (rows.length <= maxRows) return { rows, size, lineHeight };
  }

  // When many extreme lines cannot all wrap inside the safe height, keep one
  // legible, explicitly clipped row per source line.
  const size = MIN_CODE_SIZE;
  const lineHeight = Math.ceil(size * LINE_RATIO);
  return {
    rows: source.map((line, index) => ({ text: fitLine(ctx, line, maxWidth, size), sourceLine: index + 1 })),
    size,
    lineHeight,
  };
}

function timingFor(dur: number, highlightCount: number): CodeTiming {
  const build = Math.min(0.24, Math.max(0.16, dur * 0.1));
  const typeStart = build + Math.min(0.08, dur * 0.025);
  const typeDuration = Math.min(0.95, Math.max(0.24, dur * 0.34));
  const payoffStart = typeStart + typeDuration + Math.min(0.1, dur * 0.04);
  const sweepDuration = Math.min(0.32, Math.max(0.22, dur * 0.08));
  const highlightGap = highlightCount > 1 ? Math.min(0.14, 0.32 / highlightCount) : 0;
  return { build, typeStart, typeDuration, payoffStart, sweepDuration, highlightGap };
}

const TOKEN = /(\/\/.*|#.*|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\x60(?:[^\x60\\]|\\.)*\x60|\b(?:const|let|var|function|return|if|else|for|while|import|from|export|default|async|await|def|class|print|true|false|null|None|echo|try|catch|throw|new|in|of|as|type|interface)\b|[{}()[\].,:;=+*/<>!&|?-])/g;
const KEYWORD = /^(const|let|var|function|return|if|else|for|while|import|from|export|default|async|await|def|class|print|true|false|null|None|echo|try|catch|throw|new|in|of|as|type|interface)$/;

function drawSyntax(ctx: Frame['ctx'], value: string, x: number, y: number, size: number, theme: Frame['theme']) {
  if (!value) return;
  const parts = value.split(TOKEN).filter(Boolean);
  let cursorX = x;
  ctx.textBaseline = 'top';

  for (const part of parts) {
    const isComment = part.startsWith('//') || part.startsWith('#');
    const isString = part.startsWith('"') || part.startsWith("'") || part.charCodeAt(0) === 96;
    const isKeyword = KEYWORD.test(part);
    const isPunctuation = /^[{}()[\].,:;=+*/<>!&|?-]$/.test(part);
    const weight = isKeyword ? 800 : 500;
    ctx.font = font(size, weight, 'mono');
    ctx.fillStyle = isKeyword ? theme.fg : isString || isComment || isPunctuation ? theme.muted : theme.dim;
    ctx.fillText(part, cursorX, y);
    cursorX += ctx.measureText(part).width;
  }
}

function drawRainbowSweep(
  ctx: Frame['ctx'],
  text: string,
  x: number,
  y: number,
  width: number,
  size: number,
  progress: number,
  theme: Frame['theme'],
) {
  if (progress <= 0 || width <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width * clamp(progress), size * 1.4);
  ctx.clip();
  ctx.font = font(size, 500, 'mono');
  ctx.textBaseline = 'top';
  ctx.fillStyle = theme.accent;
  ctx.fillText(text, x, y);
  ctx.restore();
}

export const codeScene: SceneDef<CodeProps> = {
  type: 'code',

  render(frame, props) {
    const { ctx, theme, t, dur } = frame;
    const source = cleanSource(props.code);
    const highlights = [...new Set((props.highlight ?? []).filter(
      line => Number.isInteger(line) && line > 0 && line <= source.length,
    ))];
    const timing = timingFor(dur, highlights.length);
    const maxWidth = 888 - 72 - 44;
    const fitted = layoutCode(ctx, source, maxWidth);
    const contentHeight = fitted.rows.length * fitted.lineHeight;
    const layout = makeWindowLayout(contentHeight);
    const reveal = ease.outExpo(clamp(t / timing.build));
    const typing = props.typing !== false;
    const totalChars = fitted.rows.reduce((sum, row) => sum + Array.from(row.text).length, 0);
    const typed = typing
      ? totalChars * clamp((t - timing.typeStart) / timing.typeDuration)
      : (t >= timing.typeStart ? totalChars : 0);
    const highlightAt = (line: number) => {
      const index = highlights.indexOf(line);
      return index < 0 ? -1 : timing.payoffStart + index * timing.highlightGap;
    };

    drawPixelWindow(ctx, theme, layout, props.filename ?? 'CODE', reveal, content => {
      const textX = content.x + 8;
      const barX = textX - 18;
      let offset = 0;
      let cursorRow = -1;
      let cursorCount = 0;

      fitted.rows.forEach((row, index) => {
        const chars = Array.from(row.text);
        const localCount = clamp((typed - offset) / Math.max(1, chars.length));
        const visibleCount = typing ? Math.ceil(chars.length * localCount) : (typed > offset || !chars.length ? chars.length : 0);
        const visibleText = chars.slice(0, visibleCount).join('');
        const rowY = content.y + index * fitted.lineHeight;
        const at = highlightAt(row.sourceLine);
        const sweep = at < 0 ? 0 : clamp((t - at) / timing.sweepDuration);
        const fullWidth = textWidth(ctx, row.text, fitted.size, 500, 'mono');
        const punch = sweep > 0 && sweep < 1 ? 1 + Math.sin(sweep * Math.PI) * 0.025 : 1;

        ctx.save();
        const centerX = textX + fullWidth / 2;
        const centerY = rowY + fitted.lineHeight / 2;
        ctx.translate(centerX, centerY);
        ctx.scale(punch, punch);
        ctx.translate(-centerX, -centerY);

        if (sweep > 0) {
          ctx.fillStyle = theme.accent;
          ctx.globalAlpha *= sweep;
          ctx.fillRect(barX, rowY + 8, 6, Math.max(20, fitted.lineHeight - 16));
          ctx.globalAlpha /= sweep;
        }

        drawSyntax(ctx, visibleText, textX, rowY + 2, fitted.size, theme);
        if (sweep > 0 && visibleCount === chars.length) {
          drawRainbowSweep(ctx, row.text, textX, rowY + 2, fullWidth, fitted.size, sweep, theme);
        }

        if (typing && typed >= offset && typed < offset + chars.length) {
          cursorRow = index;
          cursorCount = Math.min(chars.length, Math.max(0, Math.floor(typed - offset)));
        }
        ctx.restore();
        offset += chars.length;
      });

      if (!typing || typed >= totalChars) {
        cursorRow = Math.max(0, fitted.rows.length - 1);
        cursorCount = fitted.rows.at(-1)?.text.length ?? 0;
      }
      if (cursorRow >= 0 && fitted.rows[cursorRow]) {
        const row = fitted.rows[cursorRow]!;
        const prefix = Array.from(row.text).slice(0, cursorCount).join('');
        const cx = textX + textWidth(ctx, prefix, fitted.size, 500, 'mono');
        cursor(ctx, cx, content.y + cursorRow * fitted.lineHeight + 4, 16, fitted.size + 4, theme.fg, t);
      }

    });

    const note = String(props.note ?? '').replace(/\s+/g, ' ').trim();
    if (note && reveal > 0.5 && layout.y + layout.h + 34 <= CONTENT_BOTTOM - 16) {
      const baseline = Math.min(CONTENT_BOTTOM - 16, layout.y + layout.h + 34);
      const chars = Array.from(note);
      while (chars.length && textWidth(ctx, chars.join('') + '...', 28, 800, 'body') > 820) chars.pop();
      const fittedNote = chars.length < Array.from(note).length ? chars.join('') + '...' : note;
      ctx.save();
      ctx.font = font(28, 800, 'body');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = theme.dim;
      ctx.fillText(fittedNote, 540, baseline);
      ctx.restore();
    }
  },

  cues(props, dur): Cue[] {
    const source = cleanSource(props.code);
    const highlights = [...new Set((props.highlight ?? []).filter(
      line => Number.isInteger(line) && line > 0 && line <= source.length,
    ))];
    const timing = timingFor(dur, highlights.length);
    const cues: Cue[] = [
      { t: 0, kind: 'rise', len: timing.build },
      { t: timing.build, kind: 'pop' },
      { t: timing.typeStart, kind: 'type', len: timing.typeDuration },
    ];

    highlights.forEach((_, index) => {
      const at = timing.payoffStart + index * timing.highlightGap;
      cues.push({ t: at, kind: 'impact', step: highlights.length < 2 ? 1 : index / (highlights.length - 1) });
      cues.push({ t: at + timing.sweepDuration, kind: 'shimmer' });
    });
    return cues.filter(cue => cue.t < dur).slice(0, 32);
  },
};
