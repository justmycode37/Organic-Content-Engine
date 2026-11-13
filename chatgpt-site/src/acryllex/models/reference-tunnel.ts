import * as THREE from 'three';
import {G,at,deg,lerp,clamp,depthFade} from '../kit.ts';
import {defineModel} from './types.ts';

// ================================================================= tunnel (camera flies inside)
/** Superellipse (rounded-square) outline, half-width a, half-height b. */
function squircle(a:number,b:number,n:number,e=4,floorRatio=1):[number,number][]{const pts:[number,number][]=[];for(let i=0;i<n;i++){const t=i/n*Math.PI*2;const c=Math.cos(t),s2=Math.sin(t);pts.push([a*Math.sign(c)*Math.pow(Math.abs(c),2/e),Math.max(-b*floorRatio,b*Math.sign(s2)*Math.pow(Math.abs(s2),2/e))]);}return pts;}
/** Open tube along -z with a squircle cross-section (normals point inward). */
function squircleTube(a:number,b:number,len:number,n:number,m:number,exponent=4,floorRatio=1){const ring=squircle(a,b,n,exponent,floorRatio);const pos:number[]=[],idx:number[]=[];
 for(let j=0;j<=m;j++)for(const [x,y] of ring)pos.push(x,y,-len*j/m+len/2);
 for(let j=0;j<m;j++)for(let i=0;i<n;i++){const a0=j*n+i,a1=j*n+(i+1)%n,b0=a0+n,b1=a1+n;idx.push(a0,b0,a1,a1,b0,b1);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();return g;}

/** Shape-preserving Hermite slopes for an editable distance curve. */
function travelSlopes(keys:[number,number][]):number[]{
 const n=keys.length;if(n<2)return keys.map(()=>0);const h=keys.slice(1).map((b,i)=>b[0]-keys[i]![0]),d=h.map((v,i)=>(keys[i+1]![1]-keys[i]![1])/v),m=Array(n).fill(0) as number[];
 if(n===2)return [d[0]!,d[0]!];
 for(let i=1;i<n-1;i++){const a=d[i-1]!,b=d[i]!;if(a*b>0){const w1=2*h[i]!+h[i-1]!,w2=h[i]!+2*h[i-1]!;m[i]=(w1+w2)/(w1/a+w2/b);}}
 const end=(h0:number,h1:number,d0:number,d1:number)=>{let v=((2*h0+h1)*d0-h0*d1)/(h0+h1);if(v*d0<=0)v=0;else if(d0*d1<0&&Math.abs(v)>3*Math.abs(d0))v=3*d0;return v;};m[0]=end(h[0]!,h[1]!,d[0]!,d[1]!);m[n-1]=end(h[n-2]!,h[n-3]!,d[n-2]!,d[n-3]!);return m;
}
function travelAt(keys:[number,number][],slopes:number[],t:number,cubic:boolean,extend:boolean):number|undefined{
 if(!keys.length)return;if(cubic&&extend){const first=keys[0]!,last=keys.at(-1)!;if(t<first[0])return first[1]+slopes[0]!*(t-first[0]);if(t>last[0])return last[1]+slopes.at(-1)!*(t-last[0]);}for(let i=1;i<keys.length;i++){const a=keys[i-1]!,b=keys[i]!;if(t<b[0]){const h=b[0]-a[0],u=clamp((t-a[0])/h);if(!cubic)return lerp(a[1],b[1],u);const u2=u*u,u3=u2*u;return(2*u3-3*u2+1)*a[1]+(u3-2*u2+u)*h*slopes[i-1]!+(-2*u3+3*u2)*b[1]+(u3-u2)*h*slopes[i]!;}}return keys.at(-1)![1];
}

export const tunnel=defineModel({
 id:'tunnel',aliases:['corridor','wormhole','tube-tunnel','go-deeper','rabbit-hole','hyperloop'],
 describe:'Inside a long round sci-fi tunnel: smooth curved wall panels with faint ribs, a light bar on the ceiling, a light on the floor and two diagonal light strips on the upper walls, repeating into a black depth void. Put the camera inside (camera.pos [0,0,1], look [0,0,-10]). `fly` 0..1 speed of travel.',
 controls:{fly:'0 slow .. 1 fast travel (default 0.5)',glow:'lights 0..1 (default 1)',depth:'0 near walls only .. 1 full depth',ceiling:'ceiling light intensity 0..1 (default 1)',floor:'floor down-light intensity0..1 (default1)',travel:'optional absolute travel distance in metres'},defaults:{fly:0.5,glow:1,depth:1,floor:1},params:{radius:'m (default 1.6)',fog:'depth fade distance m (default 9)',spacing:'m between light sets (default 2.6)',direction:'forward | backward',phase:'initial longitudinal offset in metres',exponent:'cross-section exponent: 2 round .. 8 rounded square',ratio:'cross-section width / height (default 1.2)',floorRatio:'lower wall fraction clipped to a flat floor .35..1 (default1: fully round)',revealStart:'visible-depth fraction when depth=0 (default .35)',fadePower:'depth fade power (default 1)',wallTone:'wall albedo (default .55)',wallRoughness:'wall microfacet roughness (default1)',wallMetalness:'wall metallic reflection0..1 (default0)',floorRoughness:'optional floor finish roughness0..1 (default wall finish)',floorMetalness:'optional floor finish metallic reflection0..1 (default wall finish)',sideWidth:'side strip width m (default .22)',sideLength:'side strip length m (default 1.2)',sideGlow:'side strip emission (default .8)',sideAngle:'side strip angle from vertical, degrees (default 45)',lampPower:'local side lamp intensity (default .35)',ceilingPower:'physical roof-lamp intensity (default0)',ceilingLitStations:'number of roof stations casting light (default8)',ceilingSamples:'area-emitter samples across the roof fixture1..9 (default1)',ceilingInset:'roof emitter distance below the ceiling m (default .12)',ceilingOffset:'roof emitter longitudinal offset m (default0)',ceilingDistance:'roof lamp attenuation distance m (default radius×6)',ceilingCone:'roof emission cone degrees (default170)',ceilingPenumbra:'roof emission soft edge0..1 (default .3)',floorLight:'false hides the floor plate (default true)',sideLights:'false hides side plates and side lamps (default true)',ceilingWidth:'ceiling fixture width m (default .62)',ceilingMountInset:'optional roof-fixture offset inside the tube m (default radius*.03)',ceilingLength:'ceiling fixture length m (default .32)',floorWidth:'floor fixture width m (default .22)',floorLength:'floor fixture length m (default .5)',ribInset:'rib width into the tunnel m (default .09)',ribTone:'rib albedo (default .85)',lights:'false hides fixtures',ribs:'false hides ribs',timeOrigin:'travel starts at this scene time',travelPath:'optional [sceneTime,metres] camera-distance keyframes',travelInterpolation:'linear | pchip: monotone cubic camera-distance interpolation (default linear)',travelExtrapolate:'extend a PCHIP curve with its endpoint velocity (default false)',floorBeamPower:'optional forward down-light intensity (default0)',floorBeamX:'forward down-light x m (default0)',floorBeamY:'forward down-light y m (default -.8)',floorBeamZ:'forward down-light z m (default1)',floorBeamTargetZ:'down-light target z m (default -3)',floorBeamCone:'down-light horizontal cone degrees (default12)',floorBeamConeY:'down-light vertical cone degrees (default horizontal)',speed:'absolute travel speed m/s (default derived from fly)',acceleration:'travel acceleration m/s² (default 0)'},size:'3.2 m wide, endless',
 build(ctx){
  const root=new THREE.Group();const R=ctx.num('radius',1.6,0.5,10),fog=ctx.num('fog',9,2,40),sp=ctx.num('spacing',2.6,0.8,10),exponent=ctx.num('exponent',4,2,8);const N=Math.ceil(48/sp);
  const segs=new THREE.Group();root.add(segs);
  const fades:{uniforms:ReturnType<typeof depthFade>;light:boolean}[]=[];const lamps:THREE.PointLight[]=[];const roofLamps:THREE.SpotLight[]=[];
  const ratio=ctx.num('ratio',1.2,.7,2),sideAngle=ctx.num('sideAngle',45,15,75),floorRatio=ctx.num('floorRatio',1,.35,1),ceilingInset=ctx.num('ceilingMountInset',-1,-1,R),ceilingY=ceilingInset>=0?R-ceilingInset:R*.97;
  // Walls extend behind the camera. Moving decorative segments cannot open a gap or change their tone.
  const wall=ctx.mesh(at(squircleTube(R*ratio,R,64,128,32,exponent,floorRatio),[0,0,-24]),{tone:ctx.num('wallTone',.55,.05,1),side:THREE.DoubleSide,rough:ctx.num('wallRoughness',1,.04,1)});
  (wall.material as THREE.MeshStandardMaterial).metalness=ctx.num('wallMetalness',0,0,1);
  const wallMaterial=wall.material as THREE.MeshStandardMaterial;
  const floorFinish=ctx.num('floorRoughness',-1,-1,1)>=0||ctx.num('floorMetalness',-1,-1,1)>=0?{rough:{value:ctx.num('floorRoughness',wallMaterial.roughness,0,1)},metal:{value:ctx.num('floorMetalness',wallMaterial.metalness,0,1)}}:null;
  if(floorFinish){const original=wallMaterial.onBeforeCompile,key=wallMaterial.customProgramCacheKey();wallMaterial.onBeforeCompile=(shader,renderer)=>{original.call(wallMaterial,shader,renderer);Object.assign(shader.uniforms,{tubeFloorRough:floorFinish.rough,tubeFloorMetal:floorFinish.metal});shader.vertexShader='varying float vTubeFloor;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>\n vTubeFloor=1.-smoothstep(${(-R*floorRatio+R*.02).toFixed(8)},${(-R*floorRatio+R*.16).toFixed(8)},position.y);`);shader.fragmentShader='varying float vTubeFloor;uniform float tubeFloorRough;uniform float tubeFloorMetal;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\n roughnessFactor=mix(roughnessFactor,tubeFloorRough,vTubeFloor);').replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\n metalnessFactor=mix(metalnessFactor,tubeFloorMetal,vTubeFloor);');};wallMaterial.customProgramCacheKey=()=>`tube-floor-finish-v1:${R}:${floorRatio}:${key}`;}
  // Elliptical forward down-light, evaluated as positive Lambertian irradiance.
  // Separate horizontal/vertical cones model a shaped luminaire, without a map.
  const beamPower=ctx.num('floorBeamPower',0,0,500)>0?{value:ctx.num('floorBeamPower',0,0,500)}:null;
  if(beamPower){const original=wallMaterial.onBeforeCompile,key=wallMaterial.customProgramCacheKey();const origin=new THREE.Vector3(ctx.num('floorBeamX',0,-R,R),ctx.num('floorBeamY',-.8,-R,R),ctx.num('floorBeamZ',1,-20,5));const aim=new THREE.Vector3(origin.x,-R*floorRatio,ctx.num('floorBeamTargetZ',-3,-40,0)).sub(origin).normalize(),vertical=new THREE.Vector3().crossVectors(aim,new THREE.Vector3(1,0,0)).normalize();const vector=(v:THREE.Vector3)=>`vec3(${v.toArray().map(n=>n.toFixed(8)).join(',')})`;const cone=ctx.num('floorBeamCone',12,3,90),coneY=ctx.num('floorBeamConeY',cone,3,120);wallMaterial.onBeforeCompile=(shader,renderer)=>{original.call(wallMaterial,shader,renderer);shader.uniforms.tubeBeamPower=beamPower;shader.vertexShader='varying vec3 vTubeBeamPos;varying vec3 vTubeBeamNormal;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vTubeBeamPos=position;vTubeBeamNormal=-normal;');shader.fragmentShader='varying vec3 vTubeBeamPos;varying vec3 vTubeBeamNormal;uniform float tubeBeamPower;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
   vec3 beamVector=vTubeBeamPos-${vector(origin)};
   float beamDepth=max(.0001,dot(beamVector,${vector(aim)}));
   vec2 beamAngle=vec2(beamVector.x,dot(beamVector,${vector(vertical)}))/beamDepth/vec2(${Math.tan(deg(cone*.5)).toFixed(8)},${Math.tan(deg(coneY*.5)).toFixed(8)});
   float beamCone=1.-smoothstep(.1,1.,length(beamAngle));
   float beamD2=max(.01,dot(beamVector,beamVector));
   float beamCos=max(0.,dot(normalize(vTubeBeamNormal),-beamVector*inversesqrt(beamD2)));
   float beamReceiver=1.-smoothstep(${(-R*floorRatio+R*.01).toFixed(8)},${(-R*floorRatio+R*.16).toFixed(8)},vTubeBeamPos.y);
   reflectedLight.directDiffuse+=diffuseColor.rgb*(tubeBeamPower*beamCos*beamCone*beamReceiver/(3.14159265359*beamD2));
  `);};wallMaterial.customProgramCacheKey=()=>`tube-shaped-down-light-v1:${R}:${floorRatio}:${origin.toArray()}:${aim.toArray()}:${cone}:${coneY}:${key}`;}
  root.add(wall);fades.push({uniforms:depthFade(wall.material as THREE.MeshStandardMaterial),light:false});
  for(let i=-2;i<N;i++){const g=new THREE.Group();g.position.z=-i*sp;
   // A shallow joint at every panel interval.
   if(ctx.bool('ribs',true))g.add(ctx.mesh(at(G.extrude(squircle(R*ratio+0.02,R+0.02,96,exponent,floorRatio),0.12,0,[squircle(R*ratio-ctx.num('ribInset',.09,.01,R*.5),R-ctx.num('ribInset',.09,.01,R*.5),96,exponent,floorRatio).reverse()]),[0,0,0]),{tone:ctx.num('ribTone',.85,.05,1)}));
   // lights: ceiling bar, floor light, diagonal strips at 10 and 2 o'clock
   if(ctx.bool('lights',true)){
   g.add(ctx.mesh(at(G.rbox(ctx.num('ceilingWidth',.62,.1,2),0.07,ctx.num('ceilingLength',.32,.1,3),0.03),[0,ceilingY,0]),{tone:0.9,glow:1.6,glowControl:'ceiling'}));
   if(ctx.bool('floorLight',true))g.add(ctx.mesh(at(G.rbox(ctx.num('floorWidth',.22,.04,1),0.06,ctx.num('floorLength',.5,.1,3),0.02),[0,-R*0.97,-0.3]),{tone:0.9,glow:1.4}));
   if(i>=-1&&i<Math.round(ctx.num('ceilingLitStations',8,1,64))-1&&ctx.num('ceilingPower',0,0,10)>0){const z=ctx.num('ceilingOffset',0,-sp,sp),samples=Math.round(ctx.num('ceilingSamples',1,1,9));for(let j=0;j<samples;j++){const x=samples===1?0:ctx.num('ceilingWidth',.62,.1,2)*.45*(2*j/(samples-1)-1);const lamp=new THREE.SpotLight(0xffffff,ctx.num('ceilingPower',0,0,10)/samples,ctx.num('ceilingDistance',R*6,0,100),deg(ctx.num('ceilingCone',170,30,179)*.5),ctx.num('ceilingPenumbra',.3,0,1),2);lamp.position.set(x,R-ctx.num('ceilingInset',.12,.02,R),z);lamp.target.position.set(x,-R,z);g.add(lamp.target,lamp);roofLamps.push(lamp);}}
   if(ctx.bool('sideLights',true))for(const sgn of [-1,1]){const a=deg(90+sgn*sideAngle),x=Math.sign(Math.cos(a))*Math.pow(Math.abs(Math.cos(a)),2/exponent)*(R*ratio-.04),y=Math.pow(Math.abs(Math.sin(a)),2/exponent)*(R-.04);
    g.add(ctx.mesh(at(G.rbox(ctx.num('sideWidth',.22,.02,.6),0.035,ctx.num('sideLength',1.2,.2,4),0.015),[x,y,-sp*0.5],[0,0,sgn*sideAngle]),{tone:0.6,glow:ctx.num('sideGlow',.8,0,3)}));
    if(i>=-1&&i<=4){const lamp=new THREE.PointLight(0xffffff,ctx.num('lampPower',.35,0,4),R*5,2);lamp.position.set(x*.94,y*.94,-sp*.5);g.add(lamp);lamps.push(lamp);}
   }
   }
   g.traverse(o=>{const m=(o as THREE.Mesh).material as THREE.MeshStandardMaterial|undefined;if(m)fades.push({uniforms:depthFade(m),light:!!m.userData.glow});});
   segs.add(g);}
  const travelPath=Array.isArray(ctx.params.travelPath)?ctx.params.travelPath.filter((v):v is [number,number]=>Array.isArray(v)&&v.length===2&&v.every(n=>typeof n==='number'&&Number.isFinite(n))).slice(0,512).sort((a,b)=>a[0]-b[0]).filter((v,i,a)=>i===a.length-1||v[0]!==a[i+1]![0]):[];
  const curveSlopes=travelSlopes(travelPath),cubicTravel=ctx.str('travelInterpolation','linear',['linear','pchip'] as const)==='pchip';
  const direction=ctx.str('direction','forward',['forward','backward'] as const)==='backward'?-1:1;
  return {root,grounded:false,anchors:{inside:[0,0,1]},update(c,t){
   const clock=t;
   const time=Math.max(0,clock-ctx.num('timeOrigin',0,0,20));
   if(floorFinish){floorFinish.rough.value=ctx.num('floorRoughness',wallMaterial.roughness,0,1);floorFinish.metal.value=ctx.num('floorMetalness',wallMaterial.metalness,0,1);}
   const speed=ctx.num('speed',-1,-1,100);
   const authored=travelAt(travelPath,curveSlopes,clock,cubicTravel,ctx.bool('travelExtrapolate',false));
   const travel=c.travel??authored??(time*(speed>=0?speed:0.6+(c.fly??0.5)*5)+.5*ctx.num('acceleration',0,0,20)*time*time);
   const off=direction*(travel%sp)+ctx.num('phase',0,-sp,sp);segs.position.z=off;
   const depth=fog*lerp(ctx.num('revealStart',.35,.05,1),1,clamp(c.depth??1));
   for(const f of fades){f.uniforms.near.value=depth*.12;f.uniforms.far.value=depth*(f.light?1.15:1);f.uniforms.power.value=f.light ? .75 : ctx.num('fadePower',1,.2,4);}
   for(const lamp of lamps)lamp.intensity=ctx.num('lampPower',.35,0,4)*(c.glow??1);
   if(beamPower)beamPower.value=ctx.num('floorBeamPower',0,0,500)*(c.glow??1)*clamp(c.floor??1);
   for(const lamp of roofLamps){lamp.intensity=ctx.num('ceilingPower',0,0,10)/Math.round(ctx.num('ceilingSamples',1,1,9))*(c.glow??1);lamp.position.y=R-ctx.num('ceilingInset',.12,.02,R);lamp.position.z=ctx.num('ceilingOffset',0,-sp,sp);lamp.target.position.z=lamp.position.z;}
  }};
 },
});
