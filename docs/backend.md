# Backend

Node + TypeScript service in `server/`. It generates post ideas, drafts them, fills a posting calendar, and publishes through a gateway that refuses to touch the network unless explicitly configured. State lives in SQLite.

This file is the API contract for the frontend. Platform access requirements are in [platforms.md](platforms.md).

## Run

`server/` has its own `package.json`. It is not part of the root install.

```sh
cd server
npm ci
cp .env.example .env && chmod 600 .env
npm run dev        # http://127.0.0.1:3001
npm test
npm run typecheck
npm run build && npm start
```

Requires Node 22.18 or newer, for built-in SQLite and type stripping. Tested on Node 26. The frontend's Vite proxy (`/api` to `http://localhost:3001`) works without changes.

The server reads `server/.env` only. The root `.env.example` is not loaded.

## What actually works

| Platform | Support | Status |
|---|---|---|
| Bluesky, Mastodon, LinkedIn, X | Direct adapter, **text only** | Built from provider docs and tested against mocked HTTP. **Never run against a live account.** |
| Threads, Facebook Pages, Instagram, TikTok, YouTube, Pinterest | No adapter | Unsupported, unless you run an external gateway and route them to it. This server then only relays; whether the post works depends on your gateway. |

`GET /api/platforms` reports this per platform. Show its fields as they are, and do not treat a listed platform as connected.

Known limits of the direct adapters:

- **No media.** A post with `mediaUrls` is rejected, not posted without its media.
- **X:** tokens are not refreshed, so an expired token blocks the post until it is replaced. Length is an approximation of X's weighted count, so X can still reject a post that passes here.
- **LinkedIn:** you must set `LINKEDIN_API_VERSION` (YYYYMM). LinkedIn retires versions, so it needs periodic updates.
- **Mastodon:** the limit comes from `MASTODON_MAX_CHARS`; it is not read from the instance.
- **Bluesky:** a new session is created per post, and only links are turned into facets (not mentions or hashtags).

## Safety model

External posting requires all of these:

1. `PUBLISH_MODE=live`. The default `dry_run` makes no network calls and ends posts as `simulated`, never `published`.
2. Complete credentials for that platform. Otherwise the post ends as `blocked` with no request sent.
3. A post in `scheduled` state, or an explicit `publish-now`.
4. `publishingPaused` is false.

Autonomy is opt-in, and generating content never publishes it directly:

- `autonomyEnabled` is off by default.
- Autonomous posts wait in `needs_review` unless `autoApprove` is on **and** the generator allows it. The `template` generator never does.
- `maxPostsPerCycle` and `maxReviewBacklog` bound generation and API spend. A generator failure stops the cycle.

**No duplicates by retry.** If a request may have reached the provider (timeout, connection reset, most 5xx) and the provider has no idempotency support, the post goes to `needs_attention` and a person decides. The same applies to a server crash mid-publish. Only Mastodon and the external gateway are retried in that case, using a stable `Idempotency-Key`.

**Late posts are dropped.** A post more than `maxLatenessMinutes` past its time when first attempted (for example after downtime) becomes `failed` with `missed_window`, rather than going out late.

## Configuration

All configuration is environment variables, validated at startup. The server exits on invalid values, and error text names variables but not their values. `server/.env.example` lists every variable.

| Variable | Default | Notes |
|---|---|---|
| `HOST`, `PORT` | `127.0.0.1`, `3001` | |
| `API_TOKEN` | unset | Min 32 chars. **Required** in production or on a non-loopback host. |
| `CORS_ORIGINS` | Vite dev origins outside production | Comma-separated |
| `COOKIE_SECURE` | true in production | |
| `DATABASE_PATH` | `server/data/engine.db` | Created with mode 0600 |
| `PUBLISH_MODE` | `dry_run` | `dry_run` or `live` |
| `SCHEDULER_ENABLED`, `SCHEDULER_TICK_SECONDS` | `true`, `30` | |
| `PUBLISH_HTTP_TIMEOUT_MS` | `20000` | |
| `CONTENT_GENERATOR` | `template` | `template` or `anthropic` |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | unset, `claude-opus-5-5` | |
| `BLUESKY_HANDLE`, `BLUESKY_APP_PASSWORD`, `BLUESKY_SERVICE_URL` | | |
| `MASTODON_INSTANCE_URL`, `MASTODON_ACCESS_TOKEN`, `MASTODON_MAX_CHARS` | | |
| `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_AUTHOR_URN`, `LINKEDIN_API_VERSION` | | |
| `X_USER_ACCESS_TOKEN` | | OAuth 2.0 user token with `tweet.write` |
| `PUBLISHING_GATEWAY_URL`, `PUBLISHING_GATEWAY_TOKEN`, `PUBLISHING_GATEWAY_PLATFORMS` | | Listed platforms go through the gateway, overriding direct adapters |

Other protections: URLs that receive credentials must be https (except localhost), redirects are refused, and configured secret values are scrubbed from logs and stored errors. The API returns the names of missing variables, never values.

`template` is an offline placeholder that writes prompts for a person to finish, not publishable copy. `anthropic` calls Claude with server-side refusal fallback enabled, and has only been tested with a mocked SDK call.

### External gateway protocol

```http
POST {PUBLISHING_GATEWAY_URL}
Authorization: Bearer {PUBLISHING_GATEWAY_TOKEN}
Idempotency-Key: <sha256, stable across retries of the same text>
Content-Type: application/json

{ "platform": "tiktok", "text": "...", "mediaUrls": ["https://..."] }
```

Respond 2xx with `{ "id": "...", "url": "..." }` (`url` optional). The gateway **must** de-duplicate on `Idempotency-Key`, because this server retries ambiguous failures. Status handling: 401/403 blocks the post; 409, 425, 429 and 503 retry, honouring `Retry-After`; other 4xx fail; other 5xx and timeouts retry.

## API

Base path `/api`. JSON only: requests with a body need `Content-Type: application/json`, and unknown fields are rejected. Bodies are limited to 1 MB. Times are ISO 8601; any offset is accepted and responses are always UTC. IDs are opaque strings.

### Auth

With no `API_TOKEN` (local development on loopback), no auth is needed. Otherwise send `Authorization: Bearer <token>` or use the session cookie below. Browser code should use the session and must not embed the token.

| Route | Body | Response |
|---|---|---|
| `GET /session` | | `{ authRequired, authenticated }` |
| `POST /session` | `{ token }` | Same, and sets an HttpOnly, SameSite=Strict cookie valid for 7 days. Send requests with `credentials: 'include'` if cross-origin. |
| `DELETE /session` | | 204 |

Only `/health` and `/session` are public. Browser requests from an origin outside `CORS_ORIGINS` and not on the server's own host get 403.

### Responses

Success returns the resource directly, or for lists:

```jsonc
{ "items": [], "total": 0, "limit": 50, "offset": 0 } // posts, ideas (query: limit 1-200, offset)
{ "items": [] }                                        // pillars, platforms, activity
```

Errors:

```jsonc
{
  "error": { "code": "invalid_state", "message": "...", "details": [] },
  "message": "..." // same text as error.message
}
```

| Status | Codes |
|---|---|
| 400 | `validation_error` (`details: [{ path, message }]`), `invalid_json` |
| 401 | `unauthorized` |
| 403 | `forbidden_origin`, `forbidden_host` |
| 404 | `not_found` |
| 409 | `invalid_state`, `platform_unsupported`, `publishing_paused`, `duplicate_idea`, `cycle_running`, `no_free_slot` |
| 413 / 415 | `payload_too_large` / `unsupported_media_type` |
| 422 | `content_invalid` (`details` holds issues), `scheduled_in_past` |
| 500 | `internal_error` |
| 502 | `generation_failed` |

### Status and health

`GET /health` (public) returns `{ ok: true }`. Authenticated callers also get `aiConfigured` and `publishingConfigured`. `publishingConfigured` means at least one platform has credentials; it does not mean mode is live.

`GET /status`:

```jsonc
{
  "publishMode": "dry_run",
  "publishingPaused": false,
  "generator": { "id": "template", "reviewRequired": true },
  "autonomy": {
    "enabled": false,
    "effectiveAutoApprove": false,
    "running": false,
    "nextCycleAt": null,
    "lastCycle": { "lastRunAt": null, "lastResult": null } // lastResult: CycleResult
  },
  "scheduler": { "enabled": true, "running": true, "tickSeconds": 30, "lastTickAt": "...", "lastError": null },
  "postCounts": { "needs_review": 5 },
  "platformsReady": []
}
```

### Platforms

`GET /platforms` returns `{ items: PlatformStatus[], publishMode }`. Platform configuration is environment-only, so this is read-only.

```ts
type PlatformId = 'bluesky' | 'mastodon' | 'linkedin' | 'x' | 'threads' | 'facebook'
                | 'instagram' | 'tiktok' | 'youtube' | 'pinterest';

interface PlatformStatus {
  id: PlatformId;
  displayName: string;
  support: 'direct' | 'gateway_only';
  route: 'direct' | 'gateway' | null;
  state: 'ready' | 'missing_credentials' | 'unsupported';
  canPublishLive: boolean;     // true only if a real post would be attempted now
  missingEnv: string[];
  limits: { maxChars: number; requiresMedia: boolean; supportsMedia: boolean };
  verification: 'mock_tested_only' | 'depends_on_gateway' | 'none';
}
```

### Settings and autopilot

`GET /settings`, and `PATCH /settings` with any subset:

```ts
interface Settings {
  autonomyEnabled: boolean;      // default false
  autoApprove: boolean;          // default false
  publishingPaused: boolean;     // default false; kill switch, also stops publish-now
  timezone: string;              // IANA, default 'UTC'
  postingSlots: { days: number[]; time: string }[]; // 0 = Sunday; 'HH:MM'. Default Mon-Fri 09:00
  planningHorizonDays: number;   // 1-60, default 7
  cycleIntervalMinutes: number;  // 5-10080, default 360
  maxPostsPerCycle: number;      // 1-50, default 5
  maxReviewBacklog: number;      // 0-500, default 20
  maxLatenessMinutes: number;    // 1-10080, default 180
}
```

`GET /autopilot`, `POST /autopilot/start`, and `POST /autopilot/pause` all return the object below. They switch `autonomyEnabled` only, and pausing does not stop posts that are already scheduled; use `publishingPaused` for that.

```ts
interface Autopilot {
  running: boolean;
  status: 'running' | 'paused';
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastError: string | null;
}
```

### Brand

`GET /brand`, and `PUT /brand` to replace it (omitted fields become empty). Fed to the generator on every call.

```ts
interface Brand { name: string; handle: string; description: string; audience: string; voice: string; avoid: string }
```

### Pillars

Content themes that autonomy cycles through. A cycle only uses active pillars with at least one targetable platform.

`GET /pillars`, `POST /pillars` (201), `GET /pillars/:id`, `PATCH /pillars/:id`, `DELETE /pillars/:id` (204; deletes its ideas, keeps its posts).

```ts
interface Pillar {
  id: string;
  name: string;           // required on create
  description: string;
  audience: string;
  tone: string;
  keywords: string[];
  platforms: PlatformId[];
  active: boolean;        // default true
  createdAt: string;
  updatedAt: string;
}
```

### Ideas

| Route | Body / query | Response |
|---|---|---|
| `GET /ideas` | `?pillarId&status&limit&offset` | Page of `Idea` |
| `POST /ideas` | `{ pillarId, title, angle? }` | 201 `Idea`; 409 `duplicate_idea` |
| `POST /ideas/generate` | `{ pillarId, count? (1-20, default 5), prompt? }` | 201 `{ items: Idea[] }`, may be shorter than `count` after de-duplication |
| `GET /ideas/:id` | | `Idea` |
| `PATCH /ideas/:id` | `{ title?, angle?, status?: 'new' \| 'rejected' }` | `Idea` |
| `DELETE /ideas/:id` | | 204 |
| `POST /ideas/:id/draft` | `{ platform, scheduledAt? }` | 201 `Post`, with text from the generator |

```ts
interface Idea {
  id: string;
  pillarId: string;
  title: string;
  angle: string;
  source: 'manual' | 'template' | 'anthropic';
  status: 'new' | 'drafted' | 'rejected';
  createdAt: string;
  updatedAt: string;
}
```

### Posts

A post targets **one** platform, because each has its own limits, status and result. For multi-platform publishing, create one post per platform.

```ts
type PostStatus =
  | 'draft'           // editable, not on the calendar
  | 'needs_review'    // generated, holds its proposed slot, waiting for approval
  | 'scheduled'       // will publish at scheduledAt (also while waiting for a retry)
  | 'publishing'      // request in flight
  | 'published'       // provider confirmed; externalId is set
  | 'simulated'       // dry run: nothing was posted
  | 'failed'          // see lastErrorCode; can be rescheduled
  | 'blocked'         // missing or rejected credentials, or unsupported platform; nothing was posted
  | 'needs_attention' // may or may not be live; check the platform, then call /resolve
  | 'cancelled';

interface Post {
  id: string;
  ideaId: string | null;
  pillarId: string | null;
  platform: PlatformId;
  body: string;
  mediaUrls: string[];         // https only, max 10
  status: PostStatus;
  origin: 'manual' | 'autonomous';
  generator: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  externalId: string | null;
  externalUrl: string | null;
  attemptCount: number;
  nextAttemptAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  issues: { code: 'empty_body' | 'too_long' | 'media_required' | 'media_unsupported'; message: string }[];
}
```

Only `published` means a post went out. Do not present `simulated` or `blocked` as delivered.

| Route | Body / query | Allowed from | Notes |
|---|---|---|---|
| `GET /posts` | `?status&platform&pillarId&from&to&limit&offset` | | `from`/`to` filter on `scheduledAt`, `to` exclusive. Newest first. |
| `POST /posts` | `{ platform, body, mediaUrls?, pillarId?, scheduledAt? }` | | 201. `scheduled` if a time is given, otherwise `draft`. |
| `GET /posts/:id` | | | `Post` plus `attempts: PublishAttempt[]` |
| `PATCH /posts/:id` | `{ platform?, body?, mediaUrls? }` | draft, needs_review, scheduled, failed, blocked, simulated | Time changes go through `/schedule`. |
| `DELETE /posts/:id` | | draft, needs_review, failed, blocked, simulated, cancelled | 204 |
| `POST /posts/:id/approve` | `{ scheduledAt? }` | draft, needs_review | Keeps a future proposed time, otherwise takes the next free slot. |
| `POST /posts/:id/schedule` | `{ scheduledAt }` | draft, needs_review, scheduled, failed, blocked, simulated, cancelled | Counts as approval. Resets attempts. |
| `POST /posts/:id/unschedule` | | scheduled, needs_review | Back to `draft` |
| `POST /posts/:id/cancel` | | draft, needs_review, scheduled, failed, blocked, simulated | |
| `POST /posts/:id/publish-now` | | draft, needs_review, scheduled, failed, blocked, simulated | Waits for the result. **Check `status` in the 200 response**: it can be `blocked`, `failed`, `simulated` or `needs_attention`. |
| `POST /posts/:id/resolve` | `{ outcome: 'published' \| 'not_published', externalUrl? }` | needs_attention | Only way out of `needs_attention`. |

Any other starting status returns 409 `invalid_state`.

```ts
interface PublishAttempt {
  id: string;
  postId: string;
  attemptNumber: number;
  mode: 'dry_run' | 'live';
  route: 'direct' | 'gateway' | null;
  outcome: 'published' | 'simulated' | 'retry_scheduled' | 'failed' | 'blocked' | 'unknown';
  code: string | null;
  message: string | null;
  externalId: string | null;
  startedAt: string;
  finishedAt: string;
}
```

Common `lastErrorCode` values: `credentials_missing`, `credentials_rejected`, `platform_unsupported`, `content_invalid`, `missed_window`, `network_uncertain`, `interrupted`, `confirmed_not_published`, `http_<status>`.

### Operations

`POST /scheduler/run` with `{ job: 'publish' | 'autonomy' }` runs a job now and returns `{ job, result }`. The autonomy job runs even when `autonomyEnabled` is off, and still follows all review rules.

```ts
interface PublishRunResult { processed: number; skippedPaused: boolean; missed: number; recovered: number }
interface CycleResult {
  startedAt: string;
  createdPostIds: string[];
  ideasGenerated: number;
  skippedPlatforms: PlatformId[];
  stoppedReason: 'no_active_pillars' | 'no_targets' | 'review_backlog_full' | 'generator_error'
               | 'budget_reached' | 'calendar_full' | 'no_new_ideas';
  error: string | null;
}
```

`GET /activity?limit&beforeId` returns newest-first events, for a feed:

```ts
interface ActivityEvent { id: number; type: string; level: 'info' | 'warn' | 'error'; message: string; postId: string | null; createdAt: string }
```

## Frontend reconciliation

`src/api/types.ts` is marked provisional. Differences from this contract:

| Provisional client | Backend |
|---|---|
| `Post.caption`, `title`, `platforms[]`, `error` | `body`, no title, one `platform` per post, `lastErrorMessage` |
| `posts.list()` and `ideas.list()` return arrays | `{ items, total, limit, offset }` |
| `PATCH /posts/:id` with `scheduledAt` or `status` | Rejected; use the action routes |
| `GET /channels`, `PATCH /channels/:id` | `GET /platforms`, read-only. `connected` is `state === 'ready'`, and `canPublish` is `canPublishLive`. |
| `Brand.pillars: string[]` | Separate `/pillars` resources |
| `POST /ideas/generate` returns an array, with `platforms` in the body | Returns `{ items }`, requires `pillarId`; platforms come from the pillar |
| `Idea.caption`, `Idea.platforms` | Not present; draft with `POST /ideas/:id/draft` |

Already compatible: `/health`, `/autopilot*`, `/brand` (apart from `pillars`), and error messages, which the client's parser finds at top-level `message`.

## Layout

```
server/src/
  config.ts        environment validation
  container.ts     wiring; tests inject db, clock, fetch, generator
  db/              SQLite connection and migrations
  domain/          types, platform catalog
  repositories/    SQL
  generation/      template and Anthropic generators
  publishing/      gateway (all safety gates), HTTP error classification, adapters
  services/        ideation, posts, publisher, autonomy, scheduler, slots
  http/            routes, schemas, auth and origin checks
server/test/       node:test suite; no network, no real credentials
```
