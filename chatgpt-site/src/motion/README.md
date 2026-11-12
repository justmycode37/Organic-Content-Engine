# Motion: code-animated Reels

A canvas animation library for fast vertical explainers (1080 x 1920, 30 fps). An
agent writes a `ReelSpec` (JSON, see `core.ts`); `renderReel(ctx, spec, time)`
draws any frame. Nothing is generated footage: every pixel is drawn by this code.

```
node scripts/motion.mjs shot   <spec.json> <out.png> <time> [time...]   # still or contact sheet
node scripts/motion.mjs render <spec.json> <out.mp4>                    # finished video
```

## The look

**Black, white, grey, and one aggressive accent.** The accent marks the single
thing the viewer must look at in the current beat: the key word, the active node,
the winning bar, the changed line. If two things are accented, neither is.
Never tint whole panels or backgrounds with the accent; never add a second hue,
gradient or glow. All colours come from `frame.theme`; no hex literals in scenes.

**Two type systems, never mixed up.**

- Pixel type (`pixelText`, `tag`, `fitPixel`): titles, labels, tags, numerals,
  node names. Always uppercase. Module sizes: 4 to 5 for labels, 8 to 14 for titles.
- Clean sans (`text`, `FONT.body`, weight 800): captions and any sentence a
  viewer reads. Mono (`FONT.mono`) only for code and terminal content.
- Captions are bold white sans on dark (black on light) with the key word in the
  accent. Captions are never pixel type.

**Square and on-grid.** No rounded corners, no drop shadows, no blur, no
gradients. Sizes and positions are multiples of `U` (12). Strokes are 4 px.
Pixel details (stepped corners, block cursors, square progress modules, stepped
arrows, dither) give the identity.

## Motion

Fast and decisive. This is the difference between a slideshow and a Reel.

- Something visibly changes at least every 0.4 s. No frame is static.
- Entrances take 0.15 to 0.35 s, eased with `ease.outExpo` or `ease.outBack`.
  Nothing fades in slowly; things slam, snap, pop, type, wipe or build from blocks.
- Stagger groups by 0.05 to 0.1 s per item.
- The scene is readable within the first 0.3 s and fully built by about 60% of
  its duration; the rest holds with secondary motion (cursor blink, packet
  travel, counters ticking, idle bob), never a dead hold.
- Scenes must work at ANY duration from 1.2 s to 6 s: derive timings from
  `frame.dur` (with sensible absolute caps), never hard-code a total length.
- Emphasis lands as an impact: scale overshoot, accent fill snapping in, a
  one-frame invert. The player adds camera punch and shake at `hits`.

## Motion v2: continuity, transitions and camera

Scenes can expose a pure `layout(frame, props)` pass on their `SceneDef`. It is evaluated from the scene props and
local time, so requesting a frame out of order produces the same placements and never depends on playback history.
Use `place(frame, id, rect, kind)` in that pass to register a named object; `previous(frame, id)` returns the same
object's bounds and kind from the immediately preceding scene's final layout. The player recomputes those boundary
layouts from the spec when rendering a frame, then supplies the results as `frame.objects.current` and
`frame.objects.previous` to `render`. If a scene needs continuity, derive its opening position from `previous()`
inside its time-based layout. Style-specific `SpecialScene` definitions can declare the same optional layout pass;
the dispatcher validates their `data` before registering placements. Scenes without a `layout` pass retain their
existing rendering behavior.

```ts
const deviceScene: SceneDef<Props> = {
  type: 'device',
  layout(frame, props) {
    const carried = previous(frame, 'device');
    const rect = carried?.rect ?? { x: 240, y: 480, w: 600, h: 360 };
    place(frame, 'device', rect, 'hero');
  },
  render(frame, props) {
    const carried = previous(frame, 'device');
    // Animate from carried?.rect using frame.t; the layout pass supplies camera and transition bounds.
  },
};
```

Any scene may add an optional `camera` field. Example: `"camera": { "move": "track", "target": "device", "ramp": true }`.
Moves are `push-in`, `pull-out`, `pan-left`, `pan-right`, `track` and `fly`. The ramp travels quickly, slows at the
reveal and settles; hits zoom around the named target when it is present, with shake capped tightly. A missing target
falls back to the content centre. The reserved target `content` names the safe scene-content area. Camera drawing uses
the full canvas by default, so moving worlds can bleed to the canvas edges. Set `camera.clip` to `"safe"` or to an
`{ "x": 96, "y": 240, "w": 888, "h": 1260 }` rectangle to clip a scene deliberately; a style may set
`StyleDef.cameraClip`, and a scene can use `"clip": null` to disable that style clip. Text safety remains the
scene's responsibility and is checked by Reel QA.

The `whip`, `push`, `morph` and `slide` transitions each span 0.20 seconds total. Whip includes flat directional
streaks and a 2–4 frame settle; push zooms scene content around the tracked outgoing/incoming object without drawing a
focus frame or shared impact brackets; a style may add a deliberate push treatment. Morph match-cuts
between both named rectangles; slide uses staggered grid panels. These effects use only the current `Theme` roles.
They use the shared grammar in every style by default. A style can skin one by adding a named renderer to
`StyleDef.transitions`; it receives the optional `{ outgoing, incoming, direction }` context and can call
`drawWhipTransition`, `drawPushTransition`, `drawMorphTransition` or `drawSlideTransition` from
`fx/transitions.ts`. The existing broad `StyleDef.transition` hook keeps handling the legacy transition names.

## Rules for scene code

- A scene is `SceneDef<Props>`: `render(frame, props)` draws content only. The
  player owns background, camera, transitions, chrome and captions.
- Pure function of `frame.t`. No `Math.random`, `Date`, or state between frames;
  use `rng(frame.seed)` / `hash`.
- Keep essential text inside `SAFE` (x 96 to 984) and above `CONTENT_BOTTOM`
  (y 1240); the caption block lives below. Keep essential text below y = 240.
  World geometry and other non-text artwork may extend to the canvas edges.
- Never trust input length: fit or wrap every string (`fitPixel`, `wrapText`),
  clamp list lengths, and survive empty arrays without throwing.
- Balance `ctx.save()` / `ctx.restore()`.
- Use `prim.ts` before writing new drawing code. Do not edit `core.ts` or
  `prim.ts` from a scene; ask for an addition instead.

## Motion v2: events, rewards and opening frames

Scenes may declare semantic events and a reward. Each event has exactly one
anchor: a scene-local `at` time in seconds, or a `word` that appears in `say`.
Word matching ignores punctuation and accent markup, so both `long` and
`*long*` are valid anchors for `say: "The packet takes the *long* route.".

```json
{
  "say": "The packet takes the *long* route.",
  "reward": "mechanism",
  "events": [
    { "at": 0.28, "kind": "contact", "target": "packet" },
    { "word": "long", "kind": "reveal", "target": "route", "sfx": "pop" }
  ]
}
```

The allowed event kinds are `reveal`, `contact`, `transform`, `connect`,
`compare`, `resolve` and `highlight`. `target` is an optional object ID.
Allowed rewards are `mechanism`, `comparison`, `prediction`, `evidence`,
`consequence` and `joke`; every scene should name one.

The player resolves word anchors from the voice word timings in a voiced render.
The timed ReelSpec stores those resolved scene-local `at` values. Silent playback
uses the anchor word's proportional position in `say`. Scene renderers receive
the resolved `frame.events` and the existing camera `frame.hits`; the latter
continues to drive the camera punch. `eventProgress(frame, kindOrIndex)` rises
from 0 at the event to 1 over the next 240 ms.

The first scene receives `frame.opening === true`. Keep its essential object or
claim visible and readable at `t === 0`; use `isOpeningFrame(frame)` when an
opening composition needs to skip its normal entrance delay. For compatibility
with existing scene entrances, the player renders that scene at its 300 ms
opening snapshot for the first 300 ms, then rejoins the real timeline at the
same point. The opening flag stays true throughout scene zero; the helper
identifies the held opening snapshot.

### Lint and pacing defaults

- Target scene length: **1.5–3.0 s**; target sequence mean: **2.0–2.5 s**.
  A scene may run **3–6 s** without a duration warning when it declares at
  least three events. Existing scene bounds and other lint rules still apply.
- Estimate visible scene words from text fields and caption: warn above **14**;
  error above the hard **18-word** cap.
- Caption chunks target **3–7 words**. Speech captions break at clause
  punctuation where possible and render on at most two lines.
- Rolling semantic-event target: **8–14 per 10 s**, counting declared events
  plus one implicit entrance event for each scene. Warn when meaningful-event
  gaps exceed **1.2 s**. These are review thresholds, not platform laws.
- Missing scene rewards warn. The first scene must expose readable opening
  content; player-level QA checks the rendered frame zero.

The v2 example is [`motion-examples/v2-events.json`](../../motion-examples/v2-events.json).
To print its lint result from `chatgpt-site/`:

```sh
node --input-type=module -e 'import {readFile} from "node:fs/promises"; import {parseReelSpec,lintReel} from "./src/motion/spec.ts"; const parsed=parseReelSpec(JSON.parse(await readFile("motion-examples/v2-events.json","utf8"))); if(!parsed.ok) throw new Error(parsed.errors.join("\n")); console.log(JSON.stringify(lintReel(parsed.spec),null,2));'
```

The checked-in example has two advisory pacing findings and no lint errors:

```json
[
  {
    "level": "warn",
    "message": "rolling semantic event rate is 13.0–15.0 per 10s; target is 8–14 including scene entrances"
  },
  {
    "level": "warn",
    "message": "maximum gap without a declared or implicit event is 2.00s; target is 1.2s"
  }
]
```

## Styles

`spec.style` picks a complete visual system for the same ReelSpec. `patch` (default) is
the look described above. Every other style lives in `styles/<name>/` and is a
`StyleDef` (`styles/style.ts`) that may replace the palette, fonts, background,
chrome, captions, transitions, camera, any shared scene type, and add
style-only scenes used as `{"type": "special", "kind": "...", "data": {...}}`.
Anything a style leaves out falls back to the shared default.

| Style | Look |
|---|---|
| `patch` | PATCH NOTES: black, white, grey, one accent, pixel titles, code-animated explainers |
| `breaking` | BREAKING INTERNET: digital tabloid, huge condensed type, cut-out people, flash-news hits |
| `proof` | PROOF ROOM: light investigation lab, evidence boards, mark, connect, reveal |
| `system` | SYSTEM ONLINE: dark strict-grid interface, nodes, status, progress |
| `bigidea` | BIG IDEA: radically reduced moving magazine cover, one thought per scene |
| `miniworld` | MINI WORLD: recurring isometric model world with fixed characters and places |

- Each style's own README (`styles/<name>/README.md`) documents its rules, special
  scenes and an example under `motion-examples/<name>.json`.
- Fonts ship as files inside the style folder (`StyleDef.fonts`, embeddable
  licences only) and are loaded before the first frame.
- `spec.assets` maps ids to image files (relative to the spec). Cut-outs are PNGs
  with transparency. Scenes read them from `frame.assets` and must draw a
  placeholder when an id is missing.
- Styles share one SFX table (`SFX` in `scripts/motion-audio.mjs`). A special scene's `bed` must name an entry in that table.

## Semantic scenes (v2)

These shared scenes make a relationship visible in the default `patch` look:

- `demo`: `actor`, `action`, `target`, `before`, `after`, optional `contrast`. The target opens in its before state, changes after the action, and holds the resolved state.
- `predict`: `question`, 2–4 `guesses`, `answer`, `comparison: { label, value }`, optional `correction`. The answer must be one of the locked guesses.
- `quantity`: `quantity`, `subset`, `unit`, optional `scale`, and `comparator: { label, value }`. The scene computes `quantity - subset`; set `scale` when one token represents multiple units, and the label shows the effective scale.
- `evidence`: either `quote` or `asset` plus an exact image-coordinate `rect`, with `claim`, `source`, and `date`. An unavailable image asset renders a labeled placeholder.
- `scale`: `reference`, shared `unit`, and 2–4 `{ label, value }` levels. Ratios are calculated against the first level.
- `split`: `baseline`, one `axis`, matched `left` and `right` `{ label, value }` pairs, and the final `answer`.
- `layers`: optional `focus` selects the narrated layer. Anchored callouts follow each component as it explodes and reassembles.
- `stat`: optional `slam: true` shows the final number at frame zero and skips digit counting. Use `label` for the unit and `versus` for its comparator.

Each new scene has one duration-derived beat schedule, with 0.4–0.8 second spacing where the scene duration permits. Those schedule functions are the point to connect to `frame.events` when the event timeline is available. Essential text uses large pixel type or bold sans; source strips remain readable at phone size.

The complete PATCH NOTES Linux example is [`motion-examples/v2-scenes.json`](../../motion-examples/v2-scenes.json). Its reported numbers and caveats come from the dated research note; it keeps the local-access requirement and distinguishes the 948 distinct bugs from 1,169 working root exploits.

## Audio

Render narration, captions, impact hits and sound effects with:

```sh
node --env-file=.env.motion scripts/motion-audio.mjs \
  ../output/video/patch-notes-948-linux-root-bugs.json \
  ../output/video/patch-notes-948-linux-root-bugs-voiced-v2.mp4 --post post-123
```

Sound effects come from the ElevenLabs sound-generation endpoint. The shared
`SFX` table in `scripts/motion-audio.mjs` holds one prompt, duration and gain per
sound (`whoosh`, `glitch`, `blocks`, `flash`, `hit`, `type`, `tick`, `pop`,
`sting`) plus the rights facts for the paid Creator plan. Each sound is
generated once and cached in `.motion-cache` with a JSON sidecar that holds its
ledger record, so later renders reuse it without a request. Older sound names in
specs (`click`, `stamp`, `thud`, `page`, `success` and similar) resolve to the
closest shared sound through `SFX_ALIASES`.

The renderer mixes a voice bus and an effects bus, ducks the effects gently
under narration with FFmpeg sidechain compression, and masters in two passes to
`-14 LUFS` integrated with a `-2.5 dBTP` AAC margin. It then measures the final
MP4 audio with `ebur128` and reports integrated loudness and true peak.

The pronunciation dictionary in `audio/pronunciations.json` expands names,
abbreviations, amounts and technical terms before speech synthesis. Every voice
adapter returns ordered word timings in seconds; the same expansion maps those
timings back to `say`, so captions retain their written form (for example
`$1.2M`) and accented words align the first camera and impact hit to their
spoken start. Word-anchored events use the same word timings; explicit time
events and other hits keep their relative scene positions. Speech captions group
into 3–7-word chunks at clause punctuation, retain the `*accent*` markup, and
avoid short trailing fragments. ElevenLabs is implemented; Cartesia, Google TTS
and local Kokoro are present behind the same contract but remain disabled until
credentials, rights, model and alignment checks are configured.

An event's explicit `sfx` wins; defaults are contact → `hit`, reveal → `pop`,
transform → `whoosh`, connect → `pop`, compare → `tick`, resolve → `pop`,
and highlight → `pop`. Event cues land at the resolved event time. The renderer
keeps no more than six salient one-shot SFX in any rolling ten-second window,
dropping lower-priority transition and decorative cues first. Its log reports
each event's word/time alignment and whether its cue survived the density cap.

`audio/voice/config.json` selects the active voice, model, owner/source, plan,
terms reference and per-style pace/stability/style presets. The current voice
entry is Arthur's library ID and is deliberately marked unverified. Set a
private Voice Design ID and its `voiceSource`, owner, paid plan and terms
snapshot in that file before treating it as the intended brand narrator.
`ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL`, `ELEVENLABS_SPEED`,
`ELEVENLABS_STABILITY` and `ELEVENLABS_STYLE` can override configured values
(the `patch` preset is speed `1.12`, stability `0.4`, style `0.35`; valid ranges
are `0.7–1.2` for speed and `0–1` for stability and style); changing voice or
model by environment leaves the output on HOLD until matching provenance is
configured. Cached narration is reused, including lines cached before the
lexicon expansion, so a render whose narration is cached needs no ElevenLabs
key; an uncached voice line still needs one. `scripts/audio/voice/health.mjs` checks current voice
availability and model support/deprecation before new synthesis. Metadata
changes are reported and pause synthesis pending owner review. Request-derived
seeds and content-addressed caches make retries reuse identical audio bytes.
When a health change is detected, review the reported
`.motion-cache/audio-voice-health.pending.json` and promote the accepted
snapshot to `.motion-cache/audio-voice-health.json` before resuming synthesis.

Every voice and effect file used in a render gets an entry in
`audio/rights/ledger.jsonl`. A render manifest is written next to the timed
spec in `.motion-cache`. Render audio may be produced while rights facts are
unknown, but the publish audit fails closed:

```sh
node scripts/audio/rights/check.mjs .motion-cache/render-*/spec.json
node scripts/audio/rights/check.mjs --cache
node scripts/audio/rights/cli.mjs packet post-123
node scripts/audio/rights/snapshot.mjs elevenlabs-eu-terms https://elevenlabs.io/terms-of-use-eu
```

Replace `render-*` with a single render folder; passing its `spec.json` locates
the adjacent `render-manifest.json` cue list.

Generated SFX records carry the model, plan tier, request and output hashes,
generation time, terms snapshot references, permitted uses and non-beta status,
and clear through the same provider checks as voice records.

Unledgered Arthur cache files remain `unverified`; clear them only with the
owner attestation in `audio/rights/attestations/arthur.json`, exact cache hashes,
paid-plan evidence, and a verified Arthur terms snapshot. No plan or voice
owner is inferred from an API key. Edit `audio/rights/kill-switch.json` to pause
all audio or a provider, voice, asset, or exact output hash across future
renders.

For realistic synthetic audio, set the post's `synthetic` metadata and include
a clear caption disclosure such as “AI-generated narration; reporting and
sources by PATCH NOTES.” The video publisher sends Instagram
`is_ai_generated`, TikTok `post_info.is_aigc`, or YouTube
`status.containsSyntheticMedia`; it blocks posts missing the caption disclosure
or a verified platform field.

The native fields were checked against the current [Meta API solution](https://github.com/facebookincubator/catalogue-of-api-solutions/blob/main/solutions/creators/organic-content-creation.md), [TikTok Direct Post reference](https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post), and [YouTube videos reference](https://developers.google.com/youtube/v3/docs/videos) on 11 November 2026.

## Quality gate

Run the deterministic Reel QA gate on a spec, optionally with its finished MP4:

```sh
node scripts/reel-qa.mjs ../output/video/patch-notes-948-linux-root-bugs.json
node scripts/reel-qa.mjs ../output/video/patch-notes-948-linux-root-bugs.json \
  ../output/video/patch-notes-948-linux-root-bugs-voiced.mp4 --cover
node scripts/reel-qa.mjs reel.json reel.mp4 --cover --cover-time 1.8 --out-dir ./qa
```

The command renders the first frame, the opening scene at 60% duration, three
samples per scene, and five samples around each non-cut transition through `scripts/motion.mjs`'s shared `openMotionPage`
and `loadRequirements` helpers. It writes a JSON report, a Markdown summary,
and a contact sheet with approximate Instagram Reels UI masks into the output
directory (next to the video by default). `--cover` also writes a 1080 × 1920
`cover.png` and a center-cropped 1080 × 1350 `grid-preview.png`; `--cover-time`
selects a different frame without changing the ReelSpec schema. If omitted,
the cover uses the first scene at 60% of its duration.

When available, local Tesseract checks hook text and measures OCR text boxes.
Without it, hook visibility and caption height use pixel-based estimates. Safe
zone detection also uses rendered pixel edges, so its content warnings are
heuristic; OCR-confirmed text intrusions are reported separately. UI masks are
approximate and should be checked against the target Instagram device/account.
OCR also records visible word counts per sampled frame, with a 14-word target
and an 18-word hard cap. The word gate counts Tesseract word tokens with
confidence at least 40/100; lower-confidence tokens remain available to OCR
text and safe-zone checks. It compares text regions with heuristic 64 px essential
and 48 px secondary minimums. Push transition samples are checked for word load
and OCR-confirmed safe-zone intrusions; contrast is measured on steady scene and
caption samples because transition frames capture partial entrance or exit
opacity. Persistent text and edge marks visible in at least
80% of scene samples form the chrome-count estimate. Declared events are sampled
120 ms before and 280 ms after their anchor for a pixel-change audit; this is a
heuristic visual-change check, not proof of semantic comprehension.
With an MP4, ffprobe and FFmpeg check geometry, frame rate, codecs, faststart,
duration, EBU R128 loudness/true peak, audio coverage, and long silence during
scenes with narration. Hard failures return exit code 1; invalid CLI input
returns 2. Text ellipses and OCR boxes touching a frame edge are reported as
possible truncation. A passing report is a technical screen, not factual/source
approval.

## Assets and captures

`assets/registry.json` ties each image, screenshot, video, font, logo, or audio
file to its source, creator, licence basis, attribution, restrictions, capture
date, rights status, and SHA-256 digest. Keep files under `assets/files/`.
Current editorial captures are small and versioned beside the registry. No
`.gitignore` rule is used; if a future large binary must stay out of git, add a
narrow rule only inside `assets/files/.gitignore` and document that a clean
checkout needs the file before registry verification can pass.

```sh
node scripts/assets.mjs add ./image.png --id kernel-source --kind image \
  --source-url https://example.com/article --creator "Publisher" \
  --licence "Licence or rights basis" --attribution "Credit line" \
  --rights-status licensed --restrictions "Required use conditions"
node scripts/assets.mjs list
node scripts/assets.mjs verify
node scripts/assets.mjs verify --publish
node scripts/assets.mjs resolve kernel-source
```

Rights statuses are `owned`, `licensed`, `cc`, `public-domain`,
`fair-use-news`, and `unknown`. Publish verification rejects `unknown`. A
`fair-use-news` status is a case-specific editorial assessment, not a source-
granted licence or legal clearance. Include attribution and keep the use within
the recorded restrictions.

The capture commands use a fresh headless Chrome context and register files
under `assets/files/`:

```sh
node scripts/capture.mjs shot https://example.com/article
node scripts/capture.mjs shot https://example.com/article --selector article \
  --scale 1.5 --dark --label "Source: Example Publisher"
node scripts/capture.mjs shot https://example.com/article --clip 80,120,900,700
node scripts/capture.mjs scroll https://example.com/article --seconds 6
node scripts/capture.mjs phone assets/files/capture-id.png
```

`shot` captures a full page by default. `--selector` captures one element;
`--clip` is a viewport crop in `x,y,width,height` CSS pixels; `--scale` sets
device pixel density. `--dark` requests the page's dark color scheme. The
optional `--label` adds a strip below the captured pixels. `scroll` records
30 fps H.264 MP4 from screenshots while moving linearly through the page.
`phone` places a PNG capture inside an unbranded 1080 × 1920 neutral frame.
Capture checks `robots.txt`, refuses login gates, and stops on HTTP errors or
bot-protection pages. It never logs in or retries through a block. Public-page
captures default to `fair-use-news`; local pages default to `unknown`.

ReelSpecs keep their existing `assets` path map. Link registry IDs directly
or through a sibling `<spec-name>.registryAssets.json` sidecar:

```sh
node scripts/assets.mjs link ../output/video/reel.json kernel-source
node scripts/assets.mjs link ../output/video/reel.json
```

The command writes paths relative to the spec. `assets.mjs cutout
<registered-image>` uses the optional local `rembg` CLI, checks that its PNG
has alpha, and inherits source rights. Its first run may download model weights.
If `rembg` is unavailable, keep the source or use a trusted local editor and
register the transparent PNG with its original licence and limits.
