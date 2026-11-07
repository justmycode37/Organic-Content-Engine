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
