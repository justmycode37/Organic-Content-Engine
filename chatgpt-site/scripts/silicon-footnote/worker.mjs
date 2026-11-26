import {open,stat,readFile,mkdir,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {workerConfig,siteRequest} from '../render-worker.mjs';
import {produce,duration} from './produce.mjs';
import {prepareThumbnails} from './thumbnail.mjs';
const config=workerConfig();
const jobs='/api/jobs/accounts/silicon';
const post=(path,body={})=>siteRequest(config,jobs+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
function subscriptionStatus(){
 if(!process.env.ELEVENLABS_API_KEY)return 'voice_required';
 const login=spawnSync(process.env.OCE_CODEX_BIN||'codex',['login','status'],{
  encoding:'utf8',timeout:5000,stdio:['ignore','pipe','pipe'],
 });
 const chatgpt=/^logged in using chatgpt\s*$/im.test((login.stdout??'')+'\n'+(login.stderr??''));
 return login.status===0&&chatgpt?'ready':'login_required';
}
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
  for(const {id} of result.thumbnails??[]){
   const body=await readFile(join(root,`thumbnail-${id}.jpg`));
   await siteRequest(config,jobs+path+'/thumbnail/'+id,{method:'PUT',headers:{'content-type':'image/jpeg'},body});
  }
  await post(path+'/complete',{title:result.title,seconds:result.seconds,sources,parts,uploadId,thumbnails:result.thumbnails,thumbnailError:result.thumbnailError});
 }catch(e){
  await mkdir(root,{recursive:true});await writeFile(join(root,'failure.txt'),String(e.stack||e));
  await post(path+'/fail',{error:'Production stopped. The worker saved its evidence and completed takes.',uploadId});
  throw e;
 }finally{clearInterval(heartbeat);}
}
async function finished(root){
 const json=async name=>JSON.parse(await readFile(join(root,name),'utf8'));
 const output=join(root,'episode.mp4');await stat(output);
 const thumbnails=await prepareThumbnails(root,{reuseExisting:true});
 return {title:thumbnails[0].title??(await json('episode.json')).title,seconds:duration(output),sources:await json('sources.json'),thumbnails,output};
}
if(process.argv[2]==='--import'){
 const root=resolve(process.argv[3]),result=await finished(root),file=join(root,'site-id');
 let id;try{id=(await readFile(file,'utf8')).trim();}catch(e){if(e.code!=='ENOENT')throw e;id=crypto.randomUUID();await writeFile(file,id,{flag:'wx'});}
 const {job}=await (await post('/import',{id,title:result.title,replace:process.argv.includes('--replace')})).json();await run(job);
}
else if(process.argv[2]==='--sync'){console.log(await (await post('/sync')).json());}
else{
 let reported;
 do{
  try{
   const subscription=subscriptionStatus();
   const {job}=await (await post('/claim',{subscription})).json();
   if(reported!==subscription){
    console.log('Silicon Footnote schedule connection: '+subscription);
    reported=subscription;
   }
   if(job)await run(job);
  }catch(error){console.error(String(error.message).slice(0,400));if(process.argv[2])process.exitCode=1;}
  if(process.argv[2])break;
  await new Promise(done=>setTimeout(done,15000));
 }while(true);
}
