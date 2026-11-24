import {z} from 'zod';
import type {Env} from '../container.ts';
import type {Db} from '../db/database.ts';
import {AppError,notFound} from '../errors.ts';
import {equal,sign} from '../lib/crypto.ts';
import {Postiz} from './postiz.ts';
import {matchSilicon,thumbnailKey,thumbnailId,type Episode} from './silicon-footnote.ts';

export const youtubeEdition=z.object({title:z.string().trim().min(1).max(100),description:z.string().max(5000),variant:z.union([thumbnailId,z.literal('automatic')]).default('automatic')});
type Package=z.infer<typeof youtubeEdition>;
type Media={id:string;path:string};
type Publication={created:string;state:'sending'|'processing'|'published'|'error';postId?:string;url?:string;error?:string;target:string;description:string};

async function row<T>(db:Db,key:string):Promise<T|null>{
 const r=await db.prepare('SELECT last_result FROM job_state WHERE name=?').bind(key).first<{last_result:string}>();
 return r?JSON.parse(r.last_result):null;
}
async function write(db:Db,key:string,value:unknown){
 await db.prepare('INSERT INTO job_state(name,last_run_at,last_result) VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET last_run_at=excluded.last_run_at,last_result=excluded.last_result').bind(key,new Date().toISOString(),JSON.stringify(value)).run();
}
async function ready(db:Db,id:string){
 const e=await row<Episode>(db,'silicon-episode:'+z.uuid().parse(id));
 if(e?.status!=='ready')throw notFound('Ready episode',id);
 return e;
}
const assets=z.enum(['video','subject','evidence']);
function keyFor(e:Episode,kind:z.infer<typeof assets>){
 const id=e.mediaId??e.id;
 return kind==='video'?'silicon/'+id+'.mp4':thumbnailKey(id,kind);
}
function signingKey(env:Env){
 if(typeof env.SESSION_SECRET!=='string'||!env.SESSION_SECRET)throw new AppError(503,'signing_unavailable','Missing media signing configuration');
 return env.SESSION_SECRET;
}
export async function downloadEdition(db:Db,env:Env,id:string,file:string,until:string,signature:string){
 const kind=assets.parse(file.replace(/\.(mp4|jpg)$/,''));
 const expires=Number(until),now=Date.now()/1000;
 if(!Number.isSafeInteger(expires)||expires<now||expires>now+7205||!equal(signature,await sign('edition:'+id+':'+file+':'+until,signingKey(env))))throw new AppError(403,'invalid_link','Media link expired or invalid');
 const e=await ready(db,id),obj=await env.BUCKET!.get(keyFor(e,kind));
 if(!obj)throw notFound('Media',id);
 return new Response(obj.body,{headers:{'Content-Type':kind==='video'?'video/mp4':'image/jpeg','Content-Length':String(obj.size),'Cache-Control':'private, no-store'}});
}
export async function uploadEditionAsset(db:Db,env:Env,id:string,rawKind:string,origin:string){
 const kind=assets.parse(rawKind),e=await ready(db,id);
 const key='youtube-media:'+keyFor(e,kind);
 const prior=await row<Media>(db,key);
 if(prior)return {ready:true};
 const until=String(Math.floor(Date.now()/1000)+7200),file=kind+(kind==='video'?'.mp4':'.jpg');
 const signature=await sign('edition:'+id+':'+file+':'+until,signingKey(env));
 const url=new URL('/api/media/editions/'+id+'/'+file,origin);
 url.searchParams.set('expires',until);url.searchParams.set('signature',signature);
 const postiz=new Postiz(env);
 const uploaded=await postiz.request('/upload-from-url',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:url.href,adjust:false})});
 const media=z.object({id:z.string().min(1),path:z.url({protocol:/^https$/})}).parse(uploaded);
 await write(db,key,media);
 return {ready:true};
}
export async function editionStatus(db:Db,env:Env,id:string){
 const key='youtube-post:'+z.uuid().parse(id),p=await row<Publication>(db,key);
 if(!p)return {state:'ready'};
 if(p.state==='published')return {state:p.state,url:p.url,postId:p.postId,error:p.error};
 // Reconcile a lost create response by its unique description and verified integration.
 const service=new Postiz(env);
 const from=new Date(Date.parse(p.created)-86400000).toISOString();
 const range=new URLSearchParams({startDate:from,endDate:new Date(Date.now()+86400000).toISOString()});
 const data=await service.request('/posts?'+range);
 const matches=(Array.isArray(data.posts)?data.posts:[]).filter((v:{id:string;integration?:{id:string};content?:string})=>v.integration?.id===p.target&&(p.postId?v.id===p.postId:v.content===p.description));
 if(matches.length===1){
  const found=matches[0];p.postId=found.id;
  if(found.state==='ERROR' && found.error)p.error=String(found.error).replace(/https?:\/\/[^ ]+/g,'[provider link]').slice(0,1000);
  if(found.releaseURL)p.url=found.releaseURL;
  const thumbnailWarning=found.state==='ERROR'&&/^Your video was uploaded to YouTube successfully, but we could not set the thumbnail:/i.test(String(found.error));
  if((found.state==='PUBLISHED'||thumbnailWarning)&&found.releaseURL){p.state='published';p.url=found.releaseURL;}
  else p.state=found.state==='ERROR'?'error':'processing';
  await write(db,key,p);
 }
 return {state:p.state,postId:p.postId,url:p.url,error:p.error};
}
export async function publishEdition(db:Db,env:Env,id:string,pack:Package){
 const episode=await ready(db,id);
 const custom=pack.variant==='automatic'?undefined:pack.variant;
 if(custom&&!episode.thumbnails?.some(x=>x.id===custom))throw new AppError(409,'thumbnail_missing','Episode does not have that cover');
 const service=new Postiz(env),target=matchSilicon(await service.integrations());
 if(!target)throw new AppError(409,'channel_missing','Expected one connected Silicon Footnote YouTube channel');
 const asset=(kind:z.infer<typeof assets>)=>row<Media>(db,'youtube-media:'+keyFor(episode,kind));
 const [video,thumb]=await Promise.all([asset('video'),custom?asset(custom):null]);
 if(!video||(custom&&!thumb))throw new AppError(409,'uploads_pending','A required publication asset is missing');
 const key='youtube-post:'+id,created=new Date().toISOString();
 const p:Publication={created,state:'sending',target:target.id,description:pack.description};
 const reserve=await db.prepare('INSERT OR IGNORE INTO job_state(name,last_run_at,last_result) VALUES(?,?,?)').bind(key,created,JSON.stringify(p)).run();
 if(!reserve.meta.changes)return editionStatus(db,env,id);
 const result=await service.request('/posts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'now',date:created,shortLink:false,tags:[],posts:[{integration:{id:target.id},value:[{content:pack.description,image:[video]}],settings:{__type:'youtube',title:pack.title,type:'public',selfDeclaredMadeForKids:'no',made_with_ai:true,...(thumb?{thumbnail:thumb}:{})}}]})});
 const postId=Array.isArray(result)?result.find(x=>x.integration===target.id)?.postId:null;
 if(typeof postId!=='string')return editionStatus(db,env,id);
 await write(db,key,{...p,postId,state:'processing'});
 return {postId,state:'processing'};
}
