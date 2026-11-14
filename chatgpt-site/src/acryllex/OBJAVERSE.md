# Sourced geometry from Objaverse

Use the existing `mesh` model with `params.objaverse` instead of a file/URL. The actual GLB is downloaded and rendered through the same neutral scene-hue material, lights, pixel pitch and density response as other geometry. No replacement geometry is generated.

```json
{
  "id": "person",
  "model": "mesh",
  "params": {
    "objaverse": "c5322a46a62644cebd41527859260b65",
    "height": 1.65,
    "clips": "all"
  },
  "idle": "none"
}
```

This example is **Free 018 Kana Music by ddd**, CC BY 4.0, via Objaverse / Sketchfab. It contains a 66-joint skin and the supplied `mixamo.com` animation. It has no facial blendshapes. A demonstration of that clip does not establish arbitrary walking, contact or expression capability.

`scripts/acryllex/objaverse-reviewed.json` contains three inspected source records (human, static left hand, static female head), their SHA-256 pins, creators, original pages, scope and scene parameters. These are evaluation sources, not blanket realism approval. The already accepted `hand-mesh` remains unchanged.

```sh
node scripts/acryllex/objaverse-assets.mjs search "rigged hand"
node scripts/acryllex/objaverse-assets.mjs inspect <UID>
node scripts/acryllex/objaverse-demo.mjs
```

Discovery checks membership in the real Objaverse object index. Preparation checks the individual archived licence, retains creator/source metadata, pins the downloaded bytes, and inspects actual skins, clips, morph names and material extensions. Current automatic importing supports CC BY and CC0 objects. Other licences need explicit source review. Cached sources work offline and a hash mismatch fails instead of substituting another mesh. Provenance is retained in `.acryllex-assets/objaverse/<UID>/provenance.json`; it does not assert an unverified source was photographed or scanned.

`expectedSHA256` optionally pins an imported source before acquisition, and is included in the inspected source records. `sourceRotation:[x,y,z]` corrects imported axes **before** physical height measurement, preserves authored root transforms and composes after optional `up:"z"`. It is separate from the camera or animated object rotation.

Source cutout/blended coverage is preserved by default (`sourceAlpha:true`) and named hair retains its authored sidedness (`sourceHairSide:true`). Both can be explicitly disabled. Neutral shading uses only source alpha, not its photographic RGB. Legacy `KHR_materials_pbrSpecularGlossiness` diffuse textures/coverage and standard normal relief are supported for neutral rendering. This compatibility path does **not** preserve that archived workflow's complete native specular BRDF/textures; source-luminance rendering is an approximation.

Use actual source clips and morph targets for articulation. Static scans/sculpts support rigid movement and new camera views only. Dataset membership, a title containing “rigged,” a high triangle count or passing transport tests cannot establish anatomy, motion quality, a correct grasp or a style match. Compare silhouettes and motion against the source, then inspect native-size frames in the shared style.
