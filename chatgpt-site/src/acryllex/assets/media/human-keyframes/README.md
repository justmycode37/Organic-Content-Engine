# Human motion-transfer inputs

`start.png` and `female-start.png` are generated, fully clothed adult appearance sources on a shared 1164×670 black canvas. `motion-guide-corrected.mp4` is a 4.9-second, 30 fps furniture-free grayscale render of the fitted human rig. These are the inputs used for the bundled male/female motion clips.

The guide keeps one arm reaching for a chair while the other stays down/front, stabilizes the far foot while retaining the near-foot step, and includes a late-walk head descent. Its combined solved-bone behavior, camera and prop transforms were compared at 16 times. Typing wrist checks did not justify an additional correction.

No original reference-video pixels or raw body-model files are included. Source hashes and preparation are recorded in `provenance.json`, `female-start-provenance.json` and `motion-guide-corrected-provenance.json`. The generated output and alpha-mask hashes are recorded in `../human-motion-provenance.json`.

The images retain small pose deviations; the guide supplies the actual animation. These inputs and generated clips do not establish a 99% reference match.

`clay-start.png` and its provenance supply the optional neutral clay appearance. `human-placement-provenance.json` records the five numeric framing samples used by the reference fixture; it contains no source video frames. Placement changes only camera-vertical/depth root position keys, while the original constructor position preserves shadow framing.
