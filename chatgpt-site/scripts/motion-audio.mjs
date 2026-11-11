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
import {mkdir,readFile,writeFile,access,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseReelSpec} from '../src/motion/spec.ts';
import {FPS,markupWords,placeScenes,stripMarkup} from '../src/motion/core.ts';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const CACHE=join(ROOT,'.motion-cache');
const API='https://api.elevenlabs.io';
const LEAD=0.12;   // silence before the voice in each scene, so a cut never clips a word
const TAIL=0.32;   // breath after the last word before the next cut

/**
 * Sound design: soft, tonal and tightly synced, like a premium motion-design ad.
 * Every element that appears gets its own small sound; nothing is harsh. Prompts
 * are generated once and cached; `gain` is the level under the voice.
 */
export const SFX={
 pop:{prompt:'Single soft tonal UI pop, one short warm marimba pluck note, clean and dry, no reverb, no tail',seconds:0.5,gain:0.5},
 tick:{prompt:'Single tiny delicate click tick, very short, dry, soft high pitched wooden tap',seconds:0.5,gain:0.26},
 type:{prompt:'Soft fast keyboard typing, gentle muted key taps, close and dry, continuous',seconds:2.5,gain:0.2},
 rise:{prompt:'Smooth airy riser whoosh building up, soft breathy air swell, clean, ends abruptly',seconds:1.0,gain:0.34},
 shimmer:{prompt:'Bright magical shimmer chime sparkle, glassy high bells glittering, short, clean, elegant',seconds:1.2,gain:0.42},
 impact:{prompt:'Soft deep sub bass thump impact, round and warm, short, clean, no distortion',seconds:0.7,gain:0.7},
 swish:{prompt:'Quick soft airy whoosh swish pass-by, light and clean, no reverb tail',seconds:0.5,gain:0.36},
 glitch:{prompt:'Short soft digital glitch stutter, subtle data blip burst, clean',seconds:0.5,gain:0.3},
};
/** Pops climb a pentatonic scale through a sequence, so a build sounds like it is going somewhere. */
const SCALE=[0,2,4,7,9,12,14,16];
const TRANSITION_SFX={blocks:'swish',wipe:'swish',zoom:'swish',shutter:'swish',glitch:'glitch',flash:'shimmer'};
/** Used only for scenes that do not report their own cues. */
const SCENE_BED={code:'type',diff:'type',terminal:'type',chat:'type'};

/** Music beds. Instrumental, minimal, mixed low and ducked under the voice. */
export const MUSIC={
 drive:'Instrumental only. Modern upbeat tech explainer background track for a short vertical video: punchy tight drums, deep clean sub bass, plucky bright synth arpeggio, light chiptune 8-bit texture, confident and driving, 118 BPM, minimal and uncluttered so a voice-over sits on top, starts immediately at full energy, no vocals.',
 chill:'Instrumental only. Warm lo-fi electronic background track for a short tech explainer: soft drums, mellow electric piano chords, gentle sub bass, subtle 8-bit bleeps, relaxed and curious, 92 BPM, minimal so a voice-over sits on top, starts immediately, no vocals.',
 tense:'Instrumental only. Dark pulsing electronic background track for a short tech explainer: tight ticking percussion, low synth pulse, sparse suspenseful plucks, building tension, 110 BPM, minimal so a voice-over sits on top, starts immediately, no vocals.',
 bright:'Instrumental only. Bright playful electronic pop background track for a short tech explainer: bouncy drums, glassy bell melody, warm bass, sparkling chiptune arpeggios, optimistic and fun, 124 BPM, minimal so a voice-over sits on top, starts immediately, no vocals.',
};

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,20);
const exists=path=>access(path).then(()=>true,()=>false);

async function eleven(path,body,key){
 const response=await fetch(`${API}${path}`,{method:body?'POST':'GET',headers:{'xi-api-key':key,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(120000)});
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
 const settings={stability:0.4,similarity_boost:0.75,style:0.35,use_speaker_boost:true,speed:1.12};
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
 return {audio,words:JSON.parse(await readFile(meta,'utf8')).words};
}

async function effect(name,key){
 const {prompt,seconds}=SFX[name],id=hash({prompt,seconds}),raw=join(CACHE,`sfx-${name}-${id}.mp3`),file=join(CACHE,`sfx-${name}-${id}.wav`);
 if(!(await exists(file))){
  if(!(await exists(raw))){
   const response=await eleven('/v1/sound-generation?output_format=mp3_44100_128',{text:prompt,duration_seconds:seconds,prompt_influence:0.6},key);
   await writeFile(raw,Buffer.from(await response.arrayBuffer()));
  }
  // Leading silence is cut so the sound starts exactly on its cue.
  await run('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',raw,'-af','silenceremove=start_periods=1:start_threshold=-42dB:start_silence=0.005,aresample=48000,aformat=channel_layouts=stereo',file]);
 }
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

/** Short caption beats that follow the voice: at most three words, broken at punctuation. Less on screen, easier to read. */
export function captionsFromSpeech(say,words,offset,sceneEnd){
 const marked=markupWords(say),groups=[];let group=[];
 words.forEach((word,index)=>{
  const text=marked[index]?.accent?`*${word.text}*`:word.text;
  group.push({...word,text});
  const length=group.reduce((sum,item)=>sum+item.text.replaceAll('*','').length+1,0);
  if(group.length>=3||length>=16||/[.!?,;:]$/.test(word.text)){groups.push(group);group=[];}
 });
 if(group.length)groups.push(group);
 return groups.map((items,index)=>{
  const next=groups[index+1]?.[0];
  const start=offset+items[0].start,end=Math.min(sceneEnd,next?offset+next.start:offset+items.at(-1).end+0.3);
  // Adjacent accent words merge into one span so the renderer sees a single marked phrase.
  return {text:items.map(item=>item.text).join(' ').replaceAll('* *',' ').replace(/[,;:]$/,''),start:Math.round(start*1000)/1000,end:Math.round(end*1000)/1000};
 }).filter(caption=>caption.end-caption.start>0.05);
}

let sceneDefs=null;
/** A scene's own sound moments, or null when it does not report any. */
function sceneCues(scene,duration){
 try{const list=sceneDefs?.[scene.type]?.cues?.(scene,duration);return Array.isArray(list)&&list.length?list.slice(0,60):null;}catch{return null;}
}

/** Stretches scenes to their narration, moves hits with them, and lists every sound cue on the timeline. */
export function arrange(spec,spoken,defs=sceneDefs){
 sceneDefs=defs;
 const scenes=spec.scenes.map((scene,index)=>{
  const voice=spoken[index];
  if(!voice)return {...scene};
  const needed=Math.ceil((LEAD+voice.words.at(-1).end+TAIL)*FPS)/FPS;
  const duration=Math.min(8,Math.max(1.2,needed));
  const {say:_say,caption:_caption,...rest}=scene;
  // Hits keep their relative position in the scene.
  return {...rest,duration,...(scene.hits?{hits:scene.hits.map(hit=>Math.round(Math.min(duration-0.05,hit*duration/scene.duration)*100)/100)}:{})};
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
  const transition=TRANSITION_SFX[scene.spec.transition];
  if(index>0&&transition)cues.push({sfx:transition,at:Math.max(0,scene.start-0.1)});
  for(const hit of scene.spec.hits??[])cues.push({sfx:'impact',at:scene.start+hit});
  const own=sceneCues(scene.spec,length);
  if(own){
   for(const cue of own){
    if(!(cue.t>=0)||cue.t>=length||!SFX[cue.kind])continue;
    if(cue.kind==='rise'){const len=Math.min(SFX.rise.seconds,Math.max(0.2,cue.len??0.5));cues.push({sfx:'rise',at:Math.max(0,scene.start+cue.t+(cue.len??len)-len),length:len,fadeIn:len*0.6});}
    else if(cue.kind==='type')cues.push({sfx:'type',at:scene.start+cue.t,length:Math.min(SFX.type.seconds,Math.max(0.2,cue.len??0.6),length-cue.t)});
    else if(cue.kind==='pop')cues.push({sfx:'pop',at:scene.start+cue.t,semitones:SCALE[Math.round(Math.min(1,Math.max(0,cue.step??0))*(SCALE.length-1))]});
    else if(cue.kind==='tick')cues.push({sfx:'tick',at:scene.start+cue.t,semitones:Math.round((cue.step??0)*7)});
    else cues.push({sfx:cue.kind,at:scene.start+cue.t});
   }
  }else{
   const bed=SCENE_BED[scene.spec.type];
   if(bed)cues.push({sfx:bed,at:scene.start+0.15,length:Math.min(SFX[bed].seconds,length*0.6)});
   if(scene.spec.type==='list')scene.spec.items.forEach((_item,item,all)=>cues.push({sfx:'pop',at:scene.start+0.1+item*length*0.65/all.length,semitones:SCALE[item]??0}));
   if(scene.spec.type==='kinetic')scene.spec.words.forEach((_word,beat,all)=>{if(beat>0)cues.push({sfx:'pop',at:scene.start+beat*length/all.length,semitones:SCALE[beat]??0});});
   if(scene.spec.type==='outro')cues.push({sfx:'shimmer',at:scene.start+0.25});
  }
 });
 // Two identical sounds within 45 ms read as one louder, phasey sound: keep the first.
 const seen=new Map();
 const kept=[];
 for(const cue of [...cues].sort((a,b)=>a.at-b.at)){
  if(cue.sfx){const last=seen.get(cue.sfx);if(last!==undefined&&cue.at-last<0.045)continue;seen.set(cue.sfx,cue.at);}
  kept.push(cue);
 }
 cues.length=0;cues.push(...kept);
 if(captions.length)timed.captions=captions;
 return {spec:timed,cues,duration:placed.at(-1).end};
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

 const voice=pickVoice();
 const spoken=[];
 for(const scene of parsed.spec.scenes)spoken.push(scene.say?await speak(stripMarkup(scene.say),voice,key):null);
 // Scene modules are loaded lazily: they are browser drawing code, but their cue lists are plain maths.
 const defs=await import('../src/motion/scenes/index.ts').then(module=>module.SCENES,()=>null);
 const {spec,cues,duration}=arrange(parsed.spec,spoken,defs);
 const files=new Map();
 for(const name of new Set(cues.map(cue=>cue.sfx).filter(Boolean)))files.set(name,await effect(name,key));
 const mood=process.env.MOTION_MUSIC?.trim()||parsed.spec.music||'drive';
 const bed=mood==='none'||mood==='off'?null:await music(mood,duration,key);

 const work=join(CACHE,`render-${hash({spec,cues,mood})}`);
 await mkdir(work,{recursive:true});
 const timedSpec=join(work,'spec.json'),silent=join(work,'video.mp4'),mix=join(work,'mix.m4a'),graph=join(work,'mix.filter');
 await writeFile(timedSpec,JSON.stringify(spec,null,1));
 try{
  await run(process.execPath,[join(ROOT,'scripts/motion.mjs'),'render',timedSpec,silent]);
  // Three buses: voice, effects, music. The music ducks whenever the voice speaks; the sum is levelled for phone speakers.
  const inputs=[],filters=[],voice=[],fx=[];
  cues.forEach((cue,index)=>{
   inputs.push('-i',cue.file??files.get(cue.sfx));
   // Small level differences keep repeated sounds from feeling machine-made.
   const gain=(cue.gain??SFX[cue.sfx].gain)*(cue.sfx?0.85+0.15*((index*7919)%10)/10:1),ms=Math.round(cue.at*1000);
   const pitch=cue.semitones?`asetrate=${Math.round(48000*2**(cue.semitones/12))},aresample=48000,`:'';
   const trim=cue.length?`atrim=0:${cue.length.toFixed(3)},${cue.fadeIn?`afade=t=in:st=0:d=${cue.fadeIn.toFixed(3)},`:''}afade=t=out:st=${Math.max(0,cue.length-0.08).toFixed(3)}:d=0.08,`:'';
   filters.push(`[${index}:a]aresample=48000,aformat=channel_layouts=stereo,${pitch}${trim}volume=${gain.toFixed(3)},adelay=${ms}:all=1[a${index}]`);
   (cue.file?voice:fx).push(`[a${index}]`);
  });
  const total=duration.toFixed(3),pad=`apad=whole_dur=${total},atrim=0:${total}`;
  const sum=(labels,out)=>labels.length?`${labels.join('')}amix=inputs=${labels.length}:normalize=0:dropout_transition=0,${pad}[${out}]`:`anullsrc=channel_layout=stereo:sample_rate=48000,atrim=0:${total}[${out}]`;
  filters.push(sum(voice,'voice'),sum(fx,'fx'));
  const buses=['[fx]'];
  if(bed){
   inputs.push('-i',bed);
   filters.push(`[${cues.length}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${total},afade=t=in:st=0:d=0.25,afade=t=out:st=${Math.max(0,duration-1.4).toFixed(3)}:d=1.4,volume=0.3,${pad}[bed]`);
   filters.push('[voice]asplit=2[say][key]','[bed][key]sidechaincompress=threshold=0.02:ratio=5:attack=15:release=320:makeup=1[ducked]');
   buses.push('[say]','[ducked]');
  }else buses.push('[voice]');
  filters.push(`${buses.join('')}amix=inputs=${buses.length}:normalize=0:dropout_transition=0,loudnorm=I=-15:TP=-2:LRA=11,alimiter=limit=0.84:level=disabled[out]`);
  await writeFile(graph,filters.join(';\n'));
  await run('ffmpeg',['-hide_banner','-loglevel','error','-y',...inputs,'-filter_complex_script',graph,'-map','[out]','-c:a','aac','-b:a','192k','-ar','48000',mix]);
  await run('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',silent,'-i',mix,'-map','0:v','-map','1:a','-c:v','copy','-c:a','copy','-t',duration.toFixed(3),'-movflags','+faststart',outPath]);
 }finally{await rm(silent,{force:true});await rm(mix,{force:true});await rm(graph,{force:true});}
 console.log(`Wrote ${outPath} (${duration.toFixed(1)} s, ${spoken.filter(Boolean).length} narrated scenes, ${cues.length} sound cues, music: ${bed?mood:'none'}). Timed spec: ${timedSpec}`);
}
