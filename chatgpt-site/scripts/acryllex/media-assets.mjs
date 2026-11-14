// Prepare real image/video assets for the shared pixel renderer. No source footage is bundled in code.
import {createHash,randomUUID} from 'node:crypto';
import {createReadStream,createWriteStream} from 'node:fs';
import {access,mkdir,readFile,readdir,rename,rm,stat,writeFile} from 'node:fs/promises';
import {once} from 'node:events';
import {extname,join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {footageVariantKey,backgroundKey} from '../../src/acryllex/media-key.ts';
import {referenceKind,referenceProblems} from '../../src/acryllex/reference-media.ts';
import {MEDIA_LIBRARY,isFootageModel,resolveFootageParams} from '../../src/acryllex/media-library.ts';

const MAX_INPUT=512*1024*1024,MAX_ATLASES=256*1024*1024,MAX_FRAMES=2400;
const exists=file=>access(file).then(()=>true,()=>false);
const hash=text=>createHash('sha256').update(text).digest('hex');
async function fileHash(file){const h=createHash('sha256');for await(const chunk of createReadStream(file))h.update(chunk);return h.digest('hex');}
function run(program,args){const result=spawnSync(program,args,{encoding:'utf8',maxBuffer:4*1024*1024});if(result.error)throw result.error;if(result.status!==0)throw new Error(`${program} media preparation failed: ${result.stderr.slice(-4000)}`);return result.stdout;}
function number(params,key,fallback,min,max){const value=params[key]===undefined?fallback:Number(params[key]);if(!Number.isFinite(value)||value<min||value>max)throw new Error(`footage ${key} must be ${min}..${max}`);return value;}

/** Public HTTPS inputs are cached locally; references and licenses belong with the asset catalogue. */
export async function sourceFile(source,assetDir){
 if(source.startsWith('library:')){
  const name=source.slice(8);if(!/^[a-z0-9][a-z0-9.-]*$/i.test(name))throw new Error('footage: invalid library media path');
  source=fileURLToPath(new URL('../../src/acryllex/assets/media/'+name,import.meta.url));
 }
 if(!/^https:\/\//i.test(source)){
  if(/^[a-z]+:\/\//i.test(source))throw new Error('footage URL must use HTTPS');
  const file=resolve(source),s=await stat(file);if(!s.isFile()||s.size>MAX_INPUT)throw new Error('footage input is missing or exceeds512MiB');return file;
 }
 const dir=join(assetDir,'media-inputs');await mkdir(dir,{recursive:true});
 const ext=extname(new URL(source).pathname).toLowerCase().replace(/[^.a-z0-9]/g,'').slice(0,12)||'.bin';
 const file=join(dir,hash(source).slice(0,24)+ext);if(await exists(file))return file;
 const response=await fetch(source,{signal:AbortSignal.timeout(120000)});if(!response.ok||!response.body)throw new Error(`footage download HTTP${response.status}: ${source}`);
 if(Number(response.headers.get('content-length'))>MAX_INPUT){await response.body.cancel();throw new Error('footage download exceeds512MiB');}
 const pending=file+'.'+randomUUID()+'.tmp',stream=createWriteStream(pending);let size=0,error;stream.on('error',e=>{error=e;});
 try{for await(const chunk of response.body){size+=chunk.length;if(size>MAX_INPUT)throw new Error('footage download exceeds512MiB');if(error)throw error;if(!stream.write(chunk))await once(stream,'drain');}stream.end();await once(stream,'finish');await rename(pending,file);return file;}
 catch(e){stream.destroy();await rm(pending,{force:true});throw e;}
}

function probe(file){
 const data=JSON.parse(run('ffprobe',['-v','error','-select_streams','v:0','-show_streams','-show_format','-of','json',file]));
 const stream=data.streams?.[0];if(!stream?.width||!stream.height)throw new Error('footage contains no decodable image/video stream');
 const angle=Number(stream.side_data_list?.find(s=>s.rotation!==undefined)?.rotation??stream.tags?.rotate??0),swap=Math.abs(angle/90)%2===1;
 const duration=Number(stream.duration??data.format?.duration),imageFormat=String(data.format?.format_name??'').split(',')[0];
 const still=['image2','image2pipe','jpeg_pipe','png_pipe','webp_pipe','tiff_pipe','bmp_pipe','avif'].includes(imageFormat)||!Number.isFinite(duration)||duration<=0;
 return {width:swap?stream.height:stream.width,height:swap?stream.width:stream.height,duration:still?null:duration,still};
}

async function prepareOne(source,params,format,assetDir){
 const file=await sourceFile(source,assetDir),input=probe(file),sourceSHA256=await fileHash(file);
 if(params.mediaKind==='image'&&!input.still)throw new Error('reference-image requires a still photograph; use reference-video for moving action');
 if(params.mediaKind==='video'&&input.still)throw new Error('reference-video requires moving source frames; a photograph cannot supply articulation');
 const keyBackground=params.backgroundKey===undefined?null:backgroundKey(params.backgroundKey);
 if(params.expectedSHA256!==undefined&&params.expectedSHA256!==sourceSHA256)throw new Error('footage: source hash differs from the pinned library asset');
 const fps=number(params,'fps',30,.1,120),blur=number(params,'blur',1.2,0,10),start=number(params,'sourceStart',0,0,1e7);
 const duration=params.sourceDuration===undefined?(input.still?1/fps:null):number(params,'sourceDuration',null,1/fps,MAX_FRAMES/fps);
 if(input.still&&start!==0)throw new Error('footage sourceStart must be0 for a still image');
 if(input.duration!==null&&start>=input.duration)throw new Error('footage sourceStart is past the source end');
 const effectiveDuration=duration===null?input.duration:Math.min(duration,input.duration===null?duration:input.duration-start);
 if(effectiveDuration!==null&&Math.ceil(effectiveDuration*fps)>MAX_FRAMES)throw new Error('footage exceeds2400 prepared frames; set sourceStart/sourceDuration');
 let width=input.width,height=input.height;const crop=String(params.crop??'').trim();
 if(crop){if(!/^\d+:\d+:\d+:\d+$/.test(crop))throw new Error('footage crop must be W:H:X:Y');const [w,h,x,y]=crop.split(':').map(Number);if(w<1||h<1||x+w>width||y+h>height)throw new Error('footage crop exceeds the source bounds');width=w;height=h;}
 const cell=Math.max(2,Number(format?.cell??3)),samples=number(params,'sampleScale',1,1,4),defaultW=Math.round(Number(format?.width??1080)/cell)*samples,defaultH=Math.round(Number(format?.height??1920)/cell)*samples;
 let w=Math.round(number(params,'cols',defaultW,1,4096)),h=Math.round(number(params,'rows',defaultH,1,4096));
 if(params.preserveAspect===true){if(params.rows===undefined)h=Math.max(1,Math.round(w*height/width));else if(params.cols===undefined)w=Math.max(1,Math.round(h*width/height));}
 if(w>4096||h>4096)throw new Error('footage aspect requires an atlas dimension above4096');
 const alphaSource=String(params.alphaFile??''),alphaFile=alphaSource?await sourceFile(alphaSource,assetDir):null,alphaInfo=alphaFile?probe(alphaFile):null;
 // Matroska duration metadata rounds to milliseconds even for exact 30fps masks.
 if(alphaInfo?.duration!==null&&alphaInfo?.duration!==undefined&&effectiveDuration!==null&&start+effectiveDuration>alphaInfo.duration+.001)throw new Error('footage: alpha video does not cover the requested source interval');
 const alphaSHA256=alphaFile?await fileHash(alphaFile):null;
 const identity={version:3,asset:params.asset??null,sourceSHA256,alphaSHA256,w,h,fps,start,duration,crop,blur,monochrome:params.monochrome===true,invertAlpha:params.invertAlpha===true,mirrorX:params.mirrorX===true,mirrorY:params.mirrorY===true,backgroundKey:keyBackground};
 const key=hash(JSON.stringify(identity)).slice(0,24),relative=`import/media-${key}`,dir=join(assetDir,relative),manifest=join(dir,'manifest.json');
 if(await exists(manifest))return relative+'/manifest.json';
 const pending=dir+'.'+randomUUID()+'.tmp';await mkdir(pending,{recursive:true});
 try{
  const cols=input.still?1:Math.max(1,Math.min(8,Math.floor(4096/w))),rows=input.still?1:Math.max(1,Math.min(8,Math.floor(4096/h))),args=['-v','error','-y','-threads','2'];
  if(input.still)args.push('-loop','1');args.push('-i',file);
  if(alphaFile){if(alphaInfo.still)args.push('-loop','1');args.push('-i',alphaFile);}
  const trim=`trim=start=${start}${effectiveDuration===null?'':`:duration=${effectiveDuration}`},setpts=PTS-STARTPTS,fps=${fps}`;
  let filters=`[0:v:0]${trim}${crop?`,crop=${crop}`:''},format=rgba${keyBackground?`,colorkey=0x${keyBackground.color.slice(1)}:${keyBackground.similarity}:${keyBackground.blend}`:''}${blur>0?`,gblur=sigma=${blur}`:''},scale=${w}:${h}:flags=area,setsar=1,format=rgba`;
  if(params.monochrome===true)filters+=',colorchannelmixer=rr=.2126:rg=.7152:rb=.0722:gr=.2126:gg=.7152:gb=.0722:br=.2126:bg=.7152:bb=.0722';
  filters+='[image];';let final='image';
  if(alphaFile){filters+=`[1:v:0]${trim}${crop?`,crop=${crop}`:''},scale=${w}:${h}:flags=area,format=gray${params.invertAlpha===true?',negate':''}[mask];[image][mask]alphamerge=shortest=1[rgba];`;final='rgba';}
  if(params.mirrorX===true||params.mirrorY===true){filters+=`[${final}]${[params.mirrorX===true?'hflip':'',params.mirrorY===true?'vflip':''].filter(Boolean).join(',')}[mirrored];`;final='mirrored';}
  filters+=`[${final}]split=2[tiles][count];[tiles]tile=${cols}x${rows}[atlas]`;
  args.push('-filter_complex_threads','1','-filter_complex',filters,'-map','[atlas]','-an','-fps_mode','passthrough','-threads','2',join(pending,'a%06d.png'),'-map','[count]','-an','-fps_mode','passthrough','-c:v','rawvideo','-threads','2','-f','framecrc','pipe:1');
  const counts=run('ffmpeg',args),frames=counts.split('\n').filter(line=>/^\s*\d+\s*,/.test(line)).length;
  if(frames<1||frames>MAX_FRAMES)throw new Error('footage produced an invalid prepared frame count');
  const atlases=(await readdir(pending)).filter(f=>/^a\d+\.png$/.test(f)).sort();
  if(atlases.length!==Math.ceil(frames/(cols*rows)))throw new Error('footage atlas count does not match decoded frame count');
  let bytes=0;for(const file of atlases)bytes+=(await stat(join(pending,file))).size;if(bytes>MAX_ATLASES)throw new Error('footage atlases exceed256MiB; reduce sourceDuration or resolution');
  const entry=MEDIA_LIBRARY[params.asset];
  await writeFile(join(pending,'manifest.json'),JSON.stringify({w,h,cols,rows,fps,frames,atlases:atlases.map(f=>relative+'/'+f),sourceWidth:width,sourceHeight:height,sourceStart:start,sourceDuration:effectiveDuration,sourceKind:input.still?'photograph':'video',monochrome:params.monochrome===true,sourceSHA256,alphaSHA256,backgroundKey:keyBackground,preparedVersion:3,...(entry?{provenance:{asset:params.asset,creator:entry.creator,acquired:entry.acquired,page:entry.page,license:entry.license,terms:entry.terms,capture:entry.capture}}:{})})+'\n');
  try{await rename(pending,dir);}catch(e){if(!await exists(manifest))throw e;await rm(pending,{recursive:true,force:true});}
  return relative+'/manifest.json';
 }catch(e){await rm(pending,{recursive:true,force:true});throw e;}
}

export async function prepareFootage(spec,assetDir){
 const out={},aliases=new Map();
 for(const scene of spec.scenes??[])for(const object of scene.objects??[]){
  if(!isFootageModel(String(object.model)))continue;
  const params=resolveFootageParams(object.model,object.params),source=String(params.file??params.url??'');if(!source)throw new Error('footage requires params.asset, params.file or params.url');
  const problems=referenceProblems(scene);if(problems.length)throw new Error(problems.join('; '));
  const kind=referenceKind(object.model);if(kind)params.mediaKind=kind;
  const key=footageVariantKey(source,params);if(!out[key])out[key]=await prepareOne(source,params,spec.format,assetDir);
  const alias='footage:'+source;if(!aliases.has(alias))aliases.set(alias,out[key]);else if(aliases.get(alias)!==out[key])aliases.set(alias,null);
 }
 for(const [alias,path]of aliases)if(path!==null)out[alias]=path;
 return out;
}
