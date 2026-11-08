import assert from 'node:assert/strict';
import { test } from 'node:test';
import { idempotencyKey, LEASE_MS, MAX_ATTEMPTS } from '../src/services/publisher.ts';
import { harness, json, LIVE_MASTODON, LIVE_X, scheduledPost } from './helpers.ts';

const okX = () => json({ data: { id: '42' } }, 201);

test('publishes a due post and records the attempt', async () => {
  const h = harness({ env: LIVE_X, responder: okX });
  const post = scheduledPost(h, 'x');
  h.clock.advance(2);
  const result = await h.publisher.publishDue();
  assert.equal(result.processed, 1);
  const saved = h.posts.get(post.id)!;
  assert.equal(saved.status, 'published');
  assert.equal(saved.externalId, '42');
  assert.ok(saved.publishedAt);
  const [attempt] = h.posts.attempts(post.id);
  assert.equal(attempt?.outcome, 'published');
  assert.equal(attempt?.mode, 'live');
});

test('does not publish before the scheduled time or twice', async () => {
  const h = harness({ env: LIVE_X, responder: okX });
  const post = scheduledPost(h, 'x');
  await h.publisher.publishDue();
  assert.equal(h.calls.length, 0);
  h.clock.advance(2);
  await h.publisher.publishDue();
  await h.publisher.publishDue();
  assert.equal(h.calls.length, 1);
  assert.equal(h.posts.get(post.id)!.status, 'published');
});

test('concurrent runs post once', async () => {
  const h = harness({ env: LIVE_X, responder: okX });
  scheduledPost(h, 'x');
  h.clock.advance(2);
  await Promise.all([h.publisher.publishDue(), h.publisher.publishDue(), h.publisher.publishDue()]);
  assert.equal(h.calls.length, 1);
});

test('dry run ends as simulated, never published', async () => {
  const h = harness();
  const post = scheduledPost(h, 'x');
  h.clock.advance(2);
  await h.publisher.publishDue();
  const saved = h.posts.get(post.id)!;
  assert.equal(saved.status, 'simulated');
  assert.equal(saved.publishedAt, null);
  assert.equal(saved.externalId, null);
  assert.equal(h.calls.length, 0);
});

test('missing credentials block the post without any request', async () => {
  const h = harness({ env: { PUBLISH_MODE: 'live' } });
  const post = scheduledPost(h, 'x');
  h.clock.advance(2);
  await h.publisher.publishDue();
  const saved = h.posts.get(post.id)!;
  assert.equal(saved.status, 'blocked');
  assert.equal(saved.lastErrorCode, 'credentials_missing');
  assert.match(saved.lastErrorMessage!, /X_USER_ACCESS_TOKEN/);
  assert.equal(h.calls.length, 0);
});

test('retryable errors back off, then fail after the attempt limit', async () => {
  const h = harness({ env: LIVE_X, responder: () => json({}, 503) });
  const post = scheduledPost(h, 'x');
  h.clock.advance(2);
  await h.publisher.publishDue();
  let saved = h.posts.get(post.id)!;
  assert.equal(saved.status, 'scheduled');
  assert.equal(saved.attemptCount, 1);
  assert.ok(saved.nextAttemptAt);

  // Not yet due for retry.
  await h.publisher.publishDue();
  assert.equal(h.calls.length, 1);

  for (let i = 1; i < MAX_ATTEMPTS; i += 1) {
    h.clock.advance(60);
    await h.publisher.publishDue();
  }
  saved = h.posts.get(post.id)!;
  assert.equal(saved.status, 'failed');
  assert.equal(h.calls.length, MAX_ATTEMPTS);
  assert.equal(h.posts.attempts(post.id).length, MAX_ATTEMPTS);
});

test('Retry-After extends the backoff', async () => {
  const h = harness({ env: LIVE_X, responder: () => json({}, 429, { 'retry-after': '3600' }) });
  const post = scheduledPost(h, 'x');
  h.clock.advance(2);
  await h.publisher.publishDue();
  assert.equal(h.posts.get(post.id)!.nextAttemptAt, new Date(h.clock.ms + 3_600_000).toISOString());
});

test('ambiguous failure on a non-idempotent provider is never retried', async () => {
  const h = harness({ env: LIVE_X, responder: () => json({}, 500) });
  const post = scheduledPost(h, 'x');
  h.clock.advance(2);
  await h.publisher.publishDue();
  assert.equal(h.posts.get(post.id)!.status, 'needs_attention');
  h.clock.advance(120);
  await h.publisher.publishDue();
  assert.equal(h.calls.length, 1);
});

test('ambiguous failure on an idempotent provider retries with the same key', async () => {
  let call = 0;
  const h = harness({
    env: LIVE_MASTODON,
    responder: () => (++call === 1 ? json({}, 500) : json({ id: '7', url: 'https://social.test/@me/7' })),
  });
  const post = scheduledPost(h, 'mastodon');
  h.clock.advance(2);
  await h.publisher.publishDue();
  h.clock.advance(2);
  await h.publisher.publishDue();
  assert.equal(h.posts.get(post.id)!.status, 'published');
  assert.equal(h.calls[0]?.headers.get('idempotency-key'), h.calls[1]?.headers.get('idempotency-key'));
});

test('idempotency key changes only when the text changes', () => {
  assert.equal(idempotencyKey({ id: 'a', body: 'x' }), idempotencyKey({ id: 'a', body: 'x' }));
  assert.notEqual(idempotencyKey({ id: 'a', body: 'x' }), idempotencyKey({ id: 'a', body: 'y' }));
});

test('a crash mid-publish becomes needs_attention, not a repost', async () => {
  const h = harness({ env: LIVE_X, responder: okX });
  const post = scheduledPost(h, 'x');
  h.clock.advance(2);
  assert.equal(h.posts.claim(post.id, h.clock.now().toISOString()), true);

  await h.publisher.publishDue();
  assert.equal(h.posts.get(post.id)!.status, 'publishing');

  h.clock.ms += LEASE_MS + 1000;
  const result = await h.publisher.publishDue();
  assert.equal(result.recovered, 1);
  const saved = h.posts.get(post.id)!;
  assert.equal(saved.status, 'needs_attention');
  assert.equal(saved.lastErrorCode, 'interrupted');
  assert.equal(h.calls.length, 0);
});

test('pausing stops the scheduler and publish-now', async () => {
  const h = harness({ env: LIVE_X, responder: okX });
  const post = scheduledPost(h, 'x');
  h.settings.update({ publishingPaused: true }, h.clock.now().toISOString());
  h.clock.advance(2);
  const result = await h.publisher.publishDue();
  assert.equal(result.skippedPaused, true);
  await assert.rejects(h.publisher.publishNow(post.id), /paused/);
  assert.equal(h.calls.length, 0);
  assert.equal(h.posts.get(post.id)!.status, 'scheduled');
});

test('posts too far past their time are not published late', async () => {
  const h = harness({ env: LIVE_X, responder: okX });
  const post = scheduledPost(h, 'x');
  h.clock.advance(24 * 60);
  const result = await h.publisher.publishDue();
  assert.equal(result.missed, 1);
  const saved = h.posts.get(post.id)!;
  assert.equal(saved.status, 'failed');
  assert.equal(saved.lastErrorCode, 'missed_window');
  assert.equal(h.calls.length, 0);
});

test('rechecks lateness after earlier posts in the batch finish', async () => {
  let h: ReturnType<typeof harness>;
  h = harness({
    env: LIVE_X,
    responder: () => {
      h.clock.advance(2);
      return okX();
    },
  });
  h.settings.update({ maxLatenessMinutes: 1 }, h.clock.now().toISOString());
  const first = scheduledPost(h, 'x');
  const second = scheduledPost(h, 'x');
  h.clock.advance(1);

  const result = await h.publisher.publishDue();

  assert.equal(result.processed, 1);
  assert.equal(result.missed, 1);
  // Both posts have the same scheduled time, so either can be processed first.
  const posts = [h.posts.get(first.id)!, h.posts.get(second.id)!];
  assert.deepEqual(posts.map(post => post.status).sort(), ['failed', 'published']);
  assert.equal(posts.find(post => post.status === 'failed')!.lastErrorCode, 'missed_window');
  assert.equal(h.calls.length, 1);
});

test('an in-progress retry is not cancelled by the lateness rule', async () => {
  let call = 0;
  const h = harness({ env: LIVE_X, responder: () => (++call === 1 ? json({}, 503) : okX()) });
  const post = scheduledPost(h, 'x');
  h.settings.update({ maxLatenessMinutes: 1 }, h.clock.now().toISOString());
  h.clock.advance(1.5);
  await h.publisher.publishDue();
  h.clock.advance(10);
  await h.publisher.publishDue();
  assert.equal(h.posts.get(post.id)!.status, 'published');
});

test('invalid content fails permanently without a request', async () => {
  const h = harness({ env: LIVE_X, responder: okX });
  const post = scheduledPost(h, 'x', 'a'.repeat(300));
  h.clock.advance(2);
  await h.publisher.publishDue();
  const saved = h.posts.get(post.id)!;
  assert.equal(saved.status, 'failed');
  assert.equal(saved.lastErrorCode, 'content_invalid');
  assert.equal(h.calls.length, 0);
});

test('publish-now on a published post is refused', async () => {
  const h = harness({ env: LIVE_X, responder: okX });
  const post = scheduledPost(h, 'x');
  assert.equal((await h.publisher.publishNow(post.id)).status, 'published');
  await assert.rejects(h.publisher.publishNow(post.id), /Cannot publish/);
  assert.equal(h.calls.length, 1);
});
