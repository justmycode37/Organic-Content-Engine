import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAnthropicGenerator } from '../src/generation/anthropic.ts';
import { FORMAT_RESEARCH, CONTENT_DRAFTING } from '../src/generation/content-policies.ts';

test('idea and draft requests receive their distinct policies and retain evidence', async () => {
  const calls: {system: string; prompt: string}[] = [];
  const generator = createAnthropicGenerator(async (request) => {
    calls.push(request);
    return { stopReason: 'end_turn', output: calls.length === 1 ? { ideas: [] } : { body: 'Original caption' } };
  });
  const brand = { name: 'Example', handle: '', description: '', audience: '', voice: '', avoid: '' };
  const pillar = { id: 'p', active: true, createdAt: '2026-11-09T00:00:00Z', updatedAt: '2026-11-09T00:00:00Z', name: 'Learning', description: '', audience: '', tone: '', keywords: [], platforms: ['instagram'] } as Parameters<typeof generator.generateIdeas>[0]['pillar'];
  assert.deepEqual(await generator.generateIdeas({ brand, pillar, count: 5, avoidTitles: [] }), []);
  assert.ok(calls[0]!.system.includes(FORMAT_RESEARCH));
  assert.ok(calls[0]!.prompt.includes('instagram'));
  const angle = 'Source: https://example.com/reel; observed 2026-11-09; single-example hypothesis';
  await generator.draftPost({ brand, pillar, idea: { title: 'Adaptation', angle }, platform: 'instagram', maxChars: 2200 });
  assert.ok(calls[1]!.system.includes(CONTENT_DRAFTING));
  assert.ok(calls[1]!.prompt.includes(angle));
});
