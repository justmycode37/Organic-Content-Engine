// Checks the deploy format Sites requires: an ES module Worker exporting default.fetch, with no runtime imports it cannot resolve.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const [source, built, manifest] = await Promise.all([
  readFile(resolve(root, 'dist/server/index.js'), 'utf8'),
  readFile(resolve(root, 'dist/.openai/hosting.json'), 'utf8'),
  readFile(resolve(root, '.openai/hosting.json'), 'utf8'),
]);

const hosting = JSON.parse(built);
assert.equal(built, manifest, 'dist manifest must match the source manifest');
assert.match(hosting.project_id, /^appgprj_/, 'project_id is missing');
assert.equal(hosting.static, undefined, 'Worker builds must not declare static');
assert.equal(hosting.d1, 'DB', 'the D1 binding must be DB');

const imports = [...source.matchAll(/(?:^|[;}\s])import\s*(?:[\w${},*\s]+from\s*)?["']([^"']+)["']/g)].map((m) => m[1]);
assert.deepEqual(imports, [], `Worker must have no unresolved imports: ${imports.join(', ')}`);

const worker = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
assert.equal(typeof worker.default?.fetch, 'function', 'dist/server/index.js must export default.fetch');
console.log('Artifact is valid ESM, exports default.fetch, and declares project_id and D1 binding DB');
