import type {Container} from '../container.ts';
import {AppError} from '../errors.ts';
import {changed} from '../db/database.ts';
import {editPlan,normalizeVideoResult,type EditPlan,type VideoResult} from './video-import.ts';
import {createVoiceover,listVoices} from './voiceover.ts';
import {captionsFromWords} from '../../src/studio/plan.ts';

const LEASE_MS=20*60*1000;
const MAX_ATTEMPTS=3;
interface RenderRow {job_id:string;status:string;lease_id:string|null;lease_until:string|null;attempts:number;next_attempt_at:string;output_material_id:string|null;error_code:string|null;error_message:string|null;updated_at:string}

/** Called in the same atomic batch as the saved edit. Replacing a plan invalidates old leases. */
export function enqueueRender(c:Container,jobId:string,repair=false){
 const now=c.now().toISOString();
 return c.db.prepare(`INSERT INTO video_renders (job_id,status,next_attempt_at,updated_at) VALUES (?,'queued',?,?)
 ON CONFLICT(job_id) DO UPDATE SET status='queued',lease_id=NULL,lease_until=NULL,attempts=0,next_attempt_at=excluded.next_attempt_at,output_material_id=NULL,error_code=NULL,error_message=NULL,updated_at=excluded.updated_at,repairs=${repair?'video_renders.repairs+1':'0'}`).bind(jobId,now,now);
}

export async function renderState(c:Container,jobId:string){
 const row=await c.db.prepare('SELECT * FROM video_renders WHERE job_id=?').bind(jobId).first<RenderRow>();
 return row?{status:row.status,attempts:row.attempts,errorCode:row.error_code,errorMessage:row.error_message,nextAttemptAt:row.next_attempt_at,updatedAt:row.updated_at}:null;
}

async function withJobLock<T>(c:Container,id:string,work:()=>Promise<T>){
 const now=c.now();
 if(!await c.settings.acquireLock(`generation:${id}`,now.toISOString(),new Date(now.getTime()+LEASE_MS).toISOString()))throw new AppError(409,'generation_busy','This video is being updated');
 try{return await work();}finally{await c.settings.releaseLock(`generation:${id}`);}
}

async function assertLease(c:Container,id:string,lease:string,completed=false){
 const row=await c.db.prepare('SELECT * FROM video_renders WHERE job_id=?').bind(id).first<RenderRow>();
 if(!row||row.lease_id!==lease||!(row.status==='rendering'||(completed&&row.status==='completed'))||(row.status==='rendering'&&(!row.lease_until||row.lease_until<=c.now().toISOString())))throw new AppError(409,'render_lease_expired','This render was replaced or its lease expired');
 return row;
}

async function resultFor(c:Container,id:string){
 const job=await c.db.prepare("SELECT result FROM generation_jobs WHERE id=? AND kind='video'").bind(id).first<{result:string|null}>();
 if(!job)throw new AppError(404,'not_found','Video request not found');
 return normalizeVideoResult(job.result);
}

/** One durable lease per video, including narration preparation. No browser visitor is needed. */
export async function claimRender(c:Container){
 const now=c.now().toISOString();
 await c.settings.setJob('render_worker',now,{ok:true});
 // Reconcile a bounded batch of old saved plans outside schema migrations.
 const legacy=await c.db.prepare("SELECT id FROM generation_jobs WHERE kind='video' AND status='ready_to_finish' AND json_extract(result,'$.edit') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM video_renders WHERE job_id=generation_jobs.id) LIMIT 5").all<{id:string}>();
 for(const {id} of legacy.results)await c.db.batch([
  c.db.prepare("INSERT INTO video_renders (job_id,status,next_attempt_at,updated_at) VALUES (?,'queued',?,?) ON CONFLICT(job_id) DO NOTHING").bind(id,now,now),
  c.db.prepare("UPDATE generation_jobs SET status='render_queued' WHERE id=? AND status='ready_to_finish' AND EXISTS(SELECT 1 FROM video_renders WHERE job_id=? AND status='queued')").bind(id,id),
 ]);
 // A crashed worker has a bounded retry budget too.
 const exhausted=await c.db.prepare("SELECT job_id FROM video_renders WHERE status='rendering' AND lease_until<=? AND attempts>=?").bind(now,MAX_ATTEMPTS).all<{job_id:string}>();
 for(const {job_id} of exhausted.results)await c.db.batch([
  c.db.prepare("UPDATE video_renders SET status='failed',error_code='render_timeout',error_message='The background renderer stopped responding.',updated_at=? WHERE job_id=? AND status='rendering' AND lease_until<=?").bind(now,job_id,now),
  c.db.prepare("UPDATE generation_jobs SET status='render_failed' WHERE id=? AND status='rendering' AND EXISTS(SELECT 1 FROM video_renders WHERE job_id=? AND status='failed')").bind(job_id,job_id),
 ]);
 const candidates=await c.db.prepare("SELECT job_id FROM video_renders WHERE ((status='queued' AND next_attempt_at<=?) OR (status='rendering' AND lease_until<=?)) AND attempts<? ORDER BY next_attempt_at LIMIT 5").bind(now,now,MAX_ATTEMPTS).all<{job_id:string}>();
 for(const {job_id:id} of candidates.results){
  try{return await withJobLock(c,id,async()=>{
   const lease=crypto.randomUUID(),until=new Date(c.now().getTime()+LEASE_MS).toISOString();
   const updated=await c.db.prepare("UPDATE video_renders SET status='rendering',lease_id=?,lease_until=?,attempts=attempts+1,error_code=NULL,error_message=NULL,updated_at=? WHERE job_id=? AND ((status='queued' AND next_attempt_at<=?) OR (status='rendering' AND lease_until<=?)) AND attempts<?").bind(lease,until,now,id,now,now,MAX_ATTEMPTS).run();
   if(!changed(updated))return {job:null};
   await c.db.prepare("UPDATE generation_jobs SET status='rendering' WHERE id=?").bind(id).run();
   try{
    const result=await resultFor(c,id);
    if(!result.edit||!result.clips.length)throw new AppError(422,'edit_required','The AI must save footage and a complete edit plan before rendering');
    let plan=editPlan.parse(result.edit);
    if(!plan.hook||!plan.cta||!plan.shots.length)throw new AppError(422,'edit_required','The AI must supply the hook, cut list and end card');
    if(plan.voiceover&&!plan.voice){
     const voices=await listVoices(c);
     if(!voices.configured)throw new AppError(409,'voiceover_not_configured','Waiting for the ElevenLabs connection');
     if(!voices.defaultVoiceId)throw new AppError(409,'voice_unavailable','Add a female voice to the ElevenLabs account or configure a preferred voice');
     const voice=await createVoiceover(c,{text:plan.voiceover,voiceId:voices.defaultVoiceId});
     plan={...plan,voice,captions:voice.words.length?captionsFromWords(voice.words):plan.captions};
     result.edit=plan;
     // Persist the paid take before returning a lease, so retries reuse it.
     await c.db.prepare('UPDATE generation_jobs SET result=? WHERE id=?').bind(JSON.stringify(result),id).run();
    }
    const mediaIds=[...result.clips.map(clip=>clip.materialId),...(plan.voice?[plan.voice.materialId]:[]),...(plan.musicMaterialId?[plan.musicMaterialId]:[])];
    const media=await Promise.all([...new Set(mediaIds)].map(async materialId=>{
     const material=await c.materials.get(materialId);
     if(!material.uploaded)throw new AppError(422,'media_missing','A video input has not finished uploading');
     return {id:material.id,mime:material.mime,size:material.size};
    }));
    return {job:{id,lease,leaseUntil:until,plan,clips:result.clips,media,handle:(await c.settings.getBrand()).handle}};
   }catch(error){
    await failRender(c,id,lease,error instanceof AppError?error.code:'render_prepare_failed',error instanceof AppError?error.message:'The video could not be prepared',true);
    return {job:null};
   }
  });}catch(error){if(!(error instanceof AppError&&error.code==='generation_busy'))throw error;}
 }
 return {job:null};
}

/** A renderer can only download inputs belonging to its current lease. */
export async function renderInput(c:Container,id:string,lease:string,materialId:string){
 await assertLease(c,id,lease);
 const result=await resultFor(c,id),plan=result.edit;
 if(![...result.clips.map(clip=>clip.materialId),plan?.voice?.materialId,plan?.musicMaterialId].includes(materialId))throw new AppError(403,'render_media_forbidden','This file is not part of the render');
 return c.materials.read(materialId);
}

export async function heartbeatRender(c:Container,id:string,lease:string){
 const now=c.now();
 const update=await c.db.prepare("UPDATE video_renders SET lease_until=?,updated_at=? WHERE job_id=? AND lease_id=? AND status='rendering' AND lease_until>?").bind(new Date(now.getTime()+LEASE_MS).toISOString(),now.toISOString(),id,lease,now.toISOString()).run();
 if(!changed(update))throw new AppError(409,'render_lease_expired','This render was replaced or its lease expired');
 await c.settings.setJob('render_worker',now.toISOString(),{ok:true});
 return {ok:true};
}

export async function finishRender(c:Container,id:string,lease:string,body:ReadableStream,length:number,shots?:EditPlan['shots']){
 return withJobLock(c,id,async()=>{
  let row=await assertLease(c,id,lease,true);
  if(row.status==='completed')return resultFor(c,id);
  if(!Number.isInteger(length)||length<=0||length>100*1024*1024)throw new AppError(422,'render_size_invalid','The finished MP4 must be at most 100 MB');
  if(!row.output_material_id){
   const material=await c.materials.init({name:`video-${id.slice(0,8)}.mp4`,mime:'video/mp4',size:length,kind:'finished'});
   await c.db.prepare('UPDATE video_renders SET output_material_id=? WHERE job_id=? AND lease_id=?').bind(material.id,id,lease).run();
   row={...row,output_material_id:material.id};
  }
  const material=await c.materials.get(row.output_material_id!);
  if(!material.uploaded)await c.materials.upload(material.id,body,length);
  await c.materials.update(material.id,{enabled:false,notes:'Finished automatically from the AI edit plan, with narration and synchronized captions when requested. Synthetic footage.'});
  await assertLease(c,id,lease);
  const result=await resultFor(c,id);result.finishedMaterialId=material.id;
  const request=await c.db.prepare('SELECT input FROM generation_jobs WHERE id=?').bind(id).first<{input:string}>();
  const target=JSON.parse(request?.input??'{}') as {postId?:string;postSnapshot?:{updatedAt:string}};
  if(shots&&result.edit){
   if(shots.some(shot=>!result.clips.some(clip=>clip.runId===shot.runId)))throw new AppError(422,'render_invalid','The rendered shots reference unknown footage');
   result.edit={...result.edit,shots};
  }
  await c.db.batch([
   c.db.prepare("UPDATE video_renders SET status='completed',lease_until=NULL,error_code=NULL,error_message=NULL,updated_at=? WHERE job_id=? AND lease_id=?").bind(c.now().toISOString(),id,lease),
   c.db.prepare("UPDATE generation_jobs SET status='completed',result=? WHERE id=?").bind(JSON.stringify(result),id),
   ...(target.postId&&target.postSnapshot?[c.db.prepare("UPDATE posts SET media_urls=?,updated_at=? WHERE id=? AND updated_at=? AND status IN ('draft','needs_review')").bind(JSON.stringify([`storage:${material.id}`]),c.now().toISOString(),target.postId,target.postSnapshot.updatedAt)]:[]),
  ]);
  return result;
 });
}

/** Retry technical failures without paying for narration again; malformed plans return to the AI. */
export async function failRender(c:Container,id:string,lease:string,code:string,message:string,preparing=false){
 const work=async()=>{
  const row=await assertLease(c,id,lease);
  const waiting=['voiceover_not_configured','voice_unavailable','voiceover_busy','voiceover_auth','voiceover_quota','storage_unavailable'].includes(code);
  const needsEdit=['edit_required','narration_too_long','media_missing','render_invalid'].includes(code);
  const retry=waiting||(!needsEdit&&row.attempts<MAX_ATTEMPTS);
  const now=c.now();
  await c.db.batch([
   c.db.prepare('UPDATE video_renders SET status=?,lease_id=NULL,lease_until=NULL,attempts=?,next_attempt_at=?,error_code=?,error_message=?,updated_at=? WHERE job_id=? AND lease_id=?').bind(retry?'queued':'failed',waiting?Math.max(0,row.attempts-1):row.attempts,new Date(now.getTime()+(waiting?60000:row.attempts*30000)).toISOString(),code,c.redact(message).slice(0,500),now.toISOString(),id,lease),
   c.db.prepare('UPDATE generation_jobs SET status=? WHERE id=?').bind(waiting?'waiting_for_voice':retry?'render_queued':'render_failed',id),
  ]);
  return {retrying:retry};
 };
 return preparing?work():withJobLock(c,id,work);
}
