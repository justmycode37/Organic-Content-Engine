import * as THREE from 'three';
import {MeshSurfaceSampler} from 'three/examples/jsm/math/MeshSurfaceSampler.js';
import {HUES,resolveAt,sceneDuration,type AcryllexSpec,type Scene,type SceneObject,type SceneEvent,type CameraMove,type Hue,type Vec3} from './spec.ts';
import {findModel} from './models/index.ts';
import type {Built,ModelCtx,PoseState,ModelDef} from './models/types.ts';
import {clamp,lerp,ease,deg,rng,seedOf,smooth,type MatOpts} from './kit.ts';
import {drawText,drawCaptions,type TextCtx} from './text.ts';

THREE.ColorManagement.enabled=false;

export const W=1080,H=1920,CELL=4,COLS=W/CELL,ROWS=H/CELL,SS=3;
const VFOV=36;
const TRANSITION=0.4;

const hueColor=(h?:string)=>{if(!h)return new THREE.Color(HUES.white);const hex=(HUES as Record<string,string>)[h]??h;try{return new THREE.Color(hex);}catch{return new THREE.Color(HUES.white);}};

// ---------------------------------------------------------------- dither post shader
const POST_VERT=`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const POST_FRAG=`
precision highp float;
uniform sampler2D tA;uniform sampler2D tB;uniform float mixP;uniform int mode;uniform vec2 res;uniform float cell;uniform float time;
varying vec2 vUv;
float bayer8(vec2 p){ivec2 i=ivec2(mod(p,8.));int x=i.x,y=i.y,xy=x^y;int v=((xy&1)<<5)|((x&1)<<4)|((xy&2)<<2)|((x&2)<<1)|((xy&4)>>1)|((x&4)>>2);return (float(v)+0.5)/64.;}
float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
float mx(vec3 c){return max(c.r,max(c.g,c.b));}
vec4 dotColor(sampler2D t,vec2 c,vec2 cuv,vec2 local){
 vec2 tx=1./(res/cell*3.);vec4 s=vec4(0.);for(int i=-1;i<=1;i++)for(int j=-1;j<=1;j++)s+=textureLod(t,cuv+vec2(float(i),float(j))*tx,0.);s/=9.;
 float b=mx(s.rgb);
 vec3 hue=s.rgb/max(b,1e-4);
 float dens=pow(clamp(b*1.25,0.,1.),1.0);
 float thr=bayer8(c);
 float size=(b>0.97&&b<1.25)?cell:cell-1.;
 bool inDot=local.x<size&&local.y<size;
 if(b>0.012&&dens>thr&&inDot){
  vec3 col=hue*(0.64+0.36*min(b,1.));
  if(b>1.25){col=hue*1.12+vec3(0.08);col=mix(col,vec3(1.),clamp((b-2.)/6.,0.,0.3));}
  return vec4(col,1.);
 }
 if(!inDot)return vec4(0.);
 // halo around self-lit things
 vec4 g1=textureLod(t,cuv,4.),g2=textureLod(t,cuv,5.8);
 float glow=max(clamp((mx(g1.rgb)-0.9)/2.,0.,1.),clamp((mx(g2.rgb)-0.35)/1.4,0.,1.)*0.75);
 if(glow>0.){float h=hash(c+floor(time*9.)*0.37);if(h<glow*0.8){vec4 g=mx(g1.rgb)>mx(g2.rgb)?g1:g2;return vec4(g.rgb/max(mx(g.rgb),1e-4)*0.8,1.);}}
 // sparse point-cloud fuzz around silhouettes
 float a=textureLod(t,cuv,2.8).a;
 if(s.a<0.5&&a>0.03){float h=hash(c*1.31+floor(time*7.)*0.71);if(h<a*0.12){vec4 g=textureLod(t,cuv,2.8);return vec4(g.rgb/max(mx(g.rgb),1e-4)*0.55,1.);}}
 return vec4(0.);
}
void main(){
 vec2 px=vUv*res;vec2 c=floor(px/cell);vec2 cuv=(c+0.5)*cell/res;vec2 local=floor(px-c*cell);
 local.y=cell-1.-local.y;
 bool useB=false;
 if(mode>0){float n=hash(c*0.731+3.1);
  if(mode==1)useB=n<mixP;
  else if(mode==2)useB=(1.-cuv.y)*0.75+n*0.25<mixP*1.0;
 }
 vec4 o=useB?dotColor(tB,c,cuv,local):dotColor(tA,c,cuv,local);
 gl_FragColor=vec4(o.rgb*o.a,1.);
}`;

// ---------------------------------------------------------------- runtime types
interface Track {t0:number;t1:number}
interface MoveT extends Track {from:THREE.Vector3;to:THREE.Vector3}
interface NumT extends Track {from:number;to:number}
interface ColT extends Track {from:THREE.Color;to:THREE.Color}
interface FxT extends Track {kind:string;out:boolean}
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
}

function ctxFor(def:ModelDef,o:SceneObject,hue:THREE.Color):ModelCtx{
 const params=(o.params&&typeof o.params==='object'?o.params:{}) as Record<string,unknown>;
 const color=(c?:string)=>c?hueColor(c):hue.clone();
 const mat=(opts:MatOpts={})=>{
  const base=opts.color instanceof THREE.Color?opts.color.clone():color(opts.color as string|undefined);
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

function evalNum(list:NumT[]|undefined,t:number,init:number,e=ease.inOut){let v=init;for(const k of list??[]){if(t<k.t0)break;v=t>=k.t1?k.to:lerp(k.from,k.to,e((t-k.t0)/Math.max(1e-3,k.t1-k.t0)));}return v;}

// ---------------------------------------------------------------- scene runtime
class SceneRuntime {
 scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(VFOV,W/H,0.01,5000);
 objs:Obj[]=[];byId=new Map<string,Obj>();dur:number;hue:THREE.Color;
 cam:{dir:THREE.Vector3;target:THREE.Vector3;dist:number;screenY:number;move:string;amount:number};
 camEvents:{t0:number;t1:number;target:THREE.Vector3;dist:number;dir:THREE.Vector3;screenY:number}[]=[];
 frameWidth=4;
 constructor(public spec:Scene,public index:number){
  this.dur=sceneDuration(spec);this.hue=hueColor(spec.hue??'blue');
  this.scene.background=null;
  // Lights ride with the camera so shading reads the same from every angle.
  this.scene.add(this.camera);
  const key=new THREE.DirectionalLight(0xffffff,1.3);key.position.set(-1.1,1.5,1.3);this.camera.add(key);key.target=new THREE.Object3D();key.target.position.set(0,0,-10);this.camera.add(key.target);
  const fill=new THREE.DirectionalLight(0xffffff,0.18);fill.position.set(1.4,0.2,0.8);fill.target=key.target;this.camera.add(fill);
  const rim=new THREE.DirectionalLight(0xffffff,0.75);rim.position.set(0.6,0.9,-1.6);rim.target=key.target;this.camera.add(rim);
  this.scene.add(new THREE.HemisphereLight(0xffffff,0x101010,0.22));
  this.build();
  this.cam={dir:new THREE.Vector3(0,0,1),target:new THREE.Vector3(),dist:5,screenY:0.5,move:'drift',amount:1};
  this.frameCamera();
  this.compileEvents();
  if(spec.ground){const g=new THREE.Mesh(new THREE.PlaneGeometry(400,400),new THREE.MeshStandardMaterial({color:this.hue.clone().multiplyScalar(0.22),roughness:1}));g.rotation.x=-Math.PI/2;g.position.y=-0.001;this.scene.add(g);}
 }

 private build(){
  const list=(this.spec.objects??[]).slice(0,12);
  for(const o of list){
   if(!o||typeof o.id!=='string')continue;
   const def=findModel(String(o.model))??findModel('compose')!;
   const hue=hueColor(o.hue??this.spec.hue??'blue');
   let built:Built;try{built=def.build(ctxFor(def,o,hue));}catch(err){console.warn(`model ${o.model} failed`,err);built=findModel('cube')!.build(ctxFor(findModel('cube')!,o,hue));}
   const inner=new THREE.Group(),outer=new THREE.Group();inner.add(built.root);outer.add(inner);this.scene.add(outer);
   const ctrl0:Record<string,number>={...(def.defaults??{}),...(o.controls??{})};
   const posable=!!def.poses?.length;
   const pose:PoseState={from:o.pose??'stand',to:o.pose??'stand',k:1,time:0,travel:0,speed:0};
   built.update?.(ctrl0,0,pose);
   outer.updateMatrixWorld(true);
   const box=new THREE.Box3().setFromObject(built.root,true);if(box.isEmpty())box.set(new THREE.Vector3(-0.5,0,-0.5),new THREE.Vector3(0.5,1,0.5));
   const size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
   const grounded=built.grounded!==false;
   inner.position.set(-center.x,grounded?-box.min.y:-center.y,-center.z);
   const meshes:THREE.Mesh[]=[];built.root.traverse(c=>{if((c as THREE.Mesh).isMesh)meshes.push(c as THREE.Mesh);});
   const mats=meshes.map(m=>m.material as THREE.MeshStandardMaterial);
   const obj:Obj={spec:o,def,built,outer,inner,meshes,mats,baseColors:mats.map(m=>m.color.clone()),size,center,grounded,base:new THREE.Vector3(),baseRot:new THREE.Euler(...((o.rot??[0,0,0]).map(v=>deg(Number(v)||0)) as [number,number,number])),baseScale:clamp(Number(o.scale)||1,0.01,500),moves:[],turns:[],scales:[],controls:new Map(),ctrl0,hues:[],fx:[],poses:[],yaw:[],posable};
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
  const auto=this.objs.filter(o=>!o.spec.pos&&!(o.spec.near&&this.byId.has(o.spec.near)));
  // automatic row, left to right, grounded objects share the floor, floating objects are centred at mid height
  const widths=auto.map(o=>this.ext(o).x*2),avg=widths.reduce((a,b)=>a+b,0)/Math.max(1,widths.length);
  const gap=Math.max(0.05,avg*0.35);const total=widths.reduce((a,b)=>a+b,0)+gap*Math.max(0,auto.length-1);
  let x=-total/2;const tallest=Math.max(0,...auto.filter(o=>o.grounded).map(o=>this.ext(o).y*2));
  auto.forEach((o,i)=>{const w=widths[i]!;o.base.set(x+w/2,o.grounded?0:Math.max(this.ext(o).y,tallest*0.5),0);x+=w+gap;});
  for(const o of this.objs)if(o.spec.pos){const p=o.spec.pos.map(Number) as Vec3;o.base.set(p[0]||0,(p[1]||0)+(o.grounded?0:this.ext(o).y),p[2]||0);}
  // relative placements, resolved in dependency order
  const pending=this.objs.filter(o=>!o.spec.pos&&o.spec.near&&this.byId.has(o.spec.near));
  for(let pass=0;pass<4&&pending.length;pass++)for(let i=pending.length-1;i>=0;i--){const o=pending[i]!,ref=this.byId.get(o.spec.near!)!;if(pending.includes(ref)&&ref!==o)continue;o.base.copy(this.placeRelative(o,ref,o.spec.side??'right',Number(o.spec.gap)>=0&&o.spec.gap!==undefined?Number(o.spec.gap):Math.max(0.05,this.ext(ref).x*0.25)));pending.splice(i,1);}
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

 private frameCamera(){
  const c=this.spec.camera??{};const framed=this.objs.filter(o=>o.spec.frame!==false);
  const focus=this.focusObjs(c.focus)??framed;
  const f=this.fit(focus.length?focus:this.objs,c.angle,clamp(Number(c.fill)||0.86,0.2,1.1),clamp(Number(c.screenY)||this.defaultScreenY(),0.25,0.75));
  this.cam={...f,move:c.move??'drift',amount:clamp(Number(c.amount)||1,0,3)};
  const tanH=Math.tan(deg(VFOV/2))*W/H;this.frameWidth=2*tanH*f.dist;
 }
 /** Leave room for a top headline: subject sits lower when the scene has top text. */
 private defaultScreenY(){const top=(this.spec.text??[]).some(x=>x&&(x.style!=='mono'&&x.style!=='label')&&(!x.pos||String(x.pos).startsWith('top')||x.pos==='upper'));return top?0.56:0.5;}
 private focusObjs(f:CameraMove['focus']){if(!f)return undefined;const ids=Array.isArray(f)?f:[f];const list=ids.map(i=>this.byId.get(String(i))).filter((o):o is Obj=>!!o);return list.length?list:undefined;}

 private at(a:SceneEvent['at']|undefined,fallback:number,after=-1){return resolveAt(this.spec,a,this.dur,fallback,after);}

 private compileEvents(){
  const dur=this.dur;
  // entrances / exits
  this.objs.forEach((o,i)=>{
   const enter=o.spec.enter??'materialize';
   if(enter!=='none'){const t0=this.at(o.spec.enterAt,Math.min(0.08+i*0.12,dur*0.4));o.fx.push({kind:enter,out:false,t0,t1:t0+fxLen(enter)});}
   if(o.spec.exit&&o.spec.exit!=='none'){const t0=this.at(o.spec.exitAt,Math.max(0,dur-0.75));o.fx.push({kind:o.spec.exit,out:true,t0,t1:t0+fxLen(o.spec.exit)});}
  });
  const evs=[...(this.spec.events??[])].map((e,i)=>({e,i,t:0}));
  let last=-1;
  for(const x of evs){x.t=this.at(x.e.at,dur*0.5,typeof x.e.at==='string'&&!/^[\d.]+%?s?$/.test(x.e.at)?last:-1);if(typeof x.e.at==='string')last=x.t;}
  evs.sort((a,b)=>a.t-b.t||a.i-b.i);
  for(const {e,t} of evs){
   const d=clamp(Number(e.dur)||0.7,0.05,6);
   if(e.camera){const c=e.camera;const focus=this.focusObjs(c.focus)??this.objs.filter(o=>o.spec.frame!==false);const f=this.fit(focus,c.angle??this.spec.camera?.angle,clamp(Number(c.fill)||Number(this.spec.camera?.fill)||0.86,0.2,1.2),clamp(Number(c.screenY)||this.cam.screenY,0.25,0.75));this.camEvents.push({t0:t,t1:t+Math.max(0.35,Number(e.dur)||0.9),...f});}
   const o=e.target?this.byId.get(e.target):undefined;if(!o)continue;
   if(e.set)for(const [k,v] of Object.entries(e.set)){const list=o.controls.get(k)??[];const from=list.length?list[list.length-1]!.to:(o.ctrl0[k]??0);list.push({t0:t,t1:t+d,from,to:Number(v)||0});o.controls.set(k,list);}
   if(e.pose)o.poses.push({t,dur:Math.min(d,0.6),name:e.pose});
   if(e.move){
    const from=(o.moves.length?o.moves[o.moves.length-1]!.to:o.base).clone();let to=from.clone();
    if(e.move.to){const p=e.move.to.map(Number);to.set(p[0]||0,(p[1]||0)+(o.grounded?0:this.ext(o).y),p[2]||0);}
    else if(e.move.near&&this.byId.has(e.move.near)){const keep=o.base.clone();to=this.placeRelative(o,this.byId.get(e.move.near)!,e.move.side??'right',Number(e.move.gap)||0.1);o.base.copy(keep);}
    else if(e.move.by){const b=e.move.by.map(Number);to.add(new THREE.Vector3(b[0]||0,b[1]||0,b[2]||0));}
    const dist=to.distanceTo(from);const walkDur=o.posable?Math.max(d,dist/1.3):d;
    o.moves.push({t0:t,t1:t+(Number(e.dur)?d:walkDur),from,to});
    if(o.posable&&Math.abs(to.x-from.x)+Math.abs(to.z-from.z)>0.05)o.yaw.push({t0:t,t1:t+0.3,to:Math.atan2(to.x-from.x,to.z-from.z)});
   }
   if(e.turn){const v=e.turn.map(n=>deg(Number(n)||0));o.turns.push({t0:t,t1:t+d,by:new THREE.Vector3(v[0],v[1],v[2])});}
   if(e.scaleTo!==undefined){const from=o.scales.length?o.scales[o.scales.length-1]!.to:1;o.scales.push({t0:t,t1:t+d,from,to:clamp(Number(e.scaleTo)||1,0.01,50)});}
   if(e.hue){const from=o.hues.length?o.hues[o.hues.length-1]!.to:hueColor(o.spec.hue??this.spec.hue);o.hues.push({t0:t,t1:t+d,from,to:hueColor(e.hue)});}
   if(e.show)o.fx.push({kind:e.show,out:false,t0:t,t1:t+fxLen(e.show)});
   if(e.hide)o.fx.push({kind:e.hide,out:true,t0:t,t1:t+fxLen(e.hide)});
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
  for(const m of o.moves){if(t<m.t0){if(m===o.moves[0]&&o.fx.some(f=>f.kind.startsWith('walk-in')))p=m.from.clone();break;}const k=t>=m.t1?1:(o.posable?walkEase((t-m.t0)/(m.t1-m.t0)):ease.inOut((t-m.t0)/(m.t1-m.t0)));p=m.from.clone().lerp(m.to,k);travel+=m.from.distanceTo(m.to)*k;}
  return {p,travel};
 }

 update(t:number){
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
   o.built.update?.(ctrl,t,pose);
   // glow
   for(const m of o.mats)if(m.userData.glow){m.emissiveIntensity=m.userData.glow*(ctrl[m.userData.glowControl as string]??1);}
   // hue
   if(o.hues.length){let c:THREE.Color|null=null;for(const h of o.hues){if(t<h.t0)break;c=t>=h.t1?h.to.clone():h.from.clone().lerp(h.to,ease.inOut((t-h.t0)/(h.t1-h.t0)));}
    if(c)o.mats.forEach(m=>{if(m.userData.explicit)return;m.color.copy(c!).multiplyScalar(m.userData.tone);if(m.userData.glow)m.emissive.copy(c!);});}
   // transform
   const rot=o.baseRot.clone();
   let yaw:number|null=null;for(const y of o.yaw){if(t<y.t0)break;const cur:number=yaw??o.baseRot.y;yaw=t>=y.t1?y.to:lerpAngle(cur,y.to,ease.inOut((t-y.t0)/(y.t1-y.t0)));}
   if(yaw!==null){// back to camera-friendly facing once the walk ends
    const lastMove=o.moves[o.moves.length-1];if(lastMove&&t>lastMove.t1&&o.posable&&!o.fx.some(f=>f.kind.startsWith('walk-out')&&t>=f.t0))yaw=lerpAngle(yaw,o.baseRot.y,ease.inOut((t-lastMove.t1)/0.45));
    rot.y=yaw;}
   for(const tr of o.turns){if(t<tr.t0)break;const kk=t>=tr.t1?1:ease.inOut((t-tr.t0)/(tr.t1-tr.t0));rot.x+=tr.by.x*kk;rot.y+=tr.by.y*kk;rot.z+=tr.by.z*kk;}
   let scale=o.baseScale*evalNum(o.scales,t,1);
   const idle=o.spec.idle??'none';const id=o.spec.id.length;
   if(idle==='spin')rot.y+=t*0.9;
   if(idle==='spin-slow')rot.y+=t*0.35;
   if(idle==='float')p.y+=Math.sin(t*1.6+id)*o.size.y*o.baseScale*0.04;
   if(idle==='pulse')scale*=1+0.04*Math.sin(t*4.2);
   if(idle==='sway')rot.z+=Math.sin(t*1.4+id)*0.06;
   if(idle==='wobble'){rot.x+=Math.sin(t*1.1+id)*0.12;rot.y+=Math.sin(t*0.8)*0.25;}
   // entrance / exit effects
   let reveal=1,vis=true,parts=0,partsOut=false,partsK=0;
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
     }
    }else{
     switch(f.kind){
      case 'dissolve':reveal=1-ease.in(kk);break;
      case 'shatter':parts=1;partsOut=true;partsK=kk;reveal=kk<0.06?1:0;break;
      case 'shrink':scale*=1-ease.in(kk);break;
      case 'fall':p.y-=h*3*ease.in(kk);rot.z+=kk*0.8;break;
      case 'slide-left':p.x-=this.frameWidth*ease.in(kk);break;
      case 'slide-right':p.x+=this.frameWidth*ease.in(kk);break;
     }
    }
   }
   o.outer.position.copy(p);o.outer.rotation.copy(rot);o.outer.scale.setScalar(Math.max(1e-4,scale));
   o.outer.visible=vis;
   for(const m of o.mats){m.opacity=clamp(reveal);}
   o.inner.visible=vis&&reveal>0.002;
   if(parts){this.ensureParticles(o);this.drawParticles(o,partsK,partsOut,t);}else if(o.particles)o.particles.mesh.visible=false;
  }
  // camera
  this.updateCamera(t,dur);
 }

 private ensureParticles(o:Obj){
  if(o.particles)return;
  const n=1600,target=new Float32Array(n*3),scatter=new Float32Array(n*3);
  o.outer.updateMatrixWorld(true);const inv=o.outer.matrixWorld.clone().invert();
  const samplers=o.meshes.filter(m=>(m.geometry.attributes.position?.count??0)>2).map(m=>{const s=new MeshSurfaceSampler(m).build();return {s,m};});
  const areas=samplers.map(({m})=>{const b=new THREE.Box3().setFromObject(m);const v=b.getSize(new THREE.Vector3());return Math.max(1e-6,v.x*v.y+v.y*v.z+v.x*v.z);});
  const tot=areas.reduce((a,b)=>a+b,0);const r=rng(seedOf(o.spec.id));const v=new THREE.Vector3();
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
 private drawParticles(o:Obj,k:number,out:boolean,t:number){
  const P=o.particles!;P.mesh.visible=true;const m=new THREE.Matrix4(),q=new THREE.Quaternion(),e=new THREE.Euler(),s=new THREE.Vector3(),p=new THREE.Vector3();
  const inv=1/Math.max(1e-4,o.outer.scale.x);
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
  let {dir,target,dist,screenY}=this.cam;dir=dir.clone();target=target.clone();
  for(const c of this.camEvents){if(t<c.t0)break;const k=t>=c.t1?1:ease.inOut((t-c.t0)/(c.t1-c.t0));dir.lerp(c.dir,k).normalize();target.lerp(c.target,k);dist=lerp(dist,c.dist,k);screenY=lerp(screenY,c.screenY,k);}
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
  const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),deg(yaw));dir.applyQuaternion(q);
  if(pitch){const right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),dir).normalize();dir.applyAxisAngle(right,-deg(pitch)).normalize();}
  this.camera.position.copy(target).addScaledVector(dir,dist);
  this.camera.up.set(0,1,0);if(Math.abs(dir.y)>0.98)this.camera.up.set(0,0,-1);
  this.camera.lookAt(target);
  this.camera.near=Math.max(0.005,dist*0.02);this.camera.far=dist*60+50;
  this.camera.setViewOffset(W,H,0,(0.5-screenY)*H,W,H);
  this.camera.updateProjectionMatrix();
 }

 /** Screen position (px) of an object's top centre, for labels. */
 project(id:string){const o=this.byId.get(id);if(!o||!o.outer.visible)return null;const b=new THREE.Box3().setFromObject(o.inner,true);if(b.isEmpty())return null;const c=b.getCenter(new THREE.Vector3());c.y=b.max.y;const v=c.project(this.camera);return {x:(v.x*0.5+0.5)*W,y:(-v.y*0.5+0.5)*H};}
}

function fxLen(kind:string){return ({materialize:0.75,assemble:1.15,pop:0.45,grow:0.8,drop:0.7,'slide-left':0.6,'slide-right':0.6,rise:0.8,dissolve:0.6,shatter:1.1,shrink:0.45,fall:0.8,'walk-in-left':0.01,'walk-in-right':0.01,'walk-out-left':0.01,'walk-out-right':0.01} as Record<string,number>)[kind]??0.6;}
function bounce(k:number){const n1=7.5625,d1=2.75;if(k<1/d1)return n1*k*k;if(k<2/d1)return n1*(k-=1.5/d1)*k+0.75;if(k<2.5/d1)return n1*(k-=2.25/d1)*k+0.9375;return n1*(k-=2.625/d1)*k+0.984375;}
function walkEase(k:number){k=clamp(k);const a=0.12;if(k<a)return k*k/(2*a)/(1-a);if(k>1-a)return 1-(1-k)*(1-k)/(2*a)/(1-a);return (k-a/2)/(1-a);}
function lerpAngle(a:number,b:number,k:number){let d=((b-a+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;return a+d*k;}

// ---------------------------------------------------------------- engine
export class Engine {
 renderer:THREE.WebGLRenderer;gl:HTMLCanvasElement;out:HTMLCanvasElement;ctx2d:CanvasRenderingContext2D;
 rtA:THREE.WebGLRenderTarget;rtB:THREE.WebGLRenderTarget;post:THREE.ShaderMaterial;postScene=new THREE.Scene();postCam=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
 scenes:(SceneRuntime|null)[]=[];starts:number[]=[];total=0;
 constructor(public spec:AcryllexSpec){
  this.gl=document.createElement('canvas');this.gl.width=W;this.gl.height=H;
  this.renderer=new THREE.WebGLRenderer({canvas:this.gl,antialias:false,preserveDrawingBuffer:true,alpha:false});
  this.renderer.outputColorSpace=THREE.LinearSRGBColorSpace;this.renderer.toneMapping=THREE.NoToneMapping;this.renderer.setPixelRatio(1);this.renderer.setSize(W,H,false);
  const mk=()=>{const rt=new THREE.WebGLRenderTarget(COLS*SS,ROWS*SS,{type:THREE.HalfFloatType,samples:4,generateMipmaps:true,minFilter:THREE.LinearMipmapLinearFilter,magFilter:THREE.LinearFilter,depthBuffer:true});return rt;};
  this.rtA=mk();this.rtB=mk();
  this.post=new THREE.ShaderMaterial({vertexShader:POST_VERT,fragmentShader:POST_FRAG,uniforms:{tA:{value:this.rtA.texture},tB:{value:this.rtB.texture},mixP:{value:0},mode:{value:0},res:{value:new THREE.Vector2(W,H)},cell:{value:CELL},time:{value:0}}});
  this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.post));
  this.out=document.createElement('canvas');this.out.width=W;this.out.height=H;this.ctx2d=this.out.getContext('2d')!;
  let t=0;for(const s of spec.scenes){this.starts.push(t);t+=sceneDuration(s);}this.total=t;
  this.scenes=spec.scenes.map(()=>null);
 }
 runtime(i:number){
  if(!this.scenes[i]){
   // free scenes we are past
   for(let k=0;k<i-1;k++)if(this.scenes[k]){disposeScene(this.scenes[k]!.scene);this.scenes[k]=null;}
   this.scenes[i]=new SceneRuntime(this.spec.scenes[i]!,i);
  }
  return this.scenes[i]!;
 }
 sceneAt(t:number){let i=0;while(i<this.starts.length-1&&t>=this.starts[i+1]!)i++;return i;}
 renderInto(rt:THREE.WebGLRenderTarget,i:number,local:number){
  const s=this.runtime(i);s.update(local);
  this.renderer.setRenderTarget(rt);this.renderer.setClearColor(0x000000,0);this.renderer.clear();this.renderer.render(s.scene,s.camera);
 }
 frame(t:number,opts:{captions?:boolean}={}){
  const i=this.sceneAt(t),local=t-this.starts[i]!,sc=this.spec.scenes[i]!;
  this.renderInto(this.rtA,i,local);
  let mode=0,mixP=0;
  const tr=sc.transition??'cut';
  if(i>0&&tr!=='cut'&&local<TRANSITION){
   this.renderInto(this.rtB,i-1,local+sceneDuration(this.spec.scenes[i-1]!));
   // B holds the outgoing scene; mixP is the share still showing it
   mode=tr==='wipe'?2:1;mixP=1-ease.inOut(local/TRANSITION);
  }
  this.post.uniforms.mode!.value=mode;this.post.uniforms.mixP!.value=mixP;this.post.uniforms.time!.value=t;
  this.renderer.setRenderTarget(null);this.renderer.setClearColor(0x000000,1);this.renderer.clear();this.renderer.render(this.postScene,this.postCam);
  const c=this.ctx2d;c.globalAlpha=1;c.fillStyle='#000';c.fillRect(0,0,W,H);c.drawImage(this.gl,0,0);
  const rt=this.runtime(i);
  const tctx:TextCtx={ctx:c,t:local,dur:rt.dur,scene:sc,hue:HUES[(sc.hue??'blue') as Hue]??HUES.blue,project:(id)=>rt.project(id)};
  for(const item of sc.text??[])drawText(tctx,item);
  if(opts.captions!==false&&this.spec.captions!==false)drawCaptions(tctx);
  if(tr==='flash'&&i>0&&local<0.12){c.fillStyle=`rgba(255,255,255,${(1-local/0.12)*0.5})`;c.fillRect(0,0,W,H);}
  return this.out;
 }
}

function disposeScene(s:THREE.Scene){s.traverse(o=>{const m=o as THREE.Mesh;if(m.geometry)m.geometry.dispose();const mat=m.material as THREE.Material|THREE.Material[]|undefined;if(Array.isArray(mat))mat.forEach(x=>x.dispose());else mat?.dispose();});}
