import {workerConfig,siteRequest} from './render-worker.mjs';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {safeId as safe,jobEvidence,publicFailure,runAccountCommand,accountRedactor} from './account-worker-evidence.mjs';
import {hedgyTopicResearch} from './hedgy-topic-research.mjs';
import {createReelSubscription} from './reel-subscription.mjs';

const ROOT=fileURLToPath(new URL('../',import.meta.url)), CACHE=process.env.OCE_ACCOUNT_CACHE||join(ROOT,'.account-cache');
/** Quriozity: Sol medium plans/reviews; Opus medium realizes/repairs visuals. */
async function makeQuriozity(job,evidence){
 const cache=evidence.cache;
 const done=join(cache,'finished.mp4');
 const {produce}=await import('./quriozity/produce.mjs');
 const history=(Array.isArray(job.history)?job.history:[]).map(h=>({title:h.title,topic:h.topic,topicKey:h.topicKey,summary:h.summary}));
 const r=await produce(cache,{history,subscription:evidence.subscription});
 return {done:r.finished??done,spec:r.spec,provenance:r.provenance};
}
async function make(job,evidence){
 if(job.account?.id==='quriozity')return makeQuriozity(job,evidence);
 const cache=evidence.cache,done=join(cache,'finished.mp4'),specFile=join(cache,'spec.json'),provFile=join(cache,'provenance.json');
 let spec,provenance;
 try{spec=JSON.parse(await readFile(specFile));provenance=JSON.parse(await readFile(provFile));}catch{
  const guard=join(cache,'paid-generation-started');
  if(await stat(guard).catch(()=>null))throw Object.assign(Error('Generation was interrupted; inspect cache before repeating a request.'),{code:'generation_interrupted'});
  await writeFile(guard,new Date().toISOString());
  const {generateHedgyReel}=await import('../worker/hedgy-generation.ts');
  evidence.stage='generation';
  const research=evidence.hedgyResearch;
  const history=[...(Array.isArray(job.history)?job.history:[]),...await research.history()];
  const result=await generateHedgyReel({OPENAI_API_KEY:evidence.env.OPENAI_API_KEY},job.account.topic,entry=>evidence.usage(entry),history,evidence.subscription,research);
  spec=result.spec;provenance=result.provenance;
  await writeFile(specFile,JSON.stringify(spec));await writeFile(provFile,JSON.stringify(provenance));
 }
 if(!await stat(done).catch(()=>null)){
  if(await stat(join(cache,'generation-started')).catch(()=>null)){/* A saved spec is safe to render again. */}
  evidence.stage='render';
  // Render, let a second model review the actual frames, repair once and keep the better version.
  const {finishHedgy}=await import('./hedgy-finish.mjs');
  const finished=await finishHedgy(cache,spec,{env:evidence.env,onUsage:entry=>evidence.usage(entry),subscription:evidence.subscription,
   runner:(cmd,args,env)=>runAccountCommand(cmd,args,{...evidence.env,...(env??{})})});
  if(finished.spec){spec=finished.spec;provenance={...provenance,renderSelection:finished.selection};}
 }
 return {done,spec,provenance};
}
/**
 * Hold a macOS power assertion while a job runs: blocks idle sleep, and system sleep while on AC power.
 * It cannot stop clamshell (lid-closed) sleep on battery; -w releases it if the worker dies.
 */
export function keepAwakeDuringJob(){
 if(process.platform!=='darwin')return ()=>{};
 try{const child=spawn('/usr/bin/caffeinate',['-i','-s','-w',String(process.pid)],{stdio:'ignore'});child.on('error',()=>{});child.unref();return ()=>{try{child.kill();}catch{}};}
 catch{return ()=>{};}
}
const stamp=()=>new Date().toISOString();
// A report sent while the network is still waking (DNS) must not be lost: heartbeats keep
// the lease alive meanwhile, so retry within the 20-minute lease instead of failing once.
export const FAILURE_REPORT_ATTEMPTS=30,FAILURE_REPORT_SPACING=30000;
export async function runOnce(config=workerConfig(),{fetchSite=siteRequest,makeReel=make,cacheRoot=CACHE,env=process.env,log=console,subscription=createReelSubscription({env}),hedgyResearch=hedgyTopicResearch(env),keepAwake=keepAwakeDuringJob,sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 const {job}=await (await fetchSite(config,'/api/jobs/accounts/claim',{method:'POST'})).json();if(!job)return false;
 const release=keepAwake();
 const evidence=jobEvidence(cacheRoot,job,env,config),heartbeat=setInterval(()=>fetchSite(config,`/api/jobs/accounts/${job.id}/${job.lease}/heartbeat`,{method:'POST'}).catch(()=>{}),30000);
 evidence.subscription=subscription;evidence.hedgyResearch=hedgyResearch;
 log.log(`[${stamp()}] Account job ${safe(job.id)} (${safe(job.account?.id??'unknown')}) claimed`);
 try{
  await evidence.prepare();
  const result=await makeReel(job,evidence);evidence.stage='read-output';const bytes=await readFile(result.done);
  evidence.stage='upload';
  const {materialId}=await (await fetchSite(config,`/api/jobs/accounts/${job.id}/${job.lease}/output`,{method:'PUT',headers:{'content-type':'video/mp4','content-length':String(bytes.length)},body:bytes})).json();
  evidence.stage='complete';
  await fetchSite(config,`/api/jobs/accounts/${job.id}/${job.lease}/complete`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({materialId,spec:result.spec,provenance:result.provenance})});
  log.log(`[${stamp()}] Account job ${safe(job.id)} complete`);
 }catch(error){
  const failure=evidence.failure(error),message=publicFailure(error,evidence.stage);
  try{await evidence.save('failure.json',failure);}catch{log.error(`Account job ${safe(job.id)} could not save private failure evidence`);}
  log.error(evidence.text(failure));
  for(let attempt=1;;attempt++){
   try{await fetchSite(config,`/api/jobs/accounts/${job.id}/${job.lease}/fail`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:'account_failed',message})});break;}
   catch(reportError){
    // A rejected lease (4xx) will not change on retry; a network error usually clears after wake.
    const final=attempt>=FAILURE_REPORT_ATTEMPTS||/Site request failed \(4\d\d/.test(String(reportError?.message));
    if(final){const report=evidence.failure(reportError);try{await evidence.save('failure-report-error.json',report);}catch{}log.error(evidence.text({event:'failure-report-error',attempts:attempt,...report}));break;}
    await sleep(FAILURE_REPORT_SPACING);
   }
  }
 }finally{clearInterval(heartbeat);release();}return true;
}
export async function tick(config=workerConfig()){await siteRequest(config,'/api/jobs/accounts/tick',{method:'POST'});}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const subscription=createReelSubscription(),redact=accountRedactor(process.env);
 const reason=error=>redact(String(error?.cause?.code??error?.code??'')+' '+String(error?.message??error)).trim().slice(0,240);
 let stopping=false,ticking=false;
 const ticker=setInterval(async()=>{if(ticking)return;ticking=true;try{await tick();}catch(error){console.error(`[${stamp()}] Account scheduling tick unavailable: ${reason(error)}`);}finally{ticking=false;}},30000);
 process.once('SIGINT',()=>stopping=true);process.once('SIGTERM',()=>stopping=true);
 do{try{if(!await runOnce(workerConfig(),{subscription}))await new Promise(r=>setTimeout(r,10000));}catch(error){console.error(`[${stamp()}] Account queue unavailable: ${reason(error)}`);await new Promise(r=>setTimeout(r,10000));}}while(!stopping);
 clearInterval(ticker);
}
