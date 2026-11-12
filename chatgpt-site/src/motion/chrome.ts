import { type Frame, type ReelSpec, type SceneType } from './core.ts';
import { pixelText } from './prim.ts';

/**
 * Scene types whose content starts at y >= 384, below the wordmark band. Dense explainers (code, diff, chat, tokens,
 * flow, layers, grid, bars, compare) can grow into that band, and split needs the supporting budget for its pair, so
 * the wordmark steps aside instead of competing.
 */
const CLEAR_TOP = new Set<SceneType>(['title', 'terminal', 'stat', 'list', 'changelog', 'kinetic', 'demo', 'predict', 'quantity', 'evidence', 'scale']);

/** Persistent identity layer. Less is more: only a quiet wordmark; no progress bar, no series tag. */
export function drawChrome(frame: Frame, spec: ReelSpec, time: number, _duration: number) {
  const scene = spec.scenes.length ? frame.index : -1;
  void time;
  const type = spec.scenes[scene]?.type;
  if (!type || !CLEAR_TOP.has(type)) return;
  pixelText(frame.ctx, 'PATCH NOTES', 144, 288, 7, { color: frame.theme.dim });
}
