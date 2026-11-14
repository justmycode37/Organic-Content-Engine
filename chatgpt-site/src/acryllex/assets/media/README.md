The media catalogue uses licensed images or video for complex subjects whose surface detail and motion are poorly represented by primitive geometry. The shared pixel renderer converts source luminance into density in one scene ink. An explicit alpha matte removes the setting to black.

`wave-footage` (alias `ocean-wave-media`) selects `footage` with `params.asset: "ocean-breaker"`, a fixed outside view. `params.asset: "ocean-barrel"` provides an inside-view alternative. Its camera cannot rotate to reveal another side. The public original is downloaded on demand into the ignored `.acryllex-assets/media-inputs` cache and checked against its SHA256. The original is not bundled or offered as standalone stock.

Outside source: [Night breaker, doktorkleinmusic, Pixabay268746](https://pixabay.com/videos/wave-barrel-night-moonlight-268746/). The source explicitly labels this video AI-generated. The approved outside preset selects sourceframes120–195 (4–6.533333s); its matte contains120 black lead-in frames to match that source clock. The through-curl is filled rather than an exact dark opening.

Inside source: [Ocean wave, Solarselle77, Pixabay310248](https://pixabay.com/videos/ocean-wave-sea-surf-sunrise-310248/). [Pixabay Content License](https://pixabay.com/service/license-summary/) and [terms](https://pixabay.com/service/terms/) apply. Capture origin is unverified; do not label it filmed footage. The preset selects sourceframes0–75 at30fps. Its background matte is separately authored and contains only alpha values, with sky, sun, coast and buildings removed. Transparent water/spray edges require compositing judgments. This subject is not an exact recreation of the reference wave.

For a different subject use `footage` with `file` or an HTTPS `url`, plus a matched `alphaFile` image/video. White alpha keeps the subject; black removes it. A mask video must cover the same source interval. The image and matte share trimming, cropping and mirroring, so they stay aligned. Set `monochrome:true`, `preserveAspect:true` and a fixed scene ink for the density-based look. Keep source, creator, license, source hash and any edits with each custom recipe. Use moving video for evolving fluids; a photograph provides a still subject.

Use existing scanned, rigged human assets and motion capture when editable poses or new camera views are required. Geometry remains useful for mechanical objects and subjects that need true 3D editing.

For a human footage layer whose grayscale source is too flat or dark, optional `params.sourceLevels:{blackPoint:0,whitePoint:.75}` grades that instance before the common dot renderer. Maximum RGB intensity is mapped from the selected black/white range to 0–1; source hue and alpha are retained. Both points must be finite numbers in 0–1, separated by at least 0.000001. Omission or the identity range `{blackPoint:0,whitePoint:1}` leaves the original material program untouched. This changes coverage through source shading while keeping the output dot size, ink, camera and scene lighting unchanged. It does not alter prepared atlas pixels or other instances of the same clip. Compare local density and contrast at intermediate frames before selecting a range; these controls do not repair a wrong pose or missing motion.


To regenerate the inside matte, install the optional build tools (`numpy`, `scipy`, `Pillow`, `opencv-python-headless`) into a Python environment and run from `chatgpt-site`:

```sh
python scripts/acryllex/build-ocean-matte.py --source /path/to/original310248.mp4 --recipe src/acryllex/assets/media/ocean-barrel-matte.json --output /tmp/ocean-barrel-alpha.mkv --output-dir /tmp/ocean-barrel-review
```

The source hash is checked before tracing. The production renderer only needs the bundled alpha file and does not need Python or the optional CV packages.

The approved outside matte can be regenerated with the same optional tools:

```sh
python scripts/acryllex/build-breaker-matte.py --source /path/to/original268746.mp4 --recipe src/acryllex/assets/media/ocean-breaker-matte.json --output-dir /tmp/ocean-breaker-review
```

Use the generated `agent-wave31-outside-approved4-alpha-full-clock.mkv` for the full source at `sourceStart:4`; the zero-based76-frame mask is for an already trimmed4-second source window. The script verifies the original source hash and writes lossless alpha only.


Media presets prepare three source samples across each output dot (`sampleScale:3`). This preserves fine luminance variation before the common dot renderer; output dot size, threshold pattern and ink stay shared with the rest of the reel. For the approved outside source use scene light `contrast:1.5`, `gamma:1.05`, `blackPoint:.02`, `whitePoint:.95`, `exposure:1.05`, `softness:0`. A final blur thickens the dots and changes apparent local coverage; it is not a substitute for grading.
