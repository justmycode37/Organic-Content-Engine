# PATCH NOTES editorial skills

These Claude Code skills are the canonical editorial instructions. Non-Claude agents should use the same linked files so decisions, evidence boundaries, and output contracts stay consistent.

| Skill | Use it for |
| --- | --- |
| [story-angle](../../../.claude/skills/story-angle/SKILL.md) | Select a source-grounded viewer promise and format hypothesis. |
| [hook-writer](../../../.claude/skills/hook-writer/SKILL.md) | Write three truthful, aligned visual/text/audio openings. |
| [script-writer](../../../.claude/skills/script-writer/SKILL.md) | Size spoken lines to beats and document pronunciations. |
| [storyboard-to-reelspec](../../../.claude/skills/storyboard-to-reelspec/SKILL.md) | Build a style-aware, validated motion ReelSpec. |
| [retention-critic](../../../.claude/skills/retention-critic/SKILL.md) | Review promise, payoff, progression, and dead air. |
| [caption-writer](../../../.claude/skills/caption-writer/SKILL.md) | Write a useful caption with attribution, qualification, and one CTA. |
| [make-reel](../../../.claude/skills/make-reel/SKILL.md) | Orchestrate a complete draft from story to QA and cover. |

## Format presets and scaffold

The ten JSON presets in [`../formats/`](../formats/) follow §12 of `output/ecosystem/04-viral-strategies.md`. Every format is labelled a hypothesis. Its length band is an initial production/test band, not a validated platform optimum. The JSON shape is documented in [`schema.json`](../formats/schema.json).

Scaffold a draft from a preset and a story brief:

```sh
node chatgpt-site/scripts/format-scaffold.mjs docs/content-engine/formats/under-the-hood.json path/to/story-brief.json output/video/linux-root.json
node chatgpt-site/scripts/validate-reelspec.mjs output/video/linux-root.json
node chatgpt-site/scripts/motion-catalog.mjs proof
```

The brief requires a non-empty `story`. It may contain `title`, `angle`, `style`, `accent`, `series`, `cta`, `sourceAttribution`, a `hook` object (`frameZeroText`, `text`, `audio`, `caption`, `visual`, `claimIds`), and `beats` keyed by the preset beat `id`. Keep a shared kinetic `frameZeroText` at 24 characters or fewer; it becomes one complete on-screen phrase at `t=0`. A beat may supply `claimIds`, `sceneTitles`, `spokenLines`, `captionLines`, `items`, `nodes`, `layers`, or `words`. Missing visual content is marked as a draft placeholder. The scaffold uses shared scene types so the skeleton parses before a storyboard agent adds complete style-special scene data; supplied IDs are copied into the scene-level `claims` list.

Keep the claim ledger adjacent to the spec as `output/video/linux-root.claims.json`. Run `node chatgpt-site/scripts/claims-check.mjs output/video/linux-root.json`. After rendering, run `node chatgpt-site/scripts/reel-qa.mjs output/video/linux-root.json output/video/linux-root.mp4 --cover`.
