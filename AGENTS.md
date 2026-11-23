
## User model preference

For Quriozity, use `gpt-6.2-sol` at `medium` for story, script, storyboard,
subject selection, composition, text, sound design and every review. Use
`claude-opus-5-5` at `medium` ONLY for visual realization and rendered visual
repairs: Opus executes Sol's plan as the actual geometry, materials and motion.
Preserve Sol's narration and text. Allow one initial Opus visual realization
and at most one Opus repair API call per visual stage, including realization.
There is no reel-wide Opus call cap and no Sol fallback for visual repairs.
Sol-only authoring stages get an initial attempt plus at most three Sol repairs.
Do not assign visual realization to Luna. Aim for about $3 in Opus and $3 in
OpenAI model costs per reel. This is guidance, not a hard cost cutoff, and never
authorizes skipped reviews. These changes apply ONLY to Quriozity, never Hedgy.

Quriozity's normal output is white paper with black fixed ink and black text.
Other colors are very rare and must be essential to the explanation. Future reels
show each narration caption phrase in full immediately in the same small mono
style, with the currently spoken word in white on a black rectangle. Saved reels
without the new captionStyle retain typed captions; do not retrofit the current
November 17 maple-leaf autopilot run. The original
blue-on-black recording still defines dot structure, density, typography and
motion; compare its normalized ink coverage while respecting the new polarity.
Source mattes may stay black/transparent internally. Legacy reference-recording
studies retain their original colors; normal production uses style `paper-ink`.
Hedgy uses `gpt-6.2-sol` at `xhigh` for writing and planning, plus `claude-opus-5-5` at `high` as a cross-model critic (idea pick, viral story review, rendered-frame review); see docs/hedgy-generation.md.
Other coding work defaults
to `gpt-6.1-sol` with `xhigh` reasoning. One-off experiments do not change these defaults.

## Required Quriozity reviews

Every normal Quriozity reel must run the full review pipeline: factual accuracy,
story coherence and clarity, storyboard direction, subject realism/source fidelity,
composition/text readability, motion/visual continuity, owner-reference style comparison, spoken-delivery direction,
generated-voice pacing/pauses, final visual review on actual narration timing, and
sound review. Use the model and reasoning preference above for every pass.
Do not skip reviews to save time or cost, or treat technical export checks as a
replacement for content reviews. The November 14 raw onion reel was a one-off
experiment; its no-review producer and unreviewed cache are not the normal workflow.

Every visual repair must be rendered and reviewed again. Save review findings and
before/after versions. Each visual stage gets at most one Opus repair API call,
including invalid proposals, transport retries and interrupted requests. There is
no shared total limit across the reel. Persist reservations before requests;
restarts must not reset either provider's budget or repeat a free initial Opus
realization. Sol-only planning stages receive at most three Sol repairs. Reviews
always use Sol at medium. Each rendered visual stage may review its initial
version and at most one valid revision (two candidates). There are five rendered
visual stages plus initial visual realization, for at most seven Opus requests
per normal fresh reel if every repair is used. No Sol visual fallback follows.
Allow up to three generated voice takes. When a visual stage's repair allowance
is spent, select the best version that was actually rendered and reviewed and
continue finishing the reel. Never discard a good earlier version merely because a later
repair is worse. Save the selection and its reason, retain
all findings and versions, and label unresolved results as unapproved rather than
claiming that they passed. After review/repair limits, normal Quriozity reels
finish and automatically publish the best actually reviewed selection, retaining
all unresolved findings. Private experiments remain excluded from publication.
Voice should feel calm, natural and unhurried, with pauses at thought boundaries.
Let the reel run longer instead of compressing speech to a duration target.
Use ElevenLabs' unchanged default voice speed. Do not send a speed override,
change speed during reviews/retakes, or time-stretch narration afterwards.
Word-rate measurements are descriptive; a brief fast phrase must not trigger
global slowing. Review punctuation and natural thought boundaries at native speed.
Music keeps a fixed background level throughout each reel and uses the same
-30 LUFS target across future reels. No speech ducking, automatic music gain
calibration, fades or master gain riding. Normalize each score once with a fixed
whole-track gain; reserve headroom before summing music. Only effects are
automatically calibrated. Keep measured music/voice clarity in the sound review.

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
Fade the lower end of the neutral bust smoothly into the current paper background, keep the approved
onion. Show only clearly visible, fully filled pixel teardrops on the cheeks.
Do not add water inside the eyes, wet-film layers, menisci, bright wet eyelid
margins, hollow outlines or long tear tracks. The filled drops are the owner’s
chosen illustrative treatment; do not demand a physiological eye-water simulation.

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
