import { type Frame, type ChangelogProps, type SceneDef, clamp, ease, prog, stripMarkup } from '../core.ts';
import { panel, pixelText, pixelWidth, text, textWidth } from '../prim.ts';

const TAGS: Record<ChangelogProps['items'][number]['tag'], { bg: 'fg' | 'panelAlt' | 'none'; strike?: boolean }> = {
  NEW: { bg: 'fg' }, FIX: { bg: 'none' }, CHG: { bg: 'panelAlt' }, DEL: { bg: 'none', strike: true },
};

function wrapTwoLines(ctx: Frame['ctx'], value: string, maxWidth: number, size: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of String(value ?? '').trim().split(/\s+/).filter(Boolean)) {
    let chunk = '';
    const chunks: string[] = [];
    for (const char of [...word]) {
      if (chunk && textWidth(ctx, chunk + char, size, 800) > maxWidth) {
        chunks.push(chunk);
        chunk = char;
      } else chunk += char;
    }
    if (chunk) chunks.push(chunk);
    for (const [index, part] of chunks.entries()) {
      const candidate = line ? `${line}${index === 0 ? ' ' : ''}${part}` : part;
      if (line && textWidth(ctx, candidate, size, 800) > maxWidth) {
        lines.push(line);
        line = part;
      } else line = candidate;
    }
  }
  if (line) lines.push(line);
  if (lines.length > 2) {
    lines.length = 2;
    let last = lines[1] ?? '';
    while (last && textWidth(ctx, `${last}…`, size, 800) > maxWidth) last = [...last].slice(0, -1).join('');
    lines[1] = `${last}…`;
  }
  return lines;
}

function fitPixelLine(value: string, width: number, px: number): string {
  const source = String(value ?? '').toUpperCase().replace(/\s+/g, ' ').trim();
  if (pixelWidth(source, px) <= width) return source;
  const chars = [...source];
  while (chars.length && pixelWidth(`${chars.join('')}...`, px) > width) chars.pop();
  return chars.length ? `${chars.join('')}...` : '';
}

export const changelogScene: SceneDef<ChangelogProps> = {
  type: 'changelog',
  render(frame: Frame, props: ChangelogProps) {
    const { ctx, theme, t, dur } = frame;
    const items = (Array.isArray(props.items) ? props.items : []).slice(0, 6).filter(item => item && String(item.text ?? '').trim());
    const count = items.length;
    const x = 96, w = 888;
    const product = String(props.product ?? 'PATCH NOTES').trim().toUpperCase().slice(0, 24) || 'PATCH NOTES';
    const version = String(props.version ?? 'V1.0').trim().toUpperCase().slice(0, 10) || 'V1.0';
    const productLine = fitPixelLine(product, 792, 5);
    const versionLine = fitPixelLine(version, 792, 18);
    const rowsTopOffset = 286;
    const rowGap = count >= 6 ? 10 : count >= 3 ? 14 : count === 2 ? 18 : 0;
    const rowHeight = count >= 6 ? 104 : count >= 3 ? 190 : count === 2 ? 250 : 180;
    const panelHeight = count ? rowsTopOffset + count * rowHeight + Math.max(0, count - 1) * rowGap + 24 : 460;
    const y = Math.round(740 - panelHeight / 2);
    const rowsTop = y + rowsTopOffset;
    const entranceStart = Math.min(0.12, dur * 0.04);
    const stagger = Math.min(0.08, Math.max(0.035, dur * 0.02));
    const activeIndex = items.some(item => !!item.accent)
      ? items.findIndex(item => !!item.accent)
      : count ? Math.min(count - 1, Math.max(0, Math.floor((t - entranceStart) / stagger))) : -1;
    const rowLayouts = items.map(item => wrapTwoLines(ctx, stripMarkup(String(item.text ?? '').slice(0, 500)), 612, 42));

    panel(ctx, x, y, w, panelHeight, { fill: theme.panel, stroke: theme.line, lineWidth: 4, notch: 30 });
    pixelText(ctx, productLine, 144, y + 32, 5, { color: theme.dim });

    const headP = prog(t, 0.04, Math.min(0.34, dur * 0.16));
    const rolling = [...versionLine].map((char, index) => {
      const reveal = prog(t, 0.08 + index * 0.035, 0.2);
      return reveal < 1 && /\d/.test(char) ? '0123456789'[Math.floor((t * 29 + index * 13) % 10)]! : char;
    }).join('');
    pixelText(ctx, rolling, 144, y + 90, 18, { color: theme.fg, reveal: headP, mode: 'blocks', seed: frame.seed });

    const separatorY = y + 250;
    ctx.fillStyle = theme.line;
    ctx.fillRect(144, separatorY, 792, 4);

    items.forEach((item, index) => {
      const rowY = rowsTop + index * (rowHeight + rowGap);
      const p = prog(t, entranceStart + index * stagger, Math.min(0.28, Math.max(0.18, dur * 0.12)));
      const active = index === activeIndex;
      const tag = TAGS[item.tag] ? item.tag : 'CHG';
      const spec = TAGS[tag];
      const tagX = 144, tagY = rowY + (rowHeight - 64) / 2, tagW = 140, tagH = 64;
      const entry = ease.outBack(p);
      const slide = (1 - entry) * -320;
      const tagFill = active ? theme.accent : spec.bg === 'fg' ? theme.fg : spec.bg === 'panelAlt' ? theme.panelAlt : theme.panel;
      const tagText = active ? theme.onAccent : spec.bg === 'fg' ? theme.bg : theme.fg;
      const lines = rowLayouts[index]!;
      const lineHeight = 48;
      const textBaseline = rowY + (rowHeight - lines.length * lineHeight) / 2 + 38;

      ctx.save();
      ctx.globalAlpha *= clamp(p * 3);
      ctx.translate(slide, 0);
      ctx.fillStyle = tagFill;
      ctx.fillRect(tagX, tagY, active ? tagW * ease.outExpo(Math.min(1, p * 1.5)) : tagW, tagH);
      if (!active && spec.bg === 'none') panel(ctx, tagX, tagY, tagW, tagH, { stroke: theme.dim, lineWidth: 4 });
      pixelText(ctx, tag, tagX + tagW / 2, tagY + 14, 5, { color: tagText, align: 'center', reveal: p, mode: 'type' });
      if (spec.strike) {
        ctx.fillStyle = active ? theme.onAccent : theme.dim;
        ctx.fillRect(tagX, tagY + tagH / 2 - 2, tagW, 4);
      }
      lines.forEach((line, lineIndex) => text(ctx, line, 324, textBaseline + lineIndex * lineHeight, { size: 42, color: theme.fg, weight: 800 }));

      if (active) {
        const q = ease.outExpo(Math.min(1, p * 1.6));
        const left = 132, right = 948, top = rowY + 4, bottom = rowY + rowHeight - 4;
        const corner = (32 + 8 * (0.5 + 0.5 * Math.sin(t * Math.PI * 5))) * q;
        ctx.fillStyle = theme.accent;
        ctx.fillRect(left, top, 8, Math.max(0, bottom - top));
        ctx.fillRect(right - 8, top, 8, Math.max(0, bottom - top));
        ctx.fillRect(left, top, corner, 8);
        ctx.fillRect(left, bottom - 8, corner, 8);
        ctx.fillRect(right - corner, top, corner, 8);
        ctx.fillRect(right - corner, bottom - 8, corner, 8);
      }
      ctx.restore();

      if (index < count - 1) {
        ctx.fillStyle = theme.line;
        ctx.fillRect(144, rowY + rowHeight + rowGap / 2 - 1, 792, 3);
      }
    });

    if (!count) pixelText(ctx, 'NO CHANGES', 540, y + 340, 8, { color: theme.dim, align: 'center' });
  },
};
