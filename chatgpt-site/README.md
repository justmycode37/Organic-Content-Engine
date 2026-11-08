# Organic Content Engine: hosted Site

The Organic Content Engine workspace as a ChatGPT Site: a Cloudflare Worker with durable D1 storage, serving the React UI and the `/api` contract. It needs no asset binding because the compiled frontend is embedded in the Worker.

## Build and check

```sh
npm ci
npm run build     # dist/server/index.js + dist/.openai/hosting.json
npm run check     # typecheck, build, artifact validation, smoke suite
```

`npm test` runs the built Worker in workerd with a real local D1 and mocked providers. It makes no external calls.

## Local run

```sh
cp .dev.vars.example .dev.vars
npm run build
npm run db:local    # once per local database
npm run dev:local   # http://127.0.0.1:8787
```

Sites dispatch does not run locally, so `LOCAL_DEV_USER_ID` stands in for sign-in. It is ignored on any non-loopback hostname.

## Layout

```
.openai/hosting.json  Site identity and the D1 binding DB. Keep project_id.
db/schema.ts          Schema, used only to generate migrations (npm run db:generate)
drizzle/              Migrations and journal. Applied files are immutable; append new ones.
src/                  React UI, ported from the parent project
worker/               Worker: http, services, repositories, publishing, generation
scripts/              Build, artifact validation, smoke suite
```

## Identity and access

- Sites provides identity through `oai-authenticated-user-*` headers, read only in `worker/http/security.ts`. Sign-in and sign-out are top-level links to the Sites-owned routes. `POST` and `DELETE /api/session` return 405.
- There is one workspace, owned by one account. The first signed-in visitor is recorded as owner in D1, and every other identity gets 403 `forbidden_user`. This relies on the Site being owner-private when it is first opened; set `OWNER_USER_ID` to pin the owner explicitly.
- API calls must be same-origin (`Sec-Fetch-Site`, falling back to `Origin`). The HTML is not protected against framing, because Sites may frame the page.

## Background work

**A Worker has no timer, so nothing happens in the background by itself.** Scheduled posts and autopilot advance only when `POST /api/jobs/tick` is called. Each call publishes due posts, then runs an autopilot cycle if one is due. `/api/status` reports `scheduler.enabled: false` and `lastTickAt`, and the UI warns when no call has arrived recently.

Posts more than `maxLatenessMinutes` past their time when first processed fail as `missed_window` rather than going out late, so the schedule's interval must be well under that limit.

The endpoint accepts any one of:

| Caller | Requirement |
|---|---|
| Signed-in owner | None |
| Any client | `Authorization: Bearer <JOB_TOKEN>`, min 32 characters |
| Sites service access | `SITES_SERVICE_ACCESS_TRUSTED=true`. Set it only while the Site is confirmed owner-private, and remove it before widening the audience, because it accepts any request with no identity on this route. |

With neither value set, only the signed-in owner can call it. A Site schedule still has to be created after publishing (see the Sites recurring updates reference); this repository does not create one.

## Configuration

`.env.example` lists every variable by name. Set hosted values through Site runtime values and secrets. An invalid value makes the API return 500 `config_invalid`, naming the variable and never its value.

Publishing keeps the parent's gates: `PUBLISH_MODE` defaults to `dry_run`, which makes no network calls and ends posts as `simulated`. Live posting also needs complete credentials for that platform, and a post with an ambiguous outcome goes to `needs_attention` for a person to resolve.

| Platform | Support on this host |
|---|---|
| Bluesky, Mastodon, LinkedIn, X | Direct adapter, text only. Tested against mocks only; never run against a live account. |
| Threads, Facebook Pages, Instagram, TikTok, YouTube, Pinterest | Blocked unless routed through your own external gateway (`PUBLISHING_GATEWAY_*`). |

`template` generation writes prompts for a person to finish, and those posts always wait for review. `CONTENT_GENERATOR=anthropic` needs `ANTHROPIC_API_KEY` and has been tested only against a mocked API.

## Differences from the Node server

| Node server | This Site |
|---|---|
| `node:sqlite` with interactive transactions | D1, with atomic groups through `batch()` |
| `setInterval` scheduler | `POST /api/jobs/tick`, called externally |
| `API_TOKEN` and session cookie | ChatGPT identity plus owner check |
| In-memory autonomy guard | `job_locks` row in D1, expiring after 15 minutes |
| `redirect: 'error'` | `redirect: 'manual'`, since Workers rejects `error`. A 3xx is treated as an ambiguous result and never followed. |
