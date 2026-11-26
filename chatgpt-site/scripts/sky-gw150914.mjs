import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { openMotionPage } from './motion.mjs';
import { renderSkyChapters } from './sky-render-chapters.mjs';

const work = resolve(process.argv[2]);
const scenes = { 1: 'cover', 2: 'distances', 3: 'optics', 4: 'plot', 5: 'binary', 6: 'recording', 16: 'credits' };
const ids = process.argv.length > 3 ? process.argv.slice(3).map(Number) : Object.keys(scenes).map(Number);
const edit = Object.fromEntries(ids.map((id) => [id, '0 ' + scenes[id]]));
if (ids.includes(1)) {
  const aligned = JSON.parse(readFileSync(join(work, '01.words.json'), 'utf8'));
  const late = aligned.words.find(({ type, text }) => type === 'word' && text.toLowerCase() === 'less');
  if (!late) throw new Error('Could not match the second observation in chapter 1');
  edit[1] += ',' + late.start + ' sites';
}
await renderSkyChapters({
  work, ids, edit, archives: {}, entry: 'gw150914', frameMethod: 'gw150914Frame', pads: { 6: 3.4 },
});

if (ids.includes(1)) {
  const { browser, page } = await openMotionPage('src/mysteries-of-the-sky/episodes/gw150914.ts');
  try {
    const frame = await page.evaluate(() => window.gw150914Frame('thumbnail', 0, { duration: 1 }, 'image/png'));
    writeFileSync(join(work, '../The Chirp That Crossed Earth - Thumbnail.png'), Buffer.from(frame, 'base64'));
  } finally {
    await browser.close();
  }
}
