import {execFile} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {link,mkdir,mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {homedir,tmpdir} from 'node:os';
import {delimiter,dirname,join} from 'node:path';
import {parseEnv,promisify} from 'node:util';
import {siteRequest,workerConfig} from './render-worker.mjs';
import {repeatedHedgyTopic} from '../worker/hedgy-research.ts';

const exec=promisify(execFile);
const failure=(code,message,details)=>Object.assign(new Error(message),{code,details});

export async function searchHedgyMonid(query,env=process.env){
 const dir=await mkdtemp(join(tmpdir(),'hedgy-monid-'));
 const file=join(dir,'results.json');
 const params={query,language:'en',purpose:'Find primary evidence for a short animated story about a surprising real event or visible mechanism.'};
 let run;
 try{
  const {stdout}=await exec(env.MONID_BIN?.trim()||'monid',[
   'run','-p','tinyfish','-e','/free/search','--query',JSON.stringify(params),'-w','20','-j','-o',file,
  ],{timeout:30000,maxBuffer:1024*1024,env:{...env,NO_COLOR:'1',PATH:[dirname(process.execPath),env.PATH].filter(Boolean).join(delimiter)}});
  run=JSON.parse(stdout);
  if(run.status!=='COMPLETED'||typeof run.runId!=='string')throw failure('hedgy_research_unavailable','Monid did not complete the topic search.',{status:run.status,runId:run.runId});
  const data=JSON.parse(await readFile(file,'utf8'));
  if(!Array.isArray(data.results))throw failure('hedgy_research_unavailable','Monid returned an invalid search result.');
  const results=data.results.filter(item=>typeof item?.title==='string'&&typeof item?.snippet==='string'&&
   typeof item?.url==='string'&&item.url.length<=1000&&URL.canParse(item.url)&&new URL(item.url).protocol==='https:')
   .slice(0,10).map(({title,url,snippet})=>({title:title.slice(0,180),url,snippet:snippet.slice(0,700)}));
  return {runId:run.runId,results};
 }catch(error){
  if(error.code==='hedgy_research_unavailable')throw error;
  throw failure('hedgy_research_unavailable','Monid topic search could not run. Check the worker’s Monid CLI and authentication.',{reason:error.code,runId:run?.runId});
 }finally{await rm(dir,{recursive:true,force:true});}
}

/** One shared ledger for scheduled and local runs on this machine. Publish each reservation atomically. */
export function hedgyTopicResearch(env=process.env,search=query=>searchHedgyMonid(query,env)){
 const dir=env.HEDGY_TOPIC_LEDGER?.trim()||join(homedir(),'.oce','hedgy-topics');
 async function history(){
  const files=await readdir(dir).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
  const entries=await Promise.all(files.filter(name=>/^[a-f0-9]{64}\.json$/.test(name)).map(async name=>JSON.parse(await readFile(join(dir,name),'utf8'))));
  return entries.sort((a,b)=>b.at.localeCompare(a.at));
 }
 async function reserveTopic(entry){
  if(repeatedHedgyTopic(entry,await history()))throw failure('hedgy_topic_repeat','The researched topic was already reserved or used.');
  await mkdir(dir,{recursive:true,mode:0o700});
  const key=createHash('sha256').update(entry.topicKey).digest('hex');
  const tmp=join(dir,`.${randomUUID()}.tmp`);
  try{
   await writeFile(tmp,JSON.stringify({...entry,at:new Date().toISOString()}),{flag:'wx',mode:0o600});
   await link(tmp,join(dir,`${key}.json`));
   if(repeatedHedgyTopic(entry,(await history()).filter(other=>other.topicKey!==entry.topicKey))){
    throw failure('hedgy_topic_repeat','Another reservation covers the researched topic.');
   }
  }catch(error){
   if(error.code==='EEXIST')throw failure('hedgy_topic_repeat','The researched topic was already reserved.');
   throw error;
  }finally{await rm(tmp,{force:true});}
 }
 return {history,search,reserveTopic};
}

/** Manual runs use the same published history when the account worker is configured. */
export async function hostedHedgyHistory(env=process.env){
 let settings=env;
 if(!env.OCE_SITE_URL||!(env.OCE_RENDER_TOKEN||env.JOB_TOKEN)){
  const path=join(homedir(),'Library','Application Support','Organic Content Engine','account-worker','account-worker.env');
  const installed=await readFile(path,'utf8').catch(e=>{if(e.code==='ENOENT')return '';throw e;});
  if(!installed)return [];
  settings=parseEnv(installed);
 }
 const response=await siteRequest(workerConfig(settings),'/api/jobs/accounts/hedgy/history');
 const {history}=await response.json();
 if(!Array.isArray(history))throw failure('hedgy_research_unavailable','The Site returned an invalid Hedgy topic history.');
 return history;
}
