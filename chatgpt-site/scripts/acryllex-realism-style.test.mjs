import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {applyStyleProfile,RECORDING_LOOK,RECORDING_PITCH} from '../src/acryllex/style-profile.ts';
import {preloadAssets,gltf,plainMaterial,importedMesh} from '../src/acryllex/assets.ts';
import {riggedHand} from '../src/acryllex/models/rigged-hand.ts';
import {portrait} from '../src/acryllex/models/portrait.ts';
import {retainSourceTriangles} from '../src/acryllex/models/source-region.ts';
import {rigidSkin} from '../src/acryllex/models/rigid-skin.ts';
import {headSource,HEAD_SCAN} from '../src/acryllex/head-source.ts';
import {assetsForSpec,ASSET_DIR} from './acryllex/assets.mjs';
import {legacyDiffusePlugin} from '../src/acryllex/legacy-gltf.ts';

function ctx(params={}){
 const mat=(o={})=>new THREE.MeshStandardMaterial({color:new THREE.Color().setScalar(o.tone??1),roughness:o.rough??.62});
 return {params,mat,mesh:(g,o)=>new THREE.Mesh(g,mat(o)),color:()=>new THREE.Color(1,1,1),seed:7,
  num:(k,f,lo=-Infinity,hi=Infinity)=>Number.isFinite(params[k])?Math.max(lo,Math.min(hi,params[k])):f,
  str:(k,f,allowed)=>typeof params[k]==='string'&&(!allowed||allowed.includes(params[k]))?params[k]:f,
  bool:(k,f)=>typeof params[k]==='boolean'?params[k]:f};
}
function positions(root){
 root.updateMatrixWorld(true);const out=[];
 root.traverse(o=>{if(!o.isMesh)return;for(let i=0;i<o.geometry.attributes.position.count;i++)out.push(...o.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(o.matrixWorld).toArray());});return out;
}
async function install(map){
 const old=GLTFLoader.prototype.loadAsync;GLTFLoader.prototype.loadAsync=async url=>{const result=map[url.split('/a/')[1]];assert.ok(result,url);return result;};
 try{await preloadAssets(Object.fromEntries(Object.keys(map).map(k=>[k,k])));}finally{GLTFLoader.prototype.loadAsync=old;}
}

test('recording profile is immutable, idempotent and locks dot optics/lighting across every scene',()=>{
 const s={version:1,series:'ACRYLLEX',title:'Style',style:'reference-recording',format:{width:1164,height:670,cell:20},look:{inkMode:'shaded',palette:{blue:'#47a6ff'},ink:4,gap:3,noiseReference:.01},scenes:[{say:'A face',duration:2,hue:'red',camera:{angle:'side'},light:{key:5,contrast:9,points:[{pos:[0,1,2],intensity:.2}]},raster:{cell:12,dotRoundness:0},objects:[{id:'face',model:'head-mesh',controls:{yaw:10}}],events:[{at:.5,target:'face',set:{yaw:20}}]}]};
 const before=structuredClone(s),r=applyStyleProfile(s);assert.deepEqual(s,before);assert.deepEqual(applyStyleProfile(r),r);
 assert.equal(r.format.cell,3.72);assert.equal(r.look.palette.blue,RECORDING_LOOK.palette.blue);assert.equal(r.look.ink,1);assert.equal(r.look.gap,0);assert.equal(r.look.noiseReference,undefined);
 assert.equal(r.scenes[0].light.contrast,.8);assert.equal(r.scenes[0].light.softness,.95);assert.equal(r.scenes[0].raster.cell,3.72);assert.equal(r.scenes[0].raster.dotRoundness,1);
 assert.equal(r.scenes[0].raster.activity,.06);assert.equal(r.scenes[0].raster.activityRate,12);
 const still=applyStyleProfile({...s,scenes:[{...s.scenes[0],raster:{activity:0,activityRate:24}}]});assert.equal(still.scenes[0].raster.activity,0);assert.equal(still.scenes[0].raster.activityRate,24);
 for(const k of ['hue','camera','objects','events'])assert.deepEqual(r.scenes[0][k],s.scenes[0][k]);assert.deepEqual(r.scenes[0].light.points,s.scenes[0].light.points);
 const legacy={...s,style:undefined};assert.equal(applyStyleProfile(legacy),legacy);
 const small=applyStyleProfile({...s,format:{width:582,height:335}});assert.equal(small.format.cell,582*RECORDING_PITCH);assert.equal(small.scenes[0].light.softness,.475);
});

test('neutral materials preserve source relief and alpha without photographic colour or baked lighting',()=>{
 const s=new THREE.MeshStandardMaterial({map:new THREE.Texture(),normalMap:new THREE.Texture(),bumpMap:new THREE.Texture(),transparent:true,opacity:.7});s.normalScale.set(.3,.6);s.bumpScale=.04;
 const m=plainMaterial(s,ctx(),.72,true);assert.equal(m.map,s.map);assert.equal(m.normalMap,s.normalMap);assert.deepEqual(m.normalScale.toArray(),[.3,.6]);assert.notEqual(m.normalScale,s.normalScale);assert.equal(m.bumpMap,s.bumpMap);assert.equal(m.bumpScale,.04);
 const shader={fragmentShader:'#include <map_fragment>'};m.onBeforeCompile(shader,{});assert.match(shader.fragmentShader,/diffuseColor.a\*=/);assert.doesNotMatch(shader.fragmentShader,/diffuseColor.rgb/);
 assert.equal(m.roughness,.62);assert.equal(m.opacity,.7);assert.equal(s.map.colorSpace,THREE.NoColorSpace);m.dispose();s.dispose();
});

test('source extraction retains complete authored triangles, skin/morph data and material groups without mutating cache',()=>{
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([0,2,0,1,2,0,0,3,0,0,0,0,1,0,0,0,1,0],3));g.setIndex([0,1,2,3,4,5]);
 g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Uint16Array(24),4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(Array.from({length:24},(_,i)=>i%4===0?1:0),4));
 g.morphTargetsRelative=true;g.morphAttributes.position=[new THREE.Float32BufferAttribute(new Float32Array(18).fill(.1),3)];g.addGroup(0,3,1);g.addGroup(3,3,0);
 const root=new THREE.Group(),m=new THREE.Mesh(g,[new THREE.MeshBasicMaterial(),new THREE.MeshBasicMaterial()]);root.position.set(10,20,30);root.add(m);
 const before=Array.from(g.attributes.position.array);assert.equal(retainSourceTriangles(root,p=>p.y>=2),1);assert.deepEqual(Array.from(g.attributes.position.array),before);assert.equal(g.index.count,6);
 assert.notEqual(m.geometry,g);assert.equal(m.geometry.attributes.position.count,3);assert.equal(m.geometry.attributes.skinIndex.array.constructor,Uint16Array);assert.equal(m.geometry.attributes.skinWeight.count,3);assert.equal(m.geometry.morphAttributes.position[0].count,3);assert.equal(m.geometry.morphTargetsRelative,true);assert.deepEqual(m.geometry.groups,[{start:0,count:3,materialIndex:1}]);
 assert.throws(()=>retainSourceTriangles(root,()=>false),/no triangles/);
});

test('bundled source hands retain bind shape, support each finger independently, and reproduce reverse poses',async()=>{
 const loaded={};for(const side of ['left','right']){const b=await readFile(new URL('../src/acryllex/assets/hands/'+side+'.glb',import.meta.url));loaded['hand-mesh:'+side]=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');}
 const bytes=await readFile(new URL('../src/acryllex/assets/hands/anatomical-right.glb',import.meta.url));loaded['hand-mesh:anatomical']=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 await install(loaded);
 for(const kind of ['xr','anatomical'])for(const side of ['left','right']){
  const source=gltf('hand-mesh:'+(kind==='anatomical'?'anatomical':side)),before=positions(source.scene),hand=riggedHand.build(ctx({side,source:kind,rest:'source'}));hand.update({},0);const open=positions(hand.root);
  assert.equal(open.length,before.length);assert.ok(open.every(Number.isFinite));
  const box=new THREE.Box3().setFromObject(hand.root,true);assert.ok(Math.abs(box.max.y-box.min.y-.21)<1e-6);
  // A canonical reorientation/scale preserves source distances, rather than rebuilding anatomy.
  const distance=(a,i,j)=>new THREE.Vector3(...a.slice(i*3,i*3+3)).distanceTo(new THREE.Vector3(...a.slice(j*3,j*3+3)));
  const ratio=distance(open,1,30)/distance(before,1,30);for(const [i,j]of [[4,80],[10,500],[50,1100]])assert.ok(Math.abs(distance(open,i,j)/distance(before,i,j)-ratio)<1e-4);
  hand.update({index:.7},1);const curled=positions(hand.root);assert.notDeepEqual(curled,open);hand.update({},3);assert.deepEqual(positions(hand.root),open);hand.update({index:.7},.1);assert.deepEqual(positions(hand.root),curled);
  if(kind==='anatomical'){
   hand.update({},0);hand.root.updateMatrixWorld(true);const joint=hand.root.getObjectByName('index_03_r'),before=joint.getWorldPosition(new THREE.Vector3());hand.update({index:.4},0);hand.root.updateMatrixWorld(true);assert.ok(joint.getWorldPosition(new THREE.Vector3()).z>before.z+.01,'Finger must flex toward the palmar front, rather than hyperextending backwards');
  }
  hand.update({},99);assert.deepEqual(positions(hand.root),open);assert.deepEqual(positions(source.scene),before);assert.throws(()=>hand.update({curl:NaN},0),/finite/);
 }
});

test('whole-head source selection excludes raised/outstretched arms and rigid turns do not modify cached anatomy',async()=>{
 const root=new THREE.Group(),material=new THREE.MeshStandardMaterial();const head=new THREE.Mesh(new THREE.SphereGeometry(.1,16,12),material);head.position.y=1.7;root.add(head);
 const torso=new THREE.Mesh(new THREE.BoxGeometry(.4,1.4,.2),material);torso.position.y=.7;root.add(torso);for(const x of [-.4,.4]){const arm=new THREE.Mesh(new THREE.BoxGeometry(.4,.15,.15),material);arm.position.set(x,1.5,0);root.add(arm);}
 await install({'human-megan':{scene:root,animations:[]}});const before=positions(root),p=portrait.build(ctx({body:'megan'}));p.update({},0);const first=positions(p.root),b=new THREE.Box3().setFromObject(p.root,true);
 assert.ok(b.max.x-b.min.x<.5);assert.ok(Math.abs(b.max.y-b.min.y-.42)<1e-5);p.update({yaw:40,pitch:10},1);assert.notDeepEqual(positions(p.root),first);p.update({},5);assert.deepEqual(positions(p.root),first);assert.deepEqual(positions(root),before);
});

test('relaxed hand groups the finger fan while preserving bone lengths and exact source-rest access',()=>{
 const b=riggedHand.build(ctx()),nodes=()=>{b.root.updateMatrixWorld(true);const result=new Map();b.root.traverse(o=>{if(o.isBone)result.set(o.name,o.getWorldPosition(new THREE.Vector3()));});return result;};
 b.update({spread:1},0);const wide=nodes();b.update({spread:0},0);const narrow=nodes();
 const fan=m=>['index','middle','ring','pinky'].map(f=>{const v=m.get(f+'_03_r').clone().sub(m.get(f+'_01_r'));return Math.atan2(v.x,v.y);});
 const range=v=>Math.max(...v)-Math.min(...v);assert.ok(range(fan(narrow))<range(fan(wide))*.75,'Relaxed fingers should group instead of retaining the source splay');
 assert.ok(Math.abs(fan(narrow)[1])<.1,'The central finger should align with the hand rather than leaning sideways');
 for(const f of ['index','middle','ring','pinky','thumb'])for(const [a,z]of [[1,2],[2,3]])assert.ok(Math.abs(wide.get(`${f}_0${a}_r`).distanceTo(wide.get(`${f}_0${z}_r`))-narrow.get(`${f}_0${a}_r`).distanceTo(narrow.get(`${f}_0${z}_r`)))<1e-7,`${f} ${a}-${z} bone length drift: ${wide.get(`${f}_0${a}_r`).distanceTo(wide.get(`${f}_0${z}_r`))} vs ${narrow.get(`${f}_0${a}_r`).distanceTo(narrow.get(`${f}_0${z}_r`))}`);
 b.update({spread:1},2);const restored=nodes();for(const [name,p]of wide)assert.ok(restored.get(name).distanceTo(p)<1e-10);assert.throws(()=>b.update({spread:NaN},0),/finite/);
});

test('rig normalization bakes mirrored unequal scales without changing rest shape, morphs, winding or attached geometry',()=>{
 const source=new THREE.Group(),rig=new THREE.Group();rig.scale.set(-.8,1.1,1.4);source.add(rig);
 const wrist=new THREE.Bone(),finger=new THREE.Bone();wrist.name='wrist';finger.name='finger';finger.position.y=.12;wrist.add(finger);rig.add(wrist);
 const geometry=new THREE.BoxGeometry(.08,.2,.03),n=geometry.attributes.position.count;
 geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(Array.from({length:n*4},(_,i)=>i%4===0?1:0),4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(Array.from({length:n*4},(_,i)=>i%4===0?1:0),4));
 geometry.morphTargetsRelative=true;geometry.morphAttributes.position=[new THREE.Float32BufferAttribute(Array.from({length:n*3},(_,i)=>i%3===0?.01:0),3)];
 const skin=new THREE.SkinnedMesh(geometry,new THREE.MeshStandardMaterial());skin.name='skin';rig.add(skin);source.updateMatrixWorld(true);skin.bind(new THREE.Skeleton([wrist,finger]));skin.updateMorphTargets();
 const nail=new THREE.Mesh(new THREE.BoxGeometry(.01,.01,.002),new THREE.MeshStandardMaterial());nail.name='nail';nail.position.set(.01,.02,.02);finger.add(nail);source.updateMatrixWorld(true);
 const original=positions(source),baked=rigidSkin(source),rest=positions(baked);assert.equal(rest.length,original.length);rest.forEach((x,i)=>assert.ok(Math.abs(x-original[i])<1e-6));assert.deepEqual(positions(source),original);
 const g=baked.getObjectByName('skin').geometry,idx=g.index,p=g.attributes.position,a=new THREE.Vector3().fromBufferAttribute(p,idx.getX(0)),b=new THREE.Vector3().fromBufferAttribute(p,idx.getX(1)),c=new THREE.Vector3().fromBufferAttribute(p,idx.getX(2)),normal=new THREE.Vector3().fromBufferAttribute(g.attributes.normal,idx.getX(0));assert.ok(b.sub(a).cross(c.sub(a)).dot(normal)>0,'Mirrored bake must preserve outward front faces');
 const skin2=baked.getObjectByName('skin');skin.morphTargetInfluences[0]=.6;skin2.morphTargetInfluences[0]=.6;const target=positions(source),actual=positions(baked);actual.forEach((x,i)=>assert.ok(Math.abs(x-target[i])<1e-6));skin.morphTargetInfluences[0]=skin2.morphTargetInfluences[0]=0;
 const parent=baked.getObjectByName('wrist'),child=baked.getObjectByName('finger');baked.updateMatrixWorld(true);const length=parent.getWorldPosition(new THREE.Vector3()).distanceTo(child.getWorldPosition(new THREE.Vector3())),firstNail=baked.getObjectByName('nail').getWorldPosition(new THREE.Vector3());parent.rotation.x+=1;baked.updateMatrixWorld(true);assert.ok(Math.abs(parent.getWorldPosition(new THREE.Vector3()).distanceTo(child.getWorldPosition(new THREE.Vector3()))-length)<1e-10);assert.ok(baked.getObjectByName('nail').getWorldPosition(new THREE.Vector3()).distanceTo(firstNail)>.01);
 skin.morphTargetInfluences[0]=.5;assert.throws(()=>rigidSkin(source),/inactive morphs/);
});

test('imported face rigs synchronize source clips and morphs, hold final poses and seek deterministically',async()=>{
 const scene=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());mesh.name='face';mesh.geometry.morphAttributes.position=[mesh.geometry.attributes.position.clone()];mesh.updateMorphTargets();mesh.morphTargetDictionary={'face.smile':0};scene.add(mesh);
 const clips=[new THREE.AnimationClip('expression',1,[new THREE.NumberKeyframeTrack('face.morphTargetInfluences[0]',[0,1],[0,1])]),new THREE.AnimationClip('head',1,[new THREE.VectorKeyframeTrack('face.position',[0,1],[0,0,0,0,1,0])])];
 await install({'mesh:rigged-face-fixture.glb':{scene,animations:clips}});const b=importedMesh.build(ctx({file:'rigged-face-fixture.glb',clips:'all'})),find=()=>b.root.getObjectByName('face');
 b.update({},.5);assert.equal(find().morphTargetInfluences[0],.5);assert.equal(find().position.y,.5);b.update({},5);assert.equal(find().morphTargetInfluences[0],1);assert.equal(find().position.y,1);
 b.update({},.5);assert.equal(find().morphTargetInfluences[0],.5);assert.equal(find().position.y,.5);b.update({'morph:smile':.2},.5);assert.equal(find().morphTargetInfluences[0],.2);assert.equal(mesh.morphTargetInfluences[0],0);
 assert.throws(()=>b.update({'morph:invented':1},0),/missing/);assert.throws(()=>importedMesh.build(ctx({file:'rigged-face-fixture.glb',clip:'invented'})),/missing/);
});

test('static and partially animated face morphs reset omitted overrides to authored values',async()=>{
 const scene=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());mesh.name='face';mesh.geometry.morphAttributes.position=[mesh.geometry.attributes.position.clone(),mesh.geometry.attributes.position.clone()];mesh.updateMorphTargets();mesh.morphTargetDictionary={smile:0,blink:1};mesh.morphTargetInfluences[0]=.15;scene.add(mesh);
 const clip=new THREE.AnimationClip('blink',1,[new THREE.NumberKeyframeTrack('face.morphTargetInfluences[1]',[0,1],[0,1])]);
 for(const animations of [[],[clip]]){
  const file=animations.length?'partial-face.glb':'static-face.glb';await install({['mesh:'+file]:{scene,animations}});const b=importedMesh.build(ctx({file})),face=b.root.getObjectByName('face');
  b.update({'morph:smile':.9,'morph:blink':.8},.2);assert.deepEqual(face.morphTargetInfluences,[.9,.8]);
  b.update({},.4);assert.equal(face.morphTargetInfluences[0],.15);assert.equal(face.morphTargetInfluences[1],animations.length?.4:0);
  b.update({'morph:smile':.9,'morph:blink':.8},.2);assert.deepEqual(face.morphTargetInfluences,[.9,.8]);assert.deepEqual(mesh.morphTargetInfluences,[.15,0]);assert.throws(()=>b.update({'morph:blink':NaN},0),/finite/);
 }
});

test('licensed default head scan preserves source anatomy, surface relief and deterministic rigid turns',async()=>{
 const directory=new URL('../src/acryllex/assets/heads/lee-perry-smith/',import.meta.url),provenance=JSON.parse(await readFile(new URL('provenance.json',directory),'utf8'));
 const sha=b=>createHash('sha256').update(b).digest('hex');
 for(const [file,hash]of Object.entries(provenance.sourceFiles))assert.equal(sha(await readFile(new URL(file,directory))),hash,file);
 const packed=await readFile(new URL('head.glb',directory));assert.equal(sha(packed),provenance.outputSHA256);
 const parse=async file=>{
  const b=await readFile(new URL(file,directory));
  // CPU geometry test: the real image upload and map convention are checked by the GPU verifier.
  const loader=new GLTFLoader();loader.register(()=>({name:'test-texture-decoding',loadTexture:async()=>new THREE.Texture()}));
  return loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
 };
 const original=await parse('LeePerrySmith.glb'),scan=await parse('head.glb');
 const sourcePoints=positions(original.scene),packedPoints=positions(scan.scene);assert.equal(packedPoints.length,9279*3);assert.equal(sourcePoints.length,packedPoints.length);
 const maximumError=Math.max(...sourcePoints.map((p,i)=>Math.abs(p-packedPoints[i])));assert.ok(maximumError<1e-6,maximumError);
 let sourceMesh,packedMesh;original.scene.traverse(o=>{if(o.isMesh)sourceMesh=o;});scan.scene.traverse(o=>{if(o.isMesh)packedMesh=o;});
 for(const attribute of ['position','normal','uv'])assert.deepEqual(packedMesh.geometry.attributes[attribute].array,sourceMesh.geometry.attributes[attribute].array,attribute);
 assert.deepEqual(packedMesh.geometry.index.array,sourceMesh.geometry.index.array);assert.equal(packedMesh.geometry.index.count,53052);
 assert.ok(packedMesh.material.normalMap);assert.equal(packedMesh.material.normalScale.y,-1,'Loader must restore the no-tangent normal-map convention');
 await install({[HEAD_SCAN.key]:scan});const before=positions(scan.scene),head=portrait.build(ctx()),neutral=positions(head.root),box=new THREE.Box3().setFromObject(head.root,true);
 assert.ok(Math.abs(box.max.y-box.min.y-.42)<1e-6);assert.equal(neutral.length,before.length,'Scan must retain the complete source head/neck/shoulders');
 let converted;head.root.traverse(o=>{if(o.isMesh)converted=o.material;});assert.equal(converted.map,null);assert.equal(converted.normalMap,packedMesh.material.normalMap);assert.deepEqual(converted.normalScale.toArray(),[1,-1]);
 head.update({yaw:65,pitch:-12},2);const turned=positions(head.root);assert.notDeepEqual(turned,neutral);
 const distances=a=>[0,50,1200,3500].map(i=>new THREE.Vector3(...a.slice(i*3,i*3+3)).distanceTo(new THREE.Vector3(...a.slice(6000*3,6000*3+3))));
 distances(neutral).forEach((v,i)=>assert.ok(Math.abs(v-distances(turned)[i])<1e-10));
 head.update({},5);assert.deepEqual(positions(head.root),neutral);head.update({yaw:65,pitch:-12},.1);assert.deepEqual(positions(head.root),turned);assert.deepEqual(positions(scan.scene),before);
 assert.throws(()=>head.update({yaw:NaN},0),/finite/);assert.equal(scan.animations.length,0);assert.equal(packedMesh.geometry.morphAttributes.position,undefined);
});

test('head source preparation agrees with the runtime for aliases and explicit legacy body selection',async()=>{
 assert.equal(headSource().kind,'scan');assert.equal(headSource({body:'megan'}).key,'human-megan');assert.equal(headSource({source:'body'}).key,'human-megan');
 assert.throws(()=>headSource({source:'invented'}),/source must/);assert.throws(()=>headSource({body:'invented'}),/unknown source body/);
 for(const model of ['head-mesh','portrait','face-mesh','human-face','human-head']){
  const assets=await assetsForSpec({scenes:[{objects:[{model}]}]});assert.equal(assets[HEAD_SCAN.key],HEAD_SCAN.file);
  assert.equal(createHash('sha256').update(await readFile(ASSET_DIR+'/'+assets[HEAD_SCAN.key])).digest('hex'),JSON.parse(await readFile(new URL('../src/acryllex/assets/heads/lee-perry-smith/provenance.json',import.meta.url),'utf8')).outputSHA256);
 }
});

test('direct Objaverse runtime imports use the exact prepared source and preserve source cutout coverage',async()=>{
 const uid='0123456789abcdef0123456789abcdef',scene=new THREE.Group(),map=new THREE.Texture(),material=new THREE.MeshStandardMaterial({map,alphaTest:.4,side:THREE.DoubleSide,opacity:.8}),mesh=new THREE.Mesh(new THREE.PlaneGeometry(),material);mesh.name='Hair';scene.add(mesh);
 await install({['mesh:objaverse:'+uid]:{scene,animations:[]}});
 const b=importedMesh.build(ctx({objaverse:uid.toUpperCase()})),converted=b.root.getObjectByName('Hair').material;assert.equal(converted.map,map);assert.equal(converted.alphaTest,.4);assert.equal(converted.opacity,.8);assert.equal(converted.side,THREE.DoubleSide);
 const shader={fragmentShader:'#include <map_fragment>'};converted.onBeforeCompile(shader,{});assert.match(shader.fragmentShader,/diffuseColor.a\*=texture2D\(map,vMapUv\).a/);assert.doesNotMatch(shader.fragmentShader,/diffuseColor.rgb/);
 const optout=importedMesh.build(ctx({objaverse:uid,sourceAlpha:false,sourceHairSide:false})).root.getObjectByName('Hair').material;assert.equal(optout.map,null);assert.equal(optout.alphaTest,0);assert.equal(optout.side,THREE.FrontSide);
 assert.equal(material.opacity,.8);assert.equal(material.map,map);assert.throws(()=>importedMesh.build(ctx({objaverse:uid,file:'other.glb'})),/select one source/);
});

test('legacy specular/gloss assets keep their actual diffuse alpha/UVs and normal relief for neutral shading',async()=>{
 const data=Buffer.from(new Float32Array([0,0,0,1,0,0,0,1,0]).buffer),extension='KHR_materials_pbrSpecularGlossiness';
 const document={asset:{version:'2.0'},extensionsUsed:[extension],buffers:[{uri:'data:application/octet-stream;base64,'+data.toString('base64'),byteLength:data.length}],bufferViews:[{buffer:0,byteLength:data.length}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]}],materials:[{name:'Hair',alphaMode:'MASK',alphaCutoff:.3,doubleSided:true,extensions:{[extension]:{diffuseFactor:[.1,.2,.3,.7],diffuseTexture:{index:0},glossinessFactor:.25}},normalTexture:{index:1}}],textures:[{source:0},{source:1}],images:[{},{}],meshes:[{primitives:[{attributes:{POSITION:0},material:0}]}],nodes:[{mesh:0}],scenes:[{nodes:[0]}],scene:0};
 const original=JSON.stringify(document),loader=new GLTFLoader().register(legacyDiffusePlugin);loader.register(()=>({name:'fixture-textures',loadTexture:async()=>new THREE.Texture()}));
 const saved=globalThis.ProgressEvent;globalThis.ProgressEvent??=class extends Event{constructor(type,init){super(type);Object.assign(this,init);}};
 let loaded;try{loaded=await loader.parseAsync(original,'');}finally{if(saved===undefined)delete globalThis.ProgressEvent;else globalThis.ProgressEvent=saved;}
 const source=loaded.scene.children[0].material;assert.deepEqual(source.color.toArray(),[.1,.2,.3]);assert.equal(source.opacity,.7);assert.equal(source.alphaTest,.3);assert.equal(source.side,THREE.DoubleSide);assert.equal(source.map.colorSpace,THREE.SRGBColorSpace);assert.equal(source.normalScale.y,-1);assert.match(source.userData.acryllexMaterialConversion,/not preserved/);
 const neutral=plainMaterial(source,ctx(),.72,true);assert.equal(neutral.map,source.map);assert.equal(neutral.normalMap,source.normalMap);assert.equal(neutral.opacity,.7);assert.equal(neutral.roughness,.62);assert.equal(JSON.stringify(document),original);
});

test('source orientation precedes physical sizing and preserves authored root transforms and cached geometry',async()=>{
 const scene=new THREE.Group();scene.position.set(.05,.02,-.04);scene.rotation.y=.35;scene.scale.setScalar(1.2);scene.add(new THREE.Mesh(new THREE.BoxGeometry(.1,.2,.03),new THREE.MeshStandardMaterial()));
 const before=positions(scene);await install({'mesh:source-axis-fixture.glb':{scene,animations:[]}});
 const params={file:'source-axis-fixture.glb',sourceRotation:[0,0,25],up:'z',height:.21},built=importedMesh.build(ctx(params));built.update({},0);
 const rotation=new THREE.Matrix4().makeRotationZ(25*Math.PI/180).multiply(new THREE.Matrix4().makeRotationX(-Math.PI/2)),expected=[];
 for(let i=0;i<before.length;i+=3)expected.push(new THREE.Vector3(...before.slice(i,i+3)).applyMatrix4(rotation));
 const box=new THREE.Box3().setFromPoints(expected),scale=.21/(box.max.y-box.min.y),actual=positions(built.root);for(let i=0;i<expected.length;i++)expected[i].multiplyScalar(scale).toArray().forEach((v,c)=>assert.ok(Math.abs(v-actual[i*3+c])<1e-7));
 assert.ok(Math.abs(new THREE.Box3().setFromObject(built.root,true).getSize(new THREE.Vector3()).y-.21)<1e-7);assert.deepEqual(positions(scene),before);
 for(const sourceRotation of [null,[1,2],[0,NaN,0],['90',0,0]])assert.throws(()=>importedMesh.build(ctx({file:'source-axis-fixture.glb',sourceRotation})),/three finite degrees/);
});
