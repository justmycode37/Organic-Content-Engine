import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {renderVideo,stills} from './render.mjs';

const output=resolve(process.argv[2]??'../artifacts/acryllex-realism/glass-demo.mp4');await mkdir(dirname(output),{recursive:true});
const shot=(say,duration,pos,look,events=[])=>({say,duration,hue:'blue',transition:'cut',camera:{pos,look,fov:36,move:'static'},objects:[{id:'glass',model:'glass-optics',origin:'model',pos:[0,0,0],params:{fill:.64,strawTilt:16,sceneTransmission:false},controls:{strawTilt:16},enter:'cut',idle:'none'}],events});
const spec={version:1,series:'ACRYLLEX',title:'Glass, water and refraction',style:'reference-recording',captions:false,format:{width:1164,height:670},scenes:[
 shot('A glass of water and a physically straight straw',3,[.13,.17,.45],[0,.12,0]),
 shot('Waterline and refracted straw, with a small deliberate movement',4,[-.14,.16,.27],[0,.075,0],[{at:.4,dur:1.7,target:'glass',set:{strawTilt:20},easing:'smooth'},{at:2.3,dur:1.4,target:'glass',set:{strawTilt:14},easing:'smooth'}]),
 shot('A high view of the water surface and glass walls',3,[.08,.29,.20],[0,.085,0],[{at:0,dur:.05,target:'glass',set:{strawTilt:14},easing:'hold'}]),
]};
await writeFile(output.replace(/\.mp4$/,'.json'),JSON.stringify(spec,null,2)+'\n');
await stills(spec,output.replace(/\.mp4$/,'.png'),[1,4,5.3,8],.6,['Whole glass','Waterline','Straw movement','High view'],2);
if(!process.env.ACRYLLEX_STILLS_ONLY){const info=await renderVideo(spec,output,{fps:60});console.log(JSON.stringify({output,duration:info.duration,fps:info.fps}));}
