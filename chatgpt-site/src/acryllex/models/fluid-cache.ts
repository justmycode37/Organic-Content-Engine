import * as THREE from 'three';
import {fluidCacheKey,getMeshCache,meshCacheFrameIndex,type CacheBounds} from '../mesh-cache.ts';
import {defineModel,type Built,type ModelCtx} from './types.ts';
import {createWaterMaterial} from './water-material.ts';

export interface FluidCacheBuilt extends Built {dispose():void;getFrameIndex():number}
function setBounds(box:THREE.Box3,value:CacheBounds|null){if(value)box.set(new THREE.Vector3(...value.slice(0,3) as [number,number,number]),new THREE.Vector3(...value.slice(3) as [number,number,number]));else box.makeEmpty();}
/** Array capacity stays constant for WebGL; active count also keeps precise Box3 traversal off unused tails. */
function activeAttribute(array:Float32Array|Uint32Array,itemSize:number,count:()=>number){
 const a=new THREE.BufferAttribute(array,itemSize);Object.defineProperty(a,'count',{get:count,configurable:true});a.setUsage(THREE.DynamicDrawUsage);return a;
}
export function buildFluidCache(ctx:ModelCtx):FluidCacheBuilt{
 const src=String(ctx.params.file??'');if(!src)throw new Error('fluid-cache requires params.file (local manifest.json)');
 const cache=getMeshCache(fluidCacheKey(src));if(!cache)throw new Error(`fluid-cache was not preloaded: ${src}`);
 const root=new THREE.Group();root.name='fluid-cache';root.userData.fluidCache={file:src,frames:cache.frames.length,bounds:cache.bounds};
 const geometry=new THREE.BufferGeometry();let vertices=0,indexCount=0;
 const positions=activeAttribute(new Float32Array(cache.maxVertices*3),3,()=>vertices),normals=activeAttribute(new Float32Array(cache.maxVertices*3),3,()=>vertices),indices=activeAttribute(new Uint32Array(cache.maxIndices),1,()=>indexCount);
 geometry.setAttribute('position',positions);geometry.setAttribute('normal',normals);geometry.setIndex(indices);geometry.setDrawRange(0,0);geometry.boundingBox=new THREE.Box3();geometry.boundingSphere=new THREE.Sphere();
 const optics=ctx.str('material','opaque',['opaque','water'])==='water'?createWaterMaterial({roughness:ctx.num('roughness',.06,.02,1),ior:ctx.num('ior',1.333,1,2.333),transmission:ctx.num('transmission',1,0,1),thickness:ctx.num('thickness',.75,0,100),attenuationDistance:ctx.num('attenuationDistance',6,.001,1e6),environmentIntensity:ctx.num('environmentIntensity',1,0,20),rippleAmplitude:ctx.num('rippleAmplitude',.002,0,.1),rippleFrequency:ctx.num('rippleFrequency',35,.01,500)}):null;
 const material=optics?.material??ctx.mat({tone:ctx.num('tone',.9,0,1),rough:ctx.num('roughness',.3,.02,1)});if(!optics)material.metalness=ctx.num('metalness',0,0,1);material.side=ctx.bool('doubleSided',false)?THREE.DoubleSide:THREE.FrontSide;
 const surface=new THREE.Mesh(geometry,material);surface.name='cached-liquid-surface';surface.visible=false;root.add(surface);
 let foam:THREE.InstancedMesh|null=null;
 if(cache.maxFoam&&ctx.bool('foam',true)){
  foam=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),ctx.mat({tone:ctx.num('foamTone',1,0,1),rough:ctx.num('foamRoughness',.7,.02,1)}),cache.maxFoam);
  foam.name='cached-fluid-foam';foam.count=0;foam.instanceMatrix.setUsage(THREE.DynamicDrawUsage);foam.boundingBox=new THREE.Box3();foam.boundingSphere=new THREE.Sphere();root.add(foam);
 }
 const fps=ctx.num('fps',cache.fps,.1,240),start=ctx.num('start',0,-1e6,1e6),speed=ctx.num('speed',1,-100,100),origin=ctx.num('timeOrigin',0,0,1e6),loop=ctx.bool('loop',false),matrix=new THREE.Matrix4();
 let frameIndex=-1,disposed=false;
 const update=(controls:Record<string,number>,t:number)=>{
  if(disposed)throw new Error('fluid-cache instance has been disposed');
  // Optical animation samples absolute scene time even when geometry holds the same cached frame.
  // The engine applies explicit object shadow flags after this update.
  if(optics){optics.update(t);surface.castShadow=optics.shadowPolicy.castShadow;surface.receiveShadow=optics.shadowPolicy.receiveShadow;if(foam){foam.castShadow=true;foam.receiveShadow=true;}}
  const rate=Number.isFinite(controls.speed)?controls.speed!:1,time=start+Math.max(0,t-origin)*speed*rate,index=meshCacheFrameIndex(time,fps,cache.frames.length,loop);
  if(index===frameIndex)return;const frame=cache.frames[index]!;frameIndex=index;vertices=frame.positions.length/3;indexCount=frame.indices.length;
  positions.array.set(frame.positions);normals.array.set(frame.normals);indices.array.set(frame.indices);geometry.setDrawRange(0,indexCount);surface.visible=indexCount>0;
  if(vertices){for(const a of [positions,normals]){a.clearUpdateRanges();a.addUpdateRange(0,vertices*3);a.needsUpdate=true;}indices.clearUpdateRanges();indices.addUpdateRange(0,indexCount);indices.needsUpdate=true;}
  setBounds(geometry.boundingBox!,frame.meshBounds);if(frame.meshBounds)geometry.boundingBox!.getBoundingSphere(geometry.boundingSphere!);else geometry.boundingSphere!.set(new THREE.Vector3(),0);
  if(foam){
   foam.count=frame.foam.length/4;foam.visible=foam.count>0;
   for(let i=0;i<foam.count;i++){const k=i*4,r=frame.foam[k+3]!;matrix.makeScale(r,r,r);matrix.setPosition(frame.foam[k]!,frame.foam[k+1]!,frame.foam[k+2]!);foam.setMatrixAt(i,matrix);}
   if(foam.count){foam.instanceMatrix.clearUpdateRanges();foam.instanceMatrix.addUpdateRange(0,foam.count*16);foam.instanceMatrix.needsUpdate=true;}
   setBounds(foam.boundingBox!,frame.foamBounds);if(frame.foamBounds)foam.boundingBox!.getBoundingSphere(foam.boundingSphere!);else foam.boundingSphere!.set(new THREE.Vector3(),0);
  }
 };
 update({speed:1},0);
 return {root,grounded:false,update,getFrameIndex:()=>frameIndex,dispose(){if(disposed)return;disposed=true;geometry.dispose();if(optics)optics.dispose();else material.dispose();if(foam){foam.dispose();foam.geometry.dispose();(foam.material as THREE.Material).dispose();}root.clear();}};
}
export const fluidCache=defineModel({
 id:'fluid-cache',aliases:['liquid-cache','cached-fluid'],
 describe:'Actual baked liquid simulation as changing three-dimensional mesh topology, with cached three-dimensional foam spheres. params.file names a locally prepared ACF1 manifest; geometry/normals/foam come from the simulation, never footage or images. Use origin:"model" and an explicit camera for simulations whose first frame is empty.',
 params:{file:'local acryllex-fluid-cache-v1 manifest.json',fps:'optional playback FPS override (otherwise manifest fps)',start:'seconds into the cache at playback start (default0)',speed:'signed playback rate (default1)',timeOrigin:'scene-local seconds at which playback begins (default0)',loop:'false clamps at cache ends; true loops (defaultfalse)',material:'opaque (default) or opt-in water dielectric optics with owned neutral procedural sky; foam stays opaque',tone:'opaque liquid density/albedo0..1 (default.9; unused for water)',roughness:'liquid roughness.02..1 (default.3 opaque, .06 water)',metalness:'opaque liquid metalness0..1 (default0; water is dielectric)',ior:'water refraction index1..2.333 (default1.333)',transmission:'water screen-space transmission0..1 (default1); clear body omits opaque hard shadow, foam still casts',thickness:'water optical thickness in authored metres0..100 (default.75)',attenuationDistance:'water neutral absorption distance in metres (default6)',environmentIntensity:'water neutral procedural sky strength0..20 (default1)',rippleAmplitude:'water world-space normal relief in metres0..0.1 (default.002); geometry unchanged',rippleFrequency:'water world-space normal frequency.01..500 (default35)',doubleSided:'render both triangle sides (defaultfalse)',foam:'render actual cached foam instances (defaulttrue)',foamTone:'foam density/albedo0..1 (default1)',foamRoughness:'foam roughness.02..1 (default.7)'},
 controls:{speed:'absolute-time playback multiplier; zero samples start, negative reverses (default1)'},defaults:{speed:1},size:'cache-authored metres',build:buildFluidCache,
});
