// Shot library: choreographed, full-bleed 3D pixel-art shots. One file per shot
// (src/motion/shots/<name>.ts) exporting a ShotDef; register it in SHOTS below.
import type { Cue, Frame, SceneDef, ShotProps } from '../core.ts';
import { hedgyDemoShot } from './demo-hedgy.ts';
import { demoAudioShot } from './demo-audio.ts';
import { demoVizShot } from './demo-viz.ts';
import { demoAssetsShot } from './demo-assets.ts';
import { demoFxShot } from './demo-fx.ts';
import { announcementShot } from './announcement.ts';
import { waitclockShot } from './waitclock.ts';
import { buybackHandoffShot } from './buybackhandoff.ts';
import { miniMarketShot } from './minimarket.ts';
import { collateralCallShot } from './collateralcall.ts';
import { forcedBuybackShot } from './forcedbuyback.ts';
import { priceStairShot } from './pricestair.ts';
import { vaultLockShot } from './vaultlock.ts';
import { borrowedAssetShot } from './borrowedasset.ts';
import { shortSaleHandoffShot } from './shortsalehandoff.ts';
import { crowdRushShot } from './crowdrush.ts';
import { priceRideShot } from './priceride.ts';
import { demandFeedbackShot } from './demandfeedback.ts';
import { squeezeRocketShot } from './squeezerocket.ts';

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
  [waitclockShot.name]: waitclockShot,
  [announcementShot.name]: announcementShot,
  [buybackHandoffShot.name]: buybackHandoffShot,
  [miniMarketShot.name]: miniMarketShot,
  [collateralCallShot.name]: collateralCallShot,
  [forcedBuybackShot.name]: forcedBuybackShot,
  [priceStairShot.name]: priceStairShot,
  [vaultLockShot.name]: vaultLockShot,
  [borrowedAssetShot.name]: borrowedAssetShot,
  [shortSaleHandoffShot.name]: shortSaleHandoffShot,
  [crowdRushShot.name]: crowdRushShot,
  [priceRideShot.name]: priceRideShot,
  [demandFeedbackShot.name]: demandFeedbackShot,
  [squeezeRocketShot.name]: squeezeRocketShot,
};

export const shotScene: SceneDef<ShotProps> = {
  type: 'shot',
  render(frame, props) { SHOTS[props.shot]?.render(frame, props); },
  cues(props, dur) { return SHOTS[props.shot]?.cues?.(props, dur) ?? []; },
};
