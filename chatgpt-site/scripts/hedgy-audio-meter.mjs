#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {access,readFile,readdir,stat,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {SFX} from './audio/sfx-design.mjs';
import {synthesizeToFile} from './audio/synth.mjs';

const BANDS=[['sub <80',0,80],['low 80–250',80,250],['low-mid 250–800',250,800],['mid 800–2.5k',800,2500],['presence 2.5–6k',2500,6000],['air >6k',6000,24000]];
const FFT_SIZE=4096,HOP=2048,RATE=48000;
const CACHE=fileURLToPath(new URL('../.motion-cache/',import.meta.url));
const NEW_KINDS=new Set(['thump','knock','whump','sub','rustle','creak','clunk','slide','footfall','pluck','gulp','hum']);

function command(binary,args,options={}){
 const result=spawnSync(binary,args,{encoding:options.encoding??null,maxBuffer:options.maxBuffer??512*1024*1024});
 if(result.error)throw result.error;
 if(result.status!==0)throw new Error(`${binary} failed: ${(result.stderr??'').toString().trim().slice(-1000)}`);
 return options.encoding?result.stdout:result.stdout;
}

async function exists(path){try{await access(path);return true;}catch{return false;}}

function probe(path){
 return JSON.parse(command('ffprobe',['-v','error','-show_streams','-show_format','-of','json',path],{encoding:'utf8'}));
}

function decode(path,streamIndex,filter=''){
 const args=['-hide_banner','-loglevel','error','-i',path];
 if(streamIndex!==undefined)args.push('-map',`0:a:${streamIndex}`);
 else args.push('-map','0:a:0');
 args.push('-vn','-ac','1','-ar',String(RATE));
 if(filter)args.push('-af',filter);
 args.push('-f','f32le','pipe:1');
 const buffer=command('ffmpeg',args,{maxBuffer:1024*1024*1024});
 return new Float32Array(buffer.buffer,buffer.byteOffset,Math.floor(buffer.byteLength/4));
}

function fft(real,imag){
 const n=real.length;
 for(let i=1,j=0;i<n;i++){
  let bit=n>>1;
  for(;j&bit;bit>>=1)j^=bit;
  j^=bit;
  if(i<j){[real[i],real[j]]=[real[j],real[i]];[imag[i],imag[j]]=[imag[j],imag[i]];}
 }
 for(let size=2;size<=n;size<<=1){
  const angle=-2*Math.PI/size,wr0=Math.cos(angle),wi0=Math.sin(angle),half=size>>1;
  for(let start=0;start<n;start+=size){
   let wr=1,wi=0;
   for(let k=0;k<half;k++){
    const even=start+k,odd=even+half,tr=wr*real[odd]-wi*imag[odd],ti=wr*imag[odd]+wi*real[odd];
    real[odd]=real[even]-tr;imag[odd]=imag[even]-ti;real[even]+=tr;imag[even]+=ti;
    const nextWr=wr*wr0-wi*wi0;wi=wr*wi0+wi*wr0;wr=nextWr;
   }
  }
 }
}

function spectrum(samples){
 const window=new Float64Array(FFT_SIZE);
 let totalWindowEnergy=0;
 for(let i=0;i<FFT_SIZE;i++){window[i]=0.5-0.5*Math.cos(2*Math.PI*i/(FFT_SIZE-1));totalWindowEnergy+=window[i]*window[i];}
 const bandPower=new Float64Array(BANDS.length),real=new Float64Array(FFT_SIZE),imag=new Float64Array(FFT_SIZE);
 let sumPower=0,sumWeightedHz=0,frames=0;
 for(let start=0;start+FFT_SIZE<=samples.length;start+=HOP){
  for(let i=0;i<FFT_SIZE;i++){real[i]=samples[start+i]*window[i];imag[i]=0;}
  fft(real,imag);
  for(let k=1;k<=FFT_SIZE/2;k++){
   const hz=k*RATE/FFT_SIZE,power=(real[k]*real[k]+imag[k]*imag[k])/(FFT_SIZE*totalWindowEnergy)*(k===FFT_SIZE/2?1:2),frequency=hz;
   if(power<=0)continue;
   sumPower+=power;sumWeightedHz+=frequency*power;
   for(let b=0;b<BANDS.length;b++)if(frequency>=BANDS[b][1]&&frequency<BANDS[b][2])bandPower[b]+=power;
  }
  frames++;
 }
 if(!frames){
  for(let i=0;i<samples.length;i++){const power=samples[i]*samples[i];sumPower+=power;}
  frames=1;
 }
 return {centroid:sumPower?sumWeightedHz/sumPower:0,bands:Array.from(bandPower,power=>10*Math.log10(Math.max(1e-15,power/frames))),frames};
}

function percentile(values,p){
 const sorted=[...values].sort((a,b)=>a-b);
 return sorted[Math.min(sorted.length-1,Math.max(0,Math.floor((sorted.length-1)*p))) ]??0;
}

/** Estimate average event T20 and extrapolated T60-ish from short RMS frames. */
function decaySummary(samples){
 const frame=480,hop=480,rate=RATE/hop,rms=[];
 for(let start=0;start+frame<=samples.length;start+=hop){
  let power=0;for(let i=0;i<frame;i++)power+=samples[start+i]*samples[start+i];
  rms.push(Math.sqrt(power/frame));
 }
 if(rms.length<8)return {events:0,meanT20:0,meanT60:0};
 const sorted=[...rms].sort((a,b)=>a-b),floor=percentile(rms,.2),median=percentile(rms,.5),mad=percentile(rms.map(value=>Math.abs(value-median)),.5);
 const threshold=Math.max(floor*1.65,median+mad*2.4,1e-5),novelty=rms.map((value,index)=>Math.max(0,value-(rms[index-2]??0)));
 const noveltyMedian=percentile(novelty,.5),noveltyMad=percentile(novelty.map(value=>Math.abs(value-noveltyMedian)),.5),onsetThreshold=Math.max(noveltyMedian+noveltyMad*2.8,percentile(novelty,.9));
 const candidates=[];
 for(let i=2;i<rms.length-2;i++)if(rms[i]>=threshold&&novelty[i]>=onsetThreshold&&rms[i]>=rms[i-1]&&rms[i]>rms[i+1])candidates.push(i);
 const onsets=[];
 for(const index of candidates){
  if(onsets.length&&index-onsets.at(-1)<Math.round(.14*rate)){
   if(novelty[index]>novelty[onsets.at(-1)])onsets[onsets.length-1]=index;
  }else onsets.push(index);
 }
 const decays=[];
 for(let event=0;event<onsets.length;event++){
  const onset=onsets[event],next=onsets[event+1]??rms.length,searchEnd=Math.min(next,onset+Math.round(1.5*rate));
  const peak=Math.max(...rms.slice(onset,Math.min(searchEnd,onset+Math.round(.06*rate))));
  if(!peak)continue;
  const crossing=rms.findIndex((value,index)=>index>=onset+3&&index<=searchEnd&&value<=peak*.1);
  const end=crossing<0?searchEnd:crossing;decays.push((end-onset)/rate);
 }
 const meanT20=decays.length?decays.reduce((a,b)=>a+b,0)/decays.length:0;
 return {events:onsets.length,meanT20,meanT60:meanT20*3};
}

function loudness(path,streamIndex){
 const args=['-hide_banner','-nostats','-i',path];
 if(streamIndex!==undefined)args.push('-map',`0:a:${streamIndex}`);
 else args.push('-map','0:a:0');
 args.push('-af','loudnorm=I=-14:TP=-1:LRA=11:print_format=json','-f','null','-');
 const result=spawnSync('ffmpeg',args,{encoding:'utf8',maxBuffer:4*1024*1024});
 if(result.error)throw result.error;
 if(result.status!==0)throw new Error(`ffmpeg loudness meter failed: ${result.stderr.trim().slice(-1000)}`);
 const json=[...result.stderr.matchAll(/\{[\s\S]*?\}/g)].map(match=>{try{return JSON.parse(match[0]);}catch{return null;}}).filter(Boolean).at(-1);
 if(!json)throw new Error('Could not parse loudnorm measurements from ffmpeg.');
 return {integrated:json.input_i,truePeak:json.input_tp,lra:json.input_lra};
}

function bandsTable(label,measurement){
 const rows=BANDS.map(([name],index)=>[name,`${measurement.spectrum.bands[index].toFixed(1)} dBFS`]);
 return `${label}: centroid ${measurement.spectrum.centroid.toFixed(0)} Hz, LUFS ${measurement.loudness.integrated}, true peak ${measurement.loudness.truePeak} dBTP, LRA ${measurement.loudness.lra} LU\n  ${rows.map(([band,value])=>`${band.padEnd(18)} ${value}`).join('\n  ')}`;
}

function audioStreamIndex(info,name){
 const streams=info.streams.filter(stream=>stream.codec_type==='audio');
 const found=streams.find(stream=>String(stream.tags?.title??'').toLowerCase().includes(name));
 return found?streams.indexOf(found):undefined;
}

async function measure(path,streamIndex,filter=''){
 const samples=decode(path,streamIndex,filter),result={spectrum:spectrum(samples),loudness:loudness(path,streamIndex),decay:decaySummary(samples)};
 return result;
}

async function libraryReport(before=false){
 const scratch=await mkdtemp(join(tmpdir(),'hedgy-sfx-library-'));
 try{
  const files=await readdir(CACHE).catch(()=>[]),results=[];
  for(const [kind,design] of Object.entries(SFX)){
   const sourcePrefix=design.source==='eleven'?'sfx':'synth',candidates=[];
   for(const extension of ['wav','mp3']){
    for(const name of files)if(name.startsWith(`${sourcePrefix}-${kind}-`)&&name.endsWith(`.${extension}`))candidates.push(join(CACHE,name));
    if(candidates.length)break;
   }
   const dated=[];
   for(const path of candidates)dated.push({path,mtime:(await stat(path)).mtimeMs});
   dated.sort((a,b)=>before?a.mtime-b.mtime:b.mtime-a.mtime);
   let path=dated[0]?.path;
   if(before&&!path){results.push({kind,new:NEW_KINDS.has(kind),missing:!NEW_KINDS.has(kind)});continue;}
   if(!before&&design.source!=='eleven')path=undefined;
   if(!path){path=join(scratch,`${kind}.wav`);await synthesizeToFile(kind,0,design.seconds,path);}
   const filter=`lowpass=f=${before?9200:Math.min(18000,design.lowpass??9200)}`;
   const pcm=decode(path,undefined,filter),spec=spectrum(pcm);
   results.push({kind,tier:design.tier??'mid',centroid:spec.centroid,bands:spec.bands,new:false});
  }
  console.log(`SFX library spectral table (${before?'retained pre-change cache sample':'current cache or synth recipe'}; band values are dBFS RMS):`);
  console.log(['kind\ttier\tcentroid Hz',...BANDS.map(([name])=>name)].join('\t'));
  for(const row of results)console.log(row.new?`${row.kind}\tNEW\t—\t—\t—\t—\t—\t—\t—`:row.missing?`${row.kind}\tMISSING\t—\t—\t—\t—\t—\t—\t—`:[row.kind,row.tier,row.centroid.toFixed(0),...row.bands.map(value=>value.toFixed(1))].join('\t'));
 }finally{await rm(scratch,{recursive:true,force:true});}
}

async function variantReport(){
 const scratch=await mkdtemp(join(tmpdir(),'hedgy-sfx-variants-'));
 try{
  console.log('New procedural variant A/B (centroid Hz and dBFS RMS bands):');
  console.log(['kind','variant','centroid Hz',...BANDS.map(([name])=>name)].join('\t'));
  for(const kind of NEW_KINDS){
   const design=SFX[kind];
   for(let variant=0;variant<design.variants;variant++){
    const path=join(scratch,`${kind}-${variant}.wav`);
    await synthesizeToFile(kind,variant,design.seconds,path);
    const spec=spectrum(decode(path,undefined,`lowpass=f=${design.lowpass??9200}`));
    console.log([kind,variant,spec.centroid.toFixed(0),...spec.bands.map(value=>value.toFixed(1))].join('\t'));
   }
  }
 }finally{await rm(scratch,{recursive:true,force:true});}
}

if(process.argv[2]==='--library'||process.argv[2]==='--library-before'){
 await libraryReport(process.argv[2]==='--library-before');
 process.exit(0);
}
if(process.argv[2]==='--variants'){
 await variantReport();
 process.exit(0);
}

const input=process.argv[2];
if(!input)throw new Error('Usage: node scripts/hedgy-audio-meter.mjs <mp4|wav|m4a>');
const info=probe(input),full=await measure(input),stemPath=await exists(`${input}.stems.mka`)?`${input}.stems.mka`:null;
let cueInfo=null;
for(const sidecar of [`${input}.audio.json`,input.replace(/\.[^.]+$/,'')+'.audio.json']){
 if(await exists(sidecar)){try{cueInfo=JSON.parse(await readFile(sidecar,'utf8'));break;}catch{}}
}
const fullStream=info.streams.find(stream=>stream.codec_type==='audio');
const duration=Number(fullStream?.duration??info.format?.duration??0);
const detectedRate=full.decay.events&&duration?full.decay.events/duration:null;
const cuesPerSecond=cueInfo?.cuesPerSecond??detectedRate;
console.log(`Hedgy audio meter — ${input}`);
console.log(bandsTable('Full mix',full));
if(cueInfo?.style)console.log(`\nStyle: ${cueInfo.style}${cueInfo.musicKey?`, detected bed key ${cueInfo.musicKey.name} ${cueInfo.musicKey.mode} (${cueInfo.musicKey.confidence})`:''}`);
const rows=[];
const addRow=(name,measurement,options={})=>rows.push({name,measurement,...options});
addRow('Mix',full,{cueRate:cuesPerSecond,tonalShare:null,referenceProxy:!cueInfo&&!stemPath&&!input.endsWith('.mka')});
if(stemPath){
 const stems=probe(stemPath),audio=stems.streams.filter(stream=>stream.codec_type==='audio');
 for(let index=0;index<audio.length;index++){
  const stream=audio[index],title=String(stream.tags?.title??`Stem ${index+1}`),name=title.toLowerCase().includes('voice')?'Voice':title.toLowerCase().includes('sfx')?'SFX':title.toLowerCase().includes('music')?'Music':title;
  const measurement=await measure(stemPath,index);
  addRow(name,measurement,{cueRate:name==='SFX'?cuesPerSecond:null,tonalShare:name==='SFX'?cueInfo?.tonalAccentShare:null});
 }
}else if(input.endsWith('.mka')){
 const audio=info.streams.filter(stream=>stream.codec_type==='audio');
 for(let index=0;index<audio.length;index++){
  const stream=audio[index],title=String(stream.tags?.title??`Stem ${index+1}`);
  addRow(title,await measure(input,index),{cueRate:null,tonalShare:null});
 }
}else console.log('\nStems: not found; render with MOTION_AUDIO_STEMS=1 to create sibling .stems.mka.');

console.log('\nPer-stem comparison (band energies in dBFS RMS; event decay is T20 with T60-ish = 3×T20):');
console.log(['Stem','Centroid Hz',...BANDS.map(([name])=>name),'mean T20 s','T60-ish s','tonal accent share','cues/onsets s','LUFS','true peak dBTP'].join('\t'));
for(const row of rows){
 const m=row.measurement,decay=m.decay,hasEventEstimate=row.name==='Mix'||row.name==='SFX'||row.referenceProxy;
 console.log([row.name,m.spectrum.centroid.toFixed(0),...m.spectrum.bands.map(value=>value.toFixed(1)),hasEventEstimate?decay.meanT20.toFixed(2):'—',hasEventEstimate?decay.meanT60.toFixed(2):'—',row.tonalShare===null||row.tonalShare===undefined?'—':`${(row.tonalShare*100).toFixed(1)}%`,row.cueRate===null||row.cueRate===undefined?'—':`${row.referenceProxy?'≈':''}${Number(row.cueRate).toFixed(2)}`,m.loudness.integrated,m.loudness.truePeak].join('\t'));
}
const cueCountLabel=cueInfo?.cueCount===undefined?(full.decay.events?`≈${full.decay.events} detected onsets`:'unknown'):`${cueInfo.estimated?'≈':''}${cueInfo.cueCount}`;
console.log(`\nCues: ${cueCountLabel}${cuesPerSecond===null?'':`, ${Number(cuesPerSecond).toFixed(2)} cues/s`}${duration?` over ${duration.toFixed(2)} s`:''}${cueInfo?.estimated?' (reconstructed from retained legacy cues)':''}`);
