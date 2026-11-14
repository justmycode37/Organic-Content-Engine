# Recorded motion for human models

`human`, `human-male` and `human-female` can use an external skeletal GLB as a recorded motion source. The source supplies motion only; the chosen body's mesh, bone lengths and natural proportions stay fixed. The feature is opt-in. Existing scenes, named poses, motion capture, tracks and floor behavior retain their original defaults when `recordedMotion` is omitted or false.

Bind imported animation names to existing human pose names (`walk`, `sit`, `type`, etc.). These names remain compatible with the model's pose validator. An explicitly bound `stand` takes precedence over automatic walking when the object moves.

```js
{
  id: 'person', model: 'human-female', pose: 'sit',
  params: {
    // body:'megan' chooses the existing scan instead of the anatomical body.
    recordedMotion: {
      file: '/private/motions/capture.glb',
      sha256: '<64 hex digits returned by preparation>',
      actions: {
        sit: {
          clip: 'captured-sit', start: 7.5, end: 13,
          timeOrigin: 0, speed: 1, loop: false
        }
      },
      heading: 'follow'
    },
    ground: false
  }
}
```

`file` and `url` are mutually exclusive strings. Remote URLs require HTTPS and a SHA256 pin. Local files may omit the pin, but a pin is recommended for reproducibility. Local edits produce a new content-addressed cache entry and invalidate the previous source template path. Cache publication uses unique temporary files and atomic renames, so concurrent renders read complete files. Failed pins and unsupported data fail explicitly.

Action values may be a clip-name string or the object shown above. Clocks are absolute scene seconds, sampled directly from the imported tracks; there is no incremental motion state. `timeOrigin` defaults to0. Set it to an event's scene time if that event should start an action at its range boundary. Events blend the corresponding named poses; they do not silently restart a shared clock. `start` defaults to0, `end` to clip duration. A forward action samples `start+(t-timeOrigin)*speed`; negative speed starts at `end`. Non-looping actions clamp to the range and hold the endpoint. Zero speed holds `start`. Explicit looping wraps in the half-open range `[start,end)`; arbitrary recorded actions are not guaranteed to have a seamless loop.

Capture XZ translation is always in-place. Use the scene object's movement/path controls to place the person in the world. The imported source class retains a normalized diagnostic root displacement relative to the selected range's first sample, but it does not apply metres of captured travel as pelvis sway. `heading:'initial'` removes yaw at the selected action's first sample; `'follow'` removes yaw at every sample; `'preserve'` keeps recorded facing. An upright rest skeleton must face+Z, use Y-up and X-left. Near-vertical forward axes use a deterministic initial-heading fallback.

Hip height is referenced to `baselineY` in source rig-space metres. This optional override takes priority over `scene.extras.acryllexMotion.baselineY`; absent either, the source's bind-pose hip height is used. This is a standing-height reference, not a zero-at-the-current-pose shortcut: the actual seated drop must survive retargeting. Translation is normalized by the source leg length and transferred through the destination's fixed leg length.

Existing `poseAdjustments`, additive/keyed tracks and floor/sole controls layer after the recorded pose. `ground:false` shows raw retargeted capture without floor correction. `ground:true` enables the existing sole guard; it does not infer a chair, desk, palm grip or collision-free seating. Object movement, source timing and prop contacts still need authoring. Finger curl remains a separate control; importing sparse body mocap does not invent recorded typing fingers.

## Supported skeletal GLB

The GLB must be self-contained and contain no render meshes, images or textures. It needs named animation clips and actual `Bone` nodes recognized by GLTFLoader. In glTF this requires listing the bones in `skins[].joints`, even when no render mesh uses that skin. Merely naming ordinary nodes `Hips`/`Head` is insufficient.

Use canonical/Mixamo bone names, optionally prefixed `mixamorig:` or `mixamorig`. Hips, Head, both arm/forearm/hand and upper-leg/leg/foot/toe chains are required; spine/neck chains are resampled anatomically. The bind skeleton must be upright, metre-scale, Y-up, X-left and face+Z. Constant positive uniform parent scales are supported; animated scale or changing non-root bone translations are rejected so segment lengths cannot change. Arbitrary rest-axis rigs may need conversion to this canonical source layout.

Animations support LINEAR and STEP quaternion/translation tracks. Resample CUBICSPLINE tracks before import. Only hips/ancestor translation may animate. Invalid keyframes, missing bones, duplicate clips, unsupported units metadata, nonuniform source scales and out-of-range action ranges are rejected. Source files are capped at16MB and512nodes. This is a bounded skeletal importer, not an arbitrary FBX/Acclaim/DCC retargeter or contact solver.

Optional source metadata is versioned:

```js
scene.extras.acryllexMotion = {
  version: 1, units: 'metres', up: 'Y', baselineY: 1.03632,
  sourceFPS: 120, standingInterval: [0,8]
};
```

A motion instance clones its source hierarchy and owns its interpolants. Cached source nodes, clips and key arrays remain read-only. It owns no source GPU geometry, materials or textures. Model/runtime disposal clears instance state once; cleanup continues through other callbacks and GPU resources if one callback throws, then reports an aggregate error.

## Preparing a private CMU acceptance clip

No original or converted CMU motion is included in the repository. CMU's primary terms permit commercial-product embedding but prohibit direct motion-data resale, including converted data. Review [CMU's terms](http://mocap.cs.cmu.edu/) before using or distributing data; the parser and preparation code do not grant rights to the motion. Credit CMU Graphics Lab and NSF EIA-0196217 as requested. The example capture is not claimed to match the reference chair sit or typing action.

Explicitly fetch the pinned primary sources into an ignored cache and convert once:

```sh
node scripts/acryllex/prepare-recorded-motion.mjs --cmu-86-09 \
  --cache .acryllex-assets/motion-sources/cmu86 \
  --out .acryllex-assets/private-motion/cmu86_09.glb
```

The command prints the resulting GLB SHA256 and writes a provenance manifest beside it. Repeating it uses the verified offline raw cache. A corrupt source cache fails rather than silently changing motion. The resulting GLB is bone-only and has clip `cmu86_09`; use `start:7.5,end:13` for the private sit excerpt. It is a shallower, high-pelvis action and has no measured chair/desk geometry or captured finger animation. Do not ship it as a standalone motion asset on these terms.

For another appropriately licensed CMU-style input:

```sh
node scripts/acryllex/prepare-recorded-motion.mjs \
  --asf /private/subject.asf --amc /private/take.amc --fps 120 \
  --standing 0:8 --name captured-sit --out /private/capture.glb
```

The converter supports explicitly validated CMU inch-based ASF units, degree angles, XYZ bone axes, zero-rest root `TX TY TZ RX RY RZ / XYZ`, and consecutive FULLY-SPECIFIED degree AMC frames. Other root layouts, axis orders, units, partial channel sets and malformed skeletons fail. Supply the measured frame rate; do not infer it from file extension. The standing interval is an explicit measured baseline, not a universal first-eight-seconds assumption. Primary CMU scale documentation is in its [FAQ](http://mocap.cs.cmu.edu/faqs.php).

Preparation is deterministic: source pins, sampling, names and metadata are stable, with no timestamp or render assets in the GLB. Generic local/remote skeletal GLBs pass through `recorded-motion-assets.mjs`; they are cached by complete-byte SHA256. Source-kind and pin checks occur before loading.

Tests: `node --test scripts/acryllex-recorded-motion.test.mjs` runs synthetic source, validation, sampling, clock, ownership, reproducibility and concurrent-publication checks. No restricted motion samples or network calls are needed by these tests. Actual-data GPU acceptance is a separate private check; successful import alone is not evidence of source likeness or solved chair contacts.

## Captured fingers and independent body motion

Recorded motion accepts three optional controls:

| Control | Default | Behavior |
| --- | --- | --- |
| `body` | `true` | Replace the bound action's body motion. `false` keeps the existing body pose, gait and authored tracks. |
| `fingers` | `false` | Transfer actual animated finger rotations after final hand IK. Missing finger tracks retain the existing hand pose. |
| `fingerCurlPriority` | `"authored"` | Explicit scene `fingerCurl` or per-hand track curl wins, including zero. `"capture"` explicitly gives available, weighted captured finger actions priority over those curl controls. |

For a typing layer that leaves the body's existing motion intact:

```js
recordedMotion: {
  file: "/private/path/typing.glb",
  actions: { type: "typing", "type-lean": "typing" },
  body: false,
  fingers: true,
  fingerCurlPriority: "capture"
}
```

Finger-only bindings use the original semantic action, so a `stand` binding does not disable automatic walking. Each finger's parent-relative rotation transfers through anatomical rest frames, retaining the target's own rest spread and segment lengths. The layer follows the final hand and wrist after IK. Missing endpoints blend with the evaluated existing finger pose; zero-weight captured endpoints are no-ops. This does not infer motion from fingerless captures or solve fingertip/keyboard collisions.

Only animated joints with usable rest-palm and phalanx frames transfer. Missing or degenerate frames retain the existing articulation; unused palm geometry cannot make a fingerless capture fail.

The existing bounds-based origin depends on the initially posed mesh. Starting with captured fingers can shift that initial center by several millimetres. Use `origin: "model"` for an explicit skeletal origin. Alternatively, bindings that activate only later keep the initial bounds unchanged; verify body-world placement across the entire authored motion. No implicit compensation or camera change is applied.

Use your own suitable skeletal source. No captured typing asset is included in the repository. `node --test scripts/acryllex-recorded-fingers.test.mjs` covers synthetic captured rotations, fixed geometry, hand IK, action blends, author/capture priority, no-data behavior and absolute seeking without external assets.
