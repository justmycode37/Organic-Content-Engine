# ACRYLLEX — dithered-3D explainer reels (model library contract)

Separate account from Hedgy. Reels explain things people are curious about (why we dream, why the blue LED
was so hard). Look: real 3D objects (three.js) rendered as ordered-dither square dots in ONE hue per scene on
black (see `chatgpt-site/src/acryllex/engine.ts`, post shader). Brightness = dot density, so **shape and
shading are everything**: silhouettes, bevels, holes, ridges and tone contrast between parts are what make an
object recognisable. The owner's bar: every object must be instantly recognisable by a stranger, high quality.

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
- `src/acryllex/models/human.ts` — posable person (reference for quality + animation via `update`).
- `scripts/acryllex/render.mjs shot <spec.json> <out.png> <t...>` — stills/contact sheet (GPU Chrome).

## Rules for a model
1. Real-world proportions in metres, y up, front faces +z, origin at bottom centre (grounded) or centre
   (`grounded:false` for floating things like planets, cells, molecules). Tiny things (cells, atoms) use a
   display size ~0.2–1.5 m.
2. Recognisable at reel size from a 3/4 view AND front/side: exaggerate the defining features slightly
   (a cat's ears + tail + whiskers-muzzle, a car's wheels + windows + cabin, an eye's iris + pupil + cornea).
3. Detail via geometry, not texture; 300–20k triangles; use `tone` differences (0.35–1) to separate parts
   (iris darker than sclera, windows darker than body). Avoid huge flat dark areas (they vanish).
4. Animation through `controls` (0..1 sliders, documented, with `defaults`) and idle motion in `update` using
   `t` (wings flap, tail wags, wheels spin, heart beats). Pure function of controls and t; no Math.random/Date
   (use `rng(ctx.seed)`), no allocation-heavy work per frame (mutate existing objects).
5. `describe` = one line of what the viewer SEES + what controls do. `aliases` = the words a writer would use.
6. Must not throw for any params.

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
