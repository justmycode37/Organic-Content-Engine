// Real 3D assets for ACRYLLEX: Poly Haven CC0 photoscans (downloaded on demand) + rigged/animated glTFs.
import {access,mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {extname,resolve} from 'node:path';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareFluidCaches} from './cache-assets.mjs';
import {prepareFootage} from './media-assets.mjs';

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
 if(entry.src==='url'){await download(entry.url,join(ASSET_DIR,entry.file));return entry.file;}
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
 const bodies=new Set(['human-xbot']);const PROFILES=new Map([
  ...['human-male','anatomical-man','male-body','male-figure','man-anatomical'].map(id=>[id,'human-male']),
  ...['human-female','anatomical-woman','female-body','female-figure','woman-anatomical'].map(id=>[id,'human-female']),
 ]);const HUMAN=/^(human|person|man|woman|child|people|scientist|engineer|worker|student|human-body)$/i;
 const isHuman=id=>HUMAN.test(id)||PROFILES.has(id);
 for(const s of spec.scenes??[])for(const o of s.objects??[]){
  const model=norm(o.model);ids.add(model);if(!isHuman(model))continue;
  const profile=PROFILES.get(model),body=String(o.params?.body??'').toLowerCase();
  if(profile&&!body&&String(o.params?.mesh??'anatomical')==='anatomical')continue;
  const figure=String(o.params?.figure??(profile==='human-female'||/woman/i.test(model)?'woman':'man')).toLowerCase();
  if(figure!=='mannequin')bodies.add(body?`human-${body}`:figure==='woman'?'human-megan':'human-brian');
 }
 const out={};
 for(const id of new Set([...ids].map(id=>PROFILES.get(id)).filter(Boolean))){
  const rel=`humans/${id}.glb`;await mkdir(join(ASSET_DIR,'humans'),{recursive:true});
  await copyFile(join(ROOT,'src/acryllex/assets',rel),join(ASSET_DIR,rel));out[id]=rel;
 }
 // imported exact meshes: model "mesh" with params.url (https .glb) or params.file (local .glb)
 for(const s of spec.scenes??[])for(const o of s.objects??[]){
  if(!/^(mesh|glb|gltf|import|scan|custom-model)$/i.test(String(o.model)))continue;
  const src=String(o.params?.url??o.params?.file??'');if(!src)continue;
  const ext=(extname(src.split('?')[0]).toLowerCase()||'.glb');if(!['.glb','.gltf'].includes(ext))throw new Error(`mesh import supports .glb/.gltf, got ${src}`);
  const rel=`import/${createHash('sha1').update(src).digest('hex').slice(0,16)}${ext}`,dest=join(ASSET_DIR,rel);
  if(!await exists(dest)){if(/^https:\/\//i.test(src))await download(src,dest);else{await mkdir(dirname(dest),{recursive:true});await copyFile(resolve(src),dest);}}
  out[`mesh:${src}`]=rel;
 }
 Object.assign(out,await prepareFootage(spec,ASSET_DIR));
 for(const id of ids){
  if(isHuman(id)){for(const h of bodies){const e=await findAsset(h);if(e)out[e.id]=await ensureAsset(e);}continue;}
  const e=await findAsset(id);if(e)out[e.id]=await ensureAsset(e);
 }
 Object.assign(out,await prepareFluidCaches(spec,ASSET_DIR));
 return out;
}
