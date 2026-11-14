import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {preloadAssets,instance,gltf} from '../src/acryllex/assets.ts';

function ctx(){return{params:{},mat:({tone=1}={})=>{const m=new THREE.MeshStandardMaterial({color:new THREE.Color().setScalar(tone)});m.forceSinglePass=true;return m;}};}
async function fixture(id){
 const materials=['Bodymat','Hairmat','Eyelashmat','Ch17_hair','Topmat','Bottommat','Eyesmat','Shoesmat','Armchair_mat','Hair_Eyelash'].map(name=>({name,doubleSided:true,...(/^(Hairmat|Eyelashmat)$/.test(name)?{alphaMode:'BLEND'}:{})}));
 const names=['Body','Hair','Eyelashes','Mesh_2','Tops','Bottoms','Eyes','Shoes','ChairTest','EyelashCards','Named_Hair_Cards'];
 const doc={asset:{version:'2.0'},scene:0,scenes:[{nodes:names.map((_,i)=>i)}],nodes:names.map((name,mesh)=>({name,mesh})),meshes:names.map((_,i)=>({primitives:[{attributes:{POSITION:0},material:i===10?0:i}]})),materials,buffers:[{byteLength:36}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]}]};
 let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);const bin=Buffer.from(new Float32Array([0,0,0,1,0,0,0,1,0]).buffer),bytes=Buffer.alloc(28+json.length+bin.length);bytes.writeUInt32LE(0x46546c67,0);bytes.writeUInt32LE(2,4);bytes.writeUInt32LE(bytes.length,8);bytes.writeUInt32LE(json.length,12);bytes.writeUInt32LE(0x4e4f534a,16);json.copy(bytes,20);bytes.writeUInt32LE(bin.length,20+json.length);bytes.writeUInt32LE(0x004e4942,24+json.length);bin.copy(bytes,28+json.length);
 const fetch0=globalThis.fetch;globalThis.fetch=async request=>{assert.equal(request.url,'http://acx.local/a/'+id+'.glb');return{status:200,body:undefined,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};};try{await preloadAssets({[id]:id+'.glb'});}finally{globalThis.fetch=fetch0;}
 const source=gltf(id);assert(source);const hair=source.scene.getObjectByName('Hair'),map=new THREE.DataTexture(new Uint8Array([255,0,0,0,0,255,0,255]),2,1,THREE.RGBAFormat);map.flipY=false;map.offset.set(.1,.2);map.repeat.set(.5,.75);hair.material.map=map;const mixed=new THREE.Mesh(new THREE.BoxGeometry(),[source.scene.getObjectByName('Body').material,hair.material]);mixed.name='Mesh_Multi';source.scene.add(mixed);return{source,map,hair};
}
function meshState(root){const out=[];root.traverse(m=>{if(m.isMesh)out.push({name:m.name,material:(Array.isArray(m.material)?m.material:[m.material]).map(a=>({side:a.side,map:a.map,alphaHash:a.alphaHash,alphaTest:a.alphaTest,transparent:a.transparent,depthWrite:a.depthWrite,opacity:a.opacity,forceSinglePass:a.forceSinglePass,color:a.color.toArray(),key:a.customProgramCacheKey()}))});});return out;}
function sourceState(source,map){return{meshes:meshState(source.scene),data:Array.from(map.image.data),offset:map.offset.toArray(),repeat:map.repeat.toArray(),flipY:map.flipY};}
function disposeMaterials(root){const set=new Set();root.traverse(m=>{if(m.isMesh)for(const a of Array.isArray(m.material)?m.material:[m.material])set.add(a);});for(const m of set)m.dispose();}

test('sourceHairSide is opt-in, selects hair surfaces per material slot, and preserves alpha/pass/cache ownership',async()=>{
 const id='unit-source-hair-side',{source,map}=await fixture(id),before=sourceState(source,map),legacy=instance(id,ctx(),.7,true,.4,{sourceAlpha:true}),off=instance(id,ctx(),.7,true,.4,{sourceAlpha:true,sourceHairSide:false}),on=instance(id,ctx(),.7,true,.4,{sourceAlpha:true,sourceHairSide:true});
 assert.deepEqual(meshState(legacy.root),meshState(off.root));
 for(const name of ['Hair','Mesh_2','Named_Hair_Cards'])assert.equal(on.root.getObjectByName(name).material.side,THREE.DoubleSide,name);
 for(const name of ['Body','Eyelashes','Tops','Bottoms','Eyes','Shoes','ChairTest','EyelashCards'])assert.equal(on.root.getObjectByName(name).material.side,THREE.FrontSide,name);
 assert.deepEqual(on.root.getObjectByName('Mesh_Multi').material.map(m=>m.side),[THREE.FrontSide,THREE.DoubleSide]);
 for(const a of meshState(on.root)){const old=meshState(off.root).find(m=>m.name===a.name);for(let i=0;i<a.material.length;i++){const{side,...rest}=a.material[i],{side:oldSide,...oldRest}=old.material[i];assert.deepEqual(rest,oldRest,a.name+' properties beyond sidedness');}}
 const hair=on.root.getObjectByName('Hair');assert.equal(hair.material.map,map);assert.equal(hair.material.forceSinglePass,false,'sourceAlpha preserves the source pass policy before the side opt-in');assert.equal(hair.geometry,source.scene.getObjectByName('Hair').geometry);assert.notEqual(hair.material,source.scene.getObjectByName('Hair').material);
 const shader={fragmentShader:'#include <map_fragment>'};hair.material.onBeforeCompile(shader,null);assert.match(shader.fragmentShader,/diffuseColor\.a\*=texture2D\(map,vMapUv\)\.a/);assert.doesNotMatch(shader.fragmentShader,/diffuseColor\.rgb\s*\*=/);
 let disposed=0;map.addEventListener('dispose',()=>disposed++);for(const inst of[legacy,off,on])disposeMaterials(inst.root);assert.equal(disposed,0);assert.deepEqual(sourceState(source,map),before);map.dispose();assert.equal(disposed,1);
});

test('authored hair side is copied exactly and remains independent of sourceAlpha',async()=>{
 const id='unit-source-hair-side-independent',{source,hair,map}=await fixture(id);hair.material.side=THREE.BackSide;const before=sourceState(source,map),legacy=instance(id,ctx(),.7,true,.4),on=instance(id,ctx(),.7,true,.4,{sourceHairSide:true});
 assert.equal(on.root.getObjectByName('Hair').material.side,THREE.BackSide,'copy the source enum, not a hardcoded DoubleSide');assert.equal(on.root.getObjectByName('Hair').material.map,null,'side does not enable source alpha or RGB');assert.equal(on.root.getObjectByName('Hair').material.transparent,false);assert.equal(on.root.getObjectByName('Hair').material.forceSinglePass,true,'retain the converted material pass flag');assert.equal(on.root.getObjectByName('Body').material.side,legacy.root.getObjectByName('Body').material.side);assert.deepEqual(sourceState(source,map),before);disposeMaterials(legacy.root);disposeMaterials(on.root);map.dispose();
});
