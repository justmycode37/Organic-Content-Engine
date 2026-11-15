
## User model preference

Default to `gpt-6.1-sol` with `xhigh` reasoning for all work in this project, including every generation, specialist, review and repair step. Use a different model or effort only when the user explicitly requests it for that task. One-off experiments do not change this default.

## Required Acryllex reviews

Every normal Acryllex reel must run the full review pipeline: factual accuracy,
story coherence and clarity, storyboard direction, subject realism/source fidelity,
composition/text readability, motion/visual continuity, owner-reference style comparison, spoken-delivery direction,
generated-voice pacing/pauses, final visual review on actual narration timing, and
sound review. Use the model and reasoning preference above for every pass.
Do not skip reviews to save time or cost, or treat technical export checks as a
replacement for content reviews. The November 14 raw onion reel was a one-off
experiment; its no-review producer and unreviewed cache are not the normal workflow.

Every visual repair must be rendered and reviewed again. Save review findings and
before/after versions. Failed visual or voice-pacing gates stop production after
bounded repair attempts; they must not silently keep an unapproved version.
Voice should feel calm, natural and unhurried, with pauses at thought boundaries.
Let the reel run longer instead of compressing speech to a duration target.
Sol supports text/images, not audio input: label voice checks as delivery/timing
reviews and never claim they listened to or certified the sound of the voice.

## Ordinary subjects and onion gas direction

Use plain, typical, neutral subjects and references by default: a normal spoon,
ordinary objects, and a generic neutral front-facing modelled face. Avoid ornate
objects, distinctive styling/accessories, unusual features, and dramatic emotional
stock performances unless explicitly requested. This applies to sourcing as well
as the final assets. For the current onion reel, use that neutral modelled face.

Show the invisible gas as numerous very small glimmering pixels distributed
broadly throughout the surrounding air, on both sides of the face. Never align
them into a straight eye-targeted route, solid stream, arrow or opaque smoke.
Keep independent gentle drift and asynchronous glimmer within the fixed-ink style.
Fade the lower end of the neutral bust smoothly into black, keep the approved
onion, and use restrained source-attached ocular wetness/menisci and small beads
without long glowing tear tracks.

## Comprehensibility and integration

The clarity/simplicity score measures whether the explanation is comprehensible
on first listen, not how basic its vocabulary is. Words such as "enzymes" and
other technical terms are welcome when their meaning or role is clear in context
or briefly explained. Do not penalize complex words alone or impose a jargon
quota. Judge causal links, clear references and conceptual load.

Periodically create a PR for a coherent, tested batch and merge it into `main`.
The user has authorized this workflow; preserve unrelated work and satisfy the
repository's checks/review requirements before merging.

## Perfect style reference

The owner-supplied `ScreenRecording_11-12-2026 18-32-11_1.mov` is the perfect
animation-style standard. Every normal reel must include a dedicated
`visual-style-reference-review` comparing actual rendered frames and sampled
motion directly against its pinned reference evidence. Compare contrast, black
level, sparse shadow/dense highlight dot coverage, normalized dot pitch,
roundness/softness, fixed ink, typography, grain activity and motion/transitions.
The final visual review repeats this comparison on actual voice timing.
A profile name or technical settings check cannot replace the visual comparison.
Keep the recording and extracted evidence private; commit only its identity and
review/preparation code.
