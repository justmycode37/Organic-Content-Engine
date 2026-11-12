import { SAFE, type PredictProps, type SceneDef } from '../core.ts';
import { drawBody, beatProgress, activeStep } from './semantic.ts';

export const predictScene: SceneDef<PredictProps> = {
  type: 'predict',
  render(frame, props) {
    const { ctx, theme } = frame;
    const reveal = beatProgress(frame, 'result', 0.55);
    const correction = beatProgress(frame, 'correction', 0.8);
    const guesses = props.guesses.slice(0, 4);
    const guess = guesses[activeStep(frame, guesses.length)] ?? '?';
    drawBody(ctx, reveal > 0 ? (correction > 0 && props.correction ? props.correction : props.answer) : guess, SAFE.cx - 24, 504, 744, 288, { color: reveal > 0 ? theme.accent : theme.fg, align: 'center', maxSize: 128, maxLines: 2 });
    drawBody(ctx, reveal > 0 ? `${props.comparison.label} ${props.comparison.value}` : props.question, SAFE.cx - 24, 888, 744, 192, { color: theme.dim, align: 'center', maxSize: 68, maxLines: 2 });
  },
};
