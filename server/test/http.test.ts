import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from '../src/http/app.ts';
import { harness, json, LIVE_X, TOKEN } from './helpers.ts';

const AUTH = { authorization: `Bearer ${TOKEN}` };
const FUTURE = '2026-11-20T10:00:00.000Z';

const post = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) });
const patch = (body: unknown) => ({ method: 'PATCH', body: JSON.stringify(body) });

test('health is public; everything else needs a token when one is configured', async () => {
  const h = harness({ env: { API_TOKEN: TOKEN } });
  assert.equal((await h.request('/api/health')).status, 200);
  for (const path of ['/api/status', '/api/posts', '/api/settings', '/api/platforms', '/api/pillars', '/api/ideas', '/api/activity']) {
    const res = await h.request(path);
    assert.equal(res.status, 401, path);
    assert.equal(((await res.json()) as any).error.code, 'unauthorized');
    assert.equal((await h.request(path, { headers: AUTH })).status, 200, path);
  }
  assert.equal((await h.request('/api/status', { headers: { authorization: 'Bearer wrong' } })).status, 401);
});

test('session cookie: login, use, expiry, logout', async () => {
  const h = harness({ env: { API_TOKEN: TOKEN } });
  assert.deepEqual(await (await h.request('/api/session')).json(), { authRequired: true, authenticated: false });
  assert.equal((await h.request('/api/session', post({ token: 'wrong' }))).status, 401);

  const login = await h.request('/api/session', post({ token: TOKEN }));
  assert.equal(login.status, 200);
  const setCookie = login.headers.get('set-cookie')!;
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  assert.doesNotMatch(setCookie, new RegExp(TOKEN));
  const cookie = setCookie.split(';')[0]!;

  assert.equal((await h.request('/api/status', { headers: { cookie } })).status, 200);
  assert.equal((await h.request('/api/status', { headers: { cookie: 'oce_session=123.forged' } })).status, 401);

  h.clock.advance(8 * 24 * 60);
  assert.equal((await h.request('/api/status', { headers: { cookie } })).status, 401);
});

test('without a token only loopback Host headers are served', async () => {
  const h = harness();
  assert.equal((await h.request('/api/status')).status, 200);
  assert.equal((await h.request('/api/status', { headers: { host: '127.0.0.1:4000' } })).status, 200);
  const rebound = await h.request('/api/status', { headers: { host: 'evil.test' } });
  assert.equal(rebound.status, 403);
  assert.equal(((await rebound.json()) as any).error.code, 'forbidden_host');
});

test('cross-site origins are refused; allowed and same-host origins pass', async () => {
  const h = harness();
  const evil = await h.request('/api/posts', { ...post({ platform: 'x', body: 'hi' }), headers: { origin: 'https://evil.test' } });
  assert.equal(evil.status, 403);
  assert.equal(h.posts.list({ limit: 1, offset: 0 }).total, 0);

  assert.equal((await h.request('/api/status', { headers: { origin: 'null' } })).status, 403);
  assert.equal((await h.request('/api/status', { headers: { origin: 'http://localhost:4000' } })).status, 200);

  const allowed = await h.request('/api/status', { headers: { origin: 'http://localhost:5173' } });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.equal(allowed.headers.get('access-control-allow-credentials'), 'true');
});

test('CORS preflight only approves configured origins', async () => {
  const h = harness();
  const preflight = (origin: string) => h.request('/api/posts', {
    method: 'OPTIONS',
    headers: { origin, 'access-control-request-method': 'POST' },
  });
  assert.equal((await preflight('http://localhost:5173')).headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.equal((await preflight('https://evil.test')).headers.get('access-control-allow-origin'), null);
});

test('request bodies must be JSON and within limits', async () => {
  const h = harness();
  const wrongType = await h.request('/api/pillars', { method: 'POST', body: '{"name":"a"}', headers: { 'content-type': 'text/plain' } });
  assert.equal(wrongType.status, 415);
  const lookalikeType = await h.request('/api/pillars', { method: 'POST', body: '{"name":"a"}', headers: { 'content-type': 'application/jsonp' } });
  assert.equal(lookalikeType.status, 415);
  assert.equal(((await (await h.request('/api/pillars')).json()) as any).items.length, 0);
  const charset = await h.request('/api/pillars', {
    method: 'POST', body: '{"name":"a"}', headers: { 'content-type': 'Application/JSON; charset=utf-8' },
  });
  assert.equal(charset.status, 201);
  assert.equal(((await h.request('/api/pillars', { method: 'POST', body: '{nope' })).status), 400);
  const huge = await h.request('/api/pillars', post({ name: 'a'.repeat(1024 * 1024 + 10) }));
  assert.equal(huge.status, 413);
  assert.equal(((await huge.json()) as any).error.code, 'payload_too_large');
});

test('validation errors name the field and unknown fields are refused', async () => {
  const h = harness();
  const res = await h.request('/api/posts', post({ platform: 'myspace', body: 'x' }));
  assert.equal(res.status, 400);
  const { error } = (await res.json()) as any;
  assert.equal(error.code, 'validation_error');
  assert.equal(error.details[0].path, 'platform');
  assert.equal((await h.request('/api/pillars', post({ name: 'a', hack: true }))).status, 400);
  assert.equal((await h.request('/api/posts', post({ platform: 'x', body: 'x', mediaUrls: ['http://insecure.test/a.png'] }))).status, 400);
});

test('unknown routes and ids return the error envelope', async () => {
  const h = harness();
  assert.equal(((await (await h.request('/api/nope')).json()) as any).error.code, 'not_found');
  assert.equal((await h.request('/api/posts/missing')).status, 404);
  assert.equal((await h.request('/api/pillars/missing', { method: 'DELETE' })).status, 404);
});

test('unexpected errors do not leak internals', async () => {
  const h = harness();
  h.settings.get = () => { throw new Error('sqlite path /secret/place'); };
  const res = await createApp(h).request('/api/settings', { headers: { host: 'localhost' } });
  assert.equal(res.status, 500);
  assert.doesNotMatch(await res.text(), /secret/);
});

test('platform listing is honest and never exposes secret values', async () => {
  const h = harness({ env: { X_USER_ACCESS_TOKEN: 'x-user-secret', MASTODON_INSTANCE_URL: 'https://s.test' } });
  const res = await h.request('/api/platforms');
  const text = await res.text();
  assert.doesNotMatch(text, /x-user-secret/);
  const { items, publishMode } = JSON.parse(text);
  assert.equal(publishMode, 'dry_run');
  const by = Object.fromEntries(items.map((p: any) => [p.id, p]));
  assert.equal(by.x.state, 'ready');
  assert.equal(by.x.canPublishLive, false);
  assert.deepEqual(by.mastodon.missingEnv, ['MASTODON_ACCESS_TOKEN']);
  assert.equal(by.tiktok.state, 'unsupported');
  assert.equal(by.tiktok.route, null);
  assert.equal(items.length, 10);
});

test('settings: read, patch, reject bad values', async () => {
  const h = harness();
  assert.equal(((await (await h.request('/api/settings')).json()) as any).autonomyEnabled, false);
  const res = await h.request('/api/settings', patch({ timezone: 'Europe/Berlin', autonomyEnabled: true }));
  const body = (await res.json()) as any;
  assert.equal(body.timezone, 'Europe/Berlin');
  assert.equal(body.autonomyEnabled, true);
  assert.equal((await h.request('/api/settings', patch({ timezone: 'Mars/Base' }))).status, 400);
  assert.equal((await h.request('/api/settings', patch({ postingSlots: [{ days: [9], time: '25:00' }] }))).status, 400);
});

test('pillars and ideas CRUD, generation, and drafting', async () => {
  const h = harness();
  const created = await h.request('/api/pillars', post({ name: 'Ops', keywords: ['on-call'], platforms: ['x'] }));
  assert.equal(created.status, 201);
  const pillar = (await created.json()) as any;
  assert.equal(pillar.active, true);

  const updated = (await (await h.request(`/api/pillars/${pillar.id}`, patch({ audience: 'SREs' }))).json()) as any;
  assert.equal(updated.audience, 'SREs');
  assert.equal(updated.name, 'Ops');
  assert.equal(((await (await h.request('/api/pillars')).json()) as any).items.length, 1);

  const generated = await h.request('/api/ideas/generate', post({ pillarId: pillar.id, count: 3 }));
  assert.equal(generated.status, 201);
  const ideas = ((await generated.json()) as any).items;
  assert.equal(ideas.length, 3);
  assert.equal(ideas[0].source, 'template');

  const manual = await h.request('/api/ideas', post({ pillarId: pillar.id, title: 'My idea', angle: 'Why' }));
  assert.equal(manual.status, 201);
  assert.equal((await h.request('/api/ideas', post({ pillarId: pillar.id, title: 'my IDEA' }))).status, 409);

  const list = (await (await h.request(`/api/ideas?pillarId=${pillar.id}&limit=2`)).json()) as any;
  assert.equal(list.total, 4);
  assert.equal(list.items.length, 2);

  const drafted = await h.request(`/api/ideas/${ideas[0].id}/draft`, post({ platform: 'x' }));
  assert.equal(drafted.status, 201);
  const draft = (await drafted.json()) as any;
  assert.equal(draft.status, 'draft');
  assert.equal(draft.ideaId, ideas[0].id);
  assert.equal(((await (await h.request(`/api/ideas/${ideas[0].id}`)).json()) as any).status, 'drafted');

  await h.request(`/api/ideas/${ideas[1].id}`, patch({ status: 'rejected' }));
  assert.equal((await h.request(`/api/ideas/${ideas[1].id}/draft`, post({ platform: 'x' }))).status, 409);
  assert.equal((await h.request(`/api/pillars/${pillar.id}`, { method: 'DELETE' })).status, 204);
  assert.equal(((await (await h.request('/api/ideas')).json()) as any).total, 0);
});

test('post lifecycle: draft, edit, schedule, unschedule, cancel, delete', async () => {
  const h = harness();
  const created = (await (await h.request('/api/posts', post({ platform: 'x', body: 'First' }))).json()) as any;
  assert.equal(created.status, 'draft');
  assert.deepEqual(created.issues, []);

  const edited = (await (await h.request(`/api/posts/${created.id}`, patch({ body: 'a'.repeat(300) }))).json()) as any;
  assert.equal(edited.issues[0].code, 'too_long');

  const refused = await h.request(`/api/posts/${created.id}/schedule`, post({ scheduledAt: FUTURE }));
  assert.equal(refused.status, 422);
  assert.equal(((await refused.json()) as any).error.code, 'content_invalid');

  await h.request(`/api/posts/${created.id}`, patch({ body: 'Fixed' }));
  assert.equal((await h.request(`/api/posts/${created.id}/schedule`, post({ scheduledAt: '2020-01-01T00:00:00Z' }))).status, 422);

  const scheduled = (await (await h.request(`/api/posts/${created.id}/schedule`, post({ scheduledAt: '2026-11-20T12:00:00+02:00' }))).json()) as any;
  assert.equal(scheduled.status, 'scheduled');
  assert.equal(scheduled.scheduledAt, FUTURE);

  const range = (await (await h.request('/api/posts?from=2026-11-20T00:00:00Z&to=2026-11-21T00:00:00Z&status=scheduled')).json()) as any;
  assert.equal(range.total, 1);

  assert.equal((await h.request(`/api/posts/${created.id}`, { method: 'DELETE' })).status, 409);
  assert.equal(((await (await h.request(`/api/posts/${created.id}/unschedule`, { method: 'POST' })).json()) as any).status, 'draft');
  assert.equal(((await (await h.request(`/api/posts/${created.id}/cancel`, { method: 'POST' })).json()) as any).status, 'cancelled');
  assert.equal((await h.request(`/api/posts/${created.id}`, patch({ body: 'no' }))).status, 409);
  assert.equal((await h.request(`/api/posts/${created.id}`, { method: 'DELETE' })).status, 204);
  assert.equal((await h.request(`/api/posts/${created.id}`)).status, 404);
});

test('scheduling an unsupported platform is refused, a draft is allowed', async () => {
  const h = harness();
  const draft = await h.request('/api/posts', post({ platform: 'threads', body: 'Hi' }));
  assert.equal(draft.status, 201);
  const refused = await h.request('/api/posts', post({ platform: 'threads', body: 'Hi', scheduledAt: FUTURE }));
  assert.equal(refused.status, 409);
  assert.equal(((await refused.json()) as any).error.code, 'platform_unsupported');
});

test('approve keeps a future proposal and moves a stale one to the next free slot', async () => {
  const h = harness();
  const make = (scheduledAt: string) => h.posts.insert(h.postService.build({
    platform: 'x', body: 'B', mediaUrls: [], pillarId: null, origin: 'autonomous', status: 'needs_review', scheduledAt,
  }));
  const future = make(FUTURE);
  const kept = (await (await h.request(`/api/posts/${future.id}/approve`, { method: 'POST' })).json()) as any;
  assert.equal(kept.status, 'scheduled');
  assert.equal(kept.scheduledAt, FUTURE);

  const stale = make('2026-11-01T09:00:00.000Z');
  const moved = (await (await h.request(`/api/posts/${stale.id}/approve`, { method: 'POST' })).json()) as any;
  assert.equal(moved.status, 'scheduled');
  assert.equal(moved.scheduledAt, '2026-11-09T09:00:00.000Z');

  assert.equal((await h.request(`/api/posts/${moved.id}/approve`, { method: 'POST' })).status, 409);
});

test('publish-now: real result in live mode, attempt history on the post', async () => {
  const h = harness({ env: LIVE_X, responder: () => json({ data: { id: '9' } }, 201) });
  const created = (await (await h.request('/api/posts', post({ platform: 'x', body: 'Now' }))).json()) as any;
  const res = await h.request(`/api/posts/${created.id}/publish-now`, { method: 'POST' });
  const published = (await res.json()) as any;
  assert.equal(published.status, 'published');
  assert.equal(published.externalUrl, 'https://x.com/i/status/9');
  const detail = (await (await h.request(`/api/posts/${created.id}`)).json()) as any;
  assert.equal(detail.attempts.length, 1);
  assert.equal(detail.attempts[0].outcome, 'published');
});

test('publish-now without credentials reports blocked and posts nothing', async () => {
  const h = harness({ env: { PUBLISH_MODE: 'live' } });
  const created = (await (await h.request('/api/posts', post({ platform: 'x', body: 'Now' }))).json()) as any;
  const res = await h.request(`/api/posts/${created.id}/publish-now`, { method: 'POST' });
  assert.equal(((await res.json()) as any).status, 'blocked');
  assert.equal(h.calls.length, 0);
});

test('needs_attention can only be resolved by a person', async () => {
  const h = harness({ env: LIVE_X, responder: () => json({}, 500) });
  const created = (await (await h.request('/api/posts', post({ platform: 'x', body: 'Now' }))).json()) as any;
  const unknown = (await (await h.request(`/api/posts/${created.id}/publish-now`, { method: 'POST' })).json()) as any;
  assert.equal(unknown.status, 'needs_attention');

  assert.equal((await h.request(`/api/posts/${created.id}/publish-now`, { method: 'POST' })).status, 409);
  assert.equal((await h.request(`/api/posts/${created.id}/schedule`, post({ scheduledAt: FUTURE }))).status, 409);
  assert.equal((await h.request(`/api/posts/${created.id}/cancel`, { method: 'POST' })).status, 409);

  const resolved = (await (await h.request(`/api/posts/${created.id}/resolve`, post({ outcome: 'not_published' }))).json()) as any;
  assert.equal(resolved.status, 'failed');
  assert.equal((await h.request(`/api/posts/${created.id}/resolve`, post({ outcome: 'published' }))).status, 409);
});

test('scheduler run endpoint and status summary', async () => {
  const h = harness();
  await h.request('/api/pillars', post({ name: 'Ops', platforms: ['bluesky'] }));
  const run = (await (await h.request('/api/scheduler/run', post({ job: 'autonomy' }))).json()) as any;
  assert.equal(run.result.createdPostIds.length, 5);

  h.clock.advance(70);
  const pub = (await (await h.request('/api/scheduler/run', post({ job: 'publish' }))).json()) as any;
  assert.equal(pub.result.processed, 0);

  const status = (await (await h.request('/api/status')).json()) as any;
  assert.equal(status.publishMode, 'dry_run');
  assert.equal(status.generator.reviewRequired, true);
  assert.equal(status.autonomy.effectiveAutoApprove, false);
  assert.equal(status.postCounts.needs_review, 5);
  assert.equal(status.autonomy.lastCycle.lastResult.stoppedReason, 'calendar_full');

  const activity = (await (await h.request('/api/activity?limit=1')).json()) as any;
  assert.equal(activity.items[0].type, 'autonomy.cycle');
});

test('health reveals configuration only to authenticated callers', async () => {
  const h = harness({ env: { API_TOKEN: TOKEN, X_USER_ACCESS_TOKEN: 'x-user-secret' } });
  assert.deepEqual(await (await h.request('/api/health')).json(), { ok: true });
  assert.deepEqual(await (await h.request('/api/health', { headers: AUTH })).json(), {
    ok: true,
    aiConfigured: false,
    publishingConfigured: true,
  });
});

test('errors carry a top-level message for simple clients', async () => {
  const h = harness();
  const body = (await (await h.request('/api/posts/missing')).json()) as any;
  assert.equal(body.message, 'Post missing not found');
  assert.equal(body.error.code, 'not_found');
});

test('brand: empty by default, replaced by PUT, fed to the generator', async () => {
  const seen: string[] = [];
  const h = harness({
    generator: {
      id: 'anthropic',
      reviewRequired: false,
      async generateIdeas({ brand, prompt }) {
        seen.push(brand.voice, prompt ?? '');
        return [{ title: 'T', angle: 'A' }];
      },
      async draftPost() {
        return 'B';
      },
    },
  });
  assert.equal(((await (await h.request('/api/brand')).json()) as any).voice, '');
  const put = await h.request('/api/brand', { method: 'PUT', body: JSON.stringify({ name: 'Acme', voice: 'Dry wit' }) });
  assert.equal(((await put.json()) as any).name, 'Acme');
  assert.equal((await h.request('/api/brand', { method: 'PUT', body: JSON.stringify({ pillars: [] }) })).status, 400);

  const pillar = (await (await h.request('/api/pillars', post({ name: 'Ops' }))).json()) as any;
  await h.request('/api/ideas/generate', post({ pillarId: pillar.id, prompt: 'Be brief' }));
  assert.deepEqual(seen, ['Dry wit', 'Be brief']);
});

test('autopilot start and pause drive the autonomy setting', async () => {
  const h = harness();
  assert.deepEqual(await (await h.request('/api/autopilot')).json(), {
    running: false, status: 'paused', lastRunAt: null, nextRunAt: null, lastError: null,
  });
  const started = (await (await h.request('/api/autopilot/start', { method: 'POST' })).json()) as any;
  assert.equal(started.running, true);
  assert.ok(started.nextRunAt);
  assert.equal(h.settings.get().autonomyEnabled, true);
  const paused = (await (await h.request('/api/autopilot/pause', { method: 'POST' })).json()) as any;
  assert.equal(paused.running, false);
  assert.equal(paused.nextRunAt, null);
});
