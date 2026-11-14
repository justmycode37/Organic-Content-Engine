// Licensed source anatomy, real viewpoints, clean cuts and the unchanged recording profile.
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {stills,renderVideo} from './render.mjs';
const output=resolve(process.argv[2]??'../artifacts/acryllex-realism/head-scan-motion.mp4');await mkdir(dirname(output),{recursive:true});
const shot=(say,angle,controls={},events=[])=>({say,duration:3,hue:'blue',transition:'cut',camera:{angle,fill:.85,move:'static'},objects:[{id:'head',model:'head-mesh',controls,enter:'cut',enterAt:0,idle:'none'}],events});
const spec={version:1,series:'ACRYLLEX',title:'Infinite Realities head scan: viewpoint and rigid motion review',style:'reference-recording',captions:false,format:{width:1164,height:670},scenes:[
 shot('Front: captured eyelids, nose and jaw','front'),
 shot('Oblique: facial planes and ear shape','three-quarter-left'),
 shot('Profile: nose, lips, chin and neck','side'),
 shot('Rigid movement of the complete bust; no invented facial or neck rig','front',{yaw:-25,pitch:0},[{at:.4,dur:2,target:'head',set:{yaw:30,pitch:-6},easing:'smooth'}]),
]};
await writeFile(output.replace(/\.mp4$/,'.json'),JSON.stringify(spec,null,2)+'\n');
for(const [name,t]of [['front',1.5],['oblique',4.5],['profile',7.5],['moving',11]])await stills(spec,output.replace(/\.mp4$/,'-'+name+'.png'),[t]);
const info=await renderVideo(spec,output,{fps:60});console.log(JSON.stringify({output,duration:info.duration,fps:info.fps,source:'Infinite, 3D Head Scan by Lee Perry-Smith / Infinite Realities, CC BY 3.0',scope:'Closed-eye source scan; rigid bust motion and actual 3D viewpoints, no expression or neck animation.'}));
