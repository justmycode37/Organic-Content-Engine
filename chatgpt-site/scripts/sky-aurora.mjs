// Render "The Light Oxygen Makes". Each change of view is cued from a phrase in
// the recorded take: node sky-aurora.mjs <work> [chapter ids...]
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderSkyChapters } from './sky-render-chapters.mjs';

const work = resolve(process.argv[2]);
const plan = {
  1: 'portrait|from the international=orbit|that green light=oneLine|identifying the atom=earthBand|the color comes=atomCard|welcome to=title',
  2: 'spectrometer|a spectroscope spreads=rainbow|the auroras brightest=mystery|for decades=curtainPhoto',
  3: 'tube|the reason turned=quench',
  4: 'sunWind|earths magnetic field=magnetosphere|when its released=tailRelease|they end up=oval|seen from space=swirl',
  14: 'ovalGrow|in may=storm|a viewer far=horizon',
  5: 'dive|when the electron=collision',
  21: 'rowanCollision',
  6: 'ladder|for the oxygen=greenDrop|the same line=ocean',
  15: 'spectrograph|then a short=equation|nothing about the=sameLine',
  7: 'waiting|physicists call the=forbidden',
  8: 'quench|mclennan and=tube|in the open=australis',
  9: 'column|the tall aurora=layers',
  22: 'rowanColumn',
  10: 'nitrogen|our eyes add=eyeCamera',
  11: 'sheets|as the sheets=bandClouds|and because the=flicker',
  12: 'arm|when red is=pillars|every bit of=band',
  23: 'rowanSpectrum',
  17: 'recombine|this faint light=airglowPhoto|its the same=airglowEarth',
  18: 'mars|the perseverance rover=jezero|it recorded=marsSpectrum',
  13: 'recap|go lower and=column|the green line that=finale',
  16: 'credits',
};
const archives = { r21: 'rowan-21', r22: 'rowan-22', r23: 'rowan-23' };
const pads = { 21: 0.18, 22: 0.18, 23: 0.18 };
const webcam =
  'scale=864:486:flags=area,gblur=sigma=0.35,eq=saturation=0.72:contrast=0.97:brightness=0.025,noise=alls=2:allf=t,scale=1280:720:flags=bilinear';
const clean = (s) =>
  s
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
const probe = (f) =>
  Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }));

const edits = {};
for (const [key, spec] of Object.entries(plan)) {
  const n = Number(key),
    tag = key.padStart(2, '0'),
    [first, ...cuts] = spec.split('|');
  const times = ['0 ' + first];
  if (cuts.length) {
    const raw = JSON.parse(readFileSync(join(work, tag + '.words.json'), 'utf8')).words.filter((w) => w.type === 'word');
    const said = raw.map((w) => clean(w.text));
    let last = -1;
    for (const cut of cuts) {
      const [phrase, scene] = cut.split('=');
      const terms = clean(phrase).split(' ');
      const at = said.findIndex((_, i) => i > last && terms.every((w, j) => said[i + j] === w));
      if (at < 0) throw new Error('Chapter ' + tag + ' has no recorded cue for ' + phrase);
      times.push(raw[at].start + ' ' + scene);
      last = at;
    }
  }
  edits[n] = times.join(',');
}
// Chapter order follows the narration; each chapter dissolves from the last shot
// of the one before and the backdrop clock runs through the whole episode.
const story = readFileSync(fileURLToPath(new URL('../../docs/mysteries-of-the-sky/episodes/green-aurora/narration.md', import.meta.url)), 'utf8');
const order = [...story.matchAll(/^## (\d+) · /gm)].map((m) => Number(m[1])).concat(16);
const offsets = {},
  leads = {};
let clock = 0,
  previous;
for (const n of order) {
  offsets[n] = clock;
  const length = n === 16 ? 11 : probe(join(work, String(n).padStart(2, '0') + '.mp3')) + (pads[n] ?? 0.32);
  const first = edits[n].split(',')[0].split(' ')[1];
  if (previous && !first.includes('@')) leads[n] = previous;
  const last = edits[n].split(',').at(-1).split(' ');
  previous = last[1].includes('@') ? undefined : { key: last[1], frames: Math.round((length - Number(last[0])) * 24) };
  clock += length;
}
// Every recorded word with its episode time, so a shot can trigger on a phrase.
const timeline = [];
for (const n of order) {
  if (n === 16) continue;
  const raw = JSON.parse(readFileSync(join(work, String(n).padStart(2, '0') + '.words.json'), 'utf8')).words;
  for (const w of raw) if (w.type === 'word') timeline.push([clean(w.text), +(offsets[n] + w.start).toFixed(3)]);
}
writeFileSync(fileURLToPath(new URL('../src/mysteries-of-the-sky/episodes/aurora/words.json', import.meta.url)), JSON.stringify(timeline));
const ids = process.argv.length > 3 ? process.argv.slice(3).map(Number) : order;
await renderSkyChapters({
  work,
  ids,
  edit: edits,
  archives,
  archiveFilters: { r21: webcam, r22: webcam, r23: webcam },
  archiveOverlays: { r21: fileURLToPath(new URL('../src/mysteries-of-the-sky/episodes/rowan-lower-third.png', import.meta.url)) },
  entry: 'aurora',
  frameMethod: 'auroraFrame',
  offsets,
  leads,
  pads,
  encode: { crf: '17', maxrate: '9000k', bufsize: '18000k' },
});
