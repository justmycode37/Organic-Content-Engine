# Hermes Agent home

This folder is a self-contained [Hermes Agent](https://github.com/NousResearch/hermes-agent)
installation. It serves as `HERMES_HOME`, so config, memory, skills, sessions, cron
jobs and the runtime itself all live here and nowhere else on the machine.

## Usage

```sh
hermes/bin/hermes            # start a chat
hermes/bin/hermes status     # show model, gateway and jobs
hermes/bin/hermes setup      # interactive setup wizard (model, platforms, keys)
```

Always go through `bin/hermes`. It sets `HERMES_HOME` to this folder; calling the
upstream `hermes` command directly falls back to `~/.hermes`.

## Layout

| Path | Kind | In git | Notes |
|---|---|---|---|
| `bin/hermes` | launcher | yes | Resolves this folder, sets `HERMES_HOME` |
| `scripts/bootstrap.sh` | installer | yes | Installs the pinned runtime into this folder |
| `HERMES_VERSION` | pin | yes | Upstream commit installed by bootstrap |
| `scripts/install-jobs.sh` | installer | yes | (Re)creates the Frontier Feed cron jobs for this folder |
| `scripts/newsroom_context.py` | cron context | yes | Injects recent posts and metrics into every Frontier Feed job |
| `config.yaml` | config | yes | Model, delegation, approvals, env passthrough. No secrets |
| `SOUL.md` | config | yes | Agent identity: Frontier Feed editor-in-chief |
| `skills/newsroom/` | skills | yes | News radar, reel production, publishing, growth review |
| `newsroom/` | workspace | partly | Playbook, Postiz client, backlog; `runs/` and `data/*.jsonl` stay local |
| `studio/` | renderer | yes | Turns a JSON spec into a finished 1080x1920 Reel |
| `.env` | secrets | **no** | API keys and tokens |
| `memories/`, `sessions/`, `cron/`, `skills/`, `state.db`, `logs/` | state | no | Portable private state, copied on migration |
| `hermes-agent/`, `tools/`, `installs/`, `cache/` | runtime | no | Machine and OS specific, rebuilt by bootstrap |

## Frontier Feed: autonomous AI-news Reels and YouTube videos

This Hermes home runs the Instagram channel **Frontier Feed** on its own.
It is deliberately independent of the rest of this repository so the two approaches
can be compared.

- **Models:** orchestrator `claude-fable-5-1` (Anthropic, reasoning `max`); subagents
  `gpt-6-luna` via `openai-codex` (reasoning `max`), up to 6 in parallel.
- **Jobs (Europe/Berlin):**

  | Job | Schedule | What it does |
  |---|---|---|
  | `newsroom-growth-daily` | daily 09:30 | Pulls analytics, updates `newsroom/playbook.md` |
  | `newsroom-reel-a` | daily 11:00 | Finds a story, produces a Reel, schedules it for 13:00–15:30 |
  | `newsroom-reel-b` | daily 20:00 | Same, scheduled for 22:30–00:30 |
  | `newsroom-growth-weekly` | Sunday 10:00 | Deep review, rewrites playbook, skills and studio templates |
  | `newsroom-longform` | Thursday 07:00 | 8-14 min 16:9 YouTube video: package, research, script, render, thumbnails; publishes via Postiz or leaves a `READY.md` package |

- **Images:** `image_generate` uses `gpt-image-2` through the `openai-codex` login
  (`image_gen.provider` in `config.yaml`); generated files land in `cache/generated/`.
- **Publishing:** Postiz public API through `newsroom/bin/postiz.py` (`publish` for
  Reels, `publish-youtube` for long-form once a YouTube channel is connected in Postiz); every post is
  logged in `newsroom/data/posts.jsonl`, metrics in `newsroom/data/metrics.jsonl`.
- **Learning loop:** cron runs do not get Hermes' automatic memory/skill review, so
  the jobs explicitly read and rewrite `newsroom/playbook.md` and use `skill_manage`.

### Going live

```sh
hermes/bin/hermes auth add anthropic --type oauth   # or ANTHROPIC_API_KEY in .env
hermes/bin/hermes auth add openai-codex             # ChatGPT/Codex login for subagents
hermes/bin/hermes -z "Say hi"                       # smoke test
hermes/scripts/install-jobs.sh                      # activate the jobs
hermes/bin/hermes cron run <newsroom-reel-a id>     # optional: produce one Reel now
```

Required in `.env`: `POSTIZ_API_KEY`, `POSTIZ_INSTAGRAM_ID` (optional `ELEVENLABS_API_KEY`).
Watch runs with `hermes/bin/hermes cron runs` and `hermes/logs/gateway.log`.
The machine must be awake at job times; Postiz publishes scheduled posts server-side.

## Fresh install

```sh
hermes/scripts/bootstrap.sh
hermes/bin/hermes setup
```

## Migrating to a server

The runtime contains absolute paths and platform binaries (currently
`darwin-arm64`), so never copy it. Move the state and rebuild the runtime:

```sh
rsync -a \
  --exclude hermes-agent/ --exclude tools/ --exclude installs/ --exclude cache/ \
  hermes/ server:/srv/organic-content/hermes/
ssh server /srv/organic-content/hermes/scripts/bootstrap.sh
ssh server /srv/organic-content/hermes/bin/hermes gateway install --start-now   # systemd user service
ssh server /srv/organic-content/hermes/scripts/install-jobs.sh                   # re-point jobs to the new path
```

On a Linux user service also run `sudo loginctl enable-linger $USER`. Stop the gateway
on the old machine first so both do not post.

`.env` travels with the rsync, so keep that transfer on a trusted channel.
