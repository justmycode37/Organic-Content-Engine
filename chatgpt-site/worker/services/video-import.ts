import type {Container} from '../container.ts';
import {AppError,notFound} from '../errors.ts';
export const allowedVideoHost=(hostname:string)=>['monid.ai','minimax.io','minimaxi.com','minimaxi.chat','minimaxi.video','fal.media','replicate.delivery','volces.com','bytepluscdn.com','cloudfront.net'].some(domain=>hostname===domain||hostname.endsWith(`.${domain}`));
export async function saveVideoResult(c:Container,input:{jobId:string;url:string;runId:string}){
 const job=await c.db.prepare("SELECT kind,status,result FROM generation_jobs WHERE id=?").bind(input.jobId).first<{kind:string;status:string;result:string|null}>();if(!job)throw notFound('Generation request',input.jobId);if(job.kind!=='video')throw new AppError(400,'invalid_request','This request is not for a video');if(job.status==='completed')return JSON.parse(job.result??'{}');
 const url=new URL(input.url);if(url.protocol!=='https:'||url.port||url.username||url.password||!allowedVideoHost(url.hostname))throw new AppError(422,'download_host_unsupported','This video host cannot be imported automatically. Download the completed result and upload it in Storage.');
 const now=new Date();if(!await c.settings.acquireLock(`generation:${input.jobId}`,now.toISOString(),new Date(now.getTime()+120000).toISOString()))throw new AppError(409,'import_busy','Video import is already in progress');
 try{
  const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(60000)});const size=Number(response.headers.get('content-length'));if(!response.ok||!response.body||!size||size>100*1024*1024||!Number.isInteger(size))throw new AppError(422,'video_download_failed','Video download failed, has an unknown size, or exceeds 100 MB');
  const mime=response.headers.get('content-type')?.split(';')[0];if(mime!=='video/mp4'&&mime!=='application/octet-stream')throw new AppError(422,'video_format','Generated video must be MP4');
  const material=await c.materials.init({name:`generated-${input.jobId}.mp4`,mime:'video/mp4',size});await c.materials.upload(material.id,response.body,size);
  await c.materials.update(material.id,{notes:`Generated through Monid. Run ${input.runId}. Review the video and disclose synthetic content when publishing.`});
  const result={materialId:material.id,runId:input.runId};await c.db.prepare("UPDATE generation_jobs SET status='completed',result=? WHERE id=?").bind(JSON.stringify(result),input.jobId).run();return result;
 }finally{await c.settings.releaseLock(`generation:${input.jobId}`);}
}
