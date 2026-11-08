// Runs the built Worker in workerd with a real D1 and a mock provider. Makes no external network calls.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test, after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const scriptPath = join(root, 'dist/server/index.js');
const migration = (await readFile(join(root, 'drizzle/0000_initial.sql'), 'utf8')).split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean);
const JOB_TOKEN = 'job-token-job-token-job-token-job-token';
const OWNER = { 'oai-authenticated-user-id': 'user_owner', 'oai-authenticated-user-email': 'owner@example.com' };
const STRANGER = { 'oai-authenticated-user-id': 'user_other', 'oai-authenticated-user-email': 'other@example.com' };
const persistRoot = await mkdtemp(join(tmpdir(), 'oce-smoke-'));
const running = new Set();

async function start(bindings = {}, { migrate = true, persist = 'default', outboundService } = {}) {
  const mf = new Miniflare({
    scriptPath,
    modules: true,
    compatibilityDate: '2026-05-01',
    d1Databases: { DB: 'db' },
    d1Persist: join(persistRoot, persist),
    bindings,
    ...(outboundService ? { outboundService } : {}),
  });
  await mf.ready;
  running.add(mf);
  const db = await mf.getD1Database('DB');
  if (migrate) await db.batch(migration.map((sql) => db.prepare(sql)));
  const call = async (method, path, { headers = OWNER, json } = {}) => {
    const response = await mf.dispatchFetch(`https://site.example${path}`, {
      method,
      headers: { ...headers, ...(json !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: json !== undefined ? JSON.stringify(json) : undefined,
    });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    return { status: response.status, body, headers: response.headers };
  };
  return { mf, db, call, stop: async () => { running.delete(mf); await mf.dispose(); } };
}

after(async () => {
  await Promise.all([...running].map((mf) => mf.dispose()));
  await rm(persistRoot, { recursive: true, force: true });
});

const future = (hours = 24) => new Date(Date.now() + hours * 3_600_000).toISOString();
const past = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();

test('anonymous callers and the frontend', async () => {
  const { call, stop } = await start({}, { persist: 'anon' });
  assert.deepEqual((await call('GET', '/api/health', { headers: {} })).body, { ok: true });
  const session = await call('GET', '/api/session', { headers: {} });
  assert.deepEqual([session.body.authRequired, session.body.authenticated, session.body.user], [true, false, null]);
  for (const path of ['/api/status', '/api/posts', '/api/brand']) assert.equal((await call('GET', path, { headers: {} })).status, 401);

  const page = await call('GET', '/', { headers: {} });
  assert.equal(page.status, 200);
  assert.match(page.body, /<div id="root">/);
  assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
  const script = page.body.match(/src="(\/assets\/[^"]+\.js)"/)[1];
  const js = await call('GET', script, { headers: {} });
  assert.equal(js.status, 200);
  assert.match(js.headers.get('content-type'), /javascript/);
  assert.match(js.headers.get('cache-control'), /immutable/);
  assert.equal((await call('GET', '/signin-with-chatgpt', { headers: {} })).status, 404);
  assert.equal((await call('GET', '/missing', { headers: {} })).status, 404);
  assert.equal((await call('GET', '/api/missing')).body.error.code, 'not_found');
  await stop();
});

test('owner boundary and origin checks', async () => {
  const { call, stop } = await start({}, { persist: 'owner' });
  const first = await call('GET', '/api/session');
  assert.equal(first.body.authenticated, true);
  assert.equal(first.body.user.email, 'owner@example.com');
  const other = await call('GET', '/api/session', { headers: STRANGER });
  assert.deepEqual([other.body.authenticated, other.body.forbidden], [false, true]);
  assert.equal((await call('GET', '/api/posts', { headers: STRANGER })).body.error.code, 'forbidden_user');
  assert.equal((await call('PUT', '/api/brand', { headers: STRANGER, json: { name: 'x' } })).status, 403);
  assert.equal((await call('POST', '/api/jobs/tick', { headers: STRANGER })).status, 403);

  for (const site of ['cross-site', 'same-site']) {
    assert.equal((await call('POST', '/api/autopilot/start', { headers: { ...OWNER, 'sec-fetch-site': site } })).body.error.code, 'forbidden_origin');
  }
  assert.equal((await call('POST', '/api/autopilot/start', { headers: { ...OWNER, origin: 'https://evil.example' } })).status, 403);
  assert.equal((await call('POST', '/api/autopilot/pause', { headers: { ...OWNER, 'sec-fetch-site': 'same-origin' } })).status, 200);
  assert.equal((await call('POST', '/api/session', { json: { token: 'x' } })).status, 405);
  await stop();
});

test('OWNER_USER_ID pins the owner and spoofed local identity stays off hosted names', async () => {
  const pinned = await start({ OWNER_USER_ID: 'user_owner', LOCAL_DEV_USER_ID: 'user_owner' }, { persist: 'pinned' });
  assert.equal((await pinned.call('GET', '/api/posts', { headers: STRANGER })).status, 403);
  assert.equal((await pinned.call('GET', '/api/posts')).status, 200);
  assert.equal((await pinned.call('GET', '/api/posts', { headers: {} })).status, 401, 'local identity must not apply to a non-loopback host');
  await pinned.stop();
});

test('workspace data is durable across restarts', async () => {
  const first = await start({}, { persist: 'durable' });
  const { call } = first;
  const brand = { name: 'Acme', handle: '@acme', description: 'd', audience: 'a', voice: 'v', avoid: '' };
  assert.deepEqual((await call('PUT', '/api/brand', { json: brand })).body, brand);

  await call('PATCH', '/api/settings', { json: { timezone: 'Europe/Berlin' } });
  const settings = await call('PATCH', '/api/settings', { json: { maxPostsPerCycle: 2 } });
  assert.deepEqual([settings.body.timezone, settings.body.maxPostsPerCycle], ['Europe/Berlin', 2]);
  assert.equal((await call('PATCH', '/api/settings', { json: { unknown: true } })).body.error.code, 'validation_error');
  assert.equal((await call('PATCH', '/api/settings', { json: { timezone: 'Mars/Base' } })).status, 400);

  const pillar = (await call('POST', '/api/pillars', { json: { name: 'Craft', keywords: ['design'], platforms: ['bluesky'] } }));
  assert.equal(pillar.status, 201);
  const generated = await call('POST', '/api/ideas/generate', { json: { pillarId: pillar.body.id, count: 3 } });
  assert.equal(generated.status, 201);
  assert.equal(generated.body.items.length, 3);
  assert.equal(generated.body.items[0].source, 'template');

  const manual = await call('POST', '/api/ideas', { json: { pillarId: pillar.body.id, title: 'One idea' } });
  assert.equal(manual.status, 201);
  assert.equal((await call('POST', '/api/ideas', { json: { pillarId: pillar.body.id, title: 'ONE idea!' } })).body.error.code, 'duplicate_idea');
  assert.equal((await call('POST', '/api/ideas', { json: { pillarId: 'nope', title: 'x' } })).status, 404);

  const draft = await call('POST', `/api/ideas/${manual.body.id}/draft`, { json: { platform: 'bluesky' } });
  assert.equal(draft.status, 201);
  assert.equal(draft.body.status, 'draft');
  assert.deepEqual(draft.body.issues, []);
  assert.equal((await call('GET', `/api/ideas/${manual.body.id}`)).body.status, 'drafted');
  await first.stop();

  const second = await start({}, { persist: 'durable', migrate: false });
  assert.equal((await second.call('GET', '/api/brand')).body.name, 'Acme');
  assert.equal((await second.call('GET', '/api/settings')).body.maxPostsPerCycle, 2);
  assert.equal((await second.call('GET', '/api/pillars')).body.items.length, 1);
  const ideas = await second.call('GET', '/api/ideas?limit=2');
  assert.deepEqual([ideas.body.total, ideas.body.items.length, ideas.body.limit, ideas.body.offset], [4, 2, 2, 0]);
  assert.equal((await second.call('GET', '/api/posts')).body.total, 1);

  assert.equal((await second.call('DELETE', `/api/pillars/${pillar.body.id}`)).status, 204);
  assert.equal((await second.call('GET', '/api/ideas')).body.total, 0, 'pillar delete cascades to ideas');
  const kept = await second.call('GET', `/api/posts/${draft.body.id}`);
  assert.deepEqual([kept.status, kept.body.pillarId, kept.body.ideaId], [200, null, null]);
  await second.stop();
});

test('dry run is honest and post state rules hold', async () => {
  const { call, stop } = await start({}, { persist: 'dryrun' });
  assert.equal((await call('POST', '/api/posts', { json: { platform: 'bluesky', body: 'x', scheduledAt: past(5) } })).body.error.code, 'scheduled_in_past');
  assert.equal((await call('POST', '/api/posts', { json: { platform: 'bluesky', body: 'x'.repeat(301), scheduledAt: future() } })).body.error.code, 'content_invalid');
  assert.equal((await call('POST', '/api/posts', { json: { platform: 'threads', body: 'x', scheduledAt: future() } })).body.error.code, 'platform_unsupported');

  const post = (await call('POST', '/api/posts', { json: { platform: 'bluesky', body: 'hello' } })).body;
  assert.equal(post.status, 'draft');
  const scheduled = (await call('POST', `/api/posts/${post.id}/schedule`, { json: { scheduledAt: future() } })).body;
  assert.equal(scheduled.status, 'scheduled');
  assert.equal((await call('PATCH', `/api/posts/${post.id}`, { json: { scheduledAt: future() } })).status, 400);
  assert.equal((await call('POST', `/api/posts/${post.id}/resolve`, { json: { outcome: 'published' } })).body.error.code, 'invalid_state');

  const done = await call('POST', `/api/posts/${post.id}/publish-now`);
  assert.equal(done.status, 200);
  assert.deepEqual([done.body.status, done.body.externalId, done.body.publishedAt], ['simulated', null, null]);
  const detail = (await call('GET', `/api/posts/${post.id}`)).body;
  assert.deepEqual([detail.attempts.length, detail.attempts[0].mode, detail.attempts[0].outcome], [1, 'dry_run', 'simulated']);

  const gated = (await call('POST', '/api/posts', { json: { platform: 'threads', body: 'hi' } })).body;
  assert.equal((await call('POST', `/api/posts/${gated.id}/publish-now`)).body.error.code, 'platform_unsupported');

  const platforms = (await call('GET', '/api/platforms')).body;
  assert.equal(platforms.publishMode, 'dry_run');
  assert.equal(platforms.items.length, 10);
  assert.ok(platforms.items.every((p) => p.canPublishLive === false && p.state !== 'ready'));
  assert.deepEqual(platforms.items.find((p) => p.id === 'x').missingEnv, ['X_USER_ACCESS_TOKEN']);
  assert.equal(platforms.items.find((p) => p.id === 'tiktok').state, 'unsupported');

  await call('PATCH', '/api/settings', { json: { publishingPaused: true } });
  const paused = (await call('POST', '/api/posts', { json: { platform: 'bluesky', body: 'wait' } })).body;
  assert.equal((await call('POST', `/api/posts/${paused.id}/publish-now`)).body.error.code, 'publishing_paused');
  await stop();
});

test('background work runs only through the authenticated job endpoint', async () => {
  const { call, db, stop } = await start({ JOB_TOKEN }, { persist: 'jobs' });
  const none = (await call('GET', '/api/status')).body.scheduler;
  assert.deepEqual([none.enabled, none.running, none.tickSeconds, none.lastTickAt, none.jobPath], [false, false, 0, null, '/api/jobs/tick']);
  assert.equal(none.jobCredentialConfigured, true);

  assert.equal((await call('POST', '/api/jobs/tick', { headers: {} })).status, 401);
  assert.equal((await call('POST', '/api/jobs/tick', { headers: { authorization: 'Bearer wrong' } })).status, 401);

  const due = (await call('POST', '/api/posts', { json: { platform: 'mastodon', body: 'due', scheduledAt: future() } })).body;
  const late = (await call('POST', '/api/posts', { json: { platform: 'mastodon', body: 'late', scheduledAt: future() } })).body;
  await db.prepare('UPDATE posts SET scheduled_at = ? WHERE id = ?').bind(past(1), due.id).run();
  await db.prepare('UPDATE posts SET scheduled_at = ? WHERE id = ?').bind(past(600), late.id).run();
  assert.equal((await call('GET', `/api/posts/${due.id}`)).body.status, 'scheduled', 'nothing advances without a call');

  await call('PATCH', '/api/settings', { json: { publishingPaused: true } });
  const held = (await call('POST', '/api/jobs/tick', { headers: { authorization: `Bearer ${JOB_TOKEN}` } })).body;
  assert.deepEqual([held.publish.skippedPaused, held.publish.processed], [true, 0]);
  await call('PATCH', '/api/settings', { json: { publishingPaused: false } });

  const tick = await call('POST', '/api/jobs/tick', { headers: { authorization: `Bearer ${JOB_TOKEN}` } });
  assert.equal(tick.status, 200);
  assert.deepEqual([tick.body.ok, tick.body.publish.processed, tick.body.publish.missed, tick.body.autonomy], [true, 1, 1, null]);
  assert.equal((await call('GET', `/api/posts/${due.id}`)).body.status, 'simulated');
  const missed = (await call('GET', `/api/posts/${late.id}`)).body;
  assert.deepEqual([missed.status, missed.lastErrorCode], ['failed', 'missed_window']);
  assert.ok((await call('GET', '/api/status')).body.scheduler.lastTickAt);

  // A publish that died mid-request may be live, so it needs a person.
  const stuck = (await call('POST', '/api/posts', { json: { platform: 'mastodon', body: 'stuck' } })).body;
  await db.prepare(`UPDATE posts SET status = 'publishing', lease_at = ?, attempt_count = 1 WHERE id = ?`).bind(past(10), stuck.id).run();
  assert.equal((await call('POST', '/api/scheduler/run', { json: { job: 'publish' } })).body.result.recovered, 1);
  const attention = (await call('GET', `/api/posts/${stuck.id}`)).body;
  assert.deepEqual([attention.status, attention.lastErrorCode], ['needs_attention', 'interrupted']);
  const resolved = await call('POST', `/api/posts/${stuck.id}/resolve`, { json: { outcome: 'not_published' } });
  assert.deepEqual([resolved.body.status, resolved.body.lastErrorCode], ['failed', 'confirmed_not_published']);
  await stop();
});

test('autopilot fills review, never auto-approves template copy, and is lock protected', async () => {
  const { call, db, stop } = await start({ JOB_TOKEN }, { persist: 'autopilot' });
  await call('POST', '/api/pillars', { json: { name: 'Craft', keywords: ['design', 'type'], platforms: ['bluesky', 'tiktok'] } });
  await call('PATCH', '/api/settings', { json: { autoApprove: true, maxPostsPerCycle: 2, postingSlots: [{ days: [0, 1, 2, 3, 4, 5, 6], time: '09:00' }] } });
  assert.equal((await call('POST', '/api/jobs/tick', { headers: { authorization: `Bearer ${JOB_TOKEN}` } })).body.autonomy, null, 'off until started');

  const started = (await call('POST', '/api/autopilot/start')).body;
  assert.deepEqual([started.running, started.status], [true, 'running']);
  const { autonomy } = (await call('POST', '/api/jobs/tick', { headers: { authorization: `Bearer ${JOB_TOKEN}` } })).body;
  assert.deepEqual([autonomy.createdPostIds.length, autonomy.stoppedReason, autonomy.skippedPlatforms], [2, 'budget_reached', ['tiktok']]);
  const review = (await call('GET', '/api/posts?status=needs_review')).body;
  assert.equal(review.total, 2);
  assert.ok(review.items.every((p) => p.origin === 'autonomous' && p.generator === 'template'));
  assert.equal((await call('GET', '/api/status')).body.autonomy.effectiveAutoApprove, false);
  assert.equal((await call('POST', '/api/jobs/tick', { headers: { authorization: `Bearer ${JOB_TOKEN}` } })).body.autonomy, null, 'not due again yet');

  const approved = (await call('POST', `/api/posts/${review.items[0].id}/approve`)).body;
  assert.equal(approved.status, 'scheduled');

  await db.prepare('INSERT INTO job_locks (name, locked_until) VALUES (?, ?)').bind('autonomy_cycle', future(1)).run();
  assert.equal((await call('GET', '/api/status')).body.autonomy.running, true);
  assert.equal((await call('POST', '/api/scheduler/run', { json: { job: 'autonomy' } })).body.error.code, 'cycle_running');
  await stop();
});

test('service access is rejected unless explicitly trusted', async () => {
  const closed = await start({}, { persist: 'svc-closed' });
  assert.equal((await closed.call('GET', '/api/status')).body.scheduler.jobCredentialConfigured, false);
  assert.equal((await closed.call('POST', '/api/jobs/tick', { headers: {} })).status, 401);
  await closed.stop();
  const open = await start({ SITES_SERVICE_ACCESS_TRUSTED: 'true' }, { persist: 'svc-open' });
  assert.equal((await open.call('POST', '/api/jobs/tick', { headers: {} })).status, 200);
  assert.equal((await open.call('GET', '/api/posts', { headers: {} })).status, 401, 'trust covers only the job route');
  await open.stop();
});

test('live mode publishes only with credentials, reports failures honestly, and scrubs secrets', async (t) => {
  const requests = [];
  let reply = () => ({ status: 200, body: { id: 'toot-1', url: 'https://social.example/@a/1' } });
  const SECRET = 'mastodon-secret-value';
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      requests.push({ url: req.url, headers: req.headers, body });
      const { status, body: payload, headers } = reply(req);
      res.writeHead(status, { 'content-type': 'application/json', ...headers });
      res.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
    });
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const { call, stop } = await start({
    PUBLISH_MODE: 'live',
    MASTODON_INSTANCE_URL: base,
    MASTODON_ACCESS_TOKEN: SECRET,
    BLUESKY_HANDLE: 'a.test',
    BLUESKY_APP_PASSWORD: 'bluesky-secret-value',
    BLUESKY_SERVICE_URL: base,
    PUBLISHING_GATEWAY_URL: `${base}/relay`,
    PUBLISHING_GATEWAY_TOKEN: 'gateway-secret-value',
    PUBLISHING_GATEWAY_PLATFORMS: 'tiktok',
    PUBLISH_HTTP_TIMEOUT_MS: '5000',
  }, { persist: 'live' });
  const publish = async (platform, body, extra = {}) => {
    const post = (await call('POST', '/api/posts', { json: { platform, body, ...extra } })).body;
    return (await call('POST', `/api/posts/${post.id}/publish-now`)).body;
  };

  const ready = (await call('GET', '/api/platforms')).body.items;
  assert.equal(ready.find((p) => p.id === 'mastodon').canPublishLive, true);
  assert.equal(ready.find((p) => p.id === 'x').canPublishLive, false);
  assert.equal(JSON.stringify(ready).includes(SECRET), false);

  const blocked = await publish('x', 'no credentials');
  assert.deepEqual([blocked.status, blocked.lastErrorCode], ['blocked', 'credentials_missing']);
  assert.equal(requests.length, 0, 'a blocked post sends nothing');

  const published = await publish('mastodon', 'real');
  assert.deepEqual([published.status, published.externalId, published.externalUrl], ['published', 'toot-1', 'https://social.example/@a/1']);
  assert.equal(requests[0].headers.authorization, `Bearer ${SECRET}`);
  assert.match(requests[0].headers['idempotency-key'], /^[0-9a-f]{64}$/);

  reply = () => ({ status: 302, body: '', headers: { location: `${base}/elsewhere` } });
  let count = requests.length;
  const redirected = await publish('mastodon', 'redirected');
  assert.equal(redirected.status, 'scheduled', 'idempotent route retries an ambiguous result');
  assert.equal(requests.length, count + 1, 'a redirect is never followed with credentials');

  reply = () => ({ status: 400, body: { error: `bad token ${SECRET}` } });
  const rejected = await publish('mastodon', 'rejected');
  assert.deepEqual([rejected.status, rejected.lastErrorCode], ['failed', 'http_400']);
  assert.equal(rejected.lastErrorMessage.includes(SECRET), false);
  assert.match(rejected.lastErrorMessage, /\[REDACTED\]/);

  reply = () => ({ status: 408, body: { error: 'request timed out' } });
  const timedOut = await publish('mastodon', 'timed out');
  assert.deepEqual([timedOut.status, timedOut.lastErrorCode], ['scheduled', 'http_408']);

  reply = () => ({ status: 401, body: {} });
  assert.deepEqual([(await publish('mastodon', 'unauthorized')).status], ['blocked']);

  reply = (req) => (req.url.includes('createSession') ? { status: 200, body: { accessJwt: 'jwt', did: 'did:plc:a' } } : { status: 500, body: {} });
  const uncertain = await publish('bluesky', 'maybe live');
  assert.deepEqual([uncertain.status, uncertain.lastErrorCode], ['needs_attention', 'http_500']);
  const confirmed = await call('POST', `/api/posts/${uncertain.id}/resolve`, { json: { outcome: 'published', externalUrl: 'https://bsky.app/p/1' } });
  assert.deepEqual([confirmed.body.status, confirmed.body.externalUrl], ['published', 'https://bsky.app/p/1']);

  reply = () => ({ status: 200, body: { id: 'relay-1' } });
  const relayed = await publish('tiktok', 'via gateway', { mediaUrls: ['https://cdn.example/a.mp4'] });
  assert.deepEqual([relayed.status, relayed.externalId], ['published', 'relay-1']);
  assert.equal(requests.at(-1).url, '/relay');
  assert.deepEqual(JSON.parse(requests.at(-1).body), { platform: 'tiktok', text: 'via gateway', mediaUrls: ['https://cdn.example/a.mp4'] });

  await stop();
});

test('misconfiguration fails closed with a named reason', async () => {
  const badToken = 'short-secret';
  const invalid = await start({ JOB_TOKEN: badToken }, { persist: 'bad-config' });
  const config = await invalid.call('GET', '/api/session');
  assert.deepEqual([config.status, config.body.error.code], [500, 'config_invalid']);
  assert.match(config.body.message, /JOB_TOKEN/);
  assert.equal(JSON.stringify(config.body).includes(badToken), false);
  await invalid.stop();

  const empty = await start({}, { persist: 'no-schema', migrate: false });
  assert.equal((await empty.call('GET', '/api/session')).body.error.code, 'database_not_migrated');
  await empty.stop();

  const noKey = await start({ CONTENT_GENERATOR: 'anthropic' }, { persist: 'no-key' });
  const pillar = (await noKey.call('POST', '/api/pillars', { json: { name: 'P', platforms: ['bluesky'] } })).body;
  const generated = await noKey.call('POST', '/api/ideas/generate', { json: { pillarId: pillar.id } });
  assert.deepEqual([generated.status, generated.body.error.code, generated.body.message], [502, 'generation_failed', 'ANTHROPIC_API_KEY is not set']);
  assert.equal((await noKey.call('GET', '/api/health')).body.aiConfigured, false);
  await noKey.stop();
});

test('the Anthropic generator works in workerd against a mocked API', async () => {
  const calls = [];
  let text = JSON.stringify({ ideas: [{ title: 'A written idea', angle: 'An angle' }] });
  let stopReason = 'end_turn';
  const { call, stop } = await start({ CONTENT_GENERATOR: 'anthropic', ANTHROPIC_API_KEY: 'test-key-value' }, {
    persist: 'anthropic',
    outboundService: async (request) => {
      calls.push({ url: request.url, headers: Object.fromEntries(request.headers), body: await request.json() });
      return Response.json({
        id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: stopReason, stop_sequence: null,
        content: stopReason === 'refusal' ? [] : [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 },
      });
    },
  });
  const pillar = (await call('POST', '/api/pillars', { json: { name: 'P', platforms: ['bluesky'] } })).body;
  const ideas = await call('POST', '/api/ideas/generate', { json: { pillarId: pillar.id, count: 1 } });
  assert.equal(ideas.status, 201);
  assert.deepEqual([ideas.body.items[0].title, ideas.body.items[0].source], ['A written idea', 'anthropic']);
  assert.match(calls[0].url, /^https:\/\/api\.anthropic\.com\/v1\/messages/);
  assert.equal(calls[0].headers.authorization, 'Bearer test-key-value');
  assert.match(calls[0].headers['anthropic-beta'], /server-side-fallback-2026-07-01/);
  assert.deepEqual([calls[0].body.model, calls[0].body.fallbacks, calls[0].body.output_config.format.type], ['claude-opus-5-5', 'default', 'json_schema']);

  text = JSON.stringify({ body: 'A finished post' });
  const draft = await call('POST', `/api/ideas/${ideas.body.items[0].id}/draft`, { json: { platform: 'bluesky' } });
  assert.deepEqual([draft.status, draft.body.body, draft.body.generator], [201, 'A finished post', 'anthropic']);

  stopReason = 'refusal';
  const refused = await call('POST', '/api/ideas/generate', { json: { pillarId: pillar.id, count: 1 } });
  assert.deepEqual([refused.status, refused.body.message], [502, 'The model declined this request']);
  await stop();
});
