import * as THREE from 'three';
import {clamp,lerp,ease,smooth} from './kit.ts';
import type {FxKind,FxFrom} from './spec.ts';

/**
 * Object effects: one-shot actions that play on an object without changing what it is
 * (a heart pounds, a shock wave runs over the surface, a scan line passes...).
 * Transform effects return offsets; surface effects drive a small shader patch on every
 * standard material of the object (vertex displacement + emissive bands), so the dither
 * pass shows them as moving dot density.
 */

export const FX_KINDS=['heartbeat','shockwave','ripple','shake','squash','recoil','hop','glint','scan','charge','flicker','glitch'] as const;
/** Default length of one run of each effect (seconds). */
export const FX_DUR:Record<FxKind,number>={heartbeat:0.9,shockwave:1.0,ripple:1.5,shake:0.55,squash:0.65,recoil:0.6,hop:0.75,glint:0.8,scan:1.2,charge:1.3,flicker:1.0,glitch:0.6};

export interface FxTrack {kind:FxKind;t0:number;t1:number;from:FxFrom;amount:number;count:number}

/** Shared uniforms of one object; every patched material points at the same value objects. */
export function fxUniforms(){
 return {
  uFxO:{value:new THREE.Vector3()},uFxR:{value:0},uFxW:{value:1},uFxA:{value:0},uFxG:{value:0},uFxMode:{value:0},
  uFxGl:{value:0},uFxGlB:{value:0.1},uFxT:{value:0},
  uFxSD:{value:new THREE.Vector3(0,1,0)},uFxSP:{value:0},uFxSW:{value:0.1},uFxSG:{value:0},uFxST:{value:0},
  uFxE:{value:0},uFxDim:{value:1},
  uRvMode:{value:0},uRvO:{value:new THREE.Vector3()},uRvD:{value:new THREE.Vector3(0,1,0)},uRvP:{value:0},uRvW:{value:0.05},uRvG:{value:0},
 };
}
export type FxUniforms=ReturnType<typeof fxUniforms>;

const WAVE_PARS=`
uniform vec3 uFxO;uniform float uFxR;uniform float uFxW;uniform float uFxA;uniform float uFxG;uniform int uFxMode;
varying vec3 vFxWp;
float fxProfile(float x){
 if(uFxMode==1)return exp(-x*x*1.6)*(x<0.?mix(1.,.35,smoothstep(0.,-2.5,x)):1.);
 if(uFxMode==2)return sin(x*2.4)*smoothstep(1.2,.2,x)*exp(min(x,0.)*.32);
 return 0.;
}
`;
const VERT_PARS=WAVE_PARS+`
uniform float uFxGl;uniform float uFxGlB;uniform float uFxT;
float fxHash(float n){return fract(sin(n*127.1+311.7)*43758.5453);}
`;
const VERT_BODY=`
vec3 fxDelta=vec3(0.);
{
 vec4 fxW4=modelMatrix*vec4(position,1.);vec3 wp=fxW4.xyz;mat3 m3=mat3(modelMatrix);
 vec3 wn=normalize(m3*objectNormal+vec3(1e-6));vec3 d=vec3(0.);bool fxOn=false;
 if(uFxMode>0&&uFxA+uFxG>0.){
  vec3 r=wp-uFxO;float dist=length(r);float x=(dist-uFxR)/max(uFxW,1e-5);
  fxOn=true;d+=wn*uFxA*fxProfile(x);
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
uniform vec3 uFxSD;uniform float uFxSP;uniform float uFxSW;uniform float uFxSG;uniform float uFxST;uniform float uFxE;uniform float uFxDim;
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
float fxWaveGlow=0.,fxWaveDim=0.;
if(uFxMode>0&&uFxA+uFxG>0.){
 vec3 r=vFxWp-uFxO;float dist=length(r);float w=max(uFxW,1e-5);float x=(dist-uFxR)/w;
 float f=fxProfile(x);float df=(fxProfile(x+.03)-fxProfile(x-.03))/(.06*w);
 vec3 rh=dist>1e-5?mat3(viewMatrix)*(r/dist):vec3(0.);
 normal=normalize(normal-rh*clamp(uFxA*df*1.6,-.9,.9));
 fxWaveGlow=uFxG*abs(f);
 if(uFxMode==1)fxWaveDim=clamp(uFxG*.6*exp(-(x+1.7)*(x+1.7)*.7),0.,.85);
}
`;
const FRAG_GLOW=`
{float sx=(dot(vFxWp,uFxSD)-uFxSP)/max(uFxSW,1e-5);totalEmissiveRadiance+=diffuseColor.rgb*(fxWaveGlow+fxRevealGlow+uFxE+uFxSG*(exp(-sx*sx)+(sx<0.?uFxST*exp(sx/6.):0.)));}
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
   .replace('#include <opaque_fragment>','outgoingLight*=uFxDim*(1.-fxWaveDim);\n#include <opaque_fragment>');
 };
 const key=m.customProgramCacheKey.bind(m);
 m.customProgramCacheKey=()=>key()+'|acx-fx4';
 m.needsUpdate=true;
 return m;
}

/** Transform part of the active effects at time t. */
export interface FxPose {pos:THREE.Vector3;rot:THREE.Vector3;scale:THREE.Vector3}

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
   case 'heartbeat':{const p=pulse(u,0.02,.07,.11)+0.62*pulse(u,0.3,.06,.13);const s=1+0.16*a*p;out.scale.multiplyScalar(s);out.scale.y*=1+0.025*a*p;break;}
   case 'shockwave':{const k=pulse(u,0,.05,.18);out.pos.addScaledVector(d,-size*0.035*a*k);out.scale.multiplyScalar(1-0.03*a*k);break;}
   case 'ripple':{const k=Math.sin(u*Math.PI*6)*Math.exp(-u*4);out.scale.multiplyScalar(1+0.015*a*k);break;}
   case 'shake':{const e=(1-u)*(1-u)*a,x=u*40;out.pos.x+=n1(x)*size*0.045*e;out.pos.y+=n1(x+17)*size*0.02*e;out.rot.z+=n1(x+33)*0.07*e;break;}
   case 'squash':{const k=smooth(u/.06)*Math.cos(u*Math.PI*3.4)*Math.exp(-u*3.4)*a;out.scale.y*=1-0.24*k;out.scale.x*=1+0.13*k;out.scale.z*=1+0.13*k;break;}
   case 'recoil':{const side=d.lengthSq()>0?d:new THREE.Vector3(-1,0,0);const k=Math.sin(Math.min(1,u/.18)*Math.PI*.5)*Math.exp(-Math.max(0,u-.18)*5)*Math.cos(Math.max(0,u-.18)*14)*a;
    out.pos.addScaledVector(side,-size*0.07*k);out.rot.z+=side.x*0.16*k;out.rot.x-=side.z*0.16*k;break;}
   case 'hop':{const air=u<.12?0:u<.72?(u-.12)/.6:1;const y=4*air*(1-air);out.pos.y+=size*0.35*a*y;
    const land=u<.12?Math.sin(u/.12*Math.PI)*.5:u>.72?Math.sin(Math.min(1,(u-.72)/.28)*Math.PI)*Math.exp(-(u-.72)*3):0;const st=u>.12&&u<.72?Math.sin(air*Math.PI)*.08:0;
    out.scale.y*=1-0.2*a*land+st*a;out.scale.x*=1+0.1*a*land-st*a*.5;out.scale.z*=1+0.1*a*land-st*a*.5;break;}
   case 'glitch':{const st=Math.floor(t*15),h=Math.abs(Math.sin(st*78.233+f.t0*9.1)*43758.5453)%1;if(h>0.45&&u<0.92){out.pos.x+=(h-0.72)*size*0.18*a;out.scale.x*=1+(h-0.7)*0.12*a;}break;}
   case 'charge':{const build=smooth(u/.82);const rel=u>.82?pulse(u,.82,.03,.07):0;out.pos.x+=n1(u*60)*size*0.008*build*a;out.scale.multiplyScalar(1-0.04*build*a*(u<.82?1:0)+0.1*rel*a);break;}
  }
 }
 return out;
}

/** Surface part: writes the shader uniforms for time t. `box` is the object's current world bounds. */
export function fxSurface(list:FxTrack[],t:number,u:FxUniforms,box:THREE.Box3){
 u.uFxMode.value=0;u.uFxA.value=0;u.uFxG.value=0;u.uFxGl.value=0;u.uFxSG.value=0;u.uFxST.value=0;u.uFxE.value=0;u.uFxDim.value=1;u.uFxT.value=Math.floor(t*15);
 const size=box.getSize(new THREE.Vector3()),c=box.getCenter(new THREE.Vector3()),span=Math.max(size.x,size.y,size.z,1e-3);
 for(const f of list){
  if(t<f.t0||t>=f.t1)continue;
  const {u:k}=runOf(f,t),a=f.amount;
  switch(f.kind){
   case 'heartbeat':{const p=pulse(k,0.02,.07,.11)+0.62*pulse(k,0.3,.06,.13);u.uFxE.value+=0.32*a*p;break;}
   case 'shockwave':case 'ripple':{
    const from=f.from,o=Array.isArray(from)?c.clone().add(new THREE.Vector3(...from).multiply(size).multiplyScalar(0.5)):originOn(box,from);
    let far=0;for(let i=0;i<8;i++)far=Math.max(far,o.distanceTo(new THREE.Vector3(i&1?box.max.x:box.min.x,i&2?box.max.y:box.min.y,i&4?box.max.z:box.min.z)));
    const wave=f.kind==='shockwave';const travel=wave?1-Math.pow(1-k,1.7):k;
    u.uFxMode.value=wave?1:2;u.uFxO.value.copy(o);u.uFxW.value=span*(wave?0.09:0.07);u.uFxR.value=lerp(-u.uFxW.value,far*1.08+u.uFxW.value*2,travel);
    const fade=wave?Math.pow(1-k,1.4):Math.pow(1-k,1.1);
    u.uFxA.value=span*(wave?0.045:0.022)*a*fade;u.uFxG.value=(wave?1.4:0.55)*a*fade;
    if(wave)u.uFxE.value+=0.5*a*pulse(k,0,.03,.08);
    break;}
   case 'glint':{const dir=new THREE.Vector3(1,0.7,0.25).normalize();const [lo,hi]=extent(box,dir);u.uFxSD.value.copy(dir);u.uFxSW.value=span*0.07;u.uFxSP.value=lerp(lo-span*0.15,hi+span*0.15,ease.inOut(k));u.uFxSG.value=1.4*a;break;}
   case 'scan':{u.uFxSD.value.set(0,1,0);u.uFxSW.value=span*0.022;u.uFxST.value=0.22;u.uFxSP.value=lerp(box.min.y-span*0.04,box.max.y+span*0.04,ease.inOutSine(k));u.uFxSG.value=2.6*a*smooth(k/.08)*smooth((1-k)/.08);u.uFxE.value+=0.08*a;break;}
   case 'charge':{const build=Math.pow(smooth(k/.82),1.6);const fl=0.75+0.25*Math.sin(k*90)*Math.sin(k*37);u.uFxE.value+=k<.82?0.85*a*build*fl:1.1*a*pulse(k,.82,.02,.06);break;}
   case 'flicker':{const step=Math.floor(k*22);const h=(Math.sin(step*91.7+f.t0*13)*43758.5453)%1;const off=Math.abs(h)<0.3&&k<0.9;u.uFxDim.value*=off?0.28:1;u.uFxE.value+=off?0:0.2*a*Math.abs(Math.sin(step*3.1));break;}
   case 'glitch':{u.uFxGl.value=span*0.09*a*(1-k*0.6);u.uFxGlB.value=span*0.055;const st=Math.floor(t*15);if(Math.abs(Math.sin(st*12.7+f.t0*3.3)*43758.5453)%1<0.3&&k<0.92)u.uFxDim.value*=0.45;break;}
  }
 }
 return u.uFxMode.value>0||u.uFxGl.value>0||u.uFxSG.value>0||u.uFxE.value>0||u.uFxDim.value<1;
}

function originOn(box:THREE.Box3,from:string){
 const c=box.getCenter(new THREE.Vector3());
 switch(from){case 'top':c.y=box.max.y;break;case 'bottom':c.y=box.min.y;break;case 'left':c.x=box.min.x;break;case 'right':c.x=box.max.x;break;case 'back':c.z=box.min.z;break;case 'center':break;default:c.z=box.max.z;}
 return c;
}
function extent(box:THREE.Box3,dir:THREE.Vector3):[number,number]{let lo=Infinity,hi=-Infinity;for(let i=0;i<8;i++){const v=new THREE.Vector3(i&1?box.max.x:box.min.x,i&2?box.max.y:box.min.y,i&4?box.max.z:box.min.z).dot(dir);lo=Math.min(lo,v);hi=Math.max(hi,v);}return [lo,hi];}

/** Entrances / exits that come out of or go into darkness (object-level transitions). */
export const REVEAL_KINDS=['from-black','light-up','ping','scan-in','to-black','scan-out','ping-out'] as const;
export const REVEAL_DUR:Record<string,number>={'from-black':0.9,'light-up':0.9,ping:0.9,'scan-in':1.0,'to-black':0.8,'scan-out':0.9,'ping-out':0.8};

/** Apply one reveal (k 0..1 of the entrance, or of the exit) on top of fxSurface. Returns false for other kinds. */
export function fxReveal(kind:string,k:number,u:FxUniforms,box:THREE.Box3):boolean{
 const size=box.getSize(new THREE.Vector3()),c=box.getCenter(new THREE.Vector3()),span=Math.max(size.x,size.y,size.z,1e-3);
 const far=(o:THREE.Vector3)=>{let f=0;for(let i=0;i<8;i++)f=Math.max(f,o.distanceTo(new THREE.Vector3(i&1?box.max.x:box.min.x,i&2?box.max.y:box.min.y,i&4?box.max.z:box.min.z)));return f;};
 switch(kind){
  // dots thin out in Bayer order: the object emerges from / sinks into darkness
  case 'from-black':u.uFxDim.value*=Math.pow(smooth(k),1.3);return true;
  case 'to-black':u.uFxDim.value*=Math.pow(1-smooth(k),1.3);return true;
  // a light sweeps over it from the left: darkness on one side, a bright edge, lit on the other
  case 'light-up':{const dir=new THREE.Vector3(1,0.15,0.3).normalize();const [lo,hi]=extentOf(box,dir);u.uRvMode.value=2;u.uRvD.value.copy(dir);u.uRvW.value=span*0.08;u.uRvP.value=lerp(lo-span*0.02,hi+span*0.3,ease.inOut(k));u.uRvG.value=1.0*(1-smooth((k-.75)/.25));return true;}
  case 'ping':case 'ping-out':{const o=c.clone();o.z=box.max.z;const R=far(o)*1.04;const kk=kind==='ping'?ease.out(k):1-ease.inOut(k);u.uRvMode.value=1;u.uRvO.value.copy(o);u.uRvW.value=span*0.07;u.uRvP.value=lerp(0,R+span*0.1,kk);u.uRvG.value=2.0*(kind==='ping'?1-smooth((k-.7)/.3):1-smooth(1-k-.0));return true;}
  case 'scan-in':{u.uRvMode.value=2;u.uRvD.value.set(0,1,0);u.uRvW.value=span*0.035;u.uRvP.value=lerp(box.min.y-span*0.01,box.max.y+span*0.08,ease.inOutSine(k));u.uRvG.value=2.4*(1-smooth((k-.85)/.15));return true;}
  case 'scan-out':{u.uRvMode.value=2;u.uRvD.value.set(0,-1,0);u.uRvW.value=span*0.035;u.uRvP.value=-lerp(box.min.y-span*0.08,box.max.y+span*0.01,ease.inOutSine(k));u.uRvG.value=2.4*smooth(k/.1);return true;}
 }
 return false;
}
export function resetReveal(u:FxUniforms){u.uRvMode.value=0;u.uRvG.value=0;}
function extentOf(box:THREE.Box3,dir:THREE.Vector3){return extent(box,dir);}
