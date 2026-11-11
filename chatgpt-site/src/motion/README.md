# Motion: code-animated Reels

A canvas animation library for fast vertical explainers (1080 x 1920, 30 fps). An
agent writes a `ReelSpec` (JSON, see `core.ts`); `renderReel(ctx, spec, time)`
draws any frame. Nothing is generated footage: every pixel is drawn by this code.

```
node scripts/motion.mjs shot   <spec.json> <out.png> <time> [time...]   # still or contact sheet
node scripts/motion.mjs render <spec.json> <out.mp4>                    # finished video
```

## The look

**Black, white, grey, and the rainbow.** The accent is not one colour: it is a
moving mosaic of small pixels in diagonal spectrum bands (`theme.accent`, a
canvas pattern from `pix.ts`). It marks the single
thing the viewer must look at in the current beat: the key word, the active node,
the winning bar, the changed line. If two things are accented, neither is.
Never tint whole panels or backgrounds with the accent. All colours come from
`frame.theme`; no hex literals in scenes. `theme.accent` is a PAINT: assign it to
`fillStyle`/`strokeStyle` (rects, paths and text all work), never treat it as a
string. For single-hue details use `theme.spectrum[i % theme.spectrum.length]`.

**Fine pixels.** One art pixel is `CELL` (4 px). Pixel art is detailed: small
pixels, dithered shading (`dither`, `bayer`), stepped edges. Use `pixelate()` to
turn any vector drawing into on-grid pixels, and `three.ts` (`render3d`, `box`,
`cylinder`, `sphere`, `torus`, `voxels`, `place`, `merge`, `project`) plus
`icon3d.ts` for real 3D objects rendered as dithered pixel art. No chunky
8 to 12 px modules except as a deliberate accent.

**Two type systems, never mixed up.**

- Pixel type (`pixelText`, `tag`, `fitPixel`): titles, labels, tags, numerals,
  node names. Always uppercase. Module size `px` sets the cap height (7 * px):
  4 is the small bitmap label face, 5 and up is a heavy display face rasterised
  into fine pixels. Labels 4 to 6, titles 10 to 22.
- Clean sans (`text`, `FONT.body`, weight 800): captions and any sentence a
  viewer reads. Mono (`FONT.mono`) only for code and terminal content.
- Captions are bold white sans on dark (black on light) with the key word in the
  accent. Captions are never pixel type.

**Square and on-grid.** No rounded corners, no drop shadows, no blur, no
gradients. Sizes and positions are multiples of `U` (12). Strokes are 4 px.
Pixel details (stepped corners, block cursors, square progress modules, stepped
arrows, dither) give the identity.

## Motion

Fast and decisive. This is the difference between a slideshow and a Reel.

- Something visibly changes at least every 0.4 s. No frame is static.
- Entrances take 0.15 to 0.35 s, eased with `ease.outExpo` or `ease.outBack`.
  Nothing fades in slowly; things slam, snap, pop, type, wipe or build from blocks.
- Stagger groups by 0.05 to 0.1 s per item.
- The scene is readable within the first 0.3 s and fully built by about 60% of
  its duration; the rest holds with secondary motion (cursor blink, packet
  travel, counters ticking, idle bob), never a dead hold.
- Scenes must work at ANY duration from 1.2 s to 6 s: derive timings from
  `frame.dur` (with sensible absolute caps), never hard-code a total length.
- Emphasis lands as an impact: scale overshoot, accent fill snapping in, a
  one-frame invert. The player adds camera punch and shake at `hits`.

## Rules for scene code

- A scene is `SceneDef<Props>`: `render(frame, props)` draws content only. The
  player owns background, camera, transitions, chrome and captions.
- Pure function of `frame.t`. No `Math.random`, `Date`, or state between frames;
  use `rng(frame.seed)` / `hash`.
- Stay inside `SAFE` (x 96 to 984) and above `CONTENT_BOTTOM` (y 1240); the
  caption block lives below. Keep content above y = 240.
- Never trust input length: fit or wrap every string (`fitPixel`, `wrapText`),
  clamp list lengths, and survive empty arrays without throwing.
- Balance `ctx.save()` / `ctx.restore()`.
- Use `prim.ts` before writing new drawing code. Do not edit `core.ts` or
  `prim.ts` from a scene; ask for an addition instead.

## Sound

Every scene exports `cues(props, dur)`: the moments that should be heard (`pop`
per element, `tick` per small step, `type` runs, a `rise` into a reveal, the
`shimmer` payoff, `impact`, `swish`). Compute them with the same timing maths as
`render` so sound lands exactly on the picture. The audio renderer adds music.
