---
name: storyboard-to-reelspec
description: Turn a source-backed beat storyboard into a style-aware motion ReelSpec. Use when selecting shared or style-specific scenes, creating or revising a JSON spec, adding evidence visuals, or validating motion scenes before render.
---

# Storyboard to ReelSpec

Translate each storyboard beat into a purposeful visual action. Keep PATCH NOTES identity and evidence distinctions intact. An animated diagram explains; it does not prove that a real product performed an action.

## Read the live motion catalog first

From the repository root, run:

```sh
node chatgpt-site/scripts/motion-catalog.mjs <style>
```

For example: `node chatgpt-site/scripts/motion-catalog.mjs proof`. The helper calls `describeStyles()` and `describeScenes(style)` from `chatgpt-site/src/motion/spec.ts`; its output lists shared scene fields, the selected style's descriptions, and its available `special/<kind>` scenes. Do not guess a special-scene name or `data` shape. Read that style's README and implementation schema before filling a special scene.

Choose a style from `patch`, `breaking`, `proof`, `system`, `bigidea`, and `miniworld`. Check the format preset's `sceneRecommendationsByStyle` and `beatStructure`, then use the live catalog to confirm the suggested scene still exists. A recommendation is an editorial fit, not a performance claim.

## Build each beat

For every beat, record:

- `claims: ["c1"]` on each scene, referencing IDs from the adjacent `<spec>.claims.json` ledger;
- the viewer question answered by this beat;
- one observable visual action and the evidence asset or explicitly labelled illustration;
- the exact spoken line from the script and a matching short caption;
- the payoff and why this shot follows the previous one.

Keep the source asset's provenance and any asset ID in `spec.assets`. Never invent screenshots, product output, quotes, or demo failures. For the 948 Linux story, label a `whoami → root` terminal or pipeline drawing as an illustration; the supplied research brief does not contain a real captured exploit. Preserve `948 distinct bugs` versus `1,169 working exploits`, the local-access condition, OpenAI attribution, and the unresolved primary-source access note.

Use the style-special scene only when its schema and evidence needs are met. Otherwise choose a shared scene type from the catalog. Use short captions in clean sans style and reserve authored pixel type for titles and labels. The hook text and its corresponding visual belong in the first scene from time zero; do not insert a logo-only lead-in. A shared `kinetic` opener should put the complete short hook in a single `words` entry (24 characters maximum). A style-special opener may use its own longer hook field, but the actual rendered frame zero still has to pass QA.

The sidecar follows the claims tool schema: `{ "version": 1, "spec": "<spec filename>", "claims": [...] }`. Each claim has `id`, exact `statement`, optional numeric `value` plus `unit`, one or more `sources` (`url`, `type`, `publisher`, `retrieved`), `status` (`verified`, `attributed`, `contested`, or `unverified`), `attribution`, `caveats`, and `notes`. The checker blocks `contested` and `unverified` claims. Keep provider-reported facts `attributed`; put the source's name in narration or caption wherever those values appear.

## Validate the spec and ledger

From the repository root, validate after every substantive spec edit:

```sh
node chatgpt-site/scripts/validate-reelspec.mjs <spec.json>
```

This calls `parseReelSpec` and `lintReel`: parse failures and lint errors fail; warnings print for review. Fix every error. Review each warning and keep only intentional, documented ones. Confirm every used claim has an entry in the sidecar named exactly `<spec>.claims.json` (for example, `output/video/linux-root.json` pairs with `output/video/linux-root.claims.json`). Run the claims checker:

```sh
node chatgpt-site/scripts/claims-check.mjs <spec.json>
```

The checker loads the adjacent sidecar automatically, checks every visible/spoken number against a value and unit, warns if attributed claims lack source wording, and blocks contested or unverified claims. Use `--check-urls` when checking current URL reachability is useful. Do not claim ledger validation passed unless the checker ran successfully.

## Frame-zero gate

Render a still at exactly `0` and inspect it at phone size:

```sh
cd chatgpt-site && node scripts/motion.mjs shot ../<spec.json> ../<frame-zero.png> 0
```

The complete hook must already be readable in that image, aligned with the opening visual, and labelled if illustrative. Some scene entrances animate from blank; do not assume the title's text is present at `t=0`. If the chosen scene cannot show the whole hook in frame zero, record a renderer blocker for the motion owner instead of calling the spec compliant. The final rendered video must also pass the QA gate.

## Done criteria

Every scene has one editorial purpose, supports a question or payoff, and advances the story. Durations and spoken words fit. Source evidence is distinguished from reconstruction. The spec parses, lint has no errors, the ledger checker has no blocking claims, and the exact frame-zero image contains the complete hook.
