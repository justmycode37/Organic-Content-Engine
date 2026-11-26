import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderSkyChapters } from './sky-render-chapters.mjs';

const work = resolve(process.argv[2]);
const plan = {
  1: ['hook', ['a camera in west texas', 'discovery'], ['came back the next night', 'nights'], ['the end of a trail', 'title']],
  2: ['skyPatch', ['camera could pick out', 'optics'], ['broad about three degrees', 'discovery'], ['brightest measurement', 'nights']],
  3: ['geometry', ['walk to the night side', 'eye']],
  17: [existsSync(join(work, 'rowan-17.mp4')) ? 'rowan17@0' : 'columnCompare'],
  4: ['spectrum', ['an atom absorbs', 'scatter'], ['use a filter', 'optics']],
  5: ['surface', ['a grain of dust', 'sources'], ['individual atoms leave', 'escape']],
  6: ['photonPush', ['over many encounters', 'tail']],
  7: ['orbit', ['near new moon', 'newmoon']],
  8: ['focus'],
  9: ['lineOfSight', ['look a little', 'viewCompare'], ['appear as one faint spot', 'skyPatch']],
  10: ['twoSites', ['images from august', 'early']],
  18: [existsSync(join(work, 'rowan-18.mp4')) ? 'rowan18@0' : 'geometryBias'],
  11: ['nights', ['geometry can make', 'newmoon'], ['much longer study', 'longStudy']],
  12: ['doppler', ['idea that these are atoms', 'tail']],
  13: ['optics', ['sodium escaped', 'escape'], ['earths gravity', 'focusRecap'], ['the camera was looking', 'lineOfSight'], ['right out in front', 'discovery']],
  16: ['credits'],
};
const ids = process.argv.length > 3 ? process.argv.slice(3).map(Number) : Object.keys(plan).map(Number);
const clean = (text) => text.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
const edit = {};
for (const id of ids) {
  const tag = String(id).padStart(2, '0');
  const [intro, ...cuts] = plan[id];
  const times = ['0 ' + intro];
  if (cuts.length) {
    const { words } = JSON.parse(readFileSync(join(work, tag + '.words.json'), 'utf8'));
    const recorded = words.filter(({ type }) => type === 'word');
    const normalized = recorded.map(({ text }) => clean(text));
    let previous = -1;
    for (const [phrase, scene] of cuts) {
      const terms = phrase.split(' ');
      const index = normalized.findIndex((_, i) => i > previous && terms.every((term, j) => term === normalized[i + j]));
      if (index < 0) throw new Error('Missing recorded cue in ' + tag + ': ' + phrase);
      times.push(recorded[index].start + ' ' + scene);
      previous = index;
    }
  }
  edit[id] = times.join(',');
}
const webcam = 'scale=864:486:flags=area,gblur=sigma=0.35,eq=saturation=0.72:contrast=0.97:brightness=0.025,noise=alls=2:allf=t,scale=1280:720:flags=bilinear';
await renderSkyChapters({
  work, ids, edit,
  archives: { rowan17: 'rowan-17', rowan18: 'rowan-18' },
  archiveFilters: { rowan17: webcam, rowan18: webcam },
  archiveOverlays: {
    rowan17: fileURLToPath(new URL('../src/mysteries-of-the-sky/episodes/rowan-lower-third.png', import.meta.url)),
  },
  entry: 'moon-tail',
  frameMethod: 'moonTailFrame',
  pads: { 17: 0.18, 18: 0.18 },
});
