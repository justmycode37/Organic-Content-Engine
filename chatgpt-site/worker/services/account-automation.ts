import type {Container,Env} from '../container.ts';
import {AppError} from '../errors.ts';
import {SocialAccounts,platformOf} from './social.ts';
import {VideoPublisher} from '../publishing/adapters/video.ts';
import {PublishError} from '../publishing/types.ts';
import {listAccounts} from './accounts.ts';
const now=()=>new Date().toISOString();
export const runtime=(env:Env)=>Object.fromEntries(Object.entries(env).filter((e):e is [string,string]=>typeof e[1]==='string'));
export async function tickAccounts(c:Container,env:Env){
 const accounts=await listAccounts(c.db);let queued=0;
 for(const a of accounts){if(!a.enabled||a.platform!=='instagram')continue;
 const social=new SocialAccounts(c.db,runtime(env),fetch,a.id);if(!await social.account('instagram')||social.config('instagram').missing.length)continue;
 for(const slot of a.schedule.filter(s=>Date.parse(s.scheduledAt)-Date.now()<24*3600000)){
 const r=await c.db.prepare('INSERT OR IGNORE INTO account_automation_jobs(id,account_id,scheduled_at,created_at,updated_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),a.id,slot.scheduledAt,now(),now()).run();queued+=Number(r.meta.changes??0);
 }}return {queued};
}
export async function claimAccountJob(c:Container){
 await c.settings.setJob('account_worker',now(),{online:true});
 await c.db.prepare("UPDATE account_automation_jobs SET status='needs_attention',error='Worker stopped during production; inspect cached output before retrying',lease_id=NULL WHERE status='leased' AND lease_until<?").bind(now()).run();
 const lease=crypto.randomUUID(),until=new Date(Date.now()+20*60000).toISOString();
 const row=await c.db.prepare("UPDATE account_automation_jobs SET status='leased',lease_id=?,lease_until=?,attempts=attempts+1,updated_at=? WHERE id=(SELECT j.id FROM account_automation_jobs j JOIN accounts a ON a.id=j.account_id WHERE j.status='pending' AND json_extract(a.value,'$.enabled')=1 ORDER BY j.scheduled_at LIMIT 1) AND status='pending' RETURNING *").bind(lease,until,now()).first<any>();
 if(!row)return {job:null};const a=await c.db.prepare('SELECT value FROM accounts WHERE id=?').bind(row.account_id).first<{value:string}>();
 return {job:{id:row.id,lease,account:JSON.parse(a!.value),scheduledAt:row.scheduled_at}};
}
export async function accountLease(c:Container,id:string,lease:string){const row=await c.db.prepare("SELECT * FROM account_automation_jobs WHERE id=? AND lease_id=? AND status='leased' AND lease_until>?").bind(id,lease,now()).first<any>();if(!row)throw new AppError(409,'stale_lease','This job is no longer leased to this worker');return row;}
export async function heartbeatAccountJob(c:Container,id:string,lease:string){await accountLease(c,id,lease);await c.db.prepare('UPDATE account_automation_jobs SET lease_until=?,updated_at=? WHERE id=? AND lease_id=?').bind(new Date(Date.now()+20*60000).toISOString(),now(),id,lease).run();await c.settings.setJob('account_worker',now(),{online:true});return {ok:true};}
export async function completeAccountJob(c:Container,id:string,lease:string,input:{materialId:string;spec:unknown;provenance:unknown}){
 const done=await c.db.prepare("SELECT id FROM account_automation_jobs WHERE id=? AND lease_id=? AND status='completed' AND output_material_id=?").bind(id,lease,input.materialId).first();if(done)return{ok:true};
 const row=await accountLease(c,id,lease);if(row.output_material_id!==input.materialId)throw new AppError(409,'output_mismatch','This output belongs to another job');
 const m=await c.materials.get(input.materialId);if(!m.uploaded||m.kind!=='finished'||m.mime!=='video/mp4')throw new AppError(409,'output_invalid','Upload a finished MP4 first');
 await c.db.prepare("UPDATE account_automation_jobs SET status='completed',spec=?,provenance=?,error=NULL,updated_at=? WHERE id=? AND lease_id=? AND status='leased'").bind(JSON.stringify(input.spec),JSON.stringify(input.provenance),now(),id,lease).run();return {ok:true};
}
export async function failAccountJob(c:Container,id:string,lease:string,input:{code:string;message:string}){await accountLease(c,id,lease);await c.db.prepare("UPDATE account_automation_jobs SET status='failed',error=?,updated_at=? WHERE id=? AND lease_id=?").bind(input.message.slice(0,300),now(),id,lease).run();return {ok:true};}
export async function publishAccountJobs(c:Container,env:Env){
 if((await c.settings.get()).publishingPaused)return {published:0,paused:true};let published=0;
 const jobs=await c.db.prepare("SELECT j.*,a.value FROM account_automation_jobs j JOIN accounts a ON a.id=j.account_id WHERE j.status IN ('completed','publishing') AND j.scheduled_at<=? AND (j.publish_until IS NULL OR j.publish_until<?) ORDER BY j.scheduled_at LIMIT 5").bind(now(),now()).all<any>();
 for(const row of jobs.results){const a=JSON.parse(row.value);if(!a.enabled)continue;
 if(Date.now()-Date.parse(row.scheduled_at)>3600000){await c.db.prepare("UPDATE account_automation_jobs SET status='failed',error='Publishing window missed' WHERE id=?").bind(row.id).run();continue;}
 const until=new Date(Date.now()+5*60000).toISOString();const claimed=await c.db.prepare("UPDATE account_automation_jobs SET publish_until=? WHERE id=? AND (publish_until IS NULL OR publish_until<?)").bind(until,row.id,now()).run();if(!claimed.meta.changes)continue;
 try{const social=new SocialAccounts(c.db,runtime(env),fetch,a.id),platform=platformOf(a.platform);const linked=await social.account(platform);if(!linked)throw new AppError(409,'account_missing','Reconnect this account');
 const publisher=new VideoPublisher(c.db,social,c.materials);const spec=JSON.parse(row.spec??'{}');
 const r=await publisher.publish(platform,{platform,text:spec.title??a.topic,mediaUrls:[`storage:${row.output_material_id}`],options:{accountId:linked.account_id},idempotencyKey:`account:${row.id}`});
 if('pending' in r)await c.db.prepare("UPDATE account_automation_jobs SET status='publishing',publish_until=?,updated_at=? WHERE id=?").bind(new Date(Date.now()+60000).toISOString(),now(),row.id).run();
 else{await c.db.prepare("UPDATE account_automation_jobs SET status='published',external_id=?,external_url=?,publish_until=NULL,updated_at=? WHERE id=?").bind(r.externalId,r.externalUrl,now(),row.id).run();published++;}
 }catch(e){const uncertain=e instanceof PublishError&&e.kind==='ambiguous';await c.db.prepare('UPDATE account_automation_jobs SET status=?,error=?,publish_until=NULL,updated_at=? WHERE id=?').bind(uncertain?'needs_attention':'failed',uncertain?'Check Instagram before retrying; delivery may have occurred':'Publishing failed; check connection and permissions',now(),row.id).run();}
 }return {published};
}
