import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {headAccentLight,parseHeadAccentLight} from '../src/acryllex/models/human-head-accent-light.ts';

const config={position:[0,2,1],target:[0,1,0],intensity:1};
function fixture(){
 const root=new THREE.Group(),head=new THREE.Bone(),neck=new THREE.Bone(),arm=new THREE.Bone();
 head.name='mixamorig:Head';neck.name='Neck1';arm.name='LeftArm';root.add(head,neck,arm);
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0,1,1,0],3));
 geometry.setAttribute('normal',new THREE.Float32BufferAttribute([0,0,1,0,0,1,0,0,1,0,0,1],3));
 geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute([0,1,2,2,2,0,1,2,0,2,1,2,1,2,0,2],4));
 geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute([.75,.25,0,0,1,0,0,0,.2,.8,0,0,.5,.5,0,0],4));
 geometry.morphAttributes.position=[new THREE.Float32BufferAttribute([.01,0,0,.01,0,0,.01,0,0,.01,0,0],3)];
 geometry.morphTargetsRelative=true;geometry.setIndex([0,1,2,1,3,2]);
 const material=new THREE.MeshStandardMaterial({color:0x382ef5,roughness:.55,transparent:true,opacity:.7,depthWrite:false});
 const mesh=new THREE.SkinnedMesh(geometry,material);root.add(mesh);mesh.bind(new THREE.Skeleton([head,neck,arm]));
 const plain=new THREE.Mesh(new THREE.BoxGeometry(),material);root.add(plain);
 return {root,mesh,plain,geometry,material};
}

test('disabled head accents leave geometry and material programs untouched',()=>{
 for(const input of [undefined,null,false,0,{intensity:0}]){
  const x=fixture(),hook=x.material.onBeforeCompile,key=x.material.customProgramCacheKey();
  assert.equal(parseHeadAccentLight(input),null);headAccentLight(x.root,input);
  assert.equal(x.mesh.geometry,x.geometry);assert.equal(x.material.onBeforeCompile,hook);assert.equal(x.material.customProgramCacheKey(),key);
  assert.equal(x.geometry.getAttribute('acxHeadAccentReceiver'),undefined);
 }
});

test('head accents reject invalid enabled fields before an actor is loaded',()=>{
 for(const input of [true,[],{}, {...config,intensity:NaN},{...config,intensity:-1},{...config,position:[0,0]}, {...config,target:config.position},{...config,distance:0},{...config,innerAngleDeg:30,outerAngleDeg:20}])assert.throws(()=>parseHeadAccentLight(input),/headAccentLight/);
 assert.deepEqual(parseHeadAccentLight(config),{...config,innerAngleDeg:12,outerAngleDeg:20,distance:3});
});

test('head receivers preserve skin and corrective buffers, including an unskinned shared-material mesh',()=>{
 const x=fixture(),positions=[...x.geometry.attributes.position.array],morph=[...x.geometry.morphAttributes.position[0].array],plainGeometry=x.plain.geometry;
 headAccentLight(x.root,config);assert.notEqual(x.mesh.geometry,x.geometry);
 assert.deepEqual([...x.mesh.geometry.attributes.position.array],positions);assert.deepEqual([...x.geometry.attributes.position.array],positions);
 assert.deepEqual([...x.mesh.geometry.morphAttributes.position[0].array],morph);assert.equal(x.mesh.geometry.morphTargetsRelative,true);
 const weights=[...x.mesh.geometry.attributes.acxHeadAccentReceiver.array];for(const[i,v]of [1,0,.2,.5].entries())assert.ok(Math.abs(weights[i]-v)<1e-7);
 assert.equal(x.geometry.attributes.acxHeadAccentReceiver,undefined);
 assert.notEqual(x.plain.geometry,plainGeometry);assert.ok([...x.plain.geometry.attributes.acxHeadAccentReceiver.array].every(v=>v===0));
});

test('head accent hooks compose with existing material coverage and keep alpha/albedo properties',()=>{
 const x=fixture(),color=x.material.color.clone(),key='existing-alpha-program';let calls=0;
 x.material.onBeforeCompile=shader=>{calls++;shader.uniforms.existing={value:7};};x.material.customProgramCacheKey=()=>key;
 headAccentLight(x.root,config);
 const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <lights_fragment_end>'};
 x.material.onBeforeCompile(shader,{});assert.equal(calls,1);assert.equal(shader.uniforms.existing.value,7);
 assert.notEqual(x.material.customProgramCacheKey(),key);assert.ok(x.material.color.equals(color));assert.equal(x.material.opacity,.7);assert.equal(x.material.depthWrite,false);assert.equal(x.material.transparent,true);
});
