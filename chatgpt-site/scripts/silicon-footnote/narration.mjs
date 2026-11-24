// Keep a speaker's phrasing across cuts. Alignment travels with each cached take.
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {existsSync,renameSync,openSync,writeSync,closeSync,linkSync,copyFileSync,readdirSync} from 'node:fs';
import {join,basename} from 'node:path';
import {save,read} from './editor.mjs';

export const TITAN_SETTINGS=Object.freeze({stability:0.2,similarity_boost:0.2});

const MODEL='eleven_flash_v2_5';
const RATE=44100;
const digest=text=>createHash('sha256').update(JSON.stringify(text)).digest('hex').slice(0,20);

function pcmHeader(bytes){
 const header=Buffer.alloc(44);
 header.write('RIFF');header.writeUInt32LE(bytes+36,4);header.write('WAVEfmt ',8);
 header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);
 header.writeUInt32LE(RATE,24);header.writeUInt32LE(RATE*2,28);header.writeUInt16LE(2,32);
 header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(bytes,40);
 return header;
}

function priorTakes(dir,voice,beats){
 const found=new Map();
 if(!dir)return found;
 const priorLines=new Set(read(join(dir,'alignment.json')).map(a=>a.text));
 const wanted=[...new Set(beats.map(b=>b.narration.trim()))].filter(text=>priorLines.has(text));
 for(const name of readdirSync(dir).filter(n=>/^passage-[a-f0-9]{20}\.json$/.test(n))){
  const file=join(dir,name),take=read(file);
  if(take.voice!==voice||take.model!==MODEL||JSON.stringify(take.voice_settings)!==JSON.stringify(TITAN_SETTINGS))continue;
  const text=take.alignment.characters.join('');
  if(name!=='passage-'+digest([voice,MODEL,TITAN_SETTINGS,text])+'.json')continue;
  for(const line of wanted){
   const pos=(' '+text+' ').indexOf(' '+line+' ');
   if(pos>=0)found.set(line,{file,first:[...text.slice(0,pos)].length});
  }
 }
 return found;
}

export async function narrate(dir,beats,voice,key,reuseDir){
 const prior=priorTakes(reuseDir,voice,beats);
 const lines=beats.map(b=>b.narration.trim()),segments=[];
 let group=[];
 function flush(){if(group.length){segments.push({lines:group});group=[];}}
 for(const line of lines){
  if(prior.has(line)){flush();segments.push({lines:[line],prior:prior.get(line)});}
  else{group.push(line);if(group.join(' ').length>=1150)flush();}
 }
 flush();
 const alignment=[],timing=[],provenance=[];
 const partial=join(dir,'voice.partial.wav'),fd=openSync(partial,'w');
 let bytes=0,lastFile='',pcm,take;
 try{
  writeSync(fd,pcmHeader(0));
  for(const [i,seg] of segments.entries()){
   const text=seg.lines.join(' ');
   const name=seg.prior?basename(seg.prior.file):'passage-'+digest([voice,MODEL,TITAN_SETTINGS,text])+'.json';
   const file=join(dir,name);
   if(!existsSync(file)&&seg.prior){
    try{linkSync(seg.prior.file,file);}catch(e){if(e.code!=='EXDEV')throw e;copyFileSync(seg.prior.file,file);}
   }
   if(!existsSync(file)){
    const resp=await fetch('https://api.elevenlabs.io/v1/text-to-speech/'+voice+'/with-timestamps?output_format=mp3_44100_128',{method:'POST',headers:{'xi-api-key':key,'content-type':'application/json'},body:JSON.stringify({text,model_id:MODEL,voice_settings:TITAN_SETTINGS,previous_text:segments[i-1]?.lines.at(-1),next_text:segments[i+1]?.lines[0]}),signal:AbortSignal.timeout(120000)});
    if(!resp.ok)throw Error('Titan passage '+(i+1)+' HTTP '+resp.status);
    const response=await resp.json();
    if(!response.audio_base64||!response.alignment)throw Error('Titan returned incomplete timed narration');
    save(file,{...response,voice,model:MODEL,voice_settings:TITAN_SETTINGS});
   }
   if(file!==lastFile){
    take=read(file);
    pcm=execFileSync('ffmpeg',['-v','error','-i','pipe:0','-ar',String(RATE),'-ac','1','-f','s16le','pipe:1'],{input:Buffer.from(take.audio_base64,'base64'),maxBuffer:64*1024*1024});lastFile=file;
   }
   const a=take.alignment;
   let first=seg.prior?.first??0;
   for(const line of seg.lines){
    const end=first+[...line].length;
    if(a.characters.slice(first,end).join('')!==line)throw Error('Titan alignment does not match requested line');
    const from=first===0?0:Math.round(RATE*(a.character_end_times_seconds[first-2]+a.character_start_times_seconds[first])/2);
    const to=end===a.characters.length?pcm.length/2:Math.round(RATE*(a.character_end_times_seconds[end-1]+a.character_start_times_seconds[end+1])/2);
    if(!(to>from&&from>=0&&to<=pcm.length/2))throw Error('Invalid Titan take boundary');
    writeSync(fd,pcm.subarray(from*2,to*2));bytes+=2*(to-from);
    timing.push((to-from)/RATE);alignment.push({text:line,starts:a.character_start_times_seconds.slice(first,end).map(t=>Math.max(0,t-from/RATE))});
    provenance.push({file:name,startSample:from,endSample:to,reused:Boolean(seg.prior)});first=end+1;
   }
  }
  writeSync(fd,pcmHeader(bytes),0,44,0);
 }finally{closeSync(fd);}
 renameSync(partial,join(dir,'voice.wav'));
 save(join(dir,'voice-takes.json'),{voice,model:MODEL,settings:TITAN_SETTINGS,sampleRate:RATE,takes:provenance});
 save(join(dir,'timing.json'),timing);save(join(dir,'alignment.json'),alignment);
 return timing;
}
