import {readFile,mkdir,stat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {writeAtomic} from './atomic-file.mjs';
import {parseBodySource,bodySourceKey,inspectHumanBodyGLB,MAX_BODY_BYTES} from '../../src/acryllex/human-body-source.ts';
export {inspectHumanBodyGLB,bodySourceKey};
const sha=b=>createHash('sha256').update(b).digest('hex'),fail=s=>{throw Error(`bodySource: ${s}`);};
const HUMAN=/^(human|person|man|woman|child|people|scientist|engineer|worker|student|human-body|human-male|anatomical-man|male-body|male-figure|man-anatomical|human-female|anatomical-woman|female-body|female-figure|woman-anatomical)$/i;

/** Content-addressed bytes; optional pins are checked on every read, including cached files. No raw sources are bundled. */
export async function prepareHumanBodies(spec,assetDir,{fetcher=fetch}={}){
 const out={};
 for(const scene of spec.scenes??[])for(const object of scene.objects??[]){
  if(!HUMAN.test(String(object.model).trim().replace(/[\s_]+/g,'-')))continue;
  const config=parseBodySource(object.params?.bodySource,object.params?.body);if(!config)continue;
  const key=bodySourceKey(config);if(out[key])continue;
  const dir=join(assetDir,'human-bodies'),pointer=join(dir,`url-${sha(config.src)}.json`);let bytes,expected=config.sha256;
  try{
   if(config.remote){
    if(!expected){try{const meta=JSON.parse(await readFile(pointer,'utf8'));if(!/^[a-f\d]{64}$/.test(meta.sha256))fail('invalid cached URL digest');expected=meta.sha256;}catch(e){if(e.code!=='ENOENT')throw e;}}
    if(expected){try{bytes=await readFile(join(dir,expected+'.glb'));}catch(e){if(e.code!=='ENOENT')throw e;}}
    if(!bytes){const response=await fetcher(config.src,{signal:AbortSignal.timeout(120000)});if(!response.ok)fail(`HTTP${response.status}`);const parts=[];let n=0;for await(const part of response.body){n+=part.length;if(n>MAX_BODY_BYTES)fail('source exceeds128MiB');parts.push(Buffer.from(part));}bytes=Buffer.concat(parts);}
   }else{if((await stat(resolve(config.src))).size>MAX_BODY_BYTES)fail('source exceeds128MiB');bytes=await readFile(resolve(config.src));}
   const digest=sha(bytes);if(expected&&digest!==expected)fail('source SHA256 mismatch');inspectHumanBodyGLB(bytes);
   await mkdir(dir,{recursive:true});const rel=`human-bodies/${digest}.glb`;await writeAtomic(join(assetDir,rel),bytes);
   if(config.remote&&!config.sha256)await writeAtomic(pointer,Buffer.from(JSON.stringify({sha256:digest})+'\n'));
   out[key]=rel;
  }catch(e){if(e.message?.startsWith('bodySource:'))throw e;fail(`${config.src}: ${e.message??String(e)}`);}
 }
 return out;
}
