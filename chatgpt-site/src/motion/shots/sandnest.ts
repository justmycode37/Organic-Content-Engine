import type { ShotDef } from './index.ts';
import { beats, cue, cuesIn, flag, num, pick } from './common.ts';
import { drawStage } from '../kit/stage.ts';
import { ART } from '../kit/sprite.ts';
import { PAL } from '../kit/pixel.ts';
import { clamp, ease, lerp } from '../kit/motion.ts';
import { drawPufferfish, drawSandNest, nestBuilderPosition } from '../props/seabed.ts';

const cx = 360, cy = 563;
export const sandnestShot: ShotDef = {
  name: 'sandnest', stage: 'clean', defaultWorld: () => 'seabed',
  describe: 'A small spotted pufferfish sculls over sand. Its swimming passes leave radial furrows with raised pale lips. Trace cuts the first two paths, build completes a partially carved sand nest in time lapse, reveal has the builder swim aside to show the finished pattern. params: mode (trace|build|reveal, default build), ridges (8–20, default 12), visitor (boolean, default false; in reveal a second pufferfish approaches the nest). Event 1 begins the pass or reveal, event 2 starts the visitor approach. Use world seabed.',
  render({ ctx, t, dur }, props) {
    const mode = pick(props.params, 'mode', ['trace', 'build', 'reveal'], 'build');
    const ridges = Math.round(num(props.params, 'ridges', 12, 8, 20));
    const [start, second] = beats(props, dur, [.12, .54]);
    const progress = clamp((t - start!) / Math.max(.12, (dur - start!) * .9));
    const passes = Math.min(Math.floor(ridges / 2), Math.max(2, Math.round((dur - start!) * 1.15)));
    const begin = mode === 'trace' ? 0 : ridges - passes;
    const work = mode === 'reveal' ? ridges : lerp(begin, mode === 'trace' ? 2 : ridges, progress);
    drawStage(ctx);
    ctx.save();
    ctx.translate(cx, cy);
    const framing = mode === 'reveal' ? lerp(.99, .88, ease.outCubic(progress)) : .86;
    ctx.scale(framing, framing);
    ctx.translate(-cx, -cy);
    drawSandNest(ctx, { x: cx, y: cy, ridges, work });

    const pos = nestBuilderPosition(work, ridges);
    const before = nestBuilderPosition(Math.max(begin, work - .025), ridges);
    const after = nestBuilderPosition(Math.min(ridges, work + .025), ridges);
    let x = cx + pos.x * ART, y = cy + pos.y * ART;
    let dx = after.x - before.x, dy = after.y - before.y, turnWidth = 1;
    if (mode === 'reveal') {
      // A swim to the edge uncovers the finished centre.
      const travel = ease.inOutCubic(progress);
      x = lerp(cx - 110, cx + 170, travel);
      y = cy - 70 - 120 * Math.sin(travel * Math.PI / 2);
      const turn = clamp((progress - .72) / .18);
      dx = turn < .5 ? 1 : -1; dy = -.22 * (1 - progress);
      turnWidth = 1 - .34 * Math.sin(turn * Math.PI);
    }
    const scale = mode === 'trace' ? .58 : .46;
    const flip = dx < 0, pitch = clamp(Math.atan2(dy, Math.abs(dx) || 1), -.53, .53) * (flip ? -1 : 1);
    // Sand kicked up under the belly follows the same cutting point.
    if (mode !== 'reveal' && progress > 0 && progress < 1 && work % 1 < .78) {
      ctx.save();
      ctx.fillStyle = PAL.paperShade;
      for (let grain = 0; grain < 8; grain++) {
        const p = (t * 2.6 + grain * .371) % 1;
        ctx.globalAlpha = (1 - p) * .85;
        ctx.fillRect(x + (flip ? 1 : -1) * (12 + 36 * p), y - 3 - p * (13 + grain % 4 * 6), 5, 4);
      }
      ctx.restore();
    }
    drawPufferfish(ctx, { x, y: y - 24 + 4 * Math.sin(t * 5), t, scale, flip, sx: turnWidth, rot: pitch });
    if (mode === 'reveal' && flag(props.params, 'visitor') && t >= Math.max(start!, second!)) {
      const arrival = Math.max(start!, second!);
      const approach = ease.inOutCubic((t - arrival) / Math.max(.10, (dur - arrival) * .84));
      drawPufferfish(ctx, { x: lerp(-95, cx - 96, approach), y: lerp(cy - 180, cy - 122, approach) + 4 * Math.sin(t * 4),
        t: t + .32, scale: .51, rot: .14 * (1 - approach) });
    }
    ctx.restore();
  },
  cues(props, dur) {
    const [start, second] = beats(props, dur, [.12, .54]);
    const mode = pick(props.params, 'mode', ['trace', 'build', 'reveal'], 'build');
    const sounds = [cue(start!, mode === 'reveal' ? 'swish' : 'rustle', .4)];
    if (mode === 'reveal' && flag(props.params, 'visitor')) sounds.push(cue(Math.max(start!, second!), 'swish', .36, 100));
    return cuesIn(dur, sounds);
  },
};
