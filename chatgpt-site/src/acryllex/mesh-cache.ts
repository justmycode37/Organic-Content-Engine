/** Geometry-only liquid caches. ACF1 contains no images, textures or executable data. */
export const FLUID_CACHE_FORMAT='acryllex-fluid-cache-v1';
export const FLUID_FRAME_MAGIC=0x31464341;
export type CacheBounds=[number,number,number,number,number,number];
export interface FluidCacheManifest {format:typeof FLUID_CACHE_FORMAT;fps:number;frames:{file:string;bounds:CacheBounds}[]}
export interface MeshCacheFrame {
 readonly positions:Float32Array;readonly normals:Float32Array;readonly indices:Uint32Array;readonly foam:Float32Array;
 /** Tight bounds of indexed vertices / foam spheres. Empty components have null bounds. */
 readonly meshBounds:CacheBounds|null;readonly foamBounds:CacheBounds|null;readonly bounds:CacheBounds|null;
 readonly byteLength:number;
}
export interface MeshCache {
 readonly fps:number;readonly frames:readonly MeshCacheFrame[];readonly bounds:CacheBounds|null;
 readonly maxVertices:number;readonly maxIndices:number;readonly maxFoam:number;readonly maxFrameBytes:number;readonly byteLength:number;readonly sourceUrl:string;
}
export interface MeshCacheLimits {
 maxFrames:number;maxVertices:number;maxIndices:number;maxFoam:number;maxFrameBytes:number;maxCacheBytes:number;
 maxResidentBytes:number;maxCaches:number;maxManifestBytes:number;
}
export const DEFAULT_MESH_CACHE_LIMITS:Readonly<MeshCacheLimits>=Object.freeze({maxFrames:1000,maxVertices:2_000_000,maxIndices:12_000_000,maxFoam:500_000,maxFrameBytes:128*1024*1024,maxCacheBytes:256*1024*1024,maxResidentBytes:512*1024*1024,maxCaches:8,maxManifestBytes:2*1024*1024});
const LITTLE_ENDIAN=new Uint8Array(new Uint32Array([1]).buffer)[0]===1;
const CACHES=new Map<string,{url:string;cache:MeshCache}>();
const PENDING=new Map<string,{url:string;controller:AbortController;promise:Promise<void>}>();
let queue:Promise<void>=Promise.resolve(),generation=0;
export const fluidCacheKey=(src:string)=>`fluid-cache:${src}`;
export function getMeshCache(key:string){return CACHES.get(key)?.cache;}
export const meshCache=getMeshCache;
export function meshCacheStats(){const unique=new Set([...CACHES.values()].map(x=>x.cache));return {entries:CACHES.size,caches:unique.size,residentBytes:[...unique].reduce((n,c)=>n+c.byteLength,0),pending:PENDING.size};}
/** Releases preload ownership; existing model instances retain their immutable cache until disposed. */
export function clearMeshCaches(){generation++;for(const p of PENDING.values())p.controller.abort();PENDING.clear();CACHES.clear();}

function limits(overrides:Partial<MeshCacheLimits>={}):MeshCacheLimits{
 const out={...DEFAULT_MESH_CACHE_LIMITS,...overrides};
 for(const [key,value] of Object.entries(out))if(!Number.isSafeInteger(value)||value<1)throw new Error(`fluid cache: invalid limit ${key}`);
 return out;
}
/** Deliberately narrow URL path grammar: prepared files never require encoded traversal or backslashes. */
export function meshCacheRelativePath(value:unknown):string{
 if(typeof value!=='string'||!value||value.trim()!==value||value.length>1024||/[\\\u0000-\u001f\u007f%:?#]/.test(value)||value.startsWith('/')||value.split('/').some(p=>!p||p==='.'||p==='..'))throw new Error('fluid cache: unsafe relative file path');
 return value;
}
function bounds(value:unknown):CacheBounds{
 if(!Array.isArray(value)||value.length!==6||value.some(v=>typeof v!=='number'||!Number.isFinite(v))||value.slice(0,3).some((v,i)=>v>value[i+3]))throw new Error('fluid cache: invalid frame bounds');
 return [...value] as CacheBounds;
}
export function validateMeshCacheManifest(value:unknown,overrides:Partial<MeshCacheLimits>={}):FluidCacheManifest{
 const l=limits(overrides),m=value as Partial<FluidCacheManifest>|null;
 if(!m||m.format!==FLUID_CACHE_FORMAT||typeof m.fps!=='number'||!Number.isFinite(m.fps)||m.fps<=0||m.fps>240||!Array.isArray(m.frames)||!m.frames.length||m.frames.length>l.maxFrames)throw new Error('fluid cache: invalid manifest format, fps or frame count');
 return {format:FLUID_CACHE_FORMAT,fps:m.fps,frames:m.frames.map(f=>({file:meshCacheRelativePath(f?.file),bounds:bounds(f?.bounds)}))};
}
function extend(box:CacheBounds|null,x:number,y:number,z:number,r=0):CacheBounds{
 if(!box)return [x-r,y-r,z-r,x+r,y+r,z+r];
 box[0]=Math.min(box[0],x-r);box[1]=Math.min(box[1],y-r);box[2]=Math.min(box[2],z-r);box[3]=Math.max(box[3],x+r);box[4]=Math.max(box[4],y+r);box[5]=Math.max(box[5],z+r);return box;
}
function union(a:CacheBounds|null,b:CacheBounds|null):CacheBounds|null{if(!a)return b?[...b]:null;if(!b)return [...a];return [Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.min(a[2],b[2]),Math.max(a[3],b[3]),Math.max(a[4],b[4]),Math.max(a[5],b[5])];}
function enclosed(actual:CacheBounds|null,declared:CacheBounds){
 if(!actual)return;
 const e=Math.max(1,...declared.map(Math.abs),...actual.map(Math.abs))*1e-5;
 if(actual.slice(0,3).some((v,i)=>v<declared[i]!-e)||actual.slice(3).some((v,i)=>v>declared[i+3]!+e))throw new Error('fluid cache: declared bounds do not enclose geometry and foam');
}
/** Validates before exposing typed views; unused vertices are compacted so precise bounds remain true. */
export function decodeMeshCacheFrame(buffer:ArrayBuffer,declaredBounds:CacheBounds,overrides:Partial<MeshCacheLimits>={}):MeshCacheFrame{
 const l=limits(overrides),declared=bounds(declaredBounds);
 if(buffer.byteLength<16||buffer.byteLength>l.maxFrameBytes)throw new Error('fluid cache: truncated or oversized frame');
 const d=new DataView(buffer),v=d.getUint32(4,true),n=d.getUint32(8,true),f=d.getUint32(12,true);
 if(d.getUint32(0,true)!==FLUID_FRAME_MAGIC)throw new Error('fluid cache: invalid ACF1 magic');
 if(v>l.maxVertices||n>l.maxIndices||f>l.maxFoam||n%3||(!v&&n))throw new Error('fluid cache: invalid topology or resource limit exceeded');
 if(buffer.byteLength!==16+v*24+n*4+f*16)throw new Error('fluid cache: frame byte length does not match header');
 const floats=(off:number,count:number)=>{if(LITTLE_ENDIAN)return new Float32Array(buffer,off,count);const a=new Float32Array(count);for(let i=0;i<count;i++)a[i]=d.getFloat32(off+i*4,true);return a;};
 let positions=floats(16,v*3),normals=floats(16+v*12,v*3),indices:Uint32Array;
 if(LITTLE_ENDIAN)indices=new Uint32Array(buffer,16+v*24,n);else{indices=new Uint32Array(n);for(let i=0;i<n;i++)indices[i]=d.getUint32(16+v*24+i*4,true);}
 let foam=floats(16+v*24+n*4,f*4),meshBounds:CacheBounds|null=null,foamBounds:CacheBounds|null=null;
 for(const a of [positions,normals,foam])for(const x of a)if(!Number.isFinite(x))throw new Error('fluid cache: non-finite vertex, normal or foam value');
 const used=new Uint8Array(v);let referenced=0;
 for(const index of indices){if(index>=v)throw new Error('fluid cache: index is outside vertex array');if(!used[index]){used[index]=1;referenced++;meshBounds=extend(meshBounds,positions[index*3]!,positions[index*3+1]!,positions[index*3+2]!);}}
 for(let i=0;i<f;i++){const off=i*4,r=foam[off+3]!;if(r<0)throw new Error('fluid cache: negative foam radius');foamBounds=extend(foamBounds,foam[off]!,foam[off+1]!,foam[off+2]!,r);}
 const actual=union(meshBounds,foamBounds);enclosed(actual,declared);
 if(referenced!==v){
  const p=new Float32Array(referenced*3),normal=new Float32Array(referenced*3),map=new Uint32Array(v),ix=new Uint32Array(n);let next=0;
  for(let i=0;i<v;i++)if(used[i]){map[i]=next;p.set(positions.subarray(i*3,i*3+3),next*3);normal.set(normals.subarray(i*3,i*3+3),next*3);next++;}
  for(let i=0;i<n;i++)ix[i]=map[indices[i]!]!;
  positions=p;normals=normal;indices=ix;foam=foam.slice();
 }
 const buffers=new Set([positions.buffer,normals.buffer,indices.buffer,foam.buffer]);
 return Object.freeze({positions,normals,indices,foam,meshBounds,foamBounds,bounds:actual,byteLength:[...buffers].reduce((sum,b)=>sum+b.byteLength,0)});
}
/** Absolute sampling, including reverse/loop seeks. No accumulated animation state. */
export function meshCacheFrameIndex(seconds:number,fps:number,count:number,loop=false){
 if(!Number.isFinite(seconds)||!Number.isFinite(fps)||fps<=0||!Number.isSafeInteger(count)||count<1)throw new Error('fluid cache: invalid sample time, fps or frame count');
 if(loop){const period=count/fps,t=((seconds%period)+period)%period;return Math.floor(t*fps+1e-7)%count;}
 if(seconds<=0)return 0;if(seconds>=(count-1)/fps)return count-1;return Math.floor(seconds*fps+1e-7);
}
async function fetchBounded(url:string,maxBytes:number,signal:AbortSignal){
 signal.throwIfAborted();const response=await fetch(url,{signal,redirect:'error'});if(!response.ok)throw new Error(`fluid cache: HTTP ${response.status} for ${url}`);
 const length=response.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>maxBytes))throw new Error('fluid cache: response exceeds byte budget');
 if(!response.body){const b=await response.arrayBuffer();if(b.byteLength>maxBytes)throw new Error('fluid cache: response exceeds byte budget');return b;}
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;const cancel=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
 try{for(;;){signal.throwIfAborted();const part=await reader.read();signal.throwIfAborted();if(part.done)break;size+=part.value.byteLength;if(size>maxBytes){await reader.cancel();throw new Error('fluid cache: response exceeds byte budget');}chunks.push(part.value);}}finally{signal.removeEventListener('abort',cancel);reader.releaseLock();}
 const out=new Uint8Array(size);let offset=0;for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.byteLength;}return out.buffer;
}
function otherResident(key:string){return [...new Set([...CACHES].filter(([k])=>k!==key).map(([,v])=>v.cache))].reduce((n,c)=>n+c.byteLength,0);}
function checkCached(c:MeshCache,l:MeshCacheLimits){if(c.frames.length>l.maxFrames||c.maxVertices>l.maxVertices||c.maxIndices>l.maxIndices||c.maxFoam>l.maxFoam||c.maxFrameBytes>l.maxFrameBytes||c.byteLength>l.maxCacheBytes)throw new Error('fluid cache: cached data exceeds requested resource limits');}
function checkResident(l:MeshCacheLimits){const s=meshCacheStats();if(s.residentBytes>l.maxResidentBytes||s.entries>l.maxCaches)throw new Error('fluid cache: resident resource limits exceeded');}
async function loadCache(key:string,url:string,l:MeshCacheLimits,controller:AbortController,epoch:number){
 const old=CACHES.get(key);if(old?.url===url){checkCached(old.cache,l);checkResident(l);return;}
 const same=[...CACHES.values()].find(x=>x.url===url);if(same){checkCached(same.cache,l);checkResident(l);if(!old&&CACHES.size>=l.maxCaches)throw new Error('fluid cache: resident cache count limit exceeded');CACHES.set(key,same);return;}
 if(!old&&CACHES.size>=l.maxCaches)throw new Error('fluid cache: resident cache count limit exceeded');
 const available=Math.min(l.maxCacheBytes,l.maxResidentBytes-otherResident(key));if(available<1)throw new Error('fluid cache: resident byte limit exceeded');
 const timeout=setTimeout(()=>controller.abort(new Error('fluid cache: preload timed out')),120000);
 try{
  const raw=await fetchBounded(url,l.maxManifestBytes,controller.signal),manifest=validateMeshCacheManifest(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)),l);
  const frames:MeshCacheFrame[]=[],unique=new Map<string,MeshCacheFrame>();let total=0,all:CacheBounds|null=null,maxVertices=0,maxIndices=0,maxFoam=0,maxFrameBytes=0;
  for(const entry of manifest.frames){
   let frame=unique.get(entry.file);
   if(!frame){const data=await fetchBounded(new URL(entry.file,url).href,Math.min(l.maxFrameBytes,available-total),controller.signal);frame=decodeMeshCacheFrame(data,entry.bounds,l);total+=frame.byteLength;if(total>available)throw new Error('fluid cache: cache byte budget exceeded');unique.set(entry.file,frame);}else enclosed(frame.bounds,entry.bounds);
   frames.push(frame);all=union(all,frame.bounds);maxVertices=Math.max(maxVertices,frame.positions.length/3);maxIndices=Math.max(maxIndices,frame.indices.length);maxFoam=Math.max(maxFoam,frame.foam.length/4);maxFrameBytes=Math.max(maxFrameBytes,frame.byteLength);
  }
  controller.signal.throwIfAborted();if(epoch!==generation)throw new Error('fluid cache: preload was cleared');
  CACHES.set(key,{url,cache:Object.freeze({fps:manifest.fps,frames:Object.freeze(frames),bounds:all,maxVertices,maxIndices,maxFoam,maxFrameBytes,byteLength:total,sourceUrl:url})});
 }finally{clearTimeout(timeout);}
}
/** Preloads geometry-only entries in an assets map. Requests are serialised to bound transient allocations. */
export async function preloadMeshCaches(paths:Record<string,string>,assetBase:string,overrides:Partial<MeshCacheLimits>={}){
 const l=limits(overrides),base=new URL(assetBase);if(!/^https?:$/.test(base.protocol)||base.search||base.hash||!base.pathname.endsWith('/'))throw new Error('fluid cache: assetBase must be an HTTP(S) directory URL');
 for(const [key,path] of Object.entries(paths)){
  if(!key.startsWith('fluid-cache:'))continue;const url=new URL(meshCacheRelativePath(path),base).href;
  const pending=PENDING.get(key);if(pending){if(pending.url!==url)throw new Error('fluid cache: conflicting concurrent paths for the same source');await pending.promise;const c=CACHES.get(key);if(c)checkCached(c.cache,l);checkResident(l);continue;}
  const controller=new AbortController(),epoch=generation,task={url,controller,promise:Promise.resolve()};
  const run=queue.then(()=>{controller.signal.throwIfAborted();return loadCache(key,url,l,controller,epoch);});queue=run.catch(()=>{});
  task.promise=run.finally(()=>{if(PENDING.get(key)===task)PENDING.delete(key);});PENDING.set(key,task);await task.promise;
 }
}
