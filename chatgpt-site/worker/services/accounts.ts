import {HEDGY_POLICY,HEDGY_TOPIC} from '../hedgy-policy.ts';
import {QURIOZITY_POLICY} from '../quriozity-policy.ts';
import {z} from 'zod';
import type {Db} from '../db/database.ts';
import {AppError} from '../errors.ts';
const time=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const weekSchema=z.array(z.object({day:z.number().int().min(0).max(6),times:z.array(time).max(6).refine(v=>new Set(v).size===v.length,'Choose different start times')}).strict()).length(7).refine(v=>new Set(v.map(d=>d.day)).size===7,'Include each weekday once');
export const accountPatch=z.object({name:z.string().trim().min(1).max(80).optional(),postsPerDay:z.number().int().min(1).max(6).optional(),postingTime:time.optional(),timezone:z.string().max(80).refine(v=>{try{new Intl.DateTimeFormat('en',{timeZone:v});return true;}catch{return false;}}).optional(),enabled:z.boolean().optional(),week:weekSchema.optional(),postizIntegrationId:z.string().min(1).max(200).nullable().optional(),notifyResults:z.boolean().optional()}).strict();
export const accountCreate=z.object({name:z.string().trim().min(1).max(80),platform:z.enum(['instagram','tiktok','youtube','x','linkedin']).default('instagram'),topic:z.string().max(1000).default('')}).strict();
export interface Account {id:string;name:string;platform:string;topic:string;postsPerDay:number;postingTime:string;timezone:string;enabled:boolean;enabledSince?:string;week?:z.infer<typeof weekSchema>;postizIntegrationId?:string|null;notifyResults?:boolean;brand?:unknown}
export function accountWeek(a:Account){return a.week??Array.from({length:7},(_,day)=>({day,times:Array.from({length:a.postsPerDay},(_,i)=>{const [h=18,m=0]=a.postingTime.split(':').map(Number),n=(h*60+m+i*120)%1440;return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;}).sort()}));}
const parts=(d:Date,tz:string)=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(d).map(p=>[p.type,p.value]));
/** One occurrence per wall time. Skip spring DST gaps; choose one fall overlap. */
export function accountSlots(a:Account,at=new Date(),startDay=0,days=8){
 const p=parts(at,a.timezone),today=`${p.year}-${p.month}-${p.day}`,week=accountWeek(a),slots=[];
 for(let day=startDay;day<startDay+days;day++){
  const d=new Date(`${today}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+day);const date=d.toISOString().slice(0,10);
  for(const time of week.find(w=>w.day===(d.getUTCDay()+6)%7)!.times){
   const target=Date.parse(`${date}T${time}:00Z`);let utc=target;
   for(let n=0;n<4;n++){const q=parts(new Date(utc),a.timezone);utc+=target-Date.parse(`${q.year}-${q.month}-${q.day}T${q.hour}:${q.minute}:${q.second}Z`);}
   const q=parts(new Date(utc),a.timezone);if(`${q.year}-${q.month}-${q.day}T${q.hour}:${q.minute}`!==`${date}T${time}`)continue;
   slots.push({date,scheduledAt:new Date(utc).toISOString(),status:'planned'});
  }
 }return slots.sort((a,b)=>a.scheduledAt.localeCompare(b.scheduledAt));
}
export function presentAccount(a:Account){return {...a,week:accountWeek(a),postizIntegrationId:a.postizIntegrationId??null,notifyResults:a.notifyResults!==false,...(a.id==='hedgy'?{brand:HEDGY_POLICY,topic:HEDGY_TOPIC}:a.id==='quriozity'?{brand:QURIOZITY_POLICY}:{}),health:{state:'blocked' as const,issues:['Choose a Postiz account']},schedule:accountSlots(a).filter(s=>Date.parse(s.scheduledAt)>Date.now())};}
export async function listAccounts(db:Db){
 // Move the original brand atomically before seeding, retaining its plan and all related records.
 if(await db.prepare("SELECT id FROM accounts WHERE id='acryllex'").first())await db.batch([
  db.prepare("INSERT OR IGNORE INTO accounts(id,value,created_at,updated_at) SELECT 'quriozity',json_set(value,'$.id','quriozity','$.name','Quriozity','$.brand',json(?)),created_at,? FROM accounts WHERE id='acryllex'").bind(JSON.stringify(QURIOZITY_POLICY),new Date().toISOString()),
  db.prepare("UPDATE account_automation_jobs SET account_id='quriozity' WHERE account_id='acryllex'"),
  db.prepare("UPDATE account_runs SET account_id='quriozity' WHERE account_id='acryllex'"),
  db.prepare("UPDATE account_social_credentials SET workspace_account_id='quriozity' WHERE workspace_account_id='acryllex'"),
  db.prepare("UPDATE social_accounts SET workspace_account_id='quriozity' WHERE workspace_account_id='acryllex'"),
  db.prepare("UPDATE oauth_pending SET workspace_account_id='quriozity' WHERE workspace_account_id='acryllex'"),
  db.prepare("UPDATE job_state SET name='account_schedule:quriozity' WHERE name='account_schedule:acryllex'"),
  db.prepare("UPDATE job_state SET last_result=json_set(last_result,'$.accountId','quriozity','$.accountName','Quriozity') WHERE json_valid(last_result) AND json_extract(last_result,'$.accountId')='acryllex'"),
  db.prepare("DELETE FROM accounts WHERE id='acryllex'"),
 ]);
 const common={platform:'instagram',postsPerDay:1,timezone:'Europe/Zurich',enabled:false,notifyResults:true};
 const seeds=[{...common,id:'hedgy',name:'hedgy',topic:HEDGY_TOPIC,postingTime:'18:00',brand:HEDGY_POLICY},{...common,id:'quriozity',name:'Quriozity',topic:QURIOZITY_POLICY.topic,postingTime:'19:00',brand:QURIOZITY_POLICY}];
 for(const [i,a] of seeds.entries())await db.prepare('INSERT OR IGNORE INTO accounts(id,value,created_at,updated_at) VALUES(?,?,?,?)').bind(a.id,JSON.stringify(a),new Date(Date.now()+i).toISOString(),new Date().toISOString()).run();
 // Upgrade the stock brief on existing accounts, including accounts migrated from Acryllex.
 await db.prepare("UPDATE accounts SET value=json_set(value,'$.topic',?,'$.brand',json(?)) WHERE id='quriozity' AND json_extract(value,'$.topic')=?").bind(QURIOZITY_POLICY.topic,JSON.stringify(QURIOZITY_POLICY),'Curious explainers: things people are curious about but never thought about before (why we sleep and dream, why the blue LED was so hard to invent, why the sky is blue, why ice floats).').run();
 // Legacy accounts were enabled before they had an explicit publishing destination. Require a fresh Start.
 await db.prepare("UPDATE accounts SET value=json_set(value,'$.enabled',json('false'),'$.schedulerVersion',2) WHERE json_extract(value,'$.schedulerVersion') IS NULL").run();
 const rows=await db.prepare('SELECT value FROM accounts ORDER BY created_at,id').all<{value:string}>();return rows.results.map(row=>presentAccount(JSON.parse(row.value)));
}
export async function addAccount(db:Db,input:z.infer<typeof accountCreate>){const a:Account={...input,id:crypto.randomUUID(),postsPerDay:1,postingTime:'18:00',timezone:'Europe/Zurich',enabled:false,notifyResults:true};await db.prepare('INSERT INTO accounts(id,value,created_at,updated_at) VALUES(?,?,?,?)').bind(a.id,JSON.stringify(a),new Date().toISOString(),new Date().toISOString()).run();return presentAccount(a);}
export async function updateAccount(db:Db,id:string,patch:z.infer<typeof accountPatch>){
 const row=await db.prepare('SELECT value FROM accounts WHERE id=?').bind(id).first<{value:string}>();if(!row)throw new AppError(404,'not_found','Account not found');
 const old=JSON.parse(row.value),a={...old,...patch,id} as Account;
 if(patch.enabled===true&&!old.enabled)a.enabledSince=new Date().toISOString();
 const reset=patch.enabled===false||patch.week!==undefined||patch.timezone!==undefined||patch.postizIntegrationId!==undefined;
 const statements=[db.prepare('UPDATE accounts SET value=?,updated_at=? WHERE id=?').bind(JSON.stringify(a),new Date().toISOString(),id)];
 if(reset)statements.push(db.prepare("UPDATE account_automation_jobs SET status='cancelled',error='Stopped or schedule changed',updated_at=? WHERE account_id=? AND status='pending'").bind(new Date().toISOString(),id));
 await db.batch(statements);return presentAccount(a);
}
