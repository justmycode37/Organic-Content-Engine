// The "viral" reel look: a big hook over the opening shot that settles into a
// persistent topic header, and large stroked word-pop captions. Everything here
// is a pure function of reel time and draws in device pixels (1080 x 1920).
import { clamp, ease, font, markupWords, type Ctx, type PlacedScene, type ReelSpec } from './core.ts';
import type { ActiveCaption } from './captions.ts';

const INK = '#0B0B0D', WHITE = '#FFFFFF';
const HEADER_Y = 150, HOOK_Y = 330, PAYOFF_Y = 1270;
const PAYOFF_X = 486, PAYOFF_TEXT_WIDTH = 752;
const PAYOFF_SIZES = [78, 72, 66, 60, 54, 48];

/** Reveal the final card just after the last spoken word, independently of caption linger. */
export function payoffStartTime(spec: ReelSpec, placed: PlacedScene[], captions: readonly ActiveCaption[]) {
  const end = placed.at(-1)?.end ?? 0, last = captions.at(-1);
  const spokenEnd = last?.wordTimings?.at(-1)?.end;
  const start = spokenEnd !== undefined ? spokenEnd + 0.06 : last && last.end < end - 0.4 ? last.end : end - 1.4;
  return Math.max(hookEndTime(spec, placed) + 1, start);
}
// The persistent header collided with in-shot signs at the top of the stage; the hook and payoff cards carry the topic instead.
const SHOW_HEADER = false;

/** Preserve punctuation and strip the authoring markup from title cards. */
function titleWords(text: string) {
  return markupWords(text.toUpperCase()).map(word => word.text).reduce<string[]>((list, word) => {
    if (/^[.,!?;:…%)\]}”’"]+$/.test(word) && list.length) list[list.length - 1] += word;
    else list.push(word);
    return list;
  }, []);
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
function titleLine(ctx: Ctx, text: string, x: number, y: number, size: number) {
  ctx.font = font(size, 900);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = WHITE;
  ctx.fillText(text, x, y);
}

/** When the hook card leaves the screen (reel seconds); 0 without a hook. */
export function hookEndTime(spec: ReelSpec, placed: PlacedScene[]) { return spec.hook?.trim() ? Math.min(placed[0]?.end ?? 0, 3.2) : 0; }

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

function termCardTime(spec: ReelSpec, placed: PlacedScene[], captions: readonly ActiveCaption[]) {
  const at = termTime(spec.term, captions);
  const shot = at === undefined ? undefined : placed.find(scene => at >= scene.start && at < scene.end)?.spec;
  if (shot?.type === 'shot' && shot.shot === 'versus') {
    const term = titleWords(spec.term ?? '').join(' ');
    const labels = [shot.params?.leftLabel, shot.params?.rightLabel];
    // The comparison already titles the term on one card. Suppress the duplicate across this cut and the next.
    if (labels.some(label => typeof label === 'string' && titleWords(label).join(' ') === term)) return undefined;
  }
  return at;
}

/** The device-space band covered by whichever overlay card (hook, concept term or payoff) is on screen. */
export function cardZone(ctx: Ctx, spec: ReelSpec, time: number, placed: PlacedScene[], captions: readonly ActiveCaption[] = []): { top: number; bottom: number } | undefined {
  const hook = spec.hook?.trim(), hookEnd = hookEndTime(spec, placed);
  const payoffStart = payoffStartTime(spec, placed, captions);
  const band = (text: string, sizes: number[], max: number, lineK: number, pad: number, center: number) => {
    const { size, lines } = fit(ctx, titleWords(text).join(' '), sizes, max, 3);
    const h = lines.length * size * lineK + pad;
    return { top: center - h / 2 - 12, bottom: center + h / 2 + 12 };
  };
  if (hook && time < hookEnd) return band(hook, [104, 96, 88, 80, 72, 64], 960, 1.08, 12, HOOK_Y);
  if (spec.payoff?.trim() && time >= payoffStart) return band(spec.payoff, PAYOFF_SIZES, PAYOFF_TEXT_WIDTH, 1.1, 12, PAYOFF_Y);
  const termAt = termCardTime(spec, placed, captions);
  if (spec.term && termAt !== undefined && termAt > hookEnd && time >= termAt && time < Math.min(termAt + 1.5, payoffStart - 0.1)) return band(spec.term, [104, 96, 88, 80, 72, 64, 58], 940, 1.1, 12, HOOK_Y + 20);
  return undefined;
}

function drawCard(ctx: Ctx, text: string, k: number, centerY: number) {
  const { size, lines } = fit(ctx, titleWords(text).join(' '), [104, 96, 88, 80, 72, 64, 58], 940, 3);
  const lineH = size * 1.1;
  ctx.save();
  ctx.globalAlpha = clamp(k * 1.4);
  ctx.translate(540, centerY); ctx.scale(0.75 + 0.25 * k, 0.75 + 0.25 * k);
  lines.forEach((line, index) => titleLine(ctx, line.join(' '), 0, (index - (lines.length - 1) / 2) * lineH, size));
  ctx.restore();
}

export function drawHookAndHeader(ctx: Ctx, spec: ReelSpec, time: number, placed: PlacedScene[], captions: readonly ActiveCaption[] = []) {
  const hook = spec.hook?.trim(), header = (spec.header ?? '').trim();
  const hookEnd = hookEndTime(spec, placed);
  ctx.save();
  if (hook && time < hookEnd) {
    const exit = clamp((hookEnd - time) / 0.22);
    const { size, lines } = fit(ctx, titleWords(hook).join(' '), [104, 96, 88, 80, 72, 64], 960, 3);
    const lineH = size * 1.08, top = HOOK_Y - (lines.length - 1) * lineH / 2;
    ctx.globalAlpha = exit;
    lines.forEach((line, r) => {
      // Visible from the very first frame (the thumbnail), with a quick punch-in.
      const local = ease.outBack(clamp((time - r * 0.06) / 0.24));
      ctx.save(); ctx.translate(540, top + r * lineH); ctx.scale(0.82 + 0.18 * local, 0.82 + 0.18 * local); ctx.rotate((1 - local) * -0.03);
      ctx.globalAlpha = exit;
      titleLine(ctx, line.join(' '), 0, 0, size);
      ctx.restore();
    });
  }
  const payoff = spec.payoff?.trim(), payoffStart = payoffStartTime(spec, placed, captions);
  if (payoff && time >= payoffStart) {
    // The answer lands as a big card over the final shot, so the reel ends on its punchline.
    const k = ease.outCubic(clamp((time - payoffStart) / 0.18));
    const { size, lines } = fit(ctx, titleWords(payoff).join(' '), PAYOFF_SIZES, PAYOFF_TEXT_WIDTH, 3);
    const lineH = size * 1.1;
    ctx.save();
    ctx.globalAlpha = clamp(k * 1.4);
    ctx.translate(PAYOFF_X, PAYOFF_Y); ctx.scale(0.86 + 0.14 * k, 0.86 + 0.14 * k);
    lines.forEach((line, index) => titleLine(ctx, line.join(' '), 0, (index - (lines.length - 1) / 2) * lineH, size));
    ctx.restore();
    ctx.restore();
    return;
  }
  // The concept's name lands as a card the moment it is spoken (not over the hook or the payoff).
  const termAt = termCardTime(spec, placed, captions);
  if (spec.term && termAt !== undefined && termAt > hookEnd && time >= termAt && time < Math.min(termAt + 1.5, payoffStart - 0.1)) {
    const out = clamp((termAt + 1.5 - time) / 0.15);
    drawCard(ctx, `*${spec.term.replace(/\*/g, '')}*`, Math.min(ease.outBack(clamp((time - termAt) / 0.25)), out), HOOK_Y + 20);
  }
  if (header && time >= hookEnd && SHOW_HEADER) {
    const k = ease.outExpo(clamp((time - hookEnd) / 0.3));
    const { size, lines } = fit(ctx, header.toUpperCase(), [46, 42, 38, 34], 900, 1);
    const text = lines[0]!.join(' ');
    ctx.globalAlpha = k;
    ctx.translate(540, HEADER_Y - (1 - k) * 30);
    titleLine(ctx, text, 0, 2, size);
  }
  ctx.restore();
}

/**
 * Large word-pop captions for the viral look: 1–2 short lines of heavy white
 * sans with a thick dark stroke. The currently spoken word briefly scales up.
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
      strokedText(ctx, word, 0, 0, size, spoken ? WHITE : 'rgba(255,255,255,0.92)', INK, size * 0.22);
      ctx.restore();
      x += widths[c]! + space;
    });
  });
  ctx.restore();
}

const SMALL: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000 };
/** "eight" -> 8, "twenty-five" -> 25; undefined for anything else. */
function spokenNumber(word: string): number | undefined {
  if (SMALL[word] !== undefined) return SMALL[word];
  const [a, b] = word.split('-');
  return a && b && SMALL[a] !== undefined && SMALL[b] !== undefined && SMALL[a]! >= 20 && SMALL[b]! < 10 ? SMALL[a]! + SMALL[b]! : undefined;
}

/**
 * Spoken amounts the current shot does not already show ("Hedgy has $50.") pop in as a big number near the top
 * of the action for ~1.2 s, so a viewer with sound off still sees every figure. Skipped while an overlay card is up.
 */
export function drawNumberPops(ctx: Ctx, spec: ReelSpec, time: number, placed: PlacedScene[], captions: readonly ActiveCaption[], cardUp: boolean) {
  if (cardUp) return;
  const scene = placed.find(p => time >= p.start && time < p.end);
  if (!scene) return;
  if (scene.spec.type === 'shot' && ['versus', 'statement'].includes(scene.spec.shot)) return;
  const shot = scene.spec.type === 'shot' ? scene.spec : undefined;
  const params = shot?.params;
  const moves = shot?.shot === 'act' && Array.isArray(params?.moves) ? params.moves : [];
  const tags = shot?.shot === 'present' ? [params?.tag, params?.backTag, params?.label]
    : shot?.shot === 'act' ? [params?.tag] : [];
  const printed = [...tags, ...moves.map((move: unknown) =>
    move && typeof move === 'object' && 'word' in move ? move.word : ''
  )].flatMap(value => typeof value === 'string' ? value.split(/\s+/) : []);
  let latest: { word: string; at: number } | undefined;
  for (const caption of captions) {
    if (caption.end < time - 1.4 || caption.start > time) continue;
    const words = String(caption.text).split(/\s+/);
    words.forEach((raw, i) => {
      const clean = (w: string | undefined) => (w ?? '').replace(/\*/g, '').replace(/[.,!?;:]+$/, '');
      let word = clean(raw);
      // Spelled-out amounts ("eight bucks", "forty cents") pop as figures too.
      const spoken = spokenNumber(word.toLowerCase()), unit = clean(words[i + 1]).toLowerCase();
      if (spoken !== undefined && /^(bucks?|dollars?)$/.test(unit)) word = `$${spoken}`;
      else if (spoken !== undefined && /^cents?$/.test(unit)) word = `${spoken}¢`;
      if (!/^\$\d[\d,.]*[kKmM]?$|^\d+(?:\.\d+)?%$|^\d+¢$/.test(word)) return;
      const at = caption.wordTimings?.[i]?.start ?? caption.start;
      if (time < at || time > at + 1.25 || at < scene.start - 0.05) return;
      if (printed.some(value => clean(value).replace(/^\+/, '') === word)) return;
      if (!latest || at > latest.at) latest = { word, at };
    });
  }
  if (!latest) return;
  const { at, word } = latest;
  const k = ease.outBack(clamp((time - at) / 0.22)), out = clamp((at + 1.25 - time) / 0.15);
  ctx.save();
  ctx.globalAlpha = out;
  ctx.translate(540, 470); ctx.scale(0.6 + 0.4 * k, 0.6 + 0.4 * k); ctx.rotate(-0.04);
  strokedText(ctx, word, 0, 0, 150, WHITE, INK, 30);
  ctx.restore();
}
