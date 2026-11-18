---
name: newsroom-growth-review
description: "Pull Instagram analytics for Frontier Feed via Postiz, compare posts, extract what drives views, and rewrite the playbook and skills accordingly (daily quick review, weekly deep review)."
version: 1.0.0
platforms: [macos, linux]
required_environment_variables:
  - name: POSTIZ_API_KEY
    prompt: Postiz public API key
metadata:
  hermes:
    tags: [newsroom, analytics, growth, self-improvement]
    category: newsroom
    requires_toolsets: [terminal, file]
---

# Frontier Feed growth review

## When to use

- **Daily** (morning job): quick review of the last 72 hours.
- **Weekly** (Sunday job): deep review of all posts, experiments and the playbook itself.
- Ad hoc, whenever a post strongly over- or under-performs.

## Procedure

1. **Collect.** `python3 bin/postiz.py collect --days 14` (per-post metrics) and `python3 bin/postiz.py analytics-account --days 7`. Both append to `data/metrics.jsonl`. Postiz gives views, reach, saves, likes, comments, shares only — no watch time or completion — so retention is diagnosed from the render (step 4), not from the API.

1b. **Check the account and the cadence before reading numbers.**
   - Public profile state: open `https://www.instagram.com/<handle>/` (handle from the playbook's Account status section, not from Postiz) with `browser_exec`, click the "Optionale Cookies ablehnen" / "Decline optional cookies" button, then read `<meta property="og:description">` (`"N Follower, N gefolgt, N Beiträge – … von <Display name> (@handle)"` or `"N Followers, N Following, N Posts"`), `<meta name="description">` (contains the bio text) and `og:image` (avatar present when it is a `cdninstagram` URL). Take the display name from `og:description`, not `document.title` (the harness prefixes the title with an emoji). Note followers, avatar, bio, display name vs. brand. Followers < 100 means every view is non-follower test distribution; views under ~200 reach are not a content signal.
   - If the profile page says "Profile ist nicht verfügbar" / "Profile isn't available", the owner has probably renamed the account: open a Reel `releaseURL` from `postiz.py posts` and read the live handle from its `og:description` (`"N likes, N comments - <handle> am <date>"`). Postiz `integrations` keeps the old `profile` value; record the new handle in the playbook's Account status and flag the stale Postiz field as an owner action. A profile change inside the review window is a confound: do not attribute a reach jump to content until a post made after the change is compared with another post made after it.
   - Did every production slot actually ship? Compare `data/posts.jsonl` with the two slots per day; if a slot is missing, read `hermes cron doctor` and `../cron/output/<job id>/<date>.md` for the reason (a preflight block such as a missing provider credential shows there) and report it as a cadence failure with the cause. Do not edit cron jobs from a review run.
   - Per-post live state: `python3 bin/postiz.py posts --days 3` (state, `releaseURL`; filtered to our integration — the Postiz workspace also carries other brands' channels, `--all` shows them) and `notifications` (publish errors, workspace-wide — match the Reel URLs against ours). Opening the `releaseURL` confirms the AI-content label ("KI-Inhalte" / "AI info") and the public like/comment counts.

2. **Normalise.** Compare posts at similar age (views at ~24 h and ~48 h). Compute per post: views, shares/reach, saves/reach, likes/reach, comments. Join with each post's `runs/<run>/report.md` and `brief.md` to get topic category, hook style, length, template sequence, posting time, experiment variable.

3. **Find the drivers.** Which topic categories, hook styles, lengths and posting times sit in the top third vs. bottom third? With fewer than ~10 posts, treat everything as a weak signal and say so. Do not chase one outlier; look for repeated patterns. Experiment arms count only for posts with ≥ 200 reach at 48 h (readout threshold in the playbook); below that, fill the experiment-log row with the numbers and "logged, not counted".

4. **Diagnose the bottom posts.** Watch the actual Reel frames (contact sheet) and read the script: weak hook, slow first 3 seconds, unclear payoff, boring topic, bad timing? Write the most likely cause. Two measurements make this concrete:
   - Scene timing table from `runs/<run>/reel.report.json` (`scenes[]` with `template`, `start`, `duration`, `words`; media per scene from `spec.json`): seconds on no-media templates (`list`, `stat`, `quote`, `compare`) vs. photo/video-backed scenes, and the longest stretch without a background change. Playbook rule: no-media scenes ≤ 6 s, ≥ 55% of runtime media-backed.
   - Thumbnail check: `python3 bin/thumbcheck.py runs/<run>/reel.cover.jpg -o runs/<review>/<topic>.cover.thumbcheck.jpg`, then vision: is the subject nameable at tile size without the text, is the headline readable?

5. **Update the playbook.** In `playbook.md`:
   - Add dated entries to the learnings log: `YYYY-MM-DD — rule — evidence (post ids, numbers)`.
   - Promote `[prior]` rules that the data confirms (replace the tag with the evidence), demote or delete rules the data contradicts.
   - Adjust topic priorities, scoring weights and posting windows when there is evidence.
   - Close finished experiments with their result, queue the next one. One variable at a time.
   - Update "Last reviewed".

6. **Improve the machinery (weekly).** If a recurring problem comes from a procedure, fix the relevant skill with `skill_manage` (radar, production, publish, or this one). If it comes from the renderer, improve `../studio/`. Keep a short changelog line in the playbook.

7. **Report.** End with a 5-line summary: best post and why, worst post and why, the rule you changed, the experiment running now, what tomorrow's runs should do differently. Keep the review's own trail in `runs/<YYYY-MM-DD>-review/review.md` (numbers table, scene timings, thumbnail sheet, actions, owner actions). Anything only the owner can fix (profile rename, avatar, bio, credentials) goes at the top of the report, not buried in the playbook.

## Pitfalls

- Postiz returns 0 for very new posts and for accounts with tiny reach; a 0 under 6 hours old is not a signal.
- A 0-follower account with **no name, no avatar and no bio** yields single-digit views per Reel whatever the content (2026-11-15: 5 views / 4 reach, final at 48 h). Once the profile is complete, a 0-follower account does get test distribution (2026-11-16: 146 reach in 10.7 h). Read the profile state first; otherwise every "rule" you derive is noise.
- Shares / reach is the earliest quality signal Postiz exposes (sends); compute it from the first collection even when reach is small, and say how many sends the percentage stands for (3 of 146 is not a trend).
- Instagram's public pages are localised (German when the browser is in Germany): match both "Follower" and "Followers" in the meta description, and both cookie-button labels.
- Contact-sheet frames of `stat` scenes show mid-count-up numbers; they are not factual errors.
- `percentageChange` from Postiz is not meaningful; ignore it.
- Views alone hide quality. A Reel with fewer views but high shares per reach shows an angle worth repeating.
- Correlation is not causation with a handful of posts. Write the confidence level next to each rule.

## Verification

`playbook.md` has a new "Last reviewed" date and at least one dated learnings entry (or an explicit "no new evidence" line).
