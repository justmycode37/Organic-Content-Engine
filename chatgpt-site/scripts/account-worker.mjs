import {workerConfig,siteRequest} from './render-worker.mjs';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,rename,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const ROOT=fileURLToPath(new URL('../',import.meta.url)), CACHE=process.env.OCE_ACCOUNT_CACHE||join(ROOT,'.account-cache');
const safe=s=>String(s).replace(/[^a-zA-Z0-9_-]/g,'_');
async function run(bin,args,env){await new Promise((resolve,reject)=>{const c=spawn(bin,args,{env,stdio:['ignore','ignore','ignore']});c.once('error',reject);c.once('close',n=>n===0?resolve():reject(Error(`${bin} failed (${n})`)));});}
async function make(job,dir){
 const cache=join(CACHE,`${safe(job.id)}`), done=join(cache,'finished.mp4'),specFile=join(cache,'spec.json'),provFile=join(cache,'provenance.json');
 await mkdir(cache,{recursive:true});let spec,provenance;
 try{spec=JSON.parse(await readFile(specFile));provenance=JSON.parse(await readFile(provFile));}catch{
  const guard=join(cache,'paid-generation-started');
  if(await stat(guard).catch(()=>null))throw Error('Generation was interrupted; inspect cache before repeating a paid request.');
  await writeFile(guard,new Date().toISOString());
  const {generateHedgyReel}=await import('../worker/hedgy-generation.ts');
  const result=await generateHedgyReel({OPENAI_API_KEY:process.env.OPENAI_API_KEY},job.account.topic);
  spec=result.spec;provenance=result.provenance;
  await writeFile(specFile,JSON.stringify(spec));await writeFile(provFile,JSON.stringify(provenance));
 }
 if(!await stat(done).catch(()=>null)){
  if(await stat(join(cache,'generation-started')).catch(()=>null)){/* A saved spec is safe to render again. */}
  const input=join(cache,'spec.json'),out=done;const childEnv={...process.env,MOTION_SPEECH_TEMPO:'0.85',MOTION_LEAD:'0.04',MOTION_TAIL:'0.12'};
  await run(process.execPath,[join(ROOT,'scripts/motion-audio.mjs'),input,out],childEnv);
 }
 return {done,spec,provenance};
}
export async function runOnce(config=workerConfig()){
 const {job}=await (await siteRequest(config,'/api/jobs/accounts/claim',{method:'POST'})).json();if(!job)return false;
 const scratch=await mkdtemp(join(tmpdir(),'oce-account-')),heartbeat=setInterval(()=>siteRequest(config,`/api/jobs/accounts/${job.id}/${job.lease}/heartbeat`,{method:'POST'}).catch(()=>{}),30000);
 try{
  const result=await make(job,scratch),bytes=await readFile(result.done);
  const {materialId}=await (await siteRequest(config,`/api/jobs/accounts/${job.id}/${job.lease}/output`,{method:'PUT',headers:{'content-type':'video/mp4','content-length':String(bytes.length)},body:bytes})).json();
  await siteRequest(config,`/api/jobs/accounts/${job.id}/${job.lease}/complete`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({materialId,spec:result.spec,provenance:result.provenance})});
  console.log(`Account job ${safe(job.id)} complete`);
 }catch(error){const message=String(error).includes('OPENAI_API_KEY')?'Account generation is not configured.':'Account video generation failed.';await siteRequest(config,`/api/jobs/accounts/${job.id}/${job.lease}/fail`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:'account_failed',message})}).catch(()=>{});console.error(`Account job ${safe(job.id)} failed`);
 }finally{clearInterval(heartbeat);await rm(scratch,{recursive:true,force:true});}return true;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){let stopping=false;process.once('SIGINT',()=>stopping=true);process.once('SIGTERM',()=>stopping=true);do{try{if(!await runOnce())await new Promise(r=>setTimeout(r,10000));}catch{console.error('Account queue unavailable; check worker setup.');await new Promise(r=>setTimeout(r,10000));}}while(!stopping);}
