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

## Procedure

1. **Check the calendar.** `python3 bin/postiz.py posts --days 2` and the "Already scheduled" section of the run context. Never schedule two Reels less than 4 hours apart, and never more than 3 in 24 hours.

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
   No `--thumbnail` for Shorts. If Postiz later reports the quota error in `notifications`, delete that post (`postiz.py delete <id>`) and reschedule it for the next morning 09:15-11:30.

4. **Verify.** The command prints `"ok": true` and Postiz post ids and appends to `data/posts.jsonl`. Then run `python3 bin/postiz.py posts --days 2` to confirm the post is in the calendar. For `--now`, wait ~2 minutes and check `python3 bin/postiz.py notifications` for errors.

5. **Report.** Write `runs/<run>/report.md`: topic, angle, hook used, experiment variable, length, scheduled times and Postiz post ids for Instagram and YouTube.

## Failure handling

- HTTP 4xx with a validation error: read the message, fix the input (caption length, file format, cover) and retry once.
- 429: the script already retries; if it still fails, wait 10 minutes and retry.
- Upload fails because the file is too large: re-render at a lower bitrate (Instagram limit 300 MB, 25 Mbps); do not use Postiz `--adjust` unless rendering cannot fix it.
- Errors in `notifications` after publishing: diagnose, fix, republish once, and add the cause to the playbook's learnings log.

## Verification

Two new lines in `data/posts.jsonl` (Instagram and YouTube) with Postiz post ids, and both posts visible in `postiz.py posts`.
