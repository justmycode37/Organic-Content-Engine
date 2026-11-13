// Real 3D assets for ACRYLLEX: Poly Haven CC0 photoscans (downloaded on demand) + rigged/animated glTFs.
import {access,mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {extname,resolve} from 'node:path';
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
 const bodies=new Set(['human-xbot']);const HUMAN=/^(human|person|man|woman|child|people|scientist|engineer|worker|student|human-body)$/i;
 for(const s of spec.scenes??[])for(const o of s.objects??[]){ids.add(String(o.model));if(HUMAN.test(String(o.model))){const b=String(o.params?.body??'').toLowerCase(),f=String(o.params?.figure??(/woman/i.test(o.model)?'woman':'man')).toLowerCase();if(f!=='mannequin')bodies.add(b?`human-${b}`:f==='woman'?'human-megan':'human-brian');}}
 const out={};
 // imported exact meshes: model "mesh" with params.url (https .glb) or params.file (local .glb)
 for(const s of spec.scenes??[])for(const o of s.objects??[]){
  if(!/^(mesh|glb|gltf|import|scan|custom-model)$/i.test(String(o.model)))continue;
  const src=String(o.params?.url??o.params?.file??'');if(!src)continue;
  const ext=(extname(src.split('?')[0]).toLowerCase()||'.glb');if(!['.glb','.gltf'].includes(ext))throw new Error(`mesh import supports .glb/.gltf, got ${src}`);
  const rel=`import/${createHash('sha1').update(src).digest('hex').slice(0,16)}${ext}`,dest=join(ASSET_DIR,rel);
  if(!await exists(dest)){if(/^https:\/\//i.test(src))await download(src,dest);else{await mkdir(dirname(dest),{recursive:true});await copyFile(resolve(src),dest);}}
  out[`mesh:${src}`]=rel;
 }
 // footage layers: any video becomes tone atlases at dot resolution (model "footage", params.file)
 for(const s of spec.scenes??[])for(const o of s.objects??[]){
  if(!/^(footage|video|clip)$/i.test(String(o.model)))continue;
  const src=String(o.params?.file??'');if(!src)continue;
  const cell=Math.max(2,Math.round(spec.format?.cell??3)),w=Math.round(Number(o.params?.cols)||(spec.format?.width??1080)/cell),h=Math.round(Number(o.params?.rows)||(spec.format?.height??1920)/cell);
  const fps=Number(o.params?.fps)||30,crop=String(o.params?.crop??''),blur=Number(o.params?.blur??1.2);
  const key=createHash('sha1').update(JSON.stringify([src,w,h,fps,crop,blur])).digest('hex').slice(0,16),dir=join(ASSET_DIR,'import',key),man=join(dir,'manifest.json');
  if(!await exists(man)){await mkdir(dir,{recursive:true});const cols=8,rows=8;
   const vf=`${crop?`crop=${crop},`:''}${blur>0?`gblur=sigma=${blur},`:''}fps=${fps},scale=${w}:${h}:flags=area,tile=${cols}x${rows}`;
   const r=spawnSync('ffmpeg',['-v','error','-y','-i',resolve(src),'-vf',vf,'-an',join(dir,'a%03d.png')]);if(r.status!==0)throw new Error(`footage failed: ${r.stderr}`);
   const d=spawnSync('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',resolve(src)]);const dur=parseFloat(String(d.stdout))||0;
   const {readdir}=await import('node:fs/promises');const atlases=(await readdir(dir)).filter(f=>/^a\d+\.png$/.test(f)).sort();
   await writeFile(man,JSON.stringify({w,h,cols,rows,fps,frames:Math.max(1,Math.min(atlases.length*cols*rows,Math.round(dur*fps))),atlases:atlases.map(f=>`import/${key}/${f}`)}));}
  out[`footage:${src}`]=`import/${key}/manifest.json`;
 }
 for(const id of ids){
  if(HUMAN.test(id)){for(const h of bodies){const e=await findAsset(h);if(e)out[e.id]=await ensureAsset(e);}continue;}
  const e=await findAsset(id);if(e)out[e.id]=await ensureAsset(e);
 }
 return out;
}
