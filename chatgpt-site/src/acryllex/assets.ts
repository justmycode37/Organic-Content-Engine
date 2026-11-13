import * as THREE from 'three';
import {GLTFLoader,type GLTF} from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import catalogJson from './assets/catalog.json' with {type:'json'};
import {defineModel,type ModelDef,type ModelCtx} from './models/types.ts';

export interface AssetEntry {id:string;src:'polyhaven'|'three'|'url';url?:string;ph?:string;file?:string;name:string;tags:string[];cat?:string;desc?:string;size:number[];anim?:boolean}
export const ASSETS=(catalogJson as {assets:AssetEntry[]}).assets;
export const ASSET_BASE='http://acx.local/a/';
const GLTFS=new Map<string,GLTF>();
interface Footage {w:number;h:number;cols:number;rows:number;fps:number;frames:number;tex:THREE.Texture[]}
const FOOTAGE=new Map<string,Footage>();
const norm=(s:string)=>s.toLowerCase().trim().replace(/[\s_]+/g,'-');
const BY_ID=new Map<string,AssetEntry>();for(const a of ASSETS){BY_ID.set(norm(a.id),a);if(a.ph)BY_ID.set(norm(a.ph),a);}
export function findAsset(id:string){return BY_ID.get(norm(String(id).replace(/^(ph|asset):/,'')))??null;}

/** Load the glTFs the producer prepared (map id → path under the asset base). */
export async function preloadAssets(paths:Record<string,string>){
 const loader=new GLTFLoader();
 const tl=new THREE.TextureLoader();
 for(const [id,path] of Object.entries(paths)){if(!id.startsWith('footage:')||FOOTAGE.has(id))continue;
  try{const man=await (await fetch(ASSET_BASE+path)).json() as Omit<Footage,'tex'>&{atlases:string[]};
   const tex=await Promise.all(man.atlases.map(async a=>{const t=await tl.loadAsync(ASSET_BASE+a);t.magFilter=THREE.NearestFilter;t.minFilter=THREE.LinearFilter;t.generateMipmaps=false;t.colorSpace=THREE.NoColorSpace;t.repeat.set(1/man.cols,1/man.rows);return t;}));
   FOOTAGE.set(id,{...man,tex});}catch(err){console.warn(`footage ${id} failed`,err);}}
 await Promise.all(Object.entries(paths).filter(([id])=>!id.startsWith('footage:')).map(async([id,path])=>{if(GLTFS.has(id))return;try{GLTFS.set(id,await loader.loadAsync(ASSET_BASE+path));}catch(err){console.warn(`asset ${id} failed`,err);}}));
}
export function gltf(id:string){return GLTFS.get(id);}

/** Turn a scanned material into the ACRYLLEX look: the texture's luminance becomes surface detail in the scene hue. */
export function realMaterial(src:THREE.Material|undefined,ctx:ModelCtx,tone=0.95,detail=0.7){
 const s=src as THREE.MeshStandardMaterial|undefined;
 const m=ctx.mat({tone});
 if(s?.map){m.map=s.map;}
 if(s?.normalMap){m.normalMap=s.normalMap;m.normalScale=s.normalScale.clone().multiplyScalar(1.4);}
 if(s?.alphaMap)m.alphaMap=s.alphaMap;
 if(s&&s.alphaTest>0)m.alphaTest=s.alphaTest;
 m.side=s?.side??THREE.FrontSide;
 m.onBeforeCompile=sh=>{sh.fragmentShader=sh.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP
  vec4 acxTexel=texture2D(map,vMapUv);float acxL=dot(acxTexel.rgb,vec3(0.299,0.587,0.114));
  diffuseColor.rgb*=clamp(1.0+(acxL-0.45)*${(1.6*detail).toFixed(2)},${(1-0.75*detail).toFixed(2)},1.2);
 #endif`);};
 m.customProgramCacheKey=()=>`acx-real-${detail}`;
 return m;
}

/** Clone a loaded asset with ACRYLLEX materials. */
export function instance(id:string,ctx:ModelCtx,tone=0.95,plain=false,detail=0.7){
 const g=GLTFS.get(id);if(!g)return null;
 const root=SkeletonUtils.clone(g.scene) as THREE.Object3D;
 root.traverse(o=>{const m=o as THREE.Mesh;if(!m.isMesh)return;m.frustumCulled=false;const mats=Array.isArray(m.material)?m.material:[m.material];const conv=mats.map(x=>plain?ctx.mat({tone,rough:0.55}):realMaterial(x,ctx,tone,detail));m.material=Array.isArray(m.material)?conv:conv[0]!;});
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
 * The picture's brightness drives dot density and its own colours are kept, so real-world motion is reproduced exactly.
 */
export const footage=defineModel({
 id:'footage',aliases:['video','clip'],
 describe:'A video file played as dots on a flat screen in the scene: params.file (local video), params.crop ("W:H:X:Y" in source pixels), params.start seconds into the clip, params.height metres (default 2; width follows the frame aspect). Fills the frame exactly with camera pos [0,0,height/(2*tan(fov/2))]. Use for subjects that must move exactly like real footage (waves, crowds, animals, people).',
 params:{file:'local video path',crop:'W:H:X:Y',start:'seconds offset',height:'metres (default 2)',fps:'frame rate (default 30)',loop:'true|false'},
 controls:{speed:'playback speed (default 1)'},defaults:{speed:1},
 build(ctx){
  const f=FOOTAGE.get(`footage:${String(ctx.params.file??'')}`);const H2=ctx.num('height',2,0.05,100);const root=new THREE.Group();
  if(!f){root.add(ctx.mesh(new THREE.PlaneGeometry(H2,H2),{tone:0.2}));return {root,grounded:false};}
  const mat=new THREE.MeshBasicMaterial({map:f.tex[0]!,alphaHash:true,toneMapped:false});mat.userData.tone=1;mat.userData.explicit=true;
  root.add(new THREE.Mesh(new THREE.PlaneGeometry(H2*f.w/f.h,H2),mat));
  const start=ctx.num('start',0,0,1e6),loop=ctx.bool('loop',false),per=f.cols*f.rows;
  return {root,grounded:false,update(c,t){
   let i=Math.floor((start+t*(c.speed??1))*f.fps+1e-3);i=loop?((i%f.frames)+f.frames)%f.frames:Math.max(0,Math.min(f.frames-1,i));
   const tex=f.tex[Math.min(f.tex.length-1,Math.floor(i/per))]!;const k=i%per;tex.offset.set((k%f.cols)/f.cols,1-(Math.floor(k/f.cols)+1)/f.rows);mat.map=tex;}};
 },
});
