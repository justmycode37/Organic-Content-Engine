import test from 'node:test';
import assert from 'node:assert/strict';
import { createRedactor } from '../src/logger.ts';

test('redacts secrets in raw errors and JSON-escaped log fields', () => {
  const secret = 'token"with\\escapes\nand-newline';
  const redact = createRedactor([secret]);
  assert.equal(redact(`Failure: ${secret}`), 'Failure: [REDACTED]');
  assert.deepEqual(JSON.parse(redact(JSON.stringify({ message: secret }))), { message: '[REDACTED]' });
});

test('overlapping configured secrets are redacted longest first', () => {
  assert.equal(createRedactor(['abcd', 'abcdefgh'])('abcdefgh abcd'), '[REDACTED] [REDACTED]');
});
