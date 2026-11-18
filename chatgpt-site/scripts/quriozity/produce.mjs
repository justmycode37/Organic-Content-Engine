// QURIOZITY producer: Sol medium plans/reviews; Opus medium realizes/repairs visuals.
//   node --env-file=.env.motion scripts/quriozity/produce.mjs <workdir> [--topic "Why we dream"] [--spec spec.json] [--history history.json]
// Layers: explainer plan (golden thread) → script → fact check + coherence review → storyboard → storyboard review (worker/quriozity-generation.ts)
//         → subject / composition / continuity / reference-style reviews → voice delivery + actual pacing review
//         → final visual review on real word timings → sound design + mix review → video
//         → SOUND DESIGN (Sol cue sheet, note-free ElevenLabs SFX) → mix → SOUND REVIEW (Sol + measured stats)
//         → final mix with steady music and calibrated effects → video.
// Every step is cached in <workdir>, so a rerun resumes instead of paying twice.
import {createHash} from 'node:crypto';
import {access,mkdir,readFile,writeFile,rm,appendFile,rename,copyFile} from 'node:fs/promises';
import {spawn,execFileSync,spawnSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {stills,renderVideo,buildRenderBundle} from './render.mjs';
import {sfxLibrary,SFX_KINDS} from './sfx.mjs';
import {loadCatalog} from './catalog.mjs';
import {referenceSheets} from './review-evidence.mjs';
import {prepareStyleReference,candidateMotionEvidence} from './style-reference.mjs';
import {runVisualReviewStage,runVoiceReviews,reviewFingerprint,bestReviewedVisual,REVIEW_LIMITS} from './quality-reviews.mjs';
import {opusRepairBudget,solRepairBudget} from './repair-budget.mjs';
import {prepareMusicBed,MUSIC_LEVEL} from './music-level.mjs';
import {VISUAL_REVIEW_STAGES,reviewVisuals,repairVisuals,reviewNarrationDelivery,reviewVoicePacing} from '../../worker/quriozity-quality.ts';
import {sceneDuration,resolveAt} from '../../src/quriozity/spec.ts';
import {createRequire} from 'node:module';
// long xhigh reasoning calls: no client-side header/body timeouts
{const {Agent,setGlobalDispatcher}=createRequire(import.meta.url)('undici');setGlobalDispatcher(new Agent({headersTimeout:0,bodyTimeout:0}));}

const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const CACHE=join(ROOT,'.quriozity-cache');
const AUDIO_CACHE=process.env.QURIOZITY_AUDIO_CACHE?.trim()||CACHE;
/** Local ledger of every finished QURIOZITY reel (manual runs and worker jobs), so no topic repeats. */
export const HISTORY_FILE=process.env.QURIOZITY_HISTORY_FILE?.trim()||join(ROOT,'.quriozity-history.json');
export async function readLedger(file=HISTORY_FILE){try{const v=JSON.parse(await readFile(file,'utf8'));return Array.isArray(v)?v:[];}catch(e){if(e.code==='ENOENT')return [];throw new Error(`QURIOZITY history ledger unreadable (${file}): ${e.message}`);}}
export async function recordReel(entry,file=HISTORY_FILE){
 const list=await readLedger(file);if(entry.workdir&&list.some(h=>h.workdir===entry.workdir))return list;
 const next=[entry,...list];const tmp=`${file}.${process.pid}.tmp`;await writeFile(tmp,JSON.stringify(next,null,1));await rename(tmp,file);return next;
}
const VOICE_ID=process.env.QURIOZITY_VOICE_ID?.trim()||'s3TPKV1kjDlVtZbl4Ksh'; // Adam, same narrator as Hedgy
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0,20);
const exists=p=>access(p).then(()=>true,()=>false);
const readJson=async p=>JSON.parse(await readFile(p,'utf8'));
function run(bin,args){return new Promise((res,rej)=>{const c=spawn(bin,args,{stdio:['ignore','ignore','pipe']});let e='';c.stderr.on('data',d=>e=(e+d).slice(-3000));c.once('error',rej);c.once('close',n=>n===0?res():rej(new Error(`${bin} exited ${n}: ${e}`)));});}
const log=(...a)=>console.log(`[quriozity ${new Date().toISOString().slice(11,19)}]`,...a);

async function eleven(path,body,key,usage,attempt=0){
 const r=await fetch(`https://api.elevenlabs.io${path}`,{method:'POST',headers:{'xi-api-key':key,'content-type':'application/json'},body:JSON.stringify(body)});
 await usage({provider:'elevenlabs',endpoint:path.split('?')[0],status:r.status,characters:body.text?.length,generatedSeconds:body.music_length_ms?body.music_length_ms/1000:body.duration_seconds,characterCost:r.headers.get('character-cost'),requestId:r.headers.get('request-id')});
 if(r.status===429&&attempt<4){await new Promise(res=>setTimeout(res,15000*(attempt+1)));return eleven(path,body,key,usage,attempt+1);}
 if(!r.ok)throw new Error(`ElevenLabs ${path.split('?')[0]} failed (${r.status})`);return r;
}

/** Whole narration in one take with per-word timing (natural prosody across scene cuts). */
export function narrationRequest(delivery,take){
 const voice_settings={stability:0.5,similarity_boost:0.75,style:0,use_speaker_boost:true};
 return {text:delivery.text,model_id:'eleven_multilingual_v2',voice_settings,seed:parseInt(hash({text:delivery.text,speedMode:'elevenlabs-default',take}).slice(0,8),16)};
}
async function narrate(delivery,take,key,usage){
 const body=narrationRequest(delivery,take),{model_id:model,voice_settings,seed}=body;
 const id=hash({body,VOICE_ID,v:3}),audio=join(AUDIO_CACHE,`voice-${id}.wav`),meta=join(AUDIO_CACHE,`voice-${id}.json`);
 if(!(await exists(audio))||!(await exists(meta))){
  let data,pcm=true;
  try{data=await (await eleven(`/v1/text-to-speech/${VOICE_ID}/with-timestamps?output_format=pcm_44100`,body,key,usage)).json();}
  catch{pcm=false;try{data=await (await eleven(`/v1/text-to-speech/${VOICE_ID}/with-timestamps?output_format=mp3_44100_192`,body,key,usage)).json();}catch{data=await (await eleven(`/v1/text-to-speech/${VOICE_ID}/with-timestamps?output_format=mp3_44100_128`,body,key,usage)).json();}}
  const a=data.alignment??data.normalized_alignment;if(!data.audio_base64||!a)throw new Error('No narration audio/timing');
  const words=[];let cur=null;
  a.characters.forEach((ch,i)=>{if(/\s/.test(ch)){if(cur){words.push(cur);cur=null;}return;}cur??={text:'',start:a.character_start_times_seconds[i],end:0};cur.text+=ch;cur.end=a.character_end_times_seconds[i];});
  if(cur)words.push(cur);
  const raw=Buffer.from(data.audio_base64,'base64');
  if(pcm){const tmp=`${audio}.pcm`;await writeFile(tmp,raw);await run('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','s16le','-ar','44100','-ac','1','-i',tmp,'-ar','48000','-ac','2',audio]);await rm(tmp,{force:true});}
  else{const tmp=`${audio}.mp3`;await writeFile(tmp,raw);await run('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',tmp,'-ar','48000','-ac','2',audio]);await rm(tmp,{force:true});}
  await writeFile(meta,JSON.stringify({words,voice_settings,seed}));
 }
 const total=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',audio],{encoding:'utf8'}).trim());
 return {audio,words:(await readJson(meta)).words,total,model,voiceId:VOICE_ID,settings:voice_settings,seed};
}

/** Split the take into scenes at the pauses; each scene gets its words relative to its own start. */
function timeScenes(spec,voice,beat=null){
 const counts=spec.scenes.map(s=>s.say.split(/\s+/).filter(Boolean).length);
 const n=counts.reduce((a,b)=>a+b,0);const W=voice.words;
 if(W.length!==n)log(`warning: ${W.length} spoken words for ${n} written; mapping proportionally`);
 const map=i=>W[Math.min(W.length-1,Math.round(i*(W.length-1)/Math.max(1,n-1)))];
 const LEAD=0.35;// a breath of picture before the first word
 const bounds=[0];let idx=0;
 for(let i=0;i<counts.length-1;i++){idx+=counts[i];const a=map(idx-1),b=map(idx);const mid=LEAD+(a.end+b.start)/2;
  // cut on the beat grid when a grid line falls inside the pause between the two sentences
  const lo=LEAD+a.end+0.02,hi=LEAD+b.start-0.02;const sn=snap(mid,beat,2);bounds.push(beat&&sn>=lo&&sn<=hi&&sn>bounds.at(-1)+0.6?sn:mid);}
 {const end=LEAD+Math.max(voice.total,W.at(-1).end)+1.4;bounds.push(beat?Math.max(end,snap(end+beat.period/2,beat,1)):end);}
 idx=0;
 const scenes=spec.scenes.map((s,i)=>{const start=bounds[i],end=bounds[i+1];const words=[];for(let k=0;k<counts[i];k++){const w=map(idx+k);words.push({text:s.say.split(/\s+/).filter(Boolean)[k]??w.text,start:+(LEAD+w.start-start).toFixed(3),end:+(LEAD+w.end-start).toFixed(3)});}idx+=counts[i];return {...s,duration:+(end-start).toFixed(3),words};});
 return {spec:{...spec,scenes},lead:LEAD,total:bounds.at(-1)};
}

function timelineText(spec){
 let t=0;const out=[];
 spec.scenes.forEach((s,i)=>{
  out.push(`SCENE ${i+1} [${t.toFixed(2)}-${(t+s.duration).toFixed(2)}s] hue ${s.hue??'blue'}; objects: ${s.objects.map(o=>`${o.id}=${o.model}${o.enter?` enters ${o.enter}`:''}${o.exit?` exits ${o.exit}`:''}`).join(', ')}`);
  out.push(`  words: ${s.words.map(w=>`${w.text}@${(t+w.start).toFixed(2)}`).join(' ')}`);
  for(const e of s.events??[])out.push(`  event at "${e.at}": ${JSON.stringify({...e,at:undefined})}`);
  for(const x of s.text??[])out.push(`  text "${x.text}" (${x.style??'headline'}) at "${x.at??0.1}"`);
  t+=s.duration;
 });
 return out.join('\n');
}

/** Keep the sheet calm: drop cues that crowd each other or exceed the density budget. */
function governCues(cues,total){
 const sorted=[...cues].filter(c=>Number.isFinite(c.at)&&c.at>=0&&c.at<total).sort((a,b)=>a.at-b.at);
 const out=[];for(const c of sorted){const near=out.filter(o=>Math.abs(o.at-c.at)<0.09);if(near.length){if((c.gain??0.6)>(near[0].gain??0.6)){out.splice(out.indexOf(near[0]),1);out.push(c);}continue;}out.push(c);}
 const max=Math.ceil(total*2.6);if(out.length>max){out.sort((a,b)=>(b.gain??0.6)-(a.gain??0.6));out.length=max;}
 return out.sort((a,b)=>a.at-b.at);
}

async function music(brief,seconds,key,usage){
 const prompt=`Instrumental only, no vocals. A real piece of MUSIC with melody and chords, not just a drum beat. Exactly 100 BPM, 4/4, minor key. Electronic synthwave / electro style: a catchy memorable lead synth melody (bright analog saw lead, call-and-response phrases), a pulsing arpeggiated synth sequence in sixteenth notes, warm evolving pad chords (i - VI - III - VII progression), a driving electric bass line that follows the chords, and a punchy electronic drum kit underneath. Keep the backing at a steady perceived volume and similar energy from beginning to end. No quiet intro, breakdown, crescendo, riser, volume swell, fade, or louder finale. Vary the melody and harmony without changing the overall loudness; finish cleanly at the same backing level. Inspiring, cinematic, modern tech feel. ${brief||''} Keep the lead melody in the gaps and the mid range open so a narrator stays clear on top.`;
 const length=Math.min(150,Math.max(15,Math.ceil((seconds+2)/5)*5));
 const file=join(AUDIO_CACHE,`music-${hash({prompt,length})}.mp3`);
 if(!await exists(file)){const r=await eleven('/v1/music?output_format=mp3_44100_128',{prompt,music_length_ms:length*1000,force_instrumental:true},key,usage);await writeFile(file,Buffer.from(await r.arrayBuffer()));}
 return file;
}

/** Beat grid of the score: period and phase from the onset envelope (pure JS on ffmpeg-decoded PCM). */
function detectBeats(file,bpmHint=100){
 const raw=spawnSync('ffmpeg',['-v','error','-i',file,'-ac','1','-ar','11025','-f','s16le','-'],{maxBuffer:1<<28}).stdout;if(!raw?.length)return null;
 const x=new Int16Array(raw.buffer,raw.byteOffset,raw.length>>1),hop=128,win=512,sr=11025,n=Math.floor((x.length-win)/hop);if(n<200)return null;
 const e=new Float32Array(n);for(let i=0;i<n;i++){let s=0;for(let k=0;k<win;k++){const v=x[i*hop+k]/32768;s+=v*v;}e[i]=Math.log1p(1000*s/win);}
 const env=new Float32Array(n);for(let i=1;i<n;i++)env[i]=Math.max(0,e[i]-e[i-1]);
 const dt=hop/sr,target=60/bpmHint;let best=target,bs=-1;
 for(let p=target*0.8;p<=target*1.25;p+=0.002){const lag=p/dt;let s=0;for(let i=0;i+2*lag<n;i+=1){const a=env[i],b=env[Math.round(i+lag)],c=env[Math.round(i+2*lag)];s+=a*b+a*c*0.5;}if(s>bs){bs=s;best=p;}}
 let phase=0,ps=-1;for(let ph=0;ph<best;ph+=0.005){let s=0;for(let t=ph;t<n*dt;t+=best)s+=env[Math.round(t/dt)]??0;if(s>ps){ps=s;phase=ph;}}
 // when the beat actually starts (first second whose onset energy reaches half the track average)
 const perSec=Math.round(1/dt);let avg=0;for(let i=0;i<n;i++)avg+=env[i];avg/=n;let from=0;for(let sIdx=0;sIdx*perSec<n;sIdx++){let m=0;for(let i=sIdx*perSec;i<Math.min(n,(sIdx+1)*perSec);i++)m+=env[i];if(m/perSec>avg*0.5){from=sIdx;break;}}
 return {period:+best.toFixed(4),phase:+phase.toFixed(3),from,bpm:+(60/best).toFixed(1)};
}
const snap=(t,beat,div=2)=>{if(!beat)return t;const g=beat.period/div;return beat.phase+Math.round((t-beat.phase)/g)*g;};

/** Music has a fixed prepared level; only effects gain is calibrated per reel. */
export const MIX_DEFAULTS={sfxDb:-6};
/** Intelligibility targets, measured per spoken word: narrator level minus music / effects level. */
export const VOICE_TARGETS={music:{overall:16,worst:10},sfx:{overall:16,worst:8}};

async function mix({voice,lead,cues,sfx,bed,total,out,stems,levels=MIX_DEFAULTS}){
 // narrator: clean low end, presence lift for consonants, steady level
 const inputs=['-i',voice.audio],filters=[`[0:a]aresample=48000,adelay=${Math.round(lead*1000)}:all=1,highpass=f=80,equalizer=f=250:t=q:w=1.2:g=-2,equalizer=f=3200:t=q:w=1:g=3,acompressor=threshold=0.12:ratio=3:attack=6:release=120:makeup=1.5,loudnorm=I=-16:TP=-2:LRA=7,apad=whole_dur=${total.toFixed(3)},atrim=0:${total.toFixed(3)}[voice]`];
 const fx=[];const sfxGain=10**(levels.sfxDb/20);
 for(const [i,c] of cues.entries()){
  const file=await sfx.clip(c);if(!file)continue;const k=inputs.length/2;inputs.push('-i',file);
  const pan=[-0.18,0,0.18][i%3];
  filters.push(`[${k}:a]aresample=48000,aformat=channel_layouts=stereo,highpass=f=30,lowpass=f=11000,stereotools=balance_out=${pan},volume=${(sfxGain*(c.gain??0.6)).toFixed(4)},adelay=${Math.round(c.at*1000)}:all=1[f${k}]`);fx.push(`[f${k}]`);
 }
 filters.push(fx.length?`${fx.join('')}amix=inputs=${fx.length}:normalize=0:dropout_transition=0,apad=whole_dur=${total.toFixed(3)},atrim=0:${total.toFixed(3)}[fxdry]`:`anullsrc=channel_layout=stereo:sample_rate=48000,atrim=0:${total.toFixed(3)}[fxdry]`);
 filters.push('[fxdry]asplit=2[fxa][fxb]','[fxb]aecho=0.8:0.35:60|110|170:0.25|0.16|0.1,lowpass=f=6000,volume=0.5[fxwet]','[fxa][fxwet]amix=inputs=2:normalize=0,equalizer=f=2800:t=q:w=1:g=-4[fxsum]');
 filters.push('[voice]asplit=2[say][key1]','[fxsum][key1]sidechaincompress=threshold=0.03:ratio=4:attack=4:release=220[fx]');
 const buses=['[say]','[fx]'];
 if(bed){const m=inputs.length/2;inputs.push('-i',bed);
  // Already prepared at a fixed level: no speech ducking, fades or gain riding.
  filters.push(`[${m}:a]anull[bed]`);buses.push('[bed]');}
 const labels=stems?buses.map((b,i)=>{filters.push(`${b}asplit=2[m${i}][s${i}]`);return `[m${i}]`;}):buses;
 // Reserve music headroom before summing it. A master compressor/normalizer
 // would modulate the music again, even without a music sidechain.
 filters.push(`${labels.slice(0,2).join('')}amix=inputs=2:normalize=0:dropout_transition=0,volume=2dB,alimiter=limit=0.68:attack=4:release=80:level=disabled:latency=1[speechfx]`);
 filters.push(bed?`[speechfx]${labels[2]}amix=inputs=2:normalize=0:dropout_transition=0[out]`:'[speechfx]anull[out]');
 const graph=`${out}.filter`;await writeFile(graph,filters.join(';\n'));
 const args=['-hide_banner','-loglevel','error','-y',...inputs,'-filter_complex_script',graph,'-map','[out]','-c:a','aac','-b:a','320k','-ar','48000',out];
 if(stems)buses.forEach((_,i)=>args.push('-map',`[s${i}]`,'-c:a','pcm_s16le',`${out}.stem${i}.wav`));
 await run('ffmpeg',args);await rm(graph,{force:true});
}

/** Per spoken word: narrator RMS minus music / effects RMS over the same span (dB), from the mixed stems. */
export function voiceClarity(out,words,lead,hasBed){
 const SR=8000;
 const pcm=f=>{const b=spawnSync('ffmpeg',['-v','error','-i',f,'-ac','1','-ar',String(SR),'-f','f32le','-'],{maxBuffer:1<<28}).stdout;return new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.length-(b.length%4)));};
 const v=pcm(`${out}.stem0.wav`),fx=pcm(`${out}.stem1.wav`),bed=hasBed?pcm(`${out}.stem2.wav`):null;
 const rms=(x,a,b)=>{if(!x)return 0;let e=0,n=0;for(let i=a;i<b&&i<x.length;i++){e+=x[i]*x[i];n++;}return n?e/n:0;};
 const db=(num,den)=>10*Math.log10((num+1e-12)/(den+1e-12));
 const per={music:[],sfx:[]};let V=0,M=0,F=0;
 for(const w of words){const a=Math.floor((lead+w.start)*SR),b=Math.max(a+Math.floor(0.08*SR),Math.ceil((lead+w.end)*SR));
  const ev=rms(v,a,b),em=rms(bed,a,b),ef=rms(fx,a,b);V+=ev;M+=em;F+=ef;per.music.push(db(ev,em));per.sfx.push(db(ev,ef));}
 const worst=xs=>{const s=[...xs].sort((x,y)=>x-y);return s[Math.floor(s.length*0.05)]??99;};
 const r=x=>Math.min(99,+x.toFixed(1));
 return {music:{overall:r(hasBed?db(V,M):99),worst:r(hasBed?worst(per.music):99)},sfx:{overall:r(db(V,F)),worst:r(worst(per.sfx))}};
}

/** Keep music fixed; calibrate only effects. Music clarity stays measured and
 *  available to sound review, but never drives music gain automation. */
export async function calibrateMix(args,log){
 const musicLevel=args.bed?await prepareMusicBed(args.bed,args.total,`${args.out}.music.wav`):null;
 args={...args,bed:musicLevel?.file??null};
 const CAP={sfxDb:2};
 let levels={...MIX_DEFAULTS};const history=[];let best=null;
 for(let round=0;;round++){
  await mix({...args,stems:true,levels});
  const c=voiceClarity(args.out,args.voice.words,args.lead,!!args.bed);history.push({levels:{...levels},clarity:c});
  const slack=k=>Math.min(c[k].overall-VOICE_TARGETS[k].overall,c[k].worst-VOICE_TARGETS[k].worst)-1;
  log(`mix calibration ${round+1}: music fixed ${musicLevel?.integratedLufs.toFixed(1)??'off'} LUFS → voice +${c.music.overall}/${c.music.worst} dB; sfx ${levels.sfxDb.toFixed(1)} dB → voice +${c.sfx.overall}/${c.sfx.worst} dB`);
  const ok=slack('sfx')>=0;
  if(ok)best={levels:{...levels},clarity:c};
  const next={...levels};
  for(const [k,bus] of [['sfx','sfxDb']]){
   const sl=slack(k);
   if(sl<0)next[bus]=levels[bus]+sl-0.5;
   else if(sl>2&&levels[bus]<CAP[bus])next[bus]=Math.min(CAP[bus],levels[bus]+sl-1);
  }
  const moved=next.sfxDb!==levels.sfxDb;
  if(ok&&!moved)return {...best,history,musicLevel};
  if(round>=12){
   if(!best)throw new Error(`Narrator still masked after ${round+1} calibration rounds: ${JSON.stringify(c)}`);
   await mix({...args,stems:true,levels:best.levels});return {...best,history,musicLevel};
  }
  levels=next;
 }
}

async function mixStats(out,cues,total,hasBed,clarity){
 const vol=f=>spawnSync('ffmpeg',['-hide_banner','-i',f,'-af','volumedetect','-f','null','-'],{encoding:'utf8'}).stderr??'';
 const pick=(t,k)=>Number((new RegExp(`${k}: (-?[\\d.]+)`).exec(t)??[])[1]);
 const s=[0,1,...(hasBed?[2]:[])].map(i=>vol(`${out}.stem${i}.wav`));
 const names=['voice','sfx','music'];
 const parts=s.map((t,i)=>`${names[i]} mean ${pick(t,'mean_volume')} dB max ${pick(t,'max_volume')} dB`);
 const kinds={};for(const c of cues)kinds[c.kind??'custom']=(kinds[c.kind??'custom']??0)+1;
 return `${parts.join('; ')}; narrator clarity per word (voice minus bed, overall/worst 5%): music +${clarity?.music.overall}/${clarity?.music.worst} dB, sfx +${clarity?.sfx.overall}/${clarity?.sfx.worst} dB. Music uses a fixed ${MUSIC_LEVEL.lufs} LUFS target with no speech ducking, fades or adaptive gain; effects alone are auto-calibrated. These are measured stems/cues, not an audio listening review. ${cues.length} cues over ${total.toFixed(1)} s (${(cues.length/total).toFixed(2)}/s); by kind ${JSON.stringify(kinds)}`;
}

export async function produce(workdir,{topic='',specFile=null,history=[],clients=null,subscription,recordHistory=true,allowUnapproved=false}={}){
 if(allowUnapproved&&(!clients||recordHistory))throw new Error('Unapproved previews require explicit private experiment clients and disabled history');
 const openai=process.env.OPENAI_API_KEY?.trim(),key=process.env.ELEVENLABS_API_KEY?.trim();
 if(!openai&&!subscription)throw new Error('Set OPENAI_API_KEY: Quriozity content reviews are required, including for saved specs');
 if(!key)throw new Error('Set ELEVENLABS_API_KEY');
 await mkdir(workdir,{recursive:true});await mkdir(CACHE,{recursive:true});await mkdir(AUDIO_CACHE,{recursive:true});
 const usageFile=join(workdir,'usage.jsonl');const usage=e=>appendFile(usageFile,JSON.stringify({at:new Date().toISOString(),...e})+'\n');
 const measure=async(stage,fn)=>{const start=performance.now();try{return await fn();}finally{await appendFile(join(workdir,'timings.jsonl'),JSON.stringify({stage,seconds:(performance.now()-start)/1000,at:new Date().toISOString()})+'\n');}};
 const gen=await import('../../worker/quriozity-generation.ts');
 const clientContext=clients?.context??{...gen.QURIOZITY_CLIENT_CONTEXT,reviewEffort:gen.REVIEW_EFFORT};
 const generationLabel=clientContext.generationModel??gen.MODEL,reviewLabel=clientContext.reviewModel??gen.REVIEW_MODEL;
 const provenance=await readJson(join(workdir,'provenance.json')).catch(()=>({}));
 if(provenance.unapprovedTest&&provenance.modelRouting?.variant&&!allowUnapproved)throw new Error('Unapproved test cache requires the explicit private experiment override');
 if(provenance.reviewsDisabled===true||provenance.reviewMode==='raw-first-draft')throw new Error('Unreviewed experiment cache cannot be used for normal Quriozity production; use a fresh workdir with the full review pipeline');
 if(!clients)provenance.publicationPolicy='best-reviewed-after-limits';
 const save=()=>writeFile(join(workdir,'provenance.json'),JSON.stringify(provenance,null,1));
 const styleReference=await measure('style reference preparation',()=>prepareStyleReference(workdir));
 provenance.styleReference={hash:styleReference.hash,sourceHash:styleReference.sourceHash,files:styleReference.files,standard:'Owner-approved perfect reference; required direct style comparison.'};await save();
 let cat=await measure('catalogue preparation',()=>loadCatalog());
 const reserveRepair=await opusRepairBudget(workdir);
 const reserveSolRepair=await solRepairBudget(workdir);
 const ask=clients?.ask??gen.quriozityClient({OPENAI_API_KEY:openai,ANTHROPIC_API_KEY:process.env.ANTHROPIC_API_KEY},usage,reserveRepair,reserveSolRepair,subscription);
 // 1-5 story + storyboard
 const draft=join(workdir,'spec.draft.json');
 if(specFile&&!await exists(draft))await writeFile(draft,await readFile(specFile));
 if(!await exists(draft)){
  if(!ask)throw new Error('Set OPENAI_API_KEY');
  log(`${generationLabel} ${clientContext.generationEffort??clientContext.effort}: plan → script → ${reviewLabel} fact check + coherence → storyboard → storyboard review`);
  // objects the library lacks are searched in real-model libraries (Objaverse / Smithsonian / NASA), verified by Sol and added for good
  const {sourceAssets}=await import('./asset-sourcing.mjs');
  const sourcing={find:async needs=>{log(`sourcing real models: ${needs.map(n=>n.thing).join(', ')}`);const r=await measure('asset sourcing',()=>sourceAssets(ask,needs,{log,workdir:join(workdir,'sourcing'),hasModel:cat.has}));cat=await loadCatalog({fresh:true});provenance.sourcedAssets=[...(provenance.sourcedAssets??[]),...r.added.map(e=>({id:e.id,source:e.source,license:e.license,page:e.page}))];await save();return {cat,added:r.added.map(e=>e.id)};}};
  const {mergeHistory}=await import('../../worker/quriozity-history.ts');
  const all=mergeHistory(history,await readLedger());log(`history: ${all.length} earlier reels checked for repeats`);
  const r=await measure('story generation total',()=>gen.generateQuriozityReel({OPENAI_API_KEY:openai,ANTHROPIC_API_KEY:process.env.ANTHROPIC_API_KEY},topic,cat,usage,all,sourcing,ask));
  Object.assign(provenance,r.provenance,{model:clientContext.generationModel,effort:clientContext.generationEffort??clientContext.effort});await save();await writeFile(draft,JSON.stringify(r.spec,null,1));
 }
 let spec=await readJson(draft);
 // Preserve the actual author of a saved draft; new repair routing cannot relabel its origin.
 provenance.modelRouting={...clientContext,generationModel:provenance.model??'provided-spec',generationEffort:provenance.effort??'unknown',repairModel:clientContext.visualModel??clientContext.generationModel,repairEffort:clientContext.visualEffort??clientContext.generationEffort??clientContext.effort};
 provenance.reviewModel=clientContext.reviewModel;provenance.reviewEffort=clientContext.reviewEffort??clientContext.effort;await save();
 if(provenance.storyboardGate?.passed===false){
  provenance.unapprovedTest=true;provenance.failedReviews=[...new Set([...(provenance.failedReviews??[]),'storyboard-review'])];await save();
 }
 const reviewContext={styleReference:styleReference.hash,...clientContext,thread:provenance.thread??'',catalogue:reviewFingerprint({text:cat.text,assets:cat.assets}),modelCode:hash(await readFile(join(CACHE,'catalog.bundle.mjs'),'utf8')),rendererCode:hash(await buildRenderBundle())};
 // 6. Distinct, required visual specialists; legacy reviewed filenames do not bypass them.
 const renderEvidence=async(current,dir,stage)=>{
  const samples=[];let offset=0;
  current.scenes.forEach((scene,i)=>{
   const d=sceneDuration(scene);
   const add=(local,label)=>samples.push({time:offset+Math.max(0.001,Math.min(d-0.001,local)),label:`S${i+1} ${label}`});
   for(const k of [0.08,0.3,0.55,0.75,0.95])add(d*k,`${Math.round(k*100)}%`);
   add(0.04,'cut in');add(d-0.04,'cut out');
   for(const text of scene.text??[]){const at=resolveAt(scene,text.at,d,0.1);add(at+0.15,'text reveal');add(at+(text.text.length/(text.cps??13))+0.1,'text held');}
   for(const event of scene.events??[]){const at=resolveAt(scene,event.at,d);add(at,'action starts');add(at+(event.dur??0.3),'action lands');}
   offset+=d;
  });
  samples.sort((a,b)=>a.time-b.time);
  const unique=samples.filter((s,i)=>!i||s.time-samples[i-1].time>0.015);
  // Larger samples in the readability/final passes keep small captions inspectable.
  const detailed=['visual-composition-review','visual-style-reference-review','visual-final-review'].includes(stage.id);
  const batchSize=detailed?6:12,scale=detailed?0.5:0.25,columns=detailed?3:6;
  const sheets=[],files=[];
  for(let i=0;i<unique.length;i+=batchSize){
   const path=join(dir,`frames-${i/batchSize+1}.png`),batch=unique.slice(i,i+batchSize);
   await stills(current,path,batch.map(s=>s.time),scale,batch.map(s=>`${s.label} @${s.time.toFixed(2)}s`),columns);
   files.push(path);sheets.push({mime:'image/png',base64:(await readFile(path)).toString('base64')});
  }
  const references=await referenceSheets(current,dir);
  let index=`Ordered scene samples at 8/30/55/75/95%, both sides of cuts, text reveals/holds and action boundaries. ${current.scenes.every(s=>s.words)?'Actual narration timings.':'Estimated narration timings.'} After the ${sheets.length} reel sheets are ${references.length} subject-source references: ${references.map(r=>r.label).join(' | ')}`;
  const compareStyle=['visual-style-reference-review','visual-final-review'].includes(stage.id),extra=[];let motion;
  if(compareStyle){
   for(const file of styleReference.files.filter(f=>f.endsWith('.png'))){const to=join(dir,'owner-style-'+file.split('/').at(-1));await copyFile(file,to);files.push(to);}
   extra.push(...styleReference.sheets);index+='\n'+styleReference.index;
   motion=await candidateMotionEvidence(current,dir);extra.push(...motion.sheets);files.push(...motion.files);index+='\n'+motion.index;
  }
  await writeFile(join(dir,'frame-index.json'),JSON.stringify({samples:unique,index,...(compareStyle?{styleReferenceHash:styleReference.hash,styleSourceHash:styleReference.sourceHash,motionSamples:motion.samples}:{})},null,1));
  return {sheets:[...sheets,...references,...extra],index,files};
 };
 const visualStage=async(current,stage)=>{
  log(`${reviewLabel}: ${stage.id}`);
  const retainFailure=async failure=>{
   const chosen=await bestReviewedVisual(failure.attempts??[]);
   provenance.unapprovedTest=true;provenance[stage.id]={...failure,selectedBest:true,selectedAttempt:chosen.attempt.attempt,selectionReason:chosen.reason};
   provenance.failedReviews=[...new Set([...(provenance.failedReviews??[]),stage.id])];await save();return chosen.spec;
  };
  if(allowUnapproved){
   const inputHash=reviewFingerprint({spec:current,stage,context:reviewContext});
   const previous=await readJson(join(workdir,'reviews',stage.id,inputHash.slice(0,16),'failure.json')).catch(()=>null);
   if(previous?.attempts?.length&&(provenance.freezeVisualVersion||previous.attempts.length>=REVIEW_LIMITS.visual)){log(`Unapproved test: selecting best saved reviewed ${stage.id}`);return retainFailure(previous);}
  }
  const diagnostic=allowUnapproved&&provenance.freezeVisualVersion===true;
  try{return await runVisualReviewStage({spec:current,stage,workdir,context:{...reviewContext,...(diagnostic?{diagnostic:true}:{})},renderEvidence,measure,
   maxRenderedReviews:diagnostic?1:REVIEW_LIMITS.visual,
   review:(s,e,focus)=>reviewVisuals(ask,s,e.sheets,e.index,cat,provenance.thread??'',focus),
   repair:(s,r,focus,e,feedback)=>repairVisuals(ask,s,r,cat,focus,e.sheets,feedback),
   onResult:async r=>{provenance[stage.id]={...r,spec:undefined};if(!r.passed){provenance.unapprovedTest=true;provenance.failedReviews=[...new Set([...(provenance.failedReviews??[]),stage.id])];}await save();}});
  }catch(e){if(!allowUnapproved||!e.reviewFailure)throw e;return retainFailure(e.reviewFailure);}
 };
 for(const stage of VISUAL_REVIEW_STAGES.slice(0,-1))spec=await visualStage(spec,stage);
 await writeFile(join(workdir,'spec.reviewed.json'),JSON.stringify(spec,null,1));
 // 7. Spoken phrasing review, then generated-voice timing review with bounded retakes.
 log(`${reviewLabel}: delivery and timing reviews; ElevenLabs Adam at unchanged provider-default speed`);
 let voice;try{voice=await runVoiceReviews({text:spec.scenes.map(s=>s.say.trim()).join(' '),workdir,context:{...clientContext,narrationSpeed:'elevenlabs-default'},measure,
  narrate:(delivery,take)=>narrate(delivery,take,key,usage),
  reviewDelivery:text=>reviewNarrationDelivery(ask,text,record=>appendFile(join(workdir,'voice-delivery-attempts.jsonl'),JSON.stringify({at:new Date().toISOString(),...record})+'\n',{mode:0o600}),clients?'stop':'best'),
  reviewPacing:(text,delivery,metrics)=>reviewVoicePacing(ask,text,delivery,metrics),
  onResult:async r=>{provenance.voiceReview=r;if(!r.passed){provenance.unapprovedTest=true;provenance.failedReviews=[...new Set([...(provenance.failedReviews??[]),'voice-pacing-review'])];}await save();}});
 }catch(e){
  if(!allowUnapproved||!e.voiceFailure||!e.lastVoice)throw e;
  voice=e.lastVoice;provenance.unapprovedTest=true;provenance.voiceReview=e.voiceFailure;
  provenance.failedReviews=[...new Set([...(provenance.failedReviews??[]),'voice-pacing-review'])];await save();
 }
 const roughTotal=voice.total+2.2;
 const bed=process.env.QURIOZITY_MUSIC==='0'?null:await measure('music generation',()=>music(spec.musicBrief,roughTotal+1,key,usage)).catch(e=>{log(`music unavailable (${e.message}); continuing without a bed`);provenance.music='unavailable';return null;});
 const beat=bed?detectBeats(bed):null;if(beat){log(`beat grid ${beat.bpm} BPM, phase ${beat.phase}s, beat enters at ${beat.from}s`);provenance.beat=beat;}
 const timed=timeScenes(spec,voice,beat);spec={...timed.spec,...(beat?{beat}:{})};const total=timed.total;
 spec=await visualStage(spec,VISUAL_REVIEW_STAGES.at(-1));
 await writeFile(join(workdir,'spec.timed.json'),JSON.stringify(spec,null,1));
 // 8. Rebuild sound when visual timing or voice changes; an old cue cache is not review evidence.
 const soundInput=reviewFingerprint({spec,voice:provenance.voiceReview.outputHash,musicLevel:MUSIC_LEVEL});
 if((await readJson(join(workdir,'sound-input.json')).catch(()=>null))?.hash!==soundInput){
  for(const file of ['cues.designed.json','cues.final.json'])await rm(join(workdir,file),{force:true});
  await writeFile(join(workdir,'sound-input.json'),JSON.stringify({hash:soundInput}));
 }
 // Sound design + review
 const {autoCues}=await import('../../src/quriozity/cues.ts');
 const sfx=sfxLibrary(join(AUDIO_CACHE,'sfx'),key,{onUsage:usage,onReject:r=>log(`sfx rejected (musical): ${r.prompt}`)});
 const timeline=timelineText(spec);await writeFile(join(workdir,'timeline.txt'),timeline);
 const cueFile=join(workdir,'cues.designed.json');
 if(!await exists(cueFile)){
  const auto=autoCues(spec);
  const designed=ask?await measure('sound design',()=>gen.designSound(ask,timeline,auto,SFX_KINDS)):auto;
  // the answer moment: one tasteful hit on the final scene's first event or start
  await writeFile(cueFile,JSON.stringify(governCues(designed,total),null,1));
 }
 let cues=await readJson(cueFile);
 const finalCues=join(workdir,'cues.final.json');
 const audio=join(workdir,'mix.m4a');
 if(!await exists(finalCues)){
  log(`mix v1 (${cues.length} cues)`);
  const c1=await measure('mix calibration and effects preparation',()=>calibrateMix({voice,lead:timed.lead,cues,sfx,bed,total,out:audio},log));
  const stats=await mixStats(audio,cues,total,!!bed,c1.clarity);provenance.mixStatsV1=stats;await save();
  if(ask){log(`${reviewLabel}: sound review`);cues=governCues(await measure('sound review',()=>gen.reviewSound(ask,timeline,cues,stats)),total);}
  await writeFile(finalCues,JSON.stringify(cues,null,1));
 }
 cues=await readJson(finalCues);
 log(`final mix (${cues.length} cues)`);
 const cal=await measure('mix calibration and effects preparation',()=>calibrateMix({voice,lead:timed.lead,cues,sfx,bed,total,out:audio},log));
 provenance.mixLevels=cal.levels;provenance.mixCalibration=cal.history;provenance.musicLevel=cal.musicLevel;provenance.sfxRejectedAsMusical=sfx.rejected;
 provenance.mixStatsFinal=await mixStats(audio,cues,total,!!bed,cal.clarity);await save();
 // Cost reporting is informational and never stops a fully reviewed export.
 try{const {writeCostSummary}=await import('./costs.mjs');provenance.costEstimate=await writeCostSummary(workdir);await save();}
 catch(error){log(`cost report unavailable (${error.message}); recorded usage remains in usage.jsonl`);}
 // 9. picture
 log('render video');
 const silent=join(workdir,'video.mp4');
 await measure('final video rendering',()=>renderVideo(spec,silent));
 const privateTest=!!clients&&provenance.unapprovedTest;
 const finished=join(workdir,privateTest?'unapproved-test.mp4':'finished.mp4');
 const picture=['-c:v','copy',...(privateTest?['-metadata','title=UNAPPROVED PRIVATE TEST','-metadata',`comment=Failed reviews: ${(provenance.failedReviews??[]).join(', ')}. Private experiment only; never approved for publication.`]:provenance.failedReviews?.length?['-metadata',`comment=Best reviewed selection after limits. Unresolved reviews: ${provenance.failedReviews.join(', ')}.`]:[])];
 await measure('final audio video mux',()=>run('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',silent,'-i',audio,'-map','0:v','-map','1:a',...picture,'-c:a','copy','-t',total.toFixed(3),'-movflags','+faststart',finished]));
 for(const i of [0,1,2])await rm(`${audio}.stem${i}.wav`,{force:true});
 if(recordHistory&&!privateTest){const {topicKey}=await import('../../worker/quriozity-history.ts');const idea=provenance.idea??(provenance.plan?{topic:provenance.plan.topic,topicKey:provenance.topicKey}:{});
  await recordReel({at:new Date().toISOString(),title:spec.title,topic:idea.topic??spec.title,topicKey:idea.topicKey||topicKey(idea.topic??spec.title??''),summary:spec.scenes.map(s=>s.say).join(' ').slice(0,200),workdir});}
 log(`done: ${finished} (${total.toFixed(1)} s)`);
 return {finished,spec,provenance};
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const args=process.argv.slice(2);const workdir=args[0];if(!workdir)throw new Error('Usage: produce.mjs <workdir> [--topic "..."] [--spec file] [--history file]');
 const opt=k=>{const i=args.indexOf(k);return i>0?args[i+1]:undefined;};
 const history=opt('--history')?await readJson(opt('--history')):[];
 const {createReelSubscription}=await import('../reel-subscription.mjs');
 await produce(resolve(workdir),{topic:opt('--topic')??'',specFile:opt('--spec')?resolve(opt('--spec')):null,history,subscription:createReelSubscription()});
}
