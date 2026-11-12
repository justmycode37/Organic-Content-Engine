import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { loadRequirements, openMotionPage } from '../motion.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = fileURLToPath(new URL('../../../output/v2/bigidea/', import.meta.url));
await mkdir(output, { recursive: true });
const example = JSON.parse(await readFile(`${root}motion-examples/bigidea.json`, 'utf8'));
const baseline = JSON.parse(execFileSync('git', ['show', '0376834:chatgpt-site/motion-examples/bigidea.json'], { cwd: root, encoding: 'utf8' }));
const fixtures = {};
fixtures.diff = { filename: 'boundary.c', removed: ['return unsafe;'], added: ['return checked;'] };
for (const file of await readdir(`${root}motion-examples`)) {
  if (!file.endsWith('.json')) continue;
  const spec = JSON.parse(await readFile(`${root}motion-examples/${file}`, 'utf8'));
  for (const scene of spec.scenes ?? []) if (scene.type !== 'special') fixtures[scene.type] ??= scene;
}
const { browser, page } = await openMotionPage();
try {
  await loadRequirements(page, example, `${root}motion-examples/bigidea.json`);
  const bundle = (await build({ stdin: {
    contents: "import {bigideaStyle} from './src/motion/styles/bigidea/index.ts'; import {parseReelSpec,lintReel} from './src/motion/spec.ts'; import {renderReel,resolveSceneEvents} from './src/motion/player.ts'; window.bigideaQA={bigideaStyle,parseReelSpec,lintReel,renderReel,resolveSceneEvents};",
    resolveDir: root, loader: 'ts',
  }, bundle: true, write: false, format: 'iife', target: 'es2022' })).outputFiles[0].text;
  await page.addScriptTag({ content: bundle });
  const result = await page.evaluate(({ example, baseline, fixtures }) => {
    const { bigideaStyle: style, parseReelSpec, lintReel, renderReel, resolveSceneEvents } = window.bigideaQA;
    const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1920;
    const ctx = canvas.getContext('2d');
    let depth = 0, words = 0, minimumFont = Infinity, maximumWords = 0, samples = 0;
    const errors = [];
    const save = ctx.save.bind(ctx), restore = ctx.restore.bind(ctx), fillText = ctx.fillText.bind(ctx);
    ctx.save = () => { depth++; save(); };
    ctx.restore = () => { depth--; restore(); if (depth < 0) errors.push('Canvas restore without save'); };
    ctx.fillText = (text, ...args) => {
      if (String(text).trim()) {
        words += String(text).match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0;
        minimumFont = Math.min(minimumFont, Number(ctx.font.match(/([\d.]+)px/)?.[1] ?? Infinity));
      }
      fillText(text, ...args);
    };
    const duration = example.scenes.reduce((sum, scene) => sum + scene.duration, 0);
    for (let time = 0; time < duration; time += .1) {
      words = 0;
      renderReel(ctx, example, time);
      maximumWords = Math.max(maximumWords, words);
      if (depth !== 0) errors.push(`Unbalanced example at ${time}`);
      samples++;
    }
    const exampleMinimumFont = minimumFont;
    const specials = {
      cover: { headline: 'One idea.', emphasis: 'idea.' }, numeral: { value: '948', meaning: 'Bugs' },
      contrast: { before: { value: '166', label: 'Exploits' }, after: { value: '948', label: 'Bugs' } },
      quote: { text: 'One thought.\nOne motif.', attribution: 'Fixture' },
      object: { motif: 'dot', line: 'One machine' }, statement: { text: 'Before.\nAfter.' },
    };
    for (const [kind, special] of Object.entries(style.specials)) {
      if (!special.schema.safeParse(specials[kind]).success) errors.push(`Invalid ${kind} fixture`);
      if (special.schema.safeParse({ ...specials[kind], unexpected: true }).success) errors.push(`Non-strict ${kind}`);
      if (special.schema.safeParse({}).success) errors.push(`Empty ${kind} accepted`);
    }
    for (const mode of ['light', 'dark']) for (const time of [0, .2, .7, 1.3, 2.1]) {
      const frame = { ctx, t: time, dur: 2.4, theme: style.theme(mode, 'red'), index: 0, seed: 7919, style: 'bigidea', assets: {}, opening: true, hits: [.7], events: [{ at: .6, kind: 'transform' }, { at: 1.2, kind: 'resolve' }] };
      for (const [name, scene] of Object.entries(style.scenes)) {
        if (!fixtures[name]) { errors.push(`Missing ${name} fixture`); continue; }
        scene.render(frame, fixtures[name]); samples++;
      }
      for (const [kind, special] of Object.entries(style.specials)) { special.render(frame, { type: 'special', kind, data: specials[kind] }); samples++; }
      if (depth !== 0) errors.push(`Unbalanced fixture at ${time}`);
    }
    const metrics = spec => {
      const points = []; let cursor = 0, declared = 0;
      for (const scene of spec.scenes) {
        points.push(cursor);
        for (const event of resolveSceneEvents(scene)) { points.push(cursor + event.at); declared++; }
        cursor += scene.duration;
      }
      points.sort((left, right) => left - right);
      const span = Math.min(10, cursor), rates = [];
      for (let start = 0; start <= cursor - span + .001; start += .25) rates.push(points.filter(point => point >= start && point < start + span).length * 10 / span);
      return { duration: cursor, scenes: spec.scenes.length, declaredEvents: declared, eventsPerTenSeconds: { min: Math.min(...rates), max: Math.max(...rates) }, maximumEventGap: Math.max(...points.slice(1).map((point, index) => point - points[index]), cursor - points.at(-1)), narrationWords: spec.scenes.reduce((sum, scene) => sum + (scene.say?.split(/\s+/).length ?? 0), 0) };
    };
    return { parsed: parseReelSpec(example), lint: lintReel(example), sharedTypes: Object.keys(style.scenes).length, strictSpecials: Object.keys(style.specials).length, samples, maximumDrawnWords: maximumWords, minimumExampleFont: exampleMinimumFont, deterministic: window.motion.shot(example, 16.1, .2) === window.motion.shot(example, 16.1, .2), balanced: depth === 0, errors, before: metrics(baseline), after: metrics(example) };
  }, { example, baseline, fixtures });
  await writeFile(`${output}checks.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  assert.equal(result.parsed.ok, true);
  assert.equal(result.lint.filter(item => item.level === 'error').length, 0);
  assert.equal(result.sharedTypes, 22);
  assert.equal(result.strictSpecials, 6);
  assert.equal(result.deterministic, true);
  assert.equal(result.balanced, true);
  assert.deepEqual(result.errors, []);
  assert.ok(result.maximumDrawnWords <= 14);
  assert.ok(result.minimumExampleFont >= 64);
  const duration = example.scenes.reduce((sum, scene) => sum + scene.duration, 0);
  const times = Array.from({ length: Math.ceil(duration * 2) }, (_, index) => index / 2);
  for (let start = 0; start < times.length; start += 18) {
    const data = await page.evaluate(async ({ spec, times }) => {
      const sheet = document.createElement('canvas'); sheet.width = 1482; sheet.height = Math.ceil(times.length / 6) * 464;
      const ctx = sheet.getContext('2d'); ctx.fillStyle = '#444'; ctx.fillRect(0, 0, sheet.width, sheet.height);
      for (const [index, time] of times.entries()) {
        const image = new Image(); image.src = `data:image/png;base64,${window.motion.shot(spec, time, .22)}`; await image.decode();
        const left = index % 6 * 247, top = Math.floor(index / 6) * 464;
        ctx.drawImage(image, left, top); ctx.fillStyle = '#fff'; ctx.font = '18px monospace'; ctx.fillText(`${time.toFixed(1)}s`, left + 8, top + 448);
      }
      return sheet.toDataURL('image/png').split(',')[1];
    }, { spec: example, times: times.slice(start, start + 18) });
    await writeFile(`${output}half-second-${start / 18 + 1}.png`, Buffer.from(data, 'base64'));
  }
} finally { await browser.close(); }
