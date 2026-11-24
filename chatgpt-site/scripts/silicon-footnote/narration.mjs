// Keep a speaker's phrasing across cuts. Alignment travels with each cached take.
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {existsSync,renameSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {save,read} from './editor.mjs';

export async function narrate(dir,beats,voice,key){
 const groups=[];
 let group=[];
 for(const beat of beats){
  group.push(beat.narration.trim());
  if(group.join(' ').length>=1150){groups.push(group);group=[];}
 }
 if(group.length)groups.push(group);
 const timing=[],tracks=[],alignment=[];
 for(const [index,lines] of groups.entries()){
  const text=lines.join(' '),model='eleven_flash_v2_5';
  const id=createHash('sha256').update(JSON.stringify([voice,model,text])).digest('hex').slice(0,20);
  const stem='passage-'+id,path=join(dir,stem),cache=path+'.json';
  if(!existsSync(cache)){
   const resp=await fetch('https://api.elevenlabs.io/v1/text-to-speech/'+voice+'/with-timestamps?output_format=mp3_44100_128',{method:'POST',headers:{'xi-api-key':key,'content-type':'application/json'},body:JSON.stringify({text,model_id:model,previous_text:groups[index-1]?.at(-1),next_text:groups[index+1]?.[0]}),signal:AbortSignal.timeout(120000)});
   if(!resp.ok)throw Error('Titan passage '+(index+1)+' HTTP '+resp.status);
   const result=await resp.json();
   if(!result.audio_base64||!result.alignment)throw Error('Titan returned incomplete timed narration');
   save(cache,result);
  }
  const result=read(cache),a=result.alignment;
  if(a.characters.join('')!==text)throw Error('Titan character alignment differs from the submitted passage');
  if(!existsSync(path+'.wav')){
   execFileSync('ffmpeg',['-v','error','-y','-i','pipe:0','-ar','44100','-ac','1','-c:a','pcm_s16le',path+'.partial.wav'],{input:Buffer.from(result.audio_base64,'base64')});
   renameSync(path+'.partial.wav',path+'.wav');
  }
  const seconds=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',path+'.wav']));
  let cursor=0,start=0;
  for(const [i,line] of lines.entries()){
   const first=cursor;
   cursor+=[...line].length;
   const end=i===lines.length-1?seconds:Math.max(start,Math.min(seconds,(a.character_end_times_seconds[cursor-1]+a.character_start_times_seconds[cursor+1])/2));
   if(!(end>start))throw Error('Invalid narration boundary');
   alignment.push({text:line,starts:a.character_start_times_seconds.slice(first,cursor).map(t=>Math.max(0,t-start))});
   timing.push(end-start);start=end;cursor++;
  }
  tracks.push("file '"+stem+".wav'");
  console.log('Titan passage '+(index+1)+'/'+groups.length);
 }
 writeFileSync(join(dir,'voice.list'),tracks.join('\n'));
 execFileSync('ffmpeg',['-v','error','-y','-f','concat','-safe','1','-i',join(dir,'voice.list'),'-c','copy',join(dir,'voice.wav')]);
 save(join(dir,'timing.json'),timing);save(join(dir,'alignment.json'),alignment);
 return timing;
}
