# Mysteries of the Sky

A landscape animation library for astrophysics explainers. The drawing space is 1920 × 1080. A shot is a duration and a Canvas 2D draw function of elapsed seconds. The same function draws a still, an interactive scrub or an encoded frame. The [study registry](../../chatgpt-site/src/mysteries-of-the-sky/studies.ts) is the executable catalog.

## Render a study

From the repository root, install the existing renderer dependencies with `npm ci --prefix chatgpt-site`. Use local Chrome (or set `CHROME_PATH` to Chromium). Movie export also uses FFmpeg on PATH.

```sh
node chatgpt-site/scripts/sky-study.mjs shot electron /tmp/electron.png 2.5
node chatgpt-site/scripts/sky-study.mjs render taxonomy-reflow /tmp/reflow.mp4
SKY_WIDTH=960 node chatgpt-site/scripts/sky-study.mjs render sampler /tmp/mysteries-library.mp4
node --test chatgpt-site/scripts/sky-study.test.mjs
```

Default movie output is silent 1080p H.264 at 30 fps. `SKY_WIDTH` changes output resolution while preserving the composition. Each study name in the table below can replace `electron`. The `sampler` plays every study in registration order.

## Compose a shot

This example draws one wave and keeps the moving highlight exactly on its advancing tip. Add shots to the array in playback order. Pass the canvas context and the current playhead time in seconds from a browser or the local renderer.

```ts
import { body, renderFrame, trace, tween, wave, type Shot } from './index.ts';

const arrival: Shot = {
  duration: 5,
  draw(ctx, t) {
    const path = wave([240, 540], 1440, 80, 5, t * 0.8);
    const front = tween(t, 0.2, 4.4, 0, 1);
    trace(ctx, path, front, 'twilight', 8);
    body(ctx, 'sphere', path(front), 18, 'signal');
  },
};

renderFrame(ctx, [arrival], seconds);
```

The import above is relative to `chatgpt-site/src/mysteries-of-the-sky/`. Use `layer` for local position, rotation, scale and opacity, or `camera` for a world-space focus and zoom. `throughMatte` and `tileReveal` take drawing callbacks so an author can supply a decoded image, video frame or original illustration. Keep moving geometry and its labels on the same transform when they must travel together. Place labels outside the camera when they should stay legible during a push.

## Reference coverage

The reference is Quanta Magazine’s 16:24 film. The corrected video ID ends in a lowercase **o**. The supplied electron image matches the frame at **9:02**. The intervals below index recurring animation techniques observed in sampled frames across the film. A study can compress a long sequence into a few seconds. Portraits, interview footage, telescope images and publisher artwork are source assets that a production author supplies separately. [Watch the reference](https://www.youtube.com/watch?v=Unl1jXFnzgo)

| Reference moment | Animated behavior | Runnable studies |
| --- | --- | --- |
| 0:00–0:32 and 15:50–16:24 | Tiled image replacement, cosmic push through depth, detector tracks, orbital lines, galaxy title and credits reveal | `cosmos`, `sea`, `scales`, `collider`, `orbit`, `titles` |
| 0:33–1:00, revisited between chapters | Expression revealed term by term, anchored callouts and slow flowing contours behind the type | `annotation` |
| 1:17–2:32 and 14:20–14:40 | Populate concentric fields around a central object, move between scales, deform a coordinate grid into a well | `shell-model`, `taxonomy-wheel`, `catalog-fill-zoom`, `spacetime` |
| 2:32–3:10 | Three wave-bearing objects elongate into crossing fields | `fields` |
| 3:10–4:10 | Annulus tilts into view, slots populate, rotating wire volumes contrast distinct and shared states | `taxonomy-wheel`, `taxonomy-reflow`, `particle-containers` |
| 4:10–5:14 | Quark and lepton glyphs, nucleus and orbits, a landscape revealed through a silhouette, drifting tracks, an expanding cutaway of the universe | `atomReveal`, `constituentReveal`, `interior`, `aperture`, `neutrinoTracks`, `expansion` |
| 5:15–7:16 | Fill selected sectors, zoom to a family, sort into generations, pass through a luminous chamber and stack the diagram in depth | `catalog-fill-zoom`, `taxonomy-reflow`, `passage` |
| 7:17–8:20 | Composite a portrait beside an equation, populate a particle sea, return to the organized wheel | `equation-card`, `aperture`, `annotation`, `sea`, `taxonomy-wheel` |
| 8:20–9:22 | Exchange a travelling pulse, isolate one particle, grow soft field shells and bring charge markers into view | `exchange`, `fieldInteraction`, `electron` |
| 9:23–10:46 | Dive through an atom, separate and rejoin the nucleus, release a billowing luminous volume, draw a three-way strand from moving endpoints | `atomReveal`, `nucleusBonds`, `plasma`, `forceStrands` |
| 10:47–12:16 | Reveal a composite particle, change one constituent, emit two products and reassemble the chart | `constituentReveal`, `betaEmission`, `taxonomy-reflow` |
| 12:17–14:20 | Speed streaks cross a growing field, nodes appear inside it, mass layers reorder and a wire volume rotates | `fieldInteraction`, `taxonomy-reflow`, `particle-containers` |
| 14:40–15:49 | Wheel recedes and an expanding perforated surface reveals the scene underneath | `negative-space` |
| Original astrophysics examples | A planet crossing a star drives a synchronized light curve, a moon passes in front of and behind a planet, and a signal advances between endpoints | `transit`, `orbit`, `signal` |

## Paint and motion

The five landscape swatches anchor the materials, from night `#040411` through plum `#2e1d2d`, wine `#63374a`, brick `#873f40` and coral `#c46d65`. Indigo and lilac come from the reference sky. Surfaces combine tonal ramps, directional shading and object-space grain. Shells feather toward the interior while retaining an irregular outer silhouette. At 1080p, a two-pixel raster mixed over the smooth frame at 42% gives the artwork a slight pixel edge. All typography, equations and charge symbols retain native-resolution antialiasing. The single surprise hue is chartreuse, `#ddf65e`. The `signal` ramp reserves it for an active measurement or the head of an arriving wave.

The source studies are schematic. In the transit study, disk overlap drives the flux of an idealized uniform stellar disk. The chart and occultation use the same position and radius. The planet’s size, impact parameter and vertical chart scale are illustrative.

## Story development

Start with the [eight sourced research briefs](research.md). The [story workflow](story-pipeline.md) turns a sourced claim ledger into a shot handoff. The [worked transit brief](story-example-transit.md) is a preproduction example, with scientific and editorial review still pending.

The channel’s [recurring presenter, Professor Rowan Ellery](presenter/README.md), has a saved HeyGen speaking master, reference portrait and new-take workflow.
