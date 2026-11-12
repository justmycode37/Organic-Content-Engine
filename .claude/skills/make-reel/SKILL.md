---
name: make-reel
description: Orchestrate the PATCH NOTES Reel production loop from a sourced story through claims, format, hooks, script, storyboard, validated ReelSpec, voiced render, QA, cover, and caption. Use when asked to make a complete Reel draft or run the editorial production workflow.
---

# Make a Reel

Run the full editorial loop. The output is a reviewable draft; this skill does not publish. Strategy formats remain test hypotheses. Preserve unknowns and stop the content from advancing when a material claim has no support.

## 948 example calibration

For `output/video/patch-notes-948-linux-root-bugs.json`, keep the count distinction and source status intact. A defensible hook is “OpenAI reports 1,169 working local root exploits across 948 distinct Linux bugs.” A misleading hook is “AI remotely hacked Linux 948 times.” The terminal and pipeline animation are illustrations, and the supplied research brief says the primary OpenAI page was inaccessible. Do not call this fixture a cleared story or a measured-performing format.

## Inputs and working files

Keep the research brief, story-brief JSON, `<spec>.json`, `<spec>.claims.json`, final MP4, QA report, cover, and caption together under `output/`. Do not modify other agents' motion styles, scenes, renderer, claims checker, or QA gate while using this workflow.

## Workflow

### 1. Choose the angle and verify claims

Use `story-angle` to choose one concrete viewer payoff and a §12 format hypothesis. Inspect the supplied primary and independent sources. Draft the adjacent ledger as `<spec>.claims.json`, with each claim's exact wording, optional value/unit, source URL/type/publisher/retrieved date, status, attribution, caveats, and notes. For `output/video/linux-root.json`, the checker expects `output/video/linux-root.claims.json`. Do not relabel an unavailable primary source as verified.

### 2. Choose the preset and prepare the brief

Select one JSON file from `docs/content-engine/formats/`. Treat its evidence label and timing as an inference/test plan. Write a story-brief JSON with `title`, `story`, `angle`, `style`, `series`, `cta`, `hook`, and `beats`. Beat `id` values should match the preset. Include only source-backed `claimIds`; the scaffold uses placeholders for unfinished visual details and carries claim IDs into each scene's `claims` array.

Create the initial spec:

```sh
node chatgpt-site/scripts/format-scaffold.mjs docs/content-engine/formats/<format>.json <story-brief.json> <spec.json>
```

### 3. Write and choose the hook, then script it

Use `hook-writer` to produce three variants with visual, complete frame-zero text, and first audio clause. Choose the most accurate useful promise; record the choice in the brief. Use `script-writer` to size spoken lines to storyboard subbeats at about 2.6–3 words/second and add pronunciation notes. Put spoken lines in each scene's `say` field. Do not narrate stage directions or pronunciation notes.

### 4. Storyboard in the selected style

Use the live catalog:

```sh
node chatgpt-site/scripts/motion-catalog.mjs <style>
```

Storyboard each beat as claim ID, viewer question, visual action, real evidence asset or labelled illustration, spoken line, payoff, and reason for the cut. Fill style-special scene `data` only from its current schema. Keep all visual assets tied to the registry or clearly identified as original illustrations.

### 5. Critique and validate

Run `retention-critic`, make the necessary edits, and validate the final spec:

```sh
node chatgpt-site/scripts/validate-reelspec.mjs <spec.json>
```

The spec must parse and have no lint errors. Review warnings. Confirm the `<spec>.claims.json` sidecar contains every spoken and visible factual claim, and claim IDs are attached to the scenes that use them. Run the source gate:

```sh
node chatgpt-site/scripts/claims-check.mjs <spec.json>
```

It must complete with no blocking claims or unsupported numbers. Attributed facts need source wording in the relevant scene's narration or caption. Then render a frame-zero still and inspect it:

```sh
cd chatgpt-site && node scripts/motion.mjs shot ../<spec.json> ../<frame-zero.png> 0
```

The full hook must be legible at exactly `t=0`; a title that animates from blank does not meet this check. The scaffold's shared kinetic opener uses one complete phrase of at most 24 characters. If a selected special scene cannot meet the same frame-zero contract, report a renderer blocker and do not call QA complete.

### 6. Render with voice and sound

The spec needs the approved voice text in `say` fields. From the repository root:

```sh
node --env-file=chatgpt-site/.env.motion chatgpt-site/scripts/motion-audio.mjs <spec.json> <final.mp4>
```

This uses the local motion environment file, caches unchanged voice/SFX clips under `chatgpt-site/.motion-cache`, and writes a narration-timed MP4. Never print or copy secret values. If voice generation is unavailable, label the render silent/incomplete; do not call it a voiced final.

### 7. Run final QA, select cover, and write caption

Run the final-render QA gate after the narrated render:

```sh
node chatgpt-site/scripts/reel-qa.mjs <spec.json> <final.mp4> --cover --out-dir <qa-dir>
```

Review the JSON and Markdown reports, frame-zero result, safe zones, phone-size legibility, audio checks, and generated contact sheet. The `--cover` option writes `cover.png` and `grid-preview.png` in the QA output directory; inspect the grid crop before delivery. Use `caption-writer` to write `<spec>.caption.md` with a concrete first line, accurate source attribution, any material qualification, and one CTA.

## Deliverables

Return links to the research/claims sidecar, ReelSpec, voiced MP4, QA report/contact sheet, selected cover and caption. State which source claims remain unresolved, all lint/QA warnings, and whether the frame-zero and voice gates passed. Never imply that the Reel was published or that a hypothesis was validated by an unmeasured result.
