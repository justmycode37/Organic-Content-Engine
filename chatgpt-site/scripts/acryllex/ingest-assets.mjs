// Add realistic scanned / engineering models to the asset catalogue.
//   node scripts/acryllex/ingest-assets.mjs [id ...]      (default: every row of realistic-assets.mjs)
// Downloads each GLB, measures its bounding box in headless Chrome (Draco + meshopt aware), sets `scale` so the
// longest side matches the real object in metres, and writes the entry into src/acryllex/assets/catalog.json.
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ensureAsset,ASSET_DIR} from './assets.mjs';
import {REALISTIC} from './realistic-assets.mjs';
import {loadCatalog} from './catalog.mjs';

const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const CATALOG=join(ROOT,'src/acryllex/assets/catalog.json');
const only=process.argv.slice(2);
const rows=REALISTIC.filter(r=>!only.length||only.includes(r.id));
const cat=JSON.parse(await readFile(CATALOG,'utf8'));
const procedural=new Set((await loadCatalog()).models.flatMap(m=>[m.id,...(m.aliases??[])]));
const norm=s=>String(s).toLowerCase().trim().replace(/[\s_]+/g,'-');const taken=new Set(cat.assets.filter(a=>a.src!=='url'||!rows.some(r=>r.id===a.id)).flatMap(a=>[a.id,a.ph].filter(Boolean).map(norm)));
const clash=rows.filter(r=>procedural.has(r.id)||taken.has(norm(r.id)));if(clash.length)throw new Error(`ids clash with procedural models: ${clash.map(r=>r.id).join(', ')}`);

const entries=[];
for(const r of rows){
 const ext=r.url.includes('3d-api.si.edu')?'si':r.url.includes('nasa')?'nasa':r.url.includes('Khronos')?'khronos':r.url.includes('objaverse')?'objaverse':'three';
 const e={id:r.id,src:'url',url:r.url,file:`real/${ext}/${r.id}.glb`,name:r.name,tags:r.tags,cat:'Realistic',desc:`${r.name} (realistic ${ext==='si'?'museum scan':ext==='objaverse'?'model':'engineering model'})`,size:[1,1,1],source:r.source,license:r.license,...(r.page?{page:r.page}:{}),...(r.rot?{rot:r.rot}:{})};
 try{await ensureAsset(e);entries.push(e);process.stdout.write('.');}catch(err){console.error(`\n${r.id}: ${err.message}`);}
}
console.log(`\n${entries.length}/${rows.length} downloaded`);

const page_js=(await build({stdin:{contents:`
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/examples/jsm/loaders/DRACOLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setDRACOLoader(new DRACOLoader().setDecoderPath('http://acx.local/a/draco/'));
window.measure=async (path,rot)=>{const g=await loader.loadAsync('http://acx.local/a/'+path);if(rot)g.scene.rotation.set(...rot.map(v=>v*Math.PI/180));g.scene.updateMatrixWorld(true);
 const b=new THREE.Box3().setFromObject(g.scene,true),s=b.getSize(new THREE.Vector3());let tris=0;g.scene.traverse(o=>{if(o.isMesh){const i=o.geometry.index;tris+=(i?i.count:o.geometry.attributes.position.count)/3;}});
 return {size:[s.x,s.y,s.z],tris:Math.round(tris)};};`,resolveDir:ROOT,loader:'js'},bundle:true,write:false,format:'iife',target:'es2022',define:{'import.meta.url':JSON.stringify('http://acx.local/m.js')},logLevel:'error'})).outputFiles[0].text;
const CHROME=process.env.CHROME_PATH?.trim()||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,executablePath:CHROME});
const page=await browser.newPage();page.on('pageerror',e=>console.error('page error:',e.message));
await page.route('http://acx.local/**',async route=>{const p=new URL(route.request().url()).pathname;
 if(p==='/')return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html>'});
 try{return route.fulfill({status:200,contentType:p.endsWith('.wasm')?'application/wasm':p.endsWith('.js')?'text/javascript':'application/octet-stream',body:await readFile(join(ASSET_DIR,decodeURIComponent(p.slice(3))))});}catch{return route.fulfill({status:404});}});
await page.goto('http://acx.local/');await page.addScriptTag({content:page_js});
const ok=[];
for(const e of entries){
 try{const m=await page.evaluate(([p,r])=>window.measure(p,r),[e.file,e.rot??null]);const longest=Math.max(...m.size);
  if(!(longest>0))throw new Error('empty mesh');
  const r=rows.find(x=>x.id===e.id);e.scale=+(r.metres/longest).toPrecision(5);e.size=m.size.map(v=>+(v*e.scale).toFixed(3));e.desc+=`; ${m.tris} triangles`;ok.push(e);
  console.log(`${e.id.padEnd(28)} ${m.tris.toString().padStart(8)} tris  ${e.size.join(' x ')} m`);
 }catch(err){console.error(`${e.id}: measure failed: ${err.message}`);}
}
await browser.close();
if(!only.length)cat.assets=cat.assets.filter(a=>!String(a.file??'').startsWith('real/'));
const byId=new Map(cat.assets.map((a,i)=>[a.id,i]));
for(const e of ok){if(byId.has(e.id))cat.assets[byId.get(e.id)]=e;else cat.assets.push(e);}
await writeFile(CATALOG,JSON.stringify(cat));
console.log(`catalogue: ${ok.length} realistic assets written (${cat.assets.length} total)`);
