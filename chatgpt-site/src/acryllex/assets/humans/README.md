# Anatomical human assets

The male and female GLBs are separate meshes generated from MakeHuman's base mesh, sex-specific
macro targets, rig and weights. They use the CC0 1.0 asset license included in LICENSE.ASSETS.md.
The upstream application has a separate software license; no application source is bundled here.

Source: https://github.com/makehumancommunity/makehuman/tree/a8bc2d54ff0ac92e78ff71431b1023eda42bf482/makehuman/data

Asset license: https://github.com/makehumancommunity/makehuman/blob/a8bc2d54ff0ac92e78ff71431b1023eda42bf482/LICENSE.ASSETS.md

Run `node scripts/acryllex/build-humans.mjs` from chatgpt-site to rebuild both files. The script pins
the upstream commit and records its recipes, weighted targets and source metadata inside each GLB.
Use `--src <data-directory>` to reuse downloaded source data and `--out <directory>` for another output.

The default build also applies the authored hip, knee and coupled trunk correction fields in
`human-male-fields.json.gz` and `human-female-fields.json.gz`. These payloads pin the base and output
SHA256 values; applying one to a different base fails. The original geometry, weights, skeleton and
bind matrices remain intact, with sparse POSITION/NORMAL morph targets appended. The field values
are authored asset data; routine rebuilding uses Node and does not run the contact-authoring solver.
Use `--base --out <directory>` to export the original bodies without these fields.

`poseCorrectives:true` opts an instance into these fields; the default is false. Each actor evaluates its own
hip, knee and trunk features after posing and floor constraints. Assets without this metadata keep
their existing rendering. The curves are continuous and piecewise linear. Deep bends retain local
flattening, sharp creases and some residual intersections; the fields do not establish arbitrary-pose
anatomical accuracy or conservation of tissue volume. Hold-last extrapolation beyond the calibrated
hip120°/knee145° range can worsen intersections; inspect custom motion before enabling the fields.

The meshes and normalized rig were authored in the delegated Fable modelling task. Integration adds
explicit `human-male` / `human-female` model IDs. The public `human` renderer now uses the same normalized
rig with existing scanned bodies; uniform proportions, real finger transforms and sole-plane constraints
replace the old anisotropic spine scaling. Sol6.1 human integration/fitting followed the original Fable task.
Anatomical and reference-motion review is still in progress. Passing loader, skinning and seeking
checks is not a claim of visual or anatomical acceptance.

Anatomical presets now use `staticPoseBase:"neutral"` and `staticFloor:"skin"` by default. Static
poses start from an explicit arms-down frame and blend completed local joint rotations. The crouch
uses forward arms for balance. With `ground:true`, cached actual foot skin sets the underlying pelvis
height before authored tracks, preserving the knee plane. Scans retain their existing idle-based posing.
`staticPoseBase:"idle", staticFloor:"none"` retains the old anatomical pose composition and placement.

Skin placement consumes the static bank's vertical placement, including cheer's 2cm lift. Explicit
`poseAdjustments.y` retains its difference from the bank y, with the existing height scaling; use
`staticFloor:"none"` to retain the bank placement. Authored track offsets and IK follow placement;
keyed tracks still receive the existing final sole-plane guard when `ground:true`. Set `ground:false`
when an authored track owns the floor constraints. Floor support changes can affect derivatives, and
conflicting legacy mocap/track constraints require separate transition review.

For the reviewed sit/type/type-lean/forward-arm crouch controls, `poseCorrectives:true` enables the
additional hip/knee fields. Protected head, hand and foot positions and bone dimensions stay intact.
Other body folds remain, including shoulder, head and toe intersections; the contact fields are not a
global collision solver. The female walking skin changes by up to0.535mm with fields enabled, while
the inherited finger/thigh gait contacts remain.

Scanned human surfaces use `sourceAlpha:true` by default. Hair/eyelash transparency is preserved
even with flat scene-hue colours; source texture RGB is not restored. The original maps and UV
settings remain shared read-only, with no new textures. `sourceAlpha:false` reproduces the previous
conversion. Face-culling policy stays unchanged. The bundled opaque anatomical skins are unaffected.

The bundled `Hair` object is an upstream helper made of long guide strips. It is hidden by default
because it is not a finished short hairstyle. `hair:true` exposes it for authoring; hiding it does not
change Body or Eyes vertices. Hair modelling and the reference pose remain under review.
