import type { Db, Row } from '../db/database.ts';
import type { PlatformId } from '../domain/platforms.ts';
export type FeedbackVerdict = 'successful' | 'iterate' | 'discard' | null;
export interface FeedbackEntry { postId:string; platform:PlatformId; pillarId:string|null; format:string; verdict:FeedbackVerdict; notes:string; impressions?:number; engagements?:number; conversions?:number; updatedAt:string; }
export interface FormatInsight { format:string; platform:PlatformId; samples:number; successes:number; iterations:number; discards:number; recommendation:'explore'|'reuse'|'iterate'|'retire'; }
const num=(v:unknown):number|undefined=>v==null?undefined:Number(v);
const entry=(r:Row):FeedbackEntry=>({postId:r.post_id as string,platform:r.platform as PlatformId,pillarId:r.pillar_id as string|null,format:r.format as string,verdict:r.verdict as FeedbackVerdict,notes:r.notes as string,...(num(r.impressions)===undefined?{}:{impressions:num(r.impressions)}),...(num(r.engagements)===undefined?{}:{engagements:num(r.engagements)}),...(num(r.conversions)===undefined?{}:{conversions:num(r.conversions)}),updatedAt:r.updated_at as string});
export class FeedbackRepository {
 constructor(private readonly db:Db){}
 async list(scope?:{platform?:PlatformId;pillarId?:string|null}):Promise<{entries:FeedbackEntry[];formats:FormatInsight[]}>{
  const {results}=await this.db.prepare('SELECT f.*,p.platform,p.pillar_id,p.status AS post_status FROM post_feedback f JOIN posts p ON p.id=f.post_id ORDER BY f.updated_at DESC').all<Row>();
  const allEntries=results.map(entry);
  const entries=scope?allEntries.filter(e=>(!scope.platform||e.platform===scope.platform)&&(scope.pillarId===undefined||e.pillarId===scope.pillarId)):allEntries;
  const groups=new Map<string,FeedbackEntry[]>();
  for(const e of entries){const k=`${e.platform}\0${e.format.toLocaleLowerCase()}`;groups.set(k,[...(groups.get(k)??[]),e]);}
  const formats:FormatInsight[]=[];
  for(const group of groups.values()){const first=group[0]!,samples=group.length,successes=group.filter(x=>x.verdict==='successful').length,iterations=group.filter(x=>x.verdict==='iterate').length,discards=group.filter(x=>x.verdict==='discard').length;
   const published=group.filter(x=>results.find(r=>r.post_id===x.postId)?.post_status==='published');
   const measured=published.filter(x=>x.impressions!==undefined&&x.impressions>=100&&x.engagements!==undefined),rates=measured.map(x=>x.engagements!/Math.max(1,x.impressions!));
   const baseline=entries.filter(x=>x.platform===first.platform&&results.find(r=>r.post_id===x.postId)?.post_status==='published'&&x.impressions!==undefined&&x.impressions>=100&&x.engagements!==undefined).map(x=>x.engagements!/Math.max(1,x.impressions!));
   const mean=(values:number[])=>values.reduce((a,b)=>a+b,0)/Math.max(1,values.length);
   const weak=rates.length>=3&&baseline.length>=3&&mean(rates)<mean(baseline)*.7;
   const strong=rates.length>=3&&baseline.length>=3&&mean(rates)>mean(baseline);
   const recommendation:FormatInsight['recommendation']=discards>=5&&successes===0&&weak?'retire':successes>=2&&successes>discards?'reuse':iterations>=2&&iterations>successes||weak?'iterate':strong&&discards===0&&iterations===0?'reuse':'explore';
   formats.push({format:first.format,platform:first.platform,samples,successes,iterations,discards,recommendation});
  }
  return {entries,formats:formats.sort((a,b)=>a.platform.localeCompare(b.platform)||a.format.localeCompare(b.format))};
 }
 async get(postId:string):Promise<FeedbackEntry|null>{const r=await this.db.prepare('SELECT f.*,p.platform,p.pillar_id FROM post_feedback f JOIN posts p ON p.id=f.post_id WHERE f.post_id=?').bind(postId).first<Row>();return r?entry(r):null;}
 async save(input:Omit<FeedbackEntry,'platform'|'pillarId'>):Promise<void>{await this.db.prepare(`INSERT INTO post_feedback(post_id,format,verdict,notes,impressions,engagements,conversions,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(post_id) DO UPDATE SET format=excluded.format,verdict=excluded.verdict,notes=excluded.notes,impressions=excluded.impressions,engagements=excluded.engagements,conversions=excluded.conversions,updated_at=excluded.updated_at`).bind(input.postId,input.format,input.verdict,input.notes,input.impressions??null,input.engagements??null,input.conversions??null,input.updatedAt).run();}
 async context(platform:PlatformId,pillarId:string|null):Promise<FormatInsight[]>{return (await this.list({platform,pillarId})).formats;}
 async learning(platform:PlatformId,pillarId:string|null){const {entries,formats}=await this.list({platform,pillarId});const chosen=entries.slice(0,6);const evidence=await Promise.all(chosen.map(async e=>{const r=await this.db.prepare('SELECT body FROM posts WHERE id=?').bind(e.postId).first<{body:string}>();return {format:e.format,verdict:e.verdict,notes:e.notes.slice(0,300),body:(r?.body??'').slice(0,250)};}));return {formats,notes:evidence.map(e=>({format:e.format,verdict:e.verdict,notes:e.notes})),examples:evidence.filter(e=>e.verdict==='successful'||e.verdict==='discard').map(e=>({format:e.format,verdict:e.verdict,body:e.body}))};}
}
