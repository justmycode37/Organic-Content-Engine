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
import { versusShot } from './versus.ts';
import { actShot } from './act.ts';
import { statementShot } from './statement.ts';
import { STAGE_ZOOM } from '../kit/sprite.ts';
import { isWorld, setActiveWorld, worldTall, VIRAL_SHIFT } from '../kit/worlds.ts';
import { resetFaces } from '../kit/stage.ts';

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
  [versusShot.name]: versusShot,
  [actShot.name]: actShot,
  [statementShot.name]: statementShot,
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
    if (worldTall()) frame.ctx.translate(0, VIRAL_SHIFT);
    // Close-ups: push in on a face or the item (stage units), easing in over the first 0.35 s.
    const camera = props.params?.camera;
    const focus = camera === 'close-left' ? { x: 190, y: 540, k: 1.65 } : camera === 'close-right' ? { x: 530, y: 540, k: 1.65 } : camera === 'close-center' ? { x: 360, y: 600, k: 1.4 } : undefined;
    if (focus) {
      const e = Math.min(1, Math.max(0, frame.t / 0.35)), k = 1 + (focus.k - 1) * (1 - (1 - e) ** 3);
      // Keep the focus point where the action normally sits on screen (stage x 360, y 560).
      const p = (k - 1) / (focus.k - 1);
      frame.ctx.translate(360, 560); frame.ctx.scale(k, k); frame.ctx.translate(-(360 + (focus.x - 360) * p), -(560 + (focus.y - 560) * p));
    }
    resetFaces(frame.index);
    const world = props.params?.world;
    setActiveWorld(isWorld(world) ? world : undefined, frame.t + frame.index * 3.7, worldTall());
    try { shot.render(frame, props); } finally { setActiveWorld(undefined); }
    frame.ctx.restore();
  },
  cues(props, dur) { return SHOTS[props.shot]?.cues?.(props, dur) ?? []; },
};
