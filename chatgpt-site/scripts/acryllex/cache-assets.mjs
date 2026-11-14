// Local, geometry-only fluid-cache preparation. Does not execute a simulator or import images.
import {mkdir,writeFile,realpath,lstat,open,rm,mkdtemp,rename} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname,join,relative,isAbsolute} from 'node:path';

export const FLUID_CACHE_FORMAT='acryllex-fluid-cache-v1';
const MAGIC=0x31464341;
export const DEFAULT_FLUID_CACHE_LIMITS=Object.freeze({maxFrames:1000,maxVertices:2_000_000,maxIndices:12_000_000,maxFoam:500_000,maxFrameBytes:128*1024*1024,maxCacheBytes:256*1024*1024,maxResidentBytes:512*1024*1024,maxCaches:8,maxManifestBytes:2*1024*1024});
export const fluidCacheKey=src=>`fluid-cache:${src}`;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const inside=(root,file)=>{const r=relative(root,file);return r===''||(!isAbsolute(r)&&r!=='..'&&!r.startsWith(`..${process.platform==='win32'?'\\':'/'}`));};
const limits=overrides=>{const out={...DEFAULT_FLUID_CACHE_LIMITS,...overrides};for(const [k,v] of Object.entries(out))if(!Number.isSafeInteger(v)||v<1)throw new Error(`fluid cache: invalid limit ${k}`);return out;};
function safeRelative(value){
 if(typeof value!=='string'||!value||value.trim()!==value||value.length>1024||/[\\\u0000-\u001f\u007f%:?#]/.test(value)||value.startsWith('/')||value.split('/').some(p=>!p||p==='.'||p==='..'))throw new Error('fluid cache: unsafe relative file path');
 return value;
}
function parseBounds(value){if(!Array.isArray(value)||value.length!==6||value.some(v=>typeof v!=='number'||!Number.isFinite(v))||value.slice(0,3).some((v,i)=>v>value[i+3]))throw new Error('fluid cache: invalid frame bounds');return [...value];}
export function validateFluidCacheManifest(value,overrides={}){
 const l=limits(overrides);
 if(!value||value.format!==FLUID_CACHE_FORMAT||typeof value.fps!=='number'||!Number.isFinite(value.fps)||value.fps<=0||value.fps>240||!Array.isArray(value.frames)||!value.frames.length||value.frames.length>l.maxFrames)throw new Error('fluid cache: invalid manifest format, fps or frame count');
 return {format:FLUID_CACHE_FORMAT,fps:value.fps,frames:value.frames.map(f=>({file:safeRelative(f?.file),bounds:parseBounds(f?.bounds)}))};
}
async function readBounded(file,maxBytes){
 const handle=await open(file,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{const s=await handle.stat();if(!s.isFile()||s.size>maxBytes)throw new Error('fluid cache: file is not regular or exceeds resource budget');const b=await handle.readFile();if(b.byteLength>maxBytes)throw new Error('fluid cache: file changed beyond resource budget');return b;}finally{await handle.close();}
}
async function safeSource(root,file,maxBytes){const target=await realpath(resolve(root,safeRelative(file)));if(!inside(root,target))throw new Error('fluid cache: frame symlink escapes manifest directory');return {file:target,bytes:await readBounded(target,maxBytes)};}
function extend(b,x,y,z,r=0){if(!b)return [x-r,y-r,z-r,x+r,y+r,z+r];for(let i=0;i<3;i++){const v=[x,y,z][i];b[i]=Math.min(b[i],v-r);b[i+3]=Math.max(b[i+3],v+r);}return b;}
function enclose(actual,declared){if(!actual)return;const e=Math.max(1,...actual.map(Math.abs),...declared.map(Math.abs))*1e-5;if(actual.slice(0,3).some((v,i)=>v<declared[i]-e)||actual.slice(3).some((v,i)=>v>declared[i+3]+e))throw new Error('fluid cache: bounds do not enclose indexed geometry and foam spheres');}
function inspectFrame(b,declared,l){
 if(b.byteLength<16||b.byteLength>l.maxFrameBytes)throw new Error('fluid cache: truncated or oversized frame');
 if(b.readUInt32LE(0)!==MAGIC)throw new Error('fluid cache: invalid ACF1 magic');
 const v=b.readUInt32LE(4),n=b.readUInt32LE(8),f=b.readUInt32LE(12);
 if(v>l.maxVertices||n>l.maxIndices||f>l.maxFoam||n%3||(!v&&n))throw new Error('fluid cache: invalid topology or count limit exceeded');
 if(b.byteLength!==16+v*24+n*4+f*16)throw new Error('fluid cache: frame byte length does not match header');
 let actual=null;for(let off=16;off<16+v*24;off+=4)if(!Number.isFinite(b.readFloatLE(off)))throw new Error('fluid cache: non-finite vertex or normal');
 for(let i=0;i<n;i++){const index=b.readUInt32LE(16+v*24+i*4);if(index>=v)throw new Error('fluid cache: index outside vertex array');const off=16+index*12;actual=extend(actual,b.readFloatLE(off),b.readFloatLE(off+4),b.readFloatLE(off+8));}
 for(let i=0;i<f;i++){const off=16+v*24+n*4+i*16,x=b.readFloatLE(off),y=b.readFloatLE(off+4),z=b.readFloatLE(off+8),r=b.readFloatLE(off+12);if(![x,y,z,r].every(Number.isFinite)||r<0)throw new Error('fluid cache: invalid foam sphere');actual=extend(actual,x,y,z,r);}
 enclose(actual,declared);return {vertices:v,indices:n,foam:f,actual};
}
async function ready(dir,manifest,files,l){
 try{
  const parsed=JSON.parse(await readBounded(join(dir,'manifest.json'),l.maxManifestBytes));if(JSON.stringify(parsed)!==JSON.stringify(manifest))return false;
  for(const f of files){const checked=await safeSource(dir,f.dest,l.maxFrameBytes);if(checked.bytes.byteLength!==f.size||digest(checked.bytes)!==f.hash)return false;}
  return true;
 }catch{return false;}
}
async function prepareOne(src,assetRoot,l){
 if(/^[a-z][a-z0-9+.-]*:\/\//i.test(src)||src.includes('\u0000'))throw new Error('fluid cache: params.file must be a local manifest path');
 const main=await realpath(resolve(src)),sourceRoot=dirname(main),raw=await readBounded(main,l.maxManifestBytes);let json;
 try{json=JSON.parse(raw.toString('utf8'));}catch{throw new Error(`fluid cache: invalid JSON manifest ${src}`);}
 const manifest=validateFluidCacheManifest(json,l),unique=new Map(),frames=[];let total=0;
 for(const frame of manifest.frames){
  let f=unique.get(frame.file);
  if(!f){
   const checked=await safeSource(sourceRoot,frame.file,l.maxFrameBytes),info=inspectFrame(checked.bytes,frame.bounds,l);total+=checked.bytes.byteLength;if(total>l.maxCacheBytes)throw new Error('fluid cache: cache byte budget exceeded');
   f={source:frame.file,realFile:checked.file,dest:`frame${String(unique.size).padStart(6,'0')}.bin`,hash:digest(checked.bytes),size:checked.bytes.byteLength,actual:info.actual};unique.set(frame.file,f);
  }else enclose(f.actual,frame.bounds);
  frames.push({file:f.dest,bounds:frame.bounds});
 }
 const output={format:FLUID_CACHE_FORMAT,fps:manifest.fps,frames};
 const hash=createHash('sha256').update(JSON.stringify(output));for(const f of unique.values())hash.update(f.hash);const id=hash.digest('hex').slice(0,24),rel=`fluid-cache/${id}/manifest.json`,files=[...unique.values()];
 const lexicalParent=join(assetRoot,'fluid-cache'),prior=await lstat(lexicalParent).catch(error=>{if(error.code==='ENOENT')return null;throw error;});if(prior?.isSymbolicLink())throw new Error('fluid cache: prepared cache directory must not be a symlink');await mkdir(lexicalParent,{recursive:true});const parent=await realpath(lexicalParent);if(!inside(assetRoot,parent))throw new Error('fluid cache: prepared cache directory escapes asset root');const dir=join(parent,id);
 if(await ready(dir,output,files,l))return {rel,bytes:total,id};
 const temp=await mkdtemp(join(parent,`.${id}-`));
 try{
  for(const f of files){const current=await safeSource(sourceRoot,f.source,l.maxFrameBytes);if(current.file!==f.realFile||current.bytes.byteLength!==f.size||digest(current.bytes)!==f.hash)throw new Error('fluid cache: source changed while preparing');await writeFile(join(temp,f.dest),current.bytes,{flag:'wx'});}
  await writeFile(join(temp,'manifest.json'),JSON.stringify(output)+'\n',{flag:'wx'});
  // Only generated content-addressed cache directories are repaired or replaced.
  if(await ready(dir,output,files,l))return {rel,bytes:total,id};
  try{await rename(temp,dir);}catch(error){if(await ready(dir,output,files,l))return {rel,bytes:total,id};if(error.code==='EEXIST'||error.code==='ENOTEMPTY'){await rm(dir,{recursive:true,force:true});await rename(temp,dir);}else throw error;}
  return {rel,bytes:total,id};
 }finally{await rm(temp,{recursive:true,force:true});}
}
/** Discover fluid-cache models and copy validated geometry into an immutable hashed asset directory. */
export async function prepareFluidCaches(spec,assetDir,overrides={}){
 const l=limits(overrides),sources=new Set();
 for(const scene of spec.scenes??[])for(const object of scene.objects??[]){const model=String(object.model??'').trim().toLowerCase().replace(/[\s_]+/g,'-');if(!['fluid-cache','liquid-cache','cached-fluid'].includes(model))continue;const file=object.params?.file;if(typeof file!=='string'||!file.trim())throw new Error('fluid cache: model requires params.file');sources.add(file);}
 if(sources.size>l.maxCaches)throw new Error('fluid cache: too many distinct cache sources');if(!sources.size)return {};
 await mkdir(resolve(assetDir),{recursive:true});const assetRoot=await realpath(resolve(assetDir)),out={},unique=new Set();let total=0;
 for(const src of sources){const prepared=await prepareOne(src,assetRoot,l);if(!unique.has(prepared.id)){total+=prepared.bytes;unique.add(prepared.id);if(total>l.maxResidentBytes)throw new Error('fluid cache: spec exceeds resident byte budget');}out[fluidCacheKey(src)]=prepared.rel;}
 return out;
}
