import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createVoiceProvider,VoiceProviderError} from './providers.mjs';
import {PROJECT_ROOT} from '../rights/ledger.mjs';

export const VOICE_CONFIG_PATH=join(PROJECT_ROOT,'audio','voice','config.json');
export const HEALTH_STATE_PATH=join(PROJECT_ROOT,'.motion-cache','audio-voice-health.json');
export const HEALTH_PENDING_PATH=join(PROJECT_ROOT,'.motion-cache','audio-voice-health.pending.json');

export async function loadVoiceConfig(path=VOICE_CONFIG_PATH){
 const config=JSON.parse(await readFile(path,'utf8'));
 if(config.schemaVersion!==1||!config.activeProvider||!config.activeVoice||!config.providers?.[config.activeProvider])throw new Error('audio/voice/config.json must define schemaVersion, activeProvider, activeVoice and its provider');
 return config;
}

export function resolveActiveVoice(config,{providerId=process.env.VOICE_PROVIDER,voiceId=process.env.ELEVENLABS_VOICE_ID,model=process.env.ELEVENLABS_MODEL}={}){
 const activeProvider=providerId??config.activeProvider,entry=config.providers?.[activeProvider];
 if(!entry)throw new VoiceProviderError('voice_not_configured',`No configuration exists for provider '${activeProvider}'`);
 const voice=config.voices?.[config.activeVoice];if(!voice)throw new VoiceProviderError('voice_not_configured',`Configured voice '${config.activeVoice}' is missing`);
 if(voice.provider!==activeProvider)throw new VoiceProviderError('voice_config_mismatch',`Voice '${config.activeVoice}' is configured for ${voice.provider}, not ${activeProvider}`);
 const voiceOverride=activeProvider==='elevenlabs'&&Boolean(voiceId?.trim())&&voiceId.trim()!==voice.voiceId;
 const modelOverride=activeProvider==='elevenlabs'&&Boolean(model?.trim())&&model.trim()!==voice.model;
 const selectedVoiceId=activeProvider==='elevenlabs'?(voiceId?.trim()||voice.voiceId):voice.voiceId;
 const selectedModel=activeProvider==='elevenlabs'?(model?.trim()||voice.model):voice.model;
 if(!selectedVoiceId||!selectedModel)throw new VoiceProviderError('voice_not_configured',`Set a voice ID and model for '${config.activeVoice}' in audio/voice/config.json`);
 return {...voice,id:config.activeVoice,provider:activeProvider,voiceId:selectedVoiceId,voiceSource:voiceOverride?null:voice.voiceSource,owner:voiceOverride?null:voice.owner,model:selectedModel,modelVersion:modelOverride?selectedModel:(voice.modelVersion??selectedModel),nonBeta:modelOverride?null:voice.nonBeta,providerConfig:entry};
}

/** Providers return object keys in varying order, so metadata is compared with sorted keys. */
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;

function describeChanges(previous,current){
 if(!previous)return [];
 const changes=[];
 for(const field of ['voice','model'])if(JSON.stringify(canonical(previous[field]))!==JSON.stringify(canonical(current[field])))changes.push(`${field} metadata changed`);
 return changes;
}

export async function checkVoiceHealth({config,voice,provider,statePath=HEALTH_STATE_PATH}={}){
 const health=await provider.health({voiceId:voice.voiceId,model:voice.model});
 const previous=await readFile(statePath,'utf8').then(JSON.parse,()=>null);
 const changes=describeChanges(previous,health);
 const pendingPath=statePath===HEALTH_STATE_PATH?HEALTH_PENDING_PATH:`${statePath}.pending.json`;
 await mkdir(dirname(statePath),{recursive:true});
 if(!previous||!changes.length)await writeFile(statePath,`${JSON.stringify(health,null,2)}\n`);
 else await writeFile(pendingPath,`${JSON.stringify({detectedAt:new Date().toISOString(),changes,health},null,2)}\n`);
 return {health,changes,ambiguous:changes.length>0,pendingPath:changes.length?pendingPath:null};
}

export async function runConfiguredHealthCheck({env=process.env,configPath=VOICE_CONFIG_PATH,statePath=HEALTH_STATE_PATH,fetchImpl=fetch}={}){
 const config=await loadVoiceConfig(configPath),voice=resolveActiveVoice(config,{providerId:env.VOICE_PROVIDER,voiceId:env.ELEVENLABS_VOICE_ID,model:env.ELEVENLABS_MODEL});
 const provider=createVoiceProvider(voice.provider,{apiKey:env.ELEVENLABS_API_KEY,fetchImpl,enabled:voice.providerConfig.enabled,reason:voice.providerConfig.disabledReason});
 if(!voice.providerConfig.enabled)throw new VoiceProviderError('voice_provider_disabled',`${voice.provider} is marked disabled in audio/voice/config.json`);
 const result=await checkVoiceHealth({config,voice,provider,statePath});
 return {...result,voice};
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{
  const result=await runConfiguredHealthCheck();
  console.log(`Voice available: ${result.health.voice.name} (${result.health.voice.voiceId}); model ${result.health.model.modelId} is active for text-to-speech.`);
  if(result.changes.length){console.error(`Health change detected: ${result.changes.join(', ')}. Synthesis is paused until reviewed. Candidate details: ${result.pendingPath}`);process.exitCode=1;}
  else console.log(result.health.voice? 'No ambiguous changes detected.':'Voice health is unknown.');
 }catch(error){console.error(`Voice health HOLD: ${error.message}`);process.exitCode=1;}
}
