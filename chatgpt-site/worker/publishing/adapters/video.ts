import type { Db } from '../../db/database.ts';
import { Materials } from '../../services/materials.ts';
import { SocialAccounts,type SocialPlatform } from '../../services/social.ts';
import { PublishError,type PublishingAdapter,type PublishRequest,type PublishResult } from '../types.ts';
export interface PublishOptions {title?:string;privacy?:string;madeForKids?:boolean;synthetic?:boolean;allowComment?:boolean;allowDuet?:boolean;allowStitch?:boolean;commercial?:boolean;ownBrand?:boolean;branded?:boolean;consent?:boolean;accountId?:string;duration?:number}
interface Job {key:string;platform:string;account_id:string;stage:string;data:string;updated_at:string}
const pending=():PublishResult=>({pending:true});
export class VideoPublisher {
  db:Db;social:SocialAccounts;materials:Materials;network:typeof fetch;
  constructor(db:Db,social:SocialAccounts,materials:Materials,network:typeof fetch=fetch){this.db=db;this.social=social;this.materials=materials;this.network=(input,init)=>network(input,init);}
  adapter(platform:SocialPlatform,connected:boolean,missing:string[]):PublishingAdapter {
    return {idempotent:false,supportsMedia:true,missingCredentials:()=>connected?[]:[...missing,`Connect ${platform} in Platforms`],publish:r=>this.publish(platform,r)};
  }
  private async save(key:string,platform:SocialPlatform,accountId:string,stage:string,data:unknown) {
    await this.db.prepare('INSERT INTO delivery_jobs (key,platform,account_id,stage,data,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT (key) DO UPDATE SET stage=excluded.stage,data=excluded.data,updated_at=excluded.updated_at').bind(key,platform,accountId,stage,JSON.stringify(data),new Date().toISOString()).run();
  }
  private async request(url:string,init:RequestInit={},readOnly=false) {
    let response:Response;
    try {response=await this.network(url,{...init,redirect:'manual',signal:AbortSignal.timeout(120000)});}catch{throw new PublishError(readOnly?'retryable':'ambiguous','network_uncertain','Connection interrupted while talking to the publishing provider');}
    if(!response.ok){
      if(response.status===401||response.status===403)throw new PublishError('auth','reconnect_required','Provider refused authorization. Reconnect the account or check app permissions.');
      if(response.status===429)throw new PublishError('retryable','rate_limited','Provider rate limit reached',60000);
      throw new PublishError(response.status>=500?(readOnly?'retryable':'ambiguous'):'permanent',`http_${response.status}`,`Publishing provider returned HTTP ${response.status}`);
    }
    return response;
  }
  private async json(url:string,init:RequestInit={},readOnly=false) {
    const r=await this.request(url,init,readOnly);let data:any;try{data=await r.json();}catch{throw new PublishError(readOnly?'retryable':'ambiguous','invalid_response','Provider returned an unreadable response');}
    if(data.error?.code && data.error.code!=='ok')throw new PublishError('permanent','provider_rejected','Provider rejected the publishing request. Check account limits and media requirements.');return data;
  }
  async publish(platform:SocialPlatform,r:PublishRequest):Promise<PublishResult> {
    const {account,access}=await this.social.token(platform);
    const options=(r.options??{}) as PublishOptions;
    if(options.accountId!==account.account_id)throw new PublishError('permanent','account_changed','Review this post for the currently connected account before publishing');
    if(r.mediaUrls.length!==1||!r.mediaUrls[0]?.startsWith('storage:'))throw new PublishError('permanent','select_media','Select exactly one file from Storage for this platform');
    const id=r.mediaUrls[0].slice(8),file=await this.materials.get(id);
    const video=file.mime==='video/mp4'||file.mime==='video/quicktime';
    if(platform!=='instagram'&&!video)throw new PublishError('permanent','video_required','Select an MP4 or MOV video from Storage');
    if(platform==='instagram'&&!video)throw new PublishError('permanent','instagram_media','Select an MP4 or MOV Reel. This private workspace uploads video directly to Instagram.');
    const stored=await this.db.prepare('SELECT * FROM delivery_jobs WHERE key=?').bind(r.idempotencyKey).first<Job>();
    if(stored&&Date.now()-Date.parse(stored.updated_at)>172800000)throw new PublishError('ambiguous','processing_timeout','Provider processing exceeded two days. Check the account before retrying.');
    if(stored&&stored.account_id!==account.account_id)throw new PublishError('permanent','account_changed','The connected account changed during delivery');
    let data=stored?JSON.parse(stored.data):{};const stage=stored?.stage;
    if(stage==='done')return {externalId:data.id,externalUrl:data.url??null};
    const headers={Authorization:`Bearer ${access}`,'Content-Type':'application/json'};
    if(platform==='instagram') {
      const graph=`https://graph.instagram.com/${this.social.env.INSTAGRAM_API_VERSION??'v25.0'}`;
      if(!stage) {
        const result=await this.json(`${graph}/${account.account_id}/media`,{method:'POST',headers:{Authorization:`Bearer ${access}`},body:new URLSearchParams({media_type:'REELS',upload_type:'resumable',caption:r.text,share_to_feed:'true'})});
        if(!result.id||!result.uri)throw new PublishError('ambiguous','missing_container','Instagram returned no resumable media container');
        const upload=new URL(result.uri);if(upload.protocol!=='https:'||!['rupload.facebook.com','rupload.instagram.com'].includes(upload.hostname))throw new PublishError('permanent','unexpected_upload_host','Instagram returned an unexpected upload host');
        data={container:result.id};await this.save(r.idempotencyKey,platform,account.account_id,'uploading',data);
        const source=await this.materials.read(id);
        await this.request(result.uri,{method:'POST',headers:{Authorization:`OAuth ${access}`,offset:'0',file_size:String(file.size),'Content-Type':'application/octet-stream'},body:source.stream});
        await this.save(r.idempotencyKey,platform,account.account_id,'container',data);return pending();
      }
      if(stage==='uploading')throw new PublishError('ambiguous','upload_interrupted','Instagram upload was interrupted. Check the account before starting another upload.');
      if(stage==='publishing')throw new PublishError('ambiguous','publication_uncertain','Instagram publication was interrupted. Check the account before retrying.');
      const status=await this.json(`${graph}/${data.container}?fields=status_code,status`,{headers:{Authorization:`Bearer ${access}`}},true);
      if(['ERROR','EXPIRED'].includes(status.status_code))throw new PublishError('permanent','instagram_processing_failed','Instagram could not process this media. Check its format and try a new draft.');
      if(status.status_code!=='FINISHED')return pending();
      await this.save(r.idempotencyKey,platform,account.account_id,'publishing',data);
      const result=await this.json(`${graph}/${account.account_id}/media_publish`,{method:'POST',headers:{Authorization:`Bearer ${access}`},body:new URLSearchParams({creation_id:data.container})});
      if(!result.id)throw new PublishError('ambiguous','missing_post_id','Instagram returned no published media ID');
      data={id:result.id,url:null};await this.save(r.idempotencyKey,platform,account.account_id,'done',data);
      try{const info=await this.json(`${graph}/${result.id}?fields=permalink`,{headers:{Authorization:`Bearer ${access}`}},true);data.url=info.permalink??null;await this.save(r.idempotencyKey,platform,account.account_id,'done',data);}catch{/* Confirmed ID still proves publication. */}
      return {externalId:data.id,externalUrl:data.url};
    }
    if(platform==='tiktok') {
      if(!options.consent||!options.privacy)throw new PublishError('permanent','review_required','Choose TikTok privacy and confirm the music and content declaration');
      if(!stage) {
        const creator=await this.social.creator();
        if(!creator.privacy_level_options?.includes(options.privacy))throw new PublishError('permanent','privacy_changed','TikTok privacy options changed. Review this post again.');
        if(!Number.isFinite(options.duration)||options.duration!>creator.max_video_post_duration_sec)throw new PublishError('permanent','duration_invalid','Video duration exceeds this TikTok account’s limit or is unavailable');
        if(options.branded&&options.privacy==='SELF_ONLY')throw new PublishError('permanent','branded_privacy','Paid partnership content cannot be private');
        if(options.commercial&&!options.ownBrand&&!options.branded)throw new PublishError('permanent','disclosure_required','Choose your brand or branded content');
        const chunkSize=Math.min(file.size,10*1024*1024),chunks=Math.floor(file.size/chunkSize);
        const init=await this.json('https://open.tiktokapis.com/v2/post/publish/video/init/',{method:'POST',headers,body:JSON.stringify({post_info:{title:r.text,privacy_level:options.privacy,disable_comment:!options.allowComment||creator.comment_disabled,disable_duet:!options.allowDuet||creator.duet_disabled,disable_stitch:!options.allowStitch||creator.stitch_disabled,brand_content_toggle:Boolean(options.commercial&&options.branded),brand_organic_toggle:Boolean(options.commercial&&options.ownBrand),is_aigc:Boolean(options.synthetic)},source_info:{source:'FILE_UPLOAD',video_size:file.size,chunk_size:chunkSize,total_chunk_count:chunks}})});
        if(!init.data?.publish_id||!init.data?.upload_url)throw new PublishError('ambiguous','missing_upload','TikTok returned no upload session');
        const target=new URL(init.data.upload_url);if(target.protocol!=='https:'||!(target.hostname.endsWith('.tiktokapis.com')||target.hostname.endsWith('.tiktokcdn.com')))throw new PublishError('permanent','invalid_upload_host','TikTok returned an unexpected upload host');
        data={publishId:init.data.publish_id,uploadUrl:init.data.upload_url,chunkSize,chunks,username:creator.creator_username};
        await this.save(r.idempotencyKey,platform,account.account_id,'uploading',data);
        for(let n=0;n<chunks;n++){const start=n*chunkSize,end=n===chunks-1?file.size:Math.min(file.size,start+chunkSize);
          const source=await this.materials.read(id,`bytes=${start}-${end-1}`);
          await this.request(data.uploadUrl,{method:'PUT',headers:{'Content-Type':file.mime,'Content-Length':String(end-start),'Content-Range':`bytes ${start}-${end-1}/${file.size}`},body:source.stream});
        }
        await this.save(r.idempotencyKey,platform,account.account_id,'processing',data);return pending();
      }
      const info=await this.json('https://open.tiktokapis.com/v2/post/publish/status/fetch/',{method:'POST',headers,body:JSON.stringify({publish_id:data.publishId})},true);
      if(info.data?.status==='FAILED')throw new PublishError('permanent','tiktok_processing_failed',`TikTok rejected the media (${String(info.data.fail_reason??'unknown').replace(/[^a-z_]/g,'')})`);
      if(info.data?.status==='PUBLISH_COMPLETE'){
        const postId=info.data.publicaly_available_post_id?.[0];data={id:String(postId??data.publishId),url:postId?`https://www.tiktok.com/@${encodeURIComponent(data.username??account.name)}/video/${postId}`:null};await this.save(r.idempotencyKey,platform,account.account_id,'done',data);return {externalId:data.id,externalUrl:data.url};
      }
      if(stage==='uploading')throw new PublishError('ambiguous','upload_interrupted','TikTok upload was interrupted. Check the account before starting another upload.');
      return pending();
    }
    if(!options.title?.trim()||!['public','unlisted','private'].includes(options.privacy??''))throw new PublishError('permanent','youtube_details','Enter a YouTube title and choose visibility');
    if(!stage) {
      const response=await this.request('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',{method:'POST',headers:{...headers,'X-Upload-Content-Length':String(file.size),'X-Upload-Content-Type':file.mime},body:JSON.stringify({snippet:{title:options.title,description:r.text,categoryId:'22'},status:{privacyStatus:options.privacy,selfDeclaredMadeForKids:Boolean(options.madeForKids),containsSyntheticMedia:Boolean(options.synthetic)}})});
      const location=response.headers.get('location');
      if(!location||new URL(location).protocol!=='https:'||!new URL(location).hostname.endsWith('.googleapis.com'))throw new PublishError('ambiguous','missing_upload','YouTube returned no valid upload session');
      data={uploadUrl:location};await this.save(r.idempotencyKey,platform,account.account_id,'uploading',data);
    }
    if(!stage||stage==='uploading') {
      const check=await this.network(data.uploadUrl,{method:'PUT',headers:{Authorization:`Bearer ${access}`,'Content-Range':`bytes */${file.size}`,'Content-Length':'0'},redirect:'manual',signal:AbortSignal.timeout(30000)});
      let result:any;
      if(check.ok)result=await check.json();
      else if(check.status===308){
        const range=check.headers.get('range');const offset=range?Number(range.match(/-(\d+)$/)?.[1]??-1)+1:0;
        if(offset>=file.size)throw new PublishError('ambiguous','upload_uncertain','YouTube upload needs reconciliation');
        const source=await this.materials.read(id,`bytes=${offset}-${file.size-1}`);
        const uploaded=await this.request(data.uploadUrl,{method:'PUT',headers:{Authorization:`Bearer ${access}`,'Content-Type':file.mime,'Content-Length':String(file.size-offset),'Content-Range':`bytes ${offset}-${file.size-1}/${file.size}`},body:source.stream});
        result=await uploaded.json();
      }else throw new PublishError('ambiguous','upload_session_failed','YouTube upload session could not be resumed');
      if(!result.id)throw new PublishError('ambiguous','missing_video_id','YouTube returned no video ID');
      data={id:result.id,url:`https://youtu.be/${result.id}`};await this.save(r.idempotencyKey,platform,account.account_id,'processing',data);return pending();
    }
    const status=await this.json(`https://www.googleapis.com/youtube/v3/videos?part=status,processingDetails&id=${encodeURIComponent(data.id)}`,{headers:{Authorization:`Bearer ${access}`}},true);
    const videoInfo=status.items?.[0];
    if(!videoInfo)throw new PublishError('retryable','video_processing','Waiting for YouTube to return the uploaded video',30000);
    if(['failed','rejected','deleted'].includes(videoInfo.status?.uploadStatus)||['failed','terminated'].includes(videoInfo.processingDetails?.processingStatus))throw new PublishError('permanent','youtube_processing_failed','YouTube could not process this upload');
    if(videoInfo.status?.uploadStatus!=='processed'&&videoInfo.processingDetails?.processingStatus!=='succeeded')return pending();
    await this.save(r.idempotencyKey,platform,account.account_id,'done',data);return {externalId:data.id,externalUrl:data.url};
  }
}
