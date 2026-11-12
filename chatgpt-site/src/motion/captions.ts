import { CAPTION_Y, clamp, ease, font, markupWords, type Frame, type Span } from './core.ts';
import { textWidth } from './prim.ts';

export interface ActiveCaption { text: string; start: number; end: number }
type CaptionWord = Span & { joinPrevious?: boolean };

const MAX_WIDTH = 792;
const WORD_SIZES = [76, 72, 68, 64];
const slotScale = (_word: CaptionWord) => 1;

function rowWidth(ctx: Frame['ctx'], words: CaptionWord[], size: number, weight: number) {
  return words.reduce((width, word, index) =>
    width + textWidth(ctx, word.text, size, weight) * slotScale(word)
      + (index && !word.joinPrevious ? textWidth(ctx, ' ', size, weight) : 0), 0);
}

function splitOversizedWords(ctx: Frame['ctx'], words: CaptionWord[], size: number, weight: number): CaptionWord[] {
  const result: CaptionWord[] = [];
  for (const word of words) {
    if (textWidth(ctx, word.text, size, weight) * slotScale(word) <= MAX_WIDTH) {
      result.push(word);
      continue;
    }
    let part = '';
    for (const char of [...word.text]) {
      const next = part + char;
      if (part && textWidth(ctx, next, size, weight) * slotScale(word) > MAX_WIDTH) {
        result.push({ text: part, accent: word.accent, joinPrevious: word.joinPrevious });
        part = char;
      } else part = next;
    }
    if (part) result.push({ text: part, accent: word.accent, joinPrevious: result.length > 0 });
  }
  return result;
}

function greedyLines(ctx: Frame['ctx'], words: CaptionWord[], size: number, weight: number): CaptionWord[][] {
  const lines: CaptionWord[][] = [];
  let line: CaptionWord[] = [];
  for (const word of words) {
    const proposed = [...line, word];
    if (line.length && rowWidth(ctx, proposed, size, weight) > MAX_WIDTH) {
      lines.push(line);
      line = [word];
    } else line = proposed;
  }
  if (line.length) lines.push(line);
  return lines;
}

function balancedLines(ctx: Frame['ctx'], words: CaptionWord[], size: number, weight: number): CaptionWord[][] | undefined {
  if (rowWidth(ctx, words, size, weight) <= MAX_WIDTH) return [words];
  let best: { split: number; score: number } | undefined;
  for (let split = 1; split < words.length; split++) {
    if (words[split]!.joinPrevious) continue;
    const left = words.slice(0, split);
    const right = words.slice(split);
    const leftWidth = rowWidth(ctx, left, size, weight);
    const rightWidth = rowWidth(ctx, right, size, weight);
    if (leftWidth <= MAX_WIDTH && rightWidth <= MAX_WIDTH) {
      const score = Math.abs(leftWidth - rightWidth);
      if (!best || score < best.score) best = { split, score };
    }
  }
  return best ? [words.slice(0, best.split), words.slice(best.split)] : undefined;
}

/** Clean sans captions build word by word, with the marked phrase taking the accent. */
export function drawCaption(frame: Frame, caption: ActiveCaption, time: number) {
  if (!caption) return;
  const raw = String(caption?.text ?? '');
  if (!raw.trim() || !Number.isFinite(time)) return;
  const start = Number.isFinite(caption.start) ? caption.start : time;
  const end = Number.isFinite(caption.end) ? caption.end : start;
  if (time < start || time >= end || end <= start) return;

  const parsedWords = markupWords(raw);
  const words: CaptionWord[] = [];
  let prefix = '';
  for (const word of parsedWords) {
    if (/^[([{"“‘]+$/.test(word.text)) {
      prefix += word.text;
    } else if (/^[.,!?;:…%)\]}”’"]+$/.test(word.text) && words.length) {
      words[words.length - 1]!.text += word.text;
    } else {
      words.push({ text: prefix + word.text, accent: word.accent });
      prefix = '';
    }
  }
  if (prefix && words.length) words[words.length - 1]!.text += prefix;
  if (!words.length) return;

  const { ctx, theme } = frame;
  const weight = 850;
  let lines: CaptionWord[][] = [];
  let size = 64;
  for (const candidateSize of WORD_SIZES) {
    const fitWords = splitOversizedWords(ctx, words, candidateSize, weight);
    const balanced = balancedLines(ctx, fitWords, candidateSize, weight);
    if (balanced && balanced.length <= 2) {
      size = candidateSize;
      lines = balanced;
      break;
    }
  }
  if (!lines.length) {
    size = WORD_SIZES.at(-1)!;
    const wrapped = greedyLines(ctx, splitOversizedWords(ctx, words, size, weight), size, weight);
    lines = wrapped.length <= 2 ? wrapped : [wrapped[0]!, wrapped.slice(1).flat()];
  }

  const lineHeight = size * 1.08;
  const top = CAPTION_Y - ((lines.length - 1) * lineHeight) / 2;
  const span = Math.max(0.001, end - start);
  const enterWindow = Math.min(span * 0.45, words.length * 0.09);
  const wordDelay = words.length > 1 ? enterWindow / (words.length - 1) : 0;
  const popMs = Math.max(0.12, Math.min(0.18, wordDelay * 1.5 || 0.16));
  const elapsed = frame.opening ? Math.max(time - start, enterWindow + popMs) : time - start;
  const exit = clamp((end - time) / 0.1);
  let globalIndex = 0;

  for (let row = 0; row < lines.length; row++) {
    const rowWords = lines[row]!;
    const width = rowWidth(ctx, rowWords, size, weight);
    const horizontalScale = Math.min(1, MAX_WIDTH / Math.max(1, width));
    let x = 504 - width * horizontalScale / 2;
    for (let col = 0; col < rowWords.length; col++) {
      const word = rowWords[col]!;
      const index = globalIndex++;
      const local = (elapsed - index * wordDelay) / popMs;
      const measuredWidth = textWidth(ctx, word.text, size, weight);
      const slotWidth = measuredWidth * slotScale(word);
      const nextWord = rowWords[col + 1];
      const gap = nextWord && !nextWord.joinPrevious ? textWidth(ctx, ' ', size, weight) : 0;
      const textX = x + (slotWidth - measuredWidth) * horizontalScale / 2;
      if (local <= 0 || exit <= 0) {
        x += (slotWidth + gap) * horizontalScale;
        continue;
      }
      const progress = clamp(local);
      const overshoot = ease.outBack(progress);
      const neutralScale = 0.74 + 0.26 * overshoot;
      const accentScale = 0.68 + 0.36 * overshoot + 0.12 * Math.sin(progress * Math.PI);
      const scale = (word.accent ? accentScale : neutralScale) * (0.96 + 0.04 * exit);
      const y = top + row * lineHeight + (1 - overshoot) * 10;
      ctx.save();
      ctx.globalAlpha *= Math.min(1, progress * 1.5) * exit;
      ctx.translate(textX + measuredWidth * horizontalScale / 2, y);
      ctx.scale(scale * horizontalScale, scale);
      ctx.translate(-(textX + measuredWidth * horizontalScale / 2), -y);
      ctx.font = font(size, weight, 'body');
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = size * 0.18;
      ctx.strokeStyle = theme.bg;
      ctx.fillStyle = word.accent ? theme.accent : theme.fg;
      ctx.strokeText(word.text, textX, y);
      ctx.fillText(word.text, textX, y);
      ctx.restore();
      x += (slotWidth + gap) * horizontalScale;
    }
  }
}
