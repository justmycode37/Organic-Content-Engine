import * as THREE from 'three';

/** Slice static source triangles at a true plane; keep/interpolate UVs and normals. */
export function clipStaticSourcePlane(root:THREE.Object3D,plane:THREE.Plane){
 root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert();
 root.traverse(object=>{
  const mesh=object as THREE.Mesh;if(!mesh.isMesh)return;
  if((mesh as THREE.SkinnedMesh).isSkinnedMesh)throw new Error('Static plane slicing does not support skinned sources');
  const source=mesh.geometry,attrs=Object.entries(source.attributes),values=Object.fromEntries(attrs.map(([key])=>[key,[] as number[]]));
  const geometry=new THREE.BufferGeometry();let count=0;
  type Vertex={d:number;attributes:Record<string,number[]>};
  const vertex=(i:number):Vertex=>{const index=source.index?source.index.getX(i):i;const attributes=Object.fromEntries(attrs.map(([key,a])=>[key,Array.from({length:a.itemSize},(_,c)=>a.getComponent(index,c))]));const point=new THREE.Vector3(...attributes.position as [number,number,number]).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);return {d:plane.distanceToPoint(point),attributes};};
  const emit=(v:Vertex)=>{for(const [key]of attrs)values[key]!.push(...v.attributes[key]!);count++;};
  for(let i=0;i<(source.index?.count??source.attributes.position!.count);i+=3){
   const triangle=[vertex(i),vertex(i+1),vertex(i+2)],polygon:Vertex[]=[];
   for(let j=0;j<3;j++){
    const a=triangle[j]!,b=triangle[(j+1)%3]!;
    if(a.d>=-1e-9)polygon.push(a);
    if((a.d>=0)!==(b.d>=0)){const t=a.d/(a.d-b.d);polygon.push({d:0,attributes:Object.fromEntries(attrs.map(([key])=>[key,a.attributes[key]!.map((v,c)=>v+(b.attributes[key]![c]!-v)*t)]))});}
   }
   const start=count;for(let j=1;j<polygon.length-1;j++){emit(polygon[0]!);emit(polygon[j]!);emit(polygon[j+1]!);}
   if(count>start)geometry.addGroup(start,count-start,source.groups.find(g=>i>=g.start&&i<g.start+g.count)?.materialIndex??0);
  }
  for(const [key,a]of attrs)geometry.setAttribute(key,new THREE.Float32BufferAttribute(values[key]!,a.itemSize));
  if(count){geometry.computeBoundingBox();geometry.computeBoundingSphere();}mesh.geometry=geometry;
 });
}

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
