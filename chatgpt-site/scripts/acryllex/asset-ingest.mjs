// Shared ingest for realistic scanned / engineering models (used by ingest-assets.mjs and auto-sourcing).
// Downloads each GLB, measures its bounding box in headless Chrome (Draco + meshopt aware), sets `scale` so the
// longest side matches the real object in metres, and writes the entry into src/acryllex/assets/catalog.json.
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ensureAsset,ASSET_DIR} from './assets.mjs';
import {writeAtomic} from './atomic-file.mjs';

const ROOT=fileURLToPath(new URL('../../',import.meta.url));
export const CATALOG=join(ROOT,'src/acryllex/assets/catalog.json');
export const norm=s=>String(s).toLowerCase().trim().replace(/[\s_]+/g,'-');
export const readCatalog=async()=>JSON.parse(await readFile(CATALOG,'utf8'));
export const writeCatalog=cat=>writeAtomic(CATALOG,JSON.stringify(cat));

const sourceKind=url=>url.includes('3d-api.si.edu')?'si':url.includes('nasa')?'nasa':url.includes('Khronos')?'khronos':url.includes('objaverse')?'objaverse':'three';

/** Catalogue entry for a row {id,name,metres,tags,url,source,license,page?,rot?,author?}. */
export function entryFor(r){
 const ext=sourceKind(r.url);
 return {id:r.id,src:'url',url:r.url,file:`real/${ext}/${r.id}.glb`,name:r.name,tags:r.tags,cat:r.cat??'Realistic',
  desc:`${r.name} (realistic ${ext==='si'?'museum scan':ext==='objaverse'?'model':'engineering model'})`,size:[1,1,1],
  source:r.source,license:r.license,...(r.page?{page:r.page}:{}),...(r.rot?{rot:r.rot}:{})};
}

let measurer;
/** One headless page that measures GLBs (kept open across calls). */
async function measurePage(){
 if(measurer)return measurer;
 const js=(await build({stdin:{contents:`
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/examples/jsm/loaders/DRACOLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setDRACOLoader(new DRACOLoader().setDecoderPath('http://acx.local/a/draco/'));
window.measure=async (path,rot)=>{const g=await loader.loadAsync('http://acx.local/a/'+path);if(rot)g.scene.rotation.set(...rot.map(v=>v*Math.PI/180));g.scene.updateMatrixWorld(true);
 const b=new THREE.Box3().setFromObject(g.scene,true),s=b.getSize(new THREE.Vector3());let tris=0;g.scene.traverse(o=>{if(o.isMesh){const i=o.geometry.index;tris+=(i?i.count:o.geometry.attributes.position.count)/3;}});
 return {size:[s.x,s.y,s.z],tris:Math.round(tris)};};`,resolveDir:ROOT,loader:'js'},bundle:true,write:false,format:'iife',target:'es2022',define:{'import.meta.url':JSON.stringify('http://acx.local/m.js')},logLevel:'error'})).outputFiles[0].text;
 const CHROME=process.env.CHROME_PATH?.trim()||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/chromium');
 const browser=await chromium.launch({headless:true,executablePath:CHROME});
 const page=await browser.newPage();page.on('pageerror',e=>console.error('page error:',e.message));
 await page.route('http://acx.local/**',async route=>{const p=new URL(route.request().url()).pathname;
  if(p==='/')return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html>'});
  try{return route.fulfill({status:200,contentType:p.endsWith('.wasm')?'application/wasm':p.endsWith('.js')?'text/javascript':'application/octet-stream',body:await readFile(join(ASSET_DIR,decodeURIComponent(p.slice(3))))});}catch{return route.fulfill({status:404});}});
 await page.goto('http://acx.local/');await page.addScriptTag({content:js});
 measurer={page,close:()=>{measurer=null;return browser.close();}};
 return measurer;
}
export async function closeMeasurer(){await measurer?.close();}

/** Download + measure rows; returns ready catalogue entries (does not write the catalogue). */
export async function prepareRows(rows,{log=()=>{}}={}){
 const out=[];const m=await measurePage();
 for(const r of rows){
  const e=entryFor(r);
  try{
   await ensureAsset(e);
   const s=await m.page.evaluate(([p,rot])=>window.measure(p,rot),[e.file,e.rot??null]);const longest=Math.max(...s.size);
   if(!(longest>0))throw new Error('empty mesh');
   e.scale=+(r.metres/longest).toPrecision(5);e.size=s.size.map(v=>+(v*e.scale).toFixed(3));e.desc+=`; ${s.tris} triangles`;
   out.push(e);log(`${e.id.padEnd(28)} ${String(s.tris).padStart(8)} tris  ${e.size.join(' x ')} m`);
  }catch(err){log(`${r.id}: failed: ${err.message}`);}
 }
 return out;
}

/** Insert or replace entries in the catalogue (by id). */
export async function upsertCatalog(entries,{dropReal=false}={}){
 const cat=await readCatalog();
 if(dropReal)cat.assets=cat.assets.filter(a=>!String(a.file??'').startsWith('real/'));
 const byId=new Map(cat.assets.map((a,i)=>[a.id,i]));
 for(const e of entries){if(byId.has(e.id))cat.assets[byId.get(e.id)]=e;else{byId.set(e.id,cat.assets.length);cat.assets.push(e);}}
 await writeCatalog(cat);return cat;
}
export async function removeFromCatalog(ids){const cat=await readCatalog();const drop=new Set(ids);cat.assets=cat.assets.filter(a=>!drop.has(a.id));await writeCatalog(cat);}
