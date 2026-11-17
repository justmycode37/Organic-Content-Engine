import test from 'node:test';
import assert from 'node:assert/strict';
import {z} from 'zod';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {opusRepairBudget,solRepairBudget} from './quriozity/repair-budget.mjs';
import {quriozityClient} from '../worker/quriozity-generation.ts';
import {QURIOZITY_MODELS,QURIOZITY_CLIENT_CONTEXT,quriozityStepRole,usesOpusVisuals,hasDefaultQuriozityProfile} from '../worker/quriozity-model-policy.ts';
import {narrationRequest} from './quriozity/produce.mjs';
import {reviewNarrationDelivery,reviewVoicePacing,voicePacingMetrics} from '../worker/quriozity-quality.ts';

test('default routing separates all authoring/repairs from every review specialty',()=>{
 for(const step of ['plan','script','asset-needs','asset-pick','storyboard','storyboard-review-repair','sound-design','fact-check','visual-subject-review'])assert.equal(usesOpusVisuals(step),false,step);
 for(const step of ['visual-realization','visual-realization-repair','visual-subject-review-repair','visual-composition-review-repair','visual-continuity-review-repair','visual-style-reference-review-repair','visual-final-review-repair'])assert.equal(usesOpusVisuals(step),true,step);
 for(const step of ['plan','script','asset-needs','asset-pick','storyboard','storyboard-review-repair','sound-design','visual-final-review-repair'])assert.equal(quriozityStepRole(step),'generation',step);
 for(const step of ['fact-check','coherence','novelty','asset-verify','storyboard-review','visual-subject-review','visual-composition-review','visual-continuity-review','visual-style-reference-review','visual-final-review','voice-delivery-review','voice-pacing-review','sound-review'])assert.equal(quriozityStepRole(step),'review',step);
 assert.deepEqual(QURIOZITY_MODELS,{generation:{model:'gpt-6.1-sol',effort:'medium'},visual:{model:'claude-opus-5-5',effort:'medium'},review:{model:'gpt-6.1-sol',effort:'medium'}});
 assert.ok(hasDefaultQuriozityProfile({modelRouting:QURIOZITY_CLIENT_CONTEXT}));
 assert.ok(!hasDefaultQuriozityProfile({model:'gpt-6.1-sol',effort:'xhigh'}));
 assert.ok(!hasDefaultQuriozityProfile({modelRouting:{...QURIOZITY_CLIENT_CONTEXT,reviewEffort:'xhigh'}}));
 assert.ok(!hasDefaultQuriozityProfile({model:'gpt-6.1-sol',effort:'xhigh',modelRouting:QURIOZITY_CLIENT_CONTEXT}),'New repair settings cannot relabel an older draft as Opus-authored');
});

const anthropicStream=text=>[
 ['message_start',{type:'message_start',message:{id:'msg_test',type:'message',role:'assistant',model:'claude-opus-5-5',content:[],stop_reason:null,stop_sequence:null,usage:{input_tokens:10,output_tokens:0}}}],
 ['content_block_start',{type:'content_block_start',index:0,content_block:{type:'text',text:''}}],
 ['content_block_delta',{type:'content_block_delta',index:0,delta:{type:'text_delta',text}}],
 ['content_block_stop',{type:'content_block_stop',index:0}],
 ['message_delta',{type:'message_delta',delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:5}}],
 ['message_stop',{type:'message_stop'}],
].map(([event,data])=>`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('');

test('actual clients send Sol planning/reviews and Opus visual realization/repairs, without live API calls',async()=>{
 const original=globalThis.fetch,requests=[],usage=[];
 globalThis.fetch=async(url,init)=>{
  requests.push({url:String(url),body:JSON.parse(init.body)});
  const text=String(url).includes('anthropic.com')?anthropicStream('{"ok":true}'):`data: ${JSON.stringify({type:'response.completed',response:{status:'completed',usage:{input_tokens:10,output_tokens:5},output:[{content:[{type:'output_text',text:'{"ok":true}'}]}]}})}\n\n`;
  return new Response(text,{headers:{'content-type':'text/event-stream'}});
 };
 try{
  const ask=quriozityClient({ANTHROPIC_API_KEY:'test-only',OPENAI_API_KEY:'test-only'},entry=>usage.push(entry));
  for(const step of ['plan','visual-realization','fact-check','visual-composition-review-repair'])assert.equal(await ask(step,'Test',0,{name:'result',schema:z.object({ok:z.boolean()})}),'{"ok":true}');
  assert.equal(requests[0].body.model,'gpt-6.1-sol');assert.equal(requests[0].body.reasoning.effort,'medium');
  assert.equal(requests[1].body.model,'claude-opus-5-5');assert.equal(requests[1].body.output_config.effort,'medium');
  assert.equal(requests[2].body.model,'gpt-6.1-sol');assert.equal(requests[2].body.reasoning.effort,'medium');
  assert.equal(requests[3].body.model,'claude-opus-5-5');
  assert.deepEqual(usage.map(u=>u.effort),['medium','medium','medium','medium']);
 }finally{globalThis.fetch=original;}
});

test('ElevenLabs receives no speed override, including for legacy slowed directions and retakes',()=>{
 for(const take of [1,2,6]){
  const request=narrationRequest({text:'A clear sentence.',speed:.72},take);
  assert.ok(!Object.hasOwn(request.voice_settings,'speed'));
  assert.equal(request.model_id,'eleven_multilingual_v2');
 }
 assert.notEqual(narrationRequest({text:'A clear sentence.'},1).seed,narrationRequest({text:'A clear sentence.'},2).seed);
});

test('delivery/timing reviews cannot control speed or reject native word rate alone',async()=>{
 const text='One two three four five six seven eight nine ten eleven twelve.';
 const delivery={text,notes:'Connected phrasing at provider defaults.',pauses:[]};
 const direction=await reviewNarrationDelivery(async(_step,prompt,_max,format)=>{
  assert.match(prompt,/unchanged DEFAULT SPEED/);assert.ok(!format.schema.safeParse({...delivery,speed:.72}).success);return JSON.stringify(delivery);
 },text);
 const words=text.split(' ').map((word,i)=>({text:word,start:i*.15,end:i*.15+.14}));
 const metrics=voicePacingMetrics(words,1.9,direction);assert.ok(metrics.wpm>300);assert.deepEqual(metrics.problems,[]);
 const verdict=await reviewVoicePacing(async(_step,prompt)=>{assert.match(prompt,/descriptive, not pass\/fail thresholds/);return JSON.stringify({passed:true,summary:'Connected native-speed timing.',issues:[],nextDelivery:direction});},text,direction,metrics);
 assert.equal(verdict.passed,true);assert.match(verdict.evidence,/no audio listening/);
});

test('real routing gives each visual stage one Opus repair with no global cap or Sol fallback',async()=>{
 const workdir=await mkdtemp(join(tmpdir(),'quriozity-routing-'));
 const original=globalThis.fetch,requests=[];
 globalThis.fetch=async(url,init)=>{
  requests.push(JSON.parse(init.body));
  const content=String(url).includes('anthropic.com')?anthropicStream('{"ok":true}'):`data: ${JSON.stringify({type:'response.completed',response:{status:'completed',output:[{content:[{type:'output_text',text:'{"ok":true}'}]}]}})}\n\n`;
  return new Response(content,{headers:{'content-type':'text/event-stream'}});
 };
 const client=async()=>quriozityClient({ANTHROPIC_API_KEY:'test-only',OPENAI_API_KEY:'test-only'},undefined,await opusRepairBudget(workdir),await solRepairBudget(workdir));
 try{
  let ask=await client();
  await ask('visual-realization','Test',0);await ask('visual-realization-repair','Test',0);
  for(const stage of ['subject','composition','continuity','style-reference','final'])await ask(`visual-${stage}-review-repair`,'Test',0);
  assert.equal(requests.length,7);assert.ok(requests.every(r=>r.model==='claude-opus-5-5'));
  ask=await client();
  await assert.rejects(ask('visual-subject-review-repair','Test',0),{code:'opus_stage_repair_limit'});
  await assert.rejects(ask('visual-realization','Test',0),{code:'opus_stage_repair_limit'});
  assert.equal(requests.length,7,'No fallback or repeated initial request is purchased');
  for(const step of ['plan','script','asset-pick','sound-design','fact-check','voice-delivery-review-repair'])await ask(step,'Test',0);
  assert.ok(requests.slice(7).every(r=>r.model==='gpt-6.1-sol'&&r.reasoning.effort==='medium'));
 }finally{globalThis.fetch=original;await rm(workdir,{recursive:true,force:true});}
});

test('invalid delivery directions receive bounded Sol corrections before synthesis',async()=>{
 const text='One two three four five six seven eight nine ten eleven twelve.';
 const valid={text,notes:'Natural thought boundary.',pauses:[{afterWord:6,minSeconds:.25,why:'Thought boundary'}]},steps=[],records=[];
 const result=await reviewNarrationDelivery(async(step,prompt)=>{
  steps.push(step);
  if(steps.length===1)return JSON.stringify({...valid,pauses:[{...valid.pauses[0],minSeconds:.1}]});
  assert.match(prompt,/Too small/);assert.match(prompt,/unchanged DEFAULT SPEED/);return JSON.stringify(valid);
 },text,async record=>records.push(record));
 assert.deepEqual(result,valid);assert.deepEqual(steps,['voice-delivery-review','voice-delivery-review-repair']);
 assert.deepEqual(records.map(r=>r.valid),[false,true]);assert.match(records[0].error,/Too small/);
 let calls=0;
 await assert.rejects(reviewNarrationDelivery(async()=>{calls++;return JSON.stringify({...valid,text:'Changed words.'});},text),/preserve every spoken word/);
 assert.equal(calls,4,'Initial Sol direction plus at most three corrections');
 const selected=await reviewNarrationDelivery(async()=>JSON.stringify({...valid,text:'Changed words.'}),text,undefined,'best');
 assert.equal(selected.text,text);assert.deepEqual(selected.pauses,[]);assert.match(selected.notes,/original reviewed narration/);
});

test('transport failures consume the single visual repair allowance without a Sol fallback',async()=>{
 const workdir=await mkdtemp(join(tmpdir(),'quriozity-retry-budget-'));
 const originalFetch=globalThis.fetch,originalTimeout=globalThis.setTimeout,requests=[];
 // Skip only this client's retry backoff; keep SDK deadline timers intact.
 globalThis.setTimeout=(callback,delay,...args)=>originalTimeout(callback,delay>=5000&&delay<=30000?0:delay,...args);
 globalThis.fetch=async(url,init)=>{
  requests.push(JSON.parse(init.body));
  if(String(url).includes('anthropic.com'))return new Response(JSON.stringify({type:'error',error:{type:'overloaded_error',message:'Mock overload'}}),{status:529,headers:{'content-type':'application/json'}});
  if(requests.at(-1).input[0].content[0].text==='Fail Sol')return new Response('{}',{status:500});
  return new Response(`data: ${JSON.stringify({type:'response.completed',response:{status:'completed',output:[{content:[{type:'output_text',text:'Sol result'}]}]}})}\n\n`,{headers:{'content-type':'text/event-stream'}});
 };
 try{
  const ask=quriozityClient({ANTHROPIC_API_KEY:'test-only',OPENAI_API_KEY:'test-only'},undefined,await opusRepairBudget(workdir),await solRepairBudget(workdir));
  await assert.rejects(ask('visual-subject-review-repair','Test',0),{code:'opus_stage_repair_limit'});
  assert.deepEqual(requests.map(r=>r.model),['claude-opus-5-5']);
  await assert.rejects(ask('voice-delivery-review-repair','Fail Sol',0),{code:'sol_stage_repair_limit'});
  assert.equal(requests.length,4,'One Opus repair transport and exactly three Sol delivery correction transports');
  await assert.rejects((await opusRepairBudget(workdir))('visual-subject-review-repair'),{code:'opus_stage_repair_limit'});
  await assert.rejects((await solRepairBudget(workdir))('voice-delivery-review-repair'),{code:'sol_stage_repair_limit'});
 }finally{globalThis.fetch=originalFetch;globalThis.setTimeout=originalTimeout;await rm(workdir,{recursive:true,force:true});}
});
