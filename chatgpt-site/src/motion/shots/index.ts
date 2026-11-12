// Shot library: choreographed, full-bleed 3D pixel-art shots. One file per shot
// (src/motion/shots/<name>.ts) exporting a ShotDef; register it in SHOTS below.
import type { Cue, Frame, SceneDef, ShotProps } from '../core.ts';
import { hedgyDemoShot } from './demo-hedgy.ts';

import { handoffShot } from './handoff.ts';
import { priceShot } from './price.ts';
import { compareShot } from './compare.ts';
import { storeShot } from './store.ts';
import { waitShot } from './wait.ts';
import { balanceShot } from './balance.ts';
import { equationShot } from './equation.ts';
import { presentShot } from './present.ts';
import { stampShot } from './stamp.ts';
import { demandShot } from './demand.ts';
import { runtoShot } from './runto.ts';
import { newsShot } from './news.ts';
import { rushShot } from './rush.ts';
import { tradeShot } from './trade.ts';
import { queueShot } from './queue.ts';
import { loopShot } from './loop.ts';
import { squeezeShot } from './squeeze.ts';
import { growShot } from './grow.ts';
import { splitShot } from './split.ts';
import { protectShot } from './protect.ts';
import { takeShot } from './take.ts';
import { arriveShot } from './arrive.ts';
import { lockawayShot } from './lockaway.ts';
import { revealShot } from './reveal.ts';
import { breaksShot } from './breaks.ts';
import { STAGE_ZOOM } from '../kit/sprite.ts';

export interface ShotDef {
  name: string;
  /** One line: what the shot shows and which params it takes. Fed to the reel-writing model. */
  describe: string;
  render(frame: Frame, props: ShotProps): void;
  /** 'clean' = authored on the 720 x 860 stage (kit/sprite STAGE_ZOOM); the player zooms it to fill the frame. */
  stage?: 'clean';
  cues?(props: ShotProps, dur: number): Cue[];
}

export const SHOTS: Record<string, ShotDef> = {
  [handoffShot.name]: handoffShot,
  [priceShot.name]: priceShot,
  [compareShot.name]: compareShot,
  [storeShot.name]: storeShot,
  [waitShot.name]: waitShot,
  [balanceShot.name]: balanceShot,
  [equationShot.name]: equationShot,
  [presentShot.name]: presentShot,
  [stampShot.name]: stampShot,
  [demandShot.name]: demandShot,
  [runtoShot.name]: runtoShot,
  [newsShot.name]: newsShot,
  [rushShot.name]: rushShot,
  [tradeShot.name]: tradeShot,
  [queueShot.name]: queueShot,
  [loopShot.name]: loopShot,
  [squeezeShot.name]: squeezeShot,
  [growShot.name]: growShot,
  [splitShot.name]: splitShot,
  [protectShot.name]: protectShot,
  [takeShot.name]: takeShot,
  [arriveShot.name]: arriveShot,
  [lockawayShot.name]: lockawayShot,
  [revealShot.name]: revealShot,
  [breaksShot.name]: breaksShot,
  [hedgyDemoShot.name]: hedgyDemoShot,
};

export const shotScene: SceneDef<ShotProps> = {
  type: 'shot',
  render(frame, props) {
    const shot = SHOTS[props.shot];
    if (!shot) return;
    if (shot.stage !== 'clean') { shot.render(frame, props); return; }
    frame.ctx.save();
    frame.ctx.scale(STAGE_ZOOM, STAGE_ZOOM);
    shot.render(frame, props);
    frame.ctx.restore();
  },
  cues(props, dur) { return SHOTS[props.shot]?.cues?.(props, dur) ?? []; },
};
