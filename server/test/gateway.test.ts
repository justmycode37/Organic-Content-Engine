import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig } from '../src/config.ts';
import type { PlatformId } from '../src/domain/platforms.ts';
import { createRedactor } from '../src/logger.ts';
import { linkFacets } from '../src/publishing/adapters/bluesky.ts';
import { escapeLittleText } from '../src/publishing/adapters/linkedin.ts';
import { createGateway } from '../src/publishing/gateway.ts';
import { fakeFetch, json, type Responder } from './helpers.ts';

function gatewayFor(env: Record<string, string>, responder?: Responder) {
  const config = loadConfig({ NODE_ENV: 'test', ...env });
  const { impl, calls } = fakeFetch(responder);
  return { gateway: createGateway(config, createRedactor(config.secrets), impl, () => new Date('2026-11-09T08:00:00Z')), calls };
}

const request = (platform: PlatformId, text = 'Hello', mediaUrls: string[] = []) =>
  ({ platform, text, mediaUrls, idempotencyKey: 'key-1' });

const ALL_DIRECT = {
  BLUESKY_HANDLE: 'me.test',
  BLUESKY_APP_PASSWORD: 'bsky-secret',
  MASTODON_INSTANCE_URL: 'https://social.test/',
  MASTODON_ACCESS_TOKEN: 'masto-secret',
  LINKEDIN_ACCESS_TOKEN: 'li-secret',
  LINKEDIN_AUTHOR_URN: 'urn:li:organization:123',
  LINKEDIN_API_VERSION: '202610',
  X_USER_ACCESS_TOKEN: 'x-secret',
};

test('dry run never touches the network, even with credentials', async () => {
  const { gateway, calls } = gatewayFor({ ...ALL_DIRECT, PUBLISH_MODE: 'dry_run' });
  for (const platform of ['bluesky', 'mastodon', 'linkedin', 'x'] as const) {
    assert.equal((await gateway.publish(request(platform))).kind, 'simulated');
  }
  assert.equal(calls.length, 0);
});

test('live mode without credentials is blocked and makes no request', async () => {
  const { gateway, calls } = gatewayFor({ PUBLISH_MODE: 'live' });
  for (const platform of ['bluesky', 'mastodon', 'linkedin', 'x'] as const) {
    const outcome = await gateway.publish(request(platform));
    assert.equal(outcome.kind, 'blocked');
    assert.equal(outcome.kind === 'blocked' && outcome.code, 'credentials_missing');
  }
  assert.equal(calls.length, 0);
});

test('partial credentials do not count as configured', async () => {
  const { gateway, calls } = gatewayFor({ PUBLISH_MODE: 'live', BLUESKY_HANDLE: 'me.test' });
  assert.deepEqual(gateway.status('bluesky').missingEnv, ['BLUESKY_APP_PASSWORD']);
  assert.equal((await gateway.publish(request('bluesky'))).kind, 'blocked');
  assert.equal(calls.length, 0);
});

test('gateway-only platforms are unsupported, even in dry run, until routed', async () => {
  const { gateway, calls } = gatewayFor({ PUBLISH_MODE: 'dry_run' });
  for (const platform of ['threads', 'facebook', 'instagram', 'tiktok', 'youtube', 'pinterest'] as const) {
    const status = gateway.status(platform);
    assert.equal(status.state, 'unsupported');
    assert.equal(status.canPublishLive, false);
    assert.equal(status.verification, 'none');
    const outcome = await gateway.publish(request(platform, 'x', ['https://cdn.test/a.mp4']));
    assert.equal(outcome.kind === 'blocked' && outcome.code, 'platform_unsupported');
  }
  assert.equal(calls.length, 0);
});

test('no status claims more than mock testing', () => {
  const { gateway } = gatewayFor({ ...ALL_DIRECT, PUBLISH_MODE: 'live' });
  for (const status of gateway.statuses()) {
    assert.notEqual(status.verification as string, 'verified');
  }
  assert.equal(gateway.status('bluesky').verification, 'mock_tested_only');
  assert.equal(gateway.status('bluesky').canPublishLive, true);
});

test('bluesky: logs in, posts with link facets, builds a web URL', async () => {
  const { gateway, calls } = gatewayFor({ ...ALL_DIRECT, PUBLISH_MODE: 'live' }, (r) =>
    r.url.endsWith('createSession')
      ? json({ accessJwt: 'jwt', did: 'did:plc:abc' })
      : json({ uri: 'at://did:plc:abc/app.bsky.feed.post/3k', cid: 'c' }));
  const outcome = await gateway.publish(request('bluesky', 'See https://a.test/x.'));
  assert.equal(outcome.kind, 'published');
  assert.equal(outcome.kind === 'published' && outcome.externalUrl, 'https://bsky.app/profile/did:plc:abc/post/3k');
  assert.deepEqual(calls[0]?.body, { identifier: 'me.test', password: 'bsky-secret' });
  assert.equal(calls[1]?.headers.get('authorization'), 'Bearer jwt');
  assert.equal(calls[1]?.body.repo, 'did:plc:abc');
  assert.equal(calls[1]?.body.record.text, 'See https://a.test/x.');
  assert.equal(calls[1]?.body.record.facets[0].features[0].uri, 'https://a.test/x');
});

test('bluesky facets use UTF-8 byte offsets', () => {
  const [facet] = linkFacets('é https://a.test');
  assert.deepEqual(facet?.index, { byteStart: 3, byteEnd: 17 });
});

test('bluesky: an uncertain login is retryable because no post can exist yet', async () => {
  const { gateway } = gatewayFor({ ...ALL_DIRECT, PUBLISH_MODE: 'live' }, () => json({}, 500));
  assert.equal((await gateway.publish(request('bluesky'))).kind, 'retry');
});

test('mastodon: sends bearer token and idempotency key', async () => {
  const { gateway, calls } = gatewayFor({ ...ALL_DIRECT, PUBLISH_MODE: 'live' }, () =>
    json({ id: '1', url: 'https://social.test/@me/1' }));
  const outcome = await gateway.publish(request('mastodon'));
  assert.equal(outcome.kind === 'published' && outcome.externalUrl, 'https://social.test/@me/1');
  assert.equal(calls[0]?.url, 'https://social.test/api/v1/statuses');
  assert.equal(calls[0]?.headers.get('idempotency-key'), 'key-1');
  assert.equal(calls[0]?.headers.get('authorization'), 'Bearer masto-secret');
});

test('linkedin: required headers, escaped commentary, id from x-restli-id', async () => {
  const { gateway, calls } = gatewayFor({ ...ALL_DIRECT, PUBLISH_MODE: 'live' }, () =>
    new Response(null, { status: 201, headers: { 'x-restli-id': 'urn:li:share:9' } }));
  const outcome = await gateway.publish(request('linkedin', 'Hi (there) #tag'));
  assert.equal(outcome.kind === 'published' && outcome.externalId, 'urn:li:share:9');
  assert.equal(calls[0]?.headers.get('linkedin-version'), '202610');
  assert.equal(calls[0]?.headers.get('x-restli-protocol-version'), '2.0.0');
  assert.equal(calls[0]?.body.commentary, 'Hi \\(there\\) #tag');
  assert.equal(calls[0]?.body.author, 'urn:li:organization:123');
  assert.equal(escapeLittleText('a_b*c'), 'a\\_b\\*c');
});

test('linkedin needs an explicit API version', () => {
  const { LINKEDIN_API_VERSION: _omitted, ...env } = ALL_DIRECT;
  const { gateway } = gatewayFor({ ...env, PUBLISH_MODE: 'live' });
  assert.deepEqual(gateway.status('linkedin').missingEnv, ['LINKEDIN_API_VERSION']);
});

test('x: posts text and builds a status URL', async () => {
  const { gateway, calls } = gatewayFor({ ...ALL_DIRECT, PUBLISH_MODE: 'live' }, () => json({ data: { id: '42' } }, 201));
  const outcome = await gateway.publish(request('x'));
  assert.equal(outcome.kind === 'published' && outcome.externalUrl, 'https://x.com/i/status/42');
  assert.equal(calls[0]?.url, 'https://api.x.com/2/tweets');
  assert.deepEqual(calls[0]?.body, { text: 'Hello' });
});

const GATEWAY = {
  PUBLISH_MODE: 'live',
  PUBLISHING_GATEWAY_URL: 'https://gw.test/publish',
  PUBLISHING_GATEWAY_TOKEN: 'gw-secret',
  PUBLISHING_GATEWAY_PLATFORMS: 'tiktok,bluesky',
};

test('external gateway: routes listed platforms and forwards media', async () => {
  const { gateway, calls } = gatewayFor(GATEWAY, () => json({ id: 'g1', url: 'https://tiktok.test/g1' }));
  const outcome = await gateway.publish(request('tiktok', 'Clip', ['https://cdn.test/a.mp4']));
  assert.equal(outcome.kind === 'published' && outcome.route, 'gateway');
  assert.deepEqual(calls[0]?.body, { platform: 'tiktok', text: 'Clip', mediaUrls: ['https://cdn.test/a.mp4'] });
  assert.equal(calls[0]?.headers.get('idempotency-key'), 'key-1');
  assert.equal(gateway.status('tiktok').verification, 'depends_on_gateway');
});

test('external gateway overrides the direct adapter only for listed platforms', () => {
  const { gateway } = gatewayFor(GATEWAY);
  assert.equal(gateway.status('bluesky').route, 'gateway');
  assert.equal(gateway.status('mastodon').route, 'direct');
  assert.equal(gateway.status('instagram').state, 'unsupported');
});

test('a platform routed to an unconfigured gateway is blocked', async () => {
  const { gateway, calls } = gatewayFor({ PUBLISH_MODE: 'live', PUBLISHING_GATEWAY_PLATFORMS: 'threads' });
  assert.equal(gateway.status('threads').state, 'missing_credentials');
  assert.equal((await gateway.publish(request('threads'))).kind, 'blocked');
  assert.equal(calls.length, 0);
});

test('content rules: length in graphemes, required media, text-only adapters', async () => {
  const { gateway, calls } = gatewayFor({ ...ALL_DIRECT, ...GATEWAY, PUBLISHING_GATEWAY_PLATFORMS: 'tiktok' });
  assert.equal(gateway.validate('x', '👍🏽'.repeat(280), []).length, 0);
  assert.equal(gateway.validate('x', 'a'.repeat(281), [])[0]?.code, 'too_long');
  assert.equal(gateway.validate('tiktok', 'text', [])[0]?.code, 'media_required');
  const issues = gateway.validate('mastodon', 'text', ['https://cdn.test/a.png']);
  assert.equal(issues[0]?.code, 'media_unsupported');
  // Media is rejected, never silently dropped.
  const outcome = await gateway.publish(request('mastodon', 'text', ['https://cdn.test/a.png']));
  assert.equal(outcome.kind === 'failed' && outcome.code, 'content_invalid');
  assert.equal(calls.length, 0);
});

test('MASTODON_MAX_CHARS overrides the default limit', () => {
  const { gateway } = gatewayFor({ MASTODON_MAX_CHARS: '5000' });
  assert.equal(gateway.maxChars('mastodon'), 5000);
});

const classify = async (status: number, headers: Record<string, string> = {}) => {
  const { gateway } = gatewayFor({ ...ALL_DIRECT, PUBLISH_MODE: 'live' }, () => json({ detail: 'nope' }, status, headers));
  return gateway.publish(request('x'));
};

test('HTTP status classification', async () => {
  assert.equal((await classify(400)).kind, 'failed');
  assert.equal((await classify(401)).kind, 'blocked');
  assert.equal((await classify(403)).kind, 'blocked');
  const limited = await classify(429, { 'retry-after': '120' });
  assert.equal(limited.kind === 'retry' && limited.retryAfterMs, 120_000);
  assert.equal((await classify(503)).kind, 'retry');
  // 500 may have applied the write, and X has no idempotency key.
  assert.equal((await classify(500)).kind, 'unknown');
});

test('connection failures: before sending retries, after sending is unknown', async () => {
  const refused = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
  const reset = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } });
  const before = gatewayFor({ ...ALL_DIRECT, PUBLISH_MODE: 'live' }, () => { throw refused; });
  assert.equal((await before.gateway.publish(request('x'))).kind, 'retry');
  const after = gatewayFor({ ...ALL_DIRECT, PUBLISH_MODE: 'live' }, () => { throw reset; });
  assert.equal((await after.gateway.publish(request('x'))).kind, 'unknown');
  // Mastodon de-duplicates on the key, so the same failure is safe to retry there.
  assert.equal((await after.gateway.publish(request('mastodon'))).kind, 'retry');
});

test('a 2xx with no post id is unknown, not success', async () => {
  const { gateway } = gatewayFor({ ...ALL_DIRECT, PUBLISH_MODE: 'live' }, () => json({ data: {} }, 201));
  assert.equal((await gateway.publish(request('x'))).kind, 'unknown');
});

test('secrets echoed by a provider are redacted', async () => {
  const { gateway } = gatewayFor({ ...ALL_DIRECT, PUBLISH_MODE: 'live' }, () => json({ error: 'bad token x-secret' }, 400));
  const outcome = await gateway.publish(request('x'));
  assert.equal(outcome.kind, 'failed');
  if (outcome.kind === 'failed') {
    assert.doesNotMatch(outcome.message, /x-secret/);
    assert.match(outcome.message, /REDACTED/);
  }
});
