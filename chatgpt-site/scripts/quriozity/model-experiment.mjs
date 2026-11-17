// Explicit local experiment only. Never imported by the account worker.
// node --env-file=.env.hedgy --env-file=.env.motion --env-file=.env.anthropic-experiment
//   scripts/quriozity/model-experiment.mjs <private-output-root> <opus-sol|sol-sol|opus-opus>
import {mkdir,appendFile,writeFile,readFile,copyFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import {zodOutputFormat} from '@anthropic-ai/sdk/helpers/zod';
import {z} from 'zod';
import {createHash} from 'node:crypto';

export const VARIANTS={
 'opus-sol':{generationModel:'claude-opus-5-5',reviewModel:'gpt-6.1-sol'},
 'sol-sol':{generationModel:'gpt-6.1-sol',reviewModel:'gpt-6.1-sol'},
 'opus-opus':{generationModel:'claude-opus-5-5',reviewModel:'claude-opus-5-5'},
};
export const TOPIC='Why a longer pendulum swings more slowly. Explain the causal mechanism for small swings under the same gravity, using ordinary pendulums from the existing catalogue. Keep one coherent question and answer; choose your own independent plan, script, storyboard and sound design. Use real supported motion. Do not claim that mass sets the small-angle period. This is a private comparison test; nothing will be posted.';

export function stepRole(step){
 if(step.endsWith('-repair'))return 'generation';
 if(['fact-check','coherence','novelty','storyboard-review','asset-verify','sound-review'].includes(step)||step.startsWith('visual-')||step.startsWith('voice-'))return 'review';
 return 'generation';
}

// The renderer schema contains unconstrained controls and fixed-length tuples,
// which Anthropic's schema transformer cannot represent. Those calls still use
// the original schema in their prompt and the exact same local Zod gates.
export function opusFormat(format){
 if(!format)return null;
 const schema=z.toJSONSchema(format.schema);
 const hasOpenValue=value=>value&&typeof value==='object'&&(Object.hasOwn(value,'prefixItems')||
  (value.type==='object'&&value.additionalProperties&&typeof value.additionalProperties==='object')||
  Object.values(value).some(v=>Array.isArray(v)?v.some(hasOpenValue):hasOpenValue(v)));
 if(hasOpenValue(schema))return null;
 try{return zodOutputFormat(format.schema);}catch{return null;}
}

export function languageCost(entry){
 const u=entry.usage;if(!u)return null;
 if(entry.model==='gpt-6.1-sol'){
  const input=u.input_tokens??0,cached=u.input_tokens_details?.cached_tokens??0;
  const cacheWrite=u.input_tokens_details?.cache_write_tokens??u.input_tokens_details?.cache_creation_tokens??0;
  const longWrite=u.input_tokens_details?.cache_write_tokens_details?.ttl_12h_tokens??0;
  const long=input>272000;
  return ((input-cached-cacheWrite)*2*(long?2:1)+cached*.1*(long?2:1)+(cacheWrite-longWrite)*2.5*(long?2:1)+longWrite*5*(long?2:1)+(u.output_tokens??0)*10*(long?1.5:1))/1e6;
 }
 if(entry.model==='claude-opus-5-5')return ((u.input_tokens??0)*4+(u.output_tokens??0)*20+(u.cache_read_input_tokens??0)*.2+(u.cache_creation_input_tokens??0)*5)/1e6;
 throw new Error(`No verified price for ${entry.model}`);
}

async function run(root,variant){
 const models=VARIANTS[variant];if(!models)throw new Error('Choose opus-sol, sol-sol, or opus-opus');
 const workdir=join(resolve(root),variant);await mkdir(workdir,{recursive:true});
 const siteRoot=fileURLToPath(new URL('../../',import.meta.url));
 const catalogFiles=[['src/quriozity/assets/catalog.json','catalog.json'],['scripts/quriozity/sourced-assets.json','sourced-assets.json']];
 const baseline=join(resolve(root),'baseline');await mkdir(baseline,{recursive:true});
 const resume=await readFile(join(workdir,'spec.draft.json')).then(()=>true,()=>false);
 for(const [relative,name]of catalogFiles){
  const pinned=join(baseline,name);
  try{await readFile(pinned);}catch{await copyFile(join(siteRoot,relative),pinned);}
  const snapshot=join(workdir,'snapshot-'+name);
  const source=resume&&await readFile(snapshot).then(()=>true,()=>false)?snapshot:pinned;
  await copyFile(source,join(siteRoot,relative));
 }
 const context={...models,effort:'medium',variant};
 const allowUnapproved=await readFile(join(resolve(root),'include-unapproved.json'),'utf8').then(v=>JSON.parse(v).enabled===true,()=>false);
 process.env.QURIOZITY_REASONING_EFFORT='medium';
 process.env.QURIOZITY_AUDIO_CACHE=join(workdir,'audio-cache');
 const started=Date.now(),stateFile=join(workdir,'experiment.json');
 let state;try{state=JSON.parse(await readFile(stateFile,'utf8'));}catch{state={startedAt:new Date(started).toISOString(),attempts:[]};}
 Object.assign(state,{...context,topic:TOPIC,publish:false,allowUnapproved,status:'running'});delete state.error;delete state.endedAt;
 const attempt={startedAt:new Date(started).toISOString()};state.attempts.push(attempt);
 const save=()=>writeFile(stateFile,JSON.stringify(state,null,2));await save();
 const realFetch=globalThis.fetch;
 const pending=[];
 const usage=entry=>{
  const item={at:new Date().toISOString(),role:stepRole(entry.step),...entry};
  if(item.usage)item.costUsd=languageCost(item);
  pending.push(appendFile(join(workdir,'model-usage.jsonl'),JSON.stringify(item)+'\n'));
  console.log(`[experiment ${variant}] ${entry.step}: ${entry.model} ${entry.status} ${entry.seconds?.toFixed(1)}s`);
 };
 // A hard write allowlist prevents this process from publishing or scheduling a reel.
 globalThis.fetch=async(input,init={})=>{
  const url=new URL(typeof input==='string'?input:input.url??String(input));
  const method=(init.method??'GET').toUpperCase();
  const writeAllowed=(url.hostname==='api.openai.com'&&url.pathname==='/v1/responses')||
   (url.hostname==='api.anthropic.com'&&url.pathname==='/v1/messages')||
   (url.hostname==='api.elevenlabs.io'&&/^\/v1\/(text-to-speech\/|music$|sound-generation$)/.test(url.pathname));
  if(!['GET','HEAD'].includes(method)&&!writeAllowed)throw new Error(`Experiment blocks external write: ${url.hostname}${url.pathname}`);
  const start=performance.now(),response=await realFetch(input,init);
  if(url.hostname==='api.elevenlabs.io'&&method==='POST'){
   let body={};try{body=JSON.parse(init.body);}catch{}
   const entry={at:new Date().toISOString(),endpoint:url.pathname,status:response.status,seconds:(performance.now()-start)/1000,
    characterCost:response.headers.get('character-cost'),requestId:response.headers.get('request-id'),
    characters:body.text?.length,generatedSeconds:body.duration_seconds??(body.music_length_ms?body.music_length_ms/1000:undefined),
    headers:Object.fromEntries([...response.headers].filter(([k])=>/cost|credit|usage|request-id|history-item-id/i.test(k)))};
   await appendFile(join(workdir,'audio-usage.jsonl'),JSON.stringify(entry)+'\n');
  }
  return response;
 };
 const subscription=async()=>{
  const r=await realFetch('https://api.elevenlabs.io/v1/user/subscription',{headers:{'xi-api-key':process.env.ELEVENLABS_API_KEY}});
  if(!r.ok)throw new Error(`ElevenLabs accounting unavailable (${r.status})`);return r.json();
 };
 try{
  const priorAudio=await readFile(join(workdir,'audio-usage.jsonl'),'utf8').catch(()=>'');
  if(!state.audioBefore||!priorAudio.trim())state.audioBefore=await subscription();await save();
  const gen=await import('../../worker/quriozity-generation.ts');
  const sol=gen.solClient(process.env.OPENAI_API_KEY,usage,undefined,'medium');
  const anthropic=new Anthropic({apiKey:process.env.ANTHROPIC_API_KEY,maxRetries:0,timeout:60*60*1000});
  const opus=async(step,input,_max,format,images=[],context)=>{
   const structured=opusFormat(format);
   const prompt=format&&!structured?`${input}\nReturn ONLY a valid JSON object matching this schema, with no Markdown or commentary: ${JSON.stringify(z.toJSONSchema(format.schema))}`:input;
   const content=[{type:'text',text:prompt},...images.map(i=>({type:'image',source:{type:'base64',media_type:i.mime,data:i.base64}}))];
   for(let retry=0;retry<3;retry++){
    const start=performance.now();
    try{
     const stream=anthropic.messages.stream({model:'claude-opus-5-5',max_tokens:128000,
      output_config:{effort:'medium',...(structured?{format:structured}:{})},
      ...(context?.prefix?{system:context.prefix}:{}),messages:[{role:'user',content}]});
     let lastProgress=performance.now();
     stream.on('text',(_delta,snapshot)=>{if(performance.now()-lastProgress>30000){console.log(`[experiment ${variant}] ${step}: streaming ${snapshot.length} text characters`);lastProgress=performance.now();}});
     const response=await stream.finalMessage();
     usage({provider:'anthropic',step,role:stepRole(step),model:response.model,effort:'medium',status:response.stop_reason,usage:response.usage,seconds:(performance.now()-start)/1000});
     if(response.stop_reason!=='end_turn')throw new Error(`Opus stopped: ${response.stop_reason}`);
     return response.content.filter(b=>b.type==='text').map(b=>b.text).join('');
    }catch(e){
     if(![429,500,502,503,529].includes(e.status)||retry===2)throw e;
     usage({provider:'anthropic',step,role:stepRole(step),model:'claude-opus-5-5',effort:'medium',status:`http-${e.status}`,seconds:(performance.now()-start)/1000});
     await new Promise(r=>setTimeout(r,5000*(retry+1)));
    }
   }
   throw new Error('Opus retries exhausted');
  };
  const callsDir=join(workdir,'calls');await mkdir(callsDir,{recursive:true});
  const previous=[];let callNumber=0;
  for(const name of await readdir(callsDir)){
   callNumber=Math.max(callNumber,Number(name.split('-')[0])||0);
   try{previous.push({request:JSON.parse(await readFile(join(callsDir,name,'request.json'),'utf8')),output:await readFile(join(callsDir,name,'response.txt'),'utf8')});}catch{}
  }
  const ask=async(step,...args)=>{
   const role=stepRole(step),model=role==='review'?models.reviewModel:models.generationModel;
   const imageHashes=(args[3]??[]).map(i=>createHash('sha256').update(i.base64).digest('hex'));
   const request={step,role,model,effort:'medium',input:args[0],prefix:args[4]?.prefix,format:args[2]?.name,imageCount:imageHashes.length,imageHashes};
   const cached=previous.find(({request:r})=>r.step===step&&r.model===model&&r.effort==='medium'&&r.input===request.input&&r.prefix===request.prefix&&r.format===request.format&&r.imageCount===request.imageCount&&
    (imageHashes.length===0||JSON.stringify(r.imageHashes)===JSON.stringify(imageHashes)));
   if(cached){console.log(`[experiment ${variant}] saved response: ${step} ${model}`);return cached.output;}
   const dir=join(workdir,'calls',`${String(++callNumber).padStart(3,'0')}-${step}`);await mkdir(dir,{recursive:true});
   await writeFile(join(dir,'request.json'),JSON.stringify(request,null,1));
   const output=await (model==='claude-opus-5-5'?opus:sol)(step,...args);
   await writeFile(join(dir,'response.txt'),output);return output;
  };
  const {produce}=await import('./produce.mjs');
  const result=await produce(workdir,{topic:TOPIC,clients:{ask,context},recordHistory:false,allowUnapproved});
  state.status=result.provenance.unapprovedTest?'completed-unapproved':'completed';state.finished=result.finished;
 }catch(e){
  state.status='failed';state.error=e.message;console.error(`[experiment ${variant}] ${e.message}`);process.exitCode=1;
 }finally{
  await Promise.all(pending);attempt.endedAt=new Date().toISOString();attempt.elapsedSeconds=(Date.now()-started)/1000;
  state.elapsedSeconds=state.attempts.reduce((n,a)=>n+(a.elapsedSeconds??0),0);state.endedAt=attempt.endedAt;
  state.audioAfter=await subscription().catch(e=>({error:e.message}));
  for(const [relative,name]of catalogFiles){
   await copyFile(join(siteRoot,relative),join(workdir,'snapshot-'+name));
   await copyFile(join(baseline,name),join(siteRoot,relative));
  }
  try{
   const r=await realFetch('https://api.elevenlabs.io/v1/workspace/analytics/query/usage-by-product-over-time',{
    method:'POST',headers:{'xi-api-key':process.env.ELEVENLABS_API_KEY,'content-type':'application/json'},
    body:JSON.stringify({start_time:Date.parse(state.startedAt),end_time:Date.now(),interval_seconds:60,group_by:['product_type','model','fiat_currency','fiat_charge_type']})});
   state.audioAnalytics={status:r.status,...await r.json()};
  }catch(e){state.audioAnalytics={error:e.message};}
  await save();globalThis.fetch=realFetch;
 }
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 if(!process.argv[2])throw new Error('Output root required');await run(process.argv[2],process.argv[3]);
 process.exit(process.exitCode??0);
}
