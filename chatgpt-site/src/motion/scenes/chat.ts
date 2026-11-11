import { type Frame, type ChatProps, type SceneDef, SAFE, CONTENT_BOTTOM, clamp, ease, markupWords, prog } from '../core.ts';
import { cursor, panel, pixelText, pixelWidth, text, textWidth } from '../prim.ts';
import { icon } from '../icons.ts';

const MESSAGE_SIZE = 44;
const MESSAGE_WEIGHT = 700;
const LINE_HEIGHT = 66;
const BUBBLE_PAD = 32;
const MESSAGE_GAP = 28;
const MAX_TEXT = 2000;
const PUNCTUATION = /^[,.;:!?%)\]}]/;

type ChatWord = { word: string; accent: boolean };
type ChatLayout = {
  role: 'user' | 'ai';
  words: ChatWord[];
  lines: ChatWord[][];
  width: number;
  height: number;
  top: number;
};

function cappedText(value: unknown): string {
  const raw = String(value ?? '');
  return raw.length > MAX_TEXT ? raw.slice(0, MAX_TEXT - 1) + '…' : raw;
}

function splitLongWords(ctx: Frame['ctx'], words: ChatWord[], maxWidth: number): ChatWord[] {
  const result: ChatWord[] = [];
  for (const item of words) {
    if (textWidth(ctx, item.word, MESSAGE_SIZE, MESSAGE_WEIGHT) <= maxWidth) {
      result.push(item);
      continue;
    }
    let part = '';
    for (const char of [...item.word]) {
      if (part && textWidth(ctx, part + char, MESSAGE_SIZE, MESSAGE_WEIGHT) > maxWidth) {
        result.push({ word: part, accent: item.accent });
        part = '';
      }
      part += char;
    }
    if (part) result.push({ word: part, accent: item.accent });
  }
  return result;
}

function wrapWords(ctx: Frame['ctx'], source: ChatWord[], maxWidth: number): ChatWord[][] {
  const words = splitLongWords(ctx, source, maxWidth);
  const lines: ChatWord[][] = [[]];
  let lineText = '';
  for (const item of words) {
    const spacer = lineText && !PUNCTUATION.test(item.word) ? ' ' : '';
    const candidate = lineText + spacer + item.word;
    if (lineText && textWidth(ctx, candidate, MESSAGE_SIZE, MESSAGE_WEIGHT) > maxWidth) {
      lines.push([item]);
      lineText = item.word;
    } else {
      lines[lines.length - 1]!.push(item);
      lineText = candidate;
    }
  }
  return lines;
}

function lineWidth(ctx: Frame['ctx'], line: ChatWord[]): number {
  let value = '';
  line.forEach((item, index) => {
    const spacer = index && !PUNCTUATION.test(item.word) ? ' ' : '';
    value += spacer + item.word;
  });
  return textWidth(ctx, value, MESSAGE_SIZE, MESSAGE_WEIGHT);
}

function fitModel(value: string, maxWidth: number): { label: string; px: number } {
  let label = value || 'AI';
  let px = 6;
  while (px > 4 && pixelWidth(label, px) > maxWidth) px--;
  if (pixelWidth(label, px) > maxWidth) {
    const suffix = '...';
    while (label.length && pixelWidth(label + suffix, px) > maxWidth) label = label.slice(0, -1);
    label = label ? label + suffix : suffix;
  }
  return { label, px };
}

export const chatScene: SceneDef<ChatProps> = {
  type: 'chat',
  render(frame: Frame, props: ChatProps) {
    const { ctx, theme } = frame;
    const t = Math.max(0, frame.t);
    const winY = 240;
    const winH = CONTENT_BOTTOM - winY;
    const headerH = 110;
    panel(ctx, SAFE.x, winY, SAFE.w, winH, { fill: theme.panel, stroke: theme.line, lineWidth: 4 });
    ctx.fillStyle = theme.panelAlt;
    ctx.fillRect(SAFE.x + 2, winY + 2, SAFE.w - 4, headerH - 2);
    ctx.fillStyle = theme.line;
    ctx.fillRect(SAFE.x, winY + headerH, SAFE.w, 4);
    icon(ctx, 'robot', SAFE.x + 60, winY + headerH / 2, 5, theme.fg);
    const model = String(props?.model || 'AI').trim().toUpperCase();
    const modelFit = fitModel(model, SAFE.w - 204);
    pixelText(ctx, modelFit.label, SAFE.x + 120, winY + (headerH - modelFit.px * 7) / 2, modelFit.px, { color: theme.fg });

    const inputH = 104;
    const inputX = SAFE.x + 24;
    const inputW = SAFE.w - 48;
    const inputY = CONTENT_BOTTOM - 24 - inputH;
    const bodyY = winY + headerH + 20;
    const bodyBottom = inputY - 20;
    const bodyH = bodyBottom - bodyY;
    const messages = (Array.isArray(props?.messages) ? props.messages : [])
      .slice(0, 6)
      .map(message => ({ role: message?.role === 'user' ? 'user' as const : 'ai' as const, text: cappedText(message?.text) }))
      .filter(message => message.text.trim().length > 0);
    const maxBubble = SAFE.w * .8;
    const textMax = maxBubble - BUBBLE_PAD * 2;
    const layouts: ChatLayout[] = messages.map(message => {
      const parsed = markupWords(message.text);
      const words = message.role === 'user'
        ? parsed.map(item => ({ word: item.text, accent: false }))
        : parsed.map(item => ({ word: item.text, accent: item.accent }));
      const lines = wrapWords(ctx, words, textMax);
      const measuredWidth = Math.max(0, ...lines.map(line => lineWidth(ctx, line)));
      const width = Math.min(maxBubble, Math.max(160, measuredWidth + BUBBLE_PAD * 2));
      return { role: message.role, words, lines, width, height: Math.max(1, lines.length) * LINE_HEIGHT + BUBBLE_PAD * 2, top: 0 };
    });
    let fullHeight = 0;
    layouts.forEach((layout, index) => {
      layout.top = fullHeight;
      fullHeight += layout.height + (index < layouts.length - 1 ? MESSAGE_GAP : 0);
    });
    const contentTop = bodyY + (fullHeight <= bodyH ? (bodyH - fullHeight) / 2 : 0);
    const beat = messages.length ? frame.dur * .64 / messages.length : frame.dur;
    const active = messages.length ? Math.min(messages.length - 1, Math.floor(t / Math.max(.001, beat))) : -1;
    const maxScroll = Math.max(0, fullHeight - bodyH);
    const scrollTarget = active >= 0
      ? clamp(layouts[active]!.top + layouts[active]!.height - bodyH, 0, maxScroll)
      : 0;
    const previousTarget = active > 0
      ? clamp(layouts[active - 1]!.top + layouts[active - 1]!.height - bodyH, 0, maxScroll)
      : 0;
    const scrollLocal = active >= 0 ? t - active * beat : 0;
    const scroll = previousTarget + (scrollTarget - previousTarget) * ease.outCubic(prog(scrollLocal, 0, Math.min(.20, beat * .55)));

    ctx.save();
    ctx.beginPath();
    ctx.rect(SAFE.x + 4, bodyY, SAFE.w - 8, bodyH);
    ctx.clip();
    layouts.forEach((layout, index) => {
      const local = t - index * beat;
      if (local < 0) return;
      const enter = ease.outBack(prog(local, 0, Math.min(.22, Math.max(.06, beat * .34))));
      const bx = layout.role === 'user' ? SAFE.right - 28 - layout.width : SAFE.x + 28;
      const by = contentTop + layout.top - scroll + (1 - enter) * 20;
      panel(ctx, bx, by, layout.width, layout.height, {
        fill: layout.role === 'user' ? theme.fg : theme.panelAlt,
        stroke: layout.role === 'user' ? undefined : theme.line,
        lineWidth: 4,
      });
      const user = layout.role === 'user';
      const delay = user ? beat * .06 : beat * .16;
      const revealDuration = Math.max(.06, beat * (user ? .78 : .72));
      const progress = clamp((local - delay) / revealDuration);
      const shown = Math.floor(layout.words.length * progress);
      let consumed = 0;
      if (!user && local < delay) {
        const phase = local * 12;
        for (let dot = 0; dot < 3; dot++) {
          const lift = Math.max(0, Math.sin(phase - dot * 1.8)) * 10;
          ctx.fillStyle = theme.muted;
          ctx.fillRect(bx + BUBBLE_PAD + dot * 24, by + BUBBLE_PAD + 8 - lift, 12, 12);
        }
      }
      layout.lines.forEach((line, lineIndex) => {
        const lineY = by + BUBBLE_PAD + lineIndex * LINE_HEIGHT;
        let x = bx + BUBBLE_PAD;
        const color = user ? theme.bg : theme.fg;
        line.forEach((word, wordIndex) => {
          const spacer = wordIndex && !PUNCTUATION.test(word.word) ? ' ' : '';
          const value = spacer + word.word;
          if (consumed < shown) {
            text(ctx, value, x, lineY, {
              size: MESSAGE_SIZE,
              color: !user && word.accent ? theme.accent : color,
              weight: MESSAGE_WEIGHT,
              baseline: 'top',
            });
          }
          consumed++;
          x += textWidth(ctx, value, MESSAGE_SIZE, MESSAGE_WEIGHT);
        });
      });
      if (user && local > beat * .88) {
        ctx.fillStyle = theme.fg;
        ctx.fillRect(bx + layout.width - 20, by + layout.height - 20, 8, 8);
      }
    });
    ctx.restore();

    panel(ctx, inputX, inputY, inputW, inputH, { fill: theme.panel, stroke: theme.line, lineWidth: 4 });
    const placeholder = 'Message…';
    const placeholderX = inputX + 24;
    text(ctx, placeholder, placeholderX, inputY + inputH / 2, { size: 36, color: theme.dim, baseline: 'middle' });
    cursor(ctx, placeholderX + textWidth(ctx, placeholder, 36) + 14, inputY + 34, 18, 36, theme.fg, t);
    const sendSize = 72;
    const sendX = inputX + inputW - sendSize - 12;
    const sending = messages.some((message, index) => message.role === 'user' && t > index * beat + beat * .88);
    ctx.fillStyle = sending ? theme.fg : theme.panelAlt;
    ctx.fillRect(sendX, inputY + (inputH - sendSize) / 2, sendSize, sendSize);
    pixelText(ctx, '>', sendX + 12, inputY + (inputH - 56) / 2, 8, { color: sending ? theme.bg : theme.fg });
  },
};
