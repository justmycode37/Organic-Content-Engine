# Fixed-view human media

`human-male-footage` (aliases `human-footage`, `man-footage`) and `human-female-footage` (alias `woman-footage`) provide separate generated adult subjects walking, reaching for a chair, sitting and making typing-like hand movements. Each clip has 147 frames at 30 fps and lasts 4.9 seconds. Both use the existing footage renderer, explicit alpha, instance-owned texture transforms and shared dot shader.

These are fixed-profile video subjects with a baked action sequence. Use `human`, `human-male`, `human-female`, or a compatible `bodySource` for editable poses and new 3D viewpoints. The media subjects accept the existing footage playback, crop and grading parameters.

The named assets are `human-male-motion` and `human-female-motion`. Sources and alpha masks are bundled, and source SHA256 pins are enforced during preparation. Both default to `sourceLevels:{blackPoint:0,whitePoint:.75}`; an identity range disables that grading. The source pixels and cached atlases remain unchanged by runtime grading.

For a one-ink result, use `look.inkMode:"fixed"` with the normal shared cell size. The example at `scripts/acryllex/fixtures/human-footage.json` renders both subjects with the same grid, ink and post-lighting settings. Source lighting is baked into the video. Scene post-lighting and `sourceLevels` control the resulting density; they do not supply a new physical viewpoint or missing hand detail.

```json
{
  "id": "actor",
  "model": "human-female-footage",
  "origin": "model",
  "pos": [0, 0, 0],
  "params": {"height": 2},
  "castShadow": false,
  "receiveShadow": false,
  "enter": "none",
  "exit": "none"
}
```

The example uses a static camera at `[0,0,5.9]`, looking at `[0,0,0]`, with a 30-degree field of view. `height` is the cropped video plane height in metres, including its padding. Place the plane explicitly when mixing it with 3D furniture; the original object camera and root-follow relationship can be retained with public transform keyframes.

Both appearances were generated with image_gen and animated with **Kling AI 2.6 Motion Control**, using an own rendered rig-driving video. Original reference-video pixels are not included. [Source provenance](assets/media/human-motion-provenance.json) records hashes, inputs and preparation; [Kling terms](https://kling.ai/docs/user-policy) and [paid-service terms](https://kling.ai/docs/payment-policy) accompany the generating service.

Current limits include an underfilled hair cap, a slightly low floor, some swing-foot/crown tracking errors and simplified finger articulation. The female clip has softer hand detail. These are usable optional media subjects, not a verified 99% recreation of the reference.

Captured object root paths support up to 600 transform keys per object. The portable reference recipe uses bounded sampled tracks to preserve the original camera follow while using the fixed-view human source.

For this fixed-view human sequence, the example uses `scene.raster.cell: 3.2` and `scene.light.softness: 0.6` to illustrate a finer, softer dot pattern. These controls affect post-render sampling in that scene; the format cell still sets the source render resolution. They do not change the footage, alpha or other scenes. Omitted raster fields use the original format/look defaults, including after reverse seeks.

The optional `asset: "human-male-clay-motion"` on `human-male-footage` supplies the same action in a neutral off-white material with a brighter crown and a shadowed cheek. The photographic male/female defaults stay available. The reference fixture retains the photographic male and uses a camera-vertical/depth root position track, with the original constructor bounds kept for furniture lighting. It never stretches individual body parts. Its five framing calibration samples are documented in `assets/media/human-keyframes/human-placement-provenance.json`; clip preparation is in `assets/media/human-motion-provenance.json`. Exact finger contact and a99%reference match remain unverified.


For subtle pixel activity, add `scene.raster: {"activity":0.3,"activityRate":18}` while retaining the chosen `cell` size, contrast and fixed ink. `activity` accepts 0..1 and defaults to 0; `activityRate` accepts 1..60 Hz and defaults to 18. The deterministic clock uses global output time, independently of `motionFPS`, so reverse seeks reproduce the same pattern. Omitted fields reset every frame to their engine defaults.

Activity swaps complete Bayer/noise threshold addresses within each 2×2 cell tile. Pair members share one decision, preserving the exact threshold multiset and therefore the lit-cell count on a uniform, complete tile, including with `noiseReference` tone mapping. Source sampling, cell geometry and ink coordinates stay fixed. Density can vary locally where lighting or silhouettes differ between neighboring cells; activity does not introduce a color source. At activity 0 the original threshold path is retained.
