import { openMotionPage } from './motion.mjs';
import { execFileSync, spawn } from 'node:child_process';
import { rename, access } from 'node:fs/promises';
import { join } from 'node:path';
import { once } from 'node:events';

export async function renderSkyChapters({
  work,
  ids,
  edit,
  archives,
  archiveFilters = {},
  archiveOverlays = {},
  entry,
  frameMethod,
  offsets = {},
  leads = {},
  pads = {},
}) {
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
            ) + (pads[ch] ?? 0.32);
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
          const overlay = archiveOverlays[id];
          let overlayFile = typeof overlay === 'string' ? overlay : undefined;
          let overlayFilter = overlayFile ? '[camera];[camera][1:v]overlay' : '';
          if (overlay && typeof overlay !== 'string') {
            const clipSeconds = n / fps;
            const insetFps = 12;
            const start = (offsets[ch] ?? 0) + cut.f / fps;
            const images = await page.evaluate(
              ({ frameMethod, key, frameCount, insetFps, start }) =>
                Array.from({ length: frameCount }, (_, i) => {
                  const t = i / insetFps;
                  return window[frameMethod](key, t, { key, t, g: start + t, prev: key, prevT: 0, left: 99 });
                }),
              { frameMethod, key: overlay.key, frameCount: Math.ceil(clipSeconds * insetFps), insetFps, start },
            );
            overlayFile = join(work, 'inset-' + tag + '-' + i + '.mp4');
            execFileSync('ffmpeg', [
              '-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(insetFps),
              '-c:v', 'mjpeg', '-i', 'pipe:0', '-an', '-pix_fmt', 'yuv420p', '-c:v', 'libx264',
              '-preset', 'veryfast', '-crf', '17', overlayFile,
            ], { input: Buffer.concat(images.map((encoded) => Buffer.from(encoded, 'base64'))) });
            const progress = `clip((t-${overlay.expandAt})/${overlay.expandFor},0,1)`;
            const ease = `(${progress})*(${progress})*(3-2*(${progress}))`;
            const width = `trunc((${overlay.width}+(1280-${overlay.width})*(${ease}))/2)*2`;
            overlayFilter = `[camera];[1:v]scale=w='${width}':h=-2:eval=frame[inset];` +
              `[camera][inset]overlay=x='${overlay.x}*(1-(${ease}))':y='${overlay.y}*(1-(${ease}))':enable='gte(t,${overlay.from})'`;
          }
          const child = spawn(
            'ffmpeg',
            [
              '-v',
              'error',
              '-ss',
              offset,
              '-i',
              join(work, archives[id] + '.mp4'),
              ...(overlayFile ? ['-i', overlayFile] : []),
              '-an',
              '-filter_complex',
              ['[0:v]fps=24', 'scale=1280:720:force_original_aspect_ratio=increase', 'crop=1280:720', 'setsar=1',
                archiveFilters[id], 'tpad=stop_duration=2:stop_mode=clone'].filter(Boolean).join(',') +
                overlayFilter,
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
            // Frame methods may use the cue to dissolve from the previous cut and
            // keep slow backdrop motion continuous across chapters.
            // The first cut continues from the last shot of the preceding chapter.
            const before = cuts[i - 1] ?? (leads[ch] && { key: leads[ch].key, f: -leads[ch].frames });
            const cue = {
              prev: before && !before.key.includes('@') ? before.key : undefined,
              prevT: before ? (cut.f - before.f) / 24 : 0,
              start: (offsets[ch] ?? 0) + cut.f / 24,
              end: (frames - cut.f) / 24,
            };
            const imgs = await page.evaluate(
              ({ name, f, n, frameMethod, cue }) =>
                Array.from({ length: Math.min(8, n - f) }, (_, i) =>
                  window[frameMethod](name, (f + i) / 24, {
                    key: name,
                    t: (f + i) / 24,
                    prev: cue.prev,
                    prevT: cue.prevT,
                    g: cue.start + (f + i) / 24,
                    left: cue.end - (f + i) / 24,
                    duration: n / 24,
                  }),
                ),
              { name: cut.key, f, n, frameMethod, cue },
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
