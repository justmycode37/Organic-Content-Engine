# BIG IDEA v2

A radically reduced moving magazine cover: one thought, one motif, decisive changes. Calm composition is not a slow tempo.

## Select and compose

Set `"style": "bigidea"`. Paper light mode and red are defaults; dark mode and other engine accents remain supported. The example runs 38.4 seconds: sixteen 2.4-second scenes, 32 spoken-word anchors, and a reward on every scene.

- No masthead, folio, page counter, progress line, footer, or source ribbon. No persistent chrome.
- One focal group plus its unit and caption. Replace thoughts rather than stacking panels.
- Author for at most 14 visible words, including the caption; essential text starts at 64px or larger. Long arbitrary input can still shrink to fit, so QA each new spec.
- Hero numerals use up to 360px; source/unit labels use 90–108px, captions 68px. Numerals settle immediately rather than counting through invented values.
- Paper/ink, dark neutral text, one red accent, muted supporting text. Light red is darkened to retain text contrast.

## Motion grammar

`layout.ts` reads resolved `frame.events` directly. `change(frame, index)` eases a 240ms event response; `stage` replaces content at event anchors. Unanchored legacy scenes use duration-derived fallback beats. The style does not import the player at runtime, avoiding a registry import cycle.

Numbers slam, units receive the next emphasis, 166 grows into 948, and a dot becomes a machine boundary. The second event pushes into that boundary; a filled square opens into a frame. Word-anchored thought replacements carry the caveats. Camera breathing is limited to 3%, with restrained hit punches and no shake. Related shots use the engine's morph/push/slide transitions; cuts preserve magazine pacing.

All 22 shared scene types are skinned. Sequential renderers replace one line/item/command at a time. A title that leads with a number (`*948* Linux bugs`) opens as a full-size numeral and swaps in its `sub` on the first event. `stat` with `versus` replaces the prior value (ink) with the current one (accent); `bars` is a narrowing funnel, one number at a time with a bar that shrinks between values. Semantic renderers cover contact → consequence (`demo`; an action such as `blocked` makes the actor recoil off a thickening wall), guesses → answer → comparison (`predict`), subset → remainder (`quantity`), source/quote emphasis (`evidence`), area-true discs where the first level stays inside the growing ring (`scale`), left → right → summed answer (`split`), exploded/focused `layers`, and `stat.slam`. Shared skins register the `idea` anchor at the hero they actually draw, so `push` and `morph` land on the visible object.

Six strict specials remain: `cover`, `numeral`, `contrast`, `quote`, `object`, `statement`. All support bounded input; unknown fields are rejected. A numeric cover may encode its number and subject together as `"headline": "948\nLinux bugs"`; it is full size on frame 0. `contrast` strikes the prior value through, holds it briefly, then replaces it; a value such as `$3,094/exploit` keeps its denominator in the data and shows it in the label. Multi-line statements are successive thoughts, not simultaneous paragraphs. `fullBleed` is a motif-scale option, not permission to add chrome.

## Evidence boundaries

Only the supplied November 11 research and claim ledger inform the example. It attributes results to OpenAI, states local access is required, and identifies the model as unreleased. July's 166 is labelled **exploits**, while October's 948 is labelled **distinct bugs**: no growth ratio is shown, and the per-exploit and per-bug cost estimates are labelled with their different units. 61 landed plus 43 staged yields 104 fixes, not 104 independently mapped patched bugs. No unsupported subtraction from 948 is shown.

The supplied research records an inaccessible primary article. No fresh verification, publication clearance, or measured audience-performance improvement is claimed.

## Reproduce

Run from `chatgpt-site/` with dependencies installed and Chrome, FFmpeg, and Tesseract available:

```sh
export PATH="$HOME/.nvm/versions/node/v25.8.1/bin:$PATH"
node scripts/styles/bigidea-check.mjs
node scripts/reel-qa.mjs motion-examples/bigidea.json --out-dir ../output/v2/bigidea/final
npm run check
node scripts/motion.mjs render motion-examples/bigidea.json ../output/v2/bigidea/bigidea-silent.mp4
node --env-file=/Users/laurenzthummler/Documents/Organic_content/chatgpt-site/.env.motion scripts/motion-audio.mjs motion-examples/bigidea.json ../output/v2/bigidea/bigidea-voiced.mp4
```

The style check records before/after timing metrics, parses/lints the example, checks all 22 shared skins and six strict specials in both modes, verifies deterministic rendering and balanced canvas state, measures actual text calls every 100ms, and generates contact sheets every 500ms. Outputs stay under `output/v2/bigidea/` and are not committed. Render-level OCR/event detectors are heuristic; their pass is not proof of semantic comprehension.

The configured ElevenLabs review voice currently returns `voice_missing` (HTTP 404). Do not substitute a different voice, bypass voice-health checks, or bypass the legacy rights HOLD. A silent render is not a voiced render; an available approved voice is required to complete that deliverable.
