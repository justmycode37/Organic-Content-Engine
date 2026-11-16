import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type {GLTF} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {BODY_BONES,bodyBoneName} from '../human-body-source.ts';
import {bindPose} from './human-motion.ts';
const fail=(s:string):never=>{throw new Error(`bodySource: ${s}`);};

/** Validate a disposable clone; the cached authored geometry, skin, bind matrices and materials remain read-only. */
export function validateHumanBody(template:GLTF){
 const root=SkeletonUtils.clone(template.scene),bones=new Map<string,THREE.Bone>(),skins:THREE.SkinnedMesh[]=[];
 root.traverse(o=>{if((o as THREE.Bone).isBone){for(let p=o.parent;p;p=p.parent)if((p as THREE.Mesh).isMesh)fail('joint hierarchy must sit outside mesh subtrees');const name=bodyBoneName(o.name);if(bones.has(name))fail(`duplicate bone label ${name}`);bones.set(name,o as THREE.Bone);}if((o as THREE.SkinnedMesh).isSkinnedMesh)skins.push(o as THREE.SkinnedMesh);});
 for(const name of BODY_BONES)if(!bones.has(name))fail(`missing canonical bone ${name}`);
 if(!skins.length)fail('skinned body required');
 const under=(child:string,parent:string)=>{for(let p=bones.get(child)!.parent;p;p=p.parent)if(p===bones.get(parent))return;fail(`${child} must descend from ${parent}`);};
 under('Spine','Hips');under('Neck','Spine');under('Head','Neck');for(const s of ['Left','Right']){under(s+'Shoulder','Spine');under(s+'Arm',s+'Shoulder');under(s+'ForeArm',s+'Arm');under(s+'Hand',s+'ForeArm');under(s+'UpLeg','Hips');under(s+'Leg',s+'UpLeg');under(s+'Foot',s+'Leg');under(s+'ToeBase',s+'Foot');}
 bindPose(root);root.updateMatrixWorld(true);
 // Rotation/units may be converted in the file, but reflected, sheared or anisotropic rest frames cannot be posed naturally.
 root.traverse(o=>{const e=o.matrixWorld.elements,x=new THREE.Vector3(e[0],e[1],e[2]),y=new THREE.Vector3(e[4],e[5],e[6]),z=new THREE.Vector3(e[8],e[9],e[10]),a=x.length(),b=y.length(),c=z.length(),m=Math.max(a,b,c);
  if(!e.every(Number.isFinite)||Math.min(a,b,c)<=0||o.matrixWorld.determinant()<=0||Math.max(Math.abs(a-b),Math.abs(a-c))>m*1e-4||Math.max(Math.abs(x.dot(y)),Math.abs(x.dot(z)),Math.abs(y.dot(z)))>m*m*1e-4)fail(`rest transform must be positive uniform without shear: ${o.name}`);
 });
 const at=(n:string)=>bones.get(n)!.getWorldPosition(new THREE.Vector3()),hips=at('Hips'),head=at('Head'),span=head.distanceTo(hips);
 if(!(span>0)||head.y-hips.y<=Math.hypot(head.x-hips.x,head.z-hips.z))fail('bind body must be upright Y-up');
 for(const s of ['Left','Right']){
  for(const [a,b] of [['Arm','ForeArm'],['ForeArm','Hand'],['UpLeg','Leg'],['Leg','Foot']])if(at(s+a).distanceTo(at(s+b))<span*1e-5)fail(`zero length segment ${s+a}`);
  if(at(s+'Foot').y>=hips.y||at(s+'ToeBase').z-at(s+'Foot').z<span*1e-5)fail('bind feet must be below hips and face +Z');
 }
 if(at('LeftArm').x<=at('RightArm').x||at('LeftUpLeg').x<=at('RightUpLeg').x)fail('Left/Right bind labels must use +X/-X');
 const v=new THREE.Vector3(),box=new THREE.Box3();
 for(const mesh of skins){const p=mesh.geometry.getAttribute('position'),si=mesh.geometry.getAttribute('skinIndex'),sw=mesh.geometry.getAttribute('skinWeight');
  if(!p||p.itemSize!==3||!p.count||!si||!sw||si.itemSize!==4||sw.itemSize!==4||si.count!==p.count||sw.count!==p.count)fail('invalid skin attributes');
  if(mesh.skeleton.bones.some(b=>!b||!bones.has(bodyBoneName(b.name))))fail('skin joints must belong to the body hierarchy');
  mesh.skeleton.update();
  for(let i=0;i<p.count;i++){let sum=0;for(let k=0;k<4;k++){const j=si.getComponent(i,k),w=sw.getComponent(i,k);if(!Number.isInteger(j)||j<0||j>=mesh.skeleton.bones.length||!Number.isFinite(w)||w<0||w>1)fail('invalid skin joint/weight');sum+=w;}if(Math.abs(sum-1)>.002)fail('skin weights must sum to1');
   mesh.getVertexPosition(i,v).applyMatrix4(mesh.matrixWorld);if(!v.toArray().every(Number.isFinite))fail('nonfinite bind skin');box.expandByPoint(v);
  }
 }
 if(box.isEmpty()||box.max.y-box.min.y<=0)fail('body has no positive skin height');
}
