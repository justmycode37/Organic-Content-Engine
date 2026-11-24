import {execFileSync,spawn} from 'node:child_process';
import {openSync,closeSync,unlinkSync,existsSync,readFileSync,writeFileSync,renameSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {prepare,here,read,save} from './editor.mjs';
import {capturePress} from './press.mjs';
import {narrate,TITAN_SETTINGS} from './narration.mjs';
import {prepareThumbnails} from './thumbnail.mjs';

export const TITAN='dtSEyYGNJqjrtBArPCVZ';
export function duration(path){
 const seconds=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',path],{encoding:'utf8'}));
 if(!(seconds>0&&Number.isFinite(seconds)))throw Error('Invalid audio or video duration');
 return seconds;
}
export async function produce(dir,{topic='',sourceFile}={}){
 dir=resolve(dir);mkdirSync(dir,{recursive:true});
 const lock=join(dir,'production.lock'),fd=openSync(lock,'wx');closeSync(fd);
 try{
  const request={topic,sourceFile:sourceFile?resolve(sourceFile):null},requestFile=join(dir,'request.json');
  if(existsSync(requestFile)&&JSON.stringify(request)!==JSON.stringify(read(requestFile)))throw Error('Use a new output directory for a different episode');
  save(requestFile,request);
  const key=process.env.ELEVENLABS_API_KEY;
  if(!key)throw Error('Set ELEVENLABS_API_KEY on the production machine');
  const plan=await prepare(dir,topic,sourceFile),timing=[],tracks=[];
  const thumbnails=prepareThumbnails(dir);
  const continuous=plan.beats.every(beat=>beat.art);
  if(continuous){
   const pages=plan.beats.flatMap(b=>[b,...(b.cutaways??[]).map(c=>({...c,source:c.source??b.source}))]).filter(b=>['document','quote'].includes(b.kind)).map(b=>b.kind==='quote'&&b.quote&&!/\/status\/\d+/.test(read(join(dir,'sources.json')).sources[b.source].url)?{source:b.source,quote:b.quote}:b.source);
   await capturePress(dir,read(join(dir,'sources.json')).sources,pages);
  }
  if(continuous)timing.push(...await narrate(dir,plan.beats,TITAN,key));
  else for(const [i,beat] of plan.beats.entries()){
   const file=join(dir,`voice-${i}.wav`);
   if(!existsSync(file)){
    const audio=join(dir,`take-${i}.mp3`);
    if(!existsSync(audio)){
     const res=await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${TITAN}?output_format=mp3_44100_128`,{method:'POST',redirect:'error',headers:{'xi-api-key':key,'content-type':'application/json'},body:JSON.stringify({text:beat.narration,model_id:'eleven_flash_v2_5',voice_settings:TITAN_SETTINGS,previous_text:plan.beats[i-1]?.narration,next_text:plan.beats[i+1]?.narration}),signal:AbortSignal.timeout(120000)});
     if(!res.ok)throw Error('Titan synthesis failed for beat '+(i+1)+' (HTTP '+res.status+')');
     writeFileSync(audio+'.tmp',Buffer.from(await res.arrayBuffer()));renameSync(audio+'.tmp',audio);
    }
    execFileSync('ffmpeg',['-v','error','-y','-i',audio,'-ar','44100','-ac','1','-c:a','pcm_s16le',file+'.partial.wav']);
    renameSync(file+'.partial.wav',file);
   }
   timing.push(duration(file));tracks.push(`file 'voice-${i}.wav'`);
  }
  const seconds=timing.reduce((a,b)=>a+b,0)+(plan.style==='reported-footage'?4.5:0)+plan.beats.reduce((s,b)=>s+(b.actuality?b.actuality.end-b.actuality.start:0),0);save(join(dir,'timing.json'),timing);
  if(seconds<600||seconds>900)throw Error(`Native narration measures ${seconds.toFixed(1)}s outside 600–900s. Takes are saved for editorial revision.`);
  if(!continuous){writeFileSync(join(dir,'voice.list'),tracks.join('\n'));
  execFileSync('ffmpeg',['-v','error','-y','-f','concat','-safe','1','-i',join(dir,'voice.list'),'-c','copy',join(dir,'voice.wav')]);}
  await new Promise((ok,fail)=>{const p=spawn('python3',[join(here,'render.py'),dir],{stdio:'inherit'});p.on('error',fail);p.on('close',c=>c===0?ok():fail(Error('Renderer exited '+c)))});
  const output=join(dir,'episode.mp4');
  if(Math.abs(duration(output)-seconds)>.15)throw Error('Final picture and narration duration differ');
  return {output,title:plan.title,seconds,thumbnails,sources:read(join(dir,'sources.json'))};
 }finally{unlinkSync(lock);}
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
 const [dir,...args]=process.argv.slice(2);
 if(!dir)throw Error('Usage: node produce.mjs OUTPUT_DIRECTORY [topic | --sources FILE]');
 const result=await produce(dir,args[0]==='--sources'?{sourceFile:args[1]}:{topic:args.join(' ')});
 console.log(result.output);
}
