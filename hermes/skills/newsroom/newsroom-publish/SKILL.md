---
name: newsroom-publish
description: "Schedule or publish a finished Frontier Feed Reel to Instagram and the same video as a YouTube Short through the Postiz API, record both in the ledger, and verify they went out."
version: 1.0.0
platforms: [macos, linux]
required_environment_variables:
  - name: POSTIZ_API_KEY
    prompt: Postiz public API key
  - name: POSTIZ_INSTAGRAM_ID
    prompt: Postiz integration id of the Instagram account
metadata:
  hermes:
    tags: [newsroom, postiz, instagram, youtube, publishing]
    category: newsroom
    requires_toolsets: [terminal]
---

# Frontier Feed publish

## When to use

After `newsroom-reel-production` produced `reel.mp4`, `reel.cover.jpg` and `caption.txt` that passed QA.

> **Instagram is back on a new account (2026-11-20), in warm-up until 2026-11-27:** at most one Instagram Reel per day, slot A (13:00–15:30), on the next free day after the queued backlog listed in the playbook's Account status. The YouTube Short (step 3b) goes out for every Reel as before.

## Procedure

1. **Check the calendar.** `python3 bin/postiz.py posts --days 2` and the "Already scheduled" section of the run context; for YouTube also the channel page `https://www.youtube.com/@frontierfeed_ai/shorts` (titles already live). Never schedule two Reels less than 4 hours apart, never more than 3 in 24 hours, and never a title that is already on the channel.

2. **Pick the time.** Use the posting window for this slot from `playbook.md` (Europe/Berlin). Choose the exact minute inside the window based on the learnings log (default: the start of the window plus a few minutes, not on the hour). Breaking news that scored ≥ 4.3 may go out immediately with `--now`.

3. **Publish.**
   ```sh
   python3 bin/postiz.py publish \
     --video runs/<run>/reel.mp4 \
     --cover runs/<run>/reel.cover.jpg \
     --caption-file runs/<run>/caption.txt \
     --at 2026-11-16T14:05:00+01:00 \
     --topic <short-topic-slug> \
     --run-dir runs/<run>
   ```
   Add `--trial` only when the playbook's current experiment calls for a Trial Reel. `made_with_ai` is set by default because the voice is synthetic; keep it.

3b. **YouTube Short (every Reel, owner direction 2026-11-19).** The same `reel.mp4` goes to the YouTube channel; vertical and under 3 minutes, so YouTube files it as a Short.
   - **Time:** Postiz cloud shares one YouTube API project between all its customers and its daily upload quota runs out in the evening (2026-11-19: "daily upload quota is exhausted" at 20:04 and 20:09 CET). The quota resets at 09:00 Europe/Berlin, and Postiz uploads at the scheduled time, so schedule Shorts between **09:15 and 11:30 Berlin** on the Instagram date (the next morning if that morning has already passed), at least 20 minutes apart from other YouTube uploads (check `postiz.py posts`). Never schedule a YouTube upload after 13:00.
   - **Research the keywords** first: YouTube search suggestions for 4-6 candidate terms (`curl -s "https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=<term>"`). Use the phrasings people actually type.
   - **Title** (≤ 70 characters, no hashtags): the main keyword first, then the hook as a question or stake (e.g. "Gemini Tasks Is Now Free: Would You Let It Spend Your Money?").
   - **Description** `runs/<run>/youtube_description.txt` (≤ 1,500 characters): line 1 expands the title with the keyword; 3-5 fact bullets with dates; the caveat; one real question; sources with URLs; "Narration: AI voice."; last line 2-3 hashtags ending with `#Shorts`.
   - **Tags:** 8-12 from the suggestions, most specific first.
   ```sh
   python3 bin/postiz.py publish-youtube --video runs/<run>/reel.mp4 \
     --title "<title>" --description-file runs/<run>/youtube_description.txt \
     --tags "<tag1>,<tag2>,..." --privacy public --at 2026-11-20T09:30:00+01:00 \
     --topic <slug> --run-dir runs/<run>
   ```
   No `--thumbnail` for Shorts. If Postiz later reports the quota error in `notifications`, **first open `https://www.youtube.com/@frontierfeed_ai/shorts` (browser, "Alle ablehnen" on the consent page) and check whether the title is already on the channel** — on 2026-11-19 the 20:02 `--now` upload went live at 20:13 although Postiz logged "quota is exhausted" at 20:04 and 20:09, and the 09:30 reschedule created a duplicate Short. Only if the title is missing: delete that post (`postiz.py delete <id>`) and reschedule it for the next morning 09:15-11:30. If it is live, record the real video id in `report.md` and do not re-upload.

4. **Verify.** The command prints `"ok": true` and Postiz post ids and appends to `data/posts.jsonl`. Then run `python3 bin/postiz.py posts --days 2` to confirm the post is in the calendar. For `--now`, wait ~2 minutes and check `python3 bin/postiz.py notifications` for errors.

5. **Report.** Write `runs/<run>/report.md`: topic, angle, hook used, experiment variable, length, scheduled times and Postiz post ids for Instagram and YouTube.

## Failure handling

- **`Invalid API key` (HTTP 401) on every call** means the owner rotated `POSTIZ_API_KEY` in `../.env` (check the file's mtime), not a Postiz outage. The cron environment keeps the key it started with, and the terminal tool does not carry `export`ed variables from one call to the next, so prefix **every** Postiz command in the same call: `export POSTIZ_API_KEY="$(grep -E '^POSTIZ_API_KEY=' ../.env | cut -d= -f2- | tr -d '"'"'"' ')"` (the `export $(grep … | xargs)` form silently kept the stale value on 2026-11-19).
- **Queued posts can vanish from the calendar** after the owner reconnects the Instagram channel: on 2026-11-19 the three batch-scheduled Instagram Reels disappeared while their YouTube Shorts stayed. Before scheduling, compare `postiz.py posts --days 3 --all` with the ledger's last `postiz_post_ids`; list missing posts with their republish commands in `report.md` and in the playbook guidance so the next run that sees the channel working can re-schedule them.

- HTTP 4xx with a validation error: read the message, fix the input (caption length, file format, cover) and retry once.
- 429: the script already retries; if it still fails, wait 10 minutes and retry.
- **401 "Invalid API key" with an unchanged `.env` key**: seen 2026-11-19 22:30–22:45 CET on every endpoint, then gone with the same key. Treat it as a Postiz incident, not a rotated key: probe `curl -s -o /dev/null -w '%{http_code}' -H "Authorization: $POSTIZ_API_KEY" "$POSTIZ_API_URL/integrations"` once a minute for up to 15 min while finishing caption/QA, then publish. Only after that leave a `READY.md` with the exact commands and report the blocker. In this terminal the POSTIZ_* variables may be missing: load them with `set -a; eval "$(grep -E '^POSTIZ_' ../.env | tr -d '"')"; set +a` in the same command as the `postiz.py` call.
- **Notifications are workspace-wide** (Hedgy, Quriozity channels too): a "published on Instagram-standalone" notice is not proof that the Frontier Feed channel works; open the Reel URL in the browser and read the account name.
- Upload fails because the file is too large: re-render at a lower bitrate (Instagram limit 300 MB, 25 Mbps); do not use Postiz `--adjust` unless rendering cannot fix it.
- Errors in `notifications` after publishing: diagnose, fix, republish once, and add the cause to the playbook's learnings log.
- **"Instagram requires you to log in at instagram.com and follow its instructions before posting can resume. After that, please reconnect this channel."** (paired with "Could not refresh your instagram-standalone channel"): the account has a login challenge and the Postiz token is dead. `publish` still returns `ok: true` and a post id; the post flips to state `ERROR` ~6 s later. Do not retry and do not produce another Reel for the channel: write the recovery steps into `report.md` (owner logs in at instagram.com, reconnects the channel in Postiz → Launches, then republishes the ready files with the same command after checking `posts --days 1` for a duplicate), flag it at the top of the playbook's guidance section, and report it. Seen 2026-11-19-B.
- **`HTTP 401 Invalid API key` on any call** (seen 2026-11-19 22:30 CET, 15 min after the same key had scheduled a Short; `../.env` unchanged): the key was invalidated on the Postiz side. Probe once with `curl -s -o /dev/null -w '%{http_code}' -H "Authorization: $POSTIZ_API_KEY" "$POSTIZ_API_URL/integrations"`, retry once after ~5 min, then stop: write `READY.md` with the exact publish command, flag it at the top of the playbook guidance, and report. The owner regenerates the key in Postiz → Settings → Public API and updates `POSTIZ_API_KEY` in `../.env`.
- After `--now`, always wait ~75 s and check BOTH `postiz.py posts --days 1` (state must be PUBLISHED with a releaseURL) and `postiz.py notifications`; `ok: true` from `publish` only means Postiz accepted the job.

## Verification

Two new lines in `data/posts.jsonl` (Instagram and YouTube) with Postiz post ids, and both posts visible in `postiz.py posts`.
