import type {Db} from '../db/database.ts';
import type {PostizIntegration} from './postiz.ts';
import {AppError} from '../errors.ts';

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
export interface Episode {id:string;topic:string;status:'queued'|'producing'|'ready'|'failed';created:string;title?:string;seconds?:number;error?:string;sources?:{title:string;url:string}[]}
export async function episodes(db:Db){
 const rows=await db.prepare("SELECT last_result FROM job_state WHERE name GLOB 'silicon-episode:*' ORDER BY last_run_at DESC LIMIT 25").all<{last_result:string}>();
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
 const result=await db.prepare("UPDATE job_state SET last_result=?,last_run_at=? WHERE name=? AND json_extract(last_result,'$.status')='producing'").bind(JSON.stringify(episode),new Date().toISOString(),prefix+episode.id).run();
 if(!result.meta.changes)throw new AppError(409,'episode_inactive','Episode is no longer running');
}
