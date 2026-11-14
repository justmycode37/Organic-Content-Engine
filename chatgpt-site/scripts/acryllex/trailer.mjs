// ACRYLLEX trailer: a beat-cut showcase of the library — realistic scanned / engineering objects from every domain,
// with every enter / exit / idle / fx / morph / transition, with an ElevenLabs trailer
// score and note-free SFX.
//   node --env-file=.env.motion scripts/acryllex/trailer.mjs <out.mp4> [--stills sheet.png]
import {createHash} from 'node:crypto';
import {access,mkdir,writeFile,rm} from 'node:fs/promises';
import {spawn,spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {renderVideo,stills} from './render.mjs';
import {sfxLibrary} from './sfx.mjs';
import {autoCues} from '../../src/acryllex/cues.ts';

const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const CACHE=join(ROOT,'.acryllex-cache');
const [out,...flags]=process.argv.slice(2);
if(!out)throw new Error('Usage: trailer.mjs <out.mp4> [--stills sheet.png] [--silent]');
const stillsOut=flags.includes('--stills')?flags[flags.indexOf('--stills')+1]:null;
const key=process.env.ELEVENLABS_API_KEY;
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0,20);
const exists=p=>access(p).then(()=>true,()=>false);
function run(bin,args){return new Promise((res,rej)=>{const c=spawn(bin,args,{stdio:['ignore','ignore','pipe']});let e='';c.stderr.on('data',d=>e=(e+d).slice(-3000));c.once('error',rej);c.once('close',n=>n===0?res():rej(new Error(`${bin} exited ${n}: ${e}`)));});}

// ── score: cinematic trailer at 120 BPM (beat 0.5 s, bar 2 s) ───────────────────────────────────────────────
const BPM=120,BEAT=60/BPM;
const PLAN=[ // [name, bars, styles]
 ['intro',3,'dark atmospheric intro, deep sub pulse, ticking percussion, low drones swelling, tension'],
 ['build',2,'rising noise riser and snare roll accelerating into the drop'],
 ['drop',10,'massive cinematic hit then full energy hybrid trailer groove: huge drums, driving distorted synth bass, epic brass stabs, pulsing arpeggio'],
 ['breakdown',2,'drums stop, only a heartbeat kick pulse and a wide dark pad'],
 ['rise',3,'tension rises again, accelerating drums, riser, staccato strings'],
 ['finale',4,'final massive braam hit, full orchestra and synths, triumphant, ends on one huge sustained hit decaying to silence'],
];
const TOTAL_BEATS=PLAN.reduce((n,p)=>n+p[1]*4,0),TOTAL=TOTAL_BEATS*BEAT;
async function score(){
 const plan={positive_global_styles:['epic cinematic trailer','hybrid orchestral electronic',`${BPM} bpm`,'4/4','minor key','instrumental'],negative_global_styles:['vocals','lyrics','lo-fi','acoustic guitar'],
  sections:PLAN.map(([name,bars,styles])=>({section_name:name,positive_local_styles:styles.split(', '),negative_local_styles:[],duration_ms:Math.round(bars*4*BEAT*1000),lines:[]}))};
 const file=join(CACHE,`music-trailer-${hash(plan)}.mp3`);
 if(await exists(file))return file;
 if(!key)return null;
 let r=await fetch('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128',{method:'POST',headers:{'xi-api-key':key,'content-type':'application/json'},body:JSON.stringify({composition_plan:plan})});
 if(!r.ok){console.error(`composition plan rejected (${r.status}): ${(await r.text()).slice(0,300)}; using a prompt`);
  r=await fetch('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128',{method:'POST',headers:{'xi-api-key':key,'content-type':'application/json'},body:JSON.stringify({force_instrumental:true,music_length_ms:Math.round(TOTAL*1000),prompt:`Instrumental epic cinematic hybrid trailer music, exactly ${BPM} BPM, 4/4. ${PLAN.map(([n,b,s],i)=>`${n} (${PLAN.slice(0,i).reduce((t,p)=>t+p[1]*4*BEAT,0)}s): ${s}`).join('. ')}.`})});}
 if(!r.ok)throw new Error(`ElevenLabs music failed (${r.status})`);
 await mkdir(CACHE,{recursive:true});await writeFile(file,Buffer.from(await r.arrayBuffer()));return file;
}

// ── picture ────────────────────────────────────────────────────────────────────────────────────────────────
const S=[];
const o=(id,model,more={})=>({id,model,enter:'none',idle:'none',...more});
const T=(text,style='headline',pos='top',at=0.1,more={})=>({text,style,pos,at,erase:false,...more});
const shot=(beats,hue,objects,{events=[],text=[],transition,camera={},light,ground}={})=>S.push({say:'.',hue,duration:beats*BEAT,camera:{angle:'three-quarter',fill:0.62,move:'static',screenY:0.56,...camera},objects,events,text,...(transition?{transition}:{}),...(light?{light}:{}),...(ground===false?{ground:false}:{})});
const b=n=>n*BEAT; // beats → seconds within a shot

// INTRO (16 beats)
shot(8,'blue',[o('e','earth',{enter:'from-black',enterAt:0.2,enterDur:2.5,idle:'turn'})],{camera:{move:'push',amount:1.2},text:[T('FROM A FIELD OF DOTS','mono',[0.5,0.82],b(3),{align:'center'})]});
shot(8,'white',[o('hb','hubble',{enter:'light-up',enterAt:0.1,idle:'spin-slow'})],{transition:'black',camera:{move:'orbit',amount:0.8},events:[{at:b(6),target:'hb',fx:'glint'}],text:[T('COMES THE REAL WORLD','mono',[0.5,0.82],b(2),{align:'center'})]});
// BUILD (4 beats): charge into the drop
shot(4,'cyan',[o('a','atom',{idle:'spin'})],{transition:'blink',camera:{move:'push',amount:1.6},events:[{at:0.05,target:'a',fx:'charge',dur:b(4)-0.1}]});
// DROP (40 beats): one real object, one trick per bar
shot(4,'azure',[o('sh','great-white-shark',{idle:'float'})],{transition:'flash',camera:{angle:'three-quarter',fill:0.58},events:[{at:0.02,target:'sh',fx:'shockwave'}],text:[T('ACRYLLEX','headline','top',0.02,{glitch:[0.02,b(3)],size:190,font:'oswald'})]});
shot(4,'amber',[o('r','saturn-v',{enter:'rise',enterAt:0})],{transition:'push-right',camera:{move:'crane',amount:1,fill:0.85},text:[T('ANY OBJECT','tag','top',0.05)]});
shot(4,'orange',[o('gi','masai-giraffe',{idle:'turn'})],{transition:'glitch',camera:{fill:0.8},events:[{at:b(1),target:'gi',fx:'scan'}]});
shot(4,'amber',[o('t','bengal-tiger',{enter:'materialize',enterAt:0,idle:'turn'})],{transition:'wipe',camera:{angle:'side',fill:0.7},events:[{at:b(2.5),target:'t',fx:'recoil',fxFrom:'right'}]});
shot(4,'green',[o('tr','mammoth-skeleton',{enter:'assemble',enterAt:0,idle:'turn'})],{events:[{at:b(2.5),target:'tr',fx:'shockwave'}],text:[T('ANY ERA','tag','top',0.1)]});
shot(4,'white',[o('wf','wright-flyer',{idle:'float'}),o('jet','passenger-airliner')],{transition:'push-right',camera:{angle:'high',fill:0.75},events:[{at:b(1),target:'wf',morph:'jet',morphStyle:'particles',dur:1.3}]});
shot(4,'cyan',[o('dn','dna',{enter:'assemble',enterAt:0,idle:'spin'})],{transition:'glitch',events:[{at:b(2.5),target:'dn',fx:'ripple'}],camera:{move:'orbit',amount:1}});
shot(4,'red',[o('c','sports-car',{enter:'slide-right',enterAt:0})],{transition:'cut',camera:{fill:0.7},events:[{at:b(2),target:'c',fx:'recoil',fxFrom:'left'},{at:b(3),target:'c',fx:'shake'}]});
shot(4,'violet',[o('ap','apollo-11-capsule',{idle:'turn'}),o('lm','apollo-lunar-module')],{transition:'flash',events:[{at:b(1),target:'ap',morph:'lm',morphStyle:'flip',dur:1}],text:[T('ANY CHANGE','tag','top',0.1)]});
shot(4,'amber',[o('ch','chimpanzee',{enter:'materialize',enterAt:0}),o('go','silverback-gorilla',{near:'ch',side:'right',gap:0.3,enter:'materialize',enterAt:b(1)})],{transition:'wipe',events:[{at:b(3),target:'go',hue:'red'}],camera:{move:'pull',amount:1}});
// BREAKDOWN (8 beats): the heart alone
shot(8,'red',[o('h','human-heart-model',{enter:'from-black',enterAt:0.1})],{transition:'black',events:[{at:b(1),target:'h',fx:'heartbeat',fxCount:3,dur:b(2)}],camera:{move:'push',amount:0.6,angle:'front'},text:[T('IN EVERY DOT','mono',[0.5,0.82],b(4),{align:'center'})]});
// RISE (12 beats): faster cuts
shot(2,'white',[o('mt','megalodon-tooth',{idle:'turn'})],{transition:'glitch',events:[{at:0.1,target:'mt',fx:'glitch'}]});
shot(2,'orange',[o('pr','perseverance-rover')],{events:[{at:0.1,target:'pr',fx:'shake',fxAmount:1.4}],camera:{angle:'high'}});
shot(2,'amber',[o('jw','james-webb',{idle:'spin-slow'})],{events:[{at:0.2,target:'jw',fx:'glint'}]});
shot(2,'white',[o('vm','venus-de-milo',{idle:'turn'})],{camera:{angle:'front'}});
shot(4,'blue',[o('bf','monarch-butterfly',{enter:'slide-left',enterAt:0,idle:'float'}),o('eg','flying-eagle')],{transition:'push-right',events:[{at:b(1.5),target:'bf',morph:'eg',morphStyle:'particles',dur:1.3}],camera:{move:'orbit-left',amount:1}});
// FINALE (16 beats)
shot(4,'white',[o('pn','concert-grand-piano',{idle:'turn'}),o('gt','electric-guitar')],{transition:'flash',events:[{at:0.02,target:'pn',fx:'shockwave',fxAmount:1.5},{at:b(2),target:'pn',morph:'gt',morphStyle:'fade',dur:0.8},{at:b(3),target:'gt',fx:'glint'}],camera:{move:'push',amount:1}});
shot(12,'blue',[o('sa','saturn',{enter:'materialize',enterAt:0,idle:'turn',exit:'to-black',exitAt:b(10.5),exitDur:b(1.5)})],{transition:'glitch',camera:{move:'orbit',amount:0.6,angle:'high'},events:[{at:0.05,target:'sa',fx:'shockwave',fxAmount:2}],
 text:[T('ACRYLLEX','headline','top',b(1),{glitch:[b(1),b(6)],size:200,font:'oswald'}),T('ANIMATION LIBRARY','mono',[0.5,0.2],b(2.5),{align:'center'}),T('REAL OBJECTS · REAL SCANS','mono',[0.5,0.84],b(4.5),{align:'center'})]});

const spec={version:1,series:'ACRYLLEX',title:'ACRYLLEX trailer',captions:false,scenes:S};
const beats=S.reduce((n,s)=>n+Math.round(s.duration/BEAT),0);
if(beats!==TOTAL_BEATS)throw new Error(`picture is ${beats} beats, score is ${TOTAL_BEATS}`);
await writeFile(out.replace(/\.mp4$/,'.json'),JSON.stringify(spec,null,1));
if(stillsOut){let t=0;const times=[],labels=[];S.forEach((s,i)=>{times.push(+(t+s.duration*0.7).toFixed(2));labels.push(`${i+1} ${s.objects[0].id}`);t+=s.duration;});await stills(spec,stillsOut,times,0.25,labels,7);console.log(`Wrote ${stillsOut}`);process.exit(0);}

const silent=out.replace(/\.mp4$/,'.silent.mp4');
const info=await renderVideo(spec,silent);console.log(`picture ${info.duration.toFixed(1)} s`);
const bed=await score();console.log(bed?`score ${bed}`:'no score (no key)');

// ── sound: auto cues from the picture + trailer hits on the structure ──────────────────────────────────────
const cues=autoCues(spec).filter(c=>c.kind!=='type'); // no typing clicks under a trailer
const at=beat=>beat*BEAT;
cues.push({at:at(16)-1.2,kind:'riser',gain:0.7,length:1.2},{at:at(20),kind:'hit',gain:1},{at:at(68)-1.2,kind:'riser',gain:0.6,length:1.2},{at:at(80),kind:'hit',gain:1},{at:at(84),kind:'hit',gain:0.8});
const sfx=key?sfxLibrary(join(CACHE,'sfx'),key):null;
const inputs=[],filters=[],fx=[];
if(sfx)for(const [i,c] of cues.sort((a,b)=>a.at-b.at).entries()){const f=await sfx.clip(c);if(!f)continue;const k=inputs.length/2;inputs.push('-i',f);
 filters.push(`[${k}:a]aresample=48000,aformat=channel_layouts=stereo,stereotools=balance_out=${[-0.2,0,0.2][i%3]},volume=${(0.55*(c.gain??0.6)).toFixed(3)},adelay=${Math.round(c.at*1000)}:all=1[f${k}]`);fx.push(`[f${k}]`);}
const buses=[];
if(fx.length){filters.push(`${fx.join('')}amix=inputs=${fx.length}:normalize=0:dropout_transition=0,apad=whole_dur=${TOTAL}[fxdry]`,'[fxdry]asplit=2[fa][fb]','[fb]aecho=0.8:0.4:70|140:0.22|0.12,lowpass=f=6000[fw]','[fa][fw]amix=inputs=2:normalize=0[fx]');buses.push('[fx]');}
if(bed){const m=inputs.length/2;inputs.push('-i',bed);filters.push(`[${m}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${TOTAL},loudnorm=I=-15:TP=-2:LRA=11,afade=t=out:st=${TOTAL-1.5}:d=1.5,apad=whole_dur=${TOTAL}[bed]`);buses.push('[bed]');}
if(!buses.length){await rm(out,{force:true});await run('ffmpeg',['-y','-i',silent,'-c','copy',out]);console.log(`Wrote ${out} (silent)`);process.exit(0);}
filters.push(`${buses.join('')}amix=inputs=${buses.length}:normalize=0,alimiter=limit=0.9:level=disabled,loudnorm=I=-14:TP=-1.5:LRA=11[out]`);
const graph=`${out}.filter`;await writeFile(graph,filters.join(';\n'));
const mixWav=out.replace(/\.mp4$/,'.mix.m4a');
await run('ffmpeg',['-hide_banner','-loglevel','error','-y',...inputs,'-filter_complex_script',graph,'-map','[out]','-c:a','aac','-b:a','320k','-t',String(TOTAL),mixWav]);await rm(graph,{force:true});
await run('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',silent,'-i',mixWav,'-map','0:v','-map','1:a','-c:v','copy','-c:a','copy','-shortest','-movflags','+faststart',out]);
await rm(mixWav,{force:true});
console.log(`Wrote ${out} (${S.length} shots, ${TOTAL.toFixed(1)} s, ${cues.length} sfx cues)`);
