import { clamp, ease, markupWords, stripMarkup, type Frame } from '../../core.ts';

export const SANS = "'System Geist', Inter, Helvetica, Arial, sans-serif";
export const MONO = "'System Geist Mono', Consolas, monospace";
export const LEFT = 96;
export const WIDTH = 888;
// One command panel fills the content zone; the caption sits directly under it.
// Kept above y 1000 so nothing reaches the Reels action rail on the right.
export const PANEL = { x: LEFT, y: 300, w: WIDTH, h: 680 } as const;
export const CAPTION_TOP = 1028;
export const CAPTION_WIDTH = 820;
const INSET = 56;
export const RAIL_Y = PANEL.y + PANEL.h - 104;
const NODE = 64;

export function ink(frame: Frame, value: string, x: number, y: number, size = 72, width = WIDTH, color = frame.theme.fg, mono = false) {
  const { ctx } = frame;
  ctx.save(); ctx.textBaseline = 'top'; ctx.textAlign = 'left';
  ctx.font = `600 ${Math.max(64, size)}px ${mono ? MONO : SANS}`;
  ctx.fillStyle = color; ctx.fillText(stripMarkup(value), x, y, width); ctx.restore();
}

/** Wraps marked-up prose, shrinking towards `minimum` until it fits `maxLines`. Returns the drawn height. */
export function prose(frame: Frame, value: string, x: number, y: number, width = WIDTH, size = 80, maxLines = 3, color = frame.theme.fg, minimum = 64) {
  const { ctx } = frame;
  const words = markupWords(value ?? '');
  let rows: typeof words[] = [];
  let actual = size;
  for (; actual >= minimum; actual -= 2) {
    ctx.font = `600 ${actual}px ${SANS}`; rows = [];
    let row: typeof words = [];
    for (const word of words) {
      if (row.length && ctx.measureText([...row, word].map(part => part.text).join(' ')).width > width) { rows.push(row); row = []; }
      row.push(word);
    }
    if (row.length) rows.push(row);
    if (rows.length <= maxLines) break;
  }
  actual = Math.max(minimum, actual);
  // Never drop words silently: overflow stays on the last line, where QA can see it.
  if (rows.length > maxLines) rows = [...rows.slice(0, maxLines - 1), rows.slice(maxLines - 1).flat()];
  rows.forEach((row, index) => {
    let offset = x;
    row.forEach(word => {
      ink(frame, word.text, offset, y + index * actual * 1.16, actual, width, word.accent ? frame.theme.accent : color);
      ctx.font = `600 ${actual}px ${SANS}`;
      offset += ctx.measureText(word.text + ' ').width;
    });
  });
  return Math.min(rows.length, maxLines) * actual * 1.16;
}

export function line(frame: Frame, x: number, y: number, endX: number, endY: number, color = frame.theme.line, amount = 1) {
  frame.ctx.beginPath(); frame.ctx.moveTo(x, y); frame.ctx.lineTo(x + (endX - x) * clamp(amount), y + (endY - y) * clamp(amount));
  frame.ctx.strokeStyle = color; frame.ctx.lineWidth = 4; frame.ctx.stroke();
}

export function box(frame: Frame, x: number = PANEL.x, y: number = PANEL.y, width: number = PANEL.w, height: number = PANEL.h, focus = false) {
  frame.ctx.fillStyle = frame.theme.panel; frame.ctx.fillRect(x, y, width, height);
  frame.ctx.strokeStyle = focus ? frame.theme.accent : frame.theme.line; frame.ctx.lineWidth = focus ? 4 : 2; frame.ctx.strokeRect(x, y, width, height);
}

function anchors(frame: Pick<Frame, 'events' | 'hits'>) { return frame.events?.length ? frame.events.map(event => event.at) : frame.hits ?? []; }
export function beat(frame: Frame, index: number, fallback = (index + 1) * .72) { return frame.events?.[index]?.at ?? frame.hits?.[index] ?? fallback; }
export function progress(frame: Frame, index: number, duration = .24) { return ease.outCubic(clamp((frame.t - beat(frame, index)) / duration)); }
export function state(frame: Frame, count: number) {
  const marks = anchors(frame);
  return Math.min(Math.max(0, count - 1), marks.length ? marks.filter(anchor => anchor <= frame.t).length : Math.floor(frame.t / Math.max(.6, frame.dur / Math.max(1, count))));
}
/** Seconds since the latest event anchor (Infinity before the first one). Drives every state-replacement accent. */
export function since(frame: Pick<Frame, 't' | 'events' | 'hits'>) {
  const passed = anchors(frame).filter(anchor => anchor <= frame.t);
  return passed.length ? frame.t - Math.max(...passed) : Infinity;
}

/** Event-driven punch-in towards the panel plus a slow push, no shake. Leaves one save() open for the player. */
export function camera(frame: Frame) {
  const { ctx } = frame;
  ctx.save();
  const elapsed = since(frame);
  const punch = Number.isFinite(elapsed) ? .028 * Math.exp(-elapsed / .14) : 0;
  const scale = 1 + .018 * clamp(frame.t / Math.max(.6, frame.dur)) + punch;
  const cx = PANEL.x + PANEL.w / 2, cy = PANEL.y + PANEL.h / 2;
  ctx.translate(cx, cy); ctx.scale(scale, scale); ctx.translate(-cx, -cy);
}

/**
 * The single SYSTEM object: a command panel whose state is replaced on every event. A packet (optionally named)
 * travels the rail between the first two events; on contact the output port fires a ring and the value resolves.
 */
export function command(frame: Frame, label: string, value?: string, active = false, packet?: string, rail = true) {
  const { ctx, theme } = frame;
  const start = beat(frame, 0), contact = beat(frame, Math.max(1, (frame.events?.length ?? 0) - 1));
  const travel = ease.inOutCubic(clamp((frame.t - start) / Math.max(.24, contact - start)));
  const resolved = frame.t >= contact;
  const lit = active && resolved;
  const swap = frame.opening && frame.t < start ? 1 : ease.outCubic(clamp(since(frame) / .22));
  const pulse = Math.max(0, 1 - since(frame) / .36);

  box(frame, PANEL.x, PANEL.y, PANEL.w, PANEL.h, lit);
  ctx.fillStyle = lit || pulse > 0 ? theme.accent : theme.line; ctx.fillRect(PANEL.x, PANEL.y, 10 + pulse * 14, PANEL.h);

  ctx.save(); ctx.translate(0, (1 - swap) * 44);
  const top = PANEL.y + INSET;
  const used = prose(frame, label, PANEL.x + INSET, top, PANEL.w - INSET * 2, value ? 88 : 128, value ? 2 : 3, value ? theme.dim : theme.fg, 72);
  if (value) prose(frame, value, PANEL.x + INSET, top + Math.max(used, 104) + 40, PANEL.w - INSET * 2, 208, 1, lit ? theme.accent : theme.fg, 96);
  ctx.restore();
  // Replacement sweep: a scan bar crosses the slot that just changed state.
  if (swap < 1) { ctx.fillStyle = theme.accent; ctx.fillRect(PANEL.x + INSET + swap * (PANEL.w - INSET * 2 - 120), top - 24, 120, 8); }

  if (!rail) return;
  const railStart = PANEL.x + INSET, railEnd = PANEL.x + PANEL.w - INSET - NODE;
  line(frame, railStart, RAIL_Y + NODE / 2, railEnd, RAIL_Y + NODE / 2);
  line(frame, railStart, RAIL_Y + NODE / 2, railEnd, RAIL_Y + NODE / 2, theme.accent, resolved ? 1 : travel);
  ctx.fillStyle = resolved ? theme.accent : theme.line; ctx.fillRect(railEnd, RAIL_Y, NODE, NODE);
  if (resolved && pulse > 0) {
    const ring = 1 - pulse;
    ctx.save(); ctx.strokeStyle = theme.accent; ctx.lineWidth = 6; ctx.globalAlpha = pulse;
    ctx.strokeRect(railEnd - ring * 56, RAIL_Y - ring * 56, NODE + ring * 112, NODE + ring * 112); ctx.restore();
  }
  if (!resolved) {
    const x = railStart + travel * (railEnd - railStart - NODE);
    ctx.fillStyle = theme.accent; ctx.fillRect(x, RAIL_Y, NODE, NODE);
    if (packet) { ctx.save(); ctx.font = `600 72px ${MONO}`; const width = ctx.measureText(packet).width; ctx.restore(); ink(frame, packet, clamp(x + NODE / 2 - width / 2, railStart, railEnd + NODE - width), RAIL_Y - 96, 72, PANEL.w, theme.accent, true); }
  }
}

export function process(frame: Frame, title: string, steps: { label: string; note?: string }[]) {
  const selected = steps[state(frame, steps.length)]; command(frame, selected?.label ?? title, selected?.note, progress(frame, 1) > 0);
}
export function rows(frame: Frame, items: { label: string; detail?: string }[], title: string) {
  const selected = items[state(frame, items.length)]; command(frame, selected?.label ?? title, selected?.detail, true);
}
export function bars(frame: Frame, title: string, items: { label: string; value: number }[], unit = '') {
  const selected = items[state(frame, items.length)]; command(frame, selected?.label ?? title, selected ? `${selected.value.toLocaleString('en-US')}${unit}` : undefined, true);
}
