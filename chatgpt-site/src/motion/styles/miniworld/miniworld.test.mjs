import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { miniworldStyle } from './index.ts';
import { World, PLACES } from './engine.ts';
import { parseReelSpec, lintReel } from '../../spec.ts';
import { actorLayout, beatAt, gateState, patchState, towerState } from './choreography.ts';
import { objectFrame } from '../../fx/objects.ts';
import { resolveSceneEvents } from '../../player.ts';

function harness(mode = 'light', t = 1, dur = 3.2) {
  const calls = [];
  let balance = 0;
  const target = {
    font: '800 32px sans-serif', globalAlpha: 1,
    save() { balance++; calls.push(['save']); },
    restore() { balance--; assert.ok(balance >= 0); calls.push(['restore']); },
    measureText(value) { return { width: value.length * Number.parseFloat(this.font.split(' ')[1]) * 0.52 }; },
  };
  const ctx = new Proxy(target, { get(object, key) { return key in object ? object[key] : (...args) => { assert.ok(args.every(arg => typeof arg !== 'number' || Number.isFinite(arg)), `nonfinite ${String(key)}`); calls.push([key, ...args]); }; }, set(object, key, value) { object[key] = value; calls.push([key, value]); return true; } });
  return { calls, balance: () => balance, frame: { ctx, t, dur, theme: miniworldStyle.theme(mode, 'orange'), seed: 7919, index: 0, style: 'miniworld', assets: {} } };
}

const example = JSON.parse(readFileSync(new URL('../../../../motion-examples/miniworld.json', import.meta.url)));

test('example parses and uses semantic scenes with word-anchored rewards and named camera targets', () => {
  const result = parseReelSpec(example);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(lintReel(result.spec).filter(item => item.level === 'error'), []);
  for (const type of ['demo', 'predict', 'quantity', 'evidence', 'scale', 'split']) assert.ok(example.scenes.some(scene => scene.type === type));
  assert.equal(Object.keys(miniworldStyle.specials).length, 6);
  for (const scene of example.scenes) {
    assert.ok(scene.reward);
    assert.ok(scene.events.every(event => event.word));
    assert.ok(scene.camera.target === 'BIT' || scene.camera.target === 'place');
    assert.equal(typeof miniworldStyle.scenes[scene.type].layout, 'function');
  }
  const duration = example.scenes.reduce((sum, scene) => sum + scene.duration, 0);
  assert.ok(duration >= 30 && duration <= 45);
});

test('named events and hits, not duration percentages, control causal state', () => {
  const { frame } = harness('light', 1.2, 3);
  const event = (target, at) => ({ target, at, kind: 'transform' });
  frame.events = [event('wall', 0.2), event('key', 0.5), event('gate', 0.75), event('travel', 2)];
  assert.equal(gateState(frame).open, 1);
  frame.events[2].at = 1.5;
  assert.equal(gateState(frame).open, 0);
  frame.events = [event('patch', 0.2), event('lights', 0.5)];
  assert.equal(patchState(frame).repaired, 1);
  frame.events[1].at = 1.6;
  assert.equal(patchState(frame).repaired, 0);
  frame.events = [event('level-1', 0.7)];
  assert.equal(towerState(frame, [{ value: 100 }, { value: 40 }]).now, 40);
  frame.events[0].at = 1.6;
  assert.equal(towerState(frame, [{ value: 100 }, { value: 40 }]).now, 100);
  frame.events = []; frame.hits = [0.4];
  assert.equal(beatAt(frame, 'wall'), 0.4);
});

test('BIT keeps its named identity and exact placement across scene boundaries', () => {
  const first = harness('light', 2.5, 2.5).frame;
  first.objects = objectFrame();
  actorLayout(first, example.scenes[0]);
  const last = first.objects.current.get('BIT');
  const next = harness('light', 0, 2.5).frame;
  next.objects = objectFrame(first.objects.current);
  actorLayout(next, example.scenes[1]);
  assert.deepEqual(next.objects.current.get('BIT'), last);
  next.t = 1;
  actorLayout(next, example.scenes[1]);
  assert.notDeepEqual(next.objects.current.get('BIT').rect, last.rect);
  assert.ok(next.objects.current.has('place'));
});

test('voice-aligned numeric timestamps override word estimates for actor travel', () => {
  const scene = example.scenes[1];
  const resolved = resolveSceneEvents(scene);
  const render = events => {
    const frame = harness('light', 1.8, scene.duration).frame;
    frame.objects = objectFrame();
    actorLayout(frame, { ...scene, events });
    return frame.objects.current.get('BIT').rect;
  };
  assert.deepEqual(render(scene.events), render(resolved));
  assert.notDeepEqual(render(resolved), render(resolved.map(event => event.target === 'travel' ? { ...event, at: 0.8 } : event)));
});

test('special schemas reject unknown keys, missing fields and unbounded collections', () => {
  const fixtures = {
    place: { place: 'SERVER CITY', title: 'ACCESS' },
    stack: { title: 'FUNNEL', items: [{ label: 'CANDIDATES', value: 100 }, { label: 'BUGS', value: 40 }] },
    journey: { stations: ['SCOUT', 'REVIEW'] },
    consequence: { title: 'PATCH', cause: 'CONTACT', effect: 'REPAIR' },
    versus: { title: 'BUGS', left: { label: 'JULY', value: 166 }, right: { label: 'OCTOBER', value: 948 } },
    cast: { character: 'ADA', role: 'REPAIR' },
  };
  for (const [kind, data] of Object.entries(fixtures)) {
    const { schema, render } = miniworldStyle.specials[kind];
    assert.equal(schema.safeParse(data).success, true);
    assert.equal(schema.safeParse({ ...data, surprise: true }).success, false);
    assert.equal(schema.safeParse({}).success, false);
    const { frame, balance } = harness(); render(frame, { data }); assert.equal(balance(), 0);
  }
  assert.equal(miniworldStyle.specials.stack.schema.safeParse({ title: 'bad', items: Array.from({ length: 5 }, () => ({ label: 'x', value: 1 })) }).success, false);
  assert.equal(miniworldStyle.specials.stack.schema.safeParse({ title: 'bad', items: [{ label: 'x', value: -1 }] }).success, false);
  assert.equal(miniworldStyle.specials.journey.schema.safeParse({ title: 'bad', stations: ['x'] }).success, false);
});

test('all shared scenes handle missing and empty input without unbalanced canvas state', () => {
  for (const [type, scene] of Object.entries(miniworldStyle.scenes)) {
    for (const mode of ['light', 'dark']) {
      const { frame, balance } = harness(mode);
      scene.render(frame, {});
      assert.equal(balance(), 0, type);
      scene.render(frame, { items: [], nodes: [], words: [], messages: [], lines: [], layers: [], removed: [], added: [], code: '', left: { points: [] }, right: { points: [] }, rows: 0, cols: 0 });
      assert.equal(balance(), 0, type);
    }
  }
});

test('specials render explicit placeholders on absent or invalid preview data', () => {
  for (const special of Object.values(miniworldStyle.specials)) {
    const { frame, balance } = harness();
    special.render(frame, { data: {} }); special.render(frame, { data: undefined });
    assert.equal(balance(), 0);
  }
});

test('captions wrap punctuation and long unbroken words within the safe width', () => {
  for (const text of ['These are *OpenAI’s own numbers*.', 'X'.repeat(90)]) {
    const { frame, calls, balance } = harness();
    miniworldStyle.caption(frame, { text, start: 0, end: 2 }, 1);
    assert.equal(balance(), 0);
    for (const call of calls.filter(call => call[0] === 'fillText')) {
      assert.ok(call[2] >= 96 && call[2] <= 984);
      assert.ok(call[2] + call[4] <= 985);
      assert.notEqual(call[1], '.');
    }
  }
});

test('every example frame is deterministic and finite at short and long durations', () => {
  for (const mode of ['light', 'dark']) for (const dur of [1.2, 6]) for (const scene of example.scenes) {
    for (const t of [0, 0.18, dur * 0.6, dur - 0.01]) {
      const render = () => {
        const result = harness(mode, t, dur);
        const renderer = scene.type === 'special' ? miniworldStyle.specials[scene.kind] : miniworldStyle.scenes[scene.type];
        renderer.render(result.frame, scene); assert.equal(result.balance(), 0);
        return result.calls;
      };
      assert.deepEqual(render(), render());
    }
  }
});

test('ground sorts behind rear buildings regardless of insertion order', () => {
  const { frame, calls } = harness();
  const world = new World(frame);
  world.box(-2, -2, 0, 1, 1, 2, 'teal'); world.ground(); world.flush();
  const fills = calls.filter(call => call[0] === 'fillStyle').map(call => call[1]);
  assert.equal(fills[0], world.colors.ground.left);
});

test('all fixed places and cast variants render, camera owns exactly one save', () => {
  for (const place of PLACES) {
    const { frame, balance } = harness();
    miniworldStyle.specials.place.render(frame, { data: { place, title: place } }); assert.equal(balance(), 0);
  }
  for (const character of ['BIT', 'ADA', 'THE CROWD']) {
    const { frame, balance } = harness();
    miniworldStyle.specials.cast.render(frame, { data: { character, role: 'The recurring cast' } }); assert.equal(balance(), 0);
  }
  const { frame, balance } = harness(); miniworldStyle.camera(frame, []); assert.equal(balance(), 1); frame.ctx.restore();
});
