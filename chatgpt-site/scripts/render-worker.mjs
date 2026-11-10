// An always-on queue consumer; its headless browser never needs an open Studio tab.
import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,readFile,writeFile,rm,access,open,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const MAX_OUTPUT=100*1024*1024;
const TIMEOUT=15*60*1000;

export function workerConfig(env=process.env){
 const url=new URL(env.OCE_SITE_URL??'http://127.0.0.1:8787');
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password||(url.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname)))throw new Error('OCE_SITE_URL must use HTTPS, or localhost for development');
 const token=env.OCE_RENDER_TOKEN?.trim()||env.JOB_TOKEN?.trim(),serviceToken=env.OCE_SITES_ACCESS_TOKEN?.trim();
 if(!token||token.length<32)throw new Error('Set OCE_RENDER_TOKEN (or JOB_TOKEN) to the matching Site secret, at least 32 characters');
 return {origin:url.origin,headers:{authorization:`Bearer ${token}`,...(serviceToken?{'OAI-Sites-Authorization':`Bearer ${serviceToken}`}:{})},chrome:env.CHROME_PATH?.trim()||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/chromium')};
}

/** Never follow redirects with either credential, including a Sites sign-in redirect. */
export async function siteRequest(config,path,init={}){
 const url=new URL(path,config.origin);
 if(url.origin!==config.origin)throw new Error('Refusing to send worker credentials to another origin');
 const response=await fetch(url,{...init,headers:{...config.headers,...init.headers},redirect:'error',signal:AbortSignal.timeout(90000)});
 if(!response.ok){let code='';try{code=(await response.json()).error?.code??'';}catch{}
  throw new Error(`Site request failed (${response.status}${code?`, ${code}`:''}). Check the Site URL and worker credentials.`);}
 return response;
}

function childProcess(binary,args){
 const child=spawn(binary,args,{stdio:['pipe','ignore','pipe']});let errors='';
 child.stderr.on('data',chunk=>{errors=(errors+chunk.toString()).slice(-1200);});
 // Subscribe immediately: encoding errors must not become unhandled rejections.
 const done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>code===0?resolve():reject(new Error(`${binary} exited with status ${code}: ${errors}`)));});
 done.catch(()=>undefined);
 return {child,done};
}

export async function renderJob(job,{chrome,mediaFile,bundle,outputDir}){
 await access(chrome);
 const silent=join(outputDir,'video.mp4'),pcm=join(outputDir,'audio.pcm'),output=join(outputDir,'finished.mp4');
 const bitrate=Math.floor(Math.min(10_000_000,(92*1024*1024*8)/90-160000));
 const encoder=childProcess('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','image2pipe','-framerate','30','-i','pipe:0','-an','-c:v','libx264','-preset','fast','-pix_fmt','yuv420p','-b:v',String(bitrate),'-maxrate',String(bitrate),'-bufsize',String(bitrate*2),'-threads','2',silent]);
 encoder.child.stdin.on('error',()=>undefined);
 const audio=await open(pcm,'w');
 let browser;
 const timer=setTimeout(()=>{encoder.child.kill('SIGKILL');void browser?.close();},TIMEOUT);
 try{
  browser=await chromium.launch({headless:true,executablePath:chrome,args:['--autoplay-policy=no-user-gesture-required','--disable-background-networking']});
  const context=await browser.newContext({serviceWorkers:'block'});
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin!=='https://render.invalid')return route.abort();
   if(url.pathname==='/')return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Video renderer</title>'});
   if(url.pathname==='/renderer.js')return route.fulfill({status:200,contentType:'text/javascript',body:bundle});
   const id=/^\/media\/([a-f0-9-]+)$/.exec(url.pathname)?.[1];
   const file=id&&mediaFile.get(id);
   if(!file)return route.fulfill({status:404,body:'Unknown render input'});
   return route.fulfill({status:200,contentType:file.mime,body:await readFile(file.path)});
  });
  const page=await context.newPage();
  await page.exposeFunction('emitFrame',async encoded=>{
   if(encoder.child.exitCode!==null)throw new Error('Video encoder stopped');
   await new Promise((resolve,reject)=>encoder.child.stdin.write(Buffer.from(encoded,'base64'),error=>error?reject(error):resolve()));
  });
  await page.exposeFunction('emitAudio',async encoded=>{await audio.write(Buffer.from(encoded,'base64'));});
  await page.goto('https://render.invalid/');
  await page.addScriptTag({url:'https://render.invalid/renderer.js'});
  const metadata=await page.evaluate(input=>window.renderJob(input),{plan:job.plan,clips:job.clips,handle:job.handle});
  encoder.child.stdin.end();await encoder.done;await audio.close();
  const mux=childProcess('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',silent,'-f','f32le','-ar','48000','-ac','2','-i',pcm,'-c:v','copy','-c:a','aac','-b:a','160k','-t',String(metadata.duration),'-movflags','+faststart',output]);
  mux.child.stdin.end();await mux.done;
  const size=(await stat(output)).size;
  if(!size||size>MAX_OUTPUT)throw new Error('render_invalid: The finished video exceeds the storage limit');
  // Verify the actual deliverable, not just the intended encoder settings.
  const probe=spawn('ffprobe',['-v','error','-show_streams','-show_format','-of','json',output],{stdio:['ignore','pipe','pipe']});
  const chunks=[];probe.stdout.on('data',chunk=>chunks.push(chunk));
  const [code]=await once(probe,'close');if(code!==0)throw new Error('render_invalid: Could not inspect the finished video');
  const info=JSON.parse(Buffer.concat(chunks).toString());
  if(!info.streams.some(track=>track.codec_type==='video'&&track.codec_name==='h264'&&track.width===1080&&track.height===1920)||!info.streams.some(track=>track.codec_type==='audio'&&track.codec_name==='aac')||Math.abs(Number(info.format.duration)-metadata.duration)>.25)throw new Error('render_invalid: Output failed the codec, size or duration check');
  return {...metadata,path:output,size};
 }finally{clearTimeout(timer);encoder.child.kill();await browser?.close();await audio.close().catch(()=>undefined);}
}

export async function runOnce(config,bundle,fetchSite=siteRequest){
 const {job}=await (await fetchSite(config,'/api/jobs/render/claim',{method:'POST'})).json();
 if(!job)return false;
 const scratch=await mkdtemp(join(tmpdir(),'oce-render-'));
 const heartbeat=setInterval(()=>{void fetchSite(config,`/api/jobs/render/${job.id}/${job.lease}/heartbeat`,{method:'POST'}).catch(()=>undefined);},30000);
 try{
  const mediaFile=new Map();
  for(const media of job.media){
   const response=await fetchSite(config,`/api/jobs/render/${job.id}/${job.lease}/media/${media.id}`);
   const bytes=Buffer.from(await response.arrayBuffer());
   if(bytes.length!==media.size||bytes.length>MAX_OUTPUT)throw new Error('media_missing: A render input was incomplete');
   const file=join(scratch,media.id);await writeFile(file,bytes);mediaFile.set(media.id,{path:file,mime:media.mime});
  }
  const result=await renderJob(job,{chrome:config.chrome,mediaFile,bundle,outputDir:scratch});
  // A lost response can be retried with the same lease; the server commits the output only once.
  const bytes=await readFile(result.path);
  for(let attempt=0;attempt<3;attempt++){
   try{await fetchSite(config,`/api/jobs/render/${job.id}/${job.lease}/output`,{method:'PUT',headers:{'content-type':'video/mp4','content-length':String(bytes.length),'x-render-shots':JSON.stringify(result.shots)},body:bytes});break;}
   catch(error){if(attempt===2)throw error;}
  }
  console.log(`Finished video ${job.id} (${result.duration.toFixed(1)} s)`);return true;
 }catch(error){
  const code=/\b(narration_too_long|render_invalid|media_missing):/.exec(String(error))?.[1]??'render_failed';
  // Keep paths, credentials and raw provider bodies out of persisted failures.
  const message=code==='narration_too_long'?'Shorten the narration script; existing footage cannot fit it.':code==='media_missing'?'A required input could not be downloaded.':'Background editing failed. The worker will retry technical failures.';
  await fetchSite(config,`/api/jobs/render/${job.id}/${job.lease}/fail`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code,message})}).catch(()=>undefined);
  console.error(`Video ${job.id}: ${code}`);return true;
 }finally{clearInterval(heartbeat);await rm(scratch,{recursive:true,force:true});}
}

export async function renderBundle(){
 if(process.env.OCE_RENDER_BUNDLE)return readFile(process.env.OCE_RENDER_BUNDLE,'utf8');
 const {build}=await import('esbuild');
 return (await build({entryPoints:[join(ROOT,'scripts/render-page.ts')],bundle:true,write:false,format:'iife',target:'es2022'})).outputFiles[0].text;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const config=workerConfig(),bundle=await renderBundle();let stopping=false;
 process.once('SIGINT',()=>{stopping=true;});process.once('SIGTERM',()=>{stopping=true;});
 do{
  try{const worked=await runOnce(config,bundle);if(process.argv.includes('--once'))break;if(worked)continue;}
  catch{console.error('Could not reach the render queue. Check worker credentials and Site access.');if(process.argv.includes('--once')){process.exitCode=1;break;}}
  if(!stopping)await new Promise(resolve=>setTimeout(resolve,10000));
 }while(!stopping);
}
