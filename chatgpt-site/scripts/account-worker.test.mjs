import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,readdir,rm,stat,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {HEDGY_CONCEPTS} from '../worker/hedgy-ideas.ts';
import {hedgyTopicResearch} from './hedgy-topic-research.mjs';
import {runOnce,REEL_ATTEMPTS} from './account-worker.mjs';
import {runAccountCommand} from './account-worker-evidence.mjs';
import {hedgyClient} from '../worker/hedgy-model-client.ts';
import {createReelSubscription,waitForNetwork} from './reel-subscription.mjs';

const job={id:'test-job',lease:'private-lease',account:{id:'hedgy',topic:'finance'},scheduledAt:'2026-11-16T11:15:00.000Z'};
const secret='private-key-with-"quotes"-and-\\slashes';
const env={OPENAI_API_KEY:secret,ACCOUNT_WORKER_TOKEN:'worker-secret-value',OCE_SITES_ACCESS_TOKEN:'sites-secret-value'};
const config={headers:{authorization:'Bearer worker-secret-value','OAI-Sites-Authorization':'Bearer sites-secret-value'}};
async function fixture(run){
 const cacheRoot=await mkdtemp(join(tmpdir(),'oce-account-test-')),calls=[],logs=[];
 const fetchSite=async(_config,path,init)=>{calls.push({path,init});return Response.json(path.endsWith('/claim')?{job}:{});};
 const hedgyResearch=hedgyTopicResearch({HEDGY_TOPIC_LEDGER:join(cacheRoot,'topic-ledger')},async()=>({runId:'fixture',results:[{title:'Traffic research',url:HEDGY_CONCEPTS[0].source,snippet:HEDGY_CONCEPTS[0].context}]}));
 const options={cacheRoot,env,hedgyResearch,fetchSite,subscription:null,keepAwake:()=>()=>{},sleep:async()=>{},log:{log:s=>logs.push(s),error:s=>logs.push(s)}};
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

const ndjson=(events,exitCode=0)=>({exitCode,stdout:events.map(e=>JSON.stringify(e)).join('\n'),stderr:''});
const openaiRequest={provider:'openai',step:'plan',model:'gpt-6.2-sol',effort:'xhigh',input:'Plan a reel'};
const claudeRequest={provider:'anthropic',step:'visual-realization',model:'claude-opus-5-5',effort:'medium',input:'Realize the visuals'};

test('subscription runners isolate credentials and stop using only the exhausted provider until its reset',async()=>{
 let time=1000;
 const commands=[];
 const ask=createReelSubscription({env,now:()=>time,online:async()=>false,run:async(bin,args,config)=>{
  commands.push({bin,args,config});
  assert.equal(config.env.OPENAI_API_KEY,undefined);
  assert.equal(config.env.ACCOUNT_WORKER_TOKEN,undefined);
  if(args[0]==='auth')return ndjson([{loggedIn:true,authMethod:'claude.ai',apiProvider:'firstParty'}]);
  if(args[0]==='exec'){
   assert.ok(args.includes('forced_login_method="chatgpt"'));
   assert.ok(args.includes('model_reasoning_effort="xhigh"'));
   if(time<10000)return ndjson([{type:'turn.failed',error:{message:JSON.stringify({error:{type:'usage_limit_reached',resets_at:10}})}}],1);
   return ndjson([{type:'item.completed',item:{type:'agent_message',text:'Sol result'}},{type:'turn.completed'}]);
  }
  assert.equal(config.env.CLAUDE_CODE_MAX_RETRIES,'0');
  assert.ok(args.includes('--max-turns'));
  assert.deepEqual(JSON.parse(config.input).message.content[1],{type:'image',source:{type:'base64',media_type:'image/png',data:'aW1hZ2U='}});
  return ndjson([{type:'assistant',message:{id:'msg',model:claudeRequest.model}},
   {type:'result',subtype:'success',stop_reason:'end_turn',num_turns:1,result:'Opus result'}]);
 }});
 assert.equal((await ask(openaiRequest)).status,'subscription_exhausted');
 assert.equal((await ask(openaiRequest)).status,'subscription_exhausted');
 assert.equal(commands.length,1);
 assert.equal((await ask({...claudeRequest,images:[{mime:'image/png',base64:'aW1hZ2U='}]})).text,'Opus result');
 time=10000;
 assert.equal((await ask(openaiRequest)).text,'Sol result');
});

test('Claude needs an explicit exhausted plan window and no output or retry before API fallback',async()=>{
 const quota={type:'rate_limit_event',rate_limit_info:{status:'rejected',errorCode:'credits_required',rateLimitType:'five_hour',resetsAt:10}};
 const failure={type:'result',subtype:'error_during_execution',is_error:true,api_error_status:429,errors:['Usage limit']};
 const create=(events,authMethod='claude.ai')=>createReelSubscription({online:async()=>false,run:async(_bin,args)=>args[0]==='auth'?
  ndjson([{loggedIn:true,authMethod,apiProvider:'firstParty'}]):ndjson(events,1)});
 assert.equal((await create([quota,failure])(claudeRequest)).status,'subscription_exhausted');
 await assert.rejects(create([failure])(claudeRequest),/did not complete/);
 await assert.rejects(create([{type:'system',subtype:'api_retry'},quota,failure])(claudeRequest),/did not complete/);
 await assert.rejects(create([{type:'assistant',message:{id:'msg',model:claudeRequest.model}},quota,failure])(claudeRequest),/did not complete/);
 await assert.rejects(create([quota,failure],'console')(claudeRequest),/signed-in Claude subscription/);
});

test('Sol transport failures retry the identical request after the network returns; Opus never retries',async()=>{
 const runs=[],waits=[],sleeps=[],logs=[];let fail=2;
 const ask=createReelSubscription({env,online:async host=>{waits.push(host);return false;},sleep:async ms=>{sleeps.push(ms);},log:{error:m=>logs.push(m)},run:async(_bin,args,config)=>{
  runs.push({args,timeoutMs:config.timeoutMs});
  if(args[0]==='auth')return ndjson([{loggedIn:true,authMethod:'claude.ai',apiProvider:'firstParty'}]);
  if(args[0]==='exec'){if(fail-->0)return ndjson([{type:'error',message:'workspace routing discovery failed'},{type:'turn.failed',error:{message:'stream disconnected'}}],1);
   return ndjson([{type:'item.completed',item:{type:'agent_message',text:'Sol result'}},{type:'turn.completed'}]);}
  return ndjson([{type:'result',subtype:'error_during_execution',is_error:true,errors:['Connection error']}],1);
 }});
 assert.equal((await ask({...openaiRequest,effort:'medium'})).text,'Sol result');
 assert.equal(runs.length,3);assert.deepEqual(sleeps,[30000,60000]);assert.equal(logs.length,2);
 assert.ok(runs.every(r=>r.timeoutMs===20*60*1000),'Medium Sol calls are bounded at 20 minutes');
 assert.deepEqual(waits,['chatgpt.com','chatgpt.com','chatgpt.com']);
 fail=5;runs.length=0;
 await assert.rejects(ask({...openaiRequest,effort:'medium'}),/did not return a complete response/);
 assert.equal(runs.length,3,'Sol gives up after three identical attempts');
 runs.length=0;
 await assert.rejects(ask(claudeRequest),/did not complete/);
 assert.equal(runs.filter(r=>r.args[0]!=='auth').length,1,'Opus attempts count against the stage budget and are never retried');
 assert.equal(waits.at(-1),'api.anthropic.com');
});

test('network wait polls DNS until it resolves and gives up after its bound',async()=>{
 let t=0,fails=3;const sleeps=[];
 const waited=await waitForNetwork('chatgpt.com',{resolve:async()=>{if(fails-->0)throw Error('ENOTFOUND');},sleep:async ms=>{sleeps.push(ms);t+=ms;},now:()=>t,stepMs:1000,limitMs:60000});
 assert.equal(waited,true);assert.equal(sleeps.length,3);
 t=0;const gaveUp=await waitForNetwork('chatgpt.com',{resolve:async()=>{throw Error('ENOTFOUND');},sleep:async ms=>{t+=ms;},now:()=>t,stepMs:1000,limitMs:5000});
 assert.equal(gaveUp,true);assert.ok(t>=5000);
});

test('Hedgy bills the API only on subscription exhaustion and preserves xhigh',async()=>{
 const original=globalThis.fetch,requests=[],usage=[];
 globalThis.fetch=async(_url,init)=>{
  requests.push(JSON.parse(init.body));
  return Response.json({status:'completed',output:[{content:[{type:'output_text',text:'API result'}]}]});
 };
 try{
  for(const [request,expected] of [[async()=>({status:'completed',text:'Subscription result'}),'Subscription result'],[async()=>({status:'subscription_exhausted'}),'API result']]){
   assert.equal(await hedgyClient('test',entry=>usage.push(entry),request)('plan','brief'),expected);
  }
  await assert.rejects(hedgyClient('test',undefined,async()=>{throw Error('Not signed in');})('plan','brief'),{code:'subscription_failed'});
  assert.equal(requests.length,1);
  assert.deepEqual(requests[0].reasoning,{effort:'xhigh'});
  assert.deepEqual(usage.map(e=>[e.billing,e.status]),[
   ['subscription','started'],['subscription','completed'],['subscription','started'],['subscription','subscription_exhausted'],['api','started'],['api','completed'],
  ]);
 }finally{globalThis.fetch=original;}
});

test('incomplete output is logged with stage, reason, request ID and usage; no retry, and the reel still finishes from fallbacks',async()=>{
 const original=globalThis.fetch;let calls=0;const usage={output_tokens:3000,output_tokens_details:{reasoning_tokens:3000}};
 globalThis.fetch=async(_url,init)=>{
  calls++;
  const name=JSON.parse(init.body).text?.format?.name;
  const {id,source,tag,...topic}=HEDGY_CONCEPTS[0];
  const answer=name==='hedgy_topic_query'?{query:'research unexpected traffic phenomena'}:name==='hedgy_topic_research'?{topics:[{...topic,topic:id,sourceIndex:0}]}:undefined;
  if(answer)return stream([{type:'response.completed',response:{id:'research-ok',status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(answer)}]}]}}]);
  return stream([{type:'response.incomplete',response:{id:'resp-incomplete',status:'incomplete',incomplete_details:{reason:'max_output_tokens'},usage}}]);
 };
 try{
  await fixture(async({cacheRoot,options})=>{
   assert.equal(await runOnce(config,options),true);
   // Two research requests, then one failed idea request with no retry.
   assert.equal(calls,3);
   const events=(await readFile(join(cacheRoot,job.id,'generation-events.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
   const failed=events.find(e=>e.status==='failed');
   assert.equal(failed.step,'idea-1');assert.equal(failed.code,'generation_incomplete');assert.equal(failed.incompleteReason,'max_output_tokens');
   assert.deepEqual(failed.usage,usage);assert.equal(failed.requestId,'req-test');
   assert.ok(events.some(e=>e.status==='degraded-to-fallback'&&e.step==='idea-1'));
   const provenance=JSON.parse(await readFile(join(cacheRoot,job.id,'provenance.json'),'utf8'));
   assert.equal(provenance.editorial.modelFailure.step,'idea-1');
   assert.equal(provenance.editorial.storyboardFallback,'deterministic topic storyboard');
   assert.equal(provenance.editorial.storyUnresolved,true);
   assert.equal((await stat(join(cacheRoot,job.id))).mode&0o777,0o700);
  });
 }finally{globalThis.fetch=original;}
});

test('provider errors remain diagnosable while all configured credentials are redacted',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({error:{code:'invalid_api_key',message:`Bad key ${secret}; Bearer unknown-provider-secret; worker-secret-value sites-secret-value`}}, {status:401,headers:{'x-request-id':'req-denied'}});
 try{await fixture(async({cacheRoot,calls,logs,options})=>{
  await runOnce(config,options);
  const failure=await readFile(join(cacheRoot,job.id,'failure.json'),'utf8').catch(()=>''),events=await readFile(join(cacheRoot,job.id,'generation-events.jsonl'),'utf8');
  const failed=events.trim().split('\n').map(JSON.parse).find(e=>e.status==='failed');
  assert.equal(failed.httpStatus,401);assert.equal(failed.providerError.code,'invalid_api_key');
  const all=[failure,events,...logs,...calls.map(c=>c.init?.body??'')].join('\n');
  for(const value of [...Object.values(env),JSON.stringify(secret).slice(1,-1),'unknown-provider-secret'])assert.equal(all.includes(value),false,value);
  assert.match(events,/REDACTED/);
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

test('a failure report survives the network waking up and stops on a rejected lease',async()=>{
 await fixture(async({cacheRoot,options,calls})=>{
  let offline=3;const original=options.fetchSite;
  options.fetchSite=async(c,p,i)=>{if(p.endsWith('/fail')&&offline-->0)throw Object.assign(Error('fetch failed'),{cause:{code:'ENOTFOUND'}});return original(c,p,i);};
  let held=0,released=0;
  await runOnce(config,{...options,keepAwake:()=>{held++;return ()=>released++;},makeReel:async()=>{throw Error('model failure while asleep');}});
  assert.equal(calls.filter(c=>c.path.endsWith('/fail')).length,1,'The report is delivered once the network returns');
  assert.equal(await stat(join(cacheRoot,job.id,'failure-report-error.json')).catch(()=>null),null);
  assert.deepEqual([held,released],[1,1],'The job holds a sleep assertion only while it runs');
 });
 await fixture(async({cacheRoot,options})=>{
  let tries=0;const original=options.fetchSite;
  options.fetchSite=async(c,p,i)=>{if(p.endsWith('/fail')){tries++;throw Error('Site request failed (409, stale_lease). Check the Site URL and worker credentials.');}return original(c,p,i);};
  await runOnce(config,{...options,makeReel:async()=>{throw Error('late failure');}});
  assert.equal(tries,1,'A stale lease is not retried');
  assert.ok(await stat(join(cacheRoot,job.id,'failure-report-error.json')));
 });
});

test('evidence write failure still reports the job and logs its original error',async()=>{
 await fixture(async({cacheRoot,options,calls,logs})=>{
  await mkdir(join(cacheRoot,job.id));await mkdir(join(cacheRoot,job.id,'failure.json'));
  await runOnce(config,{...options,makeReel:async()=>{throw Error('original error survives disk failure');}});
  assert.ok(calls.some(c=>c.path.endsWith('/fail')));assert.ok(logs.some(s=>s.includes('original error survives disk failure')));
 });
});

test('an interrupted Hedgy generation is regenerated instead of stopping the post',async()=>{
 await fixture(async({cacheRoot,options})=>{
  await mkdir(join(cacheRoot,job.id));await writeFile(join(cacheRoot,job.id,'paid-generation-started'),'existing-start');
  const original=globalThis.fetch;globalThis.fetch=()=>{throw Error('offline provider');};
  try{await runOnce(config,options);}finally{globalThis.fetch=original;}
  assert.notEqual(await readFile(join(cacheRoot,job.id,'paid-generation-started'),'utf8'),'existing-start');
 });
});

test('a failed production is retried from cache before the job is reported',async()=>{
 await fixture(async({cacheRoot,calls,options})=>{
  let attempts=0;const done=join(cacheRoot,'done.mp4');await writeFile(done,'video');
  const original=options.fetchSite;options.fetchSite=async(c,p,i)=>p.endsWith('/output')?(calls.push({path:p,init:i}),Response.json({materialId:'material-retry'})):original(c,p,i);
  await runOnce(config,{...options,makeReel:async()=>{if(++attempts<REEL_ATTEMPTS)throw Error('transient');return {done,spec:{},provenance:{}};}});
  assert.equal(attempts,REEL_ATTEMPTS);
  assert.equal(calls.filter(c=>c.path.endsWith('/fail')).length,0);
  assert.equal(calls.filter(c=>c.path.endsWith('/complete')).length,1);
  assert.ok((await readdir(join(cacheRoot,job.id))).includes('retry-1.json'));
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
