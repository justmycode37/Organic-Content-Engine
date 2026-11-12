import {createHash} from 'node:crypto';

export const stableSeed=input=>createHash('sha256').update(JSON.stringify(input)).digest().readUInt32BE(0);
export const voiceRequestPayload=({provider,voiceId,model,text,settings})=>({provider,voiceId,model,text,settings,alignmentContract:'word-seconds-v1'});
export const voiceRequestHash=input=>createHash('sha256').update(JSON.stringify(voiceRequestPayload(input))).digest('hex');
export const voiceCacheId=input=>voiceRequestHash(input).slice(0,20);

export class VoiceProviderError extends Error{
 constructor(code,message){super(message);this.name='VoiceProviderError';this.code=code;}
}

export function validateAlignment(result){
 if(!result||!(result.audio instanceof Uint8Array)||!result.audio.length||!Array.isArray(result.words)||!result.words.length)throw new VoiceProviderError('alignment_missing','Voice provider returned no audio or word alignment');
 let lastStart=-1;
 for(const [index,word] of result.words.entries()){
  if(typeof word.text!=='string'||!word.text.trim()||!Number.isFinite(word.start)||!Number.isFinite(word.end)||word.start<0||word.end<word.start||word.start<lastStart)throw new VoiceProviderError('alignment_invalid',`Voice provider returned invalid word timing at index ${index}`);
  lastStart=word.start;
 }
 return result;
}

export function wordsFromElevenAlignment(alignment){
 if(!alignment||!Array.isArray(alignment.characters)||!Array.isArray(alignment.character_start_times_seconds)||!Array.isArray(alignment.character_end_times_seconds)||alignment.characters.length!==alignment.character_start_times_seconds.length||alignment.characters.length!==alignment.character_end_times_seconds.length)return [];
 const words=[];let current=null;
 alignment.characters.forEach((char,index)=>{
  const start=Number(alignment.character_start_times_seconds[index]),end=Number(alignment.character_end_times_seconds[index]);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<start)throw new VoiceProviderError('alignment_invalid','ElevenLabs returned an invalid character timing');
  if(/\s/u.test(char)){if(current){words.push(current);current=null;}return;}
  current??={text:'',start,end};current.text+=char;current.end=end;
 });
 if(current)words.push(current);
 return words;
}

function apiError(status,path){
 // Restricted keys need voices_read and models_read for the health check, besides text_to_speech.
 if(status===401||status===403)return new VoiceProviderError('voice_auth',`ElevenLabs rejected the API key for ${path}; give the key the voices_read and models_read permissions`);
 if(status===404)return new VoiceProviderError('voice_missing',`ElevenLabs no longer exposes the configured voice or model (${path})`);
 return new VoiceProviderError('voice_api',`ElevenLabs ${path} request failed with HTTP ${status}`);
}

function deprecationState(model){
 if(model.deprecated===true||model.is_deprecated===true||model.lifecycle_status==='deprecated'||String(model.status??'').toLowerCase()==='deprecated')return 'deprecated';
 if(model.can_do_text_to_speech===false||model.can_do_tts===false)return 'unsupported';
 if(model.can_do_text_to_speech!==true&&model.can_do_tts!==true)return 'unknown';
 return 'active';
}

function stableVoice(voice){
 return {voiceId:voice.voice_id??voice.voiceId??null,name:voice.name??null,category:voice.category??null,description:voice.description??null,labels:voice.labels??null,availableForTiers:voice.available_for_tiers??voice.availableForTiers??null,sharing:voice.sharing??null,settings:voice.settings??null};
}
function stableModel(model){
 return {modelId:model.model_id??model.modelId??null,name:model.name??null,state:deprecationState(model),canDoTextToSpeech:model.can_do_text_to_speech??model.can_do_tts??null,languages:model.languages??null};
}

export function createElevenLabsAdapter({apiKey,fetchImpl=fetch}={}){
 const request=async(path,{body,method=body?'POST':'GET',headers={}}={})=>{
  if(!apiKey)throw new VoiceProviderError('voice_not_configured','ELEVENLABS_API_KEY is required for the active ElevenLabs voice');
  let response;try{response=await fetchImpl(`https://api.elevenlabs.io${path}`,{method,headers:{'xi-api-key':apiKey,...(body?{'content-type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(120000)});}catch{throw new VoiceProviderError('voice_unreachable','ElevenLabs did not respond; synthesis stopped because voice availability is unknown');}
  if(!response.ok)throw apiError(response.status,path);
  try{return await response.json();}catch{throw new VoiceProviderError('voice_api','ElevenLabs returned unreadable health or timing data');}
 };
 return {
  id:'elevenlabs',enabled:true,
  async health({voiceId,model}){
   if(!voiceId||!model)throw new VoiceProviderError('voice_not_configured','ElevenLabs voice ID and model must both be configured');
   const [voiceData,modelsData]=await Promise.all([request(`/v1/voices/${encodeURIComponent(voiceId)}`),request('/v1/models')]);
   const voice=voiceData.voice??voiceData;
   if((voice.voice_id??voice.voiceId)!==voiceId)throw new VoiceProviderError('voice_ambiguous','ElevenLabs returned a different voice identity than configured');
   if(voice.available===false||voice.status==='disabled'||voice.status==='unavailable')throw new VoiceProviderError('voice_unavailable','ElevenLabs reports the configured voice as unavailable');
   const models=Array.isArray(modelsData)?modelsData:modelsData.models;
   if(!Array.isArray(models))throw new VoiceProviderError('model_ambiguous','ElevenLabs model list has an unknown response shape');
   const found=models.find(item=>(item.model_id??item.modelId)===model);
   if(!found)throw new VoiceProviderError('model_missing',`Configured ElevenLabs model '${model}' is absent from the current model list`);
   const state=deprecationState(found);
   if(state==='deprecated')throw new VoiceProviderError('model_deprecated',`Configured ElevenLabs model '${model}' is deprecated`);
   if(state==='unsupported')throw new VoiceProviderError('model_unsupported',`Configured ElevenLabs model '${model}' no longer supports text-to-speech`);
   if(state==='unknown')throw new VoiceProviderError('model_ambiguous',`ElevenLabs did not confirm that model '${model}' is active for text-to-speech`);
   return {provider:'elevenlabs',voice:stableVoice(voice),model:stableModel(found),checkedAt:new Date().toISOString()};
  },
  async synthesize({text,voiceId,model,settings,seed}){
   const data=await request(`/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`,{body:{text,model_id:model,voice_settings:{stability:settings.stability,similarity_boost:settings.similarity_boost,style:settings.style,use_speaker_boost:settings.use_speaker_boost,speed:settings.speed},seed}});
   const words=wordsFromElevenAlignment(data.alignment??data.normalized_alignment);
   let audio;try{audio=Uint8Array.from(Buffer.from(data.audio_base64,'base64'));}catch{throw new VoiceProviderError('audio_invalid','ElevenLabs returned unreadable audio bytes');}
   return validateAlignment({audio,words,format:'mp3',providerMetadata:{requestId:data.request_id??null}});
  },
 };
}

export function createDisabledAdapter(id,reason){
 const fail=()=>{throw new VoiceProviderError('voice_provider_disabled',`${id} voice provider is disabled: ${reason}`);};
 return {id,enabled:false,health:async()=>fail(),synthesize:async()=>fail()};
}

export const createCartesiaAdapter=({reason='credentials, commercial rights, and word alignment are not configured'}={})=>createDisabledAdapter('cartesia',reason);
export const createGoogleTtsAdapter=({reason='production voice and word alignment are not configured'}={})=>createDisabledAdapter('google',reason);
export const createKokoroAdapter=({reason='checkpoint lineage, local runtime, and word alignment are not audited'}={})=>createDisabledAdapter('kokoro',reason);

export function createVoiceProvider(id,{apiKey,fetchImpl=fetch,enabled=false,reason='provider is not configured'}={}){
 if(id==='elevenlabs')return createElevenLabsAdapter({apiKey,fetchImpl});
 if(id==='cartesia')return createCartesiaAdapter({reason:enabled?'adapter is not enabled in this build':reason});
 if(id==='google')return createGoogleTtsAdapter({reason:enabled?'adapter is not enabled in this build':reason});
 if(id==='kokoro')return createKokoroAdapter({reason:enabled?'adapter is not enabled in this build':reason});
 throw new VoiceProviderError('voice_provider_unknown',`Unknown voice provider '${id}'`);
}
