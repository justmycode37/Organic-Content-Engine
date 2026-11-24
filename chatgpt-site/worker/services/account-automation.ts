import type {Container,Env} from '../container.ts';
import {AppError} from '../errors.ts';
import {listAccounts,accountSlots,type Account} from './accounts.ts';
import {Postiz} from './postiz.ts';
import {accountNotice} from './account-notifications.ts';
import {hasDefaultQuriozityProfile} from '../quriozity-model-policy.ts';
import {hedgyPostCaptionSchema} from '../hedgy-caption.ts';
const now=()=>new Date().toISOString();
const parse=(text:string|null)=>{try{return text?JSON.parse(text):{}}catch{return {}}};
export function reelHistory(row:{spec:string;provenance:string|null}){const spec=parse(row.spec),prov=parse(row.provenance),idea=prov.idea??(prov.plan?{topic:prov.plan.topic,topicKey:prov.topicKey}:{});return {title:spec.title,topic:idea.topic,topicKey:idea.topicKey,concept:idea.concept,item:idea.heroItem,setting:idea.setting,music:spec.music,musicBrief:spec.musicBrief,summary:Array.isArray(spec.scenes)?spec.scenes.map((s:{say?:string})=>s.say??'').join(' ').slice(0,200):undefined};}
export const runtime=(env:Env)=>Object.fromEntries(Object.entries(env).filter((e):e is [string,string]=>typeof e[1]==='string'));

// Reserve a UUID namespace for deterministic rounds and reuse the existing MP4 upload route.
const evaluationId = (round:number) => `ee08732d-7151-4d07-a150-${round.toString(16).padStart(12,'0')}`;
async function evaluationTarget(c:Container,env:Env) {
 const row=await c.db.prepare("SELECT value FROM accounts WHERE id='hedgy'").first<{value:string}>();
 const integrationId=parse(row?.value??null).postizIntegrationId;
 if(!integrationId)throw new AppError(409,'account_not_ready','Choose Hedgy’s connected Postiz Instagram destination first');
 return new Postiz(env).target(integrationId);
}

/** Reserve a publication job for an already-rendered round. It never enters the generation queue. */
export async function reserveHedgyEvaluation(c:Container,env:Env,round:number,digest:string,integrationId:string) {
 const id=evaluationId(round),at=now();
 let row=await c.db.prepare('SELECT * FROM account_automation_jobs WHERE id=?').bind(id).first<any>();
 if(!row){
  const target=await evaluationTarget(c,env);
  if(target.id!==integrationId)throw new AppError(409,'account_mismatch','The configured Hedgy destination differs from the chosen destination');
  if(c.config.publishMode!=='live'||(await c.settings.get()).publishingPaused)throw new AppError(409,'publishing_paused','The Site is not accepting live publication');
  await c.db.prepare("INSERT OR IGNORE INTO account_automation_jobs(id,account_id,scheduled_at,status,provenance,created_at,updated_at) VALUES(?,'hedgy',?,'leased',?,?,?)")
   .bind(id,at,JSON.stringify({delivery:target,hedgyEvaluationRound:round,evaluationDigest:digest}),at,at).run();
  row=await c.db.prepare('SELECT * FROM account_automation_jobs WHERE id=?').bind(id).first<any>();
 }
 const provenance=parse(row?.provenance??null);
 if(provenance.evaluationDigest!==digest||provenance.delivery?.id!==integrationId)throw new AppError(409,'evaluation_conflict','This round is reserved for a different video or destination');
 if(row.spec)return {id,status:row.status,url:row.external_url};
 const lease=row.lease_id??crypto.randomUUID();
 const renewed=await c.db.prepare("UPDATE account_automation_jobs SET status='leased',lease_id=COALESCE(lease_id,?),lease_until=?,error=NULL,updated_at=? WHERE id=? AND spec IS NULL AND status IN ('leased','needs_attention') RETURNING lease_id")
  .bind(lease,new Date(Date.now()+20*60000).toISOString(),at,id).first<{lease_id:string}>();
 if(!renewed)throw new AppError(409,'evaluation_state','Reload the current publication status before continuing');
 return {id,status:'leased',lease:renewed.lease_id};
}

export async function hedgyEvaluationStatus(c:Container,env:Env,round:number) {
 const row=await c.db.prepare('SELECT id,status,external_url,error,post_id,provenance FROM account_automation_jobs WHERE id=?')
  .bind(evaluationId(round)).first<{id:string;status:string;external_url:string|null;error:string|null;post_id:string|null;provenance:string|null}>();
 if(row)return {id:row.id,status:row.status,url:row.external_url,error:row.error,postId:row.post_id};
 const target=await evaluationTarget(c,env);
 return {status:'ready',destination:{id:target.id,name:target.name,profile:target.profile}};
}
/** Queue one extra Quriozity run without changing its recurring schedule. */
export async function scheduleQuriozityRun(c:Container,env:Env,scheduledAt:string){
 if(!Number.isFinite(Date.parse(scheduledAt))||Date.parse(scheduledAt)<=Date.now())throw new AppError(400,'schedule_invalid','Choose a future generation start');
 const row=await c.db.prepare("SELECT value FROM accounts WHERE id='quriozity'").first<{value:string}>();
 const account=row?JSON.parse(row.value):null;
 if(!account?.enabled||!account.postizIntegrationId)throw new AppError(409,'account_not_ready','Start Quriozity with a connected publishing account first');
 const target=await new Postiz(env).target(account.postizIntegrationId),at=new Date(scheduledAt).toISOString();
 await c.db.prepare("INSERT OR IGNORE INTO account_automation_jobs(id,account_id,scheduled_at,status,provenance,created_at,updated_at) VALUES(?,'quriozity',?,'pending',?,?,?)").bind(crypto.randomUUID(),at,JSON.stringify({delivery:target,oneOff:true}),now(),now()).run();
 return {job:await c.db.prepare("SELECT id,account_id,scheduled_at,status FROM account_automation_jobs WHERE account_id='quriozity' AND scheduled_at=?").bind(at).first()};
}
export async function tickAccounts(c:Container,env:Env){
 const at=new Date(),tickAt=at.toISOString(),accounts=await listAccounts(c.db),postiz=new Postiz(env);let queued=0;
 const enabled=accounts.filter(a=>a.enabled&&a.platform==='instagram'&&['hedgy','quriozity'].includes(a.id)&&a.postizIntegrationId);
 if(!enabled.length||!postiz.configured)return {queued};
 const targets=await postiz.integrations();
 for(const a of enabled){
  const target=targets.find(t=>t.id===a.postizIntegrationId&&!t.disabled);if(!target)continue;
  const previous=await c.settings.getJob(`account_schedule:${a.id}`),since=Math.max(Date.parse(a.enabledSince??tickAt),previous.lastRunAt?Date.parse(previous.lastRunAt):at.getTime()-86400000,at.getTime()-86400000);
  for(const slot of accountSlots(a,at,-1,3).filter(s=>Date.parse(s.scheduledAt)>=since&&Date.parse(s.scheduledAt)<=at.getTime())){
   const missed=Date.now()-Date.parse(slot.scheduledAt)>15*60000,id=crypto.randomUUID();
   const r=await c.db.prepare('INSERT OR IGNORE INTO account_automation_jobs(id,account_id,scheduled_at,status,provenance,error,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,a.id,slot.scheduledAt,missed?'failed':'pending',JSON.stringify({delivery:target}),missed?'Generation start missed while worker was offline':null,now(),now()).run();
   if(r.meta.changes){if(missed)await accountNotice(c,{id,account_id:a.id,scheduled_at:slot.scheduledAt},'failed','Generation start missed while worker was offline');else queued++;}
  }
  await c.settings.setJob(`account_schedule:${a.id}`,tickAt,{});
 }return {queued};
}
export async function claimAccountJob(c:Container){
 await c.settings.setJob('account_worker',now(),{online:true});
 const expired=await c.db.prepare("UPDATE account_automation_jobs SET status='needs_attention',error='Worker stopped during production; inspect cached output before retrying',lease_id=NULL,updated_at=? WHERE status='leased' AND lease_until<? RETURNING *").bind(now(),now()).all<any>();
 for(const row of expired.results)await accountNotice(c,row,'needs_attention',row.error);
 const lease=crypto.randomUUID(),until=new Date(Date.now()+20*60000).toISOString();
 const row=await c.db.prepare("UPDATE account_automation_jobs SET status='leased',lease_id=?,lease_until=?,attempts=attempts+1,updated_at=? WHERE id=(SELECT j.id FROM account_automation_jobs j JOIN accounts a ON a.id=j.account_id WHERE j.status='pending' AND j.scheduled_at<=? AND json_extract(a.value,'$.enabled')=1 AND a.id IN ('hedgy','quriozity') ORDER BY j.scheduled_at LIMIT 1) AND status='pending' RETURNING *").bind(lease,until,now(),now()).first<any>();
 if(!row)return {job:null};const a=await c.db.prepare('SELECT value FROM accounts WHERE id=?').bind(row.account_id).first<{value:string}>();
 const past=await c.db.prepare('SELECT spec,provenance FROM account_automation_jobs WHERE account_id=? AND id<>? AND spec IS NOT NULL ORDER BY scheduled_at DESC LIMIT 2000').bind(row.account_id,row.id).all<{spec:string;provenance:string|null}>();
 return {job:{id:row.id,lease,account:JSON.parse(a!.value),scheduledAt:row.scheduled_at,history:past.results.map(reelHistory)}};
}
export async function accountLease(c:Container,id:string,lease:string){const row=await c.db.prepare("SELECT * FROM account_automation_jobs WHERE id=? AND lease_id=? AND status='leased' AND lease_until>?").bind(id,lease,now()).first<any>();if(!row)throw new AppError(409,'stale_lease','This job is no longer leased to this worker');return row;}
export async function heartbeatAccountJob(c:Container,id:string,lease:string){await accountLease(c,id,lease);await c.db.prepare('UPDATE account_automation_jobs SET lease_until=?,updated_at=? WHERE id=? AND lease_id=?').bind(new Date(Date.now()+20*60000).toISOString(),now(),id,lease).run();await c.settings.setJob('account_worker',now(),{online:true});return {ok:true};}
export async function completeAccountJob(c:Container,id:string,lease:string,input:{materialId:string;spec:unknown;provenance:unknown}){
 const done=await c.db.prepare("SELECT id FROM account_automation_jobs WHERE id=? AND lease_id=? AND status='completed' AND output_material_id=?").bind(id,lease,input.materialId).first();if(done)return{ok:true};
 const row=await accountLease(c,id,lease);if(row.output_material_id!==input.materialId)throw new AppError(409,'output_mismatch','This output belongs to another job');
 const m=await c.materials.get(input.materialId);if(!m.uploaded||m.kind!=='finished'||m.mime!=='video/mp4')throw new AppError(409,'output_invalid','Upload a finished MP4 first');
 const original=parse(row.provenance);
 if(original.hedgyEvaluationRound!==undefined){
  const spec=input.spec as {series?:string;postCaption?:string}|null;
  if(spec?.series!=='HEDGY / FINANCE'||!hedgyPostCaptionSchema.safeParse(spec.postCaption).success)throw new AppError(422,'evaluation_spec_invalid','A finished Hedgy reel and its reviewed Instagram caption are required');
 }
 if(row.account_id==='quriozity'){
  const p=input.provenance as any,stages=['visual-subject-review','visual-composition-review','visual-continuity-review','visual-style-reference-review','visual-final-review'];
  const reviewed=(r:any)=>r?.passed===true||p?.publicationPolicy==='best-reviewed-after-limits'&&r?.selectedBest===true&&r.attempts?.length>0&&typeof r.selectionReason==='string';
  if(!p||p.reviewsDisabled||p.modelRouting?.variant||!hasDefaultQuriozityProfile(p)||stages.some(s=>!reviewed(p[s]))||!reviewed(p.voiceReview)||!p.styleReference?.hash||!p.mixStatsFinal||!['fact-check+coherence','storyboard-review','sound-review'].every(s=>p.steps?.includes(s)))throw new AppError(409,'reviews_required','Quriozity requires every review stage or a documented best-reviewed selection after its limits');
 }
 const provenance={...(input.provenance as object),delivery:original.delivery,hedgyEvaluationRound:original.hedgyEvaluationRound,evaluationDigest:original.evaluationDigest};
 await c.db.prepare("UPDATE account_automation_jobs SET status='completed',spec=?,provenance=?,error=NULL,updated_at=? WHERE id=? AND lease_id=? AND status='leased'").bind(JSON.stringify(input.spec),JSON.stringify(provenance),now(),id,lease).run();
 await accountNotice(c,row,'generated','Reel generation and required reviews completed. Awaiting publication.');return {ok:true};
}
export async function failAccountJob(c:Container,id:string,lease:string,input:{code:string;message:string}){const row=await accountLease(c,id,lease),message=c.redact(input.message).slice(0,300);await c.db.prepare("UPDATE account_automation_jobs SET status='failed',error=?,updated_at=? WHERE id=? AND lease_id=?").bind(message,now(),id,lease).run();await accountNotice(c,row,'failed',message);return {ok:true};}
/** Publication is non-idempotent at Postiz: persist the send boundary and never blindly retry it. */
export async function publishAccountJobs(c:Container,env:Env){
 const paused=(await c.settings.get()).publishingPaused,postiz=new Postiz(env);let published=0;
 const jobs=await c.db.prepare("SELECT j.*,a.value FROM account_automation_jobs j JOIN accounts a ON a.id=j.account_id WHERE j.status IN ('completed','publishing') AND j.scheduled_at<=? AND (j.publish_until IS NULL OR j.publish_until<?) ORDER BY j.scheduled_at LIMIT 5").bind(now(),now()).all<any>();
 for(const row of jobs.results){
  const a=JSON.parse(row.value) as Account,provenance=parse(row.provenance);
  const evaluation=typeof provenance.hedgyEvaluationRound==='number';
  if(row.status==='completed'&&(paused||!evaluation&&!a.enabled))continue;
  const until=new Date(Date.now()+5*60000).toISOString(),claimed=await c.db.prepare('UPDATE account_automation_jobs SET publish_until=? WHERE id=? AND (publish_until IS NULL OR publish_until<?)').bind(until,row.id,now()).run();if(!claimed.meta.changes)continue;
  let sending=false;
  try{
   const target=provenance.delivery;
   if(row.status==='publishing'&&!row.post_id)throw new AppError(409,'ambiguous_publish','A previous Postiz request may have succeeded. Check Postiz before retrying.');
   if(row.post_id){
    const p=await postiz.status(row.post_id,row.created_at);
    if(p?.integration?.id&&p.integration.id!==target?.id)throw new AppError(409,'account_mismatch','Postiz returned another account');
    if(p?.state==='PUBLISHED'){
     const url=p.releaseURL?.startsWith('https://')?p.releaseURL:null;
     await c.db.prepare("UPDATE account_automation_jobs SET status='published',external_id=?,external_url=?,error=NULL,publish_until=NULL,updated_at=? WHERE id=?").bind(p.id,url,now(),row.id).run();await accountNotice(c,row,'published','Instagram confirmed publication.',url??undefined);published++;continue;
    }
    if(p?.state==='ERROR')throw new AppError(409,'postiz_post_failed','Instagram publication failed. Open Postiz for the provider error.');
    if(Date.now()-Date.parse(row.updated_at)>24*3600000)throw new AppError(409,'ambiguous_publish','Postiz has not confirmed publication within 24 hours. Check Postiz.');
    await c.db.prepare('UPDATE account_automation_jobs SET publish_until=? WHERE id=?').bind(new Date(Date.now()+60000).toISOString(),row.id).run();continue;
   }
   if(!target?.id||target.id!==a.postizIntegrationId)throw new AppError(409,'account_mismatch','Destination changed. This reel requires review before publishing.');
   await postiz.target(target.id);
   if(c.config.publishMode!=='live')throw new AppError(409,'publishing_not_live','Live publishing is not enabled');
   const m=await c.materials.get(row.output_material_id);if(m.kind!=='finished'||!m.uploaded)throw new AppError(409,'output_invalid','Finished media is required');
   const uploadState=await c.settings.getJob(`account_upload:${row.id}`);let media=uploadState.lastResult as {id:string;path:string}|null;
   if(!media){const file=await c.materials.read(m.id);media=await postiz.upload(file.stream,m.name);await c.settings.setJob(`account_upload:${row.id}`,now(),media);}
   // Re-read the stop control after upload and immediately before the irreversible send.
   const current=await c.db.prepare('SELECT value FROM accounts WHERE id=?').bind(a.id).first<{value:string}>();const latest=JSON.parse(current!.value);
   if((!evaluation&&!latest.enabled)||(await c.settings.get()).publishingPaused) {await c.db.prepare('UPDATE account_automation_jobs SET publish_until=NULL WHERE id=?').bind(row.id).run();continue;}
   if(latest.postizIntegrationId!==target.id)throw new AppError(409,'account_mismatch','Destination changed during upload');
   await c.db.prepare("UPDATE account_automation_jobs SET status='publishing',updated_at=? WHERE id=?").bind(now(),row.id).run();sending=true;
   const spec=parse(row.spec),caption=a.id==='hedgy'&&typeof spec.postCaption==='string'&&spec.postCaption.trim()?spec.postCaption:spec.title??a.topic;
   const id=await postiz.create(target,media,caption);
   await c.db.prepare('UPDATE account_automation_jobs SET post_id=?,publish_until=?,updated_at=? WHERE id=?').bind(id,new Date(Date.now()+60000).toISOString(),now(),row.id).run();
  }catch(e){
   // Status polling is safe to retry; creation is not. Keep a known Postiz ID for reconciliation.
   if(row.post_id&&e instanceof AppError&&e.status===502){await c.db.prepare('UPDATE account_automation_jobs SET publish_until=?,error=? WHERE id=?').bind(new Date(Date.now()+60000).toISOString(),e.message,row.id).run();continue;}
   const uncertain=sending||(e instanceof AppError&&e.code==='ambiguous_publish'),status=uncertain?'needs_attention':'failed',message=e instanceof AppError?e.message:'Publishing failed. Check the Postiz connection.';
   await c.db.prepare('UPDATE account_automation_jobs SET status=?,error=?,publish_until=NULL,updated_at=? WHERE id=?').bind(status,message,now(),row.id).run();await accountNotice(c,row,status,message);
  }
 }return {published,paused};
}
