// Renders a code-animated Reel with narration, captions that follow the voice, and ElevenLabs
// sound effects placed on transitions, semantic hits and typing.
//
//   node --env-file=.env.motion scripts/motion-audio.mjs <spec.json> <out.mp4> [--post <id>]
//
// ELEVENLABS_API_KEY is needed for uncached narration or sound effects.
// The voice comes from audio/voice/config.json (ELEVENLABS_VOICE_ID / ELEVENLABS_MODEL override it).
// Every generated clip is cached in .motion-cache by content hash, so re-rendering an unchanged line
// costs nothing. Every voice and SFX file is recorded in audio/rights/ledger.jsonl, and each
// render writes a render-manifest.json for scripts/audio/rights/check.mjs.
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,access,rm} from 'node:fs/promises';
import {basename,dirname,isAbsolute,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseReelSpec} from '../src/motion/spec.ts';
import {FPS,markupWords,placeScenes,stripMarkup} from '../src/motion/core.ts';
import {styleOf} from '../src/motion/styles/index.ts';
import {pronounce,mapSpeechTimings} from './audio/pronunciation.mjs';
import {buildMixGraph} from './audio/mix.mjs';
import {REQUIRED_USES,appendLedgerRecord,hashFile,killSwitchReasons,projectPath,readKillSwitch,readLedger,requestHash as fullRequestHash,sha256} from './audio/rights/ledger.mjs';
import {createVoiceProvider,stableSeed,voiceCacheId,voiceRequestHash,voiceRequestPayload} from './audio/voice/providers.mjs';
import {auditRender} from './audio/rights/check.mjs';
import {checkVoiceHealth,loadVoiceConfig,resolveActiveVoice} from './audio/voice/health.mjs';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const CACHE=join(ROOT,'.motion-cache');
const API='https://api.elevenlabs.io';
const LEAD=0.12;   // silence before the voice in each scene, so a cut never clips a word
const TAIL=0.32;   // breath after the last word before the next cut

/** Rights facts shared by every generated sound effect: the account is on the paid ElevenLabs Creator plan. */
const ELEVENLABS_SFX={
 provider:'elevenlabs-paid',modelId:'eleven_text_to_sound_v2',planTier:'creator',nonBeta:true,
 licenceEvidence:'Generated on the paid ElevenLabs Creator plan; paid plans include a commercial licence for non-beta output (terms snapshots elevenlabs-commercial-help-2026-11-11 and elevenlabs-eu-terms-2026-11-11).',
 termsSnapshotRef:'elevenlabs-eu-terms-2026-11-11',
 relatedTermsSnapshotRefs:['elevenlabs-commercial-help-2026-11-11','elevenlabs-service-terms-2026-11-11','elevenapi-terms-2026-11-11'],
};
const sound=(prompt,seconds,gain)=>({...ELEVENLABS_SFX,prompt,seconds,gain});

/** Sound design. Prompts are generated once and cached; `gain` is the level under the voice. */
export const SFX={
 whoosh:sound('Short fast cinematic whoosh swish transition, clean, no reverb tail',0.6,0.5),
 glitch:sound('Short digital glitch stutter, data corruption burst, crisp',0.6,0.45),
 blocks:sound('Quick retro 8-bit pixel blips cascading, arcade interface transition',0.6,0.4),
 flash:sound('Camera flash pop with a short bright synth stab',0.5,0.45),
 hit:sound('Deep punchy cinematic impact hit with tight sub bass, very short',0.7,0.75),
 type:sound('Fast mechanical keyboard typing, close and dry, continuous',2.5,0.3),
 tick:sound('Rapid digital counter ticking up, soft retro computer beeps',1.5,0.3),
 pop:sound('Single soft UI pop click, bubbly, very short',0.5,0.45),
 sting:sound('Short retro 8-bit success jingle, three rising notes, confident ending',1.6,0.5),
};
/** Older specs name sounds that are no longer in the table; each resolves to the closest shared sound. */
export const SFX_ALIASES={click:'pop',ui:'pop',stamp:'hit',thud:'hit',page:'whoosh',swish:'whoosh',success:'sting'};
export const resolveSfxName=name=>SFX[name]?name:SFX_ALIASES[name];
const TRANSITION_SFX={blocks:'blocks',wipe:'whoosh',zoom:'whoosh',shutter:'whoosh',glitch:'glitch',flash:'flash'};
const EVENT_SFX={contact:'hit',reveal:'pop',transform:'whoosh',connect:'pop',compare:'tick',resolve:'pop',highlight:'pop'};
const MAX_SALIENT_SFX_PER_10_SECONDS=6;
/** Looping bed that plays while a scene builds: typing for interfaces, ticking for counters. */
const SCENE_BED={code:'type',diff:'type',terminal:'type',chat:'type',stat:'tick',bars:'tick',tokens:'tick',grid:'tick'};

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,20);
const exists=path=>access(path).then(()=>true,()=>false);

async function eleven(path,body,key){
 const response=await fetch(`${API}${path}`,{method:body?'POST':'GET',headers:{'xi-api-key':key,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(120000)});
 if(response.ok)return response;
 // Provider error bodies can echo request details; only the status is reported.
 const reason=response.status===401||response.status===403?'the API key was rejected or lacks this permission':response.status===402||response.status===429?'the account is out of credits or rate limited':`status ${response.status}`;
 throw new Error(`ElevenLabs ${path.split('?')[0]} failed: ${reason}`);
}

/** Voice provider integration hook (S3): all providers share bytes + ordered word timings. */
function voiceSettings(voice,style){
 const preset=voice.presets?.[style]??voice.presets?.default??{};
 const number=(name,fallback,min,max)=>{
  const raw=process.env[name];if(raw===undefined||raw.trim()==='')return fallback;
  const value=Number(raw);
  if(!Number.isFinite(value)||value<min||value>max)throw new Error(`${name} must be a number from ${min} to ${max}`);
  return value;
 };
 return {stability:number('ELEVENLABS_STABILITY',preset.stability??0.45,0,1),similarity_boost:preset.similarityBoost??0.75,style:number('ELEVENLABS_STYLE',preset.style??0.3,0,1),use_speaker_boost:preset.speakerBoost??true,speed:number('ELEVENLABS_SPEED',preset.pace??1.08,0.7,1.2)};
}

async function speak(text,voice,provider,fallbackText,style,ensureHealthy){
 const model=voice.model,settings=voiceSettings(voice,style);
 const legacyCacheId=requestText=>hash({text:requestText,voice:voice.voiceId,model,settings});
 const previousAdapterCacheId=requestText=>hash({provider:voice.provider,text:requestText,voiceId:voice.voiceId,model,settings});
 const cached=async requestText=>{
  const requestInput={provider:voice.provider,voiceId:voice.voiceId,model,text:requestText,settings},currentId=voiceCacheId(requestInput),paths=[currentId,previousAdapterCacheId(requestText),legacyCacheId(requestText)];
  for(const id of new Set(paths)){
   const audio=join(CACHE,`voice-${id}.mp3`),meta=join(CACHE,`voice-${id}.json`);
   if(!(await exists(audio))||!(await exists(meta)))continue;
   const metadata=JSON.parse(await readFile(meta,'utf8'));
   const outputHash=await hashFile(audio),assetId=metadata.provenance?.assetId??`legacy-voice:${outputHash}`;
   await assertAudioNotKilled({assetId,voiceId:voice.voiceId,provider:voice.provider,outputHash});
   if(metadata.provenance){
    const records=await readLedger();
    if(!records.some(record=>record.assetId===assetId&&record.outputHash===outputHash))await appendLedgerRecord({...metadata.provenance,assetId,file:projectPath(audio),outputHash});
   }else{
    const records=await readLedger();
    if(!records.some(record=>record.outputHash===outputHash))await appendLedgerRecord({schemaVersion:1,assetId:`legacy-voice:${outputHash}`,assetKind:'voice',file:projectPath(audio),provider:voice.provider,model,modelVersion:voice.modelVersion??model,voiceId:voice.voiceId,voiceSource:voice.voiceSource??'library',owner:voice.owner??'unknown',planTier:null,generatedAt:null,requestHash:fullRequestHash({text:requestText,voice:voice.voiceId,model,settings}),outputHash,termsSnapshotRef:null,relatedTermsSnapshotRefs:[],permittedUses:[],nonBeta:null,status:'unverified'});
   }
   return {audio,words:metadata.words,reusedFallback:false};
  }
  return null;
 };
 let previous=await cached(text),reusedFallback=false;
 if(!previous&&fallbackText&&fallbackText!==text){previous=await cached(fallbackText);reusedFallback=Boolean(previous);}
 if(previous)return {...previous,reusedFallback};
 const requestInput={provider:voice.provider,voiceId:voice.voiceId,model,text,settings},payload=voiceRequestPayload(requestInput),seed=stableSeed(payload),request=voiceRequestHash(requestInput),id=voiceCacheId(requestInput),assetId=`voice:${voice.voiceId}:${request}`,audio=join(CACHE,`voice-${id}.mp3`),meta=join(CACHE,`voice-${id}.json`);
 await assertAudioNotKilled({assetId,voiceId:voice.voiceId,provider:voice.provider});
 await ensureHealthy(text);
 const generated=await provider.synthesize({text,voiceId:voice.voiceId,model,settings,seed});
 const audioBytes=Buffer.from(generated.audio),outputHash=sha256(audioBytes),generatedAt=new Date().toISOString();
 await assertAudioNotKilled({assetId,voiceId:voice.voiceId,provider:voice.provider,outputHash});
 const provenance={schemaVersion:1,assetId,assetKind:'voice',file:projectPath(audio),provider:voice.provider,model,modelVersion:voice.modelVersion??model,voiceId:voice.voiceId,voiceSource:voice.voiceSource??null,owner:voice.owner??null,planTier:voice.planTier??null,generatedAt,requestHash:request,outputHash,termsSnapshotRef:voice.termsSnapshotRef??null,relatedTermsSnapshotRefs:voice.relatedTermsSnapshotRefs??[],permittedUses:voice.permittedUses??[],nonBeta:voice.nonBeta??null,seed,settings,voiceHealth:voice.lastHealth??null};
 await mkdir(CACHE,{recursive:true});
 await writeFile(audio,audioBytes);
 await writeFile(meta,JSON.stringify({words:generated.words,provenance}));
 await appendLedgerRecord(provenance);
 return {audio,words:generated.words,reusedFallback:false};
}

/** ElevenLabs sound generation accepts 0.5 to 22 seconds; anything else fails late with a bare HTTP 400. */
export const SFX_SECONDS={min:0.5,max:22};
export function sfxProblems(table){
 return Object.entries(table).filter(([,item])=>item?.provider!=='elevenlabs-paid'||!(item.seconds>=SFX_SECONDS.min&&item.seconds<=SFX_SECONDS.max)||!item.prompt?.trim()||!item.modelId?.trim()||!item.licenceEvidence?.trim()||!item.termsSnapshotRef?.trim())
  .map(([name])=>`sound effect '${name}' must provide a paid-provider prompt, model, ${SFX_SECONDS.min} to ${SFX_SECONDS.max} s duration, licence evidence and terms snapshot`);
}
const sfxTable=()=>{
 const problems=sfxProblems(SFX);
 if(problems.length)throw new Error(problems.join('\n'));
 return SFX;
};

/** Appends a ledger record once per asset id and output hash. */
async function ledgerOnce(record){
 const records=await readLedger();
 if(!records.some(item=>item.assetId===record.assetId&&item.outputHash===record.outputHash))await appendLedgerRecord(record);
}

/** One generated sound effect: cached MP3 plus a sidecar holding its rights ledger record. */
async function effect(name,key,table){
 const item=table[name];
 if(item?.provider!=='elevenlabs-paid')throw new Error(`SFX ${name} has no approved source.`);
 const body={text:item.prompt,duration_seconds:item.seconds,model_id:item.modelId,prompt_influence:0.6};
 const fullRequest=fullRequestHash({provider:'elevenlabs',endpoint:'/v1/sound-generation',format:'mp3_44100_128',...body}),assetId=`sfx:${name}:${fullRequest}`;
 const id=hash({prompt:item.prompt,seconds:item.seconds,modelId:item.modelId}),file=join(CACHE,`sfx-${name}-${id}.mp3`),meta=join(CACHE,`sfx-${name}-${id}.json`);
 await assertAudioNotKilled({assetId,provider:'elevenlabs'});
 if(await exists(file)&&await exists(meta)){
  const saved=JSON.parse(await readFile(meta,'utf8')),outputHash=await hashFile(file);
  if(saved.ledger?.outputHash===outputHash){
   await assertAudioNotKilled({assetId:saved.ledger.assetId,provider:'elevenlabs',outputHash});
   await ledgerOnce({...saved.ledger,file:projectPath(file)});
   return file;
  }
 }
 if(!key)throw new Error(`No cached sound effect is available for '${name}'; set ELEVENLABS_API_KEY to generate it.`);
 const response=await eleven('/v1/sound-generation?output_format=mp3_44100_128',body,key);
 const bytes=Buffer.from(await response.arrayBuffer()),outputHash=sha256(bytes),generatedAt=new Date().toISOString();
 await assertAudioNotKilled({assetId,provider:'elevenlabs',outputHash});
 const ledger={schemaVersion:1,assetId,assetKind:'sfx',file:projectPath(file),provider:'elevenlabs',model:item.modelId,modelVersion:item.modelId,voiceId:null,voiceSource:null,owner:null,planTier:item.planTier,generatedAt,requestHash:fullRequest,outputHash,termsSnapshotRef:item.termsSnapshotRef,relatedTermsSnapshotRefs:item.relatedTermsSnapshotRefs??[],permittedUses:[...REQUIRED_USES],nonBeta:item.nonBeta,prompt:item.prompt,seconds:item.seconds,licenceEvidence:item.licenceEvidence};
 await writeFile(file,bytes);
 await writeFile(meta,JSON.stringify({name,generatedAt,ledger})+'\n');
 await appendLedgerRecord(ledger);
 return file;
}

async function assertAudioNotKilled(record){
 const reasons=killSwitchReasons(record,await readKillSwitch());
 if(reasons.length)throw new Error(`Audio synthesis/reuse is paused: ${reasons.join('; ')}`);
}

const normalizeWord=value=>String(value??'').toLocaleLowerCase().match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/u)?.[0]??'';
const isClauseEnd=value=>/[,.!?;:]$/u.test(String(value??''));

/** Caption chunks target 3–7 words, preserving clause stops and avoiding tiny trailing fragments. */
function captionWordGroups(items){
 const clauses=[];let clause=[];
 for(const item of items){clause.push(item);if(isClauseEnd(item.text)){clauses.push(clause);clause=[];}}
 if(clause.length)clauses.push(clause);
 const groups=[];let pending=[];
 const splitBalanced=source=>{
  let count=Math.ceil(source.length/7);
  while(count>1&&Math.floor(source.length/count)<3)count--;
  const size=Math.floor(source.length/count),extra=source.length%count;let cursor=0;
  for(let index=0;index<count;index++){
   const length=size+(index<extra?1:0);groups.push(source.slice(cursor,cursor+length));cursor+=length;
  }
 };
 for(const currentClause of clauses){
  if(currentClause.length<3){pending.push(...currentClause);continue;}
  const combined=[...pending,...currentClause];pending=[];
  if(combined.length<=7)groups.push(combined);else splitBalanced(combined);
 }
 if(pending.length){
  const previous=groups.at(-1);
  while(pending.length<3&&previous?.length>3)pending.unshift(previous.pop());
  if(previous&&!previous.length)groups.pop();
  if(previous&&previous.length+pending.length<=7)previous.push(...pending);
  else groups.push(pending);
 }
 return groups;
}

export function captionsFromSpeech(say,words,offset,sceneEnd){
 const marked=markupWords(say),items=[];
 words.forEach((word,index)=>{
  const display=word.text??marked[index]?.text??'';
  items.push({...word,text:display,accent:word.accent??marked[index]?.accent??false});
 });
 const groups=captionWordGroups(items);
 return groups.map((items,index)=>{
  const next=groups[index+1]?.[0];
  const start=offset+items[0].start,end=Math.min(sceneEnd,next?offset+next.start:offset+items.at(-1).end+0.3);
  let text='';
  for(const item of items){
   const token=item.accent?`*${item.text}*`:item.text;
   text+=`${text?' ':''}${token}`;
  }
  return {text,start:Math.round(start*1000)/1000,end:Math.round(end*1000)/1000};
 }).filter(caption=>caption.end-caption.start>0.05);
}

/** Keeps the most important one-shot SFX while bounding every rolling ten-second window. */
export function capSalientCues(cues,limit=MAX_SALIENT_SFX_PER_10_SECONDS){
 const kept=[],dropped=[];
 for(const cue of [...cues].sort((a,b)=>a.at-b.at)){
  if(!cue.salient||!cue.sfx){kept.push(cue);continue;}
  const recent=kept.filter(item=>item.salient&&item.sfx&&cue.at-item.at<=10);
  if(recent.length<limit){kept.push(cue);continue;}
  const lowest=recent.reduce((a,b)=>(a.priority??0)<=(b.priority??0)?a:b);
  if((cue.priority??0)>(lowest.priority??0)){
   kept.splice(kept.indexOf(lowest),1);dropped.push({...lowest,droppedReason:`replaced by higher-priority SFX within ${limit} cues per rolling 10 seconds`});kept.push(cue);
  }else dropped.push({...cue,droppedReason:`density cap of ${limit} salient SFX per rolling 10 seconds`});
 }
 return {cues:kept.sort((a,b)=>a.at-b.at),dropped:dropped.sort((a,b)=>a.at-b.at),limit};
}

function proportionalWordTime(scene,word){
 const words=String(scene.say??'').replace(/\*[^*]+\*/gu,match=>match.slice(1,-1)).match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)??[];
 const index=words.findIndex(item=>normalizeWord(item)===normalizeWord(word));
 return words.length?scene.duration*Math.max(0,index)/words.length:0;
}

/** Stretches scenes to narration, resolves event anchors, and reports scheduled event/SFX alignment. */
export function arrange(spec,spoken){
 const styleName=spec.style??'patch',style=styleOf(styleName),table=sfxTable(),hitAlignments=[],eventAlignments=[],eventAlignmentByScene=[];
 let cueId=0;
 const scenes=spec.scenes.map((scene,index)=>{
  const voice=spoken[index];
  const duration=voice?Math.min(8,Math.max(1.2,Math.ceil((LEAD+voice.words.at(-1).end+TAIL)*FPS)/FPS)):scene.duration;
  let rest=scene;
  if(voice){const {say:_say,caption:_caption,...withoutNarration}=scene;rest=withoutNarration;}
  const hits=scene.hits?.map(hit=>Math.round(Math.min(duration-0.05,hit*duration/scene.duration)*100)/100);
  const accented=voice?.words.find(word=>word.accent);
  if(hits?.length&&accented){
   hits[0]=Math.round(Math.max(0,Math.min(duration-0.05,LEAD+accented.start))*100)/100;
   hitAlignments.push({scene:index+1,word:accented.text,at:hits[0],spokenStart:LEAD+accented.start});
  }
  const events=(scene.events??[]).map((event,eventIndex)=>{
   let at,word=event.word,source='proportional';
   if(event.at!==undefined){at=event.at*duration/scene.duration;source='scaled-time';}
   else if(voice&&word){
    const matched=voice.words.find(item=>normalizeWord(item.text)===normalizeWord(word));
    at=matched?LEAD+matched.start:LEAD+proportionalWordTime(scene,word);
    source=matched?'voice':'proportional';
   }else at=proportionalWordTime(scene,word);
   at=Math.round(Math.max(0,Math.min(duration-0.05,at))*1000)/1000;
   const {word:_word,...resolved}=event;
   return {...resolved,at,alignment:{word,source,eventIndex}};
  });
  eventAlignmentByScene[index]=events.map(({alignment})=>alignment);
  return {...rest,duration,...(hits?{hits}:{}),...(events.length?{events:events.map(({alignment:_alignment,...event})=>event)}:{})};
 });
 const timed={...spec,scenes};
 const placed=placeScenes(timed),captions=[],cues=[];
 hitAlignments.forEach(hit=>{hit.timelineAt=placed[hit.scene-1].start+hit.at;});
 placed.forEach((scene,index)=>{
  const voice=spoken[index];
  if(voice){
   cues.push({id:cueId++,file:voice.audio,at:scene.start+LEAD,gain:1,kind:'voice',salient:false,sceneIndex:index,words:voice.words});
   captions.push(...captionsFromSpeech(spec.scenes[index].say,voice.words,scene.start+LEAD,scene.end));
  }
  const transition=TRANSITION_SFX[scene.spec.transition];
  if(index>0&&transition)cues.push({id:cueId++,sfx:transition,at:Math.max(0,scene.start-0.08),salient:true,priority:50,source:'transition',cueRole:'transition'});
  for(const hit of scene.spec.hits??[])cues.push({id:cueId++,sfx:'hit',at:scene.start+hit,salient:true,priority:82,source:'hit',cueRole:'semantic'});
  (scene.spec.events??[]).forEach((event,eventIndex)=>{
   const original=spec.scenes[index].events?.[eventIndex];if(!original)return;
   const timing=eventAlignmentByScene[index]?.[eventIndex];
   const requested=original.sfx??EVENT_SFX[event.kind],sfx=resolveSfxName(requested);
   if(!sfx)throw new Error(`scene ${index+1} event ${eventIndex+1} references unknown SFX '${requested}'`);
   const cue={id:cueId++,sfx,at:scene.start+event.at,salient:true,priority:original.sfx?100:event.kind==='resolve'?96:92,source:'event',cueRole:'semantic'};
   cues.push(cue);
   eventAlignments.push({scene:index+1,event:eventIndex+1,kind:event.kind,word:original.word??null,sfx,at:event.at,timelineAt:cue.at,source:timing?.source??(original.at!==undefined?'scaled-time':'proportional'),cueId:cue.id});
  });
  // Specials name their own bed; Big Idea stays quiet: no automatic typing or tick beds.
  const bed=scene.spec.type==='special'?style.specials?.[scene.spec.kind]?.bed:styleName==='bigidea'?undefined:SCENE_BED[scene.spec.type];
  // The bed covers the build (about the first 60% of the scene) and stops before the payoff.
  if(bed&&table[bed])cues.push({id:cueId++,sfx:bed,at:scene.start+0.15,length:Math.min(table[bed].seconds,(scene.end-scene.start)*0.6),salient:false,source:'bed',cueRole:'texture'});
  // One pop per group entrance, not one per item: fewer, more meaningful sounds.
  if(scene.spec.type==='list'&&scene.spec.items.length)cues.push({id:cueId++,sfx:'pop',at:scene.start+0.1,salient:true,priority:25,source:'list',cueRole:'group-entry'});
  if(scene.spec.type==='kinetic'&&scene.spec.words.length)cues.push({id:cueId++,sfx:'pop',at:scene.start+(scene.end-scene.start)*0.65,salient:true,priority:28,source:'kinetic',cueRole:'group-entry'});
  // The brand sting only plays in the speech gap after the last outro word.
  if(scene.spec.type==='outro'&&index>0){
   const stingLength=table.sting.seconds;
   const lastWord=voice?.words?.at(-1),gapStart=lastWord?scene.start+LEAD+lastWord.end:scene.start+0.25;
   if(scene.end-gapStart>=stingLength+0.02)cues.push({id:cueId++,sfx:'sting',at:gapStart+0.02,salient:true,priority:35,source:'outro',cueRole:'brand'});
  }
 });
 if(captions.length)timed.captions=captions;
 const capped=capSalientCues(cues);
 const keptIds=new Set(capped.cues.map(cue=>cue.id));
 const finalEventAlignments=eventAlignments.map(item=>({...item,kept:keptIds.has(item.cueId),...(keptIds.has(item.cueId)?{}:{droppedReason:'salient SFX density cap'})}));
 const salientBefore=cues.filter(cue=>cue.salient&&cue.sfx).length,salientAfter=capped.cues.filter(cue=>cue.salient&&cue.sfx).length;
 return {spec:timed,cues:capped.cues.map(cue=>cue.sfx?{...cue,gain:cue.gain??table[cue.sfx].gain}:cue),duration:placed.at(-1).end,hitAlignments,eventAlignments:finalEventAlignments,sfxDensity:{salientBefore,salientAfter,dropped:capped.dropped.length,capPerRolling10Seconds:capped.limit,droppedCues:capped.dropped.map(({id,sfx,at,source,droppedReason})=>({id,sfx,at,source,droppedReason}))}};
}

function run(binary,args){
 return new Promise((resolve,reject)=>{
  const child=spawn(binary,args,{stdio:['ignore','inherit','pipe']});let errors='';
  child.stderr.on('data',chunk=>{errors=(errors+chunk).slice(-2000);});
  child.once('error',reject);child.once('close',code=>code===0?resolve():reject(new Error(`${binary} exited with ${code}: ${errors}`)));
 });
}

function capture(binary,args){
 return new Promise((resolve,reject)=>{
  const child=spawn(binary,args,{stdio:['ignore','ignore','pipe']});let errors='';
  child.stderr.on('data',chunk=>{errors=(errors+chunk).slice(-12000);});
  child.once('error',reject);child.once('close',code=>code===0?resolve(errors):reject(new Error(`${binary} exited with ${code}: ${errors}`)));
 });
}

export function parseArguments(args){
 const positional=[],options={};
 for(let index=0;index<args.length;index++){
  const arg=args[index];
  if(arg==='--post'){
   if(!args[index+1]||args[index+1].startsWith('--'))throw new Error('--post requires a post id');
   options.postId=args[++index];
  }else if(arg.startsWith('--post=')){
   options.postId=arg.slice('--post='.length);
   if(!options.postId)throw new Error('--post requires a post id');
  }else if(arg.startsWith('--'))throw new Error(`Unknown option: ${arg}`);
  else positional.push(arg);
 }
 if(positional.length!==2)throw new Error('Usage: node --env-file=.env.motion scripts/motion-audio.mjs <spec.json> <out.mp4> [--post <post-id>]');
 return {specPath:positional[0],outPath:positional[1],...options};
}

function reportLoudness(output){
 const integrated=[...output.matchAll(/\bI:\s*(-?\d+(?:\.\d+)?)\s*LUFS/g)].at(-1)?.[1];
 const truePeak=[...output.matchAll(/\bPeak:\s*(-?\d+(?:\.\d+)?)\s*dBFS/g)].at(-1)?.[1];
 if(integrated===undefined||truePeak===undefined)throw new Error(`Could not read EBU R128 loudness from FFmpeg output:\n${output}`);
 return {integrated:Number(integrated),truePeak:Number(truePeak)};
}

function normalizationStats(output){
 const block=[...output.matchAll(/\{\s*"input_i"[\s\S]*?\}/g)].at(-1)?.[0];
 if(!block)throw new Error(`Could not read FFmpeg loudness analysis:\n${output}`);
 const stats=JSON.parse(block),keys=['input_i','input_tp','input_lra','input_thresh','target_offset'];
 if(keys.some(key=>!Number.isFinite(Number(stats[key]))))throw new Error('FFmpeg loudness analysis returned incomplete measurements');
 return stats;
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const {specPath,outPath,postId}=parseArguments(process.argv.slice(2));
 const key=process.env.ELEVENLABS_API_KEY?.trim();
 const parsed=parseReelSpec(JSON.parse(await readFile(specPath,'utf8')));
 if(!parsed.ok)throw new Error(`Invalid reel spec:\n${parsed.errors.join('\n')}`);
 await mkdir(CACHE,{recursive:true});

 const voiceConfig=await loadVoiceConfig(),voice=resolveActiveVoice(voiceConfig);
 if(!voice.providerConfig.enabled)throw new Error(`Voice provider '${voice.provider}' is disabled in audio/voice/config.json`);
 const provider=createVoiceProvider(voice.provider,{apiKey:key,enabled:voice.providerConfig.enabled,reason:voice.providerConfig.disabledReason});
 let healthPromise;
 const ensureHealthy=async text=>{
  if(voice.provider==='elevenlabs'&&!key)throw new Error(`No cached narration is available for "${text.length>60?`${text.slice(0,57)}...`:text}"; set ELEVENLABS_API_KEY to synthesize voice.`);
  healthPromise??=checkVoiceHealth({config:voiceConfig,voice,provider});
  const result=await healthPromise;voice.lastHealth=result.health;
  if(result.ambiguous)throw new Error(`Voice health changed (${result.changes.join(', ')}); synthesis is paused until the configured voice is reviewed`);
 };
 const lexicon=JSON.parse(await readFile(join(ROOT,'audio','pronunciations.json'),'utf8'));
 const spoken=[];
 for(const scene of parsed.spec.scenes){
  if(!scene.say){spoken.push(null);continue;}
  await assertAudioNotKilled({assetId:`voice:${voice.id}`,voiceId:voice.voiceId,provider:voice.provider});
  const pronunciation=pronounce(scene.say,lexicon),line=await speak(pronunciation.text,voice,provider,stripMarkup(scene.say),parsed.spec.style??'patch',ensureHealthy);
  spoken.push({audio:line.audio,words:mapSpeechTimings(pronunciation,line.words),reusedFallback:line.reusedFallback});
 }
 // The timed spec is written elsewhere, so image paths must not stay relative to the original spec file.
 const base=dirname(resolve(specPath));
 if(parsed.spec.assets)parsed.spec.assets=Object.fromEntries(Object.entries(parsed.spec.assets).map(([id,path])=>[id,isAbsolute(path)?path:join(base,path)]));
 const {spec,cues,duration,hitAlignments,eventAlignments,sfxDensity}=arrange(parsed.spec,spoken);
 const table=sfxTable(),files=new Map();
 for(const name of new Set(cues.map(cue=>cue.sfx).filter(Boolean)))files.set(name,await effect(name,key,table));

 const work=join(CACHE,`render-${hash({spec,cues})}`);
 await mkdir(work,{recursive:true});
 await mkdir(dirname(resolve(outPath)),{recursive:true});
 const manifestPath=join(work,'render-manifest.json'),timedSpec=join(work,'spec.json'),silent=join(work,'video.mp4'),raw=join(work,'mix.wav'),mix=join(work,'mix.m4a');
 await writeFile(timedSpec,JSON.stringify(spec,null,1));
 try{
  await run(process.execPath,[join(ROOT,'scripts/motion.mjs'),'render',timedSpec,silent]);
  // Every cue is delayed to its place; effects duck gently under the speech bus.
  const inputs=cues.flatMap(cue=>['-i',cue.file??files.get(cue.sfx)]);
  const graph=buildMixGraph(cues,duration);
  await run('ffmpeg',['-hide_banner','-loglevel','error','-y',...inputs,'-filter_complex',graph.filter,'-map',graph.output,'-t',duration.toFixed(3),'-ar','48000','-c:a','pcm_s16le',raw]);
  const analysis=normalizationStats(await capture('ffmpeg',['-hide_banner','-nostats','-i',raw,'-af',`${graph.masterFilter}:print_format=json`,'-f','null','-']));
  const master=`${graph.masterFilter}:measured_I=${analysis.input_i}:measured_TP=${analysis.input_tp}:measured_LRA=${analysis.input_lra}:measured_thresh=${analysis.input_thresh}:offset=${analysis.target_offset}:linear=true`;
  await run('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',raw,'-af',master,'-ar','48000','-c:a','aac','-b:a','192k',mix]);
  await run('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',silent,'-i',mix,'-map','0:v','-map','1:a','-c:v','copy','-c:a','copy','-t',duration.toFixed(3),'-movflags','+faststart',outPath]);
  const measurement=reportLoudness(await capture('ffmpeg',['-hide_banner','-nostats','-i',outPath,'-map','0:a:0','-af','ebur128=peak=true','-f','null','-']));
  console.log(`EBU R128: ${measurement.integrated.toFixed(1)} LUFS integrated; ${measurement.truePeak.toFixed(1)} dBTP true peak.`);
  if(measurement.truePeak>-1)throw new Error(`Final audio true peak ${measurement.truePeak.toFixed(1)} dBTP exceeds the -1 dBTP limit`);
  for(const hit of hitAlignments)console.log(`Hit alignment: scene ${hit.scene}, *${hit.word}* starts ${hit.spokenStart.toFixed(2)}s into the scene; first hit at ${hit.at.toFixed(2)}s (timeline ${hit.timelineAt.toFixed(2)}s).`);
  for(const event of eventAlignments)console.log(`Event alignment: scene ${event.scene} ${event.kind}${event.word?` on "${event.word}"`:''} → ${event.sfx} at ${event.at.toFixed(2)}s (timeline ${event.timelineAt.toFixed(2)}s; ${event.source}; ${event.kept?'kept':'dropped by density cap'}).`);
  console.log(`Salient SFX: ${sfxDensity.salientAfter}/${sfxDensity.salientBefore} kept; ${sfxDensity.dropped} dropped; cap ${sfxDensity.capPerRolling10Seconds} per rolling 10 seconds.`);
  const legacyCached=spoken.filter(line=>line?.reusedFallback).length;
  if(legacyCached)console.log(`Reused ${legacyCached} cached lines made before lexicon expansion; no new narration request was sent for them.`);
  const ledger=await readLedger(),audio=[];
  for(const cue of cues){
   const file=cue.file??files.get(cue.sfx),outputHash=await hashFile(file),entry=ledger.find(item=>item.outputHash===outputHash);
   audio.push({assetId:entry?.assetId??(cue.kind==='voice'?`legacy-voice:${outputHash}`:`sfx:${cue.sfx}`),kind:cue.kind??'sfx',file:projectPath(file),sha256:outputHash,...(cue.kind==='voice'?{voiceId:entry?.voiceId??voice.voiceId,provider:entry?.provider??voice.provider}:{}),...(cue.sfx?{sfx:cue.sfx}:{}),at:cue.at,gain:cue.gain??1});
  }
  const manifest={schemaVersion:1,renderId:basename(work),postId:postId??process.env.MOTION_POST_ID??null,createdAt:new Date().toISOString(),pathBase:'project',timedSpec:projectPath(timedSpec),outputFile:projectPath(resolve(outPath)),outputSha256:await hashFile(outPath),style:spec.style??'patch',durationSeconds:duration,audio};
  await writeFile(manifestPath,`${JSON.stringify(manifest,null,2)}\n`);
 }finally{await rm(silent,{force:true});await rm(raw,{force:true});await rm(mix,{force:true});}
 console.log(`Wrote ${outPath} (${duration.toFixed(1)} s, ${spoken.filter(Boolean).length} narrated scenes, ${cues.filter(cue=>cue.sfx).length} SFX cues). Timed spec: ${timedSpec}`);
 console.log(`Audio rights manifest: ${manifestPath}`);
 const rights=await auditRender(manifestPath);
 if(rights.cleared)console.log(`Rights audit: CLEARED (${rights.items.length} audio file(s)).`);
 else{
  const byKind=new Map();
  for(const error of rights.errors){const kind=rights.items.find(item=>item.file===error.file)?.assetKind??'audio';byKind.set(kind,(byKind.get(kind)??0)+1);}
  const summary=[...byKind].map(([kind,count])=>`${count} ${kind}`).join(', ');
  console.log(`Rights audit: HOLD - ${rights.errors.length} of ${rights.items.length} audio file(s) are not cleared (${summary}). The video was rendered for review only; do not publish it.`);
  if(rights.errors.some(error=>error.code==='legacy_unverified'))console.log('Cause: narration reuses legacy Arthur cache clips made before the rights ledger. Complete audio/rights/attestations/arthur.json (see arthur.example.json) or re-voice with a cleared voice.');
  console.log(`Details: node scripts/audio/rights/check.mjs ${projectPath(manifestPath)}`);
 }
}
