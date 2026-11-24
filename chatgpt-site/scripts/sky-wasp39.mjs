// Each change of view is cued from the words in the recorded take.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderSkyChapters } from './sky-render-chapters.mjs';

const work = resolve(process.argv[2]);
const plan = {
  1: 'discovery|different telescope=prism|welcome=title|world we can=hero',
  2: 'hero|puff it up=size|four earth days=year|from here=distance|directly in front=transit',
  3: 'ingress|count falls=curve|two percent=transit|soft edge=ring|some of that=grazing',
  4: 'vertical|toward the horizon=grazing|at wavelengths=ring',
  17: 'strip|another advantage=hero|gas pressure=density|small rocky=size',
  5: 'transit|spectrograph=prism|interval of wavelength=binsize|getting dimmer=curve|either side=baseline|their depth=narrow',
  6: 'example|one photon=thousand|on a graph=turnDips|picture we opened=peak',
  18: 'photonCups|wavelength bin=rebin|vertical bars=bins',
  7: 'peak|laboratory measurements=carbon|collect the contributions=co2',
  8: 'unknown|four point zero=shoulder|detectors give=bins|astronomers instead=fit',
  19: 'drift|image moves=detector|several groups=data',
  9: 'bins|two different modes=resolution|local temperature=balance',
  10: 'ring|hydrogen sulfide=sulfide|water molecules=water|those fragments=sulfide|energy from above=transit|passed through=grazing',
  11: 'shoulder|sulfur dioxide=so2|absorption band=sulfur|include the reactions=chemistry|the telescope measured=identity',
  12: 'so2|other infrared=window|they found absorption=mid',
  20: 'bandScale|webb actually recorded=detector|new bands=mid',
  13: 'so2|how many absorbing=grazing|cloud high=cloudray|several combinations=cloud|more bands=mid',
  14: 'ingress|order reverses=exit|keep the timing=edges|same dip=curve',
  15: 'distance|keeping the colors=prism|small peak=shoulder|ultraviolet=water|longer wavelengths=mid|look between=finalPoints',
  16: 'credits',
};
const clean = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
const requested = process.argv.slice(3).map(Number);
const ids = requested.length ? requested : Object.keys(plan).map(Number);
const edits = {};
for (const n of ids) {
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
    const [phrase, name] = cue.split('='),
      terms = phrase.split(' ');
    const at = words.findIndex((_, i) => i > last && terms.every((w, j) => words[i + j] === w));
    if (at < 0) throw new Error('Chapter ' + tag + ' has no recorded cue for ' + phrase);
    edits[n].push(raw[at].start + ' ' + name);
    last = at;
  }
  edits[n] = edits[n].join(',');
}
await renderSkyChapters({ work, ids, edit: edits, archives: {}, entry: 'wasp39', frameMethod: 'waspFrame' });
