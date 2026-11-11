import {
  CONTENT_BOTTOM,
  SAFE,
  clamp,
  ease,
  markupWords,
  prog,
  type ChatProps,
  type Cue,
  type Frame,
  type SceneDef,
} from '../core.ts';
import { cursor, panel, text, textWidth } from '../prim.ts';
import { dither } from '../pix.ts';
import { icon3d } from '../icon3d.ts';

const MESSAGE_SIZE = 48;
const MESSAGE_WEIGHT = 800;
const LINE_HEIGHT = 56;
const PAD_X = 24;
const PAD_Y = 20;
const MESSAGE_GAP = 16;
const MIN_BUBBLE_HEIGHT = 96;
const MAX_TEXT = 2000;
const MAX_MESSAGES = 6;
const BUILD_SHARE = 0.78;
const PUNCTUATION = /^[,.;:!?%)\]}]/;
const MAX_BUBBLE_WIDTH = Math.floor(SAFE.w * 0.8 / 4) * 4;
const CHAT_CENTER_Y = 740;

type Role = 'user' | 'ai';

type ChatMessage = {
  role: Role;
  text: string;
  words: ChatWord[];
};

type ChatWord = {
  word: string;
  accent: boolean;
  spaceBefore: boolean;
  order: number;
};

type ChatLayout = {
  role: Role;
  words: ChatWord[];
  lines: ChatWord[][];
  width: number;
  height: number;
  top: number;
  charCount: number;
};

type MessageTiming = {
  start: number;
  typeDuration: number;
  sendAt: number;
  thinkDuration: number;
  streamStart: number;
  streamDuration: number;
};

type ChatTiming = {
  beat: number;
  messages: MessageTiming[];
};

function cleanMessages(props: ChatProps): ChatMessage[] {
  const input = Array.isArray(props?.messages) ? props.messages : [];
  return input.slice(0, MAX_MESSAGES).flatMap((message) => {
    const role: Role = message?.role === 'user' ? 'user' : 'ai';
    const value = String(message?.text ?? '');
    const bounded = value.length > MAX_TEXT ? value.slice(0, MAX_TEXT - 1) + '…' : value;
    const parsed = markupWords(bounded);
    if (!parsed.length) return [];

    const words = parsed.map((item, index) => ({
      word: item.text,
      accent: role === 'ai' && item.accent,
      spaceBefore: index > 0 && !PUNCTUATION.test(item.text),
      order: index,
    }));
    return [{ role, text: bounded, words }];
  });
}

function makeTiming(count: number, dur: number): ChatTiming {
  if (count <= 0 || dur <= 0) return { beat: 0, messages: [] };

  const beat = dur * BUILD_SHARE / count;
  const messages = Array.from({ length: count }, (_, index) => {
    const start = index * beat;
    return {
      start,
      typeDuration: beat * 0.46,
      sendAt: start + beat * 0.60,
      thinkDuration: beat * 0.22,
      streamStart: start + beat * 0.22,
      streamDuration: beat * 0.62,
    };
  });
  return { beat, messages };
}

function characterCount(value: string): number {
  return [...value].length;
}

function wordWidth(ctx: Frame['ctx'], value: string): number {
  return textWidth(ctx, value, MESSAGE_SIZE, MESSAGE_WEIGHT);
}

function splitLongWords(ctx: Frame['ctx'], words: ChatWord[], maxWidth: number): ChatWord[] {
  const result: ChatWord[] = [];
  for (const item of words) {
    if (wordWidth(ctx, item.word) <= maxWidth) {
      result.push(item);
      continue;
    }

    let part = '';
    let firstPart = true;
    for (const char of [...item.word]) {
      if (part && wordWidth(ctx, part + char) > maxWidth) {
        result.push({
          ...item,
          word: part,
          spaceBefore: firstPart ? item.spaceBefore : false,
        });
        part = '';
        firstPart = false;
      }
      part += char;
    }
    if (part) {
      result.push({
        ...item,
        word: part,
        spaceBefore: firstPart ? item.spaceBefore : false,
      });
    }
  }
  return result.map((word, order) => ({ ...word, order }));
}

function wrapWords(ctx: Frame['ctx'], words: ChatWord[], maxWidth: number): ChatWord[][] {
  const lines: ChatWord[][] = [];
  let line: ChatWord[] = [];
  let lineText = '';

  for (const item of splitLongWords(ctx, words, maxWidth)) {
    const spacer = line.length && item.spaceBefore ? ' ' : '';
    const candidate = lineText + spacer + item.word;
    if (line.length && wordWidth(ctx, candidate) > maxWidth) {
      lines.push(line);
      line = [item];
      lineText = item.word;
    } else {
      line.push(item);
      lineText = candidate;
    }
  }
  if (line.length) lines.push(line);

  let order = 0;
  return lines.map((items) => items.map((item) => ({ ...item, order: order++ })));
}

function lineText(line: ChatWord[]): string {
  return line.map((word, index) => (index > 0 && word.spaceBefore ? ' ' : '') + word.word).join('');
}

function buildLayouts(ctx: Frame['ctx'], messages: ChatMessage[]): ChatLayout[] {
  const layouts = messages.map((message) => {
    const maxTextWidth = MAX_BUBBLE_WIDTH - PAD_X * 2;
    const lines = wrapWords(ctx, message.words, maxTextWidth);
    const width = Math.min(
      MAX_BUBBLE_WIDTH,
      Math.max(message.role === 'ai' ? 396 : 360, ...lines.map((line) => wordWidth(ctx, lineText(line)) + PAD_X * 2)),
    );
    const height = Math.max(MIN_BUBBLE_HEIGHT, lines.length * LINE_HEIGHT + PAD_Y * 2);
    const words = lines.flat();
    const charCount = words.reduce((sum, word) => sum + characterCount(word.word) + (word.spaceBefore ? 1 : 0), 0);
    return { role: message.role, words, lines, width, height, top: 0, charCount };
  });

  let top = 0;
  layouts.forEach((layout, index) => {
    layout.top = top;
    top += layout.height + (index < layouts.length - 1 ? MESSAGE_GAP : 0);
  });
  return layouts;
}

function visibleLineCount(layout: ChatLayout, wordCount: number): number {
  let count = 0;
  layout.lines.forEach((line, lineIndex) => {
    if (line.some((word) => word.order < wordCount)) count = lineIndex + 1;
  });
  return count;
}

function typedLineCount(layout: ChatLayout, shownChars: number): number {
  let consumed = 0;
  let count = 0;
  layout.lines.forEach((line, lineIndex) => {
    for (const word of line) {
      const delimiter = word.spaceBefore ? 1 : 0;
      const length = characterCount(word.word);
      if (shownChars > consumed + delimiter) count = lineIndex + 1;
      consumed += delimiter + length;
    }
  });
  return count;
}

function groupAnchor(layouts: ChatLayout[], active: number): number {
  const first = Math.max(0, active - 1);
  const groupHeight = active > 0
    ? layouts[active - 1]!.height + MESSAGE_GAP + layouts[active]!.height
    : layouts[0]!.height;
  return CHAT_CENTER_Y - groupHeight / 2 - layouts[first]!.top;
}

function drawShadow(ctx: Frame['ctx'], theme: Frame['theme'], x: number, y: number, width: number, height: number) {
  const shadow = theme.mode === 'dark' ? theme.muted : theme.line;
  dither(
    ctx,
    x + 12,
    y + height - 4,
    width - 24,
    28,
    shadow,
    (u, v) => (1 - v) * 0.52 * (0.88 - u * 0.22),
    4,
  );
  dither(
    ctx,
    x + width - 4,
    y + 12,
    16,
    Math.max(16, height - 24),
    shadow,
    (u) => (1 - u) * 0.46,
    4,
  );
}

function bubbleColors(theme: Frame['theme'], role: Role) {
  if (role === 'user') {
    return {
      fill: theme.mode === 'dark' ? theme.fg : theme.bg,
      ink: theme.mode === 'dark' ? theme.bg : theme.fg,
      stroke: theme.mode === 'light' ? theme.line : undefined,
    };
  }
  return {
    fill: theme.mode === 'dark' ? theme.panel : theme.fg,
    ink: theme.mode === 'dark' ? theme.fg : theme.bg,
    stroke: theme.mode === 'dark' ? theme.line : theme.dim,
  };
}

function drawBubble(
  frame: Frame,
  layout: ChatLayout,
  x: number,
  y: number,
  height: number,
  scale: number,
  alpha: number,
  drawContent: () => void,
) {
  const { ctx, theme } = frame;
  const colors = bubbleColors(theme, layout.role);
  const centerX = x + layout.width / 2;
  const centerY = y + height / 2;

  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(centerX, centerY);
  ctx.scale(scale, scale);
  ctx.translate(-centerX, -centerY);

  drawShadow(ctx, theme, x, y, layout.width, height);
  panel(ctx, x, y, layout.width, height, {
    fill: colors.fill,
    stroke: colors.stroke,
    lineWidth: 4,
    notch: 12,
  });

  // A fine stepped bevel catches light along the upper edge.
  ctx.fillStyle = layout.role === 'user'
    ? (theme.mode === 'dark' ? theme.dim : theme.panelAlt)
    : theme.line;
  ctx.fillRect(x + 16, y + 12, Math.max(0, layout.width - 32), 4);

  drawContent();
  ctx.restore();
}

function drawReply(
  frame: Frame,
  layout: ChatLayout,
  x: number,
  y: number,
  shownWords: number,
  timing: MessageTiming,
  wordCount: number,
) {
  const { ctx, theme, t } = frame;
  const colors = bubbleColors(theme, 'ai');
  const top = y + PAD_Y + (LINE_HEIGHT - MESSAGE_SIZE) / 2;
  const lineTop = (index: number) => top + index * LINE_HEIGHT;

  layout.lines.forEach((line, lineIndex) => {
    let cursorX = x + PAD_X;
    line.forEach((word, wordIndex) => {
      if (word.order >= shownWords) return;
      const spacer = wordIndex > 0 && word.spaceBefore ? ' ' : '';
      if (spacer) cursorX += text(ctx, spacer, cursorX, lineTop(lineIndex), {
        size: MESSAGE_SIZE,
        color: colors.ink,
        weight: MESSAGE_WEIGHT,
        baseline: 'top',
      });

      const width = wordWidth(ctx, word.word);
      const arrival = timing.streamStart + timing.streamDuration * ((word.order + 1) / Math.max(1, wordCount));
      const age = Math.max(0, t - arrival);
      const punch = word.accent ? 1 + 0.20 * Math.exp(-age * 26) : 1;
      if (word.accent) {
        ctx.save();
        ctx.translate(cursorX + width / 2, lineTop(lineIndex) + MESSAGE_SIZE / 2);
        ctx.scale(punch, punch);
        text(ctx, word.word, -width / 2, -MESSAGE_SIZE / 2, {
          size: MESSAGE_SIZE,
          color: theme.accent,
          weight: MESSAGE_WEIGHT,
          baseline: 'top',
        });
        ctx.restore();
      } else {
        text(ctx, word.word, cursorX, lineTop(lineIndex), {
          size: MESSAGE_SIZE,
          color: colors.ink,
          weight: MESSAGE_WEIGHT,
          baseline: 'top',
        });
      }
      cursorX += width;
    });
  });
}

function drawTyping(
  frame: Frame,
  layout: ChatLayout,
  x: number,
  y: number,
  shownChars: number,
  isTyping: boolean,
) {
  const { ctx, theme, t } = frame;
  const colors = bubbleColors(theme, 'user');
  const top = y + PAD_Y + (LINE_HEIGHT - MESSAGE_SIZE) / 2;
  let consumed = 0;
  let cursorX = x + PAD_X;
  let cursorY = top;
  let cursorSet = shownChars <= 0;

  layout.lines.forEach((line, lineIndex) => {
    let lineX = x + PAD_X;
    line.forEach((word, wordIndex) => {
      const delimiter = word.spaceBefore ? 1 : 0;
      const length = characterCount(word.word);
      const available = clamp(shownChars - consumed - delimiter, 0, length);
      const prefix = [...word.word].slice(0, Math.floor(available)).join('');
      const hasSpace = delimiter > 0 && shownChars > consumed;
      if (hasSpace && wordIndex > 0) {
        lineX += text(ctx, ' ', lineX, top + lineIndex * LINE_HEIGHT, {
          size: MESSAGE_SIZE,
          color: colors.ink,
          weight: MESSAGE_WEIGHT,
          baseline: 'top',
        });
      }

      if (prefix) {
        lineX += text(ctx, prefix, lineX, top + lineIndex * LINE_HEIGHT, {
          size: MESSAGE_SIZE,
          color: colors.ink,
          weight: MESSAGE_WEIGHT,
          baseline: 'top',
        });
      }

      if (!cursorSet && shownChars <= consumed + delimiter + length) {
        cursorX = lineX;
        cursorY = top + lineIndex * LINE_HEIGHT;
        cursorSet = true;
      }
      consumed += delimiter + length;
    });
  });

  if (!cursorSet) {
    const lastLine = layout.lines.at(-1) ?? [];
    cursorY = top + Math.max(0, layout.lines.length - 1) * LINE_HEIGHT;
    cursorX = x + PAD_X + wordWidth(ctx, lineText(lastLine));
  }
  if (isTyping) cursor(ctx, cursorX, cursorY, 12, MESSAGE_SIZE, colors.ink, t);
}

function drawThinking(frame: Frame, x: number, y: number, height: number, local: number) {
  const { ctx, theme } = frame;
  const dotSize = 12;
  const startX = x + PAD_X;
  const centerY = y + Math.min(height - 32, Math.max(36, height / 2)) - dotSize / 2;
  for (let index = 0; index < 3; index++) {
    const bounce = Math.max(0, Math.sin(local * 17 - index * 1.8)) * 12;
    ctx.fillStyle = theme.dim;
    ctx.fillRect(startX + index * (dotSize + 16), centerY - bounce, dotSize, dotSize);
  }
}

export const chatScene: SceneDef<ChatProps> = {
  type: 'chat',

  render(frame: Frame, props: ChatProps) {
    const { ctx, theme } = frame;
    const t = Math.max(0, frame.t);
    const messages = cleanMessages(props);
    if (!messages.length) return;

    const timings = makeTiming(messages.length, frame.dur);
    if (!timings.beat) return;
    const layouts = buildLayouts(ctx, messages);
    const active = Math.min(
      messages.length - 1,
      Math.max(0, Math.floor(t / timings.beat)),
    );
    const localInBeat = t - active * timings.beat;
    const settle = Math.min(0.20, timings.beat * 0.42);
    const from = active > 0 ? groupAnchor(layouts, active - 1) : groupAnchor(layouts, active);
    const to = groupAnchor(layouts, active);
    const blockTop = from + (to - from) * ease.outCubic(prog(localInBeat, 0, settle));
    const firstInGroup = Math.max(0, active - 1);

    ctx.save();
    ctx.beginPath();
    ctx.rect(SAFE.x, SAFE.y, SAFE.w, CONTENT_BOTTOM - SAFE.y);
    ctx.clip();

    layouts.forEach((layout, index) => {
      if (index > active) return;

      const messageTiming = timings.messages[index]!;
      const local = t - messageTiming.start;
      const isActive = index === active;
      const typing = layout.role === 'user' && isActive && local < messageTiming.sendAt;
      const typingProgress = layout.role === 'user'
        ? (typing ? clamp(local / Math.max(0.001, messageTiming.typeDuration)) : 1)
        : 1;
      const shownChars = layout.role === 'user'
        ? Math.floor(layout.charCount * typingProgress)
        : layout.charCount;
      const thinking = layout.role === 'ai' && isActive && local < messageTiming.thinkDuration;
      const streamProgress = layout.role === 'ai'
        ? clamp((t - messageTiming.streamStart) / Math.max(0.001, messageTiming.streamDuration))
        : 1;
      const shownWords = layout.role === 'ai'
        ? (thinking ? 0 : Math.min(layout.words.length, Math.ceil(streamProgress * layout.words.length)))
        : layout.words.length;

      const visibleLines = layout.role === 'user'
        ? typedLineCount(layout, shownChars)
        : visibleLineCount(layout, shownWords);
      const bubbleHeight = Math.max(
        MIN_BUBBLE_HEIGHT,
        visibleLines * LINE_HEIGHT + PAD_Y * 2,
      );

      const rowY = blockTop + layout.top;
      const userX = SAFE.right - 24 - layout.width;
      const aiX = SAFE.x + 148;
      const x = layout.role === 'user' ? userX : aiX;
      const sendProgress = ease.outBack(prog(local, messageTiming.sendAt, Math.min(0.18, timings.beat * 0.22)));
      const aiEntry = ease.outBack(prog(local, 0, Math.min(0.18, timings.beat * 0.24)));
      const popScale = layout.role === 'user'
        ? (typing ? 0.98 : 0.91 + 0.09 * sendProgress)
        : 0.90 + 0.10 * aiEntry;
      const yOffset = layout.role === 'user'
        ? (typing ? 20 : (1 - ease.outExpo(prog(local, messageTiming.sendAt, Math.min(0.18, timings.beat * 0.22)))) * 16)
        : (1 - ease.outExpo(prog(local, 0, Math.min(0.18, timings.beat * 0.24)))) * 12;
      const alpha = index >= firstInGroup ? 1 : Math.max(0.18, 0.32 - (firstInGroup - index - 1) * 0.06);
      const bubbleY = rowY + yOffset;

      if (bubbleY + bubbleHeight < SAFE.y - 12 || bubbleY > CONTENT_BOTTOM + 12) return;

      drawBubble(frame, layout, x, bubbleY, bubbleHeight, popScale, alpha, () => {
        if (layout.role === 'user') {
          drawTyping(frame, layout, x, bubbleY, shownChars, typing);
        } else if (thinking) {
          drawThinking(frame, x, bubbleY, bubbleHeight, local);
        } else {
          drawReply(frame, layout, x, bubbleY, shownWords, messageTiming, layout.words.length);
        }
      });

      if (layout.role === 'ai') {
        const avatarY = bubbleY + Math.max(MIN_BUBBLE_HEIGHT, bubbleHeight) / 2;
        ctx.save();
        ctx.globalAlpha *= alpha;
        icon3d(ctx, theme, 'robot', SAFE.x + 68, avatarY, 120, {
          yaw: t * 0.44 + Math.sin(t * 1.5) * 0.08,
          pitch: 0.26 + Math.sin(t * 1.2) * 0.035,
          seed: index + 7,
        });
        ctx.restore();
      }
    });
    ctx.restore();
  },

  cues(props: ChatProps, dur: number): Cue[] {
    const messages = cleanMessages(props);
    const timing = makeTiming(messages.length, dur);
    if (!messages.length || dur <= 0) return [];

    const cues: Cue[] = [];
    const wordEvents: { t: number; order: number }[] = [];
    let eventOrder = 0;

    messages.forEach((message, index) => {
      const messageTiming = timing.messages[index]!;
      if (message.role === 'user') {
        cues.push({
          t: messageTiming.start,
          kind: 'type',
          len: Math.min(messageTiming.typeDuration, Math.max(0.04, dur - messageTiming.start)),
        });
        cues.push({
          t: messageTiming.sendAt,
          kind: 'pop',
          step: index / Math.max(1, messages.length - 1),
        });
        return;
      }

      cues.push({
        t: messageTiming.start,
        kind: 'pop',
        step: index / Math.max(1, messages.length - 1),
      });
      cues.push({
        t: messageTiming.streamStart,
        kind: 'type',
        len: Math.min(messageTiming.streamDuration, Math.max(0.04, dur - messageTiming.streamStart)),
      });

      const marked = message.words.filter((word) => word.accent);
      if (marked.length) {
        const lastMarked = marked.at(-1)!;
        const at = messageTiming.streamStart
          + messageTiming.streamDuration * ((lastMarked.order + 1) / message.words.length);
        if (at < dur) cues.push({ t: at, kind: 'shimmer' });
      }

      message.words.forEach((word, wordIndex) => {
        const at = messageTiming.streamStart
          + messageTiming.streamDuration * ((wordIndex + 1) / message.words.length);
        if (at < dur) wordEvents.push({ t: at, order: eventOrder++ });
      });
    });

    // Keep a subtle tick on streamed words, thinned to a fast but legible cadence.
    const tickBudget = Math.min(28, Math.max(1, Math.floor(dur * 10)));
    const stride = Math.max(1, Math.ceil(wordEvents.length / tickBudget));
    let lastTick = -Infinity;
    wordEvents.forEach((event, index) => {
      if (index % stride !== 0 || event.t - lastTick < 1 / 12) return;
      cues.push({ t: event.t, kind: 'tick', step: event.order / Math.max(1, wordEvents.length - 1) });
      lastTick = event.t;
    });

    return cues
      .filter((cue) => cue.t >= 0 && cue.t < dur)
      .sort((a, b) => a.t - b.t)
      .slice(0, 38);
  },
};
