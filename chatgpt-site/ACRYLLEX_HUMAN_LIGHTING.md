# Human head accent lighting

`human`, `human-male` and `human-female` accept an optional `params.headAccentLight`. Use it to restore a readable head silhouette without filling the arms or changing the scene's ink colour. The default is disabled and retains the original materials and geometry.

```js
headAccentLight: {
  position: [-0.08, 1.57, 0.28],
  target: [0.72, 1.22, 0.03],
  intensity: 1,
  innerAngleDeg: 12,
  outerAngleDeg: 20,
  distance: 3
}
```

Positions and distance are world-space metres. The spotlight stays fixed as the person moves. Its receiver is the sum of the original Head, HeadTop_End and Neck skin weights, clamped to `[0, 1]`; the transition therefore follows the authored skin binding. This is an art-directed, unshadowed Lambertian accent, not a replacement for physical scene lighting. Existing shadows, specular response, transparency, albedo, pose, body proportions and the output ink stay unchanged.

Omit the parameter or set it to `null`, `false`, `0` or `{intensity: 0}` to disable it. Enabled configurations require finite three-component `position` and `target`, distinct positions, nonnegative intensity, `0 <= innerAngleDeg < outerAngleDeg < 90`, and positive distance. Malformed enabled settings throw instead of substituting a placeholder object. The angle and distance defaults are the values shown above.

The light works with static poses, authored tracks, pose correctives and [recorded motion](ACRYLLEX_RECORDED_MOTION.md). Instances own their added receiver attributes; cached source meshes are unchanged. Select intensity and placement against multiple poses: a more readable head can still reduce local light/dark contrast if the accent is too strong.
