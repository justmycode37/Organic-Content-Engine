import {createHmac,pbkdf2Sync} from 'node:crypto';
// Runs the built Worker in workerd with a real D1 and a mock provider. Makes no external network calls.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test, after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const scriptPath = join(root, 'dist/server/index.js');
const migration=[];for(const file of (await readdir(join(root,'drizzle'))).filter(n=>n.endsWith('.sql')).sort())migration.push(...(await readFile(join(root,'drizzle',file),'utf8')).split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean));
const SESSION_SECRET='test-session-secret-for-tests-only';
const TEST_HASH='test-salt:'+pbkdf2Sync('test-password','test-salt',100000,32,'sha256').toString('hex');
const cookiePayload=`${Math.floor(Date.now()/1000)+3600}.test-nonce`;
const COOKIE=`oce_access=${cookiePayload}.${createHmac('sha256',SESSION_SECRET).update(`user_owner:${cookiePayload}`).digest('hex')}`;
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
    r2Buckets:['BUCKET'],
    bindings:{CONTENT_GENERATOR:'template',SESSION_SECRET,APP_PASSWORD_HASH:TEST_HASH,TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,1).toString('base64'),PUBLIC_BASE_URL:'https://site.example',...bindings},
    ...(outboundService ? { outboundService } : {}),
  });
  await mf.ready;
  running.add(mf);
  const db = await mf.getD1Database('DB');
  if (migrate) await db.batch(migration.map((sql) => db.prepare(sql)));
  const call = async (method, path, { headers = OWNER, json } = {}) => {
    const response = await mf.dispatchFetch(`https://site.example${path}`, {
      method,
      headers: { ...headers, ...(headers['oai-authenticated-user-id']==='user_owner'&&!('cookie' in headers)?{cookie:COOKIE}:{}), ...(json !== undefined ? { 'content-type': 'application/json' } : {}) },
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
  assert.equal((await call('POST', '/api/session', { json: { token: 'x' } })).status, 401);
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

  const pillar = (await call('POST', '/api/pillars', { json: { name: 'Craft', keywords: ['design'], platforms: ['x'] } }));
  assert.equal(pillar.status, 201);
  const generated = await call('POST', '/api/ideas/generate', { json: { pillarId: pillar.body.id, count: 3 } });
  assert.equal(generated.status, 201);
  assert.equal(generated.body.items.length, 3);
  assert.equal(generated.body.items[0].source, 'template');

  const manual = await call('POST', '/api/ideas', { json: { pillarId: pillar.body.id, title: 'One idea' } });
  assert.equal(manual.status, 201);
  assert.equal((await call('POST', '/api/ideas', { json: { pillarId: pillar.body.id, title: 'ONE idea!' } })).body.error.code, 'duplicate_idea');
  assert.equal((await call('POST', '/api/ideas', { json: { pillarId: 'nope', title: 'x' } })).status, 404);

  const draft = await call('POST', `/api/ideas/${manual.body.id}/draft`, { json: { platform: 'x' } });
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
  assert.equal((await call('POST', '/api/posts', { json: { platform: 'x', body: 'x', scheduledAt: past(5) } })).body.error.code, 'scheduled_in_past');
  assert.equal((await call('POST', '/api/posts', { json: { platform: 'x', body: 'x'.repeat(301), scheduledAt: future() } })).body.error.code, 'content_invalid');
  assert.equal((await call('POST', '/api/posts', { json: { platform: 'threads', body: 'x', scheduledAt: future() } })).body.error.code, 'validation_error');

  const post = (await call('POST', '/api/posts', { json: { platform: 'x', body: 'hello' } })).body;
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

  assert.equal((await call('POST','/api/posts',{json:{platform:'threads',body:'disabled'}})).status,400);

  const platforms = (await call('GET', '/api/platforms')).body;
  assert.equal(platforms.publishMode, 'dry_run');
  assert.equal(platforms.items.length, 5);
  assert.ok(platforms.items.every((p) => p.canPublishLive === false && p.state !== 'ready'));
  assert.deepEqual(platforms.items.find((p) => p.id === 'x').missingEnv, ['X_USER_ACCESS_TOKEN']);
  assert.equal(platforms.items.find((p) => p.id === 'tiktok').state, 'missing_credentials');

  await call('PATCH', '/api/settings', { json: { publishingPaused: true } });
  const paused = (await call('POST', '/api/posts', { json: { platform: 'x', body: 'wait' } })).body;
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

  const due = (await call('POST', '/api/posts', { json: { platform: 'linkedin', body: 'due', scheduledAt: future() } })).body;
  const late = (await call('POST', '/api/posts', { json: { platform: 'linkedin', body: 'late', scheduledAt: future() } })).body;
  await db.prepare('UPDATE posts SET scheduled_at = ? WHERE id = ?').bind(past(1), due.id).run();
  await db.prepare('UPDATE posts SET scheduled_at = ? WHERE id = ?').bind(past(600), late.id).run();
  assert.equal((await call('GET', `/api/posts/${due.id}`)).body.status, 'scheduled', 'nothing advances without a call');

  const off = (await call('POST', '/api/jobs/tick', { headers: { authorization: `Bearer ${JOB_TOKEN}` } })).body;
  assert.equal(off.paused, true);
  assert.equal((await call('GET', `/api/posts/${due.id}`)).body.status, 'scheduled');
  assert.equal((await call('GET', '/api/status')).body.scheduler.lastTickAt, null);
  await call('PATCH', '/api/settings', { json: { autonomyEnabled: true, publishingPaused: true } });
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
  const stuck = (await call('POST', '/api/posts', { json: { platform: 'linkedin', body: 'stuck' } })).body;
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
  await call('POST', '/api/pillars', { json: { name: 'Craft', keywords: ['design', 'type'], platforms: ['x', 'tiktok'] } });
  await call('PATCH', '/api/settings', { json: { autoApprove: true, maxPostsPerCycle: 2, postingSlots: [{ days: [0, 1, 2, 3, 4, 5, 6], time: '09:00' }] } });
  assert.equal((await call('POST', '/api/jobs/tick', { headers: { authorization: `Bearer ${JOB_TOKEN}` } })).body.autonomy, null, 'off until started');

  const started = (await call('POST', '/api/autopilot/start')).body;
  assert.deepEqual([started.running, started.status], [true, 'running']);
  const { autonomy } = (await call('POST', '/api/jobs/tick', { headers: { authorization: `Bearer ${JOB_TOKEN}` } })).body;
  assert.deepEqual([autonomy.createdPostIds.length, autonomy.stoppedReason, autonomy.skippedPlatforms], [2, 'budget_reached', []]);
  const review = (await call('GET', '/api/posts?status=needs_review')).body;
  assert.equal(review.total, 2);
  assert.ok(review.items.every((p) => p.origin === 'autonomous' && p.generator === 'template'));
  assert.equal((await call('GET', '/api/status')).body.autonomy.effectiveAutoApprove, false);
  assert.equal((await call('POST', '/api/jobs/tick', { headers: { authorization: `Bearer ${JOB_TOKEN}` } })).body.autonomy, null, 'not due again yet');

  const approved = (await call('POST', `/api/posts/${review.items.find(p=>p.platform==='x').id}/approve`)).body;
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

test('live gateway honors provider outcomes and never leaks secrets',async()=>{
 const secret='gateway-secret-value';let response={status:200,body:{id:'delivered'}};let calls=0;
 const {call,stop}=await start({PUBLISH_MODE:'live',PUBLISHING_GATEWAY_URL:'https://gateway.example/publish',PUBLISHING_GATEWAY_TOKEN:secret,PUBLISHING_GATEWAY_PLATFORMS:'linkedin,tiktok'},{persist:'gateway-live',outboundService:async request=>{calls++;assert.equal(request.headers.get('authorization'),`Bearer ${secret}`);return new Response(JSON.stringify(response.body),{status:response.status,headers:{'content-type':'application/json'}});}});
 const send=async(platform,body,extra={})=>{const p=(await call('POST','/api/posts',{json:{platform,body,...extra}})).body;return (await call('POST',`/api/posts/${p.id}/publish-now`)).body;};
 const blocked=await send('x','missing credentials');assert.equal(blocked.status,'blocked');assert.equal(calls,0);
 const ok=await send('linkedin','A reviewed post');assert.equal(ok.status,'published');assert.equal(ok.externalId,'delivered');
 response={status:400,body:{error:`Invalid ${secret}`}};const failed=await send('linkedin','Rejected');assert.equal(failed.status,'failed');assert.ok(!failed.lastErrorMessage.includes(secret));
 response={status:503,body:{error:'temporarily unavailable'}};const retry=await send('linkedin','Retry');assert.equal(retry.status,'scheduled');
 response={status:200,body:{id:'video-1'}};const video=await send('tiktok','A video',{mediaUrls:['https://cdn.example/video.mp4']});assert.equal(video.status,'published');
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
  const pillar = (await noKey.call('POST', '/api/pillars', { json: { name: 'P', platforms: ['x'] } })).body;
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
  const pillar = (await call('POST', '/api/pillars', { json: { name: 'P', platforms: ['x'] } })).body;
  const ideas = await call('POST', '/api/ideas/generate', { json: { pillarId: pillar.id, count: 1 } });
  assert.equal(ideas.status, 201);
  assert.deepEqual([ideas.body.items[0].title, ideas.body.items[0].source], ['A written idea', 'anthropic']);
  assert.match(calls[0].url, /^https:\/\/api\.anthropic\.com\/v1\/messages/);
  assert.equal(calls[0].headers.authorization, 'Bearer test-key-value');
  assert.match(calls[0].headers['anthropic-beta'], /server-side-fallback-2026-07-01/);
  assert.deepEqual([calls[0].body.model, calls[0].body.fallbacks, calls[0].body.output_config.format.type], ['claude-opus-5-5', 'default', 'json_schema']);

  text = JSON.stringify({ body: 'A finished post' });
  const draft = await call('POST', `/api/ideas/${ideas.body.items[0].id}/draft`, { json: { platform: 'x' } });
  assert.deepEqual([draft.status, draft.body.body, draft.body.generator], [201, 'A finished post', 'anthropic']);

  stopReason = 'refusal';
  const refused = await call('POST', '/api/ideas/generate', { json: { pillarId: pillar.id, count: 1 } });
  assert.deepEqual([refused.status, refused.body.message], [502, 'The model declined this request']);
  await stop();
});

test('feedback persists idempotently, scopes learning by platform, rejects simulated metrics, and revises without changing the published post', async () => {
  const prompts = [];
  let modelOutput = JSON.stringify({ body: 'Original published copy' });
  const { call, db, stop } = await start({ CONTENT_GENERATOR: 'anthropic', ANTHROPIC_API_KEY: 'feedback-test-key' }, {
    persist: 'feedback-loop',
    outboundService: async (request) => {
      const body = await request.json();
      prompts.push(body.messages[0].content);
      return Response.json({
        id: 'msg_feedback', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', stop_sequence: null,
        content: [{ type: 'text', text: modelOutput }], usage: { input_tokens: 1, output_tokens: 1 },
      });
    },
  });

  const pillar = (await call('POST', '/api/pillars', { json: { name: 'Craft', platforms: ['x'] } })).body;
  const idea = (await call('POST', '/api/ideas', { json: { pillarId: pillar.id, title: 'A useful lesson' } })).body;
  const original = (await call('POST', `/api/ideas/${idea.id}/draft`, { json: { platform: 'x' } })).body;
  assert.equal(original.body, 'Original published copy');
  await db.prepare("UPDATE posts SET status='published', published_at=?, external_id=?, external_url=? WHERE id=?")
    .bind(new Date().toISOString(), 'x-original-1', 'https://x.com/i/status/x-original-1', original.id).run();

  const firstFeedback = { format: 'Original story', verdict: 'iterate', notes: 'Tighten the hook', impressions: 100, engagements: 10, conversions: 2 };
  assert.equal((await call('PUT', `/api/posts/${original.id}/feedback`, { json: firstFeedback })).status, 200);
  const saved = await call('PUT', `/api/posts/${original.id}/feedback`, {
    json: { format: 'Case study', verdict: 'successful', notes: 'Clear payoff', impressions: 0, engagements: 0, conversions: 0 },
  });
  assert.deepEqual([saved.status, saved.body.format, saved.body.verdict, saved.body.impressions, saved.body.engagements, saved.body.conversions], [200, 'Case study', 'successful', 0, 0, 0]);
  let feedback = (await call('GET', '/api/feedback')).body;
  assert.equal(feedback.entries.filter((entry) => entry.postId === original.id).length, 1, 'resaving replaces one post entry');
  assert.deepEqual(feedback.formats.map((entry) => [entry.format, entry.platform, entry.samples, entry.successes, entry.iterations]), [['Case study', 'x', 1, 1, 0]], 'old format/verdict are no longer counted');

  const linkedinPillar = (await call('POST', '/api/pillars', { json: { name: 'LinkedIn craft', platforms: ['linkedin'] } })).body;
  const linkedin = (await call('POST', '/api/posts', { json: { platform: 'linkedin', body: 'LinkedIn copy', pillarId: linkedinPillar.id } })).body;
  await db.prepare("UPDATE posts SET status='published', published_at=?, external_id=?, external_url=? WHERE id=?")
    .bind(new Date().toISOString(), 'linkedin-original-1', 'https://www.linkedin.com/feed/update/linkedin-original-1', linkedin.id).run();
  assert.equal((await call('PUT', `/api/posts/${linkedin.id}/feedback`, { json: { format: 'Case study', verdict: 'discard', notes: 'Different platform', impressions: 100, engagements: 5 } })).status, 200);
  feedback = (await call('GET', '/api/feedback')).body;
  assert.deepEqual(feedback.formats.map((entry) => entry.platform).sort(), ['linkedin', 'x'], 'same format remains partitioned by platform');

  modelOutput = JSON.stringify({ ideas: [{ title: 'Another useful lesson', angle: 'Use a specific payoff' }] });
  const generated = await call('POST', '/api/ideas/generate', { json: { pillarId: pillar.id, count: 1 } });
  assert.equal(generated.status, 201);
  assert.match(prompts.at(-1), /Case study/);
  assert.match(prompts.at(-1), /"successes":1/);
  assert.doesNotMatch(prompts.at(-1), /Different platform|"platform":"linkedin"/);

  const simulated = (await call('POST', '/api/posts', { json: { platform: 'x', body: 'Dry-run only' } })).body;
  assert.equal((await call('POST', `/api/posts/${simulated.id}/publish-now`)).body.status, 'simulated');
  const rejected = await call('PUT', `/api/posts/${simulated.id}/feedback`, {
    json: { format: 'Dry-run format', verdict: 'successful', notes: 'No real reach data', impressions: 42 },
  });
  assert.deepEqual([rejected.status, rejected.body.error.code], [422, 'metrics_require_published_post']);
  assert.equal((await call('GET', '/api/feedback')).body.entries.some((entry) => entry.postId === simulated.id), false);

  modelOutput = JSON.stringify({ body: 'Revised copy for review' });
  const revision = await call('POST', `/api/posts/${original.id}/revise`);
  assert.equal(revision.status, 201);
  assert.deepEqual([revision.body.status, revision.body.body, revision.body.platform, revision.body.ideaId, revision.body.pillarId], ['needs_review', 'Revised copy for review', 'x', idea.id, pillar.id]);
  assert.match(prompts.at(-1), /Original published copy/);
  assert.match(prompts.at(-1), /Tighten the hook|Clear payoff/);
  const originalAfter = (await call('GET', `/api/posts/${original.id}`)).body;
  assert.deepEqual([originalAfter.status, originalAfter.body, originalAfter.externalId, originalAfter.externalUrl, originalAfter.feedback.format], ['published', 'Original published copy', 'x-original-1', 'https://x.com/i/status/x-original-1', 'Case study']);
  await stop();
});

test('password gate verifies server-side and protects private APIs',async()=>{
 const {call,stop}=await start({}, {persist:'password'});
 const locked={...OWNER,cookie:''};
 assert.equal((await call('GET','/api/session',{headers:locked})).body.passwordRequired,true);
 assert.equal((await call('GET','/api/session',{headers:locked})).body.authenticated,false);
 assert.equal((await call('GET','/api/posts',{headers:locked})).status,401);
 assert.equal((await call('POST','/api/session',{headers:locked,json:{token:'wrong'}})).status,401);
 const good=await call('POST','/api/session',{headers:locked,json:{token:'test-password'}});assert.equal(good.status,200);
 const cookie=good.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);
 assert.equal((await call('GET','/api/posts',{headers:{...OWNER,cookie}})).status,200);
 assert.equal((await call('GET','/api/posts',{headers:{...OWNER,cookie:'oce_access=9999999999.fake.forged'}})).status,401);
 assert.equal((await call('GET','/api/posts',{headers:{...STRANGER,cookie}})).status,403);
 await stop();
});

test('only the requested five platforms are exposed and unsupported requests fail',async()=>{
 const {call,stop}=await start({}, {persist:'five-platforms'});
 assert.deepEqual((await call('GET','/api/platforms')).body.items.map(p=>p.id),['instagram','tiktok','x','youtube','linkedin']);
 assert.equal((await call('POST','/api/posts',{json:{platform:'bluesky',body:'not enabled'}})).status,400);
 assert.equal((await call('POST','/api/generation',{json:{kind:'draft',ideaId:'x',platform:'facebook'}})).status,400);
 await stop();
});

async function storeFile(instance,{name='clip.mp4',mime='video/mp4',bytes=Buffer.from('test-video-content')}={}){
 const item=(await instance.call('POST','/api/materials',{json:{name,mime,size:bytes.length}})).body;
 const response=await instance.mf.dispatchFetch(`https://site.example/api/materials/${item.id}/content`,{method:'PUT',headers:{...OWNER,cookie:COOKIE,'content-length':String(bytes.length)},body:bytes});
 assert.equal(response.status,200,await response.clone().text());return await response.json();
}
const mcp=async(instance,name,args={})=>{
 const response=await instance.mf.dispatchFetch('https://site.example/mcp',{method:'POST',headers:{...OWNER,'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});
 return await response.json();
};

test('private R2 files upload, preview, exclude from AI, and survive across requests',async()=>{
 const instance=await start({}, {persist:'storage'});const {call,stop}=instance;
 const material=await storeFile(instance,{name:'brief.txt',mime:'text/plain',bytes:Buffer.from('Verified product detail')});
 assert.equal((await call('GET','/api/materials')).body.items.length,1);
 assert.equal((await call('GET',`/api/materials/${material.id}/file`)).body,'Verified product detail');
 assert.equal((await call('GET',`/api/materials/${material.id}/file`,{headers:{...OWNER,cookie:''}})).status,401);
 await call('PATCH',`/api/materials/${material.id}`,{json:{notes:'A real product source',enabled:false}});
 const pillar=(await call('POST','/api/pillars',{json:{name:'Product',platforms:['x']}})).body;
 const job=(await call('POST','/api/generation',{json:{kind:'ideas',pillarId:pillar.id,count:2}})).body;
 const context=await mcp(instance,'get_generation_context',{jobId:job.id});assert.doesNotMatch(JSON.stringify(context),/Verified product detail/);
 await call('DELETE',`/api/materials/${material.id}`);assert.equal((await call('GET','/api/materials')).body.items.length,0);
 await stop();
});

test('ChatGPT saves actual ideas and drafts through owner-authenticated tools without API keys',async()=>{
 const instance=await start({CONTENT_GENERATOR:'chatgpt-plan'}, {persist:'plan'});const {call,stop}=instance;
 const pillar=(await call('POST','/api/pillars',{json:{name:'Craft',platforms:['x']}})).body;
 const job=(await call('POST','/api/generation',{json:{kind:'ideas',pillarId:pillar.id,count:1}})).body;
 let saved=await mcp(instance,'save_generation',{jobId:job.id,result:{ideas:[{title:'A specific idea',angle:'An honest angle'}]}});assert.ok(!saved.result.isError,JSON.stringify(saved));
 saved=await mcp(instance,'save_generation',{jobId:job.id,result:{ideas:[{title:'Ignored duplicate submission',angle:'ignored'}]}});assert.ok(!saved.result.isError);
 const ideas=(await call('GET','/api/ideas')).body.items;assert.equal(ideas.length,1);
 const draft=(await call('POST','/api/generation',{json:{kind:'draft',ideaId:ideas[0].id,platform:'x'}})).body;
 saved=await mcp(instance,'save_generation',{jobId:draft.id,result:{body:'A thoughtful draft based on the supplied brief.'}});assert.ok(!saved.result.isError,JSON.stringify(saved));
 const posts=(await call('GET','/api/posts')).body.items;assert.equal(posts.length,1);assert.equal(posts[0].status,'needs_review');assert.equal(posts[0].generator,'chatgpt-plan');
 assert.equal((await call('GET','/api/status')).body.generator.id,'chatgpt-plan');
 const stranger=await instance.mf.dispatchFetch('https://site.example/mcp',{method:'POST',headers:{...STRANGER,'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'list_generation_requests',arguments:{}}})});assert.equal(stranger.status,403);
 await stop();
});

test('Monid video requests carry a spending limit and reject unsafe result imports',async()=>{
 const instance=await start({}, {persist:'monid'});const {call,stop}=instance;
 assert.equal((await call('POST','/api/generation',{json:{kind:'video',prompt:'A product shot',duration:6,budget:0}})).status,400);
 const job=(await call('POST','/api/generation',{json:{kind:'video',prompt:'A product shot',duration:6,budget:1}})).body;
 const context=await mcp(instance,'get_generation_context',{jobId:job.id});assert.match(JSON.stringify(context),/mcp.monid.ai/);assert.equal(JSON.parse(context.result.content[0].text).request.budget,1);
 const blocked=await mcp(instance,'save_video_result',{jobId:job.id,url:'https://127.0.0.1/secret',runId:'run-1'});assert.equal(blocked.result.isError,true);
 assert.equal((await call('GET','/api/generation')).body.items[0].status,'pending');
 await stop();
});

test('OAuth requests require password, use browser-bound state and reject replay',async()=>{
 const {call,mf,db,stop}=await start({TIKTOK_CLIENT_ID:'test-app',TIKTOK_CLIENT_SECRET:'test-secret'}, {persist:'oauth'});
 assert.equal((await call('POST','/api/social/tiktok/connect',{headers:{...OWNER,cookie:''}})).status,401);
 const begin=await call('POST','/api/social/tiktok/connect');assert.equal(begin.status,200);const url=new URL(begin.body.url);
 assert.equal(url.origin,'https://www.tiktok.com');assert.match(url.searchParams.get('scope'),/video.publish/);
 const state=url.searchParams.get('state');const nonce=begin.headers.get('set-cookie').split(';')[0];
 const response=await mf.dispatchFetch(`https://site.example/api/social/tiktok/callback?state=${state}&error=access_denied`,{headers:{...OWNER,cookie:`${COOKIE}; ${nonce}`,'sec-fetch-site':'cross-site'},redirect:'manual'});
 assert.equal(response.status,302);assert.match(response.headers.get('location'),/connectionError/);
 assert.equal(await db.prepare('SELECT state FROM oauth_pending WHERE state=?').bind(state).first(),null);
 await stop();
});

async function connectFixture(instance,platform,accountId='account-1'){
 const {encrypt}=await import('../worker/lib/crypto.ts');
 const credentials=await encrypt({access_token:`${platform}-access`,refresh_token:'test-refresh',expires_at:Date.now()+3600000},Buffer.alloc(32,1).toString('base64'));
 await instance.db.prepare('INSERT INTO social_accounts (platform,account_id,name,credentials,updated_at) VALUES (?,?,?,?,?)').bind(platform,accountId,'Test creator',credentials,new Date().toISOString()).run();
}
async function processAgain(instance,id){await instance.db.prepare('UPDATE posts SET next_attempt_at=? WHERE id=?').bind(past(1),id).run();return await instance.call('POST','/api/scheduler/run',{json:{job:'publish'}});}

test('TikTok uploads bytes privately, honors creator controls, and confirms delivery before reporting publication',async()=>{
 let initCount=0,uploads=0,confirmed=false;
 const instance=await start({PUBLISH_MODE:'live'}, {persist:'tiktok-direct',outboundService:async request=>{
  const url=new URL(request.url);
  if(url.pathname.endsWith('/creator_info/query/'))return Response.json({data:{creator_username:'tester',creator_nickname:'Test creator',privacy_level_options:['SELF_ONLY'],comment_disabled:true,duet_disabled:true,stitch_disabled:true,max_video_post_duration_sec:60},error:{code:'ok'}});
  if(url.pathname.endsWith('/video/init/')){initCount++;const body=await request.json();assert.equal(body.source_info.source,'FILE_UPLOAD');assert.equal(body.post_info.disable_comment,true);assert.equal(body.post_info.disable_duet,true);return Response.json({data:{publish_id:'publish-1',upload_url:'https://upload.tiktokapis.com/video'},error:{code:'ok'}});}
  if(url.hostname==='upload.tiktokapis.com'){uploads++;assert.equal(await request.text(),'test-video-content');return new Response('',{status:201});}
  if(url.pathname.endsWith('/status/fetch/'))return Response.json({data:{status:confirmed?'PUBLISH_COMPLETE':'PROCESSING_UPLOAD',publicaly_available_post_id:confirmed?['post-1']:[]},error:{code:'ok'}});
  throw new Error(`Unexpected request ${request.url}`);
 }});
 await connectFixture(instance,'tiktok');const file=await storeFile(instance);
 const post=(await instance.call('POST','/api/posts',{json:{platform:'tiktok',body:'A reviewed caption',mediaUrls:[`storage:${file.id}`],publishOptions:{accountId:'account-1',privacy:'SELF_ONLY',duration:6,consent:true,allowComment:true}}})).body;
 const initial=await instance.call('POST',`/api/posts/${post.id}/publish-now`);assert.equal(initial.body.status,'processing',JSON.stringify(initial.body));assert.equal(initial.body.publishedAt,null);
 assert.equal((await instance.call('DELETE',`/api/materials/${file.id}`)).status,409);
 await processAgain(instance,post.id);assert.equal((await instance.call('GET',`/api/posts/${post.id}`)).body.status,'processing');
 confirmed=true;await processAgain(instance,post.id);assert.equal((await instance.call('GET',`/api/posts/${post.id}`)).body.status,'published');assert.equal(initCount,1);assert.equal(uploads,1);
 await processAgain(instance,post.id);assert.equal(initCount,1);await instance.stop();
});

test('YouTube resumable upload persists its video ID and waits for processing',async()=>{
 let initialized=0,uploaded=false,processed=false;
 const instance=await start({PUBLISH_MODE:'live'}, {persist:'youtube-direct',outboundService:async request=>{
  const url=new URL(request.url);
  if(url.pathname==='/upload/youtube/v3/videos'){initialized++;const body=await request.json();assert.equal(body.status.privacyStatus,'unlisted');assert.equal(body.status.selfDeclaredMadeForKids,false);return new Response('',{headers:{location:'https://upload.googleapis.com/session'}});}
  if(url.hostname==='upload.googleapis.com'){
   if(request.headers.get('content-range').startsWith('bytes */'))return uploaded?Response.json({id:'youtube-1'}):new Response(null,{status:308});
   assert.equal(await request.text(),'test-video-content');uploaded=true;return Response.json({id:'youtube-1'});
  }
  if(url.pathname==='/youtube/v3/videos')return Response.json({items:[{id:'youtube-1',status:{uploadStatus:processed?'processed':'uploaded'},processingDetails:{processingStatus:processed?'succeeded':'processing'}}]});
  throw new Error(`Unexpected request ${request.url}`);
 }});
 await connectFixture(instance,'youtube');const file=await storeFile(instance);
 const post=(await instance.call('POST','/api/posts',{json:{platform:'youtube',body:'Description',mediaUrls:[`storage:${file.id}`],publishOptions:{accountId:'account-1',title:'Reviewed title',privacy:'unlisted',madeForKids:false}}})).body;
 let result=await instance.call('POST',`/api/posts/${post.id}/publish-now`);assert.equal(result.body.status,'processing',JSON.stringify(result.body));
 await processAgain(instance,post.id);assert.equal((await instance.call('GET',`/api/posts/${post.id}`)).body.status,'processing');
 processed=true;await processAgain(instance,post.id);result=await instance.call('GET',`/api/posts/${post.id}`);assert.equal(result.body.status,'published');assert.equal(result.body.externalUrl,'https://youtu.be/youtube-1');assert.equal(initialized,1);await instance.stop();
});

test('Instagram uploads a private Reel directly and publishes its container exactly once',async()=>{
 let containers=0,uploads=0,publications=0;
 const instance=await start({PUBLISH_MODE:'live'}, {persist:'instagram-direct',outboundService:async request=>{
  const url=new URL(request.url);
  if(url.pathname==='/v25.0/account-1/media'){containers++;const body=await request.text();assert.match(body,/upload_type=resumable/);assert.doesNotMatch(body,/video_url/);return Response.json({id:'container-1',uri:'https://rupload.facebook.com/ig-api-upload/container-1'});}
  if(url.hostname==='rupload.facebook.com'){uploads++;assert.equal(await request.text(),'test-video-content');return Response.json({success:true});}
  if(url.pathname==='/v25.0/container-1')return Response.json({status_code:'FINISHED'});
  if(url.pathname==='/v25.0/account-1/media_publish'){publications++;return Response.json({id:'ig-post-1'});}
  if(url.pathname==='/v25.0/ig-post-1')return Response.json({permalink:'https://www.instagram.com/reel/test/'});
  throw new Error(`Unexpected request ${request.url}`);
 }});
 await connectFixture(instance,'instagram');const file=await storeFile(instance);
 const post=(await instance.call('POST','/api/posts',{json:{platform:'instagram',body:'Caption',mediaUrls:[`storage:${file.id}`],publishOptions:{accountId:'account-1'}}})).body;
 const started=await instance.call('POST',`/api/posts/${post.id}/publish-now`);assert.equal(started.body.status,'processing',JSON.stringify(started.body));
 await processAgain(instance,post.id);const result=(await instance.call('GET',`/api/posts/${post.id}`)).body;assert.equal(result.status,'published');assert.equal(result.externalId,'ig-post-1');
 await processAgain(instance,post.id);assert.deepEqual([containers,uploads,publications],[1,1,1]);await instance.stop();
});

test('connected X and LinkedIn accounts publish text with their own tokens and reviewed identity',async()=>{
 const sent=[];
 const instance=await start({PUBLISH_MODE:'live',LINKEDIN_API_VERSION:'202611'}, {persist:'text-oauth',outboundService:async request=>{
  sent.push({url:request.url,authorization:request.headers.get('authorization'),body:await request.json()});
  return request.url.includes('api.x.com')?Response.json({data:{id:'tweet-1'}}):new Response('{}',{headers:{'content-type':'application/json','x-restli-id':'urn:li:share:1'}});
 }});
 await connectFixture(instance,'x','x-account');await connectFixture(instance,'linkedin','urn:li:person:member1');
 for(const [platform,accountId] of [['x','x-account'],['linkedin','urn:li:person:member1']]){
  const post=(await instance.call('POST','/api/posts',{json:{platform,body:'Reviewed text',publishOptions:{accountId}}})).body;
  const done=(await instance.call('POST',`/api/posts/${post.id}/publish-now`)).body;assert.equal(done.status,'published',JSON.stringify(done));
 }
 assert.equal(sent[0].authorization,'Bearer x-access');assert.equal(sent[1].authorization,'Bearer linkedin-access');assert.equal(sent[1].body.author,'urn:li:person:member1');await instance.stop();
});

test('renewable TikTok credentials rotate before a creator request',async()=>{
 const {encrypt,decrypt}=await import('../worker/lib/crypto.ts');let refreshes=0;
 const instance=await start({TIKTOK_CLIENT_ID:'app',TIKTOK_CLIENT_SECRET:'secret'}, {persist:'refresh',outboundService:async request=>{
  if(request.url.includes('/oauth/token/')){refreshes++;assert.match(await request.text(),/refresh_token=test-refresh/);return Response.json({access_token:'rotated-access',refresh_token:'rotated-refresh',expires_in:3600,scope:'video.publish'});}
  assert.equal(request.headers.get('authorization'),'Bearer rotated-access');return Response.json({data:{privacy_level_options:['SELF_ONLY']},error:{code:'ok'}});
 }});
 const key=Buffer.alloc(32,1).toString('base64');await connectFixture(instance,'tiktok');await instance.db.prepare('UPDATE social_accounts SET credentials=? WHERE platform=?').bind(await encrypt({access_token:'expired',refresh_token:'test-refresh',expires_at:0},key),'tiktok').run();
 assert.equal((await instance.call('GET','/api/social/tiktok/creator')).status,200);
 const saved=await instance.db.prepare('SELECT credentials FROM social_accounts WHERE platform=?').bind('tiktok').first();assert.doesNotMatch(saved.credentials,/rotated-access/);assert.equal((await decrypt(saved.credentials,key)).refresh_token,'rotated-refresh');assert.equal(refreshes,1);await instance.stop();
});

test('ChatGPT autopilot queues bounded work once per configured cycle',async()=>{
 const instance=await start({CONTENT_GENERATOR:'chatgpt-plan'}, {persist:'plan-cadence'});
 await instance.call('POST','/api/pillars',{json:{name:'Useful lessons',platforms:['x']}});
 await instance.call('PATCH','/api/settings',{json:{autonomyEnabled:true,maxPostsPerCycle:2,cycleIntervalMinutes:360}});
 let result=await mcp(instance,'prepare_autopilot');assert.ok(!result.result.isError,JSON.stringify(result));
 let jobs=(await instance.call('GET','/api/generation')).body.items;assert.equal(jobs.length,1);
 result=await mcp(instance,'prepare_autopilot');assert.equal(JSON.parse(result.result.content[0].text).paused,true);
 jobs=(await instance.call('GET','/api/generation')).body.items;assert.equal(jobs.length,1);await instance.stop();
});

test('the scheduled MCP writer records its tick and honors the publishing pause',async()=>{
 const instance=await start({}, {persist:'mcp-writer'});
 await instance.call('PATCH','/api/settings',{json:{autonomyEnabled:true,publishingPaused:true}});
 const result=await mcp(instance,'process_due_posts');assert.ok(!result.result.isError);
 const tick=await instance.db.prepare('SELECT last_run_at,last_result FROM job_state WHERE name=?').bind('external_tick').first();assert.ok(tick.last_run_at);assert.equal(JSON.parse(tick.last_result).error,null);
 await instance.stop();
});

 test('paused automation blocks scheduled MCP publishing and generation discovery',async()=>{
 const instance=await start({CONTENT_GENERATOR:'chatgpt-plan'}, {persist:'paused-mcp'});
 await instance.call('POST','/api/pillars',{json:{name:'Lessons',platforms:['x']}});
 await instance.call('PATCH','/api/settings',{json:{autonomyEnabled:true}});
 await mcp(instance,'prepare_autopilot');
 assert.ok(JSON.parse((await mcp(instance,'list_generation_requests')).result.content[0].text).length>0);
 await instance.call('POST','/api/autopilot/pause');
 for(const tool of ['prepare_autopilot','process_due_posts','list_generation_requests']){
 const result=JSON.parse((await mcp(instance,tool)).result.content[0].text);assert.equal(result.paused,true,tool);
 }
 assert.equal(await instance.db.prepare("SELECT * FROM job_state WHERE name='external_tick'").first(),null);
 await instance.call('POST','/api/autopilot/start');
 assert.ok(JSON.parse((await mcp(instance,'list_generation_requests')).result.content[0].text).length>0);
 await instance.stop();
});
