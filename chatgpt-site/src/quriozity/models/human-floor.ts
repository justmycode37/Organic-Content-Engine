// Cached actual-foot-skin placement in solved rig space, before authored tracks.
import * as THREE from 'three';
import type {HumanRig} from './human-motion.ts';
type Attribute=THREE.BufferAttribute|THREE.InterleavedBufferAttribute;
type BoneSample={node:number;scale:THREE.Vector3;inverse:THREE.Matrix4;matrix:THREE.Matrix4};
type SkinSample={mesh:THREE.SkinnedMesh;indices:Attribute;weights:Attribute;vertices:number[];bones:BoneSample[];bind:THREE.Matrix4};
const bare=(s:string)=>s.replace(/^mixamorig\d*:?/,'');
export function createStaticFloor(rig:HumanRig,skin:THREE.Object3D){
 const samples:SkinSample[]=[],lookup=new Map(rig.nodes.map((n,i)=>[n.o,i]));
 rig.space.updateWorldMatrix(true,true);
 const invSpace=new THREE.Matrix4().copy(rig.space.matrixWorld).invert();
 skin.traverse(object=>{
  if(!(object as THREE.SkinnedMesh).isSkinnedMesh)return;
  for(let p:THREE.Object3D|null=object;p;p=p.parent)if(!p.visible)return;
  const mesh=object as THREE.SkinnedMesh,indices=mesh.geometry.getAttribute('skinIndex'),weights=mesh.geometry.getAttribute('skinWeight');
  if(!indices||!weights)return;
  const names=mesh.skeleton.bones.map(b=>bare(b.name)),vertices:number[]=[];
  for(let i=0;i<indices.count;i++){
   let foot=0;for(let k=0;k<4;k++)if(/^(Left|Right)(Foot|Toe)/.test(names[indices.getComponent(i,k)]??''))foot+=weights.getComponent(i,k);
   if(foot>=.5)vertices.push(i);
  }
  if(!vertices.length)return;
  const bones=mesh.skeleton.bones.map((bone,j)=>{
   const node=lookup.get(bone),scale=new THREE.Vector3(),p=new THREE.Vector3(),q=new THREE.Quaternion();
   new THREE.Matrix4().copy(invSpace).multiply(bone.matrixWorld).decompose(p,q,scale);
   if(node===undefined)throw Error('Static floor skin bone is outside its HumanRig');
   return{node,scale,inverse:mesh.skeleton.boneInverses[j],matrix:new THREE.Matrix4()};
  });
  samples.push({mesh,indices,weights,vertices,bones,bind:mesh.bindMatrix.clone()});
 });
 const base=new THREE.Vector3(),v=new THREE.Vector3(),sum=new THREE.Vector3();
 const minimum=()=>{
  rig.solve();let y=Infinity;
  for(const s of samples){
   for(const b of s.bones)b.matrix.compose(rig.P[b.node],rig.Q[b.node],b.scale).multiply(b.inverse);
   for(const i of s.vertices){
    // Mesh's public implementation evaluates morphs without SkinnedMesh LBS.
    THREE.Mesh.prototype.getVertexPosition.call(s.mesh,i,base);base.applyMatrix4(s.bind);sum.set(0,0,0);
    for(let j=0;j<4;j++){const weight=s.weights.getComponent(i,j);if(weight)sum.addScaledVector(v.copy(base).applyMatrix4(s.bones[s.indices.getComponent(i,j)].matrix),weight);}
    y=Math.min(y,sum.y);
   }
  }
  return y;
 };
 const reference=minimum(),valid=samples.length>0&&Number.isFinite(reference);
 return{owner:rig,valid:Number.isFinite(reference),reference,minimum,vertices:samples.reduce((n,s)=>n+s.vertices.length,0),meshes:samples.length,
  settle(weight=1){if(!(weight>0)||!valid)return 0;const y=minimum();if(!Number.isFinite(y))return 0;const dy=(reference-y)*Math.min(1,weight);rig.hipsPos.y+=dy;return dy;}
 };
}
