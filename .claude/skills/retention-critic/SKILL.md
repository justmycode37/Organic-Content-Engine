---
name: retention-critic
description: Critique a short-form script, storyboard, or rendered Reel beat by beat for promise, payoff, information progress, and dead air. Use before rendering or after a rough cut; return actionable edits, not a viral score.
---

# Retention critic

Test whether each beat gives the viewer a reason to continue and then pays off the opening promise. This is editorial diagnosis, not a prediction of watch time or reach. The strategy report has no qualified new Instagram examples establishing a universal hook formula.

## Review sequence

1. Write the opening promise in one sentence. Check that the first frame and first spoken clause express the same promise.
2. For each beat, record the question it raises, the useful answer it delivers, what changes visually or conceptually, and the next question it earns.
3. Identify any dead air: repeated information, a static explanation without new meaning, a list with no decision rule, an unearned transition, overlong logo/CTA, or a claim whose caveat arrives too late.
4. Check that the promised payoff arrives before the closing card. Remove a curiosity gap that withholds a simple answer without adding understanding.
5. Check comprehension at ordinary listening speed and phone size. Confirm that captions and narration preserve the same caveat and source attribution.
6. Offer the smallest useful edit for each defect. Do not rewrite supported facts into bigger claims to make the pacing feel faster.

## Output

Return:

- `openingPromise` and whether frame zero / first audio deliver it;
- a beat table with time, question, answer, visual progress, payoff, dead-air finding, and a concrete edit;
- the strongest remaining caveat and where it appears;
- a short verdict: `ready for render`, `revise`, or `blocked by evidence/rendering`.

Do not assign a numeric retention/virality score. Separate evidence defects from editorial pacing hypotheses. A hypothesis can be tested; an unsupported claim must be removed or qualified.

## 948 Linux example

The opening `948 WAYS TO ROOT LINUX` promises a Linux root-access result. Pay it off early with the key distinction: the research brief reports 1,169 working local root exploits across 948 distinct bugs, with OpenAI as the source. Keep the local foothold, unreleased model, and unavailable primary page visible before the final implication. The terminal and pipeline in the supplied spec are illustrative animation, not captured evidence. If a viewer could leave believing this was a remote hack or 948 unique exploits, the story has not paid off accurately.
