import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness, TOKEN } from './helpers.ts';

// Let Request set the multipart boundary, rather than the JSON-oriented harness.
async function add(h: ReturnType<typeof harness>, name: string, text: string) {
  const form = new FormData(); form.set('file', new File([text], name, { type: 'text/plain' }));
  const request = new Request('http://localhost/api/materials', { method: 'POST', body: form });
  return h.request('/api/materials', { method: 'POST', headers: request.headers, body: await request.arrayBuffer() });
}

test('materials upload, notes, AI exclusion, private download, and deletion', async () => {
  const h = harness();
  try {
    const response = await add(h, '../../brief.txt', 'A grounded product fact.');
    assert.equal(response.status, 201);
    const material = await response.json() as { id: string; size: number };
    assert.equal(material.size, 24);
    assert.match(h.materials.context(), /grounded product fact/);
    const download = await h.request(`/api/materials/${material.id}/file`);
    assert.equal(download.headers.get('content-type'), 'application/octet-stream');
    assert.equal(await download.text(), 'A grounded product fact.');
    await h.request(`/api/materials/${material.id}`, { method: 'PATCH', body: JSON.stringify({ notes: 'Use this example', enabled: false }) });
    assert.equal(h.materials.context(), '');
    assert.equal((await h.request(`/api/materials/${material.id}`, { method: 'DELETE' })).status, 204);
    assert.equal((await h.request(`/api/materials/${material.id}/file`)).status, 404);
  } finally { h.db.close(); }
});

test('upload and downloads require workspace authentication', async () => {
  const h = harness({ env: { API_TOKEN: TOKEN } });
  try {
    assert.equal((await add(h, 'private.txt', 'Secret brief')).status, 401);
    assert.equal((await h.request('/api/materials/missing/file')).status, 401);
    assert.equal((await h.request('/api/chatgpt/connect', { method: 'POST' })).status, 401);
  } finally { h.db.close(); }
});

test('generation receives enabled source material and excludes disabled material', async () => {
  let received = '';
  const h = harness({ generator: { id: 'anthropic', reviewRequired: true,
    async generateIdeas(input) { received = input.brand.description; return [{ title: 'A useful idea', angle: 'A useful angle' }]; },
    async draftPost(input) { received = input.brand.description; return 'A useful post'; },
  } });
  try {
    h.materials.add('brief.txt', 'text/plain', Buffer.from('Verified fact'));
    const hidden = h.materials.add('hidden.txt', 'text/plain', Buffer.from('Excluded fact'));
    h.materials.update(hidden.id, { enabled: false });
    const pillar = h.pillars.save({ id: 'pillar', name: 'Product', description: '', audience: '', tone: '', keywords: [], platforms: ['x'], active: true, createdAt: h.clock.now().toISOString(), updatedAt: h.clock.now().toISOString() });
    const [idea] = await h.ideation.generate(pillar, 1);
    assert.match(received, /Verified fact/); assert.doesNotMatch(received, /Excluded fact/);
    await h.ideation.draft(pillar, idea!, 'x');
    assert.match(received, /Verified fact/);
  } finally { h.db.close(); }
});

test('invalid notes and empty uploads are rejected', async () => {
  const h = harness();
  try {
    assert.equal((await add(h, 'empty.txt', '')).status, 413);
    const m = h.materials.add('test.txt', 'text/plain', Buffer.from('hello'));
    const response = await h.request(`/api/materials/${m.id}`, { method: 'PATCH', body: JSON.stringify({ notes: 'x'.repeat(12001) }) });
    assert.equal(response.status, 400);
  } finally { h.db.close(); }
});

test('footage analysis samples actual frames and saves reusable AI notes', async t => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { mkdtemp, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { analyzeMaterial } = await import('../src/services/analyze.ts');
  const run = promisify(execFile);
  try { await run('ffmpeg', ['-version']); } catch { t.skip('ffmpeg is not installed'); return; }
  const dir = await mkdtemp(join(tmpdir(), 'oce-test-video-'));
  const h = harness();
  try {
    const path = join(dir, 'fixture.mp4');
    await run('ffmpeg', ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=64x64:d=1', '-pix_fmt', 'yuv420p', path]);
    const m = h.materials.add('clip.mp4', 'video/mp4', await readFile(path));
    const fake = { complete: async (prompt: string, images: unknown[]) => {
      assert.match(prompt, /Audio and the rest/);
      assert.ok(images.length >= 1 && images.length <= 4);
      assert.match(JSON.stringify(images), /data:image\/jpeg;base64/);
      return 'A red background appears in the sampled frame.';
    } } as unknown as typeof h.chatgpt;
    const analyzed = await analyzeMaterial(h.materials, fake, m.id);
    assert.match(analyzed.notes, /sampled frames only; no audio/);
    assert.match(h.materials.context(), /red background/);
  } finally { h.db.close(); await rm(dir, { recursive: true, force: true }); }
});
