---
name: newsroom-publish
description: "Schedule or publish a finished Frontier Feed Reel to Instagram through the Postiz API, record it in the ledger, and verify it went out."
version: 1.0.0
platforms: [macos, linux]
required_environment_variables:
  - name: POSTIZ_API_KEY
    prompt: Postiz public API key
  - name: POSTIZ_INSTAGRAM_ID
    prompt: Postiz integration id of the Instagram account
metadata:
  hermes:
    tags: [newsroom, postiz, instagram, publishing]
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

4. **Verify.** The command prints `"ok": true` and Postiz post ids and appends to `data/posts.jsonl`. Then run `python3 bin/postiz.py posts --days 2` to confirm the post is in the calendar. For `--now`, wait ~2 minutes and check `python3 bin/postiz.py notifications` for errors.

5. **Report.** Write `runs/<run>/report.md`: topic, angle, hook used, experiment variable, length, scheduled time, Postiz post id.

## Failure handling

- HTTP 4xx with a validation error: read the message, fix the input (caption length, file format, cover) and retry once.
- 429: the script already retries; if it still fails, wait 10 minutes and retry.
- Upload fails because the file is too large: re-render at a lower bitrate (Instagram limit 300 MB, 25 Mbps); do not use Postiz `--adjust` unless rendering cannot fix it.
- Errors in `notifications` after publishing: diagnose, fix, republish once, and add the cause to the playbook's learnings log.

## Verification

A new line in `data/posts.jsonl` with a Postiz post id, and the post visible in `postiz.py posts`.
