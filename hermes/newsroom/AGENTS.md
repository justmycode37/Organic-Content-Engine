# Frontier Feed workspace

This folder is the working directory of every Frontier Feed cron job. All paths below are relative to it.

## Map

| Path | Purpose |
|---|---|
| `playbook.md` | Living strategy. Read before every run, update after every review. |
| `bin/postiz.py` | Publishing and analytics client (Postiz API). Prints JSON. |
| `data/posts.jsonl` | Ledger of every scheduled or published post. Written by `postiz.py publish`. |
| `data/metrics.jsonl` | Analytics snapshots. Written by `postiz.py collect` / `analytics-account`. |
| `data/backlog.md` | Evergreen topic ideas and stories that were good but not used yet. |
| `runs/<YYYY-MM-DD>-<slot>/` | One folder per Reel run: research, script, spec, renders, caption, report. |
| `../studio/` | Reel renderer. `../studio/bin/studio --help`, docs in `../studio/README.md`. |
| `../skills/newsroom/` | The procedures: news radar, reel production, publishing, growth review. |

## Commands

```sh
python3 bin/postiz.py publish --video runs/X/reel.mp4 --caption-file runs/X/caption.txt \
  --cover runs/X/reel.cover.jpg --at 2026-11-16T14:05:00+01:00 --topic openai-sora-3 --run-dir runs/X
python3 bin/postiz.py collect --days 14      # per-post metrics for the ledger
python3 bin/postiz.py analytics-account --days 7
python3 bin/postiz.py posts --days 3         # what Postiz has scheduled or published
python3 bin/postiz.py notifications          # publish errors

../studio/bin/studio templates
../studio/bin/studio validate runs/X/spec.json
../studio/bin/studio render runs/X/spec.json -o runs/X/reel.mp4
../studio/bin/studio qa runs/X/reel.mp4
```

`POSTIZ_API_KEY`, `POSTIZ_API_URL` and `POSTIZ_INSTAGRAM_ID` are already in the environment. Never print the key.

## Run folder contract

Every production run leaves these files, so later reviews can learn from them:

- `candidates.md` — scored topic candidates with sources
- `brief.md` — chosen story, angle, why it should travel, facts with source URLs
- `script.md` — hook variants considered, final narration, on-screen text
- `spec.json` — studio spec actually rendered
- `reel.mp4`, `reel.cover.jpg`, `reel.contact.jpg`, `reel.report.json`
- `caption.txt`
- `report.md` — what shipped, when, the experiment variable, open questions

## Guardrails

- Never delete or edit posts that are already live unless they contain a factual error; then delete, log it in `playbook.md`, and post a correction if the error was material.
- Never post more than 3 Reels in 24 hours.
- Do not modify anything outside the `hermes/` folder.
