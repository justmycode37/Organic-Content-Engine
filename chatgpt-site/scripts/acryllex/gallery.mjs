// Contact sheet of library models, one scene each (for auditing detail and recognisability).
//   node scripts/acryllex/gallery.mjs <out.png> <model[:hue][:json-params]> ...
//   e.g. gallery.mjs /tmp/g.png abacus calculator:red 'city:white:{"count":20}'
import {stills} from './render.mjs';
const [out,...ids]=process.argv.slice(2);
if(!out||!ids.length)throw new Error('Usage: gallery.mjs <out.png> <model[:hue][:params-json]> ...');
const HUES=['blue','azure','red','white','amber','green','cyan','violet','orange','pink'];
const scenes=ids.map((raw,i)=>{const [model,a,...rest]=raw.split(':');const hue=HUES.includes(a)?a:HUES[i%3===0?0:i%3===1?2:3];const pj=HUES.includes(a)?rest.join(':'):[a,...rest].filter(Boolean).join(':');
 return {say:model,hue,duration:2.4,captions:false,camera:{angle:'three-quarter',fill:0.8,move:'static'},objects:[{id:'m',model,enter:'none',idle:'turn',params:pj?JSON.parse(pj):undefined}]};});
const spec={version:1,series:'ACRYLLEX',title:'gallery',captions:false,scenes,format:process.env.ACX_FORMAT?JSON.parse(process.env.ACX_FORMAT):undefined};
const times=scenes.map((_,i)=>i*2.4+1.2);
await stills(spec,out,times,Number(process.env.ACX_SCALE||0.3),ids.map(s=>s.split(':')[0]),Number(process.env.ACX_COLS||6));
console.log(`Wrote ${out} (${ids.length} models)`);
