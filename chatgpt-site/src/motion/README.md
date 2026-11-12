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

## Viz & type

`viz/finance.ts` exports composable canvas helpers. Each takes a `Frame`, a
`{x, y, w, h}` region, and local time/data; each is deterministic and draws only
inside that region. `drawPriceLine` returns `{head, progress, direction}` so a
shot can follow the moving price. `drawCandlesticks` builds candles and volume;
`drawExtrudedChart` and `drawPieCoins` use the software 3D renderer and accept
camera yaw/orbit options; `drawExtrudedChart` accepts either numeric bars or
candlestick records (`kind: 'bars' | 'candles'`). Other helpers are `drawOrderBook`, `drawTickerTape`,
`drawOdometer`, `drawChangeBadge`, `drawDivergence`, and `drawMarketHeatmap`.
Use red and green only for price direction or gains/losses; keep other data in
black, white, and grey.

`viz/type.ts` exports `drawHeroType(frame, text, rect, time, options)` (also
`drawHeroWord`). Choose `effect: 'slam' | 'assemble' | 'split' | 'shatter' |
'stretch' | 'typewriter' | 'scramble' | 'mask' | 'crack'`. It uses the pixel
display face and per-letter deterministic timing. Keep the hero to one or two
words.

`drawCaption(frame, caption, time, region?)` remains the player-facing caption
entry point. Captions use clean sans type in the 1320–1650 band, fit up to two
lines, and reveal/emphasize words in sequence. Optional `wordTimings` accepts
absolute reel-time `{text?, start, end}` entries; ordinary `{text, start, end}`
caption objects use a deterministic timing distribution. Markup with `*word*`
adds a dark slab; the word is red/green only when its meaning signals loss/gain,
and otherwise receives a white highlight.

`shots/demo-viz.ts` is the visual test bench. Set `params.demo` to `line`,
`follow`, `candles`, `extruded`, `extruded-candles`, `orderbook`, `ticker`, `odometer`, `badge`,
`divergence`, `heatmap`, `pie`, or a `type-<effect>` value.

## 3D engine v3

`three.ts` rasterises clipped perspective triangles into a depth-buffered pixel
grid. Each object can choose a 5–8-step noir ramp (`mono`, `bone`, `steel`, `ink`,
`chrome`, `glass`, `brown`, `red`, `green`, or `paper`) or supply its own
dark-to-light hex ramp. `tone` controls albedo, `emissive` lifts dark surfaces,
and `spec` adds tight view-dependent glints. Spheres, cylinders and tori carry
smooth vertex normals; use `smooth: false` on an object to make it flat.

```ts
render3d(ctx, theme, {
  x: 0, y: 0, w: 880, h: 900, zoom: 240, cell: 3,
  position: [0, 1, -7], target: [0, 0, 0], fov: 42, roll: 0,
  light: [-0.5, 0.72, -0.48], ambient: 0.24, rim: 0.28,
  ground: { y: -1.5, shadow: 0.58, grid: false },
  fog: { near: 8, far: 18 }, outline: true,
}, [{
  mesh: sphere(1, 32, 20),
  materials: [{ ramp: 'chrome', tone: 0.92, spec: 0.8 }],
  reveal: 1, explode: 0, slice: 1,
}]);
```

Views accept either the legacy `yaw`/`pitch`/`distance` orbit camera or a full
`position`/`target` camera (`lookAt` aliases `target`). `fov` is vertical
degrees. The optional ground plane ray-casts soft dithered shadows; `fog` fades
by camera depth. `outlineColor` sets the silhouette colour, while `ink: true`
forces a dark ink outline. `explode` separates and spins mesh faces; `slice`
clips a bottom-up build. `reveal` remains the deterministic scattered build.

`voxels(rows, depth, size, palette?)` preserves the legacy digit/letter to
material-index mapping and accepts a `Record<string, number>` or `Map` for
explicit character-to-material indices. `instances(mesh, transforms, options?)`
shares one mesh across many positions; pass `{ lod, lodBelow }` to swap to a
small mesh below a projected-radius threshold. Existing builders, `place`,
`merge`, `project`, and `render3d` retain their original call signatures.

## Transitions v3

The player overlaps the outgoing and incoming pure-time scene renders on cached
offscreen canvases. `placeScenes()` still fixes every cut and total reel duration;
each overlap is symmetric around its cut, and scene-local `t` continues beyond
`duration` or below zero during that window. Image smoothing is disabled and
motion offsets are stepped to the 4 px grid. `shot` scenes render full bleed in
`x = 0…1080`, `y = 0…1290`; the legacy `hedgy` layout keeps its existing inset.

All transition names are in `TRANSITIONS`; previous names (`cut`, `blocks`,
`wipe`, `glitch`, `zoom`, `flash`, `shutter`) remain valid. The new names and
default overlap durations are:

| Name | Seconds | Motion |
| --- | ---: | --- |
| `push` | 0.42 | Directional two-scene slide with stepped echoes |
| `whip` | 0.30 | Fast pan with stepped motion echoes |
| `zoomthrough` | 0.52 | Fly into the outgoing focus; incoming shot grows from it |
| `shatter` | 0.50 | 24 px voxel shards break away to reveal the next scene |
| `pixelsort` | 0.46 | Staggered pixel columns sort and scatter |
| `melt` | 0.48 | Pixel columns drip down to reveal the incoming scene |
| `iris` | 0.42 | On-grid circular reveal around a focus point |
| `cube` | 0.52 | Pixel-stepped cube-face rotation |
| `flip` | 0.42 | Pixel-stepped card flip |
| `dissolve` | 0.44 | Ordered 4×4 Bayer dissolve |
| `slice` | 0.38 | Alternating horizontal slabs slide across |
| `ink` | 0.52 | Irregular dithered ink spread from the focus point |
| `match` | 0.30 | Hard cut, one-frame white flash, and incoming punch-in |

Set optional `transitionAt: [x, y]` in reel pixels to move a transition's focus,
and `transitionDir: 'left' | 'right' | 'up' | 'down'` to choose directional
travel. `transitionCues(name, direction?)` returns `Cue[]` with `t` measured in
seconds relative to the cut, including `pan`, `gain`, and optional `len`. The
design pairs are push (whoosh + thud), whip (whip + swish), zoomthrough (rise +
bass), shatter (crack + shatter + glass), pixelsort (reverse + tick), melt
(reverse + drop), iris (rise + click), cube (servo + impact), flip (tape +
click), dissolve (reverse + shimmer), slice (swish + clack), ink (rise + paper),
and match (zap + impact). Legacy transitions also return their matching cues.

`createCameraRig(options)` in `fx/rig.ts` returns
`{ poseAt(t), apply(ctx, t), view3D(t) }`. Keyframes use
`{ t, x, y, zoom, rot, ease?: 'linear' | 'in' | 'out' | 'inOut' }`;
options also accept `handheld`, `hits`, `punch`, `shake`, `whip`, and
`dollyZoom: { start, end, amount? }`. `view3D(t)` returns yaw, pitch, distance,
and a world-space target for synchronizing a software 3D shot with the 2D rig.
`handheldCamera(t, amount?, seed?)` provides a small standalone drift path.

## Assets

`assets/index.ts` exports `ASSETS`, a registry of pure model factories. Each
factory returns `{ name, describe, mesh, materials, parts }`; named `parts` keep
mechanical pieces available for independent animation. Generator options include
bounded `detail`, `count`, and deterministic `seed` values, plus chart `values`
and candle/arrow `direction`. The shared palette uses noir ramps by default;
red and green mark price direction or gains and losses. Use the `demo-assets`
shot with `params.page` to inspect the model library in nine-object contact
sheets.

## FX & environments

`fx/particles.ts` exposes pure-time particle helpers: `burstParticles(t, opts)` /
`drawBurst(ctx, t, opts)` for coin, shard, spark, confetti, dust, and quill bursts;
`emitterParticles(t, opts)` / `drawEmitter(ctx, t, opts)` for smoke, sparkles, rain,
banknotes, snow, and embers; plus `drawTrail`, `drawShockwave`, `drawSpeedLines`,
`drawImpactStar`, and `drawMotionStreak`. Pass a fixed `seed`; `[x, y, z]` centers
and `projector(point)` enable world-space rendering. Burst options include gravity,
drag, floor bounce, spin, life, and pixel size. Banknotes use a deterministic
three-frame flip.

`env/index.ts` exports `drawEnv(ctx, {type, t, camera, theme, seed, width, height})`
for `sky`, `floor`, `city`, `space`, `exchange`, `stage`, `clouds`, `ocean`, `vault`,
`paper`, and `void`. Each backdrop also has a named `draw<Name>Env` export. The
camera accepts pixel `x`/`y`, `zoom`, `rot`, `yaw`, and `pitch`; layers respond at
different parallax rates. Sky luminance uses ordered dither, and geometry stays
on the 4 px grid.

`fx/post.ts` exports `applyPixelBloom`, `applyVignette`, `applyScanlines`,
`applyChromaticGlitch` (gated by `active`), `applyScreenFlash`,
`applyImpactFrame`, `applyFilmGrain`, and `applyLetterbox`. Image operations sample
and write a low-resolution `CELL` buffer, with nearest-neighbor blits and no blur.
Use the `demo-fx` shot with `params.demo` set to an individual effect or environment
name to preview the FX library.

## Hedgy actor

`drawHedgy(ctx, options)` draws Hedgy as a 2D, hand-mapped pixel sprite in layered
natural browns and warm cream. `x` is the feet-center, `y` is the feet baseline,
`scale` is screen pixels per art pixel, and `t` is seconds into the action. Use
`facing: -1` to mirror him, and combine `pose` with `look`, `expression`, and
`prop` as needed. `hedgyBounds(options)` returns the animated layout rectangle.

Poses are `idle`, `walk`, `run`, `jump`, `shock`, `celebrate`, `point`, `think`,
`push`, `carry`, `fall`, `curl`, `roll`, `peek`, `sweat`, `sleep`, and `wave-off`.
`HEDGY_TIMING` exposes key landmarks (for example, `jump.land` is 1.03 s and
`jump.settle` is 1.42 s); walk and run loop every 0.82 s and 0.44 s. Use
`hedgyCues(pose, duration)` for deterministic `Cue` suggestions timed to each
action. The large actor preview is the `demo-hedgy` shot (`params.pose` selects
the action).
