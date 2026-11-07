import assert from 'node:assert/strict';
import { test } from 'node:test';
import { enumerateSlots, zonedTimeToUtc } from '../src/services/slots.ts';

test('converts wall-clock time across DST boundaries', () => {
  assert.equal(zonedTimeToUtc(2026, 1, 15, 9, 0, 'America/New_York').toISOString(), '2026-01-15T14:00:00.000Z');
  assert.equal(zonedTimeToUtc(2026, 7, 15, 9, 0, 'America/New_York').toISOString(), '2026-07-15T13:00:00.000Z');
  assert.equal(zonedTimeToUtc(2026, 7, 15, 9, 0, 'Asia/Kolkata').toISOString(), '2026-07-15T03:30:00.000Z');
});

test('a time skipped by DST still resolves to a real instant', () => {
  // 02:30 does not exist in New York on 2026-03-08.
  const instant = zonedTimeToUtc(2026, 3, 8, 2, 30, 'America/New_York');
  assert.equal(Number.isNaN(instant.getTime()), false);
  assert.ok(instant.getTime() >= Date.parse('2026-03-08T06:30:00Z'));
  assert.ok(instant.getTime() <= Date.parse('2026-03-08T07:30:00Z'));
});

test('enumerates only matching weekdays within the window', () => {
  const from = new Date('2026-11-09T08:00:00Z'); // Monday
  const slots = enumerateSlots(from, 7, [{ days: [1, 5], time: '09:00' }], 'UTC');
  assert.deepEqual(slots.map((s) => s.toISOString()), [
    '2026-11-09T09:00:00.000Z',
    '2026-11-13T09:00:00.000Z',
  ]);
});

test('excludes a slot that has already passed today and de-duplicates', () => {
  const from = new Date('2026-11-09T10:00:00Z');
  const slots = enumerateSlots(from, 1, [{ days: [1, 2], time: '09:00' }, { days: [2], time: '09:00' }], 'UTC');
  assert.deepEqual(slots.map((s) => s.toISOString()), ['2026-11-10T09:00:00.000Z']);
});

test('weekday is evaluated in the configured timezone', () => {
  // 2026-11-09T02:00Z is still Sunday evening in New York.
  const slots = enumerateSlots(new Date('2026-11-09T02:00:00Z'), 1, [{ days: [0], time: '22:00' }], 'America/New_York');
  assert.deepEqual(slots.map((s) => s.toISOString()), ['2026-11-09T03:00:00.000Z']);
});
