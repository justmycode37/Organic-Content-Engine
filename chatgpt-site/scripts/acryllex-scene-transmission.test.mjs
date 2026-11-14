import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {SceneTransmissionCapture} from '../src/acryllex/scene-transmission.ts';
import {patchMaterial,fxUniforms} from '../src/acryllex/effects.ts';

function renderer(){
 const s={target:{name:'original'},face:3,mipmap:2,colour:new THREE.Color(.1,.2,.3),alpha:.7,viewport:new THREE.Vector4(3,4,200,100),scissor:new THREE.Vector4(1,2,90,80),test:true};
 const r={getRenderTarget:()=>s.target,getActiveCubeFace:()=>s.face,getActiveMipmapLevel:()=>s.mipmap,setRenderTarget:(t,face=0,mipmap=0)=>{s.target=t;s.face=face;s.mipmap=mipmap;},getClearColor:c=>c.copy(s.colour),getClearAlpha:()=>s.alpha,setClearColor:(c,a)=>{s.colour.set(c);s.alpha=a;},getViewport:v=>v.copy(s.viewport),setViewport:v=>s.viewport.copy(v),getScissor:v=>v.copy(s.scissor),setScissor:v=>s.scissor.copy(v),getScissorTest:()=>s.test,setScissorTest:t=>{s.test=t;},clear(){},render(){}};
 const snapshot=()=>({target:s.target,face:s.face,mipmap:s.mipmap,colour:s.colour.toArray(),alpha:s.alpha,viewport:s.viewport.toArray(),scissor:s.scissor.toArray(),test:s.test});return {r,s,snapshot};
}

test('scene capture excludes all optical receivers, shares one independent source and restores renderer state',()=>{
 const c=new SceneTransmissionCapture(),{r,snapshot}=renderer(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),a=new THREE.Group(),b=new THREE.Group();b.visible=false;scene.add(a,b);const inputA=[],inputB=[],before=snapshot();
 r.render=(received,view)=>{assert.equal(received,scene);assert.equal(view,camera);assert.equal(a.visible,false);assert.equal(b.visible,false);};
 c.capture(r,scene,camera,320,180,[{objects:[a],setInput:i=>inputA.push(i)},{objects:[a,b],setInput:i=>inputB.push(i)}]);
 assert.deepEqual(snapshot(),before);assert.equal(a.visible,true);assert.equal(b.visible,false);assert.equal(inputA[0],null);assert.equal(inputA[1],inputB[1]);assert.equal(inputA[1].depth.isDepthTexture,true);assert.deepEqual(inputA[1].size.toArray(),[320,180]);assert.notEqual(inputA[1].color,before.target.texture);assert.equal(inputA[1].color.colorSpace,THREE.LinearSRGBColorSpace);c.dispose();
});

test('failed source render and failed receiver binding restore visibility and target state',()=>{
 for(const failure of ['render','reset','bind']){
  const c=new SceneTransmissionCapture(),{r,snapshot}=renderer(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),a=new THREE.Group(),b=new THREE.Group(),before=snapshot();scene.add(a,b);
  if(failure==='render')r.render=()=>{throw new Error('source failed');};
  const receivers=[{objects:[a],setInput(){}},{objects:[b],setInput:i=>{if((failure==='reset'&&!i)||(failure==='bind'&&i))throw new Error('binding failed');}}];
  assert.throws(()=>c.capture(r,scene,camera,320,180,receivers),/failed/);assert.equal(a.visible,true);assert.equal(b.visible,true);assert.deepEqual(snapshot(),before);c.dispose();
 }
});

test('capture reuses storage, updates view data each frame, resizes and disposes only owned state',()=>{
 const c=new SceneTransmissionCapture(),{r}=renderer(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),inputs=[],receiver={objects:[],setInput:i=>{if(i)inputs.push(i);}};
 c.capture(r,scene,camera,320,180,[receiver]);const texture=inputs[0].color,depth=inputs[0].depth;
 camera.near=.03;camera.updateProjectionMatrix();c.capture(r,scene,camera,640,360,[receiver]);assert.equal(inputs[1].color,texture);assert.equal(inputs[1].depth,depth);assert.deepEqual(inputs[1].size.toArray(),[640,360]);assert.equal(inputs[1].near,.03);assert.equal(inputs[1].projection,camera.projectionMatrix);
 c.dispose();c.dispose();assert.throws(()=>c.capture(r,scene,camera,1,1,[receiver]),/disposed/);
});

test('no receiver allocates no capture pass; malformed resource sizes fail before rendering',()=>{
 const c=new SceneTransmissionCapture(),{r}=renderer(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();r.render=()=>assert.fail('Unexpected render');c.capture(r,scene,camera,320,180,[]);
 for(const size of [[0,1],[1,NaN],[.5,2],[8193,1]])assert.throws(()=>c.capture(r,scene,camera,...size,[{objects:[],setInput(){}}]),/size/);c.dispose();
});

test('optical AO classification survives effect hooks and stays separate from opaque material programs',()=>{
 const opaque=new THREE.MeshStandardMaterial(),optical=new THREE.MeshStandardMaterial();optical.userData.screenAO=false;
 for(const m of [opaque,optical])patchMaterial(m,fxUniforms(),{});
 const compile=m=>{const shader={uniforms:{},vertexShader:'#include <common>\n#include <defaultnormal_vertex>',fragmentShader:'#include <common>\n#include <opaque_fragment>'};m.onBeforeCompile(shader,{});return shader;};
 assert.notEqual(opaque.customProgramCacheKey(),optical.customProgramCacheKey());assert.doesNotMatch(compile(opaque).fragmentShader,/gl_FragColor.a=2/);assert.match(compile(optical).fragmentShader,/gl_FragColor.a=2/);assert.equal(opaque.transparent,false);assert.equal(optical.transparent,false);
});
