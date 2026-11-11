import { type Frame, type ReelSpec } from './core.ts';
import { pixelText } from './prim.ts';

/** Persistent identity layer. Less is more: only a quiet wordmark; no progress bar, no series tag. */
export function drawChrome(frame: Frame, spec: ReelSpec, time: number, _duration: number) {
  const scene = spec.scenes.length ? frame.index : -1;
  void time;
  if (spec.scenes[scene]?.type === 'outro') return;
  pixelText(frame.ctx, 'PATCH NOTES', 96, 160, 4, { color: frame.theme.muted });
}
