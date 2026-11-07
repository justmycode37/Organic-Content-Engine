import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConfigError, loadConfig } from '../src/config.ts';

test('defaults are safe: dry run, loopback, no credentials', () => {
  const config = loadConfig({});
  assert.equal(config.publishMode, 'dry_run');
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.apiToken, null);
  assert.equal(config.generator.kind, 'template');
});

test('API_TOKEN is required in production and on non-loopback hosts', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), ConfigError);
  assert.throws(() => loadConfig({ HOST: '0.0.0.0' }), ConfigError);
  assert.equal(loadConfig({ HOST: '0.0.0.0', API_TOKEN: 'x'.repeat(32) }).host, '0.0.0.0');
});

test('short API_TOKEN is rejected and the error does not echo it', () => {
  assert.throws(() => loadConfig({ API_TOKEN: 'hunter2' }), (error: Error) => {
    assert.match(error.message, /API_TOKEN/);
    assert.doesNotMatch(error.message, /hunter2/);
    return true;
  });
});

test('credential-bearing URLs must be https except on loopback', () => {
  assert.throws(() => loadConfig({ MASTODON_INSTANCE_URL: 'http://social.test' }), ConfigError);
  assert.throws(() => loadConfig({ PUBLISHING_GATEWAY_URL: 'http://gw.test/publish' }), ConfigError);
  assert.equal(loadConfig({ PUBLISHING_GATEWAY_URL: 'http://localhost:9000/p' }).gateway.url, 'http://localhost:9000/p');
});

test('unknown gateway platforms fail at startup', () => {
  assert.throws(() => loadConfig({ PUBLISHING_GATEWAY_PLATFORMS: 'tiktok,myspace' }), /myspace/);
});

test('blank values count as unset and secrets are collected for redaction', () => {
  const config = loadConfig({ X_USER_ACCESS_TOKEN: '  ', BLUESKY_APP_PASSWORD: 'pw-secret' });
  assert.equal(config.x.accessToken, null);
  assert.deepEqual(config.secrets, ['pw-secret']);
});
