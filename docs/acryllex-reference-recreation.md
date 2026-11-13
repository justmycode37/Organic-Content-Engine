The reference recreation lives in `chatgpt-site/scripts/acryllex/fixtures/reference-recreation.json`. It uses models and animation controls; the reference movie is used by the comparison tools only. It has not reached the requested 0.99 similarity.

From the repository root, render the complete reel or a dense diagnostic segment:

```sh
node chatgpt-site/scripts/acryllex/render.mjs render \
  chatgpt-site/scripts/acryllex/fixtures/reference-recreation.json \
  artifacts/animation-recreation/recreation.mp4 --fps=60

node chatgpt-site/scripts/acryllex/render.mjs render \
  chatgpt-site/scripts/acryllex/fixtures/reference-recreation.json \
  artifacts/animation-recreation/tunnel.mp4 --fps=60 --range=21.4:23.9
```

Compare the complete recreation against the original screen recording:

```sh
python3 chatgpt-site/scripts/acryllex/compare.py \
  /absolute/path/to/reference.mov \
  artifacts/animation-recreation/recreation.mp4 \
  artifacts/animation-recreation/metrics.json \
  --crop 1164:670:42:684 --fps 30 \
  --spec chatgpt-site/scripts/acryllex/fixtures/reference-recreation.json \
  --sheet artifacts/animation-recreation/comparison.png
```

The comparison needs FFmpeg, NumPy, SciPy and Pillow. Chrome is needed for rendering. Set `CHROME_PATH` to override its location. Local assets are served through Playwright routing; no development server is required.

The fixed metric combines content-masked structural similarity (45%), silhouette intersection over union (35%), and hue similarity (20%). Both images use the same processing. An identical input scores 1.0, a black image against content scores near zero, and unmatched tail frames count against the result. This score is a diagnostic similarity measure, not a validated percentage of human perceptual accuracy. Scores are never rescaled against a compressed reference render. Use equal sampling rates when comparing iterations; use 30–60 fps to inspect fast transitions.

The precision controls added during the recreation are reusable:

- `look.inkMode: "fixed"` uses a single scene ink colour for lit faces, shadow dots, glow and silhouette points. Shading changes coverage without dimming the ink. Synchronized object hue events change the common ink palette while retaining normalized material luminance. `"shaded"` preserves the earlier renderer.
- `look.palette` optionally maps named hues to exact six-digit hex inks. It applies consistently to objects, text highlights and synchronized hue changes; it does not vary ink within a lit or shadowed face.
- `look.textColor` optionally sets the neutral headline/plate ink, including highlight lettering, neutral glitch fragments and tinted-text cursors. Mono and number styles retain their own ink values. It accepts a six-digit hex colour and leaves existing typography unchanged when omitted.
- Calculator `topRimTone` sets the upper horizontal rim albedo independently of the other edges. `displayTopInset` lowers the LCD's top edge while retaining its bottom edge and digit bars, exposing the recessed dark lip. Both controls preserve the previous model when omitted.
- Calculator `keyLabels` is an optional row-major array of key symbols; blank entries leave caps unmarked. `legendScale` controls symbol size relative to key width. The symbols expose the dark deck through the cap mask, keeping the scene's fixed ink colour. Generated masks belong to their materials and are disposed with them; labels add no meshes or draw calls.
- Object `enterSpace: "local"` makes wipe-up/left/right follow the object's authored axes, including rotation, translation, scaling and origin recentering. The default remains world space.
- Text `reveal: [[at, count], ...]` holds explicit visible-character counts, including spaces. It can reveal a boxed prefix at once and type its suffix at irregular times, or delete in exact steps. Keys use scene-local times or narration words and stay inside the item's `at`/`until` window; omitted tracks retain automatic typing.
- Text `keyframes` independently animates `pos` (frame fractions, including offscreen positions) and `zoom`. Destination keys accept `hold`, `linear` or `smooth` easing. Explicit zoom keys replace the older zoom track; `glitchCell` keeps breakup pitch fixed in output pixels while letters change size.
- Text `glitchBox` includes the tag/highlight padding and offset in the breakup envelope. `cursorWidth` sets caret width relative to font size. Defaults preserve the previous rendering.
- Text `carry: true` continues a cue across scene cuts until its explicit numeric `until`, retaining its previous scene's palette and local clock. Other text stays scoped to the active scene.
- Office-desk `topThickness` and `apronHeight` control the slab and underside thickness while preserving the top anchor and joining the column to the new apron. Omitted controls retain the previous geometry.
- `look.noiseReference` optionally keeps the expected threshold distribution of an earlier noise setting while `look.noise` changes the ordering of the Bayer ranks. Reference values must be between 0 and 1/65; the default leaves the existing threshold mix unchanged. Scene `light.noise` and `light.noiseReference` scope this control to one scene and reset on cuts or reverse seeks. This preserves the statistical tone curve, not the exact coverage of finite image patches: lighting and local density still need comparison against the source.
- `look.blackPoint` and `look.whitePoint` map lit intensity before calculating dot density. Fixed ink keeps the emitted colour constant; the older shaded mode also maps ink brightness. Scene `light` fields can override those points, `inkLo` (minimum dot brightness) and `gamma` (density response). This allows deep recesses alongside bright highlights, with separate tuning for sparse white concrete dots and blue water dots. Defaults preserve the previous mapping.
- `look.aoMethod: "plane"` (the default) reconstructs the receiving plane from inverse depth to avoid false self-shadowing on tilted faces while retaining contact shadows. `"legacy"` reproduces the prior kernel for already fitted scenes. Scene `aoMethod` can override the choice independently. The plane kernel uses four additional depth samples.
- Scene `light.points` adds nearby lights in world coordinates, with inverse-square falloff by default. An `active: [from, until]` interval and `fade` can restrict a light to a product within a morph sequence. `light.keyframes` independently animates dot exposure, contrast, gamma, ink brightness and black/white points; density can change while illumination remains fixed. Sparse channels interpolate from their scene value at time zero; add an explicit key at the start of a change to hold earlier products steady.
- Object `castShadow` and `receiveShadow` switches control shadow-map participation independently from authored surface shading and ambient occlusion. Explicit values remain effective after model updates. This helps close planar diagrams avoid patchy self-shadow artifacts.
- Abacus models support both soroban and suanpan bead banks, configurable frame/bead dimensions and decimal digit arrays. Laptop lid/keyboard proportions, hinge angle and bezels, and calculator LCD/key proportions, case/deck/bezel albedos, key height and roughness are configurable.

- `format.cell` accepts fractional pixels and preserves the requested dimensions. `look.dotRoundness` and `look.dotSoftness` soften sparse dots while allowing bright areas to merge.
- `objects[].keyframes` supplies absolute `pos`, unwrapped degree `rot`, and `scale` values at scene-local seconds. Each destination key can use `linear`, `smooth`, or `hold` interpolation. Sparse channels interpolate independently; reverse seeking gives the same result.
- `stretch` changes local axis dimensions independently, without replacing a model's animation scale.
- Explicit `origin: "center"` positions recentered geometry at the supplied coordinates; `origin: "model"` preserves authored coordinates. Unspecified origins retain legacy placement behavior. Explicit morph destination positions are respected.
- `enterDur` and `exitDur` control reveals precisely. `wipe-left` and `wipe-right` reveal along world X by default; `wipe-up` retains its vertical reveal, with `enterSpace` selecting local axes. Show events can choose linear or smooth wipe easing. Events accept `easing`; `show` and `hide` respect event duration. Overlapping control and movement events start from their sampled values.
- `text.font` selects IBM Plex Mono, Roboto Mono, Roboto Condensed or Oswald, with Barlow Condensed retained as the default headline family. Variable fonts accept exact `weight` values; `widthScale` adjusts horizontal proportions without moving the text anchor. `boxPadding` controls highlight padding in font-size units; `boxOffset` moves the background independently of the glyphs, and `softness` controls optional raster softness. `zoomAnchor: "center"` uses actual glyph metrics to keep enlarging type centered; zoom does not force the line to wrap. Black plates fit the glyph bounds.
- `prefixUntil` removes a boxed word prefix at a specified time while retaining the suffix position.
- `cursorLead`, `cursorHold`, `cursorPeriod` and `cursorPhase` control typing cursors explicitly. `eraseDur` sets deletion timing. Mono text no longer receives an automatic pre-deletion glitch. Held text with `erase: false` also avoids an implicit deletion glitch. A numeric `until` may extend past the scene duration to time a suffix deletion through the cut; the text itself remains scoped to the active scene.
- `skyline.params.buildings` accepts explicit building placement and dimensions, depth, yaw, window grid, tiers, and fill timing. `maze.params.layout` accepts a square array of odd-length strings (`#` wall, other characters passage), with independent wall height and loose block count.
- Each skyline building can set `buildDelay`, `buildSpeed` and `buildPower`; `buildReveal: "height"` exposes floors at their authored pitch as construction rises. The default keeps sequential scaled growth. Maze `wallHeightMeters` holds absolute extrusion when layout resolution changes; connected chunks can contain up to64 wall cells.
- Human `walkPhase` and `walkDistance` set gait timing in cycles and metres. `headScale` adjusts head proportions. Per-person `poseAdjustments` override selected named-pose joint angles and root height without mutating shared poses. Desk column dimensions, chair back corners/tilt, and monitor stand height are configurable.
- Maze `chunkSize` keeps connected wall sections intact during scattering; `scatterRotation` controls their rotation. Grouping preserves the assembled geometry.
- Concrete stairs expose `patchHeight` and `patchFalloffY` for a light pool that fades down each riser. A zero height retains the original full-height pool; these controls change surface density without changing geometry.
- Stairs `frontTreads`/`frontTreadTone` shade selected foreground treads, while `patchTreads` and `stripeTreads` extend the same light pool or diagonal shaft onto horizontal surfaces. Their zero defaults retain the earlier surface field.
- Calculator dimensions and key rows/columns are configurable. Tunnel direction, phase, cross-section exponent, visible depth, and ceiling lights are independently controlled. The tunnel wall is continuous and extends behind the camera; decorative segment motion cannot open gaps or change whole wall sections' brightness. The reusable `depthFade` material helper applies smooth camera-depth fading to lit and emissive surfaces. Tunnel `acceleration`, `timeOrigin`, or an explicit `travel` control author its motion; wall proportions, side lights and local lamp power are also configurable.

Round boxes preserve their stated external dimensions, including thin lids. Model opacity is multiplied by scene reveals instead of being overwritten. Morph particles are seeded and weighted by actual triangle surface area. Settled maze rotations reset when scatter returns to zero. Skyline reflections track the source building opacity and visibility, and retain their dimmed material tone during hue changes. Failed model pack builds now fail the render instead of silently omitting the pack.

Verification:

```sh
cd chatgpt-site
npm run check
node scripts/acryllex/verify-render.mjs
node scripts/acryllex/verify-ao.mjs
node scripts/acryllex/verify-dither.mjs
node scripts/acryllex/verify-calculator-legends.mjs
node scripts/acryllex/verify-timeline.mjs
```

The GPU checks cover morph reproducibility, reverse seeking, fresh render order, exact dimensions, maze settling, model opacity transitions, continuous tunnel walls, depth reveal, centred text zoom, typing cursors, prefix removal, gait phase and isolated custom poses. Geometry checks verify assembled maze chunks and reflection state. The matcher optionally isolates neutral lettering with `channel: "neutral"`, supports linked parameter `paths`, and decodes reference frames through the same fixed-rate filter as the dense comparison (`referenceFps: 60` by default). Source and recreation samples share exact frame times; final video evaluation still uses the unchanged full-colour metric. The local iteration videos, measured results and comparison sheets are in the ignored `artifacts/animation-recreation/` directory. The reference movie remains external to the repository.

The added fonts come from the Google Fonts directories for [Barlow Condensed](https://github.com/google/fonts/tree/main/ofl/barlowcondensed), [Roboto Mono](https://github.com/google/fonts/tree/main/ofl/robotomono), [Roboto Condensed](https://github.com/google/fonts/tree/main/ofl/robotocondensed) and [Oswald](https://github.com/google/fonts/tree/main/ofl/oswald). Their SIL Open Font License files are bundled beside the font files.
