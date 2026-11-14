import * as THREE from 'three';

/** Optional art-directed, unshadowed Lambertian spot linked to Head/Neck skin weights.
 * World-space light stays fixed; existing global shadows/specular/albedo are untouched.
 */
export interface HeadAccentLight {
 position: [number,number,number];
 target: [number,number,number];
 intensity: number;
 innerAngleDeg?: number;
 outerAngleDeg?: number;
 distance?: number;
}
export function parseHeadAccentLight(input:unknown):HeadAccentLight|null {
 // Default/disabled is intentionally allocation- and shader-free.
 if(input===undefined||input===null||input===false||input===0)return null;
 if(typeof input!=='object'||Array.isArray(input))throw new Error('Invalid headAccentLight configuration');
 const c=input as HeadAccentLight;if(c.intensity===0)return null;
 const vec=(v:unknown):v is [number,number,number]=>Array.isArray(v)&&v.length===3&&v.every(x=>typeof x==='number'&&Number.isFinite(x));
 const inner=c.innerAngleDeg??12,outer=c.outerAngleDeg??20,distance=c.distance??3;
 if(!vec(c.position)||!vec(c.target)||!Number.isFinite(c.intensity)||c.intensity<0||!Number.isFinite(inner)||!Number.isFinite(outer)||inner<0||outer<=inner||outer>=90||!Number.isFinite(distance)||distance<=0)throw new Error('Invalid headAccentLight configuration');
 const dx=c.position[0]-c.target[0],dy=c.position[1]-c.target[1],dz=c.position[2]-c.target[2];if(dx*dx+dy*dy+dz*dz<1e-12)throw new Error('headAccentLight position and target must differ');
 return {position:[...c.position],target:[...c.target],intensity:c.intensity,innerAngleDeg:inner,outerAngleDeg:outer,distance};
}

export function headAccentLight(root:THREE.Object3D,input:unknown):void {
 const c=parseHeadAccentLight(input);if(!c)return;const inner=c.innerAngleDeg??12,outer=c.outerAngleDeg??20,distance=c.distance??3;
 const position=new THREE.Vector3(...c.position),axis=position.clone().sub(new THREE.Vector3(...c.target));if(axis.lengthSq()<1e-12)throw new Error('headAccentLight position and target must differ');axis.normalize();
 const candidates:{mesh:THREE.Mesh;receiver:Float32Array;active:boolean}[]=[],materials=new Set<THREE.Material>();
 root.traverse(o=>{const mesh=o as THREE.Mesh;if(!mesh.isMesh)return;const count=mesh.geometry.getAttribute('position')?.count;if(!count)return;const receiver=new Float32Array(count);let active=false;const skin=mesh as THREE.SkinnedMesh;
  const ids=mesh.geometry.getAttribute('skinIndex'),weights=mesh.geometry.getAttribute('skinWeight');
  if(skin.isSkinnedMesh&&ids&&weights){const head=new Set(skin.skeleton.bones.flatMap((bone,i)=>/^(Head|HeadTop_End|Neck\d*)$/.test(bone.name.replace(/^mixamorig\d*:?/,''))?[i]:[]));
   for(let i=0;i<count;i++){let w=0;for(let j=0;j<Math.min(4,ids.itemSize);j++)if(head.has(ids.getComponent(i,j)))w+=weights.getComponent(i,j);receiver[i]=Math.max(0,Math.min(1,w));if(receiver[i]>0)active=true;}}
  candidates.push({mesh,receiver,active});if(active)for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])if((m as THREE.MeshStandardMaterial).isMeshStandardMaterial)materials.add(m);
 });
 if(!materials.size)return;
 // Include zero weights on a mesh sharing a receiving material. Every original attribute,
 // morph buffer, index, skin weight and bind transform remains numerically unchanged.
 for(const {mesh,receiver} of candidates){if(!(Array.isArray(mesh.material)?mesh.material:[mesh.material]).some(m=>materials.has(m)))continue;mesh.geometry=mesh.geometry.clone();mesh.geometry.setAttribute('acxHeadAccentReceiver',new THREE.BufferAttribute(receiver,1));}
 const uniforms={acxHeadAccentPosition:{value:position},acxHeadAccentAxis:{value:axis},acxHeadAccentIntensity:{value:c.intensity},acxHeadAccentCutoff:{value:distance},acxHeadAccentOuter:{value:Math.cos(outer*Math.PI/180)},acxHeadAccentInner:{value:Math.cos(inner*Math.PI/180)}};
 for(const m of materials){const previous=m.onBeforeCompile,key=m.customProgramCacheKey();m.onBeforeCompile=function(shader,renderer){previous.call(this,shader,renderer);Object.assign(shader.uniforms,uniforms);
   shader.vertexShader='attribute float acxHeadAccentReceiver;\nvarying float vAcxHeadAccentReceiver;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvAcxHeadAccentReceiver=acxHeadAccentReceiver;');
   shader.fragmentShader='varying float vAcxHeadAccentReceiver;\nuniform vec3 acxHeadAccentPosition;\nuniform vec3 acxHeadAccentAxis;\nuniform float acxHeadAccentIntensity;\nuniform float acxHeadAccentCutoff;\nuniform float acxHeadAccentOuter;\nuniform float acxHeadAccentInner;\n'+shader.fragmentShader;
   const marker='#include <lights_fragment_end>';if(!shader.fragmentShader.includes(marker))throw new Error('headAccentLight requires a standard lit material');
   shader.fragmentShader=shader.fragmentShader.replace(marker,marker+`
 vec3 acxHeadAccentP=(viewMatrix*vec4(acxHeadAccentPosition,1.)).xyz;
 vec3 acxHeadAccentL=acxHeadAccentP+vViewPosition;
 float acxHeadAccentD=length(acxHeadAccentL);
 acxHeadAccentL*=inversesqrt(max(dot(acxHeadAccentL,acxHeadAccentL),1e-12));
 vec3 acxHeadAccentA=normalize(mat3(viewMatrix)*acxHeadAccentAxis);
 float acxHeadAccentAtt=getDistanceAttenuation(acxHeadAccentD,acxHeadAccentCutoff,2.)*getSpotAttenuation(acxHeadAccentOuter,acxHeadAccentInner,dot(acxHeadAccentL,acxHeadAccentA));
 reflectedLight.directDiffuse+=material.diffuseColor*(RECIPROCAL_PI*max(dot(normal,acxHeadAccentL),0.)*acxHeadAccentIntensity*acxHeadAccentAtt*clamp(vAcxHeadAccentReceiver,0.,1.));
 `);
  };m.customProgramCacheKey=()=>key+'|acx-head-accent-light-v1';m.needsUpdate=true;
 }
}
