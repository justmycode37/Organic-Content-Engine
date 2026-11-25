import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { openMotionPage } from './motion.mjs';
import { renderSkyChapters } from './sky-render-chapters.mjs';

const work = resolve(process.argv[2]);
const plan = {
  1: ['hook', ['spacecraft crossing', 'groove']],
  2: ['scan', ['repeat the scan', 'repeat']],
  3: ['tugs', ['the ice keeps orbiting', 'evidence'], ['but some of the waves', 'mystery']],
  4: ['mode', ['now imagine lifting', 'parcel']],
  5: ['compare', ['extending the gradual', 'wide'], ['in the models that fit', 'match']],
  6: ['finale'],
  16: ['credits'],
};
const clean = (text) => text.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
const ids = process.argv.length > 3 ? process.argv.slice(3).map(Number) : Object.keys(plan).map(Number);
const edit = {};
for (const id of ids) {
  const tag = String(id).padStart(2, '0');
  const [intro, ...cuts] = plan[id];
  const times = ['0 ' + intro];
  if (cuts.length) {
    const { words } = JSON.parse(readFileSync(join(work, tag + '.words.json'), 'utf8'));
    const recorded = words.filter(({ type }) => type === 'word');
    const normalized = recorded.map(({ text }) => clean(text));
    for (const [phrase, scene] of cuts) {
      const terms = phrase.split(' ');
      const index = normalized.findIndex((_, i) => terms.every((term, j) => term === normalized[i + j]));
      if (index < 0) throw new Error('Missing recorded cue in ' + tag + ': ' + phrase);
      times.push(recorded[index].start + ' ' + scene);
    }
  }
  edit[id] = times.join(',');
}
await renderSkyChapters({ work, edit, ids, archives: {}, entry: 'saturn-rings', frameMethod: 'saturnRingsFrame' });

if (ids.includes(1)) {
  const { browser, page } = await openMotionPage('src/mysteries-of-the-sky/episodes/saturn-rings.ts');
  try {
    const frame = await page.evaluate(() => window.saturnRingsFrame('thumbnail', 0, { duration: 1 }, 'image/png'));
    writeFileSync(join(work, '../How Saturn’s Rings Heard Its Core - Thumbnail.png'), Buffer.from(frame, 'base64'));
  } finally {
    await browser.close();
  }
}
