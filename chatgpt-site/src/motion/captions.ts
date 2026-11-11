import { CAPTION_Y, clamp, ease, font, markupWords, type Frame, type Span } from './core.ts';
import { textWidth } from './prim.ts';

export interface CaptionWordTiming { text?: string; start: number; end: number }
export interface ActiveCaption {
  text: string;
  start: number;
  end: number;
  /** Optional absolute reel-time word timings. Existing audio-generated captions work without this field. */
  wordTimings?: readonly CaptionWordTiming[];
}
type CaptionWord = Span & { joinPrevious?: boolean; start?: number; end?: number; semantic?: 'gain' | 'loss' };

const MAX_WIDTH = 880;
const MIN_SIZE = 22;
const WORD_SIZES = [64, 60, 56, 52, 48, 44, 40, 36, 32, 28, 24, MIN_SIZE];
const GAIN_WORDS = new Set(['gain', 'gains', 'gained', 'up', 'rise', 'rises', 'rose', 'rising', 'surge', 'surges', 'surged', 'grow', 'grows', 'grew', 'growth', 'profit', 'profits', 'profitable', 'higher', 'increase', 'increases', 'increased', 'bull', 'bullish', 'green', 'beat', 'outperform', 'outperformed']);
const LOSS_WORDS = new Set(['loss', 'losses', 'lost', 'down', 'fall', 'falls', 'fell', 'fallen', 'drop', 'drops', 'dropped', 'crash', 'crashes', 'crashed', 'sell', 'sells', 'sold', 'bear', 'bearish', 'decline', 'declines', 'declined', 'cut', 'cuts', 'negative', 'lower', 'plunge', 'plunges', 'plunged', 'red']);
const semantic = (word: string): CaptionWord['semantic'] => {
  const clean = word.toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, '');
  return GAIN_WORDS.has(clean) ? 'gain' : LOSS_WORDS.has(clean) ? 'loss' : undefined;
};

function rowWidth(ctx: Frame['ctx'], words: CaptionWord[], size: number, weight: number) {
  return words.reduce((width, word, index) => width + textWidth(ctx, word.text, size, weight)
    + (index && !word.joinPrevious ? textWidth(ctx, ' ', size, weight) : 0), 0);
}

function splitLongWords(ctx: Frame['ctx'], words: CaptionWord[], size: number): CaptionWord[] {
  const result: CaptionWord[] = [];
  for (const word of words) {
    if (textWidth(ctx, word.text, size, 900) <= MAX_WIDTH) { result.push(word); continue; }
    let part = '';
    for (const char of [...word.text]) {
      if (part && textWidth(ctx, part + char, size, 900) > MAX_WIDTH) {
        result.push({ ...word, text: part }); part = char;
      } else part += char;
    }
    if (part) result.push({ ...word, text: part, joinPrevious: result.length > 0 });
  }
  return result;
}

function greedyLines(ctx: Frame['ctx'], words: CaptionWord[], size: number): CaptionWord[][] {
  const lines: CaptionWord[][] = [];
  let line: CaptionWord[] = [];
  for (const word of words) {
    const proposed = [...line, word];
    if (line.length && rowWidth(ctx, proposed, size, 900) > MAX_WIDTH) { lines.push(line); line = [word]; }
    else line = proposed;
  }
  if (line.length) lines.push(line);
  return lines;
}

function balancedLines(ctx: Frame['ctx'], words: CaptionWord[], size: number): CaptionWord[][] | undefined {
  if (rowWidth(ctx, words, size, 900) <= MAX_WIDTH) return [words];
  let best: { split: number; score: number } | undefined;
  for (let split = 1; split < words.length; split++) {
    if (words[split]!.joinPrevious) continue;
    const a = words.slice(0, split), b = words.slice(split), wa = rowWidth(ctx, a, size, 900), wb = rowWidth(ctx, b, size, 900);
    if (wa <= MAX_WIDTH && wb <= MAX_WIDTH) {
      const score = Math.abs(wa - wb);
      if (!best || score < best.score) best = { split, score };
    }
  }
  return best ? [words.slice(0, best.split), words.slice(best.split)] : undefined;
}

function captionWords(raw: string): CaptionWord[] {
  const parsed = markupWords(raw), words: CaptionWord[] = [];
  let prefix = '';
  for (const part of parsed) {
    if (/^[([{"“‘]+$/.test(part.text)) prefix += part.text;
    else if (/^[.,!?;:…%)\]}”’"]+$/.test(part.text) && words.length) words[words.length - 1]!.text += part.text;
    else { const text = prefix + part.text; words.push({ text, accent: part.accent, semantic: semantic(text) }); prefix = ''; }
  }
  if (prefix && words.length) words[words.length - 1]!.text += prefix;
  return words;
}

function distributeWordTimes(words: CaptionWord[], caption: ActiveCaption) {
  const explicit = caption.wordTimings, span = Math.max(0.08, caption.end - caption.start);
  const weights = words.map(word => Math.max(1, [...word.text].length * 0.72));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let elapsed = caption.start;
  words.forEach((word, index) => {
    const duration = span * weights[index]! / totalWeight;
    word.start = elapsed; word.end = elapsed + duration;
    elapsed += duration;
    const timing = explicit?.[index];
    if (timing && Number.isFinite(timing.start) && Number.isFinite(timing.end) && timing.end > timing.start) {
      word.start = Math.max(caption.start, timing.start);
      word.end = Math.min(caption.end, timing.end);
    }
  });
  words.forEach((word, index) => {
    word.start = Math.max(caption.start, Math.min(caption.end, word.start ?? caption.start));
    word.end = Math.max(word.start + 0.02, Math.min(caption.end, word.end ?? caption.end));
    if (index < words.length - 1 && word.end! > words[index + 1]!.start!) word.end = words[index + 1]!.start;
    else if (index === words.length - 1) word.end = caption.end;
  });
}

function wrapLayout(frame: Frame, words: CaptionWord[]) {
  let lines: CaptionWord[][] = [], size = MIN_SIZE;
  for (const candidate of WORD_SIZES) {
    const fitted = splitLongWords(frame.ctx, words, candidate), balanced = balancedLines(frame.ctx, fitted, candidate);
    if (balanced && balanced.length <= 2) { size = candidate; lines = balanced; break; }
  }
  if (!lines.length) {
    size = MIN_SIZE;
    lines = greedyLines(frame.ctx, splitLongWords(frame.ctx, words, size), size).slice(0, 2);
    const shown = lines.flat().length;
    if (shown < words.length && lines.length) {
      const last = lines.at(-1)!;
      if (last.length) last[last.length - 1]!.text = `${last.at(-1)!.text.replace(/[.,!?;:]$/, '')}…`;
    }
  }
  return { lines, size };
}

/**
 * Draw one caption beat in the player-owned lower band. Text uses clean sans,
 * pops word by word at the supplied voice times, and supports `*marked*` words.
 */
export function drawCaption(frame: Frame, caption: ActiveCaption, time: number, region?: { top: number; bottom: number }) {
  if (!caption || !Number.isFinite(time)) return;
  const raw = String(caption.text ?? '').trim();
  const start = Number.isFinite(caption.start) ? caption.start : time, end = Number.isFinite(caption.end) ? caption.end : start;
  if (!raw || end <= start || time < start || time >= end) return;
  const words = captionWords(raw);
  if (!words.length) return;
  distributeWordTimes(words, caption);
  const { lines, size } = wrapLayout(frame, words), { ctx } = frame;
  const bandTop = region?.top ?? 1320, bandBottom = region?.bottom ?? 1650;
  const lineHeight = size * 1.13, totalHeight = lines.length * lineHeight;
  const center = (bandTop + bandBottom) / 2, top = center - totalHeight / 2 + lineHeight / 2;
  const exit = clamp((end - time) / 0.09);
  let globalIndex = 0;

  for (let row = 0; row < lines.length; row++) {
    const rowWords = lines[row]!;
    const totalWidth = rowWidth(ctx, rowWords, size, 900);
    let x = 540 - totalWidth / 2;
    const rowStart = start + row * 0.035;
    const rowProgress = ease.outExpo(clamp((time - rowStart) / 0.14));
    const baseline = top + row * lineHeight + (1 - rowProgress) * 7;
    for (let col = 0; col < rowWords.length; col++) {
      const word = rowWords[col]!, index = globalIndex++, width = textWidth(ctx, word.text, size, 900), next = rowWords[col + 1], gap = next && !next.joinPrevious ? textWidth(ctx, ' ', size, 900) : 0;
      const wordStart = word.start ?? start, wordEnd = Math.max(wordStart + 0.03, word.end ?? end), pop = clamp((time - wordStart) / Math.min(0.17, Math.max(0.085, (wordEnd - wordStart) * 0.55)));
      const active = time >= wordStart && time < wordEnd;
      if (pop > 0 && exit > 0 && rowProgress > 0) {
        const directional = word.accent && word.semantic ? (word.semantic === 'gain' ? '#55D68A' : '#FF5B62') : '#FFFFFF';
        const emphasized = word.accent || active;
        const weight = active ? 900 : emphasized ? 850 : 650;
        const measured = textWidth(ctx, word.text, size, weight), centerX = x + width / 2;
        const popScale = active ? 0.92 + 0.12 * ease.outBack(pop) : 0.88 + 0.12 * ease.outBack(pop);
        const scale = popScale * (active ? 1.045 : 1) * (0.98 + exit * 0.02);
        const tx = centerX - measured / 2;
        if (emphasized) {
          const slabW = measured + 24, slabH = size * 1.36;
          ctx.save(); ctx.translate(centerX, baseline); ctx.scale(scale, scale); ctx.translate(-centerX, -baseline);
          ctx.fillStyle = '#09090B'; ctx.fillRect(centerX - slabW / 2, baseline - slabH / 2, slabW, slabH);
          ctx.fillStyle = '#303034'; ctx.fillRect(centerX - slabW / 2, baseline - slabH / 2, slabW, 3);
          ctx.fillRect(centerX - slabW / 2, baseline + slabH / 2 - 3, slabW, 3);
          ctx.restore();
        }
        ctx.save();
        ctx.globalAlpha *= Math.min(1, pop * 1.55) * exit * rowProgress;
        ctx.translate(centerX, baseline); ctx.scale(scale, scale); ctx.translate(-centerX, -baseline);
        ctx.font = font(size, weight, 'body'); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillStyle = active || word.accent ? directional : '#929297';
        ctx.fillText(word.text, tx, baseline);
        ctx.restore();
      }
      x += width + gap;
    }
  }
}

