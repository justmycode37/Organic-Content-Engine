import * as THREE from 'three';

/**
 * Generic human rig + motion layer for any Mixamo-named skinned body (the scanned avatars and the anatomical bodies alike).
 *
 * Everything is solved in RIG SPACE: metres, Y up, the figure facing +Z, measured from the rig root. Bone-local axes of the
 * file never matter, so a converted armature (rotated, 0.01-scaled, hips stored along local Z) poses exactly like a clean one.
 *
 * Limbs are described by ANATOMICAL FRAMES (X along the bone, Y the flexion hinge) instead of file rest rotations. Two rigs
 * with different bind poses (T pose, A pose, bent elbows) therefore take the same physical pose from the same data, and no
 * pose ever needs a bone to be scaled: segment lengths are constants of the body.
 */
export type Side='Left'|'Right';
export const SIDES:readonly Side[]=['Left','Right'];
export type LimbEnd='handL'|'handR'|'footL'|'footR';
export type Vec3=[number,number,number];
const bare=(n:string)=>n.replace(/^mixamorig\d*:?/,'');
const DEG=Math.PI/180;
const V=()=>new THREE.Vector3(),Qn=()=>new THREE.Quaternion();
const _m=new THREE.Matrix4(),_e=new THREE.Euler(),_a=V(),_b=V(),_c=V(),_q=Qn(),_q2=Qn();

/** Orientation whose X axis is `x` and whose Y axis is `yHint` made perpendicular to it. */
export function frameQuat(x:THREE.Vector3,yHint:THREE.Vector3,out=Qn()){
 const X=_a.copy(x).normalize(),Y=_b.copy(yHint).addScaledVector(X,-yHint.dot(X));
 if(Y.lengthSq()<1e-12){Y.set(0,1,0).addScaledVector(X,-X.y);if(Y.lengthSq()<1e-12)Y.set(1,0,0);}
 Y.normalize();const Z=_c.crossVectors(X,Y);
 return out.setFromRotationMatrix(_m.makeBasis(X,Y,Z));
}
export function eulerQuat(deg:readonly number[]|undefined,out=Qn()){return deg?out.setFromEuler(_e.set((deg[0]??0)*DEG,(deg[1]??0)*DEG,(deg[2]??0)*DEG)):out.identity();}
/** Twist of `q` about the unit `axis` (swing = q · twist⁻¹). */
function twistAbout(q:THREE.Quaternion,axis:THREE.Vector3,out=Qn()){const d=q.x*axis.x+q.y*axis.y+q.z*axis.z;out.set(axis.x*d,axis.y*d,axis.z*d,q.w);if(out.lengthSq()<1e-12)return out.identity();return out.normalize();}
function powQuat(q:THREE.Quaternion,k:number,out=Qn()){return out.identity().slerp(q,k);}

/** Put every skeleton under `root` in its bind pose; root bones keep their file transform (converted axes / unit scale). */
export function bindPose(root:THREE.Object3D){
 const done=new Set<THREE.Skeleton>();
 root.traverse(o=>{const sk=(o as THREE.SkinnedMesh).skeleton;if(!sk||done.has(sk))return;done.add(sk);
  const keep=sk.bones.filter(b=>!(b.parent as THREE.Bone|null)?.isBone).map(b=>({b,p:b.position.clone(),q:b.quaternion.clone(),s:b.scale.clone()}));
  sk.pose();for(const k of keep){k.b.position.copy(k.p);k.b.quaternion.copy(k.q);k.b.scale.copy(k.s);}});
}

interface Node {o:THREE.Object3D;parent:number;name:string;restLocalQ:THREE.Quaternion;restLocalP:THREE.Vector3;restQ:THREE.Quaternion;restP:THREE.Vector3;off:THREE.Vector3;K:THREE.Quaternion|null}
const LIMB=['Shoulder','Arm','ForeArm','Hand','UpLeg','Leg','Foot','ToeBase'] as const;
const FINGERS=['Thumb','Index','Middle','Ring','Pinky'] as const;

/** A canonical human pose: trunk rotations are deltas from the upright rest, limb rotations are anatomical frames. */
export interface HumanPose {
 hips:THREE.Quaternion;spine:THREE.Quaternion[];neck:THREE.Quaternion[];head:THREE.Quaternion;
 limbs:Map<string,THREE.Quaternion>;
 /** Hips displacement from rest, in leg lengths (so it transfers between bodies of different size). */
 hipsOffset:THREE.Vector3;
}
export const emptyPose=():HumanPose=>({hips:Qn(),spine:[],neck:[],head:Qn(),limbs:new Map(),hipsOffset:V()});

export class HumanRig {
 readonly nodes:Node[]=[];readonly index=new Map<string,number>();
 readonly spine:number[]=[];readonly neck:number[]=[];
 /** Model orientation / position of every node after solve(). */
 readonly Q:THREE.Quaternion[]=[];readonly P:THREE.Vector3[]=[];
 private target:(THREE.Quaternion|null)[]=[];
 readonly hipsRest=V();readonly hipsPos=V();
 readonly length={upperArm:0,foreArm:0,thigh:0,shin:0,leg:0};
 /** Rig-space points measured from the skin at rest, each riding on a bone: head centre/top/front, heel, toe, sole. */
 readonly anchors=new Map<string,{bone:number;d:THREE.Vector3}>();
 private fingerAxis=new Map<number,THREE.Vector3>();
 readonly fingerCurl:Record<Side,number>={Left:0,Right:0};
 private unit=1;
 private dirty=true;

 /** `space` is the object whose local coordinates are rig space (it must contain `skin`). The bodies are measured in bind pose. */
 constructor(readonly space:THREE.Object3D,readonly skin:THREE.Object3D){
  bindPose(skin);space.updateMatrixWorld(true);
  const inv=new THREE.Matrix4().copy(space.matrixWorld).invert(),sq=space.getWorldQuaternion(Qn()).invert();
  const walk=(o:THREE.Object3D,parent:number)=>{
   const i=this.nodes.length,restQ=o.getWorldQuaternion(Qn()).premultiply(sq),restP=o.getWorldPosition(V()).applyMatrix4(inv);
   const off=parent<0?restP.clone():restP.clone().sub(this.nodes[parent]!.restP).applyQuaternion(_q.copy(this.nodes[parent]!.restQ).invert());
   this.nodes.push({o,parent,name:bare(o.name),restLocalQ:o.quaternion.clone(),restLocalP:o.position.clone(),restQ,restP,off,K:null});
   if((o as THREE.Bone).isBone&&!this.index.has(bare(o.name)))this.index.set(bare(o.name),i);
   this.Q.push(restQ.clone());this.P.push(restP.clone());this.target.push(null);
   for(const c of o.children)if(!(c as THREE.Mesh).isMesh)walk(c,i);
  };
  walk(skin,-1);
  const hips=this.index.get('Hips');if(hips===undefined)throw new Error('human rig needs a Hips bone');
  for(let i=this.need('Head');i>=0&&i!==hips;i=this.nodes[i]!.parent){const n=this.nodes[i]!.name;if(/^Neck\d*$/.test(n))this.neck.unshift(i);else if(/^Spine\d*$/.test(n))this.spine.unshift(i);}
  this.hipsRest.copy(this.nodes[hips]!.restP);this.hipsPos.copy(this.hipsRest);
  const hp=this.nodes[this.nodes[hips]!.parent];this.unit=hp?hp.o.getWorldScale(V()).x/Math.max(1e-9,space.getWorldScale(V()).x):1;
  const p=(n:string)=>this.nodes[this.need(n)]!.restP,dist=(a:string,b:string)=>p(a).distanceTo(p(b));
  this.length.upperArm=dist('LeftArm','LeftForeArm');this.length.foreArm=dist('LeftForeArm','LeftHand');this.length.thigh=dist('LeftUpLeg','LeftLeg');this.length.shin=dist('LeftLeg','LeftFoot');this.length.leg=this.length.thigh+this.length.shin;
  this.measureFrames();this.measureAnchors();
 }
 has(name:string){return this.index.has(name);}
 need(name:string){const i=this.index.get(name);if(i===undefined)throw new Error(`human rig is missing bone ${name}`);return i;}
 restPos(name:string){return this.nodes[this.need(name)]!.restP;}

 private setK(name:string,x:THREE.Vector3,hinge:THREE.Vector3){const i=this.index.get(name);if(i===undefined)return;const F=frameQuat(x,hinge);this.nodes[i]!.K=F.invert().multiply(this.nodes[i]!.restQ);}
 /** Rest anatomical frames from joint geometry alone, so any bind pose is understood. */
 private measureFrames(){
  const X=new THREE.Vector3(1,0,0);
  for(const S of SIDES){
   const s=S==='Left'?1:-1,at=(n:string)=>this.restPos(S+n);
   const up=at('ForeArm').clone().sub(at('Arm')).normalize(),lo=at('Hand').clone().sub(at('ForeArm')).normalize();
   const bend=up.clone().cross(lo),hinge=bend.length()>0.14?bend.normalize():new THREE.Vector3(0,-s,0);
   this.setK(S+'Arm',up,hinge);this.setK(S+'ArmRoll',up,hinge);this.setK(S+'ForeArm',lo,hinge);this.setK(S+'ForeArmRoll',lo,hinge);
   const hand=this.nodes[this.need(S+'Hand')]!.restP,mid=this.index.get(S+'HandMiddle1'),ix=this.index.get(S+'HandIndex1'),pk=this.index.get(S+'HandPinky1');
   const hdir=mid!==undefined?this.nodes[mid]!.restP.clone().sub(hand).normalize():lo.clone();
   const palm=ix!==undefined&&pk!==undefined?this.nodes[ix]!.restP.clone().sub(hand).cross(this.nodes[pk]!.restP.clone().sub(hand)).normalize():new THREE.Vector3(0,s,0);
   this.setK(S+'Hand',hdir,palm);
   // finger hinges: curling moves each finger towards the palm
   const dorsal=palm.clone().multiplyScalar(s);
   for(const f of FINGERS)for(let k=1;k<=3;k++){const i=this.index.get(`${S}Hand${f}${k}`),j=this.index.get(`${S}Hand${f}${k+1}`);if(i===undefined)continue;
    const dir=(j!==undefined?this.nodes[j]!.restP.clone().sub(this.nodes[i]!.restP):hdir.clone()).normalize();
    const axis=dir.clone().cross(dorsal.clone().negate());if(axis.lengthSq()<1e-8)continue;
    this.fingerAxis.set(i,axis.normalize().applyQuaternion(_q.copy(this.nodes[i]!.restQ).invert()));}
   this.setK(S+'UpLeg',at('Leg').clone().sub(at('UpLeg')),X);this.setK(S+'Leg',at('Foot').clone().sub(at('Leg')),X);
   const toe=this.index.get(S+'ToeBase');const fwd=toe!==undefined?this.nodes[toe]!.restP.clone().sub(at('Foot')).setY(0):new THREE.Vector3(0,0,1);
   this.setK(S+'Foot',fwd.lengthSq()>1e-8?fwd:new THREE.Vector3(0,0,1),X);
  }
 }
 /** Skin-derived reference points: the head volume and the sole, so contacts are solved against the body's real surface. */
 private measureAnchors(){
  const head=new THREE.Box3(),feet:Record<Side,THREE.Box3>={Left:new THREE.Box3(),Right:new THREE.Box3()};const v=V();
  this.skin.traverse(o=>{const mesh=o as THREE.SkinnedMesh;if(!mesh.isSkinnedMesh)return;const pos=mesh.geometry.getAttribute('position'),si=mesh.geometry.getAttribute('skinIndex'),sw=mesh.geometry.getAttribute('skinWeight');if(!pos||!si||!sw)return;
   const kind=mesh.skeleton.bones.map(b=>{const n=bare(b.name);return /^(Head|HeadTop_End)$/.test(n)?1:/^Left(Foot|ToeBase|Toe_End)$/.test(n)?2:/^Right(Foot|ToeBase|Toe_End)$/.test(n)?3:0;});
   const toRig=new THREE.Matrix4().copy(this.space.matrixWorld).invert().multiply(mesh.matrixWorld);
   const step=Math.max(1,Math.floor(pos.count/6000));
   for(let i=0;i<pos.count;i+=step){const w=[0,0,0,0];for(let j=0;j<4;j++)w[kind[si.getComponent(i,j)]??0]!+=sw.getComponent(i,j);
    const k=w[1]!>0.7?1:w[2]!>0.7?2:w[3]!>0.7?3:0;if(!k)continue;v.fromBufferAttribute(pos,i).applyMatrix4(toRig);
    (k===1?head:k===2?feet.Left:feet.Right).expandByPoint(v);}});
  const put=(name:string,bone:string,p:THREE.Vector3)=>{const i=this.index.get(bone);if(i!==undefined)this.anchors.set(name,{bone:i,d:p.clone().sub(this.nodes[i]!.restP)});};
  if(!head.isEmpty()){const c=head.getCenter(V());put('headCenter','Head',c);put('headTop','Head',new THREE.Vector3(c.x,head.max.y,c.z));put('faceFront','Head',new THREE.Vector3(c.x,c.y,head.max.z));put('chin','Head',new THREE.Vector3(c.x,head.min.y,c.z+(head.max.z-c.z)*.55));}
  for(const S of SIDES){const b=feet[S];if(b.isEmpty())continue;const x=(b.min.x+b.max.x)/2,toe=this.has(S+'ToeBase')?S+'ToeBase':S+'Foot';
   put(S+'Heel',S+'Foot',new THREE.Vector3(x,b.min.y,b.min.z));put(S+'Toe',toe,new THREE.Vector3(x,b.min.y,b.max.z));put(S+'Ball',S+'Foot',new THREE.Vector3(x,b.min.y,this.restPos(toe).z));put(S+'Sole',S+'Foot',new THREE.Vector3(x,b.min.y,this.restPos(S+'Foot').z));}
 }
 /** Height of the ankle joint above the sole at rest. */
 ankleHeight(S:Side){const a=this.anchors.get(S+'Sole');return a?-a.d.y:this.restPos(S+'Foot').y;}

 // ---------- pose ----------
 reset(){this.target.fill(null);this.hipsPos.copy(this.hipsRest);this.fingerCurl.Left=this.fingerCurl.Right=0;this.dirty=true;}
 /** Trunk bone: model-space delta from rest. Limb bone: anatomical frame. */
 set(i:number,rot:THREE.Quaternion){const n=this.nodes[i]!;const t=this.target[i]??(this.target[i]=Qn());if(n.K)t.copy(rot).multiply(n.K);else t.copy(rot).multiply(n.restQ);this.dirty=true;}
 setNamed(name:string,rot:THREE.Quaternion){const i=this.index.get(name);if(i!==undefined)this.set(i,rot);}
 /** Current rotation in the same convention as set(); valid after solve(). */
 get(i:number,out=Qn()){const n=this.nodes[i]!;return out.copy(this.Q[i]!).multiply(_q.copy(n.K??n.restQ).invert());}
 getNamed(name:string,out=Qn()){return this.get(this.need(name),out);}

 /** Take a canonical pose. Spine and neck chains of any length resample the source chain, so curvature stays smooth. */
 applyPose(p:HumanPose){
  this.set(this.need('Hips'),p.hips);
  const chain=(ids:number[],base:THREE.Quaternion,src:THREE.Quaternion[])=>{const m=src.length;if(!m)return;
   ids.forEach((id,k)=>{const u=(k+.5)/ids.length*m-.5,j=Math.floor(u);const a=j<0?base:src[Math.min(m-1,j)]!,b=src[Math.min(m-1,Math.max(0,j+1))]!;this.set(id,_q2.copy(a).slerp(b,j<0?(u+.5)*2:u-j));});};
  chain(this.spine,p.hips,p.spine);chain(this.neck,p.spine[p.spine.length-1]??p.hips,p.neck);
  this.set(this.need('Head'),p.head);
  for(const [name,q] of p.limbs){const i=this.index.get(name);if(i!==undefined)this.set(i,q);}
  this.hipsPos.copy(this.hipsRest).addScaledVector(p.hipsOffset,this.length.leg);
 }
 /** Read the solved pose back in canonical form. */
 readPose(out=emptyPose()):HumanPose{
  this.get(this.need('Hips'),out.hips);out.spine=this.spine.map(i=>this.get(i));out.neck=this.neck.map(i=>this.get(i));this.get(this.need('Head'),out.head);
  for(const S of SIDES)for(const l of LIMB){const i=this.index.get(S+l);if(i!==undefined)out.limbs.set(S+l,this.get(i));}
  out.hipsOffset.copy(this.hipsPos).sub(this.hipsRest).divideScalar(this.length.leg);return out;
 }

 /** Forward kinematics of the whole rig in rig space. */
 solve(){
  const hips=this.index.get('Hips')!;
  for(let i=0;i<this.nodes.length;i++){const n=this.nodes[i]!,q=this.Q[i]!,p=this.P[i]!;
   if(n.parent<0){q.copy(n.restQ);p.copy(n.restP);continue;}
   const pq=this.Q[n.parent]!;const t=this.target[i];
   if(t)q.copy(t);else q.copy(pq).multiply(n.restLocalQ);
   if(i===hips)p.copy(this.hipsPos);else p.copy(n.off).applyQuaternion(pq).add(this.P[n.parent]!);}
  this.dirty=false;return this;
 }
 pos(name:string){if(this.dirty)this.solve();return this.P[this.need(name)]!;}
 /** Rig-space position of a measured anchor (headCenter, LeftHeel, …) or bone in the current pose. */
 point(name:string,out=V()){
  if(this.dirty)this.solve();const a=this.anchors.get(name);
  if(!a){const i=this.index.get(name);return i===undefined?null:out.copy(this.P[i]!);}
  const n=this.nodes[a.bone]!;return out.copy(a.d).applyQuaternion(_q.copy(this.Q[a.bone]!).multiply(_q2.copy(n.restQ).invert())).add(this.P[a.bone]!);
 }

 /**
  * Two-bone IK for an arm or a leg: the wrist/ankle is placed at `target` (rig space) with fixed segment lengths.
  * `pole` is a rig-space point the elbow/knee bends towards (default: where the current pose already bends).
  * `weight` blends from the forward-kinematic pose. Returns how far the target is beyond reach (0 when reachable).
  */
 ik(S:Side,limb:'arm'|'leg',target:THREE.Vector3,opt:{pole?:THREE.Vector3;weight?:number}={}){
  const w=opt.weight??1;if(w<=0)return 0;if(this.dirty)this.solve();
  const [a,b,c]=limb==='arm'?[S+'Arm',S+'ForeArm',S+'Hand']:[S+'UpLeg',S+'Leg',S+'Foot'];
  const ia=this.need(a),ib=this.need(b),ic=this.need(c),p0=this.P[ia]!,l1=this.P[ib]!.distanceTo(p0),l2=this.P[ic]!.distanceTo(this.P[ib]!);
  const d=target.clone().sub(p0),raw=d.length(),dist=Math.min(Math.max(raw,Math.abs(l1-l2)+1e-4),(l1+l2)*0.9995);d.normalize();
  const hint=(opt.pole?opt.pole.clone():this.P[ib]!.clone()).sub(p0);hint.addScaledVector(d,-hint.dot(d));
  if(hint.lengthSq()<1e-10){hint.set(0,limb==='arm'?-1:0,limb==='arm'?-0.3:1);hint.addScaledVector(d,-hint.dot(d));}
  hint.normalize();
  const cos=Math.min(1,Math.max(-1,(l1*l1+dist*dist-l2*l2)/(2*l1*dist))),sin=Math.sqrt(1-cos*cos);
  const u=d.clone().multiplyScalar(cos).addScaledVector(hint,sin),elbow=p0.clone().addScaledVector(u,l1),lo=p0.clone().addScaledVector(d,dist).sub(elbow).normalize();
  let hinge=u.clone().cross(lo);if(hinge.lengthSq()<1e-8)hinge=hint.clone().cross(d);hinge.normalize();
  // the hinge is "upper × lower" by construction, the same rule the rest frames are measured with
  const fa=frameQuat(u,hinge),fb=frameQuat(lo,hinge);
  if(w<1){fa.copy(this.get(ia,Qn()).slerp(fa,w));fb.copy(this.get(ib,Qn()).slerp(fb,w));}
  const end=this.get(ic,Qn()),before=this.get(ib,Qn());
  this.set(ia,fa);this.set(ib,fb);
  // hands keep their bend relative to the forearm; feet keep their own rig-space orientation
  if(limb==='arm')this.set(ic,fb.clone().multiply(before.invert().multiply(end)));else this.set(ic,end);
  for(const roll of [a+'Roll',b+'Roll']){const i=this.index.get(roll);if(i!==undefined)this.target[i]=null;}
  return Math.max(0,raw-(l1+l2));
 }

 /** Write the pose to the bones. Roll bones take their share of twist, so shoulders and wrists do not candy-wrap. */
 write(){
  for(const S of SIDES){
   const arm=this.index.get(S+'Arm'),roll=this.index.get(S+'ArmRoll'),fore=this.index.get(S+'ForeArm'),froll=this.index.get(S+'ForeArmRoll'),hand=this.index.get(S+'Hand');
   if(arm!==undefined&&roll!==undefined&&this.target[arm]){
    const n=this.nodes[arm]!,full=this.target[arm]!.clone();this.solve();
    const parentDelta=_q.copy(this.Q[n.parent]!).multiply(_q2.copy(this.nodes[n.parent]!.restQ).invert()).clone();
    const delta=full.clone().multiply(_q2.copy(n.restQ).invert()),local=parentDelta.clone().invert().multiply(delta);
    const axis=this.nodes[this.need(S+'ForeArm')]!.restP.clone().sub(n.restP).normalize(),twist=twistAbout(local,axis,Qn()),swing=local.clone().multiply(twist.clone().invert());
    this.target[arm]!.copy(parentDelta).multiply(swing).multiply(powQuat(twist,0.3)).multiply(n.restQ);
    (this.target[roll]??(this.target[roll]=Qn())).copy(delta).multiply(this.nodes[roll]!.restQ);
   }
   if(fore!==undefined&&froll!==undefined&&hand!==undefined&&this.target[hand]&&this.target[fore]){
    const nf=this.nodes[fore]!,nh=this.nodes[hand]!;
    const df=this.target[fore]!.clone().multiply(_q2.copy(nf.restQ).invert()),dh=this.target[hand]!.clone().multiply(_q2.copy(nh.restQ).invert());
    const axis=nh.restP.clone().sub(nf.restP).normalize(),twist=twistAbout(df.clone().invert().multiply(dh),axis,Qn());
    (this.target[froll]??(this.target[froll]=Qn())).copy(df).multiply(powQuat(twist,0.6)).multiply(this.nodes[froll]!.restQ);
   }
  }
  this.solve();
  const hips=this.index.get('Hips')!;
  for(let i=0;i<this.nodes.length;i++){const n=this.nodes[i]!;if(n.parent<0||!(n.o as THREE.Bone).isBone)continue;
   n.o.quaternion.copy(_q.copy(this.Q[n.parent]!).invert()).multiply(this.Q[i]!);
   const axis=this.fingerAxis.get(i);if(axis){const S:Side=n.name.startsWith('Left')?'Left':'Right',curl=this.fingerCurl[S];if(curl)n.o.quaternion.multiply(_q.setFromAxisAngle(axis,curl*(n.name.includes('Thumb')?0.35:1)));}
   if(i===hips){const pn=this.nodes[n.parent]!;n.o.position.copy(this.hipsPos).sub(this.hipsRest).applyQuaternion(_q.copy(pn.restQ).invert()).divideScalar(this.unit).add(n.restLocalP);}
  }
 }
}

/** Motion-capture clips played on a hidden source rig and read as canonical poses. */
export class MocapSource {
 readonly rig:HumanRig;readonly mixer:THREE.AnimationMixer;readonly actions=new Map<string,THREE.AnimationAction>();
 private hips:number;private unit:number;
 constructor(scene:THREE.Object3D,clips:THREE.AnimationClip[]){
  const space=new THREE.Group();space.add(scene);this.rig=new HumanRig(space,scene);
  this.mixer=new THREE.AnimationMixer(scene);
  for(const c of clips){const a=this.mixer.clipAction(c);a.play();a.setEffectiveWeight(0);this.actions.set(c.name,a);}
  this.hips=this.rig.need('Hips');const hp=this.rig.nodes[this.rig.nodes[this.hips]!.parent]!;this.unit=hp.o.getWorldScale(V()).x;
 }
 duration(clip:string){return this.actions.get(clip)?.getClip().duration??1;}
 /** Blend clips ({clip:[weight, time]}) and return the canonical pose. */
 sample(mix:Record<string,[number,number]>,out=emptyPose()):HumanPose{
  for(const [name,a] of this.actions){const m=mix[name];const w=m?.[0]??0;a.enabled=w>0.001;a.setEffectiveWeight(w);if(m)a.time=m[1];}
  this.mixer.update(0);
  const r=this.rig,N=r.nodes;
  for(let i=0;i<N.length;i++){const n=N[i]!;if(n.parent<0)continue;r.Q[i]!.copy(r.Q[n.parent]!).multiply(n.o.quaternion);}
  out.hips=r.get(this.hips,out.hips);out.spine=r.spine.map(i=>r.get(i));out.neck=r.neck.map(i=>r.get(i));r.get(r.need('Head'),out.head);
  for(const S of SIDES)for(const l of LIMB){const i=r.index.get(S+l);if(i!==undefined)out.limbs.set(S+l,r.get(i));}
  const h=N[this.hips]!,pn=N[h.parent]!;
  // clips are in place: height and sideways sway transfer, a forward offset of the capture does not
  out.hipsOffset.copy(h.o.position).sub(h.restLocalP).multiplyScalar(this.unit).applyQuaternion(pn.restQ).divideScalar(r.length.leg).setZ(0);
  return out;
 }
}

// ---------- legacy named-pose offsets (degrees about rig axes, accumulated down the body) ----------
export type OffsetPose=Partial<Record<string,readonly number[]>>&{y?:number;lie?:number};
const OFFSET_LIMBS:[string,string][]=[['sh','Arm'],['el','ForeArm'],['wr','Hand'],['hip','UpLeg'],['kn','Leg'],['ank','Foot']];
/**
 * Layer joint offsets on the rig's current targets. A spine or neck offset is spread over the whole chain (a real back
 * curves; it does not fold at one vertebra). Offsets rotate about rig axes: x>0 leans/swings forward-down, like the pose bank.
 */
export function applyOffsets(rig:HumanRig,a:OffsetPose|undefined,b:OffsetPose|undefined,k:number){
 if(!a&&!b)return;
 const off=(key:string,scale=1)=>{const x=a?.[key] as readonly number[]|undefined,y=b?.[key] as readonly number[]|undefined;if(!x&&!y)return null;
  return new THREE.Quaternion().setFromEuler(_e.set(((x?.[0]??0)*(1-k)+(y?.[0]??0)*k)*DEG*scale,((x?.[1]??0)*(1-k)+(y?.[1]??0)*k)*DEG*scale,((x?.[2]??0)*(1-k)+(y?.[2]??0)*k)*DEG*scale));};
 rig.solve();const cur=Qn();
 // every get() below reads the pose solved above; set() only records targets
 const pre=(i:number|undefined,E:THREE.Quaternion)=>{if(i!==undefined)rig.set(i,E.clone().multiply(rig.get(i,cur)));};
 const pelvis=off('hips')??Qn();pre(rig.need('Hips'),pelvis);
 const E=pelvis.clone();
 const chain=(ids:number[],key:string)=>{const step=off(key,1/Math.max(1,ids.length));for(const id of ids){if(step)E.multiply(step);pre(id,E);}};
 chain(rig.spine,'spine');const chest=E.clone();
 chain(rig.neck,'neck');const h=off('head');if(h)E.multiply(h);pre(rig.need('Head'),E);
 for(const S of SIDES){const s=S==='Left'?'L':'R';
  const arm=chest.clone();pre(rig.index.get(S+'Shoulder'),arm);
  for(const [key,bone] of OFFSET_LIMBS.slice(0,3)){const o=off(key+s);if(o)arm.multiply(o);pre(rig.index.get(S+bone),arm);}
  const leg=pelvis.clone();
  for(const [key,bone] of OFFSET_LIMBS.slice(3)){const o=off(key+s);if(o)leg.multiply(o);pre(rig.index.get(S+bone),leg);}
  pre(rig.index.get(S+'ToeBase'),leg);
 }
}

// ---------- data-driven pose / IK tracks ----------
export interface LimbKey {pos?:Vec3;pole?:Vec3;weight?:number;/** hand: wrist bend relative to the forearm; foot: pitch/yaw/roll from flat (degrees) */rot?:Vec3;curl?:number}
export interface TrackKey {
 t:number;
 /** 0 = the underlying motion (mocap + named pose) alone, 1 = the keyed trunk fully replaces it. */
 weight?:number;
 hips?:{pos?:Vec3;rot?:Vec3};
 /** Total chest rotation relative to the pelvis, spread along the spine (degrees). */
 spine?:Vec3;neck?:Vec3;head?:Vec3;
 handL?:LimbKey;handR?:LimbKey;footL?:LimbKey;footR?:LimbKey;
 /** Gait phase in cycles at this time (one cycle = two steps); replaces the walk clock so foot strikes can be timed exactly. */
 gait?:number;
 /** Additive joint offsets (degrees, like poseAdjustments) and `y` in metres, layered on the underlying motion. */
 offset?:OffsetPose;
}
export interface MotionTrack {keys:TrackKey[];/** 'metres' (default) or 'stature': positions in units of the body's standing height */units?:'metres'|'stature';
 /** 'model' (default): positions ride with the figure. 'path': z is measured along the walked path from the figure's start, so keyed feet, hands and hips stay put in the world while the figure (and a following camera) still travels. */
 space?:'model'|'path'}

type Sample={t:number;v:number[]};
function channel(keys:TrackKey[],pick:(k:TrackKey)=>readonly number[]|number|undefined):Sample[]{const out:Sample[]=[];for(const k of keys){const v=pick(k);if(v===undefined)continue;out.push({t:k.t,v:typeof v==='number'?[v]:[...v]});}return out;}
/** Catmull-Rom through the keys (non-uniform times), held outside the keyed range. `linear` avoids overshoot for weights. */
export function sampleChannel(s:Sample[],t:number,linear=false):number[]|null{
 if(!s.length)return null;if(t<=s[0]!.t)return s[0]!.v;const last=s[s.length-1]!;if(t>=last.t)return last.v;
 let i=0;while(s[i+1]!.t<t)i++;
 const p1=s[i]!,p2=s[i+1]!,p0=s[i-1]??p1,p3=s[i+2]??p2,h=p2.t-p1.t,u=(t-p1.t)/h;
 if(linear){const e=u*u*(3-2*u);return p1.v.map((a,j)=>a+(p2.v[j]!-a)*e);}
 const u2=u*u,u3=u2*u;
 return p1.v.map((a,j)=>{const b=p2.v[j]!,m1=p0===p1?(b-a)/h:(b-p0.v[j]!)/(p2.t-p0.t),m2=p3===p2?(b-a)/h:(p3.v[j]!-a)/(p3.t-p1.t);
  return (2*u3-3*u2+1)*a+(u3-2*u2+u)*h*m1+(-2*u3+3*u2)*b+(u3-u2)*h*m2;});
}
export function parseTrack(input:unknown):MotionTrack|null{
 if(!input||typeof input!=='object')return null;const raw=(input as {keys?:unknown}).keys;if(!Array.isArray(raw))return null;
 const num=(v:unknown)=>typeof v==='number'&&Number.isFinite(v),vec=(v:unknown):Vec3|undefined=>Array.isArray(v)&&v.length===3&&v.every(num)?[v[0],v[1],v[2]] as Vec3:undefined;
 const limb=(v:unknown):LimbKey|undefined=>{if(!v||typeof v!=='object')return undefined;const o=v as Record<string,unknown>;const out:LimbKey={};const p=vec(o.pos),q=vec(o.pole),r=vec(o.rot);if(p)out.pos=p;if(q)out.pole=q;if(r)out.rot=r;if(num(o.weight))out.weight=o.weight as number;if(num(o.curl))out.curl=o.curl as number;return out;};
 const keys:TrackKey[]=[];
 for(const k of raw){if(!k||typeof k!=='object'||!num((k as TrackKey).t))continue;const o=k as Record<string,unknown>;const key:TrackKey={t:o.t as number};
  if(num(o.weight))key.weight=o.weight as number;
  if(o.hips&&typeof o.hips==='object'){const h=o.hips as Record<string,unknown>;key.hips={};const p=vec(h.pos),r=vec(h.rot);if(p)key.hips.pos=p;if(r)key.hips.rot=r;}
  for(const c of ['spine','neck','head'] as const){const v=vec(o[c]);if(v)key[c]=v;}
  for(const c of ['handL','handR','footL','footR'] as const){const v=limb(o[c]);if(v)key[c]=v;}
  if(num(o.gait))key.gait=o.gait as number;
  if(o.offset&&typeof o.offset==='object'){const off:OffsetPose={};for(const [j,val] of Object.entries(o.offset as Record<string,unknown>)){if(j==='y'&&num(val))off.y=val as number;else{const q=vec(val);if(q)off[j]=q;}}key.offset=off;}
  keys.push(key);}
 if(!keys.length)return null;keys.sort((a,b)=>a.t-b.t);
 return {keys,units:(input as MotionTrack).units==='stature'?'stature':'metres',space:(input as MotionTrack).space==='path'?'path':'model'};
}

/** Compiled track: evaluate it at a time and lay it over whatever pose the rig already holds. */
export class TrackPlayer {
 private ch:Record<string,Sample[]>={};private offsetJoints:string[]=[];
 /** Keyed gait phase (cycles) at t, or null when the track does not time the gait. Linear between keys: steady cadence per segment. */
 gait(t:number){const s=this.ch.gait!;if(!s.length)return null;if(t<=s[0]!.t)return s[0]!.v[0]!;const last=s[s.length-1]!;if(t>=last.t)return last.v[0]!;let i=0;while(s[i+1]!.t<t)i++;const a=s[i]!,b=s[i+1]!;return a.v[0]!+(b.v[0]!-a.v[0]!)*(t-a.t)/(b.t-a.t);}
 /** Additive offsets at t (null when none are keyed). */
 offsets(t:number):OffsetPose|null{if(!this.offsetJoints.length)return null;const out:OffsetPose={};for(const j of this.offsetJoints){const v=sampleChannel(this.ch['off.'+j]!,t);if(!v)continue;if(j==='y')out.y=v[0]!;else out[j]=v;}return out;}
 constructor(readonly track:MotionTrack,private stature=1){
  const K=track.keys,c=this.ch;
  c.weight=channel(K,k=>k.weight);c.hipsPos=channel(K,k=>k.hips?.pos);c.hipsRot=channel(K,k=>k.hips?.rot);
  c.spine=channel(K,k=>k.spine);c.neck=channel(K,k=>k.neck);c.head=channel(K,k=>k.head);
  c.gait=channel(K,k=>k.gait);
  for(const k of K)for(const j of Object.keys(k.offset??{}))if(!this.offsetJoints.includes(j))this.offsetJoints.push(j);
  for(const j of this.offsetJoints)c['off.'+j]=channel(K,k=>k.offset?(j==='y'?k.offset.y??0:(k.offset[j] as readonly number[]|undefined)??[0,0,0]):undefined);
  for(const l of ['handL','handR','footL','footR'] as const){c[l+'.pos']=channel(K,k=>k[l]?.pos);c[l+'.pole']=channel(K,k=>k[l]?.pole);c[l+'.weight']=channel(K,k=>k[l]?.weight);c[l+'.rot']=channel(K,k=>k[l]?.rot);c[l+'.curl']=channel(K,k=>k[l]?.curl);}
 }
 apply(rig:HumanRig,t:number,travel=0){
  const c=this.ch,unit=this.track.units==='stature'?this.stature:1,s=(name:string,linear=false)=>sampleChannel(c[name]!,t,linear),dz=this.track.space==='path'?-travel:0;
  const w=Math.min(1,Math.max(0,s('weight',true)?.[0]??1));
  if(w>0){
   rig.solve();const hips=rig.need('Hips'),head=rig.need('Head'),last=<T>(a:T[],d:T)=>a.length?a[a.length-1]!:d;
   // the underlying pose, each part relative to what carries it
   const baseHips=rig.get(hips,Qn()),baseSpine=rig.spine.map(i=>rig.get(i,Qn())),baseChest=last(baseSpine,baseHips),baseNeck=rig.neck.map(i=>rig.get(i,Qn())),baseNeckTop=last(baseNeck,baseChest),baseHead=rig.get(head,Qn());
   const inv=(q:THREE.Quaternion)=>q.clone().invert(),iH=inv(baseHips),iC=inv(baseChest),iN=inv(baseNeckTop);
   const limbs:[number,boolean,THREE.Quaternion][]=[];
   for(const S of SIDES){for(const l of ['Shoulder','Arm','ForeArm','Hand'])if(rig.has(S+l)){const i=rig.need(S+l);limbs.push([i,true,iC.clone().multiply(rig.get(i,Qn()))]);}
    for(const l of ['UpLeg','Leg','Foot','ToeBase'])if(rig.has(S+l)){const i=rig.need(S+l);limbs.push([i,false,iH.clone().multiply(rig.get(i,Qn()))]);}}
   // keyed trunk channels are absolute; unkeyed ones keep their bend and ride on the keyed part below them
   const hr=s('hipsRot'),sp=s('spine'),nk=s('neck'),hd=s('head'),hp=s('hipsPos');
   const pelvis=baseHips.clone();if(hr)pelvis.slerp(eulerQuat(hr,Qn()),w);rig.set(hips,pelvis);
   const chain=(ids:number[],base:THREE.Quaternion[],iBase:THREE.Quaternion,carrier:THREE.Quaternion,rot:number[]|null)=>{
    const R=rot?eulerQuat(rot,Qn()):null;let top=carrier;
    ids.forEach((id,k)=>{const q=carrier.clone().multiply(iBase).multiply(base[k]!);if(R)q.slerp(carrier.clone().multiply(powQuat(R,(k+1)/ids.length,Qn())),w);rig.set(id,q);top=q;});return top;};
   const chest=chain(rig.spine,baseSpine,iH,pelvis,sp),neckTop=chain(rig.neck,baseNeck,iC,chest,nk);
   const hq=neckTop.clone().multiply(iN).multiply(baseHead);if(hd)hq.slerp(neckTop.clone().multiply(eulerQuat(hd,Qn())),w);rig.set(head,hq);
   for(const [i,onChest,r] of limbs)rig.set(i,(onChest?chest:pelvis).clone().multiply(r));
   if(hp)rig.hipsPos.lerp(_a.set(hp[0]!*unit,hp[1]!*unit,hp[2]!*unit+dz),w);
  }
  rig.solve();
  for(const [key,S,limb] of [['footL','Left','leg'],['footR','Right','leg'],['handL','Left','arm'],['handR','Right','arm']] as [LimbEnd,Side,'arm'|'leg'][]){
   const lw=Math.min(1,Math.max(0,s(key+'.weight',true)?.[0]??(c[key+'.pos']!.length?1:0))),p=s(key+'.pos'),rot=s(key+'.rot'),curl=s(key+'.curl',true);
   const end=rig.need(S+(limb==='arm'?'Hand':'Foot')),sign=S==='Left'?1:-1;
   if(lw>0&&p){const pole=s(key+'.pole');rig.ik(S,limb,new THREE.Vector3(p[0]!*unit,p[1]!*unit,p[2]!*unit+dz),{weight:lw,pole:pole?new THREE.Vector3(pole[0]!*unit,pole[1]!*unit,pole[2]!*unit+dz):undefined});rig.solve();}
   if(rot&&lw>0){
    if(limb==='arm'){ // [pronation, deviation, flexion] from the straight, thumb-up wrist; mirrored so both hands read alike
     const fore=rig.get(rig.need(S+'ForeArm'),Qn());rig.set(end,rig.get(end,Qn()).slerp(fore.multiply(HALF_TURN_X).multiply(eulerQuat([sign*rot[0]!,sign*rot[1]!,-sign*rot[2]!],Qn())),lw));}
    else{ // [pitch (toes down), yaw, roll] from a flat, forward foot
     rig.set(end,rig.get(end,Qn()).slerp(eulerQuat(rot,Qn()).multiply(FLAT_FOOT),lw));const toe=rig.index.get(S+'ToeBase');if(toe!==undefined)rig.set(toe,rig.get(toe,Qn()).slerp(eulerQuat([0,rot[1]!,0],Qn()),lw));}
    rig.solve();}
   if(curl&&limb==='arm')rig.fingerCurl[S]=curl[0]!*DEG;
  }
 }
}
const HALF_TURN_X=new THREE.Quaternion(1,0,0,0),FLAT_FOOT=frameQuat(new THREE.Vector3(0,0,1),new THREE.Vector3(1,0,0));

/**
 * Stateless floor contact: a sole that would sink below the floor lifts its ankle by exactly that depth (leg IK, fixed
 * lengths). Feet in the air and the body's own rise and fall are untouched; seeking backwards gives the same picture.
 */
export function groundFeet(rig:HumanRig,floor=0,weight=1){
 if(weight<=0)return;rig.solve();const p=V();
 for(const S of SIDES){let low=Infinity;for(const a of ['Heel','Ball','Toe']){const q=rig.point(S+a,p);if(q)low=Math.min(low,q.y);}
  if(!(low<floor))continue;const ankle=rig.pos(S+'Foot').clone();ankle.y+=(floor-low)*weight;rig.ik(S,'leg',ankle);rig.solve();}
}
