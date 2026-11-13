import * as THREE from 'three';
import {clamp,lerp,ease,smooth} from './kit.ts';
import {TessellateModifier} from 'three/examples/jsm/modifiers/TessellateModifier.js';
import type {FxKind,FxFrom} from './spec.ts';

/**
 * Object effects: one-shot actions that play on an object without changing what it is
 * (a heart pounds, a shock wave runs over the surface, a scan line passes...).
 * Transform effects return offsets; surface effects drive a small shader patch on every
 * standard material of the object (vertex displacement + emissive bands), so the dither
 * pass shows them as moving dot density.
 */

export const FX_KINDS=['heartbeat','shockwave','ripple','shake','recoil','glint','scan','charge','glitch'] as const;
/** Default length of one run of each effect (seconds). */
export const FX_DUR:Record<FxKind,number>={heartbeat:0.9,shockwave:1.1,ripple:1.5,shake:0.6,recoil:0.7,glint:0.8,scan:1.2,charge:1.3,glitch:0.6};
/** Effects whose vertex noise needs a dense mesh. */
export const DENSE_FX=new Set<string>(['heartbeat','shockwave','ripple','shake','recoil','scan']);

export interface FxTrack {kind:FxKind;t0:number;t1:number;from:FxFrom;amount:number;count:number}

/** Shared uniforms of one object; every patched material points at the same value objects. */
export function fxUniforms(){
 return {
  uFxO:{value:new THREE.Vector3()},uFxR:{value:0},uFxW:{value:1},uFxA:{value:0},uFxG:{value:0},uFxMode:{value:0},
  uFxGl:{value:0},uFxGlB:{value:0.1},uFxT:{value:0},
  uFxSD:{value:new THREE.Vector3(0,1,0)},uFxSP:{value:0},uFxSW:{value:0.1},uFxSG:{value:0},uFxST:{value:0},
  uFxE:{value:0},uFxDim:{value:1},
  uDsA:{value:0},uDsW:{value:0},uDsS:{value:0},uDsB:{value:0},uDsC:{value:0.05},uDsT:{value:0},uDsV:{value:0},
  uMbK:{value:0},uMbC:{value:new THREE.Vector3()},uMbR:{value:1},
  uRvMode:{value:0},uRvO:{value:new THREE.Vector3()},uRvD:{value:new THREE.Vector3(0,1,0)},uRvP:{value:0},uRvW:{value:0.05},uRvG:{value:0},
 };
}
export type FxUniforms=ReturnType<typeof fxUniforms>;

const WAVE_PARS=`
uniform vec3 uFxO;uniform float uFxR;uniform float uFxW;uniform float uFxA;uniform float uFxG;uniform int uFxMode;
uniform vec3 uFxSD;uniform float uFxSP;uniform float uFxSW;uniform float uFxST;uniform float uMbK;
uniform float uDsA;uniform float uDsW;uniform float uDsS;uniform float uDsB;uniform float uDsC;uniform float uDsT;uniform float uDsV;
varying vec3 vFxWp;
float fxHash3(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453);}
float fxSweep(vec3 p){float sx=(dot(p,uFxSD)-uFxSP)/max(uFxSW,1e-5);return exp(-sx*sx)+(sx<0.?uFxST*exp(sx/6.):0.);}
/** How strongly the dots at p are disrupted: whole object, inside the wave band, the sweep band, mid-morph. */
float fxZone(vec3 p,float waveF){return clamp(uDsA+uDsW*abs(waveF)+uDsS*fxSweep(p)+uDsB,0.,1.);}
float fxProfile(float x){
 if(uFxMode==1)return exp(-x*x*1.6)*(x<0.?mix(1.,.35,smoothstep(0.,-2.5,x)):1.);
 if(uFxMode==2)return sin(x*2.4)*smoothstep(1.2,.2,x)*exp(min(x,0.)*.32);
 return 0.;
}
`;
const VERT_PARS=WAVE_PARS+`
uniform vec3 uMbC;uniform float uMbR;uniform float uFxGl;uniform float uFxGlB;uniform float uFxT;
float fxHash(float n){return fract(sin(n*127.1+311.7)*43758.5453);}
`;
const VERT_BODY=`
vec3 fxDelta=vec3(0.);
{
 vec4 fxW4=modelMatrix*vec4(position,1.);vec3 wp=fxW4.xyz;mat3 m3=mat3(modelMatrix);
 vec3 wn=normalize(m3*objectNormal+vec3(1e-6));vec3 d=vec3(0.);bool fxOn=false;
 if(uMbK>0.){
  fxOn=true;vec3 q=wp-uMbC;vec3 qn=normalize(q+vec3(1e-5,2e-5,3e-5));
  float wob=1.+.06*sin(qn.x*7.+qn.y*5.+uMbK*9.)*uMbK;vec3 sp=uMbC+qn*uMbR*wob;
  d+=(sp-wp)*uMbK;wn=normalize(mix(wn,qn,uMbK));
 }
 if(uFxMode>0&&uFxA+uFxG>0.){
  vec3 r=wp+d-uFxO;float dist=length(r);float x=(dist-uFxR)/max(uFxW,1e-5);
  fxOn=true;d+=wn*uFxA*fxProfile(x);
 }
 if(uDsV>0.){
  float wf=0.;if(uFxMode>0){vec3 r=wp-uFxO;wf=fxProfile((length(r)-uFxR)/max(uFxW,1e-5));}
  float z=fxZone(wp,wf);
  if(z>.01){fxOn=true;vec3 cell=floor(wp/max(uDsC*.6,1e-5));d+=wn*(fxHash3(cell+uDsT*1.37)-.5)*2.*uDsV*z;}
 }
 if(uFxGl>0.){
  fxOn=true;float band=floor(wp.y/max(uFxGlB,1e-5));float h=fxHash(band*1.73+uFxT*7.1);
  if(h>.62)d.x+=(fxHash(band*3.1+uFxT*3.3)-.5)*2.*uFxGl;
 }
 if(fxOn){fxDelta=inverse(m3)*d;objectNormal=normalize(transpose(m3)*wn);}
 vFxWp=wp+d;
}
`;
const FRAG_PARS=WAVE_PARS+`
uniform float uFxSG;uniform float uFxE;uniform float uFxDim;
uniform int uRvMode;uniform vec3 uRvO;uniform vec3 uRvD;uniform float uRvP;uniform float uRvW;uniform float uRvG;
`;
/** Reveal masks: keep the surface inside a growing sphere (1) or below a moving plane (2), with a bright edge. */
const FRAG_REVEAL=`
float fxRevealGlow=0.;
if(uRvMode>0){
 float s=uRvMode==1?length(vFxWp-uRvO):dot(vFxWp,uRvD);float e=(uRvP-s)/max(uRvW,1e-5);
 if(e<0.)discard;
 fxRevealGlow=uRvG*exp(-e*e*.8);
}
`;
/** Per-pixel wave: the band glows and tilts the shading normal, so even a flat low-poly face shows the ring. */
const FRAG_NORMAL=`
float fxWaveGlow=0.,fxWaveDim=0.,fxWaveF=0.,fxDark=0.,fxSpark=0.;
if(uFxMode>0&&uFxA+uFxG>0.){
 vec3 r=vFxWp-uFxO;float dist=length(r);float w=max(uFxW,1e-5);float x=(dist-uFxR)/w;
 float f=fxProfile(x);fxWaveF=f;float df=(fxProfile(x+.03)-fxProfile(x-.03))/(.06*w);
 vec3 rh=dist>1e-5?mat3(viewMatrix)*(r/dist):vec3(0.);
 normal=normalize(normal-rh*clamp(uFxA*df*1.6,-.9,.9));
 fxWaveGlow=uFxG*abs(f);
 if(uFxMode==1)fxWaveDim=clamp(uFxG*.6*exp(-(x+1.7)*(x+1.7)*.7),0.,.85);
}
// random tile disruption: chunky world-space cells drop out, spark or catch the light at random, re-rolled ~20x a second
if(uDsA+uDsW+uDsS+uDsB>0.){
 float z=fxZone(vFxWp,fxWaveF);
 if(z>.005){
  vec3 cell=floor(vFxWp/max(uDsC,1e-5));float n=fxHash3(cell+uDsT*1.37),m=fxHash3(cell*1.7+uDsT*2.11+5.);
  if(n<z*.42)fxDark=1.;else if(n>1.-z*.3)fxSpark=1.4+m;
  vec3 jit=vec3(fxHash3(cell+11.1+uDsT),fxHash3(cell+23.7+uDsT),fxHash3(cell+31.3+uDsT))-.5;
  normal=normalize(normal+jit*1.6*z);
 }
}
`;
const FRAG_GLOW=`
totalEmissiveRadiance+=diffuseColor.rgb*(fxWaveGlow+fxRevealGlow+uFxE+uFxSG*fxSweep(vFxWp)+fxSpark);
`;

/** Install the effect hooks on a standard material. Materials already patched for another object are cloned first. */
export function patchMaterial(mat:THREE.Material,u:FxUniforms,owner:object):THREE.Material{
 if(!(mat as THREE.MeshStandardMaterial).isMeshStandardMaterial)return mat;
 let m=mat as THREE.MeshStandardMaterial;
 if(m.userData.fxOwner&&m.userData.fxOwner!==owner){m=m.clone();m.userData={...mat.userData};}
 m.userData.fxOwner=owner;
 const prev=m.onBeforeCompile;
 m.onBeforeCompile=(shader,renderer)=>{
  prev?.call(m,shader,renderer);
  Object.assign(shader.uniforms,u);
  shader.vertexShader=shader.vertexShader
   .replace('#include <common>','#include <common>\n'+VERT_PARS)
   .replace('#include <defaultnormal_vertex>',VERT_BODY+'#include <defaultnormal_vertex>')
   .replace('#include <skinning_vertex>','#include <skinning_vertex>\ntransformed+=fxDelta;');
  shader.fragmentShader=shader.fragmentShader
   .replace('#include <common>','#include <common>\n'+FRAG_PARS)
   .replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\n'+FRAG_REVEAL)
   .replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\n'+FRAG_NORMAL)
   .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n'+FRAG_GLOW)
   .replace('#include <opaque_fragment>','outgoingLight*=uFxDim*(1.-fxWaveDim)*(1.-fxDark);\n#include <opaque_fragment>');
 };
 const key=m.customProgramCacheKey.bind(m);
 m.customProgramCacheKey=()=>key()+'|acx-fx6';
 m.needsUpdate=true;
 return m;
}

/** Transform part of the active effects at time t. */
export interface FxPose {pos:THREE.Vector3;rot:THREE.Vector3;scale:THREE.Vector3}

const hashN=(n:number)=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};
/** Lub-dub envelope of one heartbeat. */
const beat=(u:number)=>pulse(u,0.02,.06,.1)+0.7*pulse(u,0.28,.05,.12);
const pulse=(u:number,at:number,attack=.06,decay=.16)=>u<at?0:u<at+attack?smooth((u-at)/attack):Math.exp(-(u-at-attack)/decay);
const n1=(x:number)=>Math.sin(x*12.9898)*0.5+Math.sin(x*4.1414+1.3)*0.35+Math.sin(x*31.7+2.1)*0.15;

function dirOf(from:FxFrom):THREE.Vector3{
 if(Array.isArray(from))return new THREE.Vector3(...from).normalize();
 return ({top:new THREE.Vector3(0,1,0),bottom:new THREE.Vector3(0,-1,0),left:new THREE.Vector3(-1,0,0),right:new THREE.Vector3(1,0,0),front:new THREE.Vector3(0,0,1),back:new THREE.Vector3(0,0,-1),center:new THREE.Vector3()} as Record<string,THREE.Vector3>)[from]?.clone()??new THREE.Vector3(0,0,1);
}

/** Local progress of a (possibly repeated) effect: run index and 0..1 within the run. */
function runOf(f:FxTrack,t:number){const len=(f.t1-f.t0)/f.count;const i=Math.min(f.count-1,Math.floor((t-f.t0)/len));return {u:clamp((t-f.t0-i*len)/len),len};}

export function fxPose(list:FxTrack[],t:number,size:number):FxPose{
 const out={pos:new THREE.Vector3(),rot:new THREE.Vector3(),scale:new THREE.Vector3(1,1,1)};
 for(const f of list){
  if(t<f.t0||t>=f.t1)continue;
  const {u}=runOf(f,t),a=f.amount,d=dirOf(f.from);
  switch(f.kind){
   case 'heartbeat':{const p=beat(u);const s=1+0.24*a*p;out.scale.multiplyScalar(s);out.scale.y*=1+0.04*a*p;out.pos.x+=n1(t*53)*size*0.012*a*p;break;}
   case 'shockwave':{const k=pulse(u,0,.04,.16);out.pos.addScaledVector(d,-size*0.08*a*k);out.scale.multiplyScalar(1-0.06*a*k);out.rot.z+=n1(t*47)*0.05*a*k;break;}
   case 'ripple':{const k=Math.sin(u*Math.PI*7)*Math.exp(-u*3.2);out.scale.multiplyScalar(1+0.035*a*k);out.scale.y*=1-0.02*a*k;break;}
   case 'shake':{const e=Math.pow(1-u,1.6)*a,x=u*55,st=Math.floor(t*24);out.pos.x+=(n1(x)*0.8+(hashN(st)-0.5)*0.5)*size*0.09*e;out.pos.y+=n1(x+17)*size*0.035*e;out.rot.z+=n1(x+33)*0.15*e;out.rot.y+=n1(x+51)*0.08*e;break;}
   case 'recoil':{const side=d.lengthSq()>0?d:new THREE.Vector3(-1,0,0);const k=Math.sin(Math.min(1,u/.12)*Math.PI*.5)*Math.exp(-Math.max(0,u-.12)*4.2)*Math.cos(Math.max(0,u-.12)*15)*a;
    out.pos.addScaledVector(side,-size*0.14*k);out.rot.z+=side.x*0.3*k;out.rot.x-=side.z*0.3*k;out.pos.y+=n1(t*61)*size*0.015*Math.abs(k);break;}
   case 'glitch':{const st=Math.floor(t*15),h=Math.abs(Math.sin(st*78.233+f.t0*9.1)*43758.5453)%1;if(h>0.45&&u<0.92){out.pos.x+=(h-0.72)*size*0.18*a;out.scale.x*=1+(h-0.7)*0.12*a;}break;}
   case 'charge':{const build=smooth(u/.82);const rel=u>.82?pulse(u,.82,.03,.07):0;out.pos.x+=n1(u*60)*size*0.008*build*a;out.scale.multiplyScalar(1-0.04*build*a*(u<.82?1:0)+0.1*rel*a);break;}
  }
 }
 return out;
}

/** Surface part: writes the shader uniforms for time t. `box` is the object's current world bounds. */
export function fxSurface(list:FxTrack[],t:number,u:FxUniforms,box:THREE.Box3){
 u.uFxMode.value=0;u.uFxA.value=0;u.uFxG.value=0;u.uFxGl.value=0;u.uFxSG.value=0;u.uFxST.value=0;u.uFxE.value=0;u.uFxDim.value=1;u.uFxT.value=Math.floor(t*15);
 u.uDsA.value=0;u.uDsW.value=0;u.uDsS.value=0;u.uDsB.value=0;u.uDsV.value=0;u.uDsT.value=Math.floor(t*20);
 const size=box.getSize(new THREE.Vector3()),c=box.getCenter(new THREE.Vector3()),span=Math.max(size.x,size.y,size.z,1e-3);
 u.uDsC.value=span/46;
 for(const f of list){
  if(t<f.t0||t>=f.t1)continue;
  const {u:k}=runOf(f,t),a=f.amount;
  switch(f.kind){
   case 'heartbeat':{const p=beat(k);u.uFxE.value+=0.45*a*p;u.uDsA.value+=0.5*a*p;u.uDsV.value=Math.max(u.uDsV.value,span*0.035*a*p);break;}
   case 'shockwave':case 'ripple':{
    const from=f.from,o=Array.isArray(from)?c.clone().add(new THREE.Vector3(...from).multiply(size).multiplyScalar(0.5)):originOn(box,from);
    let far=0;for(let i=0;i<8;i++)far=Math.max(far,o.distanceTo(new THREE.Vector3(i&1?box.max.x:box.min.x,i&2?box.max.y:box.min.y,i&4?box.max.z:box.min.z)));
    const wave=f.kind==='shockwave';const travel=wave?1-Math.pow(1-k,1.7):k;
    u.uFxMode.value=wave?1:2;u.uFxO.value.copy(o);u.uFxW.value=span*(wave?0.12:0.08);u.uFxR.value=lerp(-u.uFxW.value,far*1.08+u.uFxW.value*2,travel);
    const fade=wave?Math.pow(1-k,1.2):Math.pow(1-k,1.0);
    u.uFxA.value=span*(wave?0.075:0.04)*a*fade;u.uFxG.value=(wave?1.8:0.9)*a*fade;
    u.uDsW.value=(wave?1.0:0.75)*Math.min(1.5,a)*fade;u.uDsA.value+=(wave?0.18:0.08)*a*fade;u.uDsV.value=Math.max(u.uDsV.value,span*(wave?0.05:0.03)*a*fade);
    if(wave)u.uFxE.value+=0.7*a*pulse(k,0,.03,.08);
    break;}
   case 'glint':{const dir=new THREE.Vector3(1,0.7,0.25).normalize();const [lo,hi]=extent(box,dir);u.uFxSD.value.copy(dir);u.uFxSW.value=span*0.07;u.uFxSP.value=lerp(lo-span*0.15,hi+span*0.15,ease.inOut(k));u.uFxSG.value=1.4*a;break;}
   case 'scan':{const on=smooth(k/.08)*smooth((1-k)/.08);u.uFxSD.value.set(0,1,0);u.uFxSW.value=span*0.035;u.uFxST.value=0.35;u.uFxSP.value=lerp(box.min.y-span*0.04,box.max.y+span*0.04,ease.inOutSine(k));u.uFxSG.value=3.0*a*on;u.uFxE.value+=0.08*a;u.uDsS.value=0.95*Math.min(1.4,a)*on;u.uDsV.value=Math.max(u.uDsV.value,span*0.025*a*on);break;}
   case 'shake':{const e=Math.pow(1-k,1.6)*a;u.uDsA.value+=0.38*e;u.uDsV.value=Math.max(u.uDsV.value,span*0.022*e);break;}
   case 'recoil':{const h=Math.exp(-Math.max(0,k-.1)*5)*smooth(k/.1)*a;u.uDsA.value+=0.55*h;u.uDsV.value=Math.max(u.uDsV.value,span*0.035*h);u.uFxE.value+=0.35*h;break;}
   case 'charge':{const build=Math.pow(smooth(k/.82),1.6);const fl=0.75+0.25*Math.sin(k*90)*Math.sin(k*37);u.uFxE.value+=k<.82?0.85*a*build*fl:1.1*a*pulse(k,.82,.02,.06);break;}
   case 'glitch':{u.uFxGl.value=span*0.09*a*(1-k*0.6);u.uFxGlB.value=span*0.055;const st=Math.floor(t*15);if(Math.abs(Math.sin(st*12.7+f.t0*3.3)*43758.5453)%1<0.3&&k<0.92)u.uFxDim.value*=0.45;break;}
  }
 }
 u.uDsA.value=Math.min(1,u.uDsA.value);
 return u.uFxMode.value>0||u.uFxGl.value>0||u.uFxSG.value>0||u.uFxE.value>0||u.uFxDim.value<1||u.uDsA.value>0;
}

function originOn(box:THREE.Box3,from:string){
 const c=box.getCenter(new THREE.Vector3());
 switch(from){case 'top':c.y=box.max.y;break;case 'bottom':c.y=box.min.y;break;case 'left':c.x=box.min.x;break;case 'right':c.x=box.max.x;break;case 'back':c.z=box.min.z;break;case 'center':break;default:c.z=box.max.z;}
 return c;
}
function extent(box:THREE.Box3,dir:THREE.Vector3):[number,number]{let lo=Infinity,hi=-Infinity;for(let i=0;i<8;i++){const v=new THREE.Vector3(i&1?box.max.x:box.min.x,i&2?box.max.y:box.min.y,i&4?box.max.z:box.min.z).dot(dir);lo=Math.min(lo,v);hi=Math.max(hi,v);}return [lo,hi];}

/** Entrances / exits that come out of or go into darkness (object-level transitions). */
export const REVEAL_KINDS=['from-black','light-up','to-black'] as const;
export const REVEAL_DUR:Record<string,number>={'from-black':0.9,'light-up':0.9,'to-black':0.8};

/** Apply one reveal (k 0..1 of the entrance, or of the exit) on top of fxSurface. Returns false for other kinds. */
export function fxReveal(kind:string,k:number,u:FxUniforms,box:THREE.Box3):boolean{
 const size=box.getSize(new THREE.Vector3()),span=Math.max(size.x,size.y,size.z,1e-3);
 switch(kind){
  // dots thin out in Bayer order: the object emerges from / sinks into darkness
  case 'from-black':u.uFxDim.value*=Math.pow(smooth(k),1.3);return true;
  case 'to-black':u.uFxDim.value*=Math.pow(1-smooth(k),1.3);return true;
  // a light sweeps over it from the left: darkness on one side, a bright edge, lit on the other
  case 'light-up':{const dir=new THREE.Vector3(1,0.15,0.3).normalize();const [lo,hi]=extentOf(box,dir);u.uRvMode.value=2;u.uRvD.value.copy(dir);u.uRvW.value=span*0.08;u.uRvP.value=lerp(lo-span*0.02,hi+span*0.3,ease.inOut(k));u.uRvG.value=1.0*(1-smooth((k-.75)/.25));return true;}
 }
 return false;
}
export function resetReveal(u:FxUniforms){u.uRvMode.value=0;u.uRvG.value=0;u.uMbK.value=0;u.uDsB.value=0;}
function extentOf(box:THREE.Box3,dir:THREE.Vector3){return extent(box,dir);}

/** Object-to-object morph styles besides the point-cloud default. */
export const MORPH_STYLES=['particles','blob','flip','fade'] as const;
export type MorphStyle=typeof MORPH_STYLES[number];

/** Transform part of a styled morph for the source (inbound=false) or the result (inbound=true). */
export function morphPose(style:string,k:number,inbound:boolean){
 const out={visible:true,scale:1,rotY:0};
 const first=k<0.5,h=inbound?(k-0.5)*2:k*2;
 if(style==='blob'){out.visible=inbound?!first:first;}
 if(style==='fade')out.visible=inbound?k>0.36:k<0.64;
 if(style==='flip'){out.visible=inbound?!first:first;out.rotY=inbound?-(1-ease.out(h))*Math.PI/2:ease.in(h)*Math.PI/2;}
 return out;
}

/** Shader part of a styled morph. `box` is the source's world bounds (shared by both sides), `both` covers source and result. */
export function morphSurface(style:string,k:number,inbound:boolean,u:FxUniforms,box:THREE.Box3){
 const size=box.getSize(new THREE.Vector3()),span=Math.max(size.x,size.y,size.z,1e-3);
 switch(style){
  case 'blob':{const h=inbound?(k-0.5)*2:k*2;u.uMbK.value=inbound?1-ease.inOut(clamp(h)):ease.inOut(clamp(h));u.uMbC.value.copy(box.getCenter(new THREE.Vector3()));u.uMbR.value=(size.x+size.y+size.z)/6*0.95;u.uFxE.value+=0.45*Math.sin(Math.PI*k);
   // the melt scatters tiles: strongest when the shape is a ball
   const mid=Math.pow(Math.sin(Math.PI*k),1.5);u.uDsB.value=0.7*mid;u.uDsC.value=span/40;u.uDsT.value=Math.floor(k*1e3/50)+7;u.uDsV.value=Math.max(u.uDsV.value,span*0.05*mid);break;}
  case 'flip':{u.uFxE.value+=0.5*Math.pow(Math.sin(Math.PI*k),6);break;}
  case 'fade':{u.uFxDim.value*=inbound?smooth((k-0.35)/0.65):1-smooth(k/0.65);break;}
 }
}

/** Split long edges of low-poly meshes so vertex effects (blob morph, shock-wave bumps) can bend them smoothly. */
export function densify(meshes:THREE.Mesh[]){
 for(const m of meshes){
  if((m as THREE.SkinnedMesh).isSkinnedMesh||m.userData.densified)continue;
  const g=m.geometry,count=g.attributes.position?.count??0;if(count<3||count>6000)continue;
  g.computeBoundingSphere();const r=g.boundingSphere?.radius??1;
  try{
   const src=g.index?g.toNonIndexed():g.clone();for(const name of Object.keys(src.attributes))if(!['position','normal','uv'].includes(name))src.deleteAttribute(name);
   if(!src.attributes.normal)src.computeVertexNormals();
   const out=new TessellateModifier(r/9,7).modify(src);
   if(out.attributes.position!.count>90000){out.dispose();continue;}
   m.geometry=out;m.userData.densified=true;
  }catch{/* keep the original geometry */}
 }
}
