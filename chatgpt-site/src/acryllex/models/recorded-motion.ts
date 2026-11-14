import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type {GLTF} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {HumanRig,emptyPose,type HumanPose} from './human-motion.ts';

export interface RecordedAction {clip:string;start:number;end?:number;timeOrigin:number;speed:number;loop:boolean}
export interface RecordedMotionConfig {src:string;sha256?:string;actions:Record<string,RecordedAction>;heading:'initial'|'follow'|'preserve';baselineY?:number}
const fail=(s:string):never=>{throw new Error(`recordedMotion: ${s}`);};
const finite=(v:unknown,name:string,fallback:number)=>v===undefined?fallback:typeof v==='number'&&Number.isFinite(v)?v:fail(`${name} must be finite`);
/** Opt-in only. Actions bind existing human pose names; all clocks are absolute scene seconds. */
export function parseRecordedMotion(value:unknown):RecordedMotionConfig|null{
 if(value===undefined||value===null||value===false)return null;
 if(typeof value!=='object'||Array.isArray(value))return fail('expected an object');
 const v=value as Record<string,unknown>,allowed=['file','url','sha256','actions','heading','baselineY'];
 for(const k of Object.keys(v))if(!allowed.includes(k))fail(`unknown option ${k}`);
 const hasFile=v.file!==undefined,hasURL=v.url!==undefined;
 if(hasFile&&typeof v.file!=='string'||hasURL&&typeof v.url!=='string')fail('file/url must be strings when present');
 if(hasFile===hasURL)fail('provide exactly one file or url');
 const src=String(v.file??v.url).trim();if(!src||!src.split('?')[0]!.toLowerCase().endsWith('.glb'))fail('source must be a skeletal .glb');
 if(v.url!==undefined){let u:URL;try{u=new URL(src);}catch{return fail('invalid URL');}if(u.protocol!=='https:'||u.username||u.password)fail('url must be HTTPS without credentials');}
 const hash=v.sha256===undefined?undefined:typeof v.sha256==='string'&&/^[0-9a-f]{64}$/i.test(v.sha256)?v.sha256.toLowerCase():fail('sha256 must have64hex digits');
 if(v.url!==undefined&&!hash)fail('remote URL requires pinned sha256');
 const heading=v.heading??'initial';if(!['initial','follow','preserve'].includes(String(heading)))fail('heading must be initial, follow or preserve');
 if(!v.actions||typeof v.actions!=='object'||Array.isArray(v.actions)||Object.keys(v.actions).length<1||Object.keys(v.actions).length>32)fail('actions must contain1..32 named clips');
 const actions:Record<string,RecordedAction>=Object.create(null);
 for(const[name,raw]of Object.entries(v.actions as Record<string,unknown>)){
  if(!name.trim()||name==='__proto__'||name==='constructor')fail('invalid action name');
  const a:Record<string,unknown>=typeof raw==='string'?{clip:raw}:raw as Record<string,unknown>;
  if(!a||typeof a!=='object'||Array.isArray(a))fail(`bad action ${name}`);
  for(const k of Object.keys(a))if(!['clip','start','end','timeOrigin','speed','loop'].includes(k))fail(`unknown action option ${k}`);
  if(typeof a.clip!=='string'||!a.clip.trim())fail(`action ${name} needs clip`);
  if(a.loop!==undefined&&typeof a.loop!=='boolean')fail('loop must be boolean');
  const speed=finite(a.speed,'speed',1);if(Math.abs(speed)>16)fail('speed exceeds16');
  const start=finite(a.start,'start',0),end=a.end===undefined?undefined:finite(a.end,'end',0);if(start<0||end!==undefined&&end<=start)fail('clip range must have0<=start<end');
  actions[name]={clip:String(a.clip),start,...(end===undefined?{}:{end}),timeOrigin:finite(a.timeOrigin,'timeOrigin',0),speed,loop:a.loop===true};
 }
 return{src,sha256:hash,actions,heading:heading as RecordedMotionConfig['heading'],...(v.baselineY===undefined?{}:{baselineY:finite(v.baselineY,'baselineY',0)})};
}
/** Must match scripts/acryllex/recorded-motion-assets.mjs. Includes pin to isolate versions of one URL. */
export const recordedMotionKey=(c:Pick<RecordedMotionConfig,'src'|'sha256'>)=>`recorded-motion:${c.sha256??'local'}:${c.src}`;
export function recordedClipTime(time:number,duration:number,action:RecordedAction){
 if(!Number.isFinite(time)||!Number.isFinite(duration)||duration<=0)fail('invalid time or clip duration');
 const lo=action.start,hi=action.end??duration;if(lo<0||hi>duration+1e-6||hi<=lo)fail('action range is outside clip');
 const t=(action.speed<0?hi:lo)+(time-action.timeOrigin)*action.speed;
 if(!Number.isFinite(t))fail('clip time overflow');
 if(!action.loop)return Math.max(lo,Math.min(hi,t));
 const span=hi-lo,q=(((t-lo)%span)+span)%span;return lo+(Math.abs(q-span)<1e-10||Math.abs(q)<1e-10?0:q);
}

/** A private bone-only source instance. Cached templates/clips are read-only and never instance-owned GPU resources. */
export class RecordedMotionSource {
 readonly rig:HumanRig;readonly scene:THREE.Object3D;readonly space=new THREE.Group();
 readonly bindings=new Map<string,{node:THREE.Object3D;property:'position'|'quaternion';interpolant:THREE.Interpolant}[]>();readonly clips=new Map<string,THREE.AnimationClip>();
 readonly baselineY:number;readonly rootMotion=new THREE.Vector3();
 private rest:{o:THREE.Object3D;p:THREE.Vector3;q:THREE.Quaternion;s:THREE.Vector3}[]=[];
 private initial=new Map<string,{yaw:number;position:THREE.Vector3}>();private disposed=false;private pose=emptyPose();
 readonly config:RecordedMotionConfig;
 constructor(template:GLTF,config:RecordedMotionConfig){
  this.config=config;
  let hasMesh=false;template.scene.traverse(o=>{if((o as THREE.Mesh).isMesh)hasMesh=true;});if(hasMesh)fail('motion GLB must contain bones only; strip render meshes before import');
  this.scene=SkeletonUtils.clone(template.scene);this.space.add(this.scene);this.space.updateMatrixWorld(true);
  const names=new Set<string>();this.scene.traverse(o=>{const n=o.name.replace(/^mixamorig\d*:?/,'');if((o as THREE.Bone).isBone){if(names.has(n))fail(`duplicate bone ${n}`);names.add(n);}const s=o.scale;if(![s.x,s.y,s.z,...o.position,...o.quaternion].every(Number.isFinite)||s.x<=0||Math.abs(s.x-s.y)>Math.max(1,s.x)*1e-6||Math.abs(s.x-s.z)>Math.max(1,s.x)*1e-6)fail('source rest transforms must be finite with positive uniform scale');this.rest.push({o,p:o.position.clone(),q:o.quaternion.clone(),s:s.clone()});});
  for(const n of ['Hips','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','LeftToeBase','RightUpLeg','RightLeg','RightFoot','RightToeBase'])if(!names.has(n))fail(`GLTFLoader did not load required Bone ${n}; declare joints in glTF skins`);
  this.rig=new HumanRig(this.space,this.scene,{bindPose:false});const r=this.rig;
  if(r.length.leg<.1||r.length.leg>3||r.restPos('Head').y<=r.hipsRest.y||r.restPos('LeftArm').x<=r.restPos('RightArm').x)fail('source must be a metre-scale upright Y-up, X-left canonical skeleton');
  for(const S of ['Left','Right'])if(r.restPos(S+'ToeBase').z<=r.restPos(S+'Foot').z)fail('source bind feet must face +Z');
  const meta=this.scene.userData.acryllexMotion as {version?:unknown;units?:unknown;up?:unknown;baselineY?:unknown}|undefined;
  if(meta&&(meta.version!==1||meta.units!=='metres'||meta.up!=='Y'))fail('unsupported source version/units/up metadata');
  if(meta?.baselineY!==undefined&&(typeof meta.baselineY!=='number'||!Number.isFinite(meta.baselineY)))fail('invalid hip-height metadata');
  this.baselineY=config.baselineY??(typeof meta?.baselineY==='number'&&Number.isFinite(meta.baselineY)?meta.baselineY:r.hipsRest.y);
  if(!Number.isFinite(this.baselineY))fail('bad hip-height baseline');
  const ancestors=new Set<THREE.Object3D>();for(let o:THREE.Object3D|null=r.nodes[r.need('Hips')]!.o;o;o=o.parent)ancestors.add(o);
  for(const clip of template.animations){
   if(!clip.name||this.clips.has(clip.name)||!Number.isFinite(clip.duration)||clip.duration<=0||!clip.tracks.length)fail('clips need unique names, tracks and positive duration');
   const bindings:{node:THREE.Object3D;property:'position'|'quaternion';interpolant:THREE.Interpolant}[]=[];
   for(const track of clip.tracks){const p=THREE.PropertyBinding.parseTrackName(track.name),node=THREE.PropertyBinding.findNode(this.scene,p.nodeName) as THREE.Object3D|null;if(!node||!((node as THREE.Bone).isBone||ancestors.has(node!)))fail(`track target is not a source bone: ${track.name}`);
    if(p.propertyName!=='quaternion'&&!(p.propertyName==='position'&&ancestors.has(node!)))fail(`unsupported track ${track.name}; bone scaling/length animation is forbidden`);
    if(!Array.from(track.values).every(Number.isFinite)||!Array.from(track.times).every(Number.isFinite)||Array.from(track.times).some((t,i,a)=>t<0||(i>0&&t<=a[i-1]!)))fail('invalid keyframe data');
    if(track.getInterpolation()!==THREE.InterpolateLinear&&track.getInterpolation()!==THREE.InterpolateDiscrete)fail('resample clips to LINEAR or STEP; cubic interpolation is unsupported');
    if(p.propertyName==='position'&&track.getValueSize()!==3)fail('position key size');
    if(p.propertyName==='quaternion'){if(track.getValueSize()!==4)fail('quaternion key size');for(let i=0;i<track.values.length;i+=4){const n=Math.hypot(...Array.from(track.values.slice(i,i+4)));if(Math.abs(n-1)>.002)fail('quaternion keys must be normalized');}}
    bindings.push({node:node!,property:p.propertyName as 'position'|'quaternion',interpolant:track.getInterpolation()===THREE.InterpolateDiscrete?track.InterpolantFactoryMethodDiscrete():track.InterpolantFactoryMethodLinear()});
   }
   this.clips.set(clip.name,clip);this.bindings.set(clip.name,bindings);
  }
  for(const a of Object.values(config.actions)){const c=this.clips.get(a.clip);if(!c)fail(`clip ${a.clip} not found`);recordedClipTime(0,c!.duration,a);}
 }
 has(name:string){return Object.hasOwn(this.config.actions,name);}
 private raw(name:string,time:number){
  for(const x of this.rest){x.o.position.copy(x.p);x.o.quaternion.copy(x.q);x.o.scale.copy(x.s);}
  for(const b of this.bindings.get(name)!){const v=b.interpolant.evaluate(time);if(b.property==='position')b.node.position.fromArray(v);else b.node.quaternion.fromArray(v).normalize();}this.space.updateMatrixWorld(true);
  const r=this.rig,inv=new THREE.Matrix4().copy(this.space.matrixWorld).invert(),sq=this.space.getWorldQuaternion(new THREE.Quaternion()).invert();
  for(let i=0;i<r.nodes.length;i++){const n=r.nodes[i]!;r.Q[i]!.copy(n.o.getWorldQuaternion(new THREE.Quaternion())).premultiply(sq);r.P[i]!.copy(n.o.getWorldPosition(new THREE.Vector3())).applyMatrix4(inv);}
  r.hipsPos.copy(r.P[r.need('Hips')]!);return r.readPose(this.pose);
 }
 sample(name:string,time:number){
  if(this.disposed)fail('source disposed');const a=this.config.actions[name];if(!a)fail(`unbound action ${name}`);const clip=this.clips.get(a.clip)!,t=recordedClipTime(time,clip.duration,a);
  const initialKey=JSON.stringify([a.clip,a.start,a.end??clip.duration,a.speed<0]);
  if(!this.initial.has(initialKey)){const p=this.raw(a.clip,a.speed<0?(a.end??clip.duration):a.start),v=new THREE.Vector3(0,0,1).applyQuaternion(p.hips);this.initial.set(initialKey,{yaw:v.x*v.x+v.z*v.z<1e-10?0:Math.atan2(v.x,v.z),position:this.rig.hipsPos.clone()});}
  const first=this.initial.get(initialKey)!,p=this.raw(a.clip,t),r=this.rig;this.rootMotion.copy(r.hipsPos).sub(first.position);this.rootMotion.y=0;this.rootMotion.divideScalar(r.length.leg);
  p.hipsOffset.set(0,(r.hipsPos.y-this.baselineY)/r.length.leg,0);
  if(this.config.heading!=='preserve'){const v=new THREE.Vector3(0,0,1).applyQuaternion(p.hips),yaw=this.config.heading==='follow'&&v.x*v.x+v.z*v.z>=1e-10?Math.atan2(v.x,v.z):first.yaw;const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-yaw);p.hips.premultiply(q);for(const s of p.spine)s.premultiply(q);for(const s of p.neck)s.premultiply(q);p.head.premultiply(q);for(const s of p.limbs.values())s.premultiply(q);this.rootMotion.applyQuaternion(q);}
  return p;
 }
 dispose(){if(this.disposed)return;this.disposed=true;this.bindings.clear();this.initial.clear();this.clips.clear();this.scene.clear();this.space.clear();this.rest=[];}
}
