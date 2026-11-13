# ACRYLLEX — pixel-style explainer reels (asset and model library contract)

Separate account from Hedgy. Reels explain things people are curious about (why we dream, why the blue LED
was so hard). Real subjects come from licensed photos, moving footage, scans or editable 3D and pass through
the shared pixel renderer on pure black (see `chatgpt-site/src/acryllex/engine.ts`, post shader). Use
`look.inkMode:"fixed"`: occupied dots have the same ink RGB in light and shadow; **contrast is a density
difference**. Preserve sparse details, dense highlights and dark openings without dimming individual dots.
Silhouette, local shading and real motion make the subject recognisable. Every subject must read instantly
to a stranger with the sound off.

## Choose the asset for the shot

Complex natural subjects default to licensed photo/video-backed library assets. A curling wave, breaking
foam, spray, smoke, an animal or a filmed human action usually needs moving footage. A photo is appropriate
for a static subject/view; moving or deforming a still does not reproduce fluid motion. Prefer an accurate
source over a crude assembly of primitive shapes.

Use a clothed scanned, rigged human when poses, articulation or interactions must be edited. Real 3D remains
useful for editable mechanical shapes, object interactions and shots that need a new camera viewpoint.
Choose a scan or a well-modelled subject with supported controls; do not force every subject into primitives.
Fixed-view footage is a flat layer and cannot provide unseen sides or a new 3D camera angle.

Remove the sky and background so they are black or transparent. An already isolated source, existing alpha,
or an explicitly prepared mask is required: the media renderer does not automatically segment backgrounds.
Check the whole moving clip for edge fringes and unwanted background dots, especially around foam and hair.

## Photos and moving footage

The generic `footage` model (aliases `video`, `clip`) accepts a licensed library preset in `params.asset`,
a local image/video path in `params.file`, or an HTTPS source in `params.url`. Choose a preset or custom
file/URL; combining them is an error. Use verified library paths/URLs; missing or invalid media fails clearly.
A still image prepares as one frame and stays static. Preparation is handled by
`scripts/acryllex/media-assets.mjs`; client playback is in `src/acryllex/assets.ts`.

`model:"wave-footage"` (alias `ocean-wave-media`) defaults to `params.asset:"ocean-breaker"`, the
AI-generated outside-view wave. `params.asset:"ocean-barrel"` selects an inside-view alternative of unverified
capture origin. Sources download on demand into the private render cache; the library supplies aligned mattes,
monochrome preparation and provenance in `src/acryllex/media-library.ts`. Retain the source/view/clip-duration
limitations in those records. Neither is filmed evidence or an exact reference reconstruction. Custom subjects
use `file`/`url`.

For the usual single-ink look set `monochrome:true`, `preserveAspect:true` and `look.inkMode:"fixed"`.
Preparation converts RGB to BT709 luminance once; luminance drives dot density in the scene ink. RGB is
preserved by default for backward compatibility, so explicitly select monochrome for normal ACRYLLEX media.
Keep the same ink through highlights and shadows; do not paint different grey/colour dots to simulate shade.
Do not blur the finished dot image to compensate for source detail. The approved outside-wave grade uses
scene light `{contrast:1.5,gamma:1.05,blackPoint:0.02,whitePoint:0.95,exposure:1.05,softness:0}`.
This is source-specific grading; keep the shared output dot pitch and ink unchanged.

| Input | Meaning |
| --- | --- |
| `asset` | Licensed library preset: `ocean-breaker` or `ocean-barrel`; choose this instead of `file`/`url`. |
| `file` / `url` | Verified local path or HTTPS image/video source; `file` takes precedence. |
| `sourceStart`, `sourceDuration` | Source trim in seconds before preparation; a still starts at zero. |
| `crop` | Source crop `W:H:X:Y`, before scaling. |
| `cols`, `rows` | Prepared **frame** width/height in pixels, not the atlas tile counts. With `preserveAspect:true`, supply one dimension to derive the other from source/crop aspect. If both are set, keep their ratio correct. |
| `sampleScale` | Source samples per output dot, 1–4; generic default1, media presets3. Retains fine source luminance before the shared dot pass without changing output dot size. Explicit `cols`/`rows` override prepared dimensions. |
| `fps` | Prepared playback frame rate, default 30; finite 0.1–120. |
| `blur` | Source preparation blur in pixels, default 1.2; use only source-justified softness and retain fine detail. |
| `monochrome` | `true` prepares one luminance image for the scene ink; default preserves RGB. |
| `alphaFile`, `invertAlpha` | Optional aligned image/video mask. White keeps the subject, black removes background; invert if necessary. The source trim/crop/scale also apply to the mask. This is a supplied mask, not automatic segmentation. |
| `mirrorX`, `mirrorY` | Optional preparation flips; image and mask flip together. |
| `height` | Flat layer height in metres, default 2; width follows prepared manifest `w/h`, independent of output aspect. |
| `start`, `timeOrigin`, `loop` | Seconds into the prepared clip, scene-local playback origin (default 0), and optional loop. Separate these from source trimming. |
| `controls.speed` | Playback rate, default 1; zero holds, negative reverses. |

Sampling uses `start + (sceneLocalTime - timeOrigin) * speed`. Nonlooping clips clamp to first/last frame;
loops wrap in either direction. Instances share decoded images but have independent playback transforms.
Different crop/trim/mono/mask variants of the same file have separate preparation keys. Preparation records
source hashes and enforces frame/resource limits; trim long sources to the needed shot.

Use explicit `origin:"model"`, `pos:[0,0,0]`, `idle:"none"` and a front-facing fixed camera. For height `H`
and vertical field of view `fov`, place the camera at `[0,0,H/(2*tan(fov/2))]`, looking at `[0,0,0]` (convert
degrees to radians for the calculation). Match source/crop and output aspect when the layer should fill
the whole frame. For example, with a licensed source and aligned mask already prepared for the shot:

```json
{"version":1,"series":"ACRYLLEX","title":"Wave","captions":false,
 "format":{"width":1164,"height":670,"cell":3.72},"look":{"inkMode":"fixed"},
 "scenes":[{"say":"The wave curls and breaks.","duration":3,"hue":"azure","ground":false,
  "camera":{"move":"static","pos":[0,0,2.747477419],"look":[0,0,0],"fov":40},
  "objects":[{"id":"wave","model":"footage","origin":"model","pos":[0,0,0],
   "enter":"none","idle":"none","params":{"file":"/absolute/path/to/licensed-wave.mov",
    "alphaFile":"/absolute/path/to/aligned-wave-mask.mov","sourceStart":0,"sourceDuration":3,
    "monochrome":true,"preserveAspect":true,"cols":582,"height":2,"timeOrigin":0}}]}]}
```

The paths above are illustrative, not bundled assets. Choose a clip whose real action lands on the spoken
word; synchronize its trim/start/origin instead of adding arbitrary scene events to continuous motion.
Run `node scripts/acryllex/verify-media-prepare.mjs` for portable preparation checks and
`node scripts/acryllex/verify-media29.mjs` for synthetic GPU playback, instance isolation and disposal.

## Reusable source and license records

Keep an asset record beside each reusable library item: subject/action description, source page, direct
download URL or original local path, creator, exact license/version, attribution requirements, and any
required releases for its intended use. Record whether capture is filmed, rendered, generated or unverified;
do not describe an unverified clip as filmed evidence. Retain acquisition date, original source hash, and the crop, trim,
mask and preparation recipe. Record a mask's source/license too, or the authored recipe/model and its version.
Preserve the original source and the ability to regenerate derived assets. Download access alone does not
establish reuse permission; verify the license before adding an asset and never invent a license claim.

Keep these records in the asset catalogue and production provenance; do not add unsupported fields to the
strict reel spec. Reuse approved assets across shots and reels. A source clip provides subject motion, while
text, timing, composition and the pixel renderer remain editable parts of the reel.

## Files
- `src/acryllex/kit.ts` — maths + geometry helpers `G` (box, rbox, sphere, ellipsoid, cyl, cone, capsule, torus,
  lathe(profile [r,y]), extrude(outline [x,y], depth), tube(points, r), limb, merge), `at(geo,pos,rotDeg,scale)`,
  `roughen`, `rng`, `ease`.
- `src/acryllex/models/types.ts` — `defineModel({id, aliases, describe, params, controls, defaults, poses, size, build(ctx)})`.
  `build` returns `{root, grounded?, update?(controls,t,pose), anchors?, seatFacing?}`.
  `ctx.mesh(geo,{tone 0.1..1, color?, glow?, glowControl?, rough?, side?})` makes a mesh in the scene hue;
  `tone` = brightness of that part (use contrast between parts!), `color` only for things whose real colour
  matters to the story (LED colours, red blood, green leaf…; hex or hue name). `glow` makes it self-lit with a
  dot halo, scaled by control `glow` (or `glowControl`). `ctx.num/str/bool` read params safely.
- `src/acryllex/models/*.ts` — packs. Each exports ModelDefs; already registered in `models/index.ts`.
- `src/acryllex/models/person.ts` — active skinned human and motion retargeting; `human.ts` supplies named poses.
- `src/acryllex/models/realistic-humans.ts` — opt-in anatomical male/female meshes, using `realistic-person.ts` and `human-motion.ts`; reference pose fitting remains in progress.
- `src/acryllex/models/fluid-surface.ts` — reusable continuous surfaces, editable grids/splines, sampled flow and surface-bound foam.
- `src/acryllex/assets.ts`, `src/acryllex/media-key.ts`, `src/acryllex/media-library.ts`, `scripts/acryllex/media-assets.mjs` — shared photo/video library, preparation identity and deterministic fixed-view playback.
- `scripts/acryllex/render.mjs shot <spec.json> <out.png> <t...>` — stills/contact sheet (GPU Chrome).

## Rules for a model
1. Real-world proportions in metres, y up, front faces +z, origin at bottom centre (grounded) or centre
   (`grounded:false` for floating things like planets, cells, molecules). Tiny things (cells, atoms) use a
   display size ~0.2–1.5 m.
2. Preserve natural proportions and defining silhouettes from front, side and 3/4 views. Check anatomy,
   articulation and contact against reference frames; avoid compensating for placement errors by stretching a body.
3. Allocate geometry where silhouette, curvature and articulation need it; use detailed meshes and surface
   relief when necessary. With `look.inkMode:"fixed"`, one ink RGB carries light and shadow through local dot
   density. Measure dense highlights, sparse shadows and dark openings separately; preserve their contrast.
4. Animation through `controls` (0..1 sliders, documented, with `defaults`) and idle motion in `update` using
   `t` (wings flap, tail wags, wheels spin, heart beats). Pure function of controls and t; no Math.random/Date
   (use `rng(ctx.seed)`), no allocation-heavy work per frame (mutate existing objects).
5. `describe` = one line of what the viewer SEES + what controls do. `aliases` = the words a writer would use.
6. Tolerate ordinary procedural params within documented limits. Missing/invalid external assets must fail
   clearly, rather than exporting a silent primitive placeholder.

## Effect selection

Give `scan` and `glitch` a slight preference when several object effects suit the spoken action equally well.
Keep the other effects in rotation and pick a more specific effect when it tells the story better. This is a
soft preference, with no required count per reel. The shared guidance lives in `ACRYLLEX_POLICY.effectSelection`
and is used by storyboard generation and both storyboard and visual review.

## Test spec
```json
{"version":1,"series":"ACRYLLEX","title":"t","captions":false,"scenes":[{"say":"x","duration":3,"hue":"blue",
 "camera":{"angle":"three-quarter"},"objects":[{"id":"a","model":"<id>","enter":"none"}]}]}
```
Camera angles: front, three-quarter, three-quarter-left, side, top, high, low. Render several angles/hues
(blue, red, white) and LOOK at the PNGs; iterate until a stranger would name the object instantly.

## Reusable fluids

Licensed moving footage is the default for a natural breaking wave or similarly complex fluid motion.
Use these editable surface/cache tools when custom geometry, interaction or a new viewpoint is required;
their availability does not make a procedural approximation the preferred source for every fluid shot.

The public `fluid-sheet` model supports ocean, ripple, cascade and fan forms, or an authored `controlGrid` /
swept `path` with a custom `section`. `fluid-jet` supports a spline path or ballistic launch and a jet/splash
section. Both use the same surface and foam core as the reference wave. Keep shot-specific shape,
motion and lighting data in the preset. Demonstrate the core on other water forms, authored control grids
or splines, and alternate viewpoints. Procedural water surfaces do not imply a physical fluid solver.

Both models also accept `material:"water"` for shared dielectric reflection/transmission and advected
world-space normal relief. `rippleAmplitude`, `rippleFrequency` and `rippleFlow` control that fine relief;
larger folds require geometry or a simulation. `opticalThickness` controls absorption separately from
the sheet's geometric `thickness`. Clear water receives shadows; opaque foam casts and receives them.
The material owns and releases its procedural environment. The existing opaque material remains the default.

For a shot that specifically needs editable simulated liquid motion and changing topology, the optional
Blender4.5LTS workflow is `scripts/acryllex/fluid-bake.py`:

```sh
python3 scripts/acryllex/fluid-bake.py --write-example recipe.json --preset dam-break
blender --background --threads 2 --python scripts/acryllex/fluid-bake.py -- \
  --recipe recipe.json --output /tmp/acryllex-liquid --stage all
```

The editable recipe supports FLIP/APIC, initial liquid volumes, inflows/outflows and colliders. All authored
and exported positions use Y-up metres. The bake exports real mesh positions, normals, triangle indices
and foam/spray positions, with an editable `.blend` and recipe beside the result. Initial conditions,
mesh resolution, flow, foam and lighting still need visual review; a successful solve does not establish realism.

Use a prepared cache in a storyboard object:

```json
{"id":"water","model":"fluid-cache","origin":"model","pos":[0,0,0],"enter":"none","idle":"none",
 "params":{"file":"/tmp/acryllex-liquid/manifest.json","material":"water","rippleAmplitude":0.006}}
```

Set an explicit camera for the authored simulation coordinates. Cache playback accepts `start`, `speed`,
`timeOrigin`, optional `fps` and `loop`. The default material is opaque; the opt-in water material uses
`thickness` for optical thickness because cache geometry is already authored. The `acryllex-fluid-cache-v1`
manifest references little-endian ACF1 geometry frames. Local preparation validates paths, indices,
finite values and resource budgets before loading. Default limits are256MiB per cache and512MiB resident.
Playback keeps GPU buffer capacities stable while updating active counts and bounds for changing topology.

Run `node scripts/acryllex/verify-fluid-cache.mjs` for portable generated-cache checks and
`node scripts/acryllex/verify-fluid-render.mjs` for native GPU rendering, fixed-ink and reverse-seeking checks.

## Anatomical humans

For a fixed human view/action, prefer licensed footage or a static photo as appropriate. For editable poses,
prefer a clothed scanned, rigged body with supported pose controls; verify anatomy and contact in the shot.

`human-male` and `human-female` load separate adult figure meshes with a shared rig and pose/IK track
interface. Their proportions scale uniformly with `height`; joint rotation does not stretch the torso
or head. These are unclothed figure-study models. `mesh:"scanned"` selects the clothed scanned body.
The public `human` model uses the same proportion-preserving rig with the existing scanned bodies.
Legacy `build` spine scaling and the female width squeeze are removed; choose a different body asset instead
of stretching the torso. `height` scales the whole body uniformly, and uniform head/foot controls survive posing.
Runtime checks establish valid skinning and deterministic seeking; they do not establish a99% visual match.

The bundled bodies derive from MakeHuman's CC0 assets at commit
`a8bc2d54ff0ac92e78ff71431b1023eda42bf482`. Rebuild with
`node scripts/acryllex/build-humans.mjs`; recipes and source metadata are embedded in each GLB.
See `src/acryllex/assets/humans/README.md` and its asset license for provenance.

## Motion sampling

Scenes may set `motionFPS` (positive, at most120) and `motionPhase` (global seconds, default0). This samples
geometry, object controls, camera, lighting and scene ink animation together on one frame clock. Text,
captions and scene cuts retain their authored timing. Omit `motionFPS` for continuous motion.

For example, `"motionFPS":25,"motionPhase":0.016666666666666666` gives a25fps motion clock whose first
global tick is at1/60s, useful when matching footage recorded at a different display cadence. Each scene
opts in independently. Verify with `node scripts/acryllex/verify-motion-clock.mjs`.

## Human rig and contact tracks

Human poses retain fixed arm/leg lengths through mocap, named poses and keyed IK tracks. Finger curl is part
of forward kinematics, so queried finger bones agree with the transforms written to the actual skin. Hidden
anatomy helper meshes are excluded from height and head measurements. Inspect the visible deformed mesh;
a projected joint alone is not proof of a fingertip or sole contact.

A track key may supply `floor` and `floorWeight` to prevent sole penetration independently of its torso/IK
blend. `ground:true` uses the measured bind-skin floor for upright poses. These are floor constraints, not a
claim that all fingers touch a keyboard or that any arbitrary pose fits any chair. Fit furniture contacts in
the shot while keeping natural proportions and limb lengths.

The reference opening now uses the scanned Remy body with source-fitted reach, release, sit and typing
tracks. Other scenes, furniture, camera and fixed-ink styling are preserved. Source identity, some early hip
and late elbow estimates, late hand height and back shading remain different; no 99% match is established.
Run `node scripts/acryllex/verify-human-rig.mjs` for offline male/female skin/rig regression checks. Actual GPU
rendering and full-motion reference comparison remain necessary for visual acceptance.
