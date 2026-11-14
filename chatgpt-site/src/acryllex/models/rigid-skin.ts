import * as THREE from 'three';

function preserveWinding(geometry:THREE.BufferGeometry,matrix:THREE.Matrix4){
 if(matrix.determinant()>=0)return;
 if(!geometry.index)geometry.setIndex(Array.from({length:geometry.attributes.position.count},(_,i)=>i));
 const indices=geometry.index!;for(let i=0;i<indices.count;i+=3){const b=indices.getX(i+1);indices.setX(i+1,indices.getX(i+2));indices.setX(i+2,b);}
}

/** Bake a source's inherited affine scale into its skin, leaving rigid articulated joints.
 * Rest positions, normals, UVs, weights and materials are retained. Each new bone frame is
 * orthonormal, so turning a joint cannot change a segment's length through ancestor scale.
 * Input is a read-only instance; cached templates are never modified. Animated source clips
 * need retargeting to these new frames before use (this helper handles a posed/resting skin).
 */
export function rigidSkin(source:THREE.Object3D){
 source.updateMatrixWorld(true);
 const skins:THREE.SkinnedMesh[]=[],rigid:THREE.Mesh[]=[];source.traverse(o=>{if((o as THREE.SkinnedMesh).isSkinnedMesh)skins.push(o as THREE.SkinnedMesh);else if((o as THREE.Mesh).isMesh)rigid.push(o as THREE.Mesh);});
 if(!skins.length)throw new Error('rigidSkin requires a source skinned mesh');
 if(skins.some(m=>m.morphTargetInfluences?.some(w=>Math.abs(w)>1e-8)))throw new Error('rigidSkin requires inactive morphs; active expressions need a retargeted source');
 const root=new THREE.Group();root.name=source.name;
 const originals=[...new Set(skins.flatMap(m=>m.skeleton.bones))],bones=new Map<THREE.Bone,THREE.Bone>(),frames=new Map<THREE.Bone,THREE.Matrix4>();
 const origin=new THREE.Vector3(),x=new THREE.Vector3(),y=new THREE.Vector3(),z=new THREE.Vector3();
 for(const original of originals){
  const m=original.matrixWorld;origin.setFromMatrixPosition(m);y.setFromMatrixColumn(m,1).normalize();z.setFromMatrixColumn(m,2);z.addScaledVector(y,-z.dot(y)).normalize();
  if(y.lengthSq()<.9||z.lengthSq()<.9)throw new Error('rigidSkin source has a singular joint frame');
  x.crossVectors(y,z).normalize();z.crossVectors(x,y).normalize();
  const frame=new THREE.Matrix4().makeBasis(x,y,z).setPosition(origin),bone=new THREE.Bone();bone.name=original.name;
  frames.set(original,frame);bones.set(original,bone);
 }
 for(const original of originals){
  let parent=original.parent;while(parent&&!bones.has(parent as THREE.Bone))parent=parent.parent;
  const bone=bones.get(original)!,ancestor=parent&&bones.get(parent as THREE.Bone);
  const local=frames.get(original)!.clone();if(ancestor)local.premultiply(frames.get(parent as THREE.Bone)!.clone().invert());
  local.decompose(bone.position,bone.quaternion,bone.scale);bone.quaternion.normalize();bone.scale.set(1,1,1);
  (ancestor??root).add(bone);
 }
 root.updateMatrixWorld(true);
 for(const original of skins){
  const geometry=original.geometry.clone(),positions=geometry.attributes.position,normal=geometry.attributes.normal;
  const normalMatrix=new THREE.Matrix3().getNormalMatrix(original.matrixWorld),v=new THREE.Vector3(),skin=new THREE.Matrix4(),boneMatrix=new THREE.Matrix4(),deform=new THREE.Matrix4(),toWorld=new THREE.Matrix4(),skinNormal=new THREE.Matrix3();
  const normalLengths=new Float64Array(positions.count),deforms:THREE.Matrix4[]=[];
  for(let i=0;i<positions.count;i++){
   skin.elements.fill(0);
   for(let c=0;c<4;c++){
    const weight=original.geometry.attributes.skinWeight.getComponent(i,c);if(!weight)continue;
    const joint=original.geometry.attributes.skinIndex.getComponent(i,c);
    boneMatrix.multiplyMatrices(original.skeleton.bones[joint]!.matrixWorld,original.skeleton.boneInverses[joint]!);
    for(let k=0;k<16;k++)skin.elements[k]+=boneMatrix.elements[k]!*weight;
   }
   deform.multiplyMatrices(original.bindMatrixInverse,skin).multiply(original.bindMatrix);deforms.push(deform.clone());
   toWorld.multiplyMatrices(original.matrixWorld,deform);v.fromBufferAttribute(original.geometry.attributes.position,i).applyMatrix4(toWorld);positions.setXYZ(i,v.x,v.y,v.z);
   if(normal){v.fromBufferAttribute(original.geometry.attributes.normal,i).applyMatrix3(skinNormal.setFromMatrix4(deform)).applyMatrix3(normalMatrix);normalLengths[i]=v.length()||1;v.divideScalar(normalLengths[i]);normal.setXYZ(i,v.x,v.y,v.z);}
  }
  // Relative targets are vectors; absolute targets are positions. Their source linear transform
  // is retained, but active targets must be zero when this rest skin is baked.
  for(const [kind,attributes]of Object.entries(geometry.morphAttributes))for(const attribute of attributes)for(let i=0;i<attribute.count;i++){
   v.fromBufferAttribute(attribute,i);
   if(kind==='normal')v.applyMatrix3(skinNormal.setFromMatrix4(deforms[i]!)).applyMatrix3(normalMatrix).divideScalar(normalLengths[i]||1);
   else {toWorld.multiplyMatrices(original.matrixWorld,deforms[i]!);if(geometry.morphTargetsRelative)v.applyMatrix3(skinNormal.setFromMatrix4(toWorld));else v.applyMatrix4(toWorld);}
   attribute.setXYZ(i,v.x,v.y,v.z);
  }
  // The renderer reverses front-face winding for a mirrored object transform. Once that
  // transform is baked into vertices, the geometry must carry the same reversal itself.
  preserveWinding(geometry,original.matrixWorld);
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const mesh=new THREE.SkinnedMesh(geometry,original.material);mesh.name=original.name;mesh.frustumCulled=false;mesh.visible=original.visible;
  mesh.morphTargetDictionary=original.morphTargetDictionary?{...original.morphTargetDictionary}:undefined;
  if(original.morphTargetInfluences)mesh.morphTargetInfluences=[...original.morphTargetInfluences];
  root.add(mesh);const skeleton=new THREE.Skeleton(original.skeleton.bones.map(b=>bones.get(b)!));skeleton.calculateInverses();mesh.bind(skeleton,new THREE.Matrix4());
 }
 // Keep rigid attachments (e.g. nails or jewellery) on the corresponding new bone,
 // rather than dropping them when the rest of the source skin is normalized.
 for(const original of rigid){
  if(Object.values(original.geometry.morphAttributes).some(a=>a.length))throw new Error('rigidSkin rigid attachments with morphs require explicit retargeting');
  const mesh=original.clone(false),position=original.getWorldPosition(new THREE.Vector3());mesh.geometry=original.geometry.clone().applyMatrix4(original.matrixWorld).translate(-position.x,-position.y,-position.z);mesh.position.copy(position);mesh.quaternion.identity();mesh.scale.set(1,1,1);preserveWinding(mesh.geometry,original.matrixWorld);root.add(mesh);
  let parent=original.parent;while(parent&&!bones.has(parent as THREE.Bone))parent=parent.parent;
  if(parent){root.updateMatrixWorld(true);bones.get(parent as THREE.Bone)!.attach(mesh);}
 }
 root.updateMatrixWorld(true);return root;
}
