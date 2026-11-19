---
name: newsroom-reel-production
description: "Turn a verified AI news story into a finished, QA-checked Frontier Feed Instagram Reel (script, storyboard, studio spec, render, cover, caption) and hand it to publishing."
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [newsroom, reels, video, script, production]
    category: newsroom
    requires_toolsets: [terminal, file, vision]
---

# Frontier Feed reel production

## When to use

After `newsroom-news-radar` has chosen a story and written `brief.md`. Ends with a rendered `reel.mp4`, `reel.cover.jpg` and `caption.txt` that passed QA, ready for `newsroom-publish`.

## Procedure

1. **Brief.** Write `runs/<run>/brief.md`: the story in two sentences, the angle sentence, 3–7 verified facts each with its source URL, the experiment variable for this run (from the playbook's experiments queue), the target length.

2. **Hooks.** Ask 2–3 subagents in parallel for hook variants (each gets the brief and the playbook's format rules). You need ≥ 8 candidates covering different styles: bold claim, consequence for the viewer, "watch this", contrast/number. Each hook = on-screen text (≤ 7 words) + first spoken line (≤ 2 s) + what is on screen in frame 1. Pick the best one yourself; the hook must be paid off by the video.

3. **Script.** Write the narration beat by beat in `script.md`:
   - Beat 1 (0–2 s): hook. Beat 2: context in one sentence. Beats 3–n: the payoff, one idea per beat, a visual change every 2–3 s. Last beat: the takeaway or a specific question.
   - The whole Reel is spoken as **one continuous take** (studio default for ElevenLabs: `voice.mode: continuous`, `pauses: tight`), cut into scenes at its pauses. Write the narration as connected speech that flows from one scene into the next, not as isolated captions. Punctuation is the pause control: a full stop gives a real pause, a comma or dash a short one; split two thoughts with a full stop. Do not set `rate` or `speed` for ElevenLabs.
   - Spoken English, short sentences, numbers read naturally ("about two million", not "1,987,340"). Prices as symbols ("$29,990") are fine: ElevenLabs reads them correctly and the captions keep the symbol.
   - 25–40 s for news, 40–60 s for demos and explainers. ElevenLabs Brian speaks ~2.5 words/s in a continuous take with tight pauses (Genie 4 Reel: 34.9 s), so budget ~85 words for 35 s and ~110 words for 45 s; `studio validate` estimates at 2.8 w/s and under-reports by ~10%. News with no footage (photos and screenshots only): ≤ 35 s, ~80 words — the first Reel ran 45.7 s on 108 words and 62% of it was dark cards.
   - Plan the visuals with the beats: `list`, `stat`, `quote` and `compare` scenes take no background media, so each must stay ≤ 6 s (≈ 14 words). A longer beat is split: the first half over a `media` scene (photo, screenshot or clip, no caption bar), the rest on the card. Target ≥ 55% of runtime on `hook` / `headline` / `media` / `custom` scenes with media; check the split from the `scenes` array in `reel.report.json` after rendering (`start`, `duration`, `template`).
   - Every factual sentence must map to a fact in the brief.

4. **Critique before rendering.** Give the script to a fresh subagent acting as a harsh retention editor: where would a viewer swipe away, what is unclear, which claim is unsupported, is the hook paid off. Apply what is right. Tell it "do not use tools, answer from the text in one message" and start the first render in the background (`terminal(background=true)` with the ELEVENLABS export) before spawning it: the critique ignores time limits (13.8 min against 4 on 2026-11-16-B) and TTS takes are cached, but with the continuous voice any narration edit re-synthesizes the whole take (≈ 10-30 s), so batch edits into one re-render.

5. **Visuals.** Gather assets into `runs/<run>/assets/`: official images and press-kit material, screenshots of the primary source, your own screen recordings via the browser tool, short excerpts of official demo footage (credited, a few seconds, always with commentary over it), and for hardware/robot/car stories **Wikimedia Commons** photos (query `commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=<term>&gsrnamespace=6&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=2400&format=json`; use CC0 / CC BY / CC BY-SA, credit author + licence in the caption and in the scene `source`). Save provenance in `assets/assets.json` and note the source of every asset in `brief.md`. Do not use footage you cannot trace to its origin. Pre-crop hero photos to ~9:16 with Pillow (`../studio/.venv/bin/python`) so bystanders and clutter fall outside the frame, and crop screenshots to the one panel that proves the claim, upscaled 2–3× with LANCZOS so the text is legible on a phone.

5b. **Visual rules (footage first, almost no text).** The picture carries the Reel; the voice and the burned-in captions carry the information.
   - Moving footage in as many scenes as possible: demo clips, official video, your own screen recordings, B-roll of the product or company. Hunt for video before settling for stills.
   - Stills only when no footage exists. Then keep each one short (≤ 2 s; split a long sentence across several scenes with different images) and give it a strong move (`"motion": "push"` or `"pan"`) so it reads almost like video.
   - Full-bleed media (`media` with `"frame": "full"`) is the default scene. Graphic cards (`headline`, `stat`, `compare`, `list`, `quote` without media) are the exception: at most one per Reel, only when a number or quote cannot be shown any other way.
   - On-screen text besides captions: the hook headline (≤ 6 words, plain white, no `highlight`) and the closing question. No wordmark bug, no media caption bars ("$200 / month (US)"), no kickers, dates, venues, company labels, deks, "code due in December"-style side facts or label chips: if it matters, the narration and the subtitles say it. `text: minimal` hides all of these automatically; do not work around it with `custom` scenes.
   - Sources: one short `source` per scene (≤ 34 chars, e.g. "NVIDIA Research"); it renders small at the bottom edge. Full credits go in the caption.
   - Keep the spec's `text` at its default `minimal`.

6. **Spec.** Run `../studio/bin/studio templates` and read `../studio/README.md` for the current templates and spec format. Write `spec.json`: set `"brand": {"handle": "@<handle>"}` with the handle from the playbook's **Account status** section (verified on the public profile by the daily review; `@frontierfeed.ai` since 2026-11-17). Do not take it from `postiz.py integrations`: its `profile` field is cached and still said `tokenize_ai` after the owner's rename, which would put a dead handle on screen; one scene per beat, the hook scene first with `"cover": true` if it makes the best thumbnail, source labels on screen. Choose the frame-1 photo for recognisability, not for proving the claim: at Reels-tile size (130 px wide) the headline typography survives but a detail crop does not — a whole car, a whole robot, a famous app's screen are nameable; a dashboard close-up is a dark slab. Only use the `outro` template when the live handle is the brand's own; while the account is still under another handle, end on a closing `hook` scene instead. Run `../studio/bin/studio validate runs/<run>/spec.json` until it passes.

7. **Render and QA.**
   - `export $(grep -E '^ELEVENLABS_API_KEY=' ../.env | head -1 | tr -d '"')` first (the cron environment does not carry the key; without it the studio silently falls back to an Edge voice). Never print the key.
   - `../studio/bin/studio render runs/<run>/spec.json -o runs/<run>/reel.mp4`
   - `../studio/bin/studio qa runs/<run>/reel.mp4` must pass (resolution, fps, codec, loudness, duration).
   - Read `voice` in `reel.report.json`: the chosen take and any pacing problems ("swallowed sentence end", "stumble inside a clause"). A swallowed sentence end in the chosen take means the sentence break is not audible; rewrite the line (shorter sentence, full stop) and re-render.
   - Look at `reel.contact.jpg` and the cover with the vision tool: is the hook readable on a phone at a glance, does text stay out of the bottom 20% / right edge, are captions in sync, does anything look broken or cheap? Fix and re-render. Two QA rounds are normal.
   - Thumbnail check: `python3 bin/thumbcheck.py runs/<run>/reel.cover.jpg` writes `reel.cover.thumbcheck.jpg` (cover at Reels-tile and profile-grid size, enlarged). Look at it with vision and answer two questions: can you name the subject without the text, and is the headline readable? If the subject is not nameable, change the cover scene's media or `cover_time` and re-render the still (`studio still`). `studio still SPEC --scene N --t 1.0 -o x.jpg` renders one frame in seconds; use it to iterate on crops before a full render.

8. **Caption.** Write `caption.txt` following the playbook's caption rules: line 1 restates the hook, 2–4 short lines of substance, "Source: …" line, one specific question, 3–5 specific hashtags. Max 2200 characters, aim for 300–700.

9. **Hand off** to `newsroom-publish`.

## Improving the studio

If a template limits you (looks dated, missing layout, weak motion), improve it in `../studio/templates/` or add a new one, document it in `../studio/README.md`, and re-render. Keep changes backwards compatible with older specs. Record what you changed and why in the run's `report.md`.

## Pitfalls

- Slow openings kill reach. No intro, no logo sting, no "Hey guys".
- Walls of text. Beyond captions there is almost no on-screen text (see 5b); the voice carries the detail. Quotes: cut to the key clause with "…" (≤ ~60 chars) instead of the full paragraph.
- Unlabelled speculation. If it is a rumour, the screen says "Unconfirmed".
- Do not reuse the same template sequence every day; vary layouts so the feed does not look templated.
- `list` items reveal on the first ≥3-letter non-stop word they share with the narration (prefix matches too). Shared words such as "only" make all items appear at once: give each item a unique lead word that the narration says at the right moment, or set `item_times`.
- Scene `source` labels longer than ~34 characters truncate with "…"; keep them short and put full credits in the caption.
- A still that sits on screen for 4+ s feels like a slideshow; cut it shorter or use `push`/`pan`.
- Full-bleed `hook` media shows only ~40% of a landscape photo's width; pick a photo whose subject is centred, or pre-crop, and check with `studio still`. A 16:9 **video** clip behind a `hook` lands its subject at canvas y ≈ 770–1250, under the default bottom-anchored headline: set `"align": "top"` in the hook props (text at the top, shade flipped) and verify with `studio still --scene 0 --t 1.3`.
- **`studio still` seeks video media ~1–1.5 s early** (keyframe seek), the render seeks accurately: a still at scene t=0.5 on `start: 70.0` showed the frame ffmpeg puts at ~69 s, and the rendered cover differed from the still at the same `cover_time` (run 2026-11-17-A, three renders to fix the cover). Decide video in-points, crop `position` and `cover_time` from accurate ffmpeg frames (`ffmpeg -ss T -i clip -vf "drawgrid=w=384:h=2160:color=white@0.5,scale=480:-1" -frames:v 1 f.jpg`, or a 5 fps `tile` strip around a cut), use `still` only for text layout, then judge the real cover with `thumbcheck.py` after the render.
- A 1-s spoken hook line under `min_duration: 2.8` leaves ~1.9 s of silence that `studio qa` flags (> 1.5 s): keep `min_duration` ≤ spoken length + 1.3 s or give the hook a second clause.
- Short, punchy sentences (≤ 8 words) make Brian faster: 84 words → 30.5 s of speech ≈ 2.75 w/s (run 2026-11-17-A) versus 2.35 w/s on long sentences; budget 2.5–2.8 w/s for staccato scripts.
- 9:16 crops of a press photo at full height push a detail at the photo's bottom (phone on a charging pad) under the captions / bottom-20 % UI; crop a 45–55 %-height window around the detail instead, then check with `still`.
- `bin/stills.sh RUN OUT "scene t" …` renders a batch of stills in one background process (the terminal's zsh does not word-split `$var` in `set -- $st`; the script runs under bash).
- Official demo clips carry picture-in-picture insets and "TOP VIEW" labels at unpredictable times. Before choosing `start`/`position` for a video scene, extract a 2 fps strip around the planned in-point (`ffmpeg -ss T -t 8 -i clip.mp4 -vf "fps=2,scale=320:-1,tile=8x2" -frames:v 1 strip.jpg`) and a full frame with a 10 % grid (`drawgrid=w=128:h=72`), then place the 9:16 window (31.6 % of a 16:9 frame's width) so the inset falls outside. Clips named `*_thumb.mp4` are 400 px previews; fetch the full-size file.
- Video media object: `{"src": "assets/clip.mp4", "kind": "video", "start": 9.4, "fit": "cover", "position": "39% 50%"}`; only the horizontal position matters for a 16:9 clip in a 9:16 cover crop. Two-scene reuse of one clip (hook at the action, `media` continuing a few seconds later) reads as one continuous shot.
- Long stretches of dark cards: two card scenes back to back (e.g. a 10 s `list` then a 9 s `quote`) leave the background unchanged for ~20 s; interleave a photo-backed scene or split the beats.
- Contact-sheet frames of a `stat` scene show the count-up mid-animation ("$29,870" for a $29,990 value); judge the number on the final frame, do not "fix" the spec.
- `write_file` resolves relative paths against the terminal's current directory, which drifts after `cd`; always pass absolute paths for run files.
- **Map long demo clips with timestamped strips before picking in-points**: `ffmpeg -i clip.mp4 -vf "fps=1,scale=192:-1,drawtext=fontfile=/System/Library/Fonts/Helvetica.ttc:text='%{pts\:hms}':x=4:y=4:fontsize=16:fontcolor=yellow:box=1:boxcolor=black@0.5,tile=10x10" -frames:v 1 strip.jpg` turns a 90–110 s clip into one vision call (use `fps=0.5` and `tile=8x7` for 2-minute clips). Run 2026-11-18-B mapped 7 Google clips in 3 calls.
- **Browser-UI product recordings cannot be cover-cropped clean** (breadcrumb bar on top, side panel on the right, chip panels over the world at some moments). Pre-crop them with ffmpeg to a 9:16 window inside the world area from a clean in-point — e.g. on a 2156×1212 source `ffmpeg -ss 15.0 -t 7 -i clip.mp4 -vf "crop=609:1082:451:130,scale=1080:1920:flags=lanczos" -an -c:v libx264 -crf 16 -r 30 crop_9x16.mp4` — then check a 1-fps strip of the crop; the first attempt (y=61, from 13 s) on 2026-11-18-B still showed the breadcrumb and a chip panel, the second was clean. Use the crop with `"position": "50% 50%"`.
- **Measure overlay extents before trusting a `position`**: a bottom-strip frame (`crop=1920:140:0:940,drawgrid=w=96:h=140`) shows where prompt chips (bottom-left, to ~43 % on Genie 3 clips) and key widgets (bottom-right, from ~73 %) end. A 31.6 %-wide 9:16 window cannot clear both; switch to a UI-free shot (2026-11-18-B: multi-world portal instead of the aurora dragon) rather than iterating positions across renders.
- A retention critic may hand back engagement bait ("tag your co-builder"); take its structural notes (shorter setup line, qualify a price with the country) and reject the bait.

## Verification

`reel.mp4` passed `studio qa`; the contact sheet was reviewed with vision; `caption.txt` ≤ 2200 characters; every claim in the narration is traceable to a URL in `brief.md`.
