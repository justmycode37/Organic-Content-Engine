// Native style checks: selected source eye textures may change eyes, not forehead/style.
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {openAcryllex} from './render.mjs';
import {assetsForSpec} from './assets.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url)),out=resolve(process.argv[2]??'../artifacts/acryllex-realism');await mkdir(out,{recursive:true});
const base={version:1,series:'ACRYLLEX',title:'Selected source albedo verification',style:'reference-recording',captions:false,format:{width:1164,height:670}};
const sourceCases=[{id:'angelica',uid:'27f75fa94c384000bb6a79a3000f8e80',eye:'material'},{id:'antipov',uid:'e774147bf2224e6f83ec89f67ec2ecb6',eye:'EyeMaterial'}];
const make=(source,angle,selection)=>({...base,scenes:[{say:source.id,duration:3,hue:'blue',raster:{activity:0},camera:{angle,fill:.85,move:'static'},objects:[{id:'head',model:'mesh',params:{objaverse:source.uid,height:.42,clips:[],sourceAlbedo:selection},enter:'cut',enterAt:0,idle:'none'}]}]});
const initial=make(sourceCases[0],'front',{}),{page,browser,errors}=await openAcryllex(initial);
try{
 const bundle=(await build({stdin:{resolveDir:root,contents:`
 import * as THREE from 'three';
 import {Engine} from './src/acryllex/engine.ts';
 import {preloadAssets,plainMaterial} from './src/acryllex/assets.ts';
 window.sourceAlbedoCheck={
  async frame(spec,assets,selected){
   const engine=new Engine(spec);
   try{
    await preloadAssets(assets,engine.renderer);const canvas=engine.frame(1),image=canvas.toDataURL('image/png').split(',')[1],rgba=canvas.getContext('2d').getImageData(0,0,1164,670).data;
    const camera=engine.runtime(0).camera,rects=[];engine.runtime(0).scene.traverse(o=>{
     if(!o.isMesh)return;const materials=Array.isArray(o.material)?o.material:[o.material];if(!materials.some(m=>selected.includes(m.userData.acryllexSourceMaterial)))return;
     let minX=1164,minY=670,maxX=-1,maxY=-1;for(let i=0;i<o.geometry.attributes.position.count;i++){
      const p=o.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(o.matrixWorld).project(camera),x=(p.x+1)*582,y=(1-p.y)*335;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
     }rects.push({minX:minX-7,minY:minY-7,maxX:maxX+7,maxY:maxY+7});
    });
    const pixels=[];for(let i=0;i<rgba.length;i+=4)pixels.push(Math.max(rgba[i],rgba[i+1],rgba[i+2]));
    return {pixels,image,rects,profile:{look:engine.spec.look,light:engine.spec.scenes[0].light,raster:engine.spec.scenes[0].raster,format:engine.spec.format},reverseExact:image===engine.frame(.25).toDataURL('image/png').split(',')[1]};
   }finally{engine.dispose();}
  },
  linearProbe(){
   const renderer=new THREE.WebGLRenderer({antialias:false});renderer.setSize(64,64);renderer.outputColorSpace=THREE.LinearSRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;
   const target=new THREE.WebGLRenderTarget(64,64),scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=2;
   const key=new THREE.DirectionalLight(0xffffff,1);key.position.set(0,0,2);scene.add(key);
   const ctx={mat:({tone,rough})=>new THREE.MeshStandardMaterial({color:new THREE.Color().setScalar(tone),roughness:rough})};
   const tex=new THREE.DataTexture(new Uint8Array([128,128,128,255]),1,1);tex.colorSpace=THREE.SRGBColorSpace;tex.needsUpdate=true;
   const source=new THREE.MeshStandardMaterial({map:tex}),mesh=new THREE.Mesh(new THREE.PlaneGeometry(2,2),plainMaterial(source,ctx,.72,false,1));scene.add(mesh);
   const sample=()=>{renderer.setRenderTarget(target);renderer.render(scene,camera);const p=new Uint8Array(4);renderer.readRenderTargetPixels(target,32,32,1,1,p);return Array.from(p);};
   const actual=sample(),linear=new THREE.Color().setRGB(128/255,128/255,128/255,THREE.SRGBColorSpace).r;
   mesh.material=ctx.mat({tone:.72*linear,rough:.62});const expected=sample();
   mesh.material=plainMaterial(source,ctx,.72,false,.5);const partial=sample();mesh.material=ctx.mat({tone:.72*(.5+.5*linear),rough:.62});const expectedPartial=sample();
   target.dispose();renderer.dispose();return {actual,expected,partial,expectedPartial,decodedLuma:linear};
  }
 };`},bundle:true,write:false,format:'iife',target:'es2022',define:{'import.meta.url':JSON.stringify('http://acx.local/modules/source-albedo-verification.js')},loader:{'.ttf':'dataurl'},logLevel:'error'})).outputFiles[0].text;
 await page.addScriptTag({content:bundle});const linear=await page.evaluate(()=>window.sourceAlbedoCheck.linearProbe());assert.deepEqual(linear.actual,linear.expected);assert.deepEqual(linear.partial,linear.expectedPartial);
 const results=[];
 for(const source of sourceCases)for(const angle of ['front','three-quarter-left','side']){
  const neutral=make(source,angle,{}),selected=make(source,angle,{[source.eye]:1}),assets=await assetsForSpec(selected);
  const before=await page.evaluate(([s,a,m])=>window.sourceAlbedoCheck.frame(s,a,m),[neutral,assets,[source.eye]]),after=await page.evaluate(([s,a,m])=>window.sourceAlbedoCheck.frame(s,a,m),[selected,assets,[source.eye]]);
  assert.deepEqual(after.profile,before.profile);assert.ok(after.rects.length);assert.equal(after.reverseExact,true);
  let changedInside=0,changedOutside=0,beforeEyeSum=0,afterEyeSum=0,eyePixels=0;
  for(let i=0;i<before.pixels.length;i++){const x=i%1164,y=Math.floor(i/1164),eye=after.rects.some(r=>x>=r.minX&&x<=r.maxX&&y>=r.minY&&y<=r.maxY),changed=before.pixels[i]!==after.pixels[i];if(eye){changedInside+=+changed;beforeEyeSum+=before.pixels[i];afterEyeSum+=after.pixels[i];eyePixels++;}else changedOutside+=+changed;}
  assert.ok(changedInside>10,source.id+' '+angle+' has no visible eye-texture contribution');assert.equal(changedOutside,0,'Nonselected face shading changed outside the projected eye surfaces');assert.ok(afterEyeSum<beforeEyeSum,'Source pupil/iris reflectance must darken the clay eye');
  await writeFile(join(out,'source-albedo-'+source.id+'-'+angle+'-neutral.png'),Buffer.from(before.image,'base64'));await writeFile(join(out,'source-albedo-'+source.id+'-'+angle+'.png'),Buffer.from(after.image,'base64'));
  results.push({source:source.id,uid:source.uid,angle,changedInside,changedOutside,beforeEyeMean:beforeEyeSum/eyePixels,afterEyeMean:afterEyeSum/eyePixels,reverseExact:after.reverseExact,profileUnchanged:true});
 }
 assert.deepEqual(errors,[]);await writeFile(join(out,'source-albedo-gpu-verification.json'),JSON.stringify({passed:true,linear,results,limits:'Material reflectance/feature visibility and native-frame isolation only. The source geometry, anatomical accuracy, source lighting baked into images, expression quality and perceptual realism still require review. The reference image is not reconstructed by this shader.'},null,2)+'\n');console.log(JSON.stringify({linear,results}));
}finally{await browser.close();}
