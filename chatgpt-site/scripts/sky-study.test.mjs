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

test('at 1080p the raster finish changes shell detail and preserves native glyph edges', async () => {
  const { browser, page } = await openMotionPage('src/mysteries-of-the-sky/render-page.ts');
  try {
    const comparison = await page.evaluate(() => {
      const proto = CanvasRenderingContext2D.prototype;
      const fill = proto.fillText;
      let ctx, native;
      // These two crops sit on the electron caption and the unoccluded outer shell at 2.5 s.
      const crops = [
        [863, 737, 127, 38],
        [590, 300, 100, 220],
      ];
      const pixels = () => crops.map((rect) => ctx.getImageData(...rect).data);
      proto.fillText = function (...args) {
        fill.apply(this, args);
        if (args[0] === 'Electron') {
          ctx = this;
          native = pixels();
        }
      };
      try {
        window.skyStudy.frame('electron', 2.5, 1920, 'image/png');
        return pixels().map((region, i) => region.every((value, j) => value === native[i][j]));
      } finally {
        proto.fillText = fill;
      }
    });
    assert.deepEqual(comparison, [true, false]);
  } finally {
    await browser.close();
  }
});
