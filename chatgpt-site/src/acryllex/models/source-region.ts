import * as THREE from 'three';

/** Extract a source region without inventing anatomy or mutating cached geometry, skin weights or morphs. */
export function retainSourceTriangles(root:THREE.Object3D,keep:(p:THREE.Vector3)=>boolean){
 root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),p=new THREE.Vector3();let kept=0;
 root.traverse(object=>{
  const mesh=object as THREE.Mesh;if(!mesh.isMesh)return;
  const original=mesh.geometry,source=original.index?original.toNonIndexed():original;
  const vertices:number[]=[],groups:{start:number;count:number;materialIndex:number}[]=[];
  for(let i=0;i<source.attributes.position.count;i+=3){
   let include=true;
   for(let j=0;j<3;j++){
    const index=original.index?original.index.getX(i+j):i+j;
    if((mesh as THREE.SkinnedMesh).isSkinnedMesh)(mesh as THREE.SkinnedMesh).getVertexPosition(index,p);else p.fromBufferAttribute(original.attributes.position,index);
    p.applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);if(!keep(p)){include=false;break;}
   }
   if(!include)continue;
   const materialIndex=source.groups.find(g=>i>=g.start&&i<g.start+g.count)?.materialIndex??0,last=groups.at(-1);
   if(last?.materialIndex===materialIndex)last.count+=3;else groups.push({start:vertices.length,count:3,materialIndex});
   vertices.push(i,i+1,i+2);kept++;
  }
  const geometry=new THREE.BufferGeometry();
  const copy=(attribute:THREE.BufferAttribute|THREE.InterleavedBufferAttribute)=>{
   const ArrayType=attribute.array.constructor as typeof Float32Array;
   const array=new ArrayType(vertices.length*attribute.itemSize);
   // getComponent handles interleaved attributes and normalized integer skin data correctly.
   const result=new THREE.BufferAttribute(array,attribute.itemSize,attribute.normalized);
   for(let i=0;i<vertices.length;i++)for(let c=0;c<attribute.itemSize;c++)result.setComponent(i,c,attribute.getComponent(vertices[i],c));
   return result;
  };
  for(const [key,attribute]of Object.entries(source.attributes))geometry.setAttribute(key,copy(attribute));
  for(const [key,attributes]of Object.entries(source.morphAttributes))Object.assign(geometry.morphAttributes,{[key]:attributes.map(copy)});
  geometry.morphTargetsRelative=source.morphTargetsRelative;
  for(const g of groups)geometry.addGroup(g.start,g.count,g.materialIndex);
  if(vertices.length){geometry.computeBoundingBox();geometry.computeBoundingSphere();}
  mesh.geometry=geometry;if(source!==original)source.dispose();
 });
 if(!kept)throw new Error('Source region contains no triangles; provide another source or region');
 return kept;
}
