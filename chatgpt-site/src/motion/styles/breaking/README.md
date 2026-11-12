# Breaking Internet — Motion v2

Digital tabloid urgency without a simulated newspaper interface. Anton supplies the large condensed headlines;
Archivo Narrow supplies readable captions. Black and white plus one signal colour are the only flat roles.
There is no persistent chrome, clock, LIVE badge, folio, ticker crawl, footer, scene counter or progress rail.

## Choreography

Resolved `frame.events` replace content at spoken-word anchors. Every event and `frame.hits` entry retriggers a
0.18 s slam (12% oversize, knocked low) sized so its peak stays inside the safe zone; the opening is already
readable. Headlines and hero numbers are fitted to the full content column (up to 330px / 340px Anton), so one
claim fills the frame instead of sitting in a corner. An event with `"sfx": "stamp"` is the verdict: the whole
frame flips to the signal colour with knocked-out type for the rest of that scene (white when it clears 4.5:1,
otherwise ink). Use it for at most one beat per scene and a handful per reel; it is the only full-frame luminance
change, so the reel stays far below three flashes per second. Whip/push/morph transitions link the subject across
scenes. These are authored changes, not random shake or flash.

- `demo`: an actor reaches its target, then the target's state visibly changes.
- `predict`: question → locked choices → answer and comparator.
- `quantity`: a labelled approximate tile encoding extracts the subset, then reveals the comparator.
- `evidence`: text-card attribution or a supplied image zoomed to its exact source rectangle. Missing images say so.
- `scale`: stable values and units with a ratio to the original reference.
- `split`: comparison flip → explicit answer standing alone (the axis label is not drawn next to the verdict).
- `bars`: one value at a time; the bar shrinks to the next value and the cut-off share visibly drops away.
- `layers.focus`: the chosen layer becomes the sole high-contrast layer and label.

The six validated specials remain compatible with existing specs. `ticker` is now a full-size dispatch reel:
one headline rolls into the focal position, replaces its predecessor, then becomes the qualification. It never
crawls, stacks cards or runs as persistent chrome. `title` and `kicker` fields retained for compatibility are
not additional UI. Cut-outs are explicitly labelled illustrations, not source evidence.

Headlines, captions and supporting copy stay inside x=96–900/y=288–1240 at 1080×1920. Supporting copy and
captions use Archivo Narrow at 94px or more, so rendered cap height stays at or above the 64px OCR floor. Anton has
no `≠` glyph (its fallback draws `=`, inverting the claim), so `≠` is spelled out as NOT. Oversized external input truncates visibly rather than shrinking into unreadable text or silently
auto-paging; keep authored copy concise and check it with the style QA. Do not use a long document screenshot
as legible evidence: crop to an independently readable source detail.

## Review example and checks

`motion-examples/breaking.json` tells the supplied 948-Linux-bug story in approximately 33 authored seconds.
Numbers remain OpenAI-reported, via trade press. Narration preserves local access, the unreleased model,
human review and the historical patch-status snapshot. The evidence card is a paraphrase label, not a
quotation attributed to an unread primary source. The primary-source/legacy-voice publication holds remain.

Run from `chatgpt-site` with a working Node installation:

```sh
node scripts/validate-reelspec.mjs motion-examples/breaking.json
node scripts/styles/breaking-qa.mjs
node scripts/reel-qa.mjs motion-examples/breaking.json --out-dir ../output/v2/breaking
npm run check
node scripts/motion.mjs render motion-examples/breaking.json ../output/v2/breaking/breaking-silent.mp4
node --env-file=/Users/laurenzthummler/Documents/Organic_content/chatgpt-site/.env.motion scripts/motion-audio.mjs motion-examples/breaking.json ../output/v2/breaking/breaking-voiced.mp4
```

Style QA checks all 22 shared scenes and six specials in both modes, declared example beats every 100ms,
canvas balance, font floors, text bounds, deterministic accents, image evidence and a frozen baseline inventory.
It writes 0.5s contact sheets and a measured JSON report under `output/v2/breaking/`. Inspect the sheets;
automated draw-call/OCR measurements are heuristics, not proof of comprehension or retention. Pass a voiced
render's timed spec as the first argument to repeat the style/contact-sheet checks against its actual timing.
