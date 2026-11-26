// Render "The Planet Found on Paper". Each change of view is cued from a phrase in
// the recorded take: node sky-aurora.mjs <work> [chapter ids...]
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderSkyChapters } from './sky-render-chapters.mjs';

const work = resolve(process.argv[2]);
const plan = {
  1: 'leverrier|within an hour=chart|it was neptune=neptune|the clue was=uranus|welcome to=title',
  2: 'herschel|over the following=steps|we call it=uranus|astronomers did=drift',
  3: 'residuals|fit the old=seesaw|over the next=residuals',
  17: 'transitWire',
  4: 'pulls',
  5: 'leverrierDesk|start with the error=inverse',
  21: 'rowanTug',
  6: 'prediction|so le verrier=galle|about five degrees=prediction|berlin had=bremiker',
  7: 'searchSplit',
  8: 'adams|james challis=challis|today most=prediction',
  9: 'luck',
  22: 'rowanLuck',
  10: 'galileo|being visible=chart',
  11: 'triton',
  12: 'neptune|a huge dark=spot|its blue tint=neptune|and triton turned=tritonPhoto',
  18: 'occult|the james webb=webb|and in july=orbitLoop',
  13: 'mercury',
  23: 'rowanTwo',
  14: 'einstein',
  15: 'wobble2',
  19: 'answer',
  16: 'credits',
};
const archives = {};
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
// Long diagram beats are broken into alternate framings (push-ins on the part
// being discussed), cut on word boundaries about every six seconds. The scene's
// own clock keeps running across these cuts.
const framings = {
  // Only scenes without labels near the frame edge are reframed.
  prediction: ['1.3:690:330'],
  search: ['1.3:690:330'],
  steps: ['1.3:640:330'],
  inverse: ['1.25:640:380'],
};
for (const [key, spec] of Object.entries(edits)) {
  const n = Number(key);
  if (n === 16) continue;
  const tag = key.padStart(2, '0');
  const starts = JSON.parse(readFileSync(join(work, tag + '.words.json'), 'utf8'))
    .words.filter((w) => w.type === 'word')
    .map((w) => w.start);
  const length = probe(join(work, tag + '.mp3')) + (pads[n] ?? 0.32);
  const cuts = spec.split(',').map((c) => c.split(' '));
  const out = [];
  cuts.forEach(([at, scene], i) => {
    const t0 = Number(at),
      t1 = i + 1 < cuts.length ? Number(cuts[i + 1][0]) : length;
    out.push(at + ' ' + scene);
    const options = framings[scene];
    if (!options || t1 - t0 < 9) return;
    let k = 0;
    for (let target = t0 + 6; target < t1 - 3; target += 6) {
      const word = starts.find((s) => s >= target && s < t1 - 3);
      if (word === undefined) break;
      out.push(word + ' ' + (k % 2 === 0 ? scene + '~' + options[Math.floor(k / 2) % options.length] : scene));
      k++;
      target = word;
    }
  });
  edits[n] = out.join(',');
}
// Chapter order follows the narration; each chapter dissolves from the last shot
// of the one before and the backdrop clock runs through the whole episode.
const story = readFileSync(fileURLToPath(new URL('../../docs/mysteries-of-the-sky/episodes/neptune/narration.md', import.meta.url)), 'utf8');
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
writeFileSync(fileURLToPath(new URL('../src/mysteries-of-the-sky/episodes/neptune/words.json', import.meta.url)), JSON.stringify(timeline));
const ids = process.argv.length > 3 ? process.argv.slice(3).map(Number) : order;
await renderSkyChapters({
  work,
  ids,
  edit: edits,
  archives,
  entry: 'neptune',
  frameMethod: 'neptuneFrame',
  offsets,
  leads,
  pads,
  encode: { crf: '17', maxrate: '9000k', bufsize: '18000k' },
});
