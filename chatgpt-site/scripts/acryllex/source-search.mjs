// Search index over external libraries of REAL 3D models, used before anything is hand-modelled:
//   Objaverse (Sketchfab; only CC-BY 4.0 / CC0, with LVIS category labels), Smithsonian Open Access 3D (CC0),
//   NASA 3D Resources. The index is built once into .acryllex-cache/sources/ (Objaverse metadata ≈ 600 MB download).
//   node scripts/acryllex/source-search.mjs build
//   node scripts/acryllex/source-search.mjs "fire truck" [n]
import {createWriteStream} from 'node:fs';
import {access,mkdir,readFile,writeFile} from 'node:fs/promises';
import {gunzipSync,gzipSync} from 'node:zlib';
import {join} from 'node:path';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
import {fileURLToPath} from 'node:url';

const ROOT=fileURLToPath(new URL('../../',import.meta.url));
export const SOURCE_DIR=join(ROOT,'.acryllex-cache','sources');
const INDEX=join(SOURCE_DIR,'index.json.gz');
const HF='https://huggingface.co/datasets/allenai/objaverse/resolve/main/';
const exists=p=>access(p).then(()=>true,()=>false);
async function download(url,file){if(await exists(file))return;const r=await fetch(url);if(!r.ok)throw new Error(`download ${r.status}: ${url}`);await pipeline(Readable.fromWeb(r.body),createWriteStream(file));}
async function pool(items,n,fn){let i=0;await Promise.all(Array.from({length:n},async()=>{while(i<items.length)await fn(items[i++]);}));}

/** Realistic-looking vs. stylised wording (used for ranking only; Sol makes the final call from pictures). */
export const REAL=/photogrammetr|\bscan|scanned|realistic|photoreal|\bpbr\b|high.?poly|detailed|lifelike|anatom|museum|specimen/i;
export const STYLISED=/low.?poly|cartoon|stylized|stylised|\btoon|voxel|cute|chibi|minecraft|anime|kawaii|pixel|lego|\btoy\b|funko|\bkid|roblox|fortnite|pokemon|fan.?art|mascot|nsfw|sexy|hentai/i;

export async function buildIndex({log=console.log}={}){
 await mkdir(join(SOURCE_DIR,'objaverse-meta'),{recursive:true});
 await download(HF+'lvis-annotations.json.gz',join(SOURCE_DIR,'lvis.json.gz'));
 await download(HF+'object-paths.json.gz',join(SOURCE_DIR,'object-paths.json.gz'));
 const chunks=Array.from({length:160},(_,i)=>`000-${String(i).padStart(3,'0')}`);
 log('objaverse metadata: downloading missing chunks');
 await pool(chunks,12,c=>download(`${HF}metadata/${c}.json.gz`,join(SOURCE_DIR,'objaverse-meta',`${c}.json.gz`)));
 const lvis=JSON.parse(gunzipSync(await readFile(join(SOURCE_DIR,'lvis.json.gz'))));const catOf=new Map();for(const [c,us] of Object.entries(lvis))for(const u of us)catOf.set(u,c);
 const paths=JSON.parse(gunzipSync(await readFile(join(SOURCE_DIR,'object-paths.json.gz'))));
 const rows=[];
 for(const c of chunks){
  const meta=JSON.parse(gunzipSync(await readFile(join(SOURCE_DIR,'objaverse-meta',`${c}.json.gz`))));
  for(const [u,m] of Object.entries(meta)){
   if(!['by','cc0'].includes(m.license)||m.isAgeRestricted||!paths[u])continue;
   if(!(m.faceCount>=2000&&m.faceCount<=1200000))continue;if((m.archives?.glb?.size??0)>80e6)continue;
   const th=(m.thumbnails?.images??[]).filter(i=>i.width>=400).sort((a,b)=>a.width-b.width)[0]?.url;
   rows.push({s:'o',u,n:m.name??'',t:(m.tags??[]).map(t=>t.name).join(' '),c:catOf.get(u)??'',l:m.license,a:m.user?.username??'',p:m.viewerUrl??'',f:m.faceCount,k:m.likeCount??0,v:m.viewCount??0,sp:m.staffpickedAt?1:0,th,path:paths[u]});
  }
 }
 log(`objaverse: ${rows.length} CC-BY/CC0 candidates`);
 // Smithsonian Open Access 3D (CC0)
 const si=new Map();
 for(let start=0;;start+=1000){const r=await (await fetch(`https://3d-api.si.edu/api/v1.0/content/file/search?q=&file_type=glb&rows=1000&start=${start}`)).json();const list=r.rows??[];if(!list.length)break;
  for(const x of list){if(!['Medium','Low'].includes(x.content.quality))continue;const k=x.content.model_url,prev=si.get(k);if(!prev||x.content.quality==='Medium')si.set(k,x);}}
 for(const x of si.values())rows.push({s:'si',n:x.title.replace(/<[^>]+>/g,''),t:'',c:'',l:'cc0',a:'Smithsonian',p:`https://3d.si.edu/object/3d/${x.content.model_url.split(':')[1]}`,url:x.content.uri});
 log(`smithsonian: ${si.size} packages`);
 // NASA 3D Resources
 const tree=await (await fetch('https://api.github.com/repos/nasa/NASA-3D-Resources/git/trees/master?recursive=1')).json();
 for(const t of tree.tree??[])if(/\.glb$/i.test(t.path)&&t.path.startsWith('3D Models/')){const name=t.path.split('/').pop().replace(/\.glb$/i,'');
  rows.push({s:'nasa',n:name,t:t.path.split('/')[1],c:'',l:'nasa',a:'NASA',p:'https://github.com/nasa/NASA-3D-Resources',url:`https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/${t.path.split('/').map(encodeURIComponent).join('/')}`,size:t.size});}
 await writeFile(INDEX,gzipSync(JSON.stringify(rows)));
 log(`index: ${rows.length} entries → ${INDEX}`);
 cached=null;return rows.length;
}

let cached;
async function index(){if(!cached){if(!await exists(INDEX))throw new Error('external source index missing: run node scripts/acryllex/source-search.mjs build');cached=JSON.parse(gunzipSync(await readFile(INDEX)));}return cached;}

const words=s=>String(s).toLowerCase().replace(/\([^)]*\)/g,' ').split(/[^a-z0-9]+/).filter(w=>w.length>1);
const stem=w=>w.length>4&&w.endsWith('es')&&!w.endsWith('ses')?w.slice(0,-2):w.length>3&&w.endsWith('s')&&!w.endsWith('ss')?w.slice(0,-1):w;
const STOP=new Set(['the','of','and','with','for','a','an','model','3d','real','realistic']);

/** Ranked candidates for a plain-language query ("fire truck", "honey bee"). */
export async function searchSources(query,n=20){
 const q=[...new Set(words(query).map(stem).filter(w=>!STOP.has(w)))];if(!q.length)return [];
 const out=[];
 for(const r of await index()){
  const name=words(r.n).map(stem),tags=words(r.t).map(stem),cat=words(r.c.replace(/_/g,' ')).map(stem);
  let hit=0,score=0;
  for(const w of q){const inN=name.includes(w),inC=cat.includes(w),inT=tags.includes(w);if(inN||inC||inT)hit++;score+=(inN?3:0)+(inC?4:0)+(inT?1.5:0);}
  if(hit<Math.max(1,Math.ceil(q.length*0.6)))continue;
  const text=`${r.n} ${r.t}`;
  if(r.s==='o'){if(STYLISED.test(text))continue;score+=(REAL.test(text)?3:0)+Math.log1p(r.k)*0.6+Math.log1p(r.v)*0.15+r.sp;}
  else score+=4;// museum / agency scans of the real object
  score+=hit===q.length?4:0;
  out.push({...r,score:+score.toFixed(2)});
 }
 return out.sort((a,b)=>b.score-a.score).slice(0,n).map(r=>({
  source:r.s==='o'?'objaverse':r.s,name:r.n,score:r.score,category:r.c||undefined,thumbnail:r.th,page:r.p,
  url:r.s==='o'?HF+r.path:r.url,license:r.l==='cc0'?'CC0':r.l==='by'?'CC-BY 4.0':r.l==='nasa'?'NASA media (no copyright; no endorsement)':r.l,
  author:r.a,faces:r.f,likes:r.k,key:r.s==='o'?r.u:r.url}));
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const [cmd,n]=process.argv.slice(2);
 if(cmd==='build')await buildIndex();
 else if(cmd)console.log((await searchSources(cmd,Number(n)||12)).map(c=>`${c.score}\t${c.source}\t${c.name}\t${c.category??''}\t${c.license}\t${c.page}`).join('\n'));
 else throw new Error('Usage: source-search.mjs build | "<query>" [n]');
}
