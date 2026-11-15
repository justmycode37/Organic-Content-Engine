import type {Env} from '../container.ts';
import {AppError} from '../errors.ts';
export interface PostizIntegration {id:string;name:string;identifier:string;profile?:string;disabled:boolean}
export class Postiz {
 private env:Env;
 private send:typeof fetch;
 constructor(env:Env,send:typeof fetch=fetch){this.env=env;this.send=send;}
 get configured(){return typeof this.env.POSTIZ_API_KEY==='string'&&!!this.env.POSTIZ_API_KEY.trim();}
 async request(path:string,init:RequestInit={}){
  if(!this.configured)throw new AppError(503,'postiz_setup','Postiz API key is not configured');
  const send=this.send;let r:Response;try{r=await send(`https://api.postiz.com/public/v1${path}`,{...init,headers:{...init.headers,Authorization:String(this.env.POSTIZ_API_KEY)},redirect:'manual',signal:AbortSignal.timeout(90000)});}catch{throw new AppError(502,'postiz_unavailable','Postiz did not return a response');}
  if(!r.ok)throw new AppError(502,'postiz_rejected',`Postiz request failed (${r.status}). Check account access and API limits.`);
  try{return await r.json() as any;}catch{throw new AppError(502,'postiz_invalid','Postiz returned an invalid response');}
 }
 async integrations():Promise<PostizIntegration[]>{const rows=await this.request('/integrations');if(!Array.isArray(rows))throw new AppError(502,'postiz_invalid','Postiz account list is invalid');return rows.filter(x=>['instagram','instagram-standalone'].includes(x.identifier)).map(x=>({id:x.id,name:x.name,identifier:x.identifier,profile:x.profile,disabled:!!x.disabled}));}
 async target(id:string){const a=(await this.integrations()).find(x=>x.id===id&&!x.disabled);if(!a)throw new AppError(409,'postiz_account_missing','This Instagram account is unavailable in Postiz');return a;}
 async upload(source:ReadableStream<Uint8Array>,name:string){
  // Stream private R2 media through multipart instead of buffering a 100 MB reel in a 128 MB Worker.
  const boundary=`oce-${crypto.randomUUID()}`,encode=new TextEncoder(),reader=source.getReader();let phase=0;
  const prefix=encode.encode(`--${boundary}\r\nContent-Disposition: form-data; name="adjust"\r\n\r\nfalse\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name.replace(/[^a-zA-Z0-9._-]/g,'_')}"\r\nContent-Type: video/mp4\r\n\r\n`),suffix=encode.encode(`\r\n--${boundary}--\r\n`);
  const body=new ReadableStream<Uint8Array>({async pull(controller){if(phase===0){phase=1;controller.enqueue(prefix);return;}const r=await reader.read();if(!r.done)controller.enqueue(r.value);else{controller.enqueue(suffix);controller.close();}},cancel(reason){return reader.cancel(reason);}});
  const media=await this.request('/upload',{method:'POST',headers:{'Content-Type':`multipart/form-data; boundary=${boundary}`},body});
  if(!media.id||typeof media.path!=='string'||!media.path.startsWith('https://')||media.status==='processing')throw new AppError(502,'postiz_media_invalid','Postiz media is not ready');return {id:media.id,path:media.path};
 }
 async create(target:PostizIntegration,media:{id:string;path:string},caption:string){const result=await this.request('/posts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'now',date:new Date().toISOString(),shortLink:false,tags:[],posts:[{integration:{id:target.id},value:[{content:caption,image:[media]}],settings:{__type:target.identifier,post_type:'post',is_trial_reel:false,collaborators:[]}}]})});const id=Array.isArray(result)?result.find(x=>x.integration===target.id)?.postId:undefined;if(typeof id!=='string'||!id)throw new AppError(502,'postiz_invalid','Postiz did not confirm a post ID');return id;}
 async status(id:string,createdAt:string){const startDate=new Date(Date.parse(createdAt)-86400000).toISOString(),endDate=new Date(Date.now()+86400000).toISOString();const result=await this.request(`/posts?${new URLSearchParams({startDate,endDate})}`);if(!Array.isArray(result.posts))throw new AppError(502,'postiz_invalid','Postiz post status is unavailable');return result.posts.find((p:any)=>p.id===id) as {id:string;state:string;releaseURL?:string;error?:string;integration?:{id:string}}|undefined;}
}
