import assert from 'node:assert/strict';
import { test } from 'node:test';
import { harness } from './helpers.ts';

const put = (body: unknown) => ({ method: 'PUT', body: JSON.stringify(body) });

test('feedback persists, rejects metrics for drafts, and conservatively retires only repeated discards', async () => {
  const h = harness();
  const draft = h.postService.build({ platform: 'linkedin', body: 'draft', mediaUrls: [], pillarId: null, status: 'draft', scheduledAt: null });
  h.posts.insert(draft);
  const rejected = await h.request(`/api/posts/${draft.id}/feedback`, put({ format: 'checklist', verdict: 'iterate', notes: 'Needs a sharper opening', impressions: 100 }));
  assert.equal(rejected.status, 422);
  assert.equal((await h.request('/api/feedback')).status, 200);

  for (let i = 0; i < 4; i++) {
    const post = h.postService.build({ platform: 'linkedin', body: `published ${i}`, mediaUrls: [], pillarId: null, status: 'published', scheduledAt: null });
    h.posts.insert(post);
    const response = await h.request(`/api/posts/${post.id}/feedback`, put({ format: 'checklist', verdict: 'discard', notes: 'Did not resonate', impressions: 100, engagements: 2 }));
    assert.equal(response.status, 200);
  }
  const partial = await h.request('/api/feedback');
  const partialJson = await partial.json() as any;
  assert.equal(partialJson.entries.length, 4);
  assert.equal(partialJson.formats[0].recommendation, 'explore');

  const fifth = h.postService.build({ platform: 'linkedin', body: 'published fifth', mediaUrls: [], pillarId: null, status: 'published', scheduledAt: null });
  h.posts.insert(fifth);
  await h.request(`/api/posts/${fifth.id}/feedback`, put({ format: 'checklist', verdict: 'discard', notes: 'Still weak', impressions: 100, engagements: 1 }));
  for (let i = 0; i < 3; i++) {
    const comparator = h.postService.build({ platform: 'linkedin', body: `strong post ${i}`, mediaUrls: [], pillarId: null, status: 'published', scheduledAt: null });
    h.posts.insert(comparator);
    await h.request(`/api/posts/${comparator.id}/feedback`, put({ format: 'discussion', verdict: 'successful', notes: 'Strong engagement', impressions: 100, engagements: 50 }));
  }
  const final = await (await h.request('/api/feedback')).json() as any;
  assert.equal(final.formats[0].recommendation, 'retire');
  assert.equal(final.formats[0].discards, 5);
});

test('feedback validation rejects negative metrics and persistence is replaceable', async () => {
  const h = harness();
  const post = h.postService.build({ platform: 'x', body: 'published', mediaUrls: [], pillarId: null, status: 'published', scheduledAt: null });
  h.posts.insert(post);
  assert.equal((await h.request(`/api/posts/${post.id}/feedback`, put({ format: 'story', verdict: null, notes: '', impressions: -1 }))).status, 400);
  assert.equal((await h.request(`/api/posts/${post.id}/feedback`, put({ format: 'story', verdict: 'successful', notes: 'Good' }))).status, 200);
  assert.equal((await h.request(`/api/posts/${post.id}/feedback`, put({ format: 'story', verdict: 'iterate', notes: 'Change CTA' }))).status, 200);
  const saved = await (await h.request('/api/feedback')).json() as any;
  assert.equal(saved.entries.length, 1);
  assert.equal(saved.entries[0].verdict, 'iterate');
});

test('revision creates a separate review post and retains feedback through length correction', async () => {
  const calls: Array<Record<string, unknown>> = [];
  const generator = {
    id: 'anthropic' as const, reviewRequired: false,
    async generateIdeas() { return []; },
    async draftPost(input: Record<string, unknown>) {
      calls.push(input);
      return calls.length === 1 ? 'x'.repeat(3100) : 'A revised post';
    },
  };
  const h = harness({ generator });
  const pillar = h.pillars.save({ id: 'p1', name: 'Work', description: '', audience: 'teams', tone: 'plain', keywords: [], platforms: ['linkedin'], active: true, createdAt: h.clock.now().toISOString(), updatedAt: h.clock.now().toISOString() });
  const idea = h.ideas.insert({ id: 'i1', pillarId: pillar.id, title: 'A useful idea', angle: 'Explain a useful principle.', source: 'manual', status: 'drafted', createdAt: h.clock.now().toISOString(), updatedAt: h.clock.now().toISOString() })!;
  const original = h.posts.insert(h.postService.build({ platform: 'linkedin', body: 'The original draft', mediaUrls: [], pillarId: pillar.id, ideaId: idea.id, status: 'published', scheduledAt: null }));
  await h.request(`/api/posts/${original.id}/feedback`, put({ format: 'example', verdict: 'iterate', notes: 'Make it more concrete' }));
  const response = await h.request(`/api/posts/${original.id}/revise`, { method: 'POST' });
  assert.equal(response.status, 201);
  const revised = await response.json() as any;
  assert.notEqual(revised.id, original.id);
  assert.equal(revised.status, 'needs_review');
  assert.equal(revised.ideaId, idea.id);
  assert.equal(h.posts.get(original.id)?.body, 'The original draft');
  assert.equal(h.posts.get(original.id)?.status, 'published');
  assert.match(String(calls[0]?.revisionNote), /Original post/);
  assert.match(String(calls[0]?.revisionNote), /Make it more concrete/);
  assert.match(String(calls[1]?.revisionNote), /Original post/);
  assert.match(String(calls[1]?.revisionNote), /3100 characters/);
  assert.match(String(calls[1]?.feedbackContext), /example/);
});
