import {z} from 'zod';
import {draftEpisode} from './storyboard.mjs';
import {createReelSubscription} from '../reel-subscription.mjs';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,renameSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

export const here=fileURLToPath(new URL('.',import.meta.url));
export const save=(path,value)=>{writeFileSync(path+'.tmp',JSON.stringify(value,null,2));renameSync(path+'.tmp',path)};
export const read=path=>JSON.parse(readFileSync(path,'utf8'));
const string=z.string().min(1), url=z.url({protocol:/^https$/});
export const pack=z.object({topic:string,sources:z.array(z.object({title:string,url,notes:string})).min(2),clips:z.array(z.object({title:string,url,credit:string,originalSound:z.boolean().optional(),ambientSound:z.boolean().optional(),ambientRanges:z.array(z.object({start:z.number().nonnegative(),end:z.number().positive()})).optional(),coverage:z.array(z.object({start:z.number().nonnegative(),end:z.number().positive()})).optional(),endSeconds:z.number().positive().optional()})).min(1),images:z.array(z.object({title:string,url,credit:string,page:url})).max(32).optional()});
const art=z.object({
 subject:z.enum(['campus','server','powerline','generator','meter','wind','hydro','chip','network','sample','document','abstract']),
 headline:string.max(42),value:z.string().max(18),unit:z.string().max(28),
 caption:z.string().max(75), // Explain what the number or model represents, with its denominator.
});
const insert=z.object({image:z.number().int().nonnegative(),at:z.number().min(.15).max(.85),title:string.max(80)});
const comparison=z.array(z.object({image:z.number().int().nonnegative(),label:string.max(32),detail:z.string().max(44)})).length(2);
const processDrawing=z.array(z.object({subject:z.enum(['campus','server','powerline','generator','meter','wind','hydro','chip']),label:string.max(32)})).min(2).max(4);
const chartSpec=z.union([
 z.object({layout:z.literal('calculation'),unit:string,values:z.array(z.number()).length(2),active:z.number().int().min(0).max(1),answer:string.max(50)}),
 z.object({
  layout:z.literal('profile'),unit:string,axis:z.array(string).min(2).max(5),domain:z.tuple([z.number(),z.number()]),
  checkpoints:z.array(z.object({index:z.number().int().nonnegative(),cue:string.min(1)})).min(1).max(8).optional(),
  eventWindow:z.tuple([z.number().int().nonnegative(),z.number().int().positive()]).optional(),
  axisIndices:z.array(z.number().int().nonnegative()).optional(),markerUnit:string.max(14).optional(),
  markerIndex:z.number().int().nonnegative().optional(),revealCue:string.optional(),illustrative:z.boolean().optional(),
  steps:z.boolean().optional(),until:z.number().positive().max(1).optional(),
  series:z.array(z.object({label:string,values:z.array(z.number().finite()).min(2).max(96)})).min(1).max(3)
 }).refine(c=>{
  const last=c.series[0].values.length-1,visibleThrough=last*(c.until??1);
  const ordered=(value,i,indices)=>value<=last && (i===0 || value>indices[i-1]);
  const indices=c.checkpoints?.map(p=>p.index);
  return c.domain[0]<c.domain[1] && (c.markerIndex??0)<=last
   && (!c.eventWindow || (c.eventWindow[0]<c.eventWindow[1] && c.eventWindow[1]<=last))
   && (!indices || (indices.every(ordered) && indices.at(-1)<=visibleThrough))
   && (!c.axisIndices || (c.axisIndices.length===c.axis.length && c.axisIndices.every(ordered)))
   && c.series.every(s=>s.values.length===last+1 && s.values.every(v=>v>=c.domain[0]&&v<=c.domain[1]));
 }),
 z.object({layout:z.enum(['bars','paired','fixed']).optional(),constant:z.string().max(42).optional(),floors:z.array(z.number().min(0).max(100)).min(2).max(4).optional(),valueCues:z.array(string.min(1)).min(2).max(4).optional(),unit:string,values:z.array(z.number().nonnegative()).min(2).max(4)}).refine(c=>(!c.floors || ((c.layout??'bars')==='bars' && c.floors.length===c.values.length && c.values.every(v=>v<=100))) && (!c.valueCues || ((c.layout??'bars')==='bars' && c.valueCues.length===c.values.length)))
]);
const titlePosition=z.enum(['upper-left','upper-right','lower-left','lower-right']);
const pickup=z.object({titlePosition:titlePosition.optional(),clean:z.boolean().optional(),process:processDrawing.optional(),at:z.number().min(.05).max(.95),cue:z.string().optional(),kind:z.enum(['image','footage','document','quote','chart','steps','terrain']),title:string.max(85),source:z.number().int().nonnegative().optional(),image:z.number().int().nonnegative().optional(),clip:z.number().int().nonnegative().optional(),clipStart:z.number().nonnegative().optional(),art:art.optional(),quote:z.string().optional(),labels:z.array(string).max(4).optional(),chart:chartSpec.optional(),nameplate:z.object({name:string,date:z.string(),role:z.string()}).optional()});
const actuality=z.object({speakerX:z.number().min(0).max(1).optional(),clip:z.number().int().nonnegative(),source:z.number().int().nonnegative(),start:z.number().nonnegative(),end:z.number().positive(),name:string,date:string,role:string,captions:z.array(z.object({start:z.number(),end:z.number(),text:string})).optional()});
const beat=z.object({titlePosition:titlePosition.optional(),clean:z.boolean().optional(),art:art.optional(),process:processDrawing.optional(),cutaways:z.array(pickup).max(4).optional(),actuality:actuality.optional(),insert:insert.optional(),comparison:comparison.optional(),clipStart:z.number().nonnegative().optional(),kind:z.enum(['document','terrain','steps','quote','footage','chart','image']),title:string.max(85),labels:z.array(string.max(90)).min(1).max(4),source:z.number().int().nonnegative(),clip:z.number().int().nonnegative(),image:z.number().int().nonnegative().optional(),focus:z.enum(['full','upper-right','center','lower-left']).optional(),accentWord:string.max(40).regex(/^\S+$/).optional(),quote:z.string().max(180),nameplate:z.object({name:string,date:z.string(),role:z.string()}).optional(),chart:chartSpec.optional(),narration:string});
const coverLine=string.trim().max(36).refine(value=>value.split(/\s+/).length<=5,'Use no more than five words');
const thumbnailPlan=z.object({
 subjectLine:coverLine,
 evidenceLine:coverLine,
 still:z.number().int().nonnegative().nullable(),
 motif:z.enum(['chip','power','workflow','document']),
});
export const script=z.object({closingCredits:z.array(z.object({title:string.max(64),text:string.max(170)})).min(1).max(4).optional(),style:z.literal('reported-footage').optional(),captions:z.boolean().optional(),title:string.max(90),beats:z.array(beat).min(27).max(100),thumbnails:thumbnailPlan.optional()});

export function checkVideoCopy(plan,material){
 const contents=[plan.title,JSON.stringify(plan.beats),JSON.stringify(plan.closingCredits??[])];
 for(const b of plan.beats){
  const source=material.sources[b.source];
  if(!source)throw Error('Choose an existing reporting source for each shot');
  contents.push(new URL(source.url).hostname);
  if(['document','quote'].includes(b.kind))contents.push(source.title);
  if(b.kind==='image')contents.push(material.images?.[b.image]?.credit??'');
  if(b.kind==='footage')contents.push(material.clips[b.clip]?.credit??'');
  for(const cut of b.cutaways??[]){
   if(cut.kind==='image'&&!material.images?.[cut.image]||cut.kind==='footage'&&!material.clips[cut.clip]||cut.source!==undefined&&!material.sources[cut.source])throw Error('Invalid cutaway source');
   if(cut.kind==='chart'&&cut.chart?.layout!=='profile'&&(!cut.chart||!Math.max(...cut.chart.values)||(cut.labels??b.labels).length!==cut.chart.values.length))throw Error('Invalid cutaway chart');
   if(cut.kind==='footage')contents.push(material.clips[cut.clip].credit);
   if(cut.kind==='image')contents.push(material.images[cut.image].credit);
   if(['document','quote'].includes(cut.kind))contents.push(material.sources[cut.source??b.source].title);
  }
  if(b.actuality){
   const a=b.actuality;
   if(!material.clips[a.clip]?.originalSound||!material.sources[a.source]||a.end<=a.start)throw Error('Invalid original-sound clip');
   contents.push(material.clips[a.clip].credit);
  }
  for(const view of [b.insert,...(b.comparison??[])].filter(Boolean)){
   const asset=material.images?.[view.image];
   if(!asset)throw Error('Choose an existing source image for each secondary shot');
   contents.push(asset.credit);
  }
 }
 if(contents.some(text=>/siliconfootnote/i.test(text.normalize('NFKC').replace(/[^a-z0-9]/gi,''))))throw Error('Remove the channel name from all spoken and displayed copy. Choose another source if its required credit contains the name.');
}
const ask=createReelSubscription();
async function generate(schema,input,webSearch=false){
 const result=await ask({provider:'openai',model:'gpt-6.2-sol',effort:'medium',input,step:webSearch?'source discovery':'episode script',webSearch,format:{schema}});
 if(result.status!=='completed')throw Error('ChatGPT subscription unavailable: '+result.status);
 return schema.parse(JSON.parse(result.text));
}
export function fetchPublic(url,path,kind){
 execFileSync('python3',[join(here,'fetch.py'),url,path,kind],{stdio:['ignore','ignore','pipe']});
}
function tweetEndpoint(url){
 const u=new URL(url);
 return /^(?:www\.)?(?:x|twitter)\.com$/.test(u.hostname)&&/\/status\/\d+/.test(u.pathname)
  ? 'https://publish.twitter.com/oembed?omit_script=true&url='+encodeURIComponent(url):null;
}
export async function prepare(dir,topic,sourceFile){
 const packFile=join(dir,'sources.json'),planFile=join(dir,'episode.json');
 if(existsSync(planFile)){const plan=script.parse(read(planFile));checkVideoCopy(plan,read(packFile));return plan;}
 let material;
 if(existsSync(packFile))material=pack.parse(read(packFile));
 else{
  let rejected='';
  for(let attempt=0;attempt<3;attempt++){
   material=sourceFile?pack.parse(read(sourceFile)):await generate(pack,
    `Research an AI news episode as of ${new Date().toISOString().slice(0,10)}. Topic: ${topic||'choose a recent, consequential, well-documented development'}. Use live web search. Find primary announcements, papers or reporting, and relevant first-party public posts on X when available. Record publication dates and precise factual notes. Find a mix of first-party public posts, independent news coverage, and original evidence. Seek a varied collection of genuine scenes with people, equipment and close-up work. Record locations and archival dates. Where a source supplies original interview audio or relevant ambient sound, mark that track and give the relevant times in the notes. Find DIRECT downloadable HTTPS MP4 footage showing this subject, documented as reusable by the owner. Put the original landing page and reuse credit in credit. Search NASA images/video, Wikimedia Commons or an official media kit if appropriate. Choose a different story if footage cannot be sourced. Also find relevant reusable primary-source figures or photos with direct image URLs and their landing pages when available. No invented URLs. Previous unavailable evidence: ${rejected}`,true);
   const sources=[],clips=[];
   for(const item of material.sources){
    const file=join(dir,'article-'+sources.length+'.txt');
    try{const tweet=tweetEndpoint(item.url);fetchPublic(tweet??item.url,file,tweet?'json':'article');
     if(tweet){const data=read(file);writeFileSync(file,String(data.html).replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&'));}
     if(readFileSync(file,'utf8').trim().length>(tweet?25:120))sources.push(item);
    }catch{rejected+=' '+item.url}
   }
   for(const item of material.clips){
    const file=join(dir,'clip-'+clips.length+'.mp4');
    try{fetchPublic(item.url,file,'media');
     const stream=execFileSync('ffprobe',['-v','error','-protocol_whitelist','file','-format_whitelist','mov','-select_streams','v:0','-show_entries','stream=width','-of','json',file],{encoding:'utf8'});
     if(JSON.parse(stream).streams?.[0]?.width>0){
      // Keep a bounded editorial proxy and respect a source's end trim.
      const proxy=file+'.proxy.mp4';
      execFileSync('ffmpeg',['-v','error','-y','-protocol_whitelist','file','-format_whitelist','mov','-i',file,'-map','0:v:0',...((item.originalSound||item.ambientSound)?['-map','0:a:0','-c:a','aac','-b:a','160k']:['-an']),'-t',String(Math.min(180,item.endSeconds??180)),'-vf','scale=w=min(1280\\,iw):h=-2','-c:v','libx264','-threads','2','-preset','veryfast','-crf','22',proxy]);
      renameSync(proxy,file);clips.push(item);
     }
    }catch{rejected+=' '+item.url}
   }
   if(sources.length>=2&&clips.length){
    const images=[];
    for(const item of material.images??[]){
     const file=join(dir,'image-'+images.length+'.png');
     try{fetchPublic(item.url,file,'image');execFileSync('python3',['-c','from PIL import Image; import sys; im=Image.open(sys.argv[1]); im.verify()',file]);images.push(item);}catch{rejected+=' '+item.url;}
    }
    material={...material,sources,clips,images};save(packFile,material);break;}
   if(sourceFile||attempt===2)throw Error('Insufficient accessible sources or downloadable footage: '+rejected);
  }
 }
 const excerpts=material.sources.map((s,i)=>({i,...s,evidence:readFileSync(join(dir,'article-'+i+'.txt'),'utf8').slice(0,22000)}));
 const plan=script.parse(await draftEpisode(dir,material,excerpts,{
  beat:beat.extend({art}),cover:z.object({title:string.max(90),thumbnails:thumbnailPlan}),check:checkVideoCopy
 }));
 checkVideoCopy(plan,material);
 const words=s=>s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 if(new Set([plan.title,plan.thumbnails.subjectLine,plan.thumbnails.evidenceLine].map(words)).size<3)throw Error('The cover lines and title need distinct wording');
 if(plan.thumbnails.still!==null&&!material.images?.[plan.thumbnails.still])throw Error('Invalid still for the cover');
 if(!plan.beats.some(b=>b.kind==='footage')||new Set(plan.beats.map(b=>b.kind)).size<4)throw Error('This cut needs sourced footage and varied exhibits');
 save(planFile,plan);return plan;
}
