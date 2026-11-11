import { type Frame, type TerminalProps, type SceneDef, SAFE, CONTENT_BOTTOM, clamp, ease, font, prog, snap } from '../core.ts';
import { cursor, panel, pixelText, pop, textWidth } from '../prim.ts';

const MAX_TEXT = 2400;
const CMD_SIZE = 44;
const OUT_SIZE = 38;
const CMD_STEP = 66;
const OUT_STEP = 57;

type TerminalRow = {
  cmd: string[];
  out: string[];
  status?: 'ok' | 'fail' | 'info';
  height: number;
};

function wrap(ctx: Frame['ctx'], value: string, width: number, size: number, weight: number): string[] {
  const raw = String(value ?? '');
  const source = raw.length > MAX_TEXT ? raw.slice(0, MAX_TEXT - 1) + '…' : raw;
  ctx.font = font(size, weight, 'mono');
  const rows: string[] = [];
  for (const paragraph of source.split('\n')) {
    if (!paragraph) { rows.push(''); continue; }
    let row = '';
    for (const ch of paragraph) {
      if (row && ctx.measureText(row + ch).width > width) {
        rows.push(row);
        row = '';
      }
      row += ch;
    }
    rows.push(row);
  }
  return rows;
}

function visibleRows(rows: string[], count: number): string[] {
  let remaining = Math.max(0, count);
  return rows.map(row => {
    const visible = [...row].slice(0, remaining).join('');
    remaining -= [...row].length;
    return visible;
  });
}

export const terminalScene: SceneDef<TerminalProps> = {
  type: 'terminal',
  render(frame: Frame, props: TerminalProps) {
    const { ctx, theme } = frame;
    const t = Math.max(0, frame.t);
    const rows = (Array.isArray(props?.lines) ? props.lines : []).slice(0, 6);
    const innerX = SAFE.x + 36;
    const innerW = SAFE.w - 72;
    const cmdRowsMax = innerW - 72;
    const outRowsMax = innerW - 64;
    const layouts: TerminalRow[] = rows.map(item => {
      const cmd = wrap(ctx, item?.cmd ?? '', cmdRowsMax, CMD_SIZE, 800);
      const outText = String(item?.out ?? '');
      const out = outText ? wrap(ctx, outText, outRowsMax, OUT_SIZE, 700) : [];
      const height = cmd.length * CMD_STEP + (out.length ? 18 + Math.max(44, out.length * OUT_STEP) : 0);
      return { cmd, out, status: item?.status, height };
    });
    const gap = 30;
    const contentHeight = layouts.reduce((sum, row) => sum + row.height, 0) + Math.max(0, layouts.length - 1) * gap;
    const naturalHeight = 84 + 48 + contentHeight;
    const winH = Math.min(CONTENT_BOTTOM - 240, Math.max(700, naturalHeight));
    const targetY = 740 - winH / 2;
    const entrance = ease.outExpo(prog(t, 0, Math.min(.24, frame.dur * .16)));
    const winY = snap(targetY - (1 - entrance) * 48);
    const headerH = 84;
    panel(ctx, SAFE.x, winY, SAFE.w, winH, { fill: theme.panel, stroke: theme.line, lineWidth: 4 });
    ctx.fillStyle = theme.panelAlt;
    ctx.fillRect(SAFE.x + 2, winY + 2, SAFE.w - 4, headerH - 2);
    ctx.fillStyle = theme.line;
    ctx.fillRect(SAFE.x, winY + headerH, SAFE.w, 4);
    for (let dot = 0; dot < 3; dot++) {
      ctx.fillStyle = dot === 0 ? theme.fg : theme.muted;
      ctx.fillRect(SAFE.x + 28 + dot * 32, winY + 32, 18, 18);
    }
    const title = String(props?.title || 'TERMINAL').toUpperCase().slice(0, 24);
    pixelText(ctx, title, SAFE.right - 30, winY + 25, 5, { color: theme.dim, align: 'right' });

    const innerY = winY + headerH + 24;
    const innerH = winH - headerH - 48;
    const contentInset = 18;
    const viewportH = innerH - contentInset * 2;
    const slot = rows.length ? frame.dur * .64 / rows.length : frame.dur;
    const active = rows.length ? Math.min(rows.length - 1, Math.floor(t / Math.max(.001, slot))) : -1;
    const tops: number[] = [];
    let measured = 0;
    layouts.forEach((row, index) => {
      tops.push(measured);
      measured += row.height + (index < layouts.length - 1 ? gap : 0);
    });
    const targetScroll = active >= 0
      ? clamp(tops[active]! + layouts[active]!.height - viewportH, 0, Math.max(0, contentHeight - viewportH))
      : 0;
    const contentTop = innerY + contentInset + (contentHeight <= viewportH ? (viewportH - contentHeight) / 2 : 0);
    const scroll = targetScroll;
    ctx.save();
    ctx.beginPath();
    ctx.rect(innerX, innerY, innerW, innerH);
    ctx.clip();
    layouts.forEach((row, index) => {
      const rowTop = contentTop + tops[index]! - scroll;
      if (rowTop > innerY + innerH || rowTop + row.height < innerY) return;
      const local = t - index * slot;
      if (local < 0) return;
      const cmdProgress = clamp((local - slot * .02) / Math.max(.06, slot * .48));
      const cmdCount = Math.floor(row.cmd.reduce((sum, line) => sum + [...line].length, 0) * cmdProgress);
      const shownCmd = visibleRows(row.cmd, cmdCount);
      const cmdX = innerX + 68;
      row.cmd.forEach((line, lineIndex) => {
        const y = rowTop + lineIndex * CMD_STEP;
        if (lineIndex === 0) pixelText(ctx, '>', innerX + 4, y + 5, 8, { color: theme.muted });
        if (!shownCmd[lineIndex]) return;
        ctx.font = font(CMD_SIZE, 800, 'mono');
        ctx.fillStyle = theme.fg;
        ctx.textBaseline = 'top';
        ctx.fillText(shownCmd[lineIndex]!, cmdX, y);
      });
      if (index === active && cmdProgress < 1) {
        let last = 0;
        let lineIndex = 0;
        for (let li = 0; li < row.cmd.length; li++) {
          const next = last + [...row.cmd[li]!].length;
          if (cmdCount <= next || li === row.cmd.length - 1) { lineIndex = li; break; }
          last = next;
        }
        const caretText = shownCmd[lineIndex] ?? '';
        cursor(ctx, cmdX + textWidth(ctx, caretText, CMD_SIZE, 800, 'mono'), rowTop + lineIndex * CMD_STEP + 8, 18, 48, theme.fg, t);
      }

      if (row.out.length) {
        const outputStart = slot * .54;
        const outputProgress = clamp((local - outputStart) / Math.max(.06, slot * .44));
        if (outputProgress <= 0) return;
        const outY = rowTop + row.cmd.length * CMD_STEP + 12;
        const isFail = row.status === 'fail';
        const badgeColor = isFail ? theme.accent : row.status === 'ok' ? theme.fg : theme.panelAlt;
        const badge = 44;
        const maxLineWidth = Math.max(0, ...row.out.map(line => textWidth(ctx, line, OUT_SIZE, 700, 'mono')));
        const hitCenterX = innerX + 4 + (badge + 20 + maxLineWidth) / 2;
        const outCount = Math.ceil(row.out.reduce((sum, line) => sum + [...line].length, 0) * outputProgress);
        const shownOut = visibleRows(row.out, outCount);
        const drawOutput = () => {
          ctx.fillStyle = badgeColor;
          ctx.fillRect(innerX + 4, outY, badge, badge);
          if (isFail) {
            ctx.strokeStyle = theme.onAccent;
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.moveTo(innerX + 15, outY + 11); ctx.lineTo(innerX + 37, outY + 33);
            ctx.moveTo(innerX + 37, outY + 11); ctx.lineTo(innerX + 15, outY + 33);
            ctx.stroke();
          } else if (row.status === 'ok') {
            ctx.strokeStyle = theme.bg;
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.moveTo(innerX + 13, outY + 23); ctx.lineTo(innerX + 21, outY + 31); ctx.lineTo(innerX + 38, outY + 13);
            ctx.stroke();
          } else {
            ctx.fillStyle = theme.dim;
            ctx.fillRect(innerX + 17, outY + 17, 18, 18);
          }
          ctx.font = font(OUT_SIZE, 700, 'mono');
          ctx.fillStyle = isFail ? theme.accent : theme.dim;
          ctx.textBaseline = 'top';
          shownOut.forEach((line, lineIndex) => {
            if (line) ctx.fillText(line, innerX + 64, outY + lineIndex * OUT_STEP);
          });
        };
        if (isFail) {
          const hit = ease.outBack(prog(local, outputStart, Math.min(.18, slot * .48)));
          pop(ctx, hitCenterX, outY + Math.max(badge, row.out.length * OUT_STEP) / 2, Math.max(.01, hit), 1, drawOutput);
        } else drawOutput();
      }
    });
    if (active >= 0 && t >= rows.length * slot) {
      const caretY = contentTop + contentHeight - scroll + 6;
      cursor(ctx, innerX + 4, caretY, 18, 44, theme.fg, t);
    }
    ctx.restore();
  },
};
