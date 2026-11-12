import assert from 'node:assert/strict';
import { test } from 'node:test';
import { specials } from './specials.ts';
import { systemStyle, systemTheme } from './index.ts';
import { beat, state } from './draw.ts';
import { SCENE_TYPES } from '../../core.ts';
import { parseReelSpec, lintReel } from '../../spec.ts';
import example from '../../../../motion-examples/system.json' with { type: 'json' };

test('every shared scene has a non-retro SYSTEM skin', () => {
  assert.deepEqual(Object.keys(systemStyle.scenes ?? {}).sort(), SCENE_TYPES.filter(type => type !== 'special').sort());
  assert.equal(systemStyle.defaultAccent, 'blue');
  assert.equal(systemStyle.fonts?.length, 2);
});

test('schemas reject unknown fields, unbounded inputs and invalid data relationships', () => {
  for (const scene of Object.values(specials)) assert.equal(scene.schema.safeParse({ unexpected: 'field' }).success, false);
  assert.equal(specials.update.schema.safeParse({ version: 'a', date: 'b', title: 'c', changes: Array(9).fill('x') }).success, false);
  assert.equal(specials.dashboard.schema.safeParse({ title: 'Gauge', metrics: [{ label: 'X', value: 110, max: 100, kind: 'gauge' }, { label: 'Y', value: 1 }], note: 'Test' }).success, false);
  assert.equal(specials.dashboard.schema.safeParse({ title: 'Series', metrics: [{ label: 'X', value: 1, kind: 'sparkline' }, { label: 'Y', value: 1 }], note: 'Test' }).success, false);
  assert.equal(specials.network.schema.safeParse({ title: 'Test', nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [['a', 'b']], path: ['b', 'a'], note: 'Test' }).success, false);
  assert.equal(specials.benchmark.schema.safeParse({ title: 'Test', items: [{ label: 'a', value: 1 }, { label: 'b', value: 2 }], highlight: 3, delta: 'Test' }).success, false);
  assert.equal(specials.log.schema.safeParse({ title: 'Test', events: [{ time: '00:00', message: 'Test', status: 'ONLINE' }], highlight: 3 }).success, false);
});

test('every accent maps to one hue in both the dark and the light palette', () => {
  for (const accent of ['blue', 'lime', 'red', 'orange', 'magenta', 'yellow']) {
    for (const mode of ['dark', 'light']) assert.match(systemTheme(mode, accent).accent, /^#[0-9A-F]{6}$/);
    assert.notEqual(systemTheme('light', accent).bg, systemTheme('dark', accent).bg);
    assert.notEqual(systemTheme('light', accent).accent, systemTheme('dark', accent).accent);
  }
});

test('event anchors drive replacement instead of a duration-only animation', () => {
  const frame = { t: .8, dur: 3, events: [{ at: 1.1 }, { at: 1.9 }], hits: [.2] };
  assert.equal(beat(frame, 0), 1.1);
  assert.equal(state(frame, 3), 0);
  assert.equal(state({ ...frame, t: 1.2 }, 3), 1);
  assert.equal(state({ ...frame, t: 2 }, 3), 2);
  assert.equal(beat({ events: [], hits: [.4] }, 0), .4);
  assert.equal(state({ ...frame, events: [], hits: [.3, 1.5] }, 3), 1);
});

test('outro uses authored copy rather than inserting Linux-specific instructions', () => {
  const drawn = [];
  const context = new Proxy({ fillText: text => drawn.push(text), measureText: text => ({ width: text.length * 14 }) }, {
    get(target, property) { return property in target ? target[property] : () => {}; },
    set() { return true; },
  });
  const frame = { ctx: context, t: 2, dur: 2.4, theme: systemTheme('dark', 'blue'), events: [{ at: .6 }, { at: 1.2 }], hits: [], opening: false };
  systemStyle.scenes.outro.render(frame, { cta: 'Save draft', sub: 'Ready' });
  assert.equal(drawn.join(' '), 'Save draft Ready');
});

test('system example parses with no lint findings and preserves the caveats', () => {
  const parsed = parseReelSpec(example);
  assert.equal(parsed.ok, true);
  assert.deepEqual(lintReel(parsed.spec), []);
  assert.ok(Math.abs(example.scenes.reduce((sum, scene) => sum + scene.duration, 0) - 36) < 1e-9);
  const spoken = example.scenes.map(scene => scene.say).join(' ');
  assert.match(spoken, /OpenAI says/);
  assert.match(spoken, /local access/);
  assert.match(spoken, /not publicly released/);
  assert.match(spoken, /not independent verification/);
  assert.ok(example.scenes.every(scene => scene.reward && scene.events.every(event => event.word)));
});

test('all shared renderers tolerate empty content at short and long durations with balanced state', () => {
  let depth = 0;
  const context = new Proxy({ save: () => { depth++; }, restore: () => { depth--; }, measureText: value => ({ width: value.length * 14 }) }, {
    get(target, property) { return property in target ? target[property] : () => {}; },
    set() { return true; },
  });
  const values = { title: { text: '' }, code: { code: '' }, diff: { removed: [], added: [] }, terminal: { lines: [] }, flow: { nodes: [] }, stat: { value: 0, label: '' }, bars: { items: [] }, compare: { left: { label: '', points: [] }, right: { label: '', points: [] } }, list: { items: [] }, tokens: { text: '' }, chat: { messages: [] }, layers: { layers: [] }, grid: { rows: 0, cols: 0 }, kinetic: { words: [] }, changelog: { version: '', items: [] }, outro: { cta: '' }, demo: {}, predict: {}, quantity: {}, evidence: {}, scale: { levels: [] }, split: {} };
  for (const duration of [1.2, 6]) for (const time of [0, .1, duration / 2, duration - .01]) {
    const frame = { ctx: context, t: time, dur: duration, theme: systemTheme('dark', 'blue'), seed: 1, index: 0, style: 'system', assets: {}, events: [], hits: [], opening: true };
    for (const [kind, scene] of Object.entries(systemStyle.scenes ?? {})) {
      scene.render(frame, values[kind]);
      assert.equal(depth, 0, kind);
    }
    for (const special of Object.values(systemStyle.specials ?? {})) {
      special.render(frame, { kind: 'invalid-input', data: {} });
      assert.equal(depth, 0);
    }
    systemStyle.camera?.(frame, []);
    assert.equal(depth, 1);
    context.restore();
  }
});
