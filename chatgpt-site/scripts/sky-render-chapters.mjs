import { openMotionPage } from './motion.mjs';
import { execFileSync, spawn } from 'node:child_process';
import { rename, access } from 'node:fs/promises';
import { join } from 'node:path';
import { once } from 'node:events';

export async function renderSkyChapters({ work, ids, edit, archives, entry, frameMethod }) {
  const fps = 24;
  const { browser, page } = await openMotionPage('src/mysteries-of-the-sky/episodes/' + entry + '.ts');
  try {
    for (const ch of ids) {
      const tag = String(ch).padStart(2, '0'),
        file = join(work, 'video-' + tag + '.mp4');
      if (
        await access(file).then(
          () => true,
          () => false,
        )
      )
        continue;
      const seconds =
        ch === 16
          ? 11
          : Number(
              execFileSync(
                'ffprobe',
                [
                  '-v',
                  'error',
                  '-show_entries',
                  'format=duration',
                  '-of',
                  'csv=p=0',
                  join(work, tag + '.mp3'),
                ],
                { encoding: 'utf8' },
              ),
            ) + 0.32;
      const frames = Math.ceil(seconds * fps);
      const cuts = edit[ch]
        .split(',')
        .map((s) => s.trim().split(' '))
        .map(([at, key]) => ({ f: Math.round(Number(at) * fps), key }))
        .filter((c) => c.f < frames);
      const tmp = file + '.part.mp4';
      const enc = spawn(
        'ffmpeg',
        [
          '-v',
          'error',
          '-y',
          '-f',
          'image2pipe',
          '-framerate',
          '24',
          '-c:v',
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
          '1700k',
          '-bufsize',
          '3200k',
          '-pix_fmt',
          'yuv420p',
          '-colorspace',
          'bt709',
          '-color_trc',
          'bt709',
          '-color_primaries',
          'bt709',
          '-video_track_timescale',
          '24000',
          tmp,
        ],
        { stdio: ['pipe', 'inherit', 'inherit'] },
      );
      const done = once(enc, 'close');
      for (const [i, cut] of cuts.entries()) {
        const n = (cuts[i + 1]?.f ?? frames) - cut.f;
        if (cut.key.includes('@')) {
          const [id, offset] = cut.key.split('@');
          const child = spawn(
            'ffmpeg',
            [
              '-v',
              'error',
              '-ss',
              offset,
              '-i',
              join(work, archives[id] + '.mp4'),
              '-an',
              '-vf',
              'fps=24,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,tpad=stop_duration=2:stop_mode=clone',
              '-frames:v',
              String(n),
              '-threads',
              '2',
              '-q:v',
              '3',
              '-f',
              'image2pipe',
              '-c:v',
              'mjpeg',
              'pipe:1',
            ],
            { stdio: ['ignore', 'pipe', 'inherit'] },
          );
          const ended = once(child, 'close');
          child.stdout.pipe(enc.stdin, { end: false });
          if ((await ended)[0]) throw Error('Archive decode failed: ' + cut.key);
        } else {
          for (let f = 0; f < n; f += 8) {
            const imgs = await page.evaluate(
              ({ name, f, n, frameMethod }) =>
                Array.from({ length: Math.min(8, n - f) }, (_, i) => window[frameMethod](name, (f + i) / 24)),
              { name: cut.key, f, n, frameMethod },
            );
            await new Promise((res, rej) =>
              enc.stdin.write(Buffer.concat(imgs.map((x) => Buffer.from(x, 'base64'))), (err) =>
                err ? rej(err) : res(),
              ),
            );
          }
        }
      }
      enc.stdin.end();
      if ((await done)[0]) throw Error('Encoder failed');
      const count = Number(
        execFileSync(
          'ffprobe',
          [
            '-v',
            'error',
            '-select_streams',
            'v:0',
            '-show_entries',
            'stream=nb_frames',
            '-of',
            'default=nw=1:nk=1',
            tmp,
          ],
          { encoding: 'utf8' },
        ).trim(),
      );
      if (count !== frames) throw Error('Unexpected frame count ' + count + ' / ' + frames + ' in ' + tag);
      await rename(tmp, file);
      console.log(tag, seconds, frames);
    }
  } finally {
    await browser.close();
  }
}
