// Shot-transition demo: a short bottle reel authored with typical camera mistakes (a ~22° jump cut, a flash on a
// viewpoint change, a slow 2 s swing between angles, a 5% nudge) is passed through the real generation camera
// pipeline (worker directCameras = planCameras + planTransitions), rendered, and the actual cut frames are measured.
//   node scripts/acryllex/shot-transition-demo.mjs <out.mp4>      writes <out>.json (spec + plan log) and <out>.cuts.json
import {writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {renderVideo,FPS} from './render.mjs';
import {directCameras} from '../../worker/acryllex-generation.ts';
import {transitionProblems,transitionList} from '../../src/acryllex/shot-transitions.ts';
import {cameraProblems} from '../../src/acryllex/camera-direction.ts';
import {applyStyleProfile} from '../../src/acryllex/style-profile.ts';
import {resolveAt,sceneDuration} from '../../src/acryllex/spec.ts';

const out=process.argv[2];if(!out)throw new Error('Usage: shot-transition-demo.mjs <out.mp4>');
const bottle=()=>({id:'bottle',model:'bottle',enter:'none',idle:'none'});
const mug=()=>({id:'mug',model:'mug',enter:'none',idle:'none',near:'bottle',side:'right'});
const authored={version:1,series:'ACRYLLEX',title:'Shot transitions',style:'reference-recording',captions:false,scenes:[
 {say:'A glass bottle stands on the table.',duration:2.6,camera:{angle:'three-quarter',fill:0.62},objects:[bottle()]},
 // ~22° and 1.1x from the previous shot: a jump cut, and a flash just to change angle
 {say:'Seen from a little higher.',duration:3.2,transition:'flash',camera:{angle:'high',fill:0.68},objects:[bottle(),mug()],
  events:[{at:1.4,dur:2.0,camera:{angle:'side',fill:0.62}}]}, // slow 2 s swing between angles
 {say:'From above it is a circle.',duration:3.0,camera:{angle:'top',fill:0.62},objects:[bottle(),mug()],
  events:[{at:1.5,camera:{angle:'top',fill:0.65}}]}, // 5% hesitant nudge
 {say:'Down low it towers like a monument.',duration:2.8,camera:{angle:'low',fill:0.9,focus:'bottle'},objects:[bottle(),mug()]},
]};
const log={};
const spec=applyStyleProfile(directCameras(applyStyleProfile(authored),log,'demo'));
const remaining=[...transitionProblems(spec),...cameraProblems(spec)];
// expected view changes: every scene start after the first, and every hard in-scene cut
const expected=[];let start=0;
spec.scenes.forEach((s,i)=>{
 const dur=sceneDuration(s);if(i)expected.push({t:start,why:`scene ${i+1} ${s.transition??'cut'}`});
 for(const e of s.events??[])if(e.camera&&e.easing==='hold')expected.push({t:start+resolveAt(s,e.at,dur,dur*0.5)+Number(e.dur),why:`scene ${i+1} in-scene cut to ${e.camera.angle}`});
 start+=dur;
});
await writeFile(out.replace(/\.mp4$/,'')+'.json',JSON.stringify({authoredProblems:transitionProblems(applyStyleProfile(authored)),plan:log.demoCameraPlan,remaining,cuts:transitionList(spec),spec},null,1));
await renderVideo(spec,out);
// measure: per-frame mean absolute luma difference; a hard cut is a spike several times the local motion level
const W=270,H=480;const raw=spawnSync('ffmpeg',['-v','error','-i',out,'-vf',`scale=${W}:${H},format=gray`,'-f','rawvideo','-'],{maxBuffer:1<<30}).stdout;
const n=Math.floor(raw.length/(W*H)),diff=[0];
for(let f=1;f<n;f++){let d=0;const a=(f-1)*W*H,b=f*W*H;for(let k=0;k<W*H;k+=3)d+=Math.abs(raw[a+k]-raw[b+k]);diff.push(d/(W*H/3));}
const spikes=diff.map((d,f)=>({f,t:f/FPS,d})).filter(({f,d})=>{const near=diff.slice(Math.max(1,f-8),f+9).filter((_,k)=>k!==Math.min(8,f-1));const med=near.sort((x,y)=>x-y)[Math.floor(near.length/2)]??0;return d>1.5&&d>3*med+0.5;});
console.error('luma diff per frame:',diff.map(d=>Math.round(d*10)/10).join(' '));
const report=expected.map(x=>{const hit=spikes.find(s=>Math.abs(s.t-x.t)<=1.5/FPS);return {...x,frame:(()=>{let f=Math.floor(x.t*FPS);while(f/FPS<x.t)f++;return f;})(),measured:hit?{frame:hit.f,t:Math.round(hit.t*1000)/1000,lumaDiff:Math.round(hit.d*10)/10}:null};});
const unexpected=spikes.filter(s=>!expected.some(x=>Math.abs(s.t-x.t)<=1.5/FPS)).map(s=>({frame:s.f,t:Math.round(s.t*1000)/1000,lumaDiff:Math.round(s.d*10)/10}));
await writeFile(out.replace(/\.mp4$/,'')+'.cuts.json',JSON.stringify({frames:n,expected:report,unexpected},null,1));
console.log(JSON.stringify({plan:log.demoCameraPlan,remaining,cuts:transitionList(spec),expected:report,unexpected},null,1));
