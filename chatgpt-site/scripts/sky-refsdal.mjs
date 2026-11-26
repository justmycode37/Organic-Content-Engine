// Produce episode chapters from the local voice, cameo and archive image files.
import { openMotionPage } from './motion.mjs';
import { readFile, writeFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';

const work = resolve(process.argv[2]);
const mode = process.argv[3] || 'render';
const selected = process.argv.slice(4).map(Number);
const chapterIds = selected.length ? selected : Array.from({ length: 16 }, (_, i) => i + 1);
const fps = 24;
const pad = (n) => String(n).padStart(2, '0');
const images = {};
for (const key of ['heic1505a', 'heic1505b', 'heic1525a']) {
  images[key] = 'data:image/jpeg;base64,' + (await readFile(join(work, key + '.jpg'))).toString('base64');
}
const duration = (file) =>
  Number(
    execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], {
      encoding: 'utf8',
    }).trim(),
  );
const { browser, page } = await openMotionPage('src/mysteries-of-the-sky/episodes/refsdal.ts');
await page.evaluate((img) => window.refsdal.load(img), images);
try {
  for (const ch of chapterIds) {
    const seconds = ch === 16 ? 10 : duration(join(work, pad(ch) + '.mp3')) + 0.36;
    const frames = Math.ceil(seconds * fps),
      file = join(work, 'video-' + pad(ch) + '.mp4');
    if (mode === 'proof') {
      for (const fraction of [0.14, 0.52, 0.88]) {
        const encoded = await page.evaluate(
          ([ch, t, d]) => window.refsdal.frame(ch, t, d),
          [ch, seconds * fraction, seconds],
        );
        await writeFile(
          join(work, 'qc-' + pad(ch) + '-' + fraction + '.jpg'),
          Buffer.from(encoded, 'base64'),
        );
      }
      continue;
    }
    if (
      mode === 'render' &&
      (await access(file).then(
        () => true,
        () => false,
      ))
    )
      continue;
    const tmp = file + '.part.mp4';
    const encoder = spawn(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-f',
        'image2pipe',
        '-framerate',
        String(fps),
        '-vcodec',
        'mjpeg',
        '-i',
        'pipe:0',
        '-an',
        '-c:v',
        'libx264',
        '-threads',
        '3',
        '-preset',
        'veryfast',
        '-crf',
        '21',
        '-maxrate',
        '1400k',
        '-bufsize',
        '2800k',
        '-pix_fmt',
        'yuv420p',
        '-colorspace',
        'bt709',
        '-color_primaries',
        'bt709',
        '-color_trc',
        'bt709',
        '-video_track_timescale',
        '24000',
        tmp,
      ],
      { stdio: ['pipe', 'inherit', 'inherit'] },
    );
    const done = new Promise((res, rej) => {
      encoder.once('error', rej);
      encoder.once('close', (n) => (n === 0 ? res() : rej(Error('ffmpeg ' + n))));
    });
    for (let f = 0; f < frames; f += 8) {
      const batch = await page.evaluate(
        ({ ch, f, n, frames, fps }) =>
          Array.from({ length: Math.min(8, frames - f) }, (_, j) =>
            window.refsdal.frame(ch, (f + j) / fps, n),
          ),
        { ch, f, n: seconds, frames, fps },
      );
      await new Promise((res, rej) =>
        encoder.stdin.write(Buffer.concat(batch.map((b) => Buffer.from(b, 'base64'))), (e) =>
          e ? rej(e) : res(),
        ),
      );
    }
    encoder.stdin.end();
    await done;
    const { rename } = await import('node:fs/promises');
    await rename(tmp, file);
    console.log('Rendered chapter', ch, frames, 'frames');
  }
} finally {
  await browser.close();
}
