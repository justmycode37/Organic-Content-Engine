import {execFile} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {delimiter,dirname,join} from 'node:path';
import {promisify} from 'node:util';
import {z} from 'zod';
import {historyLines} from '../../worker/quriozity-history.ts';
import {QURIOZITY_POLICY} from '../../worker/quriozity-policy.ts';

const exec=promisify(execFile);
const platforms={
 tiktok:{endpoint:'/tiktok.search_keyword',list:'videos',params:{datePosted:90}},
 youtube:{endpoint:'/youtube.search_shorts',list:'shorts',params:{}},
};
const querySchema=z.object({queries:z.array(z.string().trim().min(2).max(100)).length(3)}).strict();
const unavailable=message=>Object.assign(new Error(message),{code:'quriozity_research_unavailable'});

export async function searchMonid(platform,query){
 const {endpoint,list,params}=platforms[platform];
 const dir=await mkdtemp(join(tmpdir(),'quriozity-monid-'));
 try{
  const file=join(dir,'results.json');
  const {stdout}=await exec(process.env.MONID_BIN?.trim()||'monid',[
   'run','-p','anyapi','-e',endpoint,'-i',JSON.stringify({query,...params}),'-w','60','-j','-o',file,
  ],{timeout:75000,maxBuffer:4*1024*1024,env:{...process.env,NO_COLOR:'1',PATH:[dirname(process.execPath),process.env.PATH].join(delimiter)}});
  const run=JSON.parse(stdout);
  if(run.status!=='COMPLETED'||!run.runId)throw unavailable(`Monid ${platform} search ${run.status} (${run.runId??'unknown run'})`);
  const result=JSON.parse(await readFile(file,'utf8'));
  const rows=result.found===false?[]:result.data?.[list];
  if(!Array.isArray(rows))throw unavailable(`Unexpected Monid ${platform} result`);
  const posts=[];
  for(const row of rows){
   const title=row?.caption??row?.title;
   const url=URL.parse(row?.url);
   if(!title?.trim()||!url||url.protocol!=='https:'||!Number.isSafeInteger(row.views)||row.views<=0||row.viewsAvailable===false)continue;
   const post={title:title.slice(0,300),url:platform==='tiktok'?url.origin+url.pathname:url.href,views:row.views};
   for(const key of ['shares','saves','likes','authorFollowers','createdUtc'])if(Number.isSafeInteger(row[key])&&row[key]>=0)post[key]=row[key];
   if(!posts.some(other=>other.url===post.url))posts.push(post);
   if(posts.length===8)break;
  }
  return {query,platform,runId:run.runId,posts};
 }finally{await rm(dir,{recursive:true,force:true});}
}

export async function researchTopics(ask,topic,history,search=searchMonid){
 const prompt=`You research audience demand for Quriozity. ${QURIOZITY_POLICY.topic}
Write three distinct short keyword queries a viewer might use on TikTok or YouTube Shorts. Use concrete subjects, varying the series and visual reveal. For an owner-requested topic research three angles on that topic. Avoid subjects already covered.
Requested topic: ${topic||'choose freely'}
Earlier reels:\n${historyLines(history)}`;
 const {queries}=querySchema.parse(JSON.parse(await ask('topic-search',prompt,1000,{name:'topic_queries',schema:querySchema})));
 const searches=[];
 for(const query of new Set(queries)){
  const results=await Promise.allSettled(Object.keys(platforms).map(platform=>search(platform,query)));
  for(const [index,result] of results.entries()){
   if(result.status==='fulfilled')searches.push(result.value);
   else searches.push({platform:Object.keys(platforms)[index],query,failed:true,posts:[]});
  }
 }
 if(!searches.some(search=>search.posts.length))throw unavailable('Monid returned no usable short-video audience evidence. Check CLI access and the search terms.');
 return {requestedTopic:topic,searchedAt:new Date().toISOString(),searches};
}
