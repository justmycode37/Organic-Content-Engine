import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openMotionPage, loadRequirements } from '../motion.mjs';
import { parseReelSpec, lintReel } from '../../src/motion/spec.ts';
import { placeScenes } from '../../src/motion/core.ts';
import { resolveSceneEvents } from '../../src/motion/player.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const destination = resolve(root, 'output/v2/miniworld');
await mkdir(destination, { recursive: true });
const specPath = resolve(root, 'chatgpt-site/motion-examples/miniworld.json');
const example = JSON.parse(await readFile(specPath, 'utf8'));
const parsed = parseReelSpec(example);
if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
const lint = lintReel(parsed.spec);
if (lint.some(item => item.level === 'error')) throw new Error(JSON.stringify(lint));
const duration = example.scenes.reduce((sum, scene) => sum + scene.duration, 0);
const times = Array.from({ length: Math.ceil(duration * 2) }, (_, index) => index / 2);
const { browser, page } = await openMotionPage();
let result;
try {
  await loadRequirements(page, example, specPath);
  result = await page.evaluate(async ({ spec, times }) => {
    const original = CanvasRenderingContext2D.prototype.fillText;
    let text = [];
    CanvasRenderingContext2D.prototype.fillText = function (value, ...args) {
      const matrix = this.getTransform();
      text.push({ value, size: Number(this.font.match(/([\d.]+)px/)?.[1] ?? 0) * Math.hypot(matrix.a, matrix.b) });
      return original.call(this, value, ...args);
    };
    const frames = [], sheets = [];
    let sheet, context;
    for (const [index, time] of times.entries()) {
      text = [];
      const png = window.motion.shot(spec, time);
      const drawn = [...text];
      window.motion.shot(spec, Math.max(0, time - 0.37));
      if (png !== window.motion.shot(spec, time)) throw new Error(`Nondeterministic frame at ${time}`);
      frames.push({ time, wordCount: drawn.reduce((count, item) => count + (item.value.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0), 0), text: drawn });
      if (index % 12 === 0) {
        sheet = document.createElement('canvas'); sheet.width = 1348; sheet.height = 840;
        context = sheet.getContext('2d'); context.fillStyle = '#303536'; context.fillRect(0, 0, sheet.width, sheet.height);
      }
      const image = new Image(); image.src = `data:image/png;base64,${png}`; await image.decode();
      const position = index % 12, left = 8 + position % 6 * 224, top = 8 + Math.floor(position / 6) * 416;
      context.drawImage(image, left, top, 216, 384);
      context.fillStyle = '#fff'; context.font = '18px sans-serif'; context.fillText(`${time}s`, left, top + 407);
      if (position === 11 || index === times.length - 1) sheets.push(sheet.toDataURL('image/png').split(',')[1]);
    }
    CanvasRenderingContext2D.prototype.fillText = original;
    return { frames, sheets };
  }, { spec: example, times });
  for (const [index, sheet] of result.sheets.entries()) await writeFile(resolve(destination, `contact-${index + 1}.png`), Buffer.from(sheet, 'base64'));
  const events = [];
  for (const scene of placeScenes(example)) for (const event of resolveSceneEvents(scene.spec)) {
    const before = Math.max(scene.start, scene.start + event.at - 0.05);
    const after = Math.min(scene.end - 0.01, scene.start + event.at + 0.35);
    const hashes = [];
    for (const time of [before, after]) hashes.push(createHash('sha256').update(await page.evaluate(({ spec, time }) => window.motion.shot(spec, time), { spec: example, time })).digest('hex'));
    events.push({ scene: scene.index, target: event.target, at: event.at, changed: hashes[0] !== hashes[1] });
  }
  const { sheets, ...report } = result;
  await writeFile(resolve(destination, 'browser-qa.json'), JSON.stringify({ lint, duration, deterministicFrames: times.length, maximumDrawnWords: Math.max(...report.frames.map(frame => frame.wordCount)), events, ...report }, null, 2));
  console.log(`Verified ${times.length} deterministic half-second frames and ${events.length} event pairs. Maximum drawn words: ${Math.max(...report.frames.map(frame => frame.wordCount))}.`);
} finally { await browser.close(); }
