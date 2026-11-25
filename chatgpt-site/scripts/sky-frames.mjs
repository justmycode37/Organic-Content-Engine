// Contact sheet of episode frames: node sky-frames.mjs <entry> <frameMethod> <out.jpg> key@t[@prev@prevT] ...
import { writeFile } from 'node:fs/promises';
import { openMotionPage } from './motion.mjs';
const [entry, method, out, ...specs] = process.argv.slice(2);
const { browser, page } = await openMotionPage('src/mysteries-of-the-sky/episodes/' + entry + '.ts');
try {
  const data = await page.evaluate(
    async ({ method, specs }) => {
      const cols = Math.min(4, specs.length),
        w = 480,
        h = 270,
        rows = Math.ceil(specs.length / cols);
      const sheet = document.createElement('canvas');
      sheet.width = cols * w;
      sheet.height = rows * (h + 22);
      const ctx = sheet.getContext('2d');
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, sheet.width, sheet.height);
      for (const [i, spec] of specs.entries()) {
        const [key, t, prev, prevT] = spec.split('@');
        const b64 = window[method](key, +t, { key, t: +t, prev, prevT: prev ? +prevT : 0, g: 30 + +t, left: 99 });
        const img = new Image();
        await new Promise((r) => ((img.onload = r), (img.src = 'data:image/jpeg;base64,' + b64)));
        const x = (i % cols) * w,
          y = Math.floor(i / cols) * (h + 22);
        ctx.drawImage(img, x, y, w, h);
        ctx.fillStyle = '#fff';
        ctx.font = '15px monospace';
        ctx.fillText(spec, x + 4, y + h + 16);
      }
      return sheet.toDataURL('image/jpeg', 0.88).split(',')[1];
    },
    { method, specs },
  );
  await writeFile(out, Buffer.from(data, 'base64'));
} finally {
  await browser.close();
}
