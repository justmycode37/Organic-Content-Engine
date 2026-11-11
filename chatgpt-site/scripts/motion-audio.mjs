// Renders a code-animated Reel WITH sound: ElevenLabs narration, captions that
// follow the voice, and sound effects placed on transitions, hits and typing.
//
//   node --env-file=.env.motion scripts/motion-audio.mjs <spec.json> <out.mp4>
//
// Needs ELEVENLABS_API_KEY (text to speech + sound effects). Optional:
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

/** Sound design. Prompts are generated once and cached; `gain` is the level under the voice. */
export const SFX={
 whoosh:{prompt:'Short fast cinematic whoosh swish transition, clean, no reverb tail',seconds:0.6,gain:0.5},
 glitch:{prompt:'Short digital glitch stutter, data corruption burst, crisp',seconds:0.6,gain:0.45},
 blocks:{prompt:'Quick retro 8-bit pixel blips cascading, arcade interface transition',seconds:0.6,gain:0.4},
 flash:{prompt:'Camera flash pop with a short bright synth stab',seconds:0.5,gain:0.45},
 hit:{prompt:'Deep punchy cinematic impact hit with tight sub bass, very short',seconds:0.7,gain:0.75},
 type:{prompt:'Fast mechanical keyboard typing, close and dry, continuous',seconds:2.5,gain:0.3},
 tick:{prompt:'Rapid digital counter ticking up, soft retro computer beeps',seconds:1.5,gain:0.3},
 pop:{prompt:'Single soft UI pop click, bubbly, very short',seconds:0.5,gain:0.45},
 sting:{prompt:'Short retro 8-bit success jingle, three rising notes, confident ending',seconds:1.6,gain:0.5},
};
const TRANSITION_SFX={blocks:'blocks',wipe:'whoosh',zoom:'whoosh',shutter:'whoosh',glitch:'glitch',flash:'flash'};
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
 const {prompt,seconds}=SFX[name],file=join(CACHE,`sfx-${name}-${hash({prompt,seconds})}.mp3`);
 if(!(await exists(file))){
  const response=await eleven('/v1/sound-generation?output_format=mp3_44100_128',{text:prompt,duration_seconds:seconds,prompt_influence:0.6},key);
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

/** Stretches scenes to their narration, moves hits with them, and lists every sound cue on the timeline. */
export function arrange(spec,spoken){
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
  const transition=TRANSITION_SFX[scene.spec.transition];
  if(index>0&&transition)cues.push({sfx:transition,at:Math.max(0,scene.start-0.08)});
  for(const hit of scene.spec.hits??[])cues.push({sfx:'hit',at:scene.start+hit});
  const bed=SCENE_BED[scene.spec.type];
  // The bed covers the build (about the first 60% of the scene) and stops before the payoff.
  if(bed)cues.push({sfx:bed,at:scene.start+0.15,length:Math.min(SFX[bed].seconds,(scene.end-scene.start)*0.6)});
  if(scene.spec.type==='list')scene.spec.items.forEach((_item,item)=>cues.push({sfx:'pop',at:scene.start+0.1+item*(scene.end-scene.start)*0.65/scene.spec.items.length}));
  if(scene.spec.type==='kinetic')scene.spec.words.forEach((_word,beat)=>{if(beat>0)cues.push({sfx:'pop',at:scene.start+beat*(scene.end-scene.start)/scene.spec.words.length});});
  if(scene.spec.type==='outro')cues.push({sfx:'sting',at:scene.start+0.25});
 });
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
 const {spec,cues,duration}=arrange(parsed.spec,spoken);
 const files=new Map();
 for(const name of new Set(cues.map(cue=>cue.sfx).filter(Boolean)))files.set(name,await effect(name,key));

 const work=join(CACHE,`render-${hash({spec,cues})}`);
 await mkdir(work,{recursive:true});
 const timedSpec=join(work,'spec.json'),silent=join(work,'video.mp4'),mix=join(work,'mix.m4a');
 await writeFile(timedSpec,JSON.stringify(spec,null,1));
 try{
  await run(process.execPath,[join(ROOT,'scripts/motion.mjs'),'render',timedSpec,silent]);
  // Every cue is delayed to its place and summed; the result is levelled for phone speakers.
  const inputs=[],filters=[];
  cues.forEach((cue,index)=>{
   inputs.push('-i',cue.file??files.get(cue.sfx));
   const gain=cue.gain??SFX[cue.sfx].gain,ms=Math.round(cue.at*1000);
   const trim=cue.length?`atrim=0:${cue.length.toFixed(3)},afade=t=out:st=${Math.max(0,cue.length-0.15).toFixed(3)}:d=0.15,`:'';
   filters.push(`[${index}:a]${trim}aresample=48000,aformat=channel_layouts=stereo,volume=${gain},adelay=${ms}:all=1[a${index}]`);
  });
  filters.push(`${cues.map((_cue,index)=>`[a${index}]`).join('')}amix=inputs=${cues.length}:normalize=0:dropout_transition=0,apad=whole_dur=${duration.toFixed(3)},atrim=0:${duration.toFixed(3)},loudnorm=I=-15:TP=-1.5:LRA=11[out]`);
  await run('ffmpeg',['-hide_banner','-loglevel','error','-y',...inputs,'-filter_complex',filters.join(';'),'-map','[out]','-c:a','aac','-b:a','192k',mix]);
  await run('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',silent,'-i',mix,'-map','0:v','-map','1:a','-c:v','copy','-c:a','copy','-t',duration.toFixed(3),'-movflags','+faststart',outPath]);
 }finally{await rm(silent,{force:true});await rm(mix,{force:true});}
 console.log(`Wrote ${outPath} (${duration.toFixed(1)} s, ${spoken.filter(Boolean).length} narrated scenes, ${cues.length} sound cues). Timed spec: ${timedSpec}`);
}
