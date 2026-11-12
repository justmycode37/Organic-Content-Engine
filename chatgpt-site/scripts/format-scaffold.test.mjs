import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import underTheHood from '../../docs/content-engine/formats/under-the-hood.json' with { type: 'json' };
import v2Scenes from '../motion-examples/v2-scenes.json' with { type: 'json' };
import { buildReelSkeleton } from './format-scaffold.mjs';
import { describeScenes, describeStyles, lintReel, parseReelSpec } from '../src/motion/spec.ts';
import { validateReelSpec } from './validate-reelspec.mjs';

const fixture = v2Scenes;

test('948 story brief scaffolds a parseable ReelSpec with a hook and outro', () => {
  const result = buildReelSkeleton(underTheHood, {
    title: fixture.title,
    story: 'OpenAI reported that its agent pipeline found 948 distinct Linux kernel bugs with working root exploits. The primary source was inaccessible during research, so attribution and verification limits must remain visible.',
    style: 'patch',
    series: fixture.series,
    hook: {
      frameZeroText: fixture.scenes[0].text,
      claimIds: ['linux-result'],
      audio: 'OpenAI reported 948 distinct Linux kernel bugs with working root exploits.',
      visual: 'Show a clearly labelled illustration of a user-to-root boundary crossing.'
    },
    cta: fixture.scenes.at(-1).cta,
    sourceAttribution: 'OpenAI via SecurityWeek; verify primary source',
    beats: [
      { id: 'first-answer', claimIds: ['linux-result'], spokenLine: 'OpenAI reports these figures; this was not an independent run.' },
      { id: 'mechanism', claimIds: ['pipeline'], nodes: ['SCOUT', 'REPRODUCE', 'PATCH'], spokenLines: ['Agents inspect candidate bugs.', 'Researchers reproduce findings in virtual machines.', 'The pipeline drafts fixes for human review.'] },
      { id: 'recombine', claimIds: ['linux-result'], headline: '948 DISTINCT BUGS', spokenLine: 'OpenAI reports 948 distinct bugs behind 1,169 working exploits.' },
      { id: 'implication', spokenLine: 'The local-access boundary still matters.' }
    ]
  });
  assert.equal(parseReelSpec(result.spec).ok, true);
  assert.equal(result.spec.scenes[0].type, 'kinetic');
  assert.deepEqual(result.spec.scenes[0].words, [fixture.scenes[0].text]);
  assert.deepEqual(result.spec.scenes[0].claims, ['linux-result']);
  assert.equal(result.spec.scenes.at(-1).type, 'outro');
  assert.deepEqual(result.lint.filter(item => item.level === 'error'), []);
  assert.deepEqual(lintReel(result.spec).filter(item => item.level === 'error'), []);
  assert.equal(validateReelSpec(result.spec).ok, true);
});

test('scaffold rejects missing stories and preserves an explicit placeholder on unfinished beats', () => {
  assert.throws(() => buildReelSkeleton(underTheHood, {}), /story/);
  assert.throws(() => buildReelSkeleton(underTheHood, { story: 'A story.', hook: { frameZeroText: 'This hook is too long for a kinetic opener.' } }), /24 or fewer/);
  assert.equal(validateReelSpec({ version: 1, scenes: [{ type: 'missing' }] }).ok, false);
  const { spec } = buildReelSkeleton(underTheHood, { story: 'A reported AI security result.', hook: { text: 'Reported result.' } });
  assert.ok(spec.scenes.slice(1, -1).every(scene => scene.caption.includes('DRAFT') || scene.caption.includes('Add')));
});

test('all ten hypothesis presets scaffold and reference live style catalogs', async () => {
  const directory = new URL('../../docs/content-engine/formats/', import.meta.url);
  const files = (await readdir(directory)).filter(file => file.endsWith('.json') && file !== 'schema.json');
  assert.equal(files.length, 10);
  const styles = describeStyles().split('\n').map(line => line.slice(0, line.indexOf(':')));

  for (const file of files) {
    const preset = JSON.parse(await readFile(new URL(file, directory), 'utf8'));
    assert.equal(preset.evidence.label, 'hypothesis', `${file} must preserve the evidence label`);
    assert.equal(preset.evidence.basis, 'Inference', `${file} must preserve the evidence basis`);
    assert.deepEqual(Object.keys(preset.sceneRecommendationsByStyle).sort(), [...styles].sort());
    for (const [style, recommendation] of Object.entries(preset.sceneRecommendationsByStyle)) {
      const available = new Set(describeScenes(style).split('\n').filter(line => line.startsWith('special/')).map(line => line.slice('special/'.length).split(':', 1)[0]));
      for (const special of recommendation.specialScenes) assert.ok(available.has(special), `${file} recommends missing ${style} special '${special}'`);
    }
    const { spec } = buildReelSkeleton(preset, { story: `Example story for ${preset.id}.` });
    assert.equal(parseReelSpec(spec).ok, true, `${file} must generate a parseable ReelSpec`);
    assert.equal(spec.scenes[0].type, 'kinetic');
    assert.equal(spec.scenes.at(-1).type, 'outro');
    assert.deepEqual(lintReel(spec).filter(item => item.level === 'error'), [], `${file} must not produce lint errors`);
  }
});
