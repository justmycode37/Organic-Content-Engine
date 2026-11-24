import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { createDraft, renderHandoff, validateStory } from './mysteries-story.mjs';

const example = JSON.parse(await readFile(new URL('../docs/mysteries-of-the-sky/story-example-transit.json', import.meta.url), 'utf8'));
const copy = () => structuredClone(example);
const invalid = (mutate, expected) => {
  const story = copy();
  mutate(story);
  const result = validateStory(story);
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), expected);
};

test('worked example passes structure checks and keeps its review status explicit', () => {
  const result = validateStory(example);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.summary.durationSeconds, 64);
  assert.equal(result.summary.sources, 3);
  assert.equal(result.summary.claims, 5);
  assert.equal(result.summary.beats, 6);
  assert.equal(result.summary.pendingReviews.length, 4);
  assert.match(result.warnings.join('\n'), /Review not passed/);
});

test('drafts and malformed shapes return actionable errors without crashing', () => {
  assert.equal(validateStory(createDraft()).valid, false);
  assert.match(validateStory(createDraft()).errors.join('\n'), /placeholder/);
  for (const value of [null, [], true, 4, 'story', {}, { ...copy(), beats: [null] }]) {
    assert.equal(validateStory(value).valid, false);
  }
  invalid(story => { delete story.brief.centralQuestion; }, /missing centralQuestion/);
  invalid(story => { story.brief.title = '   '; }, /must match/);
});

test('unknown fields are rejected, including Object prototype property names', () => {
  invalid(story => { story.accountId = 'never-integrate'; }, /unknown property accountId/);
  invalid(story => { story.brief.toString = 'unexpected'; }, /unknown property toString/);
  invalid(story => { Object.defineProperty(story, '__proto__', { value: 'unexpected', enumerable: true }); }, /unknown property __proto__/);
});

test('IDs must be unique within each ledger and list', () => {
  invalid(story => { story.sources.push(story.sources[0]); }, /duplicate id charbonneau-transit/);
  invalid(story => { story.claims.push(story.claims[0]); }, /duplicate id candidate-clue/);
  invalid(story => { story.beats[1].id = story.beats[0].id; }, /duplicate id a-dip/);
  invalid(story => { story.beats[0].claimIds.push(story.beats[0].claimIds[0]); }, /items must be unique/);
});

test('broken evidence and beat references fail validation', () => {
  invalid(story => { story.claims[0].support[0].sourceId = 'missing'; }, /unknown source missing/);
  invalid(story => { story.beats[0].claimIds = ['missing']; }, /unknown claim missing/);
  invalid(story => { story.beats[0].shot.sourceIds = ['missing']; }, /unknown source missing/);
  invalid(story => { story.beats[0].shot.claimIds = ['missing']; }, /must be in this beat/);
});

test('a shot must cite evidence for its own claims, not any arbitrary source', () => {
  invalid(story => { story.beats[0].shot.sourceIds = ['charbonneau-transit']; }, /needs at least one of its supporting sources/);
  invalid(story => { story.beats[0].shot.claimIds = ['transit-dimming']; }, /must be in this beat/);
});

test('unused claims are errors while additional background sources are notes', () => {
  invalid(story => { story.claims.push({ ...story.claims[0], id: 'unused' }); }, /unused claim/);
  const story = copy();
  story.sources.push({ ...story.sources[0], id: 'background-reading' });
  const result = validateStory(story);
  assert.equal(result.valid, true);
  assert.match(result.warnings.join('\n'), /no claim currently cites/);
});

test('numerical examples need a calculation record and a visible example label', () => {
  invalid(story => { delete story.claims[3].calculation; }, /needs inputs, formula, result and assumptions/);
  invalid(story => { story.claims[3].kind = 'inference'; }, /calculation requires kind/);
  invalid(story => { story.beats[3].shot.provenanceLabel = 'Schematic'; }, /label the numerical example as illustrative/);
});

test('representation labels cannot silently turn illustrations into evidence', () => {
  invalid(story => { story.beats[0].shot.provenanceLabel = 'Telescope observation'; }, /provenanceLabel must identify schematic/);
  invalid(story => { story.beats[0].shot.representation = 'source-image'; }, /provenanceLabel must identify source-image/);
  invalid(story => { story.beats[0].shot.representation = 'replotted-data'; }, /provenanceLabel must identify replotted-data/);
});

test('sources require HTTPS URLs, real access dates, primary rationale and precise support', () => {
  invalid(story => { story.sources[0].url = 'http://example.com/paper'; }, /must match/);
  invalid(story => { story.sources[0].url = 'https://'; }, /absolute URL/);
  invalid(story => { story.sources[0].accessedAt = '2026-02-30'; }, /real YYYY-MM-DD date/);
  invalid(story => { story.sources[0].accessedAt = 'today'; }, /real YYYY-MM-DD date/);
  invalid(story => { story.sources[0].primaryReason = ''; }, /primaryReason/);
  invalid(story => { delete story.claims[0].support[0].locator; }, /missing locator/);
});

test('narrative order requires an opening, a visible caveat and a final payoff', () => {
  invalid(story => { story.beats[0].role = 'evidence'; }, /first beat must be the hook/);
  invalid(story => { story.beats.at(-1).role = 'mechanism'; }, /last beat must be the payoff/);
  invalid(story => { story.beats[4].role = 'mechanism'; }, /include a caveat/);
});

test('invalid durations fail; timing differences remain review notes', () => {
  for (const value of [0, -1, NaN, Infinity, '4']) invalid(story => { story.beats[0].durationSeconds = value; }, /durationSeconds/);
  const story = copy();
  story.beats[0].durationSeconds = 8;
  const result = validateStory(story);
  assert.equal(result.valid, true);
  assert.match(result.warnings.join('\n'), /do not compress narration/);
});

test('all four distinct reviews are required and passes need attribution and evidence', () => {
  invalid(story => { story.reviews[1] = story.reviews[0]; }, /duplicate stage|missing story-clarity/);
  invalid(story => { story.reviews[0].status = 'pass'; }, /named reviewer and review evidence/);
  invalid(story => { story.reviews[0].status = 'changes-requested'; }, /record the requested changes/);
  const story = copy();
  for (const review of story.reviews) Object.assign(review, { status: 'pass', reviewer: 'Named reviewer', evidence: 'Local review note with source and beat references' });
  assert.equal(validateStory(story).summary.pendingReviews.length, 0);
  assert.match(renderHandoff(story), /production review remains separate/);
});

test('handoff retains complete narration, timing, caveats, calculations and evidence', () => {
  const output = renderHandoff(example);
  assert.match(output, /not approved/);
  assert.match(output, /depth-to-radius · 25–41s/);
  assert.match(output, /earned-answer · 55–64s/);
  assert.match(output, /sqrt\(0\.01\) = 0\.1/);
  assert.match(output, /No blended light or measurement noise/);
  for (const source of example.sources) assert.ok(output.includes(source.url));
  for (const beat of example.beats) assert.ok(output.includes(beat.narration));
  const story = copy();
  story.brief.title = '*Literal* <text> [label]';
  assert.match(renderHandoff(story), /\\\*Literal\\\* \\<text\\> \\\[label\\\]/);
  assert.throws(() => renderHandoff(createDraft()), /Invalid story/);
});

test('checked-in handoff matches the example and current generator', async () => {
  const saved = await readFile(new URL('../docs/mysteries-of-the-sky/story-example-transit.md', import.meta.url), 'utf8');
  assert.equal(saved, renderHandoff(example));
});

test('CLI initializes, rejects incomplete drafts, validates JSON and writes a safe handoff', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mysteries-story-'));
  const script = fileURLToPath(new URL('./mysteries-story.mjs', import.meta.url));
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', cwd: dir });
  try {
    const draftPath = join(dir, 'draft.json');
    const storyPath = join(dir, 'story.json');
    const handoffPath = join(dir, 'handoff.md');
    assert.equal(run('init', draftPath).status, 0);
    assert.equal(run('init', draftPath).status, 1);
    const draftResult = run('validate', draftPath, '--json');
    assert.equal(draftResult.status, 1);
    assert.equal(JSON.parse(draftResult.stdout).valid, false);
    await writeFile(storyPath, JSON.stringify(example));
    const checked = run('validate', storyPath, '--json');
    assert.equal(checked.status, 0);
    assert.equal(JSON.parse(checked.stdout).valid, true);
    assert.equal(run('handoff', storyPath, handoffPath).status, 0);
    assert.equal(await readFile(handoffPath, 'utf8'), renderHandoff(example));
    assert.equal(run('handoff', storyPath, handoffPath).status, 1);
    assert.equal(run('handoff', storyPath, storyPath).status, 1);
    assert.equal(await readFile(storyPath, 'utf8'), JSON.stringify(example));
    const invalidOutput = join(dir, 'invalid-output.md');
    assert.equal(run('handoff', draftPath, invalidOutput).status, 1);
    await assert.rejects(readFile(invalidOutput), { code: 'ENOENT' });
    await writeFile(join(dir, 'bad.json'), '{');
    assert.equal(run('validate', join(dir, 'bad.json')).status, 1);
    assert.equal(run('validate', join(dir, 'missing.json')).status, 1);
    assert.equal(run('validate', storyPath, '--unknown').status, 2);
    assert.equal(run('handoff', storyPath).status, 2);
    assert.equal(run().status, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
