#!/usr/bin/env bash
# (Re)create the Frontier Feed cron jobs for this Hermes home.
#
# Idempotent: removes existing jobs whose name starts with "newsroom-" and
# creates them again with paths resolved from this folder, so it is also the
# step to run after moving the folder to another machine.
#
# Usage: scripts/install-jobs.sh [--paused]
set -euo pipefail

HERE=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
HERMES="$HERE/bin/hermes"
WORKDIR="$HERE/newsroom"
MODEL=(--model claude-fable-5-1 --provider anthropic --reasoning-effort max)
COMMON=(--timezone Europe/Berlin --workdir "$WORKDIR" --script newsroom_context.py --deliver local)
EXTRA=()
[ "${1:-}" = "--paused" ] && EXTRA+=(--paused --paused-reason "installed paused")

# Remove previous Frontier Feed jobs.
python3 - "$HERE/cron/jobs.json" <<'EOF' | while read -r id; do
import json, sys
from pathlib import Path
path = Path(sys.argv[1])
if path.exists():
    data = json.loads(path.read_text())
    jobs = data.get("jobs", data) if isinstance(data, dict) else data
    for job in jobs:
        if str(job.get("name", "")).startswith("newsroom-"):
            print(job["id"])
EOF
    "$HERMES" cron remove "$id" >/dev/null && echo "removed $id"
done

reel_prompt() {
    local slot=$1 window=$2
    cat <<EOF
Produce and schedule today's Frontier Feed Reel for slot $slot (posting window $window Europe/Berlin).

1. Read playbook.md and the run context above. Create the run folder runs/<YYYY-MM-DD>-$slot/.
2. newsroom-news-radar: find, score and verify the best story right now. Use subagents in parallel.
3. newsroom-reel-production: brief, hooks, script, critique, assets, spec, render, QA, caption.
4. newsroom-publish: schedule inside the $slot window (or --now for breaking news that scores >= 4.3).
5. Write runs/<run>/report.md. If you learned something about the process, update the playbook or the relevant skill now.

Work autonomously; nobody will answer questions. If something fails and cannot be fixed, write the cause into the run report and the playbook learnings log, and still try to ship the best possible Reel from the backlog.
End with a 5-line summary: story, hook, length, scheduled time, experiment variable.
EOF
}

"$HERMES" cron create "0 11 * * *" "$(reel_prompt A '13:00-15:30')" --name newsroom-reel-a \
    --skill newsroom-news-radar --skill newsroom-reel-production --skill newsroom-publish \
    "${MODEL[@]}" "${COMMON[@]}" "${EXTRA[@]}"

"$HERMES" cron create "0 20 * * *" "$(reel_prompt B '22:30-00:30')" --name newsroom-reel-b \
    --skill newsroom-news-radar --skill newsroom-reel-production --skill newsroom-publish \
    "${MODEL[@]}" "${COMMON[@]}" "${EXTRA[@]}"

"$HERMES" cron create "30 9 * * *" "Daily growth review for Frontier Feed. Follow newsroom-growth-review (daily mode): collect analytics, compare recent posts, update playbook.md with dated, evidence-backed learnings and the experiment status. Today's two production runs read the playbook, so make the guidance concrete. End with the 5-line summary." \
    --name newsroom-growth-daily --skill newsroom-growth-review \
    "${MODEL[@]}" "${COMMON[@]}" "${EXTRA[@]}"

"$HERMES" cron create "0 10 * * 0" "Weekly deep review for Frontier Feed. Follow newsroom-growth-review (weekly mode): analyse every post so far, close or start experiments, revise topic priorities, scoring weights and posting windows where the data supports it, and improve the Frontier Feed skills (skill_manage) and the studio templates where recurring problems come from them. Prune data/backlog.md. End with the 5-line summary." \
    --name newsroom-growth-weekly --skill newsroom-growth-review --skill newsroom-reel-production \
    "${MODEL[@]}" "${COMMON[@]}" "${EXTRA[@]}"

"$HERMES" cron list
