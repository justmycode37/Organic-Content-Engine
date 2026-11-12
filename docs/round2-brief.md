# Round 2 brief (all agents)

v1 scored visuals 4/10, story 5–6/10, sound 5.5/10. Read `docs/reviews/v1.md` (the review digest) — it is
your to-do list. Also re-read `docs/shot-bible.md` and `docs/motion-v3.md` (ownership rules; never git
checkout/stash/reset/commit; others edit other files concurrently).

## What changed since v1
- NEW NARRATION (spec `chatgpt-site/motion-examples/hedgy-squeeze.json`, field `say` per shot) and NEW SYNC
  WORDS. `props.events` kinds are now the new sync words (e.g. shot 1: `sells`, `his`).
- Real timed spec (actual shot durations + event times from the voice): `docs/showcase-timed-spec.json`.
  Durations now: 1 borrowedasset 2.37 · 2 shortsalehandoff 3.83 · 3 pricestair 2.57 · 4 vaultlock 2.47 ·
  5 waitclock 1.73 · 6 announcement 1.97 · 7 crowdrush 1.97 · 8 priceride 2.13 · 9 collateralcall 1.83 ·
  10 forcedbuyback 1.73 · 11 buybackhandoff 1.30 · 12 minimarket 2.70 · 13 demandfeedback 2.67 ·
  14 squeezerocket 3.40 (total 32.7 s). Render with the TIMED spec so you see real timing:
  `node scripts/motion.mjs shot ../docs/showcase-timed-spec.json out.png <reel-time> ...` and
  `node scripts/motion.mjs render ../docs/showcase-timed-spec.json out.mp4` (silent full reel, ~30 s render).
  To render only your shots, copy the timed spec to your scratch dir and keep just your scenes (+ neighbours).
- Transitions changed: 2→3 whip down, 11→12 push up, 12→13 whip up. Others as before.
- Ticket colours are now neutral grey; the `paper` ramp is neutral grey.

## The bar
The owner must be blown away. Every shot must: SHOW the action unmistakably (cause → effect, sound off),
keep Hedgy fully in frame and acting (pose changes on beats), have the camera moving with purpose,
fill the frame with depth (foreground passes), change something meaningful every 0.3–0.6 s, and never
end on a static hold (the final frames of each shot still move). Keep sound cues SPARSE: per shot
typically 2–4 cues — one per real action, on the sync events; no machine-gun ticks.
