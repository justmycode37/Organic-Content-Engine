// Resolve an Objaverse UID to its real GLB and retain per-object provenance.
// node scripts/acryllex/objaverse-assets.mjs search "rigged hand"
// node scripts/acryllex/objaverse-assets.mjs inspect <32-character UID>
import {mkdir,readFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {objaverseSource} from '../../src/acryllex/objaverse-source.ts';
import {writeAtomic} from './atomic-file.mjs';

const BASE='https://huggingface.co/datasets/allenai/objaverse/resolve/main/';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const LICENSES={by:{name:'CC-BY-4.0',url:'https://creativecommons.org/licenses/by/4.0/'},cc0:{name:'CC0-1.0',url:'https://creativecommons.org/publicdomain/zero/1.0/'}};
async function bytes(url,fetcher,limit){
 const response=await fetcher(url,{signal:AbortSignal.timeout(120000)});
 if(!response.ok)throw new Error(`Objaverse download failed (${response.status}): ${url}`);
 const declared=Number(response.headers.get('content-length'));
 if(declared>limit)throw new Error('Objaverse source exceeds the byte limit');
 const reader=response.body.getReader(),parts=[];let size=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw new Error('Objaverse source exceeds the byte limit');parts.push(value);}}
 catch(error){await reader.cancel().catch(()=>{});throw error;}
 finally{reader.releaseLock();}
 return Buffer.concat(parts,size);
}
async function cachedGzip(relative,assetDir,fetcher){
 const file=join(assetDir,'objaverse-metadata',relative);let data;
 try{data=await readFile(file);}catch(error){if(error.code!=='ENOENT')throw error;data=await bytes(BASE+relative,fetcher,80*1024*1024);JSON.parse(gunzipSync(data,{maxOutputLength:160*1024*1024}));await mkdir(dirname(file),{recursive:true});await writeAtomic(file,data);}
 return {data:JSON.parse(gunzipSync(data,{maxOutputLength:160*1024*1024})),sha256:sha(data),url:BASE+relative};
}
export function inspectObjaverseGLB(data){
 if(data.length<20||data.toString('ascii',0,4)!=='glTF'||data.readUInt32LE(4)!==2||data.readUInt32LE(8)!==data.length||data.toString('ascii',16,20)!=='JSON')throw new Error('Objaverse source is not a valid GLB');
 const length=data.readUInt32LE(12);if(length>data.length-20)throw new Error('Objaverse GLB JSON is truncated');
 const document=JSON.parse(data.toString('utf8',20,20+length));
 if(document.asset?.version!=='2.0')throw new Error('Objaverse source must use glTF 2.0');
 for(const resource of [...(document.images??[]),...(document.buffers??[])])if(resource.uri!==undefined&&(typeof resource.uri!=='string'||!resource.uri.startsWith('data:')))throw new Error('Objaverse GLB has an external dependency; use a complete source asset');
 const meshes=document.meshes??[],targets=new Set();let vertices=0,triangles=0;
 for(const mesh of meshes){for(const name of mesh.extras?.targetNames??[])targets.add(name);for(const p of mesh.primitives??[]){vertices+=document.accessors?.[p.attributes?.POSITION]?.count??0;if((p.mode??4)===4)triangles+=(document.accessors?.[p.indices??p.attributes?.POSITION]?.count??0)/3;}}
 return {meshes:meshes.length,vertices,triangles,skins:(document.skins??[]).map(s=>({name:s.name??'',joints:s.joints?.length??0})),animations:(document.animations??[]).map(a=>({name:a.name??'',channels:a.channels?.length??0,paths:[...new Set((a.channels??[]).map(c=>c.target?.path))]})),morphTargets:[...targets],materials:(document.materials??[]).map(m=>m.name??''),extensions:document.extensionsUsed??[]};
}
export async function prepareObjaverseMesh(value,assetDir,{fetcher=fetch,maxBytes=256*1024*1024,expectedSHA256}={}){
 if(!Number.isSafeInteger(maxBytes)||maxBytes<20)throw new Error('Objaverse maxBytes must be a positive safe byte count');
 const uid=objaverseSource(value).slice(10),directory=join(assetDir,'objaverse',uid),file=join(directory,'source.glb'),recordFile=join(directory,'provenance.json');
 let record;
 try{record=JSON.parse(await readFile(recordFile,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 if(record){
  const data=await readFile(file),actual=sha(data);
  if(record.uid!==uid||!LICENSES[record.annotation?.license]||actual!==record.sha256||expectedSHA256!==undefined&&actual!==expectedSHA256)throw new Error('Objaverse cached source differs from its pinned provenance');
  return {file,record:{...record,inspection:inspectObjaverseGLB(data)}};
 }
 const index=await cachedGzip('object-paths.json.gz',assetDir,fetcher),path=index.data[uid];
 if(typeof path!=='string'||!new RegExp('^glbs/[0-9]{3}-[0-9]{3}/'+uid+'\\.glb$').test(path))throw new Error('Objaverse UID is missing from the dataset object index');
 const archive=await cachedGzip('metadata/'+path.split('/')[1]+'.json.gz',assetDir,fetcher),annotation=archive.data[uid];
 if(annotation?.uid!==uid)throw new Error('Objaverse annotation does not match the object UID');
 const license=LICENSES[annotation.license];if(!license)throw new Error('Objaverse object requires a separate licence review; automatic imports accept CC-BY and CC0');
 const author=annotation.user?.displayName||annotation.user?.username;if(!author)throw new Error('Objaverse annotation is missing creator attribution');
 const data=await bytes(BASE+path,fetcher,maxBytes),hash=sha(data);if(expectedSHA256!==undefined&&hash!==expectedSHA256)throw new Error('Objaverse source hash differs from the pinned asset');
 const inspection=inspectObjaverseGLB(data);
 record={uid,name:annotation.name,author,page:annotation.viewerUrl??'https://sketchfab.com/3d-models/'+uid,sourceURL:BASE+path,license:license.name,licenseURL:license.url,sha256:hash,acquiredAt:new Date().toISOString(),captureOrigin:'unverified',annotation,metadata:{indexURL:index.url,indexSHA256:index.sha256,annotationURL:archive.url,annotationSHA256:archive.sha256},inspection,adaptations:[],review:'Source geometry, anatomy, materials and usable motion require visual review. Dataset membership and a rig do not establish realism.'};
 await mkdir(directory,{recursive:true});await writeAtomic(file,data);await writeAtomic(recordFile,JSON.stringify(record,null,2)+'\n');return {file,record};
}
export async function searchObjaverse(query,assetDir,{fetcher=fetch,count=24}={}){
 const index=await cachedGzip('object-paths.json.gz',assetDir,fetcher),url=new URL('https://api.sketchfab.com/v3/search');
 url.search=new URLSearchParams({type:'models',q:String(query),downloadable:'true',count:String(Math.min(100,Math.max(1,count)))});
 const response=await fetcher(url,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error('Objaverse candidate search failed: '+response.status);const data=await response.json();
 return (data.results??[]).filter(x=>index.data[x.uid]&&['CC Attribution','CC0 Public Domain'].includes(x.license?.label)).map(x=>({uid:x.uid,name:x.name,license:x.license.label,page:x.viewerUrl,animations:x.animationCount,vertices:x.vertexCount,sourceURL:BASE+index.data[x.uid],thumbnail:(x.thumbnails?.images??[]).sort((a,b)=>Math.abs(a.width-720)-Math.abs(b.width-720))[0]?.url}));
}
if(import.meta.url.startsWith('file:')&&process.argv[1]===fileURLToPath(import.meta.url)){
 const [command,...args]=process.argv.slice(2),assetDir=fileURLToPath(new URL('../../.acryllex-assets/',import.meta.url));
 if(command==='search')console.log(JSON.stringify(await searchObjaverse(args.join(' '),assetDir),null,2));
 else if(command==='inspect'){const result=await prepareObjaverseMesh(args[0],assetDir);console.log(JSON.stringify({file:result.file,...result.record},null,2));}
 else throw new Error('Usage: objaverse-assets.mjs search <terms> | inspect <UID>');
}
