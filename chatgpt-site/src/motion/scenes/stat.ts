import { SAFE, ease, prog, type StatProps, type SceneDef } from '../core.ts';
import { pixelHeight, pixelText, pixelWidth, pop } from '../prim.ts';
import { beatProgress, drawBody } from './semantic.ts';

const numberString = (value: number, decimals: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    .format(Number.isFinite(value) ? value : 0);

const compactNumber = (value: number) => {
  const abs = Math.abs(value);
  if (abs >= 1e15) return value.toExponential(1).replace('e', 'E');
  const unit = abs >= 1e9 ? 'B' : 'M';
  const divisor = unit === 'B' ? 1e9 : 1e6;
  const rounded = Math.round(abs / divisor);
  return `${value < 0 ? '-' : ''}${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(rounded)}${unit}`;
};

const formatCount = (value: number, decimals: number, compact: boolean) => {
  const safe = Number.isFinite(value) ? value : 0;
  if (compact && Math.abs(safe) >= 1e6) return compactNumber(safe);
  if (Math.abs(safe) >= 1e15) return safe.toExponential(Math.min(decimals, 2)).replace('e', 'E');
  return numberString(safe, decimals);
};

const affixCount = (formatted: string, prefix: string, suffix: string) =>
  formatted.startsWith('-')
    ? `-${prefix}${formatted.slice(1)}${suffix}`
    : `${prefix}${formatted}${suffix}`;

export const statScene: SceneDef<StatProps> = {
  type: 'stat',
  render(frame, props) {
    const { ctx, theme } = frame;
    const value = Number.isFinite(props.value) ? props.value : 0;
    const from = Number.isFinite(props.from) ? props.from! : 0;
    const decimals = Math.max(0, Math.min(6, Math.floor(props.decimals ?? 0)));
    const compact = Math.abs(value) >= 1e6 && decimals === 0 && !props.suffix;
    const progress = props.slam || frame.opening ? 1 : ease.outExpo(prog(frame.t, 0, Math.min(frame.dur * 0.18, 0.35)));
    const current = from + (value - from) * progress;
    const finalNumeral = affixCount(formatCount(value, decimals, compact), props.prefix ?? '', props.suffix ?? '');
    const numeral = affixCount(formatCount(current, decimals, compact), props.prefix ?? '', props.suffix ?? '');
    const module = Math.max(10, Math.min(56, Math.floor(720 / Math.max(1, pixelWidth(finalNumeral, 1)))));
    const landing = beatProgress(frame, 'result', 0.37);
    const compare = beatProgress(frame, 'compare', 0.62);
    if (props.versus && compare > 0) {
      const comparator = affixCount(formatCount(props.versus.value, decimals, compact), props.prefix ?? '', props.suffix ?? '');
      drawBody(ctx, comparator, SAFE.cx - 24, 480, 720, 288, { color: theme.fg, align: 'center', maxSize: 128, maxLines: 2 });
      drawBody(ctx, props.versus.label, SAFE.cx - 24, 876, 720, 168, { color: theme.dim, align: 'center', maxSize: 80, maxLines: 2 });
      return;
    }
    const settle = 1 + Math.sin(landing * Math.PI) * 0.04;
    pop(ctx, SAFE.cx - 24, 600, settle, 1, () => pixelText(ctx, numeral, SAFE.cx - 24, 600 - pixelHeight(module) / 2, module, { color: landing > 0 || props.slam ? theme.accent : theme.fg, align: 'center' }));
    drawBody(ctx, props.label, SAFE.cx - 24, 876, 720, 168, { color: theme.fg, align: 'center', maxSize: 80, maxLines: 2 });
  },
};
