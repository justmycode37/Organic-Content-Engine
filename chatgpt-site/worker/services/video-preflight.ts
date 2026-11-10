import type {Container} from '../container.ts';
import type {PlatformId} from '../domain/platforms.ts';
import {AppError} from '../errors.ts';
export async function videoPreflight(c:Container,p:{platform:PlatformId;mediaUrls:string[];publishOptions?:Record<string,unknown>}){
 if(!['instagram','tiktok','youtube'].includes(p.platform)||c.gateway.status(p.platform).route!=='direct')return;
 const o=p.publishOptions??{};const account=await c.social.account(p.platform as 'instagram'|'tiktok'|'youtube');
 if(!account)throw new AppError(409,'account_missing','Connect this account in Platforms first');
 if(o.accountId!==account.account_id)throw new AppError(422,'account_review_required','Review the post for the currently connected account');
 if(p.mediaUrls.length!==1||!p.mediaUrls[0]?.startsWith('storage:'))throw new AppError(422,'select_video','Select one video from Storage');
 const material=await c.materials.get(p.mediaUrls[0].slice(8));if(!material.uploaded||!['video/mp4','video/quicktime'].includes(material.mime))throw new AppError(422,'video_required','Select a completed MP4 or MOV upload');
 if(material.kind==='raw_clip')throw new AppError(422,'finish_required','This is unedited generated footage. Finish it in the Studio, then select the finished video.');
 if(p.platform==='youtube'){
  if(typeof o.title!=='string'||!o.title.trim()||o.title.length>100)throw new AppError(422,'title_required','Enter a YouTube title (up to 100 characters)');
  if(!['public','unlisted','private'].includes(String(o.privacy)))throw new AppError(422,'privacy_required','Choose YouTube visibility');
  if(typeof o.madeForKids!=='boolean')throw new AppError(422,'audience_required','Choose whether the video is made for kids');
 }
 if(p.platform==='tiktok'){
  if(!o.consent)throw new AppError(422,'consent_required','Confirm the TikTok content and music declaration');
  const creator=await c.social.creator();if(!creator.privacy_level_options?.includes(o.privacy))throw new AppError(422,'privacy_required','Choose privacy from the current creator settings');
  if(typeof o.duration!=='number'||!Number.isFinite(o.duration)||o.duration<=0||o.duration>creator.max_video_post_duration_sec)throw new AppError(422,'duration_invalid','Load the video preview and check its duration against the creator limit');
  if(o.branded&&o.privacy==='SELF_ONLY')throw new AppError(422,'branded_privacy','Paid partnership content cannot be private');
  if(o.commercial&&!o.ownBrand&&!o.branded)throw new AppError(422,'disclosure_required','Choose your brand or branded content');
 }
}
