import * as THREE from 'three';

export interface WaterSkyOptions {
 resolution?:number;zenith?:number;horizon?:number;ground?:number;
 sunDirection?:readonly[number,number,number];sunIntensity?:number;sunAngularRadius?:number;
}
export interface WaterMaterialOptions {
 /** Neutral by default; scene ink is applied later by the fixed-ink renderer. */
 color?:THREE.ColorRepresentation;roughness?:number;ior?:number;transmission?:number;
 thickness?:number;attenuationDistance?:number;attenuationColor?:THREE.ColorRepresentation;
 environmentIntensity?:number;sky?:WaterSkyOptions;
 /** World-space capillary normal relief in metres, without UVs or displaced vertices. */
 rippleAmplitude?:number;rippleFrequency?:number;/** Advection velocity, world metres/second. */flow?:readonly[number,number,number];
}
export interface WaterMaterialResource {
 material:THREE.MeshPhysicalMaterial;environment:THREE.CubeTexture;
 /** Clear-water hard shadows are omitted; opaque foam still casts/receives, and water receives. */
 shadowPolicy:Readonly<{castShadow:boolean;receiveShadow:boolean}>;
 /** Absolute scene-local seconds; reverse seeking does not accumulate state. */
 update(time:number):void;dispose():void;
}
const num=(v:number|undefined,f:number,lo:number,hi:number)=>{
 const n=v??f;if(!Number.isFinite(n))throw new Error('Water optics parameters must be finite');return Math.max(lo,Math.min(hi,n));
};
/** A neutral, source-independent radiance dome. No photographs, reference pixels or scene camera. */
function waterSky(options:WaterSkyOptions={}){
 const n=Math.round(num(options.resolution,64,16,256)),zenith=num(options.zenith,.7,0,20),horizon=num(options.horizon,1.4,0,20),ground=num(options.ground,.07,0,20),sunIntensity=num(options.sunIntensity,8,0,100),sunRadius=num(options.sunAngularRadius,.075,.005,1),sun=new THREE.Vector3(...(options.sunDirection??[.4,.75,.52])).normalize();
 if(!sun.toArray().every(Number.isFinite)||sun.lengthSq()<.5)throw new Error('Water sky sun direction must be nonzero');
 const direction=new THREE.Vector3(),faces:THREE.DataTexture[]=[];
 for(let face=0;face<6;face++){
  const data=new Float32Array(n*n*4);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
   const u=2*(x+.5)/n-1,v=2*(y+.5)/n-1;
   switch(face){case 0:direction.set(1,-v,-u);break;case 1:direction.set(-1,-v,u);break;case 2:direction.set(u,1,v);break;case 3:direction.set(u,-1,-v);break;case 4:direction.set(u,-v,1);break;default:direction.set(-u,-v,-1);}
   direction.normalize();const h=direction.y,sky=horizon+(zenith-horizon)*Math.pow(Math.max(0,h),.55),below=ground+(horizon-ground)*Math.exp(Math.min(0,h)*18),cloud=.1*Math.max(0,h)*Math.sin(direction.x*13+direction.z*9)*Math.sin(direction.z*19-direction.y*7),angle=Math.acos(Math.max(-1,Math.min(1,direction.dot(sun)))),radiance=Math.max(0,(h>=0?sky:below)+cloud+sunIntensity*Math.exp(-angle*angle/(sunRadius*sunRadius)));
   const i=(y*n+x)*4;data[i]=data[i+1]=data[i+2]=radiance;data[i+3]=1;
  }
  const texture=new THREE.DataTexture(data,n,n,THREE.RGBAFormat,THREE.FloatType);texture.colorSpace=THREE.LinearSRGBColorSpace;texture.needsUpdate=true;faces.push(texture);
 }
 const environment=new THREE.CubeTexture(faces);environment.name='owned-neutral-procedural-water-sky';environment.type=THREE.FloatType;environment.format=THREE.RGBAFormat;environment.colorSpace=THREE.LinearSRGBColorSpace;environment.generateMipmaps=true;environment.minFilter=THREE.LinearMipmapLinearFilter;environment.needsUpdate=true;
 return{environment,faces};
}

/** Dielectric screen-space water optics, not ray tracing or a liquid simulation. Owns its sky textures. */
export function createWaterMaterial(options:WaterMaterialOptions={}):WaterMaterialResource{
 const transmission=num(options.transmission,1,0,1),time={value:0},amplitude={value:num(options.rippleAmplitude,.002,0,.1)},frequency={value:num(options.rippleFrequency,35,.01,500)},flow={value:new THREE.Vector3(...(options.flow??[.6,0,.25]))};
 if(!flow.value.toArray().every(Number.isFinite))throw new Error('Water ripple flow must be finite');
 const physical={color:options.color??0xffffff,roughness:num(options.roughness,.06,.02,1),metalness:0,ior:num(options.ior,1.333,1,2.333),transmission,thickness:num(options.thickness,.75,0,100),attenuationDistance:num(options.attenuationDistance,6,.001,1e6),attenuationColor:options.attenuationColor??0xe0e0e0,envMapIntensity:num(options.environmentIntensity,1,0,20),side:THREE.FrontSide,depthWrite:true};
 const {environment,faces}=waterSky(options.sky),material=new THREE.MeshPhysicalMaterial({...physical,envMap:environment});
 material.name='dielectric-water-optics';material.userData.explicit=true;material.userData.tone=1;material.userData.waterOptics={ior:material.ior,neutralProceduralSky:true,rippleWorldMetres:true,screenSpaceTransmission:true};
 material.onBeforeCompile=shader=>{
  shader.uniforms.waterOpticsTime=time;shader.uniforms.waterOpticsAmplitude=amplitude;shader.uniforms.waterOpticsFrequency=frequency;shader.uniforms.waterOpticsFlow=flow;
  shader.vertexShader='varying vec3 vWaterOpticsWorld;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\n vWaterOpticsWorld=worldPosition.xyz;');
  shader.fragmentShader=`varying vec3 vWaterOpticsWorld;
   uniform float waterOpticsTime;uniform float waterOpticsAmplitude;uniform float waterOpticsFrequency;uniform vec3 waterOpticsFlow;
   float waterHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453123);}
   float waterNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*f*(f*(f*6.0-15.0)+10.0);return mix(mix(mix(waterHash(i),waterHash(i+vec3(1,0,0)),f.x),mix(waterHash(i+vec3(0,1,0)),waterHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(waterHash(i+vec3(0,0,1)),waterHash(i+vec3(1,0,1)),f.x),mix(waterHash(i+vec3(0,1,1)),waterHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
  `+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
   vec3 wp=(vWaterOpticsWorld-waterOpticsFlow*waterOpticsTime)*(waterOpticsFrequency/6.2831853)*vec3(1.0,.65,1.4);
   wp+=vec3(.35*waterNoise(wp*.47+vec3(7.3,2.1,5.8)));
   float wh=waterOpticsAmplitude*2.0*(.62*(waterNoise(wp)-.5)+.28*(waterNoise(wp*2.03+vec3(11.7))-.5)+.1*(waterNoise(wp*4.17+vec3(3.9))-.5));
   vec3 wx=dFdx(-vViewPosition),wy=dFdy(-vViewPosition),wr1=cross(wy,normal),wr2=cross(normal,wx);
   float wd=dot(wx,wr1);
   if(abs(wd)>1e-10)normal=normalize(normal-(dFdx(wh)*wr1+dFdy(wh)*wr2)/wd);
  `);
 };
 material.customProgramCacheKey=()=> 'acryllex-world-water-optics-v2';
 let disposed=false;
 const release=()=>{if(disposed)return;disposed=true;environment.dispose();for(const texture of faces)texture.dispose();};
 material.addEventListener('dispose',release);
 return{material,environment,shadowPolicy:Object.freeze({castShadow:transmission<.95,receiveShadow:true}),update(t){if(!Number.isFinite(t))throw new Error('Water optics time must be finite');if(!disposed)time.value=t;},dispose(){if(disposed)return;material.dispose();release();}};
}
