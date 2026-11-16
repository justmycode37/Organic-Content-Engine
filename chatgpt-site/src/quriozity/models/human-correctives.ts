import type * as THREE from 'three';
import type {HumanRig,Side} from './human-motion.ts';

export type HumanCorrectiveTarget={name:string;side:'l'|'r';feature:'base'|'spine'|'twist'|'knee'|'hipSpineAbduction';angle:number;spine?:number;abduction?:number;yaw?:number;targetActivation?:number};
export type HumanCorrectiveMetadata={version:1;driver:'anatomical-contact-v1';activationStart:number;baseFlexionKnots:number[];kneeActivationStart:number;kneeFlexionKnots:number[];targets:HumanCorrectiveTarget[]};
export type HumanJointFeatures={flex:[number,number];yaw:[number,number];spine:number;knee:[number,number];abduction:[number,number]};
const clamp=(x:number,a=0,b=1)=>Math.max(a,Math.min(b,x));

function flexBasis(angle:number,config:HumanCorrectiveMetadata){
 const keys=[config.activationStart,...config.baseFlexionKnots],out=config.baseFlexionKnots.map(()=>0);
 if(angle<=keys[0]!)return out;
 if(angle>=keys[keys.length-1]!){out[out.length-1]=1;return out;}
 for(let i=0;i<out.length;i++)if(keys[i]!<angle&&angle<=keys[i+1]!){const u=(angle-keys[i]!)/(keys[i+1]!-keys[i]!);out[i]=u;if(i)out[i-1]=1-u;return out;}
 return out;
}

/** Read the solved normalized rig in its own space, independently of the scene/camera/animation clock. */
export function readHumanJointFeatures(rig:HumanRig):HumanJointFeatures{
 rig.solve();const hips=rig.need('Hips'),inv=rig.Q[hips]!.clone().multiply(rig.nodes[hips]!.restQ.clone().invert()).invert();
 const flex:number[]=[],yaw:number[]=[],abduction:number[]=[];
 for(const side of ['Left','Right'] as Side[]){
  const d=rig.pos(side+'Leg').clone().sub(rig.pos(side+'UpLeg')).applyQuaternion(inv),rest=rig.restPos(side+'Leg').clone().sub(rig.restPos(side+'UpLeg'));
  flex.push(Math.atan2(d.z,-d.y)*180/Math.PI-Math.atan2(rest.z,-rest.y)*180/Math.PI);
  const id=rig.need(side+'UpLeg'),q=inv.clone().multiply(rig.Q[id]!).multiply(rig.nodes[id]!.restQ.clone().invert());
  // Y component of the calibrated normalized joint's XYZ rotation, avoiding a runtime dependency on THREE.Euler.
  yaw.push(Math.asin(clamp(2*(q.x*q.z+q.y*q.w),-1,1))*180/Math.PI);abduction.push(Math.atan2(2*(q.w*q.z-q.x*q.y),1-2*(q.y*q.y+q.z*q.z))*180/Math.PI);
 }
 const id=rig.spine[rig.spine.length-1]!,q=inv.clone().multiply(rig.Q[id]!).multiply(rig.nodes[id]!.restQ.clone().invert()),up=rig.hipsRest.clone().set(0,1,0).applyQuaternion(q);
 const knee:number[]=[];for(const side of ['Left','Right'] as Side[]){const p=rig.need(side+'UpLeg'),id=rig.need(side+'Leg'),q=rig.Q[p]!.clone().multiply(rig.nodes[p]!.restQ.clone().invert()).invert().multiply(rig.Q[id]!).multiply(rig.nodes[id]!.restQ.clone().invert());knee.push(Math.atan2(2*(q.w*q.x-q.y*q.z),1-2*(q.x*q.x+q.y*q.y))*180/Math.PI);}
 return {flex:flex as [number,number],yaw:yaw as [number,number],spine:Math.atan2(up.z,up.y)*180/Math.PI,knee:knee as [number,number],abduction:abduction as [number,number]};
}

function targetWeight(target:HumanCorrectiveTarget,pose:HumanJointFeatures,config:HumanCorrectiveMetadata){
 const side=target.side==='l'?0:1,phi=pose.flex[side];
 if(target.feature==='hipSpineAbduction'){const tent=(x:number,a:number,b:number,c:number)=>Math.max(0,Math.min(1,(x-a)/(b-a),(c-x)/(c-b))),a=Math.max(0,pose.abduction[side]!* (side===0?1:-1));return tent(phi,90,110,120)*tent(pose.spine,15,30,35)*flexBasis(a,{...config,activationStart:-5,baseFlexionKnots:[0,5,10,15]})[[0,5,10,15].indexOf(target.abduction!)]!/target.targetActivation!;}
 if(target.feature==='knee')return flexBasis(pose.knee[side],{...config,activationStart:config.kneeActivationStart,baseFlexionKnots:config.kneeFlexionKnots})[config.kneeFlexionKnots.indexOf(target.angle)]??0;
 if(target.feature==='base')return flexBasis(phi,config)[config.baseFlexionKnots.indexOf(target.angle)]??0;
 const h=clamp((phi-config.activationStart)/(90-config.activationStart));
 if(target.feature==='spine'){
  const chi=Math.max(0,pose.spine),basis=chi<=15?[Math.min(chi/15,1),0]:[Math.max(0,(35-chi)/20),Math.min(1,(chi-15)/20)];
  const hip=phi<=90?(target.angle===90?1:0):(target.angle===90?clamp((120-phi)/30):clamp((phi-90)/30));
  return h*hip*basis[target.spine===15?0:1]!;
 }
 const y=pose.yaw[side],reference=target.yaw!,amount=y*reference>0?clamp(y/reference):0;
 const hip=phi<=90?(target.angle===90?1:0):(target.angle===90?clamp((120-phi)/30):clamp((phi-90)/30));
 return h*hip*amount/target.targetActivation!;
}

/** Create once per cloned actor. Call after the final posed/grounded solve, before rig.write().
 * Standard glTF POSITION/NORMAL morphs run once before skinning. No-metadata actors are a strict no-op. */
export function createPoseCorrectives(rig:HumanRig,skin:THREE.Object3D){
 const bindings:{mesh:THREE.SkinnedMesh;config:HumanCorrectiveMetadata;indices:number[]}[]=[];
 skin.traverse(o=>{const mesh=o as THREE.SkinnedMesh,config=mesh.userData.humanPoseCorrectives as HumanCorrectiveMetadata|undefined;
  if(!mesh.isSkinnedMesh||config?.version!==1||config.driver!=='anatomical-contact-v1')return;
  if(!mesh.geometry.morphTargetsRelative)throw new Error('Human pose correctives require relative glTF morph targets');
  const indices=config.targets.map(t=>mesh.morphTargetDictionary?.[t.name]);if(indices.some(i=>i===undefined))throw new Error('Human corrective target metadata does not match the mesh');
  bindings.push({mesh,config,indices:indices as number[]});
 });
 return {available:bindings.length>0,update(enabled=true){
  if(!bindings.length)return;
  if(!enabled){for(const {mesh,indices}of bindings)for(const i of indices)mesh.morphTargetInfluences![i]=0;return;}
  const pose=readHumanJointFeatures(rig);
  for(const {mesh,config,indices}of bindings)for(let i=0;i<indices.length;i++){const w=enabled?targetWeight(config.targets[i]!,pose,config):0;mesh.morphTargetInfluences![indices[i]!]=Math.abs(w)<1e-12?0:w;}
  return pose;
 }};
}
