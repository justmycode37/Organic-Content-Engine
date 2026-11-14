import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {prepareImportedMesh} from './acryllex/mesh-assets.mjs';
import {prepareObjaverseMesh,inspectObjaverseGLB,searchObjaverse} from './acryllex/objaverse-assets.mjs';
import {objaverseSource} from '../src/acryllex/objaverse-source.ts';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';

test('arbitrary glTF imports carry real external geometry/textures and changed source files invalidate the cache',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'acx-mesh-source-')),assets=join(dir,'assets');
 try{
  const source=join(dir,'subject.gltf'),buffer=join(dir,'positions.bin'),image=join(dir,'surface.png');
  const original=Buffer.from(new Float32Array([0,0,0,1,0,0,0,1,0]).buffer);
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5q0AAAAASUVORK5CYII=','base64');
  await writeFile(buffer,original);await writeFile(image,png);
  await writeFile(source,JSON.stringify({asset:{version:'2.0'},buffers:[{uri:'positions.bin',byteLength:original.length}],images:[{uri:'surface.png'}]}));
  const first=await prepareImportedMesh(source,assets),doc=JSON.parse(await readFile(join(assets,first),'utf8'));
  assert.deepEqual(await readFile(join(assets,dirname(first),doc.buffers[0].uri)),original);
  assert.deepEqual(await readFile(join(assets,dirname(first),doc.images[0].uri)),png);
  assert.equal(await prepareImportedMesh(source,assets),first);
  const changed=Buffer.from(original);changed.writeFloatLE(2,12);await writeFile(buffer,changed);
  const second=await prepareImportedMesh(source,assets);assert.notEqual(second,first);
  const updated=JSON.parse(await readFile(join(assets,second),'utf8'));assert.deepEqual(await readFile(join(assets,dirname(second),updated.buffers[0].uri)),changed);
  await assert.rejects(()=>prepareImportedMesh(source,assets,'invalid-pin'),/hash differs/);
  await rm(buffer);await assert.rejects(()=>prepareImportedMesh(source,assets),/ENOENT/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('missing, malformed and unsupported exact meshes fail rather than returning proxy geometry',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'acx-mesh-bad-'));
 try{
  const file=join(dir,'bad.glb');await writeFile(file,'not a model');
  await assert.rejects(()=>prepareImportedMesh(file,dir),/valid glTF 2 GLB/);
  await assert.rejects(()=>prepareImportedMesh(join(dir,'missing.glb'),dir),/ENOENT/);
  await assert.rejects(()=>prepareImportedMesh(join(dir,'model.obj'),dir),/requires a .glb or .gltf/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

const UID='0123456789abcdef0123456789abcdef',OBJECT_PATH='glbs/000-042/'+UID+'.glb';
function glbFixture(change={}){
 const doc={asset:{version:'2.0'},accessors:[{count:3,type:'VEC3',componentType:5126}],meshes:[{extras:{targetNames:['smile']},primitives:[{attributes:{POSITION:0}}]}],skins:[{name:'source rig',joints:[0,1]}],animations:[{name:'source flex',channels:[{target:{path:'rotation'}}]}],...change};
 const raw=Buffer.from(JSON.stringify(doc)),json=Buffer.concat([raw,Buffer.alloc((4-raw.length%4)%4,32)]),header=Buffer.alloc(20);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(20+json.length,8);header.writeUInt32LE(json.length,12);header.write('JSON',16);return Buffer.concat([header,json]);
}
function objaverseFixture(license='by',data=glbFixture()){
 const requests=[],annotation={uid:UID,name:'Source fixture',license,user:{displayName:'Fixture Author'},viewerUrl:'https://sketchfab.com/3d-models/'+UID};
 const fetcher=async url=>{url=String(url);requests.push(url);
  if(url.endsWith('object-paths.json.gz'))return new Response(gzipSync(JSON.stringify({[UID]:OBJECT_PATH})));
  if(url.endsWith('metadata/000-042.json.gz'))return new Response(gzipSync(JSON.stringify({[UID]:annotation})));
  if(url.endsWith(OBJECT_PATH))return new Response(data);
  throw new Error('Unexpected download '+url);
 };
 return {requests,fetcher,data,annotation};
}
test('Objaverse imports retain per-object licence, creator, hashes and real rig/clip metadata; cached bytes stay pinned',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'acx-objaverse-')),fixture=objaverseFixture();
 try{
  const first=await prepareObjaverseMesh(UID.toUpperCase(),dir,{fetcher:fixture.fetcher});assert.equal(first.record.uid,UID);assert.equal(first.record.author,'Fixture Author');assert.equal(first.record.license,'CC-BY-4.0');assert.deepEqual(first.record.annotation,fixture.annotation);
  assert.equal(first.record.sha256,createHash('sha256').update(fixture.data).digest('hex'));assert.deepEqual(await readFile(first.file),fixture.data);
  assert.equal(first.record.inspection.skins[0].joints,2);assert.equal(first.record.inspection.animations[0].name,'source flex');assert.deepEqual(first.record.inspection.morphTargets,['smile']);assert.equal(first.record.captureOrigin,'unverified');assert.equal(fixture.requests.length,3);
  const second=await prepareObjaverseMesh(UID,dir,{fetcher:()=>{throw new Error('Cache should be offline');}});assert.equal(second.record.sha256,first.record.sha256);
  await assert.rejects(()=>prepareObjaverseMesh(UID,dir,{expectedSHA256:'incorrect'}),/pinned provenance/);
  await writeFile(first.file,glbFixture({materials:[{name:'changed'}]}));await assert.rejects(()=>prepareObjaverseMesh(UID,dir),/pinned provenance/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('Objaverse source failures never create a substitute mesh or import a restricted object silently',async()=>{
 for(const license of ['by-nc','by-nc-sa','unknown']){
  const dir=await mkdtemp(join(tmpdir(),'acx-objaverse-license-')),fixture=objaverseFixture(license);
  try{await assert.rejects(()=>prepareObjaverseMesh(UID,dir,{fetcher:fixture.fetcher}),/licence review/);assert.equal(fixture.requests.length,2);}finally{await rm(dir,{recursive:true,force:true});}
 }
 assert.equal(objaverseSource(UID.toUpperCase()),'objaverse:'+UID);for(const bad of ['',null,'../head.glb','https://host/mesh.glb','f'.repeat(31)])assert.throws(()=>objaverseSource(bad),/hexadecimal/);
 const dir=await mkdtemp(join(tmpdir(),'acx-objaverse-limit-')),fixture=objaverseFixture();
 try{await assert.rejects(()=>prepareObjaverseMesh(UID,dir,{fetcher:fixture.fetcher,maxBytes:20}),/byte limit/);}finally{await rm(dir,{recursive:true,force:true});}
 for(const resource of [{images:[{uri:'https://host/eye.png'}]},{buffers:[{uri:'./shape.bin'}]}])assert.throws(()=>inspectObjaverseGLB(glbFixture(resource)),/external dependency/);
 assert.throws(()=>inspectObjaverseGLB(Buffer.from('not a GLB')),/valid GLB/);assert.throws(()=>inspectObjaverseGLB(glbFixture({asset:{version:'1.0'}})),/glTF 2.0/);
});
test('Objaverse discovery keeps actual dataset members and distinguishes available clips from a model title',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'acx-objaverse-search-')),fixture=objaverseFixture();
 try{
  const rows=[{uid:UID,name:'Rigged hand',license:{label:'CC Attribution'},animationCount:0,vertexCount:40,viewerUrl:'source page',thumbnails:{images:[]}},{uid:'not-in-dataset',license:{label:'CC Attribution'}},{uid:UID,license:{label:'CC Attribution-NonCommercial'}}];
  const fetcher=async url=>String(url).includes('/v3/search?')?new Response(JSON.stringify({results:rows})):fixture.fetcher(url);
  const found=await searchObjaverse('hand',dir,{fetcher});assert.equal(found.length,1);assert.equal(found[0].animations,0);assert.equal(found[0].sourceURL.endsWith(OBJECT_PATH),true);
 }finally{await rm(dir,{recursive:true,force:true});}
});
