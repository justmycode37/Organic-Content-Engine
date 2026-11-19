# Frontier Feed playbook

Living strategy for the Frontier Feed Instagram channel. The agent owns this file and rewrites it as evidence comes in. Every rule should name its evidence (post ids, numbers) or be marked `[prior]` (starting assumption from research, not yet tested on this account).

Last reviewed: 2026-11-17 (daily review; 2 posts live, account renamed to @frontierfeed.ai with avatar and bio, still 0 followers; first real distribution: GR00T 2 Reel 156 views / 146 reach / 3 shares at 10.7 h, below the 200-reach readout threshold until the 48 h read on 2026-11-19). Trail: `runs/2026-11-17-review/review.md`. **No daily review ran on 2026-11-18** (job did not fire); the 2026-11-18-B run rewrote the guidance section and must be followed by a review on 2026-11-19 that reads GR00T 2 (48 h+), Zoox (36 h+) and Genie 4 (≈ 11 h).

## Brand

Single source of truth for naming. Do not change this section; the owner sets it.

- Name: **Frontier Feed**
- Instagram handle: set by the owner after the rename (currently connected in Postiz as `tokenize_ai`; read the live handle with `python3 bin/postiz.py integrations`, field `profile`)
- Promise: the AI frontier, explained in under a minute, every day
- Spoken sign-off (optional, last beat): "That's the Frontier Feed."
- Visual identity: see `../studio/themes/` (logo and colours are set there)

## Account status (read before choosing a topic)

- **2026-11-19 ~22:30: the Instagram account @frontierfeed.ai was banned.** Until the owner says otherwise, publish **YouTube Shorts only** (newsroom-publish step 3b); do not call `postiz.py publish` for Instagram, keep producing Reels at the same cadence and quality. Every run still writes `caption.txt` so the Reel can go to Instagram later.

Facts checked 2026-11-17 09:33 CET on the public profile (logged out, cookie wall declined):

- **`@frontierfeed.ai`**, display name "Frontier Feed | AI News", avatar present (orange slash mark on a dark circle), bio present ("Your daily briefing from the AI frontier. / Models, tools & breakthroughs in under 60s. / Follow to stay one step ahead."), 2 posts, 2 following, **0 followers**. The owner did the rename between 2026-11-16 09:30 and 2026-11-17 09:30 CET; `instagram.com/tokenize_ai` now returns "Profile not available".
- Postiz `integrations` still reports the cached `profile: tokenize_ai` for our integration `cmwf4hbtl0f9hmu07eb4dhi5u`; publishing through it works (GR00T 2 Reel went live 2026-11-16 22:47 CET). **Do not read the handle from Postiz; use `@frontierfeed.ai`.**
- Distribution has started: account reach Nov 11–14 = 0, Nov 15 = 4, Nov 16 = 146 (the GR00T 2 Reel). A 0-follower account does get test distribution once it has a name, an avatar and a Reel with real footage — which of the two did it is not separable yet (see Learnings 2026-11-17).

What it means for production while followers < 100:

- Every view still comes from Instagram's non-follower test distribution and from search. Write for a stranger: the subject must be recognisable in frame 1 without reading, the topic must matter to a general audience, and the caption's first two lines must contain the words people would search (product name, company, "price", "free", …).
- `brand.handle` in the spec is now `@frontierfeed.ai`. The handle may appear small on the closer card (the profile finally matches the wordmark), but no "follow for more" line on screen, in the voice or in the caption — end on the question or the takeaway. The bio already carries the follow ask.
- Views under ~200 reach say nothing about the content. Judge posts by the diagnosis checklist (contact sheet, scene timings, thumbnail check) until reach allows A/B readouts.

## Guidance for today's runs — 2026-11-19 (rewritten by the 2026-11-18-B run; no daily review ran on 2026-11-18)

**Postiz API key dead since ~22:30 CET 2026-11-19 (run 2026-11-19-LF-v2 finish):** every call returns `HTTP 401 Invalid API key`; the same key scheduled a Short at 22:15 CET and `../.env` is unchanged since Nov 15, so it was invalidated on the Postiz side (regenerated or an auth incident). Until a probe (`curl -s -o /dev/null -w '%{http_code}' -H "Authorization: $POSTIZ_API_KEY" "$POSTIZ_API_URL/integrations"`) returns 200, no run can publish or read the calendar: produce, write `READY.md`, and report — do not retry in a loop. The long-form video is packaged and waiting in `runs/2026-11-19-LF-v2/READY.md`.

**Slot B 2026-11-19 (run 2026-11-19-B, Pika Enact, watch-this arm) was rendered and sent at 21:27 CET but Instagram REJECTED it: "Instagram requires you to log in at instagram.com … then reconnect this channel" (Postiz post cmwnxztzb07h3oa07i9n553vx in state ERROR). The channel is blocked until the owner logs in and reconnects it in Postiz; the queued Gemini Tasks post (Fri 13:08) will fail the same way until then. Every run must check `postiz.py notifications` first and must not spend a slot on a new Reel while the channel is in this state — republish the ready Pika Reel first (recovery steps in runs/2026-11-19-B/report.md). Day 2026-11-19 shipped 0/2 live.** Do not pick Pika Enact / Pika again before Dec 1 unless it ships publicly.

**Batch update 2026-11-19 19:20 CET (run 2026-11-20-A):** slot **2026-11-20-A is filled** — Gemini Tasks free, question arm, scheduled 13:08 CET, post cmwnvgcwp055woa07eep1i5fk. Remaining batch slots take the round-robin from there: **2026-11-20-B = watch this, 2026-11-21-A = bold claim, 2026-11-21-B = question.** Do not pick Gemini Tasks / Gemini agents / Google agentic shopping again. Phone-UI demo clips: use the blur-fill 9:16 composite (learnings 2026-11-19) instead of a cover crop.

Evidence so far: 3 posts live + 1 queued. Photos + cards (Cybercab) → 4 reach; official footage of a nameable subject (GR00T 2, Zoox) → real distribution. The 2026-11-18-B Reel (Genie 4, bold claim, 22:36 CET Wed) is the first "generated world" frame 1; read it at 24 h and 48 h next to GR00T 2 and Zoox. Rules for both runs:

1. **Footage-backed story only** (topic priority 1, or priority 2 with official product clips / our own screen recording). Official clip, press-kit video or our own recording of a nameable subject.
2. **≥ 70 % of runtime on footage**, no two card-like scenes back to back, `compare`/`list`/`stat`/`quote` ≤ 6 s each. 2026-11-18-B hit 100 % media-backed with one caption bar.
3. **Frame 1:** nameable subject + ≤ 6-word headline, `align: "top"` for 16:9 clips; run `thumbcheck.py` and look.
4. **Length ≤ 40 s**; 88 words of ≤ 10-word sentences rendered 34.1 s on 2026-11-18-B (2.6 w/s incl. holds).
5. **Hook experiment arms:** round-robin continues — slot A 2026-11-19 = **question**, slot B 2026-11-19 = **watch this**. Log the arm in `report.md`.
6. **Slot A 2026-11-19 story is ready:** Gemini Tasks free (fact-checked, 3 official clips in `runs/2026-11-18-B/assets/gemini_tasks_*.mp4`, see `data/backlog.md` "Ready to produce"); question hook "Would you let Gemini spend your money?"; optional Citi-terms kicker with the exact wording. Do a ≤ 8-call freshness check instead of a full radar unless something bigger with footage broke overnight.
7. **Caption:** line 1 restates the hook with search words, 3–4 fact bullets with the source, a caveat line, one real question, 5 hashtags, "AI voice". `brand.handle` = `@frontierfeed.ai`.
8. **Demo-clip hygiene:** Google/NVIDIA demo clips carry chips, widgets, insets and browser chrome; measure overlay extents on accurate ffmpeg frames, pre-crop browser recordings to a 9:16 window inside the world area, and switch shots when a 31.6 %-wide window cannot clear both corners (learnings 2026-11-18).

## Guidance archive — 2026-11-17 (kept for the review)

Evidence so far: 2 posts. Photos + fine-print cards (Cybercab, Sun 14:35) → 4 reach at 48 h. Official footage of a robot doing a human thing (GR00T 2, Mon 22:47) → 146 reach and 3 sends in 10.7 h. Weak signal, strong direction. Both runs today:

1. **Footage-backed story only** (topic priority 1, or priority 2 with our own screen recording). Official clip, press-kit video or our own recording of a nameable subject (robot, car, famous app's screen, a person doing something). If the best news of the day has no footage and no instantly nameable photo, take the next candidate that has, or the backlog's GR00T 2 spare-footage explainer.
2. **≥ 70 % of runtime on footage** (GR00T 2 had 84 %). No two card-like scenes back to back; a `headline` card with a small media tile counts as a card. `compare`/`list`/`stat`/`quote` ≤ 6 s each (GR00T 2's 7.2 s compare and 8.8 s headline-with-tile made a 16 s card stretch at 22.9–38.9 s — let the narration carry the numbers over `media` scenes instead).
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

Every Reel is also published as a YouTube Short (owner direction 2026-11-19), scheduled 09:15–11:30 Berlin because the shared Postiz YouTube upload quota runs out in the evening and resets at 09:00 (see `newsroom-publish` step 3b). Long-form uploads follow the same morning rule.

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
- Almost no on-screen text besides captions: hook headline (plain white, no accent bar or highlight) and the closing question. No "FRONTIER FEED" corner bug, no caption bars with numbers ("$200 / month (US)" on Genie 4 — owner direction 2026-11-19), no kickers, dates, venues, deks or label chips. Owner direction 2026-11-17 (GR00T 2 Reel had "NVIDIA · CoRL, Nov 9" and "code due in December" on screen — noise). **No-media scene cap: `list`, `stat`, `quote`, `compare` scenes ≤ 6 s (≈ 14 words of narration); ≥ 55% of runtime on photo/video-backed scenes (`hook`, `headline`, `media`, `custom` with media) — aim for ≥ 70% while followers < 100.** Split a longer beat into a `media` scene plus a short card. **No two card-like scenes back to back**; a `headline` card whose media is a small tile is card-like for pacing (the tile is ~35% of the frame). Evidence: 2026-11-15-A list card 10.4 s + quote card 9.0 s = 19 s with no background change (runs/2026-11-16-review/review.md); 2026-11-16-B headline-with-tile 8.8 s + compare 7.2 s = 16 s card-dominated at 22.9–38.9 s, after the demo shots were spent (runs/2026-11-17-review/review.md). `[prior]` on the view effect.
- Burned-in word-level captions.
- End with a real, specific question or a one-line takeaway, not "follow for more".
- Credit sources small at the bottom edge of the frame (scene `source`, ≤ 34 chars) and in full in the caption.
- Footage: own screen recordings, press-kit assets, short credited excerpts with heavy commentary. Never full re-uploads.
- Label AI voice (`made_with_ai` stays on unless the voice is human). Confirmed working: the live Reel shows Instagram's AI-content label (cmwhrjng50ljulq0712idshtm).
- Voice: ElevenLabs (`"voice": {"provider": "elevenlabs", "voice": "nPczCjzI2devNBz1zQrb", "mode": "continuous", "pauses": "tight"}`, "Brian", deep US narrator). No `rate` and no `speed`: the voice's own default speed sounds most natural. Write the narration as connected speech — the whole Reel is spoken as one take — and use punctuation to mark thought boundaries (a full stop gives a real pause, a comma a short one). Check `reel.report.json` → `voice` for pacing problems; a "swallowed sentence end" usually means two thoughts should be split by a full stop. Keep one voice across Reels so the channel sounds recognisable; Edge is only the automatic fallback.

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
| cmwmjlaz00bjamy060r9m918x | 2026-11-18 | AI demo with official footage (Google Project Genie / Genie 4 opens to Ultra 20× subscribers, same-day news, no mainstream coverage at post time), 100 % media-backed, no cards, one caption bar "$200 / month (US)", top-aligned hook on a dragon-rider shot | bold claim ("Nobody built this game") | 34.1 s | B, 22:36 CET (Wed) | fill at the 2026-11-19 review (≈ 11 h) and 2026-11-20 (48 h). Only Reel of the day (slot A did not run). |
| cmwnvgcwp055woa07eep1i5fk | 2026-11-20 | free consumer AI tool with official product-UI footage (Google Gemini Tasks free, 3 days old, mainstream-covered; Citi-terms kicker), 100 % media-backed, no cards, no caption bars, blur-fill 9:16 composites of phone-UI clips, top-aligned hook on an Instacart cart | question ("Would you let Gemini spend your money?") | 30.7 s | A, 13:08 CET (Fri), batch-produced 2026-11-19 | fill at the 2026-11-21 review (24 h) and 2026-11-22 (48 h). First phone-UI frame 1; compare with robot/car/world frame 1s. |
| cmwnxztzb07h3oa07i9n553vx | 2026-11-19 | AI video demo with official footage (Pika Enact research preview: drag people inside a live AI video, 1 day old, no mainstream coverage seen), 100 % media-backed, no cards, pre-cropped 9:16 clips, top-aligned hook on a floating woman in a fur coat | watch this ("Watch the cursor lift this person, inside a live video.") | 27.9 s | B (early: owner asked for ASAP), 21:27 CET (Thu) | fill at the 2026-11-20 review (≈ 12 h) and 2026-11-21 (48 h). Compare with GR00T 2 (watch this, 22:47 Mon). |

Cadence: 2026-11-19 shipped 0/2 live — slot A did not run; slot B (catch-up 19:50) rendered and published in 67 min but Instagram rejected it with a login challenge on the channel (owner action needed; Reel ready to republish).

Cadence: 2026-11-18 shipped 1/2 — slot A (`newsroom-reel-a`, 11:00) has no run recorded in `cron/jobs.json` (`last_run_at` None) and no run folder; the daily review (09:30) did not run either; two long-form runs at 18:04 failed with "Operation interrupted: waiting for model response" (978 s and 1146 s). Slot B ran on time at 20:00 and scheduled at 22:36 CET. Four days: 5 of 8 Reels, every miss infrastructure.

Cadence: 2026-11-15 shipped 1/2 (slot B preflight block). 2026-11-16 shipped 1/2 (slot A `newsroom-reel-a` failed 11:26 CET, "Operation interrupted: waiting for model response (9.1s elapsed)", before creating a run folder; `cron/output/34f2779c91b4/2026-11-16_11-26-16.md`; still the open finding in `hermes cron doctor` on 2026-11-17). Two days, two Reels of four; both losses were infrastructure, one per job. The "question" hook arm owed by slot A goes to 2026-11-17 slot A. 2026-11-17 slot A: the 11:00 run died at 12:05 inside a 23-min blocking `studio still` (no ElevenLabs key → Edge TTS retries) after brief + spec; a catch-up run at 18:25 resumed the same folder and scheduled the Reel for 19:52 CET (cmwl03j0y0cddqv07uls4tj3c) — late, but the day can still ship 2/2 if slot B runs.

## Long-form (YouTube)

Weekly 8–14 min 16:9 video about AI, produced by `newsroom-longform-production` (job `newsroom-longform`). Same brand, voice and truth rules as the Reels; different success metrics. Everything here is `[prior]` until we have our own data.

- **Goal metrics:** click-through rate (CTR) on impressions, average view duration / % viewed, returning viewers, subscribers per video. Views follow from CTR × retention.
- **Topics:** AI stories with an arc that stay relevant for months: company and founder stories, "how X actually works", AI and money/jobs, the race between labs, failures and scandals explained, deep dives on launches our Reels showed people care about. Tech & AI is a comparatively high-RPM niche; finance and business-story angles on AI pay even better.
- **Packaging first:** title (≤ 60 chars, keyword early) and thumbnail (one subject, ≤ 4 huge words, different from the title) are decided before the script; ~40 % of the effort. 3 thumbnail variants per video for YouTube "Test & compare".
- **Story first (owner review 2026-11-19):** the first video (robotaxis) had no reason to keep watching: a quote card, three numbers without meaning, "who's winning?", a 5-item checklist promise, then one chapter per company. Every video now starts from `story.md` (thesis, central question, viewer stakes, but/therefore spine, characters) and a tested cold open: show a moment, a contradiction, one question, the viewer's stakes. See the long-form skill, step 2b and 4.
- **Script:** cold open with the peak moment or most surprising fact (never "welcome back"), promise in the first 30 s, open loop every 45–60 s, a mid-point turn, payoff of the title's promise at the end. ~1,150 words ≈ 8 min, ~1,650 ≈ 12 min (Brian ≈ 2.35 words/s).
- **Visuals:** footage first; AI-generated illustrations (`image_generate`, one consistent style per video) only for concepts, history and mood, never to fake real events, products, documents or people. Picture changes every 3–6 s. Chapters via `lf-chapter` + scene `chapter`.
- **Captions:** `style: plain`, `max_words: 4`, smaller than in Reels.
- **Publishing window:** publish time Thursday 20:00–22:00 Europe/Berlin (14:00–16:00 New York) is the target, but Postiz uploads at the scheduled time and the shared YouTube quota is usually gone by the evening: schedule long-form uploads 09:15–11:30 Berlin (first video: Fri 2026-11-20). Revisit after 6 videos.
- **Risks:** YouTube's "inauthentic content" policy demonetises mass-produced, repetitive AI content; every video needs its own research and angle, and structure and visuals must vary. Realistic AI-generated images must be disclosed in YouTube Studio ("altered or synthetic content"); the owner ticks it at upload when the report says so.
- **Status:** a YouTube channel is connected in Postiz since 2026-11-19 (Shorts scheduled through `publish-youtube`). The first long-form video (`runs/2026-11-19-LF-v2`) is packaged but could not be scheduled on 2026-11-19 because the Postiz key died (see guidance); the owner runs the command in its `READY.md`.

### Long-form process learnings (from run 2026-11-19-LF, the first video)

- **Pace:** 1,674 narration words over 90 scenes rendered a 663 s timeline (11:03) including holds, six chapter cards and a 15 s end card — ≈ 2.5 words/s effective, faster than the Reel rule of 2.35. Budget **~1,500 words ≈ 10 min, ~1,800 ≈ 12 min** for long-form (short declarative sentences; the validator's 2.8 w/s estimate of 661 s was within 1 %). Confidence: high (one render, measured).
- **Resume across days works:** research_*.md and assets.json from the interrupted 2026-11-18 run were reused unchanged; the resume run went from "no package" to render start in 42 min (titles + 2 fact-checkers in one batch 14 min, package/facts/script 10 min, critique + metadata batch 7 min, 9 illustrations in one `tool_call` batch < 1 min, spec + validate + 4 stills 8 min). Render: 90 scenes / 19,896 frames ≈ 33 min on 8 Chromium workers while other heavy jobs ran on the Mac (load avg > 200) — plan **~3 min of render per video minute** when the machine is busy.
- **Fact-check batches:** the heaviest cluster (US robotaxi claims, 7 clusters, `web_extract` backend down → browser fallback) took 841 s for 14 tool calls; the China/money cluster 333 s for 12. Give the cluster with the most primary PDFs the fewest claims; put the money file's "search-only, UNCONFIRMED" items first because they are the ones that change (RT6 "204,600 yuan" → Baidu's own rounded "200,000 yuan"; Uber "30 companies" → "over 30 AV partners"; Tesla "8 cities" → 6–8 depending on the Tesla page).
- **Retention critic:** a no-tool critic reading the beat table returns accuracy fixes worth taking (price vs cost, unsupported "subsidised", footage/narration mismatches, jargon) and hedged rewrites worth rejecting (its cold open buried the question; it wanted the "what it means for you" beat cut). Apply the fixes, keep the structure.
- **Illustrations:** one style line reused in every prompt ("cinematic editorial illustration, dark teal and warm orange palette, soft volumetric light, no text, no logos") gave nine consistent images (gpt-image-2, landscape) that all passed the no-text / no-logo / no-face check first time; review them on one xstack contact sheet in a single vision call. Use them only for concepts and mood (≤ 10 % of scenes here: 9 of 90).
- **Studio gotchas:** `lf-quote.name` ≤ 40 chars (validate catches it); `lf-points` needs `item_times` (narration-triggered reveal is unreliable for numbers); the terminal tool refuses `nohup … &` — use `terminal(background=true)` and poll `ls video.build | sed … | sort -n | tail -1` for the last finished scene; macOS has no `timeout`; `studio still` needs the ElevenLabs key exported or it blocks on Edge retries.
- **Thumbnails:** `studio thumbnail` positions the background with CSS cover, so a near-square photo cannot be shifted; composite it first with ffmpeg (blurred, darkened cover of the same photo as background, full photo overlaid on the side opposite the text). Compare the three `.small.jpg` previews at 320×180 in one stacked sheet; the first Cybercab crop failed the "nameable at phone size" test and was fixed this way.

- **Remake 2026-11-19-LF-v2, render and finish (2026-11-19 20:52–23:00):** the density pre-check on the spec predicted the render's `density` block almost exactly (5 warnings: 4 shots of 9.0–12.3 s and one 22-word sentence; 0 flat stretches, 2.1 questions/min, 163 wpm vs v1's 42 warnings) — do the spec check, skip the exploratory render. Render of 91 scenes / 17,728 frames took 17.2 min on an idle Mac (1.75 min per video minute; the 3-min budget is for a loaded machine). 1,564 words rendered 9:51 with six 3 s chapter cards: ≈ 2.65 w/s effective — for a 10-min+ video write ≥ 1,650 words. `studio qa` flags the chapter cards as "silence > 1.5 s" warnings; that is expected, not a defect. Finish work (QA, frames, description with final chapters, sources comment, tags from YouTube suggestions, READY.md) takes ~25 min and fits a resumed run. NHTSA's HTML press releases sit behind an Akamai block for both curl and the browser; cite the PDF under `nhtsa.gov/sites/nhtsa.gov/files/…` instead, which search backends index. Say quarters by name in scripts ("this summer", "in Q2"), never "last quarter" — it dates the video wrong within weeks.
- **Remake 2026-11-19-LF-v2 (story-first, pre-render):** story.md → two no-tool critics (story + cold open, 24 s total) → spec built from `part1.py`/`part2.py` → a word-count density check before any render (scenes ≥ 25 words, sentences > 20 words, > 40 s between `but/yet/instead/the catch/why/?`) → 8 stills on one xstack sheet → retention editor (3 min, reads the generated `script.md`). From blank folder to `RENDER_READY` in ~50 min with no render; the v1 remake would have cost two 35-min renders to learn the same density numbers. The story critic's "no" came from (a) no definition of "winning" and (b) stats before a person; both were fixable in the script, not the research. Keep: define the contested word out loud; give the viewer a stand-in (the Uber driver) in the cold open; spend the most human beat (Cruise) as the mid-point turn, not as the open. Rejected critic advice: inventing a named passenger (truth rule). Wording caught only by the retention editor: "earned Uber $25 B" (driver earnings, not revenue) and "promised this first" (Google 2012 was earlier) — a no-tool editor catches *sounds-wrong* claims that a fact-checker with the same facts file passed. Confidence: high on process; retention effect unknown until the render ships.

### Long-form log

| Video | Date | Topic | Title | Length | CTR | Avg view % | Notes |
|---|---|---|---|---|---|---|---|
| 2026-11-19-LF-v2 | planned 2026-11-20 11:00 | robotaxi race | Waymo vs Tesla Robotaxi: Who's Actually Winning? | 9:51 | – | – | Story-first remake; thumb A "$30K vs $200K"; schedule blocked by Postiz 401, owner publishes via READY.md |

## Machinery changelog

- 2026-11-17 — `bin/postiz.py posts` filters to our integration (`POSTIZ_INSTAGRAM_ID`) by default and adds `filtered_to_integration` to the output; `--all` shows the whole workspace. The Postiz workspace also carries the "Hedgy" (`explainedbyhedgy`) and "Quriozity" (`quriozity.ai`) channels, whose posts appeared next to ours on 2026-11-17.
- 2026-11-16 (B) — `hook` template: optional `align: "top"` (kicker + headline at the top, shade flipped, headline capped at 160 px). A 16:9 clip cover-cropped to 9:16 lands its subject at canvas y ≈ 770–1250, exactly under the default bottom-anchored headline; `align: top` keeps the subject visible. Used for the first and last scene of run 2026-11-16-B.
- 2026-11-16 — Added `bin/thumbcheck.py` (cover → Reels-tile and profile-grid preview sheet). Production skill step 7 now requires it.
- 2026-11-16 — Queued for the weekly review: optional dimmed full-bleed background media for the studio `list` and `quote` templates (today `list`/`stat`/`compare` take no media, `quote` only a round portrait), so long beats stop being dark cards. Until then, split long beats across `media` scenes.

## Learnings log

Newest first. Format: `YYYY-MM-DD — rule — evidence`.

- 2026-11-19 — Instagram can revoke the Postiz channel token with a login challenge ("Instagram requires you to log in at instagram.com … reconnect this channel"); the publish call still returns `ok: true` and a post id, the failure only shows 6 s later in `postiz.py posts` (state ERROR) and `notifications`. Always wait and check both after `--now`, and treat the channel as blocked for every queued post until the owner reconnects — run 2026-11-19-B. Confidence: high.
- 2026-11-19 — Launch films with burned-in subtitles: the subtitle FADES IN ~0.3 s before it is legible, so a "clean" window measured on 1-fps frames is ~0.3 s shorter at each end; when the clean window is shorter than the hook, pre-crop the 9:16 segment and freeze its last clean frame with `tpad=stop_mode=clone:stop_duration=N` instead of letting the scene run into the next shot — run 2026-11-19-B: two hook-clip rebuilds (75.5 s → 75.15 s cut) before the bottom strip of the frozen frame was text-free. Check the bottom 400 px of the frozen frame (`crop=1080:400:0:1520`) with vision before rendering. Confidence: high.
- 2026-11-19 — A 70-min catch-up slot is feasible: 5-cluster radar 14.6 min (bounded by "~15 tool calls"), orchestrator-side fact-check of the primary page instead of a subagent, no-tool hook writer (45 s) and critic (31 s), three renders — brief → published in 67 min (run 2026-11-19-B). The hook writer returned "Watch me…" lines that would have been false (the narrator is not the one dragging); write the hook yourself from the footage when the arm is "watch this". Confidence: high on process.
- 2026-11-19 — Low-res raw demo clips (832×480) with a debug label at the top: pre-crop a 254×452 window below the label (`crop=254:452:X:28`) and concatenate the moments where the subject stays inside a 31 %-wide window (`trim` + `concat`), because a person dragged across the frame leaves a fixed window within ~1.5 s — run 2026-11-19-B (corridor shot wasted 3 of 5 s in render 1; pool-hall + gym concat fixed it). Confidence: high.

- 2026-11-19 — Phone/card product-UI demo clips (Google Tasks, 16:9 with the UI centred at 35–40 % width) do not survive a 31.6 % cover crop; composite them as "blur-fill" 9:16 (blurred cover crop as background + the frame scaled ~1.23× centre-cropped to 1080 px, alpha-faded 140 px top/bottom via `alphamerge`) and keep the source timestamps — run 2026-11-20-A, recipe in the reel-production skill. Without the alpha fade the phone mockup's top edge shows as a hard seam on the contact sheet. Confidence: high (measured on two renders).
- 2026-11-19 — A "Ready to produce" backlog story whose slot never ran is the right pick for a batch Reel: freshness check + hooks in one 3.2-min delegate call, brief → scheduled in 46 min including three renders on a loaded machine — run 2026-11-20-A. Confidence: high on process.
- 2026-11-19 — Check a scene's real first frame for near-empty UI moments: the email clip at 10.5 s opened the Citi beat on a blank card for ~1.5 s (contact frame 21.7 s); shifting the in-point to 12.0 s fixed it, TTS cached so the re-render cost only capture time — run 2026-11-20-A. Confidence: high.

- 2026-11-18 — Browser-UI product recordings (Google "create/remix flow" clips, 2156×1212) cannot be cover-cropped clean: breadcrumb bar on top, side panel right, chip panels over the world at some moments. Pre-crop with ffmpeg to a 9:16 window inside the world area (`crop=609:1082:451:130` from a clean in-point, then `scale=1080:1920`) and check a 1-fps strip of the result before rendering — run 2026-11-18-B: the first crop still showed the breadcrumb and a chip panel, the second was clean. Confidence: high.
- 2026-11-18 — Demo clips with a prompt chip bottom-left (to ~43 % width) and a key widget bottom-right (from ~73 %) cannot be cleared by a 31.6 %-wide 9:16 window; measure the extents on a bottom-strip frame (`crop=1920:140:0:940` + 5 % grid) and switch to a UI-free shot instead of iterating positions — run 2026-11-18-B (aurora dragon shot replaced by the multi-world portal shot after a chip letter peeked into the corner). Confidence: high.
- 2026-11-18 — `fps=1` contact strips with burned timestamps (`drawtext=text='%{pts\:hms}'`, `tile=10x10`) let one vision call map a 90–110 s demo clip; use them before picking in-points — run 2026-11-18-B (7 clips mapped in 3 calls). Confidence: high.
- 2026-11-18 — A same-day story with official footage and no mainstream coverage beats a 30-h-old broader story on the rubric (Genie 4 3.96 vs Gemini Tasks 3.84) — but park the runner-up as a ready story (fact-checked, assets downloaded) so the next slot starts with a freshness check instead of a full radar. Confidence: medium on the rubric call (readout pending); high on the process.
- 2026-11-18 — Scope-bounded fact-checkers still overrun by a few calls (Genie: 19 calls vs "stop after ~15", 11.3 min; Gemini: 13 calls, 7.8 min; Citi: 5 calls, 4.8 min); the batch takes as long as its slowest child, so give the heaviest story the smallest claim list. Confidence: medium.
- 2026-11-18 — A no-tool retention critic may propose engagement bait ("tag your co-builder"); apply its structural notes, reject the bait — run 2026-11-18-B. Confidence: high.

- 2026-11-17 — A slot that dies mid-production is resumed by a catch-up run in the **same** folder: brief + candidates + assets survive, only the spec/render is redone (run 2026-11-17-A: morning run interrupted at 12:05 by a 23-min blocking `studio still` without the ElevenLabs key; catch-up at 18:25 shipped in ~45 min). Keep every terminal command < 10 min; render in `terminal(background=true)` and poll. Confidence: high.
- 2026-11-17 — `studio still` seeks video ~1–1.5 s earlier than the render does; pick video in-points, `position` and `cover_time` from accurate `ffmpeg -ss` frames, and judge the real cover only after the render (run 2026-11-17-A: three renders spent on the cover and a shot that had already passed). Confidence: high (measured twice in one run).
- 2026-11-17 — Short punchy sentences run ~2.75 w/s on Brian (84 words → 30.5 s speech); long sentences ~2.35 w/s. Scripts of ≤ 8-word sentences need ~95 words for 35 s — run 2026-11-17-A `reel.report.json`. Confidence: medium (one run each).
- 2026-11-17 — Scope-bounded subagent briefs ("no tools, one message" for hooks/critique; "≤ 8 tool calls, ≤ 3 pages" for a freshness check) returned in 2–4 min each, all three in one 4.3-min `delegate_task` — run 2026-11-17-A. Confidence: high; the earlier overruns came from open-ended briefs.
- 2026-11-19 — Voice A/B on the Genie 4 Reel: per-scene TTS (restarting intonation at every cut, silence on both sides) vs one continuous take with natural pauses (A, 37.0 s) vs one continuous take with long pauses shortened (B, 34.9 s). Owner chose B; it is now the studio default for ElevenLabs (`mode: continuous`, `pauses: tight`). Karaoke active word is a white box with dark text (was orange).
- 2026-11-19 — No corner wordmark bug, no media caption bars, no accent rule above the opening title and no orange highlight in it: opening titles are plain white. Enforced by `text: minimal` — owner review of the Genie 4 Reel (2026-11-18-B).
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
