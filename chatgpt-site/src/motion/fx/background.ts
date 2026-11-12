import { H, W, type Frame } from '../core.ts';

export function drawBackground(frame: Frame, _time: number) {
  frame.ctx.fillStyle = frame.theme.bg;
  frame.ctx.fillRect(0, 0, W, H);
}
