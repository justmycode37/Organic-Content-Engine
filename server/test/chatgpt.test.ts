import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChatGPT } from '../src/services/chatgpt.ts';
import { loadConfig } from '../src/config.ts';
import { createChatGPTGenerator } from '../src/generation/chatgpt.ts';
import { harness } from './helpers.ts';

function connected(network: typeof fetch) {
  const account = new ChatGPT(loadConfig({ NODE_ENV: 'test' }), network);
  Object.assign(account, { credentials: { host: 'test-host', client: 'issued-client', subject: 'verified-sub', access: 'test-access', refresh: 'test-refresh', scope: 'chatgpt.tokens.use.direct', expires: Date.now() + 3600000, model: 'account-model' } });
  return account;
}
const stream = (events: object[]) => new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });

test('ChatGPT sign-in uses local callback, fresh state, nonce, PKCE, dynamic registration, and usage scopes', async () => {
  const account = new ChatGPT(loadConfig({ NODE_ENV: 'test' }), async () => { throw new Error('No token exchange expected'); });
  try {
    const url = new URL(await account.start('http://localhost:5173'));
    assert.equal(url.origin, 'https://auth.openai.com');
    assert.equal(url.searchParams.get('client_id'), 'dynamic_agent_client');
    assert.equal(url.searchParams.get('agent_name_hint'), 'Organic Content Engine');
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.match(url.searchParams.get('scope')!, /chatgpt.tokens.use.direct/);
    assert.ok(url.searchParams.get('nonce'));
    const callback = new URL(url.searchParams.get('redirect_uri')!);
    assert.equal(callback.hostname, '127.0.0.1');
    callback.searchParams.set('state', 'wrong-state');
    assert.equal((await fetch(callback)).status, 400);
    assert.equal(account.status().connecting, true);
    callback.searchParams.set('state', url.searchParams.get('state')!);
    callback.searchParams.set('error', 'access_denied');
    const denied = await fetch(callback, { redirect: 'manual' });
    assert.equal(denied.status, 303);
    assert.equal(account.status().connected, false);
    assert.match(account.status().error!, /not granted/);
  } finally { await account.disconnect(); }
});

test('ChatGPT streams public Responses requests with store false and waits for completed', async () => {
  const account = connected(async (url, init) => {
    assert.equal(String(url), 'https://api.openai.com/v1/responses');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer test-access');
    const body = JSON.parse(init?.body as string);
    assert.equal(body.store, false); assert.equal(body.stream, true); assert.equal(body.model, 'account-model');
    return stream([{ type: 'response.output_text.delta', delta: 'Hello' }, { type: 'response.completed' }]);
  });
  assert.equal(await account.complete('write a post'), 'Hello');
  const failed = connected(async () => stream([{ type: 'response.output_text.delta', delta: 'partial' }, { type: 'response.failed' }]));
  await assert.rejects(() => failed.complete('post'), /could not complete/);
  const interrupted = connected(async () => stream([{ type: 'response.output_text.delta', delta: 'partial' }]));
  await assert.rejects(() => interrupted.complete('post'), /interrupted/);
});

test('ChatGPT refresh is serialized and retains rotated token and granted permission', async () => {
  let calls = 0;
  const account = connected(async (_url, init) => {
    calls++;
    assert.equal((init?.body as URLSearchParams).get('grant_type'), 'refresh_token');
    return Response.json({ access_token: 'rotated', refresh_token: 'new-refresh', scope: 'chatgpt.tokens.use.direct', expires_in: 3600 });
  });
  Object.assign(account, { credentials: { host: 'test-host', client: 'issued-client', access: 'expired', refresh: 'test-refresh', expires: 0 } });
  assert.deepEqual(await Promise.all([account.access(), account.access()]), ['rotated', 'rotated']);
  assert.equal(calls, 1);
});

test('ChatGPT generator includes reference material and validates structured output', async () => {
  const h = harness();
  try {
    h.materials.add('brief.txt', 'text/plain', Buffer.from('Verified source material'));
    const account = connected(async (_url, init) => {
      const body = JSON.parse(init?.body as string);
      assert.match(body.input[0].content[0].text, /Verified source material/);
      return stream([{ type: 'response.output_text.delta', delta: '{"ideas":[{"title":"Source idea","angle":"Useful angle"}]}' }, { type: 'response.completed' }]);
    });
    const generator = createChatGPTGenerator(account, h.materials);
    const result = await generator.generateIdeas({ brand: h.settings.getBrand(), pillar: { id: 'p', name: 'Topic', description: '', audience: '', tone: '', keywords: [], platforms: ['x'], active: true, createdAt: '', updatedAt: '' }, count: 1, avoidTitles: [] });
    assert.equal(result[0]?.title, 'Source idea');
  } finally { h.db.close(); }
});

test('hosted deployment cannot begin the local sign-in flow', async () => {
  const account = new ChatGPT(loadConfig({ NODE_ENV: 'test', HOST: '0.0.0.0', API_TOKEN: 'a'.repeat(32) }));
  await assert.rejects(() => account.start('http://localhost:5173'), /local workspace/);
});
