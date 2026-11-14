// Compare the source scan and packed scan under identical cameras/lights on the GPU.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {openAcryllex} from './render.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url)),out=resolve(process.argv[2]??'../artifacts/acryllex-realism');await mkdir(out,{recursive:true});
const spec={version:1,series:'ACRYLLEX',style:'reference-recording',title:'Head scan verification',captions:false,format:{width:1164,height:670},scenes:[{say:'Scanned head',duration:4,hue:'blue',camera:{angle:'front',move:'static',fill:.85},objects:[{id:'head',model:'head-mesh',enter:'cut',enterAt:0,idle:'none',controls:{yaw:0}}],events:[{at:1,dur:1.5,target:'head',set:{yaw:55,pitch:-8},easing:'smooth'}]}]};
const {page,browser,errors}=await openAcryllex(spec);
try{
 await page.route('http://acx.local/head-reference/**',async route=>{
  const name=new URL(route.request().url()).pathname.split('/').at(-1);
  if(!['LeePerrySmith.glb','Map-COL.jpg','Infinite-Level_02_Tangent_SmoothUV.jpg'].includes(name))return route.fulfill({status:404});
  return route.fulfill({body:await readFile(root+'src/acryllex/assets/heads/lee-perry-smith/'+name),contentType:name.endsWith('.jpg')?'image/jpeg':'model/gltf-binary'});
 });
 const bundle=(await build({stdin:{resolveDir:root,contents:`
 import * as THREE from 'three';
 import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
 import {plainMaterial} from './src/acryllex/assets.ts';
 window.headSourceCheck=async()=>{
  const loader=new GLTFLoader(),original=await loader.loadAsync('/head-reference/LeePerrySmith.glb'),packed=await loader.loadAsync('/a/heads/lee-perry-smith/head.glb');
  const tl=new THREE.TextureLoader(),normal=await tl.loadAsync('/head-reference/Infinite-Level_02_Tangent_SmoothUV.jpg'),photo=await tl.loadAsync('/head-reference/Map-COL.jpg');photo.colorSpace=THREE.SRGBColorSpace;
  const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setSize(512,512);renderer.setPixelRatio(1);renderer.setClearColor(0);renderer.toneMapping=THREE.NoToneMapping;renderer.outputColorSpace=THREE.LinearSRGBColorSpace;
  const target=new THREE.WebGLRenderTarget(512,512),camera=new THREE.PerspectiveCamera(35,1,.01,10);camera.position.set(0,0,.9);camera.lookAt(0,0,0);
  const scene=new THREE.Scene(),key=new THREE.DirectionalLight(0xffffff,.65),fill=new THREE.DirectionalLight(0xffffff,.08),rim=new THREE.DirectionalLight(0xffffff,.35),ambient=new THREE.AmbientLight(0xffffff,.065);
  key.position.set(1.5,1.1,1.2);fill.position.set(-1,.5,1);rim.position.set(-1,1,-1);scene.add(key,fill,rim,ambient);
  const ctx={mat:({tone,rough})=>new THREE.MeshStandardMaterial({color:new THREE.Color().setScalar(tone),roughness:rough,metalness:0})};
  const sourceRoot=new THREE.Group();original.scene.updateMatrixWorld(true);original.scene.traverse(o=>{if(o.isMesh){const m=new THREE.Mesh(o.geometry,new THREE.MeshStandardMaterial({color:new THREE.Color().setScalar(.72),roughness:.62,normalMap:normal}));m.applyMatrix4(o.matrixWorld);sourceRoot.add(m);}});
  const packedRoot=packed.scene;packedRoot.traverse(o=>{if(o.isMesh)o.material=plainMaterial(o.material,ctx,.72);});
  const normalize=root=>{root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(root,true),group=new THREE.Group(),size=box.getSize(new THREE.Vector3());root.position.sub(box.getCenter(new THREE.Vector3()));group.scale.setScalar(.42/size.y);group.add(root);return group;};
  const a=normalize(sourceRoot),b=normalize(packedRoot),pixels=root=>{scene.add(root);renderer.setRenderTarget(target);renderer.render(scene,camera);const data=new Uint8Array(512*512*4);renderer.readRenderTargetPixels(target,0,0,512,512,data);scene.remove(root);return data;};
  const comparisons=[];
  for(const [yaw,pitch]of [[0,0],[-55,0],[55,-12],[85,5]]){
   a.rotation.set(pitch*Math.PI/180,yaw*Math.PI/180,0);b.rotation.copy(a.rotation);const x=pixels(a),y=pixels(b);let error=0,maximum=0,n=0,visible=0;
   for(let i=0;i<x.length;i+=4){if(x[i]||y[i])visible++;for(let c=0;c<3;c++){const d=Math.abs(x[i+c]-y[i+c]);error+=d;maximum=Math.max(maximum,d);n++;}}
   comparisons.push({yaw,pitch,meanAbsoluteByteError:error/n,maximumByteError:maximum,visiblePixels:visible});
  }
  a.rotation.set(0,0,0);b.rotation.set(0,0,0);const neutral=pixels(b);b.traverse(o=>{if(o.isMesh){o.material.map=photo;o.material.color.setRGB(1,1,1);o.material.needsUpdate=true;}});
  scene.add(b);renderer.setRenderTarget(null);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.render(scene,camera);const sourcePhoto=renderer.domElement.toDataURL('image/png').split(',')[1];scene.remove(b);
  // The material converter must ignore arbitrary source RGB while retaining the same relief.
  const synthetic=new THREE.DataTexture(new Uint8Array([255,0,255,255]),1,1);synthetic.needsUpdate=true;
  b.traverse(o=>{if(o.isMesh){const src=o.material.clone();src.map=synthetic;src.color.setRGB(.01,.99,.01);o.material=plainMaterial(src,ctx,.72);}});
  renderer.outputColorSpace=THREE.LinearSRGBColorSpace;const syntheticPixels=pixels(b);let sourceRGBChanged=0;for(let i=0;i<neutral.length;i++)if(neutral[i]!==syntheticPixels[i])sourceRGBChanged++;
  b.traverse(o=>{if(o.isMesh){o.material.normalMap=null;o.material.needsUpdate=true;}});const flat=pixels(b);let normalMapDifference=0;for(let i=0;i<neutral.length;i+=4)normalMapDifference+=Math.abs(neutral[i]-flat[i]);
  target.dispose();renderer.dispose();return {comparisons,sourceRGBChanged,normalMapMeanByteDifference:normalMapDifference/(512*512),sourcePhoto};
 };`},bundle:true,write:false,format:'iife',target:'es2022',define:{'import.meta.url':JSON.stringify('http://acx.local/modules/head-verification.js')},logLevel:'error'})).outputFiles[0].text;
 await page.addScriptTag({content:bundle});const result=await page.evaluate(()=>window.headSourceCheck());
 await writeFile(join(out,'head-scan-source-reference.png'),Buffer.from(result.sourcePhoto,'base64'));delete result.sourcePhoto;
 for(const c of result.comparisons){assert.ok(c.visiblePixels>5000);assert.ok(c.meanAbsoluteByteError<.1,JSON.stringify(c));}
 assert.equal(result.sourceRGBChanged,0,'Photographic RGB must not affect neutral library shading');assert.ok(result.normalMapMeanByteDifference>.05,'Source relief was not used');
 const frames=await page.evaluate(()=>{const first=window.acryllex.shot(.5),turned=window.acryllex.shot(2.8),reverse=window.acryllex.shot(.5);return {first,turned,reverse};});
 assert.equal(frames.first,frames.reverse);assert.notEqual(frames.first,frames.turned);assert.deepEqual(errors,[]);
 await writeFile(join(out,'head-scan-front.png'),Buffer.from(frames.first,'base64'));await writeFile(join(out,'head-scan-turned.png'),Buffer.from(frames.turned,'base64'));
 await writeFile(join(out,'head-scan-gpu-verification.json'),JSON.stringify({passed:true,...result,reverseSeekExact:true,limits:'Source geometry/normal convention agreement and scene-hue material invariance, not a universal realism or photographic likeness score. Photographic reference is a view of the same scan using its supplied texture, not an independent photograph. Closed eyes and rigid bust movement only.'},null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser.close();}
