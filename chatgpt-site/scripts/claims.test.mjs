import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkClaims, claimsLedgerSchema, extractNumberMentions } from '../src/motion/claims.ts';
import { reelSpecSchema } from '../src/motion/spec.ts';

const source = { url: 'https://example.com/report', type: 'secondary', publisher: 'Example', retrieved: '2026-11-11' };
const claim = (id, value, unit, status = 'verified') => ({
  id, statement: `Supported fact ${id}.`, value, unit, sources: [source], status,
  attribution: 'Example reported this figure.', caveats: [], notes: [],
});
const ledger = (...claims) => ({ version: 1, claims });

test('ledger schema requires sources, status, attribution, caveats and notes', () => {
  assert.equal(claimsLedgerSchema.safeParse(ledger(claim('root-bugs', 948, 'bugs'))).success, true);
  const invalid = ledger({ id: 'missing-source', statement: 'Fact', status: 'verified', attribution: 'Example', caveats: [], notes: [] });
  assert.equal(claimsLedgerSchema.safeParse(invalid).success, false);
});

test('ReelSpec accepts well-formed scene claim IDs and rejects malformed IDs', () => {
  const spec = { version: 1, scenes: [
    { type: 'title', duration: 2, text: 'A hook', claims: ['root-bug-count'] },
    { type: 'outro', duration: 3, cta: 'Share this' },
  ] };
  assert.equal(reelSpecSchema.safeParse(spec).success, true);
  assert.equal(reelSpecSchema.safeParse({ ...spec, scenes: [{ ...spec.scenes[0], claims: ['not a valid id'] }, spec.scenes[1]] }).success, false);
});

test('extracts numeric formats, currency magnitudes, percentages and multipliers', () => {
  const spec = { scenes: [{ type: 'title', duration: 2, text: '$1,213,430', say: 'About $1.2M, or 1.2 million dollars; 5.7x and 12%.', caption: '948 bugs' }] };
  const mentions = extractNumberMentions(spec);
  assert.deepEqual(mentions.map(item => [item.value, item.unit]), [
    [1213430, 'USD'], [1200000, 'USD'], [1200000, 'USD'], [5.7, 'multiplier'], [12, 'percent'], [948, 'bugs'],
  ]);
});

test('checks numbers in special data and timed captions against claims', () => {
  const spec = {
    scenes: [
      { type: 'special', duration: 2, kind: 'card', data: { rows: [{ label: '948 root bugs' }] } },
      { type: 'outro', duration: 2, cta: 'Send this', say: 'Over five times faster.', claims: ['growth'] },
    ],
    captions: [{ text: '5.7x more bugs', start: 2, end: 3 }],
  };
  const report = checkClaims(spec, ledger(claim('root-bugs', 948, 'bugs'), claim('growth', 5.7108, 'multiplier')));
  assert.equal(report.numbers.length, 3);
  assert.equal(report.errors.some(error => error.code === 'UNSUPPORTED_NUMBER'), false);
  assert.deepEqual(report.numbers.map(item => item.claimId), ['root-bugs', 'growth', 'growth']);
});

test('scene links must exist and narrow which claims can support a number', () => {
  const spec = { scenes: [{ type: 'title', duration: 2, text: '948 bugs', claims: ['other-claim'] }] };
  const report = checkClaims(spec, ledger(claim('root-bugs', 948, 'bugs')));
  assert.ok(report.errors.some(error => error.code === 'UNKNOWN_CLAIM_ID'));
  assert.ok(report.errors.some(error => error.code === 'UNSUPPORTED_NUMBER'));
});

test('rounding and directional phrases match derived values without hiding unit mismatches', () => {
  const spec = { scenes: [{
    type: 'compare', duration: 3,
    left: { label: 'JULY', points: ['166 BUGS', '~$3,094 / BUG'] }, right: { label: 'OCTOBER', points: ['~$1,280 / BUG'] },
    say: 'About a hundred fixes, over five times more, at under half the cost.',
  }] };
  const report = checkClaims(spec, ledger(
    claim('july-exploits', 166, 'root exploits'),
    claim('july-cost-per-exploit', 3094, 'USD per root exploit'),
    claim('oct-cost', 1279, 'USD per bug'),
    claim('fixes', 104, 'fixes'),
    claim('growth', 5.7108, 'multiplier'),
    claim('cost-ratio', 0.4137, 'ratio'),
  ));
  assert.ok(report.errors.some(error => error.code === 'UNSUPPORTED_NUMBER' && error.message.includes("'166'")));
  assert.equal(report.numbers.filter(item => !item.supported).length, 2);
  assert.equal(report.numbers.find(item => item.value === 1280).supported, true);
  assert.equal(report.numbers.find(item => item.raw === 'a hundred').supported, true);
  assert.equal(report.numbers.find(item => item.raw === 'five').supported, true);
  assert.equal(report.numbers.find(item => item.raw === 'half').supported, true);
});

test('attributed claims warn without narration or caption attribution and contested claims block', () => {
  const attributed = claim('reported-number', 948, 'bugs', 'attributed');
  const spec = { scenes: [{ type: 'title', duration: 2, caption: '948 bugs found', say: 'Agents found 948 bugs.', claims: ['reported-number'] }] };
  const report = checkClaims(spec, ledger(attributed));
  assert.equal(report.ok, true);
  assert.equal(report.warnings.filter(warning => warning.code === 'ATTRIBUTION_MISSING').length, 1);
  const attributedSpec = { scenes: [{ ...spec.scenes[0], say: 'According to Example, agents found 948 bugs.' }] };
  assert.equal(checkClaims(attributedSpec, ledger(attributed)).warnings.length, 0);
  for (const status of ['contested', 'unverified']) {
    const blocked = checkClaims(spec, ledger(claim('reported-number', 948, 'bugs', status)));
    assert.equal(blocked.ok, false);
    assert.deepEqual(blocked.blockedClaims, ['reported-number']);
  }
});

test('scene claims are excluded from on-screen number extraction', () => {
  const mentions = extractNumberMentions({ scenes: [{ type: 'title', duration: 2, text: '948 bugs', claims: ['claim-948'] }] });
  assert.deepEqual(mentions.map(item => item.value), [948]);
});

test('only claims a reel uses can block it', () => {
  const source = { url: 'https://example.com/a', type: 'primary', publisher: 'Example', retrieved: '2026-11-11' };
  const ledger = { version: 1, claims: [
    { id: 'count', statement: '948 bugs', value: 948, unit: 'bugs', sources: [source], status: 'verified', attribution: 'Example says', caveats: [], notes: [] },
    { id: 'ratio', statement: '5.7 times more', value: 5.7, unit: 'multiplier', sources: [source], status: 'contested', attribution: 'Example says', caveats: [], notes: [] },
  ] };
  const unused = checkClaims({ scenes: [{ type: 'title', duration: 2, text: '948 bugs' }] }, ledger);
  assert.equal(unused.ok, true);
  assert.deepEqual(unused.blockedClaims, []);
  const used = checkClaims({ scenes: [{ type: 'title', duration: 2, text: '5.7x more bugs' }] }, ledger);
  assert.equal(used.ok, false);
  assert.deepEqual(used.blockedClaims, ['ratio']);
  const referenced = checkClaims({ scenes: [{ type: 'title', duration: 2, text: 'More bugs', claims: ['ratio'] }] }, ledger);
  assert.deepEqual(referenced.blockedClaims, ['ratio']);
});

test('event targets and camera ids are not treated as on-screen numbers', () => {
  const mentions = extractNumberMentions({ scenes: [{ type: 'title', duration: 2, text: 'Hook', events: [{ at: 0.5, kind: 'reveal', target: 'level-2' }], camera: { move: 'track', target: 'station-2' } }] });
  assert.deepEqual(mentions, []);
});

test('capture and retrieval labels are provenance, not claims', () => {
  const mentions = extractNumberMentions({ scenes: [{ type: 'evidence', duration: 2, date: 'captured 11 Nov 2026', claim: 'Published Nov 4, 2026' }] });
  assert.deepEqual(mentions.map(item => item.value).sort(), [2026, 4]);
});
