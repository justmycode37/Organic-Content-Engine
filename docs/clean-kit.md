# Clean motion kit

The shared kit lives in `chatgpt-site/src/motion/kit/`. Draw the stage at 1080×1290 over flat
`#0B0B0D`. Every graphic in the picture uses `ART = 6` and grid-authored pixel art. Keep positions as
floats and move cached sprites with `drawSprite`; raster geometry stays stable while sprites travel
smoothly. Use the house colors in `PAL` from `pixel.ts`. Characters come from `drawPerson` and
`drawHedgy` in the actor/people modules.

## Pixel drawing (`pixel.ts`, `sprite.ts`, `type.ts`)

- `ART`, `makeSprite`, `spriteFromRows`, and `drawSprite` define the common sprite density. Keep `scale`
  at 1 except during a short pop or squash.
- `Grid(cols, rows, ox?, oy?)` paints art-pixel cells with `fill`, `rect`, `ellipse`, `round`, `poly`,
  `tri`, `line`, `rows_`, `shade`, `outline`, and `sprite`. Shapes are decided at cell centres.
- `PAL` is the house palette; `PAL.UP` / `PAL.DOWN` are reserved for rising / falling price direction.
- `pixelLabel(text, { color, face })` returns a cached heavy 9-art-pixel bitmap wordmark. The authored
  face includes A–Z, 0–9, `$ % + − × = ! ? . , : ' & / ↑ ↓`. `measure(text)` returns art-cell and
  device-pixel bounds. Pixel labels are uppercase and support the required finance vocabulary.

## Motion (`motion.ts`)

- `clamp`, `lerp`, `invLerp`, `remap`: scalar math. `invLerp` and `remap` allow progress outside 0…1;
  `phase` and `tween` clamp animation progress.
- `ease`: linear, cubic/quint in, out, and in-out, back, and exponential variants. Eases take normalized
  progress.
- `spring(t, { stiffness, damping })`: analytic unit step response in seconds. `damping: 1` is critical;
  lower values overshoot smoothly.
- `tween(t, start, dur, from, to, ease)`: eased numeric interpolation.
- `track(t, [{t, value, ease?, hold?}, ...])`: numbers or `{x,y}` / `[x,y]` points. An easing belongs to
  the keyframe it leaves; default is cubic in-out.
- `arc(p0, p1, height, u)`: parabolic point path; positive height arcs upward. `delay`, `follow`,
  `overlap`, `anticipate`, `squash`, `smear`, `bob`, `stagger`, `beat`, and `speedGuard` provide pure
  timing and motion helpers.

## Stage (`stage.ts`)

- `drawStage(ctx, { floorY?, line?, shadow? })` clears the stage, then optionally draws a pixel floor
  line and solid, darker ellipse shadows (`{x,y,w,h?}`).
- `label(ctx, text, x, y, options)` draws cached pixel plates: `sign` (paper), `tag` (hanging string and
  hole), `stamp` (red3 double frame and red text), or `bubble`. `size` is retained for compatibility;
  the heavy face has a 54 px cap height. Use `bg`, `fg`, `rot`, `pop`, `maxWidth`, and `face` as needed.
- `arrow(ctx, from, to, {color,width,progress,curve})` draws a 3-art-pixel stepped shaft and broad
  pixel head. Its eased reveal advances along the path; the head moves at float coordinates.
- `loopArrow(ctx,cx,cy,r,{progress,spin,color,width})` draws a stepped ring and arrowhead. `spin` rotates
  the complete ring sprite smoothly.
- `priceLine(ctx, points, {color,width,progress,head,fill,fillAlpha,baseline})` draws a thick pixel path.
  It infers `PAL.UP` for rising prices and `PAL.DOWN` for falling prices, and returns the current
  `{x,y,progress,direction}` head position for a following prop. Optional area fill uses a flat darker
  palette color.
- `candles(ctx,x,y,w,h,{closes,count,progress,revealAt,revealDuration,t,seed,colorUp,colorDown,axes,dollar})`
  draws a cached candlestick chart on the ART grid and returns the newest visible close `{x,y,index,
  direction,progress}` for a following prop. `closes` is either normalized/actual close targets or the
  `'up'` / `'down'` trend shorthand. A seeded deterministic series supplies plausible OHLC: every candle
  opens at the preceding close, with a directional synthetic open for the first candle and short high/
  low wicks. `revealAt` gives each candle's reveal start time in seconds; pass `t` to grow its body from
  open to close while its wick extends. Growth uses cached discrete sprite states, with candle pixels
  placed on whole ART cells and a slight tick on the returned latest-close position. Candle bodies always
  use market colors: rising close = green (`colorUp`, defaults to `PAL.DOWN`), falling close = red
  (`colorDown`, defaults to `PAL.UP`). Each body is at least four art pixels wide with a one-art-pixel
  ink outline and a visible one-art-pixel wick. `axes` adds minimal pixel axes; `dollar` adds the paper
  `$` plate.
- Price charts are always candlestick charts. `priceLine` remains available for non-chart arrows and paths.
- `bar(ctx,x,y,w,h,{progress,color,background,direction})` grows an outlined pixel bar by art cells.
  `connector(ctx,from,to,{color,width,slack,curve})` draws a pixel catenary tether.
- `assertInside(bounds, margin?)` and `assertGap(a,b,min)` throw on layout errors during scratch checks.

## Effects (`fx.ts`)

- `ring(ctx,x,y,t0,t,{r,width,duration,color})` expands once as a stepped ring.
- `sparks(ctx,x,y,t0,t,{count,seed,duration,color,size})` draws 4–8 deterministic art-pixel squares on
  eased ballistic arcs.
- `poof(ctx,x,y,t0,t,{count,seed,duration,radius,color})` draws 3–5 stepped puffs which rise and shrink.
- `speedLines(ctx,x,y,velocity,t,{t0,count,seed,duration,length,width,color})` draws at most five tapered
  pixel streaks behind the object's float position.
- `pop(progress)` returns a restrained scale-in with a small overshoot. Effects use fixed sprites,
  shrinking cell states, or three calm alpha steps; they do not flash or add frame noise.

## Shot pattern

Resolve narration beats once in both `render` and `cues`, then derive every pose and position from
`frame.t`. Draw in this order: stage, props and characters, impact FX. This 40-line skeleton shows a
ticket hand-off; replace the three beat kinds with the sync words used by the shot.

```ts
import type { Cue, Frame, ShotProps } from '../core.ts';
import { arc, beat, clamp, phase, squash, tween, ease } from '../kit/motion.ts';
import { Grid, PAL } from '../kit/pixel.ts';
import { arrow, drawStage, label } from '../kit/stage.ts';
import { ring, sparks } from '../kit/fx.ts';
import { drawTicket } from '../props/ticket.ts';
import { drawHedgy } from '../actor/hedgy.ts';

export const ticketHandoff = {
  render(frame: Frame, props: ShotProps) {
    const { ctx } = frame;
    const dur = Math.max(0.05, frame.dur);
    const t = clamp(frame.t, 0, dur);
    const borrowAt = beat(props.events, 'borrow', dur * 0.24);
    const sellAt = beat(props.events, 'sell', dur * 0.52);
    const oweAt = beat(props.events, 'owe', dur * 0.78);
    const p = tween(t, borrowAt, Math.max(0.2, sellAt - borrowAt), 0, 1, ease.inOutCubic);
    const ticket = arc({ x: 280, y: 680 }, { x: 760, y: 570 }, 100, p);
    const hit = phase(t, sellAt, sellAt + 0.2);
    const scale = 1 + (1 - squash(t, sellAt, 0.18, 0.22).sx) * 0.4;
    drawStage(ctx, { floorY: 1120, line: true, shadow: [{ x: 540, y: 1106, w: 430 }] });
    drawTicket(ctx, { x: ticket.x, y: ticket.y, t, scale, tag: 'borrowed' });
    label(ctx, 'BORROWED', 280, 500, { variant: 'tag', size: 56, rot: -0.04 });
    drawHedgy(ctx, { x: 360, y: 1120, scale: 5.2, t, pose: 'carry', expression: 'determined' });
    if (hit > 0) ring(ctx, ticket.x, ticket.y, sellAt, t, { r: 110, width: 12 });
    sparks(ctx, ticket.x, ticket.y, sellAt, t, { count: 6, seed: frame.seed });
    arrow(ctx, { x: 440, y: 720 }, ticket, { color: PAL.paper, progress: p, width: 18 });
  },
  cues(props: ShotProps, dur: number): Cue[] {
    const safeDur = Math.max(0.05, dur);
    const borrowAt = beat(props.events, 'borrow', safeDur * 0.24);
    const sellAt = beat(props.events, 'sell', safeDur * 0.52);
    const oweAt = beat(props.events, 'owe', safeDur * 0.78);
    return [
      { t: borrowAt, kind: 'paper', pan: -0.35 },
      { t: sellAt, kind: 'impact', pan: 0.1 },
      { t: oweAt, kind: 'stamp', pan: 0.45 },
    ].filter(cue => cue.t <= safeDur).sort((a, b) => a.t - b.t);
  },
};
```

Characters in shots should come from `drawPerson` / `drawHedgy`; the motion kit supplies their pixel
stage objects, labels, chart marks, tethers, and effects.

## Gallery

```sh
cd chatgpt-site
node scripts/prop-gallery.mjs /tmp/props.png
node scripts/prop-gallery.mjs /tmp/props-states.png ticket --t 0,0.5,1
node scripts/prop-gallery.mjs /tmp/props-and-hedgy.png --hedgy
node scripts/prop-gallery.mjs /tmp/kit.png --kit
node scripts/prop-gallery.mjs /tmp/kit-frames.png --kit --kit-strip
```

The prop gallery bundles each module independently and skips modules without `GALLERY`. Bundle failures
are reported by filename without stopping the other props from rendering. `--kit` renders stage
primitives and effects at several progress values; `--kit-strip` also writes a separate 12-frame strip
for arrow, candles, loop arrow, and FX.
