// Each change of view is cued from the words in the recorded take.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderSkyChapters } from './sky-render-chapters.mjs';

const work = resolve(process.argv[2]);
const plan = {
  1: 'unknown|tall feature=peak|just to its left=shoulder|different telescope=prism|welcome=title|world we can=hero',
  2: 'hero|puff it up=size|four earth days=year|light years=distance|directly in front=transit',
  3: 'ingress|count falls=curve|two percent=transit|soft edge=ring|some of that=grazing',
  4: 'vertical|toward the horizon=grazing|long path=ring|higher into=grazing|apparent sizes=puff',
  17: 'size|rim of atmosphere=ring|same thickness=puff|atmosphere is hot=hero|absorbing layers=grazing|small rocky=size',
  5: 'transit|spectrograph=prism|interval of wavelength=binsize|getting dimmer=curve|either side=baseline|their depth=narrow',
  6: 'example|one photon=photon|dip goes lower=narrow|wavelength along=data|photons have=shoulder',
  18: 'prism|row of cups=photon|wavelength bin=binsize|group neighboring=bins|vertical bars=shoulder',
  7: 'peak|four point three=co2|laboratory=carbon|motion inside=carbon|huge numbers=peak',
  8: 'unknown|four point zero=shoulder|uncertainty=bins|smooth line=data|carbon dioxide=peak|little rise=shoulder',
  19: 'ingress|signal drifts=curve|before and after=baseline|image moves=prism|several groups=data',
  9: 'shoulder|two different modes=prism|spread the light=binsize|extra absorption=shoulder|local temperature=ring|atmosphere works=hero',
  10: 'ring|hydrogen sulfide=sulfide|water molecules=water|sulfur bearing=sulfide|energy from above=transit|passed through=grazing',
  11: 'shoulder|sulfur dioxide=so2|absorption band=sulfur|high in=ring|telescope measured=sulfur|molecule being=so2',
  12: 'so2|other infrared=mid|mid infrared=prism|seven point=mid|original data=shoulder|two new=mid',
  20: 'prism|first little bump=shoulder|twice as far=mid|colors are a key=prism|counts on=photon|ordinary level=curve',
  13: 'so2|how many absorbing=grazing|temperature=puff|cloud high=cloud|layers below=cloudray|more bands=mid',
  14: 'ring|first moments=ingress|planet leaves=exit|two edges=edges|evening side=edges|same dip=curve',
  15: 'distance|size of a shadow=transit|thin ring=ring|small peak=shoulder|ultraviolet=water|four days=year|longer wavelengths=mid|smallest mark=shoulder',
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
    if (at < 0) continue;
    edits[n].push(raw[at].start + ' ' + name);
    last = at;
  }
  // Split longer uninterrupted demonstrations into another view of the measurement.
  const alts = {
    carbon: 'co2',
    peak: 'carbon',
    ring: 'grazing',
    shoulder: 'bins',
    prism: 'binsize',
    mid: 'so2',
    edges: 'exit',
    data: 'unknown',
    grazing: 'ring',
    hero: 'year',
    curve: 'transit',
    photon: 'binsize',
    example: 'curve',
    baseline: 'curve',
    so2: 'sulfur',
    water: 'sulfide',
  };
  const expanded = [];
  for (let i = 0; i < edits[n].length; i++) {
    const [a, k] = edits[n][i].split(' ');
    expanded.push(edits[n][i]);
    const end = i + 1 < edits[n].length ? Number(edits[n][i + 1].split(' ')[0]) : raw.at(-1)?.end;
    if (end - Number(a) > 12 && alts[k])
      expanded.push((Number(a) + (end - Number(a)) * 0.58).toFixed(2) + ' ' + alts[k]);
  }
  edits[n] = expanded.join(',');
}
await renderSkyChapters({ work, ids, edit: edits, archives: {}, entry: 'wasp39', frameMethod: 'waspFrame' });
