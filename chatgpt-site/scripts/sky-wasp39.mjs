// Each change of view is cued from the words in the recorded take.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { renderSkyChapters } from './sky-render-chapters.mjs';

const work = resolve(process.argv[2]);
const plan = {
  1: 'discovery|different telescope=prism|welcome=opening|story of wasp39=hero',
  2: 'hero|put saturn=mass|puff it up=inflate|set it so=year|from here=deepfield|directly in front=transit',
  3: 'transitcurve|planet itself=eqdepth|soft edge=ring|some of that=grazing',
  4: 'vertical|toward the horizon=slant|light grazing=grazing|at wavelengths=ring',
  17: 'strip|another advantage=hero|gas pressure=eqscale|its absorbing=density|both effects=eqsignal|small rocky=puff',
  5: 'transit|inside webb=passage|spread the=prism|interval of wavelength=detectorTrace',
  6: 'example|one photon=thousand|on a graph=turnDips|picture we opened=peak',
  18: 'photonCups|wavelength bin=rebin',
  7: 'peak|laboratory measurements=carbon|collect the contributions=co2',
  8: 'unknown|four point zero=shoulder|distrust a pretty=pretty|astronomers instead=fit',
  19: 'drift|image moves=detector|several groups=pipelines',
  9: 'bins|two different modes=resolution|a chemical model=shortfall|something seemed=balance',
  10: 'reaction',
  11: 'shoulder|sulfur dioxide=identity|include the reactions=chemistry|the telescope measured=inference',
  12: 'so2|other infrared=window|in the new spectrum=confirm',
  20: 'bandScale|webb actually recorded=detector|new bands=predict',
  13: 'mid|change the temperature=layers|cloud high=cloudray|several combinations=degenerate|more bands=abundanceRange',
  14: 'limbs|keep the timing=edges|same dip=curveedges',
  15: 'recap',
  16: 'credits',
  // Rowan's takes end on a cutaway into the next idea.
  0: 'r0@0',
  21: 'r21@0|@6.85=residual',
  22: 'r22@0|@7.55=predict',
};
const archives = { r0: 'rowan', r21: 'rowan-21', r22: 'rowan-22' };
// Tone down the saturated shelves and lamp while grading Rowan more gently.
// Chroma is feathered across the frame so gestures can cross the grade naturally.
const chroma = '0.64+0.24*exp(-(((X/W-0.50)/0.23)^2+((Y/H-0.55)/0.55)^2))';
const webcam = [
  'scale=864:486:flags=area',
  'gblur=sigma=0.35',
  "geq=lum='lum(X,Y)':cb='128+(cb(X,Y)-128)*(" + chroma + ")':cr='128+(cr(X,Y)-128)*(" + chroma + ")'",
  'eq=contrast=0.97:brightness=0.018',
  'noise=alls=2:allf=t',
  'scale=1280:720:flags=bilinear',
].join(',');
const archiveFilters = { r0: webcam.replace('brightness=0.018', 'brightness=0.034'), r21: webcam, r22: webcam };
const archiveOverlays = {
  r0: fileURLToPath(new URL('../src/mysteries-of-the-sky/episodes/rowan-lower-third.png', import.meta.url)),
  r21: { key: 'residualInset', width: 368, x: 870, y: 65, from: 0.16, expandAt: 6.0, expandFor: 0.74 },
};
const pads = { 0: 0.18, 21: 0.18, 22: 0.18 };
const clean = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
const requested = process.argv.slice(3).map(Number);
const ids = requested.length ? requested : Object.keys(plan).map(Number);
const edits = {};
for (const n of Object.keys(plan).map(Number)) {
  const tag = String(n).padStart(2, '0'),
    labels = plan[n].split('|');
  const raw =
    n === 16
      ? []
      : JSON.parse(readFileSync(join(work, tag + '.words.json'), 'utf8')).words.filter(
          (x) => x.type === 'word',
        );
  const words = raw.map((w) => clean(w.text));
  edits[n] = ['0 ' + labels[0]];
  let last = 0;
  for (const cue of labels.slice(1)) {
    const [phrase, name] = cue.split('=');
    if (phrase.startsWith('@')) {
      edits[n].push(phrase.slice(1) + ' ' + name);
      continue;
    }
    const terms = phrase.split(' ');
    const at = words.findIndex((_, i) => i > last && terms.every((w, j) => words[i + j] === w));
    if (at < 0) throw new Error('Chapter ' + tag + ' has no recorded cue for ' + phrase);
    edits[n].push(raw[at].start + ' ' + name);
    last = at;
  }
  edits[n] = edits[n].join(',');
}
// Episode time of each chapter start keeps the drifting backdrop continuous,
// and each chapter opens by dissolving from the previous chapter's last shot.
const probe = (f) =>
  Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }));
const offsets = {},
  leads = {};
let clock = 0,
  previous;
const narration = readFileSync(new URL('../../docs/mysteries-of-the-sky/episodes/wasp39/narration.md', import.meta.url), 'utf8');
const order = [...narration.matchAll(/^## (\d+) · /gm)].map((match) => Number(match[1])).concat(16);
for (const n of order) {
  const tag = String(n).padStart(2, '0');
  offsets[n] = clock;
  const length = n === 16 ? 11 : plan[n] ? probe(join(work, tag + '.mp3')) + (pads[n] ?? 0.32) : probe(join(work, 'video-' + tag + '.mp4'));
  if (previous && !plan[n]?.split('|')[0].includes('@')) leads[n] = previous;
  const last = plan[n] && edits[n].split(',').at(-1).split(' ');
  previous = last && !last[1].includes('@') ? { key: last[1], frames: Math.round((length - Number(last[0])) * 24) } : undefined;
  clock += length;
}
await renderSkyChapters({ work, ids, edit: edits, archives, archiveFilters, archiveOverlays, entry: 'wasp39', frameMethod: 'waspFrame', offsets, leads, pads });
