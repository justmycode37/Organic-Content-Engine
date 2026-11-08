# Organic Content Engine

A monochrome social content workspace with a persistent automation backend for brand-aware ideation, scheduling, and publishing.

## Development

Requires Node.js 24 or newer.

```sh
npm ci
npm --prefix server ci
npm run dev
```

In another terminal run `npm run server:dev`. Copy `server/.env.example` to `server/.env` to configure the backend. The default mode simulates publishing. Build with `npm run build` and `npm run server:build`; run backend tests with `npm test`. Backend setup and endpoint contracts are documented in [docs/backend.md](docs/backend.md). Platform access requirements are documented in [docs/platforms.md](docs/platforms.md).

## Publishing setup

The workspace uses the backend database and starts empty. Real publishing requires authorized social accounts and a configured publishing provider. API availability, app review, media requirements, and account eligibility vary by network. A platform appearing in the interface does not mean it is connected.

Direct adapters support text on Bluesky, Mastodon, LinkedIn, and X. Instagram, Facebook, Threads, TikTok, YouTube, and Pinterest require an external publishing gateway. Automated image/video creation and live account verification are not implemented. The interface is monochrome and inspired by social workspace conventions; fidelity to Holo's authenticated interface has not been verified.

The intended pipeline is brand configuration → ideation → platform adaptation → scheduling → publishing → delivery tracking. Missing credentials must leave delivery blocked rather than report a successful publication.

## Architecture

- `src/`: React and TypeScript workspace, calendar, editor, ideas, channels, and settings.
- `server/`: persistence, automation services, publishing adapters, and API.
- `docs/`: backend contract and platform setup requirements.

This initial application targets a local, single-user workspace. Hosting it publicly requires authentication, tenant isolation, secure credential storage, and an appropriate production deployment configuration.

Never commit secrets or the local database. Copy `server/.env.example` to `server/.env` when configuring services.

## ChatGPT plan connection and source Storage

In the local workspace, open **Storage → Continue with ChatGPT**, authorize plan
usage, and choose a model from your account's catalog. Connected ChatGPT becomes
the generator for manual and autonomous content. No OpenAI API key is needed for
this flow. Disconnecting restores the configured template/Anthropic generator.
Eligibility and usage limits are controlled by OpenAI; a successful local build
does not verify an account's eligibility. This integration follows the supported
[local/open-source sign-in flow](https://developers.openai.com/siwc/token-sharing-open-source/sign-in).
Hosted/commercial deployment needs an eligible registered integration; the local
flow is disabled for production and non-loopback hosts. The existing workspace
token gate remains in place where configured.

Upload any file type to **Storage** (100 MB per file). Files persist as private
SQLite blobs and can be downloaded or deleted. Toggle **Use for content** to
exclude a file from future generation. Notes and plain text (including Markdown,
CSV, JSON, SRT, VTT) feed manual and autonomous ideation and drafting. Each request
uses at most 30 enabled files, newest first, and 24,000 characters of context;
individual text extracts are capped at 8,000 characters. ChatGPT can additionally
receive up to four enabled JPEG/PNG/WebP images, each no larger than 5 MB.

**Analyze with ChatGPT** writes reusable reference notes for text, images, and
video. Video analysis requires `ffmpeg` on PATH; it samples at most four frames
at ten-second intervals from the start, without audio. This is visual reference
analysis, not full video understanding or editing. Other binary files, including
PDFs and audio, need user notes or a text transcript. Unsupported files remain
available for storage and download. Save edited notes before analyzing. Analysis
sends the chosen material to OpenAI, including when its future-generation toggle
is off. Uploads are not automatically attached to published posts.

ChatGPT tokens stay server-side in an owner-only, atomically written
`chatgpt-credentials.json` next to the database. Include the database in private
backups; never publish or commit it or the credential file. Run a single backend
process per credential store to avoid rotating-token conflicts. Disconnect
attempts remote revocation and reports when it cannot be confirmed. Manage app
limits and access at [ChatGPT usage settings](https://chatgpt.com/settings/usage).

OAuth and generation are tested using mocks; a real user must complete consent
to validate plan eligibility and live inference.
