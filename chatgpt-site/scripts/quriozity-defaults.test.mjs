import test from 'node:test';
import assert from 'node:assert/strict';
import {z} from 'zod';
import {quriozityClient} from '../worker/quriozity-generation.ts';
import {QURIOZITY_MODELS,QURIOZITY_CLIENT_CONTEXT,quriozityStepRole,hasDefaultQuriozityProfile} from '../worker/quriozity-model-policy.ts';
import {narrationRequest} from './quriozity/produce.mjs';
import {reviewNarrationDelivery,reviewVoicePacing,voicePacingMetrics} from '../worker/quriozity-quality.ts';

test('default routing separates all authoring/repairs from every review specialty',()=>{
 for(const step of ['plan','script','asset-needs','asset-pick','storyboard','sound-design','visual-final-review-repair'])assert.equal(quriozityStepRole(step),'generation',step);
 for(const step of ['fact-check','coherence','novelty','asset-verify','storyboard-review','visual-subject-review','visual-composition-review','visual-continuity-review','visual-style-reference-review','visual-final-review','voice-delivery-review','voice-pacing-review','sound-review'])assert.equal(quriozityStepRole(step),'review',step);
 assert.deepEqual(QURIOZITY_MODELS,{generation:{model:'claude-opus-5-5',effort:'medium'},review:{model:'gpt-6.1-sol',effort:'xhigh'}});
 assert.ok(hasDefaultQuriozityProfile({modelRouting:QURIOZITY_CLIENT_CONTEXT}));
 assert.ok(!hasDefaultQuriozityProfile({model:'gpt-6.1-sol',effort:'xhigh'}));
 assert.ok(!hasDefaultQuriozityProfile({modelRouting:{...QURIOZITY_CLIENT_CONTEXT,reviewEffort:'medium'}}));
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

test('actual default clients send Opus medium authoring and Sol xhigh reviews, without live API calls',async()=>{
 const original=globalThis.fetch,requests=[],usage=[];
 globalThis.fetch=async(url,init)=>{
  requests.push({url:String(url),body:JSON.parse(init.body)});
  const text=String(url).includes('anthropic.com')?anthropicStream('{"ok":true}'):`data: ${JSON.stringify({type:'response.completed',response:{status:'completed',usage:{input_tokens:10,output_tokens:5},output:[{content:[{type:'output_text',text:'{"ok":true}'}]}]}})}\n\n`;
  return new Response(text,{headers:{'content-type':'text/event-stream'}});
 };
 try{
  const ask=quriozityClient({ANTHROPIC_API_KEY:'test-only',OPENAI_API_KEY:'test-only'},entry=>usage.push(entry));
  for(const step of ['plan','fact-check','visual-composition-review-repair'])assert.equal(await ask(step,'Test',0,{name:'result',schema:z.object({ok:z.boolean()})}),'{"ok":true}');
  assert.equal(requests[0].body.model,'claude-opus-5-5');assert.equal(requests[0].body.output_config.effort,'medium');
  assert.equal(requests[1].body.model,'gpt-6.1-sol');assert.equal(requests[1].body.reasoning.effort,'xhigh');
  assert.equal(requests[2].body.model,'claude-opus-5-5');
  assert.deepEqual(usage.map(u=>u.effort),['medium','xhigh','medium']);
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
