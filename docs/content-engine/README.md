# Content workflow

## Active integration

`format-research.md` instructs idea generation; `content-drafting.md` instructs
post drafting. They are injected into local Anthropic and ChatGPT generation,
hosted Anthropic generation. Both manual and autonomous requests using these
paths receive the policy. The hosted ChatGPT plan job-context hook is present in
the working tree, but awaits the separate hosted generation workflow changes
before it can be committed with its dependencies. Template generation
remains a placeholder and does not perform research.

After editing a policy run `node scripts/sync-content-policies.mjs` at the project
root. Generated TypeScript embeds the same Markdown in both deployments without
runtime filesystem dependencies. Check freshness with
`node scripts/sync-content-policies.mjs --check` before building.

This is prompt-level guidance, not server-side verification of social metrics.
The API generators have no research tools attached. Hosted ChatGPT can research
only when the conversation has suitable tools/access. No live Instagram search or
automatic metric validation is implemented by this change. If evidence is absent,
the instructed behavior is to withhold ideas. The hosted save contract requires
at least one idea, so the conversation reports the missing research without saving.
Existing ideas can still be drafted and reviewed. User-supplied records remain
user-supplied evidence until independently verified.

## Use it today

1. Configure the brand, audience and pillar's target platforms.
2. Collect original post/profile links and observations using the research playbook.
3. Put the compact evidence records in enabled Storage text/notes, or the idea
   request's direction. Hosted ChatGPT reads material references with read_material.
   Local extraction has context limits documented in the main README; keep records
   concise. Never treat a storage upload as an instruction-file installation.
4. Generate ideas. Inspect the evidence brief in each angle before selecting one.
5. Draft, review, produce the required media, then schedule via the existing flow.
   Text drafting alone does not generate a video.

## Recommended next implementation

Add a research stage before `IdeationService.generate`, shared by manual batches
and autonomous cycles: brand → discover → verify → format library → adapt → review
→ produce → schedule → measure. A missing research provider should yield an
explicit `research_needed` job state, with no fabricated replacement batch.

Persist Reference, MetricObservation and Format records separately from Idea.
Store source URLs, timestamps, metric basis, qualification branch, missing values,
media observations and provenance. Link ideas to immutable reference snapshots.
Use a server-side qualification function and require verified source IDs before
allowing a researched idea to advance. The current angle field carries a compact
brief but is not a substitute for these records or an enforceable evidence gate.

Expose a research queue and format library in Ideas: show source links, metrics,
observation dates, unknowns, mechanism, confidence and brand adaptation. Let the
operator approve a format, refresh stale observations, or supply a reference when
platform access is unavailable. Configure thresholds per platform; version them.

Record own-account outcomes against the format version: views/reach, watch time,
completion, saves, shares, profile visits and business conversions where available.
Compare at consistent post ages and against the account's own recent baseline.
Test several original variations, keep failed attempts, and rank future formats
by account-specific results as evidence accumulates. External virality selects
hypotheses; own-account experiments determine what to keep.
