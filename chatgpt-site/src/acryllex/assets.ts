import * as THREE from 'three';
import {GLTFLoader,type GLTF} from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import catalogJson from './assets/catalog.json' with {type:'json'};
import {defineModel,type ModelDef,type ModelCtx} from './models/types.ts';

export interface AssetEntry {id:string;src:'polyhaven'|'three';ph?:string;file?:string;name:string;tags:string[];cat?:string;desc?:string;size:number[];anim?:boolean}
export const ASSETS=(catalogJson as {assets:AssetEntry[]}).assets;
export const ASSET_BASE='http://acx.local/a/';
const GLTFS=new Map<string,GLTF>();
const norm=(s:string)=>s.toLowerCase().trim().replace(/[\s_]+/g,'-');
const BY_ID=new Map<string,AssetEntry>();for(const a of ASSETS){BY_ID.set(norm(a.id),a);if(a.ph)BY_ID.set(norm(a.ph),a);}
export function findAsset(id:string){return BY_ID.get(norm(String(id).replace(/^(ph|asset):/,'')))??null;}

/** Load the glTFs the producer prepared (map id → path under the asset base). */
export async function preloadAssets(paths:Record<string,string>){
 const loader=new GLTFLoader();
 await Promise.all(Object.entries(paths).map(async([id,path])=>{if(GLTFS.has(id))return;try{GLTFS.set(id,await loader.loadAsync(ASSET_BASE+path));}catch(err){console.warn(`asset ${id} failed`,err);}}));
}
export function gltf(id:string){return GLTFS.get(id);}

/** Turn a scanned material into the ACRYLLEX look: the texture's luminance becomes surface detail in the scene hue. */
export function realMaterial(src:THREE.Material|undefined,ctx:ModelCtx,tone=0.95,detail=1){
 const s=src as THREE.MeshStandardMaterial|undefined;
 const m=ctx.mat({tone});
 if(s?.map){m.map=s.map;}
 if(s?.normalMap){m.normalMap=s.normalMap;m.normalScale=s.normalScale.clone().multiplyScalar(1.4);}
 if(s?.alphaMap)m.alphaMap=s.alphaMap;
 if(s&&(s.alphaTest>0||s.transparent))m.alphaTest=Math.max(0.35,s.alphaTest);
 m.side=s?.side??THREE.FrontSide;
 m.onBeforeCompile=sh=>{sh.fragmentShader=sh.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP
  vec4 acxTexel=texture2D(map,vMapUv);float acxL=dot(acxTexel.rgb,vec3(0.299,0.587,0.114));
  diffuseColor.rgb*=clamp(0.28+acxL*${(1.5*detail).toFixed(2)},0.,1.15);diffuseColor.a*=acxTexel.a;
 #endif`);};
 m.customProgramCacheKey=()=>`acx-real-${detail}`;
 return m;
}

/** Clone a loaded asset with ACRYLLEX materials. */
export function instance(id:string,ctx:ModelCtx,tone=0.95){
 const g=GLTFS.get(id);if(!g)return null;
 const root=SkeletonUtils.clone(g.scene) as THREE.Object3D;
 root.traverse(o=>{const m=o as THREE.Mesh;if(!m.isMesh)return;m.frustumCulled=false;const mats=Array.isArray(m.material)?m.material:[m.material];const conv=mats.map(x=>realMaterial(x,ctx,tone));m.material=Array.isArray(m.material)?conv:conv[0]!;});
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
