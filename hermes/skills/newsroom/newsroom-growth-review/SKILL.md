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

1. **Collect.** `python3 bin/postiz.py collect --days 14` (per-post metrics) and `python3 bin/postiz.py analytics-account --days 7`. Both append to `data/metrics.jsonl`.

2. **Normalise.** Compare posts at similar age (views at ~24 h and ~48 h). Compute per post: views, shares/reach, saves/reach, likes/reach, comments. Join with each post's `runs/<run>/report.md` and `brief.md` to get topic category, hook style, length, template sequence, posting time, experiment variable.

3. **Find the drivers.** Which topic categories, hook styles, lengths and posting times sit in the top third vs. bottom third? With fewer than ~10 posts, treat everything as a weak signal and say so. Do not chase one outlier; look for repeated patterns.

4. **Diagnose the bottom posts.** Watch the actual Reel frames (contact sheet) and read the script: weak hook, slow first 3 seconds, unclear payoff, boring topic, bad timing? Write the most likely cause.

5. **Update the playbook.** In `playbook.md`:
   - Add dated entries to the learnings log: `YYYY-MM-DD — rule — evidence (post ids, numbers)`.
   - Promote `[prior]` rules that the data confirms (replace the tag with the evidence), demote or delete rules the data contradicts.
   - Adjust topic priorities, scoring weights and posting windows when there is evidence.
   - Close finished experiments with their result, queue the next one. One variable at a time.
   - Update "Last reviewed".

6. **Improve the machinery (weekly).** If a recurring problem comes from a procedure, fix the relevant skill with `skill_manage` (radar, production, publish, or this one). If it comes from the renderer, improve `../studio/`. Keep a short changelog line in the playbook.

7. **Report.** End with a 5-line summary: best post and why, worst post and why, the rule you changed, the experiment running now, what tomorrow's runs should do differently.

## Pitfalls

- Postiz returns 0 for very new posts and for accounts with tiny reach; a 0 under 6 hours old is not a signal.
- `percentageChange` from Postiz is not meaningful; ignore it.
- Views alone hide quality. A Reel with fewer views but high shares per reach shows an angle worth repeating.
- Correlation is not causation with a handful of posts. Write the confidence level next to each rule.

## Verification

`playbook.md` has a new "Last reviewed" date and at least one dated learnings entry (or an explicit "no new evidence" line).
