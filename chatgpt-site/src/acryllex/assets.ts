import * as THREE from 'three';
import {clamp} from './kit.ts';
import {GLTFLoader,type GLTF} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {DRACOLoader} from 'three/examples/jsm/loaders/DRACOLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import catalogJson from './assets/catalog.json' with {type:'json'};
import {preloadMeshCaches} from './mesh-cache.ts';
import {inspectHumanBodyGLB} from './human-body-source.ts';
import {footageVariantKey} from './media-key.ts';
import {resolveFootageParams} from './media-library.ts';
import {applyFootageLevels} from './footage-levels.ts';
import {objaverseSource} from './objaverse-source.ts';
import {legacyDiffusePlugin} from './legacy-gltf.ts';
import {referenceDefaults,REFERENCE_IMAGES,REFERENCE_VIDEOS} from './reference-media.ts';
import {defineModel,type ModelDef,type ModelCtx} from './models/types.ts';

export interface AssetEntry {id:string;src:'polyhaven'|'three'|'url';url?:string;ph?:string;file?:string;name:string;tags:string[];cat?:string;desc?:string;size:number[];anim?:boolean;/** source units → metres */scale?:number;/** orientation fix, degrees XYZ */rot?:number[];source?:string;license?:string;page?:string}
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
export async function preloadAssets(paths:Record<string,string>,renderer?:THREE.WebGLRenderer){
 await preloadMeshCaches(paths,ASSET_BASE);
 const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).register(legacyDiffusePlugin);
 const draco=Object.keys(paths).some(id=>findAsset(id)?.src==='url')?new DRACOLoader().setDecoderPath(ASSET_BASE+'draco/'):null;
 if(draco)loader.setDRACOLoader(draco);
 const tl=new THREE.TextureLoader();
 const footagePaths=Object.entries(paths).filter(([id])=>id.startsWith('footage:'));
 const loadedFootage=await Promise.all(footagePaths.map(async([id,path])=>[id,await loadFootage(path,tl)] as const));
 for(const legacy of FOOTAGE_LEGACY_MAPS)if(footagePaths.some(([id])=>id.startsWith(legacy+':[')))FOOTAGE_LEGACY_MAPS.delete(legacy);
 for(const [id,clip] of loadedFootage){
  if(footagePaths.some(([key])=>key.startsWith(id+':[')))FOOTAGE_LEGACY_MAPS.delete(id);else FOOTAGE_LEGACY_MAPS.add(id);
  FOOTAGE.set(id,clip);
 }
 const ktx=renderer?new (await import('three/examples/jsm/loaders/KTX2Loader.js')).KTX2Loader().setTranscoderPath(ASSET_BASE+'basis/').detectSupport(renderer):null;
 if(ktx)loader.setKTX2Loader(ktx);
 try{await Promise.all(Object.entries(paths).filter(([id])=>!id.startsWith('footage:')&&!id.startsWith('fluid-cache:')).map(async([id,path])=>{const custom=id.startsWith('human-body:');if(GLTFS.has(id)&&RECORDED_PATHS.get(id)===path)return;try{let loaded:GLTF;if(custom){const response=await fetch(ASSET_BASE+path);if(!response.ok)throw new Error(`HTTP ${response.status}`);const bytes=await response.arrayBuffer();inspectHumanBodyGLB(new Uint8Array(bytes));loaded=await loader.parseAsync(bytes,ASSET_BASE);}else loaded=await loader.loadAsync(ASSET_BASE+path);GLTFS.set(id,loaded);RECORDED_PATHS.set(id,path);}catch(err){if(custom)throw new Error(`bodySource: ${id} failed to load: ${String(err)}`);if(id.startsWith('recorded-motion:'))throw new Error(`recorded motion ${id} failed to load: ${String(err)}`);throw new Error(`asset ${id} failed to load: ${String(err)}`,{cause:err});}}));}finally{ktx?.dispose();draco?.dispose();}
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

/** Neutral scene-hue surface; selected materials may opt into their original scalar albedo. */
export function plainMaterial(src:THREE.Material|undefined,ctx:ModelCtx,tone=0.95,sourceAlpha=false,sourceAlbedo=0){
 if(!Number.isFinite(sourceAlbedo)||sourceAlbedo<0||sourceAlbedo>1)throw new Error('source material albedo strength must be 0..1');
 const material=ctx.mat({tone,rough:.62}),s=src as THREE.MeshStandardMaterial|undefined;
 // Preserve captured surface relief without importing photographic colour or baked lighting.
 if(s?.normalMap){material.normalMap=s.normalMap;material.normalScale.copy(s.normalScale);material.normalMapType=s.normalMapType;}
 if(s?.bumpMap){material.bumpMap=s.bumpMap;material.bumpScale=s.bumpScale;}
 const alpha=sourceAlpha&&hasSourceAlpha(s);
 const factor=sourceAlbedo&&s?.color?s.color.r*.2126+s.color.g*.7152+s.color.b*.0722:1;
 if(!Number.isFinite(factor))throw new Error('source material albedo must be finite');
 if(alpha)sourceAlphaFlags(s!,material);
 if(sourceAlbedo||s?.map&&alpha){
  if(s?.map)material.map=s.map;
  const previous=material.onBeforeCompile,previousKey=material.customProgramCacheKey();
  material.onBeforeCompile=function(shader,renderer){
   previous.call(this,shader,renderer);
   shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',sourceAlbedo?`
    float acxSourceAlbedo=${clamp(factor).toFixed(8)};
    #ifdef USE_MAP
     vec4 acxSourceTexel=texture2D(map,vMapUv);
     acxSourceAlbedo*=dot(acxSourceTexel.rgb,vec3(.2126,.7152,.0722));
     ${alpha?'diffuseColor.a*=acxSourceTexel.a;':''}
    #endif
    diffuseColor.rgb*=mix(1.,clamp(acxSourceAlbedo,0.,1.),${sourceAlbedo.toFixed(8)});
   `:`#ifdef USE_MAP
    diffuseColor.a*=texture2D(map,vMapUv).a;
   #endif`);
  };
  material.customProgramCacheKey=()=>sourceAlbedo?`${previousKey}|acx-neutral-albedo-v1:${clamp(factor).toFixed(8)}:${sourceAlbedo.toFixed(8)}:${alpha?1:0}`:`${previousKey}|acx-plain-alpha-v1`;
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

/** Match explicit hair surface tags, without interpreting eyelashes or arbitrary substrings as hair. */
const hairTag=(name:string)=>/^hair(?:mat(?:erial)?)?$/i.test(name)||/(?:^|[\s_:.-])hair(?:$|[\s_:.-])/i.test(name);
const isSourceHair=(meshName:string,materialName:string)=>!/eyelash/i.test(meshName+' '+materialName)&&(hairTag(meshName)||hairTag(materialName));

/** Clone a loaded asset with ACRYLLEX materials. Source alpha and named hair sidedness are independent opt-ins. */
export function instance(id:string,ctx:ModelCtx,tone=0.95,plain=false,detail=0.7,options:{sourceAlpha?:boolean;sourceHairSide?:boolean;sourceAlbedo?:Readonly<Record<string,number>>}={}){
 const g=GLTFS.get(id);if(!g)return null;
 const selected=sourceAlbedoValues(options.sourceAlbedo);
 if([...selected.values()].some(v=>v>0)&&!plain)throw new Error('sourceAlbedo requires the neutral plain material');
 if(selected.size){const names=new Set<string>();g.scene.traverse(o=>{const m=o as THREE.Mesh;if(m.isMesh)for(const material of Array.isArray(m.material)?m.material:[m.material])names.add(material.name);});for(const name of selected.keys())if(!names.has(name))throw new Error('sourceAlbedo material '+JSON.stringify(name)+' is missing');}
 const root=SkeletonUtils.clone(g.scene) as THREE.Object3D;
 root.traverse(o=>{const m=o as THREE.Mesh;if(!m.isMesh)return;m.frustumCulled=false;const mats=Array.isArray(m.material)?m.material:[m.material];const conv=mats.map(x=>{const material=plain?plainMaterial(x,ctx,tone,!!options.sourceAlpha,selected.get(x.name)??0):realMaterial(x,ctx,tone,detail,!!options.sourceAlpha);material.userData.acryllexSourceMaterial=x.name;if(options.sourceHairSide&&isSourceHair(m.name,x.name))material.side=x.side;return material;});m.material=Array.isArray(m.material)?conv:conv[0]!;});
 return {root,animations:g.animations};
}

function sourceAlbedoValues(value:unknown):Map<string,number>{
 if(value===undefined)return new Map();
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('sourceAlbedo must map exact source material names to strengths 0..1');
 const entries=Object.entries(value);
 if(entries.some(([name,strength])=>!name.trim()||typeof strength!=='number'||!Number.isFinite(strength)||strength<0||strength>1))throw new Error('sourceAlbedo must map exact source material names to strengths 0..1');
 return new Map(entries);
}

/** A ModelDef for any catalogue asset (photoscans are already in metres). */
export function assetModel(entry:AssetEntry):ModelDef{
 return defineModel({id:entry.id,describe:entry.desc||entry.name,build(ctx){
  const inst=instance(entry.id,ctx,ctx.num('tone',0.72,0.2,1),!ctx.bool('textured',false),ctx.num('detail',.2,0,1));
  if(!inst)throw new Error('Required source mesh was not preloaded');
  const root=new THREE.Group();root.add(inst.root);
  if(entry.scale)inst.root.scale.multiplyScalar(entry.scale);
  if(entry.rot)inst.root.rotation.set(...(entry.rot.map(v=>v*Math.PI/180) as [number,number,number]));
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
 describe:'Any exact 3D mesh from a .glb file: params.url (https link to a .glb) or params.file (local .glb path). Scaled to params.height metres when given. Its source animation plays once and holds (clips:all synchronizes facial/head/eye tracks; clip picks an exact name; loop is explicit). Uses the library neutral surface by default; source colour/light does not become density. Existing source blendshapes are addressable as morph:<name>. Use for subjects that must be exact (a specific product, vehicle, animal, building, body scan).',
 params:{url:'https URL of a .glb',file:'local .glb path',objaverse:'verified 32-character Objaverse UID, instead of url/file; source licence, creator, hash, geometry and actual rig/clip names are retained during preparation',height:'target height in metres (optional)',clip:'animation clip name (optional)',clips:'all plays synchronized source clips together (e.g. face, eyes and head); or an array of exact clip names',loop:'false (default) holds the last source pose; true loops when appropriate',detail:'0..1 optional source texture luminance, only with plain:false; default .2',plain:'true (default) uses library surface/lighting; false opts into source luminance textures',sourceAlbedo:'optional {exactSourceMaterialName:strength0to1}; selected source RGB becomes scalar reflectance in the scene hue, retaining pupil/hair markings under shared lights. Other materials stay neutral. Use only reviewed source albedo; baked lighting in a texture is not removed',sourceAlpha:'true (default) preserves source cutout/blended coverage independently of photographic RGB',sourceHairSide:'true (default) retains authored sidedness on tagged hair; false opts out',sourceRotation:'optional [x,y,z] degrees to correct the source orientation before height measurement; composes after up conversion and preserves source transforms',up:'"z" if the file is Z-up'},
 controls:{speed:'animation speed (default 1)','morph:<name>':'0..1 source-authored blendshape; exact existing name or final dotted suffix only'},defaults:{speed:1},
 build(ctx){
  if(ctx.params.objaverse!==undefined&&(ctx.params.url!==undefined||ctx.params.file!==undefined))throw new Error('mesh: objaverse replaces url/file; select one source');
  const selected=Object.fromEntries(sourceAlbedoValues(ctx.params.sourceAlbedo));
  const src=ctx.params.objaverse!==undefined?objaverseSource(ctx.params.objaverse):String(ctx.params.url??ctx.params.file??'');const inst=src?instance(meshKey(src),ctx,ctx.num('tone',0.72,0.2,1),ctx.bool('plain',true),ctx.num('detail',0.2,0,1),{sourceAlpha:ctx.bool('sourceAlpha',true),sourceHairSide:ctx.bool('sourceHairSide',true),sourceAlbedo:selected}):null;
  if(!inst)throw new Error('Required source mesh was not preloaded');
  const root=new THREE.Group(),fit=new THREE.Group(),orientation=new THREE.Group();root.add(fit);fit.add(orientation);orientation.add(inst.root);
  const rotation=ctx.params.sourceRotation;
  if(rotation!==undefined){if(!Array.isArray(rotation)||rotation.length!==3||rotation.some(v=>typeof v!=='number'||!Number.isFinite(v)))throw new Error('mesh: sourceRotation must be three finite degrees');orientation.rotation.set(...rotation.map(v=>v*Math.PI/180) as [number,number,number]);}
  if(String(ctx.params.up??'y').toLowerCase()==='z')orientation.rotateX(-Math.PI/2);
  const requested=ctx.params.clips??ctx.params.clip;
  const clips=requested==='all'?inst.animations:requested===undefined?inst.animations.slice(0,1):inst.animations.filter(a=>(Array.isArray(requested)?requested:[requested]).includes(a.name));
  if(requested!==undefined&&requested!=='all'&&clips.length!==(Array.isArray(requested)?requested.length:1))throw new Error('mesh: requested animation clip is missing');
  const mixer=clips.length?new THREE.AnimationMixer(inst.root):null,loop=ctx.bool('loop',false),actions=clips.map(clip=>{const action=mixer!.clipAction(clip);action.setLoop(loop?THREE.LoopRepeat:THREE.LoopOnce,loop?Infinity:1);action.clampWhenFinished=!loop;action.play();return action;});
  const duration=Math.max(0,...clips.map(c=>c.duration));
  if(mixer)mixer.setTime(0);
  fit.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(inst.root,true);const size=box.getSize(new THREE.Vector3());
  const h=ctx.num('height',0,0,1000);if(h>0&&size.y>1e-6)fit.scale.setScalar(h/size.y);
  else{const m=Math.max(size.x,size.y,size.z);if(m>50||m<0.02)fit.scale.setScalar(1/Math.max(1e-6,m));} // tame files authored in mm or km
  const targets=new Map<string,{mesh:THREE.Mesh;index:number}[]>(),morphRest=new Map<THREE.Mesh,number[]>();
  inst.root.traverse(object=>{const mesh=object as THREE.Mesh;if(!mesh.morphTargetDictionary)return;morphRest.set(mesh,[...(mesh.morphTargetInfluences??[])]);for(const [name,index]of Object.entries(mesh.morphTargetDictionary))for(const key of new Set([name,name.split('.').at(-1)!])){const list=targets.get(key)??[];list.push({mesh,index});targets.set(key,list);}});
  return {root,grounded:true,update(c,t){
   // Overrides are absolute controls. Untracked targets must return to their
   // authored neutral values when absent, including after reverse seeking.
   for(const [mesh,rest]of morphRest)for(let i=0;i<rest.length;i++)mesh.morphTargetInfluences![i]=rest[i]!;
   if(mixer){const elapsed=t*(c.speed??1),sample=loop&&duration>0?((elapsed%duration)+duration)%duration:clamp(elapsed,0,duration);for(const action of actions)action.reset().play();mixer.setTime(sample);}
   for(const [control,value]of Object.entries(c))if(control.startsWith('morph:')){if(!Number.isFinite(value))throw new Error('mesh: '+control+' must be finite');const list=targets.get(control.slice(6));if(!list)throw new Error('mesh: source morph target '+control.slice(6)+' is missing');for(const {mesh,index}of list)mesh.morphTargetInfluences![index]=Math.max(0,Math.min(1,value));}
  }};
 },
});

/**
 * Footage layer: any video (stock clip, screen recording, a render from another tool) shown as dots inside the scene.
 * Brightness drives dot density. Monochrome preparation gives one ink; an alpha matte removes the background.
 */
export const footage=defineModel({
 id:'footage',aliases:['video','clip'],
 describe:'A fixed-view video played as dots on a flat screen; it does not reconstruct a new 3D viewpoint. params.file selects prepared footage, start selects seconds into that clip, timeOrigin is its scene-local playback origin, and height is metres (default2; width follows manifest w/h). For an exact camera view use object pos[0,0,0], origin:"model", and camera pos[0,0,height/(2*tan(fov/2))].',
 params:{asset:'named subject preset from the media catalogue (instead of file/url)',file:'local video/image path or HTTPS URL',url:'alternative HTTPS video/image URL',crop:'W:H:X:Y',start:'seconds into the prepared clip (default0)',timeOrigin:'scene-local playback origin seconds (default0)',height:'metres (default2)',fps:'prepared frame rate (default30)',loop:'true|false',sampleScale:'source samples per output dot (1..4; library presets3); does not change output dot size',cols:'prepared frame width pixels (optional)',rows:'prepared frame height pixels (optional)',blur:'preparation blur pixels (default1.2)',monochrome:'true prepares BT709 luma for one scene ink',sourceStart:'trim source from this second before preparation',sourceDuration:'optional source trim duration seconds',preserveAspect:'true preserves source/crop aspect during preparation',alphaFile:'optional explicit alpha-mask image/video',invertAlpha:'true inverts the explicit alpha mask',mirrorX:'true mirrors image and alpha together',mirrorY:'true flips image and alpha together',sourceLevels:'optional instance-only {blackPoint:0,whitePoint:1}; 0<=blackPoint<whitePoint<=1. Maps source intensity before shared dot rendering; leaves alpha, prepared atlas, scene lighting and ink unchanged'},
 controls:{speed:'playback speed (default 1)'},defaults:{speed:1},
 build(ctx){
  const params=resolveFootageParams('footage',ctx.params),file=String(params.file??params.url??''),legacy=`footage:${file}`;
  if(!file.trim())throw new Error('footage: params.file is required');
  const f=FOOTAGE.get(footageVariantKey(file,params))??(FOOTAGE_LEGACY_MAPS.has(legacy)?FOOTAGE.get(legacy):undefined);
  if(!f)throw new Error(`footage ${file}: requested media variant was not preloaded`);
  const H2=ctx.num('height',2,0.05,100),root=new THREE.Group();
  const transfer=params.sourceTransfer??'linear';
  if(transfer!=='linear'&&transfer!=='srgb')throw new Error('footage sourceTransfer must be linear or srgb');
  // A camera image contains display-encoded values. Decode them before the shared lighting/density curve;
  // otherwise a 50% photo midtone acts like 50% scene radiance and fills far too many dots.
  const textures=f.tex.map(shared=>{const tex=shared.clone();tex.matrixAutoUpdate=false;tex.colorSpace=transfer==='srgb'?THREE.SRGBColorSpace:THREE.NoColorSpace;return tex;});
  const mat=new THREE.MeshBasicMaterial({map:textures[0]!,alphaHash:true,toneMapped:false});mat.userData.tone=1;mat.userData.explicit=true;
  applyFootageLevels(mat,params.sourceLevels);
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

/** High-detail fixed-view sources. Geometry is photographic; the shared ink/dither style stays intact. */
export const referenceImage=defineModel({
 ...footage,id:'reference-image',aliases:REFERENCE_IMAGES.slice(1),
 describe:'A real photograph or rendered reference of ANY subject, retaining exact silhouette, anatomy, material detail and source lighting through the existing scene ink and dot grid. Use for a whole face, hand, spoon or glass when no verified 3D asset exists. It is one captured view, not a poseable model. Supply file/url or a library asset; default sharp 3x source samples, original aspect and BT709 luminance. Animate reveals, in-plane movement or a gentle camera push; use reference-video for action.',
 params:{...footage.params,backgroundKey:'explicit uniform source backdrop key {color:#RRGGBB, similarity:.01...2, blend:0...2}; not automatic segmentation',reference:'independent real-image comparison source, not evidence that a still is animated'},
 build(ctx){return footage.build({...ctx,params:referenceDefaults(ctx.params)});},
});
export const referenceVideo=defineModel({
 ...footage,id:'reference-video',aliases:REFERENCE_VIDEOS.slice(1),
 describe:'Reference-backed moving subject: filmed action or an externally rendered/verified clip, sampled deterministically through the unchanged pixel style. Use for hand gripping, face expressions, stirring and moving water. Motion and viewpoint must already exist in the source; no invented poses or rotation. file/url or named media asset; sharp supersampling and preserved aspect by default. Keep provenance and capture origin.',
 build(ctx){return footage.build({...ctx,params:referenceDefaults(ctx.params)});},
});

/** The same reusable media path with a documented, licensed ocean subject and a black background matte. */
export const waveFootage=defineModel({
 ...footage,id:'wave-footage',aliases:['ocean-wave-media'],
 describe:'A recognizable moving ocean breaker with sky and background removed to black. Licensed fixed-view video with single-ink density preparation. Defaults to the AI-generated ocean-breaker preset; asset ocean-barrel selects an inside view of unverified capture origin. Recommended scene light: contrast1.5, gamma1.05, blackPoint.02, whitePoint.95, exposure1.05, softness0. It cannot rotate to a new 3D viewpoint.',
 build(ctx){return footage.build({...ctx,params:{asset:'ocean-breaker',...ctx.params}});},
});

/** Prerecorded human actions share the footage renderer and its instance-owned texture transforms. */
export const humanMaleFootage=defineModel({
 ...footage,id:'human-male-footage',aliases:['human-footage','man-footage'],
 describe:'A fixed-view prerecorded AI-generated adult male (Kling AI) walking, sitting and typing, rendered with source alpha and the shared dot shader. Defaults to human-male-motion; params.asset selects another library preset. The camera view and action sequence are baked in: it cannot rotate to a new 3D viewpoint or accept new poses. Use human-male for a poseable 3D figure.',
 build(ctx){return footage.build({...ctx,params:{...ctx.params,asset:ctx.params.asset??'human-male-motion'}});},
});
export const humanFemaleFootage=defineModel({
 ...footage,id:'human-female-footage',aliases:['woman-footage'],
 describe:'A fixed-view prerecorded AI-generated adult female (Kling AI) walking, sitting and typing, rendered with source alpha and the shared dot shader. Defaults to human-female-motion; params.asset selects another library preset. The camera view and action sequence are baked in: it cannot rotate to a new 3D viewpoint or accept new poses. Use human-female for a poseable 3D figure.',
 build(ctx){return footage.build({...ctx,params:{...ctx.params,asset:ctx.params.asset??'human-female-motion'}});},
});
