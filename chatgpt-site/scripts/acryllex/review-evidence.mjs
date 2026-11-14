// Source anatomy/material references accompany rendered early/middle/late frames during visual review.
import {mkdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {isFootageModel,resolveFootageParams} from '../../src/acryllex/media-library.ts';
import {sourceFile} from './media-assets.mjs';
import {ASSET_DIR} from './assets.mjs';

export async function referenceSheets(spec,workdir){
 const files=[],seen=new Set();await mkdir(workdir,{recursive:true});
 for(const [sceneIndex,scene] of spec.scenes.entries())for(const object of scene.objects??[]){
  const p=isFootageModel(object.model)?resolveFootageParams(object.model,object.params):object.params??{};
  const src=p.referenceFile??(isFootageModel(object.model)?p.file??p.url:undefined);if(typeof src!=='string'||!src.trim())continue;
  const key=JSON.stringify([src,p.crop,p.sourceStart]);if(seen.has(key))continue;seen.add(key);
  const file=await sourceFile(src,ASSET_DIR),out=join(workdir,`source-reference-${files.length+1}.png`);
  const crop=p.crop?`crop=${p.crop},`:'';
  const args=['-v','error','-y','-threads','2','-ss',String(p.sourceStart??0),'-i',file,'-vf',`${crop}scale=512:768:force_original_aspect_ratio=decrease,pad=512:768:(ow-iw)/2:(oh-ih)/2:black`,'-frames:v','1',out];
  const r=spawnSync('ffmpeg',args,{encoding:'utf8'});if(r.error||r.status!==0)throw new Error(`Source reference ${object.id} failed: ${r.error??r.stderr.slice(-1200)}`);
  files.push({mime:'image/png',base64:(await readFile(out)).toString('base64'),label:`SOURCE REFERENCE ${files.length+1}: scene ${sceneIndex+1}, ${object.id}, ${p.asset??src}. Captured source shape; not a rendered reel frame.`});
  if(files.length===8)return files;
 }
 return files;
}
