// Runs only inside the unattended renderer. Shares the exact Studio compositing and audio mix.
import {loadClip,releaseClips,paintFrame,loadFonts,mixAudio} from '../src/studio/render.ts';
import {FRAME,buildTimeline,fitNarration,type EditPlan} from '../src/studio/plan.ts';

declare global {interface Window {
 renderJob:(input:{plan:EditPlan;clips:{runId:string;materialId:string}[];handle:string})=>Promise<{duration:number;hasAudio:boolean;shots:EditPlan['shots']}>;
 emitFrame:(base64:string)=>Promise<void>;
 emitAudio:(base64:string)=>Promise<void>;
}}
function base64(bytes:Uint8Array){let binary='';for(let at=0;at<bytes.length;at+=8192)binary+=String.fromCharCode(...bytes.subarray(at,at+8192));return btoa(binary);}
window.renderJob=async input=>{
 const clips=[];
 try{
  for(const clip of input.clips)clips.push(await loadClip(clip.runId,`/media/${clip.materialId}`,'Footage'));
  const audio=async(id:string)=>{const response=await fetch(`/media/${id}`);if(!response.ok)throw new Error('A selected audio file is unavailable');return response.arrayBuffer();};
  const [voice,music]=await Promise.all([input.plan.voice?audio(input.plan.voice.materialId):null,input.plan.musicMaterialId?audio(input.plan.musicMaterialId):null]);
  let plan=input.plan;
  if(voice){
   const decoded=await new OfflineAudioContext(2,1,48000).decodeAudioData(voice.slice(0));
   try{plan=fitNarration(plan,clips,decoded.duration);}catch(error){throw new Error(`narration_too_long: ${(error as Error).message}`);}
  }
  const timeline=buildTimeline(plan,clips);
  if(!timeline.frames)throw new Error('render_invalid: The edit contains no usable footage');
  const mixed=await mixAudio(timeline,clips,music,voice);
  await loadFonts();
  const canvas=document.createElement('canvas');canvas.width=FRAME.width;canvas.height=FRAME.height;
  const ctx=canvas.getContext('2d',{alpha:false})!;
  // The Node worker encodes these frames with FFmpeg, which also supports Linux AAC encoding.
  for(let frame=0;frame<timeline.frames;frame++){
   await paintFrame(ctx,frame/FRAME.fps,timeline,plan,input.handle,clips);
   await window.emitFrame(canvas.toDataURL('image/png').split(',')[1]!);
  }
  const total=Math.ceil(timeline.duration*48000);
  for(let at=0;at<total;at+=48000){
   const length=Math.min(48000,total-at),interleaved=new Float32Array(length*2);
   if(mixed)for(let channel=0;channel<2;channel++){
    const source=mixed.getChannelData(channel);
    for(let index=0;index<length;index++)interleaved[index*2+channel]=source[at+index]!;
   }
   await window.emitAudio(base64(new Uint8Array(interleaved.buffer)));
  }
  return {duration:timeline.duration,hasAudio:Boolean(mixed),shots:plan.shots};
 }finally{releaseClips(clips);}
};
