# Anatomical human assets

The male and female GLBs are separate meshes generated from MakeHuman's base mesh, sex-specific
macro targets, rig and weights. They use the CC0 1.0 asset license included in LICENSE.ASSETS.md.
The upstream application has a separate software license; no application source is bundled here.

Source: https://github.com/makehumancommunity/makehuman/tree/a8bc2d54ff0ac92e78ff71431b1023eda42bf482/makehuman/data

Asset license: https://github.com/makehumancommunity/makehuman/blob/a8bc2d54ff0ac92e78ff71431b1023eda42bf482/LICENSE.ASSETS.md

Run `node scripts/acryllex/build-humans.mjs` from chatgpt-site to rebuild both files. The script pins
the upstream commit and records its recipes, weighted targets and source metadata inside each GLB.
Use `--src <data-directory>` to reuse downloaded source data and `--out <directory>` for another output.

The meshes and normalized rig were authored in the delegated Fable modelling task. Integration adds
explicit `human-male` / `human-female` model IDs. The public `human` renderer now uses the same normalized
rig with existing scanned bodies; uniform proportions, real finger transforms and sole-plane constraints
replace the old anisotropic spine scaling. Sol6.1 human integration/fitting followed the original Fable task.
Anatomical and reference-motion review is still in progress. Passing loader, skinning and seeking
checks is not a claim of visual or anatomical acceptance.

The bundled `Hair` object is an upstream helper made of long guide strips. It is hidden by default
because it is not a finished short hairstyle. `hair:true` exposes it for authoring; hiding it does not
change Body or Eyes vertices. Hair modelling and the reference pose remain under review.
