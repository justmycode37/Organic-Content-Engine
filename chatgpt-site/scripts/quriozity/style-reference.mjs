import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,copyFile,access} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import reference from '../../src/quriozity/style-reference.json' with {type:'json'};
import {sceneDuration,resolveAt} from '../../src/quriozity/spec.ts';
import {imageSheet,stills} from './render.mjs';

const ROOT=fileURLToPath(new URL('../../',import.meta.url));
export const STYLE_REFERENCE=reference;
const exists=async file=>{try{await access(file);return true;}catch{return false;}};
const hash=value=>createHash('sha256').update(value).digest('hex');
export async function verifyStyleReference(file,expectedSHA256=reference.sha256){
 let data;try{data=await readFile(file);}catch(e){throw new Error(`Required owner-approved style reference is unavailable at ${file}; set QURIOZITY_STYLE_REFERENCE to the supplied recording.`,{cause:e});}
 const actual=hash(data);if(actual!==expectedSHA256)throw new Error(`Style reference checksum mismatch: expected ${expectedSHA256}, got ${actual}`);
 return actual;
}

/** The recording stays in the private asset cache; only its pinned identity is committed. */
export async function prepareStyleReference(workdir,{file=process.env.QURIOZITY_STYLE_REFERENCE||join(ROOT,'.quriozity-assets',reference.cacheFile)}={}){
 const sourceHash=await verifyStyleReference(file),packetHash=hash(JSON.stringify({version:1,reference,sourceHash}));
 const cache=join(ROOT,'.quriozity-cache','style-reference',packetHash.slice(0,16));await mkdir(cache,{recursive:true});
 const overview=join(cache,'reference-overview.png'),motion=join(cache,'reference-motion.png');
 const nativeFrame=t=>Math.round(t*reference.fps);
 const stillFrames=reference.stillTimes.map(nativeFrame),bursts=reference.motionStarts.map(start=>Array.from({length:reference.motionCount},(_,i)=>nativeFrame(start+i*reference.motionStep)));
 const frames=[...new Set([...stillFrames,...bursts.flat()])].sort((a,b)=>a-b);
 if(!await exists(overview)||!await exists(motion)||!await exists(join(cache,'packet.json'))){
  const [x,y,w,h]=reference.activeCrop;
  const select=frames.map(frame=>`eq(n,${frame})`).join('+');
  const result=spawnSync('ffmpeg',['-v','error','-y','-i',resolve(file),'-vf',`select='${select}',crop=${w}:${h}:${x}:${y},scale=1080:-2`,'-fps_mode','vfr',join(cache,'frame-%03d.png')],{encoding:'utf8',maxBuffer:8<<20});
  if(result.error||result.status!==0)throw new Error(`Style reference extraction failed: ${result.error??result.stderr.slice(-1200)}`);
  const imageFor=frame=>join(cache,`frame-${String(frames.indexOf(frame)+1).padStart(3,'0')}.png`);
  await imageSheet(stillFrames.map(imageFor),overview,{columns:3,width:360,labels:stillFrames.map(frame=>`PERFECT REFERENCE ${(frame/reference.fps).toFixed(2)}s`)});
  await imageSheet(bursts.flat().map(imageFor),motion,{columns:reference.motionCount,width:260,labels:bursts.flat().map(frame=>`REF ${(frame/reference.fps).toFixed(3)}s`)});
  await writeFile(join(cache,'packet.json'),JSON.stringify({packetHash,sourceHash,reference,frames,notes:'Only the animation area is compared. Crop is resized to1080wide so native dot pitch can be compared at output width. Motion rows sample six frames at12Hz; this is sampled motion evidence, not full-video playback.'},null,2));
 }
 const target=join(workdir,'style-reference');await mkdir(target,{recursive:true});
 const files=[];
 for(const name of ['reference-overview.png','reference-motion.png','packet.json']){const to=join(target,name);await copyFile(join(cache,name),to);files.push(to);}
 return {hash:packetHash,sourceHash,files,index:`OWNER-APPROVED PERFECT STYLE REFERENCE: ${reference.label}, SHA256 ${sourceHash}. Animation crop ${reference.activeCrop.join(',')} from ${reference.width}x${reference.height}; phone interface excluded. Overview times ${reference.stillTimes.join(',')} seconds. Motion rows start at ${reference.motionStarts.join(',')} seconds, six samples at12Hz. Reference is the authority for normalized ink coverage, sparse/dense dots, pitch/roundness/softness, fixed ink, type treatment, motion and transitions. OWNER COLOR OVERRIDE: new Quriozity reels use white paper with black ink instead of the recording's blue ink on black. Compare ink occupancy/negative-space structure after accounting for this intended polarity swap; do not demand the old blue/black colors. Source-isolation mattes remain black internally. The dark contact-sheet label margins are not reel background. Compare style across subjects; do not copy the subject matter.`,sheets:await Promise.all(files.filter(f=>f.endsWith('.png')).map(async file=>({mime:'image/png',base64:(await readFile(file)).toString('base64')})))};
}

/** Matched temporal spacing makes actual entrances/actions/grain inspectable. */
export async function candidateMotionEvidence(spec,dir){
 const files=[],samples=[];let offset=0;
 const chosen=new Set([0,2,3,6,8]);
 for(const [index,scene]of spec.scenes.entries()){
  const duration=sceneDuration(scene);
  if(chosen.has(index)){
   const event=(scene.events??[]).find(e=>e.set||e.move||e.morph||e.show),span=5/12;
   const start=Math.max(.01,Math.min(duration-span-.01,event?resolveAt(scene,event.at,duration)+Math.min(.15,(event.dur??.3)*.3):.04));
   const times=Array.from({length:6},(_,i)=>offset+Math.min(duration-.001,start+i/12)),labels=times.map(t=>`REEL S${index+1} ${t.toFixed(3)}s`),file=join(dir,`style-motion-S${index+1}.png`);
   await stills(spec,file,times,.25,labels,6);files.push(file);samples.push({scene:index+1,times});
  }
  offset+=duration;
 }
 return {files,samples,index:'REEL motion strips: six frames at12Hz around entrances or physical action; compare with reference motion rows. These are sampled sequences, not full-video playback.',sheets:await Promise.all(files.map(async file=>({mime:'image/png',base64:(await readFile(file)).toString('base64')})))};
}
