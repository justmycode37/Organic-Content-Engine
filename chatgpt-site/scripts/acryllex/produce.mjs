// ACRYLLEX producer: the whole reel, every creative step on gpt-6.1-sol (medium).
//   node --env-file=.env.motion scripts/acryllex/produce.mjs <workdir> [--topic "Why we dream"] [--spec spec.json] [--history history.json]
// Layers: ideation → script → fact check → storyboard → storyboard review (worker/acryllex-generation.ts)
//         → render frames → VISUAL REVIEW (Sol sees the frames) → narration (ElevenLabs Adam, word timings)
//         → SOUND DESIGN (Sol cue sheet, ElevenLabs SFX) → mix → SOUND REVIEW (Sol + measured stats) → final mix → video.
// Every step is cached in <workdir>, so a rerun resumes instead of paying twice.
import {createHash} from 'node:crypto';
import {access,mkdir,readFile,writeFile,rm,appendFile} from 'node:fs/promises';
import {spawn,execFileSync,spawnSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {stills,renderVideo} from './render.mjs';
import {sfxLibrary,SFX_KINDS} from './sfx.mjs';

const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const CACHE=join(ROOT,'.acryllex-cache');
const VOICE_ID=process.env.ACRYLLEX_VOICE_ID?.trim()||'s3TPKV1kjDlVtZbl4Ksh'; // Adam, same narrator as Hedgy
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0,20);
const exists=p=>access(p).then(()=>true,()=>false);
const readJson=async p=>JSON.parse(await readFile(p,'utf8'));
function run(bin,args){return new Promise((res,rej)=>{const c=spawn(bin,args,{stdio:['ignore','ignore','pipe']});let e='';c.stderr.on('data',d=>e=(e+d).slice(-3000));c.once('error',rej);c.once('close',n=>n===0?res():rej(new Error(`${bin} exited ${n}: ${e}`)));});}
const log=(...a)=>console.log(`[acryllex ${new Date().toISOString().slice(11,19)}]`,...a);

async function eleven(path,body,key,usage){
 const r=await fetch(`https://api.elevenlabs.io${path}`,{method:'POST',headers:{'xi-api-key':key,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(180000)});
 await usage({provider:'elevenlabs',endpoint:path.split('?')[0],status:r.status});
 if(!r.ok)throw new Error(`ElevenLabs ${path.split('?')[0]} failed (${r.status})`);return r;
}

/** Whole narration in one take with per-word timing (natural prosody across scene cuts). */
async function narrate(text,key,usage){
 const model='eleven_multilingual_v2',id=hash({text,VOICE_ID,model,v:1}),audio=join(CACHE,`voice-${id}.wav`),meta=join(CACHE,`voice-${id}.json`);
 if(!(await exists(audio))||!(await exists(meta))){
  let data,pcm=true;
  try{data=await (await eleven(`/v1/text-to-speech/${VOICE_ID}/with-timestamps?output_format=pcm_44100`,{text,model_id:model},key,usage)).json();}
  catch{pcm=false;try{data=await (await eleven(`/v1/text-to-speech/${VOICE_ID}/with-timestamps?output_format=mp3_44100_192`,{text,model_id:model},key,usage)).json();}catch{data=await (await eleven(`/v1/text-to-speech/${VOICE_ID}/with-timestamps?output_format=mp3_44100_128`,{text,model_id:model},key,usage)).json();}}
  const a=data.alignment??data.normalized_alignment;if(!data.audio_base64||!a)throw new Error('No narration audio/timing');
  const words=[];let cur=null;
  a.characters.forEach((ch,i)=>{if(/\s/.test(ch)){if(cur){words.push(cur);cur=null;}return;}cur??={text:'',start:a.character_start_times_seconds[i],end:0};cur.text+=ch;cur.end=a.character_end_times_seconds[i];});
  if(cur)words.push(cur);
  const raw=Buffer.from(data.audio_base64,'base64');
  if(pcm){const tmp=`${audio}.pcm`;await writeFile(tmp,raw);await run('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','s16le','-ar','44100','-ac','1','-i',tmp,'-ar','48000','-ac','2',audio]);await rm(tmp,{force:true});}
  else{const tmp=`${audio}.mp3`;await writeFile(tmp,raw);await run('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',tmp,'-ar','48000','-ac','2',audio]);await rm(tmp,{force:true});}
  await writeFile(meta,JSON.stringify({words}));
 }
 const total=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',audio],{encoding:'utf8'}).trim());
 return {audio,words:(await readJson(meta)).words,total};
}

/** Split the take into scenes at the pauses; each scene gets its words relative to its own start. */
function timeScenes(spec,voice){
 const counts=spec.scenes.map(s=>s.say.split(/\s+/).filter(Boolean).length);
 const n=counts.reduce((a,b)=>a+b,0);const W=voice.words;
 if(W.length!==n)log(`warning: ${W.length} spoken words for ${n} written; mapping proportionally`);
 const map=i=>W[Math.min(W.length-1,Math.round(i*(W.length-1)/Math.max(1,n-1)))];
 const LEAD=0.35;// a breath of picture before the first word
 const bounds=[0];let idx=0;
 for(let i=0;i<counts.length-1;i++){idx+=counts[i];const a=map(idx-1),b=map(idx);bounds.push(LEAD+(a.end+b.start)/2);}
 bounds.push(LEAD+Math.max(voice.total,W.at(-1).end)+1.4);
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
 const out=[];for(const c of sorted){const near=out.filter(o=>Math.abs(o.at-c.at)<0.12);if(near.length){if((c.gain??0.6)>(near[0].gain??0.6)){out.splice(out.indexOf(near[0]),1);out.push(c);}continue;}out.push(c);}
 const max=Math.ceil(total*1.7);if(out.length>max){out.sort((a,b)=>(b.gain??0.6)-(a.gain??0.6));out.length=max;}
 return out.sort((a,b)=>a.at-b.at);
}

async function music(brief,seconds,key,usage){
 const prompt=`Instrumental only, no vocals. ${brief||'Calm, curious, cinematic ambient-electronic documentary score with soft pulses and warm pads that gently builds toward the answer.'} Leave space for a narrator, soft dynamics, premium film-score quality, ends with a gentle resolved final chord.`;
 const length=Math.min(150,Math.max(15,Math.ceil((seconds+2)/5)*5));
 const file=join(CACHE,`music-${hash({prompt,length})}.mp3`);
 if(!await exists(file)){const r=await eleven('/v1/music?output_format=mp3_44100_128',{prompt,music_length_ms:length*1000,force_instrumental:true},key,usage);await writeFile(file,Buffer.from(await r.arrayBuffer()));}
 return file;
}

async function mix({voice,lead,cues,sfx,bed,total,out,stems}){
 const inputs=['-i',voice.audio],filters=[`[0:a]aresample=48000,adelay=${Math.round(lead*1000)}:all=1,highpass=f=70,acompressor=threshold=0.18:ratio=2:attack=8:release=150:makeup=1.2,apad=whole_dur=${total.toFixed(3)},atrim=0:${total.toFixed(3)}[voice]`];
 const fx=[];
 for(const [i,c] of cues.entries()){
  const file=await sfx.clip(c);inputs.push('-i',file);const k=i+1;
  const pan=[-0.18,0,0.18][i%3];
  filters.push(`[${k}:a]aresample=48000,aformat=channel_layouts=stereo,highpass=f=30,lowpass=f=11000,stereotools=balance_out=${pan},volume=${(0.62*(c.gain??0.6)).toFixed(3)},adelay=${Math.round(c.at*1000)}:all=1[f${k}]`);fx.push(`[f${k}]`);
 }
 filters.push(fx.length?`${fx.join('')}amix=inputs=${fx.length}:normalize=0:dropout_transition=0,apad=whole_dur=${total.toFixed(3)},atrim=0:${total.toFixed(3)}[fxdry]`:`anullsrc=channel_layout=stereo:sample_rate=48000,atrim=0:${total.toFixed(3)}[fxdry]`);
 filters.push('[fxdry]asplit=2[fxa][fxb]','[fxb]aecho=0.8:0.35:60|110|170:0.25|0.16|0.1,lowpass=f=6000,volume=0.5[fxwet]','[fxa][fxwet]amix=inputs=2:normalize=0[fxsum]');
 filters.push('[voice]asplit=3[say][key1][key2]','[fxsum][key1]sidechaincompress=threshold=0.06:ratio=2.2:attack=4:release=180[fx]');
 const buses=['[say]','[fx]'];
 if(bed){const m=cues.length+1;inputs.push('-i',bed);filters.push(`[${m}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${total.toFixed(3)},loudnorm=I=-22:TP=-2:LRA=9,volume=0.5,afade=t=in:st=0:d=0.8,afade=t=out:st=${Math.max(0,total-1.6).toFixed(3)}:d=1.6,apad=whole_dur=${total.toFixed(3)}[bedraw]`,'[bedraw][key2]sidechaincompress=threshold=0.04:ratio=3.5:attack=15:release=260[bed]');buses.push('[bed]');}
 else filters.push('[key2]anullsink');
 const labels=stems?buses.map((b,i)=>{filters.push(`${b}asplit=2[m${i}][s${i}]`);return `[m${i}]`;}):buses;
 filters.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0:dropout_transition=0,alimiter=limit=0.89:attack=4:release=80:level=disabled,loudnorm=I=-14:TP=-1.5:LRA=9[out]`);
 const graph=`${out}.filter`;await writeFile(graph,filters.join(';\n'));
 const args=['-hide_banner','-loglevel','error','-y',...inputs,'-filter_complex_script',graph,'-map','[out]','-c:a','aac','-b:a','320k','-ar','48000',out];
 if(stems)buses.forEach((_,i)=>args.push('-map',`[s${i}]`,'-c:a','pcm_s16le',`${out}.stem${i}.wav`));
 await run('ffmpeg',args);await rm(graph,{force:true});
}

async function mixStats(out,cues,total,hasBed){
 const vol=f=>spawnSync('ffmpeg',['-hide_banner','-i',f,'-af','volumedetect','-f','null','-'],{encoding:'utf8'}).stderr??'';
 const pick=(t,k)=>Number((new RegExp(`${k}: (-?[\\d.]+)`).exec(t)??[])[1]);
 const s=[0,1,...(hasBed?[2]:[])].map(i=>vol(`${out}.stem${i}.wav`));
 const names=['voice','sfx','music'];
 const parts=s.map((t,i)=>`${names[i]} mean ${pick(t,'mean_volume')} dB max ${pick(t,'max_volume')} dB`);
 const kinds={};for(const c of cues)kinds[c.kind??'custom']=(kinds[c.kind??'custom']??0)+1;
 return `${parts.join('; ')}; ${cues.length} cues over ${total.toFixed(1)} s (${(cues.length/total).toFixed(2)}/s); by kind ${JSON.stringify(kinds)}`;
}

export async function produce(workdir,{topic='',specFile=null,history=[]}={}){
 const openai=process.env.OPENAI_API_KEY?.trim(),key=process.env.ELEVENLABS_API_KEY?.trim();
 if(!key)throw new Error('Set ELEVENLABS_API_KEY');
 await mkdir(workdir,{recursive:true});await mkdir(CACHE,{recursive:true});
 const usageFile=join(workdir,'usage.jsonl');const usage=e=>appendFile(usageFile,JSON.stringify({at:new Date().toISOString(),...e})+'\n');
 const gen=await import('../../worker/acryllex-generation.ts');
 const ask=openai?gen.solClient(openai,usage):null;
 const provenance=await readJson(join(workdir,'provenance.json')).catch(()=>({}));
 const save=()=>writeFile(join(workdir,'provenance.json'),JSON.stringify(provenance,null,1));
 // 1-5 story + storyboard
 const draft=join(workdir,'spec.draft.json');
 if(specFile&&!await exists(draft))await writeFile(draft,await readFile(specFile));
 if(!await exists(draft)){
  if(!ask)throw new Error('Set OPENAI_API_KEY');
  log('Sol: ideation → script → fact check → storyboard → storyboard review');
  const r=await gen.generateAcryllexReel({OPENAI_API_KEY:openai},topic,usage,history);
  Object.assign(provenance,r.provenance);await save();await writeFile(draft,JSON.stringify(r.spec,null,1));
 }
 let spec=await readJson(draft);
 // 6. visual review on rendered frames (two rounds max)
 const reviewed=join(workdir,'spec.reviewed.json');
 if(!await exists(reviewed)){
  for(let round=0;round<2&&ask;round++){
   const {sceneDuration}=await import('../../src/acryllex/spec.ts');
   const times=[],labels=[];let t=0;spec.scenes.forEach((s,i)=>{const d=sceneDuration(s);for(const k of [0.45,0.9]){times.push(+(t+d*k).toFixed(2));labels.push(`S${i+1} ${Math.round(k*100)}%`);}t+=d;});
   const sheets=[];
   for(let i=0;i<times.length;i+=12){const p=join(workdir,`review-r${round}-${i/12}.png`);await stills(spec,p,times.slice(i,i+12),0.24,labels.slice(i,i+12),6);sheets.push({mime:'image/png',base64:(await readFile(p)).toString('base64')});}
   log(`Sol: visual review round ${round+1} (${sheets.length} sheets)`);
   const r=await gen.reviewVisuals(ask,spec,sheets,`frames at 45% and 90% of each scene, labelled S<scene> <percent>; captions estimated`);
   provenance[`visualReview${round}`]=r.notes;await save();
   if(r.notes!=='applied')break;
   spec=r.spec;
  }
  await writeFile(reviewed,JSON.stringify(spec,null,1));
 }
 spec=await readJson(reviewed);
 // 7. narration + timing
 log('ElevenLabs: narration (Adam)');
 const voice=await narrate(spec.scenes.map(s=>s.say.trim()).join(' '),key,usage);
 const timed=timeScenes(spec,voice);spec=timed.spec;const total=timed.total;
 await writeFile(join(workdir,'spec.timed.json'),JSON.stringify(spec,null,1));
 // 8. sound design + review
 const {autoCues}=await import('../../src/acryllex/cues.ts');
 const sfx=sfxLibrary(join(CACHE,'sfx'),key,{cap:Number(process.env.ACRYLLEX_SFX_CAP)||60,onUsage:usage});
 const timeline=timelineText(spec);await writeFile(join(workdir,'timeline.txt'),timeline);
 const cueFile=join(workdir,'cues.designed.json');
 if(!await exists(cueFile)){
  const auto=autoCues(spec);
  const designed=ask?await gen.designSound(ask,timeline,auto,SFX_KINDS):auto;
  // the answer moment: one tasteful hit on the final scene's first event or start
  await writeFile(cueFile,JSON.stringify(governCues(designed,total),null,1));
 }
 let cues=await readJson(cueFile);
 const bed=process.env.ACRYLLEX_MUSIC==='0'?null:await music(spec.musicBrief,total,key,usage);
 const finalCues=join(workdir,'cues.final.json');
 const audio=join(workdir,'mix.m4a');
 if(!await exists(finalCues)){
  log(`mix v1 (${cues.length} cues)`);
  await mix({voice,lead:timed.lead,cues,sfx,bed,total,out:audio,stems:true});
  const stats=await mixStats(audio,cues,total,!!bed);provenance.mixStatsV1=stats;await save();
  if(ask){log('Sol: sound review');cues=governCues(await gen.reviewSound(ask,timeline,cues,stats),total);}
  await writeFile(finalCues,JSON.stringify(cues,null,1));
 }
 cues=await readJson(finalCues);
 log(`final mix (${cues.length} cues)`);
 await mix({voice,lead:timed.lead,cues,sfx,bed,total,out:audio,stems:true});
 provenance.mixStatsFinal=await mixStats(audio,cues,total,!!bed);await save();
 // 9. picture
 log('render video');
 const silent=join(workdir,'video.mp4');
 await renderVideo(spec,silent);
 const finished=join(workdir,'finished.mp4');
 await run('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',silent,'-i',audio,'-map','0:v','-map','1:a','-c:v','copy','-c:a','copy','-t',total.toFixed(3),'-movflags','+faststart',finished]);
 for(const i of [0,1,2])await rm(`${audio}.stem${i}.wav`,{force:true});
 log(`done: ${finished} (${total.toFixed(1)} s)`);
 return {finished,spec,provenance};
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const args=process.argv.slice(2);const workdir=args[0];if(!workdir)throw new Error('Usage: produce.mjs <workdir> [--topic "..."] [--spec file] [--history file]');
 const opt=k=>{const i=args.indexOf(k);return i>0?args[i+1]:undefined;};
 const history=opt('--history')?await readJson(opt('--history')):[];
 await produce(resolve(workdir),{topic:opt('--topic')??'',specFile:opt('--spec')?resolve(opt('--spec')):null,history});
}
