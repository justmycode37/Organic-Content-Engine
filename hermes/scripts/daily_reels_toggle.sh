#!/bin/bash
# Pause or resume the two daily Reel jobs (newsroom-reel-a, newsroom-reel-b).
# Used around batch runs that pre-produce and schedule Reels for future slots,
# so the daily jobs do not add extra Reels on top (max 3 Reels per 24 h).
# Usage: daily_reels_toggle.sh pause|resume [job_id ...]
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
action="$1"; shift || true
jobs=("$@")
[ ${#jobs[@]} -eq 0 ] && jobs=(012429a41bda d14af159f261)
for j in "${jobs[@]}"; do
  "$HERE/bin/hermes" cron "$action" "$j" >/dev/null && echo "$action $j: ok"
done
