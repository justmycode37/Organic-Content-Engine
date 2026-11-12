import { clamp, ease, font, type Frame, type CodeProps, type SceneDef } from '../core.ts';
import { cursor, panel, text, textWidth } from '../prim.ts';

const MAX_SOURCE_LINES = 14;
const MAX_SOURCE_CHARS = 512;
const MAX_CONTENT_HEIGHT = 1000;
const WINDOW_CHROME_HEIGHT = 120;
const CONTENT_WIDTH = 752;
const NOTE_SIZE = 52;
const NOTE_LINE_HEIGHT = 62;
const NOTE_GAP_TOP = 48;
const NOTE_GAP_BOTTOM = 24;
const MAX_NOTE_LINES = 15;

type CodeRow = { text: string; sourceLine: number; segment: number };
type CodeGroup = { sourceLine: number; rows: CodeRow[] };

function sourceRows(value: string): string[] {
  return String(value ?? '').replace(/\t/g, '    ').split('\n').slice(0, MAX_SOURCE_LINES).map(line => {
    const chars = Array.from(line);
    return chars.length <= MAX_SOURCE_CHARS ? line : chars.slice(0, MAX_SOURCE_CHARS - 3).join('') + '...';
  });
}

function wrapMeasured(ctx: Frame['ctx'], value: string, maxWidth: number, size: number, weight: number, family: 'mono' | 'body'): string[] {
  const chars = Array.from(String(value ?? ''));
  if (!chars.length) return [''];
  const lines: string[] = [];
  let remaining = chars;
  while (remaining.length) {
    if (textWidth(ctx, remaining.join(''), size, weight, family) <= maxWidth) {
      lines.push(remaining.join(''));
      break;
    }
    let cut = 0;
    for (let end = 1; end <= remaining.length; end++) {
      if (textWidth(ctx, remaining.slice(0, end).join(''), size, weight, family) > maxWidth) break;
      cut = end;
    }
    if (!cut) cut = 1;
    const lastSpace = remaining.slice(0, cut).lastIndexOf(' ');
    if (lastSpace > 0) cut = lastSpace + 1;
    lines.push(remaining.slice(0, cut).join(''));
    remaining = remaining.slice(cut);
  }
  return lines;
}

function drawCode(ctx: Frame['ctx'], value: string, x: number, y: number, size: number, theme: Frame['theme']) {
  const re = /(\/\/.*|#.*|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\b(?:const|let|var|function|return|if|else|for|while|import|from|export|async|await|def|class|print|true|false|null|None|echo)\b|[{}()[\].,:;=+*/<>!-])/g;
  const parts = value.split(re).filter(Boolean);
  let px = x;
  ctx.font = font(size, 500, 'mono');
  ctx.textBaseline = 'top';
  for (const part of parts) {
    const comment = /^(\/\/|#)/.test(part);
    const string = /^("|')/.test(part);
    const syntax = /^(const|let|var|function|return|if|else|for|while|import|from|export|async|await|def|class|print|true|false|null|None|echo)$/.test(part)
      || /^[{}()[\].,:;=+*/<>!-]$/.test(part);
    ctx.fillStyle = comment ? theme.muted : string ? theme.fg : syntax ? theme.fg : theme.dim;
    ctx.font = font(size, string ? 700 : 500, 'mono');
    ctx.fillText(part, px, y);
    px += ctx.measureText(part).width;
  }
}

function drawSteppedArrow(ctx: Frame['ctx'], x: number, y1: number, y2: number, color: string, progress: number) {
  const p = clamp(progress);
  if (p <= 0 || y2 <= y1) return;
  const headHeight = Math.min(36, Math.max(0, y2 - y1));
  const end = y1 + (y2 - y1) * p;
  ctx.fillStyle = color;
  if (p > 0.72) {
    const head = clamp((p - 0.72) / 0.28);
    const levels = [12, 24, 36];
    for (let i = 0; i < levels.length; i++) {
      const levelTop = end - headHeight + i * 12;
      if (levelTop < y1) continue;
      const width = levels[i]! * head;
      ctx.fillRect(x - width / 2, levelTop, width, 12);
    }
  }
  const shaftEnd = Math.max(y1, end - headHeight);
  ctx.fillRect(x - 6, y1, 12, Math.max(0, shaftEnd - y1));
}

export const codeScene: SceneDef<CodeProps> = {
  type: 'code',
  render(frame, props) {
    const { ctx, theme, t, dur } = frame;
    const source = sourceRows(props.code);
    const noteText = String(props.note ?? '').replace(/\s+/g, ' ').trim();
    const requestedHighlights = new Set((props.highlight ?? []).filter(n => Number.isInteger(n) && n >= 1 && n <= source.length));
    const noteRequested = Boolean(noteText && requestedHighlights.size);
    const safeNote = Array.from(noteText).slice(0, 512).join('');
    let noteLines = noteRequested ? wrapMeasured(ctx, safeNote, CONTENT_WIDTH - 48, NOTE_SIZE, 800, 'body') : [];
    if (noteLines.length > MAX_NOTE_LINES) noteLines = [...noteLines.slice(0, MAX_NOTE_LINES - 1), '...'];
    const noteBoxHeight = noteLines.length ? noteLines.length * NOTE_LINE_HEIGHT + 36 : 0;
    const noteSpace = noteLines.length ? NOTE_GAP_TOP + noteBoxHeight + NOTE_GAP_BOTTOM : 0;
    const noteSourceLine = noteRequested ? Math.min(...requestedHighlights) : 0;

    const fitsAt = (size: number) => source.every(line => textWidth(ctx, line, size, 500, 'mono') <= CONTENT_WIDTH);
    let size = 36;
    for (let candidate = 60; candidate >= 36; candidate--) {
      const lineH = Math.round(candidate * 1.6);
      const fitsWidth = fitsAt(candidate);
      const lineCount = source.length;
      const height = WINDOW_CHROME_HEIGHT + lineCount * lineH + noteSpace;
      if (fitsWidth && height <= MAX_CONTENT_HEIGHT) {
        size = candidate;
        break;
      }
    }
    const lineH = Math.round(size * 1.6);
    const wrap = !fitsAt(size);
    let groups: CodeGroup[] = source.map((line, index) => ({
      sourceLine: index + 1,
      rows: (wrap ? wrapMeasured(ctx, line, CONTENT_WIDTH, size, 500, 'mono') : [line]).map((text, segment) => ({ text, sourceLine: index + 1, segment })),
    }));

    const maxRows = Math.max(1, Math.floor((MAX_CONTENT_HEIGHT - WINDOW_CHROME_HEIGHT - noteSpace) / lineH));
    const displayRows = groups.reduce((count, group) => count + group.rows.length, 0);
    if (displayRows > maxRows) {
      let remaining = maxRows;
      groups = groups.map(group => {
        if (remaining <= 0) return { ...group, rows: [] };
        const kept = group.rows.slice(0, remaining);
        remaining -= kept.length;
        if (kept.length && kept.length < group.rows.length) {
          const last = kept.length - 1;
          kept[last] = { ...kept[last]!, text: fitTrailingEllipsis(ctx, kept[last]!.text, CONTENT_WIDTH, size) };
        }
        return { ...group, rows: kept };
      }).filter(group => group.rows.length > 0);
    }

    const visibleHighlights = new Set([...requestedHighlights].filter(line => groups.some(group => group.sourceLine === line)));
    const visibleNoteLine = noteSourceLine && visibleHighlights.has(noteSourceLine) ? noteSourceLine : 0;
    const finalNoteSpace = visibleNoteLine ? noteSpace : 0;
    const contentRows = groups.reduce((count, group) => count + group.rows.length, 0);
    const enter = clamp(t / Math.min(0.08, Math.max(0.04, dur * 0.025)));
    if (enter <= 0) return;

    const typeEnd = Math.min(0.8, Math.max(0.28, dur * 0.32));
    const hiAt = frame.events?.find(event => event.kind === 'highlight')?.at ?? 0.12 + typeEnd + 0.05;
    const noteP = visibleNoteLine ? ease.outExpo(clamp((t - hiAt - 0.05) / 0.18)) : 0;
    const noteCurrentSpace = finalNoteSpace * noteP;
    const height = WINDOW_CHROME_HEIGHT + contentRows * lineH + noteCurrentSpace;
    const y = Math.round(740 - height / 2);
    const entrance = ease.outBack(enter);
    ctx.save();
    ctx.translate(540, y + height / 2);
    ctx.scale(0.9 + 0.1 * entrance, 0.9 + 0.1 * entrance);
    ctx.translate(-540, -(y + height / 2));

    // Plain panel: the filename is the only furniture, no window buttons.
    panel(ctx, 96, y, 888, height, { fill: theme.panel, stroke: theme.line, lineWidth: 4 });
    const filename = fitLabel(ctx, props.filename ?? '', 760);
    if (filename) text(ctx, filename, 132, y + 60, { size: 48, color: theme.dim, family: 'mono', weight: 800, baseline: 'middle' });
    const box = { x: 132, y: y + (filename ? WINDOW_CHROME_HEIGHT : 48), w: 816, h: height - WINDOW_CHROME_HEIGHT - 36 };
    const typing = props.typing !== false;
    const totalChars = groups.reduce((sum, group) => sum + group.rows.reduce((n, row) => n + row.text.length, 0), 0);
    const typed = typing ? Math.floor(totalChars * clamp((t - 0.12) / Math.max(0.12, typeEnd))) : totalChars;
    let offset = 0;
    let rowIndex = 0;
    let rowY = box.y;
    let noteDrawn = false;

    for (const group of groups) {
      for (const row of group.rows) {
        const line = row.text;
        const visibleChars = typing
          ? Math.ceil(line.length * clamp((typed - offset) / Math.max(1, line.length)))
          : (t < 0.12 + rowIndex * 0.035 ? 0 : line.length);
        const isHighlighted = visibleHighlights.has(row.sourceLine) && t >= hiAt;
        const reveal = isHighlighted ? ease.outExpo(clamp((t - hiAt) / 0.12)) : 0;
        const rowX = box.x - 36;
        if (isHighlighted) {
          ctx.fillStyle = theme.panelAlt;
          ctx.fillRect(rowX, rowY, box.w + 72, lineH - 3);
          ctx.fillStyle = theme.accent;
          ctx.fillRect(rowX, rowY, 12 * reveal, lineH - 3);
        }

        ctx.save();
        if (!isHighlighted) ctx.globalAlpha *= 0.62;
        ctx.textAlign = 'left';
        const codeX = box.x + 8;
        const visible = Array.from(line).slice(0, visibleChars).join('');
        drawCode(ctx, visible, codeX, rowY + 1, size, theme);
        const isLastRow = rowIndex === contentRows - 1;
        const typingActive = typing && visibleChars > 0 && visibleChars < line.length;
        const idleReady = isLastRow && visibleChars === line.length && (!typing || t >= 0.12 + typeEnd);
        if (typingActive || idleReady) {
          const caretText = typingActive ? Array.from(line).slice(0, visibleChars).join('') : line;
          const cx = Math.min(codeX + textWidth(ctx, caretText, size, 500, 'mono'), box.x + box.w - 12);
          cursor(ctx, cx, rowY + 3, Math.max(5, size * 0.12), size * 1.12, theme.fg, t);
        }
        ctx.restore();

        rowY += lineH;
        rowIndex++;
        offset += line.length;
      }

      if (visibleNoteLine === group.sourceLine && !noteDrawn) {
        const noteTop = rowY + NOTE_GAP_TOP * noteP;
        const noteHeight = noteBoxHeight * noteP;
        const noteX = box.x + 8;
        const noteW = Math.min(box.w - 8, Math.max(160, Math.max(...noteLines.map(line => textWidth(ctx, line, NOTE_SIZE, 800, 'body'))) + 48));
        const arrowX = noteX + Math.min(36, noteW / 2);
        const arrowP = clamp((t - hiAt - 0.04) / 0.2);
        drawSteppedArrow(ctx, arrowX, rowY, noteTop, theme.fg, arrowP);

        if (noteP > 0) {
          ctx.fillStyle = theme.fg;
          ctx.fillRect(noteX, noteTop, noteW, noteHeight);
          if (noteP > 0.62) {
            const textScale = 0.9 + 0.1 * ease.outBack((noteP - 0.62) / 0.38);
            ctx.save();
            ctx.translate(noteX + noteW / 2, noteTop + noteHeight / 2);
            ctx.scale(textScale, textScale);
            ctx.translate(-(noteX + noteW / 2), -(noteTop + noteHeight / 2));
            ctx.font = font(NOTE_SIZE, 800, 'body');
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';
            ctx.fillStyle = theme.bg;
            const lineHeight = NOTE_LINE_HEIGHT;
            const totalH = noteLines.length * lineHeight;
            noteLines.forEach((line, index) => ctx.fillText(line, noteX + 24, noteTop + (noteHeight - totalH) / 2 + index * lineHeight));
            ctx.restore();
          }
        }
        rowY += noteCurrentSpace;
        noteDrawn = true;
      }
    }
    ctx.restore();
  },
};

function fitTrailingEllipsis(ctx: Frame['ctx'], value: string, maxWidth: number, size: number): string {
  const chars = Array.from(value);
  while (chars.length && textWidth(ctx, chars.join('') + '...', size, 500, 'mono') > maxWidth) chars.pop();
  return chars.join('') + '...';
}


function fitLabel(ctx: Frame['ctx'], value: string, maxWidth: number): string {
  const chars = Array.from(String(value ?? '').trim());
  if (textWidth(ctx, chars.join(''), 48, 800, 'mono') <= maxWidth) return chars.join('');
  while (chars.length && textWidth(ctx, chars.join('') + '...', 48, 800, 'mono') > maxWidth) chars.pop();
  return chars.length ? chars.join('') + '...' : '';
}
