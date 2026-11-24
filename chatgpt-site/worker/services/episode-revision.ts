import type {Db} from '../db/database.ts';
import {AppError} from '../errors.ts';
import type {Episode} from './silicon-footnote.ts';

interface Revision {original:string; previous:string}

// A replacement uses a separate multipart object. The existing cut stays playable
// until the completed revision and its metadata are selected in one D1 batch.
export async function beginRevision(db:Db,id:string,title:string){
 const job={id:crypto.randomUUID(),topic:title,status:'producing',created:new Date().toISOString()};
 const result=await db.prepare(`INSERT INTO job_state(name,last_run_at,last_result)
  SELECT ?,?,json_set(?, '$.revision',json_object('original',?,'previous',coalesce(json_extract(last_result,'$.mediaId'),?)))
  FROM job_state WHERE name=? AND json_extract(last_result,'$.status')='ready'`)
  .bind('silicon-episode:'+job.id,job.created,JSON.stringify(job),id,id,'silicon-episode:'+id).run();
 if(!result.meta.changes)throw new AppError(409,'episode_inactive','Select a finished episode to replace');
 return job;
}

export async function selectRevision(db:Db,e:Episode,revision:Revision){
 const original='silicon-episode:'+revision.original,staging='silicon-episode:'+e.id;
 const copy={...e,id:revision.original,mediaId:e.id};
 // Preserve the original creation date. A concurrent selection cannot overwrite a newer cut.
 const [update]=await db.batch([
  db.prepare(`UPDATE job_state SET last_run_at=?,last_result=json_remove(json_set(?,'$.created',json_extract(last_result,'$.created')),'$.revision')
   WHERE name=? AND json_extract(last_result,'$.status')='ready' AND coalesce(json_extract(last_result,'$.mediaId'),?)=?
   AND EXISTS(SELECT 1 FROM job_state WHERE name=? AND json_extract(last_result,'$.status')='producing')`)
   .bind(new Date().toISOString(),JSON.stringify(copy),original,revision.original,revision.previous,staging),
  db.prepare("DELETE FROM job_state WHERE name=? AND EXISTS(SELECT 1 FROM job_state WHERE name=? AND json_extract(last_result,'$.mediaId')=?)").bind(staging,original,e.id)
 ]);
 if(!update?.meta.changes)throw new AppError(409,'revision_conflict','Another edit already replaced this episode');
}

export async function selectedVideo(db:Db,id:string){
 const row=await db.prepare("SELECT coalesce(json_extract(last_result,'$.mediaId'),?) media FROM job_state WHERE name=? AND json_extract(last_result,'$.status')='ready'").bind(id,'silicon-episode:'+id).first<{media:string}>();
 if(!row)throw new AppError(404,'episode_missing','Episode unavailable');
 return 'silicon/'+row.media+'.mp4';
}
