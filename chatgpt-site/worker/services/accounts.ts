import {HEDGY_POLICY} from '../hedgy-policy.ts';
import {z} from 'zod';
import type {Db} from '../db/database.ts';
import {AppError} from '../errors.ts';
export const accountPatch=z.object({name:z.string().trim().min(1).max(80).optional(),postsPerDay:z.number().int().min(1).max(6).optional(),postingTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),timezone:z.string().max(80).refine(v=>{try{new Intl.DateTimeFormat('en',{timeZone:v});return true;}catch{return false;}}).optional(),enabled:z.boolean().optional()}).strict();
export const accountCreate=z.object({name:z.string().trim().min(1).max(80),platform:z.enum(['instagram','tiktok','youtube','x','linkedin']).default('instagram'),topic:z.string().max(1000).default('')}).strict();
interface Account {id:string;name:string;platform:string;topic:string;postsPerDay:number;postingTime:string;timezone:string;enabled:boolean;brand?:unknown}
export async function listAccounts(db:Db){
const seed={id:'hedgy',name:'hedgy',platform:'instagram',topic:'Simple quantitative finance and market explainers with relatable analogies',postsPerDay:1,postingTime:'18:00',timezone:'Europe/Zurich',enabled:true,brand:HEDGY_POLICY};
await db.prepare('INSERT OR IGNORE INTO accounts(id,value,created_at,updated_at) VALUES(?,?,?,?)').bind(seed.id,JSON.stringify(seed),new Date().toISOString(),new Date().toISOString()).run();const rows=await db.prepare('SELECT value FROM accounts ORDER BY created_at,id').all<{value:string}>();return rows.results.map(row=>present(JSON.parse(row.value) as Account));}
function present(a:Account){
 const issues=['Connect this account'];
 if(!a.enabled)issues.unshift('Automation paused');
 // Convert each local calendar time to UTC, including DST, independently of server timezone.
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:a.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const schedule=[];
 for(let day=0;day<7;day++)for(let slot=0;slot<a.postsPerDay;slot++){
 const date=new Date(`${today}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+day);const dateText=date.toISOString().slice(0,10);
 const [h=18,m=0]=a.postingTime.split(':').map(Number);const target=Date.parse(`${dateText}T00:00:00Z`)+(h*60+m+Math.floor(slot*1440/a.postsPerDay))*60000;
 let utc=target;for(let n=0;n<3;n++){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:a.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(utc));const p=Object.fromEntries(parts.map(v=>[v.type,v.value]));const represented=Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);utc+=target-represented;}
 if(utc>Date.now())schedule.push({date:dateText,scheduledAt:new Date(utc).toISOString(),status:'blocked'});
 }
 return {...a,...(a.id==='hedgy'?{brand:HEDGY_POLICY}:{}),health:{state:'blocked' as const,issues},schedule};
}
export async function addAccount(db:Db,input:z.infer<typeof accountCreate>){const a:Account={...input,id:crypto.randomUUID(),postsPerDay:1,postingTime:'18:00',timezone:'Europe/Zurich',enabled:true};await db.prepare('INSERT INTO accounts(id,value,created_at,updated_at) VALUES(?,?,?,?)').bind(a.id,JSON.stringify(a),new Date().toISOString(),new Date().toISOString()).run();return present(a);}
export async function updateAccount(db:Db,id:string,patch:z.infer<typeof accountPatch>){const row=await db.prepare('SELECT value FROM accounts WHERE id=?').bind(id).first<{value:string}>();if(!row)throw new AppError(404,'not_found','Account not found');const a={...JSON.parse(row.value),...patch,id} as Account;await db.prepare('UPDATE accounts SET value=?,updated_at=? WHERE id=?').bind(JSON.stringify(a),new Date().toISOString(),id).run();return present(a);}
