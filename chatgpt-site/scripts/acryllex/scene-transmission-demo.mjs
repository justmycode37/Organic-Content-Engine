// Demonstrate the generic scene-surface path with a real scan and exact probes.
// No original reel is edited or regenerated.
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {renderVideo,stills} from './render.mjs';
const output=resolve(process.argv[2]??'../artifacts/acryllex-realism/glass-scene-transmission.mp4');await mkdir(dirname(output),{recursive:true});
// The scan lies along Z with its bowl at +Z. Reorient the source rigidly and put
// its measured bowl bottom at 11 mm, above the vessel's 6.5 mm inner floor.
const glass={id:'glass',model:'glass-optics',origin:'model',pos:[0,0,0],params:{straw:false,fill:.64,sceneTransmission:true},enter:'cut',enterAt:0,idle:'none'},spoon={id:'spoon',model:'wooden_spoon',origin:'model',pos:[0,.065206021737848,0],rot:[90,-8,0],scale:.65,enter:'cut',enterAt:0,idle:'none',castShadow:false};
const card=[...[-.075,-.05,-.025,0,.025,.05,.075].map(x=>({shape:'box',size:[.004,.14,.002],pos:[x,.075,-.11],tone:.6})),...[.02,.06,.1,.14].map(y=>({shape:'box',size:[.17,.002,.002],pos:[0,y,-.11],tone:.6}))];
const spec={version:1,series:'ACRYLLEX',title:'Real scene objects through glass and water',style:'reference-recording',captions:false,format:{width:1164,height:670},scenes:[
 {say:'A scanned wooden spoon through the glass and water.',duration:3,hue:'blue',transition:'cut',camera:{pos:[.03,.15,.37],look:[0,.1,0],fov:36,move:'static'},objects:[glass,spoon]},
 {say:'A moving background pattern reveals curved-wall lensing.',duration:3,hue:'blue',transition:'cut',camera:{pos:[-.22,.16,.25],look:[0,.09,0],fov:36,move:'static'},objects:[{...glass,params:{...glass.params,straw:true}},{id:'card',model:'compose',origin:'model',pos:[0,0,0],params:{parts:card},keyframes:[{at:0,pos:[-.016,0,0],easing:'linear'},{at:3,pos:[.016,0,0],easing:'linear'}],enter:'cut',enterAt:0,idle:'none',castShadow:false}]},
 {say:'The actual scanned spoon seen through the water from above.',duration:3,hue:'blue',transition:'cut',camera:{pos:[.09,.28,.22],look:[0,.075,0],fov:36,move:'static'},objects:[glass,spoon]},
]};
await writeFile(output.replace(/\.mp4$/,'.json'),JSON.stringify(spec,null,2)+'\n');
await stills(spec,output.replace(/\.mp4$/,'.png'),[1,4.5,7.5],.7,['Scanned spoon','Moving background','High view'],3);
if(!process.env.ACRYLLEX_STILLS_ONLY){const info=await renderVideo(spec,output,{fps:60});console.log(JSON.stringify({output,duration:info.duration,fps:info.fps}));}
