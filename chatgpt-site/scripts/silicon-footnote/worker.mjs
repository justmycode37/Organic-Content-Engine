import {open,stat,readFile,mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {workerConfig,siteRequest} from '../render-worker.mjs';
import {produce} from './produce.mjs';
const config=workerConfig();
const jobs='/api/jobs/accounts/silicon';
const post=(path,body={})=>siteRequest(config,jobs+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
async function run(job){
 const imported=process.argv[2]==='--import';
 const root=imported?resolve(process.argv[3]):resolve(process.env.SILICON_OUTPUT_DIR||'outputs/silicon-footnote',job.id);
 const path='/'+job.id;
 let uploadId;
 const heartbeat=setInterval(()=>void post(path+'/heartbeat').catch(()=>{}),30000);
 try{
  const result=imported?await finished(root):await produce(root,{topic:job.topic});
  ({uploadId}=await (await post(path+'/upload')).json());
  const size=(await stat(result.output)).size,parts=[],file=await open(result.output);
  try{
   const chunk=8*1024*1024;
   for(let offset=0;offset<size;offset+=chunk){
    const buffer=Buffer.alloc(Math.min(chunk,size-offset));
    let filled=0;while(filled<buffer.length){const {bytesRead}=await file.read(buffer,filled,buffer.length-filled,offset+filled);if(!bytesRead)throw Error('Incomplete MP4');filled+=bytesRead;}
    const res=await siteRequest(config,jobs+path+'/part/'+(parts.length+1),{method:'PUT',headers:{'x-upload-id':uploadId,'content-type':'application/octet-stream'},body:buffer});parts.push(await res.json());
   }
  }finally{await file.close();}
  const sources=[...result.sources.sources,...(result.sources.images??[]).map(i=>({title:i.title+' · '+i.credit,url:i.page})),...result.sources.clips.map(c=>({title:c.title+' · '+c.credit,url:c.url}))].map(({title,url})=>({title,url}));
  await post(path+'/complete',{title:result.title,seconds:result.seconds,sources,parts,uploadId});
 }catch(e){
  await mkdir(root,{recursive:true});await writeFile(join(root,'failure.txt'),String(e.stack||e));
  await post(path+'/fail',{error:'Production stopped. The worker saved its evidence and completed takes.',uploadId});
  throw e;
 }finally{clearInterval(heartbeat);}
}
async function finished(root){
 const json=async name=>JSON.parse(await readFile(join(root,name),'utf8'));
 const output=join(root,'episode.mp4');await stat(output);
 return {title:(await json('episode.json')).title,seconds:(await json('timing.json')).reduce((a,b)=>a+b,0),sources:await json('sources.json'),output};
}
if(process.argv[2]==='--import'){
 const root=resolve(process.argv[3]),result=await finished(root),file=join(root,'site-id');
 let id;try{id=(await readFile(file,'utf8')).trim();}catch(e){if(e.code!=='ENOENT')throw e;id=crypto.randomUUID();await writeFile(file,id,{flag:'wx'});}
 const {job}=await (await post('/import',{id,title:result.title})).json();await run(job);
}
else if(process.argv[2]==='--sync'){console.log(await (await post('/sync')).json());}
else do{
 try{const {job}=await (await post('/claim')).json();if(job)await run(job);}
 catch(error){console.error(String(error.message).slice(0,400));if(process.argv[2])process.exitCode=1;}
 if(process.argv[2])break;
 await new Promise(done=>setTimeout(done,15000));
}while(true);
