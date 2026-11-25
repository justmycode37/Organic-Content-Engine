import { preparePlanets, renderFrame, type Shot } from './index.ts';
import { sampler, studies } from './studies.ts';

const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d', { alpha: false })!;
const choices: Record<string, Shot[]> = {
  ...Object.fromEntries(Object.entries(studies).map(([name, shot]) => [name, [shot]])),
  sampler,
};
const skyStudy = {
  durations: Object.fromEntries(
    Object.entries(choices).map(([name, shots]) => [name, shots.reduce((sum, s) => sum + s.duration, 0)]),
  ),
  frame(name: keyof typeof choices, t: number, width: number, mime: string) {
    if (canvas.width !== width || canvas.height !== (width * 9) / 16) {
      canvas.width = width;
      canvas.height = (width * 9) / 16;
    }
    renderFrame(ctx, choices[name], t);
    return canvas.toDataURL(mime, 0.97).split(',')[1];
  },
};
Object.assign(window, { skyStudy, motionAssetsReady: preparePlanets() });
