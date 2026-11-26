import {selectRevision} from './episode-revision.ts';
import type {Db} from '../db/database.ts';
import type {PostizIntegration} from './postiz.ts';
import {AppError,notFound} from '../errors.ts';
import {z} from 'zod';

import {accountSlots,siliconId,type Account} from './accounts.ts';
export {siliconId};
/** One connected YouTube channel by name; editions may go to any owner channel listed here. */
export const youtubeChannels=['SiliconFootnote','MysteryOfTheSky'] as const;
export function matchYoutube(targets:PostizIntegration[],channel:(typeof youtubeChannels)[number]){
 const normalize=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'').replace(/^the/,'');
 const want=normalize(channel);
 const candidates=targets.filter(t=>t.identifier==='youtube'&&!t.disabled&&[t.name,t.profile??''].some(v=>normalize(v)===want));
 return candidates.length===1?candidates[0]:undefined;
}
export function matchSilicon(targets:PostizIntegration[]){
 return matchYoutube(targets,'SiliconFootnote');
}
export async function bindSilicon(db:Db,targets:PostizIntegration[]){
 const match=matchSilicon(targets);
 if(match)await db.prepare("UPDATE accounts SET value=json_set(value,'$.postizIntegrationId',?),updated_at=? WHERE id=? AND json_type(value,'$.postizIntegrationId') IS NULL").bind(match.id,new Date().toISOString(),siliconId).run();
 return match;
}

const prefix='silicon-episode:';
export const thumbnailIds=['subject','evidence'] as const;
export const thumbnailId=z.enum(thumbnailIds);
export const thumbnailManifest=z.tuple([thumbnailEntry('subject'),thumbnailEntry('evidence')]);

function thumbnailEntry(id:z.infer<typeof thumbnailId>){
 return z.object({
  id:z.literal(id),
  line:z.string().trim().min(1).max(90),
  title:z.string().trim().min(1).max(100).optional(),
  credit:z.object({label:z.string().min(1).max(300),url:z.url({protocol:/^https$/})}).optional(),
 });
}
export const thumbnailKey=(episodeId:string,id:z.infer<typeof thumbnailId>)=>`silicon/${episodeId}/thumbnail-${id}.jpg`;
export interface Episode {mediaId?:string;revision?:{original:string;previous:string};id:string;topic:string;status:'queued'|'producing'|'ready'|'failed'|'cancelled';created:string;scheduledAt?:string;title?:string;seconds?:number;error?:string;thumbnailError?:string;sources?:{title:string;url:string}[];thumbnails?:z.infer<typeof thumbnailManifest>}
export async function episodes(db:Db){
 const rows=await db.prepare("SELECT last_result FROM job_state WHERE name GLOB 'silicon-episode:*' AND json_type(last_result,'$.revision') IS NULL ORDER BY last_run_at DESC LIMIT 25").all<{last_result:string}>();
 return rows.results.map(r=>JSON.parse(r.last_result) as Episode);
}
export async function queueEpisode(db:Db,topic:string){
 const job:Episode={id:crypto.randomUUID(),topic,status:'queued',created:new Date().toISOString()};
 const result=await db.prepare("INSERT INTO job_state(name,last_run_at,last_result) SELECT ?,?,? WHERE NOT EXISTS(SELECT 1 FROM job_state WHERE name GLOB 'silicon-episode:*' AND json_extract(last_result,'$.status') IN ('queued','producing'))").bind(prefix+job.id,job.created,JSON.stringify(job)).run();
 if(!result.meta.changes)throw new AppError(409,'episode_active','An episode is already in production');
 return job;
}
export const siliconWorker='silicon_worker';
const scheduleKey='account_schedule:'+siliconId;

/** A permanent key per generation start makes overlapping polls idempotent. */
async function slotId(scheduledAt:string){
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(siliconId+':'+scheduledAt)));
 digest[6]=(digest[6]!&15)|128;
 digest[8]=(digest[8]!&63)|128;
 const hex=Array.from(digest.slice(0,16),b=>b.toString(16).padStart(2,'0')).join('');
 return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}

export async function queueScheduledEpisodes(db:Db,at=new Date()){
 const row=await db.prepare('SELECT value FROM accounts WHERE id=?').bind(siliconId).first<{value:string}>();
 if(!row)return;
 const account:Account=JSON.parse(row.value);
 if(!account.enabled||!account.enabledSince)return;
 const previous=await db.prepare('SELECT last_run_at FROM job_state WHERE name=?').bind(scheduleKey).first<{last_run_at:string}>();
 const since=Math.max(Date.parse(account.enabledSince),at.getTime()-86400000,Date.parse(previous?.last_run_at??account.enabledSince));
 const tick=at.toISOString();
 const slots=accountSlots(account,at,-1,3).filter(({scheduledAt})=>Date.parse(scheduledAt)>=since&&scheduledAt<=tick);
 const statements=await Promise.all(slots.map(async ({scheduledAt})=>{
  const id=await slotId(scheduledAt),missed=at.getTime()-Date.parse(scheduledAt)>15*60000;
  const episode:Episode={id,topic:'',status:missed?'failed':'queued',created:tick,scheduledAt,
   ...(missed?{error:'Generation start missed while the subscription worker was unavailable'}:{})};
  return db.prepare(`INSERT OR IGNORE INTO job_state(name,last_run_at,last_result)
   SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM accounts WHERE id=? AND value=?)`)
   .bind(prefix+id,tick,JSON.stringify(episode),siliconId,row.value);
 }));
 statements.push(db.prepare(`INSERT INTO job_state(name,last_run_at,last_result)
  SELECT ?,?,'{}' WHERE EXISTS(SELECT 1 FROM accounts WHERE id=? AND value=?)
  ON CONFLICT(name) DO UPDATE SET last_run_at=max(job_state.last_run_at,excluded.last_run_at)`)
  .bind(scheduleKey,tick,siliconId,row.value));
 await db.batch(statements);
}

export async function claimEpisode(db:Db,{scheduled=false}={}){
 // Never automatically repeat a paid job whose worker vanished.
 await db.prepare("UPDATE job_state SET last_result=json_set(last_result,'$.status','failed','$.error','Production worker disconnected') WHERE name GLOB 'silicon-episode:*' AND json_extract(last_result,'$.status')='producing' AND last_run_at < ?").bind(new Date(Date.now()-20*60_000).toISOString()).run();
 const row=await db.prepare(`UPDATE job_state SET last_result=json_set(last_result,'$.status','producing'),last_run_at=?
  WHERE name=(SELECT name FROM job_state WHERE name GLOB 'silicon-episode:*'
   AND json_extract(last_result,'$.status')='queued'
   AND (json_type(last_result,'$.scheduledAt') IS NULL OR (?=1 AND EXISTS(
    SELECT 1 FROM accounts WHERE id=? AND json_extract(value,'$.enabled')=1)))
   ORDER BY coalesce(json_extract(last_result,'$.scheduledAt'),last_run_at),name LIMIT 1)
  AND NOT EXISTS(SELECT 1 FROM job_state WHERE name GLOB 'silicon-episode:*' AND json_extract(last_result,'$.status')='producing')
  RETURNING last_result`).bind(new Date().toISOString(),Number(scheduled),siliconId).first<{last_result:string}>();
 return row?JSON.parse(row.last_result) as Episode:null;
}
export async function activeEpisode(db:Db,id:string){
 const row=await db.prepare("SELECT last_result FROM job_state WHERE name=? AND json_extract(last_result,'$.status')='producing'").bind(prefix+id).first<{last_result:string}>();
 if(!row)throw new AppError(409,'episode_inactive','Episode is no longer running');
 return JSON.parse(row.last_result) as Episode;
}
export async function reportEpisode(db:Db,episode:Episode){
 if(episode.status==='ready'&&episode.revision)return selectRevision(db,episode,episode.revision);
 const result=await db.prepare("UPDATE job_state SET last_result=?,last_run_at=? WHERE name=? AND json_extract(last_result,'$.status')='producing'").bind(JSON.stringify(episode),new Date().toISOString(),prefix+episode.id).run();
 if(!result.meta.changes)throw new AppError(409,'episode_inactive','Episode is no longer running');
}

export async function readyEpisodeThumbnail(db:Db,id:string,variant:z.infer<typeof thumbnailId>){
 const row=await db.prepare("SELECT last_result FROM job_state WHERE name=? AND json_extract(last_result,'$.status')='ready'").bind(prefix+id).first<{last_result:string}>();
 const episode:Episode|null=row?JSON.parse(row.last_result):null;
 if(!episode?.thumbnails?.some(cover=>cover.id===variant))throw notFound('Thumbnail',variant);
 return thumbnailKey(episode.mediaId??id,variant);
}
