// Shot library: choreographed, full-bleed 3D pixel-art shots. One file per shot
// (src/motion/shots/<name>.ts) exporting a ShotDef; register it in SHOTS below.
import type { Cue, Frame, SceneDef, ShotProps } from '../core.ts';
import { hedgyDemoShot } from './demo-hedgy.ts';
import { demoAudioShot } from './demo-audio.ts';
import { demoVizShot } from './demo-viz.ts';
import { demoAssetsShot } from './demo-assets.ts';
import { demoFxShot } from './demo-fx.ts';

export interface ShotDef {
  name: string;
  /** One line: what the shot shows and which params it takes. Fed to the reel-writing model. */
  describe: string;
  render(frame: Frame, props: ShotProps): void;
  cues?(props: ShotProps, dur: number): Cue[];
}

export const SHOTS: Record<string, ShotDef> = {
  [hedgyDemoShot.name]: hedgyDemoShot,
  [demoAudioShot.name]: demoAudioShot,
  [demoVizShot.name]: demoVizShot,
  [demoAssetsShot.name]: demoAssetsShot,
  [demoFxShot.name]: demoFxShot,
};

export const shotScene: SceneDef<ShotProps> = {
  type: 'shot',
  render(frame, props) { SHOTS[props.shot]?.render(frame, props); },
  cues(props, dur) { return SHOTS[props.shot]?.cues?.(props, dur) ?? []; },
};
