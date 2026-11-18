# Frontier Feed playbook

Living strategy for the Frontier Feed Instagram channel. The agent owns this file and rewrites it as evidence comes in. Every rule should name its evidence (post ids, numbers) or be marked `[prior]` (starting assumption from research, not yet tested on this account).

Last reviewed: 2026-11-17 (daily review; 2 posts live, account renamed to @frontierfeed.ai with avatar and bio, still 0 followers; first real distribution: GR00T 2 Reel 156 views / 146 reach / 3 shares at 10.7 h, below the 200-reach readout threshold until the 48 h read on 2026-11-19). Trail: `runs/2026-11-17-review/review.md`.

## Brand

Single source of truth for naming. Do not change this section; the owner sets it.

- Name: **Frontier Feed**
- Instagram handle: set by the owner after the rename (currently connected in Postiz as `tokenize_ai`; read the live handle with `python3 bin/postiz.py integrations`, field `profile`)
- Promise: the AI frontier, explained in under a minute, every day
- Spoken sign-off (optional, last beat): "That's the Frontier Feed."
- Visual identity: see `../studio/themes/` (logo and colours are set there)

## Account status (read before choosing a topic)

Facts checked 2026-11-17 09:33 CET on the public profile (logged out, cookie wall declined):

- **`@frontierfeed.ai`**, display name "Frontier Feed | AI News", avatar present (orange slash mark on a dark circle), bio present ("Your daily briefing from the AI frontier. / Models, tools & breakthroughs in under 60s. / Follow to stay one step ahead."), 2 posts, 2 following, **0 followers**. The owner did the rename between 2026-11-16 09:30 and 2026-11-17 09:30 CET; `instagram.com/tokenize_ai` now returns "Profile not available".
- Postiz `integrations` still reports the cached `profile: tokenize_ai` for our integration `cmwf4hbtl0f9hmu07eb4dhi5u`; publishing through it works (GR00T 2 Reel went live 2026-11-16 22:47 CET). **Do not read the handle from Postiz; use `@frontierfeed.ai`.**
- Distribution has started: account reach Nov 11–14 = 0, Nov 15 = 4, Nov 16 = 146 (the GR00T 2 Reel). A 0-follower account does get test distribution once it has a name, an avatar and a Reel with real footage — which of the two did it is not separable yet (see Learnings 2026-11-17).

What it means for production while followers < 100:

- Every view still comes from Instagram's non-follower test distribution and from search. Write for a stranger: the subject must be recognisable in frame 1 without reading, the topic must matter to a general audience, and the caption's first two lines must contain the words people would search (product name, company, "price", "free", …).
- `brand.handle` in the spec is now `@frontierfeed.ai`. The handle may appear small on the closer card (the profile finally matches the wordmark), but no "follow for more" line on screen, in the voice or in the caption — end on the question or the takeaway. The bio already carries the follow ask.
- Views under ~200 reach say nothing about the content. Judge posts by the diagnosis checklist (contact sheet, scene timings, thumbnail check) until reach allows A/B readouts.

## Guidance for today's runs — 2026-11-17 (rewritten by every daily review)

Evidence so far: 2 posts. Photos + fine-print cards (Cybercab, Sun 14:35) → 4 reach at 48 h. Official footage of a robot doing a human thing (GR00T 2, Mon 22:47) → 146 reach and 3 sends in 10.7 h. Weak signal, strong direction. Both runs today:

1. **Footage-backed story only** (topic priority 1, or priority 2 with our own screen recording). Official clip, press-kit video or our own recording of a nameable subject (robot, car, famous app's screen, a person doing something). If the best news of the day has no footage and no instantly nameable photo, take the next candidate that has, or the backlog's GR00T 2 spare-footage explainer.
2. **≥ 70 % of runtime on footage** (GR00T 2 had 84 %). No two card-like scenes back to back; a `headline` card with a small media tile counts as a card. `compare`/`list`/`stat`/`quote` ≤ 6 s each (GR00T 2's 7.2 s compare and 8.8 s headline-with-tile made a 16 s card stretch at 22.9–38.9 s — put the numbers on a `media` scene with a caption bar instead).
3. **Frame 1:** nameable subject + ≤ 7-word headline, `align: "top"` when the subject sits mid-frame; run `thumbcheck.py` and look.
4. **Length ≤ 40 s** (≈ 90 words at Brian's 2.35 w/s); 30–35 s is fine when the footage runs out.
5. **Hook experiment arms:** slot A = **question**, slot B = **bold claim** (round-robin; "watch this" was used 2026-11-16-B). Log the arm in `report.md`.
6. **Caption:** line 1 restates the hook with the search words (company, product, the verb), 3–4 fact bullets with the source, a one-line caveat if it is a lab demo or a limited rollout, one real question, 5 hashtags, "AI voice". `brand.handle` = `@frontierfeed.ai`.
7. **Slot A is a measurement:** same format as GR00T 2, different slot and day. Report its 24 h reach tomorrow next to GR00T 2's. *Update 19:05 CET:* the slot-A Reel (Zoox on Uber, cmwl03j0y0cddqv07uls4tj3c) was scheduled by a catch-up run for **19:52 CET**, not the afternoon window; slot B must post ≥ 22:22 CET (its 22:30–00:30 window is fine) and must not pick Zoox/Uber or the California-v-OpenAI story without its own footage plan (see backlog).

## North-star metric

Views per Reel at 48 h. Supporting signals, in order: sends per reach, average watch time / completion, saves per reach, follows per Reel.

## Audience and language

- English, global. `[prior]` Largest AI-news accounts are English; models and launches are named in English.
- Write for a curious non-engineer. If a 16-year-old and their parent would not both get the point, simplify.

## Posting windows (Europe/Berlin)

| Slot | Window | Why |
|---|---|---|
| A | 13:00–15:30 | `[prior]` US East morning plus EU afternoon. Used once: Sun 2026-11-15 14:35 (cmwhrjng50ljulq0712idshtm, photos-only Reel on a no-avatar profile), 4 reach at 48 h — no signal about the slot. |
| B | 22:30–00:30 | `[prior]` US prime time. Used once: Mon 2026-11-16 22:47 (cmwjppdpz0adnpc079qfiju4g, footage Reel), 146 reach in 10.7 h — confounded with the format and the profile fix; slot A today is the comparison. |

Pick the exact minute inside the window. Breaking news of score ≥ 4.3 may go out immediately (`--now`) instead of waiting for the window. Revisit after ~30 posts using our own data. Both slots must ship every day; a missed slot is a cadence failure to report, not a quiet skip.

## Topic priorities `[prior]`

1. Visual "AI did X" demos: video/image generators, robots, real-time voice. Showable in 2 seconds.
2. Free tools you can use today: practical value drives saves and sends.
3. AI and jobs or money: layoffs, prices, salaries, who gets rich.
4. Big-tech drama and lawsuits: characters and conflict.
5. Major model launches: only if we are early or can show it, not just name it.
6. Leaks and rumours: only clearly labelled, only from credible leakers, never as fact.

Skip: policy without a concrete consequence, benchmark tables without a "so what", funding rounds, papers without a demo, enterprise partnerships.

First evidence for priority 1 (weak, n = 2, confounded with the profile fix): the footage-backed robot demo (GR00T 2, cmwjppdpz0adnpc079qfiju4g) reached 146 accounts with 3 sends in 10.7 h; the photos-and-fine-print car story (Cybercab, cmwhrjng50ljulq0712idshtm) reached 4 in 48 h. Sends without saves (0) fit a "look what robots can do" angle; saves are expected from priority 2, untested.

Cold-start bias (while followers < 100): take only stories that come with footage or a photo a stranger recognises instantly (a robot, a car, a famous app's screen). A fine-print or document story like the Cybercab terms renders as text cards; it is the format that got 4 reach. Take such a story only with a recognisable hero image in frame 1, short cards (Format rules), and never as the day's only post.

## Topic scoring (0–5 each)

| Criterion | Weight |
|---|---|
| Stakes and mass relevance ("affects me, my job, my money") | 20% |
| Visual demo-ability (show it in the first 2 s) | 18% |
| Surprise / "wait, what?" | 15% |
| Shareability (obvious person to send it to) | 15% |
| Recency and speed advantage (< 6 h, few have covered it) | 12% |
| Source confidence (primary/official = 5) | 10% |
| Originality potential (our own test, explanation, comparison) | 10% |

Hard gate: source confidence ≤ 2 → reject or frame explicitly as "unconfirmed". Subtract up to 0.75 for legal or defamation risk. When scoring "visual demo-ability", score the asset you actually have (footage > recognisable photo > screenshot > none), not the asset that exists somewhere.

## Format rules

- Length: 25–40 s for news, 40–60 s for demos and explainers. Never over 90 s. **News without footage: ≤ 35 s** — 2026-11-15-A ran 45.7 s on 108 words with only three photos and spent 62% of its runtime on dark cards (evidence below). `[prior]` on the view effect, measured on the render.
- Frame 1 is the hook: big on-screen text (≤ 7 words) plus the most striking visual. No logo intro, no fade from black.
- **Frame 1 subject must be nameable at Reels-tile size** (130 px wide) without reading the text. Run `python3 bin/thumbcheck.py runs/<run>/reel.cover.jpg` and look at the sheet; if the photo is not nameable, pick the wider or more iconic shot. Evidence: 2026-11-15-A cover — headline readable at tile size, photo read as a dark slab, not a car (runs/2026-11-16-review/cybercab.cover.thumbcheck.jpg) → 4 reach; 2026-11-16-B cover — white robot arm over a matchbox, nameable at tile size, top-aligned text clear of the subject (runs/2026-11-17-review/groot2.cover.thumbcheck.jpg) → 146 reach in 10.7 h. Weak evidence on the view effect (n = 2, confounded), consistent with the rule.
- First spoken line ≤ 2 s, states the payoff or the tension.
- Every 2–3 s something changes on screen.
- Footage first: moving video in as many scenes as possible; stills only when nothing moves, ≤ 2 s each with a strong push/pan. Owner direction 2026-11-17.
- Almost no on-screen text besides captions: hook headline, closing question, at most one key number. No kickers, dates, venues, deks or label chips. Owner direction 2026-11-17 (GR00T 2 Reel had "NVIDIA · CoRL, Nov 9" and "code due in December" on screen — noise). **No-media scene cap: `list`, `stat`, `quote`, `compare` scenes ≤ 6 s (≈ 14 words of narration); ≥ 55% of runtime on photo/video-backed scenes (`hook`, `headline`, `media`, `custom` with media) — aim for ≥ 70% while followers < 100.** Split a longer beat into a `media` scene with a caption bar plus a short card. **No two card-like scenes back to back**; a `headline` card whose media is a small tile is card-like for pacing (the tile is ~35% of the frame). Evidence: 2026-11-15-A list card 10.4 s + quote card 9.0 s = 19 s with no background change (runs/2026-11-16-review/review.md); 2026-11-16-B headline-with-tile 8.8 s + compare 7.2 s = 16 s card-dominated at 22.9–38.9 s, after the demo shots were spent (runs/2026-11-17-review/review.md). `[prior]` on the view effect.
- Burned-in word-level captions.
- End with a real, specific question or a one-line takeaway, not "follow for more".
- Credit sources small at the bottom edge of the frame (scene `source`, ≤ 34 chars) and in full in the caption.
- Footage: own screen recordings, press-kit assets, short credited excerpts with heavy commentary. Never full re-uploads.
- Label AI voice (`made_with_ai` stays on unless the voice is human). Confirmed working: the live Reel shows Instagram's AI-content label (cmwhrjng50ljulq0712idshtm).
- Voice: ElevenLabs (`"voice": {"provider": "elevenlabs", "voice": "nPczCjzI2devNBz1zQrb", "rate": "+5%"}`, "Brian", deep US narrator) `[prior]`. Keep one voice across Reels so the channel sounds recognisable; Edge is only the automatic fallback.

## Caption rules `[prior]`

- Line 1 restates the hook in different words (it shows above "more").
- Lines 1–2 carry the search words a stranger would type (product, company, the number or "free"); Instagram search is a real source of views for a 0-follower account.
- 2–4 short lines of substance, then source line, then a question.
- 3–5 specific hashtags (#OpenAI #Sora), keywords in plain text for search.

## Experiments queue

Run one at a time, at least 4 posts per arm, record results below.

**Readout threshold:** a post counts toward an experiment arm only if it reached ≥ 200 accounts at 48 h. Below that, the arm is logged (so the data exists later) but not compared. Until three posts have cleared the threshold, the dominant variable is the account's cold start, not the hook.

1. Hook style: bold claim vs. question vs. "watch this". **Running.** Assign arms round-robin per run (bold claim → question → watch this → …). If the chosen story cannot honestly carry the assigned arm, swap with the day's other run and log the swap. Used: bold claim (2026-11-15-A, not counted), watch this (2026-11-16-B, pending 48 h). Today (2026-11-17): slot A = question, slot B = bold claim. While followers < 100 the asset type is held constant at "footage" (see Guidance), so the arms stay comparable.
2. Length: ~30 s vs. ~50 s on the same topic type.
3. Voice: Brian vs. a second ElevenLabs voice (e.g. Sarah `EXAVITQu4vr4xnVDxPEm`), only after hooks and length are settled.
4. Trial Reels: test two hooks for the same story (one as trial) when a story is strong.

## Experiment log

| Post | Date | Topic type | Hook arm | Length | Slot/time | Result (fill at review) |
|---|---|---|---|---|---|---|
| cmwhrjng50ljulq0712idshtm | 2026-11-15 | hardware / fine-print explainer (Tesla Cybercab orders), photos only | bold claim | 45.7 s | A, 14:35 CET (Sun) | **Closed at 48 h: 5 views, 4 reach, 0 saves/shares/likes/comments** (unchanged from 18.9 h). Posted while the profile had no name, avatar or bio. Below readout threshold; logged, not counted. |
| cmwjppdpz0adnpc079qfiju4g | 2026-11-16 | robot demo with official footage (NVIDIA GR00T 2, week-old story, mainstream-uncovered), 84 % footage-backed, top-aligned hook | watch this | 44.0 s | B, 22:47 CET (Mon) | **10.7 h: 156 views, 146 reach, 3 shares (2.1 % of reach), 1 like, 0 saves, 0 comments.** First post with real distribution. Below the 200-reach threshold at this age; read again at ~35 h (2026-11-18 review) and at 48 h+ (2026-11-19 review). Logged, not counted yet. |
| cmwl03j0y0cddqv07uls4tj3c | 2026-11-17 | robotaxi news with official footage (Zoox on Uber in Las Vegas, 34 h old), 80 % moving footage, 100 % media-backed, no cards, one caption bar, top-aligned hook on a purple night shot | question | 32.8 s | A (late: catch-up run), 19:52 CET (Tue) | fill at the 2026-11-18 review (24 h) and 2026-11-19 (48 h). Note: posted at 19:52, outside the 13:00–15:30 slot-A window, because the morning run died; compare with GR00T 2 (22:47) as "evening, same format, different hook arm". |

Cadence: 2026-11-15 shipped 1/2 (slot B preflight block). 2026-11-16 shipped 1/2 (slot A `newsroom-reel-a` failed 11:26 CET, "Operation interrupted: waiting for model response (9.1s elapsed)", before creating a run folder; `cron/output/34f2779c91b4/2026-11-16_11-26-16.md`; still the open finding in `hermes cron doctor` on 2026-11-17). Two days, two Reels of four; both losses were infrastructure, one per job. The "question" hook arm owed by slot A goes to 2026-11-17 slot A. 2026-11-17 slot A: the 11:00 run died at 12:05 inside a 23-min blocking `studio still` (no ElevenLabs key → Edge TTS retries) after brief + spec; a catch-up run at 18:25 resumed the same folder and scheduled the Reel for 19:52 CET (cmwl03j0y0cddqv07uls4tj3c) — late, but the day can still ship 2/2 if slot B runs.

## Long-form (YouTube)

Weekly 8–14 min 16:9 video about AI, produced by `newsroom-longform-production` (job `newsroom-longform`). Same brand, voice and truth rules as the Reels; different success metrics. Everything here is `[prior]` until we have our own data.

- **Goal metrics:** click-through rate (CTR) on impressions, average view duration / % viewed, returning viewers, subscribers per video. Views follow from CTR × retention.
- **Topics:** AI stories with an arc that stay relevant for months: company and founder stories, "how X actually works", AI and money/jobs, the race between labs, failures and scandals explained, deep dives on launches our Reels showed people care about. Tech & AI is a comparatively high-RPM niche; finance and business-story angles on AI pay even better.
- **Packaging first:** title (≤ 60 chars, keyword early) and thumbnail (one subject, ≤ 4 huge words, different from the title) are decided before the script; ~40 % of the effort. 3 thumbnail variants per video for YouTube "Test & compare".
- **Script:** cold open with the peak moment or most surprising fact (never "welcome back"), promise in the first 30 s, open loop every 45–60 s, a mid-point turn, payoff of the title's promise at the end. ~1,150 words ≈ 8 min, ~1,650 ≈ 12 min (Brian ≈ 2.35 words/s).
- **Visuals:** footage first; AI-generated illustrations (`image_generate`, one consistent style per video) only for concepts, history and mood, never to fake real events, products, documents or people. Picture changes every 3–6 s. Chapters via `lf-chapter` + scene `chapter`.
- **Captions:** `style: plain`, `max_words: 4`, smaller than in Reels.
- **Publishing window:** Thursday 20:00–22:00 Europe/Berlin (14:00–16:00 New York). Revisit after 6 videos.
- **Risks:** YouTube's "inauthentic content" policy demonetises mass-produced, repetitive AI content; every video needs its own research and angle, and structure and visuals must vary. Realistic AI-generated images must be disclosed in YouTube Studio ("altered or synthetic content"); the owner ticks it at upload when the report says so.
- **Status:** no YouTube channel is connected in Postiz yet; runs end with a `READY.md` package until the owner connects one.

### Long-form log

| Video | Date | Topic | Title | Length | CTR | Avg view % | Notes |
|---|---|---|---|---|---|---|---|

## Machinery changelog

- 2026-11-17 — `bin/postiz.py posts` filters to our integration (`POSTIZ_INSTAGRAM_ID`) by default and adds `filtered_to_integration` to the output; `--all` shows the whole workspace. The Postiz workspace also carries the "Hedgy" (`explainedbyhedgy`) and "Quriozity" (`quriozity.ai`) channels, whose posts appeared next to ours on 2026-11-17.
- 2026-11-16 (B) — `hook` template: optional `align: "top"` (kicker + headline at the top, shade flipped, headline capped at 160 px). A 16:9 clip cover-cropped to 9:16 lands its subject at canvas y ≈ 770–1250, exactly under the default bottom-anchored headline; `align: top` keeps the subject visible. Used for the first and last scene of run 2026-11-16-B.
- 2026-11-16 — Added `bin/thumbcheck.py` (cover → Reels-tile and profile-grid preview sheet). Production skill step 7 now requires it.
- 2026-11-16 — Queued for the weekly review: optional dimmed full-bleed background media for the studio `list` and `quote` templates (today `list`/`stat`/`compare` take no media, `quote` only a round portrait), so long beats stop being dark cards. Until then, split long beats across `media` scenes.

## Learnings log

Newest first. Format: `YYYY-MM-DD — rule — evidence`.

- 2026-11-17 — A slot that dies mid-production is resumed by a catch-up run in the **same** folder: brief + candidates + assets survive, only the spec/render is redone (run 2026-11-17-A: morning run interrupted at 12:05 by a 23-min blocking `studio still` without the ElevenLabs key; catch-up at 18:25 shipped in ~45 min). Keep every terminal command < 10 min; render in `terminal(background=true)` and poll. Confidence: high.
- 2026-11-17 — `studio still` seeks video ~1–1.5 s earlier than the render does; pick video in-points, `position` and `cover_time` from accurate `ffmpeg -ss` frames, and judge the real cover only after the render (run 2026-11-17-A: three renders spent on the cover and a shot that had already passed). Confidence: high (measured twice in one run).
- 2026-11-17 — Short punchy sentences run ~2.75 w/s on Brian (84 words → 30.5 s speech); long sentences ~2.35 w/s. Scripts of ≤ 8-word sentences need ~95 words for 35 s — run 2026-11-17-A `reel.report.json`. Confidence: medium (one run each).
- 2026-11-17 — Scope-bounded subagent briefs ("no tools, one message" for hooks/critique; "≤ 8 tool calls, ≤ 3 pages" for a freshness check) returned in 2–4 min each, all three in one 4.3-min `delegate_task` — run 2026-11-17-A. Confidence: high; the earlier overruns came from open-ended briefs.
- 2026-11-17 — Footage first, almost no on-screen text, tiny sources at the bottom; stills short or with push/pan. Studio now defaults to `text: minimal` — owner review of 2026-11-16-B.

- 2026-11-17 — A 0-follower account does get non-follower test distribution: 146 reach in 10.7 h for a Reel with official footage of a nameable subject, posted after the profile got a name, avatar and bio — cmwjppdpz0adnpc079qfiju4g (GR00T 2) vs cmwhrjng50ljulq0712idshtm (Cybercab, photos + cards, no-avatar profile): 4 reach at 48 h. The 2026-11-16 rule "single-digit views regardless of content" is narrowed to "a no-name, no-avatar profile": it no longer applies. Confidence: high that distribution works now; low on which of format / profile / slot caused the jump (n = 2, all three changed at once).
- 2026-11-17 — Measure send rate (shares / reach) from the first day; it is the earliest quality signal Postiz exposes — GR00T 2: 3 sends / 146 reach = 2.1 % at 10.7 h with 0 saves and 1 like; a "robots can do THAT now?" demo is sent, not saved. Confidence: single post; treat 2 % as the bar to beat, not as a rule.
- 2026-11-17 — Hold the asset type constant (footage) while followers < 100 and let only the hook arm vary; otherwise the hook experiment is swamped by the format difference (36× reach between the two formats). Confidence: reasoning from the n = 2 gap, not a measured interaction.
- 2026-11-17 — Count a `headline` scene with a small media tile as a card for pacing: GR00T 2 had 84 % "media-backed" runtime by template, yet 22.9–38.9 s (headline-with-tile 8.8 s + compare 7.2 s) is 16 s of dark card on the contact sheet — runs/2026-11-17-review/review.md. Confidence: measured on the render; retention effect unknown (no watch-time data from Postiz).
- 2026-11-17 — When the profile handle changes, `instagram.com/<old handle>` says "Profile not available" and Postiz keeps reporting the old `profile`; read the live handle from a Reel page's `og:description` ("… - <handle> am <date>") — 2026-11-17: `tokenize_ai` → `frontierfeed.ai`, Postiz still `tokenize_ai`. Confidence: high.
- 2026-11-17 — `document.title` in `browser_exec` carries a leading emoji (🐴) on every Instagram page, including the error page; it is not part of the display name. Read names and counts from `og:description`/`og:title` — the 2026-11-16 note "🐴 Tokenize" was this artefact. Confidence: high (two pages, same prefix).
- 2026-11-17 — `postiz.py posts` listed posts from two other brands' channels in the same Postiz workspace (Hedgy, Quriozity); the ledger and `collect` were unaffected because they key on our post ids. Fixed in `bin/postiz.py` (filter by integration). Confidence: high.
- 2026-11-16 — Subagents do not honour wall-time limits written into the brief; bound them by scope instead (≤ 8 numbered claims, ≤ 3 sources, "stop after N tool calls") and never put a slow single-item task in the critical path — run 2026-11-16-B: fact-checker ran 27.8 min against a 10-min limit, critique 13.8 min against 4 min; the 5-way scan with the same wording finished in 12 min only because each cluster was small. Confidence: high (two measured overruns).
- 2026-11-16 — A week-old story qualifies when mainstream outlets have not covered it and we hold official footage of a nameable subject; put the date on screen (kicker) and in the caption — run 2026-11-16-B (GR00T 2, Nov 9, HN posts 3–4 points, The Verge/TechCrunch nothing). Confidence: prior on the view effect; the rule prevents the "pretending it's today" error.
- 2026-11-16 — Official demo clips often carry picture-in-picture insets and "TOP VIEW" labels; before choosing a clip in-point, extract a 2 fps strip around it (`ffmpeg -ss T -t 8 -vf fps=2,tile=8x2`) and pick `start`/`position` so the inset falls outside the 9:16 crop — run 2026-11-16-B: insets at 8–12.9 s and 26–36 s of the NVIDIA clips were inside the first crop; fixed on stills before rendering. Confidence: high.
- 2026-11-16 — With a 16:9 clip behind a `hook`, the bottom-anchored headline covers the subject (clip y 40–65 % → canvas 770–1250); use `align: "top"` and check with `studio still` — run 2026-11-16-B stills_row2 vs stills_row3. Confidence: high (measured on the render).
- 2026-11-16 — Slot A cron run can die in the model-response preflight ("Operation interrupted: waiting for model response") before any work; a failed slot must be re-run manually or by the next slot, otherwise the day ships 1/2 — `cron/output/34f2779c91b4/2026-11-16_11-26-16.md`. Two of two days so far shipped 1/2.
- 2026-11-16 — *(narrowed 2026-11-17: applies to a no-name, no-avatar profile only; see the 2026-11-17 entry)* Check the public profile state (followers, avatar, bio, name) before reading any view count; a 0-follower, no-avatar account yields single-digit views regardless of content — cmwhrjng50ljulq0712idshtm: 5 views / 4 reach at 18.9 h, account reach 0 on Nov 10–14, profile "Tokenize" with no picture and no bio. Confidence: high that the number is distribution, not content.
- 2026-11-16 — Cap no-media scenes at 6 s and keep ≥ 55% of runtime on photo/video-backed scenes; our first Reel spent 28.5 of 45.7 s (62%) on dark cards, with a 10.4 s list and a 9.0 s quote back to back (19 s without a background change) — run 2026-11-15-A `reel.report.json`. Confidence on the retention effect: prior (craft rule), measured violation.
- 2026-11-16 — Pick the frame-1 photo for recognisability at 130 px, not for proving the claim; the typography already survives tile size, the photo must name the subject — 2026-11-15-A cover: headline readable, interior crop unrecognisable as a car (runs/2026-11-16-review/cybercab.cover.thumbcheck.jpg). Confidence: prior, measured on the render.
- 2026-11-16 — News without footage runs ≤ 35 s (~80 words at Brian's 2.36 w/s); 108 words became 45.7 s of mostly cards — run 2026-11-15-A. Confidence: prior.
- 2026-11-16 — Report a missed slot as a cadence failure: slot B on 2026-11-15 never ran (cron preflight "No Anthropic credentials found" at 20:28 CET, 28 min late; `hermes auth status anthropic` = logged in the next morning). Only 1 of 2 Reels shipped on day 1 — `cron/output/292b24a121ef/2026-11-15_20-28-13.md`.
- 2026-11-16 — Contact-sheet frames of a `stat` scene show mid-count-up numbers ("$29,870" at 9.5 s for a $29,990 value); judge stats on the final frame, do not "fix" them — run 2026-11-15-A contact sheet.
- 2026-11-15 — Give every scan subagent a hard time limit (10–15 min) and batch fact-check + hooks in one delegate call; in cron mode `delegate_task` blocks, so an unbounded 5-way scan cost 48 min of the 2.5 h budget — run 2026-11-15-A (scan 48 min, fact-check+hooks 11 min, critique 1 min).
- 2026-11-15 — Budget ~2.35 spoken words/s for ElevenLabs Brian even at +10% (not 2.8); 112 words rendered at 45.7 s. For a 35 s Reel write ≤ 85 words — run 2026-11-15-A render report.
- 2026-11-15 — Hardware/product stories: Wikimedia Commons (CC0 / CC BY / CC BY-SA, credit in caption) gives traceable hero photos when company sites block headless browsers; crop to 9:16 in Pillow before the hook so bystanders fall out of frame — run 2026-11-15-A assets.
- 2026-11-15 — Verify X posts through `https://publish.twitter.com/oembed?omit_script=1&url=<tweet>` (text, author, date) because x.com returns 403 to our tools; `web_extract` is search-only here, use browser_exec or urllib — run 2026-11-15-A.
- 2026-11-15 — Export `ELEVENLABS_API_KEY` from `../.env` before `studio render`; the cron environment does not carry it and the studio falls back to Edge silently — run 2026-11-15-A.
- 2026-11-15 — Keep `source` labels ≤ ~34 chars; longer ones truncate with "…" on screen — run 2026-11-15-A contact sheet.
- 2026-11-15 — Studio `list` items reveal on the first ≥3-letter non-stop word they share with the narration; shared words like "only" trigger all items at once. Give each item a unique lead word or set `item_times` — run 2026-11-15-A round-1 contact sheet.
