// Auto-sourcing: when a reel needs an object the library does not have, find a REAL model in the external
// libraries (Objaverse CC-BY/CC0, Smithsonian CC0, NASA) before anything is hand-modelled, verify it, and add it
// to the library for good. Every judgement is made by Sol (gpt-6.1-sol, xhigh) looking at pictures:
//   1. search the index → 2. Sol picks realistic candidates from thumbnails → 3. ingest at real size →
//   4. render a dithered ACRYLLEX preview in four orientations → 5. Sol accepts one orientation or rejects →
//   6. accepted models stay in the catalogue and are recorded in sourced-assets.json (re-ingestable).
import {z} from 'zod';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {searchSources} from './source-search.mjs';
import {prepareRows,upsertCatalog,removeFromCatalog,readCatalog,norm} from './asset-ingest.mjs';
import {resetAssetCatalog} from './assets.mjs';
import {stills} from './render.mjs';
import {createRequire} from 'node:module';
// long xhigh reasoning calls: no client-side header/body timeouts (same as produce.mjs)
{const {Agent,setGlobalDispatcher}=createRequire(import.meta.url)('undici');setGlobalDispatcher(new Agent({headersTimeout:0,bodyTimeout:0}));}

const ROOT=fileURLToPath(new URL('../../',import.meta.url));
export const SOURCED_FILE=join(ROOT,'scripts/acryllex/sourced-assets.json');
const ROTS=[[0,0,0],[90,0,0],[-90,0,0],[0,0,90]];

const pickSchema=z.object({picks:z.array(z.number().int()).max(3),id:z.string(),name:z.string(),metres:z.number().positive(),tags:z.array(z.string()).max(8),why:z.string()});
const verifySchema=z.object({ok:z.boolean(),variant:z.number().int().min(0).max(3),why:z.string()});

async function thumb(url){try{const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)return null;return {mime:r.headers.get('content-type')??'image/jpeg',base64:Buffer.from(await r.arrayBuffer()).toString('base64')};}catch{return null;}}
const slug=s=>norm(s).replace(/[^a-z0-9-]/g,'').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'sourced-object';

async function freeId(want,taken){let id=slug(want);if(!taken(id))return id;for(let i=2;;i++){const c=`${id}-${i}`;if(!taken(c))return c;}}

/** Find, verify and add one real model for `thing`. Returns the catalogue entry or null. */
export async function sourceOne(ask,{thing,query,as},{taken,log=()=>{},workdir}){
 const found=await searchSources(query||thing,24);
 const cands=[];for(const c of found){if(cands.length>=12)break;if(c.source==='objaverse'){const img=c.thumbnail?await thumb(c.thumbnail):null;if(!img)continue;cands.push({...c,img});}else cands.push(c);}
 if(!cands.length){log(`sourcing "${thing}": no candidates`);return null;}
 const images=cands.filter(c=>c.img).map(c=>c.img);
 const list=cands.map((c,i)=>`${i}: [${c.source}] "${c.name}"${c.category?` (category ${c.category})`:''}${c.img?` — image #${cands.slice(0,i).filter(x=>x.img).length+1}`:' — museum/agency scan, no picture'}`).join('\n');
 const raw=await ask('asset-pick',`You choose 3D models for ACRYLLEX, an explainer channel that renders REAL objects as dithered dots. We need: "${thing}".\nCandidates (images are attached in order for those that have one):\n${list}\nPick up to 3 candidate numbers, best first, that are REALISTIC (photoscan / museum / engineering quality, real proportions; never cartoon, toy, low-poly, stylised, fan-art or game-character models) and show exactly "${thing}" as ONE object (no ground slab, room, scene, colour chart, text or several unrelated objects). Prefer museum/agency scans when they match. Empty picks if none qualifies.\nAlso give: id (short kebab-case library id for this object), name (plain English), metres (real longest dimension of the real object), tags (3-8 search words), why.\nReturn JSON only.`,2000,{name:'pick',schema:pickSchema},images);
 let pick;try{pick=pickSchema.parse(JSON.parse(raw));}catch{log(`sourcing "${thing}": pick output invalid`);return null;}
 if(!pick.picks.length){log(`sourcing "${thing}": Sol found no realistic candidate (${pick.why})`);return null;}
 for(const idx of pick.picks){
  const c=cands[idx];if(!c)continue;
  const id=await freeId(as||pick.id,taken);
  const row={id,name:pick.name,metres:pick.metres,tags:pick.tags,url:c.url,source:c.source==='objaverse'?'Objaverse / Sketchfab':c.source==='si'?'Smithsonian Open Access 3D':'NASA 3D Resources',license:c.source==='objaverse'?`${c.license}, by ${c.author}`:c.license,page:c.page,cat:'Sourced'};
  const [entry]=await prepareRows([row],{log});if(!entry)continue;
  await upsertCatalog([entry]);resetAssetCatalog();
  try{
  // dithered preview: the four orientation variants, each seen three-quarter and from the side
  const scenes=[],labels=[];
  for(const [v,rot] of ROTS.entries())for(const angle of ['three-quarter','side']){scenes.push({say:id,hue:'blue',duration:1,camera:{angle,fill:0.8,move:'static'},objects:[{id:'m',model:id,enter:'none',idle:'none',rot}]});labels.push(`variant ${v} ${angle}`);}
  const dir=workdir??join(ROOT,'.acryllex-cache','sourcing');await mkdir(dir,{recursive:true});
  const sheet=join(dir,`preview-${id}.png`);
  try{await stills({version:1,series:'ACRYLLEX',title:'sourcing',captions:false,scenes},sheet,scenes.map((_,i)=>i+0.5),0.22,labels,4);}
  catch(err){log(`sourcing "${thing}": preview failed (${err.message})`);await removeFromCatalog([id]);resetAssetCatalog();continue;}
  const vraw=await ask('asset-verify',`This is our dithered ACRYLLEX render of a candidate 3D model for "${thing}" in four orientation variants (rows: variant 0..3; columns: three-quarter view, side view). Accept only if a stranger would instantly recognise "${thing}" and it looks like the REAL thing (realistic proportions and detail, not a toy/cartoon), it is a single clean object (no ground slab, scene, broken or missing geometry), and one variant stands the way the real thing normally stands (upright, wheels/feet/base down). Return ok, the best variant number, and why. JSON only.`,1500,{name:'verify',schema:verifySchema},[{mime:'image/png',base64:(await readFile(sheet)).toString('base64')}]);
  let verdict;try{verdict=verifySchema.parse(JSON.parse(vraw));}catch{verdict={ok:false,variant:0,why:'invalid verify output'};}
  if(!verdict.ok){log(`sourcing "${thing}": rejected ${c.name} (${verdict.why})`);await removeFromCatalog([id]);resetAssetCatalog();continue;}
  const rot=ROTS[verdict.variant];const finalRow={...row,...(rot.some(Boolean)?{rot}:{}),cat:'Realistic'};
  const [final]=await prepareRows([finalRow],{log});if(!final){await removeFromCatalog([id]);resetAssetCatalog();continue;}
  await upsertCatalog([final]);resetAssetCatalog();
  const rec=JSON.parse(await readFile(SOURCED_FILE,'utf8').catch(()=>'[]'));rec.push({...finalRow,thing,sourcedAt:new Date().toISOString(),preview:sheet});await writeFile(SOURCED_FILE,JSON.stringify(rec,null,1));
  log(`sourcing "${thing}": added ${id} from ${c.source} "${c.name}" (variant ${verdict.variant}; ${verdict.why})`);
  return final;
  }catch(err){await removeFromCatalog([id]);resetAssetCatalog();throw err;}
 }
 return null;
}

/** Source several things; returns {added:[entries], mapping:{thing|as → id}}. */
export async function sourceAssets(ask,needs,{log=()=>{},workdir,hasModel=()=>false}={}){
 // provisional entries left by an interrupted earlier run are never kept
 {const stale=(await readCatalog()).assets.filter(a=>a.cat==='Sourced').map(a=>a.id);if(stale.length){await removeFromCatalog(stale);resetAssetCatalog();}}
 const cat=await readCatalog();const ids=new Set(cat.assets.flatMap(a=>[a.id,a.ph].filter(Boolean).map(norm)));
 const {loadCatalog}=await import('./catalog.mjs');const lib=await loadCatalog();
 const taken=id=>ids.has(norm(id))||lib.has(id)||hasModel(id);
 const added=[],mapping={};
 for(const need of needs.slice(0,10)){
  try{const e=await sourceOne(ask,need,{taken,log,workdir});if(e){added.push(e);ids.add(norm(e.id));mapping[need.as??need.thing]=e.id;}}
  catch(err){log(`sourcing "${need.thing}" failed: ${err.message}`);}
 }
 return {added,mapping};
}
