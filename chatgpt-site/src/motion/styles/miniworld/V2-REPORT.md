# MINI WORLD v2 implementation report

## Scope and implementation

All changes stay within the miniworld style, its example and its scoped QA script. No shared foundation, claim ledger, provider configuration or downloaded assets changed.

- Replaced postcard-style scene compositions with large mechanism close-ups and fixed district coordinates. Removed small location signs, street ornaments, footer/folio chrome, simultaneous label accumulation and ornamental idle motion. MINI WORLD is the sole persistent chrome item.
- Added shared `actorLayout` declarations for `BIT` and `place`. BIT inherits the previous scene's exact final object rectangle before moving to the next destination; track/fly cameras consume those named placements. World geometry moves independently of screen-stable headings.
- Added word-event-driven contact/recoil, falling key, sinking wall and crossing; narrowing funnel with discarded tower fragments; ADA patch installation and five red-to-calm lights; workflow cargo handoff; fractional-volume quantity tokens; evidence and prediction reveals; found/upstream comparison; focused layer extraction; and cargo impact for number slams.
- All six legacy specials remain schema-validated and renderable. Shared scenes cover demo, predict, quantity, evidence, scale, split, layers.focus and stat.slam.
- Rewrote the example as fourteen 2.5-second scenes, 35 seconds total, with rewards and 36 spoken-word event anchors. OpenAI attribution, local access, unreleased model, and found-versus-fixed caveats remain explicit. The repair caveat holds from “Not,” rather than appearing only on “fixed.”

## Measured before and after

The baseline is the pre-edit example and captured QA under `output/v2/miniworld/before/`, not the older ecosystem audit. OCR and Canvas-call instrumentation are different measurements and are not interchangeable.

| Measurement | Baseline | Final |
| --- | --- | --- |
| Duration | 36.6 seconds | 35 seconds |
| Maximum OCR words/frame | 19, across 51 sampled frames | 13, across 58 sampled frames |
| Frames exceeding 18 OCR words | 6 | 0 |
| Maximum actual Canvas-drawn words | Not instrumented | 12, across 70 half-second frames |
| Persistent chrome estimate | 1 | 1 |
| Declared word events | 0 | 36; all 36 have a sampled visual change |
| Rolling semantic events/10 seconds, entrances included | 3–4 | 12–17 |
| Maximum declared/implicit event gap | 3.80 seconds | 1.25 seconds |
| Independent reel QA | FAIL: 9 hard failures, 43 advisories | PASS: 0 hard failures, 8 advisories |
| Sampled UI-mask geometry intrusions | 45 | 8 |

Final Canvas instrumentation measures a minimum 64px non-wordmark font after transforms. Headings are authored at 96px, detail labels at 64px, captions at 68px and the secondary wordmark at 48px. Font sizes are not the same as OCR glyph-box heights.

## Verification

- `node --test src/motion/styles/miniworld/miniworld.test.mjs`: 11/11 pass. Includes explicit event/hit retiming, previous-object continuity, voice numeric timestamps overriding estimated word positions, deterministic geometry, empty inputs and six special schemas/renderers.
- `npm --prefix chatgpt-site run check`: passes type checking, build, validation and all 144 tests on final source.
- Scoped browser QA: 70 deterministic half-second frames; 36/36 changed event pairs; maximum 12 actual drawn words. All six contact sheets were visually inspected, including the updated repair caveat sheet.
- Independent `reel-qa.mjs` on final spec: PASS, 0 hard failures, 8 advisories; opening hook recognized at frame zero; maximum 13 OCR words; 36/36 detected events. Pixel-change detection establishes change, not causal correctness by itself.
- Final silent MP4 rendered after the last example edit: 1,050 frames, 35 seconds. Container geometry/codec were separately checked with ffprobe; independent reel QA is spec/frame QA, not an audio certification.

## Remaining warnings and limits

- Lint: zero errors, two warnings. Rolling activity reaches 17 events/10 seconds versus the 8–14 target; longest hold is 1.25 seconds versus the 1.2-second default. No idle decoration was added just to satisfy the counter.
- Independent QA advisories: 88 OCR regions below heuristic role-based glyph heights, six contrast detections on geometry-like OCR strings, and eight frame/zone geometry overlaps. Actual Canvas text sizes pass the authored font budget. These OCR/pixel warnings remain in the evidence; they are not waived as proof of universal device legibility or platform readiness.
- Close-ups intentionally crop world geometry. Camera framing and identity continuity are tested, but there is no measured full-frame occupancy threshold or audience/retention validation.
- Foundation request: special scenes bypass the shared layout hook and `SpecialScene` exposes no layout API. They cannot supply named object placements before the camera runs. The example uses shared scene types throughout to preserve BIT continuity; a future shared-foundation change is needed for the same guarantee in specials.
- The required voiced render was attempted using the prescribed environment file. ElevenLabs provider health failed with `VoiceProviderError: voice_missing` (HTTP 404 for the configured voice). No voiced MP4 was produced. No voice substitution, rights bypass or stale audio reuse was attempted. A valid approved configured voice is required before real spoken-word synchronization, audio mix, loudness or narration-duration QA can be claimed. Silent anchors use estimated word positions; the numeric timestamp override path has a regression test.

## Local review artifacts

All paths below are relative to this worktree and are deliberately uncommitted:

- `output/v2/miniworld/miniworld-silent.mp4`
- `output/v2/miniworld/contact-1.png` through `contact-6.png`
- `output/v2/miniworld/browser-qa.json`
- `output/v2/miniworld/final/miniworld.qa.md` and `miniworld.qa.json`
- `output/v2/miniworld/final/miniworld.contact.png`, `cover.png`, `grid-preview.png`
- `output/v2/miniworld/before/miniworld.qa.json`

Branch: `t3/miniworld-cause-consequence`. The handoff message supplies the final commit hash; nothing is pushed.

## Review round (on `motion-styles`)

Owner verdict for this round: too many elements, boring, too little happens. Findings and fixes:

- **Facts.** The `scale` scene compared July's 166 *root exploits* with October's 948 *distinct bugs* and labelled both "bugs". It now compares like with like: 166 → 1,169 root exploits, attributed ("OpenAI says"). The cost-per-bug scene was removed: it set July's cost per unique root exploit against October's cost per distinct bug, a cross-unit ratio the claim ledger flags. The stat narration now attributes the $1.21M to OpenAI. The evidence date reads `NOV 4, 2026`. The example is 13 scenes, 32.5 seconds.
- **BIT identity.** BIT was an accent-red cube, indistinguishable from the red cargo, key and tower blocks it interacts with. BIT is now an ink-coloured robot with a light screen face, two blinking eyes, visible feet and an accent antenna bulb. The accent is free again for the story object, and BIT reads as the same character in every scene and through every track/fly move.
- **World.** Every close-up stands on a district plinth whose clay lip shows the miniature edge, so objects no longer float on blank paper.
- **Broken states.** The slam stat no longer shows a fake `$0.00M` before the number lands; the sign names the quantity, then the value replaces it. The split answer replaces the label (`61 / NOT ALL FIXED`) instead of producing `NOT ALL FIXED REPAIR`. The quantity scale reads `1 DRUM ≈ 128` in full contrast below the pile, and the extracted subset drum moves to the front left where BIT no longer covers it.
- **Layout.** Two-row headings drop 40 px to clear the wordmark. Detail labels are 72 px. The patch and quantity close-ups shift left, away from the right-hand UI column.
- **Preview bug.** Headings reset the canvas to the identity transform, which blanked scaled previews and `motion.mjs shot` contact sheets. They now return to the screen transform recorded before the camera runs.

Numbers after this round: reel QA PASS, 0 hard failures, 4 advisories (from 8); OCR maximum 13 words over 54 samples; 34/34 declared events with a visible change; frame zero shows the full hook. `scripts/styles/miniworld-qa.mjs`: 65 deterministic half-second frames, maximum 13 drawn words. `npm run check`: 145 tests pass.

Remaining advisories: the 48 px `MINI WORLD` wordmark measures below the OCR heuristic glyph height (it meets the contract's 48 px font floor for secondary text); OCR reads BIT's face as two 3.3:1 glyphs; nine low-coverage geometry intrusions (≤ 0.94 %) into the right-hand UI column from the gate wall, patch rack and drums. `claims-check` still reports the ledger-level contested-claim blockers shared by every example, plus two false positives on event target names (`level-2`, `station-2`).
