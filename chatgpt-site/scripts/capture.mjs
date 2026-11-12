// Capture kit for public pages. It uses a fresh browser context and never signs in
// or attempts to work around a robots policy, access denial, or bot challenge.
import {spawn} from 'node:child_process';
import {mkdir,rm,writeFile} from 'node:fs/promises';
import {basename,extname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {ASSET_ROOT,listAssets,registerFile,resolveAsset} from './assets.mjs';
import {openCaptureBrowser,openCapturePage,openPublicPage,extractPageMetadata} from './capture/browser.mjs';
import {assertRobotsAllows} from './capture/robots.mjs';
import {addSourceLabel} from './capture/label.mjs';
import {renderPhoneFrame} from './capture/phone.mjs';

const FILES=join(ASSET_ROOT,'files');
const KINDS={shot:'screenshot',scroll:'video'};
const FFMPEG=process.env.FFMPEG_PATH?.trim()||'ffmpeg';

const usage=`Usage:
  node scripts/capture.mjs shot <url> [--selector CSS] [--clip x,y,width,height] [--scale N] [--dark] [--label TEXT] [--id ID]
  node scripts/capture.mjs scroll <url> --seconds N [--id ID]
  node scripts/capture.mjs phone <png> [--id ID]

shot captures a full page unless --selector or --clip is supplied. scale is a
device-pixel multiplier (0.25-3). scroll emits 30 fps H.264 MP4. All generated
files are registered under assets/files/.`;

const slug=value=>String(value).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,38)||'capture';
const timestamp=()=>new Date().toISOString();
const timestampId=()=>new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,17);

function parseOptions(args,{booleans=[]}={}){
 const options={},flags=new Set(booleans);
 for(let index=0;index<args.length;index++){
  const token=args[index];
  if(!token.startsWith('--'))throw new Error(`Unexpected argument '${token}'.`);
  const name=token.slice(2);
  if(flags.has(name)){options[name]=true;continue;}
  const value=args[++index];
  if(!value||value.startsWith('--'))throw new Error(`Option --${name} requires a value.`);
  options[name]=value;
 }
 return options;
}

export function parseClip(value){
 const parts=String(value).split(',').map(Number);
 if(parts.length!==4||parts.some(number=>!Number.isFinite(number))||parts[0]<0||parts[1]<0||parts[2]<=0||parts[3]<=0)
  throw new Error('--clip must be x,y,width,height with non-negative x/y and positive width/height.');
 return {x:parts[0],y:parts[1],width:parts[2],height:parts[3]};
}

function dateText(value){
 return new Date(value).toLocaleString('en-GB',{timeZone:'UTC',dateStyle:'medium',timeStyle:'short'})+' UTC';
}

function captureRights(metadata,sourceUrl,capturedAt,assetLabel='Screenshot'){
 const source=new URL(sourceUrl),hostname=source.hostname.replace(/^\[|\]$/g,'');
 const publicUrl=['http:','https:'].includes(source.protocol)&&!['localhost','127.0.0.1','::1'].includes(hostname);
 return {
  creator:metadata.creator||metadata.publisher||source.hostname,
  licence:'Copyright remains with the source rights holder; no open licence is asserted.',
  attribution:`${assetLabel} of “${metadata.title}” by ${metadata.creator||metadata.publisher||source.hostname}; ${sourceUrl} (captured ${dateText(capturedAt)}).`,
  rightsStatus:publicUrl?'fair-use-news':'unknown',
  restrictions:publicUrl?'Editorial news reporting/commentary only with the listed attribution; no standalone redistribution or stock use. Fair-use status is a case-specific assessment, not a grant from the source.':'Local capture with rights not established; do not publish until the source owner and permitted use are recorded.'
 };
}

function assetId(provided,metadata,url){
 return provided||`c-${slug(new URL(url).hostname.replace(/^www\./,'')).slice(0,14)}-${slug(metadata.title).slice(0,17)}-${timestampId()}`;
}

async function ensureIdFree(id){
 const assets=await listAssets();
 if(assets.some(asset=>asset.id===id))throw new Error(`Asset id '${id}' already exists.`);
}

async function shot(url,args){
 const options=parseOptions(args,{booleans:['dark']});
 const allowed=new Set(['selector','clip','scale','dark','label','id','width','height']);
 for(const key of Object.keys(options))if(!allowed.has(key))throw new Error(`Unknown shot option --${key}.`);
 const scale=options.scale===undefined?1:Number(options.scale);
 const width=options.width===undefined?1440:Number(options.width),height=options.height===undefined?1000:Number(options.height);
 if(!Number.isFinite(scale)||scale<0.25||scale>3)throw new Error('--scale must be between 0.25 and 3.');
 if(!Number.isInteger(width)||width<320||width>3840||!Number.isInteger(height)||height<240||height>3840)throw new Error('--width/--height must be integers from 320x240 through 3840x3840.');
 if(options.selector&&options.clip)throw new Error('--selector and --clip are mutually exclusive.');
 const clip=options.clip?parseClip(options.clip):undefined;
 const target=new URL(url);await assertRobotsAllows(target.href);
 const {browser,context,page}=await openCapturePage({width,height,scale,dark:options.dark});
 let output;
 try{
  const pageInfo=await openPublicPage(page,target.href),metadata=await extractPageMetadata(page,target.href);
  if(options.selector){
   const matches=page.locator(options.selector),visibleIndex=await matches.evaluateAll(elements=>elements.findIndex(element=>{
    const style=getComputedStyle(element),rect=element.getBoundingClientRect();
    return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)!==0&&rect.width>0&&rect.height>0;
   }));
   if(visibleIndex<0)throw new Error(`Capture selector matched no visible, non-empty element: ${options.selector}`);
   output=await matches.nth(visibleIndex).screenshot({type:'png',scale:'device',timeout:15000});
  }else if(clip){output=await page.screenshot({type:'png',clip,scale:'device'});}
  else output=await page.screenshot({type:'png',fullPage:true,scale:'device'});
  if(options.label)output=await addSourceLabel(browser,output,options.label);
  const createdAt=timestamp(),id=assetId(options.id,metadata,target.href),file=join(FILES,`${id}.png`);
  await ensureIdFree(id);await mkdir(FILES,{recursive:true});await writeFile(file,output);
  try{
   const rights=captureRights(metadata,target.href,createdAt);
   const entry=await registerFile({sourcePath:file,fileRelative:`files/${id}.png`,id,kind:KINDS.shot,sourceUrl:target.href,...rights,createdAt});
   console.log(`Captured ${metadata.title} (${pageInfo.status||'status unavailable'})`);
   console.log(`${entry.id}\n${resolve(ASSET_ROOT,entry.file)}`);
  }catch(error){await rm(file,{force:true});throw error;}
 }finally{await context.close();await browser.close();}
}

function waitForEncoder(encoder){
 let stderr='';encoder.stderr?.on('data',chunk=>{stderr+=chunk.toString();});
 return new Promise((resolveDone,reject)=>{
  encoder.once('error',reject);
  encoder.once('close',code=>code===0?resolveDone():reject(new Error(`ffmpeg exited with ${code}${stderr.trim()?`: ${stderr.trim()}`:''}`)));
 });
}

async function writeFrame(stream,frame){
 if(!stream.write(frame))await new Promise((resolveDone,reject)=>{
  const cleanup=()=>{stream.off('drain',onDrain);stream.off('error',onError);};
  const onDrain=()=>{cleanup();resolveDone();};
  const onError=error=>{cleanup();reject(error);};
  stream.once('drain',onDrain);stream.once('error',onError);
 });
}

async function scroll(url,args){
 const options=parseOptions(args);
 for(const key of Object.keys(options))if(!['seconds','id','width','height'].includes(key))throw new Error(`Unknown scroll option --${key}.`);
 if(options.seconds===undefined)throw new Error('scroll requires --seconds N.');
 const seconds=Number(options.seconds),width=options.width===undefined?1080:Number(options.width),height=options.height===undefined?1920:Number(options.height);
 if(!Number.isFinite(seconds)||seconds<=0||seconds>120)throw new Error('--seconds must be greater than 0 and at most 120.');
 if(!Number.isInteger(width)||width<320||width>3840||!Number.isInteger(height)||height<240||height>3840)throw new Error('--width/--height must be integers from 320x240 through 3840x3840.');
 const target=new URL(url);await assertRobotsAllows(target.href);
 const {browser,context,page}=await openCapturePage({width,height});
 const frames=Math.max(2,Math.round(seconds*30));
 let file;
 try{
  await openPublicPage(page,target.href);const metadata=await extractPageMetadata(page,target.href);
  const maxScroll=await page.evaluate(()=>Math.max(0,document.documentElement.scrollHeight-window.innerHeight));
  const id=assetId(options.id,metadata,target.href);await ensureIdFree(id);await mkdir(FILES,{recursive:true});file=join(FILES,`${id}.mp4`);
  const encoder=spawn(FFMPEG,['-hide_banner','-loglevel','error','-y','-f','image2pipe','-framerate','30','-vcodec','png','-i','pipe:0','-an','-c:v','libx264','-preset','veryfast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',file],{stdio:['pipe','ignore','pipe']});
  const done=waitForEncoder(encoder);
  try{
   for(let frame=0;frame<frames;frame++){
    const position=maxScroll*frame/(frames-1);
    await page.evaluate(y=>{window.scrollTo(0,y);return new Promise(resolve=>requestAnimationFrame(()=>resolve()));},position);
    await writeFrame(encoder.stdin,await page.screenshot({type:'png'}));
   }
   encoder.stdin.end();await done;
  }catch(error){encoder.stdin.destroy();await done.catch(()=>{});throw error;}
  const createdAt=timestamp(),rights=captureRights(metadata,target.href,createdAt,'Scroll recording');
  try{
   const entry=await registerFile({sourcePath:file,fileRelative:`files/${id}.mp4`,id,kind:KINDS.scroll,sourceUrl:target.href,creator:rights.creator,licence:rights.licence,attribution:rights.attribution,rightsStatus:rights.rightsStatus,restrictions:`${rights.restrictions} Generated as ${frames} scroll frames at 30 fps.`,createdAt});
   console.log(`Recorded ${metadata.title} (${frames} frames at 30 fps; ${maxScroll.toFixed(0)} CSS px of scroll)`);
   console.log(`${entry.id}\n${resolve(ASSET_ROOT,entry.file)}`);
  }catch(error){await rm(file,{force:true});throw error;}
 }finally{await context.close();await browser.close();}
}

async function phone(imagePath,args){
 const options=parseOptions(args);
 for(const key of Object.keys(options))if(key!=='id')throw new Error(`Unknown phone option --${key}.`);
 const input=resolve(imagePath);
 if(extname(input).toLowerCase()!=='.png')throw new Error('phone expects a PNG capture.');
 const source=await resolveSourceEntry(input),inputName=basename(input,extname(input));
 const id=options.id||`phone-${slug(source?.id||inputName).slice(0,30)}-${timestampId()}`;await ensureIdFree(id);await mkdir(FILES,{recursive:true});
 const output=join(FILES,`${id}.png`),browser=await openCaptureBrowser();
 try{
  const image=await renderPhoneFrame(browser,input);await writeFile(output,image);
  const createdAt=timestamp(),sourceUrl=source?.sourceUrl||pathToFileURL(input).href;
  const values=source?{
   creator:source.creator,licence:source.licence,attribution:`Phone-frame presentation of ${source.attribution}`,rightsStatus:source.rightsStatus,
   restrictions:`${source.restrictions} The source capture is displayed without content editing inside a neutral phone frame.`
  }:{creator:'Unknown local creator',licence:'Unknown; rights basis not established.',attribution:'Source attribution unknown; record the creator and credit before publishing.',rightsStatus:'unknown',restrictions:'Rights and origin are unknown; do not publish until verified.'};
  try{
   const entry=await registerFile({sourcePath:output,fileRelative:`files/${id}.png`,id,kind:'screenshot',sourceUrl,createdAt,...values});
   console.log(`Wrapped capture in neutral phone frame\n${entry.id}\n${resolve(ASSET_ROOT,entry.file)}`);
  }catch(error){await rm(output,{force:true});throw error;}
 }finally{await browser.close();}
}

async function resolveSourceEntry(path){
 const entries=await listAssets();
 for(const entry of entries){try{if(await resolveAsset(entry.id)===path)return entry;}catch{}}
 return undefined;
}

async function main(args){
 const [command,target,...rest]=args;
 if(!target||!['shot','scroll','phone'].includes(command))throw new Error(usage);
 if(command==='shot')await shot(target,rest);
 else if(command==='scroll')await scroll(target,rest);
 else await phone(target,rest);
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
}
