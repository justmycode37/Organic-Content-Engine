# Human motion-transfer inputs

`start.png` and `female-start.png` are generated, fully clothed adult appearance sources on a shared 1164×670 black canvas. `motion-guide-corrected.mp4` is a 4.9-second, 30 fps furniture-free grayscale render of the fitted human rig. These are the inputs used for the bundled male/female motion clips.

The guide keeps one arm reaching for a chair while the other stays down/front, stabilizes the far foot while retaining the near-foot step, and includes a late-walk head descent. Its combined solved-bone behavior, camera and prop transforms were compared at 16 times. Typing wrist checks did not justify an additional correction.

No original reference-video pixels or raw body-model files are included. Source hashes and preparation are recorded in `provenance.json`, `female-start-provenance.json` and `motion-guide-corrected-provenance.json`. The generated output and alpha-mask hashes are recorded in `../human-motion-provenance.json`.

The images retain small pose deviations; the guide supplies the actual animation. These inputs and generated clips do not establish a 99% reference match.

`clay-start.png` and its provenance supply the optional neutral clay appearance. `human-placement-provenance.json` records the five numeric framing samples used by the reference fixture; it contains no source video frames. Placement changes only camera-vertical/depth root position keys, while the original constructor position preserves shadow framing.

`motion-guide-late-reach.mp4` is an optional newer own-rig guide. Its public recipe is `motion-guide-late-reach-spec.json`. It extends the two wrist targets smoothly after4.4s, retaining the earlier choreography, torso, head, feet, segment lengths and approximately the prior absolute hand orientation. The final targets account for actual hand/forearm skin above the desk, rather than forcing an uncertain source-pixel wrist height through the tabletop. The guide contains no furniture; contact was checked separately in its composed scene. This does not establish keyboard keypress contact or improve the already generated clips automatically.

Reproduce its neutral, undithered conditioning take from the site directory:

```sh
node scripts/acryllex/render-human-guide.mjs \
  src/acryllex/assets/media/human-keyframes/motion-guide-late-reach-spec.json \
  /tmp/human-late-reach.mp4 --object=man --fps=30
```

The exporter uses the normal rig, camera and lighting, hides other objects, removes enter/exit effects and hue flashes, then records neutral gray SRGB frames on black. It writes video metadata beside the output. It needs Chrome/Chromium and FFmpeg, as does the normal renderer. The input recipe is specific to this actor and shot; its pose targets should be retargeted and checked before use on another body.
