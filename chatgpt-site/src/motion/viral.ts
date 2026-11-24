// The "viral" reel look: a big hook over the opening shot that settles into a
// persistent topic header, and large stroked word-pop captions. Everything here
// is a pure function of reel time and draws in device pixels (1080 x 1920).
import { clamp, ease, font, markupWords, type Ctx, type PlacedScene, type ReelSpec } from './core.ts';
import type { ActiveCaption } from './captions.ts';

const YELLOW = '#FFD23F', INK = '#0B0B0D', WHITE = '#FFFFFF';
const HEADER_Y = 150, HOOK_Y = 330, PAYOFF_Y = 1440;
/** The payoff card replaces the captions once the narration has finished, so it never covers the final shot. */
function payoffAt(captions: readonly ActiveCaption[], end: number, hookEnd: number) { const last = captions.at(-1)?.end; return Math.max(hookEnd + 1, last !== undefined && last < end - 0.4 ? last : end - 1.4); }
// The persistent header collided with in-shot signs at the top of the stage; the hook and payoff cards carry the topic instead.
const SHOW_HEADER = false;

/** Attach punctuation tokens (".", "?") to the previous word so cards never show "PAYS .". */
function joinPunctuation(words: { text: string; accent: boolean }[]) {
  return words.reduce<{ text: string; accent: boolean }[]>((list, w) => { if (/^[.,!?;:…%)\]}”’"]+$/.test(w.text) && list.length) list[list.length - 1]!.text += w.text; else list.push({ ...w }); return list; }, []);
}
function width(ctx: Ctx, text: string, size: number) { ctx.font = font(size, 900); return ctx.measureText(text).width; }
function wrap(ctx: Ctx, words: string[], size: number, max: number) {
  const lines: string[][] = []; let line: string[] = [];
  for (const word of words) { const next = [...line, word]; if (line.length && width(ctx, next.join(' '), size) > max) { lines.push(line); line = [word]; } else line = next; }
  if (line.length) lines.push(line);
  return lines;
}
/** Balanced lines at the largest size that fits `maxLines` lines in `max` px. */
function fit(ctx: Ctx, text: string, sizes: number[], max: number, maxLines: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  for (const size of sizes) { const lines = wrap(ctx, words, size, max); if (lines.length <= maxLines) return { size, lines }; }
  const size = sizes.at(-1)!; return { size, lines: wrap(ctx, words, size, max) };
}
function strokedText(ctx: Ctx, text: string, x: number, y: number, size: number, fill: string, stroke = INK, strokeWidth = size * 0.2) {
  ctx.font = font(size, 900); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.miterLimit = 2;
  ctx.lineWidth = strokeWidth; ctx.strokeStyle = stroke; ctx.strokeText(text, x, y);
  ctx.fillStyle = fill; ctx.fillText(text, x, y);
}
/** Draw a line where `*marked*` words are yellow and the rest white. */
function richLine(ctx: Ctx, words: { text: string; accent: boolean }[], cx: number, y: number, size: number) {
  ctx.font = font(size, 900);
  const space = ctx.measureText(' ').width, widths = words.map(w => ctx.measureText(w.text).width);
  let x = cx - (widths.reduce((a, b) => a + b, 0) + space * (words.length - 1)) / 2;
  words.forEach((word, i) => { strokedText(ctx, word.text, x + widths[i]! / 2, y, size, word.accent ? YELLOW : WHITE); x += widths[i]! + space; });
}

/** When the hook card leaves the screen (reel seconds); 0 without a hook. */
export function hookEndTime(spec: ReelSpec, placed: PlacedScene[]) { return spec.hook?.trim() ? Math.min(Math.max(1.6, placed[0]?.end ?? 0), 3.2) : 0; }

/** When the narration first says the concept's name: the start of its first word on the reel timeline. */
export function termTime(term: string | undefined, captions: readonly ActiveCaption[]): number | undefined {
  const norm = (w: string) => w.toLowerCase().replace(/[^a-z0-9$%]/g, '');
  const target = (term ?? '').split(/\s+/).map(norm).filter(Boolean);
  if (!target.length) return undefined;
  for (const caption of captions) {
    const words = String(caption.text).split(/\s+/).map(norm).filter(Boolean);
    for (let i = 0; i + target.length <= words.length; i++) {
      if (target.every((w, k) => words[i + k] === w)) return caption.wordTimings?.[i]?.start ?? caption.start;
    }
  }
  return undefined;
}

function cardText(text: string) { return joinPunctuation(markupWords(text.toUpperCase()).map(w => ({ text: w.text, accent: !!w.accent }))); }
/** The device-space band covered by whichever overlay card (hook, concept term or payoff) is on screen. */
export function cardZone(ctx: Ctx, spec: ReelSpec, time: number, placed: PlacedScene[], captions: readonly ActiveCaption[] = []): { top: number; bottom: number } | undefined {
  const hook = spec.hook?.trim(), firstEnd = placed[0]?.end ?? 0, hookEnd = hook ? Math.min(Math.max(1.6, firstEnd), 3.2) : 0;
  const end = placed.at(-1)?.end ?? 0, payoffStart = payoffAt(captions, end, hookEnd);
  const band = (text: string, sizes: number[], max: number, lineK: number, pad: number, center: number) => {
    const { size, lines } = fit(ctx, cardText(text).map(w => w.text).join(' '), sizes, max, 3);
    const h = lines.length * size * lineK + pad;
    return { top: center - h / 2 - 12, bottom: center + h / 2 + 12 };
  };
  if (hook && time < hookEnd + 0.25) return band(hook, [104, 96, 88, 80, 72, 64], 960, 1.08, 56, HOOK_Y);
  if (spec.payoff?.trim() && time >= payoffStart) return band(spec.payoff, [96, 88, 80, 72, 64, 58], 940, 1.1, 60, PAYOFF_Y);
  const termAt = termTime(spec.term, captions);
  if (spec.term && termAt !== undefined && termAt > hookEnd && time >= termAt && time < Math.min(termAt + 1.5, payoffStart - 0.1)) return band(spec.term, [104, 96, 88, 80, 72, 64, 58], 940, 1.1, 60, HOOK_Y + 20);
  return undefined;
}

function drawCard(ctx: Ctx, text: string, k: number, centerY: number) {
  const parsed = joinPunctuation(markupWords(text.toUpperCase()).map(w => ({ text: w.text, accent: !!w.accent })));
  const { size, lines } = fit(ctx, parsed.map(w => w.text).join(' '), [104, 96, 88, 80, 72, 64, 58], 940, 3);
  let index = 0;
  const rows = lines.map(line => line.map(() => parsed[index++]!));
  const lineH = size * 1.1, h = rows.length * lineH + 60;
  ctx.save();
  ctx.globalAlpha = clamp(k * 1.4);
  ctx.translate(540, centerY); ctx.scale(0.75 + 0.25 * k, 0.75 + 0.25 * k);
  ctx.fillStyle = 'rgba(11,11,13,0.8)'; ctx.fillRect(-510, -h / 2, 1020, h);
  ctx.fillStyle = YELLOW; ctx.fillRect(-510, h / 2 - 10, 1020, 10);
  rows.forEach((row, r) => richLine(ctx, row, 0, -h / 2 + 30 + lineH / 2 + r * lineH, size));
  ctx.restore();
}

export function drawHookAndHeader(ctx: Ctx, spec: ReelSpec, time: number, placed: PlacedScene[], captions: readonly ActiveCaption[] = []) {
  const hook = spec.hook?.trim(), header = (spec.header ?? '').trim();
  const firstEnd = placed[0]?.end ?? 0;
  const hookEnd = hook ? Math.min(Math.max(1.6, firstEnd), 3.2) : 0;
  ctx.save();
  if (hook && time < hookEnd + 0.25) {
    const exit = clamp((hookEnd + 0.25 - time) / 0.25);
    const parsed = joinPunctuation(markupWords(hook.toUpperCase()).map(w => ({ text: w.text, accent: !!w.accent })));
    const { size, lines } = fit(ctx, parsed.map(w => w.text).join(' '), [104, 96, 88, 80, 72, 64], 960, 3);
    let index = 0;
    const rows = lines.map(line => line.map(() => parsed[index++]!));
    const lineH = size * 1.08, top = HOOK_Y - (rows.length - 1) * lineH / 2;
    ctx.globalAlpha = exit;
    // A plate behind the hook keeps it readable over whatever the opening shot draws up top.
    const plateH = rows.length * lineH + 56, plateK = ease.outExpo(clamp(time / 0.2));
    ctx.fillStyle = 'rgba(11,11,13,0.8)'; ctx.fillRect(540 - 520 * plateK, HOOK_Y - plateH / 2, 1040 * plateK, plateH);
    ctx.fillStyle = YELLOW; ctx.fillRect(540 - 520 * plateK, HOOK_Y + plateH / 2 - 10, 1040 * plateK, 10);
    rows.forEach((row, r) => {
      // Visible from the very first frame (the thumbnail), with a quick punch-in.
      const local = ease.outBack(clamp((time - r * 0.06) / 0.24));
      ctx.save(); ctx.translate(540, top + r * lineH); ctx.scale(0.82 + 0.18 * local, 0.82 + 0.18 * local); ctx.rotate((1 - local) * -0.03);
      ctx.globalAlpha = exit;
      richLine(ctx, row, 0, 0, size);
      ctx.restore();
    });
  }
  const payoff = spec.payoff?.trim(), end = placed.at(-1)?.end ?? 0, payoffStart = payoffAt(captions, end, hookEnd);
  if (payoff && time >= payoffStart) {
    // The answer lands as a big card over the final shot, so the reel ends on its punchline.
    const k = ease.outBack(clamp((time - payoffStart) / 0.3));
    const parsed = joinPunctuation(markupWords(payoff.toUpperCase()).map(w => ({ text: w.text, accent: !!w.accent })));
    const { size, lines } = fit(ctx, parsed.map(w => w.text).join(' '), [96, 88, 80, 72, 64, 58], 940, 3);
    let index = 0;
    const rows = lines.map(line => line.map(() => parsed[index++]!));
    const lineH = size * 1.1, h = rows.length * lineH + 60, top = PAYOFF_Y - h / 2;
    ctx.save();
    ctx.globalAlpha = clamp(k * 1.4);
    ctx.translate(540, top + h / 2); ctx.scale(0.75 + 0.25 * k, 0.75 + 0.25 * k);
    ctx.fillStyle = 'rgba(11,11,13,0.78)'; ctx.fillRect(-510, -h / 2, 1020, h);
    ctx.fillStyle = YELLOW; ctx.fillRect(-510, h / 2 - 10, 1020, 10);
    rows.forEach((row, r) => richLine(ctx, row, 0, -h / 2 + 30 + lineH / 2 + r * lineH, size));
    ctx.restore();
    ctx.restore();
    return;
  }
  // The concept's name lands as a card the moment it is spoken (not over the hook or the payoff).
  const termAt = termTime(spec.term, captions);
  if (spec.term && termAt !== undefined && termAt > hookEnd && time >= termAt && time < Math.min(termAt + 1.5, payoffStart - 0.1)) {
    const out = clamp((termAt + 1.5 - time) / 0.15);
    drawCard(ctx, `*${spec.term.replace(/\*/g, '')}*`, Math.min(ease.outBack(clamp((time - termAt) / 0.25)), out), HOOK_Y + 20);
  }
  if (header && time >= hookEnd && SHOW_HEADER) {
    const k = ease.outExpo(clamp((time - hookEnd) / 0.3));
    const { size, lines } = fit(ctx, header.toUpperCase(), [46, 42, 38, 34], 900, 1);
    const text = lines[0]!.join(' '), w = width(ctx, text, size) + 56, h = size * 1.5;
    ctx.globalAlpha = k;
    ctx.translate(540, HEADER_Y - (1 - k) * 30);
    ctx.fillStyle = 'rgba(11,11,13,0.72)'; ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = YELLOW; ctx.fillRect(-w / 2, h / 2 - 8, w, 8);
    strokedText(ctx, text, 0, 2, size, WHITE, INK, 0);
  }
  ctx.restore();
}

/**
 * Large word-pop captions for the viral look: 1–2 short lines of heavy white
 * sans with a thick dark stroke; the word being spoken turns yellow and pops.
 */
export function drawViralCaption(ctx: Ctx, caption: ActiveCaption, time: number, centerY = 1440, centerX = 500) {
  const raw = String(caption.text ?? '').trim();
  if (!raw || time < caption.start || time >= caption.end) return;
  // Spoken-dialogue quote marks read as stray glyphs in big captions; drop them.
  const words = markupWords(raw.replace(/["“”]|(^|\s)[‘']|[’'](?=[\s.,!?]|$)/g, '$1')).map(w => w.text).filter(w => w.trim()).reduce<string[]>((list, w) => { if (/^[.,!?;:…%)\]}”’"]+$/.test(w) && list.length) list[list.length - 1] += w; else list.push(w); return list; }, []);
  const span = Math.max(0.05, caption.end - caption.start), timings = caption.wordTimings;
  const starts = words.map((_, i) => timings?.[i]?.start ?? caption.start + span * i / words.length);
  const { size, lines } = fit(ctx, words.join(' '), [80, 76, 70, 64, 58, 52], 800, 2);
  const lineH = size * 1.12, top = centerY - (lines.length - 1) * lineH / 2;
  // Hard cuts between phrases (a fade-out read as a flicker); only the new phrase pops in.
  const appear = ease.outBack(clamp((time - caption.start) / 0.16)), exit = 1;
  ctx.save();
  ctx.globalAlpha = exit;
  let index = 0;
  lines.forEach((line, r) => {
    ctx.font = font(size, 900);
    // The thick stroke eats into word gaps ("onlysqueezes"): widen each gap by the stroke width.
    const space = ctx.measureText(' ').width + size * 0.24, widths = line.map(w => ctx.measureText(w).width);
    let x = centerX - (widths.reduce((a, b) => a + b, 0) + space * (line.length - 1)) / 2;
    const y = top + r * lineH;
    line.forEach((word, c) => {
      const i = index++, start = starts[i]!, next = starts[i + 1] ?? caption.end;
      const active = time >= start && time < next, spoken = time >= start;
      const pop = active ? 1 + 0.08 * (1 - clamp((time - start) / 0.18)) : 1;
      const cx = x + widths[c]! / 2;
      ctx.save(); ctx.translate(cx, y); ctx.scale(pop * (0.85 + 0.15 * appear), pop * (0.85 + 0.15 * appear));
      strokedText(ctx, word, 0, 0, size, active ? YELLOW : spoken ? WHITE : 'rgba(255,255,255,0.92)', INK, size * 0.22);
      ctx.restore();
      x += widths[c]! + space;
    });
  });
  ctx.restore();
}

/**
 * Spoken amounts the current shot does not already show ("Hedgy has $50.") pop in as a big number near the top
 * of the action for ~1.2 s, so a viewer with sound off still sees every figure. Skipped while an overlay card is up.
 */
export function drawNumberPops(ctx: Ctx, spec: ReelSpec, time: number, placed: PlacedScene[], captions: readonly ActiveCaption[], cardUp: boolean) {
  if (cardUp) return;
  const scene = placed.find(p => time >= p.start && time < p.end);
  if (!scene) return;
  // Versus cards already show their prices; everywhere else a spoken amount gets its own pop.
  if (scene.spec.type === 'shot' && scene.spec.shot === 'versus') return;
  for (const caption of captions) {
    if (caption.end < time - 1.4 || caption.start > time) continue;
    const words = String(caption.text).split(/\s+/);
    words.forEach((raw, i) => {
      const word = raw.replace(/\*/g, '').replace(/[.,!?;:]+$/, '');
      if (!/^\$\d[\d,.]*[kKmM]?$|^\d+(?:\.\d+)?%$/.test(word)) return;
      const at = caption.wordTimings?.[i]?.start ?? caption.start;
      if (time < at || time > at + 1.25 || at < scene.start - 0.05) return;
      const k = ease.outBack(clamp((time - at) / 0.22)), out = clamp((at + 1.25 - time) / 0.15);
      ctx.save();
      ctx.globalAlpha = out;
      ctx.translate(540, 470); ctx.scale(0.6 + 0.4 * k, 0.6 + 0.4 * k); ctx.rotate(-0.04);
      strokedText(ctx, word, 0, 0, 150, YELLOW, INK, 30);
      ctx.restore();
    });
  }
}
