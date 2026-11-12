import { SAFE, parseMarkup, type TitleProps, type SceneDef } from '../core.ts';
import { icon } from '../icons.ts';
import { pixelText, pixelWidth, pixelHeight } from '../prim.ts';
import { beatProgress, drawBody, fitBody } from './semantic.ts';

/** Content band below the wordmark (y 288–337) and above the caption zone. */
const TOP = 384;
const BOTTOM = 1176;
const WIDTH = 744;

function wrapPixel(value: string, module: number): string[] {
  const lines: string[] = [];
  let row = '';
  for (const word of value.split(/\s+/).filter(Boolean)) {
    const next = row ? `${row} ${word}` : word;
    if (row && pixelWidth(next.replaceAll('*', ''), module) > WIDTH) { lines.push(row); row = word; }
    else row = next;
  }
  if (row) lines.push(row);
  return lines;
}

export const titleScene: SceneDef<TitleProps> = {
  type: 'title',
  render(frame, props) {
    const { ctx, theme } = frame;
    const value = props.text.toUpperCase();
    const emphasis = beatProgress(frame, 'result', 0.4);
    const focus = beatProgress(frame, 'focus', 0.75);
    const kicker = props.kicker?.trim() ?? '';
    const sub = props.sub?.trim() ?? '';
    // Optional furniture is reserved first; the headline takes whatever height remains.
    const iconHeight = props.icon ? 120 : 0;
    const kickerHeight = kicker ? fitBody(ctx, kicker, WIDTH, 72, { maxSize: 72, minSize: 56, maxLines: 1 }).size + 36 : 0;
    const subLayout = sub ? fitBody(ctx, sub, WIDTH, 144, { maxSize: 64, minSize: 48, maxLines: 2 }) : null;
    const subHeight = subLayout ? subLayout.lines.length * (subLayout.size + subLayout.lineGap) + 36 : 0;
    const available = BOTTOM - TOP - iconHeight - kickerHeight - subHeight;

    const numericTitle = value.match(/^([\d,.]+)\s+(.+)$/);
    let blockHeight: number;
    let draw: (top: number) => void;
    if (numericTitle) {
      const module = Math.min(48, Math.floor(WIDTH / pixelWidth(numericTitle[1]!, 1)), Math.floor((available - 252) / pixelHeight(1)));
      const numeralHeight = pixelHeight(module);
      const rest = fitBody(ctx, numericTitle[2]!, 720, 216, { maxSize: 108, maxLines: 2 });
      const restHeight = rest.lines.length * (rest.size + rest.lineGap);
      blockHeight = numeralHeight + 36 + restHeight;
      draw = top => {
        pixelText(ctx, numericTitle[1]!, SAFE.cx - 24, top, module, { color: emphasis > 0 ? theme.accent : theme.fg, align: 'center' });
        drawBody(ctx, numericTitle[2]!, SAFE.cx - 24, top + numeralHeight + 36, 720, restHeight, { color: focus > 0 ? theme.accent : theme.fg, align: 'center', maxSize: 108, maxLines: 2 });
      };
    } else {
      let module = 22;
      let lines: string[] = [];
      for (; module >= 8; module--) {
        lines = wrapPixel(value, module);
        const height = lines.length * (pixelHeight(module) + 36) - 36;
        if (lines.length <= 4 && height <= available && lines.every(line => pixelWidth(line.replaceAll('*', ''), module) <= WIDTH)) break;
      }
      lines = lines.slice(0, 4);
      const pitch = pixelHeight(module) + 36;
      blockHeight = lines.length * pitch - 36;
      draw = top => lines.forEach((line, index) => {
        let left = SAFE.cx - 24 - pixelWidth(line.replaceAll('*', ''), module) / 2;
        for (const span of parseMarkup(line)) {
          pixelText(ctx, span.text, left, top + index * pitch, module, { color: span.accent && emphasis > 0 ? theme.accent : theme.fg });
          left += pixelWidth(span.text, module);
        }
      });
    }

    const total = iconHeight + kickerHeight + blockHeight + subHeight;
    let y = Math.max(TOP, (TOP + BOTTOM) / 2 - total / 2);
    if (props.icon) { icon(ctx, props.icon, SAFE.cx - 24, y + 48, 8, theme.accent); y += iconHeight; }
    if (kicker) { drawBody(ctx, kicker.toUpperCase(), SAFE.cx - 24, y, WIDTH, kickerHeight - 36, { color: theme.dim, align: 'center', maxSize: 72, minSize: 56, maxLines: 1 }); y += kickerHeight; }
    draw(y);
    y += blockHeight + 36;
    if (sub) drawBody(ctx, sub, SAFE.cx - 24, y, WIDTH, subHeight - 36, { color: focus > 0 ? theme.fg : theme.dim, align: 'center', maxSize: 64, minSize: 48, maxLines: 2 });
  },
};
