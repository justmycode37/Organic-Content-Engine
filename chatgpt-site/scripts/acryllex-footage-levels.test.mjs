import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {parseFootageLevels,applyFootageLevels} from '../src/acryllex/footage-levels.ts';
import {footageVariantKey} from '../src/acryllex/media-key.ts';

test('absent and identity footage levels retain the original material program',()=>{
 for(const value of [undefined,{}, {blackPoint:0,whitePoint:1}]){
  const material=new THREE.MeshBasicMaterial(),hook=material.onBeforeCompile,key=material.customProgramCacheKey(),version=material.version;
  assert.equal(parseFootageLevels(value),null);applyFootageLevels(material,value);
  assert.equal(material.onBeforeCompile,hook);assert.equal(material.customProgramCacheKey(),key);assert.equal(material.version,version);
 }
});

test('invalid grading cannot silently produce missing or nonfinite density',()=>{
 for(const value of [null,false,[],1,'1',{blackPoint:null},{whitePoint:null},{blackPoint:'0'},{whitePoint:NaN},{blackPoint:-.01},{whitePoint:1.01},{blackPoint:.8,whitePoint:.7},{blackPoint:.5,whitePoint:.5},{whitePoint:Number.MIN_VALUE},{blackpoint:.1}])assert.throws(()=>parseFootageLevels(value),/footage sourceLevels/);
 assert.deepEqual(parseFootageLevels({whitePoint:.75}),{blackPoint:0,whitePoint:.75});
});

test('instance grading keeps shared texture bytes, alpha and previous hooks intact',()=>{
 const bytes=new Uint8Array([40,80,120,51]),texture=new THREE.DataTexture(bytes,1,1);
 const a=new THREE.MeshBasicMaterial({map:texture,alphaHash:true,opacity:.6}),b=new THREE.MeshBasicMaterial({map:texture,alphaHash:true});
 let calls=0;a.onBeforeCompile=s=>{calls++;s.uniforms.previous={value:7};};a.customProgramCacheKey=()=> 'existing';
 const alpha={hash:a.alphaHash,opacity:a.opacity,transparent:a.transparent,depthWrite:a.depthWrite};
 applyFootageLevels(a,{whitePoint:.75});applyFootageLevels(b,{blackPoint:.12,whitePoint:.65});
 const shader=()=>({uniforms:{},fragmentShader:'#include <map_fragment>\n#include <alphamap_fragment>'});
 const sa=shader(),sb=shader();a.onBeforeCompile(sa,{});b.onBeforeCompile(sb,{});
 assert.equal(calls,1);assert.equal(sa.uniforms.previous.value,7);
 assert.equal(sa.uniforms.acxFootageRange.value,.75);assert.equal(sb.uniforms.acxFootageRange.value,.53);
 sa.uniforms.acxFootageRange.value=.9;assert.equal(sb.uniforms.acxFootageRange.value,.53);
 assert.equal(a.map,texture);assert.equal(b.map,texture);assert.deepEqual([...bytes],[40,80,120,51]);
 assert.deepEqual({hash:a.alphaHash,opacity:a.opacity,transparent:a.transparent,depthWrite:a.depthWrite},alpha);
 assert.ok(sa.fragmentShader.includes('#include <alphamap_fragment>'));
 assert.equal(footageVariantKey('clip',{sourceLevels:{whitePoint:.75}}),footageVariantKey('clip',{}));
 assert.ok(a.customProgramCacheKey().startsWith('existing|'));
});
