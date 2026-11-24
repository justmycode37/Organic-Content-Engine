# Mysteries of the Sky: source to story

This is a local preproduction pipeline for a short astrophysics explainer. It
turns a source ledger and structured brief into evidence-linked narration beats
and a shot handoff. It runs with Node 20+ and built-in modules only. No API keys,
model calls, account setup, network requests or renderer are required.

Run these commands from the repository root:

```sh
node scripts/mysteries-story.mjs validate docs/mysteries-of-the-sky/story-example-transit.json
node scripts/mysteries-story.mjs handoff docs/mysteries-of-the-sky/story-example-transit.json /tmp/mysteries-transit-handoff.md
node --test scripts/mysteries-story.test.mjs
```

The example has 3 primary sources, 5 claims and 6 shots, planned over 64 seconds.
`story-example-transit.md` is its checked-in readable handoff; a test keeps that
document synchronized with the JSON and generator.
Its four reviews remain **pending**. A successful validation means the story's
structure and evidence references are connected; it does not mean the science,
story, timing or final visuals have passed review. Durations are provisional.
Actual narration and readable labels determine later production timing.

To start another topic:

```sh
node scripts/mysteries-story.mjs init /tmp/mysteries-new-story.json
node scripts/mysteries-story.mjs validate /tmp/mysteries-new-story.json --json
```

`init` creates an incomplete brief with empty source, claim and beat ledgers. The
second command intentionally fails until those are filled. Use
`story-example-transit.json` as the field-by-field guide. Outputs use exclusive
creation: choose a new filename for each revision; existing files are preserved.
The script resolves its schema relative to itself, so it also works from other
working directories when called by absolute path.

## Authoring sequence

1. Choose one question with a concrete, visual causal answer. Write the intended
   payoff before expanding the narration. Record the audience and exclusions so
   a later stage cannot quietly turn the story into a different claim.
2. Read original research, mission documentation or a data release. Store each
   source's author, institution, exact URL/version, publication metadata, access
   date, reason it is primary and the evidence actually read. A headline, search
   snippet or institution name alone is insufficient support. Distinguish a
   preprint from a peer-reviewed publication and inspect relevant corrections.
3. Build the claim ledger before drafting beats. Each claim needs its own source
   locator and a short account of what the source supports. Distinguish observed
   results, inferences and invented numerical examples. Keep uncertainties and
   limits explicit. For calculations, write inputs with units, formula, result
   and assumptions; a person still needs to check the arithmetic and applicability.
4. Draft hook → evidence/mechanism → caveat → payoff. The final payoff answers the
   brief's question without claiming more certainty than the evidence allows.
   Every spoken fact must appear in the linked claims, including hooks and
   comparisons. The validator can check IDs, but cannot determine whether all
   narration is covered by them.
5. Give each beat one shot: what appears, what changes, exact on-screen text,
   provenance label, evidence IDs, scientific distortions and continuity. Keep
   schematic geometry distinct from observatory images or replotted data. Later
   asset sourcing must document dataset selection, processing, provenance and
   reuse rights before the assets enter production.
6. Validate; fix errors; generate a Markdown handoff. Review the actual source
   passages, read the narration aloud and inspect the shot directions. Record
   reviewer, evidence and findings for each review. Retain revisions as separate
   files. Revalidate and regenerate the handoff after changes.

This format does not select a visual style or reuse another brand's production
policies. It hands a verified plan to a later production stage. Source-derived
figures must retain units, denominators, assumptions and uncertainty. A pleasing
illustration is not an observation.

## Contract and checks

`story.schema.json` is the structural JSON Schema contract. Editors can associate
it with these JSON files. The CLI implements the subset of schema keywords used
by that bundled schema, plus semantic checks for links and narrative order; it is
not a general-purpose JSON Schema validator.

| Area | Required handoff | Checks |
| --- | --- | --- |
| Brief | Question, audience, answer, opening, payoff, scope, exclusions, target duration | Required fields and allowed types |
| Sources | Primary-source identity, version, access date, evidence read | Unique IDs, HTTPS URL syntax, real dates |
| Claims | Statement, observation/inference/calculation, source support, uncertainty, limits | Existing source IDs, precise nonempty locators, calculation record |
| Beats | Role, duration, narration, claim IDs | Unique IDs, known claims, first hook, last payoff, visible caveat beat, no orphan claims |
| Shots | Representation, direction, text, provenance, claim/source IDs, caveats, continuity, transition | Shot claims belong to the beat and have supporting sources; example/provenance labels present |
| Reviews | Four distinct stages with status, reviewer, evidence, findings | All stages present; recorded passes require attribution and evidence; requested changes require findings |

Beat order determines the timeline; start/end times are computed cumulatively.
There is no separately authored timing field to drift out of sync. Narration is
also the verbatim caption handoff. The generated document carries the source and
claim ledgers, calculations, shot caveats, review statuses and validation notes.

Unknown properties, duplicate IDs, broken references, placeholders, invalid
durations, orphan claims and misleading representation labels fail validation.
Unused background sources, unpassed reviews and a duration more than three
seconds from the target are notes. Notes are visible in JSON reports and generated
handoffs. Pending review is allowed for draft collaboration; it is never silently
converted into approval. Exit codes: `0` valid structure, `1` invalid story or I/O
error, `2` invalid command or arguments.

These checks do not verify source accessibility, source quality, claim entailment,
arithmetic, image rights, scientific completeness, readability or delivered
speech. They do not fetch sources or automatically conduct reviews.

## Review handoff

- **factual-accuracy:** Open the pinned source versions and locators; check each
  claim, number, unit, uncertainty and calculation assumption. Check that preprint
  status and the limits of the underlying measurement remain clear.
- **story-clarity:** Read the script on its own. Check first-listen causal links,
  resolved pronouns, one idea per beat, an earned answer and explicit limits.
  Technical vocabulary is acceptable when its role is clear.
- **visual-science:** Check the proposed geometry, observer position, scale,
  axes, alignment of cause with graph response, and labels distinguishing models
  from measurements. Rendered visuals will need another review later.
- **readability-timing:** Read the narration naturally; budget pauses and label
  reading time. Check exact text against the planned shots. This is a planning
  review, not a certification of generated audio or finished-video readability.

The local pipeline stops at this reviewable handoff. It does not acquire media,
generate narration, animate shots, render video, schedule posts or publish.

## Worked example and primary evidence

`story-example-transit.json` asks how a starlight dip can suggest a planet. It uses
a generic, explicitly schematic system and a separate 1% numerical example; it
does not present invented data as a particular exoplanet's observations. All
scientific support and exact locators are in the JSON claim ledger.

- [Charbonneau et al., original transit observations of HD 209458](https://arxiv.org/abs/astro-ph/9911436v1): original observation paper; the example uses the mechanism, not its measured parameters.
- [Seager and Mallen-Ornelas, original transit-geometry derivation](https://arxiv.org/abs/astro-ph/0206228v1): assumptions and equations for interpreting a transit.
- [Kepler Certified False Positive Table, mission documentation](https://archive.stsci.edu/kepler/manuals/KSCI-19093-003.pdf): why a transit-like signal needs vetting.

The original manuscripts and mission document were read on 2026-11-24. Source
text and figures are linked rather than copied into the repository.
