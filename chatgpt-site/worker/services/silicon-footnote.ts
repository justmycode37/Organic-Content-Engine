import {selectRevision} from './episode-revision.ts';
import type {Db} from '../db/database.ts';
import type {PostizIntegration} from './postiz.ts';
import {AppError,notFound} from '../errors.ts';
import {z} from 'zod';

export const siliconId='silicon-footnote';
export function matchSilicon(targets:PostizIntegration[]){
 const normalize=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'').replace(/^the/,'');
 const candidates=targets.filter(t=>t.identifier==='youtube'&&!t.disabled&&[t.name,t.profile??''].some(v=>normalize(v)==='siliconfootnote'));
 return candidates.length===1?candidates[0]:undefined;
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
  credit:z.object({label:z.string().min(1).max(300),url:z.url({protocol:/^https$/})}).optional(),
 });
}
export const thumbnailKey=(episodeId:string,id:z.infer<typeof thumbnailId>)=>`silicon/${episodeId}/thumbnail-${id}.jpg`;
export interface Episode {mediaId?:string;revision?:{original:string;previous:string};id:string;topic:string;status:'queued'|'producing'|'ready'|'failed';created:string;title?:string;seconds?:number;error?:string;sources?:{title:string;url:string}[];thumbnails?:z.infer<typeof thumbnailManifest>}
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
export async function claimEpisode(db:Db){
 // Never automatically repeat a paid job whose worker vanished.
 await db.prepare("UPDATE job_state SET last_result=json_set(last_result,'$.status','failed','$.error','Production worker disconnected') WHERE name GLOB 'silicon-episode:*' AND json_extract(last_result,'$.status')='producing' AND last_run_at < ?").bind(new Date(Date.now()-20*60_000).toISOString()).run();
 const row=await db.prepare("UPDATE job_state SET last_result=json_set(last_result,'$.status','producing'), last_run_at=? WHERE name=(SELECT name FROM job_state WHERE name GLOB 'silicon-episode:*' AND json_extract(last_result,'$.status')='queued' ORDER BY last_run_at LIMIT 1) RETURNING last_result").bind(new Date().toISOString()).first<{last_result:string}>();
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
