import { loadConfig } from '../src/config.ts';
import { createContainer, type Container, type Overrides } from '../src/container.ts';
import { openDatabase } from '../src/db/database.ts';
import { createApp } from '../src/http/app.ts';
import { silentLogger } from '../src/logger.ts';

export const TOKEN = 'test-token-0123456789-0123456789-abcdef';

export interface RecordedRequest {
  url: string;
  method: string;
  headers: Headers;
  body: any;
}

export type Responder = (request: RecordedRequest) => Response | Promise<Response>;

/** Fails loudly by default: a test that does not expect network must never reach it. */
export function fakeFetch(responder: Responder = () => { throw new Error('unexpected network call'); }) {
  const calls: RecordedRequest[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const request: RecordedRequest = {
      url: String(url),
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    };
    calls.push(request);
    return responder(request);
  }) as typeof fetch;
  return { impl, calls };
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

export class Clock {
  ms: number;
  constructor(iso: string) {
    this.ms = Date.parse(iso);
  }
  now = () => new Date(this.ms);
  advance(minutes: number) {
    this.ms += minutes * 60_000;
  }
}

export interface Harness extends Container {
  clock: Clock;
  calls: RecordedRequest[];
  request: (path: string, init?: RequestInit) => Promise<Response>;
}

/** Monday 2026-11-09 08:00 UTC, an hour before the default posting slot. */
export const START = '2026-11-09T08:00:00.000Z';

export function harness(options: {
  env?: Record<string, string>;
  responder?: Responder;
  generator?: Overrides['generator'];
  start?: string;
} = {}): Harness {
  const clock = new Clock(options.start ?? START);
  const { impl, calls } = fakeFetch(options.responder);
  const config = loadConfig({ NODE_ENV: 'test', ...options.env });
  const container = createContainer(config, {
    db: openDatabase(':memory:'),
    logger: silentLogger,
    now: clock.now,
    fetch: impl,
    generator: options.generator,
  });
  const app = createApp(container);
  const request = async (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    if (!headers.has('host')) headers.set('host', 'localhost:4000');
    if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    return app.request(path, { ...init, headers });
  };
  return { ...container, clock, calls, request };
}

export const LIVE_BLUESKY = { PUBLISH_MODE: 'live', BLUESKY_HANDLE: 'me.test', BLUESKY_APP_PASSWORD: 'app-password-secret' };
export const LIVE_MASTODON = { PUBLISH_MODE: 'live', MASTODON_INSTANCE_URL: 'https://social.test', MASTODON_ACCESS_TOKEN: 'mastodon-secret' };
export const LIVE_X = { PUBLISH_MODE: 'live', X_USER_ACCESS_TOKEN: 'x-user-secret' };

export const scheduledPost = (h: Harness, platform: 'bluesky' | 'mastodon' | 'x' | 'linkedin' | 'tiktok', body = 'Hello world') => {
  const scheduledAt = new Date(h.clock.ms + 60_000).toISOString();
  return h.posts.insert(h.postService.build({ platform, body, mediaUrls: [], pillarId: null, status: 'scheduled', scheduledAt }));
};
