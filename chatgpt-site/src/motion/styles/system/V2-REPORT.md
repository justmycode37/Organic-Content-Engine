# SYSTEM Motion v2 implementation report

Date: 2026-11-12. Branch: `t3/system-interface-restyle`. The commit containing this report is the implementation delivery; no push is requested.

## Changes

Removed the status clock/uptime, update metadata, corner IDs, grid/coordinate decoration, transcript-style timestamps, persistent microtext and multi-tile dashboards. Replaced the chrome-heavy framing with a dark single-panel command object, one electric accent, traveling packets, arrival-node feedback, event-driven replacements, count-and-settle values and named panel push/morph continuity. All 22 shared skins and six specials follow the same grammar; schemas remain strict. No shared foundation files changed.

Rewrote the 948 Linux story as 15 scenes × 2.4 seconds, with early user-to-root demonstration, 30 word-anchored events, rewards throughout and explicit OpenAI attribution. Preserved candidate/reproduction/exploit/root-cause distinctions, API-credit versus invoice distinction, human review, local-access requirement, self-reported figures and the unreleased research model caveat.

## Before / after measurements

| Measure | Before | After |
| --- | --- | --- |
| Readable words | Supplied audit: 32–59/frame | Canvas telemetry at 72 half-second samples: 6–12; separate QA OCR sample maximum: 14 |
| Persistent chrome | Supplied audit: about 10 groups | 0 authored; QA estimate 0 |
| Explicit event declarations | Frozen base spec: 0 | 30, or 8.33 per 10 seconds |
| Events including scene entrances | Not measured | 45, or 12.50 per 10 seconds |
| Maximum declared-event/entrance gap | Not measured | 1.20 seconds |
| Nominal sampled font minimum | Not measured | 70px |
| Duration | Base spec: 36.2 seconds | 36 seconds / 1,080 frames at 30fps |

These are bounded sample measurements, not exhaustive framewise proofs. The old implicit-motion rate was not measured; zero authored events does not mean zero old animation. Event-density figures count authored anchors/entrances, not independent human judgments of narrative novelty. QA detects visual changes around all 30 anchors, but is a pixel-difference heuristic.

## Validation and visual review

- Example parses with zero lint errors and zero warnings.
- Seven SYSTEM tests pass, including shared-skin coverage, schema relationships, event-state replacement, authored outro copy, caveat/reward/event example checks and empty shared inputs.
- TypeScript passes. Final `npm run check`: 144 passed, 0 failed, 0 cancelled. An earlier attempt cancelled one browser-renderer test after a launch timeout; the complete retry passes.
- Visual-only reel QA: PASS, zero hard failures; frame-zero coverage 100%, OCR hook match 75% against its 60% threshold; zero safe-zone intrusions; maximum OCR words 14; all 30 event anchors show sampled changes.
- One visual advisory remains: 20 OCR regions fall below heuristic essential/secondary box-height thresholds. Nominal sampled fonts are at least 70px; nominal font size is not equivalent to OCR ink height. QA reports zero caption-line detections, so its caption-specific check is not evidence of complete caption coverage.
- Inspected all three final half-second sheets (72 frames, t=0 through 35.5s). Labels and captions remain separate, source/date attribution is visible, and quantities, process stages and permissions replace rather than accumulate. The final packet/arrival markers and captions are enlarged compared with the first review pass. No visible clipping or caption overlap found in these samples.

## Review artifacts

Paths relative to the worktree root:

- Silent MP4: `output/v2/system/system-silent.mp4` — successfully rendered, 1080×1920, 30fps, H.264/silent AAC, 36 seconds.
- Half-second sheets: `output/v2/system/system-half-second-1.png`, `system-half-second-2.png`, `system-half-second-3.png`.
- Text/event telemetry: `output/v2/system/system-review.json`.
- Visual acceptance: `output/v2/system/qa-visual/system.qa.json` and `system.qa.md`.
- Video/audio QA: `output/v2/system/qa/system-silent.qa.json` and `system-silent.qa.md`.

The silent MP4 intentionally fails the narration-silence gate when supplied to audio QA: one silence gap overlaps narrated scenes, integrated loudness −70 LUFS and true peak unavailable. This is not a voiced-delivery pass. Visual QA is run separately without the silent-video audio stream.

## Blockers and limitations

The required voiced render was attempted with the configured `.env.motion`. ElevenLabs health check returned HTTP 404, `voice_missing`: “ElevenLabs no longer exposes the configured voice or model” for the configured voice endpoint. No voiced MP4 was produced. This is the actual provider blocker, not a claimed legacy rights HOLD. No voice substitution or rights bypass was attempted. Voiced timing, alignment, loudness and final audio QA remain unverified until the configured voice is restored or an authorized replacement is provided.

Legacy dashboard gauge/sparkline visuals intentionally become numeric sequential readouts. Long external labels may compress or exceed the limited prose lines; keep authored copy within the demonstrated budget. No foundation change is needed for this bounded example. Source verification and publication approval remain separate gates; this task neither updates the factual research nor publishes content.

## Review pass (2026-11-12)

Findings: every scene was the same small 768×520 panel with a 48 px square sliding along a line; the camera hook was a
no-op, so events produced text swaps without a physical consequence. Captions silently dropped words when they did not
fit two lines ("…scanned the Linux", "…stage by"). The demo showed "root" before the exploit packet arrived. Facts:
"July found 166 bugs" mislabelled 166 root exploits as bugs, "under half the cost per bug" compared per-exploit with
per-bug costs (a contested ratio in the ledger), and the funnel numbers appeared twice (bars and quantity).

Fixes: the panel now fills the content zone (888×680, above the right action rail) with 208 px hero values; every
event anchor triggers a state-replacement slide, a scan sweep, an accent-bar pulse and a camera punch-in; contact on
the output port fires a ring; the demo packet carries the actor name ("exploit") and the account turns to root only on
contact; quantity cells drop out on the subset event. Captions are 88 px and never drop words. The example replaces the
duplicate funnel with an OpenAI "user equals root on unpatched systems" beat, labels July as exploits and October as
bugs, shows per-exploit versus per-bug costs as "Units differ", uses $1,279 (ledger value) and adds attribution.

After: lint 0 errors / 0 warnings; reel-qa PASS with 0 hard failures and 0 advisories (OCR max 13 words, 0 small
regions, 0 safe-zone intrusions); 31 declared events (8.6/10 s, 12.8/10 s with entrances), max gap 1.2 s; minimum
drawn font 72 px. Claims-check still fails on the ledger's contested 948/1,169 claims (shared with patch.json) and on
the two split values, whose unit cannot carry a "per exploit/per bug" denominator.
