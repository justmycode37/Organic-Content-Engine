import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { openMotionPage } from './motion.mjs';
import { renderSkyChapters } from './sky-render-chapters.mjs';

const work = resolve(process.argv[2]);
const plan = {
  1: ['cover'],
  2: ['observing', 'each', 'single'],
  3: ['register', 'average', 'average'],
  4: ['filters', 'this is the real', 'reveal'],
  16: ['credits'],
};
const ids = process.argv.length > 3 ? process.argv.slice(3).map(Number) : Object.keys(plan).map(Number);
const edit = {};
const leads = {};
let previous;
for (const [key, [opening, phrase, next]] of Object.entries(plan)) {
  const id = Number(key);
  if (previous) leads[id] = previous;
  edit[id] = '0 ' + opening;
  if (id === 16) break;
  const tag = key.padStart(2, '0');
  const audioSeconds = Number(execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', join(work, tag + '.mp3'),
  ], { encoding: 'utf8' }));
  let lastCut = 0;
  if (phrase) {
    const wordData = JSON.parse(readFileSync(join(work, tag + '.words.json'), 'utf8'));
    const words = wordData.words.filter(({ type }) => type === 'word');
    const cue = phrase.split(' ');
    const index = words.findIndex((_, i) => cue.every((word, j) => word === words[i + j]?.text.toLowerCase()));
    if (index < 0) throw new Error('Missing picture cue: ' + phrase);
    lastCut = words[index].start;
    edit[id] += ',' + lastCut + ' ' + next;
  }
  previous = { key: next ?? opening, frames: Math.ceil(24 * (audioSeconds + 0.32)) - Math.round(lastCut * 24) };
}
await renderSkyChapters({
  work, ids, edit, archives: {}, entry: 'hubble-deep-field', frameMethod: 'hubbleFieldFrame', leads, creditsSeconds: 6,
});

if (ids.includes(1)) {
  const { browser, page } = await openMotionPage('src/mysteries-of-the-sky/episodes/hubble-deep-field.ts');
  try {
    const frame = await page.evaluate(() => window.hubbleFieldFrame('thumbnail', 0.2, { duration: 12 }, 'image/png'));
    writeFileSync(join(work, '../The Sky That Looked Empty - Thumbnail.png'), Buffer.from(frame, 'base64'));
  } finally {
    await browser.close();
  }
}
