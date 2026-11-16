import * as THREE from 'three';
import {instance} from '../assets.ts';
import {defineModel} from './types.ts';
import {clamp,deg} from '../kit.ts';
import {rigidSkin} from './rigid-skin.ts';

const FINGERS=['index','middle','ring','pinky'] as const;
export const riggedHand=defineModel({
 id:'hand-mesh',aliases:['rigged-hand','source-hand'],
 describe:'A continuous detailed anatomical hand from the CC0 MakeHuman/MPFB source, with shaped palm/thumb web, knuckles, nails, separate articulated fingers and a naturally curved resting pose. The original 8120-vertex skin and 16-joint rig use the SAME neutral material/light/dot response as the library. Supports real 3D viewpoints and bounded independent finger curl. Left mirrors the same source geometry. Object contact is not inferred; gripping requires a matching captured/verified action.',
 params:{side:'right (default) | left',source:'anatomical (default, detailed CC0 source) | xr (legacy low-detail MIT WebXR mesh)',rest:'relaxed (default, gently grouped fingers) | source (exact authored bind pose)',height:'wrist-to-fingertip length metres (default .21)',tone:'library neutral surface reflectance (default .72)'},
 controls:{curl:'0 resting hand ..1 bounded anatomical curl',spread:'0 gently grouped fingers ..1 source open splay; default 0 in relaxed rest, 1 in source rest',index:'0..1 overrides index curl',middle:'0..1 overrides middle curl',ring:'0..1 overrides ring curl',pinky:'0..1 overrides pinky curl',thumb:'0..1 thumb flex, default 0'},defaults:{curl:0,thumb:0},size:'.21 m',
 build(ctx){
  const side=ctx.str('side','right',['right','left'] as const),anatomical=ctx.str('source','anatomical',['anatomical','xr'] as const)==='anatomical',source=instance('hand-mesh:'+(anatomical?'anatomical':side),ctx,ctx.num('tone',.72,.2,1),true,0,{sourceAlpha:true});
  if(!source)throw new Error('hand-mesh: required source '+side+' was not preloaded');
  if(anatomical)source.root=rigidSkin(source.root);
  const nodes=new Map<string,THREE.Object3D>();source.root.traverse(o=>nodes.set(o.name,o));
  const need=(name:string)=>{const bone=nodes.get(name);if(!bone)throw new Error('hand-mesh source joint missing: '+name);return bone;};
  const joint=(finger:string)=>anatomical?`${finger}_01_r`:`${finger}-finger-phalanx-proximal`;
  source.root.updateMatrixWorld(true);const wrist=need(anatomical?'hand_r':'wrist'),at=(name:string)=>need(name).getWorldPosition(new THREE.Vector3());
  const wristPosition=wrist.getWorldPosition(new THREE.Vector3()),right=at(joint('index')).sub(at(joint('pinky'))).normalize();
  const up=at(joint('middle')).sub(wristPosition);up.addScaledVector(right,-up.dot(right)).normalize();
  const normal=new THREE.Vector3().crossVectors(right,up).normalize();
  if(anatomical){
   // The knuckle line is oblique to the fingers. Align the hand by its central
   // digit rather than forcing that oblique line horizontal (which made every finger lean sideways).
   up.copy(at('middle_03_r').sub(wristPosition));up.addScaledVector(normal,-up.dot(normal)).normalize();
   right.crossVectors(up,normal).normalize();
  }
  const chains:THREE.Object3D[][]=[];
  for(const finger of FINGERS){
   const chain=anatomical?[1,2,3].map(n=>need(`${finger}_0${n}_r`)):['metacarpal','phalanx-proximal','phalanx-intermediate','phalanx-distal','tip'].map(part=>need(`${finger}-finger-${part}`));
   if(!anatomical){let parent=wrist;for(const bone of chain){parent.attach(bone);parent=bone;}}chains.push(chain);
  }
  const thumb=anatomical?[1,2,3].map(n=>need(`thumb_0${n}_r`)):['metacarpal','phalanx-proximal','phalanx-distal','tip'].map(part=>need('thumb-'+part));
  if(!anatomical){let parent=wrist;for(const bone of thumb){parent.attach(bone);parent=bone;}}
  source.root.updateMatrixWorld(true);
  const rotations=new Map<THREE.Object3D,{rest:THREE.Quaternion;axis:THREE.Vector3}>();
  for(const bone of [...chains.flat(),...thumb]){
   const world=bone.getWorldQuaternion(new THREE.Quaternion()),axis=anatomical?new THREE.Vector3(0,0,1):right.clone().applyQuaternion(world.clone().invert()).normalize();
   if(anatomical&&axis.clone().applyQuaternion(world).dot(right)<0)axis.negate();
   // This source's imported reflected frame puts the palm on -normal. Flex toward
   // that side; using +normal produced hyperextension instead of a grasp.
   if(anatomical)axis.negate();
   rotations.set(bone,{rest:bone.quaternion.clone(),axis});
  }
  const fan=chains.map((chain,i)=>{
   const base=anatomical?chain[0]:chain[1],tip=anatomical?chain[2]:chain[4],direction=tip.getWorldPosition(new THREE.Vector3()).sub(base.getWorldPosition(new THREE.Vector3()));
   const angle=Math.atan2(direction.dot(right),direction.dot(up)),target=deg([6,0,-4,-8][i]);
   return {base,axis:normal.clone().applyQuaternion(base.getWorldQuaternion(new THREE.Quaternion()).invert()),angle:anatomical?angle-target:0};
  });
  const sourceRest=ctx.str('rest','relaxed',['relaxed','source'] as const)==='source';
  const root=new THREE.Group(),oriented=new THREE.Group();root.add(oriented);oriented.add(source.root);
  oriented.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,normal)).invert();source.root.position.sub(wristPosition);
  root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(root,true),length=box.max.y-box.min.y;oriented.scale.setScalar(ctx.num('height',.21,.08,2)/Math.max(length,1e-6));
  if(anatomical){
   // The original rig carries an odd reflection. Canonicalize chirality and put
   // the palmar surface (not the visible fingernails) toward the front camera.
   root.scale.z=-1;if(side==='left')root.scale.x=-1;
  }
  const bend=(bone:THREE.Object3D,angle:number)=>{const r=rotations.get(bone)!;bone.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(r.axis,angle));};
  const update=(c:Record<string,number>)=>{
   for(const key of ['curl','spread',...FINGERS,'thumb'])if(c[key]!==undefined&&!Number.isFinite(c[key]))throw new Error('hand-mesh: '+key+' must be finite');
   for(const [bone,r]of rotations)bone.quaternion.copy(r.rest);
   const spread=clamp(c.spread??(sourceRest?1:0));
   for(const f of fan)f.base.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(f.axis,f.angle*(1-spread)));
   FINGERS.forEach((finger,i)=>{const curl=clamp(c[finger]??c.curl??0);(anatomical?chains[i]:chains[i].slice(1,4)).forEach((bone,j)=>bend(bone,deg(anatomical?[50,72,42][j]:[58,78,48][j])*curl));});
   thumb.slice(0,3).forEach((bone,j)=>bend(bone,deg([12,32,38][j])*clamp(c.thumb??0)));
  };
  // A shot may begin curled and then open. Supply a stable pose envelope so automatic
  // framing cannot crop the later fingertips or breathe with the changing silhouette.
  // Full per-pose boxes include every source vertex, rather than sampled finger joints.
  const framingPoints:THREE.Vector3[]=[];
  for(const spread of [0,1])for(const curl of [0,.25,.5,.75,1])for(const thumb of [0,1]){
   update({spread,curl,thumb});root.updateMatrixWorld(true);const posed=new THREE.Box3().setFromObject(root,true);
   for(let i=0;i<8;i++)framingPoints.push(new THREE.Vector3(i&1?posed.max.x:posed.min.x,i&2?posed.max.y:posed.min.y,i&4?posed.max.z:posed.min.z));
  }
  update({});return {root,grounded:false,framingPoints,update};
 },
});
