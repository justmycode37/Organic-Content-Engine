# PROOF ROOM v2 implementation report

Date: 12 November 2026. Branch: `t3/proof-room-evidence-theater`.

## Removed and added

Removed the investigation dashboard: rulers, folios/case IDs, evidence counters,
clock/progress ornament, footer/readout, small mono labels and decorative camera
shake. There is no persistent chrome. Paper, black text and yellow marker carry
the example.

Added native-pixel source camera travel, word-anchored multiply highlights and
replacement verdicts. The count paragraph moves to **separate patches** before
five seconds, and later to **researchers checked**. Source domain/date stay
visible beside the capture; full URL, timestamps and original text are retained
in `motion-examples/assets/proof/SOURCES.md`. No source image was altered.

All 22 shared scene types are locally skinned. Semantic skins preserve quantity
remainder/comparator, prediction correction/comparison and reference scale;
the six existing special names remain available. Quote windows retain every
supplied word even when the event array is shorter than the quote.

## Before / after

| Measurement | Before | After |
|---|---|---|
| Readable words/frame | 38–60, supplied owner audit | OCR maximum 14 across 62 QA samples |
| Persistent chrome | About 9 groups, supplied audit | 0 detected |
| Example duration | 35 seconds | 37.5 seconds |
| Declared semantic events | 0 | 32 |
| Declared event rate | 0/s | 0.853/s; 8.53 per 10 seconds overall |
| Detected event changes | Not measured | 32/32 using the QA pixel-difference heuristic |

The old version had timed entrances and animation: zero declared events does
**not** mean zero old visual motion. The baseline QA attempt did not complete;
its partial contact sheet is not a measured baseline gate. Do not present the
supplied audit as newly recomputed OCR.

## Validation

- `npm --prefix chatgpt-site run check`: PASS; typecheck, build, artifact
  validation and 144 shared tests. An earlier run timed out in the unattended
  renderer test; the final full run passed all 144 without code changes there.
- `node --test scripts/styles/proof.test.mjs`: PASS, 11 tests.
- Example parse/lint: zero findings.
- Final reel QA: PASS, zero hard failures, one advisory warning.
- Frame zero: all three hook words detected; 100% reference coverage/match.
- Safe zones: zero sampled intrusions. Maximum OCR load: 14 words.
- Visually inspected all 75 half-second contact frames, from 0 through 37s.
  Corrected a split qualifier and a clipped source edge, then regenerated and
  inspected the final contact sheets. This is implementer QA, not independent QA.
- Silent render probed as H.264/AAC, 1080 × 1920, 37.500 seconds, 1125 frames.

## Review artifacts

All paths below are relative to this worktree, ignored and not committed:

- `output/v2/proof/proof-silent.mp4`
- `output/v2/proof/contact-00-12.png`
- `output/v2/proof/contact-12-25.png`
- `output/v2/proof/contact-25-37.png`
- `output/v2/proof/qa/proof.qa.md` and `proof.qa.json`
- `output/v2/proof/tests.log`, `check-final.log`, `silent-probe.json`
- `output/v2/proof/voiced.log` records the voice provider failure.

## Open issues / publication boundary

1. **Voiced render unavailable.** The prescribed command failed before synthesis
   with `VoiceProviderError: voice_missing`: ElevenLabs returned HTTP 404 for
   the configured voice endpoint `/v2/voices/TtRFBnwQdH1k01vR0hMz`. No alternative
   voice, shared config edit or rights bypass was attempted. Consequently
   `proof-voiced.mp4` does not exist, actual speech timing is unverified and the
   expected legacy-voice rights HOLD was not reached. The owner must restore or
   approve a usable configured voice and rerun the supplied command.
2. **Legibility advisory remains.** The final OCR checker flags 102 sampled text
   regions below its heuristic essential/secondary glyph-box heights. Declared
   example typography uses 64px captions, 48px source/date and larger focal
   text, but declared font size is not equivalent to OCR glyph height. This
   warning is not waived as a proven false positive; phone review is still useful.
3. Primary OpenAI page remains unverified in the supplied research. The model
   was unreleased, counts are OpenAI's own and the warning is conditional on
   local access, an unpatched system and a well-resourced threat actor. No
   independent exploit validation or publication clearance is claimed.

## Review round (12 November 2026)

Verdict on the version above: minimal but not lively. It was 15 near-identical
text cards: words appear, a marker sweeps, then an underline. The evidence was a
three-word crop without its page. The SecurityWeek quote capture was not used;
three title cards paraphrased the warning instead. Captions were editor notes
("Keep the threat qualifier"). Each `slide` cut showed a blank grey frame. The
1,169/948 comparison was never on screen.

### Changes

- **Clause reading on the real capture.** `exhibit` now takes `clauses` (word
  boxes in original pixels) and `held`. The camera flies clause to clause on the
  spoken anchors and pulls back mid-flight on long jumps. Only the clauses being
  read are uncovered, and the marker presses onto the exact words. The count
  paragraph is read as *OpenAI says → 948 → separate patches*, then *researchers
  checked → the exploits and fixes*. The warning quote is read across two scenes,
  from *low-privileged* to *well-resourced threat actor*. Its full qualifier is
  shown verbatim from the capture, including the clause that wraps across lines.
- Captures are composited with `multiply` over the paper with the marker under
  the ink. Glyph pixels are untouched and nothing is re-typeset.
- `stat.versus` lands the comparator (948 bugs) under 1,169 working exploits.
  `predict` locks the wrong guess, strikes it, lands the answer, then the reason.
- Cuts by default. The style transition is a single marker stroke and never
  covers the frame. The `push`/`whip` placeholder frames are gone.
- Example rewritten: 12 scenes, 29.2 s, hook *948 ways to root Linux?* readable
  at t=0 with the marker on 948 by 0.6 s. Narration is about 2.9 words/s with
  OpenAI attribution and no quotation marks around paraphrase. Captions are
  viewer-facing, at 88–90 px.
- Marker yellow is now `#FFF500`. It is brighter and close to the paper's
  luminance, so the QA contrast heuristic reads ink-on-marker correctly.

### Numbers

| Measurement | Implementer version | After review |
|---|---|---|
| Duration / scenes | 37.5 s / 15 | 29.2 s / 12 (mean 2.43 s) |
| Declared events | 32 (two per scene, same pattern) | 25, all detected by QA |
| Rolling event rate incl. entrances | not checked | 12–14 per 10 s; max gap 1.2 s |
| OCR words/frame (max) | 14 | 14 (51 samples) |
| Text-size advisory regions | 102 | 4 |
| Real capture on screen | 3 short crops, 1 asset | 4 scenes, 2 assets, 10 clauses |
| Lint | 0 findings | 0 findings |
| Reel QA | PASS, 1 advisory | PASS, 2 advisories |

### Remaining

1. Text-size advisory (4 regions): in two scene-4 samples Tesseract misses the
   marked capture clause. The 60 px source/date line is then classed as
   essential (55 px glyph box). Text-clipping advisory: page lines slide past
   the frame edge during camera flights, by design.
2. `claims-check` reports the capture date "captured 11 Nov 2026" as an
   unsupported number (and its year as an unattributed publication year). This
   is provenance metadata, not a story claim. Removing it would weaken integrity.
   Fix in the checker (skip `date`) or the ledger, outside this style.
3. Voiced render not produced: the voice health check stops because the
   ElevenLabs key lacks `models_read`. The health check and the rights gate were
   not bypassed. Word anchors use silent ordinal timing until voiced.
4. The second half (cost, limits, primary-source caveat, verdict, CTA) is still
   text-card driven. A stronger version would end on the marked quote capture
   instead of a separate verdict card.
