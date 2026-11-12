// Renders a code-animated Reel WITH sound: ElevenLabs narration, captions that
// follow the voice, a music bed that ducks under the voice, and soft sound
// effects locked to the picture (every scene reports its own sound moments).
//
//   node --env-file=.env.motion scripts/motion-audio.mjs <spec.json> <out.mp4>
//   MOTION_AUDIO_STEMS=1 exports <out>.stems.mka; MOTION_AUDIO_ONLY=1 skips video rendering.
//
// Needs ELEVENLABS_API_KEY (text to speech, sound effects, music). Optional:
// ELEVENLABS_VOICE_ID (default: Arthur), ELEVENLABS_MODEL. Every generated clip is cached in
// .motion-cache by content hash, so re-rendering an unchanged line costs nothing.
import {createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import {mkdir,readFile,writeFile,access,rm,appendFile,copyFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {transformSync} from 'esbuild';
import {parseReelSpec} from '../src/motion/spec.ts';
import {CUE_KINDS,FPS,markupWords,placeScenes,stripMarkup} from '../src/motion/core.ts';
import {transitionCues} from '../src/motion/fx/transitions.ts';
import {SFX,MUSIC_BPM,variantPitch,designFor,isTonalAccent,CINEMATIC_ACCENTS} from './audio/sfx-design.mjs';
import {synthesizeToFile} from './audio/synth.mjs';

export {SFX} from './audio/sfx-design.mjs';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const CACHE=join(ROOT,'.motion-cache');
const API='https://api.elevenlabs.io';
let sfxGenerationsThisRender=0,musicGenerationsThisRender=0;
const MAX_SFX_GENERATIONS=20;
let ACTIVE_STYLE='foley';
let LEAD=Number(process.env.MOTION_LEAD)||0.12;   // silence before the voice in each scene, so a cut never clips a word
let TAIL=Number(process.env.MOTION_TAIL)||0.32;   // breath after the last word before the next cut

/** Pops climb a pentatonic scale through a sequence, so a build sounds like it is going somewhere. */
const SCALE=[0,2,4,7,9,12,14,16];
/** Used only for scenes that do not report their own cues. */
const SCENE_BED={code:'type',diff:'type',terminal:'type',chat:'type'};
const FOLEY_FILL=process.env.MOTION_FOLEY_FILL!=='0';
const TRANSITION_FOLEY={
 cut:'whump',blocks:'clunk',wipe:'slide',glitch:'tape',zoom:'whump',flash:'thump',shutter:'clunk',
 push:'slide',whip:'swish',zoomthrough:'whump',shatter:'clunk',pixelsort:'slide',melt:'sub',iris:'creak',
 cube:'clunk',flip:'slide',dissolve:'whump',slice:'swish',ink:'rustle',match:'thump',
};
const PRIMARY_IMPACTS=new Set(['impact','thud','land','clack','stamp','clunk','drop','bass','footfall']);

function installCueImportEnvironment(){
 registerHooks({
  resolve(specifier,context,nextResolve){
   try{
    const resolved=nextResolve(specifier,context);
    return resolved.url.endsWith('.ts')?{...resolved,format:'module'}:resolved;
   }catch(error){
    if(!specifier.startsWith('.')||!context.parentURL?.endsWith('.ts'))throw error;
    for(const candidate of [`${specifier}.ts`,`${specifier}.tsx`,`${specifier}/index.ts`,`${specifier}/index.tsx`])try{return {...nextResolve(candidate,context),format:'module'};}catch{}
    throw error;
   }
  },
  load(url,context,nextLoad){
   if(new URL(url).pathname.endsWith('.ts'))return {format:'module',source:transformSync(readFileSync(fileURLToPath(url),'utf8'),{loader:'ts',format:'esm',target:'node22'}).code,shortCircuit:true};
   return nextLoad(url,context);
  },
 });
 if(typeof globalThis.OffscreenCanvas==='undefined'){
  class CueCanvas {
   constructor(width=1,height=1){this.width=width;this.height=height;}
   getContext(){
    const canvas=this;
    return new Proxy({canvas,imageSmoothingEnabled:false},{
     get(target,key){
      if(key in target)return target[key];
      if(key==='measureText')return ()=>({width:0,actualBoundingBoxAscent:0,actualBoundingBoxDescent:0});
      if(key==='getImageData'||key==='createImageData')return ()=>({data:new Uint8ClampedArray(4)});
      if(key==='createLinearGradient'||key==='createRadialGradient')return ()=>({addColorStop(){}});
      return ()=>undefined;
     },
     set(target,key,value){target[key]=value;return true;},
    });
   }
  }
  globalThis.OffscreenCanvas=CueCanvas;
  if(typeof globalThis.document==='undefined')globalThis.document={createElement:()=>new CueCanvas()};
 }
}

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

let CONTINUOUS=false;
/** Whole narration in one take, then one slice per scene cut at the midpoint of the pause between scenes. */
async function speakContinuous(lines,voice,key){
 const full=await speak(lines.join(' '),voice,key);
 const counts=lines.map(line=>line.split(/\s+/).filter(Boolean).length);
 if(counts.reduce((a,b)=>a+b,0)!==full.words.length)throw new Error(`Continuous narration: ${full.words.length} spoken words for ${counts.reduce((a,b)=>a+b,0)} written words`);
 const total=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',full.audio],{encoding:'utf8'}).trim())||full.words.at(-1).end+0.3;
 const bounds=[0];let index=0;
 for(let i=0;i<counts.length-1;i++){index+=counts[i];const before=full.words[index-1].end,after=full.words[index].start;bounds.push((before+after)/2);}
 bounds.push(Math.max(total,full.words.at(-1).end+0.05));
 const out=[];index=0;
 for(let i=0;i<counts.length;i++){
  const start=bounds[i],end=bounds[i+1],words=full.words.slice(index,index+counts[i]).map(w=>({...w,start:w.start-start,end:w.end-start}));index+=counts[i];
  const file=join(CACHE,`voice-slice-${hash({audio:full.audio,start,end})}.wav`);
  if(!await exists(file))await run('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',full.audio,'-af',`atrim=${start.toFixed(4)}:${end.toFixed(4)},asetpts=PTS-STARTPTS`,'-ar','48000','-ac','2',file]);
  out.push({audio:file,words,length:end-start});
 }
 return out;
}

/** One narration line: cached MP3 plus the time each word is spoken. */
async function speak(text,voice,key){
 const model=process.env.ELEVENLABS_MODEL??'eleven_multilingual_v2';
 const settings={stability:0.4,similarity_boost:0.75,style:0.35,use_speaker_boost:true,speed:Number(process.env.MOTION_VOICE_SPEED)||1.0};
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

async function effect(name,key,variant=0,requestedSeconds=undefined,noteHz=null,direction='down'){
 const design=designFor(name,ACTIVE_STYLE);
 if(!design)throw new Error(`No sound design registered for cue kind: ${name}`);
 const prompt=design.prompts?.[variant%design.prompts.length]??design.prompt;
 const seconds=Math.max(0.08,Math.min(name==='hum'?120:8,Number(requestedSeconds)||design.seconds));
 const cinematic=ACTIVE_STYLE==='cinematic';
 const id=hash({kind:name,source:design.source??'synth',prompt:prompt??null,promptSeconds:design.promptSeconds??null,variant,duration:Math.round(seconds*1000)/1000,revision:cinematic?7:5,...(cinematic?{style:ACTIVE_STYLE,noteHz:noteHz?Math.round(noteHz*100)/100:null,direction}: {})});
 const file=join(CACHE,`${design.source==='eleven'?'sfx':'synth'}-${cinematic?'cinematic-':''}${name}-${id}.wav`);
 if(await exists(file))return file;
 if(design.source==='eleven'){
  const rawId=hash({prompt,seconds:design.promptSeconds}),raw=join(CACHE,`sfx-${name}-${rawId}.mp3`);
  if(!(await exists(raw))){
   if(sfxGenerationsThisRender>=MAX_SFX_GENERATIONS)throw new Error(`SFX generation cap reached (${MAX_SFX_GENERATIONS}); use cached assets or reduce the Foley set`);
   sfxGenerationsThisRender++;
   const response=await eleven('/v1/sound-generation?output_format=mp3_44100_128',{text:prompt,duration_seconds:design.promptSeconds,prompt_influence:0.7},key);
   await writeFile(raw,Buffer.from(await response.arrayBuffer()));
  }
  const speed=atempoChain(design.promptSeconds/seconds);
  const tail=Math.min(design.tail??0.09,seconds*0.95),start=Math.max(0,seconds-tail);
  const filter=`silenceremove=start_periods=1:start_threshold=-46dB:start_silence=0.003,${speed},aresample=48000,aformat=channel_layouts=stereo,apad=whole_dur=${seconds.toFixed(3)},atrim=0:${seconds.toFixed(3)},afade=t=out:st=${start.toFixed(3)}:d=${tail.toFixed(3)}`;
  await run('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',raw,'-af',filter,'-c:a','pcm_s16le',file]);
 }else await synthesizeToFile(name,variant,seconds,file,cinematic?{style:'cinematic',pitchHz:noteHz,direction}:undefined);
 return file;
}

async function music(mood,seconds,key){
 const prompt=MUSIC[mood]??MUSIC.drive,length=Math.min(120,Math.max(10,Math.ceil((seconds+1.5)/5)*5));
 const file=join(CACHE,`music-${hash({prompt,length})}.mp3`);
 if(!(await exists(file))){
  if(musicGenerationsThisRender>=1)throw new Error('Music generation cap reached (1); use the cached music asset');
  musicGenerationsThisRender++;
  const response=await eleven('/v1/music?output_format=mp3_44100_128',{prompt,music_length_ms:length*1000,force_instrumental:true},key);
  await writeFile(file,Buffer.from(await response.arrayBuffer()));
 }
 return file;
}

const PITCH_CLASS=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const MAJOR_PROFILE=[6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
const MINOR_PROFILE=[6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];
const MUSIC_KEY_CACHE=new Map();

function fft(real,imag){
 const n=real.length;
 for(let i=1,j=0;i<n;i++){
  let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;
  if(i<j){[real[i],real[j]]=[real[j],real[i]];[imag[i],imag[j]]=[imag[j],imag[i]];}
 }
 for(let size=2;size<=n;size<<=1){
  const half=size>>1,step=-2*Math.PI/size;
  for(let start=0;start<n;start+=size){
   for(let j=0;j<half;j++){
    const angle=step*j,wr=Math.cos(angle),wi=Math.sin(angle),even=start+j,odd=even+half;
    const tr=wr*real[odd]-wi*imag[odd],ti=wr*imag[odd]+wi*real[odd];
    real[odd]=real[even]-tr;imag[odd]=imag[even]-ti;real[even]+=tr;imag[even]+=ti;
   }
  }
 }
}

function correlation(a,b){
 const am=a.reduce((sum,value)=>sum+value,0)/a.length,bm=b.reduce((sum,value)=>sum+value,0)/b.length;
 let ab=0,aa=0,bb=0;for(let i=0;i<a.length;i++){const x=a[i]-am,y=b[i]-bm;ab+=x*y;aa+=x*x;bb+=y*y;}
 return ab/Math.sqrt((aa*bb)||1);
}

/** Estimate the cached instrumental track's key from its spectrum; no music is regenerated. */
async function detectMusicKey(file){
 if(MUSIC_KEY_CACHE.has(file))return MUSIC_KEY_CACHE.get(file);
 const pcm=await new Promise((resolve,reject)=>{
  const child=spawn('ffmpeg',['-hide_banner','-loglevel','error','-i',file,'-f','f32le','-acodec','pcm_f32le','-ac','1','-ar','22050','pipe:1'],{stdio:['ignore','pipe','ignore']});
  const chunks=[];child.stdout.on('data',chunk=>chunks.push(chunk));child.once('error',()=>reject(new Error('Could not decode the cached music bed for key detection')));
  child.once('close',code=>code===0?resolve(Buffer.concat(chunks)):reject(new Error('Could not decode the cached music bed for key detection')));
 });
 const sampleRate=22050,n=8192,hop=4096,binHz=sampleRate/n,totalSamples=Math.floor(pcm.length/4),chroma=new Float64Array(12);
 const real=new Float64Array(n),imag=new Float64Array(n),window=new Float64Array(n);
 for(let i=0;i<n;i++)window[i]=0.5-0.5*Math.cos(2*Math.PI*i/(n-1));
 let frames=0;
 for(let start=0;start+n<=totalSamples;start+=hop){
  for(let i=0;i<n;i++){real[i]=pcm.readFloatLE((start+i)*4)*window[i];imag[i]=0;}
  fft(real,imag);frames++;
  for(let midi=36;midi<=88;midi++){
   const hz=440*2**((midi-69)/12);let energy=0;
   for(let harmonic=1;harmonic<=4;harmonic++){
    const center=Math.round(hz*harmonic/binHz);if(center>=n/2)continue;
    let peak=0;for(let bin=Math.max(1,center-1);bin<=Math.min(n/2-1,center+1);bin++)peak=Math.max(peak,Math.hypot(real[bin],imag[bin]));
    energy+=peak/harmonic;
   }
   chroma[midi%12]+=energy;
  }
 }
 const norm=Math.hypot(...chroma)||1;for(let i=0;i<12;i++)chroma[i]/=norm;
 const candidates=[];
 for(const [mode,profile] of [['major',MAJOR_PROFILE],['minor',MINOR_PROFILE]])
  for(let root=0;root<12;root++)candidates.push({score:correlation(chroma,profile.map((_,pc)=>profile[(pc-root+12)%12])),root,mode});
 candidates.sort((a,b)=>b.score-a.score);
 const best=candidates[0],key={root:best.root,name:PITCH_CLASS[best.root],mode:best.mode,confidence:Number(best.score.toFixed(3)),frames};
 MUSIC_KEY_CACHE.set(file,key);return key;
}

function tuneAccents(cues,key){
 const scale=key.mode==='minor'?[0,3,5,7,10,12]:[0,2,4,7,9,12];let cursor=0;
 for(const cue of cues){
  if(!cue.sfx||!isTonalAccent(cue.sfx,'cinematic'))continue;
  let degree;
  if(cue.step!==undefined)degree=Math.max(0,Math.min(scale.length-1,Math.round(Number(cue.step)* (scale.length-1))));
  else if(cue.semitones!==undefined){
   const target=((Math.round(Number(cue.semitones)%12)+12)%12);
   degree=scale.reduce((best,value,index)=>Math.abs(value-target)<Math.abs(scale[best]-target)?index:best,0);
  }else degree=cursor%scale.length;
  cursor++;
  const midi=72+key.root+scale[degree];cue.pitchHz=440*2**((midi-69)/12);
 }
}

/** Caption phrases follow the voice in readable chunks without splitting sentence beats. */
export function captionsFromSpeech(say,words,offset,sceneEnd){
 const marked=markupWords(say),groups=[];let segment=[];
 const chars=list=>list.reduce((sum,item)=>sum+item.text.replaceAll('*','').length,0)+Math.max(0,list.length-1);
 // Split at sentence ends first, then break long segments into BALANCED chunks (no orphaned last word).
 const flush=()=>{if(!segment.length)return;const parts=Math.max(Math.ceil(segment.length/6),Math.ceil(chars(segment)/34));let i=0;for(let part=parts;part>0;part--){let end=part===1?segment.length:i+Math.ceil((segment.length-i)/part);if(part>1){for(const d of [0,-1,1]){const k=end+d;if(k>i+1&&k<segment.length&&/[,;]$/.test(segment[k-1].text)){end=k;break;}}}groups.push(segment.slice(i,end));i=end;}segment=[];};
 words.forEach((word,index)=>{
  const text=marked[index]?.accent?`*${word.text}*`:word.text;
  segment.push({...word,text});
  if(/[.!?…:][”’"')\]]*$/.test(word.text))flush();
 });
 flush();
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
const cueLevel=cue=>(designFor(cue.sfx,ACTIVE_STYLE)?.gain??1)*(cue.gain??1);
const cueIsPrimary=cue=>cue._protected===true||cue.priority===true||cue.priority==='primary'||cue.priority==='sync'||Number(cue.priority)>=3||Boolean(cue.sync)||Number(cue.gain)>=1.2;
const cuePriority=cue=>cueIsPrimary(cue)?4:CUE_PRIORITY[cue._class]??0;
const cueDuration=cue=>{
 const duration=Math.max(0.02,Number(cue.length)||designFor(cue.sfx,ACTIVE_STYLE)?.seconds||0.2);
 if(ACTIVE_STYLE==='cinematic'&&!cue._ambient&&!cue.ending&&!cue.tail)return Math.min(duration,cueIsPrimary(cue)?0.62:0.5);
 return duration;
};
const cueStrengthOrder=(a,b)=>cuePriority(b)-cuePriority(a)||cueLevel(b)-cueLevel(a)||a.at-b.at;

function maxCueOverlap(cues){
 const points=[];
 for(const cue of cues)if(cue.sfx&&!(ACTIVE_STYLE==='cinematic'&&cue._ambient)){points.push([cue.at,1],[cue.at+cueDuration(cue),-1]);}
 points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 let active=0,maximum=0;
 for(const [,delta] of points){active+=delta;maximum=Math.max(maximum,active);}
 return maximum;
}

/** Globally prunes SFX while keeping story hits ahead of transitions and transitions ahead of texture. */
function governCues(cues,duration,placed){
 const original=cues.filter(cue=>cue.sfx);
 const stageCounts={original:original.length};
 let kept=[...original].sort((a,b)=>a.at-b.at);

 // Keep only the strongest of near-identical same-kind attacks.
 const collapsed=[];
 for(const cue of kept){
  const prior=[...collapsed].reverse().find(item=>item.sfx===cue.sfx&&cue.at-item.at<0.06);
  if(!prior){collapsed.push(cue);continue;}
  if(cueIsPrimary(cue)&&cueIsPrimary(prior)){collapsed.push(cue);continue;}
  if(cueIsPrimary(prior))continue;
  if(cueIsPrimary(cue)){collapsed.splice(collapsed.indexOf(prior),1,cue);continue;}
  if(cueStrengthOrder(cue,prior)<0){collapsed.splice(collapsed.indexOf(prior),1,cue);}
 }
 kept=collapsed;
 stageCounts.collapsed=kept.length;

 // A transition and an incoming scene's first story beat must never land together.
 const muted=new Set();
 for(const transition of kept.filter(cue=>cue._class==='transition')){
  const scene=placed[transition._sceneIndex];
  if(!scene)continue;
  const firstBeat=kept.filter(cue=>cue._sceneIndex===transition._sceneIndex&&cue._class==='story'&&cue.at>=scene.start-0.001&&cue.at<=scene.start+0.24&&cue.at<transition.at+cueDuration(transition));
  if(!firstBeat.length)continue;
  const hit=firstBeat.sort((a,b)=>cueLevel(b)-cueLevel(a))[0];
  // Keep the louder one; on a tie, the synced story hit wins.
  if(cueIsPrimary(hit)||cueLevel(hit)>=cueLevel(transition))muted.add(transition);
  else if(!cueIsPrimary(transition))muted.add(hit);
 }
 kept=kept.filter(cue=>!muted.has(cue));
 stageCounts.afterTransitionMute=kept.length;

 // Short secondary accents inside 75 ms of a stronger cue read as transient stacking.
 kept=kept.filter(cue=>{
  if(cueIsPrimary(cue)||cue._class!=='secondary'||!TRANSIENT_CUES.has(cue.sfx))return true;
  return !kept.some(other=>other!==cue&&Math.abs(other.at-cue.at)<0.075&&cueLevel(other)>cueLevel(cue));
 });
 stageCounts.afterTransientMute=kept.length;

 // Enforce no more than four simultaneously sounding effects. Replace an active lower-ranked cue
 // when a stronger story beat arrives during it.
 const accepted=[];
 for(const cue of [...kept].sort((a,b)=>a.at-b.at)){
  if(ACTIVE_STYLE==='cinematic'&&cue._ambient){accepted.push(cue);continue;}
  const active=accepted.filter(item=>!(ACTIVE_STYLE==='cinematic'&&item._ambient)&&item.at+cueDuration(item)>cue.at);
  if(active.length<4){accepted.push(cue);continue;}
  const selected=[...active,cue].sort(cueStrengthOrder).slice(0,4);
  const protectedActive=[...active,cue].filter(cueIsPrimary);
  for(const item of protectedActive)if(!selected.includes(item))selected.push(item);
  for(const item of active)if(!selected.includes(item))accepted.splice(accepted.indexOf(item),1);
  if(selected.includes(cue))accepted.push(cue);
 }
 kept=accepted;
 stageCounts.afterConcurrency=kept.length;
 if(process.env.MOTION_AUDIO_DEBUG==='1')stageCounts.afterConcurrencyByProtection={primary:kept.filter(cueIsPrimary).length,ordinary:kept.filter(cue=>!cueIsPrimary(cue)).length};

 // A four-cue/sec ceiling keeps secondary motion and foley from being crowded out.
 const densityLimit=Math.max(1,Math.floor(duration*(ACTIVE_STYLE==='cinematic'?3.6:4)));
 if(process.env.MOTION_AUDIO_DEBUG==='1'){stageCounts.duration=duration;stageCounts.densityLimit=densityLimit;}
 if(kept.length>densityLimit){
  const protectedCues=kept.filter(cueIsPrimary),ordinary=kept.filter(cue=>!cueIsPrimary(cue)).sort(cueStrengthOrder);
  if(process.env.MOTION_AUDIO_DEBUG==='1')stageCounts.densitySplit={protected:protectedCues.length,ordinary:ordinary.length,limit:Math.max(0,densityLimit-protectedCues.length)};
  kept=[...protectedCues,...ordinary.slice(0,Math.max(0,densityLimit-protectedCues.length))].sort((a,b)=>a.at-b.at);
 }
 stageCounts.afterDensity=kept.length;

 const protectedBefore=original.filter(cueIsPrimary),protectedAfter=protectedBefore.filter(cue=>kept.includes(cue));
 if(protectedAfter.length!==protectedBefore.length)throw new Error(`Audio governor dropped a primary cue (${protectedAfter.length}/${protectedBefore.length} retained)`);
 const countBy=(items,key)=>Object.fromEntries([...new Set(items.map(item=>key(item)))].sort().map(value=>[value,items.filter(item=>key(item)===value).length]));
 const stats={before:original.length,after:kept.length,primaryBefore:protectedBefore.length,primaryAfter:protectedAfter.length,ordinaryBefore:original.length-protectedBefore.length,ordinaryAfter:kept.length-protectedAfter.length,byKind:countBy(kept,item=>item.sfx),maxOverlap:maxCueOverlap(kept),densityPerSecond:duration?kept.length/duration:0,...(process.env.MOTION_AUDIO_DEBUG==='1'?{debug:{stages:stageCounts,before:original.map(item=>({kind:item.sfx,at:Number(item.at.toFixed(3)),seconds:cueDuration(item),primary:cueIsPrimary(item),class:item._class??'unknown'})),after:kept.map(item=>({kind:item.sfx,at:Number(item.at.toFixed(3)),seconds:cueDuration(item),primary:cueIsPrimary(item),class:item._class??'unknown'}))}}:{})};
 const clean=kept.map(cue=>{const {_class,_sceneIndex,_localAt,_protected,...result}=cue;return result;});
 return {cues:clean,stats};
}

/**
 * Derive music lifts from narration-synced event labels. Any shot can use these shared labels;
 * reels without a matching event simply keep the base music bed.
 */
export function deriveMusicAutomation(placed){
 const marks=placed.flatMap(scene=>(scene.spec.events??[]).map(event=>({at:scene.start+event.at,kind:String(event.kind).toLowerCase()})));
 const find=pattern=>marks.find(mark=>pattern.test(mark.kind));
 const announcement=find(/announce|reunion|reveal|launch|headline/);
 const jump=find(/jump|surge|spike|breakout|price.?up|loss/);
 const pressure=find(/loop|squeeze|press|crush/);
 return {
  announcement,
  jump,
  pressure,
 };
}

function steppedVolumeExpression(points,base){
 if(!points.length)return String(base);
 let expression=String(points.at(-1).level);
 for(let i=points.length-1;i>=0;i--){
  const point=points[i],previous=i===0?base:points[i-1].level,ramp=Math.max(0.04,point.ramp??0.45),end=point.at+ramp;
  expression=`if(lt(t,${point.at.toFixed(3)}),${previous.toFixed(5)},if(lt(t,${end.toFixed(3)}),${previous.toFixed(5)}+(${(point.level-previous).toFixed(5)})*(t-${point.at.toFixed(3)})/${ramp.toFixed(3)},${expression}))`;
 }
 return expression;
}

function dropDuckExpression(cues){
 const points=cues.filter(cue=>cue.sfx==='drop').map(cue=>({start:Math.max(0,cue.at),end:Math.max(0,cue.at)+Math.max(0.28,Number(cue.length)||SFX.drop.seconds)+0.08}));
 if(!points.length)return null;
 const windows=points.map(({start,end})=>`between(t,${start.toFixed(3)},${end.toFixed(3)})`).join('+');
 return `if(${windows},0.251189,1)`;
}

/** Stretches scenes to their narration, moves hits with them, and lists every sound cue on the timeline. */
export function arrange(spec,spoken,defs=sceneDefs,options={}){
 const foleyFill=options.foleyFill??false;
 sceneDefs=defs;
 const scenes=spec.scenes.map((scene,index)=>{
  const voice=spoken[index];
  if(!voice)return {...scene};
  const needed=CONTINUOUS&&voice.length?Math.round(voice.length*FPS)/FPS:Math.ceil((LEAD+voice.words.at(-1).end+TAIL)*FPS)/FPS;
  // The final scene keeps at least its authored length: the payoff needs a hold after the last word.
  const cinematicTail=ACTIVE_STYLE==='cinematic'&&index===spec.scenes.length-1?0.72:0;
  const duration=Math.min(8,Math.max(CONTINUOUS?0.5:1.2,needed,index===spec.scenes.length-1?scene.duration:0)+cinematicTail);
  const {say:_say,caption:_caption,...rest}=scene;
  // Hits keep their relative position in the scene.
  const events=scene.sync?.flatMap(cue=>{const match=voice.words.find(w=>w.text.toLowerCase().replace(/[^a-z0-9]/g,'').includes(cue.word.toLowerCase()));return match?[{kind:cue.kind,at:LEAD+match.start}]:[]});
  return {...rest,duration,...(events?{events}:{}),...(scene.hits?{hits:scene.hits.map(hit=>Math.round(Math.min(duration-0.05,hit*duration/scene.duration)*100)/100)}:{})};
 });
 const timed={...spec,scenes};
 const placed=placeScenes(timed),cues=[],speech=[];
 placed.forEach((scene,index)=>{
  const voice=spoken[index];
  if(voice){
   cues.push({file:voice.audio,at:scene.start+LEAD,gain:1});
   // Narration is one continuous paragraph: collect every word on the reel timeline, chunk once at the end
   // so caption phrases can span cuts ("must buy", "last tickets") instead of orphaning words at scene ends.
   speech.push({say:spec.scenes[index].say,words:voice.words.map(word=>({...word,start:scene.start+LEAD+word.start,end:scene.start+LEAD+word.end}))});
  }
  const length=scene.end-scene.start;
  const transitionSound=scene.spec.transitionSound==='none'?null:scene.spec.transitionSound;
  if(index>0&&scene.spec.transitionSound!==undefined&&transitionSound){
   cues.push({sfx:transitionSound,at:Math.max(0,scene.start-0.08),gain:0.72,_class:'transition',_sceneIndex:index});
  }else if(index>0&&scene.spec.transitionSound===undefined&&scene.spec.transition){
   const transitionKind=TRANSITION_FOLEY[scene.spec.transition];
   if(ACTIVE_STYLE==='cinematic'){
    // A shared, timed swell and sub arrival are added once per scene below.
   }else if(foleyFill&&transitionKind)cues.push({sfx:transitionKind,at:Math.max(0,scene.start-0.07),length:Math.min(designFor(transitionKind,ACTIVE_STYLE).seconds,0.34),gain:0.72,pan:scene.spec.transitionDir==='left'?-0.18:scene.spec.transitionDir==='right'?0.18:0,_class:'transition',_sceneIndex:index});
   else cues.push(...transitionCues(scene.spec.transition,scene.spec.transitionDir).map(cue=>({sfx:cue.kind,at:Math.max(0,scene.start+cue.t),...(cue.len?{length:cue.len}:{}),...(cue.gain===undefined?{}:{gain:cue.gain}),...(cue.pan===undefined?{}:{pan:cue.pan}),_class:'transition',_sceneIndex:index})));
  }
  for(const hit of scene.spec.hits??[])cues.push({sfx:'impact',at:scene.start+hit,_class:'story',_sceneIndex:index,_localAt:hit});
  const ownStart=cues.length;
  const own=sceneCues(scene.spec,length);
  if(own){
   for(const cue of own){
    if(!(cue.t>=0)||cue.t>=length||!designFor(cue.kind,ACTIVE_STYLE))continue;
    const priority=cue.priority??(Boolean(cue.sync)||Number(cue.gain)>=1.2?'primary':undefined);
    const mix={...(cue.pan===undefined?{}:{pan:cue.pan}),...(cue.gain===undefined?{}:{gain:cue.gain}),...(cue.step===undefined?{}:{step:cue.step}),...(priority===undefined?{}:{priority}),...(cue.sync===undefined?{}:{sync:cue.sync})};
    for(const option of ['highpass','lowpass','tail','sub','direction'])if(cue[option]!==undefined)mix[option]=cue[option];
    if(cue.kind==='rise'){const len=Math.min(8,Math.max(0.2,cue.len??0.5),length-cue.t);cues.push({sfx:'rise',at:Math.max(0,scene.start+cue.t+(cue.len??len)-len),length:len,fadeIn:len*0.2,...mix});}
    else if(cue.kind==='type')cues.push({sfx:'type',at:scene.start+cue.t,length:Math.min(8,Math.max(0.2,cue.len??0.6),length-cue.t),...mix});
    else if(cue.kind==='pop')cues.push({sfx:'pop',at:scene.start+cue.t,semitones:SCALE[Math.round(Math.min(1,Math.max(0,cue.step??0))*(SCALE.length-1))],...mix});
    else if(cue.kind==='tick')cues.push({sfx:'tick',at:scene.start+cue.t,semitones:Math.round((cue.step??0)*7),...mix});
    else cues.push({sfx:cue.kind,at:scene.start+cue.t,...(cue.len?{length:Math.min(cue.kind==='hum'?120:8,cue.len,length-cue.t)}:{}),...mix});
   }
  }else{
   const bed=SCENE_BED[scene.spec.type];
   if(bed)cues.push({sfx:bed,at:scene.start+0.15,length:Math.min(designFor(bed,ACTIVE_STYLE).seconds,length*0.6)});
   if(scene.spec.type==='list')scene.spec.items.forEach((_item,item,all)=>cues.push({sfx:'pop',at:scene.start+0.1+item*length*0.65/all.length,semitones:SCALE[item]??0}));
   if(scene.spec.type==='kinetic')scene.spec.words.forEach((_word,beat,all)=>{if(beat>0)cues.push({sfx:'pop',at:scene.start+beat*length/all.length,semitones:SCALE[beat]??0});});
   if(scene.spec.type==='outro')cues.push({sfx:'shimmer',at:scene.start+0.25});
  }
  for(const cue of cues.slice(ownStart))if(cue.sfx){cue._class=cue.sfx==='drop'?'story':'secondary';cue._sceneIndex=index;cue._localAt=cue.at-scene.start;}
 });
 // Promote one strongest effect at each narration event, plus a scene's first cue when it lands on frame one.
 placed.forEach((scene,index)=>{
  for(const event of scene.spec.events??[]){
   const matches=cues.filter(cue=>cue.sfx&&cue._sceneIndex===index&&cue._localAt!==undefined&&Math.abs(cue._localAt-event.at)<=0.04);
   const primary=matches.sort((a,b)=>cueLevel(b)-cueLevel(a))[0];
   if(primary){primary._class='story';primary.priority='primary';primary._protected=true;}
  }
  const first=cues.filter(cue=>cue.sfx&&cue._sceneIndex===index&&cue._localAt!==undefined&&cue._localAt>=-0.001&&cue._localAt<=0.04&&cue._class==='secondary').sort((a,b)=>cueLevel(b)-cueLevel(a))[0];
  if(first)first._class='story';
 });
 const reelEnd=placed.at(-1)?.end??0;
 if(foleyFill&&reelEnd>0){
  cues.push({sfx:'hum',at:0,length:reelEnd,gain:0.9,_class:'secondary',_ambient:true});
 }
 if(ACTIVE_STYLE==='cinematic')placed.slice(1).forEach((scene,index)=>{
  const swellLength=Math.min(0.62,scene.start),target=scene.start;
  if(swellLength>0)cues.push({sfx:'rise',at:target-swellLength,length:swellLength,gain:0.48,tail:0.04,_class:'transition',_sceneIndex:index+1,_localAt:0});
  cues.push({sfx:'sub',at:target,length:0.96,gain:0.52,_class:'transition',_sceneIndex:index+1,_localAt:0,underlay:true});
  const kind=['pluck','coin','pop','ding'][index%4];
  cues.push({sfx:kind,at:target+0.35,gain:0.72,_class:'story',_sceneIndex:index+1,_localAt:0.35});
 });
 for(const cue of [...cues])if(cue.sfx&&cueIsPrimary(cue)&&(cue.sub===true||(ACTIVE_STYLE==='foley'&&foleyFill&&PRIMARY_IMPACTS.has(cue.sfx))))
  cues.push({sfx:'sub',at:cue.at,length:0.22,gain:0.72,pan:cue.pan??0,_class:'secondary',_sceneIndex:cue._sceneIndex,_localAt:cue._localAt,underlay:true});
 // A soft tuned accent keeps a long, audible tail into the final held frame.
 if(reelEnd>2.1)cues.push(ACTIVE_STYLE==='cinematic'
  ?{sfx:'ding',at:reelEnd-1.5,length:1.5,gain:0.88,pan:0,step:0.68,ending:true,_class:'story',priority:'primary'}
  :{sfx:'ding',at:reelEnd-1.35,length:1.35,gain:12,pan:0,step:0.68,ending:true,_class:'story',priority:'primary'});
 const musicAutomation=deriveMusicAutomation(placed);
 const governed=governCues(cues,reelEnd,placed),voiceCues=cues.filter(cue=>!cue.sfx);
 cues.length=0;cues.push(...voiceCues,...governed.cues);cues.sort((a,b)=>a.at-b.at);
 const captions=speech.length?captionsFromSpeech(speech.map(item=>item.say).join(' '),speech.flatMap(item=>item.words),0,reelEnd):[];
 if(captions.length)timed.captions=captions;
 return {spec:timed,cues,duration:reelEnd,cueStats:governed.stats,musicAutomation};
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

 ACTIVE_STYLE=process.env.MOTION_SFX_STYLE?.trim()||(parsed.spec.series?.startsWith('HEDGY')?'cinematic':'foley');
 if(!['cinematic','foley'].includes(ACTIVE_STYLE))throw new Error('MOTION_SFX_STYLE must be cinematic or foley');

 if(parsed.spec.series?.startsWith('HEDGY')&&!process.env.MOTION_VOICE_SPEED)process.env.MOTION_VOICE_SPEED='1.0';
 const voice=pickVoice();
 const spoken=[];
 // HEDGY: one continuous take of the whole paragraph (natural prosody, no gaps where a sentence continues
 // across a cut), sliced at the natural pauses between scenes. MOTION_NARRATION=scenes restores per-scene takes.
 const continuous=(process.env.MOTION_NARRATION??(parsed.spec.series?.startsWith('HEDGY')?'continuous':'scenes'))==='continuous'&&parsed.spec.scenes.every(scene=>scene.say);
 if(continuous){
  LEAD=0;TAIL=0;CONTINUOUS=true;
  spoken.push(...await speakContinuous(parsed.spec.scenes.map(scene=>stripMarkup(scene.say)),voice,key));
 }else for(const scene of parsed.spec.scenes)spoken.push(scene.say?await speak(stripMarkup(scene.say),voice,key):null);
 // Load scene cues in Node with a no-op canvas; audio only needs each scene's deterministic cue list.
 installCueImportEnvironment();
 const defs=await import('../src/motion/scenes/index.ts').then(module=>module.SCENES).catch(error=>{throw new Error(`Could not load scene cue definitions: ${error.message}`);});
 const {spec,cues,duration,cueStats,musicAutomation}=arrange(parsed.spec,spoken,defs,{foleyFill:FOLEY_FILL});
 const unmapped=CUE_KINDS.filter(kind=>!SFX[kind]);
 if(unmapped.length)throw new Error(`Missing sound designs for CueKind: ${unmapped.join(', ')}`);
 const mood=process.env.MOTION_MUSIC?.trim()||parsed.spec.music||'drive';
 const bed=mood==='none'||mood==='off'?null:await music(mood,duration,key);
 const musicKey=bed&&ACTIVE_STYLE==='cinematic'?await detectMusicKey(bed):null;
 if(musicKey)tuneAccents(cues,musicKey);
 const files=new Map();
 const occurrences=new Map();
 for(const cue of cues){
  if(!cue.sfx)continue;
  const design=designFor(cue.sfx,ACTIVE_STYLE),occurrence=occurrences.get(cue.sfx)??0;
  cue.variant=occurrence%design.variants;
  occurrences.set(cue.sfx,occurrence+1);
  let requestedLength=Math.max(0.08,Math.min(cue.sfx==='hum'?120:8,Number(cue.length)||design.seconds));
  if(ACTIVE_STYLE==='cinematic'&&!cue._ambient&&!cue.ending&&!cue.tail)requestedLength=Math.min(requestedLength,cueIsPrimary(cue)?0.62:0.5);
  cue.mixLength=requestedLength;
  cue.assetKey=`${ACTIVE_STYLE}:${cue.sfx}:${cue.variant}:${cue.mixLength.toFixed(3)}:${cue.pitchHz?.toFixed(2)??'-'}:${cue.direction??'down'}`;
  if(!files.has(cue.assetKey))files.set(cue.assetKey,await effect(cue.sfx,key,cue.variant,cue.mixLength,cue.pitchHz,cue.direction??'down'));
 }
 const work=join(CACHE,`render-${hash({spec,cues,mood,style:ACTIVE_STYLE,musicKey})}`);
 await mkdir(work,{recursive:true});
 const timedSpec=join(work,'spec.json'),renderSpec=join(work,'render-spec.json'),silent=join(work,'video.mp4'),mix=join(work,'mix.m4a'),graph=join(work,'mix.filter'),stems=join(work,'stems.mka');
 const exportStems=process.env.MOTION_AUDIO_STEMS==='1';
 const audioOnly=process.env.MOTION_AUDIO_ONLY==='1';
  const total=duration.toFixed(3),pad=`apad=whole_dur=${duration.toFixed(3)},atrim=0:${duration.toFixed(3)}`;
 const bpm=MUSIC_BPM[mood]??null,beatInterval=bpm?60/bpm:null;
 const audioTiming={bpm,beatInterval,beats:beatInterval?Array.from({length:Math.ceil(duration/beatInterval)},(_,i)=>Number((i*beatInterval).toFixed(3))):[]};
 await writeFile(timedSpec,JSON.stringify({...spec,audioTiming},null,1));
 await writeFile(renderSpec,JSON.stringify(spec,null,1));
 try{
  if(!audioOnly)await run(process.execPath,[join(ROOT,'scripts/motion.mjs'),'render',renderSpec,silent]);
  // Three buses keep the voice clear, tactile effects present and music tucked underneath.
  const inputs=[],filters=[],voice=[],fx=[];
  cues.forEach((cue,index)=>{
   inputs.push('-i',cue.file??files.get(cue.assetKey));
   const kind=cue.sfx,design=kind?designFor(kind,ACTIVE_STYLE):null;
   const gain=cue.file?(cue.gain??1):design.gain*(cue.gain??1)*(0.98+0.02*((index*7919)%5)/5);
   const pan=cue.file?0:Math.max(-1,Math.min(1,cue.pan??[-0.22,0,0.22][index%3]));
   const requestedPitch=cue.semitones??(cue.step===undefined?0:Math.round((cue.step-0.5)*4));
   const semitones=cue.file||isTonalAccent(kind,ACTIVE_STYLE)?0:requestedPitch+variantPitch(kind,cue.variant??0,ACTIVE_STYLE);
   const pitch=semitones?`asetrate=${Math.round(48000*2**(semitones/12))},aresample=48000,`:'';
   const length=cue.file?null:cue.mixLength;
   const requestedTail=Number(cue.tail??design?.tail??0.08);
   const tail=length?ACTIVE_STYLE==='cinematic'?Math.min(requestedTail,length*0.35):Math.min(requestedTail,length*0.95):0;
   const trim=length?`atrim=0:${length.toFixed(3)},apad=whole_dur=${length.toFixed(3)},atrim=0:${length.toFixed(3)},${cue.fadeIn?`afade=t=in:st=0:d=${Math.min(cue.fadeIn,length/2).toFixed(3)},`:''}afade=t=out:st=${Math.max(0,length-tail).toFixed(3)}:d=${tail.toFixed(3)},`:'';
   const room=design?.room?'aecho=0.72:0.26:38|67:0.09|0.055,':'';
   const lowpass=Number(cue.lowpass??design?.lowpass??9200),highpass=Number(cue.highpass)||28;
   const filtering=cue.file?'':`highpass=f=${Math.max(28,highpass)},lowpass=f=${Math.max(highpass,Math.min(18000,lowpass))},${room}stereotools=balance_out=${pan.toFixed(3)},`;
   const ms=Math.round(cue.at*1000);
   filters.push(`[${index}:a]aresample=48000,aformat=channel_layouts=stereo,${pitch}${trim}${filtering}volume=${gain.toFixed(3)},adelay=${ms}:all=1[a${index}]`);
   (cue.file?voice:fx).push(`[a${index}]`);
  });
  const sum=(labels,out)=>labels.length?`${labels.join('')}amix=inputs=${labels.length}:normalize=0:dropout_transition=0,${pad}[${out}]`:`anullsrc=channel_layout=stereo:sample_rate=48000,atrim=0:${total}[${out}]`;
  filters.push(sum(voice,'voice_raw'),sum(fx,'fx_raw'));
  filters.push(`[voice_raw]highpass=f=72,equalizer=f=240:t=q:w=1.2:g=-1.5,${ACTIVE_STYLE==='cinematic'?'equalizer=f=1500:t=q:w=1:g=2.8,':''}equalizer=f=3300:t=q:w=1:g=${ACTIVE_STYLE==='cinematic'?'3.0':'1.1'},deesser=i=0.14:m=0.3:f=0.56,${ACTIVE_STYLE==='cinematic'?'lowpass=f=6200,highshelf=f=6000:g=-4,':''}acompressor=threshold=0.13:ratio=2.3:attack=12:release=140:makeup=1.35[voice]`);
  if(ACTIVE_STYLE==='cinematic'){
   filters.push('[fx_raw]asplit=2[fxDry][fxReverbInput]');
   filters.push('[fxReverbInput]aecho=0.78:0.27:43|79|127|181|251|337:0.30|0.24|0.19|0.15|0.11|0.08,lowpass=f=5000,volume=0.62[fxWet]');
   filters.push('[fxDry][fxWet]amix=inputs=2:normalize=0:dropout_transition=0,lowpass=f=7600,acompressor=threshold=0.18:ratio=1.7:attack=12:release=190:makeup=1.08,extrastereo=m=1.035,volume=2.5[fx]');
  }else filters.push('[fx_raw]acompressor=threshold=0.24:ratio=1.65:attack=6:release=130:makeup=1.2,extrastereo=m=1.08,volume=1.35[fx]');
  const buses=[];
  if(bed){
   inputs.push('-i',bed);
   const musicCut=dropDuckExpression(cues),automationPoints=[
    ...(musicAutomation.announcement?[{at:musicAutomation.announcement.at,level:0.2,ramp:0.45}]:[]),
    ...(musicAutomation.jump?[{at:musicAutomation.jump.at,level:0.4,ramp:0.38}]:[]),
    ...(musicAutomation.pressure?[{at:Math.max(0,musicAutomation.pressure.at-1.8),level:0.68,ramp:1.8}]:[]),
   ].sort((a,b)=>a.at-b.at);
   const airExpression=steppedVolumeExpression(automationPoints.map(point=>({...point,level:Math.max(0.025,point.level)})),0.025);
   const percussionExpression=steppedVolumeExpression(automationPoints.map((point,index)=>({...point,level:[0.12,0.34,0.72][Math.min(index,2)]})),0);
   // This branch adds to a unity body band, so use the incremental gain for a +3/+4 dB combined lift.
   const bodyLiftPoints=[
    ...(musicAutomation.announcement?[{at:musicAutomation.announcement.at,level:10**(1.5/20)-1,ramp:0.3}]:[]),
    ...(musicAutomation.jump?[{at:musicAutomation.jump.at,level:10**(3/20)-1,ramp:0.38}]:[]),
    ...(musicAutomation.pressure?[{at:Math.max(0,musicAutomation.pressure.at-0.55),level:10**(4/20)-1,ramp:0.55}]:[]),
   ].sort((a,b)=>a.at-b.at);
   const bodyLiftExpression=steppedVolumeExpression(bodyLiftPoints,0);
   const pressureGain=musicAutomation.pressure?`if(between(t,${Math.max(0,musicAutomation.pressure.at-0.1).toFixed(3)},${Math.min(duration,musicAutomation.pressure.at+0.3).toFixed(3)}),1.584893,1)`:'1';
   const musicCutFilter=musicCut?`volume='${musicCut}':eval=frame,`:'';
   filters.push(`[${cues.length}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${total},loudnorm=I=-20:TP=-1:LRA=11,${musicCutFilter}volume=${ACTIVE_STYLE==='cinematic'?'0.52':'0.4'},afade=t=out:st=${Math.max(0,duration-0.82).toFixed(3)}:d=0.82,extrastereo=m=${ACTIVE_STYLE==='cinematic'?'1.035':'1.07'},${pad}[musicSource]`);
   // Keep the low band grounded, then add a narrow body-band lift at the jump and pressure points.
   // Air and transient bands open at reveal/jump events; voice sidechain still ducks the full bed.
   filters.push('[musicSource]asplit=4[musicBodySource][musicBodyLiftSource][musicAirSource][musicPercSource]');
   filters.push('[musicBodySource]lowpass=f=3200[musicBody]');
   filters.push(`[musicBodyLiftSource]highpass=f=150,lowpass=f=2000,volume='${bodyLiftExpression}':eval=frame[musicBodyLift]`);
   filters.push(`[musicAirSource]highpass=f=1950,lowpass=f=${ACTIVE_STYLE==='cinematic'?'5200':'11500'},volume='${airExpression}':eval=frame[musicAir]`);
   filters.push(`[musicPercSource]highpass=f=3600,lowpass=f=${ACTIVE_STYLE==='cinematic'?'6200':'18000'},acompressor=threshold=0.025:ratio=7:attack=1:release=65,volume='${percussionExpression}':eval=frame[musicPerc]`);
   filters.push(`[musicBody][musicBodyLift][musicAir][musicPerc]amix=inputs=4:normalize=0:dropout_transition=0,volume='${pressureGain}':eval=frame,${pad}[bed]`);
   filters.push('[voice]asplit=3[say][keyMusic][keyFx]','[fx]asplit=2[fxVoiceSource][fxLowSource]',ACTIVE_STYLE==='cinematic'?'[fxVoiceSource][keyFx]sidechaincompress=threshold=0.05:ratio=2:attack=3:release=160:makeup=1[fxduck]':'[fxVoiceSource][keyFx]sidechaincompress=threshold=0.1:ratio=2:attack=4:release=120:makeup=1[fxduck]','[fxLowSource]lowpass=f=180,volume=0.3[fxLowKey]','[bed][keyMusic]sidechaincompress=threshold=0.05:ratio=3:attack=12:release=200:makeup=1.2[musicVoiceDuck]','[musicVoiceDuck][fxLowKey]sidechaincompress=threshold=0.04:ratio=1.6:attack=8:release=125:makeup=1[ducked]');
   if(exportStems){filters.push('[say]asplit=2[sayMix][voiceStem]','[fxduck]asplit=2[fxMix][fxStem]','[ducked]asplit=2[musicMix][musicStem]');buses.push('[fxMix]','[sayMix]','[musicMix]');}
   else buses.push('[fxduck]','[say]','[ducked]');
  }else{
   filters.push('[voice]asplit=2[say][keyFx]',ACTIVE_STYLE==='cinematic'?'[fx][keyFx]sidechaincompress=threshold=0.05:ratio=2:attack=3:release=160:makeup=1[fxduck]':'[fx][keyFx]sidechaincompress=threshold=0.1:ratio=2:attack=4:release=120:makeup=1[fxduck]');
   if(exportStems){filters.push('[say]asplit=2[sayMix][voiceStem]','[fxduck]asplit=2[fxMix][fxStem]');buses.push('[fxMix]','[sayMix]');}
   else buses.push('[fxduck]','[say]');
  }
  filters.push(`${buses.join('')}amix=inputs=${buses.length}:normalize=0:dropout_transition=0,${pad},acompressor=threshold=0.42:ratio=2:attack=4:release=100:makeup=1,alimiter=limit=0.841:attack=5:release=80:level=disabled,loudnorm=I=-14:TP=-1.5:LRA=8[out]`);
  await writeFile(graph,filters.join(';\n'));
  const mixArgs=['-hide_banner','-loglevel','error','-y',...inputs,'-filter_complex_script',graph,'-map','[out]','-c:a','aac','-b:a','192k','-ar','48000',mix];
  if(exportStems)mixArgs.push('-map','[voiceStem]','-map','[fxStem]',...(bed?['-map','[musicStem]']:[]),'-c:a','pcm_s16le','-ar','48000','-metadata:s:a:0','title=Voice','-metadata:s:a:1','title=SFX',...(bed?['-metadata:s:a:2','title=Music']:[]),'-f','matroska',stems);
  await run('ffmpeg',mixArgs);
  if(audioOnly)await run('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',mix,'-c:a','copy','-t',duration.toFixed(3),'-movflags','+faststart',outPath]);
  else await run('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',silent,'-i',mix,'-map','0:v','-map','1:a:0','-c:v','copy','-c:a','copy','-t',duration.toFixed(3),'-movflags','+faststart',outPath]);
  if(exportStems)await copyFile(stems,`${outPath}.stems.mka`);
  const tonalAccentCount=cues.filter(cue=>cue.sfx&&isTonalAccent(cue.sfx,ACTIVE_STYLE)).length;
  const cueDebug=cueStats.debug?{governorDebug:cueStats.debug}:{};
  await writeFile(`${outPath}.audio.json`,JSON.stringify({duration,style:ACTIVE_STYLE,musicKey,cueCount:cueStats.after,cuesPerSecond:cueStats.densityPerSecond,primaryCues:cueStats.primaryAfter,ordinaryCues:cueStats.ordinaryAfter,maxOverlap:cueStats.maxOverlap,cueCountBeforeGovernor:cueStats.before,byKind:cueStats.byKind,tonalAccentCount,tonalAccentShare:cueStats.after?tonalAccentCount/cueStats.after:0,...cueDebug},null,2));
 }finally{await rm(silent,{force:true});await rm(mix,{force:true});await rm(graph,{force:true});}
 const automationSummary=Object.entries(musicAutomation).filter(([,mark])=>mark).map(([name,mark])=>`${name} ${mark.at.toFixed(2)}s`).join(', ')||'none';
 console.log(`Wrote ${outPath} (${duration.toFixed(1)} s, style ${ACTIVE_STYLE}, ${spoken.filter(Boolean).length} narrated scenes, ${cueStats.after} SFX cues, primary ${cueStats.primaryAfter}/${cueStats.primaryBefore} retained, max overlap ${cueStats.maxOverlap}, ${cueStats.densityPerSecond.toFixed(2)} cues/s, music: ${bed?mood:'none'}${musicKey?`, key ${musicKey.name} ${musicKey.mode}`:''}; lifts: ${automationSummary}; SFX generations ${sfxGenerationsThisRender}/${MAX_SFX_GENERATIONS}, music generations ${musicGenerationsThisRender}/1). Timed spec: ${timedSpec}${exportStems?`, stems: ${outPath}.stems.mka`:''}${audioOnly?'; audio only':''}`);
}
