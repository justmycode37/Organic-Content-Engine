# SYSTEM ONLINE — Motion v2

A precise dark command interface with one electric accent. One focal panel changes state instead of accumulating dashboard furniture. The example uses blue; other shared accent palettes and light mode remain supported.

## Visual grammar

- No persistent chrome, clocks, uptime, corner IDs, coordinates, scene counters, tickers or timestamp captions.
- A command packet travels along its connection; arrival lights the destination and changes the panel state. It is not elapsed-scene progress.
- Labels, selected rows and comparison values replace one another. Quantities count once and settle; pipeline stages advance; panels push or morph into the next panel.
- Named `system-panel` layout continuity supports shared Motion v2 transitions. No gratuitous flash, shake or decorative impact.
- Captions stay below the panel, usually three to seven words. Essential authored type never falls below 64px; the final example's sampled nominal minimum is 70px. Keep labels short: Canvas width fitting can compress unusually long values, and prose is limited to its configured line count.

All 22 shared scene types have SYSTEM skins, including `demo`, `predict`, `quantity`, `evidence`, `scale`, `split`, `layers.focus` and `stat.slam`. They use `frame.events` and `frame.hits`; legacy scenes without anchors fall back to bounded timed state changes. `frame.opening` keeps the first-frame hook readable.

## Specials and compatibility

The six existing strict schemas and relational checks remain available. Their v1 chrome is intentionally not rendered:

| Special | Motion v2 rendering |
| --- | --- |
| `update` | Title becomes one change; version/date metadata stays data-only. |
| `process` | One active step replaces the prior step. |
| `dashboard` | Sequential numeric readouts, never simultaneous tiles. Gauge/sparkline fields remain validated but do not draw separate charts. |
| `benchmark` | Baseline and result replace each other in the same panel. |
| `log` | One message at a time; supplied timestamps/status metadata is not displayed. |
| `network` | Validated directed path advances through actor labels with packet-arrival feedback; no whole-topology dashboard. |

Invalid special inputs show a validation checkpoint, not invented data. Essential context belongs in narration/captions when legacy metadata is no longer displayed. Arbitrarily long legacy labels are not guaranteed to satisfy the example's phone-readability budget.

## Example and provenance

`motion-examples/system.json` is a 36-second demonstration: 15 scenes of 2.4 seconds, 118 narration words, 30 word-anchored events and a reward in every scene. The opening exposes 948 immediately; user-to-root permission escalation pays off by the second scene. Subsequent beats distinguish candidates, reproduced findings, working exploits and distinct bugs; compare the July/October research runs; show API cost, human review and patch-status differences; and retain local-access, OpenAI-self-reporting and unreleased-model caveats.

Facts are scoped to the supplied research note and claim ledger, not a fresh primary-source investigation. Narration says “OpenAI says.” Packet movement and process timings are editorial demonstrations, not live system execution. Review exports are not publication approval.

## Verification

Run from `chatgpt-site` with a working Node runtime (verified with Node 25.8.1):

```sh
node --test src/motion/styles/system/system.test.mjs
npm run check
node scripts/styles/system-review.mjs
node scripts/reel-qa.mjs motion-examples/system.json --out-dir ../output/v2/system/qa-visual
node scripts/motion.mjs render motion-examples/system.json ../output/v2/system/system-silent.mp4
node --env-file=/Users/laurenzthummler/Documents/Organic_content/chatgpt-site/.env.motion scripts/motion-audio.mjs motion-examples/system.json ../output/v2/system/system-voiced.mp4
```

`system-review.mjs` emits half-second contact sheets and Canvas text telemetry. The pre-change reference is frozen to commit `0376834`; its word range is the supplied audit, not a newly rendered baseline. Outputs remain uncommitted under `output/v2/system/`. See `V2-REPORT.md` for measured results, advisory warnings and the current voice-provider blocker. The older `system-verify.mjs` is a legacy broad-coverage helper, not the v2 acceptance receipt.
