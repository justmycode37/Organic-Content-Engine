# PROOF ROOM — Motion v2

Paper, black type and one marker colour. The source is the subject, not a prop
inside a fabricated investigation interface. No rulers, case IDs, evidence
counters, mono microlabels, timer, footer or persistent chrome.

## Choreography

- The opening claim is readable at time zero; no build-from-blank intro.
- `frame.events` drive clause travel, marker presses and verdict replacement.
  Without anchors, deterministic local timing keeps previews usable.
- The `exhibit` special with `clauses` reads a real capture like an editor. The
  camera flies from clause to clause on the spoken anchors, and only the clauses
  being read are uncovered. The marker lands on the exact source words.
  Earlier clauses stay marked, and `held` carries them into a second scene on the
  same capture. A clause wrapped onto the next line is one clause with two boxes.
- Captures are composited with `multiply` over the paper. The page's white
  becomes the reel's paper and the glyph pixels stay untouched. The marker lies
  under the ink, so the text is never re-typeset. A line sliced by the paper's top
  or bottom edge stays covered; sideways the page may slide out of frame.
- Text scenes replace the focal group rather than adding another card. A stat
  with `versus` pushes the number up and lands the comparator under it. A
  prediction locks the wrong guess, strikes it, lands the answer and then gives
  the reason.
- Cuts are the default. The style's own transitions draw one marker stroke
  across the cut and never cover the frame.

The example is 12 scenes and 29.2 seconds before voice timing. It visits the count
paragraph twice: first **OpenAI says … 948 … separate patches**, then
**researchers checked … the exploits and fixes**. It reads the warning quote
across two scenes, ending on **well-resourced threat actor**. Every clause is in
native pixels from `securityweek-948.png` / `securityweek-quote.png`.

## Integrity

See `motion-examples/assets/proof/SOURCES.md` for the complete source URL,
capture timestamps and verbatim capture text. Every capture scene shows the
domain and capture date. The warning is shown verbatim from the capture,
including the full qualifier. The narration paraphrases it as attributed speech
and uses no quotation marks. The model was unreleased and the numbers are
OpenAI's own. The supplied research could not retrieve the primary OpenAI page.
The verdict is **reported, not independently verified**.

The `quote` special shows every word in consecutive six-word reading windows;
short event arrays cannot drop the final qualifier. Authors must still provide
a verbatim quote, complete qualifier, adequate reading duration and source.
Do not put a paraphrase in quotation marks. Crops are navigational windows,
not evidence that omitted context does not exist.

## Specials

Six existing names remain schema-compatible: `claim`, `exhibit`, `quote`, `board`,
`timeline`, `verdict`. Legacy case/label/loupe fields are accepted but not drawn.
`board` and `timeline` show one attributed record at a time. `exhibit` accepts
normalized `focus` and `destination` crops plus an optional provenance `url`.
Both rectangles must fit inside the capture. For clause reading it takes
`clauses`: 1–6 clauses, each with 1–3 `[x, y, w, h]` word boxes in original
capture pixels. `held` counts the clauses that are already marked. A capture
exhibit needs no `text`; keep the verbatim text in `SOURCES.md`. `highlight` must
occur verbatim in `text`. None of these fields authorizes changing source pixels.

## Validation and review

Run from `chatgpt-site` with a working Node runtime:

```sh
node --test scripts/styles/proof.test.mjs
node scripts/reel-qa.mjs motion-examples/proof.json --out-dir ../output/v2/proof/qa
node scripts/motion.mjs render motion-examples/proof.json ../output/v2/proof/proof.mp4
```

Review renders and contact sheets are runtime artifacts, not source assets.
OCR/pixel QA is heuristic and does not establish factual accuracy, rights
clearance, viewer comprehension or performance. A legacy narration rights HOLD
is review-only; do not publish or bypass it.
