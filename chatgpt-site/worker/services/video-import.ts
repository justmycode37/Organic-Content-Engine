import {z} from 'zod';
import type {Container} from '../container.ts';
import {AppError,notFound} from '../errors.ts';
import {enqueueRender} from './render-queue.ts';

export const MAX_CLIPS=8;
export const allowedVideoHost=(hostname:string)=>['monid.ai','minimax.io','minimaxi.com','minimaxi.chat','minimaxi.video','fal.media','replicate.delivery','volces.com','bytepluscdn.com','cloudfront.net'].some(domain=>hostname===domain||hostname.endsWith(`.${domain}`));

/** What the Studio needs to turn raw footage into a finished vertical video. Times are seconds. */
export const editPlan=z.object({
 hook:z.string().trim().max(80).default(''),
 cta:z.string().trim().max(60).default(''),
 shots:z.array(z.object({runId:z.string().min(1).max(200),start:z.number().min(0).max(600),end:z.number().positive().max(600)}).strict().refine(s=>s.end-s.start>=0.3,'A shot must last at least 0.3 seconds')).max(16).default([]),
 captions:z.array(z.object({text:z.string().trim().min(1).max(90),start:z.number().min(0).max(180),end:z.number().positive().max(180)}).strict().refine(c=>c.end>c.start,'A caption must end after it starts')).max(500).default([]),
 musicMaterialId:z.string().uuid().nullable().default(null),
 /** Narration is generated automatically; the Studio can replace the take. */
 voiceover:z.string().trim().max(1500).default(''),
 voice:z.object({materialId:z.string().uuid(),voiceId:z.string().regex(/^[A-Za-z0-9]{8,64}$/),duration:z.number().min(0).max(600),words:z.array(z.object({text:z.string().max(1500),start:z.number().min(0).max(600),end:z.number().min(0).max(600)}).strict().refine(w=>w.end>=w.start,'A word must end after it starts')).max(1000)}).strict().nullable().default(null),
}).strict();
export type EditPlan=z.infer<typeof editPlan>;
export interface VideoResult{clips:{materialId:string;runId:string}[];edit:EditPlan|null;finishedMaterialId:string|null;sourceEdit?:EditPlan|null}

/** Reads a stored job result, including the single-clip shape written before the Studio existed. */
export function normalizeVideoResult(raw:string|null):VideoResult{
 const data=(raw?JSON.parse(raw):{}) as Partial<VideoResult>&{materialId?:string;runId?:string};
 const clips=Array.isArray(data.clips)?data.clips:data.materialId&&data.runId?[{materialId:data.materialId,runId:data.runId}]:[];
 return {clips,edit:data.edit??null,finishedMaterialId:data.finishedMaterialId??null,sourceEdit:data.sourceEdit??data.edit??null};
}

type JobRow={kind:string;status:string;result:string|null};
async function videoJob(c:Container,id:string){
 const job=await c.db.prepare('SELECT kind,status,result FROM generation_jobs WHERE id=?').bind(id).first<JobRow>();
 if(!job)throw notFound('Generation request',id);
 if(job.kind!=='video')throw new AppError(400,'invalid_request','This request is not for a video');
 return job;
}
function assertShotsKnown(edit:EditPlan,clips:VideoResult['clips']){
 const unknown=edit.shots.find(shot=>!clips.some(clip=>clip.runId===shot.runId));
 if(unknown)throw new AppError(422,'unknown_shot',`The edit plan uses run ${unknown.runId}, which has not been saved. Save every clip before the plan that cuts it.`);
}
async function locked<T>(c:Container,jobId:string,ms:number,busy:string,work:()=>Promise<T>){
 const now=new Date();
 if(!await c.settings.acquireLock(`generation:${jobId}`,now.toISOString(),new Date(now.getTime()+ms).toISOString()))throw new AppError(409,'import_busy',busy);
 try{return await work();}finally{await c.settings.releaseLock(`generation:${jobId}`);}
}
const store=(c:Container,jobId:string,status:string,result:VideoResult,queue=false,repair=false)=>c.db.batch([
 c.db.prepare('UPDATE generation_jobs SET status=?,result=? WHERE id=?').bind(status,JSON.stringify(result),jobId),
 ...(queue?[enqueueRender(c,jobId,repair)]:[]),
]);

/** Imports one completed run as raw footage. The job becomes finishable; it is never publishable as-is. */
export async function saveVideoResult(c:Container,input:{jobId:string;url:string;runId:string;edit?:EditPlan}){
 if((await videoJob(c,input.jobId)).status==='completed')return normalizeVideoResult((await videoJob(c,input.jobId)).result);
 const url=new URL(input.url);if(url.protocol!=='https:'||url.port||url.username||url.password||!allowedVideoHost(url.hostname))throw new AppError(422,'download_host_unsupported','This video host cannot be imported automatically. Download the completed result and upload it in Storage.');
 return locked(c,input.jobId,120000,'Video import is already in progress',async()=>{
  const job=await videoJob(c,input.jobId);const result=normalizeVideoResult(job.result);
  if(job.status==='completed')return result;
  let clip=result.clips.find(item=>item.runId===input.runId);
  const existing=Boolean(clip);
  if(!clip&&result.clips.length>=MAX_CLIPS)throw new AppError(422,'too_many_clips',`A video request holds at most ${MAX_CLIPS} clips`);
  if(input.edit)assertShotsKnown(input.edit,clip?result.clips:[...result.clips,{materialId:'',runId:input.runId}]);
  if(!clip){
   const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(60000)});const size=Number(response.headers.get('content-length'));if(!response.ok||!response.body||!size||size>100*1024*1024||!Number.isInteger(size))throw new AppError(422,'video_download_failed','Video download failed, has an unknown size, or exceeds 100 MB');
   const mime=response.headers.get('content-type')?.split(';')[0];if(mime!=='video/mp4'&&mime!=='application/octet-stream')throw new AppError(422,'video_format','Generated video must be MP4');
   const material=await c.materials.init({name:`footage-${input.jobId.slice(0,8)}-${result.clips.length+1}.mp4`,mime:'video/mp4',size,kind:'raw_clip'});await c.materials.upload(material.id,response.body,size);
   await c.materials.update(material.id,{notes:`Raw footage generated through Monid. Run ${input.runId}. Awaiting automatic editing. Synthetic footage.`});
   clip={materialId:material.id,runId:input.runId};result.clips.push(clip);
  }
  if(existing&&(!input.edit||JSON.stringify(result.sourceEdit)===JSON.stringify(input.edit))&&job.status!=='ready_to_finish')return {materialId:clip.materialId,runId:clip.runId,clips:result.clips.length,editSaved:Boolean(result.edit),next:'This edit is already queued or rendering. Do not regenerate footage.'};
  if(input.edit){result.sourceEdit=input.edit;result.edit={...input.edit,voice:input.edit.voice??(input.edit.voiceover===result.edit?.voiceover?result.edit.voice:null)};}
  await store(c,input.jobId,result.edit?'render_queued':'ready_to_finish',result,Boolean(result.edit));
  return {materialId:clip.materialId,runId:clip.runId,clips:result.clips.length,editSaved:Boolean(result.edit),next:result.edit?'The video is queued for automatic narration and editing. No Studio interaction is required.':'Footage saved. Save the complete edit plan on the final call to start automatic editing.'};
 });
}

/** Saves an AI or creator edit and queues its automatic finish. */
export async function saveEditPlan(c:Container,jobId:string,edit:EditPlan,automatic=false){
 return locked(c,jobId,30000,'This video is being updated',async()=>{
  const job=await videoJob(c,jobId);const result=normalizeVideoResult(job.result);
  if(!result.clips.length)throw new AppError(409,'no_footage','Generate footage before editing this video');
  const repair=automatic&&job.status==='render_failed';
  if(repair){const current=await c.db.prepare('SELECT repairs FROM video_renders WHERE job_id=?').bind(jobId).first<{repairs:number}>();if((current?.repairs??0)>=2){await c.db.prepare("UPDATE generation_jobs SET status='render_blocked' WHERE id=?").bind(jobId).run();throw new AppError(422,'render_repair_limit','Automatic edit repairs are exhausted. Report the failure without spending on more narration.');}}
  if(automatic&&job.status==='render_blocked')throw new AppError(422,'render_repair_limit','Automatic edit repairs are exhausted. Report the failure without spending on more narration.');
  assertShotsKnown(edit,result.clips);
  if(result.edit?.voiceover!==edit.voiceover&&edit.voice?.materialId===result.edit?.voice?.materialId)edit={...edit,voice:null};
  edit={...edit,voice:edit.voice??(edit.voiceover===result.edit?.voiceover?result.edit.voice:null)};
  result.edit=edit;result.sourceEdit=edit;result.finishedMaterialId=null;
  await store(c,jobId,'render_queued',result,true,repair);return result;
 });
}

/** Records the Studio render as this request's finished video. Only finished videos can be scheduled. */
export async function finishVideo(c:Container,jobId:string,input:{materialId:string;edit?:EditPlan}){
 return locked(c,jobId,30000,'This video is being updated',async()=>{
  const job=await videoJob(c,jobId);const result=normalizeVideoResult(job.result);
  if(!result.clips.length)throw new AppError(409,'no_footage','Generate footage before finishing this video');
  const material=await c.materials.get(input.materialId);
  if(!material.uploaded||material.mime!=='video/mp4')throw new AppError(422,'video_required','The finished video must be a completed MP4 upload');
  if(result.clips.some(clip=>clip.materialId===material.id))throw new AppError(422,'finish_required','Raw footage cannot be marked as the finished video');
  if(input.edit){assertShotsKnown(input.edit,result.clips);result.edit=input.edit;}
  await c.materials.setKind(material.id,'finished');
  await c.materials.update(material.id,{notes:material.notes||'Finished in the Studio from generated footage. Review before publishing and disclose synthetic content.'});
  result.finishedMaterialId=material.id;
  await c.db.batch([
   c.db.prepare("UPDATE generation_jobs SET status='completed',result=? WHERE id=?").bind(JSON.stringify(result),jobId),
   c.db.prepare("UPDATE video_renders SET status='completed',lease_id=NULL,lease_until=NULL,updated_at=? WHERE job_id=?").bind(c.now().toISOString(),jobId),
  ]);return result;
 });
}
