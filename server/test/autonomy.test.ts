import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PlatformId } from '../src/domain/platforms.ts';
import type { ContentGenerator } from '../src/generation/types.ts';
import { GenerationError } from '../src/generation/types.ts';
import { EMPTY_BRAND } from '../src/domain/types.ts';
import { createAnthropicGenerator } from '../src/generation/anthropic.ts';
import { harness, json, LIVE_X, type Harness } from './helpers.ts';

function pillar(h: Harness, platforms: PlatformId[], extra: Partial<{ active: boolean; name: string }> = {}) {
  const iso = h.clock.now().toISOString();
  return h.pillars.save({
    id: crypto.randomUUID(),
    name: extra.name ?? 'Reliability',
    description: 'Keeping systems up',
    audience: 'SREs',
    tone: 'plain',
    keywords: ['on-call', 'postmortems'],
    platforms,
    active: extra.active ?? true,
    createdAt: iso,
    updatedAt: iso,
  });
}

function fakeGenerator(overrides: Partial<ContentGenerator> = {}) {
  let n = 0;
  const stats = { ideaCalls: 0, draftCalls: 0 };
  const generator: ContentGenerator = {
    id: 'anthropic',
    reviewRequired: false,
    async generateIdeas({ count }) {
      stats.ideaCalls += 1;
      return Array.from({ length: count }, () => ({ title: `Idea ${++n}`, angle: 'angle' }));
    },
    async draftPost({ idea }) {
      stats.draftCalls += 1;
      return `Draft of ${idea.title}`;
    },
    ...overrides,
  };
  return { generator, stats };
}

test('fills free slots with posts awaiting review and proposes times', async () => {
  const h = harness();
  pillar(h, ['bluesky']);
  const result = await h.autonomy.runCycle();
  assert.equal(result.createdPostIds.length, 5); // Mon-Fri at 09:00 in the 7-day horizon
  assert.equal(result.stoppedReason, 'calendar_full');
  const { items } = h.posts.list({ limit: 50, offset: 0 });
  assert.ok(items.every((p) => p.status === 'needs_review' && p.origin === 'autonomous' && p.scheduledAt));
  assert.equal(new Set(items.map((p) => p.scheduledAt)).size, 5);
  assert.equal(h.calls.length, 0);
});

test('maxPostsPerCycle bounds a cycle', async () => {
  const h = harness();
  pillar(h, ['bluesky']);
  h.settings.update({ maxPostsPerCycle: 2 }, h.clock.now().toISOString());
  const result = await h.autonomy.runCycle();
  assert.equal(result.createdPostIds.length, 2);
  assert.equal(result.stoppedReason, 'budget_reached');
});

test('a second cycle does not double-book slots', async () => {
  const h = harness();
  pillar(h, ['bluesky']);
  h.settings.update({ maxPostsPerCycle: 50, maxReviewBacklog: 500 }, h.clock.now().toISOString());
  const first = await h.autonomy.runCycle();
  const second = await h.autonomy.runCycle();
  assert.ok(first.createdPostIds.length > 0);
  assert.equal(second.createdPostIds.length, 0);
  assert.equal(second.stoppedReason, 'calendar_full');
});

test('review backlog caps generation', async () => {
  const { generator, stats } = fakeGenerator();
  const h = harness({ generator });
  pillar(h, ['bluesky']);
  h.settings.update({ maxReviewBacklog: 2, maxPostsPerCycle: 50 }, h.clock.now().toISOString());
  const first = await h.autonomy.runCycle();
  assert.equal(first.createdPostIds.length, 2);
  const calls = stats.ideaCalls + stats.draftCalls;
  const second = await h.autonomy.runCycle();
  assert.equal(second.stoppedReason, 'review_backlog_full');
  assert.equal(stats.ideaCalls + stats.draftCalls, calls);
});

test('autoApprove schedules posts only when the generator allows it', async () => {
  const llm = harness({ generator: fakeGenerator().generator });
  pillar(llm, ['bluesky']);
  llm.settings.update({ autoApprove: true }, llm.clock.now().toISOString());
  await llm.autonomy.runCycle();
  assert.ok(llm.posts.list({ limit: 50, offset: 0 }).items.every((p) => p.status === 'scheduled'));

  const template = harness();
  pillar(template, ['bluesky']);
  template.settings.update({ autoApprove: true }, template.clock.now().toISOString());
  await template.autonomy.runCycle();
  assert.ok(template.posts.list({ limit: 50, offset: 0 }).items.every((p) => p.status === 'needs_review'));
});

test('live mode only targets platforms with credentials', async () => {
  const h = harness({ env: LIVE_X });
  pillar(h, ['x', 'bluesky', 'tiktok']);
  const result = await h.autonomy.runCycle();
  assert.deepEqual(result.skippedPlatforms, ['bluesky', 'tiktok']);
  assert.ok(h.posts.list({ limit: 50, offset: 0 }).items.every((p) => p.platform === 'x'));
});

test('dry run skips unsupported platforms too', async () => {
  const h = harness();
  pillar(h, ['tiktok']);
  const result = await h.autonomy.runCycle();
  assert.equal(result.stoppedReason, 'no_targets');
  assert.deepEqual(result.skippedPlatforms, ['tiktok']);
});

test('without active pillars nothing happens', async () => {
  const { generator, stats } = fakeGenerator();
  const h = harness({ generator });
  pillar(h, ['x'], { active: false });
  assert.equal((await h.autonomy.runCycle()).stoppedReason, 'no_active_pillars');
  assert.equal(stats.ideaCalls, 0);
});

test('a generator failure stops the cycle and is reported', async () => {
  const { generator, stats } = fakeGenerator({
    async draftPost() {
      stats.draftCalls += 1;
      throw new GenerationError('The model declined this request');
    },
  });
  const h = harness({ generator });
  pillar(h, ['bluesky']);
  const result = await h.autonomy.runCycle();
  assert.equal(result.stoppedReason, 'generator_error');
  assert.match(result.error!, /declined/);
  assert.equal(stats.draftCalls, 1);
  // The idea stays available for the next cycle.
  assert.equal(h.ideas.list({ status: 'new', limit: 50, offset: 0 }).total > 0, true);
  assert.equal(h.activity.list(1)[0]?.level, 'error');
  assert.equal(h.autonomy.isRunning, false);
});

test('over-long drafts get one revision and are never truncated', async () => {
  let drafts = 0;
  const { generator } = fakeGenerator({
    async draftPost({ revisionNote }) {
      drafts += 1;
      return revisionNote ? 'Short enough' : 'a'.repeat(400);
    },
  });
  const h = harness({ generator });
  pillar(h, ['bluesky']);
  h.settings.update({ maxPostsPerCycle: 1 }, h.clock.now().toISOString());
  await h.autonomy.runCycle();
  assert.equal(drafts, 2);
  assert.equal(h.posts.list({ limit: 1, offset: 0 }).items[0]?.body, 'Short enough');
});

test('a draft still too long after revision fails the cycle rather than posting', async () => {
  const { generator } = fakeGenerator({ draftPost: async () => 'a'.repeat(400) });
  const h = harness({ generator });
  pillar(h, ['bluesky']);
  const result = await h.autonomy.runCycle();
  assert.equal(result.stoppedReason, 'generator_error');
  assert.equal(h.posts.list({ limit: 1, offset: 0 }).total, 0);
});

test('duplicate ideas are stored once and an empty generator ends the cycle', async () => {
  const { generator, stats } = fakeGenerator({
    async generateIdeas() {
      stats.ideaCalls += 1;
      return [{ title: 'Same idea!', angle: 'a' }, { title: 'same IDEA', angle: 'b' }];
    },
  });
  const h = harness({ generator });
  pillar(h, ['bluesky']);
  const result = await h.autonomy.runCycle();
  assert.equal(result.ideasGenerated, 1);
  assert.equal(result.createdPostIds.length, 1);
  assert.equal(result.stoppedReason, 'no_new_ideas');
  assert.equal(stats.ideaCalls, 2);
});

test('template generator produces usable review material within limits', async () => {
  const h = harness();
  const p = pillar(h, ['x']);
  const ideas = await h.ideation.generate(p, 4);
  assert.equal(ideas.length, 4);
  const body = await h.ideation.draft(p, ideas[0]!, 'x');
  assert.ok(body.length > 0 && body.length <= 280);
});

test('anthropic generator handles refusal, cut-off, bad output, and API errors', async () => {
  const p = pillar(harness(), ['x']);
  const ideaInput = { brand: EMPTY_BRAND, pillar: p, count: 2, avoidTitles: ['Old'] };

  const refused = createAnthropicGenerator(async () => ({ stopReason: 'refusal', output: null }));
  await assert.rejects(refused.generateIdeas(ideaInput), /declined/);

  const cut = createAnthropicGenerator(async () => ({ stopReason: 'max_tokens', output: null }));
  await assert.rejects(cut.generateIdeas(ideaInput), /cut off/);

  const bad = createAnthropicGenerator(async () => ({ stopReason: 'end_turn', output: { nope: true } }));
  await assert.rejects(bad.generateIdeas(ideaInput), GenerationError);

  const leaky = createAnthropicGenerator(async () => { throw new Error('secret detail'); });
  await assert.rejects(leaky.generateIdeas(ideaInput), (error: Error) => {
    assert.ok(error instanceof GenerationError);
    assert.doesNotMatch(error.message, /secret detail/);
    return true;
  });
});

test('anthropic generator caps ideas and passes the brief and limits', async () => {
  const prompts: string[] = [];
  const p = pillar(harness(), ['x']);
  const generator = createAnthropicGenerator(async ({ prompt }) => {
    prompts.push(prompt);
    return prompt.includes('Propose')
      ? { stopReason: 'end_turn', output: { ideas: [1, 2, 3].map((i) => ({ title: `T${i}`, angle: 'a' })) } }
      : { stopReason: 'end_turn', output: { body: '  Body  ' } };
  });
  const ideas = await generator.generateIdeas({
    brand: { ...EMPTY_BRAND, voice: 'Dry wit', avoid: 'Crypto' },
    pillar: p,
    count: 2,
    avoidTitles: ['Old idea'],
    prompt: 'Focus on incident reviews',
  });
  assert.equal(ideas.length, 2);
  assert.match(prompts[0]!, /Old idea/);
  assert.match(prompts[0]!, /SREs/);
  assert.match(prompts[0]!, /Dry wit/);
  assert.match(prompts[0]!, /Crypto/);
  assert.match(prompts[0]!, /incident reviews/);
  const body = await generator.draftPost({ brand: EMPTY_BRAND, pillar: p, idea: ideas[0]!, platform: 'x', maxChars: 280 });
  assert.equal(body, 'Body');
  assert.match(prompts[1]!, /280 characters/);
  assert.match(prompts[1]!, /X post/);
});

test('scheduler tick publishes due posts and starts a cycle only when enabled and due', async () => {
  const h = harness({ env: LIVE_X, responder: () => json({ data: { id: '1' } }, 201), generator: fakeGenerator().generator });
  pillar(h, ['x']);

  await h.scheduler.tick();
  await h.scheduler.settled();
  assert.equal(h.posts.list({ limit: 50, offset: 0 }).total, 0);

  h.settings.update({ autonomyEnabled: true, autoApprove: true, maxPostsPerCycle: 1 }, h.clock.now().toISOString());
  await h.scheduler.tick();
  await h.scheduler.settled();
  const [post] = h.posts.list({ limit: 50, offset: 0 }).items;
  assert.equal(post?.status, 'scheduled');

  // Cycle interval not elapsed: no new post. Slot reached: it publishes.
  h.clock.ms = Date.parse(post!.scheduledAt!) + 1000;
  await h.scheduler.tick();
  await h.scheduler.settled();
  assert.equal(h.posts.get(post!.id)!.status, 'published');
  assert.equal(h.posts.list({ limit: 50, offset: 0 }).total, 1);

  h.clock.advance(361);
  await h.scheduler.tick();
  await h.scheduler.settled();
  assert.equal(h.posts.list({ limit: 50, offset: 0 }).total, 2);
});

test('a throwing job never rejects the tick', async () => {
  const h = harness();
  h.publisher.publishDue = async () => { throw new Error('boom'); };
  await h.scheduler.tick();
  assert.equal(h.scheduler.status().lastError, 'boom');
});
