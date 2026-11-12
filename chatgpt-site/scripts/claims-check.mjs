#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { checkClaims, claimsLedgerSchema } from '../src/motion/claims.ts';

function usage() {
  return 'Usage: node scripts/claims-check.mjs <spec.json> [--claims <ledger.json>] [--check-urls] [--format text|json|both]';
}

function parseArgs(args) {
  const options = { spec: null, ledger: null, checkUrls: false, format: 'both' };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--claims') options.ledger = args[++i];
    else if (arg === '--check-urls') options.checkUrls = true;
    else if (arg === '--format') options.format = args[++i];
    else if (arg === '--json') options.format = 'json';
    else if (arg === '--text') options.format = 'text';
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else if (!options.spec) options.spec = arg;
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  if (options.help) return options;
  if (!options.spec) throw new Error('Missing spec path');
  if (!['text', 'json', 'both'].includes(options.format)) throw new Error(`Invalid output format: ${options.format}`);
  return options;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function checkSourceUrl(url) {
  let response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
  let method = 'HEAD';
  if (response.status === 405 || response.status === 501) {
    await response.body?.cancel();
    response = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' }, redirect: 'follow' });
    method = 'GET';
  }
  await response.body?.cancel();
  return { url, method, status: response.status, ok: response.ok || response.status === 403 };
}

function formatText(report, specPath, ledgerPath) {
  const lines = [
    `Claim check ${report.ok ? 'PASS' : 'FAIL'}`,
    `Spec: ${specPath}`,
    `Ledger: ${ledgerPath}`,
    `Numbers checked: ${report.numbers.length}; unsupported: ${report.numbers.filter(item => !item.supported).length}`,
  ];
  for (const entry of report.errors) lines.push(`ERROR ${entry.code}${entry.path ? ` ${entry.path}` : ''}: ${entry.message}`);
  for (const entry of report.warnings) lines.push(`WARN ${entry.code}${entry.path ? ` ${entry.path}` : ''}: ${entry.message}`);
  for (const source of report.sourceChecks ?? []) {
    lines.push(`SOURCE ${source.status === null ? 'ERROR' : source.status} ${source.method ?? 'HEAD'} ${source.url}${source.error ? ` (${source.error})` : ''}`);
  }
  return lines.join('\n');
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n${usage()}\n`);
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const specPath = resolve(options.spec);
  const ledgerPath = resolve(options.ledger ?? `${specPath.replace(/\.json$/i, '')}.claims.json`);
  let spec;
  let ledger;
  try {
    [spec, ledger] = await Promise.all([readJson(specPath), readJson(ledgerPath)]);
  } catch (error) {
    process.stderr.write(`Cannot read spec or ledger: ${error.message}\n`);
    process.exitCode = 2;
    return;
  }

  const report = checkClaims(spec, ledger);
  report.sourceChecks = [];
  if (options.checkUrls) {
    const parsed = claimsLedgerSchema.safeParse(ledger);
    if (parsed.success) {
      const urls = [...new Set(parsed.data.claims.flatMap(claim => claim.sources.map(source => source.url)))];
      for (const url of urls) {
        try {
          const result = await checkSourceUrl(url);
          report.sourceChecks.push(result);
          if (result.status >= 400 && result.status !== 403) report.errors.push({ code: 'SOURCE_HTTP_ERROR', message: `${url} returned HTTP ${result.status}` });
        } catch (error) {
          report.sourceChecks.push({ url, method: null, status: null, ok: false, error: error.message });
          report.warnings.push({ code: 'SOURCE_UNREACHABLE', message: `${url}: ${error.message}` });
        }
      }
      report.ok = report.errors.length === 0;
    }
  }

  const rendered = formatText(report, basename(specPath), `${dirname(ledgerPath)}/${basename(ledgerPath)}`);
  if (options.format === 'text') process.stdout.write(`${rendered}\n`);
  else if (options.format === 'json') process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write(`${rendered}\n\nJSON report\n${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.ok ? 0 : 1;
}

main();
