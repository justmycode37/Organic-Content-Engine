// Repackage a licensed source scan with its original texture/normal-map convention.
// No sculpting, smoothing, retopology or generated expression geometry.
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';

const root=fileURLToPath(new URL('../../',import.meta.url));
const directory=root+'src/acryllex/assets/heads/lee-perry-smith/';
const files={
 'LeePerrySmith.glb':'402b8a8ac9f03232e6d64b5962929703a069daf99d3c49ac8eb0e48bedc9c576',
 'LeePerrySmith_License.txt':'7cf4da43a6ae6d32f7f7d063fe129a19468af6f4fe7c53b937f83959709fcb50',
 'Infinite-Level_02_Tangent_SmoothUV.jpg':'36925e51ad9b324b94e8faf4692da1b4132809f2762bb8d5bd549ffd215d4ca6',
 'Map-COL.jpg':'e976d73b31407f8d0967412bf468019ed26a5d5a32cf5811aabff7e816458a65',
};
const source='https://raw.githubusercontent.com/mrdoob/three.js/r180/examples/models/gltf/LeePerrySmith/';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const [name,expected]of Object.entries(files))assert.equal(sha(await readFile(directory+name)),expected,name+' must match the pinned source');
const bundle=(await build({stdin:{resolveDir:root,contents:`
 import * as THREE from 'three';
 import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
 import {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js';
 window.packHead=async()=>{
  const source=await new GLTFLoader().loadAsync('/LeePerrySmith.glb'),root=new THREE.Group();
  source.scene.updateMatrixWorld(true);
  source.scene.traverse(o=>{if(o.isMesh){const mesh=new THREE.Mesh(o.geometry,o.material);mesh.applyMatrix4(o.matrixWorld);mesh.name=o.name;root.add(mesh);}});
  const loader=new THREE.TextureLoader(),map=await loader.loadAsync('/Map-COL.jpg'),normalMap=await loader.loadAsync('/Infinite-Level_02_Tangent_SmoothUV.jpg');
  map.colorSpace=THREE.SRGBColorSpace;
  // Same flipY=true TextureLoader convention as the source Three.js normal-map example.
  // GLTFExporter bakes texture orientation and normal-channel signs on serialization.
  root.traverse(o=>{if(o.isMesh)o.material=new THREE.MeshStandardMaterial({map,normalMap,roughness:.62,metalness:0});});
  root.userData={source:'Infinite, 3D Head Scan by Lee Perry-Smith / Infinite Realities',license:'CC-BY-3.0',sourceRelease:'three.js r180',adaptation:'Repackaged original geometry with supplied colour and tangent normal maps; no expression rig.'};
  const packed=await new GLTFExporter().parseAsync(root,{binary:true});
  const bytes=new Uint8Array(packed);let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);
 };`},bundle:true,write:false,format:'iife',logLevel:'error'})).outputFiles[0].text;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://head.local/**',async route=>{
  const name=new URL(route.request().url()).pathname.slice(1);
  if(!name)return route.fulfill({body:'<!doctype html><title>Source head packaging</title>',contentType:'text/html'});
  if(!(name in files))return route.fulfill({status:404});
  return route.fulfill({body:await readFile(directory+name),contentType:name.endsWith('.jpg')?'image/jpeg':'model/gltf-binary'});
 });
 await page.goto('http://head.local/');await page.addScriptTag({content:bundle});
 const packed=Buffer.from(await page.evaluate(()=>window.packHead()),'base64');assert.deepEqual(errors,[]);
 await writeFile(directory+'head.glb',packed);
 await writeFile(directory+'provenance.json',JSON.stringify({title:'Infinite, 3D Head Scan',author:'Lee Perry-Smith / Infinite Realities',license:'CC-BY-3.0',licenseURL:'https://creativecommons.org/licenses/by/3.0/',source,sourceFiles:files,output:'head.glb',outputSHA256:sha(packed),adaptations:['Repackaged original mesh with supplied photographic colour and tangent-space normal maps.','Texture orientation and normal-channel convention baked by Three.js GLTFExporter.','No generated anatomy, added facial expressions, or rig.'],scope:'Closed-eye neutral bust; rigid head/neck motion only. Shared library material ignores source RGB unless explicit detail is enabled.'},null,2)+'\n');
 console.log(JSON.stringify({bytes:packed.length,sha256:sha(packed)}));
}finally{await browser.close();}
