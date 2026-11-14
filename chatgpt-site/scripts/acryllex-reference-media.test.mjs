import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {referenceKind,referenceDefaults,referenceProblems} from '../src/acryllex/reference-media.ts';
import {MEDIA_LIBRARY,isFootageModel,resolveFootageParams} from '../src/acryllex/media-library.ts';
import {footageVariantKey,backgroundKey} from '../src/acryllex/media-key.ts';
import {referenceImage,referenceVideo,preloadAssets} from '../src/acryllex/assets.ts';
import {loadCatalog} from './acryllex/catalog.mjs';
import {specProblems} from '../src/acryllex/schema.ts';

test('arbitrary photographs and recorded subjects resolve sharp source detail without changing raster style',()=>{
 for(const model of ['reference-image','photo','photograph','image','reference-photo','reference-video','reference-footage','recorded-subject']){
  const params=Object.freeze({file:'arbitrary-subject.png',height:2}),p=resolveFootageParams(model,params);
  assert.ok(isFootageModel(model));assert.ok(referenceKind(model));
  assert.equal(p.blur,0);assert.equal(p.sampleScale,3);assert.equal(p.preserveAspect,true);assert.equal(p.monochrome,true);assert.equal(p.height,2);assert.equal(p.sourceTransfer,'srgb');
  assert.equal(params.blur,undefined);assert.equal(p.cell,undefined);assert.equal(p.contrast,undefined);assert.equal(p.light,undefined);
 }
 assert.throws(()=>referenceDefaults({preserveAspect:false}),/preserve source proportions/);
});

test('photographed reference library pins actual source pixels and attribution',async()=>{
 for(const id of ['reference-hand-palm','reference-face-portrait','reference-metal-spoon','reference-water-glass']){
  const entry=MEDIA_LIBRARY[id],p=resolveFootageParams('reference-image',{asset:id});
  const bytes=await readFile(new URL('../src/acryllex/assets/media/'+p.file.slice(8),import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),p.expectedSHA256);
  assert.match(entry.capture,/Photographed/);assert.match(entry.license,/creativecommons.org\/licenses/);assert.ok(entry.creator);assert.ok(entry.limitations);
 }
 const catalog=await loadCatalog();for(const id of ['reference-image','reference-video','photo','water-glass','optical-ray'])assert.ok(catalog.has(id),id);
 assert.match(catalog.text,/reference-hand-palm/);
});

test('flat sources reject invented articulation, deformation and unseen viewpoints before rendering',()=>{
 const obj={id:'hand',model:'photo',params:{file:'hand.png'},idle:'none'},scene={say:'hand',objects:[obj],camera:{angle:'front',move:'push'}};
 assert.deepEqual(referenceProblems(scene),[]);
 for(const extra of [{pose:'grip'},{idle:'turn'},{rot:[0,20,0]},{stretch:[1,2,1]},{controls:{curl:1}},{keyframes:[{at:1,rot:[20,0,0]}]},{params:{preserveAspect:false}}])assert.ok(referenceProblems({...scene,objects:[{...obj,...extra}]}).length,JSON.stringify(extra));
 for(const camera of [{angle:'side'},{move:'orbit'},{move:'drift'}])assert.ok(referenceProblems({...scene,camera}).length);
 for(const event of [{pose:'grip'},{turn:[0,90,0]},{set:{curl:1}},{fx:'heartbeat'},{morph:'other'}])assert.ok(referenceProblems({...scene,events:[{target:'hand',...event}]}).length);
 assert.deepEqual(referenceProblems({...scene,objects:[{...obj,rot:[0,0,90],controls:{speed:1}}]}),[]);
 const spec={scenes:[{...scene,objects:[{...obj,pose:'grip'}]}]};assert.ok(specProblems(spec).some(p=>p.includes('poses require')));
});

test('explicit uniform backdrop extraction validates and participates in preparation identity',()=>{
 assert.deepEqual(backgroundKey({color:'#FFFFFF'}),{color:'#ffffff',similarity:.03,blend:.01});
 const p={backgroundKey:{color:'#ffffff',similarity:.03,blend:.01}};
 assert.notEqual(footageVariantKey('p.png',p),footageVariantKey('p.png',{}));
 assert.equal(footageVariantKey('p.png',p),footageVariantKey('p.png',{...p,start:4,loop:true}));
 for(const v of [null,'white',{color:'white'},{color:'#ffffff',similarity:0},{color:'#ffffff',blend:Infinity},{color:'#ffffff',filter:'x'}])assert.throws(()=>backgroundKey(v));
});

test('reference playback preserves independent UV/material state and reverse-seeks exact source frames',async()=>{
 const oldFetch=globalThis.fetch,oldLoad=THREE.TextureLoader.prototype.loadAsync;
 globalThis.fetch=async()=>({ok:true,json:async()=>({w:6,h:4,cols:2,rows:1,fps:2,frames:2,atlases:['reference-fixture.png']})});
 const source=new THREE.DataTexture(new Uint8Array(12*4*4),12,4);
 THREE.TextureLoader.prototype.loadAsync=async()=>source;
 const params={file:'arbitrary-contact.mp4',height:2},resolved=resolveFootageParams('reference-video',params),ctx=p=>({params:p,num:(k,f)=>p[k]??f,bool:(k,f)=>p[k]??f});
 const built=[];
 try{
  await preloadAssets({[footageVariantKey(params.file,resolved)]:'reference-fixture.json'});
  const a=referenceVideo.build(ctx(params)),b=referenceVideo.build(ctx(params));built.push(a,b);
  const am=a.root.children[0].material,bm=b.root.children[0].material;
  assert.equal(am.map.colorSpace,THREE.SRGBColorSpace);assert.equal(source.colorSpace,THREE.NoColorSpace);
  assert.notEqual(am.map,bm.map);assert.equal(a.root.children[0].geometry.parameters.width,3);
  const first=am.map.offset.toArray();a.update({},.5);assert.notDeepEqual(am.map.offset.toArray(),first);assert.deepEqual(bm.map.offset.toArray(),first);
  a.update({},0);assert.deepEqual(am.map.offset.toArray(),first);assert.deepEqual(source.offset.toArray(),[0,0]);
  assert.throws(()=>referenceImage.build(ctx({file:'missing.png'})),/not preloaded/);
 }finally{globalThis.fetch=oldFetch;THREE.TextureLoader.prototype.loadAsync=oldLoad;for(const b of built)b.root.traverse(o=>{if(o.isMesh){o.material.dispose();o.geometry.dispose();}});source.dispose();}
});
