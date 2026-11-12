---
name: story-angle
description: Choose and frame a source-grounded PATCH NOTES story for a Reel. Use when selecting a news angle, turning research into an editorial promise, choosing a format preset, or deciding what a viewer should understand and share.
---

# Story angle

Turn reporting into one precise promise for a specific viewer. Start from what changed, how it works, what the evidence establishes, and what remains uncertain. Do not select an angle because a number sounds dramatic.

## Required reading

- `output/ecosystem/04-viral-strategies.md` for platform evidence labels, hook guidance, and the ten proposed formats in §12.
- `docs/brands/patch-notes/BRAND.md` and `docs/brands/patch-notes/DESIGN-BLUEPRINT.md` for voice and visual identity.
- `docs/content-engine/format-research.md` and `docs/content-engine/content-drafting.md` for sourcing and claims conventions.
- The source brief and any existing `<spec>.claims.json` ledger for the story.

Keep labels exact: **Official**, **Data-backed**, **Creator consensus**, and **Inference** have different meanings. The ten §12 formats are unvalidated hypotheses, not proven viral mechanics. Their length bands are initial test bands, not platform ranking rules. Do not turn a strategy hypothesis into a story fact.

## Decision sequence

1. Write the most defensible one-sentence finding and identify who cares.
2. Rank the strongest evidence, then list the missing primary sources, disputed counts, date/status limits, denominators, and relevant counterevidence.
3. State the payoff: what the viewer can now explain, decide, check, or do.
4. Choose one §12 preset whose structure serves that payoff. Name the test rationale as an **Inference**. Do not invent an alternate format just to call it researched.
5. Choose a style only after considering the real available evidence and visuals. `patch` is the familiar default; `proof` suits source inspection, `system` suits a sourced process or telemetry, `miniworld` suits a carefully labelled mechanism illustration, `breaking` suits a timely update, and `bigidea` suits one defensible thought. These are editorial fits, not performance predictions.

## Output contract

Return a concise angle memo plus a JSON-ready brief with these fields:

```json
{
  "title": "Working title",
  "story": "One paragraph stating what the sources support and how strongly.",
  "angle": "One sentence: the viewer, tension, and payoff.",
  "format": "under-the-hood",
  "style": "patch",
  "series": "UNDER THE HOOD",
  "claimIds": ["c1", "c2"],
  "knownLimits": ["Name unavailable, conflicting, or unverified evidence."],
  "payoff": "What the viewer can explain, decide, check, or do.",
  "cta": "One relevant action, or an empty string."
}
```

Use a stable preset id from `docs/content-engine/formats/`. Keep `claimIds` tied to the adjacent `<spec>.claims.json` ledger; do not create claims to fill a beat. The format scaffold consumes `story`, `title` or `angle`, `style`, `series`, `cta`, `hook`, and `beats`; preserve other fields for editorial handoff.

## Example: the 948 Linux report

**Defensible angle:** “OpenAI reported 1,169 working local root exploits across 948 distinct Linux kernel bugs; what the counts mean matters as much as the headline.” The supplied research brief says the primary OpenAI page was inaccessible and the facts were relayed by secondary outlets. Keep that access limitation and attribution visible. The local `948` ReelSpec is an artifact example, not independent verification or measured performance.

**Useful payoff:** viewers can distinguish distinct bugs from working exploits and understand that local privilege escalation requires an existing foothold.

**Avoid:** turning this into “AI remotely hacked Linux” or treating the `948` count as the number of working exploits. Both erase a material boundary from the available reporting.
