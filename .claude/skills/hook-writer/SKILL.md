---
name: hook-writer
description: Write three truthful short-form hook variants for PATCH NOTES across visual, on-screen text, and spoken audio channels. Use for Reel openings, first-frame copy, hook experiments, and rewrites of misleading or slow intros.
---

# Hook writer

Produce **exactly three** distinct, truthful hook variants. Each variant must align visual, text, and audio around the same evidence-backed promise. These are creative hypotheses to test, not predicted retention winners.

## Frame-zero contract

- At time `0`, show the story's object, output, contradiction, or evidence and the complete readable hook text. No logo bumper, title build from blank, unexplained stock footage, or “wait for it.”
- For a shared `kinetic` opening, keep `frameZeroText` to **24 characters or fewer** and place it as one complete phrase. The scaffold uses this scene because its phrase is already on screen at `t=0`. If a style-special hook is stronger, confirm its live catalog/schema and inspect its actual frame zero after rendering.
- Start narration on the opening frame. The first spoken clause must make sense without relying on the screen text.
- Keep visual, text, and audio on the same promise. If the visual is an illustration or reconstruction, label it in the frame; do not present it as a capture or proof.
- Use one supported claim, one short sentence, and a bounded curiosity gap whose answer arrives early.
- Use a source attribution in the opening when the claim is provider-reported, contested, or not independently verified. A caveat that changes the meaning belongs in the hook or first beat, not only in fine print later.

## Write the three variants

Make each variant meaningfully different in framing, such as result-first, mechanism/question-first, and consequence/limitation-first. For each, provide:

```json
{
  "id": "result-first",
  "claimIds": ["c1"],
  "visual": "What is visible at t=0; include whether it is real evidence or an illustration.",
  "frameZeroText": "Complete on-screen hook copy, visible at t=0.",
  "audio": "The first spoken sentence; understandable without the title.",
  "qualification": "The source status or limitation the opening must preserve.",
  "testHypothesis": "What editorial choice this variant tests; no performance score."
}
```

Use the three variants as alternatives. Never combine them into a longer intro. Recommend one based on evidence clarity and the story's payoff, not an invented “viral” score.

## 948 Linux example: bounded, not sensational

The supplied research brief and ReelSpec are examples, not a cleared primary source or audience result. The research brief says OpenAI's primary post was inaccessible; figures were attributed through secondary reporting.

**Stronger, if the ledger still supports it:**

- Visual: a labelled diagram with `USER → ROOT` beside `OPENAI-REPORTED`.
- Frame-zero text: `OPENAI: 948 LINUX BUGS` (22 characters).
- Audio: “OpenAI reports 1,169 working root exploits across 948 distinct Linux bugs.”
- Qualification: local privilege escalation, not a remote takeover; primary-source access remains unresolved in the supplied research.

**Reject:** “AI can remotely hack any Linux server in seconds.” It changes local access into remote access, invents timing, universalizes the result, and hides attribution. Also reject an unlabelled `whoami → root` animation that looks like a captured exploit.

## Review before returning

- Could every visual, text, and spoken clause be supported by a claim ID?
- Is the unit clear (`distinct bugs` versus `working exploits`)?
- Does frame zero itself state the hook, and does audio begin immediately?
- Does each version have an early answer and a satisfying later payoff?
- Did a caveat or attribution get dropped to make the line punchier?
