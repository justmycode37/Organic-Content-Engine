import type { Db } from '../db/database.ts';
import { AppError,notFound } from '../errors.ts';
import { sign,equal } from '../lib/crypto.ts';
/** `raw_clip` is unedited generated footage; it must be finished in the Studio before it can be scheduled. */
export type MaterialKind='source'|'raw_clip'|'finished'|'voiceover';
export interface Material{id:string;name:string;mime:string;size:number;notes:string;enabled:boolean;createdAt:string;pathname:string;uploaded:number;kind:MaterialKind}
/** Legacy Monid imports predate the kind column; classify them without a database backfill. */
const legacyKind=(m:Material):MaterialKind=>m.kind==='source'&&/^generated-.*\.mp4$/i.test(m.name)&&/^Generated through Monid\./i.test(m.notes)?'raw_clip':m.kind;
export class Materials{
  db:Db;bucket:R2Bucket|undefined;env:Record<string,string|undefined>;
  constructor(db:Db,bucket:R2Bucket|undefined,env:Record<string,string|undefined>){this.db=db;this.bucket=bucket;this.env=env;}
  private storage(){if(!this.bucket)throw new AppError(503,'storage_unavailable','File storage is not provisioned yet');return this.bucket;}
  async list(){const {results}=await this.db.prepare('SELECT id,name,mime,size,notes,enabled,kind,created_at AS createdAt FROM materials WHERE uploaded=1 ORDER BY created_at DESC').all<Material>();return results.map(m=>({...m,kind:legacyKind(m),enabled:Boolean(m.enabled)}));}
  async get(id:string){const m=await this.db.prepare('SELECT *,created_at AS createdAt FROM materials WHERE id=?').bind(id).first<Material>();if(!m)throw notFound('Material',id);return {...m,kind:legacyKind(m),enabled:Boolean(m.enabled)};}
  async init(input:{name:string;mime:string;size:number;kind?:MaterialKind}){this.storage();const id=crypto.randomUUID(),now=new Date().toISOString();await this.db.prepare('INSERT INTO materials (id,name,mime,size,created_at,pathname,uploaded,kind) VALUES (?,?,?,?,?,?,0,?)').bind(id,input.name,input.mime||'application/octet-stream',input.size,now,`materials/${id}`,input.kind??'source').run();return this.get(id);}
  async upload(id:string,body:ReadableStream,length:number){const m=await this.get(id);if(m.uploaded)throw new AppError(409,'already_uploaded','This file is already uploaded');if(length!==m.size)throw new AppError(400,'size_mismatch','Upload size does not match the selected file');const object=await this.storage().put(m.pathname,body,{httpMetadata:{contentType:m.mime}});if(!object||object.size!==m.size){await this.storage().delete(m.pathname);throw new AppError(400,'size_mismatch','Upload was incomplete');}await this.db.prepare('UPDATE materials SET uploaded=1 WHERE id=?').bind(id).run();return this.get(id);}
  async update(id:string,patch:{notes?:string;enabled?:boolean}){const m=await this.get(id);await this.db.prepare('UPDATE materials SET notes=?,enabled=? WHERE id=?').bind(patch.notes??m.notes,Number(patch.enabled??m.enabled),id).run();return this.get(id);}
  async setKind(id:string,kind:MaterialKind){await this.db.prepare('UPDATE materials SET kind=? WHERE id=?').bind(kind,id).run();return this.get(id);}
  async remove(id:string){const m=await this.get(id);const used=await this.db.prepare("SELECT 1 FROM posts WHERE media_urls LIKE ? AND status IN ('scheduled','publishing','processing')").bind(`%storage:${id}%`).first();if(used)throw new AppError(409,'media_in_use','Finish or unschedule posts using this file before deleting it');await this.storage().delete(m.pathname);await this.db.prepare('DELETE FROM materials WHERE id=?').bind(id).run();}
  async read(id:string,range?:string){const material=await this.get(id);if(!material.uploaded)throw notFound('File',id);const object=await this.storage().get(material.pathname,range?{range:new Headers({range})}:undefined);if(!object)throw notFound('File',id);return {material,object,stream:object.body};}
  async signedUrl(id:string){const expires=Math.floor(Date.now()/1000)+172800;const signature=await sign(`media:${id}:${expires}`,this.env.SESSION_SECRET!);return `${this.env.PUBLIC_BASE_URL}/api/media/${encodeURIComponent(id)}?expires=${expires}&signature=${signature}`;}
  async validSignature(id:string,expires:string,signature:string){if(!/^\d+$/.test(expires)||Number(expires)<Date.now()/1000||Number(expires)>Date.now()/1000+172810)return false;return equal(signature,await sign(`media:${id}:${expires}`,this.env.SESSION_SECRET!));}
  async context(){let left=24000;const parts=[];for(const m of (await this.list()).filter(m=>m.enabled).slice(0,30)){let text='';if((/^text\//.test(m.mime)||/\.(txt|md|csv|json|srt|vtt)$/i.test(m.name))&&m.size<=1024*1024){text=(await (await this.read(m.id)).object.text()).slice(0,8000);}const part=JSON.stringify({id:m.id,name:m.name,notes:m.notes,text}).slice(0,left);left-=part.length;parts.push(part);}return parts.join('\n');}
}
