import type {Container} from '../container.ts';
/** Durable, idempotent events. A ChatGPT task acknowledges only after reporting them. */
export async function accountNotice(c:Container,job:{id:string;account_id:string;scheduled_at:string},status:string,message:string,url?:string){
 const row=await c.db.prepare('SELECT value FROM accounts WHERE id=?').bind(job.account_id).first<{value:string}>();const a=row?JSON.parse(row.value):{};if(a.notifyResults===false)return;
 const id=`account_notice:${job.id}:${status}`,at=new Date().toISOString();
 await c.db.prepare('INSERT OR IGNORE INTO job_state(name,last_run_at,last_result) VALUES(?,?,?)').bind(id,at,JSON.stringify({id,accountId:job.account_id,accountName:a.name??job.account_id,scheduledAt:job.scheduled_at,status,message,url,at,acknowledged:false})).run();
}
export async function accountNotices(c:Container){const rows=await c.db.prepare("SELECT last_result FROM job_state WHERE name LIKE 'account_notice:%' AND json_extract(last_result,'$.acknowledged')=0 ORDER BY last_run_at,name LIMIT 50").all<{last_result:string}>();return rows.results.map(r=>JSON.parse(r.last_result));}
export async function acknowledgeNotices(c:Container,ids:string[]){if(ids.length)await c.db.batch(ids.map(id=>c.db.prepare("UPDATE job_state SET last_result=json_set(last_result,'$.acknowledged',json('true')) WHERE name=? AND name LIKE 'account_notice:%'").bind(id)));return {acknowledged:ids.length};}
