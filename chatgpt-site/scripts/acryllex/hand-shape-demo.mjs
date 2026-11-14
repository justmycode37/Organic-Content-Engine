// A shape/pose review across real 3D views, with the recording's raster and lights.
// No arbitrary object-contact claim: these are controlled open/partial-curl poses.
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {renderVideo,stills} from './render.mjs';

const output=resolve(process.argv[2]??'../artifacts/acryllex-realism/hand-shape-motion.mp4');
await mkdir(dirname(output),{recursive:true});
const scene=(say,angle,controls,events=[])=>({say,duration:4,hue:'blue',transition:'cut',camera:{angle,fill:.85,move:'static'},objects:[{id:'hand',model:'hand-mesh',controls,enter:'cut',idle:'none'}],events});
const spec={version:1,series:'ACRYLLEX',title:'Hand silhouette and flexion review',style:'reference-recording',captions:false,format:{width:1164,height:670},scenes:[
 scene('Palm: finger cascade, palm width and thumb web','front',{curl:0,thumb:.08}),
 scene('Back: knuckle arc and finger lengths','back',{curl:0,thumb:.08}),
 scene('Profile: palm depth and flexion toward the palm','side',{curl:0,thumb:.08},[{at:1,dur:1.8,target:'hand',set:{curl:.55,thumb:.15},easing:'smooth'}]),
 scene('Oblique: continuous hand through a controlled partial curl','three-quarter-left',{curl:.55,thumb:.15},[{at:.8,dur:2,target:'hand',set:{curl:0,thumb:.08},easing:'smooth'}]),
]};
await writeFile(output.replace(/\.mp4$/,'.json'),JSON.stringify(spec,null,2)+'\n');
await stills(spec,output.replace(/\.mp4$/,'.png'),[1.5,5.5,11.3,14.5],.6,['Palm','Back','Profile / curl','Oblique / open'],2);
const info=await renderVideo(spec,output,{fps:60});console.log(JSON.stringify({output,duration:info.duration,fps:info.fps}));
