import { clamp, ease, lerp, prog, type Frame, type ObjectRect } from '../../core.ts';
import { beat, copy, focusText, marker } from './draw.ts';

export function attribution(frame: Frame, source: string, date: string, top = 880) {
  copy(frame, source, 120, top, 768, { size: 60, maxLines: 1, muted: true });
  copy(frame, date, 120, top + 70, 768, { size: 60, maxLines: 1, muted: true });
}

export function sourceImage(frame: Frame, asset: string, rect: ObjectRect | undefined, verdict: string, source: string, date: string, destination?: ObjectRect) {
  const image = frame.assets?.[asset];
  if (!image) { focusText(frame, 'Capture unavailable', 96); return; }
  const initial = rect ?? { x: 0, y: 0, w: image.width, h: image.height };
  const target = destination ?? initial;
  const travel = beat(frame, 0), highlight = beat(frame, 1), resolved = beat(frame, 2, frame.dur + 1);
  if (resolved > .5) {
    focusText(frame, verdict, 112, 500, resolved);
  } else {
    const width = Math.max(1, lerp(initial.w, target.w, travel)), height = Math.max(1, lerp(initial.h, target.h, travel));
    const left = clamp(lerp(initial.x, target.x, travel), 0, image.width - 1), top = clamp(lerp(initial.y, target.y, travel), 0, image.height - 1);
    const scale = Math.min(768 / width, 300 / height);
    const drawnHeight = height * scale, screenTop = 560 + (260 - drawnHeight) / 2;
    frame.ctx.save(); frame.ctx.beginPath(); frame.ctx.rect(120, screenTop, width * scale, drawnHeight); frame.ctx.clip();
    frame.ctx.drawImage(image, 120 - left * scale, screenTop - top * scale, image.width * scale, image.height * scale);
    frame.ctx.globalCompositeOperation = 'multiply';
    marker(frame, 120, screenTop + drawnHeight * .18, width * scale, drawnHeight * .70, highlight);
    frame.ctx.restore();
  }
  attribution(frame, source, date);
}

export function quotation(frame: Frame, text: string, source: string, date: string) {
  const words = String(text).split(/\s+/).filter(Boolean), chunks: string[] = [];
  for (let index = 0; index < words.length; index += 6) chunks.push(words.slice(index, index + 6).join(' '));
  const selected = Math.min(chunks.length - 1, Math.floor(frame.t / Math.max(.1, frame.dur) * chunks.length));
  focusText(frame, `${selected === 0 ? '“' : ''}${chunks[selected] ?? ''}${selected === chunks.length - 1 ? '”' : ''}`, 88, 500, beat(frame, selected));
  attribution(frame, source, date);
}

/** One clause on a capture: one or more word boxes in original image pixels (a clause may wrap onto the next line). */
export type Clause = ObjectRect[];

const PAPER = { top: 440, bottom: 990 };
const LEAD = .32;

function view(clause: Clause, image: { width: number; height: number }) {
  const focus = clause[clause.length - 1] ?? { x: 0, y: 0, w: image.width, h: image.height };
  return { x: focus.x + focus.w / 2, y: focus.y + focus.h / 2, scale: Math.min(2.4, 860 / Math.max(1, focus.w)) };
}

/**
 * Reads a real capture like an editor: the camera flies from clause to clause on
 * the spoken anchors, the rest of the paragraph stays covered, and the marker lands
 * on the exact source words. Clauses before `held` are already marked.
 */
export function inspect(frame: Frame, asset: string, clauses: Clause[], held: number, source: string, date: string) {
  const image = frame.assets?.[asset];
  attribution(frame, source, date, 296);
  if (!image || !clauses.length) { focusText(frame, 'Capture unavailable', 96); return; }
  const { ctx, theme } = frame;
  // Clauses without their own event are reached on the entrance: the cut itself is the first camera move.
  const events = frame.events ?? [], entrance = events.length ? Math.max(0, clauses.length - held - events.length) : 0;
  const at = clauses.map((_, index) => index < held ? -1 : index - held < entrance ? LEAD : events[index - held - entrance]?.at ?? .5 + .7 * (index - held));
  const travel = at.map(start => start < 0 ? 1 : ease.inOutCubic(prog(frame.t, start - LEAD, LEAD)));
  const sweep = at.map(start => start < 0 ? 1 : ease.outCubic(prog(frame.t, start, .16)));
  let current = 0;
  travel.forEach((value, index) => { if (value > 0) current = index; });
  const from = view(clauses[Math.max(0, current - 1)]!, image), to = view(clauses[current]!, image), p = current ? travel[current]! : 1;
  // A short fly: the camera pulls back mid-travel, so a jump across the page reads as movement over paper.
  const lift = 1 - .22 * Math.sin(Math.PI * p) * Math.min(1, Math.hypot(to.x - from.x, to.y - from.y) / 300);
  // The first look lands slightly too close and settles, like a hand pulling the page into focus.
  const opening = held === 0 && travel[0]! < 1 ? 1.1 - .1 * travel[0]! : 1;
  const scale = Math.exp(lerp(Math.log(from.scale), Math.log(to.scale), p)) * lift * opening;
  const cx = lerp(from.x, to.x, p), cy = lerp(from.y, to.y, p);
  const centre = (PAPER.top + PAPER.bottom) / 2;
  const toScreen = (box: ObjectRect) => ({ x: 540 + (box.x - cx) * scale, y: centre + (box.y - cy) * scale, w: box.w * scale, h: box.h * scale });
  // A line sliced by the top or bottom paper edge would be unreadable, so it stays covered; sideways the page may slide out of
  // frame, and a clause wrapped onto the next line shows as soon as either part is on screen.
  const pad = Math.min(14, 7 * scale);
  const hole = (box: ObjectRect) => { const s = toScreen(box); return [s.x - pad, s.y - pad, s.w + 2 * pad, s.h + 2 * pad] as const; };
  const inView = (clause: Clause) => clause.every(box => { const [, y, , h] = hole(box); return y >= PAPER.top && y + h <= PAPER.bottom; })
    && clause.some(box => { const [x, , w] = hole(box); return x + w > 0 && x < 1080; });
  // The first unread clause is on the page from the cut, so the paper is never blank while the voice reaches it.
  const shown = clauses.map((clause, index) => (travel[index]! > 0 || index === held) && inView(clause));
  ctx.save();
  ctx.beginPath(); ctx.rect(0, PAPER.top, 1080, PAPER.bottom - PAPER.top); ctx.clip();
  // Marker first, then the capture multiplied on top: the page's white becomes our paper, its glyph pixels stay untouched.
  clauses.forEach((clause, index) => {
    if (!shown[index] || sweep[index]! <= 0) return;
    ctx.save(); ctx.globalAlpha = sweep[index]!;
    clause.forEach(box => { const [x, y, w, h] = hole(box); marker(frame, x, y, w, h); });
    ctx.restore();
  });
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(image, 540 - cx * scale, centre - cy * scale, image.width * scale, image.height * scale);
  ctx.globalCompositeOperation = 'source-over';
  // Spotlight: only the clauses being read are uncovered; the clause the camera flies to is revealed during the flight.
  ctx.beginPath(); ctx.rect(0, PAPER.top, 1080, PAPER.bottom - PAPER.top);
  clauses.forEach((clause, index) => { if (shown[index]) clause.forEach(box => ctx.rect(...hole(box))); });
  ctx.fillStyle = theme.bg; ctx.fill('evenodd');
  clauses.forEach((clause, index) => {
    if (!shown[index] || index === held || travel[index]! >= 1) return;
    // Uncovered left to right, so the clause is always solid ink rather than a grey ghost.
    clause.forEach(box => { const [x, y, w, h] = hole(box); ctx.fillRect(x + w * travel[index]!, y, w * (1 - travel[index]!), h); });
  });
  ctx.restore();
}
