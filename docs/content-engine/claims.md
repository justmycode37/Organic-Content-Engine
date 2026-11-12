# Claim ledger and source gate

Store the evidence ledger beside each ReelSpec as `<spec-name>.claims.json`. For example:

```text
output/video/example.json
output/video/example.claims.json
```

Each ledger has `version: 1` and a `claims` array. A claim requires an `id`, exact `statement`, `sources`, `status`, `attribution`, `caveats`, and `notes`. Numeric claims also require both `value` and `unit`. Every source records its URL, `primary` or `secondary` type, publisher, and retrieval date (`YYYY-MM-DD`).

```json
{
  "version": 1,
  "claims": [{
    "id": "root-bug-count",
    "statement": "The reported run produced 948 distinct root-level bugs.",
    "value": 948,
    "unit": "bugs",
    "sources": [{
      "url": "https://example.com/report",
      "type": "secondary",
      "publisher": "Example",
      "retrieved": "2026-11-11"
    }],
    "status": "attributed",
    "attribution": "Provider-reported figure relayed by Example.",
    "caveats": ["The primary report was not independently available."],
    "notes": []
  }]
}
```

Use `verified` only when the evidence establishes the claim; use `attributed` for a claim accurately presented as a named source's report; use `contested` when credible sources disagree; use `unverified` when the evidence is insufficient. `contested` and `unverified` are hard publishing failures. Attribution gaps are warnings: an attributed claim used by a scene should be attributed in that scene's `say`, `caption`, or an overlapping timed caption (for example, “OpenAI says” or “According to OpenAI”).

Scenes can name claim IDs with `claims: ["root-bug-count"]`. The checker verifies each ID. A scene with an explicit `claims` array can only use those claims to support its numbers. When the array is absent, every claim in the adjacent reel ledger is treated as reel-wide. The `claims` field itself is metadata and is not scanned as visible text.

The checker scans every string in scenes, including special-scene data, scene captions, narration (`say`), and timed reel captions. It also checks the visible numeric `stat.value`, `stat.versus.value`, and `bars.items[].value` fields. It normalizes grouped numbers, currency symbols, `K`/`M`/`B` and spelled magnitude suffixes, percentages, multipliers, common number words, and rounded values. Percent, currency, multiplier, bug, exploit, candidate, and other units are compared when both sides name a unit. A number with the wrong unit is unsupported even when the numeric value appears elsewhere in the ledger.

## Run the checker

From `chatgpt-site`:

```sh
node scripts/claims-check.mjs ../output/video/patch-notes-948-linux-root-bugs.json
node scripts/claims-check.mjs ../output/video/patch-notes-948-linux-root-bugs.json --format json
node scripts/claims-check.mjs ../output/video/patch-notes-948-linux-root-bugs.json --check-urls
```

The default `both` format prints a readable summary and a JSON report. `--format text` or `--format json` selects one format; `--claims <path>` overrides the adjacent ledger. Exit code `0` means no hard failures, `1` means the ledger blocks publishing, and `2` means the command or input could not be read. `--check-urls` sends `HEAD` requests and falls back to a range `GET` when the server rejects `HEAD`; it reports each final status. HTTP 403 is reported but is not treated as a broken source because bot protection commonly blocks automated checks. Other HTTP error statuses fail the check; network errors are warnings.

## 948 Linux fixture

The fixture ledger records the research brief's source limitations and disagreements. The OpenAI primary page returned HTTP 403 during research, so its figures remain attributed or contested rather than independently verified. The meaning of `948` is contested because most outlets describe distinct bugs while How-To Geek calls 948 the exploit count; `1,169` is also contested in that same discrepancy. The trend ratio and cost comparison are contested because the source brief words the October and July denominators differently. These claims block publishing. The July source supports `166` unique root exploits and about `$3,094` per unique root exploit, but the reel labels them `166 BUGS` and `$3,094 / BUG`; both unit mismatches are reported as unsupported. The reel spec remains unchanged so these issues stay visible to editors.
