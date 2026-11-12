import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createElevenLabsAdapter,createVoiceProvider,stableSeed,validateAlignment,voiceCacheId,voiceRequestHash,voiceRequestPayload,VoiceProviderError,wordsFromElevenAlignment} from './providers.mjs';
import {checkVoiceHealth} from './health.mjs';
import {requestHash} from '../rights/ledger.mjs';

const json=value=>new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});

test('ElevenLabs adapter returns word timings and seeded timestamped output',async()=>{
 let synthesisBody;
 const fetchImpl=async(url,init={})=>{
  if(String(url).includes('/v1/voices/'))return json({voice_id:'voice12345678',name:'Designed Narrator',category:'generated'});
  if(String(url).endsWith('/v1/models'))return json([{model_id:'eleven_multilingual_v2',name:'Multilingual v2',can_do_text_to_speech:true}]);
  synthesisBody=JSON.parse(init.body);
  return json({audio_base64:Buffer.from('mp3').toString('base64'),alignment:{characters:['H','i',' ','t','h','e','r','e'],character_start_times_seconds:[0,.1,.2,.3,.4,.5,.6,.7],character_end_times_seconds:[.1,.2,.3,.4,.5,.6,.7,.8]}});
 };
 const adapter=createElevenLabsAdapter({apiKey:'test-key',fetchImpl});
 const health=await adapter.health({voiceId:'voice12345678',model:'eleven_multilingual_v2'});
 assert.equal(health.model.state,'active');
 const seed=stableSeed({text:'Hi there'}),result=await adapter.synthesize({text:'Hi there',voiceId:'voice12345678',model:'eleven_multilingual_v2',settings:{stability:.4,similarity_boost:.75,style:.3,use_speaker_boost:true,speed:1.08},seed});
 assert.deepEqual(result.words,[{text:'Hi',start:0,end:.2},{text:'there',start:.3,end:.8}]);
 assert.equal(Buffer.from(result.audio).toString(),'mp3');assert.equal(synthesisBody.seed,seed);
});

test('ElevenLabs health blocks missing and deprecated models',async()=>{
 const adapter=createElevenLabsAdapter({apiKey:'test-key',fetchImpl:async url=>String(url).includes('/v1/voices/')?json({voice_id:'voice12345678',name:'Narrator'}):json([{model_id:'eleven_multilingual_v2',can_do_text_to_speech:true,is_deprecated:true}])});
 await assert.rejects(()=>adapter.health({voiceId:'voice12345678',model:'eleven_multilingual_v2'}),error=>error.code==='model_deprecated');
 const absent=createElevenLabsAdapter({apiKey:'test-key',fetchImpl:async url=>String(url).includes('/v1/voices/')?json({voice_id:'voice12345678',name:'Narrator'}):json([])});
 await assert.rejects(()=>absent.health({voiceId:'voice12345678',model:'eleven_multilingual_v2'}),error=>error.code==='model_missing');
});

test('disabled providers fail before returning audio without alignment',async()=>{
 for(const id of ['cartesia','google','kokoro']){
  const adapter=createVoiceProvider(id,{enabled:false,reason:'credentials and alignment not audited'});
  assert.equal(adapter.enabled,false);
  await assert.rejects(()=>adapter.synthesize({text:'hello'}),error=>error.code==='voice_provider_disabled');
 }
});

test('voice cache and seed payload share the versioned alignment request contract',()=>{
 const input={provider:'elevenlabs',voiceId:'voice12345678',model:'eleven_multilingual_v2',text:'Hello there',settings:{stability:.4,speed:1.08}};
 const payload=voiceRequestPayload(input);
 assert.equal(payload.alignmentContract,'word-seconds-v1');
 assert.equal(voiceRequestHash(input),requestHash(payload));
 assert.equal(voiceCacheId(input),requestHash(payload).slice(0,20));
 assert.equal(stableSeed(payload),stableSeed(voiceRequestPayload(input)));
});

test('alignment validation rejects unsorted or missing word timings',()=>{
 assert.deepEqual(wordsFromElevenAlignment({characters:['A',' ','B'],character_start_times_seconds:[0,.1,.2],character_end_times_seconds:[.1,.2,.3]}),[{text:'A',start:0,end:.1},{text:'B',start:.2,end:.3}]);
 assert.throws(()=>validateAlignment({audio:new Uint8Array([1]),words:[{text:'later',start:1,end:2},{text:'earlier',start:.5,end:1}]}),error=>error instanceof VoiceProviderError&&error.code==='alignment_invalid');
});

test('voice health reports changes and marks synthesis ambiguous',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'voice-health-'));
 try{
  const statePath=join(directory,'health.json'),voice={voiceId:'voice12345678',model:'eleven_multilingual_v2'},provider={health:async()=>({provider:'elevenlabs',voice:{voiceId:'voice12345678',name:'Narrator'},model:{modelId:'eleven_multilingual_v2',state:'active'}})};
  assert.equal((await checkVoiceHealth({voice,provider,statePath})).ambiguous,false);
  provider.health=async()=>({provider:'elevenlabs',voice:{name:'Narrator',voiceId:'voice12345678'},model:{state:'active',modelId:'eleven_multilingual_v2'}});
  assert.equal((await checkVoiceHealth({voice,provider,statePath})).ambiguous,false,'reordered keys are not a change');
  provider.health=async()=>({provider:'elevenlabs',voice:{voiceId:'voice12345678',name:'Changed narrator'},model:{modelId:'eleven_multilingual_v2',state:'active'}});
  const changed=await checkVoiceHealth({voice,provider,statePath});
  assert.equal(changed.ambiguous,true);assert.deepEqual(changed.changes,['voice metadata changed']);
 }finally{await rm(directory,{recursive:true,force:true});}
});
