// Local landscape library proofs. Requires the same Chrome and FFmpeg as motion.mjs.
import { openMotionPage } from './motion.mjs';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const [action, name, out, at = '0'] = process.argv.slice(2);
const width = Number(process.env.SKY_WIDTH ?? 1920),
  fps = 30;
if (!['shot', 'render'].includes(action) || !name || !out || !Number.isFinite(Number(at)))
  throw new Error('Usage: node scripts/sky-study.mjs shot|render <study|sampler> <output> [seconds]');
if (!Number.isSafeInteger(width) || width < 32 || width % 32 !== 0)
  throw new Error('SKY_WIDTH must be a positive multiple of 32 for 16:9 H.264');
const { browser, page } = await openMotionPage('src/mysteries-of-the-sky/render-page.ts');
try {
  const choices = await page.evaluate(() => window.skyStudy.durations);
  if (!Object.hasOwn(choices, name)) throw new Error('Choose a study: ' + Object.keys(choices).join(', '));
  async function frame(t, mime) {
    const pixels = await page.evaluate((args) => window.skyStudy.frame(...args), [name, t, width, mime]);
    return Buffer.from(pixels, 'base64');
  }
  if (action === 'shot') {
    await writeFile(out, await frame(Number(at), 'image/png'));
  } else {
    async function* frames() {
      for (let i = 0; i < Math.ceil(choices[name] * fps); i++) yield await frame(i / fps, 'image/jpeg');
    }
    const encoder = spawn(
      'ffmpeg',
      [
        '-v',
        'error',
        '-y',
        '-f',
        'image2pipe',
        '-framerate',
        String(fps),
        '-i',
        'pipe:0',
        '-c:v',
        'libx264',
        '-crf',
        '17',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        out,
      ],
      { stdio: ['pipe', 'ignore', 'inherit'] },
    );
    try {
      await Promise.all([
        new Promise((resolve, reject) => {
          encoder.once('error', reject);
          encoder.once('close', (code) =>
            code === 0 ? resolve() : reject(new Error('ffmpeg exited with ' + code)),
          );
        }),
        pipeline(Readable.from(frames()), encoder.stdin),
      ]);
    } finally {
      if (encoder.exitCode === null) encoder.kill();
    }
  }
} finally {
  await browser.close();
}
