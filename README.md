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

The interface's sample content is demonstration data. Real publishing requires authorized social accounts and a configured publishing provider. API availability, app review, media requirements, and account eligibility vary by network. A platform appearing in the interface does not mean it is connected.

The intended pipeline is brand configuration → ideation → platform adaptation → scheduling → publishing → delivery tracking. Missing credentials must leave delivery blocked rather than report a successful publication.

## Architecture

- `src/`: React and TypeScript workspace, calendar, editor, ideas, channels, and settings.
- `server/`: persistence, automation services, publishing adapters, and API.
- `docs/`: backend contract and platform setup requirements.

This initial application targets a local, single-user workspace. Hosting it publicly requires authentication, tenant isolation, secure credential storage, and an appropriate production deployment configuration.

Never commit secrets or the local database. Copy `.env.example` when configuring services.
