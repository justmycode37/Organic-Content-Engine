import { CUE_KINDS, type Cue, type Frame, type ShotProps } from '../core.ts';
import type { ShotDef } from './index.ts';

const CUE_GAP = 0.6;
const CUES_PER_SCENE = 13;

export const demoAudioShot: ShotDef = {
  name: 'demo-audio',
  describe: 'Audio cue gallery label card; params.from selects a 13-cue section.',
  render(frame: Frame, props: ShotProps) {
    const from = Math.max(0, Math.floor(Number(props.params?.from ?? 0)));
    const index = Math.min(CUE_KINDS.length - 1, from + Math.floor(frame.t / CUE_GAP));
    const kind = CUE_KINDS[index] ?? 'ding';
    const pulse = 1 + Math.sin(frame.t * Math.PI * 2) * 0.018;
    const { ctx } = frame;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '800 24px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText('HEDGY  /  SOUND STUDY', 540, 688);
    ctx.translate(540, 850);
    ctx.scale(pulse, pulse);
    ctx.font = '900 88px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(kind.toUpperCase(), 0, 0);
    ctx.restore();
  },
  cues(_props: ShotProps, dur: number): Cue[] {
    const from = Math.max(0, Math.floor(Number(_props.params?.from ?? 0)));
    return CUE_KINDS.slice(from, from + CUES_PER_SCENE).flatMap((kind, local) => {
      const t = local * CUE_GAP + 0.12;
      if (t >= dur) return [];
      const len = ['type', 'rise', 'rumble', 'build', 'reverse'].includes(kind)
        ? kind === 'type' ? 0.42 : 0.48
        : undefined;
      return [{
        t,
        kind,
        pan: [-0.72, 0, 0.72][(from + local) % 3],
        gain: [0.82, 0.92, 0.86][local % 3],
        step: (from + local) % 8 / 7,
        ...(len ? { len } : {}),
      }];
    });
  },
};
