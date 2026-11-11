// Renders a code-animated Reel WITH sound: ElevenLabs narration, captions that
// follow the voice, a music bed that ducks under the voice, and soft sound
// effects locked to the picture (every scene reports its own sound moments).
//
//   node --env-file=.env.motion scripts/motion-audio.mjs <spec.json> <out.mp4>
//
// Needs ELEVENLABS_API_KEY (text to speech, sound effects, music). Optional:
// ELEVENLABS_VOICE_ID (default: Arthur), ELEVENLABS_MODEL. Every generated clip is cached in
// .motion-cache by content hash, so re-rendering an unchanged line costs nothing.
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,access,rm,appendFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseReelSpec} from '../src/motion/spec.ts';
import {CUE_KINDS,FPS,markupWords,placeScenes,stripMarkup} from '../src/motion/core.ts';
import {transitionCues} from '../src/motion/fx/transitions.ts';
import {SFX,MUSIC_BPM,variantPitch} from './audio/sfx-design.mjs';
import {synthesizeToFile} from './audio/synth.mjs';

export {SFX} from './audio/sfx-design.mjs';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const CACHE=join(ROOT,'.motion-cache');
const API='https://api.elevenlabs.io';
const LEAD=Number(process.env.MOTION_LEAD)||0.12;   // silence before the voice in each scene, so a cut never clips a word
const TAIL=Number(process.env.MOTION_TAIL)||0.32;   // breath after the last word before the next cut

/** Pops climb a pentatonic scale through a sequence, so a build sounds like it is going somewhere. */
const SCALE=[0,2,4,7,9,12,14,16];
/** Used only for scenes that do not report their own cues. */
const SCENE_BED={code:'type',diff:'type',terminal:'type',chat:'type'};

/** Music beds. Instrumental, minimal, mixed low and ducked under the voice. */
export const MUSIC={
 drive:'Instrumental only. Modern upbeat tech explainer background track for a short vertical video: punchy tight drums, deep clean sub bass, plucky bright synth arpeggio, light chiptune 8-bit texture, confident and driving, 118 BPM, minimal and uncluttered so a voice-over sits on top, starts immediately at full energy, no vocals.',
 chill:'Instrumental only. Warm lo-fi electronic background track for a short tech explainer: soft drums, mellow electric piano chords, gentle sub bass, subtle 8-bit bleeps, relaxed and curious, 92 BPM, minimal so a voice-over sits on top, starts immediately, no vocals.',
 tense:'Instrumental only, premium cinematic noir-electronic score for a 33-second finance film. A driving 108 BPM pulse made from muted low toms, restrained analog bass, ticking metal percussion and sparse bowed-steel harmonics; minimal and dark, with no lead melody or bright chiptune. Start with a clear low pulse and lots of space for narration, gradually add a second rhythmic layer and open the filtered upper texture around the middle, then build pressure and width toward a strong final impact. Controlled dynamics, clean ending, no vocals, no speech.',
 bright:'Instrumental only. Bright playful electronic pop background track for a short tech explainer: bouncy drums, glassy bell melody, warm bass, sparkling chiptune arpeggios, optimistic and fun, 124 BPM, minimal so a voice-over sits on top, starts immediately, no vocals.',
};

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,20);
const exists=path=>access(path).then(()=>true,()=>false);

async function eleven(path,body,key){
 const response=await fetch(`${API}${path}`,{method:body?'POST':'GET',headers:{'xi-api-key':key,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(120000)});
 if(process.env.MOTION_USAGE_FILE)await appendFile(process.env.MOTION_USAGE_FILE,JSON.stringify({at:new Date().toISOString(),provider:'elevenlabs',endpoint:path.split('?')[0],status:response.status,characterCost:response.headers.get('character-cost'),characters:path.includes('text-to-speech')?body?.text?.length:undefined,seconds:body?.duration_seconds??(body?.music_length_ms?body.music_length_ms/1000:undefined)})+'\n');
 if(response.ok)return response;
 // Provider error bodies can echo request details; only the status is reported.
 const reason=response.status===401||response.status===403?'the API key was rejected or lacks this permission':response.status===402||response.status===429?'the account is out of credits or rate limited':`status ${response.status}`;
 throw new Error(`ElevenLabs ${path.split('?')[0]} failed: ${reason}`);
}

/** The brand narrator: ElevenLabs "Arthur - Energetic American Male Narrator". ELEVENLABS_VOICE_ID overrides it. */
const VOICE_ID='TtRFBnwQdH1k01vR0hMz';
const pickVoice=()=>process.env.ELEVENLABS_VOICE_ID?.trim()||VOICE_ID;

/** One narration line: cached MP3 plus the time each word is spoken. */
async function speak(text,voice,key){
 const model=process.env.ELEVENLABS_MODEL??'eleven_multilingual_v2';
 const settings={stability:0.4,similarity_boost:0.75,style:0.35,use_speaker_boost:true,speed:Number(process.env.MOTION_VOICE_SPEED)||1.12};
 const id=hash({text,voice,model,settings}),audio=join(CACHE,`voice-${id}.mp3`),meta=join(CACHE,`voice-${id}.json`);
 if(!(await exists(audio))||!(await exists(meta))){
  const data=await (await eleven(`/v1/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_128`,{text,model_id:model,voice_settings:settings},key)).json();
  const a=data.alignment??data.normalized_alignment;
  if(!data.audio_base64||!a)throw new Error('ElevenLabs returned no audio or timing');
  const words=[];let current=null;
  a.characters.forEach((char,index)=>{
   if(/\s/.test(char)){if(current){words.push(current);current=null;}return;}
   current??={text:'',start:a.character_start_times_seconds[index],end:0};
   current.text+=char;current.end=a.character_end_times_seconds[index];
  });
  if(current)words.push(current);
  await writeFile(audio,Buffer.from(data.audio_base64,'base64'));
  await writeFile(meta,JSON.stringify({words}));
 }
 const words=JSON.parse(await readFile(meta,'utf8')).words,tempo=Number(process.env.MOTION_SPEECH_TEMPO)||1;
 if(tempo!==1){
  if(tempo<.7||tempo>1.3)throw new Error('MOTION_SPEECH_TEMPO must be .7 to 1.3');
  const paced=join(CACHE,`voice-${id}-tempo-${tempo}.mp3`);
  if(!await exists(paced))await run('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',audio,'-af',`atempo=${tempo}`,'-c:a','libmp3lame','-q:a','2',paced]);
  return {audio:paced,words:words.map(w=>({...w,start:w.start/tempo,end:w.end/tempo}))};
 }
 return {audio,words};
}

const atempoChain=ratio=>{
 const filters=[];let factor=ratio;
 while(factor>2){filters.push('atempo=2');factor/=2;}
 while(factor<0.5){filters.push('atempo=0.5');factor/=0.5;}
 filters.push(`atempo=${factor.toFixed(5)}`);
 return filters.join(',');
};

async function effect(name,key,variant=0,requestedSeconds=undefined){
 const design=SFX[name];
 if(!design)throw new Error(`No sound design registered for cue kind: ${name}`);
 const prompt=design.prompts?.[variant%design.prompts.length]??design.prompt;
 const seconds=Math.max(0.08,Math.min(8,Number(requestedSeconds)||design.seconds));
 const id=hash({kind:name,source:design.source??'synth',prompt:prompt??null,promptSeconds:design.promptSeconds??null,variant,duration:Math.round(seconds*1000)/1000,revision:4});
 const file=join(CACHE,`${design.source==='eleven'?'sfx':'synth'}-${name}-${id}.wav`);
 if(await exists(file))return file;
 if(design.source==='eleven'){
  const rawId=hash({prompt,seconds:design.promptSeconds}),raw=join(CACHE,`sfx-${name}-${rawId}.mp3`);
  if(!(await exists(raw))){
   const response=await eleven('/v1/sound-generation?output_format=mp3_44100_128',{text:prompt,duration_seconds:design.promptSeconds,prompt_influence:0.7},key);
   await writeFile(raw,Buffer.from(await response.arrayBuffer()));
  }
  const speed=atempoChain(design.promptSeconds/seconds);
  const tail=Math.min(design.tail??0.09,seconds*0.95),start=Math.max(0,seconds-tail);
  const filter=`silenceremove=start_periods=1:start_threshold=-46dB:start_silence=0.003,${speed},aresample=48000,aformat=channel_layouts=stereo,apad=whole_dur=${seconds.toFixed(3)},atrim=0:${seconds.toFixed(3)},afade=t=out:st=${start.toFixed(3)}:d=${tail.toFixed(3)}`;
  await run('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',raw,'-af',filter,'-c:a','pcm_s16le',file]);
 }else await synthesizeToFile(name,variant,seconds,file);
 return file;
}

async function music(mood,seconds,key){
 const prompt=MUSIC[mood]??MUSIC.drive,length=Math.min(120,Math.max(10,Math.ceil((seconds+1.5)/5)*5));
 const file=join(CACHE,`music-${hash({prompt,length})}.mp3`);
 if(!(await exists(file))){
  const response=await eleven('/v1/music?output_format=mp3_44100_128',{prompt,music_length_ms:length*1000,force_instrumental:true},key);
  await writeFile(file,Buffer.from(await response.arrayBuffer()));
 }
 return file;
}

/** Caption phrases follow the voice in readable chunks without splitting sentence beats. */
export function captionsFromSpeech(say,words,offset,sceneEnd){
 const marked=markupWords(say),groups=[];let group=[];
 words.forEach((word,index)=>{
  const text=marked[index]?.accent?`*${word.text}*`:word.text;
  group.push({...word,text});
  const length=group.reduce((sum,item)=>sum+item.text.replaceAll('*','').length,0)+Math.max(0,group.length-1);
  if(group.length>=6||length>=34||/[.!?…][”’"')\]]*$/.test(word.text)){groups.push(group);group=[];}
 });
 if(group.length)groups.push(group);
 return groups.map((items,index)=>{
  const next=groups[index+1]?.[0];
  const start=offset+items[0].start,end=Math.min(sceneEnd,next?offset+next.start:offset+items.at(-1).end+0.3);
  // Adjacent accent words merge into one span so the renderer sees a single marked phrase.
  return {text:items.map(item=>item.text).join(' ').replaceAll('* *',' ').replace(/[,;:]$/,''),start:Math.round(start*1000)/1000,end:Math.round(end*1000)/1000,words:items.map(item=>({start:Math.round((offset+item.start)*1000)/1000,end:Math.round((offset+item.end)*1000)/1000}))};
 }).filter(caption=>caption.end-caption.start>0.05);
}

let sceneDefs=null;
/** A scene's own sound moments, or null when it does not report any. */
function sceneCues(scene,duration){
 try{const list=sceneDefs?.[scene.type]?.cues?.(scene,duration);return Array.isArray(list)&&list.length?list.slice(0,60):null;}catch{return null;}
}

const CUE_PRIORITY={secondary:1,transition:2,story:3};
const TRANSIENT_CUES=new Set(['click','tick','snap','clack','coin','pop','impact','thud','stamp','crack','zap','beep','step','land','drop']);
const cueLevel=cue=>(SFX[cue.sfx]?.gain??1)*(cue.gain??1);
const cuePriority=cue=>CUE_PRIORITY[cue._class]??0;
const cueDuration=cue=>Math.max(0.02,Number(cue.length)||SFX[cue.sfx]?.seconds||0.2);
const cueStrengthOrder=(a,b)=>cuePriority(b)-cuePriority(a)||cueLevel(b)-cueLevel(a)||a.at-b.at;

function maxCueOverlap(cues){
 const points=[];
 for(const cue of cues)if(cue.sfx){points.push([cue.at,1],[cue.at+cueDuration(cue),-1]);}
 points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 let active=0,maximum=0;
 for(const [,delta] of points){active+=delta;maximum=Math.max(maximum,active);}
 return maximum;
}

/** Globally prunes SFX while keeping story hits ahead of transitions and transitions ahead of texture. */
function governCues(cues,duration,placed){
 const original=cues.filter(cue=>cue.sfx);
 let kept=[...original].sort((a,b)=>a.at-b.at);

 // Keep only the strongest of near-identical same-kind attacks.
 const collapsed=[];
 for(const cue of kept){
  const prior=[...collapsed].reverse().find(item=>item.sfx===cue.sfx&&cue.at-item.at<0.08);
  if(!prior){collapsed.push(cue);continue;}
  if(cueStrengthOrder(cue,prior)<0){collapsed.splice(collapsed.indexOf(prior),1,cue);}
 }
 kept=collapsed;

 // A transition and an incoming scene's first story beat must never land together.
 const muted=new Set();
 for(const transition of kept.filter(cue=>cue._class==='transition')){
  const scene=placed[transition._sceneIndex];
  if(!scene)continue;
  const firstBeat=kept.filter(cue=>cue._sceneIndex===transition._sceneIndex&&cue._class==='story'&&cue.at>=scene.start-0.001&&cue.at<=scene.start+0.24&&cue.at<transition.at+cueDuration(transition));
  if(!firstBeat.length)continue;
  const hit=firstBeat.sort((a,b)=>cueLevel(b)-cueLevel(a))[0];
  // Keep the louder one; on a tie, the synced story hit wins.
  if(cueLevel(hit)>=cueLevel(transition))muted.add(transition);
  else muted.add(hit);
 }
 kept=kept.filter(cue=>!muted.has(cue));

 // Short secondary accents inside 120 ms of a stronger cue read as transient stacking.
 kept=kept.filter(cue=>{
  if(cue._class!=='secondary'||!TRANSIENT_CUES.has(cue.sfx))return true;
  return !kept.some(other=>other!==cue&&Math.abs(other.at-cue.at)<0.12&&cueLevel(other)>cueLevel(cue));
 });

 // Enforce no more than three simultaneously sounding effects. Replace an active lower-ranked cue
 // when a stronger story beat arrives during it.
 const accepted=[];
 for(const cue of [...kept].sort((a,b)=>a.at-b.at)){
  const active=accepted.filter(item=>item.at+cueDuration(item)>cue.at);
  if(active.length<3){accepted.push(cue);continue;}
  const selected=[...active,cue].sort(cueStrengthOrder).slice(0,3);
  for(const item of active)if(!selected.includes(item))accepted.splice(accepted.indexOf(item),1);
  if(selected.includes(cue))accepted.push(cue);
 }
 kept=accepted;

 // Limit the overall average to about 2.5 SFX cues per second.
 const densityLimit=Math.max(1,Math.floor(duration*2.5));
 if(kept.length>densityLimit)kept=kept.sort(cueStrengthOrder).slice(0,densityLimit).sort((a,b)=>a.at-b.at);

 const stats={before:original.length,after:kept.length,maxOverlap:maxCueOverlap(kept),densityPerSecond:duration?kept.length/duration:0};
 const clean=kept.map(cue=>{const {_class,_sceneIndex,_localAt,...result}=cue;return result;});
 return {cues:clean,stats};
}

/** Stretches scenes to their narration, moves hits with them, and lists every sound cue on the timeline. */
export function arrange(spec,spoken,defs=sceneDefs){
 sceneDefs=defs;
 const scenes=spec.scenes.map((scene,index)=>{
  const voice=spoken[index];
  if(!voice)return {...scene};
  const needed=Math.ceil((LEAD+voice.words.at(-1).end+TAIL)*FPS)/FPS;
  // The final scene keeps at least its authored length: the payoff needs a hold after the last word.
  const duration=Math.min(8,Math.max(1.2,needed,index===spec.scenes.length-1?scene.duration:0));
  const {say:_say,caption:_caption,...rest}=scene;
  // Hits keep their relative position in the scene.
  const events=scene.sync?.flatMap(cue=>{const match=voice.words.find(w=>w.text.toLowerCase().replace(/[^a-z0-9]/g,'').includes(cue.word.toLowerCase()));return match?[{kind:cue.kind,at:LEAD+match.start}]:[]});
  return {...rest,duration,...(events?{events}:{}),...(scene.hits?{hits:scene.hits.map(hit=>Math.round(Math.min(duration-0.05,hit*duration/scene.duration)*100)/100)}:{})};
 });
 const timed={...spec,scenes};
 const placed=placeScenes(timed),captions=[],cues=[];
 placed.forEach((scene,index)=>{
  const voice=spoken[index];
  if(voice){
   cues.push({file:voice.audio,at:scene.start+LEAD,gain:1});
   captions.push(...captionsFromSpeech(spec.scenes[index].say,voice.words,scene.start+LEAD,scene.end));
  }
  const length=scene.end-scene.start;
  const transition=scene.spec.transitionSound==='none'?null:scene.spec.transitionSound;
  if(index>0&&scene.spec.transitionSound!==undefined&&transition)cues.push({sfx:transition,at:Math.max(0,scene.start-0.1),_class:'transition',_sceneIndex:index});
  else if(index>0&&scene.spec.transitionSound===undefined&&scene.spec.transition)cues.push(...transitionCues(scene.spec.transition,scene.spec.transitionDir).map(cue=>({sfx:cue.kind,at:Math.max(0,scene.start+cue.t),...(cue.len?{length:cue.len}:{}),...(cue.gain===undefined?{}:{gain:cue.gain}),...(cue.pan===undefined?{}:{pan:cue.pan}),_class:'transition',_sceneIndex:index})));
  for(const hit of scene.spec.hits??[])cues.push({sfx:'impact',at:scene.start+hit,_class:'story',_sceneIndex:index,_localAt:hit});
  const ownStart=cues.length;
  const own=sceneCues(scene.spec,length);
  if(own){
   for(const cue of own){
    if(!(cue.t>=0)||cue.t>=length||!SFX[cue.kind])continue;
    const mix={...(cue.pan===undefined?{}:{pan:cue.pan}),...(cue.gain===undefined?{}:{gain:cue.gain}),...(cue.step===undefined?{}:{step:cue.step})};
    if(cue.kind==='rise'){const len=Math.min(8,Math.max(0.2,cue.len??0.5),length-cue.t);cues.push({sfx:'rise',at:Math.max(0,scene.start+cue.t+(cue.len??len)-len),length:len,fadeIn:len*0.2,...mix});}
    else if(cue.kind==='type')cues.push({sfx:'type',at:scene.start+cue.t,length:Math.min(8,Math.max(0.2,cue.len??0.6),length-cue.t),...mix});
    else if(cue.kind==='pop')cues.push({sfx:'pop',at:scene.start+cue.t,semitones:SCALE[Math.round(Math.min(1,Math.max(0,cue.step??0))*(SCALE.length-1))],...mix});
    else if(cue.kind==='tick')cues.push({sfx:'tick',at:scene.start+cue.t,semitones:Math.round((cue.step??0)*7),...mix});
    else cues.push({sfx:cue.kind,at:scene.start+cue.t,...(cue.len?{length:cue.len}:{}),...mix});
   }
  }else{
   const bed=SCENE_BED[scene.spec.type];
   if(bed)cues.push({sfx:bed,at:scene.start+0.15,length:Math.min(SFX[bed].seconds,length*0.6)});
   if(scene.spec.type==='list')scene.spec.items.forEach((_item,item,all)=>cues.push({sfx:'pop',at:scene.start+0.1+item*length*0.65/all.length,semitones:SCALE[item]??0}));
   if(scene.spec.type==='kinetic')scene.spec.words.forEach((_word,beat,all)=>{if(beat>0)cues.push({sfx:'pop',at:scene.start+beat*length/all.length,semitones:SCALE[beat]??0});});
   if(scene.spec.type==='outro')cues.push({sfx:'shimmer',at:scene.start+0.25});
  }
  for(const cue of cues.slice(ownStart))if(cue.sfx){cue._class=cue.sfx==='drop'?'story':'secondary';cue._sceneIndex=index;cue._localAt=cue.at-scene.start;}
  if(scene.spec.shot==='squeezerocket'){
   const squeeze=scene.spec.events?.find(event=>event.kind.toLowerCase()==='squeeze')?.at??length*0.76;
   const loop=scene.spec.events?.find(event=>event.kind.toLowerCase()==='loop')?.at??length*0.34;
   const dropAt=Math.max(0,squeeze-0.3),localCues=cues.slice(ownStart);
   const arrival=localCues.find(cue=>cue.sfx==='whoosh');
   if(arrival){arrival.at=scene.start+Math.min(length-0.05,0.28);arrival.length=0.32;arrival.gain=Math.max(0.66,arrival.gain??0);arrival._class='secondary';arrival._localAt=arrival.at-scene.start;}
   else cues.push({sfx:'whoosh',at:scene.start+Math.min(length-0.05,0.28),length:0.32,gain:0.66,pan:-0.22,_class:'secondary',_sceneIndex:index,_localAt:Math.min(length-0.05,0.28)});
   const dropCue=localCues.find(cue=>cue.sfx==='drop')??localCues.filter(cue=>cue.sfx==='bass').sort((a,b)=>Math.abs((a.at-scene.start)-dropAt)-Math.abs((b.at-scene.start)-dropAt))[0];
   if(dropCue&&(dropCue.sfx==='drop'||Math.abs((dropCue.at-scene.start)-dropAt)<=0.08)){
    dropCue.sfx='drop';dropCue.at=scene.start+dropAt;dropCue.length=0.5;dropCue.gain=Math.max(1,dropCue.gain??0);dropCue._class='story';dropCue._localAt=dropAt;
   }else cues.push({sfx:'drop',at:scene.start+dropAt,length:0.5,gain:1,_class:'story',_sceneIndex:index,_localAt:dropAt});
   const span=Math.max(0.12,squeeze-loop),servoTimes=[0.2,0.5,0.8].map(fraction=>loop+span*fraction);
   const servos=localCues.filter(cue=>cue.sfx==='servo');
   for(const [n,at] of servoTimes.entries())if(servos.length<3&&!servos.some(cue=>Math.abs(cue.at-(scene.start+at))<0.08)){
    const servo={sfx:'servo',at:scene.start+at,length:0.28,gain:0.7,pan:(n-1)*0.34,_class:'story',_sceneIndex:index,_localAt:at};
    cues.push(servo);servos.push(servo);
   }
  }
 });
 // Promote one strongest effect at each narration event, plus a scene's first cue when it lands on frame one.
 placed.forEach((scene,index)=>{
  for(const event of scene.spec.events??[]){
   const matches=cues.filter(cue=>cue.sfx&&cue._sceneIndex===index&&cue._localAt!==undefined&&Math.abs(cue._localAt-event.at)<=0.04);
   const primary=matches.sort((a,b)=>cueLevel(b)-cueLevel(a))[0];
   if(primary)primary._class='story';
  }
  const first=cues.filter(cue=>cue.sfx&&cue._sceneIndex===index&&cue._localAt!==undefined&&cue._localAt>=-0.001&&cue._localAt<=0.04&&cue._class==='secondary').sort((a,b)=>cueLevel(b)-cueLevel(a))[0];
  if(first)first._class='story';
  if(scene.spec.shot==='squeezerocket')for(const cue of cues){
   if(cue._sceneIndex!==index)continue;
   if(cue.sfx==='servo')cue._class='story';
   if(cue.sfx==='build')cue._class='secondary';
  }
 });
 // A warm two-note button begins 0.9 s before the reel ends and decays with a 0.5 s tail.
 const reelEnd=placed.at(-1)?.end??0;
 if(reelEnd>0.9)cues.push({sfx:'ding',at:reelEnd-0.9,length:0.5,gain:2.9,pan:0,step:0.68,ending:true,_class:'story'});
 const governed=governCues(cues,reelEnd,placed),voiceCues=cues.filter(cue=>!cue.sfx);
 cues.length=0;cues.push(...voiceCues,...governed.cues);cues.sort((a,b)=>a.at-b.at);
 if(captions.length)timed.captions=captions;
 return {spec:timed,cues,duration:reelEnd,cueStats:governed.stats};
}

function run(binary,args){
 return new Promise((resolve,reject)=>{
  const child=spawn(binary,args,{stdio:['ignore','inherit','pipe']});let errors='';
  child.stderr.on('data',chunk=>{errors=(errors+chunk).slice(-2000);});
  child.once('error',reject);child.once('close',code=>code===0?resolve():reject(new Error(`${binary} exited with ${code}: ${errors}`)));
 });
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const [specPath,outPath]=process.argv.slice(2);
 if(!specPath||!outPath)throw new Error('Usage: node --env-file=.env.motion scripts/motion-audio.mjs <spec.json> <out.mp4>');
 const key=process.env.ELEVENLABS_API_KEY?.trim();
 if(!key)throw new Error('Set ELEVENLABS_API_KEY (for example in chatgpt-site/.env.motion)');
 const parsed=parseReelSpec(JSON.parse(await readFile(specPath,'utf8')));
 if(!parsed.ok)throw new Error(`Invalid reel spec:\n${parsed.errors.join('\n')}`);
 await mkdir(CACHE,{recursive:true});

 if(parsed.spec.series?.startsWith('HEDGY')&&!process.env.MOTION_VOICE_SPEED)process.env.MOTION_VOICE_SPEED='1.2';
 const voice=pickVoice();
 const spoken=[];
 for(const scene of parsed.spec.scenes)spoken.push(scene.say?await speak(stripMarkup(scene.say),voice,key):null);
 // Scene modules are loaded lazily: they are browser drawing code, but their cue lists are plain maths.
 const defs=await import('../src/motion/scenes/index.ts').then(module=>module.SCENES,()=>null);
 const {spec,cues,duration,cueStats}=arrange(parsed.spec,spoken,defs);
 const unmapped=CUE_KINDS.filter(kind=>!SFX[kind]);
 if(unmapped.length)throw new Error(`Missing sound designs for CueKind: ${unmapped.join(', ')}`);
 const mood=process.env.MOTION_MUSIC?.trim()||parsed.spec.music||'drive';
 const files=new Map();
 const occurrences=new Map();
 for(const cue of cues){
  if(!cue.sfx)continue;
  const design=SFX[cue.sfx],occurrence=occurrences.get(cue.sfx)??0;
  cue.variant=occurrence%design.variants;
  occurrences.set(cue.sfx,occurrence+1);
  cue.mixLength=Math.max(0.08,Math.min(8,Number(cue.length)||design.seconds));
  cue.assetKey=`${cue.sfx}:${cue.variant}:${cue.mixLength.toFixed(3)}`;
  if(!files.has(cue.assetKey))files.set(cue.assetKey,await effect(cue.sfx,key,cue.variant,cue.mixLength));
 }
 const bed=mood==='none'||mood==='off'?null:await music(mood,duration,key);
 if(parsed.spec.title==='The ticket that took off'){
  // Cache both authored prompt variants for the five upgraded story-foley kinds.
  for(const [kind,design] of Object.entries(SFX))if(design.prompts?.length){
   for(let variant=0;variant<design.prompts.length;variant++)await effect(kind,key,variant,design.seconds);
  }
 }

 const work=join(CACHE,`render-${hash({spec,cues,mood})}`);
 await mkdir(work,{recursive:true});
 const timedSpec=join(work,'spec.json'),renderSpec=join(work,'render-spec.json'),silent=join(work,'video.mp4'),mix=join(work,'mix.m4a'),graph=join(work,'mix.filter'),stems=join(work,'stems.mka');
 const exportStems=process.env.MOTION_AUDIO_STEMS==='1';
 const bpm=MUSIC_BPM[mood]??null,beatInterval=bpm?60/bpm:null;
 const audioTiming={bpm,beatInterval,beats:beatInterval?Array.from({length:Math.ceil(duration/beatInterval)},(_,i)=>Number((i*beatInterval).toFixed(3))):[]};
 await writeFile(timedSpec,JSON.stringify({...spec,audioTiming},null,1));
 await writeFile(renderSpec,JSON.stringify(spec,null,1));
 try{
  await run(process.execPath,[join(ROOT,'scripts/motion.mjs'),'render',renderSpec,silent]);
  // Three buses keep the voice clear, tactile effects present and music tucked underneath.
  const inputs=[],filters=[],voice=[],fx=[];
  cues.forEach((cue,index)=>{
   inputs.push('-i',cue.file??files.get(cue.assetKey));
   const kind=cue.sfx,design=kind?SFX[kind]:null;
   const gain=cue.file?(cue.gain??1):design.gain*(cue.gain??1)*(0.98+0.02*((index*7919)%5)/5);
   const pan=cue.file?0:Math.max(-1,Math.min(1,cue.pan??[-0.22,0,0.22][index%3]));
   const requestedPitch=cue.semitones??(cue.step===undefined?0:Math.round((cue.step-0.5)*4));
   const semitones=cue.file?0:requestedPitch+variantPitch(kind,cue.variant??0);
   const pitch=semitones?`asetrate=${Math.round(48000*2**(semitones/12))},aresample=48000,`:'';
   const length=cue.file?null:cue.mixLength;
   const tail=length?Math.min(design?.tail??0.08,length*0.95):0;
   const trim=length?`atrim=0:${length.toFixed(3)},apad=whole_dur=${length.toFixed(3)},atrim=0:${length.toFixed(3)},${cue.fadeIn?`afade=t=in:st=0:d=${Math.min(cue.fadeIn,length/2).toFixed(3)},`:''}afade=t=out:st=${Math.max(0,length-tail).toFixed(3)}:d=${tail.toFixed(3)},`:'';
   const room=design?.room?'aecho=0.72:0.26:38|67:0.09|0.055,':'';
   const filtering=cue.file?'':`highpass=f=28,lowpass=f=9200,${room}stereotools=balance_out=${pan.toFixed(3)},`;
   const ms=Math.round(cue.at*1000);
   filters.push(`[${index}:a]aresample=48000,aformat=channel_layouts=stereo,${pitch}${trim}${filtering}volume=${gain.toFixed(3)},adelay=${ms}:all=1[a${index}]`);
   (cue.file?voice:fx).push(`[a${index}]`);
  });
  const total=duration.toFixed(3),pad=`apad=whole_dur=${total},atrim=0:${total}`;
  const sum=(labels,out)=>labels.length?`${labels.join('')}amix=inputs=${labels.length}:normalize=0:dropout_transition=0,${pad}[${out}]`:`anullsrc=channel_layout=stereo:sample_rate=48000,atrim=0:${total}[${out}]`;
  filters.push(sum(voice,'voice_raw'),sum(fx,'fx_raw'));
  filters.push('[voice_raw]highpass=f=72,equalizer=f=240:t=q:w=1.2:g=-1.5,equalizer=f=3300:t=q:w=1:g=1.1,deesser=i=0.14:m=0.3:f=0.56,acompressor=threshold=0.13:ratio=2.3:attack=12:release=140:makeup=1.35[voice]');
  filters.push('[fx_raw]acompressor=threshold=0.24:ratio=1.65:attack=6:release=130:makeup=1,extrastereo=m=1.08,volume=0.86[fx]');
  const buses=[];
  if(bed){
   inputs.push('-i',bed);
   const drops=cues.filter(cue=>cue.sfx==='drop').map(cue=>[Math.max(0,cue.at+0.05),Math.min(duration,cue.at+0.3)]).filter(([start,end])=>end>start);
   const musicCut=drops.length?`volume='if(${drops.map(([start,end])=>`between(t,${start.toFixed(3)},${end.toFixed(3)})`).join('+')},0.251189,1)':eval=frame,`:'';
   filters.push(`[${cues.length}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${total},loudnorm=I=-20:TP=-1:LRA=11,${musicCut}volume=0.4,afade=t=out:st=${Math.max(0,duration-0.82).toFixed(3)}:d=0.82,extrastereo=m=1.07,${pad}[bed]`);
   filters.push('[voice]asplit=3[say][keyMusic][keyFx]','[bed][keyMusic]sidechaincompress=threshold=0.05:ratio=3:attack=12:release=200:makeup=1.2[ducked]','[fx][keyFx]sidechaincompress=threshold=0.12:ratio=1.7:attack=5:release=110:makeup=1[fxduck]');
   if(exportStems){filters.push('[say]asplit=2[sayMix][voiceStem]','[fxduck]asplit=2[fxMix][fxStem]','[ducked]asplit=2[musicMix][musicStem]');buses.push('[fxMix]','[sayMix]','[musicMix]');}
   else buses.push('[fxduck]','[say]','[ducked]');
  }else{
   filters.push('[voice]asplit=2[say][keyFx]','[fx][keyFx]sidechaincompress=threshold=0.12:ratio=1.7:attack=5:release=110:makeup=1[fxduck]');
   if(exportStems){filters.push('[say]asplit=2[sayMix][voiceStem]','[fxduck]asplit=2[fxMix][fxStem]');buses.push('[fxMix]','[sayMix]');}
   else buses.push('[fxduck]','[say]');
  }
  filters.push(`${buses.join('')}amix=inputs=${buses.length}:normalize=0:dropout_transition=0,${pad},acompressor=threshold=0.42:ratio=2:attack=4:release=100:makeup=1,alimiter=limit=0.891:attack=5:release=80:level=disabled,loudnorm=I=-14:TP=-1.1:LRA=8[out]`);
  await writeFile(graph,filters.join(';\n'));
  const mixArgs=['-hide_banner','-loglevel','error','-y',...inputs,'-filter_complex_script',graph,'-map','[out]','-c:a','aac','-b:a','192k','-ar','48000',mix];
  if(exportStems)mixArgs.push('-map','[voiceStem]','-map','[fxStem]',...(bed?['-map','[musicStem]']:[]),'-c:a','pcm_s16le','-ar','48000','-f','matroska',stems);
  await run('ffmpeg',mixArgs);
  await run('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',silent,'-i',mix,'-map','0:v','-map','1:a:0','-c:v','copy','-c:a','copy','-t',duration.toFixed(3),'-movflags','+faststart',outPath]);
 }finally{await rm(silent,{force:true});await rm(mix,{force:true});await rm(graph,{force:true});}
 console.log(`Wrote ${outPath} (${duration.toFixed(1)} s, ${spoken.filter(Boolean).length} narrated scenes, ${cueStats.after} SFX cues, max overlap ${cueStats.maxOverlap}, ${cueStats.densityPerSecond.toFixed(2)} cues/s, music: ${bed?mood:'none'}). Timed spec: ${timedSpec}${exportStems?`, stems: ${stems}`:''}`);
}
