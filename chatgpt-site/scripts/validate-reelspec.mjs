#!/usr/bin/env node
// Parse and lint a ReelSpec. Warnings are advisory; parser or lint errors fail.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { lintReel, parseReelSpec } from '../src/motion/spec.ts';

export function validateReelSpec(input) {
  const parsed = parseReelSpec(input);
  if (!parsed.ok) return { ok: false, parseErrors: parsed.errors, lint: [] };
  const lint = lintReel(parsed.spec);
  return { ok: !lint.some(item => item.level === 'error'), parseErrors: [], lint };
}

async function main() {
  const [specPath] = process.argv.slice(2);
  if (!specPath) throw new Error('Usage: node chatgpt-site/scripts/validate-reelspec.mjs <spec.json>');
  const result = validateReelSpec(JSON.parse(await readFile(specPath, 'utf8')));
  if (result.parseErrors.length) {
    process.stderr.write(`ReelSpec parse errors:\n${result.parseErrors.map(error => `- ${error}`).join('\n')}\n`);
    process.exitCode = 1;
    return;
  }
  for (const item of result.lint) process.stderr.write(`${item.level}${item.scene === undefined ? '' : ` scene ${item.scene}`}: ${item.message}\n`);
  if (result.ok) process.stdout.write('ReelSpec parses; no lint errors.\n');
  else process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
