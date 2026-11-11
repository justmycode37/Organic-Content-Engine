import {
  clamp,
  ease,
  font,
  type Cue,
  type Frame,
  type SceneDef,
  type TerminalProps,
} from '../core.ts';
import { cursor, textWidth } from '../prim.ts';
import { drawPixelWindow, makeWindowLayout, WINDOW_HEADER, WINDOW_MAX_HEIGHT } from './window.ts';

const MAX_TERMINAL_LINES = 6;
const MAX_TEXT_CHARS = 768;
const MIN_TEXT_SIZE = 36;
const MAX_TEXT_SIZE = 44;

type TerminalEntry = {
  cmd: string;
  out: string;
  status?: 'ok' | 'fail' | 'info';
};
type TerminalRow = TerminalEntry & { cmdRows: string[]; outRows: string[] };
type TerminalLayout = { rows: TerminalRow[]; size: number; lineHeight: number; contentHeight: number };
type TerminalTiming = {
  build: number;
  slot: number;
  cmdStart: (index: number) => number;
  cmdDuration: number;
  outputStart: (index: number) => number;
  outputDuration: number;
  sweepDuration: number;
};

function cleanText(value: string): string {
  const text = String(value ?? '').replace(/\t/g, '    ');
  const chars = Array.from(text);
  return chars.length <= MAX_TEXT_CHARS
    ? text
    : chars.slice(0, MAX_TEXT_CHARS - 3).join('') + '...';
}

function wrapText(ctx: Frame['ctx'], value: string, maxWidth: number, size: number): string[] {
  const rows: string[] = [];
  for (const paragraph of String(value ?? '').split('\n')) {
    if (!paragraph) {
      rows.push('');
      continue;
    }

    const chars = Array.from(paragraph);
    let rest = chars;
    while (rest.length) {
      let cut = rest.length;
      while (cut > 1 && textWidth(ctx, rest.slice(0, cut).join(''), size, 600, 'mono') > maxWidth) cut--;
      if (cut < rest.length) {
        const space = rest.slice(0, cut).lastIndexOf(' ');
        if (space > 0) cut = space + 1;
      }
      rows.push(rest.slice(0, cut).join(''));
      rest = rest.slice(cut);
    }
  }
  return rows.length ? rows : [''];
}

function oneRow(ctx: Frame['ctx'], value: string, maxWidth: number, size: number): string {
  const chars = Array.from(value.replace(/\s+/g, ' ').trim());
  while (chars.length && textWidth(ctx, chars.join('') + '...', size, 600, 'mono') > maxWidth) chars.pop();
  return chars.length < Array.from(value.replace(/\s+/g, ' ').trim()).length
    ? chars.join('') + '...'
    : chars.join('');
}

function contentHeight(rows: TerminalRow[], lineHeight: number): number {
  return rows.reduce((sum, row) => {
    const command = row.cmdRows.length * lineHeight;
    const output = row.outRows.length ? 16 + row.outRows.length * lineHeight : 0;
    return sum + command + output + 14;
  }, 0);
}

function fitTerminal(ctx: Frame['ctx'], entries: TerminalEntry[], contentWidth: number): TerminalLayout {
  const commandWidth = contentWidth - 58;
  const outputWidth = contentWidth - 56;

  for (let size = MAX_TEXT_SIZE; size >= MIN_TEXT_SIZE; size--) {
    const lineHeight = Math.ceil(size * 1.24);
    const rows = entries.map(entry => ({
      ...entry,
      cmdRows: entry.cmd ? wrapText(ctx, entry.cmd, commandWidth, size) : [],
      outRows: entry.out ? wrapText(ctx, entry.out, outputWidth, size) : (entry.status ? [''] : []),
    }));
    const height = contentHeight(rows, lineHeight);
    if (height <= WINDOW_MAX_HEIGHT - WINDOW_HEADER - 44) {
      return { rows, size, lineHeight, contentHeight: height };
    }
  }

  const size = MIN_TEXT_SIZE;
  const lineHeight = Math.ceil(size * 1.24);
  const rows = entries.map(entry => ({
    ...entry,
    cmdRows: entry.cmd ? [oneRow(ctx, entry.cmd, commandWidth, size)] : [],
    outRows: entry.out
      ? [oneRow(ctx, entry.out, outputWidth, size)]
      : (entry.status ? [''] : []),
  }));
  return { rows, size, lineHeight, contentHeight: contentHeight(rows, lineHeight) };
}

function timingFor(dur: number, count: number): TerminalTiming {
  const build = Math.min(0.24, Math.max(0.16, dur * 0.1));
  const reserve = Math.min(0.5, Math.max(0.22, dur * 0.14));
  const slot = count > 0 ? Math.max(0.12, (dur - build - reserve) / count) : dur;
  const cmdStart = (index: number) => build + index * slot + slot * 0.03;
  const outputStart = (index: number) => build + index * slot + slot * 0.43;
  const cmdDuration = Math.max(0.08, slot * 0.3);
  const outputDuration = Math.max(0.08, slot * 0.28);
  const sweepDuration = Math.min(0.3, Math.max(0.14, dur * 0.07));
  return { build, slot, cmdStart, cmdDuration, outputStart, outputDuration, sweepDuration };
}

function visibleRows(rows: string[], count: number): string[] {
  let remaining = Math.max(0, count);
  return rows.map(row => {
    const chars = Array.from(row);
    const visible = chars.slice(0, remaining).join('');
    remaining -= chars.length;
    return visible;
  });
}

function drawStatusIcon(
  ctx: Frame['ctx'],
  status: 'ok' | 'fail' | 'info' | undefined,
  x: number,
  y: number,
  progress: number,
  theme: Frame['theme'],
) {
  if (!status || progress <= 0) return;

  const scale = 0.55 + 0.45 * ease.outBack(progress);
  const size = 36;
  ctx.save();
  ctx.globalAlpha *= ease.outExpo(progress);
  ctx.translate(x + size / 2, y + size / 2);
  ctx.scale(scale, scale);
  ctx.translate(-(x + size / 2), -(y + size / 2));

  ctx.fillStyle = theme.panelAlt;
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = theme.line;
  ctx.fillRect(x, y, size, 4);
  ctx.fillRect(x, y + size - 4, size, 4);
  ctx.fillRect(x, y, 4, size);
  ctx.fillRect(x + size - 4, y, 4, size);

  const rows = status === 'ok'
    ? ['0000000', '0000001', '0000011', '1000110', '1101100', '0111000', '0010000']
    : status === 'fail'
      ? ['1000001', '1100011', '0110110', '0011100', '0011100', '0110110', '1100011']
      : ['0000000', '0011100', '0011100', '0011100', '0011100', '0000000', '0000000'];
  ctx.fillStyle = status === 'ok' ? theme.fg : theme.dim;
  rows.forEach((row, rowIndex) => {
    for (let col = 0; col < row.length; col++) {
      if (row[col] === '1') ctx.fillRect(x + 4 + col * 4, y + 4 + rowIndex * 4, 4, 4);
    }
  });
  ctx.restore();
}

function drawRainbowOverlay(
  ctx: Frame['ctx'],
  value: string,
  x: number,
  y: number,
  size: number,
  progress: number,
  theme: Frame['theme'],
) {
  if (progress <= 0) return;
  const width = textWidth(ctx, value, size, 500, 'mono');
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width * clamp(progress), size * 1.4);
  ctx.clip();
  ctx.font = font(size, 500, 'mono');
  ctx.textBaseline = 'top';
  ctx.fillStyle = theme.accent;
  ctx.fillText(value, x, y);
  ctx.restore();
}

function drawStreamLine(
  ctx: Frame['ctx'],
  value: string,
  x: number,
  y: number,
  size: number,
  accentWidth: number,
  theme: Frame['theme'],
) {
  ctx.font = font(size, 500, 'mono');
  ctx.textBaseline = 'top';
  ctx.fillStyle = theme.dim;
  ctx.fillText(value, x, y);

  if (accentWidth > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, accentWidth, size * 1.4);
    ctx.clip();
    ctx.fillStyle = theme.accent;
    ctx.fillText(value, x, y);
    ctx.restore();
  }
}

export const terminalScene: SceneDef<TerminalProps> = {
  type: 'terminal',

  render(frame, props) {
    const { ctx, theme, t, dur } = frame;
    const entries = (Array.isArray(props?.lines) ? props.lines : []).slice(0, MAX_TERMINAL_LINES).map(entry => ({
      cmd: cleanText(entry?.cmd ?? ''),
      out: cleanText(entry?.out ?? ''),
      status: entry?.status,
    }));
    const width = 888 - 72;
    const fitted = fitTerminal(ctx, entries, width);
    const layout = makeWindowLayout(fitted.contentHeight);
    const timing = timingFor(dur, fitted.rows.length);
    const reveal = ease.outExpo(clamp(t / timing.build));

    let finalSuccess = -1;
    for (let i = 0; i < fitted.rows.length; i++) {
      if (fitted.rows[i]!.status === 'ok') finalSuccess = i;
    }
    const finalSuccessHasOutput = finalSuccess >= 0 && Boolean(fitted.rows[finalSuccess]!.out);
    const successSweepAt = finalSuccess < 0
      ? -1
      : finalSuccessHasOutput
        ? timing.outputStart(finalSuccess) + timing.outputDuration + 0.035
        : timing.cmdStart(finalSuccess) + timing.cmdDuration + 0.035;

    drawPixelWindow(ctx, theme, layout, props.title ?? 'TERMINAL', reveal, content => {
      let rowTop = content.y;
      let activeCursorX = -1;
      let activeCursorY = 0;

      fitted.rows.forEach((row, index) => {
        const commandStart = timing.cmdStart(index);
        const commandProgress = clamp((t - commandStart) / timing.cmdDuration);
        const commandChars = row.cmdRows.reduce((sum, line) => sum + Array.from(line).length, 0);
        const shownCommand = visibleRows(row.cmdRows, Math.floor(commandChars * commandProgress));
        const commandX = content.x + 38;

        row.cmdRows.forEach((line, lineIndex) => {
          const lineY = rowTop + lineIndex * fitted.lineHeight;
          if (lineIndex === 0 && t >= commandStart) {
            ctx.font = font(36, 800, 'mono');
            ctx.textBaseline = 'top';
            ctx.fillStyle = theme.muted;
            ctx.fillText('>', content.x + 4, lineY + 5);
          }
          const visible = shownCommand[lineIndex] ?? '';
          if (visible) {
            ctx.font = font(fitted.size, 700, 'mono');
            ctx.textBaseline = 'top';
            ctx.fillStyle = theme.fg;
            ctx.fillText(visible, commandX, lineY);
          }

          const isCommandPayoff = index === finalSuccess
            && !finalSuccessHasOutput
            && lineIndex === row.cmdRows.length - 1;
          const commandSweep = isCommandPayoff
            ? clamp((t - successSweepAt) / timing.sweepDuration)
            : 0;
          if (isCommandPayoff && visible.length === line.length) {
            drawRainbowOverlay(ctx, line, commandX, lineY, fitted.size, commandSweep, theme);
          }

          const prior = row.cmdRows.slice(0, lineIndex).reduce((sum, value) => sum + Array.from(value).length, 0);
          if (t >= commandStart && commandProgress < 1) {
            const currentCount = Math.max(0, Math.min(Array.from(line).length, Math.floor(commandChars * commandProgress) - prior));
            activeCursorX = commandX + textWidth(ctx, Array.from(line).slice(0, currentCount).join(''), fitted.size, 700, 'mono');
            activeCursorY = lineY + 3;
          }
        });

        const commandBlock = row.cmdRows.length * fitted.lineHeight;
        const outputTop = rowTop + commandBlock + 12;
        const outputAt = timing.outputStart(index);
        const outputProgress = clamp((t - outputAt) / timing.outputDuration);
        const outputChars = row.outRows.reduce((sum, line) => sum + Array.from(line).length, 0);
        const shownOutput = visibleRows(row.outRows, Math.ceil(outputChars * outputProgress));
        const outputX = content.x + 52;

        if (row.outRows.length) {
          drawStatusIcon(ctx, row.status, content.x + 2, outputTop, outputProgress, theme);
          row.outRows.forEach((line, lineIndex) => {
            const visible = shownOutput[lineIndex] ?? '';
            const lineY = outputTop + lineIndex * fitted.lineHeight;
            const fullWidth = textWidth(ctx, line, fitted.size, 500, 'mono');
            const isPayoffLine = index === finalSuccess && finalSuccessHasOutput && lineIndex === row.outRows.length - 1;
            const sweep = isPayoffLine ? clamp((t - successSweepAt) / timing.sweepDuration) : 0;
            const accentWidth = isPayoffLine && visible.length === line.length
              ? fullWidth * sweep
              : 0;
            drawStreamLine(ctx, visible, outputX, lineY, fitted.size, accentWidth, theme);
          });
        }
        rowTop += commandBlock + (row.outRows.length ? 12 + row.outRows.length * fitted.lineHeight : 0) + 14;
      });

      if (activeCursorX >= 0) {
        cursor(ctx, activeCursorX, activeCursorY, 14, fitted.size + 4, theme.fg, t);
      } else if (fitted.rows.length && t >= timing.cmdStart(fitted.rows.length - 1) + timing.cmdDuration) {
        const last = fitted.rows.at(-1)!;
        const commandText = last.cmdRows.at(-1) ?? '';
        const x = content.x + 38 + textWidth(ctx, commandText, fitted.size, 700, 'mono');
        cursor(ctx, x, rowTop - fitted.lineHeight + 3, 14, fitted.size + 4, theme.fg, t);
      }
    });
  },

  cues(props, dur): Cue[] {
    const entries = (Array.isArray(props?.lines) ? props.lines : []).slice(0, MAX_TERMINAL_LINES);
    const timing = timingFor(dur, entries.length);
    const cues: Cue[] = [
      { t: 0, kind: 'rise', len: timing.build },
      { t: timing.build, kind: 'pop' },
    ];

    entries.forEach((entry, index) => {
      const start = timing.cmdStart(index);
      cues.push({ t: start, kind: 'type', len: timing.cmdDuration });
      const outputAt = timing.outputStart(index);
      if (entry?.out || entry?.status) {
        cues.push({ t: outputAt, kind: entry.status === 'ok' ? 'impact' : 'pop', step: entries.length < 2 ? 1 : index / (entries.length - 1) });
        if (entry?.out) cues.push({ t: outputAt, kind: 'type', len: timing.outputDuration });
      }
    });

    let finalSuccess = -1;
    for (let i = 0; i < entries.length; i++) {
      if (entries[i]?.status === 'ok') finalSuccess = i;
    }
    if (finalSuccess >= 0) {
      const at = entries[finalSuccess]?.out
        ? timing.outputStart(finalSuccess) + timing.outputDuration + 0.035
        : timing.cmdStart(finalSuccess) + timing.cmdDuration + 0.035;
      cues.push({ t: at, kind: 'impact' }, { t: at + timing.sweepDuration, kind: 'shimmer' });
    }

    return cues.filter(cue => cue.t < dur).slice(0, 36);
  },
};
