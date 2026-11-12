# MINI WORLD — causal clay choreography

Procedural isometric Canvas geometry, with one recurring orange robot, human builder and crowd. No downloaded imagery, textures, generated assets or WebGL are required. Set `style: "miniworld"`; light and dark modes share geometry and timing.

## Visual contract

- The world is the focal group, cropped large rather than presented as a miniature beneath a signboard.
- One persistent `MINI WORLD` wordmark; no location pills, clocks, footers, counters, sign poles, progress rails or decorative road tiles.
- Replace the active label instead of accumulating boards. Screen-stable labels stay readable while the camera flies through world geometry.
- Headlines use 96px, explanatory labels 64px, captions 68px, and the secondary wordmark 48px before fit. Keep authored copy short enough to avoid font fitting.
- Neutral clay, ink, sage shading and a rusty orange story accent; red exists only as the lab's unresolved alarm state.
- Towers use a shared proportional scale. Exact numbers snap to the narrated state while geometry changes; intermediate heights are animation, not newly measured counts.

## Cast and fixed places

**BIT** is always the same ink-coloured cube robot, with a light screen face, two square eyes, an accent antenna bulb and dark feet; the accent itself stays reserved for the story object BIT carries or meets. **ADA** wears a sage jacket, pale head and builder's cap; her working arm installs the patch. **THE CROWD** uses smaller figures without caps. These are fictional explanatory actors, not claims about the people who discovered or patched the real bugs.

The fixed coordinate map in `choreography.ts` contains **SERVER CITY** (server rack and access wall), **THE LAB** (ADA's workbench and alarm rack), **THE MARKET** (counts, inventory and funnel), **CAPITOL** (source/evidence building), and **THE HARBOR** (departure boat and crowd).

## Event vocabulary

| Mechanism | Named event targets | Visible consequence |
| --- | --- | --- |
| Gate / `demo` | `wall`, `key`, `gate`, `travel` | BIT approaches and recoils; the key drops; the wall sinks; BIT crosses. |
| Repair / `diff` | `patch`, `lights`, `travel` | ADA reaches and installs a tile; five red lights settle to pale clay; BIT moves onward. |
| Funnel / `bars`, `scale` | `level-1` through `level-3` | Funnel posts narrow; removed blocks fall away; retained tower height follows the value. |
| Workflow / `flow` | `station-1` through `station-4` | Camera traverses the workstations; cargo passes from scouting to human review. |
| Prediction | `cargo`, `answer`, `connect` | A physical delivery accompanies the question, answer and resolved state. |
| Quantity | `subset`, `connect` | A real subset is extracted from scaled tokens, then replaced by the comparator. Partial token volume preserves the exact quantity. |
| Evidence | `evidence`, `connect` | Source identity becomes the attributed claim, source and date. |
| Difference | `compare`, `answer` | One common-scale tower changes from found bugs to upstream fixes, then displays the caveat. |
| Focused layers | `focus` | Only the selected component physically extracts from the stack. |
| Number slam | `amount`, `connect` | Cargo lands with a brief material compression, then connects to its destination. |

`beatAt` prefers a matching resolved event, then a supplied event by index, then `frame.hits`. Proportional timers remain only as compatibility fallbacks for older specs without events. Numeric `at` timestamps from the voice pipeline override silent word-position estimates. No randomness, persistent simulation, idle hopping or decorative global shake is used.

## Camera and object continuity

Every shared scene installs `actorLayout` before the shared camera runs. It declares named `BIT` and `place` placements. BIT starts at its previous scene's final rectangle, then physically approaches its next destination. The same deterministic renderer consumes that rectangle; camera `track` follows `BIT`, and `fly` lands on `place`. Labels are screen-stabilized independently of world-camera movement.

The `place`, `stack`, and `journey` specials register named MINI WORLD placements before camera and transition work. Their `BIT` anchor supports continuity into adjacent scenes; `place` and `stack` also expose focal regions for explicit camera targets. Other specials that do not declare a layout retain their existing rendering behavior.

## Example and verification

`motion-examples/miniworld.json` is a 14-scene, 35-second silent demonstration. Every scene has narration, spoken-word event anchors, a reward and a named camera target. It retains source attribution, the local-access requirement, the unreleased-model caveat, and the distinction between discovered bugs and upstream fixes. Numeric sourcing remains in `motion-examples/patch.claims.json` and the supplied research brief.

Run from `chatgpt-site`:

```sh
node --test src/motion/styles/miniworld/miniworld.test.mjs
node scripts/styles/miniworld-qa.mjs
node scripts/reel-qa.mjs motion-examples/miniworld.json --out-dir ../output/v2/miniworld/final --cover
node scripts/motion.mjs render motion-examples/miniworld.json ../output/v2/miniworld/miniworld-silent.mp4
npm run check
```

The scoped QA script captures 70 deterministic half-second frames, six contact sheets, actual Canvas text calls/font sizes and before/after event pairs. The independent reel QA uses OCR and pixel heuristics: geometry mistaken for text must be reported, not silently waived. See `V2-REPORT.md` for measured results and the voice-render blocker. All generated evidence belongs under `output/v2/miniworld/`, not in the commit.
