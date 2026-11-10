// Edit-plan logic behind the Studio. Rendering itself needs a browser and is not covered here.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { balancedLines, buildTimeline, captionsFromWords, fitNarration, fitText, formatCaptions, formatShots, parseCaptions, parseShots, segmentAt, VOICE_OFFSET } from '../src/studio/plan.ts';
import { pickVoice, wordsFromAlignment } from '../worker/services/voiceover.ts';

const clips = [{ runId: 'a', duration: 5 }, { runId: 'b', duration: 4 }];
const plan = (patch = {}) => ({ hook: '', cta: '', shots: [], captions: [], musicMaterialId: null, voiceover: '', voice: null, ...patch });
const measure = text => text.length * 10;

test('shots are clamped to their clip, snapped to frames and laid back to back', () => {
  const timeline = buildTimeline(plan({ shots: [{ runId: 'a', start: 0.5, end: 3 }, { runId: 'missing', start: 0, end: 2 }, { runId: 'b', start: 3, end: 9 }, { runId: 'a', start: 4.9, end: 5 }] }), clips);
  assert.deepEqual(timeline.segments.map(s => [s.runId, s.in, s.out, s.start, s.end]), [['a', 0.5, 3, 0, 2.5], ['b', 3, 4, 2.5, 3.5]]);
  assert.equal(timeline.frames, 105);
  assert.equal(segmentAt(timeline, 2.5).runId, 'b');
  assert.equal(segmentAt(timeline, 99).runId, 'b');
});

test('without usable shots every clip plays in full, capped at ninety seconds', () => {
  assert.equal(buildTimeline(plan(), clips).duration, 9);
  assert.equal(buildTimeline(plan(), [{ runId: 'long', duration: 200 }]).duration, 90);
  assert.equal(buildTimeline(plan(), []).frames, 0);
});

test('captions stay clear of the hook, the end card and each other', () => {
  const timeline = buildTimeline(plan({ hook: 'Hook', cta: 'Follow', captions: [
    { text: 'late', start: 7.5, end: 9 }, { text: 'under hook', start: 0, end: 2.8 }, { text: 'first', start: 2, end: 4.5 }, { text: 'overlap', start: 4, end: 6 },
  ] }), clips);
  assert.equal(timeline.hookEnd, 2.6);
  assert.equal(timeline.ctaStart, 6.6);
  assert.deepEqual(timeline.captions, [{ text: 'first', start: 2.6, end: 4.5 }, { text: 'overlap', start: 4.5, end: 6 }]);
});

test('text wraps to balanced lines and steps down in size until it fits', () => {
  assert.deepEqual(balancedLines('aaaa bbbb cccc dd', measure, 150), ['aaaa bbbb', 'cccc dd']);
  const fitted = fitText('one two three four five six', size => text => text.length * size, 100, 2, [20, 10, 5]);
  assert.equal(fitted.size, 5);
  assert.equal(fitted.lines.length, 2);
});

test('editor text formats round-trip and report the offending line', () => {
  const captions = [{ text: 'It failed | in public', start: 2.6, end: 4.25 }];
  assert.deepEqual(parseCaptions(formatCaptions(captions)), { captions, error: null });
  assert.match(parseCaptions('2-3 | ok\nnonsense').error, /line 2/);
  assert.match(parseCaptions('3-2 | backwards').error, /after the start/);
  const shots = [{ runId: 'b', start: 0.4, end: 3.2 }, { runId: 'a', start: 1, end: 2 }];
  assert.equal(formatShots(shots, clips), '2 | 0.4-3.2\n1 | 1-2');
  assert.deepEqual(parseShots(formatShots(shots, clips), clips), { shots, error: null });
  assert.match(parseShots('3 | 0-2', clips).error, /clip number from 1 to 2/);
  assert.match(parseShots('1 | 6-8', clips).error, /only 5 seconds/);
});

test('default voice prioritizes female social delivery and never silently picks a male voice', () => {
  const voice = (id, patch = {}) => ({ id, gender: 'female', useCase: 'narration', age: '', accent: '', description: '', ...patch });
  const male = voice('MaleVoice123', { gender: 'male', useCase: 'social_media' });
  const narrator = voice('Narrator123');
  const social = voice('FemaleSocial123', { useCase: 'social_media', description: 'Bright and energetic' });
  assert.equal(pickVoice([male, narrator, social], null), social.id);
  assert.equal(pickVoice([male, narrator, social], narrator.id), narrator.id);
  assert.equal(pickVoice([male, narrator, social], 'retired-voice'), social.id);
  assert.equal(pickVoice([male], null), null);
  assert.equal(pickVoice([], null), null);
});

test('character alignment becomes complete words with exact provider timing', () => {
  assert.deepEqual(wordsFromAlignment({ characters: [...'Hi there!'], character_start_times_seconds: [0, .1, .2, .5, .6, .7, .8, .9, 1], character_end_times_seconds: [.1, .2, .3, .6, .7, .8, .9, 1, 1.1] }), [
    { text: 'Hi', start: 0, end: .2 }, { text: 'there!', start: .5, end: 1.1 },
  ]);
  assert.deepEqual(wordsFromAlignment(null), []);
});

test('spoken captions retain word timing through the opening title and end card', () => {
  const words = [{ text: 'It', start: 0, end: .2 }, { text: 'failed.', start: .4, end: 1 }, { text: 'Follow', start: 7, end: 7.5 }, { text: 'along.', start: 8, end: 8.5 }];
  const captions = captionsFromWords(words);
  assert.equal(parseCaptions(formatCaptions(captions)).error, null);
  const timeline = buildTimeline(plan({ hook: 'It failed', cta: 'Follow along', captions, voice: { words } }), clips);
  assert.equal(timeline.captions.length, captions.length);
  assert.equal(timeline.captions[0].start, VOICE_OFFSET);
  assert.deepEqual(timeline.captions[0].words, words.slice(0, 2).map(word => ({ ...word, start: word.start + VOICE_OFFSET, end: word.end + VOICE_OFFSET })));
  assert.ok(timeline.captions.at(-1).end > timeline.ctaStart);
  const custom = buildTimeline(plan({ captions: [{ text: 'Different wording', start: .15, end: 1.35 }], voice: { words } }), clips);
  assert.equal(custom.captions[0].words, undefined, 'manual captions use their own animation');
});

test('fast spoken phrases never overlap and a full length narration remains editable', () => {
  const quick = captionsFromWords([{ text: 'Hi!', start: 0, end: .1 }, { text: 'Go!', start: .15, end: .25 }]);
  assert.ok(quick[0].end <= quick[1].start);
  const words = Array.from({ length: 210 }, (_, index) => ({ text: 'word', start: index * .4, end: index * .4 + .3 }));
  const captions = captionsFromWords(words);
  assert.ok(captions.length > 40);
  assert.equal(parseCaptions(formatCaptions(captions)).error, null);
});

test('automatic narration fitting uses unused handles and reports scripts the footage cannot fit',()=>{
 const original=plan({shots:[{runId:'a',start:.5,end:2},{runId:'b',start:0,end:1}]});
 const fitted=fitNarration(original,clips,5);
 assert.ok(buildTimeline(fitted,clips).duration>=5.25);
 assert.equal(original.shots[0].end,2,'the AI source plan is not mutated');
 assert.equal(fitNarration(original,clips,1),original);
 assert.throws(()=>fitNarration(original,clips,20),/Shorten the script/);
 assert.throws(()=>fitNarration(original,clips,100),/maximum video length/);
});
