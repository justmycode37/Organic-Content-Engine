import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openMotionPage } from './motion.mjs';

test('every landscape study renders motion and supports deterministic frame seeking', async () => {
  const { browser, page } = await openMotionPage('src/mysteries-of-the-sky/render-page.ts');
  try {
    const results = await page.evaluate(() => {
      const { frame, durations } = window.skyStudy;
      let offset = 0;
      return Object.entries(durations)
        .filter(([name]) => name !== 'sampler')
        .map(([name, duration]) => {
          const draw = (id, t) => frame(id, t, 320, 'image/png');
          const first = draw(name, 0),
            middle = draw(name, duration * 0.51),
            last = draw(name, duration);
          const boundary = draw('sampler', offset);
          offset += duration;
          return {
            name,
            moves: first !== last,
            seek: middle === draw(name, duration * 0.51),
            boundary: first === boundary,
            clamps: first === draw(name, -1) && last === draw(name, duration + 1),
          };
        });
    });
    for (const result of results) {
      for (const field of ['moves', 'seek', 'boundary', 'clamps'])
        assert.ok(result[field], result.name + ' ' + field);
    }
  } finally {
    await browser.close();
  }
});
