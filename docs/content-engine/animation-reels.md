# Produce a code-animated Reel

Write a valid `ReelSpec` for the shared motion library in `chatgpt-site/src/motion/`.
The renderer draws every frame from code; this is animation, not generated footage.
Follow the researched format and the brand brief. Do not copy speedy_devv's wording,
assets or identity; use the reference for its fast, visual explanation style.

## Choose the code-animation path

- Choose code animation for mechanism explainers, product releases and changelogs,
  comparisons, and stories carried by numbers. It is the default for PATCH NOTES'
  UNDER THE HOOD series.
- Use generated footage when the story needs real-world imagery, such as a physical
  scene, person, place or authentic product demonstration. Follow `video-production.md`.
- Research the real mechanism and source the claims before writing frames. Never
  invent numbers, benchmarks, quotes, outputs, capabilities or implementation details.
  Keep announcements, shipped features, demos and explanatory models distinct.
- Animation illustrates an explanation; it does not prove a real capability. Label
  hypothetical or simplified diagrams so viewers cannot mistake them for evidence.

## Build the story

- Target 20–45 seconds. Open with a pixel `title` in the first 2 seconds: pose a
  concrete question or tension, not a generic promise.
- Escalate. Each scene adds exactly one idea; each scene caption advances the story.
  Deliver the promised payoff before the `outro`, then use one CTA.
- Keep most scenes 1.5–4 seconds and the average under 3 seconds. The schema allows
  0.8–8 seconds, but do not use those extremes without a clear reason.
- The library handles visible motion at least every 0.4 seconds. Give each beat a
  clear event, vary scene types and transitions, and put `hits` at the moment the
  important thing lands. Never use the same scene type three times in a row.
- Build about 8–12 scenes, including the title and outro. Use `transition` to vary
  entrances (`cut`, `blocks`, `wipe`, `glitch`, `zoom`, `flash`, `shutter`).

## Type, colour and captions

- Use uppercase pixel type for titles, labels, tags and details. Use clean bold sans
  for captions. Captions are white on dark and black on light; never set captions in
  pixel type. Mark only the key word with `*asterisks*`.
- Put exactly one `*marked*` phrase in each title and each caption line, on the word
  carrying the meaning. Use one accent item per scene: one key word, active node,
  winning value or changed line. Keep everything else black, white or grey.
- Every scene needs a caption for sound-off viewing. Use plain spoken words, at most
  about 9 words per line. Captions tell the complete story without the visuals and
  never repeat the on-screen title verbatim. Avoid jargon unless the caption explains it.
- Do not create timed top-level `captions` when per-scene `caption` is sufficient.
  If you use `captions`, they override the per-scene captions and use absolute seconds.

## Choose scenes and respect fields

- `tokens`, `grid`, `layers` and `flow`: model mechanisms, attention, system parts
  and pipelines. Flow has 2–5 nodes; layers 2–6; grid 2–16 rows and columns.
- `code`, `diff` and `terminal`: developer stories. Code is at most 14 lines and
  1,200 characters; diffs have at most 14 removed, added and context lines; terminal
  has 1–6 lines. Keep each line short enough to read on a phone.
- `stat`, `bars` and `compare`: numbers and contrasts. Use a sourced number for a
  stat; bars have 2–6 items; compare each side has at most 5 points.
- `changelog`: releases, with 1–6 short items tagged `NEW`, `FIX`, `CHG` or `DEL`.
- `kinetic`: punchlines, one short word or phrase per beat (1–8 words, max 24 chars
  each). `chat`: prompts and replies, 1–6 messages, max 180 characters each.
- Use `list` for a compact stack (1–5 items), `title` for the opening, and `outro`
  for the final CTA. Keep all strings within the limits described in `spec.ts`.

## Example spec

This sample is a simplified, sourced explanation of next-token prediction. The
visualization is illustrative, not a claim about a specific product's internals.

```json
{
  "version": 1,
  "title": "How a language model picks a next token",
  "mode": "dark",
  "accent": "red",
  "series": "UNDER THE HOOD",
  "scenes": [
    { "type": "title", "duration": 2, "transition": "blocks", "text": "WHY *THIS* WORD?", "kicker": "NEXT TOKEN PREDICTION", "caption": "A model chooses one *token* at a time.", "hits": [1.2] },
    { "type": "tokens", "duration": 2.5, "text": "The small robot", "title": "INPUT TEXT", "caption": "It reads text as a sequence of *tokens*.", "transition": "cut" },
    { "type": "grid", "duration": 2.5, "rows": 4, "cols": 4, "pattern": "attention", "highlight": [[1, 2]], "title": "CONTEXT", "caption": "Earlier *context* helps shape what comes next.", "hits": [1.8] },
    { "type": "layers", "duration": 2.5, "title": "PROCESSING", "layers": [{ "label": "INPUT TOKENS" }, { "label": "MODEL LAYERS", "accent": true }, { "label": "NEXT STEP" }], "caption": "Learned layers *transform* that context." },
    { "type": "flow", "duration": 2, "direction": "right", "packet": "TEXT", "nodes": [{ "label": "CONTEXT" }, { "label": "SCORES", "accent": true }, { "label": "CHOICE" }], "caption": "The model assigns each token a *score*.", "hits": [1.4] },
    { "type": "bars", "duration": 2.5, "title": "CANDIDATES", "unit": "%", "items": [{ "label": "WALKS", "value": 52, "accent": true }, { "label": "RUNS", "value": 31 }, { "label": "SLEEPS", "value": 17 }], "caption": "One candidate may score *higher* than the others." },
    { "type": "stat", "duration": 2, "value": 0.52, "from": 0, "decimals": 2, "label": "ILLUSTRATIVE SCORE", "caption": "These example scores are *illustrative*, not product data." },
    { "type": "tokens", "duration": 2.5, "text": "The small robot walks", "title": "ONE TOKEN ADDED", "caption": "The selected token *joins* the sequence.", "hits": [1.5] },
    { "type": "kinetic", "duration": 2, "words": ["SCORE", "SELECT", "REPEAT"], "caption": "Then the process *repeats* for the next token." },
    { "type": "outro", "duration": 2, "transition": "wipe", "cta": "FOLLOW FOR THE NEXT BREAKDOWN", "handle": "@PATCHNOTES", "caption": "Follow PATCH NOTES for more AI *explainers*." }
  ]
}
```

## Validate and review

- Check the JSON against `chatgpt-site/src/motion/spec.ts`: schema errors are blockers;
  resolve lint errors and warnings before delivery. The linter checks hook, captions,
  accents, outro, pacing, repeated types, transitions, hits and length.
- From `chatgpt-site`, run `node scripts/motion.mjs shot <spec.json> <out.png> 0 2`
  to inspect stills, then `node scripts/motion.mjs render <spec.json> <out.mp4>`.
  Inspect the rendered Reel at phone size; confirm timing, legibility and accent placement.
- Confirm the first frame hooks, every scene adds one idea, the captions explain the
  story alone, the payoff precedes the CTA, all claims have sources, and the visual
  model is clearly illustrative where it is not evidence.
