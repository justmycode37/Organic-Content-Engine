// Real 3D assets for ACRYLLEX: Poly Haven CC0 photoscans (downloaded on demand) + rigged/animated glTFs.
import {access,mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=fileURLToPath(new URL('../../',import.meta.url));
export const ASSET_DIR=join(ROOT,'.acryllex-assets');
const exists=p=>access(p).then(()=>true,()=>false);
const THREE_BASE='https://raw.githubusercontent.com/mrdoob/three.js/r170/examples/models/gltf/';

let catalog;
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

/** Make sure the files for an asset are on disk; returns its path relative to ASSET_DIR. */
export async function ensureAsset(entry,res='1k'){
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
 const ids=new Set();
 for(const s of spec.scenes??[])for(const o of s.objects??[])ids.add(String(o.model));
 const out={};
 for(const id of ids){
  if(/^(human|person|man|woman|child|people|scientist|engineer|worker|student)$/i.test(id)){for(const h of ['human-xbot','human-michelle','human-soldier']){const e=await findAsset(h);out[e.id]=await ensureAsset(e);}continue;}
  const e=await findAsset(id);if(e)out[e.id]=await ensureAsset(e);
 }
 return out;
}
