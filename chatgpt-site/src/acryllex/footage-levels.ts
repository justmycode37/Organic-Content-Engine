import type * as THREE from 'three';

export interface FootageLevels {readonly blackPoint:number;readonly whitePoint:number}

/** Runtime grading belongs to the instance; prepared atlas pixels remain shared and unchanged. */
export function parseFootageLevels(input:unknown):FootageLevels|null{
 if(input===undefined)return null;
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('footage sourceLevels must be an object');
 const value=input as Record<string,unknown>;
 if(Object.keys(value).some(k=>k!=='blackPoint'&&k!=='whitePoint'))throw new Error('footage sourceLevels supports only blackPoint and whitePoint');
 const blackPoint=value.blackPoint===undefined?0:value.blackPoint,whitePoint=value.whitePoint===undefined?1:value.whitePoint;
 if(typeof blackPoint!=='number'||!Number.isFinite(blackPoint)||blackPoint<0||blackPoint>1||typeof whitePoint!=='number'||!Number.isFinite(whitePoint)||whitePoint<0||whitePoint>1||whitePoint-blackPoint<1e-6)throw new Error('footage sourceLevels requires finite 0 <= blackPoint < whitePoint <= 1, with a range of at least 0.000001');
 if(blackPoint===0&&whitePoint===1)return null;
 return {blackPoint,whitePoint};
}

/** Map source intensity to coverage without changing source alpha, hue or the scene ink. */
export function applyFootageLevels(material:THREE.MeshBasicMaterial,input:unknown){
 const levels=parseFootageLevels(input);if(!levels)return;
 const previous=material.onBeforeCompile,previousKey=material.customProgramCacheKey();
 const uniforms={acxFootageBlack:{value:levels.blackPoint},acxFootageRange:{value:levels.whitePoint-levels.blackPoint}};
 material.onBeforeCompile=function(shader,renderer){
  previous.call(this,shader,renderer);
  const marker='#include <map_fragment>';
  if(!shader.fragmentShader.includes(marker))throw new Error('footage sourceLevels: map shader chunk unavailable');
  Object.assign(shader.uniforms,uniforms);
  shader.fragmentShader='uniform float acxFootageBlack;\nuniform float acxFootageRange;\n'+shader.fragmentShader.replace(marker,marker+`\n{
   float acxSourceIntensity=max(max(diffuseColor.r,diffuseColor.g),diffuseColor.b);
   float acxGradedIntensity=clamp((acxSourceIntensity-acxFootageBlack)/acxFootageRange,0.0,1.0);
   diffuseColor.rgb*=acxGradedIntensity/max(acxSourceIntensity,0.000001);
  }\n`);
 };
 material.customProgramCacheKey=()=>previousKey+'|acx-footage-levels1';
 material.needsUpdate=true;
}
