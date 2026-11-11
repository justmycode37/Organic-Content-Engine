import { CONTENT_BOTTOM, SAFE, type Cue, type Frame, type OutroProps, type SceneDef, clamp, ease, hash, parseMarkup, prog, stripMarkup } from '../core.ts';
import { pixelBlock, pixelHeight, pixelLines, pixelText, pixelWidth, text, textWidth, wrapText } from '../prim.ts';
import { CELL, typeMask } from '../pix.ts';
import { icon3d } from '../icon3d.ts';

type Timing = {
  cta: number;
  ctaLength: number;
  icon: number;
  iconLength: number;
  logo: number;
  logoLength: number;
  handle: number;
};

const LOGO_PX = 22;
const LOGO_GAP = 18;
const LOGO_LINES = ['PATCH', 'NOTES'];

function timingFor(dur: number): Timing {
  const logo = Math.min(0.24, dur * 0.1);
  const logoLength = Math.min(0.9, Math.max(0.58, dur * 0.25));
  return {
    cta: 0,
    ctaLength: Math.min(0.28, Math.max(0.16, dur * 0.12)),
    icon: Math.min(0.08, dur * 0.04),
    iconLength: Math.min(0.22, Math.max(0.14, dur * 0.1)),
    logo,
    logoLength,
    handle: logo + logoLength + Math.min(0.1, dur * 0.05),
  };
}

function fitCta(value: string) {
  const pxSizes = [14, 12];
  let fit = { px: 12, lines: [] as string[] };
  for (const px of pxSizes) {
    const candidate = pixelLines(value.toUpperCase(), px, SAFE.w - 24);
    fit = { px, lines: candidate };
    if (candidate.length <= 3 && candidate.every(line => pixelWidth(stripMarkup(line), px) <= SAFE.w - 24)) return fit;
  }
  if (fit.lines.length > 3) {
    const visible = fit.lines.slice(0, 3);
    const raw = visible[2] ?? '';
    const spans = parseMarkup(raw);
    const chars = spans.flatMap(span => [...span.text].map(char => ({ char, accent: span.accent })));
    let keep: typeof chars = [];
    for (const item of chars) {
      const candidate = [...keep, item].map(entry => entry.char).join('') + '…';
      if (pixelWidth(candidate, fit.px) > SAFE.w - 24) break;
      keep.push(item);
    }
    const last = keep.reduce((out, item, index) => {
      const previous = keep[index - 1];
      if (index === 0 || previous?.accent !== item.accent) out += item.accent ? '*' : (previous?.accent ? '*' : '');
      return out + item.char;
    }, '');
    visible[2] = `${last}…`;
    if ((visible[2]!.match(/\*/g)?.length ?? 0) % 2) visible[2] += '*';
    fit = { px: fit.px, lines: visible };
  }
  return fit;
}

function wrapSmall(ctx: Frame['ctx'], value: string, width: number, size: number): string[] {
  const lines = wrapText(ctx, value, width, size, 800);
  if (lines.length <= 1) return lines;
  let last = lines[0]!;
  while (last && textWidth(ctx, `${last}…`, size) > width) last = last.slice(0, -1).trimEnd();
  return [`${last}…`];
}

function drawAssemblingLine(
  frame: Frame,
  value: string,
  x: number,
  y: number,
  lineIndex: number,
  progress: number,
) {
  const { ctx, theme, seed } = frame;
  const cap = Math.round((7 * LOGO_PX) / CELL);
  const mask = typeMask(value, cap);
  if (!mask) {
    pixelText(ctx, value, SAFE.cx, y, LOGO_PX, {
      color: progress >= 1 ? theme.fg : theme.accent,
      align: 'center',
      reveal: ease.outExpo(progress),
      mode: 'blocks',
      seed: seed + lineIndex * 31,
    });
    return;
  }

  const width = mask.cols * CELL;
  const left = Math.round(x - width / 2);
  const p = ease.outCubic(progress);
  ctx.save();
  ctx.beginPath();
  ctx.rect(SAFE.x, SAFE.y, SAFE.w, CONTENT_BOTTOM - SAFE.y);
  ctx.clip();
  for (let row = 0; row < mask.rows; row++) {
    for (let col = 0; col < mask.cols; col++) {
      if (mask.bits[row * mask.cols + col] !== 1) continue;
      const order = hash(col + lineIndex * 197, row + seed * 11);
      if (progress < order) continue;
      const settle = clamp((progress - order) / Math.max(0.001, 1 - order));
      const targetX = left + col * CELL;
      const targetY = y + row * CELL;
      const flying = hash(col * 3 + 41, row * 7 + lineIndex * 89) < 0.12 && settle < 0.94;

      if (flying) {
        const fromX = SAFE.x + hash(col + 17, row + 29 + lineIndex) * (SAFE.w - CELL);
        const fromY = SAFE.y + hash(row + 313, col + 997 + lineIndex) * (CONTENT_BOTTOM - SAFE.y - CELL);
        const travel = ease.outBack(settle);
        ctx.fillStyle = theme.accent;
        ctx.fillRect(fromX + (targetX - fromX) * travel, fromY + (targetY - fromY) * travel, CELL, CELL);
      } else {
        ctx.fillStyle = settle > 0.74 ? theme.fg : theme.accent;
        ctx.fillRect(targetX, targetY, CELL, CELL);
      }
    }
  }
  ctx.restore();
}

function handleText(ctx: Frame['ctx'], value: string): { text: string; size: number } {
  let output = value ? `@${value.trim().replace(/^@/, '')}` : '';
  let size = 44;
  while (output && size > 28 && textWidth(ctx, output, size, 800) > SAFE.w - 48) size -= 4;
  if (output && textWidth(ctx, output, size, 800) > SAFE.w - 48) {
    while (output.length && textWidth(ctx, `${output}…`, size, 800) > SAFE.w - 48) output = output.slice(0, -1);
    output = `${output}…`;
  }
  return { text: output, size };
}

export const outroScene: SceneDef<OutroProps> = {
  type: 'outro',
  render(frame: Frame, props: OutroProps) {
    const { ctx, theme, t, dur, seed } = frame;
    const timing = timingFor(dur);
    const cta = String(props.cta ?? '').trim();
    const ctaFit = fitCta(cta);
    const ctaGap = Math.max(12, ctaFit.px * 1.2);
    const ctaHeight = ctaFit.lines.length * pixelHeight(ctaFit.px) + Math.max(0, ctaFit.lines.length - 1) * ctaGap;
    const logoHeight = pixelHeight(LOGO_PX) * LOGO_LINES.length + LOGO_GAP;
    const handle = handleText(ctx, String(props.handle ?? ''));
    const handleHeight = handle.text ? 52 : 0;
    const sub = String(props.sub ?? '').trim();
    const subLines = sub ? wrapSmall(ctx, sub, SAFE.w - 64, 32) : [];
    const subHeight = subLines.length ? 42 : 0;
    const iconSize = 160;
    const iconToCta = ctaHeight ? 24 : 0;
    const ctaToLogo = ctaHeight ? 28 : 0;
    const logoToHandle = handleHeight ? 26 : 0;
    const handleToSub = handleHeight && subHeight ? 10 : 0;
    const total = iconSize + iconToCta + ctaHeight + ctaToLogo + logoHeight + logoToHandle + handleHeight + handleToSub + subHeight;
    let y = 740 - total / 2;

    const iconY = y + iconSize / 2 + Math.sin(t * 1.8) * 5;
    const iconReveal = ease.outExpo(prog(t, timing.icon, timing.iconLength));
    icon3d(ctx, theme, 'heart', SAFE.cx, iconY, iconSize, {
      yaw: 0.42 + Math.sin(t * 0.55) * 0.2,
      pitch: 0.28 + Math.sin(t * 0.9) * 0.04,
      reveal: iconReveal,
      seed: seed + 73,
    });
    y += iconSize + iconToCta;

    const ctaProgress = ease.outExpo(prog(t, timing.cta, timing.ctaLength));
    if (ctaHeight) {
      pixelBlock(ctx, ctaFit.lines, SAFE.cx, y, ctaFit.px, {
        color: theme.fg,
        accent: theme.accent,
        align: 'center',
        reveal: ctaProgress,
        mode: 'type',
        seed,
        gap: ctaGap,
        stagger: ctaFit.lines.length > 1 ? 0.08 : 0,
      });
      y += ctaHeight + ctaToLogo;
    }

    const logoProgress = prog(t, timing.logo, timing.logoLength);
    drawAssemblingLine(frame, LOGO_LINES[0]!, SAFE.cx, y, 0, logoProgress);
    drawAssemblingLine(frame, LOGO_LINES[1]!, SAFE.cx, y + pixelHeight(LOGO_PX) + LOGO_GAP, 1, logoProgress);
    y += logoHeight + logoToHandle;

    const handleProgress = ease.outExpo(prog(t, timing.handle, Math.min(0.2, Math.max(0.14, dur * 0.09))));
    if (handle.text) {
      text(ctx, handle.text, SAFE.cx, y + 40, {
        size: handle.size,
        color: theme.dim,
        weight: 800,
        align: 'center',
        alpha: handleProgress,
      });
      y += handleHeight + handleToSub;
    }
    if (subHeight) {
      text(ctx, subLines[0]!, SAFE.cx, y + 32, {
        size: 32,
        color: theme.dim,
        weight: 800,
        align: 'center',
        alpha: ease.outExpo(prog(t, timing.handle + 0.08, 0.18)),
      });
    }
  },
  cues(props: OutroProps, dur: number): Cue[] {
    if (dur <= 0) return [];
    const timing = timingFor(dur);
    const cues: Cue[] = [
      ...(String(props.cta ?? '').trim() ? [{ t: timing.cta, kind: 'rise' as const, len: timing.ctaLength }] : []),
      { t: timing.icon, kind: 'pop' },
      { t: timing.logo, kind: 'swish' },
      { t: timing.logo + timing.logoLength, kind: 'impact' },
      { t: Math.min(dur - 0.005, timing.logo + timing.logoLength + 0.04), kind: 'shimmer' },
      ...(props.handle ? [{ t: timing.handle, kind: 'pop' as const }] : []),
    ];
    return cues.filter(cue => cue.t >= 0 && cue.t < dur);
  },
};
