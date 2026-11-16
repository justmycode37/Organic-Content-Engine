// Neutral static poses and local endpoint blending for the normalized human rig.
import * as THREE from 'three';
import type {HumanRig} from './human-motion.ts';

// Explicit geometry-derived convention: down segment, elbows bending forward,
// palms inward. Shoulder/clavicle and lower body remain their upright bind rest.
export function neutralArms(rig:HumanRig){
 const frame=(x:THREE.Vector3,y:THREE.Vector3)=>{
  const X=x.clone().normalize(),Y=y.clone().addScaledVector(X,-y.dot(X)).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X,Y,X.clone().cross(Y)));
 };
 const down=new THREE.Vector3(0,-1,0),hinge=new THREE.Vector3(-1,0,0);
 for(const s of ['Left','Right']){
  for(const name of ['Arm','ForeArm'])if(rig.has(s+name))rig.setNamed(s+name,frame(down,hinge));
  if(rig.has(s+'Hand'))rig.setNamed(s+'Hand',frame(down,new THREE.Vector3(s==='Left'?-1:1,0,0)));
 }
}

// Blend semantic bone LOCAL rotations. Never fix finger/roll world targets:
// those must continue to inherit later track/IK parent changes.
export function blendLocalEndpoints(rig:HumanRig, a:()=>void, b:()=>void, k:number){
 if(k<=0){a();return;}if(k>=1){b();return;}
 const ids=new Set<number>([rig.need('Hips'),...rig.spine,...rig.neck,rig.need('Head')]);
 for(const s of ['Left','Right'])for(const n of ['Shoulder','Arm','ForeArm','Hand','UpLeg','Leg','Foot','ToeBase']){
  const id=rig.index.get(s+n);if(id!==undefined)ids.add(id);
 }
 const capture=(fn:()=>void)=>{fn();rig.solve();return{hips:rig.hipsPos.clone(),q:rig.Q.map((q,i)=>{
  const parent=rig.nodes[i].parent;return parent<0?q.clone():rig.Q[parent].clone().invert().multiply(q);
 })};};
 const A=capture(a),B=capture(b),world:THREE.Quaternion[]=[];
 rig.reset();rig.hipsPos.copy(A.hips).lerp(B.hips,k);
 for(let i=0;i<rig.nodes.length;i++){
  const n=rig.nodes[i],local=ids.has(i)?A.q[i].clone().slerp(B.q[i],k):n.restLocalQ;
  world[i]=n.parent<0?n.restQ.clone():world[n.parent]!.clone().multiply(local);
  if(ids.has(i))rig.set(i,world[i]!.clone().multiply((n.K??n.restQ).clone().invert()));
 }
}
