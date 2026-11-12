import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { openMotionPage, loadRequirements } from '../motion.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = new URL('../../../output/v2/breaking/', import.meta.url);
await mkdir(output, { recursive: true });
const specPath = process.argv[2] ?? new URL('../../motion-examples/breaking.json', import.meta.url).pathname;
const example = JSON.parse(await readFile(specPath, 'utf8'));
const baseline = JSON.parse(execFileSync('git', ['show', '0376834:chatgpt-site/motion-examples/breaking.json'], { cwd: root, encoding: 'utf8' }));
const entry = `import {breakingStyle} from './src/motion/styles/breaking/index.ts';
import {parseReelSpec,lintReel} from './src/motion/spec.ts';
import {resolveSceneEvents,renderReel} from './src/motion/player.ts';
window.breakingQA={breakingStyle,parseReelSpec,lintReel,resolveSceneEvents,renderReel};`;
const { browser, page } = await openMotionPage();
try {
  await loadRequirements(page, example, specPath);
  const bundle = await build({ stdin: { contents: entry, resolveDir: root }, bundle: true, write: false, format: 'iife', target: 'es2022' });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const report = await page.evaluate(({ example }) => {
    const { breakingStyle: style, parseReelSpec, lintReel, resolveSceneEvents } = window.breakingQA;
    const checks = [];
    const check = (name, condition) => { if (!condition) throw new Error(name); checks.push(name); };
    const parsed = parseReelSpec(example);
    check(`example parses: ${JSON.stringify(parsed.ok ? [] : parsed.errors)}`, parsed.ok);
    const lint = lintReel(example);
    check('no lint errors', lint.every(item => item.level !== 'error'));
    check('all 22 shared scenes are skinned', Object.keys(style.scenes).length === 22);
    check('six bounded specials', Object.keys(style.specials).length === 6);
    check('Anton loaded', document.fonts.check('400 64px "Breaking Anton"'));
    check('Archivo loaded', document.fonts.check('700 64px "Breaking Archivo"'));
    const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1920;
    const ctx = canvas.getContext('2d');
    let depth = 0, text = [];
    const save = ctx.save.bind(ctx), restore = ctx.restore.bind(ctx), fillText = ctx.fillText.bind(ctx);
    ctx.save = () => { depth++; save(); };
    ctx.restore = () => { depth--; check('context restore is paired', depth >= 0); restore(); };
    ctx.fillText = (value, left, top, ...rest) => {
      if (ctx.globalAlpha > 0.3 && String(value).trim()) {
        const measured = ctx.measureText(value), matrix = ctx.getTransform();
        const size = Number(ctx.font.match(/([\d.]+)px/)?.[1]);
        const points = [[left, top], [left + measured.width, top + size * 1.14]].map(([x, y]) => ({ x: matrix.a * x + matrix.c * y + matrix.e, y: matrix.b * x + matrix.d * y + matrix.f }));
        text.push({ value: String(value), size, left: Math.min(...points.map(point => point.x)), right: Math.max(...points.map(point => point.x)), top: Math.min(...points.map(point => point.y)), bottom: Math.max(...points.map(point => point.y)) });
      }
      return fillText(value, left, top, ...rest);
    };
    const specialFixtures = {
      alert: { headline: 'ROOT BUGS', kicker: 'OPENAI SAYS', deck: 'LOCAL ACCESS' },
      headline: { kicker: 'MODEL', headline: 'UNRELEASED MODEL', deck: 'CYBER RESEARCH' },
      bignumber: { number: '948', label: 'DISTINCT BUGS', comparison: 'ONE RUN', attribution: 'OPENAI REPORTED' },
      cutout: { name: 'ILLUSTRATION', deck: 'NOT LIVE FOOTAGE' },
      ticker: { title: 'SNAPSHOT', headlines: ['61 UPSTREAM', '43 STAGED'], attribution: 'NOT ALL FIXED' },
      verdict: { claim: 'REMOTE TAKEOVER?', verdict: 'MISLEADING', explanation: 'LOCAL ACCESS REQUIRED', attribution: 'RESEARCH SNAPSHOT' },
    };
    const fixtures = Object.fromEntries(example.scenes.filter(scene => scene.type !== 'special').map(scene => [scene.type, scene]));
    Object.assign(fixtures, {
      kinetic: { words: ['LOCAL', 'ROOT', 'PATCH'] }, compare: { left: { label: 'FOUND', points: ['948 BUGS'] }, right: { label: 'FIXED', points: ['61 UPSTREAM'] } },
      list: { items: ['DISCOVER', 'VALIDATE', 'REVIEW'] }, changelog: { version: 'SNAPSHOT', items: [{ tag: 'FIX', text: '61 UPSTREAM' }, { tag: 'NEXT', text: '43 STAGED' }] },
      terminal: { lines: [{ cmd: 'whoami', out: 'user' }, { cmd: 'exploit', out: 'root' }] }, code: { code: 'local access\nroot access' }, diff: { removed: ['USER'], added: ['ROOT'] },
      chat: { messages: [{ role: 'user', text: 'LOCAL ACCESS' }, { role: 'ai', text: 'ROOT ACCESS' }] }, tokens: { text: 'ROOT', predict: [{ token: 'PATCH', p: 0.75 }] },
      grid: { rows: 16, cols: 16 }, predict: { question: 'HOW MANY BUGS?', guesses: ['166', '948'], answer: '948', comparison: { label: 'JULY', value: '166' }, correction: 'DISTINCT BUGS' },
      quantity: { quantity: 948, subset: 61, unit: 'BUGS', comparator: { value: 43, label: 'STAGED' } },
      scale: { reference: 'JULY', unit: 'API CREDITS', levels: [{ label: 'JULY', value: 513690 }, { label: 'OCTOBER', value: 1213430 }] },
    });
    const samples = [];
    let renderChecks = 0;
    const renderScene = (scene, time, mode, collect = false) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0); text = [];
      const frame = { ctx, t: time, dur: scene.duration ?? 2.4, index: 0, seed: 17, opening: false, events: resolveSceneEvents(scene), hits: scene.hits ?? [], style: 'breaking', theme: style.theme(mode, 'red'), assets: {} };
      ctx.save();
      style.background(frame);
      if (scene.type === 'special') style.specials[scene.kind].render(frame, scene);
      else style.scenes[scene.type].render(frame, scene);
      if (scene.caption) style.caption(frame, { text: Array.isArray(scene.caption) ? scene.caption[0] : scene.caption, start: 0, end: frame.dur }, time);
      ctx.restore();
      check('canvas state balances', depth === 0);
      for (const item of text) {
        check(`${scene.type} uses at least 64px text: ${item.value}`, item.size >= 64);
        check(`${scene.type} safe text: ${item.value}`, item.left >= 96 && item.right <= 900 && item.top >= 288 && item.bottom <= 1240);
        check(`${scene.type} does not truncate: ${item.value}`, !item.value.includes('…'));
      }
      const words = text.reduce((total, item) => total + (item.value.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0), 0);
      if (collect) samples.push({ type: scene.type, time, mode, words, text: text.map(item => item.value) });
      renderChecks++;
      return text.map(item => item.value).join('|');
    };
    for (const mode of ['light', 'dark']) {
      for (const [type, props] of Object.entries(fixtures)) {
        const scene = { ...props, type, duration: 2.4, events: [{ at: 0.8, kind: 'reveal' }, { at: 1.6, kind: 'resolve' }] };
        const original = JSON.stringify(scene);
        for (const time of [0, 0.8, 1.1, 1.6, 2.3]) renderScene(scene, time, mode);
        check(`${type} does not mutate props`, original === JSON.stringify(scene));
      }
      for (const [kind, data] of Object.entries(specialFixtures)) {
        check(`${kind} validates data`, style.specials[kind].schema.safeParse(data).success);
        check(`${kind} rejects empty data`, !style.specials[kind].schema.safeParse({}).success);
        check(`${kind} rejects unknown fields`, !style.specials[kind].schema.safeParse({ ...data, forbidden: true }).success);
        for (const time of [0, 0.8, 1.6, 2.3]) renderScene({ type: 'special', kind, data, duration: 2.4 }, time, mode);
      }
      for (const scene of example.scenes) for (let time = 0; time < scene.duration; time += 0.1) renderScene(scene, time, mode, true);
    }
    check('example stays within 14 rendered words', samples.every(sample => sample.words <= 14));
    const image = document.createElement('canvas'); image.width = 300; image.height = 400;
    image.getContext('2d').fillRect(0, 0, 300, 400);
    let imageDraws = 0;
    const drawImage = ctx.drawImage.bind(ctx);
    ctx.drawImage = (...args) => { imageDraws++; return drawImage(...args); };
    const frame = { ctx, t: 1.2, dur: 2.4, index: 0, seed: 17, events: [{ at: 0.8, kind: 'highlight' }], hits: [], theme: style.theme('light', 'red'), assets: { evidence: image } };
    style.scenes.evidence.render(frame, { asset: 'evidence', rect: { x: 20, y: 40, w: 180, h: 160 }, claim: 'EXACT CROP', source: 'SOURCE', date: 'SNAPSHOT' });
    check('image evidence draws its source crop', imageDraws === 1);
    for (const accent of ['red', 'yellow', 'lime', 'orange', 'blue', 'magenta']) check(`${accent} renders deterministically`, window.motion.shot({ ...example, accent }, 0) === window.motion.shot({ ...example, accent }, 0));
    const eventPoints = []; let duration = 0;
    for (const scene of example.scenes) { eventPoints.push(duration, ...resolveSceneEvents(scene).map(event => duration + event.at)); duration += scene.duration; }
    const rates = Array.from({ length: Math.ceil((duration - 10) * 4) + 1 }, (_, index) => { const start = Math.min(duration - 10, index / 4); return eventPoints.filter(point => point >= start && point < start + 10).length; });
    return { assertionCount: checks.length, renderChecks, lint, duration, narrationWords: example.scenes.map(scene => scene.say).join(' ').split(/\s+/).length, words: { min: Math.min(...samples.map(sample => sample.words)), max: Math.max(...samples.map(sample => sample.words)), mean: samples.reduce((sum, sample) => sum + sample.words, 0) / samples.length }, eventRatePer10Seconds: { min: Math.min(...rates), max: Math.max(...rates) }, maximumEventGap: Math.max(...eventPoints.slice(1).map((point, index) => point - eventPoints[index]), duration - eventPoints.at(-1)), samples };
  }, { example });
  assert.ok(report.renderChecks > 500);
  await writeFile(new URL('breaking-style-qa.json', output), JSON.stringify(report, null, 2));
  for (let start = 0; start < report.duration; start += 10) {
    const times = Array.from({ length: Math.min(20, Math.ceil((report.duration - start) * 2)) }, (_, index) => start + index / 2);
    const sheet = await page.evaluate(async ({ spec, times }) => {
      const canvas = document.createElement('canvas'); canvas.width = 5 * 224; canvas.height = Math.ceil(times.length / 5) * 414;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#444'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (const [index, time] of times.entries()) {
        const image = new Image(); image.src = 'data:image/png;base64,' + window.motion.shot(spec, time, 0.2); await image.decode();
        const left = index % 5 * 224 + 4, top = Math.floor(index / 5) * 414 + 4;
        ctx.drawImage(image, left, top); ctx.fillStyle = '#fff'; ctx.font = '16px monospace'; ctx.fillText(`${time.toFixed(1)}s`, left, top + 402);
      }
      return canvas.toDataURL('image/png').split(',')[1];
    }, { spec: example, times });
    await writeFile(new URL(`contact-${String(start).padStart(2, '0')}.png`, output), Buffer.from(sheet, 'base64'));
  }
  const oldBundle = await build({ stdin: { contents: entry, resolveDir: root }, bundle: true, write: false, format: 'iife', target: 'es2022', plugins: [{ name: 'frozen-breaking-baseline', setup(builder) { builder.onLoad({ filter: /motion\/styles\/breaking\/.*\.ts$/ }, args => ({ contents: execFileSync('git', ['show', `0376834:chatgpt-site/${args.path.slice(root.length)}`], { cwd: root, encoding: 'utf8' }), loader: 'ts' })); } }] });
  await page.addScriptTag({ content: oldBundle.outputFiles[0].text });
  await loadRequirements(page, baseline, new URL('../../motion-examples/breaking.json', import.meta.url).pathname);
  report.baseline = await page.evaluate(spec => {
    const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1920;
    const ctx = canvas.getContext('2d'), fillText = ctx.fillText.bind(ctx); let count = 0;
    ctx.fillText = (value, ...args) => { if (ctx.globalAlpha > 0.3) count += String(value).match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0; return fillText(value, ...args); };
    const duration = spec.scenes.reduce((sum, scene) => sum + scene.duration, 0), words = [];
    for (let time = 0; time < duration; time += 0.5) { count = 0; window.breakingQA.renderReel(ctx, spec, time, {}); words.push(count); }
    return { authoredDuration: duration, explicitEvents: spec.scenes.reduce((sum, scene) => sum + (scene.events?.length ?? 0), 0), implicitEntrancesPer10Seconds: spec.scenes.length / duration * 10, words: { min: Math.min(...words), max: Math.max(...words), mean: words.reduce((sum, value) => sum + value, 0) / words.length }, caveat: 'Draw-call inventory includes partially clipped ticker text; use the supplied audit for perceived baseline words. No baseline word-aligned events were authored.' };
  }, baseline);
  await writeFile(new URL('breaking-style-qa.json', output), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, samples: `${report.samples.length} retained in breaking-style-qa.json` }, null, 2));
} finally {
  await browser.close();
}
