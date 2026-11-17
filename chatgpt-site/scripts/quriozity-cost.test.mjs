import test from 'node:test';
import assert from 'node:assert/strict';
import {z} from 'zod';
import {catalogContext,catalogIndex,specCatalogIds} from '../worker/quriozity-catalog-context.ts';
import {solPrompt} from '../worker/quriozity-prompt.ts';
import {quriozityClient,generateQuriozityReel,directCameras} from '../worker/quriozity-generation.ts';
import {applyStyleProfile} from '../src/quriozity/style-profile.ts';
import {reviewVisuals,VISUAL_REVIEW_STAGES} from '../worker/quriozity-quality.ts';
import {visualPatchSchema} from '../worker/quriozity-visual-patches.ts';
import {opusOutputFormat} from '../worker/quriozity-model-client.ts';
import {loadCatalog} from './quriozity/catalog.mjs';
import {modelCost,audioCost,summarizeCosts} from './quriozity/costs.mjs';

const entry=(id,summary,aliases=[])=>({id,summary,aliases,details:`${id}: ${summary}\ncontrols: VERIFIED-${id}`,kind:'model'});

test('Quriozity cost reports include one-hour Opus writes, Sol reasoning and separate audio estimates without a cutoff',()=>{
 assert.equal(modelCost({model:'claude-opus-5-5',usage:{input_tokens:10000,output_tokens:10000,cache_creation_input_tokens:20000,cache_creation:{ephemeral_1h_input_tokens:15000},cache_read_input_tokens:10000}}),.387);
 for(const model of ['gpt-6.1-sol','gpt-6.2-sol']){
  assert.equal(modelCost({model,usage:{input_tokens:100000,output_tokens:50000,input_tokens_details:{cached_tokens:20000}}}),.662);
  assert.equal(modelCost({model,usage:{input_tokens:300000,output_tokens:50000,input_tokens_details:{cached_tokens:20000}}}),1.874);
  assert.equal(summarizeCosts([{model,step:'fact-check',usage:{input_tokens:100000,output_tokens:50000,input_tokens_details:{cached_tokens:20000}}}]).modelUsd,.662);
 }
 assert.equal(audioCost({provider:'elevenlabs',status:200,endpoint:'/v1/text-to-speech/voice/with-timestamps',characters:1000}),.08);
 assert.equal(audioCost({provider:'elevenlabs',status:200,endpoint:'/v1/music',generatedSeconds:60}),.15);
 assert.equal(summarizeCosts([]).orientation.hardCutoff,false);
});

test('catalogue retrieval keeps used assets and aliases while omitting unrelated full documentation',()=>{
 const entries=[entry('onion','A normal onion',['bulb']),entry('face','Neutral face'),entry('rocket','A rocket')];
 const cat={text:'legacy full catalogue',assets:'',entries,has:()=>true};
 const context=catalogContext(cat,{query:'onion',required:['face'],alternatives:1});
 assert.match(context,/VERIFIED-onion/);assert.match(context,/VERIFIED-face/);assert.ok(!context.includes('VERIFIED-rocket'));
 assert.match(catalogContext(cat,{required:['bulb'],alternatives:0}),/VERIFIED-onion/);
 assert.match(catalogContext({...cat,canonicalId:()=> 'onion'},{required:['bulbs'],alternatives:0}),/VERIFIED-onion/);
 assert.match(catalogIndex(cat),/rocket/);assert.match(catalogIndex(cat),/bulb/);
 assert.deepEqual(specCatalogIds({scenes:[{objects:[{model:'reference-video',params:{asset:'ocean-breaker'}},{model:'onion'},{model:'onion'}]}]}),['reference-video','ocean-breaker','onion']);
});

test('production catalogue index preserves discovery and retrieval sharply reduces full context',async()=>{
 const c=await loadCatalog(),index=catalogIndex(c);
 for(const e of c.entries)assert.ok(index.includes(e.id),e.id);
 for(const id of ['laptop','molecule'])assert.ok(c.entries.find(e=>e.id===id&&e.kind==='model').details.includes(c.models.find(m=>m.id===id).describe),'Duplicate ids must document the actual first registered model');
 assert.equal(c.canonicalId('leds'),'led');
 const context=catalogContext(c,{query:'onions cutting gas face tears',required:['onion','neutral-tearing-face','gas-pixel-mist']});
 assert.ok(context.length<(c.text.length+c.assets.length)/4);
 assert.ok(index.length<(c.text.length+c.assets.length)/3);
 assert.match(context,/neutral-tearing-face/);assert.match(context,/gas-pixel-mist/);
});

test('explicit Sol caching ends at the stable prefix, never at changing findings or images',()=>{
 const images=[{mime:'image/png',base64:'private-frame'}];
 const a=solPrompt('First finding',images,{prefix:'Shared policy and source rules'});
 const b=solPrompt('Different finding',images,{prefix:'Shared policy and source rules'});
 assert.deepEqual(a.prompt_cache_options,{mode:'explicit',ttl:'30m'});
 assert.deepEqual(a.input[0],b.input[0]);assert.notDeepEqual(a.input[1],b.input[1]);
 assert.deepEqual(a.input[0].content[0].prompt_cache_breakpoint,{mode:'explicit'});
 assert.ok(!JSON.stringify(a.input[0]).includes('finding'));assert.ok(!JSON.stringify(a.input[0]).includes('private-frame'));
 assert.ok(a.input[1].content.every(c=>!c.prompt_cache_breakpoint));
 assert.equal(solPrompt('One-off request',[]).input.length,1,'No artificial prefix or write is added to a one-off request');
});

test('visual specialties share the same cache prefix while retaining independent instructions and actual evidence',async()=>{
 const calls=[],ask=async(...args)=>{calls.push(args);return JSON.stringify({passed:true,summary:'Checked',findings:[]});};
 const spec={scenes:[{say:'A subject',objects:[{model:'onion'}]}]},cat={text:'',assets:'',has:()=>true};
 for(const stage of VISUAL_REVIEW_STAGES.slice(0,3))await reviewVisuals(ask,spec,[{mime:'image/png',base64:'actual'}],'S1 early middle late',cat,'One causal chain',stage);
 assert.equal(new Set(calls.map(c=>c[5].prefix)).size,1);
 assert.equal(new Set(calls.map(c=>c[1])).size,3);
 assert.ok(calls.every(c=>c[4][0].base64==='actual'));
});

const stream=text=>[
 ['message_start',{type:'message_start',message:{id:'test',type:'message',role:'assistant',model:'claude-opus-5-5',content:[],stop_reason:null,stop_sequence:null,usage:{input_tokens:10,output_tokens:0}}}],
 ['content_block_start',{type:'content_block_start',index:0,content_block:{type:'text',text:''}}],
 ['content_block_delta',{type:'content_block_delta',index:0,delta:{type:'text_delta',text}}],
 ['content_block_stop',{type:'content_block_stop',index:0}],
 ['message_delta',{type:'message_delta',delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:5}}],
 ['message_stop',{type:'message_stop'}],
].map(([event,data])=>`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('');

test('provider requests preserve cache prefixes, image evidence and native patch schemas without paid calls',async()=>{
 const original=globalThis.fetch,requests=[],usage=[];
 globalThis.fetch=async(url,init)=>{
  requests.push({url:String(url),body:JSON.parse(init.body)});
  const data=String(url).includes('anthropic.com')?stream('{}'):`data: ${JSON.stringify({type:'response.completed',response:{status:'completed',output:[{content:[{type:'output_text',text:'{}'}]}]}})}\n\n`;
  return new Response(data,{headers:{'content-type':'text/event-stream'}});
 };
 try{
  const ask=quriozityClient({OPENAI_API_KEY:'test-only',ANTHROPIC_API_KEY:'test-only'},u=>usage.push(u));
  const images=[{mime:'image/png',base64:'evidence'}],prefix='Stable documented capabilities';
  for(const input of ['First defect','Second defect'])assert.equal(await ask('visual-subject-review-repair',input,0,{name:'patch',schema:visualPatchSchema},images,{prefix}),'{}','Invalid structured output stays available to the local repair validator');
  await ask('visual-subject-review','Review',0,undefined,images,{prefix});
  assert.ok(opusOutputFormat({name:'patch',schema:visualPatchSchema}));
  assert.deepEqual(requests[0].body.system,requests[1].body.system);
  assert.deepEqual(requests[0].body.system[0].cache_control,{type:'ephemeral',ttl:'1h'});
  assert.equal(requests[0].body.messages[0].content[0].text,'First defect');
  assert.equal(requests[0].body.messages[0].content[1].source.data,'evidence');
  assert.equal(requests[2].body.reasoning.effort,'medium');assert.equal(requests[2].body.input[0].content[0].text,prefix);
  assert.equal(requests[2].body.input[1].content[1].image_url,'data:image/png;base64,evidence');
  await ask('visual-realization','Different draft',0,{name:'open',schema:z.object({controls:z.record(z.string(),z.number())})},[],{prefix});
  assert.match(requests[3].body.system[0].text,/matching this schema/);
  assert.equal(requests[3].body.messages[0].content[0].text,'Different draft','Unstructured schema is cached once, not repeated in the dynamic suffix');
  assert.equal(usage.length,4,'Even invalid structured proposals retain usage');
 }finally{globalThis.fetch=original;}
});

test('storyboard director returns findings and a separate author patches and rechecks the draft',async()=>{
 const scenes=Array.from({length:8},(_,i)=>({say:`One two three four five six seven eight nine ten eleven twelve ${i}.`,duration:5,hue:'blue',objects:[{id:'hero',model:'led',scale:1}]}));
 const spec=directCameras(applyStyleProfile({version:1,series:'QURIOZITY',style:'reference-recording',title:'A light',scenes}),{},'fixture');
 const plan={topic:'Why a light glows',question:'Why?',answer:'An explanation.',goldenThread:'One chain.',anchor:{thing:'led',why:'The same light'},analogy:'none',steps:Array.from({length:3},()=>({idea:'One step',because:'The previous step',show:'The led'})),hook:'A question',payoff:'Its answer',facts:['One','Two','Three'],heroObjects:['led'],leftOut:[]};
 const script={title:'A light',lines:scenes.map((s,i)=>({say:s.say,step:i,link:'Because'})),musicBrief:'Calm',factNotes:[]};
 const calls=[];let reviews=0;
 const ask=async(step,input,_max,format)=>{
  calls.push(step);
  if(step==='plan')return JSON.stringify(plan);
  if(step==='script')return JSON.stringify(script);
  if(step==='fact-check')return JSON.stringify({ok:true,problems:[]});
  if(step==='coherence')return JSON.stringify({heardQuestion:'Why?',heardAnswer:'An explanation',retell:'One chain',links:[],scores:{thread:9,flow:9,simplicity:9,payoff:9,explains:9},problems:[]});
  if(step==='storyboard')return JSON.stringify(spec);
  if(step==='visual-realization')return input.split('Sol plan to realize: ')[1].split('\nValidation feedback')[0];
  if(step==='storyboard-review'){
   assert.equal(format.name,'quriozity_storyboard_verdict');assert.match(input,/findings only/);
   return JSON.stringify(++reviews===1?{passed:false,summary:'Hero too large',findings:[{scene:1,severity:'must-fix',problem:'Hero too large',evidence:'Scale is 1',change:'Scale .8'}]}:{passed:true,summary:'Corrected',findings:[]});
  }
  if(step==='storyboard-review-repair')return JSON.stringify({patches:[{scene:1,path:'/objects/0/scale',op:'set',valueJson:'0.8'}]});
  throw new Error(`Unexpected ${step}`);
 };
 const r=await generateQuriozityReel({OPENAI_API_KEY:'test-only'},'Light',{text:'led',assets:'',entries:[entry('led','A light')],has:id=>id==='led'},undefined,[],undefined,ask);
 assert.deepEqual(calls.slice(-4),['storyboard-review','storyboard-review-repair','storyboard-review','visual-realization']);
 assert.equal(r.spec.scenes[0].objects[0].scale,.8);
 assert.deepEqual(r.spec.scenes.slice(1),spec.scenes.slice(1));
 assert.equal(r.provenance.storyboardReviews.length,2);assert.equal(r.provenance.storyboardGate.passed,true);
 assert.equal(r.provenance.storyboardReviews[0].spec.scenes[0].objects[0].scale,1);
 assert.equal(r.provenance.storyboardReviews[0].repairs[0].valid,true);
});
