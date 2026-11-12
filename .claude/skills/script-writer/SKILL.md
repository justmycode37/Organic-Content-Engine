---
name: script-writer
description: Write concise spoken Reel lines and pronunciation notes for PATCH NOTES, sized to storyboard beats. Use when drafting narration, tightening an existing voiceover, reading numbers naturally, or preparing a script for motion-audio rendering.
---

# Script writer

Write narration that sounds like a sharp editor explaining a real development. Every line must advance the explanation or qualify a claim. Speak at roughly **2.6–3.0 words per second** for each beat; estimate spoken words after expanding symbols and numerals as they will be read aloud.

## Method

1. Use the angle, chosen hook, storyboard, and `<spec>.claims.json` ledger. Never add a fact absent from the ledger or source brief.
2. Give each beat one spoken line (or the exact number of sub-lines in the storyboard). Count words and divide by the beat's planned seconds. If it is too dense, cut detail, split the beat, or request more time; do not speed the voice to rescue an overloaded scene.
3. Speak numerals naturally while preserving units and meaning. Keep a precise figure on screen only when the ledger supports it; say “about” where the source rounds.
4. Mark one key spoken word or short phrase with `*asterisks*` for caption emphasis. Do not mark a whole sentence.
5. Add pronunciation notes for product names, acronyms, symbols, and names the voice model could misread. Notes are production metadata, not spoken text.
6. Keep caveats adjacent to the claim they limit. Name attribution in speech where the evidence is provider-reported or secondary.

## Output contract

Return a beat table with `beatId`, `claimIds`, `durationSeconds`, `spokenLine`, `wordCount`, `wordsPerSecond`, and `pronunciationNotes`. Then return a JSON-ready `beats` array:

```json
{
  "id": "evidence",
  "spokenLines": ["OpenAI reports 1,169 working exploits across 948 distinct bugs."],
  "captionLines": ["OpenAI reports 1,169 exploits across *948* bugs."],
  "claimIds": ["c1", "c2"],
  "pronunciationNotes": ["LPE: say local privilege escalation."]
}
```

`spokenLines` must match storyboard subbeats in order. Do not put pronunciation instructions in `say`; the ReelSpec's `say` field is only the words to speak.

## 948 Linux number pass

Use these readings only if they remain supported by the ledger:

- `948`: “nine hundred forty-eight.”
- `1,169`: “one thousand one hundred sixty-nine working root exploits.”
- `$1.2M`: “about one point two million dollars in API credits.”
- `LPE`: prefer “local privilege escalation” on first mention.
- `Linux`: use the project's selected voice pronunciation consistently; check the generated audio if uncertain.

Do not cram `2,308`, `1,724`, `1,169`, `948`, and the cost into one breath. The useful spoken distinction is “1,169 working exploits across 948 distinct bugs”; show the fuller funnel visually and keep the figures attributed. The source brief flags the primary OpenAI post as unavailable, so do not narrate these as independently verified.

**Good line:** “OpenAI reports 948 distinct bugs behind 1,169 working exploits.” **Bad line:** “OpenAI confirmed 948 exploits in seconds.” The second swaps bugs for exploits, invents a run time, and upgrades secondary reporting to confirmation.
