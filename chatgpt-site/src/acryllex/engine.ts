import * as THREE from 'three';
import {MeshSurfaceSampler} from 'three/examples/jsm/math/MeshSurfaceSampler.js';
import {HUES,resolveAt,sceneDuration,type AcryllexSpec,type Scene,type SceneObject,type SceneEvent,type CameraMove,type Hue,type Vec3} from './spec.ts';
import {findModel} from './models/index.ts';
import type {Built,ModelCtx,PoseState,ModelDef} from './models/types.ts';
import {clamp,lerp,ease,deg,rng,seedOf,smooth,type MatOpts} from './kit.ts';
import {drawText,drawCaptions,textEnd,type TextCtx} from './text.ts';
import {ambientOcclusionGLSL} from './ao.ts';
import {ditherThresholdGLSL} from './dither.ts';
import {sampleObjectTrack,sampleLightTrack,interpolate} from './keyframes.ts';
import {densify,fxUniforms,patchMaterial,fxPose,fxSurface,fxReveal,resetReveal,morphPose,morphSurface,FX_DUR,REVEAL_DUR,DENSE_FX,type FxTrack,type FxUniforms} from './effects.ts';

THREE.ColorManagement.enabled=false;

import {W,H,CELL,COLS,ROWS,SS,setFormat} from './format.ts';
export {W,H} from './format.ts';
const VFOV=36;
const TRANSITION=0.4;
/** three.js lights are physical (Lambert = albedo/pi): scale so key 1 on a facing white surface = full density. */
const PI_L=Math.PI;
/** Look calibration (spec.look overrides). */
export const LOOK={contrast:1.35,blackPoint:0,whitePoint:1,inkLo:0.42,shadows:1,ao:1,gamma:0.85,noise:0.06,gap:0,ink:1,fuzz:0.06,dotRoundness:0,dotSoftness:0,key:1.0,fill:0.1,rim:0.3,ambient:0.07,dir:[1.2,1.0,0.75] as number[]};

const hueColor=(h?:string,palette:Partial<Record<Hue,string>>={})=>{if(!h)return new THREE.Color(palette.white??HUES.white);const hex=(palette as Record<string,string>)[h]??(HUES as Record<string,string>)[h]??h;try{return new THREE.Color(hex);}catch{return new THREE.Color(HUES.white);}};

// ---------------------------------------------------------------- dither post shader
const POST_VERT=`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const POST_FRAG=(aoMethod:'plane'|'legacy')=>`
precision highp float;
uniform sampler2D tA;uniform sampler2D tB;uniform sampler2D tDepth;uniform float cNear;uniform float cFar;uniform float tanHalf;uniform float aoR;uniform float aoStr;uniform float mixP;uniform int mode;uniform vec2 res;uniform float cell;uniform float time;uniform float boost;uniform float gam;uniform float noiseAmt;uniform float gap;uniform float ink;uniform float fuzz;uniform float inkLo;uniform float contrast;uniform float expo;
varying vec2 vUv;
uniform int fixedInk;uniform vec3 inkColor;uniform int maskMode;uniform float maskK;uniform float dotRoundness;uniform float dotSoftness;uniform float blackPoint;uniform float whitePoint;uniform float noiseReference;
float bayer8(vec2 p){ivec2 i=ivec2(mod(p,8.));int x=i.x,y=i.y,xy=x^y;int v=((xy&1)<<5)|((x&1)<<4)|((xy&2)<<2)|((x&2)<<1)|((xy&4)>>1)|((x&4)>>2);return (float(v)+0.5)/64.;}
float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
${ditherThresholdGLSL}
float mx(vec3 c){return max(c.r,max(c.g,c.b));}
float linZ(vec2 uv){float z=texture2D(tDepth,uv).x*2.-1.;return 2.*cNear*cFar/(cFar+cNear-z*(cFar-cNear));}
${ambientOcclusionGLSL(aoMethod)}
vec4 dotColor(sampler2D t,vec2 c,vec2 cuv,vec2 local,bool useAO){
 vec2 tx=1./(res/cell*3.);vec4 s=vec4(0.);for(int i=-1;i<=1;i++)for(int j=-1;j<=1;j++)s+=textureLod(t,cuv+vec2(float(i),float(j))*tx,0.);s/=9.;
 float b=mx(s.rgb);
 vec3 hue=fixedInk>0?inkColor:s.rgb/max(b,1e-4);
 if(useAO&&b>0.012&&b<1.25)b*=ambientOcclusion(cuv);
 // Map lit intensity to black/white before deriving dot coverage and ink brightness.
 b=max(0.,(b-blackPoint)/max(.0001,whitePoint-blackPoint));
 // 1-bit ordered dither on full cells: bright areas merge into solid colour, shadows become sparse Bayer grids
 float dens=pow(clamp(b*boost*expo,0.,1.),gam);
 // tone contrast around mid grey: lit faces fill in, shadow faces thin out (reference look)
 dens=clamp((dens-0.5)*contrast+0.5,0.,1.)*step(0.012,b);
 float thr=mix(bayer8(c),hash(c*0.37+11.),noiseAmt);
 if(noiseReference>=0.)thr=referenceThreshold(thr,noiseAmt,noiseReference);
 vec2 dc=abs(local-cell*0.5);
 // Sparse ink has soft dot edges; dense highlights join into a continuous surface.
 float rounding=dotRoundness*(1.-smoothstep(0.15,0.45,dens));
 float edge=mix(max(dc.x,dc.y),length(dc),rounding);
 float radius=(cell-gap)*0.5;
 float coverage=1.-smoothstep(radius-max(0.001,dotSoftness),radius+max(0.001,dotSoftness),edge);
 coverage=mix(coverage,1.,smoothstep(0.35,0.65,dens));
 bool inDot=coverage>0.;
 if(b>0.012&&dens>thr&&inDot){
  // Fixed ink shades through coverage alone; shaded mode retains the older brightness modulation.
  vec3 col=hue*ink*(fixedInk>0?1.:mix(inkLo,1.,pow(clamp(b,0.,1.),0.65)));
  if(b>1.25)col=hue*ink;
  return vec4(col,coverage);
 }
 if(!inDot)return vec4(0.);
 // halo around self-lit things
 vec4 g1=textureLod(t,cuv,4.),g2=textureLod(t,cuv,5.8);
 float glow=max(clamp((mx(g1.rgb)-0.9)/2.,0.,1.),clamp((mx(g2.rgb)-0.35)/1.4,0.,1.)*0.75);
 if(glow>0.){float h=hash(c+floor(time*9.)*0.37);if(h<glow*0.8){vec4 g=mx(g1.rgb)>mx(g2.rgb)?g1:g2;return vec4((fixedInk>0?inkColor:g.rgb/max(mx(g.rgb),1e-4))*ink,1.);}}
 // sparse point-cloud fuzz around silhouettes
 float a=textureLod(t,cuv,2.8).a;
 if(s.a<0.5&&a>0.03){float h=hash(c*1.31+floor(time*7.)*0.71);if(h<a*fuzz){vec4 g=textureLod(t,cuv,2.8);return vec4((fixedInk>0?inkColor:g.rgb/max(mx(g.rgb),1e-4))*ink*(fixedInk>0?1.:0.8),1.);}}
 return vec4(0.);
}
/** Through-black masks (1 fade, 4 blink): maskK is the visible share. */
bool masked(vec2 c,vec2 cuv){
 if(maskMode==0||maskK>=1.)return false;
 if(maskMode==4)return abs(cuv.y-.5)*2.>maskK*1.01;
 return false;
}
void main(){
 vec2 px=vec2(vUv.x,1.-vUv.y)*res;vec2 c=floor(px/cell);vec2 cuv=vec2((c.x+0.5)*cell/res.x,1.-(c.y+0.5)*cell/res.y);vec2 local=px-c*cell;
 if(masked(c,cuv)){gl_FragColor=vec4(0.,0.,0.,1.);return;}
 bool useB=false;vec2 sa=cuv,sb=cuv;
 if(mode>0){float n=hash(c*0.731+3.1);float p=1.-mixP;
  if(mode==1)useB=n<mixP;
  else if(mode==2)useB=(1.-cuv.y)*0.75+n*0.25<mixP*1.0;
  else if(mode==4){useB=cuv.x>p;sa=cuv+vec2(1.-p,0.);sb=cuv-vec2(p,0.);}
  else if(mode==6){float band=floor(c.y/7.),fr=floor(time*24.);float h=hash(vec2(band,3.7));float j=hash(vec2(band,fr));
   useB=h*.8+j*.2<mixP;float near=1.-smoothstep(0.,.22,abs(h-mixP));float off=(hash(vec2(band+9.,fr))-.5)*.16*near;sa.x+=off;sb.x+=off;}
 }
 vec4 o=useB?dotColor(tB,c,sb,local,false):dotColor(tA,c,sa,local,true);
 if(maskMode==1)o.a*=step(bayer8(c+3.),maskK*1.001)*1.;
 gl_FragColor=vec4(o.rgb*o.a,1.);
}`;

// ---------------------------------------------------------------- runtime types
interface Track {t0:number;t1:number;easing?:'linear'|'smooth'|'hold'}
interface MoveT extends Track {from:THREE.Vector3;to:THREE.Vector3}
interface NumT extends Track {from:number;to:number}
interface ColT extends Track {from:THREE.Color;to:THREE.Color}
interface FxT extends Track {kind:string;out:boolean;partner?:Obj}
interface PoseT {t:number;dur:number;name:string}

interface Obj {
 spec:SceneObject;def:ModelDef;built:Built;outer:THREE.Group;inner:THREE.Group;
 meshes:THREE.Mesh[];mats:THREE.MeshStandardMaterial[];baseColors:THREE.Color[];
 size:THREE.Vector3;center:THREE.Vector3;grounded:boolean;
 base:THREE.Vector3;baseRot:THREE.Euler;baseScale:number;
 moves:MoveT[];turns:(Track&{by:THREE.Vector3})[];scales:NumT[];controls:Map<string,NumT[]>;ctrl0:Record<string,number>;
 hues:ColT[];fx:FxT[];poses:PoseT[];yaw:{t0:number;t1:number;to:number}[];
 particles?:{mesh:THREE.InstancedMesh;target:Float32Array;scatter:Float32Array;n:number;cube:number};
 posable:boolean;
 clip:THREE.Plane;
 effects:FxTrack[];fxU:FxUniforms;fxDirty?:boolean;
}

function ctxFor(def:ModelDef,o:SceneObject,hue:THREE.Color,palette:Partial<Record<Hue,string>>):ModelCtx{
 const params=(o.params&&typeof o.params==='object'?o.params:{}) as Record<string,unknown>;
 const color=(c?:string)=>c?hueColor(c,palette):hue.clone();
 const mat=(opts:MatOpts={})=>{
  const base=opts.color instanceof THREE.Color?opts.color.clone():color(opts.color as string|undefined);
  // density comes from light x tone only: normalise the hue to full brightness (the ink colour is restored in the dither pass)
  {const mx=Math.max(base.r,base.g,base.b,1e-4);base.multiplyScalar(1/mx);}
  const m=new THREE.MeshStandardMaterial({color:base.clone().multiplyScalar(clamp(opts.tone??0.9,0.02,1)),roughness:opts.rough??0.62,metalness:0,side:opts.side??THREE.FrontSide,flatShading:!!opts.flat,alphaHash:true});
  if(opts.glow){m.emissive=base.clone();m.userData.glow=opts.glow;m.userData.glowControl=opts.glowControl??'glow';m.emissiveIntensity=opts.glow;}
  m.userData.tone=clamp(opts.tone??0.9,0.02,1);m.userData.explicit=!!opts.color;
  return m;
 };
 return {
  mat,mesh:(geo,opts,name)=>{const m=new THREE.Mesh(geo,mat(opts));if(name)m.name=name;return m;},color,params,seed:seedOf(o.id+def.id),
  num:(k,f,a=-Infinity,b=Infinity)=>{const v=Number(params[k]);return Number.isFinite(v)?clamp(v,a,b):f;},
  str:(k,f,allowed)=>{const v=String(params[k]??'').toLowerCase().trim();return (allowed?(allowed as readonly string[]).includes(v):v.length>0)?v as typeof f:f;},
  bool:(k,f)=>typeof params[k]==='boolean'?params[k] as boolean:f,
 };
}

function evalNum(list:NumT[]|undefined,t:number,init:number){let v=init;for(const k of list??[]){if(t<k.t0)break;v=t>=k.t1?k.to:lerp(k.from,k.to,interpolate((t-k.t0)/Math.max(1e-3,k.t1-k.t0),k.easing));}return v;}

// ---------------------------------------------------------------- scene runtime
class SceneRuntime {
 scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(VFOV,W/H,0.01,5000);
 objs:Obj[]=[];byId=new Map<string,Obj>();dur:number;hue:THREE.Color;
 cam:{dir:THREE.Vector3;target:THREE.Vector3;dist:number;screenY:number;move:string;amount:number;fov?:number;follow?:string};
 camEvents:(Track&{target:THREE.Vector3;dist:number;dir:THREE.Vector3;screenY:number;fov?:number})[]=[];
 frameWidth=4;pulse=0;
 key!:THREE.DirectionalLight;kdir=new THREE.Vector3(1,1,1);center=new THREE.Vector3();radius=2;
 pointLights:{light:THREE.PointLight;intensity:number;active?:[number,number];fade:number}[]=[];
 constructor(public spec:Scene,public index:number,private fixedInk=false,private palette:Partial<Record<Hue,string>>={}){
  this.dur=sceneDuration(spec);this.hue=hueColor(spec.hue??'blue',this.palette);
  this.scene.background=null;
  // Lights ride with the camera so shading reads the same from every angle.
  this.scene.add(this.camera);
  const L=spec.light??{};const kd=(Array.isArray(L.dir)?L.dir:LOOK.dir) as number[];
  const key=new THREE.DirectionalLight(0xffffff,(L.key??LOOK.key)*PI_L);this.kdir.set(kd[0]??1.2,kd[1]??1.5,kd[2]??0.8).normalize();
  // the key light lives in the world (so it can cast real shadows) but is re-aimed from the camera every frame
  this.scene.add(key);this.scene.add(key.target);this.key=key;
  key.castShadow=LOOK.shadows>0;key.shadow.mapSize.set(2048,2048);key.shadow.bias=-0.0015;
  const camTarget=new THREE.Object3D();camTarget.position.set(0,0,-10);this.camera.add(camTarget);
  const fill=new THREE.DirectionalLight(0xffffff,(L.fill??LOOK.fill)*PI_L);fill.position.set(-(kd[0]??1.2),0.2,0.8);fill.target=camTarget;this.camera.add(fill);
  const rim=new THREE.DirectionalLight(0xffffff,(L.rim??LOOK.rim)*PI_L);rim.position.set(0.6,0.9,-1.6);rim.target=camTarget;this.camera.add(rim);
  this.scene.add(new THREE.AmbientLight(0xffffff,(L.ambient??LOOK.ambient)*PI_L));
  for(const p of L.points??[]){const light=new THREE.PointLight(0xffffff,p.intensity*PI_L,p.distance??0,p.decay??2);light.position.fromArray(p.pos);this.scene.add(light);this.pointLights.push({light,intensity:light.intensity,active:p.active,fade:p.fade??.1});}
  this.build();
  this.cam={dir:new THREE.Vector3(0,0,1),target:new THREE.Vector3(),dist:5,screenY:0.5,move:'drift',amount:1};
  this.frameCamera();
  this.compileEvents();
  // scene bounds for the shadow camera; every mesh casts and receives shadows
  {const box=new THREE.Box3();this.scene.updateMatrixWorld(true);for(const o of this.objs){const b=new THREE.Box3().setFromObject(o.outer,true);if(!b.isEmpty())box.union(b);}
   if(box.isEmpty())box.set(new THREE.Vector3(-1,-1,-1),new THREE.Vector3(1,1,1));box.getCenter(this.center);this.radius=Math.max(0.2,box.getSize(new THREE.Vector3()).length()*0.6);
   const sc=this.key.shadow.camera;sc.left=-this.radius;sc.right=this.radius;sc.top=this.radius;sc.bottom=-this.radius;sc.near=0.01;sc.far=this.radius*8;sc.updateProjectionMatrix();this.key.shadow.normalBias=this.radius*0.012;
   for(const o of this.objs)for(const m of o.meshes)if(!(m.material as THREE.Material).transparent){m.castShadow=o.spec.castShadow??true;m.receiveShadow=o.spec.receiveShadow??true;}}
  if(spec.ground){const g=new THREE.Mesh(new THREE.PlaneGeometry(400,400),new THREE.MeshStandardMaterial({color:this.hue.clone().multiplyScalar(0.22),roughness:1}));g.rotation.x=-Math.PI/2;g.position.y=-0.001;this.scene.add(g);}
 }

 private build(){
  const list=(this.spec.objects??[]).slice(0,12);
  for(const o of list){
   if(!o||typeof o.id!=='string')continue;
   const def=findModel(String(o.model))??findModel('compose')!;
   const hue=hueColor(o.hue??this.spec.hue??'blue',this.palette);
   let built:Built;try{built=def.build(ctxFor(def,o,hue,this.palette));}catch(err){console.warn(`model ${o.model} failed`,err);built=findModel('cube')!.build(ctxFor(findModel('cube')!,o,hue,this.palette));}
   const inner=new THREE.Group(),outer=new THREE.Group(),shape=new THREE.Group();shape.add(built.root);inner.add(shape);outer.add(inner);this.scene.add(outer);
   const ctrl0:Record<string,number>={...(def.defaults??{}),...(o.controls??{})};
   if(o.stretch)shape.scale.fromArray(o.stretch);
   const posable=!!def.poses?.length;
   const pose:PoseState={from:o.pose??'stand',to:o.pose??'stand',k:1,time:0,travel:0,speed:0};
   built.root.traverse(c=>{const m=(c as THREE.Mesh).material as THREE.Material|undefined;if(m&&!Array.isArray(m))m.userData.baseOpacity=m.opacity;});
   built.update?.(ctrl0,0,pose);
   outer.updateMatrixWorld(true);
   const box=new THREE.Box3().setFromObject(built.root,true);if(box.isEmpty())box.set(new THREE.Vector3(-0.5,0,-0.5),new THREE.Vector3(0.5,1,0.5));
   const size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
   const grounded=built.grounded!==false;
   // origin:'model' keeps the model's own coordinates (explicit cameras, environments); default recentres on its bounds
   if(o.origin==='model')inner.position.set(0,0,0);else inner.position.set(-center.x,grounded?-box.min.y:-center.y,-center.z);
   const meshes:THREE.Mesh[]=[];built.root.traverse(c=>{if((c as THREE.Mesh).isMesh)meshes.push(c as THREE.Mesh);});
   const fxU=fxUniforms(),owner={};
   for(const m of meshes){if(Array.isArray(m.material))m.material=m.material.map(x=>patchMaterial(x,fxU,owner));else m.material=patchMaterial(m.material,fxU,owner);}
   const mats=[...new Set(meshes.map(m=>m.material as THREE.MeshStandardMaterial))];
   const obj:Obj={spec:o,def,built,outer,inner,meshes,mats,baseColors:mats.map(m=>m.color.clone()),size,center,grounded,base:new THREE.Vector3(),baseRot:new THREE.Euler(...((o.rot??[0,0,0]).map(v=>deg(Number(v)||0)) as [number,number,number])),baseScale:clamp(Number(o.scale)||1,0.01,500),moves:[],turns:[],scales:[],controls:new Map(),ctrl0,hues:[],fx:[],poses:[],yaw:[],posable,clip:new THREE.Plane(new THREE.Vector3(0,-1,0),0),effects:[],fxU};
   this.objs.push(obj);this.byId.set(o.id,obj);
  }
  this.place();
 }

 /** Half extents of an object in world units (after scale). */
 private ext(o:Obj){return o.size.clone().multiplyScalar(o.baseScale*0.5);}
 private bottomOf(o:Obj){return o.grounded?o.base.y:o.base.y-this.ext(o).y;}

 private placeRelative(o:Obj,ref:Obj,side:string,gap:number):THREE.Vector3{
  const e=this.ext(o),r=this.ext(ref),rc=ref.base.clone();if(ref.grounded)rc.y+=r.y;
  const out=new THREE.Vector3();
  const setBottom=(y:number)=>o.grounded?y:y+e.y;
  switch(side){
   case 'left':out.set(rc.x-r.x-gap-e.x,setBottom(this.bottomOf(ref)),rc.z);break;
   case 'right':out.set(rc.x+r.x+gap+e.x,setBottom(this.bottomOf(ref)),rc.z);break;
   case 'behind':out.set(rc.x,setBottom(this.bottomOf(ref)),rc.z-r.z-gap-e.z);break;
   case 'front':out.set(rc.x,setBottom(this.bottomOf(ref)),rc.z+r.z+gap+e.z);break;
   case 'above':out.set(rc.x,setBottom(rc.y+r.y+gap),rc.z);break;
   case 'below':out.set(rc.x,setBottom(rc.y-r.y-gap-e.y*2),rc.z);break;
   case 'in':out.copy(o.grounded?new THREE.Vector3(rc.x,this.bottomOf(ref),rc.z):rc);break;
   case 'on':default:{
    const seat=ref.built.anchors?.seat,top=ref.built.anchors?.top;
    const toWorld=(a:[number,number,number])=>{const v=new THREE.Vector3(...a).add(ref.inner.position).multiplyScalar(ref.baseScale).applyEuler(ref.baseRot);return v.add(ref.base);};
    const pose=String(o.spec.pose??'');
    if(o.posable&&seat&&/sit|type|sleep|lie|slump/.test(pose)){
     const s=toWorld(seat);const lying=/sleep|lie/.test(pose);
     o.baseRot.y=ref.baseRot.y+deg(ref.built.seatFacing??0);
     if(lying)out.set(s.x,s.y,s.z);
     else{const fwd=new THREE.Vector3(0,0,1).applyEuler(o.baseRot);out.set(s.x+fwd.x*0.16,ref.base.y,s.z+fwd.z*0.16);}
    }else if(top){const tp=toWorld(top);out.set(tp.x,setBottom(tp.y),tp.z);}
    else out.set(rc.x,setBottom(rc.y+r.y+gap*0),rc.z);
   }
  }
  return out;
 }

 private place(){
  const morphs=(this.spec.events??[]).filter(e=>e.morph&&e.target&&this.byId.has(e.morph)&&this.byId.has(e.target)&&e.morph!==e.target);
  const morphIds=new Set(morphs.map(e=>e.morph!));
  const auto=this.objs.filter(o=>!morphIds.has(o.spec.id)&&!o.spec.pos&&!(o.spec.near&&this.byId.has(o.spec.near)));
  // automatic row, left to right, grounded objects share the floor, floating objects are centred at mid height
  const widths=auto.map(o=>this.ext(o).x*2),avg=widths.reduce((a,b)=>a+b,0)/Math.max(1,widths.length);
  const gap=Math.max(0.05,avg*0.35);const total=widths.reduce((a,b)=>a+b,0)+gap*Math.max(0,auto.length-1);
  let x=-total/2;const tallest=Math.max(0,...auto.filter(o=>o.grounded).map(o=>this.ext(o).y*2));
  auto.forEach((o,i)=>{const w=widths[i]!;o.base.set(x+w/2,o.grounded?0:Math.max(this.ext(o).y,tallest*0.5),0);x+=w+gap;});
  for(const o of this.objs)if(o.spec.pos){const p=o.spec.pos.map(Number) as Vec3;o.base.set(p[0]||0,(p[1]||0)+(o.grounded||o.spec.origin!==undefined?0:this.ext(o).y),p[2]||0);}
  // relative placements, resolved in dependency order
  const pending=this.objs.filter(o=>!morphIds.has(o.spec.id)&&!o.spec.pos&&o.spec.near&&this.byId.has(o.spec.near));
  for(let pass=0;pass<4&&pending.length;pass++)for(let i=pending.length-1;i>=0;i--){const o=pending[i]!,ref=this.byId.get(o.spec.near!)!;if(pending.includes(ref)&&ref!==o)continue;o.base.copy(this.placeRelative(o,ref,o.spec.side??'right',Number(o.spec.gap)>=0&&o.spec.gap!==undefined?Number(o.spec.gap):Math.max(0.05,this.ext(ref).x*0.25)));pending.splice(i,1);}
  // morph partners take the source's place and (unless scaled explicitly) its visual size
  for(const e of morphs){const A=this.byId.get(e.target!)!,B=this.byId.get(e.morph!)!;
   if(B.spec.scale===undefined){const da=Math.max(A.size.x,A.size.y,A.size.z)*A.baseScale,db=Math.max(B.size.x,B.size.y,B.size.z);B.baseScale=da/Math.max(1e-6,db);}
   const bottom=this.bottomOf(A);if(!B.spec.pos)B.base.set(A.base.x,B.grounded?bottom:bottom+this.ext(B).y,A.base.z);}
  for(const o of this.objs){o.outer.position.copy(o.base);o.outer.rotation.copy(o.baseRot);o.outer.scale.setScalar(o.baseScale);}
 }

 /** Fit camera to a set of objects (all framed ones by default). */
 private fit(ids:Obj[],angle:CameraMove['angle'],fill:number,screenY:number){
  const box=new THREE.Box3();
  for(const o of ids){this.scene.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(o.outer,true);if(!b.isEmpty())box.union(b);}
  if(box.isEmpty())box.set(new THREE.Vector3(-1,0,-1),new THREE.Vector3(1,2,1));
  const yawPitch:Record<string,[number,number]>={front:[0,6],'three-quarter':[34,14],'three-quarter-left':[-34,14],side:[90,4],'side-left':[-90,4],top:[0,72],high:[22,34],low:[18,-6],back:[180,8]};
  const [yaw,pitch]=yawPitch[angle??'three-quarter']??yawPitch['three-quarter']!;
  const dir=new THREE.Vector3(Math.sin(deg(yaw))*Math.cos(deg(pitch)),Math.sin(deg(pitch)),Math.cos(deg(yaw))*Math.cos(deg(pitch))).normalize();
  const target=box.getCenter(new THREE.Vector3());
  const right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),dir).normalize();if(right.lengthSq()<1e-6)right.set(1,0,0);
  const up=new THREE.Vector3().crossVectors(dir,right).normalize();
  const tanV=Math.tan(deg(VFOV/2)),tanH=tanV*W/H;
  // Fit on real surface points (bounding-box corners leave empty space and frame too wide).
  const pts:THREE.Vector3[]=[];
  for(const o of ids){o.outer.updateMatrixWorld(true);for(const m of o.meshes){const pa=m.geometry.attributes.position;if(!pa)continue;const step=Math.max(1,Math.floor(pa.count/400));for(let i=0;i<pa.count;i+=step){const v=new THREE.Vector3();if((m as THREE.SkinnedMesh).isSkinnedMesh)(m as THREE.SkinnedMesh).getVertexPosition(i,v);else v.set(pa.getX(i),pa.getY(i),pa.getZ(i));pts.push(v.applyMatrix4(m.matrixWorld));}}}
  if(pts.length){const pb=new THREE.Box3().setFromPoints(pts);pb.getCenter(target);}
  if(!pts.length)for(let i=0;i<8;i++)pts.push(new THREE.Vector3(i&1?box.max.x:box.min.x,i&2?box.max.y:box.min.y,i&4?box.max.z:box.min.z));
  // centre the projected extents, then size them
  let dist=0.1;
  for(let pass=0;pass<2;pass++){
   dist=0.1;let lo=Infinity,hi=-Infinity,lo2=Infinity,hi2=-Infinity;
   for(const p of pts){const c=p.clone().sub(target);const x=c.dot(right),y=c.dot(up),f=c.dot(dir);
    dist=Math.max(dist,Math.abs(x)/(tanH*fill)+f,Math.abs(y)/(tanV*Math.min(0.66,fill*0.8))+f);}
   for(const p of pts){const c=p.clone().sub(target);const z=dist-c.dot(dir);const sx=c.dot(right)/z,sy=c.dot(up)/z;lo=Math.min(lo,sx);hi=Math.max(hi,sx);lo2=Math.min(lo2,sy);hi2=Math.max(hi2,sy);}
   const z0=dist;target.addScaledVector(right,(lo+hi)/2*z0).addScaledVector(up,(lo2+hi2)/2*z0);
  }
  if((globalThis as any).ACX_DEBUG)console.warn("fit",JSON.stringify({min:box.min,max:box.max,dist,ids:ids.map(o=>o.spec.id)}));
  return {dir,target,dist,screenY};
 }

 /** Explicit camera from pos/look (world metres), e.g. inside a tunnel. */
 private explicit(c:CameraMove|undefined,screenY:number){if(!c||!Array.isArray(c.pos)||!Array.isArray(c.look))return null;const pos=new THREE.Vector3(...(c.pos.map(Number) as Vec3)),target=new THREE.Vector3(...(c.look.map(Number) as Vec3));const d=pos.clone().sub(target);const dist=Math.max(0.01,d.length());return {dir:d.normalize(),target,dist,screenY};}
 private frameCamera(){
  const c=this.spec.camera??{};const framed=this.objs.filter(o=>o.spec.frame!==false);
  const focus=this.focusObjs(c.focus)??framed;
  const sy=clamp(Number(c.screenY)||this.defaultScreenY(),0.25,0.75);const f=this.explicit(c,sy)??this.fit(focus.length?focus:this.objs,c.angle,clamp(Number(c.fill)||0.86,0.2,1.1),sy);
  this.cam={...f,move:c.move??'drift',amount:clamp(Number(c.amount)||1,0,3),fov:clamp(Number(c.fov)||VFOV,8,120),follow:c.follow};
  const tanH=Math.tan(deg(VFOV/2))*W/H;this.frameWidth=2*tanH*f.dist;
 }
 /** Leave room for a top headline: subject sits lower when the scene has top text. */
 private defaultScreenY(){const top=(this.spec.text??[]).some(x=>x&&(x.style!=='mono'&&x.style!=='label')&&(!x.pos||String(x.pos).startsWith('top')||x.pos==='upper'));return top?0.56:0.5;}
 private focusObjs(f:CameraMove['focus']){if(!f)return undefined;const ids=Array.isArray(f)?f:[f];const list=ids.map(i=>this.byId.get(String(i))).filter((o):o is Obj=>!!o);return list.length?list:undefined;}

 private at(a:SceneEvent['at']|undefined,fallback:number,after=-1){return resolveAt(this.spec,a,this.dur,fallback,after);}

 private compileEvents(){
  const dur=this.dur;
  // entrances / exits
  const morphTargets=new Set((this.spec.events??[]).map(e=>e.morph).filter(Boolean) as string[]);
  this.objs.forEach((o,i)=>{
   const enter=morphTargets.has(o.spec.id)?'none':(o.spec.enter??'materialize');
   if(enter!=='none'){const t0=this.at(o.spec.enterAt,Math.min(0.08+i*0.12,dur*0.4));o.fx.push({kind:enter,out:false,t0,t1:t0+(o.spec.enterDur??fxLen(enter))});}
   if(o.spec.exit&&o.spec.exit!=='none'){const t0=this.at(o.spec.exitAt,Math.max(0,dur-0.75));o.fx.push({kind:o.spec.exit,out:true,t0,t1:t0+(o.spec.exitDur??fxLen(o.spec.exit))});}
  });
  const evs=[...(this.spec.events??[])].map((e,i)=>({e,i,t:0}));
  let last=-1;
  for(const x of evs){x.t=this.at(x.e.at,dur*0.5,typeof x.e.at==='string'&&!/^[\d.]+%?s?$/.test(x.e.at)?last:-1);if(typeof x.e.at==='string')last=x.t;}
  evs.sort((a,b)=>a.t-b.t||a.i-b.i);
  for(const {e,t} of evs){
   const d=clamp(Number(e.dur)||0.7,0.05,6);
   if(e.camera){const c=e.camera;const focus=this.focusObjs(c.focus)??this.objs.filter(o=>o.spec.frame!==false);const sy=clamp(Number(c.screenY)||this.cam.screenY,0.25,0.75);const f=this.explicit(c,sy)??this.fit(focus,c.angle??this.spec.camera?.angle,clamp(Number(c.fill)||Number(this.spec.camera?.fill)||0.86,0.2,1.2),sy);this.camEvents.push({easing:e.easing,t0:t,t1:t+Math.max(0.05,Number(e.dur)||0.9),...f,fov:c.fov?clamp(Number(c.fov),8,120):undefined});}
   const o=e.target?this.byId.get(e.target):undefined;if(!o)continue;
   if(e.set)for(const [k,v] of Object.entries(e.set)){const list=o.controls.get(k)??[];const from=evalNum(list,t,o.ctrl0[k]??0);list.push({t0:t,t1:t+d,easing:e.easing,from,to:Number(v)||0});o.controls.set(k,list);}
   if(e.pose)o.poses.push({t,dur:Math.min(d,2.5),name:e.pose});
   if(e.move){
    const from=this.posAt(o,t).p;let to=from.clone();
    if(e.move.to){const p=e.move.to.map(Number);to.set(p[0]||0,(p[1]||0)+(o.grounded||o.spec.origin!==undefined?0:this.ext(o).y),p[2]||0);}
    else if(e.move.near&&this.byId.has(e.move.near)){const keep=o.base.clone();to=this.placeRelative(o,this.byId.get(e.move.near)!,e.move.side??'right',Number(e.move.gap)||0.1);o.base.copy(keep);}
    else if(e.move.by){const b=e.move.by.map(Number);to.add(new THREE.Vector3(b[0]||0,b[1]||0,b[2]||0));}
    const dist=to.distanceTo(from);const walkDur=o.posable?Math.max(d,dist/1.3):d;
    o.moves.push({t0:t,t1:t+(Number(e.dur)?d:walkDur),easing:e.easing,from,to});
    if(o.posable&&Math.abs(to.x-from.x)+Math.abs(to.z-from.z)>0.05)o.yaw.push({t0:t,t1:t+0.3,to:Math.atan2(to.x-from.x,to.z-from.z)});
   }
   if(e.turn){const v=e.turn.map(n=>deg(Number(n)||0));o.turns.push({t0:t,t1:t+d,easing:e.easing,by:new THREE.Vector3(v[0],v[1],v[2])});}
   if(e.scaleTo!==undefined){const from=evalNum(o.scales,t,1);o.scales.push({t0:t,t1:t+d,easing:e.easing,from,to:clamp(Number(e.scaleTo)||1,0.01,50)});}
   if(e.hue){const from=o.hues.length?o.hues[o.hues.length-1]!.to:hueColor(o.spec.hue??this.spec.hue,this.palette);o.hues.push({t0:t,t1:t+d,from,to:hueColor(e.hue,this.palette)});}
   if(e.morph&&this.byId.has(e.morph)&&e.morph!==e.target){const b=this.byId.get(e.morph)!;const len=Math.max(0.25,Number(e.dur)||1.0);
    // B takes A's place: same spot, resting on the same level
    const pa=(o.moves.length?o.moves[o.moves.length-1]!.to:o.base).clone();const bottom=o.grounded?pa.y:pa.y-this.ext(o).y;if(!b.spec.pos)b.base.set(pa.x,b.grounded?bottom:bottom+this.ext(b).y,pa.z);
    const style=e.morphStyle??'particles';
    if(style==='particles'){o.fx.push({kind:'morph',out:true,t0:t,t1:t+len,partner:b});b.fx.push({kind:'morph-in',out:false,t0:t,t1:t+len});}
    else{if(style==='blob'){densify(o.meshes);densify(b.meshes);}o.fx.push({kind:`morph:${style}`,out:true,t0:t,t1:t+len,partner:b});b.fx.push({kind:`morph:${style}:in`,out:false,t0:t,t1:t+len,partner:o});}}
   if(e.fx){const runs=clamp(Math.round(Number(e.fxCount)||1),1,8),one=Number(e.dur)>0?clamp(Number(e.dur),0.1,6):FX_DUR[e.fx]??0.8;if(DENSE_FX.has(e.fx))densify(o.meshes);o.effects.push({kind:e.fx,t0:t,t1:t+one*runs,from:e.fxFrom??'front',amount:clamp(Number(e.fxAmount)||1,0.1,3),count:runs});}
   if(e.show)o.fx.push({kind:e.show,out:false,easing:e.easing,t0:t,t1:t+(e.dur??fxLen(e.show))});
   if(e.hide)o.fx.push({kind:e.hide,out:true,easing:e.easing,t0:t,t1:t+(e.dur??fxLen(e.hide))});
  }
  for(const o of this.objs){
   o.fx.sort((a,b)=>a.t0-b.t0);
   // walk-in entrances become real walks
   const w=o.fx.find(f=>f.kind.startsWith('walk-in'));
   if(w){const dirSign=w.kind.endsWith('left')?-1:1;const from=o.base.clone().add(new THREE.Vector3(dirSign*Math.max(this.frameWidth*0.75,2),0,0));const len=Math.max(1.2,from.distanceTo(o.base)/1.3);o.moves.unshift({t0:w.t0,t1:w.t0+len,from,to:o.base.clone()});o.yaw.unshift({t0:w.t0-0.01,t1:w.t0,to:Math.atan2(-dirSign,0)});
    if(o.moves[1])o.moves[1].from=o.base.clone();}
   const wo=o.fx.find(f=>f.kind.startsWith('walk-out'));
   if(wo){const dirSign=wo.kind.endsWith('left')?-1:1;const from=(o.moves.length?o.moves[o.moves.length-1]!.to:o.base).clone();const to=from.clone().add(new THREE.Vector3(dirSign*Math.max(this.frameWidth*0.8,2),0,0));o.moves.push({t0:wo.t0,t1:wo.t0+Math.max(1,to.distanceTo(from)/1.3),from,to});o.yaw.push({t0:wo.t0,t1:wo.t0+0.3,to:Math.atan2(dirSign,0)});}
   o.poses.sort((a,b)=>a.t-b.t);o.yaw.sort((a,b)=>a.t0-b.t0);
  }
 }

 private posAt(o:Obj,t:number){
  let p=o.base.clone(),travel=0;
  for(const m of o.moves){if(t<m.t0){if(m===o.moves[0]&&o.fx.some(f=>f.kind.startsWith('walk-in')))p=m.from.clone();break;}const u=(t-m.t0)/(m.t1-m.t0);const k=t>=m.t1?1:m.easing?interpolate(u,m.easing):o.posable?walkEase(u):ease.inOut(u);p=m.from.clone().lerp(m.to,k);travel+=m.from.distanceTo(m.to)*k;}
  return {p,travel};
 }

 private hueAt(o:Obj,t:number){
  let c=hueColor(o.spec.hue??this.spec.hue??'blue',this.palette);
  for(const h of o.hues){if(t<h.t0)break;c=t>=h.t1?h.to.clone():h.from.clone().lerp(h.to,ease.inOut((t-h.t0)/Math.max(1e-8,h.t1-h.t0)));}
  return c;
 }
 /** A synchronized palette change keeps one ink across the visible scene. */
 inkHue(t:number){
  const colors=this.objs.filter(o=>o.outer.visible).map(o=>this.hueAt(o,t));
  return colors.length&&colors.every(c=>Math.abs(c.r-colors[0]!.r)+Math.abs(c.g-colors[0]!.g)+Math.abs(c.b-colors[0]!.b)<1e-6)?colors[0]!:this.hue;
 }
 update(t:number){
  for(const p of this.pointLights){const a=p.active;const k=a?(p.fade>0?smooth((t-a[0])/p.fade)*smooth((a[1]-t)/p.fade):t>=a[0]&&t<a[1]?1:0):1;p.light.intensity=p.intensity*k;}
  const dur=this.dur;
  for(const o of this.objs){
   const {p,travel}=this.posAt(o,t);const prev=this.posAt(o,t-0.06);const speed=p.distanceTo(prev.p)/0.06;
   // poses
   let from=o.spec.pose??'stand',to=from,k=1;
   for(const ps of o.poses){if(t<ps.t)break;from=to;to=ps.name;k=clamp((t-ps.t)/ps.dur);}
   if(k>=1)from=to;
   const pose:PoseState={from,to,k:ease.inOutSine(k),time:t,travel,speed};
   // controls
   const ctrl:Record<string,number>={...o.ctrl0};for(const [key,list] of o.controls)ctrl[key]=evalNum(list,t,o.ctrl0[key]??0);
   for(const m of o.mats)m.opacity=Number(m.userData.baseOpacity??1);
   o.built.update?.(ctrl,t,pose);
   if(o.spec.castShadow!==undefined||o.spec.receiveShadow!==undefined)for(const m of o.meshes){if(o.spec.castShadow!==undefined)m.castShadow=o.spec.castShadow;if(o.spec.receiveShadow!==undefined)m.receiveShadow=o.spec.receiveShadow;}
   // glow
   for(const m of o.mats)if(m.userData.glow){m.emissiveIntensity=m.userData.glow*(ctrl[m.userData.glowControl as string]??1);}
   // hue
   if(o.hues.length){let c:THREE.Color|null=this.fixedInk?this.hueAt(o,t):null;for(const h of o.hues){if(t<h.t0)break;c=t>=h.t1?h.to.clone():h.from.clone().lerp(h.to,ease.inOut((t-h.t0)/(h.t1-h.t0)));}
    if(c&&this.fixedInk)c.multiplyScalar(1/Math.max(c.r,c.g,c.b,1e-4));
    if(c)o.mats.forEach(m=>{if(m.userData.explicit)return;m.color.copy(c!).multiplyScalar(m.userData.tone);if(m.userData.glow)m.emissive.copy(c!);});}
   // transform
   const rot=o.baseRot.clone();
   let yaw:number|null=null;for(const y of o.yaw){if(t<y.t0)break;const cur:number=yaw??o.baseRot.y;yaw=t>=y.t1?y.to:lerpAngle(cur,y.to,ease.inOut((t-y.t0)/(y.t1-y.t0)));}
   if(yaw!==null){// back to camera-friendly facing once the walk ends
    const lastMove=o.moves[o.moves.length-1];if(lastMove&&t>lastMove.t1&&o.posable&&!o.fx.some(f=>f.kind.startsWith('walk-out')&&t>=f.t0))yaw=lerpAngle(yaw,o.baseRot.y,ease.inOut((t-lastMove.t1)/0.45));
    rot.y=yaw;}
   for(const tr of o.turns){if(t<tr.t0)break;const kk=interpolate((t-tr.t0)/(tr.t1-tr.t0),tr.easing);rot.x+=tr.by.x*kk;rot.y+=tr.by.y*kk;rot.z+=tr.by.z*kk;}
   let scale=o.baseScale*evalNum(o.scales,t,1);
   // like the reference, a lone object is never frozen: it turns slowly unless told otherwise
   const idle=o.spec.idle??(o.posable||o.spec.near||this.objs.length>2?'none':'turn');const id=o.spec.id.length;
   if(idle==='turn')rot.y+=Math.sin(t*0.5+id)*0.26+t*0.07;
   if(idle==='spin')rot.y+=t*0.9;
   if(idle==='spin-slow')rot.y+=t*0.35;
   if(idle==='float')p.y+=Math.sin(t*1.6+id)*o.size.y*o.baseScale*0.04;
   if(idle==='pulse')scale*=1+0.04*Math.sin(t*4.2);
   if(idle==='sway')rot.z+=Math.sin(t*1.4+id)*0.06;
   if(idle==='wobble'){rot.x+=Math.sin(t*1.1+id)*0.12;rot.y+=Math.sin(t*0.8)*0.25;}
   if(o.spec.keyframes?.length){
    const keys=o.spec.keyframes,has=(k:'pos'|'rot'|'scale')=>keys.some(f=>f[k]!==undefined);
    const v=sampleObjectTrack(keys,t,{pos:o.base.toArray() as Vec3,rot:[o.baseRot.x,o.baseRot.y,o.baseRot.z].map(a=>a*180/Math.PI) as Vec3,scale:o.baseScale});
    if(has('pos'))p.fromArray(v.pos);if(has('rot'))rot.set(...v.rot.map(deg) as [number,number,number]);if(has('scale'))scale=v.scale;
   }
   // entrance / exit effects
   let rv:{kind:string;k:number}|null=null;let mo:{style:string;k:number;inbound:boolean;partner:Obj}|null=null;
   let reveal=1,vis=true,parts=0,partsOut=false,partsK=0,wipe=1;let wipeAxis:'y'|'left'|'right'='y';let morphTo:Obj|undefined;
   const first=o.fx.find(f=>!f.out);
   if(first&&t<first.t0)vis=false;
   for(const f of o.fx){
    if(t<f.t0)break;
    const kk=clamp((t-f.t0)/(f.t1-f.t0));const done=t>=f.t1;
    const h=Math.max(o.size.y,o.size.x)*o.baseScale;
    vis=!(f.out&&done);
    if(done)continue;
    if(!f.out){
     switch(f.kind){
      case 'materialize':reveal=ease.out(kk);break;
      case 'assemble':parts=1;partsK=kk;reveal=smooth((kk-0.7)/0.3);break;
      case 'pop':scale*=ease.outBack(kk);break;
      case 'grow':scale*=ease.out(kk);break;
      case 'drop':p.y+=h*2.5*(1-bounce(kk));break;
      case 'slide-left':p.x-=this.frameWidth*(1-ease.outExpo(kk));break;
      case 'slide-right':p.x+=this.frameWidth*(1-ease.outExpo(kk));break;
      case 'rise':p.y-=h*0.8*(1-ease.out(kk));reveal=ease.out(kk);break;
      case 'morph-in':reveal=smooth((kk-0.62)/0.38);break;
      case 'wipe-up':wipe=interpolate(kk,f.easing);break;
      case 'wipe-left':wipe=interpolate(kk,f.easing);wipeAxis='left';break;
      case 'wipe-right':wipe=interpolate(kk,f.easing);wipeAxis='right';break;
      default:if(f.kind in REVEAL_DUR)rv={kind:f.kind,k:kk};else if(f.kind.startsWith('morph:')&&f.partner)mo={style:f.kind.split(':')[1]!,k:kk,inbound:true,partner:f.partner};
     }
    }else{
     switch(f.kind){
      case 'dissolve':reveal=1-ease.in(kk);break;
      case 'shatter':parts=1;partsOut=true;partsK=kk;reveal=kk<0.06?1:0;break;
      case 'morph':parts=2;partsK=kk;morphTo=f.partner;reveal=1-smooth(kk/0.3);break;
      case 'shrink':scale*=1-ease.in(kk);break;
      case 'fall':p.y-=h*3*ease.in(kk);rot.z+=kk*0.8;break;
      case 'slide-left':p.x-=this.frameWidth*ease.in(kk);break;
      case 'slide-right':p.x+=this.frameWidth*ease.in(kk);break;
      default:if(f.kind in REVEAL_DUR)rv={kind:f.kind,k:kk};else if(f.kind.startsWith('morph:')&&f.partner)mo={style:f.kind.split(':')[1]!,k:kk,inbound:false,partner:f.partner};
     }
    }
   }
   if(mo){const mp=morphPose(mo.style,mo.k,mo.inbound);if(!mp.visible)reveal=0;scale*=mp.scale;rot.y+=mp.rotY;}
   let fxScale:THREE.Vector3|null=null;
   if(o.effects.length){const span=Math.max(o.size.x,o.size.y,o.size.z)*scale;const fp=fxPose(o.effects,t,span);p.add(fp.pos);rot.x+=fp.rot.x;rot.y+=fp.rot.y;rot.z+=fp.rot.z;fxScale=fp.scale;}
   o.outer.position.copy(p);o.outer.rotation.copy(rot);o.outer.scale.setScalar(Math.max(1e-4,scale));if(fxScale)o.outer.scale.multiply(fxScale);
   o.outer.visible=vis;
   for(const m of o.mats){m.opacity*=clamp(reveal);}
   // Local wipes follow the authored model instead of expanding a world-aligned bounding box.
   if(wipe<1){o.outer.updateMatrixWorld(true);const local=o.spec.enterSpace==='local';
    const bb=local?new THREE.Box3().setFromCenterAndSize(o.center.clone().add(o.inner.position),o.size):new THREE.Box3().setFromObject(o.inner,true);
    if(wipeAxis==='left'){o.clip.normal.set(-1,0,0);o.clip.constant=lerp(bb.min.x,bb.max.x,wipe);}
    else if(wipeAxis==='right'){o.clip.normal.set(1,0,0);o.clip.constant=-lerp(bb.max.x,bb.min.x,wipe);}
    else{o.clip.normal.set(0,-1,0);o.clip.constant=lerp(bb.min.y,bb.max.y,wipe);}
    if(local)o.clip.applyMatrix4(o.outer.matrixWorld);
    for(const m of o.mats)m.clippingPlanes=[o.clip];}
   else if(o.mats[0]?.clippingPlanes?.length)for(const m of o.mats)m.clippingPlanes=[];
   o.inner.visible=vis&&reveal>0.002;
   const fxOn=o.effects.some(f=>t>=f.t0&&t<f.t1);
   if(fxOn||rv||mo){o.outer.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(o.inner);fxSurface(fxOn?o.effects:[],t,o.fxU,box);resetReveal(o.fxU);if(rv)fxReveal(rv.kind,rv.k,o.fxU,box);
    if(mo){mo.partner.outer.updateMatrixWorld(true);const pb=new THREE.Box3().setFromObject(mo.partner.inner);morphSurface(mo.style,mo.k,mo.inbound,o.fxU,mo.inbound?pb:box);}
    o.fxDirty=true;}
   else if(o.fxDirty){fxSurface([],t,o.fxU,new THREE.Box3());resetReveal(o.fxU);o.fxDirty=false;}
   if(parts===2&&morphTo){this.ensureParticles(o);this.ensureParticles(morphTo);this.drawMorph(o,morphTo,partsK);}
   else if(parts){this.ensureParticles(o);this.drawParticles(o,partsK,partsOut,t);}else if(o.particles)o.particles.mesh.visible=false;
  }
  // camera
  this.updateCamera(t,dur);
 }

 private ensureParticles(o:Obj){
  if(o.particles)return;
  const n=1600,target=new Float32Array(n*3),scatter=new Float32Array(n*3);
  o.outer.updateMatrixWorld(true);const inv=o.outer.matrixWorld.clone().invert();
  const r=rng(seedOf(o.spec.id));
  const samplers=o.meshes.filter(m=>(m.geometry.attributes.position?.count??0)>2).map(m=>{const s=new MeshSurfaceSampler(m).build();(s as MeshSurfaceSampler&{randomFunction:()=>number}).randomFunction=r;return {s,m};});
  const areas=samplers.map(({m})=>{
   const p=m.geometry.attributes.position!,idx=m.geometry.index,mat=inv.clone().multiply(m.matrixWorld);
   const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();let area=0;
   for(let i=0;i<(idx?.count??p.count);i+=3){
    a.fromBufferAttribute(p,idx?idx.getX(i):i).applyMatrix4(mat);b.fromBufferAttribute(p,idx?idx.getX(i+1):i+1).applyMatrix4(mat);c.fromBufferAttribute(p,idx?idx.getX(i+2):i+2).applyMatrix4(mat);
    area+=b.sub(a).cross(c.sub(a)).length()*0.5;
   }
   return Math.max(1e-6,area);
  });
  const tot=areas.reduce((a,b)=>a+b,0);const v=new THREE.Vector3();
  const maxDim=Math.max(o.size.x,o.size.y,o.size.z);
  for(let i=0;i<n;i++){
   let pick=r()*tot,j=0;while(j<areas.length-1&&pick>areas[j]!){pick-=areas[j]!;j++;}
   const sm=samplers[j];if(sm){sm.s.sample(v);v.applyMatrix4(sm.m.matrixWorld).applyMatrix4(inv);}else v.set(0,0,0);
   target.set([v.x,v.y,v.z],i*3);
   const dir=new THREE.Vector3(r()-0.5,r()-0.3,r()-0.5).normalize().multiplyScalar(maxDim*(0.35+r()*0.8));
   scatter.set([v.x+dir.x,v.y+dir.y,v.z+dir.z],i*3);
  }
  const cube=maxDim/42;
  const mat=new THREE.MeshStandardMaterial({color:o.mats[0]?.color.clone()??this.hue.clone(),roughness:0.6});
  const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),mat,n);mesh.frustumCulled=false;
  o.outer.add(mesh);o.particles={mesh,target,scatter,n,cube};
 }
 /** Point-cloud morph: A's surface points swirl through noise and land on B's surface (abacus → calculator → laptop). */
 private drawMorph(a:Obj,b:Obj,k:number){
  const P=a.particles!,Q=b.particles!;P.mesh.visible=true;if(Q.mesh)Q.mesh.visible=false;
  // B's placement while it is still hidden
  const bm=new THREE.Matrix4().compose(b.base,new THREE.Quaternion().setFromEuler(b.baseRot),new THREE.Vector3(b.baseScale,b.baseScale,b.baseScale));
  a.outer.updateMatrixWorld(true);const toA=a.outer.matrixWorld.clone().invert().multiply(bm);
  const m=new THREE.Matrix4(),q=new THREE.Quaternion(),e=new THREE.Euler(),s=new THREE.Vector3(),p=new THREE.Vector3(),pb=new THREE.Vector3();
  const inv=1;const span=Math.max(a.size.x,a.size.y,a.size.z);
  const mat=P.mesh.material as THREE.MeshStandardMaterial;const ca=a.mats[0]?.color,cb=b.mats[0]?.color;if(ca&&cb)mat.color.copy(ca).lerp(cb,smooth(k));
  for(let i=0;i<P.n;i++){
   const d=((i*61)%101)/101*0.3;const kk=ease.inOut(clamp((k-d*0.5)/(1-d*0.5)));const mid=Math.sin(Math.PI*kk);
   p.set(P.target[i*3]!,P.target[i*3+1]!,P.target[i*3+2]!);const j=(i*7)%Q.n;pb.set(Q.target[j*3]!,Q.target[j*3+1]!,Q.target[j*3+2]!).applyMatrix4(toA);
   p.lerp(pb,kk);
   p.x+=Math.sin(i*12.9898+kk*5)*span*0.16*mid;p.y+=Math.cos(i*78.233+kk*4)*span*0.13*mid;p.z+=Math.sin(i*39.3468+kk*6)*span*0.16*mid;
   e.set(kk*4+i,kk*3,0);q.setFromEuler(e);
   const edge=Math.min(1,k/0.12,(1-k)/0.14);s.setScalar(Math.max(1e-5,P.cube*inv*(0.7+((i*31)%7)/12)*Math.max(0,edge)));
   m.compose(p,q,s);P.mesh.setMatrixAt(i,m);
  }
  P.mesh.instanceMatrix.needsUpdate=true;
 }
 private drawParticles(o:Obj,k:number,out:boolean,t:number){
  const P=o.particles!;P.mesh.visible=true;const m=new THREE.Matrix4(),q=new THREE.Quaternion(),e=new THREE.Euler(),s=new THREE.Vector3(),p=new THREE.Vector3();
  const inv=1; // particles live inside the object's own scaled space
  for(let i=0;i<P.n;i++){
   const d=(i%97)/97*0.35;
   let kk:number;
   if(out){kk=ease.out(clamp((k-d*0.4)/(1-d*0.4)));}else kk=1-ease.inOut(clamp((k-d)/(0.75-d*0.5)));
   const tx=P.target[i*3]!,ty=P.target[i*3+1]!,tz=P.target[i*3+2]!,sx=P.scatter[i*3]!,sy=P.scatter[i*3+1]!,sz=P.scatter[i*3+2]!;
   p.set(lerp(tx,sx,kk),lerp(ty,sy,kk)-(out?kk*kk*Math.max(o.size.y,0.2)*0.6:0),lerp(tz,sz,kk));
   e.set(kk*3+i,kk*2+i*0.3,0);q.setFromEuler(e);
   const sc=P.cube*(out?1-kk*0.85:(k>0.85?1-(k-0.85)/0.15:1))*inv*(0.6+((i*31)%7)/10);
   s.setScalar(Math.max(1e-5,sc));m.compose(p,q,s);P.mesh.setMatrixAt(i,m);
  }
  P.mesh.instanceMatrix.needsUpdate=true;void t;
 }

 private updateCamera(t:number,dur:number){
  let {dir,target,dist,screenY}=this.cam;dir=dir.clone();target=target.clone();let fov=this.cam.fov??VFOV;
  for(const c of this.camEvents){if(t<c.t0)break;const k=interpolate((t-c.t0)/(c.t1-c.t0),c.easing);dir.lerp(c.dir,k).normalize();target.lerp(c.target,k);dist=lerp(dist,c.dist,k);screenY=lerp(screenY,c.screenY,k);if(c.fov)fov=lerp(fov,c.fov,k);}
  // tracking shot: the camera travels with an object (horizontal only); camera moves stay relative to it
  if(this.cam.follow){const o=this.byId.get(this.cam.follow);if(o){const dx=o.outer.position.x-o.base.x,dz=o.outer.position.z-o.base.z;target.x+=dx;target.z+=dz;}}
  const u=clamp(t/Math.max(0.5,dur)),a=this.cam.amount,e=ease.inOutSine(u);
  let yaw=0,pitch=0;
  switch(this.cam.move){
   case 'push':dist*=1+lerp(0.08,-0.1,e)*a;break;
   case 'pull':dist*=1+lerp(-0.08,0.1,e)*a;break;
   case 'orbit':yaw=lerp(-14,14,e)*a;break;
   case 'orbit-left':yaw=lerp(14,-14,e)*a;break;
   case 'rise':pitch=lerp(-6,8,e)*a;break;
   case 'fall':pitch=lerp(8,-6,e)*a;break;
   case 'crane':pitch=lerp(-4,10,e)*a;dist*=lerp(1.05,0.95,e);break;
   case 'static':break;
   default:yaw=lerp(-4,4,e)*a;dist*=lerp(1.02,0.97,e);
  }
  dist*=1-0.022*this.pulse; // the picture breathes on the beat
  const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),deg(yaw));dir.applyQuaternion(q);
  if(pitch){const right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),dir).normalize();dir.applyAxisAngle(right,-deg(pitch)).normalize();}
  this.camera.position.copy(target).addScaledVector(dir,dist);
  this.camera.up.set(0,1,0);if(Math.abs(dir.y)>0.98)this.camera.up.set(0,0,-1);
  this.camera.lookAt(target);
  this.camera.fov=fov;this.camera.near=Math.max(0.005,dist*0.02);this.camera.far=dist*60+50;
  this.camera.setViewOffset(W,H,0,-(screenY-0.5)*H,W,H);
  this.camera.updateProjectionMatrix();
  // aim the key light from the camera's point of view at the scene centre
  this.camera.updateMatrixWorld(true);const wd=this.kdir.clone().applyQuaternion(this.camera.quaternion);
  this.key.target.position.copy(this.center);this.key.position.copy(this.center).addScaledVector(wd,this.radius*3);this.key.target.updateMatrixWorld();
 }

 /** Screen position (px) of an object's top centre, for labels. */
 project(id:string){const o=this.byId.get(id);if(!o||!o.outer.visible)return null;const b=new THREE.Box3().setFromObject(o.inner,true);if(b.isEmpty())return null;const c=b.getCenter(new THREE.Vector3());c.y=b.max.y;const v=c.project(this.camera);return {x:(v.x*0.5+0.5)*W,y:(-v.y*0.5+0.5)*H};}
}

const DIRECT:Record<string,number>={wipe:2,'push-right':4,glitch:6};
const THROUGH:Record<string,number>={black:1,blink:4};
function transitionLen(s:Scene){const tr=s.transition??'cut';return s.transitionDur??(tr in THROUGH?0.8:tr==='glitch'?0.35:tr==='push-right'?0.55:TRANSITION);}
function fxLen(kind:string){return REVEAL_DUR[kind]??({cut:0.02,'wipe-up':0.9,materialize:0.75,assemble:1.15,pop:0.45,grow:0.8,drop:0.7,'slide-left':0.6,'slide-right':0.6,rise:0.8,dissolve:0.6,shatter:1.1,shrink:0.45,fall:0.8,'walk-in-left':0.01,'walk-in-right':0.01,'walk-out-left':0.01,'walk-out-right':0.01} as Record<string,number>)[kind]??0.6;}
function bounce(k:number){const n1=7.5625,d1=2.75;if(k<1/d1)return n1*k*k;if(k<2/d1)return n1*(k-=1.5/d1)*k+0.75;if(k<2.5/d1)return n1*(k-=2.25/d1)*k+0.9375;return n1*(k-=2.625/d1)*k+0.984375;}
function walkEase(k:number){k=clamp(k);const a=0.12;if(k<a)return k*k/(2*a)/(1-a);if(k>1-a)return 1-(1-k)*(1-k)/(2*a)/(1-a);return (k-a/2)/(1-a);}
function lerpAngle(a:number,b:number,k:number){let d=((b-a+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;return a+d*k;}

// ---------------------------------------------------------------- engine
export class Engine {
 private aoMethod:'plane'|'legacy'='plane';
 renderer:THREE.WebGLRenderer;gl:HTMLCanvasElement;out:HTMLCanvasElement;ctx2d:CanvasRenderingContext2D;
 rtA:THREE.WebGLRenderTarget;rtB:THREE.WebGLRenderTarget;post:THREE.ShaderMaterial;postScene=new THREE.Scene();postCam=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
 scenes:(SceneRuntime|null)[]=[];starts:number[]=[];total=0;
 constructor(public spec:AcryllexSpec){
  setFormat(spec.format??{});
  Object.assign(LOOK,{contrast:1.35,blackPoint:0,whitePoint:1,inkLo:0.42,shadows:1,ao:1,gamma:0.85,noise:0.06,gap:0,ink:1,fuzz:0.06,dotRoundness:0,dotSoftness:0,key:1.0,fill:0.1,rim:0.3,ambient:0.07,dir:[1.2,1.0,0.75]},spec.look??{});
  this.gl=document.createElement('canvas');this.gl.width=W;this.gl.height=H;
  this.renderer=new THREE.WebGLRenderer({canvas:this.gl,antialias:false,preserveDrawingBuffer:true,alpha:false});
  this.renderer.outputColorSpace=THREE.LinearSRGBColorSpace;this.renderer.toneMapping=THREE.NoToneMapping;this.renderer.setPixelRatio(1);this.renderer.localClippingEnabled=true;this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;this.renderer.setSize(W,H,false);
  const mk=()=>{const rt=new THREE.WebGLRenderTarget(COLS*SS,ROWS*SS,{type:THREE.HalfFloatType,samples:4,generateMipmaps:true,minFilter:THREE.LinearMipmapLinearFilter,magFilter:THREE.LinearFilter,depthBuffer:true,depthTexture:new THREE.DepthTexture(COLS*SS,ROWS*SS,THREE.FloatType)});return rt;};
  this.rtA=mk();this.rtB=mk();
  this.post=new THREE.ShaderMaterial({vertexShader:POST_VERT,fragmentShader:POST_FRAG(this.aoMethod=spec.look?.aoMethod??'plane'),uniforms:{fixedInk:{value:spec.look?.inkMode==='fixed'?1:0},inkColor:{value:new THREE.Vector3(1,1,1)},tA:{value:this.rtA.texture},tB:{value:this.rtB.texture},tDepth:{value:this.rtA.depthTexture},cNear:{value:0.1},cFar:{value:100},tanHalf:{value:0.32},aoR:{value:0.1},aoStr:{value:1.0},mixP:{value:0},mode:{value:0},res:{value:new THREE.Vector2(W,H)},cell:{value:CELL},time:{value:0},boost:{value:1},gam:{value:LOOK.gamma},noiseAmt:{value:LOOK.noise},noiseReference:{value:spec.look?.noiseReference??-1},gap:{value:LOOK.gap},ink:{value:LOOK.ink},fuzz:{value:LOOK.fuzz},dotRoundness:{value:LOOK.dotRoundness},dotSoftness:{value:LOOK.dotSoftness},inkLo:{value:LOOK.inkLo},contrast:{value:1},blackPoint:{value:LOOK.blackPoint},whitePoint:{value:LOOK.whitePoint},expo:{value:1},maskMode:{value:0},maskK:{value:1}}});
  this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.post));
  this.out=document.createElement('canvas');this.out.width=W;this.out.height=H;this.ctx2d=this.out.getContext('2d')!;
  let t=0;for(const s of spec.scenes){this.starts.push(t);t+=sceneDuration(s);}this.total=t;
  this.scenes=spec.scenes.map(()=>null);
 }
 dispose(){
  for(const s of this.scenes)if(s)disposeScene(s.scene);
  this.rtA.dispose();this.rtB.dispose();disposeScene(this.postScene);
  this.renderer.dispose();this.renderer.forceContextLoss();this.scenes=[];
 }
 runtime(i:number){
  if(!this.scenes[i]){
   // free scenes we are past
   for(let k=0;k<i-1;k++)if(this.scenes[k]){disposeScene(this.scenes[k]!.scene);this.scenes[k]=null;}
 this.scenes[i]=new SceneRuntime(this.spec.scenes[i]!,i,this.spec.look?.inkMode==='fixed',this.spec.look?.palette);
  }
  return this.scenes[i]!;
 }
 sceneAt(t:number){let i=0;while(i<this.starts.length-1&&t>=this.starts[i+1]!)i++;return i;}
 /** 1 on a beat, decaying to 0 before the next (0 when the reel has no beat grid). */
 beatPulse(t:number){const b=this.spec.beat;if(!b||!(b.period>0.2)||t<(b.from??0))return 0;const x=((t-b.phase)%b.period+b.period)%b.period;return Math.exp(-7*x/b.period);}
 renderInto(rt:THREE.WebGLRenderTarget,i:number,local:number){
  const s=this.runtime(i);s.pulse=this.beatPulse(this.starts[i]!+local);s.update(local);
  this.renderer.setRenderTarget(rt);this.renderer.setClearColor(0x000000,0);this.renderer.clear();this.renderer.render(s.scene,s.camera);
 }
 frame(t:number,opts:{captions?:boolean}={}){
  const i=this.sceneAt(t),local=t-this.starts[i]!,sc=this.spec.scenes[i]!;
  const aoMethod=sc.aoMethod??this.spec.look?.aoMethod??'plane';
  if(aoMethod!==this.aoMethod){this.aoMethod=aoMethod;this.post.fragmentShader=POST_FRAG(aoMethod);this.post.needsUpdate=true;}
  this.renderInto(this.rtA,i,local);
  const hc=this.spec.look?.inkMode==='fixed'?this.runtime(i).inkHue(local):hueColor(sc.hue??'blue',this.spec.look?.palette),light=sampleLightTrack(sc.light?.keyframes??[],local,{contrast:sc.light?.contrast??LOOK.contrast,inkLo:sc.light?.inkLo??LOOK.inkLo,gamma:sc.light?.gamma??LOOK.gamma,blackPoint:sc.light?.blackPoint??LOOK.blackPoint,whitePoint:sc.light?.whitePoint??LOOK.whitePoint,exposure:sc.light?.exposure??1,ink:sc.light?.ink??LOOK.ink*Math.max(hc.r,hc.g,hc.b),softness:sc.light?.softness??0});
  {const rt=this.runtime(i),cam=rt.camera,u=this.post.uniforms;u.cNear!.value=cam.near;u.cFar!.value=cam.far;u.tanHalf!.value=Math.tan(deg(cam.fov/2));u.aoR!.value=(sc.aoRadius??rt.radius*0.06);u.aoStr!.value=LOOK.ao*(sc.ao??1.4);u.contrast!.value=Number(light.contrast)||LOOK.contrast;u.inkLo!.value=light.inkLo??LOOK.inkLo;u.gam!.value=light.gamma??LOOK.gamma;u.blackPoint!.value=light.blackPoint??LOOK.blackPoint;u.whitePoint!.value=light.whitePoint??LOOK.whitePoint;u.expo!.value=Number(light.exposure)||1;u.noiseAmt!.value=sc.light?.noise??LOOK.noise;u.noiseReference!.value=sc.light?.noiseReference??this.spec.look?.noiseReference??-1;}
  let mode=0,mixP=0,maskMode=0,maskK=1;
  const tr=sc.transition??'cut',D=transitionLen(sc),dur=sceneDuration(sc);
  const next=this.spec.scenes[i+1],trN=next?.transition??'cut';
  if(i>0&&tr in DIRECT&&local<D){
   this.renderInto(this.rtB,i-1,local+sceneDuration(this.spec.scenes[i-1]!));
   // B holds the outgoing scene; mixP is the share still showing it
   mode=DIRECT[tr]!;mixP=1-ease.inOut(local/D);
  }
  // through-black transitions: the outgoing scene closes to black over its last half, the new one opens from black
  if(i>0&&tr in THROUGH&&local<D/2){maskMode=THROUGH[tr]!;maskK=smooth(local/(D/2));}
  else if(next&&trN in THROUGH&&local>dur-transitionLen(next)/2){maskMode=THROUGH[trN]!;maskK=smooth((dur-local)/(transitionLen(next)/2));}
  this.post.uniforms.maskMode!.value=maskMode;this.post.uniforms.maskK!.value=maskK;
  const pulse=this.beatPulse(t);this.post.uniforms.boost!.value=1+0.22*pulse;
  this.post.uniforms.ink!.value=light.ink;this.post.uniforms.inkColor!.value.set(hc.r,hc.g,hc.b).divideScalar(Math.max(hc.r,hc.g,hc.b,1e-4));
  this.post.uniforms.mode!.value=mode;this.post.uniforms.mixP!.value=mixP;this.post.uniforms.time!.value=t;
  this.renderer.setRenderTarget(null);this.renderer.setClearColor(0x000000,1);this.renderer.clear();this.renderer.render(this.postScene,this.postCam);
  const c=this.ctx2d;c.globalAlpha=1;c.fillStyle='#000';c.fillRect(0,0,W,H);c.filter=light.softness>0?`blur(${light.softness}px)`:'none';c.drawImage(this.gl,0,0);c.filter='none';
  const rt=this.runtime(i);
  const tctx:TextCtx={ctx:c,t:local,dur:rt.dur,scene:sc,palette:this.spec.look?.palette,textColor:this.spec.look?.textColor,hue:this.spec.look?.palette?.[sc.hue??'blue']??HUES[(sc.hue??'blue') as Hue]??HUES.blue,project:(id)=>rt.project(id)};
  for(let previous=0;previous<i;previous++){
   const prior=this.spec.scenes[previous]!,priorTime=t-this.starts[previous]!,priorDuration=sceneDuration(prior);
   const carried=(prior.text??[]).filter(item=>item.carry&&priorTime<=textEnd(prior,item.until,priorDuration));
   if(!carried.length)continue;
   let priorRuntime:SceneRuntime|undefined;
   const previousCtx:TextCtx={...tctx,t:priorTime,dur:priorDuration,scene:prior,hue:this.spec.look?.palette?.[prior.hue??'blue']??HUES[prior.hue??'blue'],project:id=>{if(!priorRuntime){priorRuntime=this.runtime(previous);priorRuntime.update(priorTime);}return priorRuntime.project(id);}};
   for(const item of carried)drawText(previousCtx,item);
  }
  for(const item of sc.text??[])drawText(tctx,item);
  if(opts.captions!==false&&this.spec.captions!==false)drawCaptions(tctx);
  if(tr==='flash'&&i>0&&local<0.12){c.fillStyle=`rgba(255,255,255,${(1-local/0.12)*0.5})`;c.fillRect(0,0,W,H);}
  return this.out;
 }
}

function disposeScene(s:THREE.Scene){s.traverse(o=>{const m=o as THREE.Mesh;if(m.geometry)m.geometry.dispose();const mat=m.material as THREE.Material|THREE.Material[]|undefined;if(Array.isArray(mat))mat.forEach(x=>x.dispose());else mat?.dispose();});}
