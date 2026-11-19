---
name: newsroom-longform-production
description: "Produce a Frontier Feed long-form YouTube video (8-14 min, 16:9) about AI: packaging first (title + thumbnail), deep research, retention-engineered script with chapters, footage-first visuals plus generated illustrations, render, QA, thumbnail variants, description, and publishing or a ready-to-upload package."
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [newsroom, youtube, longform, video, script, thumbnail]
    category: newsroom
    requires_toolsets: [terminal, file, vision, image_gen]
---

# Frontier Feed long-form production

## When to use

The weekly long-form job, or when the owner asks for a YouTube video. Output: `runs/<YYYY-MM-DD>-LF/` with `video.mp4`, `thumb.jpg` (+ variants), `title.txt`, `description.txt`, `tags.txt`, `report.md`, published or marked ready. Read the playbook's **Long-form (YouTube)** section first; it holds the current rules and what we learned.

## Principles

- **Packaging before production.** Title and thumbnail decide whether anyone watches. Spend ~40 % of the thinking on them, and decide them *before* the script, so the video delivers exactly what the package promises.
- **Retention is engineered.** Cold open with the peak moment, a reason to stay in the first 30 s, an open loop at least every 45-60 s, a visual change every 3-6 s.
- **Original, not mass-produced.** YouTube demonetises "inauthentic" (mass-produced, repetitive, template-looking) content. Every video needs its own research, an angle nobody else has, varied structure and visuals. Never publish a video that only re-reads news.
- **Truth over drama.** LLMs do hallucinate; every factual sentence maps to a source URL in `facts.md`. Rumours are labelled on screen and in the voice.

## Procedure

1. **Topic.** Pick one AI topic with a story arc (characters, conflict, stakes, a surprising turn) that is still interesting in 6 months: company and founder stories, "how X actually works", AI and money/jobs, the race between labs, a failure or scandal explained, a deep dive on a launch our Reels showed people care about. Inputs: Reel analytics (topics with high sends/saves deserve a long version), `data/backlog.md`, YouTube search suggestions (`https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=<term>`) for demand, and what big channels already covered (find the gap, do not copy). Score candidates like the playbook rubric plus **search demand** and **thumbnail-ability**; write `candidates.md`.

2. **Package.** Ask 2-3 subagents in parallel for title options (≥ 12 total: curiosity gap, stakes, contrarian, number, "how/why"); each ≤ 60 characters, the main keyword in the first half, no clickbait the video cannot pay off. Pick the best 3. For each, design one thumbnail concept: one subject, ≤ 4 huge words that do *not* repeat the title, high contrast. Write `package.md` (chosen title, 2 backups, 3 thumbnail concepts, the promise the video must keep).

3. **Research.** Split the topic into 4-7 chapters and research them in parallel with subagents (primary sources first: company blogs, papers, filings, official video, interviews; then reputable press). Collect `facts.md`: every fact with its URL and date; mark anything unconfirmed. A separate fact-check subagent re-verifies the 10 most important claims.

4. **Script** (`script.md`), 8-14 min. ElevenLabs Brian speaks ~2.35 words/s, so ~1,150 words ≈ 8 min, ~1,650 words ≈ 12 min.
   - **Cold open (0-30 s):** start inside the most surprising moment or number of the story; no greeting, no channel intro. Then state the promise ("by the end you will know …") and open the main loop.
   - **Chapters:** each opens with a question or tension, delivers a payoff, and ends with a hand-off that opens the next loop ("but that was not the strange part"). Re-hook every 45-60 s with a new question, reveal or stake.
   - **Mid-point turn** around 40-60 % (new information that changes the picture) to stop the mid-video drop.
   - **Ending:** pay off the cold open and the title's promise, one-line takeaway, then a single specific bridge to another of our videos or the channel. No "like and subscribe" lists.
   - Spoken English for a curious non-engineer, short sentences, numbers as they are said, no corporate jargon. Mark where on-screen text is truly needed (a key number, a quote).

5. **Retention critique.** A fresh subagent acts as a harsh YouTube retention editor: marks every place a viewer would leave, every unpaid promise, every unsupported claim, every slow stretch (> 20 s without new information). Apply what is right. If the cold open is not the strongest 30 s of the script, rewrite it.

6. **Visual plan and assets** (`assets/`, provenance in `assets/assets.json`):
   - Footage first: official demo/keynote video, press kits, B-roll from company channels, your own screen recordings of products (browser tool), short credited excerpts with commentary over them.
   - **Generated illustrations** with `image_generate` (aspect `landscape`) for what cannot be filmed: history, concepts, abstract ideas, scenes that set mood, chapter backgrounds. Rules: never fake a real event, a real product, a document or a real person's likeness; no logos or brand marks; no text in the image; keep a consistent look per video (write one style line and reuse it in every prompt, e.g. "cinematic editorial illustration, dark teal and warm orange, soft volumetric light, no text"). Credit as "Illustration: AI-generated" in the scene `source`. Use `"motion": "push"` or `"pan"`, ≤ 4-6 s per still.
   - Diagrams and comparisons: `lf-points`, `lf-stat`, `lf-quote`, or a `custom` scene for one-off animated diagrams.
   - Change the picture every 3-6 s; never hold one still longer than ~6 s. Split long narration across several scenes with different visuals.

7. **Spec** (`spec.json`): `"format": "longform"`, voice as in the playbook (continuous take, tight pauses, no `rate`; the studio speaks long narration in ~2,400-character chunks with context and joins them — write the narration as connected speech, punctuation marks the pauses), `"captions": {"enabled": true, "style": "plain", "max_words": 4}` (or as the playbook says), optional `"music"` at volume ≤ 0.08. Templates: `lf-open` first (cold open), `lf-chapter` cards with a `chapter` key at every chapter start (the first scene also needs a `chapter`, e.g. "Intro"), `media` full-bleed for most scenes, `lf-stat`/`lf-quote`/`lf-points` sparingly, `lf-end` last with `min_duration` 15. Run `../studio/bin/studio templates` for props and `../studio/bin/studio validate runs/<run>/spec.json` until it passes. Check a few frames with `studio still` before the full render.

8. **Render in the background.** Budget ~3 minutes of render per video minute (11 min → 33 min on 8 Chromium workers with other jobs on the Mac). Never run it as one blocking terminal command, and do not wrap it in `nohup … &` (the terminal tool refuses shell background wrappers). Use `terminal(background=true)`:
   ```sh
   export $(grep -E '^ELEVENLABS_API_KEY=' ../.env | head -1 | tr -d '"') && ../studio/bin/studio render runs/<run>/spec.json -o runs/<run>/video.mp4 --qa > runs/<run>/render.out 2> runs/<run>/render.err
   ```
   `render.err` shows no progress after "capturing N frames"; poll the last finished scene instead: `ls runs/<run>/video.build | sed -E 's/seg_([0-9]+)_.*/\1/' | sort -n | tail -1` (segments appear in scene order; the folder is deleted after assembly). Poll with `sleep 240` foreground calls (macOS has no `timeout`), and use the wait for thumbnails, description, tags, backlog and READY.md.

9. **QA.** `studio qa runs/<run>/video.mp4` must pass (1920x1080, loudness, duration). Review `video.contact.jpg` with vision: text legible, nothing broken, no long static stretches, generated images look intentional. Spot-check 3-4 frames around chapter starts with `studio still`. Fix and re-render scenes as needed.

10. **Thumbnails.** Render the 3 concepts with `../studio/bin/studio thumbnail -o runs/<run>/thumb_a.jpg --text "..." --highlight ... --image ...` (background: a strong video frame via `ffmpeg -ss T -i video.mp4 -frames:v 1 frame.png`, a press image, or a generated image with the subject on the side opposite the text). Compare the `*.small.jpg` previews side by side with vision as a viewer scrolling on a phone would: is the subject and the 2-4 words readable at 320x180, does it make you curious, does it look different from what is already ranking for the keyword? Copy the winner to `thumb.jpg`; keep the others for the owner's YouTube "Test & compare".

11. **Metadata.**
    - `title.txt`: the chosen title.
    - `description.txt` must stay under YouTube's hard limit of 5,000 characters (check with `wc -m`): keep the key sources there and put the full dated source list into `sources_comment.txt` for a comment. Fill the chapter list from `video.chapters.txt` of the FINAL render (timings shift with every narration change), never leave a placeholder.
    - `description.txt`: two opening lines that restate the promise with the main keywords, 2-3 lines of context, the chapter list from `video.chapters.txt` (must start at 0:00, ≥ 3 chapters of ≥ 10 s), a "Sources" list with URLs, image credits, "Narration: AI voice. Some illustrations are AI-generated."
    - `tags.txt`: 8-15 comma-separated tags (topic, companies, people, "AI news").

12. **Repurpose.** Pick 2 moments that work alone as 30-45 s Reels; add them to `data/backlog.md` with the run folder and timestamps so the Reel runs can cut them later.

13. **Publish.** `python3 bin/postiz.py publish-youtube --video runs/<run>/video.mp4 --title "$(cat runs/<run>/title.txt)" --description-file runs/<run>/description.txt --thumbnail runs/<run>/thumb.jpg --tags "$(cat runs/<run>/tags.txt)" --at <ISO in the playbook window> --topic <slug> --run-dir runs/<run>`. If it exits with code 4 (no YouTube channel connected), do not retry: write `runs/<run>/READY.md` (what to upload where, which thumbnail variants exist, the realistic-altered-content question for YouTube Studio) and say so in the report.

14. **Report** (`report.md`): topic and why, package (title + chosen thumbnail and the rejected ones), length, chapter list, what the critique changed, render time, publish state, open questions. Add process learnings to the playbook's long-form section.

## Pitfalls

- A cold open that explains context instead of showing the peak moment loses most viewers in 30 s.
- Titles and thumbnails that say the same words waste the thumbnail.
- Generated images that look like stock-AI filler hurt trust; one consistent style, used for concepts only.
- Captions for long-form are smaller (`style: plain`) and must never cover the subject; check frames.
- `write_file` with relative paths resolves against the terminal's cwd; use absolute paths.
- Scene `source` ≤ 34 characters; full credits in the description. `lf-quote.name` ≤ 40 characters, `lf-points` items ≤ 50; always set `item_times` on `lf-points` (the narration-word trigger is unreliable for numbers).
- Pace: ElevenLabs Brian runs ≈ 2.5 words/s in long-form (1,674 words → 11:03 incl. holds, chapter cards and the 15 s end card); write ~1,500 words for 10 min, ~1,800 for 12.
- `studio thumbnail` places the background with CSS cover, so a near-square photo cannot be shifted with `--position`; composite first with ffmpeg (blurred, darkened cover of the same photo behind, full photo overlaid on the side opposite the text), then check the `.small.jpg` previews stacked at 320×180 in one vision call. A tight crop that is "a car body" instead of "a car" fails the nameability test.
- Build the spec from a small Python script (`build_spec.py` with `S()`/`M()` helpers) so narration edits after the critique are one-line replacements and the final narration can be regenerated into `script.md` from `spec.json`.
- In cron mode `delegate_task` blocks and lasts as long as its slowest child: bound every fact-checker by claim count and tool calls (≤ 7 clusters, ≤ 14 calls) and give the cluster with the most PDFs the fewest claims; no-tool title and critique subagents return in 1–7 min.
- Generate all concept illustrations in one `tool_call` batch of `image_generate` calls with the same style line; check them on one xstack contact sheet.

## Verification

`video.mp4` passed `studio qa`; contact sheet reviewed; `thumb.jpg` + variants exist; `title.txt`, `description.txt` (with chapters and sources), `tags.txt` exist; every claim traceable in `facts.md`; published or `READY.md` written.
