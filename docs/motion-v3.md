# Motion v3 — Hedgy reel library upgrade (shared contract for all agents)

Repo: `chatgpt-site/` inside the Organic Content Engine checkout, branch `motion-v3`.
Canvas library: `chatgpt-site/src/motion/` (read `src/motion/README.md` first).
Account rules: `chatgpt-site/worker/hedgy-policy.ts` and `docs/hedgy-generation.md`.

## Goal

Hedgy (Instagram account) makes fast explanatory market/finance Reels. The current
library renders small, static objects on black with a headline on top: it looks
like a PDF. v3 must look like a premium motion-design studio piece made entirely in
code: complex, beautiful 3D pixel art, a camera that moves through space,
full-bleed compositions, creative transitions that carry the eye from one shot to
the next, characterful animation, particles, and rich layered sound design. Fast
paced: a meaningful visual change every 0.3–0.6 s.

## Brand constraints (keep)

- Base palette black / white / greys. Hedgy is natural brown. Red and green only for
  losses/gains or price direction. No rainbow, no decorative accent hues.
  Beauty comes from lighting, materials (bone, steel, chrome, glass, ink, paper),
  dither, depth, silhouettes, motion and composition — think high-end noir pixel art.
- Hedgy himself is a 2D pixel sprite (detailed, expressive) even inside 3D scenes.
- Captions live in the band y = 1320–1650 (bold white sans, drawn by the player).
  Animation region is FULL BLEED above y = 1290: x 0–1080, y 0–1290. Use the whole
  width; things may bleed off the edges. Text inside animations is minimal.
- No logos/watermarks/disclaimers/greetings/CTA end cards.
- Deterministic: pure function of time. No Math.random/Date; use `rng`/`hash`.
- Canvas 1080 x 1920, 30 fps. Rendering must stay reasonably fast (aim < 60 ms/frame
  in headless Chrome on a Mac).

## Architecture (who owns what — edit ONLY your own files)

| Area | Owner files |
|---|---|
| 3D engine | `src/motion/three.ts`, new `src/motion/render/*` |
| Asset library | new `src/motion/assets/*` |
| Hedgy actor | new `src/motion/actor/*` |
| Player, transitions, camera | `src/motion/player.ts`, `src/motion/fx/transitions.ts`, `src/motion/fx/camera.ts`, `src/motion/page.ts`, new `src/motion/fx/rig.ts` |
| Audio | `scripts/motion-audio.mjs`, new `scripts/audio/*` |
| Finance viz, kinetic type, captions | new `src/motion/viz/*`, `src/motion/captions.ts` |
| Particles, environments, post FX | new `src/motion/fx/particles.ts`, `src/motion/fx/post.ts`, new `src/motion/env/*` |
| Shots | new `src/motion/shots/<name>.ts` (one owner per file) |

Shared files (`core.ts`, `spec.ts`, `shots/index.ts`, `scenes/index.ts`) may only
get small additive edits (use exact-string Edit, never rewrite the file); keep
other agents' lines intact. Never `git checkout`/`git stash`/`git reset` — other
agents are editing the same working tree concurrently. Do not commit; the lead commits.

### Contracts already in place

- `Material` (three.ts) has `ramp?: RampName | string[]`, `emissive?`, `spec?`.
  RampName = mono | bone | steel | ink | chrome | glass | brown | red | green | paper.
- `Cue` (core.ts) has `kind: CueKind` (see `CUE_KINDS`), `pan?` (-1..1), `gain?`, `len?`, `step?`.
- Scene type `shot`: `{type:'shot', duration, shot:'<name>', params?:{...}, sync?, events?, say?, transition?}`.
  `src/motion/shots/index.ts` exports `ShotDef {name, describe, render(frame, props), cues?}`
  and the `SHOTS` registry. Register a shot by adding an import + entry.
  `props.events` holds narration-synced moments `{at, kind}` (seconds in the scene),
  resolved from `sync` words by the audio renderer. Always provide fallbacks.

### Tools

```
cd chatgpt-site
node scripts/motion.mjs shot <spec.json> <out.png> <t> [t...]   # stills / contact sheet
node scripts/motion.mjs render <spec.json> <out.mp4>             # silent video
node --env-file=.env.motion scripts/motion-audio.mjs <spec.json> <out.mp4>   # with voice/music/SFX (costs ElevenLabs credits for uncached clips)
npx tsc -p tsconfig.json --noEmit && npx tsc -p tsconfig.render.json --noEmit
node --test scripts/motion.test.mjs scripts/hedgy.test.mjs
```

Put scratch specs/renders in a scratch dir outside the repo (e.g. `$TMPDIR/motion-v3/<area>/`).
LOOK at your stills (open the PNGs) and iterate until they are genuinely beautiful.
If a typecheck error is in another agent's file, ignore it (they're mid-edit).
