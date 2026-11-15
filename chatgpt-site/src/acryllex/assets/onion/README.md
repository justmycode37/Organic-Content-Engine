# Onion explanatory assets

Added for the unreviewed onion reel on 14 November 2026. All four ids are reusable
library models; the first authored script and storyboard were retained.

- `onion-cutting-take`: an original animated 3D composition using the existing
  source meshes below. Its `start`/`timeOrigin` clock covers 42 seconds. This is
  **authored animation, not filmed footage or a recorded human performance**.
  The head is a rigid scan: no facial expressions, blinking, gripping, hand motion
  or body articulation is claimed. Knife and onion transforms and tear droplets
  are authored separately.
- `onion-cell-separated-cutaway`, `onion-cell-ruptured-cutaway`,
  `onion-cell-mixed-cutaway`: original compartment diagrams with shared geometry
  and deterministic ingredient placement. They are educational schematics, not
  microscope captures, measured organelle proportions, or molecular structures.

The catalogue search found no onion-cutting or onion-cell source. Generic plant
cell illustrations were not a replacement for the three requested compartment
states. Search records are retained with the production run.

## Component attribution

The source entries and download/cache paths remain in the existing catalogue.
Their original assets are preserved; extraction never changes cached source meshes.

| Component | Source | Licence / credit |
| --- | --- | --- |
| Yellow onion | https://polyhaven.com/a/yellow_onion | Poly Haven CC0; existing `yellow_onion` catalogue entry |
| Chef knife | https://sketchfab.com/3d-models/48a6aed1dff24e57b6836ade47a46ead | CC BY 4.0, Yanez-Designs; existing `chef-knife` entry |
| Whole head scan | https://sketchfab.com/3d-models/90fead28cf694f85800a351ed26f4b03 | CC BY 4.0, tojek_vfx; existing `man-head-scan` entry |

The new animation, cutting geometry, compartment diagrams and playback code are
authored in `models/onion.ts`. Dependencies are declared in
`model-asset-dependencies.ts` and prepared by `scripts/acryllex/assets.mjs`.
No image generation or video generation provider was used to create these assets.
No editorial, visual, sound or factual review pass was run for this experiment.

## Reviewed remake: neutral subjects, air and wetness

The current `neutral-tearing-face` uses the bundled CC0 MakeHuman anatomical
head and neck, with authored iris/pupil details. It keeps a neutral frontal pose;
no expressions or eyelid animation are invented. The lower bust fades through
projected dot-density coverage into black. The owner selected two fully filled
pixel teardrops on the cheeks, with a small asymmetric downward reveal. They
follow source-projected cheek positions. No water is added inside the eyes;
there are no wet-film layers, menisci, bright eyelid margins or hollow outlines.
The drops are an explicit illustrative abstraction, with dense coverage under
the shared fixed ink and dot pitch. The default `head-mesh` scan is unchanged;
explicit `source:"anatomical"` selects the bundled extraction.

`gas-pixel-mist` uses hundreds of much smaller independent motes throughout a
broad3D air volume. `center`/`radius` define the surrounding air; `progress`
changes occupancy without collapsing the cloud into a wedge or eye-targeted
line. `to` identifies only the local wet-eye clearing region. Other airborne
motes remain. The pixels illustrate gas that is invisible in reality.

Both `onion-cutting-media` and `onion-cutting-bulb-media` now select Samir Hope’s
Pexels3797834 clip: ordinary hands and knife slicing a bulb with its layered cut
face visible. Framewise Apple Vision foreground segmentation removes unrelated
surroundings and the earlier added board-support patch. The largest connected
foreground component retains the hand, knife and held bulb; mask rows274 onward
(source y822) exclude the lower board/offcut area. Original RGB and action are
preserved. Instance-local sRGB source transfer and levels retain blade detail
without changing shared ink, lighting or dot calibration. Source
and matte share1920×1080 coordinates and25fps; the same crop applies to both.
The distribution mask is H.264 CRF12. Original source RGB and motion are unchanged.
Creator, license, source URL, exact hashes and preparation are retained in
`footage-provenance.json`.

The Pressmaster3195946 segment and earlier Mixkit candidates were retired after
rendered review/user direction. Their original sources and masks remain in the
local run audit, outside the active media presets. The dramatic actor and tattooed
chef are never active defaults.

`onion-cut-half` retains the licensed source exterior and adds a continuous solid
layered flesh face fitted to its cut plane. Layers converge toward a basal centre;
the interior is authored explanatory geometry, not a scanned interior. Exact
static-plane clipping interpolates original triangle attributes at boundaries.
The old `onion-cutting-take` remains only for reproducing the unreviewed experiment
and is explicitly marked unsuitable for normal production.
