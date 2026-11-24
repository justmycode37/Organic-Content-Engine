import { openMotionPage } from './motion.mjs';
import { execFileSync, spawn } from 'node:child_process';
import { rename, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { once } from 'node:events';

const work = resolve(process.argv[2]),
  fps = 24;
// Seconds refer to the recorded Titan takes. Archive entries carry a source in-point.
const edit = [
  '0 trail,6.6 d@4,10 card-speed,15 rush,19 g@4,24 ellipse,28 advance,32 card-title',
  '0 c@1,5 c@12,12 c@21,18 c@33,25 c@45,31 card-distance,35 e@1,42 mark',
  '0 e@2,4 follow,9 e@10,13 blend,21 mark,27 e@4,34 blend,38 trail',
  '0 mark,6 follow,10 mark,14 dots,20 card-period,25 c@3,31 g@10,39 trail',
  '0 ellipse,6 boundary,9 area,17 dots,24 area,32 dots,37 rush',
  '0 scale-angle,6 tilt,11 lines,18 lines,22 blue,26 red,32 lines,37 mark',
  '0 tilt,7 g@12,11 lines,15 tilt,21 mark,27 lines,32 scale-angle',
  '0 ellipse,6 scale-clock,14 scale-clock,22 dots,31 card-mass,36 e@3,42 trail',
  '0 card-mass,4 c@3,9 compact,13 card-radius,19 boundary,25 compact,32 ruler,39 g@8',
  '0 d@6,5 rush,10 lines,16 clock,23 extra,32 lines,36 residual,41 d@4',
  '0 extra,5 card-shift,11 rush,16 lines,22 clock,28 residual,32 extra,40 residual',
  '0 c@1,5 array,12 wave,19 fringes,26 wave,30 array,36 fringes,41 mark',
  '0 ellipse,5 trail,9 advance,14 p@4,21 advance,25 card-angle,32 pin,36 mark',
  '0 e@3,9 rush,14 dots,18 advance,23 pin,30 ruler,34 p@15,39 advance',
  '0 trail,5 dots,10 rush,14 extra,18 advance,24 e@7,29 mark,36 card-mass,42 p@12',
  '0 card-credits',
];
const archives = { c: 'eso1825c', d: 'eso1825d', e: 'eso1825e', g: 'eso1825g', p: 'eso2006b' };
const { browser, page } = await openMotionPage('src/mysteries-of-the-sky/episodes/s2.ts');
const ids = process.argv.slice(3).map(Number);
try {
  for (const ch of ids.length ? ids : edit.map((_, i) => i + 1)) {
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
              ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', join(work, tag + '.mp3')],
              { encoding: 'utf8' },
            ),
          ) + 0.32;
    const frames = Math.ceil(seconds * fps);
    const cuts = edit[ch - 1]
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
            ({ name, f, n }) =>
              Array.from({ length: Math.min(8, n - f) }, (_, i) => window.s2Frame(name, (f + i) / 24)),
            { name: cut.key, f, n },
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
