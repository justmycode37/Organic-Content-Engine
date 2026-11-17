import {workerConfig,siteRequest} from './render-worker.mjs';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {safeId as safe,jobEvidence,publicFailure,runAccountCommand} from './account-worker-evidence.mjs';

const ROOT=fileURLToPath(new URL('../',import.meta.url)), CACHE=process.env.OCE_ACCOUNT_CACHE||join(ROOT,'.account-cache');
/** Quriozity: Sol medium plans/reviews; Opus medium realizes/repairs visuals. */
async function makeQuriozity(job,evidence){
 const cache=evidence.cache;
 const done=join(cache,'finished.mp4');
 const {produce}=await import('./quriozity/produce.mjs');
 const history=(Array.isArray(job.history)?job.history:[]).map(h=>({title:h.title,topic:h.topic,topicKey:h.topicKey,summary:h.summary}));
 const r=await produce(cache,{history});
 return {done:r.finished??done,spec:r.spec,provenance:r.provenance};
}
async function make(job,evidence){
 if(job.account?.id==='quriozity')return makeQuriozity(job,evidence);
 const cache=evidence.cache,done=join(cache,'finished.mp4'),specFile=join(cache,'spec.json'),provFile=join(cache,'provenance.json');
 let spec,provenance;
 try{spec=JSON.parse(await readFile(specFile));provenance=JSON.parse(await readFile(provFile));}catch{
  const guard=join(cache,'paid-generation-started');
  if(await stat(guard).catch(()=>null))throw Object.assign(Error('Generation was interrupted; inspect cache before repeating a paid request.'),{code:'generation_interrupted'});
  await writeFile(guard,new Date().toISOString());
  const {generateHedgyReel}=await import('../worker/hedgy-generation.ts');
  evidence.stage='generation';
  const result=await generateHedgyReel({OPENAI_API_KEY:evidence.env.OPENAI_API_KEY},job.account.topic,entry=>evidence.usage(entry),Array.isArray(job.history)?job.history:[]);
  spec=result.spec;provenance=result.provenance;
  await writeFile(specFile,JSON.stringify(spec));await writeFile(provFile,JSON.stringify(provenance));
 }
 if(!await stat(done).catch(()=>null)){
  if(await stat(join(cache,'generation-started')).catch(()=>null)){/* A saved spec is safe to render again. */}
  evidence.stage='render';
  const input=join(cache,'spec.json'),out=done;const childEnv={...evidence.env,MOTION_SPEECH_TEMPO:'0.85',MOTION_LEAD:'0.04',MOTION_TAIL:'0.12'};
  await runAccountCommand(process.execPath,[join(ROOT,'scripts/motion-audio.mjs'),input,out],childEnv);
 }
 return {done,spec,provenance};
}
export async function runOnce(config=workerConfig(),{fetchSite=siteRequest,makeReel=make,cacheRoot=CACHE,env=process.env,log=console}={}){
 const {job}=await (await fetchSite(config,'/api/jobs/accounts/claim',{method:'POST'})).json();if(!job)return false;
 const evidence=jobEvidence(cacheRoot,job,env,config),heartbeat=setInterval(()=>fetchSite(config,`/api/jobs/accounts/${job.id}/${job.lease}/heartbeat`,{method:'POST'}).catch(()=>{}),30000);
 try{
  await evidence.prepare();
  const result=await makeReel(job,evidence);evidence.stage='read-output';const bytes=await readFile(result.done);
  evidence.stage='upload';
  const {materialId}=await (await fetchSite(config,`/api/jobs/accounts/${job.id}/${job.lease}/output`,{method:'PUT',headers:{'content-type':'video/mp4','content-length':String(bytes.length)},body:bytes})).json();
  evidence.stage='complete';
  await fetchSite(config,`/api/jobs/accounts/${job.id}/${job.lease}/complete`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({materialId,spec:result.spec,provenance:result.provenance})});
  log.log(`Account job ${safe(job.id)} complete`);
 }catch(error){
  const failure=evidence.failure(error),message=publicFailure(error,evidence.stage);
  try{await evidence.save('failure.json',failure);}catch{log.error(`Account job ${safe(job.id)} could not save private failure evidence`);}
  log.error(evidence.text(failure));
  try{await fetchSite(config,`/api/jobs/accounts/${job.id}/${job.lease}/fail`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:'account_failed',message})});}
  catch(reportError){const report=evidence.failure(reportError);try{await evidence.save('failure-report-error.json',report);}catch{}log.error(evidence.text({event:'failure-report-error',...report}));}
 }finally{clearInterval(heartbeat);}return true;
}
export async function tick(config=workerConfig()){await siteRequest(config,'/api/jobs/accounts/tick',{method:'POST'});}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){let stopping=false,ticking=false;const ticker=setInterval(async()=>{if(ticking)return;ticking=true;try{await tick();}catch{console.error('Account scheduling tick unavailable');}finally{ticking=false;}},30000);process.once('SIGINT',()=>stopping=true);process.once('SIGTERM',()=>stopping=true);do{try{if(!await runOnce())await new Promise(r=>setTimeout(r,10000));}catch{console.error('Account queue unavailable; check worker setup.');await new Promise(r=>setTimeout(r,10000));}}while(!stopping);clearInterval(ticker);}
