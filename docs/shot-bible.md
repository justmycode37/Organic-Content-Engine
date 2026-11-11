# Shot bible — Hedgy showcase "The ticket that took off"

Read first: `docs/motion-v3.md` (team contract, file ownership, never git checkout/stash/reset/commit),
`docs/showcase-script.md` (the film: narration, shot table, set-pieces), `chatgpt-site/src/motion/README.md`
(all v3 APIs: 3D engine, assets, Hedgy actor, transitions, rig, FX/env, viz/type).
Reel spec: `chatgpt-site/motion-examples/hedgy-squeeze.json` (scene type `shot`, one per script row).

## What a shot is

`src/motion/shots/<name>.ts` exports a `ShotDef` (`shots/index.ts`) and is registered in `SHOTS` with a
small exact-string edit (add one import line and one entry; never rewrite the file — 7 agents edit it).
`render(frame, props)`: frame.t seconds into the shot, frame.dur its length (the narration stretches shots,
so the real duration may be 0.7x–1.6x the spec value — derive ALL timing from frame.dur and events).
`props.events`: `[{at, kind}]` narration-synced moments; kind = the sync word lowercased (see the spec).
Always fall back to proportional times when events are missing. `cues(props, dur)`: sound moments using
the same timing maths, kinds from `CUE_KINDS` (core.ts), with `pan` (-1..1 from on-screen x) and `gain`.
Note frame.t can be slightly negative or exceed frame.dur during transition overlaps — clamp.

## The look (non-negotiable)

- FULL BLEED: the shot owns x 0–1080, y 0–1290. Compose vertically for 9:16. No headline text on top.
  Captions are drawn by the player below y 1320; never draw there.
- NEVER a void: every frame has depth — a set/environment in the background (architecture, balconies,
  city, fog-dithered tiers), a midground hero action, and frequent foreground elements passing close to
  camera (rails, tickets, paper debris, crowd silhouettes) for parallax. Pure black should be < 35% of frame.
- Lighting: bright, contrasty noir. Hero objects read mid-to-light grey with crisp highlights and a key
  light from top-left, rim light, ground shadows, dithered fog for depth. Pass bright View3D lights
  (ambient ~0.35+, rim) — the default assets look too dark on black; fix that per shot.
- Palette: black/white/greys; Hedgy natural brown; RED only for the rising price line / price-up
  moments. No green in this film. No other hues.
- Camera ALWAYS moves (use `createCameraRig` from fx/rig.ts and/or animated View3D yaw/pitch/position):
  dolly, crane, orbit, push-ins on hits, small handheld drift. Something meaningful changes every 0.3–0.6 s.
- Hedgy: `drawHedgy` from src/motion/actor/hedgy.ts (being redesigned right now by another agent — the API
  and pose names stay stable; just call it). He is a 2D sprite composited at the right depth (draw him
  after background 3D, before foreground layers). Scale so he is a clear actor (typically 6–12 px per art px).
- Shared hero prop: the concert ticket from `src/motion/sets/ticket.ts` (`ticketMesh`, `TICKET_MATERIALS`,
  `drawTicket2D`). Use it whenever a ticket appears so it's identical across shots.
- Text: at most one short diegetic word at a time (pixel type via prim.ts `pixelText` or viz/type kinetic
  type), placed ON something (a stamp, sign, shelf) — never a floating title.
- Particles/FX: use fx/particles.ts (bursts, paper debris, dust, speed lines, shockwaves) and fx/post.ts
  (impact frame, flash, bloom, vignette) to sell energy — tastefully.
- Pixel-crisp: `imageSmoothingEnabled = false`, positions snapped to the pixel grid, no smooth gradients.
- Performance: < 50 ms per frame in headless Chrome. Measure.
- Deterministic: no Math.random/Date.

## Verify like a director

Render your shots in isolation (a scratch spec with just your scenes, plus the neighbouring scene for
transitions) AND inside the full reel:
`node scripts/motion.mjs shot <spec> <out.png> t1 t2 ...` (contact sheet) and
`node scripts/motion.mjs render <spec> <out.mp4>` (silent). Study frames at full size. Iterate at least
3 rounds. Ask: would this stop a thumb on Instagram? Does the frame use the whole space? Is the story
beat obvious with the sound off? Is it beautiful?
Typecheck: `npx tsc -p tsconfig.json --noEmit` (ignore errors in files you don't own).
