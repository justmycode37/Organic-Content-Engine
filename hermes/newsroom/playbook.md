# Frontier Feed playbook

Living strategy for the Frontier Feed Instagram channel. The agent owns this file and rewrites it as evidence comes in. Every rule should name its evidence (post ids, numbers) or be marked `[prior]` (starting assumption from research, not yet tested on this account).

Last reviewed: 2026-11-15 (initial version, no posts yet)

## Brand

Single source of truth for naming. Do not change this section; the owner sets it.

- Name: **Frontier Feed**
- Instagram handle: set by the owner after the rename (currently connected in Postiz as `tokenize_ai`; read the live handle with `python3 bin/postiz.py integrations`, field `profile`)
- Promise: the AI frontier, explained in under a minute, every day
- Spoken sign-off (optional, last beat): "That's the Frontier Feed."
- Visual identity: see `../studio/themes/` (logo and colours are set there)

## North-star metric

Views per Reel at 48 h. Supporting signals, in order: sends per reach, average watch time / completion, saves per reach, follows per Reel.

## Audience and language

- English, global. `[prior]` Largest AI-news accounts are English; models and launches are named in English.
- Write for a curious non-engineer. If a 16-year-old and their parent would not both get the point, simplify.

## Posting windows (Europe/Berlin)

| Slot | Window | Why |
|---|---|---|
| A | 13:00–15:30 | `[prior]` US East morning plus EU afternoon |
| B | 22:30–00:30 | `[prior]` US prime time |

Pick the exact minute inside the window. Breaking news of score ≥ 4.3 may go out immediately (`--now`) instead of waiting for the window. Revisit after ~30 posts using our own data.

## Topic priorities `[prior]`

1. Visual "AI did X" demos: video/image generators, robots, real-time voice. Showable in 2 seconds.
2. Free tools you can use today: practical value drives saves and sends.
3. AI and jobs or money: layoffs, prices, salaries, who gets rich.
4. Big-tech drama and lawsuits: characters and conflict.
5. Major model launches: only if we are early or can show it, not just name it.
6. Leaks and rumours: only clearly labelled, only from credible leakers, never as fact.

Skip: policy without a concrete consequence, benchmark tables without a "so what", funding rounds, papers without a demo, enterprise partnerships.

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

Hard gate: source confidence ≤ 2 → reject or frame explicitly as "unconfirmed". Subtract up to 0.75 for legal or defamation risk.

## Format rules `[prior]`

- Length: 25–40 s for news, 40–60 s for demos and explainers. Never over 90 s.
- Frame 1 is the hook: big on-screen text (≤ 7 words) plus the most striking visual. No logo intro, no fade from black.
- First spoken line ≤ 2 s, states the payoff or the tension.
- Every 2–3 s something changes on screen.
- Burned-in word-level captions.
- End with a real, specific question or a one-line takeaway, not "follow for more".
- Credit sources on screen ("Source: OpenAI blog") and in the caption.
- Footage: own screen recordings, press-kit assets, short credited excerpts with heavy commentary. Never full re-uploads.
- Label AI voice (`made_with_ai` stays on unless the voice is human).
- Voice: ElevenLabs (`"voice": {"provider": "elevenlabs", "voice": "nPczCjzI2devNBz1zQrb", "rate": "+5%"}`, "Brian", deep US narrator) `[prior]`. Keep one voice across Reels so the channel sounds recognisable; Edge is only the automatic fallback.

## Caption rules `[prior]`

- Line 1 restates the hook in different words (it shows above "more").
- 2–4 short lines of substance, then source line, then a question.
- 3–5 specific hashtags (#OpenAI #Sora), keywords in plain text for search.

## Experiments queue

Run one at a time, at least 4 posts per arm, record results below.

1. Hook style: bold claim vs. question vs. "watch this".
2. Length: ~30 s vs. ~50 s on the same topic type.
3. Voice: Brian vs. a second ElevenLabs voice (e.g. Sarah `EXAVITQu4vr4xnVDxPEm`), only after hooks and length are settled.
4. Trial Reels: test two hooks for the same story (one as trial) when a story is strong.

## Learnings log

Newest first. Format: `YYYY-MM-DD — rule — evidence`.

- (none yet)
