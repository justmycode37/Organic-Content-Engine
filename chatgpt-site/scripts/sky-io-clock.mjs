import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { openMotionPage } from './motion.mjs';
import { renderSkyChapters } from './sky-render-chapters.mjs';

const work = resolve(process.argv[2]);
const scenes = { 1: 'cover', 2: 'shadow', 3: 'map', 4: 'accumulate', 5: 'history', 16: 'credits' };
const ids = process.argv.length > 3 ? process.argv.slice(3).map(Number) : Object.keys(scenes).map(Number);
const edit = Object.fromEntries(ids.map((id) => [id, '0 ' + scenes[id]]));
const wordData = JSON.parse(readFileSync(join(work, '03.words.json'), 'utf8'));
const replay = wordData.words.find(({ type, text }) => type === 'word' && text.toLowerCase() === 'replay');
if (!replay) throw new Error('The aligned narration is missing the comparison cue');
if (ids.includes(3)) edit[3] += ',' + replay.start + ' compare';

const leads = {};
let previous;
for (const [key, scene] of Object.entries(scenes)) {
  const id = Number(key);
  if (previous) leads[id] = previous;
  if (id === 16) break;
  const tag = key.padStart(2, '0');
  const audioSeconds = Number(execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', join(work, tag + '.mp3'),
  ], {encoding: 'utf8'}));
  const frames = Math.ceil(24 * (audioSeconds + 0.32));
  previous = id === 3 ? { key: 'compare', frames: frames - Math.round(replay.start * 24) } : { key: scene, frames };
}
await renderSkyChapters({
  work, ids, edit, archives: {}, entry: 'io-clock', frameMethod: 'ioClockFrame', leads, creditsSeconds: 6,
});

if (ids.includes(1)) {
  const { browser, page } = await openMotionPage('src/mysteries-of-the-sky/episodes/io-clock.ts');
  try {
    const frame = await page.evaluate(() => window.ioClockFrame('thumbnail', 0.38, { duration: 1 }, 'image/png'));
    writeFileSync(join(work, '../The Moon That Ran Late - Thumbnail.png'), Buffer.from(frame, 'base64'));
  } finally {
    await browser.close();
  }
}
