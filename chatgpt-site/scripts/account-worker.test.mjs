import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,readdir,rm,stat,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {runOnce} from './account-worker.mjs';
import {runAccountCommand} from './account-worker-evidence.mjs';
import {hedgyClient} from '../worker/hedgy-model-client.ts';

const job={id:'test-job',lease:'private-lease',account:{id:'hedgy',topic:'finance'},scheduledAt:'2026-11-16T11:15:00.000Z'};
const secret='private-key-with-"quotes"-and-\\slashes';
const env={OPENAI_API_KEY:secret,ACCOUNT_WORKER_TOKEN:'worker-secret-value',OCE_SITES_ACCESS_TOKEN:'sites-secret-value'};
const config={headers:{authorization:'Bearer worker-secret-value','OAI-Sites-Authorization':'Bearer sites-secret-value'}};
async function fixture(run){
 const cacheRoot=await mkdtemp(join(tmpdir(),'oce-account-test-')),calls=[],logs=[];
 const fetchSite=async(_config,path,init)=>{calls.push({path,init});return Response.json(path.endsWith('/claim')?{job}:{});};
 const options={cacheRoot,env,fetchSite,log:{log:s=>logs.push(s),error:s=>logs.push(s)}};
 try{await run({cacheRoot,calls,logs,options});}finally{await rm(cacheRoot,{recursive:true,force:true});}
}
const stream=(events,{crlf=false,split=13,finalNewline=true}={})=>{
 const newline=crlf?'\r\n':'\n';
 let text=events.map(e=>`event: ${e.type}${newline}data: ${JSON.stringify(e)}${newline}${newline}`).join('');
 if(!finalNewline)text=text.trimEnd();
 const bytes=new TextEncoder().encode(text);
 return new Response(new ReadableStream({start(controller){for(let i=0;i<bytes.length;i+=split)controller.enqueue(bytes.slice(i,i+split));controller.close();}}),{headers:{'content-type':'text/event-stream','x-request-id':'req-test'}});
};

test('Hedgy streams xhigh without truncating reasoning or automatically repeating paid requests',async()=>{
 const original=globalThis.fetch,calls=[],events=[];
 globalThis.fetch=async(_url,init)=>{
  calls.push(init);return stream([{type:'response.created',response:{id:'resp-test'}},{type:'response.completed',response:{id:'resp-test',status:'completed',usage:{output_tokens:18000},output:[{content:[{type:'output_text',text:'A café story.'}]}]}}],{crlf:true,split:1,finalNewline:false});
 };
 try{
  const result=await hedgyClient('test',entry=>events.push(entry))('idea-1','brief');
  assert.equal(result,'A café story.');assert.equal(calls.length,1);
  const body=JSON.parse(calls[0].body);assert.equal(body.model,'gpt-6.2-sol');assert.equal(body.reasoning.effort,'xhigh');
  assert.equal(body.stream,true);assert.equal(body.store,false);assert.equal('max_output_tokens' in body,false);assert.equal('signal' in calls[0],false);
  assert.equal(events[0].status,'started');assert.equal(events.at(-1).responseId,'resp-test');assert.equal(events.at(-1).requestId,'req-test');
 }finally{globalThis.fetch=original;}
});

test('incomplete output retains the exact stage, reason, request ID and usage; no retry or repair',async()=>{
 const original=globalThis.fetch;let calls=0;const usage={output_tokens:3000,output_tokens_details:{reasoning_tokens:3000}};
 globalThis.fetch=async()=>{calls++;return stream([{type:'response.incomplete',response:{id:'resp-incomplete',status:'incomplete',incomplete_details:{reason:'max_output_tokens'},usage}}]);};
 try{
  await fixture(async({cacheRoot,calls:routes,logs,options})=>{
   assert.equal(await runOnce(config,options),true);
   assert.equal(calls,1);assert.equal(routes.filter(c=>c.path.endsWith('/claim')).length,1);
   assert.equal(routes.some(c=>/\/(output|complete)$/.test(c.path)),false);
   const failure=JSON.parse(await readFile(join(cacheRoot,job.id,'failure.json'),'utf8'));
   assert.equal(failure.jobId,job.id);assert.equal(failure.stage,'generation');assert.equal(failure.error.code,'generation_incomplete');
   assert.equal(failure.error.details.step,'idea-1');assert.equal(failure.error.details.incompleteReason,'max_output_tokens');
   assert.deepEqual(failure.error.details.usage,usage);assert.equal(failure.error.details.requestId,'req-test');
   assert.match(JSON.parse(routes.at(-1).init.body).message,/generation idea-1.*max_output_tokens/);
   const events=(await readFile(join(cacheRoot,job.id,'generation-events.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
   assert.equal(events[0].status,'started');assert.equal(events[1].status,'incomplete');assert.equal(events.at(-1).code,'generation_incomplete');
   assert.ok(logs.some(s=>s.includes('generation_incomplete')));
   assert.equal((await stat(join(cacheRoot,job.id))).mode&0o777,0o700);
   assert.equal((await stat(join(cacheRoot,job.id,'failure.json'))).mode&0o777,0o600);
  });
 }finally{globalThis.fetch=original;}
});

test('provider errors remain diagnosable while all configured credentials are redacted',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({error:{code:'invalid_api_key',message:`Bad key ${secret}; Bearer unknown-provider-secret; worker-secret-value sites-secret-value`}}, {status:401,headers:{'x-request-id':'req-denied'}});
 try{await fixture(async({cacheRoot,calls,logs,options})=>{
  await runOnce(config,options);
  const failure=await readFile(join(cacheRoot,job.id,'failure.json'),'utf8'),events=await readFile(join(cacheRoot,job.id,'generation-events.jsonl'),'utf8');
  const data=JSON.parse(failure);assert.equal(data.error.details.httpStatus,401);assert.equal(data.error.details.providerError.code,'invalid_api_key');
  assert.match(JSON.parse(calls.at(-1).init.body).message,/HTTP 401/);
  const all=[failure,events,...logs,...calls.map(c=>c.init?.body??'')].join('\n');
  for(const value of [...Object.values(env),JSON.stringify(secret).slice(1,-1),'unknown-provider-secret'])assert.equal(all.includes(value),false,value);
  assert.match(failure,/REDACTED/);
 });}finally{globalThis.fetch=original;}
});

test('interrupted and failed streams are terminal failures with no transport retry',async()=>{
 const original=globalThis.fetch;
 try{for(const [events,code] of [
  [[{type:'response.created',response:{id:'resp-cut'}}],'model_stream_interrupted'],
  [[{type:'error',code:'server_error',message:'provider diagnostic'}],'model_failed'],
  [[{type:'response.failed',response:{status:'failed',error:{code:'server_error'}}}],'model_failed'],
  [[{type:'response.completed',response:{status:'completed',output:[]}}],'model_output_empty'],
 ]){
  let calls=0;globalThis.fetch=async()=>{calls++;return stream(events);};
  await assert.rejects(hedgyClient('test')('plan','brief'),e=>e.code===code&&e.details.step==='plan');assert.equal(calls,1);
 }}finally{globalThis.fetch=original;}
});

test('renderer failure keeps redacted stderr including split credentials and the exit code',async()=>{
 await assert.rejects(runAccountCommand(process.execPath,['-e',`process.stderr.write('encoder input invalid ');process.stderr.write(process.env.OPENAI_API_KEY.slice(0,10));process.stderr.write(process.env.OPENAI_API_KEY.slice(10)+'\\n');process.exitCode=7`],{...process.env,...env}),error=>{
  assert.equal(error.code,'renderer_failed');assert.equal(error.details.exitCode,7);assert.match(error.details.stderr,/encoder input invalid/);assert.match(error.details.stderr,/REDACTED/);assert.equal(JSON.stringify(error).includes('private-key'),false);return true;
 });
});

test('failure-report errors preserve the original failure separately',async()=>{
 await fixture(async({cacheRoot,options,logs})=>{
  const original=options.fetchSite;options.fetchSite=async(c,p,i)=>{if(p.endsWith('/fail'))throw Error('Site unavailable');return original(c,p,i);};
  await runOnce(config,{...options,makeReel:async()=>{throw Object.assign(Error('original model failure'),{code:'model_failed'});}});
  assert.equal(JSON.parse(await readFile(join(cacheRoot,job.id,'failure.json'),'utf8')).error.message,'original model failure');
  assert.equal(JSON.parse(await readFile(join(cacheRoot,job.id,'failure-report-error.json'),'utf8')).error.message,'Site unavailable');
  assert.ok(logs.some(s=>s.includes('failure-report-error')));
 });
});

test('evidence write failure still reports the job and logs its original error',async()=>{
 await fixture(async({cacheRoot,options,calls,logs})=>{
  await mkdir(join(cacheRoot,job.id));await mkdir(join(cacheRoot,job.id,'failure.json'));
  await runOnce(config,{...options,makeReel:async()=>{throw Error('original error survives disk failure');}});
  assert.ok(calls.some(c=>c.path.endsWith('/fail')));assert.ok(logs.some(s=>s.includes('original error survives disk failure')));
 });
});

test('an existing paid-generation guard prevents another provider request',async()=>{
 await fixture(async({cacheRoot,options,calls})=>{
  await mkdir(join(cacheRoot,job.id));await writeFile(join(cacheRoot,job.id,'paid-generation-started'),'existing-start');
  const original=globalThis.fetch;globalThis.fetch=()=>{throw Error('A guarded job must not call a provider');};
  try{await runOnce(config,options);}finally{globalThis.fetch=original;}
  assert.match(JSON.parse(calls.at(-1).init.body).message,/previous paid generation/);
  assert.equal(await readFile(join(cacheRoot,job.id,'paid-generation-started'),'utf8'),'existing-start');
 });
});

test('idle queue creates no cache; a completed cached reel uploads once without generation',async()=>{
 await fixture(async({cacheRoot,options,calls})=>{
  assert.equal(await runOnce(config,{...options,fetchSite:async()=>Response.json({job:null})}),false);assert.deepEqual(await readdir(cacheRoot),[]);
  const cache=join(cacheRoot,job.id);await mkdir(cache);await writeFile(join(cache,'spec.json'),'{}');await writeFile(join(cache,'provenance.json'),'{}');await writeFile(join(cache,'finished.mp4'),'cached-video');
  const original=options.fetchSite;options.fetchSite=async(c,p,i)=>p.endsWith('/output')?(calls.push({path:p,init:i}),Response.json({materialId:'material-test'})):original(c,p,i);
  await runOnce(config,options);
  assert.equal(calls.filter(c=>c.path.endsWith('/output')).length,1);assert.equal(calls.filter(c=>c.path.endsWith('/complete')).length,1);
  assert.equal(JSON.parse(calls.at(-1).init.body).materialId,'material-test');
 });
});
