import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {loadCatalog} from './acryllex/catalog.mjs';
import {footage,humanMaleFootage,humanFemaleFootage,waveFootage,preloadAssets} from '../src/acryllex/assets.ts';
import {MEDIA_LIBRARY,isFootageModel,resolveFootageParams} from '../src/acryllex/media-library.ts';
import {footageVariantKey} from '../src/acryllex/media-key.ts';
import {sceneSchema} from '../src/acryllex/schema.ts';

const subjects=[
 {id:'human-male-footage',aliases:['human-footage','man-footage'],asset:'human-male-motion',definition:humanMaleFootage},
 {id:'human-female-footage',aliases:['woman-footage'],asset:'human-female-motion',definition:humanFemaleFootage},
];
const ctx=params=>({params,num:(k,f)=>params[k]??f,bool:(k,f)=>params[k]??f});

test('captured camera-root transforms accept bounded dense tracks without allowing unlimited keys',()=>{
 const spec=count=>({say:'walk',duration:5,objects:[{id:'root',model:'cube',keyframes:Array.from({length:count},(_,i)=>({at:i/120,pos:[i/120,0,0],easing:'linear'}))}]});
 assert.equal(sceneSchema.safeParse(spec(600)).success,true);
 assert.equal(sceneSchema.safeParse(spec(601)).success,false);
});

test('public catalogue exposes separate fixed-view human subjects and preserves poseable humans',async()=>{
 const c=await loadCatalog();
 for(const {id,aliases} of subjects){
  assert.ok(c.ids.includes(id));const model=c.models.find(m=>m.id===id);
  assert.deepEqual(model.aliases,aliases);assert.equal(model.poses,undefined);
  assert.match(model.describe,/fixed-view prerecorded/i);assert.match(model.describe,/cannot rotate/);
  for(const alias of aliases)assert.ok(c.has(alias),alias);
 }
 for(const id of ['human','human-male','human-female']){
  const human=c.models.find(m=>m.id===id);assert.ok(human,id);
  assert.ok(human.poses.includes('walk'));assert.ok(human.poses.includes('sit'));assert.ok(human.poses.includes('type'));
  assert.equal(isFootageModel(id),false);
 }
});

test('each human name resolves the full approved preset without mutating inputs or weakening its pin',()=>{
 for(const {id,aliases,asset} of subjects){
  const entry=MEDIA_LIBRARY[asset];assert.ok(entry,`${asset} must be integrated before this test`);
  assert.match(entry.defaults.expectedSHA256,/^[a-f0-9]{64}$/);
  assert.ok(entry.defaults.file);assert.ok(entry.defaults.alphaFile);assert.ok(entry.defaults.fps>0);
  const before=structuredClone(entry);
  for(const name of [id,...aliases,` ${id.toUpperCase().replaceAll('-','_')} `]){
   assert.equal(isFootageModel(name),true);
   assert.deepEqual(resolveFootageParams(name),{...entry.defaults,asset});
   for(const value of [undefined,null])assert.deepEqual(resolveFootageParams(name,{asset:value}),{...entry.defaults,asset});
   const params=Object.freeze({start:1.25,height:1.8,expectedSHA256:'untrusted override'});
   assert.deepEqual(resolveFootageParams(name,params),{...entry.defaults,...params,asset,expectedSHA256:entry.defaults.expectedSHA256});
   for(const extra of [{file:'custom.mp4'},{url:'https://example.test/custom.mp4'}])assert.throws(()=>resolveFootageParams(name,extra),/choose a library asset or a custom file\/URL/);
  }
  assert.deepEqual(entry,before);
 }
 const custom=Object.freeze({file:'custom.mp4'});assert.equal(resolveFootageParams('footage',custom),custom);
 assert.equal(isFootageModel('toString'),false);assert.equal(resolveFootageParams('toString',custom),custom);
});

test('explicit asset overrides select another preset and existing ocean defaults remain exact',()=>{
 for(const {id,definition} of subjects){
  assert.deepEqual(resolveFootageParams(id,{asset:'ocean-barrel'}),{...MEDIA_LIBRARY['ocean-barrel'].defaults,asset:'ocean-barrel'});
  assert.throws(()=>definition.build(ctx({asset:'missing-human-preset'})),/unknown library asset/);
 }
 for(const name of ['wave-footage','ocean-wave-media'])assert.deepEqual(resolveFootageParams(name),{...MEDIA_LIBRARY['ocean-breaker'].defaults,asset:'ocean-breaker'});
 assert.throws(()=>waveFootage.build(ctx({file:'custom.mp4'})),/choose a library asset/);
});

test('Node preparation and browser resolution agree on every subject variant',async()=>{
 const result=await build({entryPoints:[fileURLToPath(new URL('../src/acryllex/media-library.ts',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',logLevel:'silent'});
 const browser=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
 for(const {id,aliases} of subjects)for(const name of [id,...aliases]){
  const params={crop:'96:128:12:4',mirrorX:true,start:1.25,speed:0,sourceLevels:{whitePoint:.8}};
  const node=resolveFootageParams(name,params),web=browser.resolveFootageParams(name,params);
  assert.deepEqual(web,node);assert.equal(footageVariantKey(node.file,node),footageVariantKey(web.file,web));
 }
});

test('real footage builds select the preparation key and own alpha/material/UV state per instance',async()=>{
 const oldFetch=globalThis.fetch,oldLoad=THREE.TextureLoader.prototype.loadAsync,shared=[];
 globalThis.fetch=async()=>({ok:true,json:async()=>({w:2,h:1,cols:2,rows:1,fps:2,frames:2,atlases:['human-footage-fixture.png']})});
 THREE.TextureLoader.prototype.loadAsync=async()=>{const t=new THREE.DataTexture(new Uint8Array([255,255,255,0,255,255,255,255,128,128,128,100,64,64,64,200]),4,1);shared.push(t);return t;};
 const built=[];
 try{
  for(const {id,definition} of subjects){
   const params=Object.freeze({height:1.8}),resolved=resolveFootageParams(id,params),key=footageVariantKey(resolved.file,resolved);
   await preloadAssets({[key]:`human-footage-fixture-${id}.json`});
   const a=definition.build(ctx(params)),b=definition.build(ctx({...params,asset:null}));built.push(a,b);
   const am=a.root.children[0].material,bm=b.root.children[0].material,source=shared.at(-1),before=source.image.data.slice();
   assert.equal(a.grounded,false);assert.equal(a.root.children[0].geometry.type,'PlaneGeometry');
   assert.equal(am.alphaHash,true);assert.equal(am.transparent,false);assert.equal(am.toneMapped,false);
   assert.notEqual(am,bm);assert.notEqual(am.map,bm.map);assert.notEqual(am.map,source);assert.equal(am.map.image,source.image);
   const saved=bm.map.offset.toArray();a.update({},.5);assert.deepEqual(bm.map.offset.toArray(),saved);assert.notDeepEqual(am.map.offset.toArray(),saved);
   assert.deepEqual(source.image.data,before);assert.deepEqual(source.offset.toArray(),[0,0]);
   let disposed=0;source.addEventListener('dispose',()=>disposed++);am.dispose();assert.equal(disposed,0);assert.ok(bm.map);assert.equal(am.map,null);
   // The generic adapter and wrapper must select the same prepared variant, including an explicit override.
   const generic=footage.build(ctx({...params,asset:resolved.asset}));built.push(generic);
  }
  const female=resolveFootageParams('human-female-footage');
  const override=humanMaleFootage.build(ctx({asset:'human-female-motion'}));built.push(override);
  assert.equal(override.root.children[0].material.map.image,shared.at(-1).image);assert.equal(female.asset,'human-female-motion');
 }finally{
  globalThis.fetch=oldFetch;THREE.TextureLoader.prototype.loadAsync=oldLoad;
  for(const b of built)b.root.traverse(m=>{if(m.isMesh){m.material.dispose();m.geometry.dispose();}});
  for(const t of shared)t.dispose();
 }
});

test('neutral clay footage selects its own pinned source for all male aliases',()=>{
 for(const model of ['human-male-footage','human-footage','man-footage']){
  const p=resolveFootageParams(model,{asset:'human-male-clay-motion'});
  assert.equal(p.file,'library:human-male-clay-motion.mkv');assert.equal(p.alphaFile,'library:human-male-clay-motion-alpha.mkv');
  assert.equal(p.crop,'243:417:452:112');assert.equal(p.expectedSHA256,'6aa6f3bf758597e6e52dc74601bc76ef7cc9a6c8410c78c857f89a0d54cba217');
  assert.equal(p.cols,243);assert.equal(p.rows,417);assert.equal(p.sourceLevels.whitePoint,.75);
 }
});
