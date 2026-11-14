// Real 3D assets for ACRYLLEX: Poly Haven CC0 photoscans (downloaded on demand) + rigged/animated glTFs.
import {access,mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {extname,resolve} from 'node:path';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareFluidCaches} from './cache-assets.mjs';
import {prepareFootage} from './media-assets.mjs';
import {prepareRecordedMotions} from './recorded-motion-assets.mjs';
import {prepareHumanBodies} from './human-body-assets.mjs';
import {parseBodySource} from '../../src/acryllex/human-body-source.ts';
import {headSource} from '../../src/acryllex/head-source.ts';
import {objaverseSource} from '../../src/acryllex/objaverse-source.ts';
import {prepareObjaverseMesh} from './objaverse-assets.mjs';
import {prepareImportedMesh} from './mesh-assets.mjs';
import {writeAtomic} from './atomic-file.mjs';

const ROOT=fileURLToPath(new URL('../../',import.meta.url));
export const ASSET_DIR=join(ROOT,'.acryllex-assets');
const exists=p=>access(p).then(()=>true,()=>false);
async function copyStable(source,destination){
 const bytes=await readFile(source),previous=await readFile(destination).catch(()=>null);
 if(!previous?.equals(bytes))await writeAtomic(destination,bytes);
}
const THREE_BASE='https://raw.githubusercontent.com/mrdoob/three.js/r170/examples/models/gltf/';

let catalog;
/** Forget the cached catalogue (after auto-sourcing added entries). */
export function resetAssetCatalog(){catalog=undefined;}
export async function assetCatalog(){catalog??=JSON.parse(await readFile(join(ROOT,'src/acryllex/assets/catalog.json'),'utf8')).assets;return catalog;}
const norm=s=>String(s).toLowerCase().trim().replace(/[\s_]+/g,'-');

/** Asset entry for a model id (catalogue id, Poly Haven id, or "ph:<id>"). */
export async function findAsset(id){
 const cat=await assetCatalog();const k=norm(String(id).replace(/^(ph|asset):/,''));
 return cat.find(a=>norm(a.id)===k||norm(a.ph??'')===k)??null;
}

async function download(url,file){
 if(await exists(file))return;
 const r=await fetch(url,{signal:AbortSignal.timeout(120000)});if(!r.ok)throw new Error(`asset download failed ${r.status}: ${url}`);
 await mkdir(dirname(file),{recursive:true});await writeFile(file,Buffer.from(await r.arrayBuffer()));
}

/** Draco-compressed scans (Smithsonian, NASA) need the decoder next to the assets. */
export async function dracoDecoder(){
 for(const name of ['draco_decoder.js','draco_decoder.wasm','draco_wasm_wrapper.js']){const dest=join(ASSET_DIR,'draco',name);if(!await exists(dest)){await mkdir(dirname(dest),{recursive:true});await copyStable(join(ROOT,'node_modules/three/examples/jsm/libs/draco/gltf',name),dest);}}
}

/** Make sure the files for an asset are on disk; returns its path relative to ASSET_DIR. */
export async function ensureAsset(entry,res='1k'){
 if(entry.src==='url'){await download(entry.url,join(ASSET_DIR,entry.file));await dracoDecoder();return entry.file;}
 if(entry.src==='three'){const file=join(ASSET_DIR,entry.file);await download(THREE_BASE+entry.file.split('/').pop(),file);return entry.file;}
 const rel=`ph/${entry.ph}/${entry.ph}_${res}.gltf`,main=join(ASSET_DIR,rel);
 if(await exists(main))return rel;
 const info=await (await fetch(`https://api.polyhaven.com/files/${entry.ph}`,{signal:AbortSignal.timeout(60000)})).json();
 const g=info?.gltf?.[res]?.gltf??info?.gltf?.['2k']?.gltf;if(!g)throw new Error(`no glTF for ${entry.ph}`);
 for(const [path,f] of Object.entries(g.include??{}))await download(f.url,join(ASSET_DIR,'ph',entry.ph,path));
 await download(g.url,main);
 return rel;
}

/** All assets a spec needs (plus the human rigs + clip sources when people appear). */
export async function assetsForSpec(spec){
 const ids=new Set(),profileAssets=new Set();
 const bodies=new Set(['human-xbot']);const PROFILES=new Map([
  ...['human-male','anatomical-man','male-body','male-figure','man-anatomical'].map(id=>[id,'human-male']),
  ...['human-female','anatomical-woman','female-body','female-figure','woman-anatomical'].map(id=>[id,'human-female']),
 ]);const HUMAN=/^(human|person|man|woman|child|people|scientist|engineer|worker|student|human-body)$/i;
 const isHuman=id=>HUMAN.test(id)||PROFILES.has(id);
 for(const s of spec.scenes??[])for(const o of s.objects??[]){
  const model=norm(o.model);ids.add(model);if(!isHuman(model))continue;
  const custom=parseBodySource(o.params?.bodySource,o.params?.body);if(custom)continue;
  const profile=PROFILES.get(model),body=String(o.params?.body??'').toLowerCase();if(profile)profileAssets.add(profile);
  if(profile&&!body&&String(o.params?.mesh??'anatomical')==='anatomical')continue;
  const figure=String(o.params?.figure??(profile==='human-female'||/woman/i.test(model)?'woman':'man')).toLowerCase();
  if(figure!=='mannequin')bodies.add(body?`human-${body}`:figure==='woman'?'human-megan':'human-brian');
 }
 const out=await prepareHumanBodies(spec,ASSET_DIR);
 for(const id of profileAssets){
  const rel=`humans/${id}.glb`;await mkdir(join(ASSET_DIR,'humans'),{recursive:true});
  await copyStable(join(ROOT,'src/acryllex/assets',rel),join(ASSET_DIR,rel));out[id]=rel;
 }
 // imported exact meshes: model "mesh" with params.url (https .glb) or params.file (local .glb)
 for(const s of spec.scenes??[])for(const o of s.objects??[]){
  if(/^(hand-mesh|rigged-hand|source-hand)$/i.test(String(o.model))){
   const side=String(o.params?.side??'right'),source=String(o.params?.source??'anatomical');
   if(!['right','left'].includes(side))throw new Error('hand-mesh side must be right or left');
   if(!['anatomical','xr'].includes(source))throw new Error('hand-mesh source must be anatomical or xr');
   const anatomical=source==='anatomical',rel=`hands/${anatomical?'anatomical-right':side}.glb`;
   await mkdir(join(ASSET_DIR,'hands'),{recursive:true});await copyStable(join(ROOT,'src/acryllex/assets',rel),join(ASSET_DIR,rel));out['hand-mesh:'+(anatomical?'anatomical':side)]=rel;
  }
  if(/^(head-mesh|portrait|face-mesh|human-face|human-head)$/i.test(String(o.model))){
   const source=headSource(o.params);
   if(source.kind==='scan'){
    await mkdir(dirname(join(ASSET_DIR,source.file)),{recursive:true});
    await copyStable(join(ROOT,'src/acryllex/assets',source.file),join(ASSET_DIR,source.file));out[source.key]=source.file;
   }else{const e=await findAsset(source.key);if(!e)throw new Error('head-mesh source is not in the library');out[e.id]=await ensureAsset(e);}
  }
  if(!/^(mesh|glb|gltf|import|scan|custom-model)$/i.test(String(o.model)))continue;
  if(o.params?.objaverse!==undefined&&(o.params.url!==undefined||o.params.file!==undefined))throw new Error('mesh: objaverse replaces url/file; select one source');
  const src=o.params?.objaverse!==undefined?objaverseSource(o.params.objaverse):String(o.params?.url??o.params?.file??'');if(!src)throw new Error('mesh requires a verified file, URL or Objaverse UID');
  if(o.params?.objaverse!==undefined){const prepared=await prepareObjaverseMesh(o.params.objaverse,ASSET_DIR,{expectedSHA256:o.params.expectedSHA256});out[`mesh:${src}`]=await prepareImportedMesh(prepared.file,ASSET_DIR,prepared.record.sha256);}
  else out[`mesh:${src}`]=await prepareImportedMesh(src,ASSET_DIR,o.params?.expectedSHA256);
  // Imported packed meshes may carry KTX2 textures. Ordinary scenes need no decoder preparation.
  for(const name of ['basis_transcoder.js','basis_transcoder.wasm']){
   const dest=join(ASSET_DIR,'basis',name);if(!await exists(dest)){await mkdir(dirname(dest),{recursive:true});await copyStable(join(ROOT,'node_modules/three/examples/jsm/libs/basis',name),dest);}
  }
 }
 Object.assign(out,await prepareFootage(spec,ASSET_DIR));
 for(const id of ids){
  if(isHuman(id)){for(const h of bodies){const e=await findAsset(h);if(e)out[e.id]=await ensureAsset(e);}continue;}
  const e=await findAsset(id);if(e)out[e.id]=await ensureAsset(e);
 }
 Object.assign(out,await prepareFluidCaches(spec,ASSET_DIR));
 Object.assign(out,await prepareRecordedMotions(spec,ASSET_DIR));
 return out;
}
