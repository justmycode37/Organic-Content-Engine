import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { proofStyle } from '../../src/motion/styles/proof/index.ts';
import { SCENE_TYPES } from '../../src/motion/core.ts';
import { parseReelSpec, lintReel } from '../../src/motion/spec.ts';

const example = JSON.parse(readFileSync(new URL('../../motion-examples/proof.json', import.meta.url), 'utf8'));

test('proof example parses and has zero lint findings', () => {
  const result = parseReelSpec(example);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(lintReel(result.spec), []);
  assert.ok(Math.abs(example.scenes.reduce((sum, scene) => sum + scene.duration, 0) - 29.2) < 1e-9);
  assert.ok(example.scenes.every(scene => scene.reward && scene.events.length >= 2));
});

test('proof covers every shared scene and has six strict special schemas', () => {
  assert.deepEqual(Object.keys(proofStyle.scenes).sort(), SCENE_TYPES.filter(type => type !== 'special').sort());
  assert.equal(Object.keys(proofStyle.specials).length, 6);
  for (const scene of example.scenes.filter(scene => scene.type === 'special')) {
    const schema = proofStyle.specials[scene.kind].schema;
    assert.equal(schema.safeParse(scene.data).success, true);
    assert.equal(schema.safeParse({ ...scene.data, unexpected: true }).success, false);
  }
});

test('proof rejects invalid connectors and invented highlighted quotations', () => {
  const board = { title: 'Conditions', exhibits: Array.from({ length: 3 }, () => ({ label: 'Source summary', title: 'Local access', detail: 'An existing account', source: 'SecurityWeek', date: '11 Nov 2026' })) };
  assert.equal(proofStyle.specials.board.schema.safeParse({ ...board, connectors: [[0, 4]] }).success, false);
  assert.equal(proofStyle.specials.board.schema.safeParse({ ...board, connectors: [[1, 1]] }).success, false);
  const quote = { text: 'should be considered functionally equivalent to root access for a well-resourced threat actor', source: 'OpenAI via SecurityWeek', date: '5 Nov 2026' };
  assert.equal(proofStyle.specials.quote.schema.safeParse({ ...quote, highlight: 'invented wording' }).success, false);
  const exhibit = { label: 'Source', title: '948 separate patches', text: '948 separate patches', source: 'https://securityweek.com', date: '11 Nov 2026' };
  assert.equal(proofStyle.specials.exhibit.schema.safeParse({ ...exhibit, text: 'x'.repeat(361) }).success, false);
});

test('proof specials tolerate absent field values during draft previews', () => {
  for (const special of Object.values(proofStyle.specials)) {
    const recorder = recordingContext();
    special.render({ ctx: recorder.context, t: .5, dur: 3, theme: proofStyle.theme('light', 'yellow'), index: 0, seed: 7919, assets: {}, style: 'proof' }, { kind: 'draft', data: {} });
    assert.equal(recorder.depth(), 0);
  }
});

function recordingContext() {
  const calls = []; let depth = 0;
  const context = new Proxy({}, {
    get(_, property) {
      if (property === 'measureText') return text => ({ width: String(text).length * 22 });
      return (...args) => {
        if (property === 'save') depth++;
        if (property === 'restore') depth--;
        assert.ok(depth >= 0, 'restore without save');
        assert.ok(args.every(value => typeof value !== 'number' || Number.isFinite(value)), `${String(property)} received a non-finite coordinate`);
        calls.push([property, ...args]);
      };
    },
    set(_, property, value) { calls.push([property, value]); return true; },
  });
  return { context, calls, depth: () => depth };
}

test('proof scenes render deterministically across durations, modes and missing assets', () => {
  const reference = JSON.parse(readFileSync(new URL('../../motion-examples/patch.json', import.meta.url), 'utf8'));
  const fixtures = [...example.scenes, ...reference.scenes,
    { type: 'code', code: 'const root = false;\nreturn root;', typing: true },
    { type: 'diff', removed: ['old'], added: ['new'], context: [] },
    { type: 'tokens', text: 'inspect this', predict: [] },
    { type: 'layers', layers: [] }, { type: 'grid', rows: 16, cols: 16 },
    { type: 'chat', messages: [] }, { type: 'flow', nodes: [] },
    { type: 'bars', items: [] }, { type: 'kinetic', words: [] },
    { type: 'special', kind: 'exhibit', data: { ...example.scenes[1].data, asset: 'missing' } },
    { type: 'special', kind: 'exhibit', data: { ...example.scenes[1].data, focus: [.9, .9, .1, .1] } },
    { type: 'special', kind: 'exhibit', data: { label: 'X', title: 'T'.repeat(90), text: 'W'.repeat(360), highlight: 'WWW', loupe: true, source: 'S', date: 'D' } },
    { type: 'special', kind: 'claim', data: { question: 'Supercalifragilistic'.repeat(6), note: 'n' } },
    { type: 'special', kind: 'verdict', data: { status: 'UNVERIFIED', reason: 'word '.repeat(36).trim() } },
  ];
  // A real capture is represented by its decoded size; the recorder only checks the calls.
  const assets = { 'sw-count': { width: 1125, height: 375 }, 'sw-quote': { width: 1125, height: 450 } };
  for (const duration of [1.2, 3, 6]) for (const mode of ['light', 'dark']) for (const fraction of [0, .05, .3, .8, .999]) for (const fixture of fixtures) {
    const render = () => {
      const recorder = recordingContext();
      const frame = { ctx: recorder.context, t: duration * fraction, dur: duration, theme: proofStyle.theme(mode, 'yellow'), index: 0, seed: 7919, assets, style: 'proof' };
      if (fixture.type === 'special') proofStyle.specials[fixture.kind].render(frame, fixture);
      else proofStyle.scenes[fixture.type].render(frame, fixture);
      assert.equal(recorder.depth(), 0, `${fixture.type} unbalanced context`);
      return recorder.calls;
    };
    assert.deepEqual(render(), render());
  }
});

test('proof copy keeps punctuation attached to a marked word and reports its box', async () => {
  const { copy } = await import('../../src/motion/styles/proof/draw.ts');
  const recorder = recordingContext();
  const marks = [];
  copy({ ctx: recorder.context, t: 1, dur: 3, theme: proofStyle.theme('light', 'yellow') }, 'Check the *evidence*.', 0, 0, 2000, { marks });
  const drawn = recorder.calls.filter(call => call[0] === 'fillText').map(call => call[1]);
  assert.deepEqual(drawn, ['Check', 'the', 'evidence', '.']);
  const [, , evidenceX] = recorder.calls.find(call => call[0] === 'fillText' && call[1] === 'evidence');
  const [, , periodX] = recorder.calls.find(call => call[0] === 'fillText' && call[1] === '.');
  assert.equal(periodX, evidenceX + 'evidence'.length * 22);
  assert.equal(marks.length, 1);
});

test('proof removes all persistent chrome and keeps event-driven marker sweeps', () => {
  const recorder = recordingContext();
  const frame = { ctx: recorder.context, t: 0, dur: 2.5, theme: proofStyle.theme('light', 'yellow'), events: [{ at: .7, kind: 'highlight' }], assets: {}, opening: true };
  proofStyle.chrome(frame, example, 0, 29.2);
  assert.deepEqual(recorder.calls, []);
  const render = time => {
    const next = recordingContext();
    proofStyle.scenes.title.render({ ...frame, ctx: next.context, t: time }, example.scenes[0]);
    return next.calls;
  };
  assert.notDeepEqual(render(.6), render(1));
  assert.ok(render(0).some(call => call[0] === 'fillText' && call[1] === '948'));
});

test('proof evidence uses native image pixels and rejects invalid crop bounds', () => {
  const recorder = recordingContext();
  const evidence = { type: 'evidence', asset: 'sw-count', rect: { x: 0, y: 86, w: 350, h: 66 }, claim: '948 separate patches', source: 'securityweek.com', date: '11 Nov 2026' };
  proofStyle.scenes.evidence.render({ ctx: recorder.context, t: 1.5, dur: 2.5, theme: proofStyle.theme('light', 'yellow'), events: [{ at: .5, kind: 'connect' }, { at: 1, kind: 'highlight' }], assets: { 'sw-count': { width: 1125, height: 375 } } }, evidence);
  assert.ok(recorder.calls.some(call => call[0] === 'drawImage'));
  assert.ok(recorder.calls.some(call => call[0] === 'clip'));
  assert.ok(!recorder.calls.some(call => call[0] === 'fillText' && call[1] === 'separate'));
  const data = { label: 'Source', title: 'Patches', text: 'Patches', source: 'SecurityWeek', date: '11 Nov 2026', focus: [.9, .9, .2, .2] };
  assert.equal(proofStyle.specials.exhibit.schema.safeParse(data).success, false);
});

test('proof quote retains every qualifier even with sparse event anchors', () => {
  const text = 'For the near and medium term having access to a low privileged account on an unpatched operating system should be considered functionally equivalent to root access for a well resourced threat actor';
  const words = new Set();
  for (let index = 0; index < Math.ceil(text.split(' ').length / 6); index++) {
    const recorder = recordingContext();
    proofStyle.specials.quote.render({ ctx: recorder.context, t: (index + .5) * 12 / Math.ceil(text.split(' ').length / 6), dur: 12, theme: proofStyle.theme('light', 'yellow'), events: [{ at: .7, kind: 'highlight' }] }, { data: { text, source: 'SecurityWeek', date: '11 Nov 2026' } });
    recorder.calls.filter(call => call[0] === 'fillText').forEach(call => words.add(call[1].replace(/[“”]/g, '')));
  }
  for (const word of text.split(' ')) assert.ok(words.has(word), word);
});

test('proof semantic skins preserve arithmetic, comparison and correction', () => {
  const draw = (type, props, time) => {
    const recorder = recordingContext();
    proofStyle.scenes[type].render({ ctx: recorder.context, t: time, dur: 3, theme: proofStyle.theme('light', 'yellow'), events: [{ at: .4 }, { at: 1 }, { at: 1.6 }] }, props);
    return recorder.calls.filter(call => call[0] === 'fillText').map(call => call[1]).join(' ');
  };
  const quantity = { quantity: 25, subset: 7, unit: 'bugs', comparator: { label: 'Reported', value: 18 } };
  assert.match(draw('quantity', quantity, 1.4), /18 bugs Remainder/);
  assert.match(draw('quantity', quantity, 2), /Reported: 18/);
  const prediction = { question: 'How many?', guesses: ['25'], answer: '18', comparison: { label: 'Reported', value: '18' }, correction: 'Subtract seven' };
  assert.match(draw('predict', prediction, 1.4), /How many\? 25 18$/);
  assert.match(draw('predict', prediction, 2), /18 Reported: 18/);
  assert.match(draw('predict', prediction, 2.9), /Subtract seven 18/);
  assert.match(draw('scale', { reference: 'baseline', unit: 'credits', levels: [{ label: 'Before', value: 10 }, { label: 'After', value: 20 }] }, 1.4), /After: 20 credits 2.00× baseline/);
});

test('proof exhibit reads capture clauses on their events and keeps a wrapped qualifier on screen', () => {
  const scene = example.scenes.find(candidate => candidate.data?.held === 2);
  const clauses = scene.data.clauses;
  const draw = time => {
    const recorder = recordingContext();
    proofStyle.specials.exhibit.render({ ctx: recorder.context, t: time, dur: scene.duration, theme: proofStyle.theme('light', 'yellow'), events: [{ at: .9, kind: 'resolve' }, { at: 1.7, kind: 'highlight' }], assets: { 'sw-quote': { width: 1125, height: 450 } } }, scene);
    return recorder.calls;
  };
  const final = draw(scene.duration);
  assert.ok(final.some(call => call[0] === 'drawImage'), 'source pixels are drawn');
  assert.ok(!final.some(call => call[0] === 'fillText' && /resourced|threat/.test(call[1])), 'capture text is never re-typeset');
  assert.notDeepEqual(draw(1.5), final, 'the last clause changes the frame on its event');
  // The wrapped "well- / resourced threat actor" clause keeps one box per line in the example.
  assert.equal(clauses.at(-1).length, 2);
  const schema = proofStyle.specials.exhibit.schema;
  assert.equal(schema.safeParse({ ...scene.data, held: clauses.length }).success, false);
  assert.equal(schema.safeParse({ source: 'securityweek.com', date: 'captured 11 Nov 2026', clauses }).success, false);
});
