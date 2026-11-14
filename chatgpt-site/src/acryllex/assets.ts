import * as THREE from 'three';
import {GLTFLoader,type GLTF} from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import catalogJson from './assets/catalog.json' with {type:'json'};
import {preloadMeshCaches} from './mesh-cache.ts';
import {footageVariantKey} from './media-key.ts';
import {resolveFootageParams} from './media-library.ts';
import {defineModel,type ModelDef,type ModelCtx} from './models/types.ts';

export interface AssetEntry {id:string;src:'polyhaven'|'three'|'url';url?:string;ph?:string;file?:string;name:string;tags:string[];cat?:string;desc?:string;size:number[];anim?:boolean}
export const ASSETS=(catalogJson as {assets:AssetEntry[]}).assets;
export const ASSET_BASE='http://acx.local/a/';
const GLTFS=new Map<string,GLTF>();
const RECORDED_PATHS=new Map<string,string>();
interface FootageManifest {w:number;h:number;cols:number;rows:number;fps:number;frames:number;atlases:string[];[key:string]:unknown}
interface Footage extends FootageManifest {tex:THREE.Texture[]}
const FOOTAGE=new Map<string,Footage>();
// Prepared variants may share decoded images, but never instance UV transforms.
const FOOTAGE_LOADS=new Map<string,Promise<Footage>>();
const FOOTAGE_LEGACY_MAPS=new Set<string>();

function footageManifest(value:unknown):FootageManifest{
 const m=value as FootageManifest|null;
 if(!m||typeof m!=='object'||Array.isArray(m))throw new Error('invalid manifest');
 for(const key of ['w','h','cols','rows','frames'] as const)if(!Number.isSafeInteger(m[key])||m[key]<=0)throw new Error(`invalid ${key}`);
 if(typeof m.fps!=='number'||!Number.isFinite(m.fps)||m.fps<=0)throw new Error('invalid fps');
 if(!Array.isArray(m.atlases)||!m.atlases.length||m.atlases.some(a=>typeof a!=='string'||!a.trim()))throw new Error('invalid atlases');
 const per=m.cols*m.rows,capacity=per*m.atlases.length;
 if(!Number.isSafeInteger(capacity)||!Number.isSafeInteger(m.w*m.cols)||!Number.isSafeInteger(m.h*m.rows)||m.frames>capacity)throw new Error('frame count or atlas dimensions exceed capacity');
 return m;
}

async function loadFootage(path:string,loader:THREE.TextureLoader):Promise<Footage>{
 let pending=FOOTAGE_LOADS.get(path);
 if(!pending){
  pending=(async()=>{
   const tex:THREE.Texture[]=[];
   try{
    const response=await fetch(ASSET_BASE+path);
    if(!response.ok)throw new Error(`manifest HTTP ${response.status}`);
    const man=footageManifest(await response.json());
    for(const atlas of man.atlases){
     const t=await loader.loadAsync(ASSET_BASE+atlas);tex.push(t);
     if(t.image.width!==man.w*man.cols||t.image.height!==man.h*man.rows)throw new Error(`atlas ${atlas} dimensions do not match manifest`);
     t.magFilter=THREE.NearestFilter;t.minFilter=THREE.LinearFilter;t.generateMipmaps=false;t.colorSpace=THREE.NoColorSpace;t.repeat.set(1/man.cols,1/man.rows);
    }
    return {...man,tex};
   }catch(err){for(const t of tex)t.dispose();throw new Error(`footage ${path}: ${err instanceof Error?err.message:String(err)}`);}
  })();
  FOOTAGE_LOADS.set(path,pending);
  void pending.catch(()=>{if(FOOTAGE_LOADS.get(path)===pending)FOOTAGE_LOADS.delete(path);});
 }
 return pending;
}

/** Absolute clip sampling; only tiny arithmetic noise at a frame boundary is snapped. */
export function footageFrameIndex(seconds:number,fps:number,count:number,loop=false){
 if(!Number.isFinite(seconds)||!Number.isFinite(fps)||fps<=0||!Number.isSafeInteger(count)||count<1)throw new Error('footage: invalid sample time, fps or frame count');
 if(!loop){
  if(seconds<=0)return 0;
  if(seconds>=(count-1)/fps)return count-1;
  return Math.min(count-1,Math.floor(seconds*fps+1e-7));
 }
 const duration=count/fps;
 if(!Number.isFinite(duration)||duration<=0)throw new Error('footage: invalid clip duration');
 const frame=Math.floor((seconds%duration)*fps+1e-7);
 return ((frame%count)+count)%count;
}
const norm=(s:string)=>s.toLowerCase().trim().replace(/[\s_]+/g,'-');
const BY_ID=new Map<string,AssetEntry>();for(const a of ASSETS){BY_ID.set(norm(a.id),a);if(a.ph)BY_ID.set(norm(a.ph),a);}
export function findAsset(id:string){return BY_ID.get(norm(String(id).replace(/^(ph|asset):/,'')))??null;}

/** Load the glTFs the producer prepared (map id → path under the asset base). */
export async function preloadAssets(paths:Record<string,string>){
 await preloadMeshCaches(paths,ASSET_BASE);
 const loader=new GLTFLoader();
 const tl=new THREE.TextureLoader();
 const footagePaths=Object.entries(paths).filter(([id])=>id.startsWith('footage:'));
 const loadedFootage=await Promise.all(footagePaths.map(async([id,path])=>[id,await loadFootage(path,tl)] as const));
 for(const legacy of FOOTAGE_LEGACY_MAPS)if(footagePaths.some(([id])=>id.startsWith(legacy+':[')))FOOTAGE_LEGACY_MAPS.delete(legacy);
 for(const [id,clip] of loadedFootage){
  if(footagePaths.some(([key])=>key.startsWith(id+':[')))FOOTAGE_LEGACY_MAPS.delete(id);else FOOTAGE_LEGACY_MAPS.add(id);
  FOOTAGE.set(id,clip);
 }
 await Promise.all(Object.entries(paths).filter(([id])=>!id.startsWith('footage:')&&!id.startsWith('fluid-cache:')).map(async([id,path])=>{if(GLTFS.has(id)&&(!id.startsWith('recorded-motion:')||RECORDED_PATHS.get(id)===path))return;try{const loaded=await loader.loadAsync(ASSET_BASE+path);GLTFS.set(id,loaded);if(id.startsWith('recorded-motion:'))RECORDED_PATHS.set(id,path);}catch(err){if(id.startsWith('recorded-motion:'))throw new Error(`recorded motion ${id} failed to load: ${String(err)}`);console.warn(`asset ${id} failed`,err);}}));
}
export function gltf(id:string){return GLTFS.get(id);}

const hasSourceAlpha=(src:THREE.Material|undefined)=>!!src&&(src.transparent||src.alphaTest>0||src.alphaHash);
/** Keep authored coverage separate from the scene-hue albedo. Cached source materials/textures stay read-only. */
function sourceAlphaFlags(src:THREE.MeshStandardMaterial,material:THREE.MeshStandardMaterial){
 material.alphaMap=src.alphaMap;material.alphaTest=src.alphaTest;material.opacity=src.opacity;
 material.transparent=src.transparent;material.depthWrite=src.depthWrite;material.depthTest=src.depthTest;
 material.premultipliedAlpha=src.premultipliedAlpha;material.blending=src.blending;material.forceSinglePass=src.forceSinglePass;
 // BLEND already applies fractional coverage. Opaque masks retain the existing stochastic entrance dissolve.
 if(src.transparent)material.alphaHash=src.alphaHash;
}

/** Uniform scene-hue albedo, with optional original RGBA alpha; no derived texture or source RGB contribution. */
export function plainMaterial(src:THREE.Material|undefined,ctx:ModelCtx,tone=0.95,sourceAlpha=false){
 const material=ctx.mat({tone,rough:.55}),s=src as THREE.MeshStandardMaterial|undefined;
 if(!sourceAlpha||!hasSourceAlpha(s))return material;
 sourceAlphaFlags(s!,material);
 if(s!.map){
  material.map=s!.map;
  const previous=material.onBeforeCompile,previousKey=material.customProgramCacheKey();
  material.onBeforeCompile=function(shader,renderer){
   previous.call(this,shader,renderer);
   shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP
    diffuseColor.a*=texture2D(map,vMapUv).a;
   #endif`);
  };
  material.customProgramCacheKey=()=>`${previousKey}|acx-plain-alpha-v1`;
 }
 return material;
}

/** Turn a scanned material into the ACRYLLEX look: the texture's luminance becomes surface detail in the scene hue. */
export function realMaterial(src:THREE.Material|undefined,ctx:ModelCtx,tone=0.95,detail=0.7,sourceAlpha=false){
 const s=src as THREE.MeshStandardMaterial|undefined;
 const m=ctx.mat({tone});
 if(s?.map){m.map=s.map;}
 if(s?.normalMap){m.normalMap=s.normalMap;m.normalScale=s.normalScale.clone().multiplyScalar(1.4);}
 if(s?.alphaMap)m.alphaMap=s.alphaMap;
 if(s&&s.alphaTest>0)m.alphaTest=s.alphaTest;
 m.side=s?.side??THREE.FrontSide;
 const alpha=sourceAlpha&&hasSourceAlpha(s);if(alpha)sourceAlphaFlags(s!,m);
 m.onBeforeCompile=sh=>{sh.fragmentShader=sh.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP
  vec4 acxTexel=texture2D(map,vMapUv);float acxL=dot(acxTexel.rgb,vec3(0.299,0.587,0.114));
  diffuseColor.rgb*=clamp(1.0+(acxL-0.45)*${(1.6*detail).toFixed(2)},${(1-0.75*detail).toFixed(2)},1.2);
  ${alpha?'diffuseColor.a*=acxTexel.a;':''}
 #endif`);};
 m.customProgramCacheKey=()=>`acx-real-${detail}${alpha?'-alpha-v1':''}`;
 return m;
}

/** Clone a loaded asset with ACRYLLEX materials. Source alpha is opt-in for general assets. */
export function instance(id:string,ctx:ModelCtx,tone=0.95,plain=false,detail=0.7,options:{sourceAlpha?:boolean}={}){
 const g=GLTFS.get(id);if(!g)return null;
 const root=SkeletonUtils.clone(g.scene) as THREE.Object3D;
 root.traverse(o=>{const m=o as THREE.Mesh;if(!m.isMesh)return;m.frustumCulled=false;const mats=Array.isArray(m.material)?m.material:[m.material];const conv=mats.map(x=>plain?plainMaterial(x,ctx,tone,!!options.sourceAlpha):realMaterial(x,ctx,tone,detail,!!options.sourceAlpha));m.material=Array.isArray(m.material)?conv:conv[0]!;});
 return {root,animations:g.animations};
}

/** A ModelDef for any catalogue asset (photoscans are already in metres). */
export function assetModel(entry:AssetEntry):ModelDef{
 return defineModel({id:entry.id,describe:entry.desc||entry.name,build(ctx){
  const inst=instance(entry.id,ctx,ctx.num('tone',0.95,0.2,1));
  if(!inst){const r=new THREE.Group();r.add(ctx.mesh(new THREE.BoxGeometry(0.3,0.3,0.3),{tone:0.5}));return {root:r,grounded:true};}
  const root=new THREE.Group();root.add(inst.root);
  let mixer:THREE.AnimationMixer|null=null;const clip=inst.animations[0];
  if(clip){mixer=new THREE.AnimationMixer(inst.root);mixer.clipAction(clip).play();}
  return {root,grounded:!entry.anim,update(c,t){if(mixer&&clip){mixer.setTime((t*(c.speed??1))%clip.duration);}}};
 }});
}

/** Key under which an imported mesh (params.url or params.file) is preloaded; must match scripts/acryllex/assets.mjs. */
export const meshKey=(src:string)=>`mesh:${src}`;
/**
 * ANY exact 3D model: a .glb/.gltf from a URL or a local file (scans, CAD exports, sculpts, rigged characters).
 * It is rendered through the same dot shader, so the library is as precise as the mesh you give it.
 */
export const importedMesh=defineModel({
 id:'mesh',aliases:['glb','gltf','import','scan','custom-model'],
 describe:'Any exact 3D mesh from a .glb file: params.url (https link to a .glb) or params.file (local .glb path). Scaled to params.height metres when given. Its first animation clip plays (params.clip picks one by name; control `speed`). Use for subjects that must be exact (a specific product, vehicle, animal, building, body scan).',
 params:{url:'https URL of a .glb',file:'local .glb path',height:'target height in metres (optional)',clip:'animation clip name (optional)',detail:'0..1 how much the texture shows (default 0.6)',plain:'true = ignore textures, pure shading',up:'"z" if the file is Z-up'},
 controls:{speed:'animation speed (default 1)'},defaults:{speed:1},
 build(ctx){
  const src=String(ctx.params.url??ctx.params.file??'');const inst=src?instance(meshKey(src),ctx,ctx.num('tone',0.95,0.2,1),ctx.bool('plain',false),ctx.num('detail',0.6,0,1)):null;
  if(!inst){const r=new THREE.Group();r.add(ctx.mesh(new THREE.BoxGeometry(0.3,0.3,0.3),{tone:0.5}));return {root:r,grounded:true};}
  const root=new THREE.Group(),fit=new THREE.Group();root.add(fit);fit.add(inst.root);if(String(ctx.params.up??'y').toLowerCase()==='z')inst.root.rotation.x=-Math.PI/2;
  const clip=inst.animations.find(a=>a.name===String(ctx.params.clip??''))??inst.animations[0];let mixer:THREE.AnimationMixer|null=null;
  if(clip){mixer=new THREE.AnimationMixer(inst.root);mixer.clipAction(clip).play();mixer.setTime(0);}
  fit.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(inst.root,true);const size=box.getSize(new THREE.Vector3());
  const h=ctx.num('height',0,0,1000);if(h>0&&size.y>1e-6)fit.scale.setScalar(h/size.y);
  else{const m=Math.max(size.x,size.y,size.z);if(m>50||m<0.02)fit.scale.setScalar(1/Math.max(1e-6,m));} // tame files authored in mm or km
  return {root,grounded:true,update(c,t){if(mixer&&clip)mixer.setTime((t*(c.speed??1))%clip.duration);}};
 },
});

/**
 * Footage layer: any video (stock clip, screen recording, a render from another tool) shown as dots inside the scene.
 * Brightness drives dot density. Monochrome preparation gives one ink; an alpha matte removes the background.
 */
export const footage=defineModel({
 id:'footage',aliases:['video','clip'],
 describe:'A fixed-view video played as dots on a flat screen; it does not reconstruct a new 3D viewpoint. params.file selects prepared footage, start selects seconds into that clip, timeOrigin is its scene-local playback origin, and height is metres (default2; width follows manifest w/h). For an exact camera view use object pos[0,0,0], origin:"model", and camera pos[0,0,height/(2*tan(fov/2))].',
 params:{asset:'licensed subject preset: ocean-breaker or ocean-barrel (instead of file/url)',file:'local video/image path or HTTPS URL',url:'alternative HTTPS video/image URL',crop:'W:H:X:Y',start:'seconds into the prepared clip (default0)',timeOrigin:'scene-local playback origin seconds (default0)',height:'metres (default2)',fps:'prepared frame rate (default30)',loop:'true|false',sampleScale:'source samples per output dot (1..4; library presets3); does not change output dot size',cols:'prepared frame width pixels (optional)',rows:'prepared frame height pixels (optional)',blur:'preparation blur pixels (default1.2)',monochrome:'true prepares BT709 luma for one scene ink',sourceStart:'trim source from this second before preparation',sourceDuration:'optional source trim duration seconds',preserveAspect:'true preserves source/crop aspect during preparation',alphaFile:'optional explicit alpha-mask image/video',invertAlpha:'true inverts the explicit alpha mask',mirrorX:'true mirrors image and alpha together',mirrorY:'true flips image and alpha together'},
 controls:{speed:'playback speed (default 1)'},defaults:{speed:1},
 build(ctx){
  const params=resolveFootageParams('footage',ctx.params),file=String(params.file??params.url??''),legacy=`footage:${file}`;
  if(!file.trim())throw new Error('footage: params.file is required');
  const f=FOOTAGE.get(footageVariantKey(file,params))??(FOOTAGE_LEGACY_MAPS.has(legacy)?FOOTAGE.get(legacy):undefined);
  if(!f)throw new Error(`footage ${file}: requested media variant was not preloaded`);
  const H2=ctx.num('height',2,0.05,100),root=new THREE.Group();
  const textures=f.tex.map(shared=>{const tex=shared.clone();tex.matrixAutoUpdate=false;return tex;});
  const mat=new THREE.MeshBasicMaterial({map:textures[0]!,alphaHash:true,toneMapped:false});mat.userData.tone=1;mat.userData.explicit=true;
  root.add(new THREE.Mesh(new THREE.PlaneGeometry(H2*f.w/f.h,H2),mat));
  const start=ctx.num('start',0,0,1e6),timeOrigin=ctx.num('timeOrigin',0,-1e6,1e6),loop=ctx.bool('loop',false),per=f.cols*f.rows;
  let last=-1,disposed=false;
  const dispose=()=>{if(disposed)return;disposed=true;mat.removeEventListener('dispose',dispose);mat.map=null;for(const t of textures)t.dispose();textures.length=0;};
  mat.addEventListener('dispose',dispose);
  const update=(c:Record<string,number>,t:number)=>{
   if(disposed)return;
   const speed=c.speed??1;
   if(!Number.isFinite(t)||!Number.isFinite(speed))throw new Error(`footage ${file}: playback time and speed must be finite`);
   const i=footageFrameIndex(start+(t-timeOrigin)*speed,f.fps,f.frames,loop);
   if(i===last)return;last=i;
   const tex=textures[Math.floor(i/per)]!,k=i%per;
   tex.offset.set((k%f.cols)/f.cols,1-(Math.floor(k/f.cols)+1)/f.rows);tex.updateMatrix();mat.map=tex;
  };
  update({},0);
  return {root,grounded:false,update};
 },
});

/** The same reusable media path with a documented, licensed ocean subject and a black background matte. */
export const waveFootage=defineModel({
 ...footage,id:'wave-footage',aliases:['ocean-wave-media'],
 describe:'A recognizable moving ocean breaker with sky and background removed to black. Licensed fixed-view video with single-ink density preparation. Defaults to the AI-generated ocean-breaker preset; asset ocean-barrel selects an inside view of unverified capture origin. Recommended scene light: contrast1.5, gamma1.05, blackPoint.02, whitePoint.95, exposure1.05, softness0. It cannot rotate to a new 3D viewpoint.',
 build(ctx){return footage.build({...ctx,params:{asset:'ocean-breaker',...ctx.params}});},
});
