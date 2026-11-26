import { resolve } from 'node:path';
import { renderSkyChapters } from './sky-render-chapters.mjs';
const work = resolve(process.argv[2]);
// Seconds refer to the recorded Titan takes. Archive entries carry a source in-point.
const edit = [
  '0 c@3,3.6 card-title,7.1 c@44,10.8 g@5,15.7 e@2,18.7 d@5,22.7 rush,27 ellipse,31.8 dots,33.4 lines',
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
const ids = process.argv.slice(3).map(Number);
await renderSkyChapters({
  work,
  ids: ids.length ? ids : edit.map((_, i) => i + 1),
  edit: Object.fromEntries(edit.map((v, i) => [i + 1, v])),
  archives,
  entry: 's2',
  frameMethod: 's2Frame',
});
